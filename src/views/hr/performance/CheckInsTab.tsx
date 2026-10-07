import React, { useMemo, useState } from 'react';
import { MessageSquarePlus, Pencil } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { fmtDate } from '../../../data/hireEngine';
import { COMPETENCIES, type CheckIn, type FeedbackEntry } from '../../../data/perfConfig';
import { average, checkInOverdue } from '../../../data/perfEngine';
import { Card, EmpCell, Empty, Field, Modal, PersonSelect, Pill, Stars, useActors, usePerfData } from './shared';

const CI_TONE: Record<NonNullable<CheckIn['status']>, 'success' | 'warning' | 'danger'> = { ON_TRACK: 'success', AT_RISK: 'warning', OFF_TRACK: 'danger' };
const CI_LABEL: Record<NonNullable<CheckIn['status']>, string> = { ON_TRACK: 'On track', AT_RISK: 'At risk', OFF_TRACK: 'Off track' };
const KIND_LABEL: Record<FeedbackEntry['kind'], string> = { RECOGNITION: 'Recognition', FEEDBACK: 'Feedback', '360': '360° input' };

export const CheckInsTab: React.FC = () => {
  const { checkIns, perfFeedback, perfToday, selectedOrgId } = useApp();
  const { cycle, aps, person } = usePerfData();
  const [q, setQ] = useState<1 | 2 | 3>(3);
  const [show, setShow] = useState<'ALL' | 'OPEN' | 'HELD'>('ALL');
  const [rec, setRec] = useState<CheckIn | null>(null);
  const [fbKind, setFbKind] = useState<'ALL' | FeedbackEntry['kind']>('ALL');
  const [adding, setAdding] = useState(false);

  const list = useMemo(
    () =>
      checkIns
        .filter((c) => c.cycleId === cycle!.id && c.quarter === q && (show === 'ALL' || (show === 'HELD' ? !!c.heldOn : !c.heldOn)))
        .sort((a, b) => Number(!!a.heldOn) - Number(!!b.heldOn) || (person(a.staffId)?.fullName ?? '').localeCompare(person(b.staffId)?.fullName ?? '')),
    [checkIns, cycle, q, show, person]
  );
  const paged = usePaged(list, 10, `${q}${show}`);
  const qAll = checkIns.filter((c) => c.cycleId === cycle!.id && c.quarter === q);
  const held = qAll.filter((c) => c.heldOn).length;
  const late = qAll.filter((c) => checkInOverdue(c, perfToday)).length;

  const feed = useMemo(() => perfFeedback.filter((f) => f.orgId === selectedOrgId && (fbKind === 'ALL' || f.kind === fbKind)).sort((a, b) => b.on.localeCompare(a.on)), [perfFeedback, selectedOrgId, fbKind]);
  const fbPaged = usePaged(feed, 10, fbKind);
  const threeSixty = useMemo(() => {
    const m = new Map<string, number[]>();
    perfFeedback.filter((f) => f.orgId === selectedOrgId && f.kind === '360' && f.rating).forEach((f) => m.set(f.staffId, [...(m.get(f.staffId) ?? []), f.rating!]));
    return [...m.entries()].map(([id, rs]) => ({ id, n: rs.length, avg: average(rs) }));
  }, [perfFeedback, selectedOrgId]);

  return (
    <div className="pf-stack">
      <div className="hr-table-card">
        <div className="pf-table-head">
          <div>
            <h3>Quarterly check-ins</h3>
            <span className="pf-muted">
              Q{q}: {held} of {qAll.length} held · due {fmtDate(qAll[0]?.due)}
              {late ? ` · ${late} overdue` : ''}
            </span>
          </div>
          <div className="pf-chips" role="group" aria-label="Quarter">
            {([1, 2, 3] as const).map((n) => (
              <button key={n} className={q === n ? 'active' : ''} aria-pressed={q === n} onClick={() => setQ(n)}>
                {n === 2 ? 'Q2 · mid-year' : `Q${n}`}
              </button>
            ))}
            {(['ALL', 'OPEN', 'HELD'] as const).map((s) => (
              <button key={s} className={show === s ? 'active' : ''} aria-pressed={show === s} onClick={() => setShow(s)}>
                {s === 'ALL' ? 'All' : s === 'OPEN' ? 'Not held' : 'Held'}
              </button>
            ))}
          </div>
        </div>
        <div className="pf-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Supervisor</th>
                <th>Held</th>
                <th>Status</th>
                <th>Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!paged.rows.length && <Empty cols={6}>No check-ins here.</Empty>}
              {paged.rows.map((c) => {
                const ap = aps.find((a) => a.staffId === c.staffId);
                return (
                  <tr key={c.id}>
                    <td>
                      <EmpCell e={person(c.staffId)} id={c.staffId} />
                    </td>
                    <td>{person(ap?.appraiserId)?.fullName ?? '—'}</td>
                    <td>{c.heldOn ? fmtDate(c.heldOn) : checkInOverdue(c, perfToday) ? <Pill tone="danger">Overdue</Pill> : <span className="pf-muted">Due {fmtDate(c.due)}</span>}</td>
                    <td>{c.status ? <Pill tone={CI_TONE[c.status]}>{CI_LABEL[c.status]}</Pill> : '—'}</td>
                    <td className="pf-notes">
                      {c.notes ?? ''}
                      {c.actions && <div className="pf-muted">Action: {c.actions}</div>}
                    </td>
                    <td>
                      {!c.heldOn && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setRec(c)}>
                          <Pencil size={13} /> Record
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={paged} noun="check-ins" />
      </div>

      <div className="pf-two wide-left">
        <div className="hr-table-card">
          <div className="pf-table-head">
            <h3>Feedback and recognition</h3>
            <div className="pf-chips" role="group" aria-label="Kind">
              {(['ALL', 'RECOGNITION', 'FEEDBACK', '360'] as const).map((k) => (
                <button key={k} className={fbKind === k ? 'active' : ''} aria-pressed={fbKind === k} onClick={() => setFbKind(k)}>
                  {k === 'ALL' ? 'All' : KIND_LABEL[k]}
                </button>
              ))}
              <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
                <MessageSquarePlus size={14} /> Give feedback
              </button>
            </div>
          </div>
          <ul className="pf-feed">
            {!fbPaged.rows.length && <li className="pf-muted">No entries yet.</li>}
            {fbPaged.rows.map((f) => (
              <li key={f.id} className={f.kind.toLowerCase()}>
                <div className="pf-feed-head">
                  <strong>{person(f.staffId)?.fullName ?? f.staffId}</strong>
                  <Pill tone={f.kind === 'RECOGNITION' ? 'success' : f.kind === '360' ? 'info' : 'primary'}>{KIND_LABEL[f.kind]}</Pill>
                  {f.rating && <Stars value={f.rating} label="360° rating" />}
                </div>
                <p>{f.text}</p>
                <span className="pf-muted">
                  From {person(f.fromStaffId)?.fullName ?? f.fromStaffId}
                  {f.relationship ? ` (${f.relationship.toLowerCase()})` : ''} · {fmtDate(f.on)}
                  {f.competency ? ` · ${COMPETENCIES.find((c) => c.id === f.competency)?.label}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <Pager p={fbPaged} noun="entries" />
        </div>
        <Card title="360° input" sub="Optional input from peers and direct reports, shown to the supervisor at review.">
          <ul className="pf-list">
            {!threeSixty.length && <li className="pf-muted">None yet.</li>}
            {threeSixty.map((t) => (
              <li key={t.id}>
                <span>{person(t.id)?.fullName}</span>
                <span>
                  <Stars value={Math.round(t.avg ?? 0)} label="Average 360° rating" /> {t.avg?.toFixed(1)} · {t.n}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {rec && <RecordCheckIn c={rec} onClose={() => setRec(null)} />}
      {adding && <FeedbackModal onClose={() => setAdding(false)} />}
    </div>
  );
};

const RecordCheckIn: React.FC<{ c: CheckIn; onClose: () => void }> = ({ c, onClose }) => {
  const { recordCheckIn } = useApp();
  const { aps, person, goalsBy } = usePerfData();
  const actors = useActors();
  const ap = aps.find((a) => a.staffId === c.staffId);
  const [actor, setActor] = useState(ap?.appraiserId ?? '');
  const [status, setStatus] = useState<NonNullable<CheckIn['status']>>('ON_TRACK');
  const [notes, setNotes] = useState('');
  const [actions, setActions] = useState('');
  return (
    <Modal
      title={`Q${c.quarter} check-in`}
      subtitle={`${person(c.staffId)?.fullName} · due ${fmtDate(c.due)}`}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => recordCheckIn(c.id, { status, notes, actions: actions.trim() || undefined }, actor) && onClose()}>
            Save check-in
          </button>
        </>
      }
    >
      <ul className="pf-list compact">
        {(goalsBy.get(c.staffId) ?? []).map((g) => (
          <li key={g.id}>
            <span>{g.title}</span>
            <span className="pf-muted">
              {g.actual || '—'} / {g.target} {g.unit} · {g.progress}%
            </span>
          </li>
        ))}
      </ul>
      <div className="pr-form-grid">
        <Field label="Acting as" hint="The supervisor holds the check-in.">
          <PersonSelect value={actor} onChange={setActor} people={actors} />
        </Field>
        <Field label="Overall">
          <select className="form-control" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {Object.entries(CI_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What was discussed" wide>
          <textarea className="form-control" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Agreed actions" wide>
          <textarea className="form-control" rows={2} value={actions} onChange={(e) => setActions(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

const FeedbackModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addFeedback } = useApp();
  const { aps, person } = usePerfData();
  const actors = useActors();
  const people = aps.map((a) => person(a.staffId)!).filter(Boolean);
  const [f, setF] = useState<Omit<FeedbackEntry, 'id' | 'orgId' | 'on'>>({ staffId: '', fromStaffId: '', kind: 'RECOGNITION', text: '', competency: 'QUALITY' });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  return (
    <Modal
      title="Give feedback"
      subtitle="Recognition and feedback are shared with the employee; 360° input goes to the supervisor."
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => addFeedback(f) && onClose()}>
            Save
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="For">
          <PersonSelect value={f.staffId} onChange={(v) => set({ staffId: v })} people={people} />
        </Field>
        <Field label="From">
          <PersonSelect value={f.fromStaffId} onChange={(v) => set({ fromStaffId: v })} people={actors} />
        </Field>
        <Field label="Kind">
          <select className="form-control" value={f.kind} onChange={(e) => set({ kind: e.target.value as FeedbackEntry['kind'] })}>
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Value shown">
          <select className="form-control" value={f.competency ?? ''} onChange={(e) => set({ competency: e.target.value || undefined })}>
            {COMPETENCIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        {f.kind === '360' && (
          <>
            <Field label="Relationship">
              <select className="form-control" value={f.relationship ?? 'Peer'} onChange={(e) => set({ relationship: e.target.value as FeedbackEntry['relationship'] })}>
                {['Peer', 'Direct report', 'Manager', 'Customer'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Rating">
              <Stars value={f.rating} onChange={(v) => set({ rating: v, relationship: f.relationship ?? 'Peer' })} label="360° rating" />
            </Field>
          </>
        )}
        <Field label="What happened and its effect" wide>
          <textarea className="form-control" rows={3} value={f.text} onChange={(e) => set({ text: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};
