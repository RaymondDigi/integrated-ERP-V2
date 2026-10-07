import React, { useState } from 'react';
import { CheckCircle2, UserPlus, ExternalLink, Lock, AlertTriangle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { OnboardingRecord } from '../../../types';
import { usePaged, Pager } from '../../../components/common/Pager';
import type { HireTerms, TaskOwner } from '../../../data/hireConfig';
import { KENYAN_BANKS } from '../../../data/orgData';
import { addDays, addMonths, daysBetween, fmtDate, KRA_PIN_RE, maskAccount, maskId, maskKra, maskPhone, onboardingProgress, probationOf, shortGrade, taskDue, termsGaps, todayIso, kes } from '../../../data/hireEngine';
import { Card, Drawer, Empty, Field, Pill, PersonSelect, Progress, Stat, type Tone } from './shared';
import { ChangeModal } from './EmployeeProfile';

const OWNERS: TaskOwner[] = ['HR', 'Finance', 'ICT', 'Facilities', 'Supervisor'];
const STATUS: Record<NonNullable<OnboardingRecord['status']>, { label: string; tone: Tone }> = {
  PRE_BOARDING: { label: 'Pre-boarding', tone: 'warning' },
  FIRST_90_DAYS: { label: 'First 90 days', tone: 'primary' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'info' }
};
const statusOf = (r: OnboardingRecord) => r.status ?? (r.progressPercent >= 100 ? 'COMPLETED' : 'PRE_BOARDING');

const startLabel = (r: OnboardingRecord) => {
  if (!r.startDate) return '—';
  const d = daysBetween(todayIso(), r.startDate);
  return d > 0 ? `in ${d} days` : d === 0 ? 'today' : `day ${-d + 1}`;
};

const useRecord = () => {
  const { tenantOnboarding } = useApp();
  const [id, setId] = useState<string | null>(null);
  const r = tenantOnboarding.find((x) => x.id === id);
  return { open: setId, node: r ? <OnboardingDrawer r={r} onClose={() => setId(null)} /> : null };
};

/* ------------------------------------------------------------------ new hires */

export const HiresTab: React.FC = () => {
  const { tenantOnboarding } = useApp();
  const rec = useRecord();
  const [filter, setFilter] = useState('Active');
  const list = tenantOnboarding
    .filter((r) => (filter === 'All' ? true : filter === 'Active' ? ['PRE_BOARDING', 'FIRST_90_DAYS'].includes(statusOf(r)) : statusOf(r) === filter))
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
  const pg = usePaged(list, 10, filter);
  const pre = tenantOnboarding.filter((r) => statusOf(r) === 'PRE_BOARDING');
  const first90 = tenantOnboarding.filter((r) => statusOf(r) === 'FIRST_90_DAYS');
  const overdue = tenantOnboarding.flatMap((r) => (['PRE_BOARDING', 'FIRST_90_DAYS'].includes(statusOf(r)) ? onboardingProgress(r).overdue : []));
  const nextStart = pre.map((r) => r.startDate ?? '').sort()[0];

  return (
    <>
      <div className="hr-stats-row">
        <Stat label="Pre-boarding" value={`${pre.length} new hires`} sub={nextStart ? `Next start ${fmtDate(nextStart)}` : 'No one waiting to start'} tone="#d97706" />
        <Stat label="In first 90 days" value={`${first90.length} employees`} sub="Check-ins and probation goals running" tone="var(--brand-primary)" />
        <Stat label="Completed" value={`${tenantOnboarding.filter((r) => statusOf(r) === 'COMPLETED').length}`} sub="Onboarding closed this year" tone="#10b981" />
        <Stat label="Overdue tasks" value={`${overdue.length}`} sub={overdue.length ? `Oldest: ${overdue[0].label}` : 'Everything on time'} tone={overdue.length ? 'var(--status-critical)' : undefined} />
      </div>
      <Card
        title="New hires"
        sub="Accepted offers open a record here. Finishing pre-boarding creates the employee in the master, payroll and leave."
        actions={
          <select className="form-control" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Status">
            <option value="Active">Pre-boarding and first 90 days</option>
            <option value="PRE_BOARDING">Pre-boarding</option>
            <option value="FIRST_90_DAYS">First 90 days</option>
            <option value="COMPLETED">Completed</option>
            <option value="All">All</option>
          </select>
        }
      >
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>New hire</th>
                <th>Department</th>
                <th>Start</th>
                <th>Status</th>
                <th style={{ minWidth: 140 }}>Checklist</th>
                <th>Staff ID</th>
                <th>Needs attention</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={7}>No onboarding records.</Empty>}
              {pg.rows.map((r) => {
                const p = onboardingProgress(r);
                const st = statusOf(r);
                return (
                  <tr key={r.id} className="hi-click" onClick={() => rec.open(r.id)}>
                    <td>
                      <strong>{r.employeeName}</strong>
                      <div className="hi-sub">
                        {r.role} · {r.id}
                      </div>
                    </td>
                    <td>{r.department ?? r.branch}</td>
                    <td>
                      {fmtDate(r.startDate)}
                      <div className="hi-sub">{startLabel(r)}</div>
                    </td>
                    <td>
                      <Pill tone={STATUS[st].tone}>{STATUS[st].label}</Pill>
                    </td>
                    <td>
                      <Progress pct={p.pct} tone={p.pct === 100 ? 'success' : p.overdue.length ? 'danger' : 'primary'} />
                      <div className="hi-sub">
                        {p.done}/{p.total} done
                      </div>
                    </td>
                    <td className="hi-mono">{r.staffId ?? '—'}</td>
                    <td className="hi-wrap hi-sub">
                      {st === 'PRE_BOARDING'
                        ? p.blocking.length || termsGaps(r.terms).length
                          ? `${p.blocking.length} required tasks, ${termsGaps(r.terms).length} missing details`
                          : 'Ready to create the employee'
                        : p.overdue.length
                        ? `${p.overdue.length} overdue`
                        : st === 'COMPLETED'
                        ? `Closed ${fmtDate(r.completedOn)}`
                        : 'On track'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="records" sizes={[10, 25]} />
      </Card>
      {rec.node}
    </>
  );
};

/* ------------------------------------------------------------------ drawer */

const SECTIONS = ['Checklist', 'Personal & pay details', 'Induction', 'Probation'] as const;

const OnboardingDrawer: React.FC<{ r: OnboardingRecord; onClose: () => void }> = ({ r, onClose }) => {
  const { activateHire, toggleOnboardingTask, toggleOnboardingItem, setCurrentView, setModuleTab } = useApp();
  const [section, setSection] = useState<(typeof SECTIONS)[number]>('Checklist');
  const st = statusOf(r);
  const p = onboardingProgress(r);
  const gaps = termsGaps(r.terms);
  const ready = st === 'PRE_BOARDING' && !p.blocking.length && !gaps.length;

  if (!r.tasks)
    return (
      <Drawer title={r.employeeName} subtitle={`${r.role} · ${r.branch}`} onClose={onClose}>
        <p className="hi-sub">This record was created before the onboarding checklist; only the statutory items are tracked.</p>
        <ul className="hi-tasks">
          {(['contractSigned', 'kraPinVerified', 'nssfVerified', 'shifVerified', 'kitIssued'] as const).map((k) => (
            <li key={k}>
              <label>
                <input type="checkbox" checked={r[k]} onChange={() => toggleOnboardingItem(r.id, k)} />
                {{ contractSigned: 'Contract signed', kraPinVerified: 'KRA PIN verified', nssfVerified: 'NSSF verified', shifVerified: 'SHIF verified', kitIssued: 'Kit issued' }[k]}
              </label>
            </li>
          ))}
        </ul>
      </Drawer>
    );

  return (
    <Drawer
      title={r.employeeName}
      subtitle={`${r.role} · ${r.department ?? ''} · starts ${fmtDate(r.startDate)} (${startLabel(r)})`}
      onClose={onClose}
      footer={
        <div className="hi-actions">
          {st === 'PRE_BOARDING' && (
            <button className="btn btn-primary" onClick={() => activateHire(r.id)} title={ready ? undefined : 'Finish the required tasks and details first'}>
              <UserPlus size={14} /> Create employee record
            </button>
          )}
          {r.staffId && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setModuleTab('employees', 'directory');
                setCurrentView('employees');
              }}
            >
              <ExternalLink size={14} /> {r.staffId} in employee master
            </button>
          )}
        </div>
      }
    >
      <div className="pr-kv">
        <div>
          <span>Status</span>
          <strong>
            <Pill tone={STATUS[st].tone}>{STATUS[st].label}</Pill>
          </strong>
          <small>{r.staffId ? `Employee ${r.staffId} since ${fmtDate(r.activatedOn)}` : 'Not yet an employee'}</small>
        </div>
        <div>
          <span>Checklist</span>
          <strong>{p.pct}%</strong>
          <small>
            {p.done} of {p.total} tasks{p.overdue.length ? `, ${p.overdue.length} overdue` : ''}
          </small>
        </div>
        <div>
          <span>Pay</span>
          <strong>{r.terms ? (r.terms.basic ? kes(r.terms.basic) : `KES ${r.terms.dailyRate}/day`) : '—'}</strong>
          <small>
            {r.terms ? `${shortGrade(r.terms.grade)} · ${r.terms.contractType.replace(' Contract', '')}` : ''}
          </small>
        </div>
      </div>
      {st === 'PRE_BOARDING' && (
        <div className={`pr-note ${ready ? '' : 'warn'}`} style={{ margin: '12px 0' }}>
          {ready ? (
            <>
              <CheckCircle2 size={14} /> Pre-boarding is complete. Creating the employee assigns a staff ID, adds them to payroll from {fmtDate(r.startDate)} (pro-rated first month) and starts leave accrual.
            </>
          ) : (
            <>
              <AlertTriangle size={14} /> Before the employee record can be created:
              <ul className="hi-list">
                {p.blocking.map((t) => (
                  <li key={t.id}>
                    {t.owner}: {t.label}
                  </li>
                ))}
                {gaps.length > 0 && <li>Details missing: {gaps.join(', ')}</li>}
              </ul>
            </>
          )}
        </div>
      )}
      <div className="pr-tabstrip hi-subtabs" role="tablist">
        {SECTIONS.map((s) => (
          <button key={s} role="tab" aria-selected={section === s} className={section === s ? 'active' : ''} onClick={() => setSection(s)}>
            {s}
          </button>
        ))}
      </div>
      {section === 'Checklist' && (
        <div className="hi-owners">
          {OWNERS.map((o) => {
            const ts = r.tasks!.filter((t) => t.owner === o);
            if (!ts.length) return null;
            return (
              <div key={o} className="hi-owner">
                <h4 className="hi-h4">
                  {o === 'Facilities' ? 'Facilities & stores' : o} <small className="hi-sub">{ts.filter((t) => t.done).length}/{ts.length}</small>
                </h4>
                <ul className="hi-tasks">
                  {ts.map((t) => {
                    const due = taskDue(r, t);
                    const late = !t.done && (due ?? '9') < todayIso();
                    return (
                      <li key={t.id} className={`${t.done ? 'done' : ''} ${late ? 'late' : ''}`}>
                        <label>
                          <input type="checkbox" checked={t.done} disabled={st === 'COMPLETED'} onChange={() => toggleOnboardingTask(r.id, t.id)} />
                          <span>
                            {t.label}
                            {t.requiredForStart && <em className="hi-req">required before start</em>}
                          </span>
                        </label>
                        <small>
                          {t.done ? `${t.doneBy ?? ''} · ${fmtDate(t.doneOn)}` : `${t.phase} · due ${fmtDate(due)}${late ? ' (overdue)' : ''}`}
                        </small>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      {section === 'Personal & pay details' && r.terms && <TermsForm r={r} terms={r.terms} locked={st !== 'PRE_BOARDING'} />}
      {section === 'Induction' && <Induction r={r} />}
      {section === 'Probation' && <ProbationPanel r={r} />}
    </Drawer>
  );
};

const TermsForm: React.FC<{ r: OnboardingRecord; terms: HireTerms; locked: boolean }> = ({ r, terms: t, locked }) => {
  const { updateHireTerms, tenantEmployees, orgStructure } = useApp();
  const [reveal, setReveal] = useState(false);
  const set = (patch: Partial<HireTerms>) => updateHireTerms(r.id, patch);
  const people = tenantEmployees.filter((e) => e.status !== 'TERMINATED');
  const stations = orgStructure.stations.filter((s) => orgStructure.branches.find((b) => b.id === s.branchId)?.name === r.branch);
  const show = (raw: string, masked: string) => (locked && !reveal ? masked : raw);
  if (locked)
    return (
      <>
        <div className="pr-note">
          <Lock size={13} /> Saved to the employee master in masked form. {reveal ? 'Showing values from the onboarding file.' : 'Revealing needs the HR records permission and is logged.'}{' '}
          <button className="btn btn-secondary btn-sm" onClick={() => setReveal((x) => !x)}>
            {reveal ? 'Mask' : 'Reveal'}
          </button>
        </div>
        <dl className="hi-dl">
          <dt>National ID</dt>
          <dd>{show(t.nationalId, maskId(t.nationalId))}</dd>
          <dt>KRA PIN</dt>
          <dd>{show(t.kraPin, maskKra(t.kraPin))}</dd>
          <dt>NSSF / SHIF</dt>
          <dd>
            {show(t.nssfNo, '****')} / {show(t.shifNo, '****')}
          </dd>
          <dt>Paid by</dt>
          <dd>{t.paymentMethod === 'BANK' ? `${t.bankName ?? ''} ${show(t.bankAccount ?? '', maskAccount('', t.bankAccount ?? ''))}` : `M-Pesa ${show(t.mpesaPhone ?? '', maskPhone(t.mpesaPhone ?? ''))}`}</dd>
          <dt>Supervisor</dt>
          <dd>{tenantEmployees.find((e) => e.staffId === t.supervisorStaffId)?.fullName ?? '—'}</dd>
        </dl>
      </>
    );
  return (
    <>
      <div className="pr-form-grid">
        <Field label="Gender">
          <select className={`form-control ${!t.gender ? 'is-invalid' : ''}`} value={t.gender ?? ''} onChange={(e) => set({ gender: (e.target.value || undefined) as HireTerms['gender'] })}>
            <option value="">Choose…</option>
            <option>Female</option>
            <option>Male</option>
            <option>Other</option>
          </select>
        </Field>
        <Field label="National ID number">
          <input className={`form-control ${!t.nationalId ? 'is-invalid' : ''}`} value={t.nationalId} onChange={(e) => set({ nationalId: e.target.value.replace(/\D/g, '') })} inputMode="numeric" />
        </Field>
        <Field label="KRA PIN" hint={t.kraPin && !KRA_PIN_RE.test(t.kraPin) ? 'Format A123456789B' : undefined}>
          <input className={`form-control ${!KRA_PIN_RE.test(t.kraPin) ? 'is-invalid' : ''}`} value={t.kraPin} onChange={(e) => set({ kraPin: e.target.value.toUpperCase() })} placeholder="A123456789B" />
        </Field>
        <Field label="NSSF number">
          <input className={`form-control ${!t.nssfNo ? 'is-invalid' : ''}`} value={t.nssfNo} onChange={(e) => set({ nssfNo: e.target.value })} />
        </Field>
        <Field label="SHIF number">
          <input className={`form-control ${!t.shifNo ? 'is-invalid' : ''}`} value={t.shifNo} onChange={(e) => set({ shifNo: e.target.value })} />
        </Field>
        <Field label="Tax">
          <select className="form-control" value={t.taxEmployment} onChange={(e) => set({ taxEmployment: e.target.value as HireTerms['taxEmployment'] })}>
            <option value="PRIMARY">Primary employment (personal relief)</option>
            <option value="SECONDARY">Secondary employment</option>
          </select>
        </Field>
        <Field label="Paid by">
          <select className="form-control" value={t.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as HireTerms['paymentMethod'] })}>
            <option value="BANK">Bank transfer</option>
            <option value="MPESA">M-Pesa</option>
          </select>
        </Field>
        {t.paymentMethod === 'BANK' ? (
          <>
            <Field label="Bank">
              <select className={`form-control ${!t.bankName ? 'is-invalid' : ''}`} value={t.bankName ?? ''} onChange={(e) => set({ bankName: e.target.value })}>
                <option value="">Choose…</option>
                {KENYAN_BANKS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="Account number" hint={t.bankName && t.bankAccount ? `Stored as ${maskAccount(t.bankName, t.bankAccount)}` : undefined}>
              <input className={`form-control ${!t.bankAccount ? 'is-invalid' : ''}`} value={t.bankAccount ?? ''} onChange={(e) => set({ bankAccount: e.target.value.replace(/\s/g, '') })} />
            </Field>
          </>
        ) : (
          <Field label="M-Pesa number" hint={t.mpesaPhone ? `Stored as ${maskPhone(t.mpesaPhone)}` : undefined}>
            <input className={`form-control ${!t.mpesaPhone ? 'is-invalid' : ''}`} value={t.mpesaPhone ?? ''} onChange={(e) => set({ mpesaPhone: e.target.value })} />
          </Field>
        )}
        <Field label="Supervisor">
          <PersonSelect value={t.supervisorStaffId ?? ''} onChange={(v) => set({ supervisorStaffId: v || undefined })} people={people.filter((e) => e.basicSalaryKes >= 45_000)} />
        </Field>
        <Field label="Buddy">
          <PersonSelect value={t.buddyStaffId ?? ''} onChange={(v) => set({ buddyStaffId: v || undefined })} people={people.filter((e) => e.department === t.department)} placeholder="No buddy yet" />
        </Field>
        {stations.length > 0 && (
          <Field label="Site">
            <select className="form-control" value={t.stationId ?? ''} onChange={(e) => set({ stationId: e.target.value || undefined })}>
              <option value="">Not set</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Personal email">
          <input className="form-control" value={t.personalEmail} onChange={(e) => set({ personalEmail: e.target.value })} />
        </Field>
      </div>
      <p className="hi-sub">Only masked values (e.g. {maskKra(t.kraPin || 'A000000000X')}) go to the employee master; the full numbers stay in the onboarding file.</p>
    </>
  );
};

const Induction: React.FC<{ r: OnboardingRecord }> = ({ r }) => {
  const { setSessionAttendance } = useApp();
  const sessions = r.sessions ?? [];
  const attended = sessions.filter((s) => s.attended).length;
  return (
    <>
      <p className="hi-sub">
        {attended} of {sessions.length} sessions attended · {sessions.reduce((n, s) => n + (s.attended ? s.hours : 0), 0)} of {sessions.reduce((n, s) => n + s.hours, 0)} hours
      </p>
      <div className="hi-scroll">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Session</th>
              <th>Facilitator</th>
              <th className="hi-num">Hours</th>
              <th>Attendance</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const date = r.startDate ? addDays(r.startDate, s.dayOffset) : undefined;
              return (
                <tr key={s.id}>
                  <td>{fmtDate(date)}</td>
                  <td>{s.title}</td>
                  <td>{s.facilitator}</td>
                  <td className="hi-num">{s.hours}</td>
                  <td>
                    <select
                      className="form-control hi-select-sm"
                      value={s.attended === null ? '' : s.attended ? 'yes' : 'no'}
                      disabled={!date || date > todayIso()}
                      onChange={(e) => setSessionAttendance(r.id, s.id, e.target.value === '' ? null : e.target.value === 'yes')}
                      aria-label={`Attendance: ${s.title}`}
                    >
                      <option value="">{date && date > todayIso() ? 'Upcoming' : 'Not marked'}</option>
                      <option value="yes">Attended</option>
                      <option value="no">Missed</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};

const ProbationPanel: React.FC<{ r: OnboardingRecord }> = ({ r }) => {
  const { hrEmployees, hireRules } = useApp();
  const e = hrEmployees.find((x) => x.staffId === r.staffId);
  const t = r.terms;
  if (!t?.probationMonths) return <p className="hi-sub">No probation applies to this contract.</p>;
  const info = e ? probationOf(e, hireRules.probationMonths, hireRules.maxProbationMonths) : undefined;
  const end = info?.end ?? (r.startDate ? addDays(addMonths(r.startDate, t.probationMonths), -1) : undefined);
  const review = r.tasks?.find((x) => /probation review/i.test(x.label));
  return (
    <dl className="hi-dl">
      <dt>Probation</dt>
      <dd>{t.probationMonths} months</dd>
      <dt>Ends</dt>
      <dd>
        {fmtDate(end)}
        {end && ` (${daysBetween(todayIso(), end)} days)`}
      </dd>
      <dt>Supervisor review due</dt>
      <dd>{review ? `${fmtDate(taskDue(r, review))}${review.done ? ' — done' : ''}` : '—'}</dd>
      <dt>Outcome</dt>
      <dd>{info ? info.status.replace('_', ' ').toLowerCase() : 'Starts when the employee record is created'}</dd>
    </dl>
  );
};

/* ------------------------------------------------------------------ task board */

export const TasksTab: React.FC = () => {
  const { tenantOnboarding, toggleOnboardingTask } = useApp();
  const [owner, setOwner] = useState<'All' | TaskOwner>('All');
  const [show, setShow] = useState<'open' | 'all'>('open');
  const rows = tenantOnboarding
    .filter((r) => r.tasks && ['PRE_BOARDING', 'FIRST_90_DAYS'].includes(statusOf(r)))
    .flatMap((r) => r.tasks!.map((t) => ({ r, t, due: taskDue(r, t) ?? '' })))
    .filter((x) => (owner === 'All' || x.t.owner === owner) && (show === 'all' || !x.t.done))
    .sort((a, b) => a.due.localeCompare(b.due));
  const pg = usePaged(rows, 10, `${owner}|${show}`);
  const today = todayIso();
  return (
    <Card
      title="Task board by owner"
      sub="Open onboarding tasks across all new hires, earliest due first."
      actions={
        <>
          <div className="pr-tabstrip hi-subtabs" style={{ margin: 0 }}>
            {(['All', ...OWNERS] as const).map((o) => (
              <button key={o} className={owner === o ? 'active' : ''} onClick={() => setOwner(o)}>
                {o}
              </button>
            ))}
          </div>
          <select className="form-control" value={show} onChange={(e) => setShow(e.target.value as typeof show)} aria-label="Show">
            <option value="open">Open tasks</option>
            <option value="all">All tasks</option>
          </select>
        </>
      }
    >
      <div className="hi-scroll">
        <table className="hr-table">
          <thead>
            <tr>
              <th />
              <th>Task</th>
              <th>New hire</th>
              <th>Owner</th>
              <th>Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pg.rows.length === 0 && <Empty cols={6}>Nothing open for this owner.</Empty>}
            {pg.rows.map(({ r, t, due }) => (
              <tr key={`${r.id}-${t.id}`}>
                <td>
                  <input type="checkbox" checked={t.done} onChange={() => toggleOnboardingTask(r.id, t.id)} aria-label={`${t.label} for ${r.employeeName}`} />
                </td>
                <td className="hi-wrap">
                  {t.label}
                  {t.requiredForStart && <em className="hi-req">required before start</em>}
                </td>
                <td>
                  {r.employeeName}
                  <div className="hi-sub">starts {fmtDate(r.startDate)}</div>
                </td>
                <td>{t.owner}</td>
                <td>{fmtDate(due)}</td>
                <td>{t.done ? <Pill tone="success">Done</Pill> : due < today ? <Pill tone="danger">Overdue</Pill> : daysBetween(today, due) <= 3 ? <Pill tone="warning">Due soon</Pill> : <Pill tone="info">Open</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="tasks" sizes={[10, 25, 50]} />
    </Card>
  );
};

/* ------------------------------------------------------------------ induction sessions */

export const SessionsTab: React.FC = () => {
  const { tenantOnboarding, setSessionAttendance } = useApp();
  const rows = tenantOnboarding
    .filter((r) => r.sessions && r.startDate)
    .flatMap((r) => r.sessions!.map((s) => ({ r, s, date: addDays(r.startDate!, s.dayOffset) })))
    .sort((a, b) => b.date.localeCompare(a.date));
  const pg = usePaged(rows, 10);
  const past = rows.filter((x) => x.date <= todayIso());
  const rate = past.length ? Math.round((past.filter((x) => x.s.attended).length / past.length) * 100) : 0;
  return (
    <>
      <div className="hr-stats-row">
        <Stat label="Sessions held" value={`${past.length}`} sub={`${rows.length - past.length} scheduled ahead`} />
        <Stat label="Attendance" value={`${rate}%`} sub={`${past.filter((x) => x.s.attended === false).length} missed, ${past.filter((x) => x.s.attended === null).length} not marked`} tone={rate >= 90 ? '#10b981' : '#d97706'} />
        <Stat label="Induction hours" value={`${past.reduce((n, x) => n + (x.s.attended ? x.s.hours : 0), 0)} h`} sub="Recorded for training records" />
      </div>
      <Card title="Induction sessions" sub="Every new hire attends the standard induction in their first week.">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Session</th>
                <th>New hire</th>
                <th>Facilitator</th>
                <th className="hi-num">Hours</th>
                <th>Attendance</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.map(({ r, s, date }) => (
                <tr key={`${r.id}-${s.id}`}>
                  <td>{fmtDate(date)}</td>
                  <td>{s.title}</td>
                  <td>{r.employeeName}</td>
                  <td>{s.facilitator}</td>
                  <td className="hi-num">{s.hours}</td>
                  <td>
                    {date > todayIso() ? (
                      <Pill tone="info">Upcoming</Pill>
                    ) : (
                      <select className="form-control hi-select-sm" value={s.attended === null ? '' : s.attended ? 'yes' : 'no'} onChange={(e) => setSessionAttendance(r.id, s.id, e.target.value === '' ? null : e.target.value === 'yes')} aria-label={`Attendance: ${s.title}`}>
                        <option value="">Not marked</option>
                        <option value="yes">Attended</option>
                        <option value="no">Missed</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="sessions" sizes={[10, 25]} />
      </Card>
    </>
  );
};

/* ------------------------------------------------------------------ probation */

export const ProbationTab: React.FC = () => {
  const { tenantEmployees, hireRules, employeeChanges } = useApp();
  const [change, setChange] = useState<{ staffId: string; kind: 'CONFIRM_PROBATION' | 'EXTEND_PROBATION' } | null>(null);
  const rows = tenantEmployees
    .filter((e) => e.status !== 'TERMINATED')
    .map((e) => ({ e, p: probationOf(e, hireRules.probationMonths, hireRules.maxProbationMonths) }))
    .filter((x) => x.p.applies && x.p.status !== 'CONFIRMED')
    .sort((a, b) => (a.p.end ?? '').localeCompare(b.p.end ?? ''));
  const emp = tenantEmployees.find((e) => e.staffId === change?.staffId);
  return (
    <>
      <Card title="Probation tracker" sub={`Default probation is ${hireRules.probationMonths} months, up to ${hireRules.maxProbationMonths} with extensions. Reviews are due before the end date.`}>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Joined</th>
                <th>Probation ends</th>
                <th>Status</th>
                <th>Pending change</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <Empty cols={6}>No one is on probation.</Empty>}
              {rows.map(({ e, p }) => {
                const pending = employeeChanges.find((c) => c.staffId === e.staffId && c.status === 'PENDING' && c.kind.endsWith('PROBATION'));
                return (
                  <tr key={e.staffId}>
                    <td>
                      <strong>{e.fullName}</strong>
                      <div className="hi-sub">
                        {e.staffId} · {e.jobTitle}
                      </div>
                    </td>
                    <td>{fmtDate(e.joinedDate)}</td>
                    <td>
                      {fmtDate(p.end)}
                      <div className={`hi-sub ${(p.daysLeft ?? 0) < 0 ? 'hi-neg' : ''}`}>{(p.daysLeft ?? 0) < 0 ? `${-p.daysLeft!} days overdue` : `${p.daysLeft} days left`}</div>
                    </td>
                    <td>
                      <Pill tone={p.status === 'EXTENDED' ? 'warning' : (p.daysLeft ?? 99) <= 14 ? 'danger' : 'primary'}>{p.status === 'EXTENDED' ? 'Extended' : 'On probation'}</Pill>
                    </td>
                    <td className="hi-sub">{pending ? `${pending.id} waiting` : '—'}</td>
                    <td>
                      <div className="hi-actions">
                        <button className="btn btn-secondary btn-sm" disabled={!!pending} onClick={() => setChange({ staffId: e.staffId, kind: 'CONFIRM_PROBATION' })}>
                          Confirm
                        </button>
                        <button className="btn btn-secondary btn-sm" disabled={!!pending} onClick={() => setChange({ staffId: e.staffId, kind: 'EXTEND_PROBATION' })}>
                          Extend
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {emp && change && <ChangeModal e={emp} kind={change.kind} onClose={() => setChange(null)} />}
    </>
  );
};
