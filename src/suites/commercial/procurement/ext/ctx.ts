import type { HistoryEntry, Party } from '../../../finance/types';
import type { useFinance } from '../../../finance/store';
import type { useOperations } from '../../../operations/store';
import type { useCommercial } from '../../store';
import type { ComActor, ComRole } from '../../types';
import type { ProcExtState } from './types';

export type Result = { ok: true; id?: string } | { ok: false; error: string };

/** What every procurement-extension action module gets from the provider. */
export interface Ctx {
  get: () => ProcExtState;
  commit: (next: ProcExtState) => void;
  fail: (error: string) => Result;
  done: (title: string, message: string, id?: string) => Result;
  warn: (title: string, message: string) => void;
  actor: ComActor;
  /** Reason the signed-in account may not change anything (viewer), or null */
  readOnly: () => string | null;
  com: ReturnType<typeof useCommercial>;
  fin: ReturnType<typeof useFinance>;
  ops: ReturnType<typeof useOperations>;
  log: (action: string, note?: string) => HistoryEntry;
  next: (s: ProcExtState, prefix: string) => { number: string; sequence: Record<string, number> };
  uid: (p: string) => string;
  now: () => string;
  party: (id: string) => Party | undefined;
  /** Notify the person acting in a commercial role (in-app + email) */
  notifyRole: (role: ComRole, subject: string, body?: string, ref?: string) => void;
  /** Notify a supplier at its email (and SMS where asked) */
  notifySupplier: (supplierId: string, subject: string, body?: string, ref?: string, sms?: boolean) => void;
}
