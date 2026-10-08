import { createBus, pid } from './bus';
import { audit } from './audit';

/**
 * Configurable approval rules. Each rule says who approves a kind of document, from what value or level it
 * applies, and whether a second approver is needed. Stores look up the rule that applies with ruleFor() at the
 * moment of approval, so changing a rule here changes the workflow without code.
 */
export interface ApprovalRule {
  id: string;
  key: string;
  area: string;
  document: string;
  /** Applies when the document's value (or level) is at least this */
  minValue: number;
  valueLabel: string;
  approverRole: string;
  /** Optional second approval, in order, after the first */
  secondRole?: string;
  active: boolean;
}

/** Roles a rule can name, with display names. */
export const RULE_ROLES: Record<string, string> = {
  QHSE: 'QHSE Manager',
  ICT_MANAGER: 'ICT Manager',
  ICT_OFFICER: 'ICT Officer',
  SECRETARY: 'Company Secretary'
};

/** Documents that consult these rules, with how their value is measured. */
export const RULE_KEYS: Record<string, { area: string; document: string; valueLabel: string }> = {
  'ict.change': { area: 'ICT', document: 'Change to a live system', valueLabel: 'Risk level (1 low · 2 medium · 3 high)' },
  'qa.capa.verify': { area: 'Quality', document: 'Corrective action closure', valueLabel: 'Always (0)' },
  'qa.risk.emerging': { area: 'Quality', document: 'Emerging risk onto the register', valueLabel: 'Inherent score (1–25)' },
  'qa.opportunity': { area: 'Quality', document: 'Improvement opportunity', valueLabel: 'Estimated benefit, KES' },
  'wf.document': { area: 'Workflows', document: 'Controlled document approval', valueLabel: 'Always (0)' }
};

const seed: ApprovalRule[] = [
  { id: 'r1', key: 'ict.change', minValue: 0, approverRole: 'ICT_MANAGER', active: true, ...RULE_KEYS['ict.change'] },
  { id: 'r2', key: 'ict.change', minValue: 3, approverRole: 'ICT_MANAGER', secondRole: 'QHSE', active: true, ...RULE_KEYS['ict.change'] },
  { id: 'r3', key: 'qa.capa.verify', minValue: 0, approverRole: 'QHSE', active: true, ...RULE_KEYS['qa.capa.verify'] },
  { id: 'r4', key: 'qa.risk.emerging', minValue: 0, approverRole: 'QHSE', active: true, ...RULE_KEYS['qa.risk.emerging'] },
  { id: 'r5', key: 'qa.risk.emerging', minValue: 15, approverRole: 'QHSE', secondRole: 'SECRETARY', active: true, ...RULE_KEYS['qa.risk.emerging'] },
  { id: 'r6', key: 'qa.opportunity', minValue: 0, approverRole: 'QHSE', active: true, ...RULE_KEYS['qa.opportunity'] },
  { id: 'r7', key: 'qa.opportunity', minValue: 500_000, approverRole: 'QHSE', secondRole: 'SECRETARY', active: true, ...RULE_KEYS['qa.opportunity'] },
  { id: 'r8', key: 'wf.document', minValue: 0, approverRole: 'SECRETARY', active: true, ...RULE_KEYS['wf.document'] }
];

const bus = createBus<ApprovalRule>(seed);
export const useRules = bus.use;
export const allRules = bus.all;

/** The active rule with the highest threshold the value reaches, or a fallback. */
export const ruleFor = (key: string, value = 0): Pick<ApprovalRule, 'approverRole' | 'secondRole'> => {
  const hit = bus
    .all()
    .filter((r) => r.key === key && r.active && value >= r.minValue)
    .sort((a, b) => b.minValue - a.minValue)[0];
  return hit ?? { approverRole: 'QHSE' };
};

/** The role whose approval is needed next, given how many approvals the document already has. */
export const nextApprover = (key: string, value: number, approvalsSoFar: number) => {
  const r = ruleFor(key, value);
  const steps = [r.approverRole, ...(r.secondRole ? [r.secondRole] : [])];
  return { role: steps[approvalsSoFar], steps, last: approvalsSoFar >= steps.length - 1 };
};

type R = { ok: true } | { ok: false; error: string };
export const saveRule = (by: string, r: Omit<ApprovalRule, 'id' | 'area' | 'document' | 'valueLabel'> & { id?: string }): R => {
  if (!RULE_KEYS[r.key]) return { ok: false, error: 'Choose the document type' };
  if (!RULE_ROLES[r.approverRole]) return { ok: false, error: 'Choose the approver' };
  if (r.secondRole && r.secondRole === r.approverRole) return { ok: false, error: 'The second approver must be a different role' };
  if (!(r.minValue >= 0)) return { ok: false, error: 'The threshold cannot be negative' };
  const full: ApprovalRule = { ...RULE_KEYS[r.key], ...r, secondRole: r.secondRole || undefined, id: r.id ?? pid('rl') };
  const before = bus.all().find((x) => x.id === full.id);
  bus.set(before ? bus.all().map((x) => (x.id === full.id ? full : x)) : [...bus.all(), full]);
  audit({ module: 'Workflows', by, action: before ? 'Approval rule changed' : 'Approval rule added', ref: `${full.document} ≥ ${full.minValue}`, field: 'approver', before: before ? `${before.approverRole}${before.secondRole ? ` + ${before.secondRole}` : ''}${before.active ? '' : ' (off)'}` : '', after: `${full.approverRole}${full.secondRole ? ` + ${full.secondRole}` : ''}${full.active ? '' : ' (off)'}` });
  return { ok: true };
};
export const removeRule = (by: string, id: string) => {
  const r = bus.all().find((x) => x.id === id);
  bus.set(bus.all().filter((x) => x.id !== id));
  if (r) audit({ module: 'Workflows', by, action: 'Approval rule removed', ref: `${r.document} ≥ ${r.minValue}` });
};
