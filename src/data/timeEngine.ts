import type { HREmployee, LeaveRequest } from '../types';
import { calcAmount, formulaVars } from './payrollEngine';
import { componentAt } from './payComponents';
import type { PublicHoliday } from './leaveConfig';
import {
  CASUAL_INTENSITY,
  DEVICE,
  PROFILES,
  SCHEDULES,
  SUPERVISOR,
  TIME_RULES,
  TRACKED_ORGS,
  isCasual,
  scheduleRuleFor,
  type PunchSource,
  type WorkSchedule
} from './timeConfig';

/* ------------------------------------------------------------------ */
/* Dates and helpers                                                   */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const dayNum = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;
export const fromDayNum = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => fromDayNum(dayNum(iso) + n);
export const dow = (iso: string) => new Date(dayNum(iso) * 86_400_000).getUTCDay();
export const daysBetween = (a: string, b: string) => dayNum(b) - dayNum(a);
export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
/** Monday of the week the date falls in */
export const weekStart = (iso: string) => addDays(iso, -((dow(iso) + 6) % 7));
export const monthEnd = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return isoOf(new Date(y, m, 0));
};
export const rangeDays = (from: string, to: string) => {
  const out: string[] = [];
  for (let n = dayNum(from); n <= dayNum(to); n++) out.push(fromDayNum(n));
  return out;
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (iso: string, withDay = false) => `${withDay ? DOW[dow(iso)] + ' ' : ''}${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
export const fmtShort = (iso: string) => `${DOW[dow(iso)]} ${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
export const fmtMin = (min: number) => `${pad(Math.floor((min % 1440) / 60))}:${pad(min % 60)}${min >= 1440 ? ' +1' : ''}`;
export const parseHm = (hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + (m || 0);
};
export const hrs = (h: number) => (Math.round(h * 10) / 10).toLocaleString();

/** Stable 0–1 value from a string (FNV-1a). */
export const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
};

const floorHalf = (h: number) => Math.floor(h * 2) / 2;

/* ------------------------------------------------------------------ */
/* Schedules, holidays, leave                                          */
/* ------------------------------------------------------------------ */

export const scheduleOn = (e: HREmployee, date: string): WorkSchedule => {
  const rule = scheduleRuleFor(e);
  if (rule !== 'ROTATING') return SCHEDULES[rule];
  const week = Math.floor((dayNum(date) + 3) / 7);
  const group = hash(`${e.staffId}|rota`) < 0.5 ? 0 : 1;
  return (week + group) % 2 ? SCHEDULES.NIGHT : SCHEDULES.DAY;
};

export const holidayOn = (date: string, holidays: PublicHoliday[], orgId: string) =>
  holidays.find((h) => (h.observed ?? h.date) === date && (h.location === 'ALL' || h.location === orgId)) ??
  holidays.find((h) => h.date === date && (h.location === 'ALL' || h.location === orgId));

const leaveIndex = (leave: LeaveRequest[], statuses: LeaveRequest['status'][]) => {
  const m = new Map<string, LeaveRequest[]>();
  for (const l of leave) if (statuses.includes(l.status)) m.set(l.staffId, [...(m.get(l.staffId) ?? []), l]);
  return (staffId: string, date: string) => m.get(staffId)?.find((l) => l.startDate <= date && l.endDate >= date);
};

/* ------------------------------------------------------------------ */
/* Punches                                                             */
/* ------------------------------------------------------------------ */

export interface TimePunch {
  id: string;
  orgId: string;
  staffId: string;
  /** Shift date the punch belongs to */
  date: string;
  /** Minutes after midnight of the shift date (over 1440 for the next morning) */
  min: number;
  dir: 'IN' | 'OUT';
  source: PunchSource;
  device: string;
  geo?: 'INSIDE' | 'OUTSIDE';
  note?: string;
  by?: string;
  recordedAt?: string;
}

/** Recent absences for the absentee profile, relative to today (working days only). */
export const forcedAbsences = (staffId: string, today: string): string[] => {
  if (PROFILES[staffId] !== 'ABSENT') return [];
  const back = (offset: number) => {
    let d = addDays(today, offset);
    while (dow(d) === 0 || dow(d) === 6) d = addDays(d, -1);
    return d;
  };
  const recent = [back(-1)];
  recent.push(back(dayNum(recent[0]) - dayNum(today) - 1));
  return [...new Set([back(-30), back(-29), back(-17), ...recent])];
};

/** Weeks a casual was not engaged (seasonal breaks), as day offsets from today. */
const CASUAL_BREAKS: Record<string, [number, number]> = {
  'CAS-1119': [-45, -20],
  'CAS-1116': [-70, -36],
  'CAS-1115': [-40, -32],
  'CAS-1120': [-38, -30]
};

export interface SeedInput {
  employees: HREmployee[];
  holidays: PublicHoliday[];
  leaveRequests: LeaveRequest[];
  now: Date;
  /** Days without punches (e.g. suspension) */
  blocked?: (staffId: string, date: string) => boolean;
}

/** Deterministic punch history for every tracked employee, from staff ID and date. */
export const generateSeedPunches = ({ employees, holidays, leaveRequests, now, blocked }: SeedInput): TimePunch[] => {
  const today = isoOf(now);
  const nowAbs = dayNum(today) * 1440 + nowMinutes(now);
  const start = addDays(today, -TIME_RULES.historyDays);
  const correctedBefore = addDays(today, -13);
  const onLeave = leaveIndex(leaveRequests, ['APPROVED', 'PENDING_APPROVAL']);
  const out: TimePunch[] = [];
  for (const e of employees) {
    if (!TRACKED_ORGS.includes(e.orgId)) continue;
    const from = e.joinedDate > start ? e.joinedDate : start;
    const to = e.exitDate && e.exitDate < today ? e.exitDate : today;
    if (e.status === 'TERMINATED' && !e.exitDate) continue;
    const casual = isCasual(e);
    const profile = PROFILES[e.staffId];
    const forced = forcedAbsences(e.staffId, today);
    const brk = CASUAL_BREAKS[e.staffId];
    for (const date of rangeDays(from, to)) {
      if (blocked?.(e.staffId, date) || onLeave(e.staffId, date)) continue;
      if (e.status === 'ON_LEAVE' && date > addDays(today, -10)) continue;
      if (brk && date >= addDays(today, brk[0]) && date <= addDays(today, brk[1])) continue;
      const s = scheduleOn(e, date);
      const d = dow(date);
      const hol = holidayOn(date, holidays, e.orgId);
      const k = `${e.staffId}|${date}`;
      const r = hash(k);
      const workday = s.days.includes(d) && !hol;
      let inM: number;
      let outM: number;
      let missingOut = false;
      if (casual) {
        const p = CASUAL_INTENSITY[e.staffId] ?? 0.7;
        if (workday && r < p) {
          inM = s.start - 2 - Math.floor(hash(k + 'i') * 12);
          outM = s.end + Math.floor(hash(k + 'o') * 10);
        } else if (d === 6 && !hol && r < p * 0.35) {
          inM = s.start - Math.floor(hash(k + 'i') * 8);
          outM = s.start + 300 + Math.floor(hash(k + 'o') * 15);
        } else continue;
      } else if (workday) {
        if (forced.includes(date)) continue;
        const absentP = profile === 'ABSENT' ? 0.05 : profile === 'STEADY' ? 0 : 0.016;
        if (r < absentP) continue;
        const late = profile === 'LATE' ? hash(k + 'l') < 0.35 : profile !== 'STEADY' && hash(k + 'l') < 0.06;
        inM = late ? s.start + s.graceMin + 2 + Math.floor(hash(k + 'i') * 40) : s.start - 3 - Math.floor(hash(k + 'i') * 14);
        outM = s.end + Math.floor(hash(k + 'o') * 12);
        if (hash(k + 'e') < 0.03) outM = s.end - 20 - Math.floor(hash(k + 'o') * 70);
        const otP = s.id === 'OFFICE' ? (e.department === 'Finance & Administration' && Number(date.slice(8)) >= 25 ? 0.3 : 0.03) : 0.2;
        if (profile !== 'STEADY' && hash(k + 'x') < otP) outM = s.end + 60 * (1 + Math.floor(hash(k + 'h') * 3)) + Math.floor(hash(k + 'o') * 10);
        missingOut = hash(k + 'm') < 0.025;
      } else {
        const essential = s.id !== 'OFFICE' && s.id !== 'PART';
        const p = hol ? 0.4 : d === 6 ? 0.22 : d === 0 ? 0.08 : 0;
        if (!essential || hash(k + 'w') >= p) continue;
        inM = 7 * 60 - Math.floor(hash(k + 'i') * 10);
        outM = inM + (d === 6 ? 5 : 7) * 60 + Math.floor(hash(k + 'o') * 40);
      }
      const source: PunchSource = s.punch === 'MOBILE' ? 'MOBILE' : 'BIOMETRIC';
      const device = DEVICE[s.id].device;
      const geo = (salt: string) => (source === 'MOBILE' ? (hash(k + salt) < 0.03 ? 'OUTSIDE' : 'INSIDE') : undefined);
      const base = dayNum(date) * 1440;
      if (base + inM > nowAbs) continue;
      out.push({ id: `TP-${k}-I`, orgId: e.orgId, staffId: e.staffId, date, min: inM, dir: 'IN', source, device, geo: geo('gi') });
      if (missingOut) {
        if (date < correctedBefore)
          out.push({ id: `TP-${k}-M`, orgId: e.orgId, staffId: e.staffId, date, min: s.end, dir: 'OUT', source: 'MANUAL', device: 'Supervisor correction', note: 'Forgot to clock out; shift end confirmed by supervisor', by: SUPERVISOR, recordedAt: addDays(date, 1) });
        continue;
      }
      if (base + outM <= nowAbs) out.push({ id: `TP-${k}-O`, orgId: e.orgId, staffId: e.staffId, date, min: outM, dir: 'OUT', source, device, geo: geo('go') });
    }
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Day records                                                         */
/* ------------------------------------------------------------------ */

export type DayStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE' | 'OFF' | 'HOLIDAY' | 'ON_SITE' | 'NOT_IN_YET' | 'MISSING_OUT' | 'MISSING_IN' | 'NOT_ENGAGED' | 'SUSPENDED';
export type ExceptionKind = 'MISSING_OUT' | 'MISSING_IN' | 'ABSENT' | 'LATE' | 'EARLY' | 'OVERTIME' | 'GEOFENCE';

export interface DayRecord {
  key: string;
  staffId: string;
  orgId: string;
  date: string;
  schedule: WorkSchedule;
  scheduled: boolean;
  casual: boolean;
  holiday?: string;
  leave?: string;
  pendingLeave?: string;
  punches: TimePunch[];
  inMin?: number;
  outMin?: number;
  status: DayStatus;
  workedH: number;
  normalH: number;
  ot15: number;
  ot20: number;
  lateMin: number;
  earlyMin: number;
  flags: ExceptionKind[];
}

export interface Suspension {
  staffId: string;
  from: string;
  to: string;
}

export interface DayInput {
  employees: HREmployee[];
  punches: TimePunch[];
  leaveRequests: LeaveRequest[];
  holidays: PublicHoliday[];
  suspensions: Suspension[];
  now: Date;
  /** Converted casuals: still daily-rated before this date */
  casualUntil?: Record<string, string>;
}

export const buildDays = ({ employees, punches, leaveRequests, holidays, suspensions, now, casualUntil = {} }: DayInput): DayRecord[] => {
  const today = isoOf(now);
  const nowAbs = dayNum(today) * 1440 + nowMinutes(now);
  const start = addDays(today, -TIME_RULES.historyDays);
  const approved = leaveIndex(leaveRequests, ['APPROVED']);
  const pending = leaveIndex(leaveRequests, ['PENDING_APPROVAL']);
  const byKey = new Map<string, TimePunch[]>();
  for (const p of punches) {
    const k = `${p.staffId}|${p.date}`;
    byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }
  const out: DayRecord[] = [];
  for (const e of employees) {
    if (!TRACKED_ORGS.includes(e.orgId)) continue;
    if (e.status === 'TERMINATED' && !e.exitDate) continue;
    const from = e.joinedDate > start ? e.joinedDate : start;
    const to = e.exitDate && e.exitDate < today ? e.exitDate : today;
    for (const date of rangeDays(from, to)) {
      const casual = isCasual(e) || (!!casualUntil[e.staffId] && date < casualUntil[e.staffId]);
      const key = `${e.staffId}|${date}`;
      const s = scheduleOn(e, date);
      const hol = holidayOn(date, holidays, e.orgId);
      const d = dow(date);
      const scheduled = s.days.includes(d) && !hol;
      const list = (byKey.get(key) ?? []).slice().sort((a, b) => a.min - b.min);
      const ins = list.filter((p) => p.dir === 'IN');
      const outs = list.filter((p) => p.dir === 'OUT');
      const inMin = ins[0]?.min;
      const outCand = outs.length ? outs[outs.length - 1].min : undefined;
      const outMin = outCand !== undefined && (inMin === undefined || outCand > inMin) ? outCand : undefined;
      const lv = approved(e.staffId, date);
      const pl = pending(e.staffId, date);
      const susp = suspensions.some((x) => x.staffId === e.staffId && x.from <= date && x.to >= date);
      const base = dayNum(date) * 1440;
      const rec: DayRecord = {
        key,
        staffId: e.staffId,
        orgId: e.orgId,
        date,
        schedule: s,
        scheduled,
        casual,
        holiday: hol?.name,
        leave: lv?.leaveType,
        pendingLeave: pl?.leaveType,
        punches: list,
        inMin,
        outMin,
        status: 'OFF',
        workedH: 0,
        normalH: 0,
        ot15: 0,
        ot20: 0,
        lateMin: 0,
        earlyMin: 0,
        flags: []
      };
      if (!list.length) {
        if (lv) rec.status = 'LEAVE';
        else if (susp) rec.status = 'SUSPENDED';
        else if (hol) rec.status = 'HOLIDAY';
        else if (!scheduled) rec.status = 'OFF';
        else if (casual) rec.status = 'NOT_ENGAGED';
        else if (base + s.start + s.graceMin + 120 > nowAbs) rec.status = 'NOT_IN_YET';
        else {
          rec.status = 'ABSENT';
          rec.flags.push('ABSENT');
        }
        out.push(rec);
        continue;
      }
      if (inMin === undefined) {
        rec.status = 'MISSING_IN';
        rec.flags.push('MISSING_IN');
      } else if (outMin === undefined) {
        // Still on shift until a few hours past the scheduled end
        if (base + s.end + 240 > nowAbs) rec.status = 'ON_SITE';
        else {
          rec.status = 'MISSING_OUT';
          rec.flags.push('MISSING_OUT');
        }
      }
      if (inMin !== undefined && scheduled && inMin > s.start + s.graceMin) rec.lateMin = inMin - s.start;
      if (inMin !== undefined && outMin !== undefined) {
        const worked = (outMin - inMin) / 60;
        rec.workedH = Math.round(worked * 100) / 100;
        if (scheduled) {
          rec.normalH = Math.min(worked, s.hoursPerDay);
          if (outMin < s.end - s.graceMin) rec.earlyMin = s.end - outMin;
          const extra = outMin - s.end;
          if (!casual && extra >= TIME_RULES.otThresholdMin) rec.ot15 = floorHalf(extra / 60);
        } else if (!casual) {
          if (d === 0 || hol) rec.ot20 = floorHalf(worked);
          else rec.ot15 = floorHalf(worked);
        }
        if (!rec.flags.length) rec.status = rec.lateMin ? 'LATE' : 'PRESENT';
      } else if (rec.status === 'ON_SITE' && rec.lateMin) {
        rec.flags.push('LATE');
      }
      if (rec.lateMin && !rec.flags.includes('LATE')) rec.flags.push('LATE');
      if (rec.earlyMin) rec.flags.push('EARLY');
      if (rec.ot15 + rec.ot20 > 0) rec.flags.push('OVERTIME');
      if (list.some((p) => p.geo === 'OUTSIDE')) rec.flags.push('GEOFENCE');
      out.push(rec);
    }
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Exceptions and decisions                                            */
/* ------------------------------------------------------------------ */

export type DecisionStatus = 'APPROVED' | 'REJECTED' | 'AUTHORISED' | 'UNAUTHORISED' | 'EXCUSED' | 'FIXED' | 'ACCEPTED' | 'NOTED';

export interface TimeDecision {
  key: string;
  status: DecisionStatus;
  by: string;
  at: string;
  reason: string;
  /** Hours approved (overtime) */
  h15?: number;
  h20?: number;
  reductionId?: string;
  caseId?: string;
  seeded?: boolean;
}

export interface OtSent {
  period: string;
  at: string;
  h15: number;
  h20: number;
  reference: string;
  seeded?: boolean;
}

export interface TimeException {
  key: string;
  kind: ExceptionKind;
  staffId: string;
  orgId: string;
  date: string;
  day: DayRecord;
  detail: string;
}

export const EXCEPTION_LABEL: Record<ExceptionKind, string> = {
  MISSING_OUT: 'Missing punch-out',
  MISSING_IN: 'Missing punch-in',
  ABSENT: 'Absent, no leave',
  LATE: 'Late arrival',
  EARLY: 'Early departure',
  OVERTIME: 'Overtime',
  GEOFENCE: 'Outside geofence'
};

export const exKey = (kind: ExceptionKind, staffId: string, date: string) => `${kind}|${staffId}|${date}`;

const detailOf = (kind: ExceptionKind, d: DayRecord) => {
  switch (kind) {
    case 'MISSING_OUT':
      return `In ${fmtMin(d.inMin ?? 0)}, no punch-out (shift ends ${fmtMin(d.schedule.end)})`;
    case 'MISSING_IN':
      return `Out ${fmtMin(d.outMin ?? 0)}, no punch-in`;
    case 'ABSENT':
      return d.pendingLeave ? `No punches; ${d.pendingLeave.toLowerCase()} request awaiting approval` : `No punches; rostered ${fmtMin(d.schedule.start)}–${fmtMin(d.schedule.end)} (${d.schedule.name.toLowerCase()})`;
    case 'LATE':
      return `In ${fmtMin(d.inMin ?? 0)}, ${d.lateMin} min after ${fmtMin(d.schedule.start)}`;
    case 'EARLY':
      return `Out ${fmtMin(d.outMin ?? 0)}, ${d.earlyMin} min before ${fmtMin(d.schedule.end)}`;
    case 'OVERTIME':
      return `${fmtMin(d.inMin ?? 0)}–${fmtMin(d.outMin ?? 0)} · ${d.ot15 ? `${d.ot15} h at 1.5×` : ''}${d.ot15 && d.ot20 ? ', ' : ''}${d.ot20 ? `${d.ot20} h at 2×` : ''}${d.holiday ? ` (${d.holiday})` : !d.scheduled ? ` (${dow(d.date) === 0 ? 'Sunday' : 'Saturday'})` : ''}`;
    case 'GEOFENCE':
      return 'Mobile punch recorded outside the site geofence';
  }
};

export const exceptionsOf = (days: DayRecord[], from: string): TimeException[] =>
  days
    .filter((d) => d.date >= from && d.flags.length)
    .flatMap((d) => d.flags.map((kind) => ({ key: exKey(kind, d.staffId, d.date), kind, staffId: d.staffId, orgId: d.orgId, date: d.date, day: d, detail: detailOf(kind, d) })));

/** Decisions for history the supervisors had already worked through before the queue window. */
export const seedDecisions = (days: DayRecord[], now: Date): { decisions: Record<string, TimeDecision>; sent: Record<string, OtSent> } => {
  const today = isoOf(now);
  const cutoff = addDays(today, -13);
  const decisions: Record<string, TimeDecision> = {};
  const sent: Record<string, OtSent> = {};
  for (const x of exceptionsOf(days, '0000-00-00')) {
    if (x.date >= cutoff) continue;
    const at = addDays(x.date, 2);
    const base = { key: x.key, by: SUPERVISOR, at, seeded: true };
    if (x.kind === 'OVERTIME') {
      decisions[x.key] = { ...base, status: 'APPROVED', reason: 'Production requirement', h15: x.day.ot15, h20: x.day.ot20 };
      const period = x.date.slice(0, 7);
      sent[x.key] = { period, at: `${period}-20`, h15: x.day.ot15, h20: x.day.ot20, reference: `Paid with the ${period} payroll`, seeded: true };
    } else if (x.kind === 'ABSENT') {
      const unauth = PROFILES[x.staffId] === 'ABSENT';
      decisions[x.key] = { ...base, by: 'Rose Chepkoech', status: unauth ? 'UNAUTHORISED' : 'AUTHORISED', reason: unauth ? 'No reason given; deducted in that month’s payroll' : 'Sick; doctor’s note filed' };
    } else if (x.kind === 'GEOFENCE') decisions[x.key] = { ...base, status: 'ACCEPTED', reason: 'Working at a neighbouring block' };
    else decisions[x.key] = { ...base, status: 'NOTED', reason: 'Reviewed at the weekly attendance check' };
  }
  return { decisions, sent };
};

/* ------------------------------------------------------------------ */
/* Timesheets                                                          */
/* ------------------------------------------------------------------ */

export interface TimesheetRow {
  staffId: string;
  scheduledDays: number;
  daysWorked: number;
  absentDays: number;
  unauthorisedDays: number;
  authorisedDays: number;
  leaveDays: number;
  holidayDays: number;
  workedH: number;
  normalH: number;
  ot15: number;
  ot20: number;
  ot15Approved: number;
  ot20Approved: number;
  otPending: number;
  lateCount: number;
  lateMin: number;
  earlyCount: number;
  missing: number;
}

export const summarise = (staffId: string, days: DayRecord[], decisions: Record<string, TimeDecision>): TimesheetRow => {
  const r: TimesheetRow = { staffId, scheduledDays: 0, daysWorked: 0, absentDays: 0, unauthorisedDays: 0, authorisedDays: 0, leaveDays: 0, holidayDays: 0, workedH: 0, normalH: 0, ot15: 0, ot20: 0, ot15Approved: 0, ot20Approved: 0, otPending: 0, lateCount: 0, lateMin: 0, earlyCount: 0, missing: 0 };
  for (const d of days) {
    if (d.scheduled) r.scheduledDays++;
    if (d.punches.some((p) => p.dir === 'IN')) r.daysWorked++;
    if (d.status === 'LEAVE' && d.scheduled) r.leaveDays++;
    if (d.holiday) r.holidayDays++;
    if (d.status === 'ABSENT') {
      const dec = decisions[exKey('ABSENT', d.staffId, d.date)];
      if (dec?.status === 'AUTHORISED') r.authorisedDays++;
      else {
        r.absentDays++;
        if (dec?.status === 'UNAUTHORISED') r.unauthorisedDays++;
      }
    }
    r.workedH += d.workedH;
    r.normalH += d.normalH;
    r.ot15 += d.ot15;
    r.ot20 += d.ot20;
    if (d.ot15 + d.ot20 > 0) {
      const dec = decisions[exKey('OVERTIME', d.staffId, d.date)];
      if (dec?.status === 'APPROVED') {
        r.ot15Approved += dec.h15 ?? d.ot15;
        r.ot20Approved += dec.h20 ?? d.ot20;
      } else if (!dec) r.otPending += d.ot15 + d.ot20;
    }
    if (d.lateMin) {
      r.lateCount++;
      r.lateMin += d.lateMin;
    }
    if (d.earlyMin) r.earlyCount++;
    if (d.status === 'MISSING_OUT' || d.status === 'MISSING_IN') r.missing++;
  }
  return r;
};

/* ------------------------------------------------------------------ */
/* Casual service (Employment Act s.37)                                */
/* ------------------------------------------------------------------ */

export type ServiceState = 'OK' | 'WATCH' | 'HOLD' | 'CONVERT';

export interface CasualService {
  staffId: string;
  daysLast30: number;
  daysLast60: number;
  /** First day of the current unbroken engagement (no gap longer than 7 days) */
  engagedSince?: string;
  /** Working days in that engagement */
  aggregateDays: number;
  /** Calendar span of that engagement */
  spanDays: number;
  state: ServiceState;
  reason: string;
}

export const S37 = { monthDays: 26, threeMonthsSpan: 90, breakDays: 7 };

export const casualService = (staffId: string, days: DayRecord[], today: string, thresholdDays = S37.monthDays): CasualService => {
  const worked = days.filter((d) => d.punches.some((p) => p.dir === 'IN')).map((d) => d.date).sort();
  const last30 = worked.filter((d) => d > addDays(today, -30)).length;
  const last60 = worked.filter((d) => d > addDays(today, -60)).length;
  let since: string | undefined;
  let agg = 0;
  for (let i = worked.length - 1; i >= 0; i--) {
    const next = i < worked.length - 1 ? worked[i + 1] : today;
    if (i < worked.length - 1 && daysBetween(worked[i], next) > S37.breakDays) break;
    if (i === worked.length - 1 && daysBetween(worked[i], today) > S37.breakDays) break;
    since = worked[i];
    agg++;
  }
  const span = since ? daysBetween(since, today) + 1 : 0;
  let state: ServiceState = 'OK';
  let reason = agg ? `${agg} working days since ${fmtDate(since!)}` : 'Not engaged in the last week';
  if (agg >= thresholdDays) {
    state = 'CONVERT';
    reason = `${agg} continuous working days, past one month (s.37(1)(a))`;
  } else if (span >= S37.threeMonthsSpan) {
    state = 'CONVERT';
    reason = `Engaged without a break for ${span} days, three months or more (s.37(1)(b))`;
  } else if (agg >= thresholdDays - 3) {
    state = 'HOLD';
    reason = `${agg} of ${thresholdDays} days; ${thresholdDays - agg} more and terms convert`;
  } else if (agg >= thresholdDays - 8) {
    state = 'WATCH';
  }
  return { staffId, daysLast30: last30, daysLast60: last60, engagedSince: since, aggregateDays: agg, spanDays: span, state, reason };
};

/** Days worked per Monday-starting week. */
export const weeklyDays = (days: DayRecord[]) => {
  const m = new Map<string, number>();
  for (const d of days) if (d.punches.some((p) => p.dir === 'IN')) m.set(weekStart(d.date), (m.get(weekStart(d.date)) ?? 0) + 1);
  return m;
};

export const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\n');

export const downloadCsv = (name: string, rows: (string | number)[][]) => {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/* ------------------------------------------------------------------ */
/* Overtime amounts (worked out by the payroll pay item formula)       */
/* ------------------------------------------------------------------ */

export const OT_COMPONENT = { h15: 'OT_EXTRA', h20: 'HOLIDAY_OT' } as const;

/** Preview of what payroll will pay for the hours, using the pay item's own formula. */
export const otAmount = (e: HREmployee, period: { year: number; month: number; key: string }, componentId: string, hours: number) => {
  if (!hours) return 0;
  try {
    return calcAmount(componentAt(componentId, period.key).calc, formulaVars(e, period.year, period.month), hours);
  } catch {
    return 0;
  }
};
