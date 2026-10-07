import React, { useMemo, useState } from 'react';
import { Lock, Plus, Undo2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { HREmployee } from '../../../types';
import type { LeaveCode } from '../../../data/leaveConfig';
import { usePaged, Pager } from '../../../components/common/Pager';
import { COLUMN_LABEL, contractColumn, leaveBalances, leaveCodes, leaveName, todayIso, type LeaveBalance, type LedgerRow } from '../../../data/leaveEngine';
import { Drawer, Field, Messages, TXN_LABEL, fmtDate, fmtDays, fmtNum, signed } from './shared';

type Row = { e: HREmployee; b: Record<LeaveCode, LeaveBalance> };

export const BalancesTab: React.FC = () => {
  const { tenantEmployees, leaveRequests, leaveCfg } = useApp();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const today = todayIso();

  const all = useMemo<Row[]>(
    () =>
      tenantEmployees
        .map((e) => ({ e, b: Object.fromEntries(leaveBalances(e, leaveRequests, today, leaveCfg).map((x) => [x.code, x])) as Record<LeaveCode, LeaveBalance> }))
        .sort((a, b) => a.e.fullName.localeCompare(b.e.fullName)),
    [tenantEmployees, leaveRequests, today, leaveCfg]
  );
  const departments = useMemo(() => [...new Set(tenantEmployees.map((e) => e.department))].sort(), [tenantEmployees]);
  const rows = all.filter((r) => (dept === 'ALL' || r.e.department === dept) && (!q || `${r.e.fullName} ${r.e.staffId}`.toLowerCase().includes(q.toLowerCase())));

  const totals = useMemo(() => {
    const active = all.filter((r) => r.e.status !== 'TERMINATED');
    const sum = (f: (r: Row) => number) => active.reduce((s, r) => s + f(r), 0);
    return {
      al: sum((r) => r.b.AL.available),
      pending: sum((r) => Object.values(r.b).reduce((s, x) => s + (x.tracked ? x.pending : 0), 0)),
      forfeited: sum((r) => r.b.AL.forfeited + r.b.CO.forfeited),
      co: sum((r) => r.b.CO.available),
      expiring: sum((r) => r.b.AL.expiring30 + r.b.CO.expiring30),
      people: active.length
    };
  }, [all]);
  const pg = usePaged(rows, 25, `${dept}|${q}`);
  const open = all.find((r) => r.e.staffId === openId);

  return (
    <>
      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Annual leave owed</div>
          <div className="hr-stat-value" style={{ color: 'var(--brand-primary)' }}>
            {fmtNum(totals.al)}
          </div>
          <div className="hr-stat-subtext">Days available across {totals.people} staff, from the ledger</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Reserved for pending requests</div>
          <div className="hr-stat-value">{fmtNum(totals.pending)}</div>
          <div className="hr-stat-subtext">Released if a request is declined or withdrawn</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Forfeited this year</div>
          <div className="hr-stat-value" style={{ color: totals.forfeited ? 'var(--status-critical)' : undefined }}>
            {fmtNum(totals.forfeited)}
          </div>
          <div className="hr-stat-subtext">Carried days after 31 Mar and expired holiday credits</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Expiring in 30 days</div>
          <div className="hr-stat-value" style={{ color: totals.expiring ? 'var(--status-warning)' : undefined }}>
            {fmtNum(totals.expiring)}
          </div>
          <div className="hr-stat-subtext">{fmtNum(totals.co)} holiday-off days available now</div>
        </div>
      </div>

      <div className="hr-table-card">
        <div className="lv-toolbar">
          <strong style={{ fontSize: 13 }}>Balances as of {fmtDate(today)}</strong>
          <span className="lv-grow" />
          <select className="form-control" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
            <option value="ALL">All departments</option>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <input className="form-control" placeholder="Search name or ID" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="lv-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Contract</th>
                <th className="lv-num">Tenure</th>
                <th className="lv-num">AL entitlement</th>
                <th className="lv-num">AL taken</th>
                <th className="lv-num">AL pending</th>
                <th className="lv-num">AL available</th>
                <th className="lv-num">Sick</th>
                <th className="lv-num">Compassionate</th>
                <th className="lv-num">Holiday off</th>
                <th className="lv-num">Expiring 30d</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.map(({ e, b }) => {
                const col = contractColumn(e, today);
                return (
                  <tr key={e.staffId} className={`lv-click ${e.status === 'TERMINATED' ? 'lv-row-muted' : ''}`} onClick={() => setOpenId(e.staffId)}>
                    <td>
                      <div className="lv-strong">{e.fullName}</div>
                      <div className="lv-muted">
                        {e.staffId} · {e.department}
                        {e.status === 'TERMINATED' ? ` · left ${fmtDate(e.exitDate)}` : ''}
                      </div>
                    </td>
                    <td>
                      {COLUMN_LABEL[col]}
                      {col === 'PROBATION' && <div className="lv-muted">AL usable {fmtDate(b.AL.usableFrom)}</div>}
                    </td>
                    <td className="lv-num">{fmtNum(b.AL.entitlement.tenureYears)} y</td>
                    <td className="lv-num">
                      {b.AL.eligible ? (
                        <>
                          {fmtNum(b.AL.entitlement.total)}
                          {b.AL.entitlement.bonus > 0 && <div className="lv-muted">incl. +{fmtNum(b.AL.entitlement.bonus)} tenure</div>}
                        </>
                      ) : (
                        <span className="lv-muted">Not entitled</span>
                      )}
                    </td>
                    <td className="lv-num">{fmtNum(b.AL.taken)}</td>
                    <td className="lv-num">{b.AL.pending ? fmtNum(b.AL.pending) : '—'}</td>
                    <td className="lv-num lv-strong">
                      {!b.AL.usable && b.AL.eligible && <Lock size={11} style={{ marginRight: 4 }} />}
                      {fmtNum(b.AL.available)}
                    </td>
                    <td className="lv-num">{b.SL.eligible ? fmtNum(b.SL.available) : '—'}</td>
                    <td className="lv-num">{b.CL.eligible ? fmtNum(b.CL.available) : '—'}</td>
                    <td className="lv-num">{b.CO.available || b.CO.awarded ? fmtNum(b.CO.available) : '—'}</td>
                    <td className="lv-num" style={{ color: b.AL.expiring30 + b.CO.expiring30 ? 'var(--status-warning)' : undefined }}>
                      {b.AL.expiring30 + b.CO.expiring30 ? fmtNum(b.AL.expiring30 + b.CO.expiring30) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="employees" />
      </div>

      {open && <LedgerDrawer employee={open.e} balances={open.b} onClose={() => setOpenId(null)} />}
    </>
  );
};

/** Non-zero parts of: opening + carried + accrued + awarded ± adjustments − taken − pending − forfeited − encashed. */
const formulaTerms = (b: LeaveBalance) =>
  [
    { label: 'granted', value: b.opening, sign: 1 },
    { label: 'carried', value: b.carried, sign: 1 },
    { label: 'accrued', value: b.accrued, sign: 1 },
    { label: 'awarded', value: b.awarded, sign: 1 },
    { label: 'adjustments', value: b.adjustments, sign: Math.sign(b.adjustments) },
    { label: 'taken', value: b.taken, sign: -1 },
    { label: 'pending', value: b.pending, sign: -1 },
    { label: 'forfeited', value: b.forfeited, sign: -1 },
    { label: 'encashed', value: b.encashed, sign: -1 }
  ].filter((t) => t.value !== 0);

const LedgerDrawer: React.FC<{ employee: HREmployee; balances: Record<LeaveCode, LeaveBalance>; onClose: () => void }> = ({ employee: e, balances, onClose }) => {
  const { addLeaveAdjustment, leaveCfg } = useApp();
  const shown = leaveCodes(leaveCfg).filter((c) => balances[c] && balances[c].eligible && (balances[c].tracked || balances[c].rows.length));
  const [code, setCode] = useState<LeaveCode>('AL');
  const active: LeaveCode = shown.includes(code) ? code : shown[0] ?? 'AL';
  const b = balances[active];
  const [adj, setAdj] = useState<{ days: string; reason: string; date: string } | null>(null);

  // Running balance per type, oldest first
  const withRunning = useMemo(() => {
    let run = 0;
    return b.rows.map((r) => {
      run = Math.round((run + r.days) * 100) / 100;
      return { ...r, running: run };
    });
  }, [b.rows]);
  const year = Number(todayIso().slice(0, 4));
  const pg = usePaged(withRunning, 25, active);

  const reverse = (r: LedgerRow) => setAdj({ days: String(-r.days), reason: `Reversal of forfeiture ${r.sourceRef} on ${r.date}: `, date: todayIso() });
  const adjDays = Number(adj?.days);
  const adjOk = !!adj && !!adj.reason.trim() && Number.isFinite(adjDays) && adjDays !== 0;

  return (
    <Drawer
      title={e.fullName}
      subtitle={`${e.staffId} · ${e.jobTitle} · ${e.contractType} · joined ${fmtDate(e.joinedDate)}`}
      onClose={onClose}
      footer={
        adj ? (
          <>
            <button className="btn btn-secondary" onClick={() => setAdj(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!adjOk}
              onClick={() => {
                addLeaveAdjustment({ staffId: e.staffId, code: active, date: adj.date, days: adjDays, reason: adj.reason.trim(), by: 'HR office' });
                setAdj(null);
              }}
            >
              Post adjustment
            </button>
          </>
        ) : b.tracked ? (
          <button className="btn btn-secondary" onClick={() => setAdj({ days: '', reason: '', date: todayIso() })}>
            <Plus size={14} /> Adjust {leaveName(active, leaveCfg).toLowerCase()}
          </button>
        ) : undefined
      }
    >
      {e.exitDate && (
        <Messages
          info={[`Leaves on ${fmtDate(e.exitDate)}. Annual leave available for final dues: ${fmtDays(balances.AL.available)} (payroll reads this from the ledger).`]}
        />
      )}

      <div className="lv-chips">
        {shown.map((c) => (
          <button key={c} className={`lv-chip ${active === c ? 'active' : ''}`} onClick={() => setCode(c)}>
            {leaveName(c, leaveCfg)}
            <b>{balances[c].tracked ? fmtNum(balances[c].available) : '—'}</b>
          </button>
        ))}
      </div>

      {b.tracked ? (
        <>
          <div className="lv-formula">
            <span>
              Available <b>{fmtNum(b.available)}</b> =
            </span>
            {formulaTerms(b).map((t, i) => (
              <span key={t.label}>
                {i === 0 ? (t.sign < 0 ? '−' : '') : t.sign < 0 ? '− ' : '+ '}
                {t.label} {fmtNum(Math.abs(t.value))}
              </span>
            ))}
          </div>
          <dl className="lv-kv">
            <div>
              <dt>{year} entitlement</dt>
              <dd>
                {b.entitlement.total ? `${fmtNum(b.entitlement.total)} days (${COLUMN_LABEL[b.entitlement.column].toLowerCase()} ${fmtNum(b.entitlement.base)} + tenure ${fmtNum(b.entitlement.bonus)})` : 'Awarded per holiday worked'}
              </dd>
            </div>
            <div>
              <dt>Pro-rated to service this year</dt>
              <dd>{b.entitlement.total ? `${fmtNum(b.entitlement.proRated)} days (${Math.round(b.entitlement.serviceShare * 100)}%)` : '—'}</dd>
            </div>
            <div>
              <dt>Usable</dt>
              <dd>{b.usable ? `Yes, from ${fmtDate(b.usableFrom)}` : `Locked until ${fmtDate(b.usableFrom)}`}</dd>
            </div>
            <div>
              <dt>Next expiry</dt>
              <dd>{b.nextExpiry ? `${fmtDays(b.nextExpiry.days)} on ${fmtDate(b.nextExpiry.date)} (${b.nextExpiry.label})` : 'Nothing expiring'}</dd>
            </div>
          </dl>
        </>
      ) : (
        <Messages info={[`${leaveName(active, leaveCfg)} has no balance; requests are listed for the record.`]} />
      )}

      {adj && (
        <div className="lv-form-grid">
          <Field label="Days (+ credit, − debit)">
            <input className="form-control" type="number" step="0.5" value={adj.days} onChange={(ev) => setAdj({ ...adj, days: ev.target.value })} />
          </Field>
          <Field label="Effective date">
            <input className="form-control" type="date" value={adj.date} onChange={(ev) => setAdj({ ...adj, date: ev.target.value })} />
          </Field>
          <Field label="Reason (required, kept in the ledger)" className="lv-span-2">
            <textarea className="form-control" rows={2} value={adj.reason} onChange={(ev) => setAdj({ ...adj, reason: ev.target.value })} />
          </Field>
        </div>
      )}

      <div>
        <p className="lv-section-title">Ledger · {leaveName(active, leaveCfg)}</p>
        <div className="lv-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction</th>
                <th className="lv-num">Days</th>
                <th className="lv-num">Balance</th>
                <th>Year</th>
                <th>Source</th>
                <th>Expiry</th>
                <th>By</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {withRunning.length === 0 && (
                <tr>
                  <td colSpan={10} className="lv-empty">
                    No ledger rows yet.
                  </td>
                </tr>
              )}
              {pg.rows.map((r) => (
                <tr key={r.id} className={r.leaveYear < year && b.rows.some((x) => x.leaveYear === year) ? 'lv-row-muted' : ''}>
                  <td>{fmtDate(r.date)}</td>
                  <td>{TXN_LABEL[r.txn]}</td>
                  <td className={`lv-num ${r.days < 0 ? 'lv-neg' : 'lv-pos'}`}>{signed(r.days)}</td>
                  <td className="lv-num">{fmtNum(r.running)}</td>
                  <td>{r.leaveYear}</td>
                  <td className="lv-mono">{r.sourceRef}</td>
                  <td>{r.expiry ? fmtDate(r.expiry) : '—'}</td>
                  <td>{r.createdBy}</td>
                  <td className="lv-wrap">{r.note}</td>
                  <td>
                    {r.txn === 'FORFEIT' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => reverse(r)} title="Reverse with a reason">
                        <Undo2 size={12} /> Reverse
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="ledger rows" />
      </div>
    </Drawer>
  );
};
