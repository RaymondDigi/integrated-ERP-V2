import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { useAccess } from '../../../platform/access';
import { audit } from '../../../platform/audit';
import { notify } from '../../../platform/outbox';
import { addDays, daysBetween, localStamp, round2, TODAY } from '../../finance/engine';
import { useOperations } from '../store';
import type { OpsRole } from '../types';
import { useWarehouseExt, READ_ONLY, type Result } from '../warehousing/store';
import type { Signature } from '../warehousing/types';
import { buildShippingExtSeed, milestonesFor } from './data';
import { bondUse, CHARGE_ACCOUNT, CHARGE_LABEL, scheduleRisk, siCreditStatus, siKg, siStockCheck, siValue, suggestStuffingBase } from './engine';
import type { Amendment, Bond, ChargeType, CustomsLicence, Idf, Milestone, ShippingExtState, ShippingInstruction, SiHeader, SiLine, TemplateSettings, TruckBooking, Voyage } from './types';

const Ctx = createContext<ReturnType<typeof useShippingExtStore> | null>(null);

/** Who is told what when an SI is confirmed, and which documents they need to prepare for the shipment. */
export const DISTRIBUTION = [
  { to: 'Warehouse (godown stores)', docs: 'SI confirmation, pick list, stock reservation' },
  { to: 'Printing section', docs: 'Bag markings and print job' },
  { to: 'Trading', docs: 'SI confirmation, proforma invoice' },
  { to: 'Transport', docs: 'Haulage to the stuffing base, truck bookings' },
  { to: 'Procurement', docs: 'Packaging materials: sacks, labels, dunnage' },
  { to: 'Stuffing base stores', docs: 'Loading plan, VGM, stuffing schedule' },
  { to: 'Finance', docs: 'Proforma, commercial invoice, credit status' }
];

const BORDER_LANE: Record<TruckBooking['border'], string> = { Malaba: 'Mombasa → Malaba', Busia: 'Mombasa → Busia', Namanga: 'Mombasa → Nairobi', Taveta: 'Mombasa → Nairobi', Isebania: 'Mombasa → Nairobi' };

const useShippingExtStore = () => {
  const { addToast } = useApp();
  const access = useAccess();
  const ops = useOperations();
  const wh = useWarehouseExt();
  const { finance, commercial } = ops;
  const [state, setState] = useState<ShippingExtState>(() => buildShippingExtSeed(wh.state.lots, ops.state.shipments));
  const ref = useRef(state);
  ref.current = state;
  const actor = ops.actor;

  const commit = (next: ShippingExtState) => {
    ref.current = next;
    setState(next);
  };
  const fail = (error: string): Result => {
    addToast({ type: 'error', title: 'Not allowed', message: error });
    return { ok: false, error };
  };
  const done = (title: string, message: string, id?: string): Result => {
    addToast({ type: 'success', title, message });
    return { ok: true, id };
  };
  const now = () => localStamp();
  const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const next = (s: ShippingExtState, prefix: string) => {
    const n = (s.sequence[prefix] ?? 0) + 1;
    return { number: `${prefix}-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`, sequence: { ...s.sequence, [prefix]: n } };
  };
  const log = (action: string, note?: string) => ({ at: now(), by: actor.name, action, note });
  const is = (...roles: OpsRole[]) => roles.includes(actor.role);
  const guard = (roles: OpsRole[], why: string) => (!access.canWrite ? READ_ONLY : !is(...roles) ? why : null);
  const party = (id: string) => finance.snapshot().parties.find((p) => p.id === id);
  /** Portal users may only touch their own company's records. */
  const ownOnly = (customerId: string) => (is('CUSTOMER') && actor.customerId !== customerId ? 'The customer portal only shows your own company’s instructions' : null);
  const patchSi = (s: ShippingExtState, id: string, patch: Partial<ShippingInstruction>, action: string, note?: string): ShippingExtState => ({
    ...s,
    instructions: s.instructions.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log(action, note)] } : x))
  });
  const siOf = (id: string) => ref.current.instructions.find((x) => x.id === id)!;

  // Keep SI progress in step with its shipment: stuffed when the container is loaded, shipped when it sails
  useEffect(() => {
    const s = ref.current;
    let changed = false;
    const instructions = s.instructions.map((si) => {
      const sh = si.shipmentId ? ops.state.shipments.find((x) => x.id === si.shipmentId) : undefined;
      if (!sh || si.status === 'SHIPPED' || si.status === 'CANCELLED') return si;
      const out = { ...si };
      if (sh.loadingPlan && !si.stuffedAt) {
        out.stuffedAt = localStamp();
        out.history = [...out.history, { at: localStamp(), by: 'System', action: `Stuffed — ${sh.container ?? ''}` }];
        changed = true;
      }
      if (['DEPARTED', 'ARRIVED', 'DELIVERED'].includes(sh.stage)) {
        out.status = 'SHIPPED';
        out.shippedAt = localStamp();
        out.history = [...out.history, { at: localStamp(), by: 'System', action: `Shipped on ${sh.vessel}` }];
        changed = true;
      }
      return out;
    });
    if (changed) commit({ ...s, instructions });
  }, [ops.state.shipments]);

  /* ================= Shipping instructions ================= */
  const lineFor = (lotId: string, bags: number, pricePerKg: number): SiLine | null => {
    const lot = wh.state.lots.find((l) => l.id === lotId);
    if (!lot) return null;
    return { lotId, lotNo: lot.lotNo, garden: lot.garden, grade: lot.grade, invoiceNo: lot.invoiceNo, bags, netKg: round2(bags * lot.kgPerBag), warehouseId: lot.warehouseId, pricePerKg };
  };
  const saveSi = (d: Omit<Partial<ShippingInstruction>, 'lines'> & SiHeader & { customerId: string; contractRef: string; lines: { lotId: string; bags: number; pricePerKg: number }[] }): Result => {
    const s = ref.current;
    const g = guard(['CUSTOMER', 'OFFICER', 'MANAGER'], 'Shipping instructions are prepared by the customer (portal) or the Operations Officer');
    if (g) return fail(g);
    const own = ownOnly(d.customerId);
    if (own) return fail(own);
    if (!d.customerId) return fail('Choose the customer');
    if (!d.contractRef.trim()) return fail('Enter the sales contract reference');
    if (!d.destination.trim() || !d.consignee.trim()) return fail('Enter the destination and consignee');
    if (!d.readyBy) return fail('When must the tea be ready for stuffing?');
    const rawLines = d.lines.filter((l) => l.lotId);
    if (!rawLines.length) return fail('Add the teas to be shipped');
    const lines: SiLine[] = [];
    for (const l of rawLines) {
      const lot = wh.state.lots.find((x) => x.id === l.lotId);
      if (!lot) return fail('Unknown lot');
      if (!(l.bags > 0) || !Number.isInteger(l.bags)) return fail(`${lot.lotNo}: enter whole bags`);
      if (l.bags > lot.bags) return fail(`${lot.lotNo} has only ${lot.bags} bags`);
      if (!(l.pricePerKg > 0)) return fail(`${lot.lotNo}: enter the contract price per kg`);
      if (lot.ownership === 'CUSTOMER' && lot.owner !== d.customerId) return fail(`${lot.lotNo} is held for another customer`);
      if (rawLines.filter((x) => x.lotId === l.lotId).length > 1) return fail(`${lot.lotNo} is listed twice`);
      lines.push(lineFor(l.lotId, l.bags, l.pricePerKg)!);
    }
    const header: SiHeader = { destination: d.destination.trim(), incoterm: d.incoterm, voyageId: d.voyageId || undefined, consignee: d.consignee.trim(), notifyParty: d.notifyParty.trim() || 'Same as consignee', markings: d.markings.trim(), readyBy: d.readyBy };
    if (d.id) {
      const old = siOf(d.id);
      if (old.status !== 'DRAFT') return fail('Only drafts can be edited — request an amendment instead');
      commit(patchSi(s, d.id, { ...header, contractRef: d.contractRef.trim(), buyerRef: d.buyerRef, lines }, 'Edited'));
      return done('Draft saved', old.number, d.id);
    }
    const { number, sequence } = next(s, 'SI');
    const id = uid('si');
    const rec: ShippingInstruction = { ...header, id, number, customerId: d.customerId, contractRef: d.contractRef.trim(), buyerRef: d.buyerRef, lines, status: 'DRAFT', channel: is('CUSTOMER') ? 'PORTAL' : 'OFFICE', version: 1, amendments: [], createdBy: actor.name, history: [log(is('CUSTOMER') ? 'Created on the customer portal' : 'Created')] };
    commit({ ...s, sequence, instructions: [rec, ...s.instructions] });
    return done('Shipping instruction saved', `${number} — submit it when ready`, id);
  };
  /** Submit: the credit check runs and Finance, Trading and Shipping are told the credit status. */
  const submitSi = (id: string): Result => {
    const s = ref.current;
    const si = siOf(id);
    const g = guard(['CUSTOMER', 'OFFICER', 'MANAGER'], 'Shipping instructions are submitted by the customer or the Operations Officer');
    if (g) return fail(g);
    const own = ownOnly(si.customerId);
    if (own) return fail(own);
    if (si.status !== 'DRAFT') return fail('Only drafts can be submitted');
    const c = siCreditStatus(si, party(si.customerId), commercial.owedBy(si.customerId), s.instructions);
    const hold = c.status === 'HOLD';
    commit(patchSi(s, id, { status: hold ? 'CREDIT_HOLD' : 'SUBMITTED', submittedAt: now(), credit: { status: c.status, exposure: c.exposure, limit: c.limit, value: c.value, checkedAt: now(), note: hold ? `Owed ${c.owed.toLocaleString()} + open SIs ${c.openValue.toLocaleString()} + this ${c.value.toLocaleString()}` : undefined } }, hold ? 'Submitted — on credit hold' : 'Submitted', `Credit exposure KES ${c.exposure.toLocaleString()} of ${c.limit.toLocaleString()} limit`));
    for (const to of ['Finance — credit control', 'Trading', 'Shipping']) notify({ module: 'Shipping', to, subject: `${si.number}: credit ${hold ? 'HOLD' : 'OK'} — ${party(si.customerId)?.name}`, body: `Exposure KES ${c.exposure.toLocaleString()} against a limit of ${c.limit.toLocaleString()}.${hold ? ' Finance must release before Operations can confirm.' : ''}`, ref: si.number, level: hold ? 'warning' : 'info' });
    return hold ? done('Submitted — credit hold', `${si.number} exceeds the credit limit; Finance has been notified`) : done('Submitted', `${si.number} goes to Operations to confirm stock`);
  };
  const releaseCredit = (id: string, note: string): Result => {
    const s = ref.current;
    const si = siOf(id);
    const g = guard(['CREDIT'], 'Credit holds are released by Finance — switch to Grace Njeri (Credit Controller)');
    if (g) return fail(g);
    if (si.status !== 'CREDIT_HOLD') return fail('This instruction is not on credit hold');
    if (!note.trim()) return fail('Record why the credit is released (e.g. payment received, LC confirmed)');
    commit(patchSi(s, id, { status: 'SUBMITTED', credit: { ...si.credit!, status: 'RELEASED', releasedBy: actor.name, note } }, 'Credit hold released', note));
    notify({ module: 'Shipping', to: 'Shipping & Trading', subject: `${si.number}: credit released`, body: note, ref: si.number });
    audit({ module: 'Shipping', by: actor.name, action: 'Credit hold released', ref: si.number, note });
    return done('Credit released', `${si.number} can now be confirmed`);
  };
  /** Confirm: stock is checked against the SI and reserved, the stuffing base is chosen and every department is told. */
  const confirmSi = (id: string): Result => {
    const s = ref.current;
    const si = siOf(id);
    const g = guard(['OFFICER', 'MANAGER'], 'Operations confirms shipping instructions');
    if (g) return fail(g);
    if (si.status === 'CREDIT_HOLD') return fail('On credit hold — Finance must release it first');
    if (si.status !== 'SUBMITTED') return fail('Only submitted instructions can be confirmed');
    if (si.blocked) return fail(`Blocked: ${si.blocked.reason}`);
    const check = siStockCheck(si, wh.state.lots);
    const short = check.filter((c) => !c.ok).map((c) => c.reason);
    if (short.length) {
      commit(patchSi(s, id, { stockCheck: { by: actor.name, at: now(), shortfalls: short } }, 'Stock check failed', short.join('; ')));
      return fail(`Stock not confirmed: ${short.join('; ')}`);
    }
    const r = wh.reserveLots(si.number, si.lines.map((l) => ({ lotId: l.lotId, kg: l.netKg })));
    if (!r.ok) return r;
    const base = suggestStuffingBase(si);
    commit(patchSi(ref.current, id, { status: 'CONFIRMED', confirmedAt: now(), stockCheck: { by: actor.name, at: now(), shortfalls: [] }, stuffingBase: base.base }, 'Confirmed — stock reserved', `Stuffing base: ${wh.whName(base.base ?? '')}${base.toTransfer.length ? ` · ${base.toTransfer.length} lot(s) to transfer there` : ''}`));
    wh.createPrintJob({ ref: si.number, customerId: si.customerId, material: 'SACKS', markings: si.markings || `${party(si.customerId)?.name} / ${si.destination}`, qty: siKg(si) > 0 ? Math.ceil(si.lines.reduce((x, l) => x + l.bags, 0) * 1.02) : 0 });
    for (const dpt of DISTRIBUTION) notify({ module: 'Shipping', to: dpt.to, subject: `Prepare for ${si.number} — ${party(si.customerId)?.name} to ${si.destination}`, body: `Ready by ${si.readyBy}. Documents: ${dpt.docs}.`, ref: si.number });
    return done('Instruction confirmed', `${si.number}: ${siKg(si).toLocaleString()} kg reserved · ${DISTRIBUTION.length} departments notified`);
  };
  /** Book the shipment for a confirmed SI on its vessel. */
  const convertToShipment = (id: string): Result => {
    const si = siOf(id);
    const g = guard(['OFFICER', 'MANAGER'], 'Shipments are booked by the Operations Officer or Manager');
    if (g) return fail(g);
    if (si.status !== 'CONFIRMED') return fail('Confirm the instruction first');
    if (si.blocked) return fail(`Blocked: ${si.blocked.reason}`);
    const v = ref.current.voyages.find((x) => x.id === si.voyageId);
    if (!v) return fail('Choose the vessel / voyage on the instruction');
    if (v.cutOff < TODAY) return fail(`The ${v.vessel} cut-off (${v.cutOff}) has passed — amend the instruction to another voyage`);
    const r = ops.createShipment({
      customerId: si.customerId,
      destination: si.destination,
      incoterm: si.incoterm,
      lines: si.lines.map((l) => ({ sku: 'TEA', description: `${l.garden} ${l.grade} · ${l.invoiceNo} · ${l.bags} bags`, qty: l.netKg, price: l.pricePerKg })),
      vessel: v.vessel,
      line: v.line,
      bookingRef: `${v.line.toUpperCase().slice(0, 4)} ${v.voyage}-${si.number.slice(-4)}`,
      etd: v.etd,
      eta: v.eta,
      siId: si.id,
      siNumber: si.number,
      stuffingBase: si.stuffingBase
    });
    if (!r.ok || !r.id) return r;
    const s = ref.current;
    commit({ ...patchSi(s, id, { status: 'IN_PROGRESS', shipmentId: r.id }, 'Shipment booked', v.vessel), milestones: { ...s.milestones, [r.id]: milestonesFor({ stage: 'BOOKED', etd: v.etd, eta: v.eta }) } });
    return { ok: true, id: r.id };
  };
  const cancelSi = (id: string, reason: string): Result => {
    const si = siOf(id);
    const g = guard(['CUSTOMER', 'OFFICER', 'MANAGER'], 'Instructions are cancelled by the customer or Operations');
    if (g) return fail(g);
    const own = ownOnly(si.customerId);
    if (own) return fail(own);
    if (is('CUSTOMER') && !['DRAFT', 'SUBMITTED', 'CREDIT_HOLD'].includes(si.status)) return fail('Once confirmed, ask Operations to cancel');
    if (!['DRAFT', 'SUBMITTED', 'CREDIT_HOLD', 'CONFIRMED'].includes(si.status)) return fail('A shipment is already booked — amend or cancel the shipment instead');
    if (!reason.trim()) return fail('Give the reason');
    if (si.status === 'CONFIRMED') {
      const r = wh.releaseLots(si.number);
      if (!r.ok) return r;
    }
    commit(patchSi(ref.current, id, { status: 'CANCELLED' }, 'Cancelled', reason));
    return done('Instruction cancelled', si.number);
  };
  /** Amendment of an instruction in progress; applied only when a manager (not the requester) approves it. */
  const requestAmendment = (id: string, patch: Amendment['patch'], reason: string): Result => {
    const s = ref.current;
    const si = siOf(id);
    const g = guard(['CUSTOMER', 'OFFICER', 'MANAGER'], 'Amendments are requested by the customer or Operations');
    if (g) return fail(g);
    const own = ownOnly(si.customerId);
    if (own) return fail(own);
    if (!['CONFIRMED', 'IN_PROGRESS'].includes(si.status)) return fail('Only confirmed or in-progress instructions are amended — edit drafts directly');
    const sh = si.shipmentId ? ops.state.shipments.find((x) => x.id === si.shipmentId) : undefined;
    if (sh && !['BOOKED', 'DOCUMENTS'].includes(sh.stage)) return fail('The container is already loaded — no more amendments');
    if (si.amendments.some((a) => a.status === 'PENDING')) return fail('An amendment is already waiting for approval');
    if (!reason.trim()) return fail('Give the reason for the amendment');
    const changed = Object.entries(patch).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((si as unknown as Record<string, unknown>)[k]));
    if (!changed.length) return fail('Nothing has changed');
    if (patch.lines && sh) return fail('Teas cannot change once the shipment is booked — change header details only');
    const a: Amendment = { id: uid('am'), version: si.version + 1, requestedBy: actor.name, at: now(), reason, patch: Object.fromEntries(changed), status: 'PENDING' };
    commit(patchSi(s, id, { amendments: [...si.amendments, a] }, `Amendment v${a.version} requested`, reason));
    notify({ module: 'Shipping', to: 'Operations Manager', subject: `Approve amendment to ${si.number}`, body: `${changed.map(([k]) => k).join(', ')} — ${reason}`, ref: si.number });
    return done('Amendment requested', 'The Operations Manager approves it');
  };
  const decideAmendment = (id: string, amendmentId: string, approve: boolean, note: string): Result => {
    const s = ref.current;
    const si = siOf(id);
    const g = guard(['MANAGER'], 'Amendments are approved by the Operations Manager');
    if (g) return fail(g);
    const a = si.amendments.find((x) => x.id === amendmentId)!;
    if (a.status !== 'PENDING') return fail('Already decided');
    if (a.requestedBy === actor.name) return fail('You requested this amendment, so someone else must approve it');
    if (!approve && !note.trim()) return fail('Say why it is rejected');
    const decided: Amendment = { ...a, status: approve ? 'APPROVED' : 'REJECTED', decidedBy: actor.name, decidedAt: now(), note: note || undefined };
    if (!approve) {
      commit(patchSi(s, id, { amendments: si.amendments.map((x) => (x.id === amendmentId ? decided : x)) }, `Amendment v${a.version} rejected`, note));
      return done('Amendment rejected', si.number);
    }
    if (a.patch.lines) {
      const trial = { ...si, lines: a.patch.lines };
      const short = siStockCheck(trial, wh.state.lots).filter((c) => !c.ok);
      if (short.length) return fail(`Stock not available for the amended teas: ${short.map((c) => c.reason).join('; ')}`);
      const r1 = wh.releaseLots(si.number);
      if (!r1.ok) return r1;
      const r2 = wh.reserveLots(si.number, a.patch.lines.map((l) => ({ lotId: l.lotId, kg: l.netKg })));
      if (!r2.ok) {
        wh.reserveLots(si.number, si.lines.map((l) => ({ lotId: l.lotId, kg: l.netKg })));
        return r2;
      }
    }
    commit(patchSi(ref.current, id, { ...a.patch, version: a.version, amendments: si.amendments.map((x) => (x.id === amendmentId ? decided : x)), stuffingBase: a.patch.lines ? suggestStuffingBase({ lines: a.patch.lines }).base : si.stuffingBase }, `Amendment v${a.version} approved`, note || a.reason));
    for (const [k, v] of Object.entries(a.patch)) if (k !== 'lines') audit({ module: 'Shipping', by: actor.name, action: 'SI amended', ref: si.number, field: k, before: String((si as unknown as Record<string, unknown>)[k] ?? ''), after: String(v ?? '') });
    notify({ module: 'Shipping', to: 'Warehouse, Trading & Shipping', subject: `${si.number} amended (v${a.version})`, body: a.reason, ref: si.number });
    return done('Amendment approved', `${si.number} is now version ${a.version}`);
  };
  /** Order block: holds the SI (and its shipment) until released. */
  const blockSi = (id: string, reason: string | null): Result => {
    const s = ref.current;
    const si = siOf(id);
    const g = guard(['MANAGER', 'CREDIT'], 'Only the Operations Manager or the Credit Controller can block instructions');
    if (g) return fail(g);
    if (reason !== null && !reason.trim()) return fail('Say why it is blocked');
    if (reason === null && !si.blocked) return fail('Not blocked');
    if (['SHIPPED', 'CANCELLED'].includes(si.status)) return fail('This instruction is closed');
    // The linked shipment is held or released with its instruction
    const sh = si.shipmentId ? ops.state.shipments.find((x) => x.id === si.shipmentId) : undefined;
    if (sh && !['DEPARTED', 'ARRIVED', 'DELIVERED'].includes(sh.stage) && !!sh.blocked === (reason === null)) {
      const r = ops.blockShipment(sh.id, reason);
      if (!r.ok) return r;
    }
    commit(patchSi(s, id, { blocked: reason === null ? undefined : { reason: reason.trim(), by: actor.name, at: now() } }, reason === null ? 'Block released' : 'Blocked', reason ?? undefined));
    return done(reason === null ? 'Block released' : 'Instruction blocked', si.number);
  };

  /* ================= External milestones and IDF ================= */
  const updateMilestone = (shipmentId: string, key: string, status: Milestone['status'], refNo: string, note: string, source: Milestone['source'] = 'MANUAL'): Result => {
    const s = ref.current;
    const sh = ops.state.shipments.find((x) => x.id === shipmentId)!;
    const list = s.milestones[shipmentId] ?? milestonesFor(sh);
    const m = list.find((x) => x.key === key)!;
    if (!access.canWrite) return fail(READ_ONLY);
    if (key === 'marking' && (status === 'APPROVED' || status === 'REJECTED')) {
      if (!(is('CUSTOMER') && actor.customerId === sh.customerId) && !is('MANAGER')) return fail('Markings are approved by the client (portal) or the Operations Manager on their written instruction');
    } else if (!is('OFFICER', 'STOREKEEPER', 'MANAGER') && source === 'MANUAL') return fail('Milestones are updated by Operations');
    if (status === 'APPROVED' && !refNo.trim() && !m.ref) return fail('Enter the reference (certificate, report or B/L number)');
    if (status === 'REJECTED' && !note.trim()) return fail('Say why it was rejected');
    const updated = list.map((x) => (x.key === key ? { ...x, status, ref: refNo.trim() || x.ref, note: note || x.note, completedAt: status === 'APPROVED' ? TODAY : undefined, source } : x));
    commit({ ...s, milestones: { ...s.milestones, [shipmentId]: updated } });
    audit({ module: 'Shipping', by: source === 'CONNECTOR' ? `${actor.name} (connector)` : actor.name, action: `${m.name}: ${status.toLowerCase().replace('_', ' ')}`, ref: sh.number, field: key, before: m.status, after: status, note: refNo || note || undefined });
    if (status === 'REJECTED') notify({ module: 'Shipping', to: 'Shipping & Trading', subject: `${sh.number}: ${m.name} rejected`, body: note, ref: sh.number, level: 'warning' });
    return { ok: true };
  };
  /** Simulated pull from an external system (KEPHIS, KRA ICMS, KPA, shipping line): advances the matching milestone. */
  const pullExternal = (shipmentId: string, system: 'KEPHIS' | 'KRA' | 'KPA' | 'LINE'): { ok: boolean; message: string } => {
    const key = { KEPHIS: 'kephis', KRA: 'customs', KPA: 'kpa', LINE: 'bl' }[system];
    const sh = ops.state.shipments.find((x) => x.id === shipmentId);
    if (!sh) return { ok: false, message: 'Unknown shipment' };
    const m = (ref.current.milestones[shipmentId] ?? milestonesFor(sh)).find((x) => x.key === key)!;
    if (m.status === 'APPROVED') return { ok: true, message: `${sh.number}: ${m.name} already approved (${m.ref})` };
    const nextStatus: Milestone['status'] = m.status === 'NOT_STARTED' ? 'SUBMITTED' : 'APPROVED';
    const refNo = `${system}-${Date.now().toString().slice(-7)}`;
    const r = updateMilestone(shipmentId, key, nextStatus, nextStatus === 'APPROVED' ? refNo : '', 'Status pulled from the external system (simulated)', 'CONNECTOR');
    return { ok: r.ok, message: r.ok ? `${sh.number}: ${m.name} → ${nextStatus.toLowerCase()}${nextStatus === 'APPROVED' ? ` (${refNo})` : ''}` : (r as { error: string }).error };
  };
  const saveIdf = (i: Pick<Idf, 'number' | 'description' | 'supplier' | 'valueUsd' | 'applied'>): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'MANAGER'], 'IDFs are lodged by the Operations Officer');
    if (g) return fail(g);
    if (!/^E\d{4}KE\d{7}$/.test(i.number.trim().toUpperCase())) return fail('IDF numbers look like E2400KE1234567');
    if (s.idfs.some((x) => x.number === i.number.trim().toUpperCase())) return fail('That IDF is already tracked');
    if (!i.description.trim() || !i.supplier.trim() || !(i.valueUsd > 0)) return fail('Enter the goods, supplier and customs value');
    commit({ ...s, idfs: [{ ...i, id: uid('idf'), number: i.number.trim().toUpperCase(), status: 'APPLIED', history: [log('IDF lodged on KenTrade')] }, ...s.idfs] });
    notify({ module: 'Shipping', to: 'Trading & Finance', subject: `IDF ${i.number} lodged`, body: `${i.description} from ${i.supplier}, USD ${i.valueUsd.toLocaleString()}`, ref: i.number });
    return done('IDF tracked', i.number);
  };
  const idfStep = (id: string, step: 'APPROVE' | 'CANCEL', expiry = ''): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'MANAGER'], 'IDFs are updated by Operations');
    if (g) return fail(g);
    const i = s.idfs.find((x) => x.id === id)!;
    if (i.status !== 'APPLIED' && step === 'APPROVE') return fail('Only applied IDFs can be approved');
    if (step === 'APPROVE' && (!expiry || expiry <= TODAY)) return fail('Enter the IDF expiry date (in the future)');
    if (step === 'CANCEL' && i.status === 'CANCELLED') return fail('Already cancelled');
    commit({ ...s, idfs: s.idfs.map((x) => (x.id === id ? { ...x, status: step === 'APPROVE' ? 'APPROVED' : 'CANCELLED', approved: step === 'APPROVE' ? TODAY : x.approved, expiry: step === 'APPROVE' ? expiry : x.expiry, history: [...x.history, log(step === 'APPROVE' ? 'Approved by KRA' : 'Cancelled')] } : x)) });
    notify({ module: 'Shipping', to: 'Trading & Finance', subject: `IDF ${i.number} ${step === 'APPROVE' ? 'approved' : 'cancelled'}`, ref: i.number });
    return done('IDF updated', i.number);
  };

  /* ================= Bonds ================= */
  const bookBond = (b: Pick<Bond, 'type' | 'insurer' | 'amount' | 'issued' | 'expiry'>): Result => {
    const s = ref.current;
    const g = guard(['MANAGER'], 'Bonds are booked by the Operations Manager');
    if (g) return fail(g);
    if (!b.insurer.trim() || !(b.amount > 0)) return fail('Enter the insurer and bond amount');
    if (b.expiry <= b.issued || b.expiry <= TODAY) return fail('Expiry must be after the issue date and in the future');
    const { number, sequence } = next(s, 'BND');
    commit({ ...s, sequence, bonds: [{ ...b, id: uid('bd'), number, shipmentIds: [], status: 'ACTIVE', history: [log('Bond booked', `${b.insurer} · KES ${b.amount.toLocaleString()}`)] }, ...s.bonds] });
    return done('Bond booked', number, number);
  };
  const linkBond = (bondId: string, shipmentId: string): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'MANAGER'], 'Operations links shipments to bonds');
    if (g) return fail(g);
    const b = s.bonds.find((x) => x.id === bondId)!;
    const sh = ops.state.shipments.find((x) => x.id === shipmentId)!;
    if (b.status !== 'ACTIVE' || b.expiry < TODAY) return fail('The bond is not active');
    if (b.shipmentIds.includes(shipmentId)) return fail('Already secured by this bond');
    const u = bondUse(b, ops.state.shipments);
    const val = sh.lines.reduce((x, l) => x + l.qty * l.price, 0);
    if (val > u.free) return fail(`Bond has KES ${u.free.toLocaleString()} free — ${sh.number} needs ${val.toLocaleString()}`);
    commit({ ...s, bonds: s.bonds.map((x) => (x.id === bondId ? { ...x, shipmentIds: [...x.shipmentIds, shipmentId], history: [...x.history, log(`Secures ${sh.number}`)] } : x)) });
    return done('Shipment secured', `${sh.number} under ${b.number}`);
  };
  const releaseBond = (bondId: string): Result => {
    const s = ref.current;
    const g = guard(['MANAGER'], 'Bonds are released by the Operations Manager');
    if (g) return fail(g);
    const b = s.bonds.find((x) => x.id === bondId)!;
    if (b.status !== 'ACTIVE') return fail('Not active');
    const open = ops.state.shipments.filter((x) => b.shipmentIds.includes(x.id) && !['ARRIVED', 'DELIVERED'].includes(x.stage));
    if (open.length) return fail(`Still securing ${open.map((x) => x.number).join(', ')}`);
    commit({ ...s, bonds: s.bonds.map((x) => (x.id === bondId ? { ...x, status: 'RELEASED', history: [...x.history, log('Released')] } : x)) });
    return done('Bond released', b.number);
  };
  const sendBondReminders = (): Result => {
    if (!access.canWrite) return fail(READ_ONLY);
    const due = ref.current.bonds.map((b) => ({ b, u: bondUse(b, ops.state.shipments) })).filter((x) => x.u.alert);
    const lic = ref.current.licences.filter((l) => l.expiry && l.status !== 'APPLIED' && daysBetween(TODAY, l.expiry) <= 30);
    const idf = ref.current.idfs.filter((i) => i.status === 'APPROVED' && i.expiry && daysBetween(TODAY, i.expiry) <= 30);
    for (const { b, u } of due) notify({ module: 'Shipping', to: 'Operations Manager & Finance', subject: `Bond ${b.number} (${b.insurer}): ${u.alert}`, body: `KES ${b.amount.toLocaleString()} ${b.type.toLowerCase().replace('_', ' ')} bond`, ref: b.number, level: u.days < 0 ? 'critical' : 'warning', channels: ['IN_APP', 'EMAIL', 'SMS'] });
    for (const l of lic) notify({ module: 'Shipping', to: 'Operations Manager', subject: `${l.name} expires ${l.expiry}`, body: `${l.authority} · ${l.number}`, ref: l.number, level: 'warning' });
    for (const i of idf) notify({ module: 'Shipping', to: 'Trading & Finance', subject: `IDF ${i.number} expires ${i.expiry}`, body: i.description, ref: i.number, level: 'warning' });
    const n = due.length + lic.length + idf.length;
    return n ? done('Reminders sent', `${n} expiry notice(s) sent by email and SMS (simulated)`) : fail('Nothing is close to expiry');
  };

  /* ================= Vessel schedule ================= */
  const saveVoyage = (v: Omit<Voyage, 'id' | 'history' | 'originalEtd'> & { id?: string; reason?: string }): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'MANAGER'], 'The vessel schedule is kept by Operations');
    if (g) return fail(g);
    if (!v.vessel.trim() || !v.voyage.trim()) return fail('Enter the vessel and voyage');
    if (!(v.cutOff <= v.etd && v.etd <= v.eta)) return fail('Dates must run cut-off → ETD → ETA');
    if (v.id) {
      const old = s.voyages.find((x) => x.id === v.id)!;
      const moved = old.etd !== v.etd || old.cutOff !== v.cutOff;
      if (moved && !v.reason?.trim()) return fail('Say why the schedule changed');
      commit({ ...s, voyages: s.voyages.map((x) => (x.id === v.id ? { ...x, ...v, id: x.id, history: [...x.history, log(moved ? 'Schedule changed' : 'Edited', moved ? `ETD ${old.etd} → ${v.etd}, cut-off ${old.cutOff} → ${v.cutOff}${v.reason ? ` (${v.reason})` : ''}` : undefined)] } : x)) });
      if (moved) {
        const affected = s.instructions.filter((si) => si.voyageId === v.id && !['SHIPPED', 'CANCELLED'].includes(si.status));
        const updated = { ...ref.current.voyages.find((x) => x.id === v.id)! };
        const risky = affected.filter((si) => scheduleRisk(si, updated)?.level === 'LATE');
        for (const si of affected) notify({ module: 'Shipping', to: party(si.customerId)?.name ?? 'Customer', subject: `${v.vessel} ${v.voyage} schedule changed — ${si.number}`, body: `New cut-off ${v.cutOff}, ETD ${v.etd}. ${v.reason ?? ''}`, ref: si.number, level: risky.includes(si) ? 'warning' : 'info' });
        return done('Schedule updated', `${affected.length} instruction(s) notified${risky.length ? ` · ${risky.length} now at risk` : ''}`);
      }
      return done('Voyage saved', v.vessel);
    }
    commit({ ...s, voyages: [...s.voyages, { ...v, id: uid('vy'), originalEtd: v.etd, history: [log('Schedule loaded')] }] });
    return done('Voyage added', `${v.vessel} ${v.voyage}`);
  };

  /* ================= Charges and landed cost ================= */
  const addCharge = (c: { shipmentId: string; type: ChargeType; supplierId: string; amount: number; vat: boolean; reference: string }): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'MANAGER'], 'Charges are booked by the Operations Officer or Manager');
    if (g) return fail(g);
    if (!c.shipmentId || !c.supplierId) return fail('Choose the shipment and supplier');
    if (!(c.amount > 0)) return fail('Enter the amount');
    if (!c.reference.trim()) return fail("Enter the supplier's invoice or reference");
    if (s.charges.some((x) => x.supplierId === c.supplierId && x.reference.trim().toLowerCase() === c.reference.trim().toLowerCase())) return fail('That supplier reference is already booked');
    commit({ ...s, charges: [{ ...c, id: uid('cg'), by: actor.name, at: now() }, ...s.charges] });
    return done('Charge booked', `${CHARGE_LABEL[c.type]} · KES ${c.amount.toLocaleString()}`);
  };
  const billCharge = (id: string): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'MANAGER'], 'Charges are billed by the Operations Officer or Manager');
    if (g) return fail(g);
    const c = s.charges.find((x) => x.id === id)!;
    if (c.billId) return fail('Already sent to Finance');
    const sh = ops.state.shipments.find((x) => x.id === c.shipmentId);
    const sup = party(c.supplierId);
    const r = finance.saveDocument(
      { kind: 'BILL', partyId: c.supplierId, date: TODAY, dueDate: addDays(TODAY, sup?.terms ?? 30), reference: c.reference, department: 'Operations', notes: `Shipment ${sh?.number}`, lines: [{ id: uid('l'), description: `${CHARGE_LABEL[c.type]} — ${sh?.number}`, account: CHARGE_ACCOUNT[c.type], qty: 1, price: c.amount, vat: c.vat }] },
      actor.name
    );
    if (!r.ok || !r.id) return r;
    const bill = finance.snapshot().documents.find((x) => x.id === r.id)!;
    commit({ ...s, charges: s.charges.map((x) => (x.id === id ? { ...x, billId: bill.id, billNumber: bill.number } : x)) });
    return done('Bill raised in Finance', bill.number);
  };
  const removeCharge = (id: string): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'MANAGER'], 'Charges are maintained by Operations');
    if (g) return fail(g);
    if (s.charges.find((x) => x.id === id)?.billId) return fail('Billed charges are reversed in Finance');
    commit({ ...s, charges: s.charges.filter((x) => x.id !== id) });
    return { ok: true };
  };

  /* ================= Truck bookings for border clearance ================= */
  const requestTrucks = (t: Pick<TruckBooking, 'customerId' | 'border' | 'date' | 'trucks' | 'kg'> & { siNumber?: string }): Result => {
    const s = ref.current;
    const g = guard(['CUSTOMER', 'OFFICER', 'MANAGER'], 'Trucks are booked by the customer (portal) or Operations');
    if (g) return fail(g);
    const own = ownOnly(t.customerId);
    if (own) return fail(own);
    if (!t.customerId) return fail('Choose the customer');
    if (!(t.trucks >= 1) || !(t.kg > 0)) return fail('Enter the trucks and weight');
    if (t.kg / t.trucks > 28_000) return fail('More than 28 t a truck — book more trucks');
    if (t.date < TODAY) return fail('The date is in the past');
    const { number, sequence } = next(s, 'TBK');
    commit({ ...s, sequence, trucks: [{ ...t, id: uid('tb'), number, status: 'REQUESTED', requestedBy: actor.name, history: [log('Trucks requested for border clearance', `${t.trucks} × to ${t.border}`)] }, ...s.trucks] });
    notify({ module: 'Transport', to: 'Transport', subject: `Truck booking ${number}: ${t.trucks} to ${t.border}`, body: `${t.kg.toLocaleString()} kg on ${t.date}`, ref: number });
    return done('Trucks requested', number, number);
  };
  const truckStep = (id: string, step: 'ASSIGN' | 'DONE' | 'CANCEL'): Result => {
    const s = ref.current;
    const t = s.trucks.find((x) => x.id === id)!;
    const g = step === 'CANCEL' && is('CUSTOMER') ? (ownOnly(t.customerId) ?? (!access.canWrite ? READ_ONLY : null)) : guard(['OFFICER', 'MANAGER'], 'Transport assigns and closes truck bookings');
    if (g) return fail(g);
    const need = { ASSIGN: ['REQUESTED'], DONE: ['ASSIGNED'], CANCEL: ['REQUESTED', 'ASSIGNED'] }[step];
    if (!need.includes(t.status)) return fail(`Not possible while ${t.status.toLowerCase()}`);
    let patch: Partial<TruckBooking> = { status: step === 'ASSIGN' ? 'ASSIGNED' : step === 'DONE' ? 'DONE' : 'CANCELLED' };
    if (step === 'ASSIGN') {
      const r = wh.createLoad({ lane: BORDER_LANE[t.border], date: t.date, refs: [t.number, ...(t.siNumber ? [t.siNumber] : [])], kg: t.kg });
      if (!r.ok) return r;
      patch = { ...patch, loadId: r.id };
    }
    commit({ ...s, trucks: s.trucks.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log({ ASSIGN: 'Load planned — tender to a carrier in Transport', DONE: 'Cleared at the border', CANCEL: 'Cancelled' }[step])] } : x)) });
    if (step === 'ASSIGN') notify({ module: 'Transport', to: party(t.customerId)?.name ?? 'Customer', subject: `${t.number}: trucks being arranged`, ref: t.number });
    return done('Truck booking updated', `${t.number}: ${String(patch.status).toLowerCase()}`);
  };

  /* ================= Customs licences ================= */
  const applyLicence = (l: Pick<CustomsLicence, 'name' | 'authority' | 'fee'>): Result => {
    const s = ref.current;
    const g = guard(['OFFICER', 'MANAGER'], 'Licence applications are made by Operations');
    if (g) return fail(g);
    if (!l.name.trim() || !l.authority.trim()) return fail('Enter the licence and issuing authority');
    if (s.licences.some((x) => x.name.toLowerCase() === l.name.trim().toLowerCase() && x.status !== 'EXPIRED')) return fail('That licence is already held or applied for');
    commit({ ...s, licences: [{ ...l, id: uid('lc'), number: '—', status: 'APPLIED', applied: TODAY, history: [log('Application lodged')] }, ...s.licences] });
    return done('Application lodged', l.name);
  };
  const licenceStep = (id: string, step: 'ISSUE' | 'RENEW', number = '', expiry = ''): Result => {
    const s = ref.current;
    const g = guard(['MANAGER'], 'Licences are recorded by the Operations Manager');
    if (g) return fail(g);
    const l = s.licences.find((x) => x.id === id)!;
    if (step === 'ISSUE') {
      if (!['APPLIED', 'RENEWAL_STARTED'].includes(l.status)) return fail('Nothing pending for this licence');
      if (!number.trim() || !expiry || expiry <= TODAY) return fail('Enter the licence number and a future expiry date');
    }
    if (step === 'RENEW' && l.status !== 'ISSUED' && l.status !== 'EXPIRED') return fail('Renewal is started on issued licences');
    const patch: Partial<CustomsLicence> = step === 'ISSUE' ? { status: 'ISSUED', number: number.trim(), issued: TODAY, expiry } : { status: 'RENEWAL_STARTED' };
    commit({ ...s, licences: s.licences.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log(step === 'ISSUE' ? 'Issued' : 'Renewal started', step === 'ISSUE' ? `${number} to ${expiry}` : undefined)] } : x)) });
    return done(step === 'ISSUE' ? 'Licence issued' : 'Renewal started', l.name);
  };

  /* ================= Document templates ================= */
  const saveTemplates = (t: TemplateSettings): Result => {
    const s = ref.current;
    const g = guard(['MANAGER', 'OFFICER'], 'Templates are maintained by Operations');
    if (g) return fail(g);
    commit({ ...s, templates: t });
    auditFields(s.templates, t);
    return done('Templates saved', 'New documents use the updated header and footer');
  };
  const auditFields = (a: TemplateSettings, b: TemplateSettings) => (Object.keys(b) as (keyof TemplateSettings)[]).forEach((k) => a[k] !== b[k] && audit({ module: 'Shipping', by: actor.name, action: 'Template changed', field: k, before: a[k], after: b[k] }));
  const PREFIX: Record<string, string> = { proforma: 'PRF', packing: 'PKL', invoice: 'CIV', boe: 'BOE', bank: 'BKI', booking: 'BKC' };
  /** Register a generated document with its own number (and tick the matching export document). */
  const registerDoc = (template: string, refNo: string, shipmentId?: string, signature?: Signature): Result => {
    const s = ref.current;
    if (!access.canWrite) return fail(READ_ONLY);
    if (is('CUSTOMER', 'CREDIT')) return fail('Documents are issued by Operations');
    const existing = s.generated.find((g2) => g2.template === template && g2.ref === refNo);
    if (existing && !signature) return { ok: true, id: existing.number };
    if (existing && signature) {
      if (existing.signature) return fail(`${existing.number} is already signed by ${existing.signature.by}`);
      commit({ ...s, generated: s.generated.map((x) => (x.id === existing.id ? { ...x, signature } : x)) });
      return done('Document signed', existing.number, existing.number);
    }
    const { number, sequence } = next(s, PREFIX[template] ?? 'DOC');
    commit({ ...s, sequence, generated: [{ id: uid('gd'), template, number, ref: refNo, at: now(), by: actor.name, signature }, ...s.generated] });
    if (template === 'packing' && shipmentId) {
      const sh = ops.state.shipments.find((x) => x.id === shipmentId);
      if (sh && !sh.docs.find((d) => d.key === 'packing')?.done) ops.toggleDoc(shipmentId, 'packing', number);
    }
    return { ok: true, id: number };
  };

  const reset = () => commit(buildShippingExtSeed(wh.state.lots, ops.state.shipments));

  return {
    state,
    actor,
    ops,
    wh,
    party,
    saveSi,
    submitSi,
    releaseCredit,
    confirmSi,
    convertToShipment,
    cancelSi,
    requestAmendment,
    decideAmendment,
    blockSi,
    updateMilestone,
    pullExternal,
    saveIdf,
    idfStep,
    bookBond,
    linkBond,
    releaseBond,
    sendBondReminders,
    saveVoyage,
    addCharge,
    billCharge,
    removeCharge,
    requestTrucks,
    truckStep,
    applyLicence,
    licenceStep,
    saveTemplates,
    registerDoc,
    siValue,
    reset
  };
};

export const ShippingExtProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useShippingExtStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
};

export const useShippingExt = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useShippingExt must be used inside ShippingExtProvider');
  return ctx;
};
