import type { HistoryEntry } from '../finance/types';

export type CtlRole = 'QHSE' | 'ICT_OFFICER' | 'ICT_MANAGER' | 'SECRETARY';
export interface CtlActor {
  role: CtlRole;
  name: string;
  title: string;
}

/* ---------------- Quality & risk ---------------- */

export interface Finding {
  id: string;
  text: string;
  severity: 'MAJOR' | 'MINOR' | 'OBSERVATION';
  capaId?: string;
  /** Standard clause the finding is raised against, e.g. "ISO 22000 7.1.5" */
  clause?: string;
  evidence?: string;
  auditeeResponse?: string;
  /** Observation turned into an improvement opportunity */
  opportunityId?: string;
}
export interface ChecklistItem {
  question: string;
  clause?: string;
  result?: 'CONFORM' | 'NONCONFORM' | 'NA';
}
export interface Audit {
  id: string;
  number: string;
  title: string;
  type: 'Internal' | 'External' | 'Supplier' | 'Customer';
  standard: string;
  area: string;
  auditor: string;
  date: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'CLOSED';
  findings: Finding[];
  auditee?: string;
  team?: string[];
  scope?: string;
  checklist?: ChecklistItem[];
  programmeAreaId?: string;
  history?: HistoryEntry[];
}

/** Annual audit programme: what gets audited, against which standard, how often and by whom. */
export interface ProgrammeArea {
  id: string;
  area: string;
  standard: string;
  frequencyMonths: number;
  auditor: string;
  auditee: string;
  lastAudit?: string;
  nextDue: string;
}
export interface AuditProgramme {
  id: string;
  year: number;
  title: string;
  objectives: string;
  scope: string;
  areas: ProgrammeArea[];
  status: 'DRAFT' | 'APPROVED';
  preparedBy: string;
  approvedBy?: string;
  approvedAt?: string;
  history: HistoryEntry[];
}
export type CapaStatus = 'OPEN' | 'IN_PROGRESS' | 'VERIFY' | 'CLOSED';
export interface Capa {
  id: string;
  number: string;
  source: 'AUDIT' | 'COMPLAINT' | 'INCIDENT' | 'RISK';
  sourceRef: string;
  problem: string;
  rootCause: string;
  action: string;
  owner: string;
  due: string;
  status: CapaStatus;
  history: HistoryEntry[];
  /** Effectiveness can only be confirmed on or after this date */
  reviewDate?: string;
  /** Person responsible for the audited area, kept informed */
  auditee?: string;
  /** Original due date before any extension */
  originalDue?: string;
  extensions?: { from: string; to: string; reason: string; by: string; at: string }[];
}
export interface Risk {
  id: string;
  title: string;
  category: 'Operational' | 'Financial' | 'Compliance' | 'Safety' | 'Strategic' | 'ICT';
  owner: string;
  likelihood: number;
  impact: number;
  residualLikelihood: number;
  residualImpact: number;
  controls: string;
  nextReview: string;
  treatment: string;
  /** Missing on older records means ACTIVE */
  status?: 'PROPOSED' | 'ACTIVE' | 'DROPPED' | 'CLOSED';
  raisedBy?: string;
  history?: HistoryEntry[];
  kris?: Kri[];
  approvals?: { by: string; role: string; at: string }[];
}

/** Key risk indicator: a live measure from the business with the level at which it raises an alert. */
export type KriMetric = 'OVERDUE_CAPAS' | 'SLA_BREACHES' | 'OVERDUE_FILINGS' | 'EXPIRING_PERMITS' | 'OPEN_HIGH_COMPLAINTS' | 'OPEN_EMERGENCIES' | 'FAILED_SYNCS' | 'LOW_STOCK_ITEMS' | 'OVERDUE_RECEIVABLES_PCT' | 'EQUIPMENT_DOWN';
export interface Kri {
  id: string;
  name: string;
  metric: KriMetric;
  /** Amber at or above this value */
  warn: number;
  /** Red at or above this value */
  limit: number;
}
export interface Complaint {
  id: string;
  number: string;
  customerId: string;
  date: string;
  sku: string;
  batch?: string;
  category: 'Quality' | 'Delivery' | 'Packaging' | 'Documentation';
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'NEW' | 'INVESTIGATING' | 'RESOLVED';
  capaId?: string;
  response?: string;
  channel?: 'Phone' | 'Email' | 'Customer portal' | 'Sales rep' | 'Walk-in';
  acknowledgedAt?: string;
  resolvedOn?: string;
  feedback?: { rating: number; comment: string; at: string };
  escalations?: { level: number; reason: string; at: string; by: string; to: string }[];
  history?: HistoryEntry[];
}

/** Business improvement opportunity: raised by anyone, reviewed and decided, then implemented. */
export interface Opportunity {
  id: string;
  number: string;
  title: string;
  description: string;
  source: 'AUDIT' | 'STAFF' | 'CUSTOMER' | 'RISK' | 'COMPLAINT';
  sourceRef?: string;
  raisedBy: string;
  benefit: string;
  estValue: number;
  status: 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'IMPLEMENTED';
  owner?: string;
  decision?: string;
  approvals: { by: string; role: string; at: string }[];
  history: HistoryEntry[];
}

/* ---------------- Emergencies ---------------- */

export type EmergencyType = 'Fire' | 'Product recall' | 'Chemical spill' | 'IT outage' | 'Flood' | 'Injury' | 'Security breach' | 'Power failure';
export interface Emergency {
  id: string;
  number: string;
  /** 1 = site level, contained locally · 2 = serious, management · 3 = major, board and authorities */
  cls: 1 | 2 | 3;
  type: EmergencyType;
  site: string;
  description: string;
  reportedBy: string;
  at: string;
  status: 'ACTIVE' | 'CONTAINED' | 'CLOSED';
  injuries: boolean;
  immediateActions: { at: string; by: string; text: string }[];
  longTerm?: string;
  capaId?: string;
  affected: { ref: string; grade: string; qty: number; unit: string; value: number }[];
  notified: string[];
  history: HistoryEntry[];
}
export interface EmergencyPlan {
  type: EmergencyType;
  procedure: string;
  assembly: string;
  contacts: string[];
}

/* ---------------- ICT ---------------- */

export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export interface Ticket {
  id: string;
  number: string;
  title: string;
  requester: string;
  department: string;
  category: 'Hardware' | 'Software' | 'Network' | 'Access' | 'Email' | 'ERP';
  priority: Priority;
  created: string;
  status: 'NEW' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED';
  assignee?: string;
  firstResponse?: string;
  resolvedAt?: string;
  resolution?: string;
  notes: HistoryEntry[];
  channel?: 'Phone' | 'Email' | 'Self-service' | 'Chat' | 'Walk-in';
  impact?: 1 | 2 | 3;
  urgency?: 1 | 2 | 3;
  /** Requester confirmed the fix — the ticket is closed */
  closedAt?: string;
  reopened?: number;
  kbIds?: string[];
  problemId?: string;
  ciIds?: string[];
}

/** Underlying cause behind one or more incidents (ITIL problem management). */
export interface Problem {
  id: string;
  number: string;
  title: string;
  description: string;
  ticketIds: string[];
  ciIds: string[];
  owner: string;
  rootCause: string;
  workaround: string;
  status: 'OPEN' | 'KNOWN_ERROR' | 'RESOLVED';
  history: HistoryEntry[];
}

/** Configuration item in the CMDB. */
export interface ConfigItem {
  id: string;
  name: string;
  kind: 'Server' | 'Network' | 'Application' | 'Database' | 'Service' | 'Endpoint';
  location: string;
  owner: string;
  businessSystem: string;
  dependsOn: string[];
  assetId?: string;
  ip?: string;
  status: 'LIVE' | 'PLANNED' | 'RETIRED';
  source: 'MANUAL' | 'DISCOVERY';
}

export interface KbArticle {
  id: string;
  number: string;
  title: string;
  category: string;
  body: string;
  tags: string[];
  author: string;
  updated: string;
  views: number;
  helpful: number;
  revisions: { at: string; by: string; note: string; body: string }[];
  fromTicket?: string;
}

export interface MonitorRule {
  id: string;
  metric: 'CPU' | 'MEMORY' | 'DISK' | 'LATENCY' | 'PACKET_LOSS';
  target: string;
  warn: number;
  critical: number;
}
export interface ItAsset {
  id: string;
  tag: string;
  type: 'Laptop' | 'Desktop' | 'Server' | 'Printer' | 'Network' | 'Phone';
  model: string;
  assignedTo: string;
  department: string;
  purchased: string;
  warrantyEnd: string;
  status: 'IN_USE' | 'SPARE' | 'REPAIR' | 'RETIRED';
  serial?: string;
  cpu?: string;
  ram?: string;
  os?: string;
  location?: string;
  cost?: number;
  history?: HistoryEntry[];
}
export interface Licence {
  id: string;
  name: string;
  vendor: string;
  seats: number;
  used: number;
  renewal: string;
  annualCost: number;
  /** Named people holding a seat, where tracked */
  assignees?: string[];
}
export interface Change {
  id: string;
  number: string;
  title: string;
  system: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  requestedBy: string;
  window: string;
  backout: string;
  status: 'SUBMITTED' | 'APPROVED' | 'IMPLEMENTED' | 'REJECTED';
  history: HistoryEntry[];
  type?: 'STANDARD' | 'NORMAL' | 'EMERGENCY';
  description?: string;
  outcome?: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  pir?: string;
  ciIds?: string[];
  approvals?: { by: string; role: string; at: string }[];
}

/* ---------------- Integrations ---------------- */

export interface Connector {
  id: string;
  name: string;
  provider: string;
  purpose: string;
  module: string;
  status: 'CONNECTED' | 'DEGRADED' | 'PAUSED';
  schedule: string;
  lastSync: string;
  /** Connector technology, e.g. REST, MS-SQL, SAP S/4HANA (simulated in this build) */
  kind?: string;
  endpoint?: string;
}
export interface SyncEntry {
  id: string;
  connectorId: string;
  at: string;
  direction: 'IN' | 'OUT';
  records: number;
  status: 'OK' | 'WARN' | 'FAIL';
  message: string;
}

/* ---------------- Governance ---------------- */

export interface Obligation {
  id: string;
  name: string;
  authority: string;
  frequency: 'Monthly' | 'Quarterly' | 'Annual' | 'One-off';
  due: string;
  owner: string;
  status: 'DUE' | 'FILED';
  filedOn?: string;
  ref?: string;
  amount?: number;
  history?: HistoryEntry[];
}
export interface Policy {
  id: string;
  title: string;
  owner: string;
  version: string;
  approved: string;
  nextReview: string;
  staff: number;
  acknowledged: number;
  history?: HistoryEntry[];
  lastReminded?: string;
}
export interface Permit {
  id: string;
  name: string;
  issuer: string;
  number: string;
  expiry: string;
  site: string;
  renewalStarted?: boolean;
  owner?: string;
  annualCost?: number;
  conditions?: string;
  retired?: boolean;
  /** Days-before-expiry reminders already sent (60, 30, 7) */
  remindersSent?: number[];
  history?: HistoryEntry[];
}

/* ---------------- Implementation ---------------- */

export interface Workstream {
  id: string;
  module: string;
  owner: string;
  goLive: string;
  tasks: { name: string; phase: 'Configure' | 'Data' | 'Training' | 'Testing' | 'Go-live'; due: string; done: boolean }[];
}

export interface TestRun {
  id: string;
  at: string;
  by: string;
  result: 'PASS' | 'FAIL';
  actual: string;
  ticketId?: string;
}
export interface TestCase {
  id: string;
  number: string;
  module: string;
  title: string;
  steps: string[];
  expected: string;
  runs: TestRun[];
}

/* ---------------- Workplace (intranet, documents, calendar, feedback) ---------------- */

export interface DocVersion {
  v: number;
  at: string;
  by: string;
  note: string;
  fileName?: string;
  dataUrl?: string;
}
export interface LibraryDoc {
  id: string;
  number: string;
  title: string;
  folder: string;
  owner: string;
  status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'OBSOLETE';
  versions: DocVersion[];
  checkedOutBy?: string;
  checkedOutAt?: string;
  comments: { at: string; by: string; text: string }[];
  share?: { party: string; token: string; expires: string };
  policyId?: string;
  approvals: { by: string; role: string; at: string }[];
  history: HistoryEntry[];
}
export interface Announcement {
  id: string;
  title: string;
  body: string;
  by: string;
  at: string;
  audience: string;
  pinned: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  expires?: string;
  reads: string[];
}
export interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  owner: string;
  attendees: string[];
  calendar: 'PERSONAL' | 'TEAM' | 'COMPANY';
  resourceId?: string;
  location?: string;
}
export interface BookableResource {
  id: string;
  name: string;
  kind: 'Room' | 'Vehicle' | 'Equipment';
  capacity: number;
  location: string;
}
export interface SurveyQuestion {
  id: string;
  text: string;
  type: 'SCALE' | 'TEXT' | 'CHOICE';
  options?: string[];
}
export interface Survey {
  id: string;
  title: string;
  kind: 'EMPLOYEE' | 'INTERNAL_CUSTOMER';
  /** Department being rated, for internal-customer surveys */
  targetDept?: string;
  audience: string;
  period: string;
  questions: SurveyQuestion[];
  responses: { id: string; by: string; dept: string; at: string; answers: Record<string, string | number> }[];
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  createdBy: string;
}
export interface Poll {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, number>;
  createdBy: string;
  closes: string;
}
export interface Suggestion {
  id: string;
  text: string;
  /** Undefined when the suggestion was made anonymously */
  by?: string;
  dept: string;
  at: string;
  votes: string[];
  status: 'NEW' | 'UNDER_REVIEW' | 'ADOPTED' | 'DECLINED';
  response?: string;
}

export interface ControlState {
  actor: CtlActor;
  audits: Audit[];
  capas: Capa[];
  risks: Risk[];
  complaints: Complaint[];
  tickets: Ticket[];
  assets: ItAsset[];
  licences: Licence[];
  changes: Change[];
  connectors: Connector[];
  syncLog: SyncEntry[];
  obligations: Obligation[];
  policies: Policy[];
  permits: Permit[];
  workstreams: Workstream[];
  sequence: Record<string, number>;
  programmes: AuditProgramme[];
  opportunities: Opportunity[];
  emergencies: Emergency[];
  emergencyPlans: EmergencyPlan[];
  problems: Problem[];
  cis: ConfigItem[];
  kb: KbArticle[];
  monitorRules: MonitorRule[];
  testCases: TestCase[];
  docs: LibraryDoc[];
  announcements: Announcement[];
  events: CalEvent[];
  resources: BookableResource[];
  surveys: Survey[];
  polls: Poll[];
  suggestions: Suggestion[];
}
