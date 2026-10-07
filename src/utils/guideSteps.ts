// ========================================================
// Guided AI Intelligence: Step-by-Step Popups & Hover Guide
// ========================================================

export interface GuideStepData {
  stepNumber: number;
  id: string;
  name: string;
  category: string;
  badge: string;
  tagline: string;
  aiExplanation: string;
  whyStartHere?: string;
  keyOutputs: string[];
  recommendedAction: string;
  actionRoute: string;
}

export const HR_GUIDE_STEPS: Record<number, GuideStepData> = {
  1: {
    stepNumber: 1,
    id: 'employee-requisition',
    name: 'Employee Requisition',
    category: 'Talent Acquisition',
    badge: 'START HERE',
    tagline: 'Manpower Planning & Headcount Quota Authorization',
    whyStartHere:
      'Every hiring journey begins here! Before recruiting, departments must establish approved vacancy quotas against corporate establishment budgets.',
    aiExplanation:
      'Creates formal job requisitions, checks budget thresholds against branch departments, and routes approvals through multi-tier authorization workflows.',
    keyOutputs: [
      'Approved Job Vacancy Form with Band Code',
      'Establishment Quota validation (prevents unbudgeted hires)',
      'Direct pipeline link to Step 02 (Recruitment)'
    ],
    recommendedAction: 'Open Requisition Console',
    actionRoute: 'employee-requisition'
  },
  2: {
    stepNumber: 2,
    id: 'recruitment',
    name: 'Recruitment & Candidate Pipeline',
    category: 'Talent Acquisition',
    badge: 'Stage 02',
    tagline: 'Candidate Scoring, Aptitude Tests & Panel Rubrics',
    aiExplanation:
      'Tracks candidate applications from sourcing to job offer. Features aptitude test scoring, weighted panel interview rubrics, and automated status notifications.',
    keyOutputs: [
      'Shortlisted talent pool ranked by competency score',
      'Multi-interviewer calibrated rating matrix',
      'Offer letter authorization'
    ],
    recommendedAction: 'View Recruitment Funnel',
    actionRoute: 'recruitment'
  },
  3: {
    stepNumber: 3,
    id: 'onboarding',
    name: 'Pre-Employment & Induction',
    category: 'Talent Acquisition',
    badge: 'Stage 03',
    tagline: 'Statutory KYC, Medical Clearance & Safety Kit Allocation',
    aiExplanation:
      'Interactive day-one onboarding checklist. Verifies KRA PIN, NSSF, and SHIF credentials, logs food handler laboratory results, and issues biometric access badges.',
    keyOutputs: [
      '100% verified statutory dossier (KRA/NSSF/SHIF)',
      'Signed company policies and NDA repository',
      'Personal Protective Equipment (PPE) issue slip'
    ],
    recommendedAction: 'Review Induction Queue',
    actionRoute: 'onboarding'
  },
  4: {
    stepNumber: 4,
    id: 'employees',
    name: 'Employee Master & Org',
    category: 'Core HR & Time',
    badge: 'Stage 04',
    tagline: 'Encrypted PII Repository & Multi-Tier Visual Hierarchy',
    aiExplanation:
      'The single source of truth for all staff across every company-defined contract type. Features field-level encryption, contract history, and interactive organization charts.',
    keyOutputs: [
      'Centralized biometric employee profiles',
      'Dynamic branch & factory reporting hierarchy',
      'Emergency contacts and statutory dependency data'
    ],
    recommendedAction: 'Browse Employee Registry',
    actionRoute: 'employees'
  },
  5: {
    stepNumber: 5,
    id: 'attendance',
    name: 'Biometric Attendance & Muster',
    category: 'Core HR & Time',
    badge: 'Stage 05',
    tagline: 'ADMS IoT Gates, GPS Geofencing & Output Tallies',
    aiExplanation:
      'Ingests real-time biometric turnstile punches, GPS polygon mobile check-ins for mobile staff, and production output tallies for employees on output-based pay.',
    keyOutputs: [
      'Live daily muster & branch attendance percentages',
      'Automated shift overtime calculations',
      'Output units produced'
    ],
    recommendedAction: 'Inspect Live Muster',
    actionRoute: 'attendance'
  },
  6: {
    stepNumber: 6,
    id: 'leave',
    name: 'Leave & Absence Management',
    category: 'Core HR & Time',
    badge: 'Stage 06',
    tagline: 'Accrual Engines, Supervisor Approvals & Leave Allowances',
    aiExplanation:
      'Manages statutory annual, sick, compassionate, and maternity leaves. Automatically deducts balances, prevents overlap during peak season, and computes leave allowances.',
    keyOutputs: [
      'Automated leave accrual ledgers',
      'Multi-level line-manager approval trail',
      'Statutory leave grant sync with monthly payroll'
    ],
    recommendedAction: 'Manage Leave Requests',
    actionRoute: 'leave'
  },
  7: {
    stepNumber: 7,
    id: 'payroll',
    name: 'Employee Payroll',
    category: 'Payroll & Statutory',
    badge: 'Stage 07',
    tagline: 'Weekly M-Pesa B2C & Monthly Bank EFT Runs',
    aiExplanation:
      'Enterprise payroll: runs weekly payroll mobile payments via M-Pesa B2C alongside monthly payroll bank EFT runs, by contract pay frequency, compliant with 2026 KRA, NSSF, SHIF, and housing levy.',
    keyOutputs: [
      'Bank-ready ACH text files & M-Pesa B2C batch logs',
      'KRA PAYE, NSSF Tier I/II, SHIF 2.75%, AHL 1.5% schedules',
      'Digital itemized payslips with QR code verification'
    ],
    recommendedAction: 'Launch Payroll Engine',
    actionRoute: 'payroll'
  },
  8: {
    stepNumber: 8,
    id: 'performance',
    name: 'Performance & OKR',
    category: 'Talent Growth',
    badge: 'Stage 08',
    tagline: 'Balanced Scorecards, OKRs & 9-Box Succession Matrix',
    aiExplanation:
      'Drives continuous performance appraisals. Maps individual productivity output and administrative KPIs into balanced scorecards and the 9-box succession grid.',
    keyOutputs: [
      'Calibrated performance appraisal scores',
      '9-box talent matrix for high-potential leaders',
      'Automated merit bonus multiplier calculations'
    ],
    recommendedAction: 'Open Performance Console',
    actionRoute: 'performance'
  },
  9: {
    stepNumber: 9,
    id: 'training',
    name: 'Learning & Skills Matrix',
    category: 'Talent Growth',
    badge: 'Stage 09',
    tagline: 'Statutory Certifications, Boiler Licenses & Skills Heatmap',
    aiExplanation:
      'Monitors corporate training and compliance credentials. Alerts on expiring DOSHS boiler licenses, food handler laboratory renewals, and chemical handling permits.',
    keyOutputs: [
      'Enterprise skills gap matrix',
      'Mandatory certification expiration alert logs',
      'Training budget allocation and feedback analytics'
    ],
    recommendedAction: 'View Skills Matrix',
    actionRoute: 'training'
  },
  10: {
    stepNumber: 10,
    id: 'disciplinary',
    name: 'Contract Compliance & Disciplinary',
    category: 'Governance & Safety',
    badge: 'Stage 10',
    tagline: 'Service Threshold Monitor & Show-Cause Hearing Files',
    aiExplanation:
      'Compliance engine tracking each employee against the service threshold defined by their contract type. Flags contract type changes before legal liability occurs.',
    keyOutputs: [
      'Real-time rolling service threshold monitor',
      'One-click contract conversion generator',
      'Hearing notices and committee findings'
    ],
    recommendedAction: 'Review Service Threshold Monitor',
    actionRoute: 'disciplinary'
  },
  11: {
    stepNumber: 11,
    id: 'osh-security',
    name: 'OSH & Gate Security',
    category: 'Governance & Safety',
    badge: 'Stage 11',
    tagline: 'Permits to Work, DOSHS Form 1 & NFC Security Patrols',
    aiExplanation:
      'Digitizes factory safety permits (Hot Work, Confined Space), automates DOSHS incident filing, and logs NFC security perimeter patrol sweeps.',
    keyOutputs: [
      'Digital signed Permits to Work (PTW)',
      'Statutory DOSHS Form 1 accident incident log',
      'Guard checkpoint patrol inspection timestamps'
    ],
    recommendedAction: 'Open Safety Dashboard',
    actionRoute: 'osh-security'
  },
  12: {
    stepNumber: 12,
    id: 'separation',
    name: 'Separation & Terminal Benefits',
    category: 'Governance & Safety',
    badge: 'Stage 12',
    tagline: 'Exit Clearance Matrix, Gratuity & Certificate of Service',
    aiExplanation:
      'Manages formal employee offboarding, department clearance checklists (tools, store, IT), gratuity and notice pay computations, and Certificate of Service issuance.',
    keyOutputs: [
      'Completed inter-department clearance sign-off',
      'Final settlement computation voucher',
      'Formal verifiable Certificate of Service'
    ],
    recommendedAction: 'Open Separation Desk',
    actionRoute: 'separation'
  }
};
