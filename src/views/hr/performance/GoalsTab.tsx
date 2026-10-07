import React, { useMemo, useState } from 'react';
import { Check, Pencil, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { fmtDate } from '../../../data/hireEngine';
import { PERSPECTIVES, PERSPECTIVE_LABEL, type PerfGoal, type Perspective } from '../../../data/perfConfig';
import { weightTotal } from '../../../data/perfEngine';
import type { GoalDraft } from '../../../context/perfState';
import { Card, EmpCell, Field, Modal, PersonSelect, Pill, useActors, usePerfData } from './shared';

const STATUS_TONE: Record<PerfGoal['status'], 'success' | 'primary' | 'warning' | 'danger'> = { APPROVED: 'success', SUBMITTED: 'warning', DRAFT: 'primary', RETURNED: 'danger' };
const STATUS_LABEL: Record<PerfGoal['status'], string> = { APPROVED: 'Approved', SUBMITTED: 'Waiting for approval', DRAFT: 'Draft', RETURNED: 'Returned' };

export const GoalsTab: React.FC = () => {
  const { orgGoals, submitGoals, decideGoals, removeGoal } = useApp();
  const { cycle, aps, goalsBy, person } = usePerfData();
  const actors = useActors();
  const [staffId, setStaffId] = useState(() => aps.find((a) => (goalsBy.get(a.staffId) ?? []).some((g) => g.status === 'SUBMITTED'))?.staffId ?? aps[0]?.staffId ?? '');
  const [actor, setActor] = useState(staffId);
  const [edit, setEdit] = useState<GoalDraft | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  const company = orgGoals.filter((g) => g.cycleId === cycle!.id && g.level === 'COMPANY');
  const deptGoals = orgGoals.filter((g) => g.cycleId === cycle!.id && g.level === 'DEPARTMENT');
  const allGoals = useMemo(() => [...goalsBy.values()].flat(), [goalsBy]);
  const linked = (id: string) => allGoals.filter((g) => g.parentId === id);

  const sheet = goalsBy.get(staffId) ?? [];
  const ap = aps.find((a) => a.staffId === staffId);
  const total = weightTotal(sheet);
  const queue = aps.filter((a) => (goalsBy.get(a.staffId) ?? []).some((g) => g.status === 'SUBMITTED' || g.status === 'RETURNED' || g.status === 'DRAFT'));

  const mix = PERSPECTIVES.map((p) => {
    const w = allGoals.filter((g) => g.perspective === p).reduce((n, g) => n + g.weight, 0);
    const all = allGoals.reduce((n, g) => n + g.weight, 0) || 1;
    return { p, pct: Math.round((w / all) * 100) };
  });

  const pick = (id: string) => {
    setStaffId(id);
    setActor(id);
  };

  const blank = (): GoalDraft => ({ cycleId: cycle!.id, staffId, perspective: 'PROCESS', title: '', measure: '', unit: '', target: '', weight: Math.max(0, 100 - total), due: cycle!.periodEnd, actual: '', progress: 0 });

  return (
    <div className="pf-stack">
      <div className="pf-two">
        <Card title="Goal cascade" sub="Company goals break down into department goals; individual goals link to them.">
          <div className="pf-cascade">
            {company.map((c) => (
              <details key={c.id} open={company.indexOf(c) < 2}>
                <summary>
                  <span className={`pf-persp ${c.perspective.toLowerCase()}`}>{PERSPECTIVE_LABEL[c.perspective]}</span>
                  <strong>{c.title}</strong>
                  <span className="pf-muted">
                    {c.measure}: {c.target}
                  </span>
                </summary>
                <ul>
                  {deptGoals
                    .filter((d) => d.parentId === c.id)
                    .map((d) => (
                      <li key={d.id}>
                        <div>
                          <strong>{d.department}</strong> — {d.title}
                        </div>
                        <span className="pf-muted">
                          {linked(d.id).length} individual goals · {new Set(linked(d.id).map((g) => g.staffId)).size} people
                        </span>
                      </li>
                    ))}
                  {linked(c.id).length > 0 && (
                    <li>
                      <span className="pf-muted">{linked(c.id).length} individual goals link straight to this company goal</span>
                    </li>
                  )}
                </ul>
              </details>
            ))}
          </div>
        </Card>
        <Card title="Balanced scorecard mix" sub="Share of goal weight in each perspective across the company.">
          <div className="pf-funnel">
            {mix.map((m) => (
              <div key={m.p} className="pf-funnel-row static">
                <span className="pf-funnel-label">{PERSPECTIVE_LABEL[m.p]}</span>
                <span className="pf-funnel-bar">
                  <span className={`pf-persp-bar ${m.p.toLowerCase()}`} style={{ width: `${m.pct}%` }} />
                </span>
                <strong>{m.pct}%</strong>
              </div>
            ))}
          </div>
          <h4 className="pf-h4">Goal sheets not yet approved</h4>
          <ul className="pf-list">
            {!queue.length && <li className="pf-muted">Every goal sheet is approved.</li>}
            {queue.map((a) => {
              const st = (goalsBy.get(a.staffId) ?? []).find((g) => g.status !== 'APPROVED')!.status;
              return (
                <li key={a.id}>
                  <button className="pf-link" onClick={() => pick(a.staffId)}>
                    {person(a.staffId)?.fullName}
                  </button>
                  <Pill tone={STATUS_TONE[st]}>{STATUS_LABEL[st]}</Pill>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card
        title="Individual goal sheet"
        sub="Each goal needs a measure, target, due date and weight; weights must total 100%. The supervisor approves the sheet."
        actions={
          <select className="form-control" value={staffId} onChange={(e) => pick(e.target.value)} aria-label="Employee">
            {aps.map((a) => (
              <option key={a.staffId} value={a.staffId}>
                {person(a.staffId)?.fullName} — {person(a.staffId)?.jobTitle}
              </option>
            ))}
          </select>
        }
      >
        {ap && (
          <>
            <div className="pf-sheet-head">
              <EmpCell e={person(staffId)} id={staffId} sub={`Supervisor: ${person(ap.appraiserId)?.fullName ?? '—'}${ap.hodId ? ` · second level: ${person(ap.hodId)?.fullName}` : ''}`} />
              <div className={`pf-weight ${total === 100 ? 'ok' : 'bad'}`}>
                Weights <strong>{total}%</strong>
                {total !== 100 && <span> — must be 100%</span>}
              </div>
              <label className="pf-actor">
                <span>Acting as</span>
                <PersonSelect value={actor} onChange={setActor} people={actors} />
              </label>
            </div>
            {sheet.find((g) => g.returnNote) && <div className="pr-note warn">Returned: {sheet.find((g) => g.returnNote)!.returnNote}</div>}
            <div className="pf-scroll">
              <table className="hr-table pf-goal-table">
                <thead>
                  <tr>
                    <th>Perspective</th>
                    <th>Goal</th>
                    <th>Measure</th>
                    <th className="num">Target</th>
                    <th className="num">Actual</th>
                    <th>Progress</th>
                    <th className="num">Weight</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sheet.map((g) => (
                    <tr key={g.id}>
                      <td>
                        <span className={`pf-persp ${g.perspective.toLowerCase()}`}>{PERSPECTIVE_LABEL[g.perspective]}</span>
                      </td>
                      <td>
                        <strong>{g.title}</strong>
                        {g.parentId && <div className="pf-muted">↳ {[...orgGoals].find((o) => o.id === g.parentId)?.title}</div>}
                      </td>
                      <td>{g.measure}</td>
                      <td className="num">
                        {g.target} {g.unit}
                      </td>
                      <td className="num">{g.actual || '—'}</td>
                      <td>
                        <div className="pf-meter" title={`${g.progress}%`}>
                          <span style={{ width: `${g.progress}%` }} />
                        </div>
                      </td>
                      <td className="num">{g.weight}%</td>
                      <td>{fmtDate(g.due)}</td>
                      <td>
                        <Pill tone={STATUS_TONE[g.status]}>{STATUS_LABEL[g.status]}</Pill>
                      </td>
                      <td className="pf-row-actions">
                        <button className="btn btn-secondary btn-sm" aria-label={`Edit ${g.title}`} onClick={() => setEdit({ ...g })}>
                          <Pencil size={13} />
                        </button>
                        <button className="btn btn-secondary btn-sm" aria-label={`Remove ${g.title}`} onClick={() => removeGoal(g.id, actor)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pf-actions">
              <button className="btn btn-secondary" onClick={() => setEdit(blank())}>
                <Plus size={14} /> Add goal
              </button>
              <button className="btn btn-secondary" onClick={() => submitGoals(staffId, cycle!.id, actor)}>
                <Send size={14} /> Submit for approval
              </button>
              <button className="btn btn-primary" disabled={!sheet.some((g) => g.status === 'SUBMITTED')} onClick={() => setDeciding(staffId)}>
                <Check size={14} /> Approve or return
              </button>
            </div>
          </>
        )}
      </Card>

      {edit && <GoalModal draft={edit} actor={actor} onClose={() => setEdit(null)} />}
      {deciding && (
        <DecideGoals
          staffId={deciding}
          expected={ap?.appraiserId ?? ''}
          onClose={() => setDeciding(null)}
          onDecide={(approve, who, comment) => decideGoals(deciding, cycle!.id, approve, who, comment) && setDeciding(null)}
        />
      )}
    </div>
  );
};

const GoalModal: React.FC<{ draft: GoalDraft; actor: string; onClose: () => void }> = ({ draft, actor, onClose }) => {
  const { saveGoal, orgGoals, updateGoalProgress, perfGoals } = useApp();
  const { person } = usePerfData();
  const [g, setG] = useState<GoalDraft>(draft);
  const set = (p: Partial<GoalDraft>) => setG((x) => ({ ...x, ...p }));
  const e = person(g.staffId);
  const parents = orgGoals.filter((o) => o.cycleId === g.cycleId && (o.level === 'COMPANY' || o.department === e?.department));
  const existing = g.id ? perfGoals.find((x) => x.id === g.id) : undefined;
  const onlyProgress = existing && existing.status === 'APPROVED' && existing.title === g.title && existing.measure === g.measure && existing.target === g.target && existing.weight === g.weight && existing.due === g.due && existing.perspective === g.perspective && existing.parentId === g.parentId;
  const save = () => {
    if (onlyProgress) {
      updateGoalProgress(g.id!, g.actual ?? '', g.progress ?? 0, actor);
      onClose();
      return;
    }
    if (saveGoal({ ...g, weight: Number(g.weight) }, actor)) onClose();
  };
  return (
    <Modal
      title={g.id ? 'Edit goal' : 'Add goal'}
      subtitle={`${e?.fullName} · changing the goal itself sends the sheet back for approval; updating the actual does not.`}
      onClose={onClose}
      width={680}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save goal
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Perspective">
          <select className="form-control" value={g.perspective} onChange={(ev) => set({ perspective: ev.target.value as Perspective })}>
            {PERSPECTIVES.map((p) => (
              <option key={p} value={p}>
                {PERSPECTIVE_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Supports">
          <select className="form-control" value={g.parentId ?? ''} onChange={(ev) => set({ parentId: ev.target.value || undefined })}>
            <option value="">—</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.level === 'COMPANY' ? 'Company' : p.department}: {p.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Goal" wide>
          <input className="form-control" value={g.title} onChange={(ev) => set({ title: ev.target.value })} placeholder="e.g. Fuel efficiency" />
        </Field>
        <Field label="Measure">
          <input className="form-control" value={g.measure} onChange={(ev) => set({ measure: ev.target.value })} placeholder="e.g. Fleet fuel report" />
        </Field>
        <Field label="Unit">
          <input className="form-control" value={g.unit} onChange={(ev) => set({ unit: ev.target.value })} placeholder="km/l, %, KES m…" />
        </Field>
        <Field label="Target">
          <input className="form-control" value={g.target} onChange={(ev) => set({ target: ev.target.value })} />
        </Field>
        <Field label="Weight (%)">
          <input className="form-control" type="number" min={5} max={100} step={5} value={g.weight} onChange={(ev) => set({ weight: Number(ev.target.value) })} />
        </Field>
        <Field label="Due">
          <input className="form-control" type="date" value={g.due} onChange={(ev) => set({ due: ev.target.value })} />
        </Field>
        <Field label="Actual to date">
          <input className="form-control" value={g.actual ?? ''} onChange={(ev) => set({ actual: ev.target.value })} />
        </Field>
        <Field label="Progress (%)">
          <input className="form-control" type="number" min={0} max={100} value={g.progress ?? 0} onChange={(ev) => set({ progress: Number(ev.target.value) })} />
        </Field>
      </div>
    </Modal>
  );
};

const DecideGoals: React.FC<{ staffId: string; expected: string; onClose: () => void; onDecide: (approve: boolean, actor: string, comment: string) => void }> = ({ staffId, expected, onClose, onDecide }) => {
  const actors = useActors();
  const { person } = usePerfData();
  const [actor, setActor] = useState(expected);
  const [comment, setComment] = useState('');
  return (
    <Modal
      title="Approve goals"
      subtitle={`${person(staffId)?.fullName}'s goal sheet`}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => onDecide(false, actor, comment)}>
            <Undo2 size={14} /> Return
          </button>
          <button className="btn btn-primary" onClick={() => onDecide(true, actor, comment)}>
            <Check size={14} /> Approve
          </button>
        </>
      }
    >
      <Field label="Acting as" hint="The supervisor (or second-level reviewer) approves; the employee cannot.">
        <PersonSelect value={actor} onChange={setActor} people={actors} />
      </Field>
      <Field label="Comment" hint="Needed when returning the sheet.">
        <textarea className="form-control" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
    </Modal>
  );
};
