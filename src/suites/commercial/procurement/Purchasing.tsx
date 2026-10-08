import React, { useEffect, useState } from 'react';
import { Plus, Send, CheckCircle2, ClipboardList, Clock3, Award, PackageCheck, Receipt, Ban, Truck, AlertTriangle, Scale, Star, FilePen, FileInput, Undo2, Building2 } from 'lucide-react';
import { useCommercial } from '../store';
import { approvalRights, poLate, poStage, PO_STAGE_LABEL, quoteTotal, reqTotal, supplierStats, totals } from '../engine';
import { addDays, daysBetween, fmtDate, kes, round2, TODAY, localStamp } from '../../finance/engine';
import { DEPARTMENTS } from '../../finance/data';
import type { GoodsReceipt, Line, PurchaseOrder, ReqLine, Requisition } from '../types';
import { ApprovalPanel, Chips, DataTable, DefList, Drawer, Empty, Field, FlowSteps, Meter, Modal, Pill, SearchBox, Stat, SuitePage, type Column, type FlowAction } from '../../ui/kit';
import { LinesEditor, LinesTable, newLine, PartySelect } from '../parts';
import { Attachments, ExportCsvButton, PrintButton } from '../../../platform/Widgets';
import { useProcurementExt } from './ext/store';
import { contractPrice, lastPrice, SERVICE_TYPES } from './ext/engine';
import { docHtml, FilterBar, NO_FILTERS, passes, ReadOnlyNote, type Filters } from './ext/ui';
import { AdHocPanel, AmendModal, PoContractNote, PoCurrency, PoImport, PoPrint, ReqBudget, ReqSourcing } from './PurchasingExtras';

const PO_PILL: Record<string, string> = {
  DRAFT: 'DRAFT',
  APPROVAL: 'SUBMITTED',
  REJECTED: 'REJECTED',
  TO_SEND: 'APPROVED',
  AWAITING: 'OPEN',
  PART_RECEIVED: 'PART_PAID',
  TO_BILL: 'OVERDUE',
  COMPLETED: 'POSTED',
  CANCELLED: 'VOID'
};

/* ================================================================== */
/* Requisitions                                                        */
/* ================================================================== */

type RFilter = 'ALL' | 'DRAFT' | 'SUBMITTED' | 'SOURCING' | 'ORDERED' | 'REJECTED';
const reqState = (r: Requisition): RFilter =>
  r.status === 'DRAFT' ? 'DRAFT' : r.status === 'SUBMITTED' ? 'SUBMITTED' : r.status === 'REJECTED' || r.status === 'VOID' ? 'REJECTED' : r.poId ? 'ORDERED' : 'SOURCING';
const REQ_LABEL: Record<RFilter, string> = { ALL: 'All', DRAFT: 'Draft', SUBMITTED: 'Awaiting approval', SOURCING: 'Sourcing', ORDERED: 'Ordered', REJECTED: 'Rejected' };
const REQ_PILL: Record<RFilter, string> = { ALL: '', DRAFT: 'DRAFT', SUBMITTED: 'SUBMITTED', SOURCING: 'APPROVED', ORDERED: 'POSTED', REJECTED: 'REJECTED' };

/** Mean hours from submission to the last approval, shown in days or hours. */
const approvalTime = (list: Requisition[]) => {
  const spans = list
    .filter((r) => r.approvals.length)
    .map((r) => {
      const sub = r.history.find((h) => h.action.startsWith('Submitted'));
      const last = r.approvals[r.approvals.length - 1];
      return sub ? (new Date(last.at).getTime() - new Date(sub.at).getTime()) / 3_600_000 : null;
    })
    .filter((h): h is number => h !== null && h >= 0);
  if (!spans.length) return '—';
  const hours = spans.reduce((a, b) => a + b, 0) / spans.length;
  return hours < 24 ? `${Math.max(1, Math.round(hours))} h` : `${(hours / 24).toFixed(1)} days`;
};

export const RequisitionsPage: React.FC = () => {
  const { state, procurement, clearFocus, party } = useCommercial();
  const ext = useProcurementExt();
  const [filter, setFilter] = useState<RFilter>('ALL');
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Requisition | 'new' | null>(null);
  const [asApprover, setAsApprover] = useState(false);
  const catOf = (r: Requisition) => state.products.find((p) => p.sku === r.lines[0]?.sku)?.category ?? (r.lines[0]?.serviceType ? 'Services' : 'Free text');
  useEffect(() => {
    if (procurement.focus === 'new') setEditing('new');
    else if (procurement.focus && state.requisitions.some((x) => x.id === procurement.focus)) setOpenId(procurement.focus);
    if (procurement.focus) clearFocus();
  }, [procurement.focus, state.requisitions, clearFocus]);

  const list = state.requisitions;
  const rows = list
    .filter((r) => filter === 'ALL' || reqState(r) === filter)
    .filter((r) => !q || `${r.number} ${r.department} ${r.requestedBy} ${r.justification}`.toLowerCase().includes(q.toLowerCase()))
    .filter((r) => passes(f, { category: catOf(r), supplier: r.awardedTo, date: r.date, value: reqTotal(r) }));
  const count = (f: RFilter) => list.filter((r) => f === 'ALL' || reqState(r) === f).length;
  const columns: Column<Requisition>[] = [
    { key: 'n', header: 'Requisition', render: (r) => <b className="sx-mono">{r.number}</b>, sort: (r) => r.number, width: 130 },
    {
      key: 'j',
      header: 'What and why',
      render: (r) => (
        <div className="sx-cell-main">
          <span>{r.lines.map((l) => l.description).join(', ')}</span>
          <small>
            {r.department} · {r.requestedBy}
          </small>
        </div>
      ),
      sort: (r) => r.department
    },
    { key: 'd', header: 'Needed by', render: (r) => fmtDate(r.neededBy), sort: (r) => r.neededBy, hideOnMobile: true },
    { key: 'q', header: 'Quotes', render: (r) => (r.quotes.length ? r.quotes.length : '—'), align: 'right', hideOnMobile: true },
    { key: 'v', header: 'Estimate', render: (r) => kes(reqTotal(r)), sort: reqTotal, align: 'right' },
    { key: 's', header: 'Status', render: (r) => <Pill status={REQ_PILL[reqState(r)]} label={REQ_LABEL[reqState(r)]} />, sort: reqState }
  ];
  const current = list.find((r) => r.id === openId);
  return (
    <SuitePage
      eyebrow="Purchasing"
      title="Purchase requisitions"
      subtitle="Departments ask, the manager approves, purchasing gets quotes and awards the order."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          <Plus size={15} /> New requisition
        </button>
      }
    >
      <ReadOnlyNote show={ext.readOnly} />
      <div className="sx-stats">
        <Stat label="Awaiting approval" value={count('SUBMITTED')} detail={kes(round2(list.filter((r) => reqState(r) === 'SUBMITTED').reduce((s, r) => s + reqTotal(r), 0)), { compact: true })} icon={<Clock3 size={17} />} tone="gold" onClick={() => setFilter('SUBMITTED')} />
        <Stat label="Sourcing" value={count('SOURCING')} detail="Approved — get quotes and award" icon={<Scale size={17} />} tone="blue" onClick={() => setFilter('SOURCING')} />
        <Stat label="Ordered" value={count('ORDERED')} detail="Turned into purchase orders" icon={<ClipboardList size={17} />} onClick={() => setFilter('ORDERED')} />
        <Stat label="Average approval time" value={approvalTime(list)} detail="From submission to final approval" icon={<CheckCircle2 size={17} />} tone="violet" />
      </div>
      <div className="sx-toolbar">
        <Chips value={filter} onChange={setFilter} options={(['ALL', 'DRAFT', 'SUBMITTED', 'SOURCING', 'ORDERED', 'REJECTED'] as RFilter[]).map((v) => ({ value: v, label: REQ_LABEL[v], count: count(v) }))} />
        <SearchBox value={q} onChange={setQ} placeholder="Search requisitions…" />
      </div>
      <div className="prx-inline">
        <FilterBar value={f} onChange={setF} categories={[...new Set(list.map(catOf))]} suppliers={[...new Set(list.map((r) => r.awardedTo).filter((x): x is string => !!x))].map((id) => ({ id, name: party(id)?.name ?? id }))} />
        <ExportCsvButton name="requisitions" header={['Number', 'Date', 'Department', 'Requested by', 'Needed by', 'Items', 'Estimate', 'Status', 'Awarded to', 'Budget line', 'Plan line']} rows={() => rows.map((r) => [r.number, r.date, r.department, r.requestedBy, r.neededBy, r.lines.map((l) => `${l.qty} ${l.description}`).join('; '), reqTotal(r), REQ_LABEL[reqState(r)], party(r.awardedTo ?? '')?.name ?? '', ext.state.reqExt[r.id]?.budgetAccount ?? '', ext.state.plan.lines.find((x) => x.id === ext.state.reqExt[r.id]?.planLineId)?.description ?? ''])} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} onRowClick={(r) => setOpenId(r.id)} selected={openId} initialSort={{ key: 'n', dir: 'desc' }} empty={<Empty icon={<ClipboardList size={20} />} title="No requisitions here" />} />
      {current && (
        <RequisitionDrawer
          r={current}
          onClose={() => setOpenId(null)}
          onEdit={(a) => {
            setAsApprover(!!a);
            setEditing(current);
          }}
        />
      )}
      {editing && (
        <RequisitionEditor
          req={editing === 'new' ? null : editing}
          asApprover={asApprover && editing !== 'new'}
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

const RequisitionDrawer: React.FC<{ r: Requisition; onClose: () => void; onEdit: (asApprover?: boolean) => void }> = ({ r, onClose, onEdit }) => {
  const { state, actor, party, submitRequisition, approveRequisition, rejectRequisition, award, setProcurement } = useCommercial();
  const ext = useProcurementExt();
  const [comment, setComment] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [awarding, setAwarding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const value = reqTotal(r);
  const rights = approvalRights(r, value, actor);
  const st = reqState(r);
  const sorted = [...r.quotes].sort((a, b) => quoteTotal(r, a) - quoteTotal(r, b));
  const best = sorted[0];
  const actions: FlowAction[] = [];
  if (r.status === 'DRAFT' || r.status === 'REJECTED') {
    actions.push({ label: 'Edit', onClick: () => onEdit(false), tone: 'secondary' });
    actions.push({ label: 'Submit', icon: <Send size={14} />, onClick: () => submitRequisition(r.id) });
  }
  if (rights.can) {
    actions.push({ label: 'Approve', icon: <CheckCircle2 size={14} />, onClick: () => approveRequisition(r.id, comment) });
    actions.push({ label: 'Correct quantities / prices', icon: <FilePen size={14} />, onClick: () => onEdit(true), tone: 'secondary' });
  }
  if (st === 'SOURCING') {
    actions.push({ label: 'Record a quote', icon: <Plus size={14} />, onClick: () => setQuoting(true), tone: 'secondary' });
    const pref = state.products.find((p) => p.sku === r.lines[0]?.sku)?.preferredSupplier;
    if (!r.quotes.length && pref) actions.push({ label: `Order from ${party(pref)?.name.split(' ')[0]}`, icon: <Award size={14} />, onClick: () => setAwarding(pref), tone: 'secondary' });
  }
  const po = state.purchaseOrders.find((p) => p.id === r.poId);
  return (
    <>
      <Drawer
        wide
        title={r.number}
        subtitle={`${r.department} · requested by ${r.requestedBy}`}
        badge={<Pill status={REQ_PILL[st]} label={REQ_LABEL[st]} />}
        onClose={onClose}
        footer={
          po && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setProcurement('orders', po.id)}>
              Open {po.number}
            </button>
          )
        }
      >
        <div className="sx-amount-hero">
          <div>
            <span>Estimated cost</span>
            <strong>{kes(value)}</strong>
          </div>
          <div>
            <span>Needed by</span>
            <b className={r.neededBy < TODAY && !r.poId ? 'sx-danger-text' : ''}>{fmtDate(r.neededBy)}</b>
          </div>
        </div>
        <p className="sx-note">{r.justification}</p>
        <ReqBudget r={r} />
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Estimate</th>
              {sorted.map((qt) => (
                <th key={qt.supplierId} style={{ textAlign: 'right' }} className="sx-hide-sm">
                  {party(qt.supplierId)?.name.split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td style={{ textAlign: 'right' }}>{l.qty}</td>
                <td style={{ textAlign: 'right' }}>{l.estPrice.toLocaleString()}</td>
                {sorted.map((qt) => {
                  const lowest = Math.min(...r.quotes.map((x) => x.prices[l.id] ?? Infinity));
                  return (
                    <td key={qt.supplierId} style={{ textAlign: 'right' }} className={`sx-hide-sm ${qt.prices[l.id] === lowest ? 'sx-success-text' : ''}`}>
                      {(qt.prices[l.id] ?? 0).toLocaleString()}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {r.quotes.length > 0 && (
          <>
            <h4 className="sx-subhead">Quote comparison</h4>
            <ul className="sx-quotes">
              {sorted.map((qt, i) => {
                const total = quoteTotal(r, qt);
                const stats = supplierStats(state, qt.supplierId, state.products);
                return (
                  <li key={qt.supplierId} className={`${i === 0 ? 'best' : ''} ${r.awardedTo === qt.supplierId ? 'awarded' : ''}`}>
                    <div>
                      <b>
                        {party(qt.supplierId)?.name} {i === 0 && <span className="sx-tag">Lowest</span>}
                        {r.awardedTo === qt.supplierId && <span className="sx-tag">Awarded</span>}
                      </b>
                      <small>
                        {qt.leadDays}-day delivery · {qt.notes}
                        {stats.onTime !== null && ` · ${Math.round(stats.onTime * 100)}% on time`}
                      </small>
                    </div>
                    <b>{kes(total)}</b>
                    {st === 'SOURCING' && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAwarding(qt.supplierId)}>
                        <Award size={14} /> Award
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {best && sorted.length > 1 && <p className="sx-note">Saving against the next quote: {kes(round2(quoteTotal(r, sorted[1]) - quoteTotal(r, best)))}</p>}
          </>
        )}

        {awarding && (
          <div className="sx-callout info">
            <Award size={16} />
            <div>
              <b>Award to {party(awarding)?.name}</b>
              <span>{best && best.supplierId !== awarding ? 'This is not the lowest quote — record why for the audit file.' : 'A draft purchase order will be created with these prices.'}</span>
              <div className="sx-inline-form">
                {best && best.supplierId !== awarding && <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Faster delivery, better quality record" />}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAwarding(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const res = award(r.id, awarding, reason);
                    if (res.ok && res.id) setProcurement('orders', res.id);
                  }}
                >
                  Create purchase order
                </button>
              </div>
            </div>
          </div>
        )}

        <ReqSourcing r={r} />
        <h4 className="sx-subhead">Approval</h4>
        {rights.can && <input className="form-control" placeholder="Approval comment (saved with your approval; required to reject)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Approval comment" />}
        <AdHocPanel docRef={`REQUISITION:${r.id}`} open={r.status === 'SUBMITTED' && !ext.readOnly} />
        <ApprovalPanel
          steps={<FlowSteps steps={['Requested', 'Approved', 'Quotes', 'Awarded']} at={st === 'DRAFT' || st === 'REJECTED' ? 0 : st === 'SUBMITTED' ? 1 : st === 'SOURCING' ? 2 : 4} off={st === 'REJECTED'} />}
          actions={actions}
          canReject={rights.can}
          onReject={(n) => rejectRequisition(r.id, n).ok}
          notes={[rights.reason]}
          actorLine={
            <>
              You are acting as <b>{actor.name}</b> ({actor.title}).
            </>
          }
          history={r.history}
        />
        <Attachments owner={`REQUISITION:${r.id}`} by={actor.name} readOnly={ext.readOnly} title="Specifications and quotes" />
      </Drawer>
      {quoting && <QuoteModal r={r} onClose={() => setQuoting(false)} />}
    </>
  );
};

const QuoteModal: React.FC<{ r: Requisition; onClose: () => void }> = ({ r, onClose }) => {
  const { addQuote } = useCommercial();
  const [supplierId, setSupplierId] = useState('');
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [leadDays, setLeadDays] = useState(7);
  const [notes, setNotes] = useState('');
  return (
    <Modal
      size="lg"
      title={`Record a supplier quote — ${r.number}`}
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">
            Quote total <b>{kes(quoteTotal(r, { prices }))}</b>
          </span>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => addQuote(r.id, { supplierId, prices, leadDays, notes, receivedAt: localStamp() }).ok && onClose()}>
            Save quote
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Supplier" required span={2}>
          <PartySelect kind="SUPPLIER" value={supplierId} onChange={setSupplierId} />
        </Field>
        <Field label="Delivery (days)">
          <input className="form-control" type="number" min="0" value={leadDays} onChange={(e) => setLeadDays(Number(e.target.value))} />
        </Field>
        <Field label="Notes">
          <input className="form-control" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <table className="sx-mini-table sx-alloc">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: 'right' }}>Qty</th>
            <th style={{ textAlign: 'right', width: 150 }}>Unit price</th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.description}</td>
              <td style={{ textAlign: 'right' }}>{l.qty}</td>
              <td>
                <div className="sx-alloc-cell">
                  <input className="form-control" type="number" min="0" placeholder={String(l.estPrice)} value={prices[l.id] || ''} onChange={(e) => setPrices({ ...prices, [l.id]: Number(e.target.value) })} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
};

const RequisitionEditor: React.FC<{ req: Requisition | null; asApprover?: boolean; onClose: () => void; onSaved: (id: string) => void }> = ({ req, asApprover, onClose, onSaved }) => {
  const { state, saveRequisition, submitRequisition } = useCommercial();
  const ext = useProcurementExt();
  const [x, setX] = useState({ budgetAccount: (req && ext.state.reqExt[req.id]?.budgetAccount) || '', planLineId: (req && ext.state.reqExt[req.id]?.planLineId) || '' });
  const accounts = ext.ctx.fin.state.accounts.filter((a) => a.type === 'EXPENSE' || a.code === '1200' || /^15[0-2]/.test(a.code));
  const [d, setD] = useState(() =>
    req
      ? { ...req, lines: req.lines.map((l) => ({ ...l })) }
      : { department: 'Operations', requestedBy: '', neededBy: addDays(TODAY, 14), justification: '', lines: [{ id: 'n1', sku: '', description: '', qty: 1, estPrice: 0 }] as ReqLine[] }
  );
  const setLine = (id: string, patch: Partial<ReqLine>) => setD({ ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const save = (submit: boolean) => {
    const r = saveRequisition(d, { asApprover });
    if (!r.ok || !r.id) return;
    if (!asApprover && (x.budgetAccount || x.planLineId || (req && ext.state.reqExt[req.id]))) ext.plan.setReqExt(r.id, { budgetAccount: x.budgetAccount || undefined, planLineId: x.planLineId || undefined });
    if (submit && !asApprover) submitRequisition(r.id);
    onSaved(r.id);
  };
  const budget = ext.budgetFor({ lines: d.lines, number: req?.number, id: req?.id }, x.budgetAccount || undefined);
  return (
    <Modal
      size="xl"
      title={asApprover && req ? `Correct ${req.number} before approving` : req ? `Edit ${req.number}` : 'New purchase requisition'}
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">
            Estimate <b>{kes(reqTotal(d))}</b>
          </span>
          <span className="sx-grow" />
          {asApprover ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => save(false)}>
              Save corrections
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => save(false)}>
                Save draft
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => save(true)}>
                Save & submit
              </button>
            </>
          )}
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Budget line" hint={budget.hasBudget ? `${kes(budget.available)} available after this request${budget.over ? ' — over budget, the Finance Director will approve' : ''}` : 'No budget on this account'}>
          <select className="form-control" value={x.budgetAccount} onChange={(e) => setX({ ...x, budgetAccount: e.target.value })} disabled={asApprover}>
            <option value="">From the item ({budget.account})</option>
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Procurement plan line">
          <select className="form-control" value={x.planLineId} onChange={(e) => setX({ ...x, planLineId: e.target.value })} disabled={asApprover}>
            <option value="">Not in the plan</option>
            {ext.state.plan.lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.description} (Q{l.quarter})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Department">
          <select className="form-control" value={d.department} onChange={(e) => setD({ ...d, department: e.target.value })}>
            {DEPARTMENTS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Requested by" required>
          <input className="form-control" value={d.requestedBy} onChange={(e) => setD({ ...d, requestedBy: e.target.value })} placeholder="Name or role" />
        </Field>
        <Field label="Needed by">
          <input className="form-control" type="date" value={d.neededBy} onChange={(e) => setD({ ...d, neededBy: e.target.value })} />
        </Field>
        <Field label="Why is it needed?" required span={4}>
          <input className="form-control" value={d.justification} onChange={(e) => setD({ ...d, justification: e.target.value })} />
        </Field>
      </div>
      <table className="sx-mini-table sx-alloc">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ width: 90 }}>Qty</th>
            <th style={{ width: 140 }}>Estimated unit cost</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l) => {
            const free = !l.sku && l.uom !== undefined;
            const last = l.sku ? lastPrice(state, l.sku) : null;
            const ct = l.sku ? contractPrice(ext.state.contracts, undefined, l.sku) : null;
            return (
            <tr key={l.id}>
              <td>
                <select
                  className="form-control"
                  aria-label="Item"
                  value={free ? '__free' : l.sku}
                  onChange={(e) => {
                    if (e.target.value === '__free') return setLine(l.id, { sku: '', description: '', uom: 'each', spec: '', serviceType: '' });
                    const p = state.products.find((x) => x.sku === e.target.value);
                    setLine(l.id, p ? { sku: p.sku, description: p.name, estPrice: ct?.price ?? p.cost, uom: undefined, spec: undefined, serviceType: undefined } : { sku: '', description: '', uom: undefined });
                  }}
                  disabled={asApprover}
                >
                  <option value="">Choose an item…</option>
                  <optgroup label="Materials">
                    {state.products
                      .filter((p) => p.kind === 'MATERIAL')
                      .map((p) => (
                        <option key={p.sku} value={p.sku}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Services">
                    {state.products
                      .filter((p) => p.kind === 'SERVICE' && p.category !== 'Services' && !p.sku.startsWith('SRV-'))
                      .map((p) => (
                        <option key={p.sku} value={p.sku}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                  <option value="__free">Something else — describe it (goods or a service)</option>
                </select>
                {free && (
                  <div className="prx-inline" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                    <input className="form-control" placeholder="What is needed" aria-label="Description" value={l.description} onChange={(e) => setLine(l.id, { description: e.target.value })} disabled={asApprover} />
                    <input className="form-control" style={{ maxWidth: 90 }} placeholder="Unit" aria-label="Unit" value={l.uom ?? ''} onChange={(e) => setLine(l.id, { uom: e.target.value })} disabled={asApprover} />
                    <select className="form-control" style={{ maxWidth: 180 }} aria-label="Service type" value={l.serviceType ?? ''} onChange={(e) => setLine(l.id, { serviceType: e.target.value })} disabled={asApprover}>
                      <option value="">Goods</option>
                      {SERVICE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          Service: {t}
                        </option>
                      ))}
                    </select>
                    <input className="form-control" placeholder="Specification / scope of work" aria-label="Specification" value={l.spec ?? ''} onChange={(e) => setLine(l.id, { spec: e.target.value })} disabled={asApprover} />
                  </div>
                )}
                {(last || ct) && (
                  <small className="sx-muted sx-block">
                    {ct ? `Contract ${ct.contract.number}: ${kes(ct.price)}` : ''}
                    {ct && last ? ' · ' : ''}
                    {last ? `Last paid ${kes(last.price)} on ${fmtDate(last.date)}` : ''}
                  </small>
                )}
              </td>
              <td>
                <input className="form-control" type="number" min="1" value={l.qty} onChange={(e) => setLine(l.id, { qty: Number(e.target.value) })} />
              </td>
              <td>
                <input className="form-control" type="number" min="0" value={l.estPrice || ''} onChange={(e) => setLine(l.id, { estPrice: Number(e.target.value) })} />
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      {!asApprover && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, lines: [...d.lines, { id: `n${d.lines.length + 1}${Date.now()}`, sku: '', description: '', qty: 1, estPrice: 0 }] })}>
          <Plus size={14} /> Add item
        </button>
      )}
    </Modal>
  );
};

/* ================================================================== */
/* Purchase orders                                                     */
/* ================================================================== */

type PFilter = 'ALL' | 'APPROVAL' | 'OPEN' | 'TO_BILL' | 'COMPLETED' | 'LATE';

export const PurchaseOrdersPage: React.FC = () => {
  const { state, party, procurement, clearFocus, poValue } = useCommercial();
  const ext = useProcurementExt();
  const [filter, setFilter] = useState<PFilter>('ALL');
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const catOf = (o: PurchaseOrder) => state.products.find((p) => p.sku === o.lines[0]?.sku)?.category ?? 'Free text';
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PurchaseOrder | 'new' | null>(null);
  useEffect(() => {
    if (procurement.focus === 'new') setEditing('new');
    else if (procurement.focus && state.purchaseOrders.some((x) => x.id === procurement.focus)) setOpenId(procurement.focus);
    if (procurement.focus) clearFocus();
  }, [procurement.focus, state.purchaseOrders, clearFocus]);

  const list = state.purchaseOrders;
  const match = (o: PurchaseOrder, f: PFilter) => {
    const s = poStage(o);
    return (
      f === 'ALL' ||
      (f === 'APPROVAL' && ['DRAFT', 'APPROVAL', 'REJECTED', 'TO_SEND'].includes(s)) ||
      (f === 'OPEN' && ['AWAITING', 'PART_RECEIVED'].includes(s)) ||
      (f === 'TO_BILL' && s === 'TO_BILL') ||
      (f === 'COMPLETED' && s === 'COMPLETED') ||
      (f === 'LATE' && poLate(o))
    );
  };
  const rows = list
    .filter((o) => match(o, filter))
    .filter((o) => !q || `${o.number} ${party(o.supplierId)?.name}`.toLowerCase().includes(q.toLowerCase()))
    .filter((o) => passes(f, { category: catOf(o), supplier: o.supplierId, date: o.date, value: poValue(o) }));
  const count = (f: PFilter) => list.filter((o) => match(o, f)).length;
  const spend = round2(list.filter((o) => o.status === 'APPROVED' && o.date.slice(0, 7) === TODAY.slice(0, 7)).reduce((s, o) => s + totals(o.lines, state.products).net, 0));
  const columns: Column<PurchaseOrder>[] = [
    { key: 'n', header: 'Order', render: (o) => <b className="sx-mono">{o.number}</b>, sort: (o) => o.number, width: 130 },
    {
      key: 's',
      header: 'Supplier',
      render: (o) => (
        <div className="sx-cell-main">
          <span>{party(o.supplierId)?.name}</span>
          <small>{o.lines.map((l) => l.description).join(', ')}</small>
        </div>
      ),
      sort: (o) => party(o.supplierId)?.name ?? ''
    },
    { key: 'd', header: 'Ordered', render: (o) => fmtDate(o.date), sort: (o) => o.date, hideOnMobile: true },
    {
      key: 'e',
      header: 'Expected',
      render: (o) => <span className={poLate(o) ? 'sx-danger-text' : ''}>{poLate(o) ? `${daysBetween(o.expected, TODAY)} days late` : fmtDate(o.expected)}</span>,
      sort: (o) => o.expected,
      hideOnMobile: true
    },
    { key: 'v', header: 'Value', render: (o) => kes(poValue(o)), sort: poValue, align: 'right' },
    { key: 'st', header: 'Stage', render: (o) => <Pill status={PO_PILL[poStage(o)]} label={PO_STAGE_LABEL[poStage(o)]} />, sort: (o) => poStage(o) }
  ];
  const current = list.find((o) => o.id === openId);
  return (
    <SuitePage
      eyebrow="Purchasing"
      title="Purchase orders"
      subtitle="Approved, sent, received by Stores and billed through Finance with a three-way match."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          <Plus size={15} /> New purchase order
        </button>
      }
    >
      <ReadOnlyNote show={ext.readOnly} />
      <div className="sx-stats">
        <Stat label="Needs action" value={count('APPROVAL')} detail="Drafts, approvals and orders to send" icon={<Clock3 size={17} />} tone="gold" onClick={() => setFilter('APPROVAL')} />
        <Stat label="Awaiting delivery" value={count('OPEN')} detail={count('LATE') ? `${count('LATE')} late` : 'All on schedule'} icon={<Truck size={17} />} tone={count('LATE') ? 'red' : 'blue'} onClick={() => setFilter(count('LATE') ? 'LATE' : 'OPEN')} />
        <Stat label="Received, not billed" value={count('TO_BILL')} detail="Raise the supplier bill in Finance" icon={<Receipt size={17} />} tone="violet" onClick={() => setFilter('TO_BILL')} />
        <Stat label="Ordered this month" value={kes(spend, { compact: true })} detail="Approved, before VAT" icon={<ClipboardList size={17} />} />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All', count: count('ALL') },
            { value: 'APPROVAL', label: 'Needs action', count: count('APPROVAL') },
            { value: 'OPEN', label: 'Awaiting delivery', count: count('OPEN') },
            { value: 'LATE', label: 'Late', count: count('LATE') },
            { value: 'TO_BILL', label: 'To bill', count: count('TO_BILL') },
            { value: 'COMPLETED', label: 'Completed', count: count('COMPLETED') }
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search purchase orders…" />
      </div>
      <div className="prx-inline">
        <FilterBar value={f} onChange={setF} categories={[...new Set(list.map(catOf))]} suppliers={[...new Set(list.map((o) => o.supplierId))].map((id) => ({ id, name: party(id)?.name ?? id }))} />
        <ExportCsvButton name="purchase-orders" header={['Number', 'Supplier', 'Date', 'Expected', 'Stage', 'Currency', 'Value incl. VAT', 'Lines']} rows={() => rows.map((o) => [o.number, party(o.supplierId)?.name ?? '', o.date, o.expected, PO_STAGE_LABEL[poStage(o)], ext.state.poExt[o.id]?.currency ?? 'KES', poValue(o), o.lines.map((l) => `${l.qty} ${l.description} @ ${l.price}`).join('; ')])} />
        {!ext.readOnly && <PoImport />}
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(o) => o.id} onRowClick={(o) => setOpenId(o.id)} selected={openId} initialSort={{ key: 'n', dir: 'desc' }} />
      {current && <PODrawer o={current} onClose={() => setOpenId(null)} onEdit={() => setEditing(current)} />}
      {editing && (
        <POEditor
          po={editing === 'new' ? null : editing}
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

const PODrawer: React.FC<{ o: PurchaseOrder; onClose: () => void; onEdit: () => void }> = ({ o, onClose, onEdit }) => {
  const { state, actor, party, submitPO, approvePO, rejectPO, sendPO, cancelPO, billPO, poValue, finance } = useCommercial();
  const ext = useProcurementExt();
  const [comment, setComment] = useState('');
  const [amending, setAmending] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [billing, setBilling] = useState(false);
  const [invNo, setInvNo] = useState('');
  const s = party(o.supplierId);
  const stage = poStage(o);
  const value = poValue(o);
  const rights = approvalRights(o, value, actor);
  const grns = state.receipts.filter((g) => g.poId === o.id);
  const req = state.requisitions.find((r) => r.id === o.requisitionId);
  const actions: FlowAction[] = [];
  if (o.status === 'DRAFT' || o.status === 'REJECTED') {
    actions.push({ label: 'Edit', onClick: onEdit, tone: 'secondary' });
    actions.push({ label: 'Submit', icon: <Send size={14} />, onClick: () => submitPO(o.id) });
  }
  if (rights.can) actions.push({ label: 'Approve', icon: <CheckCircle2 size={14} />, onClick: () => approvePO(o.id, comment) });
  if (o.status === 'APPROVED' && !o.closed && stage !== 'COMPLETED') actions.push({ label: 'Amend', icon: <FilePen size={14} />, onClick: () => setAmending(true), tone: 'secondary' });
  if (o.lines.some((l) => l.received > l.billed)) actions.push({ label: 'Capture supplier invoice', icon: <FileInput size={14} />, onClick: () => ext.go('invoices', 'new'), tone: 'secondary' });
  if (stage === 'TO_SEND') actions.push({ label: 'Send to supplier', icon: <Send size={14} />, onClick: () => sendPO(o.id) });
  if (stage === 'AWAITING' || stage === 'PART_RECEIVED') actions.push({ label: 'Receive goods', icon: <PackageCheck size={14} />, onClick: () => setReceiving(true), title: actor.role === 'OFFICER' ? 'Stores receives — switch to John Kiprop' : undefined });
  if (o.lines.some((l) => l.received > l.billed)) actions.push({ label: 'Raise bill in Finance', icon: <Receipt size={14} />, onClick: () => setBilling(true) });
  if (['DRAFT', 'APPROVAL', 'REJECTED', 'TO_SEND', 'AWAITING'].includes(stage)) actions.push({ label: 'Cancel', icon: <Ban size={14} />, onClick: () => cancelPO(o.id), tone: 'ghost' });
  const at = { DRAFT: 0, REJECTED: 0, APPROVAL: 1, TO_SEND: 2, AWAITING: 3, PART_RECEIVED: 3, TO_BILL: 4, COMPLETED: 6, CANCELLED: 0 }[stage];

  return (
    <>
      <Drawer
        wide
        title={o.number}
        subtitle={`${s?.name} · ordered ${fmtDate(o.date)}`}
        badge={<Pill status={PO_PILL[stage]} label={PO_STAGE_LABEL[stage]} />}
        onClose={onClose}
        footer={<PoPrint o={o} />}
      >
        <div className="sx-amount-hero">
          <div>
            <span>Order value</span>
            <strong>{kes(value)}</strong>
          </div>
          <div>
            <span>Expected</span>
            <b className={poLate(o) ? 'sx-danger-text' : ''}>{poLate(o) ? `${daysBetween(o.expected, TODAY)} days late` : fmtDate(o.expected)}</b>
          </div>
        </div>
        {billing && (
          <div className="sx-callout info">
            <Receipt size={16} />
            <div>
              <b>Supplier invoice details</b>
              <span>A bill is created in Finance with this order and the goods-received note already matched.</span>
              <div className="sx-inline-form">
                <input className="form-control" value={invNo} onChange={(e) => setInvNo(e.target.value)} placeholder="Supplier's invoice number" autoFocus />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => billPO(o.id, invNo).ok && setBilling(false)}>
                  Create bill
                </button>
              </div>
            </div>
          </div>
        )}
        <DefList
          items={[
            ['Supplier', s?.name ?? ''],
            ['Requisition', req?.number ?? '—'],
            ['Sent', o.sentAt ? fmtDate(o.sentAt.slice(0, 10)) : 'Not yet'],
            ['Prepared by', o.preparedBy]
          ]}
        />
        {o.notes && <p className="sx-note">{o.notes}</p>}
        <PoContractNote o={o} />
        <PoCurrency o={o} />
        <LinesTable lines={o.lines} products={state.products} progress={{ a: 'received', aLabel: 'Received', b: 'billed', bLabel: 'Billed' }} />
        {(grns.length > 0 || o.bills.length > 0) && (
          <>
            <h4 className="sx-subhead">Receipts and bills</h4>
            <ul className="sx-list">
              {grns.map((g) => (
                <li key={g.id}>
                  <span className="sx-mono">{g.number}</span>
                  <span>{fmtDate(g.date)}</span>
                  <span className="sx-muted">
                    Received by {g.receivedBy} · {g.deliveryNote}
                  </span>
                  <b>{g.lines.reduce((x, l) => x + l.qty, 0)} units</b>
                </li>
              ))}
              {o.bills.map((b) => {
                const doc = finance.state.documents.find((x) => x.id === b.id);
                return (
                  <li key={b.number}>
                    <span className="sx-mono">{b.number}</span>
                    <span>{doc ? fmtDate(doc.date) : ''}</span>
                    <span className="sx-muted">Bill in Finance</span>
                    <Pill status={doc?.status ?? 'DRAFT'} />
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <h4 className="sx-subhead">Progress</h4>
        {rights.can && <input className="form-control" placeholder="Approval comment (saved with your approval; required to reject)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Approval comment" />}
        <AdHocPanel docRef={`PO:${o.id}`} open={(o.status === 'SUBMITTED' || stage === 'TO_SEND') && !ext.readOnly} />
        <ApprovalPanel
          steps={<FlowSteps steps={['Order', 'Approval', 'Sent', 'Received', 'Billed']} at={at} off={stage === 'CANCELLED' || stage === 'REJECTED'} note={rights.needed > 1 ? { 1: `${o.approvals.length}/2 approvals` } : undefined} />}
          actions={actions}
          canReject={rights.can}
          onReject={(n) => rejectPO(o.id, n).ok}
          notes={[rights.reason]}
          actorLine={
            <>
              You are acting as <b>{actor.name}</b> ({actor.title}). Whoever raises an order cannot receive its goods.
            </>
          }
          history={o.history}
        />
        <Attachments owner={`PO:${o.id}`} by={actor.name} readOnly={ext.readOnly} title="Order documents" />
      </Drawer>
      {receiving && <ReceiveModal o={o} onClose={() => setReceiving(false)} />}
      {amending && <AmendModal o={o} onClose={() => setAmending(false)} />}
    </>
  );
};

const CHECKS = ['Quantity counted', 'Packaging intact', 'Labels / marks match', 'Moisture & smell (tea)', 'Documents received'];
type Detail = { lot?: string; serial?: string; expiry?: string; warehouse?: string; bin?: string; checks?: string[]; result?: 'PASS' | 'FAIL' | 'CONDITIONAL'; note?: string; garden?: string; grade?: string; saleNo?: string };

const ReceiveModal: React.FC<{ o: PurchaseOrder; onClose: () => void }> = ({ o, onClose }) => {
  const { receive, state } = useCommercial();
  const ext = useProcurementExt();
  const open = o.lines.filter((l) => l.received < l.qty);
  const asn = ext.state.asns.find((a) => a.poId === o.id && a.status === 'SUBMITTED');
  const [useAsn, setUseAsn] = useState(!!asn);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(open.map((l) => [l.id, asn?.lines.find((x) => x.lineId === l.id)?.qty ?? l.qty - l.received])));
  const [rej, setRej] = useState<Record<string, number>>({});
  const [detail, setDetail] = useState<Record<string, Detail>>(() =>
    Object.fromEntries(
      open.map((l) => {
        const it = ext.state.items.find((i) => i.sku === l.sku);
        return [l.id, { lot: asn?.lines.find((x) => x.lineId === l.id)?.lot ?? '', warehouse: it?.defaultWarehouse ?? 'WH-NBO', bin: it?.defaultBin ?? '', result: 'PASS', checks: [] }];
      })
    )
  );
  const [dn, setDn] = useState(asn ? `${asn.number} / ${asn.vehicle}` : '');
  const [notes, setNotes] = useState('');
  const kind = (sku: string) => state.products.find((p) => p.sku === sku)?.kind;
  const isService = (l: (typeof open)[number]) => !l.sku || kind(l.sku) === 'SERVICE';
  const allServices = open.every(isService);
  const set = (id: string, patch: Detail) => setDetail({ ...detail, [id]: { ...detail[id], ...patch } });
  const post = () => {
    ext.inventory.stageReceipt(o.id, detail, useAsn ? asn?.id : undefined);
    const r = receive(
      o.id,
      open.map((l) => ({ lineId: l.id, qty: qty[l.id] ?? 0, rejected: rej[l.id] ?? 0 })),
      dn,
      notes
    );
    if (r.ok) onClose();
  };
  return (
    <Modal
      size="xl"
      title={allServices ? `Confirm service delivered — ${o.number}` : `Receive goods — ${o.number}`}
      subtitle={allServices ? 'Acceptance certificate: confirm the work was done. Nothing is added to stock.' : 'Count what arrived, inspect it and say where it goes. Rejected items are not added to stock; failed inspection goes to quarantine.'}
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={post}>
            <PackageCheck size={14} /> {allServices ? 'Post acceptance certificate' : 'Post goods-received note'}
          </button>
        </>
      }
    >
      {asn && (
        <label className="prx-inline sx-callout info">
          <input type="checkbox" checked={useAsn} onChange={(e) => setUseAsn(e.target.checked)} /> Advance shipping notice {asn.number} from the supplier: {asn.carrier} {asn.vehicle}, ETA {fmtDate(asn.eta)} — quantities and lots pre-filled
        </label>
      )}
      <table className="sx-mini-table sx-alloc">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: 'right' }}>Outstanding</th>
            <th style={{ textAlign: 'right', width: 110 }}>{allServices ? 'Accepted' : 'Accepted'}</th>
            <th style={{ textAlign: 'right', width: 110 }}>Rejected</th>
          </tr>
        </thead>
        <tbody>
          {open.map((l) => {
            const d = detail[l.id] ?? {};
            const bins = ext.state.warehouses.find((w) => w.id === d.warehouse)?.bins ?? [];
            const tea = state.products.find((p) => p.sku === l.sku)?.category === 'Raw materials';
            const tracked = ext.state.items.find((i) => i.sku === l.sku);
            return (
              <React.Fragment key={l.id}>
                <tr>
                  <td>
                    {l.description}
                    {isService(l) && <small className="sx-muted"> · service</small>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{l.qty - l.received}</td>
                  <td>
                    <div className="sx-alloc-cell">
                      <input className="form-control" type="number" min="0" aria-label={`Accepted ${l.description}`} value={qty[l.id] ?? 0} onChange={(e) => setQty({ ...qty, [l.id]: Number(e.target.value) })} />
                    </div>
                  </td>
                  <td>
                    <div className="sx-alloc-cell">
                      <input className="form-control" type="number" min="0" aria-label={`Rejected ${l.description}`} value={rej[l.id] || ''} placeholder="0" onChange={(e) => setRej({ ...rej, [l.id]: Number(e.target.value) })} />
                    </div>
                  </td>
                </tr>
                {!isService(l) && (
                  <tr>
                    <td colSpan={4}>
                      <div className="prx-inline" style={{ flexWrap: 'wrap' }}>
                        <input className="form-control" style={{ maxWidth: 140 }} placeholder="Lot / batch" aria-label="Lot" value={d.lot ?? ''} onChange={(e) => set(l.id, { lot: e.target.value })} />
                        {tracked?.serialTracked && <input className="form-control" style={{ maxWidth: 140 }} placeholder="Serial no." aria-label="Serial" value={d.serial ?? ''} onChange={(e) => set(l.id, { serial: e.target.value })} />}
                        <input className="form-control" style={{ maxWidth: 150 }} type="date" aria-label="Expiry" value={d.expiry ?? ''} onChange={(e) => set(l.id, { expiry: e.target.value })} />
                        <select className="form-control" style={{ maxWidth: 200 }} aria-label="Warehouse" value={d.warehouse} onChange={(e) => set(l.id, { warehouse: e.target.value, bin: '' })}>
                          {ext.state.warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                        <select className="form-control" style={{ maxWidth: 100 }} aria-label="Bin" value={d.bin} onChange={(e) => set(l.id, { bin: e.target.value })}>
                          <option value="">Bin…</option>
                          {bins.map((b) => (
                            <option key={b}>{b}</option>
                          ))}
                        </select>
                        <select className="form-control" style={{ maxWidth: 160 }} aria-label="Inspection result" value={d.result} onChange={(e) => set(l.id, { result: e.target.value as Detail['result'] })}>
                          <option value="PASS">Inspection: pass</option>
                          <option value="CONDITIONAL">Pass with damage</option>
                          <option value="FAIL">Fail — quarantine</option>
                        </select>
                        {tea && (
                          <>
                            <input className="form-control" style={{ maxWidth: 130 }} placeholder="Garden" aria-label="Garden" value={d.garden ?? ''} onChange={(e) => set(l.id, { garden: e.target.value })} />
                            <input className="form-control" style={{ maxWidth: 90 }} placeholder="Grade" aria-label="Grade" value={d.grade ?? ''} onChange={(e) => set(l.id, { grade: e.target.value })} />
                            <input className="form-control" style={{ maxWidth: 110 }} placeholder="Sale no." aria-label="Sale number" value={d.saleNo ?? ''} onChange={(e) => set(l.id, { saleNo: e.target.value })} />
                          </>
                        )}
                      </div>
                      <div className="prx-inline" style={{ flexWrap: 'wrap' }}>
                        {CHECKS.map((c) => (
                          <label key={c} className="prx-inline">
                            <input type="checkbox" checked={d.checks?.includes(c) ?? false} onChange={(e) => set(l.id, { checks: e.target.checked ? [...(d.checks ?? []), c] : (d.checks ?? []).filter((x) => x !== c) })} /> {c}
                          </label>
                        ))}
                        <input className="form-control" placeholder="Inspection note" aria-label="Inspection note" value={d.note ?? ''} onChange={(e) => set(l.id, { note: e.target.value })} />
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="sx-grid sx-grid-2">
        <Field label={allServices ? 'Supplier job card / completion ref.' : 'Supplier delivery note no.'} required>
          <input className="form-control" value={dn} onChange={(e) => setDn(e.target.value)} />
        </Field>
        <Field label="Condition / notes">
          <input className="form-control" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 2 cartons damaged" />
        </Field>
      </div>
    </Modal>
  );
};

const POEditor: React.FC<{ po: PurchaseOrder | null; onClose: () => void; onSaved: (id: string) => void }> = ({ po, onClose, onSaved }) => {
  const { savePO, submitPO } = useCommercial();
  const [d, setD] = useState(() => (po ? { ...po, lines: po.lines.map((l) => ({ ...l })) as Line[] } : { supplierId: '', expected: addDays(TODAY, 10), notes: '', lines: [newLine()] as Line[] }));
  const save = (submit: boolean) => {
    const r = savePO(d);
    if (!r.ok || !r.id) return;
    if (submit) submitPO(r.id);
    onSaved(r.id);
  };
  return (
    <Modal
      size="xl"
      title={po ? `Edit ${po.number}` : 'New purchase order'}
      subtitle="Orders above KES 1M need the Finance Director as well as the Commercial Manager"
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
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
        <Field label="Supplier" required span={2}>
          <PartySelect kind="SUPPLIER" value={d.supplierId} onChange={(v) => setD({ ...d, supplierId: v })} />
        </Field>
        <Field label="Expected delivery">
          <input className="form-control" type="date" value={d.expected} onChange={(e) => setD({ ...d, expected: e.target.value })} />
        </Field>
        <Field label="Notes">
          <input className="form-control" value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </Field>
      </div>
      <LinesEditor lines={d.lines} onChange={(lines) => setD({ ...d, lines })} mode="BUY" />
    </Modal>
  );
};

/* ================================================================== */
/* Goods received                                                      */
/* ================================================================== */

export const ReceiptsPage: React.FC = () => {
  const { state, party } = useCommercial();
  const [openId, setOpenId] = useState<string | null>(null);
  const poOf = (g: GoodsReceipt) => state.purchaseOrders.find((o) => o.id === g.poId)!;
  const columns: Column<GoodsReceipt>[] = [
    { key: 'n', header: 'GRN', render: (g) => <b className="sx-mono">{g.number}</b>, sort: (g) => g.number, width: 140 },
    {
      key: 's',
      header: 'Supplier',
      render: (g) => (
        <div className="sx-cell-main">
          <span>{party(poOf(g).supplierId)?.name}</span>
          <small>
            {poOf(g).number} · {g.deliveryNote}
          </small>
        </div>
      ),
      sort: (g) => party(poOf(g).supplierId)?.name ?? ''
    },
    { key: 'd', header: 'Received', render: (g) => fmtDate(g.date), sort: (g) => g.date },
    {
      key: 'o',
      header: 'On time',
      render: (g) => (g.date <= poOf(g).expected ? <Pill status="POSTED" label="On time" /> : <Pill status="OVERDUE" label={`${daysBetween(poOf(g).expected, g.date)} days late`} />),
      hideOnMobile: true
    },
    { key: 'q', header: 'Units', render: (g) => g.lines.reduce((x, l) => x + l.qty, 0), align: 'right' },
    { key: 'r', header: 'By', render: (g) => g.receivedBy, hideOnMobile: true }
  ];
  const current = state.receipts.find((g) => g.id === openId);
  const late = state.receipts.filter((g) => g.date > poOf(g).expected).length;
  return (
    <SuitePage eyebrow="Stores" title="Goods received" subtitle="Every delivery counted in at the gate, linked to its purchase order.">
      <div className="sx-stats">
        <Stat label="Receipts" value={state.receipts.length} icon={<PackageCheck size={17} />} />
        <Stat label="This month" value={state.receipts.filter((g) => g.date.slice(0, 7) === TODAY.slice(0, 7)).length} icon={<PackageCheck size={17} />} tone="blue" />
        <Stat label="Late deliveries" value={late} detail={`${Math.round(((state.receipts.length - late) / Math.max(1, state.receipts.length)) * 100)}% on time`} icon={<AlertTriangle size={17} />} tone={late ? 'gold' : 'green'} />
        <Stat label="Awaiting delivery" value={state.purchaseOrders.filter((o) => ['AWAITING', 'PART_RECEIVED'].includes(poStage(o))).length} icon={<Truck size={17} />} tone="violet" />
      </div>
      <DataTable rows={state.receipts} columns={columns} rowKey={(g) => g.id} onRowClick={(g) => setOpenId(g.id)} selected={openId} initialSort={{ key: 'd', dir: 'desc' }} />
      {current && <GrnDrawer g={current} po={poOf(current)} onClose={() => setOpenId(null)} />}
    </SuitePage>
  );
};

const GrnDrawer: React.FC<{ g: GoodsReceipt; po: PurchaseOrder; onClose: () => void }> = ({ g, po, onClose }) => {
  const { party, actor } = useCommercial();
  const ext = useProcurementExt();
  const x = ext.state.grnExt[g.id];
  const [reason, setReason] = useState('');
  const [ret, setRet] = useState<{ lineId: string; qty: number; reason: string } | null>(null);
  const [cap, setCap] = useState<{ lineId: string; name: string; category: string; costAccount: string; lifeMonths: number; location: string } | null>(null);
  const desc = (lineId: string) => po.lines.find((l) => l.id === lineId)?.description ?? '';
  const reversed = g.notes.startsWith('[Reversed');
  const lots = ext.state.lots.filter((l) => x?.lots.includes(l.id));
  const returned = (lineId: string) => ext.state.moves.filter((m) => m.kind === 'RETURN_TO_SUPPLIER' && m.reason.startsWith(`${g.number}:${lineId}`)).reduce((a, m) => a + m.qty, 0);
  return (
    <Drawer
      wide
      title={g.number}
      subtitle={`${party(po.supplierId)?.name} · ${po.number}${x?.service ? ' · service acceptance' : ''}`}
      badge={reversed ? <Pill status="VOID" label="Reversed" /> : undefined}
      onClose={onClose}
      footer={
        <PrintButton
          label={x?.service ? 'Print acceptance certificate' : 'Print GRN'}
          title={g.number}
          html={() => docHtml(ext.state, 'Goods received note', g.number, [['Date', fmtDate(g.date)], ['Order', po.number], ['Supplier DN', g.deliveryNote], ['Notes', g.notes || '—']], { head: ['Item', 'Accepted', 'Rejected', 'Inspection'], rows: g.lines.map((l) => [desc(l.lineId), l.qty, l.rejected, x?.inspection[l.lineId]?.result ?? '—']) }, { party: party(po.supplierId)?.name, signers: [`Received by: ${g.receivedBy}`, 'Inspected by'] })}
        />
      }
    >
      <DefList items={[['Received', fmtDate(g.date)], ['Received by', g.receivedBy], ['Delivery note', g.deliveryNote], ['Into', x?.warehouse || '—'], ['Notes', g.notes || '—']]} />
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: 'right' }}>Accepted</th>
            <th style={{ textAlign: 'right' }}>Rejected</th>
            <th>Inspection</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {g.lines.map((l) => {
            const ins = x?.inspection[l.lineId];
            const capd = x?.assets?.includes(l.lineId);
            return (
              <tr key={l.lineId}>
                <td>{desc(l.lineId)}</td>
                <td style={{ textAlign: 'right' }}>{l.qty}</td>
                <td style={{ textAlign: 'right' }} className={l.rejected ? 'sx-danger-text' : ''}>
                  {l.rejected}
                  {returned(l.lineId) > 0 && <small className="sx-block">{returned(l.lineId)} returned</small>}
                </td>
                <td>{ins ? `${ins.result.toLowerCase()}${ins.checks.length ? ` · ${ins.checks.length} checks` : ''}${ins.note ? ` · ${ins.note}` : ''}` : '—'}</td>
                <td>
                  {!reversed && l.rejected - returned(l.lineId) > 0 && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRet({ lineId: l.lineId, qty: l.rejected - returned(l.lineId), reason: '' })}>
                      <Undo2 size={13} /> Return to supplier
                    </button>
                  )}
                  {!reversed && l.qty > 0 && (capd ? <small className="sx-muted">Capitalised</small> : (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCap({ lineId: l.lineId, name: desc(l.lineId), category: 'Plant & machinery', costAccount: '1510', lifeMonths: 60, location: x?.warehouse || 'WH-NBO' })}>
                      <Building2 size={13} /> Capitalise
                    </button>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {lots.length > 0 && (
        <>
          <h4 className="sx-subhead">Lots created</h4>
          <ul className="sx-list">
            {lots.map((l) => (
              <li key={l.id}>
                <span className="sx-mono">{l.lot}</span>
                <span>
                  {l.warehouse} · {l.bin}
                </span>
                <span className="sx-muted">{l.expiry ? `expires ${fmtDate(l.expiry)}` : ''}</span>
                <b>{l.condition.toLowerCase()}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      {ret && (
        <div className="sx-callout warn">
          <Undo2 size={16} />
          <div>
            <b>Return rejected goods — a debit note is raised</b>
            <div className="sx-inline-form">
              <input className="form-control" type="number" min="1" style={{ maxWidth: 100 }} value={ret.qty} onChange={(e) => setRet({ ...ret, qty: Number(e.target.value) })} aria-label="Return quantity" />
              <input className="form-control" placeholder="Reason" value={ret.reason} onChange={(e) => setRet({ ...ret, reason: e.target.value })} aria-label="Return reason" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.inventory.returnToSupplier(g.id, ret.lineId, ret.qty, ret.reason).ok && setRet(null)}>
                Return
              </button>
            </div>
          </div>
        </div>
      )}
      {cap && (
        <Modal
          size="md"
          title="Capitalise as a fixed asset"
          subtitle="Moves the cost from the expense account to the asset register in Finance."
          onClose={() => setCap(null)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.inventory.capitalise(g.id, cap.lineId, cap.name, cap.category, cap.costAccount, cap.lifeMonths, cap.location).ok && setCap(null)}>
              Add to asset register
            </button>
          }
        >
          <div className="sx-grid">
            <Field label="Asset name" span={2}>
              <input className="form-control" value={cap.name} onChange={(e) => setCap({ ...cap, name: e.target.value })} />
            </Field>
            <Field label="Asset class">
              <select className="form-control" value={cap.costAccount} onChange={(e) => setCap({ ...cap, costAccount: e.target.value, category: e.target.selectedOptions[0].text })}>
                <option value="1500">Motor vehicles</option>
                <option value="1510">Plant & machinery</option>
                <option value="1520">Computers & office equipment</option>
              </select>
            </Field>
            <Field label="Useful life (months)">
              <input className="form-control" type="number" min="1" value={cap.lifeMonths} onChange={(e) => setCap({ ...cap, lifeMonths: Number(e.target.value) })} />
            </Field>
            <Field label="Location" span={2}>
              <input className="form-control" value={cap.location} onChange={(e) => setCap({ ...cap, location: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
      {!reversed && actor.role === 'MANAGER' && (
        <>
          <h4 className="sx-subhead">Reverse this receipt</h4>
          <div className="sx-inline-form">
            <input className="form-control" placeholder="Why it was posted in error" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reversal reason" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.inventory.reverseReceipt(g.id, reason)}>
              Reverse GRN
            </button>
          </div>
        </>
      )}
      <Attachments owner={`GRN:${g.id}`} by={actor.name} readOnly={ext.readOnly} title="Delivery documents and photos" />
    </Drawer>
  );
};

/* ================================================================== */
/* Suppliers                                                           */
/* ================================================================== */

export const SuppliersPage: React.FC = () => {
  const { state, finance } = useCommercial();
  const ext = useProcurementExt();
  const rows = finance.state.parties
    .filter((p) => p.kind === 'SUPPLIER')
    .map((p) => ({ p, ...supplierStats(state, p.id, state.products) }))
    .filter((r) => r.orders > 0 || ['Materials', 'Raw materials', 'Maintenance', 'Office'].includes(r.p.category));
  type Row = (typeof rows)[number];
  const score = (r: Row) => (r.onTime === null ? null : Math.round(((r.onTime ?? 0) * 0.6 + (r.quality ?? 1) * 0.4) * 5 * 10) / 10);
  const columns: Column<Row>[] = [
    {
      key: 'n',
      header: 'Supplier',
      render: (r) => (
        <div className="sx-cell-main">
          <span>{r.p.name}</span>
          <small>
            {r.p.category} · {r.p.terms}-day terms
          </small>
        </div>
      ),
      sort: (r) => r.p.name
    },
    { key: 'o', header: 'Orders', render: (r) => r.orders, sort: (r) => r.orders, align: 'right' },
    { key: 's', header: 'Spend this year', render: (r) => kes(r.spend, { compact: true }), sort: (r) => r.spend, align: 'right' },
    {
      key: 't',
      header: 'On time',
      render: (r) =>
        r.onTime === null ? (
          <span className="sx-muted">No deliveries yet</span>
        ) : (
          <div className="sx-meter-cell">
            <Meter value={r.onTime} tone={r.onTime < 0.8 ? 'gold' : 'green'} />
            <small>{Math.round(r.onTime * 100)}%</small>
          </div>
        ),
      sort: (r) => r.onTime ?? -1,
      width: 160,
      hideOnMobile: true
    },
    {
      key: 'sc',
      header: 'Rating',
      render: (r) =>
        score(r) === null ? (
          '—'
        ) : (
          <span className="sx-rating">
            <Star size={13} /> {score(r)}
          </span>
        ),
      sort: (r) => score(r) ?? -1,
      align: 'right'
    },
    { key: 'op', header: 'Open orders', render: (r) => r.open || '—', align: 'right', hideOnMobile: true }
  ];
  return (
    <SuitePage
      eyebrow="Purchasing"
      title="Supplier accounts"
      subtitle="Spend, on-time delivery and quality for each supplier — the facts behind every award decision."
      actions={
        <>
          <ExportCsvButton name="supplier-performance" header={['Supplier', 'Category', 'Terms', 'Orders', 'Spend', 'On time %', 'Open orders']} rows={() => rows.map((r) => [r.p.name, r.p.category, r.p.terms, r.orders, r.spend, r.onTime === null ? '' : Math.round(r.onTime * 100), r.open])} />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.go('vendors')}>
            Onboarding, documents & scorecards
          </button>
        </>
      }
    >
      <div className="sx-stats">
        <Stat label="Active suppliers" value={rows.filter((r) => r.orders).length} icon={<Truck size={17} />} />
        <Stat label="Spend this year" value={kes(round2(rows.reduce((s, r) => s + r.spend, 0)), { compact: true })} detail="Approved purchase orders" icon={<ClipboardList size={17} />} tone="blue" />
        <Stat
          label="On-time delivery"
          value={`${Math.round((state.receipts.filter((g) => g.date <= (state.purchaseOrders.find((o) => o.id === g.poId)?.expected ?? g.date)).length / Math.max(1, state.receipts.length)) * 100)}%`}
          icon={<PackageCheck size={17} />}
          tone="violet"
        />
        <Stat label="Quotes on file" value={state.requisitions.reduce((s, r) => s + r.quotes.length, 0)} detail="Competitive quotes collected" icon={<Scale size={17} />} tone="gold" />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.p.id} initialSort={{ key: 's', dir: 'desc' }} />
    </SuitePage>
  );
};
