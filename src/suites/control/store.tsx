import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { addDays, TODAY, localStamp } from '../finance/engine';
import { buildControlSeed, CTL_ACTORS } from './data';
import type { Capa, Complaint, ControlState, CtlRole, Finding, Priority, Ticket } from './types';

export type QualityPage = 'overview' | 'audits' | 'capa' | 'risks' | 'complaints';
export type IctPage = 'overview' | 'tickets' | 'assets' | 'changes';
export type GovernancePage = 'overview' | 'calendar' | 'policies' | 'permits';
type Nav<P> = { page: P; focus: string | null };
type Result = { ok: true; id?: string } | { ok: false; error: string };

const Ctx = createContext<ReturnType<typeof useControlStore> | null>(null);

const useControlStore = () => {
  const { addToast } = useApp();
  const [state, setState] = useState<ControlState>(buildControlSeed);
  const [quality, setQ] = useState<Nav<QualityPage>>({ page: 'overview', focus: null });
  const [ict, setI] = useState<Nav<IctPage>>({ page: 'overview', focus: null });
  const [governance, setG] = useState<Nav<GovernancePage>>({ page: 'overview', focus: null });
  const ref = useRef(state);
  ref.current = state;
  const actor = state.actor;

  const commit = (next: ControlState) => {
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
  const next = (s: ControlState, prefix: string) => {
    const n = (s.sequence[prefix] ?? 0) + 1;
    return { number: `${prefix}-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`, sequence: { ...s.sequence, [prefix]: n } };
  };
  const log = (action: string, note?: string) => ({ at: now(), by: actor.name, action, note });
  const isIct = actor.role === 'ICT_OFFICER' || actor.role === 'ICT_MANAGER';

  const setActor = (role: CtlRole) => {
    commit({ ...ref.current, actor: CTL_ACTORS[role] });
    addToast({ type: 'info', title: `Acting as ${CTL_ACTORS[role].title}`, message: CTL_ACTORS[role].name });
  };

  /* ================= Quality ================= */
  const raiseCapa = (c: Pick<Capa, 'source' | 'sourceRef' | 'problem' | 'owner' | 'due'>, link?: { auditId: string; findingId: string } | { complaintId: string }): Result => {
    const s = ref.current;
    if (!c.problem.trim() || !c.owner.trim()) return fail('Describe the problem and choose an owner');
    const { number, sequence } = next(s, 'CAPA');
    const id = uid('ca');
    const capa: Capa = { ...c, id, number, rootCause: '', action: '', status: 'OPEN', history: [log('Raised')] };
    commit({
      ...s,
      sequence,
      capas: [capa, ...s.capas],
      audits: link && 'auditId' in link ? s.audits.map((a) => (a.id === link.auditId ? { ...a, findings: a.findings.map((f) => (f.id === link.findingId ? { ...f, capaId: id } : f)) } : a)) : s.audits,
      complaints: link && 'complaintId' in link ? s.complaints.map((x) => (x.id === link.complaintId ? { ...x, capaId: id, status: 'INVESTIGATING' } : x)) : s.complaints
    });
    return done('Corrective action raised', `${number} assigned to ${c.owner}`, id);
  };
  const updateCapa = (id: string, patch: Partial<Capa>, action: string, note?: string) => {
    const s = ref.current;
    commit({ ...s, capas: s.capas.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log(action, note)] } : x)) });
  };
  const progressCapa = (id: string, rootCause: string, action: string): Result => {
    const c = ref.current.capas.find((x) => x.id === id)!;
    if (c.status === 'OPEN') {
      if (!rootCause.trim() || !action.trim()) return fail('Record the root cause and the corrective action');
      updateCapa(id, { status: 'IN_PROGRESS', rootCause, action }, 'Root cause and action agreed');
      return done('In progress', c.number);
    }
    if (c.status === 'IN_PROGRESS') {
      updateCapa(id, { status: 'VERIFY' }, 'Action completed — awaiting verification');
      return done('Sent for verification', 'The QHSE Manager checks it worked');
    }
    return fail('Nothing to progress');
  };
  const verifyCapa = (id: string, effective: boolean, note: string): Result => {
    const c = ref.current.capas.find((x) => x.id === id)!;
    if (actor.role !== 'QHSE') return fail('Effectiveness is verified by the QHSE Manager');
    if (c.owner === actor.name) return fail('You owned this action, so someone else must verify it');
    if (!effective && !note.trim()) return fail('Say why it was not effective');
    updateCapa(id, { status: effective ? 'CLOSED' : 'IN_PROGRESS' }, effective ? 'Verified effective — closed' : 'Not effective — reopened', note || undefined);
    return done(effective ? 'Closed' : 'Reopened', c.number);
  };
  const addFinding = (auditId: string, f: Omit<Finding, 'id'>): Result => {
    const s = ref.current;
    if (!f.text.trim()) return fail('Describe the finding');
    commit({ ...s, audits: s.audits.map((a) => (a.id === auditId ? { ...a, status: a.status === 'PLANNED' ? 'IN_PROGRESS' : a.status, findings: [...a.findings, { ...f, id: uid('f') }] } : a)) });
    return done('Finding added', f.severity.toLowerCase());
  };
  const closeAudit = (auditId: string): Result => {
    const s = ref.current;
    const a = s.audits.find((x) => x.id === auditId)!;
    const open = a.findings.filter((f) => f.severity !== 'OBSERVATION' && !f.capaId);
    if (open.length) return fail(`${open.length} finding${open.length === 1 ? ' needs' : 's need'} a corrective action before closing`);
    commit({ ...s, audits: s.audits.map((x) => (x.id === auditId ? { ...x, status: 'CLOSED' } : x)) });
    return done('Audit closed', a.number);
  };
  const logComplaint = (c: Pick<Complaint, 'customerId' | 'sku' | 'batch' | 'category' | 'description' | 'severity'>): Result => {
    const s = ref.current;
    if (!c.customerId || !c.description.trim()) return fail('Choose the customer and describe the complaint');
    const { number, sequence } = next(s, 'CMP');
    commit({ ...s, sequence, complaints: [{ ...c, id: uid('cm'), number, date: TODAY, status: 'NEW' }, ...s.complaints] });
    return done('Complaint logged', number);
  };
  const resolveComplaint = (id: string, response: string): Result => {
    const s = ref.current;
    const c = s.complaints.find((x) => x.id === id)!;
    if (!response.trim()) return fail('Record the response given to the customer');
    if (c.severity === 'HIGH' && !c.capaId) return fail('High-severity complaints need a corrective action first');
    commit({ ...s, complaints: s.complaints.map((x) => (x.id === id ? { ...x, status: 'RESOLVED', response } : x)) });
    return done('Complaint resolved', c.number);
  };
  const rescoreRisk = (id: string, l: number, i: number) => {
    const s = ref.current;
    commit({ ...s, risks: s.risks.map((r) => (r.id === id ? { ...r, residualLikelihood: l, residualImpact: i, nextReview: addDays(TODAY, 90) } : r)) });
    addToast({ type: 'success', title: 'Risk reviewed', message: 'Next review in 90 days' });
  };

  /* ================= ICT ================= */
  const updateTicket = (id: string, patch: Partial<Ticket>, action: string, note?: string) => {
    const s = ref.current;
    commit({ ...s, tickets: s.tickets.map((x) => (x.id === id ? { ...x, ...patch, notes: [...x.notes, log(action, note)] } : x)) });
  };
  const createTicket = (t: Pick<Ticket, 'title' | 'requester' | 'department' | 'category' | 'priority'>): Result => {
    const s = ref.current;
    if (!t.title.trim() || !t.requester.trim()) return fail('Describe the issue and who is affected');
    const { number, sequence } = next(s, 'INC');
    const id = uid('tk');
    commit({ ...s, sequence, tickets: [{ ...t, id, number, created: now(), status: 'NEW', notes: [log('Logged')] }, ...s.tickets] });
    return done('Ticket logged', `${number} · ${t.priority}`, id);
  };
  const takeTicket = (id: string): Result => {
    if (!isIct) return fail('Tickets are picked up by ICT — switch to Brian Kamau or Samuel Kiptoo');
    const t = ref.current.tickets.find((x) => x.id === id)!;
    updateTicket(id, { assignee: actor.name, status: 'IN_PROGRESS', firstResponse: t.firstResponse ?? now() }, 'Picked up');
    return done('Assigned to you', t.number);
  };
  const waitTicket = (id: string, note: string): Result => {
    if (!note.trim()) return fail('Say what you are waiting for');
    updateTicket(id, { status: 'WAITING' }, 'Waiting', note);
    return done('On hold', note);
  };
  const resolveTicket = (id: string, resolution: string): Result => {
    if (!isIct) return fail('Only ICT can resolve tickets');
    if (!resolution.trim()) return fail('Describe the fix');
    const t = ref.current.tickets.find((x) => x.id === id)!;
    updateTicket(id, { status: 'RESOLVED', resolvedAt: now(), resolution, firstResponse: t.firstResponse ?? now() }, 'Resolved', resolution);
    return done('Resolved', t.number);
  };
  const decideChange = (id: string, approve: boolean, note: string): Result => {
    const s = ref.current;
    const c = s.changes.find((x) => x.id === id)!;
    if (actor.role !== 'ICT_MANAGER') return fail('The ICT Manager chairs the change board');
    if (c.requestedBy === actor.name) return fail('You raised this change, so someone else must approve it');
    if (!approve && !note.trim()) return fail('Give a reason');
    commit({ ...s, changes: s.changes.map((x) => (x.id === id ? { ...x, status: approve ? 'APPROVED' : 'REJECTED', history: [...x.history, log(approve ? 'Approved by the change board' : 'Rejected', note || undefined)] } : x)) });
    return done(approve ? 'Change approved' : 'Change rejected', c.number);
  };
  const implementChange = (id: string): Result => {
    const s = ref.current;
    const c = s.changes.find((x) => x.id === id)!;
    if (c.status !== 'APPROVED') return fail('Only approved changes can be implemented');
    commit({ ...s, changes: s.changes.map((x) => (x.id === id ? { ...x, status: 'IMPLEMENTED', history: [...x.history, log('Implemented successfully')] } : x)) });
    return done('Implemented', c.number);
  };

  /* ================= Integrations ================= */
  const addSync = (s: ControlState, connectorId: string, status: 'OK' | 'WARN' | 'FAIL', records: number, message: string) => ({
    ...s,
    syncLog: [{ id: uid('sy'), connectorId, at: now(), direction: 'OUT' as const, records, status, message }, ...s.syncLog]
  });
  const testConnector = (id: string): Result => {
    const s = ref.current;
    const c = s.connectors.find((x) => x.id === id)!;
    if (c.status === 'PAUSED') return fail('Resume the connector first');
    commit({ ...addSync(s, id, 'OK', 0, 'Connection test passed — credentials valid'), connectors: s.connectors.map((x) => (x.id === id ? { ...x, lastSync: now() } : x)) });
    return done('Connection OK', c.name);
  };
  const retryFailed = (id: string): Result => {
    const s = ref.current;
    const failed = s.syncLog.filter((l) => l.connectorId === id && l.status !== 'OK');
    if (!failed.length) return fail('Nothing to retry');
    const c = s.connectors.find((x) => x.id === id)!;
    const cleared = { ...s, syncLog: s.syncLog.map((l) => (l.connectorId === id && l.status !== 'OK' ? { ...l, status: 'OK' as const, message: `${l.message} — resolved on retry` } : l)) };
    commit({ ...addSync(cleared, id, 'OK', failed.reduce((x, l) => x + Math.max(1, l.records), 0), `${failed.length} failed item${failed.length === 1 ? '' : 's'} resent successfully`), connectors: s.connectors.map((x) => (x.id === id ? { ...x, status: 'CONNECTED', lastSync: now() } : x)) });
    return done('Retry complete', `${c.name} is healthy`);
  };
  const togglePause = (id: string) => {
    const s = ref.current;
    const c = s.connectors.find((x) => x.id === id)!;
    commit({ ...s, connectors: s.connectors.map((x) => (x.id === id ? { ...x, status: x.status === 'PAUSED' ? 'CONNECTED' : 'PAUSED' } : x)) });
    addToast({ type: 'info', title: c.status === 'PAUSED' ? 'Resumed' : 'Paused', message: c.name });
  };

  /* ================= Governance ================= */
  const fileObligation = (id: string, refNo: string): Result => {
    const s = ref.current;
    const o = s.obligations.find((x) => x.id === id)!;
    if (!refNo.trim()) return fail('Enter the acknowledgement or receipt number');
    const months = { Monthly: 1, Quarterly: 3, Annual: 12, 'One-off': 0 }[o.frequency];
    const due = new Date(o.due + 'T00:00:00');
    due.setMonth(due.getMonth() + months);
    const nextDue = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    const rolled = months && !s.obligations.some((x) => x.name === o.name.replace(' — last month', '') && x.due === nextDue);
    commit({
      ...s,
      obligations: [
        ...s.obligations.map((x) => (x.id === id ? { ...x, status: 'FILED' as const, filedOn: TODAY, ref: refNo } : x)),
        ...(rolled ? [{ ...o, id: uid('ob'), name: o.name.replace(' — last month', ''), due: nextDue, status: 'DUE' as const, filedOn: undefined, ref: undefined }] : [])
      ]
    });
    return done('Marked as filed', `${o.name} · ${refNo}${rolled ? ' — next one added to the calendar' : ''}`);
  };
  const renewPermit = (id: string, expiry: string): Result => {
    const s = ref.current;
    if (expiry <= TODAY) return fail('The new expiry must be in the future');
    commit({ ...s, permits: s.permits.map((p) => (p.id === id ? { ...p, expiry, renewalStarted: false } : p)) });
    return done('Permit renewed', `Valid to ${expiry}`);
  };
  const startRenewal = (id: string) => {
    const s = ref.current;
    commit({ ...s, permits: s.permits.map((p) => (p.id === id ? { ...p, renewalStarted: true } : p)) });
    addToast({ type: 'success', title: 'Renewal started', message: 'Tracked until the new certificate is in' });
  };
  const remindPolicy = (id: string) => {
    const p = ref.current.policies.find((x) => x.id === id)!;
    addToast({ type: 'success', title: 'Reminders sent', message: `${p.staff - p.acknowledged} staff asked to acknowledge “${p.title}”` });
  };

  /* ================= Implementation ================= */
  const toggleTask = (wsId: string, index: number) => {
    const s = ref.current;
    commit({ ...s, workstreams: s.workstreams.map((w) => (w.id === wsId ? { ...w, tasks: w.tasks.map((t, i) => (i === index ? { ...t, done: !t.done } : t)) } : w)) });
  };

  const reset = () => {
    commit(buildControlSeed());
    addToast({ type: 'info', title: 'Demo data restored', message: 'Quality, ICT, integrations and governance are back to their starting data.' });
  };

  return {
    state,
    actor,
    quality,
    ict,
    governance,
    setQuality: useCallback((page: QualityPage, focus: string | null = null) => setQ({ page, focus }), []),
    setIct: useCallback((page: IctPage, focus: string | null = null) => setI({ page, focus }), []),
    setGovernance: useCallback((page: GovernancePage, focus: string | null = null) => setG({ page, focus }), []),
    clearFocus: useCallback(() => {
      setQ((x) => ({ ...x, focus: null }));
      setI((x) => ({ ...x, focus: null }));
      setG((x) => ({ ...x, focus: null }));
    }, []),
    setActor,
    raiseCapa,
    progressCapa,
    verifyCapa,
    addFinding,
    closeAudit,
    logComplaint,
    resolveComplaint,
    rescoreRisk,
    createTicket,
    takeTicket,
    waitTicket,
    resolveTicket,
    decideChange,
    implementChange,
    testConnector,
    retryFailed,
    togglePause,
    fileObligation,
    renewPermit,
    startRenewal,
    remindPolicy,
    toggleTask,
    reset
  };
};

export const ControlProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useControlStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
};

export const useControl = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useControl must be used inside ControlProvider');
  return ctx;
};

export type { Priority };
