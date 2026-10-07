import React, { useState } from 'react';
import { CheckCircle2, XCircle, CalendarPlus, ClipboardCheck, FileSignature, MessageSquare, ArrowRight, UserX, ExternalLink, AlertTriangle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { JobApplicant } from '../../../types';
import { CHECK_LABEL, DEFAULT_CRITERIA, OFFER_MIN_SCORE, OFFER_VALID_DAYS, type BackgroundCheck, type CommEntry, type Interview, type Vacancy } from '../../../data/hireConfig';
import { GRADE_SCALES } from '../../../data/orgData';
import { CONTRACT_TYPES } from '../../../data/hrMockData';
import { addDays, annualCost, approverCandidates, bandOf, bandPosition, candidateScore, checksFor, fmtDate, interviewResult, kes, offerBlockers, screen, shortGrade, stageOf, todayIso, weighted } from '../../../data/hireEngine';
import { Drawer, Field, Modal, Pill, PersonSelect, Progress, type Tone } from './shared';

export const STAGE_TONE: Record<string, Tone> = {
  Applied: 'info',
  Screened: 'info',
  Shortlisted: 'primary',
  Interview: 'primary',
  Assessment: 'warning',
  Offer: 'warning',
  Hired: 'success',
  Rejected: 'danger',
  Withdrawn: 'info'
};

const CHECK_TONE: Record<BackgroundCheck['status'], Tone> = { NOT_STARTED: 'info', PENDING: 'warning', CLEAR: 'success', FLAGGED: 'danger', WAIVED: 'info' };
const SECTIONS = ['Overview', 'Interviews', 'Checks', 'Offer', 'Messages'] as const;
type Section = (typeof SECTIONS)[number];

export const CandidateDrawer: React.FC<{ c: JobApplicant; onClose: () => void; initial?: Section }> = ({ c, onClose, initial }) => {
  const { tenantVacancies, hrEmployees, advanceApplicant, respondToOffer, setCurrentView, setModuleTab } = useApp();
  const v = tenantVacancies.find((x) => x.id === c.vacancyId);
  const stage = stageOf(c);
  const sectionFor = (s: string): Section => (s === 'Offer' || s === 'Hired' ? 'Offer' : s === 'Assessment' ? 'Checks' : s === 'Interview' ? 'Interviews' : 'Overview');
  const [section, setSection] = useState<Section>(initial ?? sectionFor(stage));
  // Follow the candidate to the section for the new stage
  const [seenStage, setSeenStage] = useState(stage);
  if (seenStage !== stage) {
    setSeenStage(stage);
    setSection(sectionFor(stage));
  }
  const [modal, setModal] = useState<null | 'schedule' | 'offer' | 'close' | 'decline' | 'message' | 'approve' | { score: Interview }>(null);
  const open = !['Hired', 'Rejected', 'Withdrawn'].includes(stage);
  const lastIv = (c.interviews ?? []).slice(-1)[0];
  const nameOf = (id: string) => hrEmployees.find((e) => e.staffId === id)?.fullName ?? id;

  const primary = (() => {
    switch (stage) {
      case 'Applied':
        return { label: 'Run knock-out screening', icon: ClipboardCheck, run: () => advanceApplicant(c.id) };
      case 'Screened':
        return { label: 'Shortlist', icon: ArrowRight, run: () => advanceApplicant(c.id) };
      case 'Shortlisted':
        return { label: 'Schedule interview', icon: CalendarPlus, run: () => setModal('schedule') };
      case 'Interview':
        return lastIv && lastIv.status === 'SCHEDULED'
          ? { label: 'Enter scorecard', icon: ClipboardCheck, run: () => setModal({ score: lastIv }) }
          : { label: 'Start reference checks', icon: ArrowRight, run: () => advanceApplicant(c.id) };
      case 'Assessment':
        return { label: 'Prepare offer', icon: FileSignature, run: () => setModal('offer') };
      case 'Offer':
        return c.offer?.status === 'PENDING_APPROVAL'
          ? { label: 'Approve above-band offer', icon: CheckCircle2, run: () => setModal('approve') }
          : { label: 'Offer accepted', icon: CheckCircle2, run: () => respondToOffer(c.id, true) };
      case 'Hired':
        return {
          label: 'Open onboarding',
          icon: ExternalLink,
          run: () => {
            setModuleTab('onboarding', 'hires');
            setCurrentView('onboarding');
          }
        };
      default:
        return null;
    }
  })();

  return (
    <>
      <Drawer
        title={c.candidateName}
        subtitle={`${c.id} · ${c.appliedRole}${v ? ` (${v.id})` : ''}`}
        onClose={onClose}
        footer={
          <div className="hi-actions">
            {primary && (
              <button className="btn btn-primary" onClick={primary.run}>
                <primary.icon size={14} /> {primary.label}
              </button>
            )}
            {stage === 'Offer' && c.offer?.status === 'ISSUED' && (
              <button className="btn btn-secondary" onClick={() => setModal('decline')}>
                <XCircle size={14} /> Offer declined
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setModal('message')}>
              <MessageSquare size={14} /> Log message
            </button>
            {open && (
              <button className="btn btn-secondary" onClick={() => setModal('close')}>
                <UserX size={14} /> Reject / withdraw
              </button>
            )}
          </div>
        }
      >
        <div className="hi-stagebar" aria-label="Pipeline stage">
          {['Applied', 'Screened', 'Shortlisted', 'Interview', 'Assessment', 'Offer', 'Hired'].map((s, i, all) => {
            const idx = all.indexOf(stage);
            const reached = (c.stageLog ?? []).some((x) => x.stage === s) || i <= idx || s === 'Applied';
            return (
              <span key={s} className={`${reached ? 'on' : ''} ${s === stage ? 'cur' : ''}`}>
                {s === 'Assessment' ? 'Checks' : s}
              </span>
            );
          })}
        </div>
        {!open && (
          <div className={`pr-note ${stage === 'Hired' ? '' : 'warn'}`} style={{ marginBottom: 12 }}>
            <Pill tone={STAGE_TONE[stage]}>{stage}</Pill> {c.outcomeReason ?? (stage === 'Hired' ? `Accepted ${c.offer?.ref ?? 'the offer'} on ${fmtDate(c.offer?.respondedOn)}` : '')}
          </div>
        )}
        <div className="pr-tabstrip hi-subtabs" role="tablist">
          {SECTIONS.map((s) => (
            <button key={s} role="tab" aria-selected={section === s} className={section === s ? 'active' : ''} onClick={() => setSection(s)}>
              {s}
              {s === 'Interviews' && c.interviews?.length ? ` (${c.interviews.length})` : ''}
              {s === 'Messages' && c.comms?.length ? ` (${c.comms.length})` : ''}
            </button>
          ))}
        </div>

        {section === 'Overview' && <Overview c={c} v={v} />}
        {section === 'Interviews' && (
          <>
            {(c.interviews ?? []).length === 0 && <p className="hi-sub">No interviews yet{stage === 'Shortlisted' ? ' — schedule one from the button below.' : '.'}</p>}
            {(c.interviews ?? []).map((iv) => (
              <InterviewCard key={iv.id} iv={iv} v={v} nameOf={nameOf} onScore={iv.status !== 'CANCELLED' && open ? () => setModal({ score: iv }) : undefined} />
            ))}
            {open && ['Shortlisted', 'Interview'].includes(stage) && (
              <button className="btn btn-secondary btn-sm" onClick={() => setModal('schedule')}>
                <CalendarPlus size={14} /> {c.interviews?.length ? 'Schedule another round' : 'Schedule interview'}
              </button>
            )}
          </>
        )}
        {section === 'Checks' && <Checks c={c} editable={open && ['Assessment', 'Offer'].includes(stage)} />}
        {section === 'Offer' && <OfferPanel c={c} v={v} onPrepare={() => setModal('offer')} />}
        {section === 'Messages' && <Messages comms={c.comms ?? []} />}
      </Drawer>

      {modal === 'schedule' && <ScheduleModal c={c} v={v} onClose={() => setModal(null)} />}
      {modal === 'offer' && <OfferModal c={c} v={v} onClose={() => setModal(null)} />}
      {modal === 'close' && <CloseModal c={c} onClose={() => setModal(null)} />}
      {modal === 'decline' && <DeclineModal c={c} onClose={() => setModal(null)} />}
      {modal === 'message' && <MessageModal c={c} onClose={() => setModal(null)} />}
      {modal === 'approve' && <ApproveOfferModal c={c} v={v} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <ScoreModal c={c} v={v} iv={modal.score} onClose={() => setModal(null)} />}
    </>
  );
};

const Overview: React.FC<{ c: JobApplicant; v?: Vacancy }> = ({ c, v }) => {
  const s = screen(c, v);
  const score = candidateScore(c, v);
  return (
    <>
      <div className="pr-kv">
        <div>
          <span>Contact</span>
          <strong style={{ fontSize: 12.5 }}>{c.email}</strong>
          <small>{c.phone}</small>
        </div>
        <div>
          <span>Experience</span>
          <strong>{c.experienceYears} years</strong>
          <small>{c.education ?? c.institution ?? 'Education not recorded'}</small>
        </div>
        <div>
          <span>Source</span>
          <strong style={{ fontSize: 13 }}>{c.source ?? '—'}</strong>
          <small>
            Applied {fmtDate(c.appliedDate)}
            {c.internalStaffId ? ` · internal (${c.internalStaffId})` : ''}
          </small>
        </div>
        <div>
          <span>Interview score</span>
          <strong>{score !== null ? `${score}%` : '—'}</strong>
          <small>{score !== null ? (score >= OFFER_MIN_SCORE ? 'Meets the offer threshold' : `Below ${OFFER_MIN_SCORE}%`) : 'Not interviewed'}</small>
        </div>
      </div>
      {v && (
        <>
          <h4 className="hi-h4">Knock-out screening</h4>
          <ul className="hi-checks">
            <li className={c.experienceYears >= v.minYears ? 'ok' : 'bad'}>
              {c.experienceYears >= v.minYears ? <CheckCircle2 size={14} /> : <XCircle size={14} />} At least {v.minYears} years' relevant experience ({c.experienceYears})
            </li>
            {v.knockouts.map((k) => {
              const a = c.answers?.[k.id];
              const ok = a === k.expected;
              return (
                <li key={k.id} className={a === undefined ? '' : ok ? 'ok' : 'bad'}>
                  {a === undefined ? <AlertTriangle size={14} /> : ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {k.question}
                  {a === undefined ? ' — not answered' : ''}
                </li>
              );
            })}
          </ul>
          <p className="hi-sub">{s.pass ? (s.unanswered.length ? 'Passes so far; record the missing answers before screening.' : 'Meets every knock-out criterion.') : `Fails: ${s.failures.join('; ')}.`}</p>
        </>
      )}
      <h4 className="hi-h4">Stage history</h4>
      <ol className="hi-timeline">
        <li>
          <strong>Applied</strong> <span>{fmtDate(c.appliedDate)}</span>
        </li>
        {(c.stageLog ?? []).map((x, i) => (
          <li key={i}>
            <strong>{x.stage === 'Assessment' ? 'References & checks' : x.stage}</strong> <span>{fmtDate(x.at)}</span>
            {x.note && <em>{x.note}</em>}
          </li>
        ))}
      </ol>
    </>
  );
};

const InterviewCard: React.FC<{ iv: Interview; v?: Vacancy; nameOf: (id: string) => string; onScore?: () => void }> = ({ iv, v, nameOf, onScore }) => {
  const criteria = v?.criteria ?? DEFAULT_CRITERIA;
  const res = interviewResult(iv, criteria);
  return (
    <div className="hi-iv">
      <div className="hi-iv-head">
        <div>
          <strong>{iv.round}</strong>
          <div className="hi-sub">
            {fmtDate(iv.date)} at {iv.time} · {iv.location}
          </div>
        </div>
        <div className="hi-iv-score">
          <Pill tone={res.tone}>{res.complete ? `${res.average}% · ${res.recommendation}` : `${res.panelists.filter((p) => p.pct !== null).length}/${iv.panel.length} scored`}</Pill>
          {onScore && !res.complete && (
            <button className="btn btn-secondary btn-sm" onClick={onScore}>
              Enter scores
            </button>
          )}
        </div>
      </div>
      <div className="hi-scroll">
        <table className="hr-table hi-score">
          <thead>
            <tr>
              <th>Criterion</th>
              <th className="hi-num">Weight</th>
              {iv.panel.map((p) => (
                <th key={p} className="hi-num" title={nameOf(p)}>
                  {nameOf(p).split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {criteria.map((k) => (
              <tr key={k.id}>
                <td>{k.label}</td>
                <td className="hi-num">{k.weight}%</td>
                {iv.panel.map((p) => (
                  <td key={p} className="hi-num">
                    {iv.scores[p]?.[k.id] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Weighted score</td>
              <td />
              {res.panelists.map((p) => (
                <td key={p.staffId} className="hi-num">
                  {p.pct !== null ? `${p.pct}%` : '—'}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {iv.notes && Object.keys(iv.notes).length > 0 && (
        <ul className="hi-notes">
          {Object.entries(iv.notes).map(([p, n]) => (
            <li key={p}>
              <strong>{nameOf(p)}:</strong> {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const Checks: React.FC<{ c: JobApplicant; editable: boolean }> = ({ c, editable }) => {
  const { updateCheck } = useApp();
  return (
    <>
      <div className="hi-scroll">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Check</th>
              <th>Status</th>
              <th>Note</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {checksFor(c).map((k) => (
              <tr key={k.kind}>
                <td>
                  {CHECK_LABEL[k.kind]}
                  {k.kind === 'MEDICAL' && <div className="hi-sub">Optional</div>}
                </td>
                <td>
                  {editable ? (
                    <select className="form-control hi-select-sm" value={k.status} onChange={(e) => updateCheck(c.id, k.kind, e.target.value as BackgroundCheck['status'])} aria-label={CHECK_LABEL[k.kind]}>
                      {(['NOT_STARTED', 'PENDING', 'CLEAR', 'FLAGGED', 'WAIVED'] as const).map((s) => (
                        <option key={s} value={s}>
                          {s.replace('_', ' ').toLowerCase()}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Pill tone={CHECK_TONE[k.status]}>{k.status.replace('_', ' ').toLowerCase()}</Pill>
                  )}
                </td>
                <td className="hi-wrap">{k.note ?? '—'}</td>
                <td>{fmtDate(k.updatedOn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hi-sub">KRA PIN is checked on iTax, the certificate of good conduct comes from the DCI, academic papers from the issuing institution. All but the medical must be clear (or waived) before an offer.</p>
    </>
  );
};

const OfferPanel: React.FC<{ c: JobApplicant; v?: Vacancy; onPrepare: () => void }> = ({ c, v, onPrepare }) => {
  const { activeTenant } = useApp();
  const blockers = offerBlockers(c, v);
  const o = c.offer;
  if (!o)
    return (
      <>
        {blockers.length ? (
          <div className="pr-note warn">
            <strong>Not ready for an offer.</strong>
            <ul className="hi-list">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="pr-note">
            Ready for an offer.{' '}
            {stageOf(c) === 'Assessment' && (
              <button className="btn btn-primary btn-sm" onClick={onPrepare}>
                Prepare offer
              </button>
            )}
          </div>
        )}
      </>
    );
  const band = bandOf(o.grade);
  const casual = o.contractType === 'Daily-Rated Contract';
  const pos = casual || !band ? 0 : Math.round(((o.basic - band.min) / (band.max - band.min)) * 100);
  return (
    <>
      <div className="pr-kv">
        <div>
          <span>Offer {o.ref}</span>
          <strong>
            <Pill tone={o.status === 'ACCEPTED' ? 'success' : o.status === 'DECLINED' || o.status === 'WITHDRAWN' ? 'danger' : 'warning'}>{o.status.replace('_', ' ').toLowerCase()}</Pill>
          </strong>
          <small>{o.expiresOn && o.status === 'ISSUED' ? `Valid until ${fmtDate(o.expiresOn)}` : o.respondedOn ? `Answered ${fmtDate(o.respondedOn)}` : `Prepared ${fmtDate(o.preparedOn)}`}</small>
        </div>
        <div>
          <span>{casual ? 'Daily rate' : 'Basic salary'}</span>
          <strong>{casual ? `KES ${o.dailyRate}` : kes(o.basic)}</strong>
          <small>
            {shortGrade(o.grade)} {band && !casual ? `band ${band.min.toLocaleString()}–${band.max.toLocaleString()}` : ''}
          </small>
        </div>
        <div>
          <span>Start date</span>
          <strong>{fmtDate(o.startDate)}</strong>
          <small>{o.probationMonths ? `${o.probationMonths} months' probation` : 'No probation'}</small>
        </div>
        <div>
          <span>Annual cost</span>
          <strong>{kes(annualCost(o.basic, undefined, o.dailyRate))}</strong>
          <small>{o.approvedBy ? `Above band, approved by ${o.approvedBy}` : o.aboveBand ? 'Above band — needs MD approval' : 'Within band'}</small>
        </div>
      </div>
      {!casual && band && (
        <div className="hi-band" title="Position in the grade band">
          <Progress pct={pos} tone={o.aboveBand ? 'danger' : 'success'} />
          <div className="hi-sub">
            {pos}% through the {shortGrade(o.grade)} band
          </div>
        </div>
      )}
      {o.declineReason && <div className="pr-note warn">Declined: {o.declineReason}</div>}
      <h4 className="hi-h4">Offer letter</h4>
      <div className="hi-letter">
        <p>
          <strong>{activeTenant.name}</strong>
          <br />
          {fmtDate(o.issuedOn ?? o.preparedOn)} · Ref {o.ref}
        </p>
        <p>Dear {c.candidateName.split(' ')[0]},</p>
        <p>
          We are pleased to offer you the position of <strong>{v?.title ?? c.appliedRole}</strong> in the {v?.department} department, grade {shortGrade(o.grade)}, on a {o.contractType.toLowerCase()}
          {o.contractEndDate ? ` ending ${fmtDate(o.contractEndDate)}` : ''}, starting on <strong>{fmtDate(o.startDate)}</strong>.
        </p>
        <p>
          {casual ? `Your rate is KES ${o.dailyRate} per day worked, paid weekly.` : `Your basic salary is KES ${o.basic.toLocaleString()} a month, with house and transport allowances under company policy. Pay is subject to PAYE, NSSF, SHIF and the housing levy.`}{' '}
          {o.probationMonths ? `The first ${o.probationMonths} months are probation, with one week's notice on either side.` : ''}
        </p>
        <p>Please confirm your acceptance within {OFFER_VALID_DAYS} days. Bring your national ID, KRA PIN certificate, NSSF and SHIF numbers, and bank or M-Pesa details for pre-boarding.</p>
        <p>
          {o.preparedBy}
          <br />
          Human Resources
        </p>
      </div>
    </>
  );
};

const Messages: React.FC<{ comms: CommEntry[] }> = ({ comms }) => (
  <ol className="hi-timeline">
    {comms.length === 0 && <li className="hi-sub">No messages yet.</li>}
    {comms
      .slice()
      .reverse()
      .map((m, i) => (
        <li key={i}>
          <strong>{m.subject}</strong> <span>{fmtDate(m.at)}</span>
          <em>
            {m.channel} · {m.by}
          </em>
          {m.body && <p className="hi-text">{m.body}</p>}
        </li>
      ))}
  </ol>
);

/* ------------------------------------------------------------------ modals */

const ScheduleModal: React.FC<{ c: JobApplicant; v?: Vacancy; onClose: () => void }> = ({ c, v, onClose }) => {
  const { scheduleInterview, hrEmployees } = useApp();
  const [round, setRound] = useState(c.interviews?.length ? 'Second interview' : 'Panel interview');
  const [date, setDate] = useState(addDays(todayIso(), 3));
  const [time, setTime] = useState('10:00');
  const [location, setLocation] = useState('Estate boardroom, Kericho');
  const [panel, setPanel] = useState<string[]>(v?.panel ?? []);
  const options = hrEmployees.filter((e) => e.orgId === c.orgId && e.status !== 'TERMINATED' && e.basicSalaryKes >= 50_000);
  return (
    <Modal
      title={`Schedule interview · ${c.candidateName}`}
      onClose={onClose}
      width={600}
      footer={
        <div className="hi-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => scheduleInterview(c.id, { round, date, time, location, panel }) && onClose()}>
            Book and send invitation
          </button>
        </div>
      }
    >
      <div className="pr-form-grid">
        <Field label="Round">
          <input className="form-control" value={round} onChange={(e) => setRound(e.target.value)} />
        </Field>
        <Field label="Location">
          <input className="form-control" value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label="Date">
          <input className="form-control" type="date" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time">
          <input className="form-control" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field label={`Panel (${panel.length})`}>
        <div className="pr-checklist">
          {options.map((e) => (
            <label key={e.staffId}>
              <input type="checkbox" checked={panel.includes(e.staffId)} onChange={(ev) => setPanel((p) => (ev.target.checked ? [...p, e.staffId] : p.filter((x) => x !== e.staffId)))} />
              {e.fullName}
            </label>
          ))}
        </div>
      </Field>
    </Modal>
  );
};

const ScoreModal: React.FC<{ c: JobApplicant; v?: Vacancy; iv: Interview; onClose: () => void }> = ({ c, v, iv: opened, onClose }) => {
  const { saveScores, hrEmployees } = useApp();
  // Read the interview from the live record so scores saved in this session are seen
  const iv = c.interviews?.find((i) => i.id === opened.id) ?? opened;
  const criteria = v?.criteria ?? DEFAULT_CRITERIA;
  const first = iv.panel.find((p) => !iv.scores[p]) ?? iv.panel[0];
  const [panelist, setPanelist] = useState(first);
  const [scores, setScores] = useState<Record<string, number>>(iv.scores[first] ?? {});
  const [note, setNote] = useState(iv.notes?.[first] ?? '');
  const pct = weighted(scores, criteria);
  const people = hrEmployees.filter((e) => iv.panel.includes(e.staffId));
  return (
    <Modal
      title={`Scorecard · ${c.candidateName}`}
      subtitle={`${iv.round}, ${fmtDate(iv.date)}. Score each criterion 1 (poor) to 5 (excellent).`}
      onClose={onClose}
      width={620}
      footer={
        <div className="hi-actions">
          <span className="hi-sub" style={{ marginRight: 'auto' }}>
            Weighted: <strong>{pct !== null ? `${pct}%` : '—'}</strong>
          </span>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              saveScores(c.id, iv.id, panelist, scores, note.trim() || undefined);
              const nextP = iv.panel.find((p) => p !== panelist && !iv.scores[p]);
              if (nextP && pct !== null) {
                setPanelist(nextP);
                setScores({});
                setNote('');
              } else if (pct !== null) onClose();
            }}
          >
            Save scores
          </button>
        </div>
      }
    >
      <Field label="Panelist">
        <PersonSelect
          value={panelist}
          onChange={(p) => {
            setPanelist(p);
            setScores(iv.scores[p] ?? {});
            setNote(iv.notes?.[p] ?? '');
          }}
          people={people}
        />
      </Field>
      <div className="hi-scorecard">
        {criteria.map((k) => (
          <div key={k.id} className="hi-score-row">
            <span>
              {k.label} <small>{k.weight}%</small>
            </span>
            <div className="hi-dots" role="radiogroup" aria-label={k.label}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={scores[k.id] === n} className={scores[k.id] === n ? 'on' : ''} onClick={() => setScores((s) => ({ ...s, [k.id]: n }))}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Field label="Comment">
        <textarea className="form-control" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
};

const OfferModal: React.FC<{ c: JobApplicant; v?: Vacancy; onClose: () => void }> = ({ c, v, onClose }) => {
  const { prepareOffer, hireRules } = useApp();
  const casual = v?.contractType === 'Daily-Rated Contract';
  const [grade, setGrade] = useState(c.offer?.grade ?? v?.grade ?? GRADE_SCALES[2]);
  const [basic, setBasic] = useState(c.offer?.basic || v?.salaryKes || bandOf(grade)?.mid || 0);
  const [dailyRate, setDailyRate] = useState(c.offer?.dailyRate ?? (casual ? v?.salaryKes : undefined) ?? 700);
  const [contractType, setContractType] = useState(c.offer?.contractType ?? v?.contractType ?? 'Standard Employment Contract');
  const [endDate, setEndDate] = useState(c.offer?.contractEndDate ?? '');
  const [startDate, setStartDate] = useState(c.offer?.startDate ?? addDays(todayIso(), 12));
  const [probation, setProbation] = useState(c.offer?.probationMonths ?? (casual ? 0 : hireRules.probationMonths));
  const band = bandOf(grade);
  const isDaily = contractType === 'Daily-Rated Contract';
  const pos = isDaily ? 'within' : bandPosition(basic, grade);
  const hasEnd = CONTRACT_TYPES.find((t) => t.name === contractType)?.hasEndDate;
  return (
    <Modal
      title={`Prepare offer · ${c.candidateName}`}
      subtitle={`${v?.title ?? c.appliedRole} · requisition salary ${casual ? `KES ${v?.salaryKes}/day` : kes(v?.salaryKes ?? 0)}`}
      onClose={onClose}
      width={640}
      footer={
        <div className="hi-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              prepareOffer(c.id, { basic: isDaily ? 0 : basic, dailyRate: isDaily ? dailyRate : undefined, grade, contractType, contractEndDate: hasEnd ? endDate || undefined : undefined, startDate, probationMonths: probation }) && onClose()
            }
          >
            {pos === 'above' ? 'Send for MD approval' : 'Issue offer'}
          </button>
        </div>
      }
    >
      <div className="pr-form-grid">
        <Field label="Grade">
          <select className="form-control" value={grade} onChange={(e) => setGrade(e.target.value)}>
            {GRADE_SCALES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="Contract type">
          <select className="form-control" value={contractType} onChange={(e) => setContractType(e.target.value)}>
            {CONTRACT_TYPES.filter((t) => t.payBasis !== 'OUTPUT_RATE').map((t) => (
              <option key={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
        {isDaily ? (
          <Field label="Daily rate (KES)">
            <input className="form-control" type="number" min={0} value={dailyRate} onChange={(e) => setDailyRate(Number(e.target.value))} />
          </Field>
        ) : (
          <Field label="Basic salary (KES a month)" hint={band ? `${shortGrade(grade)} band ${band.min.toLocaleString()}–${band.max.toLocaleString()}` : undefined}>
            <input className={`form-control ${pos !== 'within' ? 'is-invalid' : ''}`} type="number" min={0} step={500} value={basic} onChange={(e) => setBasic(Number(e.target.value))} />
          </Field>
        )}
        <Field label="Start date">
          <input className="form-control" type="date" min={addDays(todayIso(), 1)} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Probation (months)" hint={`Company maximum ${hireRules.maxProbationMonths}`}>
          <input className="form-control" type="number" min={0} max={hireRules.maxProbationMonths} value={probation} onChange={(e) => setProbation(Number(e.target.value))} />
        </Field>
        {hasEnd && (
          <Field label="Contract end date">
            <input className="form-control" type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        )}
      </div>
      {pos === 'below' && <div className="pr-note bad">Below the {shortGrade(grade)} minimum — the offer cannot be issued at this salary.</div>}
      {pos === 'above' && <div className="pr-note warn">Above the {shortGrade(grade)} maximum. The offer goes to the managing director for approval before it is sent.</div>}
      <div className="pr-note">
        Annual cost {kes(annualCost(isDaily ? 0 : basic, undefined, isDaily ? dailyRate : undefined))}. {startDate ? `First month is pro-rated from ${fmtDate(startDate)}.` : ''}
      </div>
    </Modal>
  );
};

const ApproveOfferModal: React.FC<{ c: JobApplicant; v?: Vacancy; onClose: () => void }> = ({ c, v, onClose }) => {
  const { approveOffer, hrEmployees } = useApp();
  const people = approverCandidates('MD', { orgId: c.orgId, department: v?.department ?? '' }, hrEmployees);
  const [actor, setActor] = useState(people[0]?.staffId ?? '');
  return (
    <Modal
      title="Approve above-band offer"
      subtitle={`${c.offer?.ref} · ${kes(c.offer?.basic ?? 0)} (${shortGrade(c.offer?.grade ?? '')} max ${kes(bandOf(c.offer?.grade ?? '')?.max ?? 0)})`}
      onClose={onClose}
      width={480}
      footer={
        <div className="hi-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => approveOffer(c.id, actor) && onClose()}>
            Approve and issue
          </button>
        </div>
      }
    >
      <Field label="Acting as" hint={`Prepared by ${c.offer?.preparedBy}, who cannot approve it.`}>
        <PersonSelect value={actor} onChange={setActor} people={people} />
      </Field>
    </Modal>
  );
};

const CloseModal: React.FC<{ c: JobApplicant; onClose: () => void }> = ({ c, onClose }) => {
  const { closeApplicant } = useApp();
  const [outcome, setOutcome] = useState<'Rejected' | 'Withdrawn'>('Rejected');
  const [reason, setReason] = useState('');
  return (
    <Modal
      title={`Close application · ${c.candidateName}`}
      onClose={onClose}
      width={480}
      footer={
        <div className="hi-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!reason.trim()}
            onClick={() => {
              closeApplicant(c.id, outcome, reason);
              onClose();
            }}
          >
            Close application
          </button>
        </div>
      }
    >
      <Field label="Outcome">
        <select className="form-control" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
          <option value="Rejected">Rejected by us (regret email logged)</option>
          <option value="Withdrawn">Withdrawn by the candidate</option>
        </select>
      </Field>
      <Field label="Reason">
        <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Not selected after interview" />
      </Field>
    </Modal>
  );
};

const DeclineModal: React.FC<{ c: JobApplicant; onClose: () => void }> = ({ c, onClose }) => {
  const { respondToOffer } = useApp();
  const [reason, setReason] = useState('');
  return (
    <Modal
      title="Offer declined"
      subtitle={c.offer?.ref}
      onClose={onClose}
      width={460}
      footer={
        <div className="hi-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              respondToOffer(c.id, false, reason);
              onClose();
            }}
          >
            Record decline
          </button>
        </div>
      }
    >
      <Field label="Reason given">
        <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Counter-offer from current employer" />
      </Field>
    </Modal>
  );
};

const MessageModal: React.FC<{ c: JobApplicant; onClose: () => void }> = ({ c, onClose }) => {
  const { logComm } = useApp();
  const [channel, setChannel] = useState<CommEntry['channel']>('Email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  return (
    <Modal
      title={`Message · ${c.candidateName}`}
      subtitle={`${c.email} · ${c.phone}`}
      onClose={onClose}
      width={520}
      footer={
        <div className="hi-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!subject.trim()}
            onClick={() => {
              logComm(c.id, { channel, subject: subject.trim(), body: body.trim() || undefined });
              onClose();
            }}
          >
            Log message
          </button>
        </div>
      }
    >
      <div className="pr-form-grid">
        <Field label="Channel">
          <select className="form-control" value={channel} onChange={(e) => setChannel(e.target.value as CommEntry['channel'])}>
            {(['Email', 'SMS', 'Phone', 'Portal'] as const).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Subject">
          <input className="form-control" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message" wide>
          <textarea className="form-control" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};
