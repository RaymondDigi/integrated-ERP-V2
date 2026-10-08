import React, { useMemo, useState } from 'react';
import { Plus, Search, ShieldOff, Bell } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { NewEmployeeEvent } from '../../../context/peopleState';
import type { HREmployee } from '../../../types';
import { usePaged, Pager } from '../../../components/common/Pager';
import { CONTRACT_TYPES } from '../../../data/hrMockData';
import { GRADE_BANDS } from '../../../data/hireConfig';
import { addDays, daysBetween, fmtDate, todayIso } from '../../../data/hireEngine';
import { EVENT_LABEL, monthOf, prevMonth, retirementOf, SUSPENSION_PAY_LABEL, type EmployeeEvent, type EventKind, type SuspensionPay } from '../../../data/peopleSeed';
import { Card, Empty, Field, Modal, PersonSelect, Pill, Stat, useApprovers, type Tone } from '../hire/shared';

const STATUS: Record<EmployeeEvent['status'], [string, Tone]> = {
  ACTIVE: ['In force', 'primary'],
  COMPLETED: ['Done', 'success'],
  ENDED_EARLY: ['Ended early', 'warning'],
  LIFTED: ['Lifted', 'success'],
  ISSUED: ['Notice issued', 'info']
};

const NEW_KINDS: EventKind[] = ['ACTING', 'DEMOTION', 'REASSIGNMENT', 'SUSPENSION', 'REHIRE'];

/** Who retires in the next six months and whose contract ends in the next 90 days. */
export const useUpcomingExits = (people: HREmployee[], today = todayIso()) =>
  useMemo(() => {
    const live = people.filter((e) => e.status !== 'TERMINATED' && !(e.exitDate && e.exitDate < today));
    const retiring = live
      .map((e) => ({ e, date: retirementOf(e) }))
      .filter((x): x is { e: HREmployee; date: string } => !!x.date && x.date >= today && daysBetween(today, x.date) <= 183)
      .sort((a, b) => a.date.localeCompare(b.date));
    const contracts = live
      .filter((e) => e.contractEndDate && e.contractEndDate >= today && daysBetween(today, e.contractEndDate) <= 90)
      .map((e) => ({ e, date: e.contractEndDate! }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { retiring, contracts };
  }, [people, today]);

export const EventsTab: React.FC = () => {
  const { employeeEvents, tenantEmployees, selectedOrgId, issueEmployeeNotice } = useApp();
  const [kind, setKind] = useState<'All' | EventKind>('All');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState<EmployeeEvent | null>(null);
  const today = todayIso();

  const mine = useMemo(() => employeeEvents.filter((x) => x.orgId === selectedOrgId), [employeeEvents, selectedOrgId]);
  const suspended = mine.filter((x) => x.kind === 'SUSPENSION' && x.status === 'ACTIVE');
  const acting = mine.filter((x) => x.kind === 'ACTING' && x.status === 'ACTIVE');
  const { retiring, contracts } = useUpcomingExits(tenantEmployees, today);
  const noticeOf = (k: 'RETIREMENT_NOTICE' | 'CONTRACT_NOTICE', staffId: string, date: string) => mine.find((x) => x.kind === k && x.staffId === staffId && x.noticeFor === date);
  const upcoming = [...retiring.map((x) => ({ ...x, k: 'RETIREMENT_NOTICE' as const })), ...contracts.map((x) => ({ ...x, k: 'CONTRACT_NOTICE' as const }))].sort((a, b) => a.date.localeCompare(b.date));
  const pendingNotices = upcoming.filter((u) => !noticeOf(u.k, u.e.staffId, u.date)).length;

  const q = search.trim().toLowerCase();
  const rows = mine
    .filter((x) => (kind === 'All' || x.kind === kind) && (!q || `${x.staffName} ${x.staffId} ${x.id} ${x.toValue} ${x.reason}`.toLowerCase().includes(q)))
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  const pg = usePaged(rows, 10, `${kind}|${q}|${selectedOrgId}`);

  return (
    <>
      <div className="hr-stats-row">
        <Stat label="Acting appointments" value={acting.length} sub={acting.length ? acting.map((a) => a.staffName.split(' ')[0]).join(', ') : 'None open'} />
        <Stat label="Suspended now" value={suspended.length} sub="System access blocked until lifted" tone={suspended.length ? 'var(--status-critical)' : undefined} />
        <Stat label="Retiring in 6 months" value={retiring.length} sub="Date of birth + retirement age" tone={retiring.length ? '#d97706' : undefined} />
        <Stat label="Notices to issue" value={pendingNotices} sub={`${contracts.length} contract${contracts.length === 1 ? '' : 's'} end within 90 days`} tone={pendingNotices ? '#d97706' : undefined} />
      </div>

      {suspended.length > 0 && (
        <Card title="Suspended staff" sub="A suspended employee cannot sign in to the workspace or the employee portal. Lifting the suspension restores access at once.">
          <div className="hi-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Period</th>
                  <th>Pay</th>
                  <th>System access</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {suspended.map((s) => {
                  const over = s.to! < today;
                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.staffName}</strong>
                        <div className="hi-sub">
                          {s.staffId} · {s.id}
                        </div>
                      </td>
                      <td>
                        {fmtDate(s.from)} – {fmtDate(s.to)}
                        <div className={`hi-sub ${over ? 'hi-neg' : ''}`}>{over ? `Ended ${-daysBetween(today, s.to!)} days ago — lift it` : `${daysBetween(today, s.to!)} days left`}</div>
                      </td>
                      <td>{SUSPENSION_PAY_LABEL[s.suspension!.pay]}</td>
                      <td>
                        <Pill tone="danger">
                          <ShieldOff size={11} /> System access: blocked
                        </Pill>
                      </td>
                      <td className="hi-wrap">{s.reason}</td>
                      <td>
                        <button className="btn btn-primary btn-sm" onClick={() => setClosing(s)}>
                          Lift suspension
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Retirements and contract expiries" sub="Everyone reaching retirement age in the next six months and every fixed-term contract ending in the next 90 days. Issue the notice so the employee and payroll can plan.">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Why</th>
                <th>Date</th>
                <th>Notice</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {upcoming.length === 0 && <Empty cols={5}>Nobody retires or reaches a contract end soon.</Empty>}
              {upcoming.map((u) => {
                const n = noticeOf(u.k, u.e.staffId, u.date);
                const left = daysBetween(today, u.date);
                return (
                  <tr key={`${u.k}-${u.e.staffId}`}>
                    <td>
                      <strong>{u.e.fullName}</strong>
                      <div className="hi-sub">
                        {u.e.staffId} · {u.e.jobTitle}
                      </div>
                    </td>
                    <td>{u.k === 'RETIREMENT_NOTICE' ? `Retirement at ${u.e.retirementAge ?? 60}` : `${u.e.contractType} ends`}</td>
                    <td>
                      {fmtDate(u.date)}
                      <div className={`hi-sub ${left <= 30 ? 'hi-neg' : ''}`}>{left} days</div>
                    </td>
                    <td>
                      {n ? (
                        <Pill tone="success" title={`${n.id} by ${n.recordedBy}`}>
                          Issued {fmtDate(n.recordedOn)}
                        </Pill>
                      ) : (
                        <Pill tone="warning">Pending</Pill>
                      )}
                      {n && <div className="hi-sub">by {n.recordedBy}</div>}
                    </td>
                    <td>
                      {!n && (
                        <button className="btn btn-secondary btn-sm" onClick={() => issueEmployeeNotice(u.k, u.e.staffId, u.date)}>
                          <Bell size={13} /> Issue notice
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Event register"
        sub="Acting appointments, demotions, duty changes, suspensions, re-hires and notices. Each one is written to the employee's history and the audit trail."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> New event
          </button>
        }
      >
        <div className="digicraft-toolbar" style={{ marginBottom: 12 }}>
          <div className="digicraft-search-box">
            <Search size={16} className="digicraft-search-icon" />
            <input type="text" placeholder="Search by person, reference or reason..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="digicraft-filter-pills">
            {(['All', ...(Object.keys(EVENT_LABEL) as EventKind[])] as const).map((k) => (
              <button key={k} className={`digicraft-filter-pill ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
                {k === 'All' ? 'All' : EVENT_LABEL[k].replace(' appointment', '').replace('Contract expiry notice', 'Contract notice')}
              </button>
            ))}
          </div>
        </div>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Employee</th>
                <th>Event</th>
                <th>Effective</th>
                <th>From → to</th>
                <th>Approved by</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={8}>No events match.</Empty>}
              {pg.rows.map((x) => (
                <tr key={x.id}>
                  <td className="hi-mono">{x.id}</td>
                  <td>
                    {x.staffName}
                    <div className="hi-sub">{x.staffId}</div>
                  </td>
                  <td className="hi-wrap">
                    <strong>{EVENT_LABEL[x.kind]}</strong>
                    <div className="hi-sub">{x.reason}</div>
                  </td>
                  <td>
                    {fmtDate(x.effectiveDate)}
                    {x.from && x.to && (
                      <div className="hi-sub">
                        {fmtDate(x.from)} – {fmtDate(x.to)}
                      </div>
                    )}
                  </td>
                  <td className="hi-wrap">
                    <div className="hi-sub">{x.fromValue}</div>
                    <div>→ {x.toValue}</div>
                    {x.acting && <div className="hi-sub">Allowance KES {x.acting.amount.toLocaleString()} a month{x.acting.endPeriod ? ` · payroll ${fmtDate(x.acting.firstPeriod)} – ${fmtDate(x.acting.endPeriod)}` : ''}</div>}
                    {x.note && <div className="hi-sub">{x.note}</div>}
                  </td>
                  <td>
                    {x.approvedBy}
                    <div className="hi-sub">Recorded by {x.recordedBy}</div>
                  </td>
                  <td>
                    <Pill tone={STATUS[x.status][1]}>{x.kind === 'SUSPENSION' && x.status === 'ACTIVE' ? 'Suspended' : STATUS[x.status][0]}</Pill>
                  </td>
                  <td>
                    {x.status === 'ACTIVE' && (x.kind === 'ACTING' || x.kind === 'SUSPENSION') && (
                      <button className="btn btn-secondary btn-sm" onClick={() => setClosing(x)}>
                        {x.kind === 'ACTING' ? 'End acting' : 'Lift'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="events" />
      </Card>

      {creating && <NewEventModal onClose={() => setCreating(false)} />}
      {closing && <CloseEventModal ev={closing} onClose={() => setClosing(null)} />}
    </>
  );
};

/** Ends an acting appointment (and stops the allowance) or lifts a suspension. */
const CloseEventModal: React.FC<{ ev: EmployeeEvent; onClose: () => void }> = ({ ev, onClose }) => {
  const { endActing, liftSuspension, payItems, endRecurringPayItem, cancelPayItem, payrollOpenPeriod } = useApp();
  const [on, setOn] = useState(todayIso());
  const isActing = ev.kind === 'ACTING';
  const item = isActing ? payItems.find((i) => (i.id === ev.acting?.payItemId || i.reference === ev.id) && i.componentId === 'ACTING' && i.status === 'ACTIVE') : undefined;
  const save = () => {
    if (isActing) {
      if (!endActing(ev.id, on)) return;
      if (item) {
        // Paid months stay as paid; the allowance stops after the month acting ends
        const last = monthOf(on) < payrollOpenPeriod.key ? prevMonth(payrollOpenPeriod.key) : monthOf(on);
        if (last < item.period) cancelPayItem(item.id, `Acting ${ev.id} ended ${fmtDate(on)}`);
        else endRecurringPayItem(item.id, last);
      }
    } else if (!liftSuspension(ev.id, on)) return;
    onClose();
  };
  return (
    <Modal
      title={isActing ? 'End acting appointment' : 'Lift suspension'}
      subtitle={`${ev.staffName} · ${ev.id}`}
      width={520}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            {isActing ? 'End acting' : 'Lift suspension'}
          </button>
        </>
      }
    >
      <Field label={isActing ? 'Last day acting' : 'Lifted on'}>
        <input type="date" className="form-control" value={on} min={ev.from} onChange={(e) => setOn(e.target.value)} />
      </Field>
      {isActing ? (
        <div className="pr-note">
          {item
            ? `The acting allowance (${item.id}, KES ${item.amount.toLocaleString()}) stops after ${fmtDate(monthOf(on) < payrollOpenPeriod.key ? prevMonth(payrollOpenPeriod.key) : monthOf(on))}. A part month is paid in full; recover any excess with a deduction.`
            : 'No open acting allowance was found in payroll for this appointment.'}
        </div>
      ) : (
        <div className="pr-note">
          {ev.suspension?.pay === 'FULL'
            ? 'Pay continued in full, so payroll is unchanged.'
            : on <= ev.to!
              ? `Lifted early: pay is withheld only up to ${fmtDate(addDays(on, -1))}.`
              : 'Pay was withheld for the full suspension period.'}{' '}
          The employee can sign in again as soon as it is lifted.
        </div>
      )}
    </Modal>
  );
};

const NewEventModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { tenantEmployees, addEmployeeEvent, payrollOpenPeriod, orgStructure, activeTenant } = useApp();
  const approvers = useApprovers();
  const [kind, setKind] = useState<EventKind>('ACTING');
  const [staffId, setStaffId] = useState('');
  const [reason, setReason] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [date, setDate] = useState(todayIso());
  const [to, setTo] = useState(addDays(todayIso(), 30));
  // Acting
  const [designation, setDesignation] = useState('');
  const [mode, setMode] = useState<'pct' | 'amount'>('pct');
  const [pct, setPct] = useState(20);
  const [amount, setAmount] = useState(0);
  // Demotion / re-hire
  const [jobTitle, setJobTitle] = useState('');
  const [grade, setGrade] = useState('');
  const [basic, setBasic] = useState(0);
  const [contractType, setContractType] = useState(CONTRACT_TYPES[0].name);
  const [contractEnd, setContractEnd] = useState('');
  const [department, setDepartment] = useState('');
  // Reassignment
  const [duties, setDuties] = useState('');
  const [stationId, setStationId] = useState('');
  const [supervisor, setSupervisor] = useState('');
  // Suspension
  const [pay, setPay] = useState<SuspensionPay>('HALF');

  const people = kind === 'REHIRE' ? tenantEmployees.filter((e) => e.status === 'TERMINATED' || (e.exitDate && e.exitDate < todayIso())) : tenantEmployees.filter((e) => e.status !== 'TERMINATED');
  const e = tenantEmployees.find((x) => x.staffId === staffId);
  const pick = (id: string) => {
    setStaffId(id);
    const x = tenantEmployees.find((p) => p.staffId === id);
    if (!x) return;
    setJobTitle(x.jobTitle);
    setGrade(x.grade ?? '');
    setBasic(x.basicSalaryKes);
    setDepartment(x.department);
  };
  const actingAmount = mode === 'pct' ? Math.round(((e?.basicSalaryKes ?? 0) * pct) / 100) : amount;
  const stations = orgStructure.stations.filter((s) => orgStructure.branches.find((b) => b.id === s.branchId)?.name === (e?.branch ?? activeTenant.name) || !e);
  const departments = orgStructure.departments.map((x) => x.name);

  const save = () => {
    const base = { staffId, reason, approvedBy };
    let n: NewEmployeeEvent;
    if (kind === 'ACTING') n = { ...base, kind, from: date, to, designation, amount: actingAmount, pct: mode === 'pct' ? pct : undefined };
    else if (kind === 'DEMOTION') n = { ...base, kind, effectiveDate: date, jobTitle, grade, basic };
    else if (kind === 'REASSIGNMENT') n = { ...base, kind, effectiveDate: date, duties, stationId: stationId || undefined, department: department || undefined, supervisorStaffId: supervisor || undefined };
    else if (kind === 'SUSPENSION') n = { ...base, kind, from: date, to, pay };
    else n = { ...base, kind: 'REHIRE', effectiveDate: date, jobTitle, department, contractType, contractEndDate: contractEnd || undefined, basic };
    if (addEmployeeEvent(n)) onClose();
  };

  const periodNote =
    kind === 'ACTING' && to && monthOf(to) < payrollOpenPeriod.key
      ? `This period is already paid, so no allowance will be posted — pay it as arrears in ${payrollOpenPeriod.label}.`
      : kind === 'ACTING'
        ? `Posts an acting allowance of KES ${actingAmount.toLocaleString()} a month to payroll from ${fmtDate(monthOf(date) < payrollOpenPeriod.key ? payrollOpenPeriod.key : monthOf(date))} to ${fmtDate(monthOf(to))}.`
        : null;

  return (
    <Modal
      title="New employee event"
      subtitle="Applied to the employee record straight away and written to their history and the audit trail."
      width={720}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Record {EVENT_LABEL[kind].toLowerCase()}
          </button>
        </>
      }
    >
      <div className="digicraft-filter-pills">
        {NEW_KINDS.map((k) => (
          <button
            key={k}
            className={`digicraft-filter-pill ${kind === k ? 'active' : ''}`}
            onClick={() => {
              setKind(k);
              setStaffId('');
            }}
          >
            {EVENT_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="pr-form-grid">
        <Field label="Employee" wide hint={kind === 'REHIRE' ? 'Former employees of this company' : undefined}>
          <PersonSelect value={staffId} onChange={pick} people={people} placeholder={kind === 'REHIRE' ? 'Choose a former employee' : 'Choose an employee'} />
        </Field>
        {e && (
          <div className="pr-note wide">
            Now: {e.jobTitle} · {e.department} · {e.grade ?? 'no grade on file'} · {e.basicSalaryKes ? `KES ${e.basicSalaryKes.toLocaleString()}` : `KES ${e.payRateKes ?? 0}/day`} · {e.status === 'TERMINATED' ? `left ${fmtDate(e.exitDate)}` : e.status.toLowerCase().replace('_', ' ')}
          </div>
        )}

        {kind === 'ACTING' && (
          <>
            <Field label="Acting as" wide>
              <input className="form-control" value={designation} onChange={(x) => setDesignation(x.target.value)} placeholder="e.g. Factory Manager" />
            </Field>
            <Field label="From">
              <input type="date" className="form-control" value={date} onChange={(x) => setDate(x.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" className="form-control" value={to} min={date} onChange={(x) => setTo(x.target.value)} />
            </Field>
            <Field label="Allowance">
              <select className="form-control" value={mode} onChange={(x) => setMode(x.target.value as 'pct' | 'amount')}>
                <option value="pct">Percentage of basic</option>
                <option value="amount">Fixed amount</option>
              </select>
            </Field>
            {mode === 'pct' ? (
              <Field label="Percentage of basic" hint={e ? `KES ${actingAmount.toLocaleString()} a month` : undefined}>
                <input type="number" className="form-control" min={1} max={100} value={pct} onChange={(x) => setPct(Number(x.target.value))} />
              </Field>
            ) : (
              <Field label="Amount a month (KES)">
                <input type="number" className="form-control" min={0} value={amount || ''} onChange={(x) => setAmount(Number(x.target.value))} />
              </Field>
            )}
          </>
        )}

        {kind === 'DEMOTION' && (
          <>
            <Field label="New job title">
              <input className="form-control" value={jobTitle} onChange={(x) => setJobTitle(x.target.value)} />
            </Field>
            <Field label="New grade">
              <select className="form-control" value={grade} onChange={(x) => setGrade(x.target.value)}>
                <option value="">Keep current</option>
                {GRADE_BANDS.map((g) => (
                  <option key={g.grade} value={g.grade}>
                    {g.grade}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="New basic (KES)" hint={e && basic !== e.basicSalaryKes ? `Payroll uses it from ${fmtDate(monthOf(date) < payrollOpenPeriod.key ? payrollOpenPeriod.key : monthOf(date))}` : 'Same basic — title and grade only'}>
              <input type="number" className="form-control" min={0} value={basic || ''} onChange={(x) => setBasic(Number(x.target.value))} />
            </Field>
            <Field label="Effective date">
              <input type="date" className="form-control" value={date} onChange={(x) => setDate(x.target.value)} />
            </Field>
          </>
        )}

        {kind === 'REASSIGNMENT' && (
          <>
            <Field label="New duties" wide>
              <input className="form-control" value={duties} onChange={(x) => setDuties(x.target.value)} placeholder="e.g. Site C stores and fuel issue" />
            </Field>
            <Field label="Station">
              <select className="form-control" value={stationId} onChange={(x) => setStationId(x.target.value)}>
                <option value="">No change</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Department">
              <select className="form-control" value={department} onChange={(x) => setDepartment(x.target.value)}>
                {departments.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Reports to">
              <PersonSelect value={supervisor} onChange={setSupervisor} people={tenantEmployees.filter((p) => p.staffId !== staffId && p.status !== 'TERMINATED' && p.basicSalaryKes >= 60_000)} placeholder="No change" />
            </Field>
            <Field label="Effective date">
              <input type="date" className="form-control" value={date} onChange={(x) => setDate(x.target.value)} />
            </Field>
          </>
        )}

        {kind === 'SUSPENSION' && (
          <>
            <Field label="From">
              <input type="date" className="form-control" value={date} max={todayIso()} onChange={(x) => setDate(x.target.value)} />
            </Field>
            <Field label="To">
              <input type="date" className="form-control" value={to} min={date} onChange={(x) => setTo(x.target.value)} />
            </Field>
            <div className="req-field wide">
              <span>Pay during suspension</span>
              <div className="digicraft-filter-pills">
                {(Object.keys(SUSPENSION_PAY_LABEL) as SuspensionPay[]).map((p) => (
                  <button key={p} className={`digicraft-filter-pill ${pay === p ? 'active' : ''}`} onClick={() => setPay(p)} type="button">
                    {SUSPENSION_PAY_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>
            <div className="pr-note warn wide">
              <ShieldOff size={13} /> System access: blocked. {e?.fullName ?? 'The employee'} cannot sign in to the workspace or portal until the suspension is lifted.
              {pay !== 'FULL' && ` ${pay === 'HALF' ? 'Half' : 'All'} of the daily pay is withheld from ${fmtDate(date < `${payrollOpenPeriod.key}-01` ? `${payrollOpenPeriod.key}-01` : date)} to ${fmtDate(to)}.`}
            </div>
          </>
        )}

        {kind === 'REHIRE' && (
          <>
            <Field label="Start date">
              <input type="date" className="form-control" value={date} onChange={(x) => setDate(x.target.value)} />
            </Field>
            <Field label="Job title">
              <input className="form-control" value={jobTitle} onChange={(x) => setJobTitle(x.target.value)} />
            </Field>
            <Field label="Department">
              <select className="form-control" value={department} onChange={(x) => setDepartment(x.target.value)}>
                {departments.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Contract">
              <select className="form-control" value={contractType} onChange={(x) => setContractType(x.target.value)}>
                {CONTRACT_TYPES.map((c) => (
                  <option key={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Contract end" hint="Fixed-term contracts only">
              <input type="date" className="form-control" value={contractEnd} min={date} onChange={(x) => setContractEnd(x.target.value)} />
            </Field>
            <Field label="Basic (KES)">
              <input type="number" className="form-control" min={0} value={basic || ''} onChange={(x) => setBasic(Number(x.target.value))} />
            </Field>
          </>
        )}

        <Field label="Reason" wide>
          <textarea className="form-control" rows={2} value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Board minute, case number or the reason in plain words" />
        </Field>
        <Field label="Approved by" wide>
          <PersonSelect value={approvedBy ? approvers.find((a) => a.fullName === approvedBy)?.staffId ?? '' : ''} onChange={(id) => setApprovedBy(approvers.find((a) => a.staffId === id)?.fullName ?? '')} people={approvers} placeholder="Choose the approver" />
        </Field>
        {periodNote && <div className="pr-note wide">{periodNote}</div>}
      </div>
    </Modal>
  );
};
