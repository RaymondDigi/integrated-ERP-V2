import React from 'react';
import {
  LayoutGrid,
  ClipboardList,
  UserCheck,
  ShieldAlert,
  Users,
  Clock,
  CalendarDays,
  Coins,
  Award,
  GraduationCap,
  Scale,
  HardHat,
  FileCheck,
  LayoutDashboard,
  Inbox,
  Activity,
  Building,
  GitFork,
  Plug,
  ShieldCheck,
  KeyRound,
  CreditCard,
  FileSpreadsheet,
  Cpu,
  Sparkles,
  Settings,
  ChevronLeft,
  ChevronRight,
  User,
  Sliders,
  X
} from 'lucide-react';
import { useApp, NavigationTarget } from '../../context/AppContext';

interface NavItemConfig {
  id: NavigationTarget;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; color?: string }>;
  badge?: string | number;
  badgeVariant?: 'critical' | 'warning' | 'neutral';
}

interface NavSection {
  title: string;
  items: NavItemConfig[];
}

export const Sidebar: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    isSidebarCollapsed,
    toggleSidebar,
    isMobileMenuOpen,
    closeMobileMenu,
    workItems,
    users,
    organizations,
    workflows,
    integrations,
    systemHealth,
    aiInsights,
    tenantLeave,
    tenantPayrollBatches
  } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  const onLeaveToday = tenantLeave.filter((l) => l.status === 'APPROVED' && l.startDate <= today && l.endDate >= today).length;
  const payrollRun = tenantPayrollBatches.find((b) => b.pipeline === 'Monthly Payroll');

  const openWorkItemsCount = workItems.filter((w) => w.status === 'OPEN' || w.status === 'IN_TRIAGE').length;
  const criticalWorkItemsCount = workItems.filter(
    (w) => (w.status === 'OPEN' || w.status === 'IN_TRIAGE') && w.severity === 'CRITICAL'
  ).length;

  const failedWorkflowsCount = workflows.filter((w) => w.status === 'FAILED').length;
  const degradedIntegrationsCount = integrations.filter(
    (i) => i.status === 'DEGRADED' || i.status === 'ERROR'
  ).length;
  const degradedServicesCount = systemHealth.filter(
    (s) => s.status === 'degraded' || s.status === 'outage'
  ).length;
  const activeAiInsightsCount = aiInsights.filter((ai) => !ai.dismissed).length;

  const sections: NavSection[] = [
    {
      title: 'Launchpad',
      items: [
        {
          id: 'apps',
          label: 'Apps Switchboard',
          icon: LayoutGrid
        }
      ]
    },
    {
      title: 'HR Process Lifecycle',
      items: [
        {
          id: 'employee-requisition',
          label: '#01 Requisition',
          icon: ClipboardList,
          badge: '4 New',
          badgeVariant: 'warning'
        },
        {
          id: 'recruitment',
          label: '#02 Recruitment',
          icon: UserCheck,
          badge: 48,
          badgeVariant: 'neutral'
        },
        {
          id: 'onboarding',
          label: '#03 Induction',
          icon: ShieldAlert
        },
        {
          id: 'employees',
          label: '#04 Employee Master',
          icon: Users
        },
        {
          id: 'attendance',
          label: '#05 Attendance',
          icon: Clock
        },
        {
          id: 'leave',
          label: '#06 Leave & Absence',
          icon: CalendarDays,
          badge: onLeaveToday ? `${onLeaveToday} On Leave` : undefined,
          badgeVariant: 'neutral'
        },
        {
          id: 'payroll',
          label: '#07 Employee Payroll',
          icon: Coins,
          badge: payrollRun ? `KES ${(payrollRun.totalGrossKes / 1_000_000).toFixed(1)}M` : undefined,
          badgeVariant: 'neutral'
        },
        {
          id: 'performance',
          label: '#08 Performance OKR',
          icon: Award
        },
        {
          id: 'training',
          label: '#09 L&D Matrix',
          icon: GraduationCap
        },
        {
          id: 'disciplinary',
          label: '#10 Compliance & Discip.',
          icon: Scale,
          badge: '3 Flagged',
          badgeVariant: 'critical'
        },
        {
          id: 'osh-security',
          label: '#11 OSH & Safety',
          icon: HardHat
        },
        {
          id: 'separation',
          label: '#12 Separation',
          icon: FileCheck
        },
        {
          id: 'hr-services',
          label: '#13 Welfare & Services',
          icon: Award
        }
      ]
    },
    {
      title: 'Command',
      items: [
        {
          id: 'overview',
          label: 'Overview',
          icon: LayoutDashboard
        },
        {
          id: 'work-queue',
          label: 'Work Queue',
          icon: Inbox,
          badge: openWorkItemsCount > 0 ? openWorkItemsCount : undefined,
          badgeVariant: criticalWorkItemsCount > 0 ? 'critical' : 'warning'
        },
        {
          id: 'activity',
          label: 'Activity Stream',
          icon: Activity
        }
      ]
    },
    {
      title: 'Operations',
      items: [
        {
          id: 'users',
          label: 'Users & Accounts',
          icon: Users,
          badge: users.length,
          badgeVariant: 'neutral'
        },
        {
          id: 'organizations',
          label: 'Organizations',
          icon: Building,
          badge: organizations.length,
          badgeVariant: 'neutral'
        },
        {
          id: 'workflows',
          label: 'Workflows & Jobs',
          icon: GitFork,
          badge: failedWorkflowsCount > 0 ? `${failedWorkflowsCount} Failed` : undefined,
          badgeVariant: 'critical'
        },
        {
          id: 'integrations',
          label: 'Integrations',
          icon: Plug,
          badge: degradedIntegrationsCount > 0 ? `${degradedIntegrationsCount} Issue` : undefined,
          badgeVariant: 'warning'
        }
      ]
    },
    {
      title: 'Security & Access',
      items: [
        {
          id: 'roles',
          label: 'Roles & Permissions',
          icon: ShieldCheck
        },
        {
          id: 'security',
          label: 'Security Center',
          icon: KeyRound,
          badge: 'MFA/SSO',
          badgeVariant: 'neutral'
        }
      ]
    },
    {
      title: 'Finance',
      items: [
        {
          id: 'billing',
          label: 'Billing & Invoices',
          icon: CreditCard
        }
      ]
    },
    {
      title: 'Governance',
      items: [
        {
          id: 'audit',
          label: 'Audit Logs',
          icon: FileSpreadsheet
        }
      ]
    },
    {
      title: 'Platform',
      items: [
        {
          id: 'health',
          label: 'System Health',
          icon: Cpu,
          badge: degradedServicesCount > 0 ? `${degradedServicesCount} Degraded` : undefined,
          badgeVariant: 'warning'
        },
        {
          id: 'ai-insights',
          label: 'AI Intelligence',
          icon: Sparkles,
          badge: activeAiInsightsCount > 0 ? `${activeAiInsightsCount} Active` : undefined,
          badgeVariant: 'neutral'
        }
      ]
    },
    {
      title: 'Configuration & Showcase',
      items: [
        {
          id: 'forms-inputs',
          label: 'Forms & Inputs',
          icon: Sliders,
          badge: 'Showcase',
          badgeVariant: 'warning'
        },
        {
          id: 'profile',
          label: 'My Profile',
          icon: User,
          badge: 'Admin',
          badgeVariant: 'neutral'
        },
        {
          id: 'settings',
          label: 'Settings',
          icon: Settings
        }
      ]
    }
  ];

  return (
    <>
      {isMobileMenuOpen && (
        <div
          className="mobile-nav-backdrop"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}
      <aside
        className={`app-sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileMenuOpen ? 'mobile-open' : ''}`}
        aria-label="Main Navigation"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface-subtle)'
          }}
          className="mobile-sidebar-header-bar"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
            <div style={{
              width: 22,
              height: 22,
              background: 'linear-gradient(135deg, #237857, #1a5f45)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: 11,
              fontWeight: 800
            }}>
              MC
            </div>
            <span>Navigation Menu</span>
          </div>
          <button
            className="mobile-sidebar-close-btn"
            onClick={closeMobileMenu}
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {sections.map((section) => (
            <div key={section.title} className="sidebar-section">
              {!isSidebarCollapsed && (
                <div className="sidebar-section-title">{section.title}</div>
              )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => setCurrentView(item.id)}
                  title={isSidebarCollapsed ? item.label : undefined}
                >
                  <div className="nav-item-left">
                    <Icon size={16} className="nav-icon" />
                    {!isSidebarCollapsed && (
                      <span className="nav-item-text">{item.label}</span>
                    )}
                  </div>
                  {!isSidebarCollapsed && item.badge && (
                    <span
                      className={`nav-badge ${
                        item.badgeVariant === 'critical'
                          ? 'nav-badge-critical'
                          : item.badgeVariant === 'warning'
                          ? 'nav-badge-warning'
                          : 'nav-badge-neutral'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isSidebarCollapsed ? 'center' : 'space-between',
          background: 'var(--bg-surface-subtle)'
        }}
      >
        {!isSidebarCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Enterprise v2.8.4</span>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Build 2026.09.08</span>
          </div>
        )}
        <button
          className="header-btn"
          onClick={toggleSidebar}
          title={isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          style={{ padding: '4px 6px' }}
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
        </div>
      </aside>
    </>
  );
};
