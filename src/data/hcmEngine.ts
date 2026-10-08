/** Calculations behind the human capital services: alerts, reports, per diem, policies and payroll bank files. */
import type { HREmployee, LeaveRequest, QualificationLevel } from '../types';
import {
  ADVANCE_POLICY,
  BANK_FORMATS,
  FINE_PER_DAY_KES,
  FLEXI_DAY_HOURS,
  LEAVE_ALLOWANCE_POLICY,
  MEDICAL_SCHEMES,
  PER_DIEM_RATES,
  QUAL_RANK,
  type BankFormat,
  type ClaimBenefit,
  type FlexiEntry,
  type GradeRule,
  type LibraryLoan,
  type MedicalClaim,
  type MedicalCover,
  type PayrollGlMap
} from './hcmConfig';
import { GRADE_BANDS } from './hireConfig';

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDaysIso = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const daysBetweenIso = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000);
export const monthsBetweenIso = (a: string, b: string) => {
  const x = new Date(`${a}T00:00:00`);
  const y = new Date(`${b}T00:00:00`);
  return (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth()) - (y.getDate() < x.getDate() ? 1 : 0);
};
export const fmt = (d?: string) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
export const active = (e: HREmployee) => e.status !== 'TERMINATED' && !(e.exitDate && e.exitDate < todayIso());

/* ------------------------------------------------------------------ suspension */

/** True while a disciplinary suspension covers the date: no sign-in, no approvals, no self-service actions. */
export const isSuspended = (e: HREmployee | undefined, date = todayIso()) => !!e?.suspension && e.suspension.from <= date && e.suspension.to >= date;
export const suspensionBlock = (e: HREmployee | undefined, what = 'act') =>
  isSuspended(e) ? `${e!.fullName} is suspended until ${fmt(e!.suspension!.to)} (case ${e!.suspension!.caseId}) and cannot ${what}.` : null;

/* ------------------------------------------------------------------ alerts: anniversaries, retirements, contracts */

export const RETIREMENT_AGE = 60;
export const retirementDateOf = (e: HREmployee) => {
  if (e.retirementDate) return e.retirementDate;
  if (!e.dateOfBirth) return undefined;
  const d = new Date(`${e.dateOfBirth}T00:00:00`);
  d.setFullYear(d.getFullYear() + (e.retirementAge ?? RETIREMENT_AGE));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export interface HrAlert {
  key: string;
  kind: 'ANNIVERSARY' | 'MILESTONE' | 'RETIREMENT' | 'CONTRACT' | 'PROBATION';
  staffId: string;
  name: string;
  date: string;
  daysLeft: number;
  detail: string;
  /** Notice bucket (e.g. 6/3/1 months) so each notice goes once */
  bucket: string;
  severity: 'info' | 'warning' | 'critical';
}

const MILESTONES = [5, 10, 15, 20, 25, 30];

/** Upcoming anniversaries (next `horizon` days), retirements within 6 months, contracts ending within 90 days. */
export const hrAlerts = (employees: HREmployee[], today = todayIso(), horizon = 60): HrAlert[] => {
  const out: HrAlert[] = [];
  const y = Number(today.slice(0, 4));
  for (const e of employees.filter(active)) {
    // Work anniversary this year or next
    if (e.joinedDate && e.joinedDate < today) {
      let next = `${y}${e.joinedDate.slice(4)}`;
      if (next < today) next = `${y + 1}${e.joinedDate.slice(4)}`;
      const years = Number(next.slice(0, 4)) - Number(e.joinedDate.slice(0, 4));
      const left = daysBetweenIso(today, next);
      if (years > 0 && left <= horizon) {
        const ms = MILESTONES.includes(years);
        out.push({ key: `ann-${e.staffId}-${next}`, kind: ms ? 'MILESTONE' : 'ANNIVERSARY', staffId: e.staffId, name: e.fullName, date: next, daysLeft: left, detail: `${years} year${years === 1 ? '' : 's'} of service${ms ? ' — long-service award' : ''}`, bucket: next, severity: ms ? 'warning' : 'info' });
      }
    }
    const rd = retirementDateOf(e);
    if (rd && rd >= today) {
      const left = daysBetweenIso(today, rd);
      if (left <= 183) {
        const bucket = left <= 31 ? '1 month' : left <= 92 ? '3 months' : '6 months';
        out.push({ key: `ret-${e.staffId}-${bucket}`, kind: 'RETIREMENT', staffId: e.staffId, name: e.fullName, date: rd, daysLeft: left, detail: `Reaches retirement age ${e.retirementAge ?? RETIREMENT_AGE} — ${bucket} notice`, bucket, severity: left <= 92 ? 'critical' : 'warning' });
      }
    }
    if (e.contractEndDate && e.contractEndDate >= today) {
      const left = daysBetweenIso(today, e.contractEndDate);
      if (left <= 90) {
        const bucket = left <= 30 ? '30 days' : left <= 60 ? '60 days' : '90 days';
        out.push({ key: `ctr-${e.staffId}-${bucket}`, kind: 'CONTRACT', staffId: e.staffId, name: e.fullName, date: e.contractEndDate, daysLeft: left, detail: `${e.contractType} ends — ${bucket} notice`, bucket, severity: left <= 30 ? 'critical' : 'warning' });
      }
    }
    if (e.probationEndDate && e.probationStatus !== 'CONFIRMED' && e.probationEndDate >= today) {
      const left = daysBetweenIso(today, e.probationEndDate);
      if (left <= 30) out.push({ key: `prb-${e.staffId}`, kind: 'PROBATION', staffId: e.staffId, name: e.fullName, date: e.probationEndDate, daysLeft: left, detail: 'Probation review due', bucket: 'review', severity: 'warning' });
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
};

/* ------------------------------------------------------------------ HR reports */

export const ageOf = (dob?: string, today = todayIso()) => (dob ? Math.floor(daysBetweenIso(dob, today) / 365.25) : undefined);
export const ageBand = (age?: number) => (age === undefined ? 'Not recorded' : age < 25 ? 'Under 25' : age < 35 ? '25–34' : age < 45 ? '35–44' : age < 55 ? '45–54' : '55+');
export const serviceBand = (joined: string, today = todayIso()) => {
  const y = daysBetweenIso(joined, today) / 365.25;
  return y < 1 ? 'Under 1 yr' : y < 3 ? '1–3 yrs' : y < 5 ? '3–5 yrs' : y < 10 ? '5–10 yrs' : '10+ yrs';
};
export const countBy = <T,>(rows: T[], key: (r: T) => string) => {
  const m = new Map<string, number>();
  rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

/** Joiners and leavers by month for the last `months` months, with turnover %. */
export const movements = (employees: HREmployee[], months = 12, today = todayIso()) => {
  const out: { month: string; joiners: number; leavers: number; headcount: number; turnoverPct: number }[] = [];
  const t = new Date(`${today}T00:00:00`);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const end = `${key}-31`;
    const joiners = employees.filter((e) => e.joinedDate.startsWith(key)).length;
    const leavers = employees.filter((e) => e.exitDate?.startsWith(key)).length;
    const headcount = employees.filter((e) => e.joinedDate <= end && !(e.exitDate && e.exitDate < `${key}-01`)).length;
    out.push({ month: key, joiners, leavers, headcount, turnoverPct: headcount ? Math.round((leavers / headcount) * 1000) / 10 : 0 });
  }
  return out;
};

export const highestQualification = (e: HREmployee): QualificationLevel | undefined =>
  (e.qualifications ?? []).slice().sort((a, b) => QUAL_RANK[b.level] - QUAL_RANK[a.level])[0]?.level;

/* ------------------------------------------------------------------ per diem, imprest, advances */

export const perDiemRate = (destination: string, e: HREmployee | undefined) => {
  const band = PER_DIEM_RATES.find((b) => b.destinations.some((d) => d.toLowerCase() === destination.trim().toLowerCase())) ?? PER_DIEM_RATES[1];
  const manager = !!e && /manager|director|head|chief/i.test(e.jobTitle);
  return { band: band.band, rate: manager ? band.manager : band.staff };
};
export const nightsBetween = (from: string, to: string) => Math.max(0, daysBetweenIso(from, to));

/** Salary advance policy check at request and approval time (limit, one open advance, one-third rule). */
export const advanceCheck = (opts: { amount: number; months: number; basic: number; gross: number; net: number; openAdvances: number }) => {
  const errors: string[] = [];
  const cap = Math.floor((opts.basic * ADVANCE_POLICY.maxPctOfBasic) / 100);
  if (!(opts.amount > 0)) errors.push('Enter the amount.');
  if (opts.amount > cap) errors.push(`An advance is capped at ${ADVANCE_POLICY.maxPctOfBasic}% of basic pay (${kes(cap)}).`);
  if (opts.months < 1 || opts.months > ADVANCE_POLICY.maxMonths) errors.push(`Recovery is over 1 to ${ADVANCE_POLICY.maxMonths} months.`);
  if (opts.openAdvances > 0) errors.push('There is already an advance being recovered — it must be cleared first.');
  const instalment = Math.ceil(opts.amount / Math.max(1, opts.months));
  const after = opts.net - instalment;
  if (opts.gross > 0 && after < opts.gross * ADVANCE_POLICY.minNetShare) errors.push(`Net pay after the ${kes(instalment)} instalment would be ${kes(after)}, below one third of gross (${kes(opts.gross / 3)}).`);
  return { ok: !errors.length, errors, cap, instalment };
};

/** Leave allowance due with an approved annual leave (first qualifying leave in the year). */
export const leaveAllowanceFor = (r: LeaveRequest, basic: number, all: LeaveRequest[]) => {
  if (r.leaveType !== 'Annual Leave' || r.daysCount < LEAVE_ALLOWANCE_POLICY.minDays || basic <= 0) return null;
  const year = r.startDate.slice(0, 4);
  const paid = all.some((x) => x.id !== r.id && x.staffId === r.staffId && x.leaveAllowanceTriggered && x.status === 'APPROVED' && x.startDate.startsWith(year));
  if (paid) return null;
  const amount = Math.max(LEAVE_ALLOWANCE_POLICY.minimumKes, Math.round((basic * LEAVE_ALLOWANCE_POLICY.pctOfBasic) / 100 / 500) * 500);
  return { amount, year };
};

/** Flexi bank balance from approved credits and debits. */
export const flexiBalance = (entries: FlexiEntry[], staffId: string) =>
  entries.filter((x) => x.staffId === staffId && x.status === 'APPROVED').reduce((n, x) => n + (x.kind === 'CREDIT' ? x.hours : -x.hours), 0);
export const flexiDays = (hours: number) => Math.floor(hours / FLEXI_DAY_HOURS);

/* ------------------------------------------------------------------ medical, library */

export const schemeFor = (cover?: MedicalCover) => MEDICAL_SCHEMES.find((s) => s.id === cover?.schemeId);
export const limitOf = (schemeId: string, benefit: ClaimBenefit) => {
  const s = MEDICAL_SCHEMES.find((x) => x.id === schemeId);
  if (!s) return 0;
  return benefit === 'INPATIENT' ? s.inpatientLimit : benefit === 'OUTPATIENT' ? s.outpatientLimit : benefit === 'DENTAL' ? s.dentalLimit : s.opticalLimit;
};
/** Approved claims against a benefit this calendar year. */
export const utilised = (claims: MedicalClaim[], staffId: string, benefit: ClaimBenefit, year = todayIso().slice(0, 4)) =>
  claims.filter((c) => c.staffId === staffId && c.benefit === benefit && c.status === 'APPROVED' && c.date.startsWith(year)).reduce((n, c) => n + (c.approvedKes ?? c.amountKes), 0);

export const loanFine = (l: LibraryLoan, on = todayIso()) => Math.max(0, daysBetweenIso(l.due, l.returned ?? on)) * FINE_PER_DAY_KES;

/* ------------------------------------------------------------------ salary structure */

export const defaultGradeRules = (): GradeRule[] =>
  GRADE_BANDS.map((b) => ({ grade: b.grade, min: b.min, mid: b.mid, max: b.max, notches: 5, housePct: 15, transportKes: b.min >= 100_000 ? 8_000 : 4_000 }));

export const notchesOf = (r: GradeRule) => Array.from({ length: r.notches }, (_, i) => Math.round((r.min + ((r.max - r.min) * i) / Math.max(1, r.notches - 1)) / 500) * 500);

export const validateGradeRules = (rules: GradeRule[]) => {
  const errs: string[] = [];
  rules.forEach((r) => {
    if (!(r.min > 0 && r.min <= r.mid && r.mid <= r.max)) errs.push(`${r.grade}: minimum ≤ midpoint ≤ maximum, all above zero.`);
    if (r.notches < 1 || r.notches > 20) errs.push(`${r.grade}: 1 to 20 notches.`);
    if (r.housePct < 0 || r.housePct > 50) errs.push(`${r.grade}: house allowance 0–50% of basic.`);
    if (r.transportKes < 0) errs.push(`${r.grade}: transport cannot be negative.`);
  });
  for (let i = 1; i < rules.length; i++) if (rules[i].min < rules[i - 1].min) errs.push(`${rules[i].grade} starts below ${rules[i - 1].grade}.`);
  return errs;
};

/* ------------------------------------------------------------------ payroll journal by cost centre */

export interface GlRow {
  department: string;
  casual: boolean;
  gross: number;
  employer: number;
  paye: number;
  statutory: number;
  other: number;
  net: number;
}

/** Journal lines: one cost line per Finance cost centre (salaried and casual separately), liabilities and net pay. */
export const payrollJournalLines = (rows: GlRow[], map: PayrollGlMap) => {
  const cc = (dept: string) => map.costCentre[dept] ?? 'Administration';
  const groups = new Map<string, { gross: number; employer: number; casual: number; depts: Set<string> }>();
  for (const r of rows) {
    const k = cc(r.department);
    const g = groups.get(k) ?? { gross: 0, employer: 0, casual: 0, depts: new Set<string>() };
    if (r.casual) g.casual += r.gross;
    else g.gross += r.gross;
    g.employer += r.employer;
    g.depts.add(r.department);
    groups.set(k, g);
  }
  const sum = (f: (r: GlRow) => number) => Math.round(rows.reduce((n, r) => n + f(r), 0));
  const lines: { id: string; account: string; description: string; debit: number; credit: number; department?: string }[] = [];
  let n = 0;
  for (const [dept, g] of [...groups.entries()].sort()) {
    const names = [...g.depts].join(', ');
    if (g.gross) lines.push({ id: `l${++n}`, account: map.salaries, description: `Salaries & allowances — ${names}`, debit: Math.round(g.gross), credit: 0, department: dept });
    if (g.casual) lines.push({ id: `l${++n}`, account: map.casualWages, description: `Casual & seasonal wages — ${names}`, debit: Math.round(g.casual), credit: 0, department: dept });
    if (g.employer) lines.push({ id: `l${++n}`, account: map.employerCosts, description: `Employer NSSF, housing levy and NITA — ${names}`, debit: Math.round(g.employer), credit: 0, department: dept });
  }
  const paye = sum((r) => r.paye);
  const stat = sum((r) => r.statutory + r.employer);
  const other = sum((r) => r.other);
  const debits = lines.reduce((x, l) => x + l.debit, 0);
  // Net pay balances the journal so rounding never leaves it out by a shilling
  const net = debits - paye - stat - other;
  lines.push({ id: `l${++n}`, account: map.paye, description: 'PAYE withheld', debit: 0, credit: paye });
  lines.push({ id: `l${++n}`, account: map.statutory, description: 'NSSF, SHIF, housing levy and NITA (employee and employer)', debit: 0, credit: stat });
  if (other) lines.push({ id: `l${++n}`, account: map.otherDeductions, description: 'Pension, loans, SACCO and other deductions', debit: 0, credit: other });
  lines.push({ id: `l${++n}`, account: map.netPay, description: 'Net pay — bank transfer and M-Pesa', debit: 0, credit: net });
  return lines.filter((l) => l.debit || l.credit);
};

/* ------------------------------------------------------------------ bank / DME files */

export interface DmeLine {
  staffId: string;
  name: string;
  rail: 'Bank' | 'M-Pesa';
  account: string;
  bank?: string;
  amount: number;
}

const simpleHash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0').toUpperCase();
};
const pad = (s: string | number, n: number, right = false) => (right ? String(s).slice(0, n).padStart(n, '0') : String(s).slice(0, n).padEnd(n, ' '));

/** Builds a bank transfer file with header, detail and trailer (control totals) in the chosen bank's layout. */
export const buildDmeFile = (format: BankFormat, opts: { company: string; debitAccount: string; period: string; valueDate: string; lines: DmeLine[] }) => {
  const lines = opts.lines.filter((l) => (format === 'MPESA_B2C' ? l.rail === 'M-Pesa' : l.rail === 'Bank') && l.amount > 0);
  const total = lines.reduce((n, l) => n + Math.round(l.amount * 100) / 100, 0);
  const batch = `PAY${opts.period.replace('-', '')}`;
  const cents = (n: number) => Math.round(n * 100);
  let text = '';
  if (format === 'KCB_EFT') {
    const rows = [
      `H${pad(batch, 12)}${pad(opts.company.toUpperCase(), 35)}${pad(opts.debitAccount.replace(/\D/g, ''), 16, true)}${opts.valueDate.replace(/-/g, '')}${pad(lines.length, 6, true)}`,
      ...lines.map((l, i) => `D${pad(i + 1, 6, true)}${pad(l.account.replace(/\W/g, ''), 20)}${pad(l.name.toUpperCase(), 35)}${pad(cents(l.amount), 15, true)}${pad(`SALARY ${opts.period}`, 20)}`),
      `T${pad(lines.length, 6, true)}${pad(cents(total), 18, true)}`
    ];
    text = rows.join('\r\n');
  } else if (format === 'MPESA_B2C') {
    text = [
      `Batch,${batch},Organisation,${opts.company},Count,${lines.length},Total,${total.toFixed(2)}`,
      'Phone,Name,Amount,Narration',
      ...lines.map((l) => `${l.account.replace(/\s|\*/g, '')},"${l.name}",${l.amount.toFixed(2)},Salary ${opts.period}`)
    ].join('\n');
  } else {
    const code = BANK_FORMATS[format].bankCode;
    text = [
      `HDR,${batch},${opts.debitAccount},${opts.valueDate},${lines.length},${total.toFixed(2)}`,
      'Seq,Beneficiary,Account,BankCode,Amount,Reference',
      ...lines.map((l, i) => `${i + 1},"${l.name}",${l.account},${code},${l.amount.toFixed(2)},SAL-${l.staffId}`),
      `TRL,${lines.length},${total.toFixed(2)}`
    ].join('\n');
  }
  return { text, lines: lines.length, total: Math.round(total * 100) / 100, hash: simpleHash(text), batch };
};
