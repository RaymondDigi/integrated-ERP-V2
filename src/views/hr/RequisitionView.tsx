import React, { useState } from 'react';
import { ClipboardList, Plus, ShieldCheck, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { HireHeader, useModuleTab, type TabDef } from './hire/shared';
import { RegisterTab, ApprovalsTab, EstablishmentTab } from './hire/RequisitionTabs';
import { RequisitionForm } from './hire/RequisitionForm';

const TABS: TabDef[] = [
  { id: 'register', label: 'Requisitions', icon: ClipboardList },
  { id: 'approvals', label: 'Approvals', icon: ShieldCheck },
  { id: 'establishment', label: 'Establishment & budget', icon: Users }
];

export const RequisitionView: React.FC = () => {
  const { activeTenant, tenantRequisitions } = useApp();
  const [tab] = useModuleTab('employee-requisition', 'register');
  const [formOpen, setFormOpen] = useState(false);
  const waiting = tenantRequisitions.filter((r) => r.status === 'PENDING_APPROVAL').length;

  return (
    <div className="hr-app-view hi-view">
      <HireHeader
        step="01"
        title="Employee Requisition & Establishment"
        subtitle={`${activeTenant.name}: headcount plan, budget check and approvals (head of department → HR → Finance where needed → MD). ${waiting} waiting for a decision.`}
        icon={ClipboardList}
        gradient="linear-gradient(135deg, #2f8f6a, #1a5f45)"
        view="employee-requisition"
        tabs={TABS}
        next={{ label: 'Go to Recruitment (#02)', view: 'recruitment' }}
        actions={
          <button className="btn btn-secondary" onClick={() => setFormOpen(true)}>
            <Plus size={15} />
            <span>Create requisition</span>
          </button>
        }
      />
      {tab === 'approvals' ? <ApprovalsTab /> : tab === 'establishment' ? <EstablishmentTab /> : <RegisterTab />}
      {formOpen && <RequisitionForm onClose={() => setFormOpen(false)} />}
    </div>
  );
};
