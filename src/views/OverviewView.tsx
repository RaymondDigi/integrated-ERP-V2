import React, { useState } from 'react';
import {
  Activity,
  AlertOctagon,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const OverviewView: React.FC = () => {
  const {
    workItems,
    users,
    auditEvents,
    aiInsights,
    setCurrentView,
    setSelectedWorkItem,
    setSelectedAuditEvent,
    executeWorkItemAction,
    applyAiMitigation
  } = useApp();

  const [activityFilter, setActivityFilter] = useState<string>('ALL');
  const [activitySearch] = useState<string>('');

  const activeWorkItems = workItems.filter((w) => w.status === 'OPEN' || w.status === 'IN_TRIAGE');
  const criticalItems = activeWorkItems.filter((w) => w.severity === 'CRITICAL');
  const warningItems = activeWorkItems.filter((w) => w.severity === 'WARNING');
  const approvalItems = activeWorkItems.filter((w) => w.severity === 'APPROVAL');

  const filteredAuditEvents = auditEvents.filter((ev) => {
    const matchesCategory = activityFilter === 'ALL' || ev.category.toUpperCase() === activityFilter;
    const matchesSearch =
      activitySearch === '' ||
      ev.action.toLowerCase().includes(activitySearch.toLowerCase()) ||
      ev.actor.name.toLowerCase().includes(activitySearch.toLowerCase()) ||
      ev.resource.toLowerCase().includes(activitySearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="view-container">
      {/* Header Greeting */}
      <div className="view-header">
        <div className="view-title-group">
          <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
            Enterprise Operations Center · Active Node: us-east-1a
          </div>
          <h1 className="view-title">Good afternoon, Sarah</h1>
          <p className="view-subtitle">
            Autonomous control plane monitoring 2,481 enterprise tenant partitions across 4 regions.
          </p>
        </div>

        <div className="view-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setCurrentView('activity')}
          >
            <Activity size={14} /> Full Telemetry Stream
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setCurrentView('work-queue')}
          >
            Open Work Queue ({activeWorkItems.length})
          </button>
        </div>
      </div>

      {/* Intelligent Attention Banner */}
      {activeWorkItems.length > 0 && (
        <div className="attention-banner">
          <div className="attention-banner-left">
            <div className="attention-badge-count">{activeWorkItems.length}</div>
            <div className="attention-info">
              <h3>
                {activeWorkItems.length} operational items require administrative decision
              </h3>
              <div className="attention-breakdown">
                <span className="breakdown-pill critical">
                  ● {criticalItems.length} Critical
                </span>
                <span className="breakdown-pill warning">
                  ▲ {warningItems.length} Warnings
                </span>
                <span className="breakdown-pill approval">
                  ◆ {approvalItems.length} Approvals
                </span>
                <span style={{ color: 'var(--text-tertiary)' }}>
                  Attention → Understand → Decide → Act → Verify
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {criticalItems.length > 0 && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setSelectedWorkItem(criticalItems[0]);
                }}
              >
                <AlertOctagon size={14} /> Triage Highest Priority ({criticalItems[0].id})
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentView('work-queue')}
            >
              Review All ({activeWorkItems.length}) <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Organization Pulse: Compact, Information-Dense Metrics */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.06em', marginBottom: 8 }}>
          Organization Pulse · Real-Time Platform State
        </div>
        <div className="pulse-grid">
          <div className="pulse-card" onClick={() => setCurrentView('users')} style={{ cursor: 'pointer' }}>
            <span className="pulse-label">Total Users</span>
            <div className="pulse-value-row">
              <span className="pulse-value">124,582</span>
              <span className="pulse-delta positive">+12.4%</span>
            </div>
            <span className="pulse-subtext">{users.length} privileged admins</span>
          </div>

          <div className="pulse-card" onClick={() => setCurrentView('organizations')} style={{ cursor: 'pointer' }}>
            <span className="pulse-label">Organizations</span>
            <div className="pulse-value-row">
              <span className="pulse-value">2,481</span>
              <span className="pulse-delta positive">+4.2%</span>
            </div>
            <span className="pulse-subtext">5 Enterprise Dedicated</span>
          </div>

          <div className="pulse-card" onClick={() => setCurrentView('health')} style={{ cursor: 'pointer' }}>
            <span className="pulse-label">System Health (SLO)</span>
            <div className="pulse-value-row">
              <span className="pulse-value">99.98%</span>
              <span className="pulse-delta positive">Nominal</span>
            </div>
            <span className="pulse-subtext">P95 Latency: 22ms</span>
          </div>

          <div className="pulse-card" onClick={() => setCurrentView('security')} style={{ cursor: 'pointer' }}>
            <span className="pulse-label">Security Threat Risk</span>
            <div className="pulse-value-row">
              <span className="pulse-value" style={{ color: 'var(--status-success)' }}>LOW</span>
              <span className="badge badge-success">CC6.1 Active</span>
            </div>
            <span className="pulse-subtext">3 MFA exceptions flagged</span>
          </div>

          <div className="pulse-card" onClick={() => setCurrentView('workflows')} style={{ cursor: 'pointer' }}>
            <span className="pulse-label">Pipeline Ingestion</span>
            <div className="pulse-value-row">
              <span className="pulse-value">4.8M ops</span>
              <span className="pulse-delta positive">+8.1%</span>
            </div>
            <span className="pulse-subtext">1 failed replay batch</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Active Queue & Real-Time Activity Stream */}
      <div className="responsive-grid-2col">
        {/* Left Column: Mission Control Work Queue Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Operational Work Queue
              </h2>
              <span className="badge badge-neutral">{activeWorkItems.length} Actionable</span>
            </div>
            <button
              className="btn-ghost btn-xs"
              onClick={() => setCurrentView('work-queue')}
            >
              View Full Work Queue →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activeWorkItems.slice(0, 4).map((item) => (
              <div
                key={item.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s ease'
                }}
                onClick={() => setSelectedWorkItem(item)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span
                        className={`badge ${
                          item.severity === 'CRITICAL'
                            ? 'badge-critical'
                            : item.severity === 'WARNING'
                            ? 'badge-warning'
                            : item.severity === 'APPROVAL'
                            ? 'badge-approval'
                            : 'badge-ai'
                        }`}
                      >
                        {item.severity}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                        {item.id}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        · {item.detectedTime}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {item.title}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                    Target: {item.resource}
                  </span>
                  <button
                    className={`btn btn-xs ${item.recommendedAction.danger ? 'btn-danger' : 'btn-primary'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      executeWorkItemAction(item.id);
                    }}
                  >
                    {item.recommendedAction.label.split(' ')[0]} Now
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Embedded AI Intelligence Card */}
          {aiInsights.filter((ai) => !ai.dismissed).length > 0 && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(17, 24, 39, 0.7) 100%)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: 6,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={16} color="#c084fc" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    AI Intelligence Sentinel
                  </span>
                </div>
                <span className="badge badge-ai">
                  {aiInsights[0].confidence}% Confidence
                </span>
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {aiInsights[0].title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                <strong>Potential cause:</strong> {aiInsights[0].potentialCause}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Baseline: {aiInsights[0].baselineComparison.substring(0, 48)}...
                </span>
                <button
                  className="btn btn-primary btn-xs"
                  onClick={() => applyAiMitigation(aiInsights[0].id)}
                >
                  Apply AI Remediation
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Real-Time Activity Stream */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                Real-Time Activity Stream
              </h2>
              <span className="badge badge-neutral">Live</span>
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
              {(['ALL', 'SECURITY', 'POLICY', 'WORKFLOW', 'BILLING'] as const).map((cat) => (
                <button
                  key={cat}
                  className={`btn btn-xs ${activityFilter === cat ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setActivityFilter(cat)}
                  style={{ fontSize: 10, padding: '2px 6px' }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredAuditEvents.slice(0, 5).map((event) => (
              <div
                key={event.id}
                onClick={() => setSelectedAuditEvent(event)}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'background 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background:
                          event.severity === 'critical'
                            ? 'var(--status-critical)'
                            : event.severity === 'high'
                            ? 'var(--status-warning)'
                            : 'var(--status-success)'
                      }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {event.action}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                    {event.timestamp.split(' ')[1]} UTC
                  </span>
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{event.actor.name}</strong> ({event.actor.role}) · {event.reason}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  <span>{event.resource}</span>
                  <span style={{ color: 'var(--text-accent)' }}>{event.requestId}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setCurrentView('audit')}
            style={{ width: '100%', marginTop: 4 }}
          >
            Inspect Immutable Audit Ledger ({auditEvents.length} records)
          </button>
        </div>
      </div>
    </div>
  );
};
