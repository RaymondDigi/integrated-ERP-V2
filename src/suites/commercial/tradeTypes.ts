import type { HistoryEntry } from '../finance/types';
import type { ESignature } from '../../platform/Widgets';
import type { Line } from './types';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

/** A dated note; any number can be added to a quote, order, line or configuration. */
export interface NoteEntry {
  id: string;
  at: string;
  by: string;
  text: string;
  /** Internal notes never print on customer documents. */
  internal: boolean;
}

export interface Address {
  id: string;
  label: string;
  address: string;
  town: string;
  county?: string;
  country: string;
  postalCode?: string;
  contact?: string;
  phone?: string;
  /** Printed on delivery notes and order confirmations. */
  instructions?: string;
  /** Warehouse the goods normally ship from. */
  defaultWarehouse?: string;
  termId?: string;
  /** Freight zone used by the freight calculator. */
  zone?: string;
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  /** Which address it belongs to: 'main', a bill-to id or a ship-to id. */
  scope: string;
}

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

export type PriceScope = 'CUSTOMER' | 'CONTRACT' | 'GROUP' | 'PROMO' | 'EXTERNAL';

export interface PriceListLine {
  sku: string;
  /** Only applies to this unit of measure (blank = any). */
  uom?: string;
  /** Only applies to this attribute value, e.g. a grade or pack size. */
  attr?: string;
  /** Volume break on the line quantity. */
  minQty?: number;
  /** Volume break on the customer's units bought this year, this order included. */
  minAnnualQty?: number;
  /** Either a fixed net price … */
  price?: number;
  /** … or a discount off the list price. */
  discountPct?: number;
  /** Rush premium: when the customer wants it within this many days. */
  maxLeadDays?: number;
  premiumPct?: number;
}

export interface PriceList {
  id: string;
  name: string;
  scope: PriceScope;
  customerId?: string;
  group?: string;
  /** Only for orders shipping to this town or zone. */
  shipTo?: string;
  validFrom: string;
  validTo: string;
  basis: 'ORDER_DATE' | 'SHIP_DATE';
  /** Order-level discount on top of line prices when the order net exceeds minOrderNet. */
  orderDiscountPct?: number;
  minOrderNet?: number;
  lines: PriceListLine[];
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  createdBy: string;
  approvedBy?: string;
  history: HistoryEntry[];
}

export interface PriceHistoryEntry {
  price: number;
  from: string;
  by: string;
  note?: string;
}

export interface PricingSettings {
  /** Pick the lowest of all applicable prices instead of the most specific one. */
  lowestPrice: boolean;
}

/* ------------------------------------------------------------------ */
/* Settings lists                                                      */
/* ------------------------------------------------------------------ */

export type ReasonKind = 'QUOTE_LOST' | 'QUOTE_CANCEL' | 'ORDER_HOLD' | 'ORDER_CANCEL' | 'RMA' | 'CLAIM';

export interface ReasonCode {
  id: string;
  kind: ReasonKind;
  label: string;
  active: boolean;
}

export interface PaymentTerm {
  id: string;
  label: string;
  days: number;
  /** Early-payment discount */
  discountPct: number;
  discountDays: number;
}

export interface FreightRate {
  zone: string;
  perKg: number;
  minCharge: number;
  handling: number;
}

export interface PostalCode {
  code: string;
  town: string;
  county: string;
  country: string;
  zone: string;
}

export interface Campaign {
  code: string;
  name: string;
  channel: 'CATALOGUE' | 'EMAIL' | 'SMS' | 'TRADE_FAIR' | 'RADIO' | 'SOCIAL';
  from: string;
  to: string;
  cost: number;
  owner: string;
}

/* ------------------------------------------------------------------ */
/* Customer master extension                                           */
/* ------------------------------------------------------------------ */

export interface KycTemplate {
  id: string;
  name: string;
  required: boolean;
  docType: string;
  /** Months before the document has to be renewed (0 = never). */
  expiryMonths: number;
  active: boolean;
}

export interface KycRecord {
  itemId: string;
  value: string;
  docName?: string;
  status: 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';
  by?: string;
  verifiedBy?: string;
  at?: string;
  expiry?: string;
  note?: string;
}

export type DocLayout = 'STANDARD' | 'DETAILED' | 'EXPORT';

export interface DocFormat {
  layout: DocLayout;
  language: 'EN' | 'SW';
  showCustomerCodes: boolean;
  showInstructions: boolean;
  footer: string;
}

export interface CustomerProfile {
  customerId: string;
  priceGroup?: string;
  customerClass?: string;
  /** Subsidiary of another customer (group roll-up and follow-up). */
  parentCustomerId?: string;
  contacts: Contact[];
  billTos: Address[];
  shipTos: Address[];
  termId?: string;
  minOrderValue: number;
  minOrderCharge: number;
  /** Orders above this need a manager to cancel. */
  cancelLimit: number;
  restockFeePct: number;
  freightOnBackorders: boolean;
  financeChargeExempt: boolean;
  rating: string;
  /** Upper bounds of the ageing buckets in days, e.g. [30, 60, 90]. */
  agingBuckets: number[];
  /** Credit hold when any invoice is overdue by more than this (0 = no check). */
  maxOverdueDays: number;
  priority: 1 | 2 | 3;
  duplicatePo: 'WARN' | 'BLOCK';
  repriceAtInvoice: boolean;
  regulatory: { licenceNo: string; licenceType: string; expiry: string; restrictedCountries: string[]; certificates: string[] };
  docFormat: DocFormat;
  customerItems: { customerCode: string; sku: string }[];
  kyc: KycRecord[];
  history: HistoryEntry[];
}

export interface OnboardingApplication {
  id: string;
  number: string;
  company: string;
  pin: string;
  contact: string;
  email: string;
  phone: string;
  town: string;
  category: string;
  requestedLimit: number;
  approvedLimit?: number;
  channel: 'PORTAL' | 'OFFICER';
  kyc: KycRecord[];
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
  customerId?: string;
  opportunityId?: string;
  submittedAt: string;
  history: HistoryEntry[];
}

/* ------------------------------------------------------------------ */
/* Orders: charges, releases, templates, change requests, payments     */
/* ------------------------------------------------------------------ */

export type ChargeKind = 'SHIPPING' | 'HANDLING' | 'FREIGHT' | 'MIN_ORDER' | 'OTHER';

export interface Charge {
  id: string;
  kind: ChargeKind;
  description: string;
  amount: number;
  vatable: boolean;
  /** Entered after the goods left (actual freight). */
  postShipment?: boolean;
  invoiced?: boolean;
  auto?: boolean;
}

export interface Release {
  id: string;
  number: string;
  qty: number;
  requestedDate: string;
  shippedDate?: string;
  deliveryId?: string;
}

export interface OrderTemplate {
  id: string;
  name: string;
  customerId: string;
  lines: Line[];
  createdBy: string;
}

export interface ChangeRequest {
  id: string;
  orderId: string;
  customerId: string;
  kind: 'CHANGE' | 'CANCEL';
  note: string;
  status: 'OPEN' | 'DONE' | 'DECLINED';
  at: string;
  decidedBy?: string;
}

export interface PaymentTxn {
  id: string;
  orderId: string;
  method: 'M-PESA' | 'CARD' | 'CASH';
  phone?: string;
  ref: string;
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  at: string;
  receiptId?: string;
  receiptNumber?: string;
}

/* ------------------------------------------------------------------ */
/* Returns, claims and credit memos                                    */
/* ------------------------------------------------------------------ */

export type RmaType = 'STOCK' | 'REPLACEMENT' | 'WARRANTY' | 'SERVICE';

export interface RmaLine {
  lineId: string;
  qty: number;
  reasonCodeId: string;
  disposition: 'RESTOCK' | 'SCRAP' | 'REPAIR';
  received?: number;
}

export interface Rma {
  id: string;
  number: string;
  orderId: string;
  customerId: string;
  type: RmaType;
  lines: RmaLine[];
  feePct: number;
  status: 'REQUESTED' | 'APPROVED' | 'RECEIVED' | 'CREDITED' | 'REJECTED' | 'CLOSED';
  requestedBy: string;
  /** Electronic receiving document for the warehouse. */
  receivingNo?: string;
  creditId?: string;
  replacementOrderId?: string;
  /** Auction tea replacement: the lot bought to replace the faulty tea. */
  replacementLot?: string;
  history: HistoryEntry[];
}

export interface Claim {
  id: string;
  number: string;
  deliveryId: string;
  orderId: string;
  customerId: string;
  lines: { lineId: string; short: number; damaged: number }[];
  reasonCodeId: string;
  status: 'OPEN' | 'APPROVED' | 'REJECTED';
  creditId?: string;
  history: HistoryEntry[];
}

export interface CreditMemo {
  id: string;
  number: string;
  customerId: string;
  orderId?: string;
  source: string;
  date: string;
  lines: { description: string; qty: number; price: number; vatable: boolean }[];
  fee: number;
  net: number;
  vat: number;
  total: number;
  status: 'OPEN' | 'APPLIED';
  by: string;
}

/* ------------------------------------------------------------------ */
/* Tea: auctions, tasting, samples, blends                             */
/* ------------------------------------------------------------------ */

export interface Bid {
  customerId: string;
  /** US dollars per kg, as traded at the Mombasa auction. */
  price: number;
  at: string;
  by: string;
}

export interface AuctionLot {
  lotNo: string;
  invoiceNo: string;
  garden: string;
  grade: string;
  packages: number;
  netKg: number;
  /** Broker valuation, USD/kg */
  valuation: number;
  reserve: number;
  bids: Bid[];
  hammerPrice?: number;
  buyerId?: string;
  status: 'OPEN' | 'SOLD' | 'UNSOLD' | 'WITHDRAWN';
  orderId?: string;
  tastingScore?: number;
}

export interface AuctionSale {
  id: string;
  saleNo: string;
  date: string;
  centre: string;
  broker: string;
  fxRate: number;
  status: 'CATALOGUED' | 'OPEN' | 'CLOSED';
  source: 'MANUAL' | 'EATTA_IMPORT';
  lots: AuctionLot[];
}

export interface TastingRecord {
  id: string;
  ref: string;
  saleId?: string;
  garden: string;
  grade: string;
  date: string;
  taster: string;
  scores: { appearance: number; infusion: number; liquor: number; body: number; brightness: number };
  remarks: string;
  /** Taster's valuation, USD/kg */
  valuation: number;
}

export interface SampleDispatch {
  id: string;
  number: string;
  recipient: string;
  recipientType: 'BROKER' | 'BUYER' | 'CUSTOMER';
  lines: { sku: string; qty: number; lotNo?: string }[];
  reprint: boolean;
  status: 'DISPATCHED' | 'RECEIVED';
  courier: string;
  by: string;
  date: string;
}

export interface BlendComponent {
  grade: string;
  origin: string;
  pct: number;
  /** KES per kg */
  costPerKg: number;
}

export interface BlendConfig {
  id: string;
  number: string;
  name: string;
  customerId?: string;
  attributes: { grade: string; origin: string; packSize: string; flavour: string };
  components: BlendComponent[];
  packaging: { sku: string; qtyPerUnit: number }[];
  /** kg of tea per selling unit */
  kgPerUnit: number;
  line: string;
  batchSize: number;
  hoursPerBatch: number;
  marginPct: number;
  unitCost: number;
  unitPrice: number;
  notes: NoteEntry[];
  createdBy: string;
  at: string;
}

/* ------------------------------------------------------------------ */
/* Contracts, feedback, portal                                         */
/* ------------------------------------------------------------------ */

export interface ContractTemplate {
  id: string;
  name: string;
  clauses: string[];
  steps: { name: string; owner: string; external: boolean; days: number }[];
}

export interface ContractStep {
  name: string;
  owner: string;
  external: boolean;
  due: string;
  done: boolean;
  doneAt?: string;
  by?: string;
  docName?: string;
}

export interface Contract {
  id: string;
  number: string;
  customerId: string;
  templateId: string;
  title: string;
  clauses: string[];
  start: string;
  end: string;
  value: number;
  priceListId?: string;
  status: 'DRAFT' | 'REVIEW' | 'SENT' | 'SIGNED' | 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
  steps: ContractStep[];
  signatures: (ESignature & { party: 'COMPANY' | 'CUSTOMER' })[];
  preparedBy: string;
  approvedBy?: string;
  expiryAlerted?: boolean;
  history: HistoryEntry[];
}

export interface Feedback {
  id: string;
  number: string;
  customerId: string;
  type: 'COMPLIMENT' | 'COMPLAINT' | 'SUGGESTION';
  channel: 'PHONE' | 'EMAIL' | 'VISIT' | 'PORTAL' | 'SURVEY';
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  subject: string;
  owner: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  at: string;
  slaDue: string;
  resolvedAt?: string;
  resolution?: string;
  rating?: number;
  orderId?: string;
  history: HistoryEntry[];
}

export interface SurveyResponse {
  id: string;
  customerId: string;
  date: string;
  nps: number;
  csat: number;
  comment: string;
}

export interface PortalEvent {
  id: string;
  at: string;
  customerId: string;
  kind: 'LOGIN' | 'CATALOGUE' | 'STOCK_INQUIRY' | 'ORDER' | 'ORDER_STATUS' | 'CHANGE_REQUEST' | 'BID' | 'PAYMENT' | 'FEEDBACK' | 'APPLICATION';
  ref?: string;
  channel: 'WEB' | 'MOBILE';
}

/** Everything Trading and Business Development added on top of the original commercial state. */
export interface TradeState {
  priceLists: PriceList[];
  pricing: PricingSettings;
  reasonCodes: ReasonCode[];
  paymentTerms: PaymentTerm[];
  freightRates: FreightRate[];
  campaigns: Campaign[];
  kycTemplates: KycTemplate[];
  profiles: CustomerProfile[];
  applications: OnboardingApplication[];
  templates: OrderTemplate[];
  changeRequests: ChangeRequest[];
  payments: PaymentTxn[];
  rmas: Rma[];
  claims: Claim[];
  credits: CreditMemo[];
  auctions: AuctionSale[];
  tastings: TastingRecord[];
  samples: SampleDispatch[];
  blends: BlendConfig[];
  contractTemplates: ContractTemplate[];
  contracts: Contract[];
  feedback: Feedback[];
  surveys: SurveyResponse[];
  portalEvents: PortalEvent[];
  /** Customer the simulated portal is signed in as. */
  portalCustomerId: string;
}
