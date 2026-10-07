import React from 'react';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import { useApp, type NavigationTarget } from '../../../context/AppContext';
import type { HREmployee } from '../../../types';

export { Modal } from '../payroll/shared';
export { Drawer } from '../leave/shared';

export interface TabDef {
  id: string;
  label: string;
  icon: LucideIcon;
}

/** Active tab of a module, shared with the module sidebar. */
export const useModuleTab = (view: string, first: string) => {
  const { moduleTabs, setModuleTab } = useApp();
  return [moduleTabs[view] ?? first, (t: string) => setModuleTab(view, t)] as const;
};

export const HireHeader: React.FC<{
  step: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  gradient: string;
  view: string;
  tabs: TabDef[];
  next: { label: string; view: NavigationTarget };
  actions?: React.ReactNode;
}> = ({ step, title, subtitle, icon: Icon, gradient, view, tabs, next, actions }) => {
  const { setCurrentView } = useApp();
  const [tab, setTab] = useModuleTab(view, tabs[0].id);
  return (
    <>
      <div className="hr-app-header">
        <div>
          <div className="hr-breadcrumb-bar">
            <button className="hr-breadcrumb-btn" onClick={() => setCurrentView('apps')}>
              <ArrowLeft size={13} /> Return to Apps Launcher
            </button>
            <span>/</span>
            <span>Process #{step}</span>
            <span>/</span>
            <span>{tabs.find((t) => t.id === tab)?.label ?? tabs[0].label}</span>
          </div>
          <div className="hr-app-title-group">
            <div className="hr-app-icon-wrapper" style={{ background: gradient }}>
              <Icon size={22} />
            </div>
            <div>
              <h1>
                <span>{title}</span>
                <span className="digicraft-badge-light">Process #{step}</span>
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>{subtitle}</p>
            </div>
          </div>
        </div>
        <div className="hr-app-actions">
          {actions}
          <button className="btn btn-primary" onClick={() => setCurrentView(next.view)}>
            <span>{next.label}</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <div className="pr-tabstrip" role="tablist" aria-label={`${title} sections`}>
        {tabs.map((t) => {
          const TIcon = t.icon;
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <TIcon size={14} /> {t.label}
            </button>
          );
        })}
      </div>
    </>
  );
};

export type Tone = 'success' | 'primary' | 'info' | 'warning' | 'danger';

export const Pill: React.FC<{ tone: Tone; children: React.ReactNode; title?: string }> = ({ tone, children, title }) => (
  <span className={`digicraft-status-pill ${tone}`} title={title}>
    {children}
  </span>
);

export const Stat: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }> = ({ label, value, sub, tone }) => (
  <div className="hr-stat-card">
    <div className="hr-stat-label">{label}</div>
    <div className="hr-stat-value" style={tone ? { color: tone } : undefined}>
      {value}
    </div>
    {sub && <div className="hr-stat-subtext">{sub}</div>}
  </div>
);

export const Card: React.FC<{ title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, sub, actions, children, className }) => (
  <div className={`pr-card ${className ?? ''}`}>
    <div className="pr-card-head">
      <div>
        <h3>{title}</h3>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="pr-toolbar">{actions}</div>}
    </div>
    {children}
  </div>
);

export const Progress: React.FC<{ pct: number; tone?: Tone }> = ({ pct, tone = 'primary' }) => (
  <div className={`hi-bar ${tone}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
    <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </div>
);

export const Field: React.FC<{ label: string; children: React.ReactNode; hint?: React.ReactNode; wide?: boolean }> = ({ label, children, hint, wide }) => (
  <label className={`req-field ${wide ? 'wide' : ''}`}>
    <span>{label}</span>
    {children}
    {hint && <small className="hi-hint">{hint}</small>}
  </label>
);

export const PersonSelect: React.FC<{ value: string; onChange: (v: string) => void; people: HREmployee[]; placeholder?: string; id?: string }> = ({ value, onChange, people, placeholder = 'Choose a person', id }) => (
  <select id={id} className="form-control" value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">{placeholder}</option>
    {people.map((p) => (
      <option key={p.staffId} value={p.staffId}>
        {p.fullName} — {p.jobTitle}
      </option>
    ))}
  </select>
);

export const Empty: React.FC<{ cols: number; children: React.ReactNode }> = ({ cols, children }) => (
  <tr>
    <td colSpan={cols} className="hi-empty">
      {children}
    </td>
  </tr>
);

/** Managers and HR who can act as approvers in the demo, across the group. */
export const useApprovers = () => {
  const { hrEmployees, selectedOrgId } = useApp();
  return hrEmployees
    .filter((e) => e.status !== 'TERMINATED' && (e.orgId === selectedOrgId || /group/i.test(e.jobTitle) || e.orgId === 'org-nairobi') && /manager|director|chief|officer|head|accountant|HR/i.test(e.jobTitle) && e.basicSalaryKes >= 60_000)
    .sort((a, b) => (a.orgId === selectedOrgId ? 0 : 1) - (b.orgId === selectedOrgId ? 0 : 1) || b.basicSalaryKes - a.basicSalaryKes);
};

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase();
