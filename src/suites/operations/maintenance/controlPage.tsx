import React, { useState } from 'react';
import { Plus, Target, Receipt, TrendingUp, Clock, AlertTriangle, PenLine, Copy, CheckCircle2 } from 'lucide-react';
import { ExportCsvButton, PrintButton, SignModal, esc } from '../../../platform/Widgets';
import { useNotices } from '../../../platform/outbox';
import { useOperations } from '../store';
import { addDays, fmtDate, kes, TODAY } from '../../finance/engine';
import type { Project } from '../types';
import { Chips, DataTable, DefList, Empty, Field, Modal, Panel, Pill, Stat, SuitePage, Timeline } from '../../ui/kit';
import { PartySelect } from '../../commercial/parts';
import { useProjects } from './projects';
import { actualCost, criticalPath, irr, npv, payback, phaseProgress, projectCosts, projectShortages, projectVariance } from './projectEngine';
import type { CostType, ExpenseClaim, ProjectExt, ProjectTask } from './types';

type Tab = 'plan' | 'costs' | 'time' | 'materials' | 'billing' | 'appraisal' | 'close' | 'notices';
const KIND_LABEL: Record<ProjectExt['kind'], string> = { CAPEX: 'Capital (expensed)', INVESTMENT: 'Investment (capitalised)', CUSTOMER: 'Customer job' };
const ST_PILL: Record<Project['status'], string> = { PLANNING: 'DRAFT', ACTIVE: 'OPEN', ON_HOLD: 'SUBMITTED', DONE: 'POSTED' };

export const ProjectControlPage: React.FC = () => {
  const { state, maintenance } = useOperations();
  const pr = useProjects();
  const [pid, setPid] = useState<string>(maintenance.focus && state.projects.some((p) => p.id === maintenance.focus) ? maintenance.focus : state.projects[0]?.id ?? '');
  const [tab, setTab] = useState<Tab>('plan');
  const [adding, setAdding] = useState(false);
  const p = state.projects.find((x) => x.id === pid);
  const e = p ? pr.state.ext[p.id] : undefined;
  return (
    <SuitePage
      eyebrow="Projects"
      title="Project control"
      subtitle="Work breakdown and critical path, cost ledger, time and expenses, materials, customer billing, investment appraisal, variance and close-out for each project."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> New project
        </button>
      }
    >
      <div className="sx-toolbar">
        <select className="form-control" value={pid} onChange={(x) => setPid(x.target.value)} aria-label="Project" style={{ maxWidth: 420 }}>
          {state.projects.map((x) => (
            <option key={x.id} value={x.id}>
              {pr.state.ext[x.id]?.code ?? ''} {x.name}
            </option>
          ))}
        </select>
        {p && <Pill status={ST_PILL[p.status]} label={p.status.replace('_', ' ').toLowerCase()} />}
      </div>
      {!p || !e ? (
        <Empty title="Choose a project" />
      ) : (
        <>
          <ProjectHeader p={p} e={e} />
          <Chips
            value={tab}
            onChange={setTab}
            options={[
              { value: 'plan', label: 'Plan & schedule' },
              { value: 'costs', label: 'Costs & variance' },
              { value: 'time', label: 'Time & expenses' },
              { value: 'materials', label: 'Materials' },
              { value: 'billing', label: 'Orders & billing' },
              { value: 'appraisal', label: 'Appraisal' },
              { value: 'close', label: 'Close-out' },
              { value: 'notices', label: 'Notices' }
            ]}
          />
          {tab === 'plan' && <PlanTab p={p} e={e} />}
          {tab === 'costs' && <CostsTab p={p} e={e} />}
          {tab === 'time' && <TimeTab p={p} e={e} />}
          {tab === 'materials' && <MaterialsTab p={p} e={e} />}
          {tab === 'billing' && <BillingTab p={p} e={e} />}
          {tab === 'appraisal' && <AppraisalTab p={p} e={e} />}
          {tab === 'close' && <CloseTab p={p} e={e} />}
          {tab === 'notices' && <NoticesTab e={e} />}
        </>
      )}
      {adding && <NewProjectModal onClose={() => setAdding(false)} onSaved={(id) => (setPid(id), setAdding(false))} />}
    </SuitePage>
  );
};

const ProjectHeader: React.FC<{ p: Project; e: ProjectExt }> = ({ p, e }) => {
  const pr = useProjects();
  const v = projectVariance(p, e, pr.state.costs);
  const next: Project['status'][] = p.status === 'PLANNING' ? ['ACTIVE'] : p.status === 'ACTIVE' ? ['ON_HOLD', 'DONE'] : p.status === 'ON_HOLD' ? ['ACTIVE'] : [];
  return (
    <>
      <div className="sx-stats">
        <Stat label="Budget" value={kes(p.budget, { compact: true })} detail={e.budgetApprovedBy ? `Approved by ${e.budgetApprovedBy}` : 'Not yet approved'} icon={<Receipt size={17} />} tone="blue" />
        <Stat label="Actual cost" value={kes(v.AC, { compact: true })} detail={`EAC ${kes(v.eac, { compact: true })}`} icon={<Receipt size={17} />} tone={v.eac > p.budget ? 'red' : 'green'} />
        <Stat label="CPI / SPI" value={`${v.cpi ?? '—'} / ${v.spi ?? '—'}`} detail="Cost and schedule performance (1.0 = on plan)" icon={<TrendingUp size={17} />} tone={(v.cpi ?? 1) < 0.95 || (v.spi ?? 1) < 0.95 ? 'gold' : 'green'} />
        <Stat label="Forecast finish" value={fmtDate(v.forecastEnd)} detail={v.slipDays ? `${v.slipDays} days late` : 'On time'} icon={<Clock size={17} />} tone={v.slipDays ? 'red' : 'violet'} />
      </div>
      <DefList
        items={[
          ['Code', e.code],
          ['Type', KIND_LABEL[e.kind]],
          ['Owner', p.owner],
          ['Dates', `${fmtDate(p.start)} – ${fmtDate(p.end)}`],
          ['Scope', e.scope],
          ['Team', e.team.map((t) => `${t.name} (${t.role}, ${t.allocationPct}%)`).join(', ') || '—']
        ]}
      />
      <div className="sx-inline-form sx-wrap">
        {!e.budgetApprovedBy && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => pr.approveBudget(p.id)}>
            <CheckCircle2 size={14} /> Approve budget
          </button>
        )}
        {next.map((s) => (
          <button key={s} type="button" className="btn btn-secondary btn-sm" onClick={() => pr.setStatus(p.id, s)}>
            {s === 'ACTIVE' ? (p.status === 'ON_HOLD' ? 'Resume' : 'Start project') : s === 'ON_HOLD' ? 'Put on hold' : 'Close project'}
          </button>
        ))}
      </div>
    </>
  );
};

/* ---------------- Plan: phases, tasks, critical path ---------------- */

const PlanTab: React.FC<{ p: Project; e: ProjectExt }> = ({ p, e }) => {
  const { state } = useOperations();
  const pr = useProjects();
  const cp = criticalPath(e.tasks, p.start);
  const [ph, setPh] = useState({ name: '', budget: '', start: p.start, end: p.end });
  const [task, setTask] = useState<ProjectTask | null>(null);
  const [copyFrom, setCopyFrom] = useState('');
  const span = Math.max(1, cp.duration);
  return (
    <>
      {e.phases.length === 0 && (
        <div className="sx-inline-form">
          <select className="form-control" value={copyFrom} onChange={(x) => setCopyFrom(x.target.value)} aria-label="Copy plan from">
            <option value="">Copy the plan of…</option>
            {state.projects
              .filter((x) => x.id !== p.id && pr.state.ext[x.id]?.phases.length)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => pr.copyPlan(p.id, copyFrom)}>
            <Copy size={14} /> Copy plan
          </button>
        </div>
      )}
      <Panel title="Phases (work breakdown)" subtitle="Budget and progress by phase">
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Phase</th>
              <th>Dates</th>
              <th style={{ textAlign: 'right' }}>Budget</th>
              <th style={{ textAlign: 'right' }}>Actual</th>
              <th style={{ textAlign: 'right' }}>Progress</th>
            </tr>
          </thead>
          <tbody>
            {e.phases.map((x) => (
              <tr key={x.id}>
                <td>{x.name}</td>
                <td>
                  {fmtDate(x.start)} – {fmtDate(x.end)}
                </td>
                <td style={{ textAlign: 'right' }}>{kes(x.budget, { compact: true })}</td>
                <td style={{ textAlign: 'right' }} className={actualCost(pr.state.costs, p.id, x.id) > x.budget ? 'sx-danger-text' : ''}>
                  {kes(actualCost(pr.state.costs, p.id, x.id), { compact: true })}
                </td>
                <td style={{ textAlign: 'right' }}>{Math.round(phaseProgress(e, x.id) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sx-inline-form sx-wrap">
          <input className="form-control" value={ph.name} onChange={(x) => setPh({ ...ph, name: x.target.value })} placeholder="New phase" aria-label="Phase name" />
          <input className="form-control" type="number" value={ph.budget} onChange={(x) => setPh({ ...ph, budget: x.target.value })} placeholder="Budget" style={{ width: 120 }} aria-label="Phase budget" />
          <input className="form-control" type="date" value={ph.start} onChange={(x) => setPh({ ...ph, start: x.target.value })} aria-label="Phase start" />
          <input className="form-control" type="date" value={ph.end} onChange={(x) => setPh({ ...ph, end: x.target.value })} aria-label="Phase end" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => pr.savePhase(p.id, { id: '', name: ph.name, budget: Number(ph.budget), start: ph.start, end: ph.end }).ok && setPh({ ...ph, name: '', budget: '' })}>
            Add phase
          </button>
        </div>
      </Panel>
      <Panel
        title="Schedule (critical path)"
        subtitle={`${cp.duration} working days · finishes ${fmtDate(cp.finishDate)}${cp.finishDate > p.end ? ` — ${Math.round((new Date(cp.finishDate).getTime() - new Date(p.end).getTime()) / 864e5)} days after the target end` : ''}`}
        action={
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTask({ id: '', phaseId: e.phases[0]?.id ?? '', name: '', durationDays: 5, predecessors: [], progress: 0 })}>
            <Plus size={14} /> Task
          </button>
        }
      >
        {cp.tasks.length === 0 ? (
          <p className="sx-muted">No tasks yet.</p>
        ) : (
          <div className="sx-gantt">
            {cp.tasks.map((t) => (
              <div key={t.id} className="sx-gantt-row">
                <button type="button" className="sx-link sx-gantt-name" onClick={() => setTask({ ...t, predecessors: [...t.predecessors] })} title={`Float ${t.float} d`}>
                  {t.name}
                </button>
                <div className="sx-gantt-track">
                  <div
                    className={`sx-gantt-bar ${t.critical ? 'critical' : ''}`}
                    style={{ left: `${(t.es / span) * 100}%`, width: `${Math.max(2, (t.durationDays / span) * 100)}%` }}
                    title={`${fmtDate(t.startDate)} – ${fmtDate(t.finishDate)} · ${t.progress}% · float ${t.float} d`}
                  >
                    <span style={{ width: `${t.progress}%` }} />
                  </div>
                </div>
                <small className={t.critical ? 'sx-danger-text' : 'sx-muted'}>{t.critical ? 'critical' : `${t.float} d float`}</small>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {task && (
        <Modal
          size="md"
          title={task.id ? `Edit ${task.name}` : 'New task'}
          onClose={() => setTask(null)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => pr.saveTask(p.id, task).ok && setTask(null)}>
              Save task
            </button>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="Task" required span={2}>
              <input className="form-control" value={task.name} onChange={(x) => setTask({ ...task, name: x.target.value })} />
            </Field>
            <Field label="Phase" required>
              <select className="form-control" value={task.phaseId} onChange={(x) => setTask({ ...task, phaseId: x.target.value })}>
                <option value="">Choose…</option>
                {e.phases.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Duration (days)">
              <input className="form-control" type="number" min="1" value={task.durationDays} onChange={(x) => setTask({ ...task, durationDays: Number(x.target.value) })} />
            </Field>
            <Field label="Progress %">
              <input className="form-control" type="number" min="0" max="100" value={task.progress} onChange={(x) => setTask({ ...task, progress: Number(x.target.value) })} />
            </Field>
            <Field label="Depends on" span={2}>
              <select
                className="form-control"
                multiple
                value={task.predecessors}
                onChange={(x) => setTask({ ...task, predecessors: [...x.target.selectedOptions].map((o) => o.value) })}
                style={{ minHeight: 90 }}
              >
                {e.tasks
                  .filter((x) => x.id !== task.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
};

/* ---------------- Costs and variance ---------------- */

const CostsTab: React.FC<{ p: Project; e: ProjectExt }> = ({ p, e }) => {
  const pr = useProjects();
  const v = projectVariance(p, e, pr.state.costs);
  const rows = projectCosts(pr.state.costs, p.id);
  const [c, setC] = useState({ phaseId: '', type: 'MATERIAL' as CostType, amount: '', source: '', description: '', billable: false });
  const phase = (id: string) => e.phases.find((x) => x.id === id)?.name ?? id;
  const byType = (['MATERIAL', 'LABOUR', 'BURDEN', 'SUBCONTRACT', 'EXPENSE', 'OTHER'] as CostType[]).map((t) => ({ t, v: rows.filter((r) => r.type === t).reduce((a, r) => a + r.amount, 0) })).filter((x) => x.v);
  return (
    <>
      <Panel title="Variance by phase" subtitle="Earned value against plan and actual cost">
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Phase</th>
              <th style={{ textAlign: 'right' }}>Planned value</th>
              <th style={{ textAlign: 'right' }}>Earned</th>
              <th style={{ textAlign: 'right' }}>Actual</th>
              <th style={{ textAlign: 'right' }}>CPI</th>
              <th style={{ textAlign: 'right' }}>SPI</th>
              <th>Forecast end</th>
            </tr>
          </thead>
          <tbody>
            {v.phases.map((x) => (
              <tr key={x.id}>
                <td>{x.name}</td>
                <td style={{ textAlign: 'right' }}>{kes(x.pv, { compact: true })}</td>
                <td style={{ textAlign: 'right' }}>{kes(x.ev, { compact: true })}</td>
                <td style={{ textAlign: 'right' }}>{kes(x.ac, { compact: true })}</td>
                <td style={{ textAlign: 'right' }} className={(x.cpi ?? 1) < 0.95 ? 'sx-danger-text' : ''}>
                  {x.cpi ?? '—'}
                </td>
                <td style={{ textAlign: 'right' }} className={(x.spi ?? 1) < 0.95 ? 'sx-danger-text' : ''}>
                  {x.spi ?? '—'}
                </td>
                <td className={x.slipDays ? 'sx-danger-text' : ''}>
                  {fmtDate(x.forecastEnd)}
                  {x.slipDays ? ` (+${x.slipDays} d)` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sx-muted">By type: {byType.map((x) => `${x.t.toLowerCase()} ${kes(x.v, { compact: true })}`).join(' · ') || '—'}</p>
      </Panel>
      <Panel
        title="Cost ledger"
        action={
          <ExportCsvButton name={`${e.code}-costs`} header={['Date', 'Phase', 'Type', 'Source', 'Description', 'Amount', 'Billed']} rows={() => rows.map((r) => [r.date, phase(r.phaseId), r.type, r.source, r.description, r.amount, r.billed ?? ''])} />
        }
      >
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          initialSort={{ key: 'd', dir: 'desc' }}
          columns={[
            { key: 'd', header: 'Date', render: (r) => fmtDate(r.date), sort: (r) => r.date },
            { key: 'p', header: 'Phase', render: (r) => phase(r.phaseId), hideOnMobile: true },
            { key: 't', header: 'Type', render: (r) => r.type.toLowerCase() },
            { key: 'x', header: 'Description', render: (r) => `${r.description} (${r.source})` },
            { key: 'a', header: 'Amount', render: (r) => kes(r.amount), align: 'right', sort: (r) => r.amount }
          ]}
        />
        {p.status !== 'DONE' && (
          <div className="sx-inline-form sx-wrap">
            <select className="form-control" value={c.phaseId} onChange={(x) => setC({ ...c, phaseId: x.target.value })} aria-label="Cost phase">
              <option value="">Phase…</option>
              {e.phases.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <select className="form-control" value={c.type} onChange={(x) => setC({ ...c, type: x.target.value as CostType })} aria-label="Cost type">
              {['MATERIAL', 'SUBCONTRACT', 'OTHER'].map((t) => (
                <option key={t} value={t}>
                  {t.toLowerCase()}
                </option>
              ))}
            </select>
            <input className="form-control" value={c.source} onChange={(x) => setC({ ...c, source: x.target.value })} placeholder="Source document" aria-label="Source document" />
            <input className="form-control" value={c.description} onChange={(x) => setC({ ...c, description: x.target.value })} placeholder="Description" aria-label="Cost description" />
            <input className="form-control" type="number" value={c.amount} onChange={(x) => setC({ ...c, amount: x.target.value })} placeholder="KES" style={{ width: 110 }} aria-label="Amount" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => pr.addCost(p.id, { ...c, amount: Number(c.amount) }).ok && setC({ ...c, amount: '', description: '', source: '' })}>
              Add cost
            </button>
          </div>
        )}
      </Panel>
    </>
  );
};

/* ---------------- Time and expenses ---------------- */

const TimeTab: React.FC<{ p: Project; e: ProjectExt }> = ({ p, e }) => {
  const { actor } = useOperations();
  const pr = useProjects();
  const ts = pr.state.timesheets.filter((t) => t.projectId === p.id);
  const ex = pr.state.expenses.filter((x) => x.projectId === p.id);
  const [t, setT] = useState({ phaseId: e.phases[0]?.id ?? '', employee: actor.name, date: TODAY, hours: '8', rate: '1500', billRate: e.kind === 'CUSTOMER' ? '3200' : '0' });
  const [x, setX] = useState({ phaseId: e.phases[0]?.id ?? '', category: 'TRAVEL' as ExpenseClaim['category'], amount: '', description: '', billable: e.kind === 'CUSTOMER' });
  const phase = (id: string) => e.phases.find((y) => y.id === id)?.name ?? id;
  return (
    <>
      <Panel title="Timesheets" subtitle="Hours approved by the project owner are costed (with overhead) and, for customer jobs, billed">
        <DataTable
          rows={ts}
          rowKey={(r) => r.id}
          initialSort={{ key: 'd', dir: 'desc' }}
          columns={[
            { key: 'd', header: 'Date', render: (r) => fmtDate(r.date), sort: (r) => r.date },
            { key: 'e', header: 'Employee', render: (r) => r.employee },
            { key: 'p', header: 'Phase', render: (r) => phase(r.phaseId), hideOnMobile: true },
            { key: 'h', header: 'Hours', render: (r) => r.hours, align: 'right' },
            { key: 'c', header: 'Cost', render: (r) => kes(r.hours * r.rate), align: 'right', hideOnMobile: true },
            {
              key: 's',
              header: 'Status',
              render: (r) =>
                r.status === 'SUBMITTED' ? (
                  <span className="sx-inline-form">
                    <button type="button" className="btn btn-primary btn-xs" onClick={() => pr.decideTime(r.id, true)}>
                      Approve
                    </button>
                    <button type="button" className="btn btn-secondary btn-xs" onClick={() => pr.decideTime(r.id, false)}>
                      Reject
                    </button>
                  </span>
                ) : (
                  <Pill status={r.status === 'APPROVED' ? 'POSTED' : 'REJECTED'} label={r.billed ? `Billed ${r.billed}` : r.status.toLowerCase()} />
                )
            }
          ]}
        />
        <div className="sx-inline-form sx-wrap">
          <select className="form-control" value={t.phaseId} onChange={(y) => setT({ ...t, phaseId: y.target.value })} aria-label="Time phase">
            {e.phases.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
          <input className="form-control" value={t.employee} onChange={(y) => setT({ ...t, employee: y.target.value })} aria-label="Employee" />
          <input className="form-control" type="date" value={t.date} onChange={(y) => setT({ ...t, date: y.target.value })} aria-label="Date" />
          <input className="form-control" type="number" value={t.hours} onChange={(y) => setT({ ...t, hours: y.target.value })} style={{ width: 70 }} aria-label="Hours" />
          <input className="form-control" type="number" value={t.rate} onChange={(y) => setT({ ...t, rate: y.target.value })} style={{ width: 90 }} title="Cost rate per hour" aria-label="Cost rate" />
          <input className="form-control" type="number" value={t.billRate} onChange={(y) => setT({ ...t, billRate: y.target.value })} style={{ width: 90 }} title="Bill rate per hour" aria-label="Bill rate" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => pr.logTime({ projectId: p.id, phaseId: t.phaseId, employee: t.employee, date: t.date, hours: Number(t.hours), rate: Number(t.rate), billRate: Number(t.billRate) })}>
            Log time
          </button>
        </div>
      </Panel>
      <Panel title="Expense claims" subtitle="Approved claims are posted to Finance (Dr expense, Cr accrued) as a journal for approval">
        <DataTable
          rows={ex}
          rowKey={(r) => r.id}
          columns={[
            { key: 'n', header: 'Claim', render: (r) => <b className="sx-mono">{r.number}</b> },
            { key: 'e', header: 'Employee', render: (r) => r.employee },
            { key: 'x', header: 'Description', render: (r) => `${r.description} · ${r.category.toLowerCase().replace('_', ' ')}${r.billable ? ' · billable' : ''}` },
            { key: 'a', header: 'Amount', render: (r) => kes(r.amount), align: 'right' },
            {
              key: 's',
              header: 'Status',
              render: (r) =>
                r.status === 'SUBMITTED' ? (
                  <span className="sx-inline-form">
                    <button type="button" className="btn btn-primary btn-xs" onClick={() => pr.decideExpense(r.id, true)}>
                      Approve
                    </button>
                    <button type="button" className="btn btn-secondary btn-xs" onClick={() => pr.decideExpense(r.id, false)}>
                      Reject
                    </button>
                  </span>
                ) : (
                  <Pill status={r.status === 'APPROVED' ? 'POSTED' : 'REJECTED'} label={r.journalNumber ?? r.status.toLowerCase()} />
                )
            }
          ]}
        />
        <div className="sx-inline-form sx-wrap">
          <select className="form-control" value={x.phaseId} onChange={(y) => setX({ ...x, phaseId: y.target.value })} aria-label="Expense phase">
            {e.phases.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
          <select className="form-control" value={x.category} onChange={(y) => setX({ ...x, category: y.target.value as ExpenseClaim['category'] })} aria-label="Category">
            <option value="TRAVEL">Travel</option>
            <option value="PER_DIEM">Per diem</option>
            <option value="ACCOMMODATION">Accommodation</option>
            <option value="OTHER">Other</option>
          </select>
          <input className="form-control" value={x.description} onChange={(y) => setX({ ...x, description: y.target.value })} placeholder="Description" aria-label="Expense description" />
          <input className="form-control" type="number" value={x.amount} onChange={(y) => setX({ ...x, amount: y.target.value })} placeholder="KES" style={{ width: 110 }} aria-label="Expense amount" />
          <label className="sx-check">
            <input type="checkbox" checked={x.billable} onChange={(y) => setX({ ...x, billable: y.target.checked })} /> Billable
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => pr.submitExpense({ projectId: p.id, phaseId: x.phaseId, employee: actor.name, date: TODAY, category: x.category, amount: Number(x.amount), description: x.description, billable: x.billable }).ok && setX({ ...x, amount: '', description: '' })}
          >
            Submit claim
          </button>
        </div>
      </Panel>
    </>
  );
};

/* ---------------- Materials ---------------- */

const MaterialsTab: React.FC<{ p: Project; e: ProjectExt }> = ({ p, e }) => {
  const { products, commercial } = useOperations();
  const pr = useProjects();
  const short = projectShortages(e, products, commercial.state.purchaseOrders);
  const [m, setM] = useState({ phaseId: e.phases[0]?.id ?? '', sku: '', qty: '', neededBy: addDays(TODAY, 14) });
  const [issue, setIssue] = useState<Record<string, string>>({});
  const mats = products.filter((x) => x.kind === 'MATERIAL');
  return (
    <Panel
      title="Materials plan"
      subtitle="Planned against stock and open purchase orders; shortages go to Procurement as one requisition"
      action={
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => pr.requisitionShortages(p.id)}>
          Requisition shortages
        </button>
      }
    >
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Needed by</th>
            <th style={{ textAlign: 'right' }}>Planned</th>
            <th style={{ textAlign: 'right' }}>Issued</th>
            <th style={{ textAlign: 'right' }}>Stock</th>
            <th style={{ textAlign: 'right' }}>On order</th>
            <th style={{ textAlign: 'right' }}>Short</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {short.map((x) => (
            <tr key={x.id}>
              <td>{x.name}</td>
              <td>{fmtDate(x.neededBy)}</td>
              <td style={{ textAlign: 'right' }}>{x.qty}</td>
              <td style={{ textAlign: 'right' }}>{x.issued}</td>
              <td style={{ textAlign: 'right' }}>{x.stock}</td>
              <td style={{ textAlign: 'right' }}>{x.onOrder}</td>
              <td style={{ textAlign: 'right' }} className={x.short ? 'sx-danger-text' : ''}>
                {x.short || '—'}
                {x.requisitionNumber ? ` (${x.requisitionNumber})` : ''}
              </td>
              <td>
                {x.issued < x.qty && (
                  <span className="sx-inline-form">
                    <input className="form-control" type="number" min="1" value={issue[x.id] ?? ''} onChange={(y) => setIssue({ ...issue, [x.id]: y.target.value })} style={{ width: 70 }} aria-label={`Issue ${x.name}`} />
                    <button type="button" className="btn btn-secondary btn-xs" onClick={() => pr.issueMaterial(p.id, x.id, Number(issue[x.id])).ok && setIssue({ ...issue, [x.id]: '' })}>
                      Issue
                    </button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sx-inline-form sx-wrap">
        <select className="form-control" value={m.phaseId} onChange={(y) => setM({ ...m, phaseId: y.target.value })} aria-label="Material phase">
          {e.phases.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>
        <select className="form-control" value={m.sku} onChange={(y) => setM({ ...m, sku: y.target.value })} aria-label="Material">
          <option value="">Item…</option>
          {mats.map((y) => (
            <option key={y.sku} value={y.sku}>
              {y.name}
            </option>
          ))}
        </select>
        <input className="form-control" type="number" value={m.qty} onChange={(y) => setM({ ...m, qty: y.target.value })} placeholder="Qty" style={{ width: 80 }} aria-label="Quantity" />
        <input className="form-control" type="date" value={m.neededBy} onChange={(y) => setM({ ...m, neededBy: y.target.value })} aria-label="Needed by" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => pr.saveMaterial(p.id, { ...m, qty: Number(m.qty) }).ok && setM({ ...m, sku: '', qty: '' })}>
          Plan material
        </button>
      </div>
    </Panel>
  );
};

/* ---------------- Customer orders and billing ---------------- */

const BillingTab: React.FC<{ p: Project; e: ProjectExt }> = ({ p, e }) => {
  const { commercial, finance } = useOperations();
  const pr = useProjects();
  const [order, setOrder] = useState('');
  if (e.kind !== 'CUSTOMER') return <Empty title="Internal project" text="Only customer projects carry sales orders and invoices." />;
  const unbilledTime = pr.state.timesheets.filter((t) => t.projectId === p.id && t.status === 'APPROVED' && !t.billed);
  const unbilledEx = pr.state.expenses.filter((x) => x.projectId === p.id && x.status === 'APPROVED' && x.billable && !x.billed);
  const value = unbilledTime.reduce((a, t) => a + t.hours * t.billRate, 0) + unbilledEx.reduce((a, x) => a + x.amount, 0);
  return (
    <>
      <Panel title="Customer" subtitle={finance.state.parties.find((x) => x.id === e.customerId)?.name}>
        <p className="sx-muted">Sales orders: {e.orderNumbers.join(', ') || 'none linked'}</p>
        <div className="sx-inline-form">
          <select className="form-control" value={order} onChange={(x) => setOrder(x.target.value)} aria-label="Sales order">
            <option value="">Link a sales order…</option>
            {commercial.state.orders
              .filter((o) => !e.customerId || o.customerId === e.customerId)
              .map((o) => (
                <option key={o.id} value={o.number}>
                  {o.number}
                </option>
              ))}
          </select>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => pr.linkOrder(p.id, order)}>
            Link order
          </button>
        </div>
      </Panel>
      <Panel
        title="Time & expense billing"
        subtitle={`${unbilledTime.length} approved timesheets and ${unbilledEx.length} billable expenses not yet invoiced — ${kes(value)}`}
        action={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => pr.billProject(p.id)}>
            <Receipt size={14} /> Raise invoice
          </button>
        }
      >
        <table className="sx-mini-table">
          <tbody>
            {e.invoices.map((i) => (
              <tr key={i.number}>
                <td className="sx-mono">{i.number}</td>
                <td>{fmtDate(i.date)}</td>
                <td style={{ textAlign: 'right' }}>{kes(i.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!e.invoices.length && <p className="sx-muted">No invoices yet.</p>}
      </Panel>
    </>
  );
};

/* ---------------- Investment appraisal ---------------- */

const AppraisalTab: React.FC<{ p: Project; e: ProjectExt }> = ({ p, e }) => {
  const pr = useProjects();
  const a0 = e.appraisal;
  const [a, setA] = useState({ capex: String(a0?.capex ?? p.budget), annualBenefit: String(a0?.annualBenefit ?? ''), lifeYears: String(a0?.lifeYears ?? 10), ratePct: String(a0?.ratePct ?? 14), risks: a0?.risks ?? '' });
  const [note, setNote] = useState('');
  const n = { capex: Number(a.capex), b: Number(a.annualBenefit), y: Number(a.lifeYears), r: Number(a.ratePct) };
  const v = npv(n.capex, n.b, n.y, n.r);
  const i = irr(n.capex, n.b, n.y);
  const pb = payback(n.capex, n.b);
  return (
    <>
      <div className="sx-stats">
        <Stat label="Net present value" value={kes(v, { compact: true })} icon={<TrendingUp size={17} />} tone={v >= 0 ? 'green' : 'red'} />
        <Stat label="Internal rate of return" value={i !== null ? `${i}%` : '—'} detail={`Hurdle ${n.r}%`} icon={<Target size={17} />} tone={i !== null && i >= n.r ? 'green' : 'gold'} />
        <Stat label="Payback" value={pb !== null ? `${pb} years` : '—'} icon={<Clock size={17} />} tone="blue" />
      </div>
      <Panel title="Appraisal" subtitle={a0?.decision ? `${a0.decision === 'APPROVED' ? 'Approved' : 'Rejected'} by ${a0.decidedBy}${a0.note ? ` — ${a0.note}` : ''}` : a0 ? `Submitted by ${a0.preparedBy}, waiting for a decision` : 'Not submitted'}>
        <div className="sx-grid">
          <Field label="Investment (KES)">
            <input className="form-control" type="number" value={a.capex} onChange={(x) => setA({ ...a, capex: x.target.value })} />
          </Field>
          <Field label="Yearly benefit (KES)">
            <input className="form-control" type="number" value={a.annualBenefit} onChange={(x) => setA({ ...a, annualBenefit: x.target.value })} />
          </Field>
          <Field label="Life (years)">
            <input className="form-control" type="number" value={a.lifeYears} onChange={(x) => setA({ ...a, lifeYears: x.target.value })} />
          </Field>
          <Field label="Discount rate %">
            <input className="form-control" type="number" value={a.ratePct} onChange={(x) => setA({ ...a, ratePct: x.target.value })} />
          </Field>
          <Field label="Risks and assumptions" span={4}>
            <textarea className="form-control" rows={2} value={a.risks} onChange={(x) => setA({ ...a, risks: x.target.value })} />
          </Field>
        </div>
        <div className="sx-inline-form sx-wrap">
          {!a0?.decision && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => pr.submitAppraisal(p.id, { capex: n.capex, annualBenefit: n.b, lifeYears: n.y, ratePct: n.r, risks: a.risks })}>
              Submit appraisal
            </button>
          )}
          {a0 && !a0.decision && (
            <>
              <input className="form-control" value={note} onChange={(x) => setNote(x.target.value)} placeholder="Decision note" aria-label="Decision note" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => pr.decideAppraisal(p.id, true, note)}>
                Approve
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => pr.decideAppraisal(p.id, false, note)}>
                Reject
              </button>
            </>
          )}
        </div>
      </Panel>
    </>
  );
};

/* ---------------- Close-out: certificates, capitalisation, benefits ---------------- */

const CloseTab: React.FC<{ p: Project; e: ProjectExt }> = ({ p, e }) => {
  const { actor } = useOperations();
  const pr = useProjects();
  const [summary, setSummary] = useState('');
  const [kind, setKind] = useState<'STATUS' | 'COMPLETION'>('STATUS');
  const [signing, setSigning] = useState(false);
  const [life, setLife] = useState('120');
  const [b, setB] = useState({ period: TODAY.slice(0, 7), amount: '', note: '' });
  const v = projectVariance(p, e, pr.state.costs);
  const realised = e.benefits.reduce((x, y) => x + y.amount, 0);
  return (
    <>
      <Panel title="Certificates" subtitle="Status and completion certificates, signed electronically">
        {e.certificates.map((c) => (
          <div key={c.id} className="sx-inline-form">
            <b className="sx-mono">{c.number}</b>
            <span>
              {c.kind === 'COMPLETION' ? 'Completion' : 'Status'} · {fmtDate(c.date)} · {c.summary} · signed {c.signature?.by} {c.signature?.at}
            </span>
            <PrintButton
              title={c.number}
              html={() =>
                `<h1>${c.kind === 'COMPLETION' ? 'Completion' : 'Status'} certificate ${esc(c.number)}</h1><p><b>Project:</b> ${esc(e.code)} ${esc(p.name)}</p><p><b>Date:</b> ${esc(c.date)}</p><p>${esc(c.summary)}</p><p><b>Budget:</b> ${esc(kes(p.budget))} · <b>Actual:</b> ${esc(kes(v.AC))} · <b>Progress:</b> ${Math.round((v.EV / Math.max(1, v.BAC)) * 100)}%</p><p>Signed electronically by ${esc(c.signature?.by)} on ${esc(c.signature?.at)} — “${esc(c.signature?.meaning)}”</p>`
              }
            />
          </div>
        ))}
        <div className="sx-inline-form sx-wrap">
          <select className="form-control" value={kind} onChange={(x) => setKind(x.target.value as 'STATUS' | 'COMPLETION')} aria-label="Certificate kind">
            <option value="STATUS">Status certificate</option>
            <option value="COMPLETION">Completion certificate</option>
          </select>
          <input className="form-control" value={summary} onChange={(x) => setSummary(x.target.value)} placeholder="Summary of work done" aria-label="Certificate summary" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSigning(true)}>
            <PenLine size={14} /> Sign and issue
          </button>
        </div>
      </Panel>
      {e.kind === 'INVESTMENT' && (
        <Panel title="Capitalise" subtitle={e.capitalisedAs ? `Capitalised as ${e.capitalisedAs}` : `Actual cost ${kes(v.AC)} goes to the Finance fixed asset register when the project is done`}>
          {!e.capitalisedAs && (
            <div className="sx-inline-form">
              <input className="form-control" type="number" value={life} onChange={(x) => setLife(x.target.value)} style={{ width: 110 }} aria-label="Useful life months" title="Useful life (months)" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => pr.capitalise(p.id, Number(life))}>
                Capitalise as fixed asset
              </button>
            </div>
          )}
        </Panel>
      )}
      <Panel title="Benefits realised" subtitle={e.appraisal ? `${kes(realised, { compact: true })} against ${kes(e.appraisal.annualBenefit, { compact: true })} a year expected` : kes(realised, { compact: true })}>
        <table className="sx-mini-table">
          <tbody>
            {e.benefits.map((x, i) => (
              <tr key={i}>
                <td>{x.period}</td>
                <td>{x.note}</td>
                <td style={{ textAlign: 'right' }}>{kes(x.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sx-inline-form sx-wrap">
          <input className="form-control" type="month" value={b.period} onChange={(x) => setB({ ...b, period: x.target.value })} aria-label="Benefit month" />
          <input className="form-control" type="number" value={b.amount} onChange={(x) => setB({ ...b, amount: x.target.value })} placeholder="KES" style={{ width: 120 }} aria-label="Benefit amount" />
          <input className="form-control" value={b.note} onChange={(x) => setB({ ...b, note: x.target.value })} placeholder="How it was measured" aria-label="Benefit note" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => pr.recordBenefit(p.id, b.period, Number(b.amount), b.note).ok && setB({ ...b, amount: '', note: '' })}>
            Record benefit
          </button>
        </div>
      </Panel>
      <Panel title="History">
        <Timeline items={e.history} />
      </Panel>
      {signing && <SignModal signer={actor.name} meaning={`I certify the ${kind === 'COMPLETION' ? 'completion' : 'status'} of ${e.code}`} onClose={() => setSigning(false)} onSign={(sig) => pr.issueCertificate(p.id, kind, summary, sig).ok && setSummary('')} />}
    </>
  );
};

const NoticesTab: React.FC<{ e: ProjectExt }> = ({ e }) => {
  const pr = useProjects();
  const refs = [e.code, ...pr.state.expenses.filter((x) => x.projectId === e.projectId).map((x) => x.number)];
  const all = useNotices().filter((n) => n.module === 'Projects' && refs.some((r) => [n.ref, n.subject, n.body].some((x) => x?.includes(r))));
  return all.length ? (
    <DataTable
      rows={all}
      rowKey={(n) => n.id}
      columns={[
        { key: 'a', header: 'When', render: (n) => n.at },
        { key: 'c', header: 'Channel', render: (n) => n.channel.toLowerCase() },
        { key: 't', header: 'To', render: (n) => n.to },
        { key: 's', header: 'Subject', render: (n) => n.subject }
      ]}
    />
  ) : (
    <Empty icon={<AlertTriangle size={20} />} title="No project notices yet" text="Approvals, budget overruns and certificates send notices here." />
  );
};

/* ---------------- New project ---------------- */

const NewProjectModal: React.FC<{ onClose: () => void; onSaved: (id: string) => void }> = ({ onClose, onSaved }) => {
  const { actor } = useOperations();
  const pr = useProjects();
  const [f, setF] = useState({ name: '', owner: actor.name, budget: '', start: TODAY, end: addDays(TODAY, 90), kind: 'CAPEX' as ProjectExt['kind'], scope: '', customerId: '', burdenRatePct: '30', assetCategory: 'Plant & machinery', team: '' });
  return (
    <Modal
      title="New project"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const r = pr.saveProject({
              name: f.name,
              owner: f.owner,
              budget: Number(f.budget),
              start: f.start,
              end: f.end,
              kind: f.kind,
              scope: f.scope,
              customerId: f.customerId || undefined,
              burdenRatePct: Number(f.burdenRatePct),
              assetCategory: f.kind === 'INVESTMENT' ? f.assetCategory : undefined,
              team: f.team
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)
                .map((name) => ({ name, role: 'Member', allocationPct: 50 }))
            });
            if (r.ok && r.id) onSaved(r.id);
          }}
        >
          Create project
        </button>
      }
    >
      <div className="sx-grid">
        <Field label="Name" required span={2}>
          <input className="form-control" value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} />
        </Field>
        <Field label="Type">
          <select className="form-control" value={f.kind} onChange={(x) => setF({ ...f, kind: x.target.value as ProjectExt['kind'] })}>
            {(Object.keys(KIND_LABEL) as ProjectExt['kind'][]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Budget (KES)" required>
          <input className="form-control" type="number" value={f.budget} onChange={(x) => setF({ ...f, budget: x.target.value })} />
        </Field>
        <Field label="Owner">
          <input className="form-control" value={f.owner} onChange={(x) => setF({ ...f, owner: x.target.value })} />
        </Field>
        <Field label="Start">
          <input className="form-control" type="date" value={f.start} onChange={(x) => setF({ ...f, start: x.target.value })} />
        </Field>
        <Field label="End">
          <input className="form-control" type="date" value={f.end} onChange={(x) => setF({ ...f, end: x.target.value })} />
        </Field>
        <Field label="Overhead %">
          <input className="form-control" type="number" value={f.burdenRatePct} onChange={(x) => setF({ ...f, burdenRatePct: x.target.value })} />
        </Field>
        {f.kind === 'CUSTOMER' && (
          <Field label="Customer" required span={2}>
            <PartySelect kind="CUSTOMER" value={f.customerId} onChange={(v) => setF({ ...f, customerId: v })} />
          </Field>
        )}
        <Field label="Scope" required span={4}>
          <textarea className="form-control" rows={2} value={f.scope} onChange={(x) => setF({ ...f, scope: x.target.value })} />
        </Field>
        <Field label="Team (comma separated)" span={4}>
          <input className="form-control" value={f.team} onChange={(x) => setF({ ...f, team: x.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};
