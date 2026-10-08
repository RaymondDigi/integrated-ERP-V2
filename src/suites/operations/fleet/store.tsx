import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { useAccess } from '../../../platform/access';
import { notify } from '../../../platform/outbox';
import { audit } from '../../../platform/audit';
import type { ESignature } from '../../../platform/Widgets';
import { addDays, localStamp, round2, TODAY } from '../../finance/engine';
import { useOperations } from '../store';
import { opsHooks } from '../hooks';
import type { OpsRole } from '../types';
import { buildFleetSeed } from './data';
import { allocationProblem, docHash, dueReminders, legCost, packLots, planActual, planKg, policyDays, positionAt, routeKm, suggestAllocation } from './engine';
import type { ConsolidationPlan, DefectReport, FleetExtState, InsurancePolicy, LetterTemplate, RouteDef, TeaLot, TransportLetter, VehicleRequest } from './types';

type Result = { ok: true; id?: string } | { ok: false; error: string };

const Ctx = createContext<ReturnType<typeof useFleetStore> | null>(null);

export const LETTER_LABEL: Record<LetterTemplate, string> = {
  AUTHORITY_TO_DRIVE: 'Authority to drive',
  CARRIER_INSTRUCTION: 'Carrier instruction (hired truck)',
  INSURANCE_CLAIM: 'Insurance claim notification',
  GATE_PASS: 'Gate pass / release of goods'
};

const useFleetStore = () => {
  const { addToast } = useApp();
  const ops = useOperations();
  const access = useAccess();
  const [state, setState] = useState<FleetExtState>(buildFleetSeed);
  const ref = useRef(state);
  ref.current = state;
  const actor = ops.actor;

  const commit = (next: FleetExtState) => {
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
  const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const next = (s: FleetExtState, prefix: string) => {
    const n = (s.sequence[prefix] ?? 0) + 1;
    return { number: `${prefix}-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`, sequence: { ...s.sequence, [prefix]: n } };
  };
  const log = (action: string, note?: string) => ({ at: localStamp(), by: actor.name, action, note });
  const is = (...roles: OpsRole[]) => roles.includes(actor.role);
  const guard = (...roles: OpsRole[]) => {
    if (!access.canWrite) return fail('This is a read-only account — sign in as a member or manager to make changes');
    if (roles.length && !is(...roles)) return fail(`This needs the ${roles.map((r) => r.toLowerCase().replace('_', ' ')).join(' or ')} role — switch who you are acting as`);
    return null;
  };
  const vehicle = (id: string) => ops.snapshot().vehicles.find((v) => v.id === id);
  const reg = (id: string) => vehicle(id)?.reg ?? id;
  const updatePlan = (id: string, patch: Partial<ConsolidationPlan>, action: string, note?: string) =>
    commit({ ...ref.current, plans: ref.current.plans.map((p) => (p.id === id ? { ...p, ...patch, history: [...p.history, log(action, note)] } : p)) });

  /* ---------------- Hook: trips against vehicle requests ---------------- */
  opsHooks.tripRequest = (requestId, vehicleId) => {
    const r = ref.current.requests.find((x) => x.id === requestId);
    if (!r) return 'Vehicle request not found';
    if (r.status !== 'APPROVED') return `${r.number} is ${r.status.toLowerCase()} — only approved requests can be allocated`;
    const v = vehicle(vehicleId);
    if (v && r.kg > v.capacityKg) return `${v.reg} carries ${v.capacityKg.toLocaleString()} kg — the request needs ${r.kg.toLocaleString()} kg`;
    return null;
  };

  /* ---------------- Routes and consolidation plans ---------------- */
  const saveRoute = (r: RouteDef): Result => {
    const g = guard('TRANSPORT_MANAGER', 'OFFICER', 'MANAGER');
    if (g) return g;
    if (!r.name.trim()) return fail('Name the route');
    const stops = r.stops.filter((x) => x.site.trim()).map((x, i) => ({ ...x, seq: i + 1 }));
    if (stops.length < 2) return fail('A route needs at least two stops');
    if (stops.some((x, i) => i > 0 && x.km <= stops[i - 1].km)) return fail('Distances must increase stop by stop');
    if (!(r.ratePerKm > 0)) return fail('Enter the running cost per km');
    const s = ref.current;
    const rec = { ...r, stops, id: r.id || uid('rt') };
    commit({ ...s, routes: r.id && s.routes.some((x) => x.id === r.id) ? s.routes.map((x) => (x.id === r.id ? rec : x)) : [...s.routes, rec] });
    return done('Route saved', r.name, rec.id);
  };
  const createPlan = (f: { plannedDate: string; routeId: string; priority: ConsolidationPlan['priority']; lots: TeaLot[]; notes: string }): Result => {
    const g = guard('OFFICER', 'TRANSPORT_MANAGER', 'MANAGER');
    if (g) return g;
    const route = ref.current.routes.find((r) => r.id === f.routeId);
    if (!route) return fail('Choose the route');
    if (!f.plannedDate || f.plannedDate < TODAY) return fail('The planned date cannot be in the past');
    const lots = f.lots.filter((l) => l.lotNo.trim());
    if (!lots.length) return fail('Add the tea lots to collect');
    const sites = route.stops.map((x) => x.site);
    for (const l of lots) {
      if (!l.garden.trim() || !l.grade.trim()) return fail(`Lot ${l.lotNo}: enter the garden mark and grade`);
      if (!(l.packages > 0) || !(l.kg > 0)) return fail(`Lot ${l.lotNo}: packages and weight must be above zero`);
      if (!sites.includes(l.pickupSite)) return fail(`Lot ${l.lotNo}: ${l.pickupSite || 'the pickup site'} is not a stop on ${route.name}`);
    }
    const dup = lots.find((l, i) => lots.findIndex((x) => x.lotNo === l.lotNo) !== i);
    if (dup) return fail(`Lot ${dup.lotNo} is listed twice`);
    const open = ref.current.plans.filter((p) => !['CLOSED', 'CANCELLED'].includes(p.status)).flatMap((p) => p.lots.map((l) => l.lotNo));
    const taken = lots.find((l) => open.includes(l.lotNo));
    if (taken) return fail(`Lot ${taken.lotNo} is already on another open plan`);
    const s = ref.current;
    const { number, sequence } = next(s, 'CP');
    const plan: ConsolidationPlan = { id: uid('cp'), number, plannedDate: f.plannedDate, routeId: f.routeId, priority: f.priority, lots, status: 'DRAFT', allocations: [], budgetCost: 0, createdBy: actor.name, notes: f.notes, history: [log('Plan created', `${lots.length} lots, ${planKg({ lots }).toLocaleString()} kg`)] };
    commit({ ...s, sequence, plans: [plan, ...s.plans] });
    return done('Consolidation plan created', `${number} — allocate vehicles next`, plan.id);
  };
  /** Allocates vehicles (own first, then hired) after checking they are free, insured and can carry the plan's weight. */
  const allocate = (planId: string, vehicleIds: string[]): Result => {
    const g = guard('TRANSPORT_MANAGER', 'OFFICER', 'MANAGER');
    if (g) return g;
    const plan = ref.current.plans.find((p) => p.id === planId)!;
    if (plan.status !== 'DRAFT' && plan.status !== 'ALLOCATED') return fail(`${plan.number} is already ${plan.status.toLowerCase()}`);
    const vs = vehicleIds.map((id) => vehicle(id)).filter((v): v is NonNullable<typeof v> => !!v);
    if (!vs.length) return fail('Choose at least one vehicle');
    for (const v of vs) {
      const why = allocationProblem(v, plan.plannedDate);
      if (why) return fail(why);
    }
    const busy = ref.current.plans.filter((p) => p.id !== planId && p.plannedDate === plan.plannedDate && ['ALLOCATED', 'LOADING', 'DISPATCHED'].includes(p.status)).flatMap((p) => p.allocations.map((a) => a.vehicleId));
    const clash = vs.find((v) => busy.includes(v.id));
    if (clash) return fail(`${clash.reg} is already allocated to another run on ${plan.plannedDate}`);
    const kg = planKg(plan);
    const cap = vs.reduce((x, v) => x + v.capacityKg, 0);
    if (cap < kg) return fail(`The chosen vehicles carry ${cap.toLocaleString()} kg but the plan is ${kg.toLocaleString()} kg — add a vehicle or a hired truck`);
    const packed = packLots(plan.lots, vs);
    if (packed.unplaced.length) return fail(`Lot ${packed.unplaced[0].lotNo} (${packed.unplaced[0].kg} kg) does not fit on any one vehicle — lots are not split`);
    const route = ref.current.routes.find((r) => r.id === plan.routeId);
    const allocations = vs
      .filter((v) => packed.byVehicle.get(v.id)!.length)
      .map((v) => {
        const lots = packed.byVehicle.get(v.id)!;
        return { vehicleId: v.id, kg: plan.lots.filter((l) => lots.includes(l.lotNo)).reduce((x, l) => x + l.kg, 0), hired: v.ownership === 'HIRED', lots, carrierCost: v.ownership === 'HIRED' ? legCost(v, route, ref.current.carriers) : undefined };
      });
    const budgetCost = round2(allocations.reduce((x, a) => x + legCost(vehicle(a.vehicleId)!, route, ref.current.carriers), 0));
    updatePlan(planId, { allocations, budgetCost, status: 'ALLOCATED' }, 'Vehicles allocated', allocations.map((a) => `${reg(a.vehicleId)} ${a.kg.toLocaleString()} kg`).join(', '));
    for (const a of allocations.filter((x) => x.hired)) {
      const c = ref.current.carriers.find((x) => x.id === vehicle(a.vehicleId)?.carrierId);
      notify({ module: 'Fleet', to: c?.name ?? 'Carrier', address: c?.email, subject: `Truck booking ${plan.number} — ${reg(a.vehicleId)} on ${plan.plannedDate}`, body: `${route?.name}: ${a.kg.toLocaleString()} kg tea, agreed rate ${a.carrierCost?.toLocaleString()} KES`, ref: plan.number, channels: ['EMAIL'] });
    }
    return done('Vehicles allocated', `${plan.number}: ${allocations.length} vehicle${allocations.length === 1 ? '' : 's'}, budget ${budgetCost.toLocaleString()} KES`);
  };
  const autoAllocate = (planId: string): Result => {
    const plan = ref.current.plans.find((p) => p.id === planId)!;
    const s = suggestAllocation(plan, ops.snapshot().vehicles);
    if (s.uncovered > 0) return fail(`Not enough free trucks — ${s.uncovered.toLocaleString()} kg cannot be covered`);
    return allocate(planId, s.vehicles.map((v) => v.id));
  };
  const cancelPlan = (planId: string, reason: string): Result => {
    const g = guard('TRANSPORT_MANAGER', 'MANAGER');
    if (g) return g;
    const plan = ref.current.plans.find((p) => p.id === planId)!;
    if (!['DRAFT', 'ALLOCATED'].includes(plan.status)) return fail('Only plans not yet loading can be cancelled');
    if (!reason.trim()) return fail('Give a reason');
    updatePlan(planId, { status: 'CANCELLED' }, 'Cancelled', reason);
    return done('Plan cancelled', plan.number);
  };
  /** Loading instruction for one vehicle: truck, driver, route stops and the teas to load. */
  const issueInstruction = (planId: string, vehicleId: string, driver: string): Result => {
    const g = guard('OFFICER', 'TRANSPORT_MANAGER', 'STOREKEEPER', 'MANAGER');
    if (g) return g;
    const plan = ref.current.plans.find((p) => p.id === planId)!;
    const a = plan.allocations.find((x) => x.vehicleId === vehicleId);
    if (!a) return fail('That vehicle is not allocated to this plan');
    if (a.instructionId) return fail('A loading instruction is already issued for this vehicle');
    const v = vehicle(vehicleId)!;
    if (a.kg > v.capacityKg) return fail(`${v.reg} carries ${v.capacityKg.toLocaleString()} kg — the load is ${a.kg.toLocaleString()} kg`);
    if (!driver.trim()) return fail('Enter the driver');
    const route = ref.current.routes.find((r) => r.id === plan.routeId)!;
    const dest = route.stops[route.stops.length - 1].site;
    const s = ref.current;
    const { number, sequence } = next(s, 'LI');
    const id = uid('li');
    commit({
      ...s,
      sequence,
      instructions: [{ id, number, planId, vehicleId, driver: driver.trim(), routeId: plan.routeId, teas: plan.lots.filter((l) => a.lots.includes(l.lotNo)).map((l) => ({ ...l, to: dest })), status: 'ISSUED', issuedBy: actor.name, issuedAt: localStamp() }, ...s.instructions],
      plans: s.plans.map((p) => (p.id === planId ? { ...p, status: 'LOADING', allocations: p.allocations.map((x) => (x.vehicleId === vehicleId ? { ...x, instructionId: id } : x)), history: [...p.history, log(`Loading instruction ${number} issued`, `${v.reg} · ${driver}`)] } : p))
    });
    notify({ module: 'Fleet', to: driver, subject: `Loading instruction ${number}`, body: `${v.reg}: ${a.lots.join(', ')} — ${route.name}`, ref: number, channels: ['SMS', 'IN_APP'] });
    return done('Loading instruction issued', number, id);
  };
  /** Loaded and dispatched: the trip starts in the fleet log with the weight on board. */
  const dispatchInstruction = (id: string): Result => {
    const g = guard('STOREKEEPER', 'OFFICER', 'TRANSPORT_MANAGER', 'DRIVER', 'MANAGER');
    if (g) return g;
    const li = ref.current.instructions.find((x) => x.id === id)!;
    if (li.status !== 'ISSUED') return fail(`${li.number} is already ${li.status.toLowerCase()}`);
    const plan = ref.current.plans.find((p) => p.id === li.planId)!;
    const route = ref.current.routes.find((r) => r.id === li.routeId);
    const kg = li.teas.reduce((x, t) => x + t.kg, 0);
    const r = ops.startTrip(li.vehicleId, `Consolidation ${plan.number} (${li.number})`, route?.name ?? '', li.driver, { loadKg: kg, planId: plan.id, kind: 'CONSOLIDATION' });
    if (!r.ok) return r;
    const trip = ops.snapshot().trips.find((t) => t.id === r.id);
    const s = ref.current;
    const plans = s.plans.map((p) => (p.id === plan.id ? { ...p, allocations: p.allocations.map((a) => (a.vehicleId === li.vehicleId ? { ...a, tripId: r.id, tripNumber: trip?.number } : a)) } : p));
    const updated = plans.find((p) => p.id === plan.id)!;
    const allOut = updated.allocations.every((a) => a.tripId);
    commit({
      ...s,
      instructions: s.instructions.map((x) => (x.id === id ? { ...x, status: 'LOADED', loadedAt: localStamp() } : x)),
      plans: plans.map((p) => (p.id === plan.id ? { ...p, status: allOut ? 'DISPATCHED' : p.status, history: [...p.history, log(`${reg(li.vehicleId)} loaded and dispatched`, trip?.number)] } : p))
    });
    return { ok: true, id: r.id };
  };
  const deliverInstruction = (id: string, endKm: number, containerNo?: string): Result => {
    const g = guard('STOREKEEPER', 'OFFICER', 'TRANSPORT_MANAGER', 'DRIVER', 'MANAGER');
    if (g) return g;
    const li = ref.current.instructions.find((x) => x.id === id)!;
    if (li.status !== 'LOADED') return fail('Only loaded trucks can be delivered');
    const plan = ref.current.plans.find((p) => p.id === li.planId)!;
    const a = plan.allocations.find((x) => x.vehicleId === li.vehicleId);
    if (a?.tripId) {
      const r = ops.endTrip(a.tripId, endKm);
      if (!r.ok) return r;
    }
    commit({ ...ref.current, instructions: ref.current.instructions.map((x) => (x.id === id ? { ...x, status: 'DELIVERED', deliveredAt: localStamp(), containerNo } : x)) });
    updatePlan(plan.id, {}, `${reg(li.vehicleId)} delivered`, containerNo ? `Into container ${containerNo}` : undefined);
    return done('Delivered', `${li.number}${containerNo ? ` → ${containerNo}` : ''}`);
  };
  /** Closes the run: every load delivered; hired trucks are billed by their carrier through Finance. */
  const closePlan = (planId: string): Result => {
    const g = guard('TRANSPORT_MANAGER', 'MANAGER');
    if (g) return g;
    const plan = ref.current.plans.find((p) => p.id === planId)!;
    if (plan.status !== 'DISPATCHED') return fail('Close a plan once every vehicle is dispatched');
    const open = ref.current.instructions.filter((x) => x.planId === planId && x.status !== 'DELIVERED');
    if (open.length) return fail(`${open.map((x) => x.number).join(', ')} not yet delivered`);
    const bills: string[] = [];
    const billOf = new Map<string, string>();
    for (const a of plan.allocations.filter((x) => x.hired && !x.carrierBill && x.carrierCost)) {
      const v = vehicle(a.vehicleId)!;
      const carrier = ref.current.carriers.find((c) => c.id === v.carrierId)!;
      let party = ops.finance.snapshot().parties.find((p) => p.name === carrier.name);
      if (!party) {
        ops.finance.saveParty({ id: '', kind: 'SUPPLIER', name: carrier.name, pin: 'P05' + carrier.id.toUpperCase(), email: carrier.email, phone: carrier.phone, terms: 30, category: 'Transport' });
        party = ops.finance.snapshot().parties.find((p) => p.name === carrier.name);
      }
      if (!party) return fail(`Could not set up ${carrier.name} in Finance`);
      const r = ops.finance.saveDocument({ kind: 'BILL', partyId: party.id, date: TODAY, dueDate: addDays(TODAY, party.terms), reference: `${plan.number} ${v.reg}`, department: 'Transport', notes: `Hired truck on ${plan.number}`, lines: [{ id: uid('l'), description: `Tea haulage ${v.reg} — ${plan.number} (${a.kg.toLocaleString()} kg)`, account: '6300', qty: 1, price: a.carrierCost!, vat: true }] }, actor.name);
      if (!r.ok || !r.id) return r;
      const billNo = ops.finance.snapshot().documents.find((d) => d.id === r.id)?.number ?? '';
      bills.push(billNo);
      billOf.set(a.vehicleId, billNo);
    }
    const route = ref.current.routes.find((r) => r.id === plan.routeId);
    const actualCost = planActual(plan, ops.snapshot(), route);
    updatePlan(planId, { status: 'CLOSED', closedOn: TODAY, actualCost, allocations: plan.allocations.map((a) => (billOf.has(a.vehicleId) ? { ...a, carrierBill: billOf.get(a.vehicleId) } : a)) }, 'Closed', `Actual ${actualCost.toLocaleString()} KES against budget ${plan.budgetCost.toLocaleString()} KES${bills.length ? ` · carrier bills ${bills.join(', ')}` : ''}`);
    return done('Plan closed', bills.length ? `Carrier bills ${bills.join(', ')} raised in Finance` : plan.number);
  };

  /* ---------------- Daily log ---------------- */
  const recordDaily = (vehicleId: string, date: string, closeKm: number, kgCarried: number, driver: string): Result => {
    const g = guard('DRIVER', 'OFFICER', 'TRANSPORT_MANAGER', 'MANAGER');
    if (g) return g;
    const v = vehicle(vehicleId);
    if (!v) return fail('Choose the vehicle');
    if (!date || date > TODAY) return fail('Choose a date up to today');
    if (ref.current.dailyLogs.some((l) => l.vehicleId === vehicleId && l.date === date)) return fail(`${v.reg} already has a log for ${date}`);
    const prev = ref.current.dailyLogs.filter((l) => l.vehicleId === vehicleId && l.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
    const later = ref.current.dailyLogs.filter((l) => l.vehicleId === vehicleId && l.date > date).sort((a, b) => a.date.localeCompare(b.date))[0];
    const openKm = prev?.closeKm ?? v.odometer;
    if (!(closeKm >= openKm)) return fail(`Closing odometer must be at least ${openKm.toLocaleString()} km`);
    if (later && closeKm > later.openKm) return fail(`The next day's log opens at ${later.openKm.toLocaleString()} km`);
    if (closeKm - openKm > 1_500) return fail('More than 1,500 km in a day — check the reading');
    if (kgCarried < 0) return fail('Weight cannot be negative');
    if (kgCarried > v.capacityKg * 3) return fail(`${kgCarried.toLocaleString()} kg is more than three full loads for ${v.reg}`);
    commit({ ...ref.current, dailyLogs: [{ id: uid('dl'), vehicleId, date, openKm, closeKm, kgCarried, driver: driver || v.driver, by: actor.name }, ...ref.current.dailyLogs] });
    ops.mutate((s) => ({ ...s, vehicles: s.vehicles.map((x) => (x.id === vehicleId ? { ...x, odometer: Math.max(x.odometer, closeKm) } : x)) }));
    return done('Daily log saved', `${v.reg}: ${(closeKm - openKm).toLocaleString()} km, ${kgCarried.toLocaleString()} kg`);
  };

  /* ---------------- Defects ---------------- */
  const raiseDefect = (vehicleId: string, odometer: number, items: DefectReport['items']): Result => {
    const g = guard('DRIVER', 'OFFICER', 'TRANSPORT_MANAGER');
    if (g) return g;
    const v = vehicle(vehicleId);
    if (!v) return fail('Choose the vehicle');
    const list = items.filter((i) => i.description.trim());
    if (!list.length) return fail('Describe at least one defect');
    if (!(odometer > 0)) return fail('Enter the odometer reading');
    if (odometer + 5 < v.odometer) return fail(`The odometer cannot be below the last recorded ${v.odometer.toLocaleString()} km`);
    const s = ref.current;
    const { number, sequence } = next(s, 'DEF');
    const safetyCritical = list.some((i) => i.severity === 'CRITICAL');
    commit({ ...s, sequence, defects: [{ id: uid('df'), number, vehicleId, driver: actor.name, odometer, date: TODAY, items: list, safetyCritical, status: 'SUBMITTED', history: [log('Defect reported', list.map((i) => `${i.area}: ${i.description}`).join('; '))] }, ...s.defects] });
    notify({ module: 'Fleet', to: 'Transport Manager', subject: `${safetyCritical ? 'SAFETY-CRITICAL defect' : 'Vehicle defect'} ${number} — ${v.reg}`, body: list.map((i) => `${i.severity}: ${i.area} — ${i.description}`).join('\n'), ref: number, level: safetyCritical ? 'critical' : 'warning', channels: safetyCritical ? ['IN_APP', 'EMAIL', 'SMS'] : ['IN_APP', 'EMAIL'] });
    return done('Defect reported', `${number} — waiting for the Transport Manager`);
  };
  /** Transport Manager approves: a breakdown work order is raised and a safety-critical vehicle comes off the road. */
  const approveDefect = (id: string): Result => {
    const g = guard('TRANSPORT_MANAGER');
    if (g) return g;
    const dr = ref.current.defects.find((x) => x.id === id)!;
    if (dr.status !== 'SUBMITTED') return fail('Already decided');
    if (dr.driver === actor.name) return fail('You reported this defect, so someone else must approve it');
    const eq = ops.snapshot().equipment.find((e) => e.vehicleId === dr.vehicleId);
    if (!eq) return fail(`${reg(dr.vehicleId)} is not in the maintenance register — add it as equipment first`);
    const r = ops.raiseWorkOrder({ equipmentId: eq.id, title: `Defect ${dr.number}: ${dr.items.map((i) => i.area).join(', ')}`, kind: 'BREAKDOWN', priority: dr.safetyCritical ? 'URGENT' : 'HIGH', due: addDays(TODAY, dr.safetyCritical ? 1 : 3), notes: dr.items.map((i) => `${i.severity} — ${i.area}: ${i.description}`).join('\n'), costCentre: eq.costCentre });
    if (!r.ok || !r.id) return r;
    const wo = ops.snapshot().workOrders.find((w) => w.id === r.id);
    if (dr.safetyCritical) ops.mutate((s) => ({ ...s, vehicles: s.vehicles.map((v) => (v.id === dr.vehicleId && v.status !== 'ON_TRIP' ? { ...v, status: 'IN_WORKSHOP' } : v)) }));
    commit({ ...ref.current, defects: ref.current.defects.map((x) => (x.id === id ? { ...x, status: 'APPROVED', woId: r.id, woNumber: wo?.number, decidedBy: actor.name, history: [...x.history, log(dr.safetyCritical ? 'Approved — vehicle off the road' : 'Approved', `Work order ${wo?.number}`)] } : x)) });
    audit({ module: 'Fleet', by: actor.name, action: 'Defect approved', ref: dr.number, note: wo?.number });
    return done('Defect approved', `${wo?.number} raised in Maintenance${dr.safetyCritical ? ` · ${reg(dr.vehicleId)} is off the road` : ''}`);
  };
  const rejectDefect = (id: string, reason: string): Result => {
    const g = guard('TRANSPORT_MANAGER');
    if (g) return g;
    const dr = ref.current.defects.find((x) => x.id === id)!;
    if (dr.status !== 'SUBMITTED') return fail('Already decided');
    if (!reason.trim()) return fail('Give a reason so the driver knows');
    commit({ ...ref.current, defects: ref.current.defects.map((x) => (x.id === id ? { ...x, status: 'REJECTED', reason, decidedBy: actor.name, history: [...x.history, log('Rejected', reason)] } : x)) });
    notify({ module: 'Fleet', to: dr.driver, subject: `Defect ${dr.number} not accepted`, body: reason, ref: dr.number, channels: ['IN_APP', 'SMS'] });
    return done('Defect rejected', dr.number);
  };

  /* ---------------- Insurance ---------------- */
  const renewPolicy = (vehicleId: string, p: Omit<InsurancePolicy, 'id' | 'vehicleId' | 'status' | 'remindersSent'>): Result => {
    const g = guard('TRANSPORT_MANAGER', 'MANAGER');
    if (g) return g;
    if (!p.insurer.trim() || !p.policyNo.trim()) return fail('Enter the insurer and the policy number');
    if (!(p.premium > 0)) return fail('Enter the premium');
    if (!p.start || !p.expiry || p.expiry <= p.start) return fail('The policy must end after it starts');
    if (ref.current.policies.some((x) => x.policyNo.toLowerCase() === p.policyNo.trim().toLowerCase())) return fail('That policy number is already recorded');
    if (!p.officer.trim() || !/^\S+@\S+\.\S+$/.test(p.officerEmail)) return fail('Name the responsible officer and a valid email for reminders');
    const s = ref.current;
    const policies = s.policies.map((x) => (x.vehicleId === vehicleId && x.cover === p.cover && x.status === 'ACTIVE' ? { ...x, status: 'SUPERSEDED' as const } : x));
    commit({ ...s, policies: [{ ...p, policyNo: p.policyNo.trim(), id: uid('ip'), vehicleId, status: 'ACTIVE', remindersSent: [] }, ...policies] });
    if (p.cover !== 'GOODS_IN_TRANSIT') ops.mutate((st) => ({ ...st, vehicles: st.vehicles.map((v) => (v.id === vehicleId ? { ...v, insuranceExpiry: p.expiry } : v)) }));
    audit({ module: 'Fleet', by: actor.name, action: 'Insurance renewed', ref: reg(vehicleId), note: `${p.insurer} ${p.policyNo} to ${p.expiry}` });
    return done('Policy recorded', `${reg(vehicleId)} insured to ${p.expiry}`);
  };
  /** Email and SMS the responsible officer at 30, 14 and 7 days before a policy expires (simulated gateway). */
  const sendReminders = (quiet = false) => {
    let sent = 0;
    const policies = ref.current.policies.map((p) => {
      const due = dueReminders(p);
      if (!due.length) return p;
      const days = policyDays(p);
      notify({ module: 'Fleet', to: p.officer, address: p.officerEmail, subject: `${days < 0 ? 'EXPIRED' : `${days} days`}: ${reg(p.vehicleId)} ${p.cover.toLowerCase().replace(/_/g, ' ')} insurance (${p.insurer} ${p.policyNo})`, body: `Expires ${p.expiry}. Premium last year ${p.premium.toLocaleString()} KES. Renew before the vehicle is used.`, ref: p.policyNo, level: days <= 7 ? 'critical' : 'warning', channels: ['EMAIL', 'SMS', 'IN_APP'] });
      sent++;
      return { ...p, remindersSent: [...p.remindersSent, ...due] };
    });
    if (sent) commit({ ...ref.current, policies });
    if (!quiet) addToast({ type: sent ? 'success' : 'info', title: sent ? 'Reminders sent' : 'Nothing due', message: sent ? `${sent} renewal reminder${sent === 1 ? '' : 's'} emailed and texted` : 'No policy has reached a reminder date' });
    return sent;
  };
  useEffect(() => {
    sendReminders(true);
  }, []);

  /* ---------------- Vehicle requests ---------------- */
  const requestVehicle = (f: Omit<VehicleRequest, 'id' | 'number' | 'status' | 'history' | 'requestedBy'> & { requestedBy?: string }): Result => {
    const g = guard();
    if (g) return g;
    if (!f.purpose.trim() || !f.route.trim() || !f.department.trim()) return fail('Enter the department, purpose and route');
    if (!f.from || !f.to || f.to < f.from) return fail('The return date must be on or after the start date');
    if (f.from < TODAY) return fail('Requests are for today or later');
    if (f.passengers < 0 || f.kg < 0) return fail('Passengers and load cannot be negative');
    const s = ref.current;
    const { number, sequence } = next(s, 'VR');
    commit({ ...s, sequence, requests: [{ ...f, requestedBy: f.requestedBy || actor.name, id: uid('vr'), number, status: 'REQUESTED', history: [log('Requested')] }, ...s.requests] });
    notify({ module: 'Fleet', to: 'Transport Manager', subject: `Vehicle request ${number}`, body: `${f.department}: ${f.purpose} (${f.from}${f.to !== f.from ? ` to ${f.to}` : ''})`, ref: number });
    return done('Vehicle requested', `${number} — the Transport Manager approves`);
  };
  const decideRequest = (id: string, approve: boolean, reason: string): Result => {
    const g = guard('TRANSPORT_MANAGER');
    if (g) return g;
    const r = ref.current.requests.find((x) => x.id === id)!;
    if (r.status !== 'REQUESTED') return fail('Already decided');
    if (r.requestedBy === actor.name) return fail('You cannot approve your own request');
    if (!approve && !reason.trim()) return fail('Give a reason');
    commit({ ...ref.current, requests: ref.current.requests.map((x) => (x.id === id ? { ...x, status: approve ? 'APPROVED' : 'REJECTED', decidedBy: actor.name, reason: reason || undefined, history: [...x.history, log(approve ? 'Approved' : 'Rejected', reason || undefined)] } : x)) });
    notify({ module: 'Fleet', to: r.requestedBy, subject: `Vehicle request ${r.number} ${approve ? 'approved' : 'rejected'}`, body: reason || undefined, ref: r.number });
    return done(approve ? 'Request approved' : 'Request rejected', r.number);
  };
  const allocateRequest = (id: string, vehicleId: string, driver: string): Result => {
    const g = guard('TRANSPORT_MANAGER', 'OFFICER');
    if (g) return g;
    const r = ref.current.requests.find((x) => x.id === id)!;
    if (r.from > TODAY) return fail(`${r.number} starts on ${r.from} — allocate on the day`);
    const res = ops.startTrip(vehicleId, `${r.number}: ${r.purpose}`, r.route, driver, { requestId: id, kind: 'REQUEST', loadKg: r.kg || undefined });
    if (!res.ok) return res;
    commit({ ...ref.current, requests: ref.current.requests.map((x) => (x.id === id ? { ...x, status: 'ALLOCATED', vehicleId, tripId: res.id, history: [...x.history, log(`Allocated ${reg(vehicleId)}`, driver || undefined)] } : x)) });
    return { ok: true, id: res.id };
  };
  const closeRequest = (id: string): Result => {
    const g = guard();
    if (g) return g;
    const r = ref.current.requests.find((x) => x.id === id)!;
    const t = ops.snapshot().trips.find((x) => x.id === r.tripId);
    if (r.status !== 'ALLOCATED') return fail('Only allocated requests are closed');
    if (t && t.status !== 'DONE') return fail(`Close trip ${t.number} first (closing odometer)`);
    commit({ ...ref.current, requests: ref.current.requests.map((x) => (x.id === id ? { ...x, status: 'CLOSED', history: [...x.history, log('Closed', t?.endKm ? `${(t.endKm - t.startKm).toLocaleString()} km` : undefined)] } : x)) });
    return done('Request closed', r.number);
  };

  /* ---------------- Telematics (simulated feed) ---------------- */
  /** Advances every vehicle on the road along its corridor, as a GPS unit would report. */
  const tick = () => {
    const s = ops.snapshot();
    const positions = { ...ref.current.positions };
    for (const v of s.vehicles) {
      const prev = positions[v.id];
      if (v.status !== 'ON_TRIP') {
        const base = v.status === 'IN_WORKSHOP' ? positionAt(0.02) : positionAt(0);
        positions[v.id] = { vehicleId: v.id, ...base, speed: 0, fuelPct: prev?.fuelPct ?? 80, progress: 0, at: localStamp(), place: v.status === 'IN_WORKSHOP' ? 'Workshop, Industrial Area' : base.place };
        continue;
      }
      const progress = Math.min(1, (prev?.progress ?? 0.05 + (v.id.charCodeAt(1) % 5) * 0.08) + 0.01 + Math.random() * 0.02);
      const pos = positionAt(progress);
      positions[v.id] = { vehicleId: v.id, ...pos, speed: progress >= 1 ? 0 : Math.round(55 + Math.random() * 30), fuelPct: Math.max(8, Math.round(((prev?.fuelPct ?? 90) - Math.random() * 1.5) * 10) / 10), progress, at: localStamp() };
      if ((prev?.fuelPct ?? 100) >= 20 && positions[v.id].fuelPct < 20) notify({ module: 'Fleet', to: 'Transport Manager', subject: `${v.reg} fuel below 20% near ${pos.place}`, ref: v.reg, level: 'warning', channels: ['IN_APP'] });
    }
    commit({ ...ref.current, positions });
  };

  /* ---------------- Letters with e-signature ---------------- */
  const mergeLetter = (template: LetterTemplate, vehicleId: string | undefined, to: string, extra: string) => {
    const v = vehicleId ? vehicle(vehicleId) : undefined;
    const vd = v ? `${v.reg} (${v.model})` : 'the vehicle';
    const pol = v ? ref.current.policies.find((p) => p.vehicleId === v.id && p.status === 'ACTIVE' && p.cover !== 'GOODS_IN_TRANSIT') : undefined;
    const lines: Record<LetterTemplate, { subject: string; body: string }> = {
      AUTHORITY_TO_DRIVE: { subject: `Authority to drive — ${v?.reg ?? ''}`, body: `This letter authorises ${to} to drive company vehicle ${vd} on company business${extra ? `: ${extra}` : ''}. The driver must carry a valid licence and this letter at all times.` },
      CARRIER_INSTRUCTION: { subject: `Haulage instruction — ${v?.reg ?? ''}`, body: `Please provide ${vd} for the collection and delivery of tea as follows: ${extra || 'see the attached loading instruction'}. Rates as per our agreement; your invoice must quote our plan number.` },
      INSURANCE_CLAIM: { subject: `Notification of claim — ${v?.reg ?? ''}${pol ? ` (${pol.policyNo})` : ''}`, body: `We notify ${to} of an incident involving ${vd}${pol ? `, insured under policy ${pol.policyNo}` : ''}: ${extra || 'details to follow'}. Kindly appoint an assessor.` },
      GATE_PASS: { subject: `Gate pass — ${v?.reg ?? ''}`, body: `Please allow ${vd} driven by ${to} to leave the premises with: ${extra || 'the goods listed on the loading instruction'}.` }
    };
    return lines[template];
  };
  const draftLetter = (template: LetterTemplate, vehicleId: string, to: string, toEmail: string, extra: string): Result => {
    const g = guard('OFFICER', 'TRANSPORT_MANAGER', 'MANAGER');
    if (g) return g;
    if (!to.trim()) return fail('Who is the letter to?');
    if (toEmail && !/^\S+@\S+\.\S+$/.test(toEmail)) return fail('Enter a valid email address');
    const m = mergeLetter(template, vehicleId || undefined, to.trim(), extra.trim());
    const s = ref.current;
    const { number, sequence } = next(s, 'LTR');
    const letter: TransportLetter = { id: uid('lt'), number, template, to: to.trim(), toEmail, subject: m.subject, body: m.body, vehicleId: vehicleId || undefined, status: 'DRAFT', createdBy: actor.name, history: [log('Drafted')] };
    commit({ ...s, sequence, letters: [letter, ...s.letters] });
    return done('Letter drafted', `${number} — sign it to send`, letter.id);
  };
  const signLetter = (id: string, sig: ESignature): Result => {
    const g = guard('TRANSPORT_MANAGER', 'MANAGER');
    if (g) return g;
    const l = ref.current.letters.find((x) => x.id === id)!;
    if (l.status !== 'DRAFT') return fail('Already signed');
    if (l.createdBy === actor.name) return fail('You drafted this letter, so someone else must sign it');
    const hash = docHash(`${l.subject}|${l.body}|${sig.by}|${sig.at}`);
    commit({ ...ref.current, letters: ref.current.letters.map((x) => (x.id === id ? { ...x, status: 'SIGNED', signature: sig, hash, history: [...x.history, log('Signed electronically', `Document hash ${hash}`)] } : x)) });
    audit({ module: 'Fleet', by: actor.name, action: 'Letter e-signed', ref: l.number, note: `hash ${hash}` });
    return done('Letter signed', `${l.number} · hash ${hash}`);
  };
  const sendLetter = (id: string): Result => {
    const g = guard('OFFICER', 'TRANSPORT_MANAGER', 'MANAGER');
    if (g) return g;
    const l = ref.current.letters.find((x) => x.id === id)!;
    if (l.status !== 'SIGNED') return fail('Sign the letter before sending');
    if (!l.toEmail) return fail('No email address — print the letter instead');
    notify({ module: 'Fleet', to: l.to, address: l.toEmail, subject: l.subject, body: `${l.body}\n\nSigned electronically by ${l.signature?.by} on ${l.signature?.at} (hash ${l.hash}). Signed PDF attached: ${l.number}.pdf`, ref: l.number, channels: ['EMAIL'] });
    commit({ ...ref.current, letters: ref.current.letters.map((x) => (x.id === id ? { ...x, status: 'SENT', history: [...x.history, log('Sent by email', l.toEmail)] } : x)) });
    return done('Letter sent', `${l.number} to ${l.toEmail}`);
  };

  const reset = () => commit(buildFleetSeed());

  return {
    state,
    actor,
    canWrite: access.canWrite,
    reg,
    routeKm: (id: string) => routeKm(ref.current.routes.find((r) => r.id === id)),
    saveRoute,
    createPlan,
    allocate,
    autoAllocate,
    cancelPlan,
    issueInstruction,
    dispatchInstruction,
    deliverInstruction,
    closePlan,
    recordDaily,
    raiseDefect,
    approveDefect,
    rejectDefect,
    renewPolicy,
    sendReminders,
    requestVehicle,
    decideRequest,
    allocateRequest,
    closeRequest,
    tick,
    draftLetter,
    signLetter,
    sendLetter,
    reset
  };
};

export const FleetExtProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useFleetStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
};

export const useFleetExt = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFleetExt must be used inside FleetExtProvider');
  return ctx;
};
