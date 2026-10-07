import type { HREmployee } from '../types';
import { completedYears, dailyRate, isCasual, type ExitType } from './payrollEngine';
import type { PayItem } from './payItems';

/**
 * Separation: notice, clearance and the items payroll needs for final dues (payroll spec §12).
 * The payslip itself (pro-rated salary, leave pay, gratuity, severance, statutory deductions and loan
 * recovery) comes from the payroll engine for the exit month; this file adds what payroll can't know.
 */

export type ExitKind =
  | 'RESIGNATION'
  | 'TERMINATION_NOTICE'
  | 'TERMINATION_PILON'
  | 'SUMMARY_DISMISSAL'
  | 'REDUNDANCY'
  | 'RETIREMENT'
  | 'CONTRACT_EXPIRY'
  | 'DEATH';

export const EXIT_LABEL: Record<ExitKind, string> = {
  RESIGNATION: 'Resignation',
  TERMINATION_NOTICE: 'Termination with notice',
  TERMINATION_PILON: 'Termination — pay in lieu of notice',
  SUMMARY_DISMISSAL: 'Summary dismissal',
  REDUNDANCY: 'Redundancy',
  RETIREMENT: 'Retirement',
  CONTRACT_EXPIRY: 'End of fixed-term contract',
  DEATH: 'Death in service'
};

export const VOLUNTARY: ExitKind[] = ['RESIGNATION', 'RETIREMENT'];

/** What the payroll engine needs to know about how someone left. */
export const engineExitType = (k: ExitKind): ExitType =>
  k === 'RETIREMENT' ? 'Retirement' : k === 'REDUNDANCY' ? 'Redundancy' : k === 'CONTRACT_EXPIRY' ? 'Contract Expiry' : k === 'SUMMARY_DISMISSAL' || k === 'TERMINATION_NOTICE' || k === 'TERMINATION_PILON' ? 'Disciplinary Termination' : 'Resignation';

export type ExitStage = 'NOTICE' | 'CLEARANCE' | 'DUES' | 'APPROVED' | 'PAID' | 'CLOSED' | 'WITHDRAWN';
export const STAGE_LABEL: Record<ExitStage, string> = {
  NOTICE: 'Serving notice',
  CLEARANCE: 'Clearance',
  DUES: 'Final dues',
  APPROVED: 'Dues approved',
  PAID: 'Paid',
  CLOSED: 'Closed',
  WITHDRAWN: 'Withdrawn'
};
export const STAGES: ExitStage[] = ['NOTICE', 'CLEARANCE', 'DUES', 'APPROVED', 'PAID', 'CLOSED'];

export type ClearanceDept = 'Supervisor' | 'Stores' | 'ICT' | 'Finance' | 'HR';
export const CLEARANCE_DEPTS: ClearanceDept[] = ['Supervisor', 'Stores', 'ICT', 'Finance', 'HR'];
export const CLEARANCE_OWNER: Record<ClearanceDept, string> = {
  Supervisor: 'Line manager',
  Stores: 'John Kiprop, Storekeeper',
  ICT: 'Brian Kamau, ICT Officer',
  Finance: 'Grace Wanjiku, Accountant',
  HR: 'Rose Chepkoech, HR & Payroll Officer'
};

export interface ClearanceItem {
  id: string;
  dept: ClearanceDept;
  label: string;
  /** Replacement value if not returned (KES) */
  value?: number;
  status: 'OPEN' | 'CLEARED' | 'NOT_RETURNED' | 'WAIVED';
  by?: string;
  at?: string;
  note?: string;
}

export interface ExitInterview {
  doneOn: string;
  by: string;
  reasons: string[];
  rating: number;
  wouldRejoin: boolean;
  recommend: boolean;
  comments: string;
  regrettable: boolean;
}

export interface ExitCase {
  id: string;
  orgId: string;
  staffId: string;
  kind: ExitKind;
  stage: ExitStage;
  noticeDate: string;
  lastDay: string;
  reason: string;
  raisedBy: string;
  raisedOn: string;
  /** Employer waives the notice an employee did not serve */
  waiveShortfall?: boolean;
  /** Disciplinary case behind a dismissal */
  caseRef?: string;
  /** Redundancy: one month's notice to the union and labour officer (s.40) */
  labourNoticeOn?: string;
  clearance: ClearanceItem[];
  interview?: ExitInterview;
  dues?: { preparedBy: string; preparedOn: string; approvedBy?: string; approvedOn?: string; itemIds: string[]; net?: number };
  certificateIssuedOn?: string;
  timeline: { at: string; by: string; text: string }[];
}

export const EXIT_REASONS = [
  'Better pay elsewhere',
  'Career growth',
  'Relationship with supervisor',
  'Workload or hours',
  'Relocation or family',
  'Further studies',
  'Health',
  'Retirement',
  'Contract ended',
  'Conduct',
  'Restructuring'
];

const day = (iso: string) => new Date(iso + 'T00:00:00');
export const daysBetween = (a: string, b: string) => Math.round((day(b).getTime() - day(a).getTime()) / 86_400_000);
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (iso: string, n: number) => {
  const d = day(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};

/** Contractual notice: 7 days for daily-rated staff, 90 for managers, otherwise one month (≥ 28 days, s.35). */
export const noticeRequired = (e: HREmployee) => (isCasual(e) ? 7 : /director|manager|head|chief/i.test(e.jobTitle) ? 90 : 30);

/** Notice applies to these exits; the others end on a fixed date or immediately. */
export const NOTICE_APPLIES: ExitKind[] = ['RESIGNATION', 'TERMINATION_NOTICE', 'TERMINATION_PILON', 'REDUNDANCY'];

export const noticeFacts = (c: Pick<ExitCase, 'kind' | 'noticeDate' | 'lastDay' | 'waiveShortfall'>, e: HREmployee) => {
  const required = noticeRequired(e);
  const applies = NOTICE_APPLIES.includes(c.kind);
  const served = applies ? Math.max(0, daysBetween(c.noticeDate, c.lastDay)) : 0;
  const shortfall = applies ? Math.max(0, required - served) : 0;
  const rate = dailyRate(e, Number(c.lastDay.slice(0, 4)));
  // Employer cut the notice short → it pays; employee left early → they owe it, unless waived
  const employerPays = c.kind === 'TERMINATION_PILON' || c.kind === 'TERMINATION_NOTICE' || c.kind === 'REDUNDANCY';
  return {
    applies,
    required,
    served,
    shortfall,
    rate,
    payInLieu: employerPays ? shortfall * rate : 0,
    employeeOwes: c.kind === 'RESIGNATION' && !c.waiveShortfall ? shortfall * rate : 0
  };
};

/** Clearance checklist for a leaver; items with a value are charged if not returned. */
export const clearanceTemplate = (e: HREmployee, id: string): ClearanceItem[] => {
  const office = /Finance|Information|Human|Sales|Administration/.test(e.department) || /manager|director|officer|accountant|secretary/i.test(e.jobTitle);
  const field = /Operations|Production|Engineering|General Services/.test(e.department);
  const items: Omit<ClearanceItem, 'id' | 'status'>[] = [
    { dept: 'Supervisor', label: 'Handover notes and work in progress reassigned' },
    { dept: 'Stores', label: 'PPE and uniforms returned', value: field ? 6_500 : undefined },
    ...(field ? [{ dept: 'Stores' as const, label: 'Tools and equipment returned', value: 12_000 }] : []),
    ...(office ? [{ dept: 'ICT' as const, label: 'Laptop and charger returned', value: 85_000 }] : []),
    { dept: 'ICT', label: 'System accounts, email and building access disabled' },
    { dept: 'Finance', label: 'Imprest and advances settled' },
    { dept: 'Finance', label: 'Loan and SACCO balances confirmed for final dues' },
    { dept: 'HR', label: 'Staff ID badge returned', value: 500 },
    { dept: 'HR', label: 'Leave balance reconciled' },
    { dept: 'HR', label: 'Exit interview held' }
  ];
  return items.map((x, i) => ({ ...x, id: `${id}-C${i + 1}`, status: 'OPEN' }));
};

export const clearanceDone = (c: ExitCase) => c.clearance.every((x) => x.status !== 'OPEN');
export const unreturnedValue = (c: ExitCase) => c.clearance.filter((x) => x.status === 'NOT_RETURNED').reduce((s, x) => s + (x.value ?? 0), 0);

type Draft = Omit<PayItem, 'id' | 'orgId' | 'postedBy' | 'postedOn' | 'status'>;

/**
 * Payroll items for the exit month on top of what the engine works out itself: pay in lieu of notice,
 * notice shortfall, unreturned property and training bond recovery (deductions on exit are recovered in full).
 */
export const finalDuesItems = (c: ExitCase, e: HREmployee, bond?: { amount: number; ref: string }): Draft[] => {
  const n = noticeFacts(c, e);
  const period = c.lastDay.slice(0, 7);
  const out: Draft[] = [];
  const base = { staffId: e.staffId, period, recurring: false, source: 'Separation' as const };
  if (n.payInLieu > 0) out.push({ ...base, componentId: 'NOTICE_PAY', amount: n.payInLieu, reference: `${c.id}: ${n.shortfall} days' notice not given × KES ${n.rate.toLocaleString()}` });
  if (n.employeeOwes > 0) out.push({ ...base, componentId: 'OTHER_DEDUCTION', amount: n.employeeOwes, reference: `${c.id}: ${n.shortfall} days' notice not served × KES ${n.rate.toLocaleString()}` });
  const lost = unreturnedValue(c);
  if (lost > 0)
    out.push({
      ...base,
      componentId: 'OTHER_DEDUCTION',
      amount: lost,
      reference: `${c.id}: company property not returned — ${c.clearance
        .filter((x) => x.status === 'NOT_RETURNED')
        .map((x) => x.label.toLowerCase())
        .join(', ')}`
    });
  if (bond && bond.amount > 0) out.push({ ...base, componentId: 'OTHER_DEDUCTION', amount: Math.round(bond.amount), reference: `${c.id}: training bond ${bond.ref} — balance on exit` });
  return out;
};

export const serviceYears = (e: HREmployee, lastDay: string) => completedYears(e.joinedDate, lastDay);

/** Annual turnover: leavers in the year ÷ average headcount. */
export const turnoverRate = (leavers: number, avgHeadcount: number) => (avgHeadcount ? (leavers / avgHeadcount) * 100 : 0);
