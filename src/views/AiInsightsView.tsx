import React from 'react';
import {
  Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const AiInsightsView: React.FC = () => {
  const { aiInsights, applyAiMitigation, dismissAiInsight, setIsAiDrawerOpen } = useApp();

  return (
    <div className="view-container">
      <div className="view-header">
        <div className="view-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="badge badge-ai">OPERATIONAL SENTINEL AI</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
              Confidence Floor: 80.0% · Continuous Inference
            </span>
          </div>
          <h1 className="view-title">AI Intelligence & Anomaly Layer</h1>
          <p className="view-subtitle">
            Attention → Understand → Decide → Act → Verify. Machine learning model continuously auditing telemetry for deviations.
          </p>
        </div>

        <div className="view-actions">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setIsAiDrawerOpen(true)}
          >
            <Sparkles size={14} /> Open AI Natural Language Console
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {aiInsights
          .filter((ai) => !ai.dismissed)
          .map((insight) => (
            <div
              key={insight.id}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: 6,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 14
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className="badge badge-ai">{insight.anomalyType}</span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                      Detected {insight.detectedTime}
                    </span>
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {insight.title}
                  </h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="badge badge-info">{insight.confidence}% Confidence</span>
                </div>
              </div>

              <div className="responsive-grid-equal" style={{ gap: 12 }}>
                <div style={{ background: 'var(--bg-surface-elevated)', padding: 12, borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 4 }}>
                    Potential Cause Hypothesis
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                    {insight.potentialCause}
                  </div>
                </div>

                <div style={{ background: 'var(--bg-surface-elevated)', padding: 12, borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 4 }}>
                    Statistical Baseline Envelope
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {insight.baselineComparison}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 6 }}>
                  Observed Telemetry Evidence
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {insight.evidence.map((ev, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '6px 12px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 4,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'var(--text-accent)'
                      }}
                    >
                      ▸ {ev}
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(35, 120, 87, 0.08) 0%, rgba(17, 24, 39, 0.8) 100%)',
                  border: '1px solid var(--brand-primary)',
                  padding: 14,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16
                }}
              >
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--brand-primary)' }}>
                    Recommended Action (Authorized Remediation)
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                    {insight.recommendedAction.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {insight.recommendedAction.description}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => dismissAiInsight(insight.id)}
                  >
                    Dismiss
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => applyAiMitigation(insight.id)}
                  >
                    Authorize Remediation
                  </button>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
