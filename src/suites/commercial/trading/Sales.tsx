import React, { useEffect, useState } from 'react';
import { Plus, Send, CheckCircle2, XCircle, Truck, FileText, Printer, ShoppingBag, Clock3, AlertTriangle, PackageCheck, Ban, Receipt, ArrowRight } from 'lucide-react';
import { useCommercial } from '../store';
import { orderExceptions, orderStage, ORDER_STAGE_LABEL, totals, approvalRights } from '../engine';
import { addDays, daysBetween, fmtDate, kes, round2, TODAY } from '../../finance/engine';
import type { Line, Quotation, SalesOrder } from '../types';
import { ApprovalPanel, Chips, DataTable, DefList, Drawer, Empty, Field, FlowSteps, Modal, Pill, SearchBox, Stat, SuitePage, type Column, type FlowAction } from '../../ui/kit';
import { LinesEditor, LinesTable, newLine, PartySelect } from '../parts';
import { PrintHeader } from '../../finance/parts';
import { printArea } from '../../../views/ess/EssRecords';
import { useOperations } from '../../operations/store';
import { stockAt } from '../../operations/engine';
import { lookupPostal, profileOf } from '../tradeEngine';
import { AmendModal, INCOTERMS, LEAD_SOURCES, ORDER_CLASSES, OrderExtras, QuoteExtras } from './OrderExtras';

type QuoteDraft = Partial<Quotation> & Pick<Quotation, 'customerId' | 'date' | 'validUntil' | 'lines' | 'notes'>;
type OrderDraft = Omit<Partial<SalesOrder>, 'lines'> & Pick<SalesOrder, 'customerId' | 'date' | 'requiredBy' | 'customerRef' | 'deliveryAddress' | 'notes'> & { lines: Line[] };

const QSTATUS: Record<Quotation['status'], { pill: string; label: string }> = {
  DRAFT: { pill: 'DRAFT', label: 'Draft' },
  SENT: { pill: 'SUBMITTED', label: 'Sent' },
  ACCEPTED: { pill: 'POSTED', label: 'Accepted' },
  LOST: { pill: 'REJECTED', label: 'Lost' },
  EXPIRED: { pill: 'VOID', label: 'Expired' },
  CANCELLED: { pill: 'VOID', label: 'Cancelled' }
};
const STAGE_PILL: Record<string, string> = {
  DRAFT: 'DRAFT',
  APPROVAL: 'SUBMITTED',
  REJECTED: 'REJECTED',
  TO_DISPATCH: 'APPROVED',
  PART_DELIVERED: 'PART_PAID',
  TO_INVOICE: 'OVERDUE',
  COMPLETED: 'POSTED',
  CANCELLED: 'VOID'
};

const qStatus = (q: Quotation) => (q.status === 'SENT' && q.validUntil < TODAY ? 'EXPIRED' : q.status);

/* ================================================================== */
/* Quotations                                                          */
/* ================================================================== */

export const QuotationsPage: React.FC = () => {
  const { state, party, trading, clearFocus, setTrading } = useCommercial();
  const [filter, setFilter] = useState<'ALL' | Quotation['status']>('ALL');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Quotation | 'new' | null>(null);

  useEffect(() => {
    if (trading.focus === 'new') setEditing('new');
    else if (trading.focus && state.quotations.some((x) => x.id === trading.focus)) setOpenId(trading.focus);
    if (trading.focus) clearFocus();
  }, [trading.focus, state.quotations, clearFocus]);

  const list = state.quotations;
  const rows = list
    .filter((x) => filter === 'ALL' || qStatus(x) === filter)
    .filter((x) => !q || `${x.number} ${party(x.customerId)?.name}`.toLowerCase().includes(q.toLowerCase()));
  const val = (x: Quotation) => totals(x.lines, state.products, party(x.customerId)).total;
  const open = list.filter((x) => qStatus(x) === 'SENT');
  const decided = list.filter((x) => x.status === 'ACCEPTED' || x.status === 'LOST');
  const won = decided.filter((x) => x.status === 'ACCEPTED');
  const expiring = open.filter((x) => daysBetween(TODAY, x.validUntil) <= 7);

  const columns: Column<Quotation>[] = [
    { key: 'n', header: 'Quotation', render: (x) => <b className="sx-mono">{x.number}</b>, sort: (x) => x.number, width: 130 },
    {
      key: 'c',
      header: 'Customer',
      render: (x) => (
        <div className="sx-cell-main">
          <span>{party(x.customerId)?.name}</span>
          <small>{x.lines.length} lines</small>
        </div>
      ),
      sort: (x) => party(x.customerId)?.name ?? ''
    },
    { key: 'd', header: 'Date', render: (x) => fmtDate(x.date), sort: (x) => x.date, hideOnMobile: true },
    {
      key: 'v',
      header: 'Valid until',
      render: (x) => <span className={qStatus(x) === 'SENT' && daysBetween(TODAY, x.validUntil) <= 7 ? 'sx-danger-text' : ''}>{fmtDate(x.validUntil)}</span>,
      sort: (x) => x.validUntil,
      hideOnMobile: true
    },
    { key: 't', header: 'Value', render: (x) => kes(val(x)), sort: val, align: 'right' },
    { key: 's', header: 'Status', render: (x) => <Pill status={QSTATUS[qStatus(x)].pill} label={QSTATUS[qStatus(x)].label} />, sort: (x) => qStatus(x) }
  ];
  const current = list.find((x) => x.id === openId);

  return (
    <SuitePage
      eyebrow="Sales"
      title="Quotations"
      subtitle="Price up what the customer asked for, send it, and turn it into an order when they say yes."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          <Plus size={15} /> New quotation
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Open quotations" value={open.length} detail={kes(round2(open.reduce((s, x) => s + val(x), 0)), { compact: true })} icon={<FileText size={17} />} onClick={() => setFilter('SENT')} />
        <Stat label="Expiring in 7 days" value={expiring.length} detail="Follow up before they lapse" icon={<Clock3 size={17} />} tone={expiring.length ? 'gold' : 'slate'} />
        <Stat label="Win rate" value={`${decided.length ? Math.round((won.length / decided.length) * 100) : 0}%`} detail={`${won.length} won of ${decided.length} decided`} icon={<CheckCircle2 size={17} />} tone="blue" />
        <Stat label="Lost" value={decided.length - won.length} detail={list.find((x) => x.status === 'LOST')?.lostReason ?? '—'} icon={<XCircle size={17} />} tone="red" onClick={() => setFilter('LOST')} />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={(['ALL', 'DRAFT', 'SENT', 'ACCEPTED', 'LOST', 'EXPIRED', 'CANCELLED'] as const).map((v) => ({
            value: v,
            label: v === 'ALL' ? 'All' : QSTATUS[v].label,
            count: v === 'ALL' ? list.length : list.filter((x) => qStatus(x) === v).length
          }))}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search quotations…" />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(x) => x.id} onRowClick={(x) => setOpenId(x.id)} selected={openId} initialSort={{ key: 'd', dir: 'desc' }} />
      {current && <QuotationDrawer q={current} onClose={() => setOpenId(null)} onEdit={() => setEditing(current)} onOpenOrder={(id) => setTrading('orders', id)} />}
      {editing && (
        <QuotationEditor
          quote={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            setOpenId(id);
          }}
        />
      )}
    </SuitePage>
  );
};

const QuotationDrawer: React.FC<{ q: Quotation; onClose: () => void; onEdit: () => void; onOpenOrder: (id: string) => void }> = ({ q, onClose, onEdit, onOpenOrder }) => {
  const { state, party, sendQuotation, acceptQuotation, loseQuotation, setTrading } = useCommercial();
  const [losing, setLosing] = useState(false);
  const lostCodes = state.reasonCodes.filter((r) => r.kind === 'QUOTE_LOST' && r.active);
  const [reason, setReason] = useState('');
  const c = party(q.customerId);
  const st = qStatus(q);
  const order = state.orders.find((o) => o.id === q.orderId);
  return (
    <Drawer
      wide
      title={q.number}
      subtitle={`${c?.name} · valid until ${fmtDate(q.validUntil)}`}
      badge={<Pill status={QSTATUS[st].pill} label={QSTATUS[st].label} />}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={printArea}>
            <Printer size={14} /> Print quotation
          </button>
          <span className="sx-grow" />
          {(st === 'DRAFT' || st === 'SENT') && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
              Edit
            </button>
          )}
          {st === 'DRAFT' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => sendQuotation(q.id)}>
              <Send size={14} /> Send to customer
            </button>
          )}
          {st === 'SENT' && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLosing(true)}>
                <XCircle size={14} /> Lost
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const r = acceptQuotation(q.id);
                  if (r.ok && r.id) onOpenOrder(r.id);
                }}
              >
                <CheckCircle2 size={14} /> Accepted — create order
              </button>
            </>
          )}
          {st === 'ACCEPTED' && !order && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const r = acceptQuotation(q.id);
                if (r.ok && r.id) onOpenOrder(r.id);
              }}
            >
              <ShoppingBag size={14} /> Create sales order
            </button>
          )}
          {order && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenOrder(order.id)}>
              Open {order.number} <ArrowRight size={14} />
            </button>
          )}
        </>
      }
    >
      <FlowSteps steps={['Drafted', 'Sent', 'Decision', 'Order']} at={st === 'DRAFT' ? 0 : st === 'SENT' ? 1 : st === 'ACCEPTED' ? (order ? 4 : 3) : 2} off={st === 'LOST' || st === 'EXPIRED'} />
      {losing && (
        <div className="sx-callout warn">
          <XCircle size={16} />
          <div>
            <b>Why was it lost?</b>
            <div className="sx-inline-form">
              <select className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Lost reason code">
                <option value="">Choose a reason code…</option>
                {lostCodes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => loseQuotation(q.id, lostCodes.find((r) => r.id === reason)?.label ?? '', reason || undefined).ok && setLosing(false)}>
                Mark as lost
              </button>
            </div>
          </div>
        </div>
      )}
      {q.lostReason && (
        <div className="sx-callout danger">
          <XCircle size={16} />
          <div>
            <b>Lost</b>
            <span>{q.lostReason}</span>
          </div>
        </div>
      )}
      <div className="sx-amount-hero">
        <div>
          <span>Quotation value</span>
          <strong>{kes(totals(q.lines, state.products, c).total)}</strong>
        </div>
        <div>
          <span>{st === 'SENT' ? 'Expires in' : 'Valid until'}</span>
          <b>{st === 'SENT' ? `${daysBetween(TODAY, q.validUntil)} days` : fmtDate(q.validUntil)}</b>
        </div>
      </div>
      <DefList items={[['Customer', c?.name ?? ''], ['Date', fmtDate(q.date)], ['Prepared by', q.preparedBy]]} />
      <LinesTable lines={q.lines} products={state.products} party={c} />
      {q.notes && <p className="sx-note">{q.notes}</p>}
      <QuoteExtras q={q} onOpen={(id) => setTrading('quotations', id)} />
      <h4 className="sx-subhead">History</h4>
      <ul className="sx-list">
        {[...q.history].reverse().map((h, i) => (
          <li key={i}>
            <span className="sx-muted">{fmtDate(h.at.slice(0, 10))}</span>
            <span>{h.action}</span>
            <span className="sx-muted">{h.note}</span>
            <b>{h.by}</b>
          </li>
        ))}
      </ul>
      <article className="sx-print-only ess-print-area sx-paper">
        <PrintHeader title="Quotation" number={q.number} meta={[['Date', fmtDate(q.date)], ['Valid until', fmtDate(q.validUntil)]]} />
        <div className="sx-paper-party">
          <span>Prepared for</span>
          <strong>{c?.name}</strong>
          <small>{c?.email}</small>
        </div>
        <LinesTable lines={q.lines} products={state.products} party={c} />
        <div className="sx-paper-foot">
          <div>
            <b>Terms</b>
            <span>Prices in KES, valid until {fmtDate(q.validUntil)}. Payment {c?.terms ?? 30} days from invoice.</span>
          </div>
          <div className="sx-paper-sign">
            <span>{q.preparedBy}</span>
          </div>
        </div>
      </article>
    </Drawer>
  );
};

const QuotationEditor: React.FC<{ quote: Quotation | null; onClose: () => void; onSaved: (id: string) => void }> = ({ quote, onClose, onSaved }) => {
  const { saveQuotation, sendQuotation, party, state } = useCommercial();
  const [d, setD] = useState<QuoteDraft>(() => (quote ? { ...quote, lines: quote.lines.map((l) => ({ ...l })) } : { customerId: '', date: TODAY, validUntil: addDays(TODAY, 30), lines: [newLine()], notes: '', leadSource: '', orderClass: '', sourceCode: '' }));
  const save = (send: boolean) => {
    const r = saveQuotation(d);
    if (!r.ok || !r.id) return;
    if (send) sendQuotation(r.id);
    onSaved(r.id);
  };
  return (
    <Modal
      size="xl"
      title={quote ? `Edit ${quote.number}` : 'New quotation'}
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => save(false)}>
            Save draft
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => save(true)}>
            <Send size={14} /> Save & send
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Customer" required span={2}>
          <PartySelect kind="CUSTOMER" value={d.customerId} onChange={(v) => setD({ ...d, customerId: v })} />
        </Field>
        <Field label="Date">
          <input className="form-control" type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
        </Field>
        <Field label="Valid until">
          <input className="form-control" type="date" value={d.validUntil} onChange={(e) => setD({ ...d, validUntil: e.target.value })} />
        </Field>
      </div>
      <div className="sx-grid">
        <Field label="Lead source">
          <select className="form-control" value={d.leadSource ?? ''} onChange={(e) => setD({ ...d, leadSource: e.target.value })}>
            <option value="">—</option>
            {LEAD_SOURCES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Order class">
          <select className="form-control" value={d.orderClass ?? ''} onChange={(e) => setD({ ...d, orderClass: e.target.value })}>
            <option value="">—</option>
            {ORDER_CLASSES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Campaign source code">
          <select className="form-control" value={d.sourceCode ?? ''} onChange={(e) => setD({ ...d, sourceCode: e.target.value })}>
            <option value="">—</option>
            {state.campaigns.map((x) => (
              <option key={x.code} value={x.code}>
                {x.code} · {x.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <LinesEditor lines={d.lines} onChange={(lines: Line[]) => setD({ ...d, lines })} mode="SELL" party={party(d.customerId)} ctx={d.customerId ? { customerId: d.customerId, date: d.date, quote: true } : undefined} />
      <Field label="Notes for the customer" span={4}>
        <textarea className="form-control" rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
      </Field>
    </Modal>
  );
};

/* ================================================================== */
/* Sales orders                                                        */
/* ================================================================== */

type OFilter = 'ALL' | 'APPROVAL' | 'TO_DISPATCH' | 'PART_DELIVERED' | 'TO_INVOICE' | 'COMPLETED';

export const OrdersPage: React.FC = () => {
  const { state, party, trading, clearFocus, orderValue, mergeOrders } = useCommercial();
  const [filter, setFilter] = useState<OFilter>('ALL');
  const [q, setQ] = useState('');
  const [adv, setAdv] = useState({ from: '', to: '', by: '', shipTo: '', contact: '', lpo: '', held: false, channel: '' });
  const [showAdv, setShowAdv] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SalesOrder | 'new' | null>(null);

  useEffect(() => {
    if (trading.focus === 'new') setEditing('new');
    else if (trading.focus && state.orders.some((x) => x.id === trading.focus)) setOpenId(trading.focus);
    if (trading.focus) clearFocus();
  }, [trading.focus, state.orders, clearFocus]);

  const list = state.orders;
  const match = (o: SalesOrder, f: OFilter) => f === 'ALL' || orderStage(o) === f || (f === 'APPROVAL' && (orderStage(o) === 'DRAFT' || orderStage(o) === 'REJECTED'));
  const has = (v: string | undefined, f: string) => !f || (v ?? '').toLowerCase().includes(f.toLowerCase());
  const shipLabel = (o: SalesOrder) => profileOf(state, o.customerId).shipTos.find((x) => x.id === o.shipToId)?.label ?? o.oneTimeShipTo ?? o.deliveryAddress;
  const rows = list
    .filter((o) => match(o, filter))
    .filter((o) => !q || `${o.number} ${o.customerRef} ${party(o.customerId)?.name} ${o.oneTimeName ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .filter((o) => (!adv.from || o.date >= adv.from) && (!adv.to || o.date <= adv.to) && has(o.preparedBy, adv.by) && has(shipLabel(o), adv.shipTo) && has(o.contactName, adv.contact) && has(o.customerRef, adv.lpo))
    .filter((o) => (!adv.held || !!o.hold) && (!adv.channel || (o.channel ?? 'DIRECT') === adv.channel));
  const drafts = pick.filter((id) => list.find((o) => o.id === id)?.status === 'DRAFT');
  const count = (f: OFilter) => list.filter((o) => match(o, f)).length;
  const sum = (f: OFilter) => kes(round2(list.filter((o) => orderStage(o) === f).reduce((s, o) => s + orderValue(o), 0)), { compact: true });
  const due = list.filter((o) => orderStage(o) === 'TO_DISPATCH' && o.requiredBy <= TODAY);

  const columns: Column<SalesOrder>[] = [
    {
      key: 'x',
      header: '',
      width: 34,
      render: (o) =>
        o.status === 'DRAFT' ? (
          <input type="checkbox" aria-label={`Select ${o.number}`} checked={pick.includes(o.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setPick(e.target.checked ? [...pick, o.id] : pick.filter((x) => x !== o.id))} />
        ) : null
    },
    {
      key: 'n',
      header: 'Order',
      render: (o) => (
        <div className="sx-cell-main">
          <b className="sx-mono">{o.number}</b>
          <small>
            {o.hold ? <span className="tr-badge bad">On hold</span> : null} {o.priority === 1 ? <span className="tr-badge warn">High priority</span> : null} {o.channel && o.channel !== 'DIRECT' ? <span className="tr-badge">{o.channel}</span> : null}
          </small>
        </div>
      ),
      sort: (o) => o.number,
      width: 150
    },
    { key: 'p', header: 'Priority', render: (o) => ['', 'High', 'Normal', 'Low'][o.priority ?? 2], sort: (o) => o.priority ?? 2, hideOnMobile: true },
    {
      key: 'c',
      header: 'Customer',
      render: (o) => (
        <div className="sx-cell-main">
          <span>{party(o.customerId)?.name}</span>
          <small>{o.customerRef || 'No LPO yet'}</small>
        </div>
      ),
      sort: (o) => party(o.customerId)?.name ?? ''
    },
    { key: 'd', header: 'Ordered', render: (o) => fmtDate(o.date), sort: (o) => o.date, hideOnMobile: true },
    {
      key: 'r',
      header: 'Required by',
      render: (o) => <span className={orderStage(o) === 'TO_DISPATCH' && o.requiredBy <= TODAY ? 'sx-danger-text' : ''}>{fmtDate(o.requiredBy)}</span>,
      sort: (o) => o.requiredBy,
      hideOnMobile: true
    },
    { key: 'v', header: 'Value', render: (o) => kes(orderValue(o)), sort: orderValue, align: 'right' },
    { key: 's', header: 'Stage', render: (o) => <Pill status={STAGE_PILL[orderStage(o)]} label={ORDER_STAGE_LABEL[orderStage(o)]} />, sort: (o) => orderStage(o) }
  ];
  const current = list.find((o) => o.id === openId);

  return (
    <SuitePage
      eyebrow="Sales"
      title="Sales orders"
      subtitle="From the customer's order to dispatch and invoice. Orders inside credit, stock and pricing policy approve themselves."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          <Plus size={15} /> New order
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Awaiting approval" value={list.filter((o) => orderStage(o) === 'APPROVAL').length} detail={sum('APPROVAL')} icon={<Clock3 size={17} />} tone="gold" onClick={() => setFilter('APPROVAL')} />
        <Stat label="To dispatch" value={count('TO_DISPATCH')} detail={due.length ? `${due.length} due today or late` : sum('TO_DISPATCH')} icon={<Truck size={17} />} tone={due.length ? 'red' : 'blue'} onClick={() => setFilter('TO_DISPATCH')} />
        <Stat label="Delivered, not invoiced" value={count('TO_INVOICE')} detail={sum('TO_INVOICE')} icon={<Receipt size={17} />} tone="violet" onClick={() => setFilter('TO_INVOICE')} />
        <Stat label="Completed" value={count('COMPLETED')} detail={sum('COMPLETED')} icon={<PackageCheck size={17} />} onClick={() => setFilter('COMPLETED')} />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All', count: count('ALL') },
            { value: 'APPROVAL', label: 'Drafts & approval', count: count('APPROVAL') },
            { value: 'TO_DISPATCH', label: 'To dispatch', count: count('TO_DISPATCH') },
            { value: 'PART_DELIVERED', label: 'Part delivered', count: count('PART_DELIVERED') },
            { value: 'TO_INVOICE', label: 'To invoice', count: count('TO_INVOICE') },
            { value: 'COMPLETED', label: 'Completed', count: count('COMPLETED') }
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search orders…" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAdv(!showAdv)}>
          More filters
        </button>
        {drafts.length >= 2 && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const r = mergeOrders(drafts);
              if (r.ok) {
                setPick([]);
                if (r.id) setOpenId(r.id);
              }
            }}
          >
            Merge {drafts.length} drafts
          </button>
        )}
      </div>
      {showAdv && (
        <div className="tr-row" style={{ marginBottom: 10 }}>
          <input className="form-control" type="date" aria-label="Ordered from" value={adv.from} onChange={(e) => setAdv({ ...adv, from: e.target.value })} />
          <input className="form-control" type="date" aria-label="Ordered to" value={adv.to} onChange={(e) => setAdv({ ...adv, to: e.target.value })} />
          <input className="form-control" placeholder="Prepared by" value={adv.by} onChange={(e) => setAdv({ ...adv, by: e.target.value })} />
          <input className="form-control" placeholder="Ship-to" value={adv.shipTo} onChange={(e) => setAdv({ ...adv, shipTo: e.target.value })} />
          <input className="form-control" placeholder="Contact" value={adv.contact} onChange={(e) => setAdv({ ...adv, contact: e.target.value })} />
          <input className="form-control" placeholder="Customer PO / LPO" value={adv.lpo} onChange={(e) => setAdv({ ...adv, lpo: e.target.value })} />
          <select className="form-control" aria-label="Channel" value={adv.channel} onChange={(e) => setAdv({ ...adv, channel: e.target.value })}>
            <option value="">All channels</option>
            {['DIRECT', 'WEB', 'POS', 'AUCTION'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="sx-check">
            <input type="checkbox" checked={adv.held} onChange={(e) => setAdv({ ...adv, held: e.target.checked })} /> On hold only
          </label>
        </div>
      )}
      <DataTable rows={rows} columns={columns} rowKey={(o) => o.id} onRowClick={(o) => setOpenId(o.id)} selected={openId} initialSort={{ key: 'd', dir: 'desc' }} empty={<Empty icon={<ShoppingBag size={20} />} title="No orders here" />} />
      {current && <OrderDrawer o={current} onClose={() => setOpenId(null)} onEdit={() => setEditing(current)} onOpenOrder={(id) => setOpenId(id)} />}
      {editing && (
        <OrderEditor
          order={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            setOpenId(id);
          }}
        />
      )}
    </SuitePage>
  );
};

const OrderDrawer: React.FC<{ o: SalesOrder; onClose: () => void; onEdit: () => void; onOpenOrder: (id: string) => void }> = ({ o, onClose, onEdit, onOpenOrder }) => {
  const { state, actor, party, owedBy, submitOrder, approveOrder, rejectOrder, cancelOrder, closeBalance, invoiceOrder, orderValue, finance, exposure } = useCommercial();
  const [dispatching, setDispatching] = useState(false);
  const [amending, setAmending] = useState(false);
  const [cancelCode, setCancelCode] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const cancelCodes = state.reasonCodes.filter((r) => r.kind === 'ORDER_CANCEL' && r.active);
  const exp = exposure(o.customerId);
  const c = party(o.customerId);
  const stage = orderStage(o);
  const value = orderValue(o);
  const rights = approvalRights(o, value, actor);
  const exceptions = o.status === 'SUBMITTED' ? orderExceptions(o, state.products, c, owedBy(o.customerId)) : [];
  const dns = state.deliveries.filter((x) => x.orderId === o.id);
  const stepAt = { DRAFT: 0, REJECTED: 0, APPROVAL: 1, TO_DISPATCH: 2, PART_DELIVERED: 3, TO_INVOICE: 3, COMPLETED: 5, CANCELLED: 0 }[stage];
  const actions: FlowAction[] = [];
  if (o.status === 'DRAFT' || o.status === 'REJECTED') {
    actions.push({ label: 'Edit', onClick: onEdit, tone: 'secondary' });
    actions.push({ label: 'Submit', icon: <Send size={14} />, onClick: () => submitOrder(o.id) });
  }
  if (rights.can) actions.push({ label: 'Approve', icon: <CheckCircle2 size={14} />, onClick: () => approveOrder(o.id) });
  if (o.status === 'APPROVED' && !o.closed && o.lines.some((l) => l.delivered < l.qty))
    actions.push({ label: 'Dispatch goods', icon: <Truck size={14} />, onClick: () => setDispatching(true), title: actor.role === 'OFFICER' ? 'Stores dispatches — switch to John Kiprop' : undefined });
  if (o.lines.some((l) => l.delivered > l.invoiced)) actions.push({ label: 'Raise invoice in Finance', icon: <Receipt size={14} />, onClick: () => invoiceOrder(o.id) });
  if (stage === 'PART_DELIVERED' && actor.role !== 'OFFICER') actions.push({ label: 'Close balance', onClick: () => closeBalance(o.id), tone: 'ghost' });
  if (['DRAFT', 'REJECTED', 'APPROVAL', 'TO_DISPATCH'].includes(stage)) actions.push({ label: 'Cancel order', icon: <Ban size={14} />, onClick: () => setCancelling(true), tone: 'ghost' });

  return (
    <>
      <Drawer
        wide
        title={o.number}
        subtitle={`${c?.name} · ${o.customerRef || 'no LPO'}`}
        badge={<Pill status={STAGE_PILL[stage]} label={ORDER_STAGE_LABEL[stage]} />}
        onClose={onClose}
        footer={
          <button type="button" className="btn btn-secondary btn-sm" onClick={printArea}>
            <Printer size={14} /> Print order confirmation
          </button>
        }
      >
        <div className="sx-amount-hero">
          <div>
            <span>Order value</span>
            <strong>{kes(value)}</strong>
          </div>
          <div>
            <span>Required by</span>
            <b className={stage === 'TO_DISPATCH' && o.requiredBy <= TODAY ? 'sx-danger-text' : ''}>{fmtDate(o.requiredBy)}</b>
          </div>
        </div>
        {exceptions.length > 0 && (
          <div className="sx-callout warn">
            <AlertTriangle size={16} />
            <div>
              <b>Why this order needs approval</b>
              {exceptions.map((e) => (
                <span key={e}>• {e}</span>
              ))}
            </div>
          </div>
        )}
        <DefList
          items={[
            ['Customer', c?.name ?? ''],
            ['Customer LPO', o.customerRef || '—'],
            ['Ordered', fmtDate(o.date)],
            ['Owes us now', kes(owedBy(o.customerId), { compact: true })],
            ['Credit exposure', `${kes(exp.total, { compact: true })} (AR ${kes(exp.ar, { compact: true })} + open orders ${kes(exp.orders, { compact: true })} − credits ${kes(exp.credits, { compact: true })})`],
            ['Credit limit', c?.creditLimit ? kes(c.creditLimit, { compact: true }) : '—'],
            ['Prepared by', o.preparedBy]
          ]}
        />
        {cancelling && (
          <div className="sx-callout warn">
            <Ban size={16} />
            <div>
              <b>Cancel {o.number}</b>
              <div className="tr-row">
                <select className="form-control" aria-label="Cancellation reason" value={cancelCode} onChange={(e) => setCancelCode(e.target.value)}>
                  <option value="">Choose a reason code…</option>
                  {cancelCodes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => cancelOrder(o.id, cancelCode || undefined).ok && setCancelling(false)}>
                  Cancel order
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCancelling(false)}>
                  Keep it
                </button>
              </div>
            </div>
          </div>
        )}
        <h4 className="sx-subhead">Lines</h4>
        <LinesTable lines={o.lines} products={state.products} party={c} progress={{ a: 'delivered', aLabel: 'Delivered', b: 'invoiced', bLabel: 'Invoiced' }} />
        {(dns.length > 0 || o.invoices.length > 0) && (
          <>
            <h4 className="sx-subhead">Deliveries and invoices</h4>
            <ul className="sx-list">
              {dns.map((d) => (
                <li key={d.id}>
                  <span className="sx-mono">{d.number}</span>
                  <span>{fmtDate(d.date)}</span>
                  <span className="sx-muted">
                    {d.vehicle} · {d.driver}
                  </span>
                  <Pill status={d.status === 'DELIVERED' ? 'POSTED' : 'SUBMITTED'} label={d.status === 'DELIVERED' ? 'Delivered' : 'On the road'} />
                </li>
              ))}
              {o.invoices.map((i) => {
                const doc = finance.state.documents.find((x) => x.id === i.id);
                return (
                  <li key={i.number}>
                    <span className="sx-mono">{i.number}</span>
                    <span>{doc ? fmtDate(doc.date) : ''}</span>
                    <span className="sx-muted">Invoice in Finance</span>
                    <Pill status={doc?.status ?? 'DRAFT'} />
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <h4 className="sx-subhead">Progress</h4>
        <ApprovalPanel
          steps={<FlowSteps steps={['Order', 'Approval', 'Dispatch', 'Delivered', 'Invoiced']} at={stepAt} off={stage === 'CANCELLED' || stage === 'REJECTED'} note={rights.needed > 1 ? { 1: `${o.approvals.length}/2 approvals` } : undefined} />}
          actions={actions}
          canReject={rights.can}
          onReject={(n) => rejectOrder(o.id, n).ok}
          notes={[rights.reason]}
          actorLine={
            <>
              You are acting as <b>{actor.name}</b> ({actor.title}).
            </>
          }
          history={o.history}
        />
        <OrderExtras o={o} onOpenOrder={onOpenOrder} onAmend={() => setAmending(true)} />
        <article className="sx-print-only ess-print-area sx-paper">
          <PrintHeader title="Order confirmation" number={o.number} meta={[['Date', fmtDate(o.date)], ['Your order', o.customerRef || '—'], ['Delivery by', fmtDate(o.requiredBy)]]} />
          <div className="sx-paper-party">
            <span>Customer</span>
            <strong>{c?.name}</strong>
            <small>PIN {c?.pin}</small>
          </div>
          <LinesTable lines={o.lines} products={state.products} party={c} />
        </article>
      </Drawer>
      {dispatching && <DispatchModal o={o} onClose={() => setDispatching(false)} />}
      {amending && <AmendModal o={o} onClose={() => setAmending(false)} />}
    </>
  );
};

const DispatchModal: React.FC<{ o: SalesOrder; onClose: () => void }> = ({ o, onClose }) => {
  const { state, dispatch, actor } = useCommercial();
  const ops = useOperations();
  const open = o.lines.filter((l) => l.delivered < l.qty);
  const defWh = profileOf(state, o.customerId).shipTos.find((x) => x.id === o.shipToId)?.defaultWarehouse ?? 'WH-NBO';
  const [wh, setWh] = useState<Record<string, string>>(() => Object.fromEntries(open.map((l) => [l.id, defWh])));
  const [bolOn, setBolOn] = useState(false);
  const [bol, setBol] = useState({ carrier: 'Own fleet', seal: '', packages: 1, grossKg: 0 });
  const whStock = (sku: string, w: string) => stockAt(ops.state, state.products, sku, w);
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      open.map((l) => {
        const p = state.products.find((x) => x.sku === l.sku);
        const max = l.qty - l.delivered;
        return [l.id, p && p.kind === 'GOODS' ? Math.min(max, p.stock) : max];
      })
    )
  );
  const [vehicle, setVehicle] = useState('KCA 512Q');
  const [driver, setDriver] = useState('Samuel Ouma');
  return (
    <Modal
      size="lg"
      title={`Dispatch ${o.number}`}
      subtitle="Pick the quantities going on this vehicle — stock is reduced when you dispatch"
      onClose={onClose}
      footer={
        <>
          {actor.role === 'OFFICER' && <span className="sx-note">Dispatch is done by Stores.</span>}
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() =>
              dispatch(
                o.id,
                Object.entries(qty).map(([lineId, q]) => ({ lineId, qty: q, warehouseId: wh[lineId] })),
                vehicle,
                driver,
                {
                  available: Object.fromEntries(
                    open.filter((l) => state.products.find((p) => p.sku === l.sku)?.kind === 'GOODS').map((l) => [l.id, whStock(l.sku, wh[l.id])])
                  ),
                  bol: bolOn ? bol : undefined
                }
              ).ok && onClose()
            }
          >
            <Truck size={14} /> Dispatch and print delivery note
          </button>
        </>
      }
    >
      <table className="sx-mini-table sx-alloc">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: 'right' }}>Outstanding</th>
            <th style={{ textAlign: 'right' }}>In stock</th>
            <th>Ship from</th>
            <th style={{ textAlign: 'right', width: 130 }}>Dispatch now</th>
          </tr>
        </thead>
        <tbody>
          {open.map((l) => {
            const p = state.products.find((x) => x.sku === l.sku);
            const goods = p?.kind === 'GOODS';
            return (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td style={{ textAlign: 'right' }}>{l.qty - l.delivered}</td>
                <td style={{ textAlign: 'right' }} className={goods && p!.stock < l.qty - l.delivered ? 'sx-danger-text' : ''}>
                  {goods ? p!.stock : 'Service'}
                </td>
                <td>
                  {goods ? (
                    <select className="form-control" aria-label={`Warehouse for ${l.description}`} value={wh[l.id]} onChange={(e) => setWh({ ...wh, [l.id]: e.target.value })}>
                      {ops.state.warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.id} · {whStock(l.sku, w.id)} avail.
                        </option>
                      ))}
                    </select>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <div className="sx-alloc-cell">
                    <input className="form-control" type="number" min="0" value={qty[l.id] ?? 0} onChange={(e) => setQty({ ...qty, [l.id]: Number(e.target.value) })} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="sx-grid sx-grid-2">
        <Field label="Vehicle">
          <select className="form-control" value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
            {['KCA 512Q', 'KDB 220T', 'KCY 908M', 'Customer collection'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Driver">
          <input className="form-control" value={driver} onChange={(e) => setDriver(e.target.value)} />
        </Field>
      </div>
      <label className="sx-check">
        <input type="checkbox" checked={bolOn} onChange={(e) => setBolOn(e.target.checked)} /> Issue a bill of lading for this load
      </label>
      {bolOn && (
        <div className="sx-grid">
          <Field label="Carrier">
            <input className="form-control" value={bol.carrier} onChange={(e) => setBol({ ...bol, carrier: e.target.value })} />
          </Field>
          <Field label="Seal number">
            <input className="form-control" value={bol.seal} onChange={(e) => setBol({ ...bol, seal: e.target.value })} />
          </Field>
          <Field label="Packages">
            <input className="form-control" type="number" min="1" value={bol.packages} onChange={(e) => setBol({ ...bol, packages: Number(e.target.value) })} />
          </Field>
          <Field label="Gross kg">
            <input className="form-control" type="number" min="0" value={bol.grossKg} onChange={(e) => setBol({ ...bol, grossKg: Number(e.target.value) })} />
          </Field>
        </div>
      )}
    </Modal>
  );
};

const OrderEditor: React.FC<{ order: SalesOrder | null; onClose: () => void; onSaved: (id: string) => void }> = ({ order, onClose, onSaved }) => {
  const { saveOrder, submitOrder, party, state, exposure, finance } = useCommercial();
  const [d, setD] = useState<OrderDraft>(() =>
    order
      ? { ...order, lines: order.lines.map((l) => ({ ...l })) as Line[] }
      : { customerId: '', date: TODAY, requiredBy: addDays(TODAY, 7), customerRef: '', deliveryAddress: '', notes: '', lines: [newLine()] as Line[], priority: 2, channel: 'DIRECT', segment: 'B2B' }
  );
  const c = party(d.customerId);
  const prof = d.customerId ? profileOf(state, d.customerId) : undefined;
  const exp = d.customerId ? exposure(d.customerId, d.id) : undefined;
  const [postal, setPostal] = useState('');
  const pickShip = (id: string) => {
    if (id === '__one') return setD({ ...d, shipToId: undefined, oneTimeShipTo: d.oneTimeShipTo ?? '' });
    const a = prof?.shipTos.find((x) => x.id === id);
    setD({ ...d, shipToId: id || undefined, oneTimeShipTo: undefined, deliveryAddress: a ? `${a.address}, ${a.town}` : d.deliveryAddress, termId: a?.termId ?? d.termId });
  };
  const useTemplate = (id: string) => {
    const t = state.templates.find((x) => x.id === id);
    if (t) setD({ ...d, customerId: t.customerId, lines: t.lines.map((l) => ({ ...l, id: `${l.id}-${Math.random().toString(36).slice(2, 7)}` })) });
  };
  const save = (submit: boolean) => {
    const r = saveOrder(d);
    if (!r.ok || !r.id) return;
    if (submit) submitOrder(r.id);
    onSaved(r.id);
  };
  return (
    <Modal
      size="xl"
      title={order ? `Edit ${order.number}` : 'New sales order'}
      subtitle="Discounts above 10%, credit-limit breaches and orders above KES 1M go to the Commercial Manager"
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => save(false)}>
            Save draft
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => save(true)}>
            Save & submit
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Customer" required span={2} hint={c && exp ? `Exposure ${kes(exp.total, { compact: true })} of a ${c.creditLimit ? kes(c.creditLimit, { compact: true }) : 'no'} limit${c.creditLimit ? ` · headroom ${kes(exp.headroom, { compact: true })}` : ''}` : undefined}>
          <PartySelect kind="CUSTOMER" value={d.customerId} onChange={(v) => setD({ ...d, customerId: v, shipToId: undefined, billToId: undefined, contactName: undefined, termId: profileOf(state, v).termId })} />
        </Field>
        <Field label="Customer LPO" required>
          <input className="form-control" value={d.customerRef} onChange={(e) => setD({ ...d, customerRef: e.target.value })} />
        </Field>
        <Field label="Required by">
          <input className="form-control" type="date" value={d.requiredBy} onChange={(e) => setD({ ...d, requiredBy: e.target.value })} />
        </Field>
      </div>
      {!order && state.templates.length > 0 && (
        <div className="tr-row" style={{ marginBottom: 8 }}>
          <select className="form-control" aria-label="Start from a template" defaultValue="" onChange={(e) => useTemplate(e.target.value)}>
            <option value="">Start from a saved order template…</option>
            {state.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {party(t.customerId)?.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="sx-grid">
        <Field label="Ordered by (order-from)">
          <select className="form-control" value={d.orderFromId ?? ''} onChange={(e) => setD({ ...d, orderFromId: e.target.value || undefined })}>
            <option value="">Same as customer</option>
            {finance.state.parties
              .filter((p) => p.kind === 'CUSTOMER' && p.id !== d.customerId && (profileOf(state, p.id).parentCustomerId === d.customerId || prof?.parentCustomerId === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Bill to">
          <select className="form-control" value={d.billToId ?? ''} onChange={(e) => setD({ ...d, billToId: e.target.value || undefined })}>
            <option value="">Main account address</option>
            {prof?.billTos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.town}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ship to">
          <select className="form-control" value={d.oneTimeShipTo !== undefined ? '__one' : (d.shipToId ?? '')} onChange={(e) => pickShip(e.target.value)}>
            <option value="">Main address</option>
            {prof?.shipTos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} · {a.town}
              </option>
            ))}
            <option value="__one">One-time address…</option>
          </select>
        </Field>
        <Field label="Contact">
          <select className="form-control" value={d.contactName ?? ''} onChange={(e) => setD({ ...d, contactName: e.target.value || undefined })}>
            <option value="">—</option>
            {prof?.contacts.map((x) => (
              <option key={x.id} value={x.name}>
                {x.name} · {x.role}
              </option>
            ))}
          </select>
        </Field>
        {d.oneTimeShipTo !== undefined && (
          <>
            <Field label="One-time ship-to address" span={2}>
              <input className="form-control" value={d.oneTimeShipTo} onChange={(e) => setD({ ...d, oneTimeShipTo: e.target.value, deliveryAddress: e.target.value })} />
            </Field>
            <Field label="Postal code" hint={lookupPostal(postal) ? `${lookupPostal(postal)!.town}, ${lookupPostal(postal)!.county}` : 'Fills in the town and county'}>
              <input
                className="form-control"
                value={postal}
                onChange={(e) => {
                  setPostal(e.target.value);
                  const pc = lookupPostal(e.target.value);
                  if (pc) {
                    const addr = `${(d.oneTimeShipTo ?? '').split(' · ')[0]} · ${pc.code} ${pc.town}, ${pc.county}, ${pc.country}`;
                    setD({ ...d, oneTimeShipTo: addr, deliveryAddress: addr });
                  }
                }}
              />
            </Field>
            <Field label="One-time bill-to">
              <input className="form-control" value={d.oneTimeBillTo ?? ''} onChange={(e) => setD({ ...d, oneTimeBillTo: e.target.value })} />
            </Field>
          </>
        )}
        <Field label="Payment terms">
          <select className="form-control" value={d.termId ?? ''} onChange={(e) => setD({ ...d, termId: e.target.value || undefined })}>
            <option value="">Customer default ({c?.terms ?? 30} days)</option>
            {state.paymentTerms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Incoterm">
          <select className="form-control" value={d.incoterm ?? ''} onChange={(e) => setD({ ...d, incoterm: e.target.value || undefined })}>
            <option value="">—</option>
            {INCOTERMS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Named place">
          <input className="form-control" value={d.namedPlace ?? ''} onChange={(e) => setD({ ...d, namedPlace: e.target.value })} placeholder="e.g. Mombasa port" />
        </Field>
        <Field label="Priority">
          <select className="form-control" value={d.priority ?? 2} onChange={(e) => setD({ ...d, priority: Number(e.target.value) as 1 | 2 | 3 })}>
            <option value={1}>High</option>
            <option value={2}>Normal</option>
            <option value={3}>Low</option>
          </select>
        </Field>
        <Field label="Lead source">
          <select className="form-control" value={d.leadSource ?? ''} onChange={(e) => setD({ ...d, leadSource: e.target.value || undefined })}>
            <option value="">—</option>
            {LEAD_SOURCES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Order class">
          <select className="form-control" value={d.orderClass ?? ''} onChange={(e) => setD({ ...d, orderClass: e.target.value || undefined })}>
            <option value="">—</option>
            {ORDER_CLASSES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Campaign source code">
          <select className="form-control" value={d.sourceCode ?? ''} onChange={(e) => setD({ ...d, sourceCode: e.target.value || undefined })}>
            <option value="">—</option>
            {state.campaigns.map((x) => (
              <option key={x.code} value={x.code}>
                {x.code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Segment">
          <select className="form-control" value={d.segment ?? 'B2B'} onChange={(e) => setD({ ...d, segment: e.target.value as 'B2B' | 'B2C' })}>
            <option value="B2B">Business (B2B)</option>
            <option value="B2C">Consumer (B2C)</option>
          </select>
        </Field>
      </div>
      <LinesEditor lines={d.lines} onChange={(lines) => setD({ ...d, lines })} mode="SELL" party={c} ctx={d.customerId ? { customerId: d.customerId, date: d.date, shipDate: d.requiredBy, shipTo: d.shipToId, orderId: d.id } : undefined} />
      <div className="sx-grid sx-grid-2">
        <Field label="Delivery address">
          <input className="form-control" value={d.deliveryAddress} onChange={(e) => setD({ ...d, deliveryAddress: e.target.value })} />
        </Field>
        <Field label="Notes">
          <input className="form-control" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};
