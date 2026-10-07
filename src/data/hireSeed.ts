/* Seed data for the hire flow. Dates sit around October 2026; staff IDs refer to the workforce. */
import type { EmployeeRequisition, JobApplicant, JobDescription, OnboardingRecord, RequisitionLine } from '../types';
import {
  DEFAULT_CRITERIA,
  DEFAULT_KNOCKOUTS,
  onboardingTemplate,
  sessionTemplate,
  type BackgroundCheck,
  type CheckKind,
  type CommEntry,
  type EmployeeChange,
  type EstablishmentPlan,
  type HireTerms,
  type Interview,
  type ReqDecision,
  type ReqStep,
  type Vacancy
} from './hireConfig';

const KHE = 'Kericho Highland Estates';
const STD = 'Standard Employment Contract';
const FIXED = 'Fixed-Term Contract';
const DAILY = 'Daily-Rated Contract';

// People who act in the flow (org-kericho unless noted)
const P = {
  esther: ['KHE-0160', 'Esther Muthoni'],
  rono: ['KHE-0419', 'David Kiprono Rono'],
  rose: ['KHE-0290', 'Rose Chepkoech'],
  otieno: ['KHE-0134', 'David Otieno'],
  amina: ['KHE-0120', 'Amina Hassan'],
  lucy: ['KHE-0152', 'Lucy Njeri'],
  peter: ['KHE-0244', 'Peter Mwangi'],
  ruth: ['KHE-0171', 'Ruth Chebet'],
  kiptoo: ['KHE-0178', 'Samuel Kiptoo'],
  md: ['HQ-1175', 'Gladys Kariuki']
} as const;
type Who = keyof typeof P;

const dec = (step: ReqStep | 'REQUESTER', who: Who, action: ReqDecision['action'], at: string, comment?: string): ReqDecision => ({
  step,
  by: P[who][1],
  byStaffId: P[who][0],
  action,
  at,
  comment
});

const jd = (p: Partial<JobDescription> & Pick<JobDescription, 'jobPurpose' | 'responsibilities' | 'educationLevel' | 'minExperienceYears' | 'skills'>): JobDescription => ({
  reportsTo: '',
  workLocation: KHE,
  vacancyReason: 'New Position',
  replacingEmployee: '',
  certifications: '',
  workingHours: 'Monday to Friday, 8:00–17:00',
  travelRequired: false,
  ...p
});

const line = (id: string, title: string, gradeScale: string, headcount: number, monthlySalaryKes: number, neededBy: string, jobDescription?: JobDescription): RequisitionLine => ({
  id: `${id}-L1`,
  title,
  gradeScale,
  headcount,
  monthlySalaryKes,
  neededBy,
  jobDescription
});

type ReqSeed = Omit<EmployeeRequisition, 'requisitionNo' | 'branch' | 'currentHeadcount' | 'maxHeadcountBudget' | 'lines' | 'estimatedBudgetKes'> & {
  branch?: string;
  salary: number;
  neededBy: string;
  jd?: JobDescription;
  est?: [number, number];
};

const req = ({ salary, neededBy, jd: desc, est, ...r }: ReqSeed): EmployeeRequisition => ({
  ...r,
  requisitionNo: r.id,
  branch: r.branch ?? KHE,
  currentHeadcount: est?.[0] ?? 0,
  maxHeadcountBudget: est?.[1] ?? 0,
  estimatedBudgetKes: salary * r.headcountRequired,
  lines: [line(r.id, r.title, r.gradeScale, r.headcountRequired, salary, neededBy, desc)]
});

export const INITIAL_REQUISITIONS: EmployeeRequisition[] = [
  req({
    id: 'REQ-2026-001',
    orgId: 'org-kericho',
    title: 'Senior Operations Analyst',
    department: 'Operations',
    headcountRequired: 2,
    status: 'IN_RECRUITMENT',
    requester: 'Esther Muthoni',
    requesterStaffId: 'KHE-0160',
    requestedDate: '2026-08-21',
    submittedDate: '2026-08-24',
    decidedDate: '2026-08-28',
    gradeScale: 'JG-10 (Supervisor)',
    salary: 95_000,
    neededBy: '2026-11-02',
    est: [7, 9],
    vacancyReason: 'Expansion',
    priority: 'High',
    justification: 'Process quality monitoring and ISO 22000 certification at Sites C and D need two analysts before the January audit.',
    vacancyId: 'VAC-2026-001',
    approvals: [
      dec('REQUESTER', 'esther', 'SUBMITTED', '2026-08-24'),
      dec('HOD', 'rono', 'APPROVED', '2026-08-25', 'Requester heads the department, so this came to me.'),
      dec('HR', 'rose', 'APPROVED', '2026-08-26', 'Within the approved establishment of 9.'),
      dec('MD', 'md', 'APPROVED', '2026-08-28')
    ],
    jd: jd({
      reportsTo: 'Operations Manager',
      jobPurpose: 'Analyse field and factory process data and lead improvement projects that cut waste and support certification.',
      responsibilities: ['Track yield, downtime and quality KPIs per site', 'Run root-cause analysis on deviations', 'Prepare ISO 22000 audit evidence', 'Coach supervisors on standard work'],
      educationLevel: "Bachelor's degree in Industrial Engineering, Statistics or similar",
      minExperienceYears: 5,
      skills: ['Lean / Six Sigma', 'Excel and Power BI', 'ISO 22000']
    })
  }),
  req({
    id: 'REQ-2026-002',
    orgId: 'org-factory',
    branch: 'Kericho Factory Unit 1',
    title: 'Industrial Scale Calibration Officer',
    department: 'Production & Quality Control',
    headcountRequired: 1,
    status: 'PENDING_APPROVAL',
    currentStep: 'HR',
    requester: 'Factory Manager',
    requestedDate: '2026-09-18',
    submittedDate: '2026-09-18',
    gradeScale: 'JG-08 (Technical Specialist)',
    salary: 72_000,
    neededBy: '2026-11-16',
    est: [2, 3],
    vacancyReason: 'New position',
    justification: 'Digital load-cell calibration for the high-throughput peak season.'
  }),
  req({
    id: 'REQ-2026-003',
    orgId: 'org-nandi',
    branch: 'Nandi Hills Outgrowers',
    title: 'Team Supervisor (production line)',
    department: 'General Services',
    headcountRequired: 4,
    status: 'IN_RECRUITMENT',
    requester: 'Field Services Manager',
    requestedDate: '2026-09-14',
    submittedDate: '2026-09-14',
    decidedDate: '2026-09-19',
    gradeScale: 'JG-06 (Skilled Operative)',
    salary: 42_000,
    neededBy: '2026-10-26',
    est: [12, 16],
    vacancyReason: 'Seasonal',
    justification: 'Peak October–December season needs four more muster supervisors.',
    vacancyId: 'VAC-2026-003'
  }),
  req({
    id: 'REQ-2026-004',
    orgId: 'org-rift',
    branch: 'Rift Valley Agricultural Holding',
    title: 'Occupational Health and Hygiene Inspector',
    department: 'OSH & Compliance',
    headcountRequired: 1,
    status: 'PENDING_APPROVAL',
    currentStep: 'HOD',
    requester: 'Farm Manager',
    requestedDate: '2026-09-20',
    submittedDate: '2026-09-20',
    gradeScale: 'JG-08 (Technical Specialist)',
    salary: 78_000,
    neededBy: '2026-12-01',
    est: [1, 2],
    vacancyReason: 'New position',
    justification: 'DOSHS chemical handling and hygiene surveillance required from 2026.'
  }),
  req({
    id: 'REQ-2026-005',
    orgId: 'org-kericho',
    title: 'Process Automation Engineer',
    department: 'Engineering & Maintenance',
    headcountRequired: 1,
    status: 'PENDING_APPROVAL',
    currentStep: 'HR',
    requester: 'David Kiprono Rono',
    requesterStaffId: 'KHE-0419',
    requestedDate: '2026-09-29',
    submittedDate: '2026-09-30',
    gradeScale: 'JG-10 (Supervisor)',
    salary: 120_000,
    neededBy: '2027-01-04',
    est: [1, 2],
    vacancyReason: 'New position',
    priority: 'High',
    justification: 'Sensor telemetry on the withering and drying lines; today we rely on one technician and outside contractors.',
    approvals: [dec('REQUESTER', 'rono', 'SUBMITTED', '2026-09-30'), dec('HOD', 'esther', 'APPROVED', '2026-10-01', 'Supported — contractor spend this year is above KES 2M.')],
    jd: jd({
      reportsTo: 'Operations Manager',
      jobPurpose: 'Design, install and maintain PLC and sensor systems on the processing lines.',
      responsibilities: ['Programme and maintain PLCs', 'Run the telemetry dashboard', 'Train technicians on automated lines'],
      educationLevel: "Bachelor's degree in Electrical or Mechatronic Engineering",
      minExperienceYears: 4,
      skills: ['Siemens / Allen-Bradley PLC', 'SCADA', 'Industrial networking'],
      certifications: 'EBK graduate engineer'
    })
  }),
  req({
    id: 'REQ-2026-006',
    orgId: 'org-kericho',
    title: 'Production Operative (daily-rated)',
    department: 'General Services',
    headcountRequired: 2,
    status: 'FILLED',
    requester: 'Esther Muthoni',
    requesterStaffId: 'KHE-0160',
    requestedDate: '2026-06-10',
    submittedDate: '2026-06-10',
    decidedDate: '2026-06-15',
    gradeScale: 'JG-04 (General Worker)',
    salary: 696,
    neededBy: '2026-07-20',
    est: [8, 10],
    vacancyReason: 'Seasonal',
    justification: 'Two operatives for the July–December plucking season.',
    vacancyId: 'VAC-2026-006',
    approvals: [
      dec('REQUESTER', 'esther', 'SUBMITTED', '2026-06-10'),
      dec('HOD', 'rono', 'APPROVED', '2026-06-11'),
      dec('HR', 'rose', 'APPROVED', '2026-06-12'),
      dec('MD', 'md', 'APPROVED', '2026-06-15')
    ]
  }),
  req({
    id: 'REQ-2026-007',
    orgId: 'org-kericho',
    title: 'Maintenance Technician',
    department: 'Engineering & Maintenance',
    headcountRequired: 1,
    status: 'FILLED',
    requester: 'Esther Muthoni',
    requesterStaffId: 'KHE-0160',
    requestedDate: '2026-08-06',
    submittedDate: '2026-08-06',
    decidedDate: '2026-08-12',
    gradeScale: 'JG-06 (Skilled Operative)',
    salary: 50_000,
    neededBy: '2026-10-19',
    est: [1, 2],
    vacancyReason: 'Replacement',
    justification: 'Replaces the second technician who left in July; one technician cannot cover both shifts.',
    vacancyId: 'VAC-2026-007',
    approvals: [
      dec('REQUESTER', 'esther', 'SUBMITTED', '2026-08-06'),
      dec('HOD', 'rono', 'APPROVED', '2026-08-07'),
      dec('HR', 'rose', 'APPROVED', '2026-08-10'),
      dec('MD', 'md', 'APPROVED', '2026-08-12')
    ]
  }),
  req({
    id: 'REQ-2026-008',
    orgId: 'org-kericho',
    title: 'Quality Controller',
    department: 'Production & Quality Control',
    headcountRequired: 1,
    status: 'FILLED',
    requester: 'David Kiprono Rono',
    requesterStaffId: 'KHE-0419',
    requestedDate: '2026-08-14',
    submittedDate: '2026-08-14',
    decidedDate: '2026-08-20',
    gradeScale: 'JG-06 (Skilled Operative)',
    salary: 54_000,
    neededBy: '2026-11-02',
    est: [13, 14],
    vacancyReason: 'Expansion',
    justification: 'A second quality controller for the night shift ahead of the export audit.',
    vacancyId: 'VAC-2026-008',
    approvals: [
      dec('REQUESTER', 'rono', 'SUBMITTED', '2026-08-14'),
      dec('HOD', 'amina', 'APPROVED', '2026-08-17', 'Requester heads the department; approved at the next level.'),
      dec('HR', 'rose', 'APPROVED', '2026-08-18'),
      dec('MD', 'md', 'APPROVED', '2026-08-20')
    ]
  }),
  req({
    id: 'REQ-2026-009',
    orgId: 'org-kericho',
    title: 'Accounts Clerk',
    department: 'Finance & Administration',
    headcountRequired: 1,
    status: 'IN_RECRUITMENT',
    requester: 'David Otieno',
    requesterStaffId: 'KHE-0134',
    requestedDate: '2026-09-07',
    submittedDate: '2026-09-07',
    decidedDate: '2026-09-15',
    gradeScale: 'JG-06 (Skilled Operative)',
    salary: 45_000,
    neededBy: '2026-11-16',
    est: [6, 7],
    vacancyReason: 'New position',
    justification: 'Supplier invoices have grown 40% with the factory supply contract; payables are three weeks behind.',
    vacancyId: 'VAC-2026-009',
    approvals: [
      dec('REQUESTER', 'otieno', 'SUBMITTED', '2026-09-07'),
      dec('HOD', 'amina', 'APPROVED', '2026-09-08', 'Requester heads the department; approved at the next level.'),
      dec('HR', 'rose', 'APPROVED', '2026-09-10'),
      dec('MD', 'md', 'APPROVED', '2026-09-15')
    ],
    jd: jd({
      reportsTo: 'Finance Manager',
      jobPurpose: 'Process supplier invoices and payments accurately and on time.',
      responsibilities: ['Match invoices to GRNs and LPOs', 'Prepare payment batches', 'Reconcile supplier statements monthly'],
      educationLevel: 'Diploma in Accounting; CPA Part II',
      minExperienceYears: 2,
      skills: ['Accounts payable', 'Excel', 'iTax withholding VAT']
    })
  }),
  req({
    id: 'REQ-2026-010',
    orgId: 'org-kericho',
    title: 'Sales Representative',
    department: 'Sales & Marketing',
    headcountRequired: 2,
    status: 'PENDING_APPROVAL',
    currentStep: 'HOD',
    requester: 'Peter Mwangi',
    requesterStaffId: 'KHE-0244',
    requestedDate: '2026-10-02',
    submittedDate: '2026-10-02',
    gradeScale: 'JG-06 (Skilled Operative)',
    salary: 52_000,
    neededBy: '2026-12-01',
    est: [3, 4],
    vacancyReason: 'Expansion',
    justification: 'Two representatives to open the Nakuru and Eldoret retail routes from December.',
    approvals: [dec('REQUESTER', 'peter', 'SUBMITTED', '2026-10-02')]
  }),
  req({
    id: 'REQ-2026-011',
    orgId: 'org-kericho',
    title: 'Field Operative (daily-rated)',
    department: 'General Services',
    headcountRequired: 6,
    status: 'REJECTED',
    requester: 'Esther Muthoni',
    requesterStaffId: 'KHE-0160',
    requestedDate: '2026-09-15',
    submittedDate: '2026-09-15',
    decidedDate: '2026-09-22',
    gradeScale: 'JG-04 (General Worker)',
    salary: 700,
    neededBy: '2026-10-12',
    est: [10, 12],
    vacancyReason: 'Seasonal',
    justification: 'Extra pluckers for the October flush.',
    approvals: [
      dec('REQUESTER', 'esther', 'SUBMITTED', '2026-09-15'),
      dec('HOD', 'rono', 'APPROVED', '2026-09-16'),
      dec('HR', 'rose', 'APPROVED', '2026-09-17', 'Four above the establishment of 12 — needs Finance.'),
      dec('FINANCE', 'otieno', 'REJECTED', '2026-09-22', 'The season casual budget is fully committed. Resubmit for January with the 2027 budget.')
    ]
  }),
  req({
    id: 'REQ-2026-012',
    orgId: 'org-kericho',
    title: 'OSH Officer',
    department: 'OSH & Compliance',
    headcountRequired: 1,
    status: 'PENDING_APPROVAL',
    currentStep: 'MD',
    requester: 'Ruth Chebet',
    requesterStaffId: 'KHE-0171',
    requestedDate: '2026-09-24',
    submittedDate: '2026-09-24',
    gradeScale: 'JG-08 (Technical Specialist)',
    salary: 75_000,
    neededBy: '2026-12-01',
    est: [1, 2],
    vacancyReason: 'New position',
    justification: 'DOSHS audit found one QHSE manager cannot cover three sites; an officer will run permits and toolbox talks.',
    approvals: [
      dec('REQUESTER', 'ruth', 'SUBMITTED', '2026-09-24'),
      dec('HOD', 'rono', 'APPROVED', '2026-09-25'),
      dec('HR', 'rose', 'APPROVED', '2026-09-29', 'Within establishment (2 approved, 1 in post).')
    ]
  }),
  req({
    id: 'REQ-2026-013',
    orgId: 'org-kericho',
    title: 'ICT Support Technician',
    department: 'Information Technology',
    headcountRequired: 1,
    status: 'DRAFT',
    requester: 'Samuel Kiptoo',
    requesterStaffId: 'KHE-0178',
    requestedDate: '2026-10-06',
    gradeScale: 'JG-06 (Skilled Operative)',
    salary: 42_000,
    neededBy: '2027-01-11',
    est: [2, 3],
    vacancyReason: 'New position',
    justification: 'Support for the new biometric terminals and ESS kiosks at the three sites.'
  })
];

/* ------------------------------------------------------------------ establishment */

export const INITIAL_ESTABLISHMENT: EstablishmentPlan[] = [
  ['Production & Quality Control', 14, 8_600_000],
  ['General Services', 12, 3_400_000],
  ['Operations', 9, 12_200_000],
  ['Finance & Administration', 7, 13_400_000],
  ['Sales & Marketing', 4, 5_300_000],
  ['Information Technology', 3, 3_950_000],
  ['Engineering & Maintenance', 2, 1_700_000],
  ['OSH & Compliance', 2, 3_400_000]
].map(([department, approved, budgetKes]) => ({
  orgId: 'org-kericho',
  department: department as string,
  approved: approved as number,
  budgetKes: budgetKes as number,
  note: '2026 establishment, board approved 12 Dec 2025',
  updatedBy: 'Amina Hassan',
  updatedOn: '2025-12-12'
}));

/* ------------------------------------------------------------------ vacancies */

const vac = (v: Omit<Vacancy, 'orgId' | 'branch' | 'knockouts' | 'criteria'> & Partial<Pick<Vacancy, 'orgId' | 'branch' | 'knockouts' | 'criteria'>>): Vacancy => ({
  orgId: 'org-kericho',
  branch: KHE,
  knockouts: DEFAULT_KNOCKOUTS,
  criteria: DEFAULT_CRITERIA,
  ...v
});

const FOOTER = 'Only shortlisted candidates will be contacted. We do not charge any fee at any stage of recruitment.';

export const INITIAL_VACANCIES: Vacancy[] = [
  vac({
    id: 'VAC-2026-001',
    requisitionId: 'REQ-2026-001',
    title: 'Senior Operations Analyst',
    department: 'Operations',
    grade: 'JG-10 (Supervisor)',
    contractType: STD,
    positions: 2,
    salaryKes: 95_000,
    openedOn: '2026-08-31',
    closingDate: '2026-09-21',
    channels: ['Company website', 'LinkedIn', 'BrighterMonday'],
    status: 'OPEN',
    minYears: 5,
    knockouts: [...DEFAULT_KNOCKOUTS, { id: 'ko-degree', question: "Holds a bachelor's degree in a numerate field", expected: true }],
    panel: ['KHE-0160', 'KHE-0419', 'KHE-0290'],
    hiringManagerStaffId: 'KHE-0160',
    adText: `Kericho Highland Estates is recruiting two Senior Operations Analysts for the Operations department.\n\nPurpose of the role: analyse field and factory process data and lead improvement projects that cut waste and support ISO 22000 certification.\n\nKey responsibilities:\n• Track yield, downtime and quality KPIs per site\n• Run root-cause analysis on deviations\n• Prepare audit evidence\n• Coach supervisors on standard work\n\nRequirements: bachelor's degree in Industrial Engineering, Statistics or similar; at least 5 years' experience; Lean / Six Sigma; Power BI.\n\nGrade JG-10. Applications closed on 21 Sep 2026. ${FOOTER}`
  }),
  vac({
    id: 'VAC-2026-003',
    orgId: 'org-nandi',
    branch: 'Nandi Hills Outgrowers',
    requisitionId: 'REQ-2026-003',
    title: 'Team Supervisor (production line)',
    department: 'General Services',
    grade: 'JG-06 (Skilled Operative)',
    contractType: FIXED,
    positions: 4,
    salaryKes: 42_000,
    openedOn: '2026-09-21',
    closingDate: '2026-10-12',
    channels: ['Staff notice board', 'Local radio'],
    status: 'OPEN',
    minYears: 3,
    panel: ['KHE-0102'],
    adText: `Nandi Hills Outgrowers is recruiting four Team Supervisors for the peak season (fixed term to 31 Dec 2026). Applications close on 12 Oct 2026. ${FOOTER}`
  }),
  vac({
    id: 'VAC-2026-006',
    requisitionId: 'REQ-2026-006',
    title: 'Production Operative (daily-rated)',
    department: 'General Services',
    grade: 'JG-04 (General Worker)',
    contractType: DAILY,
    positions: 2,
    salaryKes: 696,
    openedOn: '2026-06-17',
    closingDate: '2026-07-01',
    channels: ['Staff notice board', 'Local radio'],
    status: 'FILLED',
    minYears: 0,
    knockouts: [DEFAULT_KNOCKOUTS[1], { id: 'ko-age', question: 'Aged 18 or over', expected: true }],
    criteria: [
      { id: 'exp', label: 'Field experience', weight: 40 },
      { id: 'fit', label: 'Reliability and attitude', weight: 40 },
      { id: 'comm', label: 'Communication', weight: 20 }
    ],
    panel: ['KHE-0160', 'KHE-0290'],
    hiringManagerStaffId: 'KHE-0160',
    adText: `Kericho Highland Estates is hiring two daily-rated Production Operatives for the July–December season at KES 696 a day. Apply at the estate office. ${FOOTER}`
  }),
  vac({
    id: 'VAC-2026-007',
    requisitionId: 'REQ-2026-007',
    title: 'Maintenance Technician',
    department: 'Engineering & Maintenance',
    grade: 'JG-06 (Skilled Operative)',
    contractType: STD,
    positions: 1,
    salaryKes: 50_000,
    openedOn: '2026-08-14',
    closingDate: '2026-09-04',
    channels: ['Company website', 'BrighterMonday', 'Staff notice board'],
    status: 'FILLED',
    minYears: 3,
    knockouts: [...DEFAULT_KNOCKOUTS, { id: 'ko-cert', question: 'Holds a craft certificate or diploma in mechanical or electrical engineering', expected: true }],
    panel: ['KHE-0160', 'KHE-0270', 'KHE-0290'],
    hiringManagerStaffId: 'KHE-0160',
    adText: `Kericho Highland Estates is recruiting a Maintenance Technician (replacement) to keep the withering and drying lines running across two shifts. Diploma or craft certificate and 3 years' plant maintenance experience. ${FOOTER}`
  }),
  vac({
    id: 'VAC-2026-008',
    requisitionId: 'REQ-2026-008',
    title: 'Quality Controller',
    department: 'Production & Quality Control',
    grade: 'JG-06 (Skilled Operative)',
    contractType: STD,
    positions: 1,
    salaryKes: 54_000,
    openedOn: '2026-08-24',
    closingDate: '2026-09-14',
    channels: ['Company website', 'LinkedIn', 'University career office'],
    status: 'FILLED',
    minYears: 2,
    panel: ['KHE-0419', 'KHE-0276', 'KHE-0290'],
    hiringManagerStaffId: 'KHE-0419',
    adText: `Kericho Highland Estates is recruiting a Quality Controller for the night shift. Diploma or degree in Food Science and 2 years in a food plant. ${FOOTER}`
  }),
  vac({
    id: 'VAC-2026-009',
    requisitionId: 'REQ-2026-009',
    title: 'Accounts Clerk',
    department: 'Finance & Administration',
    grade: 'JG-06 (Skilled Operative)',
    contractType: STD,
    positions: 1,
    salaryKes: 45_000,
    openedOn: '2026-09-16',
    closingDate: '2026-10-14',
    channels: ['Company website', 'BrighterMonday', 'Staff notice board'],
    status: 'OPEN',
    minYears: 2,
    knockouts: [...DEFAULT_KNOCKOUTS, { id: 'ko-cpa', question: 'Has passed CPA Part II or higher', expected: true }],
    panel: ['KHE-0134', 'KHE-0187', 'KHE-0290'],
    hiringManagerStaffId: 'KHE-0134',
    adText: `Kericho Highland Estates is recruiting an Accounts Clerk for the Finance & Administration department.\n\nPurpose of the role: process supplier invoices and payments accurately and on time.\n\nKey responsibilities:\n• Match invoices to GRNs and LPOs\n• Prepare payment batches\n• Reconcile supplier statements monthly\n\nRequirements: diploma in Accounting, CPA Part II, at least 2 years in accounts payable.\n\nGrade JG-06. Applications close on 14 Oct 2026. ${FOOTER}`
  })
];

/* ------------------------------------------------------------------ candidates */

const sc = (tech: number, exp: number, prob: number, comm: number, fit: number) => ({ tech, exp, prob, comm, fit });

const iv = (id: string, date: string, panel: string[], scores: Interview['scores'] = {}, status: Interview['status'] = 'COMPLETED', time = '10:00'): Interview => ({
  id,
  round: 'Panel interview',
  date,
  time,
  location: 'Estate boardroom, Kericho',
  panel,
  scores,
  status
});

const checks = (date: string, over: Partial<Record<CheckKind, BackgroundCheck['status']>> = {}, notes: Partial<Record<CheckKind, string>> = {}): BackgroundCheck[] =>
  (['KRA_PIN', 'GOOD_CONDUCT', 'ACADEMIC', 'REFERENCE_1', 'REFERENCE_2', 'MEDICAL'] as CheckKind[]).map((kind) => ({
    kind,
    status: over[kind] ?? 'CLEAR',
    note: notes[kind],
    updatedOn: date
  }));

const mail = (at: string, subject: string, by = 'Rose Chepkoech', channel: CommEntry['channel'] = 'Email'): CommEntry => ({ at, channel, subject, by });

const log = (...xs: [string, string][]) => xs.map(([stage, at]) => ({ stage, at, by: 'Rose Chepkoech' }));

const yes = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, true]));
const STD_KO = ['ko-permit', 'ko-reloc', 'ko-notice'];

type CandSeed = Partial<JobApplicant> & Pick<JobApplicant, 'id' | 'candidateName' | 'stage' | 'appliedDate' | 'experienceYears'>;
const cand = (c: CandSeed): JobApplicant => {
  const first = c.candidateName.split(' ')[0].toLowerCase();
  const last = c.candidateName.split(' ').slice(-1)[0].toLowerCase();
  const n = Number(c.id.replace(/\D/g, '')) || 0;
  return {
    orgId: 'org-kericho',
    email: `${first}.${last}@gmail.com`,
    phone: `+254 7${String(10 + (n % 89)).padStart(2, '0')} ${String(100 + ((n * 37) % 900))} ${String(100 + ((n * 59) % 900))}`,
    appliedRole: '',
    scorecardScore: 0,
    isInternOrAttachee: false,
    location: 'Kericho',
    comms: [mail(c.appliedDate, 'Application received', 'Recruitment portal', 'Portal')],
    ...c
  };
};

const OPS_PANEL = ['KHE-0160', 'KHE-0419', 'KHE-0290'];
const ACC_PANEL = ['KHE-0134', 'KHE-0187', 'KHE-0290'];
const MT_PANEL = ['KHE-0160', 'KHE-0270', 'KHE-0290'];
const QC_PANEL = ['KHE-0419', 'KHE-0276', 'KHE-0290'];

export const INITIAL_CANDIDATES: JobApplicant[] = [
  // Senior Operations Analyst (2 positions)
  cand({
    id: 'CAND-8801',
    candidateName: 'Mercy Jebet Koech',
    email: 'm.jebet@egerton.ac.ke',
    phone: '+254 712 345 678',
    gender: 'Female',
    appliedRole: 'Senior Operations Analyst',
    vacancyId: 'VAC-2026-001',
    stage: 'Offer',
    appliedDate: '2026-09-02',
    experienceYears: 7,
    source: 'LinkedIn',
    education: 'BSc Industrial Engineering (Egerton), Six Sigma Green Belt',
    answers: yes(...STD_KO, 'ko-degree'),
    interviews: [iv('IV-101', '2026-09-29', OPS_PANEL, { 'KHE-0160': sc(5, 4, 5, 4, 4), 'KHE-0419': sc(4, 5, 4, 4, 5), 'KHE-0290': sc(4, 4, 4, 5, 5) })],
    checks: checks('2026-10-03'),
    offer: {
      ref: 'OFR-2026-031',
      basic: 98_000,
      grade: 'JG-10 (Supervisor)',
      contractType: STD,
      startDate: '2026-11-02',
      probationMonths: 6,
      status: 'ISSUED',
      aboveBand: false,
      preparedBy: 'Rose Chepkoech',
      preparedOn: '2026-10-05',
      issuedOn: '2026-10-05',
      expiresOn: '2026-10-12'
    },
    stageLog: log(['Screened', '2026-09-22'], ['Shortlisted', '2026-09-23'], ['Interview', '2026-09-24'], ['Assessment', '2026-09-30'], ['Offer', '2026-10-05']),
    comms: [
      mail('2026-09-02', 'Application received', 'Recruitment portal', 'Portal'),
      mail('2026-09-24', 'Invitation to panel interview on 29 Sep'),
      mail('2026-09-30', 'Request for referee contacts and certificate of good conduct'),
      mail('2026-10-05', 'Offer of employment OFR-2026-031')
    ]
  }),
  cand({
    id: 'CAND-8805',
    candidateName: 'Kelvin Kipngeno Rotich',
    gender: 'Male',
    appliedRole: 'Senior Operations Analyst',
    vacancyId: 'VAC-2026-001',
    stage: 'Assessment',
    appliedDate: '2026-09-05',
    experienceYears: 6,
    source: 'Referral',
    education: 'BSc Statistics (Moi University)',
    answers: yes(...STD_KO, 'ko-degree'),
    interviews: [iv('IV-102', '2026-09-29', OPS_PANEL, { 'KHE-0160': sc(4, 4, 4, 3, 4), 'KHE-0419': sc(4, 4, 4, 4, 4), 'KHE-0290': sc(3, 4, 4, 4, 4) }, 'COMPLETED', '14:00')],
    checks: checks('2026-10-02', { GOOD_CONDUCT: 'PENDING', REFERENCE_2: 'PENDING', MEDICAL: 'NOT_STARTED' }, { GOOD_CONDUCT: 'DCI receipt seen, certificate due 12 Oct' }),
    stageLog: log(['Screened', '2026-09-22'], ['Shortlisted', '2026-09-23'], ['Interview', '2026-09-24'], ['Assessment', '2026-09-30']),
    comms: [mail('2026-09-05', 'Application received', 'Recruitment portal', 'Portal'), mail('2026-09-24', 'Invitation to panel interview on 29 Sep'), mail('2026-09-30', 'Request for referee contacts and certificate of good conduct')]
  }),
  cand({
    id: 'CAND-8806',
    candidateName: 'Hassan Abdi Noor',
    gender: 'Male',
    appliedRole: 'Senior Operations Analyst',
    vacancyId: 'VAC-2026-001',
    stage: 'Interview',
    appliedDate: '2026-09-08',
    experienceYears: 8,
    source: 'BrighterMonday',
    location: 'Nakuru',
    education: 'BEng Mechanical (JKUAT), MBA',
    answers: yes(...STD_KO, 'ko-degree'),
    interviews: [iv('IV-103', '2026-10-02', OPS_PANEL, { 'KHE-0160': sc(4, 5, 4, 3, 3), 'KHE-0419': sc(4, 5, 3, 3, 4) }, 'SCHEDULED')],
    stageLog: log(['Screened', '2026-09-22'], ['Shortlisted', '2026-09-23'], ['Interview', '2026-09-25']),
    comms: [mail('2026-09-08', 'Application received', 'Recruitment portal', 'Portal'), mail('2026-09-25', 'Invitation to panel interview on 2 Oct')]
  }),
  cand({
    id: 'CAND-8807',
    candidateName: 'Lydia Chepngeno Kirui',
    gender: 'Female',
    appliedRole: 'Senior Operations Analyst',
    vacancyId: 'VAC-2026-001',
    stage: 'Interview',
    appliedDate: '2026-09-11',
    experienceYears: 5,
    source: 'Company website',
    education: 'BSc Agricultural Engineering (Egerton)',
    answers: yes(...STD_KO, 'ko-degree'),
    interviews: [iv('IV-104', '2026-10-09', OPS_PANEL, {}, 'SCHEDULED')],
    stageLog: log(['Screened', '2026-09-22'], ['Shortlisted', '2026-09-23'], ['Interview', '2026-10-01']),
    comms: [mail('2026-09-11', 'Application received', 'Recruitment portal', 'Portal'), mail('2026-10-01', 'Invitation to panel interview on 9 Oct'), mail('2026-10-06', 'Interview reminder', 'Rose Chepkoech', 'SMS')]
  }),
  cand({ id: 'CAND-8808', candidateName: 'Winnie Atieno Okoth', gender: 'Female', appliedRole: 'Senior Operations Analyst', vacancyId: 'VAC-2026-001', stage: 'Shortlisted', appliedDate: '2026-09-14', experienceYears: 6, source: 'LinkedIn', education: 'BSc Statistics (Maseno)', answers: yes(...STD_KO, 'ko-degree'), stageLog: log(['Screened', '2026-09-22'], ['Shortlisted', '2026-09-23']) }),
  cand({ id: 'CAND-8809', candidateName: 'George Kibet Mutai', gender: 'Male', appliedRole: 'Senior Operations Analyst', vacancyId: 'VAC-2026-001', stage: 'Shortlisted', appliedDate: '2026-09-15', experienceYears: 5, source: 'Referral', education: 'BSc Industrial Chemistry (Moi)', answers: yes(...STD_KO, 'ko-degree'), stageLog: log(['Screened', '2026-09-22'], ['Shortlisted', '2026-09-23']) }),
  cand({ id: 'CAND-8810', candidateName: 'Irene Wambui Gitau', gender: 'Female', appliedRole: 'Senior Operations Analyst', vacancyId: 'VAC-2026-001', stage: 'Screened', appliedDate: '2026-09-17', experienceYears: 5, source: 'BrighterMonday', location: 'Nairobi', education: 'BCom (Strathmore)', answers: yes(...STD_KO, 'ko-degree'), stageLog: log(['Screened', '2026-09-22']) }),
  cand({
    id: 'CAND-8811',
    candidateName: 'Paul Njoroge Kamau',
    gender: 'Male',
    appliedRole: 'Senior Operations Analyst',
    vacancyId: 'VAC-2026-001',
    stage: 'Rejected',
    appliedDate: '2026-09-04',
    experienceYears: 9,
    source: 'LinkedIn',
    answers: yes(...STD_KO, 'ko-degree'),
    interviews: [iv('IV-105', '2026-09-30', OPS_PANEL, { 'KHE-0160': sc(2, 3, 2, 3, 3), 'KHE-0419': sc(3, 3, 2, 2, 3), 'KHE-0290': sc(2, 3, 3, 3, 2) })],
    outcomeReason: 'Interview score below 60%',
    stageLog: log(['Screened', '2026-09-22'], ['Shortlisted', '2026-09-23'], ['Interview', '2026-09-24'], ['Rejected', '2026-10-01']),
    comms: [mail('2026-09-04', 'Application received', 'Recruitment portal', 'Portal'), mail('2026-09-24', 'Invitation to panel interview on 30 Sep'), mail('2026-10-01', 'Outcome of your application — regret')]
  }),
  cand({ id: 'CAND-8812', candidateName: 'Carol Mumbua Musyoka', gender: 'Female', appliedRole: 'Senior Operations Analyst', vacancyId: 'VAC-2026-001', stage: 'Rejected', appliedDate: '2026-09-06', experienceYears: 2, source: 'Company website', answers: yes(...STD_KO, 'ko-degree'), outcomeReason: "Knock-out: 2 years' experience; the role needs 5", stageLog: log(['Rejected', '2026-09-22']), comms: [mail('2026-09-06', 'Application received', 'Recruitment portal', 'Portal'), mail('2026-09-22', 'Outcome of your application — regret')] }),
  cand({ id: 'CAND-8813', candidateName: 'Tom Odera Ouma', gender: 'Male', appliedRole: 'Senior Operations Analyst', vacancyId: 'VAC-2026-001', stage: 'Withdrawn', appliedDate: '2026-09-03', experienceYears: 7, source: 'LinkedIn', answers: yes(...STD_KO, 'ko-degree'), outcomeReason: 'Accepted another offer', stageLog: log(['Screened', '2026-09-22'], ['Shortlisted', '2026-09-23'], ['Withdrawn', '2026-09-26']) }),
  cand({ id: 'CAND-8814', candidateName: 'Ann Chelangat Bett', gender: 'Female', appliedRole: 'Senior Operations Analyst', vacancyId: 'VAC-2026-001', stage: 'Applied', appliedDate: '2026-09-20', experienceYears: 6, source: 'Referral', answers: yes('ko-permit', 'ko-reloc', 'ko-degree') }),
  // Accounts Clerk
  cand({ id: 'CAND-8820', candidateName: 'Brenda Achieng Owino', gender: 'Female', appliedRole: 'Accounts Clerk', vacancyId: 'VAC-2026-009', stage: 'Interview', appliedDate: '2026-09-18', experienceYears: 3, source: 'BrighterMonday', education: 'Diploma in Accounting, CPA Section 4', answers: yes(...STD_KO, 'ko-cpa'), interviews: [iv('IV-201', '2026-10-08', ACC_PANEL, {}, 'SCHEDULED', '09:30')], stageLog: log(['Screened', '2026-09-29'], ['Shortlisted', '2026-09-30'], ['Interview', '2026-10-02']), comms: [mail('2026-09-18', 'Application received', 'Recruitment portal', 'Portal'), mail('2026-10-02', 'Invitation to panel interview on 8 Oct')] }),
  cand({ id: 'CAND-8821', candidateName: 'Felix Kiprono Langat', gender: 'Male', appliedRole: 'Accounts Clerk', vacancyId: 'VAC-2026-009', stage: 'Interview', appliedDate: '2026-09-19', experienceYears: 2, source: 'Company website', education: 'BCom Accounting (Kabarak), CPA Section 5', answers: yes(...STD_KO, 'ko-cpa'), interviews: [iv('IV-202', '2026-10-08', ACC_PANEL, {}, 'SCHEDULED', '11:00')], stageLog: log(['Screened', '2026-09-29'], ['Shortlisted', '2026-09-30'], ['Interview', '2026-10-02']) }),
  cand({ id: 'CAND-8822', candidateName: 'Mary Nduta Kariuki', gender: 'Female', appliedRole: 'Accounts Clerk', vacancyId: 'VAC-2026-009', stage: 'Shortlisted', appliedDate: '2026-09-21', experienceYears: 4, source: 'Referral', answers: yes(...STD_KO, 'ko-cpa'), stageLog: log(['Screened', '2026-09-29'], ['Shortlisted', '2026-09-30']) }),
  cand({ id: 'CAND-8823', candidateName: 'Rose Wekesa', gender: 'Female', appliedRole: 'Accounts Clerk', vacancyId: 'VAC-2026-009', internalStaffId: 'KHE-1111', email: 'r.wekesa@intergrated-erp.ke', stage: 'Screened', appliedDate: '2026-09-22', experienceYears: 2, source: 'Internal', education: 'Diploma in Accounting (KNP), CPA Part II', answers: yes(...STD_KO, 'ko-cpa'), stageLog: log(['Screened', '2026-09-29']) }),
  cand({ id: 'CAND-8824', candidateName: 'Joy Nekesa Wanjala', gender: 'Female', appliedRole: 'Accounts Clerk', vacancyId: 'VAC-2026-009', stage: 'Applied', appliedDate: '2026-10-03', experienceYears: 3, source: 'BrighterMonday', answers: yes(...STD_KO, 'ko-cpa') }),
  cand({ id: 'CAND-8825', candidateName: 'Kennedy Omondi Ochieng', gender: 'Male', appliedRole: 'Accounts Clerk', vacancyId: 'VAC-2026-009', stage: 'Applied', appliedDate: '2026-10-05', experienceYears: 1, source: 'Walk-in', answers: yes(...STD_KO) }),
  cand({ id: 'CAND-8826', candidateName: 'Esther Nyokabi Mwaura', gender: 'Female', appliedRole: 'Accounts Clerk', vacancyId: 'VAC-2026-009', stage: 'Rejected', appliedDate: '2026-09-17', experienceYears: 3, source: 'Company website', answers: { ...yes(...STD_KO), 'ko-cpa': false }, outcomeReason: 'Knock-out: has not passed CPA Part II', stageLog: log(['Rejected', '2026-09-29']) }),
  // Maintenance Technician (filled)
  cand({
    id: 'CAND-8730',
    candidateName: 'Stephen Kiprotich Langat',
    gender: 'Male',
    phone: '+254 723 418 902',
    appliedRole: 'Maintenance Technician',
    vacancyId: 'VAC-2026-007',
    stage: 'Hired',
    appliedDate: '2026-08-20',
    experienceYears: 5,
    source: 'BrighterMonday',
    education: 'Diploma in Mechanical Engineering (Kericho TTI)',
    answers: yes(...STD_KO, 'ko-cert'),
    interviews: [iv('IV-071', '2026-09-10', MT_PANEL, { 'KHE-0160': sc(4, 4, 4, 3, 4), 'KHE-0270': sc(5, 4, 4, 3, 4), 'KHE-0290': sc(4, 4, 3, 4, 4) })],
    checks: checks('2026-09-24'),
    offer: { ref: 'OFR-2026-027', basic: 52_000, grade: 'JG-06 (Skilled Operative)', contractType: STD, startDate: '2026-10-19', probationMonths: 3, status: 'ACCEPTED', aboveBand: false, preparedBy: 'Rose Chepkoech', preparedOn: '2026-09-25', issuedOn: '2026-09-25', expiresOn: '2026-10-02', respondedOn: '2026-09-29' },
    stageLog: log(['Screened', '2026-09-05'], ['Shortlisted', '2026-09-06'], ['Interview', '2026-09-07'], ['Assessment', '2026-09-11'], ['Offer', '2026-09-25'], ['Hired', '2026-09-29']),
    comms: [mail('2026-08-20', 'Application received', 'Recruitment portal', 'Portal'), mail('2026-09-07', 'Invitation to panel interview on 10 Sep'), mail('2026-09-25', 'Offer of employment OFR-2026-027'), mail('2026-09-29', 'Offer accepted — welcome pack and pre-boarding list')]
  }),
  cand({ id: 'CAND-8731', candidateName: 'Moses Kirui Cheruiyot', gender: 'Male', appliedRole: 'Maintenance Technician', vacancyId: 'VAC-2026-007', stage: 'Rejected', appliedDate: '2026-08-22', experienceYears: 4, source: 'Staff notice board', answers: yes(...STD_KO, 'ko-cert'), interviews: [iv('IV-072', '2026-09-10', MT_PANEL, { 'KHE-0160': sc(3, 3, 3, 3, 3), 'KHE-0270': sc(3, 3, 2, 3, 3), 'KHE-0290': sc(3, 3, 3, 2, 3) }, 'COMPLETED', '14:00')], outcomeReason: 'Not selected — a stronger candidate accepted', stageLog: log(['Screened', '2026-09-05'], ['Shortlisted', '2026-09-06'], ['Interview', '2026-09-07'], ['Rejected', '2026-09-30']) }),
  cand({ id: 'CAND-8732', candidateName: 'Peter Wafula Simiyu', gender: 'Male', appliedRole: 'Maintenance Technician', vacancyId: 'VAC-2026-007', stage: 'Rejected', appliedDate: '2026-08-25', experienceYears: 6, source: 'Company website', answers: yes(...STD_KO, 'ko-cert'), interviews: [iv('IV-073', '2026-09-11', MT_PANEL, { 'KHE-0160': sc(4, 4, 3, 3, 3), 'KHE-0270': sc(4, 4, 3, 3, 3), 'KHE-0290': sc(3, 4, 3, 3, 3) })], checks: checks('2026-09-18', { REFERENCE_1: 'FLAGGED', REFERENCE_2: 'PENDING' }, { REFERENCE_1: 'Former employer would not re-hire (absenteeism)' }), outcomeReason: 'Reference check flagged', stageLog: log(['Screened', '2026-09-05'], ['Shortlisted', '2026-09-06'], ['Interview', '2026-09-07'], ['Assessment', '2026-09-12'], ['Rejected', '2026-09-19']) }),
  // Quality Controller (filled; first choice declined)
  cand({
    id: 'CAND-8740',
    candidateName: 'Dorcas Wangari Njoroge',
    gender: 'Female',
    appliedRole: 'Quality Controller',
    vacancyId: 'VAC-2026-008',
    stage: 'Withdrawn',
    appliedDate: '2026-08-26',
    experienceYears: 4,
    source: 'LinkedIn',
    answers: yes(...STD_KO),
    interviews: [iv('IV-081', '2026-09-17', QC_PANEL, { 'KHE-0419': sc(5, 4, 4, 4, 4), 'KHE-0276': sc(4, 4, 5, 4, 4), 'KHE-0290': sc(4, 4, 4, 4, 5) })],
    checks: checks('2026-09-23'),
    offer: { ref: 'OFR-2026-028', basic: 56_000, grade: 'JG-06 (Skilled Operative)', contractType: STD, startDate: '2026-10-19', probationMonths: 3, status: 'DECLINED', aboveBand: false, preparedBy: 'Rose Chepkoech', preparedOn: '2026-09-24', issuedOn: '2026-09-24', expiresOn: '2026-10-01', respondedOn: '2026-09-28', declineReason: 'Counter-offer from current employer' },
    outcomeReason: 'Declined the offer: counter-offer from current employer',
    stageLog: log(['Screened', '2026-09-15'], ['Shortlisted', '2026-09-15'], ['Interview', '2026-09-16'], ['Assessment', '2026-09-18'], ['Offer', '2026-09-24'], ['Withdrawn', '2026-09-28'])
  }),
  cand({
    id: 'CAND-8741',
    candidateName: 'Naomi Jeruto Sang',
    gender: 'Female',
    phone: '+254 715 662 034',
    appliedRole: 'Quality Controller',
    vacancyId: 'VAC-2026-008',
    stage: 'Hired',
    appliedDate: '2026-08-29',
    experienceYears: 3,
    source: 'University linkage',
    education: 'BSc Food Science (Egerton)',
    answers: yes(...STD_KO),
    interviews: [iv('IV-082', '2026-09-17', QC_PANEL, { 'KHE-0419': sc(4, 3, 4, 4, 4), 'KHE-0276': sc(4, 4, 4, 4, 4), 'KHE-0290': sc(4, 3, 4, 4, 5) }, 'COMPLETED', '14:00')],
    checks: checks('2026-09-29'),
    offer: { ref: 'OFR-2026-030', basic: 54_000, grade: 'JG-06 (Skilled Operative)', contractType: STD, startDate: '2026-11-02', probationMonths: 3, status: 'ACCEPTED', aboveBand: false, preparedBy: 'Rose Chepkoech', preparedOn: '2026-09-30', issuedOn: '2026-09-30', expiresOn: '2026-10-07', respondedOn: '2026-10-05' },
    stageLog: log(['Screened', '2026-09-15'], ['Shortlisted', '2026-09-15'], ['Interview', '2026-09-16'], ['Assessment', '2026-09-18'], ['Offer', '2026-09-30'], ['Hired', '2026-10-05']),
    comms: [mail('2026-08-29', 'Application received', 'Recruitment portal', 'Portal'), mail('2026-09-30', 'Offer of employment OFR-2026-030'), mail('2026-10-05', 'Offer accepted — welcome pack and pre-boarding list')]
  }),
  // Production operatives (filled in July; now employees CAS-1402 and CAS-1405)
  cand({ id: 'CAND-8650', candidateName: 'Juma Mwangi Otieno', gender: 'Male', appliedRole: 'Production Operative (daily-rated)', vacancyId: 'VAC-2026-006', stage: 'Hired', appliedDate: '2026-06-20', experienceYears: 6, source: 'Walk-in', answers: yes('ko-reloc', 'ko-age'), interviews: [iv('IV-061', '2026-07-02', ['KHE-0160', 'KHE-0290'], { 'KHE-0160': { exp: 5, fit: 4, comm: 4 }, 'KHE-0290': { exp: 4, fit: 4, comm: 4 } })], checks: checks('2026-07-10', { ACADEMIC: 'WAIVED' }), offer: { ref: 'OFR-2026-019', basic: 0, dailyRate: 696, grade: 'JG-04 (General Worker)', contractType: DAILY, startDate: '2026-07-20', probationMonths: 0, status: 'ACCEPTED', aboveBand: false, preparedBy: 'Rose Chepkoech', preparedOn: '2026-07-13', issuedOn: '2026-07-13', expiresOn: '2026-07-20', respondedOn: '2026-07-14' }, stageLog: log(['Screened', '2026-07-01'], ['Shortlisted', '2026-07-01'], ['Interview', '2026-07-01'], ['Assessment', '2026-07-03'], ['Offer', '2026-07-13'], ['Hired', '2026-07-14']) }),
  cand({ id: 'CAND-8651', candidateName: 'Faith Jepkemoi Bett', gender: 'Female', appliedRole: 'Production Operative (daily-rated)', vacancyId: 'VAC-2026-006', stage: 'Hired', appliedDate: '2026-06-24', experienceYears: 2, source: 'Staff notice board', answers: yes('ko-reloc', 'ko-age'), interviews: [iv('IV-062', '2026-07-02', ['KHE-0160', 'KHE-0290'], { 'KHE-0160': { exp: 3, fit: 4, comm: 4 }, 'KHE-0290': { exp: 3, fit: 5, comm: 4 } })], checks: checks('2026-07-20', { ACADEMIC: 'WAIVED' }), offer: { ref: 'OFR-2026-021', basic: 0, dailyRate: 696, grade: 'JG-04 (General Worker)', contractType: DAILY, startDate: '2026-08-01', probationMonths: 0, status: 'ACCEPTED', aboveBand: false, preparedBy: 'Rose Chepkoech', preparedOn: '2026-07-22', issuedOn: '2026-07-22', expiresOn: '2026-07-29', respondedOn: '2026-07-24' }, stageLog: log(['Screened', '2026-07-01'], ['Shortlisted', '2026-07-01'], ['Interview', '2026-07-01'], ['Assessment', '2026-07-03'], ['Offer', '2026-07-22'], ['Hired', '2026-07-24']) }),
  cand({ id: 'CAND-8652', candidateName: 'Kevin Kipchirchir Ngetich', gender: 'Male', appliedRole: 'Production Operative (daily-rated)', vacancyId: 'VAC-2026-006', stage: 'Rejected', appliedDate: '2026-06-22', experienceYears: 1, source: 'Walk-in', answers: { 'ko-reloc': false, 'ko-age': true }, outcomeReason: 'Knock-out: Able to work from the duty station', stageLog: log(['Rejected', '2026-07-01']) }),
  // Talent pool (no open vacancy)
  cand({ id: 'CAND-8803', candidateName: 'Sylvia Wanjiku Mwangi', email: 'sylvia.wanjiku@uonbi.ac.ke', phone: '+254 733 456 789', gender: 'Female', appliedRole: 'Graduate Engineer (Cohort 2026)', stage: 'Applied', appliedDate: '2026-09-17', isInternOrAttachee: true, institution: 'University of Nairobi (Faculty of Engineering)', experienceYears: 1, source: 'University linkage' }),
  // Other companies
  cand({ id: 'CAND-8802', orgId: 'org-factory', candidateName: 'Brian Kiprono Cheruiyot', email: 'cheruiyot.brian@gmail.com', phone: '+254 722 890 123', appliedRole: 'Industrial Scale Calibration Officer', stage: 'Interview', scorecardScore: 88, appliedDate: '2026-09-15', experienceYears: 5, source: 'LinkedIn' }),
  cand({ id: 'CAND-8804', orgId: 'org-nandi', candidateName: 'Dennis Kipkemboi Langat', email: 'dennis.langat@outlook.com', phone: '+254 701 234 567', vacancyId: 'VAC-2026-003', appliedRole: 'Team Supervisor (production line)', stage: 'Screened', scorecardScore: 82, appliedDate: '2026-09-25', experienceYears: 4, source: 'Local radio', answers: yes(...STD_KO) })
];

/* ------------------------------------------------------------------ onboarding */

// Completed on the due date, but never later than the seed date (6 Oct 2026)
const done = (tasks: ReturnType<typeof onboardingTemplate>, upTo: number, by: string, on: (offset: number) => string, skip: string[] = []) =>
  tasks.map((x) => (x.dueOffset <= upTo && !skip.includes(x.id) ? { ...x, done: true, doneBy: x.owner === 'Supervisor' ? 'Supervisor' : by, doneOn: [on(x.dueOffset), '2026-10-06'].sort()[0] } : x));

const shift = (start: string) => (offset: number) => {
  const d = new Date(start + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const terms = (t: Partial<HireTerms> & Pick<HireTerms, 'fullName' | 'jobTitle' | 'department' | 'grade' | 'contractType' | 'basic' | 'probationMonths' | 'phone' | 'personalEmail'>): HireTerms => ({
  nationalId: '',
  kraPin: '',
  nssfNo: '',
  shifNo: '',
  paymentMethod: 'BANK',
  taxEmployment: 'PRIMARY',
  ...t
});

const legacy = { kraPinVerified: false, nssfVerified: false, shifVerified: false, kitIssued: false, contractSigned: false, kycStatus: 'PENDING_DOCS' as const };

const stephenTasks = done(onboardingTemplate({ casual: false, operational: true }), -7, 'Rose Chepkoech', shift('2026-10-19'), ['T05']);
const naomiTasks = done(onboardingTemplate({ casual: false, operational: true }), -10, 'Rose Chepkoech', shift('2026-11-02'));
const jumaTasks = done(onboardingTemplate({ casual: true, operational: true }), 90, 'Rose Chepkoech', shift('2026-07-20'));
const faithTasks = done(onboardingTemplate({ casual: true, operational: true }), 60, 'Rose Chepkoech', shift('2026-08-01'));
const sessions = (attendedUpTo: number) =>
  sessionTemplate('Rose Chepkoech', 'Ruth Chebet', 'Esther Muthoni').map((s) => ({ ...s, attended: s.dayOffset <= attendedUpTo ? s.id !== 'S4' || attendedUpTo > 10 : null }));

export const INITIAL_ONBOARDING: OnboardingRecord[] = [
  {
    id: 'ONB-101',
    orgId: 'org-factory',
    employeeName: 'Geoffrey Kibet Rotich',
    role: 'Boiler Maintenance Technician',
    branch: 'Kericho Factory Unit 1',
    kycStatus: 'VERIFIED',
    kraPinVerified: true,
    nssfVerified: true,
    shifVerified: true,
    kitIssued: true,
    contractSigned: true,
    probationEndDate: '2026-12-01',
    progressPercent: 100
  },
  {
    id: 'ONB-102',
    orgId: 'org-nandi',
    employeeName: 'Naomi Chepngetich',
    role: 'Quality Assurance Analyst',
    branch: 'Nandi Hills Outgrowers',
    kycStatus: 'VERIFIED',
    kraPinVerified: true,
    nssfVerified: true,
    shifVerified: true,
    kitIssued: true,
    contractSigned: false,
    probationEndDate: '2026-12-15',
    progressPercent: 80
  },
  {
    id: 'ONB-2026-014',
    orgId: 'org-kericho',
    employeeName: 'Stephen Kiprotich Langat',
    role: 'Maintenance Technician',
    branch: KHE,
    department: 'Engineering & Maintenance',
    ...legacy,
    kraPinVerified: true,
    nssfVerified: true,
    contractSigned: true,
    probationEndDate: '2027-01-18',
    progressPercent: 0,
    applicantId: 'CAND-8730',
    vacancyId: 'VAC-2026-007',
    startDate: '2026-10-19',
    status: 'PRE_BOARDING',
    createdOn: '2026-09-29',
    tasks: stephenTasks,
    sessions: sessionTemplate('Rose Chepkoech', 'Ruth Chebet', 'Esther Muthoni'),
    terms: terms({
      fullName: 'Stephen Kiprotich Langat',
      jobTitle: 'Maintenance Technician',
      department: 'Engineering & Maintenance',
      grade: 'JG-06 (Skilled Operative)',
      contractType: STD,
      basic: 52_000,
      probationMonths: 3,
      supervisorStaffId: 'KHE-0160',
      buddyStaffId: 'KHE-0270',
      stationId: 'st-khe-main',
      gender: 'Male',
      phone: '+254 723 418 902',
      personalEmail: 'stephen.langat@gmail.com',
      nationalId: '29384711',
      kraPin: 'A009384711K',
      nssfNo: '2071839',
      shifNo: '',
      paymentMethod: 'BANK',
      bankName: 'Equity Bank',
      bankAccount: ''
    })
  },
  {
    id: 'ONB-2026-015',
    orgId: 'org-kericho',
    employeeName: 'Naomi Jeruto Sang',
    role: 'Quality Controller',
    branch: KHE,
    department: 'Production & Quality Control',
    ...legacy,
    contractSigned: true,
    probationEndDate: '2027-02-01',
    progressPercent: 0,
    applicantId: 'CAND-8741',
    vacancyId: 'VAC-2026-008',
    startDate: '2026-11-02',
    status: 'PRE_BOARDING',
    createdOn: '2026-10-05',
    tasks: naomiTasks,
    sessions: sessionTemplate('Rose Chepkoech', 'Ruth Chebet', 'David Kiprono Rono'),
    terms: terms({
      fullName: 'Naomi Jeruto Sang',
      jobTitle: 'Quality Controller',
      department: 'Production & Quality Control',
      grade: 'JG-06 (Skilled Operative)',
      contractType: STD,
      basic: 54_000,
      probationMonths: 3,
      supervisorStaffId: 'KHE-0419',
      gender: 'Female',
      phone: '+254 715 662 034',
      personalEmail: 'naomi.sang@gmail.com'
    })
  },
  {
    id: 'ONB-2026-009',
    orgId: 'org-kericho',
    employeeName: 'Juma Mwangi Otieno',
    role: 'Senior Production Operative',
    branch: KHE,
    department: 'General Services',
    ...legacy,
    kycStatus: 'VERIFIED',
    kraPinVerified: true,
    nssfVerified: true,
    shifVerified: true,
    kitIssued: true,
    contractSigned: true,
    probationEndDate: '',
    progressPercent: 100,
    applicantId: 'CAND-8650',
    vacancyId: 'VAC-2026-006',
    staffId: 'CAS-1402',
    startDate: '2026-07-20',
    status: 'COMPLETED',
    createdOn: '2026-07-14',
    activatedOn: '2026-07-17',
    completedOn: '2026-10-02',
    tasks: jumaTasks.map((x) => ({ ...x, done: true, doneBy: x.doneBy ?? 'Esther Muthoni', doneOn: x.doneOn ?? '2026-10-02' })),
    sessions: sessions(30),
    terms: terms({ fullName: 'Juma Mwangi Otieno', jobTitle: 'Senior Production Operative', department: 'General Services', grade: 'JG-04 (General Worker)', contractType: DAILY, basic: 0, dailyRate: 696, probationMonths: 0, supervisorStaffId: 'KHE-0160', gender: 'Male', phone: '+254 711 204 551', personalEmail: 'juma.otieno@gmail.com', nationalId: '31220984', kraPin: 'A012209841M', nssfNo: '3302118', shifNo: '552901', paymentMethod: 'MPESA', mpesaPhone: '+254 711 204 551' })
  },
  {
    id: 'ONB-2026-011',
    orgId: 'org-kericho',
    employeeName: 'Faith Jepkemoi Bett',
    role: 'Production Operative',
    branch: KHE,
    department: 'General Services',
    ...legacy,
    kycStatus: 'VERIFIED',
    kraPinVerified: true,
    nssfVerified: true,
    shifVerified: true,
    kitIssued: true,
    contractSigned: true,
    probationEndDate: '',
    progressPercent: 0,
    applicantId: 'CAND-8651',
    vacancyId: 'VAC-2026-006',
    staffId: 'CAS-1405',
    startDate: '2026-08-01',
    status: 'FIRST_90_DAYS',
    createdOn: '2026-07-24',
    activatedOn: '2026-07-29',
    tasks: faithTasks,
    sessions: sessions(10),
    terms: terms({ fullName: 'Faith Jepkemoi Bett', jobTitle: 'Production Operative', department: 'General Services', grade: 'JG-04 (General Worker)', contractType: DAILY, basic: 0, dailyRate: 696, probationMonths: 0, supervisorStaffId: 'KHE-0160', buddyStaffId: 'CAS-1402', gender: 'Female', phone: '+254 722 908 173', personalEmail: 'faith.bett@gmail.com', nationalId: '33918210', kraPin: 'A013918210P', nssfNo: '3310942', shifNo: '557310', paymentMethod: 'MPESA', mpesaPhone: '+254 722 908 173' })
  }
];

/* ------------------------------------------------------------------ employee changes */

export const INITIAL_EMPLOYEE_CHANGES: EmployeeChange[] = [
  {
    id: 'CHG-2026-041',
    orgId: 'org-kericho',
    staffId: 'KHE-0295',
    staffName: 'Elijah Barasa',
    kind: 'EXTEND_PROBATION',
    summary: 'Probation extended to 2 Nov 2026',
    effectiveFrom: '2026-05-03',
    reason: 'Needs more time on HACCP documentation before confirmation.',
    payload: { probationEndDate: '2026-11-02' },
    requestedBy: 'Rose Chepkoech',
    requestedOn: '2026-04-28',
    status: 'APPROVED',
    decidedBy: 'David Kiprono Rono',
    decidedOn: '2026-04-30'
  },
  {
    id: 'CHG-2026-052',
    orgId: 'org-kericho',
    staffId: 'KHE-0251',
    staffName: 'Mary Wambui',
    kind: 'PROMOTION',
    summary: 'Operations Officer → Senior Operations Officer, JG-08, KES 70,000 → 82,000',
    effectiveFrom: '2026-11',
    reason: 'Took over the Site D muster and transport desk; strong 2026 mid-year review.',
    payload: { newBasic: 82_000, previousBasic: 70_000, grade: 'JG-08 (Technical Specialist)', jobTitle: 'Senior Operations Officer' },
    requestedBy: 'Rose Chepkoech',
    requestedOn: '2026-10-05',
    status: 'PENDING'
  },
  {
    id: 'CHG-2026-053',
    orgId: 'org-kericho',
    staffId: 'KHE-1112',
    staffName: 'Elijah Achieng',
    kind: 'TRANSFER',
    summary: 'General Services → Production & Quality Control (Site C)',
    effectiveFrom: '2026-10-12',
    reason: 'Packing moves into the factory line at Site C.',
    payload: { department: 'Production & Quality Control', stationId: 'st-khe-c', supervisorStaffId: 'KHE-0419' },
    requestedBy: 'Esther Muthoni',
    requestedOn: '2026-10-06',
    status: 'PENDING'
  }
];
