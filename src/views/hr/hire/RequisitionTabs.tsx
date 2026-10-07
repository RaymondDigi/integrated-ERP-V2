import React, { useMemo, useState } from 'react';
import { Search, CheckCircle2, Circle, Clock, Pencil, Send, XCircle, Undo2, ExternalLink, Ban } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { EmployeeRequisition } from '../../../types';
import { usePaged, Pager } from '../../../components/common/Pager';
import { REQ_STEP_LABEL, type ReqStep } from '../../../data/hireConfig';
import { approverCandidates, approverFor, budgetCheck, establishmentRows, fmtDate, kes, requisitionCost, shortGrade, daysBetween, todayIso, type EstablishmentRow } from '../../../data/hireEngine';
import { Card, Drawer, Empty, Field, Modal, Pill, Progress, Stat, PersonSelect, type Tone } from './shared';
import { RequisitionForm } from './RequisitionForm';

export const REQ_STATUS: Record<EmployeeRequisition['status'], { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'info' },
  PENDING_APPROVAL: { label: 'In approval', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  IN_RECRUITMENT: { label: 'Recruiting', tone: 'primary' },
  FILLED: { label: 'Filled', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'info' }
};

const useRows = () => {
  const { selectedOrgId, hrEmployees, requisitions, candidates, onboardingRecords, establishmentPlans } = useApp();
  return useMemo(
    () => establishmentRows(selectedOrgId, hrEmployees, requisitions, candidates, onboardingRecords, establishmentPlans),
    [selectedOrgId, hrEmployees, requisitions, candidates, onboardingRecords, establishmentPlans]
  );
};

/* ------------------------------------------------------------------ register */

export const RegisterTab: React.FC = () => {
  const { tenantRequisitions } = useApp();
  const rows = useRows();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const [dept, setDept] = useState('All');
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const approved = rows.reduce((n, r) => n + r.approved, 0);
  const inPost = rows.reduce((n, r) => n + r.inPost, 0);
  const open = rows.reduce((n, r) => n + r.open, 0);
  const budget = rows.reduce((n, r) => n + r.budgetKes, 0);
  const used = rows.reduce((n, r) => n + r.costInPost + r.committed, 0);
  const pending = tenantRequisitions.filter((r) => r.status === 'PENDING_APPROVAL');

  const list = tenantRequisitions
    .filter((r) => (status === 'All' || r.status === status) && (dept === 'All' || r.department === dept))
    .filter((r) => !q || `${r.requisitionNo} ${r.title} ${r.requester} ${r.department}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.submittedDate ?? b.requestedDate).localeCompare(a.submittedDate ?? a.requestedDate));
  const pg = usePaged(list, 10, `${q}|${status}|${dept}`);
  const current = tenantRequisitions.find((r) => r.id === openId);

  return (
    <>
      <div className="hr-stats-row">
        <Stat label="Approved establishment" value={`${approved} positions`} sub={`${inPost} in post · ${Math.max(0, approved - inPost)} not yet filled`} />
        <Stat label="Open positions" value={`${open} recruiting`} sub={`${tenantRequisitions.filter((r) => r.status === 'IN_RECRUITMENT').length} requisitions with a live vacancy`} tone="var(--brand-primary)" />
        <Stat label="Waiting for approval" value={`${pending.length} requisitions`} sub={`${pending.reduce((n, r) => n + r.headcountRequired, 0)} positions, ${kes(pending.reduce((n, r) => n + requisitionCost(r), 0))} a year`} tone="#d97706" />
        <Stat label="Headcount budget used" value={`${budget ? Math.round((used / budget) * 100) : 0}%`} sub={`${kes(used)} of ${kes(budget)} (in post + committed)`} tone={used > budget ? 'var(--status-critical)' : '#10b981'} />
      </div>

      <Card
        title="Requisition register"
        sub="Every request for new or replacement staff, with its approval stage."
        actions={
          <>
            <div className="digicraft-search-box grow">
              <Search size={15} className="digicraft-search-icon" />
              <input placeholder="Search number, title, requester" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search requisitions" />
            </div>
            <select className="form-control" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="All">All statuses</option>
              {Object.entries(REQ_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
            <select className="form-control" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
              <option value="All">All departments</option>
              {rows.map((r) => (
                <option key={r.department}>{r.department}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
              New requisition
            </button>
          </>
        }
      >
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Req no.</th>
                <th>Position</th>
                <th>Department</th>
                <th className="hi-num">Heads</th>
                <th className="hi-num">Annual cost</th>
                <th>Requested by</th>
                <th>Stage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={8}>No requisitions match.</Empty>}
              {pg.rows.map((r) => (
                <tr key={r.id} className="hi-click" onClick={() => setOpenId(r.id)}>
                  <td className="hi-mono">{r.requisitionNo}</td>
                  <td>
                    <strong>{r.title}</strong>
                    <div className="hi-sub">
                      {shortGrade(r.gradeScale)} · {r.vacancyReason ?? 'New position'}
                      {r.priority && r.priority !== 'Normal' ? ` · ${r.priority}` : ''}
                    </div>
                  </td>
                  <td>{r.department}</td>
                  <td className="hi-num">{r.headcountRequired}</td>
                  <td className="hi-num">{kes(requisitionCost(r))}</td>
                  <td>
                    {r.requester}
                    <div className="hi-sub">{fmtDate(r.submittedDate ?? r.requestedDate)}</div>
                  </td>
                  <td>{r.status === 'PENDING_APPROVAL' ? <StageCell r={r} /> : r.vacancyId ? <span className="hi-sub">{r.vacancyId}</span> : '—'}</td>
                  <td>
                    <Pill tone={REQ_STATUS[r.status].tone}>{REQ_STATUS[r.status].label}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="requisitions" />
      </Card>
      {current && <RequisitionDrawer r={current} rows={rows} onClose={() => setOpenId(null)} />}
      {formOpen && <RequisitionForm onClose={() => setFormOpen(false)} />}
    </>
  );
};

const StageCell: React.FC<{ r: EmployeeRequisition }> = ({ r }) => {
  const { hrEmployees } = useApp();
  const step = r.currentStep ?? 'HOD';
  const who = approverFor(step, r, hrEmployees);
  return (
    <>
      <strong style={{ fontSize: 12 }}>{REQ_STEP_LABEL[step]}</strong>
      <div className="hi-sub">{who?.fullName ?? 'No approver'}</div>
    </>
  );
};

/* ------------------------------------------------------------------ drawer */

const ApprovalChain: React.FC<{ r: EmployeeRequisition; steps: ReqStep[] }> = ({ r, steps }) => {
  const { hrEmployees } = useApp();
  const latestSubmit = (r.approvals ?? []).map((a) => a.action).lastIndexOf('SUBMITTED');
  const current = (r.approvals ?? []).slice(latestSubmit + 1);
  const ended = ['REJECTED', 'CANCELLED'].includes(r.status);
  return (
    <ol className="hi-chain">
      <li className="done">
        <CheckCircle2 size={16} />
        <div>
          <strong>Requested</strong>
          <span>
            {r.requester} · {fmtDate(r.submittedDate ?? r.requestedDate)}
            {r.status === 'DRAFT' ? ' (draft — not submitted)' : ''}
          </span>
        </div>
      </li>
      {steps.map((s) => {
        const d = current.find((a) => a.step === s);
        const isCurrent = r.status === 'PENDING_APPROVAL' && (r.currentStep ?? 'HOD') === s;
        const who = !d && (isCurrent || r.status === 'PENDING_APPROVAL') ? approverFor(s, r, hrEmployees) : undefined;
        const cls = d?.action === 'APPROVED' ? 'done' : d?.action === 'REJECTED' ? 'bad' : isCurrent ? 'current' : '';
        return (
          <li key={s} className={cls}>
            {d?.action === 'APPROVED' ? <CheckCircle2 size={16} /> : d?.action === 'REJECTED' ? <XCircle size={16} /> : isCurrent ? <Clock size={16} /> : <Circle size={16} />}
            <div>
              <strong>{REQ_STEP_LABEL[s]}</strong>
              <span>
                {d
                  ? `${d.action === 'APPROVED' ? 'Approved' : 'Rejected'} by ${d.by} · ${fmtDate(d.at)}`
                  : ended
                  ? 'Not reached'
                  : r.status === 'DRAFT'
                  ? 'After submission'
                  : who
                  ? `${isCurrent ? 'Waiting for' : 'Next:'} ${who.fullName}`
                  : 'No eligible approver'}
              </span>
              {d?.comment && <em>“{d.comment}”</em>}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

const RequisitionDrawer: React.FC<{ r: EmployeeRequisition; rows: EstablishmentRow[]; onClose: () => void }> = ({ r, rows, onClose }) => {
  const { hrEmployees, submitRequisition, cancelRequisition, setCurrentView, setModuleTab, tenantVacancies } = useApp();
  const [deciding, setDeciding] = useState(false);
  const [editing, setEditing] = useState(false);
  const check = budgetCheck(r, rows);
  const vac = tenantVacancies.find((v) => v.id === r.vacancyId);
  const replacing = hrEmployees.find((e) => e.staffId === r.replacingStaffId);

  return (
    <>
      <Drawer
        title={`${r.requisitionNo} · ${r.title}`}
        subtitle={`${r.department} · ${r.branch}`}
        onClose={onClose}
        footer={
          <div className="hi-actions">
            {r.status === 'DRAFT' && (
              <>
                <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                  <Pencil size={14} /> Edit
                </button>
                <button className="btn btn-primary" onClick={() => submitRequisition(r.id)}>
                  <Send size={14} /> Submit
                </button>
              </>
            )}
            {r.status === 'PENDING_APPROVAL' && (
              <button className="btn btn-primary" onClick={() => setDeciding(true)}>
                <CheckCircle2 size={14} /> Decide {REQ_STEP_LABEL[r.currentStep ?? 'HOD'].toLowerCase()} step
              </button>
            )}
            {['DRAFT', 'PENDING_APPROVAL'].includes(r.status) && (
              <button className="btn btn-secondary" onClick={() => cancelRequisition(r.id)}>
                <Ban size={14} /> Cancel requisition
              </button>
            )}
            {vac && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setModuleTab('recruitment', 'vacancies');
                  setCurrentView('recruitment');
                }}
              >
                <ExternalLink size={14} /> Vacancy {vac.id}
              </button>
            )}
          </div>
        }
      >
        <div className="pr-kv">
          <div>
            <span>Status</span>
            <strong>
              <Pill tone={REQ_STATUS[r.status].tone}>{REQ_STATUS[r.status].label}</Pill>
            </strong>
          </div>
          <div>
            <span>Requested by</span>
            <strong style={{ fontSize: 13 }}>{r.requester}</strong>
            <small>{fmtDate(r.requestedDate)}</small>
          </div>
          <div>
            <span>Reason</span>
            <strong style={{ fontSize: 13 }}>{r.vacancyReason ?? 'New position'}</strong>
            <small>{replacing ? `Replaces ${replacing.fullName}` : `Priority ${r.priority ?? 'Normal'}`}</small>
          </div>
        </div>

        <h4 className="hi-h4">Positions</h4>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Grade</th>
                <th className="hi-num">Qty</th>
                <th className="hi-num">Basic</th>
                <th>Needed by</th>
              </tr>
            </thead>
            <tbody>
              {(r.lines ?? []).map((l) => (
                <tr key={l.id}>
                  <td>{l.title}</td>
                  <td>{shortGrade(l.gradeScale)}</td>
                  <td className="hi-num">{l.headcount}</td>
                  <td className="hi-num">{l.monthlySalaryKes < 5_000 ? `${l.monthlySalaryKes}/day` : l.monthlySalaryKes.toLocaleString()}</td>
                  <td>{fmtDate(l.neededBy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hi-text">{r.justification}</p>

        <h4 className="hi-h4">Budget and establishment</h4>
        <div className="pr-kv">
          <div>
            <span>Annual cost</span>
            <strong>{kes(check.annualCost)}</strong>
            <small>From the payroll engine: basic + allowances + employer NSSF, AHL, NITA</small>
          </div>
          <div>
            <span>{r.department}</span>
            <strong>
              {check.row ? `${check.row.inPost + check.row.joining + check.row.open} / ${check.row.approved}` : '—'}
            </strong>
            <small>{check.row ? `${Math.max(0, check.row.vacant)} free positions` : 'No establishment plan'}</small>
          </div>
          <div>
            <span>Headroom after</span>
            <strong className={check.overBudget ? 'hi-neg' : ''}>{kes(check.headroomAfter)}</strong>
            <small>{check.overEstablishment ? `${check.excessPositions} above establishment` : check.overBudget ? 'Over budget' : 'Within plan'}</small>
          </div>
        </div>
        {['DRAFT', 'PENDING_APPROVAL'].includes(r.status) && (check.overBudget || check.overEstablishment) && (
          <div className="pr-note warn" style={{ marginTop: 10 }}>
            {check.overEstablishment ? `This adds ${check.excessPositions} position${check.excessPositions === 1 ? '' : 's'} above the approved establishment` : 'This exceeds the department headcount budget'}, so Finance must approve before the managing director.
          </div>
        )}

        <h4 className="hi-h4">Approval chain</h4>
        <ApprovalChain r={r} steps={check.steps} />
        {(r.approvals ?? []).some((a) => a.action === 'RETURNED' || a.action === 'CANCELLED') && (
          <div className="hi-sub" style={{ marginTop: 6 }}>
            {(r.approvals ?? [])
              .filter((a) => a.action === 'RETURNED' || a.action === 'CANCELLED')
              .map((a) => `${a.action === 'RETURNED' ? 'Returned' : 'Cancelled'} by ${a.by} on ${fmtDate(a.at)}${a.comment ? `: ${a.comment}` : ''}`)
              .join(' · ')}
          </div>
        )}
      </Drawer>
      {deciding && <DecideModal r={r} onClose={() => setDeciding(false)} />}
      {editing && <RequisitionForm editing={r} onClose={() => setEditing(false)} />}
    </>
  );
};

const DecideModal: React.FC<{ r: EmployeeRequisition; onClose: () => void }> = ({ r, onClose }) => {
  const { hrEmployees, decideRequisition } = useApp();
  const step = r.currentStep ?? 'HOD';
  const expected = approverFor(step, r, hrEmployees);
  const eligible = approverCandidates(step, r, hrEmployees);
  const people = [...eligible, ...hrEmployees.filter((e) => e.staffId === r.requesterStaffId || (r.approvals ?? []).some((a) => a.byStaffId === e.staffId))].filter((x, i, xs) => xs.findIndex((y) => y.staffId === x.staffId) === i);
  const [actor, setActor] = useState(expected?.staffId ?? '');
  const [comment, setComment] = useState('');
  const act = (a: 'APPROVE' | 'RETURN' | 'REJECT') => decideRequisition(r.id, a, actor, comment) && onClose();
  return (
    <Modal
      title={`${REQ_STEP_LABEL[step]} decision · ${r.requisitionNo}`}
      subtitle={`${r.title} · ${r.headcountRequired} position${r.headcountRequired === 1 ? '' : 's'}`}
      onClose={onClose}
      width={560}
      footer={
        <div className="hi-actions">
          <button className="btn btn-secondary" onClick={() => act('RETURN')}>
            <Undo2 size={14} /> Return to requester
          </button>
          <button className="btn btn-secondary" onClick={() => act('REJECT')}>
            <XCircle size={14} /> Reject
          </button>
          <button className="btn btn-primary" onClick={() => act('APPROVE')}>
            <CheckCircle2 size={14} /> Approve
          </button>
        </div>
      }
    >
      <Field label="Acting as" hint={`Requester ${r.requester} and anyone who approved an earlier step cannot decide this step.`}>
        <PersonSelect value={actor} onChange={setActor} people={people} />
      </Field>
      <Field label="Comment" hint="Required to return or reject.">
        <textarea className="form-control" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
    </Modal>
  );
};

/* ------------------------------------------------------------------ approvals queue */

export const ApprovalsTab: React.FC = () => {
  const { tenantRequisitions, hrEmployees } = useApp();
  const rows = useRows();
  const [openId, setOpenId] = useState<string | null>(null);
  const pending = tenantRequisitions.filter((r) => r.status === 'PENDING_APPROVAL').sort((a, b) => (a.submittedDate ?? '').localeCompare(b.submittedDate ?? ''));
  const decisions = tenantRequisitions
    .flatMap((r) => (r.approvals ?? []).filter((a) => a.action !== 'SUBMITTED').map((a) => ({ r, a })))
    .sort((x, y) => y.a.at.localeCompare(x.a.at));
  const pg = usePaged(decisions, 10);
  const current = tenantRequisitions.find((r) => r.id === openId);

  return (
    <>
      <Card title="Waiting for a decision" sub="Oldest first. Each step goes to the first eligible approver; requesters never approve their own requisition.">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Req no.</th>
                <th>Position</th>
                <th>Step</th>
                <th>With</th>
                <th className="hi-num">Waiting</th>
                <th className="hi-num">Annual cost</th>
                <th>Check</th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 && <Empty cols={7}>Nothing is waiting for approval.</Empty>}
              {pending.map((r) => {
                const c = budgetCheck(r, rows);
                const step = r.currentStep ?? 'HOD';
                const wait = daysBetween((r.approvals ?? []).slice(-1)[0]?.at ?? r.submittedDate ?? r.requestedDate, todayIso());
                return (
                  <tr key={r.id} className="hi-click" onClick={() => setOpenId(r.id)}>
                    <td className="hi-mono">{r.requisitionNo}</td>
                    <td>
                      <strong>{r.title}</strong>
                      <div className="hi-sub">
                        {r.department} · {r.requester}
                      </div>
                    </td>
                    <td>
                      {REQ_STEP_LABEL[step]}
                      <div className="hi-sub">
                        step {c.steps.indexOf(step) + 1} of {c.steps.length}
                      </div>
                    </td>
                    <td>{approverFor(step, r, hrEmployees)?.fullName ?? '—'}</td>
                    <td className="hi-num">
                      <span className={wait > 5 ? 'hi-neg' : ''}>{wait} days</span>
                    </td>
                    <td className="hi-num">{kes(c.annualCost)}</td>
                    <td>
                      {c.overEstablishment ? <Pill tone="danger">Over establishment</Pill> : c.overBudget ? <Pill tone="warning">Over budget</Pill> : <Pill tone="success">Within plan</Pill>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Decision log" sub="Every approval, return and rejection with who made it.">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Req no.</th>
                <th>Step</th>
                <th>Decision</th>
                <th>By</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.map(({ r, a }, i) => (
                <tr key={`${r.id}-${i}`}>
                  <td>{fmtDate(a.at)}</td>
                  <td className="hi-mono">{r.requisitionNo}</td>
                  <td>{a.step === 'REQUESTER' ? 'Requester' : REQ_STEP_LABEL[a.step]}</td>
                  <td>
                    <Pill tone={a.action === 'APPROVED' ? 'success' : a.action === 'REJECTED' ? 'danger' : 'info'}>{a.action.toLowerCase()}</Pill>
                  </td>
                  <td>{a.by}</td>
                  <td className="hi-wrap">{a.comment ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="decisions" sizes={[10, 25]} />
      </Card>
      {current && <RequisitionDrawer r={current} rows={rows} onClose={() => setOpenId(null)} />}
    </>
  );
};

/* ------------------------------------------------------------------ establishment */

export const EstablishmentTab: React.FC = () => {
  const rows = useRows();
  const [editing, setEditing] = useState<EstablishmentRow | null>(null);
  const tot = rows.reduce(
    (t, r) => ({ approved: t.approved + r.approved, inPost: t.inPost + r.inPost, joining: t.joining + r.joining, open: t.open + r.open, pending: t.pending + r.pending, vacant: t.vacant + r.vacant, budget: t.budget + r.budgetKes, cost: t.cost + r.costInPost, committed: t.committed + r.committed }),
    { approved: 0, inPost: 0, joining: 0, open: 0, pending: 0, vacant: 0, budget: 0, cost: 0, committed: 0 }
  );
  return (
    <>
      <Card
        title="Establishment and headcount budget"
        sub="Approved positions per department against the employee master. Costs are annual: this month's basic from payroll, plus allowances, employer NSSF, housing levy and NITA."
      >
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Department</th>
                <th className="hi-num">Approved</th>
                <th className="hi-num">In post</th>
                <th className="hi-num">Joining</th>
                <th className="hi-num">Recruiting</th>
                <th className="hi-num">In approval</th>
                <th className="hi-num">Free</th>
                <th className="hi-num">Budget</th>
                <th className="hi-num">Cost in post</th>
                <th className="hi-num">Committed</th>
                <th className="hi-num">Headroom</th>
                <th style={{ minWidth: 110 }}>Used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.budgetKes ? Math.round(((r.costInPost + r.committed) / r.budgetKes) * 100) : 0;
                return (
                  <tr key={r.department}>
                    <td>
                      <strong>{r.department}</strong>
                      {!r.plan && <div className="hi-sub">No approved plan — figures estimated</div>}
                    </td>
                    <td className="hi-num">{r.approved}</td>
                    <td className="hi-num">{r.inPost}</td>
                    <td className="hi-num">{r.joining || '—'}</td>
                    <td className="hi-num">{r.open || '—'}</td>
                    <td className="hi-num">{r.pending || '—'}</td>
                    <td className={`hi-num ${r.vacant < 0 ? 'hi-neg' : ''}`}>{r.vacant}</td>
                    <td className="hi-num">{kes(r.budgetKes)}</td>
                    <td className="hi-num">{kes(r.costInPost)}</td>
                    <td className="hi-num">{r.committed ? kes(r.committed) : '—'}</td>
                    <td className={`hi-num ${r.headroom < 0 ? 'hi-neg' : ''}`}>{kes(r.headroom)}</td>
                    <td>
                      <Progress pct={pct} tone={pct > 100 ? 'danger' : pct > 92 ? 'warning' : 'success'} />
                      <div className="hi-sub">{pct}%</div>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditing(r)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="hi-num">{tot.approved}</td>
                <td className="hi-num">{tot.inPost}</td>
                <td className="hi-num">{tot.joining}</td>
                <td className="hi-num">{tot.open}</td>
                <td className="hi-num">{tot.pending}</td>
                <td className="hi-num">{tot.vacant}</td>
                <td className="hi-num">{kes(tot.budget)}</td>
                <td className="hi-num">{kes(tot.cost)}</td>
                <td className="hi-num">{kes(tot.committed)}</td>
                <td className="hi-num">{kes(tot.budget - tot.cost - tot.committed)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="hi-sub" style={{ marginTop: 10 }}>
          Joining = accepted offers not yet started. Recruiting = approved requisition positions without an accepted offer. Free = approved − in post − joining − recruiting; a request for more than the free positions goes to Finance.
        </p>
      </Card>
      {editing && <EstablishmentModal row={editing} onClose={() => setEditing(null)} />}
    </>
  );
};

const EstablishmentModal: React.FC<{ row: EstablishmentRow; onClose: () => void }> = ({ row, onClose }) => {
  const { saveEstablishment } = useApp();
  const [approved, setApproved] = useState(row.approved);
  const [budget, setBudget] = useState(row.budgetKes);
  const [note, setNote] = useState('');
  return (
    <Modal
      title={`Establishment · ${row.department}`}
      subtitle={`${row.inPost} in post, ${row.joining} joining, ${row.open} recruiting`}
      onClose={onClose}
      width={520}
      footer={
        <div className="hi-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!note.trim()) return;
              saveEstablishment(row.department, approved, budget, note);
              onClose();
            }}
            disabled={!note.trim()}
          >
            Save plan
          </button>
        </div>
      }
    >
      <div className="pr-form-grid">
        <Field label="Approved positions" hint={approved < row.inPost + row.joining ? 'Below current headcount — no new requisitions will fit.' : undefined}>
          <input className="form-control" type="number" min={0} value={approved} onChange={(e) => setApproved(Math.max(0, Number(e.target.value)))} />
        </Field>
        <Field label="Annual budget (KES)" hint={`Cost in post ${kes(row.costInPost)}`}>
          <input className="form-control" type="number" min={0} step={50000} value={budget} onChange={(e) => setBudget(Math.max(0, Number(e.target.value)))} />
        </Field>
        <Field label="Reason for the change" wide>
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Board resolution 14/2026" />
        </Field>
      </div>
    </Modal>
  );
};
