import React, { useMemo } from 'react';
import { Award, ArrowLeft, ChevronRight, LayoutDashboard, Target, MessageSquare, ClipboardCheck, Grid3x3, Coins, LifeBuoy, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { average, checkInOverdue, isOverdue } from '../../data/perfEngine';
import { usePerfData } from './performance/shared';
import { OverviewTab } from './performance/OverviewTab';
import { GoalsTab } from './performance/GoalsTab';
import { CheckInsTab } from './performance/CheckInsTab';
import { AppraisalsTab } from './performance/AppraisalsTab';
import { CalibrationTab } from './performance/CalibrationTab';
import { RewardsTab } from './performance/RewardsTab';
import { PipTab } from './performance/PipTab';
import { SetupTab } from './performance/SetupTab';

export const PERFORMANCE_TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'goals', label: 'Goals & cascade', icon: Target },
  { id: 'checkins', label: 'Check-ins & feedback', icon: MessageSquare },
  { id: 'appraisals', label: 'Appraisals', icon: ClipboardCheck },
  { id: 'calibration', label: 'Calibration & 9-box', icon: Grid3x3 },
  { id: 'rewards', label: 'Rewards', icon: Coins },
  { id: 'pip', label: 'PIPs & development', icon: LifeBuoy },
  { id: 'setup', label: 'Scales & policy', icon: SlidersHorizontal }
];

export const PerformanceView: React.FC = () => {
  const { setCurrentView, moduleTabs, setModuleTab, activeTenant, checkIns, pips, perfToday } = useApp();
  const tab = moduleTabs['performance'] ?? 'overview';
  const { cycle, aps, ratingOf } = usePerfData();

  const stats = useMemo(() => {
    const done = aps.filter((a) => a.stage === 'CLOSED' || a.stage === 'ACKNOWLEDGEMENT' || a.stage === 'DISPUTED').length;
    const rated = aps.map((a) => ratingOf(a)).filter((r) => r.rating);
    const final = rated.filter((r) => !r.provisional).map((r) => r.rating!);
    const ci = cycle ? checkIns.filter((c) => c.cycleId === cycle.id) : [];
    const overdueCi = ci.filter((c) => checkInOverdue(c, perfToday)).length;
    const overdueAp = aps.filter((a) => isOverdue(a, cycle, perfToday)).length;
    const openPips = pips.filter((p) => p.orgId === cycle?.orgId && (p.status === 'ACTIVE' || p.status === 'EXTENDED')).length;
    return {
      n: aps.length,
      done,
      pct: aps.length ? Math.round((done / aps.length) * 100) : 0,
      selfDone: aps.filter((a) => a.selfOn).length,
      avg: average(rated.map((r) => r.rating!)),
      avgFinal: average(final),
      ratedN: rated.length,
      finalN: final.length,
      overdueCi,
      overdueAp,
      openPips
    };
  }, [aps, ratingOf, cycle, checkIns, perfToday, pips]);

  const label = PERFORMANCE_TABS.find((t) => t.id === tab)?.label ?? 'Overview';

  return (
    <div className="hr-app-view pf-view">
      <div className="hr-app-header">
        <div>
          <div className="hr-breadcrumb-bar">
            <button className="hr-breadcrumb-btn" onClick={() => setCurrentView('apps')}>
              <ArrowLeft size={13} /> Return to Apps Launcher
            </button>
            <span>/</span>
            <span>Process #08</span>
            <span>/</span>
            <span>{label}</span>
          </div>

          <div className="hr-app-title-group">
            <div className="hr-app-icon-wrapper" style={{ background: 'linear-gradient(135deg, #ec4899, #be185d)' }}>
              <Award size={22} />
            </div>
            <div>
              <h1>
                <span>Performance Management</span>
                <span className="digicraft-badge-light">Process #08</span>
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                {activeTenant.name}: goals, check-ins, appraisals, calibration, rewards and improvement plans.
              </p>
            </div>
          </div>
        </div>

        <div className="hr-app-actions">
          <button className="btn btn-primary" onClick={() => setCurrentView('training')}>
            <span>Go to Training (#09)</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">{cycle ? `${cycle.name} completion` : 'Appraisal cycle'}</div>
          <div className="hr-stat-value">{cycle ? `${stats.pct}%` : '—'}</div>
          <div className="hr-stat-subtext">
            {stats.done} of {stats.n} rated and released · {stats.selfDone} self-assessments in
          </div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Average rating</div>
          <div className="hr-stat-value" style={{ color: '#be185d' }}>
            {stats.avg !== null ? `${stats.avg.toFixed(2)} / 5` : '—'}
          </div>
          <div className="hr-stat-subtext">
            {stats.ratedN} rated so far{stats.avgFinal !== null ? ` · ${stats.avgFinal.toFixed(2)} across ${stats.finalN} calibrated` : ''}
          </div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Overdue</div>
          <div className="hr-stat-value" style={{ color: stats.overdueCi + stats.overdueAp ? 'var(--status-critical)' : undefined }}>
            {stats.overdueCi + stats.overdueAp}
          </div>
          <div className="hr-stat-subtext">
            {stats.overdueCi} check-ins · {stats.overdueAp} review stages past due
          </div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Open improvement plans</div>
          <div className="hr-stat-value" style={{ color: stats.openPips ? '#b45309' : undefined }}>
            {stats.openPips}
          </div>
          <div className="hr-stat-subtext">Ratings of 2 or below open a plan</div>
        </div>
      </div>

      <div className="pr-tabstrip" role="tablist" aria-label="Performance sections">
        {PERFORMANCE_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setModuleTab('performance', t.id)}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {!cycle ? (
        <div className="pr-note">No active performance cycle for {activeTenant.name}.</div>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab />}
          {tab === 'goals' && <GoalsTab />}
          {tab === 'checkins' && <CheckInsTab />}
          {tab === 'appraisals' && <AppraisalsTab />}
          {tab === 'calibration' && <CalibrationTab />}
          {tab === 'rewards' && <RewardsTab />}
          {tab === 'pip' && <PipTab />}
          {tab === 'setup' && <SetupTab />}
        </>
      )}
    </div>
  );
};
