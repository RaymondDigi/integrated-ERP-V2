import React, { useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { REQUEST_APPROVERS, type EssRequest } from '../../../context/essState';
import { Pager, usePaged } from '../../../components/common/Pager';

const fmt = (iso?: string) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const kes = (n?: number) => (n ? `KES ${Math.round(n).toLocaleString()}` : '');
const CLS: Record<EssRequest['status'], string> = { Submitted: 'info', 'In Review': 'warning', Approved: 'success', Completed: 'success', Declined: 'danger' };

/** What approving does, so the decider knows before clicking. */
const effect = (r: EssRequest) =>
  r.type === 'Salary Advance'
    ? `Creates a salary advance loan of ${kes(r.amountKes)}, recovered over ${r.months ?? 1} month(s) from the open payroll`
    : r.type === 'Expense Reimbursement'
      ? `Adds a non-taxable reimbursement of ${kes(r.amountKes)} to the open payroll`
      : r.type === 'Bank / M-Pesa Details Change'
        ? `Payroll pays future salaries to ${r.newValue}`
        : r.type === 'Resignation'
          ? `Exit case ${r.link ?? ''} is already open in Separation`
          : r.type === 'Training Request'
            ? 'Already listed in Training › Training needs'
            : 'Marks the request done and tells the employee';

/** Requests employees raised in the self-service portal, decided by HR, payroll and Finance. */
export const EmployeeRequestsTab: React.FC = () => {
  const { essRequests, decideEssRequest, hrEmployees, selectedOrgId } = useApp();
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const [actor, setActor] = useState('Rose Chepkoech');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const staff = (id: string) => hrEmployees.find((e) => e.staffId === id);
  const rows = essRequests
    .filter((r) => staff(r.staffId)?.orgId === selectedOrgId || r.staffId === 'KHE-0102')
    .filter((r) => (status === 'all' ? true : r.status === 'Submitted' || r.status === 'In Review'))
    .sort((a, b) => b.submittedOn.localeCompare(a.submittedOn));
  const pg = usePaged(rows, 10, status);
  const people = [...new Set(Object.values(REQUEST_APPROVERS).flat())];
  return (
    <div className="hr-table-card">
      <div className="pr-toolbar" style={{ padding: '12px 16px' }}>
        <select className="form-control" value={status} onChange={(ev) => setStatus(ev.target.value as 'open' | 'all')} aria-label="Show">
          <option value="open">Waiting for a decision</option>
          <option value="all">All requests</option>
        </select>
        <span className="pr-muted" style={{ marginLeft: 'auto' }}>
          Acting as
        </span>
        <select className="form-control" value={actor} onChange={(ev) => setActor(ev.target.value)} aria-label="Acting as">
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <div className="pr-table-scroll">
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Request</th>
              <th>Employee</th>
              <th>Details</th>
              <th>Status</th>
              <th style={{ minWidth: 260 }}>Decision</th>
            </tr>
          </thead>
          <tbody>
            {pg.rows.map((r) => {
              const e = staff(r.staffId);
              const open = r.status === 'Submitted' || (r.status === 'In Review' && !['Resignation', 'Training Request'].includes(r.type));
              const can = REQUEST_APPROVERS[r.type].includes(actor) && e?.fullName !== actor;
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.type}</strong>
                    <div className="muted">
                      {r.id} · {fmt(r.submittedOn)}
                    </div>
                  </td>
                  <td>
                    {e?.fullName ?? r.staffId}
                    <div className="muted">
                      {r.staffId} · {e?.department}
                    </div>
                  </td>
                  <td style={{ maxWidth: 300 }}>
                    {r.details}
                    {(r.amountKes || r.newValue || r.lastDay) && (
                      <div className="muted">
                        {kes(r.amountKes)}
                        {r.newValue ? ` New account: ${r.newValue}` : ''}
                        {r.lastDay ? ` Last day ${fmt(r.lastDay)}` : ''}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`digicraft-status-pill ${CLS[r.status]}`}>{r.status}</span>
                    {r.decidedBy && (
                      <div className="muted">
                        {r.decidedBy}, {fmt(r.decidedOn)}
                      </div>
                    )}
                  </td>
                  <td>
                    {open ? (
                      <>
                        <div className="muted" style={{ marginBottom: 4 }}>
                          {effect(r)}. Decided by {REQUEST_APPROVERS[r.type].join(' or ')}.
                        </div>
                        <input className="form-control" style={{ marginBottom: 6 }} placeholder="Note to the employee (required to decline)" value={notes[r.id] ?? ''} onChange={(ev) => setNotes({ ...notes, [r.id]: ev.target.value })} />
                        <button className="btn btn-primary" style={{ padding: '3px 10px', fontSize: 11 }} disabled={!can} onClick={() => decideEssRequest(r.id, true, actor, notes[r.id])}>
                          <CheckCircle2 size={12} /> Approve
                        </button>{' '}
                        <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }} disabled={!can} onClick={() => decideEssRequest(r.id, false, actor, notes[r.id])}>
                          <XCircle size={12} /> Decline
                        </button>
                        {!can && <div className="muted">{actor} can’t decide this one.</div>}
                      </>
                    ) : (
                      <span className="muted">{r.note ?? (r.link ? `Linked: ${r.link}` : '—')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {pg.total === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>
                  No requests waiting.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="requests" />
    </div>
  );
};
