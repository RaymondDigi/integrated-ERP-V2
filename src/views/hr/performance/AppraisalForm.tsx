import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { GraduationCap, Plus, Printer, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { printArea } from '../../ess/EssRecords';
import { fmtDate } from '../../../data/hireEngine';
import {
  COMPETENCIES,
  PERSPECTIVE_LABEL,
  POTENTIAL_LABEL,
  RATINGS,
  RATING_SCALE,
  STAGES,
  STAGE_LABEL,
  type Appraisal,
  type DevNeed,
  type PerfGoal,
  type Potential,
  type Rating
} from '../../../data/perfConfig';
import { ratingOf, scoreOf } from '../../../data/perfEngine';
import type { AssessInput } from '../../../context/perfState';
import { Field, Modal, PersonSelect, RatingPill, StagePill, Stars, isHrPerson, useActors, usePerfData } from './shared';

type TrainingNeedInput = { staffId: string; skill: string; reason: string; source: 'Appraisal'; ref?: string; priority: 'High' | 'Medium' | 'Low' };

export const AppraisalModal: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const { appraisals } = useApp();
  const ap = appraisals.find((a) => a.id === id);
  if (!ap) return null;
  return <AppraisalBody key={ap.stage} ap={ap} onClose={onClose} />;
};

const AppraisalBody: React.FC<{ ap: Appraisal; onClose: () => void }> = ({ ap, onClose }) => {
  const app = useApp();
  const { perfSettings, saveSelfAssessment, submitSupervisorReview, submitHodReview, calibrate, releaseRatings, acknowledgeAppraisal, resolveDispute, markNeedsSent, addToast, perfFeedback, priorRatings } = app;
  const addTrainingNeed = (app as { addTrainingNeed?: (n: TrainingNeedInput) => void }).addTrainingNeed;
  const { person, goalsBy, cycle } = usePerfData();
  const actors = useActors();
  const e = person(ap.staffId);
  const goals = goalsBy.get(ap.staffId) ?? [];
  const who: 'self' | 'sup' | null = ap.stage === 'SELF' ? 'self' : ap.stage === 'SUPERVISOR' ? 'sup' : null;

  const hrDefault = actors.find((p) => p.staffId === 'KHE-0290' && ![ap.staffId, ap.appraiserId].includes(p.staffId))?.staffId ?? actors.find((p) => isHrPerson(p) && ![ap.staffId, ap.appraiserId].includes(p.staffId))?.staffId ?? '';
  const expected = { SELF: ap.staffId, SUPERVISOR: ap.appraiserId, HOD: ap.hodId ?? '', CALIBRATION: hrDefault, ACKNOWLEDGEMENT: ap.staffId, DISPUTED: hrDefault, CLOSED: '' }[ap.stage];
  const [actor, setActor] = useState(expected);

  const [input, setInput] = useState<AssessInput>(() => ({
    goals: Object.fromEntries(goals.map((g) => [g.id, { rating: who ? g[who] : undefined, note: who === 'self' ? g.selfNote : g.supNote }])),
    comps: Object.fromEntries(COMPETENCIES.map((c) => [c.id, who ? ap.competencies[c.id]?.[who] : undefined])),
    summary: (who === 'self' ? ap.selfSummary : ap.supSummary) ?? ''
  }));
  const [potential, setPotential] = useState<Potential | undefined>(ap.potential);
  const [needs, setNeeds] = useState<DevNeed[]>(ap.devNeeds.length ? ap.devNeeds : []);
  const [agree, setAgree] = useState(true);
  const [rating, setRating] = useState<Rating | undefined>(ap.finalRating ?? ap.proposedRating);
  const [calPot, setCalPot] = useState<Potential>(ap.potential ?? 'MEDIUM');
  const [comment, setComment] = useState('');

  const setGoal = (gid: string, p: { rating?: number; note?: string }) => setInput((x) => ({ ...x, goals: { ...x.goals, [gid]: { ...x.goals[gid], ...p } } }));
  const preview = who ? scoreOf(goals.map((g) => ({ ...g, [who]: input.goals[g.id]?.rating })) as PerfGoal[], { competencies: Object.fromEntries(COMPETENCIES.map((c) => [c.id, { [who]: input.comps[c.id] }])) }, who, perfSettings) : null;
  const self = scoreOf(goals, ap, 'self', perfSettings);
  const sup = ap.supOn ? scoreOf(goals, ap, 'sup', perfSettings) : null;
  const supRating = sup?.total ? ratingOf(sup.total) : undefined;
  const fb = perfFeedback.filter((f) => f.staffId === ap.staffId);
  const prior = priorRatings.find((p) => p.staffId === ap.staffId);
  const stageIdx = STAGES.indexOf(ap.stage === 'DISPUTED' ? 'ACKNOWLEDGEMENT' : ap.stage);

  const sendNeeds = () => {
    const open = ap.devNeeds.filter((d) => !d.sentOn);
    if (!open.length) return;
    if (!addTrainingNeed) {
      addToast({ type: 'info', title: 'Training module not connected', message: 'The needs stay on the appraisal until the Training module is available.' });
      return;
    }
    open.forEach((d) => addTrainingNeed({ staffId: ap.staffId, skill: d.skill, reason: d.reason, source: 'Appraisal', ref: ap.id, priority: d.priority }));
    markNeedsSent(ap.id, open.map((d) => d.skill));
  };

  const footer = (() => {
    switch (ap.stage) {
      case 'SELF':
        return (
          <>
            <button className="btn btn-secondary" onClick={() => saveSelfAssessment(ap.id, input, false, actor)}>
              Save draft
            </button>
            <button className="btn btn-primary" onClick={() => saveSelfAssessment(ap.id, input, true, actor) && onClose()}>
              Submit self-assessment
            </button>
          </>
        );
      case 'SUPERVISOR':
        return (
          <button className="btn btn-primary" onClick={() => submitSupervisorReview(ap.id, { ...input, potential, devNeeds: needs }, actor) && onClose()}>
            Submit supervisor review
          </button>
        );
      case 'HOD':
        return (
          <button className="btn btn-primary" onClick={() => submitHodReview(ap.id, { agree, rating, comment }, actor) && onClose()}>
            {agree ? 'Agree and send to HR' : 'Adjust and send to HR'}
          </button>
        );
      case 'CALIBRATION':
        return (
          <>
            <button className="btn btn-secondary" onClick={() => rating && calibrate(ap.id, rating, calPot, comment, actor)}>
              Save calibration
            </button>
            <button className="btn btn-primary" onClick={() => releaseRatings([ap.id], actor) && onClose()}>
              Release to employee
            </button>
          </>
        );
      case 'ACKNOWLEDGEMENT':
        return (
          <>
            <button className="btn btn-secondary" onClick={() => acknowledgeAppraisal(ap.id, false, comment, actor) && onClose()}>
              Disagree — send to HR
            </button>
            <button className="btn btn-primary" onClick={() => acknowledgeAppraisal(ap.id, true, comment, actor) && onClose()}>
              Acknowledge and agree
            </button>
          </>
        );
      case 'DISPUTED':
        return (
          <>
            <button className="btn btn-secondary" onClick={() => resolveDispute(ap.id, 'UPHELD', undefined, comment, actor) && onClose()}>
              Rating stands
            </button>
            <button className="btn btn-primary" onClick={() => resolveDispute(ap.id, 'REVISED', rating, comment, actor) && onClose()}>
              Revise rating
            </button>
          </>
        );
      default:
        return null;
    }
  })();

  return (
    <Modal
      title={`${e?.fullName ?? ap.staffId} — ${cycle?.name} appraisal`}
      subtitle={`${e?.jobTitle} · ${e?.department} · supervisor ${person(ap.appraiserId)?.fullName ?? '—'}${ap.hodId ? ` · second level ${person(ap.hodId)?.fullName}` : ''}`}
      onClose={onClose}
      width={980}
      footer={
        <div className="pf-modal-foot">
          <button className="btn btn-secondary" onClick={printArea}>
            <Printer size={14} /> Print form
          </button>
          {footer && (
            <label className="pf-actor">
              <span>Acting as</span>
              <PersonSelect value={actor} onChange={setActor} people={actors} />
            </label>
          )}
          {footer}
        </div>
      }
    >
      <ol className="pf-track" aria-label="Appraisal stages">
        {STAGES.map((s, i) => (
          <li key={s} className={i < stageIdx || ap.stage === 'CLOSED' ? 'done' : i === stageIdx ? 'current' : ''}>
            <span />
            {s === 'ACKNOWLEDGEMENT' && ap.stage === 'DISPUTED' ? 'Disputed' : STAGE_LABEL[s]}
          </li>
        ))}
      </ol>

      <div className="pf-score-row">
        <div>
          <span>Self score</span>
          <strong>{(who === 'self' ? preview?.total : self.total)?.toFixed(2) ?? '—'}</strong>
        </div>
        <div>
          <span>Supervisor score</span>
          <strong>{(who === 'sup' ? preview?.total : sup?.total)?.toFixed(2) ?? '—'}</strong>
          {supRating && <small>{RATING_SCALE[supRating].label}</small>}
        </div>
        <div>
          <span>Rating</span>
          <RatingPill rating={ap.finalRating ?? ap.proposedRating} provisional={!ap.finalRating} />
        </div>
        <div>
          <span>Potential</span>
          <strong>{ap.potential ? POTENTIAL_LABEL[ap.potential] : '—'}</strong>
        </div>
        <div>
          <span>Last year</span>
          <strong>{prior ? `${prior.rating} · ${RATING_SCALE[prior.rating].label}` : '—'}</strong>
        </div>
      </div>
      <p className="pf-muted pf-small">
        Score = goals {perfSettings.goalsWeight}% (weighted by goal) + core competencies {perfSettings.competencyWeight}%. Rating bands: 4.5+ = 5, 3.5+ = 4, 2.5+ = 3, 1.5+ = 2.
      </p>

      <h4 className="pf-h4">Goals</h4>
      <div className="pf-scroll">
        <table className="hr-table pf-rate-table">
          <thead>
            <tr>
              <th>Goal</th>
              <th className="num">Target</th>
              <th className="num">Actual</th>
              <th className="num">Weight</th>
              <th>Self</th>
              <th>Supervisor</th>
            </tr>
          </thead>
          <tbody>
            {goals.map((g) => (
              <tr key={g.id}>
                <td>
                  <strong>{g.title}</strong>
                  <div className="pf-muted">
                    {PERSPECTIVE_LABEL[g.perspective]} · {g.measure}
                  </div>
                  {who && (
                    <input className="form-control pf-note-input" placeholder={who === 'self' ? 'Evidence' : 'Comment'} value={input.goals[g.id]?.note ?? ''} onChange={(ev) => setGoal(g.id, { note: ev.target.value })} aria-label={`Comment on ${g.title}`} />
                  )}
                  {!who && (g.selfNote || g.supNote) && <div className="pf-muted pf-small">{[g.selfNote && `Self: ${g.selfNote}`, g.supNote && `Supervisor: ${g.supNote}`].filter(Boolean).join(' · ')}</div>}
                </td>
                <td className="num">
                  {g.target} {g.unit}
                </td>
                <td className="num">{g.actual || '—'}</td>
                <td className="num">{g.weight}%</td>
                <td>{who === 'self' ? <Stars value={input.goals[g.id]?.rating} onChange={(v) => setGoal(g.id, { rating: v })} label={`Self rating for ${g.title}`} /> : <Stars value={g.self} label="Self rating" />}</td>
                <td>{who === 'sup' ? <Stars value={input.goals[g.id]?.rating} onChange={(v) => setGoal(g.id, { rating: v })} label={`Supervisor rating for ${g.title}`} /> : <Stars value={g.sup} label="Supervisor rating" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="pf-h4">Core competencies</h4>
      <div className="pf-comp-grid">
        {COMPETENCIES.map((c) => (
          <div key={c.id} className="pf-comp">
            <div>
              <strong>{c.label}</strong>
              <span className="pf-muted">{c.hint}</span>
            </div>
            <div className="pf-comp-rates">
              <span className="pf-muted">Self</span>
              {who === 'self' ? <Stars value={input.comps[c.id]} onChange={(v) => setInput((x) => ({ ...x, comps: { ...x.comps, [c.id]: v } }))} label={`Self rating for ${c.label}`} /> : <Stars value={ap.competencies[c.id]?.self} label="Self" />}
              <span className="pf-muted">Supervisor</span>
              {who === 'sup' ? <Stars value={input.comps[c.id]} onChange={(v) => setInput((x) => ({ ...x, comps: { ...x.comps, [c.id]: v } }))} label={`Supervisor rating for ${c.label}`} /> : <Stars value={ap.competencies[c.id]?.sup} label="Supervisor" />}
            </div>
          </div>
        ))}
      </div>

      {who ? (
        <Field label={who === 'self' ? 'Your summary of the year' : 'Overall comment to the employee'} wide>
          <textarea className="form-control" rows={3} value={input.summary} onChange={(ev) => setInput((x) => ({ ...x, summary: ev.target.value }))} />
        </Field>
      ) : (
        <div className="pf-notes-grid">
          {ap.selfSummary && (
            <div>
              <span className="pf-label">Employee</span>
              <p>{ap.selfSummary}</p>
            </div>
          )}
          {ap.supSummary && (
            <div>
              <span className="pf-label">Supervisor — {ap.supBy}</span>
              <p>{ap.supSummary}</p>
            </div>
          )}
          {ap.hodComment && (
            <div>
              <span className="pf-label">Second level — {ap.hodBy}</span>
              <p>
                {ap.hodRating ? `Adjusted to ${ap.hodRating}. ` : ''}
                {ap.hodComment}
              </p>
            </div>
          )}
          {ap.ack && (
            <div>
              <span className="pf-label">Employee acknowledgement — {fmtDate(ap.ack.on)}</span>
              <p>
                {ap.ack.agree ? 'Agreed.' : 'Disagreed.'} {ap.ack.comment}
              </p>
            </div>
          )}
          {ap.dispute && (
            <div>
              <span className="pf-label">HR decision — {ap.dispute.by}</span>
              <p>
                {ap.dispute.resolution === 'REVISED' ? `Revised ${ap.dispute.from} → ${ap.finalRating}. ` : 'Rating stands. '}
                {ap.dispute.note}
              </p>
            </div>
          )}
        </div>
      )}

      {ap.stage === 'SUPERVISOR' && (
        <div className="pr-form-grid">
          <Field label="Potential (for the 9-box)">
            <select className="form-control" value={potential ?? ''} onChange={(ev) => setPotential((ev.target.value || undefined) as Potential | undefined)}>
              <option value="">Choose</option>
              {(['HIGH', 'MEDIUM', 'LOW'] as Potential[]).map((p) => (
                <option key={p} value={p}>
                  {POTENTIAL_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <div className="req-field wide">
            <span>Development needs</span>
            {needs.map((d, i) => (
              <div key={i} className="pf-need-row">
                <input className="form-control" placeholder="Skill" value={d.skill} onChange={(ev) => setNeeds((xs) => xs.map((x, j) => (j === i ? { ...x, skill: ev.target.value } : x)))} aria-label="Skill" />
                <input className="form-control" placeholder="Why" value={d.reason} onChange={(ev) => setNeeds((xs) => xs.map((x, j) => (j === i ? { ...x, reason: ev.target.value } : x)))} aria-label="Reason" />
                <select className="form-control" value={d.priority} onChange={(ev) => setNeeds((xs) => xs.map((x, j) => (j === i ? { ...x, priority: ev.target.value as DevNeed['priority'] } : x)))} aria-label="Priority">
                  {['High', 'Medium', 'Low'].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <button className="btn btn-secondary btn-sm" aria-label="Remove need" onClick={() => setNeeds((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setNeeds((xs) => [...xs, { skill: '', reason: '', priority: 'Medium' }])}>
              <Plus size={13} /> Add need
            </button>
          </div>
        </div>
      )}

      {ap.stage === 'HOD' && (
        <div className="pr-form-grid">
          <Field label="Decision">
            <select className="form-control" value={agree ? 'agree' : 'adjust'} onChange={(ev) => setAgree(ev.target.value === 'agree')}>
              <option value="agree">Agree with the supervisor ({supRating})</option>
              <option value="adjust">Adjust the rating</option>
            </select>
          </Field>
          {!agree && (
            <Field label="Adjusted rating">
              <RatingSelect value={rating} onChange={setRating} />
            </Field>
          )}
          <Field label="Comment" wide>
            <textarea className="form-control" rows={2} value={comment} onChange={(ev) => setComment(ev.target.value)} />
          </Field>
        </div>
      )}

      {ap.stage === 'CALIBRATION' && (
        <div className="pr-form-grid">
          <Field label="Calibrated rating" hint={`Proposed: ${ap.proposedRating}`}>
            <RatingSelect value={rating} onChange={setRating} />
          </Field>
          <Field label="Potential">
            <select className="form-control" value={calPot} onChange={(ev) => setCalPot(ev.target.value as Potential)}>
              {(['HIGH', 'MEDIUM', 'LOW'] as Potential[]).map((p) => (
                <option key={p} value={p}>
                  {POTENTIAL_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason for any change" wide hint="Logged in the calibration record. Release confirms the rating shown.">
            <input className="form-control" value={comment} onChange={(ev) => setComment(ev.target.value)} />
          </Field>
        </div>
      )}

      {(ap.stage === 'ACKNOWLEDGEMENT' || ap.stage === 'DISPUTED') && (
        <div className="pr-form-grid">
          {ap.stage === 'DISPUTED' && (
            <Field label="Revised rating (if changing)">
              <RatingSelect value={rating} onChange={setRating} />
            </Field>
          )}
          <Field label={ap.stage === 'DISPUTED' ? 'Decision and reasons' : 'Your comment (needed if you disagree)'} wide>
            <textarea className="form-control" rows={2} value={comment} onChange={(ev) => setComment(ev.target.value)} />
          </Field>
        </div>
      )}

      {ap.stage !== 'SUPERVISOR' && ap.devNeeds.length > 0 && (
        <>
          <h4 className="pf-h4">Development needs</h4>
          <ul className="pf-list">
            {ap.devNeeds.map((d) => (
              <li key={d.skill}>
                <span>
                  <strong>{d.skill}</strong> — {d.reason} <span className="pf-muted">({d.priority})</span>
                </span>
                <span className="pf-muted">{d.sentOn ? `Sent to Training ${fmtDate(d.sentOn)}` : 'Not sent'}</span>
              </li>
            ))}
          </ul>
          {ap.devNeeds.some((d) => !d.sentOn) && (
            <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={sendNeeds}>
              <GraduationCap size={14} /> Send to Training (#09)
            </button>
          )}
        </>
      )}

      {fb.length > 0 && (
        <>
          <h4 className="pf-h4">Feedback this year ({fb.length})</h4>
          <ul className="pf-list compact">
            {fb.map((f) => (
              <li key={f.id}>
                <span>{f.text}</span>
                <span className="pf-muted">
                  {person(f.fromStaffId)?.fullName} · {fmtDate(f.on)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4 className="pf-h4">History</h4>
      <ul className="pf-history">
        {ap.timeline.map((t, i) => (
          <li key={i}>
            <span>{fmtDate(t.at)}</span>
            <span>{t.text}</span>
            <span className="pf-muted">{t.by}</span>
          </li>
        ))}
      </ul>
      <p className="pf-muted pf-small">
        Stage: <StagePill stage={ap.stage} />
      </p>

      {createPortal(<PrintForm ap={ap} />, document.body)}
    </Modal>
  );
};

const RatingSelect: React.FC<{ value?: Rating; onChange: (r: Rating) => void }> = ({ value, onChange }) => (
  <select className="form-control" value={value ?? ''} onChange={(ev) => onChange(Number(ev.target.value) as Rating)}>
    <option value="">Choose</option>
    {RATINGS.map((r) => (
      <option key={r} value={r}>
        {r} — {RATING_SCALE[r].label}
      </option>
    ))}
  </select>
);

/** Paper appraisal form; shown only when printing. */
const PrintForm: React.FC<{ ap: Appraisal }> = ({ ap }) => {
  const { perfSettings, activeTenant } = useApp();
  const { person, goalsBy, cycle } = usePerfData();
  const e = person(ap.staffId);
  const goals = goalsBy.get(ap.staffId) ?? [];
  const self = scoreOf(goals, ap, 'self', perfSettings);
  const sup = scoreOf(goals, ap, 'sup', perfSettings);
  return (
    <div className="ess-print-area pf-print">
      <header>
        <div>
          <strong>{activeTenant.name}</strong>
          <h2>Performance appraisal — {cycle?.name}</h2>
          <span>
            {fmtDate(cycle?.periodStart)} to {fmtDate(cycle?.periodEnd)} · ref {ap.id}
          </span>
        </div>
      </header>
      <table className="pf-print-meta">
        <tbody>
          <tr>
            <th>Employee</th>
            <td>
              {e?.fullName} ({ap.staffId})
            </td>
            <th>Job title</th>
            <td>{e?.jobTitle}</td>
          </tr>
          <tr>
            <th>Department</th>
            <td>{e?.department}</td>
            <th>Supervisor</th>
            <td>{person(ap.appraiserId)?.fullName}</td>
          </tr>
          <tr>
            <th>Second level</th>
            <td>{person(ap.hodId)?.fullName ?? '—'}</td>
            <th>Stage</th>
            <td>{STAGE_LABEL[ap.stage]}</td>
          </tr>
        </tbody>
      </table>
      <h3>Goals ({perfSettings.goalsWeight}%)</h3>
      <table>
        <thead>
          <tr>
            <th>Perspective</th>
            <th>Goal and measure</th>
            <th>Target</th>
            <th>Actual</th>
            <th>Weight</th>
            <th>Self</th>
            <th>Supervisor</th>
          </tr>
        </thead>
        <tbody>
          {goals.map((g) => (
            <tr key={g.id}>
              <td>{PERSPECTIVE_LABEL[g.perspective]}</td>
              <td>
                {g.title} — {g.measure}
              </td>
              <td>
                {g.target} {g.unit}
              </td>
              <td>{g.actual || ''}</td>
              <td>{g.weight}%</td>
              <td>{g.self ?? ''}</td>
              <td>{g.sup ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Core competencies ({perfSettings.competencyWeight}%)</h3>
      <table>
        <thead>
          <tr>
            <th>Competency</th>
            <th>Self</th>
            <th>Supervisor</th>
          </tr>
        </thead>
        <tbody>
          {COMPETENCIES.map((c) => (
            <tr key={c.id}>
              <td>{c.label}</td>
              <td>{ap.competencies[c.id]?.self ?? ''}</td>
              <td>{ap.competencies[c.id]?.sup ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Self score: <strong>{self.total?.toFixed(2) ?? '—'}</strong> · Supervisor score: <strong>{sup.total?.toFixed(2) ?? '—'}</strong> · Final rating:{' '}
        <strong>{ap.finalRating ? `${ap.finalRating} — ${RATING_SCALE[ap.finalRating].label}` : 'not yet calibrated'}</strong>
        {ap.potential ? ` · Potential: ${POTENTIAL_LABEL[ap.potential]}` : ''}
      </p>
      <h3>Comments</h3>
      <p>
        <em>Employee:</em> {ap.selfSummary ?? ''}
      </p>
      <p>
        <em>Supervisor:</em> {ap.supSummary ?? ''}
      </p>
      <p>
        <em>Second level:</em> {ap.hodComment ?? ''}
      </p>
      {ap.devNeeds.length > 0 && (
        <p>
          <em>Development needs:</em> {ap.devNeeds.map((d) => `${d.skill} (${d.priority})`).join('; ')}
        </p>
      )}
      <p className="pf-print-scale">
        Rating scale: {RATINGS.map((r) => `${r} ${RATING_SCALE[r].label}`).join(' · ')}
      </p>
      <div className="pf-print-sign">
        {['Employee', 'Supervisor', 'Second level', 'HR'].map((s) => (
          <div key={s}>
            <span>{s}</span>
            <span>Signature and date</span>
          </div>
        ))}
      </div>
    </div>
  );
};
