import type { HREmployee, LeaveRequest } from '../types';
import type { EssRequest } from '../context/essState';
import { REQUEST_APPROVERS } from '../context/essState';
import type { ExitCase } from './sepEngine';
import { hrApproverFor } from './leaveConfig';
import { MONTHS, PAY_DAY, latestPaidMonth, periodKey } from './payrollEngine';
import { CHANNEL_FOR, addressFor, type MailCategory, type MailChannel } from '../utils/emailRouting';

/**
 * The mail the workspace sends, worked out from the records themselves — leave requests, self-service requests,
 * exit cases and posted payroll — so the outbox is always in step with what happened. Approval requests go to
 * the approver's work email; notices about an employee's own affairs go to their personal email.
 */
export interface OutboxMessage {
  id: string;
  /** Date sent (yyyy-mm-dd) */
  on: string;
  category: MailCategory;
  channel: MailChannel;
  staffId: string;
  recipient: string;
  to: string;
  /** Personal notice sent to work mail because no personal email is on file */
  fallback: boolean;
  subject: string;
  ref: string;
}

interface Input {
  hrEmployees: HREmployee[];
  leaveRequests: LeaveRequest[];
  essRequests: EssRequest[];
  exitCases: ExitCase[];
  /** Periods posted to the ledger this session (yyyy-mm) */
  closedPayrollPeriods: string[];
  today?: Date;
}

const fmtPeriod = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

export const buildOutbox = ({ hrEmployees, leaveRequests, essRequests, exitCases, closedPayrollPeriods, today = new Date() }: Input): OutboxMessage[] => {
  const byId = new Map(hrEmployees.map((e) => [e.staffId, e]));
  const byName = new Map(hrEmployees.map((e) => [e.fullName, e]));
  const out: OutboxMessage[] = [];
  const send = (e: HREmployee | undefined, category: MailCategory, on: string | undefined, subject: string, ref: string, channel: MailChannel = CHANNEL_FOR[category]) => {
    if (!e || !on) return;
    const a = addressFor(e, channel);
    if (!a.to) return;
    out.push({ id: `${ref}|${e.staffId}|${category}|${subject}`, on: on.slice(0, 10), category, channel, staffId: e.staffId, recipient: e.fullName, to: a.to, fallback: a.fallback, subject, ref });
  };

  /* Leave: request to the approver's work email, receipt and decision to the employee's personal email */
  for (const l of leaveRequests) {
    const e = byId.get(l.staffId);
    const span = `${l.leaveType}, ${l.daysCount} day${l.daysCount === 1 ? '' : 's'} from ${l.startDate}`;
    send(e, 'Leave', l.appliedOn, `Leave request received — ${span}`, l.id);
    if (l.status === 'PENDING_APPROVAL') {
      const approver = l.currentStep === 'HR' ? hrApproverFor(l.orgId, hrEmployees) : byId.get(l.approverStaffId ?? '') ?? byName.get(l.approverName ?? '');
      send(approver, 'Approval request', l.appliedOn, `Approve leave for ${l.staffName} — ${span}`, l.id);
    }
    if (l.status === 'APPROVED' || l.status === 'REJECTED')
      send(e, 'Leave', l.decidedOn, `Leave ${l.status === 'APPROVED' ? 'approved' : 'declined'} — ${span}${l.approverName ? ` (${l.approverName})` : ''}`, l.id);
  }

  /* Self-service requests: open ones to every approver's work email, decisions to the employee */
  for (const r of essRequests) {
    const e = byId.get(r.staffId);
    if (r.status === 'Submitted' || r.status === 'In Review')
      for (const name of REQUEST_APPROVERS[r.type]) send(byName.get(name), 'Approval request', r.submittedOn, `${r.type} from ${e?.fullName ?? r.staffId} waiting for your decision`, r.id);
    if (r.decidedOn && ['Approved', 'Completed', 'Declined'].includes(r.status))
      send(e, 'Self-service request', r.decidedOn, `${r.type} ${r.status === 'Declined' ? 'declined' : r.status.toLowerCase()}${r.note ? ` — ${r.note}` : ''}`, r.id);
  }

  /* Exits: confirmation, final-dues approval (finance approver at work) and payment to the leaver's own address */
  for (const c of exitCases) {
    const e = byId.get(c.staffId);
    if (c.stage === 'WITHDRAWN') {
      send(e, 'Exit & final dues', c.timeline[c.timeline.length - 1]?.at ?? c.raisedOn, 'Exit withdrawn — your employment continues', c.id);
      continue;
    }
    send(e, 'Exit & final dues', c.raisedOn, `Exit confirmed — last working day ${c.lastDay}`, c.id);
    if (c.dues && !c.dues.approvedBy) send(byName.get('David Otieno'), 'Approval request', c.dues.preparedOn, `Approve final dues for ${e?.fullName ?? c.staffId}`, c.id);
    if (c.dues?.approvedOn) send(e, 'Exit & final dues', c.dues.approvedOn, `Final dues approved${c.dues.net ? ` — net KES ${Math.round(c.dues.net).toLocaleString()}` : ''}`, c.id);
    if (c.certificateIssuedOn) send(e, 'Exit & final dues', c.certificateIssuedOn, 'Certificate of service issued', c.id);
  }

  /* Payslips: one notice per employee paid in each posted period (seeded months plus those posted this session) */
  const paid = latestPaidMonth(today);
  const seeded = [0, 1].map((k) => {
    const d = new Date(paid.getFullYear(), paid.getMonth() - k, 1);
    return periodKey(d.getFullYear(), d.getMonth());
  });
  for (const key of new Set([...seeded, ...closedPayrollPeriods])) {
    const start = `${key}-01`;
    const payDate = `${key}-${PAY_DAY}`;
    for (const e of hrEmployees)
      if (e.joinedDate <= payDate && !(e.exitDate && e.exitDate < start) && e.status !== 'SUSPENDED')
        send(e, 'Payslip', payDate, `Your ${fmtPeriod(key)} payslip is ready`, `PAY-${key}`);
  }

  return out.sort((a, b) => b.on.localeCompare(a.on) || a.recipient.localeCompare(b.recipient));
};
