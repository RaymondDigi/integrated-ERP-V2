import React, { useState } from 'react';
import {
  Check,
  X,
  Printer,
  CalendarDays,
  Laptop,
  Smartphone,
  KeyRound,
  Package,
  ShieldCheck,
  AlertTriangle,
  Target,
  Star,
  ChevronDown,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { LeaveRequest } from '../../types';
import {
  ESS_EMPLOYEE,
  ESS_DISCIPLINARY,
  type EssDisciplinaryCase,
  ESS_ACTIVE_APPRAISAL,
  ESS_APPRAISAL_HISTORY,
  APPRAISAL_STAGES,
  RATING_LABELS,
  formatDate,
  todayIso,
  type EssAsset,
  type EssRequestType,
  type AppraisalGoal,
  type AppraisalStage,
  type AppraisalRecord
} from './essData';

/** Prints only the element marked .ess-print-area (see ess.css). */
export const printArea = () => {
  document.body.classList.add('ess-printing');
  const done = () => {
    document.body.classList.remove('ess-printing');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
};

/* ------------------------------------------------------------------ */
/* Leave approvals (for employees who approve leave)                   */
/* ------------------------------------------------------------------ */

export const EssApprovals: React.FC<{ pending: LeaveRequest[]; decided: LeaveRequest[] }> = ({ pending, decided }) => {
  const { approveLeaveRequest, rejectLeaveRequest } = useApp();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [declining, setDeclining] = useState<string | null>(null);

  const overlapsWith = (lv: LeaveRequest) =>
    pending
      .concat(decided.filter((d) => d.status === 'APPROVED'))
      .filter((o) => o.id !== lv.id && o.startDate <= lv.endDate && o.endDate >= lv.startDate)
      .map((o) => o.staffName.split(' ')[0]);

  return (
    <div className="ess-stack">
      <section className="ess-card">
        <div className="ess-card-head">
          <h3>
            <Clock size={15} /> Waiting for your decision <span className="req-count">{pending.length}</span>
          </h3>
        </div>

        {pending.length === 0 ? (
          <div className="ess-empty">
            <CheckCircle2 size={28} />
            <strong>You're all caught up</strong>
            <span>Leave applications from your team will appear here.</span>
          </div>
        ) : (
          <ul className="ess-approval-list">
            {pending.map((lv) => {
              const clash = overlapsWith(lv);
              const isDeclining = declining === lv.id;
              return (
                <li key={lv.id} className="ess-approval">
                  <div className="ess-approval-main">
                    <span className="ess-mini-avatar">
                      {lv.staffName
                        .split(' ')
                        .slice(0, 2)
                        .map((x) => x[0])
                        .join('')}
                    </span>
                    <div className="ess-approval-info">
                      <strong>{lv.staffName}</strong>
                      <span>
                        {lv.leaveType} · {lv.daysCount} day{lv.daysCount === 1 ? '' : 's'} ·{' '}
                        {formatDate(lv.startDate, { day: 'numeric', month: 'short' })} – {formatDate(lv.endDate)}
                      </span>
                      <p>“{lv.reason}”</p>
                      <div className="ess-approval-meta">
                        {lv.appliedOn && <span>Applied {formatDate(lv.appliedOn)}</span>}
                        {lv.startDate <= todayIso() && <span className="badge badge-warning">Already started</span>}
                        {clash.length > 0 && <span className="badge badge-info">Overlaps with {clash.join(', ')}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="ess-approval-actions">
                    <input
                      className={`form-control ${isDeclining && !comments[lv.id]?.trim() ? 'is-invalid' : ''}`}
                      placeholder={isDeclining ? 'Reason for declining (required)' : 'Comment (optional)'}
                      value={comments[lv.id] ?? ''}
                      onChange={(e) => setComments((c) => ({ ...c, [lv.id]: e.target.value }))}
                    />
                    {isDeclining ? (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setDeclining(null)}>
                          Back
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={!comments[lv.id]?.trim()}
                          onClick={() => {
                            rejectLeaveRequest(lv.id, comments[lv.id].trim());
                            setDeclining(null);
                          }}
                        >
                          <X size={14} /> Confirm decline
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setDeclining(lv.id)}>
                          <X size={14} /> Decline
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => approveLeaveRequest(lv.id, comments[lv.id]?.trim())}>
                          <Check size={14} /> Approve
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="ess-card">
        <div className="ess-card-head">
          <h3>Recently decided</h3>
        </div>
        {decided.length === 0 ? (
          <div className="ess-empty">
            <CalendarDays size={28} />
            <strong>No decisions yet</strong>
          </div>
        ) : (
          <div className="ess-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Days</th>
                  <th>Decision</th>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((lv) => (
                  <tr key={lv.id}>
                    <td style={{ fontWeight: 600 }}>{lv.staffName}</td>
                    <td>{lv.leaveType}</td>
                    <td>
                      {formatDate(lv.startDate, { day: 'numeric', month: 'short' })} – {formatDate(lv.endDate)}
                    </td>
                    <td>{lv.daysCount}</td>
                    <td>
                      <span className={`digicraft-status-pill ${lv.status === 'APPROVED' ? 'success' : 'critical'}`}>
                        {lv.status === 'APPROVED' ? 'Approved' : 'Declined'}
                      </span>
                      {lv.decidedOn && <div className="ess-muted">{formatDate(lv.decidedOn)}</div>}
                    </td>
                    <td className="ess-cell-wrap">{lv.approverComment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Performance: active appraisal + history                             */
/* ------------------------------------------------------------------ */

const Stars: React.FC<{ value: number; onChange?: (v: number) => void; label: string }> = ({ value, onChange, label }) => (
  <div className="ess-stars" role={onChange ? 'radiogroup' : undefined} aria-label={label}>
    {[1, 2, 3, 4, 5].map((i) => (
      <button
        key={i}
        type="button"
        role={onChange ? 'radio' : undefined}
        aria-checked={onChange ? value === i : undefined}
        aria-label={`${i} – ${RATING_LABELS[i]}`}
        title={RATING_LABELS[i]}
        className={i <= value ? 'on' : ''}
        disabled={!onChange}
        onClick={() => onChange?.(i)}
      >
        <Star size={16} />
      </button>
    ))}
  </div>
);

const ratingBand = (r: number) => RATING_LABELS[Math.round(r)] ?? '';

export const EssPerformance: React.FC = () => {
  const { appraisals, perfGoals, perfCycles, hrEmployees, saveSelfAssessment } = useApp();
  // The live appraisal from the performance module, when there is one
  const live = appraisals.find((x) => x.staffId === ESS_EMPLOYEE.staffId && perfCycles.some((c) => c.id === x.cycleId && c.status === 'ACTIVE'));
  const cycle = perfCycles.find((c) => c.id === live?.cycleId);
  const liveGoals = perfGoals.filter((g) => g.staffId === ESS_EMPLOYEE.staffId && g.cycleId === live?.cycleId);
  const STAGE_MAP: Record<string, AppraisalStage> = { SELF: 'Self-assessment', SUPERVISOR: 'Manager review', HOD: 'Manager review', CALIBRATION: 'Calibration', ACKNOWLEDGEMENT: 'Closed', DISPUTED: 'Closed', CLOSED: 'Closed' };
  const [goals, setGoals] = useState<AppraisalGoal[]>(() =>
    live
      ? liveGoals.map((g) => ({ id: g.id, title: g.title, weight: g.weight, target: `${g.measure}: ${g.target} ${g.unit}`, progress: g.progress, selfRating: g.self ?? 0, comment: g.selfNote ?? '' }))
      : ESS_ACTIVE_APPRAISAL.goals
  );
  const stage = live ? STAGE_MAP[live.stage] : ESS_ACTIVE_APPRAISAL.stage;
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const a = live
    ? {
        cycle: `${cycle?.name ?? ''} appraisal`,
        periodStart: cycle?.periodStart ?? ESS_ACTIVE_APPRAISAL.periodStart,
        periodEnd: cycle?.periodEnd ?? ESS_ACTIVE_APPRAISAL.periodEnd,
        selfAssessmentDue: cycle?.phases.find((p) => p.key === 'SELF')?.due ?? ESS_ACTIVE_APPRAISAL.selfAssessmentDue,
        reviewer: `${hrEmployees.find((e) => e.staffId === live.appraiserId)?.fullName ?? ''} (${hrEmployees.find((e) => e.staffId === live.appraiserId)?.jobTitle ?? 'Supervisor'})`
      }
    : ESS_ACTIVE_APPRAISAL;
  const persist = (submit: boolean) =>
    live &&
    saveSelfAssessment(live.id, { goals: Object.fromEntries(goals.map((g) => [g.id, { rating: g.selfRating || undefined, note: g.comment }])), comps: {}, summary: live.selfSummary ?? '' }, submit, ESS_EMPLOYEE.staffId);
  const stageIdx = APPRAISAL_STAGES.indexOf(stage);
  const editable = stage === 'Self-assessment';
  const allRated = goals.every((g) => g.selfRating > 0);
  const weighted = goals.reduce((s, g) => s + g.selfRating * g.weight, 0) / 100;
  const daysLeft = Math.ceil((new Date(a.selfAssessmentDue + 'T00:00:00').getTime() - Date.now()) / 86400000);

  const update = (id: string, patch: Partial<AppraisalGoal>) => setGoals((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const submit = () => {
    setTouched(true);
    if (!allRated) return;
    persist(true);
  };

  return (
    <div className="ess-stack">
      {/* Active appraisal period */}
      <section className="ess-card">
        <div className="ess-card-head">
          <h3>
            <Target size={15} /> Active appraisal period
          </h3>
          <span className={`digicraft-status-pill ${editable ? 'warning' : 'info'}`}>{stage}</span>
        </div>

        <div className="ess-appraisal-summary">
          <div>
            <span className="ess-stat-label">Cycle</span>
            <strong>{a.cycle}</strong>
            <span className="ess-muted">
              {formatDate(a.periodStart)} – {formatDate(a.periodEnd)}
            </span>
          </div>
          <div>
            <span className="ess-stat-label">Reviewer</span>
            <strong>{a.reviewer}</strong>
          </div>
          <div>
            <span className="ess-stat-label">Self-assessment due</span>
            <strong>{formatDate(a.selfAssessmentDue)}</strong>
            {editable && <span className={daysLeft <= 7 ? 'ess-due-soon' : 'ess-muted'}>{daysLeft} days left</span>}
          </div>
          <div>
            <span className="ess-stat-label">Your weighted score</span>
            <strong>{weighted ? weighted.toFixed(1) : '—'} / 5</strong>
            {weighted > 0 && <span className="ess-muted">{ratingBand(weighted)}</span>}
          </div>
        </div>

        <ol className="ess-stage-track" aria-label="Appraisal stages">
          {APPRAISAL_STAGES.map((s, i) => (
            <li key={s} className={i < stageIdx ? 'done' : i === stageIdx ? 'current' : ''}>
              <span />
              {s}
            </li>
          ))}
        </ol>

        <div className="ess-goal-list">
          {goals.map((g) => (
            <div key={g.id} className={`ess-goal ${touched && editable && !g.selfRating ? 'missing' : ''}`}>
              <div className="ess-goal-top">
                <div>
                  <strong>{g.title}</strong>
                  <span className="ess-muted">
                    Target: {g.target} · Weight {g.weight}%
                  </span>
                </div>
                <div className="ess-goal-rating">
                  <Stars value={g.selfRating} label={`Self-rating for ${g.title}`} onChange={editable ? (v) => update(g.id, { selfRating: v }) : undefined} />
                  <span className="ess-muted">{g.selfRating ? RATING_LABELS[g.selfRating] : 'Not rated'}</span>
                </div>
              </div>
              <div className="ess-goal-progress">
                <div className="ess-meter">
                  <span className="used" style={{ width: `${g.progress}%` }} />
                </div>
                <span>{g.progress}%</span>
              </div>
              {editable ? (
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Evidence and comments for your manager"
                  value={g.comment}
                  onChange={(e) => update(g.id, { comment: e.target.value })}
                />
              ) : (
                g.comment && <p className="ess-goal-comment">{g.comment}</p>
              )}
            </div>
          ))}
        </div>

        {editable && (
          <div className="ess-form-actions">
            <span className="ess-hint">
              {touched && !allRated ? (
                <span className="ess-due-soon">Rate every goal before submitting.</span>
              ) : (
                'Your ratings are saved as a draft until you submit.'
              )}
            </span>
            <button
              className="btn btn-secondary"
              onClick={() => persist(false)}
            >
              Save draft
            </button>
            <button className="btn btn-primary" onClick={submit}>
              Submit self-assessment
            </button>
          </div>
        )}
      </section>

      {/* History */}
      <section className="ess-card">
        <div className="ess-card-head">
          <h3>Appraisal history</h3>
        </div>
        <ul className="ess-history-list">
          {ESS_APPRAISAL_HISTORY.map((r) => (
            <AppraisalHistoryItem key={r.id} record={r} open={openReport === r.id} onToggle={() => setOpenReport(openReport === r.id ? null : r.id)} />
          ))}
        </ul>
      </section>
    </div>
  );
};

const AppraisalHistoryItem: React.FC<{ record: AppraisalRecord; open: boolean; onToggle: () => void }> = ({ record: r, open, onToggle }) => (
  <li className={`ess-history ${open ? 'open' : ''}`}>
    <button className="ess-history-row" onClick={onToggle} aria-expanded={open}>
      <span className="ess-history-score">{r.finalRating.toFixed(1)}</span>
      <span className="ess-history-text">
        <strong>{r.cycle}</strong>
        <span className="ess-muted">
          {ratingBand(r.finalRating)} · Reviewed by {r.reviewer} · {formatDate(r.completedOn)}
        </span>
      </span>
      <ChevronDown size={16} className="ess-chevron" />
    </button>
    {open && (
      <div className="ess-history-report ess-print-area">
        <div className="ess-report-head">
          <div>
            <span className="ess-eyebrow">Appraisal report</span>
            <h4>
              {r.cycle} — {ESS_EMPLOYEE.fullName}
            </h4>
            <span className="ess-muted">
              {r.period} · Final rating {r.finalRating.toFixed(1)} / 5 ({ratingBand(r.finalRating)})
            </span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={printArea}>
            <Printer size={14} /> Print report
          </button>
        </div>
        <p>{r.summary}</p>
        <table className="hr-table ess-report-table">
          <thead>
            <tr>
              <th>Goal</th>
              <th className="num">Weight</th>
              <th>Rating</th>
            </tr>
          </thead>
          <tbody>
            {r.goals.map((g) => (
              <tr key={g.title}>
                <td>{g.title}</td>
                <td className="num">{g.weight}%</td>
                <td>
                  <Stars value={g.rating} label={`Rating for ${g.title}`} /> <span className="ess-muted">{RATING_LABELS[g.rating]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ess-report-notes">
          <div>
            <span className="ess-stat-label">Strengths</span>
            <p>{r.strengths}</p>
          </div>
          <div>
            <span className="ess-stat-label">Development areas</span>
            <p>{r.development}</p>
          </div>
        </div>
      </div>
    )}
  </li>
);

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

const ASSET_ICON: Record<EssAsset['category'], React.ElementType> = {
  'IT Equipment': Laptop,
  'Mobile Device': Smartphone,
  'Access & Security': KeyRound,
  Furniture: Package,
  Vehicle: Package
};

export const EssAssets: React.FC<{
  assets: EssAsset[];
  onAcknowledge: (id: string) => void;
  onReport: (type: EssRequestType, details: string) => void;
}> = ({ assets, onAcknowledge, onReport }) => {
  const { addToast } = useApp();
  const pendingAck = assets.filter((x) => !x.acknowledged).length;

  const acknowledge = (id: string) => {
    onAcknowledge(id);
    const asset = assets.find((x) => x.id === id);
    addToast({ type: 'success', title: 'Receipt acknowledged', message: `You confirmed receipt of ${asset?.name} (${asset?.tag}).` });
  };

  return (
    <section className="ess-card">
      <div className="ess-card-head">
        <h3>
          <Package size={15} /> Assets allocated to me <span className="req-count">{assets.length}</span>
        </h3>
        {pendingAck > 0 && <span className="badge badge-warning">{pendingAck} awaiting your acknowledgement</span>}
      </div>
      {assets.length === 0 ? (
        <div className="ess-empty">
          <Package size={28} />
          <strong>No assets allocated</strong>
          <span>Company equipment issued to you will be listed here.</span>
        </div>
      ) : (
        <ul className="ess-asset-list">
          {assets.map((x) => {
            const Icon = ASSET_ICON[x.category];
            return (
              <li key={x.id} className={x.acknowledged ? '' : 'pending'}>
                <span className="ess-asset-icon">
                  <Icon size={18} />
                </span>
                <div className="ess-asset-meta">
                  <strong>{x.name}</strong>
                  <span className="ess-muted">
                    {x.tag} · S/N {x.serial} · {x.category}
                  </span>
                  <span className="ess-muted">
                    Issued {formatDate(x.issuedOn)} · Condition: {x.condition}
                    {x.returnBy ? ` · Renew by ${formatDate(x.returnBy)}` : ''}
                  </span>
                </div>
                <div className="ess-asset-actions">
                  {!x.acknowledged && (
                    <button className="btn btn-primary btn-sm" onClick={() => acknowledge(x.id)}>
                      <Check size={14} /> Acknowledge receipt
                    </button>
                  )}
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onReport('Equipment / Asset Request', `Issue with ${x.name} (${x.tag}, S/N ${x.serial}): `)}
                  >
                    Report issue
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="ess-hint" style={{ marginTop: 12 }}>
        Assets must be returned in good condition on exit. Lost or damaged items should be reported immediately.
      </p>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Disciplinary history                                                */
/* ------------------------------------------------------------------ */

export const EssDisciplinary: React.FC = () => {
  const { disciplinaryCases } = useApp();
  // Records from before the HR system, plus live cases from Compliance & Disciplinary
  const live: EssDisciplinaryCase[] = (disciplinaryCases ?? [])
    .filter((c) => c.staffId === ESS_EMPLOYEE.staffId)
    .map((c) => ({
      id: c.id,
      date: c.raisedOn,
      type: c.outcome?.sanction === 'FINAL_WRITTEN' ? 'Final Written Warning' : c.outcome?.sanction === 'WRITTEN' ? 'Written Warning' : c.outcome?.sanction === 'VERBAL' ? 'Verbal Warning' : 'Show Cause',
      subject: c.summary,
      outcome: c.outcome ? c.outcome.reasons : 'Case in progress — you will receive letters at each step and may bring a representative to any hearing.',
      status: c.appeal?.status === 'PENDING' ? 'Under Appeal' : c.stage === 'CLOSED' ? 'Closed' : 'Active',
      expiresOn: c.outcome?.expiresOn ?? c.outcome?.decidedOn ?? c.raisedOn,
      handledBy: c.raisedBy
    }));
  const cases = [...live, ...ESS_DISCIPLINARY];
  const active = cases.filter((c) => c.status !== 'Closed');
  return (
    <section className="ess-card">
      <div className="ess-card-head">
        <h3>
          <ShieldCheck size={15} /> Disciplinary history
        </h3>
        {active.length === 0 ? (
          <span className="badge badge-success">No active cases</span>
        ) : (
          <span className="badge badge-critical">{active.length} active</span>
        )}
      </div>
      {cases.length === 0 ? (
        <div className="ess-empty">
          <ShieldCheck size={28} />
          <strong>Clean record</strong>
          <span>You have no disciplinary records.</span>
        </div>
      ) : (
        <ul className="ess-case-list">
          {cases.map((c) => {
            const expired = c.expiresOn < todayIso();
            return (
              <li key={c.id} className={`ess-case ${c.status === 'Closed' ? 'closed' : ''}`}>
                <span className="ess-case-icon">
                  <AlertTriangle size={16} />
                </span>
                <div className="ess-case-body">
                  <div className="ess-case-top">
                    <strong>{c.type}</strong>
                    <span className={`digicraft-status-pill ${c.status === 'Closed' ? 'success' : 'warning'}`}>{c.status}</span>
                  </div>
                  <span className="ess-muted">
                    {c.id} · {formatDate(c.date)} · Handled by {c.handledBy}
                  </span>
                  <p>{c.subject}</p>
                  <p className="ess-muted">Outcome: {c.outcome}</p>
                  <span className={expired ? 'ess-muted' : 'ess-due-soon'}>
                    {expired ? `Expired from active record on ${formatDate(c.expiresOn)}` : `Active on record until ${formatDate(c.expiresOn)}`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="ess-hint" style={{ marginTop: 12 }}>
        If you disagree with a record, raise it with HR through a Personal Details Change request or your line manager.
      </p>
    </section>
  );
};
