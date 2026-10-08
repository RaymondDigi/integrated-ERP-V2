import React, { useState } from 'react';
import { Plus, Send, CheckCircle2, Ship, Container as Box, AlertTriangle, Mail, Trash2, Clock } from 'lucide-react';
import { ExportCsvButton, PrintButton, esc } from '../../../platform/Widgets';
import { useOperations } from '../store';
import { addDays, fmtDate, TODAY } from '../../finance/engine';
import { Chips, DataTable, DefList, Drawer, Field, Modal, Panel, Pill, Stat, SuitePage, Timeline } from '../../ui/kit';
import { useFocus } from '../parts';
import { useContainers } from './store';
import { containerAgeing, containerKpis, MOVES, openDiscrepancies, preAdvice, SHIPPING_LINES, statusReport, STATUS_LABEL, stuffedKg, stuffingReport } from './engine';
import type { BookingConfirmation, Container, ContainerBooking, ContainerStatus, ContainerType, PortDiscrepancy } from './types';

const B_PILL: Record<ContainerBooking['status'], string> = { REQUESTED: 'DRAFT', SENT: 'SUBMITTED', CONFIRMED: 'POSTED', REJECTED: 'REJECTED', CANCELLED: 'VOID' };
const C_PILL: Record<ContainerStatus, string> = { EMPTY_RELEASED: 'DRAFT', AT_WAREHOUSE: 'SUBMITTED', STUFFED: 'APPROVED', GATED_IN: 'OPEN', LOADED: 'POSTED', ROLLED_OVER: 'OVERDUE', WITHDRAWN: 'REJECTED', RETURNED: 'VOID' };

/* ------------------------------------------------------------------ */
/* Container bookings                                                  */
/* ------------------------------------------------------------------ */

export const BookingsPage: React.FC = () => {
  const { state, fleet } = useOperations();
  const cx = useContainers();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useFocus(fleet.focus, (id) => cx.state.bookings.some((b) => b.id === id), setOpenId, () => setAdding(true));
  const sel = cx.state.bookings.find((b) => b.id === openId);
  const [f, setF] = useState({ line: SHIPPING_LINES[0].name, containerType: '20GP' as ContainerType, qty: 2, cargo: 'Kenya black tea in paper sacks', destination: '', requestedEtd: addDays(TODAY, 14), shipmentId: '' });
  return (
    <SuitePage
      eyebrow="Port & containers"
      title="Container bookings"
      subtitle="Requests to the shipping lines for empty containers on a vessel. The request is emailed to the line's agent (simulated), the confirmation records the booking number, vessel, cut-off and release order, and empties are released against it."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> Request booking
        </button>
      }
    >
      <DataTable
        rows={cx.state.bookings}
        rowKey={(b) => b.id}
        onRowClick={(b) => setOpenId(b.id)}
        selected={openId}
        initialSort={{ key: 'n', dir: 'desc' }}
        columns={[
          { key: 'n', header: 'Booking', render: (b) => <b className="sx-mono">{b.number}</b>, sort: (b) => b.number },
          { key: 'l', header: 'Line', render: (b) => <div className="sx-cell-main"><span>{b.line}</span><small>{b.qty} × {b.containerType} · {b.destination}</small></div> },
          { key: 'v', header: 'Vessel', render: (b) => (b.confirmation ? `${b.confirmation.vessel} ${b.confirmation.voyage}` : '—'), hideOnMobile: true },
          { key: 'e', header: 'Sails', render: (b) => fmtDate(b.confirmation?.etd ?? b.requestedEtd), sort: (b) => b.confirmation?.etd ?? b.requestedEtd },
          { key: 'r', header: 'Released', render: (b) => `${cx.state.containers.filter((c) => c.bookingId === b.id).length}/${b.qty}`, align: 'right', hideOnMobile: true },
          { key: 's', header: 'Status', render: (b) => <Pill status={B_PILL[b.status]} label={b.status.toLowerCase()} /> }
        ]}
      />
      {sel && <BookingDrawer b={sel} onClose={() => setOpenId(null)} />}
      {adding && (
        <Modal
          title="Request container booking"
          onClose={() => setAdding(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { const r = cx.requestBooking({ ...f, shipmentId: f.shipmentId || undefined }); if (r.ok) { setAdding(false); setOpenId(r.id ?? null); } }}>
              Save request
            </button>
          }
        >
          <div className="sx-grid">
            <Field label="Shipping line" required span={2}>
              <select className="form-control" value={f.line} onChange={(e) => setF({ ...f, line: e.target.value })}>
                {SHIPPING_LINES.map((l) => (
                  <option key={l.code} value={l.name}>
                    {l.name} — {l.agent}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Export shipment" span={2}>
              <select className="form-control" value={f.shipmentId} onChange={(e) => { const sh = state.shipments.find((s) => s.id === e.target.value); setF({ ...f, shipmentId: e.target.value, destination: sh?.destination ?? f.destination }); }}>
                <option value="">Not linked</option>
                {state.shipments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.number} — {s.destination}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select className="form-control" value={f.containerType} onChange={(e) => setF({ ...f, containerType: e.target.value as ContainerType })}>
                <option value="20GP">20' GP</option>
                <option value="40GP">40' GP</option>
                <option value="40HC">40' HC</option>
              </select>
            </Field>
            <Field label="Quantity" required>
              <input className="form-control" type="number" min="1" value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} />
            </Field>
            <Field label="Sailing wanted" required>
              <input className="form-control" type="date" value={f.requestedEtd} onChange={(e) => setF({ ...f, requestedEtd: e.target.value })} />
            </Field>
            <Field label="Destination port" required>
              <input className="form-control" value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} placeholder="Karachi" />
            </Field>
            <Field label="Cargo" required span={4}>
              <input className="form-control" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

const BookingDrawer: React.FC<{ b: ContainerBooking; onClose: () => void }> = ({ b, onClose }) => {
  const cx = useContainers();
  const [c, setC] = useState<BookingConfirmation>({ bookingRef: '', vessel: '', voyage: '', etd: b.requestedEtd, cutOff: `${addDays(b.requestedEtd, -2)}T16:00`, releaseOrder: '' });
  const [reason, setReason] = useState('');
  const [nums, setNums] = useState('');
  const [depot, setDepot] = useState('Mombasa ICD — empty depot');
  const released = cx.state.containers.filter((x) => x.bookingId === b.id);
  const line = SHIPPING_LINES.find((l) => l.name === b.line);
  return (
    <Drawer wide title={b.number} subtitle={`${b.line} · ${b.qty} × ${b.containerType} → ${b.destination}`} badge={<Pill status={B_PILL[b.status]} label={b.status.toLowerCase()} />} onClose={onClose}>
      <DefList
        items={[
          ['Agent', `${line?.agent} <${line?.email}>`],
          ['Cargo', b.cargo],
          ['Sailing wanted', fmtDate(b.requestedEtd)],
          ['Booking no.', b.confirmation?.bookingRef ?? '—'],
          ['Vessel', b.confirmation ? `${b.confirmation.vessel} ${b.confirmation.voyage}, sails ${fmtDate(b.confirmation.etd)}` : '—'],
          ['Cut-off', b.confirmation?.cutOff.replace('T', ' ') ?? '—'],
          ['Release order', b.confirmation?.releaseOrder ?? '—']
        ]}
      />
      {b.status === 'REQUESTED' && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => cx.sendBooking(b.id)}>
          <Send size={14} /> Email request to {b.line}
        </button>
      )}
      {b.status === 'SENT' && (
        <>
          <h4 className="sx-subhead">Line's confirmation</h4>
          <div className="sx-grid">
            <Field label="Booking no." required>
              <input className="form-control" value={c.bookingRef} onChange={(e) => setC({ ...c, bookingRef: e.target.value })} />
            </Field>
            <Field label="Vessel" required>
              <input className="form-control" value={c.vessel} onChange={(e) => setC({ ...c, vessel: e.target.value })} />
            </Field>
            <Field label="Voyage" required>
              <input className="form-control" value={c.voyage} onChange={(e) => setC({ ...c, voyage: e.target.value })} />
            </Field>
            <Field label="Release order" required>
              <input className="form-control" value={c.releaseOrder} onChange={(e) => setC({ ...c, releaseOrder: e.target.value })} />
            </Field>
            <Field label="Sails" required span={2}>
              <input className="form-control" type="date" value={c.etd} onChange={(e) => setC({ ...c, etd: e.target.value })} />
            </Field>
            <Field label="Cut-off" required span={2}>
              <input className="form-control" type="datetime-local" value={c.cutOff} onChange={(e) => setC({ ...c, cutOff: e.target.value })} />
            </Field>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => cx.confirmBooking(b.id, c)}>
            <CheckCircle2 size={14} /> Record confirmation
          </button>
        </>
      )}
      {(b.status === 'REQUESTED' || b.status === 'SENT') && (
        <div className="sx-inline-form">
          <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Line declined / reason to cancel" aria-label="Reason" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => cx.rejectBooking(b.id, reason)}>
            Close request
          </button>
        </div>
      )}
      {b.status === 'CONFIRMED' && released.length < b.qty && (
        <>
          <h4 className="sx-subhead">Release empties ({released.length}/{b.qty})</h4>
          <div className="sx-inline-form sx-wrap">
            <input className="form-control" value={nums} onChange={(e) => setNums(e.target.value)} placeholder="Container numbers, comma separated (MSCU 1234567)" aria-label="Container numbers" />
            <input className="form-control" value={depot} onChange={(e) => setDepot(e.target.value)} aria-label="Depot" />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => cx.releaseEmpties(b.id, nums.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean), depot).ok && setNums('')}>
              Release
            </button>
          </div>
        </>
      )}
      {released.length > 0 && <p className="sx-muted">Containers: {released.map((x) => `${x.number} (${STATUS_LABEL[x.status].toLowerCase()})`).join(', ')}</p>}
      <h4 className="sx-subhead">History</h4>
      <Timeline items={b.history} />
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */
/* Container register                                                  */
/* ------------------------------------------------------------------ */

export const ContainersPage: React.FC = () => {
  const { fleet } = useOperations();
  const cx = useContainers();
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  useFocus(fleet.focus, (id) => cx.state.containers.some((c) => c.id === id), setOpenId);
  const rows = cx.state.containers.filter((c) => filter === 'ALL' || !['LOADED', 'RETURNED'].includes(c.status));
  const sel = cx.state.containers.find((c) => c.id === openId);
  return (
    <SuitePage eyebrow="Port & containers" title="Containers" subtitle="Every container from empty release through stuffing, gate-in and loading, with roll-overs and withdrawals. A container with an open KRA query cannot gate in or load.">
      <div className="sx-stats">
        <Stat label="At the warehouse" value={cx.state.containers.filter((c) => c.status === 'AT_WAREHOUSE' || c.status === 'EMPTY_RELEASED').length} icon={<Box size={17} />} />
        <Stat label="Stuffed, waiting" value={cx.state.containers.filter((c) => c.status === 'STUFFED' || c.status === 'ROLLED_OVER').length} icon={<Clock size={17} />} tone="gold" />
        <Stat label="At port" value={cx.state.containers.filter((c) => c.status === 'GATED_IN').length} icon={<Ship size={17} />} tone="blue" />
        <Stat label="Open KRA queries" value={cx.state.discrepancies.filter((d) => d.status === 'OPEN').length} icon={<AlertTriangle size={17} />} tone="red" />
      </div>
      <div className="sx-toolbar">
        <Chips value={filter} onChange={setFilter} options={[{ value: 'ACTIVE', label: 'Active', count: cx.state.containers.filter((c) => !['LOADED', 'RETURNED'].includes(c.status)).length }, { value: 'ALL', label: 'All', count: cx.state.containers.length }]} />
      </div>
      <DataTable
        rows={rows}
        rowKey={(c) => c.id}
        onRowClick={(c) => setOpenId(c.id)}
        selected={openId}
        columns={[
          { key: 'n', header: 'Container', render: (c) => <div className="sx-cell-main"><b className="sx-mono">{c.number}</b><small>{c.type} · {c.line}</small></div>, sort: (c) => c.number },
          { key: 'l', header: 'Where', render: (c) => c.location, hideOnMobile: true },
          { key: 'v', header: 'Vessel / cut-off', render: (c) => (c.vessel ? `${c.vessel} · ${c.cutOff?.replace('T', ' ') ?? ''}` : '—'), hideOnMobile: true },
          { key: 'k', header: 'Tea', render: (c) => (c.lots.length ? `${stuffedKg(c).toLocaleString()} kg` : '—'), align: 'right' },
          { key: 's', header: 'Status', render: (c) => <span>{openDiscrepancies(cx.state.discrepancies, c.number).length > 0 && <AlertTriangle size={13} className="sx-danger-text" />} <Pill status={C_PILL[c.status]} label={STATUS_LABEL[c.status]} /></span>, sort: (c) => c.status }
        ]}
      />
      {sel && <ContainerDrawer c={sel} onClose={() => setOpenId(null)} />}
    </SuitePage>
  );
};

const ContainerDrawer: React.FC<{ c: Container; onClose: () => void }> = ({ c, onClose }) => {
  const { setFleet } = useOperations();
  const cx = useContainers();
  const moves = MOVES[c.status].filter((s) => !['STUFFED', 'WITHDRAWN', 'ROLLED_OVER'].includes(s));
  const [to, setTo] = useState<ContainerStatus | ''>(moves[0] ?? '');
  const [loc, setLoc] = useState('');
  const [seal, setSeal] = useState('');
  const [truck, setTruck] = useState('');
  const [lots, setLots] = useState<Container['lots']>([{ lotNo: '', garden: '', grade: 'BP1', packages: 20, kg: 1200 }]);
  const [roll, setRoll] = useState({ vessel: '', cutOff: `${addDays(TODAY, 7)}T16:00`, reason: '' });
  const [wd, setWd] = useState({ reason: '', location: 'Bonded warehouse, Changamwe' });
  const queries = openDiscrepancies(cx.state.discrepancies, c.number);
  const html = () =>
    `<h1>Container ${esc(c.number)} — ${esc(c.type)}</h1><p><b>Line:</b> ${esc(c.line)} · <b>Seal:</b> ${esc(c.sealNo)} · <b>Vessel:</b> ${esc(c.vessel)}<br/><b>Stuffed:</b> ${esc(c.stuffedOn)} · <b>Truck:</b> ${esc(c.truck)}</p><table border="1" cellpadding="4" cellspacing="0"><tr><th>Lot</th><th>Garden</th><th>Grade</th><th>Packages</th><th>kg</th></tr>${c.lots.map((l) => `<tr><td>${esc(l.lotNo)}</td><td>${esc(l.garden)}</td><td>${esc(l.grade)}</td><td>${l.packages}</td><td>${l.kg}</td></tr>`).join('')}</table><p>Total ${stuffedKg(c).toLocaleString()} kg</p>`;
  return (
    <Drawer wide title={c.number} subtitle={`${c.type} · ${c.line} · ${c.location}`} badge={<Pill status={C_PILL[c.status]} label={STATUS_LABEL[c.status]} />} onClose={onClose} footer={c.lots.length ? <PrintButton title={`Stuffing report ${c.number}`} html={html} label="Stuffing report" /> : undefined}>
      {queries.length > 0 && (
        <div className="sx-callout danger">
          <AlertTriangle size={16} />
          <div>
            <b>Open KRA query {queries.map((q) => q.number).join(', ')}</b>
            <span>
              {queries[0].type.toLowerCase()}: declared {queries[0].declared}, found {queries[0].found}.{' '}
              <button type="button" className="sx-link" onClick={() => setFleet('discrepancies', queries[0].id)}>
                Resolve
              </button>
            </span>
          </div>
        </div>
      )}
      <DefList
        items={[
          ['Released', fmtDate(c.releasedOn)],
          ['Stuffed', c.stuffedOn ? fmtDate(c.stuffedOn) : '—'],
          ['Seal', c.sealNo ?? '—'],
          ['Vessel', c.vessel ?? '—'],
          ['Cut-off', c.cutOff?.replace('T', ' ') ?? '—'],
          ['Tea', c.lots.length ? `${c.lots.length} lots · ${stuffedKg(c).toLocaleString()} kg` : '—']
        ]}
      />
      {moves.length > 0 && (
        <>
          <h4 className="sx-subhead">Move</h4>
          <div className="sx-inline-form sx-wrap">
            <select className="form-control" value={to} onChange={(e) => setTo(e.target.value as ContainerStatus)} aria-label="Move to">
              {moves.map((m) => (
                <option key={m} value={m}>
                  {STATUS_LABEL[m]}
                </option>
              ))}
            </select>
            <input className="form-control" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Location" aria-label="Location" />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => to && cx.moveContainer(c.id, to, loc).ok && setLoc('')}>
              Record move
            </button>
          </div>
        </>
      )}
      {(c.status === 'AT_WAREHOUSE' || c.status === 'WITHDRAWN') && (
        <>
          <h4 className="sx-subhead">Stuff and seal</h4>
          {lots.map((l, i) => {
            const set = (patch: Partial<Container['lots'][number]>) => setLots(lots.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div key={i} className="sx-inline-form sx-wrap">
                <input className="form-control" value={l.lotNo} onChange={(e) => set({ lotNo: e.target.value })} placeholder="Lot no." aria-label="Lot number" style={{ width: 110 }} />
                <input className="form-control" value={l.garden} onChange={(e) => set({ garden: e.target.value })} placeholder="Garden" aria-label="Garden" />
                <input className="form-control" value={l.grade} onChange={(e) => set({ grade: e.target.value })} aria-label="Grade" style={{ width: 80 }} />
                <input className="form-control" type="number" value={l.packages} onChange={(e) => set({ packages: Number(e.target.value) })} aria-label="Packages" style={{ width: 80 }} />
                <input className="form-control" type="number" value={l.kg} onChange={(e) => set({ kg: Number(e.target.value) })} aria-label="kg" style={{ width: 90 }} />
                <button type="button" className="sx-icon-btn" onClick={() => setLots(lots.filter((_, j) => j !== i))} aria-label="Remove lot">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          <div className="sx-inline-form sx-wrap">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLots([...lots, { lotNo: '', garden: '', grade: 'BP1', packages: 20, kg: 1200 }])}>
              <Plus size={14} /> Lot
            </button>
            <input className="form-control" value={seal} onChange={(e) => setSeal(e.target.value)} placeholder="Seal no." aria-label="Seal number" />
            <input className="form-control" value={truck} onChange={(e) => setTruck(e.target.value)} placeholder="Truck reg" aria-label="Truck" />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => cx.stuffContainer(c.id, seal, lots, truck)}>
              Stuff and seal
            </button>
          </div>
        </>
      )}
      {(c.status === 'STUFFED' || c.status === 'GATED_IN' || c.status === 'ROLLED_OVER') && (
        <>
          <h4 className="sx-subhead">Roll over to another vessel</h4>
          <div className="sx-inline-form sx-wrap">
            <input className="form-control" value={roll.vessel} onChange={(e) => setRoll({ ...roll, vessel: e.target.value })} placeholder="New vessel" aria-label="New vessel" />
            <input className="form-control" type="datetime-local" value={roll.cutOff} onChange={(e) => setRoll({ ...roll, cutOff: e.target.value })} aria-label="New cut-off" />
            <input className="form-control" value={roll.reason} onChange={(e) => setRoll({ ...roll, reason: e.target.value })} placeholder="Reason" aria-label="Roll-over reason" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => cx.rollOver(c.id, roll.vessel, roll.cutOff, roll.reason)}>
              Roll over
            </button>
          </div>
        </>
      )}
      {MOVES[c.status].includes('WITHDRAWN') && (
        <>
          <h4 className="sx-subhead">Withdraw (Operations Manager)</h4>
          <div className="sx-inline-form sx-wrap">
            <input className="form-control" value={wd.reason} onChange={(e) => setWd({ ...wd, reason: e.target.value })} placeholder="Reason" aria-label="Withdraw reason" />
            <input className="form-control" value={wd.location} onChange={(e) => setWd({ ...wd, location: e.target.value })} aria-label="Taken to" />
            <button type="button" className="btn btn-danger btn-sm" onClick={() => cx.withdraw(c.id, wd.reason, wd.location)}>
              Withdraw
            </button>
          </div>
        </>
      )}
      <h4 className="sx-subhead">Movements</h4>
      <Timeline items={[...c.events].reverse().map((e) => ({ at: e.at, by: e.by, action: `${STATUS_LABEL[e.status]} — ${e.location}`, note: e.note }))} />
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export const ContainerReportsPage: React.FC = () => {
  const cx = useContainers();
  const [tab, setTab] = useState<'ageing' | 'stuffing' | 'preadvice' | 'status'>('ageing');
  const [from, setFrom] = useState(addDays(TODAY, -30));
  const [to, setTo] = useState(TODAY);
  const ageing = containerAgeing(cx.state.containers);
  const stuffed = stuffingReport(cx.state.containers, from, to);
  const pre = preAdvice(cx.state.containers);
  const status = statusReport(cx.state.containers);
  return (
    <SuitePage eyebrow="Port & containers" title="Container reports" subtitle="Ageing of containers not yet shipped, stuffing by date, the terminal pre-advice list and status by location.">
      <div className="sx-toolbar">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: 'ageing', label: 'Ageing', count: ageing.length },
            { value: 'stuffing', label: 'Stuffing', count: stuffed.length },
            { value: 'preadvice', label: 'Pre-advice', count: pre.length },
            { value: 'status', label: 'Status', count: status.length }
          ]}
        />
      </div>
      {tab === 'ageing' && (
        <Panel title="Container ageing" subtitle="Days since the empty was released" action={<ExportCsvButton name="container-ageing" header={['Container', 'Status', 'Location', 'Days', 'Bucket']} rows={() => ageing.map((a) => [a.c.number, STATUS_LABEL[a.c.status], a.c.location, a.days, a.bucket])} />}>
          <DataTable rows={ageing} rowKey={(a) => a.c.id} columns={[{ key: 'n', header: 'Container', render: (a) => a.c.number }, { key: 's', header: 'Status', render: (a) => STATUS_LABEL[a.c.status] }, { key: 'l', header: 'Location', render: (a) => a.c.location, hideOnMobile: true }, { key: 'd', header: 'Days', render: (a) => <span className={a.days > 14 ? 'sx-danger-text' : ''}>{a.days}</span>, align: 'right', sort: (a) => a.days }, { key: 'b', header: 'Bucket', render: (a) => a.bucket }]} />
        </Panel>
      )}
      {tab === 'stuffing' && (
        <Panel title="Stuffing report" action={<ExportCsvButton name={`stuffing-${from}-${to}`} header={['Date', 'Container', 'Seal', 'Lot', 'Garden', 'Grade', 'Packages', 'kg']} rows={() => stuffed.flatMap((c) => c.lots.map((l) => [c.stuffedOn, c.number, c.sealNo, l.lotNo, l.garden, l.grade, l.packages, l.kg]))} />}>
          <div className="sx-inline-form">
            <input className="form-control" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <input className="form-control" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </div>
          <DataTable rows={stuffed} rowKey={(c) => c.id} columns={[{ key: 'd', header: 'Stuffed', render: (c) => fmtDate(c.stuffedOn!) }, { key: 'n', header: 'Container', render: (c) => c.number }, { key: 's', header: 'Seal', render: (c) => c.sealNo ?? '' }, { key: 'l', header: 'Lots', render: (c) => c.lots.map((l) => l.lotNo).join(', '), hideOnMobile: true }, { key: 'k', header: 'kg', render: (c) => stuffedKg(c).toLocaleString(), align: 'right' }]} />
        </Panel>
      )}
      {tab === 'preadvice' && (
        <Panel title="Terminal pre-advice" subtitle="Stuffed containers due at the port in the next 7 days" action={<ExportCsvButton name="pre-advice" header={['Container', 'Type', 'Seal', 'Vessel', 'Cut-off', 'Gross kg']} rows={() => pre.map((c) => [c.number, c.type, c.sealNo, c.vessel, c.cutOff, stuffedKg(c)])} />}>
          <DataTable rows={pre} rowKey={(c) => c.id} empty="Nothing due at the port this week" columns={[{ key: 'n', header: 'Container', render: (c) => c.number }, { key: 'v', header: 'Vessel', render: (c) => c.vessel ?? '' }, { key: 'c', header: 'Cut-off', render: (c) => c.cutOff?.replace('T', ' ') ?? '' }, { key: 'k', header: 'kg', render: (c) => stuffedKg(c).toLocaleString(), align: 'right' }]} />
        </Panel>
      )}
      {tab === 'status' && (
        <Panel title="Status by location">
          <DataTable rows={status} rowKey={(r) => `${r.status}${r.location}`} columns={[{ key: 's', header: 'Status', render: (r) => r.status }, { key: 'l', header: 'Location', render: (r) => r.location }, { key: 'c', header: 'Containers', render: (r) => r.count, align: 'right' }]} />
        </Panel>
      )}
    </SuitePage>
  );
};

export const ContainerKpiPage: React.FC = () => {
  const cx = useContainers();
  const k = containerKpis(cx.state.bookings, cx.state.containers);
  return (
    <SuitePage eyebrow="Port & containers" title="Container KPIs" subtitle="Planned against actual days at each stage, gate-in before cut-off, roll-overs and withdrawals.">
      <div className="sx-stats">
        <Stat label="Gated in before cut-off" value={k.gateInOnTime !== null ? `${k.gateInOnTime}%` : '—'} icon={<Ship size={17} />} tone={(k.gateInOnTime ?? 100) < 90 ? 'red' : 'green'} />
        <Stat label="Rolled over" value={k.rolled} icon={<Clock size={17} />} tone="gold" />
        <Stat label="Withdrawn" value={k.withdrawn} icon={<AlertTriangle size={17} />} tone="red" />
        <Stat label="At risk now" value={k.late.length} detail="Rolled over or cut-off passed before gate-in" icon={<AlertTriangle size={17} />} tone="red" />
      </div>
      <Panel title="Stage times">
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th style={{ textAlign: 'right' }}>Target (days)</th>
              <th style={{ textAlign: 'right' }}>Actual average</th>
              <th style={{ textAlign: 'right' }}>On target</th>
              <th style={{ textAlign: 'right' }}>Samples</th>
            </tr>
          </thead>
          <tbody>
            {k.stages.map((s) => (
              <tr key={s.key}>
                <td>{s.label}</td>
                <td style={{ textAlign: 'right' }}>{s.days}</td>
                <td style={{ textAlign: 'right' }} className={s.avg !== null && s.avg > s.days ? 'sx-danger-text' : ''}>
                  {s.avg ?? '—'}
                </td>
                <td style={{ textAlign: 'right' }}>{s.onTime !== null ? `${s.onTime}%` : '—'}</td>
                <td style={{ textAlign: 'right' }}>{s.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {k.late.length > 0 && (
        <Panel title="Containers at risk">
          <ul className="sx-facts">
            {k.late.map((c) => (
              <li key={c.id}>
                <span>{c.number}</span>
                <b>
                  {STATUS_LABEL[c.status]} · cut-off {c.cutOff?.replace('T', ' ')}
                </b>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Port discrepancies (KRA)                                             */
/* ------------------------------------------------------------------ */

export const DiscrepanciesPage: React.FC = () => {
  const { fleet } = useOperations();
  const cx = useContainers();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [email, setEmail] = useState('');
  const [res, setRes] = useState('');
  useFocus(fleet.focus, (id) => cx.state.discrepancies.some((d) => d.id === id), setOpenId);
  const sel = cx.state.discrepancies.find((d) => d.id === openId);
  const [m, setM] = useState({ containerNo: '', type: 'WEIGHT' as PortDiscrepancy['type'], declared: '', found: '' });
  return (
    <SuitePage
      eyebrow="Port & containers"
      title="Port discrepancies"
      subtitle="KRA customs queries on containers (weight, seal, packages, documents). Paste the KRA email to log it — the container is blocked from gate-in and loading until someone else resolves it. Mailbox integration is simulated by the paste."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setPasting(true)}>
          <Mail size={15} /> Import KRA email
        </button>
      }
    >
      <DataTable
        rows={cx.state.discrepancies}
        rowKey={(d) => d.id}
        onRowClick={(d) => setOpenId(d.id)}
        selected={openId}
        initialSort={{ key: 'n', dir: 'desc' }}
        columns={[
          { key: 'n', header: 'Query', render: (d) => <b className="sx-mono">{d.number}</b>, sort: (d) => d.number },
          { key: 'c', header: 'Container', render: (d) => d.containerNo },
          { key: 't', header: 'Type', render: (d) => d.type.toLowerCase() },
          { key: 'x', header: 'Declared → found', render: (d) => `${d.declared} → ${d.found}`, hideOnMobile: true },
          { key: 's', header: 'Status', render: (d) => <Pill status={d.status === 'OPEN' ? 'REJECTED' : 'POSTED'} label={d.status.toLowerCase()} /> }
        ]}
      />
      <Panel title="Log a query by hand">
        <div className="sx-inline-form sx-wrap">
          <input className="form-control" value={m.containerNo} onChange={(e) => setM({ ...m, containerNo: e.target.value })} placeholder="Container no." aria-label="Container number" />
          <select className="form-control" value={m.type} onChange={(e) => setM({ ...m, type: e.target.value as PortDiscrepancy['type'] })} aria-label="Type">
            <option value="WEIGHT">Weight</option>
            <option value="SEAL">Seal</option>
            <option value="PACKAGES">Packages</option>
            <option value="DOCS">Documents</option>
          </select>
          <input className="form-control" value={m.declared} onChange={(e) => setM({ ...m, declared: e.target.value })} placeholder="Declared" aria-label="Declared" />
          <input className="form-control" value={m.found} onChange={(e) => setM({ ...m, found: e.target.value })} placeholder="Found by KRA" aria-label="Found" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => cx.logDiscrepancy({ ...m, source: 'Manual' }).ok && setM({ containerNo: '', type: 'WEIGHT', declared: '', found: '' })}>
            Log query
          </button>
        </div>
      </Panel>
      {sel && (
        <Drawer title={sel.number} subtitle={`${sel.containerNo} · ${sel.source}`} badge={<Pill status={sel.status === 'OPEN' ? 'REJECTED' : 'POSTED'} label={sel.status.toLowerCase()} />} onClose={() => setOpenId(null)}>
          <DefList
            items={[
              ['Received', fmtDate(sel.receivedOn)],
              ['Type', sel.type.toLowerCase()],
              ['Declared', sel.declared],
              ['Found', sel.found],
              ['Logged by', sel.loggedBy],
              ['Resolution', sel.resolution ? `${sel.resolution} (${sel.resolvedBy})` : '—']
            ]}
          />
          {sel.raw && <pre className="sx-note" style={{ whiteSpace: 'pre-wrap' }}>{sel.raw}</pre>}
          {sel.status === 'OPEN' && (
            <div className="sx-inline-form">
              <input className="form-control" value={res} onChange={(e) => setRes(e.target.value)} placeholder="How it was resolved" aria-label="Resolution" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => cx.resolveDiscrepancy(sel.id, res).ok && setRes('')}>
                Resolve
              </button>
            </div>
          )}
        </Drawer>
      )}
      {pasting && (
        <Modal
          title="Import KRA email"
          subtitle="Paste the email text; the container number, query type and values are read from it"
          onClose={() => setPasting(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => cx.importKraEmail(email).ok && (setPasting(false), setEmail(''))}>
              Log query
            </button>
          }
        >
          <textarea
            className="form-control"
            rows={8}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="KRA email text"
            placeholder={'From: icms@kra.go.ke\nSubject: Verification query — MSKU 1234567\nDeclared gross weight 21,600 kg; verified weight 22,140 kg at Kilindini scanner.'}
          />
        </Modal>
      )}
    </SuitePage>
  );
};
