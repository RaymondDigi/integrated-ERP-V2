import React, { useState } from 'react';
import { LayoutDashboard, Wrench, CalendarClock, FolderKanban, Plus, Play, CheckCircle2, AlertTriangle, Receipt, Gauge, Hammer, Circle, Ban } from 'lucide-react';
import { useOperations, type MaintenancePage } from './store';
import { LABOUR_RATE, nextDue, pmState, woCost, WO_LABEL } from './engine';
import { addDays, daysBetween, fmtDate, kes, round2, TODAY } from '../finance/engine';
import type { WorkOrder } from './types';
import { ApprovalPanel, Chips, DataTable, DefList, Drawer, Field, FlowSteps, Hero, LinkButton, Meter, Modal, Panel, Pill, Stat, SuitePage, TodoList, greeting, type Column, type FlowAction, type TodoItem } from '../ui/kit';
import { SuiteSidebar, type SuiteNavGroup } from '../ui/SuiteSidebar';
import { PartySelect } from '../commercial/parts';
import { Crumb, OpsFooter, useFocus, useTopOnChange } from './parts';

const LABEL: Record<MaintenancePage, string> = { overview: 'Overview', workorders: 'Work orders', preventive: 'Preventive plan', projects: 'Projects' };
const W_PILL: Record<WorkOrder['status'], string> = { REQUESTED: 'SUBMITTED', APPROVED: 'APPROVED', IN_PROGRESS: 'OPEN', COMPLETED: 'POSTED', CANCELLED: 'VOID' };
const PRI_PILL: Record<WorkOrder['priority'], [string, string]> = { URGENT: ['REJECTED', 'Urgent'], HIGH: ['OVERDUE', 'High'], NORMAL: ['DRAFT', 'Normal'] };
const EQ_PILL: Record<string, [string, string]> = { RUNNING: ['POSTED', 'Running'], DOWN: ['REJECTED', 'Down'], SERVICE_DUE: ['SUBMITTED', 'Service due'] };

const MOverview: React.FC = () => {
  const { state, actor, products, setMaintenance: go } = useOperations();
  const eqName = (id: string) => state.equipment.find((e) => e.id === id)?.name ?? '';
  const open = state.workOrders.filter((w) => !['COMPLETED', 'CANCELLED'].includes(w.status));
  const down = state.equipment.filter((e) => e.status === 'DOWN');
  const done30 = state.workOrders.filter((w) => w.status === 'COMPLETED' && w.date >= addDays(TODAY, -30));
  const cost30 = round2(done30.reduce((s, w) => s + woCost(w, products), 0));
  const downtime = state.workOrders.filter((w) => w.date >= addDays(TODAY, -30)).reduce((s, w) => s + w.downtimeHours, 0);
  const pmDue = state.schedules.filter((p) => pmState(p) !== 'OK');
  const todo: TodoItem[] = [
    ...open.filter((w) => w.status === 'REQUESTED').map((w) => ({ id: w.id, tone: (w.priority === 'URGENT' ? 'critical' : 'warning') as TodoItem['tone'], icon: <Wrench size={15} />, title: `Approve ${w.number}`, detail: `${w.title} · ${eqName(w.equipmentId)}`, onClick: () => go('workorders', w.id) })),
    ...down.map((e) => ({ id: e.id, tone: 'critical' as const, icon: <AlertTriangle size={15} />, title: `${e.name} is down`, detail: `${e.area} · ${e.criticality.toLowerCase()} criticality`, onClick: () => go('workorders') })),
    ...pmDue.map((p) => ({ id: p.id, tone: (pmState(p) === 'OVERDUE' ? 'critical' : 'warning') as TodoItem['tone'], icon: <CalendarClock size={15} />, title: `${p.task}`, detail: `${eqName(p.equipmentId)} · ${pmState(p) === 'OVERDUE' ? `${Math.abs(daysBetween(TODAY, nextDue(p)))} days overdue` : `due ${fmtDate(nextDue(p))}`}`, onClick: () => go('preventive') })),
    ...state.workOrders.filter((w) => w.status === 'COMPLETED' && w.contractorCost && !w.billId).map((w) => ({ id: `b${w.id}`, tone: 'info' as const, icon: <Receipt size={15} />, title: `Bill contractor for ${w.number}`, detail: kes(w.contractorCost), onClick: () => go('workorders', w.id) }))
  ];
  const overBudget = state.projects.filter((p) => p.spent > p.budget);
  return (
    <div className="sx-page">
      <Hero
        eyebrow={`${greeting()}, ${actor.name.split(' ')[0]} · ${actor.title}`}
        title="Maintenance & projects"
        text={`${open.length} open work orders · ${down.length} asset${down.length === 1 ? '' : 's'} down · ${pmDue.length} preventive task${pmDue.length === 1 ? '' : 's'} due`}
        actions={[
          { label: 'Report a fault', icon: <Hammer size={16} />, onClick: () => go('workorders', 'new') },
          { label: 'Preventive plan', icon: <CalendarClock size={16} />, onClick: () => go('preventive') },
          { label: 'Projects', icon: <FolderKanban size={16} />, onClick: () => go('projects') }
        ]}
      />
      <div className="sx-stats">
        <Stat label="Open work orders" value={open.length} detail={`${open.filter((w) => w.priority === 'URGENT').length} urgent`} icon={<Wrench size={17} />} tone={open.some((w) => w.priority === 'URGENT') ? 'red' : 'green'} onClick={() => go('workorders')} />
        <Stat label="Downtime, 30 days" value={`${downtime} h`} detail={`${down.length} assets down now`} icon={<Gauge size={17} />} tone="gold" />
        <Stat label="Maintenance cost, 30 days" value={kes(cost30, { compact: true })} detail={`${done30.length} jobs completed`} icon={<Receipt size={17} />} tone="blue" />
        <Stat label="Preventive on time" value={`${Math.round(((state.schedules.length - pmDue.filter((p) => pmState(p) === 'OVERDUE').length) / state.schedules.length) * 100)}%`} detail={`${pmDue.length} due or overdue`} icon={<CalendarClock size={17} />} tone="violet" onClick={() => go('preventive')} />
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title={<>Needs your attention {todo.length > 0 && <span className="sx-count">{todo.length}</span>}</>} subtitle="Approvals, breakdowns, preventive tasks and contractor bills">
          <TodoList items={todo} />
        </Panel>
        <Panel title="Asset status" subtitle="Critical equipment and vehicles">
          <ul className="sx-facts">
            {state.equipment.map((e) => (
              <li key={e.id}>
                <span>{e.name}</span>
                <Pill status={EQ_PILL[e.status][0]} label={EQ_PILL[e.status][1]} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel title="Projects" subtitle={overBudget.length ? `${overBudget.length} over budget` : 'All within budget'} action={<LinkButton onClick={() => go('projects')}>All projects</LinkButton>}>
        <ul className="sx-barlist">
          {state.projects
            .filter((p) => p.status !== 'DONE')
            .map((p) => (
              <li key={p.id}>
                <div>
                  <span>{p.name}</span>
                  <b className={p.spent > p.budget ? 'sx-danger-text' : ''}>
                    {kes(p.spent, { compact: true })} of {kes(p.budget, { compact: true })}
                  </b>
                </div>
                <Meter value={p.spent / p.budget} tone={p.spent > p.budget ? 'red' : p.spent / p.budget > 0.85 ? 'gold' : 'green'} />
              </li>
            ))}
        </ul>
      </Panel>
    </div>
  );
};

/* ------------------------------------------------------------------ */

const WorkOrdersPage: React.FC = () => {
  const { state, maintenance, products } = useOperations();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'OPEN' | 'ALL' | 'COMPLETED'>('OPEN');
  useFocus(maintenance.focus, (id) => state.workOrders.some((w) => w.id === id), setOpenId, () => setAdding(true));
  const eqName = (id: string) => state.equipment.find((e) => e.id === id)?.name ?? '';
  const rows = state.workOrders.filter((w) => filter === 'ALL' || (filter === 'OPEN' ? !['COMPLETED', 'CANCELLED'].includes(w.status) : w.status === 'COMPLETED'));
  const columns: Column<WorkOrder>[] = [
    { key: 'n', header: 'Work order', render: (w) => <b className="sx-mono">{w.number}</b>, sort: (w) => w.number, width: 130 },
    {
      key: 't',
      header: 'Job',
      render: (w) => (
        <div className="sx-cell-main">
          <span>{w.title}</span>
          <small>
            {eqName(w.equipmentId)} · {w.kind.charAt(0) + w.kind.slice(1).toLowerCase()}
          </small>
        </div>
      ),
      sort: (w) => w.title
    },
    { key: 'p', header: 'Priority', render: (w) => <Pill status={PRI_PILL[w.priority][0]} label={PRI_PILL[w.priority][1]} />, sort: (w) => ['URGENT', 'HIGH', 'NORMAL'].indexOf(w.priority), hideOnMobile: true },
    { key: 'd', header: 'Due', render: (w) => <span className={w.due < TODAY && w.status !== 'COMPLETED' ? 'sx-danger-text' : ''}>{fmtDate(w.due)}</span>, sort: (w) => w.due, hideOnMobile: true },
    { key: 'c', header: 'Cost', render: (w) => (w.status === 'COMPLETED' ? kes(woCost(w, products), { compact: true }) : '—'), align: 'right', hideOnMobile: true },
    { key: 's', header: 'Status', render: (w) => <Pill status={W_PILL[w.status]} label={WO_LABEL[w.status]} />, sort: (w) => w.status }
  ];
  const open = state.workOrders.find((w) => w.id === openId);
  return (
    <SuitePage
      eyebrow="Maintenance"
      title="Work orders"
      subtitle="Urgent breakdowns go straight to the technician; other jobs wait for the Operations Manager's approval."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> New work order
        </button>
      }
    >
      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'OPEN', label: 'Open', count: state.workOrders.filter((w) => !['COMPLETED', 'CANCELLED'].includes(w.status)).length },
            { value: 'COMPLETED', label: 'Completed', count: state.workOrders.filter((w) => w.status === 'COMPLETED').length },
            { value: 'ALL', label: 'All', count: state.workOrders.length }
          ]}
        />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(w) => w.id} onRowClick={(w) => setOpenId(w.id)} selected={openId} initialSort={{ key: 'n', dir: 'desc' }} />
      {open && <WorkOrderDrawer w={open} onClose={() => setOpenId(null)} />}
      {adding && (
        <RaiseModal
          onClose={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false);
            setOpenId(id);
          }}
        />
      )}
    </SuitePage>
  );
};

const WorkOrderDrawer: React.FC<{ w: WorkOrder; onClose: () => void }> = ({ w, onClose }) => {
  const { state, actor, products, pname, approveWorkOrder, startWorkOrder, billContractor, commercial } = useOperations();
  const [completing, setCompleting] = useState(false);
  const [inv, setInv] = useState('');
  const eq = state.equipment.find((e) => e.id === w.equipmentId)!;
  const at = { REQUESTED: 0, APPROVED: 1, IN_PROGRESS: 2, COMPLETED: 4, CANCELLED: 0 }[w.status];
  const actions: FlowAction[] = [];
  if (w.status === 'REQUESTED') actions.push({ label: 'Approve', icon: <CheckCircle2 size={14} />, onClick: () => approveWorkOrder(w.id), title: actor.role !== 'MANAGER' ? 'The Operations Manager approves work orders' : undefined });
  if (w.status === 'APPROVED') actions.push({ label: 'Start work', icon: <Play size={14} />, onClick: () => startWorkOrder(w.id) });
  if (w.status === 'IN_PROGRESS') actions.push({ label: 'Complete job', icon: <CheckCircle2 size={14} />, onClick: () => setCompleting(true) });
  return (
    <>
      <Drawer wide title={w.number} subtitle={`${eq.name} · ${eq.area}`} badge={<Pill status={W_PILL[w.status]} label={WO_LABEL[w.status]} />} onClose={onClose}>
        <div className="sx-amount-hero">
          <div>
            <span>{w.status === 'COMPLETED' ? 'Total cost' : 'Job'}</span>
            <strong>{w.status === 'COMPLETED' ? kes(woCost(w, products)) : w.title}</strong>
          </div>
          <div>
            <span>Due</span>
            <b className={w.due < TODAY && w.status !== 'COMPLETED' ? 'sx-danger-text' : ''}>{fmtDate(w.due)}</b>
          </div>
        </div>
        <DefList
          items={[
            ['Type', w.kind.charAt(0) + w.kind.slice(1).toLowerCase()],
            ['Priority', PRI_PILL[w.priority][1]],
            ['Requested by', w.requestedBy],
            ['Assigned to', w.assignedTo],
            ['Equipment status', EQ_PILL[eq.status][1]],
            ['Downtime', `${w.downtimeHours} h`]
          ]}
        />
        {w.notes && <p className="sx-note">{w.notes}</p>}
        {w.status === 'COMPLETED' && (
          <table className="sx-mini-table">
            <tbody>
              <tr>
                <td>Labour — {w.hours} h at {kes(LABOUR_RATE)}</td>
                <td style={{ textAlign: 'right' }}>{(w.hours * LABOUR_RATE).toLocaleString()}</td>
              </tr>
              {w.parts.map((p) => (
                <tr key={p.sku}>
                  <td>
                    {p.qty} × {pname(p.sku)}
                  </td>
                  <td style={{ textAlign: 'right' }}>{(p.qty * (products.find((x) => x.sku === p.sku)?.cost ?? 0)).toLocaleString()}</td>
                </tr>
              ))}
              {w.contractorCost > 0 && (
                <tr>
                  <td>Contractor — {commercial.party(w.contractorId ?? '')?.name}</td>
                  <td style={{ textAlign: 'right' }}>{w.contractorCost.toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {w.status === 'COMPLETED' && w.contractorCost > 0 && (
          <div className={`sx-callout ${w.billId ? 'success' : 'info'}`}>
            <Receipt size={16} />
            <div>
              <b>{w.billId ? `Billed — ${w.billNumber}` : 'Contractor invoice'}</b>
              {!w.billId && (
                <div className="sx-inline-form">
                  <input className="form-control" value={inv} onChange={(e) => setInv(e.target.value)} placeholder="Contractor's invoice number" />
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => billContractor(w.id, inv)}>
                    Raise bill in Finance
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        <h4 className="sx-subhead">Progress</h4>
        <ApprovalPanel
          steps={<FlowSteps steps={['Requested', 'Approved', 'In progress', 'Done']} at={at} off={w.status === 'CANCELLED'} />}
          actions={actions}
          actorLine={
            <>
              You are acting as <b>{actor.name}</b> ({actor.title}).
            </>
          }
          history={w.history}
        />
      </Drawer>
      {completing && <CompleteModal w={w} onClose={() => setCompleting(false)} />}
    </>
  );
};

const CompleteModal: React.FC<{ w: WorkOrder; onClose: () => void }> = ({ w, onClose }) => {
  const { products, completeWorkOrder } = useOperations();
  const spares = products.filter((p) => p.kind === 'MATERIAL' && (p.category === 'Spares' || p.category === 'Office' || p.category === 'Packaging'));
  const [hours, setHours] = useState(2);
  const [parts, setParts] = useState<{ sku: string; qty: number }[]>([]);
  const [contractorId, setContractor] = useState(w.contractorId ?? '');
  const [contractorCost, setCost] = useState(0);
  const [downtimeHours, setDown] = useState(w.downtimeHours);
  const [notes, setNotes] = useState('');
  const cost = round2(hours * LABOUR_RATE + parts.reduce((s, p) => s + p.qty * (products.find((x) => x.sku === p.sku)?.cost ?? 0), 0) + contractorCost);
  return (
    <Modal
      size="lg"
      title={`Complete ${w.number}`}
      subtitle="Spares used are taken out of stock; the equipment goes back into service"
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">
            Job cost <b>{kes(cost)}</b>
          </span>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => completeWorkOrder(w.id, { hours, parts, contractorCost, contractorId: contractorId || undefined, downtimeHours, notes }).ok && onClose()}>
            <CheckCircle2 size={14} /> Complete job
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Labour hours">
          <input className="form-control" type="number" min="0" value={hours} onChange={(e) => setHours(Number(e.target.value))} />
        </Field>
        <Field label="Downtime hours">
          <input className="form-control" type="number" min="0" value={downtimeHours} onChange={(e) => setDown(Number(e.target.value))} />
        </Field>
        <Field label="Contractor (optional)" span={2}>
          <PartySelect kind="SUPPLIER" value={contractorId} onChange={setContractor} />
        </Field>
        {contractorId && (
          <Field label="Contractor cost (KES, before VAT)" span={2}>
            <input className="form-control" type="number" min="0" value={contractorCost || ''} onChange={(e) => setCost(Number(e.target.value))} />
          </Field>
        )}
        <Field label="What was done" required span={4}>
          <textarea className="form-control" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <h4 className="sx-subhead">Spares used</h4>
      {parts.map((p, i) => (
        <div key={i} className="sx-inline-form">
          <select className="form-control" value={p.sku} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))}>
            <option value="">Choose…</option>
            {spares.map((s) => (
              <option key={s.sku} value={s.sku}>
                {s.name} ({s.stock} in stock)
              </option>
            ))}
          </select>
          <input className="form-control" type="number" min="1" value={p.qty} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} style={{ width: 90 }} />
          <button type="button" className="sx-icon-btn" onClick={() => setParts(parts.filter((_, j) => j !== i))} aria-label="Remove">
            <Ban size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParts([...parts, { sku: '', qty: 1 }])}>
        <Plus size={14} /> Add a spare part
      </button>
    </Modal>
  );
};

const RaiseModal: React.FC<{ onClose: () => void; onSaved: (id: string) => void }> = ({ onClose, onSaved }) => {
  const { state, raiseWorkOrder } = useOperations();
  const [f, setF] = useState({ equipmentId: '', title: '', kind: 'BREAKDOWN' as WorkOrder['kind'], priority: 'HIGH' as WorkOrder['priority'], due: addDays(TODAY, 2), notes: '' });
  return (
    <Modal
      size="lg"
      title="New work order"
      subtitle="Urgent breakdowns are approved automatically and the equipment is marked down"
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const r = raiseWorkOrder(f);
              if (r.ok && r.id) onSaved(r.id);
            }}
          >
            Raise work order
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Equipment" required span={2}>
          <select className="form-control" value={f.equipmentId} onChange={(e) => setF({ ...f, equipmentId: e.target.value })}>
            <option value="">Choose…</option>
            {state.equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.area}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select className="form-control" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as WorkOrder['kind'] })}>
            {['BREAKDOWN', 'PREVENTIVE', 'INSPECTION', 'IMPROVEMENT'].map((k) => (
              <option key={k} value={k}>
                {k.charAt(0) + k.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select className="form-control" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as WorkOrder['priority'] })}>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="NORMAL">Normal</option>
          </select>
        </Field>
        <Field label="What is wrong / what is needed" required span={3}>
          <input className="form-control" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="Due">
          <input className="form-control" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
        </Field>
        <Field label="Notes" span={4}>
          <textarea className="form-control" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */

const PreventivePage: React.FC = () => {
  const { state, scheduleNow, setMaintenance } = useOperations();
  const eqName = (id: string) => state.equipment.find((e) => e.id === id)?.name ?? '';
  const sorted = [...state.schedules].sort((a, b) => nextDue(a).localeCompare(nextDue(b)));
  return (
    <SuitePage eyebrow="Maintenance" title="Preventive plan" subtitle="Routine tasks on a fixed interval. Completing the work order moves the next due date on automatically.">
      <div className="sx-table-wrap">
        <div className="sx-table-scroll">
          <table className="sx-table">
            <thead>
              <tr>
                <th>Task</th>
                <th className="sx-hide-sm">Every</th>
                <th className="sx-hide-sm">Last done</th>
                <th>Next due</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const st = pmState(p);
                const openWo = state.workOrders.find((w) => w.scheduleId === p.id && !['COMPLETED', 'CANCELLED'].includes(w.status));
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="sx-cell-main">
                        <span>{p.task}</span>
                        <small>
                          {eqName(p.equipmentId)} · {p.assignedTo}
                        </small>
                      </div>
                    </td>
                    <td className="sx-hide-sm">{p.everyDays} days</td>
                    <td className="sx-hide-sm">{fmtDate(p.lastDone)}</td>
                    <td className={st === 'OVERDUE' ? 'sx-danger-text' : ''}>{fmtDate(nextDue(p))}</td>
                    <td>{st === 'OVERDUE' ? <Pill status="REJECTED" label={`${Math.abs(daysBetween(TODAY, nextDue(p)))} d overdue`} /> : st === 'DUE' ? <Pill status="SUBMITTED" label="Due soon" /> : <Pill status="POSTED" label="On schedule" />}</td>
                    <td style={{ textAlign: 'right' }}>
                      {openWo ? (
                        <button type="button" className="sx-link" onClick={() => setMaintenance('workorders', openWo.id)}>
                          {openWo.number}
                        </button>
                      ) : (
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => scheduleNow(p.id)}>
                          <Plus size={12} /> Work order
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </SuitePage>
  );
};

const ProjectsPage: React.FC = () => {
  const { state, toggleMilestone, recordSpend } = useOperations();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  return (
    <SuitePage eyebrow="Projects" title="Capital projects" subtitle="Budget against spend and milestone progress for each improvement project.">
      <div className="sx-stats">
        <Stat label="Active projects" value={state.projects.filter((p) => p.status === 'ACTIVE').length} icon={<FolderKanban size={17} />} />
        <Stat label="Total budget" value={kes(state.projects.reduce((s, p) => s + p.budget, 0), { compact: true })} icon={<Receipt size={17} />} tone="blue" />
        <Stat label="Spent" value={kes(state.projects.reduce((s, p) => s + p.spent, 0), { compact: true })} icon={<Receipt size={17} />} tone="gold" />
        <Stat label="Over budget" value={state.projects.filter((p) => p.spent > p.budget).length} icon={<AlertTriangle size={17} />} tone="red" />
      </div>
      <div className="sx-row">
        {state.projects.map((p) => {
          const doneM = p.milestones.filter((m) => m.done).length;
          return (
            <Panel key={p.id} title={p.name} subtitle={`${p.owner} · ${fmtDate(p.start)} – ${fmtDate(p.end)}`} action={<Pill status={{ PLANNING: 'DRAFT', ACTIVE: 'OPEN', ON_HOLD: 'SUBMITTED', DONE: 'POSTED' }[p.status]} label={p.status.charAt(0) + p.status.slice(1).toLowerCase().replace('_', ' ')} />}>
              <ul className="sx-facts">
                <li>
                  <span>Budget</span>
                  <b>{kes(p.budget, { compact: true })}</b>
                </li>
                <li>
                  <span>Spent</span>
                  <b className={p.spent > p.budget ? 'sx-danger-text' : ''}>
                    {kes(p.spent, { compact: true })} ({Math.round((p.spent / p.budget) * 100)}%)
                  </b>
                </li>
              </ul>
              <Meter value={p.spent / p.budget} tone={p.spent > p.budget ? 'red' : 'green'} />
              <h4 className="sx-subhead">
                Milestones · {doneM}/{p.milestones.length}
              </h4>
              <ul className="sx-checklist">
                {p.milestones.map((m, i) => (
                  <li key={m.name} className={m.done ? 'done' : ''}>
                    <button type="button" className="sx-check-icon" onClick={() => toggleMilestone(p.id, i)} aria-label={`Toggle ${m.name}`}>
                      {m.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </button>
                    <div>
                      <b>{m.name}</b>
                      <small className={!m.done && m.due < TODAY ? 'sx-danger-text' : ''}>{fmtDate(m.due)}</small>
                    </div>
                  </li>
                ))}
              </ul>
              {p.status !== 'DONE' && (
                <div className="sx-inline-form">
                  <input className="form-control" type="number" placeholder="Record spend (KES)" value={amounts[p.id] ?? ''} onChange={(e) => setAmounts({ ...amounts, [p.id]: e.target.value })} />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (recordSpend(p.id, Number(amounts[p.id])).ok) setAmounts({ ...amounts, [p.id]: '' });
                    }}
                  >
                    Add
                  </button>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </SuitePage>
  );
};

export const MaintenanceSidebar: React.FC = () => {
  const { state, maintenance, setMaintenance } = useOperations();
  const groups: SuiteNavGroup<MaintenancePage>[] = [
    { label: 'Maintenance', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
    {
      label: 'Keep running',
      items: [
        { id: 'workorders', label: 'Work orders', icon: Wrench, badge: state.workOrders.filter((w) => w.status === 'REQUESTED').length },
        { id: 'preventive', label: 'Preventive plan', icon: CalendarClock, badge: state.schedules.filter((p) => pmState(p) === 'OVERDUE').length, badgeTone: 'critical' }
      ]
    },
    { label: 'Improve', items: [{ id: 'projects', label: 'Projects', icon: FolderKanban }] }
  ];
  return <SuiteSidebar name="Maintenance & Projects" tagline="Fix · prevent · improve" icon={Wrench} groups={groups} active={maintenance.page} onSelect={(p) => setMaintenance(p)} footer={<OpsFooter />} />;
};
export const MaintenanceCrumb: React.FC = () => {
  const { maintenance, setMaintenance } = useOperations();
  return <Crumb name="Maintenance & Projects" page={maintenance.page} label={LABEL[maintenance.page]} onHome={() => setMaintenance('overview')} />;
};
export const MaintenanceSuite: React.FC = () => {
  const { maintenance } = useOperations();
  useTopOnChange(maintenance.page);
  return (
    <div className="sx-suite" key={maintenance.page}>
      {maintenance.page === 'overview' && <MOverview />}
      {maintenance.page === 'workorders' && <WorkOrdersPage />}
      {maintenance.page === 'preventive' && <PreventivePage />}
      {maintenance.page === 'projects' && <ProjectsPage />}
    </div>
  );
};
