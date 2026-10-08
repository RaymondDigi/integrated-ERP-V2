import React from 'react';
import {
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { BackupStoragePanel, ErpHealthPanel } from '../suites/control/IctExtra';

export const HealthView: React.FC = () => {
  const { systemHealth, addToast } = useApp();

  return (
    <div className="view-container">
      <div className="view-header">
        <div className="view-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="badge badge-success">SLO TARGET: 99.95%</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
              Telemetry Source: Prometheus & OpenTelemetry Mesh
            </span>
          </div>
          <h1 className="view-title">System Health & Infrastructure</h1>
          <p className="view-subtitle">
            Real-time microservice latency percentiles, error budgets, pod saturation, and cluster health.
          </p>
        </div>

        <div className="view-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() =>
              addToast({
                type: 'info',
                title: 'Metrics Refreshed',
                message: 'Pulled fresh telemetry snapshot from regional collectors.'
              })
            }
          >
            <RefreshCw size={14} /> Refresh Telemetry
          </button>
        </div>
      </div>

      {/* Overview Metric Row */}
      <div className="pulse-grid">
        <div className="pulse-card">
          <span className="pulse-label">Overall Availability</span>
          <div className="pulse-value-row">
            <span className="pulse-value">99.98%</span>
            <span className="pulse-delta positive">Healthy</span>
          </div>
          <span className="pulse-subtext">30-day trailing rolling window</span>
        </div>

        <div className="pulse-card">
          <span className="pulse-label">P95 Global Latency</span>
          <div className="pulse-value-row">
            <span className="pulse-value">22ms</span>
            <span className="pulse-delta positive">-4ms</span>
          </div>
          <span className="pulse-subtext">Target: &lt;50ms</span>
        </div>

        <div className="pulse-card">
          <span className="pulse-label">P99 Gateway Latency</span>
          <div className="pulse-value-row">
            <span className="pulse-value">48ms</span>
            <span className="pulse-delta negative">+12ms</span>
          </div>
          <span className="pulse-subtext">Drift from API traffic spike</span>
        </div>

        <div className="pulse-card">
          <span className="pulse-label">Remaining Error Budget</span>
          <div className="pulse-value-row">
            <span className="pulse-value">84.2%</span>
            <span className="pulse-delta positive">Within Budget</span>
          </div>
          <span className="pulse-subtext">Cycle resets in 22 days</span>
        </div>
      </div>

      <div className="sx-row" style={{ marginBottom: 16 }}>
        <ErpHealthPanel />
        <BackupStoragePanel />
      </div>

      {/* Microservice Mesh Table */}
      <div className="emc-table-card">
        <div className="emc-table-toolbar">
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Microservice Health Mesh ({systemHealth.length} Nodes)
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            All clusters running on EKS Multi-AZ Kubernetes
          </span>
        </div>

        <div className="emc-table-container">
          <table className="emc-table">
            <thead>
              <tr>
                <th className="emc-th">Service Name</th>
                <th className="emc-th">Category</th>
                <th className="emc-th">Status</th>
                <th className="emc-th">P95 Latency</th>
                <th className="emc-th">P99 Latency</th>
                <th className="emc-th">Error Rate</th>
                <th className="emc-th">30-Day Uptime</th>
                <th className="emc-th">Error Budget</th>
                <th className="emc-th">Cluster Region</th>
              </tr>
            </thead>
            <tbody>
              {systemHealth.map((srv) => (
                <tr key={srv.id} className="emc-tr">
                  <td className="emc-td" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {srv.name}
                  </td>
                  <td className="emc-td">
                    <span className="badge badge-neutral">{srv.category}</span>
                  </td>
                  <td className="emc-td">
                    <span
                      className={`badge ${
                        srv.status === 'operational'
                          ? 'badge-success'
                          : srv.status === 'degraded'
                          ? 'badge-warning'
                          : 'badge-critical'
                      }`}
                    >
                      ● {srv.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="emc-td emc-td-mono">{srv.latencyP95}ms</td>
                  <td className="emc-td emc-td-mono">{srv.latencyP99}ms</td>
                  <td className="emc-td emc-td-mono" style={{ color: srv.errorRate > 0.02 ? 'var(--status-critical)' : 'inherit' }}>
                    {(srv.errorRate * 100).toFixed(2)}%
                  </td>
                  <td className="emc-td emc-td-mono">{srv.uptime30d}%</td>
                  <td className="emc-td">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 60, height: 4, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${srv.errorBudgetRemaining}%`,
                            height: '100%',
                            background: srv.errorBudgetRemaining < 30 ? 'var(--status-critical)' : 'var(--status-success)'
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                        {srv.errorBudgetRemaining.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="emc-td emc-td-mono">{srv.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
