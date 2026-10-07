import { useApp, type NavigationTarget } from '../../context/AppContext';
import { useFinance, type FinancePage } from '../finance/store';
import { useCommercial } from '../commercial/store';
import { useOperations } from '../operations/store';
import { useControl } from '../control/store';
import { docValue, permissions, ROLE_LABEL as FIN_ROLE } from '../finance/engine';
import { approvalRights, poStage, reqTotal } from '../commercial/engine';
import { woCost } from '../operations/engine';
import { REQUEST_APPROVERS } from '../../context/essState';

export interface InboxItem {
  id: string;
  module: string;
  view: NavigationTarget;
  number: string;
  title: string;
  value?: number;
  since: string;
  waitingFor: string;
  /** The person currently selected in that module can act now. */
  canAct: boolean;
  actingAs: string;
  approve?: () => void;
  open: () => void;
}

/** Every decision waiting anywhere in the hub, with a way to act on it or open it. */
export const useInbox = () => {
  const { setCurrentView, leaveRequests, approveLeaveRequest, activeTenant, essRequests, hrEmployees, setModuleTab } = useApp();
  const fin = useFinance();
  const com = useCommercial();
  const ops = useOperations();
  const ctl = useControl();
  const items: InboxItem[] = [];
  const go = (view: NavigationTarget, nav: () => void) => () => {
    nav();
    setCurrentView(view);
  };

  /* Finance documents waiting for approval or posting */
  const finDocs = [
    ...fin.state.documents.map((d) => ({ d, collection: 'documents' as const, page: (d.kind === 'INVOICE' ? 'invoices' : 'bills') as FinancePage, kind: d.kind === 'INVOICE' ? 'Sales invoice' : 'Supplier bill' })),
    ...fin.state.settlements.map((d) => ({ d, collection: 'settlements' as const, page: (d.kind === 'RECEIPT' ? 'receipts' : 'payments') as FinancePage, kind: d.kind === 'RECEIPT' ? 'Receipt' : 'Supplier payment' })),
    ...fin.state.journals.map((d) => ({ d, collection: 'journals' as const, page: 'journals' as FinancePage, kind: 'Journal' }))
  ];
  for (const { d, collection, page, kind } of finDocs) {
    if (d.status !== 'SUBMITTED' && d.status !== 'APPROVED') continue;
    const p = permissions(fin.state, d, fin.actor);
    const posting = d.status === 'APPROVED';
    const needDirector = p.needed > 1 && d.approvals.length === 1;
    items.push({
      id: d.id,
      module: 'Finance',
      view: 'finance',
      number: d.number,
      title: `${kind}${'memo' in d ? ` — ${d.memo}` : ''}`,
      value: docValue(d),
      since: d.history[d.history.length - 1]?.at.slice(0, 10) ?? d.date,
      waitingFor: posting ? 'Posting by a Finance Manager' : needDirector ? FIN_ROLE.DIRECTOR : `${FIN_ROLE.MANAGER} or Director`,
      canAct: posting ? p.post : p.approve,
      actingAs: `${fin.actor.name} (${fin.actor.title})`,
      approve: () => fin.transition(collection, d.id, posting ? 'post' : 'approve'),
      open: go('finance', () => fin.setPage(page, d.id))
    });
  }

  /* Trading and procurement */
  for (const o of com.state.orders.filter((x) => x.status === 'SUBMITTED')) {
    const v = com.orderValue(o);
    const r = approvalRights(o, v, com.actor);
    items.push({ id: o.id, module: 'Trading', view: 'trading', number: o.number, title: `Sales order — ${com.party(o.customerId)?.name}`, value: v, since: o.date, waitingFor: r.needed > 1 && o.approvals.length ? 'Finance Director' : 'Commercial Manager', canAct: r.can, actingAs: `${com.actor.name} (${com.actor.title})`, approve: () => com.approveOrder(o.id), open: go('trading', () => com.setTrading('orders', o.id)) });
  }
  for (const q of com.state.requisitions.filter((x) => x.status === 'SUBMITTED')) {
    const v = reqTotal(q);
    const r = approvalRights(q, v, com.actor);
    items.push({ id: q.id, module: 'Procurement', view: 'procurement', number: q.number, title: `Requisition — ${q.department}: ${q.lines.map((l) => l.description).join(', ')}`, value: v, since: q.date, waitingFor: r.needed > 1 && q.approvals.length ? 'Finance Director' : 'Commercial Manager', canAct: r.can, actingAs: `${com.actor.name} (${com.actor.title})`, approve: () => com.approveRequisition(q.id), open: go('procurement', () => com.setProcurement('requisitions', q.id)) });
  }
  for (const o of com.state.purchaseOrders.filter((x) => x.status === 'SUBMITTED' || poStage(x) === 'TO_SEND')) {
    const v = com.poValue(o);
    const sending = o.status === 'APPROVED';
    const r = approvalRights(o, v, com.actor);
    items.push({
      id: o.id,
      module: 'Procurement',
      view: 'procurement',
      number: o.number,
      title: `${sending ? 'Send purchase order' : 'Purchase order'} — ${com.party(o.supplierId)?.name}`,
      value: v,
      since: o.date,
      waitingFor: sending ? 'Purchasing to send it' : r.needed > 1 && o.approvals.length ? 'Finance Director' : 'Commercial Manager',
      canAct: sending ? true : r.can,
      actingAs: `${com.actor.name} (${com.actor.title})`,
      approve: () => (sending ? com.sendPO(o.id) : com.approvePO(o.id)),
      open: go('procurement', () => com.setProcurement('orders', o.id))
    });
  }

  /* Operations */
  const opsManager = ops.actor.role === 'MANAGER';
  for (const c of ops.state.counts.filter((x) => x.status === 'SUBMITTED'))
    items.push({ id: c.id, module: 'Warehousing', view: 'warehousing', number: c.number, title: `Stock count — ${ops.state.warehouses.find((w) => w.id === c.warehouse)?.name}`, since: c.date, waitingFor: 'Operations Manager', canAct: opsManager && c.countedBy !== ops.actor.name, actingAs: `${ops.actor.name} (${ops.actor.title})`, open: go('warehousing', () => ops.setWarehousing('counts', c.id)) });
  for (const b of ops.state.batches.filter((x) => x.status === 'PLANNED'))
    items.push({ id: b.id, module: 'Production', view: 'production', number: b.number, title: `Release batch — ${ops.state.recipes.find((r) => r.id === b.recipeId)?.name}`, since: b.date, waitingFor: 'Operations Manager', canAct: opsManager, actingAs: `${ops.actor.name} (${ops.actor.title})`, approve: () => ops.releaseBatch(b.id), open: go('production', () => ops.setProduction('batches', b.id)) });
  for (const b of ops.state.batches.filter((x) => x.status === 'QC'))
    items.push({ id: `q${b.id}`, module: 'Production', view: 'production', number: b.number, title: `Quality check — ${ops.state.recipes.find((r) => r.id === b.recipeId)?.name}`, since: b.date, waitingFor: 'Quality Controller', canAct: ops.actor.role === 'QC', actingAs: `${ops.actor.name} (${ops.actor.title})`, open: go('production', () => ops.setProduction('batches', b.id)) });
  for (const w of ops.state.workOrders.filter((x) => x.status === 'REQUESTED'))
    items.push({ id: w.id, module: 'Maintenance', view: 'maintenance', number: w.number, title: `Work order — ${w.title}`, value: woCost(w, ops.products) || undefined, since: w.date, waitingFor: 'Operations Manager', canAct: opsManager, actingAs: `${ops.actor.name} (${ops.actor.title})`, approve: () => ops.approveWorkOrder(w.id), open: go('maintenance', () => ops.setMaintenance('workorders', w.id)) });

  /* Quality and ICT */
  for (const c of ctl.state.capas.filter((x) => x.status === 'VERIFY'))
    items.push({ id: c.id, module: 'Quality', view: 'quality', number: c.number, title: `Verify corrective action — ${c.problem}`, since: c.due, waitingFor: 'QHSE Manager', canAct: ctl.actor.role === 'QHSE' && c.owner !== ctl.actor.name, actingAs: `${ctl.actor.name} (${ctl.actor.title})`, open: go('quality', () => ctl.setQuality('capa', c.id)) });
  for (const c of ctl.state.changes.filter((x) => x.status === 'SUBMITTED'))
    items.push({ id: c.id, module: 'ICT', view: 'ict', number: c.number, title: `Change — ${c.title}`, since: c.history[0]?.at.slice(0, 10) ?? '', waitingFor: 'ICT Manager (change board)', canAct: ctl.actor.role === 'ICT_MANAGER' && c.requestedBy !== ctl.actor.name, actingAs: `${ctl.actor.name} (${ctl.actor.title})`, approve: () => ctl.decideChange(c.id, true, ''), open: go('ict', () => ctl.setIct('changes', c.id)) });

  /* People & payroll — leave waiting for a line manager */
  for (const l of leaveRequests.filter((x) => x.status === 'PENDING_APPROVAL' && x.orgId === activeTenant.id))
    items.push({ id: l.id, module: 'People & Payroll', view: 'leave', number: l.id.toUpperCase(), title: `${l.leaveType} — ${l.staffName}, ${l.daysCount} days`, since: l.appliedOn ?? l.startDate, waitingFor: l.approverName ?? 'Line manager', canAct: true, actingAs: 'HR administrator', approve: () => approveLeaveRequest(l.id, 'Approved from the Approval Center'), open: () => setCurrentView('leave') });

  /* People & payroll — requests raised in the employee portal */
  for (const r of essRequests.filter((x) => x.status === 'Submitted' || (x.status === 'In Review' && !['Resignation', 'Training Request'].includes(x.type)))) {
    const e = hrEmployees.find((x) => x.staffId === r.staffId);
    if (e && e.orgId !== activeTenant.id && r.staffId !== 'KHE-0102') continue;
    items.push({
      id: r.id,
      module: 'People & Payroll',
      view: 'employees',
      number: r.id,
      title: `${r.type} — ${e?.fullName ?? r.staffId}${r.details ? `: ${r.details.slice(0, 60)}` : ''}`,
      value: r.amountKes,
      since: r.submittedOn,
      waitingFor: REQUEST_APPROVERS[r.type].join(' or '),
      canAct: false,
      actingAs: 'Decided in Employee Master › Employee requests',
      open: () => {
        setModuleTab('employees', 'requests');
        setCurrentView('employees');
      }
    });
  }

  return items.sort((a, b) => Number(b.canAct) - Number(a.canAct) || a.since.localeCompare(b.since));
};
