/* Learning & development (Process #09): certifications, role rules, catalogue, budgets and demo seeds */

export type CertCategory = 'Statutory' | 'Safety' | 'Quality' | 'Licence';

export interface CertificationType {
  id: string;
  name: string;
  authority: string;
  category: CertCategory;
  /** Months a certificate stays valid */
  validityMonths: number;
}

export const CERTIFICATIONS: CertificationType[] = [
  { id: 'FOOD_MED', name: 'Food handler medical certificate', authority: 'County Public Health (Public Health Act)', category: 'Statutory', validityMonths: 6 },
  { id: 'HACCP', name: 'Food safety (HACCP) awareness', authority: 'Internal QHSE', category: 'Quality', validityMonths: 24 },
  { id: 'BOILER', name: 'Boiler operator certificate', authority: 'DOSHS', category: 'Statutory', validityMonths: 12 },
  { id: 'FIRST_AID', name: 'First aid at work', authority: 'DOSHS-approved provider', category: 'Safety', validityMonths: 24 },
  { id: 'FIRE_MARSHAL', name: 'Fire marshal', authority: 'DOSHS-approved provider', category: 'Safety', validityMonths: 12 },
  { id: 'DRIVING_LICENCE', name: 'Driving licence', authority: 'NTSA', category: 'Licence', validityMonths: 36 },
  { id: 'PSV_DEFENSIVE', name: 'PSV badge & defensive driving', authority: 'NTSA', category: 'Licence', validityMonths: 24 },
  { id: 'FORKLIFT', name: 'Forklift operator certificate', authority: 'DOSHS', category: 'Licence', validityMonths: 12 },
  { id: 'PESTICIDE', name: 'Safe pesticide handling', authority: 'Pest Control Products Board', category: 'Safety', validityMonths: 12 },
  { id: 'ISO_AUDITOR', name: 'ISO 22000 internal auditor', authority: 'KEBS', category: 'Quality', validityMonths: 36 }
];

export const certById = (id: string) => CERTIFICATIONS.find((c) => c.id === id);

/** Role → required certifications. A rule matches on department and/or job title. */
export interface RoleRule {
  id: string;
  label: string;
  department?: string;
  title?: RegExp;
  certs: string[];
}

export const ROLE_RULES: RoleRule[] = [
  { id: 'factory', label: 'Factory & quality staff', department: 'Production & Quality Control', certs: ['FOOD_MED', 'HACCP'] },
  { id: 'packers', label: 'Packers', title: /Packer/i, certs: ['FOOD_MED'] },
  { id: 'quality', label: 'Quality lab & QHSE', title: /Quality|Food Technologist|Lab Technician|QHSE/i, certs: ['ISO_AUDITOR', 'FIRST_AID'] },
  { id: 'boiler', label: 'Boiler & maintenance', title: /Boiler|Maintenance Technician/i, certs: ['BOILER', 'FIRST_AID'] },
  { id: 'drivers', label: 'Drivers', title: /^Driver$/i, certs: ['DRIVING_LICENCE', 'PSV_DEFENSIVE'] },
  { id: 'stores', label: 'Stores', title: /Storekeeper/i, certs: ['FORKLIFT', 'FIRE_MARSHAL'] },
  { id: 'estate', label: 'Estate field staff', department: 'General Services', title: /Field|Farm Hand|Production Operative/i, certs: ['PESTICIDE'] },
  { id: 'safety', label: 'Safety leads', title: /QHSE|Operations Manager|Operations Officer|Security Supervisor|Shift Supervisor|Chief Operations/i, certs: ['FIRST_AID', 'FIRE_MARSHAL'] }
];

export interface Course {
  id: string;
  title: string;
  provider: string;
  providerType: 'Internal' | 'External';
  costPerHead: number;
  days: number;
  hours: number;
  nitaApproved: boolean;
  /** Certification awarded on passing */
  certId?: string;
  /** Post-test pass mark (%); 0 = attendance only */
  passMark: number;
}

export const COURSES: Course[] = [
  { id: 'C-FOOD', title: 'Food handler medical examination', provider: 'Kericho County Public Health clinic', providerType: 'External', costPerHead: 1_500, days: 1, hours: 3, nitaApproved: false, certId: 'FOOD_MED', passMark: 0 },
  { id: 'C-HACCP', title: 'HACCP & food safety awareness', provider: 'QHSE department', providerType: 'Internal', costPerHead: 800, days: 1, hours: 7, nitaApproved: false, certId: 'HACCP', passMark: 60 },
  { id: 'C-BOILER', title: 'Boiler operator certification', provider: 'Kenya Boiler Training Centre', providerType: 'External', costPerHead: 45_000, days: 5, hours: 40, nitaApproved: true, certId: 'BOILER', passMark: 70 },
  { id: 'C-FIRSTAID', title: 'First aid at work', provider: 'Kenya Red Cross', providerType: 'External', costPerHead: 6_500, days: 2, hours: 16, nitaApproved: true, certId: 'FIRST_AID', passMark: 60 },
  { id: 'C-FIRE', title: 'Fire marshal training', provider: 'FireSafe Kenya Ltd', providerType: 'External', costPerHead: 5_500, days: 1, hours: 8, nitaApproved: true, certId: 'FIRE_MARSHAL', passMark: 60 },
  { id: 'C-DEFENSIVE', title: 'Defensive driving & PSV refresher', provider: 'AA Kenya', providerType: 'External', costPerHead: 12_000, days: 3, hours: 24, nitaApproved: true, certId: 'PSV_DEFENSIVE', passMark: 70 },
  { id: 'C-LICENCE', title: 'Driving licence renewal (NTSA)', provider: 'NTSA via eCitizen', providerType: 'External', costPerHead: 3_050, days: 1, hours: 2, nitaApproved: false, certId: 'DRIVING_LICENCE', passMark: 0 },
  { id: 'C-FORKLIFT', title: 'Forklift operator course', provider: 'Kenya Forklift Training Centre', providerType: 'External', costPerHead: 18_000, days: 3, hours: 24, nitaApproved: true, certId: 'FORKLIFT', passMark: 70 },
  { id: 'C-PESTICIDE', title: 'Safe use of pesticides', provider: 'Agrochemicals Association of Kenya', providerType: 'External', costPerHead: 3_500, days: 1, hours: 8, nitaApproved: true, certId: 'PESTICIDE', passMark: 60 },
  { id: 'C-ISO', title: 'ISO 22000 internal auditor', provider: 'Kenya Bureau of Standards', providerType: 'External', costPerHead: 65_000, days: 4, hours: 32, nitaApproved: true, certId: 'ISO_AUDITOR', passMark: 70 },
  { id: 'C-LEAD', title: 'Supervisory leadership programme', provider: 'Strathmore Business School', providerType: 'External', costPerHead: 180_000, days: 10, hours: 80, nitaApproved: true, passMark: 60 },
  { id: 'C-EXCEL', title: 'Advanced Excel for reporting', provider: 'ICT department', providerType: 'Internal', costPerHead: 2_000, days: 2, hours: 12, nitaApproved: false, passMark: 60 }
];

export const courseById = (id?: string) => COURSES.find((c) => c.id === id);
export const courseForCert = (certId: string) => COURSES.find((c) => c.certId === certId);

/** Courses costing this much per head need a training bond */
export const BOND_THRESHOLD = 50_000;
export const bondMonthsFor = (cost: number) => (cost >= 150_000 ? 24 : 12);

/** NITA reimburses approved courses up to this much per participant per training day */
export const NITA_DAILY_CAP = 4_000;
export const NITA_LEVY_PER_EMPLOYEE = 50;

/** Annual training budget by department (KES) */
export const SEED_BUDGETS: Record<string, number> = {
  'Production & Quality Control': 650_000,
  Operations: 450_000,
  'General Services': 180_000,
  'Engineering & Maintenance': 250_000,
  'OSH & Compliance': 300_000,
  'Finance & Administration': 200_000,
  'Sales & Marketing': 120_000,
  'Information Technology': 150_000,
  'Human Resources': 250_000
};

/** Seeded certificate expiries (days from the seed date); 'missing' = never certified */
export const SEED_DATE = '2026-10-07';
export const CERT_OVERRIDES: Record<string, number | 'missing'> = {
  'KHE-0270|BOILER': 21,
  'KHE-0303|PSV_DEFENSIVE': -18,
  'KHE-0302|PSV_DEFENSIVE': 44,
  'KHE-0301|DRIVING_LICENCE': 230,
  'KHE-0263|FORKLIFT': 'missing',
  'KHE-1100|FOOD_MED': 6,
  'KHE-1101|FOOD_MED': 12,
  'KHE-1103|FOOD_MED': -9,
  'KHE-1108|FOOD_MED': 'missing',
  'KHE-0295|ISO_AUDITOR': 'missing',
  'CAS-1117|PESTICIDE': 'missing',
  'CAS-1119|PESTICIDE': -40
};

export type EnrolStatus = 'Enrolled' | 'Waitlisted' | 'Attended' | 'No show' | 'Withdrawn';

export interface Enrolment {
  staffId: string;
  status: EnrolStatus;
  needId?: string;
  preScore?: number;
  score?: number;
  /** Kirkpatrick level 1 reaction, 1–5 */
  reaction?: number;
  certRecordId?: string;
}

export interface TrainingSession {
  id: string;
  orgId: string;
  courseId: string;
  start: string;
  end: string;
  venue: string;
  trainer: string;
  capacity: number;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  enrolments: Enrolment[];
  /** Provider invoice total once the session is closed */
  actualCost?: number;
  invoiceNo?: string;
  financeBill?: string;
}

const e = (staffId: string, status: EnrolStatus, score?: number, reaction?: number, preScore?: number): Enrolment => ({ staffId, status, score, reaction, preScore });

export const SEED_SESSIONS: TrainingSession[] = [
  {
    id: 'TS-2601', orgId: 'org-kericho', courseId: 'C-LEAD', start: '2026-03-02', end: '2026-03-13', venue: 'Strathmore, Nairobi', trainer: 'Strathmore faculty', capacity: 2, status: 'Completed',
    enrolments: [e('KHE-0251', 'Attended', 78, 5, 52)], actualCost: 180_000, invoiceNo: 'SBS-26-0412'
  },
  {
    id: 'TS-2602', orgId: 'org-kericho', courseId: 'C-ISO', start: '2026-06-08', end: '2026-06-11', venue: 'KEBS, Nairobi', trainer: 'KEBS lead auditor', capacity: 2, status: 'Completed',
    enrolments: [e('KHE-0276', 'Attended', 82, 4, 48), e('KHE-0171', 'Attended', 88, 5, 61)], actualCost: 130_000, invoiceNo: 'KEBS-TR-8831'
  },
  {
    id: 'TS-2603', orgId: 'org-kericho', courseId: 'C-HACCP', start: '2026-07-15', end: '2026-07-15', venue: 'Factory training room', trainer: 'Ruth Chebet', capacity: 12, status: 'Completed',
    enrolments: [e('KHE-1102', 'Attended', 74, 4, 40), e('KHE-1104', 'Attended', 68, 4, 45), e('KHE-1105', 'Attended', 81, 5, 50), e('KHE-1106', 'Attended', 55, 3, 38), e('KHE-1109', 'Attended', 77, 4, 52), e('KHE-1110', 'No show')],
    actualCost: 4_800
  },
  {
    id: 'TS-2604', orgId: 'org-kericho', courseId: 'C-FIRSTAID', start: '2026-08-20', end: '2026-08-21', venue: 'Estate social hall', trainer: 'Kenya Red Cross, Kericho branch', capacity: 10, status: 'Completed',
    enrolments: [e('KHE-0160', 'Attended', 84, 5, 55), e('KHE-0251', 'Attended', 79, 4, 50), e('KHE-0276', 'Attended', 90, 5, 62), e('KHE-0419', 'Attended', 72, 4, 44)],
    actualCost: 26_000, invoiceNo: 'KRC-KER-2291'
  },
  {
    id: 'TS-2605', orgId: 'org-kericho', courseId: 'C-FIRE', start: '2026-09-16', end: '2026-09-16', venue: 'Factory yard', trainer: 'FireSafe Kenya Ltd', capacity: 8, status: 'Completed',
    enrolments: [e('KHE-0263', 'Attended', 76, 4, 48), e('KHE-0251', 'Attended', 81, 5, 60), e('KHE-0171', 'Attended', 92, 5, 70)],
    actualCost: 16_500, invoiceNo: 'FSK-1904'
  },
  {
    id: 'TS-2606', orgId: 'org-kericho', courseId: 'C-PESTICIDE', start: '2026-10-09', end: '2026-10-09', venue: 'Estate block 4 store', trainer: 'AAK field trainer', capacity: 6, status: 'Scheduled',
    enrolments: [e('CAS-1115', 'Enrolled'), e('CAS-1116', 'Enrolled'), e('CAS-1118', 'Enrolled'), e('CAS-1120', 'Enrolled'), e('CAS-1402', 'Enrolled'), e('CAS-1405', 'Enrolled'), e('CAS-1117', 'Waitlisted')]
  },
  {
    id: 'TS-2607', orgId: 'org-kericho', courseId: 'C-FOOD', start: '2026-10-14', end: '2026-10-14', venue: 'Kericho County Hospital', trainer: 'Public health officer', capacity: 15, status: 'Scheduled',
    enrolments: [e('KHE-1101', 'Enrolled'), e('KHE-1107', 'Enrolled')]
  },
  {
    id: 'TS-2608', orgId: 'org-kericho', courseId: 'C-BOILER', start: '2026-10-19', end: '2026-10-23', venue: 'Kenya Boiler Training Centre, Nakuru', trainer: 'DOSHS examiner', capacity: 4, status: 'Scheduled',
    enrolments: [e('KHE-0270', 'Enrolled')]
  },
  {
    id: 'TS-2609', orgId: 'org-kericho', courseId: 'C-DEFENSIVE', start: '2026-11-03', end: '2026-11-05', venue: 'AA Kenya, Kisumu', trainer: 'AA driving instructor', capacity: 3, status: 'Scheduled', enrolments: []
  },
  {
    id: 'TS-2610', orgId: 'org-kericho', courseId: 'C-EXCEL', start: '2026-11-17', end: '2026-11-18', venue: 'Head office boardroom', trainer: 'Samuel Kiptoo', capacity: 12, status: 'Scheduled',
    enrolments: [e('KHE-0187', 'Enrolled'), e('KHE-1114', 'Enrolled')]
  },
  {
    id: 'TS-2611', orgId: 'org-factory', courseId: 'C-LEAD', start: '2026-02-02', end: '2026-02-13', venue: 'Strathmore, Nairobi', trainer: 'Strathmore faculty', capacity: 1, status: 'Completed',
    enrolments: [e('KHE-0914', 'Attended', 71, 4)], actualCost: 180_000, invoiceNo: 'SBS-26-0207'
  }
];

export type NeedSource = 'Certification gap' | 'Appraisal' | 'Manager' | 'Compliance' | 'Employee';
export type NeedStatus = 'Proposed' | 'Approved' | 'Planned' | 'Completed' | 'Rejected';
export type Priority = 'High' | 'Medium' | 'Low';

export interface TrainingNeed {
  id: string;
  orgId: string;
  staffId: string;
  skill: string;
  reason: string;
  source: NeedSource;
  ref?: string;
  priority: Priority;
  status: NeedStatus;
  raisedOn: string;
  certId?: string;
  courseId?: string;
  sessionId?: string;
  decidedBy?: string;
}

export const SEED_NEEDS: TrainingNeed[] = [
  { id: 'TN-101', orgId: 'org-kericho', staffId: 'KHE-0302', skill: 'Defensive driving & PSV refresher', reason: 'PSV badge renewal due in November', source: 'Compliance', priority: 'High', status: 'Approved', raisedOn: '2026-09-22', certId: 'PSV_DEFENSIVE', courseId: 'C-DEFENSIVE', decidedBy: 'Ruth Chebet' },
  { id: 'TN-102', orgId: 'org-kericho', staffId: 'KHE-0244', skill: 'Negotiation skills', reason: 'Struggled to close two export contracts', source: 'Manager', ref: 'Lucy Njeri', priority: 'Medium', status: 'Proposed', raisedOn: '2026-09-30' },
  { id: 'TN-103', orgId: 'org-kericho', staffId: 'KHE-1114', skill: 'Advanced Excel for reporting', reason: 'Month-end reports built by hand', source: 'Appraisal', ref: 'Mid-year review 2026', priority: 'Low', status: 'Planned', raisedOn: '2026-07-10', courseId: 'C-EXCEL', sessionId: 'TS-2610', decidedBy: 'David Otieno' },
  { id: 'TN-104', orgId: 'org-kericho', staffId: 'KHE-0280', skill: 'Cybersecurity awareness', reason: 'Wants to lead phishing drills', source: 'Employee', priority: 'Low', status: 'Proposed', raisedOn: '2026-10-01' },
  { id: 'TN-105', orgId: 'org-kericho', staffId: 'KHE-0270', skill: 'Boiler operator certification', reason: 'DOSHS certificate expires this month', source: 'Certification gap', priority: 'High', status: 'Planned', raisedOn: '2026-09-15', certId: 'BOILER', courseId: 'C-BOILER', sessionId: 'TS-2608', decidedBy: 'Ruth Chebet' }
];

export type ClaimStatus = 'Draft' | 'Submitted' | 'Approved' | 'Paid';

export interface NitaClaim {
  id: string;
  orgId: string;
  sessionIds: string[];
  amount: number;
  status: ClaimStatus;
  createdOn: string;
  submittedOn?: string;
  nitaRef?: string;
  approvedAmount?: number;
  paidOn?: string;
}

export const SEED_CLAIMS: NitaClaim[] = [
  { id: 'NC-2601', orgId: 'org-kericho', sessionIds: ['TS-2602'], amount: 32_000, status: 'Paid', createdOn: '2026-06-20', submittedOn: '2026-06-22', nitaRef: 'NITA/RB/26/1187', approvedAmount: 8_000, paidOn: '2026-08-14' }
];

export interface TrainingBond {
  id: string;
  orgId: string;
  staffId: string;
  sessionId?: string;
  course: string;
  amount: number;
  /** Bonded service starts on this date (usually the course end date) */
  startDate: string;
  months: number;
  signedOn: string;
  status: 'Active' | 'Released' | 'Recovered' | 'Waived';
}

export const SEED_BONDS: TrainingBond[] = [
  { id: 'TB-01', orgId: 'org-kericho', staffId: 'KHE-0251', sessionId: 'TS-2601', course: 'Supervisory leadership programme', amount: 180_000, startDate: '2026-03-13', months: 24, signedOn: '2026-02-20', status: 'Active' },
  { id: 'TB-02', orgId: 'org-kericho', staffId: 'KHE-0276', sessionId: 'TS-2602', course: 'ISO 22000 internal auditor', amount: 65_000, startDate: '2026-06-11', months: 12, signedOn: '2026-05-28', status: 'Active' },
  { id: 'TB-03', orgId: 'org-factory', staffId: 'KHE-0914', sessionId: 'TS-2611', course: 'Supervisory leadership programme', amount: 180_000, startDate: '2026-02-13', months: 24, signedOn: '2026-01-26', status: 'Active' }
];
