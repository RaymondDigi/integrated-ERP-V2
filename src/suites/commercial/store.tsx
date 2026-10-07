import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useFinance } from '../finance/store';
import { addDays, docBalance, round2, TODAY, localStamp } from '../finance/engine';
import { buildCommercialSeed, COM_ACTORS } from './data';
import { approvalRights, isFinalApproval, lineNet, orderExceptions, totals, reqTotal, quoteTotal } from './engine';
import type {
  Activity,
  ComRole,
  CommercialState,
  Delivery,
  GoodsReceipt,
  Line,
  Opportunity,
  OrderLine,
  POLine,
  PurchaseOrder,
  Quotation,
  ReqLine,
  Requisition,
  SalesOrder,
  Stage,
  SupplierQuote
} from './types';

export type TradingPage = 'overview' | 'quotations' | 'orders' | 'deliveries' | 'products' | 'customers';
export type ProcurementPage = 'overview' | 'requisitions' | 'orders' | 'receipts' | 'suppliers' | 'stock';
export type BizDevPage = 'overview' | 'pipeline' | 'opportunities' | 'activities';
type Result = { ok: true; id?: string } | { ok: false; error: string };

const Ctx = createContext<ReturnType<typeof useCommercialStore> | null>(null);

const useCommercialStore = () => {
  const { addToast } = useApp();
  const finance = useFinance();
  const [state, setState] = useState<CommercialState>(() => buildCommercialSeed(finance.state));
  const [trading, setTradingState] = useState<{ page: TradingPage; focus: string | null }>({ page: 'overview', focus: null });
  const [procurement, setProcurementState] = useState<{ page: ProcurementPage; focus: string | null }>({ page: 'overview', focus: null });
  const [bizdev, setBizdevState] = useState<{ page: BizDevPage; focus: string | null }>({ page: 'overview', focus: null });
  const ref = useRef(state);
  ref.current = state;
  const actor = state.actor;

  const commit = (next: CommercialState) => {
    ref.current = next;
    setState(next);
  };
  const fail = (error: string): Result => {
    addToast({ type: 'error', title: 'Not allowed', message: error });
    return { ok: false, error };
  };
  const done = (title: string, message: string, id?: string): Result => {
    addToast({ type: 'success', title, message });
    return { ok: true, id };
  };
  const now = () => localStamp();
  const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const next = (s: CommercialState, prefix: string) => {
    const n = (s.sequence[prefix] ?? 0) + 1;
    return { number: `${prefix}-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`, sequence: { ...s.sequence, [prefix]: n } };
  };
  const log = (action: string, note?: string) => ({ at: now(), by: actor.name, action, note });
  const party = (id: string) => finance.snapshot().parties.find((p) => p.id === id);
  const owedBy = (customerId: string) => {
    const fs = finance.snapshot();
    return round2(fs.documents.filter((d) => d.kind === 'INVOICE' && d.partyId === customerId && d.status === 'POSTED').reduce((x, d) => x + docBalance(fs, d), 0));
  };
  const isOps = actor.role === 'STOREKEEPER' || actor.role === 'MANAGER';

  const setActor = (role: ComRole) => {
    commit({ ...ref.current, actor: COM_ACTORS[role] });
    addToast({ type: 'info', title: `Acting as ${COM_ACTORS[role].title}`, message: COM_ACTORS[role].name });
  };

  /* ================= Quotations ================= */
  const saveQuotation = (q: Partial<Quotation> & Pick<Quotation, 'customerId' | 'date' | 'validUntil' | 'lines' | 'notes'>): Result => {
    const s = ref.current;
    if (!q.customerId) return fail('Choose a customer');
    const lines = q.lines.filter((l) => l.description.trim() && l.qty > 0);
    if (!lines.length) return fail('Add at least one product');
    if (q.id) {
      const ex = s.quotations.find((x) => x.id === q.id)!;
      if (ex.status !== 'DRAFT' && ex.status !== 'SENT') return fail('Only draft or sent quotations can be changed');
      commit({ ...s, quotations: s.quotations.map((x) => (x.id === q.id ? { ...x, ...q, lines, history: [...x.history, log('Edited')] } : x)) });
      return done('Quotation saved', ex.number, q.id);
    }
    const { number, sequence } = next(s, 'QT');
    const rec: Quotation = { id: uid('qt'), number, status: 'DRAFT', preparedBy: actor.name, history: [log('Created')], ...q, lines } as Quotation;
    commit({ ...s, quotations: [rec, ...s.quotations], sequence });
    return done('Quotation created', number, rec.id);
  };
  const setQuotation = (id: string, patch: Partial<Quotation>, action: string, note?: string) => {
    const s = ref.current;
    commit({ ...s, quotations: s.quotations.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log(action, note)] } : x)) });
  };
  const sendQuotation = (id: string) => {
    setQuotation(id, { status: 'SENT' }, 'Sent to customer');
    return done('Quotation sent', 'Emailed to the customer with a PDF copy');
  };
  const loseQuotation = (id: string, reason: string) => {
    if (!reason.trim()) return fail('Say why the quotation was lost — it feeds the win/loss report');
    setQuotation(id, { status: 'LOST', lostReason: reason }, 'Marked as lost', reason);
    return done('Marked as lost', reason);
  };
  /** Customer accepted: create the sales order from the quotation. */
  const acceptQuotation = (id: string): Result => {
    const s = ref.current;
    const q = s.quotations.find((x) => x.id === id)!;
    if (q.validUntil < TODAY) return fail('This quotation has expired — revise the prices and send it again');
    const { number, sequence } = next(s, 'SO');
    const so: SalesOrder = {
      id: uid('so'),
      number,
      customerId: q.customerId,
      date: TODAY,
      requiredBy: addDays(TODAY, 7),
      customerRef: '',
      deliveryAddress: '',
      lines: q.lines.map((l) => ({ ...l, id: uid('ol'), delivered: 0, invoiced: 0 })),
      quotationId: q.id,
      invoices: [],
      notes: `From quotation ${q.number}`,
      status: 'DRAFT',
      preparedBy: actor.name,
      approvals: [],
      history: [log(`Created from ${q.number}`)]
    };
    commit({
      ...s,
      sequence,
      orders: [so, ...s.orders],
      quotations: s.quotations.map((x) => (x.id === id ? { ...x, status: 'ACCEPTED', orderId: so.id, history: [...x.history, log(`Accepted — ${number} created`)] } : x))
    });
    return done('Sales order created', `${number} from ${q.number} — add the customer's order number and submit`, so.id);
  };

  /* ================= Sales orders ================= */
  const saveOrder = (o: Omit<Partial<SalesOrder>, 'lines'> & Pick<SalesOrder, 'customerId' | 'date' | 'requiredBy' | 'customerRef' | 'deliveryAddress' | 'notes'> & { lines: Line[] }): Result => {
    const s = ref.current;
    if (!o.customerId) return fail('Choose a customer');
    const lines = o.lines.filter((l) => l.description.trim() && l.qty > 0).map((l) => ({ ...l, delivered: (l as Partial<OrderLine>).delivered ?? 0, invoiced: (l as Partial<OrderLine>).invoiced ?? 0 }));
    if (!lines.length) return fail('Add at least one product');
    if (o.id) {
      const ex = s.orders.find((x) => x.id === o.id)!;
      if (ex.status !== 'DRAFT' && ex.status !== 'REJECTED') return fail('Only drafts can be edited');
      commit({ ...s, orders: s.orders.map((x) => (x.id === o.id ? { ...x, ...o, lines, status: 'DRAFT', history: [...x.history, log('Edited')] } : x)) });
      return done('Order saved', ex.number, o.id);
    }
    const { number, sequence } = next(s, 'SO');
    const rec: SalesOrder = { id: uid('so'), number, invoices: [], status: 'DRAFT', preparedBy: actor.name, approvals: [], history: [log('Created')], ...o, lines } as SalesOrder;
    commit({ ...s, orders: [rec, ...s.orders], sequence });
    return done('Sales order created', number, rec.id);
  };
  const updateOrder = (id: string, patch: Partial<SalesOrder>, action: string, note?: string) => {
    const s = ref.current;
    commit({ ...s, orders: s.orders.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log(action, note)] } : x)) });
  };
  /** Orders inside policy are approved straight away; exceptions go to the manager. */
  const submitOrder = (id: string): Result => {
    const s = ref.current;
    const o = s.orders.find((x) => x.id === id)!;
    if (o.status !== 'DRAFT' && o.status !== 'REJECTED') return fail('Only drafts can be submitted');
    if (!o.customerRef.trim()) return fail("Add the customer's order (LPO) number first");
    const reasons = orderExceptions(o, s.products, party(o.customerId), owedBy(o.customerId));
    if (!reasons.length) {
      updateOrder(id, { status: 'APPROVED', approvals: [] }, 'Approved automatically', 'Within credit limit, stock and standard pricing');
      return done('Order approved', `${o.number} is within policy and ready to dispatch`);
    }
    updateOrder(id, { status: 'SUBMITTED', approvals: [] }, 'Submitted for approval', reasons.join(' · '));
    addToast({ type: 'warning', title: 'Needs approval', message: reasons[0] });
    return { ok: true };
  };
  const approveDoc = <T extends SalesOrder | Requisition | PurchaseOrder>(
    key: 'orders' | 'requisitions' | 'purchaseOrders',
    id: string,
    value: (d: T) => number
  ): Result => {
    const s = ref.current;
    const list = s[key] as T[];
    const d = list.find((x) => x.id === id)!;
    const v = value(d);
    const r = approvalRights(d, v, actor);
    if (!r.can) return fail(r.reason || 'You cannot approve this');
    const final = isFinalApproval(d, v, actor.role);
    commit({
      ...s,
      [key]: list.map((x) =>
        x.id === id
          ? {
              ...x,
              status: final ? 'APPROVED' : 'SUBMITTED',
              approvals: [...x.approvals, { by: actor.name, role: actor.role, at: now() }],
              history: [...x.history, log(actor.role === 'DIRECTOR' && x.approvals.length ? 'Approved (director)' : 'Approved')]
            }
          : x
      )
    });
    return done('Approved', final ? `${d.number} is approved` : `${d.number} now needs the Finance Director`);
  };
  const rejectDoc = (key: 'orders' | 'requisitions' | 'purchaseOrders', id: string, note: string, value: number): Result => {
    const s = ref.current;
    const d = (s[key] as (SalesOrder | Requisition | PurchaseOrder)[]).find((x) => x.id === id)!;
    if (!approvalRights(d, value, actor).can) return fail('You cannot reject this');
    if (!note.trim()) return fail('Give a reason');
    commit({ ...s, [key]: (s[key] as (SalesOrder | Requisition | PurchaseOrder)[]).map((x) => (x.id === id ? { ...x, status: 'REJECTED', approvals: [], history: [...x.history, log('Rejected', note)] } : x)) });
    return done('Returned', `${d.number} was rejected`);
  };
  const orderValue = (o: SalesOrder) => totals(o.lines, ref.current.products, party(o.customerId)).total;
  const approveOrder = (id: string) => approveDoc<SalesOrder>('orders', id, orderValue);
  const rejectOrder = (id: string, note: string) => rejectDoc('orders', id, note, orderValue(ref.current.orders.find((x) => x.id === id)!));
  const cancelOrder = (id: string): Result => {
    const o = ref.current.orders.find((x) => x.id === id)!;
    if (o.lines.some((l) => l.delivered > 0)) return fail('Goods have already been delivered — close the balance instead');
    updateOrder(id, { status: 'VOID' }, 'Cancelled');
    return done('Order cancelled', o.number);
  };
  const closeBalance = (id: string): Result => {
    const o = ref.current.orders.find((x) => x.id === id)!;
    if (o.lines.some((l) => l.invoiced < l.delivered)) return fail('Invoice what was delivered first');
    updateOrder(id, { closed: true, lines: o.lines.map((l) => ({ ...l, qty: l.delivered })) }, 'Balance cancelled — order closed');
    return done('Order closed', `${o.number}: undelivered quantities released`);
  };

  /* ================= Deliveries ================= */
  const dispatch = (orderId: string, lines: { lineId: string; qty: number }[], vehicle: string, driver: string): Result => {
    const s = ref.current;
    if (!isOps) return fail('Dispatch is done by Stores — switch to John Kiprop (Stores & Dispatch)');
    const o = s.orders.find((x) => x.id === orderId)!;
    if (o.status !== 'APPROVED') return fail('The order must be approved first');
    const picked = lines.filter((l) => l.qty > 0);
    if (!picked.length) return fail('Enter the quantities being dispatched');
    if (!vehicle.trim() || !driver.trim()) return fail('Enter the vehicle and driver');
    const products = s.products.map((p) => ({ ...p }));
    for (const pl of picked) {
      const l = o.lines.find((x) => x.id === pl.lineId)!;
      if (pl.qty > l.qty - l.delivered) return fail(`${l.description}: only ${l.qty - l.delivered} left to deliver`);
      const p = products.find((x) => x.sku === l.sku);
      if (p && p.kind === 'GOODS') {
        if (pl.qty > p.stock) return fail(`${p.name}: only ${p.stock} ${p.unit} in stock`);
        p.stock -= pl.qty;
      }
    }
    const { number, sequence } = next(s, 'DN');
    const dn: Delivery = { id: uid('dn'), number, orderId, date: TODAY, lines: picked, vehicle, driver, dispatchedBy: actor.name, status: 'DISPATCHED' };
    commit({
      ...s,
      sequence,
      products,
      deliveries: [dn, ...s.deliveries],
      orders: s.orders.map((x) =>
        x.id === orderId
          ? {
              ...x,
              lines: x.lines.map((l) => ({ ...l, delivered: l.delivered + (picked.find((p) => p.lineId === l.id)?.qty ?? 0) })),
              history: [...x.history, log(`Dispatched ${number}`)]
            }
          : x
      )
    });
    return done('Goods dispatched', `${number} on ${vehicle} — stock updated`, dn.id);
  };
  const confirmDelivery = (id: string, receivedBy: string): Result => {
    const s = ref.current;
    if (!receivedBy.trim()) return fail('Who signed for the goods?');
    commit({ ...s, deliveries: s.deliveries.map((x) => (x.id === id ? { ...x, status: 'DELIVERED', receivedBy, deliveredAt: now() } : x)) });
    return done('Proof of delivery recorded', `Signed for by ${receivedBy}`);
  };

  /** Raise a Finance invoice for everything delivered but not yet invoiced. */
  const invoiceOrder = (id: string): Result => {
    const s = ref.current;
    const o = s.orders.find((x) => x.id === id)!;
    const due = o.lines.filter((l) => l.delivered > l.invoiced);
    if (!due.length) return fail('Nothing delivered is waiting to be invoiced');
    const p = party(o.customerId);
    const exportSale = p?.pin === 'NON-RESIDENT';
    const r = finance.saveDocument(
      {
        kind: 'INVOICE',
        partyId: o.customerId,
        date: TODAY,
        dueDate: addDays(TODAY, p?.terms ?? 30),
        reference: [o.customerRef, o.number].filter(Boolean).join(' · '),
        department: 'Sales',
        notes: `Raised from sales order ${o.number}`,
        lines: due.map((l) => {
          const prod = s.products.find((x) => x.sku === l.sku);
          return {
            id: uid('l'),
            description: `${l.description}${l.discountPct ? ` (less ${l.discountPct}%)` : ''}`,
            account: exportSale ? '4010' : (prod?.account ?? '4000'),
            qty: l.delivered - l.invoiced,
            price: round2(l.price * (1 - (l.discountPct || 0) / 100)),
            vat: !exportSale && (prod?.vatable ?? true)
          };
        })
      },
      actor.name
    );
    if (!r.ok || !r.id) return r;
    const inv = finance.snapshot().documents.find((x) => x.id === r.id)!;
    const lines = o.lines.map((l) => ({ ...l, invoiced: l.delivered }));
    const complete = lines.every((l) => l.invoiced >= l.qty);
    updateOrder(id, { lines, invoices: [...o.invoices, { id: inv.id, number: inv.number }], closed: complete }, `Invoiced — ${inv.number} created in Finance`);
    return done('Invoice raised in Finance', `${inv.number} is a draft for the accountant to check and submit`, inv.id);
  };

  /* ================= Requisitions ================= */
  const saveRequisition = (r: Omit<Partial<Requisition>, 'lines'> & Pick<Requisition, 'department' | 'requestedBy' | 'neededBy' | 'justification'> & { lines: ReqLine[] }): Result => {
    const s = ref.current;
    const lines = r.lines.filter((l) => l.description.trim() && l.qty > 0);
    if (!lines.length) return fail('Add at least one item');
    if (!r.justification.trim()) return fail('Explain why it is needed');
    if (r.id) {
      commit({ ...s, requisitions: s.requisitions.map((x) => (x.id === r.id ? { ...x, ...r, lines, status: 'DRAFT', history: [...x.history, log('Edited')] } : x)) });
      return done('Requisition saved', s.requisitions.find((x) => x.id === r.id)!.number, r.id);
    }
    const { number, sequence } = next(s, 'PR');
    const rec: Requisition = { id: uid('rq'), number, date: TODAY, quotes: [], status: 'DRAFT', preparedBy: actor.name, approvals: [], history: [log(`Raised for ${r.requestedBy}`)], ...r, lines } as Requisition;
    commit({ ...s, requisitions: [rec, ...s.requisitions], sequence });
    return done('Requisition raised', number, rec.id);
  };
  const updateReq = (id: string, patch: Partial<Requisition>, action: string, note?: string) => {
    const s = ref.current;
    commit({ ...s, requisitions: s.requisitions.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log(action, note)] } : x)) });
  };
  const submitRequisition = (id: string): Result => {
    const r = ref.current.requisitions.find((x) => x.id === id)!;
    if (r.status !== 'DRAFT' && r.status !== 'REJECTED') return fail('Only drafts can be submitted');
    updateReq(id, { status: 'SUBMITTED', approvals: [] }, 'Submitted for approval');
    return done('Submitted', `${r.number} is with the Commercial Manager`);
  };
  const approveRequisition = (id: string) => approveDoc<Requisition>('requisitions', id, reqTotal);
  const rejectRequisition = (id: string, note: string) => rejectDoc('requisitions', id, note, reqTotal(ref.current.requisitions.find((x) => x.id === id)!));
  const addQuote = (id: string, q: SupplierQuote): Result => {
    const r = ref.current.requisitions.find((x) => x.id === id)!;
    if (!q.supplierId) return fail('Choose the supplier');
    if (r.lines.some((l) => !(q.prices[l.id] > 0))) return fail('Enter a unit price for every line');
    updateReq(id, { quotes: [...r.quotes.filter((x) => x.supplierId !== q.supplierId), q] }, `Quote received from ${party(q.supplierId)?.name}`);
    return done('Quote recorded', `${party(q.supplierId)?.name}: ${quoteTotal(r, q).toLocaleString()}`);
  };
  /** Award to a supplier (with or without competing quotes) and draft the purchase order. */
  const award = (id: string, supplierId: string, reason: string): Result => {
    const s = ref.current;
    const r = s.requisitions.find((x) => x.id === id)!;
    if (r.status !== 'APPROVED') return fail('The requisition must be approved first');
    if (r.poId) return fail('A purchase order already exists for this requisition');
    const q = r.quotes.find((x) => x.supplierId === supplierId);
    const cheapest = [...r.quotes].sort((a, b) => quoteTotal(r, a) - quoteTotal(r, b))[0];
    if (cheapest && cheapest.supplierId !== supplierId && !reason.trim()) return fail('You are not choosing the lowest quote — give a reason for the file');
    const { number, sequence } = next(s, 'PO');
    const lines: POLine[] = r.lines.map((l) => ({ id: uid('pl'), sku: l.sku, description: l.description, qty: l.qty, price: q?.prices[l.id] ?? l.estPrice, discountPct: 0, received: 0, billed: 0 }));
    const order: PurchaseOrder = {
      id: uid('po'),
      number,
      supplierId,
      date: TODAY,
      expected: addDays(TODAY, q?.leadDays ?? 10),
      lines,
      requisitionId: r.id,
      bills: [],
      notes: reason ? `Awarded: ${reason}` : `From ${r.number}`,
      status: 'DRAFT',
      preparedBy: actor.name,
      approvals: [],
      history: [log(`Created from ${r.number}`)]
    };
    commit({
      ...s,
      sequence,
      purchaseOrders: [order, ...s.purchaseOrders],
      requisitions: s.requisitions.map((x) => (x.id === id ? { ...x, awardedTo: supplierId, poId: order.id, history: [...x.history, log(`Awarded to ${party(supplierId)?.name} — ${number}`, reason || undefined)] } : x))
    });
    return done('Purchase order drafted', `${number} for ${party(supplierId)?.name}`, order.id);
  };

  /* ================= Purchase orders ================= */
  const poValue = (o: PurchaseOrder) => totals(o.lines, ref.current.products).total;
  const savePO = (o: Omit<Partial<PurchaseOrder>, 'lines'> & Pick<PurchaseOrder, 'supplierId' | 'expected' | 'notes'> & { lines: Line[] }): Result => {
    const s = ref.current;
    if (!o.supplierId) return fail('Choose a supplier');
    const lines = o.lines.filter((l) => l.description.trim() && l.qty > 0 && l.price > 0).map((l) => ({ ...l, received: (l as Partial<POLine>).received ?? 0, billed: (l as Partial<POLine>).billed ?? 0 }));
    if (!lines.length) return fail('Add at least one item with a price');
    if (o.id) {
      commit({ ...s, purchaseOrders: s.purchaseOrders.map((x) => (x.id === o.id ? { ...x, ...o, lines, status: 'DRAFT', history: [...x.history, log('Edited')] } : x)) });
      return done('Purchase order saved', s.purchaseOrders.find((x) => x.id === o.id)!.number, o.id);
    }
    const { number, sequence } = next(s, 'PO');
    const rec: PurchaseOrder = { id: uid('po'), number, date: TODAY, bills: [], status: 'DRAFT', preparedBy: actor.name, approvals: [], history: [log('Created')], ...o, lines } as PurchaseOrder;
    commit({ ...s, purchaseOrders: [rec, ...s.purchaseOrders], sequence });
    return done('Purchase order created', number, rec.id);
  };
  const updatePO = (id: string, patch: Partial<PurchaseOrder>, action: string, note?: string) => {
    const s = ref.current;
    commit({ ...s, purchaseOrders: s.purchaseOrders.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log(action, note)] } : x)) });
  };
  const submitPO = (id: string): Result => {
    const o = ref.current.purchaseOrders.find((x) => x.id === id)!;
    if (o.status !== 'DRAFT' && o.status !== 'REJECTED') return fail('Only drafts can be submitted');
    updatePO(id, { status: 'SUBMITTED', approvals: [] }, 'Submitted for approval');
    return done('Submitted', `${o.number} is waiting for approval`);
  };
  const approvePO = (id: string) => approveDoc<PurchaseOrder>('purchaseOrders', id, poValue);
  const rejectPO = (id: string, note: string) => rejectDoc('purchaseOrders', id, note, poValue(ref.current.purchaseOrders.find((x) => x.id === id)!));
  const sendPO = (id: string): Result => {
    const o = ref.current.purchaseOrders.find((x) => x.id === id)!;
    if (o.status !== 'APPROVED') return fail('Only approved orders can be sent');
    updatePO(id, { sentAt: now() }, 'Sent to supplier');
    return done('Sent to supplier', `${o.number} emailed to ${party(o.supplierId)?.name}`);
  };
  const cancelPO = (id: string): Result => {
    const o = ref.current.purchaseOrders.find((x) => x.id === id)!;
    if (o.lines.some((l) => l.received > 0)) return fail('Goods have been received — close the balance instead');
    updatePO(id, { status: 'VOID' }, 'Cancelled');
    return done('Purchase order cancelled', o.number);
  };
  /** Stores receives goods: stock goes up and the order moves to billing. */
  const receive = (poId: string, lines: { lineId: string; qty: number; rejected: number }[], deliveryNote: string, notes: string): Result => {
    const s = ref.current;
    if (!isOps) return fail('Goods are received by Stores — switch to John Kiprop (Stores & Dispatch)');
    const o = s.purchaseOrders.find((x) => x.id === poId)!;
    if (o.preparedBy === actor.name) return fail('You raised this order, so someone else must receive the goods');
    if (!o.sentAt) return fail('The order has not been sent to the supplier yet');
    const got = lines.filter((l) => l.qty > 0 || l.rejected > 0);
    if (!got.length) return fail('Enter the quantities received');
    if (!deliveryNote.trim()) return fail("Enter the supplier's delivery note number");
    const products = s.products.map((p) => ({ ...p }));
    for (const g of got) {
      const l = o.lines.find((x) => x.id === g.lineId)!;
      if (g.qty > l.qty - l.received) return fail(`${l.description}: only ${l.qty - l.received} outstanding`);
      const p = products.find((x) => x.sku === l.sku);
      if (p) p.stock += g.qty;
    }
    const { number, sequence } = next(s, 'GRN');
    const grn: GoodsReceipt = { id: uid('gr'), number, poId, date: TODAY, lines: got, receivedBy: actor.name, deliveryNote, notes };
    commit({
      ...s,
      sequence,
      products,
      receipts: [grn, ...s.receipts],
      purchaseOrders: s.purchaseOrders.map((x) =>
        x.id === poId
          ? {
              ...x,
              lines: x.lines.map((l) => ({ ...l, received: l.received + (got.find((g) => g.lineId === l.id)?.qty ?? 0) })),
              history: [...x.history, log(`Goods received — ${number}`, got.some((g) => g.rejected) ? `${got.reduce((a, g) => a + g.rejected, 0)} rejected at the gate` : undefined)]
            }
          : x
      )
    });
    return done('Goods received', `${number} — stock updated`, grn.id);
  };
  /** Raise the supplier bill in Finance with the order and goods-received note matched. */
  const billPO = (id: string, supplierInvoice: string): Result => {
    const s = ref.current;
    const o = s.purchaseOrders.find((x) => x.id === id)!;
    const due = o.lines.filter((l) => l.received > l.billed);
    if (!due.length) return fail('Nothing received is waiting to be billed');
    if (!supplierInvoice.trim()) return fail("Enter the supplier's invoice number");
    const sup = party(o.supplierId);
    const lastGrn = s.receipts.find((g) => g.poId === id);
    const r = finance.saveDocument(
      {
        kind: 'BILL',
        partyId: o.supplierId,
        date: TODAY,
        dueDate: addDays(TODAY, sup?.terms ?? 30),
        reference: supplierInvoice,
        department: 'Operations',
        notes: `Matched to ${o.number}`,
        match: { po: o.number, grn: lastGrn?.number ?? '', matched: true },
        lines: due.map((l) => {
          const prod = s.products.find((x) => x.sku === l.sku);
          return { id: uid('l'), description: l.description, account: prod?.account ?? '5000', qty: l.received - l.billed, price: l.price, vat: prod?.vatable ?? true };
        })
      },
      actor.name
    );
    if (!r.ok || !r.id) return r;
    const bill = finance.snapshot().documents.find((x) => x.id === r.id)!;
    const lines = o.lines.map((l) => ({ ...l, billed: l.received }));
    updatePO(id, { lines, bills: [...o.bills, { id: bill.id, number: bill.number }], closed: lines.every((l) => l.billed >= l.qty) }, `Billed — ${bill.number} created in Finance`);
    return done('Bill raised in Finance', `${bill.number} with three-way match — ready for approval`, bill.id);
  };
  /** Low stock: draft a requisition for the reorder quantity. */
  const reorder = (sku: string): Result => {
    const p = ref.current.products.find((x) => x.sku === sku)!;
    return saveRequisition({
      department: 'Operations',
      requestedBy: 'Stores (reorder)',
      neededBy: addDays(TODAY, 10),
      justification: `${p.name} is below its reorder level of ${p.reorderLevel} ${p.unit}`,
      lines: [{ id: uid('rl'), sku, description: p.name, qty: p.reorderQty, estPrice: p.cost }]
    });
  };

  /* ================= Business development ================= */
  const saveOpportunity = (o: Partial<Opportunity> & Pick<Opportunity, 'name' | 'contact' | 'value' | 'expectedClose' | 'source' | 'nextStep'>): Result => {
    const s = ref.current;
    if (!o.name.trim()) return fail('Name the opportunity');
    if (!o.customerId && !o.prospect?.trim()) return fail('Choose a customer or enter the prospect');
    if (!(o.value > 0)) return fail('Estimate the value');
    if (o.id) {
      commit({ ...s, opportunities: s.opportunities.map((x) => (x.id === o.id ? { ...x, ...o, history: [...x.history, log('Edited')] } : x)) });
      return done('Opportunity saved', o.name, o.id);
    }
    const rec: Opportunity = { id: uid('op'), owner: actor.name, stage: 'LEAD', created: TODAY, stageChanged: TODAY, history: [log('Opportunity created')], ...o } as Opportunity;
    commit({ ...s, opportunities: [rec, ...s.opportunities] });
    return done('Opportunity added', o.name, rec.id);
  };
  const moveStage = (id: string, stage: Stage, lostReason = ''): Result => {
    const s = ref.current;
    const o = s.opportunities.find((x) => x.id === id)!;
    if (o.stage === stage) return { ok: true };
    if (stage === 'LOST' && !lostReason.trim()) return fail('Say why it was lost');
    if (stage === 'WON' && !o.customerId) return fail('Convert the prospect to a customer before marking it won');
    commit({
      ...s,
      opportunities: s.opportunities.map((x) =>
        x.id === id ? { ...x, stage, stageChanged: TODAY, lostReason: stage === 'LOST' ? lostReason : x.lostReason, history: [...x.history, log(`Moved to ${stage.charAt(0) + stage.slice(1).toLowerCase()}`, lostReason || undefined)] } : x
      )
    });
    return done(stage === 'WON' ? 'Deal won' : stage === 'LOST' ? 'Marked as lost' : 'Stage updated', o.name);
  };
  const convertProspect = (id: string): Result => {
    const o = ref.current.opportunities.find((x) => x.id === id)!;
    if (!o.prospect) return fail('Already a customer');
    const r = finance.saveParty({ id: '', kind: 'CUSTOMER', name: o.prospect, pin: '', email: '', phone: '', terms: 30, creditLimit: 500_000, category: 'New customer' });
    if (!r.ok) return r;
    const created = finance.snapshot().parties.find((p) => p.name === o.prospect && p.kind === 'CUSTOMER');
    const s = ref.current;
    commit({ ...s, opportunities: s.opportunities.map((x) => (x.id === id ? { ...x, customerId: created?.id, prospect: undefined, history: [...x.history, log('Converted to customer — credit limit KES 500K pending review')] } : x)) });
    return { ok: true };
  };
  const quoteFromOpportunity = (id: string): Result => {
    const o = ref.current.opportunities.find((x) => x.id === id)!;
    if (!o.customerId) return fail('Convert the prospect to a customer first');
    if (o.quotationId) return fail('This opportunity already has a quotation');
    const r = saveQuotation({
      customerId: o.customerId,
      date: TODAY,
      validUntil: addDays(TODAY, 30),
      notes: `For opportunity: ${o.name}`,
      opportunityId: o.id,
      lines: [{ id: uid('ql'), sku: '', description: o.name, qty: 1, price: o.value, discountPct: 0 }]
    });
    if (!r.ok) return r;
    const s = ref.current;
    commit({ ...s, opportunities: s.opportunities.map((x) => (x.id === id ? { ...x, quotationId: r.id, stage: x.stage === 'LEAD' || x.stage === 'QUALIFIED' ? 'PROPOSAL' : x.stage, stageChanged: TODAY, history: [...x.history, log('Quotation drafted')] } : x)) });
    return r;
  };
  const logActivity = (a: Omit<Activity, 'id' | 'owner' | 'done'>): Result => {
    const s = ref.current;
    if (!a.subject.trim()) return fail('Describe the activity');
    commit({ ...s, activities: [{ ...a, id: uid('ac'), owner: actor.name, done: false }, ...s.activities] });
    return done('Activity scheduled', a.subject);
  };
  const completeActivity = (id: string, outcome: string): Result => {
    const s = ref.current;
    commit({ ...s, activities: s.activities.map((x) => (x.id === id ? { ...x, done: true, outcome: outcome || 'Done' } : x)) });
    return done('Activity completed', outcome || 'Marked as done');
  };

  /** Stock changes made by other modules (production, counts, maintenance spares). */
  const adjustStock = (changes: { sku: string; delta: number }[]): Result => {
    const s = ref.current;
    const products = s.products.map((p) => ({ ...p }));
    for (const c of changes) {
      const p = products.find((x) => x.sku === c.sku);
      if (!p) return fail(`Unknown item ${c.sku}`);
      if (p.stock + c.delta < 0) return fail(`${p.name}: only ${p.stock} ${p.unit} in stock`);
      p.stock += c.delta;
    }
    commit({ ...s, products });
    return { ok: true };
  };

  const reset = () => {
    commit(buildCommercialSeed(finance.snapshot()));
    addToast({ type: 'info', title: 'Demo data restored', message: 'Trading, procurement and business development are back to their starting data.' });
  };

  return {
    state,
    actor,
    finance,
    party,
    owedBy,
    trading,
    procurement,
    bizdev,
    setTrading: useCallback((page: TradingPage, focus: string | null = null) => setTradingState({ page, focus }), []),
    setProcurement: useCallback((page: ProcurementPage, focus: string | null = null) => setProcurementState({ page, focus }), []),
    setBizdev: useCallback((page: BizDevPage, focus: string | null = null) => setBizdevState({ page, focus }), []),
    clearFocus: useCallback(() => {
      setTradingState((x) => ({ ...x, focus: null }));
      setProcurementState((x) => ({ ...x, focus: null }));
      setBizdevState((x) => ({ ...x, focus: null }));
    }, []),
    setActor,
    saveQuotation,
    sendQuotation,
    loseQuotation,
    acceptQuotation,
    saveOrder,
    submitOrder,
    approveOrder,
    rejectOrder,
    cancelOrder,
    closeBalance,
    dispatch,
    confirmDelivery,
    invoiceOrder,
    saveRequisition,
    submitRequisition,
    approveRequisition,
    rejectRequisition,
    addQuote,
    award,
    savePO,
    submitPO,
    approvePO,
    rejectPO,
    sendPO,
    cancelPO,
    receive,
    billPO,
    reorder,
    saveOpportunity,
    moveStage,
    convertProspect,
    quoteFromOpportunity,
    logActivity,
    completeActivity,
    reset,
    adjustStock,
    snapshot: () => ref.current,
    orderValue,
    poValue,
    lineNet
  };
};

export const CommercialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useCommercialStore();
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
};

export const useCommercial = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCommercial must be used inside CommercialProvider');
  return ctx;
};
