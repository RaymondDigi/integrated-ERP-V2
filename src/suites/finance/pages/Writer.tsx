import React, { useMemo, useState } from 'react';
import { Plus, Pin, PinOff, Play, Trash2, Save, Copy } from 'lucide-react';
import { useFinance } from '../store';
import { kes, round2, TODAY } from '../engine';
import type { ReportDefinition, ReportRow } from '../types';
import { DataTable, Field, Panel, SuitePage } from '../../ui/kit';
import { ExportCsvButton, PrintButton, esc } from '../../../platform/Widgets';
import { runReport } from '../ext/analytics';

const blank = (owner: string): ReportDefinition => ({
  id: '',
  name: 'New management report',
  rows: [
    { id: 'r1', label: 'Revenue', kind: 'LINE', accounts: 'type:INCOME', negate: true },
    { id: 'r2', label: 'Costs', kind: 'LINE', accounts: 'type:EXPENSE' },
    { id: 'r3', label: 'Result', kind: 'SUBTOTAL', formula: 'r1,-r2' }
  ],
  columns: ['ACTUAL', 'BUDGET', 'VARIANCE'],
  groupBy: 'NONE',
  pinned: false,
  owner
});

const COLS: ReportDefinition['columns'][number][] = ['ACTUAL', 'PRIOR_YEAR', 'BUDGET', 'VARIANCE'];
const COL_LABEL = { ACTUAL: 'Actual', PRIOR_YEAR: 'Last year', BUDGET: 'Budget', VARIANCE: 'Variance to budget' };

/** Reports › Report writer: user-defined rows (account segments, groups, subtotals), columns and grouping; pinned to the overview. */
export const WriterPage: React.FC = () => {
  const f = useFinance();
  const { state, fullState } = f;
  const [sel, setSel] = useState<string>(state.reportDefs[0]?.id ?? '');
  const [draft, setDraft] = useState<ReportDefinition>(() => state.reportDefs[0] ?? blank(f.actor.name));
  const [from, setFrom] = useState(`${TODAY.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(TODAY);
  const result = useMemo(() => runReport(fullState, state, draft, from, to), [fullState, state, draft, from, to]);
  const pick = (id: string) => {
    setSel(id);
    const d = state.reportDefs.find((x) => x.id === id);
    if (d) setDraft(d);
  };
  const setRow = (i: number, p: Partial<ReportRow>) => setDraft({ ...draft, rows: draft.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const value = (g: (typeof result)[number], col: ReportDefinition['columns'][number], id: string) => {
    if (col === 'ACTUAL') return g.actual.get(id);
    if (col === 'PRIOR_YEAR') return g.prior.get(id);
    if (col === 'BUDGET') return g.budget.get(id);
    const a = g.actual.get(id);
    const b = g.budget.get(id);
    return a === undefined || b === undefined || !g.budget.size ? undefined : round2(a - b);
  };
  const header = ['Line', ...result.flatMap((g) => draft.columns.map((c) => (result.length > 1 ? `${g.label} ${COL_LABEL[c]}` : COL_LABEL[c])))];
  const rows = draft.rows.map((r) => [r.label, ...result.flatMap((g) => draft.columns.map((c) => (r.kind === 'HEADING' ? '' : value(g, c, r.id) ?? '')))]);
  const save = () => {
    const r = f.saveReportDef(draft);
    if (r.ok && r.id) {
      setSel(r.id);
      setDraft({ ...draft, id: r.id });
    }
  };

  return (
    <SuitePage
      eyebrow="Reports"
      title="Report writer"
      subtitle="Build management accounts from account ranges, groups and types with your own subtotals; compare with budget and last year; group by company, cost centre, department or plant."
      actions={
        <>
          <select className="form-control fx-inline-select" value={sel} onChange={(e) => pick(e.target.value)} aria-label="Saved reports">
            {state.reportDefs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.pinned ? '(pinned) ' : ''}
                {d.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => (setSel(''), setDraft(blank(f.actor.name)))}>
            <Plus size={14} /> New
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => (setSel(''), setDraft({ ...draft, id: '', name: `${draft.name} (copy)` }))}>
            <Copy size={14} /> Copy
          </button>
        </>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Panel
          title="Definition"
          action={
            <div className="sx-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft({ ...draft, pinned: !draft.pinned })}>
                {draft.pinned ? <PinOff size={14} /> : <Pin size={14} />} {draft.pinned ? 'Unpin' : 'Pin to overview'}
              </button>
              {draft.id && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => f.deleteReportDef(draft.id).ok && (setSel(''), setDraft(blank(f.actor.name)))}>
                  <Trash2 size={14} />
                </button>
              )}
              <button type="button" className="btn btn-primary btn-sm" onClick={save}>
                <Save size={14} /> Save
              </button>
            </div>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="Report name" span={2}>
              <input className="form-control" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Group by">
              <select className="form-control" value={draft.groupBy} onChange={(e) => setDraft({ ...draft, groupBy: e.target.value as ReportDefinition['groupBy'] })}>
                <option value="NONE">Nothing (one column set)</option>
                <option value="COMPANY">Company</option>
                <option value="COST_CENTER">Cost / profit centre</option>
                <option value="DEPARTMENT">Department / division</option>
                <option value="PLANT">Plant</option>
              </select>
            </Field>
            <Field label="Columns">
              <div className="fx-checks">
                {COLS.map((c) => (
                  <label key={c}>
                    <input type="checkbox" checked={draft.columns.includes(c)} onChange={(e) => setDraft({ ...draft, columns: e.target.checked ? COLS.filter((x) => x === c || draft.columns.includes(x)) : draft.columns.filter((x) => x !== c) })} /> {COL_LABEL[c]}
                  </label>
                ))}
              </div>
            </Field>
          </div>
          <table className="fx-table">
            <thead>
              <tr>
                <th>Id</th>
                <th>Label</th>
                <th>Kind</th>
                <th>Accounts or formula</th>
                <th>±</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {draft.rows.map((r, i) => (
                <tr key={i}>
                  <td className="sx-mono">{r.id}</td>
                  <td>
                    <input className="form-control" value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} aria-label="Row label" />
                  </td>
                  <td>
                    <select className="form-control" value={r.kind} onChange={(e) => setRow(i, { kind: e.target.value as ReportRow['kind'] })} aria-label="Row kind">
                      <option value="LINE">Accounts</option>
                      <option value="SUBTOTAL">Subtotal</option>
                      <option value="HEADING">Heading</option>
                    </select>
                  </td>
                  <td>
                    {r.kind === 'LINE' ? (
                      <input className="form-control" value={r.accounts ?? ''} onChange={(e) => setRow(i, { accounts: e.target.value })} placeholder="4000-4999, group:Revenue, type:EXPENSE" aria-label="Accounts" />
                    ) : r.kind === 'SUBTOTAL' ? (
                      <input className="form-control" value={r.formula ?? ''} onChange={(e) => setRow(i, { formula: e.target.value })} placeholder="r1,-r2" aria-label="Formula" />
                    ) : null}
                  </td>
                  <td>{r.kind === 'LINE' && <input type="checkbox" checked={!!r.negate} onChange={(e) => setRow(i, { negate: e.target.checked })} aria-label="Show credits as positive" />}</td>
                  <td>
                    <button type="button" className="sx-icon-btn" onClick={() => setDraft({ ...draft, rows: draft.rows.filter((_, j) => j !== i) })} aria-label="Remove row">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="sx-link" onClick={() => setDraft({ ...draft, rows: [...draft.rows, { id: `r${Math.max(0, ...draft.rows.map((r) => Number(r.id.slice(1)) || 0)) + 1}`, label: 'New line', kind: 'LINE', accounts: '' }] })}>
            <Plus size={13} /> Add row
          </button>
          <p className="sx-note">Account selection: ranges (6000-6999), lists (6100,6200), groups (group:Staff costs) or types (type:INCOME). Tick ± to show credit balances as positive.</p>
        </Panel>
        <Panel
          title={<><Play size={14} /> {draft.name}</>}
          action={
            <div className="sx-actions">
              <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
              <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
              <ExportCsvButton name={draft.name} header={header} rows={() => rows} label="Excel" />
              <PrintButton title={draft.name} html={() => `<h1>${esc(draft.name)}</h1><p>${esc(from)} – ${esc(to)}</p><table><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map((r, i) => `<tr>${r.map((c) => `<td${typeof c === 'number' ? ' class="r"' : ''}>${draft.rows[i].kind !== 'LINE' ? '<b>' : ''}${esc(typeof c === 'number' ? c.toLocaleString() : c)}</td>`).join('')}</tr>`).join('')}</table>`} />
            </div>
          }
          flush
        >
          <DataTable
            rows={rows.map((r, i) => ({ r, i }))}
            rowKey={(x) => String(x.i)}
            pageSize={40}
            columns={header.map((h, ci) => ({
              key: String(ci),
              header: h,
              render: (x: { r: (string | number)[]; i: number }) => {
                const v = x.r[ci];
                const strong = draft.rows[x.i]?.kind !== 'LINE';
                const text = typeof v === 'number' ? kes(v) : v;
                return strong ? <b>{text}</b> : text;
              },
              align: ci ? ('right' as const) : undefined
            }))}
          />
        </Panel>
      </div>
    </SuitePage>
  );
};
