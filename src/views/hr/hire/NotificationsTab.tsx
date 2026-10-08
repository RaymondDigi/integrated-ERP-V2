import React, { useMemo, useState } from 'react';
import { Search, Briefcase, Home, AlertTriangle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { buildOutbox } from '../../../data/notifyEngine';
import { fmtDate } from '../../../data/hireEngine';
import { ROUTING_RULES, type MailCategory } from '../../../utils/emailRouting';
import { Card, Empty, Pill, Stat } from './shared';

const ChannelPill: React.FC<{ channel: 'work' | 'personal'; fallback?: boolean }> = ({ channel, fallback }) =>
  fallback ? (
    <Pill tone="warning" title="No personal email on file — sent to work email instead">
      <AlertTriangle size={11} /> Work (fallback)
    </Pill>
  ) : channel === 'work' ? (
    <Pill tone="info">
      <Briefcase size={11} /> Work
    </Pill>
  ) : (
    <Pill tone="success">
      <Home size={11} /> Personal
    </Pill>
  );

/** Every message the workspace sends, and which of the employee's two addresses it went to. */
export const NotificationsTab: React.FC = () => {
  const { hrEmployees, leaveRequests, essRequests, exitCases, closedPayrollPeriods, selectedOrgId, employeeChanges, requisitions, trainingNeeds } = useApp();
  const [channel, setChannel] = useState<'all' | 'work' | 'personal' | 'fallback'>('all');
  const [category, setCategory] = useState<'All' | MailCategory>('All');
  const [search, setSearch] = useState('');

  const tenantIds = useMemo(() => new Set(hrEmployees.filter((e) => e.orgId === selectedOrgId).map((e) => e.staffId)), [hrEmployees, selectedOrgId]);
  const all = useMemo(
    () => buildOutbox({ hrEmployees, leaveRequests, essRequests, exitCases, closedPayrollPeriods, employeeChanges, requisitions, trainingNeeds }).filter((m) => tenantIds.has(m.staffId)),
    [hrEmployees, leaveRequests, essRequests, exitCases, closedPayrollPeriods, employeeChanges, requisitions, trainingNeeds, tenantIds]
  );
  const missing = hrEmployees.filter((e) => tenantIds.has(e.staffId) && !e.personalEmail && e.status !== 'TERMINATED');

  const q = search.trim().toLowerCase();
  const rows = all.filter(
    (m) =>
      (channel === 'all' || (channel === 'fallback' ? m.fallback : m.channel === channel && !m.fallback)) &&
      (category === 'All' || m.category === category) &&
      (!q || `${m.recipient} ${m.staffId} ${m.to} ${m.subject} ${m.ref}`.toLowerCase().includes(q))
  );
  const pg = usePaged(rows, 25, `${channel}|${category}|${q}|${selectedOrgId}`);
  const work = all.filter((m) => m.channel === 'work');
  const personal = all.filter((m) => m.channel === 'personal' && !m.fallback);
  const fallback = all.filter((m) => m.fallback);

  return (
    <>
      <div className="hr-stats-row">
        <Stat label="Messages sent" value={all.length.toLocaleString()} sub={`${new Set(all.map((m) => m.staffId)).size} people this company`} />
        <Stat label="To work email" value={work.length.toLocaleString()} sub="Approval requests to approvers" tone="#2563eb" />
        <Stat label="To personal email" value={personal.length.toLocaleString()} sub="Payslips, leave, requests, exit" tone="var(--brand-primary)" />
        <Stat
          label="Fell back to work email"
          value={fallback.length.toLocaleString()}
          sub={missing.length ? `${missing.length} staff have no personal email — add it in Edit details` : 'Everyone has a personal email on file'}
          tone={fallback.length ? '#d97706' : undefined}
        />
      </div>

      <Card title="Where mail goes" sub="Each employee has a work email (company domain) and a personal email. Approvals stay on company mail; notices about the employee's own pay and records go to the personal address, so leavers still receive them.">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Message</th>
                <th>Sent to</th>
                <th>What</th>
              </tr>
            </thead>
            <tbody>
              {ROUTING_RULES.map((r) => (
                <tr key={r.category}>
                  <td>
                    <strong>{r.category}</strong>
                  </td>
                  <td>
                    <ChannelPill channel={r.channel} />
                  </td>
                  <td className="hi-wrap">{r.what}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Sign-in</strong>
                </td>
                <td>
                  <ChannelPill channel="work" />
                </td>
                <td className="hi-wrap">Staff sign in with their work email only. A personal address is refused, and the work account closes when the employee leaves.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Outbox" sub="Built from leave, self-service, exit and payroll records, so it always matches what happened.">
        <div className="digicraft-toolbar" style={{ marginBottom: 12 }}>
          <div className="digicraft-search-box">
            <Search size={16} className="digicraft-search-icon" />
            <input type="text" placeholder="Search by person, address, subject or reference..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="digicraft-filter-pills">
            {(
              [
                ['all', 'All'],
                ['work', 'Work email'],
                ['personal', 'Personal email'],
                ['fallback', 'Fallbacks']
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={`digicraft-filter-pill ${channel === k ? 'active' : ''}`} onClick={() => setChannel(k)}>
                {label}
              </button>
            ))}
            <select className="form-control hi-select-sm" value={category} onChange={(e) => setCategory(e.target.value as typeof category)} aria-label="Message type">
              <option value="All">All messages</option>
              {ROUTING_RULES.map((r) => (
                <option key={r.category} value={r.category}>
                  {r.category}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Sent</th>
                <th>Recipient</th>
                <th>Address</th>
                <th>Message</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={5}>No messages match.</Empty>}
              {pg.rows.map((m) => (
                <tr key={m.id}>
                  <td className="hi-sub">{fmtDate(m.on)}</td>
                  <td>
                    {m.recipient}
                    <div className="hi-sub">{m.staffId}</div>
                  </td>
                  <td>
                    <div className="hi-mono">{m.to}</div>
                    <ChannelPill channel={m.channel} fallback={m.fallback} />
                  </td>
                  <td className="hi-wrap">
                    <strong>{m.category}</strong>
                    <div className="hi-sub">{m.subject}</div>
                  </td>
                  <td className="hi-mono">{m.ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="messages" sizes={[25, 50, 100]} />
      </Card>
    </>
  );
};
