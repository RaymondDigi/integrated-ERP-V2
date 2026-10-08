import type { HistoryEntry } from '../finance/types';

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
}

export interface Line {
  id: string;
  sku: string;
  description: string;
  qty: number;
  price: number;
  discountPct: number;
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
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'LOST' | 'EXPIRED';
  preparedBy: string;
  history: HistoryEntry[];
  notes: string;
  lostReason?: string;
  orderId?: string;
  opportunityId?: string;
}

export interface OrderLine extends Line {
  delivered: number;
  invoiced: number;
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
}

export interface Delivery {
  id: string;
  number: string;
  orderId: string;
  date: string;
  lines: { lineId: string; qty: number }[];
  vehicle: string;
  driver: string;
  dispatchedBy: string;
  status: 'DISPATCHED' | 'DELIVERED';
  receivedBy?: string;
  deliveredAt?: string;
}

/* ---------------- Procurement ---------------- */

export interface ReqLine {
  id: string;
  sku: string;
  description: string;
  qty: number;
  estPrice: number;
  /** Procurement: unit, specification and service type for free-text and service lines */
  uom?: string;
  spec?: string;
  serviceType?: string;
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
  /** Split awards: one purchase order per supplier for the lines it won */
  awards?: { supplierId: string; poId: string; lineIds: string[]; eventId?: string }[];
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
}

export interface CommercialState {
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
