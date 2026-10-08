import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAccess } from '../../platform/access';
import { ACTORS, buildSeed } from './data';
import {
  autoMatches,
  CONTROL,
  depreciationFor,
  docBalance,
  docTotals,
  isPeriodClosed,
  journalTotals,
  ledger,
  nextStatus,
  periodLabel,
  periodOf,
  permissions,
  postingBlock,
  reconciliation,
  round2,
  scope,
  TODAY,
  localStamp
} from './engine';
import type {
  Allocation,
  DocLine,
  FinDocument,
  FinanceState,
  FinRole,
  FixedAsset,
  HistoryEntry,
  Journal,
  JournalLine,
  LedgerEntry,
  Memo,
  Party,
  Settlement
} from './types';
import { finAudit, finNotify, type Ctx, type Result } from './ext/ctx';
import { budgetCheck, checklistFailures, diffFields } from './ext/checks';
import { glActions } from './ext/gl';
import { subledgerActions } from './ext/subledger';
import { planningActions } from './ext/planning';

export type FinancePage =
  | 'overview'
  | 'invoices'
  | 'receipts'
  | 'customers'
  | 'bills'
  | 'payments'
  | 'suppliers'
  | 'journals'
  | 'accounts'
  | 'bank'
  | 'budgets'
  | 'assets'
  | 'close'
  | 'reports'
  | 'memos'
  | 'collections'
  | 'paymentRuns'
  | 'recurring'
  | 'cashbook'
  | 'treasury'
  | 'forecast'
  | 'costing'
  | 'inventory'
  | 'tax'
  | 'group'
  | 'staff'
  | 'analysis'
  | 'writer'
  | 'setup';

export type Collection = 'documents' | 'settlements' | 'journals' | 'memos';
export type Transition = 'submit' | 'approve' | 'reject' | 'post' | 'void';

export interface DocumentDraft {
  id?: string;
  kind: FinDocument['kind'];
  partyId: string;
  date: string;
  dueDate: string;
  reference: string;
  department: string;
  lines: DocLine[];
  notes: string;
  match?: FinDocument['match'];
  currency?: string;
  fxRate?: number;
  billToId?: string;
  shipToId?: string;
  batchId?: string;
  memoType?: FinDocument['memoType'];
  relatesTo?: string;
  recurringId?: string;
  salesRep?: string;
  poNumber?: string;
  returnRef?: string;
}
export interface SettlementDraft {
  id?: string;
  kind: Settlement['kind'];
  partyId: string;
  date: string;
  bankAccount: string;
  method: Settlement['method'];
  reference: string;
  amount: number;
  allocations: Allocation[];
  notes: string;
  currency?: string;
  fxRate?: number;
  wht?: Settlement['wht'];
  purpose?: Settlement['purpose'];
  poNumber?: string;
  poValue?: number;
  chequeNo?: string;
  runId?: string;
}
export interface JournalDraft {
  id?: string;
  date: string;
  memo: string;
  lines: JournalLine[];
  reasonCode?: string;
  autoReverseOn?: string;
  periodKey?: string;
}

/** Customer, supplier and VAT control accounts plus anything flagged as a control account in the chart. */
const controlAccounts = (s: FinanceState) => new Set([CONTROL.AR, CONTROL.AP, CONTROL.VAT_IN, CONTROL.VAT_OUT, ...s.accounts.filter((a) => a.control).map((a) => a.code)]);
export const CHECKLIST = [
  { key: 'unposted', label: 'Every approved document is posted', auto: true },
  { key: 'bank', label: 'Bank statements reconciled', auto: true },
  { key: 'depreciation', label: 'Depreciation run for the month', auto: true },
  { key: 'ar', label: 'Receivables ageing reviewed and followed up', auto: false },
  { key: 'ap', label: 'Supplier statements agreed', auto: false },
  { key: 'accruals', label: 'Accruals and prepayments booked', auto: false }
] as const;

export const READ_ONLY = 'This is a read-only account — ask an administrator for write access';

const FinanceContext = createContext<ReturnType<typeof useFinanceStore> | null>(null);

const useFinanceStore = () => {
  const { addToast } = useApp();
  const access = useAccess();
  const accessRef = useRef(access);
  accessRef.current = access;
  const [state, setState] = useState<FinanceState>(buildSeed);
  const [page, setPageState] = useState<FinancePage>('overview');
  const [focus, setFocus] = useState<string | null>(null);
  const ref = useRef(state);
  ref.current = state;

  // Pages see the active company's books; actions work on the whole group's state
  const view = useMemo(() => scope(state), [state]);
  const entries: LedgerEntry[] = useMemo(() => ledger(view), [view]);
  const actor = state.actor;

  const commit = (next: FinanceState) => {
    ref.current = next;
    setState(next);
  };
  const fail = (error: string): Result => {
    addToast({ type: 'error', title: 'Not allowed', message: error });
    return { ok: false, error };
  };
  const done = (title: string, message: string, id?: string): Result => {
    addToast({ type: 'success', title, message });
    return { ok: true, id };
  };
  /** The signed-in Viewer role is read only in Finance, whatever persona is selected. */
  const guard = (): Result | null => (accessRef.current.canWrite ? null : fail(READ_ONLY));
  const now = () => localStamp();
  const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  /** Numbers follow the document's own year (a December invoice keyed in January keeps last year's series). */
  const nextNumber = (s: FinanceState, prefix: string, date = TODAY) => {
    const year = date.slice(0, 4);
    const key = year === TODAY.slice(0, 4) ? prefix : `${prefix}:${year}`;
    const n = (s.sequence[key] ?? 0) + 1;
    return { number: `${prefix}-${year}-${String(n).padStart(4, '0')}`, sequence: { ...s.sequence, [key]: n } };
  };

  const setPage = useCallback((p: FinancePage, focusId: string | null = null) => {
    setPageState(p);
    setFocus(focusId);
  }, []);

  const setActor = (role: FinRole) => {
    commit({ ...ref.current, actor: ACTORS[role] });
    addToast({ type: 'info', title: `Acting as ${ACTORS[role].title}`, message: `${ACTORS[role].name} — approvals and posting follow this role.` });
  };

  const ctx: Ctx = {
    ref,
    commit,
    fail,
    done,
    info: (title, message) => addToast({ type: 'info', title, message }),
    guard,
    actor: () => ref.current.actor,
    now,
    uid,
    nextNumber
  };

  /* ---------------- Documents (invoices and bills) ---------------- */
  /** `by` lets other modules (Trading, Procurement) create documents in their user's name. */
  const saveDocument = (d: DocumentDraft, by?: string): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!d.partyId) return fail(`Choose a ${d.kind === 'INVOICE' ? 'customer' : 'supplier'}`);
    const lines = d.lines.filter((l) => l.description.trim() || l.price);
    if (!lines.length) return fail('Add at least one line');
    if (lines.some((l) => !l.account || l.qty <= 0 || l.price <= 0)) return fail('Every line needs an account, a quantity and a price above zero');
    const inactive = lines.find((l) => s.accounts.find((a) => a.code === l.account)?.active === false);
    if (inactive) return fail(`Account ${inactive.account} is inactive`);
    if (d.dueDate < d.date) return fail('The due date cannot be before the document date');
    if (d.currency && d.currency !== 'KES' && !(Number(d.fxRate) > 0)) return fail('Enter the exchange rate for the foreign currency');
    // Duplicate supplier invoices: same supplier and invoice number, or same supplier, date and amount
    if (d.kind === 'BILL') {
      const total = docTotals({ lines }).total;
      const dup = s.documents.find(
        (x) =>
          x.kind === 'BILL' &&
          x.id !== d.id &&
          x.status !== 'VOID' &&
          x.partyId === d.partyId &&
          ((!!d.reference.trim() && x.reference.trim().toLowerCase() === d.reference.trim().toLowerCase()) || (x.date === d.date && Math.abs(docTotals(x).total - total) < 0.005))
      );
      if (dup) return fail(`Possible duplicate of ${dup.number} (same supplier and ${dup.reference.trim().toLowerCase() === d.reference.trim().toLowerCase() ? `invoice number ${dup.reference}` : 'date and amount'})`);
    }
    // Manual bills cannot declare their own three-way match: only a check against the order and receipt can
    const match = d.match && !by && d.match.matched && !d.match.note ? { ...d.match, matched: false } : d.match;
    if (d.id) {
      const existing = s.documents.find((x) => x.id === d.id)!;
      if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') return fail('Only drafts can be edited');
      const changes = diffFields(existing, { ...d, lines });
      commit({
        ...s,
        documents: s.documents.map((x) =>
          x.id === d.id ? { ...x, ...d, match, lines, status: 'DRAFT', history: [...x.history, { at: now(), by: actor.name, action: 'Edited', changes }] } : x
        )
      });
      finAudit(actor.name, 'Edited', existing.number, changes.map((c) => `${c.field}: ${c.before} → ${c.after}`).join('; '));
      return done('Draft saved', existing.number, d.id);
    }
    const prefix = d.memoType === 'DEBIT_NOTE' ? 'DN' : d.memoType === 'FINANCE_CHARGE' ? 'FC' : d.memoType === 'CHARGEBACK' ? 'CB' : d.kind === 'INVOICE' ? 'INV' : 'BILL';
    const { number, sequence } = nextNumber(s, prefix, d.date);
    const doc: FinDocument = {
      ...d,
      match,
      lines,
      id: uid(d.kind === 'INVOICE' ? 'inv' : 'bill'),
      number,
      status: 'DRAFT',
      preparedBy: by ?? actor.name,
      approvals: [],
      history: [{ at: now(), by: by ?? actor.name, action: by ? 'Created from an order' : 'Created' }],
      companyId: s.activeCompany
    };
    commit({ ...s, documents: [doc, ...s.documents], sequence });
    return done(`${d.kind === 'INVOICE' ? 'Invoice' : 'Bill'} created`, `${number} saved as a draft`, doc.id);
  };

  /* ---------------- Receipts and payments ---------------- */
  const saveSettlement = (d: SettlementDraft): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!d.partyId) return fail(`Choose a ${d.kind === 'RECEIPT' ? 'customer' : 'supplier'}`);
    if (!(d.amount > 0)) return fail('Enter an amount above zero');
    const allocations = d.allocations.filter((a) => a.amount > 0);
    const wht = d.wht && d.wht.amount > 0 ? d.wht : undefined;
    const allocated = round2(allocations.reduce((x, a) => x + a.amount, 0));
    if (allocated - d.amount - (wht?.amount ?? 0) > 0.005) return fail('You have allocated more than the amount received');
    const party = s.parties.find((p) => p.id === d.partyId);
    if (d.kind === 'PAYMENT' && party?.paymentHold && allocations.length) return fail(`${party.name} is on payment hold: ${party.paymentHold.reason}`);
    const cur = d.currency || 'KES';
    for (const a of allocations) {
      const doc = s.documents.find((x) => x.id === a.docId);
      if (!doc) continue;
      if (a.amount + (a.discount ?? 0) - docBalance(s, doc) > 0.005) return fail(`${doc.number} only has ${docBalance(s, doc).toLocaleString()} outstanding`);
      if ((doc.currency || 'KES') !== cur) return fail(`${doc.number} is in ${doc.currency || 'KES'} — receive or pay it in the same currency`);
      if (d.kind === 'PAYMENT' && doc.hold) return fail(`${doc.number} is on hold: ${doc.hold.reason}`);
      const batch = doc.batchId ? s.invoiceBatches.find((b) => b.id === doc.batchId) : undefined;
      if (d.kind === 'PAYMENT' && batch?.hold) return fail(`${doc.number} is in batch ${batch.number}, which is on hold`);
      if (a.discount) {
        const terms = doc.earlyDiscount ?? party?.earlyDiscount;
        if (!terms) return fail(`${doc.number} has no early-payment discount terms`);
        if (d.date > addDaysLocal(doc.date, terms.days)) return fail(`The ${terms.pct}% discount on ${doc.number} expired after ${terms.days} days`);
        if (a.discount - round2(docTotals(doc).net * (terms.pct / 100)) > 0.01) return fail(`The discount on ${doc.number} cannot exceed ${terms.pct}% of the net amount`);
      }
    }
    if (d.purpose === 'DOWNPAYMENT') {
      if (!d.poNumber) return fail('Down payments must quote the purchase order');
      if (!(Number(d.poValue) > 0)) return fail('Enter the order value the down payment is measured against');
      const limit = round2((Number(d.poValue) * s.settings.downPaymentLimitPct) / 100);
      if (d.amount > limit) return fail(`Down payments are limited to ${s.settings.downPaymentLimitPct}% of the order (${limit.toLocaleString()})`);
    }
    if (d.purpose === 'PREPAYMENT' && !d.poNumber) return fail('Quote the purchase order or invoice the prepayment is for');
    if (d.method === 'CHEQUE' && d.kind === 'PAYMENT' && d.chequeNo && s.settlements.some((x) => x.id !== d.id && x.chequeNo === d.chequeNo && x.bankAccount === d.bankAccount))
      return fail(`Cheque ${d.chequeNo} has already been used on this account`);
    const clean = { ...d, allocations, wht, currency: cur === 'KES' ? undefined : cur, fxRate: cur === 'KES' ? undefined : d.fxRate };
    if (d.id) {
      const existing = s.settlements.find((x) => x.id === d.id)!;
      if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') return fail('Only drafts can be edited');
      const changes = diffFields(existing, clean);
      commit({
        ...s,
        settlements: s.settlements.map((x) =>
          x.id === d.id ? { ...x, ...clean, status: 'DRAFT', history: [...x.history, { at: now(), by: actor.name, action: 'Edited', changes }] } : x
        )
      });
      return done('Draft saved', existing.number, d.id);
    }
    const { number, sequence } = nextNumber(s, d.kind === 'RECEIPT' ? 'RCT' : 'PAY', d.date);
    const rec: Settlement = {
      ...clean,
      id: uid(d.kind === 'RECEIPT' ? 'rct' : 'pay'),
      number,
      status: 'DRAFT',
      preparedBy: actor.name,
      approvals: [],
      history: [{ at: now(), by: actor.name, action: 'Created' }],
      companyId: s.activeCompany
    };
    commit({ ...s, settlements: [rec, ...s.settlements], sequence });
    return done(d.kind === 'RECEIPT' ? 'Receipt recorded' : 'Payment prepared', `${number} saved as a draft`, rec.id);
  };

  /* ---------------- Journals ---------------- */
  const saveJournal = (d: JournalDraft): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const stat = (code: string) => !!s.accounts.find((a) => a.code === code)?.statistical;
    const lines = d.lines.filter((l) => l.account && (Number(l.debit) || Number(l.credit) || (stat(l.account) && Number(l.quantity))));
    if (lines.length < 2 && !lines.every((l) => stat(l.account))) return fail('A journal needs at least two lines');
    if (!lines.length) return fail('A journal needs at least two lines');
    if (lines.some((l) => Number(l.debit) && Number(l.credit))) return fail('A line can have a debit or a credit, not both');
    const blocked = lines.find((l) => controlAccounts(s).has(l.account));
    if (blocked) return fail(`${blocked.account} is a control account — post it through invoices, bills, receipts, payments or the asset register`);
    const closedAcc = lines.find((l) => {
      const a = s.accounts.find((x) => x.code === l.account);
      return a?.active === false || a?.postingAllowed === false;
    });
    if (closedAcc) return fail(`${closedAcc.account} is inactive or a header account and cannot be posted to`);
    const money = lines.filter((l) => !stat(l.account));
    const t = journalTotals({ lines: money });
    if (money.length && !t.balanced) return fail(`Debits (${t.debit.toLocaleString()}) and credits (${t.credit.toLocaleString()}) must be equal`);
    if (!d.memo.trim()) return fail('Describe what the journal is for');
    if (d.periodKey && !s.periods.find((p) => p.key === d.periodKey)?.special) return fail('Choose an adjustment period');
    if (d.autoReverseOn && d.autoReverseOn <= d.date) return fail('The automatic reversal date must be after the journal date');
    const clean = lines.map((l) => ({ ...l, debit: round2(Number(l.debit) || 0), credit: round2(Number(l.credit) || 0) }));
    if (d.id) {
      const existing = s.journals.find((x) => x.id === d.id)!;
      if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') return fail('Only drafts can be edited');
      const changes = diffFields(existing, { ...d, lines: clean });
      commit({
        ...s,
        journals: s.journals.map((x) =>
          x.id === d.id ? { ...x, ...d, lines: clean, status: 'DRAFT', history: [...x.history, { at: now(), by: actor.name, action: 'Edited', changes }] } : x
        )
      });
      finAudit(actor.name, 'Edited journal', existing.number, changes.map((c) => `${c.field}: ${c.before} → ${c.after}`).join('; '));
      return done('Draft saved', existing.number, d.id);
    }
    const { number, sequence } = nextNumber(s, 'JV', d.date);
    const j: Journal = {
      ...d,
      lines: clean,
      id: uid('jv'),
      number,
      source: 'MANUAL',
      status: 'DRAFT',
      preparedBy: actor.name,
      approvals: [],
      history: [{ at: now(), by: actor.name, action: 'Created' }],
      companyId: s.activeCompany
    };
    commit({ ...s, journals: [j, ...s.journals], sequence });
    return done('Journal created', `${number} saved as a draft`, j.id);
  };

  /* ---------------- Workflow ---------------- */
  const transition = (collection: Collection, id: string, action: Transition, note = ''): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const list = s[collection] as (FinDocument | Settlement | Journal | Memo)[];
    const doc = list.find((x) => x.id === id);
    if (!doc) return fail('Document not found');
    const p = permissions(s, doc, actor);
    const update = (patch: Partial<Pick<FinDocument, 'status' | 'approvals' | 'netMethod' | 'earlyDiscount'>> & { allocations?: Allocation[] }, label: string, extra: Partial<HistoryEntry> = {}) => {
      const next = list.map((x) =>
        x.id === id ? { ...x, ...patch, history: [...x.history, { at: now(), by: actor.name, action: label, note: note || undefined, ...extra }] } : x
      );
      commit({ ...ref.current, [collection]: next });
      finAudit(actor.name, label, doc.number, note || undefined);
    };
    switch (action) {
      case 'submit': {
        if (!p.submit) return fail('Only drafts can be submitted');
        if ('lines' in doc && 'kind' in doc && doc.kind === 'BILL' && doc.match && !doc.match.matched)
          addToast({ type: 'warning', title: 'Goods not yet received', message: `${doc.number}: the goods-received note is not matched — the approver will see this.` });
        update({ status: 'SUBMITTED', approvals: [] }, 'Submitted for approval');
        finNotify('Finance Manager', `${doc.number} is waiting for your approval`, doc.number, `Submitted by ${actor.name}`);
        return done('Submitted', `${doc.number} is waiting for approval`);
      }
      case 'approve': {
        if (!p.approve) return fail(p.reason || 'You cannot approve this document');
        // Budget availability: costs above what is left in the budget stop at approval (the Director can override)
        if ('kind' in doc && doc.kind === 'BILL') {
          const over = budgetCheck(scope(s, s.activeCompany), ledger(scope(s, s.activeCompany)), doc);
          if (over.length) {
            const msg = over.map((o) => `${o.account} ${o.department}: ${o.message}`).join('; ');
            if (s.settings.budgetBlock && actor.role !== 'DIRECTOR') return fail(`Over budget — ${msg}. The Finance Director must approve or a supplementary budget is needed.`);
            addToast({ type: 'warning', title: 'Over budget', message: msg });
          }
        }
        const status = nextStatus(doc, actor.role, s);
        update(
          { status, approvals: [...doc.approvals, { by: actor.name, role: actor.role, at: now() }] },
          actor.role === 'DIRECTOR' && doc.approvals.length ? 'Approved (director)' : 'Approved'
        );
        finNotify(status === 'APPROVED' ? doc.preparedBy : 'Finance Director', status === 'APPROVED' ? `${doc.number} was approved` : `${doc.number} needs your second approval`, doc.number);
        return done('Approved', status === 'APPROVED' ? `${doc.number} is ready to post` : `${doc.number} now needs the Finance Director`);
      }
      case 'reject': {
        if (!p.reject) return fail(p.reason || 'You cannot reject this document');
        if (!note.trim()) return fail('Give a reason so the preparer knows what to fix');
        update({ status: 'REJECTED', approvals: [] }, 'Rejected');
        finNotify(doc.preparedBy, `${doc.number} was returned: ${note}`, doc.number, undefined, 'warning');
        return done('Returned to preparer', `${doc.number} was rejected`);
      }
      case 'post': {
        if (!p.post) return fail(p.reason || 'You cannot post this document');
        if ('allocations' in doc) {
          for (const a of doc.allocations) {
            const target = s.documents.find((x) => x.id === a.docId);
            if (target && a.amount + (a.discount ?? 0) - docBalance(s, target) > 0.005) return fail(`${target.number} has already been settled by another document`);
          }
        }
        const missing = checklistFailures(s, doc);
        if (missing.length) return fail(`Pre-posting checklist: ${missing.join('; ')}`);
        const patch: Parameters<typeof update>[0] = { status: 'POSTED' };
        // Net method: bills from suppliers with early-payment terms are booked net of the discount
        if ('kind' in doc && doc.kind === 'BILL') {
          const terms = s.parties.find((x) => x.id === doc.partyId)?.earlyDiscount;
          if (terms) Object.assign(patch, { earlyDiscount: terms, netMethod: s.settings.discountMethod === 'NET' });
        }
        // Credit notes apply themselves to the invoice they correct, then the oldest open items
        if ('side' in doc && !doc.allocations.length) Object.assign(patch, { allocations: autoAllocate(s, doc) });
        update(patch, 'Posted to ledger');
        finNotify(doc.preparedBy, `${doc.number} was posted to the ledger`, doc.number);
        return done('Posted', `${doc.number} is now in the general ledger`);
      }
      case 'void': {
        if (!p.void) return fail(doc.status === 'POSTED' ? 'Posted documents cannot be voided — reverse them or raise a credit note' : doc.status === 'SUBMITTED' ? 'Reject it first — documents in approval cannot be voided' : 'Only the preparer or a Finance Manager can void this document');
        update({ status: 'VOID' }, 'Voided');
        return done('Voided', `${doc.number} was cancelled`);
      }
    }
  };

  const reverseJournal = (id: string, date: string): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const j = s.journals.find((x) => x.id === id);
    if (!j || j.status !== 'POSTED') return fail('Only posted journals can be reversed');
    if (j.reversedBy) return fail('This journal has already been reversed');
    if (j.source === 'REVERSAL' || j.reversalOf) return fail('This is a reversal — post a new journal instead of reversing it again');
    if (actor.role === 'ACCOUNTANT') return fail('Reversals are done by a Finance Manager or Director');
    const block = postingBlock(s, date, { journal: true, role: actor.role });
    if (block) return fail(block);
    if (date < j.date) return fail('The reversal cannot be dated before the journal it reverses');
    // Keep the asset register in step with its journals
    const run = j.source === 'DEPRECIATION' ? s.depreciationRuns.find((r) => r.journalId === j.id) : undefined;
    if (run && s.depreciationRuns.some((r) => r.period > run.period)) return fail('Reverse the later depreciation runs first');
    const asset = j.source === 'ASSET' ? s.assets.find((a) => a.capitalJournalId === j.id) : undefined;
    if (asset && s.depreciationRuns.some((r) => r.perAsset[asset.id])) return fail(`${asset.number} has been depreciated — reverse its depreciation first`);
    const { number, sequence } = nextNumber(s, 'JV', date);
    const rev: Journal = {
      id: uid('jv'),
      number,
      date,
      memo: `Reversal of ${j.number} — ${j.memo}`,
      source: 'REVERSAL',
      reversalOf: j.id,
      lines: j.lines.map((l) => ({ ...l, id: uid('l'), debit: l.credit, credit: l.debit, quantity: l.quantity ? -l.quantity : undefined, fxAmount: l.fxAmount ? -l.fxAmount : undefined })),
      status: 'POSTED',
      preparedBy: actor.name,
      approvals: [{ by: actor.name, role: actor.role, at: now() }],
      history: [{ at: now(), by: actor.name, action: `Reversal of ${j.number} posted` }],
      companyId: j.companyId
    };
    commit({
      ...s,
      sequence,
      depreciationRuns: run ? s.depreciationRuns.filter((r) => r !== run) : s.depreciationRuns,
      assets: asset ? s.assets.map((a) => (a.id === asset.id ? { ...a, status: 'REVERSED', history: [...(a.history ?? []), { at: now(), by: actor.name, action: `Capitalisation reversed by ${number}` }] } : a)) : s.assets,
      journals: [
        rev,
        ...s.journals.map((x) =>
          x.id === id ? { ...x, reversedBy: rev.id, followOn: [...(x.followOn ?? []), { kind: 'Reversal', id: rev.id, number }], history: [...x.history, { at: now(), by: actor.name, action: `Reversed by ${number}` }] } : x
        )
      ]
    });
    finAudit(actor.name, 'Reversed journal', j.number, number);
    return done('Journal reversed', `${number} cancels ${j.number}${run ? ' and removes the depreciation run' : asset ? ` and reverses ${asset.number}` : ''}`, rev.id);
  };

  /* ---------------- Bank ---------------- */
  const matchBank = (lineId: string, entryId: string | undefined) => {
    if (guard()) return;
    const s = ref.current;
    commit({ ...s, bankLines: s.bankLines.map((l) => (l.id === lineId ? { ...l, matchedTo: entryId } : l)) });
  };
  const autoMatch = (account: string) => {
    if (guard()) return;
    const s = ref.current;
    const v = scope(s);
    const pairs = autoMatches(v, ledger(v), account);
    if (!pairs.length) {
      addToast({ type: 'info', title: 'Nothing to match', message: 'No statement lines have a ledger entry with the same amount within five days.' });
      return;
    }
    const map = new Map(pairs.map((p) => [p.lineId, p.entryId]));
    commit({ ...s, bankLines: s.bankLines.map((l) => (map.has(l.id) ? { ...l, matchedTo: map.get(l.id) } : l)) });
    addToast({ type: 'success', title: 'Auto-match complete', message: `${pairs.length} statement line${pairs.length === 1 ? '' : 's'} matched to the ledger` });
  };
  /** Books a statement-only item (charges, interest, standing orders) and matches it. */
  const bankEntry = (lineId: string, account: string, memo: string): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const line = s.bankLines.find((l) => l.id === lineId);
    if (!line) return fail('Statement line not found');
    if (actor.role === 'ACCOUNTANT' && Math.abs(line.amount) > 50_000) return fail('Bank entries above KES 50,000 need a Finance Manager');
    if (controlAccounts(s).has(account)) return fail('Choose an expense, income or balance sheet account — not a control account');
    if (isPeriodClosed(s, line.date)) return fail('That period is closed');
    const { number, sequence } = nextNumber(s, 'JV', line.date);
    const amt = Math.abs(line.amount);
    const id = uid('jv');
    const lines: JournalLine[] =
      line.amount < 0
        ? [
            { id: uid('l'), account, description: memo, debit: amt, credit: 0 },
            { id: uid('l'), account: line.bankAccount, description: line.description, debit: 0, credit: amt }
          ]
        : [
            { id: uid('l'), account: line.bankAccount, description: line.description, debit: amt, credit: 0 },
            { id: uid('l'), account, description: memo, debit: 0, credit: amt }
          ];
    const j: Journal = {
      id,
      number,
      date: line.date,
      memo: memo || line.description,
      source: 'BANK',
      lines,
      status: 'POSTED',
      preparedBy: actor.name,
      approvals: [{ by: actor.name, role: actor.role, at: now() }],
      history: [{ at: now(), by: actor.name, action: 'Posted from bank reconciliation' }],
      companyId: s.activeCompany
    };
    const bankIdx = line.amount < 0 ? 1 : 0;
    commit({ ...s, sequence, journals: [j, ...s.journals], bankLines: s.bankLines.map((l) => (l.id === lineId ? { ...l, matchedTo: `${id}:${bankIdx}` } : l)) });
    return done('Entry posted and matched', `${number} — ${memo || line.description}`);
  };

  /* ---------------- Fixed assets ---------------- */
  const addAsset = (a: Omit<FixedAsset, 'id' | 'number' | 'status' | 'openingDepreciation'>, funding: string): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!a.name.trim()) return fail('Name the asset');
    if (!(a.cost > 0) || !(a.lifeMonths > 0)) return fail('Enter the cost and useful life');
    if (a.residual >= a.cost) return fail('Residual value must be below cost');
    if (actor.role === 'ACCOUNTANT') return fail('Capitalising assets needs a Finance Manager or Director');
    const block = postingBlock(s, a.acquired, { journal: true, role: actor.role });
    if (block) return fail(`The acquisition date: ${block}`);
    const n = s.assets.length + 1;
    const { number, sequence } = nextNumber(s, 'JV', a.acquired);
    const jid = uid('jv');
    const asset: FixedAsset = {
      ...a,
      id: uid('fa'),
      number: `FA-${String(n).padStart(4, '0')}`,
      status: 'ACTIVE',
      openingDepreciation: 0,
      companyId: s.activeCompany,
      capitalJournalId: jid,
      history: [{ at: now(), by: actor.name, action: `Capitalised by ${number}` }]
    };
    const j: Journal = {
      id: jid,
      number,
      date: a.acquired,
      memo: `Capitalise ${asset.number} — ${a.name}`,
      source: 'ASSET',
      lines: [
        { id: uid('l'), account: a.costAccount, description: a.name, debit: a.cost, credit: 0, costCenter: a.costCenter },
        { id: uid('l'), account: funding, description: 'Funding', debit: 0, credit: a.cost }
      ],
      status: 'POSTED',
      preparedBy: actor.name,
      approvals: [{ by: actor.name, role: actor.role, at: now() }],
      history: [{ at: now(), by: actor.name, action: 'Asset capitalised' }],
      companyId: s.activeCompany
    };
    commit({ ...s, sequence, assets: [...s.assets, asset], journals: [j, ...s.journals] });
    return done('Asset added', `${asset.number} capitalised by ${number}`);
  };

  const runDepreciation = (period: string): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (actor.role === 'ACCOUNTANT') return fail('Depreciation runs are posted by a Finance Manager or Director');
    const v = scope(s);
    if (s.depreciationRuns.some((r) => r.period === period && Object.keys(r.perAsset).some((id) => v.assets.some((a) => a.id === id))))
      return fail(`Depreciation for ${periodLabel(period, true)} has already been run`);
    const [y, m] = period.split('-').map(Number);
    const date = new Date(y, m, 0);
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const block = postingBlock(s, iso, { journal: true, role: actor.role });
    if (block) return fail(block);
    const { perAsset, total } = depreciationFor(v, period);
    if (!total) return fail('Nothing to depreciate');
    const { number, sequence } = nextNumber(s, 'JV', iso);
    const id = uid('jv');
    const j: Journal = {
      id,
      number,
      date: iso,
      memo: `Depreciation — ${periodLabel(period, true)}`,
      source: 'DEPRECIATION',
      lines: [
        { id: uid('l'), account: CONTROL.DEP_EXP, description: 'Depreciation charge', debit: total, credit: 0 },
        { id: uid('l'), account: CONTROL.ACC_DEP, description: 'Accumulated depreciation', debit: 0, credit: total }
      ],
      status: 'POSTED',
      preparedBy: actor.name,
      approvals: [{ by: actor.name, role: actor.role, at: now() }],
      history: [{ at: now(), by: actor.name, action: 'Depreciation run posted' }],
      companyId: s.activeCompany
    };
    commit({
      ...s,
      sequence,
      journals: [j, ...s.journals],
      depreciationRuns: [...s.depreciationRuns, { period, journalId: id, amount: total, perAsset, at: now(), by: actor.name }]
    });
    return done('Depreciation posted', `${number}: KES ${total.toLocaleString()} for ${periodLabel(period, true)}`);
  };

  /* ---------------- Budgets ---------------- */
  const setBudget = (account: string, monthly: number[], year?: number): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (actor.role === 'ACCOUNTANT') return fail('Budgets are changed by the Finance Manager or Director');
    if (monthly.some((m) => !(m >= 0))) return fail('Budget amounts cannot be negative');
    const y = year ?? s.budgetYear;
    const line = s.budgets.find((b) => b.account === account && (b.year ?? s.budgetYear) === y);
    if (line?.status === 'APPROVED' && actor.role !== 'DIRECTOR') return fail('This budget is approved — raise a supplementary budget or reallocation instead');
    commit({ ...s, budgets: s.budgets.map((b) => (b === line ? { ...b, monthly } : b)) });
    finAudit(actor.name, 'Budget changed', `${account} ${y}`, `Annual ${monthly.reduce((x, m) => x + m, 0).toLocaleString()}`);
    return done('Budget saved', `${account} · ${y}`);
  };

  /* ---------------- Period close ---------------- */
  const autoChecks = (s: FinanceState, key: string) => {
    const p = s.periods.find((x) => x.key === key);
    const inPeriod = (date: string) => (p?.from && p.to ? date >= p.from && date <= p.to : periodOf(date) === key);
    const v = scope(s);
    const open = [...v.documents, ...v.settlements, ...v.journals].filter((d) => inPeriod(d.date) && (d.status === 'APPROVED' || d.status === 'SUBMITTED'));
    const unmatched = v.bankLines.filter((l) => inPeriod(l.date) && !l.matchedTo);
    const depreciated = s.depreciationRuns.some((r) => r.period === key) || !!p?.special;
    return { unposted: open.length === 0, bank: unmatched.length === 0, depreciation: depreciated, openCount: open.length, unmatchedCount: unmatched.length };
  };
  const toggleCheck = (key: string, item: string) => {
    if (guard()) return;
    const s = ref.current;
    commit({ ...s, periods: s.periods.map((p) => (p.key === key ? { ...p, checklist: { ...p.checklist, [item]: !p.checklist[item] } } : p)) });
  };
  const closePeriod = (key: string, level: 'HARD' | 'SOFT' = 'HARD'): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (actor.role === 'ACCOUNTANT') return fail('Closing a period needs a Finance Manager or Director');
    const p = s.periods.find((x) => x.key === key)!;
    if (p.status === 'CLOSED') return fail('This period is already closed');
    const earlierOpen = s.periods.find((x) => x.key < key && x.status === 'OPEN' && (x.fiscalYear ?? '') <= (p.fiscalYear ?? 'ZZ'));
    if (earlierOpen && level === 'HARD') return fail(`Close ${earlierOpen.label ?? periodLabel(earlierOpen.key, true)} first`);
    if (level === 'HARD') {
      const a = autoChecks(s, key);
      const missing = p.special ? [] : CHECKLIST.filter((c) => !(c.auto ? a[c.key as 'unposted' | 'bank' | 'depreciation'] : p.checklist[c.key]));
      if (missing.length) return fail(`Still to do: ${missing.map((m) => m.label.toLowerCase()).join('; ')}`);
    }
    const status = level === 'HARD' ? 'CLOSED' : 'SOFT';
    const label = level === 'HARD' ? 'Period closed' : 'Soft close — sub-ledgers locked';
    commit({
      ...s,
      periods: s.periods.map((x) => (x.key === key ? { ...x, status, closedBy: actor.name, closedAt: now(), history: [...(x.history ?? []), { at: now(), by: actor.name, action: label }] } : x))
    });
    finAudit(actor.name, label, key);
    return done(level === 'HARD' ? 'Period closed' : 'Period soft-closed', level === 'HARD' ? `${p.label ?? periodLabel(key, true)} is locked — nothing more can be posted into it` : `${p.label ?? periodLabel(key, true)}: invoices, bills and payments are locked; managers can still post journals`);
  };
  /** Director's direct reopen (an emergency path): the reason is kept on the period's history. Others use requestReopen. */
  const reopenPeriod = (key: string, reason: string): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (actor.role !== 'DIRECTOR') return fail('Only the Finance Director can reopen a closed period — raise a reopen request instead');
    if (!reason.trim()) return fail('Give a reason for reopening');
    const later = s.periods.find((x) => x.key > key && x.status === 'CLOSED' && !x.special);
    if (later) return fail(`Reopen ${later.label ?? periodLabel(later.key, true)} first`);
    commit({
      ...s,
      periods: s.periods.map((x) =>
        x.key === key ? { ...x, status: 'OPEN', closedBy: undefined, closedAt: undefined, history: [...(x.history ?? []), { at: now(), by: actor.name, action: 'Reopened', note: reason }] } : x
      )
    });
    finAudit(actor.name, 'Period reopened', key, reason);
    finNotify('Finance team', `${periodLabel(key, true)} was reopened`, key, reason, 'warning');
    return done('Period reopened', `${periodLabel(key, true)}: ${reason}`);
  };

  /* ---------------- Parties ---------------- */
  const saveParty = (p: Party): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!p.name.trim()) return fail('Enter a name');
    const exists = s.parties.some((x) => x.id !== p.id && x.kind === p.kind && x.name.toLowerCase() === p.name.trim().toLowerCase());
    if (exists) return fail('A customer or supplier with that name already exists');
    const pin = p.pin.trim().toUpperCase();
    if (pin && pin !== 'NON-RESIDENT') {
      if (!/^[AP]\d{9}[A-Z]$/.test(pin)) return fail('KRA PIN must look like P051234567A');
      const same = s.parties.find((x) => x.id !== p.id && x.kind === p.kind && x.pin.toUpperCase() === pin);
      if (same) return fail(`${same.name} already has KRA PIN ${pin}`);
    }
    const party = { ...p, name: p.name.trim(), pin: pin || p.pin };
    const existing = s.parties.find((x) => x.id === p.id);
    commit({ ...s, parties: p.id && existing ? s.parties.map((x) => (x.id === p.id ? party : x)) : [...s.parties, { ...party, id: uid(p.kind === 'CUSTOMER' ? 'c' : 's') }] });
    if (existing) finAudit(actor.name, 'Party changed', party.name, diffFields(existing, party).map((c) => `${c.field}: ${c.before} → ${c.after}`).join('; '));
    return done('Saved', party.name);
  };

  const reset = () => {
    if (guard()) return;
    commit(buildSeed());
    setPage('overview');
    addToast({ type: 'info', title: 'Demo data restored', message: 'Finance is back to its starting data.' });
  };

  const gl = glActions(ctx);
  const sub = subledgerActions(ctx);
  const plan = planningActions(ctx);

  return {
    /** The active company's books (what every page shows). */
    state: view,
    /** Every company in the group (consolidation, inter-company). */
    fullState: state,
    /** Latest state, including changes made earlier in the same event. */
    snapshot: () => ref.current,
    entries,
    actor,
    readOnly: !access.canWrite,
    page,
    focus,
    setPage,
    setFocus,
    setActor,
    saveDocument,
    saveSettlement,
    saveJournal,
    transition,
    reverseJournal,
    matchBank,
    autoMatch,
    bankEntry,
    addAsset,
    runDepreciation,
    setBudget,
    autoChecks,
    toggleCheck,
    closePeriod,
    reopenPeriod,
    saveParty,
    reset,
    reconciliationFor: (account: string, since: string) => reconciliation(view, entries, account, since),
    totals: docTotals,
    ...gl,
    ...sub,
    ...plan
  };
};

const addDaysLocal = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Applies a credit memo to the document it corrects, then the party's oldest open items. */
export const autoAllocate = (s: FinanceState, m: Memo): Allocation[] => {
  let left = round2(docTotals(m).total);
  const out: Allocation[] = [];
  const kind = m.side === 'AR' ? 'INVOICE' : 'BILL';
  const open = s.documents
    .filter((d) => d.kind === kind && d.partyId === m.partyId && d.status === 'POSTED' && (d.currency || 'KES') === (m.currency || 'KES'))
    .sort((a, b) => (a.id === m.originalDocId ? -1 : b.id === m.originalDocId ? 1 : a.dueDate.localeCompare(b.dueDate)));
  for (const d of open) {
    if (left <= 0.005) break;
    const bal = docBalance(s, d);
    if (bal <= 0.005) continue;
    const amt = round2(Math.min(bal, left));
    out.push({ docId: d.id, amount: amt });
    left = round2(left - amt);
  }
  return out;
};

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const store = useFinanceStore();
  return <FinanceContext.Provider value={store}>{children}</FinanceContext.Provider>;
};

export const useFinance = () => {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used inside FinanceProvider');
  return ctx;
};
