import { useEffect, useRef, useState } from 'react';
import type { HREmployee } from '../types';
import type { PeopleDeps } from './sliceDeps';
import { addDays, fmtDate, todayIso } from '../data/hireEngine';
import { CONTRACT_TYPES } from '../data/hrMockData';
import {
  buildEventSeed,
  buildOutsourcedSeed,
  buildQualificationSeed,
  EVENT_LABEL,
  monthOf,
  SUSPENSION_PAY_LABEL,
  type EmployeeEvent,
  type OutsourcedContract,
  type OutsourcedMonth,
  type Qualification,
  type SuspensionPay
} from '../data/peopleSeed';

const HR = 'Rose Chepkoech';

type Base = { staffId: string; reason: string; approvedBy: string; by?: string };
export type NewEmployeeEvent = Base &
  (
    | { kind: 'ACTING'; from: string; to: string; designation: string; amount: number; pct?: number }
    | { kind: 'DEMOTION'; effectiveDate: string; jobTitle: string; grade: string; basic: number }
    | { kind: 'REASSIGNMENT'; effectiveDate: string; duties: string; stationId?: string; department?: string; supervisorStaffId?: string }
    | { kind: 'SUSPENSION'; from: string; to: string; pay: SuspensionPay }
    | { kind: 'REHIRE'; effectiveDate: string; jobTitle: string; department: string; contractType: string; contractEndDate?: string; basic: number }
  );

export type QualificationDraft = Omit<Qualification, 'id' | 'orgId' | 'addedBy' | 'addedOn'>;
export type OutsourcedDraft = Omit<OutsourcedContract, 'id' | 'orgId' | 'months' | 'renewals' | 'status'>;

/** Employee events, qualifications and outsourced labour (Employee Master tabs). */
export interface PeopleStateSlice {
  employeeEvents: EmployeeEvent[];
  /** Records a hire-to-retire event and applies it to the employee record, payroll and sign-in. */
  addEmployeeEvent: (n: NewEmployeeEvent) => EmployeeEvent | null;
  /** Ends an acting appointment before its planned end date (the view stops the allowance). */
  endActing: (id: string, on: string, by?: string) => boolean;
  /** Restores the employee to active and trims any pay withheld to the days actually served. */
  liftSuspension: (id: string, on: string, by?: string) => boolean;
  issueEmployeeNotice: (kind: 'RETIREMENT_NOTICE' | 'CONTRACT_NOTICE', staffId: string, noticeFor: string, by?: string) => EmployeeEvent | null;
  qualifications: Qualification[];
  saveQualification: (draft: QualificationDraft, id?: string) => Qualification | null;
  removeQualification: (id: string) => void;
  outsourcedContracts: OutsourcedContract[];
  saveOutsourcedContract: (draft: OutsourcedDraft, id?: string) => OutsourcedContract | null;
  recordOutsourcedMonth: (contractId: string, m: Omit<OutsourcedMonth, 'recordedBy' | 'recordedOn'>, by?: string) => boolean;
  renewOutsourcedContract: (contractId: string, newEnd: string, rateKes: number, by?: string) => boolean;
}

export const usePeopleState = (d: PeopleDeps): PeopleStateSlice => {
  const { hrEmployees, selectedOrgId, payrollOpenPeriod, postPayItems, addPayReduction, removePayReduction, updateHrEmployee, logEmployeeEdit, addToast } = d;
  const [employeeEvents, setEvents] = useState<EmployeeEvent[]>(buildEventSeed);
  const [qualifications, setQualifications] = useState<Qualification[]>(buildQualificationSeed);
  const [outsourcedContracts, setContracts] = useState<OutsourcedContract[]>(buildOutsourcedSeed);

  const fail = (title: string, message: string) => {
    addToast({ type: 'error', title, message });
    return null;
  };
  const find = (staffId: string) => hrEmployees.find((e) => e.staffId === staffId);
  const nextId = () => `EVT-${new Date().getFullYear()}-${String(employeeEvents.length + 1).padStart(3, '0')}`;
  const historyWith = (e: HREmployee, entry: NonNullable<HREmployee['history']>[number]) => [...(e.history ?? []), entry];

  // Seeded events already happened: put them on the employee files, and apply the open suspension
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const patches = new Map<string, Partial<HREmployee>>();
    for (const ev of buildEventSeed()) {
      const e = hrEmployees.find((x) => x.staffId === ev.staffId);
      if (!e || e.history?.some((h) => h.ref === ev.id)) continue;
      const patch = patches.get(ev.staffId) ?? { history: [...(e.history ?? [])] };
      patch.history!.push({ date: ev.effectiveDate, kind: EVENT_LABEL[ev.kind], summary: `${ev.fromValue} → ${ev.toValue}`, ref: ev.id, by: ev.approvedBy });
      if (ev.kind === 'SUSPENSION' && ev.status === 'ACTIVE' && ev.suspension) {
        patch.status = 'SUSPENDED';
        if (ev.suspension.pay !== 'FULL') {
          const start = `${payrollOpenPeriod.key}-01`;
          const r = addPayReduction({ staffId: ev.staffId, from: ev.from! < start ? start : ev.from!, to: ev.to!, factor: ev.suspension.pay === 'NONE' ? 1 : 0.5, reason: `Suspension ${SUSPENSION_PAY_LABEL[ev.suspension.pay].toLowerCase()} — ${ev.id}`, source: 'Disciplinary', ref: ev.id });
          setEvents((prev) => prev.map((x) => (x.id === ev.id ? { ...x, suspension: { ...x.suspension!, reductionId: r.id } } : x)));
        }
      }
      patches.set(ev.staffId, patch);
    }
    patches.forEach((patch, staffId) => updateHrEmployee(staffId, { ...patch, history: patch.history!.sort((a, b) => a.date.localeCompare(b.date)) }));
    // Runs once with the starting workforce
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addEmployeeEvent: PeopleStateSlice['addEmployeeEvent'] = (n) => {
    const e = find(n.staffId);
    const by = n.by ?? HR;
    if (!e) return fail('Choose the employee', 'Pick who the event is for.');
    if (!n.reason.trim()) return fail('Reason needed', 'Say why, so the file explains the change.');
    if (!n.approvedBy) return fail('Approver needed', 'Pick who approved this.');
    if (n.approvedBy === e.fullName) return fail('Segregation of duties', 'Employees cannot approve events on their own record.');
    const today = todayIso();
    const id = nextId();
    const base = { id, orgId: e.orgId, staffId: e.staffId, staffName: e.fullName, reason: n.reason.trim(), approvedBy: n.approvedBy, recordedBy: by, recordedOn: today };
    let ev: EmployeeEvent;
    let patch: Partial<HREmployee> = {};
    const audit: { action: string; sensitive?: boolean }[] = [];
    let message = '';

    if (n.kind === 'ACTING') {
      if (!n.designation.trim()) return fail('Designation needed', 'Say which post the employee is acting in.');
      if (!n.from || !n.to || n.to < n.from) return fail('Check the dates', 'The acting period must end on or after it starts.');
      if (!(n.amount > 0)) return fail('Allowance needed', 'Enter the acting allowance a month.');
      if (employeeEvents.some((x) => x.staffId === e.staffId && x.kind === 'ACTING' && x.status === 'ACTIVE')) return fail('Already acting', `${e.fullName} already has an open acting appointment. End it first.`);
      const endPeriod = monthOf(n.to);
      const firstPeriod = monthOf(n.from) < payrollOpenPeriod.key ? payrollOpenPeriod.key : monthOf(n.from);
      const pays = endPeriod >= payrollOpenPeriod.key;
      if (pays)
        postPayItems(
          [{ staffId: e.staffId, componentId: 'ACTING', amount: Math.round(n.amount), period: firstPeriod, recurring: endPeriod > firstPeriod, endPeriod: endPeriod > firstPeriod ? endPeriod : undefined, reference: id, note: `Acting ${n.designation.trim()} ${fmtDate(n.from)} – ${fmtDate(n.to)}`, source: 'Manual' }],
          by
        );
      ev = {
        ...base,
        kind: 'ACTING',
        effectiveDate: n.from,
        from: n.from,
        to: n.to,
        fromValue: e.jobTitle,
        toValue: `Acting ${n.designation.trim()}`,
        status: n.to < today ? 'COMPLETED' : 'ACTIVE',
        acting: { designation: n.designation.trim(), amount: Math.round(n.amount), pct: n.pct, firstPeriod: pays ? firstPeriod : undefined, endPeriod: pays ? endPeriod : undefined },
        note: pays ? undefined : 'Period already paid — pay any acting allowance owed as arrears.'
      };
      audit.push({ action: `Acting appointment ${id}: acting ${n.designation.trim()} ${fmtDate(n.from)} – ${fmtDate(n.to)}, allowance KES ${Math.round(n.amount).toLocaleString()} a month`, sensitive: true });
      message = pays ? `Acting allowance of KES ${Math.round(n.amount).toLocaleString()} a month posted from ${firstPeriod} to ${endPeriod}.` : 'Recorded. The period is already paid, so no allowance was posted.';
    } else if (n.kind === 'DEMOTION') {
      if (!n.jobTitle.trim()) return fail('New title needed', 'Enter the post the employee moves to.');
      if (n.basic > e.basicSalaryKes) return fail('Not a demotion', 'The new basic is higher than the current one. Use a promotion in Changes & audit.');
      if (!(n.basic > 0) && e.basicSalaryKes > 0) return fail('Basic needed', 'Enter the new basic salary.');
      const from = monthOf(n.effectiveDate) < payrollOpenPeriod.key ? payrollOpenPeriod.key : monthOf(n.effectiveDate);
      patch = { jobTitle: n.jobTitle.trim(), grade: n.grade || e.grade };
      if (n.basic !== e.basicSalaryKes) {
        patch.basicSalaryKes = n.basic;
        patch.salaryHistory = [...(e.salaryHistory ?? []), { effectiveFrom: from, basic: n.basic, previous: e.basicSalaryKes, reason: `Demotion: ${n.reason.trim()}`, ref: id, by: n.approvedBy }];
      }
      ev = {
        ...base,
        kind: 'DEMOTION',
        effectiveDate: n.effectiveDate,
        fromValue: `${e.jobTitle} · ${e.grade ?? '—'} · KES ${e.basicSalaryKes.toLocaleString()}`,
        toValue: `${n.jobTitle.trim()} · ${n.grade || e.grade || '—'} · KES ${n.basic.toLocaleString()}`,
        status: 'COMPLETED'
      };
      audit.push({ action: `Demotion ${id}: ${ev.fromValue} → ${ev.toValue}`, sensitive: true });
      message = n.basic !== e.basicSalaryKes ? `New basic KES ${n.basic.toLocaleString()} from ${from}; paid months keep the old salary.` : 'Title and grade updated; pay unchanged.';
    } else if (n.kind === 'REASSIGNMENT') {
      if (!n.duties.trim()) return fail('Duties needed', 'Describe the new duties.');
      const sup = n.supervisorStaffId ? find(n.supervisorStaffId) : undefined;
      const oldSup = e.reportsToStaffId ? find(e.reportsToStaffId) : undefined;
      if (n.stationId) patch.stationId = n.stationId;
      if (sup) patch.reportsToStaffId = sup.staffId;
      if (n.department && n.department !== e.department) {
        const from = monthOf(n.effectiveDate) < payrollOpenPeriod.key ? payrollOpenPeriod.key : monthOf(n.effectiveDate);
        patch.department = n.department;
        patch.departmentHistory = [...(e.departmentHistory ?? []), { effectiveFrom: from, department: n.department, previous: e.department, ref: id }];
      }
      ev = {
        ...base,
        kind: 'REASSIGNMENT',
        effectiveDate: n.effectiveDate,
        fromValue: `${n.department && n.department !== e.department ? `${e.department} · ` : ''}${oldSup ? `reports to ${oldSup.fullName}` : e.jobTitle}`,
        toValue: `${n.duties.trim()}${n.department && n.department !== e.department ? ` · ${n.department}` : ''}${sup ? ` · reports to ${sup.fullName}` : ''}`,
        status: 'COMPLETED'
      };
      audit.push({ action: `Duty reassignment ${id}: ${ev.toValue}` });
      message = 'Duties updated. Pay is unchanged.';
    } else if (n.kind === 'SUSPENSION') {
      if (e.status === 'SUSPENDED') return fail('Already suspended', `${e.fullName} is already suspended.`);
      if (e.status === 'TERMINATED') return fail('Not employed', `${e.fullName} has left.`);
      if (!n.from || !n.to || n.to < n.from) return fail('Check the dates', 'The suspension must end on or after it starts.');
      if (n.from > today) return fail('Starts today at the latest', 'Record the suspension on the day it takes effect.');
      if (n.pay !== 'FULL' && n.to < `${payrollOpenPeriod.key}-01`) return fail('Payroll period closed', `Those days were paid. Recover any overpayment through a deduction in ${payrollOpenPeriod.label}.`);
      let reductionId: string | undefined;
      if (n.pay !== 'FULL') {
        const from = n.from < `${payrollOpenPeriod.key}-01` ? `${payrollOpenPeriod.key}-01` : n.from;
        reductionId = addPayReduction({ staffId: e.staffId, from, to: n.to, factor: n.pay === 'NONE' ? 1 : 0.5, reason: `Suspension ${SUSPENSION_PAY_LABEL[n.pay].toLowerCase()} — ${id}`, source: 'Disciplinary', ref: id }).id;
      }
      patch = { status: 'SUSPENDED' };
      ev = {
        ...base,
        kind: 'SUSPENSION',
        effectiveDate: n.from,
        from: n.from,
        to: n.to,
        fromValue: e.status === 'ON_LEAVE' ? 'On leave' : 'Active',
        toValue: `Suspended ${SUSPENSION_PAY_LABEL[n.pay].toLowerCase()}`,
        status: 'ACTIVE',
        suspension: { pay: n.pay, reductionId }
      };
      audit.push({ action: `Suspension ${id}: ${fmtDate(n.from)} – ${fmtDate(n.to)}, ${SUSPENSION_PAY_LABEL[n.pay].toLowerCase()}; system access blocked`, sensitive: true });
      message = `System access blocked. ${n.pay === 'FULL' ? 'Pay continues in full.' : `${n.pay === 'HALF' ? 'Half' : 'All'} of the daily pay is withheld for those days.`}`;
    } else {
      if (e.status !== 'TERMINATED' && !(e.exitDate && e.exitDate < today)) return fail('Still employed', `${e.fullName} has not left, so there is nothing to re-hire.`);
      if (!n.jobTitle.trim()) return fail('Job title needed', 'Enter the post the employee is re-hired into.');
      if (n.contractType === CONTRACT_TYPES.find((c) => c.id === 'ct-fixed')?.name && !n.contractEndDate) return fail('End date needed', `${n.contractType} needs an end date.`);
      const from = monthOf(n.effectiveDate) < payrollOpenPeriod.key ? payrollOpenPeriod.key : monthOf(n.effectiveDate);
      patch = {
        status: 'ACTIVE',
        exitDate: undefined,
        retirementDate: undefined,
        joinedDate: n.effectiveDate,
        contractType: n.contractType,
        contractStartDate: n.effectiveDate,
        contractEndDate: n.contractEndDate || undefined,
        jobTitle: n.jobTitle.trim(),
        department: n.department || e.department,
        probationStatus: undefined,
        probationEndDate: undefined
      };
      if (n.basic !== e.basicSalaryKes) {
        patch.basicSalaryKes = n.basic;
        patch.salaryHistory = [...(e.salaryHistory ?? []), { effectiveFrom: from, basic: n.basic, previous: e.basicSalaryKes, reason: `Re-hire: ${n.reason.trim()}`, ref: id, by: n.approvedBy }];
      }
      ev = {
        ...base,
        kind: 'REHIRE',
        effectiveDate: n.effectiveDate,
        fromValue: `Left ${fmtDate(e.exitDate)} — ${e.jobTitle} (first joined ${fmtDate(e.joinedDate)})`,
        toValue: `Re-hired as ${n.jobTitle.trim()}, ${n.contractType}${n.contractEndDate ? ` to ${fmtDate(n.contractEndDate)}` : ''}`,
        status: 'COMPLETED'
      };
      audit.push({ action: `Re-hire ${id}: ${ev.toValue}, KES ${n.basic.toLocaleString()}; earlier service kept on file`, sensitive: true });
      message = 'Record reopened with the earlier history kept. The work email signs in again.';
    }

    patch.history = historyWith(e, { date: ev.effectiveDate, kind: EVENT_LABEL[ev.kind], summary: `${ev.fromValue} → ${ev.toValue}`, ref: id, by: n.approvedBy });
    updateHrEmployee(e.staffId, patch);
    logEmployeeEdit(e.staffId, audit, by);
    setEvents((prev) => [ev, ...prev]);
    addToast({ type: 'success', title: `${EVENT_LABEL[ev.kind]} recorded`, message: `${e.fullName}: ${message}` });
    return ev;
  };

  const endActing: PeopleStateSlice['endActing'] = (id, on, by = HR) => {
    const ev = employeeEvents.find((x) => x.id === id);
    if (!ev || ev.kind !== 'ACTING' || ev.status !== 'ACTIVE') return false;
    if (on < ev.from!) return !!fail('Check the date', 'Acting cannot end before it started.');
    const e = find(ev.staffId);
    const note = `Ended early on ${fmtDate(on)} (planned to ${fmtDate(ev.to)}).`;
    setEvents((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'ENDED_EARLY', to: on, note } : x)));
    if (e) updateHrEmployee(e.staffId, { history: historyWith(e, { date: on, kind: 'Acting ended', summary: `Acting ${ev.acting?.designation ?? ''} ended early`, ref: id, by }) });
    logEmployeeEdit(ev.staffId, [{ action: `Acting appointment ${id} ended ${fmtDate(on)}`, sensitive: true }], by);
    addToast({ type: 'info', title: 'Acting appointment ended', message: `${ev.staffName}: ${note}` });
    return true;
  };

  const liftSuspension: PeopleStateSlice['liftSuspension'] = (id, on, by = HR) => {
    const ev = employeeEvents.find((x) => x.id === id);
    if (!ev || ev.kind !== 'SUSPENSION' || ev.status !== 'ACTIVE' || !ev.suspension) return false;
    if (on < ev.from!) return !!fail('Check the date', 'The suspension cannot be lifted before it started.');
    const e = find(ev.staffId);
    let reductionId = ev.suspension.reductionId;
    const early = on <= ev.to!;
    // Withhold pay only for the days actually served
    if (early && reductionId) {
      removePayReduction(reductionId);
      reductionId = undefined;
      const last = addDays(on, -1);
      const from = ev.from! < `${payrollOpenPeriod.key}-01` ? `${payrollOpenPeriod.key}-01` : ev.from!;
      if (last >= from)
        reductionId = addPayReduction({ staffId: ev.staffId, from, to: last, factor: ev.suspension.pay === 'NONE' ? 1 : 0.5, reason: `Suspension ${SUSPENSION_PAY_LABEL[ev.suspension.pay].toLowerCase()} — ${id} (lifted ${fmtDate(on)})`, source: 'Disciplinary', ref: id }).id;
    }
    const note = early ? `Lifted early on ${fmtDate(on)} (was to ${fmtDate(ev.to)}).` : `Lifted on ${fmtDate(on)}.`;
    setEvents((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'LIFTED', note, suspension: { ...x.suspension!, reductionId, liftedOn: on, liftedBy: by } } : x)));
    if (e) updateHrEmployee(e.staffId, { status: 'ACTIVE', history: historyWith(e, { date: on, kind: 'Suspension lifted', summary: note, ref: id, by }) });
    logEmployeeEdit(ev.staffId, [{ action: `Suspension ${id} lifted ${fmtDate(on)}; system access restored`, sensitive: true }], by);
    addToast({ type: 'success', title: 'Suspension lifted', message: `${ev.staffName} is active again and can sign in.${early && ev.suspension.pay !== 'FULL' ? ' Pay is withheld only for the days served.' : ''}` });
    return true;
  };

  const issueEmployeeNotice: PeopleStateSlice['issueEmployeeNotice'] = (kind, staffId, noticeFor, by = HR) => {
    const e = find(staffId);
    if (!e) return null;
    if (employeeEvents.some((x) => x.kind === kind && x.staffId === staffId && x.noticeFor === noticeFor)) return fail('Already issued', `A notice for ${fmtDate(noticeFor)} is already on file.`);
    const today = todayIso();
    const ev: EmployeeEvent = {
      id: nextId(),
      orgId: e.orgId,
      staffId,
      staffName: e.fullName,
      kind,
      effectiveDate: today,
      fromValue: kind === 'RETIREMENT_NOTICE' ? e.jobTitle : e.contractType,
      toValue: kind === 'RETIREMENT_NOTICE' ? `Retires ${fmtDate(noticeFor)}` : `Contract ends ${fmtDate(noticeFor)}`,
      reason: kind === 'RETIREMENT_NOTICE' ? `Reaches retirement age (${e.retirementAge ?? 60})` : 'Fixed-term contract coming to an end — renew, convert or separate',
      approvedBy: by,
      recordedBy: by,
      recordedOn: today,
      status: 'ISSUED',
      noticeFor
    };
    updateHrEmployee(staffId, { history: historyWith(e, { date: today, kind: EVENT_LABEL[kind], summary: ev.toValue, ref: ev.id, by }) });
    logEmployeeEdit(staffId, [{ action: `${EVENT_LABEL[kind]} ${ev.id} issued: ${ev.toValue}` }], by);
    setEvents((prev) => [ev, ...prev]);
    addToast({ type: 'success', title: 'Notice issued', message: `${e.fullName}: ${ev.toValue}. Sent to the personal email on file.` });
    return ev;
  };

  const saveQualification: PeopleStateSlice['saveQualification'] = (draft, id) => {
    const e = find(draft.staffId);
    if (!e) return fail('Choose the employee', 'Pick whose qualification this is.');
    if (!draft.title.trim()) return fail('Title needed', 'Enter the qualification, certificate or skill.');
    if (draft.kind !== 'Skill' && !draft.institution.trim()) return fail('Institution needed', 'Enter the institution or professional body.');
    const today = todayIso();
    const prev = id ? qualifications.find((x) => x.id === id) : undefined;
    const rec: Qualification = {
      ...draft,
      title: draft.title.trim(),
      institution: draft.institution.trim(),
      membershipNo: draft.membershipNo?.trim() || undefined,
      validUntil: draft.validUntil || undefined,
      id: prev?.id ?? `QL-${String(qualifications.length + 101).padStart(4, '0')}`,
      orgId: e.orgId,
      addedBy: prev?.addedBy ?? HR,
      addedOn: prev?.addedOn ?? today
    };
    setQualifications((list) => (prev ? list.map((x) => (x.id === prev.id ? rec : x)) : [rec, ...list]));
    logEmployeeEdit(e.staffId, [{ action: `${prev ? 'Updated' : 'Added'} ${rec.kind.toLowerCase()} qualification: ${rec.title}${rec.validUntil ? ` (valid to ${fmtDate(rec.validUntil)})` : ''}` }]);
    addToast({ type: 'success', title: prev ? 'Qualification updated' : 'Qualification added', message: `${e.fullName}: ${rec.title}.` });
    return rec;
  };

  const removeQualification = (id: string) => {
    const rec = qualifications.find((x) => x.id === id);
    if (!rec) return;
    setQualifications((list) => list.filter((x) => x.id !== id));
    logEmployeeEdit(rec.staffId, [{ action: `Removed qualification: ${rec.title}` }]);
    addToast({ type: 'info', title: 'Qualification removed', message: rec.title });
  };

  const saveOutsourcedContract: PeopleStateSlice['saveOutsourcedContract'] = (draft, id) => {
    if (!draft.contractor.trim()) return fail('Contractor needed', 'Enter the contractor’s registered name.');
    if (!draft.start || !draft.end || draft.end <= draft.start) return fail('Check the dates', 'The contract must end after it starts.');
    if (!(draft.rateKes > 0)) return fail('Rate needed', 'Enter the agreed rate.');
    const prev = id ? outsourcedContracts.find((c) => c.id === id) : undefined;
    const rec: OutsourcedContract = prev
      ? { ...prev, ...draft, contractor: draft.contractor.trim() }
      : { ...draft, contractor: draft.contractor.trim(), id: `OSC-${String(outsourcedContracts.length + 1).padStart(3, '0')}`, orgId: selectedOrgId, months: [], renewals: [], status: 'ACTIVE' };
    setContracts((list) => (prev ? list.map((c) => (c.id === prev.id ? rec : c)) : [rec, ...list]));
    addToast({ type: 'success', title: prev ? 'Contract updated' : 'Contract added', message: `${rec.contractor} — ${rec.service}, to ${fmtDate(rec.end)}.` });
    return rec;
  };

  const recordOutsourcedMonth: PeopleStateSlice['recordOutsourcedMonth'] = (contractId, m, by = HR) => {
    const c = outsourcedContracts.find((x) => x.id === contractId);
    if (!c) return false;
    if (!m.month) return !!fail('Month needed', 'Pick the month.');
    if (!(m.numbers >= 0) || !(m.invoiceKes >= 0)) return !!fail('Check the numbers', 'Numbers and invoice amount cannot be negative.');
    const entry: OutsourcedMonth = { ...m, recordedBy: by, recordedOn: todayIso() };
    setContracts((list) => list.map((x) => (x.id === contractId ? { ...x, months: [...x.months.filter((k) => k.month !== m.month), entry].sort((a, b) => a.month.localeCompare(b.month)) } : x)));
    addToast({ type: 'success', title: 'Month recorded', message: `${c.contractor}, ${fmtDate(m.month)}: ${m.numbers} engaged, KES ${m.invoiceKes.toLocaleString()} invoiced.` });
    return true;
  };

  const renewOutsourcedContract: PeopleStateSlice['renewOutsourcedContract'] = (contractId, newEnd, rateKes, by = HR) => {
    const c = outsourcedContracts.find((x) => x.id === contractId);
    if (!c) return false;
    if (!newEnd || newEnd <= c.end) return !!fail('Check the date', `The new end date must be after ${fmtDate(c.end)}.`);
    if (!(rateKes > 0)) return !!fail('Rate needed', 'Enter the renewed rate.');
    setContracts((list) => list.map((x) => (x.id === contractId ? { ...x, end: newEnd, rateKes, status: 'ACTIVE', renewals: [...x.renewals, { on: todayIso(), previousEnd: x.end, newEnd, rateKes, by }] } : x)));
    addToast({ type: 'success', title: 'Contract renewed', message: `${c.contractor} to ${fmtDate(newEnd)} at KES ${rateKes.toLocaleString()}.` });
    return true;
  };

  return {
    employeeEvents,
    addEmployeeEvent,
    endActing,
    liftSuspension,
    issueEmployeeNotice,
    qualifications,
    saveQualification,
    removeQualification,
    outsourcedContracts,
    saveOutsourcedContract,
    recordOutsourcedMonth,
    renewOutsourcedContract
  };
};
