import React, { useMemo, useState } from 'react';
import { ClipboardList, FileUp, Plus, Search, Users } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { CATEGORY_LABEL, componentById, currentComponents, LOAN_COMPONENTS, type ComponentCategory, type PayComponentType } from '../../../data/payComponents';
import { calcAmount, formulaVars, itemsFor, makeContext, payableIn, payslip } from '../../../data/payrollEngine';
import { Pager, usePaged } from '../../../components/common/Pager';
import { calcSummary, needsQty } from './PayItemSetup';
import type { PayItem } from '../../../data/payItems';
import type { HREmployee } from '../../../types';
import { Flags, forwardPeriods, Modal, PeriodSelect } from './shared';
import { kes, periodOf, recentPeriods } from './reports';

type Draft = Omit<PayItem, 'id' | 'orgId' | 'postedBy' | 'postedOn' | 'status'>;

/** Pay items payroll can post by hand (the engine works out the rest; loans have their own screen). */
const usePostable = () => {
  const { payComponents } = useApp();
  return currentComponents(payComponents).filter((c) => !c.system && c.status !== 'INACTIVE' && !LOAN_COMPONENTS.includes(c.id));
};

/** Amount a calculated pay item gives for one employee, or a message when it cannot be worked out. */
const amountFor = (c: PayComponentType, e: HREmployee | undefined, period: string, qty: number, typed: number) => {
  if (!c.calc || c.calc.method === 'fixed' || !e) return { amount: typed, error: '' };
  try {
    return { amount: calcAmount(c.calc, formulaVars(e, Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1), qty, typed), error: '' };
  } catch (err) {
    return { amount: 0, error: (err as Error).message };
  }
};
const GROUPS: ComponentCategory[] = ['earning', 'reimbursement', 'benefit_in_kind', 'pretax', 'deduction'];

const ComponentSelect: React.FC<{ value: string; onChange: (id: string) => void }> = ({ value, onChange }) => {
  const postable = usePostable();
  return (
  <select className="form-control" value={value} onChange={(ev) => onChange(ev.target.value)}>
    {GROUPS.map((g) => (
      <optgroup key={g} label={CATEGORY_LABEL[g]}>
        {postable.filter((c) => c.category === g).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </optgroup>
    ))}
  </select>
  );
};

const ComponentHint: React.FC<{ c: PayComponentType }> = ({ c }) => (
  <div className="pr-note" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
    <Flags c={c} />
    <span>{c.note}</span>
    {c.calc && c.calc.method !== 'fixed' && <strong>Amount: {calcSummary(c)}</strong>}
  </div>
);

/** Before/after view of one employee's pay with the draft items included. */
const Impact: React.FC<{ e?: HREmployee; drafts: Draft[] }> = ({ e, drafts }) => {
  const { payItems, staffLoans, payrollCtx, payrollOpenPeriod } = useApp();
  if (!e || !drafts.length) return null;
  const d0 = drafts[0];
  const p = periodOf(Number(d0.period.slice(0, 4)), Number(d0.period.slice(5, 7)) - 1);
  const temp = makeContext({ items: [...payItems, ...drafts.map((d, i) => ({ ...d, id: `DRAFT-${i}`, orgId: e.orgId, postedBy: '', postedOn: '', status: 'ACTIVE' as const }))], loans: staffLoans });
  const before = payslip(e, p.year, p.month, payrollCtx);
  const after = payslip(e, p.year, p.month, temp);
  const row = (label: string, a: number, b: number) => (
    <tr>
      <td>{label}</td>
      <td className="num">{kes(a)}</td>
      <td className="num">{kes(b)}</td>
      <td className="num" style={{ color: b - a > 0 ? 'var(--status-success, #059669)' : b - a < 0 ? 'var(--status-critical)' : undefined }}>
        {b - a === 0 ? '—' : `${b - a > 0 ? '+' : ''}${kes(b - a)}`}
      </td>
    </tr>
  );
  return (
    <div>
      <div className="req-section-title">
        Effect on {e.fullName.split(' ')[0]}’s {p.label} pay{p.key !== payrollOpenPeriod.key ? ' (future period)' : ''}
      </div>
      <table className="hr-table pr-table">
        <thead>
          <tr>
            <th />
            <th className="num">Now</th>
            <th className="num">With item</th>
            <th className="num">Change</th>
          </tr>
        </thead>
        <tbody>
          {row('Gross pay', before.gross, after.gross)}
          {row('Taxable pay', before.tax.taxablePay, after.tax.taxablePay)}
          {row('NSSF', before.nssf, after.nssf)}
          {row('SHIF + housing levy', before.shif + before.ahl, after.shif + after.ahl)}
          {row('PAYE', before.paye, after.paye)}
          {row('Other deductions', before.totalDeductions - before.nssf - before.shif - before.ahl - before.paye, after.totalDeductions - after.nssf - after.shif - after.ahl - after.paye)}
          {row('Net pay', before.net, after.net)}
        </tbody>
      </table>
      {after.warnings.filter((w) => !before.warnings.includes(w)).map((w, i) => (
        <div key={i} className="pr-note warn" style={{ marginTop: 8 }}>
          {w}
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ single item */

const PostItemModal: React.FC<{ employees: HREmployee[]; onClose: () => void }> = ({ employees, onClose }) => {
  const { postPayItems, payrollOpenPeriod } = useApp();
  const periods = forwardPeriods(payrollOpenPeriod, 6);
  const [staffId, setStaffId] = useState(employees[0]?.staffId ?? '');
  const [componentId, setComponentId] = useState('BONUS');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState(payrollOpenPeriod.key);
  const [recurring, setRecurring] = useState(false);
  const [endPeriod, setEndPeriod] = useState('');
  const [reference, setReference] = useState('');
  const [query, setQuery] = useState('');
  const [qty, setQty] = useState('');
  const c = componentById(componentId);
  const canRecur = c.recurrence !== 'one_off';
  const e = employees.find((x) => x.staffId === staffId);
  const auto = !!c.calc && c.calc.method !== 'fixed';
  const calc = amountFor(c, e, period, Number(qty) || 0, Number(amount) || 0);
  const amt = calc.amount;
  const draft: Draft | null =
    amt > 0 && e
      ? {
          staffId,
          componentId,
          amount: amt,
          auto: auto || undefined,
          quantity: needsQty(c) ? Number(qty) : undefined,
          period,
          recurring: canRecur && (recurring || c.recurrence === 'recurring'),
          endPeriod: endPeriod || undefined,
          reference: reference || c.name,
          source: 'Manual'
        }
      : null;
  const error = !e
    ? 'Choose an employee'
    : calc.error
      ? `Formula: ${calc.error}`
      : needsQty(c) && !(Number(qty) > 0)
        ? `Enter the ${(c.calc?.qtyLabel ?? 'quantity').toLowerCase()}`
        : !(amt > 0)
          ? 'Amount works out to zero'
          : !reference.trim()
            ? 'Add a reference so the payslip explains the item'
            : endPeriod && endPeriod < period
              ? 'End period is before the start'
              : '';
  const matches = employees.filter((x) => `${x.staffId} ${x.fullName} ${x.department}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <Modal
      title="Post a payroll item"
      subtitle={`Items post to ${payrollOpenPeriod.label} or later. Paid periods are locked.`}
      onClose={onClose}
      footer={
        <>
          {error && <span className="req-error">{error}</span>}
          <div className="req-footer-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={!!error || !draft} onClick={() => draft && postPayItems([draft]) && onClose()}>
              Post item
            </button>
          </div>
        </>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field wide">
          <span>Employee</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-control" style={{ maxWidth: 180 }} placeholder="Filter…" value={query} onChange={(ev) => setQuery(ev.target.value)} />
            <select className="form-control" value={staffId} onChange={(ev) => setStaffId(ev.target.value)}>
              {matches.map((x) => (
                <option key={x.staffId} value={x.staffId}>
                  {x.staffId} · {x.fullName} — {x.department}
                </option>
              ))}
            </select>
          </div>
        </label>
        <label className="req-field">
          <span>Pay item</span>
          <ComponentSelect value={componentId} onChange={(id) => (setComponentId(id), setRecurring(componentById(id).recurrence === 'recurring'))} />
        </label>
        {needsQty(c) ? (
          <label className="req-field">
            <span>{c.calc?.qtyLabel ?? 'Quantity'} — amount = KES {kes(amt)}</span>
            <input className="form-control" type="number" min={0} value={qty} onChange={(ev) => setQty(ev.target.value)} placeholder="0" />
          </label>
        ) : auto ? (
          <label className="req-field">
            <span>Amount (calculated)</span>
            <input className="form-control" value={`KES ${kes(amt)}`} readOnly />
          </label>
        ) : (
          <label className="req-field">
            <span>Amount (KES)</span>
            <input className="form-control" type="number" min={0} value={amount} onChange={(ev) => setAmount(ev.target.value)} placeholder="0" />
          </label>
        )}
        <div className="wide">
          <ComponentHint c={c} />
        </div>
        <label className="req-field">
          <span>{recurring && canRecur ? 'From period' : 'Pay period'}</span>
          <PeriodSelect value={period} periods={periods} onChange={(p) => setPeriod(p.key)} />
        </label>
        <label className="req-field">
          <span>Repeats</span>
          <select className="form-control" value={recurring && canRecur ? 'yes' : 'no'} disabled={!canRecur || c.recurrence === 'recurring'} onChange={(ev) => setRecurring(ev.target.value === 'yes')}>
            <option value="no">This period only (one-off)</option>
            <option value="yes">Every month until stopped</option>
          </select>
        </label>
        {recurring && canRecur && (
          <label className="req-field">
            <span>Last period (optional)</span>
            <select className="form-control" value={endPeriod} onChange={(ev) => setEndPeriod(ev.target.value)}>
              <option value="">Open-ended</option>
              {forwardPeriods(payrollOpenPeriod, 24).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="req-field wide">
          <span>Reference (printed on the payslip)</span>
          <input className="form-control" value={reference} onChange={(ev) => setReference(ev.target.value)} placeholder="e.g. Claim OT-1201, board minute 15/2026" />
        </label>
      </div>
      <Impact e={e} drafts={draft ? [draft] : []} />
    </Modal>
  );
};

/* ------------------------------------------------------------------ bulk */

const BulkModal: React.FC<{ employees: HREmployee[]; onClose: () => void }> = ({ employees, onClose }) => {
  const { postPayItems, payrollOpenPeriod } = useApp();
  const [componentId, setComponentId] = useState('BONUS');
  const [mode, setMode] = useState<'fixed' | 'pct'>('fixed');
  const [value, setValue] = useState('');
  const [dept, setDept] = useState('All');
  const [period, setPeriod] = useState(payrollOpenPeriod.key);
  const [reference, setReference] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState('');
  const c = componentById(componentId);
  const auto = !!c.calc && c.calc.method !== 'fixed';
  const depts = ['All', ...new Set(employees.map((e) => e.department))];
  const shown = employees.filter((e) => dept === 'All' || e.department === dept);
  const amountOf = (e: HREmployee) =>
    auto ? amountFor(c, e, period, Number(qty) || 0, 0).amount : mode === 'fixed' ? Number(value) || 0 : Math.round(((Number(value) || 0) / 100) * e.basicSalaryKes);
  const chosen = employees.filter((e) => picked.has(e.staffId));
  const total = chosen.reduce((s, e) => s + amountOf(e), 0);
  const zero = chosen.filter((e) => amountOf(e) <= 0);
  const error = !chosen.length ? 'Pick at least one employee' : auto && needsQty(c) && !(Number(qty) > 0) ? `Enter the ${(c.calc?.qtyLabel ?? 'quantity').toLowerCase()}` : !auto && !(Number(value) > 0) ? 'Enter an amount' : zero.length ? `${zero.length} employee(s) would get KES 0 (no basic salary) — untick them` : !reference.trim() ? 'Add a reference' : '';
  const toggle = (id: string) => setPicked((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));

  return (
    <Modal
      title="Bulk post an item"
      subtitle="One item for many employees — a fixed amount or a percentage of basic pay."
      onClose={onClose}
      width={880}
      footer={
        <>
          <div className="req-totals">
            <div>
              <span>Employees</span>
              <strong>{chosen.length}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>KES {kes(total)}</strong>
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
                postPayItems(
                  chosen.map((e) => ({ staffId: e.staffId, componentId, amount: amountOf(e), auto: auto || undefined, quantity: needsQty(c) ? Number(qty) : undefined, period, recurring: c.recurrence === 'recurring', reference, source: 'Bulk' }))
                ) && onClose()
              }
            >
              Post {chosen.length || ''} items
            </button>
          </div>
        </>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Pay item</span>
          <ComponentSelect value={componentId} onChange={setComponentId} />
        </label>
        <label className="req-field">
          <span>Pay period</span>
          <PeriodSelect value={period} periods={forwardPeriods(payrollOpenPeriod, 6)} onChange={(p) => setPeriod(p.key)} />
        </label>
        {auto ? (
          <label className="req-field">
            <span>{needsQty(c) ? `${c.calc?.qtyLabel ?? 'Quantity'} for each employee` : 'Amount'}</span>
            {needsQty(c) ? (
              <input className="form-control" type="number" min={0} value={qty} onChange={(ev) => setQty(ev.target.value)} />
            ) : (
              <input className="form-control" readOnly value={`Calculated per employee: ${calcSummary(c)}`} />
            )}
          </label>
        ) : (
        <label className="req-field">
          <span>Amount</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="form-control" style={{ maxWidth: 170 }} value={mode} onChange={(ev) => setMode(ev.target.value as 'fixed' | 'pct')}>
              <option value="fixed">Fixed KES each</option>
              <option value="pct">% of basic pay</option>
            </select>
            <input className="form-control" type="number" min={0} value={value} onChange={(ev) => setValue(ev.target.value)} placeholder={mode === 'fixed' ? 'KES' : '%'} />
          </div>
        </label>
        )}
        <label className="req-field">
          <span>Reference</span>
          <input className="form-control" value={reference} onChange={(ev) => setReference(ev.target.value)} placeholder="e.g. Q3 operations scorecard" />
        </label>
        <div className="wide">
          <ComponentHint c={c} />
        </div>
      </div>
      <div>
        <div className="pr-toolbar" style={{ marginBottom: 8 }}>
          <select className="form-control" value={dept} onChange={(ev) => setDept(ev.target.value)} aria-label="Department">
            {depts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={() => setPicked(new Set([...picked, ...shown.map((e) => e.staffId)]))}>
            Select all shown ({shown.length})
          </button>
          <button className="btn btn-secondary" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
        <div className="pr-checklist">
          {shown.map((e) => (
            <label key={e.staffId}>
              <input type="checkbox" checked={picked.has(e.staffId)} onChange={() => toggle(e.staffId)} />
              <span>
                {e.fullName} <span className="pr-muted">{picked.has(e.staffId) ? `KES ${kes(amountOf(e))}` : e.staffId}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ import */

const SAMPLE = `staff_id,amount,reference
KHE-0251,4500,Night shift allowance — claim 77
KHE-0263,3800,Night shift allowance — claim 78
KHE-0270,5200,Night shift allowance — claim 79`;

const ImportModal: React.FC<{ employees: HREmployee[]; onClose: () => void }> = ({ employees, onClose }) => {
  const { postPayItems, payrollOpenPeriod } = useApp();
  const [componentId, setComponentId] = useState('OT_EXTRA');
  const [period, setPeriod] = useState(payrollOpenPeriod.key);
  const [text, setText] = useState(SAMPLE);
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^staff/i.test(l))
      .map((l, i) => {
        const [id, amt, ...ref] = l.split(/[,\t;]/).map((x) => x.trim());
        const e = employees.find((x) => x.staffId.toUpperCase() === (id ?? '').toUpperCase());
        const typed = Number((amt ?? '').replace(/[^\d.]/g, ''));
        const c = componentById(componentId);
        const calc = amountFor(c, e, period, needsQty(c) ? typed : 0, typed);
        const amount = calc.amount;
        const quantity = needsQty(c) ? typed : undefined;
        const dup = seen.has(id);
        seen.add(id);
        const error = !e ? 'Unknown staff ID for this company' : calc.error ? `Formula: ${calc.error}` : !(amount > 0) ? 'Amount missing' : dup ? 'Listed twice' : '';
        return { line: i + 1, id, e, amount, quantity, reference: ref.join(', ') || c.name, error };
      });
  }, [text, employees, componentId, period]);
  const valid = rows.filter((r) => !r.error);
  return (
    <Modal
      title="Import items from a sheet"
      subtitle="Paste rows from Excel or a CSV: staff ID, amount (or hours / nights for calculated items), reference. Rows with problems are skipped."
      onClose={onClose}
      width={880}
      footer={
        <>
          <div className="req-totals">
            <div>
              <span>Ready</span>
              <strong>{valid.length}</strong>
            </div>
            <div>
              <span>Skipped</span>
              <strong>{rows.length - valid.length}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>KES {kes(valid.reduce((s, r) => s + r.amount, 0))}</strong>
            </div>
          </div>
          <div className="req-footer-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!valid.length}
              onClick={() =>
                postPayItems(
                  valid.map((r) => {
                    const c = componentById(componentId);
                    const auto = !!c.calc && c.calc.method !== 'fixed';
                    return { staffId: r.e!.staffId, componentId, amount: r.amount, auto: auto || undefined, quantity: r.quantity, period, recurring: false, reference: r.reference, source: 'Import' as const };
                  })
                ) && onClose()
              }
            >
              Post {valid.length} items
            </button>
          </div>
        </>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Pay item for every row</span>
          <ComponentSelect value={componentId} onChange={setComponentId} />
        </label>
        <label className="req-field">
          <span>Pay period</span>
          <PeriodSelect value={period} periods={forwardPeriods(payrollOpenPeriod, 3)} onChange={(p) => setPeriod(p.key)} />
        </label>
        <label className="req-field wide">
          <span>Rows</span>
          <textarea className="form-control" rows={6} value={text} onChange={(ev) => setText(ev.target.value)} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }} />
        </label>
      </div>
      <table className="hr-table pr-table">
        <thead>
          <tr>
            <th>Row</th>
            <th>Employee</th>
            <th className="num">Amount</th>
            <th>Reference</th>
            <th>Check</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.line}>
              <td>{r.line}</td>
              <td>{r.e ? `${r.e.staffId} · ${r.e.fullName}` : r.id}</td>
              <td className="num">{r.amount ? kes(r.amount) : '—'}</td>
              <td>{r.reference}</td>
              <td>{r.error ? <span className="digicraft-status-pill danger">{r.error}</span> : <span className="digicraft-status-pill success">OK</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
};

/* ------------------------------------------------------------------ tab */

export const PayrollItems: React.FC = () => {
  const { payItems, hrEmployees, selectedOrgId, payrollOpenPeriod, cancelPayItem, endRecurringPayItem, payrollCtx } = useApp();
  const [modal, setModal] = useState<'one' | 'bulk' | 'import' | null>(null);
  const periods = [...forwardPeriods(payrollOpenPeriod, 2).slice(1).reverse(), ...recentPeriods(payrollOpenPeriod, 6)];
  const [period, setPeriod] = useState(payrollOpenPeriod.key);
  const [scope, setScope] = useState<'period' | 'all'>('period');
  const [category, setCategory] = useState<'All' | ComponentCategory>('All');
  const [q, setQ] = useState('');
  const sel = periods.find((p) => p.key === period) ?? periodOf(payrollOpenPeriod.year, payrollOpenPeriod.month);

  const employees = useMemo(
    () => payableIn(hrEmployees, selectedOrgId, payrollOpenPeriod.year, payrollOpenPeriod.month),
    [hrEmployees, selectedOrgId, payrollOpenPeriod]
  );
  const staff = (id: string) => hrEmployees.find((e) => e.staffId === id);
  const companyItems = payItems.filter((i) => i.orgId === selectedOrgId);
  const inPeriod = new Set(
    [...new Set(companyItems.map((i) => i.staffId))].flatMap((id) => itemsFor(payrollCtx, id, sel.key)).map((i) => i.id)
  );
  const list = companyItems
    .filter((i) => (scope === 'all' ? true : inPeriod.has(i.id)))
    .filter((i) => category === 'All' || componentById(i.componentId).category === category)
    .filter((i) => !q || `${i.id} ${i.staffId} ${staff(i.staffId)?.fullName ?? ''} ${componentById(i.componentId).name} ${i.reference}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.period.localeCompare(a.period) || b.id.localeCompare(a.id));
  const pg = usePaged(list, 25, `${scope}|${period}|${category}|${q}`);

  const status = (i: PayItem) => {
    if (i.status === 'CANCELLED') return { label: 'Cancelled', cls: 'danger' };
    if (i.recurring) {
      if (i.endPeriod && i.endPeriod < payrollOpenPeriod.key) return { label: `Ended ${i.endPeriod}`, cls: 'info' };
      if (i.period > payrollOpenPeriod.key) return { label: `Starts ${i.period}`, cls: 'info' };
      return { label: i.endPeriod ? `Monthly to ${i.endPeriod}` : 'Monthly', cls: 'primary' };
    }
    if (i.period < payrollOpenPeriod.key) return { label: `Paid ${i.period}`, cls: 'success' };
    if (i.period === payrollOpenPeriod.key) return { label: 'In this run', cls: 'warning' };
    return { label: `Scheduled ${i.period}`, cls: 'info' };
  };
  const editable = (i: PayItem) => i.status === 'ACTIVE' && (i.recurring ? !i.endPeriod || i.endPeriod >= payrollOpenPeriod.key : i.period >= payrollOpenPeriod.key);

  const thisRun = companyItems.filter((i) => inPeriod.has(i.id));
  const sumCat = (cats: ComponentCategory[]) => thisRun.filter((i) => cats.includes(componentById(i.componentId).category)).reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Open period</div>
          <div className="hr-stat-value">{payrollOpenPeriod.label}</div>
          <div className="hr-stat-subtext">Earlier periods are paid and locked</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Items in {sel.label}</div>
          <div className="hr-stat-value">{thisRun.length}</div>
          <div className="hr-stat-subtext">{thisRun.filter((i) => i.recurring).length} recurring · {thisRun.filter((i) => !i.recurring).length} one-off</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Earnings &amp; benefits posted</div>
          <div className="hr-stat-value" style={{ color: '#059669' }}>
            KES {kes(sumCat(['earning', 'reimbursement', 'benefit_in_kind']))}
          </div>
          <div className="hr-stat-subtext">Benefits are taxed but not paid out</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Deductions posted</div>
          <div className="hr-stat-value" style={{ color: '#dc2626' }}>
            KES {kes(sumCat(['pretax', 'deduction']))}
          </div>
          <div className="hr-stat-subtext">Loans are managed under Loans &amp; Advances</div>
        </div>
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Payroll items</h3>
            <p>Allowances, bonuses, benefits and deductions posted on top of contract pay. Each item’s PAYE / NSSF / SHIF / housing levy treatment comes from its pay item type.</p>
          </div>
          <div className="pr-toolbar">
            <button className="btn btn-primary" onClick={() => setModal('one')}>
              <Plus size={15} /> Post item
            </button>
            <button className="btn btn-secondary" onClick={() => setModal('bulk')}>
              <Users size={15} /> Bulk post
            </button>
            <button className="btn btn-secondary" onClick={() => setModal('import')}>
              <FileUp size={15} /> Import sheet
            </button>
          </div>
        </div>
        <div className="pr-toolbar" style={{ marginBottom: 12 }}>
          <select className="form-control" value={scope} onChange={(ev) => setScope(ev.target.value as 'period' | 'all')} aria-label="Show">
            <option value="period">In force for a period</option>
            <option value="all">Everything posted</option>
          </select>
          {scope === 'period' && <PeriodSelect value={sel.key} periods={periods} onChange={(p) => setPeriod(p.key)} />}
          <select className="form-control" value={category} onChange={(ev) => setCategory(ev.target.value as 'All' | ComponentCategory)} aria-label="Type">
            <option value="All">All types</option>
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {CATEGORY_LABEL[g]}
              </option>
            ))}
          </select>
          <div className="form-input-wrapper grow">
            <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)' }} />
            <input className="form-control" style={{ paddingLeft: 30 }} placeholder="Search employee, item or reference" value={q} onChange={(ev) => setQ(ev.target.value)} />
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Employee</th>
                <th>Pay item</th>
                <th>Counts towards</th>
                <th className="num">Amount</th>
                <th>Period</th>
                <th>Status</th>
                <th>Posted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 28, color: 'var(--text-tertiary)' }}>
                    <ClipboardList size={18} style={{ verticalAlign: 'middle' }} /> No items match.
                  </td>
                </tr>
              )}
              {pg.rows.map((i) => {
                const c = componentById(i.componentId);
                const s = status(i);
                const e = staff(i.staffId);
                return (
                  <tr key={i.id} style={i.status === 'CANCELLED' ? { opacity: 0.55 } : undefined}>
                    <td>
                      <strong>{i.id}</strong>
                      <div className="muted">{i.source}</div>
                    </td>
                    <td>
                      {e?.fullName ?? i.staffId}
                      <div className="muted">
                        {i.staffId} · {e?.department}
                      </div>
                    </td>
                    <td>
                      {c.name}
                      <div className="muted">{i.reference}</div>
                      {i.note && <div className="muted">Note: {i.note}</div>}
                    </td>
                    <td>
                      <Flags c={c} />
                    </td>
                    <td className="num">
                      <strong style={{ color: c.category === 'deduction' || c.category === 'pretax' ? '#dc2626' : undefined }}>{kes(i.amount)}</strong>
                      {i.auto && <div className="muted">{i.quantity ? `${i.quantity} ${(c.calc?.qtyLabel ?? 'units').toLowerCase()} · ` : ''}calculated</div>}
                    </td>
                    <td>{i.recurring ? `${i.period} →${i.endPeriod ? ' ' + i.endPeriod : ''}` : i.period}</td>
                    <td>
                      <span className={`digicraft-status-pill ${s.cls}`}>{s.label}</span>
                    </td>
                    <td>
                      <div className="muted">
                        {i.postedBy}
                        <br />
                        {i.postedOn}
                      </div>
                    </td>
                    <td>
                      {editable(i) && !i.recurring && (
                        <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => cancelPayItem(i.id, 'Cancelled before payroll was posted')}>
                          Cancel
                        </button>
                      )}
                      {editable(i) && i.recurring && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => (i.period >= payrollOpenPeriod.key ? cancelPayItem(i.id, 'Cancelled before it started') : endRecurringPayItem(i.id, periodOf(payrollOpenPeriod.year, payrollOpenPeriod.month - 1).key))}
                          title="Stop from the open period onwards"
                        >
                          Stop
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="items" />
        <div className="pr-muted" style={{ marginTop: 8 }}>
          One-off items are paid once in their period and then locked. Recurring items stay on every payroll until stopped. Loans, the welfare fund and SACCO contributions are handled by the engine.
        </div>
      </div>

      {modal === 'one' && <PostItemModal employees={employees} onClose={() => setModal(null)} />}
      {modal === 'bulk' && <BulkModal employees={employees} onClose={() => setModal(null)} />}
      {modal === 'import' && <ImportModal employees={employees} onClose={() => setModal(null)} />}
    </>
  );
};
