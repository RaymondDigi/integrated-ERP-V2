import React, { useState } from 'react';
import { LayoutDashboard, Truck, Route, Fuel, Wrench, AlertTriangle, Play, Flag, Plus, Gauge, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useOperations, type FleetPage } from './store';
import { fuelEfficiency, kmToService, vehicleAlerts } from './engine';
import { addDays, fmtDate, kes, round2, TODAY } from '../finance/engine';
import type { Trip, Vehicle } from './types';
import { DataTable, DefList, Drawer, Field, Hero, LinkButton, Meter, Modal, Panel, Pill, Stat, SuitePage, TodoList, greeting, type Column, type TodoItem } from '../ui/kit';
import { SuiteSidebar, type SuiteNavGroup } from '../ui/SuiteSidebar';
import { Crumb, useFocus, useTopOnChange } from './parts';
import { TechFooter } from './technical';
import { FLEET_EXT_LABEL, FLEET_EXT_GROUPS, FleetExtPages } from './fleet/pages';
import { useFleetExt } from './fleet/store';
import { useContainers } from './containers/store';
import { policyDays } from './fleet/engine';

const LABEL: Record<FleetPage, string> = { overview: 'Overview', vehicles: 'Vehicles', trips: 'Trips', fuel: 'Fuel', ...FLEET_EXT_LABEL };
const V_PILL: Record<Vehicle['status'], [string, string]> = { AVAILABLE: ['POSTED', 'Available'], ON_TRIP: ['OPEN', 'On a trip'], IN_WORKSHOP: ['OVERDUE', 'In workshop'] };

/** Book a service: raises a preventive work order in Maintenance. */
const useBookService = () => {
  const { state, raiseWorkOrder, setMaintenance } = useOperations();
  const { setCurrentView } = useApp();
  return (v: Vehicle) => {
    const eq = state.equipment.find((e) => e.vehicleId === v.id);
    if (!eq) return;
    const r = raiseWorkOrder({ equipmentId: eq.id, title: `Scheduled service at ${v.odometer.toLocaleString()} km`, kind: 'PREVENTIVE', priority: 'NORMAL', due: addDays(TODAY, 3), notes: vehicleAlerts(v).join('; ') });
    if (r.ok && r.id) {
      setMaintenance('workorders', r.id);
      setCurrentView('maintenance');
    }
  };
};

const FOverview: React.FC = () => {
  const { state, actor, setFleet: go } = useOperations();
  const month = state.fuel.filter((f) => f.date.slice(0, 7) === TODAY.slice(0, 7) || f.date >= addDays(TODAY, -30));
  const fuelCost = round2(month.reduce((x, f) => x + f.cost, 0));
  const km30 = state.trips.filter((t) => t.status === 'DONE' && t.date >= addDays(TODAY, -30)).reduce((x, t) => x + ((t.endKm ?? t.startKm) - t.startKm), 0);
  const todo: TodoItem[] = [
    ...state.vehicles.flatMap((v) => vehicleAlerts(v).map((a, i) => ({ id: `${v.id}${i}`, tone: (a.includes('overdue') || a.includes('expired') ? 'critical' : 'warning') as TodoItem['tone'], icon: a.includes('Service') ? <Wrench size={15} /> : <ShieldAlert size={15} />, title: `${v.reg}: ${a}`, detail: v.model, onClick: () => go('vehicles', v.id) }))),
    ...state.trips.filter((t) => t.status === 'ON_ROAD').map((t) => ({ id: t.id, tone: 'info' as const, icon: <Route size={15} />, title: `Close ${t.number} when back`, detail: `${state.vehicles.find((v) => v.id === t.vehicleId)?.reg} · ${t.route}`, onClick: () => go('trips', t.id) })),
    ...state.vehicles
      .map((v) => ({ v, e: fuelEfficiency(state, v.id) }))
      .filter((x) => x.e.last !== null && x.e.avg !== null && x.e.last < x.e.avg * 0.85)
      .map((x) => ({ id: `f${x.v.id}`, tone: 'warning' as const, icon: <Fuel size={15} />, title: `${x.v.reg} fuel use is up`, detail: `${x.e.last} km/l against an average of ${x.e.avg}`, onClick: () => go('fuel') }))
  ];
  return (
    <div className="sx-page">
      <Hero
        eyebrow={`${greeting()}, ${actor.name.split(' ')[0]} · ${actor.title}`}
        title="Transport & fleet"
        text={`${state.vehicles.filter((v) => v.status === 'ON_TRIP').length} vehicles on the road · ${state.vehicles.filter((v) => v.status === 'IN_WORKSHOP').length} in the workshop · ${todo.length} alerts`}
        actions={[
          { label: 'Start a trip', icon: <Play size={16} />, onClick: () => go('trips', 'new') },
          { label: 'Log fuel', icon: <Fuel size={16} />, onClick: () => go('fuel', 'new') },
          { label: 'Vehicles', icon: <Truck size={16} />, onClick: () => go('vehicles') }
        ]}
      />
      <div className="sx-stats">
        <Stat label="Fleet available" value={`${state.vehicles.filter((v) => v.status !== 'IN_WORKSHOP').length}/${state.vehicles.length}`} detail="Not in the workshop" icon={<Truck size={17} />} onClick={() => go('vehicles')} />
        <Stat label="Distance, last 30 days" value={`${km30.toLocaleString()} km`} detail={`${state.trips.filter((t) => t.date >= addDays(TODAY, -30)).length} trips`} icon={<Route size={17} />} tone="blue" onClick={() => go('trips')} />
        <Stat label="Fuel, last 30 days" value={kes(fuelCost, { compact: true })} detail={`${round2(month.reduce((x, f) => x + f.litres, 0)).toLocaleString()} litres`} icon={<Fuel size={17} />} tone="gold" onClick={() => go('fuel')} />
        <Stat label="Compliance alerts" value={state.vehicles.reduce((x, v) => x + vehicleAlerts(v).length, 0)} detail="Service, insurance, inspection" icon={<AlertTriangle size={17} />} tone="red" onClick={() => go('vehicles')} />
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title={<>Needs your attention {todo.length > 0 && <span className="sx-count">{todo.length}</span>}</>} subtitle="Services, documents, open trips and fuel use">
          <TodoList items={todo} />
        </Panel>
        <Panel title="Fuel efficiency" subtitle="Average km per litre" action={<LinkButton onClick={() => go('fuel')}>Fuel log</LinkButton>}>
          <ul className="sx-barlist">
            {state.vehicles.map((v) => {
              const e = fuelEfficiency(state, v.id);
              return (
                <li key={v.id}>
                  <div>
                    <span>
                      {v.reg} · {v.model.split(' ').slice(0, 2).join(' ')}
                    </span>
                    <b>{e.avg ?? '—'} km/l</b>
                  </div>
                  <Meter value={(e.avg ?? 0) / 15} tone={e.last !== null && e.avg !== null && e.last < e.avg * 0.85 ? 'gold' : 'green'} />
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
};

const VehiclesPage: React.FC = () => {
  const { state, fleet } = useOperations();
  const [openId, setOpenId] = useState<string | null>(null);
  useFocus(fleet.focus, (id) => state.vehicles.some((v) => v.id === id), setOpenId);
  const columns: Column<Vehicle>[] = [
    {
      key: 'r',
      header: 'Vehicle',
      render: (v) => (
        <div className="sx-cell-main">
          <span>{v.reg}</span>
          <small>
            {v.model} · {v.driver}
          </small>
        </div>
      ),
      sort: (v) => v.reg
    },
    { key: 'o', header: 'Odometer', render: (v) => `${v.odometer.toLocaleString()} km`, sort: (v) => v.odometer, align: 'right', hideOnMobile: true },
    {
      key: 's',
      header: 'Next service',
      render: (v) => {
        const km = kmToService(v);
        return <span className={km <= 0 ? 'sx-danger-text' : km <= 800 ? 'sx-danger-text' : ''}>{km <= 0 ? `${Math.abs(km).toLocaleString()} km overdue` : `in ${km.toLocaleString()} km`}</span>;
      },
      sort: kmToService
    },
    { key: 'i', header: 'Insurance', render: (v) => fmtDate(v.insuranceExpiry), sort: (v) => v.insuranceExpiry, hideOnMobile: true },
    { key: 'a', header: 'Alerts', render: (v) => (vehicleAlerts(v).length ? <Pill status="OVERDUE" label={`${vehicleAlerts(v).length}`} /> : <span className="sx-muted">—</span>), align: 'center' },
    { key: 'st', header: 'Status', render: (v) => <Pill status={V_PILL[v.status][0]} label={V_PILL[v.status][1]} />, sort: (v) => v.status }
  ];
  const open = state.vehicles.find((v) => v.id === openId);
  return (
    <SuitePage eyebrow="Fleet" title="Vehicles" subtitle="Each vehicle's service interval, insurance and inspection, and how hard it is working.">
      <DataTable rows={state.vehicles} columns={columns} rowKey={(v) => v.id} onRowClick={(v) => setOpenId(v.id)} selected={openId} />
      {open && <VehicleDrawer v={open} onClose={() => setOpenId(null)} />}
    </SuitePage>
  );
};

const VehicleDrawer: React.FC<{ v: Vehicle; onClose: () => void }> = ({ v, onClose }) => {
  const { state } = useOperations();
  const fx = useFleetExt();
  const policies = fx.state.policies.filter((p) => p.vehicleId === v.id && p.status === 'ACTIVE');
  const pos = fx.state.positions[v.id];
  const book = useBookService();
  const e = fuelEfficiency(state, v.id);
  const trips = state.trips.filter((t) => t.vehicleId === v.id).slice(0, 6);
  const alerts = vehicleAlerts(v);
  const openWo = state.workOrders.find((w) => state.equipment.find((x) => x.id === w.equipmentId)?.vehicleId === v.id && w.status !== 'COMPLETED' && w.status !== 'CANCELLED');
  return (
    <Drawer
      wide
      title={v.reg}
      subtitle={`${v.model} · ${v.driver}`}
      badge={<Pill status={V_PILL[v.status][0]} label={V_PILL[v.status][1]} />}
      onClose={onClose}
      footer={
        openWo ? (
          <span className="sx-note">
            <Wrench size={13} /> {openWo.number} is open in Maintenance
          </span>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => book(v)}>
            <Wrench size={14} /> Book a service
          </button>
        )
      }
    >
      {alerts.length > 0 && (
        <div className="sx-callout warn">
          <AlertTriangle size={16} />
          <div>
            {alerts.map((a) => (
              <span key={a}>• {a}</span>
            ))}
          </div>
        </div>
      )}
      <DefList
        items={[
          ['Odometer', `${v.odometer.toLocaleString()} km`],
          ['Service every', `${v.serviceEveryKm.toLocaleString()} km`],
          ['Last service', `${v.lastServiceKm.toLocaleString()} km`],
          ['Capacity', `${v.capacityKg.toLocaleString()} kg`],
          ['Insurance to', fmtDate(v.insuranceExpiry)],
          ['Inspection to', fmtDate(v.inspectionExpiry)],
          ['Fuel economy', e.avg ? `${e.avg} km/l` : '—'],
          ['Last fill-up', e.last ? `${e.last} km/l` : '—']
        ]}
      />
      {v.ownership === 'HIRED' && <p className="sx-note">Hired truck — {fx.state.carriers.find((c) => c.id === v.carrierId)?.name}</p>}
      {policies.length > 0 && (
        <>
          <h4 className="sx-subhead">Insurance</h4>
          <ul className="sx-facts">
            {policies.map((p) => (
              <li key={p.id}>
                <span>
                  {p.insurer} · {p.policyNo} · {p.cover.replace(/_/g, ' ').toLowerCase()}
                </span>
                <b className={policyDays(p) <= 30 ? 'sx-danger-text' : ''}>to {fmtDate(p.expiry)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      {pos && <p className="sx-muted">Last position (simulated telematics): near {pos.place}, {pos.speed} km/h, fuel {pos.fuelPct}%</p>}
      <h4 className="sx-subhead">Service interval</h4>
      <div className="sx-meter-cell">
        <Meter value={(v.odometer - v.lastServiceKm) / v.serviceEveryKm} tone={kmToService(v) <= 0 ? 'red' : kmToService(v) <= 800 ? 'gold' : 'green'} />
        <small>{Math.round(((v.odometer - v.lastServiceKm) / v.serviceEveryKm) * 100)}%</small>
      </div>
      <h4 className="sx-subhead">Recent trips</h4>
      <ul className="sx-list">
        {trips.map((t) => (
          <li key={t.id}>
            <span className="sx-mono">{t.number}</span>
            <span>{fmtDate(t.date)}</span>
            <span className="sx-muted">{t.route}</span>
            <b>{t.endKm ? `${(t.endKm - t.startKm).toLocaleString()} km` : 'On the road'}</b>
          </li>
        ))}
      </ul>
    </Drawer>
  );
};

const TripsPage: React.FC = () => {
  const { state, fleet, endTrip } = useOperations();
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [km, setKm] = useState('');
  useFocus(fleet.focus, (id) => state.trips.some((t) => t.id === id), setClosing, () => setAdding(true));
  const reg = (id: string) => state.vehicles.find((v) => v.id === id)?.reg ?? '';
  const columns: Column<Trip>[] = [
    { key: 'n', header: 'Trip', render: (t) => <b className="sx-mono">{t.number}</b>, sort: (t) => t.number, width: 130 },
    {
      key: 'v',
      header: 'Vehicle and driver',
      render: (t) => (
        <div className="sx-cell-main">
          <span>{reg(t.vehicleId)}</span>
          <small>{t.driver}</small>
        </div>
      )
    },
    {
      key: 'p',
      header: 'Purpose',
      render: (t) => (
        <div className="sx-cell-main">
          <span>{t.purpose}</span>
          <small>{t.route}</small>
        </div>
      )
    },
    { key: 'd', header: 'Date', render: (t) => fmtDate(t.date), sort: (t) => t.date, hideOnMobile: true },
    { key: 'k', header: 'Distance', render: (t) => (t.endKm ? `${(t.endKm - t.startKm).toLocaleString()} km` : '—'), align: 'right' },
    {
      key: 's',
      header: 'Status',
      render: (t) =>
        t.status === 'ON_ROAD' ? (
          <button type="button" className="btn btn-secondary btn-xs" onClick={(e) => (e.stopPropagation(), setClosing(t.id), setKm(''))}>
            <Flag size={12} /> Close trip
          </button>
        ) : (
          <Pill status={t.status === 'DONE' ? 'POSTED' : 'DRAFT'} label={t.status === 'DONE' ? 'Done' : 'Planned'} />
        )
    }
  ];
  const trip = state.trips.find((t) => t.id === closing && t.status === 'ON_ROAD');
  return (
    <SuitePage
      eyebrow="Fleet"
      title="Trips"
      subtitle="Every journey with its odometer readings. Deliveries from Trading are logged here automatically."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Play size={15} /> Start a trip
        </button>
      }
    >
      <DataTable rows={state.trips} columns={columns} rowKey={(t) => t.id} initialSort={{ key: 'd', dir: 'desc' }} />
      {trip && (
        <Modal
          size="md"
          title={`Close ${trip.number}`}
          subtitle={`${reg(trip.vehicleId)} left at ${trip.startKm.toLocaleString()} km`}
          onClose={() => setClosing(null)}
          footer={
            <>
              <span className="sx-grow" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => endTrip(trip.id, Number(km)).ok && setClosing(null)}>
                Close trip
              </button>
            </>
          }
        >
          <Field label="Closing odometer (km)" span={4} hint={Number(km) > trip.startKm ? `${(Number(km) - trip.startKm).toLocaleString()} km travelled` : undefined}>
            <input className="form-control" type="number" value={km} onChange={(e) => setKm(e.target.value)} autoFocus />
          </Field>
        </Modal>
      )}
      {adding && <StartTrip onClose={() => setAdding(false)} />}
    </SuitePage>
  );
};

const StartTrip: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, startTrip } = useOperations();
  const fx = useFleetExt();
  const avail = state.vehicles.filter((v) => v.status === 'AVAILABLE');
  const [vehicleId, setVehicle] = useState(avail[0]?.id ?? '');
  const [purpose, setPurpose] = useState('');
  const [route, setRoute] = useState('');
  const [driver, setDriver] = useState('');
  const [kind, setKind] = useState<'DELIVERY' | 'REQUEST'>('DELIVERY');
  const [requestId, setRequestId] = useState('');
  const [loadKg, setLoadKg] = useState('');
  const approved = fx.state.requests.filter((r) => r.status === 'APPROVED');
  return (
    <Modal
      size="md"
      title="Start a trip"
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => startTrip(vehicleId, purpose, route, driver, { kind, requestId: kind === 'REQUEST' ? requestId : undefined, loadKg: loadKg ? Number(loadKg) : undefined }).ok && onClose()}>
            <Play size={14} /> Start
          </button>
        </>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Field label="Trip type" span={2} hint={kind === 'REQUEST' ? 'Administrative and other trips go against an approved vehicle request' : undefined}>
          <select className="form-control" value={kind} onChange={(e) => setKind(e.target.value as 'DELIVERY' | 'REQUEST')} aria-label="Trip type">
            <option value="DELIVERY">Customer delivery</option>
            <option value="REQUEST">Against a vehicle request</option>
          </select>
        </Field>
        {kind === 'REQUEST' && (
          <Field label="Approved request" required span={2}>
            <select
              className="form-control"
              value={requestId}
              onChange={(e) => {
                const r = approved.find((x) => x.id === e.target.value);
                setRequestId(e.target.value);
                if (r) {
                  setPurpose(`${r.number}: ${r.purpose}`);
                  setRoute(r.route);
                }
              }}
              aria-label="Approved request"
            >
              <option value="">Choose…</option>
              {approved.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.number} — {r.purpose} ({r.requestedBy})
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Vehicle" span={2}>
          <select className="form-control" value={vehicleId} onChange={(e) => setVehicle(e.target.value)}>
            {state.vehicles.map((v) => (
              <option key={v.id} value={v.id} disabled={v.status !== 'AVAILABLE'}>
                {v.reg} · {v.model} {v.status !== 'AVAILABLE' ? `(${V_PILL[v.status][1].toLowerCase()})` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Purpose" required span={2}>
          <input className="form-control" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Customer visit" />
        </Field>
        <Field label="Route" required>
          <input className="form-control" value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Nairobi → Nakuru" />
        </Field>
        <Field label="Driver">
          <input className="form-control" value={driver} onChange={(e) => setDriver(e.target.value)} placeholder={state.vehicles.find((v) => v.id === vehicleId)?.driver} />
        </Field>
        <Field label="Load (kg)" hint={`Capacity ${state.vehicles.find((v) => v.id === vehicleId)?.capacityKg.toLocaleString()} kg`}>
          <input className="form-control" type="number" min="0" value={loadKg} onChange={(e) => setLoadKg(e.target.value)} aria-label="Load kg" />
        </Field>
      </div>
    </Modal>
  );
};

const FuelPage: React.FC = () => {
  const { state, fleet, logFuel } = useOperations();
  const [adding, setAdding] = useState(false);
  useFocus(fleet.focus, () => false, () => undefined, () => setAdding(true));
  const [f, setF] = useState({ vehicleId: state.vehicles[0].id, litres: '', cost: '', odometer: '', station: 'Kilele Fuel — Mombasa Rd' });
  const reg = (id: string) => state.vehicles.find((v) => v.id === id)?.reg ?? '';
  type Row = (typeof state.fuel)[number];
  const columns: Column<Row>[] = [
    { key: 'd', header: 'Date', render: (x) => fmtDate(x.date), sort: (x) => x.date },
    { key: 'v', header: 'Vehicle', render: (x) => reg(x.vehicleId), sort: (x) => reg(x.vehicleId) },
    { key: 'l', header: 'Litres', render: (x) => x.litres, align: 'right' },
    { key: 'c', header: 'Cost', render: (x) => kes(x.cost), sort: (x) => x.cost, align: 'right' },
    { key: 'o', header: 'Odometer', render: (x) => x.odometer.toLocaleString(), align: 'right', hideOnMobile: true },
    {
      key: 'e',
      header: 'km/l',
      render: (x) => {
        const leg = fuelEfficiency(state, x.vehicleId).legs.find((l) => l.date === x.date);
        const avg = fuelEfficiency(state, x.vehicleId).avg ?? 0;
        return leg ? <b className={leg.kmpl < avg * 0.85 ? 'sx-danger-text' : ''}>{leg.kmpl}</b> : <span className="sx-muted">—</span>;
      },
      align: 'right'
    },
    { key: 's', header: 'Station', render: (x) => x.station, hideOnMobile: true }
  ];
  return (
    <SuitePage
      eyebrow="Fleet"
      title="Fuel"
      subtitle="Every fill-up with the distance since the last one. Unusually high consumption is flagged in red."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> Log fuel
        </button>
      }
    >
      <div className="sx-stats">
        {state.vehicles.slice(0, 4).map((v) => {
          const e = fuelEfficiency(state, v.id);
          return <Stat key={v.id} label={v.reg} value={`${e.avg ?? '—'} km/l`} detail={e.last ? `Last fill-up ${e.last} km/l` : 'No history'} icon={<Gauge size={17} />} tone={e.last !== null && e.avg !== null && e.last < e.avg * 0.85 ? 'red' : 'green'} />;
        })}
      </div>
      <DataTable rows={state.fuel} columns={columns} rowKey={(x) => x.id} initialSort={{ key: 'd', dir: 'desc' }} />
      {adding && (
        <Modal
          size="md"
          title="Log a fill-up"
          onClose={() => setAdding(false)}
          footer={
            <>
              <span className="sx-grow" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => logFuel(f.vehicleId, Number(f.litres), Number(f.cost), Number(f.odometer), f.station).ok && setAdding(false)}>
                Save
              </button>
            </>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="Vehicle" span={2}>
              <select className="form-control" value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}>
                {state.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.reg} · {v.model}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Litres">
              <input className="form-control" type="number" value={f.litres} onChange={(e) => setF({ ...f, litres: e.target.value })} />
            </Field>
            <Field label="Cost (KES)">
              <input className="form-control" type="number" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />
            </Field>
            <Field label="Odometer" hint={`Last reading ${state.vehicles.find((v) => v.id === f.vehicleId)?.odometer.toLocaleString()} km`}>
              <input className="form-control" type="number" value={f.odometer} onChange={(e) => setF({ ...f, odometer: e.target.value })} />
            </Field>
            <Field label="Station">
              <input className="form-control" value={f.station} onChange={(e) => setF({ ...f, station: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

export const FleetSidebar: React.FC = () => {
  const { state, fleet, setFleet } = useOperations();
  const fx = useFleetExt();
  const cx = useContainers();
  const groups: SuiteNavGroup<FleetPage>[] = [
    { label: 'Fleet', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
    {
      label: 'Run',
      items: [
        { id: 'vehicles', label: 'Vehicles', icon: Truck, badge: state.vehicles.filter((v) => vehicleAlerts(v).length).length, badgeTone: 'critical' },
        { id: 'trips', label: 'Trips', icon: Route, badge: state.trips.filter((t) => t.status === 'ON_ROAD').length, badgeTone: 'neutral' },
        { id: 'fuel', label: 'Fuel', icon: Fuel }
      ]
    }
  ];
  // Pages added by the transport, compliance and container extension slot into these groups
  for (const g of FLEET_EXT_GROUPS(state, fx.state, cx.state)) {
    const at = groups.find((x) => x.label === g.label);
    if (at) at.items.push(...g.items);
    else groups.push(g);
  }
  return <SuiteSidebar name="Transport & Fleet" tagline="Vehicles · trips · tea runs · containers" icon={Truck} groups={groups} active={fleet.page} onSelect={(p) => setFleet(p)} footer={<TechFooter />} />;
};
export const FleetCrumb: React.FC = () => {
  const { fleet, setFleet } = useOperations();
  return <Crumb name="Transport & Fleet" page={fleet.page} label={LABEL[fleet.page]} onHome={() => setFleet('overview')} />;
};
export const FleetSuite: React.FC = () => {
  const { fleet } = useOperations();
  useTopOnChange(fleet.page);
  return (
    <div className="sx-suite" key={fleet.page}>
      {fleet.page === 'overview' && <FOverview />}
      {fleet.page === 'vehicles' && <VehiclesPage />}
      {fleet.page === 'trips' && <TripsPage />}
      {fleet.page === 'fuel' && <FuelPage />}
      <FleetExtPages page={fleet.page} />
    </div>
  );
};
