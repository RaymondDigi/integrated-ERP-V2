import { useMemo, useState } from 'react';
import type { BiometricPunch, HREmployee, LeaveRequest } from '../types';
import type { PublicHoliday } from '../data/leaveConfig';
import type { PayReduction } from '../data/payrollEngine';
import type { PayItem } from '../data/payItems';
import { HR_OFFICER, SUPERVISOR, TRACKED_ORGS, isCasual } from '../data/timeConfig';
import {
  buildDays,
  dayNum,
  exKey,
  fmtDate,
  generateSeedPunches,
  isoOf,
  OT_COMPONENT,
  otAmount,
  parseHm,
  seedDecisions,
  type DayRecord,
  type DecisionStatus,
  type OtSent,
  type Suspension,
  type TimeDecision,
  type TimePunch
} from '../data/timeEngine';
import {
  APPEAL_DAYS,
  SANCTION_LABEL,
  WARNING_MONTHS,
  addMonthsIso,
  seedCases,
  seedSuspension,
  type CaseCategory,
  type CaseDocument,
  type CaseOutcome,
  type DisciplinaryCase,
  type Sanction
} from '../data/discipline';

type Toast = { type: 'success' | 'warning' | 'error' | 'info'; title: string; message: string };
type Period = { year: number; month: number; key: string; label: string };

export interface TimeAuditEntry {
  at: string;
  by: string;
  text: string;
}

export interface CasualConversion {
  staffId: string;
  from: string;
  to: string;
  basic: number;
  effective: string;
  by: string;
  at: string;
  reason: string;
}

export interface NewCase {
  staffId: string;
  category: CaseCategory;
  summary: string;
  incidentDate: string;
  absenceDates?: string[];
}

/** Time & attendance and disciplinary state exposed through the app context. */
export interface TimeStateSlice {
  /** Date the time module treats as today */
  timeToday: string;
  timeNow: Date;
  timePunches: TimePunch[];
  timeDays: DayRecord[];
  timeDecisions: Record<string, TimeDecision>;
  overtimeSent: Record<string, OtSent>;
  timeAudit: TimeAuditEntry[];
  /** Adds a supervisor punch for a missing in or out, with the reason kept for audit. */
  fixMissingPunch: (staffId: string, date: string, dir: 'IN' | 'OUT', hm: string, reason: string) => void;
  /** Approve or reject overtime, excuse lateness, accept a geofence punch… */
  decideTimeExceptions: (keys: string[], status: DecisionStatus, reason: string) => void;
  /** HR confirms absences; unauthorised days in the open payroll month reduce pay. */
  confirmAbsences: (staffId: string, dates: string[], status: 'AUTHORISED' | 'UNAUTHORISED', reason: string) => void;
  reopenTimeException: (key: string) => void;
  /** Posts approved, unsent overtime to the open payroll period. Returns items posted. */
  sendOvertimeToPayroll: (keys: string[]) => number;
  disciplinaryCases: DisciplinaryCase[];
  raiseCase: (draft: NewCase) => DisciplinaryCase;
  updateCase: (id: string, patch: Partial<DisciplinaryCase>, event: string, doc?: Omit<CaseDocument, 'id' | 'on'>) => void;
  recordCaseOutcome: (id: string, outcome: Omit<CaseOutcome, 'reductionId' | 'separationNote' | 'expiresOn'> & { expiresOn?: string }) => boolean;
  decideAppeal: (id: string, status: 'DISMISSED' | 'UPHELD' | 'VARIED', decision: string, varied?: Sanction) => void;
  casualConversions: CasualConversion[];
  convertCasual: (staffId: string, contractType: string, basic: number, effective: string, reason: string) => void;
}

interface Deps {
  hrEmployees: HREmployee[];
  leaveRequests: LeaveRequest[];
  leaveHolidays: PublicHoliday[];
  attendancePunches: BiometricPunch[];
  payrollOpenPeriod: Period;
  addPayReduction: (r: Omit<PayReduction, 'id'>) => PayReduction;
  removePayReduction: (id: string) => void;
  postPayItems: (items: Omit<PayItem, 'id' | 'orgId' | 'postedBy' | 'postedOn' | 'status'>[], by?: string) => number;
  updateHrEmployee: (staffId: string, patch: Partial<HREmployee>) => void;
  addToast: (t: Toast) => void;
}

const stamp = () => new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** Splits dates into runs of consecutive calendar days. */
const runsOf = (dates: string[]) => {
  const sorted = [...new Set(dates)].sort();
  const runs: { from: string; to: string; dates: string[] }[] = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && dayNum(d) - dayNum(last.to) === 1) {
      last.to = d;
      last.dates.push(d);
    } else runs.push({ from: d, to: d, dates: [d] });
  }
  return runs;
};

/** ESS clock-ins and terminal pushes kept in the app's punch list. */
const fromBiometric = (list: BiometricPunch[]): TimePunch[] =>
  list
    .filter((p) => TRACKED_ORGS.includes(p.orgId) && p.type !== 'OUTPUT_TALLY')
    .map((p) => ({
      id: p.id,
      orgId: p.orgId,
      staffId: p.staffId,
      date: p.timestamp.slice(0, 10),
      min: parseHm(p.timestamp.slice(11, 16)),
      dir: p.type === 'CLOCK_IN' ? 'IN' : 'OUT',
      source: p.source === 'GPS_GEOFENCE' ? 'MOBILE' : 'BIOMETRIC',
      device: p.deviceId,
      geo: p.source === 'GPS_GEOFENCE' ? (p.geofenceStatus === 'VALID_POLYGON' ? 'INSIDE' : 'OUTSIDE') : undefined
    }));

export const useTimeState = (deps: Deps): TimeStateSlice => {
  const { hrEmployees, leaveRequests, leaveHolidays, attendancePunches, payrollOpenPeriod, addPayReduction, removePayReduction, postPayItems, updateHrEmployee, addToast } = deps;
  const [timeNow] = useState(() => new Date());
  const timeToday = isoOf(timeNow);

  // History the terminals already hold, with what supervisors had worked through before this session
  const [seed] = useState(() => {
    const sus = seedSuspension(timeToday);
    const blocked = (id: string, d: string) => id === sus.staffId && d >= sus.from && d <= sus.to;
    const punches = generateSeedPunches({ employees: hrEmployees, holidays: leaveHolidays, leaveRequests, now: timeNow, blocked });
    const days = buildDays({ employees: hrEmployees, punches, leaveRequests, holidays: leaveHolidays, suspensions: [sus], now: timeNow });
    return { punches, ...seedDecisions(days, timeNow), cases: seedCases(hrEmployees, days, timeToday) };
  });

  const [manualPunches, setManualPunches] = useState<TimePunch[]>([]);
  const [timeDecisions, setDecisions] = useState<Record<string, TimeDecision>>(seed.decisions);
  const [overtimeSent, setSent] = useState<Record<string, OtSent>>(seed.sent);
  const [timeAudit, setAudit] = useState<TimeAuditEntry[]>([]);
  const [disciplinaryCases, setCases] = useState<DisciplinaryCase[]>(seed.cases);
  const [casualConversions, setConversions] = useState<CasualConversion[]>([]);

  const audit = (by: string, text: string) => setAudit((a) => [{ at: stamp(), by, text }, ...a]);
  const nameOf = (staffId: string) => hrEmployees.find((e) => e.staffId === staffId)?.fullName ?? staffId;
  const openStart = `${payrollOpenPeriod.key}-01`;

  const timePunches = useMemo(() => [...seed.punches, ...manualPunches, ...fromBiometric(attendancePunches)], [seed.punches, manualPunches, attendancePunches]);

  const suspensions = useMemo<Suspension[]>(
    () =>
      disciplinaryCases
        .filter((c) => c.outcome?.suspension && c.appeal?.status !== 'UPHELD')
        .map((c) => ({ staffId: c.staffId, from: c.outcome!.suspension!.from, to: c.outcome!.suspension!.to })),
    [disciplinaryCases]
  );

  const casualUntil = useMemo(() => Object.fromEntries(casualConversions.map((c) => [c.staffId, c.effective])), [casualConversions]);
  const timeDays = useMemo(
    () => buildDays({ employees: hrEmployees, punches: timePunches, leaveRequests, holidays: leaveHolidays, suspensions, now: timeNow, casualUntil }),
    [hrEmployees, timePunches, leaveRequests, leaveHolidays, suspensions, timeNow, casualUntil]
  );

  const decide = (keys: string[], status: DecisionStatus, reason: string, by: string, extra: (key: string) => Partial<TimeDecision> = () => ({})) =>
    setDecisions((m) => {
      const next = { ...m };
      for (const key of keys) next[key] = { key, status, reason, by, at: timeToday, ...extra(key) };
      return next;
    });

  const fixMissingPunch: TimeStateSlice['fixMissingPunch'] = (staffId, date, dir, hm, reason) => {
    const e = hrEmployees.find((x) => x.staffId === staffId);
    const day = timeDays.find((d) => d.staffId === staffId && d.date === date);
    if (!e || !day || !reason.trim()) {
      addToast({ type: 'error', title: 'Punch not saved', message: 'Give the time and a reason for the correction.' });
      return;
    }
    let min = parseHm(hm);
    // An out-punch earlier than the in-punch is the next morning (night shift)
    if (dir === 'OUT' && day.inMin !== undefined && min <= day.inMin) min += 1440;
    const p: TimePunch = { id: `TP-FIX-${Date.now().toString(36)}`, orgId: e.orgId, staffId, date, min, dir, source: 'MANUAL', device: 'Supervisor correction', note: reason.trim(), by: SUPERVISOR, recordedAt: timeToday };
    setManualPunches((xs) => [...xs, p]);
    decide([exKey(dir === 'OUT' ? 'MISSING_OUT' : 'MISSING_IN', staffId, date)], 'FIXED', reason.trim(), SUPERVISOR);
    audit(SUPERVISOR, `Added ${dir === 'OUT' ? 'punch-out' : 'punch-in'} ${hm} for ${nameOf(staffId)} on ${fmtDate(date)}: ${reason.trim()}`);
    addToast({ type: 'success', title: 'Punch corrected', message: `${nameOf(staffId)}, ${fmtDate(date)}: ${dir === 'OUT' ? 'out' : 'in'} at ${hm}. Hours recalculated.` });
  };

  const decideTimeExceptions: TimeStateSlice['decideTimeExceptions'] = (keys, status, reason) => {
    if (!keys.length) return;
    const extra = (key: string) => {
      if (!key.startsWith('OVERTIME|') || status !== 'APPROVED') return {};
      const d = timeDays.find((x) => `OVERTIME|${x.key}` === key);
      return { h15: d?.ot15 ?? 0, h20: d?.ot20 ?? 0 };
    };
    decide(keys, status, reason, SUPERVISOR, extra);
    const what = keys[0].split('|')[0].toLowerCase().replace('_', ' ');
    audit(SUPERVISOR, `${status.toLowerCase()} ${keys.length} ${what} item${keys.length > 1 ? 's' : ''}${reason ? `: ${reason}` : ''}`);
    addToast({ type: status === 'REJECTED' ? 'info' : 'success', title: `${keys.length} item${keys.length > 1 ? 's' : ''} ${status.toLowerCase()}`, message: reason || 'Recorded in the attendance audit trail.' });
  };

  const confirmAbsences: TimeStateSlice['confirmAbsences'] = (staffId, dates, status, reason) => {
    const e = hrEmployees.find((x) => x.staffId === staffId);
    if (!e || !dates.length) return;
    const reductionFor: Record<string, string> = {};
    let locked = 0;
    if (status === 'UNAUTHORISED' && !isCasual(e)) {
      for (const run of runsOf(dates)) {
        const open = run.dates.filter((d) => d >= openStart);
        locked += run.dates.length - open.length;
        if (!open.length) continue;
        const r = addPayReduction({ staffId, from: open[0], to: open[open.length - 1], factor: 1, reason: 'Absent without leave', source: 'Attendance', ref: `ATT-${staffId}-${open[0]}` });
        for (const d of open) reductionFor[d] = r.id;
      }
    }
    decide(dates.map((d) => exKey('ABSENT', staffId, d)), status, reason, HR_OFFICER, (key) => ({ reductionId: reductionFor[key.split('|')[2]] }));
    const deducted = Object.keys(reductionFor).length;
    audit(HR_OFFICER, `${nameOf(staffId)}: ${dates.length} absence day${dates.length > 1 ? 's' : ''} marked ${status.toLowerCase()}${deducted ? `, ${deducted} withheld in ${payrollOpenPeriod.label} payroll` : ''}${reason ? ` (${reason})` : ''}`);
    if (status === 'AUTHORISED') addToast({ type: 'success', title: 'Absence authorised', message: `${nameOf(staffId)}: ${dates.length} day${dates.length > 1 ? 's' : ''}, paid as normal.` });
    else if (isCasual(e)) addToast({ type: 'info', title: 'Absence recorded', message: `${nameOf(staffId)} is daily-rated, so days not worked are simply not paid.` });
    else
      addToast({
        type: locked ? 'warning' : 'success',
        title: 'Unauthorised absence confirmed',
        message: `${deducted ? `${deducted} day${deducted > 1 ? 's' : ''} withheld from ${nameOf(staffId)}'s ${payrollOpenPeriod.label} pay.` : ''}${locked ? ` ${locked} day${locked > 1 ? 's are' : ' is'} in a paid month, so no deduction.` : ''}`.trim()
      });
  };

  const reopenTimeException: TimeStateSlice['reopenTimeException'] = (key) => {
    const dec = timeDecisions[key];
    if (!dec) return;
    if (overtimeSent[key]) {
      addToast({ type: 'error', title: 'Already sent to payroll', message: 'Cancel the payroll item first if the hours were wrong.' });
      return;
    }
    // Reversing one day of a deduction reverses the run it was posted with
    const shared = dec.reductionId ? Object.values(timeDecisions).filter((d) => d.reductionId === dec.reductionId).map((d) => d.key) : [key];
    if (dec.reductionId) removePayReduction(dec.reductionId);
    setDecisions((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !shared.includes(k))));
    const [, staffId, date] = key.split('|');
    audit(HR_OFFICER, `Reopened ${key.split('|')[0].toLowerCase().replace('_', ' ')} for ${nameOf(staffId)} on ${fmtDate(date)}${dec.reductionId ? '; pay deduction reversed' : ''}`);
    addToast({ type: 'info', title: 'Decision reversed', message: dec.reductionId ? `Pay deduction removed for ${shared.length} day${shared.length > 1 ? 's' : ''}.` : 'Back in the exceptions queue.' });
  };

  const sendOvertimeToPayroll: TimeStateSlice['sendOvertimeToPayroll'] = (keys) => {
    const ready = keys.filter((k) => timeDecisions[k]?.status === 'APPROVED' && !overtimeSent[k]);
    const groups = new Map<string, { h15: number; h20: number; keys: string[]; months: Set<string> }>();
    for (const k of ready) {
      const [, staffId, date] = k.split('|');
      const g = groups.get(staffId) ?? { h15: 0, h20: 0, keys: [], months: new Set<string>() };
      g.h15 += timeDecisions[k].h15 ?? 0;
      g.h20 += timeDecisions[k].h20 ?? 0;
      g.keys.push(k);
      g.months.add(date.slice(0, 7));
      groups.set(staffId, g);
    }
    const items: Parameters<typeof postPayItems>[0] = [];
    const sentKeys: string[] = [];
    let skipped = 0;
    for (const [staffId, g] of groups) {
      const e = hrEmployees.find((x) => x.staffId === staffId);
      if (!e || isCasual(e)) {
        skipped += g.keys.length;
        continue;
      }
      const months = [...g.months].sort().join(', ');
      for (const [componentId, hours] of [
        [OT_COMPONENT.h15, g.h15],
        [OT_COMPONENT.h20, g.h20]
      ] as const) {
        if (!hours) continue;
        const amount = otAmount(e, payrollOpenPeriod, componentId, hours);
        if (amount > 0)
          items.push({ staffId, componentId, amount, auto: true, quantity: hours, period: payrollOpenPeriod.key, recurring: false, reference: `Timesheet ${months} — ${hours} h approved`, source: 'Bulk' });
      }
      sentKeys.push(...g.keys);
    }
    if (!items.length) {
      addToast({ type: 'warning', title: 'Nothing to send', message: skipped ? 'Daily-rated staff are paid by days worked, not overtime items.' : 'Approve overtime first. Hours already sent are not sent again.' });
      return 0;
    }
    const n = postPayItems(items);
    if (n) {
      const at = timeToday;
      setSent((m) => {
        const next = { ...m };
        for (const k of sentKeys) next[k] = { period: payrollOpenPeriod.key, at, h15: timeDecisions[k].h15 ?? 0, h20: timeDecisions[k].h20 ?? 0, reference: `Posted to ${payrollOpenPeriod.label} payroll` };
        return next;
      });
      audit(HR_OFFICER, `Sent ${sentKeys.length} approved overtime day${sentKeys.length > 1 ? 's' : ''} to ${payrollOpenPeriod.label} payroll as ${n} item${n > 1 ? 's' : ''}`);
    }
    return n;
  };

  /* ---------------------------- Disciplinary ---------------------------- */

  const nextCaseId = () => {
    const year = timeToday.slice(0, 4);
    const nums = disciplinaryCases.filter((c) => c.id.startsWith(`DC-${year}-`)).map((c) => Number(c.id.slice(-3)));
    return `DC-${year}-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
  };

  const raiseCase: TimeStateSlice['raiseCase'] = (draft) => {
    const e = hrEmployees.find((x) => x.staffId === draft.staffId);
    const c: DisciplinaryCase = {
      id: nextCaseId(),
      orgId: e?.orgId ?? 'org-kericho',
      staffId: draft.staffId,
      category: draft.category,
      summary: draft.summary.trim(),
      incidentDate: draft.incidentDate,
      raisedOn: timeToday,
      raisedBy: HR_OFFICER,
      stage: 'RAISED',
      absenceDates: draft.absenceDates?.length ? draft.absenceDates : undefined,
      timeline: [{ at: timeToday, by: HR_OFFICER, text: draft.absenceDates?.length ? `Case raised from attendance (${draft.absenceDates.length} day${draft.absenceDates.length > 1 ? 's' : ''})` : 'Case raised' }],
      documents: draft.absenceDates?.length ? [{ id: `DOC-${Date.now().toString(36)}`, name: 'Attendance extract', kind: 'EVIDENCE', on: timeToday }] : []
    };
    setCases((xs) => [c, ...xs]);
    addToast({ type: 'success', title: `Case ${c.id} raised`, message: `${nameOf(c.staffId)}: next, assign an investigating officer or issue a show-cause letter.` });
    return c;
  };

  const updateCase: TimeStateSlice['updateCase'] = (id, patch, event, doc) =>
    setCases((xs) =>
      xs.map((c) =>
        c.id === id
          ? {
              ...c,
              ...patch,
              timeline: [...c.timeline, { at: timeToday, by: HR_OFFICER, text: event }],
              documents: doc ? [...c.documents, { ...doc, id: `DOC-${Date.now().toString(36)}`, on: timeToday }] : c.documents
            }
          : c
      )
    );

  const recordCaseOutcome: TimeStateSlice['recordCaseOutcome'] = (id, o) => {
    const c = disciplinaryCases.find((x) => x.id === id);
    if (!c) return false;
    const outcome: CaseOutcome = { ...o };
    const months = WARNING_MONTHS[o.sanction];
    if (months) outcome.expiresOn = o.expiresOn ?? addMonthsIso(o.decidedOn, months);
    const events: string[] = [`Outcome: ${SANCTION_LABEL[o.sanction].toLowerCase()}`];
    const docs: Omit<CaseDocument, 'id' | 'on'>[] = [];
    if (o.sanction === 'SUSPENSION' && o.suspension) {
      const s = o.suspension;
      if (s.to < s.from) {
        addToast({ type: 'error', title: 'Check the dates', message: 'The suspension must end on or after it starts.' });
        return false;
      }
      if (s.from < openStart) {
        addToast({ type: 'error', title: 'Paid period', message: `${payrollOpenPeriod.label} is the earliest open payroll month. Start the suspension on or after ${fmtDate(openStart)}.` });
        return false;
      }
      const factor = s.pay === 'HALF' ? 0.5 : 1;
      const r = addPayReduction({ staffId: c.staffId, from: s.from, to: s.to, factor, reason: s.pay === 'HALF' ? `Suspension on half pay — case ${id}` : `Suspension without pay — case ${id}`, source: 'Disciplinary', ref: id });
      outcome.reductionId = r.id;
      events.push(`suspended ${s.pay === 'HALF' ? 'on half pay' : 'without pay'} ${fmtDate(s.from)} to ${fmtDate(s.to)}; payroll notified`);
      docs.push({ name: 'Suspension letter', kind: 'SUSPENSION' });
    }
    if (months) docs.push({ name: SANCTION_LABEL[o.sanction], kind: 'WARNING' });
    if (o.sanction === 'SUMMARY_DISMISSAL' || o.sanction === 'TERMINATION_NOTICE') {
      outcome.separationNote = `Handed to Separation (#12) on ${fmtDate(timeToday)}: ${SANCTION_LABEL[o.sanction].toLowerCase()}, last day ${fmtDate(o.effectiveDate ?? timeToday)}${o.noticeDays ? `, ${o.noticeDays} days' notice` : ''}. Terminal dues and clearance are done there.`;
      events.push('handed to Separation');
      docs.push({ name: 'Outcome letter', kind: 'OUTCOME' });
    }
    setCases((xs) =>
      xs.map((x) =>
        x.id === id
          ? {
              ...x,
              outcome,
              stage: 'OUTCOME',
              timeline: [...x.timeline, { at: timeToday, by: HR_OFFICER, text: `${events.join('; ')}. Appeal window ${APPEAL_DAYS} days.` }],
              documents: [...x.documents, ...docs.map((d, i) => ({ ...d, id: `DOC-${Date.now().toString(36)}${i}`, on: timeToday }))]
            }
          : x
      )
    );
    addToast({
      type: 'success',
      title: `${id}: ${SANCTION_LABEL[o.sanction]}`,
      message: outcome.reductionId ? `Payroll will withhold ${o.suspension!.pay === 'HALF' ? 'half' : 'all'} of ${nameOf(c.staffId)}'s pay for the suspension days.` : outcome.separationNote ? 'Recorded and handed to Separation.' : `Recorded on ${nameOf(c.staffId)}'s file.`
    });
    return true;
  };

  const decideAppeal: TimeStateSlice['decideAppeal'] = (id, status, decision, varied) => {
    const c = disciplinaryCases.find((x) => x.id === id);
    if (!c?.appeal) return;
    let outcome = c.outcome;
    if ((status === 'UPHELD' || (status === 'VARIED' && varied !== 'SUSPENSION')) && outcome?.reductionId) {
      removePayReduction(outcome.reductionId);
      outcome = { ...outcome, reductionId: undefined };
    }
    if (status === 'VARIED' && varied && outcome) {
      const months = WARNING_MONTHS[varied];
      outcome = { ...outcome, sanction: varied, suspension: varied === 'SUSPENSION' ? outcome.suspension : undefined, expiresOn: months ? addMonthsIso(outcome.decidedOn, months) : undefined, separationNote: undefined };
    }
    const label = status === 'UPHELD' ? 'Appeal allowed: sanction set aside' : status === 'DISMISSED' ? 'Appeal dismissed: sanction stands' : `Sanction reduced to ${SANCTION_LABEL[varied ?? 'VERBAL'].toLowerCase()}`;
    setCases((xs) =>
      xs.map((x) =>
        x.id === id
          ? { ...x, outcome, stage: 'CLOSED', closedOn: timeToday, appeal: { ...x.appeal!, status, decidedOn: timeToday, decision }, timeline: [...x.timeline, { at: timeToday, by: HR_OFFICER, text: `${label}. ${decision}`.trim() }] }
          : x
      )
    );
    addToast({ type: 'success', title: `${id} closed`, message: label });
  };

  const convertCasual: TimeStateSlice['convertCasual'] = (staffId, contractType, basic, effective, reason) => {
    const e = hrEmployees.find((x) => x.staffId === staffId);
    if (!e || !(basic > 0)) {
      addToast({ type: 'error', title: 'Not converted', message: 'Enter the monthly basic salary for the new terms.' });
      return;
    }
    updateHrEmployee(staffId, { contractType, basicSalaryKes: basic, contractStartDate: effective, status: 'ACTIVE' });
    setConversions((xs) => [{ staffId, from: e.contractType, to: contractType, basic, effective, by: HR_OFFICER, at: timeToday, reason }, ...xs]);
    audit(HR_OFFICER, `${e.fullName} moved from ${e.contractType} to ${contractType} from ${fmtDate(effective)} (s.37)`);
    addToast({ type: 'success', title: 'Terms converted', message: `${e.fullName} is now on a ${contractType.toLowerCase()} at KES ${basic.toLocaleString()} a month from ${fmtDate(effective)}.` });
  };

  return {
    timeToday,
    timeNow,
    timePunches,
    timeDays,
    timeDecisions,
    overtimeSent,
    timeAudit,
    fixMissingPunch,
    decideTimeExceptions,
    confirmAbsences,
    reopenTimeException,
    sendOvertimeToPayroll,
    disciplinaryCases,
    raiseCase,
    updateCase,
    recordCaseOutcome,
    decideAppeal,
    casualConversions,
    convertCasual
  };
};

