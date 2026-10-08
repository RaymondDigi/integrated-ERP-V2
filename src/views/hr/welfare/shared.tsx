import React, { useMemo } from 'react';
import { Search } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { fmtDate } from '../../../data/timeEngine';
import type { HREmployee } from '../../../types';

export { Modal } from '../payroll/shared';
export { Drawer } from '../leave/shared';
export { Card, Field, Stat } from '../hire/shared';

export type Tone = 'success' | 'primary' | 'info' | 'warning' | 'critical';

export const Pill: React.FC<{ tone: Tone; children: React.ReactNode; title?: string }> = ({ tone, children, title }) => (
  <span className={`digicraft-status-pill ${tone}`} title={title}>
    {children}
  </span>
);

export const fmt = (iso?: string) => (iso ? fmtDate(iso) : '—');
export const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000);

/** Staff of the selected company with lookups. */
export const useWfOrg = () => {
  const { hrEmployees, selectedOrgId, welfareToday } = useApp();
  return useMemo(() => {
    const staff = hrEmployees.filter((e) => e.orgId === selectedOrgId && e.status !== 'TERMINATED').sort((a, b) => a.fullName.localeCompare(b.fullName));
    const byId = new Map(hrEmployees.map((e) => [e.staffId, e]));
    return { staff, byId, today: welfareToday, orgId: selectedOrgId, name: (id?: string) => (id ? byId.get(id)?.fullName ?? id : '—') };
  }, [hrEmployees, selectedOrgId, welfareToday]);
};

export const StaffSelect: React.FC<{ value: string; onChange: (v: string) => void; staff: HREmployee[]; placeholder?: string; id?: string; ariaLabel?: string }> = ({ value, onChange, staff, placeholder = 'Choose a person', id, ariaLabel }) => (
  <select id={id} className="form-control" value={value} onChange={(ev) => onChange(ev.target.value)} aria-label={ariaLabel}>
    <option value="">{placeholder}</option>
    {staff.map((e) => (
      <option key={e.staffId} value={e.staffId}>
        {e.fullName} · {e.jobTitle}
      </option>
    ))}
  </select>
);

export const Person: React.FC<{ id?: string; name: (id?: string) => string; sub?: React.ReactNode }> = ({ id, name, sub }) => (
  <div className="wf-person">
    <strong>{name(id)}</strong>
    {(id || sub) && (
      <span>
        {id}
        {id && sub ? ' · ' : ''}
        {sub}
      </span>
    )}
  </div>
);

export const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string }> = ({ value, onChange, placeholder }) => (
  <div className="digicraft-search-box">
    <Search size={16} className="digicraft-search-icon" />
    <input type="text" placeholder={placeholder} value={value} onChange={(ev) => onChange(ev.target.value)} aria-label={placeholder} />
  </div>
);

export const FilterPills = <T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; n?: number }[]; onChange: (v: T) => void }) => (
  <div className="digicraft-filter-pills">
    {options.map((o) => (
      <button key={o.id} className={`digicraft-filter-pill ${value === o.id ? 'active' : ''}`} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
        {o.label}
        {o.n !== undefined ? ` (${o.n})` : ''}
      </button>
    ))}
  </div>
);

export const Empty: React.FC<{ cols: number; children: React.ReactNode }> = ({ cols, children }) => (
  <tr>
    <td colSpan={cols} className="hi-empty">
      {children}
    </td>
  </tr>
);

export const Bar: React.FC<{ pct: number }> = ({ pct }) => {
  const tone = pct >= 100 ? 'danger' : pct >= 80 ? 'warning' : 'success';
  return (
    <div className={`hi-bar ${tone}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
};
