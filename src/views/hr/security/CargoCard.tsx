import React, { useMemo, useState } from 'react';
import { CheckCircle2, Flag, MapPin, Plus, Search, ShieldCheck, Truck } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { useApprovers } from '../hire/shared';
import { CONSIGNMENT_KINDS, sealMismatch, type Consignment, type ConsignmentKind, type ConsignmentStatus } from '../../../data/securitySeed';
import { Card, Empty, Field, Modal, PersonSelect, Pill, kes, fmt, fmtStamp, useSecOrg, type Tone } from './shared';

const TONE: Record<ConsignmentStatus, Tone> = {
  'Escort requested': 'warning',
  'Escort approved': 'info',
  Loading: 'info',
  'In transit': 'primary',
  Arrived: 'success',
  Incident: 'danger',
  Rejected: 'danger'
};
const FILTERS = ['Active', 'Awaiting approval', 'In transit', 'Incidents', 'Arrived', 'All'] as const;
type Filter = (typeof FILTERS)[number];
const ACTIVE: ConsignmentStatus[] = ['Escort requested', 'Escort approved', 'Loading', 'In transit', 'Incident'];
const splitSeals = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

/** Escorted consignments: tea to the Mombasa auction or port, factory to warehouse, cash in transit. */
export const CargoCard: React.FC = () => {
  const { consignments } = useApp();
  const { orgId, name } = useSecOrg();
  const [filter, setFilter] = useState<Filter>('Active');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState<{ c: Consignment; kind: 'decide' | 'assign' | 'dispatch' | 'checkpoint' | 'arrive' | 'view' } | null>(null);

  const mine = useMemo(() => consignments.filter((c) => c.orgId === orgId), [consignments, orgId]);
  const q = search.trim().toLowerCase();
  const rows = mine
    .filter((c) => {
      const f =
        filter === 'All' ||
        (filter === 'Active' && ACTIVE.includes(c.status)) ||
        (filter === 'Awaiting approval' && c.status === 'Escort requested') ||
        (filter === 'In transit' && c.status === 'In transit') ||
        (filter === 'Incidents' && c.status === 'Incident') ||
        (filter === 'Arrived' && c.status === 'Arrived');
      return f && (!q || `${c.ref} ${c.cargo} ${c.route} ${c.vehicleReg} ${c.driver} ${c.escortGuards.join(' ')}`.toLowerCase().includes(q));
    })
    .sort((a, b) => b.plannedDeparture.localeCompare(a.plannedDeparture));
  const pg = usePaged(rows, 10, `${filter}|${q}|${orgId}`);

  return (
    <Card
      title="Cargo in transit"
      sub="Escorted consignments. Request an escort, get it approved, assign guards and police, then record seals at loading and on arrival. A seal that does not match is a breach."
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={14} /> Request escort
        </button>
      }
    >
      <div className="digicraft-toolbar" style={{ marginBottom: 12 }}>
        <div className="digicraft-search-box">
          <Search size={16} className="digicraft-search-icon" />
          <input type="text" placeholder="Search reference, cargo, vehicle, escort..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="digicraft-filter-pills">
          {FILTERS.map((k) => (
            <button key={k} className={`digicraft-filter-pill ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className="hi-scroll">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Consignment</th>
              <th>Cargo</th>
              <th>Route</th>
              <th>Vehicle / driver</th>
              <th>Escort</th>
              <th>Seals</th>
              <th>Times</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pg.rows.length === 0 && <Empty cols={9}>No consignments match.</Empty>}
            {pg.rows.map((c) => {
              const breach = sealMismatch(c);
              return (
                <tr key={c.id}>
                  <td>
                    <div className="hi-mono">{c.ref}</div>
                    <div className="hi-sub">{c.kind}</div>
                  </td>
                  <td className="hi-wrap" style={{ maxWidth: 240 }}>
                    {c.cargo}
                    <div className="hi-sub">{kes(c.value)}</div>
                  </td>
                  <td className="hi-wrap" style={{ maxWidth: 220 }}>
                    {c.from} → {c.to}
                    <div className="hi-sub">{c.route}</div>
                  </td>
                  <td>
                    {c.vehicleReg}
                    <div className="hi-sub">{c.driver}</div>
                  </td>
                  <td className="hi-wrap">
                    {c.escortGuards.length ? c.escortGuards.join(', ') : <span className="hi-sub">Not assigned</span>}
                    {c.police && <div className="hi-sub">{c.police}</div>}
                  </td>
                  <td>
                    <div className="hi-mono">{c.sealsLoading.length ? c.sealsLoading.join(', ') : '—'}</div>
                    {c.sealsArrival && (
                      <div className="hi-mono" style={breach ? { color: 'var(--status-critical)', fontWeight: 600 } : { color: 'var(--text-secondary)' }}>
                        at arrival: {c.sealsArrival.join(', ')}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="hi-sub">Planned {fmtStamp(c.plannedDeparture)}</div>
                    {c.departure && <div className="hi-sub">Left {fmtStamp(c.departure)}</div>}
                    {c.arrival && <div className="hi-sub">Arrived {fmtStamp(c.arrival)}</div>}
                    {c.checkpoints.length > 0 && <div className="hi-sub">{c.checkpoints.length} checkpoints</div>}
                  </td>
                  <td>
                    <Pill tone={TONE[c.status]}>{c.status}</Pill>
                    {breach && <div className="hi-sub" style={{ color: 'var(--status-critical)' }}>Seal breach{c.incidentId ? ` · ${c.incidentId}` : ''}</div>}
                    {c.status === 'Escort requested' && <div className="hi-sub">By {name(c.requestedBy)}</div>}
                    {c.approval && c.status !== 'Escort requested' && <div className="hi-sub">{c.status === 'Rejected' ? 'Rejected' : 'Approved'} by {name(c.approval.by)}</div>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {c.status === 'Escort requested' && (
                      <button className="btn btn-primary btn-sm" onClick={() => setAction({ c, kind: 'decide' })}>
                        Decide
                      </button>
                    )}
                    {c.status === 'Escort approved' && (
                      <button className="btn btn-primary btn-sm" onClick={() => setAction({ c, kind: 'assign' })}>
                        <ShieldCheck size={13} /> Assign escort
                      </button>
                    )}
                    {c.status === 'Loading' && (
                      <button className="btn btn-primary btn-sm" onClick={() => setAction({ c, kind: 'dispatch' })}>
                        <Truck size={13} /> Depart
                      </button>
                    )}
                    {c.status === 'In transit' && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setAction({ c, kind: 'checkpoint' })}>
                          <MapPin size={13} /> Checkpoint
                        </button>{' '}
                        <button className="btn btn-primary btn-sm" onClick={() => setAction({ c, kind: 'arrive' })}>
                          <Flag size={13} /> Arrived
                        </button>
                      </>
                    )}{' '}
                    <button className="btn btn-secondary btn-sm" onClick={() => setAction({ c, kind: 'view' })}>
                      Log
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="consignments" sizes={[10, 25, 50]} />

      {adding && <RequestModal onClose={() => setAdding(false)} />}
      {action?.kind === 'decide' && <DecideEscortModal c={action.c} onClose={() => setAction(null)} />}
      {action?.kind === 'assign' && <AssignModal c={action.c} onClose={() => setAction(null)} />}
      {action?.kind === 'dispatch' && <SealsModal c={action.c} mode="dispatch" onClose={() => setAction(null)} />}
      {action?.kind === 'arrive' && <SealsModal c={action.c} mode="arrive" onClose={() => setAction(null)} />}
      {action?.kind === 'checkpoint' && <CheckpointModal c={action.c} onClose={() => setAction(null)} />}
      {action?.kind === 'view' && <LogModal c={mine.find((x) => x.id === action.c.id) ?? action.c} onClose={() => setAction(null)} />}
    </Card>
  );
};

const RequestModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { requestEscort } = useApp();
  const { staff, site, today } = useSecOrg();
  const [kind, setKind] = useState<ConsignmentKind>('Factory to warehouse');
  const [cargo, setCargo] = useState('');
  const [value, setValue] = useState('');
  const [from, setFrom] = useState(site);
  const [to, setTo] = useState('');
  const [route, setRoute] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [driver, setDriver] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('18:00');
  const ok = cargo.trim() && Number(value) > 0 && from.trim() && to.trim() && vehicleReg.trim() && driver.trim() && requestedBy;
  return (
    <Modal
      title="Request security escort"
      subtitle="Security requisition: approved by a manager before guards are assigned."
      onClose={onClose}
      width={780}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              requestEscort({ kind, cargo: cargo.trim(), value: Number(value), from: from.trim(), to: to.trim(), route: route.trim() || `${from.trim()} – ${to.trim()}`, vehicleReg: vehicleReg.trim(), driver: driver.trim(), requestedBy, plannedDeparture: `${date}T${time}` });
              onClose();
            }}
          >
            Send request
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Movement">
          <select className="form-control" value={kind} onChange={(e) => setKind(e.target.value as ConsignmentKind)}>
            {CONSIGNMENT_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="Requested by">
          <PersonSelect value={requestedBy} onChange={setRequestedBy} people={staff} />
        </Field>
        <Field label="Cargo" wide>
          <input className="form-control" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="e.g. 240 bags made tea (BP1, PF1), 14,400 kg — 41 lots" />
        </Field>
        <Field label="Value (KES)">
          <input className="form-control" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="From">
          <input className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Route">
          <input className="form-control" value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Main towns and planned stops" />
        </Field>
        <Field label="Vehicle">
          <input className="form-control" value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} placeholder="Truck + trailer" />
        </Field>
        <Field label="Driver">
          <input className="form-control" value={driver} onChange={(e) => setDriver(e.target.value)} />
        </Field>
        <Field label="Planned departure (date)">
          <input className="form-control" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Planned departure (time)">
          <input className="form-control" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

const DecideEscortModal: React.FC<{ c: Consignment; onClose: () => void }> = ({ c, onClose }) => {
  const { decideEscort } = useApp();
  const approvers = useApprovers();
  const [by, setBy] = useState(approvers[0]?.staffId ?? '');
  const [note, setNote] = useState('');
  const act = (approve: boolean) => {
    decideEscort(c.id, approve, note.trim(), by);
    onClose();
  };
  return (
    <Modal
      title={`Escort request ${c.ref}`}
      subtitle={`${c.kind} · ${kes(c.value)} · planned ${fmtStamp(c.plannedDeparture)}`}
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="btn btn-secondary" disabled={!by || !note.trim()} title="Give a reason to reject" onClick={() => act(false)}>
            Reject
          </button>
          <button className="btn btn-primary" disabled={!by} onClick={() => act(true)}>
            <CheckCircle2 size={14} /> Approve
          </button>
        </>
      }
    >
      <div className="pr-note">
        {c.cargo}. {c.from} → {c.to} via {c.route}. Vehicle {c.vehicleReg}, driver {c.driver}.
        {c.value >= 1_000_000 && ' Over KES 1m: police escort recommended.'}
      </div>
      <div className="pr-form-grid">
        <Field label="Approved by">
          <PersonSelect value={by} onChange={setBy} people={approvers} />
        </Field>
        <Field label="Note">
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

const AssignModal: React.FC<{ c: Consignment; onClose: () => void }> = ({ c, onClose }) => {
  const { assignEscort } = useApp();
  const { guards, name } = useSecOrg();
  const [picked, setPicked] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [police, setPolice] = useState('');
  const all = [...picked, ...extra.split(',').map((x) => x.trim()).filter(Boolean)];
  return (
    <Modal
      title={`Assign escort — ${c.ref}`}
      subtitle={`Approved by ${name(c.approval?.by)} · ${c.approval?.note ?? ''}`}
      onClose={onClose}
      width={640}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={all.length === 0}
            onClick={() => {
              assignEscort(c.id, all, police.trim());
              onClose();
            }}
          >
            Assign and start loading
          </button>
        </>
      }
    >
      <Field label="Guards from the roster" wide>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {guards.map((g) => (
            <label key={g} className="digicraft-filter-pill" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={picked.includes(g)} onChange={(e) => setPicked((list) => (e.target.checked ? [...list, g] : list.filter((x) => x !== g)))} /> {g}
            </label>
          ))}
        </div>
      </Field>
      <div className="pr-form-grid">
        <Field label="Other guards" hint="Comma separated">
          <input className="form-control" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </Field>
        <Field label="Police escort" hint="Unit, officers and escort reference">
          <input className="form-control" value={police} onChange={(e) => setPolice(e.target.value)} placeholder="e.g. AP escort: Cpl. … + 1, ref …" />
        </Field>
      </div>
    </Modal>
  );
};

const SealsModal: React.FC<{ c: Consignment; mode: 'dispatch' | 'arrive'; onClose: () => void }> = ({ c, mode, onClose }) => {
  const { dispatchConsignment, recordArrival } = useApp();
  const [seals, setSeals] = useState(c.sealsLoading.join(', '));
  const list = splitSeals(seals);
  const mismatch = mode === 'arrive' && list.length > 0 && (list.length !== c.sealsLoading.length || list.some((s) => !c.sealsLoading.includes(s)));
  return (
    <Modal
      title={mode === 'dispatch' ? `Departure — ${c.ref}` : `Arrival — ${c.ref}`}
      subtitle={mode === 'dispatch' ? 'Record the seals fitted at loading. The departure time is stamped now.' : `Seals at loading: ${c.sealsLoading.join(', ') || '—'}. Read the seals on the vehicle now.`}
      onClose={onClose}
      width={600}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={list.length === 0}
            onClick={() => {
              if (mode === 'dispatch') dispatchConsignment(c.id, list);
              else recordArrival(c.id, list);
              onClose();
            }}
          >
            {mode === 'dispatch' ? 'Record departure' : mismatch ? 'Record arrival and report breach' : 'Record arrival'}
          </button>
        </>
      }
    >
      <Field label="Seal numbers" hint="Comma separated, as printed on the seal" wide>
        <input className="form-control hi-mono" value={seals} onChange={(e) => setSeals(e.target.value)} />
      </Field>
      {mismatch && <div className="pr-note warn">These seals do not match the seals at loading. Saving will mark the consignment as an incident and open a breach-of-seal investigation.</div>}
    </Modal>
  );
};

const CheckpointModal: React.FC<{ c: Consignment; onClose: () => void }> = ({ c, onClose }) => {
  const { addCheckpoint } = useApp();
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('Seals intact');
  return (
    <Modal
      title={`Checkpoint — ${c.ref}`}
      subtitle="Escort reports position and seal status; time is stamped now."
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!place.trim()}
            onClick={() => {
              addCheckpoint(c.id, { place: place.trim(), note: note.trim() });
              onClose();
            }}
          >
            Log checkpoint
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Place">
          <input className="form-control" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Gilgil weighbridge" />
        </Field>
        <Field label="Note">
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

const LogModal: React.FC<{ c: Consignment; onClose: () => void }> = ({ c, onClose }) => {
  const { name } = useSecOrg();
  const events = [
    { at: `${c.requestedOn}T00:00`, text: `Escort requested by ${name(c.requestedBy)}`, day: true },
    ...(c.approval ? [{ at: `${c.approval.on}T00:00`, text: `${c.status === 'Rejected' ? 'Rejected' : 'Approved'} by ${name(c.approval.by)}: ${c.approval.note}`, day: true }] : []),
    ...(c.departure ? [{ at: c.departure, text: `Departed with seals ${c.sealsLoading.join(', ')}`, day: false }] : []),
    ...c.checkpoints.map((cp) => ({ at: cp.at, text: `${cp.place}: ${cp.note}`, day: false })),
    ...(c.arrival ? [{ at: c.arrival, text: `Arrived at ${c.to}; seals ${c.sealsArrival?.join(', ')}${sealMismatch(c) ? ' — DO NOT MATCH' : ' — match'}`, day: false }] : [])
  ];
  return (
    <Modal title={`Movement log — ${c.ref}`} subtitle={`${c.cargo} · ${c.from} → ${c.to}`} onClose={onClose} width={700}>
      <table className="hr-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Event</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => (
            <tr key={i}>
              <td style={{ whiteSpace: 'nowrap' }}>{e.day ? fmt(e.at.slice(0, 10)) : fmtStamp(e.at)}</td>
              <td className="hi-wrap">{e.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="hi-sub">
        Escort: {c.escortGuards.join(', ') || 'not assigned'}
        {c.police ? ` · ${c.police}` : ''}
      </div>
    </Modal>
  );
};
