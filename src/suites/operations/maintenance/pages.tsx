import React, { useState } from 'react';
import { Bell, Users, Boxes, Ruler, Recycle, ClipboardList, BarChart3, Zap, Target, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useOperations, type MaintenancePage } from '../store';
import { addDays, fmtDate, TODAY } from '../../finance/engine';
import type { OperationsState, WorkOrder } from '../types';
import { Chips, DataTable, DefList, Drawer, Empty, Field, Modal, Pill, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import type { SuiteNavGroup } from '../../ui/SuiteSidebar';
import { useFocus } from '../parts';
import { useMaintenanceExt } from './store';
import { isOpenWo, labourLoad, plannedOutages, weekDays, calibrationDue } from './engine';
import type { JobTemplate, MaintenanceExtState, MaintExtPage, MaintNotification } from './types';
import { EquipmentPage, CalibrationPage, RefurbishPage } from './equipmentPages';
import { ReportsPage, EnergyPage } from './reportPages';
import { ProjectControlPage } from './controlPage';

export const MAINT_EXT_LABEL: Record<MaintExtPage, string> = {
  notifications: 'Requests & notices',
  schedule: 'Labour schedule',
  equipment: 'Equipment register',
  calibration: 'Calibration',
  refurbish: 'Repairable spares',
  templates: 'Job templates',
  reports: 'Reports & KPIs',
  energy: 'Energy',
  control: 'Project control'
};

export const MAINT_EXT_GROUPS = (s: OperationsState, x: MaintenanceExtState): SuiteNavGroup<MaintenancePage>[] => [
  {
    label: 'Keep running',
    items: [
      { id: 'notifications', label: MAINT_EXT_LABEL.notifications, icon: Bell, badge: x.notifications.filter((n) => n.status === 'OPEN').length },
      { id: 'schedule', label: MAINT_EXT_LABEL.schedule, icon: Users },
      { id: 'templates', label: MAINT_EXT_LABEL.templates, icon: ClipboardList }
    ]
  },
  {
    label: 'Assets',
    items: [
      { id: 'equipment', label: MAINT_EXT_LABEL.equipment, icon: Boxes, badge: s.equipment.filter((e) => e.status === 'DOWN').length, badgeTone: 'critical' },
      { id: 'calibration', label: MAINT_EXT_LABEL.calibration, icon: Ruler, badge: s.equipment.filter((e) => { const d = calibrationDue(e); return !!d && d < TODAY; }).length, badgeTone: 'critical' },
      { id: 'refurbish', label: MAINT_EXT_LABEL.refurbish, icon: Recycle, badge: x.rotables.filter((r) => r.status === 'CORE_DUE').length }
    ]
  },
  {
    label: 'Improve',
    items: [
      { id: 'control', label: MAINT_EXT_LABEL.control, icon: Target },
      { id: 'reports', label: MAINT_EXT_LABEL.reports, icon: BarChart3 },
      { id: 'energy', label: MAINT_EXT_LABEL.energy, icon: Zap }
    ]
  }
];

export const MaintExtPages: React.FC<{ page: MaintenancePage }> = ({ page }) => (
  <>
    {page === 'notifications' && <NotificationsPage />}
    {page === 'schedule' && <SchedulePage />}
    {page === 'equipment' && <EquipmentPage />}
    {page === 'calibration' && <CalibrationPage />}
    {page === 'refurbish' && <RefurbishPage />}
    {page === 'templates' && <TemplatesPage />}
    {page === 'reports' && <ReportsPage />}
    {page === 'energy' && <EnergyPage />}
    {page === 'control' && <ProjectControlPage />}
  </>
);

/* ------------------------------------------------------------------ */
/* Maintenance requests and system notices                             */
/* ------------------------------------------------------------------ */

const TRIGGER: Record<MaintNotification['trigger'], string> = { USER: 'Reported', PM: 'Preventive due', METER: 'Meter reading', VEHICLE: 'Vehicle service', PREDICTIVE: 'Condition trend', CALIBRATION: 'Calibration due' };
const N_PILL: Record<MaintNotification['status'], string> = { OPEN: 'SUBMITTED', CONVERTED: 'POSTED', REJECTED: 'REJECTED' };

const NotificationsPage: React.FC = () => {
  const { state, maintenance, setMaintenance } = useOperations();
  const mx = useMaintenanceExt();
  const [filter, setFilter] = useState<'OPEN' | 'ALL'>('OPEN');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useFocus(maintenance.focus, (id) => mx.state.notifications.some((n) => n.id === id), setOpenId, () => setAdding(true));
  const eqName = (id: string) => state.equipment.find((e) => e.id === id)?.name ?? id;
  const rows = mx.state.notifications.filter((n) => filter === 'ALL' || n.status === 'OPEN');
  const columns: Column<MaintNotification>[] = [
    { key: 'n', header: 'Notice', render: (n) => <b className="sx-mono">{n.number}</b>, sort: (n) => n.number, width: 130 },
    {
      key: 'd',
      header: 'Request',
      render: (n) => (
        <div className="sx-cell-main">
          <span>{n.description}</span>
          <small>
            {eqName(n.equipmentId)} · {TRIGGER[n.trigger]} · {n.raisedBy}
          </small>
        </div>
      )
    },
    { key: 'p', header: 'Priority', render: (n) => <Pill status={n.priority === 'URGENT' ? 'REJECTED' : n.priority === 'HIGH' ? 'OVERDUE' : 'DRAFT'} label={n.priority.charAt(0) + n.priority.slice(1).toLowerCase()} />, hideOnMobile: true },
    { key: 'dt', header: 'Raised', render: (n) => fmtDate(n.date), sort: (n) => n.date, hideOnMobile: true },
    { key: 's', header: 'Status', render: (n) => <Pill status={N_PILL[n.status]} label={n.status === 'CONVERTED' ? n.woNumber ?? 'Converted' : n.status.charAt(0) + n.status.slice(1).toLowerCase()} /> }
  ];
  const sel = mx.state.notifications.find((n) => n.id === openId);
  return (
    <SuitePage
      eyebrow="Maintenance"
      title="Requests & notices"
      subtitle="Faults reported by staff and notices the system raises from preventive dates, meter readings, vehicle services, calibration and condition trends. The planner turns each into a work order or rejects it."
      actions={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => mx.syncSystem()}>
            <RefreshCw size={14} /> Check for due work
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={15} /> Report a fault
          </button>
        </>
      }
    >
      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'OPEN', label: 'Open', count: mx.state.notifications.filter((n) => n.status === 'OPEN').length },
            { value: 'ALL', label: 'All', count: mx.state.notifications.length }
          ]}
        />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(n) => n.id} onRowClick={(n) => setOpenId(n.id)} selected={openId} initialSort={{ key: 'n', dir: 'desc' }} empty="No open requests" />
      {sel && <NotificationDrawer n={sel} onClose={() => setOpenId(null)} onWo={(id) => setMaintenance('workorders', id)} />}
      {adding && <FaultModal onClose={() => setAdding(false)} />}
    </SuitePage>
  );
};

const NotificationDrawer: React.FC<{ n: MaintNotification; onClose: () => void; onWo: (id: string) => void }> = ({ n, onClose, onWo }) => {
  const { state } = useOperations();
  const mx = useMaintenanceExt();
  const eq = state.equipment.find((e) => e.id === n.equipmentId);
  const [kind, setKind] = useState<WorkOrder['kind']>(n.trigger === 'CALIBRATION' ? 'CALIBRATION' : n.trigger === 'PM' || n.trigger === 'METER' || n.trigger === 'VEHICLE' ? 'PREVENTIVE' : n.trigger === 'PREDICTIVE' ? 'INSPECTION' : 'BREAKDOWN');
  const [templateId, setTemplate] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Drawer title={n.number} subtitle={`${eq?.name} · ${eq?.area}`} badge={<Pill status={N_PILL[n.status]} label={n.status.toLowerCase()} />} onClose={onClose}>
      <p className="sx-note">{n.description}</p>
      <DefList
        items={[
          ['Source', n.source === 'SYSTEM' ? `System — ${TRIGGER[n.trigger]}` : `Reported by ${n.raisedBy}`],
          ['Priority', n.priority.toLowerCase()],
          ['Raised', fmtDate(n.date)],
          ['Work order', n.woNumber ? <button key="w" type="button" className="sx-link" onClick={() => onWo(n.woId!)}>{n.woNumber}</button> : '—'],
          ['Reason', n.reason ?? '—']
        ]}
      />
      {n.status === 'OPEN' && (
        <>
          <h4 className="sx-subhead">Turn into a work order</h4>
          <div className="sx-inline-form sx-wrap">
            <select className="form-control" value={kind} onChange={(e) => setKind(e.target.value as WorkOrder['kind'])} aria-label="Work order type">
              {['BREAKDOWN', 'PREVENTIVE', 'INSPECTION', 'IMPROVEMENT', 'CALIBRATION'].map((k) => (
                <option key={k} value={k}>
                  {k.charAt(0) + k.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <select className="form-control" value={templateId} onChange={(e) => setTemplate(e.target.value)} aria-label="Job template">
              <option value="">No template</option>
              {mx.state.templates
                .filter((t) => !eq?.type || t.equipmentType === eq.type)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => mx.convertNotification(n.id, kind, templateId || undefined).ok && onClose()}>
              Create work order
            </button>
          </div>
          <h4 className="sx-subhead">Or reject</h4>
          <div className="sx-inline-form">
            <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why no work is needed" aria-label="Rejection reason" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => mx.rejectNotification(n.id, reason).ok && onClose()}>
              Reject
            </button>
          </div>
        </>
      )}
      <h4 className="sx-subhead">History</h4>
      <Timeline items={n.history} />
    </Drawer>
  );
};

const FaultModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state } = useOperations();
  const mx = useMaintenanceExt();
  const [f, setF] = useState({ equipmentId: '', description: '', priority: 'HIGH' as MaintNotification['priority'] });
  return (
    <Modal
      size="md"
      title="Report a fault"
      subtitle="The maintenance planner reviews it and raises a work order"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => mx.raiseNotification(f.equipmentId, f.description, f.priority).ok && onClose()}>
          Send request
        </button>
      }
    >
      <div className="sx-grid sx-grid-2">
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
        <Field label="What is wrong" required span={2}>
          <textarea className="form-control" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Priority">
          <select className="form-control" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as MaintNotification['priority'] })}>
            <option value="URGENT">Urgent — machine stopped</option>
            <option value="HIGH">High</option>
            <option value="NORMAL">Normal</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Labour schedule                                                     */
/* ------------------------------------------------------------------ */

const SchedulePage: React.FC = () => {
  const { state, setMaintenance } = useOperations();
  const mx = useMaintenanceExt();
  const [from, setFrom] = useState(TODAY);
  const days = weekDays(from, 7);
  const backlog = state.workOrders.filter((w) => isOpenWo(w) && (!w.plannedStart || !w.technicianId));
  const outages = plannedOutages(state, 14);
  const [pick, setPick] = useState<Record<string, { tech: string; date: string; hours: number; down: number }>>({});
  const eqName = (id: string) => state.equipment.find((e) => e.id === id)?.name ?? id;
  return (
    <SuitePage eyebrow="Maintenance" title="Labour schedule" subtitle="Technician hours booked per day against capacity, the backlog still to plan and the machine stops planned on production lines.">
      <div className="sx-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFrom(addDays(from, -7))}>
          Previous week
        </button>
        <b>
          {fmtDate(days[0])} – {fmtDate(days[6])}
        </b>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFrom(addDays(from, 7))}>
          Next week
        </button>
      </div>
      <div className="sx-table-wrap">
        <div className="sx-table-scroll">
          <table className="sx-table">
            <thead>
              <tr>
                <th>Technician</th>
                {days.map((d) => (
                  <th key={d} style={{ textAlign: 'center' }}>
                    {new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mx.state.technicians.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="sx-cell-main">
                      <span>{t.name}</span>
                      <small>
                        {t.trade} · {t.hoursPerDay} h/day{t.external ? ' · contractor' : ''}
                      </small>
                    </div>
                  </td>
                  {days.map((d) => {
                    const l = labourLoad(state.workOrders, mx.state.technicians, d).find((x) => x.tech.id === t.id)!;
                    return (
                      <td key={d} style={{ textAlign: 'center' }} className={l.over ? 'sx-danger-text' : ''} title={l.jobs.map((j) => `${j.number} ${j.title}`).join('\n')}>
                        {l.hours ? (
                          <button type="button" className="sx-link" onClick={() => setMaintenance('workorders', l.jobs[0].id)}>
                            {l.hours}/{l.capacity} h
                          </button>
                        ) : (
                          <span className="sx-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <h4 className="sx-subhead">Backlog to plan ({backlog.length})</h4>
      {backlog.length === 0 ? (
        <Empty title="Everything is planned" />
      ) : (
        <div className="sx-table-wrap">
          <div className="sx-table-scroll">
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Work order</th>
                  <th>Technician</th>
                  <th>Date</th>
                  <th>Hours</th>
                  <th>Stop (h)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {backlog.map((w) => {
                  const p = pick[w.id] ?? { tech: w.technicianId ?? '', date: w.plannedStart ?? TODAY, hours: w.estHours ?? 2, down: w.plannedDowntimeHours ?? 0 };
                  const set = (patch: Partial<typeof p>) => setPick({ ...pick, [w.id]: { ...p, ...patch } });
                  return (
                    <tr key={w.id}>
                      <td>
                        <div className="sx-cell-main">
                          <button type="button" className="sx-link" onClick={() => setMaintenance('workorders', w.id)}>
                            {w.number}
                          </button>
                          <small>
                            {w.title} · {eqName(w.equipmentId)}
                          </small>
                        </div>
                      </td>
                      <td>
                        <select className="form-control" value={p.tech} onChange={(e) => set({ tech: e.target.value })} aria-label={`Technician for ${w.number}`}>
                          <option value="">Choose…</option>
                          {mx.state.technicians.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input className="form-control" type="date" value={p.date} onChange={(e) => set({ date: e.target.value })} aria-label="Date" />
                      </td>
                      <td>
                        <input className="form-control" type="number" min="0" step="0.5" value={p.hours} onChange={(e) => set({ hours: Number(e.target.value) })} style={{ width: 80 }} aria-label="Hours" />
                      </td>
                      <td>
                        <input className="form-control" type="number" min="0" value={p.down} onChange={(e) => set({ down: Number(e.target.value) })} style={{ width: 70 }} aria-label="Downtime" />
                      </td>
                      <td>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => mx.scheduleJob(w.id, p.tech, p.date, p.hours, p.down)}>
                          Schedule
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <h4 className="sx-subhead">Planned production stops — next 14 days</h4>
      {outages.length === 0 ? (
        <p className="sx-muted">No planned machine stops on production lines.</p>
      ) : (
        <ul className="sx-facts">
          {outages.map((o) => (
            <li key={o.w.id}>
              <span>
                {fmtDate(o.w.plannedStart!)} · {o.eq?.productionLine} · {o.eq?.name}
              </span>
              <b>
                {o.w.plannedDowntimeHours} h — {o.w.number}
              </b>
            </li>
          ))}
        </ul>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Job templates                                                       */
/* ------------------------------------------------------------------ */

const blankTemplate = (): JobTemplate => ({ id: '', name: '', equipmentType: '', steps: [{ text: '' }], estHours: 2, parts: [], requiresPermit: false });

const TemplatesPage: React.FC = () => {
  const { state, pname, products } = useOperations();
  const mx = useMaintenanceExt();
  const spares = products.filter((p) => p.kind === 'MATERIAL' && p.category === 'Spares');
  const [edit, setEdit] = useState<JobTemplate | null>(null);
  const types = [...new Set(state.equipment.map((e) => e.type).filter(Boolean))] as string[];
  return (
    <SuitePage
      eyebrow="Maintenance"
      title="Job templates"
      subtitle="Standard jobs by equipment type: the steps (safety steps marked), hours, spares and whether a permit to work is needed. Picking a template copies it onto the work order."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit(blankTemplate())}>
          <Plus size={15} /> New template
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Templates" value={mx.state.templates.length} icon={<ClipboardList size={17} />} />
        <Stat label="Need a permit" value={mx.state.templates.filter((t) => t.requiresPermit).length} icon={<ClipboardList size={17} />} tone="red" />
      </div>
      <DataTable
        rows={mx.state.templates}
        rowKey={(t) => t.id}
        onRowClick={(t) => setEdit({ ...t, steps: t.steps.map((s) => ({ ...s })), parts: t.parts.map((p) => ({ ...p })) })}
        columns={[
          { key: 'n', header: 'Template', render: (t) => <b>{t.name}</b>, sort: (t) => t.name },
          { key: 't', header: 'Equipment type', render: (t) => t.equipmentType, sort: (t) => t.equipmentType },
          { key: 's', header: 'Steps', render: (t) => t.steps.length, align: 'right' },
          { key: 'h', header: 'Hours', render: (t) => t.estHours, align: 'right' },
          { key: 'p', header: 'Spares', render: (t) => t.parts.map((p) => `${p.qty} × ${pname(p.sku)}`).join(', ') || '—', hideOnMobile: true },
          { key: 'pm', header: 'Permit', render: (t) => (t.requiresPermit ? <Pill status="OVERDUE" label="Required" /> : '—') }
        ]}
      />
      {edit && (
        <Modal
          title={edit.id ? `Edit ${edit.name}` : 'New job template'}
          onClose={() => setEdit(null)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => mx.saveTemplate(edit).ok && setEdit(null)}>
              Save template
            </button>
          }
        >
          <div className="sx-grid">
            <Field label="Name" required span={2}>
              <input className="form-control" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Equipment type" required>
              <input className="form-control" list="eq-types" value={edit.equipmentType} onChange={(e) => setEdit({ ...edit, equipmentType: e.target.value })} />
              <datalist id="eq-types">
                {types.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Estimated hours">
              <input className="form-control" type="number" min="0" step="0.5" value={edit.estHours} onChange={(e) => setEdit({ ...edit, estHours: Number(e.target.value) })} />
            </Field>
            <Field label="Permit to work" span={2}>
              <select className="form-control" value={edit.requiresPermit ? 'Y' : 'N'} onChange={(e) => setEdit({ ...edit, requiresPermit: e.target.value === 'Y' })}>
                <option value="N">Not needed</option>
                <option value="Y">Required before work starts</option>
              </select>
            </Field>
          </div>
          <h4 className="sx-subhead">Steps</h4>
          {edit.steps.map((s, i) => (
            <div key={i} className="sx-inline-form">
              <input className="form-control" value={s.text} onChange={(e) => setEdit({ ...edit, steps: edit.steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} placeholder={`Step ${i + 1}`} aria-label={`Step ${i + 1}`} />
              <label className="sx-check">
                <input type="checkbox" checked={!!s.safety} onChange={(e) => setEdit({ ...edit, steps: edit.steps.map((x, j) => (j === i ? { ...x, safety: e.target.checked } : x)) })} /> Safety
              </label>
              <button type="button" className="sx-icon-btn" onClick={() => setEdit({ ...edit, steps: edit.steps.filter((_, j) => j !== i) })} aria-label="Remove step">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...edit, steps: [...edit.steps, { text: '' }] })}>
            <Plus size={14} /> Add step
          </button>
          <h4 className="sx-subhead">Spares</h4>
          {edit.parts.map((p, i) => (
            <div key={i} className="sx-inline-form">
              <select className="form-control" value={p.sku} onChange={(e) => setEdit({ ...edit, parts: edit.parts.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)) })} aria-label="Spare">
                <option value="">Choose…</option>
                {spares.map((x) => (
                    <option key={x.sku} value={x.sku}>
                      {x.name}
                    </option>
                  ))}
              </select>
              <input className="form-control" type="number" min="1" value={p.qty} onChange={(e) => setEdit({ ...edit, parts: edit.parts.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)) })} style={{ width: 80 }} aria-label="Quantity" />
              <button type="button" className="sx-icon-btn" onClick={() => setEdit({ ...edit, parts: edit.parts.filter((_, j) => j !== i) })} aria-label="Remove spare">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...edit, parts: [...edit.parts, { sku: '', qty: 1 }] })}>
            <Plus size={14} /> Add spare
          </button>
        </Modal>
      )}
    </SuitePage>
  );
};
