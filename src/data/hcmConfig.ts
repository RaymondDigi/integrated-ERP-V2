/**
 * Human capital services added on top of the hire-to-retire modules: interns and attachees, welfare and medical
 * cover, travel and imprest, CSR and staff events, outsourced labour, the staff library, talent and succession,
 * PPE requisitions, OSH audit findings and work-environment monitoring, salary structure and payroll bank files.
 * Seed data follows the calendar (dates relative to today) so the demo never goes stale.
 */
import type { QualificationLevel } from '../types';

export interface HistoryEntry {
  at: string;
  by: string;
  action: string;
  note?: string;
}

const NOW = new Date();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const rel = (days: number) => iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days));
const relMonth = (m: number) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth() + m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const h = (days: number, by: string, action: string, note?: string): HistoryEntry => ({ at: rel(days), by, action, note });

/* ------------------------------------------------------------------ qualifications */

export const QUALIFICATION_LEVELS: QualificationLevel[] = ['Certificate', 'Diploma', 'Degree', 'Post Graduate Diploma', 'Masters', 'PhD'];
export const QUAL_RANK: Record<QualificationLevel, number> = { Certificate: 1, Diploma: 2, Degree: 3, 'Post Graduate Diploma': 4, Masters: 5, PhD: 6 };

/** Professional bodies HR maintains (members renew yearly and log CPD hours). */
export const INITIAL_PROFESSIONAL_BODIES = [
  'ICPAK — Institute of Certified Public Accountants of Kenya',
  'IHRM — Institute of Human Resource Management',
  'EBK — Engineers Board of Kenya',
  'KISM — Kenya Institute of Supplies Management',
  'LSK — Law Society of Kenya',
  'DOSHS — Approved safety & health adviser',
  'Tea Board of Kenya — licensed tea taster'
];

/* ------------------------------------------------------------------ interns and attachees */

export type PlacementKind = 'INTERNSHIP' | 'ATTACHMENT';
export interface Placement {
  id: string;
  orgId: string;
  kind: PlacementKind;
  name: string;
  email: string;
  phone: string;
  institution: string;
  course: string;
  department: string;
  supervisorStaffId: string;
  start: string;
  end: string;
  /** Monthly stipend (KES); attachees are often unpaid */
  stipendKes: number;
  /** Institution's introduction letter reference (attachment) */
  letterRef?: string;
  /** WIBA / personal accident cover reference */
  insuranceRef?: string;
  rotation: { department: string; from: string; to: string }[];
  logbook: { week: number; summary: string; hours: number; signedBy?: string; signedOn?: string }[];
  evaluation?: { scores: Record<string, number>; overall: number; comment: string; by: string; on: string };
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'TERMINATED';
  certificateNo?: string;
  history: HistoryEntry[];
}

export const PLACEMENT_CRITERIA = [
  { id: 'know', label: 'Technical knowledge' },
  { id: 'init', label: 'Initiative' },
  { id: 'team', label: 'Teamwork' },
  { id: 'punct', label: 'Punctuality & attendance' },
  { id: 'comm', label: 'Communication' }
];
/** Maximum placement length in months. */
export const PLACEMENT_MAX_MONTHS: Record<PlacementKind, number> = { INTERNSHIP: 12, ATTACHMENT: 6 };

export const INITIAL_PLACEMENTS: Placement[] = [
  {
    id: 'INT-2026-001', orgId: 'org-kericho', kind: 'INTERNSHIP', name: 'Cynthia Chelangat', email: 'cynthia.chelangat@gmail.com', phone: '+254 712 440 118',
    institution: 'University of Eldoret', course: 'BSc Tea Technology', department: 'Production & Quality Control', supervisorStaffId: 'KHE-0276',
    start: rel(-95), end: rel(270), stipendKes: 20_000, insuranceRef: 'GPA-JUB-22871',
    rotation: [{ department: 'Production & Quality Control', from: rel(-95), to: rel(30) }, { department: 'Operations', from: rel(31), to: rel(270) }],
    logbook: [{ week: 1, summary: 'Induction; withering and CTC line orientation', hours: 40, signedBy: 'Faith Akinyi', signedOn: rel(-88) }, { week: 2, summary: 'Grading BP1/PF1 samples with the tea taster', hours: 42, signedBy: 'Faith Akinyi', signedOn: rel(-81) }],
    status: 'ACTIVE', history: [h(-100, 'Rose Chepkoech', 'Placement created'), h(-95, 'Rose Chepkoech', 'Started')]
  },
  {
    id: 'ATT-2026-004', orgId: 'org-kericho', kind: 'ATTACHMENT', name: 'Kelvin Kiprotich', email: 'kkiprotich@students.mu.ac.ke', phone: '+254 723 551 902',
    institution: 'Moi University', course: 'BCom (Accounting)', department: 'Finance & Administration', supervisorStaffId: 'KHE-0187',
    start: rel(-70), end: rel(14), stipendKes: 0, letterRef: 'MU/BCOM/ATT/2026/118', insuranceRef: 'WIBA-APA-55021',
    rotation: [{ department: 'Finance & Administration', from: rel(-70), to: rel(14) }],
    logbook: [
      { week: 1, summary: 'Accounts payable: supplier invoice matching for packaging', hours: 40, signedBy: 'Grace Wanjiku', signedOn: rel(-63) },
      { week: 2, summary: 'Mombasa auction account sales reconciliation', hours: 40, signedBy: 'Grace Wanjiku', signedOn: rel(-56) },
      { week: 3, summary: 'Petty cash counts and imprest surrenders', hours: 38 }
    ],
    status: 'ACTIVE', history: [h(-72, 'Rose Chepkoech', 'Placement created'), h(-70, 'Rose Chepkoech', 'Started')]
  }
];

/* ------------------------------------------------------------------ welfare and medical */

export interface WelfareScheme {
  id: string;
  event: string;
  amountKes: number;
  minServiceMonths: number;
  maxPerYear: number;
  requiresDocument: string;
}
export const INITIAL_WELFARE_SCHEMES: WelfareScheme[] = [
  { id: 'WS-BRV', event: 'Bereavement — spouse, child or parent', amountKes: 50_000, minServiceMonths: 3, maxPerYear: 2, requiresDocument: 'Burial permit or death certificate' },
  { id: 'WS-WED', event: 'Wedding', amountKes: 20_000, minServiceMonths: 12, maxPerYear: 1, requiresDocument: 'Marriage certificate' },
  { id: 'WS-HSP', event: 'Hospitalisation over 3 nights', amountKes: 15_000, minServiceMonths: 6, maxPerYear: 1, requiresDocument: 'Discharge summary' },
  { id: 'WS-BIR', event: 'Birth of a child', amountKes: 10_000, minServiceMonths: 6, maxPerYear: 1, requiresDocument: 'Birth notification' },
  { id: 'WS-RET', event: 'Retirement send-off', amountKes: 30_000, minServiceMonths: 60, maxPerYear: 1, requiresDocument: 'Retirement letter' }
];

export interface WelfareClaim {
  id: string;
  staffId: string;
  schemeId: string;
  eventDate: string;
  details: string;
  amountKes: number;
  status: 'SUBMITTED' | 'HR_APPROVED' | 'PAID' | 'REJECTED';
  submittedBy: string;
  submittedOn: string;
  paidRef?: string;
  history: HistoryEntry[];
}
export const INITIAL_WELFARE_CLAIMS: WelfareClaim[] = [
  { id: 'WLF-0031', staffId: 'KHE-1101', schemeId: 'WS-BRV', eventDate: rel(-6), details: 'Passing of father, burial in Bomet', amountKes: 50_000, status: 'SUBMITTED', submittedBy: 'Purity Kiprotich', submittedOn: rel(-4), history: [h(-4, 'Purity Kiprotich', 'Submitted')] },
  { id: 'WLF-0027', staffId: 'KHE-0270', schemeId: 'WS-BIR', eventDate: rel(-40), details: 'Birth of daughter at Kericho County Referral', amountKes: 10_000, status: 'PAID', submittedBy: 'Kevin Ouma', submittedOn: rel(-38), paidRef: 'PI payroll', history: [h(-38, 'Kevin Ouma', 'Submitted'), h(-36, 'Joseph Kiprono', 'Approved'), h(-30, 'Rose Chepkoech', 'Paid through payroll')] }
];
/** Monthly staff contribution to the welfare fund (the WELFARE payroll deduction). */
export const WELFARE_CONTRIBUTION_KES = 500;

export interface MedicalScheme {
  id: string;
  insurer: string;
  name: string;
  category: 'A' | 'B' | 'C';
  inpatientLimit: number;
  outpatientLimit: number;
  dentalLimit: number;
  opticalLimit: number;
  maxDependants: number;
  /** Grades this category is for (prefix match on JG-xx) */
  grades: string[];
}
export const MEDICAL_SCHEMES: MedicalScheme[] = [
  { id: 'MED-A', insurer: 'Jubilee Health', name: 'Executive cover', category: 'A', inpatientLimit: 3_000_000, outpatientLimit: 300_000, dentalLimit: 50_000, opticalLimit: 50_000, maxDependants: 6, grades: ['JG-12', 'JG-14'] },
  { id: 'MED-B', insurer: 'AAR Insurance', name: 'Management & technical', category: 'B', inpatientLimit: 1_500_000, outpatientLimit: 150_000, dentalLimit: 30_000, opticalLimit: 30_000, maxDependants: 5, grades: ['JG-08', 'JG-10'] },
  { id: 'MED-C', insurer: 'CIC Insurance', name: 'Staff cover', category: 'C', inpatientLimit: 500_000, outpatientLimit: 60_000, dentalLimit: 15_000, opticalLimit: 15_000, maxDependants: 4, grades: ['JG-04', 'JG-06'] }
];

export interface MedicalCover {
  staffId: string;
  schemeId: string;
  memberNo: string;
  start: string;
  dependants: { name: string; relation: 'Spouse' | 'Child' | 'Parent'; dob: string }[];
}
export const INITIAL_MEDICAL_COVERS: MedicalCover[] = [
  { staffId: 'KHE-0134', schemeId: 'MED-A', memberNo: 'JUB-77120-01', start: '2025-01-01', dependants: [{ name: 'Mercy Otieno', relation: 'Spouse', dob: '1988-04-11' }, { name: 'Ian Otieno', relation: 'Child', dob: '2016-02-03' }] },
  { staffId: 'KHE-0276', schemeId: 'MED-B', memberNo: 'AAR-55118-04', start: '2025-01-01', dependants: [{ name: 'Brian Akinyi', relation: 'Child', dob: '2019-09-21' }] },
  { staffId: 'KHE-0263', schemeId: 'MED-C', memberNo: 'CIC-30981-11', start: '2025-01-01', dependants: [] },
  { staffId: 'KHE-1101', schemeId: 'MED-C', memberNo: 'CIC-30981-27', start: '2025-01-01', dependants: [{ name: 'Tony Kiprotich', relation: 'Child', dob: '2020-06-14' }] }
];

export type ClaimBenefit = 'INPATIENT' | 'OUTPATIENT' | 'DENTAL' | 'OPTICAL';
export interface MedicalClaim {
  id: string;
  staffId: string;
  beneficiary: string;
  benefit: ClaimBenefit;
  provider: string;
  date: string;
  amountKes: number;
  approvedKes?: number;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  decidedBy?: string;
  note?: string;
}
export const INITIAL_MEDICAL_CLAIMS: MedicalClaim[] = [
  { id: 'MCL-0410', staffId: 'KHE-0276', beneficiary: 'Faith Akinyi', benefit: 'OUTPATIENT', provider: 'Siloam Hospital Kericho', date: rel(-21), amountKes: 8_400, approvedKes: 8_400, status: 'APPROVED', decidedBy: 'Joseph Kiprono' },
  { id: 'MCL-0417', staffId: 'KHE-0263', beneficiary: 'John Kiprop', benefit: 'DENTAL', provider: 'Kericho Dental Centre', date: rel(-3), amountKes: 12_500, status: 'SUBMITTED' }
];

/* ------------------------------------------------------------------ travel, per diem and imprest */

/** Nightly per diem by destination band and grade (KES). */
export const PER_DIEM_RATES: { band: string; destinations: string[]; staff: number; manager: number }[] = [
  { band: 'Nairobi & Mombasa', destinations: ['Nairobi', 'Mombasa'], staff: 4_500, manager: 7_000 },
  { band: 'Other towns', destinations: ['Kericho', 'Nakuru', 'Kisumu', 'Eldoret', 'Nandi Hills', 'Bomet', 'Kisii'], staff: 3_000, manager: 5_000 },
  { band: 'Outside Kenya', destinations: ['Kampala', 'Dar es Salaam', 'Kigali', 'Dubai', 'London'], staff: 12_000, manager: 18_000 }
];

export interface TravelRequest {
  id: string;
  orgId: string;
  staffId: string;
  kind: 'TRAVEL' | 'PETTY_CASH';
  purpose: string;
  destination: string;
  from: string;
  to: string;
  nights: number;
  perDiemRate: number;
  perDiemKes: number;
  transportKes: number;
  otherKes: number;
  totalKes: number;
  status: 'SUBMITTED' | 'MANAGER_APPROVED' | 'ISSUED' | 'SURRENDERED' | 'CLOSED' | 'REJECTED';
  requestedBy: string;
  managerBy?: string;
  financeBy?: string;
  /** Finance journal for the imprest issue and for the surrender */
  issueRef?: string;
  surrender?: { spentKes: number; receipts: number; balanceKes: number; on: string; ref?: string; payrollTopUp?: boolean };
  history: HistoryEntry[];
}
export const INITIAL_TRAVEL: TravelRequest[] = [
  {
    id: 'TRV-2026-031', orgId: 'org-kericho', staffId: 'KHE-0152', kind: 'TRAVEL', purpose: 'Mombasa tea auction — sale 41 broker meetings and warehouse visit', destination: 'Mombasa', from: rel(6), to: rel(9), nights: 3,
    perDiemRate: 7_000, perDiemKes: 21_000, transportKes: 18_400, otherKes: 4_000, totalKes: 43_400, status: 'SUBMITTED', requestedBy: 'Lucy Njeri', history: [h(-1, 'Lucy Njeri', 'Submitted')]
  },
  {
    id: 'TRV-2026-027', orgId: 'org-kericho', staffId: 'KHE-0251', kind: 'TRAVEL', purpose: 'Nandi Hills outgrower green leaf collection audit', destination: 'Nandi Hills', from: rel(-12), to: rel(-10), nights: 2,
    perDiemRate: 3_000, perDiemKes: 6_000, transportKes: 3_500, otherKes: 0, totalKes: 9_500, status: 'ISSUED', requestedBy: 'Mary Wambui', managerBy: 'Esther Muthoni', financeBy: 'David Otieno', issueRef: 'Imprest IMP-0027',
    history: [h(-16, 'Mary Wambui', 'Submitted'), h(-15, 'Esther Muthoni', 'Manager approved'), h(-14, 'David Otieno', 'Imprest issued')]
  },
  {
    id: 'PC-2026-112', orgId: 'org-kericho', staffId: 'KHE-0263', kind: 'PETTY_CASH', purpose: 'Sisal twine and stencil ink for chest marking', destination: 'Kericho', from: rel(-2), to: rel(-2), nights: 0,
    perDiemRate: 0, perDiemKes: 0, transportKes: 0, otherKes: 3_800, totalKes: 3_800, status: 'MANAGER_APPROVED', requestedBy: 'John Kiprop', managerBy: 'Esther Muthoni', history: [h(-3, 'John Kiprop', 'Submitted'), h(-2, 'Esther Muthoni', 'Manager approved')]
  }
];
/** Petty cash requisitions above this go through the imprest (travel) route instead. */
export const PETTY_CASH_LIMIT_KES = 20_000;
/** Days after return within which an imprest must be surrendered. */
export const SURRENDER_DAYS = 7;

/* ------------------------------------------------------------------ CSR and events */

export interface CsrActivity {
  id: string;
  orgId: string;
  title: string;
  category: 'Education' | 'Health' | 'Environment' | 'Water & sanitation' | 'Community';
  community: string;
  date: string;
  budgetKes: number;
  actualKes?: number;
  volunteers: string[];
  volunteerHours: number;
  beneficiaries: number;
  outcome?: string;
  status: 'PLANNED' | 'APPROVED' | 'DONE' | 'CANCELLED';
  proposedBy: string;
  approvedBy?: string;
  history: HistoryEntry[];
}
export const INITIAL_CSR: CsrActivity[] = [
  { id: 'CSR-2026-07', orgId: 'org-kericho', title: 'Tree planting at Chepalungu forest edge', category: 'Environment', community: 'Chepalungu, Bomet', date: rel(-45), budgetKes: 180_000, actualKes: 164_500, volunteers: ['KHE-0171', 'KHE-0251', 'KHE-1101', 'KHE-1108'], volunteerHours: 32, beneficiaries: 6000, outcome: '6,000 indigenous seedlings planted with Kenya Forest Service', status: 'DONE', proposedBy: 'Ruth Chebet', approvedBy: 'Esther Muthoni', history: [h(-80, 'Ruth Chebet', 'Proposed'), h(-78, 'Esther Muthoni', 'Approved'), h(-44, 'Ruth Chebet', 'Completed')] },
  { id: 'CSR-2026-09', orgId: 'org-kericho', title: 'Desks and textbooks for Kapsoit Primary', category: 'Education', community: 'Kapsoit, Kericho', date: rel(24), budgetKes: 350_000, volunteers: ['KHE-0152', 'KHE-0244'], volunteerHours: 0, beneficiaries: 420, status: 'APPROVED', proposedBy: 'Lucy Njeri', approvedBy: 'Esther Muthoni', history: [h(-10, 'Lucy Njeri', 'Proposed'), h(-7, 'Esther Muthoni', 'Approved')] },
  { id: 'CSR-2026-10', orgId: 'org-kericho', title: 'Borehole repair — Kapkugerwet water point', category: 'Water & sanitation', community: 'Kapkugerwet', date: rel(40), budgetKes: 260_000, volunteers: [], volunteerHours: 0, beneficiaries: 900, status: 'PLANNED', proposedBy: 'Kevin Ouma', history: [h(-2, 'Kevin Ouma', 'Proposed')] }
];

export interface HrEvent {
  id: string;
  orgId: string;
  title: string;
  type: 'Team building' | 'Sports day' | 'Long-service awards' | 'Staff party' | 'Health day' | 'Town hall';
  date: string;
  venue: string;
  budgetKes: number;
  actualKes?: number;
  tasks: { task: string; owner: string; done: boolean }[];
  invitees: string[];
  rsvp: Record<string, 'YES' | 'NO'>;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'HELD' | 'CANCELLED';
  organiser: string;
  approvedBy?: string;
  history: HistoryEntry[];
}
export const INITIAL_EVENTS: HrEvent[] = [
  {
    id: 'EVT-2026-05', orgId: 'org-kericho', title: 'End-of-season staff sports day', type: 'Sports day', date: rel(18), venue: 'Kericho Green Stadium', budgetKes: 420_000,
    tasks: [{ task: 'Book stadium and PA system', owner: 'Rose Chepkoech', done: true }, { task: 'Order T-shirts (240)', owner: 'John Kiprop', done: false }, { task: 'First aid cover from St John', owner: 'Ruth Chebet', done: false }],
    invitees: ['KHE-0160', 'KHE-0251', 'KHE-0263', 'KHE-0270', 'KHE-0276', 'KHE-1101', 'KHE-1108'], rsvp: { 'KHE-0160': 'YES', 'KHE-0251': 'YES', 'KHE-0263': 'NO' },
    status: 'APPROVED', organiser: 'Rose Chepkoech', approvedBy: 'Joseph Kiprono', history: [h(-20, 'Rose Chepkoech', 'Created'), h(-19, 'Rose Chepkoech', 'Submitted'), h(-17, 'Joseph Kiprono', 'Approved')]
  },
  { id: 'EVT-2026-06', orgId: 'org-kericho', title: 'Long-service awards dinner', type: 'Long-service awards', date: rel(55), venue: 'Tea Hotel, Kericho', budgetKes: 650_000, tasks: [{ task: 'Confirm 5/10/15-year awardees', owner: 'Rose Chepkoech', done: false }], invitees: [], rsvp: {}, status: 'DRAFT', organiser: 'Rose Chepkoech', history: [h(-1, 'Rose Chepkoech', 'Created')] }
];

/* ------------------------------------------------------------------ outsourced labour */

export interface OutsourcedContract {
  id: string;
  orgId: string;
  contractor: string;
  service: string;
  contractNo: string;
  site: string;
  start: string;
  end: string;
  rateKes: number;
  rateBasis: 'PER_HEAD_MONTH' | 'PER_MANDAY';
  headcount: { month: string; planned: number; actual: number; days?: number }[];
  status: 'ACTIVE' | 'TERMINATED';
  history: HistoryEntry[];
}
export const INITIAL_OUTSOURCED: OutsourcedContract[] = [
  { id: 'OSC-001', orgId: 'org-kericho', contractor: 'G4S Kenya Ltd', service: 'Manned guarding', contractNo: 'G4S/KHE/2025/14', site: 'Kericho Highland Estates & factory gate', start: '2025-01-01', end: rel(48), rateKes: 38_500, rateBasis: 'PER_HEAD_MONTH', headcount: [{ month: relMonth(-2), planned: 14, actual: 14 }, { month: relMonth(-1), planned: 14, actual: 13 }], status: 'ACTIVE', history: [h(-400, 'Esther Muthoni', 'Contract recorded')] },
  { id: 'OSC-002', orgId: 'org-kericho', contractor: 'Highland Labour Agencies', service: 'Seasonal plucking gangs', contractNo: 'HLA/2026/03', site: 'Estates — Sites C & D', start: rel(-150), end: rel(120), rateKes: 650, rateBasis: 'PER_MANDAY', headcount: [{ month: relMonth(-2), planned: 120, actual: 112, days: 24 }, { month: relMonth(-1), planned: 140, actual: 131, days: 23 }], status: 'ACTIVE', history: [h(-150, 'Esther Muthoni', 'Contract recorded')] },
  { id: 'OSC-003', orgId: 'org-kericho', contractor: 'Bahari Stevedoring Services', service: 'Container stuffing at Mombasa warehouse', contractNo: 'BSS/MSA/2025/88', site: 'Mombasa (Changamwe) bonded warehouse', start: '2025-07-01', end: rel(-5), rateKes: 1_200, rateBasis: 'PER_MANDAY', headcount: [{ month: relMonth(-1), planned: 18, actual: 18, days: 12 }], status: 'ACTIVE', history: [h(-460, 'Lucy Njeri', 'Contract recorded')] }
];

/* ------------------------------------------------------------------ library */

export interface LibraryBook {
  id: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  copies: number;
}
export interface LibraryLoan {
  id: string;
  bookId: string;
  staffId: string;
  out: string;
  due: string;
  returned?: string;
  renewed?: boolean;
  fineKes?: number;
}
export const LOAN_DAYS = 14;
export const FINE_PER_DAY_KES = 20;
export const MAX_LOANS = 3;
export const INITIAL_BOOKS: LibraryBook[] = [
  { id: 'BK-001', title: 'Tea: Cultivation to Consumption', author: 'K.C. Willson & M.N. Clifford', isbn: '9780412335506', category: 'Tea technology', copies: 3 },
  { id: 'BK-002', title: 'Employment Act 2007 (annotated)', author: 'National Council for Law Reporting', isbn: '9966720001', category: 'Law & HR', copies: 2 },
  { id: 'BK-003', title: 'Occupational Safety and Health Act 2007', author: 'DOSHS', isbn: '9966720045', category: 'OSH', copies: 2 },
  { id: 'BK-004', title: 'The Effective Executive', author: 'Peter F. Drucker', isbn: '9780060833459', category: 'Leadership', copies: 1 },
  { id: 'BK-005', title: 'Financial Accounting (IFRS edition)', author: 'Weygandt, Kimmel & Kieso', isbn: '9781118978085', category: 'Finance', copies: 2 }
];
export const INITIAL_LOANS: LibraryLoan[] = [
  { id: 'LN-B-101', bookId: 'BK-001', staffId: 'KHE-0276', out: rel(-10), due: rel(4) },
  { id: 'LN-B-097', bookId: 'BK-002', staffId: 'KHE-0290', out: rel(-25), due: rel(-11) },
  { id: 'LN-B-090', bookId: 'BK-004', staffId: 'KHE-0160', out: rel(-40), due: rel(-26), returned: rel(-27), fineKes: 0 }
];

/* ------------------------------------------------------------------ talent and succession */

export interface IdpAction {
  id: string;
  action: string;
  type: 'Training' | 'Mentoring' | 'Stretch assignment' | 'Job rotation' | 'Certification';
  due: string;
  status: 'OPEN' | 'DONE';
}
export interface Idp {
  id: string;
  staffId: string;
  targetRole: string;
  careerPath: string;
  goals: string;
  actions: IdpAction[];
  reviewDate: string;
  status: 'DRAFT' | 'AGREED' | 'CLOSED';
  agreedBy?: string;
  history: HistoryEntry[];
}
export const INITIAL_IDPS: Idp[] = [
  {
    id: 'IDP-2026-004', staffId: 'KHE-0251', targetRole: 'Operations Manager', careerPath: 'Operations Officer → Estates Manager → Operations Manager', goals: 'Run a full plucking season budget; lead the Nandi outgrower programme.',
    actions: [{ id: 'A1', action: 'Supervisory leadership programme (KIM)', type: 'Training', due: rel(60), status: 'OPEN' }, { id: 'A2', action: 'Act as estates manager during Esther’s leave', type: 'Stretch assignment', due: rel(30), status: 'OPEN' }],
    reviewDate: rel(90), status: 'AGREED', agreedBy: 'Esther Muthoni', history: [h(-30, 'Esther Muthoni', 'Agreed')]
  }
];

export interface SuccessionPlan {
  id: string;
  orgId: string;
  position: string;
  incumbentStaffId: string;
  critical: boolean;
  riskOfLoss: 'LOW' | 'MEDIUM' | 'HIGH';
  successors: { staffId: string; readiness: 'READY_NOW' | '1_2_YEARS' | '3_PLUS_YEARS'; notes?: string }[];
  reviewedOn: string;
  reviewedBy: string;
}
export const READINESS_LABEL: Record<SuccessionPlan['successors'][number]['readiness'], string> = { READY_NOW: 'Ready now', '1_2_YEARS': '1–2 years', '3_PLUS_YEARS': '3+ years' };
export const INITIAL_SUCCESSION: SuccessionPlan[] = [
  { id: 'SP-001', orgId: 'org-kericho', position: 'Operations Manager', incumbentStaffId: 'KHE-0160', critical: true, riskOfLoss: 'MEDIUM', successors: [{ staffId: 'KHE-0251', readiness: '1_2_YEARS', notes: 'IDP-2026-004' }], reviewedOn: rel(-30), reviewedBy: 'Joseph Kiprono' },
  { id: 'SP-002', orgId: 'org-kericho', position: 'Finance Manager', incumbentStaffId: 'KHE-0134', critical: true, riskOfLoss: 'LOW', successors: [{ staffId: 'KHE-0187', readiness: '3_PLUS_YEARS' }], reviewedOn: rel(-60), reviewedBy: 'Amina Hassan' },
  { id: 'SP-003', orgId: 'org-kericho', position: 'QHSE Manager', incumbentStaffId: 'KHE-0171', critical: true, riskOfLoss: 'HIGH', successors: [], reviewedOn: rel(-90), reviewedBy: 'Joseph Kiprono' }
];

/* ------------------------------------------------------------------ PPE requisitions */

export interface PpeRequest {
  id: string;
  orgId: string;
  staffIds: string[];
  department: string;
  /** PPE item ids (oshConfig PPE_ITEMS) and quantity per person */
  items: { item: string; qty: number }[];
  reason: string;
  status: 'REQUESTED' | 'APPROVED' | 'ISSUED' | 'REJECTED';
  requestedBy: string;
  approvedBy?: string;
  issuedBy?: string;
  history: HistoryEntry[];
}
/** PPE store stock on hand by PPE item (issues draw it down; receipts add to it). */
export const INITIAL_PPE_STOCK: Record<string, number> = {
  BOOTS: 36,
  GUMBOOTS: 50,
  OVERALL: 40,
  HELMET: 22,
  GLOVES: 120,
  EAR_MUFFS: 2,
  DUST_MASK: 200,
  RAINCOAT: 60,
  HI_VIS: 25,
  GOGGLES: 12
};
export const INITIAL_PPE_REQUESTS: PpeRequest[] = [
  { id: 'PPR-0018', orgId: 'org-kericho', staffIds: ['KHE-1102', 'KHE-1103', 'KHE-1104'], department: 'Production & Quality Control', items: [{ item: 'EAR_MUFFS', qty: 3 }, { item: 'DUST_MASK', qty: 3 }], reason: 'CTC line noise survey above 85 dB(A); monthly mask supply', status: 'REQUESTED', requestedBy: 'Victor Chebet', history: [h(-1, 'Victor Chebet', 'Requested')] }
];

/* ------------------------------------------------------------------ OSH audits and monitoring */

export interface AuditFinding {
  id: string;
  orgId: string;
  audit: string;
  auditor: string;
  finding: string;
  severity: 'Major' | 'Minor' | 'Observation';
  owner: string;
  due: string;
  status: 'OPEN' | 'CLOSED';
  evidence?: string;
  closedOn?: string;
  closedBy?: string;
}
export const INITIAL_FINDINGS: AuditFinding[] = [
  { id: 'AF-0091', orgId: 'org-kericho', audit: 'External OSH audit (DOSHS-approved adviser) — annual', auditor: 'SafeWork Consultants Ltd', finding: 'Fire extinguishers at the withering loft past service date', severity: 'Major', owner: 'Ruth Chebet', due: rel(10), status: 'OPEN' },
  { id: 'AF-0092', orgId: 'org-kericho', audit: 'External OSH audit (DOSHS-approved adviser) — annual', auditor: 'SafeWork Consultants Ltd', finding: 'No noise exposure signage at the CTC rollers', severity: 'Minor', owner: 'Kevin Ouma', due: rel(-3), status: 'OPEN' },
  { id: 'AF-0085', orgId: 'org-kericho', audit: 'Fire safety audit', auditor: 'Kenya Fire Safety Bureau', finding: 'Emergency exit route in packing store partly blocked by chests', severity: 'Major', owner: 'John Kiprop', due: rel(-40), status: 'CLOSED', evidence: 'Photos of cleared route, store layout revised', closedOn: rel(-35), closedBy: 'Ruth Chebet' }
];

export interface WorkEnvMeasurement {
  id: string;
  orgId: string;
  date: string;
  parameter: 'Noise dB(A)' | 'Dust mg/m³' | 'Lighting lux' | 'Temperature °C';
  location: string;
  value: number;
  limit: number;
  /** Exposure limit is a maximum (noise, dust, heat) or a minimum (lighting) */
  limitIs: 'MAX' | 'MIN';
  by: string;
}
export const ENV_LIMITS: Record<WorkEnvMeasurement['parameter'], { limit: number; limitIs: 'MAX' | 'MIN' }> = {
  'Noise dB(A)': { limit: 85, limitIs: 'MAX' },
  'Dust mg/m³': { limit: 10, limitIs: 'MAX' },
  'Lighting lux': { limit: 300, limitIs: 'MIN' },
  'Temperature °C': { limit: 32, limitIs: 'MAX' }
};
export const INITIAL_ENV: WorkEnvMeasurement[] = [
  { id: 'WE-201', orgId: 'org-kericho', date: rel(-20), parameter: 'Noise dB(A)', location: 'CTC rollers', value: 91, limit: 85, limitIs: 'MAX', by: 'Ruth Chebet' },
  { id: 'WE-202', orgId: 'org-kericho', date: rel(-20), parameter: 'Dust mg/m³', location: 'Sorting & grading room', value: 6.2, limit: 10, limitIs: 'MAX', by: 'Ruth Chebet' },
  { id: 'WE-203', orgId: 'org-kericho', date: rel(-19), parameter: 'Lighting lux', location: 'Tasting room', value: 540, limit: 300, limitIs: 'MIN', by: 'Ruth Chebet' }
];

/* ------------------------------------------------------------------ salary structure, GL mapping and bank files */

export interface GradeRule {
  grade: string;
  min: number;
  mid: number;
  max: number;
  /** Salary notches between min and max */
  notches: number;
  housePct: number;
  transportKes: number;
}
export interface SalaryStructure {
  orgId: string;
  rules: GradeRule[];
  version: number;
  effectiveFrom: string;
  changedBy?: string;
  changedOn?: string;
}

/** Finance accounts payroll posts to, by cost; cost centres map HR departments to Finance departments. */
export interface PayrollGlMap {
  salaries: string;
  employerCosts: string;
  casualWages: string;
  paye: string;
  statutory: string;
  otherDeductions: string;
  netPay: string;
  /** HR department → Finance department (cost centre) */
  costCentre: Record<string, string>;
}
export const DEFAULT_GL_MAP: PayrollGlMap = {
  salaries: '6000',
  employerCosts: '6000',
  casualWages: '6000',
  paye: '2150',
  statutory: '2160',
  otherDeductions: '2200',
  netPay: '1000',
  costCentre: {
    Operations: 'Operations',
    'Production & Quality Control': 'Operations',
    'General Services': 'Operations',
    'Engineering & Maintenance': 'Operations',
    'Finance & Administration': 'Finance',
    'Sales & Marketing': 'Sales',
    'Information Technology': 'ICT',
    'Human Resources': 'Administration',
    'OSH & Compliance': 'Administration'
  }
};

export type BankFormat = 'KCB_EFT' | 'EQUITY_EFT' | 'COOP_EFT' | 'MPESA_B2C';
export const BANK_FORMATS: Record<BankFormat, { label: string; bankCode: string; ext: string }> = {
  KCB_EFT: { label: 'KCB Bank — EFT bulk (fixed width)', bankCode: '01', ext: 'txt' },
  EQUITY_EFT: { label: 'Equity Bank — EazzyBiz bulk CSV', bankCode: '68', ext: 'csv' },
  COOP_EFT: { label: 'Co-operative Bank — Co-opNet EFT CSV', bankCode: '11', ext: 'csv' },
  MPESA_B2C: { label: 'Safaricom M-Pesa B2C bulk (CSV)', bankCode: 'MP', ext: 'csv' }
};

export interface DmeLog {
  id: string;
  orgId: string;
  period: string;
  format: BankFormat;
  debitAccount: string;
  lines: number;
  totalKes: number;
  hash: string;
  by: string;
  at: string;
  status: 'GENERATED' | 'UPLOADED';
  bankRef?: string;
  uploadedBy?: string;
}

/* ------------------------------------------------------------------ advance policy, leave allowance, flexi */

export const ADVANCE_POLICY = {
  /** An advance may not exceed this share of the basic salary */
  maxPctOfBasic: 50,
  /** Net pay after recovery must stay at or above this share of gross (Employment Act s.19(3)) */
  minNetShare: 1 / 3,
  maxMonths: 3
};

export const LEAVE_ALLOWANCE_POLICY = {
  /** Paid once per leave year with the first annual leave of at least this many days */
  minDays: 10,
  pctOfBasic: 10,
  minimumKes: 5_000
};

/** Flexi bank: hours worked above the schedule, banked instead of paid; 8 banked hours buy one flexi day. */
export const FLEXI_DAY_HOURS = 8;
export const FLEXI_MAX_BANK_HOURS = 40;
export interface FlexiEntry {
  id: string;
  staffId: string;
  date: string;
  hours: number;
  kind: 'CREDIT' | 'DEBIT';
  note: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  by: string;
  decidedBy?: string;
}
export const INITIAL_FLEXI: FlexiEntry[] = [
  { id: 'FX-001', staffId: 'KHE-0270', date: rel(-14), hours: 6, kind: 'CREDIT', note: 'Boiler shutdown — stayed to restart', status: 'APPROVED', by: 'Kevin Ouma', decidedBy: 'Esther Muthoni' },
  { id: 'FX-002', staffId: 'KHE-0270', date: rel(-7), hours: 4, kind: 'CREDIT', note: 'Weekend withering fan repair', status: 'APPROVED', by: 'Kevin Ouma', decidedBy: 'Esther Muthoni' },
  { id: 'FX-003', staffId: 'KHE-0251', date: rel(-3), hours: 5, kind: 'CREDIT', note: 'Late green leaf weighing at Site D', status: 'PENDING', by: 'Mary Wambui' }
];

/** Dates of birth (today less `years`, plus `days`) so retirement tracking has real cases: at 60, KHE-0419 retires in 70 days. */
export const SEED_DOB_OFFSETS: Record<string, { years: number; days: number }> = {
  'KHE-0419': { years: 60, days: 70 },
  'KHE-0263': { years: 60, days: 160 },
  'KHE-0160': { years: 52, days: 40 },
  'KHE-0134': { years: 45, days: 120 },
  'KHE-1114': { years: 59, days: 200 }
};
