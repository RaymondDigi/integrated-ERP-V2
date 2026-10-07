import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { PayComponentType } from '../../../data/payComponents';
import { periodOf, type Period } from './reports';

export const Modal: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  width?: number;
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, width = 760, footer, children }) => {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="req-modal-overlay" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="req-modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="req-modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="btn btn-secondary" style={{ padding: 6 }} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="req-modal-body" style={{ gap: 'var(--space-4)' }}>
          {children}
        </div>
        {footer && <div className="req-modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

/** Which statutory bases a component counts towards — struck through when it does not. */
export const Flags: React.FC<{ c: PayComponentType }> = ({ c }) => {
  if (c.category === 'deduction') return <span className="pr-muted">After tax · priority {c.priority}</span>;
  if (c.category === 'pretax') return <span className="pr-muted">{c.taxEffect === 'mortgage_interest' ? 'Reduces taxable pay' : c.taxEffect === 'pmf' ? '15% relief' : 'Reduces taxable pay (capped)'}</span>;
  return (
    <span className="pr-chips">
      <span className={`pr-chip ${c.paye === 'taxable' ? 'on' : c.paye === 'exempt_up_to_cap' ? 'cap' : ''}`} title={c.paye === 'exempt_up_to_cap' ? `Tax-free up to KES ${c.payeExemptCap?.toLocaleString()}` : undefined}>
        PAYE
      </span>
      <span className={`pr-chip ${c.nssf ? 'on' : ''}`}>NSSF</span>
      <span className={`pr-chip ${c.shif ? 'on' : ''}`}>SHIF</span>
      <span className={`pr-chip ${c.ahl ? 'on' : ''}`}>AHL</span>
      {!c.isCash && <span className="pr-chip cap">Non-cash</span>}
    </span>
  );
};

export const useCompanyName = () => {
  const { tenantOrganizations } = useApp();
  return (orgId: string) => tenantOrganizations.find((t) => t.id === orgId)?.name ?? orgId;
};

/** Pay period picker: the active period first, then upcoming and previous (paid) periods. */
export const PeriodSelect: React.FC<{ value: string; periods: Period[]; onChange: (p: Period) => void; label?: string }> = ({ value, periods, onChange, label }) => {
  const { payrollOpenPeriod } = useApp();
  const active = periods.filter((p) => p.key === payrollOpenPeriod.key);
  const upcoming = periods.filter((p) => p.key > payrollOpenPeriod.key).sort((a, b) => a.key.localeCompare(b.key));
  const previous = periods.filter((p) => p.key < payrollOpenPeriod.key).sort((a, b) => b.key.localeCompare(a.key));
  const opt = (p: Period, suffix = '') => (
    <option key={p.key} value={p.key}>
      {p.label}
      {suffix}
    </option>
  );
  return (
    <select className="form-control" value={value} aria-label={label ?? 'Pay period'} onChange={(ev) => onChange(periods.find((p) => p.key === ev.target.value)!)}>
      {active.length > 0 && <optgroup label="Active payroll period">{active.map((p) => opt(p, ' — active'))}</optgroup>}
      {upcoming.length > 0 && <optgroup label="Upcoming periods">{upcoming.map((p) => opt(p))}</optgroup>}
      {previous.length > 0 && <optgroup label="Previous periods (paid)">{previous.map((p) => opt(p, ' — paid'))}</optgroup>}
    </select>
  );
};

/** "Active" or "Previous" tag for a period, used beside headings. */
export const PeriodTag: React.FC<{ periodKey: string }> = ({ periodKey }) => {
  const { payrollOpenPeriod } = useApp();
  const state = periodKey === payrollOpenPeriod.key ? 'Active period' : periodKey > payrollOpenPeriod.key ? 'Upcoming' : 'Previous period — paid';
  return <span className={`digicraft-status-pill ${state === 'Active period' ? 'warning' : state === 'Upcoming' ? 'info' : 'success'}`}>{state}</span>;
};

/** Open period plus a few months ahead (for recurring items and loans). */
export const forwardPeriods = (open: { year: number; month: number }, ahead = 6): Period[] => Array.from({ length: ahead + 1 }, (_, i) => periodOf(open.year, open.month + i));
