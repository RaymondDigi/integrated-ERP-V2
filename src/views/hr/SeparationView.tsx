import React from 'react';
import { ArrowLeft, ClipboardCheck, FileCheck, LogOut, PieChart, Wallet } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { clearanceDone, noticeFacts } from '../../data/sepEngine';
import { AnalyticsTab, CasesTab, ClearanceTab, DuesTab } from './separation/SeparationTabs';
import { useFinalSlip } from './separation/ExitCase';
import { kes } from './payroll/reports';

const TABS = [
  { id: 'cases', label: 'Exit cases', icon: LogOut },
  { id: 'clearance', label: 'Clearance board', icon: ClipboardCheck },
  { id: 'dues', label: 'Final dues', icon: Wallet },
  { id: 'analytics', label: 'Turnover & exit interviews', icon: PieChart }
];

/** Net final pay for the leaver closest to their last day (shown in the stat strip). */
const NextDues: React.FC = () => {
  const { tenantExitCases, hrEmployees } = useApp();
  const next = tenantExitCases.filter((c) => !['PAID', 'CLOSED', 'WITHDRAWN'].includes(c.stage)).sort((a, b) => a.lastDay.localeCompare(b.lastDay))[0];
  const e = next && hrEmployees.find((x) => x.staffId === next.staffId);
  const f = useFinalSlip(next, e);
  return (
    <div className="hr-stat-card">
      <div className="hr-stat-label">Next final payment</div>
      <div className="hr-stat-value" style={{ color: '#059669' }}>
        {f ? `KES ${kes(f.slip.net)}` : '—'}
      </div>
      <div className="hr-stat-subtext">{next && e ? `${e.fullName}, ${next.lastDay.slice(0, 7)} payroll` : 'No exits in progress'}</div>
    </div>
  );
};

export const SeparationView: React.FC = () => {
  const { setCurrentView, moduleTabs, setModuleTab, tenantExitCases, hrEmployees } = useApp();
  const tab = moduleTabs['separation'] ?? 'cases';
  const active = tenantExitCases.filter((c) => !['PAID', 'CLOSED', 'WITHDRAWN'].includes(c.stage));
  const openItems = active.flatMap((c) => c.clearance).filter((x) => x.status === 'OPEN').length;
  const owed = active.reduce((s, c) => {
    const e = hrEmployees.find((x) => x.staffId === c.staffId);
    return s + (e ? noticeFacts(c, e).payInLieu : 0);
  }, 0);

  return (
    <div className="hr-app-view">
      <div className="hr-app-header">
        <div>
          <div className="hr-breadcrumb-bar">
            <button className="hr-breadcrumb-btn" onClick={() => setCurrentView('apps')}>
              <ArrowLeft size={13} /> Return to Apps Launcher
            </button>
            <span>/</span>
            <span>Process #12 (Final Stage)</span>
          </div>
          <div className="hr-app-title-group">
            <div className="hr-app-icon-wrapper" style={{ background: 'linear-gradient(135deg, #64748b, #334155)' }}>
              <FileCheck size={22} />
            </div>
            <div>
              <h1>
                <span>Employee Separation, Clearance &amp; Final Dues</span>
                <span className="digicraft-badge-light">Process #12</span>
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                Notice, five-department clearance, exit interview, final dues through payroll, certificate of service and P9.
              </p>
            </div>
          </div>
        </div>
        <div className="hr-app-actions">
          <button className="btn btn-primary" onClick={() => setCurrentView('apps')}>
            <span>Return to Apps Launcher</span>
          </button>
        </div>
      </div>

      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Exits in progress</div>
          <div className="hr-stat-value">{active.length}</div>
          <div className="hr-stat-subtext">{active.filter((c) => c.stage === 'NOTICE').length} serving notice · {active.filter((c) => c.stage === 'DUES').length} at final dues</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Clearance items open</div>
          <div className="hr-stat-value" style={{ color: openItems ? '#d97706' : undefined }}>
            {openItems}
          </div>
          <div className="hr-stat-subtext">{active.filter((c) => clearanceDone(c)).length} leavers fully cleared</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Pay in lieu of notice</div>
          <div className="hr-stat-value">KES {kes(owed)}</div>
          <div className="hr-stat-subtext">Owed by the company on current exits</div>
        </div>
        <NextDues />
      </div>

      <div className="pr-tabstrip" role="tablist" aria-label="Separation sections">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setModuleTab('separation', t.id)}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'cases' && <CasesTab />}
      {tab === 'clearance' && <ClearanceTab />}
      {tab === 'dues' && <DuesTab />}
      {tab === 'analytics' && <AnalyticsTab />}
    </div>
  );
};
