import React, { useMemo, useState } from 'react';
import { PieChart, Play, Plus, Briefcase, Activity as ActivityIcon } from 'lucide-react';
import { useFinance } from '../store';
import { addMonths, kes, ledger, periodOf, round2, scope, TODAY } from '../engine';
import type { CostObject } from '../types';
import { Chips, DataTable, Drawer, Meter, Panel, Pill, SuitePage } from '../../ui/kit';
import { ExportCsvButton } from '../../../platform/Widgets';
import { dimensionBalances } from '../ext/analytics';
import { usePrompt, num } from '../ext/ui';

type Tab = 'CENTRES' | 'PROFIT' | 'ALLOC' | 'ABC' | 'PROJECTS';

/** Ledger & cash › Cost accounting: cost/profit centres, allocations, activity-based costing and project/order cost sheets. */
export const CostingPage: React.FC = () => {
  const f = useFinance();
  const { state, entries } = f;
  const [tab, setTab] = useState<Tab>('CENTRES');
  const [dim, setDim] = useState<'department' | 'plant' | 'project'>('department');
  const [openId, setOpenId] = useState<string | null>(null);
  const prompt = usePrompt();
  const from = `${TODAY.slice(0, 4)}-01-01`;
  const centres = useMemo(() => dimensionBalances(state, entries, 'costCenter', from, TODAY), [state, entries, from]);
  const byDim = useMemo(() => dimensionBalances(state, entries, dim, from, TODAY), [state, entries, dim, from]);
  const lastMonth = periodOf(addMonths(TODAY, -1));
  const open = state.costObjects.find((o) => o.id === openId) ?? null;
  const expenseOptions = state.accounts.filter((a) => a.type === 'EXPENSE').map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));

  return (
    <SuitePage eyebrow="Ledger & cash" title="Cost accounting" subtitle="Cost and profit centres, overhead allocation, activity-based costing and cost sheets for projects and client orders.">
      <Chips<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'CENTRES', label: 'Cost & profit centres', count: state.costCenters.length },
          { value: 'PROFIT', label: 'Profitability' },
          { value: 'ALLOC', label: 'Overhead allocation', count: state.allocationRules.length },
          { value: 'ABC', label: 'Activity-based costing', count: state.activities.length },
          { value: 'PROJECTS', label: 'Projects & order cost sheets', count: state.costObjects.length }
        ]}
      />
      {tab === 'CENTRES' && (
        <Panel title="Centre balances — year to date" action={<ExportCsvButton name="profit-centre-balances" header={['Centre', 'Name', 'Type', 'Income', 'Costs', 'Result']} rows={() => centres.map((c) => [c.key, state.costCenters.find((x) => x.code === c.key)?.name ?? '', state.costCenters.find((x) => x.code === c.key)?.type ?? '', c.income, c.expense, c.result])} />} flush>
          <DataTable
            rows={centres}
            rowKey={(c) => c.key}
            columns={[
              { key: 'k', header: 'Centre', render: (c) => { const cc = state.costCenters.find((x) => x.code === c.key); return <div className="sx-cell-main"><span>{c.key}{cc ? ` · ${cc.name}` : ''}</span><small>{cc ? `${cc.type === 'PROFIT' ? 'Profit centre' : 'Cost centre'} · ${cc.manager}` : 'Postings without a centre'}</small></div>; }, sort: (c) => c.key },
              { key: 'i', header: 'Income', render: (c) => kes(c.income), sort: (c) => c.income, align: 'right' },
              { key: 'e', header: 'Costs', render: (c) => kes(c.expense), sort: (c) => c.expense, align: 'right' },
              { key: 'r', header: 'Result', render: (c) => <b className={c.result < 0 ? 'sx-danger-text' : ''}>{kes(c.result)}</b>, sort: (c) => c.result, align: 'right' }
            ]}
          />
        </Panel>
      )}
      {tab === 'PROFIT' && (
        <Panel
          title="Profitability by dimension"
          action={
            <select className="form-control fx-inline-select" value={dim} onChange={(e) => setDim(e.target.value as typeof dim)} aria-label="Dimension">
              <option value="department">Division / department</option>
              <option value="plant">Plant / product line</option>
              <option value="project">Project / order</option>
            </select>
          }
          flush
        >
          <DataTable
            rows={byDim}
            rowKey={(c) => c.key}
            columns={[
              { key: 'k', header: 'Dimension', render: (c) => c.key },
              { key: 'i', header: 'Revenue', render: (c) => kes(c.income), align: 'right' },
              { key: 'e', header: 'Costs', render: (c) => kes(c.expense), align: 'right' },
              { key: 'r', header: 'Margin', render: (c) => kes(c.result), align: 'right' },
              { key: 'm', header: 'Margin %', render: (c) => (c.income ? `${Math.round((c.result / c.income) * 100)}%` : '—'), align: 'right' }
            ]}
          />
        </Panel>
      )}
      {tab === 'ALLOC' && (
        <Panel
          title="Allocation rules (percentages)"
          subtitle={`Runs move the month's cost of a source account to cost centres by percentage — run for ${lastMonth}`}
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => prompt.open({
              title: 'New allocation rule',
              fields: [
                { key: 'name', label: 'Name', required: true, span: 2 },
                { key: 'src', label: 'Source account', type: 'select', options: expenseOptions },
                { key: 'targets', label: 'Targets (centre:pct, …)', initial: 'CC-FAC:50, CC-WH:30, PC-LOCAL:20', span: 2 }
              ],
              onSubmit: (v) => f.saveAllocationRule({ id: '', name: v.name, sourceAccount: v.src, targets: v.targets.split(',').map((t) => { const [cc, pct] = t.split(':').map((x) => x.trim()); return { costCenter: cc, account: v.src, pct: num(pct) }; }) })
            })}>
              <Plus size={14} /> New rule
            </button>
          }
          flush
        >
          <DataTable
            rows={state.allocationRules}
            rowKey={(r) => r.id}
            columns={[
              { key: 'n', header: 'Rule', render: (r) => <div className="sx-cell-main"><span>{r.name}</span><small>From {r.sourceAccount}</small></div> },
              { key: 't', header: 'Targets', render: (r) => r.targets.map((t) => `${t.costCenter} ${t.pct}%`).join(' · ') },
              { key: 'l', header: 'Last run', render: (r) => r.lastRun ?? '—' },
              { key: 'a', header: '', render: (r) => <button type="button" className="sx-link" onClick={() => f.runAllocation(r.id, lastMonth)}><Play size={12} /> Run {lastMonth}</button> }
            ]}
          />
        </Panel>
      )}
      {tab === 'ABC' && (
        <Panel
          title="Activities, cost pools and drivers"
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => prompt.open({
              title: 'New activity',
              fields: [
                { key: 'name', label: 'Activity', required: true },
                { key: 'pool', label: 'Cost pool account', type: 'select', options: expenseOptions },
                { key: 'driver', label: 'Driver (e.g. machine hours)', required: true },
                { key: 'usage', label: 'Usage (centre:qty, …)', initial: 'CC-FAC:120, CC-WH:40', span: 2 }
              ],
              onSubmit: (v) => f.saveActivity({ id: '', name: v.name, pool: v.pool, driver: v.driver, usage: Object.fromEntries(v.usage.split(',').map((t) => { const [cc, q] = t.split(':').map((x) => x.trim()); return [cc, num(q)]; })) })
            })}>
              <ActivityIcon size={14} /> New activity
            </button>
          }
          flush
        >
          <DataTable
            rows={state.activities}
            rowKey={(a) => a.id}
            columns={[
              { key: 'n', header: 'Activity', render: (a) => <div className="sx-cell-main"><span>{a.name}</span><small>Pool {a.pool} · driver: {a.driver}</small></div> },
              { key: 'u', header: 'Driver usage', render: (a) => Object.entries(a.usage).map(([cc, q]) => `${cc} ${q}`).join(' · ') },
              { key: 'r', header: '', render: (a) => <button type="button" className="sx-link" onClick={() => f.runAbc(a.id, lastMonth)}><PieChart size={12} /> Cost {lastMonth}</button> }
            ]}
          />
        </Panel>
      )}
      {tab === 'PROJECTS' && (
        <Panel
          title="Projects, events and client orders"
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => prompt.open({
              title: 'New project or order cost sheet',
              fields: [
                { key: 'code', label: 'Code (tag postings with it)', required: true },
                { key: 'name', label: 'Name', required: true },
                { key: 'type', label: 'Type', type: 'select', options: [{ value: 'PROJECT', label: 'Project' }, { value: 'ORDER', label: 'Client order' }, { value: 'EVENT', label: 'Event' }] },
                { key: 'customer', label: 'Customer', type: 'select', options: [{ value: '', label: '—' }, ...state.parties.filter((p) => p.kind === 'CUSTOMER').map((p) => ({ value: p.id, label: p.name }))] },
                { key: 'revenue', label: 'Revenue estimate', type: 'number' },
                { key: 'sheet', label: 'Cost sheet (category:account:amount, …)', initial: 'Tea:5000:400000, Packaging:5000:120000, Freight:5100:60000', span: 2 }
              ],
              onSubmit: (v) =>
                f.saveCostObject({
                  id: '',
                  code: v.code.trim().toUpperCase(),
                  name: v.name,
                  type: v.type as CostObject['type'],
                  customerId: v.customer || undefined,
                  companyId: state.activeCompany,
                  status: 'OPEN',
                  revenueEstimate: num(v.revenue),
                  estimate: v.sheet.split(',').map((t) => { const [category, account, amount] = t.split(':').map((x) => x.trim()); return { category, account, amount: num(amount) }; }).filter((e) => e.category)
                })
            })}>
              <Briefcase size={14} /> New cost sheet
            </button>
          }
          flush
        >
          <DataTable
            rows={state.costObjects}
            rowKey={(o) => o.id}
            onRowClick={(o) => setOpenId(o.id)}
            columns={[
              { key: 'c', header: 'Code', render: (o) => <b className="sx-mono">{o.code}</b> },
              { key: 'n', header: 'Name', render: (o) => <div className="sx-cell-main"><span>{o.name}</span><small>{o.type.toLowerCase()}{o.customerId ? ` · ${state.parties.find((p) => p.id === o.customerId)?.name}` : ''}</small></div> },
              { key: 'e', header: 'Estimate', render: (o) => kes(o.estimate.reduce((x, e) => x + e.amount, 0)), align: 'right' },
              { key: 'a', header: 'Actual', render: (o) => kes(actualOf(entries, state, o.code)), align: 'right' },
              { key: 'u', header: 'Used', render: (o) => { const est = o.estimate.reduce((x, e) => x + e.amount, 0); const act = actualOf(entries, state, o.code); return <Meter value={est ? act / est : 0} tone={act > est ? 'red' : 'green'} />; } },
              { key: 's', header: 'Status', render: (o) => <Pill status={o.status === 'SETTLED' ? 'CLOSED' : 'OPEN'} label={o.status.toLowerCase()} /> }
            ]}
          />
        </Panel>
      )}
      {open && <CostSheet obj={open} onClose={() => setOpenId(null)} />}
      {prompt.node}
    </SuitePage>
  );
};

const actualOf = (entries: ReturnType<typeof ledger>, state: ReturnType<typeof scope>, code: string) =>
  round2(entries.filter((e) => e.project === code && state.accounts.find((a) => a.code === e.account)?.type === 'EXPENSE').reduce((x, e) => x + e.debit - e.credit, 0));

const CostSheet: React.FC<{ obj: CostObject; onClose: () => void }> = ({ obj, onClose }) => {
  const f = useFinance();
  const { state, entries } = f;
  const prompt = usePrompt();
  const rev = round2(entries.filter((e) => e.project === obj.code && state.accounts.find((a) => a.code === e.account)?.type === 'INCOME').reduce((x, e) => x + e.credit - e.debit, 0));
  const rows = obj.estimate.map((e) => ({ ...e, actual: round2(entries.filter((x) => x.project === obj.code && x.account === e.account).reduce((s, x) => s + x.debit - x.credit, 0) / Math.max(1, obj.estimate.filter((y) => y.account === e.account).length)) }));
  const actual = actualOf(entries, state, obj.code);
  return (
    <Drawer title={`${obj.code} · ${obj.name}`} subtitle="Cost sheet — estimate against actual postings tagged with this code" onClose={onClose} wide>
      <DataTable
        rows={rows}
        rowKey={(r) => r.category}
        columns={[
          { key: 'c', header: 'Category', render: (r) => r.category },
          { key: 'a', header: 'Account', render: (r) => r.account },
          { key: 'e', header: 'Estimate', render: (r) => kes(r.amount), align: 'right' },
          { key: 'x', header: 'Actual', render: (r) => kes(r.actual), align: 'right' },
          { key: 'v', header: 'Variance', render: (r) => kes(round2(r.amount - r.actual), { sign: true }), align: 'right' }
        ]}
        footer={<tr><td colSpan={5}><span>Total actual {kes(actual)} · Revenue {kes(rev)} (estimate {kes(obj.revenueEstimate)}) · Margin {kes(round2(rev - actual))}</span></td></tr>}
      />
      {obj.settlement ? (
        <p className="sx-note">Settled {obj.settlement.at}: {kes(obj.settlement.amount)} {obj.settlement.mode === 'CAPITALISE' ? 'capitalised to' : 'charged to'} {obj.settlement.target}.</p>
      ) : (
        <div className="sx-actions fx-bar">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => prompt.open({ title: 'Capitalise project costs', fields: [{ key: 't', label: 'Asset account', type: 'select', options: state.accounts.filter((a) => a.type === 'ASSET' && !a.control && !a.bank).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` })) }], onSubmit: (v) => f.settleCostObject(obj.id, 'CAPITALISE', v.t) })}>
            Capitalise
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => prompt.open({ title: 'Charge project costs', fields: [{ key: 't', label: 'Expense account', type: 'select', options: state.accounts.filter((a) => a.type === 'EXPENSE').map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` })), initial: '5000' }], onSubmit: (v) => f.settleCostObject(obj.id, 'EXPENSE', v.t) })}>
            Charge to cost of sales
          </button>
        </div>
      )}
      {prompt.node}
    </Drawer>
  );
};
