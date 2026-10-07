import React, { useState } from 'react';
import { LayoutDashboard, Landmark, CalendarDays, FileText, BadgeCheck, CheckCircle2, AlertTriangle, Send, RefreshCw, Layers, Circle, Rocket } from 'lucide-react';
import { useControl, type GovernancePage } from './store';
import { permitState } from './engine';
import { daysBetween, fmtDate, TODAY } from '../finance/engine';
import type { Obligation, Permit, Policy } from './types';
import { Chips, DataTable, Field, Hero, LinkButton, Meter, Panel, Pill, Stat, SuitePage, TodoList, greeting, type Column, type TodoItem } from '../ui/kit';
import { SuiteSidebar, type SuiteNavGroup } from '../ui/SuiteSidebar';
import { Crumb, useTopOnChange } from '../operations/parts';
import { CtlFooter } from './parts';

const LABEL: Record<GovernancePage, string> = { overview: 'Overview', calendar: 'Compliance calendar', policies: 'Policies', permits: 'Licences & permits' };
const due = (o: Obligation) => (o.status === 'FILED' ? 'FILED' : o.due < TODAY ? 'OVERDUE' : daysBetween(TODAY, o.due) <= 7 ? 'SOON' : 'UPCOMING');
const DUE_PILL: Record<string, [string, string]> = { FILED: ['POSTED', 'Filed'], OVERDUE: ['REJECTED', 'Overdue'], SOON: ['SUBMITTED', 'Due this week'], UPCOMING: ['DRAFT', 'Upcoming'] };

const GOverview: React.FC = () => {
  const { state, actor, setGovernance: go } = useControl();
  const open = state.obligations.filter((o) => o.status === 'DUE');
  const overdue = open.filter((o) => o.due < TODAY);
  const ack = state.policies.reduce((s, p) => s + p.acknowledged, 0) / Math.max(1, state.policies.reduce((s, p) => s + p.staff, 0));
  const permitIssues = state.permits.filter((p) => permitState(p) !== 'VALID');
  const todo: TodoItem[] = [
    ...overdue.map((o) => ({ id: o.id, tone: 'critical' as const, icon: <CalendarDays size={15} />, title: `${o.name} is overdue`, detail: `${o.authority} · was due ${fmtDate(o.due)}`, onClick: () => go('calendar') })),
    ...open.filter((o) => due(o) === 'SOON').map((o) => ({ id: o.id, tone: 'warning' as const, icon: <CalendarDays size={15} />, title: o.name, detail: `${o.authority} · due ${fmtDate(o.due)} · ${o.owner}`, onClick: () => go('calendar') })),
    ...permitIssues.map((p) => ({ id: p.id, tone: (permitState(p) === 'EXPIRED' ? 'critical' : 'warning') as TodoItem['tone'], icon: <BadgeCheck size={15} />, title: `${p.name} ${permitState(p) === 'EXPIRED' ? 'has expired' : 'expires soon'}`, detail: `${p.issuer} · ${fmtDate(p.expiry)}${p.renewalStarted ? ' · renewal started' : ''}`, onClick: () => go('permits') })),
    ...state.policies.filter((p) => p.nextReview < TODAY).map((p) => ({ id: p.id, tone: 'info' as const, icon: <FileText size={15} />, title: `Review policy: ${p.title}`, detail: `Review was due ${fmtDate(p.nextReview)}`, onClick: () => go('policies') }))
  ];
  return (
    <div className="sx-page">
      <Hero
        eyebrow={`${greeting()}, ${actor.name.split(' ')[0]} · ${actor.title}`}
        title="Governance & compliance"
        text={`${open.length} filings coming up · ${overdue.length} overdue · ${permitIssues.length} licences need attention`}
        actions={[
          { label: 'Compliance calendar', icon: <CalendarDays size={16} />, onClick: () => go('calendar') },
          { label: 'Policies', icon: <FileText size={16} />, onClick: () => go('policies') },
          { label: 'Licences', icon: <BadgeCheck size={16} />, onClick: () => go('permits') }
        ]}
      />
      <div className="sx-stats">
        <Stat label="Filings due in 30 days" value={open.filter((o) => daysBetween(TODAY, o.due) <= 30).length} detail={`${overdue.length} overdue`} icon={<CalendarDays size={17} />} tone={overdue.length ? 'red' : 'green'} onClick={() => go('calendar')} />
        <Stat label="Filed on time this year" value={`${(() => { const f = state.obligations.filter((o) => o.status === 'FILED'); return f.length ? Math.round((f.filter((o) => (o.filedOn ?? '') <= o.due).length / f.length) * 100) : 100; })()}%`} icon={<CheckCircle2 size={17} />} tone="blue" />
        <Stat label="Policy acknowledgements" value={`${Math.round(ack * 100)}%`} detail="Of staff who must sign" icon={<FileText size={17} />} tone="violet" onClick={() => go('policies')} />
        <Stat label="Licences needing action" value={permitIssues.length} detail={permitIssues.map((p) => p.issuer).join(', ') || 'All valid'} icon={<BadgeCheck size={17} />} tone={permitIssues.length ? 'gold' : 'green'} onClick={() => go('permits')} />
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title={<>Needs your attention {todo.length > 0 && <span className="sx-count">{todo.length}</span>}</>} subtitle="Filings, expiring licences and policy reviews">
          <TodoList items={todo} />
        </Panel>
        <Panel title="Next 30 days" subtitle="Statutory calendar" action={<LinkButton onClick={() => go('calendar')}>Calendar</LinkButton>}>
          <ul className="sx-facts">
            {open
              .filter((o) => daysBetween(TODAY, o.due) <= 30)
              .sort((a, b) => a.due.localeCompare(b.due))
              .slice(0, 8)
              .map((o) => (
                <li key={o.id}>
                  <span>
                    {o.name} <small className="sx-muted">· {o.authority}</small>
                  </span>
                  <b className={o.due < TODAY ? 'sx-danger-text' : ''}>{fmtDate(o.due).slice(0, 6)}</b>
                </li>
              ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
};

const CalendarPage: React.FC = () => {
  const { state, fileObligation } = useControl();
  const [filter, setFilter] = useState<'DUE' | 'FILED' | 'ALL'>('DUE');
  const [refs, setRefs] = useState<Record<string, string>>({});
  const rows = state.obligations.filter((o) => filter === 'ALL' || o.status === filter);
  const columns: Column<Obligation>[] = [
    {
      key: 'n',
      header: 'Obligation',
      render: (o) => (
        <div className="sx-cell-main">
          <span>{o.name}</span>
          <small>
            {o.authority} · {o.frequency} · {o.owner}
          </small>
        </div>
      ),
      sort: (o) => o.name
    },
    { key: 'd', header: 'Due', render: (o) => <span className={due(o) === 'OVERDUE' ? 'sx-danger-text' : ''}>{fmtDate(o.due)}</span>, sort: (o) => o.due },
    { key: 's', header: 'Status', render: (o) => <Pill status={DUE_PILL[due(o)][0]} label={DUE_PILL[due(o)][1]} />, sort: (o) => due(o) },
    {
      key: 'a',
      header: 'Filing',
      render: (o) =>
        o.status === 'FILED' ? (
          <span className="sx-muted">
            {o.ref} · {fmtDate(o.filedOn ?? '')}
          </span>
        ) : (
          <div className="sx-inline-form" style={{ marginTop: 0 }} onClick={(e) => e.stopPropagation()}>
            <input className="form-control" value={refs[o.id] ?? ''} onChange={(e) => setRefs({ ...refs, [o.id]: e.target.value })} placeholder="Acknowledgement no." style={{ width: 170 }} />
            <button type="button" className="btn btn-primary btn-xs" onClick={() => fileObligation(o.id, refs[o.id] ?? '')}>
              Mark filed
            </button>
          </div>
        ),
      width: 300
    }
  ];
  return (
    <SuitePage eyebrow="Compliance" title="Compliance calendar" subtitle="Statutory returns and payments. Filing one adds the next period to the calendar automatically.">
      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'DUE', label: 'To file', count: state.obligations.filter((o) => o.status === 'DUE').length },
            { value: 'FILED', label: 'Filed', count: state.obligations.filter((o) => o.status === 'FILED').length },
            { value: 'ALL', label: 'All', count: state.obligations.length }
          ]}
        />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(o) => o.id} initialSort={{ key: 'd', dir: 'asc' }} pageSize={20} />
    </SuitePage>
  );
};

const PoliciesPage: React.FC = () => {
  const { state, remindPolicy } = useControl();
  const columns: Column<Policy>[] = [
    {
      key: 't',
      header: 'Policy',
      render: (p) => (
        <div className="sx-cell-main">
          <span>{p.title}</span>
          <small>
            v{p.version} · {p.owner} · approved {fmtDate(p.approved)}
          </small>
        </div>
      ),
      sort: (p) => p.title
    },
    { key: 'r', header: 'Next review', render: (p) => <span className={p.nextReview < TODAY ? 'sx-danger-text' : ''}>{fmtDate(p.nextReview)}</span>, sort: (p) => p.nextReview },
    {
      key: 'a',
      header: 'Acknowledged',
      render: (p) => (
        <div className="sx-meter-cell">
          <Meter value={p.acknowledged / p.staff} tone={p.acknowledged / p.staff < 0.85 ? 'gold' : 'green'} />
          <small>
            {p.acknowledged}/{p.staff}
          </small>
        </div>
      ),
      sort: (p) => p.acknowledged / p.staff,
      width: 170
    },
    {
      key: 'x',
      header: '',
      render: (p) =>
        p.acknowledged < p.staff ? (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => remindPolicy(p.id)}>
            <Send size={12} /> Remind {p.staff - p.acknowledged}
          </button>
        ) : (
          <Pill status="POSTED" label="All signed" />
        ),
      align: 'right'
    }
  ];
  return (
    <SuitePage eyebrow="Governance" title="Policies" subtitle="Approved policies, their review dates and who has acknowledged reading them.">
      <DataTable rows={state.policies} columns={columns} rowKey={(p) => p.id} />
    </SuitePage>
  );
};

const PermitsPage: React.FC = () => {
  const { state, startRenewal, renewPermit } = useControl();
  const [dates, setDates] = useState<Record<string, string>>({});
  const columns: Column<Permit>[] = [
    {
      key: 'n',
      header: 'Licence or permit',
      render: (p) => (
        <div className="sx-cell-main">
          <span>{p.name}</span>
          <small>
            {p.issuer} · {p.number} · {p.site}
          </small>
        </div>
      ),
      sort: (p) => p.name
    },
    { key: 'e', header: 'Expires', render: (p) => <span className={permitState(p) !== 'VALID' ? 'sx-danger-text' : ''}>{fmtDate(p.expiry)}</span>, sort: (p) => p.expiry },
    {
      key: 's',
      header: 'Status',
      render: (p) => (p.renewalStarted ? <Pill status="OPEN" label="Renewing" /> : <Pill status={{ EXPIRED: 'REJECTED', EXPIRING: 'SUBMITTED', VALID: 'POSTED' }[permitState(p)]} label={{ EXPIRED: 'Expired', EXPIRING: `${daysBetween(TODAY, p.expiry)} days left`, VALID: 'Valid' }[permitState(p)]} />)
    },
    {
      key: 'a',
      header: '',
      render: (p) =>
        permitState(p) === 'VALID' ? null : !p.renewalStarted ? (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => startRenewal(p.id)}>
            <RefreshCw size={12} /> Start renewal
          </button>
        ) : (
          <div className="sx-inline-form" style={{ marginTop: 0 }}>
            <input className="form-control" type="date" value={dates[p.id] ?? ''} onChange={(e) => setDates({ ...dates, [p.id]: e.target.value })} />
            <button type="button" className="btn btn-primary btn-xs" onClick={() => renewPermit(p.id, dates[p.id] ?? '')}>
              Renewed
            </button>
          </div>
        ),
      align: 'right',
      width: 280
    }
  ];
  return (
    <SuitePage eyebrow="Compliance" title="Licences & permits" subtitle="Operating licences, certificates and permits with their expiry dates.">
      <DataTable rows={state.permits} columns={columns} rowKey={(p) => p.id} initialSort={{ key: 'e', dir: 'asc' }} />
    </SuitePage>
  );
};

export const GovernanceSidebar: React.FC = () => {
  const { state, governance, setGovernance } = useControl();
  const groups: SuiteNavGroup<GovernancePage>[] = [
    { label: 'Governance', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
    {
      label: 'Comply',
      items: [
        { id: 'calendar', label: 'Compliance calendar', icon: CalendarDays, badge: state.obligations.filter((o) => o.status === 'DUE' && o.due < TODAY).length, badgeTone: 'critical' },
        { id: 'permits', label: 'Licences & permits', icon: BadgeCheck, badge: state.permits.filter((p) => permitState(p) !== 'VALID').length },
        { id: 'policies', label: 'Policies', icon: FileText }
      ]
    }
  ];
  return <SuiteSidebar name="Governance & Compliance" tagline="File · license · govern" icon={Landmark} groups={groups} active={governance.page} onSelect={(p) => setGovernance(p)} footer={<CtlFooter />} />;
};
export const GovernanceCrumb: React.FC = () => {
  const { governance, setGovernance } = useControl();
  return <Crumb name="Governance & Compliance" page={governance.page} label={LABEL[governance.page]} onHome={() => setGovernance('overview')} />;
};
export const GovernanceSuite: React.FC = () => {
  const { governance } = useControl();
  useTopOnChange(governance.page);
  return (
    <div className="sx-suite" key={governance.page}>
      {governance.page === 'overview' && <GOverview />}
      {governance.page === 'calendar' && <CalendarPage />}
      {governance.page === 'policies' && <PoliciesPage />}
      {governance.page === 'permits' && <PermitsPage />}
    </div>
  );
};

/* ================================================================== */
/* Implementation hub (single page)                                    */
/* ================================================================== */

export const ImplementationSuite: React.FC = () => {
  const { state, toggleTask } = useControl();
  useTopOnChange('implementation');
  const all = state.workstreams.flatMap((w) => w.tasks);
  const pct = all.filter((t) => t.done).length / all.length;
  const late = state.workstreams.flatMap((w) => w.tasks.filter((t) => !t.done && t.due < TODAY).map((t) => ({ w, t })));
  return (
    <div className="sx-suite">
      <div className="sx-page">
        <Hero eyebrow="Rollout" title="Implementation hub" text={`${Math.round(pct * 100)}% of rollout tasks complete · ${state.workstreams.filter((w) => w.tasks.every((t) => t.done)).length} of ${state.workstreams.length} workstreams live`} />
        <div className="sx-stats">
          <Stat label="Overall progress" value={`${Math.round(pct * 100)}%`} detail={`${all.filter((t) => t.done).length} of ${all.length} tasks`} icon={<Rocket size={17} />} />
          <Stat label="Live" value={state.workstreams.filter((w) => w.tasks.every((t) => t.done)).length} detail="Workstreams in production" icon={<CheckCircle2 size={17} />} tone="blue" />
          <Stat label="Late tasks" value={late.length} detail={late.map((x) => x.t.name).slice(0, 1).join('') || 'On schedule'} icon={<AlertTriangle size={17} />} tone={late.length ? 'red' : 'green'} />
          <Stat
            label="Next go-live"
            value={(() => { const w = state.workstreams.filter((x) => x.goLive >= TODAY).sort((a, b) => a.goLive.localeCompare(b.goLive))[0]; return w ? `${daysBetween(TODAY, w.goLive)} days` : '—'; })()}
            detail={state.workstreams.filter((x) => x.goLive >= TODAY).sort((a, b) => a.goLive.localeCompare(b.goLive))[0]?.module ?? ''}
            icon={<Layers size={17} />}
            tone="violet"
          />
        </div>
        <div className="sx-row">
          {state.workstreams.map((w) => {
            const doneN = w.tasks.filter((t) => t.done).length;
            const live = doneN === w.tasks.length;
            return (
              <Panel key={w.id} title={w.module} subtitle={`${w.owner} · go-live ${fmtDate(w.goLive)}`} action={<Pill status={live ? 'POSTED' : 'OPEN'} label={live ? 'Live' : `${Math.round((doneN / w.tasks.length) * 100)}%`} />}>
                <Meter value={doneN / w.tasks.length} />
                <ul className="sx-checklist">
                  {w.tasks.map((t, i) => (
                    <li key={t.name} className={t.done ? 'done' : ''}>
                      <button type="button" className="sx-check-icon" onClick={() => toggleTask(w.id, i)} aria-label={`Toggle ${t.name}`}>
                        {t.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </button>
                      <div>
                        <b>{t.name}</b>
                        <small className={!t.done && t.due < TODAY ? 'sx-danger-text' : ''}>
                          {t.phase} · {fmtDate(t.due)}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}
        </div>
        <Field label="Go-live readiness" span={4}>
          <p className="sx-note">Each workstream goes live when configuration, data, training and testing are complete. Tick tasks as they finish — progress updates for the whole programme.</p>
        </Field>
      </div>
    </div>
  );
};
