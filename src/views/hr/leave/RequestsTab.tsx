import React, { useMemo, useState } from 'react';
import { CheckCircle2, Paperclip, XCircle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { LeaveRequest } from '../../../types';
import { hrApproverFor } from '../../../data/leaveConfig';
import { usePaged, Pager } from '../../../components/common/Pager';
import { codeOf, countLeaveDays, leaveCodes, leaveName, typeAt, todayIso, typeLedger, validateLeaveRequest, workflowFor } from '../../../data/leaveEngine';
import { RecordAttachments } from '../hcm/ui';
import { ApprovalChain, Drawer, Messages, StatusPill, TXN_LABEL, fmtDate, fmtDays, fmtNum, fmtShort, signed } from './shared';

type StatusFilter = 'ALL' | LeaveRequest['status'];
const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'PENDING_APPROVAL', label: 'Pending' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Declined' },
  { id: 'CANCELLED', label: 'Cancelled' }
];

export const RequestsTab: React.FC = () => {
  const { tenantLeave, tenantEmployees, leaveCfg, approveLeaveRequest, rejectLeaveRequest } = useApp();
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [type, setType] = useState('ALL');
  const [dept, setDept] = useState('ALL');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const today = todayIso();
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);

  const deptOf = useMemo(() => new Map(tenantEmployees.map((e) => [e.staffId, e.department])), [tenantEmployees]);
  const departments = useMemo(() => [...new Set(tenantEmployees.map((e) => e.department))].sort(), [tenantEmployees]);

  const stats = useMemo(() => {
    const pending = tenantLeave.filter((r) => r.status === 'PENDING_APPROVAL');
    const onLeave = tenantLeave.filter((r) => r.status === 'APPROVED' && r.startDate <= today && r.endDate >= today);
    const approvedMonth = tenantLeave.filter((r) => r.status === 'APPROVED' && (r.decidedOn ?? '').startsWith(month));
    // Days actually taken this year up to today, counted the same way as the request
    const ytd = tenantLeave
      .filter((r) => r.status === 'APPROVED' && r.startDate <= today && r.endDate >= `${year}-01-01`)
      .reduce((s, r) => {
        const t = typeAt(codeOf(r.leaveType, leaveCfg), r.startDate, leaveCfg);
        const from = r.startDate < `${year}-01-01` ? `${year}-01-01` : r.startDate;
        const to = r.endDate > today ? today : r.endDate;
        return s + (r.halfDay ? 0.5 : countLeaveDays(from, to, t.countBasis, leaveCfg, false, undefined, r.orgId));
      }, 0);
    return { pending, onLeave, approvedMonth, ytd };
  }, [tenantLeave, today, month, year, leaveCfg]);

  const rows = useMemo(
    () =>
      tenantLeave
        .filter((r) => status === 'ALL' || r.status === status)
        .filter((r) => type === 'ALL' || r.leaveType === type)
        .filter((r) => dept === 'ALL' || deptOf.get(r.staffId) === dept)
        .filter((r) => !q || `${r.staffName} ${r.staffId} ${r.id}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => {
          const p = Number(b.status === 'PENDING_APPROVAL') - Number(a.status === 'PENDING_APPROVAL');
          return p || b.startDate.localeCompare(a.startDate);
        }),
    [tenantLeave, status, type, dept, q, deptOf]
  );
  const pg = usePaged(rows, 25, `${status}|${type}|${dept}|${q}`);
  const open = tenantLeave.find((r) => r.id === openId);
  const atHr = stats.pending.filter((r) => r.currentStep === 'HR').length;

  return (
    <>
      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Waiting for a decision</div>
          <div className="hr-stat-value" style={{ color: stats.pending.length ? 'var(--status-warning)' : undefined }}>
            {stats.pending.length}
          </div>
          <div className="hr-stat-subtext">
            {stats.pending.length - atHr} with supervisors · {atHr} with HR
          </div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">On leave today</div>
          <div className="hr-stat-value">{stats.onLeave.length}</div>
          <div className="hr-stat-subtext">{stats.onLeave.map((r) => r.staffName.split(' ')[0]).join(', ') || 'Everyone is in'}</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Approved this month</div>
          <div className="hr-stat-value">{stats.approvedMonth.length}</div>
          <div className="hr-stat-subtext">{fmtDays(stats.approvedMonth.reduce((s, r) => s + r.daysCount, 0))} approved since {fmtShort(`${month}-01`)}</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Days taken {year} to date</div>
          <div className="hr-stat-value" style={{ color: 'var(--brand-primary)' }}>
            {fmtNum(stats.ytd)}
          </div>
          <div className="hr-stat-subtext">Approved leave on or before today, all types</div>
        </div>
      </div>

      <div className="hr-table-card">
        <div className="lv-toolbar">
          <div className="digicraft-filter-pills">
            {FILTERS.map((f) => (
              <button key={f.id} className={`digicraft-filter-pill ${status === f.id ? 'active' : ''}`} onClick={() => setStatus(f.id)}>
                {f.label} ({f.id === 'ALL' ? tenantLeave.length : tenantLeave.filter((r) => r.status === f.id).length})
              </button>
            ))}
          </div>
          <span className="lv-grow" />
          <select className="form-control" value={type} onChange={(e) => setType(e.target.value)} aria-label="Leave type">
            <option value="ALL">All leave types</option>
            {leaveCodes(leaveCfg).map((c) => (
              <option key={c} value={leaveName(c, leaveCfg)}>
                {leaveName(c, leaveCfg)}
              </option>
            ))}
          </select>
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
                <th>Leave type</th>
                <th>Dates</th>
                <th className="lv-num">Days</th>
                <th>Approval</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="lv-empty">
                    No leave requests match these filters.
                  </td>
                </tr>
              )}
              {pg.rows.map((r) => {
                const steps = workflowFor(r, leaveCfg);
                return (
                  <tr key={r.id} className="lv-click" onClick={() => setOpenId(r.id)}>
                    <td>
                      <div className="lv-strong">{r.staffName}</div>
                      <div className="lv-muted">
                        {r.staffId} · {deptOf.get(r.staffId) ?? '—'}
                      </div>
                    </td>
                    <td>
                      <span className="digicraft-badge-light">{r.leaveType}</span>
                      {r.backdated && <div className="lv-muted">Backdated</div>}
                    </td>
                    <td>
                      <div>
                        {fmtShort(r.startDate)} – {fmtDate(r.endDate)}
                      </div>
                      <div className="lv-muted">
                        {r.id} · applied {fmtShort(r.appliedOn)}
                      </div>
                    </td>
                    <td className="lv-num">
                      {fmtNum(r.daysCount)}
                      {r.halfDay && <div className="lv-muted">half day</div>}
                    </td>
                    <td>
                      <ApprovalChain request={r} steps={steps} />
                    </td>
                    <td>
                      <StatusPill status={r.status} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {r.status === 'PENDING_APPROVAL' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => approveLeaveRequest(r.id)} title={`Approve at the ${r.currentStep === 'HR' ? 'HR' : 'supervisor'} step`}>
                            <CheckCircle2 size={12} color="var(--status-success)" /> {r.currentStep === 'HR' ? 'HR approve' : 'Approve'}
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setOpenId(r.id)}>
                            <XCircle size={12} color="var(--status-critical)" /> Decline
                          </button>
                        </div>
                      ) : (
                        <button className="btn btn-secondary btn-sm" onClick={() => setOpenId(r.id)}>
                          Details
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="requests" />
      </div>

      {open && <RequestDrawer request={open} onClose={() => setOpenId(null)} onReject={rejectLeaveRequest} />}
    </>
  );
};

const RequestDrawer: React.FC<{ request: LeaveRequest; onClose: () => void; onReject: (id: string, comment?: string) => void }> = ({ request: r, onClose, onReject }) => {
  const { tenantEmployees, hrEmployees, leaveRequests, leaveCfg, approveLeaveRequest, cancelLeaveRequest } = useApp();
  const [comment, setComment] = useState('');
  const [declining, setDeclining] = useState(false);
  const e = tenantEmployees.find((x) => x.staffId === r.staffId);
  const code = codeOf(r.leaveType, leaveCfg);
  const steps = workflowFor(r, leaveCfg);
  const t = typeAt(code, r.startDate, leaveCfg);
  const today = todayIso();
  const rows = e ? typeLedger(e, code, leaveRequests, leaveCfg.adjustments, today, leaveCfg).rows : [];
  const available = rows.reduce((s, x) => s + x.days, 0);
  const own = rows.filter((x) => x.sourceRef === r.id);
  // Re-check the request against today's rules (the days are already reserved, so leave it out of the balance check)
  const recheck = e && r.status === 'PENDING_APPROVAL' ? validateLeaveRequest(e, { code, startDate: r.startDate, endDate: r.endDate, halfDay: r.halfDay, attachment: r.attachment, submittedBy: r.submittedBy ?? 'HR', excludeId: r.id }, leaveRequests, leaveCfg) : null;
  const flags = recheck ? recheck.errors.filter((m) => !m.includes('notice') && !m.includes('backdated') && !m.includes('Backdated')) : [];
  const canCancel = r.status === 'PENDING_APPROVAL' || (r.status === 'APPROVED' && r.startDate > today);
  const hr = hrApproverFor(r.orgId, hrEmployees);

  return (
    <Drawer
      title={`${r.leaveType} · ${r.staffName}`}
      subtitle={`${r.id} · ${fmtDate(r.startDate)} to ${fmtDate(r.endDate)} · ${fmtDays(r.daysCount)}`}
      onClose={onClose}
      footer={
        r.status === 'PENDING_APPROVAL' ? (
          <>
            <input className="form-control" style={{ flex: '1 1 200px' }} placeholder={declining ? 'Reason for declining (required)' : 'Comment (optional)'} value={comment} onChange={(ev) => setComment(ev.target.value)} />
            {declining ? (
              <>
                <button className="btn btn-secondary" onClick={() => setDeclining(false)}>
                  Back
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!comment.trim()}
                  onClick={() => {
                    onReject(r.id, comment.trim());
                    onClose();
                  }}
                >
                  Decline and release days
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-secondary" onClick={() => setDeclining(true)}>
                  <XCircle size={14} /> Decline
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    approveLeaveRequest(r.id, comment.trim() || undefined);
                    onClose();
                  }}
                >
                  <CheckCircle2 size={14} /> Approve {r.currentStep === 'HR' ? 'as HR' : 'as supervisor'}
                </button>
              </>
            )}
          </>
        ) : canCancel ? (
          <button
            className="btn btn-secondary"
            onClick={() => {
              cancelLeaveRequest(r.id, 'HR');
              onClose();
            }}
          >
            Cancel approved leave and credit the days back
          </button>
        ) : undefined
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <StatusPill status={r.status} />
        <ApprovalChain request={r} steps={steps} />
        {r.attachment && (
          <span className="lv-muted">
            <Paperclip size={12} /> Document attached
          </span>
        )}
      </div>

      <dl className="lv-kv">
        <div>
          <dt>Employee</dt>
          <dd>
            {r.staffName} ({r.staffId})
          </dd>
        </div>
        <div>
          <dt>Department</dt>
          <dd>{e?.department ?? '—'}</dd>
        </div>
        <div>
          <dt>Supervisor</dt>
          <dd>{r.approverName ?? '—'}</dd>
        </div>
        <div>
          <dt>HR step</dt>
          <dd>{steps.includes('HR') ? hr?.fullName ?? 'HR office' : 'Not required for this type'}</dd>
        </div>
        <div>
          <dt>Counted as</dt>
          <dd>
            {fmtDays(r.daysCount)} ({t.countBasis.toLowerCase()}
            {r.halfDay ? ', half day' : ''})
          </dd>
        </div>
        <div>
          <dt>{t.name} available now</dt>
          <dd>{t.mode === 'UNTRACKED' ? 'Not tracked' : fmtDays(available)}</dd>
        </div>
      </dl>

      <div>
        <p className="lv-section-title">Reason</p>
        <div className="lv-formula">{r.reason}</div>
      </div>

      {(flags.length > 0 || r.backdated) && (
        <Messages errors={flags} warnings={r.backdated ? [`Backdated by ${r.submittedBy === 'SUPERVISOR' ? 'the supervisor' : 'HR'}: an HR step is required.`] : []} />
      )}

      <div>
        <p className="lv-section-title">Approval history</p>
        <ul className="lv-history">
          <li>
            <b>{fmtDate(r.appliedOn)}</b> Submitted by {r.submittedBy === 'SUPERVISOR' ? 'the supervisor' : r.submittedBy === 'HR' ? 'HR' : r.staffName}
          </li>
          {(r.approvals ?? []).map((a, i) => (
            <li key={i}>
              <b>{fmtDate(a.at)}</b>
              <span>
                {a.step === 'SUPERVISOR' ? 'Supervisor' : 'HR'} · {a.by} · {a.action.toLowerCase()}
                {a.comment ? ` — “${a.comment}”` : ''}
              </span>
            </li>
          ))}
          {!r.approvals?.length && r.decidedOn && (
            <li>
              <b>{fmtDate(r.decidedOn)}</b> {r.status.toLowerCase()} by {r.approverName}
              {r.approverComment ? ` — “${r.approverComment}”` : ''}
            </li>
          )}
          {r.status === 'PENDING_APPROVAL' && (
            <li>
              <b>Now</b> Waiting for {r.currentStep === 'HR' ? `HR (${hr?.fullName ?? 'HR office'})` : r.approverName ?? 'the supervisor'}
            </li>
          )}
        </ul>
      </div>

      <div>
        <p className="lv-section-title">Ledger rows for this request</p>
        {own.length === 0 ? (
          <p className="lv-muted">No ledger rows yet.</p>
        ) : (
          <div className="lv-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transaction</th>
                  <th className="lv-num">Days</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {own.map((x) => (
                  <tr key={x.id}>
                    <td>{fmtDate(x.date)}</td>
                    <td>{TXN_LABEL[x.txn]}</td>
                    <td className={`lv-num ${x.days < 0 ? 'lv-neg' : 'lv-pos'}`}>{signed(x.days)}</td>
                    <td className="lv-wrap">{x.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <RecordAttachments owner={`LEAVE-${r.id}`} title="Supporting documents (medical certificate, letters)" />
      </div>
    </Drawer>
  );
};
