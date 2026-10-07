import React, { useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { TRACKED_ORGS } from '../../../data/timeConfig';
import { type DayRecord, type DayStatus, type ExceptionKind } from '../../../data/timeEngine';
import type { HREmployee } from '../../../types';

export const DAY_STATUS: Record<DayStatus, { label: string; cls: string }> = {
  PRESENT: { label: 'Present', cls: 'success' },
  LATE: { label: 'Late', cls: 'warning' },
  ON_SITE: { label: 'On site', cls: 'success' },
  ABSENT: { label: 'Absent', cls: 'critical' },
  LEAVE: { label: 'On leave', cls: 'info' },
  OFF: { label: 'Rest day', cls: 'primary' },
  HOLIDAY: { label: 'Public holiday', cls: 'primary' },
  NOT_IN_YET: { label: 'Not in yet', cls: 'primary' },
  MISSING_OUT: { label: 'No punch-out', cls: 'warning' },
  MISSING_IN: { label: 'No punch-in', cls: 'warning' },
  NOT_ENGAGED: { label: 'Not engaged', cls: 'primary' },
  SUSPENDED: { label: 'Suspended', cls: 'critical' }
};

export const KIND_CLS: Record<ExceptionKind, string> = {
  MISSING_OUT: 'warning',
  MISSING_IN: 'warning',
  ABSENT: 'critical',
  LATE: 'warning',
  EARLY: 'warning',
  OVERTIME: 'info',
  GEOFENCE: 'primary'
};

export const Pill: React.FC<{ cls: string; children: React.ReactNode; title?: string }> = ({ cls, children, title }) => (
  <span className={`digicraft-status-pill ${cls}`} title={title}>
    {children}
  </span>
);

export const StatusPill: React.FC<{ d: DayRecord }> = ({ d }) => {
  const s = DAY_STATUS[d.status];
  const label = d.status === 'LEAVE' && d.leave ? d.leave : d.status === 'HOLIDAY' && d.holiday ? d.holiday : s.label;
  return <Pill cls={s.cls}>{label}</Pill>;
};

export const EmpCell: React.FC<{ e?: HREmployee; id: string; sub?: React.ReactNode }> = ({ e, id, sub }) => (
  <div className="tm-emp">
    <strong>{e?.fullName ?? id}</strong>
    <span>
      {id}
      {e ? ` · ${e.jobTitle}` : ''}
    </span>
    {sub && <span>{sub}</span>}
  </div>
);

/** Filter chips with counts. */
export const Chips = <T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; n?: number }[]; onChange: (v: T) => void; label: string }) => (
  <div className="tm-chips" role="group" aria-label={label}>
    {options.map((o) => (
      <button key={o.id} className={value === o.id ? 'active' : ''} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
        {o.label}
        {o.n !== undefined && <span>{o.n}</span>}
      </button>
    ))}
  </div>
);

export const Empty: React.FC<{ cols: number; children: React.ReactNode }> = ({ cols, children }) => (
  <tr>
    <td colSpan={cols} className="tm-empty">
      {children}
    </td>
  </tr>
);

/** Employees of the selected company whose time is tracked, with a lookup by staff ID. */
export const useTimeOrg = () => {
  const { hrEmployees, selectedOrgId, timeDays, timeToday, payrollOpenPeriod } = useApp();
  return useMemo(() => {
    const staff = hrEmployees.filter((e) => e.orgId === selectedOrgId);
    const byId = new Map(hrEmployees.map((e) => [e.staffId, e]));
    const days = timeDays.filter((d) => d.orgId === selectedOrgId);
    return { staff, byId, days, tracked: TRACKED_ORGS.includes(selectedOrgId), today: timeToday, openStart: `${payrollOpenPeriod.key}-01` };
  }, [hrEmployees, selectedOrgId, timeDays, timeToday, payrollOpenPeriod.key]);
};

export const NotTracked: React.FC = () => {
  const { activeTenant } = useApp();
  return (
    <div className="pr-card tm-not-tracked">
      <h3>No terminals connected for {activeTenant.name}</h3>
      <p>Time data is only collected for companies with biometric terminals or the mobile punch app switched on. Switch to Kericho Highland Estates to see live attendance.</p>
    </div>
  );
};

export const departmentsOf = (staff: HREmployee[]) => [...new Set(staff.map((e) => e.department))].sort();
