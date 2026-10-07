import type { HREmployee, OshPermit } from '../types';
import { addDays, dayNum } from './timeEngine';
import { payslip, type PayrollContext } from './payrollEngine';
import {
  FIRST_AID_RATIO,
  INSPECTION_AREAS,
  MEDICAL_RULES,
  PERMIT_TYPES,
  PPE_ITEMS,
  PPE_RULES,
  SITES,
  STATUTORY_KINDS,
  type SiteId
} from './oshConfig';

/* ---------------- Types ---------------- */

export type IncidentKind = 'INJURY' | 'NEAR_MISS' | 'DANGEROUS_OCCURRENCE' | 'OCCUPATIONAL_DISEASE';
export type Severity = 'NONE' | 'FIRST_AID' | 'MEDICAL' | 'LOST_TIME' | 'PERMANENT' | 'FATAL';
export type IncidentStatus = 'REPORTED' | 'INVESTIGATING' | 'ACTIONS' | 'CLOSED';
export type ActionStatus = 'OPEN' | 'DONE' | 'VERIFIED';

export interface CorrectiveAction {
  id: string;
  text: string;
  owner: string;
  due: string;
  status: ActionStatus;
  doneOn?: string;
  note?: string;
  verifiedBy?: string;
  verifiedOn?: string;
}

export interface Investigation {
  lead: string;
  startedOn: string;
  whys: string[];
  rootCause: string;
  completedOn?: string;
}

export interface OshIncident {
  id: string;
  orgId: string;
  kind: IncidentKind;
  occurredOn: string;
  time: string;
  site: SiteId;
  location: string;
  description: string;
  staffId?: string;
  bodyPart?: string;
  injuryNature?: string;
  severity: Severity;
  lostDays: number;
  /** Off work on injury from this date; open until returnedOn is set */
  offWorkFrom?: string;
  returnedOn?: string;
  immediateActions: string;
  witnesses: string[];
  reportedBy: string;
  reportedOn: string;
  status: IncidentStatus;
  investigation?: Investigation;
  actions: CorrectiveAction[];
  dosh?: { notifiedOn: string; ref: string; by: string };
  /** Attendance days already recorded as authorised injury absence */
  absenceDates?: string[];
  history: { at: string; by: string; text: string }[];
}

export type ClaimStatus = 'NOTIFIED' | 'ASSESSED' | 'APPROVED' | 'PAID';
export type ClaimBasis = 'TEMPORARY' | 'PERMANENT' | 'DEATH';

export interface WibaClaim {
  id: string;
  orgId: string;
  incidentId: string;
  staffId: string;
  insurer: string;
  policyNo: string;
  basis: ClaimBasis;
  monthlyEarnings: number;
  earningsPeriod: string;
  /** Temporary total disablement days (capped at 12 months) */
  ttdDays: number;
  ppdPercent: number;
  medicalKes: number;
  funeralKes: number;
  status: ClaimStatus;
  notifiedOn: string;
  assessedKes?: number;
  paidKes?: number;
  paidOn?: string;
  history: { at: string; by: string; text: string }[];
}

export type PermitTypeId = keyof typeof PERMIT_TYPES;
export type PermitStatus = 'REQUESTED' | 'APPROVED' | 'ACTIVE' | 'CLOSED' | 'REJECTED';

export interface GasTest {
  at: string;
  by: string;
  o2: number;
  lel: number;
  h2s: number;
  co: number;
}

export interface Isolation {
  point: string;
  lockNo: string;
  by: string;
  verified: boolean;
}

export interface WorkPermit {
  id: string;
  orgId: string;
  number: string;
  type: PermitTypeId;
  location: string;
  work: string;
  holder: string;
  holderStaffId?: string;
  requestedBy: string;
  requestedOn: string;
  /** 'YYYY-MM-DDTHH:mm' local time */
  validFrom: string;
  validTo: string;
  status: PermitStatus;
  precautions: string[];
  fireWatch?: string;
  gasTests: GasTest[];
  isolations: Isolation[];
  approvedBy?: string;
  approvedAt?: string;
  activatedAt?: string;
  closedBy?: string;
  closedAt?: string;
  closeNote?: string;
  rejectReason?: string;
}

export interface PpeIssue {
  id: string;
  orgId: string;
  staffId: string;
  itemId: string;
  size: string;
  qty: number;
  issuedOn: string;
  issuedBy: string;
  reason: 'NEW' | 'REPLACEMENT' | 'DAMAGED' | 'LOST';
}

export interface Inspection {
  id: string;
  orgId: string;
  areaId: string;
  scheduledFor: string;
  inspector: string;
  status: 'SCHEDULED' | 'DONE';
  doneOn?: string;
  /** Result per checklist item index */
  results: Record<number, 'OK' | 'FAIL' | 'NA'>;
  findings: { id: string; text: string; action: CorrectiveAction }[];
}

export interface FireDrill {
  id: string;
  orgId: string;
  siteId: SiteId;
  date: string;
  evacuationMin: number;
  participants: number;
  notes: string;
}

export interface Responder {
  id: string;
  orgId: string;
  staffId: string;
  role: 'FIRST_AIDER' | 'FIRE_MARSHAL';
  certifiedOn: string;
  expiresOn: string;
  provider: string;
}

export type MedicalType = keyof typeof MEDICAL_RULES;

export interface MedicalExam {
  id: string;
  orgId: string;
  staffId: string;
  type: MedicalType;
  doneOn: string;
  result: 'FIT' | 'FIT_RESTRICTED' | 'UNFIT';
  practitioner: string;
  note?: string;
}

export type StatutoryKind = keyof typeof STATUTORY_KINDS;

export interface StatutoryItem {
  id: string;
  orgId: string;
  kind: StatutoryKind;
  name: string;
  ref: string;
  lastDone: string;
  by: string;
}

export interface CommitteeMember {
  staffId: string;
  role: 'Chair' | 'Secretary' | 'Member';
  side: 'Management' | 'Workers';
  trained: boolean;
}

export interface CommitteeMeeting {
  id: string;
  orgId: string;
  date: string;
  attendees: string[];
  minutes: string;
  actions: CorrectiveAction[];
}

export interface JhaReview {
  role: string;
  reviewedOn: string;
  by: string;
}

/* ---------------- Labels ---------------- */

export const KIND_LABEL: Record<IncidentKind, string> = {
  INJURY: 'Injury',
  NEAR_MISS: 'Near miss',
  DANGEROUS_OCCURRENCE: 'Dangerous occurrence',
  OCCUPATIONAL_DISEASE: 'Occupational disease'
};
export const SEVERITY_LABEL: Record<Severity, string> = {
  NONE: 'No injury',
  FIRST_AID: 'First aid only',
  MEDICAL: 'Medical treatment',
  LOST_TIME: 'Lost-time injury',
  PERMANENT: 'Permanent disablement',
  FATAL: 'Fatal'
};
export const STATUS_LABEL: Record<IncidentStatus, string> = { REPORTED: 'Reported', INVESTIGATING: 'Investigating', ACTIONS: 'Actions open', CLOSED: 'Closed' };
export const CLAIM_LABEL: Record<ClaimStatus, string> = { NOTIFIED: 'Notified', ASSESSED: 'Assessed', APPROVED: 'Approved', PAID: 'Paid' };
export const CLAIM_STEPS: ClaimStatus[] = ['NOTIFIED', 'ASSESSED', 'APPROVED', 'PAID'];
export const BASIS_LABEL: Record<ClaimBasis, string> = { TEMPORARY: 'Temporary total disablement', PERMANENT: 'Permanent disablement', DEATH: 'Death' };
export const PERMIT_STATUS_LABEL: Record<PermitStatus | 'EXPIRED', string> = {
  REQUESTED: 'Awaiting approval',
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired, not closed'
};

/* ---------------- Helpers ---------------- */

export const nowLocal = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fmtDateTime = (s: string) => {
  const [d, t] = s.split('T');
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]} ${t ?? ''}`.trim();
};
export const addMonths = (iso: string, n: number) => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 + n;
  const d = Number(iso.slice(8, 10));
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};
export const daysUntil = (today: string, iso: string) => dayNum(iso) - dayNum(today);

/** Where an employee normally works, from department and job title. */
export const siteOf = (e: Pick<HREmployee, 'jobTitle' | 'department'>): SiteId => {
  const t = e.jobTitle.toLowerCase();
  if (/boiler|maintenance|mechanic|electric/.test(t)) return 'BOILER';
  if (/machine|production|operative/.test(t) && !/field|sorting/.test(t)) return 'FACTORY';
  if (/packer|store|warehouse/.test(t)) return 'PACKING';
  if (/quality|lab|food tech/.test(t)) return 'LAB';
  if (/field|farm|plucker|sorting/.test(t)) return 'ESTATE';
  if (/driver/.test(t)) return 'FLEET';
  return 'OFFICE';
};

/* ---------------- Incidents and DOSH Form 1 ---------------- */

export const isReportable = (i: Pick<OshIncident, 'kind' | 'severity'>) =>
  i.kind === 'DANGEROUS_OCCURRENCE' || i.kind === 'OCCUPATIONAL_DISEASE' || (i.kind === 'INJURY' && i.severity !== 'FIRST_AID' && i.severity !== 'NONE');

/** OSHA 2007 s.21: written notice to the area occupational safety and health officer — 24 hours for a death, 7 days otherwise. */
export const doshDue = (i: Pick<OshIncident, 'kind' | 'severity' | 'occurredOn'>) => (i.severity === 'FATAL' ? addDays(i.occurredOn, 1) : addDays(i.occurredOn, 7));

export const doshState = (i: OshIncident, today: string): { label: string; cls: string; due?: string; overdue: boolean } => {
  if (!isReportable(i)) return { label: 'Not notifiable', cls: 'primary', overdue: false };
  const due = doshDue(i);
  if (i.dosh) return { label: `Filed ${i.dosh.notifiedOn > due ? 'late' : 'on time'}`, cls: i.dosh.notifiedOn > due ? 'warning' : 'success', due, overdue: false };
  const left = daysUntil(today, due);
  if (left < 0) return { label: `Overdue ${-left}d`, cls: 'critical', due, overdue: true };
  return { label: left === 0 ? 'Due today' : `Due in ${left}d`, cls: left <= 2 ? 'warning' : 'info', due, overdue: false };
};

export const lostDaysOf = (i: OshIncident, today: string) => {
  if (!i.offWorkFrom) return i.lostDays;
  const end = i.returnedOn ?? today;
  return Math.max(i.lostDays, dayNum(end) - dayNum(i.offWorkFrom));
};

export const isLti = (i: OshIncident) => (i.kind === 'INJURY' || i.kind === 'OCCUPATIONAL_DISEASE') && (i.severity === 'LOST_TIME' || i.severity === 'PERMANENT' || i.severity === 'FATAL');
export const isRecordable = (i: OshIncident) => isLti(i) || ((i.kind === 'INJURY' || i.kind === 'OCCUPATIONAL_DISEASE') && i.severity === 'MEDICAL');

export const actionOverdue = (a: CorrectiveAction, today: string) => a.status === 'OPEN' && a.due < today;

/* ---------------- WIBA ---------------- */

/** Monthly earnings for compensation: cash gross of the last full month paid before the accident. */
export const wibaEarnings = (e: HREmployee, accidentIso: string, ctx: PayrollContext) => {
  const y = Number(accidentIso.slice(0, 4));
  const m = Number(accidentIso.slice(5, 7)) - 1;
  const py = m === 0 ? y - 1 : y;
  const pm = m === 0 ? 11 : m - 1;
  const slip = payslip(e, py, pm, ctx);
  return { amount: Math.round(slip.gross), period: slip.period, basic: slip.basic, house: slip.houseAllowance, transport: slip.transportAllowance, overtime: slip.overtime, casual: slip.casual, daysWorked: slip.daysWorked };
};

export const WIBA_MONTHS = 96;
export const TTD_MAX_DAYS = 365;

/** WIBA 2007 s.29–31: TTD at full earnings for up to 12 months; permanent disablement % × 96 months; death 96 months plus funeral costs. */
export const wibaEstimate = (c: Pick<WibaClaim, 'basis' | 'monthlyEarnings' | 'ttdDays' | 'ppdPercent' | 'medicalKes' | 'funeralKes'>) => {
  const daily = c.monthlyEarnings / 30;
  const days = Math.min(c.ttdDays, TTD_MAX_DAYS);
  // No periodical payment where disablement lasts three days or less
  const ttd = c.basis !== 'DEATH' && days > 3 ? Math.round(daily * days) : 0;
  const ppd = c.basis === 'PERMANENT' ? Math.round((c.ppdPercent / 100) * WIBA_MONTHS * c.monthlyEarnings) : 0;
  const death = c.basis === 'DEATH' ? Math.round(WIBA_MONTHS * c.monthlyEarnings) : 0;
  const medical = Math.round(c.medicalKes);
  const funeral = c.basis === 'DEATH' ? Math.round(c.funeralKes) : 0;
  return { daily: Math.round(daily), days, ttd, ppd, death, medical, funeral, total: ttd + ppd + death + medical + funeral };
};

/* ---------------- Permits to work ---------------- */

export const permitView = (p: WorkPermit, now: string): PermitStatus | 'EXPIRED' => (p.status === 'ACTIVE' && p.validTo < now ? 'EXPIRED' : p.status);

export const gasPass = (g: Pick<GasTest, 'o2' | 'lel' | 'h2s' | 'co'>) => g.o2 >= 19.5 && g.o2 <= 23.5 && g.lel < 10 && g.h2s < 10 && g.co < 25;

/** What still blocks a permit from going live. */
export const permitBlockers = (p: WorkPermit, now: string) => {
  const t = PERMIT_TYPES[p.type];
  const out: string[] = [];
  if (t.gasTest) {
    const last = p.gasTests[p.gasTests.length - 1];
    if (!last) out.push('Gas test before entry');
    else if (!gasPass(last)) out.push('Last gas test failed — ventilate and retest');
  }
  if (t.isolation && (!p.isolations.length || p.isolations.some((x) => !x.verified))) out.push('Isolation points locked, tagged and verified');
  if (t.fireWatch && !p.fireWatch?.trim()) out.push('Fire watch named');
  if (p.validTo < now) out.push('Validity has passed — raise a new permit');
  return out;
};

const LEGACY_TYPE: Record<string, OshPermit['permitType']> = {
  HOT_WORK: 'Hot Work (Welding)',
  CONFINED_SPACE: 'Confined Space Entry',
  ELECTRICAL: 'High-Voltage Electrical',
  CHEMICAL: 'Chemical Handling'
};

/** The older permit shape still used by the side drawer. */
export const toLegacyPermit = (p: WorkPermit, now: string): OshPermit => {
  const v = permitView(p, now);
  return {
    id: p.id,
    orgId: p.orgId,
    permitNo: p.number,
    permitType: LEGACY_TYPE[p.type] ?? (PERMIT_TYPES[p.type].label as OshPermit['permitType']),
    location: p.location,
    issuedTo: p.holder,
    status: v === 'CLOSED' ? 'COMPLETED' : v === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE',
    safetyChecksCompleted: permitBlockers({ ...p, validTo: '9999' }, now).length === 0,
    authorizedBy: p.approvedBy ?? '—',
    expiryTime: p.validTo.replace('T', ' ')
  };
};

/* ---------------- PPE ---------------- */

export const ppeFor = (e: Pick<HREmployee, 'jobTitle' | 'department'>) => {
  const site = siteOf(e);
  const ids = new Set<string>();
  for (const r of PPE_RULES) if (r.sites.includes(site) || (r.titles && r.titles.test(e.jobTitle))) r.items.forEach((x) => ids.add(x));
  return [...ids].filter((id) => PPE_ITEMS[id]);
};

export type PpeLine = { itemId: string; last?: PpeIssue; replaceBy?: string; state: 'MISSING' | 'DUE' | 'SOON' | 'OK' };

export const ppeStatus = (e: HREmployee, issues: PpeIssue[], today: string): PpeLine[] =>
  ppeFor(e).map((itemId) => {
    const last = issues.filter((x) => x.staffId === e.staffId && x.itemId === itemId).sort((a, b) => b.issuedOn.localeCompare(a.issuedOn))[0];
    if (!last) return { itemId, state: 'MISSING' as const };
    const replaceBy = addMonths(last.issuedOn, PPE_ITEMS[itemId].lifespanMonths);
    const left = daysUntil(today, replaceBy);
    return { itemId, last, replaceBy, state: left < 0 ? ('DUE' as const) : left <= 30 ? ('SOON' as const) : ('OK' as const) };
  });

/* ---------------- Inspections, responders, medicals, statutory ---------------- */

export const inspectionDue = (areaId: string, list: Inspection[], today: string) => {
  const area = INSPECTION_AREAS.find((a) => a.id === areaId)!;
  const done = list.filter((x) => x.areaId === areaId && x.status === 'DONE').sort((a, b) => b.doneOn!.localeCompare(a.doneOn!))[0];
  const scheduled = list.filter((x) => x.areaId === areaId && x.status === 'SCHEDULED').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0];
  const nextDue = scheduled?.scheduledFor ?? (done ? addDays(done.doneOn!, area.everyDays) : today);
  return { area, done, scheduled, nextDue, overdue: nextDue < today };
};

export const responderCoverage = (staff: HREmployee[], responders: Responder[], today: string) =>
  (Object.keys(SITES) as SiteId[]).map((site) => {
    const people = staff.filter((e) => siteOf(e) === site);
    const valid = (role: Responder['role']) => responders.filter((r) => r.role === role && r.expiresOn >= today && people.some((p) => p.staffId === r.staffId));
    const ratio = SITES[site].highRisk ? FIRST_AID_RATIO.high : FIRST_AID_RATIO.normal;
    const needFa = people.length ? Math.max(1, Math.ceil(people.length / ratio)) : 0;
    const needFm = people.length ? 1 : 0;
    const fa = valid('FIRST_AIDER').length;
    const fm = valid('FIRE_MARSHAL').length;
    return { site, workers: people.length, ratio, needFa, fa, needFm, fm, ok: fa >= needFa && fm >= needFm };
  });

/** Medicals an employee needs, from the role. */
export const medicalsFor = (e: HREmployee) => {
  const site = siteOf(e);
  return (Object.keys(MEDICAL_RULES) as MedicalType[]).filter((t) => {
    const r = MEDICAL_RULES[t];
    return r.all || r.sites.includes(site);
  });
};

export const medicalStatus = (e: HREmployee, exams: MedicalExam[], today: string) =>
  medicalsFor(e).map((type) => {
    const rule = MEDICAL_RULES[type];
    const last = exams.filter((x) => x.staffId === e.staffId && x.type === type).sort((a, b) => b.doneOn.localeCompare(a.doneOn))[0];
    // Pre-employment: once, before or within the first month of starting
    const nextDue = last ? (rule.everyMonths ? addMonths(last.doneOn, rule.everyMonths) : undefined) : type === 'PRE_EMPLOYMENT' ? addDays(e.joinedDate, 30) : today;
    const required = type !== 'PRE_EMPLOYMENT' || e.joinedDate >= addDays(today, -365);
    const left = nextDue ? daysUntil(today, nextDue) : 999;
    return { type, last, nextDue, required, state: !required ? ('NA' as const) : left < 0 ? ('OVERDUE' as const) : left <= 30 ? ('SOON' as const) : ('OK' as const) };
  });

export const statutoryDue = (s: StatutoryItem) => addMonths(s.lastDone, STATUTORY_KINDS[s.kind].everyMonths);

/* ---------------- Rates ---------------- */

/** LTIFR and TRIFR per 1,000,000 hours over the last 12 months. */
export const frequencyRates = (incidents: OshIncident[], hours: number, today: string) => {
  const since = addDays(today, -365);
  const inYear = incidents.filter((i) => i.occurredOn > since && i.occurredOn <= today);
  const lti = inYear.filter(isLti).length;
  const trc = inYear.filter(isRecordable).length;
  const rate = (n: number) => (hours ? Math.round(((n * 1_000_000) / hours) * 100) / 100 : 0);
  const lastLti = incidents.filter(isLti).map((i) => i.occurredOn).sort().pop();
  return { lti, trc, ltifr: rate(lti), trifr: rate(trc), lastLti, daysSinceLti: lastLti ? dayNum(today) - dayNum(lastLti) : null };
};
