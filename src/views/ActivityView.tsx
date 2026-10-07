import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

export const ActivityView: React.FC = () => {
  const { auditEvents, setSelectedAuditEvent } = useApp();
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const events = auditEvents.filter((ev) => {
    const matchesFilter = filter === 'ALL' || ev.category.toUpperCase() === filter;
    const matchesSearch =
      search === '' ||
      ev.action.toLowerCase().includes(search.toLowerCase()) ||
      ev.actor.name.toLowerCase().includes(search.toLowerCase()) ||
      ev.resource.toLowerCase().includes(search.toLowerCase()) ||
      ev.reason.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="view-container">
      <div className="view-header">
        <div className="view-title-group">
          <h1 className="view-title">Real-Time Enterprise Activity Stream</h1>
          <p className="view-subtitle">
            Live operational events, actor dispatches, resource modifications, and authorization verdicts.
          </p>
        </div>

        <div className="view-actions">
          <span className="env-pill">STREAMING WEBSOCKET ACTIVE</span>
        </div>
      </div>

      <div className="emc-table-card">
        <div className="emc-table-toolbar">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
            <input
              type="text"
              className="table-search-input"
              style={{ flex: '1 1 200px' }}
              placeholder="Search live activity..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {(['ALL', 'SECURITY', 'USER', 'POLICY', 'WORKFLOW', 'BILLING'] as const).map((cat) => (
                <button
                  key={cat}
                  className={`btn btn-xs ${filter === cat ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setFilter(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {events.length} Live Events Captured
          </span>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {events.map((ev) => (
            <div
              key={ev.id}
              onClick={() => setSelectedAuditEvent(ev)}
              style={{
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                padding: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                transition: 'border-color 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background:
                      ev.severity === 'critical'
                        ? 'var(--status-critical)'
                        : ev.severity === 'high'
                        ? 'var(--status-warning)'
                        : 'var(--status-success)',
                    boxShadow: ev.severity === 'critical' ? '0 0 8px var(--status-critical)' : 'none'
                  }}
                />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {ev.action}
                    </span>
                    <span className="badge badge-neutral">{ev.category}</span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                      {ev.timestamp}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Actor: <strong style={{ color: 'var(--text-primary)' }}>{ev.actor.name}</strong> ({ev.actor.email}) · {ev.reason}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-accent)' }}>
                  {ev.requestId}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  IP: {ev.actor.ip}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
