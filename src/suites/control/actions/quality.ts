import { addDays, TODAY } from '../../finance/engine';
import { notify } from '../../../platform/outbox';
import { nextApprover, RULE_ROLES } from '../../../platform/rules';
import { EMERGENCY_NOTIFY } from '../data2';
import { score } from '../engine';
import type { Audit, AuditProgramme, ChecklistItem, Complaint, Emergency, Finding, Kri, Opportunity, Permit, ProgrammeArea, Risk } from '../types';
import type { ActionKit, Result } from './kit';

const addMonths = (date: string, n: number) => {
  const d = new Date(date + 'T00:00:00');
  const x = new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export { addMonths };

/** Audit programme, audit planning and execution, risks, opportunities, complaints, emergencies and licences. */
export const qualityActions = (k: ActionKit) => {
  const { get, commit, fail, done, log, next, uid, actor, trail } = k;
  const isQhse = actor.role === 'QHSE';

  /* ---------------- Audit programme ---------------- */
  const saveProgramme = (p: Pick<AuditProgramme, 'year' | 'title' | 'objectives' | 'scope'> & { id?: string }): Result => {
    if (!isQhse) return fail('The audit programme is prepared by the QHSE Manager');
    if (!p.title.trim() || !p.objectives.trim() || !p.scope.trim()) return fail('Give the programme a title, objectives and scope');
    const s = get();
    if (p.id) {
      const cur = s.programmes.find((x) => x.id === p.id)!;
      if (cur.status === 'APPROVED') return fail('An approved programme cannot be changed — draft a new one');
      commit({ ...s, programmes: s.programmes.map((x) => (x.id === p.id ? { ...x, ...p, history: [...x.history, log('Programme edited')] } : x)) });
      return done('Programme saved', p.title, p.id);
    }
    if (s.programmes.some((x) => x.year === p.year && x.status === 'DRAFT')) return fail(`There is already a draft programme for ${p.year}`);
    const id = uid('pg');
    commit({ ...s, programmes: [{ ...p, id, areas: [], status: 'DRAFT', preparedBy: actor.name, history: [log('Programme drafted')] }, ...s.programmes] });
    trail('Quality', 'Audit programme drafted', p.title);
    return done('Programme drafted', 'Add the areas to audit, then send it for approval', id);
  };
  const saveProgrammeArea = (programmeId: string, a: Omit<ProgrammeArea, 'id' | 'nextDue'> & { id?: string; nextDue?: string }): Result => {
    if (!isQhse) return fail('The audit programme is prepared by the QHSE Manager');
    if (!a.area.trim() || !a.standard.trim() || !a.auditor.trim() || !a.auditee.trim()) return fail('Area, standard, auditor and auditee are all needed');
    if (a.auditor.trim() === a.auditee.trim()) return fail('Auditors cannot audit their own area');
    if (!(a.frequencyMonths >= 1 && a.frequencyMonths <= 36)) return fail('Frequency must be between 1 and 36 months');
    const s = get();
    const p = s.programmes.find((x) => x.id === programmeId)!;
    const nextDue = a.nextDue || (a.lastAudit ? addMonths(a.lastAudit, a.frequencyMonths) : addDays(TODAY, 30));
    const area: ProgrammeArea = { ...a, id: a.id ?? uid('pa'), nextDue };
    commit({ ...s, programmes: s.programmes.map((x) => (x.id === programmeId ? { ...x, areas: a.id ? x.areas.map((y) => (y.id === a.id ? area : y)) : [...x.areas, area], history: [...x.history, log(a.id ? `Area changed: ${a.area}` : `Area added: ${a.area}`)] } : x)) });
    return done('Programme updated', `${a.area} every ${a.frequencyMonths} months · next due ${nextDue}${p.status === 'APPROVED' ? '' : ''}`);
  };
  const approveProgramme = (id: string): Result => {
    const s = get();
    const p = s.programmes.find((x) => x.id === id)!;
    if (p.status === 'APPROVED') return fail('Already approved');
    if (actor.role !== 'SECRETARY') return fail('Management approves the programme — switch to Agnes Wairimu (Company Secretary)');
    if (p.preparedBy === actor.name) return fail('You prepared this programme, so someone else must approve it');
    if (!p.areas.length) return fail('Add at least one area to audit');
    commit({ ...s, programmes: s.programmes.map((x) => (x.id === id ? { ...x, status: 'APPROVED', approvedBy: actor.name, approvedAt: TODAY, history: [...x.history, log('Approved by management')] } : x)) });
    p.areas.forEach((a) => notify({ module: 'Quality', to: a.auditee, subject: `${a.area} will be audited against ${a.standard}`, body: `Next audit due ${a.nextDue}; auditor ${a.auditor}.`, ref: p.title }));
    trail('Quality', 'Audit programme approved', p.title);
    return done('Programme approved', `${p.areas.length} areas — auditees notified`);
  };
  /** Plans an audit for every programme area falling due within `days` that has no open audit. */
  const generateAudits = (programmeId: string, days = 60): Result => {
    if (!isQhse) return fail('Audits are planned by the QHSE Manager');
    let s = get();
    const p = s.programmes.find((x) => x.id === programmeId)!;
    if (p.status !== 'APPROVED') return fail('Approve the programme before planning audits from it');
    const horizon = addDays(TODAY, days);
    const due = p.areas.filter((a) => a.nextDue <= horizon && !s.audits.some((x) => x.programmeAreaId === a.id && x.status !== 'CLOSED'));
    if (!due.length) return fail(`No areas fall due in the next ${days} days without an audit already planned`);
    for (const a of due) {
      const { number, sequence } = next(s, 'AUD');
      const audit: Audit = { id: uid('au'), number, title: `${a.area} — ${a.standard}`, type: 'Internal', standard: a.standard, area: a.area, auditor: a.auditor, auditee: a.auditee, date: a.nextDue < TODAY ? addDays(TODAY, 7) : a.nextDue, status: 'PLANNED', findings: [], programmeAreaId: a.id, history: [log('Planned from the audit programme')] };
      s = { ...s, sequence, audits: [audit, ...s.audits] };
      notify({ module: 'Quality', to: a.auditor, subject: `Audit planned: ${audit.title}`, body: `Date ${audit.date}. Auditee ${a.auditee}.`, ref: number });
      notify({ module: 'Quality', to: a.auditee, subject: `Your area will be audited on ${audit.date}`, body: audit.title, ref: number });
    }
    commit(s);
    return done('Audits planned', `${due.length} audit${due.length === 1 ? '' : 's'} added; auditors and auditees notified`);
  };
  /** Reminders to auditors and auditees for planned audits in the next `days` days. */
  const remindAudits = (days = 14): Result => {
    const s = get();
    const soon = s.audits.filter((a) => a.status === 'PLANNED' && a.date >= TODAY && a.date <= addDays(TODAY, days));
    if (!soon.length) return fail(`No planned audits in the next ${days} days`);
    soon.forEach((a) => {
      notify({ module: 'Quality', to: a.auditor, subject: `Reminder: audit ${a.number} on ${a.date}`, body: a.title, ref: a.number });
      if (a.auditee) notify({ module: 'Quality', to: a.auditee, subject: `Reminder: your area is audited on ${a.date}`, body: a.title, ref: a.number });
    });
    return done('Reminders sent', `${soon.length} audit${soon.length === 1 ? '' : 's'}`);
  };

  /* ---------------- Planning and execution ---------------- */
  const planAudit = (a: Pick<Audit, 'title' | 'type' | 'standard' | 'area' | 'auditor' | 'auditee' | 'date' | 'scope'> & { team?: string[]; checklist?: ChecklistItem[] }): Result => {
    if (!isQhse) return fail('Audits are planned by the QHSE Manager');
    if (!a.title.trim() || !a.area.trim() || !a.auditor.trim()) return fail('Give the audit a title, area and lead auditor');
    if (!a.date || a.date < TODAY) return fail('Choose an audit date from today onwards');
    if (a.auditee && a.auditee.trim() === a.auditor.trim()) return fail('The auditee cannot be the lead auditor');
    const s = get();
    const { number, sequence } = next(s, 'AUD');
    const id = uid('au');
    commit({ ...s, sequence, audits: [{ ...a, id, number, status: 'PLANNED', findings: [], checklist: (a.checklist ?? []).filter((c) => c.question.trim()), history: [log('Planned')] }, ...s.audits] });
    notify({ module: 'Quality', to: a.auditor, subject: `Audit planned: ${a.title}`, body: `Date ${a.date}`, ref: number });
    if (a.auditee) notify({ module: 'Quality', to: a.auditee, subject: `Your area will be audited on ${a.date}`, body: `${a.title} — scope: ${a.scope ?? a.area}`, ref: number });
    trail('Quality', 'Audit planned', number);
    return done('Audit planned', `${number} on ${a.date}`, id);
  };
  const rescheduleAudit = (id: string, date: string, reason: string): Result => {
    if (!isQhse) return fail('Only the QHSE Manager reschedules audits');
    const s = get();
    const a = s.audits.find((x) => x.id === id)!;
    if (a.status !== 'PLANNED') return fail('Only planned audits can be moved');
    if (!date || date < TODAY) return fail('Choose a date from today onwards');
    if (!reason.trim()) return fail('Say why the audit is moving');
    commit({ ...s, audits: s.audits.map((x) => (x.id === id ? { ...x, date, history: [...(x.history ?? []), log(`Moved from ${a.date} to ${date}`, reason)] } : x)) });
    if (a.auditee) notify({ module: 'Quality', to: a.auditee, subject: `Audit ${a.number} moved to ${date}`, body: reason, ref: a.number });
    trail('Quality', 'Audit rescheduled', a.number, { field: 'date', before: a.date, after: date, note: reason });
    return done('Audit moved', `${a.number} now on ${date}`);
  };
  const startAudit = (id: string): Result => {
    const s = get();
    const a = s.audits.find((x) => x.id === id)!;
    if (a.status !== 'PLANNED') return fail('This audit has already started');
    if (!isQhse && actor.name !== a.auditor) return fail('The lead auditor or QHSE Manager starts the audit');
    commit({ ...s, audits: s.audits.map((x) => (x.id === id ? { ...x, status: 'IN_PROGRESS', history: [...(x.history ?? []), log('Audit started')] } : x)) });
    return done('Audit started', a.number);
  };
  const answerChecklist = (id: string, index: number, result: ChecklistItem['result']): Result => {
    const s = get();
    const a = s.audits.find((x) => x.id === id)!;
    if (a.status === 'CLOSED') return fail('The audit is closed');
    commit({ ...s, audits: s.audits.map((x) => (x.id === id ? { ...x, status: x.status === 'PLANNED' ? 'IN_PROGRESS' : x.status, checklist: (x.checklist ?? []).map((c, i) => (i === index ? { ...c, result } : c)) } : x)) });
    return { ok: true };
  };
  const addChecklistItem = (id: string, question: string, clause: string): Result => {
    if (!question.trim()) return fail('Write the checklist question');
    const s = get();
    if (s.audits.find((x) => x.id === id)!.status === 'CLOSED') return fail('The audit is closed');
    commit({ ...s, audits: s.audits.map((x) => (x.id === id ? { ...x, checklist: [...(x.checklist ?? []), { question, clause: clause || undefined }] } : x)) });
    return { ok: true };
  };
  const respondFinding = (auditId: string, findingId: string, response: string): Result => {
    if (!response.trim()) return fail('Write the auditee response');
    const s = get();
    commit({ ...s, audits: s.audits.map((a) => (a.id === auditId ? { ...a, findings: a.findings.map((f) => (f.id === findingId ? { ...f, auditeeResponse: response } : f)), history: [...(a.history ?? []), log('Auditee responded to a finding', response)] } : a)) });
    return done('Response recorded', 'Shown on the audit report');
  };

  /* ---------------- Corrective actions ---------------- */
  const extendCapa = (id: string, newDue: string, reason: string): Result => {
    const s = get();
    const c = s.capas.find((x) => x.id === id)!;
    if (c.status === 'CLOSED') return fail('The action is closed');
    if (!isQhse) return fail('Only the QHSE Manager can extend a corrective action');
    if (!newDue || newDue <= c.due) return fail('The new due date must be later than the current one');
    if (reason.trim().length < 5) return fail('Give the reason for the extension');
    if ((c.extensions?.length ?? 0) >= 2) return fail('This action has already been extended twice — escalate instead');
    const reviewDate = c.reviewDate && c.reviewDate < newDue ? addDays(newDue, 30) : c.reviewDate;
    commit({ ...s, capas: s.capas.map((x) => (x.id === id ? { ...x, due: newDue, reviewDate, originalDue: x.originalDue ?? x.due, extensions: [...(x.extensions ?? []), { from: x.due, to: newDue, reason, by: actor.name, at: k.now() }], history: [...x.history, log(`Due date extended ${x.due} → ${newDue}`, reason)] } : x)) });
    notify({ module: 'Quality', to: c.owner, subject: `${c.number} due date extended to ${newDue}`, body: reason, ref: c.number });
    trail('Quality', 'Corrective action extended', c.number, { field: 'due', before: c.due, after: newDue, note: reason });
    return done('Due date extended', `${c.number} now due ${newDue}`);
  };

  /* ---------------- Risks ---------------- */
  const addRisk = (r: Pick<Risk, 'title' | 'category' | 'owner' | 'likelihood' | 'impact' | 'residualLikelihood' | 'residualImpact' | 'controls' | 'treatment'> & { nextReview?: string }): Result => {
    if (!isQhse) return fail('Risks are added to the register by the QHSE Manager — others raise an emerging risk');
    if (!r.title.trim() || !r.owner.trim() || !r.controls.trim()) return fail('Title, owner and current controls are required');
    if ([r.likelihood, r.impact, r.residualLikelihood, r.residualImpact].some((x) => !(x >= 1 && x <= 5))) return fail('Scores must be 1 to 5');
    if (score(r.residualLikelihood, r.residualImpact) > score(r.likelihood, r.impact)) return fail('Residual risk cannot be higher than inherent risk');
    const s = get();
    const id = `rk${s.risks.length + 1}${uid('').slice(-3)}`;
    commit({ ...s, risks: [...s.risks, { ...r, id, nextReview: r.nextReview || addDays(TODAY, 90), status: 'ACTIVE', raisedBy: actor.name, kris: [], history: [log('Added to the register')] }] });
    trail('Quality', 'Risk added', r.title);
    return done('Risk added', r.title, id);
  };
  const updateRisk = (id: string, patch: Partial<Pick<Risk, 'title' | 'category' | 'owner' | 'controls' | 'treatment' | 'likelihood' | 'impact' | 'nextReview'>>): Result => {
    const s = get();
    const r = s.risks.find((x) => x.id === id)!;
    if (!isQhse && actor.name !== r.owner) return fail('Only the QHSE Manager or the risk owner can edit a risk');
    if (patch.title !== undefined && !patch.title.trim()) return fail('The risk needs a title');
    const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter((f) => String(patch[f]) !== String(r[f]));
    if (!changed.length) return fail('Nothing changed');
    commit({ ...s, risks: s.risks.map((x) => (x.id === id ? { ...x, ...patch, history: [...(x.history ?? []), log(`Edited: ${changed.join(', ')}`)] } : x)) });
    changed.forEach((f) => trail('Quality', 'Risk changed', r.title, { field: f, before: String(r[f] ?? ''), after: String(patch[f] ?? '') }));
    return done('Risk updated', r.title);
  };
  const closeRisk = (id: string, reason: string): Result => {
    if (!isQhse) return fail('Only the QHSE Manager can close a risk');
    if (!reason.trim()) return fail('Say why the risk no longer applies');
    const s = get();
    const r = s.risks.find((x) => x.id === id)!;
    commit({ ...s, risks: s.risks.map((x) => (x.id === id ? { ...x, status: 'CLOSED', history: [...(x.history ?? []), log('Closed', reason)] } : x)) });
    trail('Quality', 'Risk closed', r.title, { note: reason });
    return done('Risk closed', r.title);
  };
  const raiseEmergingRisk = (r: Pick<Risk, 'title' | 'category' | 'likelihood' | 'impact' | 'controls' | 'treatment'>): Result => {
    if (!r.title.trim() || r.title.trim().length < 6) return fail('Describe the emerging risk');
    const s = get();
    const id = `rk${s.risks.length + 1}${uid('').slice(-3)}`;
    commit({ ...s, risks: [...s.risks, { ...r, id, owner: actor.name, residualLikelihood: r.likelihood, residualImpact: r.impact, nextReview: TODAY, status: 'PROPOSED', raisedBy: actor.name, kris: [], approvals: [], history: [log('Emerging risk raised')] }] });
    const step = nextApprover('qa.risk.emerging', score(r.likelihood, r.impact), 0);
    notify({ module: 'Quality', to: RULE_ROLES[step.role] ?? step.role, subject: `Emerging risk to review: ${r.title}`, ref: id });
    return done('Emerging risk raised', `Waiting for ${RULE_ROLES[step.role] ?? step.role}`, id);
  };
  const reviewEmergingRisk = (id: string, approve: boolean, note: string, owner?: string): Result => {
    const s = get();
    const r = s.risks.find((x) => x.id === id)!;
    if (r.status !== 'PROPOSED') return fail('This risk has already been reviewed');
    const step = nextApprover('qa.risk.emerging', score(r.likelihood, r.impact), r.approvals?.length ?? 0);
    if (actor.role !== step.role) return fail(`The ${RULE_ROLES[step.role] ?? step.role} reviews this risk (Approval rules)`);
    if (r.raisedBy === actor.name) return fail('You raised this risk, so someone else must review it');
    if (r.approvals?.some((a) => a.by === actor.name)) return fail('You have already approved this risk');
    if (!approve && !note.trim()) return fail('Say why the risk is dropped');
    const approvals = approve ? [...(r.approvals ?? []), { by: actor.name, role: actor.role, at: TODAY }] : r.approvals;
    const final = !approve || step.last;
    const status = !approve ? 'DROPPED' : final ? 'ACTIVE' : 'PROPOSED';
    commit({ ...s, risks: s.risks.map((x) => (x.id === id ? { ...x, status, approvals, owner: approve && final && owner ? owner : x.owner, nextReview: approve && final ? addDays(TODAY, 90) : x.nextReview, history: [...(x.history ?? []), log(!approve ? 'Dropped' : final ? 'Approved onto the register' : `Approved (${approvals!.length} of ${step.steps.length})`, note || undefined)] } : x)) });
    trail('Quality', !approve ? 'Emerging risk dropped' : final ? 'Emerging risk approved' : 'Emerging risk first approval', r.title, { note: note || undefined });
    if (approve && !final) notify({ module: 'Quality', to: RULE_ROLES[step.steps[1]] ?? step.steps[1], subject: `Second approval needed: ${r.title}`, ref: id });
    return done(!approve ? 'Risk dropped' : final ? 'Added to the register' : 'First approval recorded', r.title);
  };
  const saveKri = (riskId: string, kri: Omit<Kri, 'id'> & { id?: string }): Result => {
    const s = get();
    const r = s.risks.find((x) => x.id === riskId)!;
    if (!isQhse && actor.name !== r.owner) return fail('Only the QHSE Manager or the risk owner sets indicators');
    if (!kri.name.trim()) return fail('Name the indicator');
    if (!(kri.warn >= 0) || !(kri.limit > kri.warn)) return fail('The red limit must be above the amber level');
    const full: Kri = { ...kri, id: kri.id ?? uid('k') };
    commit({ ...s, risks: s.risks.map((x) => (x.id === riskId ? { ...x, kris: kri.id ? (x.kris ?? []).map((y) => (y.id === kri.id ? full : y)) : [...(x.kris ?? []), full], history: [...(x.history ?? []), log(`Indicator ${kri.id ? 'changed' : 'added'}: ${kri.name}`, `amber ≥ ${kri.warn}, red ≥ ${kri.limit}`)] } : x)) });
    return done('Indicator saved', kri.name);
  };
  const removeKri = (riskId: string, kriId: string): Result => {
    const s = get();
    const r = s.risks.find((x) => x.id === riskId)!;
    if (!isQhse && actor.name !== r.owner) return fail('Only the QHSE Manager or the risk owner sets indicators');
    commit({ ...s, risks: s.risks.map((x) => (x.id === riskId ? { ...x, kris: (x.kris ?? []).filter((y) => y.id !== kriId), history: [...(x.history ?? []), log('Indicator removed')] } : x)) });
    return { ok: true };
  };

  /* ---------------- Improvement opportunities ---------------- */
  const raiseOpportunity = (o: Pick<Opportunity, 'title' | 'description' | 'source' | 'sourceRef' | 'benefit' | 'estValue'>, link?: { auditId: string; findingId: string }): Result => {
    if (!o.title.trim() || !o.description.trim()) return fail('Describe the opportunity');
    if (!(o.estValue >= 0)) return fail('The estimated benefit cannot be negative');
    const s = get();
    const { number, sequence } = next(s, 'OPP');
    const id = uid('op');
    commit({
      ...s,
      sequence,
      opportunities: [{ ...o, id, number, raisedBy: actor.name, status: 'SUBMITTED', approvals: [], history: [log('Submitted')] }, ...s.opportunities],
      audits: link ? s.audits.map((a) => (a.id === link.auditId ? { ...a, findings: a.findings.map((f) => (f.id === link.findingId ? { ...f, opportunityId: id } : f)) } : a)) : s.audits
    });
    const step = nextApprover('qa.opportunity', o.estValue, 0);
    notify({ module: 'Quality', to: RULE_ROLES[step.role] ?? step.role, subject: `Improvement opportunity to review: ${o.title}`, ref: number });
    return done('Opportunity submitted', number, id);
  };
  const decideOpportunity = (id: string, accept: boolean, note: string, owner: string): Result => {
    const s = get();
    const o = s.opportunities.find((x) => x.id === id)!;
    if (o.status !== 'SUBMITTED') return fail('Already decided');
    const step = nextApprover('qa.opportunity', o.estValue, o.approvals.length);
    if (actor.role !== step.role) return fail(`The ${RULE_ROLES[step.role] ?? step.role} decides this one (Approval rules)`);
    if (o.raisedBy === actor.name) return fail('You raised this opportunity, so someone else must decide it');
    if (!note.trim()) return fail('Record the decision note');
    if (accept && step.last && !owner.trim()) return fail('Choose who will implement it');
    const approvals = accept ? [...o.approvals, { by: actor.name, role: actor.role, at: TODAY }] : o.approvals;
    const final = !accept || step.last;
    commit({ ...s, opportunities: s.opportunities.map((x) => (x.id === id ? { ...x, approvals, status: !accept ? 'REJECTED' : final ? 'ACCEPTED' : 'SUBMITTED', owner: accept && final ? owner : x.owner, decision: final ? note : x.decision, history: [...x.history, log(!accept ? 'Rejected' : final ? 'Accepted' : `Approved (1 of ${step.steps.length})`, note)] } : x)) });
    notify({ module: 'Quality', to: o.raisedBy, subject: `${o.number} ${!accept ? 'rejected' : final ? 'accepted' : 'passed first review'}`, body: note, ref: o.number });
    trail('Quality', accept ? 'Opportunity approved' : 'Opportunity rejected', o.number, { note });
    return done(!accept ? 'Rejected' : final ? 'Accepted' : 'First approval recorded', o.number);
  };
  const implementOpportunity = (id: string, note: string): Result => {
    const s = get();
    const o = s.opportunities.find((x) => x.id === id)!;
    if (o.status !== 'ACCEPTED') return fail('Only accepted opportunities can be marked implemented');
    if (actor.name !== o.owner && !isQhse) return fail(`${o.owner} or the QHSE Manager confirms implementation`);
    if (!note.trim()) return fail('Describe what was done');
    commit({ ...s, opportunities: s.opportunities.map((x) => (x.id === id ? { ...x, status: 'IMPLEMENTED', history: [...x.history, log('Implemented', note)] } : x)) });
    return done('Implemented', o.number);
  };

  /* ---------------- Complaints ---------------- */
  const acknowledgeComplaint = (id: string): Result => {
    const s = get();
    const c = s.complaints.find((x) => x.id === id)!;
    if (c.acknowledgedAt) return fail('Already acknowledged');
    commit({ ...s, complaints: s.complaints.map((x) => (x.id === id ? { ...x, acknowledgedAt: TODAY, status: x.status === 'NEW' ? 'INVESTIGATING' : x.status, history: [...(x.history ?? []), log('Acknowledged to the customer')] } : x)) });
    notify({ module: 'Quality', to: `Customer (${c.number})`, channels: ['EMAIL'], subject: `We have received your complaint ${c.number}`, body: 'Our quality team is investigating and will reply within 5 working days.', ref: c.number });
    return done('Acknowledged', `${c.number} — customer emailed`);
  };
  const escalateComplaint = (id: string, level: number, reason: string, to: string): Result => {
    const s = get();
    const c = s.complaints.find((x) => x.id === id)!;
    if (c.status === 'RESOLVED') return fail('The complaint is resolved');
    if ((c.escalations ?? []).some((e) => e.level >= level)) return fail(`Already escalated to level ${level}`);
    commit({ ...s, complaints: s.complaints.map((x) => (x.id === id ? { ...x, escalations: [...(x.escalations ?? []), { level, reason, at: k.now(), by: actor.name, to }], history: [...(x.history ?? []), log(`Escalated to level ${level} — ${to}`, reason)] } : x)) });
    notify({ module: 'Quality', to, level: level >= 3 ? 'critical' : 'warning', subject: `Complaint ${c.number} escalated (level ${level})`, body: reason, ref: c.number });
    trail('Quality', 'Complaint escalated', c.number, { note: `Level ${level}: ${reason}` });
    return done('Escalated', `${c.number} → ${to}`);
  };
  const recordFeedback = (id: string, rating: number, comment: string): Result => {
    const s = get();
    const c = s.complaints.find((x) => x.id === id)!;
    if (c.status !== 'RESOLVED') return fail('Feedback is collected after the complaint is resolved');
    if (c.feedback) return fail('Feedback has already been recorded');
    if (!(rating >= 1 && rating <= 5)) return fail('Rate from 1 to 5');
    commit({ ...s, complaints: s.complaints.map((x) => (x.id === id ? { ...x, feedback: { rating, comment, at: TODAY }, history: [...(x.history ?? []), log(`Customer rated the resolution ${rating}/5`, comment || undefined)] } : x)) });
    if (rating <= 2) notify({ module: 'Quality', to: 'QHSE Manager', level: 'warning', subject: `Low satisfaction (${rating}/5) on ${c.number}`, body: comment, ref: c.number });
    return done('Feedback recorded', `${rating}/5`);
  };
  const submitPortalComplaint = (c: Pick<Complaint, 'customerId' | 'sku' | 'batch' | 'category' | 'description'>, contact: string): Result => {
    if (!c.customerId) return fail('Choose your company');
    if (c.description.trim().length < 10) return fail('Tell us what happened (at least 10 characters)');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) return fail('Enter an email address we can reply to');
    const s = get();
    const { number, sequence } = next(s, 'CMP');
    const id = uid('cm');
    const severity = /mould|mold|contamina|foreign|insect|glass|sick|ill/i.test(c.description) ? 'HIGH' : 'MEDIUM';
    commit({ ...s, sequence, complaints: [{ ...c, id, number, date: TODAY, status: 'NEW', severity, channel: 'Customer portal', history: [{ at: k.now(), by: contact, action: 'Submitted through the customer portal' }] }, ...s.complaints] });
    notify({ module: 'Quality', to: contact, address: contact, channels: ['EMAIL'], subject: `Complaint ${number} received`, body: 'Thank you. Our quality team will contact you within 2 working days.', ref: number });
    notify({ module: 'Quality', to: 'QHSE Manager', level: severity === 'HIGH' ? 'critical' : 'info', subject: `New portal complaint ${number}`, body: c.description, ref: number });
    return done('Complaint submitted', `Reference ${number} — a confirmation was emailed to ${contact}`, id);
  };

  /* ---------------- Emergencies ---------------- */
  const reportEmergency = (e: Pick<Emergency, 'cls' | 'type' | 'site' | 'description' | 'injuries'> & { firstAction?: string }): Result => {
    if (!e.site.trim() || e.description.trim().length < 10) return fail('Say where it is and what is happening');
    const s = get();
    const { number, sequence } = next(s, 'EMG');
    const id = uid('em');
    const notified = EMERGENCY_NOTIFY[e.cls];
    const em: Emergency = { cls: e.cls, type: e.type, site: e.site, description: e.description, injuries: e.injuries, id, number, reportedBy: actor.name, at: k.now(), status: 'ACTIVE', immediateActions: e.firstAction?.trim() ? [{ at: k.now(), by: actor.name, text: e.firstAction }] : [], affected: [], notified, history: [log(`Reported — class ${e.cls}`)] };
    commit({ ...s, sequence, emergencies: [em, ...s.emergencies] });
    notified.forEach((to) => notify({ module: 'Emergency', to, level: e.cls >= 2 ? 'critical' : 'warning', channels: e.cls >= 2 ? ['IN_APP', 'SMS', 'EMAIL'] : ['IN_APP', 'SMS'], subject: `CLASS ${e.cls} ${e.type.toUpperCase()} — ${e.site}`, body: e.description, ref: number }));
    trail('Emergency', 'Emergency reported', number, { note: `Class ${e.cls} ${e.type} at ${e.site}` });
    return done('Emergency reported', `${number} — ${notified.length} people alerted by SMS${e.cls >= 2 ? ' and email' : ''}`, id);
  };
  const addEmergencyAction = (id: string, text: string): Result => {
    if (!text.trim()) return fail('Describe the action taken');
    const s = get();
    const e = s.emergencies.find((x) => x.id === id)!;
    if (e.status === 'CLOSED') return fail('The emergency is closed');
    commit({ ...s, emergencies: s.emergencies.map((x) => (x.id === id ? { ...x, immediateActions: [...x.immediateActions, { at: k.now(), by: actor.name, text }] } : x)) });
    return done('Action logged', e.number);
  };
  const addAffected = (id: string, a: Emergency['affected'][number]): Result => {
    if (!a.ref.trim() || !(a.qty > 0)) return fail('Give the lot, invoice or batch and a quantity above zero');
    if (!(a.value >= 0)) return fail('Value cannot be negative');
    const s = get();
    const e = s.emergencies.find((x) => x.id === id)!;
    if (e.status === 'CLOSED') return fail('The emergency is closed');
    commit({ ...s, emergencies: s.emergencies.map((x) => (x.id === id ? { ...x, affected: [...x.affected, a], history: [...x.history, log(`Affected: ${a.qty} ${a.unit} ${a.grade} (${a.ref})`)] } : x)) });
    return done('Affected stock recorded', `${a.qty} ${a.unit} ${a.grade}`);
  };
  const containEmergency = (id: string): Result => {
    const s = get();
    const e = s.emergencies.find((x) => x.id === id)!;
    if (e.status !== 'ACTIVE') return fail('Only an active emergency can be contained');
    if (!e.immediateActions.length) return fail('Log the immediate actions taken first');
    commit({ ...s, emergencies: s.emergencies.map((x) => (x.id === id ? { ...x, status: 'CONTAINED', history: [...x.history, log('Contained')] } : x)) });
    e.notified.forEach((to) => notify({ module: 'Emergency', to, channels: ['IN_APP', 'SMS'], subject: `${e.number} contained`, ref: e.number }));
    return done('Contained', `${e.number} — everyone alerted has been told`);
  };
  const closeEmergency = (id: string, longTerm: string): Result => {
    const s = get();
    const e = s.emergencies.find((x) => x.id === id)!;
    if (!isQhse) return fail('The QHSE Manager closes emergencies');
    if (e.status === 'CLOSED') return fail('Already closed');
    if (e.status === 'ACTIVE') return fail('Contain the emergency before closing it');
    if (!longTerm.trim() && !e.longTerm) return fail('Record the long-term preventive action');
    if (e.cls >= 2 && !e.capaId) return fail('Class 2 and 3 emergencies need a corrective action raised before closing');
    commit({ ...s, emergencies: s.emergencies.map((x) => (x.id === id ? { ...x, status: 'CLOSED', longTerm: longTerm || x.longTerm, history: [...x.history, log('Closed', longTerm || undefined)] } : x)) });
    trail('Emergency', 'Emergency closed', e.number);
    return done('Emergency closed', e.number);
  };
  const linkEmergencyCapa = (id: string, capaId: string, longTerm: string) => {
    const s = get();
    commit({ ...s, emergencies: s.emergencies.map((x) => (x.id === id ? { ...x, capaId, longTerm, history: [...x.history, log('Long-term corrective action raised')] } : x)) });
  };

  /* ---------------- Licences and permits ---------------- */
  const canPermits = actor.role === 'SECRETARY' || isQhse;
  const savePermit = (p: Pick<Permit, 'name' | 'issuer' | 'number' | 'expiry' | 'site' | 'owner' | 'annualCost' | 'conditions'> & { id?: string }): Result => {
    if (!canPermits) return fail('Licences are maintained by the Company Secretary or the QHSE Manager');
    if (!p.name.trim() || !p.issuer.trim() || !p.number.trim()) return fail('Name, issuer and licence number are required');
    if (!p.expiry) return fail('Enter the expiry date');
    if ((p.annualCost ?? 0) < 0) return fail('Cost cannot be negative');
    const s = get();
    if (s.permits.some((x) => x.number.trim().toLowerCase() === p.number.trim().toLowerCase() && x.id !== p.id)) return fail('A licence with that number is already on the register');
    if (p.id) {
      const cur = s.permits.find((x) => x.id === p.id)!;
      commit({ ...s, permits: s.permits.map((x) => (x.id === p.id ? { ...x, ...p, history: [...(x.history ?? []), log('Details edited')] } : x)) });
      (['name', 'issuer', 'number', 'expiry', 'owner', 'annualCost', 'conditions'] as const).forEach((f) => {
        if (String(cur[f] ?? '') !== String(p[f] ?? '')) trail('Governance', 'Licence changed', cur.number, { field: f, before: String(cur[f] ?? ''), after: String(p[f] ?? '') });
      });
      return done('Licence updated', p.name, p.id);
    }
    const id = uid('pe');
    commit({ ...s, permits: [...s.permits, { ...p, id, history: [log('Added to the licence register')] }] });
    trail('Governance', 'Licence added', p.number);
    return done('Licence added', p.name, id);
  };
  const retirePermit = (id: string, reason: string): Result => {
    if (!canPermits) return fail('Licences are maintained by the Company Secretary or the QHSE Manager');
    if (!reason.trim()) return fail('Say why the licence is no longer needed');
    const s = get();
    const p = s.permits.find((x) => x.id === id)!;
    commit({ ...s, permits: s.permits.map((x) => (x.id === id ? { ...x, retired: true, history: [...(x.history ?? []), log('Retired', reason)] } : x)) });
    trail('Governance', 'Licence retired', p.number, { note: reason });
    return done('Licence retired', p.name);
  };
  /** Sends the 60/30/7-day expiry reminders not yet sent. */
  const sendPermitReminders = (): Result => {
    const s = get();
    let sent = 0;
    const permits = s.permits.map((p) => {
      if (p.retired) return p;
      const left = Math.round((new Date(p.expiry).getTime() - new Date(TODAY).getTime()) / 86_400_000);
      const due = [60, 30, 7].filter((d) => left <= d && !(p.remindersSent ?? []).includes(d));
      if (!due.length) return p;
      sent++;
      notify({ module: 'Governance', to: p.owner ?? 'Company Secretary', level: left <= 7 ? 'critical' : 'warning', subject: `${p.name} ${left < 0 ? `expired ${-left} days ago` : `expires in ${left} days`}`, body: `${p.issuer} · ${p.number}`, ref: p.number });
      return { ...p, remindersSent: [...(p.remindersSent ?? []), ...due], history: [...(p.history ?? []), log(`Expiry reminder sent (${due.join('/')} days)`)] };
    });
    if (!sent) return fail('No reminders due — every licence has had its 60, 30 and 7-day notices');
    commit({ ...s, permits });
    return done('Reminders sent', `${sent} licence owner${sent === 1 ? '' : 's'} notified`);
  };

  return {
    saveProgramme,
    saveProgrammeArea,
    approveProgramme,
    generateAudits,
    remindAudits,
    planAudit,
    rescheduleAudit,
    startAudit,
    answerChecklist,
    addChecklistItem,
    respondFinding,
    extendCapa,
    addRisk,
    updateRisk,
    closeRisk,
    raiseEmergingRisk,
    reviewEmergingRisk,
    saveKri,
    removeKri,
    raiseOpportunity,
    decideOpportunity,
    implementOpportunity,
    acknowledgeComplaint,
    escalateComplaint,
    recordFeedback,
    submitPortalComplaint,
    reportEmergency,
    addEmergencyAction,
    addAffected,
    containEmergency,
    closeEmergency,
    linkEmergencyCapa,
    savePermit,
    retirePermit,
    sendPermitReminders
  };
};

export type FindingInput = Omit<Finding, 'id'>;
