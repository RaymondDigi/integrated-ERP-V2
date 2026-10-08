import type { ComActor, GoodsReceipt, PurchaseOrder, Requisition } from '../../types';

/**
 * Seams between the core procurement flow (commercial store: requisitions, purchase orders, receipts, bills)
 * and the procurement extension (budgets, contracts, supplier status, approval rules, lots). The extension
 * provider fills these in on every render with its latest state; the core store calls them at the points
 * below. Each check returns the reason an action is refused, or null.
 */
export type PrcCheck =
  | { action: 'saveRequisition' | 'submitRequisition'; req: Pick<Requisition, 'lines' | 'department'> & { id?: string }; actor: ComActor }
  | { action: 'approve'; kind: 'requisitions' | 'purchaseOrders'; doc: Requisition | PurchaseOrder; value: number; actor: ComActor }
  | { action: 'savePO' | 'submitPO' | 'sendPO'; po: Pick<PurchaseOrder, 'supplierId' | 'lines'> & { id?: string; number?: string }; actor: ComActor }
  | { action: 'award'; supplierId: string; req: Requisition; actor: ComActor }
  | { action: 'bill'; po: PurchaseOrder; actor: ComActor };

export interface PrcHooks {
  check?: (c: PrcCheck) => string | null;
  /** Roles that must approve, in order, when a configured approval rule applies; null keeps the built-in thresholds. */
  approvalPlan?: (kind: 'requisitions' | 'purchaseOrders', doc: Requisition | PurchaseOrder, value: number) => string[] | null;
  /** A reason the order may be approved straight away (e.g. fully on contract), or null. */
  autoApprove?: (po: PurchaseOrder) => string | null;
  /** Stock units per purchase unit for an item (order vs consumption unit of measure). */
  unitFactor?: (sku: string) => number;
  /** Contract (LTA) price for a supplier and item, used when ordering without a quote. */
  contractPrice?: (supplierId: string, sku: string) => number | null;
  after?: (event: 'received', grn: GoodsReceipt, po: PurchaseOrder) => void;
  afterReject?: (kind: 'requisitions' | 'purchaseOrders', doc: Requisition | PurchaseOrder, note: string) => void;
}

export const prcHooks: PrcHooks = {};
