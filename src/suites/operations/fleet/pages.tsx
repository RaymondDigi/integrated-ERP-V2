import React, { useEffect, useState } from 'react';
import { ClipboardList, CarFront, AlertOctagon, ShieldCheck, BarChart3, MapPin, Mail, Bell, Layers, PackageCheck, Ship, Container as Box, FileBarChart, Gauge, AlertTriangle, Plus, PenLine, Send, Trash2 } from 'lucide-react';
import { ExportCsvButton, PrintButton, SignModal, esc } from '../../../platform/Widgets';
import { useNotices } from '../../../platform/outbox';
import { useOperations, type FleetPage } from '../store';
import { addDays, fmtDate, kes, TODAY } from '../../finance/engine';
import type { OperationsState } from '../types';
import { Chips, DataTable, DefList, Drawer, Empty, Field, Modal, Panel, Pill, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import type { SuiteNavGroup } from '../../ui/SuiteSidebar';
import { useFocus } from '../parts';
import { LETTER_LABEL, useFleetExt } from './store';
import { CORRIDOR, nextServiceDate, policyDays, REMINDER_DAYS, vehiclePerformance } from './engine';
import type { DefectReport, DefectSeverity, FleetExtPage, FleetExtState, InsurancePolicy, LetterTemplate, VehicleRequest } from './types';
import type { ContainersState } from '../containers/types';
import { ConsolidationPage, LoadingPage } from './planPages';
import { BookingsPage, ContainersPage, ContainerReportsPage, ContainerKpiPage, DiscrepanciesPage } from '../containers/pages';

export const FLEET_EXT_LABEL: Record<FleetExtPage, string> = {
  consolidation: 'Consolidation plans',
  loading: 'Loading instructions',
  dailylog: 'Daily log',
  requests: 'Vehicle requests',
  defects: 'Defect reports',
  insurance: 'Insurance',
  performance: 'Performance',
  tracking: 'Live tracking',
  letters: 'Letters',
  notices: 'Notices',
  bookings: 'Container bookings',
  containers: 'Containers',
  creports: 'Container reports',
  ckpis: 'Container KPIs',
  discrepancies: 'Port discrepancies'
};

export const FLEET_EXT_GROUPS = (s: OperationsState, x: FleetExtState, c: ContainersState): SuiteNavGroup<FleetPage>[] => [
  {
    label: 'Run',
    items: [
      { id: 'dailylog', label: FLEET_EXT_LABEL.dailylog, icon: ClipboardList },
      { id: 'requests', label: FLEET_EXT_LABEL.requests, icon: CarFront, badge: x.requests.filter((r) => r.status === 'REQUESTED' || r.status === 'APPROVED').length },
      { id: 'defects', label: FLEET_EXT_LABEL.defects, icon: AlertOctagon, badge: x.defects.filter((d) => d.status === 'SUBMITTED').length, badgeTone: 'critical' }
    ]
  },
  {
    label: 'Tea consolidation',
    items: [
      { id: 'consolidation', label: FLEET_EXT_LABEL.consolidation, icon: Layers, badge: x.plans.filter((p) => p.status === 'DRAFT').length },
      { id: 'loading', label: FLEET_EXT_LABEL.loading, icon: PackageCheck, badge: x.instructions.filter((i) => i.status !== 'DELIVERED').length, badgeTone: 'neutral' }
    ]
  },
  {
    label: 'Port & containers',
    items: [
      { id: 'bookings', label: FLEET_EXT_LABEL.bookings, icon: Ship, badge: c.bookings.filter((b) => b.status === 'REQUESTED' || b.status === 'SENT').length },
      { id: 'containers', label: FLEET_EXT_LABEL.containers, icon: Box },
      { id: 'discrepancies', label: FLEET_EXT_LABEL.discrepancies, icon: AlertTriangle, badge: c.discrepancies.filter((d) => d.status === 'OPEN').length, badgeTone: 'critical' },
      { id: 'creports', label: FLEET_EXT_LABEL.creports, icon: FileBarChart },
      { id: 'ckpis', label: FLEET_EXT_LABEL.ckpis, icon: Gauge }
    ]
  },
  {
    label: 'Compliance & reports',
    items: [
      { id: 'insurance', label: FLEET_EXT_LABEL.insurance, icon: ShieldCheck, badge: x.policies.filter((p) => p.status === 'ACTIVE' && policyDays(p) <= 30).length, badgeTone: 'critical' },
      { id: 'performance', label: FLEET_EXT_LABEL.performance, icon: BarChart3 },
      { id: 'tracking', label: FLEET_EXT_LABEL.tracking, icon: MapPin, badge: s.vehicles.filter((v) => v.status === 'ON_TRIP').length, badgeTone: 'neutral' },
      { id: 'letters', label: FLEET_EXT_LABEL.letters, icon: Mail },
      { id: 'notices', label: FLEET_EXT_LABEL.notices, icon: Bell }
    ]
  }
];

export const FleetExtPages: React.FC<{ page: FleetPage }> = ({ page }) => (
  <>
    {page === 'consolidation' && <ConsolidationPage />}
    {page === 'loading' && <LoadingPage />}
    {page === 'dailylog' && <DailyLogPage />}
    {page === 'requests' && <RequestsPage />}
    {page === 'defects' && <DefectsPage />}
    {page === 'insurance' && <InsurancePage />}
    {page === 'performance' && <PerformancePage />}
    {page === 'tracking' && <TrackingPage />}
    {page === 'letters' && <LettersPage />}
    {page === 'notices' && <NoticesPage />}
    {page === 'bookings' && <BookingsPage />}
    {page === 'containers' && <ContainersPage />}
    {page === 'creports' && <ContainerReportsPage />}
    {page === 'ckpis' && <ContainerKpiPage />}
    {page === 'discrepancies' && <DiscrepanciesPage />}
  </>
);

/* ------------------------------------------------------------------ */
/* Daily log                                                           */
/* ------------------------------------------------------------------ */

const DailyLogPage: React.FC = () => {
  const { state } = useOperations();
  const fx = useFleetExt();
  const own = state.vehicles.filter((v) => v.ownership !== 'HIRED');
  const [f, setF] = useState({ vehicleId: own[0]?.id ?? '', date: TODAY, closeKm: '', kg: '', driver: '' });
  const v = state.vehicles.find((x) => x.id === f.vehicleId);
  return (
    <SuitePage eyebrow="Fleet" title="Daily log" subtitle="Each vehicle's opening and closing odometer and the load carried each day. The closing reading updates the odometer and the service countdown.">
      <Panel title="Record today's log">
        <div className="sx-inline-form sx-wrap">
          <select className="form-control" value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })} aria-label="Vehicle">
            {own.map((x) => (
              <option key={x.id} value={x.id}>
                {x.reg} · {x.model}
              </option>
            ))}
          </select>
          <input className="form-control" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date" />
          <input className="form-control" type="number" value={f.closeKm} onChange={(e) => setF({ ...f, closeKm: e.target.value })} placeholder={`Closing km (opened ${v?.odometer.toLocaleString()})`} aria-label="Closing odometer" />
          <input className="form-control" type="number" value={f.kg} onChange={(e) => setF({ ...f, kg: e.target.value })} placeholder="kg carried" style={{ width: 120 }} aria-label="kg carried" />
          <input className="form-control" value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })} placeholder={v?.driver} aria-label="Driver" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => fx.recordDaily(f.vehicleId, f.date, Number(f.closeKm), Number(f.kg || 0), f.driver || v?.driver || '').ok && setF({ ...f, closeKm: '', kg: '' })}>
            Save log
          </button>
        </div>
      </Panel>
      <DataTable
        rows={fx.state.dailyLogs}
        rowKey={(l) => l.id}
        initialSort={{ key: 'd', dir: 'desc' }}
        columns={[
          { key: 'd', header: 'Date', render: (l) => fmtDate(l.date), sort: (l) => l.date },
          { key: 'v', header: 'Vehicle', render: (l) => fx.reg(l.vehicleId), sort: (l) => fx.reg(l.vehicleId) },
          { key: 'dr', header: 'Driver', render: (l) => l.driver, hideOnMobile: true },
          { key: 'o', header: 'Open → close', render: (l) => `${l.openKm.toLocaleString()} → ${l.closeKm.toLocaleString()}`, hideOnMobile: true },
          { key: 'k', header: 'km', render: (l) => (l.closeKm - l.openKm).toLocaleString(), align: 'right' },
          { key: 'kg', header: 'kg carried', render: (l) => l.kgCarried.toLocaleString(), align: 'right' }
        ]}
      />
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Vehicle requests                                                    */
/* ------------------------------------------------------------------ */

const RQ_PILL: Record<VehicleRequest['status'], string> = { REQUESTED: 'SUBMITTED', APPROVED: 'APPROVED', ALLOCATED: 'OPEN', REJECTED: 'REJECTED', CLOSED: 'POSTED' };

const RequestsPage: React.FC = () => {
  const { state, fleet } = useOperations();
  const fx = useFleetExt();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useFocus(fleet.focus, (id) => fx.state.requests.some((r) => r.id === id), setOpenId, () => setAdding(true));
  const sel = fx.state.requests.find((r) => r.id === openId);
  const [reason, setReason] = useState('');
  const [alloc, setAlloc] = useState({ vehicleId: '', driver: '' });
  const [f, setF] = useState({ department: 'Administration', purpose: '', type: 'ADMIN' as VehicleRequest['type'], from: `${TODAY}T08:00`, to: `${TODAY}T17:00`, route: '', passengers: 1, kg: 0 });
  return (
    <SuitePage
      eyebrow="Fleet"
      title="Vehicle requests"
      subtitle="Staff request a vehicle for administrative or operational use; the Transport Manager approves, allocates a vehicle and driver, and the trip starts against the request."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> Request a vehicle
        </button>
      }
    >
      <DataTable
        rows={fx.state.requests}
        rowKey={(r) => r.id}
        onRowClick={(r) => setOpenId(r.id)}
        selected={openId}
        initialSort={{ key: 'n', dir: 'desc' }}
        columns={[
          { key: 'n', header: 'Request', render: (r) => <b className="sx-mono">{r.number}</b>, sort: (r) => r.number },
          {
            key: 'p',
            header: 'Purpose',
            render: (r) => (
              <div className="sx-cell-main">
                <span>{r.purpose}</span>
                <small>
                  {r.requestedBy} · {r.department} · {r.route}
                </small>
              </div>
            )
          },
          { key: 'w', header: 'When', render: (r) => r.from.replace('T', ' '), sort: (r) => r.from, hideOnMobile: true },
          { key: 'v', header: 'Vehicle', render: (r) => (r.vehicleId ? fx.reg(r.vehicleId) : '—'), hideOnMobile: true },
          { key: 's', header: 'Status', render: (r) => <Pill status={RQ_PILL[r.status]} label={r.status.toLowerCase()} /> }
        ]}
      />
      {sel && (
        <Drawer title={sel.number} subtitle={sel.purpose} badge={<Pill status={RQ_PILL[sel.status]} label={sel.status.toLowerCase()} />} onClose={() => setOpenId(null)}>
          <DefList
            items={[
              ['Requested by', `${sel.requestedBy} (${sel.department})`],
              ['Type', sel.type.toLowerCase()],
              ['From', sel.from.replace('T', ' ')],
              ['To', sel.to.replace('T', ' ')],
              ['Route', sel.route],
              ['Passengers / load', `${sel.passengers} · ${sel.kg.toLocaleString()} kg`],
              ['Vehicle', sel.vehicleId ? fx.reg(sel.vehicleId) : '—'],
              ['Decision', sel.decidedBy ? `${sel.decidedBy}${sel.reason ? ` — ${sel.reason}` : ''}` : '—']
            ]}
          />
          {sel.status === 'REQUESTED' && (
            <div className="sx-inline-form">
              <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Note / reason" aria-label="Decision note" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => fx.decideRequest(sel.id, true, reason)}>
                Approve
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fx.decideRequest(sel.id, false, reason)}>
                Reject
              </button>
            </div>
          )}
          {sel.status === 'APPROVED' && (
            <div className="sx-inline-form sx-wrap">
              <select className="form-control" value={alloc.vehicleId} onChange={(e) => setAlloc({ ...alloc, vehicleId: e.target.value })} aria-label="Allocate vehicle">
                <option value="">Vehicle…</option>
                {state.vehicles
                  .filter((v) => v.status === 'AVAILABLE' && v.ownership !== 'HIRED')
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.reg} · {v.model}
                    </option>
                  ))}
              </select>
              <input className="form-control" value={alloc.driver} onChange={(e) => setAlloc({ ...alloc, driver: e.target.value })} placeholder="Driver" aria-label="Driver" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => fx.allocateRequest(sel.id, alloc.vehicleId, alloc.driver || state.vehicles.find((v) => v.id === alloc.vehicleId)?.driver || '')}>
                Allocate and start trip
              </button>
            </div>
          )}
          {sel.status === 'ALLOCATED' && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fx.closeRequest(sel.id)}>
              Close request
            </button>
          )}
          <h4 className="sx-subhead">History</h4>
          <Timeline items={sel.history} />
        </Drawer>
      )}
      {adding && (
        <Modal
          title="Request a vehicle"
          onClose={() => setAdding(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => fx.requestVehicle(f).ok && setAdding(false)}>
              Submit request
            </button>
          }
        >
          <div className="sx-grid">
            <Field label="Purpose" required span={2}>
              <input className="form-control" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} />
            </Field>
            <Field label="Department">
              <input className="form-control" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} />
            </Field>
            <Field label="Type">
              <select className="form-control" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as VehicleRequest['type'] })}>
                <option value="ADMIN">Administrative</option>
                <option value="OPERATIONAL">Operational</option>
              </select>
            </Field>
            <Field label="From" required>
              <input className="form-control" type="datetime-local" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            </Field>
            <Field label="To" required>
              <input className="form-control" type="datetime-local" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </Field>
            <Field label="Route" required span={2}>
              <input className="form-control" value={f.route} onChange={(e) => setF({ ...f, route: e.target.value })} placeholder="Nairobi → Kericho" />
            </Field>
            <Field label="Passengers">
              <input className="form-control" type="number" min="0" value={f.passengers} onChange={(e) => setF({ ...f, passengers: Number(e.target.value) })} />
            </Field>
            <Field label="Load (kg)">
              <input className="form-control" type="number" min="0" value={f.kg} onChange={(e) => setF({ ...f, kg: Number(e.target.value) })} />
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Defect reports                                                      */
/* ------------------------------------------------------------------ */

const DF_PILL: Record<DefectReport['status'], string> = { SUBMITTED: 'SUBMITTED', APPROVED: 'POSTED', REJECTED: 'REJECTED' };
const AREAS = ['Brakes', 'Tyres', 'Lights', 'Steering', 'Engine', 'Body', 'Load securing', 'Other'];

const DefectsPage: React.FC = () => {
  const { state, setMaintenance } = useOperations();
  const fx = useFleetExt();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reason, setReason] = useState('');
  const own = state.vehicles.filter((v) => v.ownership !== 'HIRED');
  const [f, setF] = useState({ vehicleId: own[0]?.id ?? '', odometer: '', items: [{ area: 'Brakes', description: '', severity: 'MAJOR' as DefectSeverity }] });
  const sel = fx.state.defects.find((d) => d.id === openId);
  return (
    <SuitePage
      eyebrow="Fleet"
      title="Defect reports"
      subtitle="Drivers report defects found on the pre-trip check. The Transport Manager approves the report, which raises a work order in Maintenance; a safety-critical defect takes the vehicle off the road."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> Report a defect
        </button>
      }
    >
      <DataTable
        rows={fx.state.defects}
        rowKey={(d) => d.id}
        onRowClick={(d) => setOpenId(d.id)}
        selected={openId}
        initialSort={{ key: 'n', dir: 'desc' }}
        columns={[
          { key: 'n', header: 'Report', render: (d) => <b className="sx-mono">{d.number}</b>, sort: (d) => d.number },
          { key: 'v', header: 'Vehicle', render: (d) => fx.reg(d.vehicleId) },
          { key: 'i', header: 'Defects', render: (d) => d.items.map((i) => `${i.area}: ${i.description}`).join('; ') },
          { key: 'sc', header: 'Safety', render: (d) => (d.safetyCritical ? <Pill status="REJECTED" label="Critical" /> : '—'), hideOnMobile: true },
          { key: 's', header: 'Status', render: (d) => <Pill status={DF_PILL[d.status]} label={d.woNumber ?? d.status.toLowerCase()} /> }
        ]}
      />
      {sel && (
        <Drawer title={sel.number} subtitle={`${fx.reg(sel.vehicleId)} · ${sel.driver} · ${sel.odometer.toLocaleString()} km`} badge={<Pill status={DF_PILL[sel.status]} label={sel.status.toLowerCase()} />} onClose={() => setOpenId(null)}>
          <table className="sx-mini-table">
            <tbody>
              {sel.items.map((i, k) => (
                <tr key={k}>
                  <td>{i.area}</td>
                  <td>{i.description}</td>
                  <td>
                    <Pill status={i.severity === 'CRITICAL' ? 'REJECTED' : i.severity === 'MAJOR' ? 'OVERDUE' : 'DRAFT'} label={i.severity.toLowerCase()} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sel.woId && (
            <p>
              Work order:{' '}
              <button type="button" className="sx-link" onClick={() => setMaintenance('workorders', sel.woId)}>
                {sel.woNumber}
              </button>{' '}
              (in Maintenance)
            </p>
          )}
          {sel.status === 'SUBMITTED' && (
            <div className="sx-inline-form">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => fx.approveDefect(sel.id)}>
                Approve — raise work order
              </button>
              <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason to reject" aria-label="Reject reason" />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fx.rejectDefect(sel.id, reason)}>
                Reject
              </button>
            </div>
          )}
          <h4 className="sx-subhead">History</h4>
          <Timeline items={sel.history} />
        </Drawer>
      )}
      {adding && (
        <Modal
          title="Report a defect"
          onClose={() => setAdding(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => fx.raiseDefect(f.vehicleId, Number(f.odometer), f.items).ok && setAdding(false)}>
              Submit report
            </button>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="Vehicle">
              <select className="form-control" value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}>
                {own.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.reg}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Odometer" required>
              <input className="form-control" type="number" value={f.odometer} onChange={(e) => setF({ ...f, odometer: e.target.value })} placeholder={String(state.vehicles.find((v) => v.id === f.vehicleId)?.odometer ?? '')} />
            </Field>
          </div>
          {f.items.map((it, i) => (
            <div key={i} className="sx-inline-form sx-wrap">
              <select className="form-control" value={it.area} onChange={(e) => setF({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, area: e.target.value } : x)) })} aria-label="Area">
                {AREAS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <input className="form-control" value={it.description} onChange={(e) => setF({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} placeholder="What is wrong" aria-label="Defect description" />
              <select className="form-control" value={it.severity} onChange={(e) => setF({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, severity: e.target.value as DefectSeverity } : x)) })} aria-label="Severity">
                <option value="MINOR">Minor</option>
                <option value="MAJOR">Major</option>
                <option value="CRITICAL">Critical — unsafe to drive</option>
              </select>
              <button type="button" className="sx-icon-btn" onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== i) })} aria-label="Remove defect">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF({ ...f, items: [...f.items, { area: 'Other', description: '', severity: 'MINOR' }] })}>
            <Plus size={14} /> Add defect
          </button>
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Insurance                                                           */
/* ------------------------------------------------------------------ */

const InsurancePage: React.FC = () => {
  const { state } = useOperations();
  const fx = useFleetExt();
  const [renew, setRenew] = useState<InsurancePolicy | null>(null);
  const active = fx.state.policies.filter((p) => p.status === 'ACTIVE');
  return (
    <SuitePage
      eyebrow="Fleet"
      title="Insurance"
      subtitle={`Policies per vehicle with expiry reminders emailed to the insurance officer ${REMINDER_DAYS.join(', ')} days before expiry (email delivery is simulated through the notification outbox).`}
      actions={
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => fx.sendReminders()}>
          <Mail size={14} /> Send due reminders
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Active policies" value={active.length} icon={<ShieldCheck size={17} />} />
        <Stat label="Expiring in 30 days" value={active.filter((p) => policyDays(p) <= 30 && policyDays(p) >= 0).length} icon={<AlertTriangle size={17} />} tone="gold" />
        <Stat label="Expired" value={active.filter((p) => policyDays(p) < 0).length} icon={<AlertTriangle size={17} />} tone="red" />
        <Stat label="Annual premiums" value={kes(active.reduce((x, p) => x + p.premium, 0), { compact: true })} icon={<ShieldCheck size={17} />} tone="blue" />
      </div>
      <DataTable
        rows={fx.state.policies}
        rowKey={(p) => p.id}
        initialSort={{ key: 'e', dir: 'asc' }}
        columns={[
          { key: 'v', header: 'Vehicle', render: (p) => fx.reg(p.vehicleId), sort: (p) => fx.reg(p.vehicleId) },
          { key: 'i', header: 'Insurer / policy', render: (p) => <div className="sx-cell-main"><span>{p.insurer}</span><small>{p.policyNo} · {p.cover.replace(/_/g, ' ').toLowerCase()}</small></div> },
          { key: 'pr', header: 'Premium', render: (p) => kes(p.premium), align: 'right', hideOnMobile: true },
          { key: 'e', header: 'Expiry', render: (p) => <span className={p.status === 'ACTIVE' && policyDays(p) <= 30 ? 'sx-danger-text' : ''}>{fmtDate(p.expiry)}{p.status === 'ACTIVE' ? ` (${policyDays(p)} d)` : ''}</span>, sort: (p) => p.expiry },
          { key: 'r', header: 'Reminders', render: (p) => (p.remindersSent.length ? p.remindersSent.map((d) => `${d}d`).join(', ') : '—'), hideOnMobile: true },
          { key: 's', header: 'Status', render: (p) => <Pill status={p.status === 'ACTIVE' ? 'POSTED' : 'VOID'} label={p.status.toLowerCase()} /> },
          {
            key: 'a',
            header: '',
            render: (p) =>
              p.status === 'ACTIVE' ? (
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => setRenew({ ...p, start: p.expiry, expiry: addDays(p.expiry, 365), policyNo: '' })}>
                  Renew
                </button>
              ) : null
          }
        ]}
      />
      {renew && (
        <Modal
          title={`Renew cover — ${fx.reg(renew.vehicleId)}`}
          onClose={() => setRenew(null)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => fx.renewPolicy(renew.vehicleId, { insurer: renew.insurer, policyNo: renew.policyNo, cover: renew.cover, premium: renew.premium, start: renew.start, expiry: renew.expiry, officer: renew.officer, officerEmail: renew.officerEmail }).ok && setRenew(null)}>
              Save renewal
            </button>
          }
        >
          <div className="sx-grid">
            <Field label="Insurer" span={2}>
              <input className="form-control" value={renew.insurer} onChange={(e) => setRenew({ ...renew, insurer: e.target.value })} />
            </Field>
            <Field label="New policy no." required span={2}>
              <input className="form-control" value={renew.policyNo} onChange={(e) => setRenew({ ...renew, policyNo: e.target.value })} />
            </Field>
            <Field label="Start">
              <input className="form-control" type="date" value={renew.start} onChange={(e) => setRenew({ ...renew, start: e.target.value })} />
            </Field>
            <Field label="Expiry">
              <input className="form-control" type="date" value={renew.expiry} onChange={(e) => setRenew({ ...renew, expiry: e.target.value })} />
            </Field>
            <Field label="Premium (KES)" span={2}>
              <input className="form-control" type="number" value={renew.premium} onChange={(e) => setRenew({ ...renew, premium: Number(e.target.value) })} />
            </Field>
            <Field label="Insurance officer" span={2}>
              <input className="form-control" value={renew.officer} onChange={(e) => setRenew({ ...renew, officer: e.target.value })} />
            </Field>
            <Field label="Officer email" span={2}>
              <input className="form-control" value={renew.officerEmail} onChange={(e) => setRenew({ ...renew, officerEmail: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
      {state.vehicles.length === 0 && <Empty title="No vehicles" />}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Vehicle performance                                                 */
/* ------------------------------------------------------------------ */

const PerformancePage: React.FC = () => {
  const { state, products } = useOperations();
  const fx = useFleetExt();
  const [from, setFrom] = useState(addDays(TODAY, -30));
  const [to, setTo] = useState(TODAY);
  const rows = state.vehicles.filter((v) => v.ownership !== 'HIRED').map((v) => ({ v, p: vehiclePerformance(state, fx.state, products, v.id, from, to) }));
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: 'v', header: 'Vehicle', render: (r) => <div className="sx-cell-main"><span>{r.v.reg}</span><small>{r.v.model}</small></div>, sort: (r) => r.v.reg },
    { key: 'k', header: 'km', render: (r) => r.p.km.toLocaleString(), align: 'right', sort: (r) => r.p.km },
    { key: 'e', header: 'km/l', render: (r) => r.p.kmpl ?? '—', align: 'right', sort: (r) => r.p.kmpl ?? 0 },
    { key: 'f', header: 'Fuel', render: (r) => kes(r.p.fuelCost, { compact: true }), align: 'right', hideOnMobile: true },
    { key: 'r', header: 'Repairs', render: (r) => kes(r.p.repairCost, { compact: true }), align: 'right', hideOnMobile: true },
    { key: 'c', header: 'Cost/km', render: (r) => (r.p.costPerKm !== null ? kes(r.p.costPerKm) : '—'), align: 'right', sort: (r) => r.p.costPerKm ?? 0 },
    { key: 't', header: 'Tonne-km', render: (r) => r.p.tonneKm.toLocaleString(), align: 'right', hideOnMobile: true },
    { key: 'ct', header: 'Cost/tonne', render: (r) => (r.p.costPerTonne !== null ? kes(r.p.costPerTonne) : '—'), align: 'right', hideOnMobile: true },
    { key: 'n', header: 'Next service', render: (r) => { const kmDay = r.p.km / Math.max(1, (new Date(to).getTime() - new Date(from).getTime()) / 864e5); const d = nextServiceDate(r.v, kmDay); return d ? fmtDate(d) : '—'; } }
  ];
  return (
    <SuitePage
      eyebrow="Fleet"
      title="Vehicle performance"
      subtitle="Distance, fuel economy, repair cost and cost per km and per tonne carried for each vehicle, with the forecast service date from recent usage."
      actions={
        <ExportCsvButton
          name={`fleet-performance-${from}-${to}`}
          header={['Vehicle', 'Trips', 'km', 'Litres', 'km/l', 'Fuel KES', 'Repairs KES', 'Cost/km', 'kg carried', 'Tonne-km', 'Cost/tonne']}
          rows={() => rows.map((r) => [r.v.reg, r.p.trips, r.p.km, r.p.litres, r.p.kmpl, r.p.fuelCost, r.p.repairCost, r.p.costPerKm, r.p.kg, r.p.tonneKm, r.p.costPerTonne])}
        />
      }
    >
      <div className="sx-grid sx-filters">
        <Field label="From">
          <input className="form-control" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input className="form-control" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <DataTable rows={rows} rowKey={(r) => r.v.id} columns={columns} initialSort={{ key: 'c', dir: 'desc' }} />
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Live tracking (simulated)                                           */
/* ------------------------------------------------------------------ */

const TrackingPage: React.FC = () => {
  const { state } = useOperations();
  const fx = useFleetExt();
  const [live, setLive] = useState(true);
  useEffect(() => {
    fx.tick();
    if (!live) return;
    const t = window.setInterval(() => fx.tick(), 4000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  const lats = CORRIDOR.map((c) => c.lat);
  const lngs = CORRIDOR.map((c) => c.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const xy = (lat: number, lng: number) => ({ x: 20 + ((lng - minLng) / (maxLng - minLng)) * 560, y: 20 + ((maxLat - lat) / (maxLat - minLat)) * 260 });
  const positions = Object.values(fx.state.positions);
  return (
    <SuitePage
      eyebrow="Fleet"
      title="Live tracking"
      subtitle="Simulated telematics: there is no GPS gateway in this build, so positions, speed and fuel level are generated along the Nairobi–Mombasa corridor for vehicles on a trip."
      actions={
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLive(!live)}>
          {live ? 'Pause feed' : 'Resume feed'}
        </button>
      }
    >
      <div className="sx-callout info">
        <MapPin size={16} />
        <div>
          <b>Simulated feed</b>
          <span>Positions update every 4 seconds while this page is open. A real telematics provider would post the same fields.</span>
        </div>
      </div>
      <Panel title="Corridor map">
        <svg viewBox="0 0 600 300" className="sx-track-map" role="img" aria-label="Vehicle positions">
          <polyline fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" points={CORRIDOR.map((c) => { const p = xy(c.lat, c.lng); return `${p.x},${p.y}`; }).join(' ')} />
          {CORRIDOR.map((c) => {
            const p = xy(c.lat, c.lng);
            return (
              <g key={c.place}>
                <circle cx={p.x} cy={p.y} r="3" fill="currentColor" fillOpacity="0.4" />
                <text x={p.x + 5} y={p.y - 5} fontSize="9" fill="currentColor" fillOpacity="0.6">
                  {c.place.split(',')[0]}
                </text>
              </g>
            );
          })}
          {positions
            .filter((p) => state.vehicles.find((v) => v.id === p.vehicleId)?.status === 'ON_TRIP')
            .map((p) => {
              const q = xy(p.lat, p.lng);
              return (
                <g key={p.vehicleId}>
                  <circle cx={q.x} cy={q.y} r="7" fill="#2563eb" />
                  <text x={q.x + 9} y={q.y + 14} fontSize="11" fontWeight="600" fill="#2563eb">
                    {fx.reg(p.vehicleId)}
                  </text>
                </g>
              );
            })}
        </svg>
      </Panel>
      <DataTable
        rows={state.vehicles}
        rowKey={(v) => v.id}
        columns={[
          { key: 'v', header: 'Vehicle', render: (v) => v.reg },
          { key: 's', header: 'Status', render: (v) => v.status.replace('_', ' ').toLowerCase() },
          { key: 'p', header: 'Near', render: (v) => fx.state.positions[v.id]?.place ?? '—' },
          { key: 'sp', header: 'Speed', render: (v) => `${fx.state.positions[v.id]?.speed ?? 0} km/h`, align: 'right' },
          { key: 'f', header: 'Fuel', render: (v) => { const f = fx.state.positions[v.id]?.fuelPct; return f === undefined ? '—' : <span className={f < 20 ? 'sx-danger-text' : ''}>{f}%</span>; }, align: 'right' },
          { key: 'a', header: 'Last fix', render: (v) => fx.state.positions[v.id]?.at.slice(11, 19) ?? '—', hideOnMobile: true }
        ]}
      />
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Letters with e-signature                                            */
/* ------------------------------------------------------------------ */

const LettersPage: React.FC = () => {
  const { state, actor } = useOperations();
  const fx = useFleetExt();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [signing, setSigning] = useState(false);
  const [f, setF] = useState({ template: 'AUTHORITY_TO_DRIVE' as LetterTemplate, vehicleId: state.vehicles[0]?.id ?? '', to: '', toEmail: '', extra: '' });
  const sel = fx.state.letters.find((l) => l.id === openId);
  const letterHtml = (l: NonNullable<typeof sel>) =>
    `<h1>${esc(l.subject)}</h1><p><b>Ref:</b> ${esc(l.number)}<br/><b>To:</b> ${esc(l.to)}</p><p>${esc(l.body)}</p>${l.signature ? `<p style="margin-top:32px">Signed electronically by <b>${esc(l.signature.by)}</b> on ${esc(l.signature.at)}<br/><i>${esc(l.signature.text)}</i><br/>Document hash ${esc(l.hash)}</p>` : '<p><i>Draft — not signed</i></p>'}`;
  return (
    <SuitePage
      eyebrow="Fleet"
      title="Letters"
      subtitle="Standard transport letters merged from vehicle and policy records, signed electronically by a second person (name + PIN) and emailed with the signed copy. Email delivery is simulated."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> New letter
        </button>
      }
    >
      <DataTable
        rows={fx.state.letters}
        rowKey={(l) => l.id}
        onRowClick={(l) => setOpenId(l.id)}
        selected={openId}
        columns={[
          { key: 'n', header: 'Letter', render: (l) => <b className="sx-mono">{l.number}</b>, sort: (l) => l.number },
          { key: 't', header: 'Template', render: (l) => LETTER_LABEL[l.template] },
          { key: 's', header: 'Subject', render: (l) => l.subject },
          { key: 'to', header: 'To', render: (l) => l.to, hideOnMobile: true },
          { key: 'st', header: 'Status', render: (l) => <Pill status={l.status === 'SENT' ? 'POSTED' : l.status === 'SIGNED' ? 'APPROVED' : 'DRAFT'} label={l.status.toLowerCase()} /> }
        ]}
      />
      {sel && (
        <Drawer
          title={sel.number}
          subtitle={LETTER_LABEL[sel.template]}
          onClose={() => setOpenId(null)}
          footer={
            <>
              <PrintButton title={sel.number} html={() => letterHtml(sel)} />
              {sel.status === 'DRAFT' && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setSigning(true)}>
                  <PenLine size={14} /> Sign
                </button>
              )}
              {sel.status === 'SIGNED' && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => fx.sendLetter(sel.id)}>
                  <Send size={14} /> Email
                </button>
              )}
            </>
          }
        >
          <h4 className="sx-subhead">{sel.subject}</h4>
          <p>To: {sel.to}{sel.toEmail ? ` <${sel.toEmail}>` : ''}</p>
          <p className="sx-note">{sel.body}</p>
          {sel.signature && (
            <p className="sx-muted">
              Signed by {sel.signature.by} on {sel.signature.at} · hash {sel.hash}
            </p>
          )}
          <Timeline items={sel.history} />
          {signing && <SignModal signer={actor.name} meaning={`I approve and sign ${sel.number}`} onClose={() => setSigning(false)} onSign={(sig) => fx.signLetter(sel.id, sig)} />}
        </Drawer>
      )}
      {adding && (
        <Modal
          title="New letter"
          onClose={() => setAdding(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { const r = fx.draftLetter(f.template, f.vehicleId, f.to, f.toEmail, f.extra); if (r.ok) { setAdding(false); setOpenId(r.id ?? null); } }}>
              Draft letter
            </button>
          }
        >
          <div className="sx-grid">
            <Field label="Template" span={2}>
              <select className="form-control" value={f.template} onChange={(e) => setF({ ...f, template: e.target.value as LetterTemplate })}>
                {(Object.keys(LETTER_LABEL) as LetterTemplate[]).map((t) => (
                  <option key={t} value={t}>
                    {LETTER_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Vehicle" span={2}>
              <select className="form-control" value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}>
                {state.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.reg} · {v.model}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="To (name)" required span={2}>
              <input className="form-control" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </Field>
            <Field label="Email" span={2}>
              <input className="form-control" value={f.toEmail} onChange={(e) => setF({ ...f, toEmail: e.target.value })} />
            </Field>
            <Field label="Details" span={4}>
              <textarea className="form-control" rows={3} value={f.extra} onChange={(e) => setF({ ...f, extra: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Notices                                                             */
/* ------------------------------------------------------------------ */

const NoticesPage: React.FC = () => {
  const [mod, setMod] = useState<'ALL' | 'Fleet' | 'Containers' | 'Maintenance'>('ALL');
  const all = useNotices().filter((n) => ['Fleet', 'Containers', 'Maintenance'].includes(n.module));
  const rows = all.filter((n) => mod === 'ALL' || n.module === mod);
  return (
    <SuitePage eyebrow="Fleet" title="Notices" subtitle="Emails, SMS and in-app alerts sent by transport, the container desk and maintenance (delivery is simulated through the workspace outbox).">
      <div className="sx-toolbar">
        <Chips
          value={mod}
          onChange={setMod}
          options={[
            { value: 'ALL', label: 'All', count: all.length },
            { value: 'Fleet', label: 'Fleet', count: all.filter((n) => n.module === 'Fleet').length },
            { value: 'Containers', label: 'Containers', count: all.filter((n) => n.module === 'Containers').length },
            { value: 'Maintenance', label: 'Maintenance', count: all.filter((n) => n.module === 'Maintenance').length }
          ]}
        />
      </div>
      <DataTable
        rows={rows}
        rowKey={(n) => n.id}
        empty="No notices yet"
        initialSort={{ key: 'a', dir: 'desc' }}
        columns={[
          { key: 'a', header: 'When', render: (n) => n.at, sort: (n) => n.at },
          { key: 'c', header: 'Channel', render: (n) => n.channel.toLowerCase().replace('_', '-') },
          { key: 't', header: 'To', render: (n) => `${n.to}${n.address ? ` <${n.address}>` : ''}` },
          { key: 's', header: 'Subject', render: (n) => n.subject },
          { key: 'r', header: 'Ref', render: (n) => n.ref ?? '', hideOnMobile: true }
        ]}
      />
    </SuitePage>
  );
};
