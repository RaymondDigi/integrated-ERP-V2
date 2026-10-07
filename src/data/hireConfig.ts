/* Hire module (requisition → recruitment → onboarding → employee master): shared types and configuration. */

export type ReqStep = 'HOD' | 'HR' | 'FINANCE' | 'MD';

export const REQ_STEP_LABEL: Record<ReqStep, string> = {
  HOD: 'Head of department',
  HR: 'HR',
  FINANCE: 'Finance',
  MD: 'Managing director'
};

export interface ReqDecision {
  step: ReqStep | 'REQUESTER';
  by: string;
  byStaffId?: string;
  action: 'SUBMITTED' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'CANCELLED';
  comment?: string;
  at: string;
}

/** Approved positions and annual payroll budget for a department. */
export interface EstablishmentPlan {
  orgId: string;
  department: string;
  approved: number;
  budgetKes: number;
  note?: string;
  updatedBy?: string;
  updatedOn?: string;
}

export interface KnockOut {
  id: string;
  question: string;
  /** The answer a candidate must give to stay in the process */
  expected: boolean;
}

export interface Criterion {
  id: string;
  label: string;
  weight: number;
}

export interface Vacancy {
  id: string;
  orgId: string;
  requisitionId: string;
  title: string;
  department: string;
  branch: string;
  grade: string;
  contractType: string;
  positions: number;
  salaryKes: number;
  openedOn: string;
  closingDate: string;
  channels: string[];
  adText: string;
  status: 'OPEN' | 'ON_HOLD' | 'CLOSED' | 'FILLED';
  minYears: number;
  knockouts: KnockOut[];
  criteria: Criterion[];
  panel: string[];
  hiringManagerStaffId?: string;
}

export type PipelineStage = 'Applied' | 'Screened' | 'Shortlisted' | 'Interview' | 'Assessment' | 'Offer' | 'Hired' | 'Rejected' | 'Withdrawn';

export const PIPELINE: PipelineStage[] = ['Applied', 'Screened', 'Shortlisted', 'Interview', 'Assessment', 'Offer', 'Hired'];
export const CLOSED_STAGES: PipelineStage[] = ['Hired', 'Rejected', 'Withdrawn'];

export interface Interview {
  id: string;
  round: string;
  date: string;
  time: string;
  location: string;
  panel: string[];
  /** panelist staff ID → criterion ID → score 1–5 */
  scores: Record<string, Record<string, number>>;
  notes?: Record<string, string>;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
}

export type CheckKind = 'KRA_PIN' | 'GOOD_CONDUCT' | 'ACADEMIC' | 'REFERENCE_1' | 'REFERENCE_2' | 'MEDICAL';

export const CHECK_LABEL: Record<CheckKind, string> = {
  KRA_PIN: 'KRA PIN (iTax)',
  GOOD_CONDUCT: 'Certificate of good conduct',
  ACADEMIC: 'Academic verification',
  REFERENCE_1: 'Reference 1',
  REFERENCE_2: 'Reference 2',
  MEDICAL: 'Pre-employment medical'
};

export interface BackgroundCheck {
  kind: CheckKind;
  status: 'NOT_STARTED' | 'PENDING' | 'CLEAR' | 'FLAGGED' | 'WAIVED';
  note?: string;
  updatedOn?: string;
}

export interface Offer {
  ref: string;
  basic: number;
  grade: string;
  contractType: string;
  contractEndDate?: string;
  dailyRate?: number;
  startDate: string;
  probationMonths: number;
  status: 'PENDING_APPROVAL' | 'ISSUED' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN';
  aboveBand: boolean;
  preparedBy: string;
  preparedOn: string;
  approvedBy?: string;
  issuedOn?: string;
  expiresOn?: string;
  respondedOn?: string;
  declineReason?: string;
}

export interface CommEntry {
  at: string;
  channel: 'Email' | 'SMS' | 'Phone' | 'Portal';
  subject: string;
  body?: string;
  by: string;
}

export type TaskOwner = 'HR' | 'ICT' | 'Facilities' | 'Supervisor' | 'Finance';
export type TaskPhase = 'Pre-boarding' | 'Day 1' | 'Week 1' | 'Day 30' | 'Day 60' | 'Day 90';

export interface OnboardingTask {
  id: string;
  owner: TaskOwner;
  label: string;
  phase: TaskPhase;
  /** Days from the start date (negative = before day 1) */
  dueOffset: number;
  /** Must be done before the employee record is created */
  requiredForStart: boolean;
  done: boolean;
  doneBy?: string;
  doneOn?: string;
}

export interface InductionSession {
  id: string;
  title: string;
  facilitator: string;
  dayOffset: number;
  hours: number;
  attended: boolean | null;
}

/** Offer terms plus the personal and payment details collected during pre-boarding. */
export interface HireTerms {
  fullName: string;
  jobTitle: string;
  department: string;
  grade: string;
  contractType: string;
  contractEndDate?: string;
  basic: number;
  dailyRate?: number;
  probationMonths: number;
  supervisorStaffId?: string;
  buddyStaffId?: string;
  stationId?: string;
  gender?: 'Female' | 'Male' | 'Other';
  phone: string;
  personalEmail: string;
  nationalId: string;
  kraPin: string;
  nssfNo: string;
  shifNo: string;
  paymentMethod: 'BANK' | 'MPESA';
  bankName?: string;
  bankAccount?: string;
  mpesaPhone?: string;
  taxEmployment: 'PRIMARY' | 'SECONDARY';
}

export type ChangeKind = 'CONFIRM_PROBATION' | 'EXTEND_PROBATION' | 'RENEW_CONTRACT' | 'CONVERT_CONTRACT' | 'TRANSFER' | 'PROMOTION' | 'INCREMENT' | 'REGRADE';

export const CHANGE_LABEL: Record<ChangeKind, string> = {
  CONFIRM_PROBATION: 'Confirm probation',
  EXTEND_PROBATION: 'Extend probation',
  RENEW_CONTRACT: 'Renew contract',
  CONVERT_CONTRACT: 'Convert contract',
  TRANSFER: 'Transfer',
  PROMOTION: 'Promotion',
  INCREMENT: 'Salary increment',
  REGRADE: 'Regrade'
};

export interface EmployeeChange {
  id: string;
  orgId: string;
  staffId: string;
  staffName: string;
  kind: ChangeKind;
  summary: string;
  /** YYYY-MM for pay changes, YYYY-MM-DD otherwise */
  effectiveFrom: string;
  reason: string;
  payload: {
    newBasic?: number;
    previousBasic?: number;
    grade?: string;
    jobTitle?: string;
    department?: string;
    stationId?: string;
    supervisorStaffId?: string;
    contractType?: string;
    contractEndDate?: string;
    probationEndDate?: string;
  };
  requestedBy: string;
  requestedOn: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedBy?: string;
  decidedOn?: string;
  comment?: string;
}

export interface HireAuditEntry {
  at: string;
  by: string;
  area: 'Requisition' | 'Vacancy' | 'Candidate' | 'Onboarding' | 'Employee' | 'Establishment';
  ref: string;
  action: string;
}

/* ------------------------------------------------------------------ configuration */

export interface GradeBand {
  grade: string;
  min: number;
  mid: number;
  max: number;
}

/** Monthly basic salary bands per job grade (KES). */
export const GRADE_BANDS: GradeBand[] = [
  { grade: 'JG-04 (General Worker)', min: 22_000, mid: 28_000, max: 36_000 },
  { grade: 'JG-06 (Skilled Operative)', min: 32_000, mid: 44_000, max: 56_000 },
  { grade: 'JG-08 (Technical Specialist)', min: 48_000, mid: 68_000, max: 95_000 },
  { grade: 'JG-10 (Supervisor)', min: 70_000, mid: 98_000, max: 135_000 },
  { grade: 'JG-12 (Manager)', min: 120_000, mid: 165_000, max: 220_000 },
  { grade: 'JG-14 (Senior Manager)', min: 200_000, mid: 320_000, max: 700_000 }
];

export const SOURCES = ['Company website', 'LinkedIn', 'BrighterMonday', 'Referral', 'Internal', 'Walk-in', 'University linkage'];
export const CHANNELS = ['Company website', 'LinkedIn', 'BrighterMonday', 'Staff notice board', 'Local radio', 'University career office'];

export const DEFAULT_CRITERIA: Criterion[] = [
  { id: 'tech', label: 'Technical knowledge', weight: 30 },
  { id: 'exp', label: 'Relevant experience', weight: 25 },
  { id: 'prob', label: 'Problem solving', weight: 20 },
  { id: 'comm', label: 'Communication', weight: 15 },
  { id: 'fit', label: 'Values and team fit', weight: 10 }
];

export const DEFAULT_KNOCKOUTS: KnockOut[] = [
  { id: 'ko-permit', question: 'Kenyan citizen or holds a valid work permit', expected: true },
  { id: 'ko-reloc', question: 'Able to work from the duty station', expected: true },
  { id: 'ko-notice', question: 'Can start within 30 days', expected: true }
];

/** Offer must score at least this on the interview, and the vacancy shortlist floor. */
export const OFFER_MIN_SCORE = 60;
export const REQUIRED_CHECKS: CheckKind[] = ['KRA_PIN', 'GOOD_CONDUCT', 'ACADEMIC', 'REFERENCE_1', 'REFERENCE_2'];
export const OFFER_VALID_DAYS = 7;
export const VACANCY_OPEN_DAYS = 21;
/** Requisitions above this annual cost always go through Finance. */
export const FINANCE_THRESHOLD_KES = 2_000_000;
/** Working days used to turn a daily rate into a monthly cost. */
export const DAYS_PER_MONTH = 26;

/* ------------------------------------------------------------------ onboarding templates */

const t = (owner: TaskOwner, label: string, phase: TaskPhase, dueOffset: number, requiredForStart = false) => ({ owner, label, phase, dueOffset, requiredForStart });

/** Checklist for a new hire; office roles get email and a laptop, site roles get PPE and biometric enrolment. */
export const onboardingTemplate = (opts: { casual: boolean; operational: boolean }): OnboardingTask[] =>
  [
    t('HR', 'Offer accepted and contract signed', 'Pre-boarding', -10, true),
    t('HR', 'National ID copy verified', 'Pre-boarding', -7, true),
    t('HR', 'KRA PIN certificate checked on iTax', 'Pre-boarding', -7, true),
    t('HR', 'NSSF number confirmed', 'Pre-boarding', -7, true),
    t('HR', 'SHIF registration confirmed', 'Pre-boarding', -7, true),
    t('HR', opts.casual ? 'M-Pesa number confirmed' : 'Bank or M-Pesa details verified', 'Pre-boarding', -5, true),
    t('HR', 'Next of kin and emergency contact recorded', 'Pre-boarding', -5),
    t('Finance', 'Payroll set-up: pay group, tax profile, statutory flags', 'Pre-boarding', -3, true),
    ...(opts.casual
      ? [t('ICT', 'Biometric enrolment and staff ID card', 'Pre-boarding', -2)]
      : [t('ICT', 'Email account and system access', 'Pre-boarding', -2), t('ICT', 'Laptop or device issued', 'Day 1', 0)]),
    opts.operational ? t('Facilities', 'PPE issued (boots, overalls, helmet)', 'Day 1', 0) : t('Facilities', 'Workstation and access card ready', 'Day 1', 0),
    t('Supervisor', 'Induction schedule shared', 'Pre-boarding', -3),
    t('Supervisor', 'Buddy assigned', 'Pre-boarding', -2),
    t('Supervisor', 'Welcome and site tour', 'Day 1', 0),
    t('HR', 'Policies and code of conduct acknowledged', 'Day 1', 0),
    t('Facilities', 'OSH site safety induction', 'Week 1', 2),
    t('Supervisor', 'Probation goals agreed', 'Week 1', 5),
    t('Supervisor', '30-day check-in', 'Day 30', 30),
    t('Supervisor', '60-day check-in', 'Day 60', 60),
    t('Supervisor', 'Probation review recommendation', 'Day 90', 85),
    t('HR', 'Onboarding survey and file closed', 'Day 90', 90)
  ].map((x, i) => ({ ...x, id: `T${String(i + 1).padStart(2, '0')}`, done: false }));

export const sessionTemplate = (hrName: string, oshName: string, supName: string): InductionSession[] => [
  { id: 'S1', title: 'Welcome and company overview', facilitator: hrName, dayOffset: 0, hours: 2, attended: null },
  { id: 'S2', title: 'OSH and fire safety', facilitator: oshName, dayOffset: 1, hours: 3, attended: null },
  { id: 'S3', title: 'Code of conduct and anti-harassment', facilitator: hrName, dayOffset: 2, hours: 1.5, attended: null },
  { id: 'S4', title: 'ESS portal, leave and payslips', facilitator: hrName, dayOffset: 3, hours: 1, attended: null },
  { id: 'S5', title: 'Department orientation', facilitator: supName, dayOffset: 4, hours: 4, attended: null }
];

