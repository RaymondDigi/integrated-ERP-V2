import React, { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { BOND_THRESHOLD, COURSES, bondMonthsFor, certById, courseById } from '../../../data/trainingConfig';
import { kes, sessionCost } from '../../../data/trainingEngine';
import { fmtDate } from '../../../data/timeEngine';
import { Modal } from '../payroll/shared';
import { BudgetBar, Pill, useTrainingOrg } from './shared';

export const PlanTab: React.FC = () => {
  const { setTrainingBudget } = useApp();
  const { budget, sessions, needs, year, byId } = useTrainingOrg();
  const [editing, setEditing] = useState<{ dept: string; amount: string } | null>(null);
  const tot = budget.reduce((s, l) => ({ budget: s.budget + l.budget, committed: s.committed + l.committed, spent: s.spent + l.spent }), { budget: 0, committed: 0, spent: 0 });

  const plan = useMemo(() => sessions.filter((s) => s.start.startsWith(String(year)) && s.status !== 'Cancelled').sort((a, b) => a.start.localeCompare(b.start)), [sessions, year]);
  const unscheduled = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const n of needs.filter((x) => x.status === 'Approved' && !x.sessionId && x.courseId)) m.set(n.courseId!, [...(m.get(n.courseId!) ?? []), n.staffId]);
    return [...m.entries()];
  }, [needs]);

  return (
    <>
      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Training budget {year}</h3>
            <p>Spent is closed sessions at invoiced cost. Committed is people booked on upcoming sessions plus approved needs not yet scheduled, at catalogue cost. Costs follow each participant's department.</p>
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Department</th>
                <th className="num">Budget</th>
                <th className="num">Committed</th>
                <th className="num">Spent</th>
                <th className="num">Remaining</th>
                <th>Used</th>
                <th aria-label="Edit" />
              </tr>
            </thead>
            <tbody>
              {budget.map((l) => {
                const left = l.budget - l.committed - l.spent;
                return (
                  <tr key={l.department}>
                    <td>
                      <strong>{l.department}</strong>
                      <div className="muted">{l.people} people trained or booked</div>
                    </td>
                    <td className="num">{kes(l.budget)}</td>
                    <td className="num">{kes(l.committed)}</td>
                    <td className="num">{kes(l.spent)}</td>
                    <td className={`num${left < 0 ? ' tr-neg' : ''}`}>{kes(left)}</td>
                    <td style={{ minWidth: 120 }}>
                      <BudgetBar budget={l.budget} spent={l.spent} committed={l.committed} />
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" aria-label={`Edit ${l.department} budget`} onClick={() => setEditing({ dept: l.department, amount: String(l.budget) })}>
                        <Pencil size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{kes(tot.budget)}</td>
                <td className="num">{kes(tot.committed)}</td>
                <td className="num">{kes(tot.spent)}</td>
                <td className="num">{kes(tot.budget - tot.committed - tot.spent)}</td>
                <td>
                  <BudgetBar budget={tot.budget} spent={tot.spent} committed={tot.committed} />
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="tr-legend tr-legend-bar">
          <span>
            <i className="spent" /> Spent
          </span>
          <span>
            <i className="committed" /> Committed
          </span>
        </div>
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Annual training plan {year}</h3>
            <p>Sessions held and scheduled this year, and approved needs still waiting for a session.</p>
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Course</th>
                <th>Departments</th>
                <th className="num">People</th>
                <th className="num">Cost</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((s) => {
                const people = s.enrolments.filter((x) => x.status !== 'Withdrawn' && x.status !== 'Waitlisted');
                const depts = [...new Set(people.map((x) => byId.get(x.staffId)?.department).filter(Boolean))];
                return (
                  <tr key={s.id}>
                    <td className="tm-mono">{fmtDate(s.start)}</td>
                    <td>
                      <strong>{courseById(s.courseId)?.title}</strong>
                      <div className="muted">{s.id}</div>
                    </td>
                    <td className="muted">{depts.join(', ') || '—'}</td>
                    <td className="num">{people.length}</td>
                    <td className="num">{kes(sessionCost(s))}</td>
                    <td>
                      <Pill cls={s.status === 'Completed' ? 'success' : 'info'}>{s.status === 'Completed' ? 'Held' : 'Scheduled'}</Pill>
                    </td>
                  </tr>
                );
              })}
              {unscheduled.map(([courseId, ids]) => {
                const c = courseById(courseId)!;
                return (
                  <tr key={courseId}>
                    <td className="muted">To schedule</td>
                    <td>
                      <strong>{c.title}</strong>
                      <div className="muted">Approved needs</div>
                    </td>
                    <td className="muted">{[...new Set(ids.map((id) => byId.get(id)?.department))].join(', ')}</td>
                    <td className="num">{ids.length}</td>
                    <td className="num">{kes(ids.length * c.costPerHead)}</td>
                    <td>
                      <Pill cls="warning">Not scheduled</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Course catalogue</h3>
            <p>
              Courses over {kes(BOND_THRESHOLD)} per head need a training bond. NITA-approved courses can be claimed back against the training levy.
            </p>
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Provider</th>
                <th className="num">Duration</th>
                <th className="num">Cost per head</th>
                <th>NITA</th>
                <th>Certificate awarded</th>
                <th>Assessment</th>
              </tr>
            </thead>
            <tbody>
              {COURSES.map((c) => {
                const cert = certById(c.certId ?? '');
                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.title}</strong>
                      <div className="muted">
                        {c.id}
                        {c.costPerHead >= BOND_THRESHOLD ? ` · bond ${bondMonthsFor(c.costPerHead)} months` : ''}
                      </div>
                    </td>
                    <td>
                      {c.provider}
                      <div className="muted">{c.providerType}</div>
                    </td>
                    <td className="num">
                      {c.days} day{c.days === 1 ? '' : 's'}
                      <div className="muted">{c.hours} hours</div>
                    </td>
                    <td className="num">{kes(c.costPerHead)}</td>
                    <td>{c.nitaApproved ? <Pill cls="success">Approved</Pill> : <span className="muted">No</span>}</td>
                    <td>
                      {cert ? (
                        <>
                          {cert.name}
                          <div className="muted">Valid {cert.validityMonths} months</div>
                        </>
                      ) : (
                        <span className="muted">Attendance certificate</span>
                      )}
                    </td>
                    <td>{c.passMark ? `Pass mark ${c.passMark}%` : <span className="muted">Attendance only</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal
          title="Training budget"
          subtitle={`${editing.dept} · ${year}`}
          onClose={() => setEditing(null)}
          width={420}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!(Number(editing.amount) >= 0) || editing.amount === ''}
                onClick={() => {
                  setTrainingBudget(editing.dept, Number(editing.amount));
                  setEditing(null);
                }}
              >
                Save
              </button>
            </>
          }
        >
          <label className="req-field">
            <span>Budget (KES)</span>
            <input type="number" min={0} step={1000} className="form-control" value={editing.amount} onChange={(ev) => setEditing({ ...editing, amount: ev.target.value })} />
          </label>
        </Modal>
      )}
    </>
  );
};
