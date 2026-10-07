import React, { useMemo, useState } from 'react';
import { Landmark, Plus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { payableIn, payslip, periodKey } from '../../../data/payrollEngine';
import { LOAN_TYPE_LABEL, loanInstallment, loanStartingBalance, type LoanType, type StaffLoan } from '../../../data/payItems';
import { ratesOn } from '../../../data/statutoryRates';
import type { HREmployee } from '../../../types';
import { forwardPeriods, Modal, PeriodSelect } from './shared';
import { Pager, usePaged } from '../../../components/common/Pager';
import { kes, periodOf } from './reports';

const LENDER: Record<LoanType, string> = {
  SALARY_ADVANCE: 'Employer',
  STAFF_LOAN: 'Employer',
  SACCO_LOAN: 'Kericho Tea Growers SACCO',
  HELB: 'Higher Education Loans Board',
  BANK_CHECKOFF: 'Equity Bank',
  COURT_ORDER: 'Kericho Law Courts'
};

/** Month-by-month projection from the opening balance (actual months come from payslips). */
const project = (l: Pick<StaffLoan, 'principal' | 'ratePa' | 'method' | 'termMonths' | 'installment'>, from: number, months = 60) => {
  const out: { n: number; opening: number; interest: number; pay: number; closing: number }[] = [];
  let bal = from;
  for (let n = 1; n <= months && bal > 0.5; n++) {
    const interest = l.method === 'reducing' ? Math.round((bal * l.ratePa) / 12) : 0;
    const pay = Math.min(l.installment, bal + interest);
    out.push({ n, opening: bal, interest, pay, closing: bal + interest - pay });
    bal = bal + interest - pay;
  }
  return out;
};

const NewLoanModal: React.FC<{ employees: HREmployee[]; onClose: () => void }> = ({ employees, onClose }) => {
  const { addStaffLoan, payrollOpenPeriod, payrollCtx, activeTenant } = useApp();
  const [staffId, setStaffId] = useState(employees[0]?.staffId ?? '');
  const [type, setType] = useState<LoanType>('STAFF_LOAN');
  const [lender, setLender] = useState(activeTenant.name);
  const [principal, setPrincipal] = useState('50000');
  const [rate, setRate] = useState('0');
  const [method, setMethod] = useState<StaffLoan['method']>('none');
  const [term, setTerm] = useState('6');
  const [installmentOverride, setInstallmentOverride] = useState('');
  const [start, setStart] = useState(payrollOpenPeriod.key);
  const [reference, setReference] = useState('');
  const P = Number(principal) || 0;
  const r = (Number(rate) || 0) / 100;
  const n = Math.max(1, Number(term) || 1);
  const auto = loanInstallment(P, r, r ? method : 'none', n);
  const installment = Number(installmentOverride) || auto;
  const e = employees.find((x) => x.staffId === staffId);
  const startP = periodOf(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1);
  const slip = e ? payslip(e, startP.year, startP.month, payrollCtx) : null;
  const used = slip ? slip.deductions.reduce((s, d) => s + d.deducted, 0) : 0;
  const room = slip ? slip.deductionCap - used : 0;
  const draft = { principal: P, ratePa: r, method: r ? method : ('none' as const), termMonths: n, installment };
  const rows = project(draft, loanStartingBalance(draft));
  const totalPaid = rows.reduce((s, x) => s + x.pay, 0);
  const prescribed = ratesOn(`${start}-25`).prescribedLoanRate;
  const bik = (type === 'STAFF_LOAN' || type === 'SALARY_ADVANCE') && r < prescribed ? Math.round((P * (prescribed - r)) / 12) : 0;
  const error = !e ? 'Choose an employee' : !(P > 0) ? 'Enter the amount' : !reference.trim() ? 'Add a reference (agreement, notice or order number)' : installment > P * 2 ? 'Instalment looks wrong' : '';

  return (
    <Modal
      title="Set up a loan or recovery"
      subtitle="Staff loans, advances, SACCO and bank check-offs, HELB notices and court orders recovered through payroll."
      onClose={onClose}
      width={880}
      footer={
        <>
          <div className="req-totals">
            <div>
              <span>Monthly</span>
              <strong>KES {kes(installment)}</strong>
            </div>
            <div>
              <span>Months</span>
              <strong>{rows.length}</strong>
            </div>
            <div>
              <span>Total repaid</span>
              <strong>KES {kes(totalPaid)}</strong>
            </div>
          </div>
          {error && <span className="req-error">{error}</span>}
          <div className="req-footer-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!!error}
              onClick={() =>
                addStaffLoan({
                  staffId,
                  type,
                  lender,
                  principal: P,
                  ratePa: r,
                  method: r ? method : 'none',
                  termMonths: n,
                  installment,
                  startPeriod: start,
                  disbursedOn: new Date().toISOString().slice(0, 10),
                  reference
                }) && onClose()
              }
            >
              Set up loan
            </button>
          </div>
        </>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Employee</span>
          <select className="form-control" value={staffId} onChange={(ev) => setStaffId(ev.target.value)}>
            {employees.map((x) => (
              <option key={x.staffId} value={x.staffId}>
                {x.staffId} · {x.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className="req-field">
          <span>Type</span>
          <select
            className="form-control"
            value={type}
            onChange={(ev) => {
              const t = ev.target.value as LoanType;
              setType(t);
              setLender(LENDER[t] === 'Employer' ? activeTenant.name : LENDER[t]);
              if (t === 'SALARY_ADVANCE') setTerm('1');
            }}
          >
            {(Object.keys(LOAN_TYPE_LABEL) as LoanType[]).map((t) => (
              <option key={t} value={t}>
                {LOAN_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="req-field">
          <span>Lender / payee</span>
          <input className="form-control" value={lender} onChange={(ev) => setLender(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Amount (KES)</span>
          <input className="form-control" type="number" min={0} value={principal} onChange={(ev) => setPrincipal(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Interest (% a year)</span>
          <input className="form-control" type="number" min={0} step={0.5} value={rate} onChange={(ev) => setRate(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Interest method</span>
          <select className="form-control" value={r ? method : 'none'} disabled={!r} onChange={(ev) => setMethod(ev.target.value as StaffLoan['method'])}>
            <option value="none">No interest</option>
            <option value="flat">Flat — on the original amount</option>
            <option value="reducing">Reducing balance</option>
          </select>
        </label>
        <label className="req-field">
          <span>Term (months)</span>
          <input className="form-control" type="number" min={1} value={term} onChange={(ev) => setTerm(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Monthly instalment (blank = calculated KES {kes(auto)})</span>
          <input className="form-control" type="number" min={0} value={installmentOverride} onChange={(ev) => setInstallmentOverride(ev.target.value)} placeholder={String(auto)} />
        </label>
        <label className="req-field">
          <span>First deduction</span>
          <PeriodSelect value={start} periods={forwardPeriods(payrollOpenPeriod, 6)} onChange={(p) => setStart(p.key)} />
        </label>
        <label className="req-field">
          <span>Reference</span>
          <input className="form-control" value={reference} onChange={(ev) => setReference(ev.target.value)} placeholder="Agreement / notice / order no." />
        </label>
      </div>

      {slip && (
        <div className={`pr-note ${installment > room ? 'warn' : ''}`}>
          <strong>Affordability in {startP.label}:</strong> net pay after statutory deductions KES {kes(slip.netAfterStatutory)}; two-thirds limit KES {kes(slip.deductionCap)}; already deducted KES {kes(used)}; room left KES {kes(Math.max(0, room))}.
          {installment > room && ' Part of each instalment will be deferred to the next month unless other deductions end.'}
        </div>
      )}
      {bik > 0 && (
        <div className="pr-note">
          Below the KRA prescribed rate ({prescribed * 100}%), so the employee is taxed on a benefit of about KES {kes(bik)} a month on the opening balance.
        </div>
      )}
      <div>
        <div className="req-section-title">Repayment schedule</div>
        <div className="pr-table-scroll" style={{ maxHeight: 240, overflowY: 'auto' }}>
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Opening</th>
                <th className="num">Interest</th>
                <th className="num">Instalment</th>
                <th className="num">Closing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.n}>
                  <td>{periodOf(startP.year, startP.month + x.n - 1).label}</td>
                  <td className="num">{kes(x.opening)}</td>
                  <td className="num">{kes(x.interest)}</td>
                  <td className="num">{kes(x.pay)}</td>
                  <td className="num">{kes(x.closing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};

/** What actually happened, month by month, from the payslips. */
const LoanHistory: React.FC<{ loan: StaffLoan; e: HREmployee; onClose: () => void }> = ({ loan, e, onClose }) => {
  const { payrollCtx, payrollOpenPeriod } = useApp();
  const months: ReturnType<typeof periodOf>[] = [];
  for (let p = periodOf(Number(loan.startPeriod.slice(0, 4)), Number(loan.startPeriod.slice(5, 7)) - 1); p.key <= payrollOpenPeriod.key; p = periodOf(p.year, p.month + 1)) months.push(p);
  const rows = months
    .filter((p) => payableIn([e], e.orgId, p.year, p.month).length)
    .map((p) => ({ p, d: payslip(e, p.year, p.month, payrollCtx).deductions.find((x) => x.loanId === loan.id) }));
  const last = rows[rows.length - 1]?.d;
  const ahead = last && (last.balanceAfter ?? 0) > 0 ? project(loan, last.balanceAfter ?? 0) : [];
  return (
    <Modal title={`${loan.id} — ${LOAN_TYPE_LABEL[loan.type]}`} subtitle={`${e.fullName} · ${loan.lender} · ${loan.reference}`} onClose={onClose} width={820}>
      <div className="pr-kv">
        <div>
          <span>Amount</span>
          <strong>KES {kes(loan.principal)}</strong>
          <small>{loan.ratePa ? `${+(loan.ratePa * 100).toFixed(2)}% ${loan.method}` : 'No interest'}</small>
        </div>
        <div>
          <span>Instalment</span>
          <strong>KES {kes(loan.installment)}</strong>
          <small>from {loan.startPeriod}</small>
        </div>
        <div>
          <span>Recovered</span>
          <strong>KES {kes(rows.reduce((s, r) => s + (r.d?.deducted ?? 0), 0))}</strong>
          <small>{rows.length} payslips</small>
        </div>
        <div>
          <span>Balance after {payrollOpenPeriod.label}</span>
          <strong>KES {kes(last?.balanceAfter ?? loanStartingBalance(loan))}</strong>
          <small>{ahead.length ? `${ahead.length} more months` : 'Cleared'}</small>
        </div>
      </div>
      <table className="hr-table pr-table">
        <thead>
          <tr>
            <th>Payslip</th>
            <th className="num">Owed</th>
            <th className="num">Due</th>
            <th className="num">Deducted</th>
            <th className="num">Deferred</th>
            <th className="num">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, d }) => (
            <tr key={p.key}>
              <td>
                {p.label}
                {p.key === payrollOpenPeriod.key && <span className="muted"> · this run</span>}
              </td>
              <td className="num">{kes(d?.balanceBefore ?? 0)}</td>
              <td className="num">{kes(d?.requested ?? 0)}</td>
              <td className="num">{kes(d?.deducted ?? 0)}</td>
              <td className="num" style={{ color: d?.deferred ? '#b45309' : undefined }}>
                {d?.deferred ? kes(d.deferred) : '—'}
              </td>
              <td className="num">{kes(d?.balanceAfter ?? 0)}</td>
            </tr>
          ))}
          {ahead.slice(0, 12).map((x) => (
            <tr key={`f${x.n}`} style={{ opacity: 0.6 }}>
              <td>{periodOf(payrollOpenPeriod.year, payrollOpenPeriod.month + x.n).label} (projected)</td>
              <td className="num">{kes(x.opening + x.interest)}</td>
              <td className="num">{kes(x.pay)}</td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className="num">{kes(x.closing)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
};

export const PayrollLoans: React.FC = () => {
  const { staffLoans, hrEmployees, selectedOrgId, payrollOpenPeriod, payrollCtx, setLoanStatus } = useApp();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<StaffLoan | null>(null);
  const employees = useMemo(() => payableIn(hrEmployees, selectedOrgId, payrollOpenPeriod.year, payrollOpenPeriod.month), [hrEmployees, selectedOrgId, payrollOpenPeriod]);
  const staff = (id: string) => hrEmployees.find((e) => e.staffId === id);
  const key = periodKey(payrollOpenPeriod.year, payrollOpenPeriod.month);
  const rows = staffLoans
    .filter((l) => l.orgId === selectedOrgId)
    .map((l) => {
      const e = staff(l.staffId);
      const onPayroll = e && payableIn([e], e.orgId, payrollOpenPeriod.year, payrollOpenPeriod.month).length > 0;
      const d = onPayroll && l.startPeriod <= key ? payslip(e!, payrollOpenPeriod.year, payrollOpenPeriod.month, payrollCtx).deductions.find((x) => x.loanId === l.id) : undefined;
      const balance = d ? (d.balanceAfter ?? 0) : loanStartingBalance(l);
      return { l, e, d, balance, cleared: !!d && (d.balanceBefore ?? 0) <= 0 };
    })
    .filter((r) => r.balance > 0 || r.d?.deducted);
  const active = rows.filter((r) => r.l.status === 'ACTIVE');
  const pg = usePaged(rows, 10, selectedOrgId);
  const thisMonth = active.reduce((s, r) => s + (r.d?.deducted ?? 0), 0);
  const deferred = active.reduce((s, r) => s + (r.d?.deferred ?? 0), 0);

  return (
    <>
      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Active loans &amp; recoveries</div>
          <div className="hr-stat-value">{active.length}</div>
          <div className="hr-stat-subtext">{new Set(active.map((r) => r.l.staffId)).size} employees</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Outstanding after {payrollOpenPeriod.label}</div>
          <div className="hr-stat-value">KES {kes(active.reduce((s, r) => s + r.balance, 0))}</div>
          <div className="hr-stat-subtext">Employer loans KES {kes(active.filter((r) => ['STAFF_LOAN', 'SALARY_ADVANCE'].includes(r.l.type)).reduce((s, r) => s + r.balance, 0))}</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Recovered this run</div>
          <div className="hr-stat-value" style={{ color: '#059669' }}>
            KES {kes(thisMonth)}
          </div>
          <div className="hr-stat-subtext">Paid on to lenders by the 9th</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Deferred by the ⅔ limit</div>
          <div className="hr-stat-value" style={{ color: deferred ? '#d97706' : undefined }}>
            KES {kes(deferred)}
          </div>
          <div className="hr-stat-subtext">Rolls into next month’s instalment</div>
        </div>
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Loans &amp; advances</h3>
            <p>Recovered in legal priority order — court orders, HELB, employer loans, then SACCO and bank check-offs — and never more than two-thirds of net pay. On exit, balances are recovered in full from final dues.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus size={15} /> New loan / recovery
          </button>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Loan</th>
                <th>Employee</th>
                <th>Type &amp; lender</th>
                <th className="num">Amount</th>
                <th>Terms</th>
                <th className="num">This run</th>
                <th className="num">Balance after</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 28, color: 'var(--text-tertiary)' }}>
                    <Landmark size={18} style={{ verticalAlign: 'middle' }} /> No loans for this company.
                  </td>
                </tr>
              )}
              {pg.rows.map(({ l, e, d, balance }) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.id}</strong>
                    <div className="muted">{l.reference}</div>
                  </td>
                  <td>
                    {e?.fullName ?? l.staffId}
                    <div className="muted">{l.staffId}</div>
                  </td>
                  <td>
                    {LOAN_TYPE_LABEL[l.type]}
                    <div className="muted">{l.lender}</div>
                  </td>
                  <td className="num">{kes(l.principal)}</td>
                  <td>
                    KES {kes(l.installment)} × {l.termMonths}
                    <div className="muted">
                      {l.ratePa ? `${+(l.ratePa * 100).toFixed(2)}% ${l.method}` : 'No interest'} · from {l.startPeriod}
                    </div>
                  </td>
                  <td className="num">
                    {d ? kes(d.deducted) : l.startPeriod > key ? `starts ${l.startPeriod}` : '—'}
                    {!!d?.deferred && <div className="muted" style={{ color: '#b45309' }}>{kes(d.deferred)} deferred</div>}
                  </td>
                  <td className="num">{kes(balance)}</td>
                  <td>
                    <span className={`digicraft-status-pill ${l.status === 'ACTIVE' ? (d?.deferred ? 'warning' : 'success') : 'info'}`}>{l.status === 'ACTIVE' ? (d?.deferred ? 'In arrears' : 'Active') : 'Suspended'}</span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {e && (
                      <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setOpen(l)}>
                        Schedule
                      </button>
                    )}{' '}
                    <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setLoanStatus(l.id, l.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')}>
                      {l.status === 'ACTIVE' ? 'Suspend' : 'Resume'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="loans" />
      </div>
      {adding && <NewLoanModal employees={employees} onClose={() => setAdding(false)} />}
      {open && staff(open.staffId) && <LoanHistory loan={open} e={staff(open.staffId)!} onClose={() => setOpen(null)} />}
    </>
  );
};
