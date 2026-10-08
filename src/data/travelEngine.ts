/* Travel & petty cash logic: per diem rate tables, trip cost estimates, imprest ageing and the surrender maths. */
import type { HREmployee } from '../types';
import { addDays, daysBetween, gradeOf } from './hireEngine';

/* ------------------------------------------------------------------ rates */

export type GradeBand = 'JG-01–04' | 'JG-05–08' | 'JG-09–12' | 'JG-13+';
export const GRADE_BANDS_TRAVEL: GradeBand[] = ['JG-01–04', 'JG-05–08', 'JG-09–12', 'JG-13+'];

export type DestClass = 'CITY' | 'TOWN' | 'INTL';
export const DEST_CLASSES: { id: DestClass; label: string; short: string }[] = [
  { id: 'CITY', label: 'Nairobi / Mombasa', short: 'Nairobi/Mombasa' },
  { id: 'TOWN', label: 'Other towns in Kenya', short: 'Other towns' },
  { id: 'INTL', label: 'International (USD)', short: 'International' }
];
export const destLabel = (d: DestClass) => DEST_CLASSES.find((x) => x.id === d)?.label ?? d;

export interface PerDiemRate {
  band: GradeBand;
  dest: DestClass;
  /** Per night; USD for international, else KES */
  accommodation: number;
  /** Per day */
  meals: number;
  /** Per day */
  incidentals: number;
}

/** One version of the per diem policy. Old versions are kept so past trips keep their rates. */
export interface PerDiemSchedule {
  id: string;
  effectiveFrom: string;
  /** KES per USD used to convert international rates */
  fxUsdKes: number;
  rates: PerDiemRate[];
  /** Own-car mileage, KES per km, by band */
  mileage: Record<GradeBand, number>;
  note?: string;
  savedBy: string;
  savedOn: string;
}

/** Band from a grade label like 'JG-08 (Technical Specialist)'. */
export const bandOfGrade = (grade: string): GradeBand => {
  const n = Number(/JG-(\d+)/.exec(grade)?.[1] ?? 4);
  return n <= 4 ? 'JG-01–04' : n <= 8 ? 'JG-05–08' : n <= 12 ? 'JG-09–12' : 'JG-13+';
};
export const bandOf = (e: HREmployee) => bandOfGrade(gradeOf(e));

/** The schedule in force on a date (latest effective-from on or before it). */
export const scheduleOn = (schedules: PerDiemSchedule[], date: string) => {
  const sorted = [...schedules].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return sorted.find((s) => s.effectiveFrom <= date) ?? sorted[sorted.length - 1];
};

export const rateFor = (s: PerDiemSchedule, band: GradeBand, dest: DestClass) => s.rates.find((r) => r.band === band && r.dest === dest);

/* ------------------------------------------------------------------ trips */

export type TransportMode = 'COMPANY_CAR' | 'OWN_CAR' | 'BUS' | 'AIR';
export const TRANSPORT: Record<TransportMode, string> = {
  COMPANY_CAR: 'Company car',
  OWN_CAR: 'Own car (mileage)',
  BUS: 'Bus / shuttle',
  AIR: 'Air'
};

export type TravelStatus = 'DRAFT' | 'SUBMITTED' | 'MANAGER_APPROVED' | 'FINANCE_APPROVED' | 'ADVANCE_PAID' | 'TRAVELLED' | 'SURRENDERED' | 'CLOSED' | 'DECLINED';
export const TRAVEL_STATUS: Record<TravelStatus, { label: string; tone: 'success' | 'primary' | 'info' | 'warning' | 'danger' }> = {
  DRAFT: { label: 'Draft', tone: 'primary' },
  SUBMITTED: { label: 'Submitted', tone: 'warning' },
  MANAGER_APPROVED: { label: 'Manager approved', tone: 'warning' },
  FINANCE_APPROVED: { label: 'Finance approved', tone: 'info' },
  ADVANCE_PAID: { label: 'Advance paid', tone: 'info' },
  TRAVELLED: { label: 'Travelled', tone: 'info' },
  SURRENDERED: { label: 'Surrendered', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'success' },
  DECLINED: { label: 'Declined', tone: 'danger' }
};

export interface TravelEvent {
  at: string;
  by: string;
  action: string;
  comment?: string;
}

export interface CostEstimate {
  band: GradeBand;
  scheduleId: string;
  fxUsdKes: number;
  nights: number;
  days: number;
  accommodation: number;
  meals: number;
  incidentals: number;
  mileage: number;
  fares: number;
  /** Accommodation + meals + incidentals, in KES */
  perDiem: number;
  total: number;
}

export interface TravelRequest {
  id: string;
  orgId: string;
  staffId: string;
  purpose: string;
  destinations: string;
  destClass: DestClass;
  departDate: string;
  returnDate: string;
  transport: TransportMode;
  /** Round-trip km for own-car mileage */
  km?: number;
  /** Bus or air tickets (KES), if the employee buys them */
  fares?: number;
  estimate: CostEstimate;
  advanceRequested: number;
  /** What Finance approved as a cash advance */
  advanceApproved?: number;
  /** Per diem paid as cash in the advance, or through payroll as an exempt PER_DIEM item */
  perDiemVia?: 'CASH' | 'PAYROLL';
  perDiemPayRef?: string;
  managerId?: string;
  status: TravelStatus;
  createdOn: string;
  imprestId?: string;
  events: TravelEvent[];
}

export const nightsBetween = (depart: string, ret: string) => (depart && ret ? Math.max(0, daysBetween(depart, ret)) : 0);

/** Estimated trip cost in KES from the rate table: nights × accommodation, days × meals and incidentals, plus mileage and fares. */
export const estimateTrip = (
  t: { departDate: string; returnDate: string; destClass: DestClass; transport: TransportMode; km?: number; fares?: number },
  band: GradeBand,
  schedules: PerDiemSchedule[]
): CostEstimate => {
  const s = scheduleOn(schedules, t.departDate || '9999-12-31');
  const r = s ? rateFor(s, band, t.destClass) : undefined;
  const fx = t.destClass === 'INTL' ? (s?.fxUsdKes ?? 1) : 1;
  const nights = nightsBetween(t.departDate, t.returnDate);
  const days = t.departDate && t.returnDate ? nights + 1 : 0;
  const accommodation = Math.round((r?.accommodation ?? 0) * nights * fx);
  const meals = Math.round((r?.meals ?? 0) * days * fx);
  const incidentals = Math.round((r?.incidentals ?? 0) * days * fx);
  const mileage = t.transport === 'OWN_CAR' ? Math.round((t.km ?? 0) * (s?.mileage[band] ?? 0)) : 0;
  const fares = t.transport === 'BUS' || t.transport === 'AIR' ? Math.round(t.fares ?? 0) : 0;
  const perDiem = accommodation + meals + incidentals;
  return { band, scheduleId: s?.id ?? '', fxUsdKes: fx, nights, days, accommodation, meals, incidentals, mileage, fares, perDiem, total: perDiem + mileage + fares };
};

/** Return date + 7 days: when the travel advance must be surrendered. */
export const TRAVEL_SURRENDER_DAYS = 7;
export const PETTY_CASH_SURRENDER_DAYS = 3;
export const STANDALONE_SURRENDER_DAYS = 14;
export const PETTY_CASH_LIMIT = 20_000;
export const FINANCE_APPROVER = 'KHE-0134';

/* ------------------------------------------------------------------ imprest and petty cash */

export type ImprestKind = 'TRAVEL' | 'STANDALONE' | 'PETTY_CASH';
export const IMPREST_KIND: Record<ImprestKind, string> = { TRAVEL: 'Travel advance', STANDALONE: 'Imprest', PETTY_CASH: 'Petty cash' };

export type ImprestStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'SURRENDERED' | 'RECOVERED' | 'DECLINED';
export const IMPREST_STATUS: Record<ImprestStatus, { label: string; tone: 'success' | 'primary' | 'info' | 'warning' | 'danger' }> = {
  PENDING: { label: 'Awaiting approval', tone: 'warning' },
  APPROVED: { label: 'Approved — to pay', tone: 'info' },
  PAID: { label: 'Paid — to surrender', tone: 'primary' },
  SURRENDERED: { label: 'Surrendered', tone: 'success' },
  RECOVERED: { label: 'Recovered via payroll', tone: 'success' },
  DECLINED: { label: 'Declined', tone: 'danger' }
};

export interface ReceiptLine {
  date: string;
  description: string;
  amount: number;
  receiptNo: string;
}

export type Settlement = 'NONE' | 'CASH_REFUND' | 'PAYROLL_RECOVERY' | 'PAYROLL_REIMBURSE' | 'CASH_REIMBURSE' | 'NOT_REIMBURSED';
export const SETTLEMENT: Record<Settlement, string> = {
  NONE: 'Spent exactly — nothing to settle',
  CASH_REFUND: 'Employee refunded the balance in cash',
  PAYROLL_RECOVERY: 'Balance recovered through payroll',
  PAYROLL_REIMBURSE: 'Overspend reimbursed through payroll',
  CASH_REIMBURSE: 'Overspend reimbursed in cash',
  NOT_REIMBURSED: 'Overspend not approved — not reimbursed'
};

export interface Surrender {
  on: string;
  by: string;
  lines: ReceiptLine[];
  spent: number;
  /** Advance less spent: positive = unspent (employee owes), negative = overspent */
  variance: number;
  settlement: Settlement;
  overspendApproved?: boolean;
  payrollRef?: string;
  payrollPeriod?: string;
}

/** What petty cash and imprest money is spent on (drives the expense account Finance charges). */
export const EXPENSE_CATEGORIES = [
  'Stationery & printing',
  'Fuel & transport',
  'Meals & refreshments',
  'Repairs & maintenance',
  'Postage & courier',
  'Cleaning & sanitation',
  'Airtime & data',
  'Casual labour',
  'Office supplies',
  'Other'
] as const;

/** One item on a petty cash or imprest request; a request can carry many. */
export interface ImprestLine {
  description: string;
  category: string;
  /** Department / cost centre charged for this line */
  costCentre: string;
  quantity: number;
  unitCost: number;
  /** quantity × unit cost */
  amount: number;
  /** Amount the approver allowed (may be less than asked); unset until decided */
  approved?: number;
}

export const lineAmount = (l: Pick<ImprestLine, 'quantity' | 'unitCost'>) => Math.round((Number(l.quantity) || 0) * (Number(l.unitCost) || 0));

export interface Imprest {
  id: string;
  orgId: string;
  staffId: string;
  kind: ImprestKind;
  travelId?: string;
  purpose: string;
  /** Department / cost centre charged */
  costCentre: string;
  /** Total to pay: sum of the lines (approved amounts once decided) */
  amount: number;
  /** Items requested in one go; older single-amount requests have none */
  lines?: ImprestLine[];
  /** Total asked for before the approver trimmed any line */
  requestedAmount?: number;
  requestedOn: string;
  approverId?: string;
  status: ImprestStatus;
  paidOn?: string;
  paidFrom?: 'FLOAT' | 'BANK';
  /** Surrender due date */
  dueOn?: string;
  surrender?: Surrender;
  recovery?: { on: string; by: string; amount: number; period: string; ref: string };
  events: TravelEvent[];
}

export interface FloatMove {
  id: string;
  orgId: string;
  on: string;
  kind: 'OPENING' | 'ISSUE' | 'REFUND' | 'REPLENISH';
  amount: number;
  ref: string;
  by: string;
  note?: string;
}

/** The request's lines; a single-amount request reads as one line. */
export const linesOf = (i: Imprest): ImprestLine[] =>
  i.lines?.length ? i.lines : [{ description: i.purpose, category: 'Other', costCentre: i.costCentre, quantity: 1, unitCost: i.requestedAmount ?? i.amount, amount: i.requestedAmount ?? i.amount, approved: i.status === 'PENDING' ? undefined : i.amount }];

/** Signed effect of a float movement on cash in the box. */
export const floatEffect = (m: FloatMove) => (m.kind === 'ISSUE' ? -m.amount : m.amount);

/** Days past the surrender date (0 if not overdue). */
export const overdueDays = (i: Imprest, today: string) => (i.status === 'PAID' && i.dueOn && i.dueOn < today ? daysBetween(i.dueOn, today) : 0);
export const isOutstanding = (i: Imprest) => i.status === 'PAID';

/** Why an employee can't take a new advance: unsurrendered imprest past its due date. */
export const imprestBlockReason = (staffId: string, imprests: Imprest[], today: string) => {
  const late = imprests.filter((i) => i.staffId === staffId && overdueDays(i, today) > 0);
  if (!late.length) return undefined;
  const total = late.reduce((n, i) => n + i.amount, 0);
  return `${late.map((i) => i.id).join(', ')} not surrendered (KES ${total.toLocaleString()}, ${Math.max(...late.map((i) => overdueDays(i, today)))} days overdue). Surrender or recover it before a new advance.`;
};

export const dueDateFor = (kind: ImprestKind, paidOn: string, travelReturn?: string) =>
  kind === 'TRAVEL' && travelReturn
    ? addDays(travelReturn > paidOn ? travelReturn : paidOn, TRAVEL_SURRENDER_DAYS)
    : addDays(paidOn, kind === 'PETTY_CASH' ? PETTY_CASH_SURRENDER_DAYS : STANDALONE_SURRENDER_DAYS);

export const receiptsTotal = (lines: ReceiptLine[]) => lines.reduce((n, l) => n + (Number(l.amount) || 0), 0);
