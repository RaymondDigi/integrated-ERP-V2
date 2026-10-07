import React, { useMemo, useState } from 'react';
import { ExternalLink, GraduationCap, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { addDays, fmtDate } from '../../../data/hireEngine';
import type { Pip } from '../../../data/perfConfig';
import type { PipDraft } from '../../../context/perfState';
import { EmpCell, Empty, Field, Modal, PersonSelect, Pill, useActors, usePerfData } from './shared';

type TrainingNeedInput = { staffId: string; skill: string; reason: string; source: 'Appraisal'; ref?: string; priority: 'High' | 'Medium' | 'Low' };

const PIP_TONE: Record<Pip['status'], 'warning' | 'info' | 'success' | 'danger'> = { ACTIVE: 'warning', EXTENDED: 'info', SUCCESSFUL: 'success', REFERRED: 'danger' };
const PIP_LABEL: Record<Pip['status'], string> = { ACTIVE: 'Active', EXTENDED: 'Extended', SUCCESSFUL: 'Successful', REFERRED: 'Referred to disciplinary' };

export const PipTab: React.FC = () => {
  const app = useApp();
  const { pips, selectedOrgId, markNeedsSent, addToast } = app;
  const addTrainingNeed = (app as { addTrainingNeed?: (n: TrainingNeedInput) => void }).addTrainingNeed;
  const { aps, person } = usePerfData();
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const list = pips.filter((p) => p.orgId === selectedOrgId).sort((a, b) => Number(['SUCCESSFUL', 'REFERRED'].includes(a.status)) - Number(['SUCCESSFUL', 'REFERRED'].includes(b.status)) || b.openedOn.localeCompare(a.openedOn));
  const paged = usePaged(list, 10);

  const needs = useMemo(() => aps.flatMap((a) => a.devNeeds.map((d) => ({ a, d }))), [aps]);
  const needsPaged = usePaged(needs, 10);
  const unsent = needs.filter((n) => !n.d.sentOn);

  const sendAll = () => {
    if (!addTrainingNeed) {
      addToast({ type: 'info', title: 'Training module not connected', message: 'Needs stay on the appraisals until Training is available.' });
      return;
    }
    unsent.forEach(({ a, d }) => addTrainingNeed({ staffId: a.staffId, skill: d.skill, reason: d.reason, source: 'Appraisal', ref: a.id, priority: d.priority }));
    const by = new Map<string, string[]>();
    unsent.forEach(({ a, d }) => by.set(a.id, [...(by.get(a.id) ?? []), d.skill]));
    by.forEach((skills, id) => markNeedsSent(id, skills));
  };

  return (
    <div className="pf-stack">
      <div className="hr-table-card">
        <div className="pf-table-head">
          <div>
            <h3>Performance improvement plans</h3>
            <span className="pf-muted">A rating of 2 or below opens a plan automatically when ratings are released.</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> Open a plan
          </button>
        </div>
        <div className="pf-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Employee</th>
                <th>Supervisor</th>
                <th>Opened</th>
                <th>Next review</th>
                <th className="num">Objectives met</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {!paged.rows.length && <Empty cols={7}>No improvement plans.</Empty>}
              {paged.rows.map((p) => {
                const next = p.reviews.find((r) => !r.heldOn);
                return (
                  <tr key={p.id} className="pf-click" onClick={() => setOpen(p.id)}>
                    <td>
                      <button className="pf-link">{p.id}</button>
                    </td>
                    <td>
                      <EmpCell e={person(p.staffId)} id={p.staffId} />
                    </td>
                    <td>{person(p.supervisorId)?.fullName ?? '—'}</td>
                    <td>{fmtDate(p.openedOn)}</td>
                    <td>{['ACTIVE', 'EXTENDED'].includes(p.status) && next ? fmtDate(next.due) : '—'}</td>
                    <td className="num">
                      {p.objectives.filter((o) => o.status === 'MET').length} / {p.objectives.length}
                    </td>
                    <td>
                      <Pill tone={PIP_TONE[p.status]}>{PIP_LABEL[p.status]}</Pill>
                      {p.outcome?.caseId && <div className="pf-muted">Case {p.outcome.caseId}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={paged} noun="plans" />
      </div>

      <div className="hr-table-card">
        <div className="pf-table-head">
          <div>
            <h3>Development needs from appraisals</h3>
            <span className="pf-muted">
              {needs.length} needs · {unsent.length} not yet sent to Training
            </span>
          </div>
          <button className="btn btn-secondary btn-sm" disabled={!unsent.length} onClick={sendAll}>
            <GraduationCap size={14} /> Send {unsent.length || ''} to Training (#09)
          </button>
        </div>
        <div className="pf-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Skill</th>
                <th>Why</th>
                <th>Priority</th>
                <th>Training</th>
              </tr>
            </thead>
            <tbody>
              {!needsPaged.rows.length && <Empty cols={5}>No needs recorded yet — supervisors add them at review.</Empty>}
              {needsPaged.rows.map(({ a, d }) => (
                <tr key={`${a.id}${d.skill}`}>
                  <td>
                    <EmpCell e={person(a.staffId)} id={a.staffId} />
                  </td>
                  <td>{d.skill}</td>
                  <td>{d.reason}</td>
                  <td>
                    <Pill tone={d.priority === 'High' ? 'danger' : d.priority === 'Medium' ? 'warning' : 'primary'}>{d.priority}</Pill>
                  </td>
                  <td>{d.sentOn ? `Sent ${fmtDate(d.sentOn)}` : <span className="pf-muted">Not sent</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={needsPaged} noun="needs" />
      </div>

      {open && <PipModal id={open} onClose={() => setOpen(null)} />}
      {creating && <NewPip onClose={() => setCreating(false)} />}
    </div>
  );
};

const PipModal: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const { pips, recordPipReview, closePip, setCurrentView, setModuleTab, perfToday } = useApp();
  const { person } = usePerfData();
  const actors = useActors();
  const p = pips.find((x) => x.id === id)!;
  const live = ['ACTIVE', 'EXTENDED'].includes(p.status);
  const nextIdx = p.reviews.findIndex((r) => !r.heldOn);
  const [actor, setActor] = useState(p.supervisorId);
  const [note, setNote] = useState('');
  const [obj, setObj] = useState<Record<string, Pip['objectives'][number]['status']>>(Object.fromEntries(p.objectives.map((o) => [o.id, o.status])));
  const [outcome, setOutcome] = useState<'SUCCESSFUL' | 'EXTENDED' | 'REFERRED'>('REFERRED');
  const [extendTo, setExtendTo] = useState(addDays(p.endDate, 30));
  const [outNote, setOutNote] = useState('');
  return (
    <Modal
      title={`${p.id} — ${person(p.staffId)?.fullName}`}
      subtitle={`Opened ${fmtDate(p.openedOn)} by ${p.openedBy} · supervisor ${person(p.supervisorId)?.fullName} · ends ${fmtDate(p.endDate)}`}
      onClose={onClose}
      width={820}
      footer={
        live ? (
          <div className="pf-modal-foot">
            <label className="pf-actor">
              <span>Acting as</span>
              <PersonSelect value={actor} onChange={setActor} people={actors} />
            </label>
            {nextIdx >= 0 && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (recordPipReview(p.id, nextIdx, note, obj, actor)) setNote('');
                }}
              >
                Record review
              </button>
            )}
            <button className="btn btn-primary" onClick={() => closePip(p.id, outcome, outNote, actor, extendTo) && outcome !== 'EXTENDED' && onClose()}>
              {outcome === 'REFERRED' ? 'Refer to disciplinary' : outcome === 'EXTENDED' ? 'Extend plan' : 'Close as successful'}
            </button>
          </div>
        ) : undefined
      }
    >
      <p>{p.reason}</p>
      <h4 className="pf-h4">Objectives</h4>
      <ul className="pf-list">
        {p.objectives.map((o) => (
          <li key={o.id}>
            <span>
              <strong>{o.text}</strong>
              <span className="pf-muted"> · {o.measure}</span>
            </span>
            {live ? (
              <select className="form-control pf-select-sm" value={obj[o.id]} onChange={(e) => setObj((x) => ({ ...x, [o.id]: e.target.value as typeof o.status }))} aria-label={`Status of ${o.text}`}>
                <option value="OPEN">Open</option>
                <option value="MET">Met</option>
                <option value="NOT_MET">Not met</option>
              </select>
            ) : (
              <Pill tone={o.status === 'MET' ? 'success' : o.status === 'NOT_MET' ? 'danger' : 'primary'}>{o.status === 'MET' ? 'Met' : o.status === 'NOT_MET' ? 'Not met' : 'Open'}</Pill>
            )}
          </li>
        ))}
      </ul>
      <div className="pf-notes-grid">
        <div>
          <span className="pf-label">Support agreed</span>
          <p>{p.support}</p>
        </div>
      </div>
      <h4 className="pf-h4">Reviews</h4>
      <ul className="pf-history">
        {p.reviews.map((r, i) => (
          <li key={i}>
            <span>{fmtDate(r.due)}</span>
            <span>{r.heldOn ? r.note : i === nextIdx ? <em>Next review{r.due < perfToday ? ' — overdue' : ''}</em> : 'Planned'}</span>
            <span className="pf-muted">{r.by ?? ''}</span>
          </li>
        ))}
      </ul>
      {live && (
        <div className="pr-form-grid">
          {nextIdx >= 0 && (
            <Field label={`Notes for the ${fmtDate(p.reviews[nextIdx].due)} review`} wide>
              <textarea className="form-control" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          )}
          <Field label="Outcome">
            <select className="form-control" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
              <option value="SUCCESSFUL">Successful — close the plan</option>
              <option value="EXTENDED">Extend the plan</option>
              <option value="REFERRED">Not met — refer to disciplinary</option>
            </select>
          </Field>
          {outcome === 'EXTENDED' && (
            <Field label="Extend to">
              <input className="form-control" type="date" value={extendTo} onChange={(e) => setExtendTo(e.target.value)} />
            </Field>
          )}
          <Field label="Reason for the outcome" wide hint={outcome === 'REFERRED' ? 'Raises a poor performance case in Disciplinary (#10) with this plan as evidence.' : undefined}>
            <textarea className="form-control" rows={2} value={outNote} onChange={(e) => setOutNote(e.target.value)} />
          </Field>
        </div>
      )}
      {p.outcome && (
        <div className="pr-note">
          {PIP_LABEL[p.status]} on {fmtDate(p.outcome.on)} by {p.outcome.by}: {p.outcome.note}
          {p.outcome.caseId && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginLeft: 8 }}
              onClick={() => {
                setModuleTab('disciplinary', 'cases');
                setCurrentView('disciplinary');
              }}
            >
              <ExternalLink size={13} /> Case {p.outcome.caseId}
            </button>
          )}
        </div>
      )}
      <h4 className="pf-h4">History</h4>
      <ul className="pf-history">
        {p.history.map((h, i) => (
          <li key={i}>
            <span>{fmtDate(h.at)}</span>
            <span>{h.text}</span>
            <span className="pf-muted">{h.by}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
};

const NewPip: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { openPip, perfToday } = useApp();
  const { aps, person, cycle } = usePerfData();
  const actors = useActors();
  const people = aps.map((a) => person(a.staffId)!).filter(Boolean);
  const [d, setD] = useState<PipDraft>({ staffId: '', reason: '', objectives: [{ text: '', measure: '' }], support: '', reviewDates: [30, 60, 90].map((n) => addDays(perfToday, n)), cycleId: cycle?.id });
  const ap = aps.find((a) => a.staffId === d.staffId);
  const [actor, setActor] = useState('');
  const set = (p: Partial<PipDraft>) => setD((x) => ({ ...x, ...p }));
  return (
    <Modal
      title="Open an improvement plan"
      subtitle="Objectives, support and review dates are agreed with the employee."
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => openPip({ ...d, appraisalId: ap?.id }, actor || ap?.appraiserId || '') && onClose()}>
            Open plan
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Employee">
          <PersonSelect value={d.staffId} onChange={(v) => set({ staffId: v })} people={people} />
        </Field>
        <Field label="Acting as" hint={ap ? `Supervisor: ${person(ap.appraiserId)?.fullName}` : 'The supervisor or HR'}>
          <PersonSelect value={actor || ap?.appraiserId || ''} onChange={setActor} people={actors} />
        </Field>
        <Field label="Why a plan is needed" wide>
          <textarea className="form-control" rows={2} value={d.reason} onChange={(e) => set({ reason: e.target.value })} />
        </Field>
        <div className="req-field wide">
          <span>Objectives</span>
          {d.objectives.map((o, i) => (
            <div key={i} className="pf-need-row">
              <input className="form-control" placeholder="Objective" value={o.text} onChange={(e) => set({ objectives: d.objectives.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} aria-label="Objective" />
              <input className="form-control" placeholder="How measured" value={o.measure} onChange={(e) => set({ objectives: d.objectives.map((x, j) => (j === i ? { ...x, measure: e.target.value } : x)) })} aria-label="Measure" />
              <button className="btn btn-secondary btn-sm" aria-label="Remove objective" onClick={() => set({ objectives: d.objectives.filter((_, j) => j !== i) })}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ objectives: [...d.objectives, { text: '', measure: '' }] })}>
            <Plus size={13} /> Add objective
          </button>
        </div>
        <Field label="Support the company gives" wide>
          <textarea className="form-control" rows={2} value={d.support} onChange={(e) => set({ support: e.target.value })} />
        </Field>
        {d.reviewDates.map((r, i) => (
          <Field key={i} label={`Review ${i + 1}`}>
            <input className="form-control" type="date" value={r} onChange={(e) => set({ reviewDates: d.reviewDates.map((x, j) => (j === i ? e.target.value : x)) })} />
          </Field>
        ))}
      </div>
      <div className="pr-note">Plans run 60–90 days with a review at least monthly. If the objectives are not met, the case goes to a fair disciplinary process (Employment Act s.41) and the plan is the evidence.</div>
    </Modal>
  );
};
