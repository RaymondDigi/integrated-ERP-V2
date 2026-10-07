import type { HREmployee, LeaveRequest } from '../types';
import { addDays, daysBetween } from './timeEngine';
import { addMonthsIso } from './discipline';
import { monthRun, type PayrollContext } from './payrollEngine';
import {
  CERT_OVERRIDES,
  CERTIFICATIONS,
  COURSES,
  NITA_DAILY_CAP,
  ROLE_RULES,
  SEED_BONDS,
  SEED_DATE,
  certById,
  courseById,
  type Course,
  type TrainingBond,
  type TrainingSession
} from './trainingConfig';

export interface CertRecord {
  id: string;
  staffId: string;
  certId: string;
  issuedOn: string;
  expiresOn: string;
  ref: string;
  source: 'Record' | 'Session';
  sessionId?: string;
}

export type CertStatus = 'VALID' | 'DUE_90' | 'DUE_60' | 'DUE_30' | 'EXPIRED' | 'MISSING';

export const CERT_STATUS: Record<CertStatus, { label: string; cls: string; short: string }> = {
  VALID: { label: 'Valid', cls: 'success', short: 'OK' },
  DUE_90: { label: 'Expires in 90 days', cls: 'info', short: '90' },
  DUE_60: { label: 'Expires in 60 days', cls: 'warning', short: '60' },
  DUE_30: { label: 'Expires in 30 days', cls: 'warning', short: '30' },
  EXPIRED: { label: 'Expired', cls: 'critical', short: 'EXP' },
  MISSING: { label: 'Missing', cls: 'critical', short: '—' }
};

export const isGap = (s: CertStatus) => s === 'EXPIRED' || s === 'MISSING';

/** Still employed on the given day */
export const isActiveOn = (e: HREmployee, today: string) => e.status !== 'TERMINATED' && !(e.exitDate && e.exitDate < today);

/** Certifications the employee's role requires, with the rule that asked for each. */
export const requiredCerts = (e: HREmployee) => {
  const out = new Map<string, string>();
  for (const r of ROLE_RULES) {
    if (r.department && r.department !== e.department) continue;
    if (r.title && !r.title.test(e.jobTitle)) continue;
    for (const c of r.certs) if (!out.has(c)) out.set(c, r.label);
  }
  return [...out.entries()].map(([certId, rule]) => ({ certId, rule }));
};

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
};

export const issueRecord = (staffId: string, certId: string, issuedOn: string, ref: string, source: CertRecord['source'], sessionId?: string, id?: string): CertRecord => ({
  id: id ?? `CR-${staffId}-${certId}-${issuedOn}`,
  staffId,
  certId,
  issuedOn,
  expiresOn: addMonthsIso(issuedOn, certById(certId)?.validityMonths ?? 12),
  ref,
  source,
  sessionId
});

/** Demo certificate history: a realistic spread of valid, due, expired and missing certificates. */
export const seedCertRecords = (staff: HREmployee[], sessions: TrainingSession[]): CertRecord[] => {
  const out: CertRecord[] = [];
  for (const e of staff) {
    if (!isActiveOn(e, SEED_DATE)) continue;
    for (const { certId } of requiredCerts(e)) {
      const key = `${e.staffId}|${certId}`;
      const h = hash(key) % 20;
      const r = hash(`${key}#days`);
      const fixed = CERT_OVERRIDES[key];
      if (fixed === 'missing' || (fixed === undefined && h === 0)) continue;
      const days = typeof fixed === 'number' ? fixed : h < 3 ? -(5 + (r % 80)) : h < 5 ? 3 + (r % 27) : h === 5 ? 31 + (r % 29) : h === 6 ? 61 + (r % 29) : 95 + (r % 240);
      const cert = certById(certId)!;
      const expires = addDays(SEED_DATE, days);
      const issued = addMonthsIso(expires, -cert.validityMonths);
      out.push({ id: `CR-${key}`, staffId: e.staffId, certId, issuedOn: issued, expiresOn: expires, ref: `${cert.authority.split(' ')[0].toUpperCase()}/${(hash(key) % 90000) + 10000}`, source: 'Record' });
    }
  }
  // Certificates earned on completed demo sessions
  for (const s of sessions.filter((x) => x.status === 'Completed')) {
    const c = courseById(s.courseId);
    if (!c?.certId) continue;
    for (const en of s.enrolments) if (en.status === 'Attended' && passed(c, en.score)) out.push(issueRecord(en.staffId, c.certId, s.end, `${s.id}/${en.staffId}`, 'Session', s.id));
  }
  return out;
};

export const passed = (c: Course | undefined, score?: number) => !c || c.passMark === 0 || (score ?? -1) >= c.passMark;

export const statusFor = (rec: CertRecord | undefined, today: string): CertStatus => {
  if (!rec) return 'MISSING';
  const left = daysBetween(today, rec.expiresOn);
  if (left < 0) return 'EXPIRED';
  if (left <= 30) return 'DUE_30';
  if (left <= 60) return 'DUE_60';
  if (left <= 90) return 'DUE_90';
  return 'VALID';
};

/** Latest certificate per employee and certification */
export const latestRecords = (records: CertRecord[]) => {
  const m = new Map<string, CertRecord>();
  for (const r of records) {
    const k = `${r.staffId}|${r.certId}`;
    const cur = m.get(k);
    if (!cur || r.expiresOn > cur.expiresOn) m.set(k, r);
  }
  return m;
};

export interface MatrixCell {
  staffId: string;
  certId: string;
  rule: string;
  status: CertStatus;
  record?: CertRecord;
  daysLeft?: number;
}

export interface MatrixRow {
  e: HREmployee;
  cells: MatrixCell[];
}

export const buildMatrix = (staff: HREmployee[], records: CertRecord[], today: string): MatrixRow[] => {
  const latest = latestRecords(records);
  return staff
    .filter((e) => isActiveOn(e, today))
    .map((e) => ({
      e,
      cells: requiredCerts(e).map(({ certId, rule }) => {
        const record = latest.get(`${e.staffId}|${certId}`);
        return { staffId: e.staffId, certId, rule, record, status: statusFor(record, today), daysLeft: record ? daysBetween(today, record.expiresOn) : undefined };
      })
    }))
    .filter((r) => r.cells.length);
};

export const matrixStats = (rows: MatrixRow[]) => {
  const cells = rows.flatMap((r) => r.cells);
  const ok = cells.filter((c) => !isGap(c.status)).length;
  return {
    required: cells.length,
    compliant: ok,
    pct: cells.length ? Math.round((ok / cells.length) * 1000) / 10 : 100,
    expired: cells.filter((c) => c.status === 'EXPIRED').length,
    missing: cells.filter((c) => c.status === 'MISSING').length,
    due30: cells.filter((c) => c.status === 'DUE_30').length,
    due90: cells.filter((c) => c.status === 'DUE_30' || c.status === 'DUE_60' || c.status === 'DUE_90').length
  };
};

/** Department × certification compliance (null where nobody in the department needs it). */
export const heatmap = (rows: MatrixRow[]) => {
  const depts = [...new Set(rows.map((r) => r.e.department))].sort();
  const certs = CERTIFICATIONS.filter((c) => rows.some((r) => r.cells.some((x) => x.certId === c.id)));
  const grid = depts.map((d) => ({
    dept: d,
    cells: certs.map((c) => {
      const cs = rows.filter((r) => r.e.department === d).flatMap((r) => r.cells.filter((x) => x.certId === c.id));
      if (!cs.length) return null;
      const ok = cs.filter((x) => !isGap(x.status)).length;
      return { certId: c.id, ok, total: cs.length, pct: Math.round((ok / cs.length) * 100), due: cs.filter((x) => x.status.startsWith('DUE')).length };
    })
  }));
  return { depts, certs, grid };
};

export const csvEscape = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const matrixCsv = (rows: MatrixRow[]) => {
  const head = ['Staff ID', 'Name', 'Department', 'Job title', 'Certification', 'Required by', 'Status', 'Issued', 'Expires', 'Days left', 'Reference'];
  const lines = rows.flatMap((r) =>
    r.cells.map((c) => [r.e.staffId, r.e.fullName, r.e.department, r.e.jobTitle, certById(c.certId)?.name ?? c.certId, c.rule, CERT_STATUS[c.status].label, c.record?.issuedOn ?? '', c.record?.expiresOn ?? '', c.daysLeft ?? '', c.record?.ref ?? ''])
  );
  return [head, ...lines].map((l) => l.map(csvEscape).join(',')).join('\n');
};

/** Best catalogue course for a skill described in words. */
export const courseForSkill = (skill: string): Course | undefined => {
  const s = skill.toLowerCase();
  const exact = COURSES.find((c) => c.title.toLowerCase() === s);
  if (exact) return exact;
  const words = s.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  let best: Course | undefined;
  let bestScore = 0;
  for (const c of COURSES) {
    const hay = `${c.title} ${certById(c.certId ?? '')?.name ?? ''}`.toLowerCase();
    const score = words.filter((w) => hay.includes(w)).length;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return bestScore ? best : undefined;
};

/** Leave that overlaps the training dates. */
export const leaveClashes = (leave: LeaveRequest[], staffId: string, start: string, end: string) =>
  leave.filter((l) => l.staffId === staffId && (l.status === 'APPROVED' || l.status === 'PENDING_APPROVAL') && l.startDate <= end && l.endDate >= start);

export const seatsTaken = (s: TrainingSession) => s.enrolments.filter((x) => x.status === 'Enrolled' || x.status === 'Attended' || x.status === 'No show').length;

/** People the provider bills for: everyone booked who was not withdrawn or waitlisted */
const billed = (s: TrainingSession) => s.enrolments.filter((x) => x.status !== 'Withdrawn' && x.status !== 'Waitlisted');

export const sessionCost = (s: TrainingSession) => {
  const c = courseById(s.courseId);
  return s.actualCost ?? billed(s).length * (c?.costPerHead ?? 0);
};

/** Cost per billed person (actual once invoiced, else catalogue) */
export const costPerPerson = (s: TrainingSession) => {
  const n = billed(s).length;
  return n ? sessionCost(s) / n : courseById(s.courseId)?.costPerHead ?? 0;
};

export const yearOf = (iso: string) => Number(iso.slice(0, 4));

/** Budget, committed and spent by department for the year. */
export const budgetLines = (
  budgets: Record<string, number>,
  sessions: TrainingSession[],
  needs: { staffId: string; status: string; courseId?: string; sessionId?: string }[],
  staffById: Map<string, HREmployee>,
  year: number
) => {
  const m = new Map<string, { budget: number; committed: number; spent: number; people: Set<string> }>();
  const get = (d: string) => {
    if (!m.has(d)) m.set(d, { budget: budgets[d] ?? 0, committed: 0, spent: 0, people: new Set() });
    return m.get(d)!;
  };
  for (const d of Object.keys(budgets)) get(d);
  for (const s of sessions.filter((x) => x.status !== 'Cancelled' && yearOf(x.start) === year)) {
    const per = costPerPerson(s);
    for (const en of billed(s)) {
      const d = staffById.get(en.staffId)?.department;
      if (!d) continue;
      const line = get(d);
      if (s.status === 'Completed') line.spent += per;
      else line.committed += per;
      line.people.add(en.staffId);
    }
  }
  // Approved needs not yet in a session are committed at catalogue cost
  for (const n of needs.filter((x) => x.status === 'Approved' && !x.sessionId)) {
    const d = staffById.get(n.staffId)?.department;
    const c = courseById(n.courseId);
    if (d && c) get(d).committed += c.costPerHead;
  }
  return [...m.entries()]
    .map(([department, v]) => ({ department, budget: v.budget, committed: Math.round(v.committed), spent: Math.round(v.spent), people: v.people.size }))
    .filter((l) => l.budget || l.committed || l.spent)
    .sort((a, b) => a.department.localeCompare(b.department));
};

/** Training hours per employee for the year (attended sessions only). */
export const hoursYtd = (sessions: TrainingSession[], year: number) => {
  const m = new Map<string, number>();
  for (const s of sessions.filter((x) => x.status === 'Completed' && yearOf(x.start) === year)) {
    const h = courseById(s.courseId)?.hours ?? 0;
    for (const en of s.enrolments.filter((x) => x.status === 'Attended')) m.set(en.staffId, (m.get(en.staffId) ?? 0) + h);
  }
  return m;
};

/** NITA levy charged in each paid payroll month of the year. */
export const nitaLevyYtd = (staff: HREmployee[], orgId: string, year: number, lastPaid: Date, ctx: PayrollContext) => {
  const months: { month: number; staff: number; levy: number }[] = [];
  if (lastPaid.getFullYear() < year) return months;
  const upto = lastPaid.getFullYear() > year ? 11 : lastPaid.getMonth();
  for (let m = 0; m <= upto; m++) {
    const run = monthRun(staff, orgId, year, m, ctx).total;
    months.push({ month: m, staff: run.workers, levy: run.nita });
  }
  return months;
};

/** What NITA would reimburse for a completed, approved session. */
export const nitaClaimable = (s: TrainingSession) => {
  const c = courseById(s.courseId);
  if (!c?.nitaApproved || s.status !== 'Completed') return 0;
  const attended = s.enrolments.filter((x) => x.status === 'Attended').length;
  return attended * Math.min(costPerPerson(s), NITA_DAILY_CAP * c.days);
};

/** Whole months of bonded service between two dates */
export const monthsServed = (start: string, exit: string) => {
  if (exit <= start) return 0;
  let n = 0;
  while (addMonthsIso(start, n + 1) <= exit) n++;
  return n;
};

export interface BondRecovery {
  bondId: string;
  course: string;
  amount: number;
  months: number;
  served: number;
  owed: number;
}

/**
 * Training bond still owed if the employee leaves on `exitDate`: each active bond is
 * recovered pro rata for the months of bonded service not yet worked.
 */
export const bondRecoveryFor = (staffId: string, exitDate: string, bonds: TrainingBond[] = SEED_BONDS): { owed: number; lines: BondRecovery[] } => {
  const lines = bonds
    .filter((b) => b.staffId === staffId && b.status === 'Active')
    .map((b) => {
      const served = Math.min(b.months, monthsServed(b.startDate, exitDate));
      return { bondId: b.id, course: b.course, amount: b.amount, months: b.months, served, owed: Math.round((b.amount * (b.months - served)) / b.months) };
    })
    .filter((l) => l.owed > 0);
  return { owed: lines.reduce((s, l) => s + l.owed, 0), lines };
};

export const bondEnd = (b: TrainingBond) => addMonthsIso(b.startDate, b.months);

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
