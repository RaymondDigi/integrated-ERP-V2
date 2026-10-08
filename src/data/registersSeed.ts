/**
 * Registers: licences & permits, external OSH audits, the staff library, and internship / industrial attachment intakes.
 * Types, option lists and demo records. Every record carries orgId; screens filter by the selected company.
 */

/* ------------------------------------------------------------------ dates */

const pad = (n: number) => String(n).padStart(2, '0');
export const todayIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNum = (iso: string) => Math.round(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000);
/** Whole days from `from` to `to` (negative when `to` is earlier) */
export const daysBetween = (from: string, to: string) => dayNum(to) - dayNum(from);
export const plusDays = (iso: string, n: number) => {
  const d = new Date((dayNum(iso) + n) * 86_400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
export const plusYears = (iso: string, n: number) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4)}`;

/* ------------------------------------------------------------------ licences */

export interface LicenceTypeDef {
  type: string;
  authority: string;
  /** Usual validity in months */
  months: number;
  leadDays: number;
}

export const LICENCE_TYPES: LicenceTypeDef[] = [
  { type: 'Single business permit', authority: 'County Government (Kericho)', months: 12, leadDays: 45 },
  { type: 'Factory registration (DOSHS)', authority: 'Directorate of Occupational Safety & Health Services', months: 12, leadDays: 60 },
  { type: 'Fire safety certificate', authority: 'County Fire & Rescue Services', months: 12, leadDays: 45 },
  { type: 'Boiler / pressure vessel certificate', authority: 'DOSHS approved plant examiner', months: 14, leadDays: 60 },
  { type: 'Weighing scale verification (W&M)', authority: 'Weights & Measures Department', months: 12, leadDays: 30 },
  { type: 'NEMA EIA / effluent discharge licence', authority: 'National Environment Management Authority', months: 12, leadDays: 90 },
  { type: 'Water abstraction permit (WRA)', authority: 'Water Resources Authority', months: 60, leadDays: 120 },
  { type: 'Food hygiene licence', authority: 'County Public Health Office', months: 12, leadDays: 30 },
  { type: 'KEBS product permit (standardization mark)', authority: 'Kenya Bureau of Standards', months: 12, leadDays: 60 },
  { type: 'Radio / communications licence', authority: 'Communications Authority of Kenya', months: 12, leadDays: 45 },
  { type: 'Fumigation / pest control licence', authority: 'Pest Control Products Board', months: 12, leadDays: 45 },
  { type: 'Tea manufacturing licence', authority: 'Tea Board of Kenya', months: 12, leadDays: 60 },
  { type: 'Other', authority: '', months: 12, leadDays: 30 }
];

export interface LicenceRenewal {
  renewedOn: string;
  previousExpiry: string;
  newExpiry: string;
  fee: number;
  reference: string;
  by: string;
}

export interface Licence {
  id: string;
  orgId: string;
  type: string;
  authority: string;
  number: string;
  site: string;
  issuedOn: string;
  expiresOn: string;
  /** Alert this many days before expiry */
  leadDays: number;
  officerId: string;
  fee: number;
  docRef: string;
  /** Set while a renewal application is with the authority */
  renewal?: { startedOn: string; by: string; note: string };
  history: LicenceRenewal[];
}

export type LicenceStatus = 'Valid' | 'Due for renewal' | 'Expired' | 'Renewal in progress';

export const licenceStatus = (l: Licence, today: string): LicenceStatus => {
  if (l.renewal) return 'Renewal in progress';
  const d = daysBetween(today, l.expiresOn);
  if (d < 0) return 'Expired';
  if (d <= l.leadDays) return 'Due for renewal';
  return 'Valid';
};

/* ------------------------------------------------------------------ external OSH audits */

export const AUDITOR_KINDS = ['DOSHS', 'Approved OSH auditor', 'Insurer', 'Customer / ISO'] as const;
export type AuditorKind = (typeof AUDITOR_KINDS)[number];
export const AUDIT_TYPES = ['Statutory OSH audit (annual)', 'Fire safety audit', 'ISO 45001 surveillance', 'Customer audit', 'Insurer risk survey'] as const;
export type FindingSeverity = 'Major' | 'Minor' | 'Observation';
export type FindingStatus = 'Open' | 'Done' | 'Closed';

export interface AuditFinding {
  id: string;
  text: string;
  severity: FindingSeverity;
  action: string;
  ownerId: string;
  due: string;
  status: FindingStatus;
  closedOn?: string;
}

export interface OshAudit {
  id: string;
  orgId: string;
  auditorKind: AuditorKind;
  auditor: string;
  type: string;
  date: string;
  site: string;
  /** Percentage score where the auditor gives one */
  score?: number;
  rating: string;
  reportRef: string;
  nextDue: string;
  findings: AuditFinding[];
}

/* ------------------------------------------------------------------ library */

export const BOOK_CATEGORIES = ['Tea technology', 'Agronomy', 'Management', 'Finance', 'Safety', 'ICT', 'Personal development', 'Fiction'] as const;
export const LOAN_DAYS = 14;

export interface LibraryBook {
  id: string;
  orgId: string;
  title: string;
  author: string;
  isbn: string;
  category: string;
  copies: number;
  shelf: string;
  /** Replacement cost charged if a copy is lost */
  price: number;
}

export interface LibraryLoan {
  id: string;
  orgId: string;
  bookId: string;
  staffId: string;
  issuedOn: string;
  dueOn: string;
  renewed: boolean;
  status: 'On loan' | 'Returned' | 'Lost';
  returnedOn?: string;
  /** Lost copy: amount deducted through payroll and the pay item reference */
  charge?: number;
  chargeRef?: string;
  issuedBy: string;
}

export interface LibraryReservation {
  id: string;
  orgId: string;
  bookId: string;
  staffId: string;
  on: string;
  status: 'Waiting' | 'Fulfilled' | 'Cancelled';
}

/* ------------------------------------------------------------------ internships and attachments */

export const INTERN_PROGRAMMES = ['Graduate internship', 'Industrial attachment'] as const;
export type InternProgramme = (typeof INTERN_PROGRAMMES)[number];

export interface InternCohort {
  id: string;
  orgId: string;
  programme: InternProgramme;
  name: string;
  startOn: string;
  endOn: string;
  /** Monthly stipend in KES (0 = unpaid) */
  stipend: number;
  slots: { department: string; slots: number }[];
  coordinatorId: string;
  status: 'Open for applications' | 'Running' | 'Closed';
}

export type InternStatus = 'Applied' | 'Placed' | 'Completed' | 'Withdrawn' | 'Not selected';

export interface InternPlacement {
  id: string;
  orgId: string;
  cohortId: string;
  name: string;
  phone: string;
  email: string;
  institution: string;
  course: string;
  /** Year of study (attachment) or year of graduation (internship) */
  year: string;
  /** Introduction / placement letter from the institution */
  letterRef?: string;
  insurance?: { kind: 'WIBA (company)' | 'Student cover'; ref: string; expiresOn: string };
  department?: string;
  supervisorId?: string;
  status: InternStatus;
  evaluation?: { rating: number; comment: string; certificateNo?: string; on: string };
}

export interface InternStipend {
  id: string;
  orgId: string;
  placementId: string;
  cohortId: string;
  /** YYYY-MM */
  month: string;
  amount: number;
  status: 'Pending' | 'Approved' | 'Paid';
  paidOn?: string;
  ref: string;
}

/* ------------------------------------------------------------------ demo records */

const SITE = {
  'org-kericho': 'Kericho Highland Estates',
  'org-factory': 'Kericho Factory Unit 1',
  'org-nandi': 'Nandi Hills Outgrowers',
  'org-rift': 'Rift Valley Agricultural Holding',
  'org-nairobi': 'Corporate HQ Nairobi'
} as const;

const lic = (
  id: string,
  orgId: keyof typeof SITE,
  type: string,
  number: string,
  issuedOn: string,
  expiresOn: string,
  officerId: string,
  fee: number,
  extra: Partial<Licence> = {}
): Licence => {
  const def = LICENCE_TYPES.find((t) => t.type === type)!;
  return { id, orgId, type, authority: def.authority, number, site: SITE[orgId], issuedOn, expiresOn, leadDays: def.leadDays, officerId, fee, docRef: `DMS/LIC/${id}`, history: [], ...extra };
};

export const SEED_LICENCES: Licence[] = [
  lic('LIC-001', 'org-kericho', 'Single business permit', 'KCG/SBP/2026/04418', '2026-01-10', '2026-12-31', 'KHE-0141', 38_500, {
    history: [{ renewedOn: '2026-01-10', previousExpiry: '2025-12-31', newExpiry: '2026-12-31', fee: 36_000, reference: 'KCG-RCPT-88120', by: 'Agnes Wairimu' }]
  }),
  lic('LIC-002', 'org-kericho', 'Factory registration (DOSHS)', 'DOSHS/KER/WP/1187', '2025-11-01', '2026-10-31', 'KHE-0171', 12_000),
  lic('LIC-003', 'org-kericho', 'Fire safety certificate', 'KCFR/FSC/2025/221', '2025-09-15', '2026-09-30', 'KHE-0171', 15_000),
  lic('LIC-004', 'org-kericho', 'Water abstraction permit (WRA)', 'WRA/LVS/AB/0932', '2023-03-01', '2028-02-28', 'KHE-0160', 25_000),
  lic('LIC-005', 'org-kericho', 'Radio / communications licence', 'CA/LMR/2026/1180', '2026-02-01', '2027-01-31', 'KHE-0178', 9_600),
  lic('LIC-006', 'org-factory', 'Boiler / pressure vessel certificate', 'DOSHS/PV/KPF/B2-0441', '2025-08-20', '2026-10-20', 'KPF-1121', 18_000, {
    renewal: { startedOn: '2026-09-22', by: 'Ruth Chebet', note: 'Plant examiner booked for hydraulic test 14 Oct' }
  }),
  lic('LIC-007', 'org-factory', 'Weighing scale verification (W&M)', 'WM/KER/2025/3361', '2025-09-01', '2026-09-01', 'KPF-1122', 4_500),
  lic('LIC-008', 'org-factory', 'NEMA EIA / effluent discharge licence', 'NEMA/EDL/KER/0712', '2026-03-01', '2027-02-28', 'KHE-0171', 30_000),
  lic('LIC-009', 'org-factory', 'Food hygiene licence', 'KCPH/FH/2026/0291', '2026-01-15', '2027-01-14', 'KPF-1130', 6_000),
  lic('LIC-010', 'org-factory', 'KEBS product permit (standardization mark)', 'KEBS/SM/18233', '2025-12-01', '2026-11-30', 'KHE-0276', 45_000),
  lic('LIC-011', 'org-factory', 'Tea manufacturing licence', 'TBK/ML/2026/077', '2026-07-01', '2027-06-30', 'KPF-1121', 50_000),
  lic('LIC-012', 'org-nandi', 'Single business permit', 'NCG/SBP/2026/1902', '2026-01-20', '2026-12-31', 'NHO-1144', 22_000),
  lic('LIC-013', 'org-rift', 'Fumigation / pest control licence', 'PCPB/FUM/2026/339', '2025-10-15', '2026-10-14', 'RVA-1162', 7_500),
  lic('LIC-014', 'org-nairobi', 'Single business permit', 'NCC/SBP/2026/558120', '2026-02-05', '2026-12-31', 'KHE-0102', 52_000)
];

const f = (id: string, text: string, severity: FindingSeverity, action: string, ownerId: string, due: string, status: FindingStatus, closedOn?: string): AuditFinding => ({ id, text, severity, action, ownerId, due, status, closedOn });

export const SEED_AUDITS: OshAudit[] = [
  {
    id: 'AUD-2026-01',
    orgId: 'org-kericho',
    auditorKind: 'Approved OSH auditor',
    auditor: 'SafeWorks Consultants Ltd (DOSHS approved auditor No. 0412)',
    type: 'Statutory OSH audit (annual)',
    date: '2026-06-18',
    site: 'Kericho Highland Estates — offices, stores and field stations',
    score: 82,
    rating: 'Satisfactory',
    reportRef: 'SWC/OSHA/2026/118',
    nextDue: '2027-06-17',
    findings: [
      f('F1', 'Chemical store lacks spill kit and up-to-date safety data sheets', 'Major', 'Install spill kit; file current SDS for all agro-chemicals', 'KHE-0263', '2026-08-31', 'Closed', '2026-08-20'),
      f('F2', 'Safety committee minutes not displayed on notice boards', 'Minor', 'Post last 3 sets of minutes at each station', 'KHE-0171', '2026-07-31', 'Closed', '2026-07-25'),
      f('F3', 'Field station first aid boxes incomplete', 'Minor', 'Restock boxes and set a monthly check', 'KHE-0251', '2026-09-15', 'Open'),
      f('F4', 'Noise survey of generator room older than 2 years', 'Observation', 'Commission a fresh noise survey', 'KHE-0270', '2026-11-30', 'Open')
    ]
  },
  {
    id: 'AUD-2026-02',
    orgId: 'org-factory',
    auditorKind: 'DOSHS',
    auditor: 'DOSHS Kericho County office',
    type: 'Fire safety audit',
    date: '2026-08-05',
    site: 'Kericho Factory Unit 1 — withering, rolling and packing halls',
    score: 74,
    rating: 'Needs improvement',
    reportRef: 'DOSHS/KER/FSA/2026/044',
    nextDue: '2027-08-04',
    findings: [
      f('F1', 'Two fire exits in the packing hall obstructed by pallets', 'Major', 'Clear exits and paint keep-clear zones', 'KPF-1122', '2026-08-12', 'Closed', '2026-08-10'),
      f('F2', 'Fire extinguishers in boiler house overdue for service', 'Major', 'Service all extinguishers and tag them', 'KPF-1132', '2026-09-05', 'Open'),
      f('F3', 'No evacuation drill recorded for night shift', 'Minor', 'Run and record a night-shift drill', 'KHE-0171', '2026-10-31', 'Open')
    ]
  },
  {
    id: 'AUD-2026-03',
    orgId: 'org-factory',
    auditorKind: 'Customer / ISO',
    auditor: 'Bureau Veritas (for ISO 45001 certificate)',
    type: 'ISO 45001 surveillance',
    date: '2026-09-24',
    site: 'Kericho Factory Unit 1',
    score: 91,
    rating: 'Certificate maintained',
    reportRef: 'BV-45001-KE-2026-3391',
    nextDue: '2027-09-23',
    findings: [f('F1', 'Contractor induction records not linked to permits to work', 'Minor', 'Reference induction no. on every permit', 'KHE-0171', '2026-11-15', 'Open')]
  },
  {
    id: 'AUD-2026-04',
    orgId: 'org-nandi',
    auditorKind: 'Insurer',
    auditor: 'APA Insurance — WIBA risk survey',
    type: 'Insurer risk survey',
    date: '2026-05-12',
    site: 'Nandi Hills collection centres',
    rating: 'Acceptable risk',
    reportRef: 'APA/RS/2026/0612',
    nextDue: '2027-05-11',
    findings: [f('F1', 'Leaf collection trucks without first aid kits', 'Minor', 'Fit kits to all 4 trucks', 'NHO-1140', '2026-07-31', 'Done')]
  }
];

const book = (id: string, orgId: string, title: string, author: string, isbn: string, category: string, copies: number, shelf: string, price: number): LibraryBook => ({ id, orgId, title, author, isbn, category, copies, shelf, price });

export const SEED_BOOKS: LibraryBook[] = [
  book('BK-001', 'org-kericho', 'Tea: Cultivation to Consumption', 'K.C. Willson & M.N. Clifford', '978-0412335506', 'Tea technology', 2, 'A1', 9_800),
  book('BK-002', 'org-kericho', 'Tea Growers Handbook', 'Tea Research Institute (KALRO)', '978-9966-123-45-1', 'Tea technology', 3, 'A1', 3_500),
  book('BK-003', 'org-kericho', 'Tea Processing and Manufacture', 'T. Eden', '978-0582466475', 'Tea technology', 1, 'A2', 7_200),
  book('BK-004', 'org-kericho', 'Soil Fertility and Fertilizers', 'J.L. Havlin et al.', '978-0135033739', 'Agronomy', 1, 'A3', 8_400),
  book('BK-005', 'org-kericho', 'The Effective Executive', 'Peter F. Drucker', '978-0060833459', 'Management', 2, 'B1', 2_200),
  book('BK-006', 'org-kericho', 'Good to Great', 'Jim Collins', '978-0066620992', 'Management', 2, 'B1', 2_600),
  book('BK-007', 'org-kericho', 'The 7 Habits of Highly Effective People', 'Stephen R. Covey', '978-1982137274', 'Personal development', 3, 'B2', 1_900),
  book('BK-008', 'org-kericho', 'Financial Accounting (IFRS edition)', 'Weygandt, Kimmel & Kieso', '978-1119503439', 'Finance', 1, 'C1', 6_900),
  book('BK-009', 'org-kericho', 'Kenya Tax Guide 2026', 'ICPAK', '978-9966-200-11-4', 'Finance', 2, 'C1', 2_400),
  book('BK-010', 'org-kericho', 'Occupational Safety and Health Act 2007 — annotated', 'Kenya Law', '978-9966-031-70-2', 'Safety', 3, 'D1', 1_500),
  book('BK-011', 'org-kericho', 'Introduction to Health and Safety at Work', 'Phil Hughes & Ed Ferrett', '978-0367680138', 'Safety', 1, 'D1', 5_800),
  book('BK-012', 'org-kericho', 'Excel 365 Bible', 'Michael Alexander et al.', '978-1119835110', 'ICT', 1, 'E1', 4_900),
  book('BK-013', 'org-kericho', 'The River Between', 'Ngugi wa Thiong\'o', '978-0435905484', 'Fiction', 2, 'F1', 950),
  book('BK-014', 'org-kericho', 'Blossoms of the Savannah', 'H.R. Ole Kulet', '978-9966-25-505-6', 'Fiction', 3, 'F1', 800),
  book('BK-015', 'org-kericho', 'Things Fall Apart', 'Chinua Achebe', '978-0385474542', 'Fiction', 2, 'F2', 900),
  book('BK-016', 'org-factory', 'Black Tea Manufacture: Quality Control Manual', 'Tea Board of Kenya', '978-9966-089-02-3', 'Tea technology', 2, 'QC-1', 2_800),
  book('BK-017', 'org-factory', 'Boiler Operation Engineering', 'P. Chattopadhyay', '978-0070482265', 'Safety', 1, 'QC-2', 6_500)
];

const loan = (id: string, orgId: string, bookId: string, staffId: string, issuedOn: string, extra: Partial<LibraryLoan> = {}): LibraryLoan => ({
  id,
  orgId,
  bookId,
  staffId,
  issuedOn,
  dueOn: plusDays(issuedOn, LOAN_DAYS),
  renewed: false,
  status: 'On loan',
  issuedBy: 'Rose Chepkoech',
  ...extra
});

export const SEED_LOANS: LibraryLoan[] = [
  loan('LN-0101', 'org-kericho', 'BK-001', 'KHE-0160', '2026-09-30'),
  loan('LN-0102', 'org-kericho', 'BK-005', 'KHE-0134', '2026-10-01'),
  loan('LN-0103', 'org-kericho', 'BK-010', 'KHE-0251', '2026-10-05'),
  loan('LN-0104', 'org-kericho', 'BK-012', 'KHE-0187', '2026-09-28'),
  // Overdue
  loan('LN-0098', 'org-kericho', 'BK-008', 'KHE-0244', '2026-09-02'),
  loan('LN-0099', 'org-kericho', 'BK-013', 'KHE-0270', '2026-08-25', { dueOn: '2026-09-22', renewed: true }),
  // History
  loan('LN-0090', 'org-kericho', 'BK-006', 'KHE-0290', '2026-08-03', { status: 'Returned', returnedOn: '2026-08-15' }),
  loan('LN-0091', 'org-kericho', 'BK-007', 'KHE-0276', '2026-08-10', { status: 'Returned', returnedOn: '2026-08-29', dueOn: '2026-09-07', renewed: true }),
  loan('LN-0092', 'org-kericho', 'BK-014', 'KHE-0263', '2026-07-14', { status: 'Lost', charge: 800, chargeRef: 'LIB-LOST-LN-0092' }),
  loan('LN-0105', 'org-factory', 'BK-016', 'KPF-1130', '2026-09-29')
];

export const SEED_RESERVATIONS: LibraryReservation[] = [
  { id: 'RS-011', orgId: 'org-kericho', bookId: 'BK-001', staffId: 'KHE-0276', on: '2026-10-02', status: 'Waiting' },
  { id: 'RS-012', orgId: 'org-kericho', bookId: 'BK-003', staffId: 'KHE-0160', on: '2026-09-20', status: 'Fulfilled' }
];

export const SEED_COHORTS: InternCohort[] = [
  {
    id: 'INT-2026-B',
    orgId: 'org-kericho',
    programme: 'Graduate internship',
    name: 'Graduate internship — Jul 2026 to Jun 2027',
    startOn: '2026-07-01',
    endOn: '2027-06-30',
    stipend: 25_000,
    slots: [
      { department: 'Finance & Administration', slots: 2 },
      { department: 'Production & Quality Control', slots: 1 },
      { department: 'Information Technology', slots: 1 }
    ],
    coordinatorId: 'KHE-0290',
    status: 'Running'
  },
  {
    id: 'ATT-2026-3',
    orgId: 'org-kericho',
    programme: 'Industrial attachment',
    name: 'Industrial attachment — Sep to Dec 2026',
    startOn: '2026-09-07',
    endOn: '2026-12-04',
    stipend: 6_000,
    slots: [
      { department: 'Production & Quality Control', slots: 2 },
      { department: 'Engineering & Maintenance', slots: 2 },
      { department: 'OSH & Compliance', slots: 1 }
    ],
    coordinatorId: 'KHE-0290',
    status: 'Running'
  }
];

const ip = (id: string, cohortId: string, name: string, institution: string, course: string, year: string, extra: Partial<InternPlacement>): InternPlacement => ({
  id,
  orgId: 'org-kericho',
  cohortId,
  name,
  phone: `+254 7${id.slice(-2)} 4${id.slice(-2)} 2${id.slice(-2)}`,
  email: `${name.toLowerCase().split(' ')[0]}.${name.toLowerCase().split(' ').slice(-1)[0]}@students.example.ke`,
  institution,
  course,
  year,
  status: 'Placed',
  ...extra
});

const wiba = (ref: string, expiresOn: string) => ({ kind: 'WIBA (company)' as const, ref, expiresOn });
const student = (ref: string, expiresOn: string) => ({ kind: 'Student cover' as const, ref, expiresOn });

export const SEED_PLACEMENTS: InternPlacement[] = [
  ip('IP-01', 'INT-2026-B', 'Cynthia Jerop Kirui', 'University of Eldoret', 'BCom (Accounting)', '2025 graduate', { letterRef: 'UoE/CDS/2026/118', insurance: wiba('APA/WIBA/2026/INT-01', '2027-06-30'), department: 'Finance & Administration', supervisorId: 'KHE-0134' }),
  ip('IP-02', 'INT-2026-B', 'Brian Kipngetich Langat', 'Moi University', 'BSc Information Technology', '2025 graduate', { letterRef: 'MU/ICT/2026/044', insurance: wiba('APA/WIBA/2026/INT-02', '2027-06-30'), department: 'Information Technology', supervisorId: 'KHE-0178' }),
  ip('IP-03', 'INT-2026-B', 'Mercy Wanjala', 'Egerton University', 'BSc Food Science & Technology', '2025 graduate', { letterRef: 'EGU/FST/2026/209', insurance: wiba('APA/WIBA/2026/INT-03', '2027-06-30'), department: 'Production & Quality Control', supervisorId: 'KHE-0276' }),
  ip('IP-04', 'INT-2026-B', 'Dennis Otieno Ochieng', 'Kenyatta University', 'BA Human Resource Management', '2026 graduate', { letterRef: 'KU/HRM/2026/71', status: 'Applied' }),
  ip('IP-05', 'ATT-2026-3', 'Sharon Chelangat', 'Kericho TVC', 'Diploma Mechanical Engineering', 'Year 2', { letterRef: 'KTVC/ATT/2026/310', insurance: student('Jubilee/STU/2026/5521', '2026-12-31'), department: 'Engineering & Maintenance', supervisorId: 'KHE-0270' }),
  ip('IP-06', 'ATT-2026-3', 'Kelvin Kiprotich Mutai', 'Kericho TVC', 'Diploma Electrical Engineering', 'Year 3', { letterRef: 'KTVC/ATT/2026/312', insurance: student('Jubilee/STU/2026/5530', '2026-12-31'), department: 'Engineering & Maintenance', supervisorId: 'KHE-0270' }),
  ip('IP-07', 'ATT-2026-3', 'Lilian Achieng Odera', 'Maseno University', 'BSc Food Science', 'Year 3', { letterRef: 'MSU/ATT/2026/88', insurance: student('UAP/STU/2026/7712', '2026-12-31'), department: 'Production & Quality Control', supervisorId: 'KHE-0276' }),
  ip('IP-08', 'ATT-2026-3', 'Ian Kiplagat Too', 'Rift Valley Technical Training Institute', 'Diploma OSH', 'Year 2', { letterRef: 'RVTTI/2026/0451', insurance: student('Madison/STU/2026/1180', '2026-12-31'), department: 'OSH & Compliance', supervisorId: 'KHE-0171' }),
  ip('IP-09', 'ATT-2026-3', 'Purity Nyambura Kamau', 'Kenyatta University', 'BSc Agriculture', 'Year 3', { letterRef: 'KU/AGR/2026/219', status: 'Applied' })
];

const stip = (placementId: string, cohortId: string, month: string, amount: number, status: InternStipend['status'], paidOn?: string): InternStipend => ({
  id: `STP-${placementId}-${month}`,
  orgId: 'org-kericho',
  placementId,
  cohortId,
  month,
  amount,
  status,
  paidOn,
  ref: `STP/${month}/${placementId}`
});

const paidMonths: [string, string][] = [
  ['2026-07', '2026-07-31'],
  ['2026-08', '2026-08-31'],
  ['2026-09', '2026-09-30']
];

export const SEED_STIPENDS: InternStipend[] = [
  ...['IP-01', 'IP-02', 'IP-03'].flatMap((p) => paidMonths.map(([m, on]) => stip(p, 'INT-2026-B', m, 25_000, 'Paid', on))),
  ...['IP-05', 'IP-06', 'IP-07', 'IP-08'].map((p) => stip(p, 'ATT-2026-3', '2026-09', 6_000, 'Paid', '2026-09-30'))
];
