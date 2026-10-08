import React, { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useCommercial } from '../store';
import { orderStage, ORDER_STAGE_LABEL } from '../engine';
import { addDays, fmtDate, kes, round2, TODAY } from '../../finance/engine';
import { Chips, Panel, Stat, SuitePage } from '../../ui/kit';
import { ExportCsvButton } from '../../../platform/Widgets';
import { backOrdered, deliveryRating, fmtPct, groupFacts, hotItems, isLateDelivery, salesFacts, type SalesFact } from '../tradeEngine';

type Tab = 'SALES' | 'PERIOD' | 'ORDERS' | 'HOT' | 'VAT' | 'DELIVERY' | 'CAMPAIGN' | 'PORTAL';
const DIMS: { key: keyof SalesFact; label: string }[] = [
  { key: 'customer', label: 'Customer' },
  { key: 'product', label: 'Product' },
  { key: 'category', label: 'Category' },
  { key: 'grade', label: 'Tea grade' },
  { key: 'region', label: 'Region' },
  { key: 'destination', label: 'Destination' },
  { key: 'channel', label: 'Channel' },
  { key: 'source', label: 'Campaign' },
  { key: 'month', label: 'Month' }
];

const Table: React.FC<{ head: string[]; rows: React.ReactNode[][]; right?: number[] }> = ({ head, rows, right = [] }) => (
  <div className="tr-table-wrap">
    <table className="sx-mini-table">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} style={right.includes(i) ? { textAlign: 'right' } : undefined}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} style={right.includes(j) ? { textAlign: 'right' } : undefined}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** Sales analysis, P&L with cost of sales, period comparisons, order status, VAT, delivery and campaign reports — all exportable. */
export const ReportsPage: React.FC = () => {
  const { state, finance, party } = useCommercial();
  const [tab, setTab] = useState<Tab>('SALES');
  const [dim, setDim] = useState<keyof SalesFact>('customer');
  const [from, setFrom] = useState(addDays(TODAY, -365));
  const [to, setTo] = useState(TODAY);
  const facts = salesFacts(state, finance.state).filter((f) => f.date >= from && f.date <= to);
  const all = salesFacts(state, finance.state);
  const g = groupFacts(facts, dim);
  const tot = groupFacts(facts, 'channel').reduce((x, r) => ({ revenue: x.revenue + r.revenue, cogs: x.cogs + r.cogs, margin: x.margin + r.margin, vat: x.vat + r.vat }), { revenue: 0, cogs: 0, margin: 0, vat: 0 });
  const mtd = TODAY.slice(0, 7);
  const ytd = TODAY.slice(0, 4);
  const r12 = addDays(TODAY, -365);
  const customers = [...new Set(all.map((f) => f.customerId))];
  const period = customers
    .map((c) => {
      const f = all.filter((x) => x.customerId === c);
      const sum = (p: (x: SalesFact) => boolean) => round2(f.filter(p).reduce((a, x) => a + x.revenue, 0));
      return { name: f[0]?.customer ?? c, mtd: sum((x) => x.month === mtd), ytd: sum((x) => x.date.slice(0, 4) === ytd), r12: sum((x) => x.date >= r12), lastYtd: sum((x) => x.date.slice(0, 4) === String(Number(ytd) - 1) && x.date.slice(5) <= TODAY.slice(5)) };
    })
    .sort((a, b) => b.r12 - a.r12);
  const openOrders = state.orders.filter((o) => o.status === 'APPROVED' && !o.closed);
  const late = state.orders.filter((o) => (orderStage(o) === 'TO_DISPATCH' || orderStage(o) === 'PART_DELIVERED') && o.requiredBy < TODAY);
  const lateDn = state.deliveries.filter((d) => {
    const o = state.orders.find((x) => x.id === d.orderId);
    return o && isLateDelivery(d, o);
  });
  const held = state.orders.filter((o) => o.hold);
  const back = state.orders.filter(backOrdered);
  const hot = hotItems(state);
  const vatByMonth = groupFacts(facts, 'month').sort((a, b) => a.key.localeCompare(b.key));
  const custIds = [...new Set(state.orders.map((o) => o.customerId))];
  const campaigns = state.campaigns.map((c) => {
    const f = all.filter((x) => x.source === c.code);
    const rev = round2(f.reduce((a, x) => a + x.revenue, 0));
    const margin = round2(f.reduce((a, x) => a + x.margin, 0));
    const quotes = state.quotations.filter((q) => q.sourceCode === c.code).length;
    return { c, rev, margin, quotes, orders: new Set(f.map((x) => x.orderId)).size, roi: c.cost ? round2(((margin - c.cost) / c.cost) * 100) : null };
  });
  const portalKinds = [...new Set(state.portalEvents.map((e) => e.kind))];
  return (
    <SuitePage
      eyebrow="Insight"
      title="Sales reports"
      subtitle="Every report filters by date and exports to CSV for Excel."
      actions={
        <ExportCsvButton
          name="sales-facts"
          header={['Order', 'Date', 'Customer', 'Region', 'Destination', 'SKU', 'Product', 'Category', 'Grade', 'Channel', 'Campaign', 'Qty', 'Revenue', 'VAT', 'COGS', 'Margin']}
          rows={() => facts.map((f) => [f.order, f.date, f.customer, f.region, f.destination, f.sku, f.product, f.category, f.grade, f.channel, f.source, f.qty, f.revenue, f.vat, f.cogs, f.margin])}
          label="Export sales lines"
        />
      }
    >
      <div className="sx-stats">
        <Stat label="Invoiced revenue" value={kes(round2(tot.revenue), { compact: true })} detail={`${fmtDate(from)} – ${fmtDate(to)}`} icon={<BarChart3 size={17} />} />
        <Stat label="Cost of sales" value={kes(round2(tot.cogs), { compact: true })} icon={<BarChart3 size={17} />} tone="red" />
        <Stat label="Gross margin" value={kes(round2(tot.margin), { compact: true })} detail={tot.revenue ? `${round2((tot.margin / tot.revenue) * 100)}%` : '—'} icon={<BarChart3 size={17} />} tone="blue" />
        <Stat label="Output VAT" value={kes(round2(tot.vat), { compact: true })} icon={<BarChart3 size={17} />} tone="violet" />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: 'SALES', label: 'Sales & P&L' },
            { value: 'PERIOD', label: 'MTD / YTD / R12' },
            { value: 'ORDERS', label: 'Order status' },
            { value: 'HOT', label: 'Hot items' },
            { value: 'VAT', label: 'Sales VAT' },
            { value: 'DELIVERY', label: 'Delivery rating' },
            { value: 'CAMPAIGN', label: 'Campaign ROI' },
            { value: 'PORTAL', label: 'Portal usage' }
          ]}
        />
        <input className="form-control" type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 160 }} />
        <input className="form-control" type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 160 }} />
      </div>
      {tab === 'SALES' && (
        <Panel
          title="Sales analysis"
          subtitle="Revenue, cost of sales and margin"
          action={
            <select className="form-control" aria-label="Group by" value={dim} onChange={(e) => setDim(e.target.value as keyof SalesFact)}>
              {DIMS.map((d) => (
                <option key={d.key} value={d.key}>
                  By {d.label.toLowerCase()}
                </option>
              ))}
            </select>
          }
        >
          <Table head={[DIMS.find((d) => d.key === dim)!.label, 'Orders', 'Qty', 'Revenue', 'COGS', 'Margin', 'Margin %']} right={[1, 2, 3, 4, 5, 6]} rows={g.map((r) => [r.key, r.orders, r.qty, kes(r.revenue), kes(r.cogs), kes(r.margin), `${r.marginPct}%`])} />
          <ExportCsvButton name={`sales-by-${String(dim)}`} header={['Group', 'Orders', 'Qty', 'Revenue', 'COGS', 'Margin', 'Margin %']} rows={() => g.map((r) => [r.key, r.orders, r.qty, r.revenue, r.cogs, r.margin, r.marginPct])} />
        </Panel>
      )}
      {tab === 'PERIOD' && (
        <Panel title="Customer sales by period" subtitle="Month to date, year to date (vs same period last year) and rolling 12 months">
          <Table head={['Customer', 'MTD', 'YTD', 'Last YTD', 'Rolling 12 months']} right={[1, 2, 3, 4]} rows={period.map((p) => [p.name, kes(p.mtd), kes(p.ytd), kes(p.lastYtd), kes(p.r12)])} />
          <ExportCsvButton name="customer-periods" header={['Customer', 'MTD', 'YTD', 'Last YTD', 'R12']} rows={() => period.map((p) => [p.name, p.mtd, p.ytd, p.lastYtd, p.r12])} />
        </Panel>
      )}
      {tab === 'ORDERS' && (
        <>
          <Panel title={`Open orders (${openOrders.length})`} subtitle="Approved and not closed">
            <Table head={['Order', 'Customer', 'Required', 'Stage']} rows={openOrders.map((o) => [o.number, party(o.customerId)?.name ?? o.oneTimeName, fmtDate(o.requiredBy), ORDER_STAGE_LABEL[orderStage(o)]])} />
          </Panel>
          <Panel title={`Back-ordered (${back.length})`} subtitle="Part delivered, balance outstanding">
            <Table head={['Order', 'Customer', 'Outstanding lines']} rows={back.map((o) => [o.number, party(o.customerId)?.name, o.lines.filter((l) => l.delivered < l.qty).map((l) => `${l.description} ${l.qty - l.delivered}`).join('; ')])} />
          </Panel>
          <Panel title={`Late (${late.length} open · ${lateDn.length} deliveries after the required date)`}>
            <Table head={['Order', 'Customer', 'Required', 'Days late']} right={[3]} rows={late.map((o) => [o.number, party(o.customerId)?.name, fmtDate(o.requiredBy), Math.round((new Date(TODAY).getTime() - new Date(o.requiredBy).getTime()) / 864e5)])} />
          </Panel>
          <Panel title={`On hold (${held.length})`}>
            <Table head={['Order', 'Customer', 'Reason', 'By']} rows={held.map((o) => [o.number, party(o.customerId)?.name, state.reasonCodes.find((r) => r.id === o.hold?.reasonCodeId)?.label ?? '', o.hold?.by ?? ''])} />
          </Panel>
          <ExportCsvButton name="order-status" header={['Order', 'Customer', 'Required', 'Stage', 'Held', 'Back-ordered']} rows={() => state.orders.map((o) => [o.number, party(o.customerId)?.name ?? '', o.requiredBy, ORDER_STAGE_LABEL[orderStage(o)], !!o.hold, backOrdered(o)])} />
        </>
      )}
      {tab === 'HOT' && (
        <Panel title="Hot items" subtitle="Ordered in the last 30 days against free stock (days of cover)">
          <Table head={['Product', 'Ordered (30 days)', 'Free stock', 'Days of cover']} right={[1, 2, 3]} rows={hot.map((h) => [h.p.name, h.ordered, h.free, h.cover ?? '—'])} />
        </Panel>
      )}
      {tab === 'VAT' && (
        <Panel title="Sales VAT report" subtitle="Output VAT on invoiced sales, by month (16%; exports zero-rated)">
          <Table head={['Month', 'Taxable revenue', 'Output VAT']} right={[1, 2]} rows={vatByMonth.map((r) => [r.key, kes(r.revenue), kes(r.vat)])} />
          <ExportCsvButton name="sales-vat" header={['Month', 'Revenue', 'VAT']} rows={() => vatByMonth.map((r) => [r.key, r.revenue, r.vat])} />
        </Panel>
      )}
      {tab === 'DELIVERY' && (
        <Panel title="Delivery performance" subtitle="On time, in full and the customer's rating from proof of delivery">
          <Table
            head={['Customer', 'Deliveries', 'On time', 'In full', 'OTIF', 'Rating']}
            right={[1, 2, 3, 4, 5]}
            rows={custIds
              .map((c) => ({ c, r: deliveryRating(state, c) }))
              .filter((x) => x.r.deliveries)
              .map(({ c, r }) => [party(c)?.name ?? c, r.deliveries, fmtPct(r.onTime), fmtPct(r.inFull), fmtPct(r.otif), r.rating ?? '—'])}
          />
        </Panel>
      )}
      {tab === 'CAMPAIGN' && (
        <Panel title="Campaign return on investment" subtitle="Revenue and margin on orders carrying the campaign source code, against its cost">
          <Table head={['Code', 'Campaign', 'Quotes', 'Orders', 'Revenue', 'Margin', 'Cost', 'ROI']} right={[2, 3, 4, 5, 6, 7]} rows={campaigns.map((x) => [x.c.code, x.c.name, x.quotes, x.orders, kes(x.rev), kes(x.margin), kes(x.c.cost), x.roi === null ? '—' : `${x.roi}%`])} />
        </Panel>
      )}
      {tab === 'PORTAL' && (
        <Panel title="Customer portal usage" subtitle="Simulated portal activity by customer and action">
          <Table
            head={['Customer', ...portalKinds.map((k) => k.toLowerCase().replace('_', ' ')), 'Total']}
            right={portalKinds.map((_, i) => i + 1).concat(portalKinds.length + 1)}
            rows={[...new Set(state.portalEvents.map((e) => e.customerId))].map((c) => {
              const ev = state.portalEvents.filter((e) => e.customerId === c);
              return [party(c)?.name ?? c, ...portalKinds.map((k) => ev.filter((e) => e.kind === k).length), ev.length];
            })}
          />
        </Panel>
      )}
    </SuitePage>
  );
};
