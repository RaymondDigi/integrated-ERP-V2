import React, { useState } from 'react';
import { Ban, DoorOpen, LogIn, LogOut, PackageCheck, PenLine, Plus, Printer, Scale, Trash2, Truck } from 'lucide-react';
import { ImportCsvButton, SignModal, type ESignature } from '../../../platform/Widgets';
import { useAccess } from '../../../platform/access';
import { fmtDate, TODAY } from '../../finance/engine';
import { Chips, DataTable, DefList, Drawer, Field, Modal, Pill, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { useDocCtx } from '../shipping/useDocCtx';
import { useWarehouseExt } from './store';
import type { Asn, AsnLine, Ownership, TallyLine, YardVisit } from './types';
import { num, ReadOnlyNote, SimBadge } from './ui';

const ASN_PILL: Record<Asn['status'], [string, string]> = { EXPECTED: ['SUBMITTED', 'Expected'], ARRIVED: ['OPEN', 'At the gate'], RECEIVED: ['POSTED', 'Received'], CANCELLED: ['VOID', 'Cancelled'] };
export const YARD_SLOTS = ['Dock 1', 'Dock 2', 'Dock 3', 'Bay Y1', 'Bay Y2', 'Bay Y3', 'Bay Y4', 'Bay Y5'];
type Tab = 'asn' | 'yard';

/** Simulated weigh-scale reading: the declared weight give or take 0.4%. */
export const readScale = (declaredKg: number) => Math.round(declaredKg * (1 + (Math.random() - 0.5) * 0.008) * 10) / 10;

export const InboundPage: React.FC = () => {
  const { state, whName, moveInYard, gateOut, createAsn } = useWarehouseExt();
  const { readOnly } = useAccess();
  const [tab, setTab] = useState<Tab>('asn');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [gate, setGate] = useState(false);
  const inYard = state.yard.filter((y) => y.status !== 'LEFT');
  const cols: Column<Asn>[] = [
    { key: 'n', header: 'ASN', render: (a) => <b className="sx-mono">{a.number}</b>, sort: (a) => a.number },
    { key: 'f', header: 'From', render: (a) => <div className="sx-cell-main"><span>{a.from}</span><small>{a.source.toLowerCase()}{a.saleNo ? ` · ${a.saleNo}` : ''}</small></div> },
    { key: 'w', header: 'To', render: (a) => whName(a.warehouseId), hideOnMobile: true },
    { key: 'e', header: 'Expected', render: (a) => fmtDate(a.expected), sort: (a) => a.expected },
    { key: 'b', header: 'Bags', render: (a) => a.lines.reduce((x, l) => x + l.bags, 0), align: 'right' },
    { key: 's', header: 'Status', render: (a) => <Pill status={ASN_PILL[a.status][0]} label={ASN_PILL[a.status][1]} /> }
  ];
  const ycols: Column<YardVisit>[] = [
    { key: 't', header: 'Truck', render: (y) => <div className="sx-cell-main"><span className="sx-mono">{y.truck}</span><small>{y.haulier}</small></div> },
    { key: 'c', header: 'Trailer / container', render: (y) => [y.trailer, y.container].filter(Boolean).join(' · ') || '—', hideOnMobile: true },
    { key: 'p', header: 'Purpose', render: (y) => `${y.purpose.toLowerCase().replace('_', ' ')}${y.ref ? ` · ${y.ref}` : ''}` },
    { key: 'i', header: 'Gate in', render: (y) => y.gateIn.replace('T', ' ').slice(0, 16), sort: (y) => y.gateIn },
    { key: 's', header: 'Slot', render: (y) => (y.status === 'LEFT' ? <span className="sx-muted">Left {y.gateOut?.slice(11, 16)}</span> : <b>{y.slot}</b>) },
    {
      key: 'a',
      header: '',
      render: (y) =>
        y.status !== 'LEFT' && !readOnly ? (
          <div className="sx-actions">
            <select className="form-control" style={{ width: 'auto' }} value={y.slot} onChange={(e) => moveInYard(y.id, e.target.value)} aria-label={`Move ${y.truck}`}>
              {YARD_SLOTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => gateOut(y.id)}>
              <LogOut size={12} /> Gate out
            </button>
          </div>
        ) : null
    }
  ];
  const open = state.asns.find((a) => a.id === openId);
  return (
    <SuitePage
      eyebrow="Warehousing"
      title="Inbound & yard"
      subtitle="Advance shipping notices from factories and the auction, gate-in, inward tally (count and weigh) and the trucks in the yard."
      actions={
        <>
          <ImportCsvButton
            label="Import ASN lines"
            template={['from', 'truck', 'expected', 'garden', 'grade', 'invoiceNo', 'bags', 'kgPerBag', 'costPerKg']}
            onImport={(rows) => {
              const first = rows[0];
              if (!first) return { imported: 0, errors: ['Empty file'] };
              const lines: AsnLine[] = rows.map((r) => ({ garden: r.garden, mark: r.garden?.toUpperCase(), grade: r.grade, invoiceNo: r.invoiceNo, bags: Number(r.bags), kgPerBag: Number(r.kgPerBag), costPerKg: Number(r.costPerKg) || 0 }));
              const res = createAsn({ source: 'FACTORY', from: first.from, owner: 'OWN', ownership: 'OWNED', warehouseId: 'WH-CHG', expected: first.expected || TODAY, truck: first.truck, lines });
              return res.ok ? { imported: rows.length, errors: [] } : { imported: 0, errors: [res.error] };
            }}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setGate(true)}>
            <LogIn size={15} /> Gate in
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={15} /> New ASN
          </button>
        </>
      }
    >
      <ReadOnlyNote />
      <div className="sx-stats">
        <Stat label="Expected" value={state.asns.filter((a) => a.status === 'EXPECTED').length} detail="Advance notices" icon={<Truck size={17} />} />
        <Stat label="At the gate" value={state.asns.filter((a) => a.status === 'ARRIVED').length} detail="Waiting to be tallied" icon={<DoorOpen size={17} />} tone="gold" />
        <Stat label="In the yard" value={inYard.length} detail={`${YARD_SLOTS.length - inYard.length} slots free`} icon={<LogIn size={17} />} tone="blue" onClick={() => setTab('yard')} />
        <Stat label="Received this month" value={`${num(state.asns.filter((a) => a.status === 'RECEIVED' && a.tally?.at.slice(0, 7) === TODAY.slice(0, 7)).reduce((x, a) => x + (a.tally?.lines.reduce((y, l) => y + l.weighedKg, 0) ?? 0), 0))} kg`} icon={<PackageCheck size={17} />} tone="violet" />
      </div>
      <div className="sx-toolbar">
        <Chips value={tab} onChange={setTab} options={[{ value: 'asn', label: 'Advance notices', count: state.asns.length }, { value: 'yard', label: 'Yard board', count: inYard.length }]} />
      </div>
      {tab === 'asn' ? <DataTable rows={state.asns} columns={cols} rowKey={(a) => a.id} onRowClick={(a) => setOpenId(a.id)} selected={openId} initialSort={{ key: 'e', dir: 'desc' }} /> : <DataTable rows={state.yard} columns={ycols} rowKey={(y) => y.id} initialSort={{ key: 'i', dir: 'desc' }} />}
      {open && <AsnDrawer a={open} onClose={() => setOpenId(null)} />}
      {adding && <AsnEditor onClose={() => setAdding(false)} />}
      {gate && <GateModal onClose={() => setGate(false)} />}
    </SuitePage>
  );
};

const AsnDrawer: React.FC<{ a: Asn; onClose: () => void }> = ({ a, onClose }) => {
  const { state, actor, whName, partyName, asnArrived, receiveAsn, cancelAsn } = useWarehouseExt();
  const docs = useDocCtx();
  const [slot, setSlot] = useState(YARD_SLOTS.find((s) => !state.yard.some((y) => y.slot === s && y.status !== 'LEFT')) ?? YARD_SLOTS[0]);
  const [tally, setTally] = useState<TallyLine[]>(a.lines.map((l) => ({ invoiceNo: l.invoiceNo, bagsCounted: l.bags, weighedKg: 0, source: 'MANUAL' })));
  const [sig, setSig] = useState<ESignature | null>(null);
  const [signing, setSigning] = useState(false);
  return (
    <Drawer wide title={a.number} subtitle={`${a.from} → ${whName(a.warehouseId)}`} badge={<Pill status={ASN_PILL[a.status][0]} label={ASN_PILL[a.status][1]} />} onClose={onClose}>
      <DefList items={[['Source', a.source.toLowerCase()], ['Truck', a.truck], ['Owner', `${partyName(a.owner)} (${a.ownership.toLowerCase()})`], ['Expected', fmtDate(a.expected)], ['Arrived', a.arrivedAt?.replace('T', ' ').slice(0, 16) ?? '—'], ['Tally sheet', a.tally?.number ?? '—']]} />
      {a.status === 'EXPECTED' && (
        <div className="sx-inline-form">
          <select className="form-control" value={slot} onChange={(e) => setSlot(e.target.value)} aria-label="Yard slot">
            {YARD_SLOTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => asnArrived(a.id, slot)}>
            <LogIn size={14} /> Truck arrived — gate in
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => cancelAsn(a.id)}>
            <Ban size={14} /> Cancel ASN
          </button>
        </div>
      )}
      <h4 className="sx-subhead">{a.status === 'ARRIVED' ? 'Inward tally — count and weigh' : 'Lines'}</h4>
      <table className="sx-mini-table sx-alloc">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Tea</th>
            <th style={{ textAlign: 'right' }}>Bags</th>
            <th style={{ textAlign: 'right' }}>Declared kg</th>
            {a.status === 'ARRIVED' && <th>Bags counted</th>}
            {(a.status === 'ARRIVED' || a.tally) && <th>Weighed kg</th>}
          </tr>
        </thead>
        <tbody>
          {a.lines.map((l, i) => (
            <tr key={l.invoiceNo}>
              <td className="sx-mono">{l.invoiceNo}</td>
              <td>
                {l.garden} {l.grade}
              </td>
              <td style={{ textAlign: 'right' }}>{l.bags}</td>
              <td style={{ textAlign: 'right' }}>{num(l.bags * l.kgPerBag)}</td>
              {a.status === 'ARRIVED' && (
                <td>
                  <input className="form-control" type="number" min="0" value={tally[i].bagsCounted} onChange={(e) => setTally(tally.map((t, j) => (j === i ? { ...t, bagsCounted: Number(e.target.value) } : t)))} aria-label={`Bags counted ${l.invoiceNo}`} />
                </td>
              )}
              {a.status === 'ARRIVED' ? (
                <td>
                  <div className="sx-inline-form">
                    <input className="form-control" type="number" min="0" value={tally[i].weighedKg || ''} onChange={(e) => setTally(tally.map((t, j) => (j === i ? { ...t, weighedKg: Number(e.target.value), source: 'MANUAL' } : t)))} aria-label={`Weighed kg ${l.invoiceNo}`} />
                    <button type="button" className="btn btn-secondary btn-xs" title="Simulated weigh-scale reading" onClick={() => setTally(tally.map((t, j) => (j === i ? { ...t, weighedKg: readScale(l.bags * l.kgPerBag), source: 'SCALE' } : t)))}>
                      <Scale size={12} /> Read scale
                    </button>
                  </div>
                </td>
              ) : (
                a.tally && <td>{num(a.tally.lines[i]?.weighedKg ?? 0)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {a.status === 'ARRIVED' && (
        <>
          <p className="sx-note">
            <SimBadge text="Weigh scale simulated" /> The platform scale is not connected in this build; “Read scale” generates a reading within ±0.4% of the declared weight.
          </p>
          <div className="sx-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSigning(true)}>
              <PenLine size={14} /> {sig ? `Signed by ${sig.by}` : 'Sign tally sheet'}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => receiveAsn(a.id, tally, sig ?? undefined).ok && onClose()}>
              <PackageCheck size={14} /> Receive into stock
            </button>
          </div>
        </>
      )}
      {a.tally && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => docs.print('tally', `Tally ${a.tally?.number}`, { asn: a, number: a.tally?.number })}>
          <Printer size={14} /> Print inward tally sheet
        </button>
      )}
      <h4 className="sx-subhead">History</h4>
      <Timeline items={a.history} />
      {signing && <SignModal signer={actor.name} meaning={`Inward tally for ${a.number}`} onClose={() => setSigning(false)} onSign={setSig} />}
    </Drawer>
  );
};

const AsnEditor: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { ops, createAsn } = useWarehouseExt();
  const [source, setSource] = useState<Asn['source']>('FACTORY');
  const [from, setFrom] = useState('');
  const [truck, setTruck] = useState('');
  const [expected, setExpected] = useState(TODAY);
  const [warehouseId, setWh] = useState('WH-CHG');
  const [owner, setOwner] = useState('OWN');
  const [saleNo, setSaleNo] = useState('');
  const [lines, setLines] = useState<AsnLine[]>([{ garden: '', mark: '', grade: 'PF1', invoiceNo: '', bags: 0, kgPerBag: 65, costPerKg: 0 }]);
  const customers = ops.finance.state.parties.filter((p) => p.kind === 'CUSTOMER');
  const set = (i: number, patch: Partial<AsnLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <Modal
      size="xl"
      title="New advance shipping notice"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => createAsn({ source, from, owner, ownership: (owner === 'OWN' ? 'OWNED' : 'CUSTOMER') as Ownership, warehouseId, expected, truck, saleNo: saleNo || undefined, lines: lines.map((l) => ({ ...l, mark: l.mark || l.garden.toUpperCase() })) }).ok && onClose()}>
          Log ASN
        </button>
      }
    >
      <div className="sx-grid">
        <Field label="Source">
          <select className="form-control" value={source} onChange={(e) => setSource(e.target.value as Asn['source'])}>
            <option value="FACTORY">Factory</option>
            <option value="AUCTION">Auction purchase</option>
            <option value="PURCHASE">Direct purchase</option>
          </select>
        </Field>
        <Field label="From" required span={2}>
          <input className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="e.g. Gitugi Tea Factory" />
        </Field>
        <Field label="Truck" required>
          <input className="form-control" value={truck} onChange={(e) => setTruck(e.target.value.toUpperCase())} placeholder="KCH 418P" />
        </Field>
        <Field label="Expected">
          <input className="form-control" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </Field>
        <Field label="Warehouse">
          <select className="form-control" value={warehouseId} onChange={(e) => setWh(e.target.value)}>
            {ops.state.warehouses.filter((w) => !w.archived).map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner">
          <select className="form-control" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="OWN">Own stock</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (3PL)
              </option>
            ))}
          </select>
        </Field>
        {source === 'AUCTION' && (
          <Field label="Sale no.">
            <input className="form-control" value={saleNo} onChange={(e) => setSaleNo(e.target.value)} placeholder="Sale 41" />
          </Field>
        )}
      </div>
      <table className="sx-mini-table sx-alloc">
        <thead>
          <tr>
            <th>Garden</th>
            <th>Grade</th>
            <th>Invoice</th>
            <th>Bags</th>
            <th>Kg / bag</th>
            <th>Cost / kg</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>
                <input className="form-control" value={l.garden} onChange={(e) => set(i, { garden: e.target.value })} aria-label="Garden" />
              </td>
              <td>
                <select className="form-control" value={l.grade} onChange={(e) => set(i, { grade: e.target.value })} aria-label="Grade">
                  {['BP1', 'PF1', 'PD', 'D1', 'BMF', 'FNGS1', 'DUST1'].map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </td>
              <td>
                <input className="form-control" value={l.invoiceNo} onChange={(e) => set(i, { invoiceNo: e.target.value })} aria-label="Invoice" />
              </td>
              <td>
                <input className="form-control" type="number" min="0" value={l.bags || ''} onChange={(e) => set(i, { bags: Number(e.target.value) })} aria-label="Bags" />
              </td>
              <td>
                <input className="form-control" type="number" min="0" value={l.kgPerBag || ''} onChange={(e) => set(i, { kgPerBag: Number(e.target.value) })} aria-label="Kg per bag" />
              </td>
              <td>
                <input className="form-control" type="number" min="0" value={l.costPerKg || ''} onChange={(e) => set(i, { costPerKg: Number(e.target.value) })} aria-label="Cost per kg" />
              </td>
              <td>
                <button type="button" className="sx-icon-btn" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove line">
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { garden: '', mark: '', grade: 'PF1', invoiceNo: '', bags: 0, kgPerBag: 65, costPerKg: 0 }])}>
        <Plus size={14} /> Add invoice
      </button>
    </Modal>
  );
};

const GateModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, gateIn } = useWarehouseExt();
  const [v, setV] = useState({ truck: '', trailer: '', container: '', haulier: '', purpose: 'COLLECTION' as YardVisit['purpose'], ref: '', slot: YARD_SLOTS.find((s) => !state.yard.some((y) => y.slot === s && y.status !== 'LEFT')) ?? '' });
  return (
    <Modal size="md" title="Gate in" onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => gateIn({ ...v, trailer: v.trailer || undefined, container: v.container || undefined, ref: v.ref || undefined }).ok && onClose()}>Gate in</button>}>
      <div className="sx-grid sx-grid-2">
        <Field label="Truck" required>
          <input className="form-control" value={v.truck} onChange={(e) => setV({ ...v, truck: e.target.value })} />
        </Field>
        <Field label="Haulier" required>
          <input className="form-control" value={v.haulier} onChange={(e) => setV({ ...v, haulier: e.target.value })} />
        </Field>
        <Field label="Trailer">
          <input className="form-control" value={v.trailer} onChange={(e) => setV({ ...v, trailer: e.target.value })} />
        </Field>
        <Field label="Container">
          <input className="form-control" value={v.container} onChange={(e) => setV({ ...v, container: e.target.value.toUpperCase() })} placeholder="MSKU 1234567" />
        </Field>
        <Field label="Purpose">
          <select className="form-control" value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value as YardVisit['purpose'] })}>
            {['DELIVERY', 'COLLECTION', 'STUFFING', 'EMPTY_RETURN'].map((p) => (
              <option key={p} value={p}>
                {p.toLowerCase().replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Slot" required>
          <select className="form-control" value={v.slot} onChange={(e) => setV({ ...v, slot: e.target.value })}>
            {YARD_SLOTS.map((s) => (
              <option key={s} disabled={state.yard.some((y) => y.slot === s && y.status !== 'LEFT')}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
};
