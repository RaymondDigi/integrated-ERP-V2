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
}
export interface Licence {
  id: string;
  name: string;
  vendor: string;
  seats: number;
  used: number;
  renewal: string;
  annualCost: number;
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
}
export interface Permit {
  id: string;
  name: string;
  issuer: string;
  number: string;
  expiry: string;
  site: string;
  renewalStarted?: boolean;
}

/* ---------------- Implementation ---------------- */

export interface Workstream {
  id: string;
  module: string;
  owner: string;
  goLive: string;
  tasks: { name: string; phase: 'Configure' | 'Data' | 'Training' | 'Testing' | 'Go-live'; due: string; done: boolean }[];
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
}
