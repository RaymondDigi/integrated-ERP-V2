import React from 'react';
import {
  AlertOctagon,
  RotateCcw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const WorkflowsView: React.FC = () => {
  const { workflows, retryWorkflow } = useApp();

  return (
    <div className="view-container">
      <div className="view-header">
        <div className="view-title-group">
          <h1 className="view-title">Workflows & Background Jobs</h1>
          <p className="view-subtitle">
            Distributed execution DAGs, asynchronous batch reconciliations, and failure triage.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {workflows.map((wf) => (
          <div
            key={wf.id}
            style={{
              background: 'var(--bg-surface)',
              border: wf.status === 'FAILED' ? '1px solid var(--status-critical-border)' : '1px solid var(--border-subtle)',
              borderRadius: 6,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span
                    className={`badge ${
                      wf.status === 'SUCCESS'
                        ? 'badge-success'
                        : wf.status === 'FAILED'
                        ? 'badge-critical'
                        : 'badge-warning'
                    }`}
                  >
                    ● {wf.status}
                  </span>
                  <span className="badge badge-neutral">{wf.trigger}</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                    Last Run: {wf.lastRun} · Duration: {wf.duration}
                  </span>
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {wf.name}
                </h3>
              </div>

              {wf.status === 'FAILED' && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => retryWorkflow(wf.id)}
                >
                  <RotateCcw size={14} /> Replay Failed Steps
                </button>
              )}
            </div>

            {wf.errorDetails && wf.status === 'FAILED' && (
              <div
                style={{
                  background: 'var(--status-critical-bg)',
                  border: '1px solid var(--status-critical-border)',
                  borderRadius: 4,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: 'var(--status-critical-text)'
                }}
              >
                <AlertOctagon size={16} />
                <span>
                  <strong>Failure at step '{wf.errorDetails.step}':</strong> {wf.errorDetails.message}
                </span>
              </div>
            )}

            {/* Step DAG Pipeline Execution Visualizer */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                Execution Pipeline Steps
              </div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {wf.steps.map((step, idx) => (
                  <div
                    key={idx}
                    style={{
                      flex: '1 0 160px',
                      background: 'var(--bg-surface-elevated)',
                      border:
                        step.status === 'failed'
                          ? '1px solid var(--status-critical)'
                          : step.status === 'success'
                          ? '1px solid var(--border-subtle)'
                          : '1px solid var(--brand-primary)',
                      borderRadius: 4,
                      padding: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                        Step 0{idx + 1}
                      </span>
                      <span
                        className={`badge ${
                          step.status === 'success'
                            ? 'badge-success'
                            : step.status === 'failed'
                            ? 'badge-critical'
                            : step.status === 'running'
                            ? 'badge-warning'
                            : 'badge-neutral'
                        }`}
                      >
                        {step.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {step.name}
                    </div>
                    <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                      {step.duration}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
