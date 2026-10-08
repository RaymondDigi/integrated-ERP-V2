import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { EmployeeRequisition, HREmployee, JobApplicant, OnboardingRecord, RequisitionLine, TenantOrganization } from '../types';
import {
  CHANGE_LABEL,
  DEFAULT_CRITERIA,
  DEFAULT_KNOCKOUTS,
  OFFER_MIN_SCORE,
  OFFER_VALID_DAYS,
  REQ_STEP_LABEL,
  VACANCY_OPEN_DAYS,
  type BackgroundCheck,
  type CheckKind,
  type CommEntry,
  type EmployeeChange,
  type EstablishmentPlan,
  type HireAuditEntry,
  type HireTerms,
  type Interview,
  type Offer,
  type PipelineStage,
  type ReqStep,
  type Vacancy
} from '../data/hireConfig';
import { INITIAL_EMPLOYEE_CHANGES, INITIAL_ESTABLISHMENT, INITIAL_VACANCIES } from '../data/hireSeed';
import {
  addDays,
  addMonths,
  approverCandidates,
  approverFor,
  bandPosition,
  budgetCheck,
  candidateScore,
  checksFor,
  deptHead,
  draftAd,
  employeeFromHire,
  establishmentRows,
  fmtDate,
  hrOfficer,
  interviewResult,
  isOperational,
  nextStaffIdFor,
  offerBlockers,
  onboardingProgress,
  onboardingTemplate,
  probationOf,
  screen,
  sessionTemplate,
  shortGrade,
  stageOf,
  termsGaps,
  todayIso,
  validateOffer
} from '../data/hireEngine';
import { basicFor, isCasual } from '../data/payrollEngine';
import type { PayItem } from '../data/payItems';
import { suspensionBlock } from '../data/hcmEngine';

type Toast = { type: 'success' | 'warning' | 'error' | 'info'; title: string; message: string };

export interface RequisitionDraft {
  title: string;
  department: string;
  branch: string;
  priority: 'Normal' | 'High' | 'Urgent';
  justification: string;
  lines: RequisitionLine[];
  requesterStaffId: string;
  vacancyReason: NonNullable<EmployeeRequisition['vacancyReason']>;
  replacingStaffId?: string;
}

export interface NewApplicant {
  vacancyId: string;
  candidateName: string;
  email: string;
  phone: string;
  gender?: JobApplicant['gender'];
  source: string;
  experienceYears: number;
  education?: string;
  location?: string;
  answers: Record<string, boolean>;
  internalStaffId?: string;
}

export interface OfferTerms {
  basic: number;
  dailyRate?: number;
  grade: string;
  contractType: string;
  contractEndDate?: string;
  startDate: string;
  probationMonths: number;
}

export type NewEmployeeChange = Pick<EmployeeChange, 'staffId' | 'kind' | 'effectiveFrom' | 'reason' | 'payload'> & { requestedBy?: string };

/** Hire module state and actions exposed through the app context. */
export interface HireStateSlice {
  vacancies: Vacancy[];
  tenantVacancies: Vacancy[];
  establishmentPlans: EstablishmentPlan[];
  employeeChanges: EmployeeChange[];
  hireAudit: HireAuditEntry[];
  /** Probation rules of the selected company */
  hireRules: { probationMonths: number; maxProbationMonths: number; hrName: string };
  saveRequisition: (draft: RequisitionDraft, submit: boolean, existingId?: string) => EmployeeRequisition | null;
  submitRequisition: (id: string) => void;
  /** Applies segregation of duties: the requester and earlier approvers cannot decide a later step. */
  decideRequisition: (id: string, action: 'APPROVE' | 'RETURN' | 'REJECT', actorStaffId: string, comment?: string) => boolean;
  cancelRequisition: (id: string) => void;
  saveEstablishment: (department: string, approved: number, budgetKes: number, note: string) => void;
  updateVacancy: (id: string, patch: Partial<Vacancy>) => void;
  addApplicant: (a: NewApplicant) => JobApplicant | null;
  screenApplicant: (id: string) => void;
  advanceApplicant: (id: string) => boolean;
  closeApplicant: (id: string, outcome: 'Rejected' | 'Withdrawn', reason: string) => void;
  scheduleInterview: (id: string, iv: Pick<Interview, 'round' | 'date' | 'time' | 'location' | 'panel'>) => boolean;
  /** Records an aptitude or skills test score; interviews need every vacancy test passed */
  recordTestScore: (id: string, test: string, score: number) => boolean;
  saveScores: (applicantId: string, interviewId: string, panelistStaffId: string, scores: Record<string, number>, note?: string) => void;
  updateCheck: (applicantId: string, kind: CheckKind, status: BackgroundCheck['status'], note?: string) => void;
  prepareOffer: (applicantId: string, terms: OfferTerms) => boolean;
  approveOffer: (applicantId: string, actorStaffId: string) => boolean;
  respondToOffer: (applicantId: string, accept: boolean, reason?: string) => void;
  logComm: (applicantId: string, entry: Omit<CommEntry, 'at' | 'by'>) => void;
  toggleOnboardingTask: (recId: string, taskId: string) => void;
  updateHireTerms: (recId: string, patch: Partial<HireTerms>) => void;
  setSessionAttendance: (recId: string, sessionId: string, attended: boolean | null) => void;
  /** Creates the employee record (staff ID, contract, pay, KYC) once pre-boarding is done. */
  activateHire: (recId: string) => HREmployee | null;
  requestEmployeeChange: (c: NewEmployeeChange) => EmployeeChange | null;
  decideEmployeeChange: (id: string, approve: boolean, actorStaffId: string, comment?: string) => boolean;
  /** Audit rows for a direct edit of employee details (no approval); sensitive rows carry old → new, masked. */
  logEmployeeEdit: (staffId: string, rows: { action: string; sensitive?: boolean }[], by?: string) => void;
}

interface Deps {
  requisitions: EmployeeRequisition[];
  setRequisitions: Dispatch<SetStateAction<EmployeeRequisition[]>>;
  candidates: JobApplicant[];
  setCandidates: Dispatch<SetStateAction<JobApplicant[]>>;
  onboardingRecords: OnboardingRecord[];
  setOnboardingRecords: Dispatch<SetStateAction<OnboardingRecord[]>>;
  hrEmployees: HREmployee[];
  addHrEmployee: (emp: Omit<HREmployee, 'id' | 'orgId'>) => HREmployee;
  updateHrEmployee: (staffId: string, patch: Partial<HREmployee>) => void;
  addToast: (t: Toast) => void;
  selectedOrgId: string;
  payrollOpenPeriod: { year: number; month: number; key: string; label: string };
  tenantOrganizations: TenantOrganization[];
  /** Posts pay items (acting allowance); optional so older callers still work */
  postPayItems?: (items: Omit<PayItem, 'id' | 'orgId' | 'postedBy' | 'postedOn' | 'status'>[], by?: string) => number;
}

const nextNo = (ids: string[], prefix: string) => {
  const n = Math.max(0, ...ids.filter((x) => x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length)) || 0)) + 1;
  return `${prefix}${String(n).padStart(3, '0')}`;
};

const LEGACY_FLAGS: ['contractSigned' | 'kraPinVerified' | 'nssfVerified' | 'shifVerified' | 'kitIssued', RegExp][] = [
  ['contractSigned', /contract signed/i],
  ['kraPinVerified', /KRA PIN/],
  ['nssfVerified', /NSSF/],
  ['shifVerified', /SHIF/],
  ['kitIssued', /PPE|workstation/i]
];

/** Keeps the older checklist flags (used by the side drawer) in step with the task list. */
const syncLegacy = (rec: OnboardingRecord): OnboardingRecord => {
  if (!rec.tasks) return rec;
  const out: OnboardingRecord = { ...rec };
  LEGACY_FLAGS.forEach(([k, re]) => {
    out[k] = rec.tasks!.some((x) => re.test(x.label) && x.done);
  });
  out.progressPercent = onboardingProgress(rec).pct;
  out.kycStatus = rec.tasks.filter((x) => x.requiredForStart).every((x) => x.done) ? 'VERIFIED' : 'PENDING_DOCS';
  return out;
};

export const useHireState = ({
  requisitions,
  setRequisitions,
  candidates,
  setCandidates,
  onboardingRecords,
  setOnboardingRecords,
  hrEmployees,
  addHrEmployee,
  updateHrEmployee,
  addToast,
  selectedOrgId,
  payrollOpenPeriod,
  tenantOrganizations,
  postPayItems
}: Deps): HireStateSlice => {
  // Open vacancies are on the careers portal; the first carries an aptitude test before interview
  const [vacancies, setVacancies] = useState<Vacancy[]>(() =>
    INITIAL_VACANCIES.map((v, i) => ({ ...v, published: v.published ?? v.status === 'OPEN', tests: v.tests ?? (i === 0 ? [{ name: 'Numerical reasoning', passMark: 60 }, { name: 'Tea process knowledge', passMark: 50 }] : undefined) }))
  );
  const [establishmentPlans, setPlans] = useState<EstablishmentPlan[]>(INITIAL_ESTABLISHMENT);
  const [employeeChanges, setChanges] = useState<EmployeeChange[]>(INITIAL_EMPLOYEE_CHANGES);
  const [hireAudit, setAudit] = useState<HireAuditEntry[]>([]);

  const tenant = tenantOrganizations.find((t) => t.id === selectedOrgId);
  const hr = hrOfficer(selectedOrgId, hrEmployees);
  const hireRules = useMemo(
    () => ({ probationMonths: tenant?.settings?.probation.defaultMonths ?? 3, maxProbationMonths: tenant?.settings?.probation.maxMonths ?? 12, hrName: hr?.fullName ?? 'HR office' }),
    [tenant, hr]
  );
  const me = hireRules.hrName;
  const nameOf = (staffId?: string) => hrEmployees.find((e) => e.staffId === staffId)?.fullName ?? staffId ?? '—';
  const fail = (title: string, message: string) => {
    addToast({ type: 'error', title, message });
    return false;
  };
  const audit = (area: HireAuditEntry['area'], ref: string, action: string, by = me) => setAudit((prev) => [{ at: new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }), by, area, ref, action }, ...prev]);

  const rowsFor = (orgId: string) => establishmentRows(orgId, hrEmployees, requisitions, candidates, onboardingRecords, establishmentPlans);
  const patchReq = (id: string, f: (r: EmployeeRequisition) => EmployeeRequisition) => setRequisitions((prev) => prev.map((r) => (r.id === id ? f(r) : r)));
  const patchCand = (id: string, f: (c: JobApplicant) => JobApplicant) => setCandidates((prev) => prev.map((c) => (c.id === id ? f(c) : c)));
  const patchRec = (id: string, f: (r: OnboardingRecord) => OnboardingRecord) => setOnboardingRecords((prev) => prev.map((r) => (r.id === id ? syncLegacy(f(r)) : r)));
  const withComm = (c: JobApplicant, subject: string, channel: CommEntry['channel'] = 'Email'): CommEntry[] => [...(c.comms ?? []), { at: todayIso(), channel, subject, by: me }];
  const withStage = (c: JobApplicant, stage: PipelineStage, note?: string) => ({ stage, stageLog: [...(c.stageLog ?? []), { stage, at: todayIso(), by: me, note }] });

  /* ---------------------------------------------------------------- requisitions */

  const validateDraft = (d: RequisitionDraft) => {
    const errors: string[] = [];
    if (!d.lines.length || d.lines.some((l) => !l.title.trim() || l.headcount < 1)) errors.push('Every position needs a title and a quantity of at least 1.');
    if (d.lines.some((l) => !l.monthlySalaryKes || l.monthlySalaryKes < 0)) errors.push('Every position needs a salary (or a daily rate for daily-rated roles).');
    if (!d.justification.trim()) errors.push('State why the positions are needed.');
    if (!d.requesterStaffId) errors.push('Choose who is requesting.');
    if (d.vacancyReason === 'Replacement' && !d.replacingStaffId) errors.push('Say who is being replaced.');
    return errors;
  };

  const saveRequisition = (d: RequisitionDraft, submit: boolean, existingId?: string) => {
    const errors = validateDraft(d);
    if (errors.length) {
      fail('Requisition not saved', errors.join(' '));
      return null;
    }
    const lines = d.lines.map((l) => ({ ...l, title: l.title.trim(), headcount: Number(l.headcount), monthlySalaryKes: Number(l.monthlySalaryKes) }));
    const headcount = lines.reduce((n, l) => n + l.headcount, 0);
    const grades = [...new Set(lines.map((l) => l.gradeScale))];
    const year = new Date().getFullYear();
    const existing = existingId ? requisitions.find((r) => r.id === existingId) : undefined;
    const id = existing?.id ?? nextNo(requisitions.map((r) => r.id), `REQ-${year}-`);
    const row = rowsFor(selectedOrgId).find((x) => x.department === d.department);
    const created: EmployeeRequisition = {
      ...existing,
      id,
      orgId: existing?.orgId ?? selectedOrgId,
      requisitionNo: id,
      title: d.title.trim() || (lines.length === 1 ? lines[0].title : `${lines[0].title} + ${lines.length - 1} more`),
      department: d.department,
      branch: d.branch,
      headcountRequired: headcount,
      currentHeadcount: row?.inPost ?? 0,
      maxHeadcountBudget: row?.approved ?? 0,
      status: submit ? 'PENDING_APPROVAL' : 'DRAFT',
      requester: nameOf(d.requesterStaffId),
      requesterStaffId: d.requesterStaffId,
      requestedDate: existing?.requestedDate ?? todayIso(),
      gradeScale: grades.length === 1 ? grades[0] : `${grades.length} grades`,
      estimatedBudgetKes: lines.reduce((n, l) => n + l.headcount * l.monthlySalaryKes, 0),
      justification: d.justification.trim(),
      priority: d.priority,
      lines,
      vacancyReason: d.vacancyReason,
      replacingStaffId: d.vacancyReason === 'Replacement' ? d.replacingStaffId : undefined,
      currentStep: submit ? 'HOD' : undefined,
      submittedDate: submit ? todayIso() : existing?.submittedDate,
      approvals: submit ? [...(existing?.approvals ?? []), { step: 'REQUESTER', by: nameOf(d.requesterStaffId), byStaffId: d.requesterStaffId, action: 'SUBMITTED', at: todayIso() }] : existing?.approvals
    };
    setRequisitions((prev) => (existing ? prev.map((r) => (r.id === id ? created : r)) : [created, ...prev]));
    audit('Requisition', id, submit ? 'Submitted for approval' : existing ? 'Draft updated' : 'Draft created', created.requester);
    if (submit) {
      const check = budgetCheck(created, rowsFor(created.orgId));
      const head = approverFor('HOD', created, hrEmployees);
      addToast({
        type: 'success',
        title: `${id} submitted`,
        message: `Routed to ${head?.fullName ?? 'the head of department'}. Approval path: ${check.steps.map((s) => REQ_STEP_LABEL[s]).join(' → ')}.`
      });
    } else addToast({ type: 'info', title: `${id} saved as draft`, message: 'Submit it when the positions and justification are final.' });
    return created;
  };

  const submitRequisition = (id: string) => {
    const r = requisitions.find((x) => x.id === id);
    if (!r || r.status !== 'DRAFT') return;
    saveRequisition(
      {
        title: r.title,
        department: r.department,
        branch: r.branch,
        priority: r.priority ?? 'Normal',
        justification: r.justification,
        lines: r.lines ?? [],
        requesterStaffId: r.requesterStaffId ?? '',
        vacancyReason: r.vacancyReason ?? 'New position',
        replacingStaffId: r.replacingStaffId
      },
      true,
      id
    );
  };

  const openVacancy = (r: EmployeeRequisition): Vacancy => {
    const l = r.lines?.[0];
    const salary = l?.monthlySalaryKes ?? r.estimatedBudgetKes / Math.max(1, r.headcountRequired);
    const closing = addDays(todayIso(), VACANCY_OPEN_DAYS);
    const manager = deptHead(r.orgId, r.department, hrEmployees);
    const hrp = hrOfficer(r.orgId, hrEmployees);
    return {
      id: r.id.replace('REQ', 'VAC'),
      orgId: r.orgId,
      requisitionId: r.id,
      title: (l?.title ?? r.title).replace(/ \+ \d+ more.*$/, ''),
      department: r.department,
      branch: r.branch,
      grade: l?.gradeScale ?? r.gradeScale,
      contractType: salary < 5_000 ? 'Daily-Rated Contract' : r.vacancyReason === 'Seasonal' ? 'Fixed-Term Contract' : 'Standard Employment Contract',
      positions: r.headcountRequired,
      salaryKes: salary,
      openedOn: todayIso(),
      closingDate: closing,
      channels: ['Company website', 'LinkedIn', 'BrighterMonday'],
      adText: draftAd(r, tenantOrganizations.find((t) => t.id === r.orgId)?.name ?? r.branch, closing),
      status: 'OPEN',
      minYears: l?.jobDescription?.minExperienceYears ?? 0,
      knockouts: DEFAULT_KNOCKOUTS,
      criteria: DEFAULT_CRITERIA,
      panel: [...new Set([manager?.staffId, r.requesterStaffId, hrp?.staffId].filter((x): x is string => !!x))].slice(0, 3),
      hiringManagerStaffId: manager?.staffId ?? r.requesterStaffId
    };
  };

  const decideRequisition = (id: string, action: 'APPROVE' | 'RETURN' | 'REJECT', actorStaffId: string, comment?: string) => {
    const r = requisitions.find((x) => x.id === id);
    if (!r || r.status !== 'PENDING_APPROVAL') return false;
    const step: ReqStep = r.currentStep ?? 'HOD';
    const actor = hrEmployees.find((e) => e.staffId === actorStaffId);
    if (!actor) return fail('Choose who is deciding', 'Pick the approver acting on this step.');
    if (actorStaffId === r.requesterStaffId) return fail('Segregation of duties', `${actor.fullName} raised ${r.id} and cannot approve it at any step.`);
    if ((r.approvals ?? []).some((a) => a.action === 'APPROVED' && a.byStaffId === actorStaffId))
      return fail('Segregation of duties', `${actor.fullName} already approved an earlier step of ${r.id}. Another approver must take the ${REQ_STEP_LABEL[step]} step.`);
    const allowed = approverCandidates(step, r, hrEmployees);
    if (!allowed.some((e) => e.staffId === actorStaffId))
      return fail('Not an approver for this step', `The ${REQ_STEP_LABEL[step]} step is decided by ${allowed.map((e) => e.fullName).join(' or ')}.`);
    if (action !== 'APPROVE' && !comment?.trim()) return fail('Reason needed', 'Say why the requisition is being returned or rejected.');
    const decision = { step, by: actor.fullName, byStaffId: actorStaffId, comment: comment?.trim() || undefined, at: todayIso() };
    if (action === 'RETURN') {
      patchReq(id, (x) => ({ ...x, status: 'DRAFT', currentStep: undefined, approvals: [...(x.approvals ?? []), { ...decision, action: 'RETURNED' }] }));
      audit('Requisition', id, `Returned to requester at ${REQ_STEP_LABEL[step]} step`, actor.fullName);
      addToast({ type: 'info', title: `${id} returned`, message: `${r.requester} can edit and resubmit it. Approvals start again from the head of department.` });
      return true;
    }
    if (action === 'REJECT') {
      patchReq(id, (x) => ({ ...x, status: 'REJECTED', currentStep: undefined, decidedDate: todayIso(), approvals: [...(x.approvals ?? []), { ...decision, action: 'REJECTED' }] }));
      audit('Requisition', id, `Rejected at ${REQ_STEP_LABEL[step]} step`, actor.fullName);
      addToast({ type: 'warning', title: `${id} rejected`, message: `${actor.fullName} rejected it at the ${REQ_STEP_LABEL[step]} step.` });
      return true;
    }
    const steps = budgetCheck(r, rowsFor(r.orgId)).steps;
    const next = steps[steps.indexOf(step) + 1];
    const approvals = [...(r.approvals ?? []), { ...decision, action: 'APPROVED' as const }];
    if (next) {
      const after = approverFor(next, { ...r, approvals }, hrEmployees);
      patchReq(id, (x) => ({ ...x, currentStep: next, approvals }));
      audit('Requisition', id, `Approved at ${REQ_STEP_LABEL[step]} step`, actor.fullName);
      addToast({ type: 'success', title: `${REQ_STEP_LABEL[step]} approval recorded`, message: `${id} now waits for ${REQ_STEP_LABEL[next]}${after ? ` (${after.fullName})` : ''}.` });
      return true;
    }
    const v = openVacancy(r);
    patchReq(id, (x) => ({ ...x, status: 'IN_RECRUITMENT', currentStep: undefined, decidedDate: todayIso(), approvals, vacancyId: v.id }));
    setVacancies((prev) => [v, ...prev.filter((x) => x.id !== v.id)]);
    audit('Requisition', id, 'Fully approved', actor.fullName);
    audit('Vacancy', v.id, `Opened from ${id}, closing ${fmtDate(v.closingDate)}`, actor.fullName);
    addToast({ type: 'success', title: `${id} approved — vacancy open`, message: `${v.id} "${v.title}" is advertised until ${fmtDate(v.closingDate)}. Edit the advert and channels in Recruitment.` });
    return true;
  };

  const cancelRequisition = (id: string) => {
    const r = requisitions.find((x) => x.id === id);
    if (!r || !['DRAFT', 'PENDING_APPROVAL'].includes(r.status)) return;
    patchReq(id, (x) => ({ ...x, status: 'CANCELLED', currentStep: undefined, approvals: [...(x.approvals ?? []), { step: 'REQUESTER', by: x.requester, byStaffId: x.requesterStaffId, action: 'CANCELLED', at: todayIso() }] }));
    audit('Requisition', id, 'Cancelled', r.requester);
    addToast({ type: 'info', title: `${id} cancelled`, message: 'It stays in the register for the record.' });
  };

  const saveEstablishment = (department: string, approved: number, budgetKes: number, note: string) => {
    if (approved < 0 || budgetKes < 0 || !note.trim()) {
      fail('Plan not saved', 'Approved positions and budget cannot be negative, and the change needs a reason.');
      return;
    }
    setPlans((prev) => [
      ...prev.filter((p) => !(p.orgId === selectedOrgId && p.department === department)),
      { orgId: selectedOrgId, department, approved, budgetKes, note: note.trim(), updatedBy: me, updatedOn: todayIso() }
    ]);
    audit('Establishment', department, `Set to ${approved} positions, KES ${budgetKes.toLocaleString()} a year — ${note.trim()}`);
    addToast({ type: 'success', title: 'Establishment updated', message: `${department}: ${approved} positions, KES ${budgetKes.toLocaleString()} a year.` });
  };

  /* ---------------------------------------------------------------- vacancies and candidates */

  const updateVacancy = (id: string, patch: Partial<Vacancy>) => {
    if (patch.criteria && patch.criteria.reduce((n, c) => n + c.weight, 0) !== 100) {
      fail('Weights must add up to 100', 'Adjust the scorecard weights before saving.');
      return;
    }
    setVacancies((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    audit('Vacancy', id, `Updated ${Object.keys(patch).join(', ')}`);
    addToast({ type: 'success', title: 'Vacancy updated', message: `${id} saved.` });
  };

  const addApplicant = (a: NewApplicant) => {
    const v = vacancies.find((x) => x.id === a.vacancyId);
    if (!a.candidateName.trim() || !a.phone.trim() || !/\S+@\S+\.\S+/.test(a.email)) {
      fail('Applicant not added', 'Name, a valid email and a phone number are needed.');
      return null;
    }
    if (candidates.some((c) => c.vacancyId === a.vacancyId && c.email.toLowerCase() === a.email.toLowerCase())) {
      fail('Duplicate application', `${a.email} has already applied for this vacancy.`);
      return null;
    }
    const n = Math.max(8800, ...candidates.map((c) => Number(c.id.replace(/\D/g, '')) || 0)) + 1;
    // Former employees are flagged so HR checks the exit reason before re-engaging
    const former = hrEmployees.find((e) => e.status === 'TERMINATED' && (e.email?.toLowerCase() === a.email.trim().toLowerCase() || e.phone === a.phone.trim()));
    const exitText = former?.history?.map((h) => `${h.kind} ${h.summary}`).join(' ') ?? '';
    const exEmployee = former ? { staffId: former.staffId, exitDate: former.exitDate, reason: former.history?.slice(-1)[0]?.kind, eligible: !/disciplin|dismiss|summary/i.test(exitText) } : undefined;
    const created: JobApplicant = {
      id: `CAND-${n}`,
      orgId: v?.orgId ?? selectedOrgId,
      candidateName: a.candidateName.trim(),
      email: a.email.trim(),
      phone: a.phone.trim(),
      appliedRole: v?.title ?? 'General application',
      stage: 'Applied',
      scorecardScore: 0,
      appliedDate: todayIso(),
      isInternOrAttachee: false,
      experienceYears: a.experienceYears,
      vacancyId: a.vacancyId,
      source: a.source,
      gender: a.gender,
      education: a.education,
      location: a.location,
      internalStaffId: a.internalStaffId,
      answers: a.answers,
      exEmployee,
      comms: [{ at: todayIso(), channel: 'Email', subject: 'Application received', by: me }]
    };
    setCandidates((prev) => [created, ...prev]);
    audit('Candidate', created.id, `Application logged for ${created.appliedRole}`);
    if (exEmployee)
      addToast({
        type: exEmployee.eligible ? 'info' : 'warning',
        title: 'Former employee',
        message: `${created.candidateName} worked here as ${exEmployee.staffId}${exEmployee.exitDate ? ` until ${fmtDate(exEmployee.exitDate)}` : ''}.${exEmployee.eligible ? '' : ' The exit was disciplinary — check before re-engaging.'}`
      });
    const s = screen(created, v);
    addToast({ type: 'success', title: 'Application logged', message: `${created.candidateName} → ${created.appliedRole}. Knock-out screen: ${s.pass ? 'passes' : `fails (${s.failures[0]})`}.` });
    return created;
  };

  const screenApplicant = (id: string) => {
    const c = candidates.find((x) => x.id === id);
    if (!c || stageOf(c) !== 'Applied') return;
    const v = vacancies.find((x) => x.id === c.vacancyId);
    const s = screen(c, v);
    if (s.unanswered.length) {
      fail('Screening incomplete', `Record the answer to: ${s.unanswered.join('; ')}.`);
      return;
    }
    if (s.pass) {
      patchCand(id, (x) => ({ ...x, ...withStage(x, 'Screened', 'Passed knock-out criteria'), comms: withComm(x, 'Application screened — under review', 'SMS') }));
      audit('Candidate', id, 'Passed screening');
      addToast({ type: 'success', title: 'Screened in', message: `${c.candidateName} meets every knock-out criterion.` });
    } else {
      const reason = `Knock-out: ${s.failures.join('; ')}`;
      patchCand(id, (x) => ({ ...x, ...withStage(x, 'Rejected', reason), outcomeReason: reason, comms: withComm(x, 'Outcome of your application — regret') }));
      audit('Candidate', id, reason);
      addToast({ type: 'warning', title: 'Screened out', message: `${c.candidateName}: ${s.failures.join('; ')}. A regret email was logged.` });
    }
  };

  const advanceApplicant = (id: string) => {
    const c = candidates.find((x) => x.id === id);
    if (!c) return false;
    const v = vacancies.find((x) => x.id === c.vacancyId);
    const stage = stageOf(c);
    if (stage === 'Applied') {
      screenApplicant(id);
      return true;
    }
    if (stage === 'Screened') {
      patchCand(id, (x) => ({ ...x, ...withStage(x, 'Shortlisted') }));
      audit('Candidate', id, 'Shortlisted');
      addToast({ type: 'success', title: 'Shortlisted', message: `${c.candidateName} is shortlisted. Schedule the interview next.` });
      return true;
    }
    if (stage === 'Shortlisted') return fail('Schedule the interview', 'Shortlisted candidates move to Interview when an interview is booked.');
    if (stage === 'Interview') {
      const done = (c.interviews ?? []).filter((i) => i.status === 'COMPLETED');
      if (!done.length) return fail('Scorecards incomplete', 'Every panelist must score the interview before references are taken.');
      const score = candidateScore(c, v) ?? 0;
      if (score < OFFER_MIN_SCORE) return fail('Below the offer threshold', `${score}% is under ${OFFER_MIN_SCORE}%. Reject the candidate or hold a second interview.`);
      patchCand(id, (x) => ({
        ...x,
        ...withStage(x, 'Assessment'),
        checks: checksFor(x).map((k) => (k.status === 'NOT_STARTED' && k.kind !== 'MEDICAL' ? { ...k, status: 'PENDING', updatedOn: todayIso() } : k)),
        comms: withComm(x, 'Request for referee contacts and certificate of good conduct')
      }));
      audit('Candidate', id, `Moved to references and checks (score ${score}%)`);
      addToast({ type: 'success', title: 'Checks started', message: `KRA PIN, good conduct, academic and two references requested for ${c.candidateName}.` });
      return true;
    }
    if (stage === 'Assessment') return fail('Prepare the offer', 'Use Prepare offer once every check is clear.');
    if (stage === 'Offer') return fail('Waiting for the candidate', 'Record the candidate’s acceptance or decline on the offer.');
    return false;
  };

  const closeApplicant = (id: string, outcome: 'Rejected' | 'Withdrawn', reason: string) => {
    const c = candidates.find((x) => x.id === id);
    if (!c || !reason.trim()) {
      fail('Reason needed', 'Record why the application is closed.');
      return;
    }
    patchCand(id, (x) => ({
      ...x,
      ...withStage(x, outcome, reason.trim()),
      outcomeReason: reason.trim(),
      offer: x.offer && ['PENDING_APPROVAL', 'ISSUED'].includes(x.offer.status) ? { ...x.offer, status: 'WITHDRAWN' } : x.offer,
      comms: outcome === 'Rejected' ? withComm(x, 'Outcome of your application — regret') : x.comms
    }));
    audit('Candidate', id, `${outcome}: ${reason.trim()}`);
    addToast({ type: 'info', title: outcome === 'Rejected' ? 'Application closed' : 'Candidate withdrawn', message: `${c.candidateName}: ${reason.trim()}` });
  };

  const recordTestScore = (id: string, test: string, score: number) => {
    const c = candidates.find((x) => x.id === id);
    const t = vacancies.find((v) => v.id === c?.vacancyId)?.tests?.find((x) => x.name === test);
    if (!c || !t) return fail('Test not found', 'Pick a test set on this vacancy.');
    if (!(score >= 0 && score <= 100)) return fail('Score 0 to 100', 'Enter the percentage score.');
    if (['Hired', 'Rejected', 'Withdrawn'].includes(stageOf(c))) return fail('Application closed', `${c.candidateName}'s application is closed.`);
    const passed = score >= t.passMark;
    const row = { test, score, passMark: t.passMark, passed, by: me, on: todayIso() };
    patchCand(id, (x) => ({ ...x, testResults: [...(x.testResults ?? []).filter((r) => r.test !== test), row] }));
    audit('Candidate', id, `${test}: ${score}% (${passed ? 'pass' : 'fail'}, pass mark ${t.passMark}%)`);
    addToast({ type: passed ? 'success' : 'warning', title: passed ? 'Test passed' : 'Below pass mark', message: `${c.candidateName}: ${test} ${score}% against ${t.passMark}%.` });
    return true;
  };

  const scheduleInterview = (id: string, data: Pick<Interview, 'round' | 'date' | 'time' | 'location' | 'panel'>) => {
    const c = candidates.find((x) => x.id === id);
    if (!c) return false;
    if (!['Shortlisted', 'Interview'].includes(stageOf(c))) return fail('Not shortlisted', 'Only shortlisted candidates can be invited to interview.');
    const tests = vacancies.find((v) => v.id === c.vacancyId)?.tests ?? [];
    const notPassed = tests.filter((t) => !c.testResults?.some((r) => r.test === t.name && r.passed));
    if (notPassed.length) return fail('Aptitude test first', `${c.candidateName} has not passed: ${notPassed.map((t) => t.name).join(', ')}.`);
    if (!data.date || data.date < todayIso()) return fail('Pick a date', 'The interview date must be today or later.');
    if (!data.panel.length) return fail('Panel needed', 'Add at least one panelist.');
    const clash = candidates.flatMap((x) => (x.interviews ?? []).filter((i) => i.status === 'SCHEDULED' && i.date === data.date && i.time === data.time && i.panel.some((p) => data.panel.includes(p))));
    if (clash.length) return fail('Panel clash', `A panelist already has an interview on ${fmtDate(data.date)} at ${data.time}.`);
    const n = candidates.reduce((m, x) => m + (x.interviews?.length ?? 0), 0) + 300;
    const iv: Interview = { ...data, id: `IV-${n}`, scores: {}, status: 'SCHEDULED' };
    patchCand(id, (x) => ({
      ...x,
      ...(stageOf(x) === 'Interview' ? {} : withStage(x, 'Interview')),
      interviews: [...(x.interviews ?? []), iv],
      comms: withComm(x, `Invitation to ${data.round.toLowerCase()} on ${fmtDate(data.date)} at ${data.time}`)
    }));
    audit('Candidate', id, `Interview booked ${data.date} ${data.time} with ${data.panel.map(nameOf).join(', ')}`);
    addToast({ type: 'success', title: 'Interview scheduled', message: `${c.candidateName}, ${fmtDate(data.date)} at ${data.time}. Invitation logged.` });
    return true;
  };

  const saveScores = (applicantId: string, interviewId: string, panelist: string, scores: Record<string, number>, note?: string) => {
    const c = candidates.find((x) => x.id === applicantId);
    const v = vacancies.find((x) => x.id === c?.vacancyId);
    const iv = c?.interviews?.find((i) => i.id === interviewId);
    if (!c || !iv) return;
    const criteria = v?.criteria ?? DEFAULT_CRITERIA;
    if (criteria.some((k) => !(scores[k.id] >= 1 && scores[k.id] <= 5))) {
      fail('Score every criterion', 'Each criterion needs a score from 1 to 5.');
      return;
    }
    const nextIv: Interview = { ...iv, scores: { ...iv.scores, [panelist]: scores }, notes: note ? { ...iv.notes, [panelist]: note } : iv.notes };
    const res = interviewResult(nextIv, criteria);
    if (res.complete) nextIv.status = 'COMPLETED';
    patchCand(applicantId, (x) => ({ ...x, interviews: (x.interviews ?? []).map((i) => (i.id === interviewId ? nextIv : i)), scorecardScore: res.complete && res.average !== null ? Math.round(res.average) : x.scorecardScore }));
    audit('Candidate', applicantId, `Scorecard from ${nameOf(panelist)}`);
    addToast({
      type: 'success',
      title: 'Scorecard saved',
      message: res.complete ? `All ${iv.panel.length} panelists have scored. Average ${res.average}% — ${res.recommendation.toLowerCase()}.` : `${res.panelists.filter((p) => p.pct !== null).length} of ${iv.panel.length} panelists have scored.`
    });
  };

  const updateCheck = (applicantId: string, kind: CheckKind, status: BackgroundCheck['status'], note?: string) => {
    patchCand(applicantId, (x) => ({ ...x, checks: checksFor(x).map((k) => (k.kind === kind ? { ...k, status, note: note ?? k.note, updatedOn: todayIso() } : k)) }));
    audit('Candidate', applicantId, `${kind.replace('_', ' ').toLowerCase()} check: ${status.toLowerCase()}`);
    if (status === 'FLAGGED') addToast({ type: 'warning', title: 'Check flagged', message: 'An offer cannot be made until the flag is resolved or the candidate is closed.' });
  };

  const prepareOffer = (applicantId: string, t: OfferTerms) => {
    const c = candidates.find((x) => x.id === applicantId);
    if (!c) return false;
    const v = vacancies.find((x) => x.id === c.vacancyId);
    if (stageOf(c) !== 'Assessment' && !(stageOf(c) === 'Offer' && c.offer?.status === 'PENDING_APPROVAL')) return fail('Not ready for an offer', 'Offers are made after references and checks.');
    const blockers = offerBlockers(c, v);
    if (blockers.length) return fail('Offer blocked', blockers.join(' '));
    if (v) {
      const left = v.positions - candidates.filter((x) => x.vacancyId === v.id && stageOf(x) === 'Hired').length;
      const out = candidates.filter((x) => x.vacancyId === v.id && x.id !== c.id && x.offer?.status === 'ISSUED').length;
      if (left - out <= 0) return fail('No position left', `${v.title} has ${v.positions} position${v.positions === 1 ? '' : 's'}; ${v.positions - left} filled and ${out} offer${out === 1 ? '' : 's'} out.`);
    }
    const casual = t.contractType === 'Daily-Rated Contract';
    const check = validateOffer(t, { casual, maxProbation: hireRules.maxProbationMonths });
    if (casual && !(t.dailyRate && t.dailyRate > 0)) check.errors.push('Enter the daily rate.');
    if (check.errors.length) return fail('Offer not saved', check.errors.join(' '));
    const ref = c.offer?.ref ?? nextNo(candidates.map((x) => x.offer?.ref ?? ''), `OFR-${new Date().getFullYear()}-`);
    const offer: Offer = {
      ref,
      ...t,
      basic: casual ? 0 : t.basic,
      status: check.aboveBand ? 'PENDING_APPROVAL' : 'ISSUED',
      aboveBand: check.aboveBand,
      preparedBy: me,
      preparedOn: todayIso(),
      issuedOn: check.aboveBand ? undefined : todayIso(),
      expiresOn: check.aboveBand ? undefined : addDays(todayIso(), OFFER_VALID_DAYS)
    };
    patchCand(applicantId, (x) => ({
      ...x,
      ...(stageOf(x) === 'Offer' ? {} : withStage(x, 'Offer')),
      offer,
      comms: check.aboveBand ? x.comms : withComm(x, `Offer of employment ${ref}`)
    }));
    audit('Candidate', applicantId, check.aboveBand ? `Offer ${ref} above band — sent for approval` : `Offer ${ref} issued`);
    addToast(
      check.aboveBand
        ? { type: 'warning', title: 'Above the grade band', message: `KES ${t.basic.toLocaleString()} is above the ${shortGrade(t.grade)} maximum of KES ${check.band!.max.toLocaleString()}. The managing director must approve before it is issued.` }
        : { type: 'success', title: `Offer ${ref} issued`, message: `${c.candidateName}: ${casual ? `KES ${t.dailyRate}/day` : `KES ${t.basic.toLocaleString()}`}, starting ${fmtDate(t.startDate)}. Valid ${OFFER_VALID_DAYS} days.` }
    );
    return true;
  };

  const approveOffer = (applicantId: string, actorStaffId: string) => {
    const c = candidates.find((x) => x.id === applicantId);
    if (!c?.offer || c.offer.status !== 'PENDING_APPROVAL') return false;
    const actor = hrEmployees.find((e) => e.staffId === actorStaffId);
    const v = vacancies.find((x) => x.id === c.vacancyId);
    const allowed = approverCandidates('MD', { orgId: c.orgId, department: v?.department ?? '' }, hrEmployees);
    if (!actor || !allowed.some((e) => e.staffId === actorStaffId)) return fail('Managing director approval', `Above-band offers are approved by ${allowed.map((e) => e.fullName).join(' or ')}.`);
    if (actor.fullName === c.offer.preparedBy) return fail('Segregation of duties', 'The person who prepared the offer cannot approve it.');
    patchCand(applicantId, (x) => ({
      ...x,
      offer: { ...x.offer!, status: 'ISSUED', approvedBy: actor.fullName, issuedOn: todayIso(), expiresOn: addDays(todayIso(), OFFER_VALID_DAYS) },
      comms: withComm(x, `Offer of employment ${x.offer!.ref}`)
    }));
    audit('Candidate', applicantId, `Above-band offer approved`, actor.fullName);
    addToast({ type: 'success', title: 'Offer approved and issued', message: `${actor.fullName} approved ${c.offer.ref}; it has been sent to ${c.candidateName}.` });
    return true;
  };

  const respondToOffer = (applicantId: string, accept: boolean, reason?: string) => {
    const c = candidates.find((x) => x.id === applicantId);
    if (!c?.offer || c.offer.status !== 'ISSUED') return;
    if (!accept) {
      const why = reason?.trim() || 'Not given';
      patchCand(applicantId, (x) => ({ ...x, ...withStage(x, 'Withdrawn', `Declined the offer: ${why}`), outcomeReason: `Declined the offer: ${why}`, offer: { ...x.offer!, status: 'DECLINED', respondedOn: todayIso(), declineReason: why } }));
      audit('Candidate', applicantId, `Offer ${c.offer.ref} declined: ${why}`);
      addToast({ type: 'warning', title: 'Offer declined', message: `${c.candidateName} declined (${why}). The position is open again for the next candidate.` });
      return;
    }
    const v = vacancies.find((x) => x.id === c.vacancyId);
    const o = c.offer;
    const casual = o.contractType === 'Daily-Rated Contract';
    const sup = v?.hiringManagerStaffId ?? deptHead(c.orgId, v?.department ?? '', hrEmployees)?.staffId;
    const hrp = hrOfficer(c.orgId, hrEmployees)?.fullName ?? me;
    const osh = hrEmployees.find((e) => e.orgId === c.orgId && /QHSE|OSH/i.test(e.jobTitle))?.fullName ?? hrp;
    const recId = nextNo(onboardingRecords.map((r) => r.id), `ONB-${new Date().getFullYear()}-`);
    const rec: OnboardingRecord = syncLegacy({
      id: recId,
      orgId: c.orgId,
      employeeName: c.candidateName,
      role: v?.title ?? c.appliedRole,
      branch: v?.branch ?? '',
      department: v?.department,
      kycStatus: 'PENDING_DOCS',
      kraPinVerified: false,
      nssfVerified: false,
      shifVerified: false,
      kitIssued: false,
      contractSigned: false,
      probationEndDate: o.probationMonths ? addDays(addMonths(o.startDate, o.probationMonths), -1) : '',
      progressPercent: 0,
      applicantId,
      vacancyId: v?.id,
      startDate: o.startDate,
      status: 'PRE_BOARDING',
      createdOn: todayIso(),
      tasks: onboardingTemplate({ casual, operational: isOperational(v?.department ?? '') }),
      sessions: sessionTemplate(hrp, osh, nameOf(sup)),
      terms: {
        fullName: c.candidateName,
        jobTitle: v?.title.replace(/ \(daily-rated\)$/, '') ?? c.appliedRole,
        department: v?.department ?? '',
        grade: o.grade,
        contractType: o.contractType,
        contractEndDate: o.contractEndDate,
        basic: o.basic,
        dailyRate: o.dailyRate,
        probationMonths: o.probationMonths,
        supervisorStaffId: sup,
        gender: c.gender,
        phone: c.phone,
        personalEmail: c.email,
        nationalId: '',
        kraPin: '',
        nssfNo: '',
        shifNo: '',
        paymentMethod: casual ? 'MPESA' : 'BANK',
        mpesaPhone: casual ? c.phone : undefined,
        taxEmployment: 'PRIMARY'
      }
    });
    patchCand(applicantId, (x) => ({ ...x, ...withStage(x, 'Hired', `Accepted ${o.ref}`), offer: { ...o, status: 'ACCEPTED', respondedOn: todayIso() }, comms: withComm(x, 'Offer accepted — welcome pack and pre-boarding list') }));
    setOnboardingRecords((prev) => [rec, ...prev]);
    let filled = false;
    if (v) {
      const hired = candidates.filter((x) => x.vacancyId === v.id && stageOf(x) === 'Hired').length + 1;
      if (hired >= v.positions) {
        filled = true;
        setVacancies((prev) => prev.map((x) => (x.id === v.id ? { ...x, status: 'FILLED' } : x)));
        patchReq(v.requisitionId, (r) => ({ ...r, status: 'FILLED' }));
      }
    }
    audit('Candidate', applicantId, `Offer ${o.ref} accepted`);
    audit('Onboarding', recId, `Pre-boarding opened, start ${o.startDate}`);
    addToast({
      type: 'success',
      title: 'Offer accepted',
      message: `${c.candidateName} starts on ${fmtDate(o.startDate)}. Onboarding ${recId} is open with the pre-boarding checklist.${filled ? ` ${v!.id} is now filled.` : ''}`
    });
  };

  const logComm = (applicantId: string, entry: Omit<CommEntry, 'at' | 'by'>) => {
    if (!entry.subject.trim()) return;
    patchCand(applicantId, (x) => ({ ...x, comms: [...(x.comms ?? []), { ...entry, at: todayIso(), by: me }] }));
    addToast({ type: 'success', title: `${entry.channel} logged`, message: entry.subject });
  };

  /* ---------------------------------------------------------------- onboarding */

  const toggleOnboardingTask = (recId: string, taskId: string) => {
    const rec = onboardingRecords.find((r) => r.id === recId);
    const task = rec?.tasks?.find((x) => x.id === taskId);
    if (!rec || !task || rec.status === 'COMPLETED' || rec.status === 'CANCELLED') return;
    const flip = (tasks: NonNullable<OnboardingRecord['tasks']>) => tasks.map((x) => (x.id === taskId ? { ...x, done: !x.done, doneBy: !x.done ? me : undefined, doneOn: !x.done ? todayIso() : undefined } : x));
    const completes = rec.status === 'FIRST_90_DAYS' && flip(rec.tasks!).every((x) => x.done);
    patchRec(recId, (r) => {
      const tasks = flip(r.tasks ?? []);
      const done = r.status === 'FIRST_90_DAYS' && tasks.every((x) => x.done);
      return { ...r, tasks, status: done ? 'COMPLETED' : r.status, completedOn: done ? todayIso() : r.completedOn };
    });
    audit('Onboarding', recId, `${task.done ? 'Reopened' : 'Done'}: ${task.label}`);
    if (completes) addToast({ type: 'success', title: 'Onboarding complete', message: `${rec.employeeName}'s 90-day onboarding is closed. Confirm probation from the employee master.` });
  };

  const updateHireTerms = (recId: string, patch: Partial<HireTerms>) => {
    patchRec(recId, (r) => ({ ...r, terms: r.terms ? { ...r.terms, ...patch } : r.terms }));
  };

  const setSessionAttendance = (recId: string, sessionId: string, attended: boolean | null) =>
    patchRec(recId, (r) => ({ ...r, sessions: (r.sessions ?? []).map((s) => (s.id === sessionId ? { ...s, attended } : s)) }));

  const activateHire = (recId: string) => {
    const rec = onboardingRecords.find((r) => r.id === recId);
    if (!rec?.terms || !rec.startDate || rec.status !== 'PRE_BOARDING') return null;
    if (rec.orgId !== selectedOrgId) {
      fail('Wrong company selected', 'Switch to the hiring company before creating the employee.');
      return null;
    }
    const blocking = onboardingProgress(rec).blocking;
    const gaps = termsGaps(rec.terms);
    if (blocking.length || gaps.length) {
      fail('Pre-boarding not finished', [blocking.length ? `Open tasks: ${blocking.map((x) => x.label).join('; ')}.` : '', gaps.length ? `Missing: ${gaps.join(', ')}.` : ''].join(' ').trim());
      return null;
    }
    const casual = !rec.terms.basic && !!rec.terms.dailyRate;
    const staffId = nextStaffIdFor(rec.orgId, hrEmployees, casual);
    const v = vacancies.find((x) => x.id === rec.vacancyId);
    const reqNo = requisitions.find((r) => r.id === v?.requisitionId)?.requisitionNo;
    const emp = addHrEmployee(employeeFromHire(rec, rec.terms, { staffId, branch: rec.branch || tenant?.name || '', by: me, reqNo }));
    patchRec(recId, (r) => ({ ...r, staffId, status: 'FIRST_90_DAYS', activatedOn: todayIso() }));
    if (rec.applicantId) patchCand(rec.applicantId, (x) => ({ ...x, comms: withComm(x, `Welcome — your staff ID is ${staffId}`, 'SMS') }));
    audit('Onboarding', recId, `Employee ${staffId} created; joins ${rec.startDate}`);
    audit('Employee', staffId, `Created from onboarding ${recId}`);
    addToast({
      type: 'info',
      title: 'Added to payroll and leave',
      message: `${staffId} is paid from ${fmtDate(rec.startDate)}${rec.startDate.slice(0, 7) === payrollOpenPeriod.key ? ` — ${payrollOpenPeriod.label} is pro-rated` : ''}. Leave accrues from the start date.`
    });
    return emp;
  };

  /* ---------------------------------------------------------------- employee changes */

  const PAY_KINDS: EmployeeChange['kind'][] = ['PROMOTION', 'INCREMENT', 'REGRADE', 'DEMOTION'];

  const validateChange = (e: HREmployee, c: NewEmployeeChange): string[] => {
    const errs: string[] = [];
    const p = c.payload;
    if (!c.reason.trim()) errs.push('Give a reason.');
    if (PAY_KINDS.includes(c.kind)) {
      if (isCasual(e)) errs.push('Daily-rated staff are not on a salary grade; change their rate on the contract instead.');
      if (!/^\d{4}-\d{2}$/.test(c.effectiveFrom)) errs.push('Pick the payroll month it takes effect.');
      else if (c.effectiveFrom < payrollOpenPeriod.key) errs.push(`Pay changes start from ${payrollOpenPeriod.label} or later — paid months cannot change.`);
      if (!p.newBasic || p.newBasic <= 0) errs.push('Enter the new basic salary.');
      const grade = p.grade ?? e.grade;
      if (grade && p.newBasic && bandPosition(p.newBasic, grade) === 'below') errs.push(`KES ${p.newBasic.toLocaleString()} is below the ${shortGrade(grade)} band.`);
      if (c.kind === 'PROMOTION' && !p.jobTitle?.trim()) errs.push('A promotion needs the new job title.');
      if (c.kind === 'INCREMENT' && p.newBasic && p.previousBasic && p.newBasic <= p.previousBasic) errs.push('An increment must raise the basic salary.');
    }
    if (c.kind === 'TRANSFER' && !p.department && !p.stationId && !p.supervisorStaffId) errs.push('Choose the new department, site or supervisor.');
    if (c.kind === 'TRANSFER' && p.department === e.department && !p.stationId && p.supervisorStaffId === e.reportsToStaffId) errs.push('Nothing changes.');
    const prob = probationOf(e, hireRules.probationMonths, hireRules.maxProbationMonths);
    if (c.kind === 'CONFIRM_PROBATION' && (!prob.applies || prob.status === 'CONFIRMED')) errs.push('This employee is not on probation.');
    if (c.kind === 'EXTEND_PROBATION') {
      if (!prob.applies || prob.status === 'CONFIRMED') errs.push('This employee is not on probation.');
      else if (!p.probationEndDate || p.probationEndDate <= prob.end!) errs.push('The new end date must be after the current one.');
      else if (p.probationEndDate > prob.maxEnd!) errs.push(`Probation cannot run past ${fmtDate(prob.maxEnd)} (${hireRules.maxProbationMonths} months from joining).`);
    }
    if (c.kind === 'RENEW_CONTRACT' && (!p.contractEndDate || (e.contractEndDate && p.contractEndDate <= e.contractEndDate))) errs.push('The new end date must be after the current contract end.');
    if (c.kind === 'CONVERT_CONTRACT') {
      if (isCasual(e)) errs.push('Daily-rated contracts convert through a new hire with a salary.');
      if (!p.contractType || p.contractType === e.contractType) errs.push('Choose a different contract type.');
    }
    if (c.kind === 'DEMOTION') {
      if (p.newBasic && p.previousBasic && p.newBasic >= p.previousBasic) errs.push('A demotion must lower the basic salary.');
      if (!p.caseRef?.trim()) errs.push('Quote the disciplinary or performance case behind the demotion.');
    }
    if (c.kind !== 'REHIRE' && e.status === 'TERMINATED') errs.push(`${e.fullName} has left — use Re-hire.`);
    if (c.kind === 'REASSIGNMENT' && !p.duties?.trim()) errs.push('Describe the new duties.');
    if (c.kind === 'ACTING') {
      if (!p.actingTitle?.trim()) errs.push('Give the post they will act in.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.effectiveFrom)) errs.push('Pick the first day of acting.');
      else if (!p.actingTo || p.actingTo <= c.effectiveFrom) errs.push('The acting end date must be after the start.');
      else if (addMonths(c.effectiveFrom, 6) < p.actingTo) errs.push('An acting appointment runs for at most 6 months; renew it after review.');
      if (p.allowance !== undefined && p.allowance < 0) errs.push('The acting allowance cannot be negative.');
      if (p.actingForStaffId === e.staffId) errs.push('An employee cannot act for themselves.');
    }
    if (c.kind === 'REHIRE') {
      if (e.status !== 'TERMINATED') errs.push(`${e.fullName} is still employed — only leavers can be re-hired.`);
      if (!p.startDate) errs.push('Pick the new start date.');
      else if (e.exitDate && p.startDate <= e.exitDate) errs.push('The new start date must be after the last exit.');
      if (!p.contractType) errs.push('Choose the contract for the new engagement.');
    }
    if (employeeChanges.some((x) => x.staffId === e.staffId && x.kind === c.kind && x.status === 'PENDING')) errs.push(`A ${CHANGE_LABEL[c.kind].toLowerCase()} for ${e.fullName} is already waiting for approval.`);
    return errs;
  };

  const summaryOf = (e: HREmployee, c: NewEmployeeChange) => {
    const p = c.payload;
    switch (c.kind) {
      case 'PROMOTION':
        return `${e.jobTitle} → ${p.jobTitle}, ${shortGrade(p.grade ?? e.grade ?? '')}, KES ${(p.previousBasic ?? 0).toLocaleString()} → ${(p.newBasic ?? 0).toLocaleString()}`;
      case 'INCREMENT':
        return `KES ${(p.previousBasic ?? 0).toLocaleString()} → ${(p.newBasic ?? 0).toLocaleString()} (+${Math.round((((p.newBasic ?? 0) - (p.previousBasic ?? 1)) / (p.previousBasic ?? 1)) * 1000) / 10}%)`;
      case 'REGRADE':
        return `Regraded to ${shortGrade(p.grade ?? '')}, KES ${(p.previousBasic ?? 0).toLocaleString()} → ${(p.newBasic ?? 0).toLocaleString()}`;
      case 'TRANSFER':
        return [p.department && p.department !== e.department ? `${e.department} → ${p.department}` : '', p.stationId ? `site ${p.stationId.replace('st-khe-', '').replace('-', ' ')}` : '', p.supervisorStaffId ? `reports to ${nameOf(p.supervisorStaffId)}` : ''].filter(Boolean).join(', ');
      case 'EXTEND_PROBATION':
        return `Probation extended to ${fmtDate(p.probationEndDate)}`;
      case 'CONFIRM_PROBATION':
        return `Confirmed in post from ${fmtDate(c.effectiveFrom)}`;
      case 'RENEW_CONTRACT':
        return `Contract renewed to ${fmtDate(p.contractEndDate)}`;
      case 'CONVERT_CONTRACT':
        return `${e.contractType} → ${p.contractType}`;
      case 'DEMOTION':
        return `Demoted ${e.jobTitle}${p.jobTitle ? ` → ${p.jobTitle}` : ''}, KES ${(p.previousBasic ?? 0).toLocaleString()} → ${(p.newBasic ?? 0).toLocaleString()} (case ${p.caseRef ?? '—'})`;
      case 'REASSIGNMENT':
        return `Duties reassigned${p.jobTitle ? ` as ${p.jobTitle}` : ''}: ${p.duties ?? ''}`;
      case 'ACTING':
        return `Acting ${p.actingTitle}${p.actingForStaffId ? ` for ${nameOf(p.actingForStaffId)}` : ''} to ${fmtDate(p.actingTo)}${p.allowance ? `, allowance KES ${p.allowance.toLocaleString()}/month` : ''}`;
      case 'REHIRE':
        return `Re-hired from ${fmtDate(p.startDate)} on ${p.contractType}`;
    }
  };

  const requestEmployeeChange = (c: NewEmployeeChange) => {
    const e = hrEmployees.find((x) => x.staffId === c.staffId);
    if (!e) return null;
    const payload = { ...c.payload };
    if (PAY_KINDS.includes(c.kind) && /^\d{4}-\d{2}$/.test(c.effectiveFrom)) {
      const [y, m] = c.effectiveFrom.split('-').map(Number);
      const prev = new Date(y, m - 2, 1);
      payload.previousBasic = basicFor(e, prev.getFullYear(), prev.getMonth());
    }
    const full = { ...c, payload };
    const errs = validateChange(e, full);
    if (errs.length) {
      fail(`${CHANGE_LABEL[c.kind]} not submitted`, errs.join(' '));
      return null;
    }
    const created: EmployeeChange = {
      ...full,
      id: nextNo(employeeChanges.map((x) => x.id), `CHG-${new Date().getFullYear()}-`),
      orgId: e.orgId,
      staffName: e.fullName,
      summary: summaryOf(e, full) ?? CHANGE_LABEL[c.kind],
      reason: c.reason.trim(),
      requestedBy: c.requestedBy ?? me,
      requestedOn: todayIso(),
      status: 'PENDING'
    };
    setChanges((prev) => [created, ...prev]);
    audit('Employee', e.staffId, `${CHANGE_LABEL[c.kind]} requested (${created.id})`, created.requestedBy);
    const above = PAY_KINDS.includes(c.kind) && payload.newBasic && bandPosition(payload.newBasic, payload.grade ?? e.grade ?? '') === 'above';
    addToast({ type: 'success', title: `${CHANGE_LABEL[c.kind]} submitted`, message: `${created.id} for ${e.fullName} waits for approval${above ? ' — above the grade band, so the managing director must approve' : ''}.` });
    return created;
  };

  const decideEmployeeChange = (id: string, approve: boolean, actorStaffId: string, comment?: string) => {
    const ch = employeeChanges.find((x) => x.id === id);
    const actor = hrEmployees.find((x) => x.staffId === actorStaffId);
    const e = hrEmployees.find((x) => x.staffId === ch?.staffId);
    if (!ch || !e || ch.status !== 'PENDING') return false;
    if (!actor) return fail('Choose the approver', 'Pick who is deciding.');
    if (actor.fullName === ch.requestedBy) return fail('Segregation of duties', `${actor.fullName} requested ${ch.id} and cannot approve it.`);
    if (actor.staffId === ch.staffId) return fail('Segregation of duties', 'Employees cannot approve changes to their own record.');
    if (!/manager|director|chief|head/i.test(actor.jobTitle)) return fail('Not an approver', `${actor.fullName} (${actor.jobTitle}) cannot approve employee changes.`);
    const susp = suspensionBlock(actor, 'approve changes');
    if (susp) return fail('Approver suspended', susp);
    const p = ch.payload;
    if (approve && ch.kind === 'DEMOTION' && !/director|chief executive/i.test(actor.jobTitle)) return fail('Director approval', 'A demotion must be approved by a director or the managing director.');
    const above = PAY_KINDS.includes(ch.kind) && p.newBasic && bandPosition(p.newBasic, p.grade ?? e.grade ?? '') === 'above';
    if (approve && above && !/managing director|chief executive/i.test(actor.jobTitle)) return fail('Managing director approval', 'The new salary is above the grade band, so only the managing director can approve it.');
    if (!approve && !comment?.trim()) return fail('Reason needed', 'Say why the change is rejected.');
    if (approve && PAY_KINDS.includes(ch.kind) && ch.effectiveFrom < payrollOpenPeriod.key)
      return fail('Payroll period closed', `${fmtDate(ch.effectiveFrom)} has been paid. Reject this and resubmit from ${payrollOpenPeriod.label}.`);
    setChanges((prev) => prev.map((x) => (x.id === id ? { ...x, status: approve ? 'APPROVED' : 'REJECTED', decidedBy: actor.fullName, decidedOn: todayIso(), comment: comment?.trim() || undefined } : x)));
    audit('Employee', ch.staffId, `${CHANGE_LABEL[ch.kind]} ${ch.id} ${approve ? 'approved' : 'rejected'}`, actor.fullName);
    if (!approve) {
      addToast({ type: 'info', title: `${ch.id} rejected`, message: `${ch.staffName}'s record is unchanged.` });
      return true;
    }
    const history = [...(e.history ?? []), { date: ch.effectiveFrom.length === 7 ? `${ch.effectiveFrom}-01` : ch.effectiveFrom, kind: CHANGE_LABEL[ch.kind], summary: ch.summary, ref: ch.id, by: actor.fullName }];
    const patch: Partial<HREmployee> = { history };
    if (PAY_KINDS.includes(ch.kind)) {
      const oldBasic = p.previousBasic ?? e.basicSalaryKes;
      Object.assign(patch, {
        basicSalaryKes: p.newBasic,
        grade: p.grade ?? e.grade,
        jobTitle: p.jobTitle?.trim() || e.jobTitle,
        salaryHistory: [...(e.salaryHistory ?? []), { effectiveFrom: ch.effectiveFrom, basic: p.newBasic!, previous: oldBasic, reason: `${CHANGE_LABEL[ch.kind]}: ${ch.reason}`, ref: ch.id, by: actor.fullName }]
      });
    }
    if (ch.kind === 'TRANSFER') {
      Object.assign(patch, { department: p.department ?? e.department, stationId: p.stationId ?? e.stationId, reportsToStaffId: p.supervisorStaffId ?? e.reportsToStaffId });
      // Payroll reads the department per month, so earlier months keep the old one
      if (p.department && p.department !== e.department)
        Object.assign(patch, { departmentHistory: [...(e.departmentHistory ?? []), { effectiveFrom: ch.effectiveFrom.slice(0, 7), department: p.department, previous: e.department, ref: ch.id }] });
    }
    if (ch.kind === 'CONFIRM_PROBATION') Object.assign(patch, { probationStatus: 'CONFIRMED', probationEndDate: probationOf(e, hireRules.probationMonths).end });
    if (ch.kind === 'EXTEND_PROBATION') Object.assign(patch, { probationStatus: 'EXTENDED', probationEndDate: p.probationEndDate });
    if (ch.kind === 'RENEW_CONTRACT') Object.assign(patch, { contractEndDate: p.contractEndDate });
    if (ch.kind === 'CONVERT_CONTRACT') Object.assign(patch, { contractType: p.contractType, contractEndDate: p.contractType === 'Standard Employment Contract' ? undefined : p.contractEndDate });
    if (ch.kind === 'REASSIGNMENT' && p.jobTitle?.trim()) Object.assign(patch, { jobTitle: p.jobTitle.trim() });
    if (ch.kind === 'ACTING' && p.allowance && p.allowance > 0 && p.actingTo) {
      const from = ch.effectiveFrom.slice(0, 7) < payrollOpenPeriod.key ? payrollOpenPeriod.key : ch.effectiveFrom.slice(0, 7);
      postPayItems?.([{ staffId: ch.staffId, componentId: 'ACTING', amount: p.allowance, period: from, recurring: true, endPeriod: p.actingTo.slice(0, 7), reference: ch.id, note: `Acting ${p.actingTitle ?? ''}`, source: 'Manual' }], actor.fullName);
    }
    if (ch.kind === 'REHIRE' && p.startDate) {
      const prior = { from: e.joinedDate, to: e.exitDate ?? todayIso(), jobTitle: e.jobTitle, contractType: e.contractType, reason: e.history?.slice(-1)[0]?.kind };
      Object.assign(patch, {
        status: 'ACTIVE',
        previousServices: [...(e.previousServices ?? []), prior],
        joinedDate: p.startDate,
        contractStartDate: p.startDate,
        contractType: p.contractType ?? e.contractType,
        contractEndDate: p.contractEndDate,
        jobTitle: p.jobTitle?.trim() || e.jobTitle,
        exitDate: undefined,
        probationStatus: 'ON_PROBATION',
        probationEndDate: addMonths(p.startDate, hireRules.probationMonths),
        ...(p.newBasic ? { basicSalaryKes: p.newBasic } : {})
      });
    }
    updateHrEmployee(ch.staffId, patch);
    addToast({
      type: 'success',
      title: `${CHANGE_LABEL[ch.kind]} approved`,
      message: PAY_KINDS.includes(ch.kind)
        ? `${ch.staffName}: KES ${p.newBasic!.toLocaleString()} from ${fmtDate(ch.effectiveFrom)}. Payroll picks it up from that month; paid months keep the old salary.`
        : `${ch.staffName}: ${ch.summary}.`
    });
    return true;
  };

  const logEmployeeEdit = (staffId: string, rows: { action: string; sensitive?: boolean }[], by = me) =>
    [...rows].reverse().forEach((r) => audit('Employee', staffId, r.sensitive ? `Sensitive · ${r.action}` : r.action, by));

  return {
    vacancies,
    tenantVacancies: vacancies.filter((v) => v.orgId === selectedOrgId),
    establishmentPlans,
    employeeChanges,
    hireAudit,
    hireRules,
    saveRequisition,
    submitRequisition,
    decideRequisition,
    cancelRequisition,
    saveEstablishment,
    updateVacancy,
    addApplicant,
    screenApplicant,
    advanceApplicant,
    closeApplicant,
    scheduleInterview,
    recordTestScore,
    saveScores,
    updateCheck,
    prepareOffer,
    approveOffer,
    respondToOffer,
    logComm,
    toggleOnboardingTask,
    updateHireTerms,
    setSessionAttendance,
    activateHire,
    requestEmployeeChange,
    decideEmployeeChange,
    logEmployeeEdit
  };
};

