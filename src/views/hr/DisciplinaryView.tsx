import React, { useMemo } from 'react';
import { ArrowLeft, CalendarClock, ChevronRight, FileWarning, Gavel, Scale, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { activeWarnings } from '../../data/discipline';
import { CasesTab } from './time/CasesTab';
import { WarningsTab } from './time/WarningsTab';
import { HearingsTab } from './time/HearingsTab';
import { ComplianceTab } from './time/ComplianceTab';

export const DISCIPLINARY_TABS = [
  { id: 'cases', label: 'Cases', icon: Gavel },
  { id: 'hearings', label: 'Hearings & deadlines', icon: CalendarClock },
  { id: 'warnings', label: 'Warnings register', icon: FileWarning },
  { id: 'compliance', label: 'Casual service (s.37)', icon: ShieldCheck }
];

export const DisciplinaryView: React.FC = () => {
  const { setCurrentView, moduleTabs, setModuleTab, activeTenant, disciplinaryCases, selectedOrgId, timeToday } = useApp();
  const tab = moduleTabs['disciplinary'] ?? 'cases';

  const stats = useMemo(() => {
    const cs = disciplinaryCases.filter((c) => c.orgId === selectedOrgId);
    const open = cs.filter((c) => c.stage !== 'CLOSED');
    const hearings = open.filter((c) => c.stage === 'HEARING' && c.hearing && c.hearing.date >= timeToday && c.hearing.date <= `${timeToday.slice(0, 8)}31`);
    const staff = [...new Set(cs.map((c) => c.staffId))];
    const warnings = staff.reduce((n, id) => n + activeWarnings(cs, id, timeToday).length, 0);
    const suspended = cs.filter((c) => c.outcome?.suspension && c.outcome.suspension.from <= timeToday && c.outcome.suspension.to >= timeToday && c.appeal?.status !== 'UPHELD').length;
    const overdue = open.filter((c) => c.stage === 'SHOW_CAUSE' && !c.showCause?.response && c.showCause!.responseDue < timeToday).length;
    return { open: open.length, appeals: open.filter((c) => c.stage === 'APPEAL').length, hearings: hearings.length, warnings, suspended, overdue };
  }, [disciplinaryCases, selectedOrgId, timeToday]);

  return (
    <div className="hr-app-view">
      <div className="hr-app-header">
        <div>
          <div className="hr-breadcrumb-bar">
            <button className="hr-breadcrumb-btn" onClick={() => setCurrentView('apps')}>
              <ArrowLeft size={13} /> Return to Apps Launcher
            </button>
            <span>/</span>
            <span>Process #10</span>
            <span>/</span>
            <span>{DISCIPLINARY_TABS.find((t) => t.id === tab)?.label ?? 'Cases'}</span>
          </div>

          <div className="hr-app-title-group">
            <div className="hr-app-icon-wrapper" style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>
              <Scale size={22} />
            </div>
            <div>
              <h1>
                <span>Compliance & Disciplinary</span>
                <span className="digicraft-badge-light">Process #10</span>
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                {activeTenant.name}: due-process cases, warnings, hearings and the casual service threshold.
              </p>
            </div>
          </div>
        </div>

        <div className="hr-app-actions">
          <button className="btn btn-primary" onClick={() => setCurrentView('osh-security')}>
            <span>Go to OSH & Security (#11)</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Open cases</div>
          <div className="hr-stat-value">{stats.open}</div>
          <div className="hr-stat-subtext">
            {stats.appeals} on appeal · {stats.overdue} show-cause overdue
          </div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Hearings this month</div>
          <div className="hr-stat-value">{stats.hearings}</div>
          <div className="hr-stat-subtext">Still to be held</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Live warnings</div>
          <div className="hr-stat-value" style={{ color: stats.warnings ? 'var(--status-warning)' : undefined }}>
            {stats.warnings}
          </div>
          <div className="hr-stat-subtext">Escalate the next sanction</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Suspended today</div>
          <div className="hr-stat-value" style={{ color: stats.suspended ? 'var(--status-critical)' : undefined }}>
            {stats.suspended}
          </div>
          <div className="hr-stat-subtext">Pay reduced through payroll</div>
        </div>
      </div>

      <div className="pr-tabstrip" role="tablist" aria-label="Disciplinary sections">
        {DISCIPLINARY_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setModuleTab('disciplinary', t.id)}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'cases' && <CasesTab />}
      {tab === 'hearings' && <HearingsTab />}
      {tab === 'warnings' && <WarningsTab />}
      {tab === 'compliance' && <ComplianceTab />}
    </div>
  );
};
