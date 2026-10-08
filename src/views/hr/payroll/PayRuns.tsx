import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange, CheckCircle2, FileText, Play, RotateCcw, Send } from 'lucide-react';
import { useApp, weighFor } from '../../../context/AppContext';
import { PAY_RUN_LABEL, addDays, isoOf, payRunClash, payRunRows, payRunTotals, payRunWindowError, siteOf, windowDays, type PayRunKind, type PayRunRow, type PayRunRequest } from '../../../data/payRuns';
import { CASUAL_DAYS, DEFAULT_CASUAL_TERMS, casualBasis, casualRows, deductionsDue, leafKg, pluckersInWindow, weighKey, type CasualRow, type CasualTerms } from '../../../data/casualPayroll';
import type { PayrollBatch } from '../../../types';
import { ReportPaper, type Report } from './ReportPaper';
import { kes, payRail } from './reports';
import { useCompanyName } from './shared';
import { Pager, usePaged } from '../../../components/common/Pager';

const KINDS: { id: PayRunKind; label: string }[] = [
  { id: 'DAILY', label: 'Daily (one day)' },
  { id: 'WEEKLY', label: 'Weekly (seven days)' },
  { id: 'CUSTOM', label: 'Custom date range' },
  { id: 'CASUAL', label: 'Casual, per kg (farmers)' }
];
const STATUS_LABEL: Record<PayrollBatch['status'], string> = { DRAFT: 'Draft', CALCULATED: 'Calculated', AUDIT_APPROVED: 'Approved', DISBURSED_MPESA: 'Paid (M-Pesa)', POSTED_GL: 'Posted' };
const TERM_FIELDS: { key: keyof CasualTerms; label: string; hint: string }[] = [
  { key: 'ratePerKg', label: 'Rate per kg (KES)', hint: 'Paid for each kilo of green leaf' },
  { key: 'minimumDailyWage', label: 'Minimum daily wage (KES)', hint: 'Top-up when a worked day falls short' },
  { key: 'targetKgPerDay', label: 'Target kg per day', hint: 'Kilos above this earn the bonus' },
  { key: 'bonusPerKgAbove', label: 'Bonus per kg above target (KES)', hint: 'Extra per kilo beyond the target' }
];

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const lastMonday = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoOf(d);
};
/** The end date a frequency implies: a day ends on its start, a week runs six days on, a casual run a fortnight, a custom run keeps its own end */
const endFor = (k: PayRunKind, start: string, end: string) =>
  k === 'DAILY' ? start : k === 'WEEKLY' ? addDays(start, 6) : k === 'CASUAL' ? addDays(start, CASUAL_DAYS - 1) : end;
const isCasualBatch = (b: PayrollBatch) => b.pipeline === 'Casual Payroll';
const dayLabel = (iso: string) => dateOfIso(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
const dateOfIso = (iso: string) => new Date(`${iso}T00:00:00`);

/** Kilos per plucker per day as weighed at the collection centre. Blank days use the stand-in; Sundays are not weighed. */
const WeighingSheet: React.FC<{ from: string; to: string; branch: string }> = ({ from, to, branch }) => {
  const { hrEmployees, selectedOrgId, weighLog, setWeight } = useApp();
  const days = useMemo(
    () => Array.from({ length: windowDays(from, to) }, (_, i) => addDays(from, i)).filter((iso) => dateOfIso(iso).getDay() !== 0),
    [from, to]
  );
  const people = useMemo(() => pluckersInWindow(hrEmployees, selectedOrgId, from, to, branch), [hrEmployees, selectedOrgId, from, to, branch]);
  const entries = people.reduce((n, e) => n + days.filter((d) => weighKey(e.staffId, d) in weighLog).length, 0);
  const clearAll = () => people.forEach((e) => days.forEach((d) => setWeight(e.staffId, d, null)));

  return (
    <div className="pr-card" style={{ marginTop: 14 }}>
      <div className="pr-card-head">
        <div>
          <h3 style={{ fontSize: 14 }}>Weighing sheet</h3>
          <p>
            Enter the kilos each plucker delivered on each day, as weighed at the collection centre. Changes apply to the next calculation; a calculated run keeps the weights it was paid on.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={clearAll} disabled={!entries}>
          Clear {entries} entr{entries === 1 ? 'y' : 'ies'}
        </button>
      </div>
      {people.length === 0 ? (
        <div className="pr-note">No pluckers at this site in these dates.</div>
      ) : (
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Plucker</th>
                {days.map((d) => (
                  <th key={d} className="num">
                    {dayLabel(d)}
                  </th>
                ))}
                <th className="num">Total kg</th>
              </tr>
            </thead>
            <tbody>
              {people.map((e) => {
                let total = 0;
                const cells = days.map((d) => {
                  const k = weighKey(e.staffId, d);
                  total += k in weighLog ? weighLog[k] : leafKg(e.staffId, d);
                  return (
                    <td key={d} className="num">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className="form-control"
                        style={{ width: 64, padding: '4px 6px' }}
                        aria-label={`${e.fullName} ${dayLabel(d)} kg`}
                        value={k in weighLog ? weighLog[k] : ''}
                        placeholder={String(leafKg(e.staffId, d))}
                        onChange={(ev) => setWeight(e.staffId, d, ev.target.value === '' ? null : Math.max(0, Math.round(Number(ev.target.value))))}
                      />
                    </td>
                  );
                });
                return (
                  <tr key={e.staffId}>
                    <td>
                      <strong>{e.fullName}</strong>
                      <div className="muted">{e.staffId}</div>
                    </td>
                    {cells}
                    <td className="num">
                      <strong>{total}</strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/** Pay runs: calculate a day, week, custom range or the farmers' per-kg payroll, approve it, pay it, and report on it. */
export const PayRuns: React.FC = () => {
  const { tenantPayrollBatches, hrEmployees, selectedOrgId, createPayRun, discardPayRun, setPayrollBatchStatus, addToast, weighLog, payItems } = useApp();
  const weigh = useMemo(() => weighFor(weighLog), [weighLog]);
  const companyName = useCompanyName();

  const start0 = lastMonday();
  const [kind, setKind] = useState<PayRunKind>('WEEKLY');
  const [from, setFrom] = useState(start0);
  const [to, setTo] = useState(addDays(start0, 6));
  const [payDate, setPayDate] = useState(addDays(start0, 6));
  const [branch, setBranch] = useState('All sites');
  const [terms, setTerms] = useState<CasualTerms>(DEFAULT_CASUAL_TERMS);
  const [reportId, setReportId] = useState<string | null>(null);

  // Changing the frequency, start or end keeps the window valid; the pay date follows the end date
  const setWindow = (k: PayRunKind, start: string, end: string) => {
    const e2 = endFor(k, start, end);
    setKind(k);
    setFrom(start);
    setTo(e2);
    setPayDate(e2);
  };

  const sites = useMemo(() => [...new Set(hrEmployees.filter((e) => e.orgId === selectedOrgId).map(siteOf).filter(Boolean))].sort(), [hrEmployees, selectedOrgId]);

  const err = payRunWindowError({ kind, from, to });
  const runs = useMemo(() => tenantPayrollBatches.filter((b) => b.pipeline !== 'Monthly Payroll'), [tenantPayrollBatches]);
  const clash = err ? undefined : payRunClash(runs, selectedOrgId, { kind, from, to, branch });
  const preview: (PayRunRow | CasualRow)[] = useMemo(() => {
    if (err || clash) return [];
    const dueFor = (s: string) => deductionsDue(payItems, s, from, to);
    return kind === 'CASUAL' ? casualRows(hrEmployees, selectedOrgId, from, to, terms, branch, weigh, dueFor) : payRunRows(hrEmployees, selectedOrgId, from, to, branch);
  }, [err, clash, kind, terms, hrEmployees, selectedOrgId, from, to, branch, weigh, payItems]);
  const pt = payRunTotals(preview);
  const deductions = pt.paye + pt.nssf + pt.shif + pt.ahl;
  const otherDeductions = preview.reduce((s, r) => s + ('deductions' in r ? (r as CasualRow).deductions : 0), 0);
  const kgTotal = preview.reduce((s, r) => s + ('kg' in r ? r.kg : 0), 0);
  const topUps = preview.reduce((s, r) => s + ('topUp' in r ? r.topUp : 0), 0);

  const runPage = usePaged(runs, 10, selectedOrgId);
  const runNow = runs.find((b) => b.id === reportId);
  /** The workers and figures behind a run, recalculated from the run's own window and terms */
  const rowsOf = (b: PayrollBatch): (PayRunRow | CasualRow)[] => {
    if (!b.periodFrom || !b.periodTo) return [];
    if (!isCasualBatch(b)) return payRunRows(hrEmployees, b.orgId, b.periodFrom, b.periodTo, b.branch);
    // The kilos the run was paid on; the live sheet may have moved on since
    const snap = b.casualWeights;
    const weighed = snap ? (s: string, iso: string) => snap[weighKey(s, iso)] ?? leafKg(s, iso) : leafKg;
    const dueSnap = b.casualDeductions;
    return casualRows(hrEmployees, b.orgId, b.periodFrom, b.periodTo, b.casualTerms ?? DEFAULT_CASUAL_TERMS, b.branch, weighed, (s) => dueSnap?.[s] ?? 0);
  };
  const reportRows = useMemo(() => (runNow ? rowsOf(runNow) : []), [runNow, hrEmployees]);

  const create = () => {
    const req: PayRunRequest = { kind, from, to, payDate, branch, terms };
    createPayRun(req);
  };
  const approve = (b: PayrollBatch) => {
    setPayrollBatchStatus(b.id, 'AUDIT_APPROVED');
    addToast({ type: 'success', title: 'Pay run approved', message: `${b.batchNo} approved by David Otieno, Finance Manager. Ready to pay by M-Pesa.` });
  };
  const pay = (b: PayrollBatch) => {
    setPayrollBatchStatus(b.id, 'DISBURSED_MPESA');
    addToast({ type: 'success', title: 'Pay run sent', message: `KES ${kes(b.totalNetDisbursementKes)} sent by M-Pesa to ${b.workerCount} workers.` });
  };

  const payRunReport = (b: PayrollBatch, rows: (PayRunRow | CasualRow)[]): Report => {
    const t = payRunTotals(rows);
    const from0 = b.periodFrom ?? b.runDate;
    const to0 = b.periodTo ?? b.runDate;
    const days = windowDays(from0, to0);
    const casual = isCasualBatch(b);
    const deductionsKes = t.paye + t.nssf + t.shif + t.ahl;
    const bySite = [...new Set(rows.map((r) => r.site))].map((s) => {
      const part = rows.filter((r) => r.site === s);
      const g = payRunTotals(part);
      const kgSite = part.reduce((x, r) => x + ('kg' in r ? r.kg : 0), 0);
      return casual ? [s, g.workers, kgSite, g.gross, g.paye + g.nssf + g.shif + g.ahl, g.net] : [s, g.workers, g.gross, g.paye + g.nssf + g.shif + g.ahl, g.net];
    }) as (string | number)[][];
    const kgAll = rows.reduce((x, r) => x + ('kg' in r ? r.kg : 0), 0);
    const net = { label: 'Net pay', num: true };
    const statutory = [
      { label: 'NSSF', num: true },
      { label: 'SHIF', num: true },
      { label: 'Housing levy', num: true },
      { label: 'PAYE', num: true },
      net
    ];
    const schedule = casual
      ? {
          heading: 'Pay schedule',
          note: 'Kilos delivered × rate per kg, plus bonus for kilos above target, plus any minimum-wage top-up. Deductions use the statutory rates on the pay date.',
          columns: [
            { label: '#' },
            { label: 'Staff ID' },
            { label: 'Plucker' },
            { label: 'Site' },
            { label: 'Pays by' },
            { label: 'Days' },
            { label: 'Kg' },
            { label: 'KES/kg', num: true },
            { label: 'Piece pay', num: true },
            { label: 'Bonus', num: true },
            { label: 'Top-up', num: true },
            { label: 'Gross', num: true },
            { label: 'NSSF', num: true },
            { label: 'SHIF', num: true },
            { label: 'Housing levy', num: true },
            { label: 'PAYE', num: true },
            { label: 'Deductions', num: true },
            { label: 'Net pay', num: true }
          ],
          rows: rows.map((r, i) => {
            const c = r as CasualRow;
            return [i + 1, r.e.staffId, r.e.fullName, r.site, payRail(r.e), r.days, c.kg, c.rate, c.piece, c.bonus, c.topUp, r.gross, r.nssf, r.shif, r.ahl, r.paye, c.deductions, r.net];
          }),
          foot: [
            '',
            '',
            `Total (${t.workers})`,
            '',
            '',
            rows.reduce((s, r) => s + r.days, 0),
            kgAll,
            '',
            rows.reduce((s, r) => s + ('piece' in r ? (r as CasualRow).piece : 0), 0),
            rows.reduce((s, r) => s + ('bonus' in r ? (r as CasualRow).bonus : 0), 0),
            rows.reduce((s, r) => s + ('topUp' in r ? (r as CasualRow).topUp : 0), 0),
            t.gross,
            t.nssf,
            t.shif,
            t.ahl,
            t.paye,
            rows.reduce((s, r) => s + ('deductions' in r ? (r as CasualRow).deductions : 0), 0),
            t.net
          ]
        }
      : {
          heading: 'Pay schedule',
          note: 'Days attended × day rate. Deductions use the statutory rates on the pay date.',
          columns: [{ label: '#' }, { label: 'Staff ID' }, { label: 'Employee' }, { label: 'Site' }, { label: 'Pays by' }, { label: 'Days' }, { label: 'Day rate', num: true }, { label: 'Gross', num: true }, ...statutory],
          rows: rows.map((r, i) => [i + 1, r.e.staffId, r.e.fullName, r.site, payRail(r.e), r.days, r.rate, r.gross, r.nssf, r.shif, r.ahl, r.paye, r.net]),
          foot: ['', '', `Total (${t.workers})`, '', '', rows.reduce((s, r) => s + r.days, 0), '', t.gross, t.nssf, t.shif, t.ahl, t.paye, t.net]
        };
    const siteSummary = casual
      ? {
          heading: 'Summary by site',
          columns: [{ label: 'Site' }, { label: 'Pluckers' }, { label: 'Kg', num: true }, { label: 'Gross', num: true }, { label: 'Deductions', num: true }, { label: 'Net pay', num: true }],
          rows: bySite,
          foot: ['Total', t.workers, kgAll, t.gross, deductionsKes, t.net]
        }
      : {
          heading: 'Summary by site',
          columns: [{ label: 'Site' }, { label: 'Workers' }, { label: 'Gross', num: true }, { label: 'Deductions', num: true }, { label: 'Net pay', num: true }],
          rows: bySite,
          foot: ['Total', t.workers, t.gross, deductionsKes, t.net]
        };
    return {
      title: `${b.pipeline} · ${b.batchNo}`,
      subtitle: `Pay period ${fmtDay(from0)} to ${fmtDay(to0)} (${days} day${days > 1 ? 's' : ''}) · pay date ${fmtDay(b.payDate ?? to0)} · ${b.branch}${casual && b.casualTerms ? ` · ${casualBasis(b.casualTerms)}` : ''}`,
      kpis: casual
        ? [
            { label: 'Pluckers paid', value: String(t.workers) },
            { label: 'Green leaf', value: `${kes(kgAll)} kg` },
            { label: 'Gross pay', value: `KES ${kes(t.gross)}`, sub: `incl. KES ${kes(rows.reduce((s, r) => s + ('topUp' in r ? (r as CasualRow).topUp : 0), 0))} top-ups` },
            { label: 'Net pay', value: `KES ${kes(t.net)}`, sub: `Status: ${STATUS_LABEL[b.status]}` }
          ]
        : [
            { label: 'Workers paid', value: String(t.workers) },
            { label: 'Gross pay', value: `KES ${kes(t.gross)}` },
            { label: 'PAYE and deductions', value: `KES ${kes(deductionsKes)}` },
            { label: 'Net pay', value: `KES ${kes(t.net)}`, sub: `Status: ${STATUS_LABEL[b.status]}` }
          ],
      sections: [schedule, siteSummary],
      footnote: casual
        ? 'Kilos are the collection-centre weights for the period. Deductions are worked on the 30-day equivalent of the pay and scaled back to the period.'
        : 'Days are the attendance recorded for the run. Deductions are worked on the 30-day equivalent of the pay and scaled back to the run.',
      signatures: ['Prepared by (Payroll)', 'Checked by (Estate)', 'Approved by (Finance)'],
      landscape: true
    };
  };

  return (
    <>
      <div className="pr-card">
        <div className="pr-card-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarRange size={18} color="var(--brand-primary)" />
            <div>
              <h3>New pay run</h3>
              <p>
                Calculate, approve and pay a run, then report on it. A day can only be paid once per site. Per-kg runs pay the tea pluckers for the green leaf they delivered.
              </p>
            </div>
          </div>
        </div>
        <div className="pr-form-grid">
          <label className="req-field">
            <span>Pay frequency</span>
            <select className="form-control" value={kind} onChange={(e) => setWindow(e.target.value as PayRunKind, from, to)}>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="req-field">
            <span>From</span>
            <input type="date" className="form-control" value={from} onChange={(e) => setWindow(kind, e.target.value, to)} />
          </label>
          <label className="req-field">
            <span>To</span>
            <input type="date" className="form-control" value={to} disabled={kind !== 'CUSTOM'} onChange={(e) => setWindow(kind, from, e.target.value)} />
          </label>
          <label className="req-field">
            <span>Pay date</span>
            <input type="date" className="form-control" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </label>
          <label className="req-field">
            <span>Site</span>
            <select className="form-control" value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option>All sites</option>
              {sites.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>

        {kind === 'CASUAL' && (
          <div className="pr-card" style={{ marginTop: 14, boxShadow: 'none', background: 'var(--surface-subtle, transparent)' }}>
            <div className="pr-card-head" style={{ marginBottom: 8 }}>
              <div>
                <h3 style={{ fontSize: 14 }}>Farmers’ payroll terms</h3>
                <p>Set for this run and kept with it, so its report shows the terms it was paid on.</p>
              </div>
              <button className="btn btn-secondary" onClick={() => setTerms(DEFAULT_CASUAL_TERMS)}>
                Reset to standard
              </button>
            </div>
            <div className="pr-form-grid">
              {TERM_FIELDS.map((f) => (
                <label key={f.key} className="req-field">
                  <span>{f.label}</span>
                  <input type="number" min={0} className="form-control" value={terms[f.key]} onChange={(e) => setTerms({ ...terms, [f.key]: Math.max(0, Number(e.target.value) || 0) })} />
                  <small className="muted">{f.hint}</small>
                </label>
              ))}
            </div>
            <div className="pr-note" style={{ marginTop: 12 }}>
              <strong>How the farmers’ payroll works</strong>
              <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
                <li>
                  <strong>Weighing:</strong> each delivery is weighed at the collection centre; the kilos are totalled for each plucker for each day. Sundays are not weighed.
                </li>
                <li>
                  <strong>Piece pay:</strong> total kilos × rate per kg.
                </li>
                <li>
                  <strong>Bonus:</strong> on each day, every kilo above the target earns the bonus rate.
                </li>
                <li>
                  <strong>Minimum wage:</strong> if piece pay and bonus for the worked days fall short of the minimum daily wage × days worked, the difference is topped up.
                </li>
                <li>
                  <strong>Deductions and net:</strong> NSSF, SHIF, housing levy and PAYE are worked on the gross as for every employee; the net is paid by M-Pesa.
                </li>
                <li>
                  <strong>Control:</strong> calculate, approve by Finance, then pay. Weights that look wrong are checked against the weighbridge tickets before approval.
                </li>
              </ol>
            </div>
          </div>
        )}

        {kind === 'CASUAL' && !err && <WeighingSheet from={from} to={to} branch={branch} />}

        {err || clash ? (
          <div className="pr-note warn" style={{ marginTop: 12 }}>
            <AlertTriangle size={13} style={{ verticalAlign: '-2px' }} />{' '}
            {err ?? `${clash?.batchNo} already pays these days (${fmtDay(clash?.periodFrom ?? from)} – ${fmtDay(clash?.periodTo ?? to)}). Choose other dates or a site.`}
          </div>
        ) : kind === 'CASUAL' ? (
          <div className="pr-kv" style={{ marginTop: 12 }}>
            <div>
              <span>Pluckers</span>
              <strong>{pt.workers}</strong>
              <small>delivered leaf in these dates</small>
            </div>
            <div>
              <span>Green leaf</span>
              <strong>{kes(kgTotal)} kg</strong>
              <small>{pt.workers ? `${Math.round(kgTotal / Math.max(1, preview.reduce((s, r) => s + r.days, 0)))} kg per plucker-day` : 'weighed in these dates'}</small>
            </div>
            <div>
              <span>Gross pay</span>
              <strong>KES {kes(pt.gross)}</strong>
              <small>KES {kes(topUps)} of it top-ups</small>
            </div>
            <div>
              <span>Net pay</span>
              <strong>KES {kes(pt.net)}</strong>
              <small>after KES {kes(deductions + otherDeductions)} of statutory and other deductions</small>
            </div>
          </div>
        ) : (
          <div className="pr-kv" style={{ marginTop: 12 }}>
            <div>
              <span>Workers</span>
              <strong>{pt.workers}</strong>
              <small>daily-rated, attended in these dates</small>
            </div>
            <div>
              <span>Gross pay</span>
              <strong>KES {kes(pt.gross)}</strong>
              <small>days × day rate</small>
            </div>
            <div>
              <span>PAYE and deductions</span>
              <strong>KES {kes(deductions)}</strong>
              <small>PAYE, NSSF, SHIF, housing levy</small>
            </div>
            <div>
              <span>Net pay</span>
              <strong>KES {kes(pt.net)}</strong>
              <small>to M-Pesa and bank</small>
            </div>
          </div>
        )}
        <div className="pr-toolbar" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" disabled={!!err || !!clash || pt.workers === 0} title={pt.workers === 0 && !err && !clash ? 'Nobody to pay in these dates' : ''} onClick={create}>
            <Play size={14} /> Calculate {PAY_RUN_LABEL[kind].toLowerCase()}
          </button>
        </div>
      </div>

      <div className="hr-table-card">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>Pay runs</strong>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Daily, weekly, custom and per-kg runs for this company</span>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Frequency</th>
                <th>Days covered</th>
                <th>Pay date</th>
                <th>Site</th>
                <th className="num">Workers</th>
                <th className="num">Gross</th>
                <th className="num">Net</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runPage.rows.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>
                    No pay runs yet. Calculate a daily, weekly, custom or per-kg run above.
                  </td>
                </tr>
              ) : (
                runPage.rows.map((b) => (
                  <tr key={b.id} className={reportId === b.id ? 'pc-row-live' : undefined}>
                    <td>
                      <strong style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>{b.batchNo}</strong>
                    </td>
                    <td>
                      <span className="digicraft-badge-light">{b.pipeline}</span>
                    </td>
                    <td>{b.periodFrom && b.periodTo ? `${fmtDay(b.periodFrom)} – ${fmtDay(b.periodTo)}` : b.period}</td>
                    <td>{b.payDate ? fmtDay(b.payDate) : '—'}</td>
                    <td>{b.branch}</td>
                    <td className="num">{b.workerCount}</td>
                    <td className="num">{kes(b.totalGrossKes)}</td>
                    <td className="num">
                      <strong style={{ color: '#059669' }}>{kes(b.totalNetDisbursementKes)}</strong>
                    </td>
                    <td>
                      <span className={`digicraft-status-pill ${b.status === 'DISBURSED_MPESA' || b.status === 'POSTED_GL' ? 'success' : b.status === 'AUDIT_APPROVED' ? 'primary' : 'info'}`}>
                        {STATUS_LABEL[b.status]}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setReportId(b.id)}>
                        <FileText size={12} /> Report
                      </button>{' '}
                      {b.status === 'CALCULATED' && (
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => approve(b)}>
                          <CheckCircle2 size={12} /> Approve
                        </button>
                      )}{' '}
                      {b.status === 'CALCULATED' && b.id.startsWith('PAY-RUN-') && (
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => discardPayRun(b.id)} title="Remove this calculation so it can be run again">
                          <RotateCcw size={12} /> Discard
                        </button>
                      )}
                      {b.status === 'AUDIT_APPROVED' && (
                        <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => pay(b)}>
                          <Send size={12} /> Pay by M-Pesa
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {runs.length > 10 && <Pager p={runPage} noun="pay runs" />}
      </div>

      {runNow && (
        <div className="pr-card">
          <div className="pr-card-head">
            <div>
              <h3>Report · {runNow.batchNo}</h3>
              <p>The pay schedule for this run, ready to print, or download to Excel or CSV.</p>
            </div>
            <button className="btn btn-secondary" onClick={() => setReportId(null)}>
              Close report
            </button>
          </div>
          {reportRows.length ? (
            <ReportPaper report={payRunReport(runNow, reportRows)} company={companyName(runNow.orgId)} />
          ) : (
            <div className="pr-note warn">No workers match this run any more. Check the employee records before paying it.</div>
          )}
        </div>
      )}
    </>
  );
};
