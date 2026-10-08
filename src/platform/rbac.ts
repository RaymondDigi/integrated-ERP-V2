import { createBus } from './bus';
import { audit } from './audit';
import { adminDenied } from './guard';
import type { Role } from '../auth/session';

/**
 * Central module access: which sign-in roles may open which screens. Viewers stay read only everywhere (see
 * access.ts); this map decides what appears at all. Administrators edit it in Roles & Access; the change is audited.
 */
export type ModuleKey = 'platform-admin' | 'security' | 'billing' | 'finance' | 'hr' | 'commercial' | 'operations' | 'control' | 'workspace';

export const MODULE_LABEL: Record<ModuleKey, string> = {
  'platform-admin': 'Platform administration (users, roles, settings)',
  security: 'Security and audit logs',
  billing: 'Billing and subscription',
  finance: 'Finance',
  hr: 'People & payroll',
  commercial: 'Trading, procurement and business development',
  operations: 'Warehousing, production, shipping, fleet, maintenance',
  control: 'Quality, ICT, governance and integrations',
  workspace: 'Business overview, approvals and workflows'
};

/** Screen → module it belongs to. Screens not listed are open to every signed-in role. */
export const VIEW_MODULE: Record<string, ModuleKey> = {
  users: 'platform-admin',
  roles: 'platform-admin',
  settings: 'platform-admin',
  organizations: 'platform-admin',
  'org-setup': 'platform-admin',
  security: 'security',
  audit: 'security',
  billing: 'billing',
  finance: 'finance',
  'employee-requisition': 'hr',
  recruitment: 'hr',
  onboarding: 'hr',
  employees: 'hr',
  attendance: 'hr',
  leave: 'hr',
  payroll: 'hr',
  performance: 'hr',
  training: 'hr',
  disciplinary: 'hr',
  'osh-security': 'hr',
  separation: 'hr',
  'hr-services': 'hr',
  trading: 'commercial',
  procurement: 'commercial',
  bizdev: 'commercial',
  warehousing: 'operations',
  production: 'operations',
  shipping: 'operations',
  fleet: 'operations',
  maintenance: 'operations',
  quality: 'control',
  ict: 'control',
  'integrations-hub': 'control',
  governance: 'control',
  implementation: 'control',
  executive: 'workspace',
  approvals: 'workspace'
};

export type AccessMatrix = Record<Exclude<Role, 'employee'>, ModuleKey[]>;

const ALL = Object.keys(MODULE_LABEL) as ModuleKey[];
const DEFAULT: AccessMatrix = {
  admin: ALL,
  manager: ALL.filter((m) => m !== 'billing'),
  member: ALL.filter((m) => m !== 'billing' && m !== 'platform-admin' && m !== 'security'),
  viewer: ALL.filter((m) => m !== 'billing' && m !== 'platform-admin')
};

const bus = createBus<AccessMatrix>([DEFAULT]);
export const useAccessMatrix = () => bus.use()[0];
export const accessMatrix = () => bus.all()[0];

/** Can this role open this screen? Employees only reach self-service and are routed before this check. */
export const canOpen = (role: Role | undefined, view: string) => {
  if (!role) return false;
  if (role === 'admin') return true;
  if (role === 'employee') return view === 'ess';
  const m = VIEW_MODULE[view];
  return !m || accessMatrix()[role].includes(m);
};

export const setModuleAccess = (by: string, role: Exclude<Role, 'employee'>, module: ModuleKey, allowed: boolean): { ok: boolean; error?: string } => {
  const denied = adminDenied();
  if (denied) return { ok: false, error: denied };
  if (role === 'admin') return { ok: false, error: 'Administrators always keep every module' };
  const cur = accessMatrix();
  const list = allowed ? [...new Set([...cur[role], module])] : cur[role].filter((m) => m !== module);
  bus.set([{ ...cur, [role]: list }]);
  audit({ module: 'Platform', by, action: allowed ? 'Module access granted' : 'Module access removed', ref: role, field: module, before: String(!allowed), after: String(allowed) });
  return { ok: true };
};
