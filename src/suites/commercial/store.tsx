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
  Product,
  POLine,
  PurchaseOrder,
  Quotation,
  ReqLine,
  Requisition,
  SalesOrder,
  Stage,
  SupplierQuote
} from './types';
import { useAccess } from '../../platform/access';
import { prcHooks } from './procurement/ext/hooks';

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
  // Procurement: read-only sign-ins cannot change anything; the procurement extension adds budget, contract and supplier checks
  const prcAccess = useAccess();
  const prcBlock = (c?: Parameters<NonNullable<typeof prcHooks.check>>[0]) =>
    !prcAccess.canWrite ? 'This is a read-only account — you can view procurement but not change it' : c ? (prcHooks.check?.(c) ?? null) : null;

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
    value: (d: T) => number,
    note?: string
  ): Result => {
    const s = ref.current;
    const list = s[key] as T[];
    const d = list.find((x) => x.id === id)!;
    const v = value(d);
    const r = approvalRights(d, v, actor);
    if (!r.can) return fail(r.reason || 'You cannot approve this');
    let final = isFinalApproval(d, v, actor.role);
    if (key !== 'orders') {
      const blocked = prcBlock({ action: 'approve', kind: key, doc: d as Requisition | PurchaseOrder, value: v, actor });
      if (blocked) return fail(blocked);
      // A configured approval chain decides who signs next and when the document is fully approved
      const plan = prcHooks.approvalPlan?.(key, d as Requisition | PurchaseOrder, v);
      if (plan && plan.length) {
        const nextRole = plan[d.approvals.length];
        if (nextRole && nextRole !== actor.role) return fail(`The next approval in this chain is for the ${COM_ACTORS[nextRole as ComRole]?.title ?? nextRole}`);
        final = d.approvals.length + 1 >= plan.length;
      }
    }
    commit({
      ...s,
      [key]: list.map((x) =>
        x.id === id
          ? {
              ...x,
              status: final ? 'APPROVED' : 'SUBMITTED',
              approvals: [...x.approvals, { by: actor.name, role: actor.role, at: now() }],
              history: [...x.history, log(actor.role === 'DIRECTOR' && x.approvals.length ? 'Approved (director)' : 'Approved', note?.trim() || undefined)]
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
    if (key !== 'orders' && prcBlock()) return fail(prcBlock()!);
    commit({ ...s, [key]: (s[key] as (SalesOrder | Requisition | PurchaseOrder)[]).map((x) => (x.id === id ? { ...x, status: 'REJECTED', approvals: [], history: [...x.history, log('Rejected', note)] } : x)) });
    if (key !== 'orders') prcHooks.afterReject?.(key, d as Requisition | PurchaseOrder, note);
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
  const saveRequisition = (
    r: Omit<Partial<Requisition>, 'lines'> & Pick<Requisition, 'department' | 'requestedBy' | 'neededBy' | 'justification'> & { lines: ReqLine[] },
    opts: { asApprover?: boolean } = {}
  ): Result => {
    const s = ref.current;
    const lines = r.lines.filter((l) => l.description.trim() && l.qty > 0);
    if (!lines.length) return fail('Add at least one item');
    if (lines.some((l) => !(l.estPrice >= 0))) return fail('Estimated prices cannot be negative');
    if (!r.justification.trim()) return fail('Explain why it is needed');
    const blocked = prcBlock({ action: 'saveRequisition', req: { ...r, lines }, actor });
    if (blocked) return fail(blocked);
    if (r.id) {
      const ex = s.requisitions.find((x) => x.id === r.id);
      if (!ex) return fail('Requisition not found');
      // Approvers may correct quantities and prices while it is with them; otherwise only drafts change
      const approverEdit = !!opts.asApprover && ex.status === 'SUBMITTED' && (actor.role === 'MANAGER' || actor.role === 'DIRECTOR') && ex.preparedBy !== actor.name;
      if (opts.asApprover && !approverEdit) return fail('Only a manager or director approving it can edit a submitted requisition');
      if (!approverEdit && ex.status !== 'DRAFT' && ex.status !== 'REJECTED') return fail('Only draft or returned requisitions can be edited');
      if (approverEdit) {
        const est = round2(lines.reduce((a, l) => a + l.qty * l.estPrice, 0));
        commit({ ...s, requisitions: s.requisitions.map((x) => (x.id === r.id ? { ...x, lines, neededBy: r.neededBy, history: [...x.history, log('Edited by approver', `Estimate now ${est.toLocaleString()}`)] } : x)) });
        return done('Requisition corrected', `${ex.number} is still awaiting approval`, r.id);
      }
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
    const blocked = prcBlock({ action: 'submitRequisition', req: r, actor });
    if (blocked) return fail(blocked);
    updateReq(id, { status: 'SUBMITTED', approvals: [] }, 'Submitted for approval');
    return done('Submitted', `${r.number} is with the Commercial Manager`);
  };
  const approveRequisition = (id: string, note?: string) => approveDoc<Requisition>('requisitions', id, reqTotal, note);
  const rejectRequisition = (id: string, note: string) => rejectDoc('requisitions', id, note, reqTotal(ref.current.requisitions.find((x) => x.id === id)!));
  const addQuote = (id: string, q: SupplierQuote): Result => {
    const r = ref.current.requisitions.find((x) => x.id === id)!;
    if (prcBlock()) return fail(prcBlock()!);
    if (r.status !== 'APPROVED') return fail('Quotes are recorded once the requisition is approved');
    if (!q.supplierId) return fail('Choose the supplier');
    if (r.lines.some((l) => !(q.prices[l.id] > 0))) return fail('Enter a unit price for every line');
    updateReq(id, { quotes: [...r.quotes.filter((x) => x.supplierId !== q.supplierId), q] }, `Quote received from ${party(q.supplierId)?.name}`);
    return done('Quote recorded', `${party(q.supplierId)?.name}: ${quoteTotal(r, q).toLocaleString()}`);
  };
  /** Award to a supplier (with or without competing quotes) and draft the purchase order. */
  const award = (
    id: string,
    supplierId: string,
    reason: string,
    opts: { lineIds?: string[]; prices?: Record<string, number>; leadDays?: number; eventId?: string } = {}
  ): Result => {
    const s = ref.current;
    const r = s.requisitions.find((x) => x.id === id)!;
    if (r.status !== 'APPROVED') return fail('The requisition must be approved first');
    // Split awards: each supplier gets a purchase order for the lines it won
    const awarded = r.awards?.flatMap((a) => a.lineIds) ?? (r.poId ? r.lines.map((l) => l.id) : []);
    const wanted = (opts.lineIds ?? r.lines.map((l) => l.id)).filter((lid) => !awarded.includes(lid));
    if (!wanted.length) return fail(r.poId ? 'A purchase order already exists for this requisition' : 'Choose the lines to award');
    const blocked = prcBlock({ action: 'award', supplierId, req: r, actor });
    if (blocked) return fail(blocked);
    const q = r.quotes.find((x) => x.supplierId === supplierId);
    const cheapest = [...r.quotes].sort((a, b) => quoteTotal(r, a) - quoteTotal(r, b))[0];
    if (!opts.prices && cheapest && cheapest.supplierId !== supplierId && !reason.trim()) return fail('You are not choosing the lowest quote — give a reason for the file');
    const { number, sequence } = next(s, 'PO');
    const lines: POLine[] = r.lines
      .filter((l) => wanted.includes(l.id))
      .map((l) => ({ id: uid('pl'), sku: l.sku, description: l.description, qty: l.qty, price: opts.prices?.[l.id] ?? q?.prices[l.id] ?? prcHooks.contractPrice?.(supplierId, l.sku) ?? l.estPrice, discountPct: 0, received: 0, billed: 0 }));
    const order: PurchaseOrder = {
      id: uid('po'),
      number,
      supplierId,
      date: TODAY,
      expected: addDays(TODAY, opts.leadDays ?? q?.leadDays ?? 10),
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
      requisitions: s.requisitions.map((x) =>
        x.id === id
          ? {
              ...x,
              awardedTo: x.awardedTo ?? supplierId,
              poId: x.poId ?? order.id,
              awards: [...(x.awards ?? []), { supplierId, poId: order.id, lineIds: wanted, eventId: opts.eventId }],
              history: [...x.history, log(`Awarded to ${party(supplierId)?.name} — ${number}`, [wanted.length < r.lines.length ? `${wanted.length} of ${r.lines.length} lines` : '', reason].filter(Boolean).join(' · ') || undefined)]
            }
          : x
      )
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
    const blocked = prcBlock({ action: 'savePO', po: { ...o, lines }, actor });
    if (blocked) return fail(blocked);
    if (o.id) {
      const ex = s.purchaseOrders.find((x) => x.id === o.id);
      if (!ex) return fail('Purchase order not found');
      if (ex.status !== 'DRAFT' && ex.status !== 'REJECTED') return fail('Only draft or returned orders can be edited — amend an approved order instead');
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
    const blocked = prcBlock({ action: 'submitPO', po: o, actor });
    if (blocked) return fail(blocked);
    const auto = prcHooks.autoApprove?.(o);
    if (auto) {
      updatePO(id, { status: 'APPROVED', approvals: [] }, 'Approved automatically', auto);
      return done('Order approved', `${o.number}: ${auto}`);
    }
    updatePO(id, { status: 'SUBMITTED', approvals: [] }, 'Submitted for approval');
    return done('Submitted', `${o.number} is waiting for approval`);
  };
  const approvePO = (id: string, note?: string) => approveDoc<PurchaseOrder>('purchaseOrders', id, poValue, note);
  const rejectPO = (id: string, note: string) => rejectDoc('purchaseOrders', id, note, poValue(ref.current.purchaseOrders.find((x) => x.id === id)!));
  const sendPO = (id: string): Result => {
    const o = ref.current.purchaseOrders.find((x) => x.id === id)!;
    if (o.status !== 'APPROVED') return fail('Only approved orders can be sent');
    const blocked = prcBlock({ action: 'sendPO', po: o, actor });
    if (blocked) return fail(blocked);
    updatePO(id, { sentAt: now() }, 'Sent to supplier');
    return done('Sent to supplier', `${o.number} emailed to ${party(o.supplierId)?.name}`);
  };
  const cancelPO = (id: string): Result => {
    const o = ref.current.purchaseOrders.find((x) => x.id === id)!;
    if (prcBlock()) return fail(prcBlock()!);
    if (o.status === 'VOID') return fail('This order is already cancelled');
    if (o.lines.some((l) => l.received > 0)) return fail('Goods have been received — close the balance instead');
    updatePO(id, { status: 'VOID' }, 'Cancelled');
    return done('Purchase order cancelled', o.number);
  };
  /** Stores receives goods: stock goes up and the order moves to billing. */
  const receive = (poId: string, lines: { lineId: string; qty: number; rejected: number }[], deliveryNote: string, notes: string): Result => {
    const s = ref.current;
    if (prcBlock()) return fail(prcBlock()!);
    if (!isOps) return fail('Goods are received by Stores — switch to John Kiprop (Stores & Dispatch)');
    const o = s.purchaseOrders.find((x) => x.id === poId)!;
    if (o.status !== 'APPROVED' || o.closed) return fail('Only open, approved orders can be received');
    if (o.preparedBy === actor.name) return fail('You raised this order, so someone else must receive the goods');
    if (!o.sentAt) return fail('The order has not been sent to the supplier yet');
    const got = lines.filter((l) => l.qty > 0 || l.rejected > 0);
    if (!got.length) return fail('Enter the quantities received');
    if (!deliveryNote.trim()) return fail("Enter the supplier's delivery note number");
    const products = s.products.map((p) => ({ ...p }));
    for (const g of got) {
      const l = o.lines.find((x) => x.id === g.lineId);
      if (!l) return fail('That line is not on the order');
      if (g.qty < 0 || g.rejected < 0) return fail('Quantities cannot be negative');
      if (g.qty + g.rejected > l.qty - l.received) return fail(`${l.description}: only ${l.qty - l.received} outstanding (accepted + rejected)`);
      const p = products.find((x) => x.sku === l.sku);
      // Services are confirmed without touching stock; goods convert from the order unit and re-average the cost
      if (p && p.kind !== 'SERVICE') {
        const units = g.qty * (prcHooks.unitFactor?.(p.sku) ?? 1);
        if (units > 0 && p.stock + units > 0) p.cost = round2((p.stock * p.cost + g.qty * l.price) / (p.stock + units));
        p.stock += units;
      }
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
    prcHooks.after?.('received', grn, o);
    return done('Goods received', `${number} — stock updated`, grn.id);
  };
  /** Raise the supplier bill in Finance with the order and goods-received note matched. */
  const billPO = (
    id: string,
    supplierInvoice: string,
    invoice?: { lines: { lineId: string; qty: number; price: number }[]; matched: boolean; date?: string; extra?: { description: string; account: string; amount: number; vat: boolean }[]; note?: string }
  ): Result => {
    const s = ref.current;
    if (prcBlock()) return fail(prcBlock()!);
    const o = s.purchaseOrders.find((x) => x.id === id)!;
    const due = o.lines.filter((l) => l.received > l.billed);
    if (!due.length) return fail('Nothing received is waiting to be billed');
    if (!supplierInvoice.trim()) return fail("Enter the supplier's invoice number");
    const blocked = prcBlock({ action: 'bill', po: o, actor });
    if (blocked) return fail(blocked);
    if (invoice) {
      for (const il of invoice.lines) {
        const l = o.lines.find((x) => x.id === il.lineId);
        if (!l) return fail('Invoice line is not on the order');
        if (il.qty <= 0 || il.price <= 0) return fail('Invoice quantities and prices must be above zero');
        if (il.qty > l.received - l.billed) return fail(`${l.description}: only ${l.received - l.billed} received and not yet billed`);
      }
    }
    const sup = party(o.supplierId);
    // Every receipt on the order is part of the match, not only the latest
    const grnNumbers = s.receipts.filter((g) => g.poId === id).map((g) => g.number);
    // Without the supplier's invoice lines, the bill is matched only when goods were received and are billed at the order price
    const billLines = invoice ? invoice.lines.map((il) => ({ l: o.lines.find((x) => x.id === il.lineId)!, qty: il.qty, price: il.price })) : due.map((l) => ({ l, qty: l.received - l.billed, price: l.price }));
    const matched = invoice ? invoice.matched : grnNumbers.length > 0 && billLines.every((b) => b.qty <= b.l.received - b.l.billed);
    const r = finance.saveDocument(
      {
        kind: 'BILL',
        partyId: o.supplierId,
        date: TODAY,
        dueDate: addDays(TODAY, sup?.terms ?? 30),
        reference: supplierInvoice,
        department: 'Operations',
        notes: [`Matched to ${o.number}`, invoice?.note].filter(Boolean).join(' · '),
        match: { po: o.number, grn: grnNumbers.join(', '), matched },
        lines: [
          ...billLines.map(({ l, qty, price }) => {
            const prod = s.products.find((x) => x.sku === l.sku);
            return { id: uid('l'), description: l.description, account: prod?.account ?? '5000', qty, price, vat: prod?.vatable ?? true };
          }),
          ...(invoice?.extra ?? []).filter((x) => x.amount > 0).map((x) => ({ id: uid('l'), description: x.description, account: x.account, qty: 1, price: x.amount, vat: x.vat }))
        ]
      },
      actor.name
    );
    if (!r.ok || !r.id) return r;
    const bill = finance.snapshot().documents.find((x) => x.id === r.id)!;
    const lines = o.lines.map((l) => ({ ...l, billed: l.billed + (billLines.find((b) => b.l.id === l.id)?.qty ?? 0) }));
    updatePO(id, { lines, bills: [...o.bills, { id: bill.id, number: bill.number }], closed: lines.every((l) => l.billed >= l.qty) }, `Billed — ${bill.number} created in Finance`, matched ? undefined : 'Raised with match exceptions');
    return done('Bill raised in Finance', matched ? `${bill.number} matched to ${o.number} and ${grnNumbers.join(', ')} — ready for approval` : `${bill.number} raised with match exceptions — the approver will see them`, bill.id);
  };
  /** Receipt adjustment: take back a goods-received note that was posted in error (nothing billed against it yet). */
  const reverseReceipt = (grnId: string, reason: string): Result => {
    const s = ref.current;
    if (prcBlock()) return fail(prcBlock()!);
    if (actor.role !== 'MANAGER') return fail('Only the Commercial Manager can reverse a goods-received note');
    if (!reason.trim()) return fail('Say why the receipt is being reversed');
    const g = s.receipts.find((x) => x.id === grnId);
    if (!g) return fail('Receipt not found');
    if (g.notes.startsWith('[Reversed')) return fail(`${g.number} is already reversed`);
    const o = s.purchaseOrders.find((x) => x.id === g.poId)!;
    const products = s.products.map((p) => ({ ...p }));
    for (const gl of g.lines) {
      const l = o.lines.find((x) => x.id === gl.lineId)!;
      if (l.received - gl.qty < l.billed) return fail(`${l.description} has already been billed — raise a debit note instead`);
      const p = products.find((x) => x.sku === l.sku);
      if (p && p.kind !== 'SERVICE') {
        const units = gl.qty * (prcHooks.unitFactor?.(p.sku) ?? 1);
        if (p.stock < units) return fail(`${p.name}: only ${p.stock} ${p.unit} left in stock to take back`);
        p.stock -= units;
      }
    }
    commit({
      ...s,
      products,
      receipts: s.receipts.map((x) => (x.id === grnId ? { ...x, notes: `[Reversed: ${reason}] ${x.notes}` } : x)),
      purchaseOrders: s.purchaseOrders.map((x) =>
        x.id === o.id ? { ...x, closed: false, lines: x.lines.map((l) => ({ ...l, received: l.received - (g.lines.find((gl) => gl.lineId === l.id)?.qty ?? 0) })), history: [...x.history, log(`Receipt ${g.number} reversed`, reason)] } : x
      )
    });
    return done('Receipt reversed', `${g.number}: stock and the order are back as before`);
  };
  /** Amend an approved order (quantities, prices, delivery date). A higher value goes back for approval. */
  const amendPO = (id: string, lines: { lineId: string; qty: number; price: number }[], expected: string, reason: string): Result => {
    const s = ref.current;
    if (prcBlock()) return fail(prcBlock()!);
    if (actor.role === 'STOREKEEPER') return fail('Purchasing amends orders, not Stores');
    const o = s.purchaseOrders.find((x) => x.id === id);
    if (!o) return fail('Purchase order not found');
    if (o.status !== 'APPROVED' || o.closed) return fail('Only open, approved orders can be amended');
    if (!reason.trim()) return fail('Give the reason for the amendment');
    for (const a of lines) {
      const l = o.lines.find((x) => x.id === a.lineId);
      if (!l) return fail('Line not on the order');
      if (a.qty < l.received) return fail(`${l.description}: ${l.received} already received — quantity cannot go below that`);
      if (!(a.price > 0)) return fail(`${l.description}: enter a price above zero`);
      if (a.price !== l.price && l.billed > 0) return fail(`${l.description} is partly billed — its price cannot change`);
    }
    const nextLines = o.lines.map((l) => {
      const a = lines.find((x) => x.lineId === l.id);
      return a ? { ...l, qty: a.qty, price: a.price } : l;
    });
    const before = poValue(o);
    const after = totals(nextLines, s.products).total;
    const reapprove = after > before + 0.005;
    const rev = o.history.filter((h) => h.action.startsWith('Amended')).length + 1;
    commit({
      ...s,
      purchaseOrders: s.purchaseOrders.map((x) =>
        x.id === id
          ? {
              ...x,
              lines: nextLines,
              expected: expected || x.expected,
              ...(reapprove ? { status: 'SUBMITTED' as const, approvals: [] } : {}),
              history: [...x.history, log(`Amended — revision ${rev}`, `${reason} · value ${before.toLocaleString()} → ${after.toLocaleString()}${reapprove ? ' · needs re-approval' : ''}`)]
            }
          : x
      )
    });
    return done(reapprove ? 'Amendment sent for approval' : 'Order amended', `${o.number} revision ${rev}${reapprove ? ' — the value went up, so it needs approval again' : ''}`, String(rev));
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

  /** Procurement item master: a new purchased item numbered by category, or a one-off purchase made a catalogue item. */
  const addMaterial = (p: Omit<Product, 'sku' | 'stock' | 'price'> & { sku?: string }): Result => {
    const s = ref.current;
    if (prcBlock()) return fail(prcBlock()!);
    if (!p.name.trim()) return fail('Name the item');
    if (s.products.some((x) => x.name.toLowerCase() === p.name.trim().toLowerCase())) return fail('An item with that name already exists');
    const prefix = (p.category.replace(/[^A-Za-z]/g, '').slice(0, 3) || 'MAT').toUpperCase();
    const n = (s.sequence[`ITEM-${prefix}`] ?? 0) + 1;
    const sku = p.sku?.trim() || `${prefix}-${String(n).padStart(3, '0')}`;
    if (s.products.some((x) => x.sku === sku)) return fail(`Item number ${sku} is taken`);
    commit({ ...s, sequence: { ...s.sequence, [`ITEM-${prefix}`]: n }, products: [...s.products, { ...p, name: p.name.trim(), sku, stock: 0, price: 0 } as Product] });
    return done('Item added to the catalogue', `${sku} — ${p.name}`, sku);
  };
  /** Revalues item cost (landed cost, weighted average). */
  const setItemCost = (changes: { sku: string; cost: number }[]): Result => {
    const s = ref.current;
    if (prcBlock()) return fail(prcBlock()!);
    commit({ ...s, products: s.products.map((p) => (changes.some((c) => c.sku === p.sku && c.cost >= 0) ? { ...p, cost: round2(changes.find((c) => c.sku === p.sku)!.cost) } : p)) });
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
    addMaterial,
    setItemCost,
    reverseReceipt,
    amendPO,
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
