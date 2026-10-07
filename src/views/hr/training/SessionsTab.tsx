import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus, Printer, UserPlus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Modal } from '../payroll/shared';
import { printArea } from '../../ess/EssRecords';
import { COURSES, certById, courseById, type TrainingSession } from '../../../data/trainingConfig';
import { kes, leaveClashes, passed, seatsTaken, sessionCost } from '../../../data/trainingEngine';
import { addDays, fmtDate } from '../../../data/timeEngine';
import { addMonthsIso } from '../../../data/discipline';
import { Chips, Empty, Pill, useTrainingOrg } from './shared';

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const sessionState = (s: TrainingSession, today: string) =>
  s.status !== 'Scheduled' ? s.status : today < s.start ? 'Upcoming' : today <= s.end ? 'In progress' : 'Awaiting close';
const STATE_CLS: Record<string, string> = { Upcoming: 'info', 'In progress': 'primary', 'Awaiting close': 'warning', Completed: 'success', Cancelled: 'critical' };

export const SessionsTab: React.FC = () => {
  const { scheduleTrainingSession, selectedOrgId, leaveRequests } = useApp();
  const { sessions, today } = useTrainingOrg();
  const [show, setShow] = useState<'UPCOMING' | 'PAST' | 'ALL'>('UPCOMING');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ courseId: COURSES[0].id, start: today, end: today, venue: '', trainer: '', capacity: '10' });

  const list = useMemo(
    () =>
      sessions
        .filter((s) => (show === 'ALL' ? true : show === 'UPCOMING' ? s.status === 'Scheduled' : s.status !== 'Scheduled'))
        .sort((a, b) => (show === 'PAST' ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start))),
    [sessions, show]
  );
  const months = useMemo(() => {
    const m = new Map<string, TrainingSession[]>();
    for (const s of list) m.set(s.start.slice(0, 7), [...(m.get(s.start.slice(0, 7)) ?? []), s]);
    return [...m.entries()];
  }, [list]);
  const open = sessions.find((s) => s.id === openId);

  const setCourse = (courseId: string) => {
    const c = courseById(courseId)!;
    setDraft((d) => ({ ...d, courseId, end: addDays(d.start, c.days - 1), venue: d.venue || (c.providerType === 'Internal' ? 'Estate training room' : c.provider), trainer: d.trainer || c.provider }));
  };

  return (
    <>
      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Sessions</h3>
            <p>Book people from needs, mark attendance and scores, then close the session to issue certificates and update the skills matrix.</p>
          </div>
          <div className="tm-actions">
            <Chips
              label="Sessions"
              value={show}
              onChange={setShow}
              options={[
                { id: 'UPCOMING', label: 'Open', n: sessions.filter((s) => s.status === 'Scheduled').length },
                { id: 'PAST', label: 'Closed', n: sessions.filter((s) => s.status !== 'Scheduled').length },
                { id: 'ALL', label: 'All' }
              ]}
            />
            <button
              className="btn btn-primary"
              onClick={() => {
                setDraft({ courseId: '', start: today, end: today, venue: '', trainer: '', capacity: '10' });
                setAdding(true);
              }}
            >
              <CalendarPlus size={14} /> Schedule session
            </button>
          </div>
        </div>
        {months.length === 0 && <p className="tm-empty">No sessions.</p>}
        {months.map(([key, ss]) => (
          <div key={key} className="tr-month">
            <h4>
              {MON[Number(key.slice(5, 7)) - 1]} {key.slice(0, 4)}
            </h4>
            <ul className="tr-sessions">
              {ss.map((s) => {
                const c = courseById(s.courseId);
                const st = sessionState(s, today);
                const wait = s.enrolments.filter((e) => e.status === 'Waitlisted').length;
                const clashes = s.status === 'Scheduled' ? s.enrolments.filter((e) => e.status === 'Enrolled' && leaveClashes(leaveRequests, e.staffId, s.start, s.end).length).length : 0;
                return (
                  <li key={s.id}>
                    <button className="tr-session" onClick={() => setOpenId(s.id)} data-session={s.id}>
                      <span className="tr-date">
                        <b>{Number(s.start.slice(8, 10))}</b>
                        <small>{MON[Number(s.start.slice(5, 7)) - 1].slice(0, 3)}</small>
                      </span>
                      <span className="tr-session-body">
                        <strong>{c?.title}</strong>
                        <span>
                          {s.id} · {s.start === s.end ? fmtDate(s.start) : `${fmtDate(s.start)} – ${fmtDate(s.end)}`} · {s.venue}
                        </span>
                      </span>
                      <span className="tr-session-meta">
                        <span>
                          {seatsTaken(s)}/{s.capacity} seats{wait ? ` · ${wait} waiting` : ''}
                          {clashes ? ` · ${clashes} leave clash` : ''}
                        </span>
                        <Pill cls={STATE_CLS[st]}>{st}</Pill>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {open && <SessionModal s={open} onClose={() => setOpenId(null)} />}

      {adding && (
        <Modal
          title="Schedule session"
          onClose={() => setAdding(false)}
          width={620}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!draft.courseId || !draft.start || draft.end < draft.start || !draft.venue.trim() || !(Number(draft.capacity) > 0)}
                onClick={() => {
                  const s = scheduleTrainingSession({ orgId: selectedOrgId, courseId: draft.courseId, start: draft.start, end: draft.end, venue: draft.venue.trim(), trainer: draft.trainer.trim(), capacity: Number(draft.capacity) });
                  setAdding(false);
                  setShow('UPCOMING');
                  setOpenId(s.id);
                }}
              >
                Schedule
              </button>
            </>
          }
        >
          <div className="pr-form-grid">
            <label className="req-field wide">
              <span>Course</span>
              <select className="form-control" value={draft.courseId} onChange={(ev) => setCourse(ev.target.value)}>
                <option value="">Choose…</option>
                {COURSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} · {c.days} day{c.days === 1 ? '' : 's'} · {kes(c.costPerHead)}
                  </option>
                ))}
              </select>
            </label>
            <label className="req-field">
              <span>Starts</span>
              <input type="date" className="form-control" value={draft.start} onChange={(ev) => setDraft({ ...draft, start: ev.target.value, end: addDays(ev.target.value, (courseById(draft.courseId)?.days ?? 1) - 1) })} />
            </label>
            <label className="req-field">
              <span>Ends</span>
              <input type="date" className="form-control" value={draft.end} min={draft.start} onChange={(ev) => setDraft({ ...draft, end: ev.target.value })} />
            </label>
            <label className="req-field">
              <span>Venue</span>
              <input className="form-control" value={draft.venue} onChange={(ev) => setDraft({ ...draft, venue: ev.target.value })} />
            </label>
            <label className="req-field">
              <span>Trainer</span>
              <input className="form-control" value={draft.trainer} onChange={(ev) => setDraft({ ...draft, trainer: ev.target.value })} />
            </label>
            <label className="req-field">
              <span>Capacity</span>
              <input type="number" min={1} className="form-control" value={draft.capacity} onChange={(ev) => setDraft({ ...draft, capacity: ev.target.value })} />
            </label>
          </div>
          {draft.start < today && <p className="pr-note">The start date is in the past — use this to record a session already held.</p>}
        </Modal>
      )}
    </>
  );
};

const SessionModal: React.FC<{ s: TrainingSession; onClose: () => void }> = ({ s, onClose }) => {
  const { enrolInSession, updateEnrolment, withdrawEnrolment, closeTrainingSession, cancelTrainingSession, leaveRequests, activeTenant } = useApp();
  const { byId, staff, needs, today } = useTrainingOrg();
  const c = courseById(s.courseId);
  const cert = certById(c?.certId ?? '');
  const st = sessionState(s, today);
  const started = s.start <= today;
  const open = s.status === 'Scheduled';
  const [addId, setAddId] = useState('');
  const [cost, setCost] = useState(String(sessionCost(s)));
  const [invoice, setInvoice] = useState('');
  const [closing, setClosing] = useState(false);
  const [printing, setPrinting] = useState<string | null>(null);

  const roster = s.enrolments.filter((e) => e.status !== 'Withdrawn');
  const free = s.capacity - seatsTaken(s);
  const pending = needs.filter((n) => n.courseId === s.courseId && (n.status === 'Approved' || n.status === 'Proposed') && !n.sessionId && !roster.some((e) => e.staffId === n.staffId));
  const attended = roster.filter((e) => e.status === 'Attended');
  const scored = attended.filter((e) => e.score !== undefined);
  const gains = scored.filter((e) => e.preScore !== undefined);
  const reactions = attended.filter((e) => e.reaction);
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const evalL1 = avg(reactions.map((e) => e.reaction!));
  const evalL2 = avg(scored.map((e) => e.score!));
  const gain = avg(gains.map((e) => e.score! - e.preScore!));
  const passRate = attended.length ? Math.round((attended.filter((e) => passed(c, e.score)).length / attended.length) * 100) : null;
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Math.min(100, Number(v))));

  const printFor = byId.get(printing ?? '');

  return (
    <Modal
      title={c?.title ?? s.courseId}
      subtitle={`${s.id} · ${s.start === s.end ? fmtDate(s.start, true) : `${fmtDate(s.start, true)} – ${fmtDate(s.end, true)}`} · ${s.venue}${s.trainer && s.trainer !== s.venue ? ` · ${s.trainer}` : ''}`}
      onClose={onClose}
      width={980}
      footer={
        open ? (
          <>
            <button className="btn btn-secondary tm-danger" onClick={() => {
                cancelTrainingSession(s.id);
                onClose();
              }}>
              Cancel session
            </button>
            <button className="btn btn-primary" disabled={!started || !attended.length} title={!started ? 'Close the session once it has started' : undefined} onClick={() => setClosing(true)}>
              Close session & issue certificates
            </button>
          </>
        ) : undefined
      }
    >
      <div className="pr-kv">
        <div>
          <span>Status</span>
          <strong>{st}</strong>
        </div>
        <div>
          <span>Seats</span>
          <strong>
            {seatsTaken(s)}/{s.capacity}
          </strong>
          <small>{roster.filter((e) => e.status === 'Waitlisted').length} on waitlist</small>
        </div>
        <div>
          <span>Cost</span>
          <strong>{kes(sessionCost(s))}</strong>
          <small>{s.actualCost !== undefined ? `Invoiced${s.invoiceNo ? ` · ${s.invoiceNo}` : ''}` : `${kes(c?.costPerHead ?? 0)} per head (catalogue)`}</small>
        </div>
        <div>
          <span>Reaction (L1)</span>
          <strong>{evalL1 ?? '—'}</strong>
          <small>out of 5</small>
        </div>
        <div>
          <span>Test (L2)</span>
          <strong>{evalL2 !== null ? `${evalL2}%` : '—'}</strong>
          <small>
            {gain !== null ? `+${gain} points on pre-test` : c?.passMark ? `Pass mark ${c.passMark}%` : 'Attendance only'}
            {passRate !== null ? ` · ${passRate}% passed` : ''}
          </small>
        </div>
      </div>

      {cert && <p className="pr-note">Passing awards the {cert.name} ({cert.authority}), valid {cert.validityMonths} months from {fmtDate(s.end)}.</p>}
      {open && !started && <p className="pr-note">Attendance and scores can be entered from {fmtDate(s.start)}.</p>}

      <div className="pr-table-scroll">
        <table className="hr-table pr-table tr-roster">
          <thead>
            <tr>
              <th>Participant</th>
              <th>Attendance</th>
              <th className="num">Pre-test</th>
              <th className="num">Post-test</th>
              <th>Reaction</th>
              <th>Result</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {roster.length === 0 && <Empty cols={7}>Nobody booked yet.</Empty>}
            {roster.map((en) => {
              const e = byId.get(en.staffId);
              const clash = leaveClashes(leaveRequests, en.staffId, s.start, s.end);
              const editable = open && started && en.status !== 'Waitlisted';
              const ok = passed(c, en.score);
              return (
                <tr key={en.staffId} data-staff={en.staffId}>
                  <td>
                    <div className="tm-emp">
                      <strong>{e?.fullName ?? en.staffId}</strong>
                      <span>
                        {en.staffId} · {e?.jobTitle}
                      </span>
                      {open &&
                        clash.map((l) => (
                          <span key={l.id} className="tr-clash">
                            <AlertTriangle size={11} /> {l.status === 'APPROVED' ? 'Approved' : 'Requested'} {l.leaveType.toLowerCase()} {fmtDate(l.startDate)} – {fmtDate(l.endDate)}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td>
                    {editable ? (
                      <select className="form-control tr-mini" aria-label="Attendance" value={en.status} onChange={(ev) => updateEnrolment(s.id, en.staffId, { status: ev.target.value as typeof en.status })}>
                        <option value="Enrolled">Not marked</option>
                        <option value="Attended">Attended</option>
                        <option value="No show">No show</option>
                      </select>
                    ) : (
                      <Pill cls={en.status === 'Attended' ? 'success' : en.status === 'No show' ? 'critical' : en.status === 'Waitlisted' ? 'warning' : 'info'}>{en.status}</Pill>
                    )}
                  </td>
                  <td className="num">
                    {editable && en.status === 'Attended' ? (
                      <input type="number" min={0} max={100} className="form-control tr-score" aria-label="Pre-test" value={en.preScore ?? ''} onChange={(ev) => updateEnrolment(s.id, en.staffId, { preScore: num(ev.target.value) })} />
                    ) : (
                      en.preScore ?? '—'
                    )}
                  </td>
                  <td className="num">
                    {editable && en.status === 'Attended' && c?.passMark ? (
                      <input type="number" min={0} max={100} className="form-control tr-score" aria-label="Post-test" value={en.score ?? ''} onChange={(ev) => updateEnrolment(s.id, en.staffId, { score: num(ev.target.value) })} />
                    ) : (
                      en.score ?? '—'
                    )}
                  </td>
                  <td>
                    {editable && en.status === 'Attended' ? (
                      <select className="form-control tr-mini" aria-label="Reaction" value={en.reaction ?? ''} onChange={(ev) => updateEnrolment(s.id, en.staffId, { reaction: ev.target.value ? Number(ev.target.value) : undefined })}>
                        <option value="">—</option>
                        {[5, 4, 3, 2, 1].map((r) => (
                          <option key={r} value={r}>
                            {r} / 5
                          </option>
                        ))}
                      </select>
                    ) : en.reaction ? (
                      `${en.reaction} / 5`
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {en.status === 'Attended' ? (
                      c?.passMark && en.score === undefined ? <span className="muted">Awaiting score</span> : <Pill cls={ok ? 'success' : 'critical'}>{ok ? (c?.passMark ? 'Pass' : 'Completed') : 'Fail'}</Pill>
                    ) : (
                      <span className="muted">—</span>
                    )}
                    {en.certRecordId && <div className="muted">Certificate issued</div>}
                  </td>
                  <td>
                    <div className="tm-actions">
                      {open && en.status === 'Waitlisted' && free > 0 && (
                        <button className="btn btn-secondary btn-sm" onClick={() => updateEnrolment(s.id, en.staffId, { status: 'Enrolled' })}>
                          Give seat
                        </button>
                      )}
                      {open && (en.status === 'Enrolled' || en.status === 'Waitlisted') && (
                        <button className="btn btn-secondary btn-sm" onClick={() => withdrawEnrolment(s.id, en.staffId)}>
                          Withdraw
                        </button>
                      )}
                      {s.status === 'Completed' && en.status === 'Attended' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setPrinting(en.staffId)}>
                          <Printer size={13} /> Certificate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="tr-enrol-more">
          <div className="pr-toolbar">
            <select className="form-control grow" value={addId} onChange={(ev) => setAddId(ev.target.value)} aria-label="Add participant">
              <option value="">Add a participant…</option>
              {staff
                .filter((e) => e.status !== 'TERMINATED' && !roster.some((r) => r.staffId === e.staffId))
                .map((e) => (
                  <option key={e.staffId} value={e.staffId}>
                    {e.fullName} · {e.jobTitle}
                  </option>
                ))}
            </select>
            <button
              className="btn btn-secondary"
              disabled={!addId}
              onClick={() => {
                enrolInSession(s.id, [{ staffId: addId }]);
                setAddId('');
              }}
            >
              <UserPlus size={14} /> {free > 0 ? 'Enrol' : 'Add to waitlist'}
            </button>
            {pending.length > 0 && (
              <button className="btn btn-primary" onClick={() => enrolInSession(s.id, pending.map((n) => ({ staffId: n.staffId, needId: n.id })))}>
                Enrol {pending.length} from needs
              </button>
            )}
          </div>
          {addId && leaveClashes(leaveRequests, addId, s.start, s.end).length > 0 && <p className="pr-note warn">This person has leave overlapping the training dates.</p>}
        </div>
      )}

      {closing && (
        <div className="pr-card tr-close">
          <h3 className="tm-h3">Close session</h3>
          <p className="pr-muted">
            Anyone not marked attended is recorded as a no-show and their need goes back to the plan. {attended.filter((e) => passed(c, e.score)).length} of {attended.length} attended
            {c?.certId ? ' will receive a certificate.' : ' passed.'}
          </p>
          {attended.some((e) => c?.passMark && e.score === undefined) && <p className="pr-note warn">Some attendees have no post-test score — they will be treated as not passed.</p>}
          <div className="pr-form-grid">
            <label className="req-field">
              <span>Actual cost (KES)</span>
              <input type="number" min={0} className="form-control" value={cost} onChange={(ev) => setCost(ev.target.value)} />
            </label>
            <label className="req-field">
              <span>Provider invoice number</span>
              <input className="form-control" value={invoice} onChange={(ev) => setInvoice(ev.target.value)} placeholder={c?.providerType === 'Internal' ? 'Not needed for internal courses' : 'e.g. KRC-2291'} />
            </label>
          </div>
          <div className="tm-actions" style={{ marginTop: 10 }}>
            <button className="btn btn-secondary" onClick={() => setClosing(false)}>
              Back
            </button>
            <button
              className="btn btn-primary"
              disabled={!(Number(cost) >= 0) || cost === ''}
              onClick={() => {
                closeTrainingSession(s.id, Number(cost), invoice.trim());
                setClosing(false);
              }}
            >
              Confirm and close
            </button>
          </div>
        </div>
      )}

      {printFor && (
        <div className="tr-cert-wrap">
          <div className="tr-cert ess-print-area">
            <div className="tr-cert-org">{activeTenant.name}</div>
            <h2>Certificate of attendance</h2>
            <p>This is to certify that</p>
            <div className="tr-cert-name">{printFor.fullName}</div>
            <p>
              {printFor.jobTitle} · {printFor.staffId}
            </p>
            <p>attended</p>
            <div className="tr-cert-course">{c?.title}</div>
            <p>
              {c?.provider} · {s.start === s.end ? fmtDate(s.start) : `${fmtDate(s.start)} to ${fmtDate(s.end)}`} · {c?.hours} hours
            </p>
            {(() => {
              const en = s.enrolments.find((x) => x.staffId === printFor.staffId);
              return en?.score !== undefined ? <p>Assessment score: {en.score}%</p> : null;
            })()}
            {cert && s.enrolments.find((x) => x.staffId === printFor.staffId)?.certRecordId && (
              <p>
                {cert.name} valid until {fmtDate(addMonthsIso(s.end, cert.validityMonths))}
              </p>
            )}
            <div className="tr-cert-sign">
              <span>Ruth Chebet, QHSE Manager</span>
              <span>Ref {s.id}/{printFor.staffId}</span>
            </div>
          </div>
          <div className="tm-actions">
            <button className="btn btn-secondary" onClick={() => setPrinting(null)}>
              Close
            </button>
            <button className="btn btn-primary" onClick={printArea}>
              <Printer size={14} /> Print
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
