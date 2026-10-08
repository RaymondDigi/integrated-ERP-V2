import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, Database, Factory, Gauge, Lightbulb, Save, ShieldAlert, Trash2, TrendingUp, Wrench } from 'lucide-react';
import { useApp, type NavigationTarget } from '../../context/AppContext';
import { useSnapshot } from './snapshot';
import { useHub } from './store';
import { useInbox } from './useInbox';
import { addDays, kes, monthlySeries, round2, TODAY } from '../finance/engine';
import { needsReorder, totals } from '../commercial/engine';
import { complaintEscalation, kriState, kriValues, riskActive, slaState } from '../control/engine';
import { Bars, Chips, DataTable, Field, Meter, Panel, Pill, Stat, SuitePage, TodoList, type Column, type TodoItem } from '../ui/kit';
import { ExportCsvButton, PrintButton, esc } from '../../platform/Widgets';
import { useAccess } from '../../platform/access';
import { notify } from '../../platform/outbox';
import { createBus, pid } from '../../platform/bus';

type Snap = ReturnType<typeof useSnapshot>;

/* ------------------------------------------------------------------ */
/* Alerts — one list of issues needing immediate action                */
/* ------------------------------------------------------------------ */

export interface Alert {
  id: string;
  level: 'critical' | 'warning';
  module: string;
  title: string;
  detail: string;
  view: NavigationTarget;
  nav: () => void;
}

export const buildAlerts = (s: Snap, ext: { needsReorder: number; arOverdue60: number; equipmentDown: number }): Alert[] => {
  const kv = kriValues(s.ctl.state, ext);
  return [
    ...s.ctl.state.emergencies.filter((e) => e.status !== 'CLOSED').map((e) => ({ id: `em:${e.id}`, level: 'critical' as const, module: 'Quality', title: `Emergency ${e.number}: ${e.type}`, detail: `${e.site} · class ${e.cls}`, view: 'quality' as NavigationTarget, nav: () => s.ctl.setQuality('emergencies', e.id) })),
    ...s.downAssets.map((e) => ({ id: `eq:${e.id}`, level: (e.criticality === 'HIGH' ? 'critical' : 'warning') as Alert['level'], module: 'Maintenance', title: `${e.name} is down`, detail: e.area, view: 'maintenance' as NavigationTarget, nav: () => s.ops.setMaintenance('overview') })),
    ...s.ctl.state.tickets.filter((t) => t.status !== 'RESOLVED' && slaState(t).resolveBreached).map((t) => ({ id: `sla:${t.id}`, level: (t.priority === 'P1' ? 'critical' : 'warning') as Alert['level'], module: 'ICT', title: `${t.number} breached its SLA`, detail: `${t.priority} · ${t.title}`, view: 'ict' as NavigationTarget, nav: () => s.ctl.setIct('tickets', t.id) })),
    ...s.overdueFilings.map((o) => ({ id: `fil:${o.id}`, level: 'critical' as const, module: 'Governance', title: `Overdue filing: ${o.name}`, detail: o.authority, view: 'governance' as NavigationTarget, nav: () => s.ctl.setGovernance('calendar') })),
    ...s.ctl.state.risks
      .filter(riskActive)
      .flatMap((r) => (r.kris ?? []).filter((k) => kriState(k, kv[k.metric]) === 'RED').map((k) => ({ id: `kri:${r.id}:${k.id}`, level: 'warning' as const, module: 'Risk', title: `KRI over limit: ${k.name}`, detail: `${r.title} · ${kv[k.metric]} vs limit ${k.limit}`, view: 'quality' as NavigationTarget, nav: () => s.ctl.setQuality('risks', r.id) }))),
    ...s.ctl.state.complaints.filter((c) => complaintEscalation(c, s.ctl.state.complaints).level >= 2).map((c) => ({ id: `cmp:${c.id}`, level: 'warning' as const, module: 'Quality', title: `Complaint needs escalation: ${c.number}`, detail: complaintEscalation(c, s.ctl.state.complaints).reasons.join('; '), view: 'quality' as NavigationTarget, nav: () => s.ctl.setQuality('complaints', c.id) })),
    ...s.lowStock.map((p) => ({ id: `stk:${p.sku}`, level: (p.stock <= 0 ? 'critical' : 'warning') as Alert['level'], module: 'Stock', title: `${p.name} below reorder level`, detail: `${p.stock} ${p.unit} left`, view: (p.kind === 'MATERIAL' ? 'procurement' : 'trading') as NavigationTarget, nav: () => (p.kind === 'MATERIAL' ? s.com.setProcurement('stock') : s.com.setTrading('products')) })),
    ...s.vehicleAlerts.map((a, i) => ({ id: `veh:${i}:${a}`, level: 'warning' as const, module: 'Fleet', title: a, detail: 'Vehicle compliance', view: 'fleet' as NavigationTarget, nav: () => s.ops.setFleet('overview') }))
  ];
};

const ackBus = createBus<{ id: string; by: string; at: string }>([]);
const pushed = new Set<string>();

/** Turns the live alert list into in-app and SMS notifications the first time a critical alert appears. */
export const AlertWatcher: React.FC = () => {
  const s = useSnapshot();
  const ext = useAlertExt(s);
  const alerts = useMemo(() => buildAlerts(s, ext), [s, ext]);
  useEffect(() => {
    alerts
      .filter((a) => a.level === 'critical' && !pushed.has(a.id))
      .forEach((a) => {
        pushed.add(a.id);
        notify({ module: a.module, to: 'Duty manager', level: 'critical', channels: ['IN_APP'], subject: a.title, body: a.detail, ref: a.id });
      });
  }, [alerts]);
  return null;
};

const useAlertExt = (s: Snap) => ({
  needsReorder: s.lowStock.length,
  arOverdue60: round2(s.ar.totals[3] + s.ar.totals[4]),
  equipmentDown: s.downAssets.length
});

export const AlertsPage: React.FC = () => {
  const s = useSnapshot();
  const ext = useAlertExt(s);
  const { setCurrentView } = useApp();
  const access = useAccess();
  const acks = ackBus.use();
  const [show, setShow] = useState<'OPEN' | 'ACK' | 'ALL'>('OPEN');
  const alerts = buildAlerts(s, ext);
  const acked = (id: string) => acks.find((a) => a.id === id);
  const rows = alerts.filter((a) => (show === 'ALL' ? true : show === 'ACK' ? acked(a.id) : !acked(a.id))).sort((a, b) => (a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1));
  const columns: Column<Alert>[] = [
    { key: 'l', header: 'Level', render: (a) => <Pill status={a.level === 'critical' ? 'REJECTED' : 'SUBMITTED'} label={a.level} />, sort: (a) => a.level, width: 100 },
    { key: 'm', header: 'Module', render: (a) => <span className="sx-tag sx-tag-strong">{a.module}</span>, sort: (a) => a.module, width: 120 },
    {
      key: 't',
      header: 'Issue',
      render: (a) => (
        <div className="sx-cell-main">
          <span>{a.title}</span>
          <small>
            {a.detail}
            {acked(a.id) ? ` · acknowledged by ${acked(a.id)!.by} ${acked(a.id)!.at}` : ''}
          </small>
        </div>
      )
    },
    {
      key: 'x',
      header: '',
      render: (a) => (
        <div className="sx-row-actions" onClick={(e) => e.stopPropagation()}>
          {!acked(a.id) && (
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => {
                if (access.readOnly) return;
                ackBus.push({ id: a.id, by: access.name, at: new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) });
              }}
              disabled={access.readOnly}
              title={access.readOnly ? 'Read-only account' : undefined}
            >
              <CheckCircle2 size={12} /> Acknowledge
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-xs"
            onClick={() => {
              a.nav();
              setCurrentView(a.view);
            }}
          >
            Act
          </button>
        </div>
      ),
      align: 'right',
      width: 200
    }
  ];
  return (
    <SuitePage
      eyebrow="Business overview"
      title="Alert centre"
      subtitle="Every issue across the business that needs immediate action. Critical alerts are also pushed to the notification centre (bell) the moment they appear."
      actions={<ExportCsvButton name="alerts" header={['Level', 'Module', 'Issue', 'Detail', 'Acknowledged by']} rows={() => alerts.map((a) => [a.level, a.module, a.title, a.detail, acked(a.id)?.by ?? ''])} />}
    >
      <div className="sx-stats">
        <Stat label="Critical" value={alerts.filter((a) => a.level === 'critical' && !acked(a.id)).length} icon={<AlertTriangle size={17} />} tone="red" />
        <Stat label="Warnings" value={alerts.filter((a) => a.level === 'warning' && !acked(a.id)).length} icon={<BellRing size={17} />} tone="gold" />
        <Stat label="Acknowledged" value={alerts.filter((a) => acked(a.id)).length} icon={<CheckCircle2 size={17} />} tone="green" />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={show}
          onChange={setShow}
          options={[
            { value: 'OPEN', label: 'Needs action', count: alerts.filter((a) => !acked(a.id)).length },
            { value: 'ACK', label: 'Acknowledged', count: alerts.filter((a) => acked(a.id)).length },
            { value: 'ALL', label: 'All', count: alerts.length }
          ]}
        />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(a) => a.id} pageSize={20} empty={<div className="sx-allclear"><CheckCircle2 size={24} /><p>No alerts.</p></div>} />
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Role-based dashboard                                                */
/* ------------------------------------------------------------------ */

type DashRole = 'EXECUTIVE' | 'PRODUCTION' | 'OPERATIONS' | 'QUALITY' | 'SUPERVISOR';
const DASH_LABEL: Record<DashRole, string> = { EXECUTIVE: 'Executive', PRODUCTION: 'Production manager', OPERATIONS: 'Operations', QUALITY: 'Quality & safety', SUPERVISOR: 'Shift supervisor' };
/** Which dashboards each sign-in role may open: viewers and members see operational views only. */
export const DASHBOARDS_FOR: Record<string, DashRole[]> = {
  admin: ['EXECUTIVE', 'PRODUCTION', 'OPERATIONS', 'QUALITY', 'SUPERVISOR'],
  manager: ['EXECUTIVE', 'PRODUCTION', 'OPERATIONS', 'QUALITY', 'SUPERVISOR'],
  member: ['SUPERVISOR', 'PRODUCTION', 'OPERATIONS', 'QUALITY'],
  viewer: ['OPERATIONS', 'QUALITY'],
  employee: ['SUPERVISOR']
};

/** Manufacturing performance by line from batches and maintenance downtime. */
export const lineKpis = (s: Snap, from: string) => {
  const batches = s.ops.state.batches.filter((b) => b.date >= from && b.status === 'COMPLETED');
  const lines = [...new Set(s.ops.state.batches.map((b) => b.line))];
  const days = Math.max(1, Math.round((new Date(TODAY).getTime() - new Date(from).getTime()) / 86_400_000));
  const planned = days * 16; // two 8-hour shifts a day
  return lines.map((line) => {
    const bs = batches.filter((b) => b.line === line);
    const eq = s.ops.state.equipment.filter((e) => e.area.toLowerCase().includes(line.toLowerCase()) || line.toLowerCase().includes(e.area.toLowerCase()));
    const down = s.ops.state.workOrders.filter((w) => w.date >= from && eq.some((e) => e.id === w.equipmentId)).reduce((x, w) => x + (w.downtimeHours || 0), 0);
    const plannedQty = bs.reduce((x, b) => x + b.plannedQty, 0);
    const out = bs.reduce((x, b) => x + b.output, 0);
    const rej = bs.reduce((x, b) => x + b.rejectedQty, 0);
    const availability = Math.max(0, 1 - down / planned);
    const performance = plannedQty ? Math.min(1, (out + rej) / plannedQty) : 0;
    const quality = out + rej ? out / (out + rej) : 1;
    return { line, batches: bs.length, plannedQty, out, rej, down: round2(down), availability, performance, quality, oee: availability * performance * quality, throughput: round2(out / days) };
  });
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const ManufacturingPage: React.FC<{ supervisor?: boolean }> = ({ supervisor }) => {
  const s = useSnapshot();
  const [period, setPeriod] = useState<'7' | '30' | '90'>('30');
  const from = addDays(TODAY, -Number(period));
  const kpis = lineKpis(s, from);
  const tot = kpis.reduce((a, k) => ({ out: a.out + k.out, rej: a.rej + k.rej, down: a.down + k.down, oee: a.oee + k.oee / Math.max(1, kpis.length) }), { out: 0, rej: 0, down: 0, oee: 0 });
  const downByEq = s.ops.state.equipment
    .map((e) => ({ e, h: s.ops.state.workOrders.filter((w) => w.equipmentId === e.id && w.date >= from).reduce((x, w) => x + (w.downtimeHours || 0), 0) }))
    .filter((x) => x.h > 0)
    .sort((a, b) => b.h - a.h);
  return (
    <SuitePage
      eyebrow="Business overview"
      title={supervisor ? 'Shift supervisor view' : 'Manufacturing performance'}
      subtitle="OEE (availability × performance × quality), throughput and downtime by line, calculated from production batches and maintenance work orders."
      actions={<ExportCsvButton name="manufacturing-kpis" header={['Line', 'Batches', 'Planned', 'Good output', 'Rejected', 'Downtime h', 'Availability', 'Performance', 'Quality', 'OEE', 'Units/day']} rows={() => kpis.map((k) => [k.line, k.batches, k.plannedQty, k.out, k.rej, k.down, pct(k.availability), pct(k.performance), pct(k.quality), pct(k.oee), k.throughput])} />}
    >
      <div className="sx-toolbar">
        <Chips value={period} onChange={setPeriod} options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
      </div>
      <div className="sx-stats">
        <Stat label="Average OEE" value={pct(tot.oee)} detail="World class is 85%" icon={<Gauge size={17} />} tone={tot.oee >= 0.65 ? 'green' : 'gold'} />
        <Stat label="Good output" value={tot.out.toLocaleString()} detail={`${tot.rej.toLocaleString()} rejected`} icon={<Factory size={17} />} tone="blue" />
        <Stat label="First-pass yield" value={pct(tot.out + tot.rej ? tot.out / (tot.out + tot.rej) : 1)} icon={<CheckCircle2 size={17} />} tone="violet" />
        <Stat label="Downtime" value={`${round2(tot.down)} h`} detail={`${downByEq.length} machines`} icon={<Wrench size={17} />} tone={tot.down ? 'red' : 'green'} />
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title="By line" subtitle="Availability · performance · quality">
          <table className="sx-mini-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>OEE</th>
                <th className="sx-hide-sm">A</th>
                <th className="sx-hide-sm">P</th>
                <th className="sx-hide-sm">Q</th>
                <th>Units/day</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((k) => (
                <tr key={k.line}>
                  <td>
                    {k.line}
                    <small className="sx-muted sx-block">{k.batches} batches</small>
                  </td>
                  <td>
                    <div className="sx-meter-cell">
                      <Meter value={k.oee} tone={k.oee >= 0.65 ? 'green' : k.oee >= 0.4 ? 'gold' : 'red'} />
                      <small>{pct(k.oee)}</small>
                    </div>
                  </td>
                  <td className="sx-hide-sm">{pct(k.availability)}</td>
                  <td className="sx-hide-sm">{pct(k.performance)}</td>
                  <td className="sx-hide-sm">{pct(k.quality)}</td>
                  <td>{k.throughput.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Downtime by machine" subtitle="From maintenance work orders">
          <ul className="sx-barlist">
            {downByEq.map(({ e, h }) => (
              <li key={e.id}>
                <div>
                  <span>
                    {e.name} <small className="sx-muted">· {e.area}</small>
                  </span>
                  <b>{h} h</b>
                </div>
                <Meter value={h / Math.max(1, downByEq[0]?.h ?? 1)} tone="red" />
              </li>
            ))}
            {!downByEq.length && <li className="sx-muted">No downtime recorded in the period.</li>}
          </ul>
        </Panel>
      </div>
      {supervisor && (
        <Panel title="This shift" subtitle="Batches in progress and machines needing attention">
          <ul className="sx-facts">
            {s.ops.state.batches
              .filter((b) => b.status !== 'COMPLETED' && b.status !== 'CANCELLED')
              .map((b) => (
                <li key={b.id}>
                  <span>
                    {b.number} · {b.line}
                  </span>
                  <b>
                    {b.status.toLowerCase()} · plan {b.plannedQty}
                  </b>
                </li>
              ))}
            {s.downAssets.map((e) => (
              <li key={e.id}>
                <span className="sx-danger-text">{e.name} down</span>
                <b>{e.area}</b>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </SuitePage>
  );
};

export const MyDashboardPage: React.FC = () => {
  const access = useAccess();
  const s = useSnapshot();
  const inbox = useInbox();
  const { setCurrentView } = useApp();
  const allowed = DASHBOARDS_FOR[access.role ?? 'viewer'] ?? ['OPERATIONS'];
  const [dash, setDash] = useState<DashRole>(allowed[0]);
  const ext = useAlertExt(s);
  const alerts = buildAlerts(s, ext);
  const go = (view: NavigationTarget, nav?: () => void) => () => {
    nav?.();
    setCurrentView(view);
  };
  if (dash === 'PRODUCTION' || dash === 'SUPERVISOR')
    return (
      <>
        <div className="sx-toolbar" style={{ padding: '12px 16px 0' }}>
          <Chips value={dash} onChange={setDash} options={allowed.map((d) => ({ value: d, label: DASH_LABEL[d] }))} />
        </div>
        <ManufacturingPage supervisor={dash === 'SUPERVISOR'} />
      </>
    );
  const items: TodoItem[] = alerts
    .filter((a) => (dash === 'QUALITY' ? ['Quality', 'Risk', 'Governance'].includes(a.module) : dash === 'OPERATIONS' ? ['Maintenance', 'Stock', 'Fleet', 'ICT'].includes(a.module) : true))
    .map((a) => ({ id: a.id, tone: a.level === 'critical' ? 'critical' : 'warning', icon: <AlertTriangle size={15} />, title: a.title, detail: a.detail, onClick: go(a.view, a.nav) }));
  const c = s.ctl.state;
  return (
    <SuitePage eyebrow={`Signed in as ${access.name} · ${access.role ?? 'viewer'}`} title={`My dashboard — ${DASH_LABEL[dash]}`} subtitle="Dashboards follow your sign-in role. Figures are live from every module.">
      <div className="sx-toolbar">
        <Chips value={dash} onChange={setDash} options={allowed.map((d) => ({ value: d, label: DASH_LABEL[d] }))} />
      </div>
      <div className="sx-stats">
        {dash === 'EXECUTIVE' && (
          <>
            <Stat label="Revenue this year" value={kes(s.pl.totalIncome, { compact: true })} icon={<TrendingUp size={17} />} />
            <Stat label="Cash" value={kes(s.cash, { compact: true })} icon={<Database size={17} />} tone="blue" />
            <Stat label="Decisions waiting" value={inbox.length} icon={<BellRing size={17} />} tone="gold" onClick={go('approvals')} />
            <Stat label="Critical alerts" value={alerts.filter((a) => a.level === 'critical').length} icon={<AlertTriangle size={17} />} tone="red" />
          </>
        )}
        {dash === 'QUALITY' && (
          <>
            <Stat label="Open CAPAs" value={c.capas.filter((x) => x.status !== 'CLOSED').length} icon={<ShieldAlert size={17} />} onClick={go('quality', () => s.ctl.setQuality('capa'))} />
            <Stat label="Open complaints" value={c.complaints.filter((x) => x.status !== 'RESOLVED').length} icon={<AlertTriangle size={17} />} tone="gold" onClick={go('quality', () => s.ctl.setQuality('complaints'))} />
            <Stat label="Active emergencies" value={c.emergencies.filter((x) => x.status !== 'CLOSED').length} icon={<BellRing size={17} />} tone="red" onClick={go('quality', () => s.ctl.setQuality('emergencies'))} />
            <Stat label="High risks" value={s.highRisks.length} icon={<ShieldAlert size={17} />} tone="violet" onClick={go('quality', () => s.ctl.setQuality('risks'))} />
          </>
        )}
        {dash === 'OPERATIONS' && (
          <>
            <Stat label="Produced this month" value={s.output.toLocaleString()} icon={<Factory size={17} />} />
            <Stat label="Items to reorder" value={s.lowStock.length} icon={<AlertTriangle size={17} />} tone="gold" />
            <Stat label="Machines down" value={s.downAssets.length} icon={<Wrench size={17} />} tone="red" />
            <Stat label="Open work orders" value={s.openWo.length} icon={<Wrench size={17} />} tone="blue" />
          </>
        )}
      </div>
      <Panel title="Needs attention" subtitle="Filtered to this dashboard">
        <TodoList items={items} max={12} />
      </Panel>
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Ad-hoc report builder                                               */
/* ------------------------------------------------------------------ */

type Row = Record<string, string | number>;
interface Dataset {
  key: string;
  label: string;
  source: string;
  rows: (s: Snap) => Row[];
}
const DATASETS: Dataset[] = [
  { key: 'orders', label: 'Sales orders', source: 'Trading', rows: (s) => s.com.state.orders.map((o) => ({ Number: o.number, Customer: s.com.party(o.customerId)?.name ?? o.customerId, Date: o.date, Month: o.date.slice(0, 7), Status: o.status, Value: round2(totals(o.lines, s.com.state.products, s.com.party(o.customerId)).net) })) },
  { key: 'invoices', label: 'Invoices & bills', source: 'Finance', rows: (s) => s.fin.state.documents.map((d) => ({ Number: d.number, Kind: d.kind, Party: s.fin.state.parties.find((p) => p.id === d.partyId)?.name ?? d.partyId, Department: d.department, Date: d.date, Month: d.date.slice(0, 7), Status: d.status, Value: round2(d.lines.reduce((x, l) => x + l.qty * l.price, 0)) })) },
  { key: 'stock', label: 'Products & stock', source: 'Trading / Procurement', rows: (s) => s.com.state.products.filter((p) => p.kind !== 'SERVICE').map((p) => ({ SKU: p.sku, Name: p.name, Kind: p.kind, Category: p.category, Stock: p.stock, 'Stock value': round2(p.stock * p.cost), Reorder: needsReorder(s.com.state, p) ? 'Yes' : 'No' })) },
  { key: 'batches', label: 'Production batches', source: 'Production', rows: (s) => s.ops.state.batches.map((b) => ({ Number: b.number, Line: b.line, Date: b.date, Month: b.date.slice(0, 7), Status: b.status, Planned: b.plannedQty, Output: b.output, Rejected: b.rejectedQty })) },
  { key: 'workorders', label: 'Maintenance work orders', source: 'Maintenance', rows: (s) => s.ops.state.workOrders.map((w) => ({ Number: w.number, Machine: s.ops.state.equipment.find((e) => e.id === w.equipmentId)?.name ?? w.equipmentId, Kind: w.kind, Priority: w.priority, Status: w.status, Month: w.date.slice(0, 7), Hours: w.hours, 'Downtime h': w.downtimeHours })) },
  { key: 'tickets', label: 'ICT tickets', source: 'ICT', rows: (s) => s.ctl.state.tickets.map((t) => ({ Number: t.number, Priority: t.priority, Category: t.category, Department: t.department, Channel: t.channel ?? 'Phone', Status: t.status, Breached: slaState(t).resolveBreached ? 'Yes' : 'No', Count: 1 })) },
  { key: 'complaints', label: 'Customer complaints', source: 'Quality', rows: (s) => s.ctl.state.complaints.map((c) => ({ Number: c.number, Customer: s.com.party(c.customerId)?.name ?? c.customerId, SKU: c.sku, Category: c.category, Severity: c.severity, Status: c.status, Month: c.date.slice(0, 7), Rating: c.feedback?.rating ?? '', Count: 1 })) },
  { key: 'staff', label: 'Employees', source: 'People & Payroll', rows: (s) => s.staff.map((e) => ({ 'Staff ID': e.staffId, Name: e.fullName, Department: e.department, Status: e.status, 'Basic pay': e.basicSalaryKes || 0, Count: 1 })) }
];
interface SavedReport {
  id: string;
  name: string;
  dataset: string;
  columns: string[];
  filter: string;
  groupBy: string;
  measure: string;
  by: string;
}
const reportBus = createBus<SavedReport>([
  { id: 'rp1', name: 'Sales by customer', dataset: 'orders', columns: ['Customer', 'Value'], filter: '', groupBy: 'Customer', measure: 'Value', by: 'System' },
  { id: 'rp2', name: 'Downtime by machine', dataset: 'workorders', columns: ['Machine', 'Downtime h'], filter: '', groupBy: 'Machine', measure: 'Downtime h', by: 'System' }
]);

export const ReportBuilderPage: React.FC = () => {
  const s = useSnapshot();
  const access = useAccess();
  const { addToast } = useApp();
  const saved = reportBus.use();
  const [def, setDef] = useState<Omit<SavedReport, 'id' | 'by'>>({ name: '', dataset: 'orders', columns: [], filter: '', groupBy: '', measure: '' });
  const ds = DATASETS.find((d) => d.key === def.dataset)!;
  const all = ds.rows(s);
  const cols = Object.keys(all[0] ?? {});
  const numeric = cols.filter((c) => all.some((r) => typeof r[c] === 'number'));
  const shown = def.columns.length ? def.columns.filter((c) => cols.includes(c)) : cols;
  const filtered = all.filter((r) => !def.filter || Object.values(r).some((v) => String(v).toLowerCase().includes(def.filter.toLowerCase())));
  const grouped = def.groupBy && cols.includes(def.groupBy)
    ? Object.entries(
        filtered.reduce<Record<string, number>>((acc, r) => {
          const k = String(r[def.groupBy]);
          acc[k] = round2((acc[k] ?? 0) + (def.measure ? Number(r[def.measure]) || 0 : 1));
          return acc;
        }, {})
      ).sort((a, b) => b[1] - a[1])
    : null;
  const save = () => {
    if (access.readOnly) return addToast({ type: 'error', title: 'Not allowed', message: 'This is a read-only account — you can view records but not change them' });
    if (!def.name.trim()) return addToast({ type: 'error', title: 'Not saved', message: 'Name the report' });
    if (saved.some((r) => r.name.toLowerCase() === def.name.trim().toLowerCase())) return addToast({ type: 'error', title: 'Not saved', message: 'A report with that name exists' });
    reportBus.push({ ...def, id: pid('rp'), by: access.name });
    addToast({ type: 'success', title: 'Report saved', message: def.name });
  };
  const html = () =>
    `<h1>${esc(def.name || ds.label)}</h1><p>${esc(ds.source)} · ${filtered.length} rows · ${esc(TODAY)}</p><table><thead><tr>${(grouped ? [def.groupBy, def.measure || 'Count'] : shown).map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${(grouped ? grouped.map(([k, v]) => [k, v]) : filtered.map((r) => shown.map((c) => r[c]))).map((r) => `<tr>${r.map((v) => `<td>${esc(String(v))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  type R = Row & { _i: number };
  const columns: Column<R>[] = shown.map((c) => ({ key: c, header: c, render: (r) => (typeof r[c] === 'number' && /value|pay/i.test(c) ? kes(Number(r[c]), { compact: true }) : String(r[c])), sort: (r) => r[c], align: typeof all[0]?.[c] === 'number' ? 'right' : undefined }));
  return (
    <SuitePage
      eyebrow="Business overview"
      title="Report builder"
      subtitle="Design your own report from any module's data: pick the data set, columns and filter, group and total, chart it, save it, export or print it."
      actions={
        <>
          <ExportCsvButton name={def.name || ds.label} header={grouped ? [def.groupBy, def.measure || 'Count'] : shown} rows={() => (grouped ? grouped.map(([k, v]) => [k, v]) : filtered.map((r) => shown.map((c) => r[c])))} />
          <PrintButton title={def.name || ds.label} html={html} />
        </>
      }
    >
      <Panel title="Saved reports">
        <div className="sx-actions">
          {saved.map((r) => (
            <span key={r.id} className="sx-inline-form" style={{ marginTop: 0 }}>
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => setDef({ name: r.name, dataset: r.dataset, columns: r.columns, filter: r.filter, groupBy: r.groupBy, measure: r.measure })}>
                {r.name}
              </button>
              {r.by === access.name && (
                <button type="button" className="btn btn-ghost btn-xs" aria-label={`Delete ${r.name}`} onClick={() => reportBus.set(saved.filter((x) => x.id !== r.id))}>
                  <Trash2 size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
      </Panel>
      <div className="sx-grid">
        <Field label="Data set">
          <select className="form-control" value={def.dataset} onChange={(e) => setDef({ ...def, dataset: e.target.value, columns: [], groupBy: '', measure: '' })}>
            {DATASETS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label} ({d.source})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Filter (any column contains)">
          <input className="form-control" value={def.filter} onChange={(e) => setDef({ ...def, filter: e.target.value })} />
        </Field>
        <Field label="Group by">
          <select className="form-control" value={def.groupBy} onChange={(e) => setDef({ ...def, groupBy: e.target.value })}>
            <option value="">— no grouping —</option>
            {cols.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Total of">
          <select className="form-control" value={def.measure} onChange={(e) => setDef({ ...def, measure: e.target.value })}>
            <option value="">Count of rows</option>
            {numeric.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Columns" span={2}>
          <select className="form-control" multiple size={4} value={def.columns} onChange={(e) => setDef({ ...def, columns: [...e.target.selectedOptions].map((o) => o.value) })}>
            {cols.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Report name" span={2}>
          <div className="sx-inline-form" style={{ marginTop: 0 }}>
            <input className="form-control" value={def.name} onChange={(e) => setDef({ ...def, name: e.target.value })} />
            <button type="button" className="btn btn-primary btn-sm" onClick={save}>
              <Save size={14} /> Save
            </button>
          </div>
        </Field>
      </div>
      {grouped ? (
        <Panel title={`${def.measure || 'Count'} by ${def.groupBy}`} subtitle={`${filtered.length} rows`}>
          <Bars data={grouped.slice(0, 12).map(([k, v]) => ({ label: k.length > 12 ? `${k.slice(0, 11)}…` : k, values: [v] }))} series={[{ name: def.measure || 'Count', color: '#237857' }]} height={200} />
          <ul className="sx-facts">
            {grouped.map(([k, v]) => (
              <li key={k}>
                <span>{k}</span>
                <b>{v.toLocaleString()}</b>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <DataTable rows={filtered.map((r, i) => ({ ...r, _i: i }))} columns={columns} rowKey={(r) => String(r._i)} pageSize={15} />
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Diagnostic, predictive and prescriptive analytics                   */
/* ------------------------------------------------------------------ */

/** Least-squares line through the points; returns the forecast for the next n periods. */
export const linearForecast = (ys: number[], n: number) => {
  const m = ys.length;
  if (m < 2) return Array(n).fill(ys[0] ?? 0) as number[];
  const xs = ys.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / m;
  const my = ys.reduce((a, b) => a + b, 0) / m;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / Math.max(1e-9, xs.reduce((a, x) => a + (x - mx) ** 2, 0));
  return Array.from({ length: n }, (_, k) => round2(Math.max(0, my + slope * (m + k - mx))));
};

export const ForecastsPage: React.FC = () => {
  const s = useSnapshot();
  const { setCurrentView } = useApp();
  const year = Number(TODAY.slice(0, 4));
  const month = Number(TODAY.slice(5, 7));
  const series = monthlySeries(s.fin.state, s.fin.entries, year).slice(0, month);
  const fc = linearForecast(series.map((m) => m.revenue), 3);
  const fcx = linearForecast(series.map((m) => m.expenses), 3);
  // Stock cover: average daily usage from approved orders over 60 days
  const since = addDays(TODAY, -60);
  const cover = s.com.state.products
    .filter((p) => p.kind !== 'SERVICE')
    .map((p) => {
      const used = s.com.state.orders.filter((o) => o.status === 'APPROVED' && o.date >= since).reduce((x, o) => x + o.lines.filter((l) => l.sku === p.sku).reduce((y, l) => y + l.qty, 0), 0);
      const daily = used / 60;
      const days = daily > 0 ? Math.floor(p.stock / daily) : Infinity;
      return { p, daily, days };
    })
    .filter((x) => x.days < 45)
    .sort((a, b) => a.days - b.days);
  // Diagnostic: what drives complaints
  const byCat: Record<string, number> = {};
  s.ctl.state.complaints.forEach((c) => (byCat[`${c.category} · ${c.sku}`] = (byCat[`${c.category} · ${c.sku}`] ?? 0) + 1));
  const drivers = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const late = s.ar.totals[3] + s.ar.totals[4];
  const recs: TodoItem[] = [
    ...cover.slice(0, 4).map((x) => ({ id: `r${x.p.sku}`, tone: (x.days < 14 ? 'critical' : 'warning') as TodoItem['tone'], icon: <Lightbulb size={15} />, title: `Reorder ${x.p.reorderQty} ${x.p.unit} of ${x.p.name}`, detail: `About ${x.days} days of cover at ${x.daily.toFixed(1)}/day`, onClick: () => (s.com.setProcurement('stock'), setCurrentView('procurement')) })),
    ...(late > 0 ? [{ id: 'ar', tone: 'warning' as const, icon: <Lightbulb size={15} />, title: `Chase ${kes(late, { compact: true })} over 60 days old`, detail: 'Put the worst accounts on hold until paid', onClick: () => (s.fin.setPage('invoices'), setCurrentView('finance')) }] : []),
    ...(fc[0] < (series[series.length - 1]?.revenue ?? 0) ? [{ id: 'rev', tone: 'info' as const, icon: <Lightbulb size={15} />, title: 'Revenue is trending down', detail: 'Review the pipeline and push quotations due to close this month', onClick: () => setCurrentView('bizdev') }] : []),
    ...drivers.slice(0, 1).map(([k, n]) => ({ id: 'cmp', tone: 'info' as const, icon: <Lightbulb size={15} />, title: `Most complaints: ${k} (${n})`, detail: 'Raise an improvement opportunity or CAPA on the root cause', onClick: () => (s.ctl.setQuality('reports'), setCurrentView('quality')) })),
    ...s.downAssets.map((e) => ({ id: `d${e.id}`, tone: 'warning' as const, icon: <Lightbulb size={15} />, title: `Schedule preventive maintenance after fixing ${e.name}`, detail: 'Repeated breakdowns cut OEE', onClick: () => (s.ops.setMaintenance('overview'), setCurrentView('maintenance')) }))
  ];
  const names = ['next month', 'in 2 months', 'in 3 months'];
  return (
    <SuitePage eyebrow="Business overview" title="Forecasts & recommendations" subtitle="Diagnostic (what drives the numbers), predictive (trend forecasts, stock-outs) and prescriptive (what to do next) — calculated from live records.">
      <div className="sx-stats">
        {fc.map((v, i) => (
          <Stat key={i} label={`Revenue ${names[i]}`} value={kes(v, { compact: true })} detail={`Costs ${kes(fcx[i], { compact: true })}`} icon={<TrendingUp size={17} />} tone={i === 0 ? 'blue' : 'violet'} />
        ))}
        <Stat label="Stock-outs within 45 days" value={cover.length} icon={<AlertTriangle size={17} />} tone={cover.length ? 'red' : 'green'} />
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title="Recommended actions" subtitle="Prescriptive">
          <TodoList items={recs} max={10} />
        </Panel>
        <Panel title="Revenue trend and forecast" subtitle="Linear trend over this year's months">
          <Bars data={[...series.map((m) => ({ label: m.label, values: [m.revenue, 0] })), ...fc.map((v, i) => ({ label: `F${i + 1}`, values: [0, v] }))]} series={[{ name: 'Actual', color: '#237857' }, { name: 'Forecast', color: '#ddbd72' }]} format={(n) => kes(n, { compact: true }).replace('KES ', '')} />
        </Panel>
      </div>
      <div className="sx-row">
        <Panel title="Predicted stock-outs" subtitle="Days of cover at the last 60 days' order rate">
          <ul className="sx-facts">
            {cover.map((x) => (
              <li key={x.p.sku}>
                <span>{x.p.name}</span>
                <b className={x.days < 14 ? 'sx-danger-text' : ''}>{x.days} days</b>
              </li>
            ))}
            {!cover.length && <li className="sx-muted">No item runs out within 45 days.</li>}
          </ul>
        </Panel>
        <Panel title="Complaint drivers" subtitle="Diagnostic — category and product">
          <ul className="sx-facts">
            {drivers.map(([k, n]) => (
              <li key={k}>
                <span>{k}</span>
                <b>{n}</b>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Data quality                                                         */
/* ------------------------------------------------------------------ */

interface DqIssue {
  id: string;
  check: string;
  module: string;
  record: string;
  problem: string;
  view: NavigationTarget;
}

export const dataQualityIssues = (s: Snap): DqIssue[] => {
  const out: DqIssue[] = [];
  const add = (check: string, module: string, record: string, problem: string, view: NavigationTarget) => out.push({ id: `${check}:${record}:${out.length}`, check, module, record, problem, view });
  const pinOk = (p: string) => /^[AP]\d{9}[A-Z]$/.test(p);
  const mailOk = (m: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m);
  s.fin.state.parties.forEach((p) => {
    if (!pinOk(p.pin)) add('Invalid KRA PIN', 'Finance', p.name, `PIN “${p.pin || 'blank'}” is not in the A000000000X format`, 'finance');
    if (!mailOk(p.email)) add('Missing or bad email', 'Finance', p.name, `Email “${p.email || 'blank'}”`, 'finance');
    if (!p.phone) add('Missing phone', 'Finance', p.name, 'No phone number', 'finance');
  });
  const names: Record<string, number> = {};
  s.fin.state.parties.forEach((p) => (names[p.name.trim().toLowerCase()] = (names[p.name.trim().toLowerCase()] ?? 0) + 1));
  Object.entries(names)
    .filter(([, n]) => n > 1)
    .forEach(([n]) => add('Duplicate party', 'Finance', n, 'Same name on more than one customer/supplier', 'finance'));
  s.com.state.products.forEach((p) => {
    if (p.stock < 0) add('Negative stock', 'Trading', p.sku, `${p.name} shows ${p.stock} ${p.unit}`, 'trading');
    if (p.kind !== 'SERVICE' && p.cost <= 0) add('Zero cost', 'Trading', p.sku, `${p.name} has no unit cost`, 'trading');
    if (p.price > 0 && p.cost > p.price) add('Cost above price', 'Trading', p.sku, `${p.name} sells below cost`, 'trading');
  });
  s.fin.state.documents.forEach((d) => {
    if (!d.lines.length) add('Document without lines', 'Finance', d.number, 'No lines', 'finance');
    if (d.dueDate < d.date) add('Due before document date', 'Finance', d.number, `${d.dueDate} is before ${d.date}`, 'finance');
  });
  s.staff.forEach((e) => {
    if (!mailOk(e.email)) add('Employee email', 'People', e.staffId, `${e.fullName}: “${e.email || 'blank'}”`, 'employees');
    if (!e.basicSalaryKes) add('Employee pay missing', 'People', e.staffId, `${e.fullName} has no basic pay`, 'employees');
  });
  s.ctl.state.assets.forEach((a) => {
    if (a.status === 'IN_USE' && !a.serial) add('Asset without serial', 'ICT', a.tag, a.model, 'ict');
  });
  s.ctl.state.risks.forEach((r) => {
    if (r.residualLikelihood * r.residualImpact > r.likelihood * r.impact) add('Residual above inherent', 'Quality', r.title, 'Controls appear to increase the risk', 'quality');
  });
  return out;
};

export const DataQualityPage: React.FC = () => {
  const s = useSnapshot();
  const { setCurrentView } = useApp();
  const issues = dataQualityIssues(s);
  const [check, setCheck] = useState('ALL');
  const checks = [...new Set(issues.map((i) => i.check))];
  const rows = issues.filter((i) => check === 'ALL' || i.check === check);
  const records = s.fin.state.parties.length + s.com.state.products.length + s.fin.state.documents.length + s.staff.length + s.ctl.state.assets.length + s.ctl.state.risks.length;
  const columns: Column<DqIssue>[] = [
    { key: 'c', header: 'Check', render: (i) => i.check, sort: (i) => i.check },
    { key: 'm', header: 'Module', render: (i) => <span className="sx-tag sx-tag-strong">{i.module}</span>, sort: (i) => i.module, width: 110 },
    { key: 'r', header: 'Record', render: (i) => <b className="sx-mono">{i.record}</b> },
    { key: 'p', header: 'Problem', render: (i) => i.problem, hideOnMobile: true }
  ];
  return (
    <SuitePage
      eyebrow="Business overview"
      title="Data quality"
      subtitle="Automatic checks for inconsistent, incomplete and duplicate data across modules. Click a row to go and fix the record."
      actions={<ExportCsvButton name="data-quality" header={['Check', 'Module', 'Record', 'Problem']} rows={() => issues.map((i) => [i.check, i.module, i.record, i.problem])} />}
    >
      <div className="sx-stats">
        <Stat label="Records checked" value={records} icon={<Database size={17} />} />
        <Stat label="Issues found" value={issues.length} icon={<AlertTriangle size={17} />} tone={issues.length ? 'gold' : 'green'} />
        <Stat label="Data quality score" value={`${Math.max(0, Math.round((1 - issues.length / Math.max(1, records)) * 100))}%`} icon={<CheckCircle2 size={17} />} tone="blue" />
        <Stat label="Checks failing" value={`${checks.length}`} icon={<ShieldAlert size={17} />} tone="violet" />
      </div>
      <div className="sx-toolbar">
        <Chips value={check} onChange={setCheck} options={[{ value: 'ALL', label: 'All', count: issues.length }, ...checks.map((c) => ({ value: c, label: c, count: issues.filter((i) => i.check === c).length }))]} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(i) => i.id} onRowClick={(i) => setCurrentView(i.view)} pageSize={20} empty={<div className="sx-allclear"><CheckCircle2 size={24} /><p>No issues.</p></div>} />
    </SuitePage>
  );
};

/** Export and print helpers for the business overview. */
export const OverviewExport: React.FC = () => {
  const s = useSnapshot();
  const rows: [string, string | number][] = [
    ['Cash in bank', s.cash],
    ['Revenue this year', s.pl.totalIncome],
    ['Net profit this year', s.pl.netProfit],
    ['Customers owe us', s.ar.total],
    ['We owe suppliers', s.ap.total],
    ['Open order book', s.bookValue],
    ['Weighted pipeline', s.pipe.weighted],
    ['Stock at cost', s.stockValue],
    ['Produced this month', s.output],
    ['Headcount', s.staff.length],
    ['High risks', s.highRisks.length],
    ['Overdue filings', s.overdueFilings.length]
  ];
  const { setExecutive } = useHub();
  return (
    <div className="sx-actions">
      <ExportCsvButton name="business-overview" header={['Measure', 'Value']} rows={() => rows} />
      <PrintButton title="Business overview" html={() => `<h1>Business overview</h1><p>${esc(TODAY)}</p><table><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right">${typeof v === 'number' ? esc(v.toLocaleString()) : esc(v)}</td></tr>`).join('')}</tbody></table>`} />
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExecutive('reports')}>
        Build a report
      </button>
    </div>
  );
};
