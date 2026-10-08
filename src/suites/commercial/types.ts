import type { HistoryEntry } from '../finance/types';
import type { Charge, NoteEntry, PriceHistoryEntry, Release, TradeState } from './tradeTypes';

export type ComRole = 'OFFICER' | 'STOREKEEPER' | 'MANAGER' | 'DIRECTOR';

export interface ComActor {
  role: ComRole;
  name: string;
  title: string;
}

export type ProductKind = 'GOODS' | 'SERVICE' | 'MATERIAL';

export interface Product {
  sku: string;
  name: string;
  kind: ProductKind;
  category: string;
  unit: string;
  price: number;
  cost: number;
  stock: number;
  reorderLevel: number;
  reorderQty: number;
  vatable: boolean;
  /** Finance account the item is sold to (goods, services) or bought to (materials). */
  account: string;
  preferredSupplier?: string;
  /** Barcode (UPC/EAN) of the selling unit, plus barcodes of other pack variants. */
  upc?: string;
  barcodes?: string[];
  /** Provisional part numbers are created from quotes/orders and activated by a manager. */
  status?: 'ACTIVE' | 'PROVISIONAL' | 'INACTIVE';
  priceHistory?: PriceHistoryEntry[];
  /** Alternative selling units, e.g. a kg price for a carton item. */
  uomPrices?: { uom: string; factor: number; price: number }[];
  substitutes?: string[];
  complements?: { sku: string; script: string }[];
  imageUrl?: string;
  weightKg?: number;
  /** Certificate needed to export it, e.g. an MRL certificate. */
  requiresCert?: string;
  attributes?: { grade?: string; garden?: string; origin?: string; season?: string; packSize?: string };
}

export interface Line {
  id: string;
  sku: string;
  description: string;
  qty: number;
  price: number;
  discountPct: number;
  /** Price rule the pricing engine applied, and the net unit price it gave. */
  ruleId?: string;
  ruleLabel?: string;
  rulePrice?: number;
  uom?: string;
  note?: string;
  /** Quote lines can expire before the quotation. */
  validUntil?: string;
  customerCode?: string;
  shipToId?: string;
  termId?: string;
  configId?: string;
  directShip?: boolean;
  requestedDate?: string;
}

export interface ComApproval {
  by: string;
  role: ComRole;
  at: string;
}

interface Workflow {
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'VOID';
  preparedBy: string;
  approvals: ComApproval[];
  history: HistoryEntry[];
}

/* ---------------- Trading & sales ---------------- */

export interface Quotation {
  id: string;
  number: string;
  customerId: string;
  date: string;
  validUntil: string;
  lines: Line[];
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'LOST' | 'EXPIRED' | 'CANCELLED';
  preparedBy: string;
  history: HistoryEntry[];
  notes: string;
  lostReason?: string;
  orderId?: string;
  opportunityId?: string;
  leadSource?: string;
  orderClass?: string;
  sourceCode?: string;
  reasonCodeId?: string;
  noteLog?: NoteEntry[];
  copiedFrom?: string;
}

export interface OrderLine extends Line {
  delivered: number;
  invoiced: number;
  releases?: Release[];
}

export interface SalesOrder extends Workflow {
  id: string;
  number: string;
  customerId: string;
  date: string;
  requiredBy: string;
  customerRef: string;
  deliveryAddress: string;
  lines: OrderLine[];
  quotationId?: string;
  invoices: { id?: string; number: string }[];
  closed?: boolean;
  notes: string;
  leadSource?: string;
  orderClass?: string;
  sourceCode?: string;
  incoterm?: string;
  namedPlace?: string;
  priority?: 1 | 2 | 3;
  hold?: { reasonCodeId: string; note: string; by: string; at: string };
  charges?: Charge[];
  channel?: 'DIRECT' | 'WEB' | 'POS' | 'AUCTION';
  segment?: 'B2B' | 'B2C';
  paymentMode?: 'ACCOUNT' | 'CASH';
  /** Walk-in buyer on a cash sale or a one-time customer. */
  oneTimeName?: string;
  orderFromId?: string;
  billToId?: string;
  shipToId?: string;
  oneTimeBillTo?: string;
  oneTimeShipTo?: string;
  contactName?: string;
  termId?: string;
  revision?: number;
  noteLog?: NoteEntry[];
  copiedFrom?: string;
  directShipPOs?: string[];
}

export interface Delivery {
  id: string;
  number: string;
  orderId: string;
  date: string;
  lines: { lineId: string; qty: number; warehouseId?: string }[];
  vehicle: string;
  driver: string;
  dispatchedBy: string;
  status: 'DISPATCHED' | 'DELIVERED';
  receivedBy?: string;
  deliveredAt?: string;
  /** Quantities the customer signed for, when different from what was sent. */
  received?: { lineId: string; qty: number; damaged: number }[];
  /** Customer's service rating 1–5 captured with proof of delivery. */
  rating?: number;
  bol?: { carrier: string; seal: string; packages: number; grossKg: number };
  /** Supplier delivered straight to the customer (direct ship). */
  directShipPo?: string;
}

/* ---------------- Procurement ---------------- */

export interface ReqLine {
  id: string;
  sku: string;
  description: string;
  qty: number;
  estPrice: number;
}

export interface SupplierQuote {
  supplierId: string;
  prices: Record<string, number>;
  leadDays: number;
  notes: string;
  receivedAt: string;
}

export interface Requisition extends Workflow {
  id: string;
  number: string;
  department: string;
  requestedBy: string;
  date: string;
  neededBy: string;
  justification: string;
  lines: ReqLine[];
  quotes: SupplierQuote[];
  awardedTo?: string;
  poId?: string;
}

export interface POLine extends Line {
  received: number;
  billed: number;
}

export interface PurchaseOrder extends Workflow {
  id: string;
  number: string;
  supplierId: string;
  date: string;
  expected: string;
  lines: POLine[];
  requisitionId?: string;
  sentAt?: string;
  bills: { id?: string; number: string }[];
  closed?: boolean;
  notes: string;
  /** Direct-ship purchase order raised from a sales order: the supplier delivers to the customer. */
  salesOrderId?: string;
  directShip?: boolean;
  shipTo?: string;
}

export interface GoodsReceipt {
  id: string;
  number: string;
  poId: string;
  date: string;
  lines: { lineId: string; qty: number; rejected: number }[];
  receivedBy: string;
  deliveryNote: string;
  notes: string;
}

/* ---------------- Business development ---------------- */

export type Stage = 'LEAD' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';

export interface Opportunity {
  id: string;
  name: string;
  customerId?: string;
  prospect?: string;
  contact: string;
  owner: string;
  stage: Stage;
  value: number;
  expectedClose: string;
  source: string;
  created: string;
  stageChanged: string;
  nextStep: string;
  lostReason?: string;
  quotationId?: string;
  history: HistoryEntry[];
}

export interface Activity {
  id: string;
  opportunityId: string;
  type: 'CALL' | 'MEETING' | 'EMAIL' | 'VISIT' | 'DEMO';
  subject: string;
  due: string;
  done: boolean;
  owner: string;
  outcome?: string;
  /** Customer-level activities (follow-ups, buyer visits) not tied to a deal. */
  customerId?: string;
  visitScore?: number;
  visitReport?: string;
}

export interface CommercialState extends TradeState {
  actor: ComActor;
  products: Product[];
  quotations: Quotation[];
  orders: SalesOrder[];
  deliveries: Delivery[];
  requisitions: Requisition[];
  purchaseOrders: PurchaseOrder[];
  receipts: GoodsReceipt[];
  opportunities: Opportunity[];
  activities: Activity[];
  sequence: Record<string, number>;
}
