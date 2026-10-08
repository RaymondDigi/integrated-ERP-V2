import type { HistoryEntry } from '../../finance/types';

/* ------------------------------------------------------------------ */
/* Tea warehousing: locations, lots, handling units and their ledger    */
/* ------------------------------------------------------------------ */

export type Zone = 'GENERAL' | 'QUARANTINE' | 'STUFFING' | 'BONDED';

/** A storage slot inside a godown: block → bay → row. */
export interface StorageLocation {
  id: string;
  warehouseId: string;
  block: string;
  bay: string;
  row: string;
  capacityKg: number;
  zone: Zone;
  active: boolean;
  /** Slotting rule: grade this slot is kept for */
  preferredGrade?: string;
}

export type QcStatus = 'PENDING' | 'PASS' | 'HOLD' | 'FAIL';
/** OWNED = our stock; CONSIGNMENT = supplier-owned until used (VMI); CUSTOMER = held for a buyer (3PL). */
export type Ownership = 'OWNED' | 'CONSIGNMENT' | 'CUSTOMER';

export interface AuctionInfo {
  saleNo: string;
  broker: string;
  catalogueNo?: string;
  status: 'RECEIVED' | 'CATALOGUED' | 'SOLD' | 'UNSOLD' | 'PAID' | 'RELEASED' | 'DELIVERED';
  valuationUsd?: number;
  buyer?: string;
  priceUsd?: number;
  promptDate?: string;
  warrantId?: string;
}

export interface TeaLot {
  id: string;
  lotNo: string;
  garden: string;
  mark: string;
  grade: string;
  invoiceNo: string;
  season: string;
  origin: string;
  /** 'OWN' or a party id */
  owner: string;
  ownership: Ownership;
  supplierId?: string;
  warehouseId: string;
  locationId?: string;
  arrival: string;
  expiry: string;
  bags: number;
  kgPerBag: number;
  /** Net kg still in the warehouse */
  netKg: number;
  declaredKg: number;
  weighedKg?: number;
  costPerKg: number;
  qc: QcStatus;
  qcNote?: string;
  reservedKg: number;
  reservedFor?: string;
  status: 'IN_STOCK' | 'DEPLETED' | 'RELEASED';
  rfid?: string;
  asnId?: string;
  auction?: AuctionInfo;
  attributes?: Record<string, string>;
  history: HistoryEntry[];
}

/** A pallet / stack of bags with its own barcode and RFID tag. */
export interface HandlingUnit {
  id: string;
  code: string;
  lotId: string;
  bags: number;
  kg: number;
  locationId?: string;
  status: 'STORED' | 'PICKED' | 'LOADED' | 'MISSING';
  rfid: string;
}

export type LotMoveKind = 'RECEIPT' | 'PUTAWAY' | 'TRANSFER_POSTING' | 'RESERVE' | 'UNRESERVE' | 'PICK' | 'LOAD' | 'QC' | 'OWNERSHIP' | 'COUNT' | 'RETURN' | 'RELEASE' | 'DELIVERY' | 'CONSUMPTION';

export interface LotMove {
  id: string;
  date: string;
  lotId: string;
  huId?: string;
  kind: LotMoveKind;
  kg: number;
  bags: number;
  from?: string;
  to?: string;
  ref: string;
  by: string;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Labour: tasks and the pool they are balanced across                  */
/* ------------------------------------------------------------------ */

export type TaskType = 'RECEIVE' | 'PUTAWAY' | 'PICK' | 'STUFF' | 'COUNT' | 'QC' | 'DISPATCH';

export interface WarehouseTask {
  id: string;
  number: string;
  type: TaskType;
  ref: string;
  warehouseId: string;
  detail: string;
  minutes: number;
  assignee?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE';
  created: string;
  doneAt?: string;
}

export interface Worker {
  name: string;
  skills: TaskType[];
  shiftMinutes: number;
  warehouseId: string;
}

/* ------------------------------------------------------------------ */
/* Counting                                                             */
/* ------------------------------------------------------------------ */

export interface CountPlan {
  id: string;
  warehouseId: string;
  type: 'ANNUAL' | 'CYCLE';
  /** ABC class of items covered by a cycle count */
  abc: 'A' | 'B' | 'C' | 'ALL';
  everyDays: number;
  lastDone: string;
}

/** Handling-unit physical inventory: scan every HU in the warehouse. */
export interface HuCount {
  id: string;
  number: string;
  warehouseId: string;
  expected: string[];
  scanned: string[];
  status: 'OPEN' | 'SUBMITTED' | 'APPROVED';
  countedBy?: string;
  approvedBy?: string;
  history: HistoryEntry[];
}

/* ------------------------------------------------------------------ */
/* Inbound                                                              */
/* ------------------------------------------------------------------ */

export interface AsnLine {
  garden: string;
  mark: string;
  grade: string;
  invoiceNo: string;
  bags: number;
  kgPerBag: number;
  costPerKg: number;
}

export interface TallyLine {
  invoiceNo: string;
  bagsCounted: number;
  weighedKg: number;
  source: 'SCALE' | 'MANUAL';
}

export interface Signature {
  by: string;
  at: string;
  text: string;
  meaning: string;
}

export interface Asn {
  id: string;
  number: string;
  source: 'AUCTION' | 'FACTORY' | 'PURCHASE';
  from: string;
  owner: string;
  ownership: Ownership;
  warehouseId: string;
  expected: string;
  truck: string;
  saleNo?: string;
  lines: AsnLine[];
  status: 'EXPECTED' | 'ARRIVED' | 'RECEIVED' | 'CANCELLED';
  arrivedAt?: string;
  tally?: { number: string; by: string; at: string; lines: TallyLine[]; signature?: Signature };
  history: HistoryEntry[];
}

export interface YardVisit {
  id: string;
  truck: string;
  trailer?: string;
  container?: string;
  haulier: string;
  purpose: 'DELIVERY' | 'COLLECTION' | 'STUFFING' | 'EMPTY_RETURN';
  ref?: string;
  gateIn: string;
  slot: string;
  gateOut?: string;
  status: 'IN_YARD' | 'AT_DOCK' | 'LEFT';
}

/* ------------------------------------------------------------------ */
/* Outbound                                                             */
/* ------------------------------------------------------------------ */

export interface PickList {
  id: string;
  number: string;
  siId: string;
  siNumber: string;
  warehouseId: string;
  lines: { lotId: string; locationId?: string; bags: number; kg: number; picked: boolean }[];
  status: 'OPEN' | 'PICKED' | 'PACKED';
  history: HistoryEntry[];
}

export type ContainerType = '20GP' | '40GP' | '40HC';

export interface LoadingPlan {
  id: string;
  number: string;
  shipmentId?: string;
  siId?: string;
  ref: string;
  containerType: ContainerType;
  container: string;
  seal: string;
  warehouseId: string;
  lines: { lotId: string; bags: number; kg: number; seq: number }[];
  tareKg: number;
  dunnageKg: number;
  status: 'DRAFT' | 'STUFFED';
  vgm?: { number: string; method: 'METHOD_1' | 'METHOD_2'; grossKg: number; weighedBy: string; scaleRef: string; at: string; signature?: Signature };
  stuffedBy?: string;
  stuffedAt?: string;
  history: HistoryEntry[];
}

export interface Pod {
  deliveryId: string;
  deliveryNumber: string;
  tripNumber?: string;
  receivedBy: string;
  at: string;
  signature: Signature;
  remarks?: string;
}

export interface ReturnAuth {
  id: string;
  number: string;
  customerId: string;
  deliveryRef: string;
  lines: { sku: string; qty: number; price: number }[];
  reason: string;
  status: 'AUTHORISED' | 'RECEIVED' | 'CREDITED' | 'REJECTED';
  warehouseId: string;
  receivedQty?: number;
  creditRef?: string;
  history: HistoryEntry[];
}

/* ------------------------------------------------------------------ */
/* Transport                                                            */
/* ------------------------------------------------------------------ */

export interface Carrier {
  id: string;
  name: string;
  mode: 'ROAD' | 'COURIER' | 'RAIL';
  supplierId?: string;
  rates: { lane: string; perKg: number; minCharge: number }[];
  /** Simulated courier API (FedEx / UPS) */
  api?: boolean;
}

export interface Load {
  id: string;
  number: string;
  lane: string;
  date: string;
  refs: string[];
  kg: number;
  carrierId?: string;
  vehicleId?: string;
  cost: number;
  status: 'PLANNED' | 'TENDERED' | 'IN_TRANSIT' | 'DELIVERED' | 'TURNED_BACK';
  plannedPickup: string;
  actualPickup?: string;
  plannedDelivery: string;
  actualDelivery?: string;
  tracking?: string;
  history: HistoryEntry[];
}

/* ------------------------------------------------------------------ */
/* Billing, auction warrants, printing, schedules, sensors, item setup  */
/* ------------------------------------------------------------------ */

export type TariffActivity = 'HANDLING_IN' | 'STORAGE' | 'HANDLING_OUT' | 'STUFFING';
export interface Tariff {
  activity: TariffActivity;
  basis: 'PER_BAG' | 'PER_KG' | 'PER_TONNE_DAY' | 'PER_CONTAINER';
  rate: number;
}

export interface BillingRun {
  id: string;
  owner: string;
  from: string;
  to: string;
  amount: number;
  invoiceId?: string;
  invoiceNumber?: string;
  by: string;
}

export interface Warrant {
  id: string;
  number: string;
  lotIds: string[];
  holder: string;
  issued: string;
  status: 'ISSUED' | 'ENDORSED' | 'SURRENDERED' | 'CANCELLED';
  history: HistoryEntry[];
}

export interface PrintJob {
  id: string;
  number: string;
  ref: string;
  customerId: string;
  material: 'SACKS' | 'LABELS' | 'STENCIL';
  markings: string;
  qty: number;
  status: 'REQUESTED' | 'PROOF_SENT' | 'APPROVED_BY_CLIENT' | 'PRINTED' | 'REJECTED';
  history: HistoryEntry[];
}

export interface ReportSchedule {
  id: string;
  report: string;
  frequency: 'DAILY' | 'WEEKLY' | 'CONDITION';
  condition?: { metric: 'HOLD_KG' | 'EXPIRING_LOTS' | 'OCCUPANCY_PCT' | 'OPEN_TASKS'; op: '>' | '<'; value: number };
  recipients: string;
  lastRun?: string;
  active: boolean;
}

export interface SensorReading {
  warehouseId: string;
  at: string;
  tempC: number;
  humidity: number;
}

export interface Msds {
  key: string;
  title: string;
  revision: string;
  hazards: string;
  handling: string;
  firstAid: string;
  updated: string;
}

export interface ItemSetup {
  uoms: Record<string, { code: string; factor: number }[]>;
  attributes: Record<string, Record<string, string>>;
  attributeDefs: { key: string; label: string }[];
  msds: Msds[];
}

export interface WarehouseExtState {
  locations: StorageLocation[];
  lots: TeaLot[];
  hus: HandlingUnit[];
  lotMoves: LotMove[];
  tasks: WarehouseTask[];
  workers: Worker[];
  countPlans: CountPlan[];
  huCounts: HuCount[];
  asns: Asn[];
  yard: YardVisit[];
  pickLists: PickList[];
  loadingPlans: LoadingPlan[];
  pods: Pod[];
  returns: ReturnAuth[];
  carriers: Carrier[];
  loads: Load[];
  tariffs: Tariff[];
  billingRuns: BillingRun[];
  warrants: Warrant[];
  printJobs: PrintJob[];
  schedules: ReportSchedule[];
  sensors: SensorReading[];
  setup: ItemSetup;
  sequence: Record<string, number>;
}
