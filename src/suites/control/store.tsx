import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { addDays, TODAY, localStamp } from '../finance/engine';
import { audit } from '../../platform/audit';
import { notify } from '../../platform/outbox';
import { useAccess } from '../../platform/access';
import { useSession } from '../../auth/session';
import { nextApprover, RULE_ROLES } from '../../platform/rules';
import { buildControlSeed, CTL_ACTORS } from './data';
import { qualityActions, addMonths } from './actions/quality';
import { ictActions } from './actions/ict';
import { workplaceActions } from './actions/workplace';
import type { ActionKit, Result } from './actions/kit';
import type { Capa, Complaint, ControlState, CtlRole, Finding, Priority, Ticket } from './types';

export type QualityPage = 'overview' | 'audits' | 'capa' | 'risks' | 'complaints' | 'programme' | 'opportunities' | 'emergencies' | 'reports' | 'portal';
export type IctPage = 'overview' | 'tickets' | 'assets' | 'changes' | 'problems' | 'cmdb' | 'monitoring' | 'knowledge';
export type GovernancePage = 'overview' | 'calendar' | 'policies' | 'permits' | 'documents';
type Nav<P> = { page: P; focus: string | null };
export type { Result };

/** Error every mutating action returns for a read-only (Viewer) sign-in. */
export const READ_ONLY = 'This is a read-only account — you can view records but not change them';

const Ctx = createContext<ReturnType<typeof useControlStore> | null>(null);

/** Persona that fits the signed-in person's job, so the suites open as the right role. */
const personaFor = (title?: string): CtlRole => (/ict|system|it /i.test(`${title ?? ''} `) ? 'ICT_MANAGER' : /secretary|legal|compliance|director/i.test(title ?? '') ? 'SECRETARY' : 'QHSE');

const useControlStore = () => {
  const { addToast } = useApp();
  const access = useAccess();
  const session = useSession();
  // Open as the persona that matches the signed-in job; the "Acting as" switch still changes it
  const [state, setState] = useState<ControlState>(() => ({ ...buildControlSeed(), actor: CTL_ACTORS[personaFor(session?.title)] }));
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
  const trail: ActionKit['trail'] = (module, action, refNo, extra) => audit({ module, by: `${actor.name} (${access.name})`, action, ref: refNo, ...extra });
  const kit: ActionKit = { get: () => ref.current, commit, fail, done, log, next, uid, now, actor, me: access.name, canApprove: access.canApprove, trail };

  const setActor = (role: CtlRole) => {
    commit({ ...ref.current, actor: CTL_ACTORS[role] });
    addToast({ type: 'info', title: `Acting as ${CTL_ACTORS[role].title}`, message: CTL_ACTORS[role].name });
  };

  /* ================= Quality ================= */
  const raiseCapa = (c: Pick<Capa, 'source' | 'sourceRef' | 'problem' | 'owner' | 'due'> & { reviewDate?: string; auditee?: string }, link?: { auditId: string; findingId: string } | { complaintId: string }): Result => {
    const s = ref.current;
    if (!c.problem.trim() || !c.owner.trim()) return fail('Describe the problem and choose an owner');
    if (!c.due || c.due < TODAY) return fail('Choose a due date from today onwards');
    if (c.reviewDate && c.reviewDate < c.due) return fail('The effectiveness review date cannot be before the due date');
    const { number, sequence } = next(s, 'CAPA');
    const id = uid('ca');
    const reviewDate = c.reviewDate || addDays(c.due, 30);
    const capa: Capa = { ...c, id, number, reviewDate, originalDue: c.due, rootCause: '', action: '', status: 'OPEN', history: [log('Raised', `Owner ${c.owner}, due ${c.due}, review ${reviewDate}`)] };
    commit({
      ...s,
      sequence,
      capas: [capa, ...s.capas],
      audits: link && 'auditId' in link ? s.audits.map((a) => (a.id === link.auditId ? { ...a, findings: a.findings.map((f) => (f.id === link.findingId ? { ...f, capaId: id } : f)) } : a)) : s.audits,
      complaints: link && 'complaintId' in link ? s.complaints.map((x) => (x.id === link.complaintId ? { ...x, capaId: id, status: 'INVESTIGATING' } : x)) : s.complaints
    });
    notify({ module: 'Quality', to: c.owner, subject: `Corrective action ${number} assigned to you`, body: `${c.problem} — due ${c.due}`, ref: number });
    if (c.auditee && c.auditee !== c.owner) notify({ module: 'Quality', to: c.auditee, subject: `Corrective action ${number} raised in your area`, body: c.problem, ref: number });
    notify({ module: 'Quality', to: 'Management Representative', channels: ['EMAIL'], subject: `New corrective action ${number}`, body: c.problem, ref: number });
    trail('Quality', 'Corrective action raised', number, { note: `${c.owner}, due ${c.due}` });
    return done('Corrective action raised', `${number} assigned to ${c.owner}`, id);
  };
  const updateCapa = (id: string, patch: Partial<Capa>, action: string, note?: string) => {
    const s = ref.current;
    commit({ ...s, capas: s.capas.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log(action, note)] } : x)) });
  };
  const progressCapa = (id: string, rootCause: string, action: string): Result => {
    const c = ref.current.capas.find((x) => x.id === id)!;
    if (c.owner !== actor.name && actor.role !== 'QHSE') return fail(`Only the owner (${c.owner}) or the QHSE Manager updates this action`);
    if (c.status === 'OPEN') {
      if (!rootCause.trim() || !action.trim()) return fail('Record the root cause and the corrective action');
      updateCapa(id, { status: 'IN_PROGRESS', rootCause, action }, 'Root cause and action agreed');
      return done('In progress', c.number);
    }
    if (c.status === 'IN_PROGRESS') {
      updateCapa(id, { status: 'VERIFY' }, 'Action completed — awaiting verification');
      notify({ module: 'Quality', to: 'QHSE Manager', subject: `${c.number} ready for verification`, body: c.problem, ref: c.number });
      return done('Sent for verification', 'The QHSE Manager checks it worked');
    }
    return fail('Nothing to progress');
  };
  const verifyCapa = (id: string, effective: boolean, note: string): Result => {
    const c = ref.current.capas.find((x) => x.id === id)!;
    const step = nextApprover('qa.capa.verify', 0, 0);
    if (c.status !== 'VERIFY') return fail('The action is not waiting for verification');
    if (actor.role !== step.role) return fail(`Effectiveness is verified by the ${RULE_ROLES[step.role] ?? step.role}`);
    if (c.owner === actor.name) return fail('You owned this action, so someone else must verify it');
    if (!effective && !note.trim()) return fail('Say why it was not effective');
    if (effective && c.reviewDate && c.reviewDate > TODAY) return fail(`Effectiveness can only be confirmed from the review date (${c.reviewDate}) — the action stays on hold until then`);
    updateCapa(id, { status: effective ? 'CLOSED' : 'IN_PROGRESS' }, effective ? 'Verified effective — closed' : 'Not effective — reopened', note || undefined);
    notify({ module: 'Quality', to: c.owner, subject: `${c.number} ${effective ? 'closed — verified effective' : 'reopened — not effective'}`, body: note, ref: c.number });
    trail('Quality', effective ? 'Corrective action closed' : 'Corrective action reopened', c.number, { note: note || undefined });
    return done(effective ? 'Closed' : 'Reopened', c.number);
  };
  const addFinding = (auditId: string, f: Omit<Finding, 'id'>): Result => {
    const s = ref.current;
    const a = s.audits.find((x) => x.id === auditId)!;
    if (a.status === 'CLOSED') return fail('The audit is closed');
    if (actor.role !== 'QHSE' && actor.name !== a.auditor) return fail('Findings are recorded by the auditor or the QHSE Manager');
    if (!f.text.trim()) return fail('Describe the finding');
    if (f.severity === 'MAJOR' && !f.evidence?.trim()) return fail('Record the objective evidence for a major finding');
    commit({ ...s, audits: s.audits.map((x) => (x.id === auditId ? { ...x, status: x.status === 'PLANNED' ? 'IN_PROGRESS' : x.status, findings: [...x.findings, { ...f, id: uid('f') }] } : x)) });
    if (a.auditee && f.severity !== 'OBSERVATION') notify({ module: 'Quality', to: a.auditee, subject: `${f.severity === 'MAJOR' ? 'Major' : 'Minor'} finding in ${a.number}`, body: f.text, ref: a.number });
    return done('Finding added', f.severity.toLowerCase());
  };
  const closeAudit = (auditId: string): Result => {
    const s = ref.current;
    const a = s.audits.find((x) => x.id === auditId)!;
    if (actor.role !== 'QHSE' && actor.name !== a.auditor) return fail('The auditor or the QHSE Manager closes the audit');
    if (a.status === 'CLOSED') return fail('Already closed');
    const open = a.findings.filter((f) => f.severity !== 'OBSERVATION' && !f.capaId);
    if (open.length) return fail(`${open.length} finding${open.length === 1 ? ' needs' : 's need'} a corrective action before closing`);
    const unanswered = (a.checklist ?? []).filter((c) => !c.result);
    if (unanswered.length) return fail(`${unanswered.length} checklist question${unanswered.length === 1 ? ' is' : 's are'} not answered`);
    /* Roll the programme forward: the area's next audit is due one frequency later */
    const area = s.programmes.flatMap((p) => p.areas.map((x) => ({ p, x }))).find(({ x }) => x.id === a.programmeAreaId);
    const nextDue = area ? addMonths(a.date, area.x.frequencyMonths) : undefined;
    commit({
      ...s,
      audits: s.audits.map((x) => (x.id === auditId ? { ...x, status: 'CLOSED', history: [...(x.history ?? []), log('Closed')] } : x)),
      programmes: area ? s.programmes.map((p) => (p.id === area.p.id ? { ...p, areas: p.areas.map((x) => (x.id === area.x.id ? { ...x, lastAudit: a.date, nextDue: nextDue! } : x)), history: [...p.history, log(`${area.x.area} audited — next due ${nextDue}`)] } : p)) : s.programmes
    });
    if (a.auditee) notify({ module: 'Quality', to: a.auditee, subject: `Audit ${a.number} closed`, body: `${a.findings.length} findings. ${nextDue ? `Next audit of ${area!.x.area} due ${nextDue}.` : ''}`, ref: a.number });
    trail('Quality', 'Audit closed', a.number);
    return done('Audit closed', `${a.number}${nextDue ? ` — next ${area!.x.area} audit due ${nextDue}` : ''}`);
  };
  const logComplaint = (c: Pick<Complaint, 'customerId' | 'sku' | 'batch' | 'category' | 'description' | 'severity'> & { channel?: Complaint['channel'] }): Result => {
    const s = ref.current;
    if (!c.customerId || !c.description.trim()) return fail('Choose the customer and describe the complaint');
    const { number, sequence } = next(s, 'CMP');
    const id = uid('cm');
    commit({ ...s, sequence, complaints: [{ ...c, channel: c.channel ?? 'Phone', id, number, date: TODAY, status: 'NEW', history: [log(`Logged (${c.channel ?? 'Phone'})`)] }, ...s.complaints] });
    if (c.severity === 'HIGH') notify({ module: 'Quality', to: 'QHSE Manager', level: 'critical', subject: `High-severity complaint ${number}`, body: c.description, ref: number });
    return done('Complaint logged', number, id);
  };
  const resolveComplaint = (id: string, response: string): Result => {
    const s = ref.current;
    const c = s.complaints.find((x) => x.id === id)!;
    if (c.status === 'RESOLVED') return fail('Already resolved');
    if (!response.trim()) return fail('Record the response given to the customer');
    if (c.severity === 'HIGH' && !c.capaId) return fail('High-severity complaints need a corrective action first');
    commit({ ...s, complaints: s.complaints.map((x) => (x.id === id ? { ...x, status: 'RESOLVED', response, resolvedOn: TODAY, acknowledgedAt: x.acknowledgedAt ?? TODAY, history: [...(x.history ?? []), log('Resolved', response)] } : x)) });
    notify({ module: 'Quality', to: `Customer (${c.number})`, channels: ['EMAIL'], subject: `Your complaint ${c.number} is resolved — how did we do?`, body: `${response}\n\nPlease rate our handling from 1 to 5.`, ref: c.number });
    return done('Complaint resolved', `${c.number} — feedback request sent`);
  };
  const rescoreRisk = (id: string, l: number, i: number): Result => {
    const s = ref.current;
    const r = s.risks.find((x) => x.id === id)!;
    if (actor.role !== 'QHSE' && actor.name !== r.owner) return fail(`Only the QHSE Manager or the risk owner (${r.owner}) reviews this risk`);
    if (![l, i].every((x) => x >= 1 && x <= 5)) return fail('Scores must be 1 to 5');
    const before = `${r.residualLikelihood}×${r.residualImpact}`;
    commit({ ...s, risks: s.risks.map((x) => (x.id === id ? { ...x, residualLikelihood: l, residualImpact: i, nextReview: addDays(TODAY, 90), history: [...(x.history ?? []), log('Reviewed', `Residual ${before} → ${l}×${i}`)] } : x)) });
    trail('Quality', 'Risk reviewed', r.title, { field: 'residual', before, after: `${l}×${i}` });
    return done('Risk reviewed', 'Next review in 90 days');
  };
  /** Long-term action for an emergency: raises a CAPA and links it. */
  const raiseEmergencyCapa = (emergencyId: string, owner: string, due: string, longTerm: string): Result => {
    const e = ref.current.emergencies.find((x) => x.id === emergencyId)!;
    if (e.capaId) return fail('A corrective action is already linked');
    if (!longTerm.trim()) return fail('Describe the long-term preventive action');
    const r = raiseCapa({ source: 'INCIDENT', sourceRef: e.number, problem: `${e.type} at ${e.site}: ${longTerm}`, owner, due });
    if (r.ok && r.id) q.linkEmergencyCapa(emergencyId, r.id, longTerm);
    return r;
  };

  /* ================= ICT ================= */
  const updateTicket = (id: string, patch: Partial<Ticket>, action: string, note?: string) => {
    const s = ref.current;
    commit({ ...s, tickets: s.tickets.map((x) => (x.id === id ? { ...x, ...patch, notes: [...x.notes, log(action, note)] } : x)) });
  };
  const createTicket = (t: Pick<Ticket, 'title' | 'requester' | 'department' | 'category' | 'priority'> & Partial<Pick<Ticket, 'channel' | 'impact' | 'urgency' | 'ciIds'>>): Result => {
    const s = ref.current;
    if (!t.title.trim() || !t.requester.trim()) return fail('Describe the issue and who is affected');
    const { number, sequence } = next(s, 'INC');
    const id = uid('tk');
    commit({ ...s, sequence, tickets: [{ ...t, channel: t.channel ?? 'Phone', id, number, created: now(), status: 'NEW', notes: [log(`Logged (${t.channel ?? 'Phone'})`)] }, ...s.tickets] });
    if (t.priority === 'P1') notify({ module: 'ICT', to: 'ICT on-call', level: 'critical', channels: ['IN_APP', 'SMS'], subject: `P1 ${number}: ${t.title}`, ref: number });
    return done('Ticket logged', `${number} · ${t.priority}`, id);
  };
  const takeTicket = (id: string): Result => {
    if (!isIct) return fail('Tickets are picked up by ICT — switch to Brian Kamau or Samuel Kiptoo');
    const t = ref.current.tickets.find((x) => x.id === id)!;
    if (t.status === 'RESOLVED') return fail('The ticket is resolved');
    updateTicket(id, { assignee: actor.name, status: 'IN_PROGRESS', firstResponse: t.firstResponse ?? now() }, 'Picked up');
    return done('Assigned to you', t.number);
  };
  const waitTicket = (id: string, note: string): Result => {
    if (!isIct) return fail('Only ICT can put a ticket on hold');
    if (!note.trim()) return fail('Say what you are waiting for');
    const t = ref.current.tickets.find((x) => x.id === id)!;
    if (t.status === 'RESOLVED') return fail('The ticket is resolved');
    updateTicket(id, { status: 'WAITING' }, 'Waiting', note);
    return done('On hold', note);
  };
  const resolveTicket = (id: string, resolution: string): Result => {
    if (!isIct) return fail('Only ICT can resolve tickets');
    if (!resolution.trim()) return fail('Describe the fix');
    const t = ref.current.tickets.find((x) => x.id === id)!;
    if (t.status === 'RESOLVED') return fail('Already resolved');
    updateTicket(id, { status: 'RESOLVED', resolvedAt: now(), resolution, firstResponse: t.firstResponse ?? now() }, 'Resolved', resolution);
    notify({ module: 'ICT', to: t.requester, subject: `${t.number} resolved — please confirm`, body: resolution, ref: t.number });
    return done('Resolved', t.number);
  };
  const riskLevel = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
  const decideChange = (id: string, approve: boolean, note: string): Result => {
    const s = ref.current;
    const c = s.changes.find((x) => x.id === id)!;
    if (c.status !== 'SUBMITTED') return fail('This change has already been decided');
    const step = nextApprover('ict.change', riskLevel[c.risk], c.approvals?.length ?? 0);
    if (actor.role !== step.role) return fail(step.role === 'ICT_MANAGER' ? 'The ICT Manager chairs the change board' : `${RULE_ROLES[step.role] ?? step.role} gives the next approval for this ${c.risk.toLowerCase()}-risk change (Approval rules)`);
    if (c.requestedBy === actor.name) return fail('You raised this change, so someone else must approve it');
    if (c.approvals?.some((a) => a.by === actor.name)) return fail('You have already approved this change');
    if (!approve && !note.trim()) return fail('Give a reason');
    const approvals = approve ? [...(c.approvals ?? []), { by: actor.name, role: actor.role, at: TODAY }] : c.approvals;
    const final = !approve || step.last;
    commit({ ...s, changes: s.changes.map((x) => (x.id === id ? { ...x, approvals, status: !approve ? 'REJECTED' : final ? 'APPROVED' : 'SUBMITTED', history: [...x.history, log(!approve ? 'Rejected' : final ? 'Approved by the change board' : `Approved (1 of ${step.steps.length}) — ${RULE_ROLES[step.steps[1]] ?? step.steps[1]} next`, note || undefined)] } : x)) });
    trail('ICT', approve ? 'Change approved' : 'Change rejected', c.number, { note: note || undefined });
    if (approve && !final) notify({ module: 'ICT', to: RULE_ROLES[step.steps[1]] ?? step.steps[1], subject: `Second approval needed for ${c.number}`, body: c.title, ref: c.number });
    return done(!approve ? 'Change rejected' : final ? 'Change approved' : 'First approval recorded', c.number);
  };
  const implementChange = (id: string): Result => i.recordOutcome(id, 'SUCCESS', '');

  /* ================= Integrations ================= */
  const addSync = (s: ControlState, connectorId: string, status: 'OK' | 'WARN' | 'FAIL', records: number, message: string) => ({
    ...s,
    syncLog: [{ id: uid('sy'), connectorId, at: now(), direction: 'OUT' as const, records, status, message }, ...s.syncLog]
  });
  const testConnector = (id: string): Result => {
    if (!isIct) return fail('Connections are tested by ICT');
    const s = ref.current;
    const c = s.connectors.find((x) => x.id === id)!;
    if (c.status === 'PAUSED') return fail('Resume the connector first');
    commit({ ...addSync(s, id, 'OK', 0, 'Connection test passed — credentials valid (simulated)'), connectors: s.connectors.map((x) => (x.id === id ? { ...x, lastSync: now() } : x)) });
    return done('Connection OK', c.name);
  };
  const retryFailed = (id: string): Result => {
    if (!isIct) return fail('Failed syncs are retried by ICT');
    const s = ref.current;
    const failed = s.syncLog.filter((l) => l.connectorId === id && l.status !== 'OK');
    if (!failed.length) return fail('Nothing to retry');
    const c = s.connectors.find((x) => x.id === id)!;
    const cleared = { ...s, syncLog: s.syncLog.map((l) => (l.connectorId === id && l.status !== 'OK' ? { ...l, status: 'OK' as const, message: `${l.message} — resolved on retry` } : l)) };
    commit({ ...addSync(cleared, id, 'OK', failed.reduce((x, l) => x + Math.max(1, l.records), 0), `${failed.length} failed item${failed.length === 1 ? '' : 's'} resent successfully`), connectors: s.connectors.map((x) => (x.id === id ? { ...x, status: 'CONNECTED', lastSync: now() } : x)) });
    trail('Integrations', 'Failed syncs retried', c.name);
    return done('Retry complete', `${c.name} is healthy`);
  };
  const togglePause = (id: string): Result => {
    if (actor.role !== 'ICT_MANAGER') return fail('The ICT Manager pauses and resumes connections');
    const s = ref.current;
    const c = s.connectors.find((x) => x.id === id)!;
    commit({ ...s, connectors: s.connectors.map((x) => (x.id === id ? { ...x, status: x.status === 'PAUSED' ? 'CONNECTED' : 'PAUSED' } : x)) });
    trail('Integrations', c.status === 'PAUSED' ? 'Connector resumed' : 'Connector paused', c.name);
    addToast({ type: 'info', title: c.status === 'PAUSED' ? 'Resumed' : 'Paused', message: c.name });
    return { ok: true };
  };

  /* ================= Governance ================= */
  const fileObligation = (id: string, refNo: string): Result => {
    const s = ref.current;
    const o = s.obligations.find((x) => x.id === id)!;
    if (actor.role !== 'SECRETARY' && actor.name !== o.owner) return fail('Filings are recorded by the Company Secretary or the obligation owner');
    if (o.status === 'FILED') return fail('Already filed');
    if (!refNo.trim()) return fail('Enter the acknowledgement or receipt number');
    const months = { Monthly: 1, Quarterly: 3, Annual: 12, 'One-off': 0 }[o.frequency];
    const due = new Date(o.due + 'T00:00:00');
    due.setMonth(due.getMonth() + months);
    const nextDue = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    const rolled = months && !s.obligations.some((x) => x.name === o.name.replace(' — last month', '') && x.due === nextDue);
    commit({
      ...s,
      obligations: [
        ...s.obligations.map((x) => (x.id === id ? { ...x, status: 'FILED' as const, filedOn: TODAY, ref: refNo, history: [...(x.history ?? []), log(`Filed${TODAY > o.due ? ' late' : ''}`, refNo)] } : x)),
        ...(rolled ? [{ ...o, id: uid('ob'), name: o.name.replace(' — last month', ''), due: nextDue, status: 'DUE' as const, filedOn: undefined, ref: undefined, history: [log('Added to the calendar after the previous filing')] }] : [])
      ]
    });
    trail('Governance', 'Statutory filing recorded', o.name, { field: 'status', before: 'DUE', after: 'FILED', note: refNo });
    return done('Marked as filed', `${o.name} · ${refNo}${rolled ? ' — next one added to the calendar' : ''}`);
  };
  const canPermit = (owner?: string) => actor.role === 'SECRETARY' || actor.role === 'QHSE' || actor.name === owner;
  const renewPermit = (id: string, expiry: string): Result => {
    const s = ref.current;
    const p = s.permits.find((x) => x.id === id)!;
    if (!canPermit(p.owner)) return fail('Licences are renewed by the Company Secretary, the QHSE Manager or the licence owner');
    if (!expiry || expiry <= TODAY) return fail('The new expiry must be in the future');
    if (expiry <= p.expiry) return fail('The new expiry must be later than the current one');
    commit({ ...s, permits: s.permits.map((x) => (x.id === id ? { ...x, expiry, renewalStarted: false, remindersSent: [], history: [...(x.history ?? []), log(`Renewed — valid to ${expiry}`, `was ${p.expiry}`)] } : x)) });
    trail('Governance', 'Licence renewed', p.number, { field: 'expiry', before: p.expiry, after: expiry });
    return done('Permit renewed', `Valid to ${expiry}`);
  };
  const startRenewal = (id: string): Result => {
    const s = ref.current;
    const p = s.permits.find((x) => x.id === id)!;
    if (!canPermit(p.owner)) return fail('Licences are renewed by the Company Secretary, the QHSE Manager or the licence owner');
    if (p.renewalStarted) return fail('Renewal already started');
    commit({ ...s, permits: s.permits.map((x) => (x.id === id ? { ...x, renewalStarted: true, history: [...(x.history ?? []), log('Renewal started')] } : x)) });
    trail('Governance', 'Licence renewal started', p.number);
    return done('Renewal started', 'Tracked until the new certificate is in');
  };
  const remindPolicy = (id: string): Result => {
    const s = ref.current;
    const p = s.policies.find((x) => x.id === id)!;
    if (actor.role !== 'SECRETARY' && actor.name !== p.owner) return fail('The Company Secretary or the policy owner sends reminders');
    const pending = p.staff - p.acknowledged;
    if (!pending) return fail('Everyone has acknowledged this policy');
    if (p.lastReminded === TODAY) return fail('Reminders already went out today');
    notify({ module: 'Governance', to: `${pending} staff yet to acknowledge`, channels: ['IN_APP', 'EMAIL'], subject: `Please read and acknowledge: ${p.title} v${p.version}`, ref: p.id });
    commit({ ...s, policies: s.policies.map((x) => (x.id === id ? { ...x, lastReminded: TODAY, history: [...(x.history ?? []), log(`Reminder sent to ${pending} staff`)] } : x)) });
    return done('Reminders sent', `${pending} staff asked to acknowledge “${p.title}”`);
  };

  /* ================= Implementation ================= */
  const toggleTask = (wsId: string, index: number): Result => {
    const s = ref.current;
    commit({ ...s, workstreams: s.workstreams.map((w) => (w.id === wsId ? { ...w, tasks: w.tasks.map((t, ix) => (ix === index ? { ...t, done: !t.done } : t)) } : w)) });
    return { ok: true };
  };

  const reset = () => {
    commit(buildControlSeed());
    addToast({ type: 'info', title: 'Demo data restored', message: 'Quality, ICT, integrations and governance are back to their starting data.' });
  };

  const q = qualityActions(kit);
  const i = ictActions(kit);
  const w = workplaceActions(kit);

  /** Viewers (read-only sign-in) are refused every change, here in the store and not only in the screens. */
  const guard = <A extends unknown[]>(fn: (...a: A) => Result) => (...a: A): Result => (access.readOnly ? fail(READ_ONLY) : fn(...a));
  const writes = {
    raiseCapa,
    progressCapa,
    verifyCapa,
    addFinding,
    closeAudit,
    logComplaint,
    resolveComplaint,
    rescoreRisk,
    raiseEmergencyCapa,
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
    ...(({ linkEmergencyCapa: _skip, ...rest }) => rest)(q),
    ...(({ importDiscovery: _skip, viewArticle: _skip2, ...rest }) => rest)(i),
    ...(({ markRead: _skip, ...rest }) => rest)(w)
  };
  const guarded = Object.fromEntries(Object.entries(writes).map(([key, fn]) => [key, guard(fn as (...a: unknown[]) => Result)])) as unknown as typeof writes;

  return {
    state,
    actor,
    quality,
    ict,
    governance,
    readOnly: access.readOnly,
    me: access.name,
    setQuality: useCallback((page: QualityPage, focus: string | null = null) => setQ({ page, focus }), []),
    setIct: useCallback((page: IctPage, focus: string | null = null) => setI({ page, focus }), []),
    setGovernance: useCallback((page: GovernancePage, focus: string | null = null) => setG({ page, focus }), []),
    clearFocus: useCallback(() => {
      setQ((x) => ({ ...x, focus: null }));
      setI((x) => ({ ...x, focus: null }));
      setG((x) => ({ ...x, focus: null }));
    }, []),
    setActor,
    ...guarded,
    importDiscovery: (rows: Record<string, string>[]) => (access.readOnly ? { imported: 0, errors: [READ_ONLY] } : i.importDiscovery(rows)),
    viewArticle: i.viewArticle,
    markRead: w.markRead,
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
