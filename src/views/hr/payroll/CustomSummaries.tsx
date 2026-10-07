import React, { useMemo, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { ReportPaper, type Report } from './ReportPaper';
import { PeriodSelect, useCompanyName } from './shared';
import { DIMENSIONS, dimension, group, MEASURES, measure, periodOf, recentPeriods, rowsFor, type Period, type Row } from './reports';

export interface SummaryTemplate {
  id: string;
  name: string;
  rowsBy: string;
  mode: 'measures' | 'trend';
  measures: string[];
  trendMeasure: string;
  months: number;
  scope: 'company' | 'group';
  payType: 'all' | 'salaried' | 'casual';
  departments: string[];
  sortBy: string;
  showEmployees: boolean;
  builtIn?: boolean;
}

const PRESETS: SummaryTemplate[] = [
  { id: 'p1', name: 'Staff cost by department (quarter)', rowsBy: 'department', mode: 'measures', measures: ['headcount', 'gross', 'nssfEr', 'ahlEr', 'nita', 'cost'], trendMeasure: 'gross', months: 3, scope: 'company', payType: 'all', departments: [], sortBy: 'cost', showEmployees: false, builtIn: true },
  { id: 'p2', name: 'Daily-rated wages by site', rowsBy: 'branch', mode: 'measures', measures: ['headcount', 'basic', 'gross', 'shif', 'net'], trendMeasure: 'gross', months: 1, scope: 'group', payType: 'casual', departments: [], sortBy: 'gross', showEmployees: false, builtIn: true },
  { id: 'p3', name: 'Statutory by contract type', rowsBy: 'contract', mode: 'measures', measures: ['headcount', 'paye', 'nssfEe', 'nssfEr', 'shif', 'ahlEe', 'ahlEr', 'nita'], trendMeasure: 'paye', months: 1, scope: 'company', payType: 'all', departments: [], sortBy: 'paye', showEmployees: false, builtIn: true },
  { id: 'p4', name: 'Gross pay trend by department (6 months)', rowsBy: 'department', mode: 'trend', measures: [], trendMeasure: 'gross', months: 6, scope: 'company', payType: 'all', departments: [], sortBy: 'gross', showEmployees: false, builtIn: true },
  { id: 'p5', name: 'Pay bands — who earns what', rowsBy: 'band', mode: 'measures', measures: ['headcount', 'gross', 'paye', 'net'], trendMeasure: 'gross', months: 1, scope: 'company', payType: 'salaried', departments: [], sortBy: 'gross', showEmployees: true, builtIn: true },
  { id: 'p6', name: 'Variable pay by employee (YTD)', rowsBy: 'employee', mode: 'measures', measures: ['variable', 'overtime', 'bik', 'gross'], trendMeasure: 'variable', months: 10, scope: 'company', payType: 'salaried', departments: [], sortBy: 'variable', showEmployees: false, builtIn: true }
];

const STORE = 'ieui.payroll.customSummaries';
const loadSaved = (): SummaryTemplate[] => {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as SummaryTemplate[]) : [];
  } catch {
    return [];
  }
};
const persist = (list: SummaryTemplate[]) => {
  try {
    localStorage.setItem(STORE, JSON.stringify(list));
  } catch {
    /* storage unavailable — templates last for this session */
  }
};

export const CustomSummaries: React.FC = () => {
  const { hrEmployees, selectedOrgId, payrollOpenPeriod, payrollCtx, tenantOrganizations, addToast } = useApp();
  const companyName = useCompanyName();
  const periods = recentPeriods(payrollOpenPeriod, 12);
  const [saved, setSaved] = useState<SummaryTemplate[]>(loadSaved);
  const [t, setT] = useState<SummaryTemplate>(PRESETS[0]);
  const [endKey, setEndKey] = useState(payrollOpenPeriod.key);
  const set = (patch: Partial<SummaryTemplate>) => setT((x) => ({ ...x, ...patch }));
  const end = periods.find((p) => p.key === endKey) ?? periods[0];

  const orgKey = (t.scope === 'company' ? [selectedOrgId] : tenantOrganizations.map((o) => o.id).filter((id) => hrEmployees.some((e) => e.orgId === id))).join(',');
  const byMonth = useMemo(
    () =>
      Array.from({ length: t.months }, (_, i) => periodOf(end.year, end.month - (t.months - 1 - i))).map((p) => ({ p, rows: rowsFor(hrEmployees, orgKey.split(','), p, payrollCtx) })),
    [hrEmployees, orgKey, payrollCtx, end.year, end.month, t.months]
  );
  const months: Period[] = byMonth.map((m) => m.p);
  const allDepts = [...new Set(byMonth.flatMap((m) => m.rows.map((r) => r.e.department)))].sort();
  const keep = (r: Row) => (t.payType === 'all' || (t.payType === 'casual') === r.p.casual) && (!t.departments.length || t.departments.includes(r.e.department));
  const filtered = byMonth.map((m) => ({ p: m.p, rows: m.rows.filter(keep) }));
  const dim = dimension(t.rowsBy);
  const n = months.length;

  let report: Report;
  const rangeLabel = n === 1 ? end.label : `${months[0].label} – ${end.label} (${n} months)`;
  const scopeLabel = t.scope === 'company' ? companyName(selectedOrgId) : `all ${orgKey.split(',').length} companies`;
  const filterNote = [t.payType !== 'all' ? (t.payType === 'casual' ? 'daily-rated only' : 'salaried only') : '', t.departments.length ? `departments: ${t.departments.join(', ')}` : ''].filter(Boolean).join(' · ');

  if (t.mode === 'measures') {
    const ms = (t.measures.length ? t.measures : ['gross']).map(measure);
    const flat = filtered.flatMap((m) => m.rows);
    // Headcount over several months is shown as the monthly average
    const adj = (key: string, v: number) => (key === 'headcount' && n > 1 ? Math.round((v / n) * 10) / 10 : v);
    const groups = group(flat, dim, ms, companyName).sort((a, b) => (b.values[t.sortBy] ?? 0) - (a.values[t.sortBy] ?? 0) || a.key.localeCompare(b.key));
    const tot = Object.fromEntries(ms.map((m) => [m.key, flat.reduce((s, r) => s + m.get(r), 0)]));
    const rows: (string | number)[][] = [];
    for (const g of groups) {
      rows.push([g.key, ...ms.map((m) => adj(m.key, g.values[m.key]))]);
      if (t.showEmployees && t.rowsBy !== 'employee') {
        const people = new Map<string, Row[]>();
        g.rows.forEach((r) => people.set(r.e.staffId, [...(people.get(r.e.staffId) ?? []), r]));
        [...people.values()].forEach((rs) => rows.push([`    ${rs[0].e.fullName}`, ...ms.map((m) => adj(m.key, rs.reduce((s, r) => s + m.get(r), 0)))]));
      }
    }
    report = {
      title: t.name,
      subtitle: `${rangeLabel} · ${scopeLabel}`,
      sections: [
        {
          columns: [{ label: dim.label }, ...ms.map((m) => ({ label: m.key === 'headcount' && n > 1 ? 'Headcount (avg)' : m.label, num: true }))],
          rows,
          foot: ['Total', ...ms.map((m) => adj(m.key, tot[m.key]))],
          note: filterNote ? `Filtered: ${filterNote}.` : undefined
        }
      ]
    };
  } else {
    const m = measure(t.trendMeasure);
    const keys = new Set<string>();
    const cells = filtered.map((f) => {
      const g = group(f.rows, dim, [m], companyName);
      g.forEach((x) => keys.add(x.key));
      return Object.fromEntries(g.map((x) => [x.key, x.values[m.key]]));
    });
    const list = [...keys].map((k) => ({ k, vals: cells.map((c) => c[k] ?? 0) })).sort((a, b) => b.vals[b.vals.length - 1] - a.vals[a.vals.length - 1]);
    report = {
      title: t.name,
      subtitle: `${m.label} by month · ${rangeLabel} · ${scopeLabel}`,
      sections: [
        {
          columns: [{ label: dim.label }, ...months.map((p) => ({ label: p.label.slice(0, 3) + ' ' + String(p.year).slice(2), num: true })), { label: 'Change', num: true }],
          rows: list.map((x) => [x.k, ...x.vals, x.vals[x.vals.length - 1] - x.vals[0]]),
          foot: ['Total', ...cells.map((c) => Object.values(c).reduce((s, v) => s + v, 0)), Object.values(cells[cells.length - 1] ?? {}).reduce((s, v) => s + v, 0) - Object.values(cells[0] ?? {}).reduce((s, v) => s + v, 0)],
          note: filterNote ? `Filtered: ${filterNote}.` : undefined
        }
      ]
    };
  }

  const saveAs = (asNew: boolean) => {
    const name = t.name.trim() || 'My summary';
    const item = { ...t, name, builtIn: false, id: asNew || t.builtIn ? `c${Date.now().toString(36)}` : t.id };
    const next = asNew || t.builtIn ? [...saved, item] : saved.map((x) => (x.id === t.id ? item : x));
    setSaved(next);
    persist(next);
    setT(item);
    addToast({ type: 'success', title: 'Summary saved', message: `“${name}” is in your saved summaries.` });
  };
  const remove = () => {
    const next = saved.filter((x) => x.id !== t.id);
    setSaved(next);
    persist(next);
    setT(PRESETS[0]);
  };
  const groups = ['Count', 'Pay', 'Statutory', 'Deductions', 'Employer'] as const;

  return (
    <div className="pr-builder">
      <div className="pr-builder-panel pr-card" style={{ marginBottom: 0 }}>
        <div>
          <h4>Start from</h4>
          <div className="pr-saved">
            {[...PRESETS, ...saved].map((x) => (
              <button key={x.id} className={x.id === t.id ? 'active' : ''} onClick={() => setT(x)} title={x.builtIn ? 'Built-in' : 'Saved by you'}>
                {x.builtIn ? '' : '★ '}
                {x.name}
              </button>
            ))}
          </div>
        </div>
        <label className="req-field">
          <span>Title</span>
          <input className="form-control" value={t.name} onChange={(ev) => set({ name: ev.target.value })} />
        </label>
        <div className="pr-form-grid">
          <label className="req-field">
            <span>Rows by</span>
            <select className="form-control" value={t.rowsBy} onChange={(ev) => set({ rowsBy: ev.target.value })}>
              {DIMENSIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="req-field">
            <span>Columns</span>
            <select className="form-control" value={t.mode} onChange={(ev) => set({ mode: ev.target.value as SummaryTemplate['mode'] })}>
              <option value="measures">Chosen figures</option>
              <option value="trend">One figure by month</option>
            </select>
          </label>
          <label className="req-field">
            <span>Up to</span>
            <PeriodSelect value={end.key} periods={periods} onChange={(p) => setEndKey(p.key)} />
          </label>
          <label className="req-field">
            <span>Months</span>
            <select className="form-control" value={t.months} onChange={(ev) => set({ months: Number(ev.target.value) })}>
              {[1, 2, 3, 6, 9, 10, 12].map((m) => (
                <option key={m} value={m}>
                  {m === 1 ? 'Just this month' : `${m} months`}
                </option>
              ))}
            </select>
          </label>
          <label className="req-field">
            <span>Companies</span>
            <select className="form-control" value={t.scope} onChange={(ev) => set({ scope: ev.target.value as SummaryTemplate['scope'] })}>
              <option value="company">This company</option>
              <option value="group">All companies</option>
            </select>
          </label>
          <label className="req-field">
            <span>Employees</span>
            <select className="form-control" value={t.payType} onChange={(ev) => set({ payType: ev.target.value as SummaryTemplate['payType'] })}>
              <option value="all">Everyone</option>
              <option value="salaried">Salaried only</option>
              <option value="casual">Daily-rated only</option>
            </select>
          </label>
        </div>
        {t.mode === 'measures' ? (
          <div>
            <h4>Figures</h4>
            <div className="pr-measures">
              {groups.map((g) => (
                <React.Fragment key={g}>
                  <em>{g}</em>
                  {MEASURES.filter((m) => m.group === g).map((m) => (
                    <label key={m.key}>
                      <input
                        type="checkbox"
                        checked={t.measures.includes(m.key)}
                        onChange={(ev) => set({ measures: ev.target.checked ? [...t.measures, m.key] : t.measures.filter((x) => x !== m.key) })}
                      />
                      {m.label}
                    </label>
                  ))}
                </React.Fragment>
              ))}
            </div>
            <label className="req-field" style={{ marginTop: 8 }}>
              <span>Sort by</span>
              <select className="form-control" value={t.sortBy} onChange={(ev) => set({ sortBy: ev.target.value })}>
                {(t.measures.length ? t.measures : ['gross']).map((k) => (
                  <option key={k} value={k}>
                    {measure(k).label}
                  </option>
                ))}
              </select>
            </label>
            {t.rowsBy !== 'employee' && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginTop: 8 }}>
                <input type="checkbox" checked={t.showEmployees} onChange={(ev) => set({ showEmployees: ev.target.checked })} /> List employees under each row
              </label>
            )}
          </div>
        ) : (
          <label className="req-field">
            <span>Figure</span>
            <select className="form-control" value={t.trendMeasure} onChange={(ev) => set({ trendMeasure: ev.target.value })}>
              {MEASURES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div>
          <h4>Departments</h4>
          <div className="pr-measures" style={{ maxHeight: 150 }}>
            {allDepts.map((d) => (
              <label key={d}>
                <input type="checkbox" checked={t.departments.includes(d)} onChange={(ev) => set({ departments: ev.target.checked ? [...t.departments, d] : t.departments.filter((x) => x !== d) })} />
                {d}
              </label>
            ))}
          </div>
          <div className="pr-muted">None ticked = all departments</div>
        </div>
        <div className="pr-toolbar">
          <button className="btn btn-primary" onClick={() => saveAs(false)}>
            <Save size={14} /> {t.builtIn ? 'Save as mine' : 'Save'}
          </button>
          {!t.builtIn && (
            <>
              <button className="btn btn-secondary" onClick={() => saveAs(true)}>
                Save copy
              </button>
              <button className="btn btn-secondary" onClick={remove} aria-label="Delete saved summary">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>
      <div>
        <ReportPaper report={report} company={t.scope === 'company' ? companyName(selectedOrgId) : 'All companies'} />
      </div>
    </div>
  );
};
