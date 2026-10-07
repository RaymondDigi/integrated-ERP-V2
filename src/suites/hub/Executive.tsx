import React from 'react';
import {
  LayoutDashboard,
  ChartNoAxesCombined,
  Landmark,
  HandCoins,
  TrendingUp,
  ShoppingBag,
  Target,
  Factory,
  Boxes,
  Ship,
  Truck,
  Wrench,
  Users,
  ShieldAlert,
  MonitorCog,
  CalendarDays,
  Inbox,
  AlertTriangle,
  Wallet
} from 'lucide-react';
import { useApp, type NavigationTarget } from '../../context/AppContext';
import { useHub, type ExecutivePage } from './store';
import { useInbox } from './useInbox';
import { useFinance } from '../finance/store';
import { useCommercial } from '../commercial/store';
import { useOperations } from '../operations/store';
import { useControl } from '../control/store';
import { addDays, ageing, cashPosition, monthlySeries, profitAndLoss, round2, TODAY } from '../finance/engine';
import { kes } from '../finance/engine';
import { needsReorder, orderStage, pipelineStats, STAGE_LABEL, OPEN_STAGES, totals } from '../commercial/engine';
import { poLate } from '../commercial/engine';
import { shipValue, vehicleAlerts } from '../operations/engine';
import { rating, riskScore, slaState } from '../control/engine';
import { Bars, Donut, Hero, LinkButton, Meter, Panel, Stat, TodoList, greeting, type TodoItem } from '../ui/kit';
import { SuiteSidebar, type SuiteNavGroup } from '../ui/SuiteSidebar';
import { Crumb, useTopOnChange } from '../operations/parts';

const LABEL: Record<ExecutivePage, string> = { overview: 'Business overview', analytics: 'Analytics' };

/** One snapshot of the whole business, built from every module's live data. */
const useSnapshot = () => {
  const { hrEmployees, leaveRequests, activeTenant } = useApp();
  const fin = useFinance();
  const com = useCommercial();
  const ops = useOperations();
  const ctl = useControl();
  const year = Number(TODAY.slice(0, 4));
  const pl = profitAndLoss(fin.state, fin.entries, `${year}-01-01`, TODAY);
  const cash = round2(cashPosition(fin.state, fin.entries).reduce((s, c) => s + c.balance, 0));
  const ar = ageing(fin.state, 'INVOICE');
  const ap = ageing(fin.state, 'BILL');
  const book = com.state.orders.filter((o) => o.status === 'APPROVED' && !o.closed);
  const pipe = pipelineStats(com.state);
  const stockValue = round2(com.state.products.reduce((s, p) => s + p.stock * p.cost, 0));
  const month = TODAY.slice(0, 7);
  const output = ops.state.batches.filter((b) => b.status === 'COMPLETED' && b.date.slice(0, 7) === month).reduce((s, b) => s + b.output, 0);
  const onWater = ops.state.shipments.filter((s) => s.stage === 'DEPARTED');
  const staff = hrEmployees.filter((e) => e.orgId === activeTenant.id && e.status !== 'TERMINATED');
  return {
    fin,
    com,
    ops,
    ctl,
    pl,
    cash,
    ar,
    ap,
    book,
    bookValue: round2(book.reduce((s, o) => s + com.orderValue(o), 0)),
    pipe,
    stockValue,
    output,
    onWater,
    staff,
    payroll: round2(staff.reduce((s, e) => s + (e.basicSalaryKes || 0), 0)),
    leavePending: leaveRequests.filter((l) => l.orgId === activeTenant.id && l.status === 'PENDING_APPROVAL').length,
    lowStock: com.state.products.filter((p) => p.kind !== 'SERVICE' && needsReorder(com.state, p)),
    downAssets: ops.state.equipment.filter((e) => e.status === 'DOWN'),
    openWo: ops.state.workOrders.filter((w) => !['COMPLETED', 'CANCELLED'].includes(w.status)),
    fleetReady: ops.state.vehicles.filter((v) => v.status !== 'IN_WORKSHOP').length,
    highRisks: ctl.state.risks.filter((r) => rating(riskScore(r)) === 'HIGH'),
    slaRisk: ctl.state.tickets.filter((t) => t.status !== 'RESOLVED' && slaState(t).used > 0.75),
    overdueFilings: ctl.state.obligations.filter((o) => o.status === 'DUE' && o.due < TODAY),
    lateSupplies: com.state.purchaseOrders.filter((o) => poLate(o)),
    vehicleAlerts: ops.state.vehicles.flatMap((v) => vehicleAlerts(v).map((a) => `${v.reg}: ${a}`))
  };
};

const ExecutiveOverview: React.FC = () => {
  const { setCurrentView } = useApp();
  const { setExecutive } = useHub();
  const s = useSnapshot();
  const inbox = useInbox();
  const go = (view: NavigationTarget, nav?: () => void) => () => {
    nav?.();
    setCurrentView(view);
  };
  const margin = s.pl.totalIncome ? (s.pl.netProfit / s.pl.totalIncome) * 100 : 0;
  const arOverdue = round2(s.ar.total - s.ar.totals[0]);
  const flags: TodoItem[] = [
    ...(arOverdue > 0 ? [{ id: 'ar', tone: 'warning' as const, icon: <HandCoins size={15} />, title: `${kes(arOverdue, { compact: true })} owed by customers is overdue`, detail: `${Math.round((arOverdue / Math.max(1, s.ar.total)) * 100)}% of receivables`, onClick: go('finance', () => s.fin.setPage('invoices')) }] : []),
    ...s.overdueFilings.map((o) => ({ id: o.id, tone: 'critical' as const, icon: <CalendarDays size={15} />, title: `Overdue filing: ${o.name}`, detail: `${o.authority} — penalties accrue daily`, onClick: go('governance', () => s.ctl.setGovernance('calendar')) })),
    ...s.downAssets.map((e) => ({ id: e.id, tone: 'critical' as const, icon: <Wrench size={15} />, title: `${e.name} is down`, detail: e.area, onClick: go('maintenance', () => s.ops.setMaintenance('overview')) })),
    ...s.highRisks.map((r) => ({ id: r.id, tone: 'warning' as const, icon: <ShieldAlert size={15} />, title: `High risk: ${r.title}`, detail: `Owner ${r.owner}`, onClick: go('quality', () => s.ctl.setQuality('risks', r.id)) })),
    ...s.lowStock.map((p) => ({ id: p.sku, tone: 'warning' as const, icon: <Boxes size={15} />, title: `${p.name} below reorder level`, detail: `${p.stock} ${p.unit} left`, onClick: go(p.kind === 'MATERIAL' ? 'procurement' : 'trading', () => (p.kind === 'MATERIAL' ? s.com.setProcurement('stock') : s.com.setTrading('products'))) })),
    ...s.lateSupplies.map((o) => ({ id: o.id, tone: 'info' as const, icon: <Truck size={15} />, title: `${o.number} is late from ${s.com.party(o.supplierId)?.name}`, detail: 'Chase the supplier', onClick: go('procurement', () => s.com.setProcurement('orders', o.id)) })),
    ...s.slaRisk.map((t) => ({ id: t.id, tone: 'info' as const, icon: <MonitorCog size={15} />, title: `ICT ${t.priority}: ${t.title}`, detail: 'Close to or past its service level', onClick: go('ict', () => s.ctl.setIct('tickets', t.id)) }))
  ];
  return (
    <div className="sx-page">
      <Hero
        eyebrow={`${greeting()} · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        title="Business overview"
        text={`${inbox.length} decisions waiting · ${flags.length} things to watch · live from every module`}
        actions={[
          { label: `Approval Center (${inbox.filter((i) => i.canAct).length})`, icon: <Inbox size={16} />, onClick: go('approvals') },
          { label: 'Analytics', icon: <ChartNoAxesCombined size={16} />, onClick: () => setExecutive('analytics') }
        ]}
      />
      <h3 className="sx-section-title">Money</h3>
      <div className="sx-stats">
        <Stat label="Cash in bank" value={kes(s.cash, { compact: true })} icon={<Landmark size={17} />} onClick={go('finance', () => s.fin.setPage('bank'))} />
        <Stat label="Revenue this year" value={kes(s.pl.totalIncome, { compact: true })} detail={`Net profit ${kes(s.pl.netProfit, { compact: true })} · ${margin.toFixed(1)}%`} icon={<TrendingUp size={17} />} tone="blue" onClick={go('finance', () => s.fin.setPage('reports'))} />
        <Stat label="Customers owe us" value={kes(s.ar.total, { compact: true })} detail={<span className={arOverdue ? 'sx-danger-text' : ''}>{kes(arOverdue, { compact: true })} overdue</span>} icon={<HandCoins size={17} />} tone="gold" onClick={go('finance', () => s.fin.setPage('invoices'))} />
        <Stat label="We owe suppliers" value={kes(s.ap.total, { compact: true })} icon={<Wallet size={17} />} tone="violet" onClick={go('finance', () => s.fin.setPage('bills'))} />
      </div>
      <h3 className="sx-section-title">Customers and sales</h3>
      <div className="sx-stats">
        <Stat label="Open order book" value={kes(s.bookValue, { compact: true })} detail={`${s.book.length} orders`} icon={<ShoppingBag size={17} />} onClick={go('trading', () => s.com.setTrading('orders'))} />
        <Stat label="To invoice" value={s.com.state.orders.filter((o) => orderStage(o) === 'TO_INVOICE').length} detail="Delivered, not invoiced" icon={<HandCoins size={17} />} tone="red" onClick={go('trading', () => s.com.setTrading('orders'))} />
        <Stat label="Weighted pipeline" value={kes(s.pipe.weighted, { compact: true })} detail={`${kes(s.pipe.openValue, { compact: true })} open`} icon={<Target size={17} />} tone="blue" onClick={go('bizdev', () => s.com.setBizdev('pipeline'))} />
        <Stat label="Win rate" value={`${Math.round(s.pipe.winRate * 100)}%`} detail="This year" icon={<TrendingUp size={17} />} tone="violet" onClick={go('bizdev', () => s.com.setBizdev('overview'))} />
      </div>
      <h3 className="sx-section-title">Operations</h3>
      <div className="sx-stats">
        <Stat label="Produced this month" value={s.output.toLocaleString()} detail="Good units" icon={<Factory size={17} />} onClick={go('production', () => s.ops.setProduction('overview'))} />
        <Stat label="Stock at cost" value={kes(s.stockValue, { compact: true })} detail={`${s.lowStock.length} items to reorder`} icon={<Boxes size={17} />} tone="blue" onClick={go('warehousing', () => s.ops.setWarehousing('stock'))} />
        <Stat label="On the water" value={kes(round2(s.onWater.reduce((x, sh) => x + shipValue(sh), 0)), { compact: true })} detail={`${s.onWater.length} shipments`} icon={<Ship size={17} />} tone="gold" onClick={go('shipping', () => s.ops.setShipping('shipments'))} />
        <Stat label="Fleet available" value={`${s.fleetReady}/${s.ops.state.vehicles.length}`} detail={`${s.openWo.length} open work orders`} icon={<Truck size={17} />} tone="violet" onClick={go('fleet', () => s.ops.setFleet('overview'))} />
      </div>
      <h3 className="sx-section-title">People and control</h3>
      <div className="sx-stats">
        <Stat label="Headcount" value={s.staff.length} detail={`${kes(s.payroll, { compact: true })} monthly basic pay`} icon={<Users size={17} />} onClick={go('employees')} />
        <Stat label="Leave to approve" value={s.leavePending} icon={<CalendarDays size={17} />} tone="blue" onClick={go('leave')} />
        <Stat label="High risks" value={s.highRisks.length} detail={`${s.ctl.state.capas.filter((c) => c.status !== 'CLOSED').length} corrective actions open`} icon={<ShieldAlert size={17} />} tone="gold" onClick={go('quality', () => s.ctl.setQuality('risks'))} />
        <Stat label="Overdue filings" value={s.overdueFilings.length} detail="Statutory calendar" icon={<CalendarDays size={17} />} tone={s.overdueFilings.length ? 'red' : 'green'} onClick={go('governance', () => s.ctl.setGovernance('calendar'))} />
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title={<>Watch list {flags.length > 0 && <span className="sx-count">{flags.length}</span>}</>} subtitle="Red flags from across the business">
          <TodoList items={flags} max={10} />
        </Panel>
        <Panel title="Decisions waiting" subtitle="By module" action={<LinkButton onClick={go('approvals')}>Approval Center</LinkButton>}>
          <ul className="sx-barlist">
            {[...new Set(inbox.map((i) => i.module))].map((m) => {
              const n = inbox.filter((i) => i.module === m).length;
              return (
                <li key={m}>
                  <div>
                    <span>{m}</span>
                    <b>{n}</b>
                  </div>
                  <Meter value={n / Math.max(1, ...[...new Set(inbox.map((i) => i.module))].map((x) => inbox.filter((i) => i.module === x).length))} />
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
};

const Analytics: React.FC = () => {
  const s = useSnapshot();
  const { hrEmployees, activeTenant } = useApp();
  const year = Number(TODAY.slice(0, 4));
  const month = Number(TODAY.slice(5, 7));
  const series = monthlySeries(s.fin.state, s.fin.entries, year).slice(0, month);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = addDays(TODAY, -7 * (7 - i));
    const start = addDays(end, -6);
    const orders = s.com.state.orders.filter((o) => o.status === 'APPROVED' && o.date >= start && o.date <= end).reduce((x, o) => x + totals(o.lines, s.com.state.products, s.com.party(o.customerId)).net, 0);
    const made = s.ops.state.batches.filter((b) => b.status === 'COMPLETED' && b.date >= start && b.date <= end).reduce((x, b) => x + b.output, 0);
    return { label: `${new Date(end + 'T00:00:00').getDate()}/${new Date(end + 'T00:00:00').getMonth() + 1}`, orders, made };
  });
  const byCat: Record<string, number> = {};
  for (const p of s.com.state.products) if (p.kind !== 'SERVICE') byCat[p.category] = round2((byCat[p.category] ?? 0) + p.stock * p.cost);
  const COLORS = ['#237857', '#65a586', '#ddbd72', '#749ca0', '#8b76aa', '#c98f6b', '#b9d5c3'];
  const depts: Record<string, number> = {};
  for (const e of hrEmployees.filter((x) => x.orgId === activeTenant.id && x.status !== 'TERMINATED')) depts[e.department] = (depts[e.department] ?? 0) + 1;
  const deptMax = Math.max(1, ...Object.values(depts));
  const funnel = OPEN_STAGES.map((st) => ({ st, v: round2(s.com.state.opportunities.filter((o) => o.stage === st).reduce((x, o) => x + o.value, 0)) }));
  const funnelMax = Math.max(1, ...funnel.map((f) => f.v));
  return (
    <div className="sx-page">
      <Hero eyebrow="Analytics" title="Trends across the business" text="Every chart is calculated from the live records in each module." />
      <div className="sx-row sx-row-wide">
        <Panel title="Revenue and expenses" subtitle={`Each month of ${year}`}>
          <Bars data={series.map((m) => ({ label: m.label, values: [m.revenue, m.expenses] }))} series={[{ name: 'Revenue', color: '#237857' }, { name: 'Expenses', color: '#b9d5c3' }]} format={(n) => kes(n, { compact: true }).replace('KES ', '')} />
        </Panel>
        <Panel title="Profit by month" subtitle="Net of all costs">
          <ul className="sx-barlist">
            {series.map((m) => (
              <li key={m.key}>
                <div>
                  <span>{m.label}</span>
                  <b className={m.profit < 0 ? 'sx-danger-text' : ''}>{kes(m.profit, { compact: true })}</b>
                </div>
                <Meter value={Math.abs(m.profit) / Math.max(1, ...series.map((x) => Math.abs(x.profit)))} tone={m.profit < 0 ? 'red' : 'green'} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <div className="sx-row">
        <Panel title="Orders in, goods made" subtitle="Weekly order value against units produced">
          <Bars data={weeks.map((w) => ({ label: w.label, values: [w.orders / 1000] }))} series={[{ name: 'Orders (KES thousands)', color: '#237857' }]} height={180} />
          <Bars data={weeks.map((w) => ({ label: w.label, values: [w.made] }))} series={[{ name: 'Units produced', color: '#ddbd72' }]} height={160} />
        </Panel>
        <Panel title="Stock value by category" subtitle="At cost">
          <Donut items={Object.entries(byCat).map(([label, value], i) => ({ label, value, color: COLORS[i % COLORS.length] }))} center={kes(s.stockValue, { compact: true }).replace('KES ', '')} caption="stock" />
        </Panel>
        <Panel title="Sales pipeline" subtitle="Open value by stage">
          <ul className="sx-barlist">
            {funnel.map((f) => (
              <li key={f.st}>
                <div>
                  <span>{STAGE_LABEL[f.st]}</span>
                  <b>{kes(f.v, { compact: true })}</b>
                </div>
                <Meter value={f.v / funnelMax} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <div className="sx-row">
        <Panel title="Headcount by department" subtitle="From People & Payroll">
          <ul className="sx-barlist">
            {Object.entries(depts)
              .sort((a, b) => b[1] - a[1])
              .map(([d, n]) => (
                <li key={d}>
                  <div>
                    <span>{d}</span>
                    <b>{n}</b>
                  </div>
                  <Meter value={n / deptMax} />
                </li>
              ))}
          </ul>
        </Panel>
        <Panel title="Receivables by age" subtitle="What customers owe">
          <Donut items={['Not due', '1–30', '31–60', '61–90', '90+'].map((label, i) => ({ label, value: s.ar.totals[i], color: ['#237857', '#ddbd72', '#e39b5b', '#d4704f', '#b5443a'][i] }))} center={kes(s.ar.total, { compact: true }).replace('KES ', '')} caption="owed" />
        </Panel>
        <Panel title="Watch indicators" subtitle="Counts that should trend to zero">
          <ul className="sx-facts">
            <li>
              <span>
                <AlertTriangle size={12} /> Items below reorder level
              </span>
              <b>{s.lowStock.length}</b>
            </li>
            <li>
              <span>Late supplier deliveries</span>
              <b>{s.lateSupplies.length}</b>
            </li>
            <li>
              <span>Assets down</span>
              <b>{s.downAssets.length}</b>
            </li>
            <li>
              <span>Vehicle compliance alerts</span>
              <b>{s.vehicleAlerts.length}</b>
            </li>
            <li>
              <span>ICT tickets at SLA risk</span>
              <b>{s.slaRisk.length}</b>
            </li>
            <li>
              <span>Overdue statutory filings</span>
              <b>{s.overdueFilings.length}</b>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
};

export const ExecutiveSidebar: React.FC = () => {
  const { executive, setExecutive } = useHub();
  const groups: SuiteNavGroup<ExecutivePage>[] = [
    {
      label: 'Business',
      items: [
        { id: 'overview', label: 'Business overview', icon: LayoutDashboard },
        { id: 'analytics', label: 'Analytics', icon: ChartNoAxesCombined }
      ]
    }
  ];
  return <SuiteSidebar name="Business Overview" tagline="The whole company at a glance" icon={LayoutDashboard} groups={groups} active={executive} onSelect={setExecutive} />;
};
export const ExecutiveCrumb: React.FC = () => {
  const { executive, setExecutive } = useHub();
  return <Crumb name="Business Overview" page={executive} label={LABEL[executive]} onHome={() => setExecutive('overview')} />;
};
export const ExecutiveSuite: React.FC = () => {
  const { executive } = useHub();
  useTopOnChange(executive);
  return (
    <div className="sx-suite" key={executive}>
      {executive === 'overview' && <ExecutiveOverview />}
      {executive === 'analytics' && <Analytics />}
    </div>
  );
};
