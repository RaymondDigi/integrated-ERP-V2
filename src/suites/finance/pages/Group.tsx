import React, { useMemo, useState } from 'react';
import { Building2, GitMerge, ArrowRightLeft, Scale } from 'lucide-react';
import { useFinance } from '../store';
import { companyOf, docBalance, kes, ledger, profitAndLoss, round2, scope, TODAY } from '../engine';
import { Chips, DataTable, Panel, Pill, Stat, SuitePage } from '../../ui/kit';
import { ExportCsvButton, PrintButton, esc } from '../../../platform/Widgets';
import { consolidate, intercompanyRecon } from '../ext/analytics';
import { usePrompt, num } from '../ext/ui';

type Tab = 'COMPANIES' | 'CONSOLIDATION' | 'IC' | 'SHARED';

/** Group & consolidation: companies, consolidated statements with eliminations, inter-company reconciliation and transfers. */
export const GroupPage: React.FC = () => {
  const f = useFinance();
  const { fullState, state } = f;
  const [tab, setTab] = useState<Tab>('COMPANIES');
  const prompt = usePrompt();
  const cons = useMemo(() => consolidate(fullState), [fullState]);
  const recon = useMemo(() => intercompanyRecon(fullState), [fullState]);
  const name = (id: string) => fullState.companies.find((c) => c.id === id)?.code ?? id;
  const perCo = useMemo(
    () =>
      fullState.companies.map((co) => {
        const v = scope(fullState, co.id);
        const pl = profitAndLoss(v, ledger(v), `${TODAY.slice(0, 4)}-01-01`, TODAY);
        return {
          co,
          revenue: pl.totalIncome,
          profit: pl.netProfit,
          docs: v.documents.length,
          open: round2(v.documents.filter((d) => d.status === 'POSTED').reduce((x, d) => x + docBalance(v, d) * (d.fxRate ?? 1), 0)),
          waiting: [...v.documents, ...v.settlements, ...v.journals].filter((d) => d.status === 'SUBMITTED' || d.status === 'APPROVED').length,
          plants: co.plants.join(', ')
        };
      }),
    [fullState]
  );
  const plRows = cons.rows.filter((r) => r.account.type === 'INCOME' || r.account.type === 'EXPENSE');
  const consProfit = round2(-plRows.reduce((x, r) => x + r.consolidated, 0));

  const consHtml = () =>
    `<h1>Consolidated trial balance — ${esc(TODAY)}</h1><table><tr><th>Account</th>${cons.companies.map((c) => `<th class="r">${esc(c.code)}</th>`).join('')}<th class="r">Eliminations</th><th class="r">Group</th></tr>${cons.rows
      .map((r) => `<tr><td>${esc(r.account.code)} ${esc(r.account.name)}</td>${r.by.map((n) => `<td class="r">${n.toLocaleString()}</td>`).join('')}<td class="r">${r.elimination.toLocaleString()}</td><td class="r">${r.consolidated.toLocaleString()}</td></tr>`)
      .join('')}</table><p>Unreconciled inter-company difference: ${cons.icDiff.toLocaleString()}</p>`;

  return (
    <SuitePage
      eyebrow="Group"
      title="Group & consolidation"
      subtitle="Each company keeps its own books; the group view adds them up and removes what they owe each other."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => prompt.open({
          title: 'Inter-company transfer',
          subtitle: `From ${name(state.activeCompany)} — posts both companies' entries with inter-company receivable and payable.`,
          fields: [
            { key: 'kind', label: 'What moves', type: 'select', options: [{ value: 'INVENTORY', label: 'Inventory — WIP or finished tea' }, { value: 'CASH', label: 'Cash / funding' }, { value: 'PAYABLE', label: 'Supplier bill paid on behalf' }] },
            { key: 'to', label: 'To company', type: 'select', options: fullState.companies.filter((c) => c.id !== state.activeCompany).map((c) => ({ value: c.id, label: c.name })) },
            { key: 'amount', label: 'Amount (KES)', type: 'number', required: true },
            { key: 'date', label: 'Date', type: 'date', initial: TODAY },
            { key: 'account', label: 'Inventory account (WIP 1220 or FG 1200)', type: 'select', options: [{ value: '1200', label: '1200 Finished tea' }, { value: '1220', label: '1220 Work in progress' }] },
            { key: 'bill', label: 'Bill (payables transfer)', type: 'select', options: [{ value: '', label: '—' }, ...state.documents.filter((d) => d.kind === 'BILL' && d.status === 'POSTED' && docBalance(state, d) > 0.005).map((d) => ({ value: d.id, label: `${d.number} · ${d.reference}` }))] },
            { key: 'desc', label: 'Description', required: true, span: 2 }
          ],
          onSubmit: (v) => f.intercompanyTransfer({ kind: v.kind as 'CASH' | 'INVENTORY' | 'PAYABLE', toCompany: v.to, amount: num(v.amount), date: v.date, description: v.desc, account: v.account, billId: v.bill || undefined })
        })}>
          <ArrowRightLeft size={14} /> Inter-company transfer
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Companies" value={fullState.companies.length} detail={fullState.companies.map((c) => c.code).join(' · ')} icon={<Building2 size={16} />} />
        <Stat label="Group profit YTD" value={kes(consProfit, { compact: true })} detail="after eliminations" icon={<GitMerge size={16} />} tone="blue" />
        <Stat label="IC difference" value={kes(cons.icDiff, { compact: true })} detail={cons.icDiff ? 'Investigate before consolidating' : 'Reconciled'} icon={<Scale size={16} />} tone={Math.abs(cons.icDiff) > 1 ? 'red' : 'green'} />
      </div>
      <Chips<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'COMPANIES', label: 'Companies' },
          { value: 'CONSOLIDATION', label: 'Consolidated trial balance' },
          { value: 'IC', label: 'Inter-company reconciliation', count: recon.length },
          { value: 'SHARED', label: 'Shared service centre' }
        ]}
      />
      {tab === 'COMPANIES' && (
        <DataTable
          rows={perCo}
          rowKey={(r) => r.co.id}
          columns={[
            { key: 'c', header: 'Company', render: (r) => <div className="sx-cell-main"><span>{r.co.code} · {r.co.name}</span><small>PIN {r.co.pin} · plants: {r.plants || '—'}</small></div> },
            { key: 'r', header: 'Revenue YTD', render: (r) => kes(r.revenue, { compact: true }), align: 'right' },
            { key: 'p', header: 'Profit YTD', render: (r) => kes(r.profit, { compact: true }), align: 'right' },
            { key: 'o', header: 'Close owner', render: (r) => r.co.closeOwner },
            { key: 'a', header: '', render: (r) => (r.co.id === state.activeCompany ? <Pill status="ACTIVE" label="Working in" /> : <button type="button" className="sx-link" onClick={() => f.setCompany(r.co.id)}>Switch to</button>) }
          ]}
        />
      )}
      {tab === 'CONSOLIDATION' && (
        <Panel
          title="Consolidated trial balance"
          subtitle="Debit positive, credit negative. Inter-company receivables and payables are eliminated."
          action={
            <div className="sx-actions">
              <ExportCsvButton name="consolidated-tb" header={['Account', 'Name', ...cons.companies.map((c) => c.code), 'Eliminations', 'Group']} rows={() => cons.rows.map((r) => [r.account.code, r.account.name, ...r.by, r.elimination, r.consolidated])} />
              <PrintButton title="Consolidated trial balance" html={consHtml} />
            </div>
          }
          flush
        >
          <DataTable
            rows={cons.rows}
            rowKey={(r) => r.account.code}
            pageSize={40}
            columns={[
              { key: 'a', header: 'Account', render: (r) => `${r.account.code} · ${r.account.name}` },
              ...cons.companies.map((c, i) => ({ key: c.id, header: c.code, render: (r: (typeof cons.rows)[number]) => r.by[i].toLocaleString(), align: 'right' as const })),
              { key: 'e', header: 'Elim.', render: (r) => (r.elimination ? r.elimination.toLocaleString() : ''), align: 'right' },
              { key: 'g', header: 'Group', render: (r) => <b>{r.consolidated.toLocaleString()}</b>, align: 'right' }
            ]}
          />
        </Panel>
      )}
      {tab === 'IC' && (
        <DataTable
          rows={recon}
          rowKey={(r) => `${r.a}-${r.b}`}
          columns={[
            { key: 'p', header: 'Pair', render: (r) => `${name(r.a)} ↔ ${name(r.b)}` },
            { key: 'r', header: 'Receivable side', render: (r) => kes(r.receivable), align: 'right' },
            { key: 'y', header: 'Payable side', render: (r) => kes(r.payable), align: 'right' },
            { key: 'd', header: 'Difference', render: (r) => <b className={Math.abs(r.difference) > 1 ? 'sx-danger-text' : 'sx-success-text'}>{kes(r.difference)}</b>, align: 'right' },
            { key: 's', header: 'Status', render: (r) => <Pill status={Math.abs(r.difference) > 1 ? 'UNMATCHED' : 'MATCHED'} /> }
          ]}
          empty="No inter-company balances"
        />
      )}
      {tab === 'SHARED' && (
        <Panel title="Accounting as a shared service" subtitle="One finance team processes every company; switch company from the sidebar to work in its books.">
          <DataTable
            rows={perCo}
            rowKey={(r) => r.co.id}
            columns={[
              { key: 'c', header: 'Company', render: (r) => r.co.code },
              { key: 'd', header: 'Documents', render: (r) => r.docs, align: 'right' },
              { key: 'w', header: 'Waiting for approval / posting', render: (r) => r.waiting, align: 'right' },
              { key: 'o', header: 'Open items (KES)', render: (r) => kes(r.open, { compact: true }), align: 'right' },
              { key: 'j', header: 'Journals', render: (r) => fullState.journals.filter((j) => companyOf(j) === r.co.id).length, align: 'right' }
            ]}
          />
        </Panel>
      )}
      {prompt.node}
    </SuitePage>
  );
};
