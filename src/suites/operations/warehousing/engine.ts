import { addDays, daysBetween, round2, TODAY } from '../../finance/engine';
import type { Carrier, ContainerType, CountPlan, Load, LotMove, LotMoveKind, ReportSchedule, StorageLocation, TaskType, TeaLot, WarehouseExtState, WarehouseTask, Worker } from './types';

/* ------------------------------------------------------------------ */
/* Lots and availability                                               */
/* ------------------------------------------------------------------ */

/** Kg that can still be promised: only QC-passed stock, less what is already reserved. */
export const availableKg = (l: TeaLot) => (l.status === 'IN_STOCK' && l.qc === 'PASS' ? Math.max(0, round2(l.netKg - l.reservedKg)) : 0);
export const lotBags = (l: TeaLot) => (l.kgPerBag ? Math.round(l.netKg / l.kgPerBag) : l.bags);
export const lotValue = (l: TeaLot) => round2(l.netKg * l.costPerKg);
export const daysToExpiry = (l: TeaLot) => daysBetween(TODAY, l.expiry);
export const expiryState = (l: TeaLot) => {
  const d = daysToExpiry(l);
  return d < 0 ? 'EXPIRED' : d <= 60 ? 'SOON' : 'OK';
};
/** First-expiry-first-out order for picking. */
export const fefo = (lots: TeaLot[]) => [...lots].sort((a, b) => a.expiry.localeCompare(b.expiry) || a.arrival.localeCompare(b.arrival));
export const weightVariance = (l: TeaLot) => (l.weighedKg === undefined ? null : round2(l.weighedKg - l.declaredKg));
export const QC_LABEL: Record<TeaLot['qc'], string> = { PENDING: 'Awaiting QC', PASS: 'Passed', HOLD: 'On hold', FAIL: 'Failed' };
export const OWNERSHIP_LABEL: Record<TeaLot['ownership'], string> = { OWNED: 'Own stock', CONSIGNMENT: 'Consignment (VMI)', CUSTOMER: 'Held for customer' };

/** Moves that change the kg on hand (the others only change status, owner or reservation). */
export const QTY_KINDS: LotMoveKind[] = ['RECEIPT', 'LOAD', 'DELIVERY', 'RETURN', 'COUNT', 'CONSUMPTION'];
export const MOVE_LABEL: Record<LotMoveKind, string> = {
  RECEIPT: 'Received',
  PUTAWAY: 'Put away',
  TRANSFER_POSTING: 'Transfer posting',
  RESERVE: 'Reserved',
  UNRESERVE: 'Reservation released',
  PICK: 'Picked',
  LOAD: 'Loaded into container',
  QC: 'Quality status',
  OWNERSHIP: 'Ownership transferred',
  COUNT: 'Count adjustment',
  RETURN: 'Returned',
  RELEASE: 'Released to buyer',
  DELIVERY: 'Delivered out',
  CONSUMPTION: 'Consumed (consignment)'
};

/** Net kg of each lot as it stood at the end of a date (current balance less later quantity moves). */
export const lotKgAsOf = (s: WarehouseExtState, date: string) => {
  const out: Record<string, number> = {};
  for (const l of s.lots) out[l.id] = l.netKg;
  for (const m of s.lotMoves) if (m.date > date && QTY_KINDS.includes(m.kind) && out[m.lotId] !== undefined) out[m.lotId] = round2(out[m.lotId] - m.kg);
  for (const l of s.lots) if (l.arrival > date) out[l.id] = 0;
  return out;
};

/** Every movement of one lot and its handling units — the lot's serial history. */
export const traceLot = (s: WarehouseExtState, lotId: string) => s.lotMoves.filter((m) => m.lotId === lotId).sort((a, b) => a.date.localeCompare(b.date));

export const ageingBucket = (days: number) => (days <= 30 ? '0–30 days' : days <= 60 ? '31–60 days' : days <= 90 ? '61–90 days' : days <= 180 ? '91–180 days' : 'Over 180 days');
export const AGEING_BUCKETS = ['0–30 days', '31–60 days', '61–90 days', '91–180 days', 'Over 180 days'];

/** ABC class by value: A = top 70% of stock value, B = next 20%, C = the rest. */
export const abcClasses = (lots: TeaLot[]) => {
  const sorted = [...lots].sort((a, b) => lotValue(b) - lotValue(a));
  const total = sorted.reduce((x, l) => x + lotValue(l), 0) || 1;
  let run = 0;
  const out: Record<string, 'A' | 'B' | 'C'> = {};
  for (const l of sorted) {
    run += lotValue(l);
    out[l.id] = run / total <= 0.7 ? 'A' : run / total <= 0.9 ? 'B' : 'C';
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Locations and slotting                                              */
/* ------------------------------------------------------------------ */

export const locLabel = (l?: StorageLocation) => (l ? `${l.block}-${l.bay}-${l.row}` : '—');
export const locationUsedKg = (s: WarehouseExtState, locationId: string) => round2(s.lots.filter((l) => l.locationId === locationId && l.status === 'IN_STOCK').reduce((x, l) => x + l.netKg, 0));

/** Best slot for incoming tea: a slot kept for the grade, else the emptiest general slot that fits; holds go to quarantine. */
export const suggestSlot = (s: WarehouseExtState, warehouseId: string, grade: string, kg: number, quarantine = false) => {
  const free = (l: StorageLocation) => l.capacityKg - locationUsedKg(s, l.id);
  const fits = s.locations.filter((l) => l.warehouseId === warehouseId && l.active && free(l) >= kg && (quarantine ? l.zone === 'QUARANTINE' : l.zone === 'GENERAL'));
  return fits.find((l) => l.preferredGrade === grade) ?? [...fits].sort((a, b) => free(b) - free(a))[0];
};

/* ------------------------------------------------------------------ */
/* Labour                                                              */
/* ------------------------------------------------------------------ */

export const TASK_MINUTES: Record<TaskType, number> = { RECEIVE: 45, PUTAWAY: 30, PICK: 40, STUFF: 120, COUNT: 90, QC: 30, DISPATCH: 25 };
export const workerLoad = (tasks: WarehouseTask[], name: string) => tasks.filter((t) => t.assignee === name && t.status !== 'DONE').reduce((x, t) => x + t.minutes, 0);

/** Least-loaded assignment: each open task goes to the qualified person at that site with the most free minutes. */
export const assignTasks = (tasks: WarehouseTask[], workers: Worker[]) => {
  const next = tasks.map((t) => ({ ...t }));
  const made: { task: string; to: string }[] = [];
  for (const t of next.filter((x) => x.status === 'OPEN' && !x.assignee).sort((a, b) => a.created.localeCompare(b.created))) {
    const pool = workers
      .filter((w) => w.skills.includes(t.type) && w.warehouseId === t.warehouseId)
      .map((w) => ({ w, free: w.shiftMinutes - workerLoad(next, w.name) }))
      .filter((x) => x.free >= t.minutes)
      .sort((a, b) => b.free - a.free);
    const pick = pool[0] ?? workers.filter((w) => w.skills.includes(t.type)).map((w) => ({ w, free: w.shiftMinutes - workerLoad(next, w.name) })).sort((a, b) => b.free - a.free)[0];
    if (pick && pick.free >= t.minutes) {
      t.assignee = pick.w.name;
      made.push({ task: t.number, to: pick.w.name });
    }
  }
  return { tasks: next, made };
};

/* ------------------------------------------------------------------ */
/* Counting                                                            */
/* ------------------------------------------------------------------ */

export const countPlanDue = (p: CountPlan) => addDays(p.lastDone, p.everyDays);
export const countPlanState = (p: CountPlan) => {
  const d = daysBetween(TODAY, countPlanDue(p));
  return d < 0 ? 'OVERDUE' : d <= 7 ? 'DUE' : 'OK';
};

/* ------------------------------------------------------------------ */
/* Container loading and VGM                                           */
/* ------------------------------------------------------------------ */

export const CONTAINER_SPEC: Record<ContainerType, { label: string; maxKg: number; maxBags: number; tareKg: number }> = {
  '20GP': { label: "20' general purpose", maxKg: 21_600, maxBags: 340, tareKg: 2_250 },
  '40GP': { label: "40' general purpose", maxKg: 26_500, maxBags: 700, tareKg: 3_750 },
  '40HC': { label: "40' high cube", maxKg: 26_300, maxBags: 760, tareKg: 3_900 }
};

/** Fill a container from candidate lots in order until weight or bag space runs out. */
export const planContainer = (candidates: { lotId: string; bags: number; kg: number }[], type: ContainerType) => {
  const spec = CONTAINER_SPEC[type];
  let kg = 0;
  let bags = 0;
  const lines: { lotId: string; bags: number; kg: number; seq: number }[] = [];
  for (const c of candidates) {
    if (!c.bags) continue;
    const perBag = c.kg / c.bags;
    const room = Math.min(spec.maxBags - bags, Math.floor((spec.maxKg - kg) / perBag));
    const take = Math.min(room, c.bags);
    if (take <= 0) continue;
    lines.push({ lotId: c.lotId, bags: take, kg: round2(take * perBag), seq: lines.length + 1 });
    kg = round2(kg + take * perBag);
    bags += take;
  }
  const left = candidates.reduce((x, c) => x + c.bags, 0) - bags;
  return { lines, kg, bags, fillKg: kg / spec.maxKg, fillBags: bags / spec.maxBags, left };
};
export const planCargoKg = (lines: { kg: number }[]) => round2(lines.reduce((x, l) => x + l.kg, 0));
/** SOLAS method 2: cargo + packing/dunnage + container tare. */
export const vgmMethod2 = (lines: { kg: number }[], tareKg: number, dunnageKg: number) => round2(planCargoKg(lines) + tareKg + dunnageKg);

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

export const LANES = ['Mombasa → Nairobi', 'Nairobi → Mombasa', 'Mombasa → Malaba', 'Mombasa → Busia', 'Mombasa → Kampala', 'Nairobi → Dubai (courier)'];

/** Rank the carriers serving a lane by price for this weight. */
export const rateShop = (carriers: Carrier[], lane: string, kg: number) =>
  carriers
    .flatMap((c) => c.rates.filter((r) => r.lane === lane).map((r) => ({ carrier: c, cost: round2(Math.max(r.minCharge, r.perKg * kg)), perKg: r.perKg })))
    .sort((a, b) => a.cost - b.cost);

export const carrierKpis = (loads: Load[], carrierId: string) => {
  const mine = loads.filter((l) => l.carrierId === carrierId && l.status !== 'PLANNED' && l.status !== 'TENDERED');
  const picked = mine.filter((l) => l.actualPickup);
  const delivered = mine.filter((l) => l.actualDelivery);
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
  return {
    loads: mine.length,
    onTimePickup: pct(picked.filter((l) => (l.actualPickup as string) <= l.plannedPickup).length, picked.length),
    onTimeDelivery: pct(delivered.filter((l) => (l.actualDelivery as string) <= l.plannedDelivery).length, delivered.length),
    turnBack: pct(mine.filter((l) => l.status === 'TURNED_BACK').length, mine.length),
    kg: round2(mine.reduce((x, l) => x + l.kg, 0))
  };
};

/** Rule-based consolidation: group what moves on the same lane on the same day. */
export const consolidate = <T extends { ref: string; lane: string; date: string; kg: number }>(items: T[]) => {
  const groups = new Map<string, T[]>();
  for (const i of items) groups.set(`${i.lane}|${i.date}`, [...(groups.get(`${i.lane}|${i.date}`) ?? []), i]);
  return Array.from(groups.entries()).map(([k, list]) => ({ lane: k.split('|')[0], date: k.split('|')[1], items: list, kg: round2(list.reduce((x, i) => x + i.kg, 0)) }));
};

/* ------------------------------------------------------------------ */
/* Warehouse billing                                                   */
/* ------------------------------------------------------------------ */

export const TARIFF_LABEL: Record<string, string> = { HANDLING_IN: 'Handling in', STORAGE: 'Storage', HANDLING_OUT: 'Handling out', STUFFING: 'Container stuffing' };

/** Activity charges for one owner's tea between two dates, built up from the lot ledger. */
export const billingFor = (s: WarehouseExtState, owner: string, from: string, to: string) => {
  const rate = (a: string) => s.tariffs.find((t) => t.activity === a)?.rate ?? 0;
  const lots = s.lots.filter((l) => l.owner === owner);
  const ids = new Set(lots.map((l) => l.id));
  const inPeriod = (m: LotMove) => ids.has(m.lotId) && m.date >= from && m.date <= to;
  const bagsIn = s.lotMoves.filter((m) => inPeriod(m) && m.kind === 'RECEIPT').reduce((x, m) => x + m.bags, 0);
  const bagsOut = s.lotMoves.filter((m) => inPeriod(m) && (m.kind === 'LOAD' || m.kind === 'DELIVERY')).reduce((x, m) => x + Math.abs(m.bags), 0);
  const tonneDays = round2(
    lots.reduce((x, l) => {
      const start = l.arrival > from ? l.arrival : from;
      const days = Math.max(0, daysBetween(start, to) + 1);
      return x + (l.netKg / 1000) * days;
    }, 0)
  );
  const containers = s.loadingPlans.filter((p) => p.status === 'STUFFED' && (p.stuffedAt ?? '') >= from && (p.stuffedAt ?? '') <= to && p.lines.some((x) => ids.has(x.lotId))).length;
  const lines = [
    { activity: 'HANDLING_IN', qty: bagsIn, unit: 'bags', rate: rate('HANDLING_IN') },
    { activity: 'STORAGE', qty: tonneDays, unit: 'tonne-days', rate: rate('STORAGE') },
    { activity: 'HANDLING_OUT', qty: bagsOut, unit: 'bags', rate: rate('HANDLING_OUT') },
    { activity: 'STUFFING', qty: containers, unit: 'containers', rate: rate('STUFFING') }
  ].map((l) => ({ ...l, amount: round2(l.qty * l.rate) }));
  return { lines, total: round2(lines.reduce((x, l) => x + l.amount, 0)) };
};

/* ------------------------------------------------------------------ */
/* Scheduled reports                                                   */
/* ------------------------------------------------------------------ */

export const METRIC_LABEL: Record<NonNullable<ReportSchedule['condition']>['metric'], string> = {
  HOLD_KG: 'Kg on QC hold',
  EXPIRING_LOTS: 'Lots expiring within 60 days',
  OCCUPANCY_PCT: 'Highest location occupancy %',
  OPEN_TASKS: 'Unassigned warehouse tasks'
};
export const metricValue = (s: WarehouseExtState, metric: keyof typeof METRIC_LABEL) => {
  if (metric === 'HOLD_KG') return round2(s.lots.filter((l) => l.qc === 'HOLD' && l.status === 'IN_STOCK').reduce((x, l) => x + l.netKg, 0));
  if (metric === 'EXPIRING_LOTS') return s.lots.filter((l) => l.status === 'IN_STOCK' && expiryState(l) !== 'OK').length;
  if (metric === 'OCCUPANCY_PCT') return Math.max(0, ...s.locations.map((l) => Math.round((locationUsedKg(s, l.id) / l.capacityKg) * 100)));
  return s.tasks.filter((t) => t.status === 'OPEN' && !t.assignee).length;
};
/** Is a schedule due to run now? Time-bound ones by their last run; conditional ones when the condition holds. */
export const scheduleDue = (s: WarehouseExtState, r: ReportSchedule) => {
  if (!r.active) return false;
  if (r.frequency === 'CONDITION' && r.condition) {
    const v = metricValue(s, r.condition.metric);
    return r.condition.op === '>' ? v > r.condition.value : v < r.condition.value;
  }
  if (!r.lastRun) return true;
  return daysBetween(r.lastRun.slice(0, 10), TODAY) >= (r.frequency === 'DAILY' ? 1 : 7);
};

/* ------------------------------------------------------------------ */
/* Units of measure                                                    */
/* ------------------------------------------------------------------ */

/** Quantity in the item's base unit; factor = base units in one of the alternative unit. */
export const toBase = (qty: number, uom: string, uoms: { code: string; factor: number }[] = []) => {
  const u = uoms.find((x) => x.code === uom);
  return round2(qty * (u?.factor ?? 1));
};

/** Environmental limits for stored tea. */
export const SENSOR_LIMITS = { tempC: 30, humidity: 70 };
