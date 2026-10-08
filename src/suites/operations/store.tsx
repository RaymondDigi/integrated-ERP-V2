import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useFinance } from '../finance/store';
import { useCommercial } from '../commercial/store';
import { useAccess } from '../../platform/access';
import { audit } from '../../platform/audit';
import { addDays, round2, TODAY, localStamp } from '../finance/engine';
import { buildOperationsSeed, OPS_ACTORS } from './data';
import { materialNeed, shipBlockers, SHIP_STAGES, stockAt, shipValue, woCost } from './engine';
import type { Batch, OperationsState, OpsRole, QualityCheck, Shipment, StockMove, Warehouse, WorkOrder } from './types';
import type { ShippingExtPage } from './shipping/pages';
import type { WarehousingExtPage } from './warehousing/pages';

export type WarehousingPage = 'overview' | 'stock' | 'transfers' | 'counts' | 'movements' | WarehousingExtPage;
export type ProductionPage = 'overview' | 'batches' | 'recipes' | 'quality';
export type ShippingPage = 'overview' | 'shipments' | 'documents' | ShippingExtPage;
export type FleetPage = 'overview' | 'vehicles' | 'trips' | 'fuel';
export type MaintenancePage = 'overview' | 'workorders' | 'preventive' | 'projects';
type Nav<P> = { page: P; focus: string | null };
type Result = { ok: true; id?: string } | { ok: false; error: string };

const Ctx = createContext<ReturnType<typeof useOperationsStore> | null>(null);

const useOperationsStore = () => {
  const { addToast } = useApp();
  const access = useAccess();
  const finance = useFinance();
  const commercial = useCommercial();
  const [state, setState] = useState<OperationsState>(() =>
    buildOperationsSeed(commercial.state, (c) =>
      finance.state.documents
        .filter((x) => x.kind === 'INVOICE' && x.partyId === c && x.status === 'POSTED')
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((x) => ({ id: x.id, number: x.number }))
    )
  );
  const [warehousing, setW] = useState<Nav<WarehousingPage>>({ page: 'overview', focus: null });
  const [production, setP] = useState<Nav<ProductionPage>>({ page: 'overview', focus: null });
  const [shipping, setS] = useState<Nav<ShippingPage>>({ page: 'overview', focus: null });
  const [fleet, setF] = useState<Nav<FleetPage>>({ page: 'overview', focus: null });
  const [maintenance, setM] = useState<Nav<MaintenancePage>>({ page: 'overview', focus: null });
  const ref = useRef(state);
  ref.current = state;
  const actor = state.actor;
  const products = commercial.state.products;

  const commit = (next: OperationsState) => {
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
  const next = (s: OperationsState, prefix: string) => {
    const n = (s.sequence[prefix] ?? 0) + 1;
    return { number: `${prefix}-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`, sequence: { ...s.sequence, [prefix]: n } };
  };
  const log = (action: string, note?: string) => ({ at: now(), by: actor.name, action, note });
  const move = (m: Omit<StockMove, 'id' | 'date' | 'by'>): StockMove => ({ ...m, id: uid('mv'), date: TODAY, by: actor.name });
  const is = (...roles: OpsRole[]) => roles.includes(actor.role);
  const pname = (sku: string) => products.find((p) => p.sku === sku)?.name ?? sku;
  /** Viewer sign-ins are read only; portal and credit personas only act through Shipping instructions. */
  const READ_ONLY = 'This is a read-only account — you can view records but not change them';
  const blockedWriter = () => (!access.canWrite ? READ_ONLY : is('CUSTOMER', 'CREDIT') ? `${actor.title} cannot change warehouse or shipment records` : null);

  const setActor = (role: OpsRole) => {
    commit({ ...ref.current, actor: OPS_ACTORS[role] });
    addToast({ type: 'info', title: `Acting as ${OPS_ACTORS[role].title}`, message: OPS_ACTORS[role].name });
  };

  /** Move quantity between non-main placements; the main warehouse absorbs the rest. */
  const place = (placed: OperationsState['placed'], sku: string, wh: string, delta: number) => {
    const s = ref.current;
    if (s.warehouses.find((w) => w.id === wh)?.main) return placed;
    const row = { ...placed[sku] };
    row[wh] = Math.max(0, round2((row[wh] ?? 0) + delta));
    return { ...placed, [sku]: row };
  };

  /* ================= Warehousing ================= */
  const warehouseHasStock = (id: string) => products.some((p) => p.kind !== 'SERVICE' && stockAt(ref.current, products, p.sku, id) > 0);
  /** Add or edit a warehouse / godown (Operations Manager). */
  const saveWarehouse = (w: Warehouse): Result => {
    const s = ref.current;
    const blocked = blockedWriter();
    if (blocked) return fail(blocked);
    if (!is('MANAGER')) return fail('Warehouses are set up by the Operations Manager');
    if (!w.name.trim() || !w.location.trim()) return fail('Enter the warehouse name and location');
    if (!(w.capacity > 0) || !((w.capacityKg ?? 1) > 0)) return fail('Capacity must be above zero');
    const exists = s.warehouses.find((x) => x.id === w.id);
    if (!exists && s.warehouses.some((x) => x.name.trim().toLowerCase() === w.name.trim().toLowerCase())) return fail('A warehouse with that name already exists');
    if (w.archived && exists?.main) return fail('The main warehouse cannot be archived');
    if (w.archived && exists && warehouseHasStock(w.id)) return fail('Move the stock out before archiving this warehouse');
    const id = exists ? w.id : `WH-${w.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}${s.warehouses.length + 1}`;
    commit({ ...s, warehouses: exists ? s.warehouses.map((x) => (x.id === w.id ? { ...w } : x)) : [...s.warehouses, { ...w, id, main: false }] });
    audit({ module: 'Warehousing', by: actor.name, action: exists ? (w.archived ? 'Warehouse archived' : 'Warehouse edited') : 'Warehouse added', ref: id, note: w.name });
    return done(exists ? 'Warehouse saved' : 'Warehouse added', w.name, id);
  };

  const requestTransfer = (from: string, to: string, lines: { sku: string; qty: number }[], reason: string): Result => {
    const s = ref.current;
    const blocked = blockedWriter();
    if (blocked) return fail(blocked);
    if (from === to) return fail('Choose two different warehouses');
    if (s.warehouses.find((w) => w.id === to)?.archived) return fail('The destination warehouse is archived');
    const ls = lines.filter((l) => l.sku && l.qty > 0);
    if (!ls.length) return fail('Add at least one item');
    if (!reason.trim()) return fail('Say why the stock is moving');
    // Stock already promised to other open requests from the same warehouse is not available again
    for (const l of ls) {
      const pending = s.transfers.filter((t) => t.status === 'REQUESTED' && t.from === from).reduce((x, t) => x + t.lines.filter((y) => y.sku === l.sku).reduce((a, y) => a + y.qty, 0), 0);
      const have = stockAt(s, products, l.sku, from) - pending;
      if (have < l.qty) return fail(`${pname(l.sku)}: only ${Math.max(0, have)} available at ${s.warehouses.find((w) => w.id === from)?.name}${pending ? ` (${pending} already requested)` : ''}`);
    }
    const { number, sequence } = next(s, 'TRF');
    commit({ ...s, sequence, transfers: [{ id: uid('tr'), number, from, to, date: TODAY, lines: ls, status: 'REQUESTED', requestedBy: actor.name, reason, history: [log('Requested')] }, ...s.transfers] });
    return done('Transfer requested', `${number} — Stores will pick and dispatch`);
  };
  const dispatchTransfer = (id: string): Result => {
    const s = ref.current;
    if (!access.canWrite) return fail(READ_ONLY);
    if (!is('STOREKEEPER', 'MANAGER')) return fail('Stores dispatches transfers — switch to John Kiprop');
    const t = s.transfers.find((x) => x.id === id)!;
    if (t.status !== 'REQUESTED') return fail('Only requested transfers can be dispatched');
    for (const l of t.lines) {
      const have = stockAt(s, products, l.sku, t.from);
      if (have < l.qty) return fail(`${pname(l.sku)}: only ${have} at ${s.warehouses.find((w) => w.id === t.from)?.name}`);
    }
    let placed = s.placed;
    for (const l of t.lines) placed = place(placed, l.sku, t.from, -l.qty);
    commit({ ...s, placed, transfers: s.transfers.map((x) => (x.id === id ? { ...x, status: 'IN_TRANSIT', history: [...x.history, log('Dispatched')] } : x)) });
    return done('Transfer dispatched', `${t.number} is on its way`);
  };
  const receiveTransfer = (id: string): Result => {
    const s = ref.current;
    if (!access.canWrite) return fail(READ_ONLY);
    if (!is('STOREKEEPER', 'MANAGER')) return fail('Stores receives transfers — switch to John Kiprop');
    const t = s.transfers.find((x) => x.id === id)!;
    if (t.status !== 'IN_TRANSIT') return fail('Only transfers in transit can be received');
    let placed = s.placed;
    for (const l of t.lines) placed = place(placed, l.sku, t.to, l.qty);
    commit({
      ...s,
      placed,
      moves: [...t.lines.map((l) => move({ sku: l.sku, qty: l.qty, from: t.from, to: t.to, kind: 'TRANSFER', ref: t.number })), ...s.moves],
      transfers: s.transfers.map((x) => (x.id === id ? { ...x, status: 'RECEIVED', history: [...x.history, log('Received')] } : x))
    });
    return done('Transfer received', t.number);
  };
  const cancelTransfer = (id: string): Result => {
    const s = ref.current;
    const t = s.transfers.find((x) => x.id === id)!;
    const blocked = blockedWriter();
    if (blocked) return fail(blocked);
    if (t.requestedBy !== actor.name && !is('STOREKEEPER', 'MANAGER')) return fail('Only the requester, Stores or the Operations Manager can cancel a transfer');
    if (t.status !== 'REQUESTED') return fail('Only requested transfers can be cancelled');
    commit({ ...s, transfers: s.transfers.map((x) => (x.id === id ? { ...x, status: 'CANCELLED', history: [...x.history, log('Cancelled')] } : x)) });
    return done('Transfer cancelled', t.number);
  };
  /** Snapshot what the system expects, then Stores counts blind. */
  /** A cycle count covers only the given items; an annual count covers everything in the warehouse. */
  const startCount = (warehouse: string, opts?: { type?: 'ANNUAL' | 'CYCLE'; skus?: string[] }): Result => {
    const s = ref.current;
    const blocked = blockedWriter();
    if (blocked) return fail(blocked);
    if (!is('STOREKEEPER', 'OFFICER', 'MANAGER')) return fail('Stock counts are started by Stores or Operations');
    if (s.counts.some((c) => c.warehouse === warehouse && c.status !== 'APPROVED')) return fail('A count is already open for this warehouse');
    const type = opts?.type ?? 'ANNUAL';
    const lines = products
      .filter((p) => p.kind !== 'SERVICE' && stockAt(s, products, p.sku, warehouse) > 0 && (type === 'ANNUAL' || !opts?.skus || opts.skus.includes(p.sku)))
      .map((p) => ({ sku: p.sku, expected: stockAt(s, products, p.sku, warehouse), counted: null }));
    if (!lines.length) return fail('Nothing in scope to count in this warehouse');
    const { number, sequence } = next(s, 'CNT');
    const id = uid('ct');
    commit({ ...s, sequence, counts: [{ id, number, warehouse, date: TODAY, lines, status: 'OPEN', type, history: [log(type === 'CYCLE' ? `Cycle count started — ${lines.length} items` : 'Count started')] }, ...s.counts] });
    return done('Stock count started', `${number}: ${lines.length} items to count`, id);
  };
  const enterCount = (id: string, sku: string, counted: number | null): Result => {
    const s = ref.current;
    const blocked = blockedWriter();
    if (blocked) return fail(blocked);
    if (!is('STOREKEEPER', 'MANAGER')) return fail('Counts are entered by Stores — switch to John Kiprop');
    if (s.counts.find((c) => c.id === id)?.status !== 'OPEN') return fail('This count has already been submitted');
    if (counted !== null && (counted < 0 || !Number.isFinite(counted))) return fail('Counted quantity cannot be negative');
    commit({ ...s, counts: s.counts.map((c) => (c.id === id ? { ...c, lines: c.lines.map((l) => (l.sku === sku ? { ...l, counted } : l)) } : c)) });
    return { ok: true };
  };
  const submitCount = (id: string): Result => {
    const s = ref.current;
    const c = s.counts.find((x) => x.id === id)!;
    const blocked = blockedWriter();
    if (blocked) return fail(blocked);
    if (!is('STOREKEEPER', 'MANAGER')) return fail('Counts are submitted by Stores — switch to John Kiprop');
    if (c.status !== 'OPEN') return fail('This count has already been submitted');
    if (c.lines.some((l) => l.counted === null)) return fail('Count every line first');
    commit({ ...s, counts: s.counts.map((x) => (x.id === id ? { ...x, status: 'SUBMITTED', countedBy: actor.name, history: [...x.history, log('Count submitted')] } : x)) });
    return done('Count submitted', 'The Operations Manager approves any differences');
  };
  const approveCount = (id: string, note: string): Result => {
    const s = ref.current;
    if (!access.canWrite) return fail(READ_ONLY);
    if (!is('MANAGER')) return fail('Stock adjustments are approved by the Operations Manager');
    const c = s.counts.find((x) => x.id === id)!;
    if (c.status !== 'SUBMITTED') return fail('Only submitted counts can be approved');
    if (c.countedBy === actor.name) return fail('You counted this stock, so someone else must approve it');
    const diffs = c.lines.filter((l) => l.counted !== null && l.counted !== l.expected).map((l) => ({ sku: l.sku, delta: (l.counted as number) - l.expected }));
    if (diffs.length && !note.trim()) return fail('Explain the differences before approving');
    if (diffs.length) {
      const r = commercial.adjustStock(diffs);
      if (!r.ok) return r;
    }
    let placed = s.placed;
    for (const dd of diffs) placed = place(placed, dd.sku, c.warehouse, dd.delta);
    commit({
      ...s,
      placed,
      moves: [...diffs.map((dd) => move({ sku: dd.sku, qty: dd.delta, from: c.warehouse, kind: 'COUNT', ref: c.number })), ...s.moves],
      counts: s.counts.map((x) => (x.id === id ? { ...x, status: 'APPROVED', approvedBy: actor.name, history: [...x.history, log(diffs.length ? 'Variance approved' : 'Approved — no differences', note || undefined)] } : x))
    });
    return done('Count approved', diffs.length ? `${diffs.length} items adjusted` : 'Stock agreed with the system');
  };

  /* ================= Production ================= */
  const planBatch = (recipeId: string, qty: number, date: string, forOrder?: string): Result => {
    const s = ref.current;
    if (!(qty > 0)) return fail('Enter the quantity to make');
    const r = s.recipes.find((x) => x.id === recipeId)!;
    const { number, sequence } = next(s, 'BAT');
    const id = uid('bt');
    const b: Batch = { id, number, recipeId, plannedQty: qty, date, line: r.line, status: 'PLANNED', issued: [], output: 0, rejectedQty: 0, checks: [], history: [log('Planned')], forOrder };
    commit({ ...s, sequence, batches: [b, ...s.batches] });
    return done('Batch planned', `${number}: ${qty} × ${r.name}`, id);
  };
  const updateBatch = (id: string, patch: Partial<Batch>, action: string, note?: string) => {
    const s = ref.current;
    commit({ ...s, batches: s.batches.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log(action, note)] } : x)) });
  };
  const releaseBatch = (id: string): Result => {
    if (!is('MANAGER')) return fail('Batches are released by the Operations Manager');
    const b = ref.current.batches.find((x) => x.id === id)!;
    updateBatch(id, { status: 'RELEASED' }, 'Released to the floor');
    return done('Released', `${b.number} can start when materials are issued`);
  };
  /** Issue materials (stock goes down) and start the run. */
  const startBatch = (id: string): Result => {
    const s = ref.current;
    if (!is('STOREKEEPER', 'OFFICER', 'MANAGER')) return fail('Stores or the Operations Officer issues materials');
    const b = s.batches.find((x) => x.id === id)!;
    const r = s.recipes.find((x) => x.id === b.recipeId)!;
    const need = materialNeed(r, b.plannedQty);
    const res = commercial.adjustStock(need.map((n) => ({ sku: n.sku, delta: -n.qty })));
    if (!res.ok) return res;
    let placed = s.placed;
    for (const n of need) placed = place(placed, n.sku, 'WH-FAC', -Math.min(n.qty, s.placed[n.sku]?.['WH-FAC'] ?? 0));
    commit({
      ...s,
      placed,
      moves: [...need.map((n) => move({ sku: n.sku, qty: -n.qty, from: 'WH-FAC', kind: 'PRODUCTION_ISSUE', ref: b.number })), ...s.moves],
      batches: s.batches.map((x) => (x.id === id ? { ...x, status: 'IN_PROGRESS', issued: need, history: [...x.history, log('Materials issued and production started')] } : x))
    });
    return done('Production started', `${need.length} materials issued from stock`);
  };
  const sendToQc = (id: string): Result => {
    updateBatch(id, { status: 'QC' }, 'Run finished — sent to quality');
    return done('Sent to quality', 'Faith Akinyi (Quality Controller) records the results');
  };
  const recordQc = (id: string, checks: QualityCheck[], rejectedQty: number): Result => {
    const s = ref.current;
    if (!is('QC')) return fail('Quality results are entered by the Quality Controller — switch to Faith Akinyi');
    const b = s.batches.find((x) => x.id === id)!;
    if (checks.some((c) => !c.result.trim())) return fail('Enter a result for every check');
    if (rejectedQty < 0 || rejectedQty > b.plannedQty) return fail('Rejected quantity is out of range');
    const pass = checks.every((c) => c.pass);
    if (!pass) {
      updateBatch(id, { status: 'REJECTED', checks, checkedBy: actor.name, rejectedQty: b.plannedQty }, 'Quality check failed', checks.filter((c) => !c.pass).map((c) => c.parameter).join(', '));
      return done('Batch held', `${b.number} failed QC and is quarantined`);
    }
    const r = s.recipes.find((x) => x.id === b.recipeId)!;
    const output = b.plannedQty - rejectedQty;
    const res = commercial.adjustStock([{ sku: r.product, delta: output }]);
    if (!res.ok) return res;
    commit({
      ...s,
      moves: [move({ sku: r.product, qty: output, to: 'WH-NBO', kind: 'PRODUCTION_OUTPUT', ref: b.number }), ...s.moves],
      batches: s.batches.map((x) =>
        x.id === id
          ? { ...x, status: 'COMPLETED', checks, checkedBy: actor.name, output, rejectedQty, history: [...x.history, log('Quality check passed'), log(`Completed — ${output} into stock`, rejectedQty ? `${rejectedQty} rejected` : undefined)] }
          : x
      )
    });
    return done('Batch completed', `${output} × ${r.name} added to stock`);
  };
  const cancelBatch = (id: string): Result => {
    const b = ref.current.batches.find((x) => x.id === id)!;
    if (!['PLANNED', 'RELEASED'].includes(b.status)) return fail('Materials are already issued — finish the run or record a QC failure');
    updateBatch(id, { status: 'CANCELLED' }, 'Cancelled');
    return done('Batch cancelled', b.number);
  };

  /* ================= Shipping ================= */
  const updateShipment = (id: string, patch: Partial<Shipment>, action: string, note?: string) => {
    const s = ref.current;
    commit({ ...s, shipments: s.shipments.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log(action, note)] } : x)) });
  };
  const SAILED: Shipment['stage'][] = ['DEPARTED', 'ARRIVED', 'DELIVERED'];
  /** New shipment, usually from a confirmed shipping instruction. */
  const createShipment = (d: Pick<Shipment, 'customerId' | 'destination' | 'incoterm' | 'lines' | 'vessel' | 'line' | 'bookingRef' | 'etd' | 'eta'> & Partial<Pick<Shipment, 'siId' | 'siNumber' | 'stuffingBase' | 'docs'>>): Result => {
    const s = ref.current;
    const blocked = blockedWriter();
    if (blocked) return fail(blocked);
    if (!is('OFFICER', 'MANAGER')) return fail('Shipments are booked by the Operations Officer or Manager');
    if (!d.customerId || !d.destination.trim()) return fail('Choose the buyer and destination');
    if (!d.lines.length || d.lines.some((l) => !(l.qty > 0) || !(l.price > 0))) return fail('Every line needs a quantity and a price');
    if (!d.vessel.trim() || !d.bookingRef.trim()) return fail('Enter the vessel and the booking reference');
    if (d.eta < d.etd) return fail('ETA cannot be before ETD');
    if (d.siId && s.shipments.some((x) => x.siId === d.siId)) return fail('A shipment already exists for this shipping instruction');
    const { number, sequence } = next(s, 'SHP');
    const docs = d.docs ?? [
      { key: 'invoice', name: 'Commercial invoice', issuer: 'Finance', done: false },
      { key: 'packing', name: 'Packing list', issuer: 'Stores', done: false },
      { key: 'coo', name: 'Certificate of origin', issuer: 'Chamber of Commerce', done: false },
      { key: 'phyto', name: 'Phytosanitary certificate', issuer: 'KEPHIS', done: false },
      { key: 'entry', name: 'Export entry', issuer: 'KRA customs', done: false },
      { key: 'bl', name: 'Bill of lading', issuer: 'Shipping line', done: false },
      ...(d.incoterm === 'CIF' ? [{ key: 'insurance', name: 'Marine insurance certificate', issuer: 'Insurer', done: false }] : [])
    ];
    const id = uid('sh');
    const rec: Shipment = { ...d, id, number, stage: 'BOOKED', docs, history: [log('Booked', d.siNumber ? `From shipping instruction ${d.siNumber}` : undefined)] };
    commit({ ...s, sequence, shipments: [rec, ...s.shipments] });
    audit({ module: 'Shipping', by: actor.name, action: 'Shipment booked', ref: number, note: d.siNumber });
    return done('Shipment booked', `${number} on ${d.vessel}`, id);
  };
  /** Put a processing block on a shipment (credit, quality or customer hold) or lift it. */
  const blockShipment = (id: string, reason: string | null): Result => {
    const sh = ref.current.shipments.find((x) => x.id === id)!;
    if (!access.canWrite) return fail(READ_ONLY);
    if (!is('MANAGER', 'CREDIT')) return fail('Only the Operations Manager or the Credit Controller can block or release shipments');
    if (reason !== null && !reason.trim()) return fail('Say why the shipment is blocked');
    if (reason !== null && SAILED.includes(sh.stage)) return fail('The shipment has already sailed');
    if (reason === null && !sh.blocked) return fail('This shipment is not blocked');
    updateShipment(id, { blocked: reason === null ? undefined : { reason: reason.trim(), by: actor.name, at: now() } }, reason === null ? 'Block released' : 'Blocked', reason ?? sh.blocked?.reason);
    audit({ module: 'Shipping', by: actor.name, action: reason === null ? 'Shipment unblocked' : 'Shipment blocked', ref: sh.number, note: reason ?? undefined });
    return done(reason === null ? 'Block released' : 'Shipment blocked', sh.number);
  };
  /** Verified gross mass certificate for the container (SOLAS). */
  const recordVgm = (id: string, v: { grossKg: number; method: 'METHOD_1' | 'METHOD_2' }): Result => {
    const s = ref.current;
    const sh = s.shipments.find((x) => x.id === id)!;
    const blocked = blockedWriter();
    if (blocked) return fail(blocked);
    if (!is('STOREKEEPER', 'MANAGER')) return fail('Stores weighs and certifies the container — switch to John Kiprop');
    if (!sh.container) return fail('Record the container number first');
    if (SAILED.includes(sh.stage)) return fail('The shipment has already sailed');
    if (!(v.grossKg > 0) || v.grossKg > 32_500) return fail('Gross mass must be above zero and within the 32,500 kg container limit');
    const { number, sequence } = next(s, 'VGM');
    commit({ ...s, sequence });
    updateShipment(id, { vgm: { number, grossKg: v.grossKg, method: v.method, by: actor.name, at: TODAY } }, `VGM ${number} certified`, `${v.grossKg.toLocaleString()} kg · ${v.method === 'METHOD_1' ? 'weighed packed container' : 'sum of cargo + tare'}`);
    return done('VGM certified', `${number}: ${v.grossKg.toLocaleString()} kg`, number);
  };
  /** Tea shipments are stuffed lot by lot from a container loading plan. */
  const linkLoadingPlan = (id: string, plan: string, container: string, seal: string): Result => {
    const sh = ref.current.shipments.find((x) => x.id === id)!;
    if (!access.canWrite) return fail(READ_ONLY);
    if (SAILED.includes(sh.stage)) return fail('The shipment has already sailed');
    updateShipment(id, { loadingPlan: plan, container: container || sh.container, seal: seal || sh.seal }, `Loading plan ${plan} stuffed`, container ? `${container} · seal ${seal}` : undefined);
    return { ok: true };
  };
  const toggleDoc = (id: string, key: string, refNo: string): Result => {
    const sh = ref.current.shipments.find((x) => x.id === id)!;
    const doc = sh.docs.find((x) => x.key === key)!;
    const blocked = blockedWriter();
    if (blocked) return fail(blocked);
    if (!is('OFFICER', 'STOREKEEPER', 'MANAGER')) return fail('Export documents are handled by Operations');
    if (SAILED.includes(sh.stage) && doc.done) return fail('The shipment has sailed — its documents can no longer be withdrawn');
    if (key === 'invoice' && !sh.invoiceId) return fail('Raise the export invoice in Finance first');
    if (!doc.done && !refNo.trim()) return fail('Enter the document reference');
    updateShipment(id, { docs: sh.docs.map((x) => (x.key === key ? { ...x, done: !x.done, ref: x.done ? undefined : refNo } : x)) }, doc.done ? `${doc.name} withdrawn` : `${doc.name} received`, refNo || undefined);
    return { ok: true };
  };
  const setContainer = (id: string, container: string, seal: string): Result => {
    const sh = ref.current.shipments.find((x) => x.id === id)!;
    const blocked = blockedWriter();
    if (blocked) return fail(blocked);
    if (!is('OFFICER', 'STOREKEEPER', 'MANAGER')) return fail('Containers are recorded by Operations');
    if (!['BOOKED', 'DOCUMENTS'].includes(sh.stage)) return fail('The container is already loaded');
    if (!/^[A-Z]{4}\s?\d{7}$/.test(container.trim())) return fail('Container numbers look like MSKU 1234567');
    if (!seal.trim()) return fail('Enter the seal number');
    updateShipment(id, { container: container.trim().toUpperCase(), seal: seal.trim() }, 'Container and seal recorded', `${container} · seal ${seal}`);
    return done('Container recorded', container);
  };
  const raiseExportInvoice = (id: string): Result => {
    const sh = ref.current.shipments.find((x) => x.id === id)!;
    const blocked = blockedWriter();
    if (blocked) return fail(blocked);
    if (!is('OFFICER', 'MANAGER')) return fail('The export invoice is raised by the Operations Officer or Manager');
    if (sh.blocked) return fail(`Shipment is blocked: ${sh.blocked.reason}`);
    if (sh.invoiceId) return fail('Already invoiced');
    const cust = finance.snapshot().parties.find((p) => p.id === sh.customerId);
    const r = finance.saveDocument(
      {
        kind: 'INVOICE',
        partyId: sh.customerId,
        date: TODAY,
        dueDate: addDays(TODAY, cust?.terms ?? 60),
        reference: `${sh.number} · ${sh.bookingRef}`,
        department: 'Sales',
        notes: `Export ${sh.incoterm} ${sh.destination}, vessel ${sh.vessel}`,
        lines: sh.lines.map((l) => ({ id: uid('l'), description: `${l.description} — ${sh.incoterm} ${sh.destination}`, account: '4010', qty: l.qty, price: l.price, vat: false }))
      },
      actor.name
    );
    if (!r.ok || !r.id) return r;
    const inv = finance.snapshot().documents.find((x) => x.id === r.id)!;
    updateShipment(id, { invoiceId: inv.id, invoiceNumber: inv.number, docs: sh.docs.map((x) => (x.key === 'invoice' ? { ...x, done: true, ref: inv.number } : x)) }, `Export invoice ${inv.number} raised in Finance`);
    return done('Export invoice raised', `${inv.number} — zero-rated, ${shipValue(sh).toLocaleString()} KES`);
  };
  /** Move to the next stage; loading takes the goods out of the port store. */
  const advanceShipment = (id: string): Result => {
    const s = ref.current;
    const sh = s.shipments.find((x) => x.id === id)!;
    const i = SHIP_STAGES.indexOf(sh.stage);
    const nextStage = SHIP_STAGES[i + 1];
    const blocked = blockedWriter();
    if (blocked) return fail(blocked);
    if (!is('OFFICER', 'STOREKEEPER', 'MANAGER')) return fail('Shipments are progressed by Operations');
    if (!nextStage) return fail('Already delivered');
    const blockers = shipBlockers(sh);
    if (blockers.length) return fail(`Still needed: ${blockers.join(', ')}`);
    if (nextStage === 'LOADED') {
      if (!is('STOREKEEPER', 'MANAGER')) return fail('Stores loads and seals the container — switch to John Kiprop');
      if (sh.siId) {
        // Tea lots leave the lot ledger when the loading plan is stuffed
        if (!sh.loadingPlan) return fail('Stuff the container from its loading plan first (Warehousing › Loading plans)');
      } else {
        const base = sh.stuffingBase ?? 'WH-MSA';
        const baseName = s.warehouses.find((w) => w.id === base)?.name ?? base;
        for (const l of sh.lines) {
          const have = stockAt(s, products, l.sku, base);
          if (have < l.qty) return fail(`${baseName} has only ${have} of ${l.description} — transfer stock there first`);
        }
        const res = commercial.adjustStock(sh.lines.map((l) => ({ sku: l.sku, delta: -l.qty })));
        if (!res.ok) return res;
        let placed = s.placed;
        for (const l of sh.lines) placed = place(placed, l.sku, base, -l.qty);
        commit({ ...s, placed, moves: [...sh.lines.map((l) => move({ sku: l.sku, qty: -l.qty, from: base, kind: 'SHIPMENT_LOADING', ref: sh.number })), ...s.moves] });
      }
    }
    updateShipment(id, { stage: nextStage }, { DOCUMENTS: 'Documents in progress', LOADED: 'Container loaded and sealed', DEPARTED: `Departed on ${sh.vessel}`, ARRIVED: `Arrived ${sh.destination}`, DELIVERED: 'Delivered to the buyer', BOOKED: '' }[nextStage]);
    return done('Shipment updated', `${sh.number}: ${nextStage.charAt(0) + nextStage.slice(1).toLowerCase()}`);
  };

  /* ================= Fleet ================= */
  const startTrip = (vehicleId: string, purpose: string, route: string, driver: string): Result => {
    const s = ref.current;
    const v = s.vehicles.find((x) => x.id === vehicleId)!;
    if (v.status !== 'AVAILABLE') return fail(`${v.reg} is ${v.status === 'ON_TRIP' ? 'already on a trip' : 'in the workshop'}`);
    if (!purpose.trim() || !route.trim()) return fail('Enter the purpose and route');
    const { number, sequence } = next(s, 'TRP');
    commit({
      ...s,
      sequence,
      vehicles: s.vehicles.map((x) => (x.id === vehicleId ? { ...x, status: 'ON_TRIP' } : x)),
      trips: [{ id: uid('tp'), number, vehicleId, driver: driver || v.driver, date: TODAY, purpose, route, startKm: v.odometer, status: 'ON_ROAD' }, ...s.trips]
    });
    return done('Trip started', `${v.reg} — ${route}`);
  };
  const endTrip = (id: string, endKm: number): Result => {
    const s = ref.current;
    const t = s.trips.find((x) => x.id === id)!;
    if (!(endKm > t.startKm)) return fail(`Closing odometer must be above ${t.startKm.toLocaleString()} km`);
    if (endKm - t.startKm > 2_000) return fail('That is more than 2,000 km for one trip — check the reading');
    commit({
      ...s,
      trips: s.trips.map((x) => (x.id === id ? { ...x, endKm, status: 'DONE' } : x)),
      vehicles: s.vehicles.map((v) => (v.id === t.vehicleId ? { ...v, odometer: endKm, status: v.status === 'IN_WORKSHOP' ? v.status : 'AVAILABLE' } : v))
    });
    return done('Trip closed', `${(endKm - t.startKm).toLocaleString()} km`);
  };
  const logFuel = (vehicleId: string, litres: number, cost: number, odometer: number, station: string): Result => {
    const s = ref.current;
    const v = s.vehicles.find((x) => x.id === vehicleId)!;
    const last = s.fuel.filter((f) => f.vehicleId === vehicleId).sort((a, b) => b.odometer - a.odometer)[0];
    if (!(litres > 0) || !(cost > 0)) return fail('Enter the litres and cost');
    if (last && odometer <= last.odometer) return fail(`Odometer must be above the last fill-up (${last.odometer.toLocaleString()} km)`);
    const kmpl = last ? (odometer - last.odometer) / litres : null;
    commit({ ...s, fuel: [{ id: uid('fu'), vehicleId, date: TODAY, litres, cost, odometer, station }, ...s.fuel], vehicles: s.vehicles.map((x) => (x.id === vehicleId ? { ...x, odometer: Math.max(x.odometer, odometer) } : x)) });
    if (kmpl !== null && kmpl < 3) addToast({ type: 'warning', title: 'Unusual fuel use', message: `${v.reg}: ${kmpl.toFixed(1)} km/l — well below normal. Check for leaks or misuse.` });
    return done('Fuel logged', `${v.reg}: ${litres} L${kmpl ? ` · ${kmpl.toFixed(1)} km/l` : ''}`);
  };

  /* ================= Maintenance ================= */
  const raiseWorkOrder = (w: Pick<WorkOrder, 'equipmentId' | 'title' | 'kind' | 'priority' | 'due' | 'notes'> & { scheduleId?: string }): Result => {
    const s = ref.current;
    if (!w.equipmentId || !w.title.trim()) return fail('Choose the equipment and describe the work');
    const { number, sequence } = next(s, 'WO');
    const urgent = w.priority === 'URGENT' && w.kind === 'BREAKDOWN';
    const rec: WorkOrder = {
      ...w,
      id: uid('wo'),
      number,
      requestedBy: actor.name,
      date: TODAY,
      assignedTo: OPS_ACTORS.TECHNICIAN.name,
      status: urgent ? 'APPROVED' : 'REQUESTED',
      hours: 0,
      parts: [],
      contractorCost: 0,
      downtimeHours: 0,
      history: [log('Requested'), ...(urgent ? [log('Approved automatically — urgent breakdown')] : [])]
    };
    commit({ ...s, sequence, workOrders: [rec, ...s.workOrders], equipment: urgent ? s.equipment.map((e) => (e.id === w.equipmentId ? { ...e, status: 'DOWN' } : e)) : s.equipment });
    return done('Work order raised', urgent ? `${number} — urgent, sent straight to the technician` : `${number} — waiting for approval`, rec.id);
  };
  const updateWo = (id: string, patch: Partial<WorkOrder>, action: string, note?: string) => {
    const s = ref.current;
    commit({ ...s, workOrders: s.workOrders.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log(action, note)] } : x)) });
  };
  const approveWorkOrder = (id: string): Result => {
    if (!is('MANAGER')) return fail('Work orders are approved by the Operations Manager');
    updateWo(id, { status: 'APPROVED' }, 'Approved and scheduled');
    return done('Approved', 'Scheduled for the technician');
  };
  const startWorkOrder = (id: string): Result => {
    if (!is('TECHNICIAN', 'MANAGER')) return fail('The technician starts the job — switch to Kevin Ouma');
    const s = ref.current;
    const w = s.workOrders.find((x) => x.id === id)!;
    commit({
      ...s,
      workOrders: s.workOrders.map((x) => (x.id === id ? { ...x, status: 'IN_PROGRESS', history: [...x.history, log('Work started')] } : x)),
      equipment: s.equipment.map((e) => (e.id === w.equipmentId && w.kind !== 'INSPECTION' ? { ...e, status: 'DOWN' } : e))
    });
    return done('Work started', w.number);
  };
  /** Close the job: spares leave stock, the equipment returns to service, preventive dates move on. */
  const completeWorkOrder = (id: string, c: { hours: number; parts: { sku: string; qty: number }[]; contractorCost: number; contractorId?: string; downtimeHours: number; notes: string }): Result => {
    const s = ref.current;
    if (!is('TECHNICIAN', 'MANAGER')) return fail('The technician closes the job — switch to Kevin Ouma');
    if (!c.notes.trim()) return fail('Describe what was done');
    const w = s.workOrders.find((x) => x.id === id)!;
    const parts = c.parts.filter((p) => p.sku && p.qty > 0);
    if (parts.length) {
      const res = commercial.adjustStock(parts.map((p) => ({ sku: p.sku, delta: -p.qty })));
      if (!res.ok) return res;
    }
    const eq = s.equipment.find((e) => e.id === w.equipmentId);
    commit({
      ...s,
      moves: [...parts.map((p) => move({ sku: p.sku, qty: -p.qty, from: 'WH-NBO', kind: 'MAINTENANCE_ISSUE', ref: w.number })), ...s.moves],
      workOrders: s.workOrders.map((x) => (x.id === id ? { ...x, ...c, parts, status: 'COMPLETED', history: [...x.history, log('Completed', c.notes)] } : x)),
      equipment: s.equipment.map((e) => (e.id === w.equipmentId ? { ...e, status: 'RUNNING' } : e)),
      schedules: s.schedules.map((p) => (p.id === w.scheduleId ? { ...p, lastDone: TODAY } : p)),
      vehicles: s.vehicles.map((v) => (v.id === eq?.vehicleId ? { ...v, status: 'AVAILABLE', lastServiceKm: v.odometer } : v))
    });
    return done('Work order completed', `${w.number} · cost ${woCost({ ...w, ...c, parts }, products).toLocaleString()} KES`);
  };
  const billContractor = (id: string, invoiceNo: string): Result => {
    const w = ref.current.workOrders.find((x) => x.id === id)!;
    if (!w.contractorId || !w.contractorCost) return fail('No contractor cost on this job');
    if (w.billId) return fail('Already billed');
    if (!invoiceNo.trim()) return fail("Enter the contractor's invoice number");
    const sup = finance.snapshot().parties.find((p) => p.id === w.contractorId);
    const r = finance.saveDocument(
      {
        kind: 'BILL',
        partyId: w.contractorId,
        date: TODAY,
        dueDate: addDays(TODAY, sup?.terms ?? 30),
        reference: invoiceNo,
        department: 'Operations',
        notes: `Work order ${w.number}`,
        lines: [{ id: uid('l'), description: `${w.title} (${w.number})`, account: '6400', qty: 1, price: w.contractorCost, vat: true }]
      },
      actor.name
    );
    if (!r.ok || !r.id) return r;
    const bill = finance.snapshot().documents.find((x) => x.id === r.id)!;
    updateWo(id, { billId: bill.id, billNumber: bill.number }, `Contractor bill ${bill.number} raised in Finance`);
    return done('Bill raised in Finance', bill.number);
  };
  const scheduleNow = (scheduleId: string): Result => {
    const p = ref.current.schedules.find((x) => x.id === scheduleId)!;
    if (ref.current.workOrders.some((w) => w.scheduleId === scheduleId && w.status !== 'COMPLETED' && w.status !== 'CANCELLED')) return fail('A work order for this task is already open');
    return raiseWorkOrder({ equipmentId: p.equipmentId, title: p.task, kind: 'PREVENTIVE', priority: 'NORMAL', due: TODAY, notes: 'From the preventive maintenance plan', scheduleId });
  };
  const toggleMilestone = (projectId: string, index: number) => {
    const s = ref.current;
    commit({ ...s, projects: s.projects.map((p) => (p.id === projectId ? { ...p, milestones: p.milestones.map((m, i) => (i === index ? { ...m, done: !m.done } : m)) } : p)) });
  };
  const recordSpend = (projectId: string, amount: number): Result => {
    if (!(amount > 0)) return fail('Enter an amount');
    const s = ref.current;
    const p = s.projects.find((x) => x.id === projectId)!;
    commit({ ...s, projects: s.projects.map((x) => (x.id === projectId ? { ...x, spent: round2(x.spent + amount) } : x)) });
    if (p.spent + amount > p.budget) addToast({ type: 'warning', title: 'Over budget', message: `${p.name} is now over its budget` });
    return done('Spend recorded', `${p.name}: +${amount.toLocaleString()} KES`);
  };

  const reset = () => {
    commit(
      buildOperationsSeed(commercial.snapshot(), (c) =>
        finance
          .snapshot()
          .documents.filter((x) => x.kind === 'INVOICE' && x.partyId === c && x.status === 'POSTED')
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((x) => ({ id: x.id, number: x.number }))
      )
    );
    addToast({ type: 'info', title: 'Demo data restored', message: 'Operations is back to its starting data.' });
  };

  return {
    state,
    actor,
    products,
    commercial,
    finance,
    warehousing,
    production,
    shipping,
    fleet,
    maintenance,
    setWarehousing: useCallback((page: WarehousingPage, focus: string | null = null) => setW({ page, focus }), []),
    setProduction: useCallback((page: ProductionPage, focus: string | null = null) => setP({ page, focus }), []),
    setShipping: useCallback((page: ShippingPage, focus: string | null = null) => setS({ page, focus }), []),
    setFleet: useCallback((page: FleetPage, focus: string | null = null) => setF({ page, focus }), []),
    setMaintenance: useCallback((page: MaintenancePage, focus: string | null = null) => setM({ page, focus }), []),
    clearFocus: useCallback(() => {
      setW((x) => ({ ...x, focus: null }));
      setP((x) => ({ ...x, focus: null }));
      setS((x) => ({ ...x, focus: null }));
      setF((x) => ({ ...x, focus: null }));
      setM((x) => ({ ...x, focus: null }));
    }, []),
    setActor,
    pname,
    saveWarehouse,
    createShipment,
    blockShipment,
    recordVgm,
    linkLoadingPlan,
    requestTransfer,
    dispatchTransfer,
    receiveTransfer,
    cancelTransfer,
    startCount,
    enterCount,
    submitCount,
    approveCount,
    planBatch,
    releaseBatch,
    startBatch,
    sendToQc,
    recordQc,
    cancelBatch,
    toggleDoc,
    setContainer,
    raiseExportInvoice,
    advanceShipment,
    startTrip,
    endTrip,
    logFuel,
    raiseWorkOrder,
    approveWorkOrder,
    startWorkOrder,
    completeWorkOrder,
    billContractor,
    scheduleNow,
    toggleMilestone,
    recordSpend,
    reset
  };
};

export const OperationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useOperationsStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
};

export const useOperations = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOperations must be used inside OperationsProvider');
  return ctx;
};
