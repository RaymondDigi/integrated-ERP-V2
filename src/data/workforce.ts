import { demoPersonalEmail } from '../utils/emailRouting';
import type { HREmployee } from '../types';
import { INITIAL_HR_EMPLOYEES } from './hrMockData';
import { SEED_DOB_OFFSETS } from './hcmConfig';

/**
 * The whole workforce for every company in the group.
 *
 * - Keeps every named employee from the original sample data.
 * - Adds the people who act in Finance, Trading, Operations and Control
 *   (Grace, David, Amina, Peter, Lucy, Esther, …) so the same person exists everywhere.
 * - Adds staff that leave, attendance and separation records already refer to.
 * - Fills each company with a realistic team; deterministic so the demo is stable.
 */

type Seed = {
  staffId: string;
  fullName: string;
  department: string;
  jobTitle: string;
  basic: number;
  contract?: string;
  dailyRate?: number;
  joined?: string;
  tax?: HREmployee['tax'];
  status?: HREmployee['status'];
  exitDate?: string;
};

const BRANCH: Record<string, string> = {
  'org-kericho': 'Kericho Highland Estates',
  'org-factory': 'Kericho Factory Unit 1',
  'org-nandi': 'Nandi Hills Outgrowers',
  'org-rift': 'Rift Valley Agricultural Holding',
  'org-nairobi': 'Corporate HQ Nairobi'
};

const FIRST = ['Wanjiru', 'Kamau', 'Achieng', 'Otieno', 'Chebet', 'Kiplagat', 'Njeri', 'Mwangi', 'Atieno', 'Kipkemboi', 'Wairimu', 'Odhiambo', 'Jepchirchir', 'Mutua', 'Nyambura', 'Kiprotich', 'Akinyi', 'Ndungu', 'Jeptoo', 'Omondi', 'Muthoni', 'Kibet', 'Adhiambo', 'Kariuki', 'Chepkoech', 'Wekesa', 'Nafula', 'Barasa', 'Moraa', 'Onyango'];
const GIVEN = ['Mercy', 'Daniel', 'Esther', 'Joseph', 'Lilian', 'Brian', 'Purity', 'Kevin', 'Faith', 'Collins', 'Ann', 'Dennis', 'Caroline', 'Victor', 'Janet', 'Felix', 'Rose', 'Elijah', 'Beatrice', 'Allan', 'Gladys', 'Moses', 'Sharon', 'Isaac', 'Naomi', 'Patrick', 'Winnie', 'Samuel', 'Diana', 'Geoffrey'];
const name = (i: number) => `${GIVEN[i % GIVEN.length]} ${FIRST[(i * 7 + 3) % FIRST.length]}`;
// GIVEN alternates female, male
const genderOf = (i: number): HREmployee['gender'] => ((i % GIVEN.length) % 2 === 0 ? 'Female' : 'Male');

/** Gender of the named employees (leave eligibility reads it from the employee master). */
const NAMED_GENDER: Record<string, HREmployee['gender']> = {
  'KHE-0419': 'Male', 'KHE-0892': 'Female', 'CAS-1402': 'Male', 'CAS-1405': 'Female', 'KHE-1021': 'Male', 'NHO-0312': 'Male',
  'KHE-0120': 'Female', 'KHE-0134': 'Male', 'KHE-0187': 'Female', 'KHE-0141': 'Female', 'KHE-0152': 'Female', 'KHE-0244': 'Male',
  'KHE-0160': 'Female', 'KHE-0251': 'Female', 'KHE-0263': 'Male', 'KHE-0270': 'Male', 'KHE-0276': 'Female', 'KHE-0171': 'Female',
  'KHE-0280': 'Male', 'KHE-0178': 'Male', 'KHE-0301': 'Male', 'KHE-0302': 'Male', 'KHE-0303': 'Male', 'KHE-0211': 'Male',
  'KHE-0290': 'Female', 'KHE-0295': 'Male', 'KHE-0104': 'Female', 'KHE-0102': 'Male', 'KHE-0231': 'Female', 'KHE-0307': 'Male',
  'KHE-0288': 'Male', 'KHE-0914': 'Female', 'CAS-1390': 'Female', 'CAS-1418': 'Male'
};

/** Fixed-term contract end dates. */
const CONTRACT_END: Record<string, string> = { 'KHE-0295': '2026-11-02', 'KHE-1021': '2027-01-31' };

const STD = 'Standard Employment Contract';
const FIXED = 'Fixed-Term Contract';
const DAILY = 'Daily-Rated Contract';

/** People who also act in the other modules — all on the main company's payroll. */
const MAIN_NAMED: Seed[] = [
  { staffId: 'KHE-0120', fullName: 'Amina Hassan', department: 'Finance & Administration', jobTitle: 'Finance Director', basic: 300_000, joined: '2018-01-08' },
  { staffId: 'KHE-0134', fullName: 'David Otieno', department: 'Finance & Administration', jobTitle: 'Finance Manager', basic: 180_000, joined: '2019-05-13' },
  { staffId: 'KHE-0187', fullName: 'Grace Wanjiku', department: 'Finance & Administration', jobTitle: 'Accountant', basic: 70_000, joined: '2021-09-01' },
  { staffId: 'KHE-0141', fullName: 'Agnes Wairimu', department: 'Finance & Administration', jobTitle: 'Company Secretary', basic: 160_000, joined: '2020-02-03' },
  { staffId: 'KHE-0152', fullName: 'Lucy Njeri', department: 'Sales & Marketing', jobTitle: 'Commercial Manager', basic: 170_000, joined: '2019-10-07' },
  { staffId: 'KHE-0244', fullName: 'Peter Mwangi', department: 'Sales & Marketing', jobTitle: 'Commercial Officer', basic: 65_000, joined: '2022-03-14' },
  { staffId: 'KHE-0160', fullName: 'Esther Muthoni', department: 'Operations', jobTitle: 'Operations Manager', basic: 180_000, joined: '2018-06-18' },
  { staffId: 'KHE-0251', fullName: 'Mary Wambui', department: 'Operations', jobTitle: 'Operations Officer', basic: 70_000, joined: '2022-01-10' },
  { staffId: 'KHE-0263', fullName: 'John Kiprop', department: 'Operations', jobTitle: 'Storekeeper', basic: 45_000, joined: '2020-11-02' },
  { staffId: 'KHE-0270', fullName: 'Kevin Ouma', department: 'Engineering & Maintenance', jobTitle: 'Maintenance Technician', basic: 50_000, joined: '2021-04-19' },
  { staffId: 'KHE-0276', fullName: 'Faith Akinyi', department: 'Production & Quality Control', jobTitle: 'Quality Controller', basic: 55_000, joined: '2021-08-23' },
  { staffId: 'KHE-0171', fullName: 'Ruth Chebet', department: 'OSH & Compliance', jobTitle: 'QHSE Manager', basic: 140_000, joined: '2019-03-04' },
  { staffId: 'KHE-0280', fullName: 'Brian Kamau', department: 'Information Technology', jobTitle: 'ICT Officer', basic: 60_000, joined: '2023-02-06' },
  { staffId: 'KHE-0178', fullName: 'Samuel Kiptoo', department: 'Information Technology', jobTitle: 'ICT Manager', basic: 150_000, joined: '2020-07-20' },
  { staffId: 'KHE-0301', fullName: 'Samuel Ouma', department: 'Operations', jobTitle: 'Driver', basic: 35_000, joined: '2020-01-15' },
  { staffId: 'KHE-0302', fullName: 'Joseph Mutua', department: 'Operations', jobTitle: 'Driver', basic: 35_000, joined: '2021-06-01' },
  { staffId: 'KHE-0303', fullName: 'Ali Bakari', department: 'Operations', jobTitle: 'Driver', basic: 35_000, joined: '2022-09-12' },
  { staffId: 'KHE-0211', fullName: 'Samuel Cherop Sang', department: 'General Services', jobTitle: 'Security Supervisor', basic: 40_000, joined: '2017-04-03', status: 'TERMINATED', exitDate: '2026-09-30' },
  {
    staffId: 'KHE-0290',
    fullName: 'Rose Chepkoech',
    department: 'Finance & Administration',
    jobTitle: 'HR & Payroll Officer',
    basic: 72_000,
    joined: '2022-05-16',
    tax: { employment: 'PRIMARY', pwdExempt: true, pwdCertificateNo: 'PWD/KRA/22018', pwdCertificateExpiry: '2028-03-31', pwdExemptAmount: 150_000, taxExempt: false }
  },
  {
    staffId: 'KHE-0295',
    fullName: 'Elijah Barasa',
    department: 'Production & Quality Control',
    jobTitle: 'Food Technologist (part-time)',
    basic: 48_000,
    contract: FIXED,
    joined: '2025-11-03',
    tax: { employment: 'SECONDARY', pwdExempt: false, taxExempt: false }
  }
];

/** Staff referenced by leave, attendance and separation records. */
const REFERENCED: (Seed & { orgId: string })[] = [
  { orgId: 'org-nairobi', staffId: 'KHE-0104', fullName: 'Grace Chebet', department: 'Human Resources', jobTitle: 'Group HR Director', basic: 380_000, joined: '2016-09-01' },
  { orgId: 'org-nairobi', staffId: 'KHE-0102', fullName: 'Joseph Kiprono', department: 'Human Resources', jobTitle: 'Group HR Manager', basic: 165_000, joined: '2019-02-04' },
  { orgId: 'org-nairobi', staffId: 'KHE-0231', fullName: 'Faith Wanjiru Mwangi', department: 'Finance & Administration', jobTitle: 'Treasury Analyst', basic: 98_000, joined: '2021-03-01' },
  { orgId: 'org-nairobi', staffId: 'KHE-0307', fullName: 'Brian Mutua Kioko', department: 'Information Technology', jobTitle: 'Systems Administrator', basic: 92_000, joined: '2022-08-15' },
  { orgId: 'org-nairobi', staffId: 'KHE-0288', fullName: 'Peter Otieno Ouma', department: 'Sales & Marketing', jobTitle: 'Key Account Manager', basic: 120_000, joined: '2020-10-05' },
  { orgId: 'org-factory', staffId: 'KHE-0914', fullName: 'Gladys Muthoni Mwangi', department: 'Production & Quality Control', jobTitle: 'Machine Operator', basic: 38_000, joined: '2019-07-22', exitDate: '2026-10-15' },
  { orgId: 'org-factory', staffId: 'CAS-1390', fullName: 'Beatrice Akinyi Odhiambo', department: 'Production & Quality Control', jobTitle: 'Sorting & Grading Operative', basic: 32_000, joined: '2026-06-02' },
  { orgId: 'org-nandi', staffId: 'CAS-1418', fullName: 'Daniel Kipchumba Korir', department: 'Engineering & Maintenance', jobTitle: 'Maintenance Hand', basic: 0, contract: DAILY, dailyRate: 680, joined: '2026-08-11' }
];

/** Generated roles per company: [department, job title, basic, count, contract, daily rate]. */
const TEAMS: Record<string, [string, string, number, number, string?, number?][]> = {
  'org-kericho': [
    ['Production & Quality Control', 'Production Operative', 30_000, 8],
    ['Production & Quality Control', 'Machine Operator', 40_000, 3],
    ['General Services', 'Packer', 26_000, 2],
    ['Sales & Marketing', 'Sales Representative', 52_000, 1],
    ['Finance & Administration', 'Accounts Clerk', 45_000, 1],
    ['General Services', 'Field Operative', 0, 6, DAILY, 700]
  ],
  'org-factory': [
    ['Production & Quality Control', 'Factory Manager', 210_000, 1],
    ['Production & Quality Control', 'Shift Supervisor', 75_000, 2],
    ['Production & Quality Control', 'Machine Operator', 40_000, 6],
    ['Production & Quality Control', 'Lab Technician', 58_000, 2],
    ['Engineering & Maintenance', 'Boiler Operator', 46_000, 2],
    ['General Services', 'Sorting Operative', 0, 6, DAILY, 650]
  ],
  'org-nandi': [
    ['Operations', 'Field Services Manager', 140_000, 1],
    ['Operations', 'Field Officer', 55_000, 3],
    ['Finance & Administration', 'Cooperative Accountant', 68_000, 1],
    ['General Services', 'Field Worker', 0, 16, DAILY, 620]
  ],
  'org-rift': [
    ['Operations', 'Farm Manager', 160_000, 1],
    ['Operations', 'Agronomist', 85_000, 2],
    ['Engineering & Maintenance', 'Mechanic', 48_000, 2],
    ['Finance & Administration', 'Administrator', 52_000, 1],
    ['General Services', 'Farm Hand', 0, 8, DAILY, 600]
  ],
  'org-nairobi': [
    ['Finance & Administration', 'Group Managing Director', 650_000, 1],
    ['Finance & Administration', 'Group Legal Counsel', 260_000, 1],
    ['Finance & Administration', 'Executive Assistant', 75_000, 2],
    ['Human Resources', 'HR Officer', 68_000, 1],
    ['General Services', 'Driver', 38_000, 2]
  ]
};
const PREFIX: Record<string, string> = { 'org-kericho': 'KHE', 'org-factory': 'KPF', 'org-nandi': 'NHO', 'org-rift': 'RVA', 'org-nairobi': 'HQ' };

const mask = (i: number) => ({
  nationalIdMasked: `${20 + (i % 15)}*****${i % 10}`,
  kraPinMasked: `A0${i % 10}*****${'ABCDEFGHJKLMNP'[i % 14]}`,
  nssfNoMasked: `${100 + (i % 800)}****${(i * 3) % 10}`,
  shifNoMasked: `SHIF-****-${String(100 + ((i * 37) % 900))}`,
  bankAccountMasked: `${['KCB', 'Equity', 'Co-op', 'NCBA', 'Absa'][i % 5]} ${10 + (i % 80)}****${String(100 + ((i * 53) % 900))}`,
  mpesaPhoneMasked: `+254 7${String(10 + (i % 89)).padStart(2, '0')} *** ${String(100 + ((i * 71) % 900))}`
});

const email = (fullName: string, casual: boolean) =>
  `${fullName.toLowerCase().split(' ')[0][0]}.${fullName.toLowerCase().split(' ').slice(-1)[0]}@${casual ? 'ops.' : ''}intergrated-erp.ke`;

const make = (orgId: string, s: Seed, i: number): HREmployee => {
  const casual = (s.contract ?? STD) === DAILY;
  return {
    id: `EMP-${String(100 + i).padStart(4, '0')}`,
    orgId,
    staffId: s.staffId,
    fullName: s.fullName,
    email: email(s.fullName, casual),
    personalEmail: demoPersonalEmail(s.fullName, i),
    phone: `+254 7${String(10 + (i % 89)).padStart(2, '0')} ${String(100 + ((i * 37) % 900))} ${String(100 + ((i * 59) % 900))}`,
    ...mask(i),
    contractType: s.contract ?? STD,
    department: s.department,
    branch: BRANCH[orgId],
    jobTitle: s.jobTitle,
    basicSalaryKes: s.basic,
    payRateKes: s.dailyRate,
    joinedDate: s.joined ?? `20${19 + (i % 7)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
    status: s.status ?? (i % 23 === 5 ? 'ON_LEAVE' : 'ACTIVE'),
    tax: s.tax ?? { employment: 'PRIMARY', pwdExempt: false, taxExempt: false },
    retirementAge: 60,
    exitDate: s.exitDate,
    gender: NAMED_GENDER[s.staffId] ?? genderOf(i),
    contractEndDate: CONTRACT_END[s.staffId]
  } as HREmployee;
};

const buildWorkforce = (): HREmployee[] => {
  // Original records, with department names aligned to the organisation structure
  const renamed: Record<string, string> = { 'Finance & Payroll': 'Finance & Administration', 'Production & Factory': 'Engineering & Maintenance', 'Customer Service': 'Sales & Marketing' };
  const out: HREmployee[] = INITIAL_HR_EMPLOYEES.map((e, k) => ({
    ...e,
    personalEmail: e.personalEmail ?? demoPersonalEmail(e.fullName, k + 1),
    department: renamed[e.department] ?? e.department,
    // Piece-rate operatives earn about 48 units a day
    payRateKes: e.payRateKes ?? (e.pieceRatePerUnitKes ? Math.round(e.pieceRatePerUnitKes * 48) : undefined),
    tax: e.tax ?? { employment: 'PRIMARY', pwdExempt: false, taxExempt: false },
    gender: e.gender ?? NAMED_GENDER[e.staffId],
    contractEndDate: e.contractEndDate ?? CONTRACT_END[e.staffId]
  }));
  let i = out.length;
  for (const s of MAIN_NAMED) out.push(make('org-kericho', s, ++i));
  for (const s of REFERENCED) out.push(make(s.orgId, s, ++i));
  let seq = 1100;
  for (const [orgId, roles] of Object.entries(TEAMS))
    for (const [department, jobTitle, basic, count, contract, dailyRate] of roles)
      for (let k = 0; k < count; k++) {
        ++i;
        const casual = contract === DAILY;
        out.push(
          make(orgId, { staffId: `${casual ? 'CAS' : PREFIX[orgId]}-${seq++}`, fullName: name(i), department, jobTitle, basic, contract, dailyRate, joined: casual ? `2026-0${3 + (i % 6)}-${String(1 + (i % 26)).padStart(2, '0')}` : undefined }, i)
        );
      }
  return out;
};

/** Hire module fields on existing staff (probation outcomes and job history); pay, dates and status are untouched. */
const HIRE_FIELDS: Record<string, Partial<HREmployee>> = {
  'KHE-0295': {
    probationMonths: 6,
    probationEndDate: '2026-11-02',
    probationStatus: 'EXTENDED',
    history: [{ date: '2026-04-30', kind: 'Probation extended', summary: 'Probation extended to 2 Nov 2026 (HACCP documentation)', ref: 'CHG-2026-041', by: 'David Kiprono Rono' }]
  },
  'CAS-1402': { history: [{ date: '2026-07-20', kind: 'Joined', summary: 'Joined as Senior Production Operative at KES 696/day', ref: 'ONB-2026-009', by: 'Rose Chepkoech' }] },
  'CAS-1405': { history: [{ date: '2026-08-01', kind: 'Joined', summary: 'Joined as Production Operative at KES 696/day', ref: 'ONB-2026-011', by: 'Rose Chepkoech' }] }
};

/** Personal details the portal user keeps on file (shown in HR, payroll and the employee portal alike). */
const PORTAL_USER: Partial<HREmployee> = {
  email: 'j.kiprono@intergrated-erp.ke',
  // As typed on the portal profile — the portal assistant spots the misspelt domain
  personalEmail: 'joseph.kiprono@gmial.com',
  nextOfKin: { name: 'Mercy Kiprono', relationship: 'Spouse', phone: '+254 733 210 448' },
  nextOfKins: [
    { name: 'Mercy Kiprono', relationship: 'Spouse', phone: '+254 733 210 448', email: 'mercy.kiprono@gmail.com', idNumber: '28****61', benefitPct: 60, primary: true },
    { name: 'Ian Kiprotich Kiprono', relationship: 'Son', phone: '+254 733 210 448', benefitPct: 25 },
    { name: 'Priscah Jeruto Kiprono', relationship: 'Mother', phone: '+254 720 615 302', benefitPct: 15 }
  ],
  phone: '+254 722 418 905',
  nationalIdMasked: '27*****3',
  kraPinMasked: 'A01*****4K',
  nssfNoMasked: '204****7',
  shifNoMasked: 'SHIF-****-418',
  bankAccountMasked: 'Equity Bank 0170****5521',
  mpesaPhoneMasked: '+254 722 *** 905',
  dateOfBirth: '1986-07-19',
  grade: 'JG-12'
};

/** Every work email signs someone in, so it must be unique: later namesakes get j.kiprono2@…, j.kiprono3@… */
const uniqueEmails = (list: HREmployee[]) => {
  const seen = new Map<string, number>();
  const bump = (addr: string) => {
    const [local, domain] = addr.toLowerCase().split('@');
    const n = (seen.get(`${local}@${domain}`) ?? 0) + 1;
    seen.set(`${local}@${domain}`, n);
    return n === 1 ? `${local}@${domain}` : `${local}${n}@${domain}`;
  };
  // Named demo accounts keep their plain address
  for (const e of list) if (e.staffId.startsWith('KHE-0') && e.email) seen.set(e.email.toLowerCase(), 1);
  const personal = new Set<string>();
  return list.map((e) => {
    const out = e.staffId.startsWith('KHE-0') || !e.email ? e : { ...e, email: bump(e.email) };
    // Namesakes would share a demo personal address too; tag the later ones with their staff number
    const pe = out.personalEmail?.toLowerCase();
    if (!pe) return out;
    const unique = personal.has(pe) ? pe.replace('@', `.${out.staffId.replace(/\D/g, '').slice(-3)}@`) : pe;
    personal.add(unique);
    return unique === out.personalEmail ? out : { ...out, personalEmail: unique };
  });
};

export const WORKFORCE: HREmployee[] = uniqueEmails(
  buildWorkforce()
    .map((e) => (HIRE_FIELDS[e.staffId] ? { ...e, ...HIRE_FIELDS[e.staffId] } : e))
    .map((e) => (e.staffId === 'KHE-0102' ? { ...e, ...PORTAL_USER } : e))
    .map((e) => {
      // Long-serving staff get a date of birth so retirement tracking has live cases
      const o = SEED_DOB_OFFSETS[e.staffId];
      if (e.dateOfBirth || !o) return e;
      const t = new Date();
      const d = new Date(t.getFullYear() - o.years, t.getMonth(), t.getDate() + o.days);
      return { ...e, dateOfBirth: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, retirementAge: e.retirementAge ?? 60 };
    })
);
