import { useSyncExternalStore } from 'react';
import type { NavigationTarget } from '../context/AppContext';

/**
 * Emulated unified sign-in. Mirrors the Integrated ERP login flow — email and password, an authenticator
 * code for accounts that have one, a lock-out after repeated wrong passwords and a 12-hour session — but
 * runs entirely in the browser with demo accounts. Nothing here is real security.
 */

export type Role = 'admin' | 'manager' | 'member' | 'viewer' | 'employee';

export interface Account {
  email: string;
  name: string;
  initials: string;
  title: string;
  role: Role;
  /** Employee record behind the account, where there is one */
  staffId?: string;
  /** Where the account lands after signing in */
  landing: NavigationTarget;
  /** Accounts with an authenticator app must also enter a 6-digit code */
  mfa?: boolean;
}

/** One password for every demo account. */
export const DEMO_PASSWORD = 'Integrated@2026';
/** Code the emulated authenticator shows. */
export const DEMO_MFA_CODE = '246810';

export const ACCOUNTS: Account[] = [
  { email: 'admin@integrated.local', name: 'Workspace Administrator', initials: 'WA', title: 'System administrator', role: 'admin', landing: 'apps', mfa: true },
  { email: 'j.kiprono@intergrated-erp.ke', name: 'Joseph Kiprono', initials: 'JK', title: 'Group HR Manager', role: 'manager', staffId: 'KHE-0102', landing: 'apps' },
  { email: 'r.chepkoech@intergrated-erp.ke', name: 'Rose Chepkoech', initials: 'RC', title: 'HR & Payroll Officer', role: 'member', staffId: 'KHE-0290', landing: 'payroll' },
  { email: 'd.otieno@intergrated-erp.ke', name: 'David Otieno', initials: 'DO', title: 'Finance Manager', role: 'manager', staffId: 'KHE-0134', landing: 'finance' },
  { email: 'e.muthoni@intergrated-erp.ke', name: 'Esther Muthoni', initials: 'EM', title: 'Operations Manager', role: 'manager', staffId: 'KHE-0160', landing: 'production' },
  { email: 'a.hassan@intergrated-erp.ke', name: 'Amina Hassan', initials: 'AH', title: 'Finance Director', role: 'viewer', staffId: 'KHE-0120', landing: 'executive' },
  { email: 'portal@intergrated-erp.ke', name: 'Joseph Kiprono', initials: 'JK', title: 'Employee self-service', role: 'employee', staffId: 'KHE-0102', landing: 'ess' }
];

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator — every module, approvals and settings',
  manager: 'Manager — read, write and approve',
  member: 'Member — read and write',
  viewer: 'Viewer — read only',
  employee: 'Employee portal only'
};

const SESSION_KEY = 'ieui.session';
const ATTEMPTS_KEY = 'ieui.loginAttempts';
const SESSION_HOURS = 12;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

interface StoredSession {
  email: string;
  signedInAt: number;
  expiresAt: number;
}

// Storage can be missing or blocked (private windows); the session then lasts for this page only
const read = (store: 'local' | 'session', key: string) => {
  try {
    return (store === 'local' ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
};
const write = (store: 'local' | 'session', key: string, value: string | null) => {
  try {
    const s = store === 'local' ? localStorage : sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* ignore */
  }
};

let memory: StoredSession | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const load = (): StoredSession | null => {
  const raw = read('local', SESSION_KEY) ?? read('session', SESSION_KEY);
  if (!raw) return memory;
  try {
    const s = JSON.parse(raw) as StoredSession;
    return s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
};

let current: StoredSession | null = load();
let snapshot: (Account & { signedInAt: number; expiresAt: number }) | null = null;
const refresh = () => {
  const a = current && ACCOUNTS.find((x) => x.email === current!.email);
  snapshot = a && current ? { ...a, signedInAt: current.signedInAt, expiresAt: current.expiresAt } : null;
};
refresh();

/** The signed-in account, or null on the sign-in screen. */
export const useSession = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot
  );

type Attempts = Record<string, { count: number; since: number }>;
const attempts = (): Attempts => {
  try {
    return JSON.parse(read('local', ATTEMPTS_KEY) ?? '{}') as Attempts;
  } catch {
    return {};
  }
};

export type SignInResult = { ok: true; account: Account } | { ok: false; error: string; mfaRequired?: boolean; locked?: boolean; attemptsLeft?: number };

/** Checks the credentials the way the real login does, then starts a session. */
export const signIn = (emailRaw: string, password: string, code: string, remember: boolean): SignInResult => {
  const email = emailRaw.trim().toLowerCase();
  const all = attempts();
  const mine = all[email];
  const windowOpen = mine && Date.now() - mine.since < LOCK_MINUTES * 60_000;
  if (windowOpen && mine.count >= MAX_ATTEMPTS) {
    const mins = Math.ceil((LOCK_MINUTES * 60_000 - (Date.now() - mine.since)) / 60_000);
    return { ok: false, locked: true, error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` };
  }
  const account = ACCOUNTS.find((a) => a.email === email);
  if (!account || password !== DEMO_PASSWORD) {
    const count = (windowOpen ? mine.count : 0) + 1;
    write('local', ATTEMPTS_KEY, JSON.stringify({ ...all, [email]: { count, since: windowOpen ? mine.since : Date.now() } }));
    const left = MAX_ATTEMPTS - count;
    return { ok: false, error: 'Email or password is incorrect', attemptsLeft: left };
  }
  if (account.mfa) {
    if (!code) return { ok: false, mfaRequired: true, error: 'Enter the 6-digit code from your authenticator app' };
    if (code.replace(/\s/g, '') !== DEMO_MFA_CODE) return { ok: false, mfaRequired: true, error: 'The authenticator code is incorrect' };
  }
  const { [email]: _cleared, ...rest } = all;
  write('local', ATTEMPTS_KEY, JSON.stringify(rest));
  current = { email, signedInAt: Date.now(), expiresAt: Date.now() + SESSION_HOURS * 3_600_000 };
  memory = current;
  write(remember ? 'local' : 'session', SESSION_KEY, JSON.stringify(current));
  write(remember ? 'session' : 'local', SESSION_KEY, null);
  refresh();
  emit();
  return { ok: true, account };
};

export const signOut = () => {
  current = null;
  memory = null;
  write('local', SESSION_KEY, null);
  write('session', SESSION_KEY, null);
  refresh();
  emit();
};
