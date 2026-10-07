import React from 'react';
import { ArrowLeft, ChevronRight, ClipboardCheck, FileCheck, Gauge, HardHat, KeyRound, ShieldPlus, Siren, Stethoscope, Shirt } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DashboardTab, useOshMetrics } from './osh/DashboardTab';
import { IncidentsTab } from './osh/IncidentsTab';
import { WibaTab } from './osh/WibaTab';
import { PermitsTab } from './osh/PermitsTab';
import { PpeTab } from './osh/PpeTab';
import { InspectionsTab } from './osh/InspectionsTab';
import { MedicalTab } from './osh/MedicalTab';
import { StatutoryTab } from './osh/StatutoryTab';

export const OSH_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge },
  { id: 'incidents', label: 'Incidents & DOSH/F1', icon: Siren },
  { id: 'wiba', label: 'WIBA claims', icon: ShieldPlus },
  { id: 'permits', label: 'Permits to work', icon: KeyRound },
  { id: 'ppe', label: 'PPE', icon: Shirt },
  { id: 'inspections', label: 'Inspections & risk', icon: ClipboardCheck },
  { id: 'medical', label: 'Medical surveillance', icon: Stethoscope },
  { id: 'statutory', label: 'Statutory & committee', icon: FileCheck }
];

export const OshSecurityView: React.FC = () => {
  const { setCurrentView, moduleTabs, setModuleTab, activeTenant } = useApp();
  const tab = moduleTabs['osh-security'] ?? 'dashboard';
  const m = useOshMetrics();
  const dosh = m.alerts.filter((a) => a.key.startsWith('dosh-'));

  return (
    <div className="hr-app-view osh-view">
      <div className="hr-app-header">
        <div>
          <div className="hr-breadcrumb-bar">
            <button className="hr-breadcrumb-btn" onClick={() => setCurrentView('apps')}>
              <ArrowLeft size={13} /> Return to Apps Launcher
            </button>
            <span>/</span>
            <span>Process #11</span>
            <span>/</span>
            <span>{OSH_TABS.find((t) => t.id === tab)?.label ?? 'Dashboard'}</span>
          </div>

          <div className="hr-app-title-group">
            <div className="hr-app-icon-wrapper" style={{ background: 'linear-gradient(135deg, #f97316, #c2410c)' }}>
              <HardHat size={22} />
            </div>
            <div>
              <h1>
                <span>Occupational Safety & Health</span>
                <span className="digicraft-badge-light">Process #11</span>
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                {activeTenant.name}: incidents and DOSH notices, WIBA claims, permits to work, PPE, inspections and statutory compliance (OSHA 2007, WIBA 2007).
              </p>
            </div>
          </div>
        </div>

        <div className="hr-app-actions">
          <button className="btn btn-primary" onClick={() => setCurrentView('separation')}>
            <span>Go to Separation (#12)</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Days since lost-time injury</div>
          <div className="hr-stat-value" style={{ color: m.rates.daysSinceLti !== null && m.rates.daysSinceLti < 30 ? 'var(--status-critical)' : '#059669' }}>
            {m.rates.daysSinceLti ?? '—'}
          </div>
          <div className="hr-stat-subtext">LTIFR {m.rates.ltifr} · TRIFR {m.rates.trifr}</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">DOSH Form 1 pending</div>
          <div className="hr-stat-value" style={{ color: dosh.some((a) => a.cls === 'critical') ? 'var(--status-critical)' : dosh.length ? 'var(--status-warning)' : undefined }}>
            {dosh.length}
          </div>
          <div className="hr-stat-subtext">{m.openIncidents} open incidents</div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Active permits to work</div>
          <div className="hr-stat-value" style={{ color: '#ea580c' }}>
            {m.active}
          </div>
          <div className="hr-stat-subtext">
            {m.awaiting} awaiting approval{m.expired ? ` · ${m.expired} not closed out` : ''}
          </div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">PPE in date</div>
          <div className="hr-stat-value">{m.ppeCompliance}%</div>
          <div className="hr-stat-subtext">{m.ppeDue} items to issue or replace</div>
        </div>
      </div>

      <div className="pr-tabstrip" role="tablist" aria-label="OSH sections">
        {OSH_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setModuleTab('osh-security', t.id)}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'incidents' && <IncidentsTab />}
      {tab === 'wiba' && <WibaTab />}
      {tab === 'permits' && <PermitsTab />}
      {tab === 'ppe' && <PpeTab />}
      {tab === 'inspections' && <InspectionsTab />}
      {tab === 'medical' && <MedicalTab />}
      {tab === 'statutory' && <StatutoryTab />}
    </div>
  );
};
