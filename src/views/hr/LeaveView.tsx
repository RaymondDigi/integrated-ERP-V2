import React, { useState } from 'react';
import { CalendarDays, ArrowLeft, Plus, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { RequestsTab } from './leave/RequestsTab';
import { BalancesTab } from './leave/BalancesTab';
import { TypesTab } from './leave/TypesTab';
import { EntitlementsTab } from './leave/EntitlementsTab';
import { HolidaysTab } from './leave/HolidaysTab';
import { PolicyTab } from './leave/PolicyTab';
import { YearEndTab } from './leave/YearEndTab';
import { ApplyLeaveModal } from './leave/ApplyLeaveModal';

const TAB_TITLE: Record<string, string> = {
  requests: 'Requests & approvals',
  balances: 'Balances & ledger',
  types: 'Leave types',
  entitlements: 'Entitlements & tenure',
  holidays: 'Holiday calendar & credits',
  policy: 'Policy settings',
  yearend: 'Jobs & year-end close'
};

export const LeaveView: React.FC = () => {
  const { setCurrentView, moduleTabs, activeTenant } = useApp();
  const tab = moduleTabs['leave'] ?? 'requests';
  const [applyOpen, setApplyOpen] = useState(false);

  return (
    <div className="hr-app-view">
      {/* Top App Header */}
      <div className="hr-app-header">
        <div>
          <div className="hr-breadcrumb-bar">
            <button className="hr-breadcrumb-btn" onClick={() => setCurrentView('apps')}>
              <ArrowLeft size={13} /> Return to Apps Launcher
            </button>
            <span>/</span>
            <span>Process #06</span>
            <span>/</span>
            <span>{TAB_TITLE[tab] ?? TAB_TITLE.requests}</span>
          </div>

          <div className="hr-app-title-group">
            <div className="hr-app-icon-wrapper" style={{ background: 'linear-gradient(135deg, #14b8a6, #0d9488)' }}>
              <CalendarDays size={22} />
            </div>
            <div>
              <h1>
                <span>Leave & Absence Management</span>
                <span className="digicraft-badge-light">Process #06</span>
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                {activeTenant.name}: requests, ledger balances, entitlements, holiday credits and year-end close.
              </p>
            </div>
          </div>
        </div>

        <div className="hr-app-actions">
          <button className="btn btn-secondary" onClick={() => setApplyOpen(true)}>
            <Plus size={15} />
            <span>Apply for Leave</span>
          </button>

          <button className="btn btn-primary" onClick={() => setCurrentView('payroll')}>
            <span>Go to Employee Payroll (#07)</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {tab === 'balances' ? (
        <BalancesTab />
      ) : tab === 'types' ? (
        <TypesTab />
      ) : tab === 'entitlements' ? (
        <EntitlementsTab />
      ) : tab === 'holidays' ? (
        <HolidaysTab />
      ) : tab === 'policy' ? (
        <PolicyTab />
      ) : tab === 'yearend' ? (
        <YearEndTab />
      ) : (
        <RequestsTab />
      )}

      {applyOpen && <ApplyLeaveModal onClose={() => setApplyOpen(false)} />}
    </div>
  );
};
