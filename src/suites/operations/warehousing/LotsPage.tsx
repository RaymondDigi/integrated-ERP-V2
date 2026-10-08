import React, { useState } from 'react';
import { AlertTriangle, Boxes, ClipboardList, PackageCheck, ShieldAlert, Tags } from 'lucide-react';
import { Attachments, ExportCsvButton, ImportCsvButton, printDocument } from '../../../platform/Widgets';
import { useAccess } from '../../../platform/access';
import { fmtDate, kes, round2 } from '../../finance/engine';
import { Chips, DataTable, DefList, Drawer, Field, Pill, SearchBox, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { Barcode, labelSheetHtml } from '../../control/integrations/barcode';
import { useShippingExt } from '../shipping/store';
import { useDocCtx } from '../shipping/useDocCtx';
import { availableKg, daysToExpiry, expiryState, fefo, locLabel, MOVE_LABEL, OWNERSHIP_LABEL, QC_LABEL, traceLot, weightVariance } from './engine';
import { useWarehouseExt } from './store';
import type { HandlingUnit, Ownership, TeaLot } from './types';
import { num, ReadOnlyNote, ScanBox } from './ui';

export const QC_PILL: Record<TeaLot['qc'], string> = { PENDING: 'SUBMITTED', PASS: 'POSTED', HOLD: 'OVERDUE', FAIL: 'REJECTED' };
type Tab = 'lots' | 'hus' | 'trace' | 'expiry';

export const LotsPage: React.FC = () => {
  const { state, ops, whName, partyName, importLots } = useWarehouseExt();
  const [tab, setTab] = useState<Tab>('lots');
  const [q, setQ] = useState('');
  const [wh, setWh] = useState('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const [traceId, setTraceId] = useState<string>(state.lots[0]?.id ?? '');
  const [scanMsg, setScanMsg] = useState('');
  const inStock = state.lots.filter((l) => l.status === 'IN_STOCK');
  const rows = state.lots.filter((l) => (wh === 'ALL' || l.warehouseId === wh) && (!q || `${l.lotNo} ${l.garden} ${l.grade} ${l.invoiceNo} ${partyName(l.owner)}`.toLowerCase().includes(q.toLowerCase())));
  const held = inStock.filter((l) => l.qc === 'HOLD' || l.qc === 'FAIL');
  const expiring = inStock.filter((l) => expiryState(l) !== 'OK');
  const loc = (id?: string) => state.locations.find((x) => x.id === id);
  const scan = (code: string) => {
    const k = code.toUpperCase();
    const hu = state.hus.find((h) => h.code === k || h.rfid.toUpperCase() === k);
    const lot = state.lots.find((l) => l.lotNo.toUpperCase() === k || l.rfid?.toUpperCase() === k || l.id === hu?.lotId);
    if (!lot) return setScanMsg(`Nothing found for ${code}`);
    setScanMsg(hu ? `${hu.code} → lot ${lot.lotNo}` : `Lot ${lot.lotNo}`);
    setOpenId(lot.id);
  };
  const columns: Column<TeaLot>[] = [
    { key: 'n', header: 'Lot', render: (l) => <b className="sx-mono">{l.lotNo}</b>, sort: (l) => l.lotNo, width: 100 },
    {
      key: 't',
      header: 'Tea',
      render: (l) => (
        <div className="sx-cell-main">
          <span>
            {l.garden} {l.grade}
          </span>
          <small>
            {l.invoiceNo}
            {l.auction ? ` · ${l.auction.saleNo}` : ''}
          </small>
        </div>
      ),
      sort: (l) => `${l.grade}${l.garden}`
    },
    { key: 'o', header: 'Owner', render: (l) => <div className="sx-cell-main"><span>{partyName(l.owner)}</span><small>{OWNERSHIP_LABEL[l.ownership]}</small></div>, sort: (l) => l.owner, hideOnMobile: true },
    { key: 'w', header: 'Location', render: (l) => <div className="sx-cell-main"><span>{whName(l.warehouseId).split(' — ')[1] ?? whName(l.warehouseId)}</span><small>{locLabel(loc(l.locationId))}</small></div>, hideOnMobile: true },
    { key: 'b', header: 'Bags', render: (l) => l.bags, align: 'right', sort: (l) => l.bags },
    { key: 'k', header: 'Net kg', render: (l) => num(l.netKg), align: 'right', sort: (l) => l.netKg },
    { key: 'a', header: 'Available', render: (l) => <span className={availableKg(l) < l.netKg ? 'sx-muted' : ''}>{num(availableKg(l))}</span>, align: 'right', sort: availableKg },
    { key: 'q', header: 'QC', render: (l) => (l.status === 'IN_STOCK' ? <Pill status={QC_PILL[l.qc]} label={QC_LABEL[l.qc]} /> : <Pill status="CLOSED" label={l.status === 'DEPLETED' ? 'Shipped out' : 'Released'} />), sort: (l) => l.qc }
  ];
  const huCols: Column<HandlingUnit>[] = [
    { key: 'c', header: 'Handling unit', render: (h) => <b className="sx-mono">{h.code}</b>, sort: (h) => h.code },
    { key: 'r', header: 'RFID tag', render: (h) => <span className="sx-mono">{h.rfid}</span>, hideOnMobile: true },
    { key: 'l', header: 'Lot', render: (h) => state.lots.find((l) => l.id === h.lotId)?.lotNo, sort: (h) => h.lotId },
    { key: 'b', header: 'Bags', render: (h) => h.bags, align: 'right' },
    { key: 'k', header: 'Kg', render: (h) => num(h.kg), align: 'right' },
    { key: 'p', header: 'Location', render: (h) => locLabel(loc(h.locationId)), hideOnMobile: true },
    { key: 's', header: 'Status', render: (h) => <Pill status={{ STORED: 'POSTED', PICKED: 'SUBMITTED', LOADED: 'CLOSED', MISSING: 'REJECTED' }[h.status]} label={h.status.toLowerCase()} /> }
  ];
  const open = state.lots.find((l) => l.id === openId);
  return (
    <SuitePage
      eyebrow="Warehousing"
      title="Tea lots"
      subtitle="Every lot by garden, grade and invoice, with its handling units, owner, QC status, expiry and full movement history."
      actions={
        <>
          <ExportCsvButton
            name="tea-lots"
            header={['lotNo', 'garden', 'grade', 'invoiceNo', 'owner', 'ownership', 'warehouse', 'location', 'bags', 'netKg', 'availableKg', 'qc', 'arrival', 'expiry', 'costPerKg']}
            rows={() => rows.map((l) => [l.lotNo, l.garden, l.grade, l.invoiceNo, partyName(l.owner), l.ownership, l.warehouseId, locLabel(loc(l.locationId)), l.bags, l.netKg, availableKg(l), l.qc, l.arrival, l.expiry, l.costPerKg])}
          />
          <ImportCsvButton label="Import lots" template={['lotNo', 'garden', 'grade', 'invoiceNo', 'bags', 'kgPerBag', 'warehouse', 'owner', 'arrival', 'costPerKg']} onImport={importLots} />
        </>
      }
    >
      <ReadOnlyNote />
      <div className="sx-stats">
        <Stat label="Tea in stock" value={`${num(inStock.reduce((x, l) => x + l.netKg, 0))} kg`} detail={`${inStock.length} lots · ${kes(round2(inStock.reduce((x, l) => x + l.netKg * l.costPerKg, 0)), { compact: true })}`} icon={<Boxes size={17} />} />
        <Stat label="Available to promise" value={`${num(inStock.reduce((x, l) => x + availableKg(l), 0))} kg`} detail="QC-passed, not reserved" icon={<PackageCheck size={17} />} tone="blue" />
        <Stat label="On QC hold" value={`${num(held.reduce((x, l) => x + l.netKg, 0))} kg`} detail={`${held.length} lots in quarantine`} icon={<ShieldAlert size={17} />} tone={held.length ? 'red' : 'green'} onClick={() => setTab('lots')} />
        <Stat label="Expiring ≤ 60 days" value={expiring.length} detail="First-expiry-first-out" icon={<AlertTriangle size={17} />} tone={expiring.length ? 'gold' : 'green'} onClick={() => setTab('expiry')} />
      </div>
      <div className="sx-toolbar">
        <Chips value={tab} onChange={setTab} options={[{ value: 'lots', label: 'Lots', count: rows.length }, { value: 'hus', label: 'Handling units', count: state.hus.length }, { value: 'trace', label: 'Trace' }, { value: 'expiry', label: 'Expiry (FEFO)' }]} />
        <select className="form-control" style={{ width: 'auto' }} value={wh} onChange={(e) => setWh(e.target.value)} aria-label="Warehouse">
          <option value="ALL">All warehouses</option>
          {ops.state.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <SearchBox value={q} onChange={setQ} placeholder="Search lot, garden, grade, invoice…" />
      </div>
      <ScanBox onScan={scan} placeholder="Scan lot / HU barcode or RFID tag…" />
      {scanMsg && <p className="sx-note">{scanMsg}</p>}
      {tab === 'lots' && <DataTable rows={rows} columns={columns} rowKey={(l) => l.id} onRowClick={(l) => setOpenId(l.id)} selected={openId} pageSize={15} />}
      {tab === 'hus' && <DataTable rows={state.hus.filter((h) => rows.some((l) => l.id === h.lotId))} columns={huCols} rowKey={(h) => h.id} pageSize={15} onRowClick={(h) => setOpenId(h.lotId)} />}
      {tab === 'trace' && (
        <div className="sx-panel">
          <div className="sx-panel-body">
            <Field label="Lot to trace">
              <select className="form-control" value={traceId} onChange={(e) => setTraceId(e.target.value)}>
                {state.lots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lotNo} — {l.garden} {l.grade} ({l.invoiceNo})
                  </option>
                ))}
              </select>
            </Field>
            <TraceTable lotId={traceId} />
          </div>
        </div>
      )}
      {tab === 'expiry' && (
        <DataTable
          rows={fefo(state.lots.filter((l) => l.status === 'IN_STOCK'))}
          columns={[
            { key: 'n', header: 'Lot', render: (l) => <b className="sx-mono">{l.lotNo}</b> },
            { key: 't', header: 'Tea', render: (l) => `${l.garden} ${l.grade}` },
            { key: 'w', header: 'Warehouse', render: (l) => whName(l.warehouseId), hideOnMobile: true },
            { key: 'k', header: 'Net kg', render: (l) => num(l.netKg), align: 'right' },
            { key: 'e', header: 'Best before', render: (l) => fmtDate(l.expiry) },
            { key: 'd', header: 'Days left', render: (l) => <b className={expiryState(l) === 'OK' ? '' : 'sx-danger-text'}>{daysToExpiry(l)}</b>, align: 'right' }
          ]}
          rowKey={(l) => l.id}
          onRowClick={(l) => setOpenId(l.id)}
          pageSize={15}
        />
      )}
      {open && <LotDrawer lot={open} onClose={() => setOpenId(null)} />}
    </SuitePage>
  );
};

/** Lot movement history, with the instruction, loading plan and shipment it went into. */
export const TraceTable: React.FC<{ lotId: string }> = ({ lotId }) => {
  const { state, whName } = useWarehouseExt();
  const shp = useShippingExt();
  const moves = traceLot(state, lotId);
  const lot = state.lots.find((l) => l.id === lotId);
  const sis = shp.state.instructions.filter((si) => si.lines.some((l) => l.lotId === lotId));
  const plans = state.loadingPlans.filter((p) => p.lines.some((l) => l.lotId === lotId));
  return (
    <>
      {lot && (
        <p className="sx-note">
          {lot.lotNo}: received {fmtDate(lot.arrival)}
          {lot.asnId ? ` on ${state.asns.find((a) => a.id === lot.asnId)?.number}` : ''} · instructions {sis.map((s) => s.number).join(', ') || 'none'} · containers {plans.map((p) => p.container || p.number).join(', ') || 'none'}
        </p>
      )}
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Movement</th>
            <th>Reference</th>
            <th>From → to</th>
            <th style={{ textAlign: 'right' }}>Kg</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((m) => (
            <tr key={m.id}>
              <td>{fmtDate(m.date)}</td>
              <td>{MOVE_LABEL[m.kind]}</td>
              <td className="sx-mono">{m.ref}</td>
              <td>
                {m.from ? (state.locations.find((x) => x.id === m.from) ? locLabel(state.locations.find((x) => x.id === m.from)) : whName(m.from)) : ''}
                {m.to ? ` → ${state.locations.find((x) => x.id === m.to) ? locLabel(state.locations.find((x) => x.id === m.to)) : whName(m.to)}` : ''}
              </td>
              <td style={{ textAlign: 'right' }}>{m.kg ? num(m.kg) : '—'}</td>
              <td>{m.by}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

const LotDrawer: React.FC<{ lot: TeaLot; onClose: () => void }> = ({ lot, onClose }) => {
  const w = useWarehouseExt();
  const docs = useDocCtx();
  const { state, actor, whName, partyName, setQc, moveLot, transferOwnership, consumeConsignment } = w;
  const { readOnly } = useAccess();
  const [note, setNote] = useState('');
  const [locId, setLocId] = useState(lot.locationId ?? '');
  const [owner, setOwner] = useState(lot.owner);
  const [ownership, setOwnership] = useState<Ownership>(lot.ownership);
  const [ownNote, setOwnNote] = useState('');
  const [kg, setKg] = useState(0);
  const hus = state.hus.filter((h) => h.lotId === lot.id);
  const customers = w.ops.finance.state.parties.filter((p) => p.kind === 'CUSTOMER');
  const wv = weightVariance(lot);
  const stockCard = () => docs.print('stockcard', `Stock card ${lot.lotNo}`, { lot, number: `STC-${lot.lotNo}` });
  return (
    <Drawer wide title={`${lot.lotNo} — ${lot.garden} ${lot.grade}`} subtitle={`Invoice ${lot.invoiceNo} · ${whName(lot.warehouseId)}`} badge={<Pill status={QC_PILL[lot.qc]} label={QC_LABEL[lot.qc]} />} onClose={onClose}>
      <div className="sx-row">
        <DefList
          items={[
            ['Owner', `${partyName(lot.owner)} (${OWNERSHIP_LABEL[lot.ownership]})`],
            ['Location', locLabel(state.locations.find((x) => x.id === lot.locationId))],
            ['Bags × kg', `${lot.bags} × ${lot.kgPerBag} kg`],
            ['Net kg / available', `${num(lot.netKg)} / ${num(availableKg(lot))}`],
            ['Reserved', lot.reservedKg ? `${num(lot.reservedKg)} kg for ${lot.reservedFor}` : '—'],
            ['Declared vs weighed', wv === null ? '—' : `${num(lot.declaredKg)} vs ${num(lot.weighedKg ?? 0)} kg (${wv > 0 ? '+' : ''}${wv} kg)`],
            ['Arrival / best before', `${fmtDate(lot.arrival)} / ${fmtDate(lot.expiry)}`],
            ['Cost', `${kes(lot.costPerKg)} per kg`],
            ['RFID', lot.rfid ?? '—'],
            ...(lot.auction ? ([['Auction', `${lot.auction.saleNo} · ${lot.auction.status.toLowerCase()}${lot.auction.buyer ? ` · ${partyName(lot.auction.buyer)}` : ''}`]] as [string, string][]) : []),
            ...Object.entries(lot.attributes ?? {}).map(([k, v]) => [k, v] as [string, string])
          ]}
        />
        <div>
          <Barcode value={lot.lotNo} />
          <div className="sx-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={stockCard}>
              <ClipboardList size={14} /> Stock card
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => printDocument(`Labels ${lot.lotNo}`, labelSheetHtml([{ code: lot.lotNo, title: `${lot.garden} ${lot.grade}`, detail: lot.invoiceNo }, ...hus.map((h) => ({ code: h.code, title: `${lot.lotNo} · ${h.bags} bags`, detail: `RFID ${h.rfid}` }))]))}>
              <Tags size={14} /> Print labels
            </button>
          </div>
        </div>
      </div>
      {lot.qcNote && (
        <div className="sx-callout warn">
          <ShieldAlert size={16} />
          <div>
            <b>QC note</b>
            <span>{lot.qcNote}</span>
          </div>
        </div>
      )}
      {lot.status === 'IN_STOCK' && !readOnly && (
        <>
          <h4 className="sx-subhead">Quality status (Quality Controller)</h4>
          <div className="sx-inline-form">
            <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Result / reason (e.g. moisture 7.4%)" />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setQc(lot.id, 'PASS', note).ok && setNote('')}>
              Pass
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setQc(lot.id, 'HOLD', note).ok && setNote('')}>
              Hold
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => setQc(lot.id, 'FAIL', note).ok && setNote('')}>
              Fail
            </button>
          </div>
          <h4 className="sx-subhead">Move / put away</h4>
          <div className="sx-inline-form">
            <select className="form-control" value={locId} onChange={(e) => setLocId(e.target.value)} aria-label="Location">
              {state.locations
                .filter((x) => x.warehouseId === lot.warehouseId && x.active)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {locLabel(x)} · {x.zone.toLowerCase()}
                    {x.preferredGrade ? ` · ${x.preferredGrade}` : ''}
                  </option>
                ))}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => moveLot(lot.id, locId)}>
              Move
            </button>
          </div>
          <h4 className="sx-subhead">Ownership (transfer posting)</h4>
          <div className="sx-inline-form">
            <select className="form-control" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
              <option value="OWN">Own stock</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {lot.supplierId && <option value={lot.supplierId}>{partyName(lot.supplierId)} (supplier)</option>}
            </select>
            <select className="form-control" value={ownership} onChange={(e) => setOwnership(e.target.value as Ownership)} aria-label="Ownership type">
              {(Object.keys(OWNERSHIP_LABEL) as Ownership[]).map((o) => (
                <option key={o} value={o}>
                  {OWNERSHIP_LABEL[o]}
                </option>
              ))}
            </select>
            <input className="form-control" value={ownNote} onChange={(e) => setOwnNote(e.target.value)} placeholder="Contract / reason" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => transferOwnership(lot.id, owner, ownership, ownNote)}>
              Transfer
            </button>
          </div>
          {lot.ownership === 'CONSIGNMENT' && (
            <>
              <h4 className="sx-subhead">Use consignment stock (supplier is billed)</h4>
              <div className="sx-inline-form">
                <input className="form-control" type="number" min="0" value={kg || ''} onChange={(e) => setKg(Number(e.target.value))} placeholder="Kg to consume" />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => consumeConsignment(lot.id, kg)}>
                  Consume and bill supplier
                </button>
              </div>
            </>
          )}
          <p className="sx-note">
            Acting as {actor.name} ({actor.title}). QC releases and holds need the Quality Controller; moves need Stores; ownership needs the Operations Manager.
          </p>
        </>
      )}
      <h4 className="sx-subhead">Handling units ({hus.length})</h4>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>HU</th>
            <th>RFID</th>
            <th style={{ textAlign: 'right' }}>Bags</th>
            <th style={{ textAlign: 'right' }}>Kg</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {hus.map((h) => (
            <tr key={h.id}>
              <td className="sx-mono">{h.code}</td>
              <td className="sx-mono">{h.rfid}</td>
              <td style={{ textAlign: 'right' }}>{h.bags}</td>
              <td style={{ textAlign: 'right' }}>{num(h.kg)}</td>
              <td>{h.status.toLowerCase()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 className="sx-subhead">Trace</h4>
      <TraceTable lotId={lot.id} />
      <Attachments owner={`warehousing:${lot.lotNo}`} by={actor.name} readOnly={readOnly} title="Lot documents (sample reports, certificates)" />
      <h4 className="sx-subhead">History</h4>
      <Timeline items={lot.history} />
    </Drawer>
  );
};
