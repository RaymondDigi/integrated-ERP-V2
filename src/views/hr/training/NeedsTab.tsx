import React, { useMemo, useState } from 'react';
import { CalendarPlus, Check, Plus, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { Modal } from '../payroll/shared';
import { COURSES, courseById, type NeedSource, type Priority, type TrainingNeed } from '../../../data/trainingConfig';
import { kes, leaveClashes, seatsTaken } from '../../../data/trainingEngine';
import { fmtDate } from '../../../data/timeEngine';
import { Chips, EmpCell, Empty, Pill, PRIORITY_CLS, useTrainingOrg } from './shared';

type Show = 'OPEN' | 'Proposed' | 'Approved' | 'Planned' | 'Completed' | 'Rejected';
const STATUS_CLS: Record<TrainingNeed['status'], string> = { Proposed: 'warning', Approved: 'info', Planned: 'primary', Completed: 'success', Rejected: 'critical' };
const RANK = { High: 0, Medium: 1, Low: 2 };
const SOURCES: NeedSource[] = ['Certification gap', 'Appraisal', 'Manager', 'Compliance', 'Employee'];

export const NeedsTab: React.FC = () => {
  const { decideTrainingNeeds, enrolInSession, addTrainingNeed, leaveRequests, setModuleTab } = useApp();
  const { needs, byId, sessions, staff, today } = useTrainingOrg();
  const [show, setShow] = useState<Show>('OPEN');
  const [source, setSource] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ staffId: '', skill: '', reason: '', source: 'Manager' as Exclude<NeedSource, 'Certification gap'>, ref: '', priority: 'Medium' as Priority });

  const rows = useMemo(
    () =>
      needs
        .filter((n) => (show === 'OPEN' ? ['Proposed', 'Approved', 'Planned'].includes(n.status) : n.status === show))
        .filter((n) => !source || n.source === source)
        .sort((a, b) => RANK[a.priority] - RANK[b.priority] || b.raisedOn.localeCompare(a.raisedOn)),
    [needs, show, source]
  );
  const pg = usePaged(rows, 25, `${show}|${source}`);
  const count = (s: TrainingNeed['status']) => needs.filter((n) => n.status === s).length;
  const selected = needs.filter((n) => picked.includes(n.id));
  const canEnrol = selected.filter((n) => (n.status === 'Approved' || n.status === 'Proposed') && !n.sessionId && n.courseId);
  const groups = useMemo(() => {
    const m = new Map<string, TrainingNeed[]>();
    for (const n of canEnrol) m.set(n.courseId!, [...(m.get(n.courseId!) ?? []), n]);
    return [...m.entries()];
  }, [canEnrol]);
  const sessionsFor = (courseId: string) => sessions.filter((s) => s.courseId === courseId && s.status === 'Scheduled' && s.start >= today);

  const openEnrol = () => {
    const c: Record<string, string> = {};
    for (const [courseId] of groups) c[courseId] = sessionsFor(courseId)[0]?.id ?? '';
    setChoice(c);
    setEnrolling(true);
  };

  const decide = (status: 'Approved' | 'Rejected') => {
    decideTrainingNeeds(selected.filter((n) => n.status === 'Proposed').map((n) => n.id), status);
    setPicked([]);
  };

  const confirmEnrol = () => {
    const approve = canEnrol.filter((n) => n.status === 'Proposed').map((n) => n.id);
    if (approve.length) decideTrainingNeeds(approve, 'Approved');
    for (const [courseId, list] of groups) if (choice[courseId]) enrolInSession(choice[courseId], list.map((n) => ({ staffId: n.staffId, needId: n.id })));
    setEnrolling(false);
    setPicked([]);
  };

  return (
    <>
      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Training needs analysis</h3>
            <p>Needs come from certification gaps, appraisals, managers, compliance and employee requests. Approve them into the plan, then enrol people on a session.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus size={14} /> New need
          </button>
        </div>
        <div className="pr-toolbar tr-toolbar">
          <Chips
            label="Need status"
            value={show}
            onChange={(v) => {
              setShow(v);
              setPicked([]);
            }}
            options={[
              { id: 'OPEN', label: 'Open', n: count('Proposed') + count('Approved') + count('Planned') },
              { id: 'Proposed', label: 'To approve', n: count('Proposed') },
              { id: 'Approved', label: 'Approved', n: count('Approved') },
              { id: 'Planned', label: 'Planned', n: count('Planned') },
              { id: 'Completed', label: 'Completed', n: count('Completed') },
              { id: 'Rejected', label: 'Rejected', n: count('Rejected') }
            ]}
          />
          <select className="form-control" value={source} onChange={(ev) => setSource(ev.target.value)} aria-label="Source">
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {picked.length > 0 && (
          <div className="pr-note tr-bulk">
            {picked.length} selected
            {selected.some((n) => n.status === 'Proposed') && (
              <>
                <button className="btn btn-primary btn-sm" onClick={() => decide('Approved')}>
                  <Check size={13} /> Approve
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => decide('Rejected')}>
                  <X size={13} /> Reject
                </button>
              </>
            )}
            <button className="btn btn-primary btn-sm" disabled={!canEnrol.length} onClick={openEnrol}>
              <CalendarPlus size={13} /> Enrol in session ({canEnrol.length})
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setPicked([])}>
              Clear
            </button>
          </div>
        )}
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={pg.rows.length > 0 && pg.rows.every((n) => picked.includes(n.id))}
                    onChange={(ev) => setPicked((p) => (ev.target.checked ? [...new Set([...p, ...pg.rows.filter((n) => n.status !== 'Completed' && n.status !== 'Rejected').map((n) => n.id)])] : p.filter((id) => !pg.rows.some((n) => n.id === id))))}
                  />
                </th>
                <th>Employee</th>
                <th>Need</th>
                <th>Source</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Course</th>
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && <Empty cols={7}>No training needs here.</Empty>}
              {pg.rows.map((n) => {
                const c = courseById(n.courseId);
                const s = sessions.find((x) => x.id === n.sessionId);
                return (
                  <tr key={n.id} data-need={n.id}>
                    <td>
                      {n.status !== 'Completed' && n.status !== 'Rejected' && (
                        <input type="checkbox" aria-label={`Select ${n.id}`} checked={picked.includes(n.id)} onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, n.id] : p.filter((x) => x !== n.id)))} />
                      )}
                    </td>
                    <td>
                      <EmpCell e={byId.get(n.staffId)} id={n.staffId} sub={byId.get(n.staffId)?.department} />
                    </td>
                    <td>
                      <strong>{n.skill}</strong>
                      <div className="muted tm-clamp">{n.reason}</div>
                    </td>
                    <td>
                      {n.source}
                      <div className="muted">
                        {n.id} · {fmtDate(n.raisedOn)}
                        {n.ref ? ` · ${n.ref}` : ''}
                      </div>
                    </td>
                    <td>
                      <Pill cls={PRIORITY_CLS[n.priority]}>{n.priority}</Pill>
                    </td>
                    <td>
                      <Pill cls={STATUS_CLS[n.status]}>{n.status}</Pill>
                      {s && <div className="muted">{s.id} · {fmtDate(s.start)}</div>}
                    </td>
                    <td>
                      {c ? (
                        <>
                          {c.title}
                          <div className="muted">{kes(c.costPerHead)} per head</div>
                        </>
                      ) : (
                        <span className="muted">Not in catalogue</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="needs" />
      </div>

      {enrolling && (
        <Modal
          title="Enrol in session"
          subtitle={`${canEnrol.length} people from approved needs`}
          onClose={() => setEnrolling(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setEnrolling(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={!groups.some(([cid]) => choice[cid])} onClick={confirmEnrol}>
                Enrol
              </button>
            </>
          }
        >
          {groups.map(([courseId, list]) => {
            const opts = sessionsFor(courseId);
            const s = sessions.find((x) => x.id === choice[courseId]);
            const free = s ? s.capacity - seatsTaken(s) : 0;
            return (
              <div key={courseId} className="tr-enrol-group">
                <strong>{courseById(courseId)?.title}</strong>
                {opts.length ? (
                  <select className="form-control" value={choice[courseId] ?? ''} onChange={(ev) => setChoice((c) => ({ ...c, [courseId]: ev.target.value }))} aria-label="Session">
                    <option value="">Do not enrol now</option>
                    {opts.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.id} · {fmtDate(o.start)} · {o.venue} · {Math.max(0, o.capacity - seatsTaken(o))} seats left
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="pr-note warn">
                    No upcoming session for this course.{' '}
                    <button className="tm-link" onClick={() => {
                        setEnrolling(false);
                        setModuleTab('training', 'sessions');
                      }}>
                      Schedule one under Sessions
                    </button>
                  </p>
                )}
                <ul className="tm-rules">
                  {list.map((n, i) => {
                    const clash = s ? leaveClashes(leaveRequests, n.staffId, s.start, s.end) : [];
                    return (
                      <li key={n.id}>
                        {byId.get(n.staffId)?.fullName} {s && i >= free && <Pill cls="warning">Waitlist</Pill>}
                        {clash.map((l) => (
                          <span key={l.id} className="tr-clash">
                            {' '}
                            {l.status === 'APPROVED' ? 'On approved' : 'Has requested'} {l.leaveType.toLowerCase()} {fmtDate(l.startDate)} – {fmtDate(l.endDate)}
                          </span>
                        ))}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {canEnrol.some((n) => n.status === 'Proposed') && <p className="pr-note">Needs still waiting for approval are approved when you enrol them.</p>}
        </Modal>
      )}

      {adding && (
        <Modal
          title="New training need"
          onClose={() => setAdding(false)}
          width={600}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setAdding(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!draft.staffId || !draft.skill.trim() || !draft.reason.trim()}
                onClick={() => {
                  addTrainingNeed({ ...draft, ref: draft.ref.trim() || undefined });
                  setAdding(false);
                  setDraft({ ...draft, staffId: '', skill: '', reason: '', ref: '' });
                }}
              >
                Raise need
              </button>
            </>
          }
        >
          <div className="pr-form-grid">
            <label className="req-field wide">
              <span>Employee</span>
              <select className="form-control" value={draft.staffId} onChange={(ev) => setDraft({ ...draft, staffId: ev.target.value })}>
                <option value="">Choose…</option>
                {staff
                  .filter((e) => e.status !== 'TERMINATED')
                  .map((e) => (
                    <option key={e.staffId} value={e.staffId}>
                      {e.fullName} · {e.jobTitle}
                    </option>
                  ))}
              </select>
            </label>
            <label className="req-field wide">
              <span>Skill or course</span>
              <input className="form-control" list="tr-course-list" value={draft.skill} onChange={(ev) => setDraft({ ...draft, skill: ev.target.value })} placeholder="Pick from the catalogue or describe the skill" />
              <datalist id="tr-course-list">
                {COURSES.map((c) => (
                  <option key={c.id} value={c.title} />
                ))}
              </datalist>
            </label>
            <label className="req-field wide">
              <span>Reason</span>
              <textarea className="form-control" value={draft.reason} onChange={(ev) => setDraft({ ...draft, reason: ev.target.value })} />
            </label>
            <label className="req-field">
              <span>Source</span>
              <select className="form-control" value={draft.source} onChange={(ev) => setDraft({ ...draft, source: ev.target.value as typeof draft.source })}>
                {(['Manager', 'Compliance', 'Employee', 'Appraisal'] as const).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="req-field">
              <span>Priority</span>
              <select className="form-control" value={draft.priority} onChange={(ev) => setDraft({ ...draft, priority: ev.target.value as Priority })}>
                {(['High', 'Medium', 'Low'] as const).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="req-field wide">
              <span>Reference (optional)</span>
              <input className="form-control" value={draft.ref} onChange={(ev) => setDraft({ ...draft, ref: ev.target.value })} placeholder="Requested by, appraisal or audit finding" />
            </label>
          </div>
        </Modal>
      )}
    </>
  );
};
