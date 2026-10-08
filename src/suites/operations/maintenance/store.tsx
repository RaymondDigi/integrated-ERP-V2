import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { useAccess } from '../../../platform/access';
import type { PermitTypeId } from '../../../data/oshEngine';
import { notify } from '../../../platform/outbox';
import { audit } from '../../../platform/audit';
import { addDays, localStamp, round2, TODAY } from '../../finance/engine';
import { useOperations } from '../store';
import { opsHooks } from '../hooks';
import { stockAt, woCost } from '../engine';
import type { Equipment, OpsRole, WorkOrder } from '../types';
import { buildMaintenanceSeed } from './data';
import { ENERGY_TARIFF, isOpenWo, labourLoad, SPARES_STORE, systemCandidates } from './engine';
import type { BomLine, CalibrationSpec, EnergyReading, JobTemplate, MaintenanceExtState, MaintNotification, Rotable, Warranty } from './types';

type Result = { ok: true; id?: string } | { ok: false; error: string };

const Ctx = createContext<ReturnType<typeof useMaintenanceStore> | null>(null);

const useMaintenanceStore = () => {
  const { addToast, requestPermit } = useApp();
  const ops = useOperations();
  const access = useAccess();
  const [state, setState] = useState<MaintenanceExtState>(buildMaintenanceSeed);
  const ref = useRef(state);
  ref.current = state;
  const actor = ops.actor;
  const products = ops.products;

  const commit = (next: MaintenanceExtState) => {
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
  const next = (s: MaintenanceExtState, prefix: string) => {
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
  const eqName = (id: string) => ops.state.equipment.find((e) => e.id === id)?.name ?? id;
  const patchEquipment = (id: string, patch: Partial<Equipment>) => ops.mutate((s) => ({ ...s, equipment: s.equipment.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const patchWo = (id: string, patch: Partial<WorkOrder>, action: string, note?: string) =>
    ops.mutate((s) => ({ ...s, workOrders: s.workOrders.map((w) => (w.id === id ? { ...w, ...patch, history: [...w.history, log(action, note)] } : w)) }));

  /* ---------------- Hooks the core store calls ---------------- */
  opsHooks.fromTemplate = (templateId) => {
    const t = ref.current.templates.find((x) => x.id === templateId);
    if (!t) return null;
    return { checklist: t.steps.map((st) => ({ ...st })), permitRequired: t.requiresPermit, estHours: t.estHours, plannedParts: t.parts.map((p) => ({ ...p })) };
  };
  opsHooks.woEvent = (event, w) => {
    const s = ref.current;
    // Calibration jobs leave a calibration record
    if (event === 'completed' && w.kind === 'CALIBRATION' && w.calibrationResult) {
      const eq = ops.snapshot().equipment.find((e) => e.id === w.equipmentId);
      commit({ ...s, calibrations: [{ ...w.calibrationResult, id: uid('cal'), equipmentId: w.equipmentId, woId: w.id, woNumber: w.number, date: TODAY, tolerance: eq?.calibration?.tolerance ?? '', by: actor.name }, ...s.calibrations] });
    }
    // Refurbishment: the repairable goes to the workshop when work starts and back to stock (at the added cost) when signed off
    if (w.kind === 'REFURBISH' && w.rotableId) {
      const rot = (r: Rotable): Rotable => {
        if (event === 'started') return { ...r, status: 'AT_REPAIR', location: 'Maintenance workshop', history: [...r.history, { date: TODAY, event: 'Refurbishment started', by: actor.name, woNumber: w.number }] };
        if (event === 'accepted') {
          const added = woCost(w, products);
          return { ...r, status: 'IN_STOCK', location: `Spares store ${SPARES_STORE}`, equipmentId: undefined, value: round2(r.value + added), history: [...r.history, { date: TODAY, event: 'Refurbished — returned to stock', by: actor.name, woNumber: w.number, value: round2(r.value + added) }] };
        }
        if (event === 'cancelled') return r;
        return r;
      };
      commit({ ...ref.current, rotables: ref.current.rotables.map((r) => (r.id === w.rotableId ? rot(r) : r)) });
    }
    // Notification converted to this job is closed when the job is signed off
    if (event === 'accepted' && w.notificationId)
      commit({ ...ref.current, notifications: ref.current.notifications.map((n) => (n.id === w.notificationId ? { ...n, history: [...n.history, log(`Work order ${w.number} completed`)] } : n)) });
  };

  /* ---------------- Notifications ---------------- */
  const raiseNotification = (equipmentId: string, description: string, priority: MaintNotification['priority']): Result => {
    const g = guard();
    if (g) return g;
    if (!equipmentId || !description.trim()) return fail('Choose the equipment and describe the problem');
    const s = ref.current;
    const { number, sequence } = next(s, 'MN');
    const n: MaintNotification = { id: uid('mn'), number, equipmentId, source: 'USER', trigger: 'USER', description: description.trim(), priority, raisedBy: actor.name, date: TODAY, status: 'OPEN', history: [log('Raised')] };
    commit({ ...s, sequence, notifications: [n, ...s.notifications] });
    notify({ module: 'Maintenance', to: 'Maintenance planner', subject: `New maintenance request ${number}`, body: `${eqName(equipmentId)}: ${description}`, ref: number, level: priority === 'URGENT' ? 'critical' : 'info' });
    return done('Request raised', `${number} — the planner will turn it into a work order`, n.id);
  };
  /** Creates notifications for anything the system finds due (preventive, meter, vehicle service, calibration, predicted failure). */
  const syncSystem = (quiet = false) => {
    const s = ref.current;
    const known = new Set(s.notifications.map((n) => n.key).filter(Boolean));
    const fresh = systemCandidates(ops.snapshot(), s).filter((c) => !known.has(c.key));
    if (!fresh.length) {
      if (!quiet) addToast({ type: 'info', title: 'Nothing new', message: 'No new preventive, meter, calibration or condition alerts' });
      return 0;
    }
    let seq = s.sequence;
    const made: MaintNotification[] = fresh.map((c) => {
      const n = (seq.MN ?? 0) + 1;
      seq = { ...seq, MN: n };
      return { ...c, id: uid('mn'), number: `MN-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`, history: [{ at: localStamp(), by: 'System', action: 'Raised automatically', note: c.trigger.toLowerCase() }] };
    });
    commit({ ...s, sequence: seq, notifications: [...made, ...s.notifications] });
    for (const m of made.filter((x) => x.priority !== 'NORMAL')) notify({ module: 'Maintenance', to: 'Maintenance planner', subject: `${m.number}: ${eqName(m.equipmentId)}`, body: m.description, ref: m.number, level: m.priority === 'URGENT' ? 'critical' : 'warning', channels: ['IN_APP'] });
    if (!quiet) addToast({ type: 'success', title: 'System check done', message: `${made.length} new notification${made.length === 1 ? '' : 's'} raised` });
    return made.length;
  };
  // The system check runs once when the workspace opens
  useEffect(() => {
    syncSystem(true);
  }, []);
  const convertNotification = (id: string, kind: WorkOrder['kind'], templateId?: string): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    const n = ref.current.notifications.find((x) => x.id === id)!;
    if (n.status !== 'OPEN') return fail('This notification is already dealt with');
    const sched = n.trigger === 'PM' || n.trigger === 'METER' ? ops.state.schedules.find((p) => n.key?.includes(p.id)) : undefined;
    const r = sched
      ? ops.scheduleNow(sched.id)
      : ops.raiseWorkOrder({ equipmentId: n.equipmentId, title: n.description.slice(0, 90), kind, priority: n.priority, due: addDays(TODAY, n.priority === 'URGENT' ? 1 : n.priority === 'HIGH' ? 3 : 7), notes: `From ${n.number}`, templateId, notificationId: n.id });
    if (!r.ok || !r.id) return r;
    const wo = ops.snapshot().workOrders.find((w) => w.id === r.id);
    commit({ ...ref.current, notifications: ref.current.notifications.map((x) => (x.id === id ? { ...x, status: 'CONVERTED', woId: r.id, woNumber: wo?.number, history: [...x.history, log(`Converted to ${wo?.number}`)] } : x)) });
    return { ok: true, id: r.id };
  };
  const rejectNotification = (id: string, reason: string): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    const n = ref.current.notifications.find((x) => x.id === id)!;
    if (n.status !== 'OPEN') return fail('This notification is already dealt with');
    if (!reason.trim()) return fail('Say why no work is needed');
    commit({ ...ref.current, notifications: ref.current.notifications.map((x) => (x.id === id ? { ...x, status: 'REJECTED', reason, history: [...x.history, log('Rejected', reason)] } : x)) });
    return done('Notification closed', n.number);
  };

  /* ---------------- Templates and labour ---------------- */
  const saveTemplate = (t: JobTemplate): Result => {
    const g = guard('MANAGER', 'TECHNICIAN', 'OFFICER');
    if (g) return g;
    if (!t.name.trim()) return fail('Name the template');
    const steps = t.steps.filter((x) => x.text.trim());
    if (!steps.length) return fail('Add at least one step');
    if (!(t.estHours > 0)) return fail('Enter the estimated hours');
    if (t.parts.some((p) => !products.some((x) => x.sku === p.sku) || !(p.qty > 0))) return fail('Each spare needs an item and a quantity');
    const s = ref.current;
    const rec = { ...t, steps, id: t.id || uid('jt') };
    commit({ ...s, templates: t.id && s.templates.some((x) => x.id === t.id) ? s.templates.map((x) => (x.id === t.id ? rec : x)) : [...s.templates, rec] });
    return done('Template saved', t.name, rec.id);
  };
  /** Book a job into a technician's day; warns when they are over capacity. */
  const scheduleJob = (woId: string, technicianId: string, date: string, estHours: number, downtime?: number): Result => {
    const t = ref.current.technicians.find((x) => x.id === technicianId);
    if (!t) return fail('Choose a technician');
    if (!date) return fail('Choose the day');
    if (!(estHours > 0)) return fail('Enter the estimated hours');
    const w = ops.state.workOrders.find((x) => x.id === woId)!;
    const load = labourLoad(ops.state.workOrders.filter((x) => x.id !== woId), ref.current.technicians, date).find((x) => x.tech.id === technicianId)!;
    const r = ops.planWorkOrder(woId, { technicianId, assignedTo: t.name, labourRate: t.rate, plannedStart: date, estHours, plannedDowntimeHours: downtime }, `Scheduled for ${t.name} on ${date}`, `${estHours} h${downtime ? ` · ${downtime} h machine downtime` : ''}`);
    if (!r.ok) return r;
    if (load.hours + estHours > t.hoursPerDay) addToast({ type: 'warning', title: 'Over capacity', message: `${t.name} now has ${load.hours + estHours} h booked on ${date} (capacity ${t.hoursPerDay} h)` });
    const eq = ops.state.equipment.find((e) => e.id === w.equipmentId);
    if (downtime && eq?.productionLine)
      notify({ module: 'Maintenance', to: 'Production planner', subject: `${eq.productionLine} planned downtime ${date}`, body: `${w.number} ${w.title}: ${downtime} h. Batches that do not fit will be refused on that day.`, ref: w.number, level: 'warning' });
    return done('Job scheduled', `${w.number} → ${t.name}, ${date}`);
  };

  /* ---------------- Equipment register ---------------- */
  const saveEquipment = (e: Equipment): Result => {
    const g = guard('MANAGER', 'OFFICER', 'TECHNICIAN');
    if (g) return g;
    if (!e.name.trim() || !e.area.trim()) return fail('Enter the name and location');
    const s = ops.snapshot();
    if (e.serialNo && s.equipment.some((x) => x.id !== e.id && x.serialNo && x.serialNo.toLowerCase() === e.serialNo!.toLowerCase())) return fail(`Serial number ${e.serialNo} is already registered`);
    if (e.id && s.equipment.some((x) => x.id === e.id)) {
      const before = s.equipment.find((x) => x.id === e.id)!;
      patchEquipment(e.id, e);
      audit({ module: 'Maintenance', by: actor.name, action: 'Equipment updated', ref: e.name, note: (['name', 'area', 'criticality', 'costCentre', 'serialNo'] as const).filter((k) => before[k] !== e[k]).join(', ') || undefined });
      return done('Equipment saved', e.name, e.id);
    }
    const id = uid('eq');
    ops.mutate((x) => ({ ...x, equipment: [...x.equipment, { ...e, id, status: 'RUNNING' }] }));
    return done('Equipment registered', e.name, id);
  };
  const saveBom = (equipmentId: string, lines: BomLine[]): Result => {
    const g = guard('MANAGER', 'TECHNICIAN', 'OFFICER');
    if (g) return g;
    const clean = lines.filter((l) => l.sku || l.description.trim());
    for (const l of clean) {
      if (!(l.qty > 0)) return fail('Every BOM line needs a quantity');
      if (l.stocked && !products.some((p) => p.sku === l.sku)) return fail(`${l.description || 'A stocked line'}: choose the stock item`);
      if (!l.stocked && (!l.description.trim() || !(Number(l.unitCost) > 0))) return fail('Non-stock lines need a description and an estimated cost');
    }
    patchEquipment(equipmentId, { bom: clean.map((l) => (l.stocked ? { ...l, description: l.description || products.find((p) => p.sku === l.sku)?.name || '', unitCost: undefined } : { ...l, sku: undefined })) });
    return done('Bill of materials saved', `${clean.length} lines on ${eqName(equipmentId)}`);
  };
  const setWarranty = (equipmentId: string, w: Warranty | undefined): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    if (w && (!w.supplierId || !w.until)) return fail('Choose the supplier and the end date');
    patchEquipment(equipmentId, { warranty: w });
    return done(w ? 'Warranty recorded' : 'Warranty removed', eqName(equipmentId));
  };
  const linkAsset = (equipmentId: string, assetId: string): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    const other = ops.state.equipment.find((e) => e.assetId === assetId && e.id !== equipmentId);
    if (assetId && other) return fail(`That fixed asset is already linked to ${other.name}`);
    patchEquipment(equipmentId, { assetId: assetId || undefined });
    return done(assetId ? 'Linked to the asset register' : 'Asset link removed', eqName(equipmentId));
  };
  const setCalibration = (equipmentId: string, c: CalibrationSpec | undefined): Result => {
    const g = guard('MANAGER', 'TECHNICIAN');
    if (g) return g;
    if (c && (!(c.intervalDays > 0) || !c.tolerance.trim() || !c.standard.trim())) return fail('Enter the interval, tolerance and reference standard');
    patchEquipment(equipmentId, { calibration: c });
    return done('Calibration plan saved', eqName(equipmentId));
  };
  const raiseCalibration = (equipmentId: string): Result => {
    const eq = ops.state.equipment.find((e) => e.id === equipmentId)!;
    if (!eq.calibration?.required) return fail('This equipment has no calibration plan');
    if (ops.state.workOrders.some((w) => w.equipmentId === equipmentId && w.kind === 'CALIBRATION' && isOpenWo(w))) return fail('A calibration job is already open');
    return ops.raiseWorkOrder({ equipmentId, title: `Calibration — ${eq.calibration.tolerance}`, kind: 'CALIBRATION', priority: 'HIGH', due: addDays(TODAY, 3), notes: `Reference standard: ${eq.calibration.standard}`, checklist: [{ text: 'Record the as-found reading before adjusting' }, { text: 'Adjust within tolerance and record the as-left reading' }, { text: 'Attach the calibration certificate' }] });
  };

  /* ---------------- Meters and condition ---------------- */
  const recordMeter = (equipmentId: string, value: number, date = TODAY): Result => {
    const g = guard();
    if (g) return g;
    const eq = ops.state.equipment.find((e) => e.id === equipmentId)!;
    if (!eq.meter) return fail('This equipment has no meter');
    if (!(value >= 0)) return fail('Enter the reading');
    if (value < eq.meter.reading) return fail(`Readings only go up — the last one was ${eq.meter.reading.toLocaleString()}`);
    if (date > TODAY) return fail('The reading cannot be in the future');
    commit({ ...ref.current, meterReadings: [{ id: uid('mr'), equipmentId, date, value, by: actor.name, source: 'MANUAL' }, ...ref.current.meterReadings] });
    patchEquipment(equipmentId, { meter: { ...eq.meter, reading: value, readOn: date } });
    const raised = syncSystem(true);
    return done('Reading recorded', `${eq.name}: ${value.toLocaleString()}${raised ? ` · ${raised} notification raised` : ''}`);
  };
  const recordCondition = (equipmentId: string, parameter: string, unit: string, value: number, limitWarn: number, limitAlarm: number): Result => {
    const g = guard();
    if (g) return g;
    if (!equipmentId || !parameter.trim()) return fail('Choose the equipment and the parameter');
    if (!Number.isFinite(value)) return fail('Enter the value');
    if (!(limitAlarm > limitWarn)) return fail('The alarm limit must be above the warning limit');
    commit({ ...ref.current, conditions: [...ref.current.conditions, { id: uid('cr'), equipmentId, parameter: parameter.trim(), unit, value, limitWarn, limitAlarm, date: TODAY, by: actor.name }] });
    const raised = syncSystem(true);
    if (value >= limitAlarm) addToast({ type: 'warning', title: 'Above alarm limit', message: `${eqName(equipmentId)} ${parameter}: ${value} ${unit}` });
    return done('Reading recorded', raised ? `${raised} predictive notification raised` : `${parameter}: ${value} ${unit}`);
  };

  /* ---------------- Spares, permits and warranty on a job ---------------- */
  /** Raises a purchase requisition in Procurement for spares or services a job is missing. */
  const requestParts = (woId: string, lines: { sku?: string; description: string; qty: number; estPrice: number }[]): Result => {
    const g = guard();
    if (g) return g;
    const w = ops.state.workOrders.find((x) => x.id === woId)!;
    if (!isOpenWo(w)) return fail('The job is closed');
    const ls = lines.filter((l) => l.qty > 0 && (l.sku || l.description.trim()));
    if (!ls.length) return fail('Add the spares or services needed');
    const r = ops.commercial.saveRequisition({
      department: 'Maintenance',
      requestedBy: actor.name,
      neededBy: w.plannedStart ?? w.due,
      justification: `Spares for work order ${w.number} — ${w.title}`,
      lines: ls.map((l) => ({ id: uid('rl'), sku: l.sku ?? '', description: l.description || products.find((p) => p.sku === l.sku)?.name || '', qty: l.qty, estPrice: l.estPrice }))
    });
    if (!r.ok || !r.id) return r;
    const req = ops.commercial.snapshot().requisitions.find((x) => x.id === r.id);
    patchWo(woId, { requisitions: [...(w.requisitions ?? []), req?.number ?? r.id] }, `Purchase requisition ${req?.number} raised`, ls.map((l) => `${l.qty} × ${l.description || l.sku}`).join(', '));
    return { ok: true, id: r.id };
  };
  const linkPermit = (woId: string, permitNo: string): Result => {
    const g = guard();
    if (g) return g;
    if (!permitNo) return fail('Choose the permit');
    return ops.planWorkOrder(woId, { permitNo, permitRequired: true }, `Permit ${permitNo} linked`);
  };
  /** Requests a permit in OSH for the job; the safety officer approves and activates it there. */
  const askPermit = (woId: string, type: PermitTypeId): Result => {
    const g = guard();
    if (g) return g;
    const w = ops.state.workOrders.find((x) => x.id === woId)!;
    const eq = ops.state.equipment.find((e) => e.id === w.equipmentId);
    const day = w.plannedStart ?? TODAY;
    const p = requestPermit({ type, location: `${eq?.name} — ${eq?.area}`, work: `${w.number}: ${w.title}`, holder: w.assignedTo, validFrom: `${day}T07:00`, validTo: `${day}T17:00`, requestedBy: actor.name });
    if (!p) return { ok: false, error: 'Permit not raised' };
    ops.planWorkOrder(woId, { permitNo: p.number, permitRequired: true }, `Permit ${p.number} requested in OSH`);
    return { ok: true, id: p.id };
  };
  const raiseWarrantyClaim = (woId: string, note: string): Result => {
    const g = guard('MANAGER', 'OFFICER');
    if (g) return g;
    const w = ops.state.workOrders.find((x) => x.id === woId)!;
    const eq = ops.state.equipment.find((e) => e.id === w.equipmentId)!;
    if (!eq.warranty || eq.warranty.until < w.date) return fail('This equipment was not under warranty when the fault was reported');
    if (w.warrantyClaim) return fail(`Claim ${w.warrantyClaim} already raised`);
    if (w.billId) return fail('The contractor has already been billed for this job');
    const claim = `WC-${w.number.slice(3)}`;
    const sup = ops.finance.state.parties.find((p) => p.id === eq.warranty!.supplierId);
    ops.planWorkOrder(woId, { warrantyClaim: claim }, `Warranty claim ${claim} sent to ${sup?.name}`, note || eq.warranty.terms);
    notify({ module: 'Maintenance', to: sup?.name ?? 'Supplier', address: sup?.email, subject: `Warranty claim ${claim} — ${eq.name} (S/N ${eq.serialNo ?? '—'})`, body: `${w.title}. ${note}`.trim(), ref: claim, channels: ['EMAIL'] });
    return done('Warranty claim sent', `${claim} — no bill will be paid for this job`);
  };

  /* ---------------- Refurbishment (repairable spares) ---------------- */
  const sendForRefurb = (rotableId: string, equipmentId: string, external: boolean): Result => {
    const g = guard('MANAGER', 'TECHNICIAN', 'OFFICER');
    if (g) return g;
    const r = ref.current.rotables.find((x) => x.id === rotableId)!;
    if (r.status === 'INSTALLED' || r.status === 'SCRAPPED') return fail(`${r.serial} is ${r.status.toLowerCase()} — remove it first`);
    if (ops.state.workOrders.some((w) => w.rotableId === rotableId && w.kind === 'REFURBISH' && isOpenWo(w))) return fail('A refurbishment order is already open for this unit');
    if (!equipmentId) return fail('Choose the machine this spare serves');
    return ops.raiseWorkOrder({ equipmentId, title: `Refurbish ${r.description} S/N ${r.serial}`, kind: 'REFURBISH', priority: 'NORMAL', due: addDays(TODAY, external ? 14 : 5), notes: external ? 'Sent out to an approved repairer' : 'Rebuild in the workshop', rotableId });
  };
  /** Exchange: fit a serviceable unit from stock on the job's machine; the old unit (core) is due back. */
  const exchangeRotable = (woId: string, rotableId: string, serialOut: string): Result => {
    const g = guard('TECHNICIAN', 'MANAGER');
    if (g) return g;
    const w = ops.state.workOrders.find((x) => x.id === woId)!;
    if (w.status !== 'IN_PROGRESS') return fail('Fit spares while the job is in progress');
    const r = ref.current.rotables.find((x) => x.id === rotableId)!;
    if (r.status !== 'IN_STOCK') return fail(`${r.serial} is not in stock`);
    if (!serialOut.trim()) return fail('Enter the serial number of the unit taken off');
    commit({
      ...ref.current,
      rotables: ref.current.rotables.map((x) =>
        x.id === rotableId
          ? { ...x, status: 'CORE_DUE', location: eqName(w.equipmentId), equipmentId: w.equipmentId, coreDue: { woNumber: w.number, since: TODAY, serialOut: serialOut.trim() }, history: [...x.history, { date: TODAY, event: `Fitted on ${eqName(w.equipmentId)} — old unit ${serialOut.trim()} due back`, by: actor.name, woNumber: w.number }] }
          : x
      )
    });
    ops.mutate((s) => ({ ...s, workOrders: s.workOrders.map((x) => (x.id === woId ? { ...x, replacedParts: [...(x.replacedParts ?? []), { description: r.description, serialIn: r.serial, serialOut: serialOut.trim(), action: 'REPLACED' }], history: [...x.history, log(`Exchanged ${serialOut.trim()} for ${r.serial}`)] } : x)) }));
    return done('Exchange unit fitted', `${r.serial} on ${eqName(w.equipmentId)} — return the core ${serialOut}`);
  };
  /** The removed unit (core) comes back: it is registered for rebuild at its core value and the exchange is closed. */
  const receiveCore = (rotableId: string, coreValue: number): Result => {
    const g = guard('STOREKEEPER', 'TECHNICIAN', 'MANAGER');
    if (g) return g;
    const r = ref.current.rotables.find((x) => x.id === rotableId)!;
    if (!r.coreDue) return fail('No core is due for this unit');
    if (!(coreValue >= 0)) return fail('Enter the core value');
    const core: Rotable = { id: uid('rt'), serial: r.coreDue.serialOut, description: r.description, status: 'AT_REPAIR', location: 'Maintenance workshop — awaiting rebuild', value: coreValue, history: [{ date: TODAY, event: `Core returned from ${r.coreDue.woNumber}`, by: actor.name, woNumber: r.coreDue.woNumber, value: coreValue }] };
    commit({ ...ref.current, rotables: [...ref.current.rotables.map((x) => (x.id === rotableId ? { ...x, status: 'INSTALLED' as const, coreDue: undefined, history: [...x.history, { date: TODAY, event: `Core ${core.serial} received`, by: actor.name }] } : x)), core] });
    return done('Core received', `${core.serial} is waiting for rebuild (valued ${coreValue.toLocaleString()} KES)`);
  };
  const addRotable = (serial: string, description: string, value: number): Result => {
    const g = guard('STOREKEEPER', 'TECHNICIAN', 'MANAGER');
    if (g) return g;
    if (!serial.trim() || !description.trim()) return fail('Enter the serial number and description');
    if (ref.current.rotables.some((r) => r.serial.toLowerCase() === serial.trim().toLowerCase())) return fail('That serial number is already registered');
    if (!(value > 0)) return fail('Enter the value');
    commit({ ...ref.current, rotables: [...ref.current.rotables, { id: uid('rt'), serial: serial.trim(), description: description.trim(), status: 'IN_STOCK', location: `Spares store ${SPARES_STORE}`, value, history: [{ date: TODAY, event: 'Registered', by: actor.name, value }] }] });
    return done('Repairable spare registered', serial);
  };
  const scrapRotable = (rotableId: string, reason: string): Result => {
    const g = guard('MANAGER');
    if (g) return g;
    if (!reason.trim()) return fail('Say why it is scrapped');
    commit({ ...ref.current, rotables: ref.current.rotables.map((x) => (x.id === rotableId ? { ...x, status: 'SCRAPPED', history: [...x.history, { date: TODAY, event: `Scrapped — ${reason}`, by: actor.name, value: 0 }], value: 0 } : x)) });
    return done('Scrapped', 'Written off at zero value');
  };

  /* ---------------- Energy ---------------- */
  const recordEnergy = (date: string, source: EnergyReading['source'], kWh: number): Result => {
    const g = guard();
    if (g) return g;
    if (!(kWh > 0)) return fail('Enter the kWh');
    if (date > TODAY) return fail('The reading cannot be in the future');
    if (ref.current.energy.some((e) => e.date === date && e.source === source)) return fail(`${source.toLowerCase()} for ${date} is already recorded`);
    commit({ ...ref.current, energy: [{ id: uid('en'), date, source, kWh, cost: Math.round(kWh * ENERGY_TARIFF[source]), by: actor.name }, ...ref.current.energy] });
    return done('Energy recorded', `${kWh.toLocaleString()} kWh ${source.toLowerCase()}`);
  };

  const reset = () => commit(buildMaintenanceSeed());

  return {
    state,
    actor,
    canWrite: access.canWrite,
    stockInSpares: (sku: string) => stockAt(ops.state, products, sku, SPARES_STORE),
    raiseNotification,
    syncSystem,
    convertNotification,
    rejectNotification,
    saveTemplate,
    scheduleJob,
    saveEquipment,
    saveBom,
    setWarranty,
    linkAsset,
    setCalibration,
    raiseCalibration,
    recordMeter,
    recordCondition,
    requestParts,
    linkPermit,
    askPermit,
    raiseWarrantyClaim,
    sendForRefurb,
    exchangeRotable,
    receiveCore,
    addRotable,
    scrapRotable,
    recordEnergy,
    reset
  };
};

export const MaintenanceExtProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useMaintenanceStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
};

export const useMaintenanceExt = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMaintenanceExt must be used inside MaintenanceExtProvider');
  return ctx;
};
