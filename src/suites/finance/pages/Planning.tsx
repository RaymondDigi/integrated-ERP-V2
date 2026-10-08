import React, { useState } from 'react';
import { Target, TrendingDown, TrendingUp, Pencil, Plus, Play, Building2, Lock, Unlock, CheckCircle2, Circle, CalendarCheck, AlertTriangle } from 'lucide-react';
import { useFinance, CHECKLIST } from '../store';
import {
  accumulatedDepreciation,
  budgetLinesFor,
  budgetVsActual,
  depreciationFor,
  fmtDate,
  kes,
  monthlyCharge,
  periodLabel,
  periodOf,
  round2,
  TODAY
} from '../engine';
import { MONTH_NAMES } from '../../../data/orgSettings';
import type { FixedAsset } from '../types';
import { Chips, DataTable, DefList, Drawer, Field, Meter, Modal, Panel, Pill, Stat, SuitePage, type Column } from '../../ui/kit';
import { useLookups } from '../parts';
import { DEPARTMENTS } from '../data';
import { SPREAD_PROFILES } from '../ext/planning';
import { num, usePrompt } from '../ext/ui';

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

export const BudgetsPage: React.FC = () => {
  const f = useFinance();
  const { state, entries, actor } = f;
  const prompt = usePrompt();
  const month = Number(TODAY.slice(5, 7)) - 1;
  // Compare to the last complete month by default
  const [through, setThrough] = useState(Math.max(0, month - 1));
  const [year, setYear] = useState(state.budgetYear);
  const [kind, setKind] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [editing, setEditing] = useState<string | null>(null);
  const years = [...new Set([state.budgetYear, ...state.budgets.map((b) => b.year ?? state.budgetYear), state.budgetYear + 1])].sort();
  const all = budgetVsActual(state, entries, through, year);
  const rows = all.filter((r) => kind === 'ALL' || r.account.type === kind);
  const lyActual = (code: string, type: string) =>
    round2(
      entries
        .filter((e) => e.account === code && e.date >= `${year - 1}-01-01` && e.date <= `${year - 1}-${String(through + 1).padStart(2, '0')}-31` && !e.closing)
        .reduce((x, e) => x + (type === 'INCOME' ? e.credit - e.debit : e.debit - e.credit), 0)
    );
  const lines = budgetLinesFor(state, year);
  const pendingApproval = lines.filter((b) => b.status === 'DRAFT').length;
  const plAccounts = state.accounts.filter((a) => (a.type === 'EXPENSE' || a.type === 'INCOME') && a.active !== false).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));
  const budgetAccounts = lines.map((b) => ({ value: b.account, label: `${b.account} · ${state.accounts.find((a) => a.code === b.account)?.name ?? ''}` }));
  const monthOpts = MONTH_NAMES.map((m, i) => ({ value: String(i), label: m }));
  const spread = () =>
    prompt.open({
      title: `Add or re-spread a ${year} budget line`,
      fields: [
        { key: 'account', label: 'Account', type: 'select', options: plAccounts, span: 2 },
        { key: 'dept', label: 'Department', type: 'select', options: DEPARTMENTS.map((d) => ({ value: d, label: d })) },
        { key: 'annual', label: 'Annual amount', type: 'number', required: true },
        { key: 'profile', label: 'Spread', type: 'select', options: [...Object.keys(SPREAD_PROFILES).map((k) => ({ value: k, label: k.replace(/_/g, ' ').toLowerCase() })), { value: 'LAST_YEAR', label: 'like last year' }] }
      ],
      submitLabel: 'Spread',
      onSubmit: (v) => f.spreadBudget(v.account, v.dept, year, num(v.annual), v.profile as keyof typeof SPREAD_PROFILES)
    });
  const copy = () =>
    prompt.open({
      title: `Prepare the ${year + 1} budget`,
      subtitle: `Copies every ${year} line as a draft for ${year + 1}.`,
      fields: [{ key: 'uplift', label: 'Uplift %', type: 'number', initial: 5 }],
      submitLabel: 'Copy',
      onSubmit: (v) => {
        const r = f.copyBudget(year, year + 1, num(v.uplift));
        if (r.ok) setYear(year + 1);
        return r;
      }
    });
  const change = () =>
    prompt.open({
      title: 'Request a budget change',
      fields: [
        { key: 'type', label: 'Type', type: 'select', options: [{ value: 'SUPPLEMENTARY', label: 'Supplementary (extra money)' }, { value: 'REALLOCATION', label: 'Reallocation between lines' }] },
        { key: 'month', label: 'Month', type: 'select', options: monthOpts, initial: String(month) },
        { key: 'from', label: 'From line (reallocation)', type: 'select', options: [{ value: '', label: '—' }, ...budgetAccounts] },
        { key: 'to', label: 'To line', type: 'select', options: budgetAccounts },
        { key: 'amount', label: 'Amount', type: 'number', required: true },
        { key: 'reason', label: 'Reason', type: 'textarea', required: true }
      ],
      submitLabel: 'Request',
      onSubmit: (v) => f.requestBudgetChange({ type: v.type as 'SUPPLEMENTARY' | 'REALLOCATION', year, month: Number(v.month), fromAccount: v.from || undefined, toAccount: v.to, amount: num(v.amount), reason: v.reason })
    });
  const objective = () =>
    prompt.open({
      title: 'Strategic objective',
      fields: [
        { key: 'code', label: 'Code', required: true },
        { key: 'name', label: 'Objective', required: true },
        { key: 'kpi', label: 'KPI' },
        { key: 'target', label: 'Target', type: 'number' },
        { key: 'actual', label: 'Actual', type: 'number' }
      ],
      onSubmit: (v) => f.saveObjective({ id: '', code: v.code, name: v.name, kpi: v.kpi, target: num(v.target), actual: num(v.actual) })
    });
  const changes = state.budgetChanges.filter((b) => b.year === year);
  const rev = all.filter((r) => r.account.type === 'INCOME');
  const exp = all.filter((r) => r.account.type === 'EXPENSE');
  const sum = (list: typeof all, k: 'budget' | 'actual') => round2(list.reduce((s, r) => s + r[k], 0));
  const over = exp.filter((r) => r.actual > r.budget * 1.05);

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      key: 'account',
      header: 'Account',
      render: (r) => (
        <div className="sx-cell-main">
          <span>{r.account.name}</span>
          <small>
            {r.account.code} · {r.line.department}
          </small>
        </div>
      ),
      sort: (r) => r.account.code
    },
    { key: 'annual', header: 'Annual budget', render: (r) => kes(r.annual, { compact: true }), sort: (r) => r.annual, align: 'right', hideOnMobile: true },
    { key: 'budget', header: 'Budget to date', render: (r) => kes(r.budget, { compact: true }), sort: (r) => r.budget, align: 'right' },
    { key: 'actual', header: 'Actual to date', render: (r) => <b>{kes(r.actual, { compact: true })}</b>, sort: (r) => r.actual, align: 'right' },
    { key: 'ly', header: 'Last year to date', render: (r) => kes(lyActual(r.account.code, r.account.type), { compact: true }), align: 'right', hideOnMobile: true },
    {
      key: 'obj',
      header: 'Objective',
      render: (r) => (
        <select className="form-control" value={r.line.objectiveId ?? ''} onClick={(e) => e.stopPropagation()} onChange={(e) => f.linkBudgetObjective(r.account.code, year, e.target.value)} aria-label="Strategic objective">
          <option value="">—</option>
          {state.objectives.map((o) => (
            <option key={o.id} value={o.id}>
              {o.code}
            </option>
          ))}
        </select>
      ),
      hideOnMobile: true
    },
    {
      key: 'variance',
      header: 'Variance',
      render: (r) => <span className={r.variance < 0 ? 'sx-danger-text' : 'sx-success-text'}>{kes(r.variance, { compact: true, sign: true })}</span>,
      sort: (r) => r.variance,
      align: 'right'
    },
    {
      key: 'used',
      header: 'Used',
      render: (r) => {
        const bad = r.account.type === 'EXPENSE' ? r.used > 1.05 : r.used < 0.9;
        return (
          <div className="sx-meter-cell">
            <Meter value={r.used} tone={bad ? 'red' : r.used > 0.95 && r.account.type === 'EXPENSE' ? 'gold' : 'green'} />
            <small>{Math.round(r.used * 100)}%</small>
          </div>
        );
      },
      sort: (r) => r.used,
      width: 150,
      hideOnMobile: true
    },
    {
      key: 'edit',
      header: '',
      render: (r) =>
        actor.role !== 'ACCOUNTANT' ? (
          <button type="button" className="sx-icon-btn" onClick={(e) => (e.stopPropagation(), setEditing(r.account.code))} aria-label={`Edit budget for ${r.account.name}`}>
            <Pencil size={14} />
          </button>
        ) : null,
      width: 44
    }
  ];

  return (
    <SuitePage
      eyebrow="Planning"
      title={`Budget ${year}`}
      subtitle="Compare the approved budget with what has actually been posted and with last year. Over-spending shows in red."
      actions={
        <>
        <label className="sx-inline-select">
          <span>Year</span>
          <select className="form-control" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Budget year">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="sx-inline-select">
          <span>Through</span>
          <select className="form-control" value={through} onChange={(e) => setThrough(Number(e.target.value))}>
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        </label>
        </>
      }
    >
      <div className="sx-actions fx-bar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={spread}>
          <Plus size={14} /> Budget line
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
          Prepare {year + 1}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={change}>
          Request change
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={objective}>
          Objective
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => f.approveBudget(year)} disabled={!pendingApproval}>
          Approve {year} ({pendingApproval} draft)
        </button>
      </div>
      <div className="sx-stats">
        <Stat label="Revenue vs budget" value={`${Math.round((sum(rev, 'actual') / (sum(rev, 'budget') || 1)) * 100)}%`} detail={`${kes(sum(rev, 'actual'), { compact: true })} of ${kes(sum(rev, 'budget'), { compact: true })}`} icon={<TrendingUp size={17} />} />
        <Stat label="Spending vs budget" value={`${Math.round((sum(exp, 'actual') / (sum(exp, 'budget') || 1)) * 100)}%`} detail={`${kes(sum(exp, 'actual'), { compact: true })} of ${kes(sum(exp, 'budget'), { compact: true })}`} icon={<TrendingDown size={17} />} tone="blue" />
        <Stat label="Lines over budget" value={over.length} detail={over.map((r) => r.account.name).slice(0, 2).join(', ') || 'All spending within budget'} icon={<AlertTriangle size={17} />} tone={over.length ? 'red' : 'green'} />
        <Stat label="Profit vs plan" value={kes(round2(sum(rev, 'actual') - sum(exp, 'actual') - (sum(rev, 'budget') - sum(exp, 'budget'))), { compact: true, sign: true })} detail="Budgeted lines only" icon={<Target size={17} />} tone="violet" />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={kind}
          onChange={setKind}
          options={[
            { value: 'ALL', label: 'All lines' },
            { value: 'INCOME', label: 'Revenue' },
            { value: 'EXPENSE', label: 'Costs' }
          ]}
        />
        {actor.role === 'ACCOUNTANT' && <span className="sx-note">Budgets are changed by the Finance Manager or Director.</span>}
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.account.code} pageSize={20} />
      <div className="sx-grid sx-grid-2">
        <Panel title="Budget changes" subtitle="Supplementary budgets and reallocations go through approval before they change the plan">
          {changes.length ? (
            <table className="fx-table">
              <tbody>
                {changes.map((b) => (
                  <tr key={b.id}>
                    <td className="sx-mono">{b.number}</td>
                    <td>
                      {b.type === 'REALLOCATION' ? `${b.fromAccount} → ` : '+ '}
                      {b.toAccount} · {MONTH_NAMES[b.month]}
                    </td>
                    <td className="r">{b.amount.toLocaleString()}</td>
                    <td>
                      <Pill status={b.status} />
                    </td>
                    <td>
                      <span className="fx-row-actions">
                        {b.status === 'SUBMITTED' && (
                          <>
                            <button type="button" className="sx-link" onClick={() => f.workflow('budgetChanges', b.id, 'approve')}>
                              Approve
                            </button>
                            <button type="button" className="sx-link" onClick={() => f.workflow('budgetChanges', b.id, 'reject', 'Not supported')}>
                              Reject
                            </button>
                          </>
                        )}
                        {b.status === 'APPROVED' && (
                          <button type="button" className="sx-link" onClick={() => f.applyBudgetChange(b.id)}>
                            Apply
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sx-muted">No changes requested for {year}.</p>
          )}
        </Panel>
        <Panel title="Strategic objectives" subtitle="Budget funding linked to each objective">
          {state.objectives.length ? (
            <table className="fx-table">
              <tbody>
                {state.objectives.map((o) => (
                  <tr key={o.id}>
                    <td className="sx-mono">{o.code}</td>
                    <td>
                      {o.name}
                      <small className="sx-muted"> · {o.kpi}</small>
                    </td>
                    <td className="r">
                      {o.actual.toLocaleString()} / {o.target.toLocaleString()}
                    </td>
                    <td className="r">{kes(lines.filter((b) => b.objectiveId === o.id).reduce((x, b) => x + b.monthly.reduce((y, m) => y + m, 0), 0), { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sx-muted">No objectives yet.</p>
          )}
        </Panel>
      </div>
      {prompt.node}
      {editing && <BudgetEditor account={editing} year={year} onClose={() => setEditing(null)} />}
    </SuitePage>
  );
};

const BudgetEditor: React.FC<{ account: string; year: number; onClose: () => void }> = ({ account, year, onClose }) => {
  const { setBudget, state } = useFinance();
  const { accountLabel } = useLookups();
  const line = budgetLinesFor(state, year).find((b) => b.account === account)!;
  const [months, setMonths] = useState(line.monthly.map(String));
  const total = months.reduce((s, m) => s + (Number(m) || 0), 0);
  return (
    <Modal
      size="lg"
      title={`Budget — ${accountLabel(account)}`}
      subtitle={`${year} monthly plan${line.status ? ` · ${line.status.toLowerCase()}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">
            Annual <b>{kes(total)}</b>
          </span>
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMonths(months.map(() => String(Math.round(total / 12))))}>
            Spread evenly
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (setBudget(account, months.map((m) => Number(m) || 0), year).ok) onClose();
            }}
          >
            Save budget
          </button>
        </>
      }
    >
      <div className="sx-grid">
        {MONTH_NAMES.map((m, i) => (
          <Field key={m} label={m}>
            <input className="form-control" type="number" min="0" value={months[i]} onChange={(e) => setMonths(months.map((x, j) => (j === i ? e.target.value : x)))} />
          </Field>
        ))}
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Fixed assets                                                        */
/* ------------------------------------------------------------------ */

export const AssetsPage: React.FC = () => {
  const { state, runDepreciation, actor } = useFinance();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const nextPeriod = state.periods.find((p) => p.status === 'OPEN' && p.key < periodOf(TODAY) && !state.depreciationRuns.some((r) => r.period === p.key))?.key ?? periodOf(TODAY);
  const preview = depreciationFor(state, nextPeriod);
  const runDone = state.depreciationRuns.some((r) => r.period === nextPeriod);

  const rows = state.assets.map((a) => {
    const acc = accumulatedDepreciation(state, a);
    return { a, acc, nbv: round2(a.cost - acc), monthly: monthlyCharge(a) };
  });
  type Row = (typeof rows)[number];
  const cost = round2(rows.reduce((s, r) => s + r.a.cost, 0));
  const nbv = round2(rows.reduce((s, r) => s + r.nbv, 0));

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Asset',
      render: (r) => (
        <div className="sx-cell-main">
          <span>{r.a.name}</span>
          <small>
            {r.a.number} · {r.a.category}
          </small>
        </div>
      ),
      sort: (r) => r.a.name
    },
    { key: 'acquired', header: 'Acquired', render: (r) => fmtDate(r.a.acquired), sort: (r) => r.a.acquired, hideOnMobile: true },
    { key: 'cost', header: 'Cost', render: (r) => kes(r.a.cost, { compact: true }), sort: (r) => r.a.cost, align: 'right' },
    { key: 'acc', header: 'Depreciated', render: (r) => kes(r.acc, { compact: true }), sort: (r) => r.acc, align: 'right', hideOnMobile: true },
    { key: 'nbv', header: 'Book value', render: (r) => <b>{kes(r.nbv, { compact: true })}</b>, sort: (r) => r.nbv, align: 'right' },
    {
      key: 'life',
      header: 'Life used',
      render: (r) => {
        const used = (r.a.cost - r.a.residual) > 0 ? r.acc / (r.a.cost - r.a.residual) : 1;
        return (
          <div className="sx-meter-cell">
            <Meter value={used} tone={used > 0.85 ? 'gold' : 'green'} />
            <small>{Math.round(used * 100)}%</small>
          </div>
        );
      },
      width: 140,
      hideOnMobile: true
    }
  ];
  const open = rows.find((r) => r.a.id === openId);

  return (
    <SuitePage
      eyebrow="Assets"
      title="Fixed asset register"
      subtitle="Assets at cost, depreciation to date and book value. Monthly depreciation posts one journal for every asset."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> Add asset
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Assets" value={rows.length} detail={`${new Set(rows.map((r) => r.a.category)).size} categories`} icon={<Building2 size={17} />} />
        <Stat label="Cost" value={kes(cost, { compact: true })} icon={<Building2 size={17} />} tone="blue" />
        <Stat label="Book value" value={kes(nbv, { compact: true })} detail={`${Math.round((nbv / cost) * 100)}% of cost`} icon={<Building2 size={17} />} tone="violet" />
        <Stat label="Monthly depreciation" value={kes(preview.total, { compact: true })} detail={`${state.depreciationRuns.length} runs posted this year`} icon={<CalendarCheck size={17} />} tone="gold" />
      </div>

      <div className={`sx-callout ${runDone ? 'success' : 'info'} sx-run`}>
        {runDone ? <CheckCircle2 size={18} /> : <Play size={18} />}
        <div>
          <b>
            {runDone ? `Depreciation for ${periodLabel(nextPeriod, true)} is posted` : `Depreciation for ${periodLabel(nextPeriod, true)} has not been run`}
          </b>
          <span>
            {runDone
              ? 'The next run becomes available at the end of the month.'
              : `${Object.keys(preview.perAsset).length} assets · ${kes(preview.total)} · Dr Depreciation, Cr Accumulated depreciation`}
          </span>
        </div>
        {!runDone && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => runDepreciation(nextPeriod)} disabled={actor.role === 'ACCOUNTANT'} title={actor.role === 'ACCOUNTANT' ? 'Needs a Finance Manager or Director' : undefined}>
            <Play size={14} /> Run depreciation
          </button>
        )}
      </div>

      <DataTable rows={rows} columns={columns} rowKey={(r) => r.a.id} onRowClick={(r) => setOpenId(r.a.id)} selected={openId} />
      {open && <AssetDrawer asset={open.a} onClose={() => setOpenId(null)} />}
      {adding && <AssetEditor onClose={() => setAdding(false)} />}
    </SuitePage>
  );
};

const AssetDrawer: React.FC<{ asset: FixedAsset; onClose: () => void }> = ({ asset, onClose }) => {
  const f = useFinance();
  const { state } = f;
  const { accountLabel } = useLookups();
  const prompt = usePrompt();
  const banks = state.accounts.filter((a) => a.bank).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));
  const live = asset.status !== 'DISPOSED';
  const actions = live && (
    <div className="fx-row-actions" data-testid="asset-actions">
      <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Dispose of ${asset.name}`, subtitle: 'Removes cost and depreciation and posts the gain or loss on disposal.', fields: [{ key: 'date', label: 'Date', type: 'date', initial: TODAY }, { key: 'proceeds', label: 'Sale proceeds', type: 'number', initial: 0 }, { key: 'bank', label: 'Received into', type: 'select', options: banks }, { key: 'reason', label: 'Reason', required: true }], submitLabel: 'Dispose', onSubmit: (v) => f.disposeAsset(asset.id, { date: v.date, proceeds: num(v.proceeds), bankAccount: v.bank, reason: v.reason }) })}>
        Dispose / retire
      </button>
      <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Transfer ${asset.name}`, fields: [{ key: 'location', label: 'New location', initial: asset.location }, { key: 'custodian', label: 'Custodian', initial: asset.custodian }, { key: 'cc', label: 'Cost centre', type: 'select', options: [{ value: '', label: '—' }, ...state.costCenters.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))] }, { key: 'co', label: 'To company', type: 'select', options: [{ value: '', label: 'Same company' }, ...f.fullState.companies.filter((c) => c.id !== state.activeCompany).map((c) => ({ value: c.id, label: c.name }))] }, { key: 'date', label: 'Date', type: 'date', initial: TODAY }], submitLabel: 'Transfer', onSubmit: (v) => f.transferAsset(asset.id, { location: v.location, custodian: v.custodian, costCenter: v.cc || undefined, toCompany: v.co || undefined, date: v.date }) })}>
        Transfer
      </button>
      <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Revalue ${asset.name}`, subtitle: 'Fair value above book value goes to the revaluation reserve; below it is an impairment.', fields: [{ key: 'fv', label: 'Fair value', type: 'number', required: true }, { key: 'date', label: 'Date', type: 'date', initial: TODAY }, { key: 'reason', label: 'Valuer / reason', required: true }], submitLabel: 'Revalue', onSubmit: (v) => f.revalueAsset(asset.id, num(v.fv), v.date, v.reason) })}>
        Revalue / impair
      </button>
      <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Depreciation method for ${asset.name}`, fields: [{ key: 'm', label: 'Method', type: 'select', options: [{ value: 'SL', label: 'Straight line' }, { value: 'RB', label: 'Reducing balance' }], initial: asset.method ?? 'SL' }, { key: 'rate', label: 'Reducing balance rate % per year', type: 'number', initial: asset.rbRate ? asset.rbRate * 100 : 25 }, { key: 'fy', label: 'Fiscal year starts in month (1-12)', type: 'number', initial: 1 }], onSubmit: (v) => f.setAssetMethod(asset.id, v.m as 'SL' | 'RB', num(v.rate) / 100, num(v.fy) || undefined) })}>
        Depreciation method
      </button>
      {prompt.node}
    </div>
  );
  const acc = accumulatedDepreciation(state, asset);
  const runs = state.depreciationRuns.filter((r) => r.perAsset[asset.id]);
  const remainingMonths = Math.ceil((asset.cost - asset.residual - acc) / monthlyCharge(asset));
  return (
    <Drawer title={asset.name} subtitle={`${asset.number} · ${asset.category}`} badge={<Pill status={asset.status} />} onClose={onClose} wide footer={actions || undefined}>
      <div className="sx-amount-hero">
        <div>
          <span>Book value</span>
          <strong>{kes(round2(asset.cost - acc))}</strong>
        </div>
        <div>
          <span>Fully depreciated in</span>
          <b>{remainingMonths > 0 ? `${remainingMonths} months` : 'Done'}</b>
        </div>
      </div>
      <DefList
        items={[
          ['Cost', kes(asset.cost)],
          ['Residual value', kes(asset.residual)],
          ['Useful life', `${asset.lifeMonths} months (straight line)`],
          ['Monthly charge', kes(monthlyCharge(asset))],
          ['Acquired', fmtDate(asset.acquired)],
          ['Cost account', accountLabel(asset.costAccount)],
          ['Location', asset.location],
          ['Custodian', asset.custodian]
        ]}
      />
      <h4 className="sx-subhead">Depreciation charged</h4>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Period</th>
            <th style={{ textAlign: 'right' }}>Charge</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="sx-muted">Before this year</td>
            <td style={{ textAlign: 'right' }}>{asset.openingDepreciation.toLocaleString()}</td>
          </tr>
          {runs.map((r) => (
            <tr key={r.period}>
              <td>{periodLabel(r.period, true)}</td>
              <td style={{ textAlign: 'right' }}>{r.perAsset[asset.id].toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="sx-total-row">
            <td>Accumulated</td>
            <td style={{ textAlign: 'right' }}>{acc.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          </tr>
        </tfoot>
      </table>
    </Drawer>
  );
};

const CATEGORIES = [
  { name: 'Motor vehicles', account: '1500', life: 60 },
  { name: 'Plant & machinery', account: '1510', life: 120 },
  { name: 'Computers & office equipment', account: '1520', life: 36 }
];

const AssetEditor: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, addAsset } = useFinance();
  const [a, setA] = useState({ name: '', category: CATEGORIES[2].name, costAccount: '1520', acquired: TODAY, cost: 0, residual: 0, lifeMonths: 36, location: '', custodian: '' });
  const [funding, setFunding] = useState('1000');
  const set = (patch: Partial<typeof a>) => setA((x) => ({ ...x, ...patch }));
  return (
    <Modal
      size="lg"
      title="Add a fixed asset"
      subtitle="Capitalising posts Dr asset cost, Cr the account it was paid from"
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">
            Monthly depreciation <b>{a.lifeMonths > 0 ? kes(round2((a.cost - a.residual) / a.lifeMonths)) : '—'}</b>
          </span>
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => addAsset(a, funding).ok && onClose()}>
            Capitalise asset
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Asset name" required span={2}>
          <input className="form-control" value={a.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>
        <Field label="Category" required span={2}>
          <select
            className="form-control"
            value={a.category}
            onChange={(e) => {
              const c = CATEGORIES.find((x) => x.name === e.target.value)!;
              set({ category: c.name, costAccount: c.account, lifeMonths: c.life });
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Cost (KES)" required>
          <input className="form-control" type="number" min="0" value={a.cost || ''} onChange={(e) => set({ cost: Number(e.target.value) })} />
        </Field>
        <Field label="Residual value (KES)">
          <input className="form-control" type="number" min="0" value={a.residual || ''} onChange={(e) => set({ residual: Number(e.target.value) })} />
        </Field>
        <Field label="Useful life (months)" required>
          <input className="form-control" type="number" min="1" value={a.lifeMonths} onChange={(e) => set({ lifeMonths: Number(e.target.value) })} />
        </Field>
        <Field label="Acquired" required>
          <input className="form-control" type="date" value={a.acquired} onChange={(e) => set({ acquired: e.target.value })} />
        </Field>
        <Field label="Location">
          <input className="form-control" value={a.location} onChange={(e) => set({ location: e.target.value })} />
        </Field>
        <Field label="Custodian">
          <input className="form-control" value={a.custodian} onChange={(e) => set({ custodian: e.target.value })} />
        </Field>
        <Field label="Paid from" required span={2}>
          <select className="form-control" value={funding} onChange={(e) => setFunding(e.target.value)}>
            {state.accounts
              .filter((x) => x.bank || x.code === '2200' || x.code === '2500')
              .map((x) => (
                <option key={x.code} value={x.code}>
                  {x.code} · {x.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Period close                                                        */
/* ------------------------------------------------------------------ */

export const ClosePage: React.FC = () => {
  const f = useFinance();
  const { state, actor, autoChecks, toggleCheck, closePeriod, reopenPeriod, setPage } = f;
  const prompt = usePrompt();
  const label = (k: string, long = false) => state.periods.find((p) => p.key === k)?.label ?? periodLabel(k, long);
  const firstOpen = state.periods.find((p) => p.status === 'OPEN')?.key ?? periodOf(TODAY);
  const [key, setKey] = useState(firstOpen);
  const [reason, setReason] = useState('');
  const period = state.periods.find((p) => p.key === key)!;
  const auto = autoChecks(state, key);
  const future = key > periodOf(TODAY);
  const items = CHECKLIST.map((c) => ({
    ...c,
    done: c.auto ? auto[c.key as 'unposted' | 'bank' | 'depreciation'] : !!period.checklist[c.key],
    detail:
      c.key === 'unposted'
        ? auto.openCount
          ? `${auto.openCount} document${auto.openCount === 1 ? '' : 's'} still in approval for this month`
          : 'Nothing left in approval'
        : c.key === 'bank'
          ? auto.unmatchedCount
            ? `${auto.unmatchedCount} statement line${auto.unmatchedCount === 1 ? '' : 's'} not matched`
            : 'All statement lines matched'
          : c.key === 'depreciation'
            ? auto.depreciation
              ? 'Posted'
              : 'Not yet run'
            : ''
  }));
  const doneCount = items.filter((i) => i.done).length;
  const go = (k: string) => setPage(k === 'unposted' ? 'invoices' : k === 'bank' ? 'bank' : 'assets');

  return (
    <SuitePage eyebrow="Close" title="Month-end close" subtitle="Work through the checklist, then lock the month so nothing more can be posted into it.">
      <div className="sx-periods">
        {state.periods.map((p) => (
          <button key={p.key} type="button" className={`${p.key === key ? 'active' : ''} ${p.status === 'CLOSED' ? 'closed' : ''} ${p.key === periodOf(TODAY) ? 'current' : ''}`} onClick={() => setKey(p.key)}>
            {p.status === 'CLOSED' ? <Lock size={12} /> : <Unlock size={12} />}
            <span>{p.special ? `A${p.key.split('-A')[1] ?? ''}` : periodLabel(p.key).split(' ')[0]}</span>
          </button>
        ))}
      </div>

      <div className="sx-split">
        <Panel
          title={label(key, true)}
          subtitle={period.status === 'SOFT' ? `Soft-closed by ${period.closedBy}: sub-ledgers locked, managers can still post journals` : period.status === 'CLOSED' ? `Closed by ${period.closedBy} on ${fmtDate(period.closedAt!.slice(0, 10))}` : future ? 'This month has not started' : `${doneCount} of ${items.length} steps complete`}
          action={<Pill status={period.status} />}
        >
          {period.status === 'OPEN' && !future && (
            <div className="sx-progress">
              <i style={{ width: `${(doneCount / items.length) * 100}%` }} />
            </div>
          )}
          <ul className="sx-checklist">
            {items.map((i) => (
              <li key={i.key} className={i.done ? 'done' : ''}>
                {i.auto || period.status === 'CLOSED' ? (
                  <span className="sx-check-icon">{i.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}</span>
                ) : (
                  <button type="button" className="sx-check-icon" onClick={() => toggleCheck(key, i.key)} aria-label={`Mark ${i.label}`}>
                    {i.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </button>
                )}
                <div>
                  <b>{i.label}</b>
                  <small>{i.auto ? `Checked automatically · ${i.detail}` : i.done ? 'Confirmed' : 'Tick when done'}</small>
                </div>
                {i.auto && !i.done && period.status === 'OPEN' && (
                  <button type="button" className="sx-link" onClick={() => go(i.key)}>
                    Fix
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={period.status === 'CLOSED' ? 'Reopen the period' : 'Close the period'} subtitle={period.status === 'CLOSED' ? 'Only the Finance Director can reopen a month' : 'Managers and the Director can close a month'}>
          {period.status !== 'CLOSED' ? (
            <>
              <p className="sx-note">Closing locks {label(key, true)}: approved documents dated in it can no longer be posted, and reports for the month stop changing. A soft close locks invoices, bills and payments but still lets managers post adjusting journals.</p>
              <div className="sx-actions">
                {period.status === 'OPEN' && (
                  <button type="button" className="btn btn-secondary" disabled={future || actor.role === 'ACCOUNTANT'} onClick={() => closePeriod(key, 'SOFT')}>
                    Soft close
                  </button>
                )}
                <button type="button" className="btn btn-primary" disabled={future || actor.role === 'ACCOUNTANT'} onClick={() => closePeriod(key)}>
                  <Lock size={15} /> Close {label(key, true)}
                </button>
              </div>
              {actor.role === 'ACCOUNTANT' && <p className="sx-note">Switch to the Finance Manager or Director to close.</p>}
            </>
          ) : (
            <>
              <Field label="Reason for reopening" span={4}>
                <textarea className="form-control" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Late supplier invoice for audit adjustment" />
              </Field>
              <button
                type="button"
                className="btn btn-danger sx-mt"
                disabled={actor.role !== 'DIRECTOR'}
                onClick={() => {
                  if (reopenPeriod(key, reason).ok) setReason('');
                }}
              >
                <Unlock size={15} /> Reopen {periodLabel(key, true)}
              </button>
              {actor.role !== 'DIRECTOR' && (
                <button type="button" className="btn btn-secondary sx-mt" onClick={() => (f.requestReopen(key, reason).ok ? setReason('') : undefined)}>
                  Request reopening
                </button>
              )}
            </>
          )}
          {(period.reopenRequests ?? []).length > 0 && (
            <>
              <h4 className="sx-subhead">Reopen requests</h4>
              <ul className="fx-list">
                {period.reopenRequests!.map((r) => (
                  <li key={r.id}>
                    {r.by}, {fmtDate(r.at.slice(0, 10))}: {r.reason} · <b>{r.status}</b>
                    {r.status === 'PENDING' && actor.role === 'DIRECTOR' && (
                      <span className="fx-row-actions">
                        {' '}
                        <button type="button" className="sx-link" onClick={() => f.decideReopen(key, r.id, true)}>
                          Approve
                        </button>
                        <button type="button" className="sx-link" onClick={() => f.decideReopen(key, r.id, false, 'Declined')}>
                          Decline
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          <h4 className="sx-subhead">Close owner</h4>
          <p className="sx-note">
            {period.owner ? `${period.owner}, due ${fmtDate(period.due ?? '')}` : 'No owner assigned.'}{' '}
            <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Close owner for ${label(key, true)}`, fields: [{ key: 'owner', label: 'Owner', initial: period.owner ?? actor.name, required: true }, { key: 'due', label: 'Due', type: 'date', initial: period.due ?? TODAY }], onSubmit: (v) => f.setPeriodOwner(key, v.owner, v.due) })}>
              Assign
            </button>
          </p>
        </Panel>
      </div>

      <div className="sx-grid sx-grid-2">
        <Panel
          title="Close cockpit"
          subtitle="Every period with its status, owner and due date"
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => f.runDueReversals()}>
              Run due reversals
            </button>
          }
        >
          <table className="fx-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {state.periods.map((p) => (
                <tr key={p.key}>
                  <td>{p.label ?? periodLabel(p.key)}</td>
                  <td>
                    <Pill status={p.status} />
                  </td>
                  <td>{p.owner ?? '—'}</td>
                  <td className={p.due && p.due < TODAY && p.status === 'OPEN' ? 'sx-danger-text' : ''}>{p.due ? fmtDate(p.due) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel
          title="Fiscal calendar"
          subtitle="Fiscal years with monthly, 4-4-5 or 13-period patterns and adjustment periods; year-end closes income and expense to retained earnings"
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => prompt.open({ title: 'New fiscal year', fields: [{ key: 'start', label: 'First day', type: 'date', required: true }, { key: 'pattern', label: 'Pattern', type: 'select', options: [{ value: 'MONTHLY', label: '12 calendar months' }, { value: '4-4-5', label: '4-4-5 weeks' }, { value: '13', label: '13 four-week periods' }] }, { key: 'special', label: 'Adjustment periods (0-4)', type: 'number', initial: 1 }, { key: 'name', label: 'Name' }], submitLabel: 'Create', onSubmit: (v) => f.createFiscalYear({ start: v.start, pattern: v.pattern as 'MONTHLY' | '4-4-5' | '13', specialPeriods: num(v.special), name: v.name || undefined }) })}>
              <Plus size={14} /> Fiscal year
            </button>
          }
        >
          {state.fiscalYears.length ? (
            <table className="fx-table">
              <tbody>
                {state.fiscalYears.map((y) => (
                  <tr key={y.id}>
                    <td>{y.name}</td>
                    <td>
                      {fmtDate(y.start)} – {fmtDate(y.end)}
                    </td>
                    <td>{y.pattern}</td>
                    <td>
                      <Pill status={y.status} />
                    </td>
                    <td>
                      {y.status === 'OPEN' && (
                        <button type="button" className="sx-link" onClick={() => f.yearEnd(y.id)}>
                          Year-end close
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sx-muted">Calendar months; no fiscal years defined.</p>
          )}
        </Panel>
      </div>
      {prompt.node}
    </SuitePage>
  );
};
