import React, { useMemo, useState } from 'react';
import { AlertTriangle, Printer, Search } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { printArea } from '../../ess/EssRecords';
import { PayslipDocument } from './PayslipDocument';
import { Modal, PeriodSelect, useCompanyName } from './shared';
import { Pager, usePaged } from '../../../components/common/Pager';
import { downloadCsv, kes, recentPeriods, rowsFor, type Row } from './reports';

export const PayslipRegister: React.FC = () => {
  const { hrEmployees, selectedOrgId, payrollOpenPeriod, payrollCtx } = useApp();
  const companyName = useCompanyName();
  const periods = recentPeriods(payrollOpenPeriod, 12);
  const [periodKey, setPeriodKey] = useState(payrollOpenPeriod.key);
  const period = periods.find((p) => p.key === periodKey) ?? periods[0];
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('All');
  const [onlyFlags, setOnlyFlags] = useState(false);
  const [open, setOpen] = useState<Row | null>(null);
  const [printAll, setPrintAll] = useState(false);

  const all = useMemo(() => rowsFor(hrEmployees, [selectedOrgId], period, payrollCtx), [hrEmployees, selectedOrgId, period, payrollCtx]);
  const depts = ['All', ...new Set(all.map((r) => r.e.department))];
  const rows = all
    .filter((r) => dept === 'All' || r.e.department === dept)
    .filter((r) => !onlyFlags || r.p.warnings.length)
    .filter((r) => !q || `${r.e.staffId} ${r.e.fullName} ${r.e.jobTitle}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.e.department.localeCompare(b.e.department) || a.e.fullName.localeCompare(b.e.fullName));
  const t = (k: (r: Row) => number) => rows.reduce((s, r) => s + k(r), 0);
  const pg = usePaged(rows, 25, `${periodKey}|${dept}|${onlyFlags}|${q}`);
  const other = (r: Row) => r.p.totalDeductions - r.p.nssf - r.p.shif - r.p.ahl - r.p.paye;
  const company = companyName(selectedOrgId);

  const doPrintAll = () => {
    setPrintAll(true);
    setTimeout(() => {
      printArea();
      setTimeout(() => setPrintAll(false), 500);
    }, 50);
  };

  const exportCsv = () =>
    downloadCsv(
      `Payroll register ${company} ${period.label}`,
      ['Staff ID', 'Name', 'Department', 'Days', 'Gross', 'Taxable', 'PAYE', 'NSSF', 'SHIF', 'Housing levy', 'Other deductions', 'Net pay', 'Employer NSSF', 'Employer AHL', 'NITA'],
      rows.map((r) => [r.e.staffId, r.e.fullName, r.e.department, r.p.casual ? r.p.daysWorked : r.p.daysPaid, r.p.gross, Math.round(r.p.tax.taxablePay), r.p.paye, r.p.nssf, r.p.shif, r.p.ahl, other(r), r.p.net, r.p.employerNssf, r.p.employerAhl, r.p.nita])
    );

  return (
    <>
      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Payslips &amp; payroll register</h3>
            <p>
              {period.label} · {rows.length} payslips{period.key === payrollOpenPeriod.key ? ' · open period — figures change as items are posted' : ' · paid'}
            </p>
          </div>
          <div className="pr-toolbar">
            <button className="btn btn-secondary" onClick={exportCsv}>
              Export CSV
            </button>
            <button className="btn btn-primary" onClick={doPrintAll} disabled={!rows.length}>
              <Printer size={15} /> Print {rows.length} payslips
            </button>
          </div>
        </div>
        <div className="pr-toolbar" style={{ marginBottom: 12 }}>
          <PeriodSelect value={period.key} periods={periods} onChange={(p) => setPeriodKey(p.key)} />
          <select className="form-control" value={dept} onChange={(ev) => setDept(ev.target.value)} aria-label="Department">
            {depts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={onlyFlags} onChange={(ev) => setOnlyFlags(ev.target.checked)} /> Only payslips with notes ({all.filter((r) => r.p.warnings.length).length})
          </label>
          <div className="form-input-wrapper grow">
            <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)' }} />
            <input className="form-control" style={{ paddingLeft: 30 }} placeholder="Search name or staff ID" value={q} onChange={(ev) => setQ(ev.target.value)} />
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th className="num">Days</th>
                <th className="num">Gross</th>
                <th className="num">PAYE</th>
                <th className="num">NSSF</th>
                <th className="num">SHIF</th>
                <th className="num">Housing levy</th>
                <th className="num">Other</th>
                <th className="num">Net pay</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.rows.map((r) => (
                <tr key={r.e.staffId} style={{ cursor: 'pointer' }} onClick={() => setOpen(r)}>
                  <td>
                    <strong>{r.e.fullName}</strong>
                    <div className="muted">
                      {r.e.staffId} · {r.e.department}
                      {r.p.exit ? ` · final pay (${r.p.exit.type.toLowerCase()})` : ''}
                    </div>
                  </td>
                  <td className="num">{r.p.casual ? `${r.p.daysWorked}d` : `${r.p.daysPaid}/${r.p.daysInPeriod}`}</td>
                  <td className="num">{kes(r.p.gross)}</td>
                  <td className="num">{kes(r.p.paye)}</td>
                  <td className="num">{kes(r.p.nssf)}</td>
                  <td className="num">{kes(r.p.shif)}</td>
                  <td className="num">{kes(r.p.ahl)}</td>
                  <td className="num">{kes(other(r))}</td>
                  <td className="num">
                    <strong>{kes(r.p.net)}</strong>
                  </td>
                  <td>{r.p.warnings.length > 0 && <AlertTriangle size={14} color="#d97706" aria-label={r.p.warnings.join('; ')} />}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{rows.length} employees</td>
                <td />
                <td className="num">{kes(t((r) => r.p.gross))}</td>
                <td className="num">{kes(t((r) => r.p.paye))}</td>
                <td className="num">{kes(t((r) => r.p.nssf))}</td>
                <td className="num">{kes(t((r) => r.p.shif))}</td>
                <td className="num">{kes(t((r) => r.p.ahl))}</td>
                <td className="num">{kes(t(other))}</td>
                <td className="num">{kes(t((r) => r.p.net))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <Pager p={pg} noun="payslips" />
      </div>

      {open && (
        <Modal
          title={`${open.e.fullName} — ${open.p.period}`}
          subtitle={`${open.e.jobTitle} · ${open.e.staffId}`}
          onClose={() => setOpen(null)}
          width={820}
          footer={
            <div className="req-footer-actions">
              <button className="btn btn-primary" onClick={printArea}>
                <Printer size={15} /> Print payslip
              </button>
            </div>
          }
        >
          <div className="ess-print-area">
            <PayslipDocument e={open.e} p={open.p} ctx={payrollCtx} company={company} />
          </div>
        </Modal>
      )}

      {printAll && (
        <div className="sx-print-only pr-print-stack ess-print-area">
          {rows.map((r) => (
            <PayslipDocument key={r.e.staffId} e={r.e} p={r.p} ctx={payrollCtx} company={company} />
          ))}
        </div>
      )}
    </>
  );
};
