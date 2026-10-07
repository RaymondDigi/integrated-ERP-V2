import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, Plus, Printer, RotateCcw, Search, UserMinus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { CATEGORY_LABEL, componentById, currentComponents, LOAN_COMPONENTS, type PayComponentType } from '../../../data/payComponents';
import { Pager, usePaged } from '../../../components/common/Pager';
import { printArea } from '../../ess/EssRecords';
import { Modal, PeriodSelect, PeriodTag, useCompanyName } from './shared';
import { downloadExcel, kes, recentPeriods, rowsFor, type Row } from './reports';

const EARN = ['earning', 'reimbursement', 'benefit_in_kind'];
const STANDING = ['SACCO_SHARES', 'WELFARE'];

/** Amount of one pay item on a payslip (earnings, benefits, before-tax and after-tax deductions). */
const cellOf = (r: Row, id: string) => {
  const p = r.p;
  const lines = [...p.earnings, ...p.benefits, ...p.pretax].filter((l) => l.componentId === id && l.itemId);
  if (lines.length) return lines.reduce((s, l) => s + l.amount, 0);
  return p.deductions.filter((d) => d.componentId === id && d.itemId).reduce((s, d) => s + d.requested, 0);
};

/**
 * Spreadsheet view of the payroll: every employee on one row, every pay item in a column. In the active period
 * the item cells are editable and the payslips recalculate as you type; previous periods are read-only.
 */
export const PayrollWorksheet: React.FC = () => {
  const { hrEmployees, selectedOrgId, payrollOpenPeriod, payrollCtx, payItems, payComponents, setWorksheetItem, payrollHolds, holdPayroll, releasePayroll, addToast } = useApp();
  const companyName = useCompanyName();
  const periods = recentPeriods(payrollOpenPeriod, 12);
  const [periodKey, setPeriodKey] = useState(payrollOpenPeriod.key);
  const period = periods.find((p) => p.key === periodKey) ?? periods[0];
  const editable = period.key === payrollOpenPeriod.key;
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('All');
  const [extra, setExtra] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<{ staffId: string; reason: string } | null>(null);

  const all = useMemo(() => rowsFor(hrEmployees, [selectedOrgId], period, payrollCtx), [hrEmployees, selectedOrgId, period, payrollCtx]);
  const depts = ['All', ...new Set(all.map((r) => r.e.department))];
  const rows = all
    .filter((r) => dept === 'All' || r.e.department === dept)
    .filter((r) => !q || `${r.e.staffId} ${r.e.fullName}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.e.department.localeCompare(b.e.department) || a.e.fullName.localeCompare(b.e.fullName));
  const pg = usePaged(rows, 50, `${periodKey}|${dept}|${q}`);

  // Item columns: anything posted this period, plus columns the user added
  const used = new Set<string>(extra);
  all.forEach((r) => {
    [...r.p.earnings, ...r.p.benefits, ...r.p.pretax].forEach((l) => l.itemId && used.add(l.componentId));
    r.p.deductions.forEach((d) => d.itemId && used.add(d.componentId));
  });
  const comps = [...used].map((id) => componentById(id));
  const earnCols = comps.filter((c) => EARN.includes(c.category)).sort((a, b) => a.name.localeCompare(b.name));
  const dedCols = comps.filter((c) => !EARN.includes(c.category)).sort((a, b) => a.name.localeCompare(b.name));
  const addable = currentComponents(payComponents).filter((c) => !c.system && c.status !== 'INACTIVE' && !LOAN_COMPONENTS.includes(c.id) && !used.has(c.id));

  /** A cell can be typed into when only one-off, typed (not formula) items make up its value. */
  const lockReason = (staffId: string, c: PayComponentType) => {
    if (!editable) return 'Paid period';
    const mine = payItems.filter((i) => i.staffId === staffId && i.componentId === c.id && i.status === 'ACTIVE' && (i.recurring ? i.period <= period.key && (!i.endPeriod || i.endPeriod >= period.key) : i.period === period.key));
    if (mine.some((i) => i.recurring)) return 'Monthly item — change it in Payroll items';
    if (mine.some((i) => i.auto)) return 'Calculated by formula — change the quantity in Payroll items';
    return '';
  };
  const commit = (staffId: string, c: PayComponentType, current: number) => {
    const k = `${staffId}|${c.id}`;
    if (!(k in drafts)) return;
    const v = Number(drafts[k].replace(/[^\d.]/g, '')) || 0;
    if (v !== current) setWorksheetItem(staffId, c.id, v);
    setDrafts(({ [k]: _drop, ...rest }) => rest);
  };
  const sum = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
  const loans = (r: Row) => r.p.deductions.filter((d) => d.loanId).reduce((s, d) => s + d.deducted, 0);
  const standing = (r: Row) => r.p.deductions.filter((d) => STANDING.includes(d.componentId) && !d.itemId).reduce((s, d) => s + d.deducted, 0);
  const held = payrollHolds.filter((h) => h.period === period.key && hrEmployees.find((e) => e.staffId === h.staffId)?.orgId === selectedOrgId);

  const fixedHead = ['Staff ID', 'Employee', 'Department', 'Days', 'Basic / wages', 'Allowances', 'Overtime'];
  const tailHead = ['Gross', 'NSSF', 'SHIF', 'Housing levy', 'PAYE'];
  const exportExcel = () => {
    const line = (r: Row) => [
      r.e.staffId,
      r.e.fullName,
      r.e.department,
      r.p.casual ? r.p.daysWorked : r.p.daysPaid,
      r.p.basic + r.p.wages,
      r.p.houseAllowance + r.p.transportAllowance,
      r.p.overtime,
      ...earnCols.map((c) => cellOf(r, c.id)),
      r.p.gross,
      r.p.nssf,
      r.p.shif,
      r.p.ahl,
      r.p.paye,
      ...dedCols.map((c) => cellOf(r, c.id)),
      loans(r),
      standing(r),
      r.p.net,
      r.p.employerNssf + r.p.employerAhl + r.p.nita,
      r.p.costToCompany
    ];
    const header = [...fixedHead, ...earnCols.map((c) => c.name), ...tailHead, ...dedCols.map((c) => c.name), 'Loans & advances', 'SACCO & welfare', 'Net pay', 'Employer costs', 'Cost to company'];
    const body = all.map(line);
    const foot = header.map((_, i) => (i < 3 ? (i === 0 ? 'Total' : '') : body.reduce((s, r) => s + (Number(r[i]) || 0), 0)));
    downloadExcel(`Payroll worksheet ${companyName(selectedOrgId)} ${period.label}`, [
      { name: period.label, title: `${companyName(selectedOrgId)} — payroll worksheet, ${period.label}${editable ? ' (active period)' : ''}`, header, rows: body, foot },
      { name: 'Not on payroll', header: ['Staff ID', 'Employee', 'Reason', 'By', 'On'], rows: held.map((h) => [h.staffId, hrEmployees.find((e) => e.staffId === h.staffId)?.fullName ?? '', h.reason, h.by, h.on]) }
    ]);
  };

  const th = (label: string, extraCls = '') => (
    <th className={`num ${extraCls}`} style={{ whiteSpace: 'normal', minWidth: 92 }}>
      {label}
    </th>
  );
  const itemCell = (r: Row, c: PayComponentType) => {
    const value = cellOf(r, c.id);
    const k = `${r.e.staffId}|${c.id}`;
    const lock = lockReason(r.e.staffId, c);
    const ded = !EARN.includes(c.category);
    const deferred = ded ? r.p.deductions.filter((d) => d.componentId === c.id && d.itemId).reduce((s, d) => s + d.deferred, 0) : 0;
    if (lock)
      return (
        <td key={c.id} className="num" title={lock}>
          {value ? kes(value) : ''}
          {value && editable ? <span className="pr-cell-lock">↻</span> : null}
        </td>
      );
    return (
      <td key={c.id} className="num pr-cell-edit">
        <input
          className="pr-cell-input"
          inputMode="decimal"
          aria-label={`${c.name} for ${r.e.fullName}`}
          value={k in drafts ? drafts[k] : value ? kes(value) : ''}
          placeholder="—"
          onChange={(ev) => setDrafts({ ...drafts, [k]: ev.target.value })}
          onBlur={() => commit(r.e.staffId, c, value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
            if (ev.key === 'Escape') setDrafts(({ [k]: _drop, ...rest }) => rest);
          }}
        />
        {deferred > 0 && <span className="pr-cell-note">{kes(deferred)} deferred</span>}
      </td>
    );
  };

  return (
    <>
      <div className="pr-card" style={{ marginBottom: 12 }}>
        <div className="pr-card-head" style={{ marginBottom: 10 }}>
          <div>
            <h3>
              Payroll worksheet — {period.label} <PeriodTag periodKey={period.key} />
            </h3>
            <p>
              {editable
                ? 'Type an amount in any item column to post it to this period; clear a cell to remove it. Payslips, batch totals and summaries recalculate at once. Add a column for any pay item.'
                : 'Previous periods are paid and read-only. Pick the active period to make changes.'}
            </p>
          </div>
          <div className="pr-toolbar">
            <button className="btn btn-secondary" onClick={exportExcel}>
              <FileSpreadsheet size={15} /> Export to Excel
            </button>
            <button className="btn btn-secondary" onClick={printArea}>
              <Printer size={15} /> Print
            </button>
          </div>
        </div>
        <div className="pr-toolbar">
          <PeriodSelect value={period.key} periods={periods} onChange={(p) => setPeriodKey(p.key)} />
          <select className="form-control" value={dept} onChange={(ev) => setDept(ev.target.value)} aria-label="Department">
            {depts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <div className="form-input-wrapper grow">
            <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)' }} />
            <input className="form-control" style={{ paddingLeft: 30 }} placeholder="Search name or staff ID" value={q} onChange={(ev) => setQ(ev.target.value)} />
          </div>
          {editable && (
            <select
              className="form-control"
              value=""
              aria-label="Add a pay item column"
              onChange={(ev) => {
                if (!ev.target.value) return;
                setExtra([...extra, ev.target.value]);
                addToast({ type: 'info', title: 'Column added', message: `${componentById(ev.target.value).name} — type amounts against employees.` });
              }}
            >
              <option value="">+ Add item column…</option>
              {(['earning', 'reimbursement', 'benefit_in_kind', 'pretax', 'deduction'] as const).map((g) => (
                <optgroup key={g} label={CATEGORY_LABEL[g]}>
                  {addable
                    .filter((c) => c.category === g && (!c.calc || c.calc.method === 'fixed'))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="hr-table-card ess-print-area pr-print-stack">
        <div className="sx-print-only" style={{ padding: 12 }}>
          <strong>
            {companyName(selectedOrgId)} — payroll worksheet, {period.label}
          </strong>
        </div>
        <div className="pr-table-scroll pr-sheet">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th className="pr-sticky">Employee</th>
                {th('Days')}
                {th('Basic / wages')}
                {th('Allowances')}
                {th('Overtime')}
                {earnCols.map((c) => th(c.name, 'pr-col-earn'))}
                {th('Gross pay', 'pr-col-total')}
                {th('NSSF')}
                {th('SHIF')}
                {th('Housing levy')}
                {th('PAYE')}
                {dedCols.map((c) => th(c.name, 'pr-col-ded'))}
                {th('Loans & advances')}
                {th('SACCO & welfare')}
                {th('Net pay', 'pr-col-total')}
                {editable && <th className="pr-no-print" />}
              </tr>
            </thead>
            <tbody>
              {pg.rows.map((r) => (
                <tr key={r.e.staffId}>
                  <td className="pr-sticky">
                    <strong>{r.e.fullName}</strong>
                    <div className="muted">
                      {r.e.staffId} · {r.e.department}
                    </div>
                  </td>
                  <td className="num">{r.p.casual ? `${r.p.daysWorked}d` : `${r.p.daysPaid}/${r.p.daysInPeriod}`}</td>
                  <td className="num">{kes(r.p.basic + r.p.wages)}</td>
                  <td className="num">{kes(r.p.houseAllowance + r.p.transportAllowance)}</td>
                  <td className="num">{r.p.overtime ? kes(r.p.overtime) : ''}</td>
                  {earnCols.map((c) => itemCell(r, c))}
                  <td className="num pr-col-total">
                    <strong>{kes(r.p.gross)}</strong>
                  </td>
                  <td className="num">{kes(r.p.nssf)}</td>
                  <td className="num">{kes(r.p.shif)}</td>
                  <td className="num">{kes(r.p.ahl)}</td>
                  <td className="num">{kes(r.p.paye)}</td>
                  {dedCols.map((c) => itemCell(r, c))}
                  <td className="num">{loans(r) ? kes(loans(r)) : ''}</td>
                  <td className="num">{standing(r) ? kes(standing(r)) : ''}</td>
                  <td className="num pr-col-total">
                    <strong>{kes(r.p.net)}</strong>
                    {r.p.warnings.length > 0 && <div className="pr-cell-note" title={r.p.warnings.join('\n')}>⚠ {r.p.warnings.length} note{r.p.warnings.length === 1 ? '' : 's'}</div>}
                  </td>
                  {editable && (
                    <td className="pr-no-print">
                      <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} title="Leave this employee off this period's payroll" onClick={() => setRemoving({ staffId: r.e.staffId, reason: '' })}>
                        <UserMinus size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pr-sticky">{rows.length} employees</td>
                <td />
                <td className="num">{kes(sum((r) => r.p.basic + r.p.wages))}</td>
                <td className="num">{kes(sum((r) => r.p.houseAllowance + r.p.transportAllowance))}</td>
                <td className="num">{kes(sum((r) => r.p.overtime))}</td>
                {earnCols.map((c) => (
                  <td key={c.id} className="num">
                    {kes(sum((r) => cellOf(r, c.id)))}
                  </td>
                ))}
                <td className="num">{kes(sum((r) => r.p.gross))}</td>
                <td className="num">{kes(sum((r) => r.p.nssf))}</td>
                <td className="num">{kes(sum((r) => r.p.shif))}</td>
                <td className="num">{kes(sum((r) => r.p.ahl))}</td>
                <td className="num">{kes(sum((r) => r.p.paye))}</td>
                {dedCols.map((c) => (
                  <td key={c.id} className="num">
                    {kes(sum((r) => cellOf(r, c.id)))}
                  </td>
                ))}
                <td className="num">{kes(sum(loans))}</td>
                <td className="num">{kes(sum(standing))}</td>
                <td className="num">{kes(sum((r) => r.p.net))}</td>
                {editable && <td className="pr-no-print" />}
              </tr>
            </tfoot>
          </table>
        </div>
        <Pager p={pg} noun="employees" sizes={[25, 50, 100]} />
      </div>

      {held.length > 0 && (
        <div className="hr-table-card" style={{ marginTop: 12 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <strong style={{ fontSize: 14 }}>Not on the {period.label} payroll</strong>
            <span className="pr-muted"> — pay held; items and loans stay on file</span>
          </div>
          <table className="hr-table pr-table">
            <tbody>
              {held.map((h) => {
                const e = hrEmployees.find((x) => x.staffId === h.staffId);
                return (
                  <tr key={h.staffId}>
                    <td>
                      <strong>{e?.fullName}</strong>
                      <div className="muted">
                        {h.staffId} · {e?.department}
                      </div>
                    </td>
                    <td>{h.reason}</td>
                    <td className="muted">
                      {h.by}, {h.on}
                    </td>
                    <td>
                      {editable && (
                        <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => releasePayroll(h.staffId)}>
                          <RotateCcw size={12} /> Restore to payroll
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {removing && (
        <Modal
          title={`Remove ${hrEmployees.find((e) => e.staffId === removing.staffId)?.fullName} from the ${period.label} payroll`}
          subtitle="Their pay is held for this period only — nothing is paid, deducted or remitted until you restore them. To end employment, use Separation."
          onClose={() => setRemoving(null)}
          width={560}
          footer={
            <div className="req-footer-actions">
              <button className="btn btn-secondary" onClick={() => setRemoving(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!removing.reason.trim()}
                onClick={() => {
                  holdPayroll(removing.staffId, removing.reason);
                  setRemoving(null);
                }}
              >
                Remove from payroll
              </button>
            </div>
          }
        >
          <label className="req-field">
            <span>Reason (kept on the payroll record)</span>
            <input className="form-control" value={removing.reason} onChange={(ev) => setRemoving({ ...removing, reason: ev.target.value })} placeholder="e.g. Absconded — pay held pending disciplinary hearing" autoFocus />
          </label>
          <div className="pr-toolbar">
            {['Absconded — pay held pending hearing', 'Bank details being verified', 'Unpaid study leave', 'Awaiting clearance'].map((s) => (
              <button key={s} type="button" className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => setRemoving({ ...removing, reason: s })}>
                {s}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {editable && (
        <div className="pr-muted" style={{ marginTop: 8 }}>
          <Plus size={11} /> Typed amounts are one-off items for {period.label} (reference “Payroll worksheet”). Monthly and formula items show ↻ and are changed in Payroll items.
        </div>
      )}
    </>
  );
};
