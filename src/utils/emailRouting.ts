import type { HREmployee } from '../types';

/**
 * Two addresses per employee:
 * - the work email (company domain) signs in and receives approval requests — company business stays on company mail;
 * - the personal email receives notices about the employee's own affairs (leave and request decisions, payslips,
 *   exit and final dues), so they still arrive after the employee leaves or loses access to work mail.
 */

export const COMPANY_DOMAINS = ['intergrated-erp.ke', 'ops.intergrated-erp.ke'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());
/** Company domain or a company subdomain (ops., nandi., …). */
export const isCompanyEmail = (v: string) => {
  const d = v.trim().toLowerCase().split('@')[1] ?? '';
  return d === COMPANY_DOMAINS[0] || d.endsWith(`.${COMPANY_DOMAINS[0]}`);
};

/** Problems with a work email: must be valid, on a company domain and not used by anyone else. */
export const workEmailError = (v: string, staffId: string | undefined, all: HREmployee[]) => {
  const x = v.trim().toLowerCase();
  if (!x) return 'Work email is required';
  if (!isValidEmail(x)) return 'Enter a valid email';
  if (!isCompanyEmail(x)) return `Use a company address (@${COMPANY_DOMAINS[0]})`;
  const other = all.find((e) => e.staffId !== staffId && (e.email ?? '').toLowerCase() === x);
  return other ? `Already used by ${other.fullName} (${other.staffId})` : '';
};

/** Problems with a personal email: optional, valid and not a company address. */
export const personalEmailError = (v: string) => {
  const x = v.trim();
  if (!x) return '';
  if (!isValidEmail(x)) return 'Enter a valid email';
  return isCompanyEmail(x) ? 'This is a company address — enter the employee’s own email' : '';
};

const DOMAINS = ['gmail.com', 'gmail.com', 'yahoo.com', 'outlook.com', 'gmail.com'];
/** Deterministic personal address for demo records. */
export const demoPersonalEmail = (fullName: string, i: number) => {
  const parts = fullName.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter(Boolean);
  const first = parts[0] ?? 'staff';
  const last = parts[parts.length - 1] ?? 'member';
  const suffix = i % 4 === 0 ? String(70 + (i % 29)) : '';
  return i % 3 === 0 ? `${last}.${first}${suffix}@${DOMAINS[i % DOMAINS.length]}` : `${first}.${last}${suffix}@${DOMAINS[i % DOMAINS.length]}`;
};

export type MailChannel = 'work' | 'personal';

export type MailCategory = 'Approval request' | 'Leave' | 'Self-service request' | 'Payslip' | 'Exit & final dues' | 'Contract & retirement';

/** Which address each kind of message goes to. */
export const CHANNEL_FOR: Record<MailCategory, MailChannel> = {
  'Approval request': 'work',
  Leave: 'personal',
  'Self-service request': 'personal',
  Payslip: 'personal',
  'Exit & final dues': 'personal',
  'Contract & retirement': 'work'
};

export const ROUTING_RULES: { category: MailCategory; channel: MailChannel; what: string }[] = [
  { category: 'Approval request', channel: 'work', what: 'Leave, self-service and final-dues approvals waiting on the approver' },
  { category: 'Leave', channel: 'personal', what: 'Leave request received, approved or declined' },
  { category: 'Self-service request', channel: 'personal', what: 'Requests decided: advances, expenses, letters, bank changes' },
  { category: 'Payslip', channel: 'personal', what: 'Payslip ready when a payroll period is posted' },
  { category: 'Exit & final dues', channel: 'personal', what: 'Exit confirmed, final dues approved and paid, certificate of service' },
  { category: 'Contract & retirement', channel: 'work', what: 'Contract end (90/60/30 days) and retirement (6/3/1 months) notices to the employee and HR' }
];

/** The address a message actually goes to; personal notices fall back to work mail when no personal email is on file. */
export const addressFor = (e: Pick<HREmployee, 'email' | 'personalEmail'>, channel: MailChannel): { to: string; fallback: boolean } => {
  if (channel === 'work') return { to: e.email ?? '', fallback: false };
  return e.personalEmail ? { to: e.personalEmail, fallback: false } : { to: e.email ?? '', fallback: true };
};
