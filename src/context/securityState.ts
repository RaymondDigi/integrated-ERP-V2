import { useState } from 'react';
import type { HREmployee } from '../types';
import { useSession } from '../auth/session';
import { canApprove } from '../platform/access';
import { audit } from '../platform/audit';
import { notify } from '../platform/outbox';
import type { HistoryEntry } from '../data/hcmConfig';
import { addDaysIso, fmt, kes, todayIso } from '../data/hcmEngine';
import {
  CLAIM_DOCUMENTS,
  INITIAL_ALARMS,
  INITIAL_CLAIMS,
  INITIAL_GATE_PASSES,
  INITIAL_GRIEVANCES,
  INITIAL_INVESTIGATIONS,
  INITIAL_OCCURRENCES,
  INITIAL_PATROLS,
  INITIAL_ROSTER,
  INITIAL_SEC_REQS,
  INITIAL_TRANSIT,
  INITIAL_VISITORS,
  PATROL_ROUTES,
  POLICY_INSURER,
  RESPONSE_DAYS,
  SIMULATED_EVENTS,
  type AlarmEvent,
  type GatePass,
  type Grievance,
  type GuardShift,
  type InsuranceClaim,
  type InsurancePolicy,
  type OccurrenceEntry,
  type PatrolLog,
  type SecurityInvestigation,
  type SecurityRequisition,
  type TransitCheckpoint,
  type TransitRecord,
  type VisitorEntry
} from '../data/securityConfig';

type Toast = (t: { type: 'success' | 'error' | 'info' | 'warning'; title: string; message: string }) => void;

/** Security operations, investigations, insurance claims, alarms and the grievance / whistleblowing channels. */
export interface SecurityStateSlice {
  securityRequisitions: SecurityRequisition[];
  requestSecurity: (r: Omit<SecurityRequisition, 'id' | 'orgId' | 'status' | 'requestedBy' | 'history'>) => SecurityRequisition | null;
  decideSecurity: (id: string, approve: boolean, note?: string) => boolean;
  assignSecurity: (id: string, names: string[]) => boolean;
  completeSecurity: (id: string) => boolean;

  transitRecords: TransitRecord[];
  dispatchTransit: (t: Omit<TransitRecord, 'id' | 'orgId' | 'status' | 'checkpoints' | 'departedAt'>) => TransitRecord | null;
  logCheckpoint: (id: string, cp: Omit<TransitCheckpoint, 'at'>) => boolean;
  recordArrival: (id: string, sealNo: string, packagesReceived: number) => boolean;

  occurrences: OccurrenceEntry[];
  addOccurrence: (o: Omit<OccurrenceEntry, 'id' | 'orgId' | 'at' | 'by'>) => boolean;
  visitors: VisitorEntry[];
  signInVisitor: (v: Omit<VisitorEntry, 'id' | 'orgId' | 'inAt' | 'outAt'>) => boolean;
  signOutVisitor: (id: string) => boolean;
  guardRoster: GuardShift[];
  addShift: (s: Omit<GuardShift, 'id' | 'orgId'>) => boolean;
  patrols: PatrolLog[];
  startPatrol: (guard: string, route: string) => boolean;
  checkPatrolPoint: (id: string, name: string, note?: string) => boolean;
  endPatrol: (id: string) => boolean;

  investigations: SecurityInvestigation[];
  openInvestigation: (i: Omit<SecurityInvestigation, 'id' | 'orgId' | 'status' | 'evidence' | 'interviews' | 'history'> & { evidence?: string[] }) => SecurityInvestigation | null;
  addEvidence: (id: string, text: string) => boolean;
  addInterview: (id: string, person: string, summary: string) => boolean;
  recordFindings: (id: string, findings: string, recommendation: NonNullable<SecurityInvestigation['recommendation']>, valueKes?: number) => boolean;
  closeInvestigation: (id: string) => boolean;

  gatePasses: GatePass[];
  recordGatePass: (g: Omit<GatePass, 'id' | 'orgId' | 'at' | 'status' | 'guard'>) => GatePass | null;
  releaseGatePass: (id: string, note: string) => boolean;

  insuranceClaims: InsuranceClaim[];
  raiseInsuranceClaim: (c: { policy: InsurancePolicy; incidentRef: string; description: string; lossDate: string; amountClaimedKes: number; excessKes: number }) => InsuranceClaim | null;
  lodgeClaimDocument: (id: string, doc: string) => boolean;
  assessClaim: (id: string) => boolean;
  settleClaim: (id: string, amount: number) => boolean;
  rejectClaim: (id: string, reason: string) => boolean;

  alarms: AlarmEvent[];
  simulateAlarm: () => AlarmEvent;
  acknowledgeAlarm: (id: string) => boolean;
  closeAlarm: (id: string, note: string) => boolean;

  /** Grievances and stakeholder complaints; whistleblowing cases only for designated officers */
  grievances: Grievance[];
  whistleblowingCount: number;
  canSeeWhistleblowing: boolean;
  raiseGrievance: (g: { channel: 'STAFF' | 'STAKEHOLDER'; category: Grievance['category']; subject: string; details: string; staffId?: string; complainant?: string; contact?: string; against?: string; confidential: boolean }) => Grievance | null;
  reportWhistleblowing: (r: { category: Grievance['category']; subject: string; details: string; against?: string }) => string | null;
  followUpWhistleblowing: (code: string, text: string) => boolean;
  lookupWhistleblowing: (code: string) => { status: Grievance['status']; responseDue: string; messages: Grievance['messages'] } | null;
  assignGrievance: (id: string, investigator: string) => boolean;
  scheduleGrievanceHearing: (id: string, date: string) => boolean;
  replyGrievance: (id: string, text: string) => boolean;
  resolveGrievance: (id: string, resolution: string) => boolean;
  appealGrievance: (id: string, reason: string) => boolean;
  closeGrievance: (id: string) => boolean;
}

interface Deps {
  hrEmployees: HREmployee[];
  selectedOrgId: string;
  raiseCase: (d: { staffId: string; category: 'MISCONDUCT' | 'GROSS_MISCONDUCT'; summary: string; incidentDate: string }) => { id: string };
  addToast: Toast;
}

const nextId = (ids: string[], prefix: string, width = 4) => {
  const n = Math.max(0, ...ids.filter((x) => x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length)) || 0)) + 1;
  return `${prefix}${String(n).padStart(width, '0')}`;
};
const nowStamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const code = () => `WB-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

export const useSecurityState = (d: Deps): SecurityStateSlice => {
  const session = useSession();
  const actor = session?.name ?? 'Security office';
  const approver = canApprove(session?.role);
  // Whistleblowing reports are restricted to the administrator and directors / audit / HR leadership
  const canSeeWhistleblowing = session?.role === 'admin' || (approver && /director|audit|hr manager/i.test(session?.title ?? ''));
  const today = todayIso();
  const year = today.slice(0, 4);
  const nameOf = (id?: string) => d.hrEmployees.find((e) => e.staffId === id)?.fullName ?? id ?? '—';
  const fail = (title: string, message: string) => {
    d.addToast({ type: 'error', title, message });
    return false;
  };
  const done = (title: string, message: string, type: 'success' | 'info' | 'warning' = 'success') => {
    d.addToast({ type, title, message });
    return true;
  };
  const hist = (action: string, note?: string): HistoryEntry => ({ at: today, by: actor, action, note });

  /* ---------------------------------------------------------------- occurrence book (append-only) */

  const [occurrences, setOb] = useState<OccurrenceEntry[]>(INITIAL_OCCURRENCES);
  const logOb = (o: Omit<OccurrenceEntry, 'id' | 'orgId' | 'at' | 'by'>, by = actor) =>
    setOb((xs) => [{ ...o, id: nextId(xs.map((x) => x.id), 'OB-'), orgId: d.selectedOrgId, at: nowStamp(), by }, ...xs]);
  const addOccurrence: SecurityStateSlice['addOccurrence'] = (o) => {
    if (!o.post.trim() || o.entry.trim().length < 10) return fail('Entry too short', 'Record the post and what happened (at least 10 characters).');
    logOb({ ...o, post: o.post.trim(), entry: o.entry.trim() });
    return done('Occurrence book entry made', `${o.category} at ${o.post}. Entries cannot be edited — add a follow-up entry to correct one.`);
  };

  /* ---------------------------------------------------------------- requisitions and escorts */

  const [securityRequisitions, setReqs] = useState<SecurityRequisition[]>(INITIAL_SEC_REQS);
  const patchReq = (id: string, f: (r: SecurityRequisition) => SecurityRequisition) => setReqs((xs) => xs.map((x) => (x.id === id ? f(x) : x)));
  const requestSecurity: SecurityStateSlice['requestSecurity'] = (r) => {
    if (!r.purpose.trim() || !r.location.trim() || !r.date) {
      fail('Requisition incomplete', 'Purpose, location / route and date are needed.');
      return null;
    }
    if (r.date < today) {
      fail('Date passed', 'Request security for today or later.');
      return null;
    }
    if (!(r.guards >= 1 && r.guards <= 20)) {
      fail('Guards', 'Request between 1 and 20 guards.');
      return null;
    }
    if (r.type !== 'GUARD' && !r.cargoRef?.trim()) {
      fail('Cargo reference', 'Escorts and cash-in-transit need the lot, invoice or transfer reference.');
      return null;
    }
    const created: SecurityRequisition = { ...r, purpose: r.purpose.trim(), id: nextId(securityRequisitions.map((x) => x.id), 'SRQ-'), orgId: d.selectedOrgId, status: 'REQUESTED', requestedBy: actor, history: [hist('Requested')] };
    setReqs((xs) => [created, ...xs]);
    notify({ module: 'Security', to: 'Security manager', subject: `${created.id}: ${r.type.replace(/_/g, ' ').toLowerCase()} on ${fmt(r.date)}`, ref: created.id });
    done('Security requested', `${created.id} goes to the security manager.`);
    return created;
  };
  const decideSecurity = (id: string, approve: boolean, note?: string) => {
    const r = securityRequisitions.find((x) => x.id === id);
    if (!r || r.status !== 'REQUESTED') return false;
    if (!approver) return fail('Manager approval', 'Security requisitions are approved by a manager.');
    if (r.requestedBy === actor) return fail('Segregation of duties', 'You raised this requisition.');
    if (!approve && !note?.trim()) return fail('Reason needed', 'Say why the requisition is rejected.');
    patchReq(id, (x) => ({ ...x, status: approve ? 'APPROVED' : 'REJECTED', approvedBy: actor, history: [...x.history, hist(approve ? 'Approved' : 'Rejected', note?.trim())] }));
    return done(approve ? 'Requisition approved' : 'Requisition rejected', approve ? 'Assign the guards or escort team next.' : note!.trim(), approve ? 'success' : 'info');
  };
  const assignSecurity = (id: string, names: string[]) => {
    const r = securityRequisitions.find((x) => x.id === id);
    const list = names.map((n) => n.trim()).filter(Boolean);
    if (!r || r.status !== 'APPROVED') return fail('Not approved', 'Assign guards after approval.');
    if (list.length < r.guards) return fail('Not enough guards', `${r.guards} needed; ${list.length} named.`);
    patchReq(id, (x) => ({ ...x, status: 'ASSIGNED', assigned: list, history: [...x.history, hist('Assigned', list.join(', '))] }));
    logOb({ post: 'Control room', category: 'Routine', entry: `${id}: ${list.join(', ')} assigned — ${r.purpose}` });
    return done('Guards assigned', `${list.join(', ')} for ${fmt(r.date)}.`);
  };
  const completeSecurity = (id: string) => {
    const r = securityRequisitions.find((x) => x.id === id);
    if (!r || r.status !== 'ASSIGNED') return false;
    const open = transitRecords.find((t) => t.requisitionId === id && t.status === 'IN_TRANSIT');
    if (open) return fail('Consignment still moving', `${open.id} has not arrived yet.`);
    patchReq(id, (x) => ({ ...x, status: 'COMPLETED', history: [...x.history, hist('Completed')] }));
    return done('Requisition completed', id);
  };

  /* ---------------------------------------------------------------- cargo in transit */

  const [transitRecords, setTransit] = useState<TransitRecord[]>(INITIAL_TRANSIT);
  const dispatchTransit: SecurityStateSlice['dispatchTransit'] = (t) => {
    const errs: string[] = [];
    if (!t.cargo.trim() || !t.cargoRef.trim()) errs.push('Describe the cargo and give the lot / invoice / transfer reference.');
    if (!t.vehicle.trim() || !t.driver.trim() || !t.escort.trim()) errs.push('Vehicle, driver and escort are needed.');
    if (!/^[A-Z0-9-]{5,}$/i.test(t.sealNo.trim())) errs.push('Record the seal number fitted at loading.');
    if (!(t.packagesSent > 0)) errs.push('Enter the number of packages loaded.');
    if (transitRecords.some((x) => x.sealNo === t.sealNo.trim() && x.status === 'IN_TRANSIT')) errs.push(`Seal ${t.sealNo} is already on a consignment in transit.`);
    if (t.requisitionId) {
      const r = securityRequisitions.find((x) => x.id === t.requisitionId);
      if (!r || r.status !== 'ASSIGNED') errs.push(`${t.requisitionId} must be approved and the escort assigned before dispatch.`);
    }
    if (errs.length) {
      fail('Consignment not dispatched', errs.join(' '));
      return null;
    }
    const created: TransitRecord = { ...t, sealNo: t.sealNo.trim(), id: nextId(transitRecords.map((x) => x.id), 'TRN-'), orgId: d.selectedOrgId, departedAt: nowStamp(), checkpoints: [], status: 'IN_TRANSIT' };
    setTransit((xs) => [created, ...xs]);
    logOb({ post: 'Factory gate', category: 'Routine', entry: `${created.id} dispatched: ${t.cargo} (${t.cargoRef}) on ${t.vehicle}, seal ${created.sealNo}, escort ${t.escort}` });
    done('Consignment dispatched', `${created.id}: seal ${created.sealNo}, ${t.packagesSent} packages to ${t.destination}.`);
    return created;
  };
  const logCheckpoint = (id: string, cp: Omit<TransitCheckpoint, 'at'>) => {
    const t = transitRecords.find((x) => x.id === id);
    if (!t || t.status !== 'IN_TRANSIT') return fail('Not in transit', 'Checkpoints are logged while the consignment is moving.');
    if (!cp.place.trim()) return fail('Place needed', 'Where is the consignment?');
    setTransit((xs) => xs.map((x) => (x.id === id ? { ...x, checkpoints: [...x.checkpoints, { ...cp, place: cp.place.trim(), at: nowStamp() }] } : x)));
    if (!cp.sealIntact) {
      notify({ module: 'Security', to: 'Security manager', subject: `Seal broken on ${id} at ${cp.place}`, level: 'critical', ref: id, channels: ['IN_APP', 'SMS'] });
      return done('Seal not intact', `Security manager alerted by SMS (simulated). ${id} will be inspected on arrival.`, 'warning');
    }
    return done('Checkpoint logged', `${id} at ${cp.place}, seal intact.`);
  };

  /* ---------------------------------------------------------------- investigations */

  const [investigations, setInv] = useState<SecurityInvestigation[]>(INITIAL_INVESTIGATIONS);
  const patchInv = (id: string, f: (i: SecurityInvestigation) => SecurityInvestigation) => setInv((xs) => xs.map((x) => (x.id === id ? f(x) : x)));
  const createInvestigation = (i: Omit<SecurityInvestigation, 'id' | 'orgId' | 'status' | 'evidence' | 'interviews' | 'history'> & { evidence?: string[] }, list: SecurityInvestigation[]) => {
    const created: SecurityInvestigation = { ...i, evidence: i.evidence ?? [], interviews: [], id: nextId(list.map((x) => x.id), `SI-${year}-`, 3), orgId: d.selectedOrgId, status: 'OPEN', history: [hist('Opened')] };
    setInv((xs) => [created, ...xs]);
    return created;
  };
  const recordArrival = (id: string, sealNo: string, packagesReceived: number) => {
    const t = transitRecords.find((x) => x.id === id);
    if (!t || t.status !== 'IN_TRANSIT') return false;
    if (!sealNo.trim() || !(packagesReceived >= 0)) return fail('Arrival check', 'Record the seal number found and the packages counted.');
    const problems = [sealNo.trim() !== t.sealNo ? `seal ${sealNo.trim()} found, ${t.sealNo} fitted` : '', packagesReceived !== t.packagesSent ? `${packagesReceived} of ${t.packagesSent} packages received` : '', t.checkpoints.some((c) => !c.sealIntact) ? 'seal reported broken en route' : '']
      .filter(Boolean)
      .join('; ');
    let invId: string | undefined;
    if (problems) {
      invId = createInvestigation(
        { subject: `Loss in transit — ${t.cargo}`, category: 'Loss in transit', allegation: `${t.id} (${t.cargoRef}): ${problems}.`, sourceRef: t.id, investigator: 'Security manager', evidence: [`Transit record ${t.id}`, `Seal record ${t.sealNo}`] },
        investigations
      ).id;
      notify({ module: 'Security', to: 'Security manager', subject: `Discrepancy on arrival: ${t.id} — ${problems}`, level: 'critical', ref: invId });
    }
    setTransit((xs) => xs.map((x) => (x.id === id ? { ...x, arrivedAt: nowStamp(), arrivalSealNo: sealNo.trim(), packagesReceived, status: problems ? 'DISCREPANCY' : 'ARRIVED', discrepancy: problems || undefined, investigationId: invId } : x)));
    return problems ? done('Discrepancy recorded', `${problems}. Investigation ${invId} opened.`, 'warning') : done('Arrived intact', `${t.id}: seal ${t.sealNo} intact, ${packagesReceived} packages.`);
  };
  const openInvestigation: SecurityStateSlice['openInvestigation'] = (i) => {
    if (!i.subject.trim() || i.allegation.trim().length < 10 || !i.investigator.trim()) {
      fail('Investigation not opened', 'Subject, the allegation (10+ characters) and an investigator are needed.');
      return null;
    }
    if (i.subjectStaffId && nameOf(i.subjectStaffId) === i.investigator) {
      fail('Conflict of interest', 'The person under investigation cannot investigate.');
      return null;
    }
    const c = createInvestigation({ ...i, subject: i.subject.trim(), allegation: i.allegation.trim() }, investigations);
    done('Investigation opened', `${c.id} assigned to ${i.investigator}.`);
    return c;
  };
  const addEvidence = (id: string, text: string) => {
    const i = investigations.find((x) => x.id === id);
    if (!i || i.status === 'CLOSED' || !text.trim()) return false;
    patchInv(id, (x) => ({ ...x, evidence: [...x.evidence, text.trim()], history: [...x.history, hist('Evidence added', text.trim())] }));
    return done('Evidence logged', text.trim());
  };
  const addInterview = (id: string, person: string, summary: string) => {
    const i = investigations.find((x) => x.id === id);
    if (!i || i.status === 'CLOSED') return false;
    if (!person.trim() || !summary.trim()) return fail('Interview', 'Who was interviewed and what they said.');
    patchInv(id, (x) => ({ ...x, interviews: [...x.interviews, { person: person.trim(), summary: summary.trim(), on: today }] }));
    return done('Interview recorded', person.trim());
  };
  const recordFindings: SecurityStateSlice['recordFindings'] = (id, findings, recommendation, valueKes) => {
    const i = investigations.find((x) => x.id === id);
    if (!i || i.status !== 'OPEN') return false;
    if (!i.evidence.length) return fail('No evidence', 'Log the evidence before recording findings.');
    if (findings.trim().length < 15) return fail('Findings', 'Describe the findings (15+ characters).');
    if (recommendation === 'DISCIPLINARY' && !i.subjectStaffId) return fail('Who is it about?', 'A disciplinary recommendation needs the employee under investigation.');
    if (recommendation === 'INSURANCE_CLAIM' && !(valueKes && valueKes > 0)) return fail('Value of loss', 'Enter the value lost for the insurance claim.');
    patchInv(id, (x) => ({ ...x, findings: findings.trim(), recommendation, valueKes: valueKes ?? x.valueKes, status: 'FINDINGS', history: [...x.history, hist('Findings recorded', recommendation.replace('_', ' ').toLowerCase())] }));
    return done('Findings recorded', 'A manager closes the case and actions the recommendation.');
  };

  /* ---------------------------------------------------------------- insurance claims */

  const [insuranceClaims, setClaims] = useState<InsuranceClaim[]>(INITIAL_CLAIMS);
  const patchClaim = (id: string, f: (c: InsuranceClaim) => InsuranceClaim) => setClaims((xs) => xs.map((x) => (x.id === id ? f(x) : x)));
  const createClaim = (c: Parameters<SecurityStateSlice['raiseInsuranceClaim']>[0]) => {
    const created: InsuranceClaim = { ...c, id: nextId(insuranceClaims.map((x) => x.id), `ICL-${year}-`, 3), orgId: d.selectedOrgId, insurer: POLICY_INSURER[c.policy], documents: [], status: 'NOTIFIED', raisedBy: actor, history: [hist('Insurer notified')] };
    setClaims((xs) => [created, ...xs]);
    notify({ module: 'Insurance', to: created.insurer, subject: `Notification of loss — ${created.id}: ${c.description.slice(0, 60)}`, ref: created.id, channels: ['EMAIL'] });
    return created;
  };
  const raiseInsuranceClaim: SecurityStateSlice['raiseInsuranceClaim'] = (c) => {
    const errs: string[] = [];
    if (!c.incidentRef.trim() || c.description.trim().length < 10) errs.push('Incident reference and a description are needed.');
    if (!c.lossDate || c.lossDate > today) errs.push('The loss date cannot be in the future.');
    else if (c.lossDate < addDaysIso(today, -180)) errs.push('Losses must be notified within 180 days.');
    if (!(c.amountClaimedKes > 0) || c.excessKes < 0 || c.excessKes >= c.amountClaimedKes) errs.push('The amount claimed must be above zero and above the excess.');
    if (errs.length) {
      fail('Claim not raised', errs.join(' '));
      return null;
    }
    const created = createClaim({ ...c, incidentRef: c.incidentRef.trim(), description: c.description.trim() });
    done('Insurer notified', `${created.id} with ${created.insurer}. Lodge: ${CLAIM_DOCUMENTS[c.policy].join(', ')}.`);
    return created;
  };
  const lodgeClaimDocument = (id: string, doc: string) => {
    const c = insuranceClaims.find((x) => x.id === id);
    if (!c || !['NOTIFIED', 'DOCUMENTED'].includes(c.status)) return false;
    if (c.documents.includes(doc)) return fail('Already lodged', doc);
    const docs = [...c.documents, doc];
    const complete = CLAIM_DOCUMENTS[c.policy].every((x) => docs.includes(x));
    patchClaim(id, (x) => ({ ...x, documents: docs, status: complete ? 'DOCUMENTED' : x.status, history: [...x.history, hist('Document lodged', doc)] }));
    return done('Document lodged', complete ? 'All documents in — the insurer can assess.' : doc);
  };
  const assessClaim = (id: string) => {
    const c = insuranceClaims.find((x) => x.id === id);
    if (!c) return false;
    const missing = CLAIM_DOCUMENTS[c.policy].filter((x) => !c.documents.includes(x));
    if (c.status !== 'DOCUMENTED' || missing.length) return fail('Documents missing', missing.length ? missing.join(', ') : 'Lodge the documents first.');
    patchClaim(id, (x) => ({ ...x, status: 'ASSESSED', history: [...x.history, hist('Assessed by the insurer')] }));
    return done('Claim assessed', `${c.insurer} has assessed ${id}.`);
  };
  const settleClaim = (id: string, amount: number) => {
    const c = insuranceClaims.find((x) => x.id === id);
    if (!c || c.status !== 'ASSESSED') return fail('Not assessed', 'Claims settle after assessment.');
    if (!approver) return fail('Manager approval', 'A manager accepts the settlement.');
    if (c.raisedBy === actor) return fail('Segregation of duties', 'The person who raised the claim cannot accept the settlement.');
    const max = c.amountClaimedKes - c.excessKes;
    if (!(amount > 0) || amount > max) return fail('Check the amount', `Settlement is at most the claim less the excess (${kes(max)}).`);
    patchClaim(id, (x) => ({ ...x, status: 'SETTLED', amountSettledKes: amount, history: [...x.history, hist('Settled', kes(amount))] }));
    audit({ module: 'Insurance', by: actor, ref: id, action: 'Claim settled', after: kes(amount) });
    return done('Claim settled', `${kes(amount)} of ${kes(c.amountClaimedKes)} (excess ${kes(c.excessKes)}).`);
  };
  const rejectClaim = (id: string, reason: string) => {
    const c = insuranceClaims.find((x) => x.id === id);
    if (!c || ['SETTLED', 'REJECTED'].includes(c.status)) return false;
    if (!reason.trim()) return fail('Reason', 'Record the insurer’s reason.');
    patchClaim(id, (x) => ({ ...x, status: 'REJECTED', history: [...x.history, hist('Rejected by the insurer', reason.trim())] }));
    return done('Claim rejected', reason.trim(), 'info');
  };

  const closeInvestigation = (id: string) => {
    const i = investigations.find((x) => x.id === id);
    if (!i || i.status !== 'FINDINGS') return fail('Findings needed', 'Record the findings first.');
    if (!approver) return fail('Manager closes', 'A manager closes investigations.');
    if (i.investigator === actor) return fail('Segregation of duties', 'The investigator’s findings are reviewed and closed by another manager.');
    let outcomeRef: string | undefined;
    if (i.recommendation === 'DISCIPLINARY' && i.subjectStaffId) {
      outcomeRef = d.raiseCase({ staffId: i.subjectStaffId, category: 'GROSS_MISCONDUCT', summary: `${i.subject} — security investigation ${i.id}: ${i.findings}`, incidentDate: i.history[0]?.at ?? today }).id;
    }
    if (i.recommendation === 'INSURANCE_CLAIM') {
      outcomeRef = createClaim({ policy: i.category === 'Loss in transit' ? 'GOODS_IN_TRANSIT' : 'FIDELITY', incidentRef: i.id, description: `${i.subject}: ${i.findings}`, lossDate: i.history[0]?.at ?? today, amountClaimedKes: i.valueKes ?? 0, excessKes: Math.round((i.valueKes ?? 0) * 0.1) }).id;
    }
    patchInv(id, (x) => ({ ...x, status: 'CLOSED', outcomeRef, history: [...x.history, hist('Closed', outcomeRef)] }));
    return done('Investigation closed', outcomeRef ? `Follow-up ${outcomeRef} raised (${i.recommendation === 'DISCIPLINARY' ? 'Disciplinary' : 'insurance claim'}).` : 'No further action.');
  };

  /* ---------------------------------------------------------------- gate, visitors, roster, patrols */

  const [gatePasses, setGate] = useState<GatePass[]>(INITIAL_GATE_PASSES);
  const recordGatePass: SecurityStateSlice['recordGatePass'] = (g) => {
    const items = g.items.filter((i) => i.description.trim());
    if (!g.vehicle.trim() || !g.driver.trim()) {
      fail('Gate pass', 'Vehicle and driver are needed.');
      return null;
    }
    if (!g.docRef.trim()) {
      fail('Document needed', g.direction === 'OUT' ? 'Goods leave only against an approved delivery note, transfer or gate pass number.' : 'Record the PO, delivery note or GRN the goods came on.');
      return null;
    }
    if (!items.length || items.some((i) => i.qtyDoc < 0 || i.qtyFound < 0)) {
      fail('Items', 'List the items with the document and counted quantities.');
      return null;
    }
    const diff = items.filter((i) => i.qtyDoc !== i.qtyFound);
    const created: GatePass = { ...g, items, id: nextId(gatePasses.map((x) => x.id), 'GP-'), orgId: d.selectedOrgId, at: nowStamp(), guard: actor, status: diff.length ? 'HELD' : 'CLEARED', note: diff.length ? `Count differs from ${g.docRef}: ${diff.map((i) => `${i.description} ${i.qtyFound}/${i.qtyDoc}`).join('; ')}` : g.note };
    setGate((xs) => [created, ...xs]);
    logOb({ post: 'Main gate', category: diff.length ? 'Incident' : 'Routine', entry: `${created.id} ${g.direction === 'IN' ? 'incoming' : 'outgoing'} ${g.vehicle} (${g.docRef}) — ${created.status === 'HELD' ? created.note : 'cleared'}` });
    if (diff.length) notify({ module: 'Security', to: 'Stores and security manager', subject: `Vehicle ${g.vehicle} held at the gate: ${created.note}`, level: 'warning', ref: created.id });
    done(diff.length ? 'Vehicle held' : 'Cleared', diff.length ? (created.note ?? '') : `${created.id}: counts match ${g.docRef}.`, diff.length ? 'warning' : 'success');
    return created;
  };
  const releaseGatePass = (id: string, note: string) => {
    const g = gatePasses.find((x) => x.id === id);
    if (!g || g.status !== 'HELD') return false;
    if (!approver) return fail('Manager releases', 'A manager releases a held vehicle.');
    if (!note.trim()) return fail('Reason', 'Record how the difference was resolved.');
    setGate((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'CLEARED', note: `${x.note ?? ''} · Released by ${actor}: ${note.trim()}` } : x)));
    logOb({ post: 'Main gate', category: 'Routine', entry: `${id} released by ${actor}: ${note.trim()}` });
    return done('Vehicle released', note.trim());
  };

  const [visitors, setVisitors] = useState<VisitorEntry[]>(INITIAL_VISITORS);
  const signInVisitor: SecurityStateSlice['signInVisitor'] = (v) => {
    const host = d.hrEmployees.find((e) => e.staffId === v.hostStaffId);
    if (!v.name.trim() || !v.idNo.trim() || !v.purpose.trim()) return fail('Visitor details', 'Name, ID number and purpose are needed.');
    if (!host || host.status === 'TERMINATED') return fail('Host', 'Choose an employee to host the visitor.');
    if (!v.badge.trim()) return fail('Badge', 'Issue a visitor badge.');
    if (visitors.some((x) => !x.outAt && x.badge === v.badge.trim())) return fail('Badge in use', `Badge ${v.badge} has not been returned.`);
    const row: VisitorEntry = { ...v, name: v.name.trim(), badge: v.badge.trim(), id: nextId(visitors.map((x) => x.id), 'VIS-'), orgId: d.selectedOrgId, inAt: nowStamp() };
    setVisitors((xs) => [row, ...xs]);
    notify({ module: 'Security', to: host.fullName, address: host.email, subject: `Your visitor ${row.name} (${v.company}) is at reception`, channels: ['IN_APP', 'SMS'] });
    return done('Visitor signed in', `${row.name}, badge ${row.badge}; ${host.fullName} notified.`);
  };
  const signOutVisitor = (id: string) => {
    const v = visitors.find((x) => x.id === id);
    if (!v || v.outAt) return false;
    setVisitors((xs) => xs.map((x) => (x.id === id ? { ...x, outAt: nowStamp() } : x)));
    return done('Visitor signed out', `${v.name}; badge ${v.badge} returned.`);
  };

  const [guardRoster, setRoster] = useState<GuardShift[]>(INITIAL_ROSTER);
  const addShift = (s: Omit<GuardShift, 'id' | 'orgId'>) => {
    if (!s.guard.trim() || !s.post.trim() || !s.date) return fail('Shift', 'Date, post and guard are needed.');
    if (guardRoster.some((x) => x.date === s.date && x.guard.toLowerCase() === s.guard.trim().toLowerCase())) return fail('Double shift', `${s.guard} already has a shift on ${fmt(s.date)}.`);
    if (guardRoster.some((x) => x.date === s.date && x.shift === s.shift && x.post === s.post.trim())) return fail('Post covered', `${s.post} already has a ${s.shift.toLowerCase()} guard.`);
    setRoster((xs) => [...xs, { ...s, guard: s.guard.trim(), post: s.post.trim(), id: `GR-${Date.now().toString(36)}`, orgId: d.selectedOrgId }]);
    return done('Shift rostered', `${s.guard} — ${s.post}, ${s.shift.toLowerCase()} ${fmt(s.date)}.`);
  };

  const [patrols, setPatrols] = useState<PatrolLog[]>(INITIAL_PATROLS);
  const startPatrol = (guard: string, route: string) => {
    if (!guard.trim() || !PATROL_ROUTES[route]) return fail('Patrol', 'Choose the guard and route.');
    if (patrols.some((p) => p.guard === guard.trim() && p.status === 'IN_PROGRESS')) return fail('Patrol running', `${guard} is already on a patrol.`);
    setPatrols((xs) => [{ id: nextId(xs.map((x) => x.id), 'PT-'), orgId: d.selectedOrgId, guard: guard.trim(), route, startedAt: nowStamp(), checkpoints: PATROL_ROUTES[route].map((name) => ({ name })), status: 'IN_PROGRESS' }, ...xs]);
    return done('Patrol started', `${guard.trim()} on ${route}.`);
  };
  const checkPatrolPoint = (id: string, name: string, note?: string) => {
    const p = patrols.find((x) => x.id === id);
    if (!p || p.status !== 'IN_PROGRESS') return false;
    setPatrols((xs) => xs.map((x) => (x.id === id ? { ...x, checkpoints: x.checkpoints.map((c) => (c.name === name && !c.at ? { ...c, at: nowStamp(), note } : c)) } : x)));
    return true;
  };
  const endPatrol = (id: string) => {
    const p = patrols.find((x) => x.id === id);
    if (!p || p.status !== 'IN_PROGRESS') return false;
    const missed = p.checkpoints.filter((c) => !c.at);
    setPatrols((xs) => xs.map((x) => (x.id === id ? { ...x, status: missed.length ? 'MISSED_POINTS' : 'COMPLETE' } : x)));
    if (missed.length) logOb({ post: 'Control room', category: 'Incident', entry: `Patrol ${id} (${p.guard}) missed ${missed.map((c) => c.name).join(', ')}` });
    return done(missed.length ? 'Patrol ended with missed points' : 'Patrol complete', missed.length ? missed.map((c) => c.name).join(', ') : `${p.checkpoints.length} checkpoints.`, missed.length ? 'warning' : 'success');
  };

  /* ---------------------------------------------------------------- security systems (simulated feed) */

  const [alarms, setAlarms] = useState<AlarmEvent[]>(INITIAL_ALARMS);
  const simulateAlarm = () => {
    const pick = SIMULATED_EVENTS[Math.floor(Math.random() * SIMULATED_EVENTS.length)];
    const ev: AlarmEvent = { ...pick, id: nextId(alarms.map((x) => x.id), 'AL-'), orgId: d.selectedOrgId, at: nowStamp(), status: 'NEW' };
    setAlarms((xs) => [ev, ...xs]);
    if (ev.severity === 'high') notify({ module: 'Security', to: 'Control room', subject: `${ev.source.replace('_', ' ')} alarm: ${ev.message} — ${ev.location}`, level: 'critical', channels: ['IN_APP', 'SMS'] });
    d.addToast({ type: ev.severity === 'high' ? 'warning' : 'info', title: 'Device event (simulated)', message: `${ev.location}: ${ev.message}` });
    return ev;
  };
  const acknowledgeAlarm = (id: string) => {
    const a = alarms.find((x) => x.id === id);
    if (!a || a.status !== 'NEW') return false;
    setAlarms((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'ACKNOWLEDGED', ackBy: actor } : x)));
    return done('Alarm acknowledged', `${a.location} — dispatch a guard to check.`, 'info');
  };
  const closeAlarm = (id: string, note: string) => {
    const a = alarms.find((x) => x.id === id);
    if (!a || a.status !== 'ACKNOWLEDGED') return fail('Acknowledge first', 'Acknowledge the alarm, check it, then close it.');
    if (!note.trim()) return fail('Finding needed', 'Record what the guard found.');
    setAlarms((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'CLOSED', closedNote: note.trim() } : x)));
    logOb({ post: 'Control room', category: 'Alarm', entry: `${a.id} ${a.source.replace('_', ' ').toLowerCase()} — ${a.location}: ${a.message}. Closed: ${note.trim()}` });
    return done('Alarm closed', 'Logged in the occurrence book.');
  };

  /* ---------------------------------------------------------------- grievances, stakeholder complaints, whistleblowing */

  const [allGrievances, setGrv] = useState<Grievance[]>(INITIAL_GRIEVANCES);
  const patchGrv = (id: string, f: (g: Grievance) => Grievance) => setGrv((xs) => xs.map((x) => (x.id === id ? f(x) : x)));
  const visible = (g: Grievance) => g.channel !== 'WHISTLEBLOWER' || canSeeWhistleblowing;
  const raiseGrievance: SecurityStateSlice['raiseGrievance'] = (g) => {
    if (!g.subject.trim() || g.details.trim().length < 15) {
      fail('Complaint incomplete', 'A subject and details (15+ characters) are needed.');
      return null;
    }
    if (g.channel === 'STAFF' && !g.staffId) {
      fail('Who is raising it?', 'Staff grievances record the employee (kept confidential if asked).');
      return null;
    }
    if (g.channel === 'STAKEHOLDER' && !g.complainant?.trim()) {
      fail('Complainant', 'Record who complained (a name, group or “Anonymous member of the public”).');
      return null;
    }
    const prefix = `GRV-${year}-`;
    const created: Grievance = {
      ...g,
      subject: g.subject.trim(),
      details: g.details.trim(),
      id: nextId(allGrievances.map((x) => x.id), prefix, 3),
      orgId: d.selectedOrgId,
      responseDue: addDaysIso(today, RESPONSE_DAYS[g.channel]),
      status: 'RECEIVED',
      messages: [],
      history: [{ at: today, by: g.channel === 'STAFF' ? nameOf(g.staffId) : g.complainant ?? 'Stakeholder', action: 'Raised' }]
    };
    setGrv((xs) => [created, ...xs]);
    notify({ module: 'HR', to: 'Employee relations officer', subject: `${g.category} ${created.id}${g.confidential ? ' (confidential)' : ''}: ${created.subject}`, ref: created.id, level: g.category === 'Harassment' ? 'warning' : 'info' });
    done('Complaint received', `${created.id}. A response is due by ${fmt(created.responseDue)}.`);
    return created;
  };
  const reportWhistleblowing: SecurityStateSlice['reportWhistleblowing'] = (r) => {
    if (!r.subject.trim() || r.details.trim().length < 20) {
      fail('Report incomplete', 'Give a subject and enough detail (20+ characters) to investigate.');
      return null;
    }
    const tracking = code();
    // Nothing that identifies the reporter is stored — only the follow-up code
    const created: Grievance = {
      ...r,
      subject: r.subject.trim(),
      details: r.details.trim(),
      channel: 'WHISTLEBLOWER',
      confidential: true,
      trackingCode: tracking,
      id: nextId(allGrievances.map((x) => x.id), `WB-${year}-`, 3),
      orgId: d.selectedOrgId,
      responseDue: addDaysIso(today, RESPONSE_DAYS.WHISTLEBLOWER),
      status: 'RECEIVED',
      messages: [],
      history: [{ at: today, by: 'Anonymous', action: 'Reported' }]
    };
    setGrv((xs) => [created, ...xs]);
    notify({ module: 'Audit', to: 'Whistleblowing officer (Internal Audit)', subject: `New whistleblowing report ${created.id} — ${r.category}`, ref: created.id, level: 'warning', channels: ['IN_APP'] });
    d.addToast({ type: 'success', title: 'Report received', message: `Keep your follow-up code ${tracking}. It is the only way to check progress — your identity is not recorded.` });
    return tracking;
  };
  const followUpWhistleblowing = (codeText: string, text: string) => {
    const g = allGrievances.find((x) => x.trackingCode === codeText.trim().toUpperCase());
    if (!g) return fail('Code not found', 'Check the follow-up code.');
    if (!text.trim()) return fail('Message', 'Write your message.');
    patchGrv(g.id, (x) => ({ ...x, messages: [...x.messages, { at: today, from: 'REPORTER', text: text.trim() }] }));
    return done('Message sent', 'The case officer will reply under the same code.');
  };
  const lookupWhistleblowing = (codeText: string) => {
    const g = allGrievances.find((x) => x.trackingCode === codeText.trim().toUpperCase());
    return g ? { status: g.status, responseDue: g.responseDue, messages: g.messages } : null;
  };
  const officerCheck = (g: Grievance) => {
    if (g.channel === 'WHISTLEBLOWER' && !canSeeWhistleblowing) return fail('Restricted', 'Whistleblowing cases are handled by designated officers only.');
    if (!approver) return fail('Officer needed', 'A manager or the designated officer handles complaints.');
    if (g.staffId && nameOf(g.staffId) === actor) return fail('Conflict of interest', 'You raised this complaint.');
    if (g.against && g.against.toLowerCase().includes(actor.toLowerCase())) return fail('Conflict of interest', 'The complaint is about you.');
    return true;
  };
  const assignGrievance = (id: string, investigator: string) => {
    const g = allGrievances.find((x) => x.id === id);
    if (!g || !['RECEIVED', 'APPEALED'].includes(g.status) || !officerCheck(g)) return false;
    if (!investigator.trim()) return fail('Investigator', 'Name who investigates.');
    if (g.staffId && nameOf(g.staffId) === investigator) return fail('Conflict of interest', 'The complainant cannot investigate.');
    if (g.against && g.against.toLowerCase().includes(investigator.trim().toLowerCase())) return fail('Conflict of interest', 'The person complained about cannot investigate.');
    patchGrv(id, (x) => ({ ...x, investigator: investigator.trim(), status: 'INVESTIGATING', history: [...x.history, hist('Investigation started', investigator.trim())] }));
    return done('Investigator assigned', `${investigator.trim()} — respond by ${fmt(g.responseDue)}.`);
  };
  const scheduleGrievanceHearing = (id: string, date: string) => {
    const g = allGrievances.find((x) => x.id === id);
    if (!g || g.status !== 'INVESTIGATING' || !officerCheck(g)) return false;
    if (!date || date < today) return fail('Hearing date', 'Pick today or a later date.');
    patchGrv(id, (x) => ({ ...x, hearingDate: date, status: 'HEARING', history: [...x.history, hist('Hearing scheduled', date)] }));
    if (g.staffId) notify({ module: 'HR', to: nameOf(g.staffId), subject: `Grievance ${id}: hearing on ${fmt(date)}`, ref: id });
    return done('Hearing scheduled', fmt(date));
  };
  const replyGrievance = (id: string, text: string) => {
    const g = allGrievances.find((x) => x.id === id);
    if (!g || !officerCheck(g) || !text.trim()) return false;
    patchGrv(id, (x) => ({ ...x, messages: [...x.messages, { at: today, from: 'CASE_OFFICER', text: text.trim() }] }));
    return done('Reply sent', g.channel === 'WHISTLEBLOWER' ? 'The reporter sees it with their follow-up code.' : 'Sent to the complainant.');
  };
  const resolveGrievance = (id: string, resolution: string) => {
    const g = allGrievances.find((x) => x.id === id);
    if (!g || !['INVESTIGATING', 'HEARING'].includes(g.status) || !officerCheck(g)) return false;
    if (resolution.trim().length < 15) return fail('Resolution', 'Describe the outcome and the action taken (15+ characters).');
    patchGrv(id, (x) => ({ ...x, resolution: resolution.trim(), status: 'RESOLVED', history: [...x.history, hist('Resolved', resolution.trim())] }));
    if (g.staffId) notify({ module: 'HR', to: nameOf(g.staffId), subject: `Grievance ${id} resolved — 14 days to appeal`, body: resolution.trim(), ref: id });
    if (g.contact) notify({ module: 'HR', to: g.complainant ?? 'Complainant', address: g.contact, subject: `Your complaint ${id} has been resolved`, body: resolution.trim(), ref: id, channels: ['SMS'] });
    return done('Resolved', g.channel === 'STAFF' ? 'The employee can appeal within 14 days.' : 'Complainant informed.');
  };
  const appealGrievance = (id: string, reason: string) => {
    const g = allGrievances.find((x) => x.id === id);
    if (!g || g.status !== 'RESOLVED') return fail('Not resolved', 'Only a resolved complaint can be appealed.');
    const resolvedOn = [...g.history].reverse().find((x) => x.action === 'Resolved')?.at ?? today;
    if (addDaysIso(resolvedOn, 14) < today) return fail('Appeal window closed', 'Appeals are made within 14 days of the outcome.');
    if (!reason.trim()) return fail('Reason', 'Say why the outcome is appealed.');
    patchGrv(id, (x) => ({ ...x, appeal: reason.trim(), status: 'APPEALED', history: [...x.history, hist('Appealed', reason.trim())] }));
    return done('Appeal lodged', 'A different officer will review it.');
  };
  const closeGrievance = (id: string) => {
    const g = allGrievances.find((x) => x.id === id);
    if (!g || g.status !== 'RESOLVED' || !officerCheck(g)) return false;
    patchGrv(id, (x) => ({ ...x, status: 'CLOSED', history: [...x.history, hist('Closed')] }));
    return done('Closed', id);
  };

  return {
    securityRequisitions,
    requestSecurity,
    decideSecurity,
    assignSecurity,
    completeSecurity,
    transitRecords,
    dispatchTransit,
    logCheckpoint,
    recordArrival,
    occurrences,
    addOccurrence,
    visitors,
    signInVisitor,
    signOutVisitor,
    guardRoster,
    addShift,
    patrols,
    startPatrol,
    checkPatrolPoint,
    endPatrol,
    investigations,
    openInvestigation,
    addEvidence,
    addInterview,
    recordFindings,
    closeInvestigation,
    gatePasses,
    recordGatePass,
    releaseGatePass,
    insuranceClaims,
    raiseInsuranceClaim,
    lodgeClaimDocument,
    assessClaim,
    settleClaim,
    rejectClaim,
    alarms,
    simulateAlarm,
    acknowledgeAlarm,
    closeAlarm,
    grievances: allGrievances.filter(visible),
    whistleblowingCount: allGrievances.filter((g) => g.channel === 'WHISTLEBLOWER' && !['CLOSED'].includes(g.status)).length,
    canSeeWhistleblowing,
    raiseGrievance,
    reportWhistleblowing,
    followUpWhistleblowing,
    lookupWhistleblowing,
    assignGrievance,
    scheduleGrievanceHearing,
    replyGrievance,
    resolveGrievance,
    appealGrievance,
    closeGrievance
  };
};
