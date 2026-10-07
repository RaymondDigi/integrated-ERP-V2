import { addDays, daysBetween, kes, round2, TODAY, VAT_RATE } from '../finance/engine';
import type { Party } from '../finance/types';
import type { ComActor, ComRole, CommercialState, Line, Opportunity, Product, PurchaseOrder, Requisition, SalesOrder, Stage } from './types';

/** Above this, a second approval from the Finance Director is needed. */
export const DIRECTOR_LIMIT = 1_000_000;
/** Discounts above this need a manager's approval. */
export const DISCOUNT_LIMIT = 10;

export const ROLE_LABEL: Record<ComRole, string> = {
  OFFICER: 'Commercial Officer',
  STOREKEEPER: 'Stores & Dispatch',
  MANAGER: 'Commercial Manager',
  DIRECTOR: 'Finance Director'
};

export const lineNet = (l: Pick<Line, 'qty' | 'price' | 'discountPct'>) => round2(l.qty * l.price * (1 - (l.discountPct || 0) / 100));

/** Net, VAT and total for a set of lines; exports to non-resident customers are zero-rated. */
export const totals = (lines: Line[], products: Product[], party?: Party) => {
  const zero = party?.pin === 'NON-RESIDENT';
  let net = 0;
  let vat = 0;
  for (const l of lines) {
    const amount = lineNet(l);
    net += amount;
    const p = products.find((x) => x.sku === l.sku);
    if (!zero && (p ? p.vatable : true)) vat += round2(amount * VAT_RATE);
  }
  return { net: round2(net), vat: round2(vat), total: round2(net + vat) };
};

/* ------------------------------------------------------------------ */
/* Sales orders                                                        */
/* ------------------------------------------------------------------ */

export type OrderStage = 'DRAFT' | 'APPROVAL' | 'REJECTED' | 'TO_DISPATCH' | 'PART_DELIVERED' | 'TO_INVOICE' | 'COMPLETED' | 'CANCELLED';

export const ORDER_STAGE_LABEL: Record<OrderStage, string> = {
  DRAFT: 'Draft',
  APPROVAL: 'Awaiting approval',
  REJECTED: 'Rejected',
  TO_DISPATCH: 'To dispatch',
  PART_DELIVERED: 'Part delivered',
  TO_INVOICE: 'To invoice',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};

export const orderStage = (o: SalesOrder): OrderStage => {
  if (o.status === 'VOID') return 'CANCELLED';
  if (o.status === 'DRAFT') return 'DRAFT';
  if (o.status === 'REJECTED') return 'REJECTED';
  if (o.status === 'SUBMITTED') return 'APPROVAL';
  const ordered = o.lines.reduce((s, l) => s + l.qty, 0);
  const delivered = o.lines.reduce((s, l) => s + l.delivered, 0);
  const invoiced = o.lines.reduce((s, l) => s + l.invoiced, 0);
  if (delivered === 0) return 'TO_DISPATCH';
  if (invoiced < delivered) return 'TO_INVOICE';
  if (delivered < ordered) return 'PART_DELIVERED';
  return 'COMPLETED';
};

/** Reasons an order needs a manager rather than being approved automatically. */
export const orderExceptions = (o: Pick<SalesOrder, 'lines' | 'customerId'>, products: Product[], customer: Party | undefined, owed: number) => {
  const out: string[] = [];
  const maxDisc = Math.max(0, ...o.lines.map((l) => l.discountPct || 0));
  if (maxDisc > DISCOUNT_LIMIT) out.push(`Discount of ${maxDisc}% is above the ${DISCOUNT_LIMIT}% standard`);
  const t = totals(o.lines, products, customer);
  if (customer?.creditLimit && owed + t.total > customer.creditLimit)
    out.push(`Takes ${customer.name} to ${kes(owed + t.total, { compact: true })}, over their ${kes(customer.creditLimit, { compact: true })} credit limit`);
  if (t.total > DIRECTOR_LIMIT) out.push(`Order value ${kes(t.total, { compact: true })} is above ${kes(DIRECTOR_LIMIT, { compact: true })}`);
  for (const l of o.lines) {
    const p = products.find((x) => x.sku === l.sku);
    if (p && p.kind === 'GOODS' && l.qty > p.stock) out.push(`Only ${p.stock} ${p.unit} of ${p.name} in stock`);
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Purchase orders                                                     */
/* ------------------------------------------------------------------ */

export type POStage = 'DRAFT' | 'APPROVAL' | 'REJECTED' | 'TO_SEND' | 'AWAITING' | 'PART_RECEIVED' | 'TO_BILL' | 'COMPLETED' | 'CANCELLED';

export const PO_STAGE_LABEL: Record<POStage, string> = {
  DRAFT: 'Draft',
  APPROVAL: 'Awaiting approval',
  REJECTED: 'Rejected',
  TO_SEND: 'Approved — not sent',
  AWAITING: 'Awaiting delivery',
  PART_RECEIVED: 'Part received',
  TO_BILL: 'To bill',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};

export const poStage = (o: PurchaseOrder): POStage => {
  if (o.status === 'VOID') return 'CANCELLED';
  if (o.status === 'DRAFT') return 'DRAFT';
  if (o.status === 'REJECTED') return 'REJECTED';
  if (o.status === 'SUBMITTED') return 'APPROVAL';
  if (!o.sentAt) return 'TO_SEND';
  const ordered = o.lines.reduce((s, l) => s + l.qty, 0);
  const received = o.lines.reduce((s, l) => s + l.received, 0);
  const billed = o.lines.reduce((s, l) => s + l.billed, 0);
  if (received === 0) return 'AWAITING';
  if (billed < received) return 'TO_BILL';
  if (received < ordered) return 'PART_RECEIVED';
  return 'COMPLETED';
};
export const poLate = (o: PurchaseOrder, today = TODAY) => {
  const s = poStage(o);
  return (s === 'AWAITING' || s === 'PART_RECEIVED') && o.expected < today;
};

export const reqTotal = (r: Pick<Requisition, 'lines'>) => round2(r.lines.reduce((s, l) => s + l.qty * l.estPrice, 0));
export const quoteTotal = (r: Pick<Requisition, 'lines'>, q: { prices: Record<string, number> }) =>
  round2(r.lines.reduce((s, l) => s + l.qty * (q.prices[l.id] ?? 0), 0));

/* ------------------------------------------------------------------ */
/* Approval rules (shared by orders, requisitions and purchase orders) */
/* ------------------------------------------------------------------ */

export const needsDirector = (value: number) => value > DIRECTOR_LIMIT;

export const approvalRights = (
  doc: { status: string; preparedBy: string; approvals: { by: string; role: string }[] },
  value: number,
  actor: ComActor
) => {
  const needed = needsDirector(value) ? 2 : 1;
  if (doc.status !== 'SUBMITTED') return { can: false, needed, reason: '' };
  if (actor.role === 'OFFICER' || actor.role === 'STOREKEEPER') return { can: false, needed, reason: 'Waiting for the Commercial Manager' + (needed > 1 ? ' and the Finance Director' : '') };
  if (doc.preparedBy === actor.name) return { can: false, needed, reason: 'You prepared this, so someone else must approve it' };
  if (doc.approvals.some((a) => a.by === actor.name)) return { can: false, needed, reason: 'You have already approved this' };
  if (needed === 2 && doc.approvals.length === 1 && actor.role !== 'DIRECTOR') return { can: false, needed, reason: `Above ${kes(DIRECTOR_LIMIT, { compact: true })} — the Finance Director gives the second approval` };
  return { can: true, needed, reason: '' };
};
export const isFinalApproval = (doc: { approvals: { role: string }[] }, value: number, role: ComRole) => {
  const needed = needsDirector(value) ? 2 : 1;
  const hasDirector = role === 'DIRECTOR' || doc.approvals.some((a) => a.role === 'DIRECTOR');
  return doc.approvals.length + 1 >= needed && (needed === 1 || hasDirector);
};

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

/** Quantity already on order with suppliers (approved, not yet received). */
export const onOrder = (s: CommercialState, sku: string) =>
  s.purchaseOrders
    .filter((o) => o.status === 'APPROVED' && !o.closed)
    .reduce((x, o) => x + o.lines.filter((l) => l.sku === sku).reduce((y, l) => y + (l.qty - l.received), 0), 0);
/** Quantity promised to customers (approved orders, not yet delivered). */
export const committed = (s: CommercialState, sku: string) =>
  s.orders
    .filter((o) => o.status === 'APPROVED' && !o.closed)
    .reduce((x, o) => x + o.lines.filter((l) => l.sku === sku).reduce((y, l) => y + (l.qty - l.delivered), 0), 0);

export const needsReorder = (s: CommercialState, p: Product) => p.kind !== 'SERVICE' && p.stock - committed(s, p.sku) + onOrder(s, p.sku) < p.reorderLevel;

/* ------------------------------------------------------------------ */
/* Supplier performance                                                */
/* ------------------------------------------------------------------ */

export const supplierStats = (s: CommercialState, supplierId: string, products: Product[]) => {
  const pos = s.purchaseOrders.filter((o) => o.supplierId === supplierId && o.status === 'APPROVED');
  const spend = round2(pos.filter((o) => o.date.slice(0, 4) === TODAY.slice(0, 4)).reduce((x, o) => x + totals(o.lines, products).net, 0));
  const grns = s.receipts.filter((r) => pos.some((o) => o.id === r.poId));
  const onTime = grns.filter((r) => r.date <= (pos.find((o) => o.id === r.poId)?.expected ?? r.date)).length;
  const qty = grns.reduce((x, r) => x + r.lines.reduce((y, l) => y + l.qty + l.rejected, 0), 0);
  const rejected = grns.reduce((x, r) => x + r.lines.reduce((y, l) => y + l.rejected, 0), 0);
  return {
    orders: pos.length,
    spend,
    deliveries: grns.length,
    onTime: grns.length ? onTime / grns.length : null,
    quality: qty ? 1 - rejected / qty : null,
    open: pos.filter((o) => !o.closed && ['AWAITING', 'PART_RECEIVED', 'TO_SEND'].includes(poStage(o))).length
  };
};

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

export const STAGES: Stage[] = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];
export const OPEN_STAGES: Stage[] = ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'];
export const STAGE_LABEL: Record<Stage, string> = {
  LEAD: 'Lead',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost'
};
export const STAGE_PROBABILITY: Record<Stage, number> = { LEAD: 0.1, QUALIFIED: 0.25, PROPOSAL: 0.5, NEGOTIATION: 0.75, WON: 1, LOST: 0 };
export const weighted = (o: Opportunity) => round2(o.value * STAGE_PROBABILITY[o.stage]);
export const daysInStage = (o: Opportunity) => daysBetween(o.stageChanged, TODAY);
export const isStale = (o: Opportunity) => OPEN_STAGES.includes(o.stage) && daysInStage(o) > 21;

export const pipelineStats = (s: CommercialState) => {
  const open = s.opportunities.filter((o) => OPEN_STAGES.includes(o.stage));
  const closedThisYear = s.opportunities.filter((o) => (o.stage === 'WON' || o.stage === 'LOST') && o.stageChanged.slice(0, 4) === TODAY.slice(0, 4));
  const won = closedThisYear.filter((o) => o.stage === 'WON');
  const next90 = open.filter((o) => o.expectedClose <= addDays(TODAY, 90));
  return {
    openValue: round2(open.reduce((x, o) => x + o.value, 0)),
    weighted: round2(open.reduce((x, o) => x + weighted(o), 0)),
    forecast90: round2(next90.reduce((x, o) => x + weighted(o), 0)),
    winRate: closedThisYear.length ? won.length / closedThisYear.length : 0,
    wonValue: round2(won.reduce((x, o) => x + o.value, 0)),
    openCount: open.length,
    avgDeal: won.length ? round2(won.reduce((x, o) => x + o.value, 0) / won.length) : 0
  };
};
