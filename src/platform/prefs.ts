import { useSyncExternalStore } from 'react';

/**
 * Per-user preferences kept in this browser: function-key shortcuts, decimal places, preferred label printer and
 * hidden table columns. Keyed by the signed-in email so people sharing a machine keep their own.
 */
export interface Shortcut {
  key: string;
  view: string;
  page?: string;
  label: string;
}
export interface Prefs {
  shortcuts: Shortcut[];
  decimals: { qty: number; cost: number; price: number; amount: number };
  printer: string;
  hiddenColumns: Record<string, string[]>;
}

export const DEFAULT_PREFS: Prefs = {
  shortcuts: [
    { key: 'F2', view: 'approvals', label: 'Approval inbox' },
    { key: 'F4', view: 'ict', label: 'ICT service desk' },
    { key: 'F8', view: 'executive', label: 'Business overview' }
  ],
  decimals: { qty: 0, cost: 2, price: 2, amount: 2 },
  printer: 'Zebra ZD421 — Stores',
  hiddenColumns: {}
};

let user = 'anonymous';
let cache: Prefs = DEFAULT_PREFS;
const listeners = new Set<() => void>();
const keyFor = (u: string) => `ieui.prefs.${u}`;

const load = (u: string): Prefs => {
  try {
    const raw = localStorage.getItem(keyFor(u));
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
};

export const setPrefsUser = (email: string | undefined) => {
  const u = email ?? 'anonymous';
  if (u === user) return;
  user = u;
  cache = load(u);
  listeners.forEach((l) => l());
};

export const prefs = () => cache;
export const savePrefs = (patch: Partial<Prefs>) => {
  cache = { ...cache, ...patch };
  try {
    localStorage.setItem(keyFor(user), JSON.stringify(cache));
  } catch {
    /* storage blocked: keep for this page only */
  }
  listeners.forEach((l) => l());
};

export const usePrefs = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cache
  );

/** Formats a number with the user's decimal places for that kind of value. */
export const fmtNum = (n: number, kind: keyof Prefs['decimals'] = 'amount') => {
  const d = cache.decimals[kind];
  return n.toLocaleString('en-KE', { minimumFractionDigits: d, maximumFractionDigits: d });
};
export const roundTo = (n: number, kind: keyof Prefs['decimals'] = 'amount') => {
  const f = 10 ** cache.decimals[kind];
  return Math.round(n * f) / f;
};

export const FUNCTION_KEYS = ['F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10'];
