import React, { useMemo, useState } from 'react';
import { Copy, History, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { CONTRACT_COLUMNS, INITIAL_LEAVE_TYPE_VERSIONS, cell, type ContractColumn, type EntitlementRow, type LeaveCode, type LeaveTypeVersion } from '../../../data/leaveConfig';
import {
  addDays,
  carryForwardMonths,
  codeOf,
  holidayCreditDays,
  leaveCodes,
  matrixRow,
  maxCarryForward,
  policyAt,
  todayIso,
  typeAt,
  validateLeaveTypeDraft
} from '../../../data/leaveEngine';
import { usePaged, Pager } from '../../../components/common/Pager';
import { Field, Messages, Modal, fmtDate, fmtNum } from './shared';

const yesNo = (b: boolean) => (b ? 'Yes' : 'No');
type Mode = 'edit' | 'new' | 'duplicate';

/** Starting point for a brand-new type: a paid, granted, supervisor-approved type with no entitlement yet. */
const blankType = (): LeaveTypeVersion => ({
  ...(INITIAL_LEAVE_TYPE_VERSIONS.find((t) => t.code === 'CL') as LeaveTypeVersion),
  code: '',
  name: '',
  description: '',
  version: 1,
  effectiveFrom: todayIso(),
  effectiveTo: undefined,
  custom: true,
  changedBy: 'HR office',
  changeNote: 'New leave type'
});

export const TypesTab: React.FC = () => {
  const { leaveTypeVersions, leaveCfg, leaveRequests, saveLeaveTypeVersion, deleteLeaveType } = useApp();
  const [editing, setEditing] = useState<{ base: LeaveTypeVersion; mode: Mode } | null>(null);
  const [historyFor, setHistoryFor] = useState<LeaveCode | 'ALL'>('ALL');
  const today = todayIso();
  const policy = policyAt(today, leaveCfg);
  const codes = leaveCodes(leaveCfg);
  const current = codes.map((c) => typeAt(c, today, leaveCfg));
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    leaveRequests.forEach((r) => {
      const c = codeOf(r.leaveType, leaveCfg);
      m.set(c, (m.get(c) ?? 0) + 1);
    });
    return m;
  }, [leaveRequests, leaveCfg]);
  const history = useMemo(
    () =>
      [...leaveTypeVersions]
        .filter((t) => historyFor === 'ALL' || t.code === historyFor)
        .sort((a, b) => a.code.localeCompare(b.code) || b.version - a.version),
    [leaveTypeVersions, historyFor]
  );
  const hp = usePaged(history, 10, historyFor);

  const deactivate = (t: LeaveTypeVersion) =>
    saveLeaveTypeVersion({ ...t, status: 'Inactive', effectiveFrom: addDays(today, 1), changedBy: 'HR office', changeNote: 'Deactivated; history kept' });
  const reactivate = (t: LeaveTypeVersion) =>
    saveLeaveTypeVersion({ ...t, status: 'Active', effectiveFrom: addDays(today, 1), changedBy: 'HR office', changeNote: 'Reactivated' });

  return (
    <>
      <div className="hr-table-card">
        <div className="lv-card-head">
          <div>
            <h3>Leave types in force today</h3>
            <p>Editing creates a new version from a date you choose. Requests are checked against the version in force on their start date.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setEditing({ base: blankType(), mode: 'new' })}>
            <Plus size={14} /> New leave type
          </button>
        </div>
        <div className="lv-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Leave type</th>
                <th>Paid</th>
                <th>Mode</th>
                <th>Year</th>
                <th>Gender</th>
                <th>Carry-forward</th>
                <th>Forfeiture</th>
                <th>Counts</th>
                <th>Half day</th>
                <th className="lv-num">Min–max</th>
                <th className="lv-num">Notice</th>
                <th>Negative</th>
                <th>Document</th>
                <th>Probation</th>
                <th>Workflow</th>
                <th>Version</th>
                <th>Status</th>
                <th className="lv-sticky-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {current.map((t) => {
                const used = usage.get(t.code) ?? 0;
                return (
                  <tr key={t.code} className={t.status === 'Inactive' ? 'lv-row-muted' : ''}>
                    <td className="lv-mono lv-strong">{t.code}</td>
                    <td className="lv-wrap">
                      <div className="lv-strong">
                        {t.name}
                        {t.custom && <span className="digicraft-badge-light" style={{ marginLeft: 6, fontSize: 10 }}>Custom</span>}
                      </div>
                      <div className="lv-muted">{t.description}</div>
                    </td>
                    <td>{yesNo(t.isPaid)}</td>
                    <td>
                      {t.mode === 'EARNED' ? `Earned, ${t.accrualFrequency.toLowerCase()}` : t.mode === 'GRANTED' ? 'Granted up front' : t.mode === 'AWARDED' ? 'Awarded per holiday' : 'No balance'}
                    </td>
                    <td>{t.isAnnual ? `${t.yearBasis}, resets` : 'Rolling'}</td>
                    <td>{t.gender}</td>
                    <td>{t.allowCarryForward ? `Up to ${maxCarryForward(t, policy)}, ${carryForwardMonths(t, policy)} months` : 'No'}</td>
                    <td>
                      {!t.isForfeitable
                        ? 'Not forfeitable'
                        : t.forfeitureRule === 'N days after award'
                        ? `${holidayCreditDays(t, policy)} days after award`
                        : t.forfeitureRule === 'Fixed date'
                        ? 'Cap at 31 Dec, rest on expiry'
                        : t.forfeitureRule}
                    </td>
                    <td>{t.countBasis === 'Working days' ? 'Working' : 'Calendar'}</td>
                    <td>{yesNo(t.allowHalfDay)}</td>
                    <td className="lv-num">
                      {fmtNum(t.minDays)}–{fmtNum(t.maxDays)}
                    </td>
                    <td className="lv-num">{t.minNoticeDays} d</td>
                    <td>{t.allowNegative ? `To −${t.negativeLimit}` : 'No'}</td>
                    <td>{t.attachmentAfterDays === null ? 'No' : t.attachmentAfterDays === 0 ? 'Always' : `Over ${t.attachmentAfterDays} d`}</td>
                    <td>{yesNo(t.probationEligible)}</td>
                    <td>{t.workflow.map((s) => (s === 'SUPERVISOR' ? 'Supervisor' : 'HR')).join(' → ')}</td>
                    <td>
                      v{t.version}
                      <div className="lv-muted">from {fmtDate(t.effectiveFrom)}</div>
                    </td>
                    <td>
                      <span className={`digicraft-status-pill ${t.status === 'Active' ? 'success' : 'info'}`}>{t.status}</span>
                      <div className="lv-muted">{used ? `${used} requests` : 'No requests'}</div>
                    </td>
                    <td className="lv-sticky-actions">
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ base: t, mode: 'edit' })} title="Edit (new version)">
                          <Pencil size={12} /> Edit
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ base: t, mode: 'duplicate' })} title="Duplicate as a new type">
                          <Copy size={12} /> Duplicate
                        </button>
                        {t.custom && !used ? (
                          <button className="btn btn-secondary btn-sm" onClick={() => deleteLeaveType(t.code)} title="Delete (no requests yet)">
                            <Trash2 size={12} /> Delete
                          </button>
                        ) : t.status === 'Active' ? (
                          <button className="btn btn-secondary btn-sm" onClick={() => deactivate(t)} title="Stop new requests from tomorrow; history is kept">
                            <Power size={12} /> Deactivate
                          </button>
                        ) : (
                          <button className="btn btn-secondary btn-sm" onClick={() => reactivate(t)}>
                            <Power size={12} /> Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hr-table-card">
        <div className="lv-card-head">
          <div>
            <h3>
              <History size={14} style={{ verticalAlign: -2 }} /> Version history
            </h3>
            <p>Old versions are never changed; each one keeps the dates it applied to.</p>
          </div>
          <select className="form-control" style={{ width: 'auto' }} value={historyFor} onChange={(e) => setHistoryFor(e.target.value)} aria-label="Leave type">
            <option value="ALL">All types</option>
            {codes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="lv-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Version</th>
                <th>Effective from</th>
                <th>Effective to</th>
                <th>Change</th>
                <th>Changed by</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {hp.rows.map((t) => {
                const inForce = typeAt(t.code, today, leaveCfg) === t;
                return (
                  <tr key={`${t.code}-${t.version}`}>
                    <td>
                      <span className="lv-mono">{t.code}</span> {t.name}
                    </td>
                    <td>v{t.version}</td>
                    <td>{fmtDate(t.effectiveFrom)}</td>
                    <td>{t.effectiveTo ? fmtDate(t.effectiveTo) : 'Open'}</td>
                    <td className="lv-wrap">{t.changeNote}</td>
                    <td>{t.changedBy}</td>
                    <td>
                      {inForce ? (
                        <span className="digicraft-status-pill success">In force{t.status === 'Inactive' ? ' (inactive)' : ''}</span>
                      ) : t.effectiveFrom > today ? (
                        <span className="digicraft-status-pill primary">Scheduled</span>
                      ) : (
                        <span className="digicraft-status-pill info">Superseded</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={hp} noun="versions" />
      </div>

      {editing && <EditTypeModal base={editing.base} mode={editing.mode} onClose={() => setEditing(null)} />}
    </>
  );
};

/** Suggests a free code for a duplicate: AL → AL2, AL3, … */
const freeCode = (code: string, taken: string[]) => {
  const stem = code.replace(/\d+$/, '').slice(0, 5) || 'LT';
  for (let i = 2; i < 100; i++) if (!taken.includes(`${stem}${i}`)) return `${stem}${i}`;
  return '';
};

const EditTypeModal: React.FC<{ base: LeaveTypeVersion; mode: Mode; onClose: () => void }> = ({ base, mode, onClose }) => {
  const { saveLeaveTypeVersion, createLeaveType, leaveTypeVersions, leaveCfg } = useApp();
  const creating = mode !== 'edit';
  const today = todayIso();
  const [t, setT] = useState<LeaveTypeVersion>(() =>
    mode === 'edit'
      ? { ...base, effectiveFrom: addDays(today, 1), changeNote: '', changedBy: 'HR office' }
      : mode === 'duplicate'
      ? {
          ...base,
          code: freeCode(base.code, leaveCodes(leaveCfg)),
          name: `${base.name} (copy)`,
          version: 1,
          effectiveFrom: today,
          effectiveTo: undefined,
          status: 'Active',
          custom: true,
          deriveFromHolidays: false,
          changedBy: 'HR office',
          changeNote: `Duplicated from ${base.name} (${base.code})`
        }
      : base
  );
  const [row, setRow] = useState<EntitlementRow>(() =>
    mode === 'new'
      ? { PERMANENT: cell(5, false), FIXED_TERM: cell(0, false), PROBATION: cell(0, false), CASUAL: cell(0, false) }
      : structuredClone(matrixRow(leaveCfg, base.code))
  );
  const set = <K extends keyof LeaveTypeVersion>(k: K, v: LeaveTypeVersion[K]) => setT((x) => ({ ...x, [k]: v }));
  const numIn = (k: 'minDays' | 'maxDays' | 'minNoticeDays' | 'negativeLimit', step = 1) => (
    <input className="form-control" type="number" min={0} step={step} value={t[k]} onChange={(e) => set(k, Number(e.target.value))} />
  );
  const bool = (k: 'isPaid' | 'allowCarryForward' | 'isForfeitable' | 'allowHalfDay' | 'allowNegative' | 'probationEligible', label: string) => (
    <label className="lv-check">
      <input type="checkbox" checked={t[k]} onChange={(e) => set(k, e.target.checked)} /> {label}
    </label>
  );
  const setMode = (m: LeaveTypeVersion['mode']) =>
    setT((x) => ({
      ...x,
      mode: m,
      isEarned: m === 'EARNED',
      accrualFrequency: m === 'EARNED' ? 'Monthly' : m === 'GRANTED' ? 'Annually' : 'None',
      isAnnual: m === 'EARNED' || m === 'GRANTED',
      isAwarded: m === 'AWARDED',
      isPaid: m === 'UNTRACKED' ? false : x.isPaid
    }));
  const setDays = (col: ContractColumn, days: number) =>
    setRow((r) => ({ ...r, [col]: { ...r[col], days: Math.max(0, days), accrual: t.mode === 'EARNED' && days > 0 } }));

  const errors: string[] = [];
  if (creating) {
    errors.push(...validateLeaveTypeDraft(t, leaveCfg));
    if (!t.effectiveFrom) errors.push('Pick the date the type takes effect.');
  } else {
    const latest = leaveTypeVersions.filter((x) => x.code === base.code).map((x) => x.effectiveFrom).sort().pop() ?? '';
    if (!t.changeNote.trim()) errors.push('Say what changed and why.');
    if (!t.effectiveFrom || t.effectiveFrom <= latest) errors.push(`The new version must start after ${fmtDate(latest)}, when the latest version starts.`);
  }
  if (t.minDays <= 0 || t.maxDays < t.minDays) errors.push('Maximum days must be at least the minimum, and the minimum above zero.');
  if (t.workflow.length === 0) errors.push('Pick at least one approval step.');
  const tracked = t.mode === 'EARNED' || t.mode === 'GRANTED';
  if (creating && tracked && CONTRACT_COLUMNS.every((c) => !(row[c.id].days ?? 0))) errors.push('Give at least one contract type some days, or nobody can take it.');

  const save = () => {
    if (creating) {
      const ok = createLeaveType(
        { ...t, code: t.code.trim().toUpperCase() },
        tracked ? row : Object.fromEntries(CONTRACT_COLUMNS.map((c) => [c.id, cell(null, false, 'HIRE', t.mode === 'AWARDED' ? 'Awarded' : 'No balance')])) as EntitlementRow
      );
      if (ok) onClose();
    } else {
      saveLeaveTypeVersion(t);
      onClose();
    }
  };

  return (
    <Modal
      title={mode === 'edit' ? `Edit ${base.name}` : mode === 'duplicate' ? `Duplicate ${base.name}` : 'New leave type'}
      subtitle={
        mode === 'edit'
          ? `Creates version ${Math.max(...leaveTypeVersions.filter((x) => x.code === base.code).map((x) => x.version)) + 1}; v${base.version} stays on record for earlier dates.`
          : 'Code and name must be unique. Every rule below can be changed later as a new version.'
      }
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={errors.length > 0} onClick={save}>
            {creating ? 'Create leave type' : 'Save new version'}
          </button>
        </>
      }
    >
      <div className="lv-form-grid-3">
        <Field label="Code (2–6 letters or digits)">
          <input
            className="form-control"
            value={t.code}
            disabled={!creating}
            maxLength={6}
            onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
        </Field>
        <Field label="Name">
          <input className="form-control" value={t.name} disabled={!creating} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Effective from">
          <input className="form-control" type="date" value={t.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} />
        </Field>
        <Field label="Description" className="lv-span-2">
          <input className="form-control" value={t.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="Status">
          <select className="form-control" value={t.status} onChange={(e) => set('status', e.target.value as LeaveTypeVersion['status'])}>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        </Field>
        <Field label="How days are given">
          <select className="form-control" value={t.mode} disabled={!creating} onChange={(e) => setMode(e.target.value as LeaveTypeVersion['mode'])}>
            <option value="EARNED">Earned by accrual</option>
            <option value="GRANTED">Granted up front each year</option>
            <option value="AWARDED" disabled={mode === 'new'}>
              Awarded per holiday worked
            </option>
            <option value="UNTRACKED">No balance (e.g. unpaid)</option>
          </select>
        </Field>
        <Field label="Gender eligibility">
          <select className="form-control" value={t.gender} onChange={(e) => set('gender', e.target.value as LeaveTypeVersion['gender'])}>
            <option>All</option>
            <option>Female</option>
            <option>Male</option>
          </select>
        </Field>
        <Field label="Accrual frequency">
          <select className="form-control" value={t.accrualFrequency} disabled={t.mode !== 'EARNED'} onChange={(e) => set('accrualFrequency', e.target.value as LeaveTypeVersion['accrualFrequency'])}>
            {['Monthly', 'Quarterly', 'Annually', 'None'].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </Field>
        <Field label="Count basis">
          <select className="form-control" value={t.countBasis} onChange={(e) => set('countBasis', e.target.value as LeaveTypeVersion['countBasis'])}>
            <option>Working days</option>
            <option>Calendar days</option>
          </select>
        </Field>
        <Field label="Forfeiture rule">
          <select className="form-control" value={t.forfeitureRule} onChange={(e) => set('forfeitureRule', e.target.value as LeaveTypeVersion['forfeitureRule'])}>
            {['Fixed date', 'N days after award', 'Year-end', 'None'].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </Field>
        <Field label="Max carry-forward (blank = policy)">
          <input
            className="form-control"
            type="number"
            min={0}
            value={t.maxCarryForward ?? ''}
            disabled={!t.allowCarryForward}
            onChange={(e) => set('maxCarryForward', e.target.value === '' ? null : Number(e.target.value))}
          />
        </Field>
        <Field label="Carry-forward expiry, months (blank = policy)">
          <input
            className="form-control"
            type="number"
            min={0}
            value={t.carryForwardExpiryMonths ?? ''}
            disabled={!t.allowCarryForward}
            onChange={(e) => set('carryForwardExpiryMonths', e.target.value === '' ? null : Number(e.target.value))}
          />
        </Field>
        <Field label="Document needed over (days, blank = never)">
          <input className="form-control" type="number" min={0} value={t.attachmentAfterDays ?? ''} onChange={(e) => set('attachmentAfterDays', e.target.value === '' ? null : Number(e.target.value))} />
        </Field>
        <Field label="Minimum days per request">{numIn('minDays', 0.5)}</Field>
        <Field label="Maximum days per request">{numIn('maxDays', 0.5)}</Field>
        <Field label="Minimum notice (days)">{numIn('minNoticeDays')}</Field>
        <Field label="Negative balance limit">{numIn('negativeLimit', 0.5)}</Field>
        <Field label="Approval workflow">
          <select className="form-control" value={t.workflow.join('>')} onChange={(e) => set('workflow', e.target.value.split('>') as LeaveTypeVersion['workflow'])}>
            <option value="SUPERVISOR">Supervisor</option>
            <option value="SUPERVISOR>HR">Supervisor → HR</option>
          </select>
        </Field>
        <Field label="Changed by">
          <input className="form-control" value={t.changedBy} onChange={(e) => set('changedBy', e.target.value)} />
        </Field>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
        {bool('isPaid', 'Paid')}
        {bool('allowCarryForward', 'Allow carry-forward')}
        {bool('isForfeitable', 'Forfeitable')}
        {bool('allowHalfDay', 'Half days allowed')}
        {bool('allowNegative', 'Allow negative balance')}
        {bool('probationEligible', 'Usable during probation')}
      </div>

      {creating && tracked && (
        <div>
          <p className="lv-section-title">Days per year by contract type</p>
          <div className="lv-form-grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            {CONTRACT_COLUMNS.map((c) => (
              <Field key={c.id} label={c.label}>
                <input className="form-control" type="number" min={0} value={row[c.id].days ?? 0} onChange={(e) => setDays(c.id, Number(e.target.value))} />
              </Field>
            ))}
          </div>
          <p className="lv-muted" style={{ marginTop: 6 }}>
            You can fine-tune these, usable-from rules and tenure bands later under Entitlements & tenure.
          </p>
        </div>
      )}

      <Field label={creating ? 'Note for the record' : 'What changed and why'}>
        <textarea className="form-control" rows={2} value={t.changeNote} onChange={(e) => set('changeNote', e.target.value)} />
      </Field>
      <Messages
        errors={errors}
        info={[
          creating
            ? 'The new type appears in Apply for leave, balances, the portal and year-end straight away for eligible staff.'
            : `Mode: ${t.mode === 'EARNED' ? 'earned by accrual' : t.mode === 'GRANTED' ? 'granted up front' : t.mode === 'AWARDED' ? 'awarded per trigger (holiday worked)' : 'no balance'}. The mode is fixed once a type exists.`,
          'Negative balances also need the company policy to allow them.'
        ]}
      />
    </Modal>
  );
};
