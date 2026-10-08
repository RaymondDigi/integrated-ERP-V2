import type { HREmployee } from '../types';
import { addDays, addMonths, daysBetween, todayIso } from './hireEngine';

/* ------------------------------------------------------------------ employee events */

export type EventKind = 'ACTING' | 'DEMOTION' | 'REASSIGNMENT' | 'SUSPENSION' | 'REHIRE' | 'RETIREMENT_NOTICE' | 'CONTRACT_NOTICE';
export type SuspensionPay = 'FULL' | 'HALF' | 'NONE';

export const EVENT_LABEL: Record<EventKind, string> = {
  ACTING: 'Acting appointment',
  DEMOTION: 'Demotion',
  REASSIGNMENT: 'Duty reassignment',
  SUSPENSION: 'Suspension',
  REHIRE: 'Re-hire',
  RETIREMENT_NOTICE: 'Retirement notice',
  CONTRACT_NOTICE: 'Contract expiry notice'
};

export const SUSPENSION_PAY_LABEL: Record<SuspensionPay, string> = { FULL: 'With full pay', HALF: 'On half pay', NONE: 'Without pay' };

export interface EmployeeEvent {
  id: string;
  orgId: string;
  staffId: string;
  staffName: string;
  kind: EventKind;
  effectiveDate: string;
  /** Period of the event (acting, suspension) */
  from?: string;
  to?: string;
  fromValue: string;
  toValue: string;
  reason: string;
  approvedBy: string;
  recordedBy: string;
  recordedOn: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ENDED_EARLY' | 'LIFTED' | 'ISSUED';
  acting?: { designation: string; amount: number; pct?: number; payItemId?: string; firstPeriod?: string; endPeriod?: string };
  suspension?: { pay: SuspensionPay; reductionId?: string; liftedOn?: string; liftedBy?: string };
  /** Retirement or contract end date the notice is about */
  noticeFor?: string;
  note?: string;
}

/* ------------------------------------------------------------------ qualifications */

export type QualKind = 'Academic' | 'Professional' | 'Skill';
export const ACADEMIC_LEVELS = ['Certificate', 'Diploma', 'Higher Diploma', 'Degree', 'Postgraduate Diploma', 'Masters', 'PhD'] as const;
export const PROFESSIONAL_BODIES = [
  'ICPAK — Institute of Certified Public Accountants of Kenya',
  'IHRM — Institute of Human Resource Management',
  'LSK — Law Society of Kenya',
  'EBK — Engineers Board of Kenya',
  'NEMA — Lead expert registration',
  'KEBS — Kenya Bureau of Standards',
  'ICS — Institute of Certified Secretaries',
  'KISM — Kenya Institute of Supplies Management',
  'DOSHS — Directorate of OSH Services',
  'NTSA — National Transport & Safety Authority',
  'ISACA',
  'Other'
];
export const SKILL_LEVELS = ['Basic', 'Intermediate', 'Advanced', 'Expert'] as const;

export interface Qualification {
  id: string;
  orgId: string;
  staffId: string;
  kind: QualKind;
  /** Academic level (Certificate … PhD) */
  level?: (typeof ACADEMIC_LEVELS)[number];
  /** e.g. BCom (Accounting), CPA (K), Forklift operation */
  title: string;
  /** University, college or professional body */
  institution: string;
  membershipNo?: string;
  year?: number;
  validUntil?: string;
  proficiency?: (typeof SKILL_LEVELS)[number];
  verified: boolean;
  addedBy: string;
  addedOn: string;
}

/* ------------------------------------------------------------------ outsourced labour */

export const OUTSOURCE_SERVICES = ['Security', 'Cleaning', 'Tea plucking', 'Transport', 'Catering', 'Loading & casual labour', 'Maintenance'] as const;
export type RateBasis = 'HEAD_MONTH' | 'MAN_DAY' | 'FIXED_MONTH';
export const RATE_BASIS_LABEL: Record<RateBasis, string> = { HEAD_MONTH: 'per guard/worker a month', MAN_DAY: 'per man-day', FIXED_MONTH: 'fixed a month' };

export interface OutsourcedMonth {
  month: string;
  numbers: number;
  manDays: number;
  invoiceKes: number;
  invoiceNo?: string;
  recordedBy: string;
  recordedOn: string;
}

export interface OutsourcedContract {
  id: string;
  orgId: string;
  contractor: string;
  service: (typeof OUTSOURCE_SERVICES)[number];
  start: string;
  end: string;
  rateKes: number;
  rateBasis: RateBasis;
  /** Agreed headcount on the contract */
  agreedHeads: number;
  site: string;
  contactName: string;
  contactPhone: string;
  months: OutsourcedMonth[];
  renewals: { on: string; previousEnd: string; newEnd: string; rateKes: number; by: string }[];
  status: 'ACTIVE' | 'ENDED';
}

/** Invoice the rate gives for a month's numbers. */
export const expectedInvoice = (c: Pick<OutsourcedContract, 'rateKes' | 'rateBasis'>, numbers: number, manDays: number) =>
  c.rateBasis === 'HEAD_MONTH' ? numbers * c.rateKes : c.rateBasis === 'MAN_DAY' ? manDays * c.rateKes : c.rateKes;

/* ------------------------------------------------------------------ dates */

/** Month key ('YYYY-MM') `n` months from the open period (the month after the last payday, the 25th). */
const NOW = new Date();
const OPEN = new Date(NOW.getFullYear(), NOW.getMonth() + (NOW.getDate() >= 25 ? 1 : 0), 1);
export const monthRel = (n: number) => {
  const d = new Date(OPEN.getFullYear(), OPEN.getMonth() + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const monthOf = (iso: string) => iso.slice(0, 7);
export const lastDayOf = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};
export const prevMonth = (month: string) => monthOf(addMonths(`${month}-01`, -1));

/** Retirement date from the record, else date of birth + retirement age (default 60). */
export const retirementOf = (e: HREmployee) => e.retirementDate ?? (e.dateOfBirth ? addMonths(e.dateOfBirth, 12 * (e.retirementAge ?? 60)) : undefined);

/** Whole years between two dates. */
export const yearsBetween = (from: string, to: string) => {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return ty - fy - (tm < fm || (tm === fm && td < fd) ? 1 : 0);
};

/** Days until a date (negative once passed). */
export const daysTo = (iso: string, today = todayIso()) => daysBetween(today, iso);

/* ------------------------------------------------------------------ seeds */

const HR = 'Rose Chepkoech';
const T = todayIso();

export const buildEventSeed = (): EmployeeEvent[] => [
  {
    id: 'EVT-2026-001',
    orgId: 'org-kericho',
    staffId: 'KHE-0160',
    staffName: 'Esther Muthoni',
    kind: 'ACTING',
    effectiveDate: `${monthRel(-1)}-01`,
    from: `${monthRel(-1)}-01`,
    to: lastDayOf(monthRel(2)),
    fromValue: 'Operations Manager',
    toValue: 'Acting General Manager',
    reason: 'General Manager on secondment to the group office — board minute 14/2026',
    approvedBy: 'David Kiprono Rono',
    recordedBy: HR,
    recordedOn: `${monthRel(-1)}-01`,
    status: 'ACTIVE',
    acting: { designation: 'General Manager', amount: 25_000, payItemId: 'PI-0014', firstPeriod: monthRel(-1), endPeriod: monthRel(2) }
  },
  {
    id: 'EVT-2026-002',
    orgId: 'org-kericho',
    staffId: 'KHE-0251',
    staffName: 'Mary Wambui',
    kind: 'ACTING',
    effectiveDate: `${monthRel(-6)}-03`,
    from: `${monthRel(-6)}-03`,
    to: lastDayOf(monthRel(-5)),
    fromValue: 'Operations Officer',
    toValue: 'Acting Operations Manager',
    reason: 'Cover while the Operations Manager was on maternity leave',
    approvedBy: 'David Kiprono Rono',
    recordedBy: HR,
    recordedOn: `${monthRel(-6)}-02`,
    status: 'COMPLETED',
    acting: { designation: 'Operations Manager', amount: 14_000, pct: 20, firstPeriod: monthRel(-6), endPeriod: monthRel(-5) }
  },
  {
    id: 'EVT-2026-003',
    orgId: 'org-kericho',
    staffId: 'KHE-1108',
    staffName: 'Victor Chebet',
    kind: 'DEMOTION',
    effectiveDate: '2025-11-03',
    fromValue: 'Shift Supervisor · JG-10 · KES 75,000',
    toValue: 'Machine Operator · JG-06 · KES 40,000',
    reason: 'Final written warning upheld on appeal (DC-2025-018); demoted instead of dismissal, as agreed with the union',
    approvedBy: 'Esther Muthoni',
    recordedBy: HR,
    recordedOn: '2025-10-28',
    status: 'COMPLETED'
  },
  {
    id: 'EVT-2026-004',
    orgId: 'org-kericho',
    staffId: 'KHE-0263',
    staffName: 'John Kiprop',
    kind: 'REASSIGNMENT',
    effectiveDate: addDays(T, -40),
    fromValue: 'Main Site stores · reports to Mary Wambui',
    toValue: 'Site C stores and fuel issue · reports to Esther Muthoni',
    reason: 'Site C store opened for the plucking season; needs an experienced storekeeper',
    approvedBy: 'Esther Muthoni',
    recordedBy: HR,
    recordedOn: addDays(T, -42),
    status: 'COMPLETED'
  },
  {
    id: 'EVT-2026-005',
    orgId: 'org-kericho',
    staffId: 'KHE-1112',
    staffName: 'Elijah Achieng',
    kind: 'SUSPENSION',
    effectiveDate: addDays(T, -6),
    from: addDays(T, -6),
    to: addDays(T, 8),
    fromValue: 'Active',
    toValue: 'Suspended on half pay',
    reason: 'Investigation into 14 cartons missing from the packing store (case DC-2026-031)',
    approvedBy: 'Esther Muthoni',
    recordedBy: HR,
    recordedOn: addDays(T, -6),
    status: 'ACTIVE',
    suspension: { pay: 'HALF' }
  },
  {
    id: 'EVT-2026-006',
    orgId: 'org-kericho',
    staffId: 'KHE-1102',
    staffName: 'Kevin Adhiambo',
    kind: 'SUSPENSION',
    effectiveDate: `${monthRel(-3)}-11`,
    from: `${monthRel(-3)}-11`,
    to: `${monthRel(-3)}-24`,
    fromValue: 'Active',
    toValue: 'Suspended without pay',
    reason: 'Reported to work under the influence (second offence)',
    approvedBy: 'Esther Muthoni',
    recordedBy: HR,
    recordedOn: `${monthRel(-3)}-11`,
    status: 'LIFTED',
    suspension: { pay: 'NONE', liftedOn: `${monthRel(-3)}-18`, liftedBy: HR },
    note: 'Lifted early after the hearing; 7 days unpaid.'
  },
  {
    id: 'EVT-2026-007',
    orgId: 'org-kericho',
    staffId: 'KHE-0244',
    staffName: 'Peter Mwangi',
    kind: 'REHIRE',
    effectiveDate: '2022-03-14',
    fromValue: 'Left 30 Jun 2020 (resigned) — Sales Representative',
    toValue: 'Re-hired as Commercial Officer, permanent',
    reason: 'Former employee with good record; applied for the advertised Commercial Officer post',
    approvedBy: 'Lucy Njeri',
    recordedBy: HR,
    recordedOn: '2022-03-07',
    status: 'COMPLETED'
  },
  {
    id: 'EVT-2026-008',
    orgId: 'org-kericho',
    staffId: 'KHE-0263',
    staffName: 'John Kiprop',
    kind: 'RETIREMENT_NOTICE',
    effectiveDate: addDays(T, -21),
    fromValue: 'Storekeeper',
    toValue: 'Retires on reaching 60',
    reason: 'Normal retirement age — handover to start, pension forms sent',
    approvedBy: 'Esther Muthoni',
    recordedBy: HR,
    recordedOn: addDays(T, -21),
    status: 'ISSUED',
    noticeFor: '2026-11-20'
  },
  {
    id: 'EVT-2026-009',
    orgId: 'org-factory',
    staffId: 'KPF-1123',
    staffName: 'Diana Omondi',
    kind: 'ACTING',
    effectiveDate: `${monthRel(-2)}-01`,
    from: `${monthRel(-2)}-01`,
    to: lastDayOf(monthRel(-1)),
    fromValue: 'Shift Supervisor',
    toValue: 'Acting Factory Manager',
    reason: 'Factory Manager on annual leave and training',
    approvedBy: 'Winnie Kiplagat',
    recordedBy: HR,
    recordedOn: `${monthRel(-2)}-01`,
    status: 'COMPLETED',
    acting: { designation: 'Factory Manager', amount: 15_000, pct: 20, firstPeriod: monthRel(-2), endPeriod: monthRel(-1) }
  }
];

type Q = Omit<Qualification, 'id' | 'orgId' | 'addedBy' | 'addedOn' | 'verified'> & { verified?: boolean };
const q = (orgId: string, list: Q[], start: number): Qualification[] =>
  list.map((x, i) => ({ verified: true, ...x, id: `QL-${String(start + i).padStart(4, '0')}`, orgId, addedBy: HR, addedOn: '2026-02-10' }));

export const buildQualificationSeed = (): Qualification[] => [
  ...q(
    'org-kericho',
    [
      { staffId: 'KHE-0120', kind: 'Academic', level: 'Masters', title: 'MBA (Finance)', institution: 'Strathmore University', year: 2012 },
      { staffId: 'KHE-0120', kind: 'Academic', level: 'Degree', title: 'BCom (Accounting)', institution: 'University of Nairobi', year: 2004 },
      { staffId: 'KHE-0120', kind: 'Professional', title: 'CPA (K) — full member', institution: 'ICPAK — Institute of Certified Public Accountants of Kenya', membershipNo: 'ICPAK/M/7781', year: 2006, validUntil: '2026-12-31' },
      { staffId: 'KHE-0134', kind: 'Academic', level: 'Degree', title: 'BCom (Finance)', institution: 'Moi University', year: 2008 },
      { staffId: 'KHE-0134', kind: 'Professional', title: 'CPA (K) — full member', institution: 'ICPAK — Institute of Certified Public Accountants of Kenya', membershipNo: 'ICPAK/M/11408', year: 2011, validUntil: '2026-12-31' },
      { staffId: 'KHE-0187', kind: 'Academic', level: 'Degree', title: 'BCom (Accounting)', institution: 'Kenyatta University', year: 2019 },
      { staffId: 'KHE-0187', kind: 'Professional', title: 'CPA (K) — section 5 in progress', institution: 'ICPAK — Institute of Certified Public Accountants of Kenya', verified: false },
      { staffId: 'KHE-0290', kind: 'Academic', level: 'Degree', title: 'BA (Human Resource Management)', institution: 'Egerton University', year: 2015 },
      { staffId: 'KHE-0290', kind: 'Academic', level: 'Postgraduate Diploma', title: 'PGD Human Resource Management', institution: 'Kenya Institute of Management', year: 2019 },
      { staffId: 'KHE-0290', kind: 'Professional', title: 'Certified HR Professional (CHRP-K)', institution: 'IHRM — Institute of Human Resource Management', membershipNo: 'IHRM/P/3307', year: 2020, validUntil: addDays(T, 52) },
      { staffId: 'KHE-0290', kind: 'Skill', title: 'Payroll and statutory returns (iTax, NSSF, SHA)', institution: 'On the job', proficiency: 'Expert' },
      { staffId: 'KHE-0141', kind: 'Academic', level: 'Degree', title: 'LLB', institution: 'University of Nairobi', year: 2007 },
      { staffId: 'KHE-0141', kind: 'Professional', title: 'Advocate of the High Court', institution: 'LSK — Law Society of Kenya', membershipNo: 'LSK/2009/4412', year: 2009, validUntil: '2026-12-31' },
      { staffId: 'KHE-0141', kind: 'Professional', title: 'Certified Public Secretary (CPS-K)', institution: 'ICS — Institute of Certified Secretaries', membershipNo: 'ICS/1288', year: 2010, validUntil: addDays(T, -18) },
      { staffId: 'KHE-0171', kind: 'Academic', level: 'Masters', title: 'MSc Occupational Safety and Health', institution: 'JKUAT', year: 2016 },
      { staffId: 'KHE-0171', kind: 'Professional', title: 'Approved OSH Advisor', institution: 'DOSHS — Directorate of OSH Services', membershipNo: 'DOSHS/OSHA/0921', year: 2017, validUntil: addDays(T, 75) },
      { staffId: 'KHE-0171', kind: 'Professional', title: 'EIA/EA Lead Expert', institution: 'NEMA — Lead expert registration', membershipNo: 'NEMA/EIA/ERTL/2231', year: 2018, validUntil: '2027-06-30' },
      { staffId: 'KHE-0276', kind: 'Academic', level: 'Diploma', title: 'Diploma in Food Science and Technology', institution: 'Kenya Polytechnic', year: 2017 },
      { staffId: 'KHE-0276', kind: 'Professional', title: 'HACCP Level 3 / ISO 22000 internal auditor', institution: 'KEBS — Kenya Bureau of Standards', year: 2023, validUntil: '2027-03-31' },
      { staffId: 'KHE-0270', kind: 'Academic', level: 'Diploma', title: 'Diploma in Electrical Engineering', institution: 'Kericho TTI', year: 2018 },
      { staffId: 'KHE-0270', kind: 'Professional', title: 'Graduate Technician', institution: 'EBK — Engineers Board of Kenya', membershipNo: 'EBK/GT/5520', year: 2020, validUntil: addDays(T, -60) },
      { staffId: 'KHE-0178', kind: 'Academic', level: 'Degree', title: 'BSc Computer Science', institution: 'Maseno University', year: 2011 },
      { staffId: 'KHE-0178', kind: 'Professional', title: 'CISA', institution: 'ISACA', membershipNo: 'CISA-1820094', year: 2019, validUntil: '2027-01-31' },
      { staffId: 'KHE-0280', kind: 'Skill', title: 'Network and CCTV maintenance', institution: 'Cisco Networking Academy', year: 2022, proficiency: 'Intermediate' },
      { staffId: 'KHE-0301', kind: 'Professional', title: 'Driving licence classes B, C, CE + PSV badge', institution: 'NTSA — National Transport & Safety Authority', membershipNo: 'DL-77310452', validUntil: addDays(T, 34) },
      { staffId: 'KHE-0302', kind: 'Professional', title: 'Driving licence classes B, C', institution: 'NTSA — National Transport & Safety Authority', membershipNo: 'DL-80144617', validUntil: '2028-05-14' },
      { staffId: 'KHE-0263', kind: 'Academic', level: 'Certificate', title: 'Certificate in Stores Management', institution: 'Kenya Institute of Supplies Management', year: 1994 },
      { staffId: 'KHE-1108', kind: 'Skill', title: 'CTC machine operation and line changeover', institution: 'On the job', proficiency: 'Advanced' },
      { staffId: 'KHE-0152', kind: 'Academic', level: 'Masters', title: 'MA Marketing', institution: 'USIU-Africa', year: 2014 }
    ],
    1
  ),
  ...q(
    'org-factory',
    [
      { staffId: 'KHE-1021', kind: 'Academic', level: 'Degree', title: 'BSc Electrical & Electronic Engineering', institution: 'JKUAT', year: 2014 },
      { staffId: 'KHE-1021', kind: 'Professional', title: 'Professional Engineer', institution: 'EBK — Engineers Board of Kenya', membershipNo: 'EBK/PE/2618', year: 2019, validUntil: addDays(T, 21) },
      { staffId: 'KPF-1121', kind: 'Academic', level: 'Degree', title: 'BSc Food Science and Technology', institution: 'Egerton University', year: 2009 },
      { staffId: 'KPF-1130', kind: 'Academic', level: 'Diploma', title: 'Diploma in Analytical Chemistry', institution: 'Kenya Industrial Training Institute', year: 2016 }
    ],
    40
  )
];

const months6 = (base: { numbers: number; manDays: number; invoice: (n: number, d: number) => number }, wobble: number[]): OutsourcedMonth[] =>
  [-6, -5, -4, -3, -2, -1].map((k, i) => {
    const numbers = base.numbers + wobble[i];
    const manDays = Math.round(base.manDays * (numbers / base.numbers));
    return { month: monthRel(k), numbers, manDays, invoiceKes: base.invoice(numbers, manDays), invoiceNo: `INV-${monthRel(k).replace('-', '')}-${100 + i}`, recordedBy: HR, recordedOn: `${monthRel(k + 1)}-05` };
  });

export const buildOutsourcedSeed = (): OutsourcedContract[] => [
  {
    id: 'OSC-001',
    orgId: 'org-kericho',
    contractor: 'Riftguard Security Services Ltd',
    service: 'Security',
    start: '2024-11-01',
    end: addDays(T, 38),
    rateKes: 28_500,
    rateBasis: 'HEAD_MONTH',
    agreedHeads: 18,
    site: 'Kericho Highland Estates — all gates and factory perimeter',
    contactName: 'Josphat Langat',
    contactPhone: '+254 722 610 284',
    months: months6({ numbers: 18, manDays: 540, invoice: (n) => n * 28_500 }, [0, 0, 1, 0, -1, 0]),
    renewals: [{ on: '2025-10-20', previousEnd: '2025-10-31', newEnd: addDays(T, 38), rateKes: 28_500, by: 'David Otieno' }],
    status: 'ACTIVE'
  },
  {
    id: 'OSC-002',
    orgId: 'org-kericho',
    contractor: 'Sparkle Hygiene Solutions',
    service: 'Cleaning',
    start: '2025-07-01',
    end: '2027-06-30',
    rateKes: 145_000,
    rateBasis: 'FIXED_MONTH',
    agreedHeads: 6,
    site: 'Offices, canteen and staff quarters',
    contactName: 'Mercy Atieno',
    contactPhone: '+254 711 402 917',
    months: months6({ numbers: 6, manDays: 156, invoice: () => 145_000 }, [0, 0, 0, 0, 0, 0]),
    renewals: [],
    status: 'ACTIVE'
  },
  {
    id: 'OSC-003',
    orgId: 'org-kericho',
    contractor: 'Chepsir Labour Contractors',
    service: 'Tea plucking',
    start: '2026-01-05',
    end: addDays(T, 55),
    rateKes: 720,
    rateBasis: 'MAN_DAY',
    agreedHeads: 120,
    site: 'Estate blocks C and D',
    contactName: 'Wilson Kirui',
    contactPhone: '+254 733 518 006',
    months: months6({ numbers: 110, manDays: 2_640, invoice: (_n, d) => d * 720 }, [-24, -10, 12, 18, 6, -4]),
    renewals: [],
    status: 'ACTIVE'
  },
  {
    id: 'OSC-004',
    orgId: 'org-kericho',
    contractor: 'Kipsigis Haulage & Logistics',
    service: 'Transport',
    start: '2025-03-01',
    end: '2027-02-28',
    rateKes: 410_000,
    rateBasis: 'FIXED_MONTH',
    agreedHeads: 9,
    site: 'Green leaf collection — buying centres to factory',
    contactName: 'Daniel Rotich',
    contactPhone: '+254 720 334 771',
    months: months6({ numbers: 9, manDays: 234, invoice: () => 410_000 }, [0, 0, 1, 1, 0, 0]),
    renewals: [],
    status: 'ACTIVE'
  },
  {
    id: 'OSC-005',
    orgId: 'org-factory',
    contractor: 'Unit Loaders Cooperative',
    service: 'Loading & casual labour',
    start: '2025-09-01',
    end: addDays(T, -12),
    rateKes: 650,
    rateBasis: 'MAN_DAY',
    agreedHeads: 25,
    site: 'Factory dispatch bay',
    contactName: 'Hillary Kiprotich',
    contactPhone: '+254 712 990 145',
    months: months6({ numbers: 22, manDays: 520, invoice: (_n, d) => d * 650 }, [0, 2, 3, -2, 1, 0]),
    renewals: [],
    status: 'ACTIVE'
  }
];
