import React, { useMemo } from 'react';
import { CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { fmtDate, gradeOf } from '../../../data/hireEngine';
import { FINANCE_APPROVER, IMPREST_STATUS, overdueDays, TRAVEL_STATUS, type Imprest, type TravelEvent, type TravelRequest } from '../../../data/travelEngine';
import { Pill } from '../hire/shared';

export { Card, Empty, Field, Modal, Pill, PersonSelect, Stat } from '../hire/shared';

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
export const fmt = (iso?: string) => (iso ? fmtDate(iso) : '—');

/** Staff of the selected company with lookups. */
export const useTravelOrg = () => {
  const { hrEmployees, selectedOrgId } = useApp();
  return useMemo(() => {
    const byId = new Map(hrEmployees.map((e) => [e.staffId, e]));
    const staff = hrEmployees.filter((e) => e.orgId === selectedOrgId && e.status !== 'TERMINATED').sort((a, b) => a.fullName.localeCompare(b.fullName));
    return { staff, byId, name: (id?: string) => (id ? (byId.get(id)?.fullName ?? id) : '—'), grade: (id: string) => (byId.get(id) ? gradeOf(byId.get(id)!) : '') };
  }, [hrEmployees, selectedOrgId]);
};

export const TravelPill: React.FC<{ r: TravelRequest }> = ({ r }) => <Pill tone={TRAVEL_STATUS[r.status].tone}>{TRAVEL_STATUS[r.status].label}</Pill>;

export const ImprestPill: React.FC<{ i: Imprest; today: string }> = ({ i, today }) => {
  const late = overdueDays(i, today);
  return late > 0 ? <Pill tone="danger">Overdue {late}d</Pill> : <Pill tone={IMPREST_STATUS[i.status].tone}>{IMPREST_STATUS[i.status].label}</Pill>;
};

export const EmpCell: React.FC<{ staffId: string; sub?: React.ReactNode }> = ({ staffId, sub }) => {
  const { name } = useTravelOrg();
  return (
    <>
      {name(staffId)}
      <div className="hi-sub">
        {staffId}
        {sub ? <> · {sub}</> : null}
      </div>
    </>
  );
};

export const Timeline: React.FC<{ events: TravelEvent[] }> = ({ events }) => (
  <ol className="hi-timeline">
    {events.map((e, k) => (
      <li key={k}>
        <strong>{e.action}</strong>
        <span>
          {e.by} · {fmt(e.at)}
        </span>
        {e.comment && <em>“{e.comment}”</em>}
      </li>
    ))}
  </ol>
);

/** Line manager → Finance approval chain. */
export const ApprovalChain: React.FC<{ r: TravelRequest }> = ({ r }) => {
  const { name } = useTravelOrg();
  const find = (re: RegExp) => [...r.events].reverse().find((e) => re.test(e.action));
  const steps = [
    { key: 'MANAGER', label: 'Line manager', who: name(r.managerId), done: find(/approved by line manager/i), bad: find(/declined by line manager/i), current: r.status === 'SUBMITTED' },
    { key: 'FINANCE', label: 'Finance', who: name(FINANCE_APPROVER), done: find(/approved by finance/i), bad: find(/declined by finance/i), current: r.status === 'MANAGER_APPROVED' }
  ];
  return (
    <ol className="hi-chain">
      <li className={r.status === 'DRAFT' ? 'current' : 'done'}>
        {r.status === 'DRAFT' ? <Clock size={16} /> : <CheckCircle2 size={16} />}
        <div>
          <strong>Requested</strong>
          <span>
            {name(r.staffId)} · {fmt(r.createdOn)}
            {r.status === 'DRAFT' ? ' (draft — not submitted)' : ''}
          </span>
        </div>
      </li>
      {steps.map((s) => (
        <li key={s.key} className={s.done ? 'done' : s.bad ? 'bad' : s.current ? 'current' : ''}>
          {s.done ? <CheckCircle2 size={16} /> : s.bad ? <XCircle size={16} /> : s.current ? <Clock size={16} /> : <Circle size={16} />}
          <div>
            <strong>{s.label}</strong>
            <span>
              {s.done
                ? `Approved by ${s.done.by} · ${fmt(s.done.at)}`
                : s.bad
                  ? `Declined by ${s.bad.by} · ${fmt(s.bad.at)}`
                  : r.status === 'DECLINED'
                    ? 'Not reached'
                    : s.current
                      ? `Waiting for ${s.who}`
                      : `Next: ${s.who}`}
            </span>
            {(s.done ?? s.bad)?.comment && <em>“{(s.done ?? s.bad)?.comment}”</em>}
          </div>
        </li>
      ))}
    </ol>
  );
};
