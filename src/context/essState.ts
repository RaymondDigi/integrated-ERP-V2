import { useState } from 'react';
import type { HREmployee } from '../types';
import type { PayItem, StaffLoan } from '../data/payItems';
import { useSession } from '../auth/session';
import { canApprove } from '../platform/access';
import { advanceCheck, suspensionBlock } from '../data/hcmEngine';

/**
 * Requests employees raise in the self-service portal. HR, payroll and Finance decide them from the
 * Approval Center or Employee Master › Employee requests, and approval acts on the real records:
 * an advance becomes a staff loan, a claim a payroll reimbursement, a bank change updates the employee.
 */

export type EssRequestType =
  | 'Employment Confirmation Letter'
  | 'Salary Advance'
  | 'Expense Reimbursement'
  | 'Bank / M-Pesa Details Change'
  | 'Equipment / Asset Request'
  | 'Training Request'
  | 'Personal Details Change'
  | 'Payroll Query'
  | 'Resignation'
  | 'Safety Report';

export interface EssRequest {
  id: string;
  staffId: string;
  type: EssRequestType;
  details: string;
  amountKes?: number;
  /** Salary advance: months to repay (1–3) */
  months?: number;
  /** Bank / M-Pesa change: the new account text */
  newValue?: string;
  /** Resignation: last working day */
  lastDay?: string;
  submittedOn: string;
  status: 'Submitted' | 'In Review' | 'Approved' | 'Completed' | 'Declined';
  assignedTo: string;
  decidedBy?: string;
  decidedOn?: string;
  note?: string;
  /** What approval created: loan, payroll item, exit case, incident, training need */
  link?: string;
  /** Two-step requests (advance, expense claim): the line manager approves first, then Finance */
  stage?: 'MANAGER' | 'FINANCE';
  managerApprovedBy?: string;
  managerApprovedOn?: string;
}

/** Requests that need the line manager and then Finance. */
export const TWO_STEP: EssRequestType[] = ['Salary Advance', 'Expense Reimbursement'];

export const REQUEST_ROUTING: Record<EssRequestType, string> = {
  'Employment Confirmation Letter': 'HR Officer',
  'Salary Advance': 'Line Manager → Finance',
  'Expense Reimbursement': 'Line Manager → Finance',
  'Bank / M-Pesa Details Change': 'Payroll Officer',
  'Equipment / Asset Request': 'IT / Admin',
  'Training Request': 'Line Manager → L&D',
  'Personal Details Change': 'HR Officer',
  'Payroll Query': 'Payroll Officer',
  Resignation: 'HR — Separation',
  'Safety Report': 'Safety officer (OSH)'
};

/** Who may decide each type (names stand in for logins, like the rest of the demo). */
export const REQUEST_APPROVERS: Record<EssRequestType, string[]> = {
  'Employment Confirmation Letter': ['Rose Chepkoech', 'Joseph Kiprono'],
  'Salary Advance': ['David Otieno', 'Amina Hassan'],
  'Expense Reimbursement': ['David Otieno', 'Amina Hassan'],
  'Bank / M-Pesa Details Change': ['Rose Chepkoech'],
  'Equipment / Asset Request': ['Samuel Kiptoo', 'Brian Kamau'],
  'Training Request': ['Rose Chepkoech', 'Joseph Kiprono'],
  'Personal Details Change': ['Rose Chepkoech', 'Joseph Kiprono'],
  'Payroll Query': ['Rose Chepkoech'],
  Resignation: ['Rose Chepkoech', 'Joseph Kiprono'],
  'Safety Report': ['Ruth Chebet']
};

const NOW = new Date();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rel = (days: number) => iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days));

export const INITIAL_ESS_REQUESTS: EssRequest[] = [
  { id: 'ESS-REQ-1042', staffId: 'KHE-0102', type: 'Employment Confirmation Letter', details: 'Letter addressed to Embassy of Germany for visa application.', submittedOn: rel(-8), status: 'Completed', assignedTo: 'HR Officer', decidedBy: 'Rose Chepkoech', decidedOn: rel(-7), note: 'Letter issued and emailed.' },
  { id: 'ESS-REQ-1057', staffId: 'KHE-0102', type: 'Expense Reimbursement', details: 'Travel to Kericho branch for quarterly HR clinic — fuel and accommodation.', amountKes: 18_450, submittedOn: rel(-5), status: 'In Review', assignedTo: 'Finance', stage: 'FINANCE', managerApprovedBy: 'Esther Muthoni', managerApprovedOn: rel(-4) },
  // Other staff, so HR has a queue to work
  { id: 'ESS-REQ-1061', staffId: 'KHE-0251', type: 'Salary Advance', details: 'School fees for third term.', amountKes: 20_000, months: 2, submittedOn: rel(-2), status: 'Submitted', assignedTo: 'Line Manager → Finance', stage: 'MANAGER' },
  { id: 'ESS-REQ-1062', staffId: 'KHE-0280', type: 'Bank / M-Pesa Details Change', details: 'Moved salary account to Co-op Bank.', newValue: 'Co-op 01****2291', submittedOn: rel(-1), status: 'Submitted', assignedTo: 'Payroll Officer' },
  { id: 'ESS-REQ-1063', staffId: 'KHE-0263', type: 'Payroll Query', details: 'Holiday overtime for Mazingira Day stock count not on my September payslip.', submittedOn: rel(-3), status: 'In Review', assignedTo: 'Payroll Officer' }
];

type Toast = (t: { type: 'success' | 'error' | 'info' | 'warning'; title: string; message: string }) => void;
type Draft = Omit<PayItem, 'id' | 'orgId' | 'postedBy' | 'postedOn' | 'status'>;

export interface EssStateSlice {
  essRequests: EssRequest[];
  submitEssRequest: (r: Omit<EssRequest, 'id' | 'submittedOn' | 'status' | 'assignedTo'>) => EssRequest | null;
  decideEssRequest: (id: string, approve: boolean, by: string, note?: string) => boolean;
}

interface Deps {
  hrEmployees: HREmployee[];
  payrollOpenPeriod: { key: string; label: string };
  tenantName: (orgId: string) => string;
  postPayItems: (items: Draft[], by?: string) => number;
  addStaffLoan: (l: Omit<StaffLoan, 'id' | 'orgId' | 'status' | 'installment'> & { installment?: number }) => StaffLoan | null;
  updateHrEmployee: (staffId: string, patch: Partial<HREmployee>) => void;
  addTrainingNeed?: (n: { staffId: string; skill: string; reason: string; source: 'Appraisal' | 'Manager' | 'Compliance' | 'Employee'; ref?: string; priority: 'High' | 'Medium' | 'Low' }) => void;
  startExit?: (d: { staffId: string; kind: 'RESIGNATION'; noticeDate: string; lastDay: string; reason: string }, by: string) => { id: string } | null;
  reportIncident?: (d: {
    kind: 'NEAR_MISS';
    occurredOn: string;
    time: string;
    site: 'OFFICE' | 'FACTORY' | 'ESTATE';
    location: string;
    description: string;
    severity: 'NONE';
    immediateActions: string;
    witnesses: string[];
    staffId?: string;
  }) => { id: string } | null;
  addToast: Toast;
  /** Basic, gross and net pay for the open period — used for the advance limits */
  payOf?: (staffId: string) => { basic: number; gross: number; net: number };
  /** Salary advances still being recovered */
  openAdvances?: (staffId: string) => number;
}

export const useEssState = (d: Deps): EssStateSlice => {
  const [essRequests, setRequests] = useState<EssRequest[]>(INITIAL_ESS_REQUESTS);
  const emp = (id: string) => d.hrEmployees.find((e) => e.staffId === id);
  const today = iso(new Date());
  const session = useSession();
  const fail = (title: string, message: string) => {
    d.addToast({ type: 'error', title, message });
    return false;
  };
  /** The signed-in approver may decide when their role approves; named approvers stand in for HR and Finance logins */
  const sessionApprover = (by: string) => !!session && session.name === by && canApprove(session.role);

  const submitEssRequest: EssStateSlice['submitEssRequest'] = (r) => {
    const e = emp(r.staffId);
    if (!e) return null;
    const id = `ESS-REQ-${1064 + essRequests.length}`;
    let req: EssRequest = { ...r, id, submittedOn: today, status: 'Submitted', assignedTo: REQUEST_ROUTING[r.type], stage: TWO_STEP.includes(r.type) ? 'MANAGER' : undefined };
    if (TWO_STEP.includes(r.type) && !((r.amountKes ?? 0) > 0)) {
      fail('Amount needed', 'Enter the amount.');
      return null;
    }
    if (r.type === 'Salary Advance') {
      // Policy: at most half of basic, 1–3 months, one advance at a time, net pay stays above a third of gross
      const pay = d.payOf?.(r.staffId) ?? { basic: e.basicSalaryKes, gross: e.basicSalaryKes, net: e.basicSalaryKes };
      const chk = advanceCheck({ amount: r.amountKes ?? 0, months: r.months ?? 1, basic: pay.basic, gross: pay.gross, net: pay.net, openAdvances: (d.openAdvances?.(r.staffId) ?? 0) + essRequests.filter((x) => x.staffId === r.staffId && x.type === 'Salary Advance' && (x.status === 'Submitted' || x.status === 'In Review')).length });
      if (!chk.ok) {
        fail('Advance not submitted', chk.errors.join(' '));
        return null;
      }
    }
    // Some requests act straight away; the rest wait for a decision
    if (r.type === 'Training Request' && d.addTrainingNeed) {
      d.addTrainingNeed({ staffId: r.staffId, skill: r.details.split(/[,.\n]/)[0].slice(0, 80), reason: r.details, source: 'Employee', ref: id, priority: 'Low' });
      req = { ...req, status: 'In Review', link: 'Training needs' };
    }
    if (r.type === 'Resignation') {
      if (!r.lastDay) return null;
      const c = d.startExit?.({ staffId: r.staffId, kind: 'RESIGNATION', noticeDate: today, lastDay: r.lastDay, reason: r.details || 'Resigned through the employee portal' }, e.fullName);
      if (!c) return null;
      req = { ...req, status: 'In Review', link: c.id };
    }
    if (r.type === 'Safety Report') {
      const office = /Human|Finance|Information|Sales|Administration/.test(e.department);
      const inc = d.reportIncident?.({
        kind: 'NEAR_MISS',
        occurredOn: today,
        time: new Date().toTimeString().slice(0, 5),
        site: office ? 'OFFICE' : /Production|Engineering/.test(e.department) ? 'FACTORY' : 'ESTATE',
        location: e.branch,
        description: r.details,
        severity: 'NONE',
        immediateActions: 'Reported through the employee portal',
        witnesses: [],
        staffId: r.staffId
      });
      if (!inc) return null;
      req = { ...req, status: 'Completed', link: inc.id, decidedBy: 'OSH register', decidedOn: today, note: `Logged as ${inc.id} for the safety officer` };
    }
    setRequests((prev) => [req, ...prev]);
    d.addToast({ type: 'success', title: 'Request submitted', message: `${req.type} (${id}) sent to ${req.assignedTo}.` });
    return req;
  };

  const decideEssRequest: EssStateSlice['decideEssRequest'] = (id, approve, by, note) => {
    const r = essRequests.find((x) => x.id === id);
    const e = r && emp(r.staffId);
    if (!r || !e) return false;
    if (e.fullName === by) {
      d.addToast({ type: 'error', title: 'Segregation of duties', message: 'You cannot decide your own request.' });
      return false;
    }
    const approver = d.hrEmployees.find((x) => x.fullName === by);
    const susp = approver ? suspensionBlock(approver, 'decide requests') : null;
    if (susp) return fail('Approver suspended', susp);
    const managerStep = TWO_STEP.includes(r.type) && r.stage !== 'FINANCE';
    if (managerStep) {
      const lineManager = d.hrEmployees.find((x) => x.staffId === e.reportsToStaffId)?.fullName;
      if (by !== lineManager && !sessionApprover(by)) return fail('Not the line manager', `${r.type} goes first to ${lineManager ?? 'the line manager'}.`);
    } else if (!REQUEST_APPROVERS[r.type].includes(by) && !sessionApprover(by)) {
      return fail('Not an approver', `${r.type} is decided by ${REQUEST_APPROVERS[r.type].join(' or ')}.`);
    }
    if (!managerStep && TWO_STEP.includes(r.type) && r.managerApprovedBy === by) return fail('Segregation of duties', `${by} approved this as line manager; Finance must be someone else.`);
    if (!approve && !note?.trim()) {
      d.addToast({ type: 'error', title: 'Reason needed', message: 'Say why the request is declined — the employee sees it.' });
      return false;
    }
    if (managerStep && approve) {
      setRequests((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'In Review', stage: 'FINANCE', assignedTo: 'Finance', managerApprovedBy: by, managerApprovedOn: today, note: note?.trim() || undefined } : x)));
      d.addToast({ type: 'success', title: 'Manager approved', message: `${r.id} for ${e.fullName} now goes to Finance.` });
      return true;
    }
    let link = r.link;
    let done = 'Approved';
    if (approve) {
      if (r.type === 'Salary Advance') {
        const loan = d.addStaffLoan({
          staffId: r.staffId,
          type: 'SALARY_ADVANCE',
          lender: d.tenantName(e.orgId),
          principal: r.amountKes ?? 0,
          ratePa: 0,
          method: 'none',
          termMonths: Math.min(3, Math.max(1, r.months ?? 1)),
          startPeriod: d.payrollOpenPeriod.key,
          disbursedOn: today,
          reference: `Advance ${r.id}`
        });
        if (!loan) return false;
        link = loan.id;
        done = `Paid out; recovered over ${loan.termMonths} month${loan.termMonths === 1 ? '' : 's'} from ${d.payrollOpenPeriod.label} (${loan.id})`;
      }
      if (r.type === 'Expense Reimbursement') {
        d.postPayItems([{ staffId: r.staffId, componentId: 'REIMBURSEMENT', amount: r.amountKes ?? 0, period: d.payrollOpenPeriod.key, recurring: false, reference: `${r.id}: ${r.details.slice(0, 60)}`, source: 'Manual' }], by);
        link = 'Payroll item';
        done = `Added to the ${d.payrollOpenPeriod.label} payroll (not taxable)`;
      }
      if (r.type === 'Bank / M-Pesa Details Change' && r.newValue) {
        const mpesa = /^\+?254|^07/.test(r.newValue.replace(/\s/g, ''));
        d.updateHrEmployee(r.staffId, mpesa ? { mpesaPhoneMasked: r.newValue } : { bankAccountMasked: r.newValue });
        done = `Payroll now pays to ${r.newValue}`;
      }
      if (r.type === 'Personal Details Change') done = 'Employee record updated by HR';
      if (r.type === 'Employment Confirmation Letter') done = 'Letter issued';
    }
    setRequests((prev) =>
      prev.map((x) =>
        x.id === id
          ? {
              ...x,
              status: !approve ? 'Declined' : ['Salary Advance', 'Expense Reimbursement', 'Bank / M-Pesa Details Change', 'Employment Confirmation Letter', 'Personal Details Change', 'Payroll Query', 'Equipment / Asset Request'].includes(x.type) ? 'Completed' : 'Approved',
              decidedBy: by,
              decidedOn: today,
              note: note?.trim() || (approve ? done : undefined),
              link
            }
          : x
      )
    );
    d.addToast({ type: approve ? 'success' : 'info', title: approve ? `${r.type} approved` : `${r.type} declined`, message: approve ? `${e.fullName}: ${done}.` : `${e.fullName} will see your reason.` });
    return true;
  };

  return { essRequests, submitEssRequest, decideEssRequest };
};
