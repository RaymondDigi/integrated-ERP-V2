import React, { useMemo } from 'react';
import { ArrowLeft, ChevronRight, HandHeart, HeartHandshake, HeartPulse, Megaphone, PartyPopper } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CasesTab, erSla } from './welfare/CasesTab';
import { MedicalTab, schemeAlert } from './welfare/MedicalTab';
import { WelfareTab } from './welfare/WelfareTab';
import { EventsTab } from './welfare/EventsTab';
import { daysBetween, kes } from './welfare/shared';

export const WELFARE_TABS = [
  { id: 'cases', label: 'Grievances & Whistleblowing', icon: Megaphone },
  { id: 'medical', label: 'Medical Cover & Claims', icon: HeartPulse },
  { id: 'welfare', label: 'Welfare Entitlements', icon: HeartHandshake },
  { id: 'events', label: 'Events & CSR', icon: PartyPopper }
];

export const WelfareView: React.FC = () => {
  const { setCurrentView, moduleTabs, setModuleTab, activeTenant, selectedOrgId, welfareToday, erCases, medicalSchemes, medicalClaims, welfareRequests, staffEvents } = useApp();
  const tab = moduleTabs['welfare'] ?? 'cases';

  const k = useMemo(() => {
    const cases = erCases.filter((c) => c.orgId === selectedOrgId);
    const open = cases.filter((c) => c.stage !== 'CLOSED');
    const claims = medicalClaims.filter((c) => c.orgId === selectedOrgId);
    const requests = welfareRequests.filter((r) => r.orgId === selectedOrgId);
    const year = welfareToday.slice(0, 4);
    const next = staffEvents.filter((e) => e.orgId === selectedOrgId && e.status !== 'DONE' && e.date >= welfareToday).sort((a, b) => a.date.localeCompare(b.date))[0];
    return {
      open: open.length,
      overdue: cases.filter((c) => erSla(c, welfareToday).overdue).length,
      confidential: open.filter((c) => c.confidential).length,
      claimsOpen: claims.filter((c) => c.status === 'SUBMITTED' || c.status === 'WITH_INSURER').length,
      claimsValue: claims.filter((c) => c.status === 'SUBMITTED' || c.status === 'WITH_INSURER').reduce((t, c) => t + c.claimed, 0),
      renewals: medicalSchemes.filter((s) => s.orgId === selectedOrgId && schemeAlert(s, welfareToday).due).length,
      pending: requests.filter((r) => r.status === 'PENDING').length,
      toPay: requests.filter((r) => r.status === 'APPROVED').length,
      paidYtd: requests.filter((r) => r.status === 'PAID' && r.paidOn?.startsWith(year)).reduce((t, r) => t + r.amount, 0),
      next
    };
  }, [erCases, medicalClaims, welfareRequests, staffEvents, medicalSchemes, selectedOrgId, welfareToday]);

  return (
    <div className="hr-app-view wf-view">
      <div className="hr-app-header">
        <div>
          <div className="hr-breadcrumb-bar">
            <button className="hr-breadcrumb-btn" onClick={() => setCurrentView('apps')}>
              <ArrowLeft size={13} /> Return to Apps Launcher
            </button>
            <span>/</span>
            <span>Process #13</span>
            <span>/</span>
            <span>{WELFARE_TABS.find((t) => t.id === tab)?.label ?? WELFARE_TABS[0].label}</span>
          </div>

          <div className="hr-app-title-group">
            <div className="hr-app-icon-wrapper" style={{ background: 'linear-gradient(135deg, #e11d48, #9f1239)' }}>
              <HandHeart size={22} />
            </div>
            <div>
              <h1>
                <span>Employee Relations & Welfare</span>
                <span className="digicraft-badge-light">Process #13</span>
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                {activeTenant.name}: grievances, harassment and whistleblowing, medical and GPA/GLA cover, welfare entitlements, staff events and CSR.
              </p>
            </div>
          </div>
        </div>

        <div className="hr-app-actions">
          <button className="btn btn-primary" onClick={() => setCurrentView('travel')}>
            <span>Go to Travel (#14)</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="hr-stats-row">
        <div className="hr-stat-card">
          <div className="hr-stat-label">Open cases</div>
          <div className="hr-stat-value" style={{ color: k.overdue ? 'var(--status-critical)' : undefined }}>
            {k.open}
          </div>
          <div className="hr-stat-subtext">
            {k.overdue ? `${k.overdue} past SLA` : 'All within SLA'} · {k.confidential} confidential
          </div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Claims in progress</div>
          <div className="hr-stat-value">{k.claimsOpen}</div>
          <div className="hr-stat-subtext">
            {kes(k.claimsValue)} claimed{k.renewals ? ` · ${k.renewals} policy renewal due` : ''}
          </div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Welfare requests to act on</div>
          <div className="hr-stat-value" style={{ color: k.pending ? 'var(--status-warning)' : undefined }}>
            {k.pending + k.toPay}
          </div>
          <div className="hr-stat-subtext">
            {k.pending} to approve · {k.toPay} to pay · {kes(k.paidYtd)} paid this year
          </div>
        </div>
        <div className="hr-stat-card">
          <div className="hr-stat-label">Next staff event</div>
          <div className="hr-stat-value" style={{ fontSize: k.next ? 18 : undefined }}>
            {k.next ? `${daysBetween(welfareToday, k.next.date)} days` : '—'}
          </div>
          <div className="hr-stat-subtext">{k.next ? k.next.name : 'Nothing planned'}</div>
        </div>
      </div>

      <div className="pr-tabstrip" role="tablist" aria-label="Employee relations sections">
        {WELFARE_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setModuleTab('welfare', t.id)}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'cases' && <CasesTab />}
      {tab === 'medical' && <MedicalTab />}
      {tab === 'welfare' && <WelfareTab />}
      {tab === 'events' && <EventsTab />}
    </div>
  );
};
