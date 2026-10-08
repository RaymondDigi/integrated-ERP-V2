import { addDays, daysBetween, round2, TODAY } from '../../finance/engine';
import type { Product } from '../../commercial/types';
import type { Batch, Equipment, OperationsState, PmSchedule, WorkOrder } from '../types';
import { kmToService, nextDue, pmState, stockAt, woCost } from '../engine';
import type { ConditionReading, EnergyReading, MaintenanceExtState, MaintNotification, Technician } from './types';

/** Work orders still open (not closed or cancelled). */
export const isOpenWo = (w: WorkOrder) => !['COMPLETED', 'CANCELLED'].includes(w.status);
export const SPARES_STORE = 'WH-NBO';
/** Hours a production line runs in a day */
export const LINE_HOURS = 8;

/* ------------------------------------------------------------------ */
/* Downtime planning                                                   */
/* ------------------------------------------------------------------ */

/** Planned maintenance outages on a production line for a date. */
export const lineOutage = (s: OperationsState, line: string, date: string) => {
  const eqIds = s.equipment.filter((e) => e.productionLine === line).map((e) => e.id);
  const wos = s.workOrders.filter((w) => isOpenWo(w) && w.plannedStart === date && (w.plannedDowntimeHours ?? 0) > 0 && eqIds.includes(w.equipmentId));
  return { hours: wos.reduce((x, w) => x + (w.plannedDowntimeHours ?? 0), 0), wos };
};

/** Upcoming planned downtime by production line (next n days), for Production and the labour schedule. */
export const plannedOutages = (s: OperationsState, days = 14) =>
  s.workOrders
    .filter((w) => isOpenWo(w) && w.plannedStart && w.plannedStart >= TODAY && w.plannedStart <= addDays(TODAY, days) && (w.plannedDowntimeHours ?? 0) > 0)
    .map((w) => ({ w, eq: s.equipment.find((e) => e.id === w.equipmentId) }))
    .filter((x) => x.eq?.productionLine)
    .sort((a, b) => (a.w.plannedStart ?? '').localeCompare(b.w.plannedStart ?? ''));

/* ------------------------------------------------------------------ */
/* Completion rules (configurable)                                     */
/* ------------------------------------------------------------------ */

export const COMPLETION_RULES = {
  /** Jobs other than inspections must carry a cost (labour, spares or contractor) */
  costRequired: true,
  /** Breakdowns must record the downtime */
  downtimeOnBreakdown: true,
  /** Every checklist step ticked */
  checklistComplete: true,
  /** Calibration jobs need an as-found / as-left record */
  calibrationRecord: true
};

export const completionBlockers = (w: WorkOrder, c: { hours: number; parts: { sku: string; qty: number }[]; contractorCost: number; downtimeHours: number }, products: Product[], hasCalibration: boolean) => {
  const out: string[] = [];
  const cost = woCost({ ...w, hours: w.hours + c.hours, parts: [...w.parts, ...c.parts], contractorCost: w.contractorCost + c.contractorCost }, products);
  if (COMPLETION_RULES.costRequired && w.kind !== 'INSPECTION' && !(cost > 0)) out.push('a job cost (labour hours, spares or contractor cost)');
  if (COMPLETION_RULES.downtimeOnBreakdown && w.kind === 'BREAKDOWN' && !(c.downtimeHours > 0)) out.push('the downtime hours for this breakdown');
  if (COMPLETION_RULES.checklistComplete && w.checklist?.some((x) => !x.done)) out.push(`all checklist steps ticked (${w.checklist.filter((x) => !x.done).length} open)`);
  if (COMPLETION_RULES.calibrationRecord && w.kind === 'CALIBRATION' && !hasCalibration) out.push('the calibration record (standard, as-found, as-left, certificate)');
  return out;
};

/* ------------------------------------------------------------------ */
/* Spares and labour availability                                      */
/* ------------------------------------------------------------------ */

/** Planned spares for a job against the spares store, net of what other scheduled jobs have reserved. */
export const woAvailability = (s: OperationsState, products: Product[], w: WorkOrder) =>
  (w.plannedParts ?? []).map((p) => {
    const have = stockAt(s, products, p.sku, SPARES_STORE);
    const reserved = s.workOrders
      .filter((x) => x.id !== w.id && (x.status === 'APPROVED' || x.status === 'IN_PROGRESS'))
      .reduce((a, x) => a + (x.plannedParts ?? []).filter((y) => y.sku === p.sku).reduce((b, y) => b + y.qty, 0), 0);
    const free = Math.max(0, have - reserved);
    return { sku: p.sku, need: p.qty, have, reserved, free, short: Math.max(0, p.qty - free) };
  });

/** Hours booked per technician per day against their capacity. */
export const labourLoad = (wos: WorkOrder[], techs: Technician[], date: string) =>
  techs.map((t) => {
    const jobs = wos.filter((w) => isOpenWo(w) && w.technicianId === t.id && w.plannedStart === date);
    const hours = jobs.reduce((x, w) => x + (w.estHours ?? 0), 0);
    return { tech: t, jobs, hours, capacity: t.hoursPerDay, over: hours > t.hoursPerDay };
  });

export const weekDays = (from = TODAY, n = 7) => Array.from({ length: n }, (_, i) => addDays(from, i));

/* ------------------------------------------------------------------ */
/* Asset history, reliability and prediction                           */
/* ------------------------------------------------------------------ */

export const equipmentHistory = (s: OperationsState, products: Product[], id: string) => {
  const wos = s.workOrders.filter((w) => w.equipmentId === id).sort((a, b) => b.date.localeCompare(a.date));
  const done = wos.filter((w) => w.status === 'COMPLETED' || w.status === 'REVIEW');
  const breakdowns = done.filter((w) => w.kind === 'BREAKDOWN').sort((a, b) => a.date.localeCompare(b.date));
  const cost = round2(done.reduce((x, w) => x + woCost(w, products), 0));
  const downtime = wos.reduce((x, w) => x + w.downtimeHours, 0);
  // Mean time between failures: days between consecutive breakdowns (or since the first one when there is only one)
  const gaps = breakdowns.slice(1).map((b, i) => daysBetween(breakdowns[i].date, b.date));
  const mtbfDays = gaps.length ? round2(gaps.reduce((a, b) => a + b, 0) / gaps.length) : breakdowns.length ? daysBetween(breakdowns[0].date, TODAY) : null;
  const mttrHours = breakdowns.length ? round2(breakdowns.reduce((x, w) => x + w.downtimeHours, 0) / breakdowns.length) : null;
  return { wos, done, breakdowns: breakdowns.length, cost, downtime, mtbfDays, mttrHours };
};

/** Linear trend of condition readings: rate per day and the days left before the alarm limit is reached. */
export const conditionTrend = (rs: ConditionReading[]) => {
  const pts = [...rs].sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return { slope: 0, last: pts[0], daysToAlarm: null as number | null, state: (pts[0] && pts[0].value >= pts[0].limitAlarm ? 'ALARM' : pts[0] && pts[0].value >= pts[0].limitWarn ? 'WARN' : 'OK') as 'OK' | 'WARN' | 'ALARM' };
  const xs = pts.map((p) => daysBetween(pts[0].date, p.date));
  const ys = pts.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den;
  const last = pts[pts.length - 1];
  const daysToAlarm = last.value >= last.limitAlarm ? 0 : slope > 0 ? Math.round((last.limitAlarm - last.value) / slope) : null;
  const state = last.value >= last.limitAlarm ? 'ALARM' : last.value >= last.limitWarn ? 'WARN' : 'OK';
  return { slope: round2(slope), last, daysToAlarm, state: state as 'OK' | 'WARN' | 'ALARM' };
};

/** Groups readings by equipment and parameter. */
export const conditionSeries = (rs: ConditionReading[]) => {
  const map = new Map<string, ConditionReading[]>();
  for (const r of rs) map.set(`${r.equipmentId}|${r.parameter}`, [...(map.get(`${r.equipmentId}|${r.parameter}`) ?? []), r]);
  return [...map.entries()].map(([k, list]) => ({ equipmentId: k.split('|')[0], parameter: k.split('|')[1], unit: list[0].unit, readings: list, trend: conditionTrend(list) }));
};

/* ------------------------------------------------------------------ */
/* System-raised notifications                                          */
/* ------------------------------------------------------------------ */

export const meterDue = (p: PmSchedule, eq?: Equipment) => (p.everyMeter && eq?.meter ? (p.lastMeter ?? 0) + p.everyMeter - eq.meter.reading : null);
export const calibrationDue = (e: Equipment) => (e.calibration?.required ? addDays(e.calibration.lastCalibrated ?? TODAY, e.calibration.intervalDays) : null);

/** Notices the system raises by itself: preventive tasks due, meter intervals reached, vehicle services, calibration and predicted failures. */
export const systemCandidates = (s: OperationsState, ext: MaintenanceExtState): Omit<MaintNotification, 'id' | 'number' | 'history'>[] => {
  const out: Omit<MaintNotification, 'id' | 'number' | 'history'>[] = [];
  const base = { source: 'SYSTEM' as const, raisedBy: 'System', date: TODAY, status: 'OPEN' as const };
  const hasOpenWo = (pred: (w: WorkOrder) => boolean) => s.workOrders.some((w) => isOpenWo(w) && pred(w));
  for (const p of s.schedules) {
    const eq = s.equipment.find((e) => e.id === p.equipmentId);
    const st = pmState(p);
    if (st !== 'OK' && !hasOpenWo((w) => w.scheduleId === p.id))
      out.push({ ...base, equipmentId: p.equipmentId, trigger: 'PM', key: `pm:${p.id}:${nextDue(p)}`, description: `${p.task} — ${st === 'OVERDUE' ? 'overdue' : 'due'} ${nextDue(p)}`, priority: st === 'OVERDUE' ? 'HIGH' : 'NORMAL' });
    const left = meterDue(p, eq);
    if (left !== null && left <= 0 && !hasOpenWo((w) => w.scheduleId === p.id))
      out.push({ ...base, equipmentId: p.equipmentId, trigger: 'METER', key: `meter:${p.id}:${p.lastMeter}`, description: `${p.task} — meter interval reached (${eq?.meter?.reading.toLocaleString()} ${eq?.meter?.unit.toLowerCase()})`, priority: 'HIGH' });
  }
  for (const v of s.vehicles) {
    const eq = s.equipment.find((e) => e.vehicleId === v.id);
    if (eq && kmToService(v) <= 0 && !hasOpenWo((w) => w.equipmentId === eq.id))
      out.push({ ...base, equipmentId: eq.id, trigger: 'VEHICLE', key: `veh:${v.id}:${v.lastServiceKm}`, description: `${v.reg} service overdue by ${Math.abs(kmToService(v)).toLocaleString()} km`, priority: 'HIGH' });
  }
  for (const e of s.equipment) {
    const due = calibrationDue(e);
    if (due && daysBetween(TODAY, due) <= 7 && !hasOpenWo((w) => w.equipmentId === e.id && w.kind === 'CALIBRATION'))
      out.push({ ...base, equipmentId: e.id, trigger: 'CALIBRATION', key: `cal:${e.id}:${due}`, description: `Calibration ${due < TODAY ? 'overdue since' : 'due'} ${due} (${e.calibration?.tolerance})`, priority: due < TODAY ? 'HIGH' : 'NORMAL' });
  }
  for (const c of conditionSeries(ext.conditions)) {
    const t = c.trend;
    if ((t.state !== 'OK' || (t.daysToAlarm !== null && t.daysToAlarm <= 30)) && !hasOpenWo((w) => w.equipmentId === c.equipmentId && w.kind !== 'PREVENTIVE'))
      out.push({
        ...base,
        equipmentId: c.equipmentId,
        trigger: 'PREDICTIVE',
        key: `pred:${c.equipmentId}:${c.parameter}:${t.last?.date}`,
        description: `${c.parameter} ${t.last?.value} ${c.unit} (${t.state === 'ALARM' ? 'above alarm limit' : t.state === 'WARN' ? 'above warning limit' : 'rising'})${t.daysToAlarm ? ` — alarm limit in about ${t.daysToAlarm} days` : ''}`,
        priority: t.state === 'ALARM' ? 'URGENT' : 'HIGH'
      });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export interface KpiFilter {
  from: string;
  to: string;
  equipmentId: string;
  costCentre: string;
  kind: string;
}

export const costCentreOf = (s: OperationsState, w: WorkOrder) => w.costCentre ?? s.equipment.find((e) => e.id === w.equipmentId)?.costCentre ?? 'Operations';

export const maintenanceKpis = (s: OperationsState, products: Product[], f: KpiFilter) => {
  const inRange = s.workOrders.filter(
    (w) => w.date >= f.from && w.date <= f.to && (!f.equipmentId || w.equipmentId === f.equipmentId) && (!f.kind || w.kind === f.kind) && (!f.costCentre || costCentreOf(s, w) === f.costCentre)
  );
  const done = inRange.filter((w) => w.status === 'COMPLETED' || w.status === 'REVIEW');
  const sum = (by: (w: WorkOrder) => string) => {
    const m = new Map<string, number>();
    for (const w of done) m.set(by(w), round2((m.get(by(w)) ?? 0) + woCost(w, products)));
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const breakdowns = done.filter((w) => w.kind === 'BREAKDOWN');
  const days = Math.max(1, daysBetween(f.from, f.to));
  const assets = f.equipmentId ? 1 : s.equipment.length;
  const pmDone = done.filter((w) => w.kind === 'PREVENTIVE');
  const pmLate = pmDone.filter((w) => (w.history.find((h) => h.action === 'Completed')?.at.slice(0, 10) ?? w.date) > w.due);
  const backlog = s.workOrders.filter((w) => isOpenWo(w) && (!f.equipmentId || w.equipmentId === f.equipmentId) && (!f.costCentre || costCentreOf(s, w) === f.costCentre));
  const ageing = [
    { label: '0–7 days', value: backlog.filter((w) => daysBetween(w.date, TODAY) <= 7).length },
    { label: '8–30 days', value: backlog.filter((w) => daysBetween(w.date, TODAY) > 7 && daysBetween(w.date, TODAY) <= 30).length },
    { label: 'Over 30 days', value: backlog.filter((w) => daysBetween(w.date, TODAY) > 30).length }
  ];
  return {
    rows: inRange,
    total: round2(done.reduce((x, w) => x + woCost(w, products), 0)),
    byType: sum((w) => w.kind.charAt(0) + w.kind.slice(1).toLowerCase()),
    byEquipment: sum((w) => s.equipment.find((e) => e.id === w.equipmentId)?.name ?? w.equipmentId),
    byCostCentre: sum((w) => costCentreOf(s, w)),
    breakdowns: breakdowns.length,
    downtime: inRange.reduce((x, w) => x + w.downtimeHours, 0),
    mtbfDays: breakdowns.length ? round2((days * assets) / breakdowns.length) : null,
    mttrHours: breakdowns.length ? round2(breakdowns.reduce((x, w) => x + w.downtimeHours, 0) / breakdowns.length) : null,
    pmCompliance: pmDone.length ? Math.round(((pmDone.length - pmLate.length) / pmDone.length) * 100) : null,
    backlog: backlog.length,
    ageing
  };
};

export const ENERGY_TARIFF: Record<EnergyReading['source'], number> = { GRID: 24.5, GENERATOR: 58, SOLAR: 0 };

/** Energy use and cost by source, with kWh per kg of tea packed from completed batches in the same period. */
export const energyReport = (energy: EnergyReading[], batches: Batch[], from: string, to: string, kgPerUnit: (b: Batch) => number) => {
  const rs = energy.filter((e) => e.date >= from && e.date <= to);
  const by = (src: EnergyReading['source']) => rs.filter((e) => e.source === src);
  const kWh = rs.reduce((x, e) => x + e.kWh, 0);
  const cost = round2(rs.reduce((x, e) => x + e.cost, 0));
  const kg = batches.filter((b) => b.status === 'COMPLETED' && b.date >= from && b.date <= to).reduce((x, b) => x + kgPerUnit(b), 0);
  const sources = (['GRID', 'GENERATOR', 'SOLAR'] as const).map((src) => ({ source: src, kWh: by(src).reduce((x, e) => x + e.kWh, 0), cost: round2(by(src).reduce((x, e) => x + e.cost, 0)) }));
  return { kWh, cost, kg, perKg: kg ? round2(kWh / kg) : null, costPerKg: kg ? round2(cost / kg) : null, solarShare: kWh ? Math.round((sources[2].kWh / kWh) * 100) : 0, sources };
};
