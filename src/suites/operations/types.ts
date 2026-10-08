import type { HistoryEntry } from '../finance/types';

/** CUSTOMER is the buyer's portal user (shipping instructions only); CREDIT is Finance's credit controller. */
export type OpsRole = 'OFFICER' | 'STOREKEEPER' | 'TECHNICIAN' | 'QC' | 'MANAGER' | 'CUSTOMER' | 'CREDIT';

export interface OpsActor {
  role: OpsRole;
  name: string;
  title: string;
  /** Portal users act for one customer only */
  customerId?: string;
}

/* ---------------- Warehousing ---------------- */

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  capacity: number;
  /** The main warehouse holds whatever is not explicitly placed elsewhere. */
  main?: boolean;
  /** Storage capacity in kg (tea godowns are planned by weight) */
  capacityKg?: number;
  kind?: 'GODOWN' | 'PORT' | 'FACTORY' | 'STUFFING_BASE';
  archived?: boolean;
}

export interface StockMove {
  id: string;
  date: string;
  sku: string;
  qty: number;
  from?: string;
  to?: string;
  kind: 'TRANSFER' | 'COUNT' | 'PRODUCTION_ISSUE' | 'PRODUCTION_OUTPUT' | 'MAINTENANCE_ISSUE' | 'ADJUSTMENT' | 'SHIPMENT_LOADING';
  ref: string;
  by: string;
}

export interface Transfer {
  id: string;
  number: string;
  from: string;
  to: string;
  date: string;
  lines: { sku: string; qty: number }[];
  status: 'REQUESTED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';
  requestedBy: string;
  reason: string;
  history: HistoryEntry[];
}

export interface CountLine {
  sku: string;
  expected: number;
  counted: number | null;
}

export interface StockCount {
  id: string;
  number: string;
  warehouse: string;
  date: string;
  lines: CountLine[];
  status: 'OPEN' | 'SUBMITTED' | 'APPROVED';
  /** Annual wall-to-wall count or a periodic cycle count of a subset of items */
  type?: 'ANNUAL' | 'CYCLE';
  countedBy?: string;
  approvedBy?: string;
  history: HistoryEntry[];
}

/* ---------------- Production ---------------- */

export interface Recipe {
  id: string;
  product: string;
  name: string;
  batchSize: number;
  materials: { sku: string; qty: number }[];
  hours: number;
  line: string;
  checks: string[];
}

export interface QualityCheck {
  parameter: string;
  target: string;
  result: string;
  pass: boolean;
}

export type BatchStatus = 'PLANNED' | 'RELEASED' | 'IN_PROGRESS' | 'QC' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

export interface Batch {
  id: string;
  number: string;
  recipeId: string;
  plannedQty: number;
  date: string;
  line: string;
  status: BatchStatus;
  issued: { sku: string; qty: number }[];
  output: number;
  rejectedQty: number;
  checks: QualityCheck[];
  checkedBy?: string;
  history: HistoryEntry[];
  forOrder?: string;
}

/* ---------------- Shipping ---------------- */

export type ShipmentStage = 'BOOKED' | 'DOCUMENTS' | 'LOADED' | 'DEPARTED' | 'ARRIVED' | 'DELIVERED';

export interface ShipDoc {
  key: string;
  name: string;
  issuer: string;
  done: boolean;
  ref?: string;
}

export interface Shipment {
  id: string;
  number: string;
  customerId: string;
  destination: string;
  incoterm: 'FOB' | 'CIF' | 'CFR';
  lines: { sku: string; description: string; qty: number; price: number }[];
  stage: ShipmentStage;
  vessel: string;
  line: string;
  bookingRef: string;
  etd: string;
  eta: string;
  container?: string;
  seal?: string;
  docs: ShipDoc[];
  invoiceId?: string;
  invoiceNumber?: string;
  history: HistoryEntry[];
  /** Shipping instruction this shipment was created from */
  siId?: string;
  siNumber?: string;
  /** Warehouse the container is stuffed at (defaults to the Mombasa port store) */
  stuffingBase?: string;
  /** Tea shipments are loaded lot by lot from a container loading plan instead of SKU stock */
  loadingPlan?: string;
  /** Verified gross mass certificate (SOLAS) — required before the vessel sails */
  vgm?: { number: string; grossKg: number; method: 'METHOD_1' | 'METHOD_2'; by: string; at: string };
  /** Processing block (credit, quality or customer hold) */
  blocked?: { reason: string; by: string; at: string };
}

/* ---------------- Transport & fleet ---------------- */

export interface Vehicle {
  id: string;
  reg: string;
  model: string;
  type: 'Truck' | 'Pickup' | 'Van' | 'Saloon';
  capacityKg: number;
  odometer: number;
  driver: string;
  status: 'AVAILABLE' | 'ON_TRIP' | 'IN_WORKSHOP';
  serviceEveryKm: number;
  lastServiceKm: number;
  insuranceExpiry: string;
  inspectionExpiry: string;
}

export interface Trip {
  id: string;
  number: string;
  vehicleId: string;
  driver: string;
  date: string;
  purpose: string;
  route: string;
  startKm: number;
  endKm?: number;
  status: 'PLANNED' | 'ON_ROAD' | 'DONE';
  deliveryRef?: string;
}

export interface FuelEntry {
  id: string;
  vehicleId: string;
  date: string;
  litres: number;
  cost: number;
  odometer: number;
  station: string;
}

/* ---------------- Maintenance & projects ---------------- */

export interface Equipment {
  id: string;
  name: string;
  area: string;
  criticality: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'RUNNING' | 'DOWN' | 'SERVICE_DUE';
  vehicleId?: string;
}

export type WorkStatus = 'REQUESTED' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface WorkOrder {
  id: string;
  number: string;
  equipmentId: string;
  title: string;
  kind: 'BREAKDOWN' | 'PREVENTIVE' | 'INSPECTION' | 'IMPROVEMENT';
  priority: 'URGENT' | 'HIGH' | 'NORMAL';
  requestedBy: string;
  date: string;
  due: string;
  assignedTo: string;
  status: WorkStatus;
  hours: number;
  parts: { sku: string; qty: number }[];
  contractorCost: number;
  contractorId?: string;
  billId?: string;
  billNumber?: string;
  downtimeHours: number;
  notes: string;
  history: HistoryEntry[];
  scheduleId?: string;
}

export interface PmSchedule {
  id: string;
  equipmentId: string;
  task: string;
  everyDays: number;
  lastDone: string;
  assignedTo: string;
}

export interface Project {
  id: string;
  name: string;
  owner: string;
  budget: number;
  spent: number;
  start: string;
  end: string;
  status: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'DONE';
  milestones: { name: string; due: string; done: boolean }[];
}

export interface OperationsState {
  actor: OpsActor;
  warehouses: Warehouse[];
  /** Quantities held outside the main warehouse, by SKU then warehouse id. */
  placed: Record<string, Record<string, number>>;
  moves: StockMove[];
  transfers: Transfer[];
  counts: StockCount[];
  recipes: Recipe[];
  batches: Batch[];
  shipments: Shipment[];
  vehicles: Vehicle[];
  trips: Trip[];
  fuel: FuelEntry[];
  equipment: Equipment[];
  workOrders: WorkOrder[];
  schedules: PmSchedule[];
  projects: Project[];
  sequence: Record<string, number>;
}
