import { round2, TODAY } from '../../../../finance/engine';
import type { Ctx, Result } from '../ctx';
import { approveSteps, pickLots, ruleFor } from '../engine';
import type { GoodsReceipt, Product, PurchaseOrder } from '../../../types';
import type { Condition, Disposal, InvMove, ItemExt, Lot, MoveKind, ProcExtState, StoresRequisition, WarehouseConfig } from '../types';

/** Details Stores captures on the receiving screen, applied when the goods-received note posts. */
export type ReceiptDetail = Record<string, { lot?: string; serial?: string; expiry?: string; warehouse?: string; bin?: string; checks?: string[]; result?: 'PASS' | 'FAIL' | 'CONDITIONAL'; note?: string; garden?: string; grade?: string; saleNo?: string }>;
let staged: { poId: string; detail: ReceiptDetail; asnId?: string } | null = null;

export const inventoryActions = (c: Ctx) => {
  const { get, commit, fail, done, uid, next, now, log } = c;
  const stores = () => c.actor.role === 'STOREKEEPER' || c.actor.role === 'MANAGER';
  const product = (sku: string) => c.com.snapshot().products.find((p) => p.sku === sku);
  const item = (sku: string) => get().items.find((i) => i.sku === sku);
  const tracked = (sku: string) => !!item(sku)?.lotTracked;
  const lotStock = (sku: string, warehouse?: string) => get().lots.filter((l) => l.sku === sku && l.qty > 0 && (!warehouse || l.warehouse === warehouse) && (l.condition === 'NEW' || l.condition === 'GOOD')).reduce((s, l) => s + l.qty, 0);
  const move = (s: ProcExtState, m: Omit<InvMove, 'id' | 'number' | 'by' | 'date'>, prefix: string) => {
    const { number, sequence } = next(s, prefix);
    return { rec: { ...m, id: uid('mv'), number, by: c.actor.name, date: TODAY } as InvMove, sequence };
  };
  /** Takes quantity out of lots (earliest expiry / oldest first, or one named lot). */
  const consume = (lots: Lot[], sku: string, qty: number, warehouse?: string, lotId?: string) => {
    if (lotId) return lots.map((l) => (l.id === lotId ? { ...l, qty: l.qty - qty } : l));
    const { picks } = pickLots(lots, sku, qty, warehouse);
    return lots.map((l) => {
      const p = picks.find((x) => x.lot.id === l.id);
      return p ? { ...l, qty: l.qty - p.qty } : l;
    });
  };

  /* ---------------- Item master ---------------- */
  const saveItem = (sku: string, patch: Partial<ItemExt>): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role === 'DIRECTOR') return fail('Item records are kept by Purchasing and Stores');
    const s = get();
    if (!product(sku)) return fail('Unknown item');
    const cur = item(sku) ?? { sku, barcode: `KE${sku.replace(/[^A-Z0-9]/gi, '')}`, tags: [], purchaseUnit: product(sku)!.unit, factor: 1, defaultWarehouse: 'WH-NBO', countEveryDays: 90, abc: 'C' as const, lotTracked: false, serialTracked: false, active: true };
    const merged = { ...cur, ...patch };
    if (!merged.barcode.trim()) return fail('Every item needs a barcode');
    if (s.items.some((i) => i.sku !== sku && i.barcode === merged.barcode)) return fail(`Barcode ${merged.barcode} is already used by another item`);
    if (!(merged.factor > 0)) return fail('The order-to-stock unit factor must be above zero');
    if (!s.warehouses.some((w) => w.id === merged.defaultWarehouse)) return fail('Choose a valid default receiving warehouse');
    if (merged.defaultBin && !s.warehouses.find((w) => w.id === merged.defaultWarehouse)?.bins.includes(merged.defaultBin)) return fail(`Bin ${merged.defaultBin} is not in that warehouse`);
    if (!(merged.countEveryDays > 0)) return fail('Count frequency must be at least one day');
    if (!merged.active && product(sku)!.stock > 0) return fail('Issue or dispose of the remaining stock before deactivating the item');
    commit({ ...s, items: [...s.items.filter((i) => i.sku !== sku), merged] });
    return done('Item saved', sku);
  };
  const addItem = (p: Omit<Product, 'sku' | 'stock' | 'price'>, ext: Partial<ItemExt>): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role === 'DIRECTOR' || c.actor.role === 'STOREKEEPER') return fail('New catalogue items are created by Purchasing');
    if (!(p.cost >= 0)) return fail('Enter a standard cost');
    const r = c.com.addMaterial(p);
    if (!r.ok || !r.id) return r;
    const sku = r.id;
    const s = get();
    commit({ ...s, items: [...s.items, { sku, barcode: `KE${sku.replace(/[^A-Z0-9]/gi, '')}`, tags: [], purchaseUnit: p.unit, factor: 1, defaultWarehouse: 'WH-NBO', countEveryDays: 90, abc: 'C', lotTracked: p.kind === 'MATERIAL', serialTracked: false, active: true, ...ext }] });
    return r;
  };

  /* ---------------- Receiving ---------------- */
  const stageReceipt = (poId: string, detail: ReceiptDetail, asnId?: string) => {
    staged = { poId, detail, asnId };
  };
  /** Called by the core receive(): lots per line at the item's default location, inspection results, ASN closure. */
  const recordReceipt = (grn: GoodsReceipt, po: PurchaseOrder) => {
    const s = get();
    const detail = staged && staged.poId === po.id ? staged.detail : {};
    const asnId = staged?.poId === po.id ? staged.asnId : undefined;
    staged = null;
    const lots = [...s.lots];
    const lotIds: string[] = [];
    let wh = '';
    let service = true;
    const moves: InvMove[] = [];
    let seq = s.sequence;
    grn.lines.forEach((gl, i) => {
      const pl = po.lines.find((x) => x.id === gl.lineId);
      const p = pl && product(pl.sku);
      if (!pl || !p || p.kind === 'SERVICE' || gl.qty <= 0) return;
      service = false;
      const it = item(p.sku);
      const d = detail[gl.lineId] ?? {};
      const warehouse = d.warehouse || it?.defaultWarehouse || 'WH-NBO';
      const bin = d.bin || it?.defaultBin || s.warehouses.find((w) => w.id === warehouse)?.bins[0] || '-';
      wh = warehouse;
      const units = gl.qty * (it?.factor ?? 1);
      const failed = d.result === 'FAIL';
      const id = uid('lot');
      lotIds.push(id);
      lots.push({
        id,
        sku: p.sku,
        lot: d.lot?.trim() || `${grn.number}-${i + 1}`,
        serial: d.serial?.trim() || undefined,
        qty: units,
        warehouse: failed ? (s.warehouses.find((w) => w.type === 'QUARANTINE')?.id ?? warehouse) : warehouse,
        bin: failed ? (s.warehouses.find((w) => w.type === 'QUARANTINE')?.bins[0] ?? bin) : bin,
        received: TODAY,
        expiry: d.expiry || (it?.shelfLifeDays ? new Date(Date.now() + it.shelfLifeDays * 86_400_000).toISOString().slice(0, 10) : undefined),
        receivedRef: grn.number,
        unitCost: round2(pl.price / (it?.factor ?? 1)),
        condition: failed ? 'QUARANTINE' : d.result === 'CONDITIONAL' ? 'DAMAGED' : 'NEW',
        garden: d.garden || undefined,
        grade: d.grade || undefined,
        saleNo: d.saleNo || undefined
      });
      const { rec, sequence } = move({ ...s, sequence: seq }, { kind: 'RECEIPT', sku: p.sku, qty: units, lotId: id, to: warehouse, reason: `${grn.number} from ${po.number}`, value: round2(gl.qty * pl.price), status: 'POSTED' }, 'RCV');
      seq = sequence;
      moves.push(rec);
    });
    const inspection = Object.fromEntries(Object.entries(detail).filter(([, v]) => v.result).map(([k, v]) => [k, { checks: v.checks ?? [], result: v.result!, note: v.note ?? '' }]));
    commit({
      ...s,
      sequence: seq,
      lots,
      moves: [...moves, ...s.moves],
      grnExt: { ...s.grnExt, [grn.id]: { inspection, lots: lotIds, warehouse: wh, service } },
      asns: s.asns.map((a) => (a.id === asnId || (a.poId === po.id && a.status === 'SUBMITTED' && asnId === undefined && false) ? { ...a, status: 'RECEIVED' } : a))
    });
  };

  const reverseReceipt = (grnId: string, reason: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const s0 = get();
    const ext = s0.grnExt[grnId];
    if (ext?.lots.some((id) => {
      const l = s0.lots.find((x) => x.id === id);
      const g = c.com.state.receipts.find((x) => x.id === grnId);
      const gq = g?.lines.reduce((a, x) => a + x.qty, 0) ?? 0;
      return l && l.qty < 0 && gq > 0;
    }))
      return fail('Some of this receipt has been issued already');
    const r = c.com.reverseReceipt(grnId, reason);
    if (!r.ok) return r;
    const s = get();
    const g = c.com.snapshot().receipts.find((x) => x.id === grnId);
    commit({ ...s, lots: s.lots.map((l) => (ext?.lots.includes(l.id) ? { ...l, qty: 0 } : l)), grnExt: { ...s.grnExt, [grnId]: { ...(ext ?? { inspection: {}, lots: [], warehouse: '' }), reversed: { at: now(), by: c.actor.name, reason } } }, moves: [{ id: uid('mv'), number: `REV-${g?.number}`, kind: 'REVERSAL', date: TODAY, sku: '-', qty: 0, reason: `${g?.number} reversed: ${reason}`, value: 0, by: c.actor.name, status: 'POSTED' }, ...s.moves] });
    return r;
  };

  /** Capitalise an asset received on a purchase order (reclassifies the cost from the expense account). */
  const capitalise = (grnId: string, lineId: string, name: string, category: string, costAccount: string, lifeMonths: number, location: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const g = c.com.state.receipts.find((x) => x.id === grnId);
    const po = g && c.com.state.purchaseOrders.find((o) => o.id === g.poId);
    const pl = po?.lines.find((l) => l.id === lineId);
    const gl = g?.lines.find((l) => l.lineId === lineId);
    if (!g || !po || !pl || !gl) return fail('Receipt line not found');
    if (get().grnExt[grnId]?.assets?.includes(lineId)) return fail('This line is already capitalised');
    const r = c.fin.addAsset({ name, category, costAccount, acquired: g.date, cost: round2(gl.qty * pl.price), residual: 0, lifeMonths, location, custodian: c.actor.name }, product(pl.sku)?.account ?? '5000');
    if (!r.ok) return r;
    const s = get();
    commit({ ...s, grnExt: { ...s.grnExt, [grnId]: { ...(s.grnExt[grnId] ?? { inspection: {}, lots: [], warehouse: '' }), assets: [...(s.grnExt[grnId]?.assets ?? []), lineId] } } });
    return r;
  };

  /* ---------------- Issues, returns, adjustments ---------------- */
  const issue = (d: { kind: 'ISSUE' | 'MISC_ISSUE'; sku: string; qty: number; warehouse: string; costCentre: string; reason: string; lotId?: string }): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!stores()) return fail('Stock is issued by Stores — switch to John Kiprop');
    const p = product(d.sku);
    if (!p || p.kind === 'SERVICE') return fail('Choose a stocked item');
    if (!(d.qty > 0)) return fail('Enter the quantity to issue');
    if (!d.costCentre.trim()) return fail('Which cost centre or department is it for?');
    if (!d.reason.trim()) return fail('Give the purpose of the issue');
    if (d.qty > p.stock) return fail(`Only ${p.stock} ${p.unit} of ${p.name} in stock`);
    if (d.lotId) {
      const l = get().lots.find((x) => x.id === d.lotId);
      if (!l || l.sku !== d.sku) return fail('Choose a lot of this item');
      if (l.condition === 'QUARANTINE' || l.condition === 'OBSOLETE' || l.condition === 'DAMAGED') return fail(`Lot ${l.lot} is ${l.condition.toLowerCase()} and cannot be issued`);
      if (l.qty < d.qty) return fail(`Lot ${l.lot} only has ${l.qty}`);
    } else if (tracked(d.sku) && lotStock(d.sku, d.warehouse) < d.qty) return fail(`Only ${lotStock(d.sku, d.warehouse)} ${p.unit} in usable lots at ${d.warehouse}`);
    const value = round2(d.qty * p.cost);
    const s = get();
    const pending = d.kind === 'MISC_ISSUE' && value > s.settings.miscIssueLimit;
    const { rec, sequence } = move(s, { kind: d.kind, sku: d.sku, qty: d.qty, lotId: d.lotId, from: d.warehouse, costCentre: d.costCentre, reason: d.reason, value, status: pending ? 'PENDING' : 'POSTED' }, 'GI');
    if (pending) {
      commit({ ...s, sequence, moves: [rec, ...s.moves] });
      const role = approveSteps(ruleFor(s.rules, 'STORES_ISSUE', value))[0]?.role ?? 'MANAGER';
      c.notifyRole(role, `Miscellaneous issue to approve: ${rec.number}`, `${d.qty} ${p.unit} ${p.name} for ${d.costCentre} — KES ${value.toLocaleString()}`, rec.number);
      return done('Sent for approval', `${rec.number}: KES ${value.toLocaleString()} is above the KES ${s.settings.miscIssueLimit.toLocaleString()} limit`, rec.id);
    }
    const r = c.com.adjustStock([{ sku: d.sku, delta: -d.qty }]);
    if (!r.ok) return r;
    commit({ ...s, sequence, moves: [rec, ...s.moves], lots: tracked(d.sku) ? consume(s.lots, d.sku, d.qty, d.warehouse, d.lotId) : s.lots });
    return done('Stock issued', `${rec.number}: ${d.qty} ${p.unit} to ${d.costCentre}`, rec.id);
  };

  const decideMove = (id: string, approve: boolean, note: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const s = get();
    const m = s.moves.find((x) => x.id === id);
    if (!m || m.status !== 'PENDING') return fail('Nothing to approve');
    const role = approveSteps(ruleFor(s.rules, 'STORES_ISSUE', m.value))[0]?.role ?? 'MANAGER';
    if (c.actor.role !== role && c.actor.role !== 'DIRECTOR') return fail('Miscellaneous issues above the limit are approved by the Commercial Manager');
    if (m.by === c.actor.name) return fail('You requested this issue, so someone else must approve it');
    if (!approve) {
      if (!note.trim()) return fail('Give the reason');
      commit({ ...s, moves: s.moves.map((x) => (x.id === id ? { ...x, status: 'REJECTED', approvedBy: c.actor.name, reason: `${x.reason} — rejected: ${note}` } : x)) });
      return done('Issue rejected', m.number);
    }
    const r = c.com.adjustStock([{ sku: m.sku, delta: -m.qty }]);
    if (!r.ok) return r;
    commit({ ...s, moves: s.moves.map((x) => (x.id === id ? { ...x, status: 'POSTED', approvedBy: c.actor.name } : x)), lots: tracked(m.sku) ? consume(s.lots, m.sku, m.qty, m.from, m.lotId) : s.lots });
    return done('Issue approved and posted', m.number);
  };

  const returnToStores = (d: { sku: string; qty: number; warehouse: string; bin: string; costCentre: string; reason: string; condition: Condition }): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!stores()) return fail('Returns are booked in by Stores');
    const p = product(d.sku);
    if (!p || p.kind === 'SERVICE') return fail('Choose a stocked item');
    if (!(d.qty > 0)) return fail('Enter the quantity returned');
    if (!d.reason.trim()) return fail('Why is it coming back?');
    const s = get();
    const issued = s.moves.filter((m) => m.sku === d.sku && (m.kind === 'ISSUE' || m.kind === 'MISC_ISSUE') && m.status === 'POSTED' && m.costCentre === d.costCentre).reduce((a, m) => a + m.qty, 0);
    const returned = s.moves.filter((m) => m.sku === d.sku && m.kind === 'RETURN' && m.costCentre === d.costCentre).reduce((a, m) => a + m.qty, 0);
    if (d.qty > issued - returned) return fail(`${d.costCentre} has only ${Math.max(0, issued - returned)} ${p.unit} issued and not yet returned`);
    const r = c.com.adjustStock([{ sku: d.sku, delta: d.qty }]);
    if (!r.ok) return r;
    const { rec, sequence } = move(s, { kind: 'RETURN', sku: d.sku, qty: d.qty, to: d.warehouse, costCentre: d.costCentre, reason: d.reason, value: round2(d.qty * p.cost), status: 'POSTED' }, 'GR');
    const lot: Lot = { id: uid('lot'), sku: d.sku, lot: `RET-${rec.number}`, qty: d.qty, warehouse: d.condition === 'QUARANTINE' ? (s.warehouses.find((w) => w.type === 'QUARANTINE')?.id ?? d.warehouse) : d.warehouse, bin: d.bin || '-', received: TODAY, receivedRef: rec.number, unitCost: p.cost, condition: d.condition };
    commit({ ...s, sequence, moves: [{ ...rec, lotId: lot.id }, ...s.moves], lots: tracked(d.sku) ? [...s.lots, lot] : s.lots });
    return done('Return booked in', `${rec.number}: ${d.qty} ${p.unit} (${d.condition.toLowerCase()})`);
  };

  const adjust = (d: { sku: string; delta: number; reason: string; lotId?: string }): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER') return fail('Stock adjustments are approved and posted by the Commercial Manager');
    const p = product(d.sku);
    if (!p) return fail('Choose an item');
    if (!d.delta) return fail('Enter the quantity to add (+) or remove (−)');
    if (d.reason.trim().length < 5) return fail('Explain the adjustment');
    const s = get();
    if (d.lotId) {
      const l = s.lots.find((x) => x.id === d.lotId);
      if (!l || l.qty + d.delta < 0) return fail('The lot does not hold that much');
    }
    const r = c.com.adjustStock([{ sku: d.sku, delta: d.delta }]);
    if (!r.ok) return r;
    const { rec, sequence } = move(s, { kind: 'ADJUSTMENT', sku: d.sku, qty: d.delta, lotId: d.lotId, reason: d.reason, value: round2(d.delta * p.cost), status: 'POSTED', approvedBy: c.actor.name }, 'ADJ');
    commit({ ...s, sequence, moves: [rec, ...s.moves], lots: d.lotId ? s.lots.map((l) => (l.id === d.lotId ? { ...l, qty: l.qty + d.delta } : l)) : s.lots });
    return done('Stock adjusted', `${rec.number}: ${d.delta > 0 ? '+' : ''}${d.delta} ${p.unit}`);
  };

  const changeCondition = (lotId: string, condition: Condition, note: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!stores() && c.actor.role !== 'OFFICER') return fail('Stores or QA update item condition');
    const s = get();
    const l = s.lots.find((x) => x.id === lotId);
    if (!l) return fail('Lot not found');
    if (l.condition === condition) return fail(`Already ${condition.toLowerCase()}`);
    if (!note.trim()) return fail('Record what was found');
    const q = s.warehouses.find((w) => w.type === 'QUARANTINE');
    const toQ = condition === 'QUARANTINE' && q;
    const { rec, sequence } = move(s, { kind: 'CONDITION', sku: l.sku, qty: l.qty, lotId, from: l.warehouse, to: toQ ? q!.id : l.warehouse, reason: `${l.condition} → ${condition}: ${note}`, value: 0, status: 'POSTED' }, 'CND');
    commit({ ...s, sequence, moves: [rec, ...s.moves], lots: s.lots.map((x) => (x.id === lotId ? { ...x, condition, ...(toQ ? { warehouse: q!.id, bin: q!.bins[0] ?? '-' } : {}) } : x)) });
    return done('Condition updated', `${l.lot}: ${condition.toLowerCase()}${toQ ? ` — moved to ${q!.name}` : ''}`);
  };

  /** Bin-to-bin or warehouse-to-warehouse move of all or part of a lot. */
  const moveLot = (lotId: string, qty: number, warehouse: string, bin: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!stores()) return fail('Stores moves stock between locations');
    const s = get();
    const l = s.lots.find((x) => x.id === lotId);
    const w = s.warehouses.find((x) => x.id === warehouse);
    if (!l) return fail('Lot not found');
    if (!w) return fail('Choose a warehouse');
    if (!w.bins.includes(bin)) return fail(`Bin ${bin} does not exist in ${w.name}`);
    if (!(qty > 0) || qty > l.qty) return fail(`Move between 1 and ${l.qty}`);
    if (l.warehouse === warehouse && l.bin === bin) return fail('That is where it already is');
    if (w.type === 'BONDED' && !l.saleNo && !l.receivedRef.startsWith('IMP')) return fail('Only imported, uncleared goods go into the bonded warehouse');
    const { rec, sequence } = move(s, { kind: 'TRANSFER', sku: l.sku, qty, lotId, from: `${l.warehouse}:${l.bin}`, to: `${warehouse}:${bin}`, reason: 'Location move', value: round2(qty * l.unitCost), status: 'POSTED' }, 'TRF');
    const lots = qty === l.qty ? s.lots.map((x) => (x.id === lotId ? { ...x, warehouse, bin } : x)) : [...s.lots.map((x) => (x.id === lotId ? { ...x, qty: x.qty - qty } : x)), { ...l, id: uid('lot'), qty, warehouse, bin }];
    commit({ ...s, sequence, moves: [rec, ...s.moves], lots });
    return done('Moved', `${qty} of ${l.lot} to ${w.name} ${bin}`);
  };

  const saveWarehouse = (w: WarehouseConfig): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER') return fail('Warehouses are set up by the Commercial Manager');
    if (!w.id.trim() || !w.name.trim()) return fail('Give the warehouse a code and name');
    if (!w.bins.length) return fail('Add at least one bin or locator');
    if (new Set(w.bins).size !== w.bins.length) return fail('Bin codes must be unique');
    if (w.type === 'BONDED' && !w.bondNo?.trim()) return fail('Enter the KRA bond licence number');
    const s = get();
    const ex = s.warehouses.find((x) => x.id === w.id);
    if (ex) {
      const removed = ex.bins.filter((b) => !w.bins.includes(b));
      const busy = removed.find((b) => s.lots.some((l) => l.warehouse === w.id && l.bin === b && l.qty > 0));
      if (busy) return fail(`Bin ${busy} still holds stock`);
    }
    commit({ ...s, warehouses: ex ? s.warehouses.map((x) => (x.id === w.id ? { ...w, ops: x.ops } : x)) : [...s.warehouses, w] });
    return done('Warehouse saved', `${w.name} — ${w.bins.length} bins`);
  };

  /** Rejected at the gate: send it back and raise a debit note for the value. */
  const returnToSupplier = (grnId: string, lineId: string, qty: number, reason: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!stores()) return fail('Stores returns rejected goods');
    const g = c.com.state.receipts.find((x) => x.id === grnId);
    const po = g && c.com.state.purchaseOrders.find((o) => o.id === g.poId);
    const gl = g?.lines.find((l) => l.lineId === lineId);
    const pl = po?.lines.find((l) => l.id === lineId);
    if (!g || !po || !gl || !pl) return fail('Receipt line not found');
    const s = get();
    const already = s.moves.filter((m) => m.kind === 'RETURN_TO_SUPPLIER' && m.reason.startsWith(`${g.number}:${lineId}`)).reduce((a, m) => a + m.qty, 0);
    if (!(qty > 0) || qty > gl.rejected - already) return fail(`Only ${gl.rejected - already} rejected on ${g.number} to return`);
    if (!reason.trim()) return fail('Give the reason');
    const { rec, sequence } = move(s, { kind: 'RETURN_TO_SUPPLIER', sku: pl.sku, qty, reason: `${g.number}:${lineId} — ${reason}`, value: round2(qty * pl.price), status: 'POSTED' }, 'RTS');
    const n = next({ ...s, sequence }, 'SDN');
    commit({
      ...s,
      sequence: n.sequence,
      moves: [rec, ...s.moves],
      notes: [{ id: uid('sn'), number: n.number, kind: 'DEBIT', supplierId: po.supplierId, grnRef: g.number, reason: `Returned ${qty} × ${pl.description}: ${reason}`, amount: round2(qty * pl.price * 1.16), status: 'SUBMITTED', preparedBy: c.actor.name, approvals: [], history: [log('Debit note raised from a return to supplier', rec.number)] }, ...s.notes]
    });
    c.notifySupplier(po.supplierId, `Goods returned: ${g.number}`, `${qty} × ${pl.description} returned — ${reason}. Debit note ${n.number} follows.`, g.number);
    return done('Returned to supplier', `${rec.number} and debit note ${n.number} raised`);
  };

  /* ---------------- Internal fulfilment (stores requisitions) ---------------- */
  const setSR = (id: string, patch: (x: StoresRequisition) => Partial<StoresRequisition>, action: string, note?: string) => {
    const s = get();
    commit({ ...s, storesReqs: s.storesReqs.map((x) => (x.id === id ? { ...x, ...patch(x), history: [...x.history, log(action, note)] } : x)) });
  };
  const buildPickList = (r: StoresRequisition) =>
    r.lines.flatMap((l) => {
      const want = l.qty - l.issued;
      if (want <= 0 || l.closed) return [];
      if (!tracked(l.sku)) return [{ sku: l.sku, warehouse: r.warehouse, bin: item(l.sku)?.defaultBin ?? '-', qty: Math.min(want, product(l.sku)?.stock ?? 0) }].filter((x) => x.qty > 0);
      return pickLots(get().lots, l.sku, want, r.warehouse).picks.map((p) => ({ sku: l.sku, lotId: p.lot.id, lot: p.lot.lot, warehouse: p.lot.warehouse, bin: p.lot.bin, qty: p.qty }));
    });

  const requestFromStores = (d: { department: string; requestedBy: string; warehouse: string; plan: 'AUTO' | 'MANUAL'; lines: { sku: string; qty: number }[] }): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const lines = d.lines.filter((l) => l.sku && l.qty > 0);
    if (!lines.length) return fail('Add the items needed');
    if (!d.requestedBy.trim()) return fail('Who needs it?');
    for (const l of lines) {
      const p = product(l.sku);
      if (!p || p.kind === 'SERVICE') return fail('Only stocked items come from stores');
      if (item(l.sku)?.active === false) return fail(`${p.name} is inactive`);
    }
    const s = get();
    const { number, sequence } = next(s, 'SR');
    const rec: StoresRequisition = { id: uid('sr'), number, department: d.department, requestedBy: d.requestedBy, date: TODAY, warehouse: d.warehouse, plan: d.plan, lines: lines.map((l) => ({ id: uid('srl'), sku: l.sku, qty: l.qty, issued: 0 })), status: 'SUBMITTED', history: [log(`Requested from stores for ${d.requestedBy}`)] };
    commit({ ...s, sequence, storesReqs: [rec, ...s.storesReqs] });
    c.notifyRole('MANAGER', `Stores request to approve: ${number}`, `${d.department} · ${lines.length} items`, number);
    return done('Stores request raised', number, rec.id);
  };
  const decideSR = (id: string, approve: boolean, note: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'DIRECTOR') return fail('Stores requests are approved by the Commercial Manager');
    const r = get().storesReqs.find((x) => x.id === id);
    if (!r || r.status !== 'SUBMITTED') return fail('Nothing to approve');
    if (!approve) {
      if (!note.trim()) return fail('Give the reason');
      setSR(id, () => ({ status: 'REJECTED' }), 'Rejected', note);
      return done('Stores request rejected', r.number);
    }
    // Automatic plans get a system pick list straight away; manual ones wait for a fulfilment manager
    if (r.plan === 'AUTO') {
      const pickList = buildPickList(r);
      setSR(id, () => ({ status: 'PICKING', pickList, assignedTo: 'John Kiprop' }), 'Approved — pick list generated', `${pickList.length} pick lines`);
      c.notifyRole('STOREKEEPER', `Pick list ready: ${r.number}`, `${pickList.length} lines`, r.number);
    } else {
      setSR(id, () => ({ status: 'APPROVED' }), 'Approved — waiting for a fulfilment manager', note || undefined);
      c.notifyRole('STOREKEEPER', `Stores request to fulfil: ${r.number}`, 'Manual fulfilment', r.number);
    }
    return done('Approved', r.number);
  };
  const assign = (id: string, to: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!stores()) return fail('Fulfilment tasks are assigned by Stores');
    const r = get().storesReqs.find((x) => x.id === id);
    if (!r || (r.status !== 'APPROVED' && r.status !== 'PICKING')) return fail('Only approved requests can be assigned');
    if (!to.trim()) return fail('Choose who will fulfil it');
    setSR(id, (x) => ({ assignedTo: to, status: 'PICKING', pickList: x.pickList ?? buildPickList(x) }), `Assigned to ${to}`);
    return done('Assigned', `${r.number} → ${to}`);
  };
  const issueSR = (id: string, qtys: Record<string, number>): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!stores()) return fail('Stores issues the goods');
    const r = get().storesReqs.find((x) => x.id === id);
    if (!r || !['PICKING', 'PART_ISSUED', 'APPROVED'].includes(r.status)) return fail('This request is not ready to issue');
    const lines = r.lines.filter((l) => (qtys[l.id] ?? 0) > 0);
    if (!lines.length) return fail('Enter the quantities issued');
    for (const l of lines) {
      const q = qtys[l.id];
      if (q > l.qty - l.issued) return fail(`${product(l.sku)?.name}: only ${l.qty - l.issued} outstanding`);
      const have = tracked(l.sku) ? lotStock(l.sku, r.warehouse) : (product(l.sku)?.stock ?? 0);
      if (q > have) return fail(`${product(l.sku)?.name}: only ${have} available at ${r.warehouse}`);
    }
    const res = c.com.adjustStock(lines.map((l) => ({ sku: l.sku, delta: -qtys[l.id] })));
    if (!res.ok) return res;
    let s = get();
    let lots = s.lots;
    const moves: InvMove[] = [];
    for (const l of lines) {
      lots = tracked(l.sku) ? consume(lots, l.sku, qtys[l.id], r.warehouse) : lots;
      const m = move(s, { kind: 'ISSUE', sku: l.sku, qty: qtys[l.id], from: r.warehouse, costCentre: r.department, reason: `${r.number} for ${r.requestedBy}`, value: round2(qtys[l.id] * (product(l.sku)?.cost ?? 0)), status: 'POSTED' }, 'GI');
      s = { ...s, sequence: m.sequence };
      moves.push(m.rec);
    }
    const newLines = r.lines.map((l) => ({ ...l, issued: l.issued + (qtys[l.id] ?? 0) }));
    const complete = newLines.every((l) => l.issued >= l.qty || l.closed);
    commit({ ...s, lots, moves: [...moves, ...s.moves], storesReqs: s.storesReqs.map((x) => (x.id === id ? { ...x, lines: newLines, status: complete ? 'ISSUED' : 'PART_ISSUED', pickList: complete ? x.pickList : buildPickList({ ...x, lines: newLines }), history: [...x.history, log(complete ? 'Issued in full' : 'Part issued — balance on backorder', moves.map((m) => m.number).join(', '))] } : x)) });
    return done(complete ? 'Issued' : 'Part issued', `${r.number}${complete ? '' : ' — the balance is a backorder'}`);
  };
  const closeBackorder = (id: string, reason: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!stores()) return fail('Stores closes backorders');
    const r = get().storesReqs.find((x) => x.id === id);
    if (!r || r.status !== 'PART_ISSUED') return fail('Only part-issued requests have a backorder');
    if (!reason.trim()) return fail('Give the reason for closing the backorder');
    setSR(id, (x) => ({ status: 'CLOSED', lines: x.lines.map((l) => ({ ...l, closed: l.issued < l.qty ? true : l.closed })) }), 'Backorder closed', reason);
    return done('Backorder closed', r.number);
  };

  /* ---------------- Cycle counts ---------------- */
  const startScheduledCount = (scheduleId: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const s = get();
    const cs = s.countSchedules.find((x) => x.id === scheduleId);
    if (!cs) return fail('Schedule not found');
    const w = s.warehouses.find((x) => x.id === cs.warehouse);
    if (!w?.ops) return fail('Counts for this location are recorded with the lot register below');
    const r = c.ops.startCount(cs.warehouse);
    if (!r.ok) return r;
    commit({ ...get(), countSchedules: get().countSchedules.map((x) => (x.id === scheduleId ? { ...x, lastDone: TODAY } : x)), items: get().items.map((i) => (cs.abc === 'ALL' || i.abc === cs.abc ? { ...i, lastCounted: TODAY } : i)) });
    return r;
  };
  const saveSchedule = (cs: { id?: string; warehouse: string; abc: 'A' | 'B' | 'C' | 'ALL'; everyDays: number }): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role !== 'MANAGER' && c.actor.role !== 'STOREKEEPER') return fail('Count schedules are set by Stores');
    if (!(cs.everyDays > 0)) return fail('Enter how often to count');
    const s = get();
    const rec = { lastDone: TODAY, ...s.countSchedules.find((x) => x.id === cs.id), ...cs, id: cs.id || uid('cs') };
    commit({ ...s, countSchedules: [...s.countSchedules.filter((x) => x.id !== rec.id), rec] });
    return done('Count schedule saved', `${cs.warehouse} · class ${cs.abc} every ${cs.everyDays} days`);
  };

  /* ---------------- Disposal ---------------- */
  const setD = (id: string, patch: (x: Disposal) => Partial<Disposal>, action: string, note?: string) => {
    const s = get();
    commit({ ...s, disposals: s.disposals.map((x) => (x.id === id ? { ...x, ...patch(x), history: [...x.history, log(action, note)] } : x)) });
  };
  const requestDisposal = (d: Pick<Disposal, 'sku' | 'lotId' | 'qty' | 'method' | 'reason' | 'proceeds' | 'buyer'>): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (c.actor.role === 'DIRECTOR') return fail('Stores or Purchasing raise disposals');
    const p = product(d.sku);
    if (!p) return fail('Choose the item');
    if (!(d.qty > 0) || d.qty > p.stock) return fail(`Between 1 and ${p.stock} ${p.unit}`);
    if (d.lotId && (get().lots.find((l) => l.id === d.lotId)?.qty ?? 0) < d.qty) return fail('The lot does not hold that much');
    if (!d.reason.trim()) return fail('Why is it being disposed of?');
    if (d.proceeds < 0) return fail('Proceeds cannot be negative');
    if (d.method === 'BOARDED' && !d.buyer?.trim()) return fail('Boarded items are sold — name the buyer');
    const s = get();
    const { number, sequence } = next(s, 'DSP');
    commit({ ...s, sequence, disposals: [{ ...d, id: uid('dp'), number, status: 'SUBMITTED', preparedBy: c.actor.name, approvals: [], history: [log('Disposal requested')] }, ...s.disposals] });
    c.notifyRole('MANAGER', `Disposal to approve: ${number}`, `${d.qty} ${p.unit} ${p.name} — ${d.method.replace('_', ' ').toLowerCase()}`, number);
    return done('Disposal requested', number);
  };
  const decideDisposal = (id: string, approve: boolean, note: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    const s = get();
    const d = s.disposals.find((x) => x.id === id);
    if (!d || d.status !== 'SUBMITTED') return fail('Nothing to approve');
    const role = approveSteps(ruleFor(s.rules, 'DISPOSAL', d.qty * (product(d.sku)?.cost ?? 0)))[0]?.role ?? 'MANAGER';
    if (c.actor.role !== role && c.actor.role !== 'DIRECTOR') return fail('Disposals are approved by the Commercial Manager');
    if (d.preparedBy === c.actor.name) return fail('You raised this disposal, so someone else must approve it');
    if (!approve && !note.trim()) return fail('Give the reason');
    setD(id, (x) => ({ status: approve ? 'APPROVED' : 'REJECTED', approvals: approve ? [...x.approvals, { by: c.actor.name, role: c.actor.role, at: now(), note }] : x.approvals }), approve ? 'Approved' : 'Rejected', note || undefined);
    return done(approve ? 'Disposal approved' : 'Disposal rejected', d.number);
  };
  const completeDisposal = (id: string, certificate: string): Result => {
    if (c.readOnly()) return fail(c.readOnly()!);
    if (!stores()) return fail('Stores completes disposals');
    const s = get();
    const d = s.disposals.find((x) => x.id === id);
    if (!d || d.status !== 'APPROVED') return fail('Approve the disposal first');
    if (d.method === 'SPECIAL_WASTE' && !certificate.trim()) return fail('Special waste needs the NEMA waste transfer note number from the licensed handler');
    const r = c.com.adjustStock([{ sku: d.sku, delta: -d.qty }]);
    if (!r.ok) return r;
    const p = product(d.sku);
    const m = move(s, { kind: 'DISPOSAL', sku: d.sku, qty: d.qty, lotId: d.lotId, reason: `${d.number}: ${d.method.replace('_', ' ').toLowerCase()}`, value: round2(d.qty * (p?.cost ?? 0)), status: 'POSTED', approvedBy: d.approvals[0]?.by }, 'GI');
    commit({ ...s, sequence: m.sequence, moves: [m.rec, ...s.moves], lots: tracked(d.sku) ? consume(s.lots, d.sku, d.qty, undefined, d.lotId) : s.lots, disposals: s.disposals.map((x) => (x.id === id ? { ...x, status: 'DISPOSED', certificate: certificate || undefined, history: [...x.history, log('Disposed', certificate || undefined)] } : x)) });
    return done('Disposed', `${d.number} — stock written off${d.proceeds ? `, proceeds KES ${d.proceeds.toLocaleString()}` : ''}`);
  };

  /** Requisitions for everything below its reorder point that is not already being bought. */
  const autoReorder = (silent = false): Result => {
    if (c.readOnly()) return silent ? { ok: false, error: 'read only' } : fail(c.readOnly()!);
    const com = c.com.snapshot();
    const open = new Set(com.requisitions.filter((r) => ['DRAFT', 'SUBMITTED'].includes(r.status) || (r.status === 'APPROVED' && !r.poId)).flatMap((r) => r.lines.map((l) => l.sku)));
    const onOrder = (sku: string) => com.purchaseOrders.filter((o) => o.status === 'APPROVED' && !o.closed).reduce((a, o) => a + o.lines.filter((l) => l.sku === sku).reduce((b, l) => b + l.qty - l.received, 0), 0);
    const due = com.products.filter((p) => p.kind === 'MATERIAL' && item(p.sku)?.active !== false && p.stock + onOrder(p.sku) < p.reorderLevel && !open.has(p.sku));
    if (!due.length) return silent ? { ok: true } : done('Nothing to reorder', 'Every material is above its reorder level or already being bought');
    for (const p of due) c.com.reorder(p.sku);
    return done('Auto-reorder', `${due.length} requisition(s) drafted: ${due.map((p) => p.sku).join(', ')}`);
  };

  const kinds: MoveKind[] = ['RECEIPT', 'ISSUE', 'RETURN', 'MISC_ISSUE', 'ADJUSTMENT', 'CONDITION', 'TRANSFER', 'DISPOSAL', 'RETURN_TO_SUPPLIER', 'REVERSAL'];
  return { saveItem, addItem, stageReceipt, recordReceipt, reverseReceipt, capitalise, issue, decideMove, returnToStores, adjust, changeCondition, moveLot, saveWarehouse, returnToSupplier, requestFromStores, decideSR, assign, issueSR, closeBackorder, startScheduledCount, saveSchedule, requestDisposal, decideDisposal, completeDisposal, autoReorder, buildPickList, lotStock, kinds };
};
