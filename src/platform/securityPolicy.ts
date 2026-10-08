import { createBus } from './bus';
import { audit } from './audit';
import { adminDenied } from './guard';
import type { Role } from '../auth/session';

/**
 * Sign-in policy: which roles must use an authenticator code, and the password rules checked when a password is
 * set. The sign-in screen reads it; the authenticator itself stays emulated in this build.
 */
export interface SecurityPolicy {
  mfaRoles: Role[];
  minLength: number;
  requireNumber: boolean;
  requireSymbol: boolean;
  requireUpper: boolean;
  expiryDays: number;
  lockoutAttempts: number;
}

const bus = createBus<SecurityPolicy>([{ mfaRoles: ['admin'], minLength: 10, requireNumber: true, requireSymbol: true, requireUpper: true, expiryDays: 90, lockoutAttempts: 5 }]);
export const useSecurityPolicy = () => bus.use()[0];
export const securityPolicy = () => bus.all()[0];

export const mfaRequiredFor = (role: Role, accountHasMfa?: boolean) => !!accountHasMfa || securityPolicy().mfaRoles.includes(role);

/** Problems with a proposed password under the current policy (empty when it passes). */
export const passwordProblems = (pw: string) => {
  const p = securityPolicy();
  const out: string[] = [];
  if (pw.length < p.minLength) out.push(`at least ${p.minLength} characters`);
  if (p.requireNumber && !/\d/.test(pw)) out.push('a number');
  if (p.requireUpper && !/[A-Z]/.test(pw)) out.push('a capital letter');
  if (p.requireSymbol && !/[^A-Za-z0-9]/.test(pw)) out.push('a symbol');
  return out;
};

export const setSecurityPolicy = (by: string, next: SecurityPolicy): { ok: true } | { ok: false; error: string } => {
  const denied = adminDenied();
  if (denied) return { ok: false, error: denied };
  if (next.minLength < 8) return { ok: false, error: 'Passwords must be at least 8 characters' };
  if (!next.mfaRoles.includes('admin')) return { ok: false, error: 'Administrators must always use MFA' };
  if (next.lockoutAttempts < 3 || next.lockoutAttempts > 10) return { ok: false, error: 'Lock-out must be between 3 and 10 attempts' };
  const before = securityPolicy();
  bus.set([next]);
  (Object.keys(next) as (keyof SecurityPolicy)[]).forEach((k) => {
    if (JSON.stringify(before[k]) !== JSON.stringify(next[k])) audit({ module: 'Security', by, action: 'Security policy changed', field: k, before: String(before[k]), after: String(next[k]) });
  });
  return { ok: true };
};
