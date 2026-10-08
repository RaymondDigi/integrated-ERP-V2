import type { HREmployee, PayrollBatch } from '../types';
import { computeStatutory } from '../utils/statutory';
import type { TaxProfile } from '../utils/tax';

/**
 * Pay runs for daily-rated (casual) workers over one day, one week or any date range. They sit beside the
 * monthly payroll: each run is its own batch with its own approval, payment and report. Monthly salaries stay
 * on the monthly calendar. Seeded weekly runs and runs created in Pay runs both come from payRunRows.
 */

export type PayRunKind = 'DAILY' | 'WEEKLY' | 'CUSTOM';

export const PAY_RUN_LABEL: Record<PayRunKind, string> = { DAILY: 'Daily payroll', WEEKLY: 'Weekly payroll', CUSTOM: 'Custom date payroll' };
export const PAY_RUN_PIPELINE: Record<PayRunKind, PayrollBatch['pipeline']> = { DAILY: 'Daily Payroll', WEEKLY: 'Weekly Payroll', CUSTOM: 'Custom Payroll' };
/** Longest custom run; anything longer belongs to the monthly payroll */
export const MAX_CUSTOM_DAYS = 31;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, '0');
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Local calendar day as YYYY-MM-DD */
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (iso: string, n: number) => {
  const d = dateOf(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
};
/** Calendar days from start to end, both included */
export const windowDays = (from: string, to: string) => Math.round((dateOf(to).getTime() - dateOf(from).getTime()) / 86_400_000) + 1;
/** e.g. "5 – 11 Oct 2026" */
export const rangeLabel = (from: string, to: string) => {
  const short = (iso: string) => dateOf(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${short(from)} – ${short(to)} ${to.slice(0, 4)}`;
};
export const siteOf = (e: HREmployee) => [e.branch, e.block].filter(Boolean).join(' — ');
const isDailyRated = (e: HREmployee) => e.basicSalaryKes === 0 && !!e.payRateKes;

/**
 * Days a daily-rated worker attended in the window: Monday to Saturday, about four days in five.
 * Stands in for clock-in records until attendance feeds pay.
 */
export const attendedDays = (e: HREmployee, from: string, to: string) => {
  let days = 0;
  for (let i = 0; i < windowDays(from, to); i++) {
    const iso = addDays(from, i);
    if (dateOf(iso).getDay() !== 0 && hash(e.staffId + iso) % 5 !== 0) days++;
  }
  return days;
};

export interface PayRunRequest {
  kind: PayRunKind;
  from: string;
  to: string;
  payDate: string;
  /** "All sites" or one site label */
  branch: string;
}

export const payRunWindowError = ({ kind, from, to }: Pick<PayRunRequest, 'kind' | 'from' | 'to'>): string | null => {
  if (!ISO.test(from) || !ISO.test(to)) return 'Pick a start and an end date.';
  if (to < from) return 'The end date is before the start date.';
  const n = windowDays(from, to);
  if (kind === 'DAILY' && n !== 1) return 'A daily run covers one day: the end date must equal the start date.';
  if (kind === 'WEEKLY' && n !== 7) return 'A weekly run covers seven days.';
  if (kind === 'CUSTOM' && n > MAX_CUSTOM_DAYS) return `A custom run covers at most ${MAX_CUSTOM_DAYS} days. Use the monthly payroll for longer periods.`;
  return null;
};

export interface PayRunRow {
  e: HREmployee;
  site: string;
  days: number;
  rate: number;
  gross: number;
  nssf: number;
  shif: number;
  ahl: number;
  paye: number;
  net: number;
}

/**
 * Daily-rated workers employed in the window, paid for the days attended at their day rate.
 * Statutory deductions are worked on the 30-day equivalent of the pay and scaled back, so the monthly PAYE
 * bands apply fairly to a short run.
 */
export const payRunRows = (list: HREmployee[], orgId: string, from: string, to: string, branch = 'All sites'): PayRunRow[] => {
  const scale = windowDays(from, to) / 30;
  const out: PayRunRow[] = [];
  for (const e of list) {
    if (e.orgId !== orgId || !isDailyRated(e)) continue;
    if (e.joinedDate > to || (e.exitDate ? e.exitDate < from : e.status === 'TERMINATED')) continue;
    const site = siteOf(e);
    if (branch !== 'All sites' && site !== branch) continue;
    const days = attendedDays(e, from, to);
    if (!days) continue;
    const rate = e.payRateKes ?? 0;
    const gross = days * rate;
    const s = computeStatutory({ date: to, cashGross: gross / scale, profile: e.tax as TaxProfile | undefined });
    const nssf = Math.round(s.nssfEe * scale);
    const shif = Math.round(s.shif * scale);
    const ahl = Math.round(s.ahlEe * scale);
    const paye = Math.round(s.paye * scale);
    out.push({ e, site, days, rate, gross, nssf, shif, ahl, paye, net: gross - nssf - shif - ahl - paye });
  }
  return out.sort((a, b) => a.site.localeCompare(b.site) || a.e.fullName.localeCompare(b.e.fullName));
};

/** A run already covering any of the same days at the same site (or across all sites): those days would be paid twice */
export const payRunClash = (batches: PayrollBatch[], orgId: string, req: Pick<PayRunRequest, 'from' | 'to' | 'branch'>) =>
  batches.find(
    (b) =>
      b.orgId === orgId &&
      b.pipeline !== 'Monthly Payroll' &&
      !!b.periodFrom &&
      !!b.periodTo &&
      b.periodFrom <= req.to &&
      b.periodTo >= req.from &&
      (b.branch === req.branch || b.branch === 'All sites' || req.branch === 'All sites')
  );

export const payRunTotals = (rows: PayRunRow[]) =>
  rows.reduce(
    (t, r) => ({ workers: t.workers + 1, gross: t.gross + r.gross, paye: t.paye + r.paye, nssf: t.nssf + r.nssf, shif: t.shif + r.shif, ahl: t.ahl + r.ahl, net: t.net + r.net }),
    { workers: 0, gross: 0, paye: 0, nssf: 0, shif: 0, ahl: 0, net: 0 }
  );

/** The batch row for a run, with its window kept so it can be reported and checked for overlaps */
export const payRunBatch = (
  req: PayRunRequest,
  orgId: string,
  ids: { id: string; batchNo: string; period?: string },
  rows: PayRunRow[],
  status: PayrollBatch['status'] = 'CALCULATED'
): PayrollBatch => {
  const t = payRunTotals(rows);
  return {
    id: ids.id,
    orgId,
    batchNo: ids.batchNo,
    period: ids.period ?? `${PAY_RUN_LABEL[req.kind]}: ${rangeLabel(req.from, req.to)}`,
    branch: req.branch,
    pipeline: PAY_RUN_PIPELINE[req.kind],
    totalGrossKes: t.gross,
    totalPayeKes: t.paye,
    totalNssfKes: t.nssf,
    totalShifKes: t.shif,
    totalAhlKes: t.ahl,
    totalNetDisbursementKes: t.net,
    workerCount: t.workers,
    status,
    runDate: req.to,
    periodFrom: req.from,
    periodTo: req.to,
    payDate: req.payDate
  };
};
