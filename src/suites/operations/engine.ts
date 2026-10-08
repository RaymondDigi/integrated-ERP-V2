import { addDays, daysBetween, round2, TODAY } from '../finance/engine';
import type { Product } from '../commercial/types';
import type { Batch, OperationsState, OpsRole, Recipe, Shipment, ShipmentStage, Vehicle, WorkOrder, PmSchedule } from './types';

export const ROLE_LABEL: Record<OpsRole, string> = {
  OFFICER: 'Operations Officer',
  STOREKEEPER: 'Stores & Dispatch',
  TECHNICIAN: 'Maintenance Technician',
  QC: 'Quality Controller',
  MANAGER: 'Operations Manager',
  DRIVER: 'Driver',
  TRANSPORT_MANAGER: 'Transport Manager'
};

/* ------------------------------------------------------------------ */
/* Stock by location                                                   */
/* ------------------------------------------------------------------ */

/** Quantity of an item in a warehouse; the main warehouse holds the remainder of the total. */
export const stockAt = (s: OperationsState, products: Product[], sku: string, warehouseId: string) => {
  const wh = s.warehouses.find((w) => w.id === warehouseId);
  const placed = s.placed[sku] ?? {};
  if (!wh?.main) return placed[warehouseId] ?? 0;
  const total = products.find((p) => p.sku === sku)?.stock ?? 0;
  const elsewhere = Object.values(placed).reduce((a, b) => a + b, 0);
  return Math.max(0, total - elsewhere);
};
export const inTransit = (s: OperationsState, sku: string) =>
  s.transfers.filter((t) => t.status === 'IN_TRANSIT').reduce((x, t) => x + t.lines.filter((l) => l.sku === sku).reduce((y, l) => y + l.qty, 0), 0);

export const warehouseUnits = (s: OperationsState, products: Product[], warehouseId: string) =>
  products.filter((p) => p.kind !== 'SERVICE').reduce((x, p) => x + stockAt(s, products, p.sku, warehouseId), 0);

export const countVariance = (lines: { expected: number; counted: number | null }[]) =>
  lines.reduce((x, l) => x + (l.counted === null ? 0 : l.counted - l.expected), 0);

/* ------------------------------------------------------------------ */
/* Production                                                          */
/* ------------------------------------------------------------------ */

export const BATCH_LABEL: Record<Batch['status'], string> = {
  PLANNED: 'Planned',
  RELEASED: 'Released',
  IN_PROGRESS: 'In production',
  QC: 'Quality check',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled'
};

export const materialNeed = (r: Recipe, qty: number) => r.materials.map((m) => ({ sku: m.sku, qty: round2((m.qty * qty) / r.batchSize) }));

export const shortages = (r: Recipe, qty: number, products: Product[]) =>
  materialNeed(r, qty)
    .map((n) => ({ ...n, have: products.find((p) => p.sku === n.sku)?.stock ?? 0 }))
    .filter((n) => n.have < n.qty);

export const batchCost = (b: Batch, products: Product[]) => round2(b.issued.reduce((x, i) => x + i.qty * (products.find((p) => p.sku === i.sku)?.cost ?? 0), 0));
export const batchYield = (b: Batch) => (b.plannedQty ? b.output / b.plannedQty : 0);

/* ------------------------------------------------------------------ */
/* Shipping                                                            */
/* ------------------------------------------------------------------ */

export const SHIP_STAGES: ShipmentStage[] = ['BOOKED', 'DOCUMENTS', 'LOADED', 'DEPARTED', 'ARRIVED', 'DELIVERED'];
export const SHIP_LABEL: Record<ShipmentStage, string> = {
  BOOKED: 'Booked',
  DOCUMENTS: 'Documents',
  LOADED: 'Loaded',
  DEPARTED: 'Departed',
  ARRIVED: 'Arrived',
  DELIVERED: 'Delivered'
};
export const shipValue = (s: Shipment) => round2(s.lines.reduce((x, l) => x + l.qty * l.price, 0));
export const docsReady = (s: Shipment) => s.docs.filter((d) => d.done).length / Math.max(1, s.docs.length);

/** What still blocks a shipment from moving to the next stage. */
export const shipBlockers = (s: Shipment) => {
  const next = SHIP_STAGES[SHIP_STAGES.indexOf(s.stage) + 1];
  const missing = (keys: string[]) => s.docs.filter((d) => keys.includes(d.key) && !d.done).map((d) => d.name);
  if (next === 'LOADED') {
    const out = missing(['packing']);
    if (!s.container || !s.seal) out.push('Container and seal numbers');
    return out;
  }
  if (next === 'DEPARTED') {
    const out = s.docs.filter((d) => !d.done).map((d) => d.name);
    if (!s.invoiceId) out.push('Export invoice raised in Finance');
    return out;
  }
  return [];
};

/* ------------------------------------------------------------------ */
/* Fleet                                                               */
/* ------------------------------------------------------------------ */

export const kmToService = (v: Vehicle) => v.lastServiceKm + v.serviceEveryKm - v.odometer;
export const vehicleAlerts = (v: Vehicle) => {
  const out: string[] = [];
  const km = kmToService(v);
  if (km <= 0) out.push(`Service overdue by ${Math.abs(km).toLocaleString()} km`);
  else if (km <= 800) out.push(`Service due in ${km.toLocaleString()} km`);
  const ins = daysBetween(TODAY, v.insuranceExpiry);
  if (ins <= 30) out.push(ins < 0 ? 'Insurance expired' : `Insurance expires in ${ins} days`);
  const insp = daysBetween(TODAY, v.inspectionExpiry);
  if (insp <= 30) out.push(insp < 0 ? 'Inspection expired' : `Inspection due in ${insp} days`);
  return out;
};

/** Kilometres per litre between consecutive fill-ups. */
export const fuelEfficiency = (s: OperationsState, vehicleId: string) => {
  const list = s.fuel.filter((f) => f.vehicleId === vehicleId).sort((a, b) => a.odometer - b.odometer);
  const legs = list.slice(1).map((f, i) => ({ date: f.date, kmpl: round2((f.odometer - list[i].odometer) / f.litres) }));
  const avg = legs.length ? round2(legs.reduce((x, l) => x + l.kmpl, 0) / legs.length) : null;
  return { legs, avg, last: legs[legs.length - 1]?.kmpl ?? null };
};

/* ------------------------------------------------------------------ */
/* Maintenance                                                         */
/* ------------------------------------------------------------------ */

export const LABOUR_RATE = 1_500;
export const WO_LABEL: Record<WorkOrder['status'], string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  REVIEW: 'Awaiting sign-off',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};
export const woCost = (w: WorkOrder, products: Product[]) =>
  round2(w.hours * (w.labourRate ?? LABOUR_RATE) + w.parts.reduce((x, p) => x + p.qty * (products.find((y) => y.sku === p.sku)?.cost ?? 0), 0) + w.contractorCost);
export const nextDue = (p: PmSchedule) => addDays(p.lastDone, p.everyDays);
export const pmState = (p: PmSchedule) => {
  const d = daysBetween(TODAY, nextDue(p));
  return d < 0 ? 'OVERDUE' : d <= 7 ? 'DUE' : 'OK';
};
