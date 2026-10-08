import React, { useEffect, useLayoutEffect } from 'react';
import { useApp } from './context/AppContext';
import { Header } from './components/shell/Header';
import { ModuleSidebar } from './components/shell/ModuleSidebar';
import { CommandPalette } from './components/common/CommandPalette';
import { ToastContainer } from './components/common/ToastContainer';
import { ResourceDrawers } from './components/drawers/ResourceDrawers';
import { AiAssistantDrawer } from './components/drawers/AiAssistantDrawer';
import { RightSideActionDrawer } from './components/drawers/RightSideActionDrawer';
import { ModuleLauncher } from './components/shell/ModuleLauncher';
import { FinanceProvider } from './suites/finance/store';
import { FinanceSuite } from './suites/finance/FinanceSuite';
import { CommercialProvider } from './suites/commercial/store';
import { TradingSuite } from './suites/commercial/trading/TradingSuite';
import { ProcurementSuite } from './suites/commercial/procurement/ProcurementSuite';
import { BizDevSuite } from './suites/commercial/bizdev/BizDev';
import { OperationsProvider } from './suites/operations/store';
import { ControlProvider } from './suites/control/store';
import { HubProvider } from './suites/hub/store';
import { QualitySuite } from './suites/control/Quality';
import { IctSuite, IntegrationsSuite } from './suites/control/Ict';
import { GovernanceSuite, ImplementationSuite } from './suites/control/Governance';
import { ApprovalsSuite } from './suites/hub/Approvals';
import { ExecutiveSuite } from './suites/hub/Executive';
import { WarehousingSuite } from './suites/operations/Warehousing';
import { ProductionSuite } from './suites/operations/Production';
import { ShippingSuite } from './suites/operations/Shipping';
import { FleetSuite } from './suites/operations/Fleet';
import { MaintenanceSuite } from './suites/operations/Maintenance';

// DigiCraft Landing Page Launchpad
import { DigiCraftAppGrid } from './components/digicraft/DigiCraftAppGrid';
import { EssPortalView } from './views/ess/EssPortalView';
import { CompanySetupView } from './views/CompanySetupView';

// Dedicated HR Process Applications (Ordered by Occurrence)
import { RequisitionView } from './views/hr/RequisitionView';
import { RecruitmentView } from './views/hr/RecruitmentView';
import { OnboardingView } from './views/hr/OnboardingView';
import { EmployeeMasterView } from './views/hr/EmployeeMasterView';
import { AttendanceView } from './views/hr/AttendanceView';
import { LeaveView } from './views/hr/LeaveView';
import { PayrollView } from './views/hr/PayrollView';
import { PerformanceView } from './views/hr/PerformanceView';
import { TrainingSkillsView } from './views/hr/TrainingSkillsView';
import { DisciplinaryView } from './views/hr/DisciplinaryView';
import { OshSecurityView } from './views/hr/OshSecurityView';
import { HrServicesView } from './views/hr/HrServicesView';
import { SeparationView } from './views/hr/SeparationView';

// Platform Views
import { OverviewView } from './views/OverviewView';
import { WorkQueueView } from './views/WorkQueueView';
import { ActivityView } from './views/ActivityView';
import { UsersView } from './views/UsersView';
import { OrganizationsView } from './views/OrganizationsView';
import { WorkflowsView } from './views/WorkflowsView';
import { IntegrationsView } from './views/IntegrationsView';
import { RolesView } from './views/RolesView';
import { SecurityView } from './views/SecurityView';
import { BillingView } from './views/BillingView';
import { AuditLogsView } from './views/AuditLogsView';
import { HealthView } from './views/HealthView';
import { AiInsightsView } from './views/AiInsightsView';
import { SettingsView } from './views/SettingsView';
import { FormsInputsView } from './views/FormsInputsView';
import { ProfileView } from './views/ProfileView';
import { LoginView } from './views/auth/LoginView';
import { setDirectory, useSession } from './auth/session';

export const App: React.FC = () => {
  const { currentView, setCurrentView, moduleTabs, hrEmployees, setIsLauncherOpen } = useApp();
  // Development-only hook so the end-to-end checks in scripts/e2e can open any screen directly
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __erp?: unknown }).__erp = { open: (v: typeof currentView) => (setIsLauncherOpen(false), setCurrentView(v)) };
  }, [setCurrentView, setIsLauncherOpen]);
  // Every screen and module tab opens at the top
  const tabKey = moduleTabs[currentView] ?? '';
  useLayoutEffect(() => {
    const main = document.getElementById('main-content');
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [currentView, tabKey]);

  // Sign-in follows the Employee Master: work emails, new hires and leavers
  useEffect(() => setDirectory(hrEmployees), [hrEmployees]);
  // Unified sign-in: nothing behind it until a session exists
  const session = useSession();
  if (!session) return <LoginView />;

  const renderView = () => {
    // The self-service account only ever sees the employee portal
    if (session.role === 'employee') return <EssPortalView />;
    switch (currentView) {
      // DigiCraft Apps Landing Page
      case 'apps':
        return <DigiCraftAppGrid />;

      // Finance suite
      case 'finance':
        return <FinanceSuite />;
      case 'trading':
        return <TradingSuite />;
      case 'procurement':
        return <ProcurementSuite />;
      case 'bizdev':
        return <BizDevSuite />;
      case 'warehousing':
        return <WarehousingSuite />;
      case 'production':
        return <ProductionSuite />;
      case 'shipping':
        return <ShippingSuite />;
      case 'fleet':
        return <FleetSuite />;
      case 'maintenance':
        return <MaintenanceSuite />;
      case 'quality':
        return <QualitySuite />;
      case 'ict':
        return <IctSuite />;
      case 'integrations-hub':
        return <IntegrationsSuite />;
      case 'governance':
        return <GovernanceSuite />;
      case 'implementation':
        return <ImplementationSuite />;
      case 'approvals':
        return <ApprovalsSuite />;
      case 'executive':
        return <ExecutiveSuite />;

      // Employee Self-Service Portal
      case 'ess':
        return <EssPortalView />;
      case 'org-setup':
        return <CompanySetupView />;

      // HR & Employee Payroll Lifecycle (Ordered by Occurrence)
      case 'employee-requisition':
        return <RequisitionView />;
      case 'recruitment':
        return <RecruitmentView />;
      case 'onboarding':
        return <OnboardingView />;
      case 'employees':
        return <EmployeeMasterView />;
      case 'attendance':
        return <AttendanceView />;
      case 'leave':
        return <LeaveView />;
      case 'payroll':
        return <PayrollView />;
      case 'performance':
        return <PerformanceView />;
      case 'training':
        return <TrainingSkillsView />;
      case 'disciplinary':
        return <DisciplinaryView />;
      case 'osh-security':
        return <OshSecurityView />;
      case 'separation':
        return <SeparationView />;
      case 'hr-services':
        return <HrServicesView />;

      // Core System Views
      case 'overview':
        return <OverviewView />;
      case 'work-queue':
        return <WorkQueueView />;
      case 'activity':
        return <ActivityView />;
      case 'users':
        return <UsersView />;
      case 'organizations':
        return <OrganizationsView />;
      case 'workflows':
        return <WorkflowsView />;
      case 'integrations':
        return <IntegrationsView />;
      case 'roles':
        return <RolesView />;
      case 'security':
        return <SecurityView />;
      case 'billing':
        return <BillingView />;
      case 'audit':
        return <AuditLogsView />;
      case 'health':
        return <HealthView />;
      case 'ai-insights':
        return <AiInsightsView />;
      case 'settings':
        return <SettingsView />;
      case 'forms-inputs':
        return <FormsInputsView />;
      case 'profile':
        return <ProfileView />;

      default:
        return <DigiCraftAppGrid />;
    }
  };

  return (
    <FinanceProvider>
    <CommercialProvider>
    <OperationsProvider>
    <ControlProvider>
    <HubProvider>
    <div className="app-shell">
      <Header />
      <div className="app-body">
        <ModuleSidebar />
        <main className="app-content" id="main-content" style={{ overflowY: 'auto' }}>
          <div key={currentView} className="view-transition">
            {renderView()}
          </div>
        </main>
      </div>

      {/* Global Overlays and Modals */}
      <RightSideActionDrawer />
      <ResourceDrawers />
      <AiAssistantDrawer />
      <CommandPalette />
      <ToastContainer />
      <ModuleLauncher />
    </div>
    </HubProvider>
    </ControlProvider>
    </OperationsProvider>
    </CommercialProvider>
    </FinanceProvider>
  );
};

export default App;
