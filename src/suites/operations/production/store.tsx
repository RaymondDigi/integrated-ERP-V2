import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { useFinance } from '../../finance/store';
import { useCommercial } from '../../commercial/store';
import { addDays, daysBetween, localStamp, round2, TODAY } from '../../finance/engine';
import { useAccess } from '../../../platform/access';
import { notify } from '../../../platform/outbox';
import { audit, auditChanges } from '../../../platform/audit';
import { useOperations } from '../store';
import { OPS_ACTORS } from '../data';
import { batchCost, materialNeed } from '../engine';
import type { OpsRole, QualityCheck } from '../types';
import { buildBlendingSeed, GRADE_ORDER } from './data';
import {
  activeRouting,
  actualConversion,
  blendProblems,
  bsCost,
  bsKg,
  evaluateChop,
  hoursOn,
  lotFree,
  nextWorkingDay,
  rollUpCost,
  standardPerUnit,
  ALL_OPTS
} from './engine';
import type {
  BatchExt,
  Blendsheet,
  BlendingState,
  BlendLine,
  ByProductKind,
  CalendarException,
  CostOptions,
  Forecast,
  LabourEntry,
  PlanParams,
  Routing,
  Scenario,
  TeaLot,
  WorkCenter
} from './types';
import './blending.css';

type Result = { ok: true; id?: string } | { ok: false; error: string };
type JLine = { account: string; description: string; debit: number; credit: number };

const Ctx = createContext<ReturnType<typeof useBlendingStore> | null>(null);

const useBlendingStore = () => {
  const { addToast } = useApp();
  const ops = useOperations();
  const finance = useFinance();
  const commercial = useCommercial();
  const access = useAccess();
  const [state, setState] = useState<BlendingState>(() => buildBlendingSeed(commercial.state, ops.state.batches, ops.state.recipes));
  const ref = useRef(state);
  ref.current = state;
  const actor = ops.actor;
  const products = commercial.state.products;

  const commit = (next: BlendingState) => {
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
  const next = (s: BlendingState, prefix: string) => {
    const n = (s.sequence[prefix] ?? 0) + 1;
    return { number: `${prefix}-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`, sequence: { ...s.sequence, [prefix]: n } };
  };
  const log = (action: string, note?: string) => ({ at: now(), by: actor.name, action, note });
  const is = (...roles: OpsRole[]) => roles.includes(actor.role);
  /** The signed-in account must be allowed to write before any persona rule applies. */
  const readOnly = () => (access.canWrite ? null : fail('This is a read-only account — production records cannot be changed'));
  const trail = (action: string, ref?: string, note?: string) => audit({ module: 'Production', by: actor.name, action, ref, note });
  const tell = (to: string, subject: string, ref: string, body?: string, level: 'info' | 'warning' | 'critical' = 'info') => notify({ module: 'Production', to, subject, ref, body, level });
  const lotName = (id: string) => ref.current.lots.find((l) => l.id === id)?.invoiceNo ?? id;
  const batchOf = (id: string) => ops.state.batches.find((b) => b.id === id);
  const recipeOf = (id: string) => ops.state.recipes.find((r) => r.id === id);
  const extOf = (s: BlendingState, batchId: string): BatchExt => s.ext[batchId] ?? { batchId, labour: [], stops: [], reserved: [], journalIds: [], subcontractIds: [], history: [] };
  const setExt = (s: BlendingState, batchId: string, patch: Partial<BatchExt>, action?: string, note?: string): BlendingState => {
    const e = extOf(s, batchId);
    return { ...s, ext: { ...s.ext, [batchId]: { ...e, ...patch, history: action ? [...e.history, log(action, note)] : e.history } } };
  };
  const cost = (sku: string) => products.find((p) => p.sku === sku)?.cost ?? 0;

  /** Production journal into Finance, submitted straight into the Finance approval queue. */
  const postJournal = (memo: string, lines: JLine[]): string | undefined => {
    const clean = lines.map((l) => ({ ...l, debit: round2(Math.max(0, l.debit)), credit: round2(Math.max(0, l.credit)) })).filter((l) => l.debit || l.credit);
    const dr = round2(clean.reduce((a, l) => a + l.debit, 0));
    const cr = round2(clean.reduce((a, l) => a + l.credit, 0));
    const diff = round2(dr - cr);
    if (diff) clean.push({ account: '5000', description: 'Production rounding / variance', debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0 });
    if (clean.length < 2) return undefined;
    const r = finance.saveJournal({ date: TODAY, memo: `Production · ${memo}`, lines: clean.map((l) => ({ ...l, id: uid('jl'), department: 'Operations' })) });
    if (!r.ok || !r.id) return undefined;
    finance.transition('journals', r.id, 'submit');
    return r.id;
  };

  /* ================= Tea lots ================= */
  const holdLot = (id: string, reason: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('QC', 'MANAGER')) return fail('Quality holds are placed by the Quality Controller or the Operations Manager');
    if (!reason.trim()) return fail('Say why the lot is on hold');
    const s = ref.current;
    const lot = s.lots.find((l) => l.id === id)!;
    if (lot.status !== 'AVAILABLE') return fail(`${lot.invoiceNo} is ${lot.status === 'ON_HOLD' ? 'already on hold' : 'used up'}`);
    commit({ ...s, lots: s.lots.map((l) => (l.id === id ? { ...l, status: 'ON_HOLD', holdReason: reason } : l)) });
    trail('Lot put on hold', lot.invoiceNo, reason);
    return done('Lot on hold', `${lot.invoiceNo} cannot be blended until it is released`);
  };
  const releaseLot = (id: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('QC', 'MANAGER')) return fail('Quality holds are released by the Quality Controller or the Operations Manager');
    const s = ref.current;
    const lot = s.lots.find((l) => l.id === id)!;
    if (lot.status !== 'ON_HOLD') return fail('Only lots on hold can be released');
    commit({ ...s, lots: s.lots.map((l) => (l.id === id ? { ...l, status: 'AVAILABLE', holdReason: undefined } : l)) });
    trail('Lot released from hold', lot.invoiceNo);
    return done('Lot released', lot.invoiceNo);
  };
  /** Import auction or direct-sale invoices from the broker's CSV catalogue. */
  const importLots = (rows: Record<string, string>[]) => {
    const errors: string[] = [];
    if (!access.canWrite) return { imported: 0, errors: ['This is a read-only account — production records cannot be changed'] };
    if (!is('OFFICER', 'STOREKEEPER', 'MANAGER')) return { imported: 0, errors: ['Tea lots are received by Stores, the Operations Officer or the Manager'] };
    const s = ref.current;
    const add: TeaLot[] = [];
    rows.forEach((r, i) => {
      const line = `Row ${i + 2}`;
      const kgs = Number(r.kgs);
      const cpk = Number(r.costPerKg);
      const moist = Number(r.moisturePct);
      const score = Number(r.tastingScore);
      if (!r.invoiceNo) return errors.push(`${line}: invoice number missing`);
      if (s.lots.some((l) => l.invoiceNo === r.invoiceNo) || add.some((l) => l.invoiceNo === r.invoiceNo)) return errors.push(`${line}: ${r.invoiceNo} already received`);
      if (!GRADE_ORDER.includes(r.grade)) return errors.push(`${line}: grade ${r.grade} is not one of ${GRADE_ORDER.join(', ')}`);
      if (!(kgs > 0) || !(cpk > 0)) return errors.push(`${line}: kgs and costPerKg must be positive numbers`);
      if (!(moist >= 0 && moist < 20) || !(score >= 0 && score <= 10)) return errors.push(`${line}: moisture 0–20% and tasting score 0–10`);
      if (!ops.state.warehouses.some((w) => w.id === r.warehouseId)) return errors.push(`${line}: unknown warehouse ${r.warehouseId}`);
      add.push({ id: uid('lt'), invoiceNo: r.invoiceNo, garden: r.garden || 'Unknown', grade: r.grade, saleNo: r.saleNo || 'Direct', kgs, kgBalance: kgs, packages: Math.round(kgs / 65), warehouseId: r.warehouseId, bay: r.bay || 'Unassigned', costPerKg: cpk, moisturePct: moist, tastingScore: score, status: moist > 6.5 ? 'ON_HOLD' : 'AVAILABLE', holdReason: moist > 6.5 ? `Moisture ${moist}% above the 6.5% intake limit` : undefined, arrived: TODAY });
    });
    if (add.length) {
      commit({ ...ref.current, lots: [...add, ...ref.current.lots] });
      trail('Tea lots imported', `${add.length} invoices`);
    }
    return { imported: add.length, errors };
  };

  /* ================= Blendsheets ================= */
  /** Proposes lots for a blend: oldest stock first, each grade at the middle of the standard's range. */
  const proposeLines = (s: BlendingState, standardId: string, targetKg: number, exceptBs?: string): BlendLine[] | null => {
    const std = s.standards.find((x) => x.id === standardId);
    if (!std) return null;
    const mids = std.grades.map((g) => (g.minPct + g.maxPct) / 2);
    const scale = 100 / mids.reduce((a, b) => a + b, 0);
    const lines: BlendLine[] = [];
    let ok = true;
    std.grades.forEach((g, i) => {
      let need = Math.round((targetKg * mids[i] * scale) / 100);
      if (i === std.grades.length - 1) need = targetKg - lines.reduce((a, l) => a + l.kg, 0);
      const lots = s.lots.filter((l) => l.grade === g.grade && l.status === 'AVAILABLE').sort((a, b) => a.arrived.localeCompare(b.arrived));
      for (const lot of lots) {
        if (need <= 0) break;
        const free = lotFree(s, lot, exceptBs) - lines.filter((x) => x.lotId === lot.id).reduce((a, x) => a + x.kg, 0);
        const kg = Math.min(free, need);
        if (kg > 0) {
          lines.push({ lotId: lot.id, kg });
          need -= kg;
        }
      }
      if (need > 0 && g.minPct > 0) ok = false;
    });
    return ok ? lines : null;
  };

  const createBlendsheet = (d: { standardId: string; plant: 'TOWER' | 'DRUM'; targetKg: number; date: string; due: string; customerId?: string; orderId?: string; orderNumber?: string; parentBatchId?: string; auto?: boolean; note?: string }, internal = false): Result => {
    if (!internal) {
      const ro = readOnly();
      if (ro) return ro;
      if (!is('OFFICER', 'MANAGER')) return fail('Blendsheets are prepared by the Operations Officer — switch to Mary Wambui');
    }
    if (!(d.targetKg >= 100)) return fail('A blend is at least 100 kg');
    if (d.due < d.date) return fail('The due date is before the blending date');
    const s = ref.current;
    const wc = s.workCenters.find((w) => w.kind === d.plant);
    if (!wc) return fail('No plant of that kind is set up');
    const lines = proposeLines(s, d.standardId, d.targetKg) ?? [];
    const { number, sequence } = next(s, 'BS');
    const id = uid('bs');
    const b: Blendsheet = {
      id, number, standardId: d.standardId, plant: d.plant, workCenterId: wc.id, targetKg: d.targetKg, date: d.date, due: d.due, customerId: d.customerId, orderId: d.orderId, orderNumber: d.orderNumber,
      lines, status: 'DRAFT', preparedBy: internal ? 'System (make to order)' : actor.name, approvals: [], chops: [], journalIds: [], labour: [], parentBatchId: d.parentBatchId, autoFromOrder: d.auto,
      history: [{ at: now(), by: internal ? 'System' : actor.name, action: d.orderNumber ? 'Created from sales order' : d.parentBatchId ? 'Raised for a packing batch' : 'Blendsheet prepared', note: d.note ?? d.orderNumber }]
    };
    commit({ ...s, sequence, blendsheets: [b, ...s.blendsheets] });
    trail('Blendsheet created', number, d.orderNumber);
    if (!lines.length) addToast({ type: 'warning', title: 'Not enough free tea', message: `${number}: choose the lots by hand — the free stock does not cover the standard` });
    return internal ? { ok: true, id } : done('Blendsheet created', `${number} · ${d.targetKg.toLocaleString()} kg${lines.length ? ` · ${lines.length} lots proposed` : ''}`, id);
  };

  /** Kg of blended tea a sales order needs: the packed products on it that are made from bulk blend. */
  const orderKg = (orderId: string) => {
    const o = commercial.snapshot().orders.find((x) => x.id === orderId);
    if (!o) return 0;
    return Math.round(
      o.lines.reduce((a, l) => {
        const r = ops.state.recipes.find((x) => x.product === l.sku);
        const raw = r?.materials.find((m) => m.sku === 'RAW-A');
        return a + (r && raw ? ((raw.qty * 1000) / r.batchSize) * Math.max(0, l.qty - l.delivered) : 0);
      }, 0)
    );
  };
  const createFromOrder = (orderId: string, auto = false): Result => {
    const o = commercial.snapshot().orders.find((x) => x.id === orderId);
    if (!o) return fail('Sales order not found');
    if (o.status !== 'APPROVED' || o.closed) return fail(`${o.number} is not an approved open order`);
    const s = ref.current;
    if (s.blendsheets.some((b) => b.orderId === orderId && b.status !== 'CANCELLED')) return fail(`${o.number} already has a blendsheet`);
    const kg = orderKg(orderId);
    if (kg < 100) return fail(`${o.number} has no blended tea products outstanding`);
    const std = s.standards.find((x) => x.customerId === o.customerId) ?? s.standards.find((x) => !x.customerId)!;
    const targetKg = Math.ceil(kg / 50) * 50;
    const date = nextWorkingDay(s.workCenters.find((w) => w.kind === (targetKg >= 2_000 ? 'TOWER' : 'DRUM')), addDays(TODAY, 1), s.calendar);
    const r = createBlendsheet({ standardId: std.id, plant: targetKg >= 2_000 ? 'TOWER' : 'DRUM', targetKg, date, due: o.requiredBy > date ? o.requiredBy : addDays(date, 2), customerId: o.customerId, orderId: o.id, orderNumber: o.number, auto }, auto);
    if (r.ok && auto) {
      tell('Mary Wambui (Operations Officer)', `Make-to-order blend raised for ${o.number}`, o.number, `${targetKg.toLocaleString()} kg of ${std.name} — review the lots and submit`);
      addToast({ type: 'info', title: 'Blendsheet raised automatically', message: `${o.number} contains make-to-order products — ${targetKg.toLocaleString()} kg added to the blending schedule` });
    }
    return r;
  };

  const updateBs = (id: string, patch: Partial<Blendsheet>, action: string, note?: string) => {
    const s = ref.current;
    commit({ ...s, blendsheets: s.blendsheets.map((b) => (b.id === id ? { ...b, ...patch, history: [...b.history, log(action, note)] } : b)) });
  };
  const saveBlendsheet = (id: string, patch: Pick<Blendsheet, 'lines' | 'targetKg' | 'date' | 'due' | 'plant' | 'standardId'>): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('Blendsheets are prepared by the Operations Officer');
    const s = ref.current;
    const b = s.blendsheets.find((x) => x.id === id)!;
    if (b.status !== 'DRAFT' && b.status !== 'REJECTED') return fail('Only draft or returned blendsheets can be changed');
    if (!(patch.targetKg >= 100)) return fail('A blend is at least 100 kg');
    if (patch.due < patch.date) return fail('The due date is before the blending date');
    const wc = s.workCenters.find((w) => w.kind === patch.plant)!;
    updateBs(id, { ...patch, lines: patch.lines.filter((l) => l.lotId && l.kg > 0), workCenterId: wc.id, status: 'DRAFT' }, 'Edited');
    return done('Blendsheet saved', b.number);
  };
  const autoFill = (id: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    const s = ref.current;
    const b = s.blendsheets.find((x) => x.id === id)!;
    if (b.status !== 'DRAFT' && b.status !== 'REJECTED') return fail('Only draft blendsheets can be re-proposed');
    const lines = proposeLines(s, b.standardId, b.targetKg, b.id);
    if (!lines) return fail('Free tea in stock does not cover this standard — buy at the next Mombasa auction or release a held lot');
    updateBs(id, { lines }, 'Lots proposed', `${lines.length} lots, oldest first`);
    return done('Lots proposed', `${lines.length} lots at the middle of each grade range`);
  };
  const submitBlendsheet = (id: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('The Operations Officer submits blendsheets');
    const s = ref.current;
    const b = s.blendsheets.find((x) => x.id === id)!;
    if (b.status !== 'DRAFT' && b.status !== 'REJECTED') return fail('Only drafts can be submitted');
    const p = blendProblems(s, b);
    if (p.length) return fail(p[0]);
    updateBs(id, { status: 'SUBMITTED', approvals: [], preparedBy: b.preparedBy.startsWith('System') ? actor.name : b.preparedBy }, 'Submitted for approval');
    tell('Faith Akinyi (Quality Controller)', `Blendsheet ${b.number} awaiting approval`, b.number, `${b.targetKg.toLocaleString()} kg on the ${b.plant.toLowerCase()}`);
    return done('Submitted', `${b.number} is waiting for the Quality Controller or Manager`);
  };
  const approveBlendsheet = (id: string, note = ''): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('QC', 'MANAGER')) return fail('Blendsheets are approved by the Quality Controller or the Operations Manager');
    const s = ref.current;
    const b = s.blendsheets.find((x) => x.id === id)!;
    if (b.status !== 'SUBMITTED') return fail('Only submitted blendsheets can be approved');
    if (b.preparedBy === actor.name) return fail('You prepared this blendsheet, so someone else must approve it');
    const p = blendProblems(s, b);
    if (p.length) return fail(p[0]);
    updateBs(id, { status: 'APPROVED', approvals: [...b.approvals, { by: actor.name, role: actor.role, at: now(), note: note || undefined }] }, 'Approved', note || undefined);
    trail('Blendsheet approved', b.number, note);
    tell('Mary Wambui (Operations Officer)', `Blendsheet ${b.number} approved`, b.number, 'Stores can issue the teas to the plant');
    return done('Approved', `${b.number} — Stores can issue the teas`);
  };
  const rejectBlendsheet = (id: string, note: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('QC', 'MANAGER')) return fail('Only the Quality Controller or Manager can return a blendsheet');
    if (!note.trim()) return fail('Say what needs to change');
    const b = ref.current.blendsheets.find((x) => x.id === id)!;
    if (b.status !== 'SUBMITTED') return fail('Only submitted blendsheets can be returned');
    updateBs(id, { status: 'REJECTED', approvals: [] }, 'Returned to preparer', note);
    tell(b.preparedBy, `Blendsheet ${b.number} returned`, b.number, note, 'warning');
    return done('Returned', b.number);
  };
  const cancelBlendsheet = (id: string, reason: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('The Operations Officer or Manager cancels blendsheets');
    if (!reason.trim()) return fail('Give a reason');
    const b = ref.current.blendsheets.find((x) => x.id === id)!;
    if (!['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'].includes(b.status)) return fail('Teas are already issued — complete the blend instead');
    updateBs(id, { status: 'CANCELLED' }, 'Cancelled', reason);
    return done('Blendsheet cancelled', b.number);
  };
  /** Stores issues the teas from their bays to the plant; lot balances go down and the cost moves to work in process. */
  const issueBlend = (id: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('STOREKEEPER', 'MANAGER')) return fail('Stores issues tea to the plant — switch to John Kiprop');
    const s = ref.current;
    const b = s.blendsheets.find((x) => x.id === id)!;
    if (b.status !== 'APPROVED') return fail('Only approved blendsheets can be issued');
    for (const l of b.lines) {
      const lot = s.lots.find((x) => x.id === l.lotId)!;
      if (lot.status !== 'AVAILABLE') return fail(`${lot.invoiceNo} is on hold`);
      if (lot.kgBalance < l.kg) return fail(`${lot.invoiceNo}: only ${lot.kgBalance.toLocaleString()} kg left in ${lot.bay}`);
    }
    const value = bsCost(b, s.lots);
    const jid = postJournal(`${b.number} teas issued to blending`, [
      { account: '1200', description: `Work in process — blend ${b.number}`, debit: value, credit: 0 },
      { account: '1200', description: `Tea stock issued (${b.lines.length} lots)`, debit: 0, credit: value }
    ]);
    const lots = s.lots.map((lot) => {
      const l = b.lines.find((x) => x.lotId === lot.id);
      if (!l) return lot;
      const bal = round2(lot.kgBalance - l.kg);
      return { ...lot, kgBalance: bal, status: bal <= 0 ? ('DEPLETED' as const) : lot.status };
    });
    commit({
      ...s,
      lots,
      moves: [{ id: uid('pm'), date: TODAY, item: `Tea lots (${b.lines.length})`, qty: -bsKg(b), unit: 'kg', kind: 'LOT_ISSUE', ref: b.number, by: actor.name }, ...s.moves],
      blendsheets: s.blendsheets.map((x) => (x.id === id ? { ...x, status: 'IN_PROGRESS', issuedAt: now(), issuedCost: value, journalIds: jid ? [...x.journalIds, jid] : x.journalIds, history: [...x.history, log('Teas issued to the plant', b.lines.map((l) => `${lotName(l.lotId)} ${l.kg} kg`).join(', '))] } : x))
    });
    return done('Teas issued', `${bsKg(b).toLocaleString()} kg to the ${b.plant.toLowerCase()} — run the first chop`);
  };
  const runChop = (id: string, kgIn: number, reworkOf?: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('The Operations Officer runs the chops');
    const s = ref.current;
    const b = s.blendsheets.find((x) => x.id === id)!;
    if (b.status !== 'IN_PROGRESS') return fail('Issue the teas before running chops');
    if (b.chops.some((c) => !c.result)) return fail('Finish tasting the open chop first');
    const wc = s.workCenters.find((w) => w.id === b.workCenterId);
    let reworkCost: number | undefined;
    if (reworkOf) {
      const f = b.chops.find((c) => c.id === reworkOf);
      if (!f || f.result?.pass !== false) return fail('Only a failed chop can be re-worked');
      if (b.chops.some((c) => c.reworkOf === reworkOf)) return fail('That chop has already been re-worked');
      kgIn = f.kgIn;
      const hrs = kgIn / (wc?.kgPerHour ?? 800);
      reworkCost = round2(hrs * 3 * ((wc?.labourDirectRate ?? 400) + (wc?.labourIndirectRate ?? 120)) + hrs * (wc?.machineRate ?? 0));
    } else {
      const used = b.chops.filter((c) => !c.reworkOf).reduce((a, c) => a + c.kgIn, 0);
      if (!(kgIn > 0)) return fail('Enter the kg loaded into the chop');
      if (wc?.chopKg && kgIn > wc.chopKg) return fail(`${wc.name} takes at most ${wc.chopKg.toLocaleString()} kg per chop`);
      if (used + kgIn > bsKg(b) + 0.01) return fail(`Only ${(bsKg(b) - used).toLocaleString()} kg of issued tea is left to blend`);
    }
    const chop = { id: uid('ch'), seq: b.chops.length + 1, kgIn, startedAt: now(), by: actor.name, reworkOf, reworkCost };
    updateBs(id, { chops: [...b.chops, chop] }, reworkOf ? `Chop ${chop.seq} re-run (rework)` : `Chop ${chop.seq} loaded`, `${kgIn.toLocaleString()} kg`);
    return done(reworkOf ? 'Rework chop started' : 'Chop running', `Chop ${chop.seq} · ${kgIn.toLocaleString()} kg — draw a sample when it discharges`);
  };
  const drawSample = (id: string, chopId: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('QC', 'OFFICER', 'MANAGER')) return fail('Samples are drawn by Quality or the Operations Officer');
    const b = ref.current.blendsheets.find((x) => x.id === id)!;
    const c = b.chops.find((x) => x.id === chopId)!;
    if (c.sample) return fail('A sample is already drawn from this chop');
    const sample = { ref: `SMP-${b.number.slice(-4)}-${c.seq}`, drawnBy: actor.name, drawnAt: now() };
    updateBs(id, { chops: b.chops.map((x) => (x.id === chopId ? { ...x, sample } : x)) }, `Sample drawn from chop ${c.seq}`, sample.ref);
    return done('Sample drawn', `${sample.ref} — sent to the tasting room`);
  };
  const recordChop = (id: string, chopId: string, r: { moisturePct: number; tastingScore: number; liquor: string; infusion: string; appearance: string }): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('QC')) return fail('Tasting results are entered by the Quality Controller — switch to Faith Akinyi');
    const s = ref.current;
    const b = s.blendsheets.find((x) => x.id === id)!;
    const c = b.chops.find((x) => x.id === chopId)!;
    if (!c.sample) return fail('Draw a sample before recording the result');
    if (c.result) return fail('This chop already has a result');
    if (!(r.moisturePct > 0 && r.moisturePct < 20)) return fail('Moisture must be between 0 and 20%');
    if (!(r.tastingScore >= 0 && r.tastingScore <= 10)) return fail('Tasting score is out of 10');
    const std = s.standards.find((x) => x.id === b.standardId);
    const reasons = evaluateChop(std, r.moisturePct, r.tastingScore);
    const pass = reasons.length === 0;
    const result = { ...r, pass, reasons, by: actor.name, at: now() };
    updateBs(id, { chops: b.chops.map((x) => (x.id === chopId ? { ...x, result, kgOut: pass ? round2((x.kgIn * (std?.expectedOutturnPct ?? 98.5)) / 100) : undefined } : x)) }, pass ? `Chop ${c.seq} passed` : `Chop ${c.seq} failed`, pass ? `Moisture ${r.moisturePct}% · score ${r.tastingScore}` : reasons.join('; '));
    if (!pass) tell('Esther Muthoni (Operations Manager)', `Chop ${c.seq} of ${b.number} failed tasting`, b.number, reasons.join('; '), 'warning');
    return pass ? done('Chop passed', `${b.number} chop ${c.seq} within the ${std?.code} limits`) : (addToast({ type: 'warning', title: 'Chop failed', message: `${reasons.join('; ')} — re-work the chop` }), { ok: true });
  };
  const recordBlendLabour = (id: string, employee: string, hours: number): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('The Operations Officer books hours');
    if (!employee.trim() || !(hours > 0 && hours <= 16)) return fail('Choose the person and enter 0–16 hours');
    const b = ref.current.blendsheets.find((x) => x.id === id)!;
    if (!['IN_PROGRESS', 'COMPLETED'].includes(b.status)) return fail('Hours are booked once the teas are issued');
    updateBs(id, { labour: [...b.labour, { id: uid('lb'), employee, hours, workCenterId: b.workCenterId, date: TODAY, by: actor.name }] }, 'Hours booked', `${employee} · ${hours} h`);
    return done('Hours booked', `${employee}: ${hours} h on ${b.number}`);
  };
  /** Close the blend: out-turn recorded, blended tea into stock, by-products recorded, production journal to Finance. */
  const completeBlend = (id: string, outputKg: number, byProducts: { kind: ByProductKind; kg: number }[]): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('The Operations Officer records the out-turn');
    const s = ref.current;
    const b = s.blendsheets.find((x) => x.id === id)!;
    if (b.status !== 'IN_PROGRESS') return fail('Only blends in progress can be completed');
    if (!b.chops.length || b.chops.some((c) => !c.result)) return fail('Every chop needs a tasting result first');
    const reworked = new Set(b.chops.map((c) => c.reworkOf).filter(Boolean));
    const open = b.chops.filter((c) => c.result && !c.result.pass && !reworked.has(c.id));
    if (open.length) return fail(`Chop ${open[0].seq} failed tasting — re-work it before closing the blend`);
    const input = bsKg(b);
    const passedKg = b.chops.filter((c) => c.result?.pass).reduce((a, c) => a + c.kgIn, 0);
    if (passedKg < input - 0.01) return fail(`${(input - passedKg).toLocaleString()} kg of issued tea has not passed through a chop yet`);
    const by = byProducts.filter((x) => x.kg > 0);
    const byKg = by.reduce((a, x) => a + x.kg, 0);
    if (!(outputKg > 0)) return fail('Enter the kg of blended tea made');
    if (outputKg + byKg > input + 0.01) return fail(`Output and by-products (${(outputKg + byKg).toLocaleString()} kg) are more than the ${input.toLocaleString()} kg issued`);
    const std = s.standards.find((x) => x.id === b.standardId)!;
    const stock = commercial.adjustStock([{ sku: std.outputSku, delta: round2(outputKg / 1000) }]);
    if (!stock.ok) return stock;
    const conv = actualConversion({ labour: b.labour } as BatchExt, s.workCenters);
    const rework = b.chops.reduce((a, c) => a + (c.reworkCost ?? 0), 0);
    const byValue = round2(by.reduce((a, x) => a + x.kg * (std.byProducts.find((y) => y.kind === x.kind)?.valuePerKg ?? 0), 0));
    const wip = b.issuedCost ?? bsCost(b, s.lots);
    const finished = round2(wip + conv.labour + conv.overhead + rework - byValue);
    const jid = postJournal(`${b.number} blend completed — ${outputKg.toLocaleString()} kg`, [
      { account: '1200', description: `Blended tea ${std.code} ${outputKg} kg`, debit: finished, credit: 0 },
      { account: '1200', description: 'By-products (sweepings, dust, fibre) at realisable value', debit: byValue, credit: 0 },
      { account: '1200', description: `Work in process — blend ${b.number}`, debit: 0, credit: wip },
      { account: '6000', description: 'Blending labour absorbed', debit: 0, credit: conv.labour + rework },
      { account: '6200', description: 'Plant overhead absorbed', debit: 0, credit: conv.overhead }
    ]);
    const lossKg = round2(input - outputKg - byKg);
    commit({
      ...s,
      moves: [
        { id: uid('pm'), date: TODAY, item: std.name, qty: outputKg, unit: 'kg', kind: 'BLEND_OUTPUT', ref: b.number, by: actor.name },
        ...by.map((x) => ({ id: uid('pm'), date: TODAY, item: x.kind.charAt(0) + x.kind.slice(1).toLowerCase(), qty: x.kg, unit: 'kg', kind: 'BY_PRODUCT' as const, ref: b.number, by: actor.name })),
        ...s.moves
      ],
      blendsheets: s.blendsheets.map((x) =>
        x.id === id
          ? { ...x, status: 'COMPLETED', outturn: { inputKg: input, outputKg, byProducts: by, lossKg, at: now(), by: actor.name }, journalIds: jid ? [...x.journalIds, jid] : x.journalIds, history: [...x.history, log(`Out-turn recorded — ${outputKg.toLocaleString()} kg`, `${((outputKg / input) * 100).toFixed(1)}% out-turn · loss ${lossKg} kg`)] }
          : x
      )
    });
    trail('Blend completed', b.number, `${outputKg} kg`);
    tell(b.orderNumber ? 'Sales desk' : 'Esther Muthoni (Operations Manager)', `Blend ${b.number} completed`, b.number, `${outputKg.toLocaleString()} kg of ${std.name} in stock${b.orderNumber ? ` for ${b.orderNumber}` : ''}`);
    return done('Blend completed', `${outputKg.toLocaleString()} kg into stock · ${((outputKg / input) * 100).toFixed(1)}% out-turn`);
  };

  /* ================= Blending plan ================= */
  const createPlan = (period: string, bsIds: string[], notes: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('The Operations Officer prepares the blending plan');
    const s = ref.current;
    if (!/^\d{4}-\d{2}$/.test(period)) return fail('Choose the month');
    if (!bsIds.length) return fail('Put at least one blendsheet on the plan');
    for (const id of bsIds) {
      const b = s.blendsheets.find((x) => x.id === id)!;
      if (!['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'].includes(b.status)) return fail(`${b.number} is already running or closed`);
      const other = s.plans.find((p) => p.status !== 'REJECTED' && p.blendsheetIds.includes(id));
      if (other) return fail(`${b.number} is already on ${other.number}`);
    }
    const { number, sequence } = next(s, 'BPL');
    const pid = uid('bp');
    commit({
      ...s,
      sequence,
      plans: [{ id: pid, number, period, blendsheetIds: bsIds, status: 'DRAFT', preparedBy: actor.name, approvals: [], notes, history: [log('Plan prepared')] }, ...s.plans],
      blendsheets: s.blendsheets.map((b) => (bsIds.includes(b.id) ? { ...b, planId: pid } : b))
    });
    return done('Blending plan created', `${number} · ${bsIds.length} blendsheets`, pid);
  };
  const updatePlan = (id: string, patch: Partial<BlendingState['plans'][number]>, action: string, note?: string) => {
    const s = ref.current;
    commit({ ...s, plans: s.plans.map((p) => (p.id === id ? { ...p, ...patch, history: [...p.history, log(action, note)] } : p)) });
  };
  const submitPlan = (id: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('The Operations Officer submits the plan');
    const p = ref.current.plans.find((x) => x.id === id)!;
    if (p.status !== 'DRAFT' && p.status !== 'REJECTED') return fail('Only draft plans can be submitted');
    updatePlan(id, { status: 'SUBMITTED', approvals: [] }, 'Submitted for approval');
    tell('Esther Muthoni (Operations Manager)', `Blending plan ${p.number} awaiting approval`, p.number);
    return done('Plan submitted', `${p.number} is with the Operations Manager`);
  };
  /** Approving the plan approves every submitted blendsheet on it; all must pass their checks. */
  const approvePlan = (id: string, note = ''): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('MANAGER')) return fail('The blending plan is approved by the Operations Manager');
    const s = ref.current;
    const p = s.plans.find((x) => x.id === id)!;
    if (p.status !== 'SUBMITTED') return fail('Only submitted plans can be approved');
    if (p.preparedBy === actor.name) return fail('You prepared this plan, so someone else must approve it');
    const sheets = s.blendsheets.filter((b) => p.blendsheetIds.includes(b.id));
    const draft = sheets.find((b) => b.status === 'DRAFT' || b.status === 'REJECTED');
    if (draft) return fail(`${draft.number} is still a draft — submit it first`);
    for (const b of sheets.filter((x) => x.status === 'SUBMITTED')) {
      const pr = blendProblems(s, b);
      if (pr.length) return fail(`${b.number}: ${pr[0]}`);
      if (b.preparedBy === actor.name) return fail(`You prepared ${b.number}, so someone else must approve it`);
    }
    const stamp = { by: actor.name, role: actor.role, at: now(), note: note || undefined };
    commit({
      ...s,
      plans: s.plans.map((x) => (x.id === id ? { ...x, status: 'APPROVED', approvals: [...x.approvals, stamp], history: [...x.history, log('Plan approved', note || undefined)] } : x)),
      blendsheets: s.blendsheets.map((b) => (p.blendsheetIds.includes(b.id) && b.status === 'SUBMITTED' ? { ...b, status: 'APPROVED', approvals: [...b.approvals, stamp], history: [...b.history, log(`Approved with plan ${p.number}`)] } : b))
    });
    trail('Blending plan approved', p.number, note);
    tell('Mary Wambui (Operations Officer)', `Blending plan ${p.number} approved`, p.number);
    return done('Plan approved', `${p.number} — ${sheets.length} blendsheets released to Stores`);
  };
  const rejectPlan = (id: string, note: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('MANAGER')) return fail('Only the Operations Manager can return the plan');
    if (!note.trim()) return fail('Say what needs to change');
    const p = ref.current.plans.find((x) => x.id === id)!;
    if (p.status !== 'SUBMITTED') return fail('Only submitted plans can be returned');
    updatePlan(id, { status: 'REJECTED' }, 'Returned', note);
    return done('Plan returned', p.number);
  };

  /* ================= Work centres and calendar ================= */
  const saveWorkCenter = (wc: WorkCenter): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('MANAGER')) return fail('Work-centre rates and capacity are set by the Operations Manager');
    if (!wc.name.trim()) return fail('Name the work centre');
    if (!(wc.machines >= 1 && wc.crew >= 0 && wc.tooling >= 1)) return fail('Machines and tooling must be at least 1');
    if (!(wc.hoursPerDay > 0 && wc.hoursPerDay <= 24)) return fail('Hours per day must be between 0 and 24');
    if (!wc.days.length) return fail('Choose the working days');
    if ([wc.labourDirectRate, wc.labourIndirectRate, wc.machineRate, wc.burden.amount, wc.setupCost].some((n) => !(n >= 0))) return fail('Rates cannot be negative');
    if ((wc.burden.basis === 'PCT_LABOUR' || wc.burden.basis === 'PCT_MATERIAL') && wc.burden.amount > 300) return fail('A percentage burden above 300% looks wrong');
    const s = ref.current;
    const before = s.workCenters.find((w) => w.id === wc.id);
    if (before) auditChanges('Production', actor.name, wc.id, before, wc, ['name', 'machines', 'crew', 'tooling', 'hoursPerDay', 'labourDirectRate', 'labourIndirectRate', 'machineRate', 'setupCost']);
    if (before && JSON.stringify(before.burden) !== JSON.stringify(wc.burden)) audit({ module: 'Production', by: actor.name, ref: wc.id, action: 'Changed', field: 'burden', before: `${before.burden.basis} ${before.burden.amount}`, after: `${wc.burden.basis} ${wc.burden.amount}` });
    commit({ ...s, workCenters: before ? s.workCenters.map((w) => (w.id === wc.id ? wc : w)) : [...s.workCenters, wc] });
    return done('Work centre saved', wc.name);
  };
  const moveSequence = (wcId: string, item: string, dir: -1 | 1): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('MANAGER', 'OFFICER')) return fail('The production sequence is set by Operations');
    const s = ref.current;
    const wc = s.workCenters.find((w) => w.id === wcId)!;
    const seq = [...wc.sequence];
    const i = seq.indexOf(item);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= seq.length) return { ok: true };
    [seq[i], seq[j]] = [seq[j], seq[i]];
    commit({ ...s, workCenters: s.workCenters.map((w) => (w.id === wcId ? { ...w, sequence: seq } : w)) });
    return { ok: true };
  };
  const addCalendar = (c: Omit<CalendarException, 'id'>): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('MANAGER')) return fail('The factory calendar is kept by the Operations Manager');
    if (!c.date || !c.reason.trim()) return fail('Enter the date and reason');
    if (!(c.hours >= 0 && c.hours <= 24)) return fail('Hours must be 0–24');
    const s = ref.current;
    if (s.calendar.some((x) => x.date === c.date && (x.workCenterId ?? '') === (c.workCenterId ?? ''))) return fail('That date already has an exception');
    commit({ ...s, calendar: [...s.calendar, { ...c, id: uid('ce') }].sort((a, b) => a.date.localeCompare(b.date)) });
    trail('Calendar exception added', c.date, c.reason);
    return done('Calendar updated', `${c.date}: ${c.reason}`);
  };
  const removeCalendar = (id: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('MANAGER')) return fail('The factory calendar is kept by the Operations Manager');
    commit({ ...ref.current, calendar: ref.current.calendar.filter((c) => c.id !== id) });
    return { ok: true };
  };

  /* ================= Routings ================= */
  const routingProblems = (r: Routing) => {
    const s = ref.current;
    const out: string[] = [];
    if (!r.ops.length) out.push('Add at least one operation');
    const seqs = new Set<number>();
    for (const o of r.ops) {
      if (seqs.has(o.seq)) out.push(`Operation ${o.seq} appears twice`);
      seqs.add(o.seq);
      if (!o.name.trim()) out.push(`Operation ${o.seq} needs a name`);
      if (!s.workCenters.some((w) => w.id === o.workCenterId)) out.push(`Operation ${o.seq}: choose a work centre`);
      if (o.kind === 'SUBCONTRACT') {
        if (!o.supplierId) out.push(`Operation ${o.seq}: choose the subcontractor`);
        if (!((o.costPerUnit ?? 0) > 0)) out.push(`Operation ${o.seq}: enter the outside processing cost per unit`);
      } else if (!(o.runValue > 0)) out.push(`Operation ${o.seq}: enter the run time`);
      if (o.scrapPct < 0 || o.scrapPct >= 50) out.push(`Operation ${o.seq}: scrap must be 0–50%`);
      if (o.overlapPct < 0 || o.overlapPct > 90) out.push(`Operation ${o.seq}: overlap must be 0–90%`);
      for (const sp of o.spec ?? []) if (sp.min !== undefined && sp.max !== undefined && sp.min > sp.max) out.push(`Operation ${o.seq}: ${sp.parameter} minimum is above its maximum`);
    }
    return out;
  };
  const saveRouting = (r: Routing): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('Routings are maintained by Operations');
    const s = ref.current;
    const before = s.routings.find((x) => x.id === r.id);
    if (before && before.status !== 'DRAFT') return fail('Active and obsolete revisions are locked — start a new revision');
    const p = routingProblems(r);
    if (p.length) return fail(p[0]);
    const clean = { ...r, ops: [...r.ops].sort((a, b) => a.seq - b.seq).map((o) => ({ ...o, instructions: o.instructions.filter((x) => x.trim()) })) };
    commit({ ...s, routings: before ? s.routings.map((x) => (x.id === r.id ? { ...clean, history: [...x.history, log('Edited')] } : x)) : [{ ...clean, history: [log('Created')] }, ...s.routings] });
    return done('Routing saved', `${r.code} rev ${r.revision}`);
  };
  const nextRev = (rev: string) => (/^[A-Y]$/.test(rev) ? String.fromCharCode(rev.charCodeAt(0) + 1) : `${rev}1`);
  const newRevision = (id: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('Routings are maintained by Operations');
    const s = ref.current;
    const r = s.routings.find((x) => x.id === id)!;
    if (s.routings.some((x) => x.code === r.code && x.status === 'DRAFT')) return fail(`${r.code} already has a draft revision`);
    const latest = s.routings.filter((x) => x.code === r.code).reduce((a, x) => (x.version > a.version ? x : a), r);
    const nid = uid('rt');
    commit({ ...s, routings: [{ ...r, id: nid, revision: nextRev(latest.revision), version: latest.version + 1, status: 'DRAFT', effectiveFrom: TODAY, changeNote: '', history: [log('New revision', `from rev ${r.revision}`)] }, ...s.routings] });
    return done('Draft revision created', `${r.code} rev ${nextRev(latest.revision)}`, nid);
  };
  /** "Same as, except": copy a routing to another product or customer, optionally swapping a work centre. */
  const copyRouting = (id: string, c: { recipeId: string; code: string; forCustomerId?: string; replaceFrom?: string; replaceTo?: string }): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('Routings are maintained by Operations');
    const s = ref.current;
    const r = s.routings.find((x) => x.id === id)!;
    if (!c.code.trim()) return fail('Give the new routing a code');
    if (s.routings.some((x) => x.code === c.code.trim())) return fail(`${c.code} already exists`);
    const nid = uid('rt');
    const ops2 = r.ops.map((o) => (c.replaceFrom && o.workCenterId === c.replaceFrom && c.replaceTo ? { ...o, workCenterId: c.replaceTo } : { ...o }));
    commit({ ...s, routings: [{ ...r, id: nid, recipeId: c.recipeId, code: c.code.trim(), forCustomerId: c.forCustomerId || undefined, revision: 'A', version: 1, status: 'DRAFT', effectiveFrom: TODAY, ops: ops2, changeNote: `Copied from ${r.code} rev ${r.revision}`, history: [log('Copied', `Same as ${r.code} rev ${r.revision}${c.replaceFrom ? `, except ${c.replaceFrom} → ${c.replaceTo}` : ''}`)] }, ...s.routings] });
    return done('Routing copied', `${c.code} (draft)`, nid);
  };
  const activateRouting = (id: string, note: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('MANAGER')) return fail('Routings are activated by the Operations Manager');
    const s = ref.current;
    const r = s.routings.find((x) => x.id === id)!;
    if (r.status !== 'DRAFT') return fail('Only draft revisions can be activated');
    const p = routingProblems(r);
    if (p.length) return fail(p[0]);
    if (!note.trim()) return fail('Describe what changed in this revision');
    commit({
      ...s,
      routings: s.routings.map((x) =>
        x.id === id
          ? { ...x, status: 'ACTIVE', effectiveFrom: TODAY, changeNote: note, history: [...x.history, log(`Revision ${x.revision} activated`, note)] }
          : x.recipeId === r.recipeId && x.status === 'ACTIVE' && (x.forCustomerId ?? '') === (r.forCustomerId ?? '')
            ? { ...x, status: 'OBSOLETE', history: [...x.history, log(`Made obsolete by revision ${r.revision}`)] }
            : x
      )
    });
    trail('Routing activated', `${r.code} rev ${r.revision}`, note);
    return done('Routing active', `${r.code} rev ${r.revision} — new batches follow it`);
  };
  /** Replace a work centre in every operation of every live routing, or delete those operations, as new versions. */
  const massReplace = (fromWc: string, toWc: string, mode: 'REPLACE' | 'DELETE'): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('MANAGER')) return fail('Mass changes are made by the Operations Manager');
    const s = ref.current;
    if (mode === 'REPLACE' && (!toWc || toWc === fromWc)) return fail('Choose a different work centre to move to');
    const hit = s.routings.filter((r) => r.status !== 'OBSOLETE' && r.ops.some((o) => o.workCenterId === fromWc));
    if (!hit.length) return fail('No live routing uses that work centre');
    if (mode === 'DELETE' && hit.some((r) => r.ops.every((o) => o.workCenterId === fromWc))) return fail('That would leave a routing with no operations');
    commit({
      ...s,
      routings: s.routings.map((r) =>
        hit.includes(r)
          ? {
              ...r,
              version: r.version + 1,
              ops: mode === 'DELETE' ? r.ops.filter((o) => o.workCenterId !== fromWc) : r.ops.map((o) => (o.workCenterId === fromWc ? { ...o, workCenterId: toWc } : o)),
              history: [...r.history, log(mode === 'DELETE' ? `Operations on ${fromWc} deleted` : `Operations moved ${fromWc} → ${toWc}`, `version ${r.version + 1}`)]
            }
          : r
      )
    });
    trail(mode === 'DELETE' ? 'Mass delete of operations' : 'Mass replace of work centre', fromWc, `${hit.length} routings`);
    return done('Routings updated', `${hit.length} routings changed`);
  };

  /* ================= Costing and planning parameters ================= */
  const freezeStandard = (recipeId: string, opts: CostOptions): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('MANAGER')) return fail('Standard costs are set by the Operations Manager');
    const s = ref.current;
    const recipe = recipeOf(recipeId)!;
    const routing = activeRouting(s.routings, recipeId);
    const rollup = rollUpCost(recipe, routing, s.workCenters, products, s.params.find((p) => p.recipeId === recipeId), recipe.batchSize, opts);
    const old = standardPerUnit(s, recipe, products);
    commit({ ...s, standardCosts: [{ recipeId, routingId: routing?.id, at: now(), by: actor.name, qty: recipe.batchSize, perUnit: rollup.perUnit, rollup, opts }, ...s.standardCosts] });
    audit({ module: 'Production', by: actor.name, ref: recipe.product, action: 'Standard cost set', field: 'perUnit', before: String(old.perUnit), after: String(rollup.perUnit) });
    return done('Standard cost set', `${recipe.name}: ${rollup.perUnit.toLocaleString()} KES per unit`);
  };
  const saveParams = (p: PlanParams): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('MANAGER', 'OFFICER')) return fail('Planning parameters are kept by Operations');
    if (!(p.minBatch > 0) || p.maxBatch < p.minBatch) return fail('Maximum batch must be at least the minimum');
    if (!(p.orderMultiple >= 1)) return fail('Order multiple must be at least 1');
    if (p.minBatch % p.orderMultiple !== 0) return fail('Minimum batch must be a multiple of the order multiple');
    if (p.ptfDays > p.dtfDays) return fail('The planning time fence cannot be beyond the demand time fence');
    if (!(p.expectedYieldPct > 50 && p.expectedYieldPct <= 100)) return fail('Expected yield must be 50–100%');
    if (p.safetyStock < 0) return fail('Safety stock cannot be negative');
    const s = ref.current;
    const before = s.params.find((x) => x.recipeId === p.recipeId);
    if (before) auditChanges('Production', actor.name, p.recipeId, before, p);
    commit({ ...s, params: s.params.map((x) => (x.recipeId === p.recipeId ? p : x)) });
    return done('Planning parameters saved', recipeOf(p.recipeId)?.name ?? p.recipeId);
  };
  const saveForecast = (f: Forecast): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('MANAGER', 'OFFICER')) return fail('Forecasts are kept by Operations');
    if (f.qty < 0 || !(f.seasonalIndex > 0 && f.seasonalIndex <= 3)) return fail('Quantity cannot be negative and the seasonal index is 0–3');
    const s = ref.current;
    const has = s.forecasts.some((x) => x.sku === f.sku && x.month === f.month);
    commit({ ...s, forecasts: has ? s.forecasts.map((x) => (x.sku === f.sku && x.month === f.month ? f : x)) : [...s.forecasts, f] });
    return { ok: true };
  };

  /* ================= Batches (work orders) ================= */
  /** Plans a batch after checking batch size, multiples and the planning time fence. */
  const planBatch = (recipeId: string, qty: number, date: string, forOrder?: string, extra: Partial<BatchExt> = {}): Result => {
    const ro = readOnly();
    if (ro) return ro;
    const s = ref.current;
    const p = s.params.find((x) => x.recipeId === recipeId);
    if (p) {
      if (qty < p.minBatch || qty > p.maxBatch) return fail(`Batch size for this product is ${p.minBatch}–${p.maxBatch}`);
      if (qty % p.orderMultiple !== 0) return fail(`Plan in multiples of ${p.orderMultiple} (try ${Math.ceil(qty / p.orderMultiple) * p.orderMultiple})`);
      if (daysBetween(TODAY, date) < p.ptfDays && !is('MANAGER')) return fail(`Inside the ${p.ptfDays}-day planning time fence the schedule is frozen — only the Operations Manager can add batches`);
    }
    const res = ops.planBatch(recipeId, qty, date, forOrder);
    if (!res.ok || !res.id) return res;
    const order = forOrder ? commercial.snapshot().orders.find((o) => o.number === forOrder) : undefined;
    const routing = activeRouting(ref.current.routings, recipeId, order?.customerId);
    commit(setExt(ref.current, res.id, { routingId: routing?.id, ...extra }, 'Planned', routing ? `Routing ${routing.code} rev ${routing.revision}` : undefined));
    return res;
  };
  /**
   * Release allocates what the batch needs: materials on hand are reserved so no other batch can promise them,
   * blended tea that is short is raised as a child blendsheet (multi-level), and subcontract operations get a
   * purchase order and a dispatch note.
   */
  const releaseBatch = (id: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    const s = ref.current;
    const b = batchOf(id)!;
    if (b.status !== 'PLANNED') return fail('Only planned batches can be released');
    if (!is('MANAGER')) return fail('Batches are released by the Operations Manager');
    const recipe = recipeOf(b.recipeId)!;
    const need = materialNeed(recipe, b.plannedQty);
    const reservedElsewhere = (sku: string) => Object.values(s.ext).filter((e) => e.batchId !== id).reduce((a, e) => a + e.reserved.filter((r) => r.sku === sku).reduce((x, r) => x + r.qty, 0), 0);
    const reserve: { sku: string; qty: number }[] = [];
    let childKg = 0;
    for (const n of need) {
      const avail = round2((products.find((p) => p.sku === n.sku)?.stock ?? 0) - reservedElsewhere(n.sku));
      if (avail >= n.qty) reserve.push(n);
      else if (n.sku === 'RAW-A') {
        if (avail > 0) reserve.push({ sku: n.sku, qty: avail });
        childKg = Math.ceil(((n.qty - Math.max(0, avail)) * 1000) / 100) * 100;
      } else return fail(`${products.find((p) => p.sku === n.sku)?.name ?? n.sku}: ${Math.max(0, avail)} free after other released batches, ${n.qty} needed — raise a requisition from Planning`);
    }
    const routing = (extOf(s, id).routingId && s.routings.find((r) => r.id === extOf(s, id).routingId)) || activeRouting(s.routings, b.recipeId);
    const sub = routing?.ops.filter((o) => o.kind === 'SUBCONTRACT') ?? [];
    if (childKg && !proposeLines(s, 'std-house', Math.max(100, childKg))) return fail(`Blended tea is short by ${childKg.toLocaleString()} kg and free tea lots cannot cover a blend — buy at auction first`);
    const res = ops.releaseBatch(id);
    if (!res.ok) return res;
    let childId: string | undefined;
    if (childKg) {
      const c = createBlendsheet({ standardId: 'std-house', plant: childKg >= 2_000 ? 'TOWER' : 'DRUM', targetKg: Math.max(100, childKg), date: nextWorkingDay(s.workCenters.find((w) => w.kind === (childKg >= 2_000 ? 'TOWER' : 'DRUM')), TODAY, s.calendar), due: addDays(b.date, -1) < TODAY ? TODAY : addDays(b.date, -1), parentBatchId: id, note: `Short blended tea for ${b.number}` }, true);
      childId = c.ok ? c.id : undefined;
      if (childId) {
        const sNow = ref.current;
        commit({ ...sNow, blendsheets: sNow.blendsheets.map((x) => (x.id === childId ? { ...x, preparedBy: actor.name } : x)) });
      }
    }
    const scIds: string[] = [];
    let s2 = ref.current;
    for (const o of sub) {
      const qty = b.plannedQty;
      const po = commercial.savePO({ supplierId: o.supplierId!, expected: addDays(TODAY, 3), notes: `Outside processing for ${b.number} — ${o.name}`, lines: [{ id: uid('l'), sku: '', description: `${o.name} — ${b.number} (${qty} units)`, qty, price: o.costPerUnit ?? 0, discountPct: 0 }] });
      const poRec = po.ok && po.id ? commercial.snapshot().purchaseOrders.find((x) => x.id === po.id) : undefined;
      const sc = next(s2, 'SCO');
      const dn = next({ ...s2, sequence: sc.sequence }, 'DN');
      const scId = uid('sc');
      scIds.push(scId);
      s2 = { ...s2, sequence: dn.sequence, subcontracts: [{ id: scId, number: sc.number, batchId: id, batchNumber: b.number, opName: o.name, supplierId: o.supplierId!, qty, cost: round2(qty * (o.costPerUnit ?? 0)), poId: poRec?.id, poNumber: poRec?.number, dispatchNote: dn.number, status: 'SENT', at: now() }, ...s2.subcontracts] };
      tell(commercial.party(o.supplierId!)?.name ?? 'Subcontractor', `Outside processing order ${poRec?.number ?? sc.number}`, b.number, `${o.name}: ${qty} units, dispatch note ${dn.number}`);
    }
    const e = extOf(s2, id);
    commit(setExt(s2, id, { reserved: reserve, routingId: routing?.id ?? e.routingId, subcontractIds: [...e.subcontractIds, ...scIds] }, 'Materials allocated on release', [reserve.map((r) => `${r.sku} ${r.qty}`).join(', '), childId ? `child blend for ${childKg} kg` : '', scIds.length ? `${scIds.length} subcontract PO` : ''].filter(Boolean).join(' · ')));
    if (childKg) addToast({ type: 'info', title: 'Child blendsheet raised', message: `${childKg.toLocaleString()} kg of blended tea is short — a draft blendsheet was raised for ${b.number}` });
    if (scIds.length) addToast({ type: 'info', title: 'Subcontract purchase order raised', message: `${scIds.length} outside-processing PO sent to Procurement for approval` });
    return res;
  };
  const startBatch = (id: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    const b = batchOf(id)!;
    const res = ops.startBatch(id);
    if (!res.ok) return res;
    const recipe = recipeOf(b.recipeId)!;
    const value = round2(materialNeed(recipe, b.plannedQty).reduce((a, n) => a + n.qty * cost(n.sku), 0));
    const jid = postJournal(`${b.number} materials issued`, [
      { account: '1200', description: `Work in process — ${b.number}`, debit: value, credit: 0 },
      { account: '1200', description: 'Raw and packing materials issued', debit: 0, credit: value }
    ]);
    const e = extOf(ref.current, id);
    commit(setExt(ref.current, id, { reserved: [], startedAt: now(), journalIds: jid ? [...e.journalIds, jid] : e.journalIds }, 'Started — allocation converted to issue'));
    return res;
  };
  const pauseBatch = (id: string, reason: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('The Operations Officer records stoppages');
    if (!reason.trim()) return fail('Say why the line stopped');
    const b = batchOf(id)!;
    if (b.status !== 'IN_PROGRESS') return fail('Only running batches can be paused');
    const e = extOf(ref.current, id);
    if (e.stops.some((x) => !x.to)) return fail('The batch is already paused');
    commit(setExt(ref.current, id, { stops: [...e.stops, { from: now(), reason }] }, 'Paused', reason));
    return done('Batch paused', `${b.number}: ${reason}`);
  };
  const resumeBatch = (id: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('The Operations Officer restarts the line');
    const e = extOf(ref.current, id);
    if (!e.stops.some((x) => !x.to)) return fail('The batch is not paused');
    commit(setExt(ref.current, id, { stops: e.stops.map((x) => (x.to ? x : { ...x, to: now() })) }, 'Resumed'));
    return done('Batch resumed', batchOf(id)?.number ?? '');
  };
  const sendToQc = (id: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    const e = extOf(ref.current, id);
    if (e.stops.some((x) => !x.to)) return fail('Resume the batch before finishing the run');
    const res = ops.sendToQc(id);
    if (!res.ok) return res;
    commit(setExt(ref.current, id, { finishedAt: now() }, 'Run finished'));
    return res;
  };
  /** Numeric inspection limits on the routing decide pass or fail, whatever is picked by hand. */
  const evaluateChecks = (batchId: string, checks: QualityCheck[]) => {
    const s = ref.current;
    const routing = s.routings.find((r) => r.id === extOf(s, batchId).routingId);
    const spec = routing?.ops.find((o) => o.kind === 'INSPECTION')?.spec ?? [];
    return checks.map((c) => {
      const sp = spec.find((x) => c.parameter.toLowerCase().startsWith(x.parameter.toLowerCase()));
      if (!sp) return c;
      const v = parseFloat(c.result.replace(',', '.'));
      if (Number.isNaN(v)) return { ...c, pass: false };
      return { ...c, pass: (sp.min === undefined || v >= sp.min) && (sp.max === undefined || v <= sp.max) };
    });
  };
  const recordQc = (id: string, checksIn: QualityCheck[], rejectedQty: number): Result => {
    const ro = readOnly();
    if (ro) return ro;
    const s = ref.current;
    const b = batchOf(id)!;
    const checks = evaluateChecks(id, checksIn);
    const bad = checks.find((c) => !c.pass && checksIn.find((x) => x.parameter === c.parameter)?.pass && Number.isNaN(parseFloat(c.result)));
    if (bad) return fail(`${bad.parameter}: enter the measured number`);
    const res = ops.recordQc(id, checks, rejectedQty);
    if (!res.ok) return res;
    const pass = checks.every((c) => c.pass);
    const recipe = recipeOf(b.recipeId)!;
    const e = extOf(ref.current, id);
    const material = batchCost(b, products) || round2(materialNeed(recipe, b.plannedQty).reduce((a, n) => a + n.qty * cost(n.sku), 0));
    const conv = actualConversion(e, s.workCenters);
    if (!pass) {
      const jid = postJournal(`${b.number} failed QC — written off`, [
        { account: '5000', description: `Production loss — ${b.number} quarantined`, debit: material + conv.labour + conv.overhead, credit: 0 },
        { account: '1200', description: `Work in process — ${b.number}`, debit: 0, credit: material },
        { account: '6000', description: 'Labour absorbed', debit: 0, credit: conv.labour },
        { account: '6200', description: 'Overhead absorbed', debit: 0, credit: conv.overhead }
      ]);
      commit(setExt(ref.current, id, { journalIds: jid ? [...e.journalIds, jid] : e.journalIds }, 'Written off after failed QC', 'Rework or disposal decision needed'));
      tell('Esther Muthoni (Operations Manager)', `${b.number} failed quality and was written off`, b.number, checks.filter((c) => !c.pass).map((c) => `${c.parameter}: ${c.result}`).join('; '), 'critical');
      return res;
    }
    const output = b.plannedQty - rejectedQty;
    const std = standardPerUnit(s, recipe, products);
    const fg = round2(std.perUnit * output);
    const routing = s.routings.find((r) => r.id === e.routingId);
    const inputKg = materialNeed(recipe, b.plannedQty).filter((n) => n.sku === 'RAW-A').reduce((a, n) => a + n.qty * 1000, 0);
    const byProducts = (routing?.byProducts ?? []).map((x) => ({ name: x.name, qty: round2((inputKg * x.pctOfInput) / 100), value: round2(((inputKg * x.pctOfInput) / 100) * x.valuePerUnit) })).filter((x) => x.qty > 0);
    const co = (routing?.coProducts ?? []).filter((x) => x.sku).map((x) => ({ sku: x.sku!, qty: Math.floor((output * x.pctOfOutput) / 100) })).filter((x) => x.qty > 0);
    if (co.length) commercial.adjustStock(co.map((x) => ({ sku: x.sku, delta: x.qty })));
    const coValue = round2(co.reduce((a, x) => a + x.qty * cost(x.sku), 0));
    const byValue = round2(byProducts.reduce((a, x) => a + x.value, 0));
    const actual = material + conv.labour + conv.overhead;
    const variance = round2(actual - fg - byValue - coValue);
    const jid = postJournal(`${b.number} completed — ${output} × ${recipe.product}`, [
      { account: '1200', description: `Finished goods ${recipe.product} at standard (${std.perUnit.toLocaleString()}/unit)`, debit: fg, credit: 0 },
      { account: '1200', description: 'By- and co-products', debit: byValue + coValue, credit: 0 },
      { account: '5000', description: 'Production variance (actual less standard)', debit: variance > 0 ? variance : 0, credit: variance < 0 ? -variance : 0 },
      { account: '1200', description: `Work in process — ${b.number}`, debit: 0, credit: material },
      { account: '6000', description: 'Labour absorbed', debit: 0, credit: conv.labour },
      { account: '6200', description: 'Overhead absorbed', debit: 0, credit: conv.overhead }
    ]);
    const order = b.forOrder ? commercial.snapshot().orders.find((o) => o.number === b.forOrder) : undefined;
    const outstanding = order ? order.lines.filter((l) => l.sku === recipe.product).reduce((a, l) => a + Math.max(0, l.qty - l.delivered), 0) : 0;
    const allocatedOrder = order && outstanding > 0 ? { orderNumber: order.number, qty: Math.min(output, outstanding) } : undefined;
    let s2 = setExt(ref.current, id, { journalIds: jid ? [...e.journalIds, jid] : e.journalIds, allocatedOrder, byProducts: [...byProducts.map((x) => ({ name: x.name, qty: x.qty })), ...co.map((x) => ({ name: x.sku, qty: x.qty }))] }, 'Completed and costed', allocatedOrder ? `${allocatedOrder.qty} allocated to ${allocatedOrder.orderNumber}` : undefined);
    s2 = { ...s2, moves: [...byProducts.map((x) => ({ id: uid('pm'), date: TODAY, item: x.name, qty: x.qty, unit: 'kg', kind: 'BY_PRODUCT' as const, ref: b.number, by: actor.name })), ...s2.moves] };
    commit(s2);
    if (allocatedOrder) tell(`${commercial.party(order!.customerId)?.name ?? 'Customer'} account manager`, `${allocatedOrder.qty} × ${recipe.name} ready for ${order!.number}`, order!.number, `Allocated from ${b.number} — schedule the delivery`);
    return res;
  };
  const cancelBatch = (id: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    const b = batchOf(id)!;
    const p = ref.current.params.find((x) => x.recipeId === b.recipeId);
    const date = extOf(ref.current, id).pinDate ?? b.date;
    if (p && daysBetween(TODAY, date) < p.ptfDays && !is('MANAGER')) return fail(`${b.number} is inside the ${p.ptfDays}-day planning time fence — only the Operations Manager can cancel it`);
    const res = ops.cancelBatch(id);
    if (!res.ok) return res;
    commit(setExt(ref.current, id, { reserved: [] }, 'Cancelled — allocation released'));
    return res;
  };
  const recordLabour = (batchId: string, employee: string, hours: number, workCenterId: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('The Operations Officer books labour to batches');
    const b = batchOf(batchId)!;
    if (!['IN_PROGRESS', 'QC', 'COMPLETED'].includes(b.status)) return fail('Hours are booked once the batch has started');
    if (!employee.trim()) return fail('Choose who worked');
    if (!(hours > 0 && hours <= 16)) return fail('Hours must be between 0 and 16 for one entry');
    if (!ref.current.workCenters.some((w) => w.id === workCenterId)) return fail('Choose the work centre');
    const e = extOf(ref.current, batchId);
    const entry: LabourEntry = { id: uid('lb'), employee, hours, workCenterId, date: TODAY, by: actor.name };
    commit(setExt(ref.current, batchId, { labour: [...e.labour, entry] }, 'Labour booked', `${employee} · ${hours} h`));
    const wc = ref.current.workCenters.find((w) => w.id === workCenterId);
    if (wc?.hazard) {
      const month = TODAY.slice(0, 7);
      const total = [...Object.values(ref.current.ext).flatMap((x) => x.labour), ...ref.current.blendsheets.flatMap((x) => x.labour)].filter((l) => l.employee === employee && l.date.slice(0, 7) === month && ref.current.workCenters.find((w) => w.id === l.workCenterId)?.hazard).reduce((a, l) => a + l.hours, 0);
      if (total > wc.hazard.monthlyLimitHrs) tell('OSH Officer', `${employee} over the ${wc.hazard.agent.toLowerCase()} exposure limit`, b.number, `${total} h this month against ${wc.hazard.monthlyLimitHrs} h — rotate and refer for a medical`, 'warning');
    }
    return done('Labour booked', `${employee}: ${hours} h on ${b.number}`);
  };
  /** Re-work a rejected batch: extra materials and hours are costed, recovered units go back into stock. */
  const reworkBatch = (id: string, r: { hours: number; extra: { sku: string; qty: number }[]; recovered: number; note: string }): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'MANAGER')) return fail('Rework is organised by the Operations Officer or Manager');
    const b = batchOf(id)!;
    if (b.status !== 'REJECTED') return fail('Only batches that failed quality can be re-worked');
    const e = extOf(ref.current, id);
    if (e.rework) return fail('This batch has already been re-worked');
    if (!(r.hours > 0)) return fail('Enter the rework hours');
    if (r.recovered < 0 || r.recovered > b.plannedQty) return fail(`Recovered quantity must be 0–${b.plannedQty}`);
    if (!r.note.trim()) return fail('Describe the rework done');
    const recipe = recipeOf(b.recipeId)!;
    const extra = r.extra.filter((x) => x.sku && x.qty > 0);
    const moves = [...extra.map((x) => ({ sku: x.sku, delta: -x.qty })), ...(r.recovered ? [{ sku: recipe.product, delta: r.recovered }] : [])];
    if (moves.length) {
      const res = commercial.adjustStock(moves);
      if (!res.ok) return res;
    }
    const wc = ref.current.workCenters.find((w) => w.id === (e.workCenterId ?? 'WC-PK1'));
    const labour = round2(r.hours * ((wc?.labourDirectRate ?? 380) + (wc?.labourIndirectRate ?? 120)));
    const extraCost = round2(extra.reduce((a, x) => a + x.qty * cost(x.sku), 0));
    const recoveredValue = round2(standardPerUnit(ref.current, recipe, products).perUnit * r.recovered);
    const jid = postJournal(`${b.number} re-worked — ${r.recovered} recovered`, [
      { account: '1200', description: `Finished goods recovered by rework (${r.recovered})`, debit: recoveredValue, credit: 0 },
      { account: '5000', description: 'Rework cost', debit: labour + extraCost, credit: 0 },
      { account: '5000', description: 'Write-off recovered', debit: 0, credit: recoveredValue },
      { account: '6000', description: 'Rework labour absorbed', debit: 0, credit: labour },
      { account: '1200', description: 'Extra materials issued to rework', debit: 0, credit: extraCost }
    ]);
    let s2 = setExt(ref.current, id, { rework: { hours: r.hours, extra, recovered: r.recovered, cost: round2(labour + extraCost), at: now(), by: actor.name, note: r.note }, journalIds: jid ? [...e.journalIds, jid] : e.journalIds }, 'Re-worked', `${r.recovered} recovered · cost ${round2(labour + extraCost).toLocaleString()} KES`);
    s2 = { ...s2, moves: [...extra.map((x) => ({ id: uid('pm'), date: TODAY, item: x.sku, qty: -x.qty, unit: products.find((p) => p.sku === x.sku)?.unit ?? '', kind: 'REWORK_ISSUE' as const, ref: b.number, by: actor.name })), ...(r.recovered ? [{ id: uid('pm'), date: TODAY, item: recipe.product, qty: r.recovered, unit: 'units', kind: 'REWORK_OUTPUT' as const, ref: b.number, by: actor.name }] : []), ...s2.moves] };
    commit(s2);
    trail('Batch re-worked', b.number, r.note);
    return done('Rework recorded', `${r.recovered} × ${recipe.name} back into stock · rework cost ${round2(labour + extraCost).toLocaleString()} KES`);
  };
  /** Take finished units apart again: the blended tea goes back to stock and the packaging is written off. */
  const disassembleBatch = (id: string, qty: number, reason: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('MANAGER')) return fail('Disassembly is authorised by the Operations Manager');
    const b = batchOf(id)!;
    if (b.status !== 'COMPLETED') return fail('Only completed batches can be disassembled');
    const e = extOf(ref.current, id);
    const left = b.output - (e.disassembled ?? 0);
    if (!(qty > 0 && qty <= left)) return fail(`Choose 1–${left} units`);
    if (!reason.trim()) return fail('Say why the units are being taken apart');
    const recipe = recipeOf(b.recipeId)!;
    const back = materialNeed(recipe, qty).filter((n) => n.sku === 'RAW-A');
    const res = commercial.adjustStock([{ sku: recipe.product, delta: -qty }, ...back.map((n) => ({ sku: n.sku, delta: n.qty }))]);
    if (!res.ok) return res;
    const fgValue = round2(standardPerUnit(ref.current, recipe, products).perUnit * qty);
    const rawValue = round2(back.reduce((a, n) => a + n.qty * cost(n.sku), 0));
    const jid = postJournal(`${b.number} disassembled — ${qty} units`, [
      { account: '1200', description: 'Blended tea returned to stock', debit: rawValue, credit: 0 },
      { account: '5000', description: 'Packaging and labour written off on disassembly', debit: Math.max(0, fgValue - rawValue), credit: Math.max(0, rawValue - fgValue) },
      { account: '1200', description: `Finished goods ${recipe.product} taken apart`, debit: 0, credit: fgValue }
    ]);
    let s2 = setExt(ref.current, id, { disassembled: (e.disassembled ?? 0) + qty, journalIds: jid ? [...e.journalIds, jid] : e.journalIds }, `Disassembled ${qty} units`, reason);
    s2 = { ...s2, moves: [{ id: uid('pm'), date: TODAY, item: recipe.product, qty: -qty, unit: 'units', kind: 'DISASSEMBLY', ref: b.number, by: actor.name }, ...back.map((n) => ({ id: uid('pm'), date: TODAY, item: n.sku, qty: n.qty, unit: 'tonnes', kind: 'DISASSEMBLY' as const, ref: b.number, by: actor.name })), ...s2.moves] };
    commit(s2);
    trail('Batch disassembled', b.number, reason);
    return done('Disassembled', `${qty} units taken apart — ${back.map((n) => `${n.qty} t blended tea`).join(', ') || 'packaging written off'}`);
  };
  /** Pack a completed blend: plans a packing batch linked to it (process blend → discrete pack). */
  const packFromBlend = (bsId: string, recipeId: string, qty: number, date: string): Result => {
    const b = ref.current.blendsheets.find((x) => x.id === bsId)!;
    if (b.status !== 'COMPLETED' && b.status !== 'IN_PROGRESS') return fail('Pack from a blend once it is running or complete');
    return planBatch(recipeId, qty, date, b.orderNumber, { blendsheetId: bsId });
  };

  /* ================= Scheduling ================= */
  const canPlan = () => is('OFFICER', 'MANAGER');
  const rescheduleJob = (jobId: string, date: string, wcId?: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!canPlan()) return fail('The schedule is changed by the Operations Officer or Manager');
    if (!date) return fail('Choose the new date');
    if (date < TODAY) return fail('Cannot schedule into the past');
    const s = ref.current;
    const bs = s.blendsheets.find((x) => x.id === jobId);
    if (bs) {
      if (!['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'].includes(bs.status)) return fail('A blend that is running cannot be moved');
      const wc = wcId ? s.workCenters.find((w) => w.id === wcId) : undefined;
      if (wc && wc.kind !== 'TOWER' && wc.kind !== 'DRUM') return fail('A blend can only move to a tower or drum plant');
      updateBs(jobId, { date, due: bs.due < date ? date : bs.due, workCenterId: wc?.id ?? bs.workCenterId, plant: (wc?.kind as 'TOWER' | 'DRUM') ?? bs.plant }, 'Rescheduled', `${date}${wc ? ` on ${wc.name}` : ''}`);
      return done('Rescheduled', `${bs.number} → ${date}`);
    }
    const b = batchOf(jobId);
    if (!b) return fail('Job not found');
    if (!['PLANNED', 'RELEASED'].includes(b.status)) return fail('Only planned or released batches can be moved');
    const p = s.params.find((x) => x.recipeId === b.recipeId);
    const cur = extOf(s, jobId).pinDate ?? b.date;
    if (p && (daysBetween(TODAY, cur) < p.ptfDays || daysBetween(TODAY, date) < p.ptfDays) && !is('MANAGER')) return fail(`Inside the ${p.ptfDays}-day planning time fence only the Operations Manager can move batches`);
    if (wcId) {
      const wc = s.workCenters.find((w) => w.id === wcId);
      if (!wc || wc.kind !== 'PACKING') return fail('A packing batch can only move to another packing line');
    }
    commit(setExt(s, jobId, { pinDate: date, ...(wcId ? { workCenterId: wcId } : {}) }, 'Rescheduled', `${cur} → ${date}${wcId ? ` on ${wcId}` : ''}`));
    return done('Rescheduled', `${b.number} → ${date}`);
  };
  const shiftJobs = (filter: (kind: 'BATCH' | 'BLEND', id: string) => boolean, days: number, toWc: string | undefined, label: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!canPlan()) return fail('The schedule is changed by the Operations Officer or Manager');
    if (!Number.isInteger(days) || Math.abs(days) > 60) return fail('Shift by up to 60 days');
    let s = ref.current;
    let n = 0;
    let skipped = 0;
    for (const b of ops.state.batches.filter((x) => ['PLANNED', 'RELEASED'].includes(x.status) && filter('BATCH', x.id))) {
      const cur = extOf(s, b.id).pinDate ?? b.date;
      const to = addDays(cur, days);
      const p = s.params.find((x) => x.recipeId === b.recipeId);
      if (to < TODAY || (p && (daysBetween(TODAY, cur) < p.ptfDays || daysBetween(TODAY, to) < p.ptfDays) && !is('MANAGER'))) {
        skipped++;
        continue;
      }
      s = setExt(s, b.id, { pinDate: to, ...(toWc ? { workCenterId: toWc } : {}) }, label, `${cur} → ${to}`);
      n++;
    }
    s = {
      ...s,
      blendsheets: s.blendsheets.map((x) => {
        if (!['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'].includes(x.status) || !filter('BLEND', x.id)) return x;
        const to = addDays(x.date, days);
        if (to < TODAY) {
          skipped++;
          return x;
        }
        n++;
        return { ...x, date: to, due: x.due < to ? to : x.due, history: [...x.history, log(label, `${x.date} → ${to}`)] };
      })
    };
    commit(s);
    return done('Schedule shifted', `${n} jobs moved${skipped ? ` · ${skipped} skipped (time fence or past)` : ''}`);
  };
  const packWc = (batchId: string) => {
    const s = ref.current;
    const e = extOf(s, batchId);
    if (e.workCenterId) return e.workCenterId;
    const b = batchOf(batchId);
    const r = (e.routingId && s.routings.find((x) => x.id === e.routingId)) || (b ? activeRouting(s.routings, b.recipeId) : undefined);
    return r?.ops.find((o) => o.kind === 'PACKING')?.workCenterId ?? '';
  };
  const usesWc = (batchId: string, wcId: string) => {
    const s = ref.current;
    const b = batchOf(batchId);
    const r = (extOf(s, batchId).routingId && s.routings.find((x) => x.id === extOf(s, batchId).routingId)) || (b ? activeRouting(s.routings, b.recipeId) : undefined);
    return packWc(batchId) === wcId || !!r?.ops.some((o) => o.workCenterId === wcId && o.kind !== 'PACKING');
  };
  const rescheduleByWorkCenter = (wcId: string, days: number, toWc?: string): Result => {
    const wc = ref.current.workCenters.find((w) => w.id === wcId);
    const to = toWc ? ref.current.workCenters.find((w) => w.id === toWc) : undefined;
    if (to && wc && to.kind !== wc.kind) return fail(`${to.name} is not the same kind of work centre`);
    return shiftJobs((k, id) => (k === 'BATCH' ? usesWc(id, wcId) : ref.current.blendsheets.find((b) => b.id === id)?.workCenterId === wcId), days, to?.kind === 'PACKING' ? toWc : undefined, `Rescheduled with ${wc?.name}`);
  };
  const rescheduleByCategory = (category: string, days: number): Result =>
    shiftJobs((k, id) => {
      if (k === 'BLEND') return category === 'Blending';
      const b = batchOf(id);
      const r = b && recipeOf(b.recipeId);
      return !!r && products.find((p) => p.sku === r.product)?.category === category;
    }, days, undefined, `Rescheduled with ${category}`);
  /** Planned work whose date has passed rolls to the next working day. */
  const rollForward = (): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!canPlan()) return fail('The schedule is changed by the Operations Officer or Manager');
    let s = ref.current;
    let n = 0;
    for (const b of ops.state.batches.filter((x) => ['PLANNED', 'RELEASED'].includes(x.status))) {
      const cur = extOf(s, b.id).pinDate ?? b.date;
      if (cur >= TODAY) continue;
      const wc = s.workCenters.find((w) => w.id === packWc(b.id));
      const to = nextWorkingDay(wc, TODAY, s.calendar);
      s = setExt(s, b.id, { pinDate: to }, 'Rolled forward', `Not run on ${cur}`);
      n++;
    }
    s = {
      ...s,
      blendsheets: s.blendsheets.map((x) => {
        if (!['DRAFT', 'SUBMITTED', 'APPROVED'].includes(x.status) || x.date >= TODAY) return x;
        n++;
        const to = nextWorkingDay(s.workCenters.find((w) => w.id === x.workCenterId), TODAY, s.calendar);
        return { ...x, date: to, due: x.due < to ? to : x.due, history: [...x.history, log('Rolled forward', `Not run on ${x.date}`)] };
      })
    };
    commit(s);
    return done('Rolled forward', n ? `${n} unfinished jobs moved to the next working day` : 'Nothing overdue to roll');
  };
  /** Merge planned batches of the same product into one batch (within the maximum batch size). */
  const mergeBatches = (ids: string[]): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!canPlan()) return fail('Batches are merged by the Operations Officer or Manager');
    const list = ids.map((i) => batchOf(i)!).filter(Boolean);
    if (list.length < 2) return fail('Choose at least two batches');
    if (list.some((b) => b.status !== 'PLANNED')) return fail('Only planned batches can be merged');
    if (new Set(list.map((b) => b.recipeId)).size > 1) return fail('Batches must be for the same product');
    const qty = list.reduce((a, b) => a + b.plannedQty, 0);
    const p = ref.current.params.find((x) => x.recipeId === list[0].recipeId);
    if (p && qty > p.maxBatch) return fail(`Together they make ${qty} — above the ${p.maxBatch} maximum batch`);
    const date = list.map((b) => extOf(ref.current, b.id).pinDate ?? b.date).sort()[0];
    const r = planBatch(list[0].recipeId, qty, date < TODAY ? TODAY : date, list[0].forOrder);
    if (!r.ok) return r;
    for (const b of list) cancelBatch(b.id);
    commit(setExt(ref.current, r.id!, {}, 'Merged', list.map((b) => b.number).join(' + ')));
    return done('Batches merged', `${list.length} batches → one batch of ${qty}`, r.id);
  };
  /** Rate-based repetitive schedule: one batch per working day at a fixed daily rate. */
  const createRateSchedule = (d: { recipeId: string; workCenterId: string; qtyPerDay: number; from: string; to: string }): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('MANAGER', 'OFFICER')) return fail('Repetitive schedules are set by Operations');
    const s = ref.current;
    if (!(d.qtyPerDay > 0)) return fail('Enter the daily rate');
    if (d.to < d.from || d.from < TODAY) return fail('Choose a date range from today');
    if (daysBetween(d.from, d.to) > 13) return fail('A repetitive schedule covers at most two weeks at a time');
    const wc = s.workCenters.find((w) => w.id === d.workCenterId);
    if (!wc) return fail('Choose the line');
    const days: string[] = [];
    for (let x = d.from; x <= d.to; x = addDays(x, 1)) if (hoursOn(wc, x, s.calendar) > 0) days.push(x);
    if (!days.length) return fail('The line does not work on any day in that range');
    const ids: string[] = [];
    for (const day of days) {
      const r = planBatch(d.recipeId, d.qtyPerDay, day, undefined, { workCenterId: d.workCenterId });
      if (!r.ok) {
        for (const id of ids) ops.cancelBatch(id);
        return r;
      }
      ids.push(r.id!);
    }
    const rid = uid('rs');
    commit({ ...ref.current, rates: [{ id: rid, ...d, batchIds: ids, by: actor.name }, ...ref.current.rates] });
    return done('Repetitive schedule created', `${ids.length} daily batches of ${d.qtyPerDay}`, rid);
  };
  /** Multi-line production work order: one header, one batch per line. */
  const createProdOrder = (lines: { recipeId: string; qty: number }[], date: string, forOrder: string | undefined, notes: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!canPlan()) return fail('Work orders are raised by the Operations Officer or Manager');
    const ls = lines.filter((l) => l.recipeId && l.qty > 0);
    if (ls.length < 1) return fail('Add at least one line');
    const made: { recipeId: string; qty: number; batchId: string }[] = [];
    for (const l of ls) {
      const r = planBatch(l.recipeId, l.qty, date, forOrder);
      if (!r.ok) {
        for (const m of made) ops.cancelBatch(m.batchId);
        return r;
      }
      made.push({ ...l, batchId: r.id! });
    }
    const s = ref.current;
    const { number, sequence } = next(s, 'PWO');
    const id = uid('pw');
    let s2: BlendingState = { ...s, sequence, prodOrders: [{ id, number, date, forOrder, lines: made, createdBy: actor.name, notes }, ...s.prodOrders] };
    for (const m of made) s2 = setExt(s2, m.batchId, { workOrderId: id }, `On work order ${number}`);
    commit(s2);
    return done('Work order raised', `${number} · ${made.length} lines`, id);
  };
  const raiseRequisition = (sku: string, qty: number, neededBy: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('OFFICER', 'STOREKEEPER', 'MANAGER')) return fail('Requisitions are raised by Operations or Stores');
    const p = products.find((x) => x.sku === sku);
    if (!p) return fail('Tea grades are bought at the Mombasa auction — raise a buying instruction with the broker');
    if (!(qty > 0)) return fail('Nothing to order');
    return commercial.saveRequisition({ department: 'Operations', requestedBy: `${actor.name} (MRP)`, neededBy, justification: `MRP net requirement for planned production — ${qty} ${p.unit} of ${p.name}`, lines: [{ id: uid('rl'), sku, description: p.name, qty: Math.ceil(qty), estPrice: p.cost }] });
  };

  /* ================= Simulation ================= */
  const createScenario = (name: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!canPlan()) return fail('Scenarios are built by the Operations Officer or Manager');
    if (!name.trim()) return fail('Name the scenario');
    const s = ref.current;
    const { sequence } = next(s, 'SN');
    const id = uid('sn');
    const sc: Scenario = { id, name: name.trim(), by: actor.name, at: now(), workCenters: s.workCenters.map((w) => ({ ...w, days: [...w.days], burden: { ...w.burden }, sequence: [...w.sequence] })), calendar: s.calendar.map((c) => ({ ...c })), moves: [] };
    commit({ ...s, sequence, scenarios: [sc, ...s.scenarios] });
    return done('Scenario created', `${sc.name} — a copy of live capacity, calendar and schedule`, id);
  };
  const editScenario = (id: string, patch: Partial<Pick<Scenario, 'workCenters' | 'calendar' | 'moves' | 'name'>>): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!canPlan()) return fail('Scenarios are edited by the Operations Officer or Manager');
    const s = ref.current;
    const sc = s.scenarios.find((x) => x.id === id)!;
    if (sc.promoted) return fail('This scenario is already live — copy it to try something else');
    if (patch.workCenters?.some((w) => !(w.machines >= 1 && w.hoursPerDay > 0 && w.hoursPerDay <= 24 && w.crew >= 0))) return fail('Machines at least 1 and 0–24 hours a day');
    commit({ ...s, scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
    return { ok: true };
  };
  const deleteScenario = (id: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!canPlan()) return fail('Scenarios are removed by the Operations Officer or Manager');
    commit({ ...ref.current, scenarios: ref.current.scenarios.filter((x) => x.id !== id) });
    return { ok: true };
  };
  /** Transfer a what-if scenario to live: capacity, calendar and every job move in it. */
  const promoteScenario = (id: string): Result => {
    const ro = readOnly();
    if (ro) return ro;
    if (!is('MANAGER')) return fail('Only the Operations Manager can make a scenario live');
    const s = ref.current;
    const sc = s.scenarios.find((x) => x.id === id)!;
    if (sc.promoted) return fail('Already promoted');
    let s2: BlendingState = { ...s, workCenters: sc.workCenters.map((w) => ({ ...w })), calendar: sc.calendar.map((c) => ({ ...c })) };
    for (const m of sc.moves) {
      const bs = s2.blendsheets.find((x) => x.id === m.jobId);
      if (bs) s2 = { ...s2, blendsheets: s2.blendsheets.map((x) => (x.id === m.jobId ? { ...x, date: m.date ?? x.date, workCenterId: m.workCenterId ?? x.workCenterId, history: [...x.history, log(`Moved by scenario ${sc.name}`)] } : x)) };
      else s2 = setExt(s2, m.jobId, { ...(m.date ? { pinDate: m.date } : {}), ...(m.workCenterId ? { workCenterId: m.workCenterId } : {}) }, `Moved by scenario ${sc.name}`);
    }
    s2 = { ...s2, scenarios: s2.scenarios.map((x) => (x.id === id ? { ...x, promoted: now() } : x)) };
    commit(s2);
    trail('Scenario promoted to live', sc.name, `${sc.moves.length} job moves`);
    return done('Scenario is now live', `${sc.name}: capacity, calendar and ${sc.moves.length} job moves applied`);
  };

  /* Make-to-order: an approved sales order with MTO products gets a blendsheet straight away. */
  const orders = commercial.state.orders;
  useEffect(() => {
    const s = ref.current;
    const fresh = orders.filter((o) => o.status === 'APPROVED' && !s.seenOrders.includes(o.id));
    if (!fresh.length) return;
    commit({ ...s, seenOrders: [...s.seenOrders, ...fresh.map((o) => o.id)] });
    const mto = new Set(s.params.filter((p) => p.mto).map((p) => recipeOf(p.recipeId)?.product));
    for (const o of fresh) if (o.lines.some((l) => mto.has(l.sku))) createFromOrder(o.id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const reset = () => {
    commit(buildBlendingSeed(commercial.snapshot(), ops.state.batches, ops.state.recipes));
    addToast({ type: 'info', title: 'Blending data restored', message: 'Blendsheets, routings and planning are back to their starting data.' });
  };

  return {
    state,
    actor,
    readOnly: !access.canWrite,
    holdLot,
    releaseLot,
    importLots,
    createBlendsheet,
    createFromOrder,
    orderKg,
    saveBlendsheet,
    autoFill,
    submitBlendsheet,
    approveBlendsheet,
    rejectBlendsheet,
    cancelBlendsheet,
    issueBlend,
    runChop,
    drawSample,
    recordChop,
    recordBlendLabour,
    completeBlend,
    createPlan,
    submitPlan,
    approvePlan,
    rejectPlan,
    saveWorkCenter,
    moveSequence,
    addCalendar,
    removeCalendar,
    saveRouting,
    newRevision,
    copyRouting,
    activateRouting,
    massReplace,
    freezeStandard,
    saveParams,
    saveForecast,
    planBatch,
    releaseBatch,
    startBatch,
    pauseBatch,
    resumeBatch,
    sendToQc,
    recordQc,
    evaluateChecks,
    cancelBatch,
    recordLabour,
    reworkBatch,
    disassembleBatch,
    packFromBlend,
    rescheduleJob,
    rescheduleByWorkCenter,
    rescheduleByCategory,
    rollForward,
    mergeBatches,
    createRateSchedule,
    createProdOrder,
    raiseRequisition,
    createScenario,
    editScenario,
    deleteScenario,
    promoteScenario,
    reset,
    defaultOpts: ALL_OPTS,
    actors: OPS_ACTORS
  };
};

export const BlendingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useBlendingStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
};

export const useBlending = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBlending must be used inside BlendingProvider');
  return ctx;
};
