import React, { useMemo, useState } from 'react';
import { Lock, Play } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { LeaveCode } from '../../../data/leaveConfig';
import { usePaged, Pager } from '../../../components/common/Pager';
import { leaveName, COLUMN_LABEL, expiryReminders, jobStatus, todayIso, yearEndPreview } from '../../../data/leaveEngine';
import { Messages, fmtDate, fmtNum } from './shared';

export const YearEndTab: React.FC = () => {
  const { tenantEmployees, tenantLeave, leaveRequests, leaveCfg, runLeaveJob, leaveJobRuns, closeLeaveYear, closedLeaveYears } = useApp();
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const [q, setQ] = useState('');

  const jobs = useMemo(() => jobStatus(tenantEmployees, leaveRequests, today, leaveCfg), [tenantEmployees, leaveRequests, today, leaveCfg]);
  const reminders = useMemo(() => expiryReminders(tenantEmployees, leaveRequests, today, leaveCfg, 90), [tenantEmployees, leaveRequests, today, leaveCfg]);
  const preview = useMemo(() => yearEndPreview(tenantEmployees, leaveRequests, year, leaveCfg), [tenantEmployees, leaveRequests, year, leaveCfg]);
  const undecided = tenantLeave.filter((r) => r.status === 'PENDING_APPROVAL' && (r.startDate.startsWith(String(year)) || (r.appliedOn ?? '').startsWith(String(year))));
  const closed = closedLeaveYears.includes(year);
  const sum = (f: (r: (typeof preview)[number]) => number) => fmtNum(preview.reduce((s, r) => s + f(r), 0));
  const rows = preview.filter((r) => !q || `${r.fullName} ${r.staffId}`.toLowerCase().includes(q.toLowerCase()));
  const runs = leaveJobRuns.slice(0, 5);
  const remPg = usePaged(reminders, 10, reminders.length);
  const pg = usePaged(rows, 25, q);

  return (
    <>
      <div className="hr-table-card">
        <div className="lv-card-head">
          <div>
            <h3>Scheduled jobs</h3>
            <p>Each job posts ledger rows and is safe to run again: a period or credit is never posted twice.</p>
          </div>
        </div>
        <div className="lv-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Schedule</th>
                <th>Last run</th>
                <th>Next run</th>
                <th>What it posted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="lv-strong">{j.name}</td>
                  <td>{j.schedule}</td>
                  <td>{j.lastRun ? fmtDate(j.lastRun) : '—'}</td>
                  <td>{fmtDate(j.nextRun)}</td>
                  <td className="lv-wrap">{j.posted}</td>
                  <td>
                    {(j.id === 'ACCRUAL' || j.id === 'EXPIRY') && (
                      <button className="btn btn-secondary btn-sm" onClick={() => runLeaveJob(j.id, tenantEmployees)}>
                        <Play size={12} /> {j.id === 'ACCRUAL' ? 'Run accrual now' : 'Run expiry job'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {runs.length > 0 && (
          <div className="lv-body-pad">
            <p className="lv-section-title">Manual runs this session</p>
            <ul className="lv-history">
              {runs.map((r, i) => (
                <li key={i}>
                  <b>{r.at}</b> {r.summary}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="hr-table-card">
        <div className="lv-card-head">
          <div>
            <h3>Upcoming forfeitures (next 90 days)</h3>
            <p>Reminders go to the employee and supervisor 30 and 7 days before days are lost.</p>
          </div>
        </div>
        <div className="lv-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Expires</th>
                <th>Employee</th>
                <th>What</th>
                <th className="lv-num">Days at risk</th>
                <th>30-day reminder</th>
                <th>7-day reminder</th>
              </tr>
            </thead>
            <tbody>
              {reminders.length === 0 && (
                <tr>
                  <td colSpan={6} className="lv-empty">
                    Nothing expires in the next 90 days.
                  </td>
                </tr>
              )}
              {remPg.rows.map((r) => (
                <tr key={`${r.staffId}-${r.code}-${r.expiry}-${r.label}`}>
                  <td>
                    {fmtDate(r.expiry)}
                    <div className="lv-muted">in {r.daysLeft} days</div>
                  </td>
                  <td>
                    {r.fullName}
                    <div className="lv-muted">{r.staffId}</div>
                  </td>
                  <td>
                    {r.kind}
                    <div className="lv-muted">
                      {leaveName(r.code, leaveCfg)} · {r.label}
                    </div>
                  </td>
                  <td className="lv-num lv-strong" style={{ color: 'var(--status-warning)' }}>
                    {fmtNum(r.days)}
                  </td>
                  {r.reminders.map((m) => (
                    <td key={m.kind}>
                      {fmtDate(m.at)}
                      <div className="lv-muted">{m.at === today ? 'Sending today' : m.sent ? 'Sent' : 'Scheduled'}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={remPg} noun="items" />
      </div>

      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Projected closing, annual leave</div>
          <div className="hr-stat-value">{sum((r) => r.closing)}</div>
          <div className="hr-stat-subtext">At 31 Dec {year}, including accrual still to come</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Carried into {year + 1}</div>
          <div className="hr-stat-value" style={{ color: 'var(--brand-primary)' }}>
            {sum((r) => r.carried)}
          </div>
          <div className="hr-stat-subtext">Capped per person; unused carried days lapse 31 Mar {year + 1}</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Forfeited at close</div>
          <div className="hr-stat-value" style={{ color: 'var(--status-critical)' }}>
            {sum((r) => r.forfeited + r.encashed)}
          </div>
          <div className="hr-stat-subtext">{preview.filter((r) => r.forfeited > 0).length} employees above the cap</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">{year + 1} annual leave grants</div>
          <div className="hr-stat-value">{sum((r) => r.next.AL?.total ?? 0)}</div>
          <div className="hr-stat-subtext">{preview.filter((r) => r.bandChanged).length} employees move up a tenure band</div>
        </div>
      </div>

      <div className="hr-table-card">
        <div className="lv-card-head">
          <div>
            <h3>
              Year-end close preview, {year} → {year + 1}
            </h3>
            <p>Close locks {year}, carries annual leave forward up to the cap, forfeits the rest, lapses other types and posts {year + 1} grants with each person's contract and tenure.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input className="form-control" style={{ width: 180 }} placeholder="Search name or ID" value={q} onChange={(e) => setQ(e.target.value)} />
            {closed ? (
              <span className="digicraft-status-pill success">
                <Lock size={11} /> {year} closed
              </span>
            ) : (
              <button className="btn btn-primary" disabled={undecided.length > 0} onClick={() => closeLeaveYear(year)} title={undecided.length ? 'Decide every pending request first' : undefined}>
                <Lock size={14} /> Close {year}
              </button>
            )}
          </div>
        </div>
        {!closed && undecided.length > 0 && (
          <div className="lv-body-pad" style={{ paddingBottom: 0 }}>
            <Messages
              warnings={[`Close ${year} is available once all ${year} requests are decided. ${undecided.length} still pending: ${undecided.slice(0, 4).map((r) => `${r.id} (${r.staffName.split(' ')[0]})`).join(', ')}${undecided.length > 4 ? '…' : ''}.`]}
            />
          </div>
        )}
        <div className="lv-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>{year + 1} contract</th>
                <th className="lv-num">Closing AL</th>
                <th className="lv-num">Carried</th>
                <th className="lv-num">Forfeited</th>
                <th>Carried expire</th>
                <th>Lapsing</th>
                <th className="lv-num">Tenure 1 Jan</th>
                <th>{year + 1} grants</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.map((r) => (
                <tr key={r.staffId}>
                  <td>
                    <div className="lv-strong">{r.fullName}</div>
                    <div className="lv-muted">
                      {r.staffId} · {r.department}
                    </div>
                  </td>
                  <td>{COLUMN_LABEL[r.column]}</td>
                  <td className="lv-num">{fmtNum(r.closing)}</td>
                  <td className="lv-num lv-pos">{r.carried ? fmtNum(r.carried) : '—'}</td>
                  <td className={`lv-num ${r.forfeited + r.encashed ? 'lv-neg' : ''}`}>{r.forfeited + r.encashed ? fmtNum(r.forfeited + r.encashed) : '—'}</td>
                  <td>{r.carryExpiry ? fmtDate(r.carryExpiry) : '—'}</td>
                  <td className="lv-wrap lv-muted">
                    {Object.entries(r.lapsing)
                      .map(([c, d]) => `${c} ${fmtNum(d as number)}`)
                      .join(', ') || '—'}
                  </td>
                  <td className="lv-num">
                    {fmtNum(r.tenureNext)} y{r.bandChanged && <div className="lv-pos" style={{ fontSize: 11 }}>New band</div>}
                  </td>
                  <td className="lv-wrap">
                    {(Object.entries(r.next) as [LeaveCode, NonNullable<(typeof r.next)[LeaveCode]>][])
                      .map(([c, ent]) => `${c} ${fmtNum(ent.total)}${ent.bonus ? ` (+${fmtNum(ent.bonus)})` : ''}`)
                      .join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="employees" />
      </div>
    </>
  );
};
