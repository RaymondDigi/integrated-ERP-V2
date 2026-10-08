import type { HistoryEntry } from '../../../finance/types';
import type { ESignature } from '../../../../platform/Widgets';
import type { ComRole } from '../../types';

/**
 * Procurement extension: sourcing events, supplier management, contracts, invoice matching, inventory control
 * and planning. Kept beside the core requisition → PO → GRN → bill flow (commercial store) and linked to it by
 * document ids, so the core records stay exactly as they were.
 */

export type Approver = { by: string; role: ComRole | 'SUPPLIER'; at: string; note?: string };

/* ================================================================== */
/* Sourcing events (RFI / RFP / RFQ / auctions)                         */
/* ================================================================== */

export type EventKind = 'RFI' | 'RFP' | 'RFQ' | 'AUCTION' | 'REVERSE_AUCTION';
export type EventStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'EVALUATION' | 'AWARDED' | 'CANCELLED';

export interface EventLine {
  id: string;
  sku?: string;
  description: string;
  qty: number;
  uom: string;
  spec?: string;
  /** Services are sourced too: e.g. transport, warehousing, tea tasting */
  serviceType?: string;
  /** Where the line came from, so the award orders against the requisition */
  reqId?: string;
  reqLineId?: string;
}
export interface EventLot {
  id: string;
  name: string;
  lines: EventLine[];
}

export type QuestionType = 'YESNO' | 'SCORE' | 'TEXT' | 'NUMBER';
export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  weight: number;
  required: boolean;
}
export interface QSection {
  id: string;
  name: string;
  weight: number;
  questions: Question[];
}

export interface CostComponents {
  freight: number;
  duty: number;
  other: number;
}

export interface EventResponse {
  id: string;
  supplierId: string;
  revision: number;
  submittedAt: string;
  submittedBy: string;
  /** A buyer keyed the response for the supplier */
  onBehalf: boolean;
  prices: Record<string, number>;
  leadDays: number;
  costs: CostComponents;
  answers: Record<string, string>;
  /** Expressive bidding: % off the whole lot if all its lines are won together */
  bundleDiscountPct?: number;
  /** Volume tier: % off a line above a quantity */
  tiers?: { lineId: string; minQty: number; pct: number }[];
  notes: string;
  valid: boolean;
  invalidReason?: string;
}

export interface Evaluation {
  id: string;
  evaluator: string;
  supplierId: string;
  scores: Record<string, number>;
  comment: string;
  at: string;
}

export interface EventMessage {
  id: string;
  from: string;
  side: 'BUYER' | 'SUPPLIER';
  supplierId?: string;
  text: string;
  at: string;
  /** Broadcast to every invited supplier, or private to one */
  public: boolean;
}

export interface AuctionSettings {
  start: string;
  end: string;
  /** Minutes added when a bid lands inside the window */
  extendMinutes: number;
  extendWindowMinutes: number;
  minDecrementPct: number;
  showRank: 'NONE' | 'RANK' | 'BEST_PRICE';
  reservePrice?: number;
  extensions: number;
}
export interface Bid {
  id: string;
  supplierId: string;
  amount: number;
  at: string;
  by: string;
}

export interface EventAward {
  supplierId: string;
  lineIds: string[];
  value: number;
  poIds: string[];
  contractId?: string;
}

export interface SourcingEvent {
  id: string;
  number: string;
  title: string;
  kind: EventKind;
  category: string;
  businessUnit: string;
  status: EventStatus;
  opens: string;
  closes: string;
  qaDeadline?: string;
  owner: string;
  lots: EventLot[];
  invited: { supplierId: string; at: string; by: string; reminded?: number }[];
  responses: EventResponse[];
  questionnaire: QSection[];
  priceWeight: number;
  panel: string[];
  evaluations: Evaluation[];
  messages: EventMessage[];
  auction?: AuctionSettings;
  bids: Bid[];
  awards: EventAward[];
  convertedFrom?: string;
  convertedTo?: string;
  templateId?: string;
  terms: string;
  history: HistoryEntry[];
}

export interface RfxTemplate {
  id: string;
  name: string;
  kind: EventKind;
  category: string;
  lots: EventLot[];
  questionnaire: QSection[];
  terms: string;
}

/* ================================================================== */
/* Suppliers: onboarding, profile, documents, updates, scorecards       */
/* ================================================================== */

export type SupplierStatus = 'PROSPECT' | 'PENDING_APPROVAL' | 'APPROVED' | 'SUSPENDED' | 'TERMINATED' | 'REJECTED';
export type SupplierType = 'GOODS' | 'SERVICES' | 'TEA_PRODUCER' | 'BROKER' | 'LOGISTICS' | 'IMPORT_EXPORT';
export type IdType = 'KRA_PIN' | 'NATIONAL_ID' | 'PASSPORT' | 'FOREIGN_TAX_ID';
export type PayMethod = 'EFT' | 'RTGS' | 'M-PESA' | 'CHEQUE' | 'CASH';
export type DocType = 'TAX_COMPLIANCE' | 'INSURANCE' | 'CERT' | 'REG' | 'CR12' | 'BANK_LETTER' | 'TEA_BOARD_LICENCE';

export interface SupplierDocument {
  id: string;
  type: DocType;
  number: string;
  issued: string;
  expiry: string;
  issuer: string;
  verified: boolean;
}

export interface BankDetails {
  bank: string;
  branch: string;
  account: string;
  swift?: string;
}

export interface UpdateRequest {
  id: string;
  formCategory: string;
  status: 'SENT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  sentAt: string;
  due: string;
  sentBy: string;
  changes: Partial<SupplierCore>;
  comments: HistoryEntry[];
}

/** Fields a supplier form can ask for (and the form configuration can make mandatory). */
export interface SupplierCore {
  name: string;
  idType: IdType;
  idNumber: string;
  email: string;
  phone: string;
  contactPerson: string;
  country: string;
  region: string;
  address: string;
  paymentMethod: PayMethod;
  paymentTerms: number;
  bank: BankDetails;
  taxonomy: string[];
}

export interface SupplierProfile extends SupplierCore {
  id: string;
  /** Finance party once approved */
  partyId?: string;
  number: string;
  supplierType: SupplierType;
  category: string;
  parentId?: string;
  logo?: string;
  status: SupplierStatus;
  source: 'INTERNAL' | 'PORTAL' | 'REQUISITIONER' | 'MIGRATION';
  termsAccepted?: string;
  documents: SupplierDocument[];
  verification: Record<string, boolean>;
  updateRequests: UpdateRequest[];
  approvals: Approver[];
  preparedBy: string;
  portalLogin?: { username: string; createdAt: string; active: boolean };
  history: HistoryEntry[];
}

export interface SupplierFormConfig {
  category: string;
  required: (keyof SupplierCore)[];
  documents: DocType[];
}

export interface SupplierEvaluation {
  id: string;
  supplierId: string;
  period: string;
  scores: { quality: number; delivery: number; price: number; service: number; compliance: number };
  evaluator: string;
  comment: string;
  at: string;
}

export interface SupplierCatalogueItem {
  id: string;
  supplierId: string;
  sku?: string;
  supplierSku: string;
  description: string;
  uom: string;
  price: number;
  leadDays: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  decidedBy?: string;
}

export interface Asn {
  id: string;
  number: string;
  poId: string;
  supplierId: string;
  shipDate: string;
  eta: string;
  carrier: string;
  vehicle: string;
  lines: { lineId: string; qty: number; lot?: string }[];
  status: 'SUBMITTED' | 'RECEIVED' | 'CANCELLED';
  at: string;
}

/* ================================================================== */
/* Contracts                                                           */
/* ================================================================== */

export type ContractType = 'FRAMEWORK' | 'SERVICE' | 'PRODUCT' | 'MASTER' | 'LTA';
export type ContractStatus = 'DRAFT' | 'APPROVAL' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED';

export interface ContractItem {
  sku: string;
  description: string;
  unitPrice: number;
  uom: string;
  qtyCap?: number;
}
export interface ContractSite {
  site: string;
  address: string;
  rateAdjPct: number;
  terms: string;
}
export interface ContractVersion {
  n: number;
  body: string;
  by: string;
  at: string;
  note: string;
}

export interface Contract {
  id: string;
  number: string;
  title: string;
  supplierId: string;
  type: ContractType;
  start: string;
  end: string;
  valueCap: number;
  items: ContractItem[];
  sites: ContractSite[];
  customFields: Record<string, string>;
  status: ContractStatus;
  version: number;
  versions: ContractVersion[];
  comments: { id: string; by: string; at: string; text: string; internal: boolean }[];
  signatures: ESignature[];
  risks: { id: string; text: string; level: 'LOW' | 'MEDIUM' | 'HIGH'; mitigation: string }[];
  approvals: Approver[];
  preparedBy: string;
  eventId?: string;
  templateId?: string;
  retentionYears: number;
  access: 'ALL' | 'PROCUREMENT' | 'MANAGEMENT';
  archived?: boolean;
  history: HistoryEntry[];
}

export interface ContractTemplate {
  id: string;
  name: string;
  type: ContractType;
  body: string;
}
export interface Clause {
  id: string;
  title: string;
  category: string;
  body: string;
}

/* ================================================================== */
/* Approval rules (configurable chains)                                 */
/* ================================================================== */

export type RuleDoc = 'REQUISITION' | 'PO' | 'CONTRACT' | 'SUPPLIER' | 'SUPPLIER_UPDATE' | 'CATALOGUE' | 'INVOICE_HOLD' | 'STORES_ISSUE' | 'DISPOSAL';
export interface RuleStep {
  role: ComRole;
  kind: 'APPROVE' | 'NOTIFY';
}
export interface ApprovalRule {
  id: string;
  name: string;
  doc: RuleDoc;
  minValue: number;
  supplierType?: SupplierType;
  category?: string;
  steps: RuleStep[];
  active: boolean;
}
export interface AdHocStep {
  id: string;
  /** e.g. "PO:po12" or "REQUISITION:rq3" */
  docRef: string;
  name: string;
  kind: 'APPROVE' | 'NOTIFY';
  addedBy: string;
  at: string;
  doneAt?: string;
  note?: string;
}

/* ================================================================== */
/* Accounts payable: invoice matching, holds, notes, currency           */
/* ================================================================== */

export interface Tolerance {
  id: string;
  /** DEFAULT, a supplier party id or a category name */
  scope: string;
  mode: 'TWO_WAY' | 'THREE_WAY';
  pricePct: number;
  qtyPct: number;
  amount: number;
}

export interface InvoiceLine {
  id: string;
  poLineId?: string;
  description: string;
  qty: number;
  price: number;
  account: string;
  vat: boolean;
}

export interface Variance {
  lineId: string;
  description: string;
  kind: 'QTY' | 'PRICE' | 'AMOUNT' | 'NO_RECEIPT' | 'NOT_ON_PO';
  expected: number;
  actual: number;
  within: boolean;
}

export interface SupplierInvoice {
  id: string;
  number: string;
  supplierId: string;
  supplierRef: string;
  poId?: string;
  date: string;
  received: string;
  currency: string;
  fxRate: number;
  kind: 'STANDARD' | 'ADVANCE';
  lines: InvoiceLine[];
  charges: { type: 'SHIPPING' | 'HANDLING' | 'OTHER'; amount: number }[];
  controlTotal: number;
  advanceApplied: number;
  creditApplied: number;
  source: 'INTERNAL' | 'SUPPLIER';
  etims?: { cu: string; validatedAt: string; ok: boolean };
  matchMode: 'TWO_WAY' | 'THREE_WAY';
  variances: Variance[];
  status: 'CAPTURED' | 'ON_HOLD' | 'MATCHED' | 'BILLED' | 'REJECTED';
  hold?: { reason: string; by: string; at: string };
  billId?: string;
  billNumber?: string;
  preparedBy: string;
  history: HistoryEntry[];
}

export interface SupplierNote {
  id: string;
  number: string;
  kind: 'CREDIT' | 'DEBIT';
  supplierId: string;
  invoiceId?: string;
  grnRef?: string;
  reason: string;
  amount: number;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'APPLIED' | 'REJECTED';
  preparedBy: string;
  approvals: Approver[];
  history: HistoryEntry[];
}

/* ================================================================== */
/* Inventory control                                                   */
/* ================================================================== */

export interface ItemExt {
  sku: string;
  barcode: string;
  unspsc?: string;
  spec?: string;
  tags: string[];
  purchaseUnit: string;
  /** Stock units in one purchase unit */
  factor: number;
  defaultWarehouse: string;
  defaultBin?: string;
  countEveryDays: number;
  lastCounted?: string;
  abc: 'A' | 'B' | 'C';
  lotTracked: boolean;
  serialTracked: boolean;
  shelfLifeDays?: number;
  active: boolean;
  policy?: string;
}

export type Condition = 'NEW' | 'GOOD' | 'DAMAGED' | 'QUARANTINE' | 'OBSOLETE';

export interface Lot {
  id: string;
  sku: string;
  lot: string;
  serial?: string;
  qty: number;
  warehouse: string;
  bin: string;
  received: string;
  expiry?: string;
  receivedRef: string;
  unitCost: number;
  condition: Condition;
  /** Tea lots: garden, grade, auction sale and invoice */
  garden?: string;
  grade?: string;
  saleNo?: string;
  teaInvoice?: string;
}

export interface WarehouseConfig {
  id: string;
  name: string;
  type: 'STANDARD' | 'QUARANTINE' | 'BONDED' | 'TRANSIT';
  location: string;
  bins: string[];
  /** Mirrors an Operations warehouse */
  ops?: boolean;
  bondNo?: string;
}

export type MoveKind = 'RECEIPT' | 'ISSUE' | 'RETURN' | 'MISC_ISSUE' | 'ADJUSTMENT' | 'CONDITION' | 'TRANSFER' | 'DISPOSAL' | 'RETURN_TO_SUPPLIER' | 'REVERSAL';
export interface InvMove {
  id: string;
  number: string;
  kind: MoveKind;
  date: string;
  sku: string;
  qty: number;
  lotId?: string;
  from?: string;
  to?: string;
  costCentre?: string;
  reason: string;
  value: number;
  by: string;
  status: 'PENDING' | 'POSTED' | 'REJECTED';
  approvedBy?: string;
}

export interface StoresRequisition {
  id: string;
  number: string;
  department: string;
  requestedBy: string;
  date: string;
  warehouse: string;
  plan: 'AUTO' | 'MANUAL';
  lines: { id: string; sku: string; qty: number; issued: number; closed?: boolean }[];
  status: 'SUBMITTED' | 'APPROVED' | 'PICKING' | 'PART_ISSUED' | 'ISSUED' | 'CLOSED' | 'REJECTED';
  assignedTo?: string;
  pickList?: { sku: string; lotId?: string; lot?: string; warehouse: string; bin: string; qty: number }[];
  history: HistoryEntry[];
}

export interface CountSchedule {
  id: string;
  warehouse: string;
  abc: 'A' | 'B' | 'C' | 'ALL';
  everyDays: number;
  lastDone: string;
}

export interface Disposal {
  id: string;
  number: string;
  sku: string;
  lotId?: string;
  qty: number;
  method: 'GENERAL_WASTE' | 'SPECIAL_WASTE' | 'BOARDED';
  reason: string;
  proceeds: number;
  buyer?: string;
  status: 'SUBMITTED' | 'APPROVED' | 'DISPOSED' | 'REJECTED';
  preparedBy: string;
  approvals: Approver[];
  certificate?: string;
  history: HistoryEntry[];
}

/* ================================================================== */
/* Landed cost, clearing & forwarding                                  */
/* ================================================================== */

export interface LandedCost {
  id: string;
  number: string;
  poId: string;
  charges: { id: string; type: 'FREIGHT' | 'DUTY' | 'CLEARING' | 'INSURANCE' | 'LABOUR' | 'OTHER'; amount: number; supplierId: string; ref: string }[];
  allocation: 'VALUE' | 'QTY';
  status: 'DRAFT' | 'POSTED';
  postedBy?: string;
  bills: string[];
  history: HistoryEntry[];
}

export interface ClearanceFile {
  id: string;
  number: string;
  direction: 'IMPORT' | 'EXPORT';
  ownerType: 'OWN' | 'SUBSIDIARY' | 'THIRD_PARTY';
  client: string;
  customerId?: string;
  poId?: string;
  agent: string;
  entryNo: string;
  goods: string;
  milestones: { key: string; label: string; done?: string }[];
  charges: { type: string; amount: number }[];
  feePct: number;
  invoiceId?: string;
  landedCostId?: string;
  history: HistoryEntry[];
}

/* ================================================================== */
/* Planning, reports, settings                                          */
/* ================================================================== */

export interface PlanLine {
  id: string;
  category: string;
  sku?: string;
  description: string;
  department: string;
  qty: number;
  estValue: number;
  quarter: 1 | 2 | 3 | 4;
  method: 'RFQ' | 'RFP' | 'DIRECT' | 'FRAMEWORK' | 'AUCTION';
}
export interface ProcurementPlan {
  year: number;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
  lines: PlanLine[];
  approvals: Approver[];
  history: HistoryEntry[];
}

export interface SavedReport {
  id: string;
  name: string;
  owner: string;
  shared: boolean;
  dataset: 'REQUISITIONS' | 'POS' | 'RECEIPTS' | 'EVENTS' | 'INVOICES' | 'CONTRACTS';
  columns: string[];
  filter: string;
  groupBy?: string;
}

export interface OutputTemplate {
  docType: string;
  title: string;
  footer: string;
  showLogo: boolean;
  language: 'EN' | 'EN_SW';
  showSignatures: boolean;
}

export interface Branding {
  name: string;
  colour: string;
  welcome: string;
  logoText: string;
}

/** Per-requisition and per-PO extras that the core records do not carry. */
export interface ReqExt {
  budgetAccount?: string;
  planLineId?: string;
  eventId?: string;
  customFields: Record<string, string>;
}
export interface POExt {
  currency: string;
  fxRate: number;
  revisions: { n: number; at: string; by: string; reason: string; before: string; after: string; reapproval: boolean }[];
  contractId?: string;
}
export interface GrnExt {
  inspection: Record<string, { checks: string[]; result: 'PASS' | 'FAIL' | 'CONDITIONAL'; note: string }>;
  lots: string[];
  warehouse: string;
  service?: boolean;
  reversed?: { at: string; by: string; reason: string };
  assets?: string[];
}

export interface ProcExtState {
  events: SourcingEvent[];
  rfxTemplates: RfxTemplate[];
  suppliers: SupplierProfile[];
  formConfig: SupplierFormConfig[];
  evaluations: SupplierEvaluation[];
  catalogue: SupplierCatalogueItem[];
  asns: Asn[];
  contracts: Contract[];
  contractTemplates: ContractTemplate[];
  clauses: Clause[];
  rules: ApprovalRule[];
  adHoc: AdHocStep[];
  tolerances: Tolerance[];
  invoices: SupplierInvoice[];
  notes: SupplierNote[];
  fx: Record<string, number>;
  items: ItemExt[];
  lots: Lot[];
  warehouses: WarehouseConfig[];
  moves: InvMove[];
  storesReqs: StoresRequisition[];
  countSchedules: CountSchedule[];
  disposals: Disposal[];
  landed: LandedCost[];
  clearance: ClearanceFile[];
  plan: ProcurementPlan;
  reports: SavedReport[];
  templates: OutputTemplate[];
  branding: Branding;
  signatures: Record<string, ESignature>;
  reqExt: Record<string, ReqExt>;
  poExt: Record<string, POExt>;
  grnExt: Record<string, GrnExt>;
  settings: { backdateDays: number; autoReorder: boolean; autoApproveOnContract: boolean; withholdingVat: boolean; miscIssueLimit: number; contractAlertDays: number; docAlertDays: number };
  /** Supplier the portal is being viewed as */
  portalSupplier: string;
  alertsSent: string[];
  sequence: Record<string, number>;
}
