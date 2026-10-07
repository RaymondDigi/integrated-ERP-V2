import React, { useMemo, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { POLICY_SETTINGS, type LeavePolicy, type PolicySignOff } from '../../../data/leaveConfig';
import { addDays, todayIso } from '../../../data/leaveEngine';
import { Field, Messages, fmtDate } from './shared';

const display = (key: keyof LeavePolicy, v: string) => {
  if (key === 'carryForwardExpiryMonths') return v === '0' ? 'No expiry' : `${v} months`;
  if (key === 'maxCarryForward' || key === 'holidayCreditExpiryDays' || key === 'holidayCreditPerDay') return `${v} days`;
  if (key === 'backdatingDays') return v === '0' ? 'Not allowed' : `Yes, ${v} days`;
  return v;
};

export const PolicyTab: React.FC = () => {
  const { leavePolicyVersions, saveLeavePolicy } = useApp();
  const today = todayIso();
  const sorted = useMemo(() => [...leavePolicyVersions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)), [leavePolicyVersions]);
  const inForce = [...sorted].reverse().find((p) => p.effectiveFrom <= today) ?? sorted[sorted.length - 1];
  const [values, setValues] = useState<LeavePolicy>(inForce.values);
  const [signOff, setSignOff] = useState<PolicySignOff>({ hrBy: '', managementBy: '', date: today });
  const [effectiveFrom, setEffectiveFrom] = useState(addDays(today, 1));
  const [note, setNote] = useState('');
  const changed = POLICY_SETTINGS.filter((s) => values[s.key] !== inForce.values[s.key]);

  const errors: string[] = [];
  if (changed.length && (!signOff.hrBy.trim() || !signOff.managementBy.trim())) errors.push('HR and management must both sign off before the policy is saved.');
  if (changed.length && effectiveFrom <= today) errors.push('Policy changes start from a future date; requests are checked against the policy in force on their date.');
  if (changed.length && !note.trim()) errors.push('Add a short note on what changed.');
  const warnings = values.yearBasis !== 'Calendar' ? ['Only the calendar leave year is calculated in this demo; fiscal and anniversary years are recorded but not applied.'] : [];

  return (
    <>
      <div className="hr-table-card">
        <div className="lv-card-head">
          <div>
            <h3>Leave policy settings</h3>
            <p>
              Company-wide; a leave type can override carry-forward, expiry and credit settings. In force since {fmtDate(inForce.effectiveFrom)}, signed off by {inForce.signOff.hrBy} (HR) and {inForce.signOff.managementBy} (management) on {fmtDate(inForce.signOff.date)}.
            </p>
          </div>
          <button className="btn btn-secondary" disabled={!changed.length} onClick={() => setValues(inForce.values)}>
            Discard changes
          </button>
        </div>
        <div className="lv-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Setting</th>
                <th>Options</th>
                <th>Default</th>
                <th>Policy value</th>
                <th>Applied</th>
              </tr>
            </thead>
            <tbody>
              {POLICY_SETTINGS.map((s) => {
                const isChanged = values[s.key] !== inForce.values[s.key];
                return (
                  <tr key={s.key}>
                    <td className="lv-muted">{s.no}</td>
                    <td className="lv-strong">{s.setting}</td>
                    <td className="lv-wrap lv-muted">{s.options.map((o) => display(s.key, o)).join(' / ')}</td>
                    <td>{display(s.key, s.defaultValue)}</td>
                    <td>
                      {s.options.length > 1 ? (
                        <select
                          className="form-control lv-cell-select"
                          style={isChanged ? { borderColor: 'var(--status-warning)' } : undefined}
                          value={values[s.key]}
                          onChange={(e) => setValues({ ...values, [s.key]: e.target.value })}
                        >
                          {s.options.map((o) => (
                            <option key={o} value={o}>
                              {display(s.key, o)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{display(s.key, values[s.key])}</span>
                      )}
                    </td>
                    <td>{s.enforced ? <span className="digicraft-status-pill success">By the engine</span> : <span className="digicraft-status-pill info">Recorded</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="lv-signoff">
          <Field label="Effective from">
            <input className="form-control" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>
          <Field label="Approved by (HR)">
            <input className="form-control" value={signOff.hrBy} placeholder="e.g. Rose Chepkoech" onChange={(e) => setSignOff({ ...signOff, hrBy: e.target.value })} />
          </Field>
          <Field label="Approved by (Management)">
            <input className="form-control" value={signOff.managementBy} placeholder="e.g. Amina Hassan" onChange={(e) => setSignOff({ ...signOff, managementBy: e.target.value })} />
          </Field>
          <Field label="Sign-off date">
            <input className="form-control" type="date" value={signOff.date} onChange={(e) => setSignOff({ ...signOff, date: e.target.value })} />
          </Field>
          <Field label="What changed" className="lv-span-2">
            <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder={changed.map((c) => c.setting).join(', ') || 'No changes yet'} />
          </Field>
          <div className="lv-span-2" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary"
              disabled={!changed.length || errors.length > 0}
              onClick={() => {
                saveLeavePolicy(values, signOff, effectiveFrom, note.trim());
                setNote('');
              }}
            >
              Save policy ({changed.length} change{changed.length === 1 ? '' : 's'})
            </button>
          </div>
        </div>
        {(changed.length > 0 || warnings.length > 0) && (
          <div className="lv-body-pad" style={{ paddingTop: 0 }}>
            <Messages errors={errors} warnings={warnings} />
          </div>
        )}
      </div>

      <div className="hr-table-card">
        <div className="lv-card-head">
          <div>
            <h3>Policy versions</h3>
            <p>Each version applies from its date; earlier requests keep the policy they were made under.</p>
          </div>
        </div>
        <div className="lv-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Effective from</th>
                <th>HR</th>
                <th>Management</th>
                <th>Signed</th>
                <th>Note</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...sorted].reverse().map((p) => (
                <tr key={p.id}>
                  <td className="lv-mono">{p.id}</td>
                  <td>{fmtDate(p.effectiveFrom)}</td>
                  <td>{p.signOff.hrBy}</td>
                  <td>{p.signOff.managementBy}</td>
                  <td>{fmtDate(p.signOff.date)}</td>
                  <td className="lv-wrap">{p.note}</td>
                  <td>
                    {p === inForce ? (
                      <span className="digicraft-status-pill success">In force</span>
                    ) : p.effectiveFrom > today ? (
                      <span className="digicraft-status-pill primary">Scheduled</span>
                    ) : (
                      <span className="digicraft-status-pill info">Superseded</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};
