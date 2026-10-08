import React, { useEffect } from 'react';
import {
  LayoutDashboard,
  FileText,
  ShoppingBag,
  Truck,
  Package,
  Users,
  TrendingUp,
  FilePlus2,
  ChevronRight,
  Clock3,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ShoppingCart,
  Tags,
  Store,
  FileStack,
  Undo2,
  Gavel,
  FlaskConical,
  BarChart3,
  Globe,
  Settings
} from 'lucide-react';
import { useCommercial, type TradingPage } from '../store';
import { approvalRights, needsReorder, orderStage, totals } from '../engine';
import { addDays, daysBetween, kes, round2, TODAY } from '../../finance/engine';
import { Bars, LinkButton, Panel, Stat } from '../../ui/kit';
import { SuiteSidebar, type SuiteNavGroup } from '../../ui/SuiteSidebar';
import { ComActorSwitcher } from '../parts';
import { QuotationsPage, OrdersPage } from './Sales';
import { DeliveriesPage, ProductsPage, SalesCustomersPage } from './Fulfilment';
import { PricingPage } from './Pricing';
import { CounterPage } from './Counter';
import { InvoicingPage } from './Invoicing';
import { ReturnsPage } from './Returns';
import { AuctionsPage } from './Auctions';
import { ConfiguratorPage } from './Configurator';
import { ReportsPage } from './Reports';
import { PortalPage } from './Portal';
import { SetupPage } from './Setup';
import './trading.css';

const LABEL: Record<TradingPage, string> = {
  overview: 'Overview',
  quotations: 'Quotations',
  orders: 'Sales orders',
  deliveries: 'Deliveries',
  products: 'Products & price list',
  customers: 'Customers',
  pricing: 'Pricing',
  pos: 'Counter sales',
  invoicing: 'Invoice run',
  returns: 'Returns & credits',
  auctions: 'Auctions & tasting',
  configurator: 'Blend configurator',
  reports: 'Sales reports',
  portal: 'Customer portal',
  setup: 'Trading setup'
};

const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const TradingOverview: React.FC = () => {
  const { state, actor, party, setTrading, orderValue, setProcurement } = useCommercial();
  const go = setTrading;
  const approved = state.orders.filter((o) => o.status === 'APPROVED');
  const month = TODAY.slice(0, 7);
  const salesMonth = round2(approved.filter((o) => o.date.slice(0, 7) === month).reduce((s, o) => s + totals(o.lines, state.products, party(o.customerId)).net, 0));
  const book = state.orders.filter((o) => o.status === 'APPROVED' && !o.closed);
  const bookValue = round2(book.reduce((s, o) => s + orderValue(o), 0));
  const openQuotes = state.quotations.filter((q) => q.status === 'SENT' && q.validUntil >= TODAY);
  const quoteValue = round2(openQuotes.reduce((s, q) => s + totals(q.lines, state.products, party(q.customerId)).total, 0));
  const toInvoice = state.orders.filter((o) => orderStage(o) === 'TO_INVOICE');

  // Weekly order intake over the last 8 weeks
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = addDays(TODAY, -7 * (7 - i));
    const start = addDays(end, -6);
    const list = approved.filter((o) => o.date >= start && o.date <= end);
    return { label: `${new Date(end + 'T00:00:00').getDate()}/${new Date(end + 'T00:00:00').getMonth() + 1}`, values: [round2(list.reduce((s, o) => s + totals(o.lines, state.products, party(o.customerId)).net, 0))] };
  });

  // Best sellers by quantity ordered this year
  const qty: Record<string, number> = {};
  for (const o of approved) for (const l of o.lines) qty[l.sku] = (qty[l.sku] ?? 0) + l.qty * l.price;
  const best = Object.entries(qty)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sku, v]) => ({ p: state.products.find((x) => x.sku === sku)!, v }));
  const bestMax = Math.max(1, ...best.map((b) => b.v));

  type Item = { id: string; tone: string; icon: React.ReactNode; title: string; detail: string; onClick: () => void };
  const items: Item[] = [];
  for (const o of state.orders) {
    const r = approvalRights(o, orderValue(o), actor);
    if (r.can) items.push({ id: o.id, tone: 'warning', icon: <Clock3 size={15} />, title: `Approve ${o.number}`, detail: `${party(o.customerId)?.name} · ${kes(orderValue(o), { compact: true })}`, onClick: () => go('orders', o.id) });
  }
  for (const o of state.orders.filter((x) => orderStage(x) === 'TO_DISPATCH' || orderStage(x) === 'PART_DELIVERED'))
    if (actor.role !== 'OFFICER' || o.requiredBy <= TODAY)
      items.push({ id: `d${o.id}`, tone: o.requiredBy <= TODAY ? 'critical' : 'info', icon: <Truck size={15} />, title: `Dispatch ${o.number}`, detail: `${party(o.customerId)?.name} · required ${o.requiredBy <= TODAY ? 'today or earlier' : `by ${o.requiredBy}`}`, onClick: () => go('orders', o.id) });
  for (const o of toInvoice) items.push({ id: `i${o.id}`, tone: 'info', icon: <Receipt size={15} />, title: `Invoice ${o.number}`, detail: `Delivered to ${party(o.customerId)?.name}, not yet invoiced`, onClick: () => go('orders', o.id) });
  for (const q of openQuotes.filter((x) => daysBetween(TODAY, x.validUntil) <= 7))
    items.push({ id: q.id, tone: 'warning', icon: <FileText size={15} />, title: `Follow up ${q.number}`, detail: `${party(q.customerId)?.name} · expires in ${daysBetween(TODAY, q.validUntil)} days`, onClick: () => go('quotations', q.id) });
  for (const p of state.products.filter((x) => x.kind === 'GOODS' && needsReorder(state, x)))
    items.push({ id: p.sku, tone: 'critical', icon: <AlertTriangle size={15} />, title: `${p.name} running low`, detail: `${p.stock} ${p.unit} left — reorder level ${p.reorderLevel}`, onClick: () => go('products') });

  return (
    <div className="sx-page">
      <header className="sx-hero">
        <div>
          <span className="sx-eyebrow">
            {greet()}, {actor.name.split(' ')[0]} · {actor.title}
          </span>
          <h1>Trading & sales</h1>
          <p>
            {book.length} open orders worth {kes(bookValue, { compact: true })} · {items.length} things need attention
          </p>
        </div>
        <div className="sx-quick">
          <button type="button" onClick={() => go('quotations', 'new')}>
            <FilePlus2 size={16} /> New quotation
          </button>
          <button type="button" onClick={() => go('orders', 'new')}>
            <ShoppingBag size={16} /> New order
          </button>
          <button type="button" onClick={() => go('deliveries')}>
            <Truck size={16} /> Deliveries
          </button>
          <button type="button" onClick={() => go('products')}>
            <Package size={16} /> Price list
          </button>
        </div>
      </header>
      <div className="sx-stats">
        <Stat label="Orders this month" value={kes(salesMonth, { compact: true })} detail="Approved, before VAT" icon={<TrendingUp size={17} />} onClick={() => go('orders')} />
        <Stat label="Open order book" value={kes(bookValue, { compact: true })} detail={`${book.length} orders to dispatch or invoice`} icon={<ShoppingBag size={17} />} tone="blue" onClick={() => go('orders')} />
        <Stat label="Quotes out" value={kes(quoteValue, { compact: true })} detail={`${openQuotes.length} awaiting the customer`} icon={<FileText size={17} />} tone="gold" onClick={() => go('quotations')} />
        <Stat label="Delivered, not invoiced" value={toInvoice.length} detail={kes(round2(toInvoice.reduce((s, o) => s + orderValue(o), 0)), { compact: true })} icon={<Receipt size={17} />} tone={toInvoice.length ? 'red' : 'violet'} onClick={() => go('orders')} />
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title="Order intake" subtitle="Approved order value per week, before VAT" action={<LinkButton onClick={() => go('orders')}>Orders</LinkButton>}>
          <Bars data={weeks} series={[{ name: 'Orders', color: '#237857' }]} format={(n) => kes(n, { compact: true }).replace('KES ', '')} />
        </Panel>
        <Panel title="Best sellers" subtitle="By order value this year" action={<LinkButton onClick={() => go('products')}>Products</LinkButton>}>
          <ul className="sx-barlist">
            {best.map((b) => (
              <li key={b.p.sku}>
                <div>
                  <span>{b.p.name}</span>
                  <b>{kes(b.v, { compact: true })}</b>
                </div>
                <span className="sx-meter">
                  <i style={{ width: `${(b.v / bestMax) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title={<>Needs your attention {items.length > 0 && <span className="sx-count">{items.length}</span>}</>} subtitle={`What ${actor.name.split(' ')[0]} can act on as ${actor.title}`}>
          {items.length === 0 ? (
            <div className="sx-allclear">
              <CheckCircle2 size={24} />
              <p>All caught up.</p>
            </div>
          ) : (
            <ul className="sx-todo">
              {items.slice(0, 8).map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={i.onClick}>
                    <span className={`sx-todo-icon ${i.tone}`}>{i.icon}</span>
                    <span className="sx-todo-text">
                      <b>{i.title}</b>
                      <small>{i.detail}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Stock to watch" subtitle="Finished goods closest to their reorder level" action={<LinkButton onClick={() => setProcurement('stock')}>Reorder</LinkButton>}>
          <ul className="sx-barlist">
            {state.products
              .filter((p) => p.kind === 'GOODS')
              .sort((a, b) => a.stock / a.reorderLevel - b.stock / b.reorderLevel)
              .slice(0, 5)
              .map((p) => (
                <li key={p.sku}>
                  <div>
                    <span>{p.name}</span>
                    <b className={p.stock < p.reorderLevel ? 'sx-danger-text' : ''}>
                      {p.stock} {p.unit}
                    </b>
                  </div>
                  <span className={`sx-meter ${p.stock < p.reorderLevel ? 'sx-meter-red' : ''}`}>
                    <i style={{ width: `${Math.min(100, (p.stock / (p.reorderLevel * 2)) * 100)}%` }} />
                  </span>
                </li>
              ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
};

export const TradingSidebar: React.FC = () => {
  const { state, actor, trading, setTrading, reset, orderValue } = useCommercial();
  const approvals = state.orders.filter((o) => approvalRights(o, orderValue(o), actor).can).length;
  const groups: SuiteNavGroup<TradingPage>[] = [
    { label: 'Trading', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
    {
      label: 'Sell',
      items: [
        { id: 'quotations', label: 'Quotations', icon: FileText, badge: state.quotations.filter((q) => q.status === 'SENT' && q.validUntil >= TODAY && daysBetween(TODAY, q.validUntil) <= 7).length },
        { id: 'orders', label: 'Sales orders', icon: ShoppingBag, badge: approvals || state.orders.filter((o) => orderStage(o) === 'TO_INVOICE').length, badgeTone: approvals ? 'warning' : 'critical' },
        { id: 'pricing', label: 'Pricing', icon: Tags, badge: state.priceLists.filter((p) => p.status === 'DRAFT').length, badgeTone: 'warning' },
        { id: 'pos', label: 'Counter sales', icon: Store },
        { id: 'invoicing', label: 'Invoice run', icon: FileStack }
      ]
    },
    {
      label: 'Tea',
      items: [
        { id: 'auctions', label: 'Auctions & tasting', icon: Gavel, badge: state.auctions.filter((a) => a.status === 'OPEN').length, badgeTone: 'neutral' },
        { id: 'configurator', label: 'Blend configurator', icon: FlaskConical }
      ]
    },
    {
      label: 'Fulfil',
      items: [
        { id: 'deliveries', label: 'Deliveries', icon: Truck, badge: state.orders.filter((o) => orderStage(o) === 'TO_DISPATCH').length, badgeTone: 'neutral' },
        { id: 'products', label: 'Products & price list', icon: Package, badge: state.products.filter((p) => p.kind === 'GOODS' && needsReorder(state, p)).length, badgeTone: 'critical' },
        { id: 'customers', label: 'Customers', icon: Users },
        { id: 'returns', label: 'Returns & credits', icon: Undo2, badge: state.rmas.filter((r) => r.status === 'REQUESTED').length + state.claims.filter((c) => c.status === 'OPEN').length, badgeTone: 'warning' }
      ]
    },
    {
      label: 'Insight & channels',
      items: [
        { id: 'reports', label: 'Sales reports', icon: BarChart3 },
        { id: 'portal', label: 'Customer portal', icon: Globe },
        { id: 'setup', label: 'Trading setup', icon: Settings }
      ]
    }
  ];
  return (
    <SuiteSidebar
      name="Trading & Sales"
      tagline="Quote · order · deliver · invoice"
      icon={ShoppingCart}
      groups={groups}
      active={trading.page}
      onSelect={(p) => setTrading(p)}
      footer={
        <div className="sx-side-actor">
          <ComActorSwitcher />
          <button type="button" className="sx-link sx-reset" onClick={reset}>
            <RotateCcw size={12} /> Reset demo data
          </button>
        </div>
      }
    />
  );
};

export const TradingCrumb: React.FC = () => {
  const { trading, setTrading } = useCommercial();
  return (
    <span className="sx-crumb">
      <button type="button" onClick={() => setTrading('overview')}>
        Trading & Sales
      </button>
      {trading.page !== 'overview' && (
        <>
          <ChevronRight size={11} />
          <b>{LABEL[trading.page]}</b>
        </>
      )}
    </span>
  );
};

export const TradingSuite: React.FC = () => {
  const { trading } = useCommercial();
  useEffect(() => {
    document.getElementById('main-content')?.scrollTo({ top: 0 });
  }, [trading.page]);
  return (
    <div className="sx-suite" key={trading.page}>
      {trading.page === 'overview' && <TradingOverview />}
      {trading.page === 'quotations' && <QuotationsPage />}
      {trading.page === 'orders' && <OrdersPage />}
      {trading.page === 'deliveries' && <DeliveriesPage />}
      {trading.page === 'products' && <ProductsPage mode="SELL" />}
      {trading.page === 'customers' && <SalesCustomersPage />}
      {trading.page === 'pricing' && <PricingPage />}
      {trading.page === 'pos' && <CounterPage />}
      {trading.page === 'invoicing' && <InvoicingPage />}
      {trading.page === 'returns' && <ReturnsPage />}
      {trading.page === 'auctions' && <AuctionsPage />}
      {trading.page === 'configurator' && <ConfiguratorPage />}
      {trading.page === 'reports' && <ReportsPage />}
      {trading.page === 'portal' && <PortalPage />}
      {trading.page === 'setup' && <SetupPage />}
    </div>
  );
};
