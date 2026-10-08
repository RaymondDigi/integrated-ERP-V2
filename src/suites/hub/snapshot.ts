import { useApp } from '../../context/AppContext';
import { useFinance } from '../finance/store';
import { useCommercial } from '../commercial/store';
import { useOperations } from '../operations/store';
import { useControl } from '../control/store';
import { ageing, cashPosition, profitAndLoss, round2, TODAY } from '../finance/engine';
import { needsReorder, pipelineStats } from '../commercial/engine';
import { poLate } from '../commercial/engine';
import { vehicleAlerts } from '../operations/engine';
import { rating, riskScore, slaState } from '../control/engine';

/** One snapshot of the whole business, built from every module's live data. */
export const useSnapshot = () => {
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

