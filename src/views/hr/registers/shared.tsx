import React, { useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { fmtDate } from '../../../data/hireEngine';

export { Card, Empty, Field, Modal, PersonSelect, Stat } from '../hire/shared';

export type Tone = 'success' | 'primary' | 'info' | 'warning' | 'danger';

/** Status pill; 'danger' uses the red critical style. */
export const Pill: React.FC<{ tone: Tone; children: React.ReactNode; title?: string }> = ({ tone, children, title }) => (
  <span className={`digicraft-status-pill ${tone === 'danger' ? 'critical' : tone}`} title={title}>
    {children}
  </span>
);

export const fmt = (iso?: string) => (iso ? fmtDate(iso) : '—');
export const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

/** Staff of the selected company, with a name lookup across the group. */
export const useRegOrg = () => {
  const { hrEmployees, selectedOrgId, registersToday } = useApp();
  return useMemo(() => {
    const byId = new Map(hrEmployees.map((e) => [e.staffId, e]));
    const staff = hrEmployees.filter((e) => e.orgId === selectedOrgId && e.status !== 'TERMINATED').sort((a, b) => a.fullName.localeCompare(b.fullName));
    return { staff, byId, orgId: selectedOrgId, today: registersToday, name: (id?: string) => (id ? byId.get(id)?.fullName ?? id : '—') };
  }, [hrEmployees, selectedOrgId, registersToday]);
};
