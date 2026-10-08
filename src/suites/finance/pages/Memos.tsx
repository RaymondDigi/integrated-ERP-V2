import React, { useState } from 'react';
import { Plus, Trash2, Undo2, ArrowRightLeft, Scissors, HandCoins, FilePlus2 } from 'lucide-react';
import { useFinance } from '../store';
import { curOf, docBalance, docTotals, fmtDate, kes, memoBalance, money, TODAY } from '../engine';
import type { DocLine, Memo } from '../types';
import { Chips, DataTable, DefList, Drawer, Field, Modal, Pill, SuitePage, type Column } from '../../ui/kit';
import { AccountSelect, useLookups, WorkflowPanel } from '../parts';
import { PrintButton, esc } from '../../../platform/Widgets';
import { usePrompt, num } from '../ext/ui';
import { advanceLeft, type MemoDraft } from '../ext/subledger';

type Tab = 'AR' | 'AP' | 'NOTES' | 'ADJUST';

const blankLine = (account: string): DocLine => ({ id: Math.random().toString(36).slice(2), description: '', account, qty: 1, price: 0, vat: true, taxCode: 'V16', taxRate: 0.16 });

/** Credit notes, debit memos, debit notes and the adjustments that clear open items (Receivables / Payables › Memos). */
export const MemosPage: React.FC = () => {
  const f = useFinance();
  const { state } = f;
  const { party } = useLookups();
  const [tab, setTab] = useState<Tab>('AR');
  const [editing, setEditing] = useState<Memo['side'] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const prompt = usePrompt();
  const memos = state.memos.filter((m) => m.side === (tab === 'AP' ? 'AP' : 'AR'));
  const open = state.memos.find((m) => m.id === openId) ?? null;
  const notes = state.documents.filter((d) => d.memoType);
  const docOptions = (kind: 'INVOICE' | 'BILL', partyId?: string) =>
    state.documents
      .filter((d) => d.kind === kind && d.status === 'POSTED' && (!partyId || d.partyId === partyId) && docBalance(state, d) > 0.005)
      .map((d) => ({ value: d.id, label: `${d.number} · ${party(d.partyId)?.name} · ${money(docBalance(state, d), curOf(d))}` }));
  const reasons = (applies: string) => state.reasonCodes.filter((r) => r.appliesTo === applies || r.appliesTo === 'ALL').map((r) => ({ value: r.code, label: `${r.code} · ${r.label}` }));

  const cols: Column<Memo>[] = [
    { key: 'n', header: 'Number', render: (m) => <b className="sx-mono">{m.number}</b>, sort: (m) => m.number, width: 130 },
    { key: 'p', header: m0(tab), render: (m) => <div className="sx-cell-main"><span>{party(m.partyId)?.name}</span><small>{m.reasonCode} · {state.reasonCodes.find((r) => r.code === m.reasonCode)?.label}</small></div>, sort: (m) => party(m.partyId)?.name ?? '' },
    { key: 'd', header: 'Date', render: (m) => fmtDate(m.date), sort: (m) => m.date, hideOnMobile: true },
    { key: 'ref', header: 'Relates to', render: (m) => [state.documents.find((d) => d.id === m.originalDocId)?.number, m.poNumber && `PO ${m.poNumber}`, m.rmaRef && `RMA ${m.rmaRef}`, m.returnRef && `Return ${m.returnRef}`].filter(Boolean).join(' · ') || '—', hideOnMobile: true },
    { key: 't', header: 'Amount', render: (m) => money(docTotals(m).total, curOf(m)), sort: (m) => docTotals(m).total, align: 'right' },
    { key: 'u', header: 'Unapplied', render: (m) => (m.status === 'POSTED' ? money(memoBalance(m), curOf(m)) : '—'), align: 'right' },
    { key: 's', header: 'Status', render: (m) => <Pill status={m.status} />, sort: (m) => m.status }
  ];

  const writeOff = () =>
    prompt.open({
      title: 'Write off a balance',
      subtitle: 'Bad debts or small differences. Posts a journal and clears the open item.',
      fields: [
        { key: 'doc', label: 'Invoice or bill', type: 'select', options: [...docOptions('INVOICE'), ...docOptions('BILL')], span: 2 },
        { key: 'amount', label: 'Amount', type: 'number', required: true },
        { key: 'reason', label: 'Reason code', type: 'select', options: reasons('WRITE_OFF') }
      ],
      submitLabel: 'Write off',
      onSubmit: (v) => f.writeOff(v.doc, num(v.amount), v.reason)
    });
  const transfer = () =>
    prompt.open({
      title: 'Transfer an open invoice to another customer',
      fields: [
        { key: 'doc', label: 'Invoice', type: 'select', options: docOptions('INVOICE'), span: 2 },
        { key: 'to', label: 'New customer', type: 'select', options: state.parties.filter((p) => p.kind === 'CUSTOMER').map((p) => ({ value: p.id, label: p.name })) },
        { key: 'reason', label: 'Reason', required: true }
      ],
      submitLabel: 'Transfer',
      onSubmit: (v) => f.transferInvoice(v.doc, v.to, v.reason)
    });
  const chargeback = () =>
    prompt.open({
      title: 'Charge back a short payment',
      subtitle: 'The unpaid remainder of a part-paid invoice becomes its own chargeback item to chase.',
      fields: [
        { key: 'doc', label: 'Part-paid invoice', type: 'select', options: state.documents.filter((d) => d.kind === 'INVOICE' && d.status === 'POSTED' && docBalance(state, d) > 0.005 && docBalance(state, d) < docTotals(d).total).map((d) => ({ value: d.id, label: `${d.number} · ${party(d.partyId)?.name} · short ${kes(docBalance(state, d))}` })), span: 2 },
        { key: 'reason', label: 'Reason', initial: 'Customer paid short', span: 2 }
      ],
      submitLabel: 'Raise chargeback',
      onSubmit: (v) => f.chargeback(v.doc, v.reason)
    });
  const applyAdvance = () => {
    const advs = state.settlements.filter((s) => s.status === 'POSTED' && !s.voided && s.purpose && s.purpose !== 'NORMAL' && advanceLeft(state, s) > 0.005);
    prompt.open({
      title: 'Apply an advance or prepayment',
      fields: [
        { key: 'adv', label: 'Advance', type: 'select', options: advs.map((s) => ({ value: s.id, label: `${s.number} · ${party(s.partyId)?.name} · ${money(advanceLeft(state, s), curOf(s))} left` })), span: 2 },
        { key: 'doc', label: 'Invoice or bill of the same party', type: 'select', options: [...docOptions('INVOICE'), ...docOptions('BILL')], span: 2 },
        { key: 'amount', label: 'Amount', type: 'number', required: true }
      ],
      submitLabel: 'Apply',
      onSubmit: (v) => f.applyAdvance(v.adv, v.doc, num(v.amount))
    });
  };
  const debitNote = () =>
    prompt.open({
      title: 'New debit note',
      subtitle: 'Increases what a customer owes (or what we owe a supplier), e.g. under-billed freight or a price correction.',
      fields: [
        { key: 'party', label: 'Customer or supplier', type: 'select', options: state.parties.map((p) => ({ value: p.id, label: `${p.name} (${p.kind === 'CUSTOMER' ? 'customer' : 'supplier'})` })), span: 2 },
        { key: 'rel', label: 'Relates to (number)', hint: 'Invoice or bill number' },
        { key: 'amount', label: 'Amount (excl. VAT)', type: 'number', required: true },
        { key: 'account', label: 'Account', initial: '4100' },
        { key: 'desc', label: 'Description', required: true }
      ],
      submitLabel: 'Create draft',
      onSubmit: (v) => {
        const p = state.parties.find((x) => x.id === v.party);
        if (!p) return { ok: false, error: 'Choose the party' };
        const rel = state.documents.find((d) => d.number === v.rel.trim());
        return f.saveDocument({
          kind: p.kind === 'CUSTOMER' ? 'INVOICE' : 'BILL',
          partyId: p.id,
          date: TODAY,
          dueDate: TODAY,
          reference: v.rel,
          department: 'Finance',
          lines: [{ ...blankLine(v.account || '4100'), description: v.desc, price: num(v.amount) }],
          notes: 'Debit note',
          memoType: 'DEBIT_NOTE',
          relatesTo: rel?.id,
          match: p.kind === 'SUPPLIER' ? { po: 'n/a', grn: 'n/a', matched: true, note: 'Supplier debit note — no goods' } : undefined
        });
      }
    });

  return (
    <SuitePage
      eyebrow="Receivables & payables"
      title="Credit & debit memos"
      subtitle="Customer credit notes, supplier debit memos and returns, debit notes, chargebacks, write-offs, transfers and advances."
      actions={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing('AP')}>
            <Undo2 size={14} /> Supplier debit memo
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('AR')}>
            <Plus size={14} /> Customer credit note
          </button>
        </>
      }
    >
      <Chips<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'AR', label: 'Customer credit notes', count: state.memos.filter((m) => m.side === 'AR').length },
          { value: 'AP', label: 'Supplier debit memos', count: state.memos.filter((m) => m.side === 'AP').length },
          { value: 'NOTES', label: 'Debit notes, charges & chargebacks', count: notes.length },
          { value: 'ADJUST', label: 'Write-offs, transfers & advances', count: state.applications.length }
        ]}
      />
      {(tab === 'AR' || tab === 'AP') && <DataTable rows={memos} columns={cols} rowKey={(m) => m.id} onRowClick={(m) => setOpenId(m.id)} empty="No memos yet" />}
      {tab === 'NOTES' && (
        <>
          <div className="sx-actions fx-bar">
            <button type="button" className="btn btn-secondary btn-sm" onClick={debitNote}>
              <FilePlus2 size={14} /> New debit note
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={chargeback}>
              <Scissors size={14} /> Chargeback a short payment
            </button>
          </div>
          <DataTable
            rows={notes}
            rowKey={(d) => d.id}
            columns={[
              { key: 'n', header: 'Number', render: (d) => <b className="sx-mono">{d.number}</b>, sort: (d) => d.number },
              { key: 't', header: 'Type', render: (d) => d.memoType!.replace('_', ' ').toLowerCase() },
              { key: 'p', header: 'Party', render: (d) => party(d.partyId)?.name },
              { key: 'r', header: 'Relates to', render: (d) => state.documents.find((x) => x.id === d.relatesTo)?.number ?? d.reference },
              { key: 'a', header: 'Amount', render: (d) => money(docTotals(d).total, curOf(d)), align: 'right' },
              { key: 'b', header: 'Open', render: (d) => (d.status === 'POSTED' ? money(docBalance(state, d), curOf(d)) : '—'), align: 'right' },
              { key: 's', header: 'Status', render: (d) => <Pill status={d.status} /> }
            ]}
            onRowClick={(d) => f.setPage(d.kind === 'INVOICE' ? 'invoices' : 'bills', d.id)}
            empty="No debit notes, finance charges or chargebacks"
          />
        </>
      )}
      {tab === 'ADJUST' && (
        <>
          <div className="sx-actions fx-bar">
            <button type="button" className="btn btn-secondary btn-sm" onClick={writeOff}>
              <Trash2 size={14} /> Write off
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={transfer}>
              <ArrowRightLeft size={14} /> Transfer invoice
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={applyAdvance}>
              <HandCoins size={14} /> Apply advance
            </button>
          </div>
          <DataTable
            rows={state.applications}
            rowKey={(a) => a.id}
            columns={[
              { key: 'k', header: 'Kind', render: (a) => a.kind.replace('_', '-').toLowerCase() },
              { key: 'd', header: 'Document', render: (a) => state.documents.find((x) => x.id === a.docId)?.number },
              { key: 'p', header: 'Party', render: (a) => party(state.documents.find((x) => x.id === a.docId)?.partyId ?? '')?.name },
              { key: 's', header: 'From', render: (a) => state.settlements.find((x) => x.id === a.sourceId)?.number ?? state.documents.find((x) => x.id === a.sourceId)?.number ?? state.journals.find((x) => x.id === a.sourceId)?.number ?? '' },
              { key: 'dt', header: 'Date', render: (a) => fmtDate(a.date), sort: (a) => a.date },
              { key: 'r', header: 'Reason', render: (a) => a.reasonCode ?? '' },
              { key: 'a', header: 'Amount', render: (a) => a.amount.toLocaleString(), align: 'right' }
            ]}
            empty="No write-offs, transfers or advance applications yet"
          />
        </>
      )}
      {editing && <MemoEditor side={editing} onClose={() => setEditing(null)} onSaved={(id) => (setEditing(null), setOpenId(id))} />}
      {open && <MemoDrawer memo={open} onClose={() => setOpenId(null)} />}
      {prompt.node}
    </SuitePage>
  );
};

const m0 = (tab: Tab) => (tab === 'AP' ? 'Supplier' : 'Customer');

const MemoEditor: React.FC<{ side: Memo['side']; onClose: () => void; onSaved: (id: string) => void }> = ({ side, onClose, onSaved }) => {
  const { state, saveMemo } = useFinance();
  const kind = side === 'AR' ? 'CUSTOMER' : 'SUPPLIER';
  const [d, setD] = useState<MemoDraft>({ side, partyId: '', date: TODAY, lines: [blankLine(side === 'AR' ? '4000' : '5000')], reasonCode: side === 'AR' ? 'QLT' : 'RET', notes: '', department: side === 'AR' ? 'Sales' : 'Operations' });
  const set = (p: Partial<MemoDraft>) => setD((x) => ({ ...x, ...p }));
  const setLine = (i: number, p: Partial<DocLine>) => set({ lines: d.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const origs = state.documents.filter((x) => x.kind === (side === 'AR' ? 'INVOICE' : 'BILL') && x.partyId === d.partyId && x.status === 'POSTED');
  const codes = state.taxCodes.filter((t) => t.active && (t.kind === 'VAT' || t.kind === 'ZERO' || t.kind === 'EXEMPT'));
  const t = docTotals(d);
  const save = () => {
    const r = saveMemo(d);
    if (r.ok && r.id) onSaved(r.id);
  };
  return (
    <Modal
      title={side === 'AR' ? 'New customer credit note' : 'New supplier debit memo'}
      subtitle={side === 'AR' ? 'Reduces what the customer owes — applied to the invoice it corrects when posted.' : 'Vendor return or overcharge — reduces what we owe the supplier.'}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <span className="fx-total">Total {kes(t.total)}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save}>
            Save draft
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label={side === 'AR' ? 'Customer' : 'Supplier'} required span={2}>
          <select className="form-control" value={d.partyId} onChange={(e) => set({ partyId: e.target.value, originalDocId: undefined })} name="memo-party">
            <option value="">Choose…</option>
            {state.parties.filter((p) => p.kind === kind).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" required>
          <input type="date" className="form-control" value={d.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="Reason code" required>
          <select className="form-control" value={d.reasonCode} onChange={(e) => set({ reasonCode: e.target.value })}>
            {state.reasonCodes.filter((r) => r.appliesTo === 'CREDIT_NOTE' || r.appliesTo === 'ALL').map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={side === 'AR' ? 'Invoice it corrects' : 'Bill it relates to'} span={2}>
          <select className="form-control" value={d.originalDocId ?? ''} onChange={(e) => {
            const o = state.documents.find((x) => x.id === e.target.value);
            set({ originalDocId: e.target.value || undefined, currency: o?.currency, fxRate: o?.fxRate, poNumber: o?.match?.po || d.poNumber });
          }}>
            <option value="">Apply to oldest open items</option>
            {origs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.number} · {o.reference} · {money(docTotals(o).total, curOf(o))}
              </option>
            ))}
          </select>
        </Field>
        {side === 'AP' ? (
          <>
            <Field label="Purchase order" hint="Closed orders are accepted">
              <input className="form-control" value={d.poNumber ?? ''} onChange={(e) => set({ poNumber: e.target.value })} />
            </Field>
            <Field label="Vendor return note">
              <input className="form-control" value={d.returnRef ?? ''} onChange={(e) => set({ returnRef: e.target.value })} placeholder="RTV-…" />
            </Field>
          </>
        ) : (
          <Field label="RMA receipt" span={2}>
            <input className="form-control" value={d.rmaRef ?? ''} onChange={(e) => set({ rmaRef: e.target.value })} placeholder="RMA-…" />
          </Field>
        )}
      </div>
      <table className="fx-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Account</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Tax</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={l.id}>
              <td>
                <input className="form-control" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} aria-label="Line description" />
              </td>
              <td>
                <AccountSelect value={l.account} onChange={(v) => setLine(i, { account: v })} filter={(c) => c >= '4000'} />
              </td>
              <td>
                <input className="form-control" type="number" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} aria-label="Quantity" />
              </td>
              <td>
                <input className="form-control" type="number" value={l.price || ''} onChange={(e) => setLine(i, { price: Number(e.target.value) })} aria-label="Price" />
              </td>
              <td>
                <select className="form-control" value={l.taxCode ?? 'V16'} onChange={(e) => {
                  const tc = state.taxCodes.find((x) => x.code === e.target.value);
                  const rate = tc ? [...tc.rates].reverse().find((r) => r.from <= d.date)?.rate ?? 0 : 0;
                  setLine(i, { taxCode: e.target.value, taxRate: rate, vat: rate > 0 });
                }}>
                  {codes.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {d.lines.length > 1 && (
                  <button type="button" className="sx-icon-btn" onClick={() => set({ lines: d.lines.filter((_, j) => j !== i) })} aria-label="Remove line">
                    <Trash2 size={14} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="sx-link" onClick={() => set({ lines: [...d.lines, blankLine(side === 'AR' ? '4000' : '5000')] })}>
        <Plus size={13} /> Add line
      </button>
      <Field label="Notes" span={4}>
        <textarea className="form-control" rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
    </Modal>
  );
};

const MemoDrawer: React.FC<{ memo: Memo; onClose: () => void }> = ({ memo, onClose }) => {
  const { state, applyMemo } = useFinance();
  const { party } = useLookups();
  const prompt = usePrompt();
  const t = docTotals(memo);
  const left = memoBalance(memo);
  const open = state.documents.filter((d) => d.kind === (memo.side === 'AR' ? 'INVOICE' : 'BILL') && d.partyId === memo.partyId && d.status === 'POSTED' && docBalance(state, d) > 0.005 && curOf(d) === curOf(memo));
  const apply = () =>
    prompt.open({
      title: `Apply ${memo.number}`,
      subtitle: `${money(left, curOf(memo))} left to apply. Enter amounts against one or several documents.`,
      fields: open.map((d) => ({ key: d.id, label: `${d.number} (${money(docBalance(state, d), curOf(d))} open)`, type: 'number' as const })),
      submitLabel: 'Apply',
      onSubmit: (v) => applyMemo(memo.id, Object.entries(v).map(([docId, a]) => ({ docId, amount: num(a) })))
    });
  const html = () =>
    `<h1>${memo.side === 'AR' ? 'Credit note' : 'Debit memo'} ${esc(memo.number)}</h1><p>${esc(party(memo.partyId)?.name)} · ${esc(memo.date)} · Reason ${esc(memo.reasonCode)}</p><table><tr><th>Description</th><th>Account</th><th class="r">Amount</th></tr>${memo.lines.map((l) => `<tr><td>${esc(l.description)}</td><td>${esc(l.account)}</td><td class="r">${(l.qty * l.price).toLocaleString()}</td></tr>`).join('')}</table><p>Net ${t.net.toLocaleString()} · VAT ${t.vat.toLocaleString()} · <b>Total ${t.total.toLocaleString()} ${curOf(memo)}</b></p>`;
  return (
    <Drawer title={memo.number} subtitle={`${memo.side === 'AR' ? 'Credit note to' : 'Debit memo against'} ${party(memo.partyId)?.name}`} badge={<Pill status={memo.status} />} onClose={onClose} wide footer={<PrintButton title={memo.number} html={html} />}>
      <DefList
        items={[
          ['Date', fmtDate(memo.date)],
          ['Reason', `${memo.reasonCode} · ${state.reasonCodes.find((r) => r.code === memo.reasonCode)?.label ?? ''}`],
          ['Total', money(t.total, curOf(memo))],
          ['Unapplied', memo.status === 'POSTED' ? money(left, curOf(memo)) : 'Applied when posted'],
          ['Original document', state.documents.find((d) => d.id === memo.originalDocId)?.number ?? '—'],
          ['PO / RMA / return', [memo.poNumber, memo.rmaRef, memo.returnRef].filter(Boolean).join(' · ') || '—']
        ]}
      />
      <h4 className="sx-subhead">Applied to</h4>
      {memo.allocations.length ? (
        <ul className="fx-list">
          {memo.allocations.map((a) => (
            <li key={a.docId}>
              {state.documents.find((d) => d.id === a.docId)?.number} — {money(a.amount, curOf(memo))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="sx-muted">Not applied yet.</p>
      )}
      {memo.status === 'POSTED' && left > 0.005 && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={apply} disabled={!open.length}>
          Apply to open items
        </button>
      )}
      <WorkflowPanel collection="memos" doc={memo} />
      {prompt.node}
    </Drawer>
  );
};
