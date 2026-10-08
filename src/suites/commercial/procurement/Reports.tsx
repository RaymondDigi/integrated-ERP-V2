import React, { useMemo, useState } from 'react';
import { BarChart3, Clock, PiggyBank, Save, Search, Trash2, Users } from 'lucide-react';
import { useCommercial } from '../store';
import { poStage, totals } from '../engine';
import { fmtDate, kes, round2, TODAY } from '../../finance/engine';
import { ExportCsvButton } from '../../../platform/Widgets';
import { Bars, Empty, Field, Pill, Stat, SuitePage } from '../../ui/kit';
import { useProcurementExt } from './ext/store';
import { contractFor, cycleTimes, eventLines, fmtHours, invoiceGross, latestResponses, priceHistory, responseTotal } from './ext/engine';
import { label, ReadOnlyNote, Tabs } from './ext/ui';
import type { SavedReport } from './ext/types';

type RTab = 'sourcing' | 'orders' | 'prices' | 'activity' | 'builder';
type Row = Record<string, string | number>;

/* ---------------- Datasets for the ad hoc report builder ---------------- */

const useDatasets = () => {
  const ext = useProcurementExt();
  const { state, party } = useCommercial();
  return useMemo(() => {
    const name = (id?: string) => (id ? (party(id)?.name ?? id) : '');
    const ds: Record<SavedReport['dataset'], Row[]> = {
      REQUISITIONS: state.requisitions.map((r) => ({ number: r.number, department: r.department, requestedBy: r.requestedBy, date: r.date, status: r.status, supplier: name(r.awardedTo), value: round2(r.lines.reduce((a, l) => a + l.qty * l.estPrice, 0)) })),
      POS: state.purchaseOrders.map((o) => ({ number: o.number, supplier: name(o.supplierId), date: o.date, month: o.date.slice(0, 7), stage: label(poStage(o)), status: o.status, currency: ext.state.poExt[o.id]?.currency ?? 'KES', value: totals(o.lines, state.products).net })),
      RECEIPTS: state.receipts.map((g) => {
        const po = state.purchaseOrders.find((o) => o.id === g.poId);
        return { number: g.number, po: po?.number ?? '', supplier: name(po?.supplierId), date: g.date, receivedBy: g.receivedBy, qty: g.lines.reduce((a, l) => a + l.qty, 0), rejected: g.lines.reduce((a, l) => a + l.rejected, 0) };
      }),
      EVENTS: ext.state.events.map((e) => ({ number: e.number, title: e.title, kind: e.kind, category: e.category, status: e.status, invited: e.invited.length, responses: new Set(e.responses.map((r) => r.supplierId)).size, value: round2(e.awards.reduce((a, w) => a + w.value, 0)) })),
      INVOICES: ext.state.invoices.map((i) => ({ number: i.number, supplier: name(i.supplierId), date: i.date, currency: i.currency, status: i.status, value: round2(invoiceGross(i) * i.fxRate) })),
      CONTRACTS: ext.state.contracts.map((c) => ({ number: c.number, title: c.title, supplier: name(c.supplierId), type: c.type, start: c.start, end: c.end, status: c.status, value: c.valueCap }))
    };
    return ds;
  }, [ext.state, state, party]);
};

export const ReportsPage: React.FC = () => {
  const ext = useProcurementExt();
  const [tab, setTab] = useState<RTab>('sourcing');
  return (
    <SuitePage eyebrow="Analytics" title="Procurement reports" subtitle="Savings and response rates from sourcing, open orders and price trends, cycle times and user activity, plus your own saved reports.">
      <ReadOnlyNote show={ext.readOnly} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ['sourcing', 'Sourcing & savings'],
          ['orders', 'Purchase orders'],
          ['prices', 'Price trends'],
          ['activity', 'Cycle times & activity'],
          ['builder', 'Report builder', ext.state.reports.length]
        ]}
      />
      {tab === 'sourcing' && <SourcingReport />}
      {tab === 'orders' && <OrdersReport />}
      {tab === 'prices' && <PriceReport />}
      {tab === 'activity' && <ActivityReport />}
      {tab === 'builder' && <Builder />}
    </SuitePage>
  );
};

/* ---------------- Sourcing: savings, response rates, opportunities ---------------- */

const SourcingReport: React.FC = () => {
  const ext = useProcurementExt();
  const { state } = useCommercial();
  const rows = ext.state.events.map((e) => {
    const resp = latestResponses(e);
    const totalsBy = resp.map((r) => responseTotal(e, r)).filter((x) => x > 0).sort((a, b) => a - b);
    const est = round2(
      eventLines(e).reduce((a, l) => {
        const rl = l.reqId ? state.requisitions.find((r) => r.id === l.reqId)?.lines.find((x) => x.id === l.reqLineId) : undefined;
        const p = l.sku ? state.products.find((x) => x.sku === l.sku) : undefined;
        return a + l.qty * (rl?.estPrice ?? p?.cost ?? 0);
      }, 0)
    );
    const awarded = round2(e.awards.reduce((a, w) => a + w.value, 0));
    const baseline = est || totalsBy[totalsBy.length - 1] || 0;
    const responders = new Set(e.responses.map((r) => r.supplierId)).size;
    return {
      e,
      est,
      awarded,
      saving: awarded && baseline ? round2(baseline - awarded) : 0,
      bestVsNext: totalsBy.length > 1 ? round2(totalsBy[1] - totalsBy[0]) : 0,
      rate: e.invited.length ? responders / e.invited.length : 0,
      responders
    };
  });
  const saving = round2(rows.reduce((a, r) => a + r.saving, 0));
  const awardedTotal = round2(rows.reduce((a, r) => a + r.awarded, 0));
  const invited = rows.reduce((a, r) => a + r.e.invited.length, 0);
  const responded = rows.reduce((a, r) => a + r.responders, 0);
  // Opportunities: items bought repeatedly in the last year with no live contract and no competitive event
  const yearAgo = `${Number(TODAY.slice(0, 4)) - 1}${TODAY.slice(4)}`;
  const sourcedSkus = new Set(ext.state.events.flatMap((e) => eventLines(e).map((l) => l.sku)));
  const opp = state.products
    .map((p) => {
      const lines = state.purchaseOrders.filter((o) => o.status === 'APPROVED' && o.date >= yearAgo).flatMap((o) => o.lines.filter((l) => l.sku === p.sku).map((l) => ({ o, l })));
      const spend = round2(lines.reduce((a, x) => a + x.l.qty * x.l.price, 0));
      const suppliers = new Set(lines.map((x) => x.o.supplierId));
      return { p, spend, orders: lines.length, suppliers: suppliers.size, contract: [...suppliers].some((s) => contractFor(ext.state.contracts, s, p.sku)), sourced: sourcedSkus.has(p.sku) };
    })
    .filter((x) => x.spend > 0 && !x.contract)
    .sort((a, b) => b.spend - a.spend);
  return (
    <>
      <div className="sx-stats">
        <Stat label="Realised savings" value={kes(saving, { compact: true })} detail={awardedTotal ? `${Math.round((saving / (awardedTotal + saving)) * 100)}% off estimate` : 'No awards yet'} icon={<PiggyBank size={17} />} />
        <Stat label="Awarded through sourcing" value={kes(awardedTotal, { compact: true })} icon={<BarChart3 size={17} />} tone="blue" />
        <Stat label="Response rate" value={invited ? `${Math.round((responded / invited) * 100)}%` : '—'} detail={`${responded} of ${invited} invitations answered`} icon={<Users size={17} />} tone="gold" />
        <Stat label="Sourcing opportunities" value={opp.length} detail={kes(round2(opp.reduce((a, x) => a + x.spend, 0)), { compact: true }) + ' off-contract spend'} icon={<Search size={17} />} tone="red" />
      </div>
      <div className="sx-toolbar">
        <h3>Events</h3>
        <span className="sx-grow" />
        <ExportCsvButton name="sourcing-savings" header={['Event', 'Title', 'Type', 'Status', 'Invited', 'Responded', 'Response rate %', 'Estimate', 'Awarded', 'Saving', 'Best vs next']} rows={() => rows.map((r) => [r.e.number, r.e.title, r.e.kind, r.e.status, r.e.invited.length, r.responders, Math.round(r.rate * 100), r.est, r.awarded, r.saving, r.bestVsNext])} />
      </div>
      <table className="sx-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Status</th>
            <th className="r">Responses</th>
            <th className="r">Estimate</th>
            <th className="r">Awarded</th>
            <th className="r">Saving</th>
            <th className="r">Best vs next</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.e.id} style={{ cursor: 'pointer' }} onClick={() => ext.go('sourcing', r.e.id)}>
              <td>
                <div className="sx-cell-main">
                  <b className="sx-mono">{r.e.number}</b>
                  <small>{r.e.title}</small>
                </div>
              </td>
              <td>{label(r.e.status)}</td>
              <td className="r">
                {r.responders}/{r.e.invited.length} ({Math.round(r.rate * 100)}%)
              </td>
              <td className="r">{r.est ? kes(r.est) : '—'}</td>
              <td className="r">{r.awarded ? kes(r.awarded) : '—'}</td>
              <td className="r">{r.saving ? <b>{kes(r.saving)}</b> : '—'}</td>
              <td className="r">{r.bestVsNext ? kes(r.bestVsNext) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Sourcing opportunities (last 12 months, no live contract)</h3>
      {opp.length ? (
        <table className="sx-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="r">Spend</th>
              <th className="r">Orders</th>
              <th className="r">Suppliers</th>
              <th>Sourced competitively</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {opp.map((x) => (
              <tr key={x.p.sku}>
                <td>
                  {x.p.name} <small className="sx-muted">{x.p.sku}</small>
                </td>
                <td className="r">{kes(x.spend)}</td>
                <td className="r">{x.orders}</td>
                <td className="r">{x.suppliers}</td>
                <td>{x.sourced ? 'Yes' : <Pill status="OVERDUE" label="No" />}</td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.go('contracts', 'new')}>
                    Put on contract
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sx-muted">Every repeat purchase is on contract.</p>
      )}
    </>
  );
};

/* ---------------- Purchase orders ---------------- */

const OrdersReport: React.FC = () => {
  const { state, party } = useCommercial();
  const ext = useProcurementExt();
  const pos = state.purchaseOrders.filter((o) => o.status === 'APPROVED' || o.status === 'SUBMITTED');
  const open = pos.filter((o) => !o.closed && ['TO_SEND', 'AWAITING', 'PART_RECEIVED', 'TO_BILL', 'APPROVAL'].includes(poStage(o)));
  const value = (o: (typeof pos)[number]) => totals(o.lines, state.products).net;
  const months = [...new Set(pos.map((o) => o.date.slice(0, 7)))].sort().slice(-6);
  const bySupplier = [...new Set(pos.map((o) => o.supplierId))].map((s) => ({ s, rows: pos.filter((o) => o.supplierId === s) })).sort((a, b) => b.rows.reduce((x, o) => x + value(o), 0) - a.rows.reduce((x, o) => x + value(o), 0));
  // Price variance: PO price against the item's standard cost and against the previous order
  const variance = pos
    .flatMap((o) => o.lines.filter((l) => l.sku).map((l) => ({ o, l, p: state.products.find((x) => x.sku === l.sku) })))
    .filter((x) => x.p && x.p.cost > 0)
    .map((x) => ({ ...x, diff: round2(x.l.price - x.p!.cost), pct: (x.l.price - x.p!.cost) / x.p!.cost }))
    .filter((x) => Math.abs(x.pct) >= 0.02)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  return (
    <>
      <div className="sx-toolbar">
        <h3>Open purchase orders ({open.length})</h3>
        <span className="sx-grow" />
        <ExportCsvButton name="open-purchase-orders" header={['PO', 'Supplier', 'Date', 'Expected', 'Stage', 'Currency', 'Value KES', 'Outstanding qty']} rows={() => open.map((o) => [o.number, party(o.supplierId)?.name ?? '', o.date, o.expected, poStage(o), ext.state.poExt[o.id]?.currency ?? 'KES', value(o), o.lines.reduce((a, l) => a + l.qty - l.received, 0)])} />
      </div>
      <table className="sx-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Supplier</th>
            <th>Expected</th>
            <th>Stage</th>
            <th className="r">Value</th>
          </tr>
        </thead>
        <tbody>
          {open.map((o) => (
            <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => ext.goCore('orders', o.id)}>
              <td className="sx-mono">{o.number}</td>
              <td>{party(o.supplierId)?.name}</td>
              <td>{fmtDate(o.expected)}</td>
              <td>{label(poStage(o))}</td>
              <td className="r">{kes(value(o))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Orders by supplier and month</h3>
      <Bars data={months.map((m) => ({ label: m, values: [round2(pos.filter((o) => o.date.startsWith(m)).reduce((a, o) => a + value(o), 0))] }))} series={[{ name: 'Ordered (KES)', color: '#237857' }]} format={(n) => kes(n, { compact: true })} />
      <table className="sx-table">
        <thead>
          <tr>
            <th>Supplier</th>
            {months.map((m) => (
              <th key={m} className="r">
                {m}
              </th>
            ))}
            <th className="r">Total</th>
          </tr>
        </thead>
        <tbody>
          {bySupplier.map(({ s, rows }) => (
            <tr key={s}>
              <td>{party(s)?.name}</td>
              {months.map((m) => {
                const v = round2(rows.filter((o) => o.date.startsWith(m)).reduce((a, o) => a + value(o), 0));
                return (
                  <td key={m} className="r">
                    {v ? kes(v, { compact: true }) : '—'}
                  </td>
                );
              })}
              <td className="r">
                <b>{kes(round2(rows.reduce((a, o) => a + value(o), 0)))}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sx-toolbar">
        <h3>Price variance against standard cost (±2% or more)</h3>
        <span className="sx-grow" />
        <ExportCsvButton name="po-price-variance" header={['PO', 'Supplier', 'Item', 'Qty', 'PO price', 'Standard cost', 'Difference', '%']} rows={() => variance.map((x) => [x.o.number, party(x.o.supplierId)?.name ?? '', x.l.description, x.l.qty, x.l.price, x.p!.cost, x.diff, Math.round(x.pct * 1000) / 10])} />
      </div>
      {variance.length ? (
        <table className="sx-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Item</th>
              <th className="r">PO price</th>
              <th className="r">Standard</th>
              <th className="r">Variance</th>
            </tr>
          </thead>
          <tbody>
            {variance.slice(0, 20).map((x) => (
              <tr key={`${x.o.id}${x.l.id}`}>
                <td className="sx-mono">{x.o.number}</td>
                <td>{x.l.description}</td>
                <td className="r">{kes(x.l.price)}</td>
                <td className="r">{kes(x.p!.cost)}</td>
                <td className="r">
                  <Pill status={x.pct > 0 ? 'OVERDUE' : 'ACTIVE'} label={`${x.pct > 0 ? '+' : ''}${(x.pct * 100).toFixed(1)}%`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sx-muted">No order is more than 2% away from standard cost.</p>
      )}
    </>
  );
};

/* ---------------- Price, quantity and currency trends ---------------- */

const PriceReport: React.FC = () => {
  const { state, party } = useCommercial();
  const ext = useProcurementExt();
  const bought = state.products.filter((p) => state.purchaseOrders.some((o) => o.lines.some((l) => l.sku === p.sku)));
  const [sku, setSku] = useState(bought[0]?.sku ?? '');
  const hist = priceHistory(state, sku);
  const fxRows = state.purchaseOrders.filter((o) => ext.state.poExt[o.id] && ext.state.poExt[o.id].currency !== 'KES');
  return (
    <>
      <div className="sx-toolbar">
        <Field label="Item">
          <select className="form-control" value={sku} onChange={(e) => setSku(e.target.value)}>
            {bought.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        </Field>
        <span className="sx-grow" />
        <ExportCsvButton name={`price-history-${sku}`} header={['Date', 'PO', 'Supplier', 'Qty', 'Price']} rows={() => hist.map((h) => [h.date, h.po, party(h.supplierId)?.name ?? '', h.qty, h.price])} />
      </div>
      {hist.length ? (
        <>
          <h3>Unit price by order</h3>
          <Bars data={hist.map((h) => ({ label: `${h.date.slice(5)} ${h.po.slice(-4)}`, values: [h.price] }))} series={[{ name: 'Unit price (KES)', color: '#c98f6b' }]} format={(n) => kes(n)} height={180} />
          <h3>Quantity by order</h3>
          <Bars data={hist.map((h) => ({ label: `${h.date.slice(5)} ${h.po.slice(-4)}`, values: [h.qty] }))} series={[{ name: 'Quantity', color: '#5b7fb4' }]} height={160} />
          <table className="sx-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Order</th>
                <th>Supplier</th>
                <th className="r">Qty</th>
                <th className="r">Price</th>
                <th className="r">Change</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((h, i) => (
                <tr key={`${h.po}${i}`}>
                  <td>{fmtDate(h.date)}</td>
                  <td className="sx-mono">{h.po}</td>
                  <td>{party(h.supplierId)?.name}</td>
                  <td className="r">{h.qty}</td>
                  <td className="r">{kes(h.price)}</td>
                  <td className="r">{i ? `${(((h.price - hist[i - 1].price) / hist[i - 1].price) * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <Empty title="No approved orders for this item" />
      )}
      <h3>Foreign-currency orders and exchange rates</h3>
      <table className="sx-table">
        <thead>
          <tr>
            <th>Currency</th>
            <th className="r">Rate today</th>
            <th>Orders</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(ext.state.fx)
            .filter(([c]) => c !== 'KES')
            .map(([c, r]) => (
              <tr key={c}>
                <td>{c}</td>
                <td className="r">{r}</td>
                <td>
                  {fxRows
                    .filter((o) => ext.state.poExt[o.id].currency === c)
                    .map((o) => `${o.number} @ ${ext.state.poExt[o.id].fxRate}`)
                    .join(', ') || '—'}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </>
  );
};

/* ---------------- Cycle times and user activity ---------------- */

const ActivityReport: React.FC = () => {
  const { state } = useCommercial();
  const ext = useProcurementExt();
  const ct = cycleTimes(state);
  const histories = [
    ...state.requisitions.flatMap((r) => r.history.map((h) => ({ ...h, doc: r.number }))),
    ...state.purchaseOrders.flatMap((o) => o.history.map((h) => ({ ...h, doc: o.number }))),
    ...ext.state.events.flatMap((e) => e.history.map((h) => ({ ...h, doc: e.number }))),
    ...ext.state.contracts.flatMap((c) => c.history.map((h) => ({ ...h, doc: c.number }))),
    ...ext.state.invoices.flatMap((i) => i.history.map((h) => ({ ...h, doc: i.number })))
  ];
  const users = [...new Set(histories.map((h) => h.by))].map((by) => {
    const mine = histories.filter((h) => h.by === by);
    return { by, actions: mine.length, docs: new Set(mine.map((h) => h.doc)).size, last: mine.map((h) => h.at).sort().slice(-1)[0] ?? '', approvals: mine.filter((h) => /approv/i.test(h.action)).length };
  }).sort((a, b) => b.actions - a.actions);
  return (
    <>
      <div className="sx-stats">
        <Stat label="Requisition → approved" value={fmtHours(ct.approve)} icon={<Clock size={17} />} />
        <Stat label="Approved → order" value={fmtHours(ct.toPo)} icon={<Clock size={17} />} tone="blue" />
        <Stat label="Order → sent" value={fmtHours(ct.toSend)} icon={<Clock size={17} />} tone="gold" />
        <Stat label="Sent → received" value={fmtHours(ct.toReceive)} detail={`Received → billed ${fmtHours(ct.toBill)}`} icon={<Clock size={17} />} tone="violet" />
      </div>
      <div className="sx-toolbar">
        <h3>Stage durations by requisition</h3>
        <span className="sx-grow" />
        <ExportCsvButton name="cycle-times" header={['Requisition', 'PO', 'Approve (h)', 'To PO (h)', 'To send (h)', 'To receive (h)', 'To bill (h)']} rows={() => ct.rows.map((r) => [r.req.number, r.po?.number ?? '', r.approve ?? '', r.toPo ?? '', r.toSend ?? '', r.toReceive ?? '', r.toBill ?? ''])} />
      </div>
      <table className="sx-table">
        <thead>
          <tr>
            <th>Requisition</th>
            <th>Order</th>
            <th className="r">Approve</th>
            <th className="r">To order</th>
            <th className="r">To send</th>
            <th className="r">To receive</th>
            <th className="r">To bill</th>
          </tr>
        </thead>
        <tbody>
          {ct.rows.map((r) => (
            <tr key={r.req.id}>
              <td className="sx-mono">{r.req.number}</td>
              <td className="sx-mono">{r.po?.number ?? '—'}</td>
              <td className="r">{fmtHours(r.approve)}</td>
              <td className="r">{fmtHours(r.toPo)}</td>
              <td className="r">{fmtHours(r.toSend)}</td>
              <td className="r">{fmtHours(r.toReceive)}</td>
              <td className="r">{fmtHours(r.toBill)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sx-toolbar">
        <h3>User activity</h3>
        <span className="sx-grow" />
        <ExportCsvButton name="user-activity" header={['User', 'Actions', 'Documents', 'Approvals', 'Last active']} rows={() => users.map((u) => [u.by, u.actions, u.docs, u.approvals, u.last])} />
      </div>
      <table className="sx-table">
        <thead>
          <tr>
            <th>User</th>
            <th className="r">Actions</th>
            <th className="r">Documents</th>
            <th className="r">Approvals</th>
            <th>Last active</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.by}>
              <td>{u.by}</td>
              <td className="r">{u.actions}</td>
              <td className="r">{u.docs}</td>
              <td className="r">{u.approvals}</td>
              <td>{u.last ? new Date(u.last).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

/* ---------------- Ad hoc report builder ---------------- */

const DATASET_LABEL: Record<SavedReport['dataset'], string> = { REQUISITIONS: 'Requisitions', POS: 'Purchase orders', RECEIPTS: 'Goods received', EVENTS: 'Sourcing events', INVOICES: 'Supplier invoices', CONTRACTS: 'Contracts' };

const Builder: React.FC = () => {
  const ext = useProcurementExt();
  const data = useDatasets();
  const mine = ext.state.reports.filter((r) => r.owner === ext.actor.name || r.shared);
  const [d, setD] = useState<Omit<SavedReport, 'owner' | 'id'> & { id?: string }>({ name: '', shared: false, dataset: 'POS', columns: ['number', 'supplier', 'date', 'value'], filter: '', groupBy: '' });
  const rows = data[d.dataset];
  const cols = Object.keys(rows[0] ?? {});
  const filtered = rows.filter((r) => !d.filter || Object.values(r).some((v) => String(v).toLowerCase().includes(d.filter.toLowerCase())));
  const shown = d.columns.filter((c) => cols.includes(c));
  const grouped = d.groupBy
    ? [...new Set(filtered.map((r) => String(r[d.groupBy!])))].map((g) => {
        const rs = filtered.filter((r) => String(r[d.groupBy!]) === g);
        return { g, count: rs.length, value: round2(rs.reduce((a, r) => a + (typeof r.value === 'number' ? r.value : 0), 0)) };
      })
    : null;
  return (
    <>
      <div className="prx-split">
        <div>
          <h3>Saved reports</h3>
          {mine.length ? (
            <ul className="sx-list">
              {mine.map((r) => (
                <li key={r.id} className="prx-inline">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD({ name: r.name, shared: r.shared, dataset: r.dataset, columns: r.columns, filter: r.filter, groupBy: r.groupBy ?? '', id: r.owner === ext.actor.name ? r.id : undefined })}>
                    {r.name}
                  </button>
                  <small className="sx-muted">
                    {DATASET_LABEL[r.dataset]} · {r.owner}
                    {r.shared ? ' · shared' : ''}
                  </small>
                  {r.owner === ext.actor.name && (
                    <button type="button" className="sx-icon-btn" aria-label={`Delete ${r.name}`} onClick={() => ext.plan.deleteReport(r.id)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sx-muted">No saved reports yet.</p>
          )}
        </div>
        <div className="sx-grid">
          <Field label="Dataset">
            <select className="form-control" value={d.dataset} onChange={(e) => setD({ ...d, dataset: e.target.value as SavedReport['dataset'], columns: Object.keys(data[e.target.value as SavedReport['dataset']][0] ?? {}).slice(0, 5), groupBy: '' })}>
              {(Object.keys(DATASET_LABEL) as SavedReport['dataset'][]).map((k) => (
                <option key={k} value={k}>
                  {DATASET_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contains">
            <input className="form-control" value={d.filter} onChange={(e) => setD({ ...d, filter: e.target.value })} placeholder="Filter text" />
          </Field>
          <Field label="Group by">
            <select className="form-control" value={d.groupBy ?? ''} onChange={(e) => setD({ ...d, groupBy: e.target.value })}>
              <option value="">No grouping</option>
              {cols.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Columns" span={2}>
            <div className="prx-inline" style={{ flexWrap: 'wrap' }}>
              {cols.map((c) => (
                <label key={c} className="prx-inline">
                  <input type="checkbox" checked={d.columns.includes(c)} onChange={(e) => setD({ ...d, columns: e.target.checked ? [...d.columns, c] : d.columns.filter((x) => x !== c) })} /> {c}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Report name">
            <input className="form-control" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </Field>
          <Field label="Sharing">
            <label className="prx-inline">
              <input type="checkbox" checked={d.shared} onChange={(e) => setD({ ...d, shared: e.target.checked })} /> Share with the team
            </label>
          </Field>
          <div className="prx-inline">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.plan.saveReport({ ...d, groupBy: d.groupBy || undefined })}>
              <Save size={14} /> Save report
            </button>
            <ExportCsvButton name={d.name || `report-${d.dataset.toLowerCase()}`} header={shown} rows={() => filtered.map((r) => shown.map((c) => r[c]))} />
          </div>
        </div>
      </div>
      {grouped ? (
        <table className="sx-table">
          <thead>
            <tr>
              <th>{d.groupBy}</th>
              <th className="r">Count</th>
              <th className="r">Value</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => (
              <tr key={g.g}>
                <td>{g.g || '—'}</td>
                <td className="r">{g.count}</td>
                <td className="r">{g.value ? kes(g.value) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="sx-table">
          <thead>
            <tr>
              {shown.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((r, i) => (
              <tr key={i}>
                {shown.map((c) => (
                  <td key={c} className={typeof r[c] === 'number' ? 'r' : undefined}>
                    {typeof r[c] === 'number' ? r[c].toLocaleString() : r[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="sx-muted">{filtered.length} rows{filtered.length > 50 && !grouped ? ' — first 50 shown, export for all' : ''}.</p>
    </>
  );
};
