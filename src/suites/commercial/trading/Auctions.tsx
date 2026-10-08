import React, { useState } from 'react';
import { Gavel, Coffee, Send, Search, Printer, PlayCircle, Lock } from 'lucide-react';
import { useCommercial } from '../store';
import { fmtDate, kes, TODAY } from '../../finance/engine';
import type { AuctionSale, SampleDispatch, TastingRecord } from '../tradeTypes';
import { Chips, DataTable, Drawer, Field, Panel, Pill, Stat, SuitePage, type Column, DefList } from '../../ui/kit';
import { PartySelect } from '../parts';
import { ImportCsvButton, printDocument } from '../../../platform/Widgets';
import { highestBid, matchStock, tastingTotal, TEA_GRADES, TEA_ORIGINS } from '../tradeEngine';
import { sampleHtml } from './docs';

type Tab = 'SALES' | 'TASTING' | 'SAMPLES' | 'MATCH';

/** Mombasa tea auction: catalogues, bids within credit, knock-down to sales orders, tasting, samples and stock matching. */
export const AuctionsPage: React.FC = () => {
  const { state } = useCommercial();
  const [tab, setTab] = useState<Tab>('SALES');
  const open = state.auctions.filter((a) => a.status === 'OPEN');
  return (
    <SuitePage eyebrow="Tea" title="Auctions & tasting" subtitle="Weekly Mombasa sale catalogues, customer bids checked against credit, tasting scores and sample dispatch.">
      <div className="sx-stats">
        <Stat label="Sales open for bids" value={open.length} icon={<Gavel size={17} />} onClick={() => setTab('SALES')} />
        <Stat label="Lots open" value={open.reduce((x, a) => x + a.lots.filter((l) => l.status === 'OPEN').length, 0)} icon={<Gavel size={17} />} tone="blue" />
        <Stat label="Tastings recorded" value={state.tastings.length} icon={<Coffee size={17} />} tone="gold" onClick={() => setTab('TASTING')} />
        <Stat label="Samples in transit" value={state.samples.filter((s) => s.status === 'DISPATCHED').length} icon={<Send size={17} />} tone="violet" onClick={() => setTab('SAMPLES')} />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: 'SALES', label: 'Auction sales' },
            { value: 'TASTING', label: 'Tasting' },
            { value: 'SAMPLES', label: 'Samples' },
            { value: 'MATCH', label: 'Match a request' }
          ]}
        />
      </div>
      {tab === 'SALES' && <SalesTab />}
      {tab === 'TASTING' && <TastingTab />}
      {tab === 'SAMPLES' && <SamplesTab />}
      {tab === 'MATCH' && <MatchTab />}
    </SuitePage>
  );
};

const SalesTab: React.FC = () => {
  const { state, importCatalogue } = useCommercial();
  const [openId, setOpenId] = useState<string | null>(null);
  const [meta, setMeta] = useState({ saleNo: '', date: TODAY, broker: 'Africa Tea Brokers Ltd', fxRate: 129.5 });
  const cols: Column<AuctionSale>[] = [
    { key: 'n', header: 'Sale', render: (a) => <b className="sx-mono">{a.saleNo}</b>, sort: (a) => a.saleNo },
    { key: 'd', header: 'Date', render: (a) => fmtDate(a.date), sort: (a) => a.date },
    { key: 'b', header: 'Broker', render: (a) => a.broker, hideOnMobile: true },
    { key: 'l', header: 'Lots', render: (a) => a.lots.length, align: 'right' },
    { key: 's', header: 'Sold', render: (a) => a.lots.filter((l) => l.status === 'SOLD').length, align: 'right' },
    { key: 'src', header: 'Source', render: (a) => (a.source === 'EATTA_IMPORT' ? 'EATTA file (simulated)' : 'Manual') },
    { key: 'st', header: 'Status', render: (a) => <Pill status={a.status === 'OPEN' ? 'APPROVED' : a.status === 'CLOSED' ? 'POSTED' : 'DRAFT'} label={a.status.toLowerCase()} /> }
  ];
  const current = state.auctions.find((a) => a.id === openId);
  return (
    <>
      <Panel title="Load a catalogue" subtitle="Import the broker's catalogue CSV (lot, garden, grade, packages, netKg, valuation, reserve)">
        <div className="tr-sim">EATTA / broker feed is simulated: upload a CSV exported from the broker catalogue. No live connection to the exchange.</div>
        <div className="tr-row">
          <input className="form-control" placeholder="Sale number e.g. SALE 42/2026" value={meta.saleNo} onChange={(e) => setMeta({ ...meta, saleNo: e.target.value })} />
          <input className="form-control" type="date" aria-label="Sale date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
          <input className="form-control" placeholder="Broker" value={meta.broker} onChange={(e) => setMeta({ ...meta, broker: e.target.value })} />
          <input className="form-control" type="number" aria-label="USD/KES rate" value={meta.fxRate} onChange={(e) => setMeta({ ...meta, fxRate: Number(e.target.value) })} />
          <ImportCsvButton label="Import catalogue" template={['lot', 'garden', 'grade', 'packages', 'netKg', 'valuation']} onImport={(rows) => importCatalogue(rows, meta)} />
        </div>
      </Panel>
      <DataTable rows={state.auctions} columns={cols} rowKey={(a) => a.id} onRowClick={(a) => setOpenId(a.id)} selected={openId} initialSort={{ key: 'd', dir: 'desc' }} />
      {current && <SaleDrawer a={current} onClose={() => setOpenId(null)} />}
    </>
  );
};

const SaleDrawer: React.FC<{ a: AuctionSale; onClose: () => void }> = ({ a, onClose }) => {
  const { state, party, openSale, closeSale, placeBid, closeLot, withdrawLot, setTrading } = useCommercial();
  const [bid, setBid] = useState<{ lot: string; customerId: string; price: number }>({ lot: '', customerId: '', price: 0 });
  return (
    <Drawer
      wide
      title={a.saleNo}
      subtitle={`${a.centre} · ${fmtDate(a.date)} · USD 1 = KES ${a.fxRate}`}
      badge={<Pill status={a.status === 'OPEN' ? 'APPROVED' : a.status === 'CLOSED' ? 'POSTED' : 'DRAFT'} label={a.status.toLowerCase()} />}
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          {a.status === 'CATALOGUED' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => openSale(a.id)}>
              <PlayCircle size={14} /> Open for bidding
            </button>
          )}
          {a.status === 'OPEN' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => closeSale(a.id)}>
              <Lock size={14} /> Close sale & publish reference prices
            </button>
          )}
        </>
      }
    >
      {a.status === 'OPEN' && (
        <Panel title="Place a bid for a customer" subtitle="Bids are checked against KYC and live credit headroom (including other winning bids)">
          <div className="tr-row">
            <select className="form-control" aria-label="Lot" value={bid.lot} onChange={(e) => setBid({ ...bid, lot: e.target.value })}>
              <option value="">Lot…</option>
              {a.lots
                .filter((l) => l.status === 'OPEN')
                .map((l) => (
                  <option key={l.lotNo} value={l.lotNo}>
                    {l.lotNo} · {l.garden} {l.grade}
                  </option>
                ))}
            </select>
            <div className="grow">
              <PartySelect kind="CUSTOMER" value={bid.customerId} onChange={(v) => setBid({ ...bid, customerId: v })} />
            </div>
            <input className="form-control" type="number" step="0.01" aria-label="Bid USD per kg" value={bid.price || ''} placeholder="USD/kg" onChange={(e) => setBid({ ...bid, price: Number(e.target.value) })} />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => placeBid(a.id, bid.lot, bid.customerId, bid.price)}>
              <Gavel size={14} /> Bid
            </button>
          </div>
        </Panel>
      )}
      <div className="tr-table-wrap">
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Lot</th>
              <th>Garden / grade</th>
              <th style={{ textAlign: 'right' }}>Kg</th>
              <th style={{ textAlign: 'right' }}>Valuation</th>
              <th style={{ textAlign: 'right' }}>Reserve</th>
              <th>Top bid</th>
              <th>Taste</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {a.lots.map((l) => {
              const top = highestBid(l);
              return (
                <tr key={l.lotNo}>
                  <td className="sx-mono">{l.lotNo}</td>
                  <td>
                    {l.garden} · {l.grade} <small className="sx-muted">{l.packages} pkgs</small>
                  </td>
                  <td style={{ textAlign: 'right' }}>{l.netKg}</td>
                  <td style={{ textAlign: 'right' }}>{l.valuation.toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>{l.reserve.toFixed(2)}</td>
                  <td>{top ? `${top.price.toFixed(2)} · ${party(top.customerId)?.name}` : '—'}</td>
                  <td>{l.tastingScore ? `${l.tastingScore}/10` : '—'}</td>
                  <td>{l.status === 'SOLD' ? `Sold @ ${l.hammerPrice?.toFixed(2)}` : l.status.toLowerCase()}</td>
                  <td>
                    {a.status === 'OPEN' && l.status === 'OPEN' && (
                      <>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => closeLot(a.id, l.lotNo)}>
                          Knock down
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => withdrawLot(a.id, l.lotNo)}>
                          Withdraw
                        </button>
                      </>
                    )}
                    {l.orderId && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTrading('orders', l.orderId!)}>
                        {state.orders.find((o) => o.id === l.orderId)?.number}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="sx-note">Prices are USD per kg. A knocked-down lot becomes an auction sales order at the hammer price converted at the sale rate.</p>
    </Drawer>
  );
};

const blankTasting = (): Omit<TastingRecord, 'id'> => ({ ref: '', garden: '', grade: 'BP1', date: TODAY, taster: '', scores: { appearance: 7, infusion: 7, liquor: 7, body: 7, brightness: 7 }, remarks: '', valuation: 0 });

const TastingTab: React.FC = () => {
  const { state, actor, recordTasting } = useCommercial();
  const [t, setT] = useState(() => ({ ...blankTasting(), taster: actor.name }));
  const lots = state.auctions.flatMap((a) => a.lots.map((l) => ({ a, l })));
  const cols: Column<TastingRecord>[] = [
    { key: 'r', header: 'Lot / SKU', render: (x) => <b className="sx-mono">{x.ref}</b>, sort: (x) => x.ref },
    { key: 'g', header: 'Garden · grade', render: (x) => `${x.garden} · ${x.grade}` },
    { key: 'd', header: 'Date', render: (x) => fmtDate(x.date), sort: (x) => x.date },
    { key: 't', header: 'Taster', render: (x) => x.taster },
    { key: 's', header: 'Score', render: (x) => `${tastingTotal(x.scores)}/10`, sort: (x) => tastingTotal(x.scores), align: 'right' },
    { key: 'v', header: 'Valuation', render: (x) => `USD ${x.valuation.toFixed(2)}`, align: 'right' },
    { key: 'm', header: 'Remarks', render: (x) => x.remarks, hideOnMobile: true }
  ];
  return (
    <>
      <Panel title="Record a tasting" subtitle="Scores 0–10 for each attribute; the average updates the lot">
        <div className="sx-grid">
          <Field label="Lot or SKU">
            <select
              className="form-control"
              value={t.ref}
              onChange={(e) => {
                const hit = lots.find((x) => x.l.lotNo === e.target.value);
                setT({ ...t, ref: e.target.value, garden: hit?.l.garden ?? t.garden, grade: hit?.l.grade ?? t.grade, saleId: hit?.a.id });
              }}
            >
              <option value="">Choose…</option>
              {lots.map(({ a, l }) => (
                <option key={`${a.id}${l.lotNo}`} value={l.lotNo}>
                  {a.saleNo} lot {l.lotNo} · {l.garden} {l.grade}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Garden">
            <input className="form-control" value={t.garden} onChange={(e) => setT({ ...t, garden: e.target.value })} />
          </Field>
          <Field label="Grade">
            <select className="form-control" value={t.grade} onChange={(e) => setT({ ...t, grade: e.target.value })}>
              {TEA_GRADES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Taster">
            <input className="form-control" value={t.taster} onChange={(e) => setT({ ...t, taster: e.target.value })} />
          </Field>
        </div>
        <div className="tr-score">
          {(Object.keys(t.scores) as (keyof TastingRecord['scores'])[]).map((k) => (
            <label key={k}>
              {k}
              <input className="form-control" type="number" min="0" max="10" value={t.scores[k]} onChange={(e) => setT({ ...t, scores: { ...t.scores, [k]: Number(e.target.value) } })} />
            </label>
          ))}
        </div>
        <div className="tr-row">
          <input className="form-control" type="number" step="0.01" aria-label="Valuation USD/kg" placeholder="Valuation USD/kg" value={t.valuation || ''} onChange={(e) => setT({ ...t, valuation: Number(e.target.value) })} />
          <input className="form-control grow" placeholder="Remarks (bright, brisk, coppery infusion…)" value={t.remarks} onChange={(e) => setT({ ...t, remarks: e.target.value })} />
          <b>Average {tastingTotal(t.scores)}/10</b>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => recordTasting(t).ok && setT({ ...blankTasting(), taster: actor.name })}>
            Save tasting
          </button>
        </div>
      </Panel>
      <DataTable rows={state.tastings} columns={cols} rowKey={(x) => x.id} initialSort={{ key: 'd', dir: 'desc' }} />
    </>
  );
};

const SamplesTab: React.FC = () => {
  const { state, dispatchSamples, sampleReceived } = useCommercial();
  const [d, setD] = useState({ recipient: '', recipientType: 'BUYER' as SampleDispatch['recipientType'], courier: 'G4S Courier', reprint: false, lines: [{ sku: '', qty: 1, lotNo: '' }] });
  const cols: Column<SampleDispatch>[] = [
    { key: 'n', header: 'Delivery', render: (x) => <b className="sx-mono">{x.number}</b>, sort: (x) => x.number },
    { key: 'r', header: 'Recipient', render: (x) => `${x.recipient} (${x.recipientType.toLowerCase()})` },
    { key: 'd', header: 'Date', render: (x) => fmtDate(x.date), sort: (x) => x.date },
    { key: 'c', header: 'Courier', render: (x) => x.courier },
    { key: 'l', header: 'Samples', render: (x) => x.lines.length, align: 'right' },
    {
      key: 's',
      header: 'Status',
      render: (x) => (
        <span className="tr-row">
          <Pill status={x.status === 'RECEIVED' ? 'POSTED' : 'SUBMITTED'} label={x.status.toLowerCase()} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => (e.stopPropagation(), printDocument(`Sample delivery ${x.number}`, sampleHtml(x, state)))}>
            <Printer size={13} />
          </button>
          {x.status === 'DISPATCHED' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => (e.stopPropagation(), sampleReceived(x.id))}>
              Received
            </button>
          )}
        </span>
      )
    }
  ];
  const teas = state.products.filter((p) => p.kind === 'GOODS');
  return (
    <>
      <Panel title="Dispatch samples" subtitle="To brokers, buyers or customers — stock is reduced and a sample delivery note printed">
        <div className="tr-row">
          <input className="form-control grow" placeholder="Recipient" value={d.recipient} onChange={(e) => setD({ ...d, recipient: e.target.value })} />
          <select className="form-control" aria-label="Recipient type" value={d.recipientType} onChange={(e) => setD({ ...d, recipientType: e.target.value as SampleDispatch['recipientType'] })}>
            <option value="BROKER">Broker</option>
            <option value="BUYER">Buyer</option>
            <option value="CUSTOMER">Customer</option>
          </select>
          <input className="form-control" placeholder="Courier" value={d.courier} onChange={(e) => setD({ ...d, courier: e.target.value })} />
          <label className="sx-check">
            <input type="checkbox" checked={d.reprint} onChange={(e) => setD({ ...d, reprint: e.target.checked })} /> Reprint
          </label>
        </div>
        {d.lines.map((l, i) => (
          <div className="tr-row" key={i}>
            <select className="form-control grow" aria-label="Sample product" value={l.sku} onChange={(e) => setD({ ...d, lines: d.lines.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)) })}>
              <option value="">Product…</option>
              {teas.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} · {p.name} ({p.stock} {p.unit})
                </option>
              ))}
            </select>
            <input className="form-control" type="number" aria-label="Sample quantity" value={l.qty} onChange={(e) => setD({ ...d, lines: d.lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)) })} />
            <input className="form-control" placeholder="Lot no." value={l.lotNo} onChange={(e) => setD({ ...d, lines: d.lines.map((x, j) => (j === i ? { ...x, lotNo: e.target.value } : x)) })} />
          </div>
        ))}
        <div className="tr-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, lines: [...d.lines, { sku: '', qty: 1, lotNo: '' }] })}>
            Add sample
          </button>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => dispatchSamples({ ...d, lines: d.lines.map((l) => ({ ...l, lotNo: l.lotNo || undefined })) }).ok && setD({ ...d, recipient: '', lines: [{ sku: '', qty: 1, lotNo: '' }] })}>
            <Send size={14} /> Dispatch samples
          </button>
        </div>
      </Panel>
      <DataTable rows={state.samples} columns={cols} rowKey={(x) => x.id} initialSort={{ key: 'd', dir: 'desc' }} />
    </>
  );
};

const MatchTab: React.FC = () => {
  const { state } = useCommercial();
  const [req, setReq] = useState({ grade: 'BP1', origin: '', maxPrice: 0, qtyKg: 0, minScore: 0 });
  const hits = matchStock(state, req).slice(0, 12);
  return (
    <Panel title="Match a customer request" subtitle="Ranks open auction lots and warehouse stock by grade, origin, price, quantity and tasting score">
      <div className="tr-row">
        <select className="form-control" aria-label="Grade" value={req.grade} onChange={(e) => setReq({ ...req, grade: e.target.value })}>
          <option value="">Any grade</option>
          {TEA_GRADES.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select className="form-control" aria-label="Origin" value={req.origin} onChange={(e) => setReq({ ...req, origin: e.target.value })}>
          <option value="">Any origin</option>
          {TEA_ORIGINS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <input className="form-control" type="number" aria-label="Max price" placeholder="Max USD/kg (lots)" value={req.maxPrice || ''} onChange={(e) => setReq({ ...req, maxPrice: Number(e.target.value) })} />
        <input className="form-control" type="number" aria-label="Quantity kg" placeholder="Kg needed" value={req.qtyKg || ''} onChange={(e) => setReq({ ...req, qtyKg: Number(e.target.value) })} />
        <input className="form-control" type="number" aria-label="Min score" placeholder="Min tasting score" value={req.minScore || ''} onChange={(e) => setReq({ ...req, minScore: Number(e.target.value) })} />
        <Search size={15} />
      </div>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Ref</th>
            <th>Garden · grade</th>
            <th style={{ textAlign: 'right' }}>Kg</th>
            <th style={{ textAlign: 'right' }}>Price</th>
            <th>Score</th>
            <th>Fit</th>
          </tr>
        </thead>
        <tbody>
          {hits.map((h) => (
            <tr key={`${h.kind}${h.ref}`}>
              <td>{h.sale}</td>
              <td className="sx-mono">{h.ref}</td>
              <td>
                {h.garden} · {h.grade}
              </td>
              <td style={{ textAlign: 'right' }}>{h.kg}</td>
              <td style={{ textAlign: 'right' }}>{h.kind === 'LOT' ? `USD ${h.price.toFixed(2)}` : kes(h.price)}</td>
              <td>{h.score || '—'}</td>
              <td>
                <b>{h.fit}%</b> <small className="sx-muted">{h.why.join(', ')}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <DefList items={[['Matching rules', 'Grade 40 · origin 20 · price 20 · quantity 10 · quality 10']]} />
    </Panel>
  );
};
