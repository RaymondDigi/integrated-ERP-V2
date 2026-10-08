import React, { useMemo, useState } from 'react';
import { BookOpen, Plus, Radar, Users } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { OB_CATEGORIES, SHIFTS, minutesBetween, plusDays, type ObCategory, type PatrolPoint, type PatrolRound, type Shift } from '../../../data/securitySeed';
import { Card, Empty, Field, Modal, Pill, fmt, fmtStamp, useNow, useSecOrg } from './shared';

type View = 'roster' | 'patrols' | 'ob';
/** Minutes of grace after a tag point is due before it counts as missed */
const GRACE = 15;

export const pointState = (p: PatrolPoint, now: string): 'Scanned' | 'Late' | 'Missed' | 'Due' => {
  if (p.scannedAt) return minutesBetween(p.due, p.scannedAt) > GRACE / 3 ? 'Late' : 'Scanned';
  return minutesBetween(p.due, now) > GRACE ? 'Missed' : 'Due';
};
export const missedPoints = (r: PatrolRound, now: string) => r.points.filter((p) => pointState(p, now) === 'Missed');

/** Guard roster by site and shift, NFC/QR patrol rounds and the daily occurrence book. */
export const OpsLogCard: React.FC = () => {
  const { guardShifts, patrolRounds, occurrences } = useApp();
  const { orgId, today, contractor } = useSecOrg();
  const now = useNow();
  const [view, setView] = useState<View>('roster');
  const [date, setDate] = useState(today);
  const [addingShift, setAddingShift] = useState(false);
  const [addingOb, setAddingOb] = useState(false);
  const [obCat, setObCat] = useState<ObCategory | 'All'>('All');

  const roster = useMemo(
    () => guardShifts.filter((g) => g.orgId === orgId && g.date === date).sort((a, b) => SHIFTS.indexOf(a.shift) - SHIFTS.indexOf(b.shift) || a.post.localeCompare(b.post)),
    [guardShifts, orgId, date]
  );
  // Latest night's rounds, in the order they were due
  const rounds = useMemo(() => patrolRounds.filter((r) => r.orgId === orgId).sort((a, b) => a.points[0].due.localeCompare(b.points[0].due)), [patrolRounds, orgId]);
  const obRows = useMemo(() => occurrences.filter((o) => o.orgId === orgId && (obCat === 'All' || o.category === obCat)).sort((a, b) => b.at.localeCompare(a.at)), [occurrences, orgId, obCat]);
  const pg = usePaged(obRows, 10, `${obCat}|${orgId}`);
  const dates = [plusDays(today, -1), today, plusDays(today, 1)];

  return (
    <Card
      title="Security operations log"
      sub={`Guards are provided by ${contractor}. Patrol tags are scanned with the guard phone; a point not scanned within ${GRACE} minutes of its due time is missed.`}
      actions={
        <>
          {view === 'roster' && (
            <button className="btn btn-primary btn-sm" onClick={() => setAddingShift(true)}>
              <Plus size={14} /> Add to roster
            </button>
          )}
          {view === 'ob' && (
            <button className="btn btn-primary btn-sm" onClick={() => setAddingOb(true)}>
              <Plus size={14} /> New entry
            </button>
          )}
        </>
      }
    >
      <div className="digicraft-toolbar" style={{ marginBottom: 12 }}>
        <div className="digicraft-filter-pills">
          <button className={`digicraft-filter-pill ${view === 'roster' ? 'active' : ''}`} onClick={() => setView('roster')}>
            <Users size={13} /> Guard roster
          </button>
          <button className={`digicraft-filter-pill ${view === 'patrols' ? 'active' : ''}`} onClick={() => setView('patrols')}>
            <Radar size={13} /> Patrol check-ins
          </button>
          <button className={`digicraft-filter-pill ${view === 'ob' ? 'active' : ''}`} onClick={() => setView('ob')}>
            <BookOpen size={13} /> Occurrence book
          </button>
        </div>
        {view === 'roster' ? (
          <div className="digicraft-filter-pills">
            {dates.map((d) => (
              <button key={d} className={`digicraft-filter-pill ${date === d ? 'active' : ''}`} onClick={() => setDate(d)}>
                {d === today ? 'Today' : d < today ? 'Yesterday' : 'Tomorrow'}
              </button>
            ))}
          </div>
        ) : view === 'patrols' ? (
          <span className="hi-sub">Last night's rounds</span>
        ) : (
          <div className="digicraft-filter-pills">
            {(['All', ...OB_CATEGORIES] as const).map((k) => (
              <button key={k} className={`digicraft-filter-pill ${obCat === k ? 'active' : ''}`} onClick={() => setObCat(k)}>
                {k}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === 'roster' && (
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Shift</th>
                <th>Site</th>
                <th>Post</th>
                <th>Guard</th>
                <th>Provided by</th>
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 && <Empty cols={5}>No guards rostered for {fmt(date)}.</Empty>}
              {roster.map((g) => (
                <tr key={g.id}>
                  <td>{g.shift}</td>
                  <td className="hi-sub">{g.site}</td>
                  <td>{g.post}</td>
                  <td>
                    <strong>{g.guardName}</strong>
                    {g.staffId && <div className="hi-sub">Staff {g.staffId}</div>}
                  </td>
                  <td className="hi-sub">{g.contractor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'patrols' && (
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Round</th>
                <th>Guard</th>
                <th>Points</th>
                <th>Tag points</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {rounds.length === 0 && <Empty cols={5}>No patrol rounds recorded.</Empty>}
              {rounds.map((r) => {
                const states = r.points.map((p) => pointState(p, now));
                const missed = states.filter((s) => s === 'Missed').length;
                const done = states.filter((s) => s === 'Scanned' || s === 'Late').length;
                return (
                  <tr key={r.id}>
                    <td>
                      {r.route}
                      <div className="hi-sub">{fmt(r.date)}</div>
                    </td>
                    <td>{r.guardName}</td>
                    <td>
                      {done} / {r.points.length}
                    </td>
                    <td className="hi-wrap" style={{ maxWidth: 460 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.points.map((p, i) => (
                          <span key={p.tag} title={`${p.tag} · due ${fmtStamp(p.due)}${p.scannedAt ? ` · scanned ${fmtStamp(p.scannedAt)}` : ''}`}>
                            <Pill tone={states[i] === 'Missed' ? 'danger' : states[i] === 'Late' ? 'warning' : states[i] === 'Due' ? 'info' : 'success'}>
                              {p.name}
                              {p.scannedAt ? ` ${p.scannedAt.slice(11, 16)}` : ''}
                            </Pill>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Pill tone={missed ? 'danger' : done === r.points.length ? 'success' : 'info'}>{missed ? `${missed} missed` : done === r.points.length ? 'Complete' : 'In progress'}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {view === 'ob' && (
        <>
          <div className="hi-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>By</th>
                  <th>Type</th>
                  <th>Entry</th>
                </tr>
              </thead>
              <tbody>
                {pg.rows.length === 0 && <Empty cols={4}>No entries.</Empty>}
                {pg.rows.map((o) => (
                  <tr key={o.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {fmtStamp(o.at)}
                      <div className="hi-sub hi-mono">{o.id}</div>
                    </td>
                    <td>{o.by}</td>
                    <td>
                      <Pill tone={o.category === 'Incident' || o.category === 'Alarm' ? 'danger' : o.category === 'Handover' ? 'primary' : 'info'}>{o.category}</Pill>
                    </td>
                    <td className="hi-wrap">{o.entry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager p={pg} noun="entries" sizes={[10, 25, 50]} />
        </>
      )}

      {addingShift && <ShiftModal date={date} onClose={() => setAddingShift(false)} />}
      {addingOb && <ObModal onClose={() => setAddingOb(false)} />}
    </Card>
  );
};

const ShiftModal: React.FC<{ date: string; onClose: () => void }> = ({ date: d0, onClose }) => {
  const { addGuardShift } = useApp();
  const { contractor, staff } = useSecOrg();
  const [date, setDate] = useState(d0);
  const [shift, setShift] = useState<Shift>(SHIFTS[0]);
  const [post, setPost] = useState('');
  const [guardName, setGuardName] = useState('');
  const [by, setBy] = useState(contractor);
  const [staffId, setStaffId] = useState('');
  const inHouse = by === 'In-house';
  const ok = post.trim() && (inHouse ? staffId : guardName.trim());
  return (
    <Modal
      title="Add guard to roster"
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              addGuardShift({ date, shift, post: post.trim(), guardName: inHouse ? staff.find((s) => s.staffId === staffId)?.fullName ?? staffId : guardName.trim(), contractor: inHouse ? 'In-house' : by, staffId: inHouse ? staffId : undefined });
              onClose();
            }}
          >
            Add
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Date">
          <input className="form-control" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Shift">
          <select className="form-control" value={shift} onChange={(e) => setShift(e.target.value as Shift)}>
            {SHIFTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Post">
          <input className="form-control" value={post} onChange={(e) => setPost(e.target.value)} placeholder="e.g. Main gate" />
        </Field>
        <Field label="Provided by">
          <select className="form-control" value={by} onChange={(e) => setBy(e.target.value)}>
            <option>{contractor}</option>
            <option>In-house</option>
          </select>
        </Field>
        {inHouse ? (
          <Field label="Staff guard">
            <select className="form-control" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Choose a person</option>
              {staff.map((s) => (
                <option key={s.staffId} value={s.staffId}>
                  {s.fullName} — {s.jobTitle}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Guard name">
            <input className="form-control" value={guardName} onChange={(e) => setGuardName(e.target.value)} />
          </Field>
        )}
      </div>
    </Modal>
  );
};

const ObModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addOccurrence } = useApp();
  const [by, setBy] = useState('');
  const [category, setCategory] = useState<ObCategory>('Routine');
  const [entry, setEntry] = useState('');
  return (
    <Modal
      title="Occurrence book entry"
      subtitle="Time-stamped now. Entries cannot be edited afterwards."
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!by.trim() || !entry.trim()}
            onClick={() => {
              addOccurrence({ by: by.trim(), category, entry: entry.trim() });
              onClose();
            }}
          >
            Save entry
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Recorded by">
          <input className="form-control" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Guard name" />
        </Field>
        <Field label="Type">
          <select className="form-control" value={category} onChange={(e) => setCategory(e.target.value as ObCategory)}>
            {OB_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Entry" wide>
          <textarea className="form-control" rows={4} value={entry} onChange={(e) => setEntry(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};
