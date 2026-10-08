import React, { useMemo, useState } from 'react';
import { CalendarDays, FileText, MapPin, Pencil, Plus, Users } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { ReportPaper, type Report } from '../payroll/ReportPaper';
import { useCompanyName } from '../payroll/shared';
import { CSR_CATEGORY_LABEL, EVENT_KIND_LABEL, WORK_STATUS_LABEL, type CsrActivity, type CsrCategory, type EventKind, type StaffEvent, type WorkStatus } from '../../../data/welfareSeed';
import type { NewCsrActivity } from '../../../context/welfareState';
import { Bar, Card, daysBetween, Empty, Field, FilterPills, fmt, kes, Modal, Pill, StaffSelect, useWfOrg, type Tone } from './shared';

const STATUS_TONE: Record<WorkStatus, Tone> = { PLANNED: 'info', IN_PROGRESS: 'warning', DONE: 'success' };

export const EventsTab: React.FC = () => {
  const { staffEvents, csrActivities } = useApp();
  const org = useWfOrg();
  const events = useMemo(() => staffEvents.filter((e) => e.orgId === org.orgId).sort((a, b) => a.date.localeCompare(b.date)), [staffEvents, org.orgId]);
  const csr = useMemo(() => csrActivities.filter((a) => a.orgId === org.orgId), [csrActivities, org.orgId]);
  const [addingEvent, setAddingEvent] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const shown = events.filter((e) => showDone || e.status !== 'DONE');

  return (
    <>
      <Card
        title="Staff events"
        sub="Fun days, team building, the long-service awards ceremony and the end-year party: budget against spend, the organising committee and a checklist."
        actions={
          <>
            <label className="wf-check wf-check-inline">
              <input type="checkbox" checked={showDone} onChange={(ev) => setShowDone(ev.target.checked)} /> Show past events
            </label>
            <button className="btn btn-primary btn-sm" onClick={() => setAddingEvent(true)}>
              <Plus size={14} /> New event
            </button>
          </>
        }
      >
        {shown.length === 0 && <p className="hi-sub">No upcoming events. Add one, or show past events.</p>}
        <div className="wf-grid-2">
          {shown.map((e) => (
            <EventCard key={e.id} e={e} />
          ))}
        </div>
      </Card>
      <CsrCard csr={csr} />
      {addingEvent && <NewEventModal onClose={() => setAddingEvent(false)} />}
    </>
  );
};

const EventCard: React.FC<{ e: StaffEvent }> = ({ e }) => {
  const { updateStaffEvent, toggleEventTask, addEventTask } = useApp();
  const org = useWfOrg();
  const [task, setTask] = useState({ text: '', owner: '', due: org.today });
  const done = e.tasks.filter((t) => t.done).length;
  const left = daysBetween(org.today, e.date);
  const spentPct = e.budget ? (e.actual / e.budget) * 100 : 0;
  return (
    <div className="wf-event">
      <div className="wf-row">
        <div>
          <strong className="wf-event-title">{e.name}</strong>
          <div className="hi-sub">{EVENT_KIND_LABEL[e.kind]}</div>
        </div>
        <select className="form-control hi-select-sm" value={e.status} onChange={(ev) => updateStaffEvent(e.id, { status: ev.target.value as WorkStatus })} aria-label="Event status">
          {(Object.keys(WORK_STATUS_LABEL) as WorkStatus[]).map((s) => (
            <option key={s} value={s}>
              {WORK_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="wf-meta">
        <span>
          <CalendarDays size={12} /> {fmt(e.date)}
          {e.status !== 'DONE' && left >= 0 ? ` · in ${left} days` : ''}
        </span>
        <span>
          <MapPin size={12} /> {e.venue}
        </span>
        <span>
          <Users size={12} /> {e.status === 'DONE' ? `${e.attendees} attended of ${e.expected}` : `${e.expected} expected`}
        </span>
      </div>
      <div className="wf-meta">
        <span>Owner: {org.name(e.owner)}</span>
        <span>Committee: {e.committee.map((c) => org.name(c)).join(', ')}</span>
      </div>
      <div className="wf-budget">
        <div className="wf-row">
          <span>
            Spent {kes(e.actual)} of {kes(e.budget)}
          </span>
          <Pill tone={spentPct > 100 ? 'critical' : spentPct > 85 ? 'warning' : 'success'}>{e.actual > e.budget ? `Over by ${kes(e.actual - e.budget)}` : `${kes(e.budget - e.actual)} left`}</Pill>
        </div>
        <Bar pct={spentPct} />
      </div>
      <div className="wf-inline wf-wrap">
        <label className="wf-mini">
          <span>Actual spend</span>
          <input className="form-control" type="number" min={0} value={e.actual} onChange={(ev) => updateStaffEvent(e.id, { actual: Math.max(0, Number(ev.target.value)) })} />
        </label>
        <label className="wf-mini">
          <span>Budget</span>
          <input className="form-control" type="number" min={0} value={e.budget} onChange={(ev) => updateStaffEvent(e.id, { budget: Math.max(0, Number(ev.target.value)) })} />
        </label>
        <label className="wf-mini">
          <span>Attended</span>
          <input className="form-control" type="number" min={0} value={e.attendees} onChange={(ev) => updateStaffEvent(e.id, { attendees: Math.max(0, Number(ev.target.value)) })} />
        </label>
      </div>
      <h4 className="wf-sub-head">
        Checklist · {done}/{e.tasks.length} done
      </h4>
      <ul className="wf-tasks">
        {e.tasks.map((t) => {
          const late = !t.done && t.due < org.today;
          return (
            <li key={t.id} className={t.done ? 'done' : ''}>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => toggleEventTask(e.id, t.id)} />
                <span>{t.text}</span>
              </label>
              <small className={late ? 'wf-late' : ''}>
                {org.name(t.owner)} · {late ? 'overdue ' : ''}
                {fmt(t.due)}
              </small>
            </li>
          );
        })}
      </ul>
      {e.status !== 'DONE' && (
        <div className="wf-inline wf-wrap">
          <input className="form-control grow" value={task.text} onChange={(ev) => setTask({ ...task, text: ev.target.value })} placeholder="New task" aria-label="New task" />
          <StaffSelect value={task.owner} onChange={(v) => setTask({ ...task, owner: v })} staff={org.staff} placeholder="Owner" ariaLabel="Task owner" />
          <input className="form-control" type="date" value={task.due} onChange={(ev) => setTask({ ...task, due: ev.target.value })} aria-label="Due date" />
          <button
            className="btn btn-secondary btn-sm"
            disabled={!task.text.trim() || !task.owner}
            onClick={() => {
              addEventTask(e.id, { text: task.text.trim(), owner: task.owner, due: task.due });
              setTask({ text: '', owner: '', due: org.today });
            }}
          >
            Add
          </button>
        </div>
      )}
      {e.notes && <p className="hi-sub wf-mt">{e.notes}</p>}
    </div>
  );
};

const NewEventModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addStaffEvent } = useApp();
  const org = useWfOrg();
  const [kind, setKind] = useState<EventKind>('TEAM_BUILDING');
  const [name, setName] = useState('');
  const [date, setDate] = useState(org.today);
  const [venue, setVenue] = useState('');
  const [budget, setBudget] = useState(0);
  const [owner, setOwner] = useState('KHE-0290');
  const [committee, setCommittee] = useState<string[]>([]);
  const [expected, setExpected] = useState(50);
  return (
    <Modal
      title="New staff event"
      onClose={onClose}
      width={680}
      footer={
        <button
          className="btn btn-primary"
          disabled={!name.trim() || !venue.trim() || !owner}
          onClick={() => {
            addStaffEvent({ name: name.trim(), kind, date, venue: venue.trim(), budget, owner, committee: Array.from(new Set([owner, ...committee])), expected });
            onClose();
          }}
        >
          Add event
        </button>
      }
    >
      <div className="pr-form-grid">
        <Field label="Type">
          <select className="form-control" value={kind} onChange={(ev) => setKind(ev.target.value as EventKind)}>
            {(Object.keys(EVENT_KIND_LABEL) as EventKind[]).map((k) => (
              <option key={k} value={k}>
                {EVENT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name">
          <input className="form-control" value={name} onChange={(ev) => setName(ev.target.value)} placeholder="e.g. Finance team building" />
        </Field>
        <Field label="Date">
          <input className="form-control" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
        </Field>
        <Field label="Venue">
          <input className="form-control" value={venue} onChange={(ev) => setVenue(ev.target.value)} />
        </Field>
        <Field label="Budget (KES)">
          <input className="form-control" type="number" min={0} value={budget || ''} onChange={(ev) => setBudget(Number(ev.target.value))} />
        </Field>
        <Field label="Expected attendance">
          <input className="form-control" type="number" min={0} value={expected} onChange={(ev) => setExpected(Number(ev.target.value))} />
        </Field>
        <Field label="Owner">
          <StaffSelect value={owner} onChange={setOwner} staff={org.staff} />
        </Field>
        <Field label="Committee (hold Ctrl to pick several)">
          <select className="form-control" multiple size={4} value={committee} onChange={(ev) => setCommittee(Array.from(ev.target.selectedOptions).map((o) => o.value))}>
            {org.staff.map((e) => (
              <option key={e.staffId} value={e.staffId}>
                {e.fullName}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* CSR                                                                  */
/* ------------------------------------------------------------------ */

const csrReport = (rows: CsrActivity[], year: string, name: (id?: string) => string): Report => {
  const budget = rows.reduce((t, a) => t + a.budget, 0);
  const actual = rows.reduce((t, a) => t + a.actual, 0);
  const cats = (Object.keys(CSR_CATEGORY_LABEL) as CsrCategory[]).filter((c) => rows.some((a) => a.category === c));
  return {
    title: 'Corporate social responsibility report',
    subtitle: `Year ${year}`,
    landscape: true,
    kpis: [
      { label: 'Activities', value: String(rows.length), sub: `${rows.filter((a) => a.status === 'DONE').length} completed` },
      { label: 'Budget', value: kes(budget) },
      { label: 'Spent', value: kes(actual), sub: budget ? `${Math.round((actual / budget) * 100)}% of budget` : undefined },
      { label: 'Beneficiaries', value: rows.reduce((t, a) => t + a.beneficiaries, 0).toLocaleString() },
      { label: 'Staff volunteers', value: String(new Set(rows.flatMap((a) => a.volunteers)).size) }
    ],
    sections: [
      {
        heading: 'By category',
        columns: [{ label: 'Category' }, { label: 'Activities' }, { label: 'Beneficiaries' }, { label: 'Budget', num: true }, { label: 'Spent', num: true }],
        rows: cats.map((c) => {
          const r = rows.filter((a) => a.category === c);
          return [CSR_CATEGORY_LABEL[c], r.length, r.reduce((t, a) => t + a.beneficiaries, 0).toLocaleString(), r.reduce((t, a) => t + a.budget, 0), r.reduce((t, a) => t + a.actual, 0)];
        }),
        foot: ['Total', rows.length, rows.reduce((t, a) => t + a.beneficiaries, 0).toLocaleString(), budget, actual]
      },
      {
        heading: 'Activities',
        columns: [{ label: 'Project' }, { label: 'Community' }, { label: 'Category' }, { label: 'Started' }, { label: 'Status' }, { label: 'Beneficiaries' }, { label: 'Volunteers' }, { label: 'Budget', num: true }, { label: 'Spent', num: true }],
        rows: rows.map((a) => [a.project, a.community, CSR_CATEGORY_LABEL[a.category], fmt(a.startOn), WORK_STATUS_LABEL[a.status], a.beneficiaries.toLocaleString(), a.volunteers.map((v) => name(v)).join(', '), a.budget, a.actual])
      },
      {
        heading: 'What was done',
        columns: [{ label: 'Project' }, { label: 'Summary' }, { label: 'Photos and evidence' }],
        rows: rows.map((a) => [a.project, a.summary, a.photos])
      }
    ],
    signatures: ['Prepared by (HR)', 'Reviewed by (Finance)', 'Approved by (Managing Director)']
  };
};

const CsrCard: React.FC<{ csr: CsrActivity[] }> = ({ csr }) => {
  const org = useWfOrg();
  const companyName = useCompanyName();
  const [cat, setCat] = useState<'ALL' | CsrCategory>('ALL');
  const [report, setReport] = useState(false);
  const [editing, setEditing] = useState<CsrActivity | 'new' | null>(null);
  const rows = csr.filter((a) => cat === 'ALL' || a.category === cat).sort((a, b) => b.startOn.localeCompare(a.startOn));
  const year = org.today.slice(0, 4);

  return (
    <Card
      title="CSR activities"
      sub="Community projects in education, health, environment and water, with spend, reach and the staff who volunteered."
      actions={
        <>
          <button className="btn btn-secondary btn-sm" onClick={() => setReport((v) => !v)}>
            <FileText size={13} /> {report ? 'Back to list' : 'CSR report'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
            <Plus size={14} /> New activity
          </button>
        </>
      }
    >
      <div className="digicraft-toolbar wf-toolbar">
        <FilterPills value={cat} onChange={setCat} options={[{ id: 'ALL' as const, label: 'All', n: csr.length }, ...(Object.keys(CSR_CATEGORY_LABEL) as CsrCategory[]).map((c) => ({ id: c, label: CSR_CATEGORY_LABEL[c], n: csr.filter((a) => a.category === c).length }))]} />
      </div>
      {report ? (
        <ReportPaper report={csrReport(rows, year, org.name)} company={companyName(org.orgId)} />
      ) : (
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Category</th>
                <th className="num">Budget</th>
                <th className="wf-util-col">Spent</th>
                <th className="num">Beneficiaries</th>
                <th>Volunteers</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <Empty cols={8}>No CSR activities yet.</Empty>}
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="wf-person">
                      <strong>{a.project}</strong>
                      <span>
                        {a.community} · from {fmt(a.startOn)}
                      </span>
                    </div>
                  </td>
                  <td>{CSR_CATEGORY_LABEL[a.category]}</td>
                  <td className="num hi-mono">{a.budget.toLocaleString()}</td>
                  <td>
                    <Bar pct={a.budget ? (a.actual / a.budget) * 100 : 0} />
                    <div className="hi-sub">{kes(a.actual)}</div>
                  </td>
                  <td className="num hi-mono">{a.beneficiaries.toLocaleString()}</td>
                  <td>
                    <span title={a.volunteers.map((v) => org.name(v)).join(', ')}>{a.volunteers.length} staff</span>
                  </td>
                  <td>
                    <Pill tone={STATUS_TONE[a.status]}>{WORK_STATUS_LABEL[a.status]}</Pill>
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(a)} aria-label={`Edit ${a.project}`}>
                      <Pencil size={13} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <CsrModal a={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
};

const CsrModal: React.FC<{ a?: CsrActivity; onClose: () => void }> = ({ a, onClose }) => {
  const { addCsrActivity, updateCsrActivity } = useApp();
  const org = useWfOrg();
  const [f, setF] = useState<NewCsrActivity>(
    a
      ? { project: a.project, community: a.community, category: a.category, startOn: a.startOn, budget: a.budget, actual: a.actual, beneficiaries: a.beneficiaries, volunteers: a.volunteers, photos: a.photos, status: a.status, summary: a.summary }
      : { project: '', community: '', category: 'EDUCATION', startOn: org.today, budget: 0, actual: 0, beneficiaries: 0, volunteers: [], photos: '', status: 'PLANNED', summary: '' }
  );
  const set = <K extends keyof NewCsrActivity>(k: K, v: NewCsrActivity[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal
      title={a ? `Edit ${a.project}` : 'New CSR activity'}
      onClose={onClose}
      width={720}
      footer={
        <button
          className="btn btn-primary"
          disabled={!f.project.trim() || !f.community.trim()}
          onClick={() => {
            if (a) updateCsrActivity(a.id, f);
            else addCsrActivity(f);
            onClose();
          }}
        >
          {a ? 'Save' : 'Add activity'}
        </button>
      }
    >
      <div className="pr-form-grid">
        <Field label="Project">
          <input className="form-control" value={f.project} onChange={(ev) => set('project', ev.target.value)} />
        </Field>
        <Field label="Community or location">
          <input className="form-control" value={f.community} onChange={(ev) => set('community', ev.target.value)} />
        </Field>
        <Field label="Category">
          <select className="form-control" value={f.category} onChange={(ev) => set('category', ev.target.value as CsrCategory)}>
            {(Object.keys(CSR_CATEGORY_LABEL) as CsrCategory[]).map((c) => (
              <option key={c} value={c}>
                {CSR_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="form-control" value={f.status} onChange={(ev) => set('status', ev.target.value as WorkStatus)}>
            {(Object.keys(WORK_STATUS_LABEL) as WorkStatus[]).map((s) => (
              <option key={s} value={s}>
                {WORK_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start date">
          <input className="form-control" type="date" value={f.startOn} onChange={(ev) => set('startOn', ev.target.value)} />
        </Field>
        <Field label="Beneficiaries">
          <input className="form-control" type="number" min={0} value={f.beneficiaries} onChange={(ev) => set('beneficiaries', Math.max(0, Number(ev.target.value)))} />
        </Field>
        <Field label="Budget (KES)">
          <input className="form-control" type="number" min={0} value={f.budget} onChange={(ev) => set('budget', Math.max(0, Number(ev.target.value)))} />
        </Field>
        <Field label="Spent (KES)">
          <input className="form-control" type="number" min={0} value={f.actual} onChange={(ev) => set('actual', Math.max(0, Number(ev.target.value)))} />
        </Field>
        <Field label="Staff volunteers (hold Ctrl to pick several)" wide>
          <select className="form-control" multiple size={5} value={f.volunteers} onChange={(ev) => set('volunteers', Array.from(ev.target.selectedOptions).map((o) => o.value))}>
            {org.staff.map((e) => (
              <option key={e.staffId} value={e.staffId}>
                {e.fullName} · {e.jobTitle}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Summary" wide>
          <textarea className="form-control" rows={2} value={f.summary} onChange={(ev) => set('summary', ev.target.value)} />
        </Field>
        <Field label="Photos and evidence" wide>
          <input className="form-control" value={f.photos} onChange={(ev) => set('photos', ev.target.value)} placeholder="Where the photos and letters are kept" />
        </Field>
      </div>
    </Modal>
  );
};
