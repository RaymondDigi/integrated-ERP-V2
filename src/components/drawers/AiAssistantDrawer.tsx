import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const AiAssistantDrawer: React.FC = () => {
  const {
    isAiDrawerOpen,
    setIsAiDrawerOpen,
    aiInsights,
    applyAiMitigation,
    dismissAiInsight,
    setCurrentView
  } = useApp();

  const [query, setQuery] = useState('');
  const [activeQueryResponse, setActiveQueryResponse] = useState<any | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  if (!isAiDrawerOpen) return null;

  const handleRunInquiry = (q: string) => {
    setIsAnalyzing(true);
    setQuery(q);

    setTimeout(() => {
      setIsAnalyzing(false);
      if (q.toLowerCase().includes('workflow') || q.toLowerCase().includes('fail')) {
        setActiveQueryResponse({
          title: 'Root-Cause Analysis: Nightly Billing Workflow Failure',
          summary: 'Snowflake warehouse warehouse_etl_xlarge encountered a 600s query cancellation on partition lock.',
          confidence: 92.4,
          evidence: [
            'Query ID 01b4429c-0001-44fe-0000-00011867 timed out at 16:02:15 UTC',
            'Lock contention against Snowflake CDC ingestion stream',
            '17 parallel thread workers aborted'
          ],
          affectedSystems: ['Workflow Orchestration Engine', 'Snowflake DW', 'Billing Dispatcher'],
          recommendedAction: {
            label: 'Replay with Extended Timeout (1800s) & Warehouse Scale',
            actionKey: 'WI-8940'
          }
        });
      } else if (q.toLowerCase().includes('api') || q.toLowerCase().includes('traffic')) {
        setActiveQueryResponse({
          title: 'Investigation: +41% API Traffic Anomaly',
          summary: 'Scraper daemon `srv_datadog_agent_prod` polling frequency increased from 60s to 500ms post deployment v2.4.1.',
          confidence: 89.4,
          evidence: [
            '84,200 req/min vs 59,700 req/min baseline envelope',
            'Origin IP: 54.236.192.42 (AWS us-east-1 Datadog collector)',
            '94% requests targeted at `/v2/organizations/*/usage-meters`'
          ],
          affectedSystems: ['Core API Gateway', 'Aurora Read Replicas'],
          recommendedAction: {
            label: 'Apply Dynamic Token Rate-Limit Profile',
            actionKey: 'WI-8938'
          }
        });
      } else if (q.toLowerCase().includes('mfa') || q.toLowerCase().includes('user')) {
        setActiveQueryResponse({
          title: 'Compliance Audit: Privileged Accounts without MFA',
          summary: 'Found 3 Super Admin accounts operating without mandatory multi-factor authentication enforcement.',
          confidence: 100.0,
          evidence: [
            'marcus.vance@citadel.com (Super Admin, last active 2m ago)',
            'helena.rostova@citadel.com (Super Admin, last active 45m ago)',
            'devops-emergency@citadel.com (Break-glass account, exemption expired)'
          ],
          affectedSystems: ['IAM Core', 'Citadel Dynamics Tenant Boundary'],
          recommendedAction: {
            label: 'Force Immediate FIDO2 Enrollment on Super Admins',
            actionKey: 'WI-8941'
          }
        });
      } else {
        setActiveQueryResponse({
          title: `Telemetry Investigation: "${q}"`,
          summary: 'Analyzed 1.8M system events from the preceding 4-hour operational window.',
          confidence: 85.0,
          evidence: [
            'Telemetry stream nominal across 6 microservice clusters',
            'Identified 2 critical work items awaiting triage in queue'
          ],
          affectedSystems: ['Production Cluster', 'Operational Mesh'],
          recommendedAction: {
            label: 'Review Mission Control Work Queue',
            actionKey: 'nav_wq'
          }
        });
      }
    }, 450);
  };

  return (
    <div className="emc-drawer-backdrop" onClick={() => setIsAiDrawerOpen(false)}>
      <div className="emc-drawer" onClick={(e) => e.stopPropagation()} style={{ width: 620 }}>
        {/* Header */}
        <div className="emc-drawer-header" style={{ borderBottomColor: 'rgba(168, 85, 247, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: 'rgba(168, 85, 247, 0.15)',
                border: '1px solid rgba(168, 85, 247, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#c084fc'
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Operational AI Intelligence
                </h3>
                <span className="badge badge-ai">LIVE SENTINEL</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Observe → Analyze → Prioritize → Recommend → Execute with Authorization → Audit
              </div>
            </div>
          </div>
          <button className="btn-ghost" onClick={() => setIsAiDrawerOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Natural Language Query Bar */}
        <div style={{ padding: '14px 20px', background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8, letterSpacing: '0.05em' }}>
            Ask System Intelligence
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="table-search-input"
              style={{ flex: 1, width: '100%' }}
              placeholder="e.g. Why did billing workflows fail at 16:00?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query) {
                  handleRunInquiry(query);
                }
              }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => query && handleRunInquiry(query)}
              disabled={isAnalyzing}
            >
              <Zap size={14} /> Analyze
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {[
              'Why did workflows fail?',
              'API traffic anomaly cause',
              'Privileged users without MFA'
            ].map((preset, idx) => (
              <button
                key={idx}
                className="btn btn-secondary btn-xs"
                onClick={() => handleRunInquiry(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="emc-drawer-body">
          {/* Active Query Analysis Response */}
          {isAnalyzing && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              Synthesizing telemetry across distributed traces and logs...
            </div>
          )}

          {activeQueryResponse && !isAnalyzing && (
            <div
              style={{
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-emphasis)',
                borderRadius: 6,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {activeQueryResponse.title}
                </span>
                <span className="badge badge-ai">
                  Confidence: {activeQueryResponse.confidence}%
                </span>
              </div>

              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {activeQueryResponse.summary}
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                  Observed Evidence
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {activeQueryResponse.evidence.map((ev: string, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: '6px 10px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 4,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--text-accent)'
                      }}
                    >
                      ▸ {ev}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Affected: {activeQueryResponse.affectedSystems.join(', ')}
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    if (activeQueryResponse.recommendedAction.actionKey === 'nav_wq') {
                      setCurrentView('work-queue');
                    } else {
                      setCurrentView('work-queue');
                    }
                    setIsAiDrawerOpen(false);
                  }}
                >
                  {activeQueryResponse.recommendedAction.label}
                </button>
              </div>
            </div>
          )}

          {/* Active AI Insights from System */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>
                Operational Sentinel Anomalies ({aiInsights.filter((ai) => !ai.dismissed).length})
              </h4>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Continuous Machine Learning Telemetry
              </span>
            </div>

            {aiInsights
              .filter((ai) => !ai.dismissed)
              .map((insight) => (
                <div
                  key={insight.id}
                  style={{
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span className="badge badge-ai">{insight.anomalyType}</span>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                          {insight.detectedTime}
                        </span>
                      </div>
                      <h5 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {insight.title}
                      </h5>
                    </div>
                    <span className="badge badge-info">
                      {insight.confidence}% Confidence
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <strong>Likely cause: </strong> {insight.potentialCause}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <strong>Baseline comparison: </strong> {insight.baselineComparison}
                  </div>

                  <div style={{ background: 'var(--bg-input)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                      Telemetry Evidence
                    </span>
                    {insight.evidence.map((ev, i) => (
                      <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-accent)' }}>
                        • {ev}
                      </span>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => dismissAiInsight(insight.id)}
                    >
                      Dismiss
                    </button>
                    <button
                      className="btn btn-primary btn-xs"
                      onClick={() => applyAiMitigation(insight.id)}
                    >
                      Authorize Remediation ({insight.recommendedAction.label})
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="emc-drawer-footer">
          <button className="btn btn-secondary btn-sm" onClick={() => setIsAiDrawerOpen(false)}>
            Close AI Console
          </button>
        </div>
      </div>
    </div>
  );
};
