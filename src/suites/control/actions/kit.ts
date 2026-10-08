import type { HistoryEntry } from '../../finance/types';
import type { ControlState, CtlActor } from '../types';

export type Result = { ok: true; id?: string } | { ok: false; error: string };

/** What every group of control actions needs from the store. */
export interface ActionKit {
  get: () => ControlState;
  commit: (s: ControlState) => void;
  fail: (error: string) => Result;
  done: (title: string, message: string, id?: string) => Result;
  log: (action: string, note?: string) => HistoryEntry;
  next: (s: ControlState, prefix: string, width?: number) => { number: string; sequence: Record<string, number> };
  uid: (p: string) => string;
  now: () => string;
  actor: CtlActor;
  /** The signed-in person (used for workplace actions such as votes, bookings and survey answers) */
  me: string;
  /** The signed-in account may approve (admin or manager) */
  canApprove: boolean;
  /** Writes one event to the shared audit trail */
  trail: (module: string, action: string, ref?: string, extra?: { field?: string; before?: string; after?: string; note?: string }) => void;
}

export const isIctRole = (a: CtlActor) => a.role === 'ICT_OFFICER' || a.role === 'ICT_MANAGER';
