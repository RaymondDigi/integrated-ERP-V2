import React, { useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { CATEGORY_LABEL, currentComponents, LOAN_COMPONENTS, type ComponentCategory, type PayCalc, type PayComponentType } from '../../../data/payComponents';
import { calcAmount, formulaVars, payableIn } from '../../../data/payrollEngine';
import { checkFormula, FORMULA_VARS } from '../../../utils/formula';
import { Pager, usePaged } from '../../../components/common/Pager';
import { Flags, forwardPeriods, Modal, PeriodSelect } from './shared';
import { kes } from './reports';

const CATS: ComponentCategory[] = ['earning', 'reimbursement', 'benefit_in_kind', 'pretax', 'deduction'];

export const calcSummary = (c: PayComponentType) => {
  const k = c.calc;
  if (c.system) return 'Worked out by payroll';
  if (!k || k.method === 'fixed') return 'Amount typed when posting';
  if (k.method === 'percent') return `${k.percent}% of ${k.base === 'PENSIONABLE' ? 'basic + allowances' : 'basic'}`;
  if (k.method === 'rate') return `${k.unit === 'DAILY' ? 'Day' : 'Hour'} rate × ${k.multiplier} × ${(k.qtyLabel ?? 'quantity').toLowerCase()}`;
  return `= ${k.expression}`;
};

/** Whether posting needs a quantity (hours, nights…). */
export const needsQty = (c: PayComponentType) => c.calc?.method === 'rate' || (c.calc?.method === 'formula' && /\bQTY\b/i.test(c.calc.expression ?? ''));

type Mode = 'create' | 'edit' | 'duplicate';

const Editor: React.FC<{ mode: Mode; source?: PayComponentType; onClose: () => void }> = ({ mode, source, onClose }) => {
  const { payComponents, savePayComponent, payrollOpenPeriod, tenantEmployees } = useApp();
  const current = currentComponents(payComponents);
  const blank: PayComponentType = { id: '', name: '', category: 'earning', recurrence: 'one_off', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, note: '', calc: { method: 'fixed' }, status: 'ACTIVE' };
  const start: PayComponentType =
    mode === 'create' ? blank : mode === 'duplicate' && source ? { ...source, id: `${source.id}_2`.slice(0, 20), name: `${source.name} (copy)`, system: false, custom: true, status: 'ACTIVE' } : source!;
  const [c, setC] = useState<PayComponentType>(start);
  const [from, setFrom] = useState(payrollOpenPeriod.key);
  const set = (patch: Partial<PayComponentType>) => setC((x) => ({ ...x, ...patch }));
  const setCalc = (patch: Partial<PayCalc>) => setC((x) => ({ ...x, calc: { ...(x.calc ?? { method: 'fixed' }), ...patch } }));
  const locked = !!c.system;
  const calc = c.calc ?? { method: 'fixed' };

  const people = tenantEmployees.filter((e) => e.basicSalaryKes > 0 && payableIn([e], e.orgId, payrollOpenPeriod.year, payrollOpenPeriod.month).length);
  const [sampleId, setSampleId] = useState(people[0]?.staffId ?? '');
  const [qty, setQty] = useState(8);
  const sample = people.find((e) => e.staffId === sampleId);

  // Checks before saving: unique code and name, a working formula
  const code = c.id.trim().toUpperCase();
  const problems: string[] = [];
  if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(code)) problems.push('Code: 2–20 capital letters, digits or _ starting with a letter');
  else if (mode !== 'edit' && current.some((x) => x.id === code)) problems.push(`Code ${code} is already used by “${current.find((x) => x.id === code)!.name}”`);
  const twin = current.find((x) => x.id !== (mode === 'edit' ? c.id : '') && x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
  if (!c.name.trim()) problems.push('Name is required');
  else if (twin) problems.push(`A pay item called “${twin.name}” already exists (${twin.id}) — names must be unique`);
  if (calc.method === 'formula') {
    const err = checkFormula(calc.expression ?? '');
    if (err) problems.push(`Formula: ${err}`);
  }
  if (calc.method === 'percent' && !(Number(calc.percent) > 0)) problems.push('Enter the percentage');
  if (calc.method === 'rate' && !(Number(calc.multiplier) > 0)) problems.push('Enter the rate multiplier');
  if (c.paye === 'exempt_up_to_cap' && !(Number(c.payeExemptCap) > 0)) problems.push('Enter the tax-free limit');
  if (!c.note.trim()) problems.push('Explain the treatment (printed on payslip details)');

  const example = useMemo(() => {
    if (!sample || calc.method === 'fixed') return null;
    try {
      return calcAmount(calc, formulaVars(sample, payrollOpenPeriod.year, payrollOpenPeriod.month), qty);
    } catch (e) {
      return (e as Error).message;
    }
  }, [sample, calc, qty, payrollOpenPeriod]);
  const versions = payComponents.filter((x) => x.id === c.id).sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
  const insert = (v: string) => setCalc({ expression: `${calc.expression ?? ''}${calc.expression && !/\s$/.test(calc.expression) ? ' ' : ''}${v}` });
  const deduction = c.category === 'deduction';
  const pretax = c.category === 'pretax';

  const save = () => {
    const err = savePayComponent({ ...c, id: code, calc: locked ? c.calc : calc }, mode === 'edit' ? 'edit' : 'create', from);
    if (!err) onClose();
  };

  return (
    <Modal
      title={mode === 'create' ? 'New pay item' : mode === 'duplicate' ? `Duplicate ${source?.name}` : `Edit ${c.name}`}
      subtitle={mode === 'edit' ? `Saving creates version ${Math.max(...versions.map((v) => v.version ?? 1)) + 1} from the period you choose. Paid periods keep the version they used.` : 'Pay item codes and names must be unique.'}
      onClose={onClose}
      width={900}
      footer={
        <>
          {problems.length > 0 && <span className="req-error">{problems[0]}{problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}</span>}
          <div className="req-footer-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={problems.length > 0} onClick={save}>
              {mode === 'edit' ? 'Save new version' : 'Create pay item'}
            </button>
          </div>
        </>
      }
    >
      {locked && <div className="pr-note">This item is worked out by the payroll engine. You can change its name and explanation; its calculation and statutory treatment are fixed.</div>}
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Code</span>
          <input className="form-control" value={c.id} disabled={mode === 'edit'} onChange={(ev) => set({ id: ev.target.value.toUpperCase().replace(/\s+/g, '_') })} placeholder="e.g. NIGHT_SHIFT" />
        </label>
        <label className="req-field">
          <span>Name</span>
          <input className="form-control" value={c.name} onChange={(ev) => set({ name: ev.target.value })} placeholder="e.g. Night shift allowance" />
        </label>
        <label className="req-field">
          <span>Type</span>
          <select
            className="form-control"
            value={c.category}
            disabled={locked || mode === 'edit'}
            onChange={(ev) => {
              const cat = ev.target.value as ComponentCategory;
              set(
                cat === 'deduction'
                  ? { category: cat, paye: 'exempt', nssf: false, shif: false, ahl: false, priority: 6 }
                  : cat === 'pretax'
                    ? { category: cat, paye: 'exempt', nssf: false, shif: false, ahl: false, taxEffect: 'pension' }
                    : cat === 'benefit_in_kind'
                      ? { category: cat, paye: 'taxable', nssf: false, shif: false, ahl: false }
                      : cat === 'reimbursement'
                        ? { category: cat, paye: 'exempt', nssf: false, shif: false, ahl: false }
                        : { category: cat, paye: 'taxable', shif: true, ahl: true }
              );
            }}
          >
            {CATS.map((k) => (
              <option key={k} value={k}>
                {CATEGORY_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="req-field">
          <span>Repeats</span>
          <select className="form-control" value={c.recurrence} disabled={locked} onChange={(ev) => set({ recurrence: ev.target.value as PayComponentType['recurrence'] })}>
            <option value="one_off">One-off — paid once, then locked</option>
            <option value="recurring">Monthly until stopped</option>
            <option value="either">Either — chosen when posting</option>
          </select>
        </label>
      </div>

      {!locked && (
        <div>
          <div className="req-section-title">How the amount is worked out</div>
          <div className="pr-toolbar" style={{ marginBottom: 10 }}>
            {(
              [
                ['fixed', 'Typed when posting'],
                ['percent', 'Percentage'],
                ['rate', 'Rate × quantity'],
                ['formula', 'Formula']
              ] as const
            ).map(([m, label]) => (
              <button key={m} className={`btn ${calc.method === m ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCalc({ method: m, expression: m === 'formula' ? calc.expression ?? 'BASIC * 5%' : calc.expression })}>
                {label}
              </button>
            ))}
          </div>
          <div className="pr-form-grid">
            {calc.method === 'percent' && (
              <>
                <label className="req-field">
                  <span>Percentage</span>
                  <input className="form-control" type="number" min={0} step={0.5} value={calc.percent ?? ''} onChange={(ev) => setCalc({ percent: Number(ev.target.value) })} />
                </label>
                <label className="req-field">
                  <span>Of</span>
                  <select className="form-control" value={calc.base ?? 'BASIC'} onChange={(ev) => setCalc({ base: ev.target.value as PayCalc['base'] })}>
                    <option value="BASIC">Basic salary</option>
                    <option value="PENSIONABLE">Basic + house + transport</option>
                  </select>
                </label>
              </>
            )}
            {calc.method === 'rate' && (
              <>
                <label className="req-field">
                  <span>Rate</span>
                  <select className="form-control" value={calc.unit ?? 'HOURLY'} onChange={(ev) => setCalc({ unit: ev.target.value as PayCalc['unit'] })}>
                    <option value="HOURLY">Hour rate (basic ÷ 225)</option>
                    <option value="DAILY">Day rate (monthly pay ÷ 30)</option>
                  </select>
                </label>
                <label className="req-field">
                  <span>Multiplier</span>
                  <input className="form-control" type="number" min={0} step={0.25} value={calc.multiplier ?? ''} onChange={(ev) => setCalc({ multiplier: Number(ev.target.value) })} />
                </label>
              </>
            )}
            {calc.method === 'formula' && (
              <label className="req-field wide">
                <span>Formula</span>
                <textarea className="form-control" rows={2} value={calc.expression ?? ''} onChange={(ev) => setCalc({ expression: ev.target.value })} style={{ fontFamily: 'var(--font-mono, monospace)' }} />
                <div className="pr-chips" style={{ marginTop: 4 }}>
                  {FORMULA_VARS.map((v) => (
                    <button key={v.name} type="button" className="pr-chip on" style={{ cursor: 'pointer' }} title={v.about} onClick={() => insert(v.name)}>
                      {v.name}
                    </button>
                  ))}
                  {['MIN(a, b)', 'MAX(a, b)', 'ROUND(x, 500)', 'IF(YEARS >= 5, a, b)'].map((f) => (
                    <button key={f} type="button" className="pr-chip cap" style={{ cursor: 'pointer' }} onClick={() => insert(f)}>
                      {f}
                    </button>
                  ))}
                </div>
                <span className="pr-muted">Use + − * / and brackets; 10% means 0.10. Example: MIN(YEARS, 15) * 1000</span>
              </label>
            )}
            {needsQty({ ...c, calc }) && (
              <label className="req-field">
                <span>Quantity is counted in</span>
                <input className="form-control" value={calc.qtyLabel ?? ''} onChange={(ev) => setCalc({ qtyLabel: ev.target.value })} placeholder="Hours, Nights, Units" />
              </label>
            )}
          </div>
          {calc.method !== 'fixed' && sample && (
            <div className="pr-note" style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>Try it on</span>
              <select className="form-control" style={{ width: 'auto' }} value={sampleId} onChange={(ev) => setSampleId(ev.target.value)}>
                {people.map((e) => (
                  <option key={e.staffId} value={e.staffId}>
                    {e.fullName} (basic {kes(e.basicSalaryKes)})
                  </option>
                ))}
              </select>
              {needsQty({ ...c, calc }) && (
                <>
                  <span>with</span>
                  <input className="form-control" style={{ width: 80 }} type="number" value={qty} onChange={(ev) => setQty(Number(ev.target.value))} />
                  <span>{(calc.qtyLabel ?? 'units').toLowerCase()}</span>
                </>
              )}
              <strong>{typeof example === 'number' ? `= KES ${kes(example)}` : example ? `Error: ${example}` : ''}</strong>
            </div>
          )}
        </div>
      )}

      {!locked && (
        <div>
          <div className="req-section-title">Statutory treatment</div>
          <div className="pr-form-grid">
            {!deduction && !pretax && (
              <>
                <label className="req-field">
                  <span>PAYE</span>
                  <select className="form-control" value={c.paye} onChange={(ev) => set({ paye: ev.target.value as PayComponentType['paye'] })}>
                    <option value="taxable">Taxable</option>
                    <option value="exempt">Not taxable</option>
                    <option value="exempt_up_to_cap">Tax-free up to a limit</option>
                  </select>
                </label>
                {c.paye === 'exempt_up_to_cap' ? (
                  <label className="req-field">
                    <span>Tax-free limit (KES a month)</span>
                    <input className="form-control" type="number" value={c.payeExemptCap ?? ''} onChange={(ev) => set({ payeExemptCap: Number(ev.target.value) })} />
                  </label>
                ) : (
                  <div />
                )}
                <div className="wide" style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
                  {(
                    [
                      ['nssf', 'NSSF pensionable'],
                      ['shif', 'SHIF applies'],
                      ['ahl', 'Housing levy applies']
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="checkbox" checked={!!c[k]} disabled={c.category === 'benefit_in_kind' && k !== 'ahl'} onChange={(ev) => set({ [k]: ev.target.checked })} />
                      {label}
                    </label>
                  ))}
                </div>
              </>
            )}
            {deduction && (
              <label className="req-field">
                <span>Order when the two-thirds limit bites</span>
                <select className="form-control" value={c.priority ?? 6} onChange={(ev) => set({ priority: Number(ev.target.value) })}>
                  <option value={2}>2 — court / garnishee orders</option>
                  <option value={3}>3 — HELB</option>
                  <option value={4}>4 — employer loans and advances</option>
                  <option value={5}>5 — SACCO and bank check-offs</option>
                  <option value={6}>6 — other voluntary deductions</option>
                </select>
              </label>
            )}
            {pretax && (
              <label className="req-field">
                <span>Tax effect</span>
                <select className="form-control" value={c.taxEffect ?? 'pension'} onChange={(ev) => set({ taxEffect: ev.target.value as PayComponentType['taxEffect'] })}>
                  <option value="pension">Pension — reduces taxable pay (capped)</option>
                  <option value="pmf">Post-retirement medical fund — 15% relief</option>
                  <option value="mortgage_interest">Mortgage interest — reduces taxable pay (capped)</option>
                </select>
              </label>
            )}
            <div className="wide" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className="pr-muted">Preview:</span> <Flags c={c} />
            </div>
          </div>
        </div>
      )}

      <div className="pr-form-grid">
        <label className="req-field wide">
          <span>Why it is treated this way (shown on payslip details and in summaries)</span>
          <input className="form-control" value={c.note} onChange={(ev) => set({ note: ev.target.value })} />
        </label>
        <label className="req-field">
          <span>{mode === 'edit' ? 'New version applies from' : 'Can be posted from'}</span>
          <PeriodSelect value={from} periods={forwardPeriods(payrollOpenPeriod, 6)} onChange={(p) => setFrom(p.key)} />
        </label>
      </div>

      {mode === 'edit' && versions.length > 0 && (
        <div>
          <div className="req-section-title">Version history</div>
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>From</th>
                <th>Name</th>
                <th>Calculation</th>
                <th>Counts towards</th>
                <th>Changed</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={`${v.version}-${v.effectiveFrom}`}>
                  <td>v{v.version}</td>
                  <td>{v.effectiveFrom}</td>
                  <td>
                    {v.name}
                    {v.status === 'INACTIVE' && <div className="muted">Inactive</div>}
                  </td>
                  <td>{calcSummary(v)}</td>
                  <td>
                    <Flags c={v} />
                  </td>
                  <td className="muted">{v.changedBy ? `${v.changedBy}, ${v.changedOn}` : 'Standard catalogue'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};

export const PayItemSetup: React.FC = () => {
  const { payComponents, payItems, setPayComponentStatus, deletePayComponent } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'All' | ComponentCategory>('All');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'All'>('All');
  const [origin, setOrigin] = useState<'All' | 'standard' | 'company'>('All');
  const [editing, setEditing] = useState<{ mode: Mode; source?: PayComponentType } | null>(null);
  const list = currentComponents(payComponents)
    .filter((c) => !LOAN_COMPONENTS.includes(c.id))
    .filter((c) => cat === 'All' || c.category === cat)
    .filter((c) => status === 'All' || (c.status ?? 'ACTIVE') === status)
    .filter((c) => origin === 'All' || (origin === 'company') === !!c.custom)
    .filter((c) => !q || `${c.id} ${c.name} ${c.note}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => CATS.indexOf(a.category) - CATS.indexOf(b.category) || a.name.localeCompare(b.name));
  const pg = usePaged(list, 10, `${q}|${cat}|${status}|${origin}`);
  const used = (id: string) => payItems.filter((i) => i.componentId === id && i.status === 'ACTIVE').length;
  const all = currentComponents(payComponents).filter((c) => !LOAN_COMPONENTS.includes(c.id));

  return (
    <>
      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Pay items</div>
          <div className="hr-stat-value">{all.length}</div>
          <div className="hr-stat-subtext">{all.filter((c) => c.custom).length} created by the company</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Calculated by formula</div>
          <div className="hr-stat-value">{all.filter((c) => c.calc && c.calc.method !== 'fixed' && !c.system).length}</div>
          <div className="hr-stat-subtext">Percentage, rate × quantity or formula</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Changed this year</div>
          <div className="hr-stat-value">{new Set(payComponents.filter((c) => (c.version ?? 1) > 1 || c.changedBy).map((c) => c.id)).size}</div>
          <div className="hr-stat-subtext">Each change is a new version</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Inactive</div>
          <div className="hr-stat-value">{all.filter((c) => c.status === 'INACTIVE').length}</div>
          <div className="hr-stat-subtext">Kept for history, cannot be posted</div>
        </div>
      </div>

      <div className="hr-table-card">
        <div className="pr-card-head" style={{ padding: '14px 16px 0', marginBottom: 10 }}>
          <div>
            <h3>Pay item setup</h3>
            <p>Every allowance, benefit and deduction payroll can post, with its formula and how it counts for PAYE, NSSF, SHIF and the housing levy. Codes and names are unique.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setEditing({ mode: 'create' })}>
            <Plus size={15} /> New pay item
          </button>
        </div>
        <div className="pr-toolbar" style={{ padding: '0 16px 12px' }}>
          <select className="form-control" value={cat} onChange={(ev) => setCat(ev.target.value as typeof cat)} aria-label="Type">
            <option value="All">All types</option>
            {CATS.map((k) => (
              <option key={k} value={k}>
                {CATEGORY_LABEL[k]}
              </option>
            ))}
          </select>
          <select className="form-control" value={origin} onChange={(ev) => setOrigin(ev.target.value as typeof origin)} aria-label="Source">
            <option value="All">Standard and company items</option>
            <option value="standard">Standard catalogue</option>
            <option value="company">Created by the company</option>
          </select>
          <select className="form-control" value={status} onChange={(ev) => setStatus(ev.target.value as typeof status)} aria-label="Status">
            <option value="All">Active and inactive</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <div className="form-input-wrapper grow">
            <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)' }} />
            <input className="form-control" style={{ paddingLeft: 30 }} placeholder="Search code or name" value={q} onChange={(ev) => setQ(ev.target.value)} />
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Pay item</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Counts towards</th>
                <th>Version</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.rows.map((c) => (
                <tr key={c.id} style={c.status === 'INACTIVE' ? { opacity: 0.6 } : undefined}>
                  <td>
                    <strong>{c.name}</strong>
                    <div className="muted">
                      {c.id}
                      {c.custom ? ' · company item' : c.system ? ' · payroll engine' : ''}
                    </div>
                  </td>
                  <td>
                    {CATEGORY_LABEL[c.category]}
                    <div className="muted">{c.recurrence === 'one_off' ? 'One-off' : c.recurrence === 'recurring' ? 'Monthly' : 'Either'}</div>
                  </td>
                  <td style={{ maxWidth: 240 }}>{calcSummary(c)}</td>
                  <td>
                    <Flags c={c} />
                  </td>
                  <td>
                    v{c.version ?? 1}
                    <div className="muted">from {c.effectiveFrom}</div>
                  </td>
                  <td>
                    <span className={`digicraft-status-pill ${c.status === 'INACTIVE' ? 'info' : 'success'}`}>{c.status === 'INACTIVE' ? 'Inactive' : 'Active'}</span>
                    {used(c.id) > 0 && <div className="muted">{used(c.id)} posted</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-secondary" style={{ padding: '4px 8px' }} title="Edit" aria-label={`Edit ${c.name}`} onClick={() => setEditing({ mode: 'edit', source: c })}>
                      <Pencil size={13} />
                    </button>{' '}
                    {!c.system && (
                      <button className="btn btn-secondary" style={{ padding: '4px 8px' }} title="Duplicate" aria-label={`Duplicate ${c.name}`} onClick={() => setEditing({ mode: 'duplicate', source: c })}>
                        <Copy size={13} />
                      </button>
                    )}{' '}
                    {!c.system && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px' }}
                        title={c.status === 'INACTIVE' ? 'Activate' : 'Deactivate'}
                        aria-label={c.status === 'INACTIVE' ? `Activate ${c.name}` : `Deactivate ${c.name}`}
                        onClick={() => setPayComponentStatus(c.id, c.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE')}
                      >
                        <Power size={13} />
                      </button>
                    )}{' '}
                    {c.custom && !used(c.id) && (
                      <button className="btn btn-secondary" style={{ padding: '4px 8px' }} title="Delete" aria-label={`Delete ${c.name}`} onClick={() => deletePayComponent(c.id)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {pg.total === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>
                    No pay items match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="pay items" />
      </div>
      {editing && <Editor mode={editing.mode} source={editing.source} onClose={() => setEditing(null)} />}
    </>
  );
};
