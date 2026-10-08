import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange, CheckCircle2, FileText, Play, Send } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { PAY_RUN_LABEL, addDays, isoOf, payRunClash, payRunRows, payRunTotals, payRunWindowError, siteOf, windowDays, type PayRunKind, type PayRunRow } from '../../../data/payRuns';
import type { PayrollBatch } from '../../../types';
import { ReportPaper, type Report } from './ReportPaper';
import { kes, payRail } from './reports';
import { useCompanyName } from './shared';
import { Pager, usePaged } from '../../../components/common/Pager';

const KINDS: { id: PayRunKind; label: string }[] = [
  { id: 'DAILY', label: 'Daily (one day)' },
  { id: 'WEEKLY', label: 'Weekly (seven days)' },
  { id: 'CUSTOM', label: 'Custom date range' }
];
const STATUS_LABEL: Record<PayrollBatch['status'], string> = { DRAFT: 'Draft', CALCULATED: 'Calculated', AUDIT_APPROVED: 'Approved', DISBURSED_MPESA: 'Paid (M-Pesa)', POSTED_GL: 'Posted' };

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const lastMonday = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoOf(d);
};
/** The end date a frequency implies: a day ends on its start, a week runs six days on, a custom run keeps its own end */
const endFor = (k: PayRunKind, start: string, end: string) => (k === 'DAILY' ? start : k === 'WEEKLY' ? addDays(start, 6) : end);

/** Pay runs for daily-rated workers: calculate a day, week or custom range, approve it, pay it, and report on it. */
export const PayRuns: React.FC = () => {
  const { tenantPayrollBatches, hrEmployees, selectedOrgId, createPayRun, setPayrollBatchStatus, addToast } = useApp();
  const companyName = useCompanyName();

  const start0 = lastMonday();
  const [kind, setKind] = useState<PayRunKind>('WEEKLY');
  const [from, setFrom] = useState(start0);
  const [to, setTo] = useState(addDays(start0, 6));
  const [payDate, setPayDate] = useState(addDays(start0, 6));
  const [branch, setBranch] = useState('All sites');
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
  const clash = err ? undefined : payRunClash(runs, selectedOrgId, { from, to, branch });
  const preview = useMemo(() => (err || clash ? [] : payRunRows(hrEmployees, selectedOrgId, from, to, branch)), [err, clash, hrEmployees, selectedOrgId, from, to, branch]);
  const pt = payRunTotals(preview);
  const deductions = pt.paye + pt.nssf + pt.shif + pt.ahl;

  const runPage = usePaged(runs, 10, selectedOrgId);
  const runNow = runs.find((b) => b.id === reportId);
  const reportRows = useMemo(
    () => (runNow?.periodFrom && runNow.periodTo ? payRunRows(hrEmployees, runNow.orgId, runNow.periodFrom, runNow.periodTo, runNow.branch) : []),
    [runNow, hrEmployees]
  );

  const create = () => {
    createPayRun({ kind, from, to, payDate, branch });
  };
  const approve = (b: PayrollBatch) => {
    setPayrollBatchStatus(b.id, 'AUDIT_APPROVED');
    addToast({ type: 'success', title: 'Pay run approved', message: `${b.batchNo} approved by David Otieno, Finance Manager. Ready to pay by M-Pesa.` });
  };
  const pay = (b: PayrollBatch) => {
    setPayrollBatchStatus(b.id, 'DISBURSED_MPESA');
    addToast({ type: 'success', title: 'Pay run sent', message: `KES ${kes(b.totalNetDisbursementKes)} sent by M-Pesa to ${b.workerCount} workers.` });
  };

  const payRunReport = (b: PayrollBatch, rows: PayRunRow[]): Report => {
    const t = payRunTotals(rows);
    const from0 = b.periodFrom ?? b.runDate;
    const to0 = b.periodTo ?? b.runDate;
    const days = windowDays(from0, to0);
    const bySite = [...new Set(rows.map((r) => r.site))].map((s) => {
      const g = payRunTotals(rows.filter((r) => r.site === s));
      return [s, g.workers, g.gross, g.paye + g.nssf + g.shif + g.ahl, g.net] as (string | number)[];
    });
    return {
      title: `${b.pipeline} · ${b.batchNo}`,
      subtitle: `Pay period ${fmtDay(from0)} to ${fmtDay(to0)} (${days} day${days > 1 ? 's' : ''}) · pay date ${fmtDay(b.payDate ?? to0)} · ${b.branch}`,
      kpis: [
        { label: 'Workers paid', value: String(t.workers) },
        { label: 'Gross pay', value: `KES ${kes(t.gross)}` },
        { label: 'PAYE and deductions', value: `KES ${kes(t.paye + t.nssf + t.shif + t.ahl)}` },
        { label: 'Net pay', value: `KES ${kes(t.net)}`, sub: `Status: ${STATUS_LABEL[b.status]}` }
      ],
      sections: [
        {
          heading: 'Pay schedule',
          note: 'Days attended × day rate. Deductions use the statutory rates on the pay date.',
          columns: [
            { label: '#' },
            { label: 'Staff ID' },
            { label: 'Employee' },
            { label: 'Site' },
            { label: 'Pays by' },
            { label: 'Days' },
            { label: 'Day rate', num: true },
            { label: 'Gross', num: true },
            { label: 'NSSF', num: true },
            { label: 'SHIF', num: true },
            { label: 'Housing levy', num: true },
            { label: 'PAYE', num: true },
            { label: 'Net pay', num: true }
          ],
          rows: rows.map((r, i) => [i + 1, r.e.staffId, r.e.fullName, r.site, payRail(r.e), r.days, r.rate, r.gross, r.nssf, r.shif, r.ahl, r.paye, r.net]),
          foot: ['', '', `Total (${t.workers})`, '', '', rows.reduce((s, r) => s + r.days, 0), '', t.gross, t.nssf, t.shif, t.ahl, t.paye, t.net]
        },
        {
          heading: 'Summary by site',
          columns: [{ label: 'Site' }, { label: 'Workers' }, { label: 'Gross', num: true }, { label: 'Deductions', num: true }, { label: 'Net pay', num: true }],
          rows: bySite,
          foot: ['Total', t.workers, t.gross, t.paye + t.nssf + t.shif + t.ahl, t.net]
        }
      ],
      footnote: 'Days are the attendance recorded for the run. Deductions are worked on the 30-day equivalent of the pay and scaled back to the run.',
      signatures: ['Prepared by (Payroll)', 'Checked by (HR)', 'Approved by (Finance)'],
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
                Pay daily-rated workers for a day, a week or any date range. Each run is calculated, approved, paid by M-Pesa and reported on separately. A day can only be paid once per site.
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
        {err || clash ? (
          <div className="pr-note warn" style={{ marginTop: 12 }}>
            <AlertTriangle size={13} style={{ verticalAlign: '-2px' }} />{' '}
            {err ?? `${clash?.batchNo} already pays these days (${fmtDay(clash?.periodFrom ?? from)} – ${fmtDay(clash?.periodTo ?? to)}). Choose other dates or a site.`}
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
          <button className="btn btn-primary" disabled={!!err || !!clash || pt.workers === 0} title={pt.workers === 0 && !err && !clash ? 'Nobody attended in these dates' : ''} onClick={create}>
            <Play size={14} /> Calculate {PAY_RUN_LABEL[kind].toLowerCase()}
          </button>
        </div>
      </div>

      <div className="hr-table-card">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14 }}>Pay runs</strong>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Daily, weekly and custom runs for this company</span>
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
                    No pay runs yet. Calculate a daily, weekly or custom run above.
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
