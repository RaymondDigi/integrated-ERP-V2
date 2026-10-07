import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { CONTRACT_COLUMNS, STATUTORY_MINIMUMS, type ContractColumn, type EntitlementCell, type EntitlementMatrix, type LeaveCode, type TenureBand } from '../../../data/leaveConfig';
import { COLUMN_LABEL, contractColumn, genderEligible, leaveCodes, leaveName, matrixRow, statutoryWarnings, todayIso, validateBands } from '../../../data/leaveEngine';
import { Field, Messages, fmtDate } from './shared';

const USABLE: { id: EntitlementCell['usableFrom']; label: string }[] = [
  { id: 'HIRE', label: 'From hire' },
  { id: 'AFTER_PROBATION', label: 'After probation' },
  { id: 'AFTER_MONTHS', label: 'After N months' }
];

export const EntitlementsTab: React.FC = () => {
  const { leaveCfg, saveEntitlements, tenantEmployees, eligibilityOverrides, addEligibilityOverride } = useApp();
  const [matrix, setMatrix] = useState<EntitlementMatrix>(leaveCfg.matrix);
  const [bands, setBands] = useState<TenureBand[]>(leaveCfg.bands);
  const dirty = matrix !== leaveCfg.matrix || bands !== leaveCfg.bands;
  const bandErrors = useMemo(() => validateBands(bands, leaveCfg), [bands, leaveCfg]);
  const statutory = useMemo(() => statutoryWarnings(matrix, leaveCfg), [matrix, leaveCfg]);
  const codes = leaveCodes(leaveCfg);
  const rowOf = (c: LeaveCode) => matrix[c] ?? matrixRow(leaveCfg, c);
  const today = todayIso();

  const headcount = useMemo(() => {
    const m: Record<ContractColumn, number> = { PERMANENT: 0, FIXED_TERM: 0, PROBATION: 0, CASUAL: 0 };
    tenantEmployees.filter((e) => e.status !== 'TERMINATED').forEach((e) => m[contractColumn(e, today)]++);
    return m;
  }, [tenantEmployees, today]);

  const setCell = (code: LeaveCode, col: ContractColumn, patch: Partial<EntitlementCell>) =>
    setMatrix((m) => ({ ...m, [code]: { ...rowOf(code), [col]: { ...rowOf(code)[col], ...patch } } }));
  const setBand = (id: string, patch: Partial<TenureBand>) => setBands((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  // Overrides form
  const [ovr, setOvr] = useState({ staffId: '', code: 'ML' as LeaveCode, reason: '' });
  const staff = tenantEmployees.filter((e) => e.status !== 'TERMINATED').sort((a, b) => a.fullName.localeCompare(b.fullName));
  const ovrEmployee = staff.find((e) => e.staffId === ovr.staffId);
  const ovrNeeded = ovrEmployee ? !genderEligible(ovrEmployee, ovr.code, today, leaveCfg).ok : false;

  return (
    <>
      <div className="hr-table-card">
        <div className="lv-card-head">
          <div>
            <h3>Entitlement matrix</h3>
            <p>Base days per leave year by contract type. Probation applies to monthly contracts until confirmation; casual covers daily-rated and output-based contracts.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-secondary"
              disabled={!dirty}
              onClick={() => {
                setMatrix(leaveCfg.matrix);
                setBands(leaveCfg.bands);
              }}
            >
              Discard
            </button>
            <button className="btn btn-primary" disabled={!dirty || bandErrors.length > 0} onClick={() => saveEntitlements(matrix, bands)}>
              Save matrix and bands
            </button>
          </div>
        </div>
        <div className="lv-scroll">
          <table className="hr-table lv-matrix">
            <thead>
              <tr>
                <th>Leave type</th>
                {CONTRACT_COLUMNS.map((c) => (
                  <th key={c.id}>
                    {c.label}
                    <div className="lv-muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
                      {c.maps} · {headcount[c.id]} staff
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code}>
                  <td>
                    <div className="lv-strong">{leaveName(code, leaveCfg)}</div>
                    {leaveCfg.types.find((t) => t.code === code)?.custom && <div className="lv-muted">Custom type ({code})</div>}
                    {STATUTORY_MINIMUMS[code] && <div className="lv-muted">Statutory minimum {STATUTORY_MINIMUMS[code]} days</div>}
                  </td>
                  {CONTRACT_COLUMNS.map(({ id: col }) => {
                    const c = rowOf(code)[col];
                    if (c.days === null)
                      return (
                        <td key={col}>
                          <span className="lv-muted">{c.note}</span>
                        </td>
                      );
                    return (
                      <td key={col}>
                        <div className="lv-cell">
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              className="form-control lv-cell-input"
                              type="number"
                              min={0}
                              value={c.days}
                              aria-label={`${leaveName(code, leaveCfg)} ${COLUMN_LABEL[col]} days`}
                              onChange={(e) => setCell(code, col, { days: Math.max(0, Number(e.target.value)) })}
                            />
                            <span className="lv-muted">days</span>
                          </span>
                          {c.days > 0 && (
                            <>
                              <label className="lv-check" style={{ fontSize: 12 }}>
                                <input type="checkbox" checked={c.accrual} onChange={(e) => setCell(code, col, { accrual: e.target.checked })} /> Accrues monthly
                              </label>
                              <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <select className="form-control lv-cell-select" value={c.usableFrom} onChange={(e) => setCell(code, col, { usableFrom: e.target.value as EntitlementCell['usableFrom'] })}>
                                  {USABLE.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.label}
                                    </option>
                                  ))}
                                </select>
                                {c.usableFrom === 'AFTER_MONTHS' && (
                                  <input
                                    className="form-control lv-cell-input"
                                    style={{ width: 52 }}
                                    type="number"
                                    min={1}
                                    value={c.usableAfterMonths ?? 1}
                                    onChange={(e) => setCell(code, col, { usableAfterMonths: Number(e.target.value) })}
                                  />
                                )}
                              </span>
                            </>
                          )}
                          {c.note && <span className="lv-muted">{c.note}</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="lv-body-pad">
          <Messages
            warnings={statutory}
            ok={statutory.length ? undefined : 'Every column meets the Kenyan statutory minimums (annual 21, maternity 90, paternity 14, sick 7 on full pay).'}
            info={['A change of contract type closes the old entitlement and opens the new one pro-rated from the change date (accrual follows the column each month).']}
          />
        </div>
      </div>

      <div className="hr-table-card">
        <div className="lv-card-head">
          <div>
            <h3>Tenure bands</h3>
            <p>Years of service = (date − service start − unpaid days) ÷ 365.25. The bonus applies from the next leave year. Bands must run from 0 with no gaps or overlaps.</p>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() =>
              setBands((bs) => [...bs, { id: `TB-${Date.now()}`, code: 'SL', column: 'PERMANENT', fromYears: 0, toYears: null, bonusDays: 0 }])
            }
          >
            <Plus size={12} /> Add band
          </button>
        </div>
        <div className="lv-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Leave type</th>
                <th>Contract</th>
                <th className="lv-num">From (years)</th>
                <th className="lv-num">To (years, below)</th>
                <th className="lv-num">Bonus days</th>
                <th className="lv-num">Cap</th>
                <th>Result</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...bands]
                .sort((a, b) => a.code.localeCompare(b.code) || a.column.localeCompare(b.column) || a.fromYears - b.fromYears)
                .map((b) => {
                  const base = rowOf(b.code)[b.column].days ?? 0;
                  return (
                    <tr key={b.id}>
                      <td>
                        <select className="form-control lv-cell-select" value={b.code} onChange={(e) => setBand(b.id, { code: e.target.value as LeaveCode })}>
                          {codes.filter((c) => rowOf(c).PERMANENT.days !== null).map((c) => (
                            <option key={c} value={c}>
                              {leaveName(c, leaveCfg)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select className="form-control lv-cell-select" value={b.column} onChange={(e) => setBand(b.id, { column: e.target.value as ContractColumn })}>
                          {CONTRACT_COLUMNS.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="lv-num">
                        <input className="form-control lv-cell-input" type="number" min={0} step={0.5} value={b.fromYears} onChange={(e) => setBand(b.id, { fromYears: Number(e.target.value) })} />
                      </td>
                      <td className="lv-num">
                        <input
                          className="form-control lv-cell-input"
                          type="number"
                          min={0}
                          step={0.5}
                          placeholder="No limit"
                          value={b.toYears ?? ''}
                          onChange={(e) => setBand(b.id, { toYears: e.target.value === '' ? null : Number(e.target.value) })}
                        />
                      </td>
                      <td className="lv-num">
                        <input className="form-control lv-cell-input" type="number" min={0} value={b.bonusDays} onChange={(e) => setBand(b.id, { bonusDays: Number(e.target.value) })} />
                      </td>
                      <td className="lv-num">
                        <input
                          className="form-control lv-cell-input"
                          type="number"
                          min={0}
                          placeholder="None"
                          value={b.cap ?? ''}
                          onChange={(e) => setBand(b.id, { cap: e.target.value === '' ? undefined : Number(e.target.value) })}
                        />
                      </td>
                      <td>
                        {b.fromYears}–{b.toYears === null ? '' : `<${b.toYears}`}
                        {b.toYears === null ? '+' : ''} years → {b.cap ? Math.min(base + b.bonusDays, b.cap) : base + b.bonusDays} days
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-sm" aria-label="Remove band" onClick={() => setBands((bs) => bs.filter((x) => x.id !== b.id))}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <div className="lv-body-pad">
          <Messages errors={bandErrors} ok={bandErrors.length ? undefined : 'Bands are continuous with no gaps or overlaps.'} />
        </div>
      </div>

      <div className="hr-table-card">
        <div className="lv-card-head">
          <div>
            <h3>Eligibility overrides</h3>
            <p>HR can let an individual take a type limited to the other gender (for example a father with sole custody). The reason is kept with the record.</p>
          </div>
        </div>
        <div className="lv-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Leave type</th>
                <th>Reason</th>
                <th>Recorded</th>
              </tr>
            </thead>
            <tbody>
              {eligibilityOverrides.map((o) => {
                const e = tenantEmployees.find((x) => x.staffId === o.staffId);
                return (
                  <tr key={o.id}>
                    <td>
                      <div className="lv-strong">{e?.fullName ?? o.staffId}</div>
                      <div className="lv-muted">
                        {o.staffId} · {e?.gender ?? '—'}
                      </div>
                    </td>
                    <td>{leaveName(o.code, leaveCfg)}</td>
                    <td className="lv-wrap">{o.reason}</td>
                    <td>
                      {fmtDate(o.at)}
                      <div className="lv-muted">{o.by}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="lv-body-pad lv-form-grid-3">
          <Field label="Employee">
            <select className="form-control" value={ovr.staffId} onChange={(e) => setOvr({ ...ovr, staffId: e.target.value })}>
              <option value="">Choose…</option>
              {staff.map((e) => (
                <option key={e.staffId} value={e.staffId}>
                  {e.fullName} ({e.gender ?? 'gender not recorded'})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Leave type">
            <select className="form-control" value={ovr.code} onChange={(e) => setOvr({ ...ovr, code: e.target.value as LeaveCode })}>
              {codes.map((c) => (
                <option key={c} value={c}>
                  {leaveName(c, leaveCfg)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason (required)">
            <input className="form-control" value={ovr.reason} onChange={(e) => setOvr({ ...ovr, reason: e.target.value })} />
          </Field>
          <div className="lv-span-2" style={{ alignSelf: 'center' }}>
            {ovrEmployee && !ovrNeeded && <span className="lv-muted">{ovrEmployee.fullName} can already take {leaveName(ovr.code, leaveCfg).toLowerCase()}; no override needed.</span>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <button
              className="btn btn-primary"
              disabled={!ovrEmployee || !ovrNeeded || !ovr.reason.trim()}
              onClick={() => {
                addEligibilityOverride({ staffId: ovr.staffId, code: ovr.code, reason: ovr.reason.trim(), by: 'HR office' });
                setOvr({ staffId: '', code: 'ML', reason: '' });
              }}
            >
              Record override
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
