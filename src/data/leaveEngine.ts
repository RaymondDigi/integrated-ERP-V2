import type { HREmployee, LeaveRequest } from '../types';
import {
  AL_CLOSING_2025,
  DEFAULT_POLICY,
  DEFAULT_PROBATION_MONTHS,
  HOLIDAY_ATTENDANCE,
  INITIAL_ELIGIBILITY_OVERRIDES,
  INITIAL_ENTITLEMENT_MATRIX,
  INITIAL_LEAVE_ADJUSTMENTS,
  INITIAL_LEAVE_TYPE_VERSIONS,
  INITIAL_POLICY_VERSIONS,
  INITIAL_TENURE_BANDS,
  LEAVE_CODE,
  PUBLIC_HOLIDAYS_KE,
  STATUTORY_MINIMUMS,
  type ApprovalStep,
  type ContractColumn,
  type EligibilityOverride,
  type EntitlementCell,
  type EntitlementMatrix,
  type EntitlementRow,
  type HolidayWork,
  type LeaveAdjustment,
  type LeaveCode,
  type LeavePolicy,
  type LeaveTypeName,
  type LeaveTypeVersion,
  type PolicyVersion,
  type PublicHoliday,
  type TenureBand
} from './leaveConfig';

/**
 * Leave engine. Pure functions: every balance is the sum of ledger rows, and the
 * ledger is derived from configuration, seed balances, holiday attendance,
 * HR adjustments and leave requests. Nothing is stored or typed in.
 */

/* ------------------------------------------------------------------ */
/* Configuration bundle                                                 */
/* ------------------------------------------------------------------ */

export interface LeaveEngineConfig {
  types: LeaveTypeVersion[];
  policies: PolicyVersion[];
  matrix: EntitlementMatrix;
  bands: TenureBand[];
  holidays: PublicHoliday[];
  attendance: HolidayWork[];
  adjustments: LeaveAdjustment[];
  overrides: EligibilityOverride[];
  /** Annual leave closing balances at 31 Dec 2025 (migrated) */
  closing2025: Record<string, number>;
  closedYears: number[];
}

export const DEFAULT_LEAVE_CONFIG: LeaveEngineConfig = {
  types: INITIAL_LEAVE_TYPE_VERSIONS,
  policies: INITIAL_POLICY_VERSIONS,
  matrix: INITIAL_ENTITLEMENT_MATRIX,
  bands: INITIAL_TENURE_BANDS,
  holidays: PUBLIC_HOLIDAYS_KE,
  attendance: HOLIDAY_ATTENDANCE,
  adjustments: INITIAL_LEAVE_ADJUSTMENTS,
  overrides: INITIAL_ELIGIBILITY_OVERRIDES,
  closing2025: AL_CLOSING_2025,
  closedYears: [2025]
};

/** First leave year kept on this system; earlier years arrive as migrated closing balances. */
export const FIRST_LEDGER_YEAR = 2026;

/* ------------------------------------------------------------------ */
/* Dates                                                                */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date as YYYY-MM-DD (not UTC). */
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoDay(new Date());
const parse = (iso: string) => new Date(`${iso}T00:00:00`);
export const addDays = (iso: string, n: number) => {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};
export const addMonths = (iso: string, n: number) => {
  const d = parse(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return isoDay(d);
};
/** Whole days from a to b (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
const yearOf = (iso: string) => Number(iso.slice(0, 4));
const yearStart = (y: number) => `${y}-01-01`;
const yearEnd = (y: number) => `${y}-12-31`;
const daysInYear = (y: number) => daysBetween(yearStart(y), yearStart(y + 1));
const maxIso = (a: string, b: string) => (a > b ? a : b);
const minIso = (a: string, b: string) => (a < b ? a : b);
/** Inclusive overlap in calendar days of [a1,a2] and [b1,b2]. */
const overlapDays = (a1: string, a2: string, b1: string, b2: string) => {
  const s = maxIso(a1, b1);
  const e = minIso(a2, b2);
  return e < s ? 0 : daysBetween(s, e) + 1;
};

export const r2 = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ */
/* Config lookups                                                       */
/* ------------------------------------------------------------------ */

/** The leave type version in force on a date (falls back to the earliest). */
export const typeAt = (code: LeaveCode, date: string, cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG): LeaveTypeVersion => {
  const versions = cfg.types.filter((t) => t.code === code).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const inForce = versions.filter((t) => t.effectiveFrom <= date && (!t.effectiveTo || t.effectiveTo >= date));
  return inForce[inForce.length - 1] ?? versions[versions.length - 1] ?? versions[0];
};

/** Every leave type code in the configuration (built-in and custom), in set-up order. */
export const leaveCodes = (cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG): LeaveCode[] => [...new Set(cfg.types.map((t) => t.code))];

/** Current name of a leave type. */
export const leaveName = (code: LeaveCode, cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG): LeaveTypeName => {
  const vs = cfg.types.filter((t) => t.code === code).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return vs[vs.length - 1]?.name ?? code;
};

/** Code for a leave type name (as stored on requests). */
export const codeOf = (name: string, cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG): LeaveCode =>
  cfg.types.find((t) => t.name.toLowerCase() === name.toLowerCase())?.code ?? LEAVE_CODE[name] ?? 'AL';

const NO_CELL: EntitlementCell = { days: 0, accrual: false, usableFrom: 'HIRE' };
/** Matrix row for a type; a type without a row has no entitlement. */
export const matrixRow = (cfg: LeaveEngineConfig, code: LeaveCode): EntitlementRow =>
  cfg.matrix[code] ?? { PERMANENT: NO_CELL, FIXED_TERM: NO_CELL, PROBATION: NO_CELL, CASUAL: NO_CELL };

/** The type credited for public holidays worked (Holiday Off). */
export const holidayCreditCode = (cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG): LeaveCode =>
  cfg.types.find((t) => t.deriveFromHolidays && t.status === 'Active')?.code ?? 'CO';

/** Company policy in force on a date. */
export const policyAt = (date: string, cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG): LeavePolicy => {
  const sorted = [...cfg.policies].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const inForce = sorted.filter((p) => p.effectiveFrom <= date);
  return (inForce[inForce.length - 1] ?? sorted[0])?.values ?? DEFAULT_POLICY;
};

const num = (v: string) => Number(v) || 0;
export const maxCarryForward = (t: LeaveTypeVersion, p: LeavePolicy) => t.maxCarryForward ?? num(p.maxCarryForward);
export const carryForwardMonths = (t: LeaveTypeVersion, p: LeavePolicy) => t.carryForwardExpiryMonths ?? num(p.carryForwardExpiryMonths);
export const holidayCreditDays = (t: LeaveTypeVersion, p: LeavePolicy) => t.forfeitAfterDays ?? num(p.holidayCreditExpiryDays);

/** The day off for a holiday (observed date when set). */
export const observedDate = (h: PublicHoliday) => h.observed || h.date;
/** A holiday applies to all sites or to one company. */
export const holidayApplies = (h: PublicHoliday, orgId?: string) => h.location === 'ALL' || !orgId || h.location === orgId;

const holidaySet = (cfg: LeaveEngineConfig, gazettedBy?: string, orgId?: string) =>
  new Set(cfg.holidays.filter((h) => holidayApplies(h, orgId) && (!gazettedBy || !h.gazettedOn || h.gazettedOn <= gazettedBy)).map(observedDate));

export const holidayOn = (iso: string, cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG, orgId?: string) =>
  cfg.holidays.find((h) => observedDate(h) === iso && holidayApplies(h, orgId));

export const isWorkingDay = (iso: string, cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG, orgId?: string) => {
  const dow = parse(iso).getDay();
  return dow !== 0 && dow !== 6 && !holidayOn(iso, cfg, orgId);
};

/**
 * Days a request counts for. Working-day basis skips weekends and gazetted
 * holidays; calendar basis counts every day. A half day is 0.5.
 */
export const countLeaveDays = (
  startDate: string,
  endDate: string,
  basis: LeaveTypeVersion['countBasis'] = 'Working days',
  cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG,
  halfDay = false,
  gazettedBy?: string,
  orgId?: string
) => {
  if (!startDate || !endDate || endDate < startDate) return 0;
  if (basis === 'Calendar days') return halfDay && startDate === endDate ? 0.5 : daysBetween(startDate, endDate) + 1;
  const hol = holidaySet(cfg, gazettedBy, orgId);
  let days = 0;
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    const dow = parse(d).getDay();
    if (dow !== 0 && dow !== 6 && !hol.has(d)) days++;
  }
  return halfDay && startDate === endDate && days === 1 ? 0.5 : days;
};

/** Days for a request of a given type (uses the type's count basis on the start date). */
export const requestDays = (code: LeaveCode, startDate: string, endDate: string, halfDay = false, cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG, orgId?: string) =>
  countLeaveDays(startDate, endDate, typeAt(code, startDate || todayIso(), cfg).countBasis, cfg, halfDay, undefined, orgId);

/* ------------------------------------------------------------------ */
/* Employee facts                                                       */
/* ------------------------------------------------------------------ */

const CASUAL_CONTRACTS = ['Daily-Rated Contract', 'Output-Based Contract'];
export const isCasual = (e: HREmployee) => CASUAL_CONTRACTS.includes(e.contractType);
export const isFixedTerm = (e: HREmployee) => e.contractType === 'Fixed-Term Contract';

export const probationEnd = (e: HREmployee) =>
  isCasual(e) ? e.joinedDate : addDays(addMonths(e.joinedDate, e.probationMonths ?? DEFAULT_PROBATION_MONTHS), -1);

/** Last day of service: exit date, or the end of a fixed-term contract. */
export const serviceEnd = (e: HREmployee) => {
  const ends = [e.exitDate, isFixedTerm(e) ? e.contractEndDate : undefined].filter(Boolean) as string[];
  return ends.length ? ends.sort()[0] : undefined;
};

export const contractColumn = (e: HREmployee, date: string): ContractColumn => {
  if (isCasual(e)) return 'CASUAL';
  if (date <= probationEnd(e)) return 'PROBATION';
  return isFixedTerm(e) ? 'FIXED_TERM' : 'PERMANENT';
};

export const COLUMN_LABEL: Record<ContractColumn, string> = {
  PERMANENT: 'Permanent',
  FIXED_TERM: 'Fixed-term',
  PROBATION: 'Probation',
  CASUAL: 'Casual / intern'
};

const reqCode = (r: LeaveRequest, cfg: LeaveEngineConfig): LeaveCode => codeOf(r.leaveType, cfg);
/** Approved leave without pay (pauses accrual, excluded from tenure). */
const isUnpaid = (r: LeaveRequest, cfg: LeaveEngineConfig) => r.status === 'APPROVED' && !typeAt(reqCode(r, cfg), r.startDate, cfg).isPaid;

/** Calendar days of approved unpaid leave on or before a date. */
const unpaidDaysUntil = (e: HREmployee, requests: LeaveRequest[], until: string, cfg: LeaveEngineConfig) =>
  requests
    .filter((r) => r.staffId === e.staffId && isUnpaid(r, cfg) && r.startDate <= until)
    .reduce((s, r) => s + overlapDays(r.startDate, r.endDate, r.startDate, until), 0);

/** Years of service: (date − service start − excluded unpaid days) / 365.25. */
export const tenureYears = (e: HREmployee, date: string, requests: LeaveRequest[] = [], cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG) => {
  if (date < e.joinedDate) return 0;
  const excluded = policyAt(date, cfg).unpaidOnTenure === 'Excluded' ? unpaidDaysUntil(e, requests, date, cfg) : 0;
  return Math.max(0, (daysBetween(e.joinedDate, date) - excluded) / 365.25);
};

export const bandFor = (code: LeaveCode, column: ContractColumn, years: number, cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG) => {
  if (policyAt(todayIso(), cfg).tenureSource === 'Not used') return undefined;
  // Probation staff are on the permanent bands once confirmed; while on probation tenure is under a year anyway
  const col = column === 'PROBATION' ? 'PERMANENT' : column;
  return cfg.bands.find((b) => b.code === code && b.column === col && years >= b.fromYears && (b.toYears === null || years < b.toYears));
};

export interface Entitlement {
  code: LeaveCode;
  year: number;
  column: ContractColumn;
  cell: EntitlementCell;
  base: number;
  bonus: number;
  /** Full-year entitlement: base + tenure bonus (capped) */
  total: number;
  /** Share of the year the employee is in service (earned types are pro-rated by it) */
  serviceShare: number;
  proRated: number;
  tenureYears: number;
  band?: TenureBand;
}

/** Entitlement for a leave year: contract-type base + tenure bonus, pro-rated for joiners, leavers and fixed terms. */
export const entitlementFor = (
  e: HREmployee,
  code: LeaveCode,
  year: number,
  requests: LeaveRequest[] = [],
  cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG,
  onDate?: string
): Entitlement => {
  const ys = yearStart(year);
  const ye = yearEnd(year);
  const at = onDate ?? maxIso(ys, e.joinedDate);
  const column = contractColumn(e, at);
  // Earned leave during probation is set by the confirmed column, since it becomes usable on confirmation
  const effCol: ContractColumn = column === 'PROBATION' && matrixRow(cfg, code).PROBATION.accrual ? (isFixedTerm(e) ? 'FIXED_TERM' : 'PERMANENT') : column;
  const cell = matrixRow(cfg, code)[column];
  const base = matrixRow(cfg, code)[effCol].days ?? 0;
  const policy = policyAt(ys, cfg);
  const yearsAtStart = tenureYears(e, ys, requests, cfg);
  let bonus = bandFor(code, effCol, yearsAtStart, cfg)?.bonusDays ?? 0;
  if (policy.tenureBonusTiming === 'Pro-rate from anniversary') {
    const atEnd = bandFor(code, effCol, tenureYears(e, ye, requests, cfg), cfg);
    if (atEnd && atEnd.bonusDays > bonus) {
      const crossing = addDays(e.joinedDate, Math.ceil(atEnd.fromYears * 365.25));
      const share = crossing > ye ? 0 : (daysBetween(maxIso(crossing, ys), ye) + 1) / daysInYear(year);
      bonus = r2(bonus + (atEnd.bonusDays - bonus) * share);
    }
  }
  const band = bandFor(code, effCol, yearsAtStart, cfg);
  const total = base === 0 ? 0 : band?.cap ? Math.min(base + bonus, band.cap) : base + bonus;
  const from = maxIso(ys, e.joinedDate);
  const end = serviceEnd(e);
  const to = end ? minIso(ye, end) : ye;
  const serviceShare = to < from ? 0 : (daysBetween(from, to) + 1) / daysInYear(year);
  const earned = typeAt(code, at, cfg).mode === 'EARNED';
  return { code, year, column, cell, base, bonus, total, serviceShare, proRated: earned ? r2(total * serviceShare) : total, tenureYears: r2(yearsAtStart), band };
};

/** Date from which a type is usable under the matrix (hire, end of probation, or after N months). */
export const usableFromDate = (e: HREmployee, code: LeaveCode, cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG, on: string = todayIso()) => {
  const column = contractColumn(e, on);
  const cell = matrixRow(cfg, code)[column];
  if (cell.usableFrom === 'AFTER_PROBATION') return addDays(probationEnd(e), 1);
  if (cell.usableFrom === 'AFTER_MONTHS') return addMonths(e.joinedDate, cell.usableAfterMonths ?? 0);
  return e.joinedDate;
};

export const genderEligible = (e: HREmployee, code: LeaveCode, date: string, cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG) => {
  const t = typeAt(code, date, cfg);
  if (t.gender === 'All') return { ok: true as const };
  const override = cfg.overrides.find((o) => o.staffId === e.staffId && o.code === code);
  if (override) return { ok: true as const, override };
  if (!e.gender) return { ok: false as const, reason: `${t.name} is for ${t.gender.toLowerCase()} employees and no gender is recorded for ${e.fullName}.` };
  if (e.gender !== t.gender) return { ok: false as const, reason: `${t.name} is for ${t.gender.toLowerCase()} employees only.` };
  return { ok: true as const };
};

/** Leave types the employee can apply for (gender, contract and active status). */
export const eligibleCodes = (e: HREmployee, date: string = todayIso(), cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG): LeaveCode[] =>
  leaveCodes(cfg).filter((code) => {
    const t = typeAt(code, date, cfg);
    if (t.status !== 'Active' || !genderEligible(e, code, date, cfg).ok) return false;
    if (t.mode === 'AWARDED' || t.mode === 'UNTRACKED') return true;
    return (matrixRow(cfg, code)[contractColumn(e, date)].days ?? 0) > 0;
  });

/* ------------------------------------------------------------------ */
/* Ledger                                                               */
/* ------------------------------------------------------------------ */

export type LedgerTxn =
  | 'OPENING'
  | 'GRANT'
  | 'ACCRUAL'
  | 'CARRY_FORWARD'
  | 'HOLIDAY_AWARD'
  | 'ADJUSTMENT'
  | 'RESERVED'
  | 'TAKEN'
  | 'CANCELLED'
  | 'FORFEIT'
  | 'ENCASHMENT';

export interface LedgerRow {
  id: string;
  staffId: string;
  code: LeaveCode;
  leaveYear: number;
  date: string;
  days: number;
  txn: LedgerTxn;
  sourceRef: string;
  expiry?: string;
  createdBy: string;
  createdAt: string;
  note: string;
  /** CANCELLED rows: which debit they give back */
  offsets?: 'TAKEN' | 'RESERVED';
}

/** A credit lot. Debits consume the lot that expires first. */
interface Bucket {
  id: string;
  code: LeaveCode;
  amount: number;
  remaining: number;
  /** null = lasts to the year-end close */
  expiry: string | null;
  sourceRef: string;
  label: string;
  date: string;
  used: number;
  forfeited: number;
  holidayDate?: string;
}

interface Event {
  date: string;
  rank: number;
  run: () => void;
}

export interface LedgerResult {
  rows: LedgerRow[];
  buckets: Bucket[];
}

const SYSTEM = 'System';

/** Debit date of a request (TAKEN replaces RESERVED at the final approval). */
const approvalDate = (r: LeaveRequest) => {
  const finals = (r.approvals ?? []).filter((a) => a.action === 'APPROVED');
  return finals[finals.length - 1]?.at ?? r.decidedOn ?? r.appliedOn ?? r.startDate;
};

const closingFor2025 = (e: HREmployee, cfg: LeaveEngineConfig) => {
  if (e.joinedDate >= yearStart(FIRST_LEDGER_YEAR) || isCasual(e)) return 0;
  if (cfg.closing2025[e.staffId] !== undefined) return cfg.closing2025[e.staffId];
  const n = Number(e.staffId.replace(/\D/g, '')) || 0;
  return (n * 37) % 13;
};

/**
 * Builds one leave type's ledger for an employee, from the first ledger year up
 * to `asOf`, and runs the lots so expiry and year-end forfeitures are exact.
 */
export const typeLedger = (
  e: HREmployee,
  code: LeaveCode,
  requests: LeaveRequest[],
  adjustments: LeaveAdjustment[] = DEFAULT_LEAVE_CONFIG.adjustments,
  asOf: string = todayIso(),
  cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG
): LedgerResult => {
  const rows: LedgerRow[] = [];
  const buckets: Bucket[] = [];
  const events: Event[] = [];
  const mine = requests.filter((r) => r.staffId === e.staffId);
  const lastYear = yearOf(asOf);
  const end = serviceEnd(e);
  let seq = 0;
  let deficit = 0;
  const allocations = new Map<string, { bucket: Bucket; days: number }[]>();

  const post = (row: Omit<LedgerRow, 'id' | 'staffId' | 'code' | 'createdAt'> & { createdAt?: string }) => {
    rows.push({ ...row, id: `${e.staffId}-${code}-${++seq}`, staffId: e.staffId, code, createdAt: row.createdAt ?? row.date });
  };
  const at = (date: string, rank: number, run: () => void) => {
    if (date <= asOf) events.push({ date, rank, run });
  };
  const live = (date: string) => buckets.filter((b) => b.remaining > 0 && (b.expiry === null || b.expiry >= date));
  const credit = (b: Omit<Bucket, 'remaining' | 'used' | 'forfeited' | 'code'>) => {
    const bucket: Bucket = { ...b, code, remaining: b.amount, used: 0, forfeited: 0 };
    // A negative balance is recovered from the next credit
    if (deficit > 0) {
      const take = Math.min(deficit, bucket.remaining);
      bucket.remaining = r2(bucket.remaining - take);
      deficit = r2(deficit - take);
    }
    buckets.push(bucket);
    return bucket;
  };
  const debit = (date: string, days: number, key?: string) => {
    let left = days;
    const alloc: { bucket: Bucket; days: number }[] = [];
    const order = live(date).sort((a, b) => (a.expiry ?? '9999').localeCompare(b.expiry ?? '9999') || a.date.localeCompare(b.date));
    for (const b of order) {
      if (left <= 0) break;
      const take = Math.min(b.remaining, left);
      b.remaining = r2(b.remaining - take);
      b.used = r2(b.used + take);
      left = r2(left - take);
      alloc.push({ bucket: b, days: take });
    }
    if (left > 0) deficit = r2(deficit + left);
    if (key) allocations.set(key, alloc);
  };
  const giveBack = (date: string, days: number, key: string, label: string) => {
    let left = days;
    for (const a of allocations.get(key) ?? []) {
      if (a.bucket.expiry !== null && a.bucket.expiry < date) continue;
      a.bucket.remaining = r2(a.bucket.remaining + a.days);
      a.bucket.used = r2(a.bucket.used - a.days);
      left = r2(left - a.days);
    }
    if (left > 0) credit({ id: `${key}-back`, amount: left, expiry: null, sourceRef: key, label, date });
  };
  const balanceNow = () => r2(buckets.reduce((s, b) => s + b.remaining, 0) - deficit);

  const t0 = typeAt(code, asOf, cfg);
  const tracked = t0.mode !== 'UNTRACKED';
  const genderOk = genderEligible(e, code, asOf, cfg).ok;

  /* Migrated 2025 closing balance and its year-end close */
  if (code === 'AL' && tracked) {
    const closing = closingFor2025(e, cfg);
    if (closing !== 0) {
      const t = typeAt(code, yearEnd(FIRST_LEDGER_YEAR - 1), cfg);
      const p = policyAt(yearEnd(FIRST_LEDGER_YEAR - 1), cfg);
      post({ leaveYear: FIRST_LEDGER_YEAR - 1, date: yearEnd(FIRST_LEDGER_YEAR - 1), days: closing, txn: 'OPENING', sourceRef: 'MIGRATION-2025', createdBy: 'Data migration', note: 'Closing balance at 31 Dec 2025 brought over from the old system' });
      credit({ id: 'MIG-2025', amount: closing, expiry: null, sourceRef: 'MIGRATION-2025', label: '2025 closing balance', date: yearEnd(FIRST_LEDGER_YEAR - 1) });
      closeYear(FIRST_LEDGER_YEAR - 1, t, p);
    }
  }

  function closeYear(year: number, t: LeaveTypeVersion, p: LeavePolicy) {
    const closing = balanceNow();
    const ye = yearEnd(year);
    const next = year + 1;
    const ref = `YE-${year}`;
    if (!t.isAnnual || (!t.allowCarryForward && !t.isForfeitable)) return;
    buckets.forEach((b) => (b.remaining = 0));
    deficit = 0;
    if (t.allowCarryForward) {
      const cap = maxCarryForward(t, p);
      const carried = closing <= 0 ? closing : t.isForfeitable ? Math.min(closing, cap) : closing;
      const lost = r2(closing - carried);
      if (lost > 0)
        post({
          leaveYear: year,
          date: ye,
          days: -lost,
          txn: p.encashment === 'Allowed' ? 'ENCASHMENT' : 'FORFEIT',
          sourceRef: ref,
          createdBy: SYSTEM,
          note: `Year-end: closing ${closing} less ${cap}-day carry-forward cap`
        });
      if (carried !== 0) {
        post({ leaveYear: year, date: ye, days: -carried, txn: 'CARRY_FORWARD', sourceRef: ref, createdBy: SYSTEM, note: `Carried to ${next}` });
        const months = carryForwardMonths(t, p);
        const expiry = months > 0 && carried > 0 ? addDays(addMonths(yearStart(next), months), -1) : undefined;
        post({ leaveYear: next, date: yearStart(next), days: carried, txn: 'CARRY_FORWARD', sourceRef: ref, expiry, createdBy: SYSTEM, note: `Carried from ${year} (closing ${closing}, cap ${cap})` });
        if (carried > 0) {
          const b = credit({ id: `CF-${next}`, amount: carried, expiry: expiry ?? null, sourceRef: ref, label: `Carried from ${year}`, date: yearStart(next) });
          if (expiry) expireAt(b, next);
        } else deficit = -carried;
      }
    } else if (closing > 0 && t.isForfeitable) {
      post({ leaveYear: year, date: ye, days: -closing, txn: p.encashment === 'Allowed' && t.code === 'AL' ? 'ENCASHMENT' : 'FORFEIT', sourceRef: ref, createdBy: SYSTEM, note: 'Unused balance lapses at year-end' });
    }
  }

  function expireAt(b: Bucket, leaveYear: number) {
    if (!b.expiry) return;
    const exp = b.expiry;
    at(exp, 2, () => {
      if (b.remaining <= 0) return;
      const lost = b.remaining;
      const p = policyAt(exp, cfg);
      b.forfeited = r2(b.forfeited + lost);
      b.remaining = 0;
      post({
        leaveYear,
        date: exp,
        days: -lost,
        txn: p.encashment === 'Allowed' && code === 'AL' ? 'ENCASHMENT' : 'FORFEIT',
        sourceRef: `${b.sourceRef}/EXP`,
        createdBy: 'Expiry job',
        note: `${b.label}: unused days expired ${exp}`
      });
    });
  }

  const startYear = Math.max(FIRST_LEDGER_YEAR, yearOf(e.joinedDate));
  for (let year = startYear; year <= lastYear; year++) {
    const ys = yearStart(year);
    const ye = yearEnd(year);
    const from = maxIso(ys, e.joinedDate);
    const to = end ? minIso(ye, end) : ye;
    if (to < from) break;
    const t = typeAt(code, from, cfg);

    /* Earned: accrual per period, pro-rated for days in service, paused on unpaid leave */
    if (tracked && t.mode === 'EARNED') {
      const periods = t.accrualFrequency === 'Quarterly' ? 4 : t.accrualFrequency === 'Annually' ? 1 : 12;
      const step = 12 / periods;
      let cum = 0;
      let posted = 0;
      for (let k = 0; k < periods; k++) {
        const pStart = addMonths(ys, k * step);
        const pEnd = addDays(addMonths(ys, (k + 1) * step), -1);
        const inService = overlapDays(pStart, pEnd, from, to);
        if (inService <= 0) continue;
        const col = contractColumn(e, pEnd < from ? from : minIso(pEnd, to));
        if (col === 'PROBATION' && policyAt(pEnd, cfg).probationUse === 'No accrual') continue;
        const ent = entitlementFor(e, code, year, requests, cfg, minIso(pEnd, to));
        if (!ent.cell.accrual && ent.column !== 'PROBATION') continue;
        const unpaid =
          policyAt(pEnd, cfg).unpaidOnAccrual === 'Paused'
            ? mine.filter((r) => isUnpaid(r, cfg)).reduce((s, r) => s + overlapDays(r.startDate, r.endDate, maxIso(pStart, from), minIso(pEnd, to)), 0)
            : 0;
        const share = Math.max(0, inService - unpaid) / (daysBetween(pStart, pEnd) + 1);
        cum += (ent.total / periods) * share;
        const amount = r2(r2(cum) - posted);
        posted = r2(posted + amount);
        const postDate = pEnd > to ? to : pEnd;
        if (amount <= 0 || postDate > asOf) continue;
        const label = `${parse(pStart).toLocaleString('en-GB', { month: 'short' })} ${year}`;
        const note =
          share < 1
            ? `${label} accrual, ${Math.round(share * 100)}% of the period${unpaid ? ` (${unpaid} unpaid days)` : ''}`
            : `${label} accrual (${ent.total} days ÷ ${periods})`;
        at(postDate, 0, () => {
          post({ leaveYear: year, date: postDate, days: amount, txn: 'ACCRUAL', sourceRef: `ACR-${postDate.slice(0, 7)}`, createdBy: 'Accrual job', note });
          credit({ id: `ACR-${postDate}`, amount, expiry: null, sourceRef: `ACR-${postDate.slice(0, 7)}`, label, date: postDate });
        });
      }
    }

    /* Granted up front: full on the first day of the year or of eligibility; top-up when the contract column changes */
    if (tracked && t.mode === 'GRANTED' && genderOk) {
      const ent = entitlementFor(e, code, year, requests, cfg, from);
      const usable = maxIso(from, usableFromDate(e, code, cfg, from));
      const grantDate = ent.cell.usableFrom === 'AFTER_MONTHS' ? usable : from;
      if (ent.total > 0 && grantDate <= to) {
        at(grantDate, 0, () => {
          post({ leaveYear: year, date: grantDate, days: ent.total, txn: 'GRANT', sourceRef: `GR-${year}`, createdBy: SYSTEM, note: `${COLUMN_LABEL[ent.column]} entitlement${ent.bonus ? ` incl. ${ent.bonus}-day tenure bonus` : ''}` });
          credit({ id: `GR-${year}`, amount: ent.total, expiry: null, sourceRef: `GR-${year}`, label: `${year} grant`, date: grantDate });
        });
      }
      const confirmed = addDays(probationEnd(e), 1);
      if (ent.column === 'PROBATION' && confirmed > from && confirmed <= to) {
        const after = entitlementFor(e, code, year, requests, cfg, confirmed);
        const topUp = r2(after.total - ent.total);
        if (topUp > 0)
          at(confirmed, 0, () => {
            post({ leaveYear: year, date: confirmed, days: topUp, txn: 'GRANT', sourceRef: `GR-${year}-CONF`, createdBy: SYSTEM, note: `Confirmed: ${COLUMN_LABEL[after.column]} entitlement replaces probation` });
            credit({ id: `GR-${year}-CONF`, amount: topUp, expiry: null, sourceRef: `GR-${year}-CONF`, label: 'Top-up on confirmation', date: confirmed });
          });
      }
    }

    /* Year-end close once the year is over */
    if (tracked && t.isAnnual && year < lastYear) {
      const tClose = typeAt(code, ye, cfg);
      const pClose = policyAt(ye, cfg);
      at(ye, 3, () => closeYear(year, tClose, pClose));
    }
  }

  /* Awarded: holiday worked → credit with its own expiry */
  if (tracked && t0.mode === 'AWARDED' && t0.deriveFromHolidays) {
    const seen = new Set<string>();
    for (const w of cfg.attendance.filter((a) => a.staffId === e.staffId)) {
      if (seen.has(w.holidayDate)) continue;
      seen.add(w.holidayDate);
      const h = holidayOn(w.holidayDate, cfg, e.orgId);
      if (!h || w.holidayDate < e.joinedDate || (end && w.holidayDate > end)) continue;
      const p = policyAt(w.holidayDate, cfg);
      if (p.holidayCompensation === 'Pay only') continue;
      const t = typeAt(code, w.holidayDate, cfg);
      const days = r2(w.worked * num(p.holidayCreditPerDay));
      const expiry = addDays(w.holidayDate, holidayCreditDays(t, p));
      const ref = `HOL-${w.holidayDate}`;
      at(w.holidayDate, 0, () => {
        post({ leaveYear: yearOf(w.holidayDate), date: w.holidayDate, days, txn: 'HOLIDAY_AWARD', sourceRef: ref, expiry, createdBy: 'Holiday credit job', note: `${h.name} worked (${w.worked === 1 ? 'full day' : 'half day'}, ${w.source.toLowerCase()})` });
        const b = credit({ id: ref, amount: days, expiry, sourceRef: ref, label: h.name, date: w.holidayDate, holidayDate: w.holidayDate });
        expireAt(b, yearOf(w.holidayDate));
      });
    }
  }

  /* HR adjustments */
  if (tracked)
    for (const a of adjustments.filter((x) => x.staffId === e.staffId && x.code === code)) {
      at(a.date, a.days >= 0 ? 0 : 1, () => {
        post({ leaveYear: yearOf(a.date), date: a.date, days: a.days, txn: 'ADJUSTMENT', sourceRef: a.id, createdBy: a.by, note: a.reason });
        if (a.days >= 0) credit({ id: a.id, amount: a.days, expiry: null, sourceRef: a.id, label: 'HR adjustment', date: a.date });
        else debit(a.date, -a.days);
      });
    }

  /* Requests */
  for (const r of mine.filter((x) => reqCode(x, cfg) === code)) {
    const leaveYear = yearOf(r.startDate);
    const applied = r.appliedOn ?? minIso(r.startDate, todayIso());
    const post1 = (date: string, days: number, txn: LedgerTxn, note: string, by: string, offsets?: LedgerRow['offsets']) =>
      post({ leaveYear, date, days, txn, sourceRef: r.id, createdBy: by, note, offsets });
    const reserve = () =>
      at(applied, 1, () => {
        post1(applied, -r.daysCount, 'RESERVED', `${r.startDate} to ${r.endDate}, awaiting ${r.currentStep === 'HR' ? 'HR' : 'supervisor'}`, r.staffName);
        if (tracked) debit(applied, r.daysCount, r.id);
      });
    const take = (date: string) =>
      at(date, 1, () => {
        post1(date, -r.daysCount, 'TAKEN', `${r.startDate} to ${r.endDate}`, r.approverName ?? 'Approver');
        if (tracked) debit(date, r.daysCount, r.id);
      });
    const release = (date: string, offsets: 'TAKEN' | 'RESERVED', note: string, by: string, days = r.daysCount) =>
      at(date, 0, () => {
        post1(date, days, 'CANCELLED', note, by, offsets);
        if (tracked) giveBack(date, days, r.id, note);
      });

    if (r.status === 'PENDING_APPROVAL') reserve();
    else if (r.status === 'APPROVED') {
      const d = maxIso(approvalDate(r), applied);
      take(d);
      // A holiday gazetted after approval is refunded
      const recount = countLeaveDays(r.startDate, r.endDate, typeAt(code, r.startDate, cfg).countBasis, cfg, r.halfDay, undefined, e.orgId);
      const asApproved = countLeaveDays(r.startDate, r.endDate, typeAt(code, r.startDate, cfg).countBasis, cfg, r.halfDay, d, e.orgId);
      if (recount < asApproved && recount < r.daysCount) {
        const h = cfg.holidays.find(
          (x) => x.gazettedOn && x.gazettedOn > d && observedDate(x) >= r.startDate && observedDate(x) <= r.endDate && holidayApplies(x, e.orgId)
        );
        release(h?.gazettedOn ?? d, 'TAKEN', `Refund: ${h?.name ?? 'public holiday'} gazetted after approval`, SYSTEM, r2(r.daysCount - recount));
      }
    } else if (r.status === 'REJECTED') {
      reserve();
      release(r.decidedOn ?? applied, 'RESERVED', 'Released: request declined', r.approverName ?? 'Approver');
    } else if (r.status === 'CANCELLED') {
      if (r.cancelledFrom === 'APPROVED') {
        take(maxIso(approvalDate(r), applied));
        release(r.decidedOn ?? applied, 'TAKEN', 'Approved leave cancelled before it started', r.staffName);
      } else {
        reserve();
        release(r.decidedOn ?? applied, 'RESERVED', 'Released: withdrawn by the employee', r.staffName);
      }
    }
  }

  // Events can schedule later events (an award schedules its expiry), so keep the queue sorted while running
  while (events.length) {
    events.sort((a, b) => a.date.localeCompare(b.date) || a.rank - b.rank);
    (events.shift() as Event).run();
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || rankOf(a.txn) - rankOf(b.txn));
  return { rows, buckets };
};

const TXN_ORDER: LedgerTxn[] = ['OPENING', 'GRANT', 'CARRY_FORWARD', 'ACCRUAL', 'HOLIDAY_AWARD', 'ADJUSTMENT', 'CANCELLED', 'RESERVED', 'TAKEN', 'FORFEIT', 'ENCASHMENT'];
const rankOf = (t: LedgerTxn) => TXN_ORDER.indexOf(t);

/** Every ledger row for an employee across all leave types, oldest first. */
export const ledgerFor = (
  employee: HREmployee,
  requests: LeaveRequest[],
  adjustments: LeaveAdjustment[] = DEFAULT_LEAVE_CONFIG.adjustments,
  asOf: string = todayIso(),
  cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG
): LedgerRow[] =>
  leaveCodes(cfg).flatMap((code) => typeLedger(employee, code, requests, adjustments, asOf, cfg).rows).sort(
    (a, b) => a.date.localeCompare(b.date) || rankOf(a.txn) - rankOf(b.txn)
  );

/* ------------------------------------------------------------------ */
/* Balances                                                             */
/* ------------------------------------------------------------------ */

export interface LeaveBalance {
  code: LeaveCode;
  name: LeaveTypeName;
  tracked: boolean;
  eligible: boolean;
  ineligibleReason?: string;
  entitlement: Entitlement;
  opening: number;
  carried: number;
  accrued: number;
  awarded: number;
  adjustments: number;
  taken: number;
  pending: number;
  forfeited: number;
  encashed: number;
  available: number;
  /** Days that will expire within the next 30 / 7 days if not used */
  expiring30: number;
  expiring7: number;
  nextExpiry?: { date: string; days: number; label: string };
  usable: boolean;
  usableFrom: string;
  rows: LedgerRow[];
}

const sum = (rows: LedgerRow[], pred: (r: LedgerRow) => boolean) => r2(rows.filter(pred).reduce((s, r) => s + r.days, 0));

const balanceFrom = (e: HREmployee, code: LeaveCode, requests: LeaveRequest[], asOf: string, cfg: LeaveEngineConfig): LeaveBalance => {
  const t = typeAt(code, asOf, cfg);
  const { rows, buckets } = typeLedger(e, code, requests, cfg.adjustments, asOf, cfg);
  const year = yearOf(asOf);
  const inYear = t.isAnnual ? rows.filter((r) => r.leaveYear === year) : rows;
  const g = genderEligible(e, code, asOf, cfg);
  const entitlement = entitlementFor(e, code, year, requests, cfg, maxIso(e.joinedDate, asOf));
  const tracked = t.mode !== 'UNTRACKED';
  const eligible = g.ok && (t.mode === 'AWARDED' || !tracked || entitlement.base > 0 || entitlement.cell.days !== 0);
  const usableFrom = usableFromDate(e, code, cfg, asOf);
  const window = (n: number) =>
    r2(buckets.filter((b) => b.remaining > 0 && b.expiry !== null && b.expiry >= asOf && b.expiry <= addDays(asOf, n)).reduce((s, b) => s + b.remaining, 0));
  let expiring30 = window(30);
  let expiring7 = window(7);
  // Days above the carry-forward cap are lost at year-end
  const ye = yearEnd(year);
  if (tracked && t.isAnnual && t.isForfeitable && daysBetween(asOf, ye) <= 30) {
    const closing = sum(typeLedger(e, code, requests, cfg.adjustments, ye, cfg).rows, () => true);
    const cap = t.allowCarryForward ? maxCarryForward(t, policyAt(ye, cfg)) : 0;
    const lost = Math.max(0, r2(closing - cap));
    expiring30 = r2(expiring30 + lost);
    if (daysBetween(asOf, ye) <= 7) expiring7 = r2(expiring7 + lost);
  }
  const next = buckets
    .filter((b) => b.remaining > 0 && b.expiry !== null && b.expiry >= asOf)
    .sort((a, b) => (a.expiry ?? '').localeCompare(b.expiry ?? ''))[0];
  return {
    code,
    name: leaveName(code, cfg),
    tracked,
    eligible,
    ineligibleReason: !g.ok ? g.reason : !eligible ? `No ${t.name.toLowerCase()} under a ${COLUMN_LABEL[entitlement.column].toLowerCase()} contract.` : undefined,
    entitlement,
    opening: sum(inYear, (r) => r.txn === 'OPENING' || r.txn === 'GRANT'),
    carried: sum(inYear, (r) => r.txn === 'CARRY_FORWARD'),
    accrued: sum(inYear, (r) => r.txn === 'ACCRUAL'),
    awarded: sum(inYear, (r) => r.txn === 'HOLIDAY_AWARD'),
    adjustments: sum(inYear, (r) => r.txn === 'ADJUSTMENT'),
    taken: -sum(inYear, (r) => r.txn === 'TAKEN' || (r.txn === 'CANCELLED' && r.offsets === 'TAKEN')),
    pending: -sum(inYear, (r) => r.txn === 'RESERVED' || (r.txn === 'CANCELLED' && r.offsets === 'RESERVED')),
    forfeited: -sum(inYear, (r) => r.txn === 'FORFEIT'),
    encashed: -sum(inYear, (r) => r.txn === 'ENCASHMENT'),
    available: tracked ? sum(rows, () => true) : 0,
    expiring30,
    expiring7,
    nextExpiry: next ? { date: next.expiry as string, days: next.remaining, label: next.label } : undefined,
    usable: asOf >= usableFrom && (contractColumn(e, asOf) !== 'PROBATION' || t.probationEligible),
    usableFrom,
    rows
  };
};

/** Balance per leave type for an employee (all eight types; check `eligible`). */
export const leaveBalances = (
  employee: HREmployee,
  requests: LeaveRequest[],
  asOf: string = todayIso(),
  cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG
): LeaveBalance[] => leaveCodes(cfg).map((code) => balanceFrom(employee, code, requests, asOf, cfg));

/** One type's balance. */
export const leaveBalance = (employee: HREmployee, code: LeaveCode, requests: LeaveRequest[], asOf: string = todayIso(), cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG) =>
  balanceFrom(employee, code, requests, asOf, cfg);

/** Days available now (ledger sum). Payroll uses `availableDays(e, 'AL', requests)` for leave pay on exit. */
export const availableDays = (
  employee: HREmployee,
  code: LeaveCode,
  requests: LeaveRequest[],
  asOf: string = todayIso(),
  cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG
): number => {
  if (typeAt(code, asOf, cfg).mode === 'UNTRACKED') return 0;
  return sum(typeLedger(employee, code, requests, cfg.adjustments, asOf, cfg).rows, () => true);
};

/* ------------------------------------------------------------------ */
/* Approval workflow                                                    */
/* ------------------------------------------------------------------ */

export const workflowFor = (r: Pick<LeaveRequest, 'leaveType' | 'startDate' | 'backdated'>, cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG): ApprovalStep[] => {
  const t = typeAt(codeOf(r.leaveType, cfg), r.startDate, cfg);
  const steps = [...t.workflow];
  if (r.backdated && policyAt(r.startDate, cfg).backdatedApproval === 'Normal + HR step' && !steps.includes('HR')) steps.push('HR');
  return steps;
};

export const currentStepOf = (r: LeaveRequest): ApprovalStep => r.currentStep ?? 'SUPERVISOR';

/* ------------------------------------------------------------------ */
/* Request validation (§11)                                             */
/* ------------------------------------------------------------------ */

export interface LeaveDraft {
  code: LeaveCode;
  startDate: string;
  endDate: string;
  halfDay?: boolean;
  attachment?: boolean;
  submittedBy?: 'EMPLOYEE' | 'SUPERVISOR' | 'HR';
  /** Ignore this request in overlap and balance checks (when re-validating an existing one) */
  excludeId?: string;
}

export interface LeaveValidation {
  ok: boolean;
  days: number;
  errors: string[];
  warnings: string[];
  backdated: boolean;
  workflow: ApprovalStep[];
  available: number | null;
  balanceAfter: number | null;
  type: LeaveTypeVersion;
}

const fmt = (iso: string) => parse(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Validates a leave application against the leave type and the policy in force on its start date. */
export const validateLeaveRequest = (
  e: HREmployee,
  draft: LeaveDraft,
  requests: LeaveRequest[],
  cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG,
  today: string = todayIso()
): LeaveValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { code, startDate, endDate } = draft;
  const t = typeAt(code, startDate || today, cfg);
  const p = policyAt(startDate || today, cfg);
  const fail = (days = 0): LeaveValidation => ({ ok: false, days, errors, warnings, backdated: false, workflow: t.workflow, available: null, balanceAfter: null, type: t });

  if (!startDate || !endDate) {
    errors.push('Choose a start and end date.');
    return fail();
  }
  if (endDate < startDate) {
    errors.push('The end date is before the start date.');
    return fail();
  }
  if (t.status !== 'Active') errors.push(`${t.name} is not active.`);

  // Eligibility: gender, contract, probation, usable-from, employment dates
  const g = genderEligible(e, code, startDate, cfg);
  if (!g.ok) errors.push(g.reason);
  else if (g.override) warnings.push(`HR eligibility override: ${g.override.reason}`);
  const column = contractColumn(e, startDate);
  const cell = matrixRow(cfg, code)[column];
  if (t.mode !== 'AWARDED' && t.mode !== 'UNTRACKED' && (cell.days ?? 0) === 0)
    errors.push(`${e.fullName.split(' ')[0]} has no ${t.name.toLowerCase()} on a ${COLUMN_LABEL[column].toLowerCase()} contract (${e.contractType}).`);
  if (column === 'PROBATION' && (!t.probationEligible || (code === 'AL' && p.probationUse === 'Accrue, not usable')))
    errors.push(`${t.name} cannot be taken during probation. It can be used from ${fmt(addDays(probationEnd(e), 1))}.`);
  const usable = usableFromDate(e, code, cfg, startDate);
  if (startDate < usable && column !== 'PROBATION') errors.push(`${t.name} can be used from ${fmt(usable)}.`);
  if (startDate < e.joinedDate) errors.push(`The leave starts before ${e.fullName.split(' ')[0]} joined on ${fmt(e.joinedDate)}.`);
  const end = serviceEnd(e);
  if (end && endDate > end) errors.push(`The leave runs past the last day of service (${fmt(end)}).`);

  // Days
  const halfDay = !!draft.halfDay;
  if (halfDay && !t.allowHalfDay) errors.push(`${t.name} cannot be taken as a half day.`);
  if (halfDay && startDate !== endDate) errors.push('A half day must start and end on the same date.');
  const days = countLeaveDays(startDate, endDate, t.countBasis, cfg, halfDay, undefined, e.orgId);
  if (days === 0) errors.push('The selected dates are all weekends or public holidays.');
  else {
    if (days < t.minDays) errors.push(`The shortest ${t.name.toLowerCase()} is ${plural(t.minDays, 'day')}.`);
    if (days > t.maxDays) errors.push(`The longest single ${t.name.toLowerCase()} request is ${plural(t.maxDays, 'day')}.`);
  }

  // Notice and backdating
  const backdated = startDate < today;
  if (backdated) {
    const limit = num(p.backdatingDays);
    const late = daysBetween(startDate, today);
    if (limit === 0) errors.push('Backdated leave is not allowed.');
    else if (late > limit) errors.push(`Leave can be backdated by up to ${plural(limit, 'day')}; this starts ${plural(late, 'day')} ago.`);
    const who = draft.submittedBy ?? 'EMPLOYEE';
    if (p.backdatedSubmitters === 'Supervisor or HR' && who === 'EMPLOYEE') errors.push('Only a supervisor or HR can submit backdated leave.');
    if (p.backdatedSubmitters === 'HR only' && who !== 'HR') errors.push('Only HR can submit backdated leave.');
    if (cfg.closedYears.includes(yearOf(startDate)) && p.backdateClosedYear === 'Not allowed') errors.push(`Leave year ${yearOf(startDate)} is closed.`);
    if (p.backdatedApproval === 'Normal + HR step') warnings.push('Backdated: HR approval is added to the workflow.');
  } else {
    const notice = daysBetween(today, startDate);
    if (notice < t.minNoticeDays) errors.push(`${t.name} needs ${plural(t.minNoticeDays, 'day')} notice; this starts in ${plural(notice, 'day')}.`);
  }

  // One leave year per request for working-day types
  if (t.isAnnual && t.countBasis === 'Working days' && yearOf(startDate) !== yearOf(endDate))
    errors.push(`The request crosses into ${yearOf(endDate)}. End it on 31 Dec and apply for the January days separately.`);

  // Overlap with pending or approved leave
  const clash = requests.find(
    (r) => r.staffId === e.staffId && r.id !== draft.excludeId && (r.status === 'PENDING_APPROVAL' || r.status === 'APPROVED') && r.startDate <= endDate && r.endDate >= startDate
  );
  if (clash) errors.push(`Overlaps ${clash.id} (${clash.leaveType}, ${fmt(clash.startDate)} to ${fmt(clash.endDate)}, ${clash.status === 'APPROVED' ? 'approved' : 'pending'}).`);

  // Supporting document
  if (t.attachmentAfterDays !== null && days > t.attachmentAfterDays && !draft.attachment)
    errors.push(
      t.attachmentAfterDays === 0
        ? `${t.name} needs a supporting document.`
        : `${t.name} longer than ${plural(t.attachmentAfterDays, 'day')} needs a supporting document.`
    );

  // Balance
  let available: number | null = null;
  let balanceAfter: number | null = null;
  if (t.mode !== 'UNTRACKED') {
    const others = requests.filter((r) => r.id !== draft.excludeId);
    const { rows, buckets } = typeLedger(e, code, others, cfg.adjustments, today, cfg);
    available = sum(rows, () => true);
    // Awarded credits must still be valid on the first day of leave
    if (t.mode === 'AWARDED') available = r2(buckets.filter((b) => b.remaining > 0 && (b.expiry === null || b.expiry >= startDate)).reduce((s, b) => s + b.remaining, 0));
    balanceAfter = r2(available - days);
    if (days > 0 && balanceAfter < 0) {
      const negOk =
        p.allowNegative === 'Yes' &&
        t.allowNegative &&
        (p.negativeEligibility === 'All' || column !== 'PROBATION') &&
        -balanceAfter <= t.negativeLimit;
      if (negOk) warnings.push(`Balance goes to ${balanceAfter} days (negative limit ${t.negativeLimit}); recovered by ${p.negativeRecovery.toLowerCase()}.`);
      else errors.push(`Needs ${plural(days, 'day')} but ${available} ${available === 1 ? 'is' : 'are'} available.`);
    }
  }

  const workflow = workflowFor({ leaveType: t.name, startDate, backdated }, cfg);
  return { ok: errors.length === 0, days, errors, warnings, backdated, workflow, available, balanceAfter, type: t };
};

/* ------------------------------------------------------------------ */
/* Year-end close preview                                               */
/* ------------------------------------------------------------------ */

export interface YearEndRow {
  staffId: string;
  fullName: string;
  department: string;
  column: ContractColumn;
  /** Annual leave */
  closing: number;
  carried: number;
  forfeited: number;
  encashed: number;
  carryExpiry?: string;
  /** Next-year entitlements (base + tenure) */
  next: Partial<Record<LeaveCode, Entitlement>>;
  tenureNext: number;
  bandChanged: boolean;
  lapsing: Partial<Record<LeaveCode, number>>;
}

/** What closing `year` would post: AL carry-forward and forfeiture, lapses, and next year's grants. */
export const yearEndPreview = (
  employees: HREmployee[],
  requests: LeaveRequest[],
  year: number,
  cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG
): YearEndRow[] => {
  const ye = yearEnd(year);
  const next = year + 1;
  return employees
    .filter((e) => e.status !== 'TERMINATED' && (!serviceEnd(e) || (serviceEnd(e) as string) > ye))
    .map((e) => {
      const t = typeAt('AL', ye, cfg);
      const p = policyAt(ye, cfg);
      const closing = availableDays(e, 'AL', requests, ye, cfg);
      const cap = maxCarryForward(t, p);
      const carried = closing <= 0 ? closing : t.isForfeitable ? Math.min(closing, cap) : closing;
      const lost = Math.max(0, r2(closing - carried));
      const months = carryForwardMonths(t, p);
      const nextEnt: Partial<Record<LeaveCode, Entitlement>> = {};
      const lapsing: Partial<Record<LeaveCode, number>> = {};
      for (const code of leaveCodes(cfg)) {
        const tc = typeAt(code, yearStart(next), cfg);
        if (tc.mode === 'AWARDED' || tc.mode === 'UNTRACKED' || !genderEligible(e, code, yearStart(next), cfg).ok) continue;
        const ent = entitlementFor(e, code, next, requests, cfg, maxIso(yearStart(next), e.joinedDate));
        if (ent.total > 0) nextEnt[code] = ent;
        if (code !== 'AL') {
          const left = availableDays(e, code, requests, ye, cfg);
          if (left > 0 && tc.isForfeitable) lapsing[code] = left;
        }
      }
      const prevBand = bandFor('AL', contractColumn(e, yearStart(year)), tenureYears(e, yearStart(year), requests, cfg), cfg);
      const tenureNext = r2(tenureYears(e, yearStart(next), requests, cfg));
      const nextBand = bandFor('AL', contractColumn(e, yearStart(next)), tenureNext, cfg);
      return {
        staffId: e.staffId,
        fullName: e.fullName,
        department: e.department,
        column: contractColumn(e, yearStart(next)),
        closing,
        carried,
        forfeited: p.encashment === 'Allowed' ? 0 : lost,
        encashed: p.encashment === 'Allowed' ? lost : 0,
        carryExpiry: months > 0 && carried > 0 ? addDays(addMonths(yearStart(next), months), -1) : undefined,
        next: nextEnt,
        tenureNext,
        bandChanged: !!prevBand && !!nextBand && prevBand.id !== nextBand.id,
        lapsing
      };
    });
};

/* ------------------------------------------------------------------ */
/* Expiry reminders, holiday credits and scheduled jobs                 */
/* ------------------------------------------------------------------ */

export interface ExpiryItem {
  staffId: string;
  fullName: string;
  code: LeaveCode;
  kind: 'Carried days' | 'Holiday credit' | 'Above carry-forward cap';
  label: string;
  days: number;
  expiry: string;
  daysLeft: number;
  /** Reminder due today, if any */
  reminderToday?: '30-day' | '7-day';
  reminders: { at: string; kind: '30-day' | '7-day'; sent: boolean }[];
}

/** Days that will be forfeited within `horizon` days, with the 30- and 7-day reminder dates. */
export const expiryReminders = (
  employees: HREmployee[],
  requests: LeaveRequest[],
  asOf: string = todayIso(),
  cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG,
  horizon = 30
): ExpiryItem[] => {
  const out: ExpiryItem[] = [];
  const limit = addDays(asOf, horizon);
  const make = (e: HREmployee, code: LeaveCode, kind: ExpiryItem['kind'], label: string, days: number, expiry: string): ExpiryItem => {
    const r30 = addDays(expiry, -30);
    const r7 = addDays(expiry, -7);
    return {
      staffId: e.staffId,
      fullName: e.fullName,
      code,
      kind,
      label,
      days,
      expiry,
      daysLeft: daysBetween(asOf, expiry),
      reminderToday: r7 === asOf ? '7-day' : r30 === asOf ? '30-day' : undefined,
      reminders: [
        { at: r30, kind: '30-day', sent: r30 <= asOf },
        { at: r7, kind: '7-day', sent: r7 <= asOf }
      ]
    };
  };
  for (const e of employees) {
    if (e.status === 'TERMINATED') continue;
    const co = holidayCreditCode(cfg);
    for (const code of ['AL', co]) {
      const { buckets } = typeLedger(e, code, requests, cfg.adjustments, asOf, cfg);
      for (const b of buckets)
        if (b.remaining > 0 && b.expiry && b.expiry >= asOf && b.expiry <= limit)
          out.push(make(e, code, code === co ? 'Holiday credit' : 'Carried days', b.label, b.remaining, b.expiry));
    }
    const ye = yearEnd(yearOf(asOf));
    if (ye <= limit) {
      const t = typeAt('AL', ye, cfg);
      if (t.isForfeitable) {
        const closing = availableDays(e, 'AL', requests, ye, cfg);
        const lost = r2(closing - (t.allowCarryForward ? maxCarryForward(t, policyAt(ye, cfg)) : 0));
        if (lost > 0) out.push(make(e, 'AL', 'Above carry-forward cap', `Projected closing ${closing} days`, lost, ye));
      }
    }
  }
  return out.sort((a, b) => a.expiry.localeCompare(b.expiry) || b.days - a.days);
};

export interface HolidayCredit {
  id: string;
  staffId: string;
  fullName: string;
  department: string;
  holiday: string;
  holidayDate: string;
  worked: number;
  credited: number;
  used: number;
  forfeited: number;
  remaining: number;
  expires: string;
  source: HolidayWork['source'];
  status: 'Available' | 'Used' | 'Expired' | 'Partly used' | 'Scheduled';
}

/** One row per employee per holiday worked (idempotent), with how much has been used or expired. */
export const holidayCredits = (
  employees: HREmployee[],
  requests: LeaveRequest[],
  asOf: string = todayIso(),
  cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG
): HolidayCredit[] => {
  const out: HolidayCredit[] = [];
  for (const e of employees) {
    const work = cfg.attendance.filter((a) => a.staffId === e.staffId);
    if (!work.length) continue;
    const co = holidayCreditCode(cfg);
    const { buckets } = typeLedger(e, co, requests, cfg.adjustments, asOf, cfg);
    const seen = new Set<string>();
    for (const w of work) {
      if (seen.has(w.holidayDate)) continue;
      seen.add(w.holidayDate);
      const h = holidayOn(w.holidayDate, cfg, e.orgId);
      if (!h) continue;
      const p = policyAt(w.holidayDate, cfg);
      const expires = addDays(w.holidayDate, holidayCreditDays(typeAt(co, w.holidayDate, cfg), p));
      const b = buckets.find((x) => x.holidayDate === w.holidayDate);
      const credited = r2(w.worked * num(p.holidayCreditPerDay));
      const status: HolidayCredit['status'] = !b
        ? 'Scheduled'
        : b.remaining > 0
        ? b.used > 0
          ? 'Partly used'
          : 'Available'
        : b.forfeited > 0
        ? 'Expired'
        : 'Used';
      out.push({
        id: w.id,
        staffId: e.staffId,
        fullName: e.fullName,
        department: e.department,
        holiday: h.name,
        holidayDate: w.holidayDate,
        worked: w.worked,
        credited,
        used: b?.used ?? 0,
        forfeited: b?.forfeited ?? 0,
        remaining: b?.remaining ?? 0,
        expires,
        source: w.source,
        status
      });
    }
  }
  return out.sort((a, b) => b.holidayDate.localeCompare(a.holidayDate) || a.fullName.localeCompare(b.fullName));
};

export interface JobStatus {
  id: 'ACCRUAL' | 'HOLIDAY_CREDIT' | 'TENURE' | 'REMINDER' | 'EXPIRY' | 'YEAR_END';
  name: string;
  schedule: string;
  lastRun: string;
  nextRun: string;
  posted: string;
}

/** Status of the scheduled leave jobs, read back from the ledger they post to. */
export const jobStatus = (
  employees: HREmployee[],
  requests: LeaveRequest[],
  asOf: string = todayIso(),
  cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG
): JobStatus[] => {
  const rows = employees.flatMap((e) => ledgerFor(e, requests, cfg.adjustments, asOf, cfg));
  const lastOf = (pred: (r: LedgerRow) => boolean) => rows.filter(pred).reduce((m, r) => (r.date > m ? r.date : m), '');
  const onDate = (pred: (r: LedgerRow) => boolean, d: string) => rows.filter((r) => pred(r) && r.date === d);
  const total = (xs: LedgerRow[]) => r2(xs.reduce((s, r) => s + Math.abs(r.days), 0));
  const people = (xs: LedgerRow[]) => new Set(xs.map((r) => r.staffId)).size;

  const isAcc = (r: LedgerRow) => r.txn === 'ACCRUAL';
  const lastAcc = lastOf(isAcc);
  const accRows = onDate(isAcc, lastAcc);
  const monthEnd = (iso: string) => addDays(addMonths(`${iso.slice(0, 7)}-01`, 1), -1);
  const nextAcc = monthEnd(asOf) === asOf ? asOf : monthEnd(asOf);

  const isHol = (r: LedgerRow) => r.txn === 'HOLIDAY_AWARD';
  const lastHol = lastOf(isHol);
  const holRows = onDate(isHol, lastHol);

  const isExp = (r: LedgerRow) => (r.txn === 'FORFEIT' || r.txn === 'ENCASHMENT') && !/^YE-d+$/.test(r.sourceRef);
  const lastExp = lastOf(isExp);
  const expRows = onDate(isExp, lastExp);

  const year = yearOf(asOf);
  const crossing = employees.filter((e) => {
    if (e.status === 'TERMINATED' || isCasual(e)) return false;
    const a = bandFor('AL', contractColumn(e, yearStart(year + 1)), tenureYears(e, yearStart(year), requests, cfg), cfg);
    const b = bandFor('AL', contractColumn(e, yearStart(year + 1)), tenureYears(e, yearStart(year + 1), requests, cfg), cfg);
    return a && b && a.id !== b.id;
  });
  const reminders = expiryReminders(employees, requests, asOf, cfg, 30);
  const yeRows = rows.filter((r) => r.sourceRef === `YE-${year - 1}` && r.txn !== 'CARRY_FORWARD');

  return [
    {
      id: 'ACCRUAL',
      name: 'Accrual',
      schedule: 'Last day of each month',
      lastRun: lastAcc,
      nextRun: nextAcc,
      posted: lastAcc ? `${accRows.length} accrual rows, ${total(accRows)} days for ${people(accRows)} employees` : 'Nothing posted yet'
    },
    {
      id: 'HOLIDAY_CREDIT',
      name: 'Holiday credit',
      schedule: 'Daily, 02:00',
      lastRun: asOf,
      nextRun: addDays(asOf, 1),
      posted: lastHol ? `Last credits: ${holidayOn(lastHol, cfg)?.name ?? lastHol} (${lastHol}), ${total(holRows)} days for ${people(holRows)} employees` : 'No holiday worked yet'
    },
    {
      id: 'TENURE',
      name: 'Tenure check',
      schedule: 'Daily, 02:15',
      lastRun: asOf,
      nextRun: addDays(asOf, 1),
      posted: crossing.length ? `${crossing.length} employees move up an annual leave band on 1 Jan ${year + 1}` : 'No band changes due'
    },
    {
      id: 'REMINDER',
      name: 'Expiry reminder',
      schedule: 'Daily, 07:00 (30 and 7 days before)',
      lastRun: asOf,
      nextRun: addDays(asOf, 1),
      posted: `${reminders.filter((r) => r.reminderToday).length} reminders today; ${reminders.length} items expire within 30 days`
    },
    {
      id: 'EXPIRY',
      name: 'Expiry and forfeiture',
      schedule: 'Daily, 23:55',
      lastRun: asOf,
      nextRun: addDays(asOf, 1),
      posted: lastExp ? `Last forfeiture ${lastExp}: ${total(expRows)} days for ${people(expRows)} employees` : 'Nothing forfeited yet'
    },
    {
      id: 'YEAR_END',
      name: 'Year-end close',
      schedule: 'Once a year, after HR review',
      lastRun: yeRows.length ? `${year}-01-01` : '',
      nextRun: `${year + 1}-01-01`,
      posted: yeRows.length ? `${year - 1} closed: ${total(yeRows)} days forfeited for ${people(yeRows)} employees` : 'Not run'
    }
  ];
};

/* ------------------------------------------------------------------ */
/* Configuration checks                                                 */
/* ------------------------------------------------------------------ */

/** Tenure bands must start at 0, run without gaps or overlaps and end open. */
export const validateBands = (bands: TenureBand[], cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG): string[] => {
  const errors: string[] = [];
  const groups = new Map<string, TenureBand[]>();
  bands.forEach((b) => groups.set(`${b.code}|${b.column}`, [...(groups.get(`${b.code}|${b.column}`) ?? []), b]));
  groups.forEach((list, key) => {
    const [code, column] = key.split('|');
    const label = `${leaveName(code, cfg)} / ${COLUMN_LABEL[column as ContractColumn]}`;
    const sorted = [...list].sort((a, b) => a.fromYears - b.fromYears);
    if (sorted[0].fromYears !== 0) errors.push(`${label}: the first band must start at 0 years.`);
    sorted.forEach((b, i) => {
      if (b.toYears !== null && b.toYears <= b.fromYears) errors.push(`${label}: band ${b.fromYears}–${b.toYears} ends before it starts.`);
      if (b.bonusDays < 0) errors.push(`${label}: bonus days cannot be negative.`);
      const nx = sorted[i + 1];
      if (!nx) {
        if (b.toYears !== null) errors.push(`${label}: the last band must have no upper limit.`);
        return;
      }
      if (b.toYears === null) errors.push(`${label}: only the last band can be open-ended.`);
      else if (nx.fromYears > b.toYears) errors.push(`${label}: gap between ${b.toYears} and ${nx.fromYears} years.`);
      else if (nx.fromYears < b.toYears) errors.push(`${label}: bands overlap between ${nx.fromYears} and ${b.toYears} years.`);
    });
  });
  return errors;
};

/** Cells below the Kenyan statutory minimum. Casuals and probation are exempt except for maternity/paternity. */
export const statutoryWarnings = (matrix: EntitlementMatrix, cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG): string[] => {
  const out: string[] = [];
  (Object.keys(STATUTORY_MINIMUMS) as LeaveCode[]).forEach((code) => {
    const min = STATUTORY_MINIMUMS[code] as number;
    (['PERMANENT', 'FIXED_TERM', 'PROBATION', 'CASUAL'] as ContractColumn[]).forEach((col) => {
      const statutoryForAll = code === 'ML' || code === 'PL';
      if (!statutoryForAll && (col === 'CASUAL' || col === 'PROBATION')) return;
      const d = matrix[code]?.[col].days ?? 0;
      if (d < min) out.push(`${leaveName(code, cfg)} for ${COLUMN_LABEL[col].toLowerCase()} is ${d} days, below the statutory ${min}.`);
    });
  });
  return out;
};

/** Checks a new or duplicated leave type: code 2–6 letters/digits, code and name unique across all types. */
export const validateLeaveTypeDraft = (draft: Pick<LeaveTypeVersion, 'code' | 'name'>, cfg: LeaveEngineConfig = DEFAULT_LEAVE_CONFIG): string[] => {
  const errors: string[] = [];
  const code = draft.code.trim();
  const name = draft.name.trim();
  if (!/^[A-Z0-9]{2,6}$/.test(code)) errors.push('Code must be 2 to 6 capital letters or digits, e.g. SP or AL2.');
  if (cfg.types.some((t) => t.code === code)) errors.push(`Code ${code} is already used by ${leaveName(code, cfg)}.`);
  if (!name) errors.push('Give the leave type a name.');
  else if (cfg.types.some((t) => t.name.trim().toLowerCase() === name.toLowerCase())) errors.push(`A leave type called "${name}" already exists.`);
  return errors;
};

/** Checks a holiday against the others: one holiday per observed date and site, name unique within a year. */
export const validateHoliday = (h: PublicHoliday, holidays: PublicHoliday[]): string[] => {
  const errors: string[] = [];
  if (!h.name.trim()) errors.push('Give the holiday a name.');
  if (!h.date) errors.push('Pick the holiday date.');
  if (h.observed && h.date && h.observed < h.date) errors.push('The observed date cannot be before the holiday.');
  const others = holidays.filter((x) => x.id !== h.id);
  const overlap = (x: PublicHoliday) => x.location === 'ALL' || h.location === 'ALL' || x.location === h.location;
  const sameDay = others.find((x) => h.date && observedDate(x) === observedDate(h) && overlap(x));
  if (sameDay) errors.push(`${sameDay.name} is already observed on ${observedDate(h)} for the same sites.`);
  const sameName = others.find((x) => h.date && x.name.trim().toLowerCase() === h.name.trim().toLowerCase() && x.date.slice(0, 4) === h.date.slice(0, 4));
  if (sameName) errors.push(`${sameName.name} already exists in ${h.date.slice(0, 4)}.`);
  return errors;
};
