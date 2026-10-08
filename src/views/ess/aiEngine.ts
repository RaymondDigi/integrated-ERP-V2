/**
 * ESS Assistant engine.
 *
 * Deterministic, explainable rules that run in the browser over the employee's own data:
 * profile completeness, error detection, insights, suggestions and a natural-language
 * leave agent. Every finding carries the evidence it was based on.
 */
import type { LeaveRequest } from '../../types';
import { calculateKenyanStatutory } from '../hr/PayrollView';
import {
  PUBLIC_HOLIDAYS,
  TEAM_OUT_TODAY,
  ESS_ACTIVE_APPRAISAL,
  buildP9,
  formatKes,
  formatDate,
  workingDaysBetween,
  type EssProfileData,
  type EssAsset,
  type EssRequest,
  type EssRequestType,
  type Payslip
} from './essData';

/* ------------------------------------------------------------------ */
/* Shared types                                                        */
/* ------------------------------------------------------------------ */

export interface LeaveBalance {
  type: LeaveRequest['leaveType'];
  entitled: number;
  total: number;
  used: number;
  pending: number;
  available: number;
}

export interface AiContext {
  profile: EssProfileData;
  balances: LeaveBalance[];
  myLeave: LeaveRequest[];
  teamLeave: LeaveRequest[];
  payslips: Payslip[];
  assets: EssAsset[];
  requests: EssRequest[];
  /** Paid advances not yet surrendered (travel, imprest, petty cash) */
  advances?: { id: string; amount: number; dueOn?: string; overdueDays: number; travel: boolean }[];
  isApprover: boolean;
  today?: Date;
}

export type AiTab = 'home' | 'leave' | 'approvals' | 'pay' | 'performance' | 'requests' | 'records' | 'profile' | 'ai';

export type AiAction =
  | { kind: 'goto'; tab: AiTab; label: string; sub?: string }
  | { kind: 'request'; type: EssRequestType; details: string; label: string }
  | { kind: 'fix-profile'; patch: Partial<EssProfileData>; label: string }
  | { kind: 'agent'; prompt: string; label: string };

export type Severity = 'high' | 'medium' | 'low';

export interface AiFinding {
  id: string;
  area: 'Payroll' | 'Profile' | 'Leave' | 'Approvals' | 'Assets' | 'Performance' | 'Advances';
  severity: Severity;
  title: string;
  detail: string;
  action?: AiAction;
}

export interface AiInsight {
  id: string;
  tone: 'positive' | 'info' | 'warning';
  title: string;
  detail: string;
  action?: AiAction;
}

/* ------------------------------------------------------------------ */
/* Date helpers (local dates, ISO yyyy-mm-dd)                          */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso: string) => new Date(iso + 'T00:00:00');
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
// The assistant follows the live holiday calendar HR maintains (seeded from the gazette list)
let calendar: { date: string; name: string }[] = PUBLIC_HOLIDAYS;
let holidaySet = new Set(calendar.map((h) => h.date));
export const setAiHolidays = (list: { date: string; name: string }[]) => {
  calendar = list;
  holidaySet = new Set(list.map((h) => h.date));
};
export const isWorkingDay = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6 && !holidaySet.has(toIso(d));
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
const shortDate = (iso: string) => formatDate(iso, { weekday: 'short', day: 'numeric', month: 'short' });

/** Adds `n` working days counting the start day (n = 1 returns the start, or the next working day). */
export const addWorkingDays = (start: Date, n: number) => {
  let d = new Date(start);
  while (!isWorkingDay(d)) d = addDays(d, 1);
  let counted = 1;
  while (counted < n) {
    d = addDays(d, 1);
    if (isWorkingDay(d)) counted++;
  }
  return d;
};

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart <= bEnd && aEnd >= bStart;

/* ------------------------------------------------------------------ */
/* Profile completeness                                                */
/* ------------------------------------------------------------------ */

export interface CompletenessItem {
  key: string;
  label: string;
  done: boolean;
  weight: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s]{9,16}$/;

export const profileCompleteness = (p: EssProfileData) => {
  const items: CompletenessItem[] = [
    { key: 'photo', label: 'Profile photo', done: p.hasPhoto, weight: 1 },
    { key: 'phone', label: 'Mobile number', done: PHONE_RE.test(p.phone.trim()), weight: 2 },
    { key: 'email', label: 'Personal email', done: EMAIL_RE.test(p.personalEmail), weight: 2 },
    { key: 'address', label: 'Home address', done: !!p.address.trim(), weight: 1 },
    { key: 'postal', label: 'Postal address', done: !!p.postalAddress.trim(), weight: 1 },
    { key: 'marital', label: 'Marital status', done: !!p.maritalStatus, weight: 1 },
    { key: 'dependants', label: 'Number of dependants', done: p.dependants.trim() !== '', weight: 1 },
    { key: 'qualification', label: 'Highest qualification', done: !!p.highestQualification, weight: 1 },
    { key: 'kin', label: 'Next of kin', done: !!(p.kinName.trim() && p.kinRelationship.trim() && PHONE_RE.test(p.kinPhone.trim())), weight: 2 },
    { key: 'emergency', label: 'Emergency contact', done: !!(p.emName.trim() && PHONE_RE.test(p.emPhone.trim())), weight: 2 },
    { key: 'statutory', label: 'KRA, NSSF & SHIF numbers', done: true, weight: 2 },
    { key: 'bank', label: 'Bank / M-Pesa details', done: true, weight: 2 }
  ];
  const total = items.reduce((s, i) => s + i.weight, 0);
  const got = items.filter((i) => i.done).reduce((s, i) => s + i.weight, 0);
  return { percent: Math.round((got / total) * 100), items, missing: items.filter((i) => !i.done) };
};

/* ------------------------------------------------------------------ */
/* Error detection                                                     */
/* ------------------------------------------------------------------ */

const COMMON_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'live.com'];

const levenshtein = (a: string, b: string) => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
};

/** Suggests a corrected email when the domain looks like a typo of a common provider. */
export const suggestEmailFix = (email: string) => {
  const [user, domain] = email.toLowerCase().split('@');
  if (!user || !domain || COMMON_EMAIL_DOMAINS.includes(domain)) return null;
  const best = COMMON_EMAIL_DOMAINS.map((d) => ({ d, dist: levenshtein(domain, d) })).sort((x, y) => x.dist - y.dist)[0];
  return best.dist > 0 && best.dist <= 2 ? `${user}@${best.d}` : null;
};

const digits = (s: string) => s.replace(/\D/g, '');

export const detectIssues = (ctx: AiContext): AiFinding[] => {
  const today = startOfDay(ctx.today ?? new Date());
  const out: AiFinding[] = [];
  const p = ctx.profile;

  // Payroll: duplicated deduction lines
  ctx.payslips.forEach((slip) => {
    const seen = new Map<string, number>();
    slip.otherDeductions.forEach((d) => seen.set(d.label, (seen.get(d.label) ?? 0) + 1));
    seen.forEach((count, label) => {
      if (count > 1) {
        const extra = slip.otherDeductions.filter((d) => d.label === label).slice(1).reduce((s, d) => s + d.amount, 0);
        out.push({
          id: `dup-${slip.id}-${label}`,
          area: 'Payroll',
          severity: 'high',
          title: `${label} deducted ${count} times in your ${slip.period} payslip`,
          detail: `Every other month shows one ${label} line. The extra ${formatKes(extra)} looks like a duplicate payroll input and may be refundable.`,
          action: {
            kind: 'request',
            type: 'Payroll Query',
            label: 'Raise payroll query',
            details: `Payslip ${slip.id} (${slip.period}): "${label}" was deducted ${count} times. Please review and refund the extra ${formatKes(extra)}.`
          }
        });
      }
    });

    // Statutory deductions re-computed independently
    const check = calculateKenyanStatutory(slip.statutory.grossSalary, slip.payDate);
    const mismatches = (['payeNet', 'nssfTotalEe', 'shif', 'ahlEe'] as const).filter((k) => Math.abs(check[k] - slip.statutory[k]) > 1);
    if (mismatches.length) {
      out.push({
        id: `stat-${slip.id}`,
        area: 'Payroll',
        severity: 'high',
        title: `Statutory deductions don't match current rates in ${slip.period}`,
        detail: `Re-calculated values differ for: ${mismatches.join(', ')}.`,
        action: { kind: 'request', type: 'Payroll Query', label: 'Raise payroll query', details: `Statutory deduction mismatch on ${slip.id}: ${mismatches.join(', ')}.` }
      });
    }
  });

  // Profile data quality
  const emailFix = suggestEmailFix(p.personalEmail);
  if (emailFix) {
    out.push({
      id: 'email-typo',
      area: 'Profile',
      severity: 'medium',
      title: `Your personal email may have a typo`,
      detail: `"${p.personalEmail}" — did you mean "${emailFix}"? Payslip and P9 notifications could fail to reach you.`,
      action: { kind: 'fix-profile', patch: { personalEmail: emailFix }, label: `Use ${emailFix}` }
    });
  } else if (p.personalEmail && !EMAIL_RE.test(p.personalEmail)) {
    out.push({ id: 'email-invalid', area: 'Profile', severity: 'medium', title: 'Personal email is not valid', detail: `"${p.personalEmail}" is not a valid address.`, action: { kind: 'goto', tab: 'profile', label: 'Update profile' } });
  }
  if (!p.emName.trim() || !p.emPhone.trim()) {
    out.push({
      id: 'no-emergency',
      area: 'Profile',
      severity: 'medium',
      title: 'No emergency contact on file',
      detail: 'HR and security need someone to call if something happens at work.',
      action: { kind: 'goto', tab: 'profile', label: 'Add emergency contact' }
    });
  } else if (digits(p.emPhone) === digits(p.phone)) {
    out.push({ id: 'em-self', area: 'Profile', severity: 'high', title: 'Emergency contact number is your own number', detail: 'In an emergency we would be calling you. Add another person.', action: { kind: 'goto', tab: 'profile', label: 'Fix emergency contact' } });
  }
  if (p.kinPhone && digits(p.kinPhone) === digits(p.phone)) {
    out.push({ id: 'kin-self', area: 'Profile', severity: 'medium', title: 'Next-of-kin phone matches your own', detail: 'Check the number for your next of kin.', action: { kind: 'goto', tab: 'profile', label: 'Fix next of kin' } });
  }
  if (p.phone && !PHONE_RE.test(p.phone.trim())) {
    out.push({ id: 'phone-invalid', area: 'Profile', severity: 'medium', title: 'Mobile number format looks wrong', detail: `"${p.phone}" should look like +254 7XX XXX XXX.`, action: { kind: 'goto', tab: 'profile', label: 'Update number' } });
  }

  // Leave: overlapping own applications, pending close to start date
  const active = ctx.myLeave.filter((l) => l.status === 'PENDING_APPROVAL' || l.status === 'APPROVED');
  active.forEach((a, i) =>
    active.slice(i + 1).forEach((b) => {
      if (overlaps(a.startDate, a.endDate, b.startDate, b.endDate)) {
        out.push({
          id: `overlap-${a.id}-${b.id}`,
          area: 'Leave',
          severity: 'high',
          title: 'Two of your leave applications overlap',
          detail: `${a.id} (${shortDate(a.startDate)}–${shortDate(a.endDate)}) and ${b.id} (${shortDate(b.startDate)}–${shortDate(b.endDate)}). Days may be deducted twice.`,
          action: { kind: 'goto', tab: 'leave', label: 'Review applications' }
        });
      }
    })
  );
  ctx.myLeave
    .filter((l) => l.status === 'PENDING_APPROVAL')
    .forEach((l) => {
      const daysTo = daysBetween(today, fromIso(l.startDate));
      if (daysTo <= 2) {
        out.push({
          id: `late-approval-${l.id}`,
          area: 'Leave',
          severity: daysTo < 0 ? 'high' : 'medium',
          title: daysTo < 0 ? `Your ${l.leaveType.toLowerCase()} started but is still unapproved` : `Your leave starts ${daysTo === 0 ? 'today' : `in ${daysTo} day${daysTo === 1 ? '' : 's'}`} and is still pending`,
          detail: `Waiting for ${l.approverName ?? 'your manager'}. Consider reminding them.`,
          action: { kind: 'goto', tab: 'leave', label: 'View application' }
        });
      }
    });

  // Approvals that are urgent for the approver
  if (ctx.isApprover) {
    ctx.teamLeave
      .filter((l) => l.status === 'PENDING_APPROVAL')
      .forEach((l) => {
        const daysTo = daysBetween(today, fromIso(l.startDate));
        if (daysTo <= 3) {
          out.push({
            id: `approve-${l.id}`,
            area: 'Approvals',
            severity: daysTo <= 0 ? 'high' : 'medium',
            title:
              daysTo < 0
                ? `${l.staffName.split(' ')[0]}'s ${l.leaveType.toLowerCase()} started ${-daysTo} day${daysTo === -1 ? '' : 's'} ago without your approval`
                : `${l.staffName.split(' ')[0]}'s leave starts ${daysTo === 0 ? 'today' : `in ${daysTo} days`} — awaiting you`,
            detail: `${l.leaveType}, ${l.daysCount} days from ${shortDate(l.startDate)}. Applied ${l.appliedOn ? formatDate(l.appliedOn) : 'recently'}.`,
            action: { kind: 'goto', tab: 'approvals', label: 'Review now' }
          });
        }
      });
  }

  // Assets waiting for acknowledgement
  ctx.assets
    .filter((a) => !a.acknowledged)
    .forEach((a) => {
      const age = daysBetween(fromIso(a.issuedOn), today);
      out.push({
        id: `asset-${a.id}`,
        area: 'Assets',
        severity: age > 5 ? 'medium' : 'low',
        title: `${a.name} not yet acknowledged`,
        detail: `Issued ${formatDate(a.issuedOn)} (${age} day${age === 1 ? '' : 's'} ago). Unacknowledged assets stay flagged against you on exit clearance.`,
        action: { kind: 'goto', tab: 'records', label: 'Acknowledge' }
      });
    });

  // Appraisal deadline
  if (ESS_ACTIVE_APPRAISAL.stage === 'Self-assessment') {
    const left = daysBetween(today, fromIso(ESS_ACTIVE_APPRAISAL.selfAssessmentDue));
    if (left <= 14) {
      out.push({
        id: 'appraisal-due',
        area: 'Performance',
        severity: left <= 3 ? 'high' : 'medium',
        title: `Self-assessment due in ${left} days`,
        detail: `${ESS_ACTIVE_APPRAISAL.cycle} closes for self-assessment on ${formatDate(ESS_ACTIVE_APPRAISAL.selfAssessmentDue)}.`,
        action: { kind: 'goto', tab: 'performance', label: 'Start self-assessment' }
      });
    }
  }

  // Advances: receipts overdue (blocks new advances; may be recovered from salary)
  (ctx.advances ?? [])
    .filter((a) => a.overdueDays > 0)
    .forEach((a) =>
      out.push({
        id: `imprest-${a.id}`,
        area: 'Advances',
        severity: 'high',
        title: `Receipts for ${a.id} are ${a.overdueDays} day(s) overdue`,
        detail: `Surrender the ${formatKes(a.amount)} ${a.travel ? 'travel advance' : 'advance'}. Until you do, you can't take a new advance and Finance may recover it from your salary.`,
        action: { kind: 'goto', tab: 'requests', sub: a.travel ? 'travel' : 'advances', label: 'Surrender receipts' }
      })
    );

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
};

/* ------------------------------------------------------------------ */
/* Long-weekend / bridge suggestions                                   */
/* ------------------------------------------------------------------ */

export interface BridgePlan {
  holiday: string;
  leaveStart: string;
  leaveEnd: string;
  leaveDays: number;
  offStart: string;
  offEnd: string;
  daysOff: number;
}

/** For each upcoming weekday holiday, finds the cheapest way to join it to a weekend or another holiday. */
export const bridgeSuggestions = (today = new Date(), horizonDays = 120): BridgePlan[] => {
  const t0 = startOfDay(today);
  const plans: BridgePlan[] = [];
  calendar.forEach((h) => {
    const hd = fromIso(h.date);
    if (hd <= t0 || daysBetween(t0, hd) > horizonDays) return;
    if (hd.getDay() === 0 || hd.getDay() === 6) return; // falls on a weekend already

    // the non-working block that contains the holiday
    let blockStart = hd;
    while (!isWorkingDay(addDays(blockStart, -1))) blockStart = addDays(blockStart, -1);
    let blockEnd = hd;
    while (!isWorkingDay(addDays(blockEnd, 1))) blockEnd = addDays(blockEnd, 1);

    const candidates: BridgePlan[] = [];
    // bridge forward: fill working days until the next non-working block (max 4)
    for (const dir of [1, -1] as const) {
      const edge = dir === 1 ? blockEnd : blockStart;
      const fill: Date[] = [];
      let d = addDays(edge, dir);
      while (isWorkingDay(d) && fill.length < 5) {
        fill.push(d);
        d = addDays(d, dir);
      }
      if (fill.length === 0 || fill.length > 4) continue;
      let farEdge = d;
      while (!isWorkingDay(addDays(farEdge, dir))) farEdge = addDays(farEdge, dir);
      const offStart = dir === 1 ? blockStart : farEdge;
      const offEnd = dir === 1 ? farEdge : blockEnd;
      if (fill[0] <= t0 || fill[fill.length - 1] <= t0) continue;
      const leaveDates = [...fill].sort((a, b) => a.getTime() - b.getTime());
      candidates.push({
        holiday: h.name,
        leaveStart: toIso(leaveDates[0]),
        leaveEnd: toIso(leaveDates[leaveDates.length - 1]),
        leaveDays: fill.length,
        offStart: toIso(offStart),
        offEnd: toIso(offEnd),
        daysOff: daysBetween(offStart, offEnd) + 1
      });
    }
    const best = candidates.sort((a, b) => b.daysOff / b.leaveDays - a.daysOff / a.leaveDays)[0];
    if (best && best.daysOff / best.leaveDays >= 2) plans.push(best);
  });
  // de-duplicate plans that cover the same leave days (e.g. Christmas + New Year)
  const seen = new Set<string>();
  return plans.filter((p) => (seen.has(p.leaveStart) ? false : (seen.add(p.leaveStart), true)));
};

/* ------------------------------------------------------------------ */
/* Insights + suggestions                                              */
/* ------------------------------------------------------------------ */

const CARRY_OVER_CAP = 5;

export const buildInsights = (ctx: AiContext): AiInsight[] => {
  const today = startOfDay(ctx.today ?? new Date());
  const out: AiInsight[] = [];
  const [latest, prev] = ctx.payslips;

  if (latest && prev) {
    const change = latest.netPay - prev.netPay;
    const pct = (change / prev.netPay) * 100;
    const why: string[] = [];
    if (latest.overtime !== prev.overtime) why.push(`overtime ${latest.overtime > prev.overtime ? 'up' : 'down'} ${formatKes(Math.abs(latest.overtime - prev.overtime))}`);
    const otherDiff = latest.otherDeductions.reduce((s, d) => s + d.amount, 0) - prev.otherDeductions.reduce((s, d) => s + d.amount, 0);
    if (otherDiff) why.push(`other deductions ${otherDiff > 0 ? 'up' : 'down'} ${formatKes(Math.abs(otherDiff))}`);
    out.push({
      id: 'net-trend',
      tone: change >= 0 ? 'positive' : 'info',
      title: `Net pay ${change >= 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}% in ${latest.period}`,
      detail: `${formatKes(latest.netPay)} vs ${formatKes(prev.netPay)} in ${prev.period}${why.length ? ` — ${why.join(', ')}` : ''}.`,
      action: { kind: 'goto', tab: 'pay', label: 'Open payslips' }
    });
  }

  const ytd = buildP9(today.getFullYear(), today);
  if (ytd.length) {
    const paye = ytd.reduce((s, r) => s + r.paye, 0);
    const gross = ytd.reduce((s, r) => s + r.gross, 0);
    out.push({
      id: 'ytd-tax',
      tone: 'info',
      title: `${formatKes(paye)} PAYE paid so far in ${today.getFullYear()}`,
      detail: `Effective tax rate ${((paye / gross) * 100).toFixed(1)}% on ${formatKes(gross)} gross across ${ytd.length} months.`,
      action: { kind: 'goto', tab: 'pay', label: 'View P9' }
    });
  }

  const annual = ctx.balances.find((b) => b.type === 'Annual Leave');
  if (annual) {
    const yearEnd = new Date(today.getFullYear(), 11, 31);
    let workLeft = 0;
    for (let d = addDays(today, 1); d <= yearEnd; d = addDays(d, 1)) if (isWorkingDay(d)) workLeft++;
    const atRisk = Math.max(0, annual.available - CARRY_OVER_CAP);
    out.push({
      id: 'leave-risk',
      tone: atRisk > 0 ? 'warning' : 'positive',
      title: atRisk > 0 ? `${atRisk} annual leave days will lapse on 31 Dec` : `Annual leave on track`,
      detail:
        atRisk > 0
          ? `You have ${annual.available} days left and only ${CARRY_OVER_CAP} carry over. ${workLeft} working days remain this year.`
          : `${annual.available} days available — all can carry over into next year.`,
      action: atRisk > 0 ? { kind: 'agent', prompt: 'Plan a long weekend around the next public holiday', label: 'Plan with Leave Agent' } : undefined
    });
  }

  const out_today = TEAM_OUT_TODAY.length;
  if (out_today) {
    out.push({
      id: 'team-out',
      tone: 'info',
      title: `${out_today} teammate${out_today === 1 ? '' : 's'} out today`,
      detail: TEAM_OUT_TODAY.map((t) => `${t.name.split(' ')[0]} (${t.reason.toLowerCase()})`).join(', ') + '.'
    });
  }

  const slow = ctx.requests.filter((r) => (r.status === 'Submitted' || r.status === 'In Review') && daysBetween(fromIso(r.submittedOn), today) >= 5);
  if (slow.length) {
    out.push({
      id: 'slow-requests',
      tone: 'warning',
      title: `${slow.length} request${slow.length === 1 ? ' has' : 's have'} been open 5+ days`,
      detail: slow.map((r) => `${r.type} (${daysBetween(fromIso(r.submittedOn), today)} days, ${r.assignedTo})`).join('; ') + '.',
      action: { kind: 'goto', tab: 'requests', label: 'View requests' }
    });
  }

  const verified = ctx.payslips.length;
  out.push({
    id: 'statutory-ok',
    tone: 'positive',
    title: `Statutory deductions checked on ${verified} payslips`,
    detail: 'PAYE, NSSF, SHIF and Housing Levy re-calculated independently against current rates.'
  });

  return out;
};

export const buildSuggestions = (ctx: AiContext): AiInsight[] => {
  const today = ctx.today ?? new Date();
  const out: AiInsight[] = [];
  const annual = ctx.balances.find((b) => b.type === 'Annual Leave');

  bridgeSuggestions(today)
    .slice(0, 3)
    .forEach((b) => {
      const fits = !annual || annual.available >= b.leaveDays;
      out.push({
        id: `bridge-${b.leaveStart}`,
        tone: fits ? 'positive' : 'info',
        title: `${b.daysOff} days off for ${b.leaveDays} day${b.leaveDays === 1 ? '' : 's'} of leave around ${b.holiday}`,
        detail: `Take ${b.leaveStart === b.leaveEnd ? shortDate(b.leaveStart) : `${shortDate(b.leaveStart)} – ${shortDate(b.leaveEnd)}`} to be off ${shortDate(b.offStart)} – ${shortDate(b.offEnd)}.`,
        action: { kind: 'agent', prompt: `Annual leave from ${b.leaveStart} to ${b.leaveEnd} for a long weekend around ${b.holiday}`, label: 'Draft with Leave Agent' }
      });
    });

  const completeness = profileCompleteness(ctx.profile);
  if (completeness.percent < 100) {
    out.push({
      id: 'complete-profile',
      tone: 'info',
      title: `Finish your profile — ${completeness.missing.length} item${completeness.missing.length === 1 ? '' : 's'} left`,
      detail: `Missing: ${completeness.missing.map((m) => m.label.toLowerCase()).join(', ')}.`,
      action: { kind: 'goto', tab: 'profile', label: 'Complete profile' }
    });
  }

  const latest = ctx.payslips[0];
  if (latest && latest.overtime === 0 && ctx.payslips.some((p) => p.overtime > 0)) {
    out.push({
      id: 'overtime-none',
      tone: 'info',
      title: 'No overtime paid last month',
      detail: `If you worked extra hours in ${latest.period}, ask your manager to submit them before the next payroll cut-off (20th).`
    });
  }

  return out;
};

/* ------------------------------------------------------------------ */
/* Leave Agent: natural-language parsing                               */
/* ------------------------------------------------------------------ */

export interface LeaveDraft {
  leaveType?: LeaveRequest['leaveType'];
  start?: string;
  end?: string;
  days?: number;
  reason?: string;
  assumedSingleDay?: boolean;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
};
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

const monthFrom = (s: string) => MONTH_INDEX[s.slice(0, 4).toLowerCase()] ?? MONTH_INDEX[s.slice(0, 3).toLowerCase()];

/** Puts a day/month without a year into the next upcoming occurrence. */
const inferYear = (month: number, day: number, today: Date, explicitYear?: number) => {
  if (explicitYear) return new Date(explicitYear < 100 ? 2000 + explicitYear : explicitYear, month, day);
  const d = new Date(today.getFullYear(), month, day);
  return d < addDays(startOfDay(today), -7) ? new Date(today.getFullYear() + 1, month, day) : d;
};

interface DateHit {
  index: number;
  date: Date;
}

const findDates = (text: string, today: Date): DateHit[] => {
  const hits: DateHit[] = [];
  const t0 = startOfDay(today);
  const push = (index: number, date: Date) => {
    if (!isNaN(date.getTime())) hits.push({ index, date });
  };
  let m: RegExpExecArray | null;

  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = iso.exec(text))) push(m.index, new Date(+m[1], +m[2] - 1, +m[3]));

  const dayMonth = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:\s+(\d{4}))?/gi;
  while ((m = dayMonth.exec(text))) push(m.index, inferYear(monthFrom(m[2]), +m[1], today, m[3] ? +m[3] : undefined));

  const monthDay = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?/gi;
  while ((m = monthDay.exec(text))) {
    if (!hits.some((h) => Math.abs(h.index - m!.index) < 4)) push(m.index, inferYear(monthFrom(m[1]), +m[2], today, m[3] ? +m[3] : undefined));
  }

  const slash = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
  while ((m = slash.exec(text))) push(m.index, inferYear(+m[2] - 1, +m[1], today, m[3] ? +m[3] : undefined));

  const rel = /\b(day after tomorrow|tomorrow|today)\b/gi;
  while ((m = rel.exec(text))) {
    const w = m[1].toLowerCase();
    push(m.index, addDays(t0, w === 'today' ? 0 : w === 'tomorrow' ? 1 : 2));
  }

  const wd = /\b(next|this|coming|on)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi;
  while ((m = wd.exec(text))) {
    const target = WEEKDAYS.indexOf(m[2].toLowerCase());
    let diff = (target - t0.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    // "next Friday" said earlier in the same week means the Friday of next week
    if (m[1]?.toLowerCase() === 'next' && t0.getDay() !== 0 && target > t0.getDay() && diff < 7) diff += 7;
    push(m.index, addDays(t0, diff));
  }

  return hits.sort((a, b) => a.index - b.index);
};

/** Extracts what it can from one user message. Fields not mentioned are left undefined. */
export const parseLeaveMessage = (text: string, today = new Date()): LeaveDraft => {
  const lower = text.toLowerCase();
  const draft: LeaveDraft = {};

  if (/\b(sick|ill|unwell|doctor|hospital|clinic|medical|surgery|fever|flu)\b/.test(lower)) draft.leaveType = 'Sick Leave';
  else if (/\b(funeral|bereave|burial|passed away|death|died|condolence)/.test(lower)) draft.leaveType = 'Compassionate Leave';
  else if (/\b(maternity|baby|delivery|expecting)\b/.test(lower)) draft.leaveType = 'Maternity Leave';
  else if (/\b(annual|vacation|holiday|break|rest|trip|travel|wedding|long weekend|off)\b/.test(lower)) draft.leaveType = 'Annual Leave';

  // Holiday names ("around Mashujaa Day") resolve to a bridge plan
  const holiday = calendar.find((h) => {
    const first = h.name.toLowerCase().split(' ')[0];
    return lower.includes(first.length >= 5 ? first : h.name.toLowerCase());
  });
  if (holiday && !/\d/.test(lower)) {
    const plan = bridgeSuggestions(today, 400).find((b) => b.holiday === holiday.name);
    if (plan) {
      draft.start = plan.leaveStart;
      draft.end = plan.leaveEnd;
      draft.leaveType = draft.leaveType ?? 'Annual Leave';
      draft.reason = `Long weekend around ${holiday.name}`;
      return draft;
    }
  }
  if (/next public holiday|long weekend/.test(lower) && !/\d/.test(lower)) {
    const plan = bridgeSuggestions(today)[0];
    if (plan) {
      draft.start = plan.leaveStart;
      draft.end = plan.leaveEnd;
      draft.leaveType = draft.leaveType ?? 'Annual Leave';
      draft.reason = `Long weekend around ${plan.holiday}`;
      return draft;
    }
  }

  // Duration
  const dur = lower.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:working\s+|business\s+)?(day|days|week|weeks)\b/);
  if (dur) {
    const n = /^\d+$/.test(dur[1]) ? +dur[1] : NUMBER_WORDS[dur[1]] ?? 1;
    draft.days = dur[2].startsWith('week') ? n * 5 : n;
  }

  const dates = findDates(text, today);
  if (/\bnext week\b/.test(lower) && dates.length === 0) {
    const t0 = startOfDay(today);
    const monday = addDays(t0, ((8 - t0.getDay()) % 7) || 7);
    draft.start = toIso(monday);
    draft.end = toIso(draft.days ? addWorkingDays(monday, draft.days) : addDays(monday, 4));
  } else if (dates.length >= 2) {
    const [a, b] = [dates[0].date, dates[1].date].sort((x, y) => x.getTime() - y.getTime());
    draft.start = toIso(a);
    draft.end = toIso(b);
  } else if (dates.length === 1) {
    draft.start = toIso(dates[0].date);
    if (draft.days) draft.end = toIso(addWorkingDays(dates[0].date, draft.days));
    else {
      draft.end = draft.start;
      draft.assumedSingleDay = true;
    }
  }

  // Reason: "for a family wedding", "because ...", "due to ..."
  const reasonMatch = text.match(/\b(?:for|because|due to|reason:?)\s+(?!\d|a week|one week|two weeks|(?:a|an|one|two|three|four|five)\s+(?:working\s+)?days?)(.+?)(?:[.!?]|$)/i);
  if (reasonMatch) {
    const r = reasonMatch[1].replace(/\b(from|starting|on|next)\b.*$/i, '').replace(/^of\s+/i, '').trim();
    if (r.length > 2) draft.reason = r.charAt(0).toUpperCase() + r.slice(1);
  }
  if (!draft.reason && draft.leaveType === 'Sick Leave') draft.reason = 'Unwell — medical rest';

  return draft;
};

export const mergeDraft = (prev: LeaveDraft, next: LeaveDraft): LeaveDraft => {
  const merged: LeaveDraft = { ...prev };
  (Object.keys(next) as (keyof LeaveDraft)[]).forEach((k) => {
    if (next[k] !== undefined) (merged as Record<string, unknown>)[k] = next[k];
  });
  // a new duration with an existing start recalculates the end
  if (next.days && !next.end && merged.start) merged.end = toIso(addWorkingDays(fromIso(merged.start), next.days));
  if (next.start && !next.end && prev.end && prev.end < next.start) merged.end = next.start;
  if (next.end && !next.assumedSingleDay) merged.assumedSingleDay = false;
  return merged;
};

export interface LeaveCheck {
  ok: boolean;
  label: string;
  detail?: string;
}

export interface LeaveEvaluation {
  ready: boolean;
  missing: ('dates' | 'reason')[];
  workingDays: number;
  calendarDays: number;
  holidays: string[];
  checks: LeaveCheck[];
  blocking: boolean;
  tip?: string;
}

export const evaluateLeave = (d: LeaveDraft, ctx: AiContext): LeaveEvaluation => {
  const today = startOfDay(ctx.today ?? new Date());
  const missing: LeaveEvaluation['missing'] = [];
  if (!d.start || !d.end) missing.push('dates');
  if (!d.reason) missing.push('reason');
  const type = d.leaveType ?? 'Annual Leave';
  const checks: LeaveCheck[] = [];
  let blocking = false;
  let workingDays = 0;
  let calendarDays = 0;
  const holidays: string[] = [];
  let tip: string | undefined;

  if (d.start && d.end) {
    workingDays = workingDaysBetween(d.start, d.end);
    calendarDays = daysBetween(fromIso(d.start), fromIso(d.end)) + 1;
    calendar.forEach((h) => {
      if (h.date >= d.start! && h.date <= d.end!) holidays.push(`${h.name} (${shortDate(h.date)})`);
    });

    const bal = ctx.balances.find((b) => b.type === type);
    if (!bal || bal.entitled === 0) {
      checks.push({ ok: false, label: `${type} isn't in your entitlements`, detail: 'Contact HR to have it set up before applying.' });
      blocking = true;
    } else if (workingDays > bal.available) {
      checks.push({ ok: false, label: `Not enough ${type.toLowerCase()}`, detail: `Needs ${workingDays} days, you have ${bal.available}.` });
      blocking = true;
    } else {
      checks.push({ ok: true, label: `Balance OK`, detail: `${bal.available - workingDays} ${type.toLowerCase()} days left after this.` });
    }

    if (workingDays === 0) {
      checks.push({ ok: false, label: 'No working days in this range', detail: 'The dates fall on weekends or public holidays.' });
      blocking = true;
    }

    const backdateLimit = type === 'Sick Leave' ? -3 : 0;
    if (daysBetween(today, fromIso(d.start)) < backdateLimit) {
      checks.push({ ok: false, label: 'Start date is in the past', detail: type === 'Sick Leave' ? 'Sick leave can be back-dated up to 3 days.' : 'Annual leave must start today or later.' });
      blocking = true;
    }

    const own = ctx.myLeave.filter((l) => (l.status === 'PENDING_APPROVAL' || l.status === 'APPROVED') && overlaps(l.startDate, l.endDate, d.start!, d.end!));
    if (own.length) {
      checks.push({ ok: false, label: 'Overlaps your existing leave', detail: own.map((l) => `${l.id} (${shortDate(l.startDate)}–${shortDate(l.endDate)})`).join(', ') });
      blocking = true;
    } else {
      checks.push({ ok: true, label: 'No clash with your other leave' });
    }

    const teamClash = [
      ...ctx.teamLeave.filter((l) => (l.status === 'APPROVED' || l.status === 'PENDING_APPROVAL') && overlaps(l.startDate, l.endDate, d.start!, d.end!)).map((l) => l.staffName.split(' ')[0]),
      ...TEAM_OUT_TODAY.filter((t) => overlaps(toIso(today), t.until, d.start!, d.end!)).map((t) => t.name.split(' ')[0])
    ];
    const uniq = Array.from(new Set(teamClash));
    checks.push(
      uniq.length
        ? { ok: true, label: `Team cover: ${uniq.join(', ')} also off`, detail: 'Agree a handover so the team stays covered.' }
        : { ok: true, label: 'Team cover OK', detail: 'Nobody else on your team is off then.' }
    );

    if (type === 'Sick Leave' && workingDays > 2) checks.push({ ok: true, label: 'Medical certificate needed', detail: 'Sick leave over 2 days needs a doctor’s note.' });
    if (holidays.length) checks.push({ ok: true, label: `${holidays.length} public holiday${holidays.length === 1 ? '' : 's'} not counted`, detail: holidays.join(', ') });

    // Tip: shift to touch a holiday or weekend for a longer break
    if (type === 'Annual Leave' && !blocking) {
      const bridge = bridgeSuggestions(today, 400).find((b) => Math.abs(daysBetween(fromIso(b.leaveStart), fromIso(d.start!))) <= 7 && b.leaveStart !== d.start);
      if (bridge) tip = `Tip: taking ${shortDate(bridge.leaveStart)}${bridge.leaveEnd !== bridge.leaveStart ? `–${shortDate(bridge.leaveEnd)}` : ''} instead gives ${bridge.daysOff} days off for ${bridge.leaveDays} leave day${bridge.leaveDays === 1 ? '' : 's'} (${bridge.holiday}).`;
    }
  }

  return { ready: missing.length === 0 && !blocking, missing, workingDays, calendarDays, holidays, checks, blocking, tip };
};

export const describeDraft = (d: LeaveDraft) => {
  const type = d.leaveType ?? 'Annual Leave';
  if (!d.start || !d.end) return type;
  return `${type}: ${d.start === d.end ? shortDate(d.start) : `${shortDate(d.start)} – ${shortDate(d.end)}`}`;
};

export const balanceSummary = (balances: LeaveBalance[]) =>
  balances.map((b) => `${b.type}: ${b.available} of ${b.total} days available${b.pending ? ` (${b.pending} pending)` : ''}`).join('\n');

