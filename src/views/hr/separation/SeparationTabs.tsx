import React, { useMemo, useState } from 'react';
import { CheckCircle2, Plus, Search } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { CLEARANCE_DEPTS, CLEARANCE_OWNER, EXIT_LABEL, STAGE_LABEL, VOLUNTARY, noticeFacts, serviceYears, type ClearanceItem, type ExitCase, type ExitKind } from '../../../data/sepEngine';
import { SANCTION_LABEL } from '../../../data/discipline';
import { kes } from '../payroll/reports';
import { ExitCaseModal, fmtDate, stageCls, StartExitModal, useFinalSlip } from './ExitCase';

const useStaff = () => {
  const { hrEmployees } = useApp();
  return (id: string) => hrEmployees.find((e) => e.staffId === id);
};

/** Estimated net final pay for the register (runs the exit-month payslip). */
const NetCell: React.FC<{ c: ExitCase }> = ({ c }) => {
  const e = useStaff()(c.staffId);
  const f = useFinalSlip(c, e);
  if (!f) return <td className="num">—</td>;
  const unrecovered = f.slip.deductions.reduce((s, d) => s + d.deferred, 0);
  return (
    <>
      <td className="num">{kes(f.slip.gross)}</td>
      <td className="num">{kes(f.slip.totalDeductions)}</td>
      <td className="num">
        <strong>{kes(f.slip.net)}</strong>
        {unrecovered > 0 && <div className="muted" style={{ color: 'var(--status-critical)' }}>{kes(unrecovered)} not recovered</div>}
      </td>
    </>
  );
};

export const CasesTab: React.FC = () => {
  const { tenantExitCases, disciplinaryCases, selectedOrgId } = useApp();
  const staff = useStaff();
  const [open, setOpen] = useState<string | null>(null);
  const [starting, setStarting] = useState<null | { staffId: string; kind: ExitKind; lastDay?: string; caseRef?: string; reason?: string } | 'blank'>(null);
  const [stage, setStage] = useState<'active' | 'all' | 'done'>('active');
  const [q, setQ] = useState('');
  const rows = tenantExitCases
    .filter((c) => (stage === 'all' ? true : stage === 'done' ? ['PAID', 'CLOSED', 'WITHDRAWN'].includes(c.stage) : !['PAID', 'CLOSED', 'WITHDRAWN'].includes(c.stage)))
    .filter((c) => !q || `${c.id} ${staff(c.staffId)?.fullName ?? ''} ${EXIT_LABEL[c.kind]}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.lastDay.localeCompare(b.lastDay));
  const pg = usePaged(rows, 10, `${stage}|${q}`);
  // Dismissals decided in Disciplinary that have no exit case yet
  const handoffs = (disciplinaryCases ?? []).filter(
    (d) => d.orgId === selectedOrgId && d.outcome?.separationNote && ['SUMMARY_DISMISSAL', 'TERMINATION_NOTICE'].includes(d.outcome.sanction) && !tenantExitCases.some((c) => c.caseRef === d.id && c.stage !== 'WITHDRAWN')
  );
  const current = tenantExitCases.find((c) => c.id === open);
  return (
    <>
      {handoffs.length > 0 && (
        <div className="pr-note warn" style={{ marginBottom: 14 }}>
          <strong>From Disciplinary:</strong>
          {handoffs.map((d) => (
            <div key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
              <span>
                {d.id} · {staff(d.staffId)?.fullName} — {SANCTION_LABEL[d.outcome!.sanction].toLowerCase()}, effective {fmtDate(d.outcome!.effectiveDate)}
              </span>
              <button
                className="btn btn-secondary"
                style={{ padding: '3px 10px', fontSize: 11 }}
                onClick={() =>
                  setStarting({
                    staffId: d.staffId,
                    kind: d.outcome!.sanction === 'SUMMARY_DISMISSAL' ? 'SUMMARY_DISMISSAL' : 'TERMINATION_NOTICE',
                    lastDay: d.outcome!.effectiveDate,
                    caseRef: d.id,
                    reason: `${SANCTION_LABEL[d.outcome!.sanction]} — ${d.summary}`
                  })
                }
              >
                Start exit
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="hr-table-card">
        <div className="pr-toolbar" style={{ padding: '12px 16px' }}>
          <select className="form-control" value={stage} onChange={(ev) => setStage(ev.target.value as typeof stage)} aria-label="Show">
            <option value="active">In progress</option>
            <option value="done">Paid, closed or withdrawn</option>
            <option value="all">All exits</option>
          </select>
          <div className="form-input-wrapper grow">
            <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)' }} />
            <input className="form-control" style={{ paddingLeft: 30 }} placeholder="Search name, case or type" value={q} onChange={(ev) => setQ(ev.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={() => setStarting('blank')}>
            <Plus size={15} /> Start exit
          </button>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Exit</th>
                <th>Last day</th>
                <th>Notice</th>
                <th>Clearance</th>
                <th>Stage</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.rows.map((c) => {
                const e = staff(c.staffId);
                const n = e ? noticeFacts(c, e) : null;
                const done = c.clearance.filter((x) => x.status !== 'OPEN').length;
                return (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(c.id)}>
                    <td>
                      <strong>{e?.fullName ?? c.staffId}</strong>
                      <div className="muted">
                        {c.id} · {e?.jobTitle} · {e ? serviceYears(e, c.lastDay) : 0} yrs
                      </div>
                    </td>
                    <td>
                      {EXIT_LABEL[c.kind]}
                      <div className="muted">{c.reason}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.lastDay)}</td>
                    <td>
                      {n?.applies ? `${n.served}/${n.required} days` : 'n/a'}
                      {n && n.shortfall > 0 && <div className="muted">{n.payInLieu ? 'pay in lieu' : c.waiveShortfall ? 'shortfall waived' : 'shortfall recoverable'}</div>}
                    </td>
                    <td style={{ minWidth: 110 }}>
                      <div style={{ height: 6, borderRadius: 4, background: 'var(--border-subtle)', overflow: 'hidden' }}>
                        <div style={{ width: `${(done / Math.max(1, c.clearance.length)) * 100}%`, height: '100%', background: 'var(--brand-primary)' }} />
                      </div>
                      <div className="muted">
                        {done}/{c.clearance.length} items
                      </div>
                    </td>
                    <td>
                      <span className={`digicraft-status-pill ${stageCls(c.stage)}`}>{STAGE_LABEL[c.stage]}</span>
                    </td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }}>
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
              {pg.total === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>
                    No exits here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="exits" />
      </div>
      {current && <ExitCaseModal c={current} onClose={() => setOpen(null)} />}
      {starting && <StartExitModal preset={starting === 'blank' ? undefined : starting} onClose={() => setStarting(null)} />}
    </>
  );
};

export const ClearanceTab: React.FC = () => {
  const { tenantExitCases, setClearance } = useApp();
  const staff = useStaff();
  const [dept, setDept] = useState<'All' | ClearanceItem['dept']>('All');
  const items = tenantExitCases
    .filter((c) => !['APPROVED', 'PAID', 'CLOSED', 'WITHDRAWN'].includes(c.stage))
    .flatMap((c) => c.clearance.filter((x) => x.status === 'OPEN' && (dept === 'All' || x.dept === dept)).map((x) => ({ c, x })))
    .sort((a, b) => a.c.lastDay.localeCompare(b.c.lastDay));
  const pg = usePaged(items, 25, dept);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="hr-table-card">
      <div className="pr-toolbar" style={{ padding: '12px 16px' }}>
        <div className="pr-tabstrip" style={{ margin: 0, border: 'none', padding: 0, background: 'transparent' }}>
          {(['All', ...CLEARANCE_DEPTS] as const).map((d) => {
            const n = tenantExitCases.filter((c) => !['APPROVED', 'PAID', 'CLOSED', 'WITHDRAWN'].includes(c.stage)).flatMap((c) => c.clearance).filter((x) => x.status === 'OPEN' && (d === 'All' || x.dept === d)).length;
            return (
              <button key={d} className={dept === d ? 'active' : ''} onClick={() => setDept(d)}>
                {d} ({n})
              </button>
            );
          })}
        </div>
      </div>
      <div className="pr-table-scroll">
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Leaver</th>
              <th>Department</th>
              <th>Item</th>
              <th>Owner</th>
              <th>Last day</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pg.rows.map(({ c, x }) => (
              <tr key={x.id}>
                <td>
                  <strong>{staff(c.staffId)?.fullName}</strong>
                  <div className="muted">{c.id}</div>
                </td>
                <td>{x.dept}</td>
                <td>
                  {x.label}
                  {x.value ? <div className="muted">KES {kes(x.value)} if not returned</div> : null}
                </td>
                <td className="muted">{CLEARANCE_OWNER[x.dept]}</td>
                <td style={{ whiteSpace: 'nowrap', color: c.lastDay < today ? 'var(--status-critical)' : undefined }}>{fmtDate(c.lastDay)}</td>
                <td>
                  <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => setClearance(c.id, x.id, 'CLEARED', CLEARANCE_OWNER[x.dept].split(',')[0])}>
                    <CheckCircle2 size={12} /> Clear
                  </button>
                </td>
              </tr>
            ))}
            {pg.total === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>
                  Nothing waiting for clearance.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="items" />
    </div>
  );
};

export const DuesTab: React.FC = () => {
  const { tenantExitCases } = useApp();
  const staff = useStaff();
  const [open, setOpen] = useState<string | null>(null);
  const rows = tenantExitCases.filter((c) => c.stage !== 'WITHDRAWN').sort((a, b) => b.lastDay.localeCompare(a.lastDay));
  const pg = usePaged(rows, 10);
  const current = tenantExitCases.find((c) => c.id === open);
  return (
    <div className="hr-table-card">
      <div className="pr-table-scroll">
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Leaver</th>
              <th>Exit</th>
              <th>Payroll</th>
              <th className="num">Gross</th>
              <th className="num">Deductions</th>
              <th className="num">Net</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pg.rows.map((c) => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(c.id)}>
                <td>
                  <strong>{staff(c.staffId)?.fullName}</strong>
                  <div className="muted">{c.id}</div>
                </td>
                <td>{EXIT_LABEL[c.kind]}</td>
                <td>{c.lastDay.slice(0, 7)}</td>
                <NetCell c={c} />
                <td>
                  <span className={`digicraft-status-pill ${stageCls(c.stage)}`}>{c.dues?.approvedBy ? STAGE_LABEL[c.stage] : c.dues ? 'Awaiting Finance' : 'Estimate'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="leavers" />
      <div className="pr-muted" style={{ padding: '0 16px 12px' }}>
        Estimates use the exit-month payslip: pro-rated salary, notice, severance or gratuity, leave pay, statutory deductions and full recovery of loans and advances.
      </div>
      {current && <ExitCaseModal c={current} onClose={() => setOpen(null)} />}
    </div>
  );
};

export const AnalyticsTab: React.FC = () => {
  const { tenantExitCases, tenantEmployees } = useApp();
  const staff = useStaff();
  const year = new Date().getFullYear();
  const leavers = tenantExitCases.filter((c) => c.stage !== 'WITHDRAWN' && c.lastDay.startsWith(String(year)));
  const headcount = tenantEmployees.filter((e) => e.status !== 'TERMINATED').length;
  const avg = headcount + leavers.length / 2;
  const voluntary = leavers.filter((c) => VOLUNTARY.includes(c.kind)).length;
  const reasons = useMemo(() => {
    const m = new Map<string, number>();
    tenantExitCases.forEach((c) => c.interview?.reasons.forEach((r) => m.set(r, (m.get(r) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [tenantExitCases]);
  const byDept = new Map<string, number>();
  leavers.forEach((c) => {
    const d = staff(c.staffId)?.department ?? '—';
    byDept.set(d, (byDept.get(d) ?? 0) + 1);
  });
  const tenure = leavers.map((c) => {
    const e = staff(c.staffId);
    return e ? serviceYears(e, c.lastDay) : 0;
  });
  const max = Math.max(1, ...reasons.map((r) => r[1]));
  return (
    <>
      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Turnover {year} (to date)</div>
          <div className="hr-stat-value">{((leavers.length / Math.max(1, avg)) * 100).toFixed(1)}%</div>
          <div className="hr-stat-subtext">
            {leavers.length} leavers ÷ average headcount {avg.toFixed(1)}
          </div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Voluntary / involuntary</div>
          <div className="hr-stat-value">
            {voluntary} / {leavers.length - voluntary}
          </div>
          <div className="hr-stat-subtext">Resignation and retirement count as voluntary</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Regrettable losses</div>
          <div className="hr-stat-value" style={{ color: '#d97706' }}>
            {tenantExitCases.filter((c) => c.interview?.regrettable).length}
          </div>
          <div className="hr-stat-subtext">People we wanted to keep</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Average service of leavers</div>
          <div className="hr-stat-value">{tenure.length ? (tenure.reduce((s, x) => s + x, 0) / tenure.length).toFixed(1) : '0'} yrs</div>
          <div className="hr-stat-subtext">Completed years at the last day</div>
        </div>
      </div>
      <div className="pr-builder" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <div className="pr-card">
          <div className="pr-card-head">
            <div>
              <h3>Why people leave</h3>
              <p>From exit interviews</p>
            </div>
          </div>
          {reasons.length === 0 && <div className="pr-muted">No exit interviews yet.</div>}
          {reasons.map(([r, n]) => (
            <div key={r} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 30px', gap: 8, alignItems: 'center', fontSize: 12.5, marginBottom: 6 }}>
              <span>{r}</span>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--border-subtle)' }}>
                <div style={{ width: `${(n / max) * 100}%`, height: '100%', borderRadius: 4, background: 'var(--brand-primary)' }} />
              </div>
              <strong>{n}</strong>
            </div>
          ))}
        </div>
        <div className="pr-card">
          <div className="pr-card-head">
            <div>
              <h3>Leavers by department</h3>
              <p>{year}, including people still serving notice</p>
            </div>
          </div>
          <table className="hr-table pr-table">
            <tbody>
              {[...byDept.entries()].map(([d, n]) => (
                <tr key={d}>
                  <td>{d}</td>
                  <td className="num">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="req-section-title" style={{ marginTop: 14 }}>
            Exit interview answers
          </div>
          <table className="hr-table pr-table">
            <tbody>
              {tenantExitCases
                .filter((c) => c.interview)
                .map((c) => (
                  <tr key={c.id}>
                    <td>
                      {staff(c.staffId)?.fullName}
                      <div className="muted">“{c.interview!.comments}”</div>
                    </td>
                    <td className="num">{c.interview!.rating}/5</td>
                    <td className="muted">{c.interview!.wouldRejoin ? 'Would return' : 'Would not return'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};
