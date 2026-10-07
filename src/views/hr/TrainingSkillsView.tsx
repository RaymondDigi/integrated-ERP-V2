import React, { useMemo } from 'react';
import { ArrowLeft, BadgeCheck, CalendarDays, ChevronRight, ClipboardList, Coins, FileSignature, GraduationCap, Wallet } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { hoursYtd, isActiveOn, kes, matrixStats } from '../../data/trainingEngine';
import { useTrainingOrg } from './training/shared';
import { MatrixTab } from './training/MatrixTab';
import { NeedsTab } from './training/NeedsTab';
import { PlanTab } from './training/PlanTab';
import { SessionsTab } from './training/SessionsTab';
import { NitaTab } from './training/NitaTab';
import { BondsTab } from './training/BondsTab';

export const TRAINING_TABS = [
  { id: 'matrix', label: 'Skills matrix', icon: BadgeCheck },
  { id: 'needs', label: 'Training needs', icon: ClipboardList },
  { id: 'plan', label: 'Catalogue & budget', icon: Wallet },
  { id: 'sessions', label: 'Sessions', icon: CalendarDays },
  { id: 'nita', label: 'Costs & NITA', icon: Coins },
  { id: 'bonds', label: 'Training bonds', icon: FileSignature }
];

export const TrainingSkillsView: React.FC = () => {
  const { setCurrentView, moduleTabs, setModuleTab, activeTenant } = useApp();
  const tab = moduleTabs['training'] ?? 'matrix';
  const { matrix, staff, sessions, budget, needs, year, today } = useTrainingOrg();

  const stats = useMemo(() => {
    const m = matrixStats(matrix);
    const active = staff.filter((e) => isActiveOn(e, today));
    const hours = hoursYtd(sessions, year);
    const total = active.reduce((s, e) => s + (hours.get(e.staffId) ?? 0), 0);
    const b = budget.reduce((s, l) => ({ budget: s.budget + l.budget, spent: s.spent + l.spent, committed: s.committed + l.committed }), { budget: 0, spent: 0, committed: 0 });
    return {
      ...m,
      hoursPer: active.length ? Math.round((total / active.length) * 10) / 10 : 0,
      trained: active.filter((e) => hours.has(e.staffId)).length,
      active: active.length,
      ...b,
      toApprove: needs.filter((n) => n.status === 'Proposed').length
    };
  }, [matrix, staff, sessions, budget, needs, year, today]);

  const usedPct = stats.budget ? Math.round(((stats.spent + stats.committed) / stats.budget) * 100) : 0;

  return (
    <div className="hr-app-view tr-view">
      <div className="hr-app-header">
        <div>
          <div className="hr-breadcrumb-bar">
            <button className="hr-breadcrumb-btn" onClick={() => setCurrentView('apps')}>
              <ArrowLeft size={13} /> Return to Apps Launcher
            </button>
            <span>/</span>
            <span>Process #09</span>
            <span>/</span>
            <span>{TRAINING_TABS.find((t) => t.id === tab)?.label ?? 'Skills matrix'}</span>
          </div>

          <div className="hr-app-title-group">
            <div className="hr-app-icon-wrapper" style={{ background: 'linear-gradient(135deg, #153e33, #4338ca)' }}>
              <GraduationCap size={22} />
            </div>
            <div>
              <h1>
                <span>Learning & development</span>
                <span className="digicraft-badge-light">Process #09</span>
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                {activeTenant.name}: certifications, training needs, sessions, NITA levy claims and training bonds.
              </p>
            </div>
          </div>
        </div>

        <div className="hr-app-actions">
          <button className="btn btn-primary" onClick={() => setCurrentView('disciplinary')}>
            <span>Go to Compliance (#10)</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Certification compliance</div>
          <div className="hr-stat-value" style={{ color: stats.pct >= 90 ? 'var(--status-success)' : stats.pct >= 75 ? 'var(--status-warning)' : 'var(--status-critical)' }}>
            {stats.pct}%
          </div>
          <div className="hr-stat-subtext">
            {stats.compliant} of {stats.required} required · {stats.expired} expired, {stats.missing} missing
          </div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Expiring soon</div>
          <div className="hr-stat-value" style={{ color: stats.due30 ? 'var(--status-warning)' : undefined }}>
            {stats.due30} <span className="tm-stat-of">in 30 days</span>
          </div>
          <div className="hr-stat-subtext">{stats.due90} within 90 days · {stats.toApprove} needs to approve</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Hours trained {year}</div>
          <div className="hr-stat-value">
            {stats.hoursPer} <span className="tm-stat-of">per employee</span>
          </div>
          <div className="hr-stat-subtext">
            {stats.trained} of {stats.active} staff attended training
          </div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Spend vs budget</div>
          <div className="hr-stat-value" style={{ color: usedPct > 100 ? 'var(--status-critical)' : undefined }}>
            {kes(stats.spent)}
          </div>
          <div className="hr-stat-subtext">
            of {kes(stats.budget)} · {usedPct}% used incl. {kes(stats.committed)} committed
          </div>
        </div>
      </div>

      <div className="pr-tabstrip" role="tablist" aria-label="Training sections">
        {TRAINING_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setModuleTab('training', t.id)}>
              <Icon size={14} /> {t.label}
              {t.id === 'needs' && stats.toApprove > 0 && <span className="tm-tab-count">{stats.toApprove}</span>}
            </button>
          );
        })}
      </div>

      {tab === 'matrix' && <MatrixTab />}
      {tab === 'needs' && <NeedsTab />}
      {tab === 'plan' && <PlanTab />}
      {tab === 'sessions' && <SessionsTab />}
      {tab === 'nita' && <NitaTab />}
      {tab === 'bonds' && <BondsTab />}
    </div>
  );
};
