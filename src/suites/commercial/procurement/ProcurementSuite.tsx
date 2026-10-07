import React, { useEffect } from 'react';
import { LayoutDashboard, ClipboardList, ShoppingCart, PackageCheck, Truck, Boxes, ChevronRight, Clock3, AlertTriangle, Receipt, CheckCircle2, Send, Scale, RotateCcw, FilePlus2 } from 'lucide-react';
import { useCommercial, type ProcurementPage } from '../store';
import { approvalRights, needsReorder, poLate, poStage, reqTotal, supplierStats, totals } from '../engine';
import { daysBetween, kes, round2, TODAY } from '../../finance/engine';
import { Donut, LinkButton, Panel, Stat } from '../../ui/kit';
import { SuiteSidebar, type SuiteNavGroup } from '../../ui/SuiteSidebar';
import { ComActorSwitcher } from '../parts';
import { RequisitionsPage, PurchaseOrdersPage, ReceiptsPage, SuppliersPage } from './Purchasing';
import { ProductsPage } from '../trading/Fulfilment';

const LABEL: Record<ProcurementPage, string> = {
  overview: 'Overview',
  requisitions: 'Requisitions',
  orders: 'Purchase orders',
  receipts: 'Goods received',
  suppliers: 'Suppliers',
  stock: 'Stock & reorder'
};

const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

const ProcurementOverview: React.FC = () => {
  const { state, actor, party, setProcurement: go, poValue, reorder } = useCommercial();
  const approved = state.purchaseOrders.filter((o) => o.status === 'APPROVED');
  const spendYtd = round2(approved.filter((o) => o.date.slice(0, 4) === TODAY.slice(0, 4)).reduce((s, o) => s + totals(o.lines, state.products).net, 0));
  const awaiting = state.purchaseOrders.filter((o) => ['AWAITING', 'PART_RECEIVED'].includes(poStage(o)));
  const late = awaiting.filter((o) => poLate(o));
  const lowStock = state.products.filter((p) => p.kind === 'MATERIAL' && needsReorder(state, p));

  // Spend by category
  const byCat: Record<string, number> = {};
  for (const o of approved)
    for (const l of o.lines) {
      const c = state.products.find((p) => p.sku === l.sku)?.category ?? 'Other';
      byCat[c] = round2((byCat[c] ?? 0) + l.qty * l.price);
    }
  const COLORS = ['#237857', '#65a586', '#ddbd72', '#749ca0', '#8b76aa', '#c98f6b'];
  const cats = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }));
  const catTotal = cats.reduce((s, c) => s + c.value, 0);

  type Item = { id: string; tone: string; icon: React.ReactNode; title: string; detail: string; onClick: () => void };
  const items: Item[] = [];
  for (const r of state.requisitions) {
    if (approvalRights(r, reqTotal(r), actor).can) items.push({ id: r.id, tone: 'warning', icon: <Clock3 size={15} />, title: `Approve ${r.number}`, detail: `${r.department} · ${kes(reqTotal(r), { compact: true })}`, onClick: () => go('requisitions', r.id) });
    if (r.status === 'APPROVED' && !r.poId)
      items.push({ id: `a${r.id}`, tone: 'info', icon: <Scale size={15} />, title: `${r.quotes.length ? 'Award' : 'Source'} ${r.number}`, detail: r.quotes.length ? `${r.quotes.length} quotes in — pick a supplier` : 'Approved — get quotes', onClick: () => go('requisitions', r.id) });
  }
  for (const o of state.purchaseOrders) {
    if (approvalRights(o, poValue(o), actor).can) items.push({ id: o.id, tone: 'warning', icon: <Clock3 size={15} />, title: `Approve ${o.number}`, detail: `${party(o.supplierId)?.name} · ${kes(poValue(o), { compact: true })}`, onClick: () => go('orders', o.id) });
    const st = poStage(o);
    if (st === 'TO_SEND') items.push({ id: `s${o.id}`, tone: 'info', icon: <Send size={15} />, title: `Send ${o.number}`, detail: `Approved — email it to ${party(o.supplierId)?.name}`, onClick: () => go('orders', o.id) });
    if (st === 'TO_BILL') items.push({ id: `b${o.id}`, tone: 'info', icon: <Receipt size={15} />, title: `Bill ${o.number}`, detail: 'Goods received — raise the bill in Finance', onClick: () => go('orders', o.id) });
    if (poLate(o)) items.push({ id: `l${o.id}`, tone: 'critical', icon: <AlertTriangle size={15} />, title: `Chase ${party(o.supplierId)?.name}`, detail: `${o.number} is ${daysBetween(o.expected, TODAY)} days late`, onClick: () => go('orders', o.id) });
  }
  for (const p of lowStock) items.push({ id: p.sku, tone: 'critical', icon: <Boxes size={15} />, title: `Reorder ${p.name}`, detail: `${p.stock} ${p.unit} left, reorder level ${p.reorderLevel}`, onClick: () => go('stock') });

  const top = state.purchaseOrders
    .map((o) => o.supplierId)
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((id) => ({ id, ...supplierStats(state, id, state.products) }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);

  return (
    <div className="sx-page">
      <header className="sx-hero">
        <div>
          <span className="sx-eyebrow">
            {greet()}, {actor.name.split(' ')[0]} · {actor.title}
          </span>
          <h1>Procurement</h1>
          <p>
            {awaiting.length} orders on their way{late.length ? `, ${late.length} late` : ''} · {items.length} things need attention
          </p>
        </div>
        <div className="sx-quick">
          <button type="button" onClick={() => go('requisitions', 'new')}>
            <FilePlus2 size={16} /> New requisition
          </button>
          <button type="button" onClick={() => go('orders', 'new')}>
            <ShoppingCart size={16} /> New purchase order
          </button>
          <button type="button" onClick={() => go('orders')}>
            <PackageCheck size={16} /> Receive goods
          </button>
          {lowStock[0] && (
            <button
              type="button"
              onClick={() => {
                const r = reorder(lowStock[0].sku);
                if (r.ok && r.id) go('requisitions', r.id);
              }}
            >
              <Boxes size={16} /> Reorder {lowStock[0].sku}
            </button>
          )}
        </div>
      </header>
      <div className="sx-stats">
        <Stat label="Spend this year" value={kes(spendYtd, { compact: true })} detail="Approved purchase orders, before VAT" icon={<ShoppingCart size={17} />} onClick={() => go('orders')} />
        <Stat label="Awaiting delivery" value={awaiting.length} detail={late.length ? `${late.length} late` : 'All on schedule'} icon={<Truck size={17} />} tone={late.length ? 'red' : 'blue'} onClick={() => go('orders')} />
        <Stat
          label="Requisitions in progress"
          value={state.requisitions.filter((r) => r.status === 'SUBMITTED' || (r.status === 'APPROVED' && !r.poId)).length}
          detail="Approval or sourcing"
          icon={<ClipboardList size={17} />}
          tone="gold"
          onClick={() => go('requisitions')}
        />
        <Stat label="Materials to reorder" value={lowStock.length} detail={lowStock.map((p) => p.sku).join(', ') || 'Stock is healthy'} icon={<Boxes size={17} />} tone={lowStock.length ? 'red' : 'green'} onClick={() => go('stock')} />
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
              {items.slice(0, 9).map((i) => (
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
        <Panel title="Spend by category" subtitle="Approved orders this year">
          <Donut items={cats} center={kes(catTotal, { compact: true }).replace('KES ', '')} caption="spend" />
        </Panel>
      </div>
      <div className="sx-row">
        <Panel title="Top suppliers" subtitle="By spend this year" action={<LinkButton onClick={() => go('suppliers')}>Suppliers</LinkButton>}>
          <table className="sx-mini-table">
            <tbody>
              {top.map((t) => (
                <tr key={t.id}>
                  <td>
                    {party(t.id)?.name}
                    <small className="sx-muted sx-block">{t.onTime === null ? 'No deliveries yet' : `${Math.round(t.onTime * 100)}% on time · ${t.orders} orders`}</small>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <b>{kes(t.spend, { compact: true })}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="On the way" subtitle="Open purchase orders by expected date" action={<LinkButton onClick={() => go('orders')}>Orders</LinkButton>}>
          <ul className="sx-facts">
            {awaiting
              .sort((a, b) => a.expected.localeCompare(b.expected))
              .slice(0, 6)
              .map((o) => (
                <li key={o.id}>
                  <span>
                    {o.number} · {party(o.supplierId)?.name.split(' ')[0]}
                  </span>
                  <b className={poLate(o) ? 'sx-danger-text' : ''}>{poLate(o) ? `${daysBetween(o.expected, TODAY)}d late` : `in ${daysBetween(TODAY, o.expected)}d`}</b>
                </li>
              ))}
          </ul>
        </Panel>
        <Panel title="Materials stock" subtitle="Closest to reorder level" action={<LinkButton onClick={() => go('stock')}>Stock</LinkButton>}>
          <ul className="sx-barlist">
            {state.products
              .filter((p) => p.kind === 'MATERIAL')
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

export const ProcurementSidebar: React.FC = () => {
  const { state, actor, procurement, setProcurement, reset, poValue } = useCommercial();
  const reqAct = state.requisitions.filter((r) => approvalRights(r, reqTotal(r), actor).can || (r.status === 'APPROVED' && !r.poId)).length;
  const poAct = state.purchaseOrders.filter((o) => approvalRights(o, poValue(o), actor).can || ['TO_SEND', 'TO_BILL'].includes(poStage(o))).length;
  const groups: SuiteNavGroup<ProcurementPage>[] = [
    { label: 'Procurement', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
    {
      label: 'Buy',
      items: [
        { id: 'requisitions', label: 'Requisitions', icon: ClipboardList, badge: reqAct },
        { id: 'orders', label: 'Purchase orders', icon: ShoppingCart, badge: poAct || state.purchaseOrders.filter((o) => poLate(o)).length, badgeTone: poAct ? 'warning' : 'critical' },
        { id: 'suppliers', label: 'Suppliers', icon: Truck }
      ]
    },
    {
      label: 'Stores',
      items: [
        { id: 'receipts', label: 'Goods received', icon: PackageCheck },
        { id: 'stock', label: 'Stock & reorder', icon: Boxes, badge: state.products.filter((p) => p.kind === 'MATERIAL' && needsReorder(state, p)).length, badgeTone: 'critical' }
      ]
    }
  ];
  return (
    <SuiteSidebar
      name="Procurement"
      tagline="Request · source · order · receive"
      icon={ShoppingCart}
      groups={groups}
      active={procurement.page}
      onSelect={(p) => setProcurement(p)}
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

export const ProcurementCrumb: React.FC = () => {
  const { procurement, setProcurement } = useCommercial();
  return (
    <span className="sx-crumb">
      <button type="button" onClick={() => setProcurement('overview')}>
        Procurement
      </button>
      {procurement.page !== 'overview' && (
        <>
          <ChevronRight size={11} />
          <b>{LABEL[procurement.page]}</b>
        </>
      )}
    </span>
  );
};

export const ProcurementSuite: React.FC = () => {
  const { procurement } = useCommercial();
  useEffect(() => {
    document.getElementById('main-content')?.scrollTo({ top: 0 });
  }, [procurement.page]);
  return (
    <div className="sx-suite" key={procurement.page}>
      {procurement.page === 'overview' && <ProcurementOverview />}
      {procurement.page === 'requisitions' && <RequisitionsPage />}
      {procurement.page === 'orders' && <PurchaseOrdersPage />}
      {procurement.page === 'receipts' && <ReceiptsPage />}
      {procurement.page === 'suppliers' && <SuppliersPage />}
      {procurement.page === 'stock' && <ProductsPage mode="BUY" />}
    </div>
  );
};
