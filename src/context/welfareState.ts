import { useState } from 'react';
import type { PeopleDeps } from './sliceDeps';
import { isoOf } from '../data/timeEngine';
import {
  buildWelfareSeed,
  CLAIM_TYPE_LABEL,
  DEFAULT_WELFARE_POLICIES,
  ER_OUTCOME_LABEL,
  ER_TYPES,
  type CsrActivity,
  type Dependant,
  type ErCase,
  type ErEvent,
  type ErInterview,
  type ErOutcome,
  type EventTask,
  type MedicalClaim,
  type MedicalMember,
  type MedicalScheme,
  type StaffEvent,
  type WelfareFund,
  type WelfarePolicy,
  type WelfareRequest,
  type WelfareType
} from '../data/welfareSeed';

/** Whoever acts in the demo (the HR & Payroll Officer) */
export const WELFARE_ACTOR = 'Rose Chepkoech';

export type NewErCase = Pick<ErCase, 'type' | 'category' | 'reporterKind' | 'confidential' | 'description' | 'occurredOn' | 'location' | 'caseOfficer'> &
  Partial<Pick<ErCase, 'reporterStaffId' | 'reporterName' | 'reporterContact' | 'againstStaffId'>> & {
    /** Company the report belongs to (anonymous portal reports pass the employee's company) */
    orgId?: string;
  };
export type NewMedicalClaim = Pick<MedicalClaim, 'schemeId' | 'staffId' | 'type' | 'provider' | 'serviceOn' | 'claimed' | 'outOfPocket'> & Partial<Pick<MedicalClaim, 'patientId' | 'note'>>;
export type NewWelfareRequest = Pick<WelfareRequest, 'staffId' | 'type' | 'optionId' | 'documents'> & Partial<Pick<WelfareRequest, 'beneficiaryName' | 'amount'>>;
export type NewStaffEvent = Omit<StaffEvent, 'id' | 'orgId' | 'tasks' | 'actual' | 'attendees' | 'status'>;
export type NewCsrActivity = Omit<CsrActivity, 'id' | 'orgId'>;

/** Employee Relations & Welfare (Process #13) state exposed through the app context. */
export interface WelfareStateSlice {
  welfareToday: string;

  erCases: ErCase[];
  addErCase: (draft: NewErCase) => ErCase | null;
  acknowledgeErCase: (id: string, note?: string) => void;
  startErInvestigation: (id: string, investigator: string) => void;
  addErInterview: (id: string, iv: Omit<ErInterview, 'id'>) => void;
  saveErFindings: (id: string, findings: string) => void;
  recordErOutcome: (id: string, outcome: ErOutcome, note: string) => boolean;
  escalateErCase: (id: string, disciplinaryRef: string) => boolean;
  closeErCase: (id: string, note?: string) => void;
  addErNote: (id: string, text: string, by?: string) => void;
  /** Records that someone other than the case officer opened a confidential case */
  logErAccess: (id: string, by: string, reason: string) => void;

  medicalSchemes: MedicalScheme[];
  medicalMembers: MedicalMember[];
  medicalClaims: MedicalClaim[];
  enrolMedicalMember: (staffId: string, schemeId: string, classId: string) => MedicalMember | null;
  setMedicalMemberClass: (memberId: string, classId: string) => void;
  setMedicalMemberStatus: (memberId: string, status: MedicalMember['status']) => void;
  addMedicalDependant: (memberId: string, dep: Omit<Dependant, 'id'>) => void;
  removeMedicalDependant: (memberId: string, depId: string) => void;
  renewMedicalScheme: (schemeId: string, premiumChangePct: number) => void;
  addMedicalClaim: (draft: NewMedicalClaim) => MedicalClaim | null;
  sendMedicalClaim: (id: string, insurerRef: string) => void;
  payMedicalClaim: (id: string, approved: number) => void;
  rejectMedicalClaim: (id: string, reason: string) => void;
  /** Refunds an out-of-pocket claim through payroll (REIMBURSEMENT, open period) */
  reimburseMedicalClaim: (id: string) => boolean;

  welfarePolicies: WelfarePolicy[];
  setWelfarePolicyAmount: (type: WelfareType, optionId: string, amount: number) => void;
  welfareRequests: WelfareRequest[];
  welfareFunds: WelfareFund[];
  addWelfareRequest: (draft: NewWelfareRequest) => WelfareRequest | null;
  decideWelfareRequest: (id: string, approve: boolean, reason?: string) => boolean;
  /** Pays an approved request through payroll (LONG_SERVICE or REIMBURSEMENT) or from the welfare fund */
  payWelfareRequest: (id: string, via: 'PAYROLL' | 'FUND') => boolean;

  staffEvents: StaffEvent[];
  addStaffEvent: (draft: NewStaffEvent) => StaffEvent;
  updateStaffEvent: (id: string, patch: Partial<Pick<StaffEvent, 'status' | 'actual' | 'attendees' | 'budget' | 'date' | 'venue' | 'notes' | 'expected'>>) => void;
  addEventTask: (eventId: string, t: Omit<EventTask, 'id' | 'done'>) => void;
  toggleEventTask: (eventId: string, taskId: string) => void;
  csrActivities: CsrActivity[];
  addCsrActivity: (draft: NewCsrActivity) => CsrActivity;
  updateCsrActivity: (id: string, patch: Partial<NewCsrActivity>) => void;
}

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nextRef = (prefix: string, refs: string[], year: string) => {
  const nums = refs.filter((r) => r.startsWith(`${prefix}-${year}-`)).map((r) => Number(r.split('-')[2]) || 0);
  return `${prefix}-${year}-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
};
const addYears = (iso: string, n: number) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4)}`;

export const useWelfareState = (d: PeopleDeps): WelfareStateSlice => {
  const [today] = useState(() => isoOf(new Date()));
  const [seed] = useState(() => buildWelfareSeed(today));
  const orgOf = (staffId?: string) => (staffId && d.hrEmployees.find((e) => e.staffId === staffId)?.orgId) || d.selectedOrgId;
  const [erCases, setErCases] = useState<ErCase[]>(seed.erCases);
  const [medicalSchemes, setSchemes] = useState<MedicalScheme[]>(seed.medicalSchemes);
  const [medicalMembers, setMembers] = useState<MedicalMember[]>(seed.medicalMembers);
  const [medicalClaims, setClaims] = useState<MedicalClaim[]>(seed.medicalClaims);
  const [welfarePolicies, setPolicies] = useState<WelfarePolicy[]>(DEFAULT_WELFARE_POLICIES);
  const [welfareRequests, setRequests] = useState<WelfareRequest[]>(seed.welfareRequests);
  const [welfareFunds] = useState<WelfareFund[]>(seed.welfareFunds);
  const [staffEvents, setEvents] = useState<StaffEvent[]>(seed.staffEvents);
  const [csrActivities, setCsr] = useState<CsrActivity[]>(seed.csrActivities);

  const year = today.slice(0, 4);
  const nameOf = (staffId?: string) => (staffId ? d.hrEmployees.find((e) => e.staffId === staffId)?.fullName ?? staffId : '');
  const toast = d.addToast;

  /* ---------------- Cases ---------------- */
  const patchCase = (id: string, fn: (c: ErCase) => Partial<ErCase>, event?: Omit<ErEvent, 'on' | 'by'> & { by?: string }) =>
    setErCases((list) => list.map((c) => (c.id === id ? { ...c, ...fn(c), timeline: event ? [...c.timeline, { on: today, by: event.by ?? WELFARE_ACTOR, text: event.text, kind: event.kind }] : c.timeline } : c)));

  const addErCase: WelfareStateSlice['addErCase'] = (draft) => {
    if (!draft.description.trim() || !draft.caseOfficer) {
      toast({ type: 'warning', title: 'Report not saved', message: 'Add a description and choose a case officer.' });
      return null;
    }
    const c: ErCase = {
      ...draft,
      id: uid('er'),
      ref: nextRef('ER', erCases.map((x) => x.ref), year),
      // Filed under the reporter's company, not whichever company HR is looking at
      orgId: draft.orgId ?? orgOf(draft.reporterStaffId),
      reportedOn: today,
      stage: 'RECEIVED',
      interviews: [],
      accessLog: [],
      timeline: [{ on: today, by: WELFARE_ACTOR, kind: 'stage', text: `${ER_TYPES[draft.type].label} received${draft.reporterKind === 'ANONYMOUS' ? ' (anonymous)' : ''}` }]
    };
    setErCases((list) => [c, ...list]);
    toast({ type: 'success', title: `${c.ref} logged`, message: `Acknowledge within 7 days. Case officer: ${nameOf(c.caseOfficer)}.` });
    return c;
  };

  const acknowledgeErCase: WelfareStateSlice['acknowledgeErCase'] = (id, note) =>
    patchCase(id, () => ({ stage: 'ACKNOWLEDGED', acknowledgedOn: today }), { kind: 'stage', text: `Acknowledged${note ? `: ${note}` : ''}` });

  const startErInvestigation: WelfareStateSlice['startErInvestigation'] = (id, investigator) =>
    patchCase(id, (c) => ({ stage: 'INVESTIGATION', investigator, investigationStartedOn: today, acknowledgedOn: c.acknowledgedOn ?? today }), { kind: 'stage', text: `Investigation opened by ${nameOf(investigator)}` });

  const addErInterview: WelfareStateSlice['addErInterview'] = (id, iv) =>
    patchCase(id, (c) => ({ interviews: [...c.interviews, { ...iv, id: uid('iv') }] }), { kind: 'interview', text: `Interview: ${iv.person} (${iv.role.toLowerCase()})` });

  const saveErFindings: WelfareStateSlice['saveErFindings'] = (id, findings) => patchCase(id, () => ({ findings }), { kind: 'note', text: 'Findings updated' });

  const recordErOutcome: WelfareStateSlice['recordErOutcome'] = (id, outcome, note) => {
    if (!note.trim()) {
      toast({ type: 'warning', title: 'Add a note', message: 'Say what was decided and what happens next.' });
      return false;
    }
    patchCase(id, () => ({ stage: 'OUTCOME', outcome, outcomeOn: today, outcomeNote: note.trim() }), { kind: 'stage', text: `Outcome: ${ER_OUTCOME_LABEL[outcome]}` });
    return true;
  };

  const escalateErCase: WelfareStateSlice['escalateErCase'] = (id, ref) => {
    if (!ref.trim()) return false;
    patchCase(id, () => ({ disciplinaryRef: ref.trim() }), { kind: 'escalation', text: `Escalated to disciplinary case ${ref.trim()}` });
    toast({ type: 'info', title: 'Escalated to Disciplinary', message: `Reference ${ref.trim()} recorded on the case.` });
    return true;
  };

  const closeErCase: WelfareStateSlice['closeErCase'] = (id, note) => {
    patchCase(id, () => ({ stage: 'CLOSED', closedOn: today }), { kind: 'stage', text: `Case closed${note ? `: ${note}` : ''}` });
    toast({ type: 'success', title: 'Case closed', message: 'The reporter should be told the outcome where they can be reached.' });
  };

  const addErNote: WelfareStateSlice['addErNote'] = (id, text, by) => {
    if (text.trim()) patchCase(id, () => ({}), { kind: 'note', text: text.trim(), by });
  };

  const logErAccess: WelfareStateSlice['logErAccess'] = (id, by, reason) =>
    patchCase(id, (c) => ({ accessLog: [...c.accessLog, { on: today, by, reason }] }), { kind: 'access', text: `Confidential details opened by ${by}: ${reason}`, by });

  /* ---------------- Medical ---------------- */
  const enrolMedicalMember: WelfareStateSlice['enrolMedicalMember'] = (staffId, schemeId, classId) => {
    if (medicalMembers.some((m) => m.staffId === staffId && m.schemeId === schemeId)) {
      toast({ type: 'warning', title: 'Already a member', message: `${nameOf(staffId)} is already on this scheme.` });
      return null;
    }
    const scheme = medicalSchemes.find((s) => s.id === schemeId);
    const n = medicalMembers.filter((m) => m.schemeId === schemeId).length + 101;
    const m: MedicalMember = { id: uid('mm'), orgId: d.selectedOrgId, schemeId, staffId, classId, memberNo: `${scheme?.policyNo.split('/')[0] ?? 'MED'}-${String(n).padStart(4, '0')}`, enrolledOn: today, dependants: [], status: 'ACTIVE' };
    setMembers((list) => [...list, m]);
    d.logEmployeeEdit(staffId, [{ action: `Enrolled on ${scheme?.insurer ?? ''} ${scheme?.name ?? 'medical scheme'} (${classId})` }], WELFARE_ACTOR);
    toast({ type: 'success', title: 'Member enrolled', message: `${nameOf(staffId)} — tell the insurer before cover starts.` });
    return m;
  };
  const patchMember = (id: string, fn: (m: MedicalMember) => Partial<MedicalMember>) => setMembers((list) => list.map((m) => (m.id === id ? { ...m, ...fn(m) } : m)));
  const setMedicalMemberClass: WelfareStateSlice['setMedicalMemberClass'] = (id, classId) => patchMember(id, () => ({ classId }));
  const setMedicalMemberStatus: WelfareStateSlice['setMedicalMemberStatus'] = (id, status) => patchMember(id, () => ({ status }));
  const addMedicalDependant: WelfareStateSlice['addMedicalDependant'] = (id, dep) => patchMember(id, (m) => ({ dependants: [...m.dependants, { ...dep, id: uid('dp') }] }));
  const removeMedicalDependant: WelfareStateSlice['removeMedicalDependant'] = (id, depId) => patchMember(id, (m) => ({ dependants: m.dependants.filter((x) => x.id !== depId) }));

  const renewMedicalScheme: WelfareStateSlice['renewMedicalScheme'] = (id, pct) => {
    setSchemes((list) =>
      list.map((s) =>
        s.id === id
          ? {
              ...s,
              history: [{ startOn: s.startOn, endOn: s.endOn, renewedOn: today, premiumChangePct: pct }, ...s.history],
              startOn: addYears(s.startOn, 1),
              endOn: addYears(s.endOn, 1),
              classes: s.classes.map((c) => ({ ...c, premiumPerMember: Math.round((c.premiumPerMember * (1 + pct / 100)) / 100) * 100 }))
            }
          : s
      )
    );
    toast({ type: 'success', title: 'Policy renewed', message: `New period recorded${pct ? `; premiums ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}%` : ''}.` });
  };

  const addMedicalClaim: WelfareStateSlice['addMedicalClaim'] = (draft) => {
    if (!draft.staffId || !draft.provider.trim() || !(draft.claimed > 0)) {
      toast({ type: 'warning', title: 'Claim not saved', message: 'Choose the member, provider and amount claimed.' });
      return null;
    }
    const c: MedicalClaim = { ...draft, id: uid('mc'), ref: nextRef('MC', medicalClaims.map((x) => x.ref), year), orgId: medicalMembers.find((m) => m.staffId === draft.staffId && m.schemeId === draft.schemeId)?.orgId ?? orgOf(draft.staffId), submittedOn: today, status: 'SUBMITTED' };
    setClaims((list) => [c, ...list]);
    toast({ type: 'success', title: `${c.ref} submitted`, message: `${CLAIM_TYPE_LABEL[c.type]} claim for ${nameOf(c.staffId)}.` });
    return c;
  };
  const patchClaim = (id: string, p: Partial<MedicalClaim>) => setClaims((list) => list.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const sendMedicalClaim: WelfareStateSlice['sendMedicalClaim'] = (id, insurerRef) => patchClaim(id, { status: 'WITH_INSURER', insurerRef: insurerRef.trim() || undefined });
  const payMedicalClaim: WelfareStateSlice['payMedicalClaim'] = (id, approved) => patchClaim(id, { status: 'PAID', approved, paidOn: today });
  const rejectMedicalClaim: WelfareStateSlice['rejectMedicalClaim'] = (id, reason) => patchClaim(id, { status: 'REJECTED', approved: 0, rejectionReason: reason.trim() || 'Rejected by insurer', paidOn: today });

  const reimburseMedicalClaim: WelfareStateSlice['reimburseMedicalClaim'] = (id) => {
    const c = medicalClaims.find((x) => x.id === id);
    if (!c || c.status !== 'PAID' || !c.outOfPocket || c.reimbursedPeriod || !c.approved) return false;
    const period = d.payrollOpenPeriod.key;
    const n = d.postPayItems(
      [{ staffId: c.staffId, componentId: 'REIMBURSEMENT', amount: c.approved, period, recurring: false, reference: c.ref, note: `Medical claim refund — ${CLAIM_TYPE_LABEL[c.type]}, ${c.provider}`, source: 'Manual' }],
      WELFARE_ACTOR
    );
    if (!n) return false;
    patchClaim(id, { reimbursedPeriod: period });
    toast({ type: 'success', title: 'Refund posted to payroll', message: `KES ${c.approved.toLocaleString()} to ${nameOf(c.staffId)} in ${d.payrollOpenPeriod.label}.` });
    return true;
  };

  /* ---------------- Welfare ---------------- */
  const setWelfarePolicyAmount: WelfareStateSlice['setWelfarePolicyAmount'] = (type, optionId, amount) =>
    setPolicies((list) => list.map((p) => (p.type === type ? { ...p, options: p.options.map((o) => (o.id === optionId ? { ...o, amount: Math.max(0, Math.round(amount)) } : o)) } : p)));

  const addWelfareRequest: WelfareStateSlice['addWelfareRequest'] = (draft) => {
    const opt = welfarePolicies.find((p) => p.type === draft.type)?.options.find((o) => o.id === draft.optionId);
    if (!draft.staffId || !opt) {
      toast({ type: 'warning', title: 'Request not saved', message: 'Choose the employee and the entitlement.' });
      return null;
    }
    const r: WelfareRequest = {
      ...draft,
      amount: draft.amount ?? opt.amount,
      id: uid('wr'),
      ref: nextRef('WF', welfareRequests.map((x) => x.ref), year),
      orgId: orgOf(draft.staffId),
      requestedOn: today,
      status: 'PENDING'
    };
    setRequests((list) => [r, ...list]);
    toast({ type: 'success', title: `${r.ref} received`, message: `${nameOf(r.staffId)} — KES ${r.amount.toLocaleString()} awaiting approval.` });
    return r;
  };

  const decideWelfareRequest: WelfareStateSlice['decideWelfareRequest'] = (id, approve, reason) => {
    if (!approve && !reason?.trim()) {
      toast({ type: 'warning', title: 'Give a reason', message: 'The employee is told why the request was declined.' });
      return false;
    }
    setRequests((list) => list.map((r) => (r.id === id ? { ...r, status: approve ? 'APPROVED' : 'DECLINED', decidedBy: WELFARE_ACTOR, decidedOn: today, reason: reason?.trim() || undefined } : r)));
    return true;
  };

  const payWelfareRequest: WelfareStateSlice['payWelfareRequest'] = (id, via) => {
    const r = welfareRequests.find((x) => x.id === id);
    if (!r || r.status !== 'APPROVED') return false;
    const label = welfarePolicies.find((p) => p.type === r.type)?.label ?? r.type;
    let period: string | undefined;
    if (via === 'PAYROLL') {
      period = d.payrollOpenPeriod.key;
      const n = d.postPayItems(
        [
          {
            staffId: r.staffId,
            componentId: r.type === 'LONG_SERVICE' ? 'LONG_SERVICE' : 'REIMBURSEMENT',
            amount: r.amount,
            period,
            recurring: false,
            reference: r.ref,
            note: `Welfare: ${label}${r.beneficiaryName ? ` — ${r.beneficiaryName}` : ''}`,
            source: 'Manual'
          }
        ],
        WELFARE_ACTOR
      );
      if (!n) return false;
    }
    setRequests((list) => list.map((x) => (x.id === id ? { ...x, status: 'PAID', paidVia: via, payPeriod: period, paidOn: today } : x)));
    d.logEmployeeEdit(r.staffId, [{ action: `${label} of KES ${r.amount.toLocaleString()} paid ${via === 'PAYROLL' ? `through payroll (${d.payrollOpenPeriod.label})` : 'from the welfare fund'} — ${r.ref}` }], WELFARE_ACTOR);
    toast({ type: 'success', title: via === 'PAYROLL' ? 'Posted to payroll' : 'Paid from welfare fund', message: `${r.ref}: KES ${r.amount.toLocaleString()} to ${nameOf(r.staffId)}${period ? ` in ${d.payrollOpenPeriod.label}` : ''}.` });
    return true;
  };

  /* ---------------- Events and CSR ---------------- */
  const addStaffEvent: WelfareStateSlice['addStaffEvent'] = (draft) => {
    const e: StaffEvent = { ...draft, id: uid('se'), orgId: d.selectedOrgId, tasks: [], actual: 0, attendees: 0, status: 'PLANNED' };
    setEvents((list) => [e, ...list]);
    toast({ type: 'success', title: 'Event added', message: `${e.name} on ${e.date}.` });
    return e;
  };
  const updateStaffEvent: WelfareStateSlice['updateStaffEvent'] = (id, patch) => setEvents((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const addEventTask: WelfareStateSlice['addEventTask'] = (id, t) => setEvents((list) => list.map((e) => (e.id === id ? { ...e, tasks: [...e.tasks, { ...t, id: uid('t'), done: false }] } : e)));
  const toggleEventTask: WelfareStateSlice['toggleEventTask'] = (id, taskId) =>
    setEvents((list) => list.map((e) => (e.id === id ? { ...e, tasks: e.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)) } : e)));
  const addCsrActivity: WelfareStateSlice['addCsrActivity'] = (draft) => {
    const a: CsrActivity = { ...draft, id: uid('csr'), orgId: d.selectedOrgId };
    setCsr((list) => [a, ...list]);
    toast({ type: 'success', title: 'CSR activity added', message: a.project });
    return a;
  };
  const updateCsrActivity: WelfareStateSlice['updateCsrActivity'] = (id, patch) => setCsr((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  return {
    welfareToday: today,
    erCases,
    addErCase,
    acknowledgeErCase,
    startErInvestigation,
    addErInterview,
    saveErFindings,
    recordErOutcome,
    escalateErCase,
    closeErCase,
    addErNote,
    logErAccess,
    medicalSchemes,
    medicalMembers,
    medicalClaims,
    enrolMedicalMember,
    setMedicalMemberClass,
    setMedicalMemberStatus,
    addMedicalDependant,
    removeMedicalDependant,
    renewMedicalScheme,
    addMedicalClaim,
    sendMedicalClaim,
    payMedicalClaim,
    rejectMedicalClaim,
    reimburseMedicalClaim,
    welfarePolicies,
    setWelfarePolicyAmount,
    welfareRequests,
    welfareFunds,
    addWelfareRequest,
    decideWelfareRequest,
    payWelfareRequest,
    staffEvents,
    addStaffEvent,
    updateStaffEvent,
    addEventTask,
    toggleEventTask,
    csrActivities,
    addCsrActivity,
    updateCsrActivity
  };
};
