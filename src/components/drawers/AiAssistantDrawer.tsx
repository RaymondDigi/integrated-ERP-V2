import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useApp, type NavigationTarget } from '../../context/AppContext';
import { useSnapshot } from '../../suites/hub/snapshot';
import { buildAlerts, dataQualityIssues, linearForecast } from '../../suites/hub/Insights';
import { monthlySeries, kes, round2, TODAY } from '../../suites/finance/engine';
import { slaState } from '../../suites/control/engine';

export const AiAssistantDrawer: React.FC = () => {
  const {
    isAiDrawerOpen,
    setIsAiDrawerOpen,
    aiInsights,
    applyAiMitigation,
    dismissAiInsight,
    setCurrentView,
    users
  } = useApp();
  // Answers are computed from the live ERP records, not canned text
  const snap = useSnapshot();
  const answer = (q: string) => {
    const t = q.toLowerCase();
    const resp = (title: string, summary: string, evidence: string[], affected: string[], label: string, view: NavigationTarget, confidence = 100) => ({ title, summary, confidence, evidence: evidence.length ? evidence.slice(0, 8) : ['Nothing found'], affectedSystems: affected, recommendedAction: { label, actionKey: view } });
    if (/forecast|revenue|predict|trend/.test(t)) {
      const year = Number(TODAY.slice(0, 4));
      const series = monthlySeries(snap.fin.state, snap.fin.entries, year).slice(0, Number(TODAY.slice(5, 7)));
      const fc = linearForecast(series.map((m) => m.revenue), 3);
      return resp('Revenue forecast', `Linear trend over ${series.length} months of ${year}: next three months ${fc.map((v) => kes(v, { compact: true })).join(', ')}.`, series.map((m) => `${m.label}: revenue ${kes(m.revenue, { compact: true })}, profit ${kes(m.profit, { compact: true })}`), ['Finance'], 'Open forecasts & recommendations', 'executive', 80);
    }
    if (/quality|inconsisten|duplicate|missing data|clean/.test(t)) {
      const dq = dataQualityIssues(snap);
      return resp('Data quality issues', `${dq.length} issues found across parties, products, documents, staff, assets and risks.`, dq.map((d) => `${d.check} — ${d.record}: ${d.problem}`), [...new Set(dq.map((d) => d.module))], 'Open data quality checks', 'executive');
    }
    if (/stock|reorder|inventory/.test(t))
      return resp('Items below reorder level', `${snap.lowStock.length} items need reordering; stock at cost ${kes(snap.stockValue, { compact: true })}.`, snap.lowStock.map((p) => `${p.name}: ${p.stock} ${p.unit} (reorder at ${p.reorderLevel}, order ${p.reorderQty})`), ['Trading', 'Procurement'], 'Open procurement', 'procurement');
    if (/risk|kri/.test(t))
      return resp('High risks', `${snap.highRisks.length} risks rated high on the register.`, snap.highRisks.map((r) => `${r.title} — owner ${r.owner}`), ['Quality & risk'], 'Open the risk register', 'quality');
    if (/ticket|ict|sla|helpdesk/.test(t)) {
      const open = snap.ctl.state.tickets.filter((x) => x.status !== 'RESOLVED');
      return resp('ICT service desk', `${open.length} open tickets, ${snap.slaRisk.length} close to or past their SLA.`, open.map((x) => `${x.number} ${x.priority} — ${x.title}${slaState(x).resolveBreached ? ' (breached)' : ''}`), ['ICT'], 'Open the service desk', 'ict');
    }
    if (/complain|customer/.test(t)) {
      const open = snap.ctl.state.complaints.filter((c) => c.status !== 'RESOLVED');
      return resp('Customer complaints', `${open.length} open complaints.`, open.map((c) => `${c.number} ${c.severity.toLowerCase()} ${c.category} — ${c.sku}`), ['Quality'], 'Open complaints', 'quality');
    }
    if (/mfa|user|privileg/.test(t)) {
      const risky = users.filter((u) => u.mfa === 'Not Configured');
      return resp('Accounts without MFA', `${risky.length} of ${users.length} accounts have no MFA configured.`, risky.map((u) => `${u.name} (${u.role}, ${u.email})`), ['Identity'], 'Review users', 'users');
    }
    const alerts = buildAlerts(snap, { needsReorder: snap.lowStock.length, arOverdue60: round2(snap.ar.totals[3] + snap.ar.totals[4]), equipmentDown: snap.downAssets.length });
    return resp('What needs attention', `${alerts.filter((a) => a.level === 'critical').length} critical and ${alerts.filter((a) => a.level === 'warning').length} warning alerts across the business.`, alerts.map((a) => `${a.level === 'critical' ? 'CRITICAL' : 'Warning'} · ${a.module}: ${a.title}`), [...new Set(alerts.map((a) => a.module))], 'Open the alert centre', 'executive', 95);
  };

  const [query, setQuery] = useState('');
  const [activeQueryResponse, setActiveQueryResponse] = useState<any | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  if (!isAiDrawerOpen) return null;

  const handleRunInquiry = (q: string) => {
    setIsAnalyzing(true);
    setQuery(q);

    setTimeout(() => {
      setIsAnalyzing(false);
      setActiveQueryResponse(answer(q));
    }, 300);
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
              'What needs attention today?',
              'Revenue forecast',
              'Data quality issues',
              'Items to reorder',
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
                    setCurrentView(activeQueryResponse.recommendedAction.actionKey === 'nav_wq' ? 'work-queue' : (activeQueryResponse.recommendedAction.actionKey as NavigationTarget));
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
