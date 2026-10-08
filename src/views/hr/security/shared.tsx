import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { GUARD_CONTRACTOR, SITE, nowStamp } from '../../../data/securitySeed';

export { Card, Empty, Field, Modal, PersonSelect, Pill, Stat, fmt, kes, type Tone } from '../registers/shared';

/** '2026-10-08T14:05' → '8 Oct 14:05' */
export const fmtStamp = (s?: string) => {
  if (!s) return '—';
  const d = new Date(s);
  return `${d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })} ${s.slice(11, 16)}`;
};

/** Current stamp, refreshed every minute so overstays and patrol status update on screen. */
export const useNow = () => {
  const [now, setNow] = useState(nowStamp());
  useEffect(() => {
    const t = window.setInterval(() => setNow(nowStamp()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
};

/** Staff of the selected company, guards on its roster and a name lookup across the group. */
export const useSecOrg = () => {
  const { hrEmployees, selectedOrgId, securityToday, guardShifts, activeTenant } = useApp();
  return useMemo(() => {
    const byId = new Map(hrEmployees.map((e) => [e.staffId, e]));
    const staff = hrEmployees.filter((e) => e.orgId === selectedOrgId && e.status !== 'TERMINATED').sort((a, b) => a.fullName.localeCompare(b.fullName));
    const contractor = GUARD_CONTRACTOR[selectedOrgId] ?? 'Contract guards';
    const short = contractor.split(' ').slice(0, 2).join(' ');
    // Guards as "Name (Contractor)" for gate and escort records
    const guards = [...new Set(guardShifts.filter((g) => g.orgId === selectedOrgId).map((g) => `${g.guardName} (${short})`))].sort();
    return {
      staff,
      byId,
      guards,
      contractor,
      orgId: selectedOrgId,
      today: securityToday,
      site: SITE[selectedOrgId] ?? activeTenant.name,
      company: activeTenant.name,
      name: (id?: string) => (id ? byId.get(id)?.fullName ?? id : '—')
    };
  }, [hrEmployees, selectedOrgId, securityToday, guardShifts, activeTenant.name]);
};

/** Guard picker: roster guards, or type another name. */
export const GuardInput: React.FC<{ value: string; onChange: (v: string) => void; guards: string[]; id: string }> = ({ value, onChange, guards, id }) => (
  <>
    <input className="form-control" list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Guard on duty" />
    <datalist id={id}>
      {guards.map((g) => (
        <option key={g} value={g} />
      ))}
    </datalist>
  </>
);
