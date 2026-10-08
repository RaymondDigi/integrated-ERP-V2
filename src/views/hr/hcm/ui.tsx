import React from 'react';
import { useApp } from '../../../context/AppContext';
import { useAccess } from '../../../platform/access';
import type { HREmployee } from '../../../types';
import { active } from '../../../data/hcmEngine';

/** Shared bits for the HR services screens: staff lookups, buttons, status pills and simulated-integration labels. */

export const useStaff = () => {
  const { tenantEmployees, hrEmployees } = useApp();
  const current = tenantEmployees.filter(active);
  const byId = (id?: string) => hrEmployees.find((e) => e.staffId === id);
  const nameOf = (id?: string) => byId(id)?.fullName ?? id ?? '—';
  return { current, byId, nameOf };
};

export const StaffSelect: React.FC<{ value: string; onChange: (v: string) => void; label?: string; list?: HREmployee[]; allowEmpty?: string }> = ({ value, onChange, label = 'Employee', list, allowEmpty }) => {
  const { current } = useStaff();
  const rows = (list ?? current).slice().sort((a, b) => a.fullName.localeCompare(b.fullName));
  return (
    <select className="form-control" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{allowEmpty ?? `Choose ${label.toLowerCase()}…`}</option>
      {rows.map((e) => (
        <option key={e.staffId} value={e.staffId}>
          {e.fullName} · {e.staffId}
        </option>
      ))}
    </select>
  );
};

export const Btn: React.FC<{ onClick: () => void; primary?: boolean; disabled?: boolean; title?: string; children: React.ReactNode }> = ({ onClick, primary, disabled, title, children }) => (
  <button type="button" className={`btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={onClick} disabled={disabled} title={title}>
    {children}
  </button>
);

const TONE: Record<string, string> = {
  ACTIVE: 'success', APPROVED: 'info', AGREED: 'info', DONE: 'success', PAID: 'success', ISSUED: 'success', CLOSED: 'neutral', COMPLETED: 'success', SETTLED: 'success', RESOLVED: 'success', CLEARED: 'success', ARRIVED: 'success',
  SUBMITTED: 'warning', REQUESTED: 'warning', PENDING: 'warning', HR_APPROVED: 'info', MANAGER_APPROVED: 'info', PLANNED: 'info', DRAFT: 'neutral', OPEN: 'warning', NOTIFIED: 'warning', DOCUMENTED: 'info', ASSESSED: 'info',
  RECEIVED: 'warning', INVESTIGATING: 'info', HEARING: 'info', APPEALED: 'warning', IN_TRANSIT: 'info', IN_PROGRESS: 'info', GENERATED: 'info', UPLOADED: 'success', SURRENDERED: 'info', HELD: 'critical', NEW: 'critical', ACKNOWLEDGED: 'warning',
  REJECTED: 'critical', TERMINATED: 'critical', CANCELLED: 'neutral', DISCREPANCY: 'critical', MISSED_POINTS: 'critical', OVERDUE: 'critical', FINDINGS: 'info', ASSIGNED: 'info', HELD_EVENT: 'success'
};
export const StatusPill: React.FC<{ status: string; label?: string }> = ({ status, label }) => (
  <span className={`sx-pill sx-pill-${TONE[status] ?? 'neutral'}`}>
    <i />
    {label ?? status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
  </span>
);

/** Marks a screen or action that stands in for an outside system (bank portal, biometric terminal, CCTV). */
export const SimulatedBadge: React.FC<{ what: string }> = ({ what }) => (
  <span className="sx-pill sx-pill-warning" title={`${what} is simulated in this demo — no external system is called.`}>
    <i />
    Simulated · {what}
  </span>
);

/** Viewer accounts see every screen read-only; the store refuses their changes as well. */
export const useCanEdit = () => {
  const a = useAccess();
  return { canEdit: a.role !== 'viewer', canApprove: a.canApprove, name: a.name, role: a.role };
};

export const Toolbar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="pr-toolbar" style={{ padding: '12px 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    {children}
  </div>
);
