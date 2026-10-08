import React, { createContext, useContext, useRef, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { useAccess } from '../../../platform/access';
import { notify } from '../../../platform/outbox';
import { audit } from '../../../platform/audit';
import { localStamp, round2, TODAY } from '../../finance/engine';
import { useOperations } from '../store';
import { stockAt } from '../engine';
import type { OpsRole } from '../types';
import { buildContainersSeed } from './data';
import { CONTAINER_RE, MOVES, normaliseContainer, openDiscrepancies, parseKraEmail, SHIPPING_LINES, STATUS_LABEL } from './engine';
import type { BookingConfirmation, Container, ContainerBooking, ContainersState, ContainerStatus, PortDiscrepancy } from './types';

type Result = { ok: true; id?: string } | { ok: false; error: string };

const Ctx = createContext<ReturnType<typeof useContainersStore> | null>(null);

const useContainersStore = () => {
  const { addToast } = useApp();
  const ops = useOperations();
  const access = useAccess();
  const [state, setState] = useState<ContainersState>(buildContainersSeed);
  const ref = useRef(state);
  ref.current = state;
  const actor = ops.actor;

  const commit = (next: ContainersState) => {
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
  const next = (s: ContainersState, prefix: string) => {
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
  const updateBooking = (id: string, patch: Partial<ContainerBooking>, action: string, note?: string) =>
    commit({ ...ref.current, bookings: ref.current.bookings.map((b) => (b.id === id ? { ...b, ...patch, history: [...b.history, log(action, note)] } : b)) });
  const stamp = () => localStamp().replace('T', ' ').slice(0, 16);

  /* ---------------- Bookings ---------------- */
  const requestBooking = (f: Pick<ContainerBooking, 'line' | 'containerType' | 'qty' | 'cargo' | 'destination' | 'requestedEtd'> & { shipmentId?: string }): Result => {
    const g = guard('OFFICER', 'MANAGER');
    if (g) return g;
    if (!SHIPPING_LINES.some((l) => l.name === f.line)) return fail('Choose the shipping line');
    if (!(f.qty > 0 && f.qty <= 40)) return fail('Book between 1 and 40 containers');
    if (!f.cargo.trim() || !f.destination.trim()) return fail('Describe the cargo and the destination port');
    if (!f.requestedEtd || f.requestedEtd < TODAY) return fail('The sailing date cannot be in the past');
    if (f.shipmentId && ref.current.bookings.some((b) => b.shipmentId === f.shipmentId && ['REQUESTED', 'SENT', 'CONFIRMED'].includes(b.status))) return fail('That shipment already has an open booking');
    const s = ref.current;
    const { number, sequence } = next(s, 'CB');
    const id = uid('cb');
    commit({ ...s, sequence, bookings: [{ ...f, id, number, status: 'REQUESTED', requestedBy: actor.name, history: [log('Requested')] }, ...s.bookings] });
    return done('Booking request created', `${number} — send it to the line`, id);
  };
  /** Emails the booking request to the line's agent (simulated gateway). */
  const sendBooking = (id: string): Result => {
    const g = guard('OFFICER', 'MANAGER');
    if (g) return g;
    const b = ref.current.bookings.find((x) => x.id === id)!;
    if (b.status !== 'REQUESTED') return fail(`${b.number} has already been sent`);
    const line = SHIPPING_LINES.find((l) => l.name === b.line)!;
    notify({ module: 'Containers', to: line.agent, address: line.email, subject: `Booking request ${b.number}: ${b.qty} × ${b.containerType} to ${b.destination}`, body: `Cargo: ${b.cargo}. Requested sailing on or about ${b.requestedEtd}. Please confirm booking number, vessel/voyage, cut-off and empty release order.`, ref: b.number, channels: ['EMAIL'] });
    updateBooking(id, { status: 'SENT' }, `Sent to ${line.agent}`, line.email);
    return done('Booking sent', `${b.number} emailed to ${line.agent}`);
  };
  const confirmBooking = (id: string, c: BookingConfirmation): Result => {
    const g = guard('OFFICER', 'MANAGER');
    if (g) return g;
    const b = ref.current.bookings.find((x) => x.id === id)!;
    if (b.status !== 'SENT') return fail('Only bookings sent to the line can be confirmed');
    if (!c.bookingRef.trim() || !c.vessel.trim() || !c.voyage.trim() || !c.releaseOrder.trim()) return fail('Enter the booking number, vessel, voyage and release order');
    if (!c.etd || !c.cutOff) return fail('Enter the sailing date and the cut-off');
    if (c.cutOff.slice(0, 10) > c.etd) return fail('The cut-off must be before the vessel sails');
    if (ref.current.bookings.some((x) => x.id !== id && x.confirmation?.bookingRef.toUpperCase() === c.bookingRef.trim().toUpperCase())) return fail('That booking number is already recorded');
    updateBooking(id, { status: 'CONFIRMED', confirmation: { ...c, bookingRef: c.bookingRef.trim() } }, 'Confirmed by the line', `${c.bookingRef} · ${c.vessel} ${c.voyage} · cut-off ${c.cutOff.replace('T', ' ')}`);
    notify({ module: 'Containers', to: 'Stores & Dispatch', subject: `Booking ${c.bookingRef} confirmed — collect ${b.qty} × ${b.containerType}`, body: `Release order ${c.releaseOrder}. Cut-off ${c.cutOff.replace('T', ' ')} for ${c.vessel}.`, ref: b.number });
    return done('Booking confirmed', `${c.bookingRef} on ${c.vessel}`);
  };
  const rejectBooking = (id: string, reason: string): Result => {
    const g = guard('OFFICER', 'MANAGER');
    if (g) return g;
    const b = ref.current.bookings.find((x) => x.id === id)!;
    if (!['REQUESTED', 'SENT'].includes(b.status)) return fail('Only open requests can be closed');
    if (!reason.trim()) return fail('Give the line’s reason or why it is cancelled');
    updateBooking(id, { status: b.status === 'SENT' ? 'REJECTED' : 'CANCELLED', reason }, b.status === 'SENT' ? 'Declined by the line' : 'Cancelled', reason);
    return done('Booking closed', b.number);
  };

  /* ---------------- Container register ---------------- */
  /** Empties collected against a confirmed booking's release order. */
  const releaseEmpties = (bookingId: string, numbers: string[], depot: string): Result => {
    const g = guard('STOREKEEPER', 'OFFICER', 'MANAGER');
    if (g) return g;
    const b = ref.current.bookings.find((x) => x.id === bookingId)!;
    if (b.status !== 'CONFIRMED' || !b.confirmation) return fail('Empties are released against a confirmed booking');
    const list = numbers.map(normaliseContainer).filter(Boolean);
    if (!list.length) return fail('Enter the container numbers');
    const bad = list.find((n) => !CONTAINER_RE.test(n));
    if (bad) return fail(`${bad} is not a container number (four letters and seven digits, e.g. MSCU 1234567)`);
    const dup = list.find((n, i) => list.indexOf(n) !== i || ref.current.containers.some((c) => c.number === n && c.status !== 'RETURNED'));
    if (dup) return fail(`${dup} is already in the register`);
    const have = ref.current.containers.filter((c) => c.bookingId === bookingId).length;
    if (have + list.length > b.qty) return fail(`The booking is for ${b.qty} container${b.qty === 1 ? '' : 's'} — ${have} already released`);
    if (!depot.trim()) return fail('Enter the depot');
    const made: Container[] = list.map((n) => ({ id: uid('ct'), number: n, type: b.containerType, line: b.line, bookingId, status: 'EMPTY_RELEASED', location: depot, releasedOn: TODAY, shipmentId: b.shipmentId, vessel: b.confirmation!.vessel, cutOff: b.confirmation!.cutOff, lots: [], events: [{ at: stamp(), status: 'EMPTY_RELEASED', location: depot, by: actor.name, note: `Release order ${b.confirmation!.releaseOrder}` }] }));
    commit({ ...ref.current, containers: [...made, ...ref.current.containers] });
    return done('Empties released', `${made.length} × ${b.containerType} at ${depot}`);
  };
  /** Moves a container to its next status, checking the allowed transitions, the cut-off and any open KRA query. */
  const moveContainer = (id: string, to: ContainerStatus, location: string, note = ''): Result => {
    const g = guard('STOREKEEPER', 'OFFICER', 'MANAGER');
    if (g) return g;
    const c = ref.current.containers.find((x) => x.id === id)!;
    if (!MOVES[c.status].includes(to)) return fail(`A container that is ${STATUS_LABEL[c.status].toLowerCase()} cannot go to ${STATUS_LABEL[to].toLowerCase()}`);
    if (!location.trim()) return fail('Enter where the container is');
    if (to === 'STUFFED') return fail('Use “Stuff and seal” to record the teas and seal');
    if (to === 'WITHDRAWN') return fail('Use “Withdraw” — it needs the Operations Manager and a reason');
    if (to === 'ROLLED_OVER') return fail('Use “Roll over” to record the new vessel');
    if ((to === 'GATED_IN' || to === 'LOADED') && openDiscrepancies(ref.current.discrepancies, c.number).length) return fail(`${c.number} has an open KRA query — resolve it before it moves into or onto the port`);
    if (to === 'GATED_IN' && c.cutOff && stamp() > c.cutOff.replace('T', ' ')) return fail(`The cut-off for ${c.vessel} has passed (${c.cutOff.replace('T', ' ')}) — roll it over to the next vessel`);
    if (to === 'LOADED' && !c.vessel) return fail('No vessel on this container');
    commit({ ...ref.current, containers: ref.current.containers.map((x) => (x.id === id ? { ...x, status: to, location: to === 'LOADED' ? x.vessel ?? location : location, events: [...x.events, { at: stamp(), status: to, location, by: actor.name, note: note || undefined }] } : x)) });
    if (to === 'GATED_IN') notify({ module: 'Containers', to: 'Shipping line agent', subject: `${c.number} gated in for ${c.vessel}`, ref: c.number, channels: ['IN_APP'] });
    return done('Container moved', `${c.number}: ${STATUS_LABEL[to]}`);
  };
  const stuffContainer = (id: string, sealNo: string, lots: Container['lots'], truck: string): Result => {
    const g = guard('STOREKEEPER', 'MANAGER');
    if (g) return g;
    const c = ref.current.containers.find((x) => x.id === id)!;
    if (c.status !== 'AT_WAREHOUSE' && !(c.status === 'WITHDRAWN')) return fail('Stuff containers at the warehouse');
    if (!sealNo.trim()) return fail('Enter the seal number');
    if (ref.current.containers.some((x) => x.id !== id && x.sealNo === sealNo.trim() && x.status !== 'RETURNED')) return fail('That seal number is already used');
    const ls = lots.filter((l) => l.lotNo.trim() && l.kg > 0);
    if (!ls.length) return fail('Add the tea lots stuffed');
    const kg = ls.reduce((x, l) => x + l.kg, 0);
    const max = c.type === '20GP' ? 21_000 : 26_500;
    if (kg > max) return fail(`${kg.toLocaleString()} kg is over the ${c.type} payload of ${max.toLocaleString()} kg`);
    const used = ref.current.containers.filter((x) => x.id !== id && x.status !== 'RETURNED' && x.status !== 'WITHDRAWN').flatMap((x) => x.lots.map((l) => l.lotNo));
    const twice = ls.find((l) => used.includes(l.lotNo));
    if (twice) return fail(`Lot ${twice.lotNo} is already in another container`);
    commit({ ...ref.current, containers: ref.current.containers.map((x) => (x.id === id ? { ...x, status: 'STUFFED', sealNo: sealNo.trim(), lots: ls, truck: truck || undefined, stuffedOn: TODAY, events: [...x.events, { at: stamp(), status: 'STUFFED', location: x.location, by: actor.name, note: `Seal ${sealNo.trim()} · ${ls.length} lots, ${kg.toLocaleString()} kg` }] } : x)) });
    return done('Container stuffed and sealed', `${c.number} · ${kg.toLocaleString()} kg`);
  };
  const rollOver = (id: string, vessel: string, cutOff: string, reason: string): Result => {
    const g = guard('OFFICER', 'MANAGER');
    if (g) return g;
    const c = ref.current.containers.find((x) => x.id === id)!;
    if (!MOVES[c.status].includes('ROLLED_OVER') && c.status !== 'STUFFED') return fail('Only containers waiting for a vessel can be rolled over');
    if (!vessel.trim() || !cutOff) return fail('Enter the new vessel and cut-off');
    if (!reason.trim()) return fail('Give the reason');
    commit({ ...ref.current, containers: ref.current.containers.map((x) => (x.id === id ? { ...x, status: 'ROLLED_OVER', vessel: vessel.trim(), cutOff, events: [...x.events, { at: stamp(), status: 'ROLLED_OVER', location: x.location, by: actor.name, note: `${reason} — now ${vessel}, cut-off ${cutOff.replace('T', ' ')}` }] } : x)) });
    notify({ module: 'Containers', to: 'Customer service', subject: `${c.number} rolled over to ${vessel}`, body: reason, ref: c.number, level: 'warning' });
    return done('Rolled over', `${c.number} → ${vessel}`);
  };
  /**
   * Withdraws a stuffed container from the port (Operations Manager). Where it was already loaded against a shipment,
   * the stock taken out at loading goes back into the port store and the shipment returns to the documents stage.
   */
  const withdraw = (id: string, reason: string, location: string): Result => {
    const g = guard('MANAGER');
    if (g) return g;
    const c = ref.current.containers.find((x) => x.id === id)!;
    if (!MOVES[c.status].includes('WITHDRAWN')) return fail(`A container that is ${STATUS_LABEL[c.status].toLowerCase()} cannot be withdrawn`);
    if (!reason.trim() || !location.trim()) return fail('Give the reason and where it is taken');
    const sh = c.shipmentId ? ops.snapshot().shipments.find((x) => x.id === c.shipmentId) : undefined;
    let reversed = '';
    if (sh && sh.stage === 'LOADED') {
      const res = ops.commercial.adjustStock(sh.lines.map((l) => ({ sku: l.sku, delta: l.qty })));
      if (!res.ok) return res;
      ops.mutate((s) => {
        const placed = { ...s.placed };
        for (const l of sh.lines) placed[l.sku] = { ...placed[l.sku], 'WH-MSA': round2((placed[l.sku]?.['WH-MSA'] ?? 0) + l.qty) };
        return {
          ...s,
          placed,
          moves: [...sh.lines.map((l) => ({ id: uid('mv'), date: TODAY, sku: l.sku, qty: l.qty, to: 'WH-MSA', kind: 'ADJUSTMENT' as const, ref: `${sh.number} withdrawn`, by: actor.name })), ...s.moves],
          shipments: s.shipments.map((x) => (x.id === sh.id ? { ...x, stage: 'DOCUMENTS', history: [...x.history, log(`Container ${c.number} withdrawn — goods back in the port store`, reason)] } : x))
        };
      });
      reversed = ` · ${sh.lines.map((l) => `${l.qty} ${l.sku}`).join(', ')} back in WH-MSA (now ${sh.lines.map((l) => stockAt(ops.snapshot(), ops.products, l.sku, 'WH-MSA')).join(', ')})`;
    }
    commit({ ...ref.current, containers: ref.current.containers.map((x) => (x.id === id ? { ...x, status: 'WITHDRAWN', location, events: [...x.events, { at: stamp(), status: 'WITHDRAWN', location, by: actor.name, note: reason }] } : x)) });
    audit({ module: 'Containers', by: actor.name, action: 'Container withdrawn', ref: c.number, note: reason });
    return done('Container withdrawn', `${c.number}${reversed}`);
  };

  /* ---------------- KRA and port discrepancies ---------------- */
  const logDiscrepancy = (d: Pick<PortDiscrepancy, 'containerNo' | 'type' | 'declared' | 'found' | 'source'> & { raw?: string }): Result => {
    const g = guard('OFFICER', 'STOREKEEPER', 'MANAGER');
    if (g) return g;
    const no = normaliseContainer(d.containerNo);
    if (!CONTAINER_RE.test(no)) return fail('Enter a valid container number');
    if (!d.declared.trim() || !d.found.trim()) return fail('Enter what was declared and what KRA found');
    const s = ref.current;
    const { number, sequence } = next(s, 'PD');
    commit({ ...s, sequence, discrepancies: [{ ...d, containerNo: no, id: uid('pd'), number, receivedOn: TODAY, status: 'OPEN', loggedBy: actor.name }, ...s.discrepancies] });
    notify({ module: 'Containers', to: 'Operations Manager', subject: `KRA query ${number} on ${no}: ${d.type.toLowerCase()}`, body: `Declared ${d.declared}, found ${d.found}. The container is held until this is resolved.`, ref: number, level: 'critical' });
    return done('Discrepancy logged', `${number} — ${no} is held at the port`);
  };
  const importKraEmail = (text: string): Result => {
    const p = parseKraEmail(text);
    if (!p.containerNo) return fail('No container number found in the email');
    return logDiscrepancy({ ...p, declared: p.declared || 'see email', found: p.found || 'see email', source: 'KRA email', raw: text.trim() });
  };
  const resolveDiscrepancy = (id: string, resolution: string): Result => {
    const g = guard('OFFICER', 'MANAGER');
    if (g) return g;
    const d = ref.current.discrepancies.find((x) => x.id === id)!;
    if (d.status !== 'OPEN') return fail('Already resolved');
    if (!resolution.trim()) return fail('Describe how it was resolved (amended entry, re-weigh, re-seal)');
    if (d.loggedBy === actor.name && !is('MANAGER')) return fail('Someone other than the person who logged it resolves it');
    commit({ ...ref.current, discrepancies: ref.current.discrepancies.map((x) => (x.id === id ? { ...x, status: 'RESOLVED', resolution, resolvedBy: actor.name } : x)) });
    return done('Resolved', `${d.containerNo} can move again`);
  };

  const reset = () => commit(buildContainersSeed());

  return {
    state,
    actor,
    canWrite: access.canWrite,
    requestBooking,
    sendBooking,
    confirmBooking,
    rejectBooking,
    releaseEmpties,
    moveContainer,
    stuffContainer,
    rollOver,
    withdraw,
    logDiscrepancy,
    importKraEmail,
    resolveDiscrepancy,
    reset
  };
};

export const ContainersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useContainersStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
};

export const useContainers = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useContainers must be used inside ContainersProvider');
  return ctx;
};
