import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Printer, Wand2, Banknote, Clock3, ArrowDownLeft, ArrowUpRight, Landmark } from 'lucide-react';
import { useFinance, type SettlementDraft } from '../store';
import { docBalance, docTotals, fmtDate, kes, periodOf, round2, TODAY } from '../engine';
import type { Settlement } from '../types';
import { Chips, DataTable, DefList, Drawer, Empty, Field, Modal, Pill, SearchBox, Stat, SuitePage, type Column } from '../../ui/kit';
import { PrintHeader, useLookups, WorkflowPanel } from '../parts';
import { printArea } from '../../../views/ess/EssRecords';

type Kind = Settlement['kind'];
type Filter = 'ALL' | 'DRAFTS' | 'APPROVAL' | 'POSTED';

const COPY = {
  RECEIPT: { eyebrow: 'Receivables', title: 'Customer receipts', one: 'receipt', party: 'Customer', partyKind: 'CUSTOMER' as const, docKind: 'INVOICE' as const, verb: 'Received' },
  PAYMENT: { eyebrow: 'Payables', title: 'Supplier payments', one: 'payment', party: 'Supplier', partyKind: 'SUPPLIER' as const, docKind: 'BILL' as const, verb: 'Paid' }
};
const METHODS: Settlement['method'][] = ['EFT', 'RTGS', 'M-PESA', 'CHEQUE', 'CASH'];

export const SettlementsPage: React.FC<{ kind: Kind }> = ({ kind }) => {
  const { state, focus, setFocus } = useFinance();
  const { party, accountLabel } = useLookups();
  const copy = COPY[kind];
  const [filter, setFilter] = useState<Filter>('ALL');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Settlement | 'new' | null>(null);

  useEffect(() => {
    if (focus === 'new') {
      setEditing('new');
      setFocus(null);
    } else if (focus && state.settlements.some((s) => s.id === focus && s.kind === kind)) {
      setOpenId(focus);
      setFocus(null);
    }
  }, [focus, kind, state.settlements, setFocus]);

  const list = state.settlements.filter((s) => s.kind === kind);
  const match = (s: Settlement, f: Filter) =>
    f === 'ALL' ||
    (f === 'DRAFTS' && (s.status === 'DRAFT' || s.status === 'REJECTED')) ||
    (f === 'APPROVAL' && (s.status === 'SUBMITTED' || s.status === 'APPROVED')) ||
    (f === 'POSTED' && s.status === 'POSTED');
  const rows = list
    .filter((s) => match(s, filter))
    .filter((s) => !q || `${s.number} ${s.reference} ${party(s.partyId)?.name}`.toLowerCase().includes(q.toLowerCase()));

  const month = periodOf(TODAY);
  const posted = list.filter((s) => s.status === 'POSTED');
  const thisMonth = round2(posted.filter((s) => periodOf(s.date) === month).reduce((x, s) => x + s.amount, 0));
  const ytd = round2(posted.filter((s) => s.date.slice(0, 4) === TODAY.slice(0, 4)).reduce((x, s) => x + s.amount, 0));
  const waiting = list.filter((s) => match(s, 'APPROVAL'));

  const columns: Column<Settlement>[] = [
    { key: 'number', header: 'Number', render: (s) => <b className="sx-mono">{s.number}</b>, sort: (s) => s.number, width: 130 },
    {
      key: 'party',
      header: copy.party,
      render: (s) => (
        <div className="sx-cell-main">
          <span>{party(s.partyId)?.name}</span>
          <small>
            {s.method} {s.reference && `· ${s.reference}`}
          </small>
        </div>
      ),
      sort: (s) => party(s.partyId)?.name ?? ''
    },
    { key: 'date', header: 'Date', render: (s) => fmtDate(s.date), sort: (s) => s.date },
    { key: 'bank', header: 'Bank account', render: (s) => <span className="sx-muted">{accountLabel(s.bankAccount)}</span>, hideOnMobile: true },
    { key: 'amount', header: 'Amount', render: (s) => <b>{kes(s.amount)}</b>, sort: (s) => s.amount, align: 'right' },
    { key: 'status', header: 'Status', render: (s) => <Pill status={s.status} />, sort: (s) => s.status }
  ];

  const open = list.find((s) => s.id === openId) ?? null;

  return (
    <SuitePage
      eyebrow={copy.eyebrow}
      title={copy.title}
      subtitle={
        kind === 'RECEIPT'
          ? 'Record money received from customers and apply it to their invoices.'
          : 'Prepare supplier payments, get them approved and release them from the bank.'
      }
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          <Plus size={15} /> {kind === 'RECEIPT' ? 'Record receipt' : 'New payment'}
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label={`${copy.verb} this month`} value={kes(thisMonth, { compact: true })} detail={`${posted.filter((s) => periodOf(s.date) === month).length} posted`} icon={kind === 'RECEIPT' ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />} />
        <Stat label={`${copy.verb} this year`} value={kes(ytd, { compact: true })} detail="Posted to the ledger" icon={<Banknote size={17} />} tone="blue" />
        <Stat label="Waiting for approval" value={waiting.length} detail={kes(round2(waiting.reduce((x, s) => x + s.amount, 0)), { compact: true })} icon={<Clock3 size={17} />} tone="gold" onClick={() => setFilter('APPROVAL')} />
        <Stat label="Most used account" value={accountLabel(mostUsed(posted)).split(' · ')[1] ?? '—'} detail="By number of transactions" icon={<Landmark size={17} />} tone="violet" />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All', count: list.length },
            { value: 'DRAFTS', label: 'Drafts', count: list.filter((s) => match(s, 'DRAFTS')).length },
            { value: 'APPROVAL', label: 'In approval', count: waiting.length },
            { value: 'POSTED', label: 'Posted', count: posted.length }
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder={`Search ${copy.one}s…`} />
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(s) => s.id}
        onRowClick={(s) => setOpenId(s.id)}
        selected={openId}
        initialSort={{ key: 'date', dir: 'desc' }}
        empty={<Empty icon={<Banknote size={20} />} title={`No ${copy.one}s here`} />}
      />
      {open && <SettlementDrawer s={open} onClose={() => setOpenId(null)} onEdit={() => setEditing(open)} />}
      {editing && (
        <SettlementEditor
          kind={kind}
          existing={editing === 'new' ? undefined : editing}
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

const mostUsed = (list: Settlement[]) => {
  const c: Record<string, number> = {};
  for (const s of list) c[s.bankAccount] = (c[s.bankAccount] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

const SettlementDrawer: React.FC<{ s: Settlement; onClose: () => void; onEdit: () => void }> = ({ s, onClose, onEdit }) => {
  const { state } = useFinance();
  const { party, accountLabel } = useLookups();
  const copy = COPY[s.kind];
  const p = party(s.partyId)!;
  const allocated = round2(s.allocations.reduce((x, a) => x + a.amount, 0));
  return (
    <Drawer
      wide
      title={s.number}
      subtitle={`${p.name} · ${fmtDate(s.date)}`}
      badge={<Pill status={s.status} />}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-secondary btn-sm" onClick={printArea}>
          <Printer size={14} /> Print {s.kind === 'RECEIPT' ? 'receipt' : 'payment voucher'}
        </button>
      }
    >
      <div className="sx-amount-hero">
        <div>
          <span>{copy.verb}</span>
          <strong>{kes(s.amount)}</strong>
        </div>
        <div>
          <span>Method</span>
          <b>{s.method}</b>
        </div>
      </div>
      <DefList
        items={[
          [copy.party, p.name],
          ['Bank account', accountLabel(s.bankAccount)],
          ['Reference', s.reference || '—'],
          ['Allocated', kes(allocated)],
          ['On account', kes(round2(s.amount - allocated))],
          ['Prepared by', s.preparedBy]
        ]}
      />
      {s.notes && <p className="sx-note">{s.notes}</p>}
      <h4 className="sx-subhead">Applied to</h4>
      <ul className="sx-list">
        {s.allocations.map((a) => {
          const d = state.documents.find((x) => x.id === a.docId);
          return (
            <li key={a.docId}>
              <span className="sx-mono">{d?.number}</span>
              <span>{d ? fmtDate(d.date) : ''}</span>
              <span className="sx-muted">of {d ? kes(docTotals(d).total) : ''}</span>
              <b>{kes(a.amount)}</b>
            </li>
          );
        })}
        {!s.allocations.length && <li className="sx-muted">Not applied to any document — held on account.</li>}
      </ul>
      <h4 className="sx-subhead">Approval</h4>
      <WorkflowPanel collection="settlements" doc={s} onEdit={onEdit} />

      <article className="sx-print-only ess-print-area sx-paper">
        <PrintHeader title={s.kind === 'RECEIPT' ? 'Official receipt' : 'Payment voucher'} number={s.number} meta={[['Date', fmtDate(s.date)], ['Method', s.method]]} />
        <div className="sx-paper-party">
          <span>{s.kind === 'RECEIPT' ? 'Received from' : 'Pay to'}</span>
          <strong>{p.name}</strong>
          <small>PIN {p.pin}</small>
        </div>
        <table className="sx-paper-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Date</th>
              <th>Document total</th>
              <th>Applied</th>
            </tr>
          </thead>
          <tbody>
            {s.allocations.map((a) => {
              const d = state.documents.find((x) => x.id === a.docId);
              return (
                <tr key={a.docId}>
                  <td>{d?.number}</td>
                  <td>{d ? fmtDate(d.date) : ''}</td>
                  <td>{d ? docTotals(d).total.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>
                  <td>{a.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="sx-total-row">
              <td colSpan={3}>Amount (KES)</td>
              <td>{s.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>
        <div className="sx-paper-foot">
          <div>
            <b>Bank</b>
            <span>
              {accountLabel(s.bankAccount)} · Ref {s.reference || '—'}
            </span>
          </div>
          <div className="sx-paper-signs">
            <span>Prepared: {s.preparedBy}</span>
            {s.approvals.map((a) => (
              <span key={a.by}>Approved: {a.by}</span>
            ))}
          </div>
        </div>
      </article>
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

export const SettlementEditor: React.FC<{
  kind: Kind;
  existing?: Settlement;
  preset?: { partyId: string; docId: string; amount: number };
  onClose: () => void;
  onSaved: (id: string) => void;
}> = ({ kind, existing, preset, onClose, onSaved }) => {
  const { state, saveSettlement, transition } = useFinance();
  const copy = COPY[kind];
  const banks = state.accounts.filter((a) => a.bank);
  const [d, setD] = useState<SettlementDraft>(() =>
    existing
      ? { ...existing, allocations: existing.allocations.map((a) => ({ ...a })) }
      : {
          kind,
          partyId: preset?.partyId ?? '',
          date: TODAY,
          bankAccount: '1000',
          method: 'EFT',
          reference: '',
          amount: preset?.amount ?? 0,
          allocations: preset ? [{ docId: preset.docId, amount: preset.amount }] : [],
          notes: ''
        }
  );
  const set = (patch: Partial<SettlementDraft>) => setD((x) => ({ ...x, ...patch }));

  const openDocs = useMemo(
    () =>
      state.documents
        .filter((x) => x.kind === copy.docKind && x.partyId === d.partyId && x.status === 'POSTED')
        .map((x) => {
          // Money already held by this settlement does not reduce what it can apply
          const own = existing?.status === 'POSTED' ? existing.allocations.find((a) => a.docId === x.id)?.amount ?? 0 : 0;
          return { doc: x, open: round2(docBalance(state, x) + own) };
        })
        .filter((x) => x.open > 0.005)
        .sort((a, b) => a.doc.dueDate.localeCompare(b.doc.dueDate)),
    [state, d.partyId, copy.docKind, existing]
  );
  const allocOf = (id: string) => d.allocations.find((a) => a.docId === id)?.amount ?? 0;
  const setAlloc = (id: string, amount: number) => {
    const others = d.allocations.filter((a) => a.docId !== id);
    const allocations = amount > 0 ? [...others, { docId: id, amount }] : others;
    set({ allocations, amount: Math.max(d.amount, round2(allocations.reduce((x, a) => x + a.amount, 0))) });
  };
  const allocated = round2(d.allocations.reduce((x, a) => x + a.amount, 0));
  const oldestFirst = () => {
    let left = d.amount || openDocs.reduce((x, o) => x + o.open, 0);
    const allocations = [];
    for (const o of openDocs) {
      if (left <= 0) break;
      const amt = round2(Math.min(o.open, left));
      allocations.push({ docId: o.doc.id, amount: amt });
      left = round2(left - amt);
    }
    set({ allocations, amount: d.amount || round2(allocations.reduce((x, a) => x + a.amount, 0)) });
  };

  const save = (submit: boolean) => {
    const r = saveSettlement({ ...d, amount: Number(d.amount) });
    if (!r.ok || !r.id) return;
    if (submit) transition('settlements', r.id, 'submit');
    onSaved(r.id);
  };

  return (
    <Modal
      size="xl"
      title={existing ? `Edit ${existing.number}` : kind === 'RECEIPT' ? 'Record customer receipt' : 'New supplier payment'}
      subtitle="Apply the money to open documents — anything left over is held on account"
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">
            Allocated <b>{kes(allocated)}</b> of {kes(Number(d.amount) || 0)}
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
          <select className="form-control" value={d.partyId} onChange={(e) => set({ partyId: e.target.value, allocations: [] })}>
            <option value="">Choose {copy.party.toLowerCase()}…</option>
            {state.parties
              .filter((p) => p.kind === copy.partyKind)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Date" required>
          <input className="form-control" type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="Amount (KES)" required>
          <input className="form-control" type="number" min="0" value={d.amount || ''} onChange={(e) => set({ amount: Number(e.target.value) })} />
        </Field>
        <Field label={kind === 'RECEIPT' ? 'Paid into' : 'Pay from'} required span={2}>
          <select className="form-control" value={d.bankAccount} onChange={(e) => set({ bankAccount: e.target.value })}>
            {banks.map((b) => (
              <option key={b.code} value={b.code}>
                {b.code} · {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Method">
          <select className="form-control" value={d.method} onChange={(e) => set({ method: e.target.value as Settlement['method'] })}>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Bank or M-Pesa reference">
          <input className="form-control" value={d.reference} onChange={(e) => set({ reference: e.target.value })} />
        </Field>
      </div>

      <div className="sx-subhead-row">
        <h4 className="sx-subhead">Open {copy.docKind === 'INVOICE' ? 'invoices' : 'bills'}</h4>
        {openDocs.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={oldestFirst}>
            <Wand2 size={14} /> Allocate oldest first
          </button>
        )}
      </div>
      {!d.partyId ? (
        <p className="sx-note">Choose a {copy.party.toLowerCase()} to see what they {kind === 'RECEIPT' ? 'owe' : 'are owed'}.</p>
      ) : openDocs.length === 0 ? (
        <p className="sx-note">Nothing outstanding — the money will be held on account.</p>
      ) : (
        <table className="sx-mini-table sx-alloc">
          <thead>
            <tr>
              <th>Document</th>
              <th className="sx-hide-sm">Due</th>
              <th style={{ textAlign: 'right' }}>Outstanding</th>
              <th style={{ textAlign: 'right', width: 160 }}>Apply</th>
            </tr>
          </thead>
          <tbody>
            {openDocs.map((o) => (
              <tr key={o.doc.id}>
                <td>
                  <b className="sx-mono">{o.doc.number}</b> <small className="sx-muted">{o.doc.reference}</small>
                </td>
                <td className={`sx-hide-sm ${o.doc.dueDate < TODAY ? 'sx-danger-text' : ''}`}>{fmtDate(o.doc.dueDate)}</td>
                <td style={{ textAlign: 'right' }}>{o.open.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td style={{ textAlign: 'right' }}>
                  <div className="sx-alloc-cell">
                    <input
                      className="form-control"
                      type="number"
                      min="0"
                      max={o.open}
                      value={allocOf(o.doc.id) || ''}
                      placeholder="0"
                      onChange={(e) => setAlloc(o.doc.id, Math.min(o.open, Number(e.target.value)))}
                    />
                    <button type="button" className="sx-link" onClick={() => setAlloc(o.doc.id, o.open)}>
                      Full
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Field label="Notes" span={4}>
        <textarea className="form-control" rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </Modal>
  );
};
