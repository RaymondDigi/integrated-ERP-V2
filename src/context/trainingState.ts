import { useMemo, useState } from 'react';
import type { HREmployee, LeaveRequest } from '../types';
import { fmtDate, isoOf } from '../data/timeEngine';
import {
  SEED_BONDS,
  SEED_BUDGETS,
  SEED_CLAIMS,
  SEED_NEEDS,
  SEED_SESSIONS,
  certById,
  courseById,
  courseForCert,
  type Enrolment,
  type NitaClaim,
  type Priority,
  type TrainingBond,
  type TrainingNeed,
  type TrainingSession
} from '../data/trainingConfig';
import { WORKFORCE } from '../data/workforce';
import { bondRecoveryFor, courseForSkill, issueRecord, leaveClashes, passed, seatsTaken, seedCertRecords, type BondRecovery, type CertRecord } from '../data/trainingEngine';

type Toast = { type: 'success' | 'warning' | 'error' | 'info'; title: string; message: string };

export interface NewTrainingNeed {
  staffId: string;
  skill: string;
  reason: string;
  source: 'Appraisal' | 'Manager' | 'Compliance' | 'Employee';
  ref?: string;
  priority: Priority;
}

export type SessionDraft = Omit<TrainingSession, 'id' | 'status' | 'enrolments' | 'actualCost' | 'invoiceNo' | 'financeBill'>;

/** Learning & development state exposed through the app context. */
export interface TrainingStateSlice {
  /** Date the training module treats as today */
  trainingToday: string;
  certRecords: CertRecord[];
  /** Records a certificate the employee already holds (medical, licence renewal…). */
  recordCertificate: (staffId: string, certId: string, issuedOn: string, ref: string) => void;
  trainingNeeds: TrainingNeed[];
  /** Raises a training need. Called by Performance for appraisal development actions. */
  addTrainingNeed: (n: NewTrainingNeed) => void;
  /** Turns certification gaps into needs. Returns how many were raised. */
  raiseGapNeeds: (gaps: { staffId: string; certId: string; expired: boolean }[]) => number;
  decideTrainingNeeds: (ids: string[], status: 'Approved' | 'Rejected') => void;
  trainingSessions: TrainingSession[];
  scheduleTrainingSession: (draft: SessionDraft) => TrainingSession;
  /** Books people on a session; extra people go on the waitlist. */
  enrolInSession: (sessionId: string, people: { staffId: string; needId?: string }[]) => { enrolled: number; waitlisted: number };
  updateEnrolment: (sessionId: string, staffId: string, patch: Partial<Enrolment>) => void;
  withdrawEnrolment: (sessionId: string, staffId: string) => void;
  /** Closes a session: issues certificates to those who attended and passed. */
  closeTrainingSession: (sessionId: string, actualCost: number, invoiceNo: string) => void;
  cancelTrainingSession: (sessionId: string) => void;
  markSessionBilled: (sessionId: string, billNo: string) => void;
  trainingBudgets: Record<string, number>;
  setTrainingBudget: (department: string, amount: number) => void;
  nitaClaims: NitaClaim[];
  createNitaClaim: (sessionIds: string[], amount: number) => NitaClaim;
  advanceNitaClaim: (id: string, patch: Partial<NitaClaim>) => void;
  trainingBonds: TrainingBond[];
  addTrainingBond: (b: Omit<TrainingBond, 'id' | 'orgId' | 'status'>) => void;
  setBondStatus: (id: string, status: TrainingBond['status']) => void;
  /** Amount still owed on active bonds if the employee leaves on exitDate (pro rata). */
  bondRecoveryFor: (staffId: string, exitDate: string) => { owed: number; lines: BondRecovery[] };
}

interface Deps {
  hrEmployees: HREmployee[];
  leaveRequests: LeaveRequest[];
  addToast: (t: Toast) => void;
}

const OPEN: TrainingNeed['status'][] = ['Proposed', 'Approved', 'Planned'];
const HR_LEAD = 'Ruth Chebet';
let needSeq = 105;

export const useTrainingState = ({ hrEmployees, leaveRequests, addToast }: Deps): TrainingStateSlice => {
  const trainingToday = isoOf(new Date());
  const [certRecords, setCertRecords] = useState<CertRecord[]>(() => seedCertRecords(WORKFORCE, SEED_SESSIONS));
  const [trainingNeeds, setNeeds] = useState<TrainingNeed[]>(SEED_NEEDS);
  const [trainingSessions, setSessions] = useState<TrainingSession[]>(SEED_SESSIONS);
  const [trainingBudgets, setBudgets] = useState<Record<string, number>>(SEED_BUDGETS);
  const [nitaClaims, setClaims] = useState<NitaClaim[]>(SEED_CLAIMS);
  const [trainingBonds, setBonds] = useState<TrainingBond[]>(SEED_BONDS);
  const byId = useMemo(() => new Map(hrEmployees.map((e) => [e.staffId, e])), [hrEmployees]);
  const nameOf = (id: string) => byId.get(id)?.fullName ?? id;
  const orgOf = (id: string) => byId.get(id)?.orgId ?? 'org-kericho';

  const recordCertificate: TrainingStateSlice['recordCertificate'] = (staffId, certId, issuedOn, ref) => {
    const rec = issueRecord(staffId, certId, issuedOn, ref || 'Recorded by HR', 'Record', undefined, `CR-${Date.now().toString(36)}`);
    setCertRecords((prev) => [...prev, rec]);
    // A valid certificate closes any open need for it
    setNeeds((prev) => prev.map((n) => (n.staffId === staffId && n.certId === certId && OPEN.includes(n.status) && !n.sessionId ? { ...n, status: 'Completed' } : n)));
    addToast({ type: 'success', title: 'Certificate recorded', message: `${certById(certId)?.name} for ${nameOf(staffId)}, valid to ${fmtDate(rec.expiresOn)}.` });
  };

  const addTrainingNeed: TrainingStateSlice['addTrainingNeed'] = (n) => {
    const skill = n.skill.trim();
    if (!n.staffId || !skill) return;
    const dupe = trainingNeeds.some((x) => x.staffId === n.staffId && x.skill.toLowerCase() === skill.toLowerCase() && OPEN.includes(x.status) && (x.ref ?? '') === (n.ref ?? ''));
    if (dupe) return;
    const course = courseForSkill(skill);
    const need: TrainingNeed = {
      id: `TN-${++needSeq}`,
      orgId: orgOf(n.staffId),
      staffId: n.staffId,
      skill,
      reason: n.reason.trim(),
      source: n.source,
      ref: n.ref,
      priority: n.priority,
      status: 'Proposed',
      raisedOn: trainingToday,
      courseId: course?.id,
      certId: course?.certId
    };
    // Several calls can land in one event, so check again against the latest list
    setNeeds((prev) => (prev.some((x) => x.staffId === need.staffId && x.skill.toLowerCase() === skill.toLowerCase() && OPEN.includes(x.status) && (x.ref ?? '') === (need.ref ?? '')) ? prev : [need, ...prev]));
    addToast({ type: 'success', title: 'Training need raised', message: `${skill} for ${nameOf(n.staffId)} (${n.source.toLowerCase()}).` });
  };

  const raiseGapNeeds: TrainingStateSlice['raiseGapNeeds'] = (gaps) => {
    const fresh: TrainingNeed[] = [];
    gaps.forEach((g) => {
      if (trainingNeeds.some((n) => n.staffId === g.staffId && n.certId === g.certId && OPEN.includes(n.status)) || fresh.some((n) => n.staffId === g.staffId && n.certId === g.certId)) return;
      const cert = certById(g.certId);
      const course = courseForCert(g.certId);
      fresh.push({
        id: `TN-${++needSeq}`,
        orgId: orgOf(g.staffId),
        staffId: g.staffId,
        skill: course?.title ?? cert?.name ?? g.certId,
        reason: `${cert?.name} ${g.expired ? 'has expired' : 'is missing'} — required for the role`,
        source: 'Certification gap',
        priority: cert?.category === 'Statutory' || g.expired ? 'High' : 'Medium',
        status: 'Proposed',
        raisedOn: trainingToday,
        certId: g.certId,
        courseId: course?.id
      });
    });
    if (fresh.length) {
      setNeeds((prev) => [...fresh, ...prev]);
      addToast({ type: 'success', title: fresh.length === 1 ? 'Need raised' : `${fresh.length} needs raised`, message: 'From certification gaps — review and approve them under Training needs.' });
    } else addToast({ type: 'info', title: 'Nothing new', message: 'Every gap already has an open training need.' });
    return fresh.length;
  };

  const decideTrainingNeeds: TrainingStateSlice['decideTrainingNeeds'] = (ids, status) => {
    setNeeds((prev) => prev.map((n) => (ids.includes(n.id) && n.status === 'Proposed' ? { ...n, status, decidedBy: HR_LEAD } : n)));
    addToast({ type: status === 'Approved' ? 'success' : 'info', title: status === 'Approved' ? `${ids.length} approved` : `${ids.length} rejected`, message: status === 'Approved' ? 'Approved needs are in the plan — enrol them on a session.' : 'Removed from the plan.' });
  };

  const scheduleTrainingSession: TrainingStateSlice['scheduleTrainingSession'] = (draft) => {
    const s: TrainingSession = { ...draft, id: `TS-${2600 + trainingSessions.length + 1}`, status: 'Scheduled', enrolments: [] };
    setSessions((prev) => [...prev, s]);
    addToast({ type: 'success', title: 'Session scheduled', message: `${courseById(s.courseId)?.title} on ${fmtDate(s.start)} (${s.id}).` });
    return s;
  };

  const enrolInSession: TrainingStateSlice['enrolInSession'] = (sessionId, people) => {
    const s = trainingSessions.find((x) => x.id === sessionId);
    if (!s) return { enrolled: 0, waitlisted: 0 };
    let free = s.capacity - seatsTaken(s);
    const added: Enrolment[] = [];
    const linked: Record<string, string> = {};
    const clashes: string[] = [];
    for (const p of people) {
      const cur = s.enrolments.find((x) => x.staffId === p.staffId);
      if (cur && cur.status !== 'Withdrawn') continue;
      const need =
        p.needId ?? trainingNeeds.find((n) => n.staffId === p.staffId && n.courseId === s.courseId && (n.status === 'Approved' || n.status === 'Proposed') && !n.sessionId)?.id;
      const status = free > 0 ? 'Enrolled' : 'Waitlisted';
      if (status === 'Enrolled') free--;
      added.push({ staffId: p.staffId, status, needId: need });
      if (need) linked[need] = p.staffId;
      if (leaveClashes(leaveRequests, p.staffId, s.start, s.end).length) clashes.push(nameOf(p.staffId));
    }
    if (!added.length) {
      addToast({ type: 'info', title: 'Already booked', message: 'Everyone selected is already on this session.' });
      return { enrolled: 0, waitlisted: 0 };
    }
    setSessions((prev) => prev.map((x) => (x.id === sessionId ? { ...x, enrolments: [...x.enrolments.filter((y) => !added.some((a) => a.staffId === y.staffId)), ...added] } : x)));
    setNeeds((prev) => prev.map((n) => (linked[n.id] ? { ...n, status: 'Planned', sessionId, decidedBy: n.decidedBy ?? HR_LEAD } : n)));
    const enrolled = added.filter((a) => a.status === 'Enrolled').length;
    const waitlisted = added.length - enrolled;
    addToast({
      type: clashes.length ? 'warning' : 'success',
      title: `${enrolled} enrolled${waitlisted ? `, ${waitlisted} waitlisted` : ''}`,
      message: clashes.length ? `Leave overlaps the training dates for ${clashes.join(', ')} — check before confirming.` : `${courseById(s.courseId)?.title} on ${fmtDate(s.start)}.`
    });
    return { enrolled, waitlisted };
  };

  const updateEnrolment: TrainingStateSlice['updateEnrolment'] = (sessionId, staffId, patch) =>
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, enrolments: s.enrolments.map((e) => (e.staffId === staffId ? { ...e, ...patch } : e)) } : s)));

  const withdrawEnrolment: TrainingStateSlice['withdrawEnrolment'] = (sessionId, staffId) => {
    const s = trainingSessions.find((x) => x.id === sessionId);
    if (!s) return;
    const leaving = s.enrolments.find((e) => e.staffId === staffId);
    const promote = leaving?.status === 'Enrolled' ? s.enrolments.find((e) => e.status === 'Waitlisted') : undefined;
    setSessions((prev) =>
      prev.map((x) =>
        x.id === sessionId
          ? { ...x, enrolments: x.enrolments.map((e) => (e.staffId === staffId ? { ...e, status: 'Withdrawn' } : promote && e.staffId === promote.staffId ? { ...e, status: 'Enrolled' } : e)) }
          : x
      )
    );
    if (leaving?.needId) setNeeds((prev) => prev.map((n) => (n.id === leaving.needId ? { ...n, status: 'Approved', sessionId: undefined } : n)));
    addToast({ type: 'info', title: 'Withdrawn', message: `${nameOf(staffId)} removed${promote ? `; ${nameOf(promote.staffId)} moved off the waitlist` : ''}.` });
  };

  const closeTrainingSession: TrainingStateSlice['closeTrainingSession'] = (sessionId, actualCost, invoiceNo) => {
    const s = trainingSessions.find((x) => x.id === sessionId);
    if (!s) return;
    const c = courseById(s.courseId);
    const newRecs: CertRecord[] = [];
    const done: string[] = [];
    const missed: string[] = [];
    const enrolments = s.enrolments.map((en) => {
      if (en.status === 'Enrolled') {
        if (en.needId) missed.push(en.needId);
        return { ...en, status: 'No show' as const };
      }
      if (en.status !== 'Attended') return en;
      if (!passed(c, en.score)) {
        if (en.needId) missed.push(en.needId);
        return en;
      }
      if (en.needId) done.push(en.needId);
      if (!c?.certId) return en;
      const rec = issueRecord(en.staffId, c.certId, s.end, `${s.id}/${en.staffId}`, 'Session', s.id);
      newRecs.push(rec);
      return { ...en, certRecordId: rec.id };
    });
    setSessions((prev) => prev.map((x) => (x.id === sessionId ? { ...x, enrolments, status: 'Completed', actualCost, invoiceNo: invoiceNo || undefined } : x)));
    if (newRecs.length) setCertRecords((prev) => [...prev, ...newRecs]);
    setNeeds((prev) => prev.map((n) => (done.includes(n.id) ? { ...n, status: 'Completed' } : missed.includes(n.id) ? { ...n, status: 'Approved', sessionId: undefined } : n)));
    addToast({
      type: 'success',
      title: 'Session closed',
      message: c?.certId ? `${newRecs.length} certificate${newRecs.length === 1 ? '' : 's'} issued — the skills matrix now shows the new expiry dates.` : `${enrolments.filter((e) => e.status === 'Attended').length} attended.`
    });
  };

  const cancelTrainingSession: TrainingStateSlice['cancelTrainingSession'] = (sessionId) => {
    const s = trainingSessions.find((x) => x.id === sessionId);
    setSessions((prev) => prev.map((x) => (x.id === sessionId ? { ...x, status: 'Cancelled' } : x)));
    const ids = s?.enrolments.map((e) => e.needId).filter(Boolean) ?? [];
    setNeeds((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, status: 'Approved', sessionId: undefined } : n)));
    addToast({ type: 'info', title: 'Session cancelled', message: `${sessionId}: linked needs are back in the plan.` });
  };

  const markSessionBilled: TrainingStateSlice['markSessionBilled'] = (sessionId, billNo) =>
    setSessions((prev) => prev.map((x) => (x.id === sessionId ? { ...x, financeBill: billNo } : x)));

  const setTrainingBudget: TrainingStateSlice['setTrainingBudget'] = (department, amount) => {
    setBudgets((prev) => ({ ...prev, [department]: Math.max(0, Math.round(amount)) }));
    addToast({ type: 'success', title: 'Budget updated', message: `${department}: KES ${Math.round(amount).toLocaleString()}.` });
  };

  const createNitaClaim: TrainingStateSlice['createNitaClaim'] = (sessionIds, amount) => {
    const first = trainingSessions.find((s) => s.id === sessionIds[0]);
    const claim: NitaClaim = { id: `NC-${2601 + nitaClaims.length}`, orgId: first?.orgId ?? 'org-kericho', sessionIds, amount: Math.round(amount), status: 'Draft', createdOn: trainingToday };
    setClaims((prev) => [claim, ...prev]);
    addToast({ type: 'success', title: 'Claim drafted', message: `${claim.id}: KES ${claim.amount.toLocaleString()} for ${sessionIds.length} session${sessionIds.length === 1 ? '' : 's'}.` });
    return claim;
  };

  const advanceNitaClaim: TrainingStateSlice['advanceNitaClaim'] = (id, patch) => {
    setClaims((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    if (patch.status) addToast({ type: 'success', title: `Claim ${patch.status.toLowerCase()}`, message: `${id}${patch.nitaRef ? ` · ${patch.nitaRef}` : ''}` });
  };

  const addTrainingBond: TrainingStateSlice['addTrainingBond'] = (b) => {
    const bond: TrainingBond = { ...b, id: `TB-${String(trainingBonds.length + 1).padStart(2, '0')}`, orgId: orgOf(b.staffId), status: 'Active' };
    setBonds((prev) => [...prev, bond]);
    addToast({ type: 'success', title: 'Bond recorded', message: `${nameOf(b.staffId)}: KES ${b.amount.toLocaleString()} over ${b.months} months.` });
  };

  const setBondStatus: TrainingStateSlice['setBondStatus'] = (id, status) => {
    setBonds((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
    addToast({ type: 'info', title: `Bond ${status.toLowerCase()}`, message: id });
  };

  return {
    trainingToday,
    certRecords,
    recordCertificate,
    trainingNeeds,
    addTrainingNeed,
    raiseGapNeeds,
    decideTrainingNeeds,
    trainingSessions,
    scheduleTrainingSession,
    enrolInSession,
    updateEnrolment,
    withdrawEnrolment,
    closeTrainingSession,
    cancelTrainingSession,
    markSessionBilled,
    trainingBudgets,
    setTrainingBudget,
    nitaClaims,
    createNitaClaim,
    advanceNitaClaim,
    trainingBonds,
    addTrainingBond,
    setBondStatus,
    bondRecoveryFor: (staffId, exitDate) => bondRecoveryFor(staffId, exitDate, trainingBonds)
  };
};
