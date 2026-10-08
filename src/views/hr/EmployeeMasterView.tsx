import React, { useState } from 'react';
import { Users, Eye, EyeOff, UserPlus, ShieldCheck, FileClock, Network, Inbox, Mail, GraduationCap, BellRing, BarChart3, History } from 'lucide-react';
import { HrAlertsTab, HrReportsTab, MasterDataReportTab, QualificationsTab } from './hcm/EmployeeExtraTabs';
import { useApp } from '../../context/AppContext';
import { AddEmployeeWizard } from './employee-wizard/AddEmployeeWizard';
import { HireHeader, useModuleTab, type TabDef } from './hire/shared';
import { DirectoryTab, ChangesTab, ContractsTab, OrgChartTab } from './hire/EmployeeTabs';
import { EmployeeRequestsTab } from './requests/EmployeeRequestsTab';
import { NotificationsTab } from './hire/NotificationsTab';

const TABS: TabDef[] = [
  { id: 'directory', label: 'Directory', icon: Users },
  { id: 'requests', label: 'Employee requests', icon: Inbox },
  { id: 'changes', label: 'Changes & audit', icon: ShieldCheck },
  { id: 'contracts', label: 'Contracts & probation', icon: FileClock },
  { id: 'orgchart', label: 'Org chart', icon: Network },
  { id: 'notifications', label: 'Email & notifications', icon: Mail },
  { id: 'qualifications', label: 'Qualifications', icon: GraduationCap },
  { id: 'alerts', label: 'HR alerts', icon: BellRing },
  { id: 'reports', label: 'HR reports', icon: BarChart3 },
  { id: 'masterdata', label: 'Master data changes', icon: History }
];

export const EmployeeMasterView: React.FC = () => {
  const { activeTenant } = useApp();
  const [tab] = useModuleTab('employees', 'directory');
  const [unmaskPii, setUnmaskPii] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="hr-app-view hi-view">
      <HireHeader
        step="04"
        title="Employee Master & PII Vault"
        subtitle={`${activeTenant.name}: one record per employee for payroll, leave and the portal — masked KYC, job, pay history, documents and approved changes.`}
        icon={Users}
        gradient="linear-gradient(135deg, #10b981, #059669)"
        view="employees"
        tabs={TABS}
        next={{ label: 'Go to Attendance (#05)', view: 'attendance' }}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setWizardOpen(true)}>
              <UserPlus size={15} />
              <span>Add employee</span>
            </button>
            {tab === 'directory' && (
              <button className="btn btn-secondary" onClick={() => setUnmaskPii(!unmaskPii)} title="Needs the HR records permission; reveals are logged">
                {unmaskPii ? <EyeOff size={15} /> : <Eye size={15} />}
                <span>{unmaskPii ? 'Mask PII' : 'Reveal PII'}</span>
              </button>
            )}
          </>
        }
      />
      {tab === 'qualifications' ? <QualificationsTab /> : tab === 'alerts' ? <HrAlertsTab /> : tab === 'reports' ? <HrReportsTab /> : tab === 'masterdata' ? <MasterDataReportTab /> : tab === 'requests' ? <EmployeeRequestsTab /> : tab === 'changes' ? <ChangesTab /> : tab === 'contracts' ? <ContractsTab /> : tab === 'orgchart' ? <OrgChartTab /> : tab === 'notifications' ? <NotificationsTab /> : <DirectoryTab unmask={unmaskPii} />}
      {wizardOpen && <AddEmployeeWizard onClose={() => setWizardOpen(false)} />}
    </div>
  );
};
