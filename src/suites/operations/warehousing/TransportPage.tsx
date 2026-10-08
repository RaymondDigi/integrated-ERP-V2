import React, { useState } from 'react';
import { BarChart3, Layers, Plus, Radar, Truck } from 'lucide-react';
import { notify } from '../../../platform/outbox';
import { useAccess } from '../../../platform/access';
import { addDays, fmtDate, kes, TODAY } from '../../finance/engine';
import { Chips, DataTable, DefList, Drawer, Field, Modal, Pill, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { useShippingExt } from '../shipping/store';
import { siKg } from '../shipping/engine';
import { carrierKpis, consolidate, LANES, rateShop } from './engine';
import { useWarehouseExt } from './store';
import type { Load } from './types';
import { num, ReadOnlyNote, SimBadge } from './ui';

const L_PILL: Record<Load['status'], string> = { PLANNED: 'DRAFT', TENDERED: 'SUBMITTED', IN_TRANSIT: 'OPEN', DELIVERED: 'POSTED', TURNED_BACK: 'REJECTED' };
type Tab = 'loads' | 'consolidate' | 'carriers' | 'performance';

export const TransportPage: React.FC = () => {
  const { state, createLoad } = useWarehouseExt();
  const shp = useShippingExt();
  const { readOnly } = useAccess();
  const [tab, setTab] = useState<Tab>('loads');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const carrier = (id?: string) => state.carriers.find((c) => c.id === id);
  const cols: Column<Load>[] = [
    { key: 'n', header: 'Load', render: (l) => <b className="sx-mono">{l.number}</b>, sort: (l) => l.number },
    { key: 'l', header: 'Lane', render: (l) => <div className="sx-cell-main"><span>{l.lane}</span><small>{l.refs.join(', ') || '—'}</small></div> },
    { key: 'd', header: 'Pick-up', render: (l) => fmtDate(l.plannedPickup), sort: (l) => l.plannedPickup },
    { key: 'k', header: 'Kg', render: (l) => num(l.kg), align: 'right' },
    { key: 'c', header: 'Carrier', render: (l) => carrier(l.carrierId)?.name ?? (l.vehicleId ? 'Own fleet' : '—'), hideOnMobile: true },
    { key: 'x', header: 'Cost', render: (l) => (l.cost ? kes(l.cost, { compact: true }) : '—'), align: 'right' },
    { key: 's', header: 'Status', render: (l) => <Pill status={L_PILL[l.status]} label={l.status.toLowerCase().replace('_', ' ')} /> }
  ];
  // Consolidation candidates: confirmed SIs heading to the port and customer truck bookings
  const candidates = [
    ...shp.state.instructions.filter((si) => si.status === 'CONFIRMED' && si.stuffingBase && si.stuffingBase !== 'WH-MSA').map((si) => ({ ref: si.number, lane: 'Mombasa → Nairobi', date: si.readyBy < TODAY ? TODAY : addDays(si.readyBy, -1), kg: siKg(si) })),
    ...shp.state.trucks.filter((t) => t.status === 'REQUESTED').map((t) => ({ ref: t.number, lane: { Malaba: 'Mombasa → Malaba', Busia: 'Mombasa → Busia' }[t.border as 'Malaba'] ?? 'Mombasa → Nairobi', date: t.date, kg: t.kg }))
  ].filter((c) => !state.loads.some((l) => l.refs.includes(c.ref)));
  const groups = consolidate(candidates);
  const open = state.loads.find((l) => l.id === openId);
  return (
    <SuitePage
      eyebrow="Warehousing"
      title="Transport"
      subtitle="Plan loads, consolidate deliveries, compare carrier rates, tender or use our own trucks, and track carrier performance."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> Plan a load
        </button>
      }
    >
      <ReadOnlyNote />
      <div className="sx-stats">
        <Stat label="Planned / tendered" value={state.loads.filter((l) => l.status === 'PLANNED' || l.status === 'TENDERED').length} icon={<Truck size={17} />} />
        <Stat label="On the road" value={state.loads.filter((l) => l.status === 'IN_TRANSIT').length} icon={<Truck size={17} />} tone="blue" />
        <Stat label="To consolidate" value={groups.length} detail={`${candidates.length} movements waiting`} icon={<Layers size={17} />} tone="gold" onClick={() => setTab('consolidate')} />
        <Stat label="Spend this month" value={kes(state.loads.filter((l) => l.date.slice(0, 7) === TODAY.slice(0, 7)).reduce((x, l) => x + l.cost, 0), { compact: true })} icon={<BarChart3 size={17} />} tone="violet" />
      </div>
      <div className="sx-toolbar">
        <Chips value={tab} onChange={setTab} options={[{ value: 'loads', label: 'Loads', count: state.loads.length }, { value: 'consolidate', label: 'Consolidation', count: groups.length }, { value: 'carriers', label: 'Carriers & rates', count: state.carriers.length }, { value: 'performance', label: 'Carrier performance' }]} />
      </div>
      {tab === 'loads' && <DataTable rows={state.loads} columns={cols} rowKey={(l) => l.id} onRowClick={(l) => setOpenId(l.id)} selected={openId} initialSort={{ key: 'd', dir: 'desc' }} />}
      {tab === 'consolidate' && (
        <div className="sx-row">
          {groups.length === 0 && <p className="sx-note">Nothing waiting to move — confirmed instructions away from the port and customer truck bookings show here.</p>}
          {groups.map((g) => (
            <section key={`${g.lane}${g.date}`} className="sx-panel">
              <div className="sx-panel-head">
                <div>
                  <h2>{g.lane}</h2>
                  <p>
                    {fmtDate(g.date)} · {num(g.kg)} kg · {g.items.length} movement(s)
                  </p>
                </div>
              </div>
              <div className="sx-panel-body">
                <ul className="sx-facts">
                  {g.items.map((i) => (
                    <li key={i.ref}>
                      <span>{i.ref}</span>
                      <b>{num(i.kg)} kg</b>
                    </li>
                  ))}
                  <li>
                    <span>Cheapest carrier</span>
                    <b>{rateShop(state.carriers, g.lane, g.kg)[0] ? `${rateShop(state.carriers, g.lane, g.kg)[0].carrier.name} · ${kes(rateShop(state.carriers, g.lane, g.kg)[0].cost, { compact: true })}` : 'No rate on file'}</b>
                  </li>
                </ul>
                {!readOnly && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => createLoad({ lane: g.lane, date: g.date < TODAY ? TODAY : g.date, refs: g.items.map((i) => i.ref), kg: g.kg })}>
                    <Layers size={14} /> Consolidate into one load
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      {tab === 'carriers' && (
        <DataTable
          rows={state.carriers.flatMap((c) => c.rates.map((r) => ({ c, r })))}
          columns={[
            { key: 'c', header: 'Carrier', render: (x) => <div className="sx-cell-main"><span>{x.c.name}</span><small>{x.c.mode.toLowerCase()}{x.c.api ? ' · API (simulated)' : ''}</small></div> },
            { key: 'l', header: 'Lane', render: (x) => x.r.lane },
            { key: 'k', header: 'KES / kg', render: (x) => x.r.perKg.toLocaleString(), align: 'right' },
            { key: 'm', header: 'Minimum', render: (x) => kes(x.r.minCharge, { compact: true }), align: 'right' }
          ]}
          rowKey={(x) => `${x.c.id}${x.r.lane}`}
          pageSize={20}
        />
      )}
      {tab === 'performance' && (
        <DataTable
          rows={state.carriers.map((c) => ({ c, k: carrierKpis(state.loads, c.id) }))}
          columns={[
            { key: 'c', header: 'Carrier', render: (x) => x.c.name },
            { key: 'n', header: 'Loads', render: (x) => x.k.loads, align: 'right' },
            { key: 'p', header: 'On-time pick-up', render: (x) => (x.k.onTimePickup === null ? '—' : `${x.k.onTimePickup}%`), align: 'right' },
            { key: 'd', header: 'On-time delivery', render: (x) => (x.k.onTimeDelivery === null ? '—' : <b className={x.k.onTimeDelivery < 80 ? 'sx-danger-text' : 'sx-success-text'}>{x.k.onTimeDelivery}%</b>), align: 'right' },
            { key: 't', header: 'Turn-back rate', render: (x) => (x.k.turnBack === null ? '—' : <b className={x.k.turnBack > 0 ? 'sx-danger-text' : ''}>{x.k.turnBack}%</b>), align: 'right' },
            { key: 'k', header: 'Kg moved', render: (x) => num(x.k.kg), align: 'right' }
          ]}
          rowKey={(x) => x.c.id}
        />
      )}
      {open && <LoadDrawer l={open} onClose={() => setOpenId(null)} />}
      {adding && <LoadModal onClose={() => setAdding(false)} />}
    </SuitePage>
  );
};

const LoadDrawer: React.FC<{ l: Load; onClose: () => void }> = ({ l, onClose }) => {
  const { state, ops, tenderLoad, assignOwnTruck, progressLoad } = useWarehouseExt();
  const { readOnly } = useAccess();
  const [vehicle, setVehicle] = useState(ops.state.vehicles.find((v) => v.status === 'AVAILABLE')?.id ?? '');
  const [note, setNote] = useState('');
  const quotes = rateShop(state.carriers, l.lane, l.kg);
  const c = state.carriers.find((x) => x.id === l.carrierId);
  const track = () => notify({ module: 'Transport', to: 'Transport desk', subject: `${c?.name}: ${l.tracking} — ${l.status === 'IN_TRANSIT' ? 'in transit, departed origin facility' : 'label created, awaiting pick-up'}`, body: 'Tracking response from the carrier API (simulated)', ref: l.number });
  return (
    <Drawer wide title={l.number} subtitle={`${l.lane} · ${num(l.kg)} kg`} badge={<Pill status={L_PILL[l.status]} label={l.status.toLowerCase().replace('_', ' ')} />} onClose={onClose}>
      <DefList items={[['For', l.refs.join(', ') || '—'], ['Pick-up planned / actual', `${fmtDate(l.plannedPickup)} / ${l.actualPickup ? fmtDate(l.actualPickup) : '—'}`], ['Delivery planned / actual', `${fmtDate(l.plannedDelivery)} / ${l.actualDelivery ? fmtDate(l.actualDelivery) : '—'}`], ['Carrier', c?.name ?? (l.vehicleId ? `Own truck ${ops.state.vehicles.find((v) => v.id === l.vehicleId)?.reg}` : '—')], ['Cost', l.cost ? kes(l.cost) : '—'], ['Tracking no.', l.tracking ?? '—']]} />
      {l.status === 'PLANNED' && !readOnly && (
        <>
          <h4 className="sx-subhead">Rate shopping</h4>
          <table className="sx-mini-table">
            <thead>
              <tr>
                <th>Carrier</th>
                <th style={{ textAlign: 'right' }}>KES / kg</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {quotes.map((q, i) => (
                <tr key={q.carrier.id}>
                  <td>
                    {q.carrier.name} {i === 0 && <Pill status="POSTED" label="Cheapest" />}
                  </td>
                  <td style={{ textAlign: 'right' }}>{q.perKg}</td>
                  <td style={{ textAlign: 'right' }}>{kes(q.cost)}</td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-xs" onClick={() => tenderLoad(l.id, q.carrier.id)}>
                      Tender
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!quotes.length && <p className="sx-note">No carrier rate on file for this lane.</p>}
          <h4 className="sx-subhead">Or use our own fleet</h4>
          <div className="sx-inline-form">
            <select className="form-control" value={vehicle} onChange={(e) => setVehicle(e.target.value)} aria-label="Vehicle">
              {ops.state.vehicles.map((v) => (
                <option key={v.id} value={v.id} disabled={v.status !== 'AVAILABLE'}>
                  {v.reg} · {v.model} · {num(v.capacityKg)} kg {v.status !== 'AVAILABLE' ? `(${v.status.toLowerCase()})` : ''}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => assignOwnTruck(l.id, vehicle)}>
              Assign and start trip
            </button>
          </div>
        </>
      )}
      {!readOnly && ['TENDERED', 'IN_TRANSIT'].includes(l.status) && (
        <div className="sx-inline-form">
          {l.status === 'TENDERED' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => progressLoad(l.id, 'IN_TRANSIT')}>
              Picked up
            </button>
          )}
          {l.status === 'IN_TRANSIT' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => progressLoad(l.id, 'DELIVERED')}>
              Delivered
            </button>
          )}
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason if turned back" aria-label="Turn-back reason" />
          <button type="button" className="btn btn-danger btn-sm" onClick={() => progressLoad(l.id, 'TURNED_BACK', note)}>
            Turned back
          </button>
          {c?.api && l.tracking && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={track}>
              <Radar size={14} /> Track via API <SimBadge />
            </button>
          )}
        </div>
      )}
      <h4 className="sx-subhead">History</h4>
      <Timeline items={l.history} />
    </Drawer>
  );
};

const LoadModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { createLoad } = useWarehouseExt();
  const [lane, setLane] = useState(LANES[0]);
  const [date, setDate] = useState(TODAY);
  const [kg, setKg] = useState(0);
  const [refs, setRefs] = useState('');
  return (
    <Modal size="md" title="Plan a load" onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => createLoad({ lane, date, kg, refs: refs.split(',').map((x) => x.trim()).filter(Boolean) }).ok && onClose()}>Plan load</button>}>
      <div className="sx-grid sx-grid-2">
        <Field label="Lane" span={2}>
          <select className="form-control" value={lane} onChange={(e) => setLane(e.target.value)}>
            {LANES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Pick-up date">
          <input className="form-control" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Weight kg" required>
          <input className="form-control" type="number" min="0" value={kg || ''} onChange={(e) => setKg(Number(e.target.value))} />
        </Field>
        <Field label="References (SI, delivery, order)" span={2}>
          <input className="form-control" value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="SI-2026-0001, DN-2026-0012" />
        </Field>
      </div>
    </Modal>
  );
};
