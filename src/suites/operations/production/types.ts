import type { HistoryEntry } from '../../finance/types';
import type { OpsRole } from '../types';

/* ------------------------------------------------------------------ */
/* Tea lots and blending                                               */
/* ------------------------------------------------------------------ */

/** One auction or direct-sale invoice of made tea, held in a bay until it is blended. */
export interface TeaLot {
  id: string;
  invoiceNo: string;
  garden: string;
  grade: string;
  /** Mombasa auction sale number (e.g. 38/2026) or "Direct" */
  saleNo: string;
  kgs: number;
  kgBalance: number;
  packages: number;
  warehouseId: string;
  bay: string;
  costPerKg: number;
  moisturePct: number;
  tastingScore: number;
  status: 'AVAILABLE' | 'ON_HOLD' | 'DEPLETED';
  holdReason?: string;
  arrived: string;
}

export type ByProductKind = 'SWEEPINGS' | 'DUST' | 'FIBRE';

/** The client's blend standard: the grade mix and the numeric limits every chop is tasted against. */
export interface BlendStandard {
  id: string;
  code: string;
  name: string;
  /** Customer-specific standard; empty means the house standard used for any order */
  customerId?: string;
  /** Item the finished bulk blend goes into stock as (tonnes) */
  outputSku: string;
  grades: { grade: string; minPct: number; maxPct: number }[];
  moistureMax: number;
  tastingMin: number;
  expectedOutturnPct: number;
  byProducts: { kind: ByProductKind; pct: number; valuePerKg: number }[];
}

export interface BlendLine {
  lotId: string;
  kg: number;
}

export interface ChopResult {
  moisturePct: number;
  tastingScore: number;
  liquor: string;
  infusion: string;
  appearance: string;
  pass: boolean;
  reasons: string[];
  by: string;
  at: string;
}

/** One run of the blender (tower or drum) with its sample and tasting result. */
export interface Chop {
  id: string;
  seq: number;
  kgIn: number;
  kgOut?: number;
  startedAt: string;
  by: string;
  sample?: { ref: string; drawnBy: string; drawnAt: string };
  result?: ChopResult;
  /** Set when this chop re-runs a failed one */
  reworkOf?: string;
  reworkCost?: number;
}

export type BlendStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

export interface Blendsheet {
  id: string;
  number: string;
  orderId?: string;
  orderNumber?: string;
  customerId?: string;
  standardId: string;
  plant: 'TOWER' | 'DRUM';
  workCenterId: string;
  targetKg: number;
  date: string;
  due: string;
  lines: BlendLine[];
  status: BlendStatus;
  preparedBy: string;
  approvals: { by: string; role: OpsRole; at: string; note?: string }[];
  history: HistoryEntry[];
  chops: Chop[];
  issuedAt?: string;
  /** Weighted cost of the teas issued (KES) */
  issuedCost?: number;
  outturn?: { inputKg: number; outputKg: number; byProducts: { kind: ByProductKind; kg: number }[]; lossKg: number; at: string; by: string };
  journalIds: string[];
  labour: LabourEntry[];
  planId?: string;
  /** Packing batch this blend was raised for (multi-level release) */
  parentBatchId?: string;
  autoFromOrder?: boolean;
}

/** A period's blending plan: which blendsheets run on which plant, approved as one document. */
export interface BlendPlan {
  id: string;
  number: string;
  period: string;
  blendsheetIds: string[];
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  preparedBy: string;
  approvals: { by: string; role: OpsRole; at: string; note?: string }[];
  notes: string;
  history: HistoryEntry[];
}

/* ------------------------------------------------------------------ */
/* Work centres, routings and costing                                  */
/* ------------------------------------------------------------------ */

export type WorkCenterKind = 'TOWER' | 'DRUM' | 'PACKING' | 'SORTING' | 'LAB';
export type BurdenBasis = 'PER_HOUR' | 'PER_UNIT' | 'PCT_LABOUR' | 'PCT_MATERIAL';

export interface WorkCenter {
  id: string;
  name: string;
  kind: WorkCenterKind;
  /** Identical machines that can run in parallel */
  machines: number;
  /** People on shift */
  crew: number;
  /** Change parts / tooling sets that limit how many machines can be set up at once */
  tooling: number;
  hoursPerDay: number;
  /** Working weekdays, 0 = Sunday */
  days: number[];
  labourDirectRate: number;
  labourIndirectRate: number;
  machineRate: number;
  burden: { basis: BurdenBasis; amount: number };
  setupCost: number;
  /** Standard production sequence (recipe or blend standard ids, light to strong) */
  sequence: string[];
  /** Blending plants: throughput and the size of one chop */
  kgPerHour?: number;
  chopKg?: number;
  hazard?: { agent: string; ppe: string; monthlyLimitHrs: number };
}

export interface CalendarException {
  id: string;
  date: string;
  /** Empty applies to the whole factory */
  workCenterId?: string;
  hours: number;
  reason: string;
}

export type OpKind = 'PROCESS' | 'INSPECTION' | 'PACKING' | 'SUBCONTRACT';

export interface InspectionSpec {
  parameter: string;
  min?: number;
  max?: number;
  unit: string;
}

export interface RoutingOp {
  seq: number;
  name: string;
  kind: OpKind;
  workCenterId: string;
  setupHrs: number;
  /** HOURS: run hours for one standard batch; UNITS_PER_HOUR: run rate */
  runBasis: 'HOURS' | 'UNITS_PER_HOUR';
  runValue: number;
  workers: number;
  scrapPct: number;
  /** Share of this operation that must finish before the next may start overlapping (0 = wait for all) */
  overlapPct: number;
  instructions: string[];
  supplierId?: string;
  costPerUnit?: number;
  spec?: InspectionSpec[];
}

export interface Routing {
  id: string;
  recipeId: string;
  code: string;
  revision: string;
  version: number;
  effectiveFrom: string;
  status: 'DRAFT' | 'ACTIVE' | 'OBSOLETE';
  /** Routing used only for this customer's orders (configuration-dependent routing) */
  forCustomerId?: string;
  ops: RoutingOp[];
  byProducts: { name: string; pctOfInput: number; valuePerUnit: number }[];
  coProducts: { name: string; sku?: string; pctOfOutput: number }[];
  changeNote: string;
  history: HistoryEntry[];
}

/** Planning parameters per recipe (finished product). */
export interface PlanParams {
  recipeId: string;
  minBatch: number;
  maxBatch: number;
  orderMultiple: number;
  /** Demand time fence: inside it only firm sales orders count */
  dtfDays: number;
  /** Planning time fence: inside it planned batches are frozen for everyone but the manager */
  ptfDays: number;
  safetyStock: number;
  expectedYieldPct: number;
  /** Make-to-order products get a blendsheet the moment their sales order is approved */
  mto: boolean;
}

export interface CostOptions {
  material: boolean;
  labour: boolean;
  burden: boolean;
  subcontract: boolean;
  scrap: boolean;
}

export interface CostRollup {
  material: number;
  labour: number;
  indirectLabour: number;
  machine: number;
  burden: number;
  setup: number;
  subcontract: number;
  total: number;
  perUnit: number;
  yieldFactor: number;
  hours: number;
}

export interface StandardCost {
  recipeId: string;
  routingId?: string;
  at: string;
  by: string;
  qty: number;
  perUnit: number;
  rollup: CostRollup;
  opts: CostOptions;
}

/* ------------------------------------------------------------------ */
/* Batch (work order) extensions kept beside the operations batch      */
/* ------------------------------------------------------------------ */

export interface LabourEntry {
  id: string;
  employee: string;
  hours: number;
  workCenterId: string;
  date: string;
  by: string;
}

export interface BatchExt {
  batchId: string;
  routingId?: string;
  workCenterId?: string;
  /** Pinned schedule date (rescheduling); otherwise the batch date */
  pinDate?: string;
  blendsheetId?: string;
  labour: LabourEntry[];
  stops: { from: string; to?: string; reason: string }[];
  startedAt?: string;
  finishedAt?: string;
  reserved: { sku: string; qty: number }[];
  journalIds: string[];
  rework?: { hours: number; extra: { sku: string; qty: number }[]; recovered: number; cost: number; at: string; by: string; note: string };
  disassembled?: number;
  allocatedOrder?: { orderNumber: string; qty: number };
  workOrderId?: string;
  subcontractIds: string[];
  byProducts?: { name: string; qty: number }[];
  history: HistoryEntry[];
}

/** Multi-line production work order: one header, a batch per line. */
export interface ProdOrder {
  id: string;
  number: string;
  date: string;
  forOrder?: string;
  lines: { recipeId: string; qty: number; batchId: string }[];
  createdBy: string;
  notes: string;
}

export interface SubcontractOrder {
  id: string;
  number: string;
  batchId: string;
  batchNumber: string;
  opName: string;
  supplierId: string;
  qty: number;
  cost: number;
  poId?: string;
  poNumber?: string;
  dispatchNote: string;
  status: 'SENT' | 'RETURNED';
  at: string;
}

export interface RateSchedule {
  id: string;
  recipeId: string;
  workCenterId: string;
  qtyPerDay: number;
  from: string;
  to: string;
  batchIds: string[];
  by: string;
}

export interface Forecast {
  sku: string;
  month: string;
  qty: number;
  seasonalIndex: number;
}

/** What-if copy of capacity, calendar and job moves; never touches live data until promoted. */
export interface Scenario {
  id: string;
  name: string;
  by: string;
  at: string;
  workCenters: WorkCenter[];
  calendar: CalendarException[];
  moves: { jobId: string; date?: string; workCenterId?: string }[];
  promoted?: string;
}

/** Production stock movements that are not in the warehouse ledger (lots, blends, by-products). */
export interface ProdMove {
  id: string;
  date: string;
  item: string;
  qty: number;
  unit: string;
  kind: 'LOT_ISSUE' | 'BLEND_OUTPUT' | 'BY_PRODUCT' | 'DISASSEMBLY' | 'REWORK_ISSUE' | 'REWORK_OUTPUT' | 'SUBCONTRACT_OUT';
  ref: string;
  by: string;
}

export interface BlendingState {
  lots: TeaLot[];
  standards: BlendStandard[];
  blendsheets: Blendsheet[];
  plans: BlendPlan[];
  workCenters: WorkCenter[];
  calendar: CalendarException[];
  routings: Routing[];
  params: PlanParams[];
  standardCosts: StandardCost[];
  ext: Record<string, BatchExt>;
  prodOrders: ProdOrder[];
  subcontracts: SubcontractOrder[];
  rates: RateSchedule[];
  forecasts: Forecast[];
  scenarios: Scenario[];
  moves: ProdMove[];
  /** Sales orders already turned into make-to-order blendsheets */
  seenOrders: string[];
  sequence: Record<string, number>;
}
