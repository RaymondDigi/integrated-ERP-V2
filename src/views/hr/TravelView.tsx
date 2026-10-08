import React from 'react';
import { ArrowLeft, Banknote, BadgePercent, Plane, Receipt, Wallet } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { overdueDays } from '../../data/travelEngine';
import { RequestsTab } from './travel/RequestsTab';
import { ImprestTab } from './travel/ImprestTab';
import { SurrendersTab } from './travel/SurrendersTab';
import { RatesTab } from './travel/RatesTab';
import { kes, Stat } from './travel/shared';

export const TRAVEL_TABS = [
  { id: 'requests', label: 'Travel Requests', icon: Plane },
  { id: 'imprest', label: 'Petty Cash & Imprest', icon: Wallet },
  { id: 'surrenders', label: 'Surrenders', icon: Receipt },
  { id: 'rates', label: 'Per Diem Rates', icon: BadgePercent }
];

export const TravelView: React.FC = () => {
  const { setCurrentView, moduleTabs, setModuleTab, activeTenant, travelRequests, imprests, pettyCashFloat, travelToday } = useApp();
  const tab = moduleTabs['travel'] ?? 'requests';
  const awaiting = travelRequests.filter((r) => r.status === 'SUBMITTED' || r.status === 'MANAGER_APPROVED');
  const outstanding = imprests.filter((i) => i.status === 'PAID');
  const overdue = outstanding.filter((i) => overdueDays(i, travelToday) > 0);
  const away = travelRequests.filter((r) => r.departDate <= travelToday && r.returnDate >= travelToday && ['FINANCE_APPROVED', 'ADVANCE_PAID'].includes(r.status));
  const floatPct = pettyCashFloat.limit ? pettyCashFloat.balance / pettyCashFloat.limit : 0;

  return (
    <div className="hr-app-view trv-view">
      <div className="hr-app-header">
        <div>
          <div className="hr-breadcrumb-bar">
            <button className="hr-breadcrumb-btn" onClick={() => setCurrentView('apps')}>
              <ArrowLeft size={13} /> Return to Apps Launcher
            </button>
            <span>/</span>
            <span>Process #14</span>
            <span>/</span>
            <span>{TRAVEL_TABS.find((t) => t.id === tab)?.label ?? 'Travel Requests'}</span>
          </div>
          <div className="hr-app-title-group">
            <div className="hr-app-icon-wrapper" style={{ background: 'linear-gradient(135deg, #0ea5e9, #0369a1)' }}>
              <Plane size={22} />
            </div>
            <div>
              <h1>
                <span>Travel & Petty Cash</span>
                <span className="digicraft-badge-light">Process #14</span>
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                {activeTenant.name}: travel requests with line manager and Finance approval, per diem by grade, petty cash and imprest, and surrenders settled in cash or through payroll.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="hr-stats-row">
        <Stat
          label="Awaiting approval"
          value={awaiting.length}
          sub={`${awaiting.filter((r) => r.status === 'MANAGER_APPROVED').length} with Finance · ${away.length} staff away now`}
          tone={awaiting.length ? '#d97706' : undefined}
        />
        <Stat label="Advances outstanding" value={kes(outstanding.reduce((n, i) => n + i.amount, 0))} sub={`${outstanding.length} petty cash, imprest and travel advances`} tone="#0369a1" />
        <Stat
          label="Overdue surrenders"
          value={overdue.length}
          sub={overdue.length ? `${kes(overdue.reduce((n, i) => n + i.amount, 0))} · those staff are blocked from new advances` : 'All advances within their due dates'}
          tone={overdue.length ? 'var(--status-critical)' : '#059669'}
        />
        <Stat
          label="Petty cash float"
          value={kes(pettyCashFloat.balance)}
          sub={
            <>
              <Banknote size={11} /> of {kes(pettyCashFloat.limit)}
              {pettyCashFloat.toReplenish > 0 ? ` · ${kes(pettyCashFloat.toReplenish)} to replenish` : ''}
            </>
          }
          tone={floatPct < 0.25 ? 'var(--status-critical)' : undefined}
        />
      </div>

      <div className="pr-tabstrip" role="tablist" aria-label="Travel sections">
        {TRAVEL_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setModuleTab('travel', t.id)}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'requests' && <RequestsTab />}
      {tab === 'imprest' && <ImprestTab />}
      {tab === 'surrenders' && <SurrendersTab />}
      {tab === 'rates' && <RatesTab />}
    </div>
  );
};
