import { kinDraftsOf, type KinDraft } from '../../utils/nextOfKin';
import { WORKFORCE } from '../../data/workforce';
import { PUBLIC_HOLIDAYS_KE } from '../../data/leaveConfig';
import { countLeaveDays, leaveBalances } from '../../data/leaveEngine';
import { latestPaidMonth, payslip as enginePayslip, MONTHS, SEED_CONTEXT, type PayrollContext, type Payslip as EnginePayslip } from '../../data/payrollEngine';
import type { HREmployee } from '../../types';
export { REQUEST_ROUTING, type EssRequest, type EssRequestType } from '../../context/essState';

const SEED_RECORD = WORKFORCE.find((e) => e.staffId === 'KHE-0102')!;

/** Portal fields taken from an employee record (job, branch, KYC, pay rail). */
const fromRecord = (r: HREmployee) => ({
  fullName: r.fullName,
  jobTitle: r.jobTitle,
  department: r.department,
  branch: r.branch,
  grade: r.grade ? `${r.grade}${/manager|director|head/i.test(r.jobTitle) ? ' (Manager)' : ''}` : '—',
  contractType: r.contractType,
  joinedDate: r.joinedDate,
  workEmail: r.email,
  phone: r.phone,
  dateOfBirth: r.dateOfBirth ?? '',
  nationalIdMasked: r.nationalIdMasked,
  kraPinMasked: r.kraPinMasked,
  nssfNoMasked: r.nssfNoMasked,
  shifNoMasked: r.shifNoMasked,
  bankAccountMasked: r.bankAccountMasked,
  mpesaPhoneMasked: r.mpesaPhoneMasked,
  // Contact details HR keeps on the record (Edit details); portal defaults stay when the record has none
  ...(r.personalEmail ? { personalEmail: r.personalEmail } : {}),
  ...(r.address ? { address: r.address } : {}),
  ...(r.nextOfKin ? { nextOfKin: r.nextOfKin } : {}),
  ...(r.emergencyContact ? { emergencyContact: r.emergencyContact } : {})
});

/**
 * The signed-in employee. Job, KYC and pay details come from the employee master (the same record payroll
 * uses); the portal keeps them in step through syncEssEmployee when HR changes the record.
 */
export const ESS_EMPLOYEE = {
  staffId: 'KHE-0102',
  preferredName: 'Joseph',
  initials: 'JK',
  manager: 'Grace Chebet (HR Director)',
  personalEmail: 'joseph.kiprono@gmail.com',
  address: 'Kilimani, Nairobi',
  nextOfKin: { name: 'Mercy Kiprono', relationship: 'Spouse', phone: '+254 733 210 448' },
  emergencyContact: { name: 'Daniel Kiprono', relationship: 'Brother', phone: '+254 710 556 219' },
  ...fromRecord(SEED_RECORD)
};

/* Live state the portal reads outside React (payroll context, team absences). Set by the portal on render. */
let liveCtx: PayrollContext = SEED_CONTEXT;
let liveRecord: HREmployee = SEED_RECORD;
/** Colleagues the portal user approves for who are away today (from approved leave). */
export const TEAM_OUT_TODAY: { name: string; reason: string; until: string }[] = [];

export const syncEssEmployee = (record: HREmployee | undefined, ctx: PayrollContext, teamOut: { name: string; reason: string; until: string }[]) => {
  liveCtx = ctx;
  if (record) {
    liveRecord = record;
    Object.assign(ESS_EMPLOYEE, fromRecord(record));
  }
  TEAM_OUT_TODAY.splice(0, TEAM_OUT_TODAY.length, ...teamOut);
};

/** This year's entitlements for the portal user, from the leave engine (balances themselves come from the ledger). */
export const ESS_LEAVE_ENTITLEMENTS = (() => {
  const me = WORKFORCE.find((e) => e.staffId === ESS_EMPLOYEE.staffId)!;
  return leaveBalances(me, [])
    .filter((b) => b.eligible && b.tracked && b.entitlement.total > 0)
    .map((b) => ({ type: b.name, entitled: b.entitlement.total, carriedOver: b.carried, usedBefore: 0 }));
})();

export interface Payslip {
  id: string;
  period: string;
  payDate: string;
  basic: number;
  houseAllowance: number;
  transportAllowance: number;
  overtime: number;
  statutory: EnginePayslip['statutory'];
  otherDeductions: { label: string; amount: number }[];
  netPay: number;
  /** Full engine payslip (reliefs, benefits, loans) */
  detail: EnginePayslip;
}

/** Payslip for a given month, from the payroll engine with everything payroll has posted (pay date is the 25th). */
export const payslipFor = (year: number, monthIndex: number): Payslip => {
  const p = enginePayslip(liveRecord, year, monthIndex, liveCtx);
  return {
    id: `PS-${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    period: p.period,
    payDate: p.payDate,
    basic: p.basic,
    houseAllowance: p.houseAllowance,
    transportAllowance: p.transportAllowance,
    overtime: p.overtime,
    statutory: p.statutory,
    otherDeductions: p.otherDeductions,
    netPay: p.net,
    detail: p
  };
};

/** Builds the last `count` monthly payslips, most recent first. */
export const buildPayslips = (count = 6, today = new Date()): Payslip[] => {
  const start = latestPaidMonth(today);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth() - i, 1);
    return payslipFor(d.getFullYear(), d.getMonth());
  });
};

/** One month on the P9A tax deduction card (amounts in KES). Column letters follow the KRA P9A layout. */
export interface P9Row {
  month: string;
  basic: number; // A  Basic salary
  benefitsNonCash: number; // B  Benefits – non cash
  quarters: number; // C  Value of quarters
  gross: number; // D  Total gross pay (A + B + C, plus cash allowances)
  ahl: number; // E  Affordable Housing Levy
  shif: number; // F  Social Health Insurance Fund
  prmf: number; // G  Post-Retirement Medical Fund
  dcE1: number; // H1 Defined contribution: 30% of A
  dcE2: number; // H2 Defined contribution: actual
  dcE3: number; // H3 Defined contribution: fixed limit
  ooi: number; // I  Owner-occupied interest
  totalDeductions: number; // J  E + F + G + lower of H + I
  chargeable: number; // K  D − J
  taxCharged: number; // L
  personalRelief: number; // M
  insuranceRelief: number; // N
  paye: number; // O  L − M − N
}

export const P9_DC_FIXED_LIMIT = 30000;

/** P9A rows for a year (only months already paid). */
export const buildP9 = (year: number, today = new Date()): P9Row[] => {
  const last = latestPaidMonth(today);
  const months = year < last.getFullYear() ? 12 : year === last.getFullYear() ? last.getMonth() + 1 : 0;
  return Array.from({ length: months }, (_, m) => {
    const p = payslipFor(year, m);
    const d = p.detail;
    const t = d.tax;
    const pmf = d.pretax.filter((l) => l.componentId === 'PMF').reduce((x, l) => x + l.amount, 0);
    const dcE1 = Math.round(p.basic * 0.3);
    const dcE2 = t.nssfEe + t.pensionAllowed;
    const allowableDc = Math.min(dcE1, dcE2, P9_DC_FIXED_LIMIT);
    const gross = d.gross - d.exemptCash + d.benefitsInKind;
    const totalDeductions = t.ahlEe + t.shif + allowableDc + t.mortgageAllowed;
    return {
      month: MONTHS[m],
      basic: p.basic,
      benefitsNonCash: d.benefitsInKind,
      quarters: 0,
      gross,
      ahl: t.ahlEe,
      shif: t.shif,
      prmf: pmf,
      dcE1,
      dcE2,
      dcE3: P9_DC_FIXED_LIMIT,
      ooi: t.mortgageAllowed,
      totalDeductions,
      chargeable: Math.max(0, gross - totalDeductions),
      taxCharged: Math.round(t.grossTax),
      personalRelief: t.personalRelief,
      insuranceRelief: Math.round(t.insuranceRelief + t.housingRelief + t.pmfRelief),
      paye: t.paye
    };
  });
};

export const P9_YEARS = [2026, 2025, 2024];

export const nextPayDate = (today = new Date()) => {
  const d = new Date(today.getFullYear(), today.getMonth(), 25);
  if (today.getDate() > 25) d.setMonth(d.getMonth() + 1);
  return d;
};

export const ESS_ANNOUNCEMENTS = [
  {
    id: 'an-1',
    title: 'Open enrolment for the 2027 medical cover closes 31 October',
    body: 'Review your dependants and cover level in the benefits section before the deadline.',
    date: '2026-10-05',
    tag: 'Benefits'
  },
  {
    id: 'an-2',
    title: 'Q4 performance check-ins start 3 November',
    body: 'Update your goals and self-assessment ahead of your one-to-one with your manager.',
    date: '2026-10-01',
    tag: 'Performance'
  },
  {
    id: 'an-3',
    title: 'Updated remote work policy',
    body: 'Hybrid staff can now book up to 2 remote days a week through the portal.',
    date: '2026-09-24',
    tag: 'Policy'
  }
];

/** Gazetted public holidays (shared with the leave engine). */
export const PUBLIC_HOLIDAYS = PUBLIC_HOLIDAYS_KE.map(({ date, name }) => ({ date, name }));

export const ESS_DOCUMENTS = [
  { id: 'doc-1', name: 'P9 Tax Deduction Card — 2025', category: 'Tax', size: '84 KB', date: '2026-02-14' },
  { id: 'doc-2', name: 'Employment Contract (signed)', category: 'Contract', size: '412 KB', date: '2019-02-04' },
  { id: 'doc-3', name: 'Promotion Letter — Group HR Manager', category: 'Contract', size: '96 KB', date: '2024-07-01' },
  { id: 'doc-4', name: 'NSSF Contribution Statement — 2026 H1', category: 'Statutory', size: '128 KB', date: '2026-07-10' },
  { id: 'doc-5', name: 'Employee Handbook 2026', category: 'Policy', size: '2.1 MB', date: '2026-01-08' },
  { id: 'doc-6', name: 'Code of Conduct & Ethics', category: 'Policy', size: '640 KB', date: '2025-11-20' },
  { id: 'doc-7', name: 'Medical Cover Summary — AAR Insurance', category: 'Benefits', size: '220 KB', date: '2026-01-02' }
];


export const formatKes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

export const formatDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', opts);

/** Working days between two ISO dates inclusive (Mon–Fri, excluding listed public holidays). */
/** Working days between two dates, excluding weekends and gazetted holidays (same count as the leave engine). */
export const workingDaysBetween = (startIso: string, endIso: string) => countLeaveDays(startIso, endIso, 'Working days');

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// The signed-in employee approves leave for their direct reports
export const ESS_IS_LEAVE_APPROVER = true;

export interface EssAsset {
  id: string;
  tag: string;
  name: string;
  category: 'IT Equipment' | 'Mobile Device' | 'Access & Security' | 'Furniture' | 'Vehicle';
  serial: string;
  issuedOn: string;
  condition: 'New' | 'Good' | 'Fair' | 'Needs Repair';
  acknowledged: boolean;
  returnBy?: string;
}

export const ESS_ASSETS: EssAsset[] = [
  { id: 'as-1', tag: 'IE-IT-0412', name: 'Dell Latitude 7440 Laptop', category: 'IT Equipment', serial: 'DL7440-8KQ2M93', issuedOn: '2024-07-08', condition: 'Good', acknowledged: true },
  { id: 'as-2', tag: 'IE-IT-0977', name: 'Dell P2423 24-inch Monitor', category: 'IT Equipment', serial: 'CN-0P2423-77J', issuedOn: '2026-10-01', condition: 'New', acknowledged: false },
  { id: 'as-3', tag: 'IE-MB-0188', name: 'Samsung Galaxy A54 (Company Line)', category: 'Mobile Device', serial: 'R58W31KLM2A', issuedOn: '2025-02-17', condition: 'Good', acknowledged: true },
  { id: 'as-4', tag: 'IE-AC-1102', name: 'Staff ID & Access Card', category: 'Access & Security', serial: 'NFC-55A9-1102', issuedOn: '2019-02-04', condition: 'Fair', acknowledged: true, returnBy: '2027-02-04' }
];

export interface EssDisciplinaryCase {
  id: string;
  date: string;
  type: 'Verbal Warning' | 'Written Warning' | 'Final Written Warning' | 'Show Cause';
  subject: string;
  outcome: string;
  status: 'Closed' | 'Active' | 'Under Appeal';
  expiresOn: string;
  handledBy: string;
}

export const ESS_DISCIPLINARY: EssDisciplinaryCase[] = [
  {
    id: 'DC-2024-018',
    date: '2024-05-13',
    type: 'Verbal Warning',
    subject: 'Late submission of monthly payroll inputs (April 2024).',
    outcome: 'Verbal warning recorded; process checklist agreed with Finance.',
    status: 'Closed',
    expiresOn: '2024-11-13',
    handledBy: 'Grace Chebet (HR Director)'
  }
];

export interface AppraisalGoal {
  id: string;
  title: string;
  weight: number;
  target: string;
  progress: number;
  selfRating: number;
  comment: string;
}

export type AppraisalStage = 'Goal setting' | 'Mid-year review' | 'Self-assessment' | 'Manager review' | 'Calibration' | 'Closed';

export const APPRAISAL_STAGES: AppraisalStage[] = ['Goal setting', 'Mid-year review', 'Self-assessment', 'Manager review', 'Calibration', 'Closed'];

export const ESS_ACTIVE_APPRAISAL = {
  cycle: 'Annual Appraisal 2026',
  periodStart: '2026-01-01',
  periodEnd: '2026-12-31',
  stage: 'Self-assessment' as AppraisalStage,
  selfAssessmentDue: '2026-11-14',
  reviewer: 'Grace Chebet (HR Director)',
  goals: [
    { id: 'g1', title: 'Reduce payroll processing errors', weight: 30, target: 'Fewer than 2 corrections per monthly run', progress: 85, selfRating: 0, comment: '' },
    { id: 'g2', title: 'Roll out Employee Self-Service to all staff', weight: 25, target: '95% of staff active on the portal', progress: 70, selfRating: 0, comment: '' },
    { id: 'g3', title: 'Cut average time-to-hire', weight: 25, target: 'From 45 to 30 days', progress: 60, selfRating: 0, comment: '' },
    { id: 'g4', title: 'Complete leadership development programme', weight: 20, target: 'All 6 modules certified', progress: 100, selfRating: 0, comment: '' }
  ] as AppraisalGoal[]
};

export const RATING_LABELS = ['', 'Unsatisfactory', 'Needs improvement', 'Meets expectations', 'Exceeds expectations', 'Outstanding'];

export interface AppraisalRecord {
  id: string;
  cycle: string;
  period: string;
  finalRating: number;
  reviewer: string;
  completedOn: string;
  summary: string;
  goals: { title: string; weight: number; rating: number }[];
  strengths: string;
  development: string;
}

export const ESS_APPRAISAL_HISTORY: AppraisalRecord[] = [
  {
    id: 'AP-2025',
    cycle: 'Annual Appraisal 2025',
    period: 'Jan – Dec 2025',
    finalRating: 4.2,
    reviewer: 'Grace Chebet (HR Director)',
    completedOn: '2026-01-28',
    summary: 'Strong year: delivered the payroll system migration on time and improved statutory filing accuracy.',
    goals: [
      { title: 'Migrate payroll to the new HR platform', weight: 35, rating: 5 },
      { title: 'Achieve 100% on-time statutory filings', weight: 25, rating: 4 },
      { title: 'Launch quarterly HR clinics at branches', weight: 20, rating: 4 },
      { title: 'Reduce overtime cost by 10%', weight: 20, rating: 3 }
    ],
    strengths: 'Ownership, stakeholder communication, attention to detail.',
    development: 'Delegate more to the HR officers; build data analytics skills.'
  },
  {
    id: 'AP-2024',
    cycle: 'Annual Appraisal 2024',
    period: 'Jan – Dec 2024',
    finalRating: 3.8,
    reviewer: 'Grace Chebet (HR Director)',
    completedOn: '2025-01-30',
    summary: 'Met expectations with notable progress on recruitment turnaround.',
    goals: [
      { title: 'Cut time-to-hire to 45 days', weight: 30, rating: 4 },
      { title: 'Digitise employee files', weight: 30, rating: 4 },
      { title: 'Timely payroll inputs every month', weight: 20, rating: 3 },
      { title: 'Complete CHRP certification', weight: 20, rating: 4 }
    ],
    strengths: 'Process improvement, reliability.',
    development: 'Strengthen month-end controls with Finance.'
  },
  {
    id: 'AP-2023',
    cycle: 'Annual Appraisal 2023',
    period: 'Jan – Dec 2023',
    finalRating: 3.5,
    reviewer: 'Samuel Ngetich (former HR Director)',
    completedOn: '2024-02-05',
    summary: 'Solid first full year in role; built good relationships across branches.',
    goals: [
      { title: 'Standardise onboarding across branches', weight: 40, rating: 4 },
      { title: 'Update HR policy manual', weight: 30, rating: 3 },
      { title: 'Reduce staff turnover', weight: 30, rating: 3 }
    ],
    strengths: 'Collaboration, approachability.',
    development: 'Data-driven reporting to management.'
  }
];

/** Editable self-service profile. Blank strings are "not provided yet". */
export interface EssProfileData {
  phone: string;
  personalEmail: string;
  address: string;
  postalAddress: string;
  maritalStatus: '' | 'Single' | 'Married' | 'Divorced' | 'Widowed';
  dependants: string;
  highestQualification: string;
  hasPhoto: boolean;
  photoUrl?: string;
  /** Everyone named as next of kin (one primary); kinName/kinRelationship/kinPhone mirror the primary */
  kins: KinDraft[];
  kinName: string;
  kinRelationship: string;
  kinPhone: string;
  emName: string;
  emRelationship: string;
  emPhone: string;
}

export const INITIAL_ESS_PROFILE: EssProfileData = {
  phone: ESS_EMPLOYEE.phone,
  personalEmail: 'joseph.kiprono@gmial.com',
  address: ESS_EMPLOYEE.address,
  postalAddress: '',
  maritalStatus: 'Married',
  dependants: '',
  highestQualification: '',
  hasPhoto: false,
  kins: kinDraftsOf({ nextOfKin: ESS_EMPLOYEE.nextOfKin }),
  kinName: ESS_EMPLOYEE.nextOfKin.name,
  kinRelationship: ESS_EMPLOYEE.nextOfKin.relationship,
  kinPhone: ESS_EMPLOYEE.nextOfKin.phone,
  emName: '',
  emRelationship: '',
  emPhone: ''
};

/** Contact details HR keeps on the employee record (Edit details in the employee master) for the portal profile. */
export const profileFromRecord = (r?: HREmployee): Partial<EssProfileData> =>
  r
    ? {
        phone: r.phone,
        ...(r.personalEmail ? { personalEmail: r.personalEmail } : {}),
        ...(r.address ? { address: r.address } : {}),
        ...(r.maritalStatus ? { maritalStatus: r.maritalStatus as EssProfileData['maritalStatus'] } : {}),
        ...(r.nextOfKin ? { kinName: r.nextOfKin.name, kinRelationship: r.nextOfKin.relationship, kinPhone: r.nextOfKin.phone } : {}),
        ...(r.nextOfKin || r.nextOfKins?.length ? { kins: kinDraftsOf(r) } : {}),
        // The photo lives on the employee record, so HR and the portal show the same picture
        hasPhoto: !!r.photoUrl,
        photoUrl: r.photoUrl,
        ...(r.emergencyContact ? { emName: r.emergencyContact.name, emRelationship: r.emergencyContact.relationship, emPhone: r.emergencyContact.phone } : {})
      }
    : {};

export const QUALIFICATIONS = ['Certificate', 'Diploma', "Bachelor's Degree", "Master's Degree", 'Doctorate', 'Professional Certification'];
