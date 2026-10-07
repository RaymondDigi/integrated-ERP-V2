import type { HREmployee } from '../types';
import { basicFor, formulaVars, payslip, type PayrollContext } from './payrollEngine';
import { bandOf, gradeOf } from './hireEngine';
import {
  COMPETENCIES,
  RATING_SCALE,
  RATINGS,
  STAGE_LABEL,
  isBoardAppraised,
  type Appraisal,
  type AppraisalStage,
  type CheckIn,
  type PerfCycle,
  type PerfGoal,
  type PerfSettings,
  type Potential,
  type Rating,
  type RewardLine
} from './perfConfig';

/* ------------------------------------------------------------------ scores */

export const ratingOf = (score: number): Rating => (score >= 4.5 ? 5 : score >= 3.5 ? 4 : score >= 2.5 ? 3 : score >= 1.5 ? 2 : 1);
export const ratingLabel = (r?: number) => (r ? RATING_SCALE[Math.round(r) as Rating]?.label ?? '' : '');

export const weightTotal = (goals: Pick<PerfGoal, 'weight'>[]) => goals.reduce((n, g) => n + (Number(g.weight) || 0), 0);

export interface Score {
  goals: number | null;
  comps: number | null;
  total: number | null;
}

/** Weighted goal score plus core competencies, for the employee's or the supervisor's ratings. */
export const scoreOf = (goals: PerfGoal[], ap: Pick<Appraisal, 'competencies'>, who: 'self' | 'sup', s: Pick<PerfSettings, 'goalsWeight' | 'competencyWeight'>): Score => {
  const rated = goals.filter((g) => g[who]);
  const w = weightTotal(rated);
  const gs = rated.length === goals.length && w ? rated.reduce((n, g) => n + (g[who] ?? 0) * g.weight, 0) / w : null;
  const cv = COMPETENCIES.map((c) => ap.competencies[c.id]?.[who]).filter((v): v is number => !!v);
  const cs = cv.length === COMPETENCIES.length ? cv.reduce((n, v) => n + v, 0) / cv.length : null;
  if (gs === null) return { goals: null, comps: cs, total: null };
  // A self-assessment without competency ratings is scored on goals only
  const total = cs === null ? gs : (gs * s.goalsWeight + cs * s.competencyWeight) / (s.goalsWeight + s.competencyWeight);
  return { goals: gs, comps: cs, total: Math.round(total * 100) / 100 };
};

/** Best rating known now: final, else what the line proposed, else the supervisor's score. */
export const currentRating = (ap: Appraisal, goals: PerfGoal[], s: PerfSettings): { rating?: Rating; provisional: boolean } => {
  if (ap.finalRating) return { rating: ap.finalRating, provisional: false };
  if (ap.proposedRating) return { rating: ap.proposedRating, provisional: true };
  const sc = scoreOf(goals, ap, 'sup', s);
  return sc.total !== null && ap.supOn ? { rating: ratingOf(sc.total), provisional: true } : { provisional: true };
};

/* ------------------------------------------------------------------ 9-box */

export const perfBand = (r: Rating): 0 | 1 | 2 => (r >= 4 ? 2 : r === 3 ? 1 : 0);
export const potBand = (p: Potential): 0 | 1 | 2 => (p === 'HIGH' ? 2 : p === 'MEDIUM' ? 1 : 0);

/** Box titles indexed [potential][performance]. */
export const NINE_BOX: string[][] = [
  ['Risk', 'Effective', 'Trusted professional'],
  ['Inconsistent', 'Core contributor', 'High performer'],
  ['Rough diamond', 'Growth employee', 'Future leader']
];

/* ------------------------------------------------------------------ distribution */

export const distribution = (ratings: Rating[]) => {
  const n = ratings.length;
  return RATINGS.map((r) => {
    const count = ratings.filter((x) => x === r).length;
    return { rating: r, count, pct: n ? Math.round((count / n) * 1000) / 10 : 0 };
  });
};

export const average = (xs: number[]) => (xs.length ? Math.round((xs.reduce((n, x) => n + x, 0) / xs.length) * 100) / 100 : null);

/* ------------------------------------------------------------------ rewards */

const monthsServed = (joined: string, cycle: Pick<PerfCycle, 'periodStart' | 'periodEnd'>) => {
  if (joined <= cycle.periodStart) return 12;
  const [y, m] = joined.split('-').map(Number);
  const [ey, em] = cycle.periodEnd.split('-').map(Number);
  return Math.max(0, Math.min(12, (ey - y) * 12 + (em - m) + 1));
};

/** Where pay sits in the grade band: compa-ratio and the merit matrix column. */
export const bandSpot = (e: HREmployee, basic: number) => {
  const grade = gradeOf(e);
  const b = bandOf(grade);
  const compa = b ? Math.round((basic / b.mid) * 100) / 100 : 1;
  const position: 0 | 1 | 2 = compa < 0.95 ? 0 : compa <= 1.05 ? 1 : 2;
  return { grade, band: b, compa, position };
};

/** Merit increase and bonus for one employee from the matrices, before costing. */
export const rewardFor = (e: HREmployee, rating: Rating, s: PerfSettings, cycle: PerfCycle, period: { year: number; month: number }): Omit<RewardLine, 'meritCost' | 'bonusCost'> => {
  const basic = formulaVars(e, period.year, period.month).BASIC;
  const spot = bandSpot(e, basic);
  const pct = s.meritMatrix[rating][spot.position];
  let newBasic = Math.round((basic * (1 + pct / 100)) / 100) * 100;
  let capped = false;
  if (spot.band && newBasic > spot.band.max) {
    newBasic = Math.max(basic, spot.band.max);
    capped = true;
  }
  const prorata = monthsServed(e.joinedDate, cycle) / 12;
  const bonus = Math.round((basic * s.bonusMonths[rating] * prorata) / 100) * 100;
  return {
    staffId: e.staffId,
    rating,
    basic,
    grade: spot.grade,
    compa: spot.compa,
    position: spot.position,
    meritPct: basic ? Math.round(((newBasic - basic) / basic) * 1000) / 10 : 0,
    newBasic,
    bonus,
    prorata,
    capped: capped || undefined
  };
};

/** Employer cost of a reward line from the payroll engine: a year of the higher salary, and the bonus month. */
export const rewardCost = (e: HREmployee, line: Pick<RewardLine, 'newBasic' | 'basic' | 'bonus'>, ctx: PayrollContext, period: { year: number; month: number; key: string }) => {
  const base = payslip(e, period.year, period.month, ctx);
  let meritCost = 0;
  if (line.newBasic > line.basic) {
    const raised: HREmployee = { ...e, salaryHistory: [...(e.salaryHistory ?? []), { effectiveFrom: period.key, basic: line.newBasic, previous: line.basic, reason: 'Merit (costing)' }] };
    meritCost = (payslip(raised, period.year, period.month, ctx).costToCompany - base.costToCompany) * 12;
  }
  let bonusCost = 0;
  if (line.bonus > 0) {
    const withBonus: PayrollContext = {
      ...ctx,
      items: [...ctx.items, { id: 'COSTING', orgId: e.orgId, staffId: e.staffId, componentId: 'BONUS', amount: line.bonus, period: period.key, recurring: false, reference: 'Costing', source: 'Bulk', postedBy: '', postedOn: '', status: 'ACTIVE' }]
    };
    bonusCost = payslip(e, period.year, period.month, withBonus).costToCompany - base.costToCompany;
  }
  return { meritCost: Math.round(meritCost), bonusCost: Math.round(bonusCost) };
};

/** Released ratings that can go into a reward run (disputed ones wait for HR's decision). */
export const rewardEligible = (ap: Appraisal, e?: HREmployee) =>
  !!e && !!ap.finalRating && ['ACKNOWLEDGEMENT', 'CLOSED'].includes(ap.stage) && !isBoardAppraised(e) && e.status !== 'TERMINATED' && e.basicSalaryKes > 0;

export const annualBasic = (e: HREmployee, year: number, month: number) => basicFor(e, year, month) * 12;

/* ------------------------------------------------------------------ due dates */

const STAGE_PHASE: Partial<Record<AppraisalStage, string>> = { SELF: 'SELF', SUPERVISOR: 'SUPERVISOR', HOD: 'HOD', CALIBRATION: 'CALIBRATION', ACKNOWLEDGEMENT: 'ACK' };

export const stageDue = (ap: Appraisal, cycle?: PerfCycle) => {
  const key = STAGE_PHASE[ap.stage];
  return key ? cycle?.phases.find((p) => p.key === key)?.due : undefined;
};

export const isOverdue = (ap: Appraisal, cycle: PerfCycle | undefined, today: string) => {
  const due = stageDue(ap, cycle);
  return !!due && due < today;
};

export const checkInOverdue = (c: CheckIn, today: string) => !c.heldOn && c.due < today;

export const stageLabel = (s: AppraisalStage) => STAGE_LABEL[s];

/* ------------------------------------------------------------------ export */

const cell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: (string | number | undefined)[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n');

export const downloadCsv = (name: string, rows: (string | number | undefined)[][]) => {
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
