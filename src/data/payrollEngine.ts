import type { HREmployee, LeaveRequest, PayrollBatch } from '../types';
import { availableDays } from './leaveEngine';
import { INITIAL_LEAVE_REQUESTS } from './hrMockData';
import type { TaxProfile } from '../utils/tax';
import { computeStatutory, type StatutoryResult } from '../utils/statutory';
import { PAYROLL_POLICY, ratesOn, type PayrollPolicy } from './statutoryRates';
import { componentAt, PAY_COMPONENTS, type PayCalc, type PayComponentType } from './payComponents';
import { evalFormula } from '../utils/formula';
import { EMPLOYER_LOANS, LOAN_TYPE_LABEL, loanStartingBalance, SEED_LOANS, SEED_PAY_ITEMS, type PayItem, type StaffLoan } from './payItems';
import { payRunBatch, payRunRows } from './payRuns';

/**
 * One payroll engine for the whole hub. Payslips, payroll batches, the Finance payroll journal, summaries
 * and the employee portal all come from these functions, so the same employee shows the same pay everywhere.
 * The calculation follows the order in the client's payroll spec: gross → NSSF/SHIF/AHL → taxable pay →
 * PAYE bands → reliefs → net before voluntary deductions → two-thirds cap → net pay.
 */

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Salaries are paid on the 25th. */
export const PAY_DAY = 25;
/** The 2026 pay review raised salaries by about 8.7% (basic before the review = 92%). */
const REVIEW_YEAR = 2026;
const STANDARD_HOURS = 225;
const OT_RATE = 1.5;

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const round500 = (n: number) => Math.round(n / 500) * 500;
const pad = (n: number) => String(n).padStart(2, '0');
export const periodKey = (year: number, month: number) => `${year}-${pad(month + 1)}`;
const prevPeriod = (year: number, month: number) => (month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const isCasual = (e: HREmployee) => e.basicSalaryKes === 0 && !!e.payRateKes;
/** Department in force for a pay month (transfers don't rewrite paid months). */
export const departmentFor = (e: HREmployee, key: string) => {
  const moves = (e.departmentHistory ?? []).slice().sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const hit = moves.filter((m) => m.effectiveFrom <= key).pop();
  return hit ? hit.department : moves.length ? moves[0].previous : e.department;
};
/** Paid overtime for operational staff below KES 120k basic, judged as at the pay month. */
const operational = (e: HREmployee, year: number, month: number) => {
  const basic = basicFor(e, year, month);
  return ['Operations', 'Production & Quality Control', 'Engineering & Maintenance', 'General Services'].includes(departmentFor(e, periodKey(year, month))) && basic > 0 && basic < 120_000;
};

export const allowances = (basic: number) => ({ house: basic ? round500(basic * 0.15) : 0, transport: basic >= 100_000 ? 8_000 : basic > 0 ? 4_000 : 0 });
/** Basic salary for a month: the salary history entry in force, else the contract salary (92% before the 2026 review). */
export const basicFor = (e: HREmployee, year: number, month = 11) => {
  const key = periodKey(year, month);
  const hit = (e.salaryHistory ?? []).filter((h) => h.effectiveFrom <= key).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (hit) return hit.basic;
  const first = (e.salaryHistory ?? []).slice().sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
  // Before the first recorded change the employee was on the salary that change replaced
  const base = first ? first.previous : e.basicSalaryKes;
  return year < REVIEW_YEAR ? Math.round(base * 0.92) : base;
};

/** Days a daily-rated worker was paid for in a month (attendance-based, 18–24). */
export const daysWorked = (e: HREmployee, year: number, month: number) => 18 + ((hash(e.staffId) + year * 12 + month) % 7);
const overtimeHours = (e: HREmployee, year: number, month: number) => (operational(e, year, month) ? [0, 4, 8, 0, 6, 12, 2, 0, 10][(hash(e.staffId) + month + year) % 9] : 0);

/* ------------------------------------------------------------------ context */

export type ExitType = 'Resignation' | 'Retirement' | 'Contract Expiry' | 'Disciplinary Termination' | 'Redundancy';

/** An employee left off a period's payroll — nothing is paid until released (e.g. pending clearance or an investigation). */
export interface PayrollHold {
  staffId: string;
  period: string;
  reason: string;
  by: string;
  on: string;
}

/**
 * Days whose pay is withheld in full or in part: unauthorised absence (factor 1),
 * suspension on half pay (factor 0.5). Posted by Attendance and Disciplinary.
 */
export interface PayReduction {
  id: string;
  staffId: string;
  from: string;
  to: string;
  /** Share of the day's pay withheld: 1 = unpaid, 0.5 = half pay */
  factor: number;
  reason: string;
  source: 'Attendance' | 'Disciplinary' | 'Manual';
  ref?: string;
}

/** Everything posted to payroll besides the employee master: items, loans and terminal dues inputs. */
export interface PayrollContext {
  /** Pay item catalogue, every version */
  components: PayComponentType[];
  items: PayItem[];
  loans: StaffLoan[];
  policy: PayrollPolicy;
  /** Leave requests — approved unpaid leave reduces pay, and the annual leave balance is paid out on exit */
  leaveRequests: LeaveRequest[];
  /** Absence and suspension days that reduce pay */
  payReductions: PayReduction[];
  /** Employees taken off a period's payroll (salary held), by staff ID and period */
  holds: PayrollHold[];
  /** Manual override of untaken annual leave days to pay out on exit, by staff ID */
  exitLeaveDays: Record<string, number>;
  /** How each leaver left, by staff ID (drives severance and gratuity) */
  exitType: Record<string, ExitType>;
}

export const makeContext = (p: Partial<PayrollContext> = {}): PayrollContext => ({
  components: p.components ?? PAY_COMPONENTS,
  items: p.items ?? SEED_PAY_ITEMS,
  loans: p.loans ?? SEED_LOANS,
  policy: p.policy ?? PAYROLL_POLICY,
  leaveRequests: p.leaveRequests ?? INITIAL_LEAVE_REQUESTS,
  payReductions: p.payReductions ?? [],
  holds: p.holds ?? [],
  exitLeaveDays: p.exitLeaveDays ?? {},
  exitType: p.exitType ?? { 'KHE-0211': 'Retirement', 'KHE-0914': 'Resignation' }
});

export const SEED_CONTEXT = makeContext();

/* ------------------------------------------------------------------ payslip */

export interface PayLine {
  componentId: string;
  label: string;
  amount: number;
  /** Which statutory bases this line counts towards */
  flags: { paye: PayComponentType['paye']; nssf: boolean; shif: boolean; ahl: boolean; cash: boolean };
  ref?: string;
  itemId?: string;
  note?: string;
}

export interface DeductionLine {
  componentId: string;
  label: string;
  priority: number;
  requested: number;
  deducted: number;
  deferred: number;
  loanId?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  itemId?: string;
  ref?: string;
  note?: string;
}

export interface Payslip {
  staffId: string;
  name: string;
  orgId: string;
  department: string;
  year: number;
  month: number;
  period: string;
  periodKey: string;
  payDate: string;
  casual: boolean;
  /** Days paid out of a 30-day month (joiners / leavers are pro-rated) */
  daysPaid: number;
  daysInPeriod: number;
  basic: number;
  houseAllowance: number;
  transportAllowance: number;
  overtimeHours: number;
  overtime: number;
  daysWorked: number;
  wages: number;
  earnings: PayLine[];
  benefits: PayLine[];
  pretax: PayLine[];
  /** Cash gross: everything paid in cash before deductions */
  gross: number;
  nssfBase: number;
  shifBase: number;
  ahlBase: number;
  benefitsInKind: number;
  exemptCash: number;
  tax: StatutoryResult;
  nssf: number;
  shif: number;
  ahl: number;
  paye: number;
  taxNote: string;
  pretaxCash: number;
  netAfterStatutory: number;
  deductionCap: number;
  deductions: DeductionLine[];
  /** Kept for older screens: before-tax contributions and every voluntary deduction actually taken */
  otherDeductions: { label: string; amount: number }[];
  totalDeductions: number;
  net: number;
  employerNssf: number;
  employerAhl: number;
  nita: number;
  costToCompany: number;
  exit?: { date: string; type: string; finalSettlement: boolean };
  warnings: string[];
  statutory: {
    grossSalary: number;
    nssfTierI: number;
    nssfTierII: number;
    nssfTotalEe: number;
    nssfTotalEr: number;
    shif: number;
    ahlEe: number;
    ahlEr: number;
    taxableIncome: number;
    payeGross: number;
    personalRelief: number;
    housingRelief: number;
    payeNet: number;
    totalDeductions: number;
    netPay: number;
  };
}

/** Items in force for an employee in a period. */
export const itemsFor = (ctx: PayrollContext, staffId: string, key: string) =>
  ctx.items.filter((i) => i.staffId === staffId && i.status === 'ACTIVE' && (i.recurring ? i.period <= key && (!i.endPeriod || i.endPeriod >= key) : i.period === key));

/** Standing non-statutory deductions from the employee profile: welfare for salaried staff, SACCO for members. */
const standingDeductions = (e: HREmployee, year: number, month: number) => {
  if (isCasual(e)) return [] as { id: string; label: string; amount: number }[];
  const out = [{ id: 'WELFARE', label: 'Staff Welfare Fund', amount: 500 }];
  const h = hash(e.staffId);
  if (e.staffId === 'KHE-0102' || h % 3 === 0) out.unshift({ id: 'SACCO_SHARES', label: 'SACCO Contribution', amount: e.staffId === 'KHE-0102' ? 10_000 : 2_000 + (h % 5) * 1_000 });
  // Sample payroll input error the portal assistant should catch: SACCO captured twice in August 2026
  if (e.staffId === 'KHE-0102' && year === 2026 && month === 7) out.push({ id: 'SACCO_SHARES', label: 'SACCO Contribution', amount: 10_000 });
  return out;
};

/** Daily rate on the fixed 30-day convention (casual workers use their contract day rate). */
export const dailyRate = (e: HREmployee, year = new Date().getFullYear()) => {
  if (isCasual(e)) return e.payRateKes ?? 0;
  const basic = basicFor(e, year);
  const a = allowances(basic);
  return Math.round((basic + a.house + a.transport) / PAYROLL_POLICY.dayDivisor);
};

export const completedYears = (from: string, to: string) => {
  const [jy, jm, jd] = from.split('-').map(Number);
  const [xy, xm, xd] = to.split('-').map(Number);
  return Math.max(0, xy - jy - (xm < jm || (xm === jm && xd < jd) ? 1 : 0));
};

/** Company gratuity on retirement: 15 days' basic pay per completed year of service. */
export const gratuity = (e: HREmployee, exitDate: string) =>
  Math.round(completedYears(e.joinedDate, exitDate) * 15 * (basicFor(e, Number(exitDate.slice(0, 4))) / PAYROLL_POLICY.dayDivisor));

/** Statutory severance on redundancy: 15 days' gross pay per completed year (Employment Act s.40). */
export const severance = (e: HREmployee, exitDate: string) => completedYears(e.joinedDate, exitDate) * 15 * dailyRate(e, Number(exitDate.slice(0, 4)));

/** Terminal dues that payroll pays in the exit month. */
export const terminalDues = (e: HREmployee, ctx: PayrollContext = SEED_CONTEXT) => {
  const exit = e.exitDate;
  if (!exit) return { leavePay: 0, leaveDays: 0, gratuity: 0, severance: 0 };
  const type = ctx.exitType[e.staffId] ?? 'Resignation';
  // Annual leave balance from the leave ledger on the last working day (rounded down to half days)
  const leaveDays = ctx.exitLeaveDays[e.staffId] ?? Math.max(0, Math.floor(availableDays(e, 'AL', ctx.leaveRequests, exit) * 2) / 2);
  return {
    leaveDays,
    leavePay: Math.round(dailyRate(e, Number(exit.slice(0, 4))) * leaveDays),
    gratuity: type === 'Retirement' ? gratuity(e, exit) : 0,
    severance: type === 'Redundancy' ? severance(e, exit) : 0
  };
};

/** Named values a pay item formula can use, for one employee and month. */
export const formulaVars = (e: HREmployee, year: number, month: number, daysPaid = PAYROLL_POLICY.dayDivisor) => {
  const basic = isCasual(e) ? 0 : basicFor(e, year, month);
  const a = allowances(basic);
  const end = `${periodKey(year, month)}-28`;
  return {
    BASIC: basic,
    HOUSE: a.house,
    TRANSPORT: a.transport,
    PENSIONABLE: basic + a.house + a.transport,
    DAILY: dailyRate(e, year),
    HOURLY: Math.round((basic / STANDARD_HOURS) * 100) / 100,
    YEARS: completedYears(e.joinedDate, end),
    DAYS: daysPaid,
    QTY: 0
  };
};

/** Amount for a calculated pay item; throws if the formula is wrong. */
export const calcAmount = (calc: PayCalc | undefined, vars: Record<string, number>, qty = 0, typed = 0) => {
  if (!calc || calc.method === 'fixed') return typed;
  const v: Record<string, number> = { ...vars, QTY: qty };
  if (calc.method === 'percent') return Math.round(((calc.base === 'PENSIONABLE' ? v.PENSIONABLE : v.BASIC) * (calc.percent ?? 0)) / 100);
  if (calc.method === 'rate') return Math.round((calc.unit === 'DAILY' ? v.DAILY : v.HOURLY) * (calc.multiplier ?? 1) * qty);
  return Math.round(evalFormula(calc.expression ?? '0', v));
};

const line = (c: PayComponentType, amount: number, extra: Partial<PayLine>, policy: PayrollPolicy): PayLine => {
  const componentId = c.id;
  const nssf = componentId === 'OVERTIME' || componentId === 'OT_EXTRA' ? policy.overtimePensionable : c.nssf;
  const ahl = c.category === 'benefit_in_kind' ? policy.benefitsInKindAttractAhl && c.paye !== 'exempt' : c.ahl;
  return { componentId, label: c.name, amount, flags: { paye: c.paye, nssf, shif: c.shif, ahl, cash: c.isCash }, note: c.note, ...extra };
};

const cache = new WeakMap<PayrollContext, Map<string, Payslip>>();

/** Payslip for one employee and month, using the posted items and loans in `ctx`. */
export const payslip = (e: HREmployee, year: number, month: number, ctx: PayrollContext = SEED_CONTEXT): Payslip => {
  const key = periodKey(year, month);
  let memo = cache.get(ctx);
  if (!memo) cache.set(ctx, (memo = new Map()));
  // Rate version is part of the key so a newly added future version is picked up
  const memoKey = `${e.staffId}|${key}|${e.basicSalaryKes}|${(e.salaryHistory ?? []).map((h) => h.effectiveFrom + h.basic).join(',')}|${e.exitDate ?? ''}|${e.joinedDate}|${(e.departmentHistory ?? []).map((m) => m.effectiveFrom + m.department).join(',')}|${ratesOn(`${key}-${PAY_DAY}`).id}`;
  const hit = memo.get(memoKey);
  if (hit) return hit;

  const policy = ctx.policy;
  const payDate = `${key}-${PAY_DAY}`;
  const comp = (id: string) => componentAt(id, key, ctx.components);
  const casual = isCasual(e);
  const warnings: string[] = [];

  // Pro-rating on a fixed 30-day month (spec §13, method A: reduce basic directly)
  const div = policy.dayDivisor;
  const joinedThisMonth = e.joinedDate.slice(0, 7) === key;
  const exitThisMonth = !!e.exitDate && e.exitDate.slice(0, 7) === key;
  const startDay = joinedThisMonth ? Number(e.joinedDate.slice(8, 10)) : 1;
  const endDay = exitThisMonth ? Math.min(div, Number(e.exitDate!.slice(8, 10))) : div;
  // Approved unpaid leave in this month, in calendar days (spec §13.3)
  const monthStart = `${key}-01`;
  const monthEnd = `${key}-31`;
  const unpaidDays = casual
    ? 0
    : ctx.leaveRequests
        .filter((l) => l.staffId === e.staffId && l.status === 'APPROVED' && l.leaveType === 'Unpaid Leave' && l.startDate <= monthEnd && l.endDate >= monthStart)
        .reduce((n, l) => {
          const a = new Date((l.startDate > monthStart ? l.startDate : monthStart) + 'T00:00:00');
          const b = new Date((l.endDate < monthEnd ? l.endDate : monthEnd) + 'T00:00:00');
          return n + Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
        }, 0);
  // Unauthorised absence and suspension on part pay (calendar days × share withheld)
  const reductions = casual
    ? []
    : ctx.payReductions
        .filter((r) => r.staffId === e.staffId && r.from <= monthEnd && r.to >= monthStart)
        .map((r) => {
          const a = new Date((r.from > monthStart ? r.from : monthStart) + 'T00:00:00');
          const b = new Date((r.to < monthEnd ? r.to : monthEnd) + 'T00:00:00');
          return { r, days: (Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1) * r.factor };
        });
  const reducedDays = reductions.reduce((n, x) => n + x.days, 0);
  const daysPaid = casual ? div : Math.max(0, Math.min(div, endDay) - Math.min(div, startDay) + 1 - unpaidDays - reducedDays);
  const f = daysPaid / div;

  const fullBasic = casual ? 0 : basicFor(e, year, month);
  const a = allowances(fullBasic);
  const basic = Math.round(fullBasic * f);
  const house = Math.round(a.house * f);
  const transport = Math.round(a.transport * f);
  const otH = exitThisMonth || joinedThisMonth ? 0 : overtimeHours(e, year, month);
  const overtime = Math.round((fullBasic / STANDARD_HOURS) * OT_RATE * otH);
  const days = casual ? daysWorked(e, year, month) : 0;
  const wages = casual ? days * (e.payRateKes ?? 0) : 0;
  if (f < 1) {
    const why = [
      joinedThisMonth && `joined ${e.joinedDate}`,
      exitThisMonth && `left ${e.exitDate}`,
      unpaidDays && `${unpaidDays} days unpaid leave`,
      ...reductions.map((x) => `${x.days} days withheld — ${x.r.reason}`)
    ]
      .filter(Boolean)
      .join(', ');
    warnings.push(`Pro-rated: ${daysPaid} of ${div} days (${why})`);
  }

  const earnings: PayLine[] = [];
  const benefits: PayLine[] = [];
  const pretax: PayLine[] = [];
  if (basic) earnings.push(line(comp('BASIC'), basic, f < 1 ? { ref: `${daysPaid}/${div} days of KES ${fullBasic.toLocaleString()}` } : {}, policy));
  if (house) earnings.push(line(comp('HOUSE'), house, {}, policy));
  if (transport) earnings.push(line(comp('TRANSPORT'), transport, {}, policy));
  if (overtime) earnings.push(line(comp('OVERTIME'), overtime, { ref: `${otH} hours at 1.5×` }, policy));
  if (wages) earnings.push(line(comp('WAGES'), wages, { ref: `${days} days × KES ${e.payRateKes}` }, policy));

  const voluntaryItems: PayItem[] = [];
  const vars = formulaVars(e, year, month, daysPaid);
  for (const it of itemsFor(ctx, e.staffId, key)) {
    const c = comp(it.componentId);
    let amount = it.amount;
    let ref = it.reference;
    if (it.auto) {
      try {
        amount = calcAmount(c.calc, vars, it.quantity ?? 0, it.amount);
        if (it.quantity) ref = `${ref} · ${it.quantity} ${(c.calc?.qtyLabel ?? 'units').toLowerCase()}`;
      } catch (err) {
        warnings.push(`${c.name}: formula error (${(err as Error).message}) — posted amount used`);
      }
    }
    if (amount <= 0) continue;
    if (c.category === 'deduction') {
      voluntaryItems.push({ ...it, amount });
      continue;
    }
    const l = line(c, amount, { ref, itemId: it.id }, policy);
    if (c.category === 'earning' || c.category === 'reimbursement') earnings.push(l);
    else if (c.category === 'benefit_in_kind') benefits.push(l);
    else if (c.category === 'pretax') pretax.push(l);
  }

  // Terminal dues in the exit month
  let exitInfo: Payslip['exit'];
  if (exitThisMonth) {
    const dues = terminalDues(e, ctx);
    const years = completedYears(e.joinedDate, e.exitDate!);
    exitInfo = { date: e.exitDate!, type: ctx.exitType[e.staffId] ?? 'Resignation', finalSettlement: policy.recoverLoansOnExit };
    if (dues.leavePay) earnings.push(line(comp('LEAVE_PAY'), dues.leavePay, { ref: `${dues.leaveDays} untaken days × KES ${dailyRate(e, year).toLocaleString()}` }, policy));
    if (dues.gratuity) earnings.push(line(comp('GRATUITY'), dues.gratuity, { ref: `15 days’ basic × ${years} completed years` }, policy));
    if (dues.severance) earnings.push(line(comp('SEVERANCE'), dues.severance, { ref: `15 days’ pay × ${years} completed years` }, policy));
  }

  // Loans: opening balance and arrears carried from last month's payslip
  const rates = ratesOn(payDate);
  const loanOpen = ctx.loans
    .filter((l) => l.staffId === e.staffId && l.startPeriod <= key && !(l.suspendedFrom && l.suspendedFrom <= key))
    .map((l) => ({ loan: l, ...loanOpening(l, e, year, month, ctx) }));

  // Below-market employer loans are a taxable benefit
  for (const lo of loanOpen) {
    if (EMPLOYER_LOANS.includes(lo.loan.type) && lo.loan.ratePa < rates.prescribedLoanRate && lo.balance > 0) {
      const benefit = Math.round((lo.balance * (rates.prescribedLoanRate - lo.loan.ratePa)) / 12);
      if (benefit > 0) {
        benefits.push(
          line(comp('LOAN_BIK'), benefit, { ref: `KES ${lo.balance.toLocaleString()} × (${Math.round(rates.prescribedLoanRate * 100)}% − ${+(lo.loan.ratePa * 100).toFixed(2)}%) ÷ 12` }, policy)
        );
      }
    }
  }

  // Statutory bases, each from its own component flags (spec §18.2)
  const cashLines = earnings.filter((l) => l.flags.cash);
  const gross = cashLines.reduce((s, l) => s + l.amount, 0);
  const nssfBase = earnings.filter((l) => l.flags.nssf).reduce((s, l) => s + l.amount, 0);
  const shifBase = [...earnings, ...benefits].filter((l) => l.flags.shif).reduce((s, l) => s + l.amount, 0);
  const ahlBase = [...earnings, ...benefits].filter((l) => l.flags.ahl).reduce((s, l) => s + l.amount, 0);
  const exemptCash = cashLines.filter((l) => l.flags.paye === 'exempt').reduce((s, l) => s + l.amount, 0);
  const benefitsInKind = benefits.reduce((s, l) => {
    const c = comp(l.componentId);
    if (c.paye === 'exempt') return s;
    if (c.paye === 'exempt_up_to_cap') return s + Math.max(0, l.amount - (c.payeExemptCap ?? 0));
    return s + l.amount;
  }, 0);
  const pick = (id: string) => pretax.filter((l) => l.componentId === id).reduce((s, l) => s + l.amount, 0);
  const insurancePremium = voluntaryItems.filter((i) => i.componentId === 'INSURANCE').reduce((s, i) => s + i.amount, 0);

  const profile: TaxProfile = (e.tax as TaxProfile | undefined) ?? { employment: 'PRIMARY', pwdExempt: false, taxExempt: false };
  const pwdLapsed = profile.pwdExempt && !!profile.pwdCertificateExpiry && profile.pwdCertificateExpiry < payDate;
  if (pwdLapsed) warnings.push('PWD certificate has expired — exemption not applied');
  const tax = computeStatutory({
    date: payDate,
    cashGross: gross,
    nssfBase,
    shifBase,
    ahlBase,
    benefitsInKind,
    exemptCash,
    pension: pick('PENSION'),
    mortgageInterest: pick('MORTGAGE_INTEREST'),
    pmf: pick('PMF'),
    insurancePremium,
    profile: pwdLapsed ? { ...profile, pwdExempt: false } : profile
  });

  // Pension and PMF leave the pay with the statutory deductions; mortgage interest is information only
  const pretaxCash = pick('PENSION') + pick('PMF');
  const netAfterStatutory = gross - tax.nssfEe - tax.shif - tax.ahlEe - tax.paye - pretaxCash;
  const finalSettlement = !!exitInfo?.finalSettlement;
  const deductionCap = Math.max(0, Math.floor(netAfterStatutory * rates.deductionCap));

  // Voluntary deduction queue in legal priority order (spec §11.5)
  const queue: Omit<DeductionLine, 'deducted' | 'deferred'>[] = [];
  for (const lo of loanOpen) {
    const l = lo.loan;
    const interest = l.method === 'reducing' ? Math.round((lo.balance * l.ratePa) / 12) : 0;
    const owed = lo.balance + interest;
    if (owed <= 0) continue;
    const requested = finalSettlement ? owed : Math.min(owed, l.installment + lo.arrears);
    queue.push({
      componentId: l.type,
      label: `${LOAN_TYPE_LABEL[l.type]} — ${l.lender}`,
      priority: comp(l.type).priority ?? 6,
      requested,
      loanId: l.id,
      balanceBefore: owed,
      ref: l.reference,
      note: finalSettlement
        ? 'Full balance recovered from final dues'
        : lo.arrears
          ? `Includes KES ${lo.arrears.toLocaleString()} deferred from last month`
          : interest
            ? `Interest KES ${interest.toLocaleString()} this month`
            : undefined
    });
  }
  for (const it of voluntaryItems) {
    const c = comp(it.componentId);
    queue.push({ componentId: c.id, label: c.name, priority: c.priority ?? 6, requested: it.amount, itemId: it.id, ref: it.reference });
  }
  for (const s of standingDeductions(e, year, month)) {
    queue.push({ componentId: s.id, label: s.label, priority: comp(s.id).priority ?? 6, requested: s.amount, ref: 'Standing deduction' });
  }
  queue.sort((x, y) => x.priority - y.priority);

  // Final dues are not bound by the two-thirds cap — loans are recovered in full where the money allows
  let room = finalSettlement ? Math.max(0, netAfterStatutory) : deductionCap;
  const deductions: DeductionLine[] = queue.map((q) => {
    const deducted = Math.max(0, Math.min(q.requested, room));
    room -= deducted;
    const deferred = q.requested - deducted;
    const d: DeductionLine = { ...q, deducted, deferred };
    if (q.loanId) d.balanceAfter = (q.balanceBefore ?? 0) - deducted;
    if (deferred > 0) {
      warnings.push(
        finalSettlement
          ? `${q.label}: KES ${deferred.toLocaleString()} could not be recovered from final dues — refer to Finance`
          : `${q.label}: KES ${deferred.toLocaleString()} deferred — deductions would exceed two-thirds of net pay`
      );
    }
    return d;
  });

  const voluntary = deductions.reduce((s, d) => s + d.deducted, 0);
  const totalDeductions = tax.nssfEe + tax.shif + tax.ahlEe + tax.paye + pretaxCash + voluntary;
  const net = gross - totalDeductions;
  const otherDeductions = [
    ...pretax.filter((l) => l.flags.cash).map((l) => ({ label: l.label, amount: l.amount })),
    ...deductions.filter((d) => d.deducted > 0).map((d) => ({ label: d.label, amount: d.deducted }))
  ];

  const slip: Payslip = {
    staffId: e.staffId,
    name: e.fullName,
    orgId: e.orgId,
    department: e.department,
    year,
    month,
    period: `${MONTHS[month]} ${year}`,
    periodKey: key,
    payDate,
    casual,
    daysPaid,
    daysInPeriod: div,
    basic,
    houseAllowance: house,
    transportAllowance: transport,
    overtimeHours: otH,
    overtime,
    daysWorked: days,
    wages,
    earnings,
    benefits,
    pretax,
    gross,
    nssfBase: tax.nssfBase,
    shifBase,
    ahlBase,
    benefitsInKind,
    exemptCash,
    tax,
    nssf: tax.nssfEe,
    shif: tax.shif,
    ahl: tax.ahlEe,
    paye: tax.paye,
    taxNote: tax.note,
    pretaxCash,
    netAfterStatutory,
    deductionCap,
    deductions,
    otherDeductions,
    totalDeductions,
    net,
    employerNssf: tax.nssfEr,
    employerAhl: tax.ahlEr,
    nita: tax.nita,
    costToCompany: gross + tax.nssfEr + tax.ahlEr + tax.nita,
    exit: exitInfo,
    warnings,
    statutory: {
      grossSalary: gross,
      nssfTierI: tax.nssfTierI,
      nssfTierII: tax.nssfTierII,
      nssfTotalEe: tax.nssfEe,
      nssfTotalEr: tax.nssfEr,
      shif: tax.shif,
      ahlEe: tax.ahlEe,
      ahlEr: tax.ahlEr,
      taxableIncome: Math.round(tax.taxablePay),
      payeGross: Math.round(tax.grossTax),
      personalRelief: tax.personalRelief,
      housingRelief: Math.round(tax.housingRelief),
      payeNet: tax.paye,
      totalDeductions: tax.nssfEe + tax.shif + tax.ahlEe + tax.paye,
      netPay: gross - tax.nssfEe - tax.shif - tax.ahlEe - tax.paye
    }
  };
  memo.set(memoKey, slip);
  return slip;
};

/** Balance and arrears at the start of a month: carried from the latest payslip that recovered the loan. */
const loanOpening = (l: StaffLoan, e: HREmployee, year: number, month: number, ctx: PayrollContext) => {
  for (let p = prevPeriod(year, month); periodKey(p.year, p.month) >= l.startPeriod; p = prevPeriod(p.year, p.month)) {
    const k = periodKey(p.year, p.month);
    // Not on payroll that month (before joining, after leaving, or pay held): nothing was recovered
    if (e.joinedDate > `${k}-31` || (e.exitDate && e.exitDate < `${k}-01`) || ctx.holds.some((h) => h.staffId === e.staffId && h.period === k)) continue;
    const d = payslip(e, p.year, p.month, ctx).deductions.find((x) => x.loanId === l.id);
    if (d) return { balance: d.balanceAfter ?? 0, arrears: d.deferred };
  }
  return { balance: loanStartingBalance(l), arrears: 0 };
};

/** Employees on the payroll for a month: joined by month end and not gone before it started. */
export const payableIn = (list: HREmployee[], orgId: string, year: number, month: number) => {
  const start = `${periodKey(year, month)}-01`;
  const end = `${periodKey(year, month)}-31`;
  // Leavers are paid up to the month of their exit date
  const employed = (e: HREmployee) => (e.exitDate ? e.exitDate >= start : e.status !== 'TERMINATED');
  return list.filter((e) => e.orgId === orgId && employed(e) && e.joinedDate <= end && (e.basicSalaryKes > 0 || isCasual(e)));
};

export interface RunTotals {
  workers: number;
  gross: number;
  paye: number;
  nssf: number;
  shif: number;
  ahl: number;
  employerNssf: number;
  employerAhl: number;
  nita: number;
  pretax: number;
  other: number;
  net: number;
  slips: Payslip[];
}

export const sumSlips = (slips: Payslip[]): RunTotals => ({
  workers: slips.length,
  gross: slips.reduce((s, x) => s + x.gross, 0),
  paye: slips.reduce((s, x) => s + x.paye, 0),
  nssf: slips.reduce((s, x) => s + x.nssf, 0),
  shif: slips.reduce((s, x) => s + x.shif, 0),
  ahl: slips.reduce((s, x) => s + x.ahl, 0),
  employerNssf: slips.reduce((s, x) => s + x.employerNssf, 0),
  employerAhl: slips.reduce((s, x) => s + x.employerAhl, 0),
  nita: slips.reduce((s, x) => s + x.nita, 0),
  pretax: slips.reduce((s, x) => s + x.pretaxCash, 0),
  other: slips.reduce((s, x) => s + x.deductions.reduce((y, d) => y + d.deducted, 0), 0),
  net: slips.reduce((s, x) => s + x.net, 0),
  slips
});

/** Salaried staff for the month, casual workers for the month, and both together. */
/** Whether an employee's pay is held (left off the run) for a period. */
export const isHeld = (ctx: PayrollContext, staffId: string, key: string) => ctx.holds.some((h) => h.staffId === staffId && h.period === key);

export const monthRun = (list: HREmployee[], orgId: string, year: number, month: number, ctx: PayrollContext = SEED_CONTEXT) => {
  const people = payableIn(list, orgId, year, month).filter((e) => !isHeld(ctx, e.staffId, periodKey(year, month)));
  const salaried = sumSlips(people.filter((e) => !isCasual(e)).map((e) => payslip(e, year, month, ctx)));
  const casual = sumSlips(people.filter(isCasual).map((e) => payslip(e, year, month, ctx)));
  return { salaried, casual, total: sumSlips([...salaried.slips, ...casual.slips]) };
};

/** The month most recently paid (salaries go out on the 25th). */
export const latestPaidMonth = (today = new Date()) => new Date(today.getFullYear(), today.getMonth() - (today.getDate() >= PAY_DAY ? 0 : 1), 1);

/** The period payroll is preparing now — items can only be posted to it or later. */
export const openPeriod = (today = new Date()) => {
  const p = latestPaidMonth(today);
  const d = new Date(p.getFullYear(), p.getMonth() + 1, 1);
  return { year: d.getFullYear(), month: d.getMonth(), key: periodKey(d.getFullYear(), d.getMonth()), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
};

/** Payroll batches for every company: three paid months, this month in preparation, and recent weeks for casual workers. */
export const buildPayrollBatches = (list: HREmployee[], today = new Date(), ctx: PayrollContext = SEED_CONTEXT): PayrollBatch[] => {
  const out: PayrollBatch[] = [];
  const orgs = [...new Set(list.map((e) => e.orgId))];
  const paid = latestPaidMonth(today);
  for (const orgId of orgs) {
    const branch = list.find((e) => e.orgId === orgId)?.branch ?? orgId;
    const code = orgId.replace('org-', '').toUpperCase().slice(0, 4);
    for (let k = 0; k <= 3; k++) {
      const d = new Date(paid.getFullYear(), paid.getMonth() + 1 - k, 1);
      const inPrep = k === 0;
      const run = monthRun(list, orgId, d.getFullYear(), d.getMonth(), ctx).salaried;
      if (!run.workers) continue;
      const mm = pad(d.getMonth() + 1);
      out.push({
        id: `PAY-${d.getFullYear()}-${mm}-${code}`,
        orgId,
        batchNo: `BATCH-${d.getFullYear()}-${mm}-${code}`,
        period: `${MONTHS[d.getMonth()]} ${d.getFullYear()}${inPrep ? ' (in preparation)' : ''}`,
        branch,
        pipeline: 'Monthly Payroll',
        totalGrossKes: run.gross,
        totalPayeKes: run.paye,
        totalNssfKes: run.nssf,
        totalShifKes: run.shif,
        totalAhlKes: run.ahl,
        totalNetDisbursementKes: run.net,
        workerCount: run.workers,
        status: inPrep ? 'CALCULATED' : 'POSTED_GL',
        runDate: inPrep ? isoDay(today) : `${d.getFullYear()}-${mm}-22`
      });
    }
    // Weekly runs for daily-rated workers, calculated by the same pay-run engine as runs created in Pay runs
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    for (let w = 0; w <= 3; w++) {
      const start = new Date(monday);
      start.setDate(monday.getDate() - 7 * w);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const from = isoDay(start);
      const to = isoDay(end);
      const rows = payRunRows(list, orgId, from, to);
      if (!rows.length) continue;
      const week = Math.ceil(((start.getTime() - new Date(start.getFullYear(), 0, 1).getTime()) / 86_400_000 + 1) / 7);
      const period = `Week ${week} (${start.getDate()} ${MONTHS[start.getMonth()].slice(0, 3)} – ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)})${w === 0 ? ' — this week' : ''}`;
      out.push({
        ...payRunBatch({ kind: 'WEEKLY', from, to, payDate: to, branch: 'All sites' }, orgId, { id: `PAY-${start.getFullYear()}-W${week}-${code}`, batchNo: `BATCH-${start.getFullYear()}-W${week}-${code}`, period }, rows, w === 0 ? 'CALCULATED' : 'DISBURSED_MPESA'),
        runDate: isoDay(w === 0 ? today : end)
      });
    }
  }
  return out.sort((a, b) => b.runDate.localeCompare(a.runDate));
};
