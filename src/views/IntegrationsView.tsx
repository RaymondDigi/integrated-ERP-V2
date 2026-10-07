import React from 'react';
import {
  RefreshCw,
  Plus
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const IntegrationsView: React.FC = () => {
  const { integrations, reconnectIntegration, addToast } = useApp();

  return (
    <div className="view-container">
      <div className="view-header">
        <div className="view-title-group">
          <h1 className="view-title">Enterprise Integrations & Connectors</h1>
          <p className="view-subtitle">
            Synchronized IAM directories, observability telemetry sinks, cloud IAM brokers, and communication hooks.
          </p>
        </div>

        <div className="view-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={() =>
              addToast({
                type: 'info',
                title: 'Add Integration',
                message: 'Enterprise connector catalog opened.'
              })
            }
          >
            <Plus size={14} /> Connect New Service
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {integrations.map((int) => (
          <div
            key={int.id}
            style={{
              background: 'var(--bg-surface)',
              border: int.status === 'DEGRADED' ? '1px solid var(--status-critical-border)' : '1px solid var(--border-subtle)',
              borderRadius: 6,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 12
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {int.name}
                  </h3>
                  <span className="badge badge-neutral">{int.type}</span>
                </div>
                <span
                  className={`badge ${
                    int.status === 'CONNECTED'
                      ? 'badge-success'
                      : int.status === 'DEGRADED'
                      ? 'badge-critical'
                      : 'badge-warning'
                  }`}
                >
                  ● {int.status}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                <div>Last Sync: {int.lastSync}</div>
                <div>Throughput: {int.throughput}</div>
                <div>Sync Frequency: {int.syncInterval}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {int.endpoint}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 11, color: int.errorCount24h > 0 ? 'var(--status-critical-text)' : 'var(--text-tertiary)' }}>
                {int.errorCount24h} errors (24h)
              </span>

              <button
                className="btn btn-secondary btn-xs"
                onClick={() => reconnectIntegration(int.id)}
              >
                <RefreshCw size={12} /> Test & Re-authenticate
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
