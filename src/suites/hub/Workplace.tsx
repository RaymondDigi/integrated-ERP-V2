import React, { useState } from 'react';
import { CalendarDays, CheckCircle2, Eye, Headset, Lightbulb, Megaphone, Pin, Plus, ThumbsUp, Vote, XCircle, BarChart3 } from 'lucide-react';
import { useControl } from '../control/store';
import { useHub } from './store';
import { suggestArticles } from '../control/IctExtra';
import { DEPARTMENTS, STAFF } from '../control/data2';
import { fmtDate, TODAY } from '../finance/engine';
import type { Announcement, Survey, Ticket } from '../control/types';
import { Chips, DataTable, Field, Meter, Modal, Panel, Pill, Stat, SuitePage, type Column } from '../ui/kit';
import { ExportCsvButton } from '../../platform/Widgets';

/* ------------------------------------------------------------------ */
/* Intranet — announcements                                            */
/* ------------------------------------------------------------------ */

export const IntranetPage: React.FC = () => {
  const { state, saveAnnouncement, archiveAnnouncement, markRead, me } = useControl();
  const [show, setShow] = useState<'LIVE' | 'DRAFT' | 'ARCHIVED'>('LIVE');
  const [edit, setEdit] = useState<{ id?: string; title: string; body: string; audience: string; pinned: boolean; expires: string } | null>(null);
  const live = (a: Announcement) => a.status === 'PUBLISHED' && (!a.expires || a.expires >= TODAY);
  const rows = state.announcements.filter((a) => (show === 'LIVE' ? live(a) : show === 'DRAFT' ? a.status === 'DRAFT' : a.status === 'ARCHIVED' || (a.status === 'PUBLISHED' && !live(a)))).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at.localeCompare(a.at));
  return (
    <SuitePage
      eyebrow="Workplace"
      title="Intranet"
      subtitle="Company news and notices. Anyone can draft; managers publish. Pinned notices stay on top until they expire."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit({ title: '', body: '', audience: 'All staff', pinned: false, expires: '' })}>
          <Plus size={15} /> New announcement
        </button>
      }
    >
      <div className="sx-toolbar">
        <Chips
          value={show}
          onChange={setShow}
          options={[
            { value: 'LIVE', label: 'Live', count: state.announcements.filter(live).length },
            { value: 'DRAFT', label: 'Drafts', count: state.announcements.filter((a) => a.status === 'DRAFT').length },
            { value: 'ARCHIVED', label: 'Archived / expired', count: state.announcements.filter((a) => a.status === 'ARCHIVED' || (a.status === 'PUBLISHED' && !live(a))).length }
          ]}
        />
      </div>
      <div className="sx-row">
        {rows.map((a) => (
          <Panel
            key={a.id}
            title={
              <>
                {a.pinned && <Pin size={14} />} {a.title}
              </>
            }
            subtitle={`${a.by} · ${fmtDate(a.at.slice(0, 10))} · ${a.audience}${a.expires ? ` · until ${fmtDate(a.expires)}` : ''}`}
            action={<Pill status={a.status === 'PUBLISHED' ? 'POSTED' : a.status === 'DRAFT' ? 'DRAFT' : 'VOID'} label={a.status.toLowerCase()} />}
          >
            <p>{a.body}</p>
            <div className="sx-actions">
              <small className="sx-muted">
                <Eye size={12} /> Read by {a.reads.length}
              </small>
              {a.status === 'PUBLISHED' && !a.reads.includes(me) && (
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => markRead(a.id)}>
                  Mark as read
                </button>
              )}
              {a.status === 'DRAFT' && (
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => setEdit({ id: a.id, title: a.title, body: a.body, audience: a.audience, pinned: a.pinned, expires: a.expires ?? '' })}>
                  Edit / publish
                </button>
              )}
              {a.status === 'PUBLISHED' && (
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => archiveAnnouncement(a.id)}>
                  Archive
                </button>
              )}
            </div>
          </Panel>
        ))}
        {!rows.length && <p className="sx-note">Nothing here.</p>}
      </div>
      {edit && (
        <Modal
          title={edit.id ? 'Edit announcement' : 'New announcement'}
          onClose={() => setEdit(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => saveAnnouncement({ ...edit, expires: edit.expires || undefined, publish: false }).ok && setEdit(null)}>
                Save draft
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => saveAnnouncement({ ...edit, expires: edit.expires || undefined, publish: true }).ok && setEdit(null)}>
                <Megaphone size={14} /> Publish
              </button>
            </>
          }
        >
          <div className="sx-grid">
            <Field label="Title" required span={4}>
              <input className="form-control" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </Field>
            <Field label="Message" required span={4}>
              <textarea className="form-control" rows={4} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            </Field>
            <Field label="Audience">
              <select className="form-control" value={edit.audience} onChange={(e) => setEdit({ ...edit, audience: e.target.value })}>
                {['All staff', ...DEPARTMENTS].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Expires">
              <input className="form-control" type="date" value={edit.expires} onChange={(e) => setEdit({ ...edit, expires: e.target.value })} />
            </Field>
            <Field label="Pinned">
              <select className="form-control" value={edit.pinned ? 'y' : 'n'} onChange={(e) => setEdit({ ...edit, pinned: e.target.value === 'y' })}>
                <option value="n">No</option>
                <option value="y">Yes — keep on top</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Calendar & resource booking                                         */
/* ------------------------------------------------------------------ */

export const CalendarBookingPage: React.FC = () => {
  const { state, saveEvent, cancelEvent, me } = useControl();
  const [cal, setCal] = useState<'ALL' | 'PERSONAL' | 'TEAM' | 'COMPANY'>('ALL');
  const [f, setF] = useState<{ title: string; date: string; from: string; to: string; calendar: 'PERSONAL' | 'TEAM' | 'COMPANY'; resourceId: string; attendees: string[]; location: string } | null>(null);
  const events = state.events.filter((e) => (cal === 'ALL' || e.calendar === cal) && (e.calendar !== 'PERSONAL' || e.owner === me || e.attendees.includes(me))).sort((a, b) => a.start.localeCompare(b.start));
  const days = [...new Set(events.map((e) => e.start.slice(0, 10)))];
  const today = state.events.filter((e) => e.start.slice(0, 10) === TODAY);
  return (
    <SuitePage
      eyebrow="Workplace"
      title="Calendar & booking"
      subtitle="Personal, team and company calendars, with meeting rooms, vehicles and equipment booked without double-booking."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setF({ title: '', date: TODAY, from: '09:00', to: '10:00', calendar: 'TEAM', resourceId: '', attendees: [me], location: '' })}>
          <Plus size={15} /> New event / booking
        </button>
      }
    >
      <div className="sx-toolbar">
        <Chips
          value={cal}
          onChange={setCal}
          options={[
            { value: 'ALL', label: 'All calendars' },
            { value: 'PERSONAL', label: 'Mine' },
            { value: 'TEAM', label: 'Team' },
            { value: 'COMPANY', label: 'Company' }
          ]}
        />
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title="Agenda" subtitle={`${events.length} events`}>
          {days.map((d) => (
            <div key={d}>
              <h4 className="sx-subhead">{fmtDate(d)}</h4>
              <ul className="sx-acts">
                {events
                  .filter((e) => e.start.slice(0, 10) === d)
                  .map((e) => (
                    <li key={e.id}>
                      <Pill status={e.calendar === 'COMPANY' ? 'APPROVED' : e.calendar === 'TEAM' ? 'OPEN' : 'DRAFT'} label={e.calendar.toLowerCase()} />
                      <div>
                        <b>
                          {e.start.slice(11, 16)}–{e.end.slice(11, 16)} {e.title}
                        </b>
                        <small>
                          {e.owner} · {state.resources.find((r) => r.id === e.resourceId)?.name ?? e.location ?? 'no room'} · {e.attendees.length} attending
                        </small>
                      </div>
                      {(e.owner === me) && (
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => cancelEvent(e.id)}>
                          <XCircle size={12} /> Cancel
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </Panel>
        <Panel title="Resources" subtitle="Booked today">
          <ul className="sx-facts">
            {state.resources.map((r) => {
              const b = today.filter((e) => e.resourceId === r.id);
              return (
                <li key={r.id}>
                  <span>
                    {r.name} <small className="sx-muted">· {r.kind} · seats {r.capacity}</small>
                  </span>
                  <b>{b.length ? b.map((e) => `${e.start.slice(11, 16)}–${e.end.slice(11, 16)}`).join(', ') : 'Free'}</b>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
      {f && (
        <Modal
          title="New event"
          onClose={() => setF(null)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => saveEvent({ title: f.title, start: `${f.date}T${f.from}`, end: `${f.date}T${f.to}`, calendar: f.calendar, resourceId: f.resourceId || undefined, attendees: f.attendees, location: f.location || undefined }).ok && setF(null)}>
              <CalendarDays size={14} /> Save
            </button>
          }
        >
          <div className="sx-grid">
            <Field label="Title" required span={4}>
              <input className="form-control" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </Field>
            <Field label="Date">
              <input className="form-control" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </Field>
            <Field label="From">
              <input className="form-control" type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            </Field>
            <Field label="To">
              <input className="form-control" type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </Field>
            <Field label="Calendar">
              <select className="form-control" value={f.calendar} onChange={(e) => setF({ ...f, calendar: e.target.value as 'PERSONAL' })}>
                <option value="PERSONAL">Personal</option>
                <option value="TEAM">Team</option>
                <option value="COMPANY">Company</option>
              </select>
            </Field>
            <Field label="Book a resource" span={2}>
              <select className="form-control" value={f.resourceId} onChange={(e) => setF({ ...f, resourceId: e.target.value })}>
                <option value="">— none —</option>
                {state.resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.capacity})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Location" span={2}>
              <input className="form-control" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
            </Field>
            <Field label="Attendees" span={4}>
              <select className="form-control" multiple size={5} value={f.attendees} onChange={(e) => setF({ ...f, attendees: [...e.target.selectedOptions].map((o) => o.value) })}>
                {[...new Set([me, ...STAFF])].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Surveys, polls and suggestions                                      */
/* ------------------------------------------------------------------ */

const scaleAvg = (sv: Survey) => {
  const scaleQs = sv.questions.filter((q) => q.type === 'SCALE');
  const vals = sv.responses.flatMap((r) => scaleQs.map((q) => Number(r.answers[q.id])).filter((n) => n > 0));
  return vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : 0;
};
/** Departmental satisfaction index: average internal-customer rating (1–5) as a percentage, per department rated. */
export const satisfactionIndex = (surveys: Survey[]) => {
  const out: Record<string, { score: number; responses: number }> = {};
  surveys
    .filter((s) => s.kind === 'INTERNAL_CUSTOMER' && s.targetDept)
    .forEach((s) => {
      const cur = out[s.targetDept!] ?? { score: 0, responses: 0 };
      const n = s.responses.length;
      if (!n) return;
      out[s.targetDept!] = { score: (cur.score * cur.responses + (scaleAvg(s) / 5) * 100 * n) / (cur.responses + n), responses: cur.responses + n };
    });
  return out;
};

const SurveyAnswer: React.FC<{ sv: Survey; onClose: () => void }> = ({ sv, onClose }) => {
  const { respondSurvey } = useControl();
  const [dept, setDept] = useState('Operations');
  const [ans, setAns] = useState<Record<string, string | number>>({});
  return (
    <Modal
      title={sv.title}
      subtitle={sv.kind === 'INTERNAL_CUSTOMER' ? `Rate the ${sv.targetDept} department` : sv.audience}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => respondSurvey(sv.id, dept, ans).ok && onClose()}>
          Submit answers
        </button>
      }
    >
      <div className="sx-grid">
        <Field label="Your department" span={4}>
          <select className="form-control" value={dept} onChange={(e) => setDept(e.target.value)}>
            {DEPARTMENTS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        {sv.questions.map((q) => (
          <Field key={q.id} label={q.text} span={4}>
            {q.type === 'SCALE' ? (
              <select className="form-control" value={ans[q.id] ?? ''} onChange={(e) => setAns({ ...ans, [q.id]: Number(e.target.value) })}>
                <option value="">— rate 1 to 5 —</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 5 ? '— excellent' : n === 1 ? '— poor' : ''}
                  </option>
                ))}
              </select>
            ) : q.type === 'CHOICE' ? (
              <select className="form-control" value={ans[q.id] ?? ''} onChange={(e) => setAns({ ...ans, [q.id]: e.target.value })}>
                <option value="">— choose —</option>
                {(q.options ?? []).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <textarea className="form-control" rows={2} value={String(ans[q.id] ?? '')} onChange={(e) => setAns({ ...ans, [q.id]: e.target.value })} />
            )}
          </Field>
        ))}
      </div>
    </Modal>
  );
};

export const SurveysPage: React.FC = () => {
  const { state, createSurvey, setSurveyStatus, createPoll, vote, addSuggestion, upvote, respondSuggestion, me } = useControl();
  const [tab, setTab] = useState<'SURVEYS' | 'POLLS' | 'SUGGESTIONS'>('SURVEYS');
  const [answer, setAnswer] = useState<string | null>(null);
  const [newSv, setNewSv] = useState<{ title: string; kind: Survey['kind']; targetDept: string; audience: string; period: string; questions: string } | null>(null);
  const [poll, setPoll] = useState<{ question: string; options: string; closes: string } | null>(null);
  const [sg, setSg] = useState({ text: '', dept: 'Operations', anonymous: false });
  const [resp, setResp] = useState<Record<string, string>>({});
  const idx = satisfactionIndex(state.surveys);
  const sv = state.surveys.find((x) => x.id === answer);
  return (
    <SuitePage eyebrow="Workplace" title="Surveys & feedback" subtitle="Employee and internal-customer surveys with a departmental satisfaction index, quick polls and a suggestion box (anonymous if you prefer).">
      <div className="sx-toolbar">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: 'SURVEYS', label: 'Surveys', count: state.surveys.length },
            { value: 'POLLS', label: 'Polls', count: state.polls.length },
            { value: 'SUGGESTIONS', label: 'Suggestion box', count: state.suggestions.length }
          ]}
        />
      </div>
      {tab === 'SURVEYS' && (
        <>
          <div className="sx-stats">
            {Object.entries(idx).map(([d, v]) => (
              <Stat key={d} label={`${d} satisfaction index`} value={`${Math.round(v.score)}%`} detail={`${v.responses} internal-customer responses`} icon={<BarChart3 size={17} />} tone={v.score >= 75 ? 'green' : v.score >= 60 ? 'gold' : 'red'} />
            ))}
          </div>
          <Panel
            title="Surveys"
            action={
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNewSv({ title: '', kind: 'INTERNAL_CUSTOMER', targetDept: 'ICT', audience: 'All staff', period: TODAY.slice(0, 7), questions: 'SCALE: How satisfied are you with the service?\nSCALE: How quickly were your requests handled?\nTEXT: What should they improve?' })}>
                <Plus size={14} /> New survey
              </button>
            }
          >
            <table className="sx-mini-table">
              <thead>
                <tr>
                  <th>Survey</th>
                  <th className="sx-hide-sm">Responses</th>
                  <th>Average</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.surveys.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.title}
                      <small className="sx-muted sx-block">
                        {s.kind === 'EMPLOYEE' ? 'Employee' : `Internal customer — rates ${s.targetDept}`} · {s.period} · <Pill status={s.status === 'OPEN' ? 'OPEN' : s.status === 'DRAFT' ? 'DRAFT' : 'CLOSED'} label={s.status.toLowerCase()} />
                      </small>
                    </td>
                    <td className="sx-hide-sm">{s.responses.length}</td>
                    <td>{s.responses.length ? `${scaleAvg(s).toFixed(1)} / 5` : '—'}</td>
                    <td>
                      <div className="sx-actions">
                        {s.status === 'OPEN' && !s.responses.some((r) => r.by === me) && (
                          <button type="button" className="btn btn-primary btn-xs" onClick={() => setAnswer(s.id)}>
                            Answer
                          </button>
                        )}
                        {s.status === 'DRAFT' && (
                          <button type="button" className="btn btn-secondary btn-xs" onClick={() => setSurveyStatus(s.id, 'OPEN')}>
                            Open
                          </button>
                        )}
                        {s.status === 'OPEN' && (
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setSurveyStatus(s.id, 'CLOSED')}>
                            Close
                          </button>
                        )}
                        <ExportCsvButton name={`survey-${s.id}`} label="CSV" header={['Department', 'At', ...s.questions.map((q) => q.text)]} rows={() => s.responses.map((r) => [r.dept, r.at, ...s.questions.map((q) => r.answers[q.id] ?? '')])} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
      {tab === 'POLLS' && (
        <Panel
          title="Polls"
          action={
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPoll({ question: '', options: '', closes: TODAY })}>
              <Plus size={14} /> New poll
            </button>
          }
        >
          {state.polls.map((p) => {
            const counts = p.options.map((_, i) => Object.values(p.votes).filter((v) => v === i).length);
            const total = counts.reduce((s, n) => s + n, 0);
            return (
              <div key={p.id} className="sx-panel-body">
                <h4 className="sx-subhead">
                  {p.question} <small className="sx-muted">· closes {fmtDate(p.closes)} · {total} votes</small>
                </h4>
                <ul className="sx-facts">
                  {p.options.map((o, i) => (
                    <li key={o}>
                      <span>
                        {o}
                        <Meter value={total ? counts[i] / total : 0} />
                      </span>
                      <b>
                        {counts[i]}{' '}
                        {p.votes[me] === undefined && p.closes >= TODAY && (
                          <button type="button" className="btn btn-secondary btn-xs" onClick={() => vote(p.id, i)}>
                            <Vote size={12} /> Vote
                          </button>
                        )}
                      </b>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </Panel>
      )}
      {tab === 'SUGGESTIONS' && (
        <>
          <Panel title="Make a suggestion">
            <div className="sx-grid">
              <Field label="Your idea" span={4}>
                <textarea className="form-control" rows={2} value={sg.text} onChange={(e) => setSg({ ...sg, text: e.target.value })} />
              </Field>
              <Field label="Department">
                <select className="form-control" value={sg.dept} onChange={(e) => setSg({ ...sg, dept: e.target.value })}>
                  {DEPARTMENTS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Anonymous">
                <select className="form-control" value={sg.anonymous ? 'y' : 'n'} onChange={(e) => setSg({ ...sg, anonymous: e.target.value === 'y' })}>
                  <option value="n">No — show my name</option>
                  <option value="y">Yes — anonymous</option>
                </select>
              </Field>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => addSuggestion(sg.text, sg.dept, sg.anonymous).ok && setSg({ ...sg, text: '' })}>
              <Lightbulb size={14} /> Submit
            </button>
          </Panel>
          <Panel title="Suggestion box" subtitle="Vote for ideas you support; managers respond">
            <ul className="sx-acts">
              {[...state.suggestions]
                .sort((a, b) => b.votes.length - a.votes.length)
                .map((g) => (
                  <li key={g.id}>
                    <Pill status={{ NEW: 'SUBMITTED', UNDER_REVIEW: 'OPEN', ADOPTED: 'POSTED', DECLINED: 'REJECTED' }[g.status]} label={g.status.replace('_', ' ').toLowerCase()} />
                    <div>
                      <b>{g.text}</b>
                      <small>
                        {g.by ?? 'Anonymous'} · {g.dept} · {fmtDate(g.at.slice(0, 10))} · {g.votes.length} votes{g.response ? ` · Response: ${g.response}` : ''}
                      </small>
                      {g.status !== 'ADOPTED' && g.status !== 'DECLINED' && (
                        <div className="sx-inline-form">
                          <input className="form-control" placeholder="Response" value={resp[g.id] ?? ''} onChange={(e) => setResp({ ...resp, [g.id]: e.target.value })} />
                          <button type="button" className="btn btn-secondary btn-xs" onClick={() => respondSuggestion(g.id, 'ADOPTED', resp[g.id] ?? '')}>
                            Adopt
                          </button>
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => respondSuggestion(g.id, 'DECLINED', resp[g.id] ?? '')}>
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                    <button type="button" className="btn btn-secondary btn-xs" onClick={() => upvote(g.id)}>
                      <ThumbsUp size={12} /> {g.votes.length}
                    </button>
                  </li>
                ))}
            </ul>
          </Panel>
        </>
      )}
      {sv && <SurveyAnswer sv={sv} onClose={() => setAnswer(null)} />}
      {newSv && (
        <Modal
          title="New survey"
          subtitle="One question per line, prefixed SCALE:, TEXT: or CHOICE: (CHOICE: question | option a | option b)"
          onClose={() => setNewSv(null)}
          footer={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const questions = newSv.questions
                  .split('\n')
                  .filter((l) => l.trim())
                  .map((l) => {
                    const [kind, rest = ''] = l.split(/:(.*)/s);
                    const type = (['SCALE', 'TEXT', 'CHOICE'].includes(kind.trim().toUpperCase()) ? kind.trim().toUpperCase() : 'TEXT') as 'SCALE' | 'TEXT' | 'CHOICE';
                    const parts = (rest || l).split('|').map((x) => x.trim());
                    return { text: parts[0], type, options: type === 'CHOICE' ? parts.slice(1) : undefined };
                  });
                if (createSurvey({ title: newSv.title, kind: newSv.kind, targetDept: newSv.kind === 'INTERNAL_CUSTOMER' ? newSv.targetDept : undefined, audience: newSv.audience, period: newSv.period, questions }).ok) setNewSv(null);
              }}
            >
              Create (draft)
            </button>
          }
        >
          <div className="sx-grid">
            <Field label="Title" required span={4}>
              <input className="form-control" value={newSv.title} onChange={(e) => setNewSv({ ...newSv, title: e.target.value })} />
            </Field>
            <Field label="Kind">
              <select className="form-control" value={newSv.kind} onChange={(e) => setNewSv({ ...newSv, kind: e.target.value as Survey['kind'] })}>
                <option value="EMPLOYEE">Employee</option>
                <option value="INTERNAL_CUSTOMER">Internal customer</option>
              </select>
            </Field>
            {newSv.kind === 'INTERNAL_CUSTOMER' && (
              <Field label="Department rated">
                <select className="form-control" value={newSv.targetDept} onChange={(e) => setNewSv({ ...newSv, targetDept: e.target.value })}>
                  {DEPARTMENTS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Period">
              <input className="form-control" value={newSv.period} onChange={(e) => setNewSv({ ...newSv, period: e.target.value })} />
            </Field>
            <Field label="Questions" required span={4}>
              <textarea className="form-control" rows={5} value={newSv.questions} onChange={(e) => setNewSv({ ...newSv, questions: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
      {poll && (
        <Modal
          title="New poll"
          onClose={() => setPoll(null)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => createPoll(poll.question, poll.options.split('\n'), poll.closes).ok && setPoll(null)}>
              Create poll
            </button>
          }
        >
          <div className="sx-grid">
            <Field label="Question" required span={4}>
              <input className="form-control" value={poll.question} onChange={(e) => setPoll({ ...poll, question: e.target.value })} />
            </Field>
            <Field label="Options (one per line)" required span={3}>
              <textarea className="form-control" rows={4} value={poll.options} onChange={(e) => setPoll({ ...poll, options: e.target.value })} />
            </Field>
            <Field label="Closes">
              <input className="form-control" type="date" value={poll.closes} onChange={(e) => setPoll({ ...poll, closes: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* IT helpdesk self-service                                            */
/* ------------------------------------------------------------------ */

export const HelpdeskPage: React.FC = () => {
  const { state, createTicket, confirmTicket, reopenTicket, me, setIct } = useControl();
  const { setWorkflows } = useHub();
  const [f, setF] = useState({ title: '', department: 'Operations', category: 'Software' as Ticket['category'], urgency: 2 as 1 | 2 | 3 });
  const [why, setWhy] = useState<Record<string, string>>({});
  const mine = state.tickets.filter((t) => t.requester === me);
  const hints = f.title.trim().length > 4 ? suggestArticles(state.kb, f) : [];
  const columns: Column<Ticket>[] = [
    { key: 'n', header: 'Ticket', render: (t) => <b className="sx-mono">{t.number}</b>, width: 120 },
    { key: 't', header: 'Issue', render: (t) => t.title },
    { key: 'a', header: 'With', render: (t) => t.assignee ?? 'In the queue', hideOnMobile: true },
    {
      key: 's',
      header: 'Status',
      render: (t) =>
        t.status === 'RESOLVED' && !t.closedAt ? (
          <div className="sx-inline-form" style={{ marginTop: 0 }} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn btn-primary btn-xs" onClick={() => confirmTicket(t.id)}>
              <CheckCircle2 size={12} /> Fixed
            </button>
            <input className="form-control" placeholder="Why not fixed?" value={why[t.id] ?? ''} onChange={(e) => setWhy({ ...why, [t.id]: e.target.value })} style={{ width: 150 }} />
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => reopenTicket(t.id, why[t.id] ?? '')}>
              Reopen
            </button>
          </div>
        ) : (
          <Pill status={t.closedAt ? 'CLOSED' : t.status === 'RESOLVED' ? 'POSTED' : 'OPEN'} label={t.closedAt ? 'Closed' : t.status.replace('_', ' ').toLowerCase()} />
        )
    }
  ];
  return (
    <SuitePage eyebrow="Workplace" title="IT helpdesk" subtitle="Log an IT issue yourself, see suggested fixes from the knowledge base and follow your tickets.">
      <Panel title="Report an IT issue">
        <div className="sx-grid">
          <Field label="What is wrong?" required span={4}>
            <input className="form-control" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Cannot print delivery notes at Shimanzi" />
          </Field>
          <Field label="Category">
            <select className="form-control" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Ticket['category'] })}>
              {['Hardware', 'Software', 'Network', 'Access', 'Email', 'ERP'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Department">
            <select className="form-control" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
              {DEPARTMENTS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="How urgent?">
            <select className="form-control" value={f.urgency} onChange={(e) => setF({ ...f, urgency: Number(e.target.value) as 1 | 2 | 3 })}>
              <option value={1}>I cannot work</option>
              <option value={2}>Slowing me down</option>
              <option value={3}>Whenever possible</option>
            </select>
          </Field>
        </div>
        {hints.length > 0 && (
          <div className="sx-note">
            Try these first:{' '}
            {hints.map((a) => (
              <button key={a.id} type="button" className="btn btn-ghost btn-xs" onClick={() => (setIct('knowledge', a.id), setWorkflows('knowledge'))}>
                {a.number} {a.title}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn btn-primary btn-sm" onClick={() => createTicket({ title: f.title, requester: me, department: f.department, category: f.category, priority: f.urgency === 1 ? 'P2' : f.urgency === 2 ? 'P3' : 'P4', channel: 'Self-service', impact: 3, urgency: f.urgency }).ok && setF({ ...f, title: '' })}>
          <Headset size={14} /> Log ticket
        </button>
      </Panel>
      <h4 className="sx-subhead">My tickets</h4>
      <DataTable rows={mine} columns={columns} rowKey={(t) => t.id} empty={<p className="sx-note">You have no tickets.</p>} />
    </SuitePage>
  );
};
