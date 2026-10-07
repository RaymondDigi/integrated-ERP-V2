import React, { useMemo, useState } from 'react';
import { Inbox, Scale, History, CheckCircle2, ArrowUpRight, LayoutGrid, Clock3, UserCheck } from 'lucide-react';
import { useHub, type WorkflowsPage } from './store';
import { useInbox } from './useInbox';
import { useFinance } from '../finance/store';
import { useCommercial } from '../commercial/store';
import { useOperations } from '../operations/store';
import { useControl } from '../control/store';
import { daysBetween, kes, TODAY } from '../finance/engine';
import { Chips, DataTable, SearchBox, Stat, SuitePage, type Column } from '../ui/kit';
import { SuiteSidebar, type SuiteNavGroup } from '../ui/SuiteSidebar';
import { Crumb, useTopOnChange } from '../operations/parts';
import type { InboxItem } from './useInbox';

const LABEL: Record<WorkflowsPage, string> = { inbox: 'Approval inbox', rules: 'Approval rules', activity: 'Activity across modules' };

const InboxPage: React.FC = () => {
  const items = useInbox();
  const [scope, setScope] = useState<'MINE' | 'ALL'>('MINE');
  const [mod, setMod] = useState('ALL');
  const [q, setQ] = useState('');
  const modules = [...new Set(items.map((i) => i.module))];
  const rows = items.filter((i) => (scope === 'ALL' || i.canAct) && (mod === 'ALL' || i.module === mod) && (!q || `${i.number} ${i.title}`.toLowerCase().includes(q.toLowerCase())));
  const oldest = items.reduce((m, i) => Math.max(m, daysBetween(i.since, TODAY)), 0);
  const value = items.reduce((s, i) => s + (i.value ?? 0), 0);
  const columns: Column<InboxItem>[] = [
    { key: 'm', header: 'Module', render: (i) => <span className="sx-tag sx-tag-strong">{i.module}</span>, sort: (i) => i.module, width: 130 },
    {
      key: 't',
      header: 'Waiting',
      render: (i) => (
        <div className="sx-cell-main">
          <span>
            <b className="sx-mono">{i.number}</b> {i.title}
          </span>
          <small>Needs {i.waitingFor}</small>
        </div>
      )
    },
    { key: 'v', header: 'Value', render: (i) => (i.value ? kes(i.value, { compact: true }) : '—'), sort: (i) => i.value ?? 0, align: 'right', hideOnMobile: true },
    { key: 'a', header: 'Age', render: (i) => { const d = daysBetween(i.since, TODAY); return <span className={d > 3 ? 'sx-danger-text' : ''}>{d <= 0 ? 'Today' : `${d} d`}</span>; }, sort: (i) => i.since, hideOnMobile: true },
    {
      key: 'x',
      header: '',
      render: (i) => (
        <div className="sx-row-actions" onClick={(e) => e.stopPropagation()}>
          {i.canAct && i.approve && (
            <button type="button" className="btn btn-primary btn-xs" onClick={i.approve}>
              <CheckCircle2 size={12} /> Approve
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-xs" onClick={i.open}>
            Open <ArrowUpRight size={12} />
          </button>
        </div>
      ),
      align: 'right',
      width: 200
    }
  ];
  return (
    <SuitePage eyebrow="Approval Center" title="Everything waiting for a decision" subtitle="One inbox across Finance, Trading, Procurement, Operations, Quality, ICT and People. Each module still enforces its own rules — who prepared it can never approve it.">
      <div className="sx-stats">
        <Stat label="Waiting across the business" value={items.length} detail={`${modules.length} modules`} icon={<Inbox size={17} />} onClick={() => setScope('ALL')} />
        <Stat label="You can act on now" value={items.filter((i) => i.canAct).length} detail="With the people selected in each module" icon={<UserCheck size={17} />} tone="blue" onClick={() => setScope('MINE')} />
        <Stat label="Value waiting" value={kes(value, { compact: true })} detail="Documents with an amount" icon={<Scale size={17} />} tone="gold" />
        <Stat label="Oldest item" value={`${oldest} days`} detail="Since it was submitted" icon={<Clock3 size={17} />} tone={oldest > 3 ? 'red' : 'green'} />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={scope}
          onChange={setScope}
          options={[
            { value: 'MINE', label: 'I can act', count: items.filter((i) => i.canAct).length },
            { value: 'ALL', label: 'Everything', count: items.length }
          ]}
        />
        <Chips value={mod} onChange={setMod} options={[{ value: 'ALL', label: 'All modules' }, ...modules.map((m) => ({ value: m, label: m, count: items.filter((i) => i.module === m && (scope === 'ALL' || i.canAct)).length }))]} />
        <SearchBox value={q} onChange={setQ} placeholder="Search…" />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(i) => i.module + i.id} onRowClick={(i) => i.open()} pageSize={15} empty={<div className="sx-allclear"><CheckCircle2 size={24} /><p>Nothing waiting for the people selected. Switch “Acting as” in a module to see their queue.</p></div>} />
    </SuitePage>
  );
};

const RULES: { area: string; document: string; rule: string; approver: string }[] = [
  { area: 'Finance', document: 'Invoices, bills, receipts, payments, journals', rule: 'Preparer cannot approve; up to KES 1M', approver: 'Finance Manager or Director' },
  { area: 'Finance', document: 'Any finance document above KES 1M', rule: 'Second approval', approver: 'Finance Director' },
  { area: 'Finance', document: 'Posting to the ledger', rule: 'After approval, into an open period only', approver: 'Finance Manager or Director' },
  { area: 'Finance', document: 'Reopen a closed month', rule: 'With a written reason', approver: 'Finance Director' },
  { area: 'Trading', document: 'Sales orders', rule: 'Automatic within credit limit, stock and ≤ 10% discount', approver: 'Commercial Manager otherwise' },
  { area: 'Trading', document: 'Sales orders above KES 1M', rule: 'Second approval', approver: 'Finance Director' },
  { area: 'Trading', document: 'Dispatch', rule: 'Not the person who raised the order', approver: 'Stores' },
  { area: 'Procurement', document: 'Requisitions and purchase orders', rule: 'Preparer cannot approve; above KES 1M needs two', approver: 'Commercial Manager, then Finance Director' },
  { area: 'Procurement', document: 'Award to a supplier that is not the cheapest', rule: 'Written reason on file', approver: 'Purchasing' },
  { area: 'Procurement', document: 'Goods received', rule: 'Not the person who raised the order', approver: 'Stores' },
  { area: 'Warehousing', document: 'Stock count adjustments', rule: 'Counter cannot approve; explanation required', approver: 'Operations Manager' },
  { area: 'Production', document: 'Batch release / quality release', rule: 'Release before materials are issued; QC before stock', approver: 'Operations Manager / Quality Controller' },
  { area: 'Maintenance', document: 'Work orders', rule: 'Urgent breakdowns approved automatically', approver: 'Operations Manager' },
  { area: 'Quality', document: 'Corrective action closure', rule: 'Owner cannot verify their own action', approver: 'QHSE Manager' },
  { area: 'ICT', document: 'Changes to live systems', rule: 'Requester cannot approve; back-out plan required', approver: 'ICT Manager' },
  { area: 'People & Payroll', document: 'Leave requests', rule: 'Within the leave balance', approver: 'Line manager' }
];

const RulesPage: React.FC = () => (
  <SuitePage eyebrow="Workflows" title="Approval rules" subtitle="The delegation of authority enforced across the hub.">
    <div className="sx-table-wrap">
      <div className="sx-table-scroll">
        <table className="sx-table">
          <thead>
            <tr>
              <th>Area</th>
              <th>Document</th>
              <th>Rule</th>
              <th>Who approves</th>
            </tr>
          </thead>
          <tbody>
            {RULES.map((r, i) => (
              <tr key={i}>
                <td>
                  <span className="sx-tag sx-tag-strong">{r.area}</span>
                </td>
                <td>{r.document}</td>
                <td className="sx-muted">{r.rule}</td>
                <td>
                  <b>{r.approver}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </SuitePage>
);

const ActivityPage: React.FC = () => {
  const fin = useFinance();
  const com = useCommercial();
  const ops = useOperations();
  const ctl = useControl();
  const [q, setQ] = useState('');
  const all = useMemo(() => {
    const out: { at: string; by: string; action: string; module: string; ref: string; note?: string }[] = [];
    const add = (module: string, ref: string, hist: { at: string; by: string; action: string; note?: string }[]) => hist.forEach((h) => out.push({ ...h, module, ref }));
    [...fin.state.documents, ...fin.state.settlements, ...fin.state.journals].forEach((d) => add('Finance', d.number, d.history));
    com.state.orders.forEach((d) => add('Trading', d.number, d.history));
    com.state.quotations.forEach((d) => add('Trading', d.number, d.history));
    com.state.requisitions.forEach((d) => add('Procurement', d.number, d.history));
    com.state.purchaseOrders.forEach((d) => add('Procurement', d.number, d.history));
    ops.state.batches.forEach((d) => add('Production', d.number, d.history));
    ops.state.workOrders.forEach((d) => add('Maintenance', d.number, d.history));
    ops.state.transfers.forEach((d) => add('Warehousing', d.number, d.history));
    ops.state.shipments.forEach((d) => add('Shipping', d.number, d.history));
    ctl.state.capas.forEach((d) => add('Quality', d.number, d.history));
    ctl.state.changes.forEach((d) => add('ICT', d.number, d.history));
    return out.filter((x) => x.by !== 'System').sort((a, b) => b.at.localeCompare(a.at));
  }, [fin.state, com.state, ops.state, ctl.state]);
  const rows = all.filter((x) => !q || `${x.by} ${x.action} ${x.ref} ${x.module}`.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  type Row = (typeof all)[number];
  const columns: Column<Row>[] = [
    { key: 'w', header: 'When', render: (x) => new Date(x.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }), sort: (x) => x.at, width: 140 },
    { key: 'm', header: 'Module', render: (x) => <span className="sx-tag sx-tag-strong">{x.module}</span>, sort: (x) => x.module, width: 120 },
    { key: 'r', header: 'Record', render: (x) => <b className="sx-mono">{x.ref}</b>, width: 140 },
    {
      key: 'a',
      header: 'What happened',
      render: (x) => (
        <div className="sx-cell-main">
          <span>{x.action}</span>
          {x.note && <small>{x.note}</small>}
        </div>
      )
    },
    { key: 'b', header: 'By', render: (x) => x.by, sort: (x) => x.by, hideOnMobile: true }
  ];
  return (
    <SuitePage eyebrow="Workflows" title="Activity across modules" subtitle="A single audit trail of who did what, everywhere in the hub.">
      <div className="sx-toolbar">
        <span className="sx-note">{all.length} recorded actions</span>
        <SearchBox value={q} onChange={setQ} placeholder="Search people, records, actions…" />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(x) => x.at + x.ref + x.action} initialSort={{ key: 'w', dir: 'desc' }} pageSize={20} />
    </SuitePage>
  );
};

export const ApprovalsSidebar: React.FC = () => {
  const { workflows, setWorkflows } = useHub();
  const items = useInbox();
  const groups: SuiteNavGroup<WorkflowsPage>[] = [
    {
      label: 'Workflows',
      items: [
        { id: 'inbox', label: 'Approval inbox', icon: Inbox, badge: items.filter((i) => i.canAct).length },
        { id: 'rules', label: 'Approval rules', icon: Scale },
        { id: 'activity', label: 'Activity', icon: History }
      ]
    }
  ];
  return <SuiteSidebar name="Approval Center" tagline="Decide · delegate · audit" icon={LayoutGrid} groups={groups} active={workflows} onSelect={setWorkflows} />;
};
export const ApprovalsCrumb: React.FC = () => {
  const { workflows, setWorkflows } = useHub();
  return <Crumb name="Approval Center" page={workflows === 'inbox' ? 'overview' : workflows} label={LABEL[workflows]} onHome={() => setWorkflows('inbox')} />;
};
export const ApprovalsSuite: React.FC = () => {
  const { workflows } = useHub();
  useTopOnChange(workflows);
  return (
    <div className="sx-suite" key={workflows}>
      {workflows === 'inbox' && <InboxPage />}
      {workflows === 'rules' && <RulesPage />}
      {workflows === 'activity' && <ActivityPage />}
    </div>
  );
};

