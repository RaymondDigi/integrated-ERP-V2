import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { HREmployee, LeaveRequest } from '../types';
import {
  AL_CLOSING_2025,
  HOLIDAY_ATTENDANCE,
  INITIAL_ELIGIBILITY_OVERRIDES,
  INITIAL_ENTITLEMENT_MATRIX,
  INITIAL_LEAVE_ADJUSTMENTS,
  INITIAL_LEAVE_TYPE_VERSIONS,
  INITIAL_POLICY_VERSIONS,
  INITIAL_TENURE_BANDS,
  PUBLIC_HOLIDAYS_KE,
  hrApproverFor,
  supervisorFor,
  type EligibilityOverride,
  type EntitlementMatrix,
  type LeaveAdjustment,
  type LeavePolicy,
  type LeaveTypeVersion,
  type PolicySignOff,
  type PolicyVersion,
  type PublicHoliday,
  type EntitlementRow,
  type TenureBand
} from '../data/leaveConfig';
import {
  codeOf,
  typeAt,
  currentStepOf,
  jobStatus,
  todayIso,
  validateHoliday,
  validateLeaveRequest,
  validateLeaveTypeDraft,
  workflowFor,
  type JobStatus,
  type LeaveEngineConfig
} from '../data/leaveEngine';

type Toast = { type: 'success' | 'warning' | 'error' | 'info'; title: string; message: string };

export type NewLeaveRequest = Omit<LeaveRequest, 'id' | 'orgId' | 'status' | 'leaveAllowanceTriggered'>;

export interface LeaveJobRun {
  id: JobStatus['id'];
  at: string;
  summary: string;
}

/** Leave state and actions exposed through the app context. */
export interface LeaveStateSlice {
  leaveCfg: LeaveEngineConfig;
  leaveTypeVersions: LeaveTypeVersion[];
  saveLeaveTypeVersion: (v: LeaveTypeVersion) => void;
  /** Adds a new (or duplicated) leave type with its entitlement row; code and name must be unique. */
  createLeaveType: (v: LeaveTypeVersion, row: EntitlementRow) => boolean;
  /** Removes a custom type that has no requests. */
  deleteLeaveType: (code: string) => void;
  leaveHolidays: PublicHoliday[];
  saveHoliday: (h: PublicHoliday) => boolean;
  deleteHoliday: (id: string) => void;
  leavePolicyVersions: PolicyVersion[];
  saveLeavePolicy: (values: LeavePolicy, signOff: PolicySignOff, effectiveFrom: string, note: string) => void;
  saveEntitlements: (matrix: EntitlementMatrix, bands: TenureBand[]) => void;
  leaveAdjustments: LeaveAdjustment[];
  addLeaveAdjustment: (a: Omit<LeaveAdjustment, 'id'>) => void;
  eligibilityOverrides: EligibilityOverride[];
  addEligibilityOverride: (o: Omit<EligibilityOverride, 'id' | 'at'>) => void;
  closedLeaveYears: number[];
  closeLeaveYear: (year: number) => void;
  leaveJobRuns: LeaveJobRun[];
  runLeaveJob: (id: JobStatus['id'], employees: HREmployee[]) => void;
  approveLeaveRequest: (id: string, comment?: string, actor?: string) => void;
  rejectLeaveRequest: (id: string, comment?: string, actor?: string) => void;
  cancelLeaveRequest: (id: string, actor?: string) => void;
  /** Validates with the leave engine first; returns null (and shows why) when the request fails. */
  createLeaveRequest: (req: NewLeaveRequest) => LeaveRequest | null;
}

interface Deps {
  hrEmployees: HREmployee[];
  leaveRequests: LeaveRequest[];
  setLeaveRequests: Dispatch<SetStateAction<LeaveRequest[]>>;
  addToast: (t: Toast) => void;
  selectedOrgId: string;
}

const stamp = () => new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export const useLeaveState = ({ hrEmployees, leaveRequests, setLeaveRequests, addToast, selectedOrgId }: Deps): LeaveStateSlice => {
  const [leaveTypeVersions, setTypes] = useState<LeaveTypeVersion[]>(INITIAL_LEAVE_TYPE_VERSIONS);
  const [leavePolicyVersions, setPolicies] = useState<PolicyVersion[]>(INITIAL_POLICY_VERSIONS);
  const [matrix, setMatrix] = useState<EntitlementMatrix>(INITIAL_ENTITLEMENT_MATRIX);
  const [bands, setBands] = useState<TenureBand[]>(INITIAL_TENURE_BANDS);
  const [leaveAdjustments, setAdjustments] = useState<LeaveAdjustment[]>(INITIAL_LEAVE_ADJUSTMENTS);
  const [eligibilityOverrides, setOverrides] = useState<EligibilityOverride[]>(INITIAL_ELIGIBILITY_OVERRIDES);
  const [closedLeaveYears, setClosed] = useState<number[]>([2025]);
  const [leaveJobRuns, setJobRuns] = useState<LeaveJobRun[]>([]);
  const [leaveHolidays, setHolidays] = useState<PublicHoliday[]>(PUBLIC_HOLIDAYS_KE);

  const leaveCfg = useMemo<LeaveEngineConfig>(
    () => ({
      types: leaveTypeVersions,
      policies: leavePolicyVersions,
      matrix,
      bands,
      holidays: leaveHolidays,
      attendance: HOLIDAY_ATTENDANCE,
      adjustments: leaveAdjustments,
      overrides: eligibilityOverrides,
      closing2025: AL_CLOSING_2025,
      closedYears: closedLeaveYears
    }),
    [leaveTypeVersions, leavePolicyVersions, matrix, bands, leaveAdjustments, eligibilityOverrides, closedLeaveYears, leaveHolidays]
  );

  const hrName = (orgId: string) => hrApproverFor(orgId, hrEmployees)?.fullName ?? 'HR';

  const saveLeaveTypeVersion = (v: LeaveTypeVersion) => {
    setTypes((prev) => {
      const same = prev.filter((t) => t.code === v.code);
      const version = Math.max(0, ...same.map((t) => t.version)) + 1;
      const dayBefore = (() => {
        const d = new Date(`${v.effectiveFrom}T00:00:00`);
        d.setDate(d.getDate() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();
      // Close the versions still open on the new start date; history is never rewritten
      const closed = prev.map((t) => (t.code === v.code && !t.effectiveTo && t.effectiveFrom < v.effectiveFrom ? { ...t, effectiveTo: dayBefore } : t));
      return [...closed, { ...v, version, effectiveTo: undefined }];
    });
    addToast({ type: 'success', title: `${v.name} updated`, message: `New version takes effect on ${v.effectiveFrom}. Earlier requests keep the rules they were made under.` });
  };

  const saveLeavePolicy = (values: LeavePolicy, signOff: PolicySignOff, effectiveFrom: string, note: string) => {
    setPolicies((prev) => [...prev.filter((p) => p.effectiveFrom !== effectiveFrom), { id: `POL-${effectiveFrom}`, effectiveFrom, values, signOff, note }]);
    addToast({ type: 'success', title: 'Leave policy saved', message: `Policy in force from ${effectiveFrom}, signed off by ${signOff.hrBy} and ${signOff.managementBy}.` });
  };

  const createLeaveType = (v: LeaveTypeVersion, row: EntitlementRow) => {
    const errors = validateLeaveTypeDraft(v, leaveCfg);
    if (errors.length) {
      addToast({ type: 'error', title: 'Leave type not saved', message: errors.join(' ') });
      return false;
    }
    setTypes((prev) => [...prev, { ...v, code: v.code.trim(), name: v.name.trim(), version: 1, effectiveTo: undefined, custom: true }]);
    setMatrix((m) => ({ ...m, [v.code.trim()]: row }));
    addToast({ type: 'success', title: `${v.name.trim()} created`, message: `Code ${v.code.trim()}, in force from ${v.effectiveFrom}. Set tenure bands in Entitlements if needed.` });
    return true;
  };

  const deleteLeaveType = (code: string) => {
    const t = leaveTypeVersions.find((x) => x.code === code);
    if (!t?.custom) return;
    const used = leaveRequests.filter((r) => codeOf(r.leaveType, leaveCfg) === code).length;
    if (used) {
      addToast({ type: 'error', title: 'Cannot delete', message: `${t.name} has ${used} requests. Deactivate it instead so the history stays.` });
      return;
    }
    setTypes((prev) => prev.filter((x) => x.code !== code));
    setMatrix((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== code)));
    setBands((bs) => bs.filter((b) => b.code !== code));
    addToast({ type: 'info', title: `${t.name} deleted`, message: 'It had no requests, so nothing in the ledger changes.' });
  };

  const saveHoliday = (h: PublicHoliday) => {
    const errors = validateHoliday(h, leaveHolidays);
    if (errors.length) {
      addToast({ type: 'error', title: 'Holiday not saved', message: errors.join(' ') });
      return false;
    }
    const before = leaveHolidays.find((x) => x.id === h.id);
    const moved = !before || before.date !== h.date || before.observed !== h.observed || before.location !== h.location;
    // A new or moved holiday counts as declared today, so leave approved earlier over that day is refunded
    const saved: PublicHoliday = { ...h, name: h.name.trim(), gazettedOn: moved ? todayIso() : h.gazettedOn };
    setHolidays((prev) => (before ? prev.map((x) => (x.id === h.id ? saved : x)) : [...prev, saved]).sort((a, b) => a.date.localeCompare(b.date)));
    addToast({ type: 'success', title: before ? 'Holiday updated' : 'Holiday added', message: `${saved.name} on ${saved.observed || saved.date}. Day counts and holiday credits use it straight away.` });
    return true;
  };

  const deleteHoliday = (id: string) => {
    const h = leaveHolidays.find((x) => x.id === id);
    setHolidays((prev) => prev.filter((x) => x.id !== id));
    if (!h) return;
    // The day becomes a working day again: leave already booked over it is charged one more day
    const day = h.observed || h.date;
    const weekday = ![0, 6].includes(new Date(day + 'T00:00:00').getDay());
    const hit = weekday
      ? leaveRequests.filter((r) => {
          if (!['APPROVED', 'PENDING_APPROVAL'].includes(r.status) || r.startDate > day || r.endDate < day) return false;
          if (h.location !== 'ALL' && h.location !== r.orgId) return false;
          return typeAt(codeOf(r.leaveType, leaveCfg), r.startDate, leaveCfg).countBasis === 'Working days';
        })
      : [];
    const charge = (r: LeaveRequest) => (r.halfDay && r.startDate === r.endDate ? 0.5 : 1);
    if (hit.length) {
      setLeaveRequests((prev) => prev.map((r) => (hit.some((x) => x.id === r.id) ? { ...r, daysCount: r.daysCount + charge(r) } : r)));
      setAdjustments((prev) => [
        ...prev,
        ...hit
          .filter((r) => r.status === 'APPROVED')
          .map((r, i) => ({
            id: `ADJ-${day.slice(0, 4)}-${String(prev.length + i + 1).padStart(3, '0')}`,
            staffId: r.staffId,
            code: codeOf(r.leaveType, leaveCfg),
            date: todayIso(),
            days: -charge(r),
            reason: `${h.name} (${day}) withdrawn — day inside ${r.id} re-charged`,
            by: 'HR office'
          }))
      ]);
    }
    addToast({
      type: 'info',
      title: 'Holiday removed',
      message: hit.length
        ? `${h.name} (${day}) is a working day again. ${hit.length} request${hit.length === 1 ? '' : 's'} over that day now count one more day.`
        : `${h.name} (${day}) is a working day again for new requests.`
    });
  };

  const saveEntitlements = (m: EntitlementMatrix, b: TenureBand[]) => {
    setMatrix(m);
    setBands(b);
    addToast({ type: 'success', title: 'Entitlements saved', message: 'Balances are recalculated from the ledger with the new matrix and bands.' });
  };

  const addLeaveAdjustment = (a: Omit<LeaveAdjustment, 'id'>) => {
    setAdjustments((prev) => [...prev, { ...a, id: `ADJ-${a.date.slice(0, 4)}-${String(prev.length + 1).padStart(3, '0')}` }]);
    addToast({ type: 'success', title: 'Adjustment posted', message: `${a.days > 0 ? '+' : ''}${a.days} days posted to the ledger.` });
  };

  const addEligibilityOverride = (o: Omit<EligibilityOverride, 'id' | 'at'>) => {
    setOverrides((prev) => [...prev, { ...o, id: `OVR-${new Date().getFullYear()}-${String(prev.length + 1).padStart(3, '0')}`, at: todayIso() }]);
    addToast({ type: 'success', title: 'Eligibility override recorded', message: 'The override and its reason are kept in the audit trail.' });
  };

  const closeLeaveYear = (year: number) => {
    const open = leaveRequests.filter((r) => r.orgId === selectedOrgId && r.status === 'PENDING_APPROVAL' && (r.startDate.startsWith(String(year)) || (r.appliedOn ?? '').startsWith(String(year))));
    if (open.length) {
      addToast({ type: 'error', title: `Cannot close ${year}`, message: `${open.length} requests are still waiting for a decision.` });
      return;
    }
    setClosed((prev) => (prev.includes(year) ? prev : [...prev, year]));
    addToast({ type: 'success', title: `Leave year ${year} closed`, message: `Carry-forward and forfeiture are posted on 31 Dec; ${year + 1} grants open on 1 Jan.` });
  };

  const runLeaveJob = (id: JobStatus['id'], employees: HREmployee[]) => {
    const job = jobStatus(employees, leaveRequests, todayIso(), leaveCfg).find((j) => j.id === id);
    if (!job) return;
    const summary =
      id === 'ACCRUAL'
        ? `Up to date. ${job.posted} on ${job.lastRun}. The next accrual posts on ${job.nextRun}.`
        : id === 'EXPIRY'
        ? `Checked every credit; nothing new expired today. ${job.posted}.`
        : job.posted;
    setJobRuns((prev) => [{ id, at: stamp(), summary }, ...prev]);
    addToast({ type: 'info', title: `${job.name} job ran`, message: summary });
  };

  const decide = (id: string, patch: (r: LeaveRequest) => LeaveRequest) => setLeaveRequests((prev) => prev.map((r) => (r.id === id ? patch(r) : r)));

  const approveLeaveRequest = (id: string, comment?: string, actor?: string) => {
    const r = leaveRequests.find((x) => x.id === id);
    if (!r || r.status !== 'PENDING_APPROVAL') return;
    const steps = workflowFor(r, leaveCfg);
    const step = currentStepOf(r);
    const by = actor ?? (step === 'SUPERVISOR' ? r.approverName ?? 'Supervisor' : hrName(r.orgId));
    const approvals = [...(r.approvals ?? []), { step, by, action: 'APPROVED' as const, comment, at: todayIso() }];
    if (step === 'SUPERVISOR' && steps.includes('HR')) {
      decide(id, (x) => ({ ...x, currentStep: 'HR', approvals }));
      addToast({ type: 'success', title: 'Supervisor approval recorded', message: `${r.staffName}'s ${r.leaveType.toLowerCase()} now waits for HR (${hrName(r.orgId)}). The days stay reserved.` });
      return;
    }
    decide(id, (x) => ({
      ...x,
      status: 'APPROVED',
      approvals,
      decidedOn: todayIso(),
      approverComment: comment || x.approverComment,
      leaveAllowanceTriggered: x.leaveType === 'Annual Leave'
    }));
    addToast({
      type: 'success',
      title: 'Leave approved',
      message: `${r.daysCount} days of ${r.leaveType.toLowerCase()} for ${r.staffName} moved from reserved to taken.${r.leaveType === 'Annual Leave' ? ' Leave allowance goes to the next payroll run.' : ''}`
    });
  };

  const rejectLeaveRequest = (id: string, comment?: string, actor?: string) => {
    const r = leaveRequests.find((x) => x.id === id);
    if (!r || r.status !== 'PENDING_APPROVAL') return;
    const step = currentStepOf(r);
    const by = actor ?? (step === 'SUPERVISOR' ? r.approverName ?? 'Supervisor' : hrName(r.orgId));
    decide(id, (x) => ({
      ...x,
      status: 'REJECTED',
      decidedOn: todayIso(),
      approverComment: comment || x.approverComment,
      approvals: [...(x.approvals ?? []), { step, by, action: 'REJECTED', comment, at: todayIso() }]
    }));
    addToast({ type: 'warning', title: 'Leave declined', message: `${r.daysCount} reserved days released back to ${r.staffName}'s balance.` });
  };

  const cancelLeaveRequest = (id: string, actor?: string) => {
    const r = leaveRequests.find((x) => x.id === id);
    if (!r) return;
    const today = todayIso();
    if (r.status === 'APPROVED' && r.startDate <= today) {
      addToast({ type: 'error', title: 'Leave already started', message: 'Approved leave can be cancelled only before its start date.' });
      return;
    }
    if (r.status !== 'PENDING_APPROVAL' && r.status !== 'APPROVED') return;
    decide(id, (x) => ({
      ...x,
      status: 'CANCELLED',
      cancelledFrom: x.status as 'PENDING_APPROVAL' | 'APPROVED',
      decidedOn: today,
      approvals: [...(x.approvals ?? []), { step: currentStepOf(x), by: actor ?? x.staffName, action: 'CANCELLED', at: today }]
    }));
    addToast({
      type: 'info',
      title: 'Leave cancelled',
      message: r.status === 'APPROVED' ? `${r.daysCount} days credited back to ${r.staffName} (${id}).` : `Application ${id} was withdrawn and its reserved days released.`
    });
  };

  const createLeaveRequest = (req: NewLeaveRequest): LeaveRequest | null => {
    const e = hrEmployees.find((x) => x.staffId === req.staffId);
    const code = codeOf(req.leaveType, leaveCfg);
    let daysCount = req.daysCount;
    let backdated = req.backdated;
    if (e && code) {
      const v = validateLeaveRequest(
        e,
        { code, startDate: req.startDate, endDate: req.endDate, halfDay: req.halfDay, attachment: req.attachment, submittedBy: req.submittedBy ?? 'EMPLOYEE' },
        leaveRequests,
        leaveCfg
      );
      if (!v.ok) {
        addToast({ type: 'error', title: 'Leave request not submitted', message: v.errors.join(' ') });
        return null;
      }
      daysCount = v.days;
      backdated = v.backdated;
    }
    const year = req.startDate.slice(0, 4);
    const next = Math.max(100, ...leaveRequests.filter((x) => x.id.startsWith(`LV-${year}-`)).map((x) => Number(x.id.split('-')[2]) || 0)) + 1;
    const sup = e ? supervisorFor(e, hrEmployees) : undefined;
    const created: LeaveRequest = {
      ...req,
      id: `LV-${year}-${String(next).padStart(3, '0')}`,
      orgId: e?.orgId ?? selectedOrgId,
      status: 'PENDING_APPROVAL',
      daysCount,
      backdated,
      currentStep: 'SUPERVISOR',
      leaveAllowanceTriggered: false,
      appliedOn: req.appliedOn ?? todayIso(),
      approverStaffId: req.approverStaffId ?? sup?.staffId,
      approverName: req.approverName ?? sup?.fullName
    };
    setLeaveRequests((prev) => [created, ...prev]);
    addToast({
      type: 'success',
      title: 'Leave request submitted',
      message: `${req.leaveType} (${daysCount} days) sent to ${created.approverName ?? 'the supervisor'}. The days are reserved until it is decided.`
    });
    return created;
  };

  return {
    leaveCfg,
    createLeaveType,
    deleteLeaveType,
    leaveHolidays,
    saveHoliday,
    deleteHoliday,
    leaveTypeVersions,
    saveLeaveTypeVersion,
    leavePolicyVersions,
    saveLeavePolicy,
    saveEntitlements,
    leaveAdjustments,
    addLeaveAdjustment,
    eligibilityOverrides,
    addEligibilityOverride,
    closedLeaveYears,
    closeLeaveYear,
    leaveJobRuns,
    runLeaveJob,
    approveLeaveRequest,
    rejectLeaveRequest,
    cancelLeaveRequest,
    createLeaveRequest
  };
};
