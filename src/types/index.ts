export type Severity = 'CRITICAL' | 'WARNING' | 'APPROVAL' | 'AI_INSIGHT' | 'INFO';

export type WorkQueueCategory = 'All' | 'Critical' | 'Security' | 'Operations' | 'Approvals' | 'Finance' | 'AI Recommendations';

export type WorkItemStatus = 'OPEN' | 'IN_TRIAGE' | 'SNOOZED' | 'RESOLVED' | 'ESCALATED';

export interface WorkItemAudit {
  time: string;
  actor: string;
  action: string;
  note?: string;
}

export interface WorkItem {
  id: string;
  severity: Severity;
  category: 'Security' | 'Operations' | 'Approvals' | 'Finance' | 'AI Recommendations';
  title: string;
  description: string;
  resource: string;
  resourceType: 'Integration' | 'User' | 'Workflow' | 'Access Request' | 'API Key' | 'Policy' | 'Billing';
  resourceId: string;
  detectedTime: string;
  owner: string;
  status: WorkItemStatus;
  recommendedAction: {
    label: string;
    actionKey: string;
    danger?: boolean;
  };
  details: {
    reason: string;
    impact: string;
    evidence: string[];
    confidence?: number;
    auditTrail: WorkItemAudit[];
  };
}

export interface UserSession {
  id: string;
  ip: string;
  location: string;
  device: string;
  userAgent: string;
  lastActive: string;
  isCurrent: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  organizationId: string;
  organizationName: string;
  role: 'Super Admin' | 'Organization Admin' | 'Security Officer' | 'DevOps Lead' | 'Compliance Auditor' | 'Analyst';
  status: 'Active' | 'Suspended' | 'Pending Invite';
  mfa: 'Enforced (FIDO2)' | 'Enforced (TOTP)' | 'Not Configured' | 'Exempted';
  lastLogin: string;
  createdDate: string;
  department: string;
  directPermissionsCount: number;
  inheritedPermissionsCount: number;
  sessions: UserSession[];
  recentEventsCount: number;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  tier: 'Enterprise Dedicated' | 'Enterprise Plus' | 'Standard Enterprise';
  domain: string;
  usersCount: number;
  ssoStatus: 'Healthy' | 'Degraded' | 'Configuring';
  complianceStatus: 'SOC2 Type II Compliant' | 'ISO 27001 Pending' | 'HIPAA Ready';
  mfaEnforced: boolean;
  region: 'us-east-1' | 'eu-west-1' | 'ap-southeast-1';
  monthlySpend: number;
  createdAt: string;
  activeIncidents: number;
}

export interface AuditEvent {
  id: string;
  requestId: string;
  timestamp: string;
  actor: {
    name: string;
    email: string;
    role: string;
    ip: string;
    location: string;
  };
  action: string;
  resource: string;
  resourceType: string;
  category: 'Security' | 'User' | 'Policy' | 'Workflow' | 'Billing' | 'API' | 'Access' | 'Operations';
  severity: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
  authContext: string;
  beforeState: Record<string, any> | null;
  afterState: Record<string, any> | null;
}

export interface SystemHealthItem {
  id: string;
  name: string;
  category: 'Core Service' | 'Data Pipeline' | 'Edge & Network' | 'Security Mesh';
  status: 'operational' | 'degraded' | 'outage';
  latencyP95: number;
  latencyP99: number;
  errorRate: number;
  uptime30d: number;
  nodes: number;
  errorBudgetRemaining: number;
  region: string;
}

export interface Integration {
  id: string;
  name: string;
  type: 'IAM' | 'Cloud Provider' | 'Observability' | 'Communications' | 'SIEM' | 'CRM';
  status: 'CONNECTED' | 'DEGRADED' | 'ERROR' | 'SYNCING';
  lastSync: string;
  errorCount24h: number;
  throughput: string;
  syncInterval: string;
  apiVersion: string;
  endpoint: string;
}

export interface WorkflowStep {
  name: string;
  status: 'success' | 'failed' | 'running' | 'skipped' | 'queued';
  duration: string;
  logSnippet?: string;
}

export interface Workflow {
  id: string;
  name: string;
  trigger: 'Schedule (Cron)' | 'Webhook' | 'User Action' | 'Security Event';
  status: 'SUCCESS' | 'FAILED' | 'RUNNING' | 'QUEUED';
  duration: string;
  lastRun: string;
  environment: 'Production' | 'Staging';
  steps: WorkflowStep[];
  errorDetails?: {
    step: string;
    message: string;
    retryCount: number;
  };
}

export interface AIInsight {
  id: string;
  title: string;
  anomalyType: string;
  confidence: number;
  baselineComparison: string;
  potentialCause: string;
  evidence: string[];
  affectedSystems: string[];
  recommendedAction: {
    label: string;
    actionType: string;
    description: string;
  };
  detectedTime: string;
  dismissed?: boolean;
}

export interface RoleMatrixRow {
  domain: string;
  description: string;
  read: boolean;
  write: boolean;
  delete: boolean;
  admin: boolean;
}

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  assignedUsersCount: number;
  isSystem: boolean;
  permissions: RoleMatrixRow[];
}

export interface Invoice {
  id: string;
  number: string;
  organizationName: string;
  amount: number;
  status: 'PAID' | 'DUE' | 'OVERDUE' | 'PROCESSING';
  issueDate: string;
  dueDate: string;
  paymentMethod: string;
  itemizedCount: number;
}

// ==========================================
// Integrated Workforce HR & Employee Payroll Types
// ==========================================

export type HRProcessCategory = 
  | 'Talent Acquisition' 
  | 'Core HR & Time' 
  | 'Payroll & Statutory' 
  | 'Talent Growth' 
  | 'Governance & Safety';

export interface HRProcessApp {
  id: string;
  stepNumber: number;
  name: string;
  category: HRProcessCategory;
  shortDesc: string;
  fullDesc: string;
  iconName: string;
  badgeText: string;
  badgeVariant: 'primary' | 'success' | 'warning' | 'critical' | 'info';
  route: string;
  metrics: {
    label: string;
    value: string | number;
  };
}

export type RoundingStep = 0 | 1 | 5 | 10 | 50 | 100;
export type RoundingDirection = 'NEAREST' | 'UP' | 'DOWN';

export interface OrgSettings {
  status: 'ACTIVE' | 'INACTIVE';
  // Identity
  legalName: string;
  displayName: string;
  logoUrl?: string;
  brandColor: string;
  industry: string;
  // Registration & statutory
  kraPin: string;
  businessRegNo: string;
  nssfEmployerNo: string;
  shifEmployerNo: string;
  housingLevyNo: string;
  nitaNo: string;
  // Contact
  physicalAddress: string;
  postalAddress: string;
  phone: string;
  email: string;
  website: string;
  // Periods
  periodType: 'CALENDAR' | 'FINANCIAL';
  fyStartMonth: number; // 1–12, used when periodType is FINANCIAL
  activeYear: number; // year in which the active period starts
  payDay: number; // day of month salaries are paid
  cutOffDay: number; // payroll input cut-off day
  // Overtime
  overtime: {
    enabled: boolean;
    weekdayRate: number;
    restDayRate: number;
    holidayRate: number;
    basis: 'BASIC' | 'GROSS';
    standardMonthlyHours: number;
    maxHoursPerMonth: number;
    minimumBlockMinutes: number;
    requiresApproval: boolean;
  };
  // Employment rules
  probation: { defaultMonths: number; maxMonths: number; allowExtension: boolean; noticeDays: number; reminderDays: number };
  retirement: { normalAge: number; earlyAge: number; pwdAge: number; reminderMonths: number };
  leave: { annualDays: number; carryOverMax: number; sickFullPayDays: number; sickHalfPayDays: number; maternityDays: number; paternityDays: number; compassionateDays: number };
  // Rounding
  rounding: { netPayStep: RoundingStep; netPayDirection: RoundingDirection; carryForward: boolean; taxRounding: 'NEAREST' | 'DOWN'; showDecimals: boolean };
}

export interface TenantOrganization {
  id: string;
  name: string;
  code: string;
  entityType: string;
  location: string;
  employeeCount: number;
  activePayrollBatchKes: number;
  complianceRating: string;
  settings?: OrgSettings;
}

export type DrawerActionType =
  | 'requisition'
  | 'applicant'
  | 'onboarding'
  | 'employee'
  | 'punch'
  | 'attendance'
  | 'leave'
  | 'payroll'
  | 'contract-threshold'
  | 'permit'
  | 'separation';

export interface DrawerActionItem {
  type: DrawerActionType;
  data: any;
}

export interface JobDescription {
  reportsTo: string;
  workLocation: string;
  vacancyReason: 'New Position' | 'Replacement' | 'Expansion' | 'Seasonal Demand';
  replacingEmployee: string;
  jobPurpose: string;
  responsibilities: string[];
  educationLevel: string;
  minExperienceYears: number;
  skills: string[];
  certifications: string;
  workingHours: string;
  travelRequired: boolean;
}

export interface RequisitionLine {
  id: string;
  title: string;
  gradeScale: string;
  headcount: number;
  monthlySalaryKes: number;
  neededBy: string;
  jobDescription?: JobDescription;
}

export interface EmployeeRequisition {
  id: string;
  orgId: string;
  requisitionNo: string;
  title: string;
  department: string;
  branch: string;
  headcountRequired: number;
  currentHeadcount: number;
  maxHeadcountBudget: number;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'IN_RECRUITMENT' | 'FILLED' | 'REJECTED' | 'CANCELLED';
  requester: string;
  requestedDate: string;
  gradeScale: string;
  estimatedBudgetKes: number;
  justification: string;
  priority?: 'Normal' | 'High' | 'Urgent';
  lines?: RequisitionLine[];
  /* Approval workflow and the vacancy it opens (Hire module) */
  requesterStaffId?: string;
  vacancyReason?: 'New position' | 'Replacement' | 'Expansion' | 'Seasonal';
  replacingStaffId?: string;
  currentStep?: import('../data/hireConfig').ReqStep;
  approvals?: import('../data/hireConfig').ReqDecision[];
  vacancyId?: string;
  submittedDate?: string;
  decidedDate?: string;
}

export interface JobApplicant {
  id: string;
  orgId: string;
  candidateName: string;
  email: string;
  phone: string;
  appliedRole: string;
  // The last four are older names kept for existing screens
  stage: import('../data/hireConfig').PipelineStage | 'Screening' | 'Aptitude Test' | 'Panel Interview' | 'Offer Issued';
  scorecardScore: number; // out of 100
  appliedDate: string;
  isInternOrAttachee: boolean;
  institution?: string;
  experienceYears: number;
  /* Recruitment pipeline detail (Hire module) */
  vacancyId?: string;
  source?: string;
  gender?: 'Female' | 'Male' | 'Other';
  location?: string;
  education?: string;
  internalStaffId?: string;
  answers?: Record<string, boolean>;
  interviews?: import('../data/hireConfig').Interview[];
  checks?: import('../data/hireConfig').BackgroundCheck[];
  offer?: import('../data/hireConfig').Offer;
  comms?: import('../data/hireConfig').CommEntry[];
  stageLog?: { stage: string; at: string; by: string; note?: string }[];
  outcomeReason?: string;
}

export interface OnboardingRecord {
  id: string;
  orgId: string;
  employeeName: string;
  role: string;
  branch: string;
  kycStatus: 'VERIFIED' | 'PENDING_DOCS' | 'REJECTED';
  kraPinVerified: boolean;
  nssfVerified: boolean;
  shifVerified: boolean;
  kitIssued: boolean;
  contractSigned: boolean;
  probationEndDate: string;
  progressPercent: number;
  /* Checklist, induction and the employee it creates (Hire module) */
  applicantId?: string;
  vacancyId?: string;
  staffId?: string;
  department?: string;
  startDate?: string;
  status?: 'PRE_BOARDING' | 'FIRST_90_DAYS' | 'COMPLETED' | 'CANCELLED';
  tasks?: import('../data/hireConfig').OnboardingTask[];
  sessions?: import('../data/hireConfig').InductionSession[];
  terms?: import('../data/hireConfig').HireTerms;
  createdOn?: string;
  activatedOn?: string;
  completedOn?: string;
}

/** Contract types are defined by each company and assigned when an employee is created. */
export interface ContractTypeDefinition {
  id: string;
  name: string;
  payBasis: 'MONTHLY_SALARY' | 'DAILY_RATE' | 'OUTPUT_RATE';
  payFrequency: 'MONTHLY' | 'WEEKLY';
  hasEndDate: boolean;
  /** Days worked within the rolling window after which the contract must be reviewed. */
  serviceThresholdDays?: number;
}

export type PayFrequencyRun = 'Monthly Payroll' | 'Weekly Payroll';

/* ------------------------------------------------------------------ */
/* Organisation structure (company-maintained lookup lists)            */
/* ------------------------------------------------------------------ */

export interface Branch {
  id: string;
  name: string;
  location?: string;
}

export interface Station {
  id: string;
  name: string;
  branchId: string;
}

export interface Department {
  id: string;
  name: string;
  costCenter: string;
}

export interface Section {
  id: string;
  name: string;
  departmentId: string;
}

export interface Designation {
  id: string;
  title: string;
  grade?: string;
  departmentId?: string;
  jobDescription?: JobDescription;
}

export interface OrgStructure {
  branches: Branch[];
  stations: Station[];
  departments: Department[];
  sections: Section[];
  designations: Designation[];
}

/* ------------------------------------------------------------------ */
/* Custom employee fields defined by the company                       */
/* ------------------------------------------------------------------ */

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea';
export type EmployeeFieldGroup = 'personal' | 'placement' | 'contract' | 'payment' | 'additional';
export type CustomFieldValue = string | number | boolean;

export interface CustomFieldDefinition {
  id: string;
  label: string;
  type: CustomFieldType;
  group: EmployeeFieldGroup;
  required: boolean;
  options?: string[];
  helpText?: string;
}

export interface EmployeeAllowance {
  label: string;
  amount: number;
}

export interface HREmployee {
  id: string;
  orgId: string;
  staffId: string;
  fullName: string;
  email: string;
  phone: string;
  nationalIdMasked: string;
  kraPinMasked: string;
  nssfNoMasked: string;
  shifNoMasked: string;
  bankAccountMasked: string;
  mpesaPhoneMasked: string;
  contractType: string; // name of a company-defined ContractTypeDefinition
  department: string;
  branch: string;
  block?: string;
  jobTitle: string;
  basicSalaryKes: number;
  pieceRatePerUnitKes?: number;
  joinedDate: string;
  status: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED';

  /* Captured by the Add Employee wizard (optional on older records) */
  firstName?: string;
  middleName?: string;
  lastName?: string;
  gender?: 'Female' | 'Male' | 'Other';
  dateOfBirth?: string;
  maritalStatus?: string;
  personalEmail?: string;
  address?: string;
  nextOfKin?: { name: string; relationship: string; phone: string };
  branchId?: string;
  stationId?: string;
  departmentId?: string;
  sectionId?: string;
  designationId?: string;
  costCenter?: string;
  reportsToStaffId?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  probationMonths?: number;
  noticeDays?: number;
  workSchedule?: string;
  payRateKes?: number;
  allowances?: EmployeeAllowance[];
  paymentMethod?: 'BANK' | 'MPESA';
  bankName?: string;
  bankBranch?: string;
  statutory?: { paye: boolean; nssf: boolean; shif: boolean; ahl: boolean };
  customFields?: Record<string, CustomFieldValue>;
  retirementAge?: number;
  /** Basic salary changes (promotion, increment, regrading). Payroll uses the entry in force for each month. */
  salaryHistory?: { effectiveFrom: string; basic: number; previous: number; reason: string; ref?: string; by?: string }[];
  /** Last working day once a separation is agreed; payroll stops after this month. */
  exitDate?: string;
  retirementDate?: string;
  tax?: {
    employment: 'PRIMARY' | 'SECONDARY';
    pwdExempt: boolean;
    pwdCertificateNo?: string;
    pwdCertificateExpiry?: string;
    pwdExemptAmount?: number;
    taxExempt: boolean;
    taxExemptReason?: string;
  };
  leavePolicy?: { annualDays: number; accrual: 'UPFRONT' | 'MONTHLY'; eligibleAfterProbation: boolean };
  /** Hire module: job grade, probation outcome, documents on file and job history events. */
  grade?: string;
  probationEndDate?: string;
  probationStatus?: 'ON_PROBATION' | 'EXTENDED' | 'CONFIRMED';
  documents?: { name: string; kind: string; addedOn: string; ref?: string }[];
  history?: { date: string; kind: string; summary: string; ref?: string; by?: string }[];
  /** Department moves ('YYYY-MM'); payroll reads the department in force for each month */
  departmentHistory?: { effectiveFrom: string; department: string; previous: string; ref?: string }[];
  /** Edit details (Employee Master): emergency contact and desk phone extension. */
  emergencyContact?: { name: string; relationship: string; phone: string };
  phoneExtension?: string;
}

export interface BiometricPunch {
  id: string;
  orgId: string;
  staffId: string;
  staffName: string;
  branch: string;
  block: string;
  deviceId: string;
  timestamp: string;
  type: 'CLOCK_IN' | 'CLOCK_OUT' | 'OUTPUT_TALLY';
  source: 'BIOMETRIC_ADMS' | 'GPS_GEOFENCE' | 'OUTPUT_COUNTER';
  geofenceStatus: 'VALID_POLYGON' | 'OUT_OF_BOUNDS' | 'SPOOF_DETECTED';
  pieceRateUnits?: number;
}

export interface LeaveRequest {
  id: string;
  orgId: string;
  staffId: string;
  staffName: string;
  leaveType:
    | 'Annual Leave'
    | 'Sick Leave'
    | 'Maternity Leave'
    | 'Compassionate Leave'
    | 'Paternity Leave'
    | 'Study Leave'
    | 'Holiday Off'
    | 'Unpaid Leave'
    // Custom types created by HR (name comes from the leave configuration)
    | (string & {});
  startDate: string;
  endDate: string;
  daysCount: number;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reason: string;
  leaveAllowanceTriggered: boolean;
  appliedOn?: string;
  approverStaffId?: string;
  approverName?: string;
  decidedOn?: string;
  approverComment?: string;
  /** Single half day (start = end). */
  halfDay?: boolean;
  /** Approval step a pending request is waiting on. */
  currentStep?: 'SUPERVISOR' | 'HR';
  approvals?: LeaveApproval[];
  attachment?: boolean;
  backdated?: boolean;
  submittedBy?: 'EMPLOYEE' | 'SUPERVISOR' | 'HR';
  /** Status the request had when it was cancelled (approved → days credited back). */
  cancelledFrom?: 'PENDING_APPROVAL' | 'APPROVED';
}

export interface LeaveApproval {
  step: 'SUPERVISOR' | 'HR';
  by: string;
  action: 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'RECALLED';
  comment?: string;
  at: string;
}

export interface PayrollBatch {
  id: string;
  orgId: string;
  batchNo: string;
  period: string;
  branch: string;
  pipeline: PayFrequencyRun;
  totalGrossKes: number;
  totalPayeKes: number;
  totalNssfKes: number;
  totalShifKes: number;
  totalAhlKes: number;
  totalNetDisbursementKes: number;
  workerCount: number;
  status: 'DRAFT' | 'CALCULATED' | 'AUDIT_APPROVED' | 'DISBURSED_MPESA' | 'POSTED_GL';
  runDate: string;
}

export interface ContractThresholdRecord {
  id: string;
  orgId: string;
  staffId: string;
  fullName: string;
  branch: string;
  block: string;
  continuousDaysWorked: number;
  thresholdDays: number; // 26 days
  rollingWindowDays: number; // 60 days
  policyAction: 'NORMAL' | 'SOFT_ALERT' | 'ALERT_AND_HOLD' | 'HARD_BLOCK' | 'AUTO_CONVERTED';
  contractConverted: boolean;
}

export interface OshPermit {
  id: string;
  orgId: string;
  permitNo: string;
  permitType: 'Hot Work (Welding)' | 'Confined Space Entry' | 'Chemical Handling' | 'High-Voltage Electrical';
  location: string;
  issuedTo: string;
  status: 'ACTIVE' | 'EXPIRED' | 'COMPLETED';
  safetyChecksCompleted: boolean;
  authorizedBy: string;
  expiryTime: string;
}

export interface SeparationRecord {
  id: string;
  orgId: string;
  staffId: string;
  staffName: string;
  department: string;
  branch: string;
  separationType: 'Resignation' | 'Retirement' | 'Contract Expiry' | 'Disciplinary Termination';
  clearanceStatus: {
    stores: boolean;
    it: boolean;
    finance: boolean;
    hr: boolean;
  };
  gratuityAmountKes: number;
  leaveEncashmentKes: number;
  exitDate: string;
  p9Generated: boolean;
}
