import React, { useMemo, useState } from 'react';
import { Search, UserPlus, Pencil, Users, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { JobApplicant } from '../../../types';
import { usePaged, Pager } from '../../../components/common/Pager';
import { CHANNELS, PIPELINE, SOURCES, type Criterion, type KnockOut, type PipelineStage, type Vacancy } from '../../../data/hireConfig';
import { bandOf, candidateScore, daysBetween, fmtDate, hiringStats, interviewResult, isOpenStage, kes, screen, shortGrade, stageOf, todayIso } from '../../../data/hireEngine';
import { Card, Drawer, Empty, Field, Modal, Pill, Progress, Stat } from './shared';
import { CandidateDrawer, STAGE_TONE } from './CandidateDrawer';

const ALL_STAGES: PipelineStage[] = [...PIPELINE, 'Rejected', 'Withdrawn'];
const stageLabel = (s: string) => (s === 'Assessment' ? 'References & checks' : s);

const VAC_TONE: Record<Vacancy['status'], 'success' | 'primary' | 'warning' | 'info'> = { OPEN: 'primary', ON_HOLD: 'warning', CLOSED: 'info', FILLED: 'success' };

/** Opens a candidate from any recruitment tab. */
const useCandidate = () => {
  const { tenantCandidates } = useApp();
  const [id, setId] = useState<string | null>(null);
  const c = tenantCandidates.find((x) => x.id === id);
  return { open: setId, node: c ? <CandidateDrawer c={c} onClose={() => setId(null)} /> : null };
};

/* ------------------------------------------------------------------ vacancies */

export const VacanciesTab: React.FC<{ onPipeline: (vacancyId: string) => void }> = ({ onPipeline }) => {
  const { tenantVacancies, tenantCandidates } = useApp();
  const [editId, setEditId] = useState<string | null>(null);
  const list = tenantVacancies.slice().sort((a, b) => (a.status === 'OPEN' ? 0 : 1) - (b.status === 'OPEN' ? 0 : 1) || b.openedOn.localeCompare(a.openedOn));
  const active = tenantCandidates.filter((c) => c.vacancyId && isOpenStage(stageOf(c)));
  const week = tenantCandidates.flatMap((c) => c.interviews ?? []).filter((i) => i.status === 'SCHEDULED' && daysBetween(todayIso(), i.date) >= 0 && daysBetween(todayIso(), i.date) <= 7);
  const offers = tenantCandidates.filter((c) => c.offer && ['ISSUED', 'PENDING_APPROVAL'].includes(c.offer.status));
  const editing = tenantVacancies.find((v) => v.id === editId);

  return (
    <>
      <div className="hr-stats-row">
        <Stat label="Open vacancies" value={`${tenantVacancies.filter((v) => v.status === 'OPEN').length} open`} sub={`${tenantVacancies.filter((v) => v.status === 'OPEN').reduce((n, v) => n + v.positions, 0)} positions advertised or in selection`} />
        <Stat label="Active applicants" value={`${active.length} candidates`} sub={`${active.filter((c) => stageOf(c) === 'Applied').length} waiting for screening`} tone="#8b5cf6" />
        <Stat label="Interviews in the next 7 days" value={`${week.length} booked`} sub={week.length ? `Next on ${fmtDate(week.map((i) => i.date).sort()[0])}` : 'None booked'} />
        <Stat label="Offers out" value={`${offers.length} offers`} sub={`${offers.filter((c) => c.offer!.status === 'PENDING_APPROVAL').length} waiting for MD approval`} tone="#d97706" />
      </div>
      <div className="hi-cards">
        {list.length === 0 && <div className="pr-note">No vacancies. Approved requisitions open one automatically.</div>}
        {list.map((v) => {
          const cands = tenantCandidates.filter((c) => c.vacancyId === v.id);
          const hired = cands.filter((c) => stageOf(c) === 'Hired').length;
          const left = daysBetween(todayIso(), v.closingDate);
          return (
            <div key={v.id} className="pr-card hi-vac">
              <div className="hi-vac-head">
                <div>
                  <span className="hi-mono">{v.id}</span> <Pill tone={VAC_TONE[v.status]}>{v.status.replace('_', ' ').toLowerCase()}</Pill>
                  <h3>{v.title}</h3>
                  <div className="hi-sub">
                    {v.department} · {shortGrade(v.grade)} · {v.contractType.replace(' Contract', '').replace('Standard Employment', 'Permanent')}
                  </div>
                </div>
                <div className="hi-vac-fill">
                  <strong>
                    {hired}/{v.positions}
                  </strong>
                  <span>filled</span>
                </div>
              </div>
              <div className="hi-funnel-mini">
                {PIPELINE.map((s) => {
                  const n = cands.filter((c) => stageOf(c) === s).length;
                  return (
                    <div key={s} className={n ? 'on' : ''} title={stageLabel(s)}>
                      <strong>{n}</strong>
                      <span>{s === 'Assessment' ? 'Checks' : s}</span>
                    </div>
                  );
                })}
              </div>
              <div className="hi-sub">
                {v.status === 'OPEN' ? (left >= 0 ? `Applications close ${fmtDate(v.closingDate)} (${left} days)` : `Applications closed ${fmtDate(v.closingDate)} — in selection`) : `Opened ${fmtDate(v.openedOn)}`} · {cands.length} applicants ·{' '}
                {cands.filter((c) => stageOf(c) === 'Rejected' || stageOf(c) === 'Withdrawn').length} closed
              </div>
              <div className="pr-chips" style={{ margin: '8px 0' }}>
                {v.channels.map((ch) => (
                  <span key={ch} className="pr-chip on">
                    {ch}
                  </span>
                ))}
              </div>
              <div className="hi-actions">
                <button className="btn btn-primary btn-sm" onClick={() => onPipeline(v.id)}>
                  <Users size={13} /> Pipeline
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditId(v.id)}>
                  <Pencil size={13} /> Advert & criteria
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {editing && <VacancyDrawer v={editing} onClose={() => setEditId(null)} />}
    </>
  );
};

const VacancyDrawer: React.FC<{ v: Vacancy; onClose: () => void }> = ({ v, onClose }) => {
  const { updateVacancy, hrEmployees } = useApp();
  const [ad, setAd] = useState(v.adText);
  const [closing, setClosing] = useState(v.closingDate);
  const [channels, setChannels] = useState(v.channels);
  const [status, setStatus] = useState(v.status);
  const [minYears, setMinYears] = useState(v.minYears);
  const [kos, setKos] = useState<KnockOut[]>(v.knockouts);
  const [criteria, setCriteria] = useState<Criterion[]>(v.criteria);
  const [panel, setPanel] = useState(v.panel);
  const total = criteria.reduce((n, c) => n + c.weight, 0);
  const people = hrEmployees.filter((e) => e.orgId === v.orgId && e.status !== 'TERMINATED' && e.basicSalaryKes >= 50_000);
  return (
    <Drawer
      title={`${v.id} · ${v.title}`}
      subtitle={`From ${v.requisitionId} · ${v.positions} position${v.positions === 1 ? '' : 's'} · ${kes(v.salaryKes)}${v.salaryKes < 5000 ? '/day' : ' basic'}`}
      onClose={onClose}
      footer={
        <div className="hi-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={total !== 100}
            onClick={() => {
              updateVacancy(v.id, { adText: ad, closingDate: closing, channels, status, minYears, knockouts: kos.filter((k) => k.question.trim()), criteria, panel });
              onClose();
            }}
          >
            Save vacancy
          </button>
        </div>
      }
    >
      <div className="pr-form-grid">
        <Field label="Closing date">
          <input className="form-control" type="date" value={closing} onChange={(e) => setClosing(e.target.value)} />
        </Field>
        <Field label="Status">
          <select className="form-control" value={status} onChange={(e) => setStatus(e.target.value as Vacancy['status'])}>
            <option value="OPEN">Open</option>
            <option value="ON_HOLD">On hold</option>
            <option value="CLOSED">Closed</option>
            <option value="FILLED">Filled</option>
          </select>
        </Field>
      </div>
      <Field label="Advertising channels">
        <div className="pr-chips hi-chip-pick">
          {CHANNELS.map((ch) => (
            <button key={ch} type="button" className={`pr-chip ${channels.includes(ch) ? 'on' : ''}`} onClick={() => setChannels((c) => (c.includes(ch) ? c.filter((x) => x !== ch) : [...c, ch]))}>
              {ch}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Job advert">
        <textarea className="form-control hi-ad" rows={10} value={ad} onChange={(e) => setAd(e.target.value)} />
      </Field>

      <h4 className="hi-h4">Knock-out criteria</h4>
      <Field label="Minimum years of relevant experience">
        <input className="form-control" type="number" min={0} value={minYears} onChange={(e) => setMinYears(Math.max(0, Number(e.target.value)))} />
      </Field>
      <div className="hi-ko">
        {kos.map((k, i) => (
          <div key={k.id} className="hi-ko-row">
            <input className="form-control" value={k.question} onChange={(e) => setKos((xs) => xs.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} aria-label="Question" />
            <select className="form-control" value={k.expected ? 'yes' : 'no'} onChange={(e) => setKos((xs) => xs.map((x, j) => (j === i ? { ...x, expected: e.target.value === 'yes' } : x)))} aria-label="Required answer">
              <option value="yes">Must be yes</option>
              <option value="no">Must be no</option>
            </select>
            <button type="button" className="req-icon-btn danger" onClick={() => setKos((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove question">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="req-add-line" onClick={() => setKos((xs) => [...xs, { id: `ko-${Date.now().toString(36)}`, question: '', expected: true }])}>
          <Plus size={14} /> Add question
        </button>
      </div>

      <h4 className="hi-h4">
        Interview scorecard <small className={total === 100 ? 'hi-sub' : 'hi-neg'}>weights total {total}%</small>
      </h4>
      <div className="hi-ko">
        {criteria.map((k, i) => (
          <div key={k.id} className="hi-ko-row">
            <input className="form-control" value={k.label} onChange={(e) => setCriteria((xs) => xs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Criterion" />
            <input className="form-control" type="number" min={0} max={100} value={k.weight} onChange={(e) => setCriteria((xs) => xs.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} aria-label="Weight" />
            <button type="button" className="req-icon-btn danger" onClick={() => setCriteria((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove criterion" disabled={criteria.length <= 1}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="req-add-line" onClick={() => setCriteria((xs) => [...xs, { id: `c-${Date.now().toString(36)}`, label: '', weight: 0 }])}>
          <Plus size={14} /> Add criterion
        </button>
      </div>

      <h4 className="hi-h4">Default interview panel</h4>
      <div className="pr-checklist">
        {people.map((e) => (
          <label key={e.staffId}>
            <input type="checkbox" checked={panel.includes(e.staffId)} onChange={(ev) => setPanel((p) => (ev.target.checked ? [...p, e.staffId] : p.filter((x) => x !== e.staffId)))} />
            {e.fullName}
          </label>
        ))}
      </div>
    </Drawer>
  );
};

/* ------------------------------------------------------------------ pipeline */

export const PipelineTab: React.FC<{ vacancyId: string; setVacancyId: (v: string) => void }> = ({ vacancyId, setVacancyId }) => {
  const { tenantCandidates, tenantVacancies } = useApp();
  const [stage, setStage] = useState<string>('Open');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const cand = useCandidate();
  const inVac = tenantCandidates.filter((c) => vacancyId === 'All' || (vacancyId === 'Pool' ? !c.vacancyId : c.vacancyId === vacancyId));
  const list = inVac
    .filter((c) => (stage === 'All' ? true : stage === 'Open' ? isOpenStage(stageOf(c)) : stageOf(c) === stage))
    .filter((c) => !q || `${c.candidateName} ${c.email} ${c.appliedRole} ${c.source ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => PIPELINE.indexOf(stageOf(b)) - PIPELINE.indexOf(stageOf(a)) || b.appliedDate.localeCompare(a.appliedDate));
  const pg = usePaged(list, 10, `${vacancyId}|${stage}|${q}`);

  return (
    <>
      <div className="hi-stages" role="tablist" aria-label="Filter by stage">
        {['Open', ...ALL_STAGES, 'All'].map((s) => {
          const n = s === 'All' ? inVac.length : s === 'Open' ? inVac.filter((c) => isOpenStage(stageOf(c))).length : inVac.filter((c) => stageOf(c) === s).length;
          return (
            <button key={s} className={stage === s ? 'active' : ''} onClick={() => setStage(s)}>
              <strong>{n}</strong>
              <span>{s === 'Open' ? 'Active' : s === 'Assessment' ? 'Checks' : s}</span>
            </button>
          );
        })}
      </div>
      <Card
        title="Applicants"
        sub="Click a candidate to screen, interview, check references and make an offer."
        actions={
          <>
            <div className="digicraft-search-box grow">
              <Search size={15} className="digicraft-search-icon" />
              <input placeholder="Search name, email, source" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search applicants" />
            </div>
            <select className="form-control" value={vacancyId} onChange={(e) => setVacancyId(e.target.value)} aria-label="Vacancy">
              <option value="All">All vacancies</option>
              {tenantVacancies.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id} · {v.title}
                </option>
              ))}
              <option value="Pool">Talent pool (no vacancy)</option>
            </select>
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              <UserPlus size={14} /> Add applicant
            </button>
          </>
        }
      >
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Vacancy</th>
                <th>Source</th>
                <th className="hi-num">Exp.</th>
                <th>Stage</th>
                <th className="hi-num">Score</th>
                <th>Applied</th>
                <th>Next step</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={8}>No applicants at this stage.</Empty>}
              {pg.rows.map((c) => {
                const v = tenantVacancies.find((x) => x.id === c.vacancyId);
                const s = stageOf(c);
                const score = candidateScore(c, v);
                return (
                  <tr key={c.id} className="hi-click" onClick={() => cand.open(c.id)}>
                    <td>
                      <strong>{c.candidateName}</strong>
                      <div className="hi-sub">
                        {c.id}
                        {c.internalStaffId ? ' · internal' : ''}
                        {c.isInternOrAttachee ? ' · graduate' : ''}
                      </div>
                    </td>
                    <td>
                      {v?.title ?? c.appliedRole}
                      <div className="hi-sub">{v?.id ?? 'Talent pool'}</div>
                    </td>
                    <td>{c.source ?? '—'}</td>
                    <td className="hi-num">{c.experienceYears}y</td>
                    <td>
                      <Pill tone={STAGE_TONE[s]}>{stageLabel(s)}</Pill>
                    </td>
                    <td className="hi-num">{score !== null ? `${score}%` : '—'}</td>
                    <td>{fmtDate(c.appliedDate)}</td>
                    <td className="hi-wrap hi-sub">{nextStep(c, v)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="applicants" sizes={[10, 25, 50]} />
      </Card>
      {cand.node}
      {adding && <AddApplicantModal defaultVacancy={vacancyId !== 'All' && vacancyId !== 'Pool' ? vacancyId : undefined} onClose={() => setAdding(false)} />}
    </>
  );
};

const nextStep = (c: JobApplicant, v?: Vacancy) => {
  const s = stageOf(c);
  if (s === 'Applied') return screen(c, v).pass ? 'Screen (passes knock-outs)' : 'Screen (fails a knock-out)';
  if (s === 'Screened') return 'Shortlist or reject';
  if (s === 'Shortlisted') return 'Book interview';
  if (s === 'Interview') {
    const iv = (c.interviews ?? []).slice(-1)[0];
    if (!iv) return 'Book interview';
    const r = interviewResult(iv, v?.criteria ?? []);
    return iv.status === 'SCHEDULED' ? (daysBetween(todayIso(), iv.date) > 0 ? `Interview ${fmtDate(iv.date)}` : `${r.panelists.filter((p) => p.pct !== null).length}/${iv.panel.length} scorecards in`) : 'Start reference checks';
  }
  if (s === 'Assessment') return 'Complete checks, then offer';
  if (s === 'Offer') return c.offer?.status === 'PENDING_APPROVAL' ? 'MD approval (above band)' : `Awaiting reply by ${fmtDate(c.offer?.expiresOn)}`;
  if (s === 'Hired') return `Starts ${fmtDate(c.offer?.startDate)}`;
  return c.outcomeReason ?? '—';
};

const AddApplicantModal: React.FC<{ defaultVacancy?: string; onClose: () => void }> = ({ defaultVacancy, onClose }) => {
  const { tenantVacancies, addApplicant } = useApp();
  const open = tenantVacancies.filter((v) => v.status === 'OPEN');
  const [vacancyId, setVacancyId] = useState(defaultVacancy ?? open[0]?.id ?? '');
  const v = tenantVacancies.find((x) => x.id === vacancyId);
  const [f, setF] = useState({ candidateName: '', email: '', phone: '', gender: '' as '' | 'Female' | 'Male', source: SOURCES[0], experienceYears: 3, education: '', location: 'Kericho' });
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  return (
    <Modal
      title="Add applicant"
      subtitle="Applications from the website arrive here automatically; walk-ins and referrals are entered by HR."
      onClose={onClose}
      width={640}
      footer={
        <div className="hi-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => addApplicant({ ...f, gender: f.gender || undefined, vacancyId, answers }) && onClose()}>
            Add applicant
          </button>
        </div>
      }
    >
      <div className="pr-form-grid">
        <Field label="Vacancy" wide>
          <select className="form-control" value={vacancyId} onChange={(e) => setVacancyId(e.target.value)}>
            {open.map((x) => (
              <option key={x.id} value={x.id}>
                {x.id} · {x.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Full name">
          <input className="form-control" value={f.candidateName} onChange={(e) => set({ candidateName: e.target.value })} />
        </Field>
        <Field label="Gender">
          <select className="form-control" value={f.gender} onChange={(e) => set({ gender: e.target.value as typeof f.gender })}>
            <option value="">Not stated</option>
            <option>Female</option>
            <option>Male</option>
          </select>
        </Field>
        <Field label="Email">
          <input className="form-control" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input className="form-control" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+254 7.." />
        </Field>
        <Field label="Source">
          <select className="form-control" value={f.source} onChange={(e) => set({ source: e.target.value })}>
            {SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Years of relevant experience">
          <input className="form-control" type="number" min={0} value={f.experienceYears} onChange={(e) => set({ experienceYears: Math.max(0, Number(e.target.value)) })} />
        </Field>
        <Field label="Education" wide>
          <input className="form-control" value={f.education} onChange={(e) => set({ education: e.target.value })} />
        </Field>
      </div>
      {v && (
        <>
          <h4 className="hi-h4">Knock-out questions</h4>
          <div className="hi-ko">
            {v.knockouts.map((k) => (
              <div key={k.id} className="hi-ko-row">
                <span>{k.question}</span>
                <select className="form-control" value={answers[k.id] === undefined ? '' : answers[k.id] ? 'yes' : 'no'} onChange={(e) => setAnswers((a) => ({ ...a, [k.id]: e.target.value === 'yes' }))} aria-label={k.question}>
                  <option value="">—</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            ))}
          </div>
          <p className="hi-sub">Needs {v.minYears}+ years' experience.</p>
        </>
      )}
    </Modal>
  );
};

/* ------------------------------------------------------------------ interviews */

export const InterviewsTab: React.FC = () => {
  const { tenantCandidates, tenantVacancies, hrEmployees } = useApp();
  const cand = useCandidate();
  const [when, setWhen] = useState<'upcoming' | 'past'>('upcoming');
  const rows = tenantCandidates
    .flatMap((c) => (c.interviews ?? []).map((iv) => ({ c, iv, v: tenantVacancies.find((x) => x.id === c.vacancyId) })))
    .filter(({ iv }) => (when === 'upcoming' ? iv.status === 'SCHEDULED' : iv.status !== 'SCHEDULED'))
    .sort((a, b) => (when === 'upcoming' ? 1 : -1) * `${a.iv.date}${a.iv.time}`.localeCompare(`${b.iv.date}${b.iv.time}`));
  const pg = usePaged(rows, 10, when);
  const first = (id: string) => hrEmployees.find((e) => e.staffId === id)?.fullName.split(' ')[0] ?? id;
  return (
    <>
      <Card
        title="Interview schedule and scorecards"
        sub="Each panelist scores every weighted criterion 1–5; the interview completes when the whole panel has scored."
        actions={
          <div className="pr-tabstrip hi-subtabs" style={{ margin: 0 }}>
            <button className={when === 'upcoming' ? 'active' : ''} onClick={() => setWhen('upcoming')}>
              Scheduled
            </button>
            <button className={when === 'past' ? 'active' : ''} onClick={() => setWhen('past')}>
              Completed
            </button>
          </div>
        }
      >
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Candidate</th>
                <th>Vacancy</th>
                <th>Panel</th>
                <th>Scorecards</th>
                <th className="hi-num">Average</th>
                <th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={7}>No interviews here.</Empty>}
              {pg.rows.map(({ c, iv, v }) => {
                const r = interviewResult(iv, v?.criteria ?? []);
                const scored = r.panelists.filter((p) => p.pct !== null).length;
                return (
                  <tr key={iv.id} className="hi-click" onClick={() => cand.open(c.id)}>
                    <td>
                      <strong>{fmtDate(iv.date)}</strong>
                      <div className="hi-sub">
                        {iv.time} · {iv.round}
                      </div>
                    </td>
                    <td>{c.candidateName}</td>
                    <td>{v?.title ?? c.appliedRole}</td>
                    <td className="hi-wrap">{iv.panel.map(first).join(', ')}</td>
                    <td>
                      <Progress pct={(scored / Math.max(1, iv.panel.length)) * 100} tone={scored === iv.panel.length ? 'success' : 'warning'} />
                      <div className="hi-sub">
                        {scored} of {iv.panel.length}
                      </div>
                    </td>
                    <td className="hi-num">{r.average !== null ? `${r.average}%` : '—'}</td>
                    <td>
                      <Pill tone={r.tone}>{r.recommendation}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="interviews" sizes={[10, 25]} />
      </Card>
      {cand.node}
    </>
  );
};

/* ------------------------------------------------------------------ offers */

export const OffersTab: React.FC = () => {
  const { tenantCandidates, tenantVacancies } = useApp();
  const cand = useCandidate();
  const rows = tenantCandidates.filter((c) => c.offer).sort((a, b) => (b.offer!.preparedOn ?? '').localeCompare(a.offer!.preparedOn ?? ''));
  const pg = usePaged(rows, 10);
  const tone = (s: string) => (s === 'ACCEPTED' ? 'success' : s === 'DECLINED' || s === 'WITHDRAWN' ? 'danger' : s === 'PENDING_APPROVAL' ? 'warning' : 'primary');
  return (
    <>
      <Card title="Offers" sub="Salaries must sit inside the grade band; an offer above the band goes to the managing director before it is issued.">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Candidate</th>
                <th>Position</th>
                <th className="hi-num">Basic</th>
                <th style={{ minWidth: 120 }}>Band position</th>
                <th>Start</th>
                <th>Status</th>
                <th>Reply</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={8}>No offers yet.</Empty>}
              {pg.rows.map((c) => {
                const o = c.offer!;
                const v = tenantVacancies.find((x) => x.id === c.vacancyId);
                const band = bandOf(o.grade);
                const casual = o.contractType === 'Daily-Rated Contract';
                const pct = band && !casual ? Math.round(((o.basic - band.min) / (band.max - band.min)) * 100) : null;
                return (
                  <tr key={c.id} className="hi-click" onClick={() => cand.open(c.id)}>
                    <td className="hi-mono">{o.ref}</td>
                    <td>{c.candidateName}</td>
                    <td>
                      {v?.title ?? c.appliedRole}
                      <div className="hi-sub">{shortGrade(o.grade)}</div>
                    </td>
                    <td className="hi-num">{casual ? `${o.dailyRate}/day` : o.basic.toLocaleString()}</td>
                    <td>
                      {pct !== null ? (
                        <>
                          <Progress pct={pct} tone={o.aboveBand ? 'danger' : 'success'} />
                          <div className="hi-sub">{o.aboveBand ? 'Above band' : `${pct}% of band`}</div>
                        </>
                      ) : (
                        <span className="hi-sub">Daily rate</span>
                      )}
                    </td>
                    <td>{fmtDate(o.startDate)}</td>
                    <td>
                      <Pill tone={tone(o.status)}>{o.status.replace('_', ' ').toLowerCase()}</Pill>
                    </td>
                    <td className="hi-sub">{o.respondedOn ? fmtDate(o.respondedOn) : o.expiresOn ? `By ${fmtDate(o.expiresOn)}` : 'Not sent'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="offers" sizes={[10, 25]} />
      </Card>
      {cand.node}
    </>
  );
};

/* ------------------------------------------------------------------ insights */

export const InsightsTab: React.FC = () => {
  const { tenantCandidates, tenantVacancies, tenantRequisitions } = useApp();
  const s = useMemo(() => hiringStats(tenantCandidates.filter((c) => c.vacancyId), tenantVacancies, tenantRequisitions), [tenantCandidates, tenantVacancies, tenantRequisitions]);
  const max = Math.max(1, ...s.funnel.map((f) => f.count));
  const gender = ['Female', 'Male'].map((g) => ({ g, applied: tenantCandidates.filter((c) => c.gender === g).length, hired: tenantCandidates.filter((c) => c.gender === g && stageOf(c) === 'Hired').length }));
  return (
    <>
      <div className="hr-stats-row">
        <Stat label="Time to hire" value={s.timeToHire !== null ? `${s.timeToHire} days` : '—'} sub="Application to offer accepted, average" />
        <Stat label="Time to fill" value={s.timeToFill !== null ? `${s.timeToFill} days` : '—'} sub="Requisition approved to offer accepted" />
        <Stat label="Offer acceptance" value={s.offerAcceptance !== null ? `${s.offerAcceptance}%` : '—'} sub="Of offers answered" tone="#10b981" />
        <Stat label="Hires this year" value={`${s.hires}`} sub={`${tenantVacancies.filter((v) => v.status === 'FILLED').length} vacancies filled`} />
      </div>
      <div className="hi-two">
        <Card title="Pipeline funnel" sub="Candidates who reached each stage">
          <div className="hi-funnel">
            {s.funnel.map((f, i) => (
              <div key={f.stage} className="hi-funnel-row">
                <span>{stageLabel(f.stage)}</span>
                <div>
                  <i style={{ width: `${(f.count / max) * 100}%` }} />
                </div>
                <strong>{f.count}</strong>
                <small>{i && s.funnel[i - 1].count ? `${Math.round((f.count / s.funnel[i - 1].count) * 100)}%` : ''}</small>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Source of hire" sub="Where applicants and hires came from">
          <div className="hi-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="hi-num">Applied</th>
                  <th className="hi-num">Hired</th>
                  <th className="hi-num">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {s.sources.map((x) => (
                  <tr key={x.source}>
                    <td>{x.source}</td>
                    <td className="hi-num">{x.applied}</td>
                    <td className="hi-num">{x.hired}</td>
                    <td className="hi-num">{x.applied ? `${Math.round((x.hired / x.applied) * 100)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hi-sub" style={{ marginTop: 8 }}>
            Applicants by gender: {gender.map((g) => `${g.g.toLowerCase()} ${g.applied} (${g.hired} hired)`).join(', ')}.
          </p>
        </Card>
      </div>
      <Card title="By vacancy">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Vacancy</th>
                <th>Status</th>
                <th className="hi-num">Applicants</th>
                <th className="hi-num">Interviewed</th>
                <th className="hi-num">Offers</th>
                <th className="hi-num">Hired</th>
                <th className="hi-num">Days open</th>
              </tr>
            </thead>
            <tbody>
              {tenantVacancies.map((v) => {
                const cs = tenantCandidates.filter((c) => c.vacancyId === v.id);
                const hiredOn = cs.filter((c) => stageOf(c) === 'Hired').map((c) => c.offer?.respondedOn ?? '').sort().slice(-1)[0];
                return (
                  <tr key={v.id}>
                    <td>
                      {v.title}
                      <div className="hi-sub">{v.id}</div>
                    </td>
                    <td>
                      <Pill tone={VAC_TONE[v.status]}>{v.status.replace('_', ' ').toLowerCase()}</Pill>
                    </td>
                    <td className="hi-num">{cs.length}</td>
                    <td className="hi-num">{cs.filter((c) => c.interviews?.length).length}</td>
                    <td className="hi-num">{cs.filter((c) => c.offer).length}</td>
                    <td className="hi-num">{cs.filter((c) => stageOf(c) === 'Hired').length}</td>
                    <td className="hi-num">{daysBetween(v.openedOn, v.status === 'FILLED' && hiredOn ? hiredOn : todayIso())}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
};
