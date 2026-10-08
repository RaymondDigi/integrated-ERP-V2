import React, { useState } from 'react';
import { LayoutDashboard, MonitorCog, Ticket as TicketIcon, Laptop, GitPullRequestArrow, Plus, Clock3, AlertTriangle, CheckCircle2, Hand, Pause, Plug, RefreshCw, PlayCircle, PauseCircle, Activity, KeyRound, XCircle } from 'lucide-react';
import { useControl, type IctPage } from './store';
import { fmtHours, SLA, slaState } from './engine';
import { daysBetween, fmtDate, kes, TODAY } from '../finance/engine';
import type { Change, ItAsset, Ticket } from './types';
import { Chips, DataTable, DefList, Drawer, Field, Hero, LinkButton, Meter, Modal, Panel, Pill, Stat, SuitePage, Timeline, TodoList, greeting, type Column, type TodoItem } from '../ui/kit';
import { SuiteSidebar, type SuiteNavGroup } from '../ui/SuiteSidebar';
import { Crumb, useTopOnChange } from '../operations/parts';
import { CtlFooter, useCtlFocus } from './parts';
import { LogisticsIntegrations } from './integrations/LogisticsIntegrations';

const LABEL: Record<IctPage, string> = { overview: 'Overview', tickets: 'Tickets', assets: 'Assets & licences', changes: 'Changes' };
const P_PILL: Record<string, string> = { P1: 'REJECTED', P2: 'OVERDUE', P3: 'SUBMITTED', P4: 'DRAFT' };
const T_LABEL: Record<Ticket['status'], [string, string]> = { NEW: ['SUBMITTED', 'New'], IN_PROGRESS: ['OPEN', 'In progress'], WAITING: ['DRAFT', 'Waiting'], RESOLVED: ['POSTED', 'Resolved'] };
const ago = (iso: string) => fmtHours((Date.now() - new Date(iso).getTime()) / 3_600_000);

const SlaCell: React.FC<{ t: Ticket }> = ({ t }) => {
  const s = slaState(t);
  if (t.status === 'RESOLVED') return s.resolveBreached ? <Pill status="REJECTED" label="Breached" /> : <Pill status="POSTED" label="Met" />;
  return (
    <div className="sx-meter-cell">
      <Meter value={s.used} tone={s.used >= 1 ? 'red' : s.used > 0.75 ? 'gold' : 'green'} />
      <small className={s.left < 0 ? 'sx-danger-text' : ''}>{s.left < 0 ? fmtHours(s.left) : `${fmtHours(s.left)} left`}</small>
    </div>
  );
};

const IOverview: React.FC = () => {
  const { state, actor, setIct: go } = useControl();
  const open = state.tickets.filter((t) => t.status !== 'RESOLVED');
  const breaching = open.filter((t) => slaState(t).resolveBreached || slaState(t).used > 0.75);
  const resolved = state.tickets.filter((t) => t.status === 'RESOLVED');
  const met = resolved.filter((t) => !slaState(t).resolveBreached);
  const renewals = state.licences.filter((l) => daysBetween(TODAY, l.renewal) <= 30);
  const todo: TodoItem[] = [
    ...open
      .filter((t) => !t.assignee)
      .map((t) => ({ id: t.id, tone: (t.priority === 'P1' || t.priority === 'P2' ? 'critical' : 'warning') as TodoItem['tone'], icon: <TicketIcon size={15} />, title: `${t.priority} unassigned: ${t.title}`, detail: `${t.requester} · logged ${ago(t.created)} ago`, onClick: () => go('tickets', t.id) })),
    ...breaching.filter((t) => t.assignee).map((t) => ({ id: `b${t.id}`, tone: 'critical' as const, icon: <Clock3 size={15} />, title: `${t.number} ${slaState(t).resolveBreached ? 'breached its SLA' : 'close to SLA breach'}`, detail: t.title, onClick: () => go('tickets', t.id) })),
    ...state.changes.filter((c) => c.status === 'SUBMITTED').map((c) => ({ id: c.id, tone: 'warning' as const, icon: <GitPullRequestArrow size={15} />, title: `Change board: ${c.title}`, detail: `${c.risk.toLowerCase()} risk · ${c.window}`, onClick: () => go('changes', c.id) })),
    ...renewals.map((l) => ({ id: l.id, tone: 'info' as const, icon: <KeyRound size={15} />, title: `Renew ${l.name}`, detail: `${daysBetween(TODAY, l.renewal)} days · ${kes(l.annualCost, { compact: true })}`, onClick: () => go('assets') }))
  ];
  return (
    <div className="sx-page">
      <Hero
        eyebrow={`${greeting()}, ${actor.name.split(' ')[0]} · ${actor.title}`}
        title="ICT service desk"
        text={`${open.length} open tickets · ${breaching.length} at risk of breaching SLA · ${state.changes.filter((c) => c.status === 'SUBMITTED').length} changes for the board`}
        actions={[
          { label: 'Log a ticket', icon: <Plus size={16} />, onClick: () => go('tickets', 'new') },
          { label: 'Change board', icon: <GitPullRequestArrow size={16} />, onClick: () => go('changes') },
          { label: 'Assets', icon: <Laptop size={16} />, onClick: () => go('assets') }
        ]}
      />
      <div className="sx-stats">
        <Stat label="Open tickets" value={open.length} detail={`${open.filter((t) => t.priority === 'P1').length} critical`} icon={<TicketIcon size={17} />} onClick={() => go('tickets')} />
        <Stat label="At risk of breach" value={breaching.length} detail="Over 75% of the resolve time used" icon={<Clock3 size={17} />} tone={breaching.length ? 'red' : 'green'} onClick={() => go('tickets')} />
        <Stat label="SLA met" value={`${resolved.length ? Math.round((met.length / resolved.length) * 100) : 100}%`} detail={`${resolved.length} resolved recently`} icon={<CheckCircle2 size={17} />} tone="blue" />
        <Stat label="Renewals in 30 days" value={renewals.length} detail={kes(renewals.reduce((s, l) => s + l.annualCost, 0), { compact: true })} icon={<KeyRound size={17} />} tone="gold" onClick={() => go('assets')} />
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title={<>Needs your attention {todo.length > 0 && <span className="sx-count">{todo.length}</span>}</>} subtitle="Unassigned tickets, SLA risks, changes and renewals">
          <TodoList items={todo} />
        </Panel>
        <Panel title="Service levels" subtitle="Response and resolution targets">
          <ul className="sx-facts">
            {(Object.keys(SLA) as (keyof typeof SLA)[]).map((p) => (
              <li key={p}>
                <span>
                  <Pill status={P_PILL[p]} label={p} /> {SLA[p].label}
                </span>
                <b>
                  {fmtHours(SLA[p].respond)} / {fmtHours(SLA[p].resolve)}
                </b>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
};

const TicketsPage: React.FC = () => {
  const { state, ict, createTicket } = useControl();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'OPEN' | 'MINE' | 'RESOLVED'>('OPEN');
  const { actor } = useControl();
  useCtlFocus(ict.focus, (id) => state.tickets.some((t) => t.id === id), setOpenId, () => setAdding(true));
  const rows = state.tickets.filter((t) => (filter === 'RESOLVED' ? t.status === 'RESOLVED' : t.status !== 'RESOLVED' && (filter === 'OPEN' || t.assignee === actor.name)));
  const columns: Column<Ticket>[] = [
    { key: 'n', header: 'Ticket', render: (t) => <b className="sx-mono">{t.number}</b>, sort: (t) => t.number, width: 120 },
    { key: 'p', header: 'Priority', render: (t) => <Pill status={P_PILL[t.priority]} label={t.priority} />, sort: (t) => t.priority, width: 80 },
    {
      key: 't',
      header: 'Issue',
      render: (t) => (
        <div className="sx-cell-main">
          <span>{t.title}</span>
          <small>
            {t.requester} · {t.department} · {t.assignee ?? 'unassigned'}
          </small>
        </div>
      )
    },
    { key: 'a', header: 'Age', render: (t) => ago(t.created), sort: (t) => t.created, hideOnMobile: true },
    { key: 'sla', header: 'SLA', render: (t) => <SlaCell t={t} />, sort: (t) => slaState(t).left, width: 170 },
    { key: 's', header: 'Status', render: (t) => <Pill status={T_LABEL[t.status][0]} label={T_LABEL[t.status][1]} />, hideOnMobile: true }
  ];
  const open = state.tickets.find((t) => t.id === openId);
  const [f, setF] = useState({ title: '', requester: '', department: 'Operations', category: 'Hardware' as Ticket['category'], priority: 'P3' as Ticket['priority'] });
  return (
    <SuitePage
      eyebrow="Service desk"
      title="Tickets"
      subtitle="Incidents and requests with response and resolution clocks."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> Log a ticket
        </button>
      }
    >
      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'OPEN', label: 'Open', count: state.tickets.filter((t) => t.status !== 'RESOLVED').length },
            { value: 'MINE', label: 'Assigned to me', count: state.tickets.filter((t) => t.status !== 'RESOLVED' && t.assignee === actor.name).length },
            { value: 'RESOLVED', label: 'Resolved', count: state.tickets.filter((t) => t.status === 'RESOLVED').length }
          ]}
        />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(t) => t.id} onRowClick={(t) => setOpenId(t.id)} selected={openId} initialSort={{ key: 'sla', dir: 'asc' }} />
      {open && <TicketDrawer t={open} onClose={() => setOpenId(null)} />}
      {adding && (
        <Modal
          size="lg"
          title="Log a ticket"
          onClose={() => setAdding(false)}
          footer={
            <>
              <span className="sx-editor-total">
                {f.priority}: respond in {fmtHours(SLA[f.priority].respond)}, resolve in {fmtHours(SLA[f.priority].resolve)}
              </span>
              <span className="sx-grow" />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  const r = createTicket(f);
                  if (r.ok && r.id) {
                    setAdding(false);
                    setOpenId(r.id);
                  }
                }}
              >
                Log ticket
              </button>
            </>
          }
        >
          <div className="sx-grid">
            <Field label="What is the problem?" required span={4}>
              <input className="form-control" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </Field>
            <Field label="Who is affected" required>
              <input className="form-control" value={f.requester} onChange={(e) => setF({ ...f, requester: e.target.value })} />
            </Field>
            <Field label="Department">
              <select className="form-control" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
                {['Operations', 'Finance', 'Sales', 'HR', 'Administration', 'ICT'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select className="form-control" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Ticket['category'] })}>
                {['Hardware', 'Software', 'Network', 'Access', 'Email', 'ERP'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select className="form-control" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Ticket['priority'] })}>
                {(Object.keys(SLA) as (keyof typeof SLA)[]).map((p) => (
                  <option key={p} value={p}>
                    {p} — {SLA[p].label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

const TicketDrawer: React.FC<{ t: Ticket; onClose: () => void }> = ({ t, onClose }) => {
  const { takeTicket, waitTicket, resolveTicket, actor } = useControl();
  const [text, setText] = useState('');
  const s = slaState(t);
  return (
    <Drawer wide title={t.number} subtitle={t.title} badge={<Pill status={T_LABEL[t.status][0]} label={T_LABEL[t.status][1]} />} onClose={onClose}>
      <div className="sx-amount-hero">
        <div>
          <span>{t.status === 'RESOLVED' ? 'Resolved in' : 'Time to resolve'}</span>
          <strong className={s.left < 0 && t.status !== 'RESOLVED' ? 'sx-danger-text' : ''}>{t.status === 'RESOLVED' ? fmtHours(s.elapsed) : s.left < 0 ? fmtHours(s.left) : fmtHours(s.left)}</strong>
        </div>
        <div>
          <span>Target</span>
          <b>
            {t.priority} · {fmtHours(SLA[t.priority].resolve)}
          </b>
        </div>
      </div>
      <DefList
        items={[
          ['Requester', `${t.requester} · ${t.department}`],
          ['Category', t.category],
          ['Logged', new Date(t.created).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })],
          ['First response', t.firstResponse ? `${s.responseBreached ? 'Late — ' : ''}${new Date(t.firstResponse).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Not yet'],
          ['Assigned to', t.assignee ?? '—'],
          ['Resolution', t.resolution ?? '—']
        ]}
      />
      {t.status !== 'RESOLVED' && (
        <>
          {!t.assignee || t.assignee !== actor.name ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => takeTicket(t.id)}>
              <Hand size={14} /> {t.assignee ? 'Take over' : 'Pick up'}
            </button>
          ) : null}
          <Field label="Note or resolution" span={4}>
            <textarea className="form-control" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <div className="sx-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => waitTicket(t.id, text).ok && setText('')}>
              <Pause size={14} /> Waiting on someone
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => resolveTicket(t.id, text).ok && setText('')}>
              <CheckCircle2 size={14} /> Resolve
            </button>
          </div>
        </>
      )}
      <h4 className="sx-subhead">Activity</h4>
      <Timeline items={t.notes} />
    </Drawer>
  );
};

const AssetsPage: React.FC = () => {
  const { state } = useControl();
  const columns: Column<ItAsset>[] = [
    {
      key: 't',
      header: 'Asset',
      render: (a) => (
        <div className="sx-cell-main">
          <span>
            {a.tag} · {a.model}
          </span>
          <small>{a.type}</small>
        </div>
      ),
      sort: (a) => a.tag
    },
    { key: 'u', header: 'Assigned to', render: (a) => `${a.assignedTo} · ${a.department}`, hideOnMobile: true },
    {
      key: 'w',
      header: 'Warranty',
      render: (a) => {
        const dd = daysBetween(TODAY, a.warrantyEnd);
        return <span className={dd < 0 ? 'sx-muted' : dd <= 30 ? 'sx-danger-text' : ''}>{dd < 0 ? 'Expired' : `to ${fmtDate(a.warrantyEnd)}`}</span>;
      },
      sort: (a) => a.warrantyEnd
    },
    { key: 's', header: 'Status', render: (a) => <Pill status={{ IN_USE: 'POSTED', SPARE: 'DRAFT', REPAIR: 'OVERDUE', RETIRED: 'VOID' }[a.status]} label={a.status === 'IN_USE' ? 'In use' : a.status.charAt(0) + a.status.slice(1).toLowerCase()} /> }
  ];
  return (
    <SuitePage eyebrow="ICT" title="Assets & licences" subtitle="Hardware with its warranty, and software subscriptions with seats in use and renewal dates.">
      <DataTable rows={state.assets} columns={columns} rowKey={(a) => a.id} />
      <Panel title="Software licences" subtitle="Seats used and renewals">
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Licence</th>
              <th className="sx-hide-sm">Seats</th>
              <th style={{ textAlign: 'right' }}>Renewal</th>
              <th style={{ textAlign: 'right' }} className="sx-hide-sm">
                Annual cost
              </th>
            </tr>
          </thead>
          <tbody>
            {state.licences.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.name}
                  <small className="sx-muted sx-block">{l.vendor}</small>
                </td>
                <td className="sx-hide-sm">
                  <div className="sx-meter-cell">
                    <Meter value={l.used / l.seats} tone={l.used / l.seats > 0.95 ? 'gold' : 'green'} />
                    <small>
                      {l.used}/{l.seats}
                    </small>
                  </div>
                </td>
                <td style={{ textAlign: 'right' }} className={daysBetween(TODAY, l.renewal) <= 30 ? 'sx-danger-text' : ''}>
                  {fmtDate(l.renewal)}
                </td>
                <td style={{ textAlign: 'right' }} className="sx-hide-sm">
                  {kes(l.annualCost, { compact: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </SuitePage>
  );
};

const ChangesPage: React.FC = () => {
  const { state, ict, decideChange, implementChange, actor } = useControl();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  useCtlFocus(ict.focus, (id) => state.changes.some((c) => c.id === id), setOpenId);
  const columns: Column<Change>[] = [
    { key: 'n', header: 'Change', render: (c) => <b className="sx-mono">{c.number}</b>, width: 120 },
    {
      key: 't',
      header: 'What',
      render: (c) => (
        <div className="sx-cell-main">
          <span>{c.title}</span>
          <small>
            {c.system} · {c.requestedBy}
          </small>
        </div>
      )
    },
    { key: 'r', header: 'Risk', render: (c) => <Pill status={{ HIGH: 'REJECTED', MEDIUM: 'SUBMITTED', LOW: 'DRAFT' }[c.risk]} label={c.risk.toLowerCase()} /> },
    { key: 'w', header: 'Window', render: (c) => c.window, hideOnMobile: true },
    { key: 's', header: 'Status', render: (c) => <Pill status={{ SUBMITTED: 'SUBMITTED', APPROVED: 'APPROVED', IMPLEMENTED: 'POSTED', REJECTED: 'REJECTED' }[c.status]} label={c.status.charAt(0) + c.status.slice(1).toLowerCase()} /> }
  ];
  const open = state.changes.find((c) => c.id === openId);
  return (
    <SuitePage eyebrow="ICT" title="Change board" subtitle="Changes to live systems need a back-out plan and the ICT Manager's approval — never the requester's own.">
      <DataTable rows={state.changes} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => (setOpenId(c.id), setNote(''))} selected={openId} />
      {open && (
        <Drawer title={open.number} subtitle={open.title} onClose={() => setOpenId(null)}>
          <DefList items={[['System', open.system], ['Risk', open.risk.toLowerCase()], ['Window', open.window], ['Requested by', open.requestedBy], ['Back-out plan', open.backout]]} />
          {open.status === 'SUBMITTED' && (
            <>
              {actor.role !== 'ICT_MANAGER' && <p className="sx-note">The ICT Manager decides — switch to Samuel Kiptoo.</p>}
              <Field label="Board notes" span={4}>
                <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="sx-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => decideChange(open.id, false, note)}>
                  <XCircle size={14} /> Reject
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => decideChange(open.id, true, note)}>
                  <CheckCircle2 size={14} /> Approve
                </button>
              </div>
            </>
          )}
          {open.status === 'APPROVED' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => implementChange(open.id)}>
              <CheckCircle2 size={14} /> Mark implemented
            </button>
          )}
          <h4 className="sx-subhead">History</h4>
          <Timeline items={open.history} />
        </Drawer>
      )}
    </SuitePage>
  );
};

export const IctSidebar: React.FC = () => {
  const { state, ict, setIct } = useControl();
  const groups: SuiteNavGroup<IctPage>[] = [
    { label: 'ICT', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
    {
      label: 'Service desk',
      items: [
        { id: 'tickets', label: 'Tickets', icon: TicketIcon, badge: state.tickets.filter((t) => t.status !== 'RESOLVED' && slaState(t).used > 0.75).length, badgeTone: 'critical' },
        { id: 'changes', label: 'Change board', icon: GitPullRequestArrow, badge: state.changes.filter((c) => c.status === 'SUBMITTED').length },
        { id: 'assets', label: 'Assets & licences', icon: Laptop }
      ]
    }
  ];
  return <SuiteSidebar name="ICT Service Desk" tagline="Tickets · assets · changes" icon={MonitorCog} groups={groups} active={ict.page} onSelect={(p) => setIct(p)} footer={<CtlFooter />} />;
};
export const IctCrumb: React.FC = () => {
  const { ict, setIct } = useControl();
  return <Crumb name="ICT Service Desk" page={ict.page} label={LABEL[ict.page]} onHome={() => setIct('overview')} />;
};
export const IctSuite: React.FC = () => {
  const { ict } = useControl();
  useTopOnChange(ict.page);
  return (
    <div className="sx-suite" key={ict.page}>
      {ict.page === 'overview' && <IOverview />}
      {ict.page === 'tickets' && <TicketsPage />}
      {ict.page === 'assets' && <AssetsPage />}
      {ict.page === 'changes' && <ChangesPage />}
    </div>
  );
};

/* ================================================================== */
/* Integrations (single-page suite)                                    */
/* ================================================================== */

export const IntegrationsSuite: React.FC = () => {
  const { state, testConnector, retryFailed, togglePause } = useControl();
  const [openId, setOpenId] = useState<string | null>(null);
  useTopOnChange('integrations');
  const issues = (id: string) => state.syncLog.filter((l) => l.connectorId === id && l.status !== 'OK').length;
  const today = state.syncLog.filter((l) => Date.now() - new Date(l.at).getTime() < 86_400_000);
  const open = state.connectors.find((c) => c.id === openId);
  return (
    <div className="sx-suite">
      <div className="sx-page">
        <Hero eyebrow="Platform" title="Integrations" text={`${state.connectors.filter((c) => c.status === 'CONNECTED').length} of ${state.connectors.length} connections healthy · ${today.length} syncs in the last 24 hours`} />
        <div className="sx-stats">
          <Stat label="Healthy" value={state.connectors.filter((c) => c.status === 'CONNECTED').length} icon={<Plug size={17} />} />
          <Stat label="Degraded" value={state.connectors.filter((c) => c.status === 'DEGRADED').length} icon={<AlertTriangle size={17} />} tone="gold" />
          <Stat label="Paused" value={state.connectors.filter((c) => c.status === 'PAUSED').length} icon={<PauseCircle size={17} />} tone="slate" />
          <Stat label="Errors, 24 h" value={today.filter((l) => l.status !== 'OK').length} detail={`${today.reduce((s, l) => s + l.records, 0)} records moved`} icon={<Activity size={17} />} tone="red" />
        </div>
        <div className="sx-row">
          {state.connectors.map((c) => (
            <section key={c.id} className="sx-panel sx-connector">
              <div className="sx-panel-head">
                <div>
                  <h2>{c.name}</h2>
                  <p>{c.provider}</p>
                </div>
                <Pill status={{ CONNECTED: 'POSTED', DEGRADED: 'OVERDUE', PAUSED: 'VOID' }[c.status]} label={c.status.charAt(0) + c.status.slice(1).toLowerCase()} />
              </div>
              <div className="sx-panel-body">
                <p className="sx-note">{c.purpose}</p>
                <ul className="sx-facts">
                  <li>
                    <span>Used by</span>
                    <b>{c.module}</b>
                  </li>
                  <li>
                    <span>Schedule</span>
                    <b>{c.schedule}</b>
                  </li>
                  <li>
                    <span>Last sync</span>
                    <b>{ago(c.lastSync)} ago</b>
                  </li>
                  <li>
                    <span>Unresolved issues</span>
                    <b className={issues(c.id) ? 'sx-danger-text' : ''}>{issues(c.id)}</b>
                  </li>
                </ul>
                <div className="sx-actions">
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => testConnector(c.id)}>
                    <PlayCircle size={12} /> Test
                  </button>
                  {issues(c.id) > 0 && (
                    <button type="button" className="btn btn-primary btn-xs" onClick={() => retryFailed(c.id)}>
                      <RefreshCw size={12} /> Retry failed
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => togglePause(c.id)}>
                    {c.status === 'PAUSED' ? <PlayCircle size={12} /> : <PauseCircle size={12} />} {c.status === 'PAUSED' ? 'Resume' : 'Pause'}
                  </button>
                  <LinkButton onClick={() => setOpenId(c.id)}>Log</LinkButton>
                </div>
              </div>
            </section>
          ))}
        </div>
        <LogisticsIntegrations />
      </div>
      {open && (
        <Drawer title={open.name} subtitle="Sync log" onClose={() => setOpenId(null)}>
          <ul className="sx-acts">
            {state.syncLog
              .filter((l) => l.connectorId === open.id)
              .map((l) => (
                <li key={l.id} className={l.status === 'FAIL' ? 'late' : ''}>
                  <Pill status={{ OK: 'POSTED', WARN: 'SUBMITTED', FAIL: 'REJECTED' }[l.status]} label={l.status} />
                  <div>
                    <b>{l.message}</b>
                    <small>
                      {new Date(l.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · {l.direction === 'IN' ? 'received' : 'sent'} {l.records}
                    </small>
                  </div>
                </li>
              ))}
          </ul>
        </Drawer>
      )}
    </div>
  );
};
export const IntegrationsSidebar: React.FC = () => null;
