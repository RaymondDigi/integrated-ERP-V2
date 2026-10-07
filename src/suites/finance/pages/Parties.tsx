import React, { useState } from 'react';
import { Plus, Users, Printer, Pencil, AlertTriangle, Building } from 'lucide-react';
import { useFinance } from '../store';
import { docBalance, docTotals, fmtDate, isOverdue, kes, round2, TODAY } from '../engine';
import type { Party } from '../types';
import { DataTable, DefList, Drawer, Field, Meter, Modal, SearchBox, Stat, SuitePage, type Column } from '../../ui/kit';
import { PrintHeader } from '../parts';
import { printArea } from '../../../views/ess/EssRecords';

export const PartiesPage: React.FC<{ kind: Party['kind'] }> = ({ kind }) => {
  const { state, setPage, setFocus } = useFinance();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Party | 'new' | null>(null);
  const customer = kind === 'CUSTOMER';
  const docKind = customer ? 'INVOICE' : 'BILL';

  const summary = (p: Party) => {
    const docs = state.documents.filter((d) => d.partyId === p.id && d.kind === docKind && d.status === 'POSTED');
    const balance = round2(docs.reduce((s, d) => s + docBalance(state, d), 0));
    const overdue = round2(docs.filter((d) => isOverdue(state, d)).reduce((s, d) => s + docBalance(state, d), 0));
    const ytd = round2(docs.filter((d) => d.date.slice(0, 4) === TODAY.slice(0, 4)).reduce((s, d) => s + docTotals(d).net, 0));
    return { balance, overdue, ytd, count: docs.length };
  };
  const list = state.parties.filter((p) => p.kind === kind).map((p) => ({ p, ...summary(p) }));
  const rows = list.filter((r) => !q || `${r.p.name} ${r.p.pin} ${r.p.category}`.toLowerCase().includes(q.toLowerCase()));
  const totalBal = round2(list.reduce((s, r) => s + r.balance, 0));
  const totalOver = round2(list.reduce((s, r) => s + r.overdue, 0));
  const overLimit = list.filter((r) => r.p.creditLimit && r.balance > r.p.creditLimit);

  type Row = (typeof list)[number];
  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: customer ? 'Customer' : 'Supplier',
      render: (r) => (
        <div className="sx-cell-main">
          <span>{r.p.name}</span>
          <small>
            {r.p.category} · PIN {r.p.pin}
          </small>
        </div>
      ),
      sort: (r) => r.p.name
    },
    { key: 'terms', header: 'Terms', render: (r) => `${r.p.terms} days`, sort: (r) => r.p.terms, hideOnMobile: true },
    { key: 'ytd', header: customer ? 'Sales this year' : 'Purchases this year', render: (r) => kes(r.ytd, { compact: true }), sort: (r) => r.ytd, align: 'right', hideOnMobile: true },
    { key: 'balance', header: customer ? 'Owes us' : 'We owe', render: (r) => <b>{kes(r.balance)}</b>, sort: (r) => r.balance, align: 'right' },
    {
      key: 'overdue',
      header: 'Overdue',
      render: (r) => (r.overdue ? <span className="sx-danger-text">{kes(r.overdue)}</span> : <span className="sx-muted">—</span>),
      sort: (r) => r.overdue,
      align: 'right'
    },
    ...(customer
      ? [
          {
            key: 'limit',
            header: 'Credit used',
            render: (r: Row) =>
              r.p.creditLimit ? (
                <div className="sx-meter-cell">
                  <Meter value={r.balance / r.p.creditLimit} tone={r.balance > r.p.creditLimit ? 'red' : r.balance / r.p.creditLimit > 0.8 ? 'gold' : 'green'} />
                  <small>{Math.round((r.balance / r.p.creditLimit) * 100)}%</small>
                </div>
              ) : (
                '—'
              ),
            sort: (r: Row) => (r.p.creditLimit ? r.balance / r.p.creditLimit : 0),
            hideOnMobile: true,
            width: 150
          }
        ]
      : [])
  ];

  const open = list.find((r) => r.p.id === openId);

  return (
    <SuitePage
      eyebrow={customer ? 'Receivables' : 'Payables'}
      title={customer ? 'Customers' : 'Suppliers'}
      subtitle={customer ? 'Who owes you, how much is late and how much credit each customer has left.' : 'Who you owe, payment terms and supplier statements.'}
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          <Plus size={15} /> New {customer ? 'customer' : 'supplier'}
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label={customer ? 'Customers' : 'Suppliers'} value={list.length} detail={`${list.filter((r) => r.balance > 0).length} with open balances`} icon={<Users size={17} />} />
        <Stat label={customer ? 'Total owed to us' : 'Total we owe'} value={kes(totalBal, { compact: true })} icon={<Building size={17} />} tone="blue" />
        <Stat label="Overdue" value={kes(totalOver, { compact: true })} icon={<AlertTriangle size={17} />} tone={totalOver ? 'red' : 'slate'} />
        {customer && <Stat label="Over credit limit" value={overLimit.length} detail={overLimit.map((r) => r.p.name).join(', ') || 'Everyone within limits'} icon={<AlertTriangle size={17} />} tone={overLimit.length ? 'orange' : 'green'} />}
      </div>
      <div className="sx-toolbar">
        <span />
        <SearchBox value={q} onChange={setQ} placeholder={`Search ${customer ? 'customers' : 'suppliers'}…`} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.p.id} onRowClick={(r) => setOpenId(r.p.id)} selected={openId} initialSort={{ key: 'balance', dir: 'desc' }} />

      {open && (
        <PartyDrawer
          party={open.p}
          onClose={() => setOpenId(null)}
          onEdit={() => setEditing(open.p)}
          onOpenDoc={(id, page) => {
            setPage(page);
            setFocus(id);
          }}
        />
      )}
      {editing && <PartyEditor kind={kind} party={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </SuitePage>
  );
};

const PartyDrawer: React.FC<{ party: Party; onClose: () => void; onEdit: () => void; onOpenDoc: (id: string, page: 'invoices' | 'bills' | 'receipts' | 'payments') => void }> = ({
  party,
  onClose,
  onEdit,
  onOpenDoc
}) => {
  const { state } = useFinance();
  const customer = party.kind === 'CUSTOMER';
  // Running statement: posted documents increase the balance, posted settlements reduce it
  const lines = [
    ...state.documents
      .filter((d) => d.partyId === party.id && d.status === 'POSTED')
      .map((d) => ({ id: d.id, date: d.date, ref: d.number, text: customer ? 'Invoice' : 'Bill', amount: docTotals(d).total, page: (customer ? 'invoices' : 'bills') as 'invoices' | 'bills' })),
    ...state.settlements
      .filter((s) => s.partyId === party.id && s.status === 'POSTED')
      .map((s) => ({ id: s.id, date: s.date, ref: s.number, text: customer ? 'Receipt' : 'Payment', amount: -s.amount, page: (customer ? 'receipts' : 'payments') as 'receipts' | 'payments' }))
  ].sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
  let running = 0;
  const withBal = lines.map((l) => ({ ...l, balance: (running = round2(running + l.amount)) }));
  const recent = withBal.slice(-14);

  return (
    <Drawer
      wide
      title={party.name}
      subtitle={`${party.category} · ${party.terms}-day terms`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
            <Pencil size={14} /> Edit details
          </button>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={printArea}>
            <Printer size={14} /> Print statement
          </button>
        </>
      }
    >
      <div className="sx-amount-hero">
        <div>
          <span>{customer ? 'Owes us' : 'We owe'}</span>
          <strong>{kes(running)}</strong>
        </div>
        {party.creditLimit && (
          <div>
            <span>Credit limit</span>
            <b>{kes(party.creditLimit, { compact: true })}</b>
          </div>
        )}
      </div>
      <DefList items={[['KRA PIN', party.pin], ['Email', party.email], ['Phone', party.phone], ['Payment terms', `${party.terms} days`]]} />
      <h4 className="sx-subhead">Statement — latest {recent.length} entries</h4>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Document</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
            <th style={{ textAlign: 'right' }}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((l) => (
            <tr key={l.id} className="clickable" onClick={() => onOpenDoc(l.id, l.page)}>
              <td>{fmtDate(l.date)}</td>
              <td>
                <b className="sx-mono">{l.ref}</b> <small className="sx-muted">{l.text}</small>
              </td>
              <td style={{ textAlign: 'right' }} className={l.amount < 0 ? 'sx-success-text' : ''}>
                {l.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td style={{ textAlign: 'right' }}>{l.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <article className="sx-print-only ess-print-area sx-paper">
        <PrintHeader title={customer ? 'Customer statement' : 'Supplier statement'} meta={[['As at', fmtDate(TODAY)]]} />
        <div className="sx-paper-party">
          <span>{customer ? 'Customer' : 'Supplier'}</span>
          <strong>{party.name}</strong>
          <small>
            PIN {party.pin} · {party.email}
          </small>
        </div>
        <table className="sx-paper-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Document</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {withBal.map((l) => (
              <tr key={l.id}>
                <td>{fmtDate(l.date)}</td>
                <td>{l.ref}</td>
                <td>{l.text}</td>
                <td>{l.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td>{l.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="sx-total-row">
              <td colSpan={4}>Balance (KES)</td>
              <td>{running.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>
      </article>
    </Drawer>
  );
};

const PartyEditor: React.FC<{ kind: Party['kind']; party: Party | null; onClose: () => void }> = ({ kind, party, onClose }) => {
  const { saveParty } = useFinance();
  const [p, setP] = useState<Party>(
    party ?? { id: '', kind, name: '', pin: '', email: '', phone: '', terms: 30, creditLimit: kind === 'CUSTOMER' ? 1_000_000 : undefined, category: '' }
  );
  const set = (patch: Partial<Party>) => setP((x) => ({ ...x, ...patch }));
  const pinOk = !p.pin || /^P\d{9}[A-Z]$/.test(p.pin) || p.pin === 'NON-RESIDENT';
  return (
    <Modal
      size="md"
      title={party ? `Edit ${party.name}` : kind === 'CUSTOMER' ? 'New customer' : 'New supplier'}
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!pinOk} onClick={() => saveParty(p).ok && onClose()}>
            Save
          </button>
        </>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Field label="Name" required span={2}>
          <input className="form-control" value={p.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>
        <Field label="KRA PIN" hint={pinOk ? 'Like P051234567X' : <span className="sx-danger-text">PINs look like P051234567X</span>}>
          <input className="form-control" value={p.pin} onChange={(e) => set({ pin: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Category">
          <input className="form-control" value={p.category} onChange={(e) => set({ category: e.target.value })} />
        </Field>
        <Field label="Email">
          <input className="form-control" type="email" value={p.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input className="form-control" value={p.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="Payment terms (days)">
          <input className="form-control" type="number" min="0" value={p.terms} onChange={(e) => set({ terms: Number(e.target.value) })} />
        </Field>
        {kind === 'CUSTOMER' && (
          <Field label="Credit limit (KES)">
            <input className="form-control" type="number" min="0" value={p.creditLimit ?? ''} onChange={(e) => set({ creditLimit: Number(e.target.value) || undefined })} />
          </Field>
        )}
      </div>
    </Modal>
  );
};
