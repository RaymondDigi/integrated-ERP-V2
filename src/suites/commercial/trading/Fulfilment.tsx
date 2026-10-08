import React, { useEffect, useState } from 'react';
import { Truck, PackageCheck, Printer, Package, AlertTriangle, ShoppingCart, Users, TrendingUp } from 'lucide-react';
import { useCommercial } from '../store';
import { committed, needsReorder, onOrder, orderStage, totals } from '../engine';
import { fmtDate, kes, round2, TODAY } from '../../finance/engine';
import type { Delivery, Product } from '../types';
import { Chips, DataTable, DefList, Drawer, Field, Meter, Pill, SearchBox, Stat, SuitePage, type Column } from '../../ui/kit';
import { PrintHeader } from '../../finance/parts';
import { printArea } from '../../../views/ess/EssRecords';
import { printDocument } from '../../../platform/Widgets';
import { bolHtml, packingHtml, shipToOf } from './docs';
import { CustomerDrawer } from './CustomerDrawer';
import { ProductEditor, ProductExtras, ProductImport } from './ProductEditor';
import { LoadPlanner } from './LoadPlanner';
import { addDays as addD } from '../../finance/engine';
import { salesFacts } from '../tradeEngine';

/* ================================================================== */
/* Deliveries                                                          */
/* ================================================================== */

export const DeliveriesPage: React.FC = () => {
  const { state, party, setTrading } = useCommercial();
  const [filter, setFilter] = useState<'ALL' | 'DISPATCHED' | 'DELIVERED'>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const orderOf = (d: Delivery) => state.orders.find((o) => o.id === d.orderId)!;
  const rows = state.deliveries.filter((d) => filter === 'ALL' || d.status === filter);
  const toDispatch = state.orders.filter((o) => orderStage(o) === 'TO_DISPATCH' || orderStage(o) === 'PART_DELIVERED');
  const columns: Column<Delivery>[] = [
    { key: 'n', header: 'Delivery note', render: (d) => <b className="sx-mono">{d.number}</b>, sort: (d) => d.number, width: 140 },
    {
      key: 'c',
      header: 'Customer',
      render: (d) => (
        <div className="sx-cell-main">
          <span>{party(orderOf(d).customerId)?.name}</span>
          <small>{orderOf(d).number}</small>
        </div>
      ),
      sort: (d) => party(orderOf(d).customerId)?.name ?? ''
    },
    { key: 'd', header: 'Dispatched', render: (d) => fmtDate(d.date), sort: (d) => d.date },
    { key: 'v', header: 'Vehicle', render: (d) => `${d.vehicle} · ${d.driver}`, hideOnMobile: true },
    { key: 'q', header: 'Units', render: (d) => d.lines.reduce((s, l) => s + l.qty, 0), align: 'right', hideOnMobile: true },
    { key: 's', header: 'Status', render: (d) => <Pill status={d.status === 'DELIVERED' ? 'POSTED' : 'SUBMITTED'} label={d.status === 'DELIVERED' ? 'Delivered' : 'On the road'} />, sort: (d) => d.status }
  ];
  const current = state.deliveries.find((d) => d.id === openId);
  return (
    <SuitePage eyebrow="Fulfilment" title="Deliveries" subtitle="Every dispatch with its vehicle, driver and proof of delivery.">
      <div className="sx-stats">
        <Stat label="Orders to dispatch" value={toDispatch.length} detail="Approved, not fully delivered" icon={<Truck size={17} />} tone="blue" onClick={() => setTrading('orders')} />
        <Stat label="On the road" value={state.deliveries.filter((d) => d.status === 'DISPATCHED').length} detail="Awaiting proof of delivery" icon={<Truck size={17} />} tone="gold" onClick={() => setFilter('DISPATCHED')} />
        <Stat label="Delivered this month" value={state.deliveries.filter((d) => d.status === 'DELIVERED' && d.date.slice(0, 7) === TODAY.slice(0, 7)).length} icon={<PackageCheck size={17} />} />
        <Stat
          label="On-time delivery"
          value={`${Math.round((state.deliveries.filter((d) => d.date <= orderOf(d).requiredBy).length / Math.max(1, state.deliveries.length)) * 100)}%`}
          detail="Dispatched by the required date"
          icon={<TrendingUp size={17} />}
          tone="violet"
        />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All', count: state.deliveries.length },
            { value: 'DISPATCHED', label: 'On the road', count: state.deliveries.filter((d) => d.status === 'DISPATCHED').length },
            { value: 'DELIVERED', label: 'Delivered', count: state.deliveries.filter((d) => d.status === 'DELIVERED').length }
          ]}
        />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(d) => d.id} onRowClick={(d) => setOpenId(d.id)} selected={openId} initialSort={{ key: 'd', dir: 'desc' }} />
      <LoadPlanner />
      {current && <DeliveryDrawer d={current} onClose={() => setOpenId(null)} />}
    </SuitePage>
  );
};

const DeliveryDrawer: React.FC<{ d: Delivery; onClose: () => void }> = ({ d, onClose }) => {
  const { state, party, confirmDelivery } = useCommercial();
  const [by, setBy] = useState('');
  const o = state.orders.find((x) => x.id === d.orderId)!;
  const c = party(o.customerId);
  const lines = d.lines.map((l) => ({ ...l, line: o.lines.find((x) => x.id === l.lineId)! }));
  const [got, setGot] = useState<Record<string, { qty: number; damaged: number }>>(() => Object.fromEntries(d.lines.map((l) => [l.lineId, { qty: l.qty, damaged: 0 }])));
  const [stars, setStars] = useState(0);
  const ship = shipToOf(state, o);
  return (
    <Drawer
      title={d.number}
      subtitle={`${c?.name} · ${o.number}`}
      badge={<Pill status={d.status === 'DELIVERED' ? 'POSTED' : 'SUBMITTED'} label={d.status === 'DELIVERED' ? 'Delivered' : 'On the road'} />}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={printArea}>
            <Printer size={14} /> Print delivery note
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => printDocument(`Packing list ${d.number}`, packingHtml(state, d, c))}>
            <Printer size={14} /> Packing list
          </button>
          {d.bol && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => printDocument(`Bill of lading ${d.number}`, bolHtml(state, d, c))}>
              <Printer size={14} /> Bill of lading
            </button>
          )}
        </>
      }
    >
      <DefList
        items={[
          ['Dispatched', fmtDate(d.date)],
          ['Vehicle', d.vehicle],
          ['Driver', d.driver],
          ['Dispatched by', d.dispatchedBy],
          ['Received by', d.receivedBy ?? '—'],
          ['Delivered', d.deliveredAt ? fmtDate(d.deliveredAt.slice(0, 10)) : '—'],
          ['Ship to', ship.text || o.deliveryAddress || '—'],
          ['Ships from', [...new Set(d.lines.map((l) => l.warehouseId).filter(Boolean))].join(', ') || 'WH-NBO'],
          ['Bill of lading', d.bol ? `${d.bol.carrier} · seal ${d.bol.seal || '—'} · ${d.bol.packages} pkgs · ${d.bol.grossKg} kg` : '—'],
          ['Customer rating', d.rating ? `${d.rating}/5` : '—']
        ]}
      />
      {(d.received ?? []).some((r) => r.damaged > 0 || r.qty < (d.lines.find((l) => l.lineId === r.lineId)?.qty ?? 0)) && <p className="tr-badge warn">Signed for less than was sent — a variance claim was raised (Returns & credits)</p>}
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: 'right' }}>Qty</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.lineId}>
              <td>{l.line.description}</td>
              <td style={{ textAlign: 'right' }}>{l.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.status === 'DISPATCHED' && (
        <div className="sx-callout info">
          <PackageCheck size={16} />
          <div>
            <b>Record proof of delivery</b>
            <span>Enter who signed, what they actually received (short or damaged raises a claim) and their rating.</span>
            <table className="sx-mini-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Sent</th>
                  <th>Received</th>
                  <th>Damaged</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.lineId}>
                    <td>{l.line.description}</td>
                    <td>{l.qty}</td>
                    <td>
                      <input className="form-control" type="number" min="0" aria-label={`Received ${l.line.description}`} value={got[l.lineId]?.qty ?? l.qty} onChange={(e) => setGot({ ...got, [l.lineId]: { ...got[l.lineId], qty: Number(e.target.value) } })} />
                    </td>
                    <td>
                      <input className="form-control" type="number" min="0" aria-label={`Damaged ${l.line.description}`} value={got[l.lineId]?.damaged ?? 0} onChange={(e) => setGot({ ...got, [l.lineId]: { ...got[l.lineId], damaged: Number(e.target.value) } })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="sx-inline-form">
              <input className="form-control" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Name on the signed delivery note" />
              <select className="form-control" aria-label="Customer rating" value={stars} onChange={(e) => setStars(Number(e.target.value))}>
                <option value={0}>No rating</option>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => confirmDelivery(d.id, by, Object.entries(got).map(([lineId, g]) => ({ lineId, ...g })), stars)}>
                Confirm delivered
              </button>
            </div>
          </div>
        </div>
      )}
      <article className="sx-print-only ess-print-area sx-paper">
        <PrintHeader title="Delivery note" number={d.number} meta={[['Date', fmtDate(d.date)], ['Order', o.number], ['Customer LPO', o.customerRef || '—']]} />
        <div className="sx-paper-party">
          <span>Deliver to</span>
          <strong>{c?.name}</strong>
          <small>{o.deliveryAddress || c?.phone}</small>
        </div>
        <table className="sx-paper-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Quantity</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.lineId}>
                <td>{l.line.description}</td>
                <td>{l.qty}</td>
                <td> </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sx-paper-foot">
          <div>
            <b>Transport</b>
            <span>
              {d.vehicle} · Driver {d.driver}
            </span>
          </div>
          <div className="sx-paper-sign">
            <span>Received in good order — name, signature, date</span>
          </div>
        </div>
      </article>
    </Drawer>
  );
};

/* ================================================================== */
/* Products and stock (shared by Trading and Procurement)              */
/* ================================================================== */

export const ProductsPage: React.FC<{ mode: 'SELL' | 'BUY' }> = ({ mode }) => {
  const { state, reorder, setProcurement, party, setTrading } = useCommercial();
  const [filter, setFilter] = useState<'ALL' | 'LOW'>('ALL');
  const [q, setQ] = useState('');
  const [openSku, setOpenSku] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const items = state.products.filter((p) => (mode === 'SELL' ? p.kind !== 'MATERIAL' : p.kind === 'MATERIAL'));
  const rows = items.filter((p) => (filter === 'ALL' || needsReorder(state, p)) && (!q || `${p.sku} ${p.name} ${p.category}`.toLowerCase().includes(q.toLowerCase())));
  const low = items.filter((p) => needsReorder(state, p));
  const value = round2(items.reduce((s, p) => s + p.stock * p.cost, 0));

  const columns: Column<Product>[] = [
    {
      key: 'n',
      header: 'Product',
      render: (p) => (
        <div className="sx-cell-main">
          <span>{p.name}</span>
          <small>
            {p.sku} · {p.category}
          </small>
        </div>
      ),
      sort: (p) => p.name
    },
    ...(mode === 'SELL'
      ? [
          { key: 'p', header: 'Price', render: (p: Product) => kes(p.price), sort: (p: Product) => p.price, align: 'right' as const },
          {
            key: 'm',
            header: 'Margin',
            render: (p: Product) => (p.cost ? `${Math.round(((p.price - p.cost) / p.price) * 100)}%` : '—'),
            sort: (p: Product) => (p.cost ? (p.price - p.cost) / p.price : 0),
            align: 'right' as const,
            hideOnMobile: true
          }
        ]
      : [{ key: 'c', header: 'Unit cost', render: (p: Product) => kes(p.cost), sort: (p: Product) => p.cost, align: 'right' as const }]),
    { key: 's', header: 'In stock', render: (p) => (p.kind === 'SERVICE' ? <span className="sx-muted">Service</span> : `${p.stock} ${p.unit}`), sort: (p) => p.stock, align: 'right' },
    { key: 'cm', header: 'Promised', render: (p) => (p.kind === 'SERVICE' ? '—' : committed(state, p.sku)), align: 'right', hideOnMobile: true },
    { key: 'oo', header: 'On order', render: (p) => (p.kind === 'SERVICE' ? '—' : onOrder(state, p.sku)), align: 'right', hideOnMobile: true },
    {
      key: 'lvl',
      header: 'Level',
      render: (p) =>
        p.kind === 'SERVICE' ? (
          ''
        ) : (
          <div className="sx-meter-cell">
            <Meter value={p.stock / Math.max(1, p.reorderLevel * 2)} tone={needsReorder(state, p) ? 'red' : p.stock < p.reorderLevel * 1.3 ? 'gold' : 'green'} />
            {needsReorder(state, p) && <Pill status="OVERDUE" label="Reorder" />}
          </div>
        ),
      width: 170
    }
  ];
  const open = state.products.find((p) => p.sku === openSku);

  return (
    <SuitePage
      eyebrow={mode === 'SELL' ? 'Catalogue' : 'Inventory'}
      title={mode === 'SELL' ? 'Products & price list' : 'Stock & reorder'}
      subtitle={
        mode === 'SELL'
          ? 'What you sell, at what price and margin, and what is available to promise.'
          : 'Stock on hand against reorder levels. One click raises a requisition for anything running low.'
      }
      actions={
        mode === 'SELL' ? (
          <>
            <ProductImport />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTrading('pricing')}>
              Price lists & mass update
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
              New product
            </button>
          </>
        ) : undefined
      }
    >
      <div className="sx-stats">
        <Stat label="Items" value={items.length} detail={`${new Set(items.map((p) => p.category)).size} categories`} icon={<Package size={17} />} />
        <Stat label="Below reorder level" value={low.length} detail={low.map((p) => p.sku).join(', ') || 'All healthy'} icon={<AlertTriangle size={17} />} tone={low.length ? 'red' : 'green'} onClick={() => setFilter('LOW')} />
        <Stat label="Stock value at cost" value={kes(value, { compact: true })} icon={<Package size={17} />} tone="blue" />
        <Stat label="On order from suppliers" value={items.reduce((s, p) => s + onOrder(state, p.sku), 0)} detail="Units on approved purchase orders" icon={<ShoppingCart size={17} />} tone="violet" />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All', count: items.length },
            { value: 'LOW', label: 'Needs reorder', count: low.length }
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search products…" />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(p) => p.sku} onRowClick={(p) => setOpenSku(p.sku)} selected={openSku} pageSize={20} />
      {open && (
        <Drawer
          title={open.name}
          subtitle={`${open.sku} · ${open.category}`}
          onClose={() => setOpenSku(null)}
          footer={
            open.kind !== 'MATERIAL' ? (
              <>
                <span className="sx-note">{open.kind === 'GOODS' ? 'Finished goods are replenished by the production plan.' : ''}</span>
                <span className="sx-grow" />
                {mode === 'SELL' && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing(open)}>
                    Edit product
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const r = reorder(open.sku);
                  if (r.ok && r.id) setProcurement('requisitions', r.id);
                }}
              >
                <ShoppingCart size={14} /> Raise reorder requisition
              </button>
            )
          }
        >
          <DefList
            items={[
              ['Selling price', open.price ? kes(open.price) : '—'],
              ['Unit cost', open.cost ? kes(open.cost) : '—'],
              ['VAT', open.vatable ? '16%' : 'Exempt'],
              ['In stock', open.kind === 'SERVICE' ? 'Service' : `${open.stock} ${open.unit}`],
              ['Promised to customers', String(committed(state, open.sku))],
              ['On order', String(onOrder(state, open.sku))],
              ['Reorder level', `${open.reorderLevel} ${open.unit}`],
              ['Reorder quantity', `${open.reorderQty} ${open.unit}`],
              ['Preferred supplier', open.preferredSupplier ? party(open.preferredSupplier)?.name ?? '' : '—']
            ]}
          />
          {mode === 'SELL' && <ProductExtras p={open} />}
          {needsReorder(state, open) && (
            <div className="sx-callout warn">
              <AlertTriangle size={16} />
              <div>
                <b>Below reorder level</b>
                <span>
                  Available after promises and orders: {open.stock - committed(state, open.sku) + onOrder(state, open.sku)} {open.unit}. Reorder level {open.reorderLevel}.
                </span>
              </div>
            </div>
          )}
          <Field label="Recent movement" span={4}>
            <ul className="sx-list">
              {state.deliveries
                .flatMap((d) => d.lines.map((l) => ({ d, l, line: state.orders.find((o) => o.id === d.orderId)?.lines.find((x) => x.id === l.lineId) })))
                .filter((x) => x.line?.sku === open.sku)
                .slice(0, 4)
                .map((x) => (
                  <li key={x.d.id + x.l.lineId}>
                    <span className="sx-mono">{x.d.number}</span>
                    <span>{fmtDate(x.d.date)}</span>
                    <span className="sx-muted">Dispatched</span>
                    <b>−{x.l.qty}</b>
                  </li>
                ))}
              {state.receipts
                .flatMap((g) => g.lines.map((l) => ({ g, l, line: state.purchaseOrders.find((o) => o.id === g.poId)?.lines.find((x) => x.id === l.lineId) })))
                .filter((x) => x.line?.sku === open.sku)
                .slice(0, 4)
                .map((x) => (
                  <li key={x.g.id + x.l.lineId}>
                    <span className="sx-mono">{x.g.number}</span>
                    <span>{fmtDate(x.g.date)}</span>
                    <span className="sx-muted">Received</span>
                    <b className="sx-success-text">+{x.l.qty}</b>
                  </li>
                ))}
            </ul>
          </Field>
        </Drawer>
      )}
      {editing && <ProductEditor product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </SuitePage>
  );
};

/* ================================================================== */
/* Customers (sales view)                                              */
/* ================================================================== */

export const SalesCustomersPage: React.FC = () => {
  const { state, finance, owedBy, orderValue, trading, clearFocus } = useCommercial();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (trading.focus) {
      setOpenId(trading.focus);
      clearFocus();
    }
  }, [trading.focus, clearFocus]);
  const customers = finance.state.parties.filter((p) => p.kind === 'CUSTOMER');
  const facts = salesFacts(state, finance.state);
  const period = (id: string, test: (date: string) => boolean) => round2(facts.filter((f) => f.customerId === id && test(f.date)).reduce((s, f) => s + f.revenue, 0));
  const r12From = addD(TODAY, -365);
  const rows = customers
    .map((c) => {
      const orders = state.orders.filter((o) => o.customerId === c.id && o.status === 'APPROVED');
      const sales = round2(orders.reduce((s, o) => s + totals(o.lines, state.products, c).net, 0));
      const open = orders.filter((o) => !o.closed);
      const quotes = state.quotations.filter((x) => x.customerId === c.id);
      return {
        c,
        orders: orders.length,
        sales,
        open: open.length,
        owed: owedBy(c.id),
        quotes: quotes.length,
        openValue: round2(open.reduce((s, o) => s + orderValue(o), 0)),
        mtd: period(c.id, (d) => d.slice(0, 7) === TODAY.slice(0, 7)),
        ytd: period(c.id, (d) => d.slice(0, 4) === TODAY.slice(0, 4)),
        r12: period(c.id, (d) => d >= r12From)
      };
    })
    .filter((r) => !q || r.c.name.toLowerCase().includes(q.toLowerCase()));
  type Row = (typeof rows)[number];
  const top = [...rows].sort((a, b) => b.sales - a.sales)[0];
  const columns: Column<Row>[] = [
    {
      key: 'n',
      header: 'Customer',
      render: (r) => (
        <div className="sx-cell-main">
          <span>{r.c.name}</span>
          <small>{r.c.category}</small>
        </div>
      ),
      sort: (r) => r.c.name
    },
    { key: 'o', header: 'Orders', render: (r) => r.orders, sort: (r) => r.orders, align: 'right' },
    { key: 's', header: 'Sales (orders)', render: (r) => kes(r.sales, { compact: true }), sort: (r) => r.sales, align: 'right' },
    { key: 'mtd', header: 'MTD', render: (r) => kes(r.mtd, { compact: true }), sort: (r) => r.mtd, align: 'right', hideOnMobile: true },
    { key: 'ytd', header: 'YTD', render: (r) => kes(r.ytd, { compact: true }), sort: (r) => r.ytd, align: 'right', hideOnMobile: true },
    { key: 'r12', header: 'Rolling 12m', render: (r) => kes(r.r12, { compact: true }), sort: (r) => r.r12, align: 'right', hideOnMobile: true },
    { key: 'op', header: 'Open orders', render: (r) => (r.open ? `${r.open} · ${kes(r.openValue, { compact: true })}` : '—'), sort: (r) => r.openValue, align: 'right', hideOnMobile: true },
    {
      key: 'ow',
      header: 'Owes us',
      render: (r) => (
        <div className="sx-meter-cell">
          <b>{kes(r.owed, { compact: true })}</b>
          {r.c.creditLimit && <Meter value={r.owed / r.c.creditLimit} tone={r.owed > r.c.creditLimit ? 'red' : 'green'} />}
        </div>
      ),
      sort: (r) => r.owed,
      width: 200
    }
  ];
  return (
    <SuitePage eyebrow="Sales" title="Customers" subtitle="Sales, open orders and credit position for every customer. Balances come straight from Finance.">
      <div className="sx-stats">
        <Stat label="Customers" value={customers.length} icon={<Users size={17} />} />
        <Stat label="Top customer" value={top?.c.name.split(' ')[0] ?? '—'} detail={top ? kes(top.sales, { compact: true }) : ''} icon={<TrendingUp size={17} />} tone="blue" />
        <Stat label="Open order book" value={kes(round2(rows.reduce((s, r) => s + r.openValue, 0)), { compact: true })} icon={<ShoppingCart size={17} />} tone="violet" />
        <Stat label="Owed to us" value={kes(round2(rows.reduce((s, r) => s + r.owed, 0)), { compact: true })} detail="From Finance" icon={<AlertTriangle size={17} />} tone="gold" />
      </div>
      <div className="sx-toolbar">
        <span />
        <SearchBox value={q} onChange={setQ} placeholder="Search customers…" />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.c.id} onRowClick={(r) => setOpenId(r.c.id)} selected={openId} initialSort={{ key: 's', dir: 'desc' }} />
      {openId && <CustomerDrawer key={openId} customerId={openId} onClose={() => setOpenId(null)} />}
    </SuitePage>
  );
};
