import type { HREmployee } from '../types';
import { supervisorFor } from './leaveConfig';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Perspective = 'FINANCIAL' | 'CUSTOMER' | 'PROCESS' | 'LEARNING';
export type Rating = 1 | 2 | 3 | 4 | 5;
export type Potential = 'LOW' | 'MEDIUM' | 'HIGH';
export type Quarter = 1 | 2 | 3;

export interface PerfEvent {
  at: string;
  by: string;
  text: string;
}

export interface CyclePhase {
  key: 'GOALS' | 'Q1' | 'MID' | 'Q3' | 'SELF' | 'SUPERVISOR' | 'HOD' | 'CALIBRATION' | 'ACK';
  label: string;
  due: string;
}

export interface PerfCycle {
  id: string;
  orgId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  status: 'ACTIVE' | 'CLOSED';
  /** Year-end review window opens */
  reviewOpens: string;
  phases: CyclePhase[];
}

export interface OrgGoal {
  id: string;
  cycleId: string;
  orgId: string;
  level: 'COMPANY' | 'DEPARTMENT';
  department?: string;
  parentId?: string;
  perspective: Perspective;
  title: string;
  measure: string;
  target: string;
  ownerStaffId?: string;
}

export type GoalStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED';

export interface PerfGoal {
  id: string;
  cycleId: string;
  staffId: string;
  parentId?: string;
  perspective: Perspective;
  title: string;
  measure: string;
  unit: string;
  target: string;
  actual: string;
  /** Progress towards target, 0–100 */
  progress: number;
  weight: number;
  due: string;
  status: GoalStatus;
  approvedBy?: string;
  approvedOn?: string;
  returnNote?: string;
  self?: number;
  sup?: number;
  selfNote?: string;
  supNote?: string;
}

export type AppraisalStage = 'SELF' | 'SUPERVISOR' | 'HOD' | 'CALIBRATION' | 'ACKNOWLEDGEMENT' | 'DISPUTED' | 'CLOSED';

export interface DevNeed {
  skill: string;
  reason: string;
  priority: 'High' | 'Medium' | 'Low';
  sentOn?: string;
}

export interface Appraisal {
  id: string;
  cycleId: string;
  orgId: string;
  staffId: string;
  appraiserId: string;
  /** Second-level reviewer; blank when the line has no second level */
  hodId?: string;
  stage: AppraisalStage;
  competencies: Record<string, { self?: number; sup?: number }>;
  selfSummary?: string;
  selfOn?: string;
  selfBy?: string;
  supSummary?: string;
  supOn?: string;
  supBy?: string;
  potential?: Potential;
  hodRating?: Rating;
  hodComment?: string;
  hodOn?: string;
  hodBy?: string;
  /** Rating the line proposed (supervisor score, or the second-level adjustment) */
  proposedRating?: Rating;
  finalRating?: Rating;
  calibratedBy?: string;
  calibratedOn?: string;
  releasedOn?: string;
  ack?: { on: string; by: string; agree: boolean; comment?: string };
  dispute?: { resolution: 'UPHELD' | 'REVISED'; note: string; by: string; on: string; from: Rating };
  devNeeds: DevNeed[];
  timeline: PerfEvent[];
}

export interface CheckIn {
  id: string;
  cycleId: string;
  staffId: string;
  quarter: Quarter;
  due: string;
  heldOn?: string;
  by?: string;
  status?: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK';
  notes?: string;
  actions?: string;
}

export interface FeedbackEntry {
  id: string;
  orgId: string;
  staffId: string;
  fromStaffId: string;
  kind: 'RECOGNITION' | 'FEEDBACK' | '360';
  on: string;
  text: string;
  competency?: string;
  rating?: number;
  relationship?: 'Peer' | 'Direct report' | 'Manager' | 'Customer';
}

export interface CalibrationEntry {
  id: string;
  cycleId: string;
  staffId: string;
  at: string;
  by: string;
  from: { rating?: Rating; potential?: Potential };
  to: { rating: Rating; potential: Potential };
  reason: string;
}

export interface RewardLine {
  staffId: string;
  rating: Rating;
  basic: number;
  grade: string;
  compa: number;
  /** 0 below midpoint, 1 around midpoint, 2 above */
  position: 0 | 1 | 2;
  meritPct: number;
  newBasic: number;
  bonus: number;
  /** Share of the year served (joiners are pro-rated) */
  prorata: number;
  capped?: boolean;
  /** Employer cost delta per year of the increase, and of the bonus, from the payroll engine */
  meritCost: number;
  bonusCost: number;
  note?: string;
}

export type RewardStep = 'HR' | 'FINANCE' | 'MD';

export interface RewardRun {
  id: string;
  cycleId: string;
  orgId: string;
  preparedBy: string;
  preparedOn: string;
  bonusPeriod: string;
  meritEffective: string;
  lines: RewardLine[];
  budget: { merit: number; bonus: number };
  overBudget: boolean;
  approvals: { step: RewardStep; by: string; on: string; approve: boolean; comment?: string }[];
  status: 'PENDING_HR' | 'PENDING_FINANCE' | 'PENDING_MD' | 'APPLIED' | 'REJECTED';
  appliedOn?: string;
  postedItems?: number;
  increments?: number;
}

export interface Pip {
  id: string;
  orgId: string;
  cycleId?: string;
  staffId: string;
  appraisalId?: string;
  supervisorId: string;
  openedOn: string;
  openedBy: string;
  reason: string;
  objectives: { id: string; text: string; measure: string; status: 'OPEN' | 'MET' | 'NOT_MET' }[];
  support: string;
  reviews: { due: string; heldOn?: string; note?: string; by?: string }[];
  endDate: string;
  status: 'ACTIVE' | 'EXTENDED' | 'SUCCESSFUL' | 'REFERRED';
  outcome?: { on: string; by: string; note: string; caseId?: string };
  history: PerfEvent[];
}

export interface PriorRating {
  staffId: string;
  cycle: string;
  rating: Rating;
  potential: Potential;
}

export interface PerfSettings {
  /** Share of the score from weighted goals; the rest comes from core competencies */
  goalsWeight: number;
  competencyWeight: number;
  /** Guideline distribution, % of people per rating */
  guideline: Record<Rating, number>;
  /** Merit increase % by rating and position in the salary band (below, at, above midpoint) */
  meritMatrix: Record<Rating, [number, number, number]>;
  /** Bonus in months of basic pay by rating */
  bonusMonths: Record<Rating, number>;
  /** Budgets, % of annual basic pay of the people in a reward run */
  meritBudgetPct: number;
  bonusPoolPct: number;
  /** Ratings at or below this open a performance improvement plan */
  pipAtOrBelow: number;
  /** Joined on or before this date to be appraised in the cycle */
  joinedBy: string;
}

/* ------------------------------------------------------------------ */
/* Scales and policy                                                   */
/* ------------------------------------------------------------------ */

export const PERSPECTIVES: Perspective[] = ['FINANCIAL', 'CUSTOMER', 'PROCESS', 'LEARNING'];
export const PERSPECTIVE_LABEL: Record<Perspective, string> = {
  FINANCIAL: 'Financial',
  CUSTOMER: 'Customer',
  PROCESS: 'Internal process',
  LEARNING: 'Learning & growth'
};

export const RATINGS: Rating[] = [5, 4, 3, 2, 1];
export const RATING_SCALE: Record<Rating, { label: string; descriptor: string }> = {
  5: { label: 'Outstanding', descriptor: 'Far exceeds every target and is a role model for the values.' },
  4: { label: 'Exceeds expectations', descriptor: 'Exceeds most targets; work needs little supervision.' },
  3: { label: 'Meets expectations', descriptor: 'Achieves the agreed targets; solid, reliable contribution.' },
  2: { label: 'Needs improvement', descriptor: 'Misses some key targets; improvement plan needed.' },
  1: { label: 'Unsatisfactory', descriptor: 'Misses most targets; immediate action needed.' }
};

export const POTENTIAL_LABEL: Record<Potential, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

export const COMPETENCIES = [
  { id: 'INTEGRITY', label: 'Integrity', hint: 'Honest, follows company policy and the law' },
  { id: 'SAFETY', label: 'Safety first', hint: 'Works safely and stops unsafe work' },
  { id: 'TEAMWORK', label: 'Teamwork', hint: 'Shares information and helps colleagues' },
  { id: 'QUALITY', label: 'Customer & quality focus', hint: 'Gets it right first time for buyers and colleagues' },
  { id: 'OWNERSHIP', label: 'Accountability', hint: 'Owns results and follows through' }
];

export const STAGE_LABEL: Record<AppraisalStage, string> = {
  SELF: 'Self-assessment',
  SUPERVISOR: 'Supervisor review',
  HOD: 'Second-level review',
  CALIBRATION: 'HR calibration',
  ACKNOWLEDGEMENT: 'Employee acknowledgement',
  DISPUTED: 'Disputed — with HR',
  CLOSED: 'Closed'
};
export const STAGES: AppraisalStage[] = ['SELF', 'SUPERVISOR', 'HOD', 'CALIBRATION', 'ACKNOWLEDGEMENT', 'CLOSED'];

export const REWARD_STEP_LABEL: Record<RewardStep, string> = { HR: 'HR', FINANCE: 'Finance', MD: 'Managing director' };

export const DEFAULT_SETTINGS: PerfSettings = {
  goalsWeight: 70,
  competencyWeight: 30,
  guideline: { 5: 10, 4: 20, 3: 40, 2: 20, 1: 10 },
  meritMatrix: { 5: [10, 8, 6], 4: [7, 6, 4], 3: [5, 4, 3], 2: [0, 0, 0], 1: [0, 0, 0] },
  bonusMonths: { 5: 1.5, 4: 1, 3: 0.5, 2: 0, 1: 0 },
  meritBudgetPct: 4.5,
  bonusPoolPct: 7,
  pipAtOrBelow: 2,
  joinedBy: '2026-06-30'
};

export const POLICY_NOTES = [
  'Daily-rated and output-based casual workers are not appraised formally: their supervisors give feedback at the muster and conversions are handled under s.37.',
  'Staff who joined after 30 June 2026 are reviewed through probation, not this cycle.',
  'Directors, the chief operations officer and the managing director are appraised by the board; their rewards are set by the remuneration committee and are not part of reward runs.',
  'Leavers with an exit date inside the cycle are not appraised.'
];

/* ------------------------------------------------------------------ */
/* Reporting lines for appraisals                                      */
/* ------------------------------------------------------------------ */

const isMd = (e: HREmployee) => /managing director|chief executive/i.test(e.jobTitle);
export const groupMd = (all: HREmployee[]) => all.find((e) => isMd(e) && e.status !== 'TERMINATED');

/** Executives who report to the group managing director for appraisal. */
const APPRAISER_OVERRIDE: Record<string, 'MD'> = { 'KHE-0120': 'MD', 'KHE-0419': 'MD', 'KHE-0104': 'MD' };

export const appraiserOf = (e: HREmployee, all: HREmployee[]): HREmployee | undefined => {
  const md = groupMd(all);
  if (APPRAISER_OVERRIDE[e.staffId]) return md && md.staffId !== e.staffId ? md : undefined;
  const s = supervisorFor(e, all);
  if (s && s.staffId !== e.staffId) return s;
  return md && md.staffId !== e.staffId ? md : undefined;
};

/** The appraiser's own manager; never the appraisee or the appraiser. */
export const secondLevelOf = (e: HREmployee, all: HREmployee[]): HREmployee | undefined => {
  const first = appraiserOf(e, all);
  if (!first) return undefined;
  const second = appraiserOf(first, all);
  if (second && second.staffId !== e.staffId && second.staffId !== first.staffId) return second;
  const md = groupMd(all);
  return md && md.staffId !== e.staffId && md.staffId !== first.staffId ? md : undefined;
};

export const isCasualWorker = (e: HREmployee) => /daily-rated|output-based/i.test(e.contractType) || (e.basicSalaryKes === 0 && !!e.payRateKes);
export const isBoardAppraised = (e: HREmployee) => /director|chief|managing/i.test(e.jobTitle);

/** Whether someone is appraised in a cycle, and why not. */
export const eligibility = (e: HREmployee, cycle: Pick<PerfCycle, 'orgId' | 'periodEnd'>, settings: Pick<PerfSettings, 'joinedBy'>): { ok: boolean; reason?: string } => {
  if (e.orgId !== cycle.orgId) return { ok: false, reason: 'Other company' };
  if (e.status === 'TERMINATED') return { ok: false, reason: 'Left the company' };
  if (e.exitDate && e.exitDate <= cycle.periodEnd) return { ok: false, reason: 'Leaving in the cycle' };
  if (isCasualWorker(e)) return { ok: false, reason: 'Casual worker — excluded by policy' };
  if (isMd(e)) return { ok: false, reason: 'Appraised by the board' };
  if (e.joinedDate > settings.joinedBy) return { ok: false, reason: 'Joined late — probation review' };
  return { ok: true };
};

/* ------------------------------------------------------------------ */
/* Seed data                                                           */
/* ------------------------------------------------------------------ */

const hash = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};
const clamp = (n: number, lo = 1, hi = 5) => Math.max(lo, Math.min(hi, n));

const ORG_PREFIX: Record<string, string> = { 'org-kericho': 'KHE', 'org-factory': 'KPF', 'org-nandi': 'NHO', 'org-rift': 'RVA', 'org-nairobi': 'HQ' };

const phasesFor = (): CyclePhase[] => [
  { key: 'GOALS', label: 'Goal setting & approval', due: '2026-01-31' },
  { key: 'Q1', label: 'Q1 check-in', due: '2026-04-15' },
  { key: 'MID', label: 'Mid-year review (Q2)', due: '2026-07-31' },
  { key: 'Q3', label: 'Q3 check-in', due: '2026-09-30' },
  { key: 'SELF', label: 'Self-assessment', due: '2026-10-16' },
  { key: 'SUPERVISOR', label: 'Supervisor review', due: '2026-11-06' },
  { key: 'HOD', label: 'Second-level review', due: '2026-11-20' },
  { key: 'CALIBRATION', label: 'HR calibration', due: '2026-12-04' },
  { key: 'ACK', label: 'Employee acknowledgement', due: '2026-12-18' }
];

export const CHECKIN_DUE: Record<Quarter, string> = { 1: '2026-04-15', 2: '2026-07-31', 3: '2026-09-30' };

type Tpl = [Perspective, string, string, string, number, 'up' | 'down', number, string?];

/** Company and department goals of the main company: [key, level, department, perspective, title, measure, target, parent]. */
const KHE_ORG_GOALS: [string, 'COMPANY' | 'DEPARTMENT', string, Perspective, string, string, string, string?][] = [
  ['C1', 'COMPANY', '', 'FINANCIAL', 'Grow revenue to KES 1.85bn', 'Revenue (KES m)', '1,850'],
  ['C2', 'COMPANY', '', 'FINANCIAL', 'Hold cost of production at KES 182 per kg made tea', 'Cost per kg (KES)', '182'],
  ['C3', 'COMPANY', '', 'CUSTOMER', 'Lift buyer satisfaction and keep Rainforest and Fairtrade certification', 'Buyer satisfaction (%)', '85'],
  ['C4', 'COMPANY', '', 'PROCESS', 'Zero lost-time injuries and 98% on-time dispatch', 'LTIFR · on-time %', '0.5 · 98'],
  ['C5', 'COMPANY', '', 'LEARNING', 'Every employee trained on mandatory courses; build the supervisor bench', 'Training completion (%)', '90'],
  ['FIN-D1', 'DEPARTMENT', 'Finance & Administration', 'FINANCIAL', 'Overheads within budget and books closed by working day 5', 'Close day', '5', 'C2'],
  ['FIN-D2', 'DEPARTMENT', 'Finance & Administration', 'PROCESS', 'Statutory filings 100% on time', 'On-time filings (%)', '100', 'C4'],
  ['FIN-D3', 'DEPARTMENT', 'Finance & Administration', 'LEARNING', 'Mandatory training completion 90%', 'Completion (%)', '90', 'C5'],
  ['SAL-D1', 'DEPARTMENT', 'Sales & Marketing', 'FINANCIAL', 'Sell 9.2m kg at an average of KES 210 per kg', 'Volume (m kg)', '9.2', 'C1'],
  ['SAL-D2', 'DEPARTMENT', 'Sales & Marketing', 'CUSTOMER', 'Buyer satisfaction of at least 85%', 'Survey score (%)', '85', 'C3'],
  ['OPS-D1', 'DEPARTMENT', 'Operations', 'PROCESS', '98% on-time leaf collection and dispatch', 'On-time trips (%)', '98', 'C4'],
  ['OPS-D2', 'DEPARTMENT', 'Operations', 'FINANCIAL', 'Fleet and stores cost within budget', 'Cost per km (KES)', '62', 'C2'],
  ['ENG-D1', 'DEPARTMENT', 'Engineering & Maintenance', 'PROCESS', 'Plant uptime of 97%', 'Uptime (%)', '97', 'C4'],
  ['PRD-D1', 'DEPARTMENT', 'Production & Quality Control', 'PROCESS', 'Make 4.1m kg of tea with rejects under 1.5%', 'Made tea (m kg)', '4.1', 'C2'],
  ['PRD-D2', 'DEPARTMENT', 'Production & Quality Control', 'CUSTOMER', 'First-grade tea at 92% or more', 'First grade (%)', '92', 'C3'],
  ['OSH-D1', 'DEPARTMENT', 'OSH & Compliance', 'PROCESS', 'Zero lost-time injuries; pass both certification audits', 'LTIFR', '0.5', 'C4'],
  ['ICT-D1', 'DEPARTMENT', 'Information Technology', 'PROCESS', 'Core systems available 99.5% of the time', 'Uptime (%)', '99.5', 'C4'],
  ['ICT-D2', 'DEPARTMENT', 'Information Technology', 'LEARNING', 'Digital leaf weighing at all six blocks', 'Blocks live', '6', 'C5'],
  ['GEN-D1', 'DEPARTMENT', 'General Services', 'PROCESS', 'Packing accuracy of 99.5%', 'Accuracy (%)', '99.5', 'C4']
];

/** Individual goal templates by job title: [perspective, title, measure, unit, target, better, weight, parent goal]. */
const ROLE_GOALS: Record<string, Tpl[]> = {
  'Finance Director': [
    ['FINANCIAL', 'Deliver budgeted EBITDA', 'EBITDA', 'KES m', 420, 'up', 30, 'FIN-D1'],
    ['FINANCIAL', 'Reduce debtor days', 'Debtor days', 'days', 45, 'down', 20, 'FIN-D1'],
    ['PROCESS', 'Close the external audit management letter', 'Points closed', '%', 100, 'up', 20, 'FIN-D2'],
    ['CUSTOMER', 'Meet every bank covenant', 'Covenants met', '%', 100, 'up', 15, 'C1'],
    ['LEARNING', 'Build a finance succession bench', 'Successors ready', 'people', 2, 'up', 15, 'FIN-D3']
  ],
  'Chief Operations Officer': [
    ['PROCESS', 'Make 4.1m kg of tea', 'Made tea', 'm kg', 4.1, 'up', 30, 'PRD-D1'],
    ['FINANCIAL', 'Hold cost of production', 'Cost per kg', 'KES', 182, 'down', 25, 'C2'],
    ['PROCESS', 'Cut lost-time injuries', 'LTIFR', 'per 200k hrs', 0.5, 'down', 15, 'C4'],
    ['CUSTOMER', 'Lift buyer satisfaction', 'Survey score', '%', 85, 'up', 15, 'C3'],
    ['LEARNING', 'Put supervisors through the leadership programme', 'Supervisors certified', 'people', 8, 'up', 15, 'C5']
  ],
  'Finance Manager': [
    ['PROCESS', 'Close the books by working day 5', 'Close day', 'working day', 5, 'down', 30, 'FIN-D1'],
    ['FINANCIAL', 'Keep overheads within budget', 'Spend vs budget', '%', 100, 'down', 25, 'FIN-D1'],
    ['PROCESS', 'File PAYE, VAT, NSSF and SHIF on time', 'On-time filings', '%', 100, 'up', 25, 'FIN-D2'],
    ['LEARNING', 'Coach the finance team on the new ERP', 'Staff signed off', 'people', 4, 'up', 20, 'FIN-D3']
  ],
  Accountant: [
    ['PROCESS', 'Reconcile all bank accounts by day 3', 'Reconciled by', 'working day', 3, 'down', 30, 'FIN-D1'],
    ['FINANCIAL', 'Pay suppliers accurately', 'Payment accuracy', '%', 99.5, 'up', 30, 'FIN-D1'],
    ['PROCESS', 'Verify the fixed asset register', 'Assets verified', '%', 100, 'up', 20, 'FIN-D2'],
    ['LEARNING', 'Pass a CPA section', 'Sections passed', 'sections', 1, 'up', 20, 'FIN-D3']
  ],
  'Accounts Clerk': [
    ['PROCESS', 'Process invoices within two days', 'On time', '%', 95, 'up', 40, 'FIN-D1'],
    ['FINANCIAL', 'Petty cash counts without variance', 'Clean counts', '%', 100, 'up', 30, 'FIN-D1'],
    ['LEARNING', 'Complete advanced Excel training', 'Hours', 'hours', 16, 'up', 30, 'FIN-D3']
  ],
  'Company Secretary': [
    ['PROCESS', 'Issue board papers seven days ahead', 'On time', '%', 100, 'up', 35, 'FIN-D2'],
    ['PROCESS', 'File statutory returns on time', 'On time', '%', 100, 'up', 35, 'FIN-D2'],
    ['LEARNING', 'Run director induction and governance sessions', 'Sessions', 'sessions', 2, 'up', 30, 'FIN-D3']
  ],
  'HR & Payroll Officer': [
    ['PROCESS', 'Run payroll without corrections', 'Corrections per run', 'corrections', 2, 'down', 30, 'FIN-D2'],
    ['LEARNING', 'Get mandatory training completion to 90%', 'Completion', '%', 90, 'up', 25, 'FIN-D3'],
    ['PROCESS', 'Clear leave and attendance exceptions weekly', 'Cleared in week', '%', 95, 'up', 25, 'FIN-D2'],
    ['LEARNING', 'Pass a CHRP module', 'Modules passed', 'modules', 1, 'up', 20, 'FIN-D3']
  ],
  'Commercial Manager': [
    ['FINANCIAL', 'Sell 9.2m kg of made tea', 'Volume sold', 'm kg', 9.2, 'up', 30, 'SAL-D1'],
    ['FINANCIAL', 'Average price per kg', 'Price', 'KES/kg', 210, 'up', 25, 'SAL-D1'],
    ['CUSTOMER', 'Lift buyer satisfaction', 'Survey score', '%', 85, 'up', 25, 'SAL-D2'],
    ['CUSTOMER', 'Sign new direct buyers', 'Buyers signed', 'buyers', 3, 'up', 20, 'SAL-D2']
  ],
  'Commercial Officer': [
    ['PROCESS', 'Accurate auction catalogues', 'Accuracy', '%', 99, 'up', 30, 'SAL-D1'],
    ['FINANCIAL', 'Invoice sales within 24 hours', 'On time', '%', 98, 'up', 25, 'SAL-D1'],
    ['CUSTOMER', 'Buyer visits', 'Visits', 'visits', 24, 'up', 25, 'SAL-D2'],
    ['LEARNING', 'Tea tasting and grading course', 'Courses', 'courses', 1, 'up', 20, 'SAL-D2']
  ],
  'Sales Representative': [
    ['FINANCIAL', 'Direct sales', 'Sales', 'KES m', 48, 'up', 40, 'SAL-D1'],
    ['CUSTOMER', 'Open new retail outlets', 'Outlets', 'outlets', 30, 'up', 30, 'SAL-D2'],
    ['FINANCIAL', 'Collect debts within 30 days', 'Collected', '%', 90, 'up', 30, 'SAL-D1']
  ],
  'Operations Manager': [
    ['PROCESS', 'On-time leaf collection and dispatch', 'On-time trips', '%', 98, 'up', 30, 'OPS-D1'],
    ['FINANCIAL', 'Fleet cost per km', 'Cost per km', 'KES', 62, 'down', 25, 'OPS-D2'],
    ['FINANCIAL', 'Stock count variance', 'Variance', '%', 0.5, 'down', 20, 'OPS-D2'],
    ['LEARNING', 'Coach supervisors through the leadership programme', 'Supervisors coached', 'people', 4, 'up', 25, 'C5']
  ],
  'Operations Officer': [
    ['PROCESS', 'Keep to the leaf collection schedule', 'Adherence', '%', 97, 'up', 35, 'OPS-D1'],
    ['PROCESS', 'Process transport requisitions the same day', 'Same day', '%', 95, 'up', 35, 'OPS-D1'],
    ['LEARNING', 'First aid certification', 'Certified', 'certificates', 1, 'up', 30, 'C5']
  ],
  Storekeeper: [
    ['FINANCIAL', 'Stock count variance', 'Variance', '%', 0.5, 'down', 35, 'OPS-D2'],
    ['PROCESS', 'Post issues the same day', 'Same day', '%', 98, 'up', 30, 'OPS-D1'],
    ['PROCESS', 'Stock-outs of critical spares', 'Stock-outs', 'events', 2, 'down', 20, 'OPS-D1'],
    ['LEARNING', 'Inventory module training', 'Modules', 'modules', 1, 'up', 15, 'C5']
  ],
  Driver: [
    ['PROCESS', 'On-time trips', 'On time', '%', 97, 'up', 35, 'OPS-D1'],
    ['FINANCIAL', 'Fuel efficiency', 'Fuel use', 'km/l', 6.5, 'up', 30, 'OPS-D2'],
    ['PROCESS', 'Daily vehicle inspection checklist', 'Completed', '%', 100, 'up', 20, 'OPS-D1'],
    ['LEARNING', 'Defensive driving refresher', 'Courses', 'courses', 1, 'up', 15, 'C5']
  ],
  'Maintenance Technician': [
    ['PROCESS', 'Complete planned maintenance', 'Completed', '%', 95, 'up', 40, 'ENG-D1'],
    ['PROCESS', 'Mean time to repair', 'Time to repair', 'hours', 4, 'down', 30, 'ENG-D1'],
    ['LEARNING', 'Lockout-tagout certification', 'Certified', 'certificates', 1, 'up', 30, 'C5']
  ],
  'Quality Controller': [
    ['CUSTOMER', 'First-grade tea', 'First grade', '%', 92, 'up', 35, 'PRD-D2'],
    ['PROCESS', 'Lab results within two hours', 'On time', '%', 95, 'up', 30, 'PRD-D1'],
    ['CUSTOMER', 'Buyer quality complaints', 'Complaints', 'complaints', 3, 'down', 20, 'PRD-D2'],
    ['LEARNING', 'HACCP internal auditor course', 'Courses', 'courses', 1, 'up', 15, 'C5']
  ],
  'QHSE Manager': [
    ['PROCESS', 'Lost-time injury frequency rate', 'LTIFR', 'per 200k hrs', 0.5, 'down', 30, 'OSH-D1'],
    ['PROCESS', 'Close audit actions', 'Closed', '%', 95, 'up', 25, 'OSH-D1'],
    ['CUSTOMER', 'Pass Rainforest and Fairtrade audits', 'Audits passed', 'audits', 2, 'up', 25, 'C3'],
    ['LEARNING', 'Train safety representatives', 'Reps trained', 'people', 12, 'up', 20, 'C5']
  ],
  'ICT Manager': [
    ['PROCESS', 'Core system uptime', 'Uptime', '%', 99.5, 'up', 30, 'ICT-D1'],
    ['LEARNING', 'Digital leaf weighing live at the blocks', 'Blocks live', 'blocks', 6, 'up', 30, 'ICT-D2'],
    ['FINANCIAL', 'ICT spend within budget', 'Spend vs budget', '%', 100, 'down', 20, 'C2'],
    ['LEARNING', 'ICT team certifications', 'Certifications', 'certificates', 2, 'up', 20, 'C5']
  ],
  'ICT Officer': [
    ['PROCESS', 'Close helpdesk tickets within SLA', 'In SLA', '%', 92, 'up', 35, 'ICT-D1'],
    ['PROCESS', 'Backup restore tests passed', 'Passed', '%', 100, 'up', 25, 'ICT-D1'],
    ['LEARNING', 'Deploy weighing tablets to blocks', 'Blocks', 'blocks', 6, 'up', 25, 'ICT-D2'],
    ['LEARNING', 'Network certification (CCNA)', 'Certified', 'certificates', 1, 'up', 15, 'C5']
  ],
  'Production Operative': [
    ['PROCESS', 'Output per shift', 'Output', 'kg', 1250, 'up', 40, 'PRD-D1'],
    ['CUSTOMER', 'Quality rejects', 'Rejects', '%', 1.5, 'down', 30, 'PRD-D2'],
    ['PROCESS', 'Attendance', 'Attendance', '%', 97, 'up', 15, 'PRD-D1'],
    ['LEARNING', 'Safety toolbox talks attended', 'Talks', 'talks', 12, 'up', 15, 'C5']
  ],
  'Machine Operator': [
    ['PROCESS', 'Machine uptime', 'Uptime', '%', 96, 'up', 40, 'PRD-D1'],
    ['PROCESS', 'Changeover time', 'Changeover', 'minutes', 25, 'down', 25, 'PRD-D1'],
    ['CUSTOMER', 'Quality rejects', 'Rejects', '%', 1.5, 'down', 20, 'PRD-D2'],
    ['LEARNING', 'Operator certification', 'Certified', 'certificates', 1, 'up', 15, 'C5']
  ],
  Packer: [
    ['PROCESS', 'Packing accuracy', 'Accuracy', '%', 99.5, 'up', 40, 'GEN-D1'],
    ['PROCESS', 'Bags packed per shift', 'Bags', 'bags', 320, 'up', 35, 'GEN-D1'],
    ['CUSTOMER', 'Hygiene audit score', 'Score', '%', 90, 'up', 25, 'C3']
  ],
  'Food Technologist (part-time)': [
    ['CUSTOMER', 'Complete HACCP documentation', 'Complete', '%', 100, 'up', 40, 'PRD-D2'],
    ['PROCESS', 'Product trials run', 'Trials', 'trials', 4, 'up', 30, 'PRD-D1'],
    ['LEARNING', 'Shelf-life studies', 'Studies', 'studies', 2, 'up', 30, 'C5']
  ]
};

const GENERIC: Tpl[] = [
  ['PROCESS', 'Deliver the core duties of the role', 'Work plan delivered', '%', 95, 'up', 50],
  ['CUSTOMER', 'Service to internal and external customers', 'Satisfaction', '%', 85, 'up', 25],
  ['LEARNING', 'Complete planned training', 'Hours', 'hours', 16, 'up', 25]
];

/** The ESS user's goals (Joseph Kiprono, Group HR Manager). */
const ESS_GOALS: Tpl[] = [
  ['PROCESS', 'Reduce payroll processing errors', 'Corrections per monthly run', 'corrections', 2, 'down', 30],
  ['CUSTOMER', 'Roll out Employee Self-Service to all staff', 'Staff active on the portal', '%', 95, 'up', 25],
  ['PROCESS', 'Cut average time-to-hire', 'Days to hire', 'days', 30, 'down', 25],
  ['LEARNING', 'Complete leadership development programme', 'Modules certified', 'modules', 6, 'up', 20]
];

/** Performance level (1–5) behind the seeded results. */
const LEVEL: Record<string, number> = {
  'KHE-0120': 4, 'KHE-0419': 4, 'KHE-0134': 4, 'KHE-0187': 4, 'KHE-0141': 3, 'KHE-0152': 5, 'KHE-0244': 3, 'KHE-0160': 5,
  'KHE-0251': 3, 'KHE-0263': 3, 'KHE-0270': 3, 'KHE-0276': 4, 'KHE-0171': 4, 'KHE-0280': 4, 'KHE-0178': 4, 'KHE-0301': 3,
  'KHE-0302': 4, 'KHE-0303': 2, 'KHE-0290': 4, 'KHE-0295': 3, 'KHE-1111': 2, 'KHE-1105': 3, 'KHE-1101': 5, 'KHE-1106': 2, 'KHE-0102': 4
};
const levelOf = (id: string) => LEVEL[id] ?? [3, 3, 4, 3, 2, 4, 3, 5, 3, 4][hash(id) % 10];

/** Where each main-company appraisal stood on 7 October 2026. */
const KHE_STAGE: Record<string, AppraisalStage> = {
  'KHE-0263': 'CLOSED', 'KHE-0302': 'CLOSED', 'KHE-0270': 'CLOSED',
  'KHE-0244': 'DISPUTED',
  'KHE-0301': 'ACKNOWLEDGEMENT', 'KHE-0276': 'ACKNOWLEDGEMENT',
  'KHE-0280': 'CALIBRATION', 'KHE-0251': 'CALIBRATION', 'KHE-0187': 'CALIBRATION', 'KHE-0303': 'CALIBRATION', 'KHE-1111': 'CALIBRATION', 'KHE-0290': 'CALIBRATION',
  'KHE-0134': 'HOD', 'KHE-0178': 'HOD', 'KHE-0152': 'HOD', 'KHE-1108': 'HOD', 'KHE-1113': 'HOD', 'KHE-0141': 'HOD',
  'KHE-0160': 'SUPERVISOR', 'KHE-0171': 'SUPERVISOR', 'KHE-1100': 'SUPERVISOR', 'KHE-1101': 'SUPERVISOR', 'KHE-1102': 'SUPERVISOR', 'KHE-1109': 'SUPERVISOR', 'KHE-1114': 'SUPERVISOR', 'KHE-0295': 'SUPERVISOR'
};

const RATIO: Record<number, number> = { 1: 0.78, 2: 0.9, 3: 1, 4: 1.07, 5: 1.15 };
export const ratingFromRatio = (r: number): Rating => (r >= 1.12 ? 5 : r >= 1.04 ? 4 : r >= 0.97 ? 3 : r >= 0.88 ? 2 : 1);

const decimals = (n: number) => (String(n).split('.')[1] ?? '').length;
const fmtNum = (n: number, d: number) => n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
const COUNT_UNITS = /people|sections|modules|sessions|buyers|visits|outlets|certificates|courses|events|blocks|audits|trials|studies|talks|bags|corrections|complaints|working day|days|minutes|hours/;

/** Seeded actual for a goal at a performance level. */
const actualFor = (t: Tpl, level: number, salt: string) => {
  const [, , , unit, target, better] = t;
  const jitter = ((hash(salt) % 7) - 3) / 100;
  const ratio = RATIO[level] + jitter;
  const raw = better === 'up' ? target * ratio : target / ratio;
  const d = COUNT_UNITS.test(unit) && Number.isInteger(target) ? 0 : decimals(target);
  const val = d === 0 ? Math.round(raw) : Math.round(raw * 10 ** d) / 10 ** d;
  const capped = unit === '%' && better === 'up' ? Math.min(val, 100) : val;
  const achieved = better === 'up' ? capped / target : capped ? target / capped : 1.2;
  return { actual: fmtNum(capped, d), ratio: achieved, progress: Math.round(Math.min(1, achieved) * 100) };
};

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dayIn = (salt: string, from: number, span: number, month = 10, year = 2026) => iso(year, month, from + (hash(salt) % span));

export interface PerfSeed {
  cycles: PerfCycle[];
  orgGoals: OrgGoal[];
  goals: PerfGoal[];
  appraisals: Appraisal[];
  checkIns: CheckIn[];
  feedback: FeedbackEntry[];
  calibrationLog: CalibrationEntry[];
  pips: Pip[];
  prior: PriorRating[];
}

const CHECKIN_NOTES: Record<NonNullable<CheckIn['status']>, string[]> = {
  ON_TRACK: ['On track on every goal; agreed to keep the current routine.', 'Ahead on output; reminded to log safety talks in the register.', 'Good quarter. Discussed stretch targets for the next quarter.'],
  AT_RISK: ['Behind on one goal; agreed weekly follow-ups with the supervisor.', 'Absences in the quarter affected output; support agreed.', 'Training slipped — booked onto the next session.'],
  OFF_TRACK: ['Most targets missed; improvement plan discussed.', 'Repeated late trips and high fuel use; formal plan recommended.']
};

/** Rich, deterministic data for Kericho Highland Estates and lighter data for the other companies. */
export const buildPerfSeed = (all: HREmployee[]): PerfSeed => {
  const seed: PerfSeed = { cycles: [], orgGoals: [], goals: [], appraisals: [], checkIns: [], feedback: [], calibrationLog: [], pips: [], prior: [] };
  const byId = (id: string) => all.find((e) => e.staffId === id);
  const nameOf = (id?: string) => (id ? byId(id)?.fullName ?? id : '');
  const hrName = 'Rose Chepkoech';
  let gNo = 0;
  let ciNo = 0;

  for (const orgId of Object.keys(ORG_PREFIX)) {
    const cycle: PerfCycle = {
      id: `PC-${ORG_PREFIX[orgId]}-2026`,
      orgId,
      name: 'Annual 2026',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      status: 'ACTIVE',
      reviewOpens: '2026-09-15',
      phases: phasesFor()
    };
    seed.cycles.push(cycle);
    if (orgId === 'org-kericho')
      seed.cycles.push({ id: 'PC-KHE-2025', orgId, name: 'Annual 2025', periodStart: '2025-01-01', periodEnd: '2025-12-31', status: 'CLOSED', reviewOpens: '2025-09-15', phases: [] });

    const main = orgId === 'org-kericho';
    const orgKey = (k: string) => `${ORG_PREFIX[orgId]}-${k}`;
    if (main) {
      for (const [k, level, department, perspective, title, measure, target, parent] of KHE_ORG_GOALS)
        seed.orgGoals.push({
          id: orgKey(k),
          cycleId: cycle.id,
          orgId,
          level,
          department: department || undefined,
          parentId: parent ? orgKey(parent) : undefined,
          perspective,
          title,
          measure,
          target,
          ownerStaffId: level === 'COMPANY' ? 'KHE-0419' : undefined
        });
    } else {
      seed.orgGoals.push(
        { id: orgKey('C1'), cycleId: cycle.id, orgId, level: 'COMPANY', perspective: 'FINANCIAL', title: 'Deliver the 2026 operating budget', measure: 'Profit vs budget (%)', target: '100' },
        { id: orgKey('C2'), cycleId: cycle.id, orgId, level: 'COMPANY', perspective: 'PROCESS', title: 'Safe, on-time operations', measure: 'Lost-time injuries', target: '0' },
        { id: orgKey('C3'), cycleId: cycle.id, orgId, level: 'COMPANY', perspective: 'LEARNING', title: 'Mandatory training for every employee', measure: 'Completion (%)', target: '90' }
      );
    }

    const people = all.filter((e) => eligibility(e, cycle, DEFAULT_SETTINGS).ok);
    for (const e of people) {
      const level = levelOf(e.staffId);
      const ess = e.staffId === 'KHE-0102';
      const tpls = ess ? ESS_GOALS : main ? ROLE_GOALS[e.jobTitle] ?? GENERIC : GENERIC;
      const stage: AppraisalStage = main ? KHE_STAGE[e.staffId] ?? 'SELF' : 'SELF';
      const order: AppraisalStage[] = ['SELF', 'SUPERVISOR', 'HOD', 'CALIBRATION', 'ACKNOWLEDGEMENT', 'DISPUTED', 'CLOSED'];
      const reached = (s: AppraisalStage) => order.indexOf(stage) > order.indexOf(s) || (s === 'ACKNOWLEDGEMENT' && stage === 'CLOSED');
      const selfDone = reached('SELF');
      const supDone = reached('SUPERVISOR');
      const appraiser = appraiserOf(e, all);
      const hod = secondLevelOf(e, all);
      const hodDone = supDone && (reached('HOD') || !hod);

      // Goal sheet
      const goalStatus: GoalStatus = e.staffId === 'KHE-1107' || e.staffId === 'KHE-1112' ? 'SUBMITTED' : e.staffId === 'KHE-1110' ? 'RETURNED' : 'APPROVED';
      const goals: PerfGoal[] = tpls.map((t, i) => {
        const [perspective, title, measure, unit, target, , weight, parent] = t;
        const a = actualFor(t, level, `${e.staffId}${i}`);
        const goalRating = ratingFromRatio(a.ratio);
        const selfR = clamp(goalRating + (hash(`${e.staffId}s${i}`) % 3 === 0 ? 1 : 0));
        return {
          id: `PG-${String(++gNo).padStart(4, '0')}`,
          cycleId: cycle.id,
          staffId: e.staffId,
          parentId: parent ? orgKey(parent) : main ? undefined : orgKey(perspective === 'LEARNING' ? 'C3' : perspective === 'FINANCIAL' ? 'C1' : 'C2'),
          perspective,
          title,
          measure,
          unit,
          target: fmtNum(target, decimals(target)),
          actual: ess || !main ? '' : a.actual,
          progress: ess ? [85, 70, 60, 100][i] ?? 50 : main ? a.progress : 40 + (hash(e.staffId + i) % 40),
          weight: e.staffId === 'KHE-1110' && i === 0 ? weight - 10 : weight,
          due: perspective === 'LEARNING' ? '2026-11-30' : '2026-12-31',
          status: goalStatus,
          approvedBy: goalStatus === 'APPROVED' ? nameOf(appraiser?.staffId) : undefined,
          approvedOn: goalStatus === 'APPROVED' ? iso(2026, 1, 20 + (hash(e.staffId) % 10)) : undefined,
          returnNote: goalStatus === 'RETURNED' ? 'Weights add up to 90%. Add a safety goal worth 10% (toolbox talks) and resubmit.' : undefined,
          self: selfDone ? selfR : undefined,
          sup: supDone ? goalRating : undefined,
          selfNote: selfDone ? `Actual ${a.actual} ${unit} against ${fmtNum(target, decimals(target))}.` : undefined,
          supNote: supDone ? (goalRating >= 4 ? 'Clearly ahead of target.' : goalRating === 3 ? 'Target met.' : 'Below target — see the improvement plan.') : undefined
        };
      });
      if (e.staffId === 'KHE-1107') goals[0].title = 'Output per shift (night line)';
      seed.goals.push(...goals);

      // Competencies
      const comps: Appraisal['competencies'] = {};
      COMPETENCIES.forEach((c) => {
        const j = (hash(`${e.staffId}${c.id}`) % 3) - 1;
        comps[c.id] = { self: selfDone ? clamp(level + Math.max(0, j)) : undefined, sup: supDone ? clamp(level + j) : undefined };
      });

      const goalScore = goals.reduce((n, g) => n + (g.sup ?? 0) * g.weight, 0) / Math.max(1, goals.reduce((n, g) => n + g.weight, 0));
      const compVals = Object.values(comps).map((c) => c.sup ?? 0);
      const compScore = compVals.reduce((n, v) => n + v, 0) / compVals.length;
      const score = (goalScore * DEFAULT_SETTINGS.goalsWeight + compScore * DEFAULT_SETTINGS.competencyWeight) / 100;
      const proposed = (score >= 4.5 ? 5 : score >= 3.5 ? 4 : score >= 2.5 ? 3 : score >= 1.5 ? 2 : 1) as Rating;
      const potential: Potential = level >= 5 || (level >= 4 && /manager|officer|accountant|controller/i.test(e.jobTitle)) ? 'HIGH' : level <= 2 ? 'LOW' : 'MEDIUM';

      const selfOn = dayIn(`${e.staffId}self`, 15, 14, 9);
      const supOn = dayIn(`${e.staffId}sup`, 29, 2, 9) > selfOn ? dayIn(`${e.staffId}sup`, 29, 2, 9) : dayIn(`${e.staffId}sup`, 1, 2);
      const hodOn = dayIn(`${e.staffId}hod`, 1, 1) > supOn ? dayIn(`${e.staffId}hod`, 1, 1) : iso(2026, 10, 2);
      const released = reached('CALIBRATION');
      const timeline: PerfEvent[] = [{ at: '2026-01-20', by: nameOf(appraiser?.staffId) || hrName, text: 'Goals agreed and approved' }];
      if (selfDone) timeline.push({ at: selfOn, by: e.fullName, text: 'Self-assessment submitted' });
      if (supDone) timeline.push({ at: supOn, by: nameOf(appraiser?.staffId), text: `Supervisor review submitted — score ${score.toFixed(2)}` });
      if (hodDone && hod) timeline.push({ at: hodOn, by: nameOf(hod.staffId), text: 'Second-level review: agreed with the supervisor' });
      if (released) timeline.push({ at: '2026-10-02', by: hrName, text: `Calibrated at ${proposed} (${RATING_SCALE[proposed].label}) and released to the employee` });

      const ap: Appraisal = {
        id: `APR-${ORG_PREFIX[orgId]}-${e.staffId.split('-')[1]}`,
        cycleId: cycle.id,
        orgId,
        staffId: e.staffId,
        appraiserId: appraiser?.staffId ?? '',
        hodId: hod?.staffId,
        stage,
        competencies: comps,
        selfSummary: selfDone ? (level >= 4 ? 'A strong year — I delivered ahead of plan on my main targets.' : 'I met most of my targets; I need support on the ones behind.') : undefined,
        selfOn: selfDone ? selfOn : undefined,
        selfBy: selfDone ? e.fullName : undefined,
        supSummary: supDone ? (proposed >= 4 ? `${e.fullName.split(' ')[0]} delivered well above plan and supports the team.` : proposed === 3 ? 'Solid, dependable year. Targets met.' : 'Several targets missed; needs close support next year.') : undefined,
        supOn: supDone ? supOn : undefined,
        supBy: supDone ? nameOf(appraiser?.staffId) : undefined,
        potential: supDone ? potential : undefined,
        hodComment: hodDone && hod ? 'Agree with the supervisor’s rating.' : undefined,
        hodOn: hodDone && hod ? hodOn : undefined,
        hodBy: hodDone && hod ? nameOf(hod.staffId) : undefined,
        proposedRating: hodDone ? proposed : undefined,
        finalRating: released ? proposed : undefined,
        calibratedBy: released ? hrName : undefined,
        calibratedOn: released ? '2026-10-02' : undefined,
        releasedOn: released ? '2026-10-02' : undefined,
        devNeeds: supDone
          ? proposed <= 2
            ? [{ skill: goals.find((g) => (g.sup ?? 5) <= 2)?.title ?? 'Core job skills', reason: 'Rated below target in the 2026 appraisal', priority: 'High' }]
            : level >= 4 && /manager|officer/i.test(e.jobTitle)
              ? [{ skill: 'Leadership and people management', reason: 'High potential — preparing for a bigger role', priority: 'Medium' }]
              : []
          : [],
        timeline
      };
      if (stage === 'CLOSED') {
        ap.ack = { on: dayIn(`${e.staffId}ack`, 3, 3), by: e.fullName, agree: true, comment: 'Thank you — agreed.' };
        ap.timeline.push({ at: ap.ack.on, by: e.fullName, text: 'Acknowledged and agreed' });
      }
      if (stage === 'DISPUTED') {
        ap.ack = { on: '2026-10-05', by: e.fullName, agree: false, comment: 'The Mombasa direct-buyer deal I closed in September is not reflected in my buyer-visits goal. I believe a 4 is fair.' };
        ap.timeline.push({ at: '2026-10-05', by: e.fullName, text: 'Disagreed with the rating — sent to HR' });
      }
      seed.appraisals.push(ap);

      // Check-ins
      for (const q of [1, 2, 3] as Quarter[]) {
        const held = q < 3 ? true : main ? hash(`${e.staffId}q3`) % 3 !== 0 : hash(`${e.staffId}q3`) % 2 === 0;
        const st: CheckIn['status'] = level <= 2 && q >= 2 ? 'OFF_TRACK' : level === 3 && hash(`${e.staffId}${q}`) % 3 === 0 ? 'AT_RISK' : 'ON_TRACK';
        const due = CHECKIN_DUE[q];
        seed.checkIns.push({
          id: `CI-${String(++ciNo).padStart(4, '0')}`,
          cycleId: cycle.id,
          staffId: e.staffId,
          quarter: q,
          due,
          heldOn: held ? iso(2026, Number(due.slice(5, 7)), Math.max(1, Number(due.slice(8, 10)) - 2 - (hash(e.staffId + q) % 9))) : undefined,
          by: held ? nameOf(appraiser?.staffId) : undefined,
          status: held ? st : undefined,
          notes: held ? CHECKIN_NOTES[st!][hash(e.staffId + q) % CHECKIN_NOTES[st!].length] : undefined,
          actions: held && st !== 'ON_TRACK' ? 'Weekly follow-up with the supervisor until back on track.' : undefined
        });
      }

      if (main && e.joinedDate <= '2025-06-30') {
        const r = clamp(e.staffId === 'KHE-0303' ? 3 : e.staffId === 'KHE-1105' ? 2 : level + ((hash(`${e.staffId}25`) % 3) - 1)) as Rating;
        seed.prior.push({ staffId: e.staffId, cycle: 'Annual 2025', rating: r, potential: r >= 4 && level >= 4 ? 'HIGH' : r <= 2 ? 'LOW' : 'MEDIUM' });
      }
    }
  }

  // Continuous feedback, recognition and 360° input
  const fb: [string, string, FeedbackEntry['kind'], string, string, string?, number?, FeedbackEntry['relationship']?][] = [
    ['KHE-0302', 'KHE-0160', 'RECOGNITION', '2026-09-18', 'Got the 6 am leaf truck through the Kipteres washout without losing a load. Calm and safe driving.', 'SAFETY'],
    ['KHE-0280', 'KHE-0178', 'RECOGNITION', '2026-09-24', 'Had all six weighing tablets syncing before the September audit — two weeks early.', 'OWNERSHIP'],
    ['KHE-0263', 'KHE-0160', 'FEEDBACK', '2026-08-29', 'Stock count variance is down, but issues are still posted a day late on Fridays. Please close the day on the system.', 'QUALITY'],
    ['KHE-0303', 'KHE-0160', 'FEEDBACK', '2026-07-24', 'Three late trips this month and fuel use at 5.2 km/l. We need to talk about route planning.', 'OWNERSHIP'],
    ['KHE-0276', 'KHE-0419', 'RECOGNITION', '2026-08-12', 'Caught the moisture problem on line 2 before the buyer sample was sent. Saved the Mombasa lot.', 'QUALITY'],
    ['KHE-0290', 'KHE-0134', 'RECOGNITION', '2026-09-26', 'September payroll ran with no corrections for the first time this year.', 'QUALITY'],
    ['KHE-0152', 'KHE-0419', 'RECOGNITION', '2026-09-30', 'Two new direct buyers signed this quarter, ahead of plan.', 'QUALITY'],
    ['KHE-0187', 'KHE-0134', 'FEEDBACK', '2026-08-05', 'Bank reconciliations are reliable. Next step: lead the fixed asset verification yourself.', 'OWNERSHIP'],
    ['KHE-0270', 'KHE-0160', 'RECOGNITION', '2026-07-15', 'Fixed the withering trough fan on a Sunday so Monday production started on time.', 'TEAMWORK'],
    ['KHE-1111', 'KHE-0160', 'FEEDBACK', '2026-09-10', 'Two mislabelled pallets this month. Please use the checklist on every pallet.', 'QUALITY'],
    ['KHE-0280', 'KHE-0187', '360', '2026-09-28', 'Always responds the same day and explains fixes clearly.', 'TEAMWORK', 5, 'Peer'],
    ['KHE-0280', 'KHE-0244', '360', '2026-09-29', 'Very helpful; could document fixes so others can self-serve.', 'QUALITY', 4, 'Peer'],
    ['KHE-0160', 'KHE-0251', '360', '2026-09-27', 'Clear priorities and backs her team. Sometimes takes on too much herself.', 'TEAMWORK', 4, 'Direct report'],
    ['KHE-0160', 'KHE-0301', '360', '2026-09-27', 'Fair with the drivers and fixes problems fast.', 'OWNERSHIP', 5, 'Direct report'],
    ['KHE-0134', 'KHE-0187', '360', '2026-09-25', 'Good coach on the ERP, but month-end deadlines can be very tight.', 'TEAMWORK', 4, 'Direct report'],
    ['KHE-0152', 'KHE-0244', '360', '2026-09-26', 'Strong with buyers and generous with her contacts.', 'QUALITY', 5, 'Direct report'],
    ['KHE-0244', 'KHE-0152', 'RECOGNITION', '2026-09-22', 'Closed the Mombasa direct-buyer deal — 120 t over six months.', 'QUALITY'],
    ['KHE-0102', 'KHE-0104', 'RECOGNITION', '2026-09-15', 'ESS go-live across all five companies went smoothly. Great coordination.', 'OWNERSHIP']
  ];
  fb.forEach(([staffId, from, kind, on, text, competency, rating, relationship], i) =>
    seed.feedback.push({ id: `FB-${String(i + 1).padStart(3, '0')}`, orgId: byId(staffId)?.orgId ?? 'org-kericho', staffId, fromStaffId: from, kind, on, text, competency, rating, relationship })
  );

  // Calibration panel of 2 October
  seed.appraisals
    .filter((a) => a.releasedOn)
    .forEach((a, i) =>
      seed.calibrationLog.push({ id: `CAL-${String(i + 1).padStart(3, '0')}`, cycleId: a.cycleId, staffId: a.staffId, at: '2026-10-02', by: hrName, from: { rating: a.proposedRating, potential: a.potential }, to: { rating: a.finalRating!, potential: a.potential ?? 'MEDIUM' }, reason: 'Confirmed at the first calibration panel' })
    );

  // Improvement plans
  seed.pips.push(
    {
      id: 'PIP-2026-001',
      orgId: 'org-kericho',
      cycleId: 'PC-KHE-2026',
      staffId: 'KHE-1105',
      supervisorId: 'KHE-0419',
      openedOn: '2026-02-09',
      openedBy: hrName,
      reason: 'Rated 2 (Needs improvement) in the 2025 appraisal: output and rejects below standard.',
      objectives: [
        { id: 'o1', text: 'Output of at least 1,150 kg per shift', measure: 'Shift returns', status: 'MET' },
        { id: 'o2', text: 'Rejects at or below 2%', measure: 'QC reject log', status: 'MET' }
      ],
      support: 'Paired with a senior operative for four weeks; refresher on the CTC line.',
      reviews: [
        { due: '2026-03-09', heldOn: '2026-03-09', note: 'Output 1,080 kg; improving.', by: 'David Kiprono Rono' },
        { due: '2026-04-08', heldOn: '2026-04-08', note: 'Output 1,170 kg; rejects 1.9%.', by: 'David Kiprono Rono' },
        { due: '2026-05-08', heldOn: '2026-05-08', note: 'Both objectives met for six weeks running.', by: 'David Kiprono Rono' }
      ],
      endDate: '2026-05-08',
      status: 'SUCCESSFUL',
      outcome: { on: '2026-05-08', by: 'David Kiprono Rono', note: 'Plan completed successfully; back to normal check-ins.' },
      history: [
        { at: '2026-02-09', by: hrName, text: 'Plan opened after the 2025 appraisal' },
        { at: '2026-05-08', by: 'David Kiprono Rono', text: 'Closed — successful' }
      ]
    },
    {
      id: 'PIP-2026-002',
      orgId: 'org-kericho',
      cycleId: 'PC-KHE-2026',
      staffId: 'KHE-0303',
      supervisorId: 'KHE-0160',
      openedOn: '2026-08-03',
      openedBy: hrName,
      reason: 'Mid-year review off track: fuel use 5.2 km/l against 6.5 and repeated late trips.',
      objectives: [
        { id: 'o1', text: 'Fuel efficiency of at least 6.0 km/l', measure: 'Fleet fuel report', status: 'OPEN' },
        { id: 'o2', text: 'No more than one late trip a month', measure: 'Dispatch log', status: 'OPEN' },
        { id: 'o3', text: 'Daily vehicle checklist every working day', measure: 'Checklist register', status: 'OPEN' }
      ],
      support: 'Defensive driving refresher (booked); route planning with Samuel Ouma; weekly fuel review.',
      reviews: [
        { due: '2026-09-02', heldOn: '2026-09-02', note: 'Fuel 5.6 km/l; one late trip. Some progress.', by: 'Esther Muthoni' },
        { due: '2026-10-02', heldOn: '2026-10-02', note: 'Fuel back to 5.3 km/l; three late trips; checklist missed 4 days.', by: 'Esther Muthoni' },
        { due: '2026-11-02' }
      ],
      endDate: '2026-11-02',
      status: 'ACTIVE',
      history: [{ at: '2026-08-03', by: hrName, text: 'Plan opened after the mid-year review' }]
    }
  );
  return seed;
};
