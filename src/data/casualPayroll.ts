import type { HREmployee } from '../types';
import { computeStatutory } from '../utils/statutory';
import type { TaxProfile } from '../utils/tax';
import { addDays, siteOf, windowDays, type PayRunRow } from './payRuns';
import { componentById } from './payComponents';
import type { PayItem } from './payItems';

/**
 * The farmers' (casual per-kg) payroll: tea pluckers paid for the green leaf they deliver, weighed at the
 * collection centre. Pay = kilograms × rate per kg, plus a bonus for every kilo above the target on a day,
 * plus a top-up so that no day is worth less than the minimum daily wage. Statutory deductions follow the
 * same rules as the other pay runs.
 */

export interface CasualTerms {
  /** KES paid per kilo of green leaf */
  ratePerKg: number;
  /** KES a worked day must reach; a top-up is paid when the kilos fall short */
  minimumDailyWage: number;
  /** Kilos a plucker is expected to deliver in a day */
  targetKgPerDay: number;
  /** KES per kilo delivered above the target on a day */
  bonusPerKgAbove: number;
}

export const DEFAULT_CASUAL_TERMS: CasualTerms = { ratePerKg: 20, minimumDailyWage: 300, targetKgPerDay: 25, bonusPerKgAbove: 2 };

/** Default window for a casual run: a fortnight, the usual plucking pay cycle */
export const CASUAL_DAYS = 14;

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export const isPieceWorker = (e: HREmployee) => e.payUnit === 'KG';

/**
 * Green leaf (kg) a plucker delivered on a day: none on Sundays, about one working day in seven absent,
 * otherwise 12–34 kg. Stands in for weighbridge tickets until the collection-centre weights feed pay.
 */
export const leafKg = (staffId: string, iso: string) => {
  const h = hash(staffId + iso);
  if (new Date(`${iso}T00:00:00`).getDay() === 0 || h % 7 === 0) return 0;
  return 12 + ((h >>> 4) % 23);
};

/** Kilos a plucker delivered on a day: the weighing sheet's entry, else the weighbridge stand-in */
export type WeighFn = (staffId: string, iso: string) => number;

/** The weighing-sheet key for a plucker's day */
export const weighKey = (staffId: string, iso: string) => `${staffId}|${iso}`;

/** Pluckers employed in the window at the site */
export const pluckersInWindow = (list: HREmployee[], orgId: string, from: string, to: string, branch = 'All sites') =>
  list.filter((e) => {
    if (e.orgId !== orgId || !isPieceWorker(e)) return false;
    if (e.joinedDate > to || (e.exitDate ? e.exitDate < from : e.status === 'TERMINATED')) return false;
    return branch === 'All sites' || siteOf(e) === branch;
  });

/** Every weight a run was calculated on, kept with the run so its report cannot drift when the sheet changes */
export const weighSnapshot = (list: HREmployee[], orgId: string, from: string, to: string, weigh: WeighFn) => {
  const out: Record<string, number> = {};
  for (const e of pluckersInWindow(list, orgId, from, to))
    for (let i = 0; i < windowDays(from, to); i++) {
      const iso = addDays(from, i);
      out[weighKey(e.staffId, iso)] = weigh(e.staffId, iso);
    }
  return out;
};

/**
 * What a plucker owes from pay in the window: active deduction items (SACCO contributions, loan check-offs,
 * advances). Recurring items are charged pro rata to the window's days; one-off items (advances) are taken in
 * full in the run for their month.
 */
export const deductionsDue = (items: PayItem[], staffId: string, from: string, to: string) => {
  const month = to.slice(0, 7);
  const days = windowDays(from, to);
  let due = 0;
  for (const i of items) {
    if (i.staffId !== staffId || i.status !== 'ACTIVE' || componentById(i.componentId)?.category !== 'deduction') continue;
    if (i.recurring) {
      if (i.period > month || (i.endPeriod && i.endPeriod < month)) continue;
      due += (i.amount * days) / 30;
    } else if (i.period === month) due += i.amount;
  }
  return Math.round(due);
};

/** The deductions due to each plucker for a run, kept with the run */
export const dueSnapshot = (list: HREmployee[], orgId: string, from: string, to: string, items: PayItem[]) =>
  Object.fromEntries(pluckersInWindow(list, orgId, from, to).map((e) => [e.staffId, deductionsDue(items, e.staffId, from, to)]));

export interface CasualRow extends PayRunRow {
  /** Kilos delivered in the window */
  kg: number;
  piece: number;
  bonus: number;
  topUp: number;
  /** Deductions taken from this pay (within the two-thirds limit) */
  deductions: number;
  /** Deductions due but held back by the two-thirds limit */
  deferred: number;
}

/**
 * Pluckers employed in the window, paid for the leaf they delivered. Deductions are worked on the 30-day
 * equivalent of the pay and scaled back to the window, as for the other runs. Deductions due are taken from
 * net pay up to two-thirds of it, as in the monthly payroll; the rest is deferred and shown on the run.
 */
export const casualRows = (
  list: HREmployee[],
  orgId: string,
  from: string,
  to: string,
  terms: CasualTerms,
  branch = 'All sites',
  weigh: WeighFn = leafKg,
  dueFor: (staffId: string) => number = () => 0
): CasualRow[] => {
  const days = windowDays(from, to);
  const scale = days / 30;
  const out: CasualRow[] = [];
  for (const e of pluckersInWindow(list, orgId, from, to, branch)) {
    const site = siteOf(e);
    let worked = 0;
    let kg = 0;
    let bonus = 0;
    for (let i = 0; i < days; i++) {
      const k = weigh(e.staffId, addDays(from, i));
      if (!k) continue;
      worked++;
      kg += k;
      bonus += Math.max(0, k - terms.targetKgPerDay) * terms.bonusPerKgAbove;
    }
    if (!worked) continue;
    const piece = Math.round(kg * terms.ratePerKg);
    const bonusKes = Math.round(bonus);
    const topUp = Math.round(Math.max(0, terms.minimumDailyWage * worked - kg * terms.ratePerKg - bonus));
    const gross = piece + bonusKes + topUp;
    const s = computeStatutory({ date: to, cashGross: gross / scale, profile: e.tax as TaxProfile | undefined });
    const nssf = Math.round(s.nssfEe * scale);
    const shif = Math.round(s.shif * scale);
    const ahl = Math.round(s.ahlEe * scale);
    const paye = Math.round(s.paye * scale);
    const netBefore = gross - nssf - shif - ahl - paye;
    const due = dueFor(e.staffId);
    const deductions = Math.min(due, Math.floor((netBefore * 2) / 3));
    out.push({ e, site, days: worked, rate: terms.ratePerKg, kg, piece, bonus: bonusKes, topUp, gross, nssf, shif, ahl, paye, deductions, deferred: due - deductions, net: netBefore - deductions });
  }
  return out.sort((a, b) => a.site.localeCompare(b.site) || a.e.fullName.localeCompare(b.e.fullName));
};

/** The terms in words, for reports and the run list */
export const casualBasis = (t: CasualTerms) =>
  `KES ${t.ratePerKg}/kg · minimum KES ${t.minimumDailyWage}/day · KES ${t.bonusPerKgAbove}/kg above ${t.targetKgPerDay} kg`;
