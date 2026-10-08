import React, { useEffect } from 'react';
import { LayoutDashboard, ClipboardList, ShoppingCart, PackageCheck, Truck, Boxes, ChevronRight, Clock3, AlertTriangle, Receipt, CheckCircle2, Send, Scale, RotateCcw, FilePlus2, Gavel, Globe, Users, FileSignature, Store, FileCheck2, Warehouse, ListChecks, Ship, CalendarRange, BarChart3, Settings2, ShieldAlert } from 'lucide-react';
import { useCommercial, type ProcurementPage } from '../store';
import { approvalRights, needsReorder, poLate, poStage, reqTotal, supplierStats, totals } from '../engine';
import { daysBetween, kes, round2, TODAY } from '../../finance/engine';
import { Donut, LinkButton, Panel, Stat } from '../../ui/kit';
import { SuiteSidebar, type SuiteNavGroup } from '../../ui/SuiteSidebar';
import { ComActorSwitcher } from '../parts';
import { RequisitionsPage, PurchaseOrdersPage, ReceiptsPage, SuppliersPage } from './Purchasing';
import { ProductsPage } from '../trading/Fulfilment';
import { EXT_LABEL, useProcurementExt, type ProcExtPage } from './ext/store';
import { contractsExpiring, expiringDocuments } from './ext/engine';
import { SourcingPage } from './Sourcing';
import { VendorsPage } from './Vendors';
import { SupplierPortalPage } from './SupplierPortal';
import { ContractsPage } from './Contracts';
import { CataloguePage } from './Catalogue';
import { InvoicesPage } from './Invoices';
import { InventoryPage } from './Inventory';
import { StoresPage } from './Stores';
import { LandedPage } from './Landed';
import { PlanPage } from './Plan';
import { ReportsPage } from './Reports';
import { SettingsPage } from './Settings';

type NavPage = ProcurementPage | ProcExtPage;
const CORE: ProcurementPage[] = ['overview', 'requisitions', 'orders', 'receipts', 'suppliers', 'stock'];
const isCore = (p: NavPage): p is ProcurementPage => (CORE as string[]).includes(p);

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
  const ext = useProcurementExt();
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
  const xs = ext.state;
  for (const { profile, doc, days } of expiringDocuments(xs.suppliers, xs.settings.docAlertDays))
    items.push({ id: `d${doc.id}`, tone: days < 0 ? 'critical' : 'warning', icon: <ShieldAlert size={15} />, title: `${profile.name}: certificate ${days < 0 ? 'expired' : 'expiring'}`, detail: `${doc.number} ${days < 0 ? `${-days} days ago` : `in ${days} days`}`, onClick: () => ext.go('vendors', profile.id) });
  for (const { c, days } of contractsExpiring(xs.contracts, xs.settings.contractAlertDays)) items.push({ id: `c${c.id}`, tone: 'warning', icon: <FileSignature size={15} />, title: `Contract ${c.number} ends in ${days} days`, detail: c.title, onClick: () => ext.go('contracts', c.id) });
  for (const i of xs.invoices.filter((x) => x.status === 'ON_HOLD')) items.push({ id: `h${i.id}`, tone: 'warning', icon: <Receipt size={15} />, title: `Invoice ${i.number} on hold`, detail: i.hold?.reason ?? '', onClick: () => ext.go('invoices', i.id) });
  if (actor.role === 'MANAGER' || actor.role === 'DIRECTOR') {
    for (const r of xs.storesReqs.filter((x) => x.status === 'SUBMITTED')) items.push({ id: `sr${r.id}`, tone: 'info', icon: <ListChecks size={15} />, title: `Approve stores request ${r.number}`, detail: `${r.department} · ${r.lines.length} items`, onClick: () => ext.go('stores', r.id) });
    for (const m of xs.moves.filter((x) => x.status === 'PENDING')) items.push({ id: `mv${m.id}`, tone: 'info', icon: <Warehouse size={15} />, title: `Approve issue ${m.number}`, detail: `${m.costCentre} · ${kes(m.value, { compact: true })}`, onClick: () => ext.go('inventory', 'movements') });
    for (const p of xs.suppliers.filter((x) => x.status === 'PENDING_APPROVAL')) items.push({ id: `sp${p.id}`, tone: 'info', icon: <Users size={15} />, title: `Approve supplier ${p.name}`, detail: p.category, onClick: () => ext.go('vendors', p.id) });
  }
  if (actor.role === 'DIRECTOR' && xs.plan.status === 'SUBMITTED') items.push({ id: 'plan', tone: 'info', icon: <CalendarRange size={15} />, title: `Approve the ${xs.plan.year} procurement plan`, detail: `${xs.plan.lines.length} lines`, onClick: () => ext.go('plan') });

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
          <button type="button" onClick={() => ext.go('catalogue')}>
            <Store size={16} /> Shop the catalogue
          </button>
          <button type="button" onClick={() => ext.go('sourcing', 'new')}>
            <Gavel size={16} /> New sourcing event
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
  const ext = useProcurementExt();
  const xs = ext.state;
  const reqAct = state.requisitions.filter((r) => approvalRights(r, reqTotal(r), actor).can || (r.status === 'APPROVED' && !r.poId)).length;
  const poAct = state.purchaseOrders.filter((o) => approvalRights(o, poValue(o), actor).can || ['TO_SEND', 'TO_BILL'].includes(poStage(o))).length;
  const groups: SuiteNavGroup<NavPage>[] = [
    {
      label: 'Procurement',
      items: [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        { id: 'reports', label: 'Reports & analytics', icon: BarChart3 },
        { id: 'plan', label: 'Plan & budget', icon: CalendarRange, badge: xs.plan.status === 'SUBMITTED' ? 1 : 0, badgeTone: 'warning' }
      ]
    },
    {
      label: 'Buy',
      items: [
        { id: 'catalogue', label: 'Shop & catalogue', icon: Store },
        { id: 'requisitions', label: 'Requisitions', icon: ClipboardList, badge: reqAct },
        { id: 'sourcing', label: 'Sourcing events', icon: Gavel, badge: xs.events.filter((e) => e.status === 'OPEN' || e.status === 'EVALUATION').length, badgeTone: 'neutral' },
        { id: 'orders', label: 'Purchase orders', icon: ShoppingCart, badge: poAct || state.purchaseOrders.filter((o) => poLate(o)).length, badgeTone: poAct ? 'warning' : 'critical' },
        { id: 'contracts', label: 'Contracts', icon: FileSignature, badge: contractsExpiring(xs.contracts, xs.settings.contractAlertDays).length, badgeTone: 'warning' }
      ]
    },
    {
      label: 'Suppliers',
      items: [
        { id: 'vendors', label: 'Supplier management', icon: Users, badge: xs.suppliers.filter((p) => p.status === 'PENDING_APPROVAL').length, badgeTone: 'warning' },
        { id: 'suppliers', label: 'Supplier accounts', icon: Truck },
        { id: 'portal', label: 'Supplier portal', icon: Globe }
      ]
    },
    { label: 'Pay', items: [{ id: 'invoices', label: 'Invoice matching', icon: FileCheck2, badge: xs.invoices.filter((i) => i.status === 'ON_HOLD').length, badgeTone: 'critical' }] },
    {
      label: 'Stores',
      items: [
        { id: 'receipts', label: 'Goods received', icon: PackageCheck },
        { id: 'stock', label: 'Stock & reorder', icon: Boxes, badge: state.products.filter((p) => p.kind === 'MATERIAL' && needsReorder(state, p)).length, badgeTone: 'critical' },
        { id: 'inventory', label: 'Inventory control', icon: Warehouse, badge: xs.moves.filter((m) => m.status === 'PENDING').length, badgeTone: 'warning' },
        { id: 'stores', label: 'Stores requests', icon: ListChecks, badge: xs.storesReqs.filter((r) => r.status === 'SUBMITTED').length, badgeTone: 'warning' },
        { id: 'landed', label: 'Landed cost & clearing', icon: Ship }
      ]
    },
    { label: 'Setup', items: [{ id: 'settings', label: 'Settings', icon: Settings2 }] }
  ];
  return (
    <SuiteSidebar
      name="Procurement"
      tagline="Source · buy · receive · pay"
      icon={ShoppingCart}
      groups={groups}
      active={ext.page?.page ?? procurement.page}
      onSelect={(p) => (isCore(p) ? (ext.page ? ext.goCore(p) : setProcurement(p)) : ext.go(p))}
      footer={
        <div className="sx-side-actor">
          <ComActorSwitcher />
          <button
            type="button"
            className="sx-link sx-reset"
            onClick={() => {
              reset();
              ext.reset();
            }}
          >
            <RotateCcw size={12} /> Reset demo data
          </button>
        </div>
      }
    />
  );
};

export const ProcurementCrumb: React.FC = () => {
  const { procurement } = useCommercial();
  const ext = useProcurementExt();
  const here = ext.page ? EXT_LABEL[ext.page.page] : procurement.page !== 'overview' ? LABEL[procurement.page] : null;
  return (
    <span className="sx-crumb">
      <button type="button" onClick={() => ext.goCore('overview')}>
        Procurement
      </button>
      {here && (
        <>
          <ChevronRight size={11} />
          <b>{here}</b>
        </>
      )}
    </span>
  );
};

export const ProcurementSuite: React.FC = () => {
  const { procurement } = useCommercial();
  const ext = useProcurementExt();
  const xp = ext.page?.page;
  useEffect(() => {
    document.getElementById('main-content')?.scrollTo({ top: 0 });
  }, [procurement.page, xp]);
  if (xp)
    return (
      <div className="sx-suite" key={`x-${xp}`}>
        {xp === 'sourcing' && <SourcingPage />}
        {xp === 'portal' && <SupplierPortalPage />}
        {xp === 'vendors' && <VendorsPage />}
        {xp === 'contracts' && <ContractsPage />}
        {xp === 'catalogue' && <CataloguePage />}
        {xp === 'invoices' && <InvoicesPage />}
        {xp === 'inventory' && <InventoryPage />}
        {xp === 'stores' && <StoresPage />}
        {xp === 'landed' && <LandedPage />}
        {xp === 'plan' && <PlanPage />}
        {xp === 'reports' && <ReportsPage />}
        {xp === 'settings' && <SettingsPage />}
      </div>
    );
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
