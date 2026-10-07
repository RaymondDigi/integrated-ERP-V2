import React, { useMemo, useState } from 'react';
import { CheckCircle2, RotateCcw, ShieldCheck } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { ActionRef } from '../../../context/oshState';
import { fmtDate } from '../../../data/timeEngine';
import { daysUntil, siteOf, type CorrectiveAction, type Responder } from '../../../data/oshEngine';
import type { HREmployee } from '../../../types';

export { Chips, EmpCell, Empty, Pill } from '../time/shared';

export const fmt = (iso?: string) => (iso ? fmtDate(iso) : '—');
export const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

/** Certificates the Training module holds, if it is installed. */
type CertLike = { staffId: string; certId: string; issuedOn: string; expiresOn: string; ref?: string };

/** Data of the selected company, with lookups. */
export const useOshOrg = () => {
  const app = useApp();
  const { hrEmployees, selectedOrgId, oshResponders, oshToday } = app;
  const certRecords = (app as unknown as { certRecords?: CertLike[] }).certRecords;
  return useMemo(() => {
    const staff = hrEmployees.filter((e) => e.orgId === selectedOrgId && e.status !== 'TERMINATED').sort((a, b) => a.fullName.localeCompare(b.fullName));
    const byId = new Map(hrEmployees.map((e) => [e.staffId, e]));
    const ids = new Set(staff.map((e) => e.staffId));
    // First aiders and fire marshals: Training's certificates where it has them, plus any recorded here
    const fromTraining: Responder[] = (certRecords ?? [])
      .filter((c) => ids.has(c.staffId) && (c.certId === 'FIRST_AID' || c.certId === 'FIRE_MARSHAL'))
      .map((c) => ({ id: `TR-${c.staffId}-${c.certId}-${c.issuedOn}`, orgId: selectedOrgId, staffId: c.staffId, role: c.certId === 'FIRST_AID' ? 'FIRST_AIDER' : 'FIRE_MARSHAL', certifiedOn: c.issuedOn, expiresOn: c.expiresOn, provider: `Training record ${c.ref ?? ''}`.trim() }));
    const own = oshResponders.filter((r) => r.orgId === selectedOrgId);
    const responders = fromTraining.length ? [...fromTraining, ...own.filter((r) => !fromTraining.some((t) => t.staffId === r.staffId && t.role === r.role))] : own;
    return { staff, byId, responders, respondersSource: fromTraining.length ? ('training' as const) : ('osh' as const), today: oshToday, name: (id?: string) => (id ? byId.get(id)?.fullName ?? id : '—') };
  }, [hrEmployees, selectedOrgId, oshResponders, oshToday, certRecords]);
};

export const StaffSelect: React.FC<{ value: string; onChange: (v: string) => void; staff: HREmployee[]; allowEmpty?: string; id?: string }> = ({ value, onChange, staff, allowEmpty, id }) => (
  <select id={id} className="form-control" value={value} onChange={(ev) => onChange(ev.target.value)}>
    {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
    {staff.map((e) => (
      <option key={e.staffId} value={e.staffId}>
        {e.fullName} · {e.jobTitle}
      </option>
    ))}
  </select>
);

export const dueLabel = (today: string, due?: string, soonDays = 30) => {
  if (!due) return { text: '—', cls: 'primary' };
  const d = daysUntil(today, due);
  if (d < 0) return { text: `Overdue ${-d}d`, cls: 'critical' };
  if (d === 0) return { text: 'Due today', cls: 'warning' };
  if (d <= soonDays) return { text: `Due in ${d}d`, cls: 'warning' };
  return { text: fmt(due), cls: 'success' };
};

export const ACTION_CLS = { OPEN: 'warning', DONE: 'info', VERIFIED: 'success' } as const;

/** Corrective actions with done / verify buttons. */
export const ActionTable: React.FC<{ actions: CorrectiveAction[]; refOf: (a: CorrectiveAction) => ActionRef; today: string; empty?: string }> = ({ actions, refOf, today, empty = 'No corrective actions yet.' }) => {
  const { setOshAction } = useApp();
  if (!actions.length) return <p className="pr-muted">{empty}</p>;
  return (
    <div className="pr-table-scroll">
      <table className="hr-table pr-table osh-actions">
        <thead>
          <tr>
            <th>Action</th>
            <th>Owner</th>
            <th>Due</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {actions.map((a) => {
            const late = a.status === 'OPEN' && a.due < today;
            return (
              <tr key={a.id}>
                <td>{a.text}</td>
                <td>{a.owner}</td>
                <td className={late ? 'tm-late' : ''}>{fmt(a.due)}</td>
                <td>
                  <span className={`digicraft-status-pill ${late ? 'critical' : ACTION_CLS[a.status]}`}>{late ? 'Overdue' : a.status === 'OPEN' ? 'Open' : a.status === 'DONE' ? 'Done, to verify' : 'Verified'}</span>
                  {a.verifiedOn && <div className="pr-muted">{a.verifiedBy}, {fmt(a.verifiedOn)}</div>}
                </td>
                <td className="osh-row-actions">
                  {a.status === 'OPEN' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setOshAction(refOf(a), 'DONE')}>
                      <CheckCircle2 size={13} /> Done
                    </button>
                  )}
                  {a.status === 'DONE' && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => setOshAction(refOf(a), 'VERIFIED')}>
                        <ShieldCheck size={13} /> Verify
                      </button>
                      <button className="btn btn-secondary btn-sm" title="Not effective — reopen" aria-label="Reopen" onClick={() => setOshAction(refOf(a), 'OPEN')}>
                        <RotateCcw size={13} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/** Inline form for a new corrective action. */
export const NewActionRow: React.FC<{ staff: HREmployee[]; today: string; onAdd: (a: { text: string; owner: string; due: string }) => boolean | void }> = ({ staff, today, onAdd }) => {
  const [text, setText] = useState('');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState(today);
  const add = () => {
    if (onAdd({ text, owner, due }) !== false) {
      setText('');
      setOwner('');
    }
  };
  return (
    <div className="osh-inline-form">
      <input className="form-control grow" placeholder="Corrective action" value={text} onChange={(ev) => setText(ev.target.value)} aria-label="Corrective action" />
      <select className="form-control" value={owner} onChange={(ev) => setOwner(ev.target.value)} aria-label="Owner">
        <option value="">Owner…</option>
        {staff.map((e) => (
          <option key={e.staffId} value={e.fullName}>
            {e.fullName}
          </option>
        ))}
      </select>
      <input className="form-control" type="date" min={today} value={due} onChange={(ev) => setDue(ev.target.value)} aria-label="Due date" />
      <button className="btn btn-secondary" disabled={!text.trim() || !owner} onClick={add}>
        Add
      </button>
    </div>
  );
};

export const siteStaff = (staff: HREmployee[], site: string) => staff.filter((e) => siteOf(e) === site);
