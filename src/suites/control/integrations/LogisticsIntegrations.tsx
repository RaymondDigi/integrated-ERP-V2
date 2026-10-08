import React, { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, BookOpen, Boxes, CheckCircle2, Cloud, FileJson, Gavel, Link2, Plane, Printer, ScanLine, Ship, Tag } from 'lucide-react';
import { createBus, pid, stamp } from '../../../platform/bus';
import { downloadText } from '../../../platform/csv';
import { useAccess } from '../../../platform/access';
import { ExportCsvButton, ImportCsvButton, printDocument } from '../../../platform/Widgets';
import { Chips, DataTable, Panel, Pill, SearchBox, type Column } from '../../ui/kit';
import { useShippingExt } from '../../operations/shipping/store';
import { siKg } from '../../operations/shipping/engine';
import { useWarehouseExt } from '../../operations/warehousing/store';
import { availableKg } from '../../operations/warehousing/engine';
import { ScanBox, SimBadge } from '../../operations/warehousing/ui';
import { useControl } from '../store';
import type { ItAsset } from '../types';
import { Barcode, labelSheetHtml } from './barcode';

/**
 * Logistics integrations for Warehousing and Shipping. None of the external systems are reachable from this
 * front-end-only build, so every connector here is a labelled simulation: it produces the same records and
 * log entries a live connector would, so the workflow around it can be exercised.
 */
interface SimLog {
  id: string;
  at: string;
  system: string;
  direction: 'IN' | 'OUT';
  message: string;
  status: 'OK' | 'PENDING' | 'ACK' | 'FAIL';
  payload?: string;
}
const simLog = createBus<SimLog>();
const log = (e: Omit<SimLog, 'id' | 'at'>) => simLog.push({ ...e, id: pid('sl'), at: stamp() });

type Tab = 'connectors' | 'messages' | 'assets' | 'dictionary' | 'data';

export const LogisticsIntegrations: React.FC = () => {
  const [tab, setTab] = useState<Tab>('connectors');
  return (
    <section className="sx-panel" style={{ marginTop: 18 }}>
      <div className="sx-panel-head">
        <div>
          <h2>Logistics integrations</h2>
          <p>Warehousing, shipping and asset tagging — customs, port, auction, courier, document and partner systems</p>
        </div>
        <SimBadge text="Simulated in this build" />
      </div>
      <div className="sx-panel-body">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: 'connectors', label: 'Connectors' },
            { value: 'messages', label: 'EDI / JSON messages' },
            { value: 'assets', label: 'Asset tags' },
            { value: 'dictionary', label: 'Data dictionary' },
            { value: 'data', label: 'Import / export' }
          ]}
        />
        {tab === 'connectors' && <Connectors />}
        {tab === 'messages' && <Messages />}
        {tab === 'assets' && <AssetTags />}
        {tab === 'dictionary' && <Dictionary />}
        {tab === 'data' && <ImportExport />}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ */

const Connectors: React.FC = () => {
  const shp = useShippingExt();
  const wh = useWarehouseExt();
  const { readOnly } = useAccess();
  const shipments = shp.ops.state.shipments.filter((s) => s.stage !== 'DELIVERED');
  const [shipId, setShipId] = useState(shipments[0]?.id ?? '');
  const entries = simLog.use();
  const pull = (sys: 'KEPHIS' | 'KRA' | 'KPA' | 'LINE', name: string) => {
    const r = shp.pullExternal(shipId, sys);
    log({ system: name, direction: 'IN', message: r.message, status: r.ok ? 'OK' : 'FAIL' });
  };
  const auctionFeed = () => {
    const catalogued = wh.state.lots.filter((l) => l.auction?.status === 'CATALOGUED');
    if (!catalogued.length) return log({ system: 'EATTA auction feed', direction: 'IN', message: 'No catalogued lots awaiting sale results', status: 'OK' });
    const rows = catalogued.map((l, i) => ({ catalogueNo: l.auction?.catalogueNo ?? '', lotNo: l.lotNo, buyer: i % 3 === 2 ? '' : 'c8', priceUsd: String(((l.auction?.valuationUsd ?? 2.8) * (0.95 + (i % 4) * 0.04)).toFixed(2)), status: i % 3 === 2 ? 'UNSOLD' : 'SOLD' }));
    const r = wh.importSaleResults(rows);
    log({ system: 'EATTA auction feed', direction: 'IN', message: `Sale results: ${r.imported} lot(s) updated${r.errors.length ? ` · ${r.errors.join('; ')}` : ''}`, status: r.errors.length && !r.imported ? 'FAIL' : 'OK', payload: JSON.stringify(rows, null, 2) });
  };
  const threePl = () => {
    const held = wh.state.lots.filter((l) => l.ownership === 'CUSTOMER' && l.status === 'IN_STOCK');
    const payload = JSON.stringify({ generated: stamp(), warehouse: 'CTCL', stock: held.map((l) => ({ owner: wh.partyName(l.owner), lot: l.lotNo, garden: l.garden, grade: l.grade, bags: l.bags, netKg: l.netKg, availableKg: availableKg(l), qc: l.qc, location: l.warehouseId })) }, null, 2);
    downloadText('3pl-stock-feed.json', payload, 'application/json');
    log({ system: '3PL customer feed', direction: 'OUT', message: `Stock position for ${held.length} customer-owned lot(s) published`, status: 'OK', payload });
  };
  const courier = (name: 'FedEx' | 'UPS') => {
    const load = wh.state.loads.find((l) => l.carrierId && wh.state.carriers.find((c) => c.id === l.carrierId)?.api);
    const tracking = `${name === 'FedEx' ? '7946' : '1Z'}${Math.random().toString().slice(2, 12)}`;
    log({ system: `${name} API`, direction: 'IN', message: load ? `${load.number}: ${load.tracking ?? tracking} — in transit, next scan Dubai hub` : `Rate quote Nairobi → Dubai 25 kg: USD ${(name === 'FedEx' ? 212 : 198).toFixed(2)} · tracking format ${tracking}`, status: 'OK' });
  };
  const dms = () => {
    const docs = shp.state.generated.slice(0, 10);
    log({ system: 'SharePoint DMS', direction: 'OUT', message: docs.length ? `Filed ${docs.length} issued document(s): ${docs.map((d) => d.number).join(', ')}` : 'Nothing issued yet — register documents in Shipping › Document templates', status: docs.length ? 'OK' : 'PENDING' });
  };
  const ctcl = () => {
    const payload = JSON.stringify({ endpoint: 'GET /api/v1/stock?warehouse=WH-MSA', status: 200, body: wh.state.lots.filter((l) => l.warehouseId === 'WH-MSA' && l.status === 'IN_STOCK').map((l) => ({ lot: l.lotNo, grade: l.grade, kg: l.netKg })) }, null, 2);
    log({ system: 'CTCL web systems (REST)', direction: 'OUT', message: 'Answered GET /api/v1/stock for WH-MSA', status: 'OK', payload });
  };
  const cards: { id: string; name: string; icon: React.ReactNode; purpose: string; actions: React.ReactNode }[] = [
    {
      id: 'customs',
      name: 'KRA ICMS · KEPHIS · KPA · Shipping line',
      icon: <Ship size={16} />,
      purpose: 'Pulls customs entry, phyto, port gate-in and B/L status into the shipment milestones (Shipping › External tracking).',
      actions: (
        <>
          <select className="form-control" value={shipId} onChange={(e) => setShipId(e.target.value)} aria-label="Shipment">
            {shipments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.number} · {s.vessel}
              </option>
            ))}
          </select>
          {(
            [
              ['KRA', 'KRA ICMS'],
              ['KEPHIS', 'KEPHIS'],
              ['KPA', 'KPA'],
              ['LINE', 'Shipping line']
            ] as const
          ).map(([k, n]) => (
            <button key={k} type="button" className="btn btn-secondary btn-sm" disabled={readOnly || !shipId} onClick={() => pull(k, n)}>
              Pull {n}
            </button>
          ))}
        </>
      )
    },
    { id: 'eatta', name: 'EATTA / auction system', icon: <Gavel size={16} />, purpose: 'Receives sale results for catalogued lots (buyer, price, unsold) into Warehousing › Auction & warrants.', actions: <button type="button" className="btn btn-secondary btn-sm" disabled={readOnly} onClick={auctionFeed}>Fetch sale results</button> },
    { id: '3pl', name: '3PL customer system', icon: <Boxes size={16} />, purpose: 'Publishes the stock position of tea held for customers as a JSON feed for their systems.', actions: <button type="button" className="btn btn-secondary btn-sm" onClick={threePl}>Publish stock feed</button> },
    {
      id: 'courier',
      name: 'FedEx / UPS',
      icon: <Plane size={16} />,
      purpose: 'Courier rate quotes and tracking for samples and documents; courier carriers appear in Warehousing › Transport rate shopping.',
      actions: (
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => courier('FedEx')}>
            FedEx track / quote
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => courier('UPS')}>
            UPS track / quote
          </button>
        </>
      )
    },
    { id: 'dms', name: 'Document management (SharePoint)', icon: <Cloud size={16} />, purpose: 'Files every registered shipping document in the DMS library by shipment.', actions: <button type="button" className="btn btn-secondary btn-sm" onClick={dms}>Sync documents</button> },
    { id: 'ctcl', name: 'CTCL web systems (REST)', icon: <Link2 size={16} />, purpose: 'Stock enquiry endpoint other CTCL systems call; the response is shown in the log.', actions: <button type="button" className="btn btn-secondary btn-sm" onClick={ctcl}>Simulate GET /stock</button> }
  ];
  const cols: Column<SimLog>[] = [
    { key: 'a', header: 'When', render: (l) => l.at, width: 140 },
    { key: 's', header: 'System', render: (l) => <b>{l.system}</b> },
    { key: 'd', header: 'Dir', render: (l) => (l.direction === 'IN' ? <ArrowDownToLine size={14} /> : <ArrowUpFromLine size={14} />), width: 50 },
    { key: 'm', header: 'Message', render: (l) => l.message },
    { key: 'st', header: 'Result', render: (l) => <Pill status={{ OK: 'POSTED', ACK: 'APPROVED', PENDING: 'SUBMITTED', FAIL: 'REJECTED' }[l.status]} label={l.status.toLowerCase()} /> }
  ];
  return (
    <>
      <div className="sx-row">
        {cards.map((c) => (
          <section key={c.id} className="sx-panel sx-connector">
            <div className="sx-panel-head">
              <div>
                <h2>
                  {c.icon} {c.name}
                </h2>
              </div>
              <SimBadge />
            </div>
            <div className="sx-panel-body">
              <p className="sx-note">{c.purpose}</p>
              <div className="sx-actions" style={{ flexWrap: 'wrap' }}>
                {c.actions}
              </div>
            </div>
          </section>
        ))}
      </div>
      <Panel title="Logistics sync log" subtitle="Calls made by the simulated connectors in this session">
        <DataTable rows={entries} columns={cols} rowKey={(l) => l.id} empty="No calls yet — use a connector above" pageSize={10} />
      </Panel>
    </>
  );
};

/* ------------------------------------------------------------------ */

const Messages: React.FC = () => {
  const shp = useShippingExt();
  const entries = simLog.use().filter((l) => l.system.startsWith('EDI'));
  const [shipId, setShipId] = useState(shp.ops.state.shipments[0]?.id ?? '');
  const [format, setFormat] = useState<'EDIFACT' | 'JSON'>('EDIFACT');
  const sh = shp.ops.state.shipments.find((s) => s.id === shipId);
  const si = shp.state.instructions.find((x) => x.id === sh?.siId);
  const build = () => {
    if (!sh) return '';
    if (format === 'JSON')
      return JSON.stringify({ messageType: 'DESADV', shipment: sh.number, buyer: shp.party(sh.customerId)?.name, vessel: sh.vessel, etd: sh.etd, container: sh.container ?? null, seal: sh.seal ?? null, vgmKg: sh.vgm?.grossKg ?? null, lines: si ? si.lines.map((l) => ({ lot: l.lotNo, invoice: l.invoiceNo, grade: l.grade, bags: l.bags, netKg: l.netKg })) : sh.lines.map((l) => ({ sku: l.sku, qty: l.qty })), totalKg: si ? siKg(si) : undefined }, null, 2);
    const seg = [
      "UNA:+.? '",
      `UNB+UNOC:3+CTCL:ZZ+${(shp.party(sh.customerId)?.name ?? 'BUYER').replace(/\W+/g, '').slice(0, 12).toUpperCase()}:ZZ+${stamp().replace(/\D/g, '').slice(2, 12)}+${sh.number.replace(/\W/g, '')}'`,
      `UNH+1+DESADV:D:96A:UN'`,
      `BGM+351+${sh.number}+9'`,
      `DTM+137:${sh.etd.replace(/-/g, '')}:102'`,
      `TDT+20+${sh.bookingRef}+1++${sh.line}+++:::${sh.vessel}'`,
      `EQD+CN+${sh.container ?? 'TBA'}'`,
      ...(sh.vgm ? [`MEA+AAE+VGM+KGM:${sh.vgm.grossKg}'`] : []),
      ...(si ? si.lines : []).flatMap((l, i) => [`LIN+${i + 1}++${l.lotNo}:LOT'`, `IMD+F++:::${l.garden} ${l.grade} ${l.invoiceNo}'`, `QTY+12:${l.bags}:BG'`, `MEA+AAA+AAL+KGM:${l.netKg}'`]),
      `UNT+${8 + (si ? si.lines.length * 4 : 0)}+1'`,
      `UNZ+1+${sh.number.replace(/\W/g, '')}'`
    ];
    return seg.join('\n');
  };
  const payload = build();
  const send = () => {
    if (!sh) return;
    downloadText(`${sh.number}-DESADV.${format === 'JSON' ? 'json' : 'edi'}`, payload, format === 'JSON' ? 'application/json' : 'text/plain');
    log({ system: `EDI ${format}`, direction: 'OUT', message: `DESADV for ${sh.number} sent to ${shp.party(sh.customerId)?.name}`, status: 'PENDING', payload });
  };
  const ack = () => {
    const pending = simLog.all().filter((l) => l.system.startsWith('EDI') && l.status === 'PENDING' && l.direction === 'OUT');
    if (!pending.length) return log({ system: 'EDI acknowledgement', direction: 'IN', message: 'No messages awaiting acknowledgement', status: 'OK' });
    simLog.set(simLog.all().map((l) => (pending.includes(l) ? { ...l, status: 'ACK' as const } : l)));
    log({ system: 'EDI CONTRL', direction: 'IN', message: `${pending.length} acknowledgement(s) received (CONTRL accepted)`, status: 'OK' });
  };
  return (
    <>
      <div className="sx-toolbar">
        <select className="form-control" value={shipId} onChange={(e) => setShipId(e.target.value)} aria-label="Shipment">
          {shp.ops.state.shipments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.number} · {shp.party(s.customerId)?.name}
            </option>
          ))}
        </select>
        <select className="form-control" value={format} onChange={(e) => setFormat(e.target.value as typeof format)} aria-label="Format">
          <option value="EDIFACT">UN/EDIFACT DESADV</option>
          <option value="JSON">JSON (REST)</option>
        </select>
        <button type="button" className="btn btn-primary btn-sm" disabled={!sh} onClick={send}>
          <FileJson size={14} /> Send despatch advice
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={ack}>
          <CheckCircle2 size={14} /> Poll acknowledgements
        </button>
      </div>
      <pre className="sx-note" style={{ maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12 }}>
        {payload}
      </pre>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Message</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((l) => (
            <tr key={l.id}>
              <td>{l.at}</td>
              <td>{l.message}</td>
              <td>{l.status.toLowerCase()}</td>
            </tr>
          ))}
          {!entries.length && (
            <tr>
              <td colSpan={3} className="sx-muted">
                No messages yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
};

/* ------------------------------------------------------------------ */

const AssetTags: React.FC = () => {
  const { state } = useControl();
  const assets: ItAsset[] = state.assets;
  const [q, setQ] = useState('');
  const [found, setFound] = useState<ItAsset | null | undefined>(undefined);
  const rows = assets.filter((a) => !q || `${a.tag} ${a.model} ${a.assignedTo}`.toLowerCase().includes(q.toLowerCase()));
  const cols: Column<ItAsset>[] = [
    { key: 't', header: 'Tag', render: (a) => <Barcode value={a.tag} height={28} />, width: 220 },
    { key: 'm', header: 'Asset', render: (a) => <div className="sx-cell-main"><b>{a.model}</b><small>{a.type} · {a.department}</small></div> },
    { key: 'u', header: 'Assigned to', render: (a) => a.assignedTo || '—' },
    { key: 's', header: 'Status', render: (a) => a.status.toLowerCase().replace('_', ' ') }
  ];
  return (
    <>
      <p className="sx-note">
        <Tag size={14} /> Every IT asset carries a Code 39 barcode of its tag. Scan it (or an RFID tag that sends the same ID) to look the asset up. RFID readers are hardware — the scan box below accepts their keyboard-wedge input. <SimBadge text="RFID simulated" />
      </p>
      <div className="sx-toolbar">
        <ScanBox
          placeholder="Scan an asset barcode or RFID tag…"
          onScan={(code) => {
            const a = assets.find((x) => x.tag.toUpperCase() === code.trim().toUpperCase());
            setFound(a ?? null);
            log({ system: 'Barcode / RFID scan', direction: 'IN', message: a ? `${a.tag}: ${a.model} (${a.assignedTo || 'unassigned'})` : `${code}: no asset with this tag`, status: a ? 'OK' : 'FAIL' });
          }}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Filter assets" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => printDocument('Asset labels', labelSheetHtml(rows.map((a) => ({ code: a.tag, title: a.model, detail: `${a.type} · ${a.department}` }))))}>
          <Printer size={14} /> Print labels ({rows.length})
        </button>
      </div>
      {found !== undefined && (
        <div className={`sx-callout ${found ? '' : 'warn'}`}>
          <ScanLine size={16} />
          <div>
            <b>{found ? `${found.tag} — ${found.model}` : 'Not found'}</b>
            <span>{found ? `${found.type} · ${found.department} · ${found.assignedTo || 'unassigned'} · warranty to ${found.warrantyEnd}` : 'No asset carries that tag.'}</span>
          </div>
        </div>
      )}
      <DataTable rows={rows} columns={cols} rowKey={(a) => a.id} pageSize={8} />
    </>
  );
};

/* ------------------------------------------------------------------ */

const describe = (v: unknown): string => (Array.isArray(v) ? 'list' : v === null || v === undefined ? 'optional' : typeof v === 'object' ? 'record' : typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'yes/no' : /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? 'date' : 'text');

const Dictionary: React.FC = () => {
  const wh = useWarehouseExt();
  const shp = useShippingExt();
  const sources: [string, string, unknown[]][] = [
    ['Warehousing', 'Tea lot', wh.state.lots],
    ['Warehousing', 'Handling unit', wh.state.hus],
    ['Warehousing', 'Lot movement', wh.state.lotMoves],
    ['Warehousing', 'Storage location', wh.state.locations],
    ['Warehousing', 'Advance shipping notice', wh.state.asns],
    ['Warehousing', 'Loading plan', wh.state.loadingPlans],
    ['Warehousing', 'Transport load', wh.state.loads],
    ['Warehousing', 'Return authorisation', wh.state.returns],
    ['Warehousing', 'Warehouse warrant', wh.state.warrants],
    ['Warehousing', 'Warehouse', shp.ops.state.warehouses],
    ['Warehousing', 'Stock transfer', shp.ops.state.transfers],
    ['Warehousing', 'Stock count', shp.ops.state.counts],
    ['Shipping', 'Shipment', shp.ops.state.shipments],
    ['Shipping', 'Shipping instruction', shp.state.instructions],
    ['Shipping', 'Vessel voyage', shp.state.voyages],
    ['Shipping', 'Bond', shp.state.bonds],
    ['Shipping', 'Shipment charge', shp.state.charges],
    ['Shipping', 'Truck booking', shp.state.trucks],
    ['Shipping', 'Customs licence', shp.state.licences],
    ['Shipping', 'IDF', shp.state.idfs]
  ];
  type Row = { id: string; module: string; entity: string; field: string; type: string; example: string; filled: string };
  const rows: Row[] = sources.flatMap(([module, entity, list]) => {
    const keys = [...new Set(list.flatMap((r) => Object.keys(r as object)))];
    return keys.map((k) => {
      const vals = list.map((r) => (r as Record<string, unknown>)[k]);
      const sample = vals.find((v) => v !== undefined && v !== null && v !== '');
      const filled = vals.filter((v) => v !== undefined && v !== null && v !== '').length;
      return { id: `${entity}.${k}`, module, entity, field: k, type: describe(sample), example: sample === undefined ? '' : typeof sample === 'object' ? (Array.isArray(sample) ? `${sample.length} item(s)` : '{…}') : String(sample).slice(0, 40), filled: `${filled}/${list.length}` };
    });
  });
  const [q, setQ] = useState('');
  const shown = rows.filter((r) => !q || `${r.entity} ${r.field}`.toLowerCase().includes(q.toLowerCase()));
  const cols: Column<Row>[] = [
    { key: 'm', header: 'Module', render: (r) => r.module, sort: (r) => r.module },
    { key: 'e', header: 'Entity', render: (r) => <b>{r.entity}</b>, sort: (r) => r.entity },
    { key: 'f', header: 'Field', render: (r) => <span className="sx-mono">{r.field}</span>, sort: (r) => r.field },
    { key: 't', header: 'Type', render: (r) => r.type },
    { key: 'x', header: 'Example', render: (r) => <span className="sx-muted">{r.example}</span> },
    { key: 'n', header: 'Filled', render: (r) => r.filled, align: 'right' }
  ];
  return (
    <>
      <div className="sx-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search entities and fields" />
        <ExportCsvButton name="logistics-data-dictionary" header={['module', 'entity', 'field', 'type', 'example', 'filled']} rows={() => rows.map((r) => [r.module, r.entity, r.field, r.type, r.example, r.filled])} />
      </div>
      <p className="sx-note">
        <BookOpen size={14} /> Built from the live records, so it always matches what reports and exports can use. {sources.length} entities · {rows.length} fields.
      </p>
      <DataTable rows={shown} columns={cols} rowKey={(r) => r.id} pageSize={15} />
    </>
  );
};

/* ------------------------------------------------------------------ */

const ImportExport: React.FC = () => {
  const wh = useWarehouseExt();
  const shp = useShippingExt();
  const ops = shp.ops;
  return (
    <>
      <p className="sx-note">CSV opens directly in Excel; documents export to Word from Shipping › Document templates. Imports validate each row and report the rows they refused.</p>
      <div className="sx-row">
        <Panel title="Export" subtitle="Excel-ready CSV and JSON">
          <div className="sx-actions" style={{ flexWrap: 'wrap' }}>
            <ExportCsvButton name="tea-lots" label="Tea lots" header={['lotNo', 'garden', 'grade', 'invoiceNo', 'owner', 'warehouse', 'bags', 'netKg', 'qc', 'expiry']} rows={() => wh.state.lots.map((l) => [l.lotNo, l.garden, l.grade, l.invoiceNo, wh.partyName(l.owner), l.warehouseId, l.bags, l.netKg, l.qc, l.expiry])} />
            <ExportCsvButton name="shipments" label="Shipments" header={['number', 'customer', 'destination', 'vessel', 'etd', 'eta', 'stage', 'container']} rows={() => ops.state.shipments.map((s) => [s.number, shp.party(s.customerId)?.name ?? '', s.destination, s.vessel, s.etd, s.eta, s.stage, s.container ?? ''])} />
            <ExportCsvButton name="stock-transfers" label="Transfers" header={['number', 'from', 'to', 'status', 'lines', 'reason']} rows={() => ops.state.transfers.map((t) => [t.number, t.from, t.to, t.status, t.lines.map((l) => `${l.sku}×${l.qty}`).join(' '), t.reason])} />
            <ExportCsvButton name="transport-loads" label="Transport loads" header={['number', 'lane', 'date', 'kg', 'carrier', 'status', 'cost']} rows={() => wh.state.loads.map((l) => [l.number, l.lane, l.date, l.kg, wh.state.carriers.find((c) => c.id === l.carrierId)?.name ?? '', l.status, l.cost])} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadText('shipping-instructions.json', JSON.stringify(shp.state.instructions, null, 2), 'application/json')}>
              <FileJson size={14} /> Instructions (JSON)
            </button>
          </div>
        </Panel>
        <Panel title="Import" subtitle="Warehouse data from third parties">
          <div className="sx-actions" style={{ flexWrap: 'wrap' }}>
            <ImportCsvButton label="Tea lots (CSV)" template={['lotNo', 'garden', 'grade', 'invoiceNo', 'bags', 'kgPerBag', 'warehouse', 'owner', 'arrival', 'costPerKg']} onImport={wh.importLots} />
            <ImportCsvButton label="Auction sale results (CSV)" template={['catalogueNo', 'lotNo', 'buyer', 'priceUsd', 'status']} onImport={wh.importSaleResults} />
          </div>
        </Panel>
      </div>
    </>
  );
};
