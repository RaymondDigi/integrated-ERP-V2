import type { MutableRefObject } from 'react';
import { notify } from '../../../platform/outbox';
import { audit } from '../../../platform/audit';
import { companyOf, journalTotals, postingBlock, round2, TODAY } from '../engine';
import type { Actor, FinanceState, HistoryEntry, Journal, JournalLine } from '../types';

export type Result = { ok: true; id?: string; number?: string } | { ok: false; error: string };

/** What every extension action module gets from the finance store. */
export interface Ctx {
  ref: MutableRefObject<FinanceState>;
  commit: (next: FinanceState) => void;
  fail: (error: string) => Result;
  done: (title: string, message: string, id?: string) => Result;
  info: (title: string, message: string) => void;
  /** Read-only accounts get a failure; everyone else null. */
  guard: () => Result | null;
  actor: () => Actor;
  now: () => string;
  uid: (prefix: string) => string;
  nextNumber: (s: FinanceState, prefix: string, date?: string) => { number: string; sequence: Record<string, number> };
}

export const FIN_MODULE = 'Finance';

/** Notification and audit trail for finance workflow events (simulated email + in-app). */
export const finNotify = (to: string, subject: string, ref?: string, body?: string, level: 'info' | 'warning' | 'critical' = 'info') =>
  notify({ module: FIN_MODULE, to, subject, ref, body, level });
export const finAudit = (by: string, action: string, ref?: string, note?: string) => audit({ module: FIN_MODULE, by, action, ref, note });

export const hist = (c: Ctx, action: string, note?: string, by?: string): HistoryEntry => ({ at: c.now(), by: by ?? c.actor().name, action, note: note || undefined });

export interface SystemJournalInput {
  date: string;
  memo: string;
  source: Journal['source'];
  lines: (Omit<JournalLine, 'id' | 'description' | 'debit' | 'credit'> & { description?: string; debit?: number; credit?: number })[];
  companyId?: string;
  /** POSTED (default) goes straight to the ledger; SUBMITTED and DRAFT go through approval. */
  status?: 'POSTED' | 'SUBMITTED' | 'DRAFT';
  by?: string;
  origin?: string;
  reasonCode?: string;
  autoReverseOn?: string;
  periodKey?: string;
  reversalOf?: string;
  templateId?: string;
  cash?: Journal['cash'];
}

/**
 * Builds a balanced journal and checks the period. Returns the new state pieces or an error message.
 * Every system posting (payroll, inventory, FX, treasury, year-end…) goes through here.
 */
export const buildJournal = (c: Ctx, s: FinanceState, input: SystemJournalInput): { error: string } | { journal: Journal; sequence: Record<string, number> } => {
  const lines = input.lines
    .map((l) => ({ ...l, id: c.uid('l'), description: l.description ?? '', debit: round2(Number(l.debit) || 0), credit: round2(Number(l.credit) || 0) }))
    .filter((l) => l.debit || l.credit || l.quantity);
  if (!lines.length) return { error: 'Nothing to post' };
  const unknown = lines.find((l) => !s.accounts.some((a) => a.code === l.account));
  if (unknown) return { error: `Account ${unknown.account} does not exist` };
  const money = lines.filter((l) => !s.accounts.find((a) => a.code === l.account)?.statistical);
  const t = journalTotals({ lines: money });
  if (money.length && !t.balanced) return { error: `Debits (${t.debit.toLocaleString()}) and credits (${t.credit.toLocaleString()}) must be equal` };
  const status = input.status ?? 'POSTED';
  const actor = c.actor();
  if (status === 'POSTED') {
    const block = postingBlock(s, input.date, { journal: true, role: actor.role, key: input.periodKey });
    if (block) return { error: block };
  }
  const by = input.by ?? actor.name;
  const { number, sequence } = c.nextNumber(s, 'JV', input.date);
  const journal: Journal = {
    id: c.uid('jv'),
    number,
    date: input.date,
    memo: input.memo,
    source: input.source,
    lines,
    status,
    preparedBy: by,
    approvals: status === 'POSTED' ? [{ by: actor.name, role: actor.role, at: c.now() }] : [],
    history: [
      { at: c.now(), by, action: status === 'POSTED' ? `Posted${input.origin ? ` from ${input.origin}` : ''}` : status === 'SUBMITTED' ? `Submitted from ${input.origin ?? 'another module'}` : 'Created' }
    ],
    companyId: input.companyId ?? s.activeCompany,
    origin: input.origin,
    reasonCode: input.reasonCode,
    autoReverseOn: input.autoReverseOn,
    periodKey: input.periodKey,
    reversalOf: input.reversalOf,
    templateId: input.templateId,
    cash: input.cash
  };
  return { journal, sequence };
};

/** Adds journals to the state (most recent first, like the rest of the list). */
export const withJournals = (s: FinanceState, journals: Journal[], sequence: Record<string, number>): FinanceState => ({ ...s, sequence, journals: [...journals, ...s.journals] });

export const inCompany = (s: FinanceState) => <T extends { companyId?: string }>(x: T) => companyOf(x) === s.activeCompany;
export const todayIso = () => TODAY;
