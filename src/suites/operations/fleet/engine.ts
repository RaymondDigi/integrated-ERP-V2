import { addDays, daysBetween, round2, TODAY } from '../../finance/engine';
import type { Product } from '../../commercial/types';
import { kmToService, woCost } from '../engine';
import type { OperationsState, Vehicle } from '../types';
import type { Carrier, ConsolidationPlan, FleetExtState, InsurancePolicy, RouteDef, TeaLot } from './types';

export const planKg = (p: Pick<ConsolidationPlan, 'lots'>) => p.lots.reduce((x, l) => x + l.kg, 0);
export const planPackages = (p: Pick<ConsolidationPlan, 'lots'>) => p.lots.reduce((x, l) => x + l.packages, 0);
export const routeKm = (r?: RouteDef) => (r ? Math.max(0, ...r.stops.map((s) => s.km)) : 0);

/** A vehicle may be planned on a run only if it is a truck that is free, in service and insured. */
export const allocationProblem = (v: Vehicle, on = TODAY) => {
  if (v.type !== 'Truck') return `${v.reg} is not a truck`;
  if (v.status !== 'AVAILABLE') return `${v.reg} is ${v.status === 'ON_TRIP' ? 'on a trip' : 'in the workshop'}`;
  if (v.ownership !== 'HIRED' && kmToService(v) <= 0) return `${v.reg} is overdue for service`;
  if (v.insuranceExpiry < on) return `${v.reg} insurance has expired`;
  return null;
};

/** Cost of one vehicle on the run (there and back): own fleet at the route rate, hired trucks at the carrier rate. */
export const legCost = (v: Vehicle, route: RouteDef | undefined, carriers: Carrier[]) => {
  const km = routeKm(route) * 2;
  const rate = v.ownership === 'HIRED' ? carriers.find((c) => c.id === v.carrierId)?.ratePerKm ?? 0 : route?.ratePerKm ?? 0;
  return round2(km * rate);
};

/**
 * Suggests vehicles for a plan: own trucks first (best capacity fit, most km left to service), then hired trucks,
 * until the plan's weight is covered.
 */
export const suggestAllocation = (plan: ConsolidationPlan, vehicles: Vehicle[]) => {
  const pool = vehicles.filter((v) => !allocationProblem(v, plan.plannedDate));
  let left = planKg(plan);
  const pick: Vehicle[] = [];
  for (const group of [pool.filter((v) => v.ownership !== 'HIRED'), pool.filter((v) => v.ownership === 'HIRED')]) {
    const rest = [...group];
    while (left > 0 && rest.length) {
      // Smallest truck that takes everything left; otherwise the largest one
      const fits = rest.filter((v) => v.capacityKg >= left).sort((a, b) => a.capacityKg - b.capacityKg || kmToService(b) - kmToService(a));
      const v = fits[0] ?? [...rest].sort((a, b) => b.capacityKg - a.capacityKg)[0];
      pick.push(v);
      left -= v.capacityKg;
      rest.splice(rest.indexOf(v), 1);
    }
  }
  return { vehicles: pick, uncovered: Math.max(0, left) };
};

/** Places whole lots on the chosen vehicles (largest lots first, first vehicle with room). */
export const packLots = (lots: TeaLot[], vehicles: Vehicle[]) => {
  const room = new Map(vehicles.map((v) => [v.id, v.capacityKg]));
  const out = new Map<string, string[]>(vehicles.map((v) => [v.id, []]));
  const unplaced: TeaLot[] = [];
  for (const l of [...lots].sort((a, b) => b.kg - a.kg)) {
    const v = vehicles.find((x) => (room.get(x.id) ?? 0) >= l.kg);
    if (!v) {
      unplaced.push(l);
      continue;
    }
    room.set(v.id, (room.get(v.id) ?? 0) - l.kg);
    out.get(v.id)!.push(l.lotNo);
  }
  return { byVehicle: out, unplaced };
};

/** Budget against actual for a plan: own trips at the route rate on the km actually driven, plus carrier charges. */
export const planActual = (plan: ConsolidationPlan, s: OperationsState, route: RouteDef | undefined) => {
  const own = plan.allocations
    .filter((a) => !a.hired && a.tripId)
    .map((a) => s.trips.find((t) => t.id === a.tripId))
    .filter(Boolean)
    .reduce((x, t) => x + ((t!.endKm ?? t!.startKm) - t!.startKm) * (route?.ratePerKm ?? 0), 0);
  const hired = plan.allocations.filter((a) => a.hired).reduce((x, a) => x + (a.carrierCost ?? 0), 0);
  return round2(own + hired);
};

/* ------------------------------------------------------------------ */
/* Vehicle performance                                                 */
/* ------------------------------------------------------------------ */

export const vehiclePerformance = (s: OperationsState, ext: FleetExtState, products: Product[], vehicleId: string, from: string, to: string) => {
  const trips = s.trips.filter((t) => t.vehicleId === vehicleId && t.status === 'DONE' && t.date >= from && t.date <= to);
  const logs = ext.dailyLogs.filter((l) => l.vehicleId === vehicleId && l.date >= from && l.date <= to);
  const fuel = s.fuel.filter((f) => f.vehicleId === vehicleId && f.date >= from && f.date <= to);
  const eqIds = s.equipment.filter((e) => e.vehicleId === vehicleId).map((e) => e.id);
  const wos = s.workOrders.filter((w) => eqIds.includes(w.equipmentId) && (w.status === 'COMPLETED' || w.status === 'REVIEW') && w.date >= from && w.date <= to);
  const tripKm = trips.reduce((x, t) => x + ((t.endKm ?? t.startKm) - t.startKm), 0);
  // Daily logs are the odometer record; trips count where no log covers the day
  const loggedDays = new Set(logs.map((l) => l.date));
  const km = logs.reduce((x, l) => x + (l.closeKm - l.openKm), 0) + trips.filter((t) => !loggedDays.has(t.date)).reduce((x, t) => x + ((t.endKm ?? t.startKm) - t.startKm), 0);
  const litres = round2(fuel.reduce((x, f) => x + f.litres, 0));
  const fuelCost = round2(fuel.reduce((x, f) => x + f.cost, 0));
  const repairCost = round2(wos.reduce((x, w) => x + woCost(w, products), 0));
  const kg = logs.reduce((x, l) => x + l.kgCarried, 0) + trips.filter((t) => !loggedDays.has(t.date)).reduce((x, t) => x + (t.loadKg ?? 0), 0);
  return {
    trips: trips.length,
    km: km || tripKm,
    litres,
    kmpl: litres ? round2((km || tripKm) / litres) : null,
    fuelCost,
    repairCost,
    jobs: wos.length,
    downtime: wos.reduce((x, w) => x + w.downtimeHours, 0),
    costPerKm: km || tripKm ? round2((fuelCost + repairCost) / (km || tripKm)) : null,
    kg,
    tonneKm: round2((kg / 1000) * (km || tripKm)),
    costPerTonne: kg ? round2(((fuelCost + repairCost) / kg) * 1000) : null
  };
};

/* ------------------------------------------------------------------ */
/* Insurance                                                           */
/* ------------------------------------------------------------------ */

export const REMINDER_DAYS = [30, 14, 7];
export const policyDays = (p: InsurancePolicy) => daysBetween(TODAY, p.expiry);
/** Reminder thresholds reached but not yet sent. */
export const dueReminders = (p: InsurancePolicy) => (p.status !== 'ACTIVE' ? [] : REMINDER_DAYS.filter((d) => policyDays(p) <= d && !p.remindersSent.includes(d)));

/* ------------------------------------------------------------------ */
/* Telematics simulation                                               */
/* ------------------------------------------------------------------ */

/** Way-points along the main corridors (lat, lng). */
export const CORRIDOR: { place: string; lat: number; lng: number }[] = [
  { place: 'Nairobi, Industrial Area', lat: -1.3086, lng: 36.8535 },
  { place: 'Athi River', lat: -1.4561, lng: 36.9784 },
  { place: 'Sultan Hamud', lat: -2.0167, lng: 37.375 },
  { place: 'Emali', lat: -2.0817, lng: 37.4703 },
  { place: 'Kibwezi', lat: -2.4167, lng: 37.9667 },
  { place: 'Mtito Andei', lat: -2.6896, lng: 38.1659 },
  { place: 'Voi', lat: -3.3961, lng: 38.5561 },
  { place: 'Mariakani', lat: -3.8622, lng: 39.4733 },
  { place: 'Changamwe, Mombasa', lat: -4.0233, lng: 39.6236 },
  { place: 'Kilindini port gate', lat: -4.0611, lng: 39.6556 }
];

export const positionAt = (progress: number) => {
  const p = Math.max(0, Math.min(1, progress)) * (CORRIDOR.length - 1);
  const i = Math.floor(p);
  const a = CORRIDOR[i];
  const b = CORRIDOR[Math.min(CORRIDOR.length - 1, i + 1)];
  const f = p - i;
  return { lat: round2((a.lat + (b.lat - a.lat) * f) * 1000) / 1000, lng: round2((a.lng + (b.lng - a.lng) * f) * 1000) / 1000, place: f < 0.5 ? a.place : b.place };
};

export const nextServiceDate = (v: Vehicle, kmPerDay: number) => (kmPerDay > 0 ? addDays(TODAY, Math.max(0, Math.round(kmToService(v) / kmPerDay))) : null);

/** Simple, stable hash of a letter for its e-signature stamp (not cryptographic — a demo integrity check). */
export const docHash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
};
