import type { HistoryEntry } from '../../finance/types';
import type { ESignature } from '../../../platform/Widgets';

/* ---------------- Fields added to existing maintenance records ---------------- */

export interface ChecklistStep {
  text: string;
  safety?: boolean;
  done?: boolean;
  by?: string;
  at?: string;
}

export interface WorkNote {
  at: string;
  by: string;
  text: string;
}

/** Spare or service a machine is built from. Stocked lines point at an item master SKU; others carry a description and cost. */
export interface BomLine {
  sku?: string;
  description: string;
  qty: number;
  stocked: boolean;
  unitCost?: number;
}

export interface Warranty {
  supplierId: string;
  until: string;
  terms: string;
}

export type MeterUnit = 'HOURS' | 'KM' | 'CYCLES' | 'KWH';

export interface MeterSpec {
  unit: MeterUnit;
  reading: number;
  readOn?: string;
}

export interface CalibrationSpec {
  required: boolean;
  intervalDays: number;
  tolerance: string;
  standard: string;
  lastCalibrated?: string;
}

export interface CalibrationResult {
  standard: string;
  asFound: string;
  asLeft: string;
  pass: boolean;
  certNo: string;
}

export interface ReplacedPart {
  sku?: string;
  description: string;
  serialOut?: string;
  serialIn?: string;
  action: 'REPLACED' | 'REBUILT';
}

/* ---------------- New maintenance records ---------------- */

export interface CalibrationRecord extends CalibrationResult {
  id: string;
  equipmentId: string;
  woId?: string;
  woNumber?: string;
  date: string;
  tolerance: string;
  by: string;
}

export interface MeterReading {
  id: string;
  equipmentId: string;
  date: string;
  value: number;
  by: string;
  source: 'MANUAL' | 'SIMULATED';
}

/** Vibration, temperature or other condition-monitoring value with its warning and alarm limits. */
export interface ConditionReading {
  id: string;
  equipmentId: string;
  parameter: string;
  unit: string;
  value: number;
  limitWarn: number;
  limitAlarm: number;
  date: string;
  by: string;
}

export type NotificationTrigger = 'USER' | 'PM' | 'METER' | 'VEHICLE' | 'PREDICTIVE' | 'CALIBRATION';

/** A maintenance request (from a user or raised by the system) that a planner turns into a work order or rejects. */
export interface MaintNotification {
  id: string;
  number: string;
  equipmentId: string;
  source: 'USER' | 'SYSTEM';
  trigger: NotificationTrigger;
  /** Dedupe key for system notices (schedule, vehicle, reading) */
  key?: string;
  description: string;
  priority: 'URGENT' | 'HIGH' | 'NORMAL';
  raisedBy: string;
  date: string;
  status: 'OPEN' | 'CONVERTED' | 'REJECTED';
  woId?: string;
  woNumber?: string;
  reason?: string;
  history: HistoryEntry[];
}

export interface JobTemplate {
  id: string;
  name: string;
  equipmentType: string;
  steps: { text: string; safety?: boolean }[];
  estHours: number;
  parts: { sku: string; qty: number }[];
  requiresPermit: boolean;
  permitType?: string;
}

export interface Technician {
  id: string;
  name: string;
  trade: string;
  hoursPerDay: number;
  rate: number;
  external?: boolean;
}

/** Repairable (rotable) spare tracked by serial number through install, repair and return to stock. */
export interface Rotable {
  id: string;
  serial: string;
  description: string;
  status: 'IN_STOCK' | 'INSTALLED' | 'AT_REPAIR' | 'CORE_DUE' | 'SCRAPPED';
  location: string;
  equipmentId?: string;
  /** Carrying value: purchase value plus refurbishment cost */
  value: number;
  /** Exchange issue: the old unit (core) still has to come back */
  coreDue?: { woNumber: string; since: string; serialOut: string };
  history: { date: string; event: string; by: string; woNumber?: string; value?: number }[];
}

export interface EnergyReading {
  id: string;
  date: string;
  source: 'GRID' | 'GENERATOR' | 'SOLAR';
  kWh: number;
  cost: number;
  by: string;
}

export interface MaintenanceExtState {
  notifications: MaintNotification[];
  templates: JobTemplate[];
  technicians: Technician[];
  meterReadings: MeterReading[];
  conditions: ConditionReading[];
  calibrations: CalibrationRecord[];
  rotables: Rotable[];
  energy: EnergyReading[];
  sequence: Record<string, number>;
}

/* ---------------- Projects ---------------- */

export interface ProjectPhase {
  id: string;
  name: string;
  budget: number;
  start: string;
  end: string;
}

export interface ProjectTask {
  id: string;
  phaseId: string;
  name: string;
  durationDays: number;
  predecessors: string[];
  progress: number;
  /** Planned start for tasks without predecessors (else from the network) */
  start?: string;
  actualFinish?: string;
}

export type CostType = 'MATERIAL' | 'LABOUR' | 'BURDEN' | 'SUBCONTRACT' | 'EXPENSE' | 'OTHER';

export interface ProjectCost {
  id: string;
  projectId: string;
  phaseId: string;
  type: CostType;
  amount: number;
  date: string;
  source: string;
  description: string;
  billable?: boolean;
  billed?: string;
}

export interface Timesheet {
  id: string;
  projectId: string;
  phaseId: string;
  employee: string;
  date: string;
  hours: number;
  rate: number;
  billRate: number;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  billed?: string;
}

export interface ExpenseClaim {
  id: string;
  number: string;
  projectId: string;
  phaseId: string;
  employee: string;
  date: string;
  category: 'TRAVEL' | 'PER_DIEM' | 'ACCOMMODATION' | 'OTHER';
  amount: number;
  description: string;
  billable: boolean;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  journalNumber?: string;
  billed?: string;
}

export interface ProjectMaterial {
  id: string;
  phaseId: string;
  sku: string;
  qty: number;
  neededBy: string;
  issued: number;
  requisitionNumber?: string;
}

export interface Appraisal {
  capex: number;
  annualBenefit: number;
  lifeYears: number;
  ratePct: number;
  risks: string;
  preparedBy: string;
  decision?: 'APPROVED' | 'REJECTED';
  decidedBy?: string;
  note?: string;
}

export interface ProjectCertificate {
  id: string;
  number: string;
  kind: 'STATUS' | 'COMPLETION';
  date: string;
  summary: string;
  issuedBy: string;
  signature?: ESignature;
}

export interface ProjectExt {
  projectId: string;
  code: string;
  kind: 'CAPEX' | 'INVESTMENT' | 'CUSTOMER';
  scope: string;
  customerId?: string;
  orderNumbers: string[];
  team: { name: string; role: string; allocationPct: number }[];
  burdenRatePct: number;
  phases: ProjectPhase[];
  tasks: ProjectTask[];
  materials: ProjectMaterial[];
  appraisal?: Appraisal;
  benefits: { period: string; amount: number; note: string }[];
  budgetApprovedBy?: string;
  assetCategory?: string;
  capitalisedAs?: string;
  certificates: ProjectCertificate[];
  invoices: { number: string; amount: number; date: string }[];
  history: HistoryEntry[];
}

export interface ProjectsState {
  ext: Record<string, ProjectExt>;
  costs: ProjectCost[];
  timesheets: Timesheet[];
  expenses: ExpenseClaim[];
  sequence: Record<string, number>;
}

/** Maintenance suite pages added by the extension (the core pages are in operations/store.tsx). */
export type MaintExtPage = 'notifications' | 'schedule' | 'equipment' | 'calibration' | 'refurbish' | 'templates' | 'reports' | 'energy' | 'control';
