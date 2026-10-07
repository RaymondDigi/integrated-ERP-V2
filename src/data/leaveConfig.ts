import type { HREmployee, LeaveRequest } from '../types';

/**
 * Leave management configuration: leave types (versioned), the contract-type
 * entitlement matrix, tenure bands, the public holiday calendar, company policy
 * and the seed data the ledger is derived from (2025 closing balances, holiday
 * attendance, HR adjustments).
 */

export type BuiltInLeaveCode = 'AL' | 'SL' | 'ML' | 'PL' | 'CL' | 'ST' | 'CO' | 'UL';
/** Built-in codes plus any code HR creates (2–6 letters/digits). */
export type LeaveCode = BuiltInLeaveCode | (string & {});
export type LeaveTypeName = LeaveRequest['leaveType'];
export type ApprovalStep = 'SUPERVISOR' | 'HR';

/** The eight built-in types. Custom types live in the configuration; use leaveCodes()/leaveName() from the engine. */
export const LEAVE_CODES: BuiltInLeaveCode[] = ['AL', 'SL', 'ML', 'PL', 'CL', 'ST', 'CO', 'UL'];

export const LEAVE_NAME: Record<BuiltInLeaveCode, LeaveTypeName> = {
  AL: 'Annual Leave',
  SL: 'Sick Leave',
  ML: 'Maternity Leave',
  PL: 'Paternity Leave',
  CL: 'Compassionate Leave',
  ST: 'Study Leave',
  CO: 'Holiday Off',
  UL: 'Unpaid Leave'
};

export const LEAVE_CODE: Record<string, LeaveCode> = Object.fromEntries(Object.entries(LEAVE_NAME).map(([code, name]) => [name, code]));

/* ------------------------------------------------------------------ */
/* Leave types (§1) — every change is a new version, history is kept   */
/* ------------------------------------------------------------------ */

export type EntitlementMode = 'EARNED' | 'GRANTED' | 'AWARDED' | 'UNTRACKED';

export interface LeaveTypeVersion {
  code: LeaveCode;
  version: number;
  name: LeaveTypeName;
  description: string;
  isPaid: boolean;
  mode: EntitlementMode;
  isEarned: boolean;
  accrualFrequency: 'Monthly' | 'Quarterly' | 'Annually' | 'Per day worked' | 'None';
  isAnnual: boolean;
  yearBasis: 'Calendar' | 'Fiscal' | 'Anniversary';
  isAwarded: boolean;
  gender: 'All' | 'Male' | 'Female';
  allowCarryForward: boolean;
  /** null = company policy value */
  maxCarryForward: number | null;
  /** Months after the leave year starts; null = company policy value */
  carryForwardExpiryMonths: number | null;
  isForfeitable: boolean;
  forfeitureRule: 'Fixed date' | 'N days after award' | 'Year-end' | 'None';
  /** For "N days after award"; null = company policy value */
  forfeitAfterDays: number | null;
  deriveFromHolidays: boolean;
  countBasis: 'Working days' | 'Calendar days';
  allowHalfDay: boolean;
  minDays: number;
  maxDays: number;
  minNoticeDays: number;
  allowNegative: boolean;
  negativeLimit: number;
  /** Attachment needed when a request is longer than this many days; null = never */
  attachmentAfterDays: number | null;
  probationEligible: boolean;
  workflow: ApprovalStep[];
  effectiveFrom: string;
  effectiveTo?: string;
  status: 'Active' | 'Inactive';
  changedBy: string;
  changeNote: string;
  /** Created by HR (can be deleted while it has no requests) */
  custom?: boolean;
}

const base = {
  version: 1,
  isPaid: true,
  yearBasis: 'Calendar' as const,
  isAwarded: false,
  gender: 'All' as const,
  allowCarryForward: false,
  maxCarryForward: 0,
  carryForwardExpiryMonths: 0,
  isForfeitable: true,
  forfeitureRule: 'Year-end' as const,
  forfeitAfterDays: null,
  deriveFromHolidays: false,
  countBasis: 'Working days' as const,
  allowHalfDay: false,
  allowNegative: false,
  negativeLimit: 0,
  attachmentAfterDays: null,
  probationEligible: true,
  effectiveFrom: '2025-01-01',
  status: 'Active' as const,
  changedBy: 'Rose Chepkoech',
  changeNote: 'Initial set-up'
};

export const INITIAL_LEAVE_TYPE_VERSIONS: LeaveTypeVersion[] = [
  {
    ...base,
    code: 'AL',
    name: 'Annual Leave',
    description: 'Paid annual leave earned monthly. Carried days above the cap are forfeited at year-end.',
    mode: 'EARNED',
    isEarned: true,
    accrualFrequency: 'Monthly',
    isAnnual: true,
    allowCarryForward: true,
    maxCarryForward: null,
    carryForwardExpiryMonths: null,
    forfeitureRule: 'Fixed date',
    allowHalfDay: true,
    minDays: 0.5,
    maxDays: 15,
    minNoticeDays: 14,
    probationEligible: false,
    workflow: ['SUPERVISOR', 'HR'],
    effectiveTo: '2025-12-31'
  },
  {
    ...base,
    version: 2,
    code: 'AL',
    name: 'Annual Leave',
    description: 'Paid annual leave earned monthly. Carried days above the cap are forfeited at year-end.',
    mode: 'EARNED',
    isEarned: true,
    accrualFrequency: 'Monthly',
    isAnnual: true,
    allowCarryForward: true,
    maxCarryForward: null,
    carryForwardExpiryMonths: null,
    forfeitureRule: 'Fixed date',
    allowHalfDay: true,
    minDays: 0.5,
    maxDays: 21,
    minNoticeDays: 7,
    probationEligible: false,
    workflow: ['SUPERVISOR', 'HR'],
    effectiveFrom: '2026-01-01',
    changeNote: 'Notice cut to 7 days and longest request raised to 21 days (policy review, Dec 2025)'
  },
  {
    ...base,
    code: 'SL',
    name: 'Sick Leave',
    description: 'Certified sick leave on full pay, granted at the start of each leave year.',
    mode: 'GRANTED',
    isEarned: false,
    accrualFrequency: 'Annually',
    isAnnual: true,
    allowHalfDay: true,
    minDays: 0.5,
    maxDays: 14,
    minNoticeDays: 0,
    attachmentAfterDays: 2,
    workflow: ['SUPERVISOR']
  },
  {
    ...base,
    code: 'ML',
    name: 'Maternity Leave',
    description: 'Statutory maternity leave of three months on full pay.',
    mode: 'GRANTED',
    isEarned: false,
    accrualFrequency: 'Annually',
    isAnnual: true,
    gender: 'Female',
    countBasis: 'Calendar days',
    minDays: 1,
    maxDays: 90,
    minNoticeDays: 7,
    attachmentAfterDays: 0,
    workflow: ['SUPERVISOR', 'HR']
  },
  {
    ...base,
    code: 'PL',
    name: 'Paternity Leave',
    description: 'Statutory paternity leave of two weeks on full pay.',
    mode: 'GRANTED',
    isEarned: false,
    accrualFrequency: 'Annually',
    isAnnual: true,
    gender: 'Male',
    countBasis: 'Calendar days',
    minDays: 1,
    maxDays: 14,
    minNoticeDays: 0,
    attachmentAfterDays: 0,
    workflow: ['SUPERVISOR', 'HR']
  },
  {
    ...base,
    code: 'CL',
    name: 'Compassionate Leave',
    description: 'Paid leave for bereavement or a serious family emergency.',
    mode: 'GRANTED',
    isEarned: false,
    accrualFrequency: 'Annually',
    isAnnual: true,
    minDays: 1,
    maxDays: 5,
    minNoticeDays: 0,
    workflow: ['SUPERVISOR']
  },
  {
    ...base,
    code: 'ST',
    name: 'Study Leave',
    description: 'Paid leave for examinations of an approved course. Company policy, not statutory.',
    mode: 'GRANTED',
    isEarned: false,
    accrualFrequency: 'Annually',
    isAnnual: true,
    minDays: 1,
    maxDays: 10,
    minNoticeDays: 14,
    attachmentAfterDays: 0,
    probationEligible: false,
    workflow: ['SUPERVISOR', 'HR']
  },
  {
    ...base,
    code: 'CO',
    name: 'Holiday Off',
    description: 'Day off in lieu of a public holiday worked. Each credit expires on its own date.',
    mode: 'AWARDED',
    isEarned: false,
    accrualFrequency: 'None',
    isAnnual: false,
    isAwarded: true,
    forfeitureRule: 'N days after award',
    deriveFromHolidays: true,
    allowHalfDay: true,
    minDays: 0.5,
    maxDays: 5,
    minNoticeDays: 2,
    workflow: ['SUPERVISOR']
  },
  {
    ...base,
    code: 'UL',
    name: 'Unpaid Leave',
    description: 'Leave without pay. No balance is kept; annual leave accrual pauses while on unpaid leave.',
    isPaid: false,
    mode: 'UNTRACKED',
    isEarned: false,
    accrualFrequency: 'None',
    isAnnual: false,
    isForfeitable: false,
    forfeitureRule: 'None',
    minDays: 1,
    maxDays: 30,
    minNoticeDays: 7,
    probationEligible: false,
    workflow: ['SUPERVISOR', 'HR']
  },
  {
    ...base,
    code: 'SP',
    name: 'Sports Leave',
    description: 'Days off to represent the company in inter-company sports. Company policy.',
    mode: 'GRANTED',
    isEarned: false,
    accrualFrequency: 'Annually',
    isAnnual: true,
    minDays: 1,
    maxDays: 3,
    minNoticeDays: 3,
    probationEligible: false,
    workflow: ['SUPERVISOR'],
    effectiveFrom: '2026-01-01',
    changeNote: 'New company type for the 2026 corporate games',
    custom: true
  }
];

/* ------------------------------------------------------------------ */
/* Entitlement matrix (§6) and tenure bands (§7)                        */
/* ------------------------------------------------------------------ */

export type ContractColumn = 'PERMANENT' | 'FIXED_TERM' | 'PROBATION' | 'CASUAL';
export const CONTRACT_COLUMNS: { id: ContractColumn; label: string; maps: string }[] = [
  { id: 'PERMANENT', label: 'Permanent', maps: 'Standard Employment Contract (confirmed)' },
  { id: 'FIXED_TERM', label: 'Fixed-term', maps: 'Fixed-Term Contract (confirmed)' },
  { id: 'PROBATION', label: 'Probation', maps: 'Any monthly contract during probation' },
  { id: 'CASUAL', label: 'Casual / intern', maps: 'Daily-Rated and Output-Based Contracts' }
];

export interface EntitlementCell {
  /** Base days per leave year; null for awarded or untracked types */
  days: number | null;
  accrual: boolean;
  usableFrom: 'HIRE' | 'AFTER_PROBATION' | 'AFTER_MONTHS';
  usableAfterMonths?: number;
  note?: string;
}

export type EntitlementRow = Record<ContractColumn, EntitlementCell>;
/** One row per leave type code (built-in and custom). */
export type EntitlementMatrix = Record<string, EntitlementRow>;

export const cell = (days: number | null, accrual: boolean, usableFrom: EntitlementCell['usableFrom'] = 'HIRE', note?: string, usableAfterMonths?: number): EntitlementCell => ({
  days,
  accrual,
  usableFrom,
  note,
  usableAfterMonths
});

export const INITIAL_ENTITLEMENT_MATRIX: EntitlementMatrix = {
  AL: {
    PERMANENT: cell(21, true),
    FIXED_TERM: cell(21, true, 'HIRE', 'Pro-rated to contract length'),
    PROBATION: cell(21, true, 'AFTER_PROBATION', 'Accrues, usable once confirmed'),
    CASUAL: cell(0, false)
  },
  SL: { PERMANENT: cell(14, false), FIXED_TERM: cell(14, false), PROBATION: cell(7, false, 'AFTER_MONTHS', 'After 2 months of service', 2), CASUAL: cell(0, false) },
  ML: { PERMANENT: cell(90, false), FIXED_TERM: cell(90, false), PROBATION: cell(90, false), CASUAL: cell(90, false, 'HIRE', 'Per statute') },
  PL: { PERMANENT: cell(14, false), FIXED_TERM: cell(14, false), PROBATION: cell(14, false), CASUAL: cell(14, false, 'HIRE', 'Per statute') },
  CL: { PERMANENT: cell(5, false), FIXED_TERM: cell(3, false), PROBATION: cell(3, false), CASUAL: cell(0, false) },
  ST: { PERMANENT: cell(5, false, 'AFTER_MONTHS', 'After 12 months of service', 12), FIXED_TERM: cell(0, false), PROBATION: cell(0, false), CASUAL: cell(0, false) },
  CO: {
    PERMANENT: cell(null, false, 'HIRE', 'Awarded'),
    FIXED_TERM: cell(null, false, 'HIRE', 'Awarded'),
    PROBATION: cell(null, false, 'HIRE', 'Awarded'),
    CASUAL: cell(null, false, 'HIRE', 'Awarded')
  },
  UL: {
    PERMANENT: cell(null, false, 'HIRE', 'No balance'),
    FIXED_TERM: cell(null, false, 'HIRE', 'No balance'),
    PROBATION: cell(null, false, 'AFTER_PROBATION', 'No balance'),
    CASUAL: cell(null, false, 'HIRE', 'No balance')
  },
  SP: { PERMANENT: cell(3, false), FIXED_TERM: cell(0, false), PROBATION: cell(0, false), CASUAL: cell(0, false) }
};

/** Kenyan statutory floors (Employment Act). Sick is 7 days on full pay. */
export const STATUTORY_MINIMUMS: Partial<Record<LeaveCode, number>> = { AL: 21, ML: 90, PL: 14, SL: 7 };

export interface TenureBand {
  id: string;
  code: LeaveCode;
  column: ContractColumn;
  fromYears: number;
  /** Exclusive upper bound; null = no upper bound */
  toYears: number | null;
  bonusDays: number;
  cap?: number;
}

export const INITIAL_TENURE_BANDS: TenureBand[] = [
  { id: 'TB-AL-P-1', code: 'AL', column: 'PERMANENT', fromYears: 0, toYears: 3, bonusDays: 0 },
  { id: 'TB-AL-P-2', code: 'AL', column: 'PERMANENT', fromYears: 3, toYears: 5, bonusDays: 2 },
  { id: 'TB-AL-P-3', code: 'AL', column: 'PERMANENT', fromYears: 5, toYears: 10, bonusDays: 4 },
  { id: 'TB-AL-P-4', code: 'AL', column: 'PERMANENT', fromYears: 10, toYears: null, bonusDays: 6, cap: 30 },
  { id: 'TB-AL-F-1', code: 'AL', column: 'FIXED_TERM', fromYears: 0, toYears: 5, bonusDays: 0 },
  { id: 'TB-AL-F-2', code: 'AL', column: 'FIXED_TERM', fromYears: 5, toYears: null, bonusDays: 2 },
  { id: 'TB-CL-P-1', code: 'CL', column: 'PERMANENT', fromYears: 0, toYears: 5, bonusDays: 0 },
  { id: 'TB-CL-P-2', code: 'CL', column: 'PERMANENT', fromYears: 5, toYears: null, bonusDays: 2 }
];

/* ------------------------------------------------------------------ */
/* Kenya public holidays (observed dates)                               */
/* ------------------------------------------------------------------ */

export interface PublicHoliday {
  id: string;
  /** Calendar date of the holiday */
  date: string;
  /** Day off when it differs from the date (e.g. Sunday holiday observed on Monday) */
  observed?: string;
  name: string;
  kind: 'Public' | 'Company';
  /** 'ALL' or a company id */
  location: string;
  /** Date of the Gazette notice, when it was declared during the year */
  gazettedOn?: string;
  note?: string;
}

const SEED_HOLIDAYS: Omit<PublicHoliday, 'id' | 'kind' | 'location'>[] = [
  { date: '2025-10-10', name: 'Mazingira Day' },
  { date: '2025-10-20', name: 'Mashujaa Day' },
  { date: '2025-12-12', name: 'Jamhuri Day' },
  { date: '2025-12-25', name: 'Christmas Day' },
  { date: '2025-12-26', name: 'Boxing Day' },
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-03-20', name: 'Eid al-Fitr', gazettedOn: '2026-03-18', note: 'Gazetted each year once the date is confirmed' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-06-01', name: 'Madaraka Day' },
  { date: '2026-10-10', name: 'Mazingira Day', note: 'Falls on a Saturday' },
  { date: '2026-10-20', name: 'Mashujaa Day' },
  { date: '2026-12-12', name: 'Jamhuri Day', note: 'Falls on a Saturday; no Monday observance gazetted' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-26', name: 'Boxing Day', note: 'Falls on a Saturday' },
  { date: '2027-01-01', name: "New Year's Day" }
];

export const PUBLIC_HOLIDAYS_KE: PublicHoliday[] = SEED_HOLIDAYS.map((h) => ({ ...h, id: `HOL-${h.date}`, kind: 'Public', location: 'ALL' }));

/* ------------------------------------------------------------------ */
/* Company policy (20 settings)                                         */
/* ------------------------------------------------------------------ */

export interface LeavePolicy {
  yearBasis: string;
  entitlementSource: string;
  tenureSource: string;
  tenureBonusTiming: string;
  probationUse: string;
  holidayCompensation: string;
  holidayCreditPerDay: string;
  holidayCreditExpiryDays: string;
  maxCarryForward: string;
  carryForwardExpiryMonths: string;
  encashment: string;
  unpaidOnTenure: string;
  unpaidOnAccrual: string;
  backdatingDays: string;
  backdatedSubmitters: string;
  backdatedApproval: string;
  backdateClosedYear: string;
  allowNegative: string;
  negativeEligibility: string;
  negativeRecovery: string;
}

export interface PolicySettingDef {
  no: number;
  key: keyof LeavePolicy;
  setting: string;
  options: string[];
  defaultValue: string;
  /** Applied by the engine; others are recorded for HR and shown on screen */
  enforced: boolean;
}

export const POLICY_SETTINGS: PolicySettingDef[] = [
  { no: 1, key: 'yearBasis', setting: 'Leave year basis', options: ['Calendar', 'Fiscal', 'Anniversary'], defaultValue: 'Calendar', enforced: true },
  { no: 2, key: 'entitlementSource', setting: 'Entitlement days per contract type', options: ['Per entitlement matrix'], defaultValue: 'Per entitlement matrix', enforced: true },
  { no: 3, key: 'tenureSource', setting: 'Tenure bands', options: ['Per tenure bands table', 'Not used'], defaultValue: 'Per tenure bands table', enforced: true },
  { no: 4, key: 'tenureBonusTiming', setting: 'Tenure bonus timing', options: ['Next leave year', 'Pro-rate from anniversary'], defaultValue: 'Next leave year', enforced: true },
  { no: 5, key: 'probationUse', setting: 'Probation leave use', options: ['Accrue, not usable', 'Accrue and usable', 'No accrual'], defaultValue: 'Accrue, not usable', enforced: true },
  { no: 6, key: 'holidayCompensation', setting: 'Holiday worked compensation', options: ['Leave credit only', 'Pay only', 'Employee choice'], defaultValue: 'Leave credit only', enforced: true },
  { no: 7, key: 'holidayCreditPerDay', setting: 'Holiday credit per day worked', options: ['0.5', '1', '1.5', '2'], defaultValue: '1', enforced: true },
  { no: 8, key: 'holidayCreditExpiryDays', setting: 'Holiday credit expiry (days)', options: ['30', '60', '90', '180', '365'], defaultValue: '90', enforced: true },
  { no: 9, key: 'maxCarryForward', setting: 'Max carry-forward (days)', options: ['0', '5', '10', '15', '21'], defaultValue: '10', enforced: true },
  { no: 10, key: 'carryForwardExpiryMonths', setting: 'Carry-forward expiry (months)', options: ['0', '3', '6', '12'], defaultValue: '3', enforced: true },
  { no: 11, key: 'encashment', setting: 'Encashment instead of forfeiture', options: ['Not allowed', 'Allowed'], defaultValue: 'Not allowed', enforced: true },
  { no: 12, key: 'unpaidOnTenure', setting: 'Unpaid leave effect on tenure', options: ['Excluded', 'Included'], defaultValue: 'Excluded', enforced: true },
  { no: 13, key: 'unpaidOnAccrual', setting: 'Unpaid leave effect on accrual', options: ['Paused', 'Continues'], defaultValue: 'Paused', enforced: true },
  { no: 14, key: 'backdatingDays', setting: 'Allow backdating (days)', options: ['0', '3', '7', '14', '30'], defaultValue: '7', enforced: true },
  { no: 15, key: 'backdatedSubmitters', setting: 'Who can submit backdated', options: ['Supervisor or HR', 'HR only', 'Anyone'], defaultValue: 'Supervisor or HR', enforced: true },
  { no: 16, key: 'backdatedApproval', setting: 'Backdated approval', options: ['Normal + HR step', 'Normal'], defaultValue: 'Normal + HR step', enforced: true },
  { no: 17, key: 'backdateClosedYear', setting: 'Backdating across closed year', options: ['Not allowed', 'Allowed'], defaultValue: 'Not allowed', enforced: true },
  { no: 18, key: 'allowNegative', setting: 'Allow negative balance', options: ['No', 'Yes'], defaultValue: 'No', enforced: true },
  { no: 19, key: 'negativeEligibility', setting: 'Negative balance eligibility', options: ['Confirmed only', 'All'], defaultValue: 'Confirmed only', enforced: true },
  { no: 20, key: 'negativeRecovery', setting: 'Negative balance recovery', options: ['Future accrual', 'Payroll deduction', 'Both'], defaultValue: 'Both', enforced: false }
];

export const DEFAULT_POLICY = Object.fromEntries(POLICY_SETTINGS.map((s) => [s.key, s.defaultValue])) as unknown as LeavePolicy;

export interface PolicySignOff {
  hrBy: string;
  managementBy: string;
  date: string;
}

export interface PolicyVersion {
  id: string;
  effectiveFrom: string;
  values: LeavePolicy;
  signOff: PolicySignOff;
  note: string;
}

export const INITIAL_POLICY_VERSIONS: PolicyVersion[] = [
  {
    id: 'POL-2025',
    effectiveFrom: '2025-01-01',
    values: { ...DEFAULT_POLICY, backdatingDays: '14', backdatedApproval: 'Normal' },
    signOff: { hrBy: 'Rose Chepkoech', managementBy: 'Amina Hassan', date: '2024-12-16' },
    note: 'First leave policy on the new system'
  },
  {
    id: 'POL-2026',
    effectiveFrom: '2026-01-01',
    values: { ...DEFAULT_POLICY },
    signOff: { hrBy: 'Rose Chepkoech', managementBy: 'Amina Hassan', date: '2025-12-15' },
    note: 'Backdating cut to 7 days; backdated requests need an HR step'
  }
];

/* ------------------------------------------------------------------ */
/* Approvers                                                            */
/* ------------------------------------------------------------------ */

/** Department heads per company — the supervisor step goes to them. */
const DEPT_HEADS: Record<string, Record<string, string>> = {
  'org-kericho': {
    'Finance & Administration': 'KHE-0134',
    'Sales & Marketing': 'KHE-0152',
    Operations: 'KHE-0160',
    'Engineering & Maintenance': 'KHE-0160',
    'General Services': 'KHE-0160',
    'Production & Quality Control': 'KHE-0419',
    'OSH & Compliance': 'KHE-0419',
    'Information Technology': 'KHE-0178'
  },
  'org-nairobi': { '*': 'KHE-0104' }
};

/** Managers report to the next level up. */
const REPORTS_TO: Record<string, string> = {
  'KHE-0134': 'KHE-0120',
  'KHE-0152': 'KHE-0419',
  'KHE-0160': 'KHE-0419',
  'KHE-0178': 'KHE-0419',
  'KHE-0419': 'KHE-0120',
  'KHE-0120': 'KHE-0419',
  'KHE-0231': 'KHE-0102',
  'KHE-0307': 'KHE-0102',
  'KHE-0288': 'KHE-0102',
  'KHE-0102': 'KHE-0104'
};

/** HR step approver per company. */
export const HR_APPROVER: Record<string, string> = {
  'org-kericho': 'KHE-0290',
  'org-nairobi': 'HQ-1179',
  'org-factory': 'KHE-0102',
  'org-nandi': 'KHE-0102',
  'org-rift': 'KHE-0102'
};

export const supervisorFor = (e: HREmployee, all: HREmployee[]): HREmployee | undefined => {
  const byId = (id?: string) => (id ? all.find((x) => x.staffId === id) : undefined);
  if (e.reportsToStaffId) return byId(e.reportsToStaffId);
  if (REPORTS_TO[e.staffId]) return byId(REPORTS_TO[e.staffId]);
  const heads = DEPT_HEADS[e.orgId];
  const head = heads?.[e.department] ?? heads?.['*'];
  if (head && head !== e.staffId) return byId(head);
  // Elsewhere the most senior manager in the company signs off
  return all.find((x) => x.orgId === e.orgId && x.staffId !== e.staffId && /manager|director/i.test(x.jobTitle) && x.status !== 'TERMINATED');
};

export const hrApproverFor = (orgId: string, all: HREmployee[]) => all.find((x) => x.staffId === HR_APPROVER[orgId]);

/* ------------------------------------------------------------------ */
/* Ledger seed data                                                     */
/* ------------------------------------------------------------------ */

/** Annual leave closing balances at 31 Dec 2025, migrated from the old system. */
export const AL_CLOSING_2025: Record<string, number> = {
  'KHE-0419': 12,
  'KHE-0120': 16,
  'KHE-0134': 8,
  'KHE-0187': 5,
  'KHE-0141': 9.5,
  'KHE-0152': 14,
  'KHE-0244': 3,
  'KHE-0160': 11.5,
  'KHE-0251': 7,
  'KHE-0263': 4,
  'KHE-0270': 6,
  'KHE-0276': 2,
  'KHE-0171': 13,
  'KHE-0280': 1.5,
  'KHE-0178': 10,
  'KHE-0301': 8,
  'KHE-0302': 3,
  'KHE-0303': 0,
  'KHE-0211': 18,
  'KHE-0290': 6,
  'KHE-0295': 1.75,
  'KHE-1100': 9,
  'KHE-1101': 11,
  'KHE-1102': 4,
  'KHE-1103': 12,
  'KHE-1104': 2,
  'KHE-1105': 5,
  'KHE-1106': 3.5,
  'KHE-1107': 15,
  'KHE-1108': 6,
  'KHE-1109': 10,
  'KHE-1110': 1,
  'KHE-1111': 4.5,
  'KHE-1112': 0,
  'KHE-1113': 8,
  'KHE-1114': 17,
  'KHE-0102': 6,
  'KHE-0104': 10,
  'KHE-0231': 5,
  'KHE-0307': 2,
  'KHE-0288': 9
};

export interface HolidayWork {
  id: string;
  orgId: string;
  staffId: string;
  holidayDate: string;
  /** 1 = full day, 0.5 = half day */
  worked: 1 | 0.5;
  source: 'Biometric attendance' | 'Duty roster' | 'Approved claim';
  ref: string;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Who worked (or is rostered to work) which public holiday. */
const WORKED: [string, string, (string | [string, 0.5])[]][] = [
  ['org-kericho', 'KHE-0301', ['2025-12-25', '2026-04-03', '2026-05-01', '2026-10-10', '2026-10-20']],
  ['org-kericho', 'KHE-0302', ['2025-12-26', '2026-01-01', '2026-06-01', '2026-10-20']],
  ['org-kericho', 'KHE-0303', ['2026-04-06', '2026-10-20']],
  ['org-kericho', 'KHE-0211', ['2025-12-12', '2025-12-25', '2026-01-01', '2026-04-03', '2026-06-01']],
  ['org-kericho', 'KHE-1108', [['2026-06-01', 0.5]]],
  ['org-kericho', 'KHE-1100', ['2026-03-20', '2026-05-01']],
  ['org-kericho', 'KHE-1101', ['2026-05-01']],
  ['org-kericho', 'KHE-1107', ['2026-04-03', '2026-04-06', '2026-10-20']],
  ['org-kericho', 'KHE-1109', ['2026-06-01']],
  ['org-kericho', 'KHE-0263', [['2025-12-26', 0.5]]],
  ['org-kericho', 'KHE-0270', ['2026-01-01', '2026-10-10']],
  ['org-kericho', 'CAS-1119', ['2026-04-03', '2026-05-01']],
  ['org-kericho', 'CAS-1120', ['2026-05-01', '2026-06-01', '2026-10-10']],
  ['org-kericho', 'CAS-1115', ['2026-06-01']],
  ['org-kericho', 'CAS-1117', ['2026-10-20']],
  ['org-factory', 'KPF-1124', ['2026-05-01', '2026-06-01']],
  ['org-factory', 'KPF-1132', ['2026-04-03', '2026-10-20']]
];

const sourceFor = (staffId: string, date: string): HolidayWork['source'] =>
  date > todayIso() ? 'Duty roster' : staffId.startsWith('CAS') ? 'Approved claim' : 'Biometric attendance';

export const HOLIDAY_ATTENDANCE: HolidayWork[] = WORKED.flatMap(([orgId, staffId, days]) =>
  days.map((d) => {
    const [holidayDate, worked] = Array.isArray(d) ? d : ([d, 1] as const);
    return {
      id: `HW-${staffId}-${holidayDate}`,
      orgId,
      staffId,
      holidayDate,
      worked,
      source: sourceFor(staffId, holidayDate),
      ref: `${holidayDate.slice(0, 4)}/${staffId}/${holidayDate.slice(5).replace('-', '')}`
    };
  })
);

export interface LeaveAdjustment {
  id: string;
  staffId: string;
  code: LeaveCode;
  date: string;
  days: number;
  reason: string;
  by: string;
  /** Set when the adjustment reverses a forfeiture */
  reverses?: string;
}

export const INITIAL_LEAVE_ADJUSTMENTS: LeaveAdjustment[] = [
  { id: 'ADJ-2026-001', staffId: 'KHE-0263', code: 'AL', date: '2026-02-10', days: 2, reason: 'Correction: two days of December 2025 leave were recorded twice in the old system', by: 'Rose Chepkoech' },
  { id: 'ADJ-2026-002', staffId: 'KHE-0280', code: 'SL', date: '2026-03-04', days: -1, reason: 'Sick day on 2 Mar 2026 reported late by the supervisor', by: 'Rose Chepkoech' },
  {
    id: 'ADJ-2026-003',
    staffId: 'KHE-0160',
    code: 'AL',
    date: '2026-04-15',
    days: 1.5,
    reason: 'Reversal of part of the 31 Mar forfeiture: leave planned for March was cancelled by management',
    by: 'Rose Chepkoech',
    reverses: 'FORFEIT 2026-03-31'
  }
];

export interface EligibilityOverride {
  id: string;
  staffId: string;
  code: LeaveCode;
  reason: string;
  by: string;
  at: string;
}

export const INITIAL_ELIGIBILITY_OVERRIDES: EligibilityOverride[] = [
  {
    id: 'OVR-2026-001',
    staffId: 'KHE-0302',
    code: 'ML',
    reason: 'Sole custody of a newborn after the mother died at birth; approved by management (HR/2026/031)',
    by: 'Rose Chepkoech',
    at: '2026-09-14'
  }
];

/** Probation is six months unless the employee record says otherwise. */
export const DEFAULT_PROBATION_MONTHS = 6;
