/**
 * Employee Relations & Welfare (Process #13): grievances and whistleblowing, medical cover and claims,
 * welfare entitlements, staff events and CSR. Types, policy tables and demo seed data.
 * Seed dates are relative to today so SLA flags stay meaningful in the demo.
 */
import { addDays } from './timeEngine';

/* ------------------------------------------------------------------ */
/* Grievances, harassment and whistleblowing                           */
/* ------------------------------------------------------------------ */

export type ErCaseType = 'GRIEVANCE' | 'HARASSMENT' | 'WHISTLEBLOWING' | 'INCIDENT' | 'STAKEHOLDER';
export type ErStage = 'RECEIVED' | 'ACKNOWLEDGED' | 'INVESTIGATION' | 'OUTCOME' | 'CLOSED';
export type ErOutcome = 'SUBSTANTIATED' | 'NOT_SUBSTANTIATED' | 'RESOLVED_INFORMALLY';
export type ErReporterKind = 'EMPLOYEE' | 'ANONYMOUS' | 'EXTERNAL';

export const ER_TYPES: Record<ErCaseType, { label: string; categories: string[]; confidentialByDefault: boolean }> = {
  GRIEVANCE: { label: 'Grievance', categories: ['Pay and benefits', 'Working hours and overtime', 'Supervisor conduct', 'Workload and allocation', 'Promotion and transfer', 'Working conditions', 'Other'], confidentialByDefault: false },
  HARASSMENT: { label: 'Harassment', categories: ['Sexual harassment', 'Workplace bullying', 'Discrimination', 'Victimisation'], confidentialByDefault: true },
  WHISTLEBLOWING: { label: 'Whistleblowing', categories: ['Fraud', 'Corruption and bribery', 'Theft of company property', 'Safety', 'Environmental breach', 'Conflict of interest'], confidentialByDefault: true },
  INCIDENT: { label: 'Incident (non-safety)', categories: ['Misconduct', 'Misuse of company property', 'Dispute between staff', 'Absence without leave', 'Other'], confidentialByDefault: false },
  STAKEHOLDER: { label: 'Stakeholder grievance', categories: ['Community', 'Outgrower or supplier', 'Contractor', 'Customer', 'Land and environment'], confidentialByDefault: false }
};

export const ER_STAGES: { id: ErStage; label: string }[] = [
  { id: 'RECEIVED', label: 'Received' },
  { id: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { id: 'INVESTIGATION', label: 'Investigation' },
  { id: 'OUTCOME', label: 'Outcome' },
  { id: 'CLOSED', label: 'Closed' }
];

export const ER_OUTCOME_LABEL: Record<ErOutcome, string> = {
  SUBSTANTIATED: 'Substantiated',
  NOT_SUBSTANTIATED: 'Not substantiated',
  RESOLVED_INFORMALLY: 'Resolved informally'
};

/** Days allowed to acknowledge a report, and to reach an outcome after acknowledgement */
export const ER_ACK_SLA_DAYS = 7;
export const ER_INVESTIGATION_SLA_DAYS = 30;

export interface ErEvent {
  on: string;
  by: string;
  text: string;
  kind: 'stage' | 'note' | 'interview' | 'access' | 'escalation';
}

export interface ErInterview {
  id: string;
  on: string;
  person: string;
  role: 'Complainant' | 'Respondent' | 'Witness';
  summary: string;
}

export interface ErCase {
  id: string;
  ref: string;
  orgId: string;
  type: ErCaseType;
  category: string;
  reporterKind: ErReporterKind;
  reporterStaffId?: string;
  /** External stakeholder name and contact */
  reporterName?: string;
  reporterContact?: string;
  confidential: boolean;
  againstStaffId?: string;
  description: string;
  occurredOn: string;
  reportedOn: string;
  location: string;
  stage: ErStage;
  /** HR officer who handles the case and may see confidential details */
  caseOfficer: string;
  acknowledgedOn?: string;
  investigator?: string;
  investigationStartedOn?: string;
  findings?: string;
  interviews: ErInterview[];
  outcome?: ErOutcome;
  outcomeOn?: string;
  outcomeNote?: string;
  closedOn?: string;
  /** Reference of the disciplinary case it was escalated to */
  disciplinaryRef?: string;
  timeline: ErEvent[];
  /** Who opened the confidential details, when and why */
  accessLog: { on: string; by: string; reason: string }[];
}

/* ------------------------------------------------------------------ */
/* Medical cover, GPA / GLA and claims                                  */
/* ------------------------------------------------------------------ */

export type ClaimType = 'INPATIENT' | 'OUTPATIENT' | 'DENTAL' | 'OPTICAL' | 'MATERNITY' | 'GPA' | 'GLA';
export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  INPATIENT: 'Inpatient',
  OUTPATIENT: 'Outpatient',
  DENTAL: 'Dental',
  OPTICAL: 'Optical',
  MATERNITY: 'Maternity',
  GPA: 'Group personal accident',
  GLA: 'Group life (GLA)'
};
export const MEDICAL_CLAIM_TYPES: ClaimType[] = ['INPATIENT', 'OUTPATIENT', 'DENTAL', 'OPTICAL', 'MATERNITY'];

export interface SchemeClass {
  id: string;
  label: string;
  /** Who falls in this class */
  grades: string;
  limits: Partial<Record<ClaimType, number>>;
  /** Annual premium per member (family) */
  premiumPerMember: number;
}

export interface MedicalScheme {
  id: string;
  orgId: string;
  kind: 'MEDICAL' | 'GPA_GLA';
  insurer: string;
  name: string;
  policyNo: string;
  startOn: string;
  endOn: string;
  classes: SchemeClass[];
  /** Earlier policy periods, newest first */
  history: { startOn: string; endOn: string; renewedOn: string; premiumChangePct: number }[];
}

export interface Dependant {
  id: string;
  name: string;
  relationship: 'Spouse' | 'Child';
  dob: string;
}

export interface MedicalMember {
  id: string;
  orgId: string;
  schemeId: string;
  staffId: string;
  classId: string;
  memberNo: string;
  enrolledOn: string;
  dependants: Dependant[];
  status: 'ACTIVE' | 'SUSPENDED';
}

export type ClaimStatus = 'SUBMITTED' | 'WITH_INSURER' | 'PAID' | 'REJECTED';
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = { SUBMITTED: 'Submitted', WITH_INSURER: 'With insurer', PAID: 'Paid', REJECTED: 'Rejected' };

export interface MedicalClaim {
  id: string;
  ref: string;
  orgId: string;
  schemeId: string;
  staffId: string;
  /** Dependant id, or blank for the employee */
  patientId?: string;
  type: ClaimType;
  provider: string;
  serviceOn: string;
  submittedOn: string;
  claimed: number;
  approved?: number;
  status: ClaimStatus;
  /** Employee paid the provider and is refunded through payroll */
  outOfPocket: boolean;
  insurerRef?: string;
  paidOn?: string;
  rejectionReason?: string;
  reimbursedPeriod?: string;
  note?: string;
}

/** Children are covered up to this age (25 if in full-time education) */
export const CHILD_AGE_LIMIT = 24;

/* ------------------------------------------------------------------ */
/* Welfare entitlements                                                 */
/* ------------------------------------------------------------------ */

export type WelfareType = 'BEREAVEMENT' | 'WEDDING' | 'HOSPITALISATION' | 'MATERNITY' | 'RETIREMENT' | 'LONG_SERVICE';

export interface WelfarePolicy {
  type: WelfareType;
  label: string;
  /** Beneficiary options with the amount each attracts */
  options: { id: string; label: string; amount: number }[];
  documents: string;
  note: string;
}

export const DEFAULT_WELFARE_POLICIES: WelfarePolicy[] = [
  {
    type: 'BEREAVEMENT',
    label: 'Bereavement support',
    options: [
      { id: 'EMPLOYEE', label: 'Employee (paid to next of kin)', amount: 100_000 },
      { id: 'SPOUSE', label: 'Spouse', amount: 50_000 },
      { id: 'CHILD', label: 'Child', amount: 30_000 },
      { id: 'PARENT', label: 'Parent', amount: 20_000 }
    ],
    documents: 'Burial permit or death certificate',
    note: 'One parent claim per employee per year; dependants must be on record.'
  },
  { type: 'WEDDING', label: 'Wedding gift', options: [{ id: 'EMPLOYEE', label: 'Employee', amount: 15_000 }], documents: 'Marriage certificate or invitation', note: 'Once per employee.' },
  {
    type: 'HOSPITALISATION',
    label: 'Hospitalisation support',
    options: [
      { id: 'EMPLOYEE', label: 'Employee', amount: 10_000 },
      { id: 'SPOUSE', label: 'Spouse', amount: 7_500 },
      { id: 'CHILD', label: 'Child', amount: 7_500 }
    ],
    documents: 'Discharge summary',
    note: 'Admissions of 3 days or more; on top of medical cover.'
  },
  { type: 'MATERNITY', label: 'Maternity gift', options: [{ id: 'EMPLOYEE', label: 'Employee or spouse', amount: 5_000 }], documents: 'Birth notification', note: 'Per child born or adopted.' },
  { type: 'RETIREMENT', label: 'Retirement send-off', options: [{ id: 'EMPLOYEE', label: 'Retiring employee', amount: 50_000 }], documents: 'Retirement notice', note: 'Normal or early retirement after 10 years of service.' },
  {
    type: 'LONG_SERVICE',
    label: 'Long-service award',
    options: [
      { id: 'Y5', label: '5 years', amount: 10_000 },
      { id: 'Y10', label: '10 years', amount: 20_000 },
      { id: 'Y15', label: '15 years', amount: 30_000 },
      { id: 'Y20', label: '20 years and over', amount: 50_000 }
    ],
    documents: 'Service record (automatic)',
    note: 'Taxable; paid through payroll and presented at the awards ceremony.'
  }
];

export type WelfareStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'PAID';

export interface WelfareRequest {
  id: string;
  ref: string;
  orgId: string;
  staffId: string;
  type: WelfareType;
  optionId: string;
  /** Name of the person the support is for (spouse, child, parent…) */
  beneficiaryName?: string;
  amount: number;
  requestedOn: string;
  documents: string;
  status: WelfareStatus;
  decidedBy?: string;
  decidedOn?: string;
  reason?: string;
  paidVia?: 'PAYROLL' | 'FUND';
  payPeriod?: string;
  paidOn?: string;
}

export interface WelfareFund {
  orgId: string;
  /** Balance brought forward at the start of the year */
  openingBalance: number;
  contributors: number;
  /** Staff WELFARE deduction per month */
  staffMonthly: number;
  /** Company contribution per shilling of staff contribution */
  employerMatch: number;
  monthsToDate: number;
  /** Paid out this year before the requests shown here */
  paidOutEarlier: number;
}

/* ------------------------------------------------------------------ */
/* Staff events and CSR                                                 */
/* ------------------------------------------------------------------ */

export type EventKind = 'FUN_DAY' | 'TEAM_BUILDING' | 'LONG_SERVICE' | 'END_YEAR' | 'OTHER';
export const EVENT_KIND_LABEL: Record<EventKind, string> = { FUN_DAY: 'Fun day', TEAM_BUILDING: 'Team building', LONG_SERVICE: 'Long-service awards ceremony', END_YEAR: 'End-year party', OTHER: 'Other' };
export type WorkStatus = 'PLANNED' | 'IN_PROGRESS' | 'DONE';
export const WORK_STATUS_LABEL: Record<WorkStatus, string> = { PLANNED: 'Planned', IN_PROGRESS: 'In progress', DONE: 'Done' };

export interface EventTask {
  id: string;
  text: string;
  owner: string;
  due: string;
  done: boolean;
}

export interface StaffEvent {
  id: string;
  orgId: string;
  name: string;
  kind: EventKind;
  date: string;
  venue: string;
  budget: number;
  actual: number;
  owner: string;
  committee: string[];
  expected: number;
  attendees: number;
  status: WorkStatus;
  tasks: EventTask[];
  notes?: string;
}

export type CsrCategory = 'EDUCATION' | 'HEALTH' | 'ENVIRONMENT' | 'WATER';
export const CSR_CATEGORY_LABEL: Record<CsrCategory, string> = { EDUCATION: 'Education', HEALTH: 'Health', ENVIRONMENT: 'Environment', WATER: 'Water' };

export interface CsrActivity {
  id: string;
  orgId: string;
  project: string;
  community: string;
  category: CsrCategory;
  startOn: string;
  budget: number;
  actual: number;
  beneficiaries: number;
  volunteers: string[];
  photos: string;
  status: WorkStatus;
  summary: string;
}

/* ------------------------------------------------------------------ */
/* Seed                                                                 */
/* ------------------------------------------------------------------ */

export interface WelfareSeed {
  erCases: ErCase[];
  medicalSchemes: MedicalScheme[];
  medicalMembers: MedicalMember[];
  medicalClaims: MedicalClaim[];
  welfareRequests: WelfareRequest[];
  welfareFunds: WelfareFund[];
  staffEvents: StaffEvent[];
  csrActivities: CsrActivity[];
}

const ORG = 'org-kericho';
const HR = 'Rose Chepkoech';

const periodOf = (iso: string) => iso.slice(0, 7);

export const buildWelfareSeed = (today: string): WelfareSeed => {
  const d = (n: number) => addDays(today, n);
  const yr = Number(today.slice(0, 4));
  const ev = (on: string, text: string, kind: ErEvent['kind'] = 'stage', by = HR): ErEvent => ({ on, by, text, kind });

  const erCases: ErCase[] = [
    {
      id: 'er-11', ref: `ER-${yr}-011`, orgId: ORG, type: 'GRIEVANCE', category: 'Working hours and overtime', reporterKind: 'EMPLOYEE', reporterStaffId: 'KHE-1103', confidential: false,
      description: 'Overtime worked during the September peak (four Saturdays) is not on the September payslip.', occurredOn: d(-12), reportedOn: d(-2), location: 'Factory — withering section',
      stage: 'RECEIVED', caseOfficer: 'KHE-0290', interviews: [], accessLog: [], timeline: [ev(d(-2), 'Grievance received through the HR desk')]
    },
    {
      id: 'er-10', ref: `ER-${yr}-010`, orgId: ORG, type: 'HARASSMENT', category: 'Sexual harassment', reporterKind: 'EMPLOYEE', reporterStaffId: 'KHE-1101', confidential: true, againstStaffId: 'KHE-1108',
      description: 'Repeated unwelcome comments and touching during night shifts. Two colleagues witnessed one incident.', occurredOn: d(-20), reportedOn: d(-16), location: 'Factory — packing line',
      stage: 'INVESTIGATION', caseOfficer: 'KHE-0102', acknowledgedOn: d(-14), investigator: 'KHE-0102', investigationStartedOn: d(-12),
      interviews: [
        { id: 'iv-1', on: d(-10), person: 'Complainant', role: 'Complainant', summary: 'Confirmed three incidents with dates; asked for shift change.' },
        { id: 'iv-2', on: d(-7), person: 'Witness (packing line)', role: 'Witness', summary: 'Saw one incident on the night shift; corroborates the account.' }
      ],
      accessLog: [],
      timeline: [ev(d(-16), 'Report received', 'stage', 'Joseph Kiprono'), ev(d(-14), 'Acknowledged; complainant moved to day shift as interim measure', 'stage', 'Joseph Kiprono'), ev(d(-12), 'Investigation opened by Joseph Kiprono', 'stage', 'Joseph Kiprono'), ev(d(-10), 'Interview: Complainant', 'interview', 'Joseph Kiprono'), ev(d(-7), 'Interview: Witness', 'interview', 'Joseph Kiprono')]
    },
    {
      id: 'er-09', ref: `ER-${yr}-009`, orgId: ORG, type: 'WHISTLEBLOWING', category: 'Fraud', reporterKind: 'ANONYMOUS', confidential: true,
      description: 'Fertiliser bags are signed out of the main store for Block C but delivered to a private farm in Kapkatet on Saturdays.', occurredOn: d(-30), reportedOn: d(-13), location: 'Main store',
      stage: 'RECEIVED', caseOfficer: 'KHE-0141', interviews: [], accessLog: [], timeline: [ev(d(-13), 'Anonymous report received on the whistleblowing line', 'stage', 'Agnes Wairimu')]
    },
    {
      id: 'er-08', ref: `ER-${yr}-008`, orgId: ORG, type: 'STAKEHOLDER', category: 'Community', reporterKind: 'EXTERNAL', reporterName: 'Kapsoit village elders', reporterContact: 'Chief’s office, Kapsoit (0722 000 418)', confidential: false,
      description: 'Dust from tea trucks on the estate road is affecting homes and the primary school; request to water the road or reduce speed.', occurredOn: d(-35), reportedOn: d(-28), location: 'Estate road, Kapsoit',
      stage: 'OUTCOME', caseOfficer: 'KHE-0290', acknowledgedOn: d(-26), investigator: 'KHE-0160', investigationStartedOn: d(-25),
      findings: 'Trucks run at 50 km/h past the school; no road watering in the dry season.', interviews: [{ id: 'iv-3', on: d(-22), person: 'Kapsoit village elders', role: 'Complainant', summary: 'Met at the chief’s camp; agreed on speed limit and watering times.' }],
      outcome: 'RESOLVED_INFORMALLY', outcomeOn: d(-8), outcomeNote: '20 km/h limit signs put up; water bowser twice a day during school hours.', accessLog: [],
      timeline: [ev(d(-28), 'Grievance received from community'), ev(d(-26), 'Acknowledged by letter to the chief'), ev(d(-25), 'Investigation opened by Esther Muthoni'), ev(d(-22), 'Interview: Kapsoit village elders', 'interview'), ev(d(-8), 'Outcome: Resolved informally')]
    },
    {
      id: 'er-07', ref: `ER-${yr}-007`, orgId: ORG, type: 'INCIDENT', category: 'Misuse of company property', reporterKind: 'EMPLOYEE', reporterStaffId: 'KHE-0160', confidential: false, againstStaffId: 'KHE-0303',
      description: 'Company pick-up KCZ 418T used for a private trip to Kisumu over the weekend; tracker shows 240 km off-route.', occurredOn: d(-60), reportedOn: d(-58), location: 'Transport yard',
      stage: 'CLOSED', caseOfficer: 'KHE-0290', acknowledgedOn: d(-57), investigator: 'KHE-0160', investigationStartedOn: d(-56), findings: 'Tracker log and fuel records confirm the trip. Driver admitted it.',
      interviews: [{ id: 'iv-4', on: d(-54), person: 'Ali Bakari', role: 'Respondent', summary: 'Admitted using the vehicle for a family emergency without approval.' }],
      outcome: 'SUBSTANTIATED', outcomeOn: d(-50), outcomeNote: 'Referred to a disciplinary hearing.', disciplinaryRef: `DC-${yr}-014`, closedOn: d(-48), accessLog: [],
      timeline: [ev(d(-58), 'Report received'), ev(d(-57), 'Acknowledged'), ev(d(-56), 'Investigation opened by Esther Muthoni'), ev(d(-54), 'Interview: Ali Bakari', 'interview'), ev(d(-50), 'Outcome: Substantiated'), ev(d(-49), `Escalated to disciplinary case DC-${yr}-014`, 'escalation'), ev(d(-48), 'Case closed')]
    },
    {
      id: 'er-06', ref: `ER-${yr}-006`, orgId: ORG, type: 'GRIEVANCE', category: 'Workload and allocation', reporterKind: 'EMPLOYEE', reporterStaffId: 'KHE-1102', confidential: false, againstStaffId: 'KHE-0251',
      description: 'Night shifts given to the same four operatives for three months in a row.', occurredOn: d(-90), reportedOn: d(-80), location: 'Operations office',
      stage: 'CLOSED', caseOfficer: 'KHE-0290', acknowledgedOn: d(-78), investigator: 'KHE-0290', investigationStartedOn: d(-77), findings: 'Rota shows night shifts rotated fairly across 14 operatives; the four had swapped shifts voluntarily.',
      interviews: [{ id: 'iv-5', on: d(-74), person: 'Mary Wambui', role: 'Respondent', summary: 'Provided the signed rota and swap forms.' }],
      outcome: 'NOT_SUBSTANTIATED', outcomeOn: d(-70), outcomeNote: 'Rota to be posted on the notice board each month.', closedOn: d(-68), accessLog: [],
      timeline: [ev(d(-80), 'Grievance received'), ev(d(-78), 'Acknowledged'), ev(d(-77), 'Investigation opened by Rose Chepkoech'), ev(d(-74), 'Interview: Mary Wambui', 'interview'), ev(d(-70), 'Outcome: Not substantiated'), ev(d(-68), 'Case closed; feedback given to complainant')]
    },
    {
      id: 'er-05', ref: `ER-${yr}-005`, orgId: ORG, type: 'WHISTLEBLOWING', category: 'Safety', reporterKind: 'EMPLOYEE', reporterStaffId: 'KHE-0270', confidential: false,
      description: 'Pressure relief valve on boiler 2 was wired shut to stop it venting during the night shift.', occurredOn: d(-50), reportedOn: d(-48), location: 'Boiler house',
      stage: 'INVESTIGATION', caseOfficer: 'KHE-0290', acknowledgedOn: d(-47), investigator: 'KHE-0171', investigationStartedOn: d(-46), interviews: [], accessLog: [],
      timeline: [ev(d(-48), 'Report received'), ev(d(-47), 'Acknowledged; boiler 2 shut down for inspection'), ev(d(-46), 'Investigation opened by Ruth Chebet')]
    },
    {
      id: 'er-04', ref: `ER-${yr}-004`, orgId: ORG, type: 'HARASSMENT', category: 'Workplace bullying', reporterKind: 'EMPLOYEE', reporterStaffId: 'KHE-0187', confidential: true, againstStaffId: 'KHE-0244',
      description: 'Shouted at in front of customers and excluded from team meetings since July.', occurredOn: d(-15), reportedOn: d(-9), location: 'Head office, Kericho',
      stage: 'ACKNOWLEDGED', caseOfficer: 'KHE-0290', acknowledgedOn: d(-7), interviews: [], accessLog: [],
      timeline: [ev(d(-9), 'Report received in confidence'), ev(d(-7), 'Acknowledged; meeting set with the complainant')]
    }
  ];

  const medicalSchemes: MedicalScheme[] = [
    {
      id: 'ms-med', orgId: ORG, kind: 'MEDICAL', insurer: 'Jubilee Health Insurance', name: 'Staff medical scheme', policyNo: `JHI/GM/${yr - 1}/0418`, startOn: `${yr - 1}-11-01`, endOn: `${yr}-10-31`,
      classes: [
        { id: 'MGMT', label: 'Management', grades: 'Managers, directors and heads of function', limits: { INPATIENT: 2_000_000, OUTPATIENT: 200_000, DENTAL: 40_000, OPTICAL: 40_000, MATERNITY: 150_000 }, premiumPerMember: 165_000 },
        { id: 'STAFF', label: 'Staff', grades: 'Officers, clerks, operatives and drivers', limits: { INPATIENT: 500_000, OUTPATIENT: 60_000, DENTAL: 15_000, OPTICAL: 15_000, MATERNITY: 80_000 }, premiumPerMember: 48_000 }
      ],
      history: [{ startOn: `${yr - 2}-11-01`, endOn: `${yr - 1}-10-31`, renewedOn: `${yr - 1}-10-20`, premiumChangePct: 8 }]
    },
    {
      id: 'ms-gpa', orgId: ORG, kind: 'GPA_GLA', insurer: 'Britam General Insurance', name: 'Group personal accident and group life', policyNo: `BRT/GPA-GLA/${yr}/112`, startOn: `${yr}-01-01`, endOn: `${yr}-12-31`,
      classes: [{ id: 'ALL', label: 'All employees', grades: 'Every employee on the payroll, casuals included', limits: { GPA: 1_000_000, GLA: 2_000_000 }, premiumPerMember: 3_600 }],
      history: []
    }
  ];

  // [staffId, class, dependants as [name, relationship, dob]]
  const members: [string, string, [string, Dependant['relationship'], string][]][] = [
    // Group HR Manager (head office) is covered on the Kericho scheme with the estates' managers
    ['KHE-0102', 'MGMT', [['Mercy Kiprono', 'Spouse', '1988-03-22'], ['Ian Kiprotich Kiprono', 'Child', '2014-08-09']]],
    ['KHE-0120', 'MGMT', [['Yusuf Hassan', 'Spouse', '1979-04-12'], ['Zara Hassan', 'Child', '2008-02-03'], ['Imran Hassan', 'Child', '2012-09-21']]],
    ['KHE-0134', 'MGMT', [['Lydia Otieno', 'Spouse', '1986-07-30'], ['Brian Otieno', 'Child', '2015-05-11']]],
    ['KHE-0141', 'MGMT', [['Kevin Wairimu', 'Spouse', '1983-01-15']]],
    ['KHE-0152', 'MGMT', [['James Njeri', 'Spouse', '1981-10-02'], ['Wanjiku Njeri', 'Child', '2000-03-14'], ['Muthoni Njeri', 'Child', '2010-08-09']]],
    ['KHE-0160', 'MGMT', [['Paul Muthoni', 'Spouse', '1980-12-19'], ['Kimani Muthoni', 'Child', '2011-06-25']]],
    ['KHE-0171', 'MGMT', [['Daniel Chebet', 'Child', '2014-04-04']]],
    ['KHE-0178', 'MGMT', [['Mercy Kiptoo', 'Spouse', '1988-09-09'], ['Ivy Kiptoo', 'Child', '2019-01-30']]],
    ['KHE-0187', 'STAFF', [['Tom Wanjiku', 'Spouse', '1992-05-05'], ['Baby Wanjiku', 'Child', `${yr}-06-18`]]],
    ['KHE-0244', 'STAFF', []],
    ['KHE-0251', 'STAFF', [['Peter Wambui', 'Spouse', '1990-11-11']]],
    ['KHE-0263', 'STAFF', [['Jane Kiprop', 'Spouse', '1985-02-22'], ['Collins Kiprop', 'Child', '2009-07-07'], ['Faith Kiprop', 'Child', '2013-12-01']]],
    ['KHE-0270', 'STAFF', [['Sharon Ouma', 'Spouse', '1993-03-03'], ['Liam Ouma', 'Child', '2021-10-10']]],
    ['KHE-0276', 'STAFF', []],
    ['KHE-0280', 'STAFF', []],
    ['KHE-0290', 'STAFF', [['Ian Chepkoech', 'Child', '2017-08-14']]],
    ['KHE-0301', 'STAFF', [['Agnes Ouma', 'Spouse', '1984-06-06'], ['Victor Ouma', 'Child', '2006-01-20']]],
    ['KHE-0302', 'STAFF', [['Ruth Mutua', 'Spouse', '1991-09-27']]],
    ['KHE-1100', 'STAFF', [['Grace Atieno', 'Child', '2016-02-14']]],
    ['KHE-1101', 'STAFF', [['Mike Kiprotich', 'Child', '2018-11-03']]],
    ['KHE-1108', 'STAFF', []]
  ];
  const medicalMembers: MedicalMember[] = members.map(([staffId, classId, deps], i) => ({
    id: `mm-${staffId}`,
    orgId: ORG,
    schemeId: 'ms-med',
    staffId,
    classId,
    memberNo: `JHI-0418-${String(101 + i).padStart(4, '0')}`,
    enrolledOn: `${yr - 1}-11-01`,
    dependants: deps.map(([name, relationship, dob], k) => ({ id: `dp-${staffId}-${k + 1}`, name, relationship, dob })),
    status: 'ACTIVE'
  }));

  const claim = (n: number, c: Omit<MedicalClaim, 'id' | 'ref' | 'orgId' | 'schemeId'> & { schemeId?: string }): MedicalClaim => ({ id: `mc-${n}`, ref: `MC-${yr}-${String(n).padStart(3, '0')}`, orgId: ORG, schemeId: 'ms-med', ...c });
  const medicalClaims: MedicalClaim[] = [
    claim(31, { staffId: 'KHE-0160', type: 'OUTPATIENT', provider: 'Kericho Nursing Home', serviceOn: d(-45), submittedOn: d(-44), claimed: 8_500, approved: 8_500, status: 'PAID', outOfPocket: true, insurerRef: 'JHI-CLM-88412', paidOn: d(-30), reimbursedPeriod: periodOf(d(-30)) }),
    claim(32, { staffId: 'KHE-0270', patientId: 'dp-KHE-0270-2', type: 'INPATIENT', provider: 'Siloam Hospital, Kericho', serviceOn: d(-12), submittedOn: d(-9), claimed: 145_000, status: 'WITH_INSURER', outOfPocket: false, insurerRef: 'JHI-CLM-90233', note: 'Pneumonia, 4 nights' }),
    claim(33, { staffId: 'KHE-0187', type: 'MATERNITY', provider: 'Aga Khan Hospital, Kisumu', serviceOn: `${yr}-06-18`, submittedOn: `${yr}-06-22`, claimed: 92_000, approved: 80_000, status: 'PAID', outOfPocket: false, insurerRef: 'JHI-CLM-84120', paidOn: `${yr}-07-15`, note: 'Capped at the Staff maternity limit' }),
    claim(34, { staffId: 'KHE-0134', type: 'DENTAL', provider: 'Smile Dental Centre, Kericho', serviceOn: d(-25), submittedOn: d(-24), claimed: 18_000, approved: 18_000, status: 'PAID', outOfPocket: true, insurerRef: 'JHI-CLM-89901', paidOn: d(-5) }),
    claim(35, { staffId: 'KHE-0251', type: 'OPTICAL', provider: 'Kericho Optical Centre', serviceOn: d(-6), submittedOn: d(-4), claimed: 12_000, status: 'SUBMITTED', outOfPocket: true }),
    claim(36, { staffId: 'KHE-1101', patientId: 'dp-KHE-1101-1', type: 'OUTPATIENT', provider: 'Kapsoit Dispensary', serviceOn: d(-40), submittedOn: d(-38), claimed: 4_200, approved: 0, status: 'REJECTED', outOfPocket: true, insurerRef: 'JHI-CLM-88001', rejectionReason: 'Provider is not on the insurer’s panel' }),
    claim(37, { staffId: 'KHE-0152', patientId: 'dp-KHE-0152-1', type: 'INPATIENT', provider: 'The Nairobi Hospital', serviceOn: `${yr}-04-02`, submittedOn: `${yr}-04-10`, claimed: 380_000, approved: 380_000, status: 'PAID', outOfPocket: false, insurerRef: 'JHI-CLM-80114', paidOn: `${yr}-05-06` }),
    claim(38, { schemeId: 'ms-gpa', staffId: 'KHE-0302', type: 'GPA', provider: 'Kericho County Referral Hospital', serviceOn: d(-21), submittedOn: d(-18), claimed: 65_000, status: 'WITH_INSURER', outOfPocket: false, insurerRef: 'BRT-GPA-2214', note: 'Road accident on duty; fractured wrist (see OSH incident log)' }),
    claim(39, { staffId: 'KHE-0290', type: 'OUTPATIENT', provider: 'Kericho Nursing Home', serviceOn: d(-3), submittedOn: d(-2), claimed: 6_700, status: 'SUBMITTED', outOfPocket: true }),
    claim(40, { staffId: 'KHE-0263', patientId: 'dp-KHE-0263-3', type: 'OUTPATIENT', provider: 'Siloam Hospital, Kericho', serviceOn: d(-70), submittedOn: d(-69), claimed: 3_900, approved: 3_900, status: 'PAID', outOfPocket: false, insurerRef: 'JHI-CLM-86550', paidOn: d(-55) })
  ];

  const wr = (n: number, w: Omit<WelfareRequest, 'id' | 'ref' | 'orgId'>): WelfareRequest => ({ id: `wr-${n}`, ref: `WF-${yr}-${String(n).padStart(3, '0')}`, orgId: ORG, ...w });
  const welfareRequests: WelfareRequest[] = [
    wr(21, { staffId: 'KHE-1103', type: 'BEREAVEMENT', optionId: 'PARENT', beneficiaryName: 'Kiprotich arap Sang (father)', amount: 20_000, requestedOn: d(-1), documents: 'Burial permit no. 0045812', status: 'PENDING' }),
    wr(20, { staffId: 'KHE-0276', type: 'WEDDING', optionId: 'EMPLOYEE', amount: 15_000, requestedOn: d(-10), documents: 'Wedding invitation; certificate to follow', status: 'APPROVED', decidedBy: HR, decidedOn: d(-8) }),
    wr(19, { staffId: 'KHE-0263', type: 'HOSPITALISATION', optionId: 'SPOUSE', beneficiaryName: 'Jane Kiprop', amount: 7_500, requestedOn: d(-35), documents: 'Discharge summary, Siloam Hospital (5 days)', status: 'PAID', decidedBy: HR, decidedOn: d(-33), paidVia: 'FUND', paidOn: d(-32) }),
    wr(18, { staffId: 'KHE-0187', type: 'MATERNITY', optionId: 'EMPLOYEE', amount: 5_000, requestedOn: `${yr}-06-25`, documents: 'Birth notification no. 2231104', status: 'PAID', decidedBy: HR, decidedOn: `${yr}-06-26`, paidVia: 'PAYROLL', payPeriod: `${yr}-06`, paidOn: `${yr}-06-28` }),
    wr(17, { staffId: 'KHE-0270', type: 'LONG_SERVICE', optionId: 'Y5', amount: 10_000, requestedOn: d(-6), documents: 'Service record: joined April 2021', status: 'APPROVED', decidedBy: HR, decidedOn: d(-5) }),
    wr(16, { staffId: 'KHE-1105', type: 'BEREAVEMENT', optionId: 'CHILD', beneficiaryName: 'Nephew', amount: 30_000, requestedOn: d(-20), documents: 'Burial permit', status: 'DECLINED', decidedBy: HR, decidedOn: d(-18), reason: 'A nephew is not a registered dependant under the policy. Hardship support can be asked for through the welfare committee.' }),
    wr(15, { staffId: 'KHE-1111', type: 'RETIREMENT', optionId: 'EMPLOYEE', amount: 50_000, requestedOn: d(-3), documents: 'Retirement notice dated 1 October', status: 'PENDING' }),
    wr(14, { staffId: 'KHE-0251', type: 'HOSPITALISATION', optionId: 'EMPLOYEE', amount: 10_000, requestedOn: d(-4), documents: 'Discharge summary, Kericho Nursing Home (3 days)', status: 'PENDING' })
  ];

  const welfareFunds: WelfareFund[] = [{ orgId: ORG, openingBalance: 412_000, contributors: 34, staffMonthly: 200, employerMatch: 1, monthsToDate: Number(today.slice(5, 7)) - 1, paidOutEarlier: 185_000 }];

  const task = (id: string, text: string, owner: string, due: string, done: boolean): EventTask => ({ id, text, owner, due, done });
  const staffEvents: StaffEvent[] = [
    {
      id: 'se-1', orgId: ORG, name: `Long-service awards ${yr}`, kind: 'LONG_SERVICE', date: d(43), venue: 'Tea Hotel, Kericho', budget: 450_000, actual: 120_000, owner: 'KHE-0290', committee: ['KHE-0290', 'KHE-0160', 'KHE-0141'], expected: 120, attendees: 0, status: 'IN_PROGRESS',
      tasks: [
        task('t1', 'Confirm list of 5, 10, 15 and 20-year awardees', 'KHE-0290', d(-2), true),
        task('t2', 'Book venue and catering (deposit paid)', 'KHE-0160', d(-5), true),
        task('t3', 'Order certificates and plaques', 'KHE-0141', d(7), false),
        task('t4', 'Post award amounts to November payroll', 'KHE-0290', d(20), false),
        task('t5', 'Invite guest of honour', 'KHE-0160', d(3), false)
      ],
      notes: 'Awards are paid through payroll; the ceremony presents certificates.'
    },
    {
      id: 'se-2', orgId: ORG, name: `End-year party ${yr}`, kind: 'END_YEAR', date: d(71), venue: 'Estate social hall', budget: 600_000, actual: 0, owner: 'KHE-0160', committee: ['KHE-0160', 'KHE-0251', 'KHE-0280'], expected: 260, attendees: 0, status: 'PLANNED',
      tasks: [task('t1', 'Agree theme and budget with management', 'KHE-0160', d(14), false), task('t2', 'Get three catering quotes', 'KHE-0251', d(28), false), task('t3', 'Book sound system and MC', 'KHE-0280', d(40), false)]
    },
    {
      id: 'se-3', orgId: ORG, name: `Staff fun day ${yr}`, kind: 'FUN_DAY', date: d(-47), venue: 'Kericho Green Stadium', budget: 350_000, actual: 362_500, owner: 'KHE-0251', committee: ['KHE-0251', 'KHE-0244', 'KHE-0276'], expected: 220, attendees: 210, status: 'DONE',
      tasks: [task('t1', 'Hire tents and chairs', 'KHE-0251', d(-60), true), task('t2', 'Organise football and tug-of-war', 'KHE-0244', d(-55), true), task('t3', 'Family lunch and transport', 'KHE-0276', d(-50), true)],
      notes: 'Over budget by KES 12,500 on transport (two extra buses).'
    }
  ];

  const csrActivities: CsrActivity[] = [
    { id: 'csr-1', orgId: ORG, project: 'Desks for Kapsoit Primary School', community: 'Kapsoit, Kericho East', category: 'EDUCATION', startOn: `${yr}-02-10`, budget: 400_000, actual: 385_000, beneficiaries: 320, volunteers: ['KHE-0270', 'KHE-0263', 'KHE-1100'], photos: 'Handover photos in the CSR shared folder (12 images)', status: 'DONE', summary: '80 double desks made by the estate workshop and delivered.' },
    { id: 'csr-2', orgId: ORG, project: 'Tree planting on the Mau forest edge', community: 'Londiani', category: 'ENVIRONMENT', startOn: `${yr}-04-22`, budget: 250_000, actual: 198_000, beneficiaries: 150, volunteers: ['KHE-0171', 'KHE-0276', 'KHE-0244', 'KHE-0187'], photos: 'Kenya Forest Service joint album', status: 'DONE', summary: '10,000 indigenous seedlings planted with 150 local households.' },
    { id: 'csr-3', orgId: ORG, project: 'Borehole for Chemamul community', community: 'Chemamul, Kipkelion', category: 'WATER', startOn: `${yr}-07-01`, budget: 1_800_000, actual: 1_120_000, beneficiaries: 2_400, volunteers: ['KHE-0160', 'KHE-0270'], photos: 'Drilling progress photos weekly', status: 'IN_PROGRESS', summary: 'Drilled to 180 m; solar pump and tank to be installed in November.' },
    { id: 'csr-4', orgId: ORG, project: 'Free medical camp', community: 'Kiptere', category: 'HEALTH', startOn: `${yr}-08-15`, budget: 300_000, actual: 312_000, beneficiaries: 860, volunteers: ['KHE-0290', 'KHE-0251', 'KHE-0171'], photos: 'Camp photos and county health letter of thanks', status: 'DONE', summary: 'Screening, vaccination and eye tests with Kericho County health team.' },
    { id: 'csr-5', orgId: ORG, project: `Secondary school bursaries ${yr + 1}`, community: 'Kericho County', category: 'EDUCATION', startOn: d(60), budget: 1_000_000, actual: 0, beneficiaries: 40, volunteers: ['KHE-0141'], photos: '—', status: 'PLANNED', summary: 'Bursaries for 40 children of tea pluckers and outgrowers.' }
  ];

  return { erCases, medicalSchemes, medicalMembers, medicalClaims, welfareRequests, welfareFunds, staffEvents, csrActivities };
};

/** Completed years of service on a date */
export const yearsOfService = (joined: string, on: string) => {
  const y = Number(on.slice(0, 4)) - Number(joined.slice(0, 4));
  return on.slice(5) >= joined.slice(5) ? y : y - 1;
};

/** Long-service option for completed years (milestones only) */
export const longServiceOption = (years: number) => (years >= 20 && years % 5 === 0 ? 'Y20' : years === 15 ? 'Y15' : years === 10 ? 'Y10' : years === 5 ? 'Y5' : undefined);

export const ageOn = (dob: string, on: string) => yearsOfService(dob, on);
