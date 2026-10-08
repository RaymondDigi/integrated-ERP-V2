import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Printer, Trash2, Wallet, FileText, AlertTriangle, PackageCheck, PackageX, Receipt, Clock3 } from 'lucide-react';
import { useFinance, type DocumentDraft } from '../store';
import {
  addDays,
  daysBetween,
  docBalance,
  docTotals,
  fmtDate,
  isOverdue,
  kes,
  payState,
  periodOf,
  rateOn,
  round2,
  TODAY,
  VAT_RATE
} from '../engine';
import { DEPARTMENTS } from '../data';
import type { DocLine, FinDocument } from '../types';
import { Chips, DataTable, DefList, Drawer, Empty, Field, Modal, Pill, SearchBox, Stat, SuitePage, type Column } from '../../ui/kit';
import { AccountSelect, PrintHeader, useLookups, WorkflowPanel } from '../parts';
import { SettlementEditor } from './Settlements';
import { printArea } from '../../../views/ess/EssRecords';
import { Simulated, num, usePrompt } from '../ext/ui';

type Kind = FinDocument['kind'];
type Filter = 'ALL' | 'DRAFTS' | 'APPROVAL' | 'UNPAID' | 'OVERDUE' | 'PAID';

const COPY = {
  INVOICE: { eyebrow: 'Receivables', title: 'Sales invoices', one: 'invoice', party: 'Customer', partyKind: 'CUSTOMER' as const, settle: 'Record receipt' },
  BILL: { eyebrow: 'Payables', title: 'Supplier bills', one: 'bill', party: 'Supplier', partyKind: 'SUPPLIER' as const, settle: 'Pay this bill' }
};

export const DocumentsPage: React.FC<{ kind: Kind }> = ({ kind }) => {
  const { state, focus, setFocus } = useFinance();
  const { party } = useLookups();
  const copy = COPY[kind];
  const [filter, setFilter] = useState<Filter>('ALL');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<FinDocument | 'new' | null>(null);

  useEffect(() => {
    if (focus === 'new') {
      setEditing('new');
      setFocus(null);
    } else if (focus && state.documents.some((d) => d.id === focus && d.kind === kind)) {
      setOpenId(focus);
      setFocus(null);
    }
  }, [focus, kind, state.documents, setFocus]);

  const docs = state.documents.filter((d) => d.kind === kind);
  const tag = (d: FinDocument): Filter[] => {
    const t: Filter[] = ['ALL'];
    if (d.status === 'DRAFT' || d.status === 'REJECTED') t.push('DRAFTS');
    if (d.status === 'SUBMITTED' || d.status === 'APPROVED') t.push('APPROVAL');
    if (d.status === 'POSTED') {
      const ps = payState(state, d);
      if (ps !== 'PAID') t.push('UNPAID');
      if (isOverdue(state, d)) t.push('OVERDUE');
      if (ps === 'PAID') t.push('PAID');
    }
    return t;
  };
  const counts = (f: Filter) => docs.filter((d) => tag(d).includes(f)).length;
  const rows = docs
    .filter((d) => tag(d).includes(filter))
    .filter((d) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return d.number.toLowerCase().includes(s) || d.reference.toLowerCase().includes(s) || (party(d.partyId)?.name.toLowerCase().includes(s) ?? false);
    });

  const posted = docs.filter((d) => d.status === 'POSTED');
  const outstanding = round2(posted.reduce((s, d) => s + docBalance(state, d), 0));
  const overdueDocs = posted.filter((d) => isOverdue(state, d));
  const overdue = round2(overdueDocs.reduce((s, d) => s + docBalance(state, d), 0));
  const month = periodOf(TODAY);
  const billed = round2(posted.filter((d) => periodOf(d.date) === month).reduce((s, d) => s + docTotals(d).total, 0));

  const columns: Column<FinDocument>[] = [
    { key: 'number', header: 'Number', render: (d) => <b className="sx-mono">{d.number}</b>, sort: (d) => d.number, width: 130 },
    {
      key: 'party',
      header: copy.party,
      render: (d) => (
        <div className="sx-cell-main">
          <span>{party(d.partyId)?.name}</span>
          <small>{d.reference || '—'}</small>
        </div>
      ),
      sort: (d) => party(d.partyId)?.name ?? ''
    },
    { key: 'date', header: 'Date', render: (d) => fmtDate(d.date), sort: (d) => d.date, hideOnMobile: true },
    {
      key: 'due',
      header: 'Due',
      render: (d) => {
        const late = isOverdue(state, d);
        return <span className={late ? 'sx-danger-text' : ''}>{late ? `${daysBetween(d.dueDate, TODAY)} days late` : fmtDate(d.dueDate)}</span>;
      },
      sort: (d) => d.dueDate,
      hideOnMobile: true
    },
    { key: 'total', header: 'Amount', render: (d) => kes(docTotals(d).total), sort: (d) => docTotals(d).total, align: 'right' },
    {
      key: 'balance',
      header: 'Balance',
      render: (d) => (d.status === 'POSTED' ? <b>{kes(docBalance(state, d))}</b> : <span className="sx-muted">—</span>),
      sort: (d) => (d.status === 'POSTED' ? docBalance(state, d) : 0),
      align: 'right',
      hideOnMobile: true
    },
    {
      key: 'status',
      header: 'Status',
      render: (d) =>
        d.status !== 'POSTED' ? <Pill status={d.status} /> : isOverdue(state, d) ? <Pill status="OVERDUE" /> : <Pill status={payState(state, d)} />,
      sort: (d) => d.status
    }
  ];

  const open = docs.find((d) => d.id === openId) ?? null;

  return (
    <SuitePage
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={
        kind === 'INVOICE'
          ? 'Bill customers, follow up what is owed and see every invoice from draft to paid.'
          : 'Capture supplier invoices, match them to orders and goods received, and schedule payment.'
      }
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          <Plus size={15} /> New {copy.one}
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Outstanding" value={kes(outstanding, { compact: true })} detail={`${posted.filter((d) => docBalance(state, d) > 0).length} open ${copy.one}s`} icon={<Wallet size={17} />} onClick={() => setFilter('UNPAID')} />
        <Stat label="Overdue" value={kes(overdue, { compact: true })} detail={`${overdueDocs.length} past their due date`} icon={<AlertTriangle size={17} />} tone={overdue ? 'red' : 'slate'} onClick={() => setFilter('OVERDUE')} />
        <Stat label="In approval" value={counts('APPROVAL')} detail="Submitted or approved, not yet posted" icon={<Clock3 size={17} />} tone="gold" onClick={() => setFilter('APPROVAL')} />
        <Stat label={kind === 'INVOICE' ? 'Billed this month' : 'Billed to us this month'} value={kes(billed, { compact: true })} detail="Posted, including VAT" icon={<Receipt size={17} />} tone="blue" />
      </div>

      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All', count: counts('ALL') },
            { value: 'DRAFTS', label: 'Drafts', count: counts('DRAFTS') },
            { value: 'APPROVAL', label: 'In approval', count: counts('APPROVAL') },
            { value: 'UNPAID', label: 'Unpaid', count: counts('UNPAID') },
            { value: 'OVERDUE', label: 'Overdue', count: counts('OVERDUE') },
            { value: 'PAID', label: 'Paid', count: counts('PAID') }
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder={`Search ${copy.one}s…`} />
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(d) => d.id}
        onRowClick={(d) => setOpenId(d.id)}
        selected={openId}
        initialSort={{ key: 'date', dir: 'desc' }}
        empty={<Empty icon={<FileText size={20} />} title={`No ${copy.one}s here`} text="Try another filter or search." />}
      />

      {open && <DocumentDrawer doc={open} onClose={() => setOpenId(null)} onEdit={() => setEditing(open)} />}
      {editing && (
        <DocumentEditor
          kind={kind}
          doc={editing === 'new' ? null : editing}
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

/* ------------------------------------------------------------------ */
/* Document actions: holds, e-invoicing, disputes, write-off, transfer, chargeback, PO match */
/* ------------------------------------------------------------------ */

const DocActions: React.FC<{ doc: FinDocument; balance: number }> = ({ doc, balance }) => {
  const f = useFinance();
  const { state } = f;
  const prompt = usePrompt();
  const isAR = doc.kind === 'INVOICE';
  const posted = doc.status === 'POSTED';
  const reasons = state.reasonCodes.map((r) => ({ value: r.code, label: `${r.code} · ${r.label}` }));
  const others = state.parties.filter((p) => p.kind === (isAR ? 'CUSTOMER' : 'SUPPLIER') && p.id !== doc.partyId).map((p) => ({ value: p.id, label: p.name }));
  const d = doc.delivery;
  return (
    <>
      <h4 className="sx-subhead">Actions</h4>
      {doc.hold && (
        <p className="sx-note sx-danger-text">
          On payment hold: {doc.hold.reason} ({doc.hold.by}, {fmtDate(doc.hold.at)})
        </p>
      )}
      {d && (
        <p className="sx-note">
          Sent by {d.channel} on {fmtDate(d.sentAt)} · {d.status}
          {d.etims && <> · eTIMS CU {d.etims.cuInvoiceNo}</>}
          {d.payLink && <> · pay link {d.payLink}</>}
          {d.dispute && !d.dispute.resolved && <> · disputed: {d.dispute.reason}</>} <Simulated what="eTIMS / email delivery" />
        </p>
      )}
      <div className="fx-row-actions" data-testid="doc-actions">
        {doc.hold ? (
          <button type="button" className="sx-link" onClick={() => f.releaseDocument(doc.id)}>
            Release hold
          </button>
        ) : (
          <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Hold ${doc.number}`, fields: [{ key: 'reason', label: 'Reason', required: true }], submitLabel: 'Place hold', onSubmit: (v) => f.holdDocument(doc.id, v.reason) })}>
            Place payment hold
          </button>
        )}
        {isAR && posted && (
          <>
            <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Send ${doc.number}`, fields: [{ key: 'ch', label: 'Channel', type: 'select', options: [{ value: 'ETIMS', label: 'KRA eTIMS + email' }, { value: 'EMAIL', label: 'Email only' }, { value: 'PORTAL', label: 'Customer portal' }] }], submitLabel: 'Send', onSubmit: (v) => f.sendInvoice(doc.id, v.ch as 'ETIMS' | 'EMAIL' | 'PORTAL') })}>
              {d ? 'Resend e-invoice' : 'Send e-invoice'}
            </button>
            {d && !d.payLink && balance > 0 && (
              <button type="button" className="sx-link" onClick={() => f.payByLink(doc.id)}>
                Simulate pay-by-link payment
              </button>
            )}
            {d && (!d.dispute || d.dispute.resolved) ? (
              <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Dispute on ${doc.number}`, fields: [{ key: 'reason', label: 'Customer dispute reason', required: true }], onSubmit: (v) => f.disputeInvoice(doc.id, v.reason) })}>
                Log dispute
              </button>
            ) : d?.dispute ? (
              <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Resolve dispute on ${doc.number}`, fields: [{ key: 'res', label: 'Resolution', required: true }], onSubmit: (v) => f.resolveDispute(doc.id, v.res) })}>
                Resolve dispute
              </button>
            ) : null}
          </>
        )}
        {posted && balance > 0 && (
          <>
            <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Write off ${doc.number}`, fields: [{ key: 'amount', label: 'Amount', type: 'number', initial: balance, required: true }, { key: 'reason', label: 'Reason code', type: 'select', options: reasons }, { key: 'date', label: 'Date', type: 'date', initial: TODAY }], submitLabel: 'Write off', onSubmit: (v) => f.writeOff(doc.id, num(v.amount), v.reason, v.date) })}>
              Write off balance
            </button>
            <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Transfer ${doc.number}`, subtitle: `Moves the open balance to another ${isAR ? 'customer' : 'supplier'}.`, fields: [{ key: 'to', label: 'To', type: 'select', options: others }, { key: 'reason', label: 'Reason', required: true }], submitLabel: 'Transfer', onSubmit: (v) => f.transferInvoice(doc.id, v.to, v.reason) })}>
              Transfer to another account
            </button>
            {isAR && (
              <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Chargeback on ${doc.number}`, subtitle: 'Splits the disputed short payment into its own open item.', fields: [{ key: 'reason', label: 'Reason', required: true }], submitLabel: 'Create chargeback', onSubmit: (v) => f.chargeback(doc.id, v.reason) })}>
                Chargeback
              </button>
            )}
          </>
        )}
        {!isAR && (
          <>
            <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Three-way match for ${doc.number}`, fields: [{ key: 'po', label: 'PO number', initial: doc.match?.po ?? doc.poNumber ?? '' }, { key: 'grn', label: 'GRN number', initial: doc.match?.grn ?? '' }, { key: 'poAmount', label: 'PO amount', type: 'number' }, { key: 'grnQty', label: 'Quantity received', type: 'number' }, { key: 'billQty', label: 'Quantity billed', type: 'number' }], submitLabel: 'Check match', onSubmit: (v) => f.recordMatch(doc.id, { po: v.po, grn: v.grn, poAmount: num(v.poAmount), grnQty: num(v.grnQty), billQty: num(v.billQty) }) })}>
              Record PO / GRN match
            </button>
            {doc.match && !doc.match.matched && (
              <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Override match on ${doc.number}`, subtitle: 'Directors only. The reason is kept on the bill and in the audit trail.', fields: [{ key: 'reason', label: 'Reason', required: true }], submitLabel: 'Override', onSubmit: (v) => f.overrideMatch(doc.id, v.reason) })}>
                Override match exception
              </button>
            )}
          </>
        )}
      </div>
      {prompt.node}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Detail drawer                                                       */
/* ------------------------------------------------------------------ */

const DocumentDrawer: React.FC<{ doc: FinDocument; onClose: () => void; onEdit: () => void }> = ({ doc, onClose, onEdit }) => {
  const { state } = useFinance();
  const { party, accountLabel } = useLookups();
  const [settling, setSettling] = useState(false);
  const p = party(doc.partyId)!;
  const t = docTotals(doc);
  const balance = docBalance(state, doc);
  const copy = COPY[doc.kind];
  const applied = state.settlements.filter((s) => s.status === 'POSTED' && s.allocations.some((a) => a.docId === doc.id));
  const pending = state.settlements.filter((s) => s.status !== 'POSTED' && s.status !== 'VOID' && s.allocations.some((a) => a.docId === doc.id));

  const impact =
    doc.kind === 'INVOICE'
      ? [
          { account: '1100', dr: t.total, cr: 0 },
          ...doc.lines.map((l) => ({ account: l.account, dr: 0, cr: round2(l.qty * l.price) })),
          ...(t.vat ? [{ account: '2100', dr: 0, cr: t.vat }] : [])
        ]
      : [
          ...doc.lines.map((l) => ({ account: l.account, dr: round2(l.qty * l.price), cr: 0 })),
          ...(t.vat ? [{ account: '1150', dr: t.vat, cr: 0 }] : []),
          { account: '2000', dr: 0, cr: t.total }
        ];

  return (
    <>
      <Drawer
        wide
        title={doc.number}
        subtitle={`${p.name} · ${fmtDate(doc.date)}`}
        badge={doc.status === 'POSTED' ? <Pill status={isOverdue(state, doc) ? 'OVERDUE' : payState(state, doc)} /> : <Pill status={doc.status} />}
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={printArea}>
              <Printer size={14} /> Print {doc.kind === 'INVOICE' ? (doc.status === 'POSTED' ? 'tax invoice' : 'proforma invoice') : 'bill'}
            </button>
            <span className="sx-grow" />
            {doc.status === 'POSTED' && balance > 0 && !pending.length && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setSettling(true)}>
                <Wallet size={14} /> {copy.settle}
              </button>
            )}
          </>
        }
      >
        <div className="sx-amount-hero">
          <div>
            <span>{doc.status === 'POSTED' ? 'Balance due' : 'Total'}</span>
            <strong>{kes(doc.status === 'POSTED' ? balance : t.total)}</strong>
          </div>
          <div>
            <span>Due</span>
            <b className={isOverdue(state, doc) ? 'sx-danger-text' : ''}>{fmtDate(doc.dueDate)}</b>
          </div>
        </div>

        <DefList
          items={[
            [copy.party, p.name],
            ['KRA PIN', p.pin],
            ['Reference', doc.reference || '—'],
            ['Department', doc.department],
            ['Terms', `${p.terms} days`],
            ['Prepared by', doc.preparedBy]
          ]}
        />

        {doc.match && (
          <div className={`sx-callout ${doc.match.matched ? 'success' : 'warn'}`}>
            {doc.match.matched ? <PackageCheck size={16} /> : <PackageX size={16} />}
            <div>
              <b>{doc.match.matched ? 'Three-way match passed' : 'Goods not yet received'}</b>
              <span>
                Order {doc.match.po} · Goods received {doc.match.grn}
                {doc.match.matched ? ' — quantities and prices agree.' : ' — confirm delivery before approving payment.'}
              </span>
            </div>
          </div>
        )}

        <h4 className="sx-subhead">Lines</h4>
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="sx-hide-sm">Account</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.description}
                  {!l.vat && <small className="sx-muted"> · zero-rated</small>}
                </td>
                <td className="sx-hide-sm sx-muted">{accountLabel(l.account)}</td>
                <td style={{ textAlign: 'right' }}>{l.qty}</td>
                <td style={{ textAlign: 'right' }}>{l.price.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{round2(l.qty * l.price).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Subtotal</td>
              <td>{t.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr>
              <td colSpan={4}>VAT {VAT_RATE * 100}%</td>
              <td>{t.vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
            <tr className="sx-total-row">
              <td colSpan={4}>Total (KES)</td>
              <td>{t.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>

        {(applied.length > 0 || pending.length > 0) && (
          <>
            <h4 className="sx-subhead">{doc.kind === 'INVOICE' ? 'Receipts' : 'Payments'}</h4>
            <ul className="sx-list">
              {[...applied, ...pending].map((s) => (
                <li key={s.id}>
                  <span className="sx-mono">{s.number}</span>
                  <span>{fmtDate(s.date)}</span>
                  <Pill status={s.status} />
                  <b>{kes(s.allocations.find((a) => a.docId === doc.id)!.amount)}</b>
                </li>
              ))}
            </ul>
          </>
        )}

        <h4 className="sx-subhead">{doc.status === 'POSTED' ? 'Ledger entries' : 'Ledger entries when posted'}</h4>
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Account</th>
              <th style={{ textAlign: 'right' }}>Debit</th>
              <th style={{ textAlign: 'right' }}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {impact.map((r, i) => (
              <tr key={i}>
                <td>{accountLabel(r.account)}</td>
                <td style={{ textAlign: 'right' }}>{r.dr ? r.dr.toLocaleString() : ''}</td>
                <td style={{ textAlign: 'right' }}>{r.cr ? r.cr.toLocaleString() : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <DocActions doc={doc} balance={balance} />

        <h4 className="sx-subhead">Approval</h4>
        <WorkflowPanel collection="documents" doc={doc} onEdit={onEdit} />

        <PrintableDocument doc={doc} />
      </Drawer>
      {settling && (
        <SettlementEditor
          kind={doc.kind === 'INVOICE' ? 'RECEIPT' : 'PAYMENT'}
          preset={{ partyId: doc.partyId, docId: doc.id, amount: balance }}
          onClose={() => setSettling(false)}
          onSaved={() => setSettling(false)}
        />
      )}
    </>
  );
};

const PrintableDocument: React.FC<{ doc: FinDocument }> = ({ doc }) => {
  const { party } = useLookups();
  const p = party(doc.partyId)!;
  const t = docTotals(doc);
  return (
    <article className="sx-print-only ess-print-area sx-paper">
      <PrintHeader
        title={doc.kind === 'INVOICE' ? (doc.status === 'POSTED' ? 'Tax invoice' : 'Proforma invoice') : 'Supplier bill'}
        number={doc.number}
        meta={[
          ['Date', fmtDate(doc.date)],
          ['Due', fmtDate(doc.dueDate)],
          ['Reference', doc.reference || '—']
        ]}
      />
      <div className="sx-paper-party">
        <span>{doc.kind === 'INVOICE' ? 'Bill to' : 'Supplier'}</span>
        <strong>{p.name}</strong>
        <small>
          PIN {p.pin} · {p.email} · {p.phone}
        </small>
      </div>
      <table className="sx-paper-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>VAT</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.description}</td>
              <td>{l.qty}</td>
              <td>{l.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td>{l.vat ? '16%' : '0%'}</td>
              <td>{round2(l.qty * l.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Subtotal</td>
            <td>{t.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td colSpan={4}>VAT</td>
            <td>{t.vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr className="sx-total-row">
            <td colSpan={4}>Total due (KES)</td>
            <td>{t.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          </tr>
        </tfoot>
      </table>
      {doc.kind === 'INVOICE' && (
        <div className="sx-paper-foot">
          <div>
            <b>Payment details</b>
            <span>KCB Bank · Account 1102 938 4471 · Branch: Moi Avenue</span>
            <span>Please quote {doc.number} with your payment.</span>
          </div>
          <div className="sx-paper-sign">
            <span>Authorised signature</span>
          </div>
        </div>
      )}
    </article>
  );
};

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

const blankLine = (kind: Kind): DocLine => ({
  id: `n${Math.random().toString(36).slice(2, 8)}`,
  description: '',
  account: kind === 'INVOICE' ? '4000' : '',
  qty: 1,
  price: 0,
  vat: true
});

export const DocumentEditor: React.FC<{ kind: Kind; doc: FinDocument | null; onClose: () => void; onSaved: (id: string) => void }> = ({ kind, doc, onClose, onSaved }) => {
  const { state, saveDocument, transition } = useFinance();
  const copy = COPY[kind];
  const parties = state.parties.filter((p) => p.kind === copy.partyKind);
  const [d, setD] = useState<DocumentDraft>(() =>
    doc
      ? { ...doc, lines: doc.lines.map((l) => ({ ...l })) }
      : {
          kind,
          partyId: '',
          date: TODAY,
          dueDate: addDays(TODAY, 30),
          reference: '',
          department: kind === 'INVOICE' ? 'Sales' : 'Operations',
          lines: [blankLine(kind)],
          notes: '',
          match: kind === 'BILL' ? { po: '', grn: '', matched: false } : undefined
        }
  );
  const set = (patch: Partial<DocumentDraft>) => setD((x) => ({ ...x, ...patch }));
  const setLine = (id: string, patch: Partial<DocLine>) => set({ lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const party = parties.find((p) => p.id === d.partyId);
  const taxCodes = state.taxCodes.filter((x) => x.active && ['VAT', 'ZERO', 'EXEMPT', 'REVERSE'].includes(x.kind) && (x.appliesTo === 'BOTH' || x.appliesTo === (kind === 'INVOICE' ? 'SALES' : 'PURCHASE')));
  const levyCodes = state.taxCodes.filter((x) => x.active && (x.kind === 'LEVY' || x.kind === 'EXCISE') && (x.appliesTo === 'BOTH' || x.appliesTo === (kind === 'INVOICE' ? 'SALES' : 'PURCHASE')));
  const rateOf = (code: string) => [...(state.taxCodes.find((x) => x.code === code)?.rates ?? [])].filter((r) => r.from <= d.date).pop()?.rate ?? 0;
  const setTax = (id: string, code: string) => {
    const t = state.taxCodes.find((x) => x.code === code);
    setLine(id, { taxCode: code || undefined, taxRate: code ? rateOf(code) : undefined, vat: code ? rateOf(code) > 0 : false, reverseCharge: t?.kind === 'REVERSE' || undefined });
  };
  const setLevy = (id: string, code: string) => {
    const t = state.taxCodes.find((x) => x.code === code);
    setLine(id, { levies: t ? [{ code: t.code, rate: rateOf(t.code), account: t.account }] : undefined });
  };
  const addresses = party?.addresses ?? [];
  const pickCurrency = (cur: string) => set({ currency: cur === 'KES' ? undefined : cur, fxRate: cur === 'KES' ? undefined : rateOn(state, cur, d.date) });
  const addRateCard = (id: string) => {
    const rc = state.rateCards.find((x) => x.id === id);
    if (rc) set({ lines: [...d.lines.filter((l) => l.description.trim() || l.price), { ...blankLine(kind), description: `${rc.name} (per ${rc.unit.toLowerCase()})`, account: rc.account, price: rc.rate }] });
  };
  const t = docTotals(d);

  const choose = (partyId: string) => {
    const p = parties.find((x) => x.id === partyId);
    const exportSale = p?.pin === 'NON-RESIDENT';
    set({
      partyId,
      dueDate: p ? addDays(d.date, p.terms) : d.dueDate,
      lines: exportSale ? d.lines.map((l) => ({ ...l, vat: false, account: kind === 'INVOICE' ? '4010' : l.account })) : d.lines
    });
  };

  const exposure = useMemo(() => {
    if (kind !== 'INVOICE' || !party?.creditLimit) return null;
    const open = state.documents
      .filter((x) => x.kind === 'INVOICE' && x.partyId === party.id && x.status === 'POSTED' && x.id !== doc?.id)
      .reduce((s, x) => s + docBalance(state, x), 0);
    return { open: round2(open), after: round2(open + t.total), limit: party.creditLimit };
  }, [kind, party, state, doc, t.total]);

  const save = (submit: boolean) => {
    const r = saveDocument({ ...d, lines: d.lines.map((l) => ({ ...l, qty: Number(l.qty), price: Number(l.price) })) });
    if (!r.ok || !r.id) return;
    if (submit) transition('documents', r.id, 'submit');
    onSaved(r.id);
  };

  return (
    <Modal
      size="xl"
      title={doc ? `Edit ${doc.number}` : `New ${copy.one}`}
      subtitle={doc ? 'Changes go back through approval' : `Saved as a draft until you submit it for approval`}
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">
            Total <b>{kes(t.total)}</b>
          </span>
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
        <Field label={copy.party} required span={2}>
          <select className="form-control" value={d.partyId} onChange={(e) => choose(e.target.value)}>
            <option value="">Choose {copy.party.toLowerCase()}…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" required>
          <input className="form-control" type="date" value={d.date} onChange={(e) => set({ date: e.target.value, dueDate: party ? addDays(e.target.value, party.terms) : d.dueDate })} />
        </Field>
        <Field label="Due date" required hint={party ? `${party.terms}-day terms` : undefined}>
          <input className="form-control" type="date" value={d.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </Field>
        <Field label={kind === 'INVOICE' ? 'Customer order no.' : 'Supplier invoice no.'}>
          <input className="form-control" value={d.reference} onChange={(e) => set({ reference: e.target.value })} />
        </Field>
        <Field label="Department">
          <select className="form-control" value={d.department} onChange={(e) => set({ department: e.target.value })}>
            {DEPARTMENTS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Currency" hint={d.currency ? `KES per ${d.currency}` : 'Base currency'}>
          <select className="form-control" value={d.currency ?? 'KES'} onChange={(e) => pickCurrency(e.target.value)} name="currency">
            <option value="KES">KES</option>
            {state.currencies
              .filter((c) => c.code !== 'KES')
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
          </select>
        </Field>
        {d.currency && (
          <Field label="Exchange rate" required>
            <input className="form-control" type="number" step="any" value={d.fxRate ?? ''} onChange={(e) => set({ fxRate: Number(e.target.value) || undefined })} name="fxRate" />
          </Field>
        )}
        {kind === 'INVOICE' && addresses.length > 0 && (
          <>
            <Field label="Bill to">
              <select className="form-control" value={d.billToId ?? ''} onChange={(e) => set({ billToId: e.target.value || undefined })}>
                <option value="">Main address</option>
                {addresses
                  .filter((a) => a.type === 'BILL_TO')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Ship to">
              <select className="form-control" value={d.shipToId ?? ''} onChange={(e) => set({ shipToId: e.target.value || undefined })}>
                <option value="">Same as bill to</option>
                {addresses
                  .filter((a) => a.type === 'SHIP_TO')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
              </select>
            </Field>
          </>
        )}
        {kind === 'INVOICE' && (
          <Field label="Sales rep">
            <input className="form-control" value={d.salesRep ?? ''} onChange={(e) => set({ salesRep: e.target.value || undefined })} />
          </Field>
        )}
        <Field label="Entry batch">
          <select className="form-control" value={d.batchId ?? ''} onChange={(e) => set({ batchId: e.target.value || undefined })}>
            <option value="">None</option>
            {state.invoiceBatches
              .filter((b) => b.kind === kind)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.number}
                </option>
              ))}
          </select>
        </Field>
        {kind === 'BILL' && d.match && (
          <>
            <Field label="Purchase order">
              <input className="form-control" value={d.match.po} placeholder="PO-…" onChange={(e) => set({ match: { ...d.match!, po: e.target.value } })} />
            </Field>
            <Field label="Goods received note">
              <input className="form-control" value={d.match.grn} placeholder="GRN-…" onChange={(e) => set({ match: { ...d.match!, grn: e.target.value, matched: !!e.target.value && !!d.match!.po } })} />
            </Field>
          </>
        )}
      </div>

      {exposure && exposure.after > exposure.limit && (
        <div className="sx-callout warn">
          <AlertTriangle size={16} />
          <div>
            <b>Over the credit limit</b>
            <span>
              {party!.name} owes {kes(exposure.open)}. This invoice takes them to {kes(exposure.after)}, above their {kes(exposure.limit)} limit. The approver will see this.
            </span>
          </div>
        </div>
      )}

      <h4 className="sx-subhead">Lines</h4>
      <div className="sx-lines">
        <div className="sx-lines-head">
          <span>Description</span>
          <span>Account</span>
          <span>Qty</span>
          <span>Unit price</span>
          <span>VAT</span>
          <span>Amount</span>
          <span />
        </div>
        {d.lines.map((l) => (
          <div key={l.id} className="sx-lines-row">
            <input className="form-control" value={l.description} placeholder="What is this for?" onChange={(e) => setLine(l.id, { description: e.target.value })} aria-label="Description" />
            <AccountSelect
              value={l.account}
              onChange={(v) => setLine(l.id, { account: v })}
              filter={(c) => (kind === 'INVOICE' ? c.startsWith('4') : c.startsWith('5') || c.startsWith('6') || c.startsWith('7') || c === '1200' || c === '1300')}
            />
            <input className="form-control" type="number" min="0" value={l.qty} onChange={(e) => setLine(l.id, { qty: Number(e.target.value) })} aria-label="Quantity" />
            <input className="form-control" type="number" min="0" value={l.price || ''} placeholder="0.00" onChange={(e) => setLine(l.id, { price: Number(e.target.value) })} aria-label="Unit price" />
            <label className="sx-check">
              <input type="checkbox" checked={l.vat} onChange={(e) => setLine(l.id, { vat: e.target.checked })} />
              16%
            </label>
            <b className="sx-line-amt">{round2(l.qty * l.price).toLocaleString()}</b>
            <button type="button" className="sx-icon-btn" onClick={() => set({ lines: d.lines.length > 1 ? d.lines.filter((x) => x.id !== l.id) : d.lines })} aria-label="Remove line" disabled={d.lines.length === 1}>
              <Trash2 size={14} />
            </button>
            <div className="fx-dims" style={{ gridColumn: '1 / -1' }}>
              <select className="form-control" value={l.taxCode ?? ''} onChange={(e) => setTax(l.id, e.target.value)} aria-label="Tax code">
                <option value="">{l.vat ? 'VAT 16% (default)' : 'No tax code'}</option>
                {taxCodes.map((x) => (
                  <option key={x.code} value={x.code}>
                    {x.code} · {x.name}
                  </option>
                ))}
              </select>
              <select className="form-control" value={l.levies?.[0]?.code ?? ''} onChange={(e) => setLevy(l.id, e.target.value)} aria-label="Levy">
                <option value="">No levy</option>
                {levyCodes.map((x) => (
                  <option key={x.code} value={x.code}>
                    {x.code} · {x.name}
                  </option>
                ))}
              </select>
              <select className="form-control" value={l.costCenter ?? ''} onChange={(e) => setLine(l.id, { costCenter: e.target.value || undefined })} aria-label="Cost centre">
                <option value="">Cost / profit centre…</option>
                {state.costCenters
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} · {c.name}
                    </option>
                  ))}
              </select>
              <select className="form-control" value={l.project ?? ''} onChange={(e) => setLine(l.id, { project: e.target.value || undefined })} aria-label="Project">
                <option value="">Project / order…</option>
                {state.costObjects
                  .filter((c) => c.status === 'OPEN')
                  .map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code} · {c.name}
                    </option>
                  ))}
              </select>
              <select className="form-control" value={l.plant ?? ''} onChange={(e) => setLine(l.id, { plant: e.target.value || undefined })} aria-label="Plant">
                <option value="">Plant / division…</option>
                {(state.companies.find((c) => c.id === state.activeCompany)?.plants ?? []).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {state.rateCards.length > 0 && (
          <select className="form-control fx-inline-select" value="" onChange={(e) => addRateCard(e.target.value)} aria-label="Add from rate card">
            <option value="">Add a line from a rate card…</option>
            {state.rateCards.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.rate.toLocaleString()} per {r.unit.toLowerCase()}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ lines: [...d.lines, blankLine(kind)] })}>
          <Plus size={14} /> Add line
        </button>
      </div>

      <div className="sx-totals">
        <div>
          <span>Subtotal</span>
          <b>{kes(t.net)}</b>
        </div>
        <div>
          <span>VAT</span>
          <b>{kes(t.vat)}</b>
        </div>
        <div className="sx-totals-grand">
          <span>Total</span>
          <b>{kes(t.total)}</b>
        </div>
      </div>

      <Field label="Notes" span={4}>
        <textarea className="form-control" rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </Modal>
  );
};
