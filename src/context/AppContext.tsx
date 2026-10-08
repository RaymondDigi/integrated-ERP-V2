import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  WorkItem,
  User,
  Organization,
  AuditEvent,
  SystemHealthItem,
  Integration,
  Workflow,
  AIInsight,
  RoleDefinition,
  Invoice,
  EmployeeRequisition,
  JobApplicant,
  OnboardingRecord,
  HREmployee,
  BiometricPunch,
  LeaveRequest,
  PayrollBatch,
  ContractThresholdRecord,
  OshPermit,
  SeparationRecord,
  TenantOrganization,
  DrawerActionItem,
  DrawerActionType,
  OrgStructure,
  Branch,
  Station,
  Department,
  Section,
  Designation,
  CustomFieldDefinition,
  OrgSettings
} from '../types';
import { settingsFor } from '../data/orgSettings';
import { INITIAL_ORG_STRUCTURE, INITIAL_CUSTOM_FIELDS } from '../data/orgData';
import {
  INITIAL_WORK_ITEMS,
  INITIAL_USERS,
  INITIAL_ORGANIZATIONS,
  INITIAL_AUDIT_EVENTS,
  INITIAL_SYSTEM_HEALTH,
  INITIAL_INTEGRATIONS,
  INITIAL_WORKFLOWS,
  INITIAL_AI_INSIGHTS,
  INITIAL_ROLES,
  INITIAL_INVOICES
} from '../data/mockData';
import {
  TENANT_ORGANIZATIONS,
  INITIAL_REQUISITIONS,
  INITIAL_CANDIDATES,
  INITIAL_ONBOARDING,
  INITIAL_ATTENDANCE_PUNCHES,
  INITIAL_LEAVE_REQUESTS,
  INITIAL_CONTRACT_THRESHOLD_RECORDS,
  INITIAL_SEPARATION_RECORDS,
  CONTRACT_TYPES
} from '../data/hrMockData';
import { WORKFORCE } from '../data/workforce';
import { useLeaveState, type LeaveStateSlice } from './leaveState';
import { useHireState, type HireStateSlice } from './hireState';
import { useTimeState, type TimeStateSlice } from './timeState';
import { usePerfState, type PerfStateSlice } from './perfState';
import { useTrainingState, type TrainingStateSlice } from './trainingState';
import { useSepState, type SepStateSlice } from './sepState';
import { useEssState, type EssStateSlice } from './essState';
import { useOshState, type OshStateSlice } from './oshState';
import { usePeopleState, type PeopleStateSlice } from './peopleState';
import { useWelfareState, type WelfareStateSlice } from './welfareState';
import { useTravelState, type TravelStateSlice } from './travelState';
import { useRegistersState, type RegistersStateSlice } from './registersState';
import { useSecurityState, type SecurityStateSlice } from './securityState';
import type { PeopleDeps } from './sliceDeps';
import { buildPayrollBatches, latestPaidMonth, makeContext, type ExitType, type PayReduction, type PayrollHold, monthRun, MONTHS, openPeriod, SEED_CONTEXT, terminalDues, type PayrollContext } from '../data/payrollEngine';
import { loanInstallment, SEED_LOANS, SEED_PAY_ITEMS, type PayItem, type StaffLoan } from '../data/payItems';
import { componentAt, currentComponents, PAY_COMPONENTS, setComponentRegistry, type PayComponentType } from '../data/payComponents';

export type NavigationTarget =
  | 'apps'
  | 'finance'
  | 'trading'
  | 'procurement'
  | 'bizdev'
  | 'warehousing'
  | 'production'
  | 'shipping'
  | 'fleet'
  | 'maintenance'
  | 'quality'
  | 'ict'
  | 'integrations-hub'
  | 'governance'
  | 'implementation'
  | 'approvals'
  | 'executive'
  | 'ess'
  | 'org-setup'
  | 'employee-requisition'
  | 'recruitment'
  | 'onboarding'
  | 'employees'
  | 'attendance'
  | 'leave'
  | 'payroll'
  | 'performance'
  | 'training'
  | 'disciplinary'
  | 'osh-security'
  | 'welfare'
  | 'travel'
  | 'separation'
  | 'overview'
  | 'work-queue'
  | 'activity'
  | 'users'
  | 'organizations'
  | 'workflows'
  | 'integrations'
  | 'roles'
  | 'security'
  | 'billing'
  | 'audit'
  | 'health'
  | 'ai-insights'
  | 'settings'
  | 'forms-inputs'
  | 'profile';

export interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  timestamp: string;
}

export interface PayrollPeriodLogEntry {
  period: string;
  action: 'CLOSED' | 'REOPENED';
  by: string;
  on: string;
  note?: string;
  /** Ledger journal of the period when it was reopened (needs reversing or adjusting) */
  glRef?: string;
}

interface AppContextType
  extends LeaveStateSlice,
    TimeStateSlice,
    HireStateSlice,
    SepStateSlice,
    TrainingStateSlice,
    OshStateSlice,
    PerfStateSlice,
    EssStateSlice,
    PeopleStateSlice,
    WelfareStateSlice,
    TravelStateSlice,
    RegistersStateSlice,
    SecurityStateSlice {
  currentView: NavigationTarget;
  setCurrentView: (view: NavigationTarget) => void;
  selectedOrgId: string;
  setSelectedOrgId: (orgId: string) => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  isAiDrawerOpen: boolean;
  setIsAiDrawerOpen: (open: boolean) => void;
  isLauncherOpen: boolean;
  /** Selected section inside an HR module (driven by the module sidebar), keyed by view */
  moduleTabs: Record<string, string>;
  setModuleTab: (view: string, tab: string) => void;
  setIsLauncherOpen: (open: boolean) => void;

  // Selected Resources for Drawers
  selectedUser: User | null;
  setSelectedUser: (user: User | null) => void;
  selectedOrg: Organization | null;
  setSelectedOrg: (org: Organization | null) => void;
  selectedWorkItem: WorkItem | null;
  setSelectedWorkItem: (item: WorkItem | null) => void;
  selectedAuditEvent: AuditEvent | null;
  setSelectedAuditEvent: (event: AuditEvent | null) => void;

  // Data states
  workItems: WorkItem[];
  users: User[];
  organizations: Organization[];
  auditEvents: AuditEvent[];
  systemHealth: SystemHealthItem[];
  integrations: Integration[];
  workflows: Workflow[];
  aiInsights: AIInsight[];
  roles: RoleDefinition[];
  invoices: Invoice[];
  toasts: ToastMessage[];

  // Operational Actions
  acknowledgeWorkItem: (id: string) => void;
  snoozeWorkItem: (id: string, hours: number) => void;
  resolveWorkItem: (id: string, note?: string) => void;
  escalateWorkItem: (id: string) => void;
  executeWorkItemAction: (id: string) => void;
  dismissAiInsight: (id: string) => void;
  applyAiMitigation: (id: string) => void;

  // User Actions
  suspendUser: (userId: string) => void;
  activateUser: (userId: string) => void;
  resetUserMfa: (userId: string) => void;
  revokeSession: (userId: string, sessionId: string) => void;
  revokeAllSessions: (userId: string) => void;
  changeUserRole: (userId: string, newRole: User['role']) => void;

  // Workflow / Integration Actions
  retryWorkflow: (workflowId: string) => void;
  reconnectIntegration: (integrationId: string) => void;

  // Notifications
  addToast: (toast: Omit<ToastMessage, 'id' | 'timestamp'>) => void;
  removeToast: (id: string) => void;

  // Organisation structure & custom employee fields (company-maintained)
  orgStructure: OrgStructure;
  addBranch: (b: Omit<Branch, 'id'>) => Branch;
  addStation: (s: Omit<Station, 'id'>) => Station;
  addDepartment: (d: Omit<Department, 'id'>) => Department;
  addSection: (s: Omit<Section, 'id'>) => Section;
  addDesignation: (d: Omit<Designation, 'id'>) => Designation;
  updateDesignation: (id: string, patch: Partial<Designation>) => void;
  customFields: CustomFieldDefinition[];
  addCustomField: (f: Omit<CustomFieldDefinition, 'id'>) => CustomFieldDefinition;
  removeCustomField: (id: string) => void;
  addHrEmployee: (emp: Omit<HREmployee, 'id' | 'orgId'>) => HREmployee;
  /** Change an employee record (by staff ID). Use salaryHistory for pay changes so paid months are not rewritten. */
  updateHrEmployee: (staffId: string, patch: Partial<HREmployee>) => void;
  /** Days whose pay is withheld (absence without leave, suspension on half pay) — read by payroll */
  payReductions: PayReduction[];
  addPayReduction: (r: Omit<PayReduction, 'id'>) => PayReduction;
  removePayReduction: (id: string) => void;

  // HR & Employee Payroll Data States
  requisitions: EmployeeRequisition[];
  candidates: JobApplicant[];
  onboardingRecords: OnboardingRecord[];
  hrEmployees: HREmployee[];
  attendancePunches: BiometricPunch[];
  leaveRequests: LeaveRequest[];
  payrollBatches: PayrollBatch[];
  /** Payroll inputs: posted items and staff loans, and the engine context built from them */
  payItems: PayItem[];
  staffLoans: StaffLoan[];
  /** Pay item catalogue (every version) and its setup actions */
  payComponents: PayComponentType[];
  savePayComponent: (c: PayComponentType, mode: 'create' | 'edit', effectiveFrom: string) => string | null;
  setPayComponentStatus: (id: string, status: 'ACTIVE' | 'INACTIVE') => void;
  deletePayComponent: (id: string) => void;
  payrollCtx: PayrollContext;
  /** Period open for posting and periods already closed by posting payroll to the ledger */
  payrollOpenPeriod: { year: number; month: number; key: string; label: string };
  closedPayrollPeriods: string[];
  /** Earlier period reopened for correction (only one at a time) */
  reopenedPayrollPeriod: string | null;
  /** Who closed or reopened which payroll period, when and why */
  payrollPeriodLog: PayrollPeriodLogEntry[];
  /** Closes the open period once the company's monthly payroll is posted to the ledger; posting then moves to the next month */
  closePayrollPeriod: (by: string, note?: string) => boolean;
  /** Reopens the most recently closed period for correction; its batch goes back to Calculated */
  reopenLastPayrollPeriod: (by: string, reason: string) => boolean;
  postPayItems: (items: Omit<PayItem, 'id' | 'orgId' | 'postedBy' | 'postedOn' | 'status'>[], by?: string) => number;
  cancelPayItem: (id: string, reason: string) => void;
  /** Worksheet edit: sets the one-off amount for an employee and pay item in the active period (0 removes it) */
  setWorksheetItem: (staffId: string, componentId: string, amount: number) => void;
  endRecurringPayItem: (id: string, endPeriod: string) => void;
  addStaffLoan: (loan: Omit<StaffLoan, 'id' | 'orgId' | 'status' | 'installment'> & { installment?: number }) => StaffLoan | null;
  setLoanStatus: (id: string, status: StaffLoan['status']) => void;
  setPayrollBatchStatus: (id: string, status: PayrollBatch['status'], glRef?: string) => void;
  payrollGlRefs: Record<string, string>;
  /** Call after adding or changing a statutory rate version */
  noteRatesChanged: () => void;
  ratesStamp: number;
  /** Employees left off a period's payroll (pay held) */
  payrollHolds: PayrollHold[];
  holdPayroll: (staffId: string, reason: string) => void;
  releasePayroll: (staffId: string) => void;
  contractThresholdRecords: ContractThresholdRecord[];
  oshPermits: OshPermit[];
  separationRecords: SeparationRecord[];

  // Multi-Tenancy
  tenantOrganizations: TenantOrganization[];
  activeTenantSettings: OrgSettings;
  addTenantOrganization: (org: Omit<TenantOrganization, 'id'>) => TenantOrganization;
  updateTenantOrganization: (id: string, patch: Partial<TenantOrganization>) => void;
  activeTenant: TenantOrganization;

  // Right-Side Slide-Over Action Drawer (AWS / Atlassian pattern)
  activeDrawerItem: DrawerActionItem | null;
  openRightDrawer: (type: DrawerActionType, data: any) => void;
  closeRightDrawer: () => void;

  // Filtered Tenant Data (Strict Multi-Tenancy Scoping)
  tenantEmployees: HREmployee[];
  tenantRequisitions: EmployeeRequisition[];
  tenantCandidates: JobApplicant[];
  tenantOnboarding: OnboardingRecord[];
  tenantAttendance: BiometricPunch[];
  tenantLeave: LeaveRequest[];
  tenantPayrollBatches: PayrollBatch[];
  tenantContractThresholds: ContractThresholdRecord[];
  tenantOshPermits: OshPermit[];
  tenantSeparations: SeparationRecord[];

  // HR & Employee Payroll Actions
  approveRequisition: (id: string) => void;
  createRequisition: (req: Omit<EmployeeRequisition, 'id' | 'orgId' | 'requisitionNo' | 'requestedDate' | 'status'>) => void;
  updateCandidateStage: (candidateId: string, stage: JobApplicant['stage']) => void;
  toggleOnboardingItem: (id: string, field: 'kraPinVerified' | 'nssfVerified' | 'shifVerified' | 'kitIssued' | 'contractSigned') => void;
  addAttendancePunch: (punch: Omit<BiometricPunch, 'id' | 'orgId' | 'timestamp'>) => void;
  runPayrollBatch: (branch: string, pipeline: PayrollBatch['pipeline']) => void;
  convertContractType: (workerId: string) => void;
  closeOshPermit: (id: string) => void;
  signoffClearanceDept: (id: string, dept: 'stores' | 'it' | 'finance' | 'hr') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentView, setCurrentView] = useState<NavigationTarget>('apps');
  const [selectedOrgId, setSelectedOrgId] = useState<string>('org-kericho');
  const [activeDrawerItem, setActiveDrawerItem] = useState<DrawerActionItem | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  // The module launcher greets every fresh load
  const [isLauncherOpen, setIsLauncherOpen] = useState<boolean>(true);
  const [moduleTabs, setModuleTabs] = useState<Record<string, string>>({});
  const setModuleTab = (view: string, tab: string) => setModuleTabs((m) => ({ ...m, [view]: tab }));

  // Selected Resources
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [selectedWorkItem, setSelectedWorkItem] = useState<WorkItem | null>(null);
  const [selectedAuditEvent, setSelectedAuditEvent] = useState<AuditEvent | null>(null);

  // Entities Data
  const [workItems, setWorkItems] = useState<WorkItem[]>(INITIAL_WORK_ITEMS);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [organizations] = useState<Organization[]>(INITIAL_ORGANIZATIONS);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(INITIAL_AUDIT_EVENTS);
  const [systemHealth, setSystemHealth] = useState<SystemHealthItem[]>(INITIAL_SYSTEM_HEALTH);
  const [integrations, setIntegrations] = useState<Integration[]>(INITIAL_INTEGRATIONS);
  const [workflows, setWorkflows] = useState<Workflow[]>(INITIAL_WORKFLOWS);
  const [aiInsights, setAiInsights] = useState<AIInsight[]>(INITIAL_AI_INSIGHTS);
  const [roles] = useState<RoleDefinition[]>(INITIAL_ROLES);
  const [invoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // HR & Employee Payroll State
  const [requisitions, setRequisitions] = useState<EmployeeRequisition[]>(INITIAL_REQUISITIONS);
  const [candidates, setCandidates] = useState<JobApplicant[]>(INITIAL_CANDIDATES);
  const [onboardingRecords, setOnboardingRecords] = useState<OnboardingRecord[]>(INITIAL_ONBOARDING);
  // One workforce for the whole group — payroll, Finance and the portal all read from it
  const [hrEmployees, setHrEmployees] = useState<HREmployee[]>(WORKFORCE);
  const [orgStructure, setOrgStructure] = useState<OrgStructure>(INITIAL_ORG_STRUCTURE);
  const [tenantOrganizations, setTenantOrganizations] = useState<TenantOrganization[]>(() =>
    TENANT_ORGANIZATIONS.map((t, i) => {
      // Headcount and payroll come from the real employee records, not fixed numbers
      const staff = WORKFORCE.filter((e) => e.orgId === t.id && e.status !== 'TERMINATED');
      const paid = latestPaidMonth();
      const run = monthRun(WORKFORCE, t.id, paid.getFullYear(), paid.getMonth()).total;
      return { ...t, employeeCount: staff.length, activePayrollBatchKes: run.net, settings: settingsFor(t, i) };
    })
  );

  const addTenantOrganization = (org: Omit<TenantOrganization, 'id'>) => {
    const created: TenantOrganization = { ...org, id: `org-${Date.now().toString(36)}` };
    setTenantOrganizations((xs) => [...xs, created]);
    return created;
  };
  const updateTenantOrganization = (id: string, patch: Partial<TenantOrganization>) =>
    setTenantOrganizations((xs) => xs.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>(INITIAL_CUSTOM_FIELDS);

  const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const addOrgItem = <K extends keyof OrgStructure>(key: K, prefix: string, item: Omit<OrgStructure[K][number], 'id'>) => {
    const created = { ...item, id: newId(prefix) } as OrgStructure[K][number];
    setOrgStructure((o) => ({ ...o, [key]: [...o[key], created] }));
    return created;
  };
  const addBranch = (b: Omit<Branch, 'id'>) => addOrgItem('branches', 'br', b) as Branch;
  const addStation = (st: Omit<Station, 'id'>) => addOrgItem('stations', 'st', st) as Station;
  const addDepartment = (d: Omit<Department, 'id'>) => addOrgItem('departments', 'dp', d) as Department;
  const addSection = (sc: Omit<Section, 'id'>) => addOrgItem('sections', 'sc', sc) as Section;
  const addDesignation = (d: Omit<Designation, 'id'>) => addOrgItem('designations', 'ds', d) as Designation;
  const updateDesignation = (id: string, patch: Partial<Designation>) =>
    setOrgStructure((o) => ({ ...o, designations: o.designations.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));

  const addCustomField = (f: Omit<CustomFieldDefinition, 'id'>) => {
    const created: CustomFieldDefinition = { ...f, id: newId('cf') };
    setCustomFields((xs) => [...xs, created]);
    return created;
  };
  const removeCustomField = (id: string) => setCustomFields((xs) => xs.filter((f) => f.id !== id));

  const addHrEmployee = (emp: Omit<HREmployee, 'id' | 'orgId'>) => {
    const created: HREmployee = { ...emp, id: newId('EMP'), orgId: selectedOrgId };
    setHrEmployees((prev) => [created, ...prev]);
    addToast({
      type: 'success',
      title: 'Employee created',
      message: `${created.fullName} (${created.staffId}) was added to the employee master.`
    });
    return created;
  };
  const updateHrEmployee = (staffId: string, patch: Partial<HREmployee>) =>
    setHrEmployees((prev) => prev.map((e) => (e.staffId === staffId ? { ...e, ...patch } : e)));
  const [payReductions, setPayReductions] = useState<PayReduction[]>([]);
  const addPayReduction = (r: Omit<PayReduction, 'id'>) => {
    const created: PayReduction = { ...r, id: `PRD-${Date.now().toString(36)}` };
    setPayReductions((prev) => [...prev, created]);
    return created;
  };
  const removePayReduction = (id: string) => setPayReductions((prev) => prev.filter((r) => r.id !== id));
  const [attendancePunches, setAttendancePunches] = useState<BiometricPunch[]>(INITIAL_ATTENDANCE_PUNCHES);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(INITIAL_LEAVE_REQUESTS);
  // Payroll inputs. Batches are recalculated from them, so posting an item changes this month's run at once.
  const [payItems, setPayItems] = useState<PayItem[]>(SEED_PAY_ITEMS);
  const [staffLoans, setStaffLoans] = useState<StaffLoan[]>(SEED_LOANS);
  const [payComponents, setPayComponentsState] = useState<PayComponentType[]>(PAY_COMPONENTS);
  const setPayComponents = (next: PayComponentType[]) => {
    // Lookups outside React read the same catalogue
    setComponentRegistry(next);
    setPayComponentsState(next);
  };
  // How each leaver left (set by Separation when final dues are approved)
  const [exitTypes, setExitTypes] = useState<Record<string, ExitType>>(SEED_CONTEXT.exitType);
  // Bumped when a statutory rate version is added or changed, so open-period payslips recalculate
  const [ratesStamp, setRatesStamp] = useState(0);
  const [payrollHolds, setPayrollHolds] = useState<PayrollHold[]>([]);
  const noteRatesChanged = () => setRatesStamp((n) => n + 1);
  const payrollCtx = useMemo(
    () =>
      payItems === SEED_PAY_ITEMS && staffLoans === SEED_LOANS && leaveRequests === INITIAL_LEAVE_REQUESTS && payComponents === PAY_COMPONENTS && !payReductions.length && exitTypes === SEED_CONTEXT.exitType && !ratesStamp && !payrollHolds.length
        ? SEED_CONTEXT
        : makeContext({ items: payItems, loans: staffLoans, leaveRequests, components: payComponents, payReductions, exitType: exitTypes, holds: payrollHolds }),
    [payItems, staffLoans, leaveRequests, payComponents, payReductions, exitTypes, ratesStamp, payrollHolds]
  );
  const [extraBatches, setExtraBatches] = useState<PayrollBatch[]>([]);
  const [batchStatus, setBatchStatus] = useState<Record<string, PayrollBatch['status']>>({});
  const [payrollGlRefs, setPayrollGlRefs] = useState<Record<string, string>>({});
  const [closedPayrollPeriods, setClosedPayrollPeriods] = useState<string[]>([]);
  const [reopenedPayrollPeriod, setReopenedPayrollPeriod] = useState<string | null>(null);
  const [payrollPeriodLog, setPayrollPeriodLog] = useState<PayrollPeriodLogEntry[]>([]);
  const payrollBatches = useMemo(
    () =>
      [...extraBatches, ...buildPayrollBatches(hrEmployees, new Date(), payrollCtx)].map((b) =>
        batchStatus[b.id] ? { ...b, status: batchStatus[b.id], period: b.period.replace(' (in preparation)', '') } : b
      ),
    [extraBatches, hrEmployees, payrollCtx, batchStatus]
  );
  const payrollOpenPeriod = useMemo(() => {
    const of = (d: Date) => ({ year: d.getFullYear(), month: d.getMonth(), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` });
    // A reopened earlier period takes over as the open one until it is closed again
    if (reopenedPayrollPeriod) return of(new Date(Number(reopenedPayrollPeriod.slice(0, 4)), Number(reopenedPayrollPeriod.slice(5, 7)) - 1, 1));
    let p = openPeriod();
    // Closing a period moves posting on to the next month
    while (closedPayrollPeriods.includes(p.key)) p = of(new Date(p.year, p.month + 1, 1));
    return p;
  }, [closedPayrollPeriods, reopenedPayrollPeriod]);
  const [contractThresholdRecords, setContractThresholdRecords] = useState<ContractThresholdRecord[]>(INITIAL_CONTRACT_THRESHOLD_RECORDS);
  // Terminal dues come from the leaver's record in the employee master
  const [separationRecords, setSeparationRecords] = useState<SeparationRecord[]>(() =>
    INITIAL_SEPARATION_RECORDS.map((r) => {
      const e = WORKFORCE.find((w) => w.staffId === r.staffId);
      if (!e) return r;
      const dues = terminalDues({ ...e, exitDate: r.exitDate });
      return { ...r, staffName: e.fullName, department: e.department, branch: e.branch, gratuityAmountKes: dues.gratuity + dues.severance, leaveEncashmentKes: dues.leavePay };
    })
  );

  // Apply theme class to document body
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Global Keyboard Shortcuts (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
        setIsAiDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const addToast = (toast: Omit<ToastMessage, 'id' | 'timestamp'>) => {
    const newToast: ToastMessage = {
      ...toast,
      id: 'toast_' + Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString()
    };
    setToasts((prev) => [newToast, ...prev]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== newToast.id));
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((prev) => !prev);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const handleSetCurrentView = (view: NavigationTarget) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
  };

  // Work Queue Actions
  const acknowledgeWorkItem = (id: string) => {
    setWorkItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'IN_TRIAGE',
              details: {
                ...item.details,
                auditTrail: [
                  { time: 'Just now', actor: 'Admin (You)', action: 'Acknowledged item and moved to In Triage' },
                  ...item.details.auditTrail
                ]
              }
            }
          : item
      )
    );
    addToast({
      type: 'info',
      title: 'Work Item Acknowledged',
      message: `Item ${id} set to IN_TRIAGE. Assigned to your active session.`
    });
  };

  const snoozeWorkItem = (id: string, hours: number) => {
    setWorkItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'SNOOZED',
              details: {
                ...item.details,
                auditTrail: [
                  { time: 'Just now', actor: 'Admin (You)', action: `Snoozed for ${hours} hour(s)` },
                  ...item.details.auditTrail
                ]
              }
            }
          : item
      )
    );
    addToast({
      type: 'warning',
      title: 'Item Snoozed',
      message: `Item ${id} snoozed for ${hours} hour(s). Will reappear if condition persists.`
    });
  };

  const resolveWorkItem = (id: string, note?: string) => {
    setWorkItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'RESOLVED',
              details: {
                ...item.details,
                auditTrail: [
                  { time: 'Just now', actor: 'Admin (You)', action: `Resolved: ${note || 'Remediation completed'}` },
                  ...item.details.auditTrail
                ]
              }
            }
          : item
      )
    );

    // Generate Audit Log entry
    const resolvedItem = workItems.find((w) => w.id === id);
    if (resolvedItem) {
      const newAudit: AuditEvent = {
        id: 'aud_' + Math.floor(1000 + Math.random() * 9000),
        requestId: 'req_' + Math.random().toString(36).substr(2, 8),
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
        actor: {
          name: 'Sarah Kim',
          email: 'sarah.kim@missioncontrol.io',
          role: 'Super Admin',
          ip: '198.51.100.42',
          location: 'New York, US'
        },
        action: 'WORK_ITEM_RESOLVED',
        resource: `${resolvedItem.resourceType}: ${resolvedItem.resource}`,
        resourceType: resolvedItem.resourceType,
        category: 'Operations',
        severity: resolvedItem.severity === 'CRITICAL' ? 'high' : 'medium',
        reason: note || `Administrative resolution of ${resolvedItem.title}`,
        authContext: 'Operational Work Queue Action',
        beforeState: { status: resolvedItem.status, itemId: resolvedItem.id },
        afterState: { status: 'RESOLVED', resolvedBy: 'Sarah Kim', note: note || 'Completed' }
      };
      setAuditEvents((prev) => [newAudit, ...prev]);
    }

    addToast({
      type: 'success',
      title: 'Work Item Resolved',
      message: `Item ${id} successfully resolved and committed to audit log.`
    });
  };

  const escalateWorkItem = (id: string) => {
    setWorkItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'ESCALATED',
              owner: 'Executive Incident Commander (P0)',
              details: {
                ...item.details,
                auditTrail: [
                  { time: 'Just now', actor: 'Admin (You)', action: 'Escalated to P0 Incident Commander & PagerDuty page triggered' },
                  ...item.details.auditTrail
                ]
              }
            }
          : item
      )
    );
    addToast({
      type: 'error',
      title: 'Incident Escalated',
      message: `Item ${id} escalated to Executive Incident Commander. Emergency bridge initiated.`
    });
  };

  const executeWorkItemAction = (id: string) => {
    const item = workItems.find((w) => w.id === id);
    if (!item) return;

    if (item.id === 'WI-8942') {
      // Okta SCIM remediation
      setIntegrations((prev) =>
        prev.map((int) => (int.id === 'int_okta' ? { ...int, status: 'CONNECTED', lastSync: 'Just now (Recovered)' } : int))
      );
      setSystemHealth((prev) =>
        prev.map((srv) => (srv.id === 'srv_scim' ? { ...srv, status: 'operational', errorRate: 0.005 } : srv))
      );
      resolveWorkItem(id, 'Rotated SCIM broker bearer token & re-established TLS handshake.');
    } else if (item.id === 'WI-8941') {
      // Force MFA
      setUsers((prev) =>
        prev.map((u) =>
          u.mfa === 'Not Configured' ? { ...u, mfa: 'Enforced (FIDO2)' } : u
        )
      );
      resolveWorkItem(id, 'Enforced immediate FIDO2 hardware token registration on all privileged Super Admin accounts.');
    } else if (item.id === 'WI-8940') {
      // Replay workflows
      setWorkflows((prev) =>
        prev.map((wf) =>
          wf.id === 'wf_01'
            ? {
                ...wf,
                status: 'RUNNING',
                duration: '0m 45s (Replaying)',
                steps: wf.steps.map((s) => ({ ...s, status: s.status === 'failed' ? 'running' : s.status }))
              }
            : wf
        )
      );
      resolveWorkItem(id, 'Triggered partitioned re-ingestion with extended 1800s Snowflake warehouse quota.');
    } else if (item.id === 'WI-8939') {
      // JIT Approvals
      resolveWorkItem(id, 'Approved 4-hour JIT Super-Admin access for CHG-8812 kernel patch with auto-expiry.');
    } else if (item.id === 'WI-8938') {
      // AI Rate Limit
      resolveWorkItem(id, 'Applied dynamic 1,000 req/min rate limit token filter to Datadog scraper.');
    } else {
      resolveWorkItem(id, `Automated remediation action '${item.recommendedAction.label}' dispatched successfully.`);
    }
  };

  const dismissAiInsight = (id: string) => {
    setAiInsights((prev) =>
      prev.map((item) => (item.id === id ? { ...item, dismissed: true } : item))
    );
    addToast({
      type: 'info',
      title: 'Insight Dismissed',
      message: 'AI recommendation dismissed from operational radar.'
    });
  };

  const applyAiMitigation = (id: string) => {
    const insight = aiInsights.find((ai) => ai.id === id);
    if (!insight) return;

    // Create Audit Log
    const newAudit: AuditEvent = {
      id: 'aud_' + Math.floor(1000 + Math.random() * 9000),
      requestId: 'req_ai_' + Math.random().toString(36).substr(2, 7),
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC',
      actor: {
        name: 'Sarah Kim (Authorized AI Copilot)',
        email: 'sarah.kim@missioncontrol.io',
        role: 'Super Admin',
        ip: '198.51.100.42',
        location: 'New York, US'
      },
      action: 'AI_AUTOMATED_REMEDIATION_EXECUTED',
      resource: insight.affectedSystems.join(', '),
      resourceType: 'AI Remediation Plan',
      category: 'Security',
      severity: 'medium',
      reason: `Executed AI remediation: ${insight.recommendedAction.label} (Confidence: ${insight.confidence}%)`,
      authContext: 'Enterprise AI Autonomous Action Authorization Model',
      beforeState: { anomaly: insight.anomalyType, baseline: insight.baselineComparison },
      afterState: { action: insight.recommendedAction.actionType, status: 'APPLIED' }
    };
    setAuditEvents((prev) => [newAudit, ...prev]);

    setAiInsights((prev) =>
      prev.map((ai) => (ai.id === id ? { ...ai, dismissed: true } : ai))
    );

    addToast({
      type: 'success',
      title: 'AI Remediation Deployed',
      message: `${insight.recommendedAction.label} successfully applied and logged to audit ledger.`
    });
  };

  // User Actions
  const suspendUser = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status: 'Suspended', sessions: [] } : u))
    );
    if (selectedUser?.id === userId) {
      setSelectedUser((prev) => (prev ? { ...prev, status: 'Suspended', sessions: [] } : null));
    }
    addToast({
      type: 'warning',
      title: 'User Suspended',
      message: `User ${userId} suspended. All active authentication tokens and sessions terminated.`
    });
  };

  const activateUser = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status: 'Active' } : u))
    );
    if (selectedUser?.id === userId) {
      setSelectedUser((prev) => (prev ? { ...prev, status: 'Active' } : null));
    }
    addToast({
      type: 'success',
      title: 'User Activated',
      message: `User ${userId} has been restored to Active operational status.`
    });
  };

  const resetUserMfa = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, mfa: 'Not Configured' } : u))
    );
    if (selectedUser?.id === userId) {
      setSelectedUser((prev) => (prev ? { ...prev, mfa: 'Not Configured' } : null));
    }
    addToast({
      type: 'warning',
      title: 'MFA Revoked & Reset',
      message: `Multi-factor credentials reset for ${userId}. User will be required to re-enroll on next authentication.`
    });
  };

  const revokeSession = (userId: string, sessionId: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, sessions: u.sessions.filter((s) => s.id !== sessionId) } : u
      )
    );
    if (selectedUser?.id === userId) {
      setSelectedUser((prev) =>
        prev ? { ...prev, sessions: prev.sessions.filter((s) => s.id !== sessionId) } : null
      );
    }
    addToast({
      type: 'info',
      title: 'Session Revoked',
      message: `Session token ${sessionId} revoked immediately.`
    });
  };

  const revokeAllSessions = (userId: string) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, sessions: [] } : u))
    );
    if (selectedUser?.id === userId) {
      setSelectedUser((prev) => (prev ? { ...prev, sessions: [] } : null));
    }
    addToast({
      type: 'warning',
      title: 'All Sessions Terminated',
      message: `Terminated all active session tokens for user ${userId}.`
    });
  };

  const changeUserRole = (userId: string, newRole: User['role']) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
    );
    if (selectedUser?.id === userId) {
      setSelectedUser((prev) => (prev ? { ...prev, role: newRole } : null));
    }
    addToast({
      type: 'success',
      title: 'Role Reassigned',
      message: `User ${userId} permissions updated to ${newRole}.`
    });
  };

  const retryWorkflow = (workflowId: string) => {
    setWorkflows((prev) =>
      prev.map((wf) =>
        wf.id === workflowId
          ? {
              ...wf,
              status: 'RUNNING',
              duration: '0m 10s',
              steps: wf.steps.map((s) => ({ ...s, status: s.status === 'failed' ? 'running' : s.status }))
            }
          : wf
      )
    );
    addToast({
      type: 'info',
      title: 'Workflow Execution Dispatched',
      message: `Workflow ${workflowId} queued for execution on runner pool.`
    });
  };

  const reconnectIntegration = (integrationId: string) => {
    setIntegrations((prev) =>
      prev.map((i) =>
        i.id === integrationId
          ? { ...i, status: 'CONNECTED', lastSync: 'Just now (Healthy)', errorCount24h: 0 }
          : i
      )
    );
    addToast({
      type: 'success',
      title: 'Integration Re-authenticated',
      message: `Integration ${integrationId} connection verified and operational.`
    });
  };

  // HR & Employee Payroll Handlers
  const approveRequisition = (id: string) => {
    setRequisitions((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'APPROVED' } : r))
    );
    addToast({
      type: 'success',
      title: 'Requisition Approved',
      message: `Headcount requisition ${id} approved and routed to Talent Acquisition.`
    });
  };

  const createRequisition = (req: Omit<EmployeeRequisition, 'id' | 'orgId' | 'requisitionNo' | 'requestedDate' | 'status'>) => {
    const newReq: EmployeeRequisition = {
      ...req,
      id: `REQ-2026-${Math.floor(100 + Math.random() * 900)}`,
      orgId: selectedOrgId,
      requisitionNo: `REQ-2026-${Math.floor(100 + Math.random() * 900)}`,
      requestedDate: new Date().toISOString().split('T')[0],
      status: 'PENDING_APPROVAL'
    };
    setRequisitions((prev) => [newReq, ...prev]);
    addToast({
      type: 'success',
      title: 'Requisition Created',
      message: `Requisition ${newReq.requisitionNo} logged with establishment control verification.`
    });
  };

  const updateCandidateStage = (candidateId: string, stage: JobApplicant['stage']) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, stage } : c))
    );
    addToast({
      type: 'info',
      title: 'Candidate Pipeline Updated',
      message: `Applicant transitioned to "${stage}" stage.`
    });
  };

  const toggleOnboardingItem = (id: string, field: 'kraPinVerified' | 'nssfVerified' | 'shifVerified' | 'kitIssued' | 'contractSigned') => {
    setOnboardingRecords((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: !item[field] };
          const checks = [updated.kraPinVerified, updated.nssfVerified, updated.shifVerified, updated.kitIssued, updated.contractSigned];
          const completedCount = checks.filter(Boolean).length;
          updated.progressPercent = Math.round((completedCount / 5) * 100);
          if (updated.progressPercent === 100) {
            updated.kycStatus = 'VERIFIED';
          }
          return updated;
        }
        return item;
      })
    );
    addToast({
      type: 'success',
      title: 'Onboarding Checklist Updated',
      message: `Verification milestone marked for employee.`
    });
  };

  const addAttendancePunch = (punch: Omit<BiometricPunch, 'id' | 'orgId' | 'timestamp'>) => {
    const newPunch: BiometricPunch = {
      ...punch,
      id: `PUNCH-${Math.floor(1000 + Math.random() * 9000)}`,
      orgId: selectedOrgId,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };
    setAttendancePunches((prev) => [newPunch, ...prev]);
    addToast({
      type: 'success',
      title: 'Time Punch Registered',
      message: `${punch.type} recorded via ${punch.source}. Geofence status: ${punch.geofenceStatus}.`
    });
  };

  const decisionDate = () => new Date().toISOString().slice(0, 10);

  // Leave: workflow, validation and configuration live in the leave state hook
  const leave = useLeaveState({ hrEmployees, leaveRequests, setLeaveRequests, addToast, selectedOrgId });
  const { approveLeaveRequest, rejectLeaveRequest, cancelLeaveRequest, createLeaveRequest } = leave;
  const hire = useHireState({ requisitions, setRequisitions, candidates, setCandidates, onboardingRecords, setOnboardingRecords, hrEmployees, addHrEmployee, updateHrEmployee, addToast, selectedOrgId, payrollOpenPeriod, tenantOrganizations });

  const runPayrollBatch = (branch: string, pipeline: PayrollBatch['pipeline']) => {
    // Calculated from the company's current employees with the same engine as payslips
    const today = new Date();
    const run = monthRun(hrEmployees, selectedOrgId, today.getFullYear(), today.getMonth(), payrollCtx);
    const part = pipeline === 'Monthly Payroll' ? run.salaried : run.casual;
    const weekly = pipeline !== 'Monthly Payroll';
    // A weekly run covers about a quarter of the month's days
    const f = weekly ? 0.25 : 1;
    const newBatch: PayrollBatch = {
      id: `PAY-${today.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      orgId: selectedOrgId,
      batchNo: `BATCH-${Date.now().toString().slice(-6)}`,
      period: weekly ? 'Current week' : `${MONTHS[today.getMonth()]} ${today.getFullYear()}`,
      branch,
      pipeline,
      totalGrossKes: Math.round(part.gross * f),
      totalPayeKes: Math.round(part.paye * f),
      totalNssfKes: Math.round(part.nssf * f),
      totalShifKes: Math.round(part.shif * f),
      totalAhlKes: Math.round(part.ahl * f),
      totalNetDisbursementKes: Math.round(part.net * f),
      workerCount: part.workers,
      status: 'AUDIT_APPROVED',
      runDate: today.toISOString().split('T')[0]
    };
    setExtraBatches((prev) => [newBatch, ...prev]);
    addToast({
      type: 'success',
      title: 'Payroll Batch Executed',
      message: `${pipeline} for ${branch} calculated with 2026 statutory schedules (PAYE, NSSF, SHIF, AHL).`
    });
  };

  const payrollActor = 'Rose Chepkoech';
  const postPayItems: AppContextType['postPayItems'] = (items, by = payrollActor) => {
    const closed = items.find((i) => i.period < payrollOpenPeriod.key);
    if (closed) {
      addToast({ type: 'error', title: 'Period closed', message: `${closed.period} has been paid. Post to ${payrollOpenPeriod.label} or later.` });
      return 0;
    }
    if (items.some((i) => !(i.amount > 0))) {
      addToast({ type: 'error', title: 'Amount needed', message: 'Every item needs an amount above zero.' });
      return 0;
    }
    const stamp = decisionDate();
    setPayItems((prev) => {
      let n = prev.length + 1000;
      const created: PayItem[] = items.map((i) => ({ ...i, id: `PI-${++n}`, orgId: selectedOrgId, postedBy: by, postedOn: stamp, status: 'ACTIVE' }));
      return [...prev, ...created];
    });
    addToast({ type: 'success', title: items.length === 1 ? 'Item posted' : `${items.length} items posted`, message: `Included in the ${items[0]?.period ?? ''} payroll — batch totals updated.` });
    return items.length;
  };
  const time = useTimeState({ hrEmployees, leaveRequests, leaveHolidays: leave.leaveHolidays, attendancePunches, payrollOpenPeriod, addPayReduction, removePayReduction, postPayItems, updateHrEmployee, addToast });
  const perf = usePerfState({ hrEmployees, selectedOrgId, payrollOpenPeriod, payrollCtx, postPayItems, updateHrEmployee, raiseCase: time.raiseCase, addToast });
  const training = useTrainingState({ hrEmployees, leaveRequests, addToast });
  const sep = useSepState({
    hrEmployees,
    selectedOrgId,
    payrollOpenPeriod,
    postPayItems,
    updateHrEmployee,
    setExitTypes,
    addToast,
    // Training bonds still owed on exit are recovered from final dues
    bondRecovery: (staffId, exitDate) => {
      const r = training.bondRecoveryFor(staffId, exitDate);
      return r.owed > 0 ? { amount: r.owed, ref: r.lines.map((l) => `${l.bondId} (${l.course})`).join(', ') } : undefined;
    },
    onBondRecovered: (staffId, exitDate) => training.bondRecoveryFor(staffId, exitDate).lines.forEach((l) => training.setBondStatus(l.bondId, 'Recovered'))
  });
  const osh = useOshState({ hrEmployees, selectedOrgId, payrollCtx, timeDays: time.timeDays, timeDecisions: time.timeDecisions, confirmAbsences: time.confirmAbsences, addToast });
  const savePayComponent: AppContextType['savePayComponent'] = (c, mode, effectiveFrom) => {
    const current = currentComponents(payComponents);
    const code = c.id.trim().toUpperCase();
    const name = c.name.trim();
    const fail = (message: string) => {
      addToast({ type: 'error', title: 'Pay item not saved', message });
      return message;
    };
    if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(code)) return fail('Code: 2–20 capital letters, digits or _ starting with a letter.');
    if (!name) return fail('Give the pay item a name.');
    if (mode === 'create' && current.some((x) => x.id === code)) return fail(`Code ${code} is already used by “${componentAt(code, undefined, payComponents).name}”.`);
    const clash = current.find((x) => x.id !== code && x.name.trim().toLowerCase() === name.toLowerCase());
    if (clash) return fail(`“${clash.name}” already exists (${clash.id}). Pay item names must be unique.`);
    if (effectiveFrom < payrollOpenPeriod.key) return fail(`Changes start from ${payrollOpenPeriod.label} or later — paid periods keep their rules.`);
    const versions = payComponents.filter((x) => x.id === code);
    const version = mode === 'create' ? 1 : Math.max(...versions.map((x) => x.version ?? 1)) + 1;
    const next: PayComponentType = {
      ...c,
      id: code,
      name,
      isCash: c.category !== 'benefit_in_kind' && c.id !== 'MORTGAGE_INTEREST',
      version,
      effectiveFrom,
      status: c.status ?? 'ACTIVE',
      custom: mode === 'create' ? true : c.custom,
      changedBy: payrollActor,
      changedOn: decisionDate()
    };
    // A second edit for the same period replaces that period's version
    setPayComponents([...payComponents.filter((x) => !(x.id === code && x.effectiveFrom === effectiveFrom && mode === 'edit')), next]);
    addToast({
      type: 'success',
      title: mode === 'create' ? 'Pay item created' : 'Pay item updated',
      message: mode === 'create' ? `${name} (${code}) can be posted from ${effectiveFrom}.` : `${name} version ${version} applies from ${effectiveFrom}; earlier payslips are unchanged.`
    });
    return null;
  };
  const setPayComponentStatus = (id: string, status: 'ACTIVE' | 'INACTIVE') => {
    const cur = componentAt(id, undefined, payComponents);
    const key = payrollOpenPeriod.key;
    const version = Math.max(...payComponents.filter((x) => x.id === id).map((x) => x.version ?? 1)) + 1;
    setPayComponents([...payComponents.filter((x) => !(x.id === id && x.effectiveFrom === key && (x.version ?? 1) > 1)), { ...cur, status, version, effectiveFrom: key, changedBy: payrollActor, changedOn: decisionDate() }]);
    addToast({ type: 'info', title: status === 'ACTIVE' ? 'Pay item active' : 'Pay item deactivated', message: `${cur.name} ${status === 'ACTIVE' ? 'can be posted again' : 'can no longer be posted'} from ${payrollOpenPeriod.label}. Items already posted still pay.` });
  };
  const deletePayComponent = (id: string) => {
    const cur = componentAt(id, undefined, payComponents);
    if (!cur.custom || payItems.some((i) => i.componentId === id)) {
      addToast({ type: 'error', title: 'Cannot delete', message: `${cur.name} is ${cur.custom ? 'used by posted items' : 'part of the standard catalogue'} — deactivate it instead.` });
      return;
    }
    setPayComponents(payComponents.filter((x) => x.id !== id));
    addToast({ type: 'info', title: 'Pay item deleted', message: `${cur.name} (${id}) removed.` });
  };
  const setWorksheetItem = (staffId: string, componentId: string, amount: number) => {
    const key = payrollOpenPeriod.key;
    const mine = payItems.filter((i) => i.staffId === staffId && i.componentId === componentId && i.period === key && !i.recurring && i.status === 'ACTIVE');
    const stamp = decisionDate();
    setPayItems((prev) => {
      // One worksheet value per cell: the first one-off item holds it, any others are cancelled
      let next = prev.map((i) => (mine.slice(1).some((m) => m.id === i.id) ? { ...i, status: 'CANCELLED' as const, cancelledBy: payrollActor, note: 'Replaced in the payroll worksheet' } : i));
      if (mine[0]) {
        next = next.map((i) =>
          i.id === mine[0].id
            ? amount > 0
              ? { ...i, amount, auto: false, quantity: undefined, note: `Changed in the payroll worksheet on ${stamp}` }
              : { ...i, status: 'CANCELLED' as const, cancelledBy: payrollActor, note: 'Cleared in the payroll worksheet' }
            : i
        );
      } else if (amount > 0) {
        next = [
          ...next,
          { id: `PI-${next.length + 1001}`, orgId: selectedOrgId, staffId, componentId, amount, period: key, recurring: false, reference: 'Payroll worksheet', source: 'Manual', postedBy: payrollActor, postedOn: stamp, status: 'ACTIVE' }
        ];
      }
      return next;
    });
  };
  const cancelPayItem = (id: string, reason: string) => {
    setPayItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'CANCELLED', cancelledBy: payrollActor, note: reason } : i)));
    addToast({ type: 'info', title: 'Item cancelled', message: `${id} removed from payroll.` });
  };
  const endRecurringPayItem = (id: string, endPeriod: string) => {
    setPayItems((prev) => prev.map((i) => (i.id === id ? { ...i, endPeriod } : i)));
    addToast({ type: 'info', title: 'Recurring item ended', message: `${id} stops after ${endPeriod}.` });
  };
  const addStaffLoan: AppContextType['addStaffLoan'] = (l) => {
    if (l.startPeriod < payrollOpenPeriod.key) {
      addToast({ type: 'error', title: 'Period closed', message: `Recovery must start in ${payrollOpenPeriod.label} or later.` });
      return null;
    }
    const loan: StaffLoan = {
      ...l,
      id: `LN-${String(staffLoans.length + 1).padStart(4, '0')}`,
      orgId: selectedOrgId,
      status: 'ACTIVE',
      installment: l.installment ?? loanInstallment(l.principal, l.ratePa, l.method, l.termMonths)
    };
    setStaffLoans((prev) => [...prev, loan]);
    addToast({ type: 'success', title: 'Loan set up', message: `${loan.id}: KES ${loan.installment.toLocaleString()} a month from ${loan.startPeriod}.` });
    return loan;
  };
  // Take someone off (or back onto) the open period's payroll; paid periods can't change
  const holdPayroll = (staffId: string, reason: string) => {
    const e = hrEmployees.find((x) => x.staffId === staffId);
    if (!reason.trim()) {
      addToast({ type: 'error', title: 'Reason needed', message: 'Say why this employee is being left off the payroll.' });
      return;
    }
    setPayrollHolds((prev) => [...prev.filter((h) => !(h.staffId === staffId && h.period === payrollOpenPeriod.key)), { staffId, period: payrollOpenPeriod.key, reason: reason.trim(), by: payrollActor, on: decisionDate() }]);
    addToast({ type: 'info', title: 'Removed from payroll', message: `${e?.fullName ?? staffId} is not paid in ${payrollOpenPeriod.label} until restored. Items and loans stay on file.` });
  };
  const releasePayroll = (staffId: string) => {
    setPayrollHolds((prev) => prev.filter((h) => !(h.staffId === staffId && h.period === payrollOpenPeriod.key)));
    addToast({ type: 'success', title: 'Back on payroll', message: `${hrEmployees.find((x) => x.staffId === staffId)?.fullName ?? staffId} is paid in ${payrollOpenPeriod.label} again.` });
  };
  const setLoanStatus = (id: string, status: StaffLoan['status']) => {
    // Suspension starts with the open period so paid payslips never change
    setStaffLoans((prev) => prev.map((l) => (l.id === id ? { ...l, status, suspendedFrom: status === 'SUSPENDED' ? payrollOpenPeriod.key : undefined } : l)));
    addToast({ type: 'info', title: status === 'SUSPENDED' ? 'Loan suspended' : 'Loan resumed', message: `${id} ${status === 'SUSPENDED' ? 'skipped' : 'recovered again'} from ${payrollOpenPeriod.label}.` });
  };
  const ess = useEssState({
    hrEmployees,
    payrollOpenPeriod,
    tenantName: (orgId) => tenantOrganizations.find((t) => t.id === orgId)?.name ?? orgId,
    postPayItems,
    addStaffLoan,
    updateHrEmployee,
    addTrainingNeed: training.addTrainingNeed,
    startExit: sep.startExit,
    reportIncident: osh.reportIncident as Parameters<typeof useEssState>[0]['reportIncident'],
    addToast
  });
  // People & Payroll extensions: employee events, welfare and relations, travel, licences and library
  const peopleDeps: PeopleDeps = { hrEmployees, selectedOrgId, payrollOpenPeriod, postPayItems, addPayReduction, removePayReduction, updateHrEmployee, logEmployeeEdit: hire.logEmployeeEdit, addToast };
  const people = usePeopleState(peopleDeps);
  const welfare = useWelfareState(peopleDeps);
  const travel = useTravelState(peopleDeps);
  const registers = useRegistersState(peopleDeps);
  const security = useSecurityState(peopleDeps);
  const setPayrollBatchStatus = (id: string, status: PayrollBatch['status'], glRef?: string) => {
    setBatchStatus((m) => ({ ...m, [id]: status }));
    if (glRef) setPayrollGlRefs((m) => ({ ...m, [id]: glRef }));
  };

  // Period control: closing is a separate, checked step after posting; reopening is limited to the last closed month
  const periodKeyOf = (b: PayrollBatch) => b.id.split('-').slice(1, 3).join('-');
  const closePayrollPeriod: AppContextType['closePayrollPeriod'] = (by, note) => {
    const key = payrollOpenPeriod.key;
    const batch = payrollBatches.find((b) => b.orgId === selectedOrgId && b.pipeline === 'Monthly Payroll' && periodKeyOf(b) === key);
    if (!batch || batch.status !== 'POSTED_GL') {
      addToast({ type: 'error', title: 'Period not ready to close', message: `Approve ${payrollOpenPeriod.label} and post it to the ledger first.` });
      return false;
    }
    setClosedPayrollPeriods((xs) => (xs.includes(key) ? xs : [...xs, key]));
    if (reopenedPayrollPeriod === key) setReopenedPayrollPeriod(null);
    setPayrollPeriodLog((l) => [{ period: key, action: 'CLOSED', by, on: decisionDate(), note: note?.trim() || undefined, glRef: payrollGlRefs[batch.id] }, ...l]);
    addToast({ type: 'success', title: `${payrollOpenPeriod.label} closed`, message: 'Payslips and journals are final. New items now go to the next period.' });
    return true;
  };
  const reopenLastPayrollPeriod: AppContextType['reopenLastPayrollPeriod'] = (by, reason) => {
    if (reopenedPayrollPeriod) {
      addToast({ type: 'error', title: 'A period is already reopened', message: `Close ${payrollOpenPeriod.label} again before reopening another.` });
      return false;
    }
    if (reason.trim().length < 10) {
      addToast({ type: 'error', title: 'Reason needed', message: 'Say what has to be corrected — it is kept in the period log.' });
      return false;
    }
    const current = payrollBatches.find((b) => b.orgId === selectedOrgId && b.pipeline === 'Monthly Payroll' && periodKeyOf(b) === payrollOpenPeriod.key);
    if (current && (current.status === 'AUDIT_APPROVED' || current.status === 'POSTED_GL')) {
      addToast({ type: 'error', title: 'Current period already approved', message: `${payrollOpenPeriod.label} is approved; close it first, then reopen it if it needs correcting.` });
      return false;
    }
    const d = new Date(payrollOpenPeriod.year, payrollOpenPeriod.month - 1, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const last = payrollBatches.filter((b) => b.orgId === selectedOrgId && b.pipeline === 'Monthly Payroll' && periodKeyOf(b) === key);
    setClosedPayrollPeriods((xs) => xs.filter((x) => x !== key));
    setReopenedPayrollPeriod(key);
    // The batch goes back to Calculated so it can be corrected, re-approved and re-posted
    setBatchStatus((m) => ({ ...m, ...Object.fromEntries(last.map((b) => [b.id, 'CALCULATED' as const])) }));
    const glRef = last.map((b) => payrollGlRefs[b.id]).find(Boolean);
    setPayrollPeriodLog((l) => [{ period: key, action: 'REOPENED', by, on: decisionDate(), note: reason.trim(), glRef }, ...l]);
    addToast({ type: 'warning', title: `${label} reopened`, message: `Correct, re-approve and re-post it, then close it again.${glRef ? ` Journal ${glRef} must be reversed or adjusted in Finance.` : ''}` });
    return true;
  };

  const convertContractType = (workerId: string) => {
    // Move to the first company-defined contract type that has no service threshold
    const target = CONTRACT_TYPES.find((c) => !c.serviceThresholdDays && c.hasEndDate) ??
      CONTRACT_TYPES.find((c) => !c.serviceThresholdDays);
    setContractThresholdRecords((prev) =>
      prev.map((w) =>
        w.id === workerId || w.staffId === workerId
          ? { ...w, policyAction: 'AUTO_CONVERTED', contractConverted: true }
          : w
      )
    );
    setHrEmployees((prev) =>
      prev.map((e) =>
        e.id === workerId || e.staffId === workerId
          ? { ...e, contractType: target?.name ?? e.contractType, basicSalaryKes: 24500, status: 'ACTIVE' }
          : e
      )
    );
    addToast({
      type: 'success',
      title: 'Contract type updated',
      message: `Employee moved to ${target?.name ?? 'a new contract type'} after reaching the service threshold.`
    });
  };

  const signoffClearanceDept = (id: string, dept: 'stores' | 'it' | 'finance' | 'hr') => {
    setSeparationRecords((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          const updated = {
            ...s,
            clearanceStatus: { ...s.clearanceStatus, [dept]: true }
          };
          // Fully cleared: close the employee record so payroll stops after the exit month
          if (Object.values(updated.clearanceStatus).every(Boolean)) {
            const left = updated.exitDate <= new Date().toISOString().slice(0, 10);
            setHrEmployees((list) => list.map((e) => (e.staffId === s.staffId ? { ...e, exitDate: s.exitDate, status: left ? 'TERMINATED' : e.status } : e)));
          }
          return updated;
        }
        return s;
      })
    );
    addToast({
      type: 'success',
      title: 'Clearance Sign-off Recorded',
      message: `${dept.toUpperCase()} sign-off approved for departing personnel.`
    });
  };

  // Right-Side Slide-Over Drawer Handlers
  const openRightDrawer = (type: DrawerActionType, data: any) => {
    setActiveDrawerItem({ type, data });
  };

  const closeRightDrawer = () => {
    setActiveDrawerItem(null);
  };

  const activeTenant = tenantOrganizations.find((t) => t.id === selectedOrgId) || tenantOrganizations[0];
  const activeTenantSettings = settingsFor(activeTenant, tenantOrganizations.indexOf(activeTenant));

  // Strict Multi-Tenant Filtered Selectors
  const tenantEmployees = hrEmployees.filter((e) => e.orgId === selectedOrgId);
  const tenantRequisitions = requisitions.filter((r) => r.orgId === selectedOrgId);
  const tenantCandidates = candidates.filter((c) => c.orgId === selectedOrgId);
  const tenantOnboarding = onboardingRecords.filter((o) => o.orgId === selectedOrgId);
  const tenantAttendance = attendancePunches.filter((p) => p.orgId === selectedOrgId);
  const tenantLeave = leaveRequests.filter((l) => l.orgId === selectedOrgId);
  const tenantPayrollBatches = payrollBatches.filter((b) => b.orgId === selectedOrgId);
  const tenantContractThresholds = contractThresholdRecords.filter((w) => w.orgId === selectedOrgId);
  const tenantSeparations = separationRecords.filter((s) => s.orgId === selectedOrgId);

  return (
    <AppContext.Provider
      value={{
        currentView,
        setCurrentView: handleSetCurrentView,
        selectedOrgId,
        setSelectedOrgId,
        activeTenant,
        tenantOrganizations,
        activeTenantSettings,
        addTenantOrganization,
        updateTenantOrganization,
        activeDrawerItem,
        openRightDrawer,
        closeRightDrawer,

        // Strict Tenant Data
        tenantEmployees,
        tenantRequisitions,
        tenantCandidates,
        tenantOnboarding,
        tenantAttendance,
        tenantLeave,
        tenantPayrollBatches,
        tenantContractThresholds,
        tenantSeparations,
        theme,
        toggleTheme,
        isSidebarCollapsed,
        toggleSidebar,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        toggleMobileMenu,
        closeMobileMenu,
        isCommandPaletteOpen,
        setIsCommandPaletteOpen,
        isAiDrawerOpen,
        setIsAiDrawerOpen,
        isLauncherOpen,
        moduleTabs,
        setModuleTab,
        setIsLauncherOpen,

        selectedUser,
        setSelectedUser,
        selectedOrg,
        setSelectedOrg,
        selectedWorkItem,
        setSelectedWorkItem,
        selectedAuditEvent,
        setSelectedAuditEvent,

        workItems,
        users,
        organizations,
        auditEvents,
        systemHealth,
        integrations,
        workflows,
        aiInsights,
        roles,
        invoices,
        toasts,

        // HR & Employee Payroll exports
        requisitions,
        candidates,
        onboardingRecords,
        hrEmployees,
        orgStructure,
        addBranch,
        addStation,
        addDepartment,
        addSection,
        addDesignation,
        updateDesignation,
        customFields,
        addCustomField,
        removeCustomField,
        addHrEmployee,
        updateHrEmployee,
        payReductions,
        addPayReduction,
        removePayReduction,
        attendancePunches,
        leaveRequests,
        ...leave,
        ...time,
        ...perf,
        ...training,
        ...sep,
        ...ess,
        ...osh,
        ...people,
        ...welfare,
        ...travel,
        ...registers,
        ...security,
        ...hire,
        payrollBatches,
        payItems,
        staffLoans,
        payComponents,
        savePayComponent,
        setPayComponentStatus,
        deletePayComponent,
        payrollCtx,
        payrollOpenPeriod,
        closedPayrollPeriods,
        reopenedPayrollPeriod,
        payrollPeriodLog,
        closePayrollPeriod,
        reopenLastPayrollPeriod,
        postPayItems,
        cancelPayItem,
        setWorksheetItem,
        endRecurringPayItem,
        addStaffLoan,
        setLoanStatus,
        setPayrollBatchStatus,
        payrollGlRefs,
        noteRatesChanged,
        ratesStamp,
        payrollHolds,
        holdPayroll,
        releasePayroll,
        contractThresholdRecords,
        separationRecords,

        approveRequisition,
        createRequisition,
        updateCandidateStage,
        toggleOnboardingItem,
        addAttendancePunch,
        approveLeaveRequest,
        rejectLeaveRequest,
        cancelLeaveRequest,
        createLeaveRequest,
        runPayrollBatch,
        convertContractType,
        signoffClearanceDept,

        acknowledgeWorkItem,
        snoozeWorkItem,
        resolveWorkItem,
        escalateWorkItem,
        executeWorkItemAction,
        dismissAiInsight,
        applyAiMitigation,

        suspendUser,
        activateUser,
        resetUserMfa,
        revokeSession,
        revokeAllSessions,
        changeUserRole,

        retryWorkflow,
        reconnectIntegration,

        addToast,
        removeToast
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
