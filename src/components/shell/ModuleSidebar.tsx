import React from 'react';
import {
  LayoutGrid,
  Settings,
  ClipboardList,
  UserCheck,
  ShieldAlert,
  Users,
  Clock,
  CalendarDays,
  Coins,
  Award,
  GraduationCap,
  FileCheck,
  Building2,
  Zap,
  TrendingUp,
  FileText,
  ShieldCheck,
  Lock,
  Layers,
  Briefcase,
  Calendar,
  Send,
  FileSpreadsheet,
  CalendarClock,
  ListChecks,
  Timer,
  AlarmClock,
  Fingerprint,
  Gavel,
  FileWarning,
  BadgeCheck,
  Wallet,
  FileSignature
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Gauge as OshGauge, Siren as OshSiren, ShieldPlus as OshShieldPlus, KeyRound as OshKeyRound, Shirt as OshShirt, Stethoscope as OshStethoscope } from 'lucide-react';
import { Target, MessageSquare, ClipboardCheck, Grid3x3, LifeBuoy, SlidersHorizontal, LayoutDashboard, Mail } from 'lucide-react';
import { HR_PROCESS_APPS } from '../../data/hrMockData';
import { FinanceSidebar } from '../../suites/finance/FinanceSuite';
import { TradingSidebar } from '../../suites/commercial/trading/TradingSuite';
import { ProcurementSidebar } from '../../suites/commercial/procurement/ProcurementSuite';
import { BizDevSidebar } from '../../suites/commercial/bizdev/BizDev';
import { WarehousingSidebar } from '../../suites/operations/Warehousing';
import { ProductionSidebar } from '../../suites/operations/Production';
import { ShippingSidebar } from '../../suites/operations/Shipping';
import { FleetSidebar } from '../../suites/operations/Fleet';
import { MaintenanceSidebar } from '../../suites/operations/Maintenance';
import { QualitySidebar } from '../../suites/control/Quality';
import { IctSidebar } from '../../suites/control/Ict';
import { GovernanceSidebar } from '../../suites/control/Governance';
import { ApprovalsSidebar } from '../../suites/hub/Approvals';
import { ExecutiveSidebar } from '../../suites/hub/Executive';

export const ModuleSidebar: React.FC = () => {
  const { currentView, setCurrentView, activeTenant, isSidebarCollapsed, moduleTabs, setModuleTab } = useApp();

  const currentApp = HR_PROCESS_APPS.find((app) => app.id === currentView);

  if (currentView === 'finance') return <FinanceSidebar />;
  if (currentView === 'trading') return <TradingSidebar />;
  if (currentView === 'procurement') return <ProcurementSidebar />;
  if (currentView === 'bizdev') return <BizDevSidebar />;
  if (currentView === 'warehousing') return <WarehousingSidebar />;
  if (currentView === 'production') return <ProductionSidebar />;
  if (currentView === 'shipping') return <ShippingSidebar />;
  if (currentView === 'fleet') return <FleetSidebar />;
  if (currentView === 'maintenance') return <MaintenanceSidebar />;
  if (currentView === 'quality') return <QualitySidebar />;
  if (currentView === 'ict') return <IctSidebar />;
  if (currentView === 'governance') return <GovernanceSidebar />;
  if (currentView === 'approvals') return <ApprovalsSidebar />;
  if (currentView === 'executive') return <ExecutiveSidebar />;
  if (currentView === 'integrations-hub' || currentView === 'implementation') return null;

  if (currentView === 'apps' || currentView === 'ess' || currentView === 'org-setup') {
    return null; // Landing page does NOT have sidebar as requested!
  }

  // Get module-specific menu configuration
  const getModuleMenus = () => {
    switch (currentView) {
      case 'employee-requisition':
        return [
          { label: 'Requisition Register', icon: ClipboardList, tab: 'register' },
          { label: 'Approvals', icon: ShieldCheck, tab: 'approvals' },
          { label: 'Establishment & Budget', icon: Users, tab: 'establishment' }
        ];

      case 'recruitment':
        return [
          { label: 'Vacancies', icon: Briefcase, tab: 'vacancies' },
          { label: 'Applicant Pipeline', icon: UserCheck, tab: 'pipeline' },
          { label: 'Interviews & Scorecards', icon: Award, tab: 'interviews' },
          { label: 'Offers', icon: FileText, tab: 'offers' },
          { label: 'Hiring Statistics', icon: TrendingUp, tab: 'insights' },
          { label: 'Aptitude Tests', icon: ClipboardCheck, tab: 'tests' },
          { label: 'Careers Portal', icon: Users, tab: 'careers' }
        ];

      case 'onboarding':
        return [
          { label: 'New Hires', icon: ShieldAlert, tab: 'hires' },
          { label: 'Task Board by Owner', icon: ListChecks, tab: 'tasks' },
          { label: 'Induction Sessions', icon: GraduationCap, tab: 'sessions' },
          { label: 'Probation Tracker', icon: Clock, tab: 'probation' },
          { label: 'Interns & Attachees', icon: GraduationCap, tab: 'placements' }
        ];

      case 'employees':
        return [
          { label: 'Personnel Directory', icon: Users, tab: 'directory' },
          { label: 'Employee Requests', icon: ClipboardList, tab: 'requests' },
          { label: 'Changes & Audit Trail', icon: Lock, tab: 'changes' },
          { label: 'Contracts & Probation', icon: FileCheck, tab: 'contracts' },
          { label: 'Organisation Chart', icon: Layers, tab: 'orgchart' },
          { label: 'Email & Notifications', icon: Mail, tab: 'notifications' },
          { label: 'Qualifications & Certs', icon: Award, tab: 'qualifications' },
          { label: 'HR Alerts & Notices', icon: CalendarClock, tab: 'alerts' },
          { label: 'HR Reports Library', icon: FileSpreadsheet, tab: 'reports' },
          { label: 'Master Data Changes', icon: Lock, tab: 'masterdata' }
        ];

      case 'attendance':
        return [
          { label: 'Daily Muster Roll', icon: Users, tab: 'muster' },
          { label: 'Timesheets', icon: CalendarClock, tab: 'timesheets' },
          { label: 'Exceptions Queue', icon: ListChecks, tab: 'exceptions' },
          { label: 'Overtime to Payroll', icon: Timer, tab: 'overtime' },
          { label: 'Casual Days Worked', icon: AlarmClock, tab: 'casuals' },
          { label: 'Punch Log', icon: Fingerprint, tab: 'punches' },
          { label: 'Schedules & Rules', icon: Clock, tab: 'schedules' },
          { label: 'Flexi-time Bank', icon: Timer, tab: 'flexi' }
        ];

      case 'leave':
        return [
          { label: 'Requests & Approvals', icon: Clock, tab: 'requests' },
          { label: 'Balances & Ledger', icon: CalendarDays, tab: 'balances' },
          { label: 'Leave Types', icon: Layers, tab: 'types' },
          { label: 'Entitlements & Tenure', icon: Award, tab: 'entitlements' },
          { label: 'Holiday Calendar & Credits', icon: Calendar, tab: 'holidays' },
          { label: 'Policy Settings', icon: ShieldCheck, tab: 'policy' },
          { label: 'Jobs & Year-End Close', icon: ClipboardList, tab: 'yearend' }
        ];

      case 'payroll':
        return [
          { label: 'Payroll Console', icon: Coins, tab: 'console' },
          { label: 'Payroll Worksheet (Excel)', icon: FileSpreadsheet, tab: 'worksheet' },
          { label: 'Payroll Items', icon: ClipboardList, tab: 'items' },
          { label: 'Pay Item Setup', icon: Settings, tab: 'setup' },
          { label: 'Loans & Advances', icon: Send, tab: 'loans' },
          { label: 'Payslips & Register', icon: FileText, tab: 'payslips' },
          { label: 'Reports & Summaries', icon: FileSpreadsheet, tab: 'summaries' },
          { label: 'Custom Summaries', icon: Layers, tab: 'custom' },
          { label: 'Statutory Rates & Simulator', icon: Zap, tab: 'statutory' },
          { label: 'Salary Structure', icon: Layers, tab: 'structure' },
          { label: 'GL & Bank Files', icon: FileText, tab: 'bankfiles' }
        ];

      case 'performance':
        return [
          { label: 'Overview', icon: LayoutDashboard, tab: 'overview' },
          { label: 'Goals & Cascade', icon: Target, tab: 'goals' },
          { label: 'Check-ins & Feedback', icon: MessageSquare, tab: 'checkins' },
          { label: 'Appraisals', icon: ClipboardCheck, tab: 'appraisals' },
          { label: 'Calibration & 9-Box', icon: Grid3x3, tab: 'calibration' },
          { label: 'Rewards', icon: Coins, tab: 'rewards' },
          { label: 'PIPs & Development', icon: LifeBuoy, tab: 'pip' },
          { label: 'Scales & Policy', icon: SlidersHorizontal, tab: 'setup' },
          { label: 'Talent & Succession', icon: Target, tab: 'talent' }
        ];

      case 'training':
        return [
          { label: 'Skills Matrix', icon: BadgeCheck, tab: 'matrix' },
          { label: 'Training Needs', icon: ClipboardList, tab: 'needs' },
          { label: 'Catalogue & Budget', icon: Wallet, tab: 'plan' },
          { label: 'Sessions', icon: CalendarDays, tab: 'sessions' },
          { label: 'Costs & NITA', icon: Coins, tab: 'nita' },
          { label: 'Training Bonds', icon: FileSignature, tab: 'bonds' }
        ];

      case 'disciplinary':
        return [
          { label: 'Disciplinary Cases', icon: Gavel, tab: 'cases' },
          { label: 'Hearings & Deadlines', icon: CalendarClock, tab: 'hearings' },
          { label: 'Warnings Register', icon: FileWarning, tab: 'warnings' },
          { label: 'Casual Service (s.37)', icon: ShieldCheck, tab: 'compliance' }
        ];

      case 'osh-security':
        return [
          { label: 'Safety Dashboard', icon: OshGauge, tab: 'dashboard' },
          { label: 'Incidents & DOSH/F1', icon: OshSiren, tab: 'incidents' },
          { label: 'WIBA Claims', icon: OshShieldPlus, tab: 'wiba' },
          { label: 'Permits to Work', icon: OshKeyRound, tab: 'permits' },
          { label: 'PPE Register', icon: OshShirt, tab: 'ppe' },
          { label: 'Inspections & Risk', icon: ClipboardCheck, tab: 'inspections' },
          { label: 'Medical Surveillance', icon: OshStethoscope, tab: 'medical' },
          { label: 'Statutory & Committee', icon: FileText, tab: 'statutory' },
          { label: 'Security Operations', icon: ShieldCheck, tab: 'security' },
          { label: 'Gate & Cargo in Transit', icon: Lock, tab: 'gate' },
          { label: 'Investigations & Claims', icon: FileWarning, tab: 'investigations' },
          { label: 'Grievances & Whistleblowing', icon: MessageSquare, tab: 'grievances' },
          { label: 'CCTV & Alarms (simulated)', icon: OshSiren, tab: 'alarms' }
        ];

      case 'hr-services':
        return [
          { label: 'Welfare', icon: Award, tab: 'welfare' },
          { label: 'Medical Cover', icon: OshStethoscope, tab: 'medical' },
          { label: 'Travel & Imprest', icon: Send, tab: 'travel' },
          { label: 'CSR & Events', icon: CalendarDays, tab: 'csr' },
          { label: 'Outsourced Labour', icon: Users, tab: 'outsourced' },
          { label: 'Library', icon: GraduationCap, tab: 'library' }
        ];

      case 'separation':
        return [
          { label: 'Exit Cases', icon: FileCheck, tab: 'cases' },
          { label: 'Clearance Board', icon: ClipboardList, tab: 'clearance' },
          { label: 'Final Dues', icon: Coins, tab: 'dues' },
          { label: 'Turnover & Exit Interviews', icon: CalendarDays, tab: 'analytics' }
        ];

      default:
        return [
          { label: 'Module Overview', icon: LayoutGrid, active: true }
        ];
    }
  };

  const moduleMenus = getModuleMenus();

  return (
    <aside
      className="app-sidebar"
      style={{
        width: isSidebarCollapsed ? 64 : 260,
        minWidth: isSidebarCollapsed ? 64 : 260,
        transition: 'width 0.15s ease'
      }}
    >
      {/* Return to Launcher Button */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
        <button
          className="btn btn-secondary"
          onClick={() => setCurrentView('apps')}
          style={{ width: '100%', justifyContent: 'flex-start', gap: 8, fontSize: 12, fontWeight: 700 }}
          title="Return to DigiCraft Apps Switchboard"
        >
          <LayoutGrid size={15} color="var(--brand-primary)" />
          {!isSidebarCollapsed && <span>← Apps Switchboard</span>}
        </button>
      </div>

      {/* Module Title Header */}
      {currentApp && !isSidebarCollapsed && (
        <div style={{ padding: '14px 16px 8px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span className="digicraft-badge-light" style={{ fontSize: 10 }}>
              STEP #{String(currentApp.stepNumber).padStart(2, '0')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>
              {currentApp.category}
            </span>
          </div>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            {currentApp.name}
          </h3>
        </div>
      )}

      {/* Module-Specific Navigation Links */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)', padding: '6px 8px' }}>
          {!isSidebarCollapsed && 'Module Navigation'}
        </div>

        {moduleMenus.map((menu: { label: string; icon: typeof LayoutGrid; active?: boolean; tab?: string }, idx) => {
          const Icon = menu.icon;
          // Modules with real sections switch tabs; the rest keep their static highlight
          const firstTab = (moduleMenus[0] as { tab?: string }).tab;
          const active = menu.tab ? (moduleTabs[currentView] ?? firstTab) === menu.tab : !!menu.active;
          menu = { ...menu, active };
          return (
            <button
              key={idx}
              className={`nav-item ${menu.active ? 'active' : ''}`}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 6,
                border: 'none',
                background: menu.active ? 'var(--brand-subtle)' : 'transparent',
                color: menu.active ? 'var(--brand-primary)' : 'var(--text-secondary)',
                fontWeight: menu.active ? 700 : 500,
                fontSize: 12,
                cursor: 'pointer',
                textAlign: 'left',
                marginBottom: 2
              }}
              title={menu.label}
              onClick={() => menu.tab && setModuleTab(currentView, menu.tab)}
            >
              <Icon size={16} />
              {!isSidebarCollapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{menu.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Tenant Context Pill in Sidebar Footer */}
      {!isSidebarCollapsed && (
        <div
          style={{
            padding: '12px 14px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface-elevated)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
            <Building2 size={13} color="var(--brand-primary)" />
            <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeTenant.name}
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {activeTenant.employeeCount} active personnel • Scope Isolated
          </div>
        </div>
      )}
    </aside>
  );
};
