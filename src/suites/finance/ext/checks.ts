import { attachmentsFor } from '../../../platform/attachments';
import { budgetLinesFor, holdReason, journalTotals, lineNet, round2 } from '../engine';
import type { FinanceState, FinDocument, Journal, LedgerEntry, Memo, Settlement } from '../types';

/** Field-level differences between two versions of a record, for the history and the audit trail. */
export const diffFields = (before: object, after: object) => {
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const show = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v));
  const out: { field: string; before: string; after: string }[] = [];
  for (const k of ['partyId', 'date', 'dueDate', 'reference', 'department', 'memo', 'amount', 'bankAccount', 'method', 'notes', 'name', 'pin', 'terms', 'creditLimit', 'email', 'phone', 'currency', 'fxRate', 'reasonCode']) {
    if (!(k in a) && !(k in b)) continue;
    if (show(b[k]) !== show(a[k])) out.push({ field: k, before: show(b[k]), after: show(a[k]) });
  }
  if (Array.isArray(a.lines) && Array.isArray(b.lines)) {
    const total = (lines: unknown[]) =>
      round2(
        (lines as { qty?: number; price?: number; debit?: number }[]).reduce((s, l) => s + (l.qty !== undefined ? lineNet(l as { qty: number; price: number }) : Number(l.debit) || 0), 0)
      );
    const tb = total(b.lines);
    const ta = total(a.lines);
    if (tb !== ta || b.lines.length !== a.lines.length) out.push({ field: 'lines', before: `${b.lines.length} lines · ${tb.toLocaleString()}`, after: `${a.lines.length} lines · ${ta.toLocaleString()}` });
  }
  return out;
};

/**
 * Budget availability for a bill: for every expense line, the year's budget for that account (all departments) less
 * what is already posted and what is waiting in approval, compared with this bill.
 */
export const budgetCheck = (state: FinanceState, entries: LedgerEntry[], doc: FinDocument) => {
  const year = Number(doc.date.slice(0, 4));
  const lines = budgetLinesFor(state, year);
  const out: { account: string; department: string; available: number; requested: number; message: string }[] = [];
  const byAccount = new Map<string, number>();
  for (const l of doc.lines) byAccount.set(l.account, round2((byAccount.get(l.account) ?? 0) + lineNet(l) * (doc.fxRate ?? 1)));
  for (const [account, requested] of byAccount) {
    const budget = lines.filter((b) => b.account === account);
    if (!budget.length) continue;
    const annual = round2(budget.reduce((s, b) => s + b.monthly.reduce((x, m) => x + m, 0), 0));
    const actual = round2(entries.filter((e) => e.account === account && e.date.startsWith(String(year)) && !e.closing).reduce((s, e) => s + e.debit - e.credit, 0));
    // Commitments: other bills for the account already approved but not posted
    const committed = round2(
      state.documents
        .filter((d) => d.kind === 'BILL' && d.id !== doc.id && d.status === 'APPROVED')
        .reduce((s, d) => s + d.lines.filter((l) => l.account === account).reduce((x, l) => x + lineNet(l), 0), 0)
    );
    const available = round2(annual - actual - committed);
    if (requested > available + 0.005)
      out.push({ account, department: budget[0].department, available, requested, message: `${requested.toLocaleString()} requested, ${Math.max(0, available).toLocaleString()} left of ${annual.toLocaleString()}` });
  }
  return out;
};

export const CHECK_LABEL: Record<string, string> = {
  MATCHED: 'Three-way match passed (or overridden by the Director)',
  PARTY_PIN: 'Customer or supplier has a KRA PIN',
  ATTACHMENT: 'Supporting document attached',
  REFERENCE: 'External reference filled in',
  COST_CENTER: 'Every line has a cost centre',
  NO_HOLD: 'No payment hold on the supplier or bills',
  MEMO: 'Narration filled in',
  BALANCED: 'Debits equal credits'
};

/** Items of the pre-posting checklist that the document fails. */
export const checklistFailures = (state: FinanceState, doc: FinDocument | Settlement | Journal | Memo) => {
  const type = 'source' in doc ? 'JOURNAL' : 'side' in doc ? null : doc.kind === 'BILL' ? 'BILL' : doc.kind === 'INVOICE' ? 'INVOICE' : doc.kind === 'PAYMENT' ? 'PAYMENT' : null;
  if (!type) return [];
  const items = state.settings.postingChecklist[type] ?? [];
  const failed: string[] = [];
  const party = 'partyId' in doc ? state.parties.find((p) => p.id === doc.partyId) : undefined;
  for (const item of items) {
    let ok = true;
    if (item === 'MATCHED' && 'kind' in doc && doc.kind === 'BILL') ok = !(doc as FinDocument).match || !!(doc as FinDocument).match!.matched || !!(doc as FinDocument).match!.override;
    if (item === 'PARTY_PIN') ok = !party || !!party.pin.trim();
    if (item === 'ATTACHMENT') ok = attachmentsFor(`finance:${doc.number}`).length > 0;
    if (item === 'REFERENCE') ok = !('reference' in doc) || !!(doc as FinDocument).reference.trim();
    if (item === 'COST_CENTER') ok = !('lines' in doc) || (doc.lines as { costCenter?: string; department?: string }[]).every((l) => !!l.costCenter || !!l.department);
    if (item === 'NO_HOLD') ok = !holdReason(state, doc as Settlement);
    if (item === 'MEMO') ok = !('memo' in doc) || !!(doc as Journal).memo.trim();
    if (item === 'BALANCED') ok = !('source' in doc) || journalTotals(doc as Journal).balanced;
    if (!ok) failed.push(CHECK_LABEL[item] ?? item);
  }
  return failed;
};

