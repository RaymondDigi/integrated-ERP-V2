import React, { useState } from 'react';
import { Wallet, Plus, Repeat, Undo2, Truck, Play } from 'lucide-react';
import { useFinance } from '../store';
import { balanceOf, fmtDate, journalTotals, kes, TODAY } from '../engine';
import type { Journal, JournalTemplate } from '../types';
import { Chips, DataTable, DefList, Drawer, Panel, Pill, Stat, SuitePage } from '../../ui/kit';
import { WorkflowPanel } from '../parts';
import { Attachments, PrintButton, esc } from '../../../platform/Widgets';
import { usePrompt, num } from '../ext/ui';

type Tab = 'CASH' | 'TEMPLATES' | 'ACCRUALS';

/** Ledger & cash › Cash book: petty cash vouchers, journal templates and automatic accrual reversals. */
export const CashbookPage: React.FC = () => {
  const f = useFinance();
  const { state, entries } = f;
  const [tab, setTab] = useState<Tab>('CASH');
  const [openId, setOpenId] = useState<string | null>(null);
  const prompt = usePrompt();
  const cashAccounts = state.accounts.filter((a) => a.bank);
  const [cashAcc, setCashAcc] = useState(cashAccounts.find((a) => a.code === '1030')?.code ?? cashAccounts[0]?.code ?? '');
  const vouchers = state.journals.filter((j) => j.source === 'CASH' && j.cash?.account === cashAcc);
  const open = state.journals.find((j) => j.id === openId) ?? null;
  const acc = state.accounts.find((a) => a.code === cashAcc);
  const accruals = state.journals.filter((j) => j.autoReverseOn);
  const expenseOptions = state.accounts.filter((a) => !a.control && !a.bank && !a.statistical && a.active !== false).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));

  const newVoucher = (type: 'IN' | 'OUT') =>
    prompt.open({
      title: type === 'OUT' ? 'Cash payment voucher' : 'Cash receipt voucher',
      fields: [
        { key: 'date', label: 'Date', type: 'date', initial: TODAY },
        { key: 'amount', label: 'Amount (KES)', type: 'number', required: true },
        { key: 'payee', label: type === 'OUT' ? 'Paid to' : 'Received from', required: true },
        { key: 'ref', label: 'Receipt / reference' },
        { key: 'offset', label: type === 'OUT' ? 'Expense account' : 'Income or source account', type: 'select', options: expenseOptions, initial: type === 'OUT' ? '6600' : '4100' },
        { key: 'cc', label: 'Cost centre', type: 'select', options: [{ value: '', label: '—' }, ...state.costCenters.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))] },
        { key: 'desc', label: 'Description', span: 2 }
      ],
      onSubmit: (v) => f.saveCashEntry({ cashAccount: cashAcc, date: v.date, type, offsetAccount: v.offset, amount: num(v.amount), payee: v.payee, ref: v.ref, description: v.desc, costCenter: v.cc || undefined })
    });

  const newTemplate = () =>
    prompt.open({
      title: 'New journal template',
      subtitle: 'Two-line template (debit / credit). Recurring templates create draft journals; accrual templates reverse on the 1st of the next month.',
      fields: [
        { key: 'name', label: 'Name', required: true, span: 2 },
        { key: 'dr', label: 'Debit account', type: 'select', options: expenseOptions, initial: '6500' },
        { key: 'cr', label: 'Credit account', type: 'select', options: expenseOptions, initial: '2200' },
        { key: 'amount', label: 'Amount', type: 'number', required: true },
        { key: 'freq', label: 'Frequency', type: 'select', options: [{ value: 'MONTHLY', label: 'Monthly' }, { value: 'QUARTERLY', label: 'Quarterly' }, { value: 'NONE', label: 'Only on demand' }] },
        { key: 'next', label: 'Next run', type: 'date', initial: TODAY },
        { key: 'end', label: 'Ends', type: 'date' },
        { key: 'rev', label: 'Accrual — reverse automatically', type: 'checkbox', initial: true },
        { key: 'reason', label: 'Reason code', type: 'select', options: state.reasonCodes.filter((r) => r.appliesTo === 'JOURNAL').map((r) => ({ value: r.code, label: r.label })) }
      ],
      onSubmit: (v) =>
        f.saveJournalTemplate({
          id: '',
          name: v.name,
          memo: v.name,
          lines: [
            { id: 'a', account: v.dr, description: v.name, debit: num(v.amount), credit: 0 },
            { id: 'b', account: v.cr, description: v.name, debit: 0, credit: num(v.amount) }
          ],
          frequency: v.freq as JournalTemplate['frequency'],
          nextRun: v.next,
          end: v.end || undefined,
          autoReverse: v.rev === 'true',
          reasonCode: v.reason,
          generated: []
        })
    });

  const voucherHtml = (j: Journal) =>
    `<h1>${j.cash?.type === 'OUT' ? 'Cash payment voucher' : 'Cash receipt voucher'} ${esc(j.number)}</h1><p>${esc(j.date)} · ${esc(acc?.name)}</p><table><tr><th>${j.cash?.type === 'OUT' ? 'Paid to' : 'Received from'}</th><td>${esc(j.cash?.payee)}</td></tr><tr><th>Reference</th><td>${esc(j.cash?.ref)}</td></tr><tr><th>Narration</th><td>${esc(j.memo)}</td></tr><tr><th>Amount</th><td>KES ${journalTotals(j).debit.toLocaleString()}</td></tr><tr><th>Status</th><td>${esc(j.status)}</td></tr></table><div class="sig"><div>Prepared: ${esc(j.preparedBy)}</div><div>Approved: ${esc(j.approvals.map((a) => a.by).join(', '))}</div><div>Received by</div></div>`;

  return (
    <SuitePage
      eyebrow="Ledger & cash"
      title="Cash book"
      subtitle="Petty cash vouchers that go through approval and post to the ledger, journal templates and accrual reversals."
      actions={
        tab === 'CASH' ? (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => newVoucher('IN')}>
              <Plus size={14} /> Cash in
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => newVoucher('OUT')}>
              <Wallet size={14} /> Cash out
            </button>
          </>
        ) : undefined
      }
    >
      <Chips<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'CASH', label: 'Cash journal', count: state.journals.filter((j) => j.source === 'CASH').length },
          { value: 'TEMPLATES', label: 'Journal templates', count: state.journalTemplates.length },
          { value: 'ACCRUALS', label: 'Accruals & reversals', count: accruals.length }
        ]}
      />
      {tab === 'CASH' && (
        <>
          <div className="sx-stats">
            <Stat label="Cash on hand" value={acc ? kes(balanceOf(entries, acc)) : '—'} detail={acc?.name} icon={<Wallet size={16} />} />
            <Stat label="Vouchers waiting" value={vouchers.filter((j) => j.status === 'SUBMITTED' || j.status === 'APPROVED').length} detail="approval or posting" icon={<Repeat size={16} />} tone="gold" />
          </div>
          <select className="form-control fx-inline-select" value={cashAcc} onChange={(e) => setCashAcc(e.target.value)} aria-label="Cash account">
            {cashAccounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
          <DataTable
            rows={vouchers}
            rowKey={(j) => j.id}
            onRowClick={(j) => setOpenId(j.id)}
            initialSort={{ key: 'd', dir: 'desc' }}
            columns={[
              { key: 'n', header: 'Voucher', render: (j) => <b className="sx-mono">{j.number}</b>, sort: (j) => j.number },
              { key: 'd', header: 'Date', render: (j) => fmtDate(j.date), sort: (j) => j.date },
              { key: 'p', header: 'Payee', render: (j) => <div className="sx-cell-main"><span>{j.cash?.payee}</span><small>{j.memo}</small></div> },
              { key: 'in', header: 'In', render: (j) => (j.cash?.type === 'IN' ? kes(journalTotals(j).debit) : ''), align: 'right' },
              { key: 'out', header: 'Out', render: (j) => (j.cash?.type === 'OUT' ? kes(journalTotals(j).debit) : ''), align: 'right' },
              { key: 'f', header: 'Follow-on', render: (j) => (j.followOn ?? []).map((x) => x.number).join(', ') || '—' },
              { key: 's', header: 'Status', render: (j) => <Pill status={j.status} /> }
            ]}
            empty="No cash vouchers for this account"
          />
        </>
      )}
      {tab === 'TEMPLATES' && (
        <Panel title="Journal templates" action={<button type="button" className="btn btn-secondary btn-sm" onClick={newTemplate}><Plus size={14} /> New template</button>} flush>
          <DataTable
            rows={state.journalTemplates}
            rowKey={(t) => t.id}
            columns={[
              { key: 'n', header: 'Template', render: (t) => <div className="sx-cell-main"><span>{t.name}</span><small>{t.lines.map((l) => `${l.account} ${l.debit ? 'Dr' : 'Cr'} ${(l.debit || l.credit).toLocaleString()}`).join(' · ')}</small></div> },
              { key: 'f', header: 'Frequency', render: (t) => (t.frequency === 'NONE' ? 'On demand' : t.frequency.toLowerCase()) },
              { key: 'nx', header: 'Next run', render: (t) => (t.nextRun ? fmtDate(t.nextRun) : '—') },
              { key: 'e', header: 'Ends', render: (t) => (t.end ? fmtDate(t.end) : '—') },
              { key: 'r', header: 'Auto-reverse', render: (t) => (t.autoReverse ? 'Yes' : 'No') },
              { key: 'g', header: 'Generated', render: (t) => t.generated.length, align: 'right' },
              { key: 'a', header: '', render: (t) => <button type="button" className="sx-link" onClick={() => f.runTemplate(t.id)}><Play size={12} /> Create journal</button> }
            ]}
          />
        </Panel>
      )}
      {tab === 'ACCRUALS' && (
        <Panel
          title="Accruals with automatic reversal"
          action={
            <div className="sx-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => prompt.open({
                title: 'Freight / goods received accrual',
                subtitle: 'Accrues freight or goods received but not yet invoiced at month end; reverses on the 1st.',
                fields: [
                  { key: 'date', label: 'Accrual date', type: 'date', initial: TODAY },
                  { key: 'amount', label: 'Amount', type: 'number', required: true },
                  { key: 'account', label: 'Cost account', type: 'select', options: expenseOptions, initial: '5100' },
                  { key: 'desc', label: 'What for', required: true, initial: 'Freight Kericho–Mombasa not yet invoiced' }
                ],
                onSubmit: (v) => f.accrueFreight({ date: v.date, amount: num(v.amount), description: v.desc, account: v.account })
              })}>
                <Truck size={14} /> Freight accrual
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => f.runDueReversals()}>
                <Undo2 size={14} /> Post due reversals
              </button>
            </div>
          }
          flush
        >
          <DataTable
            rows={accruals}
            rowKey={(j) => j.id}
            columns={[
              { key: 'n', header: 'Journal', render: (j) => <b className="sx-mono">{j.number}</b> },
              { key: 'm', header: 'Narration', render: (j) => j.memo },
              { key: 'd', header: 'Date', render: (j) => fmtDate(j.date) },
              { key: 'r', header: 'Reverses on', render: (j) => fmtDate(j.autoReverseOn!) },
              { key: 'a', header: 'Amount', render: (j) => kes(journalTotals(j).debit), align: 'right' },
              { key: 's', header: 'Status', render: (j) => (j.reversedBy ? <Pill status="CLOSED" label={`Reversed by ${state.journals.find((x) => x.id === j.reversedBy)?.number}`} /> : <Pill status={j.status} />) }
            ]}
            empty="No accruals waiting"
          />
        </Panel>
      )}
      {open && (
        <Drawer title={open.number} subtitle={open.memo} badge={<Pill status={open.status} />} onClose={() => setOpenId(null)} wide footer={<PrintButton title={open.number} html={() => voucherHtml(open)} label="Print voucher" />}>
          <DefList
            items={[
              ['Date', fmtDate(open.date)],
              [open.cash?.type === 'OUT' ? 'Paid to' : 'Received from', open.cash?.payee ?? ''],
              ['Reference', open.cash?.ref || '—'],
              ['Amount', kes(journalTotals(open).debit)],
              ['Follow-on documents', (open.followOn ?? []).map((x) => `${x.kind} ${x.number}`).join(', ') || (open.reversedBy ? `Reversed by ${state.journals.find((x) => x.id === open.reversedBy)?.number}` : 'None')]
            ]}
          />
          <Attachments owner={`finance:${open.number}`} by={f.actor.name} readOnly={f.readOnly} title="Receipts and supporting documents" />
          <WorkflowPanel collection="journals" doc={open} />
        </Drawer>
      )}
      {prompt.node}
    </SuitePage>
  );
};
