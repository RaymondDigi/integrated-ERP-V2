import {
  HRProcessApp,
  TenantOrganization,
  HREmployee,
  BiometricPunch,
  LeaveRequest,
  PayrollBatch,
  ContractThresholdRecord,
  OshPermit,
  ContractTypeDefinition,
  SeparationRecord
} from '../types';

export const TENANT_ORGANIZATIONS: TenantOrganization[] = [
  {
    id: 'org-kericho',
    name: 'Kericho Highland Estates Ltd',
    code: 'KHE-NUCLEUS',
    entityType: 'Head Office & Operations',
    location: 'Kericho Highlands, Rift Valley',
    employeeCount: 640,
    activePayrollBatchKes: 3488675,
    complianceRating: '100% (KRA/NSSF/SHIF Validated)'
  },
  {
    id: 'org-factory',
    name: 'Kericho Processing Factory Unit 1',
    code: 'KPF-UNIT-1',
    entityType: 'Manufacturing & Quality Assurance',
    location: 'Industrial Zone, Kericho',
    employeeCount: 280,
    activePayrollBatchKes: 1850000,
    complianceRating: '98.5% (DOSHS Form 1 Certified)'
  },
  {
    id: 'org-nandi',
    name: 'Nandi Hills Outgrowers Cooperative',
    code: 'NHO-OUTGROWER',
    entityType: 'Field Services Workforce',
    location: 'Nandi Hills County',
    employeeCount: 340,
    activePayrollBatchKes: 1274989,
    complianceRating: '96.8% (Service Threshold Monitor Active)'
  },
  {
    id: 'org-rift',
    name: 'Rift Valley Agricultural Holding Ltd',
    code: 'RVA-HOLDINGS',
    entityType: 'Diversified Business Unit',
    location: 'Nakuru - Rongai Corridor',
    employeeCount: 120,
    activePayrollBatchKes: 890000,
    complianceRating: '99.2% (DOSHS Chemical Safety Register)'
  },
  {
    id: 'org-nairobi',
    name: 'Corporate HQ Nairobi',
    code: 'IE-CORP-HQ',
    entityType: 'Executive Administration & Group Treasury',
    location: 'Upper Hill, Nairobi',
    employeeCount: 45,
    activePayrollBatchKes: 4850000,
    complianceRating: '100% (Monthly Bank EFT)'
  }
];

// Company-defined contract types (configured per organisation, assigned at employee creation)
export const CONTRACT_TYPES: ContractTypeDefinition[] = [
  { id: 'ct-standard', name: 'Standard Employment Contract', payBasis: 'MONTHLY_SALARY', payFrequency: 'MONTHLY', hasEndDate: false },
  { id: 'ct-fixed', name: 'Fixed-Term Contract', payBasis: 'MONTHLY_SALARY', payFrequency: 'MONTHLY', hasEndDate: true },
  { id: 'ct-daily', name: 'Daily-Rated Contract', payBasis: 'DAILY_RATE', payFrequency: 'WEEKLY', hasEndDate: true, serviceThresholdDays: 26 },
  { id: 'ct-output', name: 'Output-Based Contract', payBasis: 'OUTPUT_RATE', payFrequency: 'WEEKLY', hasEndDate: true, serviceThresholdDays: 26 },
  // Plucking-season staff engaged for the flush and re-engaged each season
  { id: 'ct-seasonal', name: 'Seasonal Contract', payBasis: 'DAILY_RATE', payFrequency: 'WEEKLY', hasEndDate: true },
  // Interns and industrial attachees (Interns & attachees in Onboarding)
  { id: 'ct-intern', name: 'Internship Agreement', payBasis: 'MONTHLY_SALARY', payFrequency: 'MONTHLY', hasEndDate: true },
  { id: 'ct-attach', name: 'Industrial Attachment', payBasis: 'MONTHLY_SALARY', payFrequency: 'MONTHLY', hasEndDate: true }
];

export const HR_PROCESS_APPS: HRProcessApp[] = [
  {
    id: 'employee-requisition',
    stepNumber: 1,
    name: 'Employee Requisition',
    category: 'Talent Acquisition',
    shortDesc: 'Establishment control & vacancy quota',
    fullDesc: 'Manpower requisition wizard with strict establishment headcount checks and multi-tier approval hierarchy.',
    iconName: 'ClipboardList',
    badgeText: '4 Pending',
    badgeVariant: 'warning',
    route: 'employee-requisition',
    metrics: { label: 'Active Quota', value: '94% Budgeted' }
  },
  {
    id: 'recruitment',
    stepNumber: 2,
    name: 'Recruitment & Pipeline',
    category: 'Talent Acquisition',
    shortDesc: 'E-Recruitment, scoring & aptitude tests',
    fullDesc: 'Candidate application tracking, online aptitude assessments, and weighted multi-panel interview rubrics.',
    iconName: 'UserCheck',
    badgeText: '48 Active',
    badgeVariant: 'primary',
    route: 'recruitment',
    metrics: { label: 'Time-to-Hire', value: '18 Days' }
  },
  {
    id: 'onboarding',
    stepNumber: 3,
    name: 'Pre-Employment & Induction',
    category: 'Talent Acquisition',
    shortDesc: 'KYC check, kit & safety allocation',
    fullDesc: 'Interactive employee induction wizard with KRA/NSSF/SHIF KYC verification, digital policy sign-offs, and kit allocation.',
    iconName: 'ShieldAlert',
    badgeText: '7 Inductees',
    badgeVariant: 'info',
    route: 'onboarding',
    metrics: { label: 'KYC Pass Rate', value: '98.5%' }
  },
  {
    id: 'employees',
    stepNumber: 4,
    name: 'Employee Master & Org',
    category: 'Core HR & Time',
    shortDesc: 'Encrypted PII vault & visual org chart',
    fullDesc: 'AES-256 encrypted employee registry, multi-level parent-child org chart, contract categorization, and cost-center mapping.',
    iconName: 'Users',
    badgeText: '1,425 Staff',
    badgeVariant: 'success',
    route: 'employees',
    metrics: { label: 'Active Roster', value: '1,425 Active' }
  },
  {
    id: 'attendance',
    stepNumber: 5,
    name: 'Biometric Attendance & Muster',
    category: 'Core HR & Time',
    shortDesc: 'ADMS push, GPS geofence & output tallies',
    fullDesc: 'Live biometric sync from ZKTeco/Hikvision gates, 100m polygon geofenced mobile clock-ins, and production output tallies.',
    iconName: 'Clock',
    badgeText: 'Live Stream',
    badgeVariant: 'success',
    route: 'attendance',
    metrics: { label: 'Daily Muster', value: '96.2% On-Site' }
  },
  {
    id: 'leave',
    stepNumber: 6,
    name: 'Leave & Absence',
    category: 'Core HR & Time',
    shortDesc: 'Online balances & leave allowances',
    fullDesc: 'Employee self-service leave requests, supervisor multi-tier sign-off, and automated payroll leave allowance integration.',
    iconName: 'CalendarDays',
    badgeText: '12 On Leave',
    badgeVariant: 'info',
    route: 'leave',
    metrics: { label: 'Pending Requests', value: '6 Approvals' }
  },
  {
    id: 'payroll',
    stepNumber: 7,
    name: 'Employee Payroll',
    category: 'Payroll & Statutory',
    shortDesc: 'KRA 2026, NSSF, SHIF & M-Pesa B2C',
    fullDesc: 'Employee payroll: Monthly and weekly payroll runs by contract pay frequency, KRA PAYE, NSSF I/II, SHIF 2.75%, AHL 1.5%, and bank EFT file.',
    iconName: 'Coins',
    badgeText: 'KES 4.2M Batch',
    badgeVariant: 'primary',
    route: 'payroll',
    metrics: { label: 'Dual Pipeline', value: '2 Pipelines Active' }
  },
  {
    id: 'performance',
    stepNumber: 8,
    name: 'Performance & OKR',
    category: 'Talent Growth',
    shortDesc: 'Balanced scorecard & 9-box matrix',
    fullDesc: 'Continuous appraisal cycles with OKR alignment, 9-box talent succession matrix, and appraisal-linked merit bonus formulas.',
    iconName: 'Award',
    badgeText: 'Q3 Cycle',
    badgeVariant: 'warning',
    route: 'performance',
    metrics: { label: 'Avg Rating', value: '4.2 / 5.0' }
  },
  {
    id: 'training',
    stepNumber: 9,
    name: 'Learning & Skills Matrix',
    category: 'Talent Growth',
    shortDesc: 'Training matrix & safety certifications',
    fullDesc: 'Corporate skills gap heatmaps, statutory food handler 6-month laboratory exams, and boiler operating permit renewals.',
    iconName: 'GraduationCap',
    badgeText: '3 Expirations',
    badgeVariant: 'warning',
    route: 'training',
    metrics: { label: 'Compliance', value: '94% Certified' }
  },
  {
    id: 'disciplinary',
    stepNumber: 10,
    name: 'Contract Compliance & Disciplinary',
    category: 'Governance & Safety',
    shortDesc: 'Hearings & service threshold monitor',
    fullDesc: 'Rolling service-threshold monitor with 1-click contract type change, plus disciplinary hearing workflows.',
    iconName: 'Scale',
    badgeText: '3 Flagged',
    badgeVariant: 'critical',
    route: 'disciplinary',
    metrics: { label: 'Conversion Risk', value: '1 Hard Block' }
  },
  {
    id: 'osh-security',
    stepNumber: 11,
    name: 'OSH & Gate Security',
    category: 'Governance & Safety',
    shortDesc: 'Permits to work, DOSHS Form 1 & NFC',
    fullDesc: 'Digital Permit to Work (Hot Work, Confined Space), statutory DOSHS accident notification generator, and mobile NFC security guard tour logs.',
    iconName: 'HardHat',
    badgeText: 'Zero Harm',
    badgeVariant: 'success',
    route: 'osh-security',
    metrics: { label: 'Incident-Free', value: '142 Days' }
  },
  {
    id: 'separation',
    stepNumber: 12,
    name: 'Separation & Gratuity',
    category: 'Governance & Safety',
    shortDesc: 'Digital clearance, gratuity & P9 tax',
    fullDesc: 'Multi-department clearance sign-off (Stores, IT, Housing, Accounts), severance/gratuity calculator, and terminal KRA P9 issuance.',
    iconName: 'FileCheck',
    badgeText: '2 In-Progress',
    badgeVariant: 'info',
    route: 'separation',
    metrics: { label: 'Terminal Slips', value: '100% Cleared' }
  },
  {
    id: 'hr-services',
    stepNumber: 13,
    name: 'Staff Welfare & Services',
    category: 'Governance & Safety',
    shortDesc: 'Welfare, medical cover, travel, CSR & library',
    fullDesc: 'Welfare entitlements paid through payroll, medical scheme membership and claims, travel imprest and petty cash with Finance issue and surrender, CSR and staff events, outsourced labour and the staff library.',
    iconName: 'Award',
    badgeText: 'New',
    badgeVariant: 'info',
    route: 'hr-services',
    metrics: { label: 'Services', value: 6 }
  }
];

// Requisitions, candidates and onboarding seeds live with the hire module
export { INITIAL_REQUISITIONS, INITIAL_CANDIDATES, INITIAL_ONBOARDING } from './hireSeed';

export const INITIAL_HR_EMPLOYEES: HREmployee[] = [
  {
    id: 'EMP-001',
    orgId: 'org-kericho',
    staffId: 'KHE-0419',
    fullName: 'David Kiprono Rono',
    email: 'd.rono@intergrated-erp.ke',
    phone: '+254 720 112 334',
    nationalIdMasked: '24*****9',
    kraPinMasked: 'A00*****8Z',
    nssfNoMasked: '109****2',
    shifNoMasked: 'SHIF-****-992',
    bankAccountMasked: 'KCB 11****829',
    mpesaPhoneMasked: '+254 720 *** 334',
    contractType: 'Standard Employment Contract',
    department: 'Operations',
    branch: 'Kericho Highland Estates',
    block: 'Block A (Main Site)',
    jobTitle: 'Chief Operations Officer',
    basicSalaryKes: 185000,
    joinedDate: '2021-03-15',
    status: 'ACTIVE'
  },
  {
    id: 'EMP-002',
    orgId: 'org-nairobi',
    staffId: 'KHE-0892',
    fullName: 'Caroline Wangari Kamau',
    email: 'c.kamau@intergrated-erp.ke',
    phone: '+254 711 998 776',
    nationalIdMasked: '29*****4',
    kraPinMasked: 'P05*****1K',
    nssfNoMasked: '221****8',
    shifNoMasked: 'SHIF-****-441',
    bankAccountMasked: 'Equity 01****412',
    mpesaPhoneMasked: '+254 711 *** 776',
    contractType: 'Standard Employment Contract',
    department: 'Finance & Payroll',
    branch: 'Corporate HQ Nairobi',
    jobTitle: 'Senior Payroll Accountant',
    basicSalaryKes: 142000,
    joinedDate: '2022-07-01',
    status: 'ACTIVE'
  },
  {
    id: 'EMP-003',
    orgId: 'org-kericho',
    staffId: 'CAS-1402',
    fullName: 'Juma Mwangi Otieno',
    email: 'j.otieno@ops.intergrated-erp.ke',
    phone: '+254 728 554 120',
    nationalIdMasked: '33*****1',
    kraPinMasked: 'A01*****4L',
    nssfNoMasked: '449****0',
    shifNoMasked: 'SHIF-****-711',
    bankAccountMasked: 'Co-op 02****991',
    mpesaPhoneMasked: '+254 728 *** 120',
    contractType: 'Daily-Rated Contract',
    department: 'General Services',
    branch: 'Kericho Highland Estates',
    block: 'Block C (Production Section)',
    jobTitle: 'Senior Production Operative',
    basicSalaryKes: 0,
    pieceRatePerUnitKes: 14.5,
    joinedDate: '2026-07-20',
    status: 'ACTIVE'
  },
  {
    id: 'EMP-004',
    orgId: 'org-kericho',
    staffId: 'CAS-1405',
    fullName: 'Faith Jepkemoi Bett',
    email: 'f.bett@ops.intergrated-erp.ke',
    phone: '+254 703 667 890',
    nationalIdMasked: '34*****7',
    kraPinMasked: 'A01*****9P',
    nssfNoMasked: '450****3',
    shifNoMasked: 'SHIF-****-893',
    bankAccountMasked: 'NCBA 12****882',
    mpesaPhoneMasked: '+254 703 *** 890',
    contractType: 'Daily-Rated Contract',
    department: 'General Services',
    branch: 'Kericho Highland Estates',
    block: 'Block C (Production Section)',
    jobTitle: 'Production Operative',
    basicSalaryKes: 0,
    pieceRatePerUnitKes: 14.5,
    joinedDate: '2026-08-01',
    status: 'ACTIVE'
  },
  {
    id: 'EMP-005',
    orgId: 'org-factory',
    staffId: 'KHE-1021',
    fullName: 'Dennis Mutwiri Njiru',
    email: 'd.mutwiri@intergrated-erp.ke',
    phone: '+254 715 443 219',
    nationalIdMasked: '31*****6',
    kraPinMasked: 'P05*****7R',
    nssfNoMasked: '312****5',
    shifNoMasked: 'SHIF-****-652',
    bankAccountMasked: 'Stanbic 03****651',
    mpesaPhoneMasked: '+254 715 *** 219',
    contractType: 'Fixed-Term Contract',
    department: 'Production & Factory',
    branch: 'Kericho Factory Unit 1',
    jobTitle: 'Factory Electrical Engineer',
    basicSalaryKes: 115000,
    joinedDate: '2024-02-01',
    status: 'ACTIVE'
  },
  {
    id: 'EMP-006',
    orgId: 'org-nandi',
    staffId: 'NHO-0312',
    fullName: 'Peter Kiprotich Cheruiyot',
    email: 'p.cheruiyot@nandi.intergrated-erp.ke',
    phone: '+254 718 221 440',
    nationalIdMasked: '28*****3',
    kraPinMasked: 'A00*****5T',
    nssfNoMasked: '390****1',
    shifNoMasked: 'SHIF-****-210',
    bankAccountMasked: 'Equity 04****711',
    mpesaPhoneMasked: '+254 718 *** 440',
    contractType: 'Standard Employment Contract',
    department: 'Customer Service',
    branch: 'Nandi Hills Outgrowers Cooperative',
    jobTitle: 'Senior Customer Service Officer',
    basicSalaryKes: 128000,
    joinedDate: '2023-05-10',
    status: 'ACTIVE'
  }
];

export const INITIAL_ATTENDANCE_PUNCHES: BiometricPunch[] = [
  {
    id: 'PUNCH-901',
    orgId: 'org-kericho',
    staffId: 'CAS-1402',
    staffName: 'Juma Mwangi Otieno',
    branch: 'Kericho Highland Estates',
    block: 'Block C Production Crew',
    deviceId: 'ZK-GATE-04 (Site Turnstile)',
    timestamp: '2026-09-22 06:14:02',
    type: 'CLOCK_IN',
    source: 'BIOMETRIC_ADMS',
    geofenceStatus: 'VALID_POLYGON'
  },
  {
    id: 'PUNCH-902',
    orgId: 'org-kericho',
    staffId: 'CAS-1402',
    staffName: 'Juma Mwangi Otieno',
    branch: 'Kericho Highland Estates',
    block: 'Block C Production Crew',
    deviceId: 'OPT-SCALE-02 (Output Counter)',
    timestamp: '2026-09-22 12:45:18',
    type: 'OUTPUT_TALLY',
    source: 'OUTPUT_COUNTER',
    geofenceStatus: 'VALID_POLYGON',
    pieceRateUnits: 46.8
  },
  {
    id: 'PUNCH-903',
    orgId: 'org-kericho',
    staffId: 'CAS-1405',
    staffName: 'Faith Jepkemoi Bett',
    branch: 'Kericho Highland Estates',
    block: 'Block C Production Crew',
    deviceId: 'OPT-SCALE-02 (Output Counter)',
    timestamp: '2026-09-22 12:48:33',
    type: 'OUTPUT_TALLY',
    source: 'OUTPUT_COUNTER',
    geofenceStatus: 'VALID_POLYGON',
    pieceRateUnits: 52.4
  },
  {
    id: 'PUNCH-904',
    orgId: 'org-kericho',
    staffId: 'KHE-0419',
    staffName: 'David Kiprono Rono',
    branch: 'Kericho Highland Estates',
    block: 'Block A (Main Office)',
    deviceId: 'HIK-FACIAL-01 (HQ Gate)',
    timestamp: '2026-09-22 07:48:10',
    type: 'CLOCK_IN',
    source: 'BIOMETRIC_ADMS',
    geofenceStatus: 'VALID_POLYGON'
  },
  {
    id: 'PUNCH-905',
    orgId: 'org-factory',
    staffId: 'KHE-1021',
    staffName: 'Dennis Mutwiri Njiru',
    branch: 'Kericho Factory Unit 1',
    block: 'Factory Boiler Gate',
    deviceId: 'MOB-GEOFENCE-09 (Android PWA)',
    timestamp: '2026-09-22 07:55:40',
    type: 'CLOCK_IN',
    source: 'GPS_GEOFENCE',
    geofenceStatus: 'VALID_POLYGON'
  },
  {
    id: 'PUNCH-906',
    orgId: 'org-nandi',
    staffId: 'NHO-0312',
    staffName: 'Peter Kiprotich Cheruiyot',
    branch: 'Nandi Hills Outgrowers Cooperative',
    block: 'Chepsire Service Block',
    deviceId: 'ZK-GATE-08 (Muster Hub)',
    timestamp: '2026-09-22 07:12:15',
    type: 'CLOCK_IN',
    source: 'BIOMETRIC_ADMS',
    geofenceStatus: 'VALID_POLYGON'
  }
];

// Leave requests reference staff in the workforce master; day counts follow the leave engine
// (working days exclude weekends and gazetted holidays; maternity and paternity are calendar days).
const sup = (by: string, at: string, comment?: string) => ({ step: 'SUPERVISOR' as const, by, action: 'APPROVED' as const, at, comment });
const hr = (by: string, at: string, comment?: string) => ({ step: 'HR' as const, by, action: 'APPROVED' as const, at, comment });

export const INITIAL_LEAVE_REQUESTS: LeaveRequest[] = [
  /* ---------------- Kericho Highland Estates ---------------- */
  // On leave today
  {
    id: 'LV-2026-041', orgId: 'org-kericho', staffId: 'KHE-0419', staffName: 'David Kiprono Rono', leaveType: 'Annual Leave',
    startDate: '2026-10-05', endDate: '2026-10-16', daysCount: 10, status: 'APPROVED', reason: 'Scheduled annual rest after peak season.',
    leaveAllowanceTriggered: true, appliedOn: '2026-09-18', approverStaffId: 'KHE-0120', approverName: 'Amina Hassan', decidedOn: '2026-09-22',
    approvals: [sup('Amina Hassan', '2026-09-21'), hr('Rose Chepkoech', '2026-09-22')]
  },
  {
    id: 'LV-2026-050', orgId: 'org-kericho', staffId: 'KHE-0276', staffName: 'Faith Akinyi', leaveType: 'Sick Leave',
    startDate: '2026-10-06', endDate: '2026-10-07', daysCount: 2, status: 'APPROVED', reason: 'Flu, resting at home.',
    leaveAllowanceTriggered: false, appliedOn: '2026-10-06', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', decidedOn: '2026-10-06',
    approvals: [sup('David Kiprono Rono', '2026-10-06')]
  },
  {
    id: 'LV-2026-051', orgId: 'org-kericho', staffId: 'KHE-1103', staffName: 'Faith Onyango', leaveType: 'Maternity Leave',
    startDate: '2026-08-17', endDate: '2026-11-14', daysCount: 90, status: 'APPROVED', reason: 'Maternity leave, expected delivery 24 Aug.',
    leaveAllowanceTriggered: false, appliedOn: '2026-07-28', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', decidedOn: '2026-07-30',
    attachment: true, approvals: [sup('David Kiprono Rono', '2026-07-29'), hr('Rose Chepkoech', '2026-07-30', 'Clinic letter on file.')]
  },
  // Waiting for the supervisor
  {
    id: 'LV-2026-052', orgId: 'org-kericho', staffId: 'KHE-0244', staffName: 'Peter Mwangi', leaveType: 'Annual Leave',
    startDate: '2026-10-26', endDate: '2026-10-30', daysCount: 5, status: 'PENDING_APPROVAL', reason: 'Family visit in Kakamega.',
    leaveAllowanceTriggered: false, appliedOn: '2026-10-05', approverStaffId: 'KHE-0152', approverName: 'Lucy Njeri', currentStep: 'SUPERVISOR'
  },
  {
    id: 'LV-2026-053', orgId: 'org-kericho', staffId: 'KHE-0270', staffName: 'Kevin Ouma', leaveType: 'Compassionate Leave',
    startDate: '2026-10-12', endDate: '2026-10-14', daysCount: 3, status: 'PENDING_APPROVAL', reason: 'Burial of my uncle in Siaya.',
    leaveAllowanceTriggered: false, appliedOn: '2026-10-06', approverStaffId: 'KHE-0160', approverName: 'Esther Muthoni', currentStep: 'SUPERVISOR'
  },
  {
    id: 'LV-2026-054', orgId: 'org-kericho', staffId: 'KHE-0251', staffName: 'Mary Wambui', leaveType: 'Annual Leave',
    startDate: '2026-10-19', endDate: '2026-10-23', daysCount: 4, status: 'PENDING_APPROVAL', reason: 'Long weekend around Mashujaa Day.',
    leaveAllowanceTriggered: false, appliedOn: '2026-10-02', approverStaffId: 'KHE-0160', approverName: 'Esther Muthoni', currentStep: 'SUPERVISOR'
  },
  {
    id: 'LV-2026-055', orgId: 'org-kericho', staffId: 'KHE-1111', staffName: 'Rose Wekesa', leaveType: 'Annual Leave',
    startDate: '2026-12-14', endDate: '2026-12-18', daysCount: 5, status: 'PENDING_APPROVAL', reason: 'Christmas travel to Bungoma.',
    leaveAllowanceTriggered: false, appliedOn: '2026-10-01', approverStaffId: 'KHE-0160', approverName: 'Esther Muthoni', currentStep: 'SUPERVISOR'
  },
  {
    id: 'LV-2026-056', orgId: 'org-kericho', staffId: 'KHE-1106', staffName: 'Dennis Muthoni', leaveType: 'Sick Leave',
    startDate: '2026-10-05', endDate: '2026-10-07', daysCount: 3, status: 'PENDING_APPROVAL', reason: 'Back injury, doctor’s note attached.',
    leaveAllowanceTriggered: false, appliedOn: '2026-10-05', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', currentStep: 'SUPERVISOR', attachment: true
  },
  // Waiting for HR
  {
    id: 'LV-2026-057', orgId: 'org-kericho', staffId: 'KHE-0187', staffName: 'Grace Wanjiku', leaveType: 'Annual Leave',
    startDate: '2026-11-02', endDate: '2026-11-13', daysCount: 10, status: 'PENDING_APPROVAL', reason: 'Wedding and honeymoon.',
    leaveAllowanceTriggered: false, appliedOn: '2026-09-29', approverStaffId: 'KHE-0134', approverName: 'David Otieno', currentStep: 'HR',
    approvals: [sup('David Otieno', '2026-10-02', 'Month-end close covered by Allan.')]
  },
  {
    id: 'LV-2026-058', orgId: 'org-kericho', staffId: 'KHE-1104', staffName: 'Collins Njeri', leaveType: 'Paternity Leave',
    startDate: '2026-10-19', endDate: '2026-11-01', daysCount: 14, status: 'PENDING_APPROVAL', reason: 'Paternity leave, baby due 17 Oct.',
    leaveAllowanceTriggered: false, appliedOn: '2026-10-01', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', currentStep: 'HR', attachment: true,
    approvals: [sup('David Kiprono Rono', '2026-10-03')]
  },
  {
    id: 'LV-2026-059', orgId: 'org-kericho', staffId: 'KHE-1110', staffName: 'Felix Jeptoo', leaveType: 'Sick Leave',
    startDate: '2026-10-01', endDate: '2026-10-02', daysCount: 2, status: 'PENDING_APPROVAL', reason: 'Malaria; was off sick before he could apply.',
    leaveAllowanceTriggered: false, appliedOn: '2026-10-05', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', currentStep: 'HR',
    backdated: true, submittedBy: 'SUPERVISOR', approvals: [sup('David Kiprono Rono', '2026-10-06', 'Submitted on his behalf.')]
  },
  {
    id: 'LV-2026-060', orgId: 'org-kericho', staffId: 'KHE-1107', staffName: 'Caroline Barasa', leaveType: 'Annual Leave',
    startDate: '2026-11-23', endDate: '2026-11-27', daysCount: 5, status: 'PENDING_APPROVAL', reason: 'Rest after the harvest peak.',
    leaveAllowanceTriggered: false, appliedOn: '2026-10-04', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', currentStep: 'HR',
    approvals: [sup('David Kiprono Rono', '2026-10-05')]
  },
  // Declined and cancelled
  {
    id: 'LV-2026-061', orgId: 'org-kericho', staffId: 'KHE-0263', staffName: 'John Kiprop', leaveType: 'Annual Leave',
    startDate: '2026-09-28', endDate: '2026-10-02', daysCount: 5, status: 'REJECTED', reason: 'Personal errands.',
    leaveAllowanceTriggered: false, appliedOn: '2026-09-10', approverStaffId: 'KHE-0160', approverName: 'Esther Muthoni', decidedOn: '2026-09-15',
    approverComment: 'Quarter-end stock take that week. Please pick dates in October.',
    approvals: [{ step: 'SUPERVISOR', by: 'Esther Muthoni', action: 'REJECTED', at: '2026-09-15', comment: 'Quarter-end stock take that week.' }]
  },
  {
    id: 'LV-2026-062', orgId: 'org-kericho', staffId: 'KHE-0171', staffName: 'Ruth Chebet', leaveType: 'Annual Leave',
    startDate: '2026-08-10', endDate: '2026-08-14', daysCount: 5, status: 'CANCELLED', reason: 'Family holiday at the coast.',
    leaveAllowanceTriggered: false, appliedOn: '2026-07-20', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', decidedOn: '2026-07-30',
    cancelledFrom: 'PENDING_APPROVAL', approvals: [{ step: 'SUPERVISOR', by: 'Ruth Chebet', action: 'CANCELLED', at: '2026-07-30', comment: 'NEMA audit moved to that week.' }]
  },
  {
    id: 'LV-2026-063', orgId: 'org-kericho', staffId: 'KHE-0178', staffName: 'Samuel Kiptoo', leaveType: 'Annual Leave',
    startDate: '2026-10-26', endDate: '2026-10-30', daysCount: 5, status: 'CANCELLED', reason: 'Short break.',
    leaveAllowanceTriggered: false, appliedOn: '2026-09-15', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', decidedOn: '2026-10-02',
    cancelledFrom: 'APPROVED',
    approvals: [sup('David Kiprono Rono', '2026-09-18'), hr('Rose Chepkoech', '2026-09-20'), { step: 'HR', by: 'Samuel Kiptoo', action: 'CANCELLED', at: '2026-10-02', comment: 'ERP upgrade go-live moved into that week.' }]
  },
  // Holiday off, using credits for public holidays worked
  {
    id: 'LV-2026-064', orgId: 'org-kericho', staffId: 'KHE-1108', staffName: 'Victor Chebet', leaveType: 'Holiday Off',
    startDate: '2026-07-10', endDate: '2026-07-10', daysCount: 0.5, halfDay: true, status: 'APPROVED', reason: 'Half day off for the Madaraka Day shift.',
    leaveAllowanceTriggered: false, appliedOn: '2026-07-06', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', decidedOn: '2026-07-07',
    approvals: [sup('David Kiprono Rono', '2026-07-07')]
  },
  {
    id: 'LV-2026-065', orgId: 'org-kericho', staffId: 'KHE-0301', staffName: 'Samuel Ouma', leaveType: 'Holiday Off',
    startDate: '2026-04-20', endDate: '2026-04-20', daysCount: 1, status: 'APPROVED', reason: 'Day off for driving on Good Friday.',
    leaveAllowanceTriggered: false, appliedOn: '2026-04-14', approverStaffId: 'KHE-0160', approverName: 'Esther Muthoni', decidedOn: '2026-04-15',
    approvals: [sup('Esther Muthoni', '2026-04-15')]
  },
  {
    id: 'LV-2026-066', orgId: 'org-kericho', staffId: 'KHE-0302', staffName: 'Joseph Mutua', leaveType: 'Holiday Off',
    startDate: '2026-02-13', endDate: '2026-02-13', daysCount: 1, status: 'APPROVED', reason: 'Day off for the Boxing Day trip.',
    leaveAllowanceTriggered: false, appliedOn: '2026-02-09', approverStaffId: 'KHE-0160', approverName: 'Esther Muthoni', decidedOn: '2026-02-10',
    approvals: [sup('Esther Muthoni', '2026-02-10')]
  },
  {
    id: 'LV-2026-067', orgId: 'org-kericho', staffId: 'KHE-1100', staffName: 'Brian Atieno', leaveType: 'Holiday Off',
    startDate: '2026-05-08', endDate: '2026-05-08', daysCount: 1, status: 'APPROVED', reason: 'Day off for the Eid shift.',
    leaveAllowanceTriggered: false, appliedOn: '2026-05-04', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', decidedOn: '2026-05-05',
    approvals: [sup('David Kiprono Rono', '2026-05-05')]
  },
  // Taken earlier in the year
  {
    id: 'LV-2026-068', orgId: 'org-kericho', staffId: 'KHE-1101', staffName: 'Purity Kiprotich', leaveType: 'Annual Leave',
    startDate: '2026-01-12', endDate: '2026-01-16', daysCount: 5, status: 'APPROVED', reason: 'School opening for the children.',
    leaveAllowanceTriggered: true, appliedOn: '2026-01-02', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', decidedOn: '2026-01-05',
    approvals: [sup('David Kiprono Rono', '2026-01-04'), hr('Rose Chepkoech', '2026-01-05')]
  },
  {
    id: 'LV-2026-069', orgId: 'org-kericho', staffId: 'KHE-0152', staffName: 'Lucy Njeri', leaveType: 'Annual Leave',
    startDate: '2026-02-16', endDate: '2026-02-23', daysCount: 6, status: 'APPROVED', reason: 'Using carried-over days before they expire.',
    leaveAllowanceTriggered: true, appliedOn: '2026-01-30', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', decidedOn: '2026-02-03',
    approvals: [sup('David Kiprono Rono', '2026-02-02'), hr('Rose Chepkoech', '2026-02-03')]
  },
  {
    id: 'LV-2026-070', orgId: 'org-kericho', staffId: 'KHE-0290', staffName: 'Rose Chepkoech', leaveType: 'Sick Leave',
    startDate: '2026-03-03', endDate: '2026-03-03', daysCount: 1, status: 'APPROVED', reason: 'Dental procedure.',
    leaveAllowanceTriggered: false, appliedOn: '2026-03-03', approverStaffId: 'KHE-0134', approverName: 'David Otieno', decidedOn: '2026-03-03',
    approvals: [sup('David Otieno', '2026-03-03')]
  },
  {
    id: 'LV-2026-071', orgId: 'org-kericho', staffId: 'KHE-0160', staffName: 'Esther Muthoni', leaveType: 'Annual Leave',
    startDate: '2026-03-09', endDate: '2026-03-13', daysCount: 5, status: 'APPROVED', reason: 'Family time over the school half-term.',
    leaveAllowanceTriggered: true, appliedOn: '2026-02-18', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', decidedOn: '2026-02-20',
    approvals: [sup('David Kiprono Rono', '2026-02-19'), hr('Rose Chepkoech', '2026-02-20')]
  },
  {
    id: 'LV-2026-072', orgId: 'org-kericho', staffId: 'KHE-1114', staffName: 'Allan Akinyi', leaveType: 'Compassionate Leave',
    startDate: '2026-03-09', endDate: '2026-03-11', daysCount: 3, status: 'APPROVED', reason: 'Death of my grandmother.',
    leaveAllowanceTriggered: false, appliedOn: '2026-03-09', approverStaffId: 'KHE-0134', approverName: 'David Otieno', decidedOn: '2026-03-09',
    approvals: [sup('David Otieno', '2026-03-09')]
  },
  {
    id: 'LV-2026-073', orgId: 'org-kericho', staffId: 'KHE-0211', staffName: 'Samuel Cherop Sang', leaveType: 'Annual Leave',
    startDate: '2026-03-16', endDate: '2026-03-20', daysCount: 5, status: 'APPROVED', reason: 'Annual leave before the night-shift rota change.',
    leaveAllowanceTriggered: true, appliedOn: '2026-02-25', approverStaffId: 'KHE-0160', approverName: 'Esther Muthoni', decidedOn: '2026-03-02',
    approvals: [sup('Esther Muthoni', '2026-03-01'), hr('Rose Chepkoech', '2026-03-02')]
  },
  {
    id: 'LV-2026-074', orgId: 'org-kericho', staffId: 'KHE-0120', staffName: 'Amina Hassan', leaveType: 'Annual Leave',
    startDate: '2026-04-07', endDate: '2026-04-17', daysCount: 9, status: 'APPROVED', reason: 'Easter break abroad.',
    leaveAllowanceTriggered: true, appliedOn: '2026-03-09', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', decidedOn: '2026-03-12',
    approvals: [sup('David Kiprono Rono', '2026-03-11'), hr('Rose Chepkoech', '2026-03-12')]
  },
  {
    id: 'LV-2026-075', orgId: 'org-kericho', staffId: 'KHE-0141', staffName: 'Agnes Wairimu', leaveType: 'Annual Leave',
    startDate: '2026-05-04', endDate: '2026-05-08', daysCount: 5, status: 'APPROVED', reason: 'Graduation of my son.',
    leaveAllowanceTriggered: true, appliedOn: '2026-04-15', approverStaffId: 'KHE-0134', approverName: 'David Otieno', decidedOn: '2026-04-20',
    approvals: [sup('David Otieno', '2026-04-17'), hr('Rose Chepkoech', '2026-04-20')]
  },
  {
    id: 'LV-2026-076', orgId: 'org-kericho', staffId: 'KHE-0303', staffName: 'Ali Bakari', leaveType: 'Unpaid Leave',
    startDate: '2026-05-11', endDate: '2026-05-22', daysCount: 10, status: 'APPROVED', reason: 'Settling a family land matter in Lamu.',
    leaveAllowanceTriggered: false, appliedOn: '2026-04-30', approverStaffId: 'KHE-0160', approverName: 'Esther Muthoni', decidedOn: '2026-05-05',
    approvals: [sup('Esther Muthoni', '2026-05-04'), hr('Rose Chepkoech', '2026-05-05', 'Annual leave accrual pauses for these days.')]
  },
  {
    id: 'LV-2026-077', orgId: 'org-kericho', staffId: 'KHE-1102', staffName: 'Kevin Adhiambo', leaveType: 'Sick Leave',
    startDate: '2026-05-18', endDate: '2026-05-22', daysCount: 5, status: 'APPROVED', reason: 'Hospitalised for typhoid.',
    leaveAllowanceTriggered: false, appliedOn: '2026-05-18', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', decidedOn: '2026-05-18',
    attachment: true, approvals: [sup('David Kiprono Rono', '2026-05-18')]
  },
  {
    id: 'LV-2026-078', orgId: 'org-kericho', staffId: 'KHE-0280', staffName: 'Brian Kamau', leaveType: 'Annual Leave',
    startDate: '2026-06-02', endDate: '2026-06-05', daysCount: 4, status: 'APPROVED', reason: 'Long weekend after Madaraka Day.',
    leaveAllowanceTriggered: true, appliedOn: '2026-05-18', approverStaffId: 'KHE-0178', approverName: 'Samuel Kiptoo', decidedOn: '2026-05-20',
    approvals: [sup('Samuel Kiptoo', '2026-05-19'), hr('Rose Chepkoech', '2026-05-20')]
  },
  {
    id: 'LV-2026-079', orgId: 'org-kericho', staffId: 'KHE-1113', staffName: 'Beatrice Kipkemboi', leaveType: 'Study Leave',
    startDate: '2026-06-08', endDate: '2026-06-12', daysCount: 5, status: 'APPROVED', reason: 'CIM marketing exams in Nairobi.',
    leaveAllowanceTriggered: false, appliedOn: '2026-05-15', approverStaffId: 'KHE-0152', approverName: 'Lucy Njeri', decidedOn: '2026-05-22',
    attachment: true, approvals: [sup('Lucy Njeri', '2026-05-20'), hr('Rose Chepkoech', '2026-05-22', 'Exam timetable on file.')]
  },
  {
    id: 'LV-2026-080', orgId: 'org-kericho', staffId: 'KHE-0295', staffName: 'Elijah Barasa', leaveType: 'Annual Leave',
    startDate: '2026-06-22', endDate: '2026-06-26', daysCount: 5, status: 'APPROVED', reason: 'Annual leave after confirmation.',
    leaveAllowanceTriggered: true, appliedOn: '2026-06-08', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', decidedOn: '2026-06-10',
    approvals: [sup('David Kiprono Rono', '2026-06-09'), hr('Rose Chepkoech', '2026-06-10')]
  },
  {
    id: 'LV-2026-081', orgId: 'org-kericho', staffId: 'KHE-1109', staffName: 'Janet Odhiambo', leaveType: 'Annual Leave',
    startDate: '2026-07-20', endDate: '2026-07-31', daysCount: 10, status: 'APPROVED', reason: 'Visiting family in Kisumu.',
    leaveAllowanceTriggered: true, appliedOn: '2026-07-06', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', decidedOn: '2026-07-08',
    approvals: [sup('David Kiprono Rono', '2026-07-07'), hr('Rose Chepkoech', '2026-07-08')]
  },
  {
    id: 'LV-2026-082', orgId: 'org-kericho', staffId: 'KHE-0160', staffName: 'Esther Muthoni', leaveType: 'Annual Leave',
    startDate: '2026-08-03', endDate: '2026-08-14', daysCount: 10, status: 'APPROVED', reason: 'Annual family holiday.',
    leaveAllowanceTriggered: true, appliedOn: '2026-07-13', approverStaffId: 'KHE-0419', approverName: 'David Kiprono Rono', decidedOn: '2026-07-16',
    approvals: [sup('David Kiprono Rono', '2026-07-15'), hr('Rose Chepkoech', '2026-07-16')]
  },
  {
    id: 'LV-2026-083', orgId: 'org-kericho', staffId: 'KHE-0290', staffName: 'Rose Chepkoech', leaveType: 'Annual Leave',
    startDate: '2026-09-07', endDate: '2026-09-11', daysCount: 5, status: 'APPROVED', reason: 'Rest before payroll year-end work.',
    leaveAllowanceTriggered: true, appliedOn: '2026-08-20', approverStaffId: 'KHE-0134', approverName: 'David Otieno', decidedOn: '2026-08-25',
    approvals: [sup('David Otieno', '2026-08-24'), hr('Amina Hassan', '2026-08-25', 'HR step signed by the Finance Director for HR staff.')]
  },
  {
    id: 'LV-2026-084', orgId: 'org-kericho', staffId: 'KHE-0134', staffName: 'David Otieno', leaveType: 'Annual Leave',
    startDate: '2026-12-21', endDate: '2026-12-31', daysCount: 8, status: 'APPROVED', reason: 'Christmas with family in Kisumu.',
    leaveAllowanceTriggered: true, appliedOn: '2026-09-28', approverStaffId: 'KHE-0120', approverName: 'Amina Hassan', decidedOn: '2026-10-01',
    approvals: [sup('Amina Hassan', '2026-09-30'), hr('Rose Chepkoech', '2026-10-01')]
  },
  // Custom leave type set up by HR in 2026
  {
    id: 'LV-2026-085', orgId: 'org-kericho', staffId: 'KHE-0280', staffName: 'Brian Kamau', leaveType: 'Sports Leave',
    startDate: '2026-09-18', endDate: '2026-09-18', daysCount: 1, status: 'APPROVED', reason: 'Corporate games football final in Nakuru.',
    leaveAllowanceTriggered: false, appliedOn: '2026-09-10', approverStaffId: 'KHE-0178', approverName: 'Samuel Kiptoo', decidedOn: '2026-09-11',
    approvals: [sup('Samuel Kiptoo', '2026-09-11')]
  },

  /* ---------------- Other companies ---------------- */
  {
    id: 'LV-2026-039', orgId: 'org-nairobi', staffId: 'KHE-0892', staffName: 'Caroline Wangari Kamau', leaveType: 'Compassionate Leave',
    startDate: '2026-09-24', endDate: '2026-09-28', daysCount: 3, status: 'APPROVED', reason: 'Family emergency leave.',
    leaveAllowanceTriggered: false, appliedOn: '2026-09-24', approverStaffId: 'KHE-0104', approverName: 'Grace Chebet', decidedOn: '2026-09-24',
    approvals: [sup('Grace Chebet', '2026-09-24')]
  },
  {
    id: 'LV-2026-035', orgId: 'org-factory', staffId: 'KHE-1021', staffName: 'Dennis Mutwiri Njiru', leaveType: 'Sick Leave',
    startDate: '2026-09-17', endDate: '2026-09-18', daysCount: 2, status: 'APPROVED', reason: 'Medical examination and certified rest.',
    leaveAllowanceTriggered: false, appliedOn: '2026-09-17', approverStaffId: 'KPF-1121', approverName: 'Winnie Kiplagat', decidedOn: '2026-09-17',
    approvals: [sup('Winnie Kiplagat', '2026-09-17')]
  },
  // Joseph Kiprono (KHE-0102) — own leave history, approved by Grace Chebet
  {
    id: 'LV-2026-012',
    orgId: 'org-nairobi',
    staffId: 'KHE-0102',
    staffName: 'Joseph Kiprono',
    leaveType: 'Annual Leave',
    startDate: '2026-04-07',
    endDate: '2026-04-10',
    daysCount: 4,
    status: 'APPROVED',
    reason: 'Easter family holiday.',
    leaveAllowanceTriggered: true,
    appliedOn: '2026-03-20',
    approverStaffId: 'KHE-0104',
    approverName: 'Grace Chebet',
    decidedOn: '2026-03-21',
    approverComment: 'Approved — enjoy the break.',
    approvals: [sup('Grace Chebet', '2026-03-21', 'Approved — enjoy the break.'), hr('Naomi Kibet', '2026-03-21')]
  },
  {
    id: 'LV-2026-027',
    orgId: 'org-nairobi',
    staffId: 'KHE-0102',
    staffName: 'Joseph Kiprono',
    leaveType: 'Sick Leave',
    startDate: '2026-07-14',
    endDate: '2026-07-15',
    daysCount: 2,
    status: 'APPROVED',
    reason: 'Outpatient treatment — medical note attached.',
    leaveAllowanceTriggered: false,
    appliedOn: '2026-07-14',
    approverStaffId: 'KHE-0104',
    approverName: 'Grace Chebet',
    decidedOn: '2026-07-14',
    attachment: true,
    approvals: [sup('Grace Chebet', '2026-07-14')]
  },
  {
    id: 'LV-2026-033',
    orgId: 'org-nairobi',
    staffId: 'KHE-0102',
    staffName: 'Joseph Kiprono',
    leaveType: 'Annual Leave',
    startDate: '2026-08-24',
    endDate: '2026-08-28',
    daysCount: 5,
    status: 'REJECTED',
    reason: 'Personal travel.',
    leaveAllowanceTriggered: false,
    appliedOn: '2026-08-10',
    approverStaffId: 'KHE-0104',
    approverName: 'Grace Chebet',
    decidedOn: '2026-08-11',
    approverComment: 'Clashes with the payroll audit week — please pick other dates.',
    approvals: [{ step: 'SUPERVISOR', by: 'Grace Chebet', action: 'REJECTED', at: '2026-08-11', comment: 'Clashes with the payroll audit week — please pick other dates.' }]
  },
  // Team members whose leave Joseph Kiprono approves
  {
    id: 'LV-2026-044',
    orgId: 'org-nairobi',
    staffId: 'KHE-0231',
    staffName: 'Faith Wanjiru Mwangi',
    leaveType: 'Annual Leave',
    startDate: '2026-10-19',
    endDate: '2026-10-23',
    daysCount: 4,
    status: 'PENDING_APPROVAL',
    reason: 'Graduation ceremony for my sister in Eldoret.',
    leaveAllowanceTriggered: true,
    appliedOn: '2026-10-03',
    approverStaffId: 'KHE-0102',
    approverName: 'Joseph Kiprono',
    currentStep: 'SUPERVISOR'
  },
  {
    id: 'LV-2026-045',
    orgId: 'org-nairobi',
    staffId: 'KHE-0307',
    staffName: 'Brian Mutua Kioko',
    leaveType: 'Sick Leave',
    startDate: '2026-10-06',
    endDate: '2026-10-08',
    daysCount: 3,
    status: 'PENDING_APPROVAL',
    reason: 'Minor surgery and recovery — doctor’s note to follow.',
    leaveAllowanceTriggered: false,
    appliedOn: '2026-10-05',
    approverStaffId: 'KHE-0102',
    approverName: 'Joseph Kiprono',
    currentStep: 'SUPERVISOR'
  },
  {
    id: 'LV-2026-046',
    orgId: 'org-nairobi',
    staffId: 'KHE-0288',
    staffName: 'Peter Otieno Ouma',
    leaveType: 'Compassionate Leave',
    startDate: '2026-10-12',
    endDate: '2026-10-14',
    daysCount: 3,
    status: 'PENDING_APPROVAL',
    reason: 'Funeral of a close relative in Kisumu.',
    leaveAllowanceTriggered: false,
    appliedOn: '2026-10-06',
    approverStaffId: 'KHE-0102',
    approverName: 'Joseph Kiprono',
    currentStep: 'SUPERVISOR'
  },
  {
    id: 'LV-2026-030',
    orgId: 'org-nairobi',
    staffId: 'KHE-0231',
    staffName: 'Faith Wanjiru Mwangi',
    leaveType: 'Annual Leave',
    startDate: '2026-08-03',
    endDate: '2026-08-07',
    daysCount: 5,
    status: 'APPROVED',
    reason: 'Family holiday.',
    leaveAllowanceTriggered: true,
    appliedOn: '2026-07-20',
    approverStaffId: 'KHE-0102',
    approverName: 'Joseph Kiprono',
    decidedOn: '2026-07-21',
    approvals: [sup('Joseph Kiprono', '2026-07-21'), hr('Naomi Kibet', '2026-07-21')]
  }
];

export const INITIAL_PAYROLL_BATCHES: PayrollBatch[] = [
  {
    id: 'PAY-2026-09A',
    orgId: 'org-kericho',
    batchNo: 'BATCH-2026-09-KHE',
    period: 'September 2026 (Monthly Payroll)',
    branch: 'Kericho Highland Estates (Main Site)',
    pipeline: 'Monthly Payroll',
    totalGrossKes: 4850000,
    totalPayeKes: 982400,
    totalNssfKes: 172800,
    totalShifKes: 133375,
    totalAhlKes: 72750,
    totalNetDisbursementKes: 3488675,
    workerCount: 42,
    status: 'AUDIT_APPROVED',
    runDate: '2026-09-22'
  },
  {
    id: 'PAY-2026-W38B',
    orgId: 'org-kericho',
    batchNo: 'BATCH-2026-W38-KHE',
    period: 'Week 38 (15 Sep - 21 Sep 2026)',
    branch: 'Kericho Highland Estates (Sites C & D)',
    pipeline: 'Weekly Payroll',
    totalGrossKes: 1420600,
    totalPayeKes: 0,
    totalNssfKes: 85236,
    totalShifKes: 39066,
    totalAhlKes: 21309,
    totalNetDisbursementKes: 1274989,
    workerCount: 168,
    status: 'DISBURSED_MPESA',
    runDate: '2026-09-21'
  },
  {
    id: 'PAY-2026-09F',
    orgId: 'org-factory',
    batchNo: 'BATCH-2026-09-FACT',
    period: 'September 2026 (Factory Shift Staff)',
    branch: 'Kericho Processing Factory Unit 1',
    pipeline: 'Monthly Payroll',
    totalGrossKes: 2650000,
    totalPayeKes: 520000,
    totalNssfKes: 95000,
    totalShifKes: 72875,
    totalAhlKes: 39750,
    totalNetDisbursementKes: 1922375,
    workerCount: 28,
    status: 'AUDIT_APPROVED',
    runDate: '2026-09-22'
  },
  {
    id: 'PAY-2026-W38N',
    orgId: 'org-nandi',
    batchNo: 'BATCH-2026-W38-NANDI',
    period: 'Week 38 (Weekly Muster & Tallies)',
    branch: 'Nandi Hills Outgrowers Cooperative',
    pipeline: 'Weekly Payroll',
    totalGrossKes: 1180000,
    totalPayeKes: 0,
    totalNssfKes: 70800,
    totalShifKes: 32450,
    totalAhlKes: 17700,
    totalNetDisbursementKes: 1059050,
    workerCount: 142,
    status: 'DISBURSED_MPESA',
    runDate: '2026-09-21'
  }
];

export const INITIAL_CONTRACT_THRESHOLD_RECORDS: ContractThresholdRecord[] = [
  {
    id: 'SEC37-01',
    orgId: 'org-kericho',
    staffId: 'CAS-1402',
    fullName: 'Juma Mwangi Otieno',
    branch: 'Kericho Highland Estates',
    block: 'Block C Production Crew',
    continuousDaysWorked: 26,
    thresholdDays: 26,
    rollingWindowDays: 60,
    policyAction: 'HARD_BLOCK',
    contractConverted: false
  },
  {
    id: 'SEC37-02',
    orgId: 'org-kericho',
    staffId: 'CAS-1405',
    fullName: 'Faith Jepkemoi Bett',
    branch: 'Kericho Highland Estates',
    block: 'Block C Production Crew',
    continuousDaysWorked: 23,
    thresholdDays: 26,
    rollingWindowDays: 60,
    policyAction: 'ALERT_AND_HOLD',
    contractConverted: false
  },
  {
    id: 'SEC37-03',
    orgId: 'org-nandi',
    staffId: 'CAS-1418',
    fullName: 'Daniel Kipchumba Korir',
    branch: 'Nandi Hills Outgrowers',
    block: 'Block F Maintenance Crew',
    continuousDaysWorked: 20,
    thresholdDays: 26,
    rollingWindowDays: 60,
    policyAction: 'SOFT_ALERT',
    contractConverted: false
  },
  {
    id: 'SEC37-04',
    orgId: 'org-factory',
    staffId: 'CAS-1390',
    fullName: 'Beatrice Akinyi Odhiambo',
    branch: 'Kericho Factory Unit 1',
    block: 'Sorting & Grading Line',
    continuousDaysWorked: 26,
    thresholdDays: 26,
    rollingWindowDays: 60,
    policyAction: 'AUTO_CONVERTED',
    contractConverted: true
  }
];

export const INITIAL_OSH_PERMITS: OshPermit[] = [
  {
    id: 'PTW-2026-88',
    orgId: 'org-factory',
    permitNo: 'PTW-HOT-088',
    permitType: 'Hot Work (Welding)',
    location: 'Boiler House Expansion - Factory 1',
    issuedTo: 'Dennis Mutwiri Njiru',
    status: 'ACTIVE',
    safetyChecksCompleted: true,
    authorizedBy: 'Brenda Omondi (HSE Lead)',
    expiryTime: '2026-09-22 18:00'
  },
  {
    id: 'PTW-2026-89',
    orgId: 'org-factory',
    permitNo: 'PTW-CONF-089',
    permitType: 'Confined Space Entry',
    location: 'Process Tank 04 Cleaning',
    issuedTo: 'Erick Cheruiyot',
    status: 'ACTIVE',
    safetyChecksCompleted: true,
    authorizedBy: 'Brenda Omondi (HSE Lead)',
    expiryTime: '2026-09-22 16:30'
  },
  {
    id: 'PTW-2026-85',
    orgId: 'org-kericho',
    permitNo: 'PTW-CHEM-085',
    permitType: 'Chemical Handling',
    location: 'Block E (Chemical Store Treatment)',
    issuedTo: 'Specialist Chemical Team A',
    status: 'COMPLETED',
    safetyChecksCompleted: true,
    authorizedBy: 'Dr. Evans Kiprotich',
    expiryTime: '2026-09-21 17:00'
  }
];

export const INITIAL_SEPARATION_RECORDS: SeparationRecord[] = [
  {
    id: 'SEP-2026-09',
    orgId: 'org-kericho',
    staffId: 'KHE-0211',
    staffName: 'Samuel Cherop Sang',
    department: 'Transport & Logistics',
    branch: 'Kericho Highland Estates',
    separationType: 'Retirement',
    clearanceStatus: {
      stores: true,
      it: true,
      finance: true,
      hr: true
    },
    gratuityAmountKes: 685000,
    leaveEncashmentKes: 42000,
    exitDate: '2026-09-30',
    p9Generated: true
  },
  {
    id: 'SEP-2026-10',
    orgId: 'org-factory',
    staffId: 'KHE-0914',
    staffName: 'Gladys Muthoni Mwangi',
    department: 'Quality Laboratory',
    branch: 'Kericho Factory Unit 1',
    separationType: 'Resignation',
    clearanceStatus: {
      stores: true,
      it: true,
      finance: false,
      hr: true
    },
    gratuityAmountKes: 145000,
    leaveEncashmentKes: 24500,
    exitDate: '2026-10-15',
    p9Generated: false
  }
];
