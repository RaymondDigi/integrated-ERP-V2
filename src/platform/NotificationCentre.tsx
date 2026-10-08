import React, { useState } from 'react';
import { Bell, CheckCheck, Mail, MessageSquare, MonitorSmartphone } from 'lucide-react';
import { markAllRead, markRead, useNotices, type Notice } from './outbox';
import { useAuditTrail } from './audit';
import { Chips, Drawer } from '../suites/ui/kit';
import { ExportCsvButton } from './Widgets';

const CH_ICON: Record<Notice['channel'], React.ReactNode> = { EMAIL: <Mail size={13} />, SMS: <MessageSquare size={13} />, IN_APP: <MonitorSmartphone size={13} /> };

/** Header bell: unread in-app alerts across every suite, the simulated email/SMS outbox and the change log. */
export const NotificationBell: React.FC = () => {
  const notices = useNotices();
  const [open, setOpen] = useState(false);
  const unread = notices.filter((n) => n.channel === 'IN_APP' && n.status === 'QUEUED').length;
  return (
    <>
      <button className="header-icon-btn pf-bell" onClick={() => setOpen(true)} title="Notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        <Bell size={16} />
        {unread > 0 && <em className="pf-bell-badge">{unread > 99 ? '99+' : unread}</em>}
      </button>
      {open && <NotificationCentre onClose={() => setOpen(false)} />}
    </>
  );
};

export const NotificationCentre: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const notices = useNotices();
  const trail = useAuditTrail();
  const [tab, setTab] = useState<'alerts' | 'outbox' | 'changes'>('alerts');
  const alerts = notices.filter((n) => n.channel === 'IN_APP');
  const outbox = notices.filter((n) => n.channel !== 'IN_APP');
  return (
    <Drawer
      title="Notifications"
      subtitle="Alerts for you, messages sent by email and SMS, and recorded changes"
      onClose={onClose}
      wide
      footer={
        tab === 'alerts' ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={markAllRead}>
            <CheckCheck size={14} /> Mark all read
          </button>
        ) : tab === 'outbox' ? (
          <ExportCsvButton name="outbox" header={['Sent', 'Module', 'Channel', 'To', 'Address', 'Subject', 'Reference']} rows={() => outbox.map((n) => [n.at, n.module, n.channel, n.to, n.address ?? '', n.subject, n.ref ?? ''])} />
        ) : (
          <ExportCsvButton name="change-log" header={['When', 'Module', 'By', 'Action', 'Reference', 'Field', 'Before', 'After', 'Note']} rows={() => trail.map((e) => [e.at, e.module, e.by, e.action, e.ref ?? '', e.field ?? '', e.before ?? '', e.after ?? '', e.note ?? ''])} />
        )
      }
    >
      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { value: 'alerts', label: `Alerts (${alerts.filter((n) => n.status === 'QUEUED').length})` },
          { value: 'outbox', label: `Email & SMS (${outbox.length})` },
          { value: 'changes', label: `Change log (${trail.length})` }
        ]}
      />
      {tab === 'alerts' &&
        (alerts.length ? (
          <ul className="pf-notice-list">
            {alerts.map((n) => (
              <li key={n.id} className={`pf-notice ${n.level} ${n.status === 'QUEUED' ? 'unread' : ''}`} onClick={() => markRead(n.id)}>
                <strong>{n.subject}</strong>
                <small>
                  {n.module} · {n.to} · {n.at}
                  {n.ref ? ` · ${n.ref}` : ''}
                </small>
                {n.body && <p>{n.body}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pf-muted">No alerts yet. Approvals, overdue items and exceptions raised in any module appear here.</p>
        ))}
      {tab === 'outbox' &&
        (outbox.length ? (
          <ul className="pf-notice-list">
            {outbox.map((n) => (
              <li key={n.id} className="pf-notice">
                <strong>
                  {CH_ICON[n.channel]} {n.subject}
                </strong>
                <small>
                  {n.module} · to {n.to}
                  {n.address ? ` <${n.address}>` : ''} · {n.at} · {n.status === 'SENT' ? 'sent (simulated gateway)' : n.status.toLowerCase()}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pf-muted">Nothing sent yet this session.</p>
        ))}
      {tab === 'changes' &&
        (trail.length ? (
          <ul className="pf-notice-list">
            {trail.map((e) => (
              <li key={e.id} className="pf-notice">
                <strong>
                  {e.action}
                  {e.ref ? ` · ${e.ref}` : ''}
                  {e.field ? ` · ${e.field}: ${e.before || '—'} → ${e.after || '—'}` : ''}
                </strong>
                <small>
                  {e.module} · {e.by} · {e.at}
                  {e.note ? ` · ${e.note}` : ''}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pf-muted">No changes recorded yet this session.</p>
        ))}
    </Drawer>
  );
};
