import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
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
  reconciliation,
  round2,
  TODAY, localStamp } from './engine';
import type {
  Allocation,
  DocLine,
  FinDocument,
  FinanceState,
  FinRole,
  FixedAsset,
  Journal,
  JournalLine,
  LedgerEntry,
  Party,
  Settlement
} from './types';

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
  | 'reports';

export type Collection = 'documents' | 'settlements' | 'journals';
export type Transition = 'submit' | 'approve' | 'reject' | 'post' | 'void';
type Result = { ok: true; id?: string } | { ok: false; error: string };

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
}
export interface JournalDraft {
  id?: string;
  date: string;
  memo: string;
  lines: JournalLine[];
}

const BLOCKED_IN_JOURNALS = [CONTROL.AR, CONTROL.AP, CONTROL.VAT_IN, CONTROL.VAT_OUT];
export const CHECKLIST = [
  { key: 'unposted', label: 'Every approved document is posted', auto: true },
  { key: 'bank', label: 'Bank statements reconciled', auto: true },
  { key: 'depreciation', label: 'Depreciation run for the month', auto: true },
  { key: 'ar', label: 'Receivables ageing reviewed and followed up', auto: false },
  { key: 'ap', label: 'Supplier statements agreed', auto: false },
  { key: 'accruals', label: 'Accruals and prepayments booked', auto: false }
] as const;

const FinanceContext = createContext<ReturnType<typeof useFinanceStore> | null>(null);

const useFinanceStore = () => {
  const { addToast } = useApp();
  const [state, setState] = useState<FinanceState>(buildSeed);
  const [page, setPageState] = useState<FinancePage>('overview');
  const [focus, setFocus] = useState<string | null>(null);
  const ref = useRef(state);
  ref.current = state;

  const entries: LedgerEntry[] = useMemo(() => ledger(state), [state]);
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
  const now = () => localStamp();
  const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const nextNumber = (s: FinanceState, prefix: string) => {
    const n = (s.sequence[prefix] ?? 0) + 1;
    return { number: `${prefix}-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`, sequence: { ...s.sequence, [prefix]: n } };
  };

  const setPage = useCallback((p: FinancePage, focusId: string | null = null) => {
    setPageState(p);
    setFocus(focusId);
  }, []);

  const setActor = (role: FinRole) => {
    commit({ ...ref.current, actor: ACTORS[role] });
    addToast({ type: 'info', title: `Acting as ${ACTORS[role].title}`, message: `${ACTORS[role].name} — approvals and posting follow this role.` });
  };

  /* ---------------- Documents (invoices and bills) ---------------- */
  /** `by` lets other modules (Trading, Procurement) create documents in their user's name. */
  const saveDocument = (d: DocumentDraft, by?: string): Result => {
    const s = ref.current;
    if (!d.partyId) return fail(`Choose a ${d.kind === 'INVOICE' ? 'customer' : 'supplier'}`);
    const lines = d.lines.filter((l) => l.description.trim() || l.price);
    if (!lines.length) return fail('Add at least one line');
    if (lines.some((l) => !l.account || l.qty <= 0 || l.price <= 0)) return fail('Every line needs an account, a quantity and a price above zero');
    if (d.dueDate < d.date) return fail('The due date cannot be before the document date');
    if (d.id) {
      const existing = s.documents.find((x) => x.id === d.id)!;
      if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') return fail('Only drafts can be edited');
      commit({
        ...s,
        documents: s.documents.map((x) =>
          x.id === d.id ? { ...x, ...d, lines, status: 'DRAFT', history: [...x.history, { at: now(), by: actor.name, action: 'Edited' }] } : x
        )
      });
      return done('Draft saved', existing.number, d.id);
    }
    const { number, sequence } = nextNumber(s, d.kind === 'INVOICE' ? 'INV' : 'BILL');
    const doc: FinDocument = {
      ...d,
      lines,
      id: uid(d.kind === 'INVOICE' ? 'inv' : 'bill'),
      number,
      status: 'DRAFT',
      preparedBy: by ?? actor.name,
      approvals: [],
      history: [{ at: now(), by: by ?? actor.name, action: by ? 'Created from an order' : 'Created' }]
    };
    commit({ ...s, documents: [doc, ...s.documents], sequence });
    return done(`${d.kind === 'INVOICE' ? 'Invoice' : 'Bill'} created`, `${number} saved as a draft`, doc.id);
  };

  /* ---------------- Receipts and payments ---------------- */
  const saveSettlement = (d: SettlementDraft): Result => {
    const s = ref.current;
    if (!d.partyId) return fail(`Choose a ${d.kind === 'RECEIPT' ? 'customer' : 'supplier'}`);
    if (!(d.amount > 0)) return fail('Enter an amount above zero');
    const allocations = d.allocations.filter((a) => a.amount > 0);
    const allocated = round2(allocations.reduce((x, a) => x + a.amount, 0));
    if (allocated - d.amount > 0.005) return fail('You have allocated more than the amount received');
    for (const a of allocations) {
      const doc = s.documents.find((x) => x.id === a.docId);
      if (doc && a.amount - docBalance(s, doc) > 0.005) return fail(`${doc.number} only has ${docBalance(s, doc).toLocaleString()} outstanding`);
    }
    if (d.id) {
      commit({
        ...s,
        settlements: s.settlements.map((x) =>
          x.id === d.id ? { ...x, ...d, allocations, status: 'DRAFT', history: [...x.history, { at: now(), by: actor.name, action: 'Edited' }] } : x
        )
      });
      return done('Draft saved', s.settlements.find((x) => x.id === d.id)!.number, d.id);
    }
    const { number, sequence } = nextNumber(s, d.kind === 'RECEIPT' ? 'RCT' : 'PAY');
    const rec: Settlement = {
      ...d,
      allocations,
      id: uid(d.kind === 'RECEIPT' ? 'rct' : 'pay'),
      number,
      status: 'DRAFT',
      preparedBy: actor.name,
      approvals: [],
      history: [{ at: now(), by: actor.name, action: 'Created' }]
    };
    commit({ ...s, settlements: [rec, ...s.settlements], sequence });
    return done(d.kind === 'RECEIPT' ? 'Receipt recorded' : 'Payment prepared', `${number} saved as a draft`, rec.id);
  };

  /* ---------------- Journals ---------------- */
  const saveJournal = (d: JournalDraft): Result => {
    const s = ref.current;
    const lines = d.lines.filter((l) => l.account && (Number(l.debit) || Number(l.credit)));
    if (lines.length < 2) return fail('A journal needs at least two lines');
    if (lines.some((l) => Number(l.debit) && Number(l.credit))) return fail('A line can have a debit or a credit, not both');
    const blocked = lines.find((l) => BLOCKED_IN_JOURNALS.includes(l.account));
    if (blocked) return fail(`${blocked.account} is a control account — post it through invoices, bills, receipts or payments`);
    const t = journalTotals({ lines });
    if (!t.balanced) return fail(`Debits (${t.debit.toLocaleString()}) and credits (${t.credit.toLocaleString()}) must be equal`);
    if (!d.memo.trim()) return fail('Describe what the journal is for');
    const clean = lines.map((l) => ({ ...l, debit: round2(Number(l.debit) || 0), credit: round2(Number(l.credit) || 0) }));
    if (d.id) {
      commit({
        ...s,
        journals: s.journals.map((x) =>
          x.id === d.id ? { ...x, ...d, lines: clean, status: 'DRAFT', history: [...x.history, { at: now(), by: actor.name, action: 'Edited' }] } : x
        )
      });
      return done('Draft saved', s.journals.find((x) => x.id === d.id)!.number, d.id);
    }
    const { number, sequence } = nextNumber(s, 'JV');
    const j: Journal = {
      ...d,
      lines: clean,
      id: uid('jv'),
      number,
      source: 'MANUAL',
      status: 'DRAFT',
      preparedBy: actor.name,
      approvals: [],
      history: [{ at: now(), by: actor.name, action: 'Created' }]
    };
    commit({ ...s, journals: [j, ...s.journals], sequence });
    return done('Journal created', `${number} saved as a draft`, j.id);
  };

  /* ---------------- Workflow ---------------- */
  const transition = (collection: Collection, id: string, action: Transition, note = ''): Result => {
    const s = ref.current;
    const list = s[collection] as (FinDocument | Settlement | Journal)[];
    const doc = list.find((x) => x.id === id);
    if (!doc) return fail('Document not found');
    const p = permissions(s, doc, actor);
    const update = (patch: Partial<Pick<FinDocument, 'status' | 'approvals'>>, label: string) => {
      const next = list.map((x) =>
        x.id === id ? { ...x, ...patch, history: [...x.history, { at: now(), by: actor.name, action: label, note: note || undefined }] } : x
      );
      commit({ ...s, [collection]: next });
    };
    switch (action) {
      case 'submit': {
        if (!p.submit) return fail('Only drafts can be submitted');
        if ('lines' in doc && 'kind' in doc && doc.kind === 'BILL' && doc.match && !doc.match.matched)
          addToast({ type: 'warning', title: 'Goods not yet received', message: `${doc.number}: the goods-received note is not matched — the approver will see this.` });
        update({ status: 'SUBMITTED', approvals: [] }, 'Submitted for approval');
        return done('Submitted', `${doc.number} is waiting for approval`);
      }
      case 'approve': {
        if (!p.approve) return fail(p.reason || 'You cannot approve this document');
        const status = nextStatus(doc, actor.role);
        update(
          { status, approvals: [...doc.approvals, { by: actor.name, role: actor.role, at: now() }] },
          actor.role === 'DIRECTOR' && doc.approvals.length ? 'Approved (director)' : 'Approved'
        );
        return done('Approved', status === 'APPROVED' ? `${doc.number} is ready to post` : `${doc.number} now needs the Finance Director`);
      }
      case 'reject': {
        if (!p.reject) return fail(p.reason || 'You cannot reject this document');
        if (!note.trim()) return fail('Give a reason so the preparer knows what to fix');
        update({ status: 'REJECTED', approvals: [] }, 'Rejected');
        return done('Returned to preparer', `${doc.number} was rejected`);
      }
      case 'post': {
        if (!p.post) return fail(p.reason || 'You cannot post this document');
        if ('allocations' in doc) {
          for (const a of doc.allocations) {
            const target = s.documents.find((x) => x.id === a.docId);
            if (target && a.amount - docBalance(s, target) > 0.005) return fail(`${target.number} has already been settled by another document`);
          }
        }
        update({ status: 'POSTED' }, 'Posted to ledger');
        return done('Posted', `${doc.number} is now in the general ledger`);
      }
      case 'void': {
        if (!p.void) return fail('Posted documents cannot be voided — reverse them instead');
        update({ status: 'VOID' }, 'Voided');
        return done('Voided', `${doc.number} was cancelled`);
      }
    }
  };

  const reverseJournal = (id: string, date: string): Result => {
    const s = ref.current;
    const j = s.journals.find((x) => x.id === id);
    if (!j || j.status !== 'POSTED') return fail('Only posted journals can be reversed');
    if (j.reversedBy) return fail('This journal has already been reversed');
    if (actor.role === 'ACCOUNTANT') return fail('Reversals are done by a Finance Manager or Director');
    if (isPeriodClosed(s, date)) return fail(`${periodLabel(periodOf(date), true)} is closed`);
    const { number, sequence } = nextNumber(s, 'JV');
    const rev: Journal = {
      id: uid('jv'),
      number,
      date,
      memo: `Reversal of ${j.number} — ${j.memo}`,
      source: 'REVERSAL',
      reversalOf: j.id,
      lines: j.lines.map((l) => ({ ...l, id: uid('l'), debit: l.credit, credit: l.debit })),
      status: 'POSTED',
      preparedBy: actor.name,
      approvals: [{ by: actor.name, role: actor.role, at: now() }],
      history: [{ at: now(), by: actor.name, action: `Reversal of ${j.number} posted` }]
    };
    commit({
      ...s,
      sequence,
      journals: [rev, ...s.journals.map((x) => (x.id === id ? { ...x, reversedBy: rev.id, history: [...x.history, { at: now(), by: actor.name, action: `Reversed by ${number}` }] } : x))]
    });
    return done('Journal reversed', `${number} cancels ${j.number}`, rev.id);
  };

  /* ---------------- Bank ---------------- */
  const matchBank = (lineId: string, entryId: string | undefined) => {
    const s = ref.current;
    commit({ ...s, bankLines: s.bankLines.map((l) => (l.id === lineId ? { ...l, matchedTo: entryId } : l)) });
  };
  const autoMatch = (account: string) => {
    const s = ref.current;
    const pairs = autoMatches(s, ledger(s), account);
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
    const s = ref.current;
    const line = s.bankLines.find((l) => l.id === lineId);
    if (!line) return fail('Statement line not found');
    if (actor.role === 'ACCOUNTANT' && Math.abs(line.amount) > 50_000) return fail('Bank entries above KES 50,000 need a Finance Manager');
    if (BLOCKED_IN_JOURNALS.includes(account)) return fail('Choose an expense, income or balance sheet account — not a control account');
    if (isPeriodClosed(s, line.date)) return fail('That period is closed');
    const { number, sequence } = nextNumber(s, 'JV');
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
      history: [{ at: now(), by: actor.name, action: 'Posted from bank reconciliation' }]
    };
    const bankIdx = line.amount < 0 ? 1 : 0;
    commit({ ...s, sequence, journals: [j, ...s.journals], bankLines: s.bankLines.map((l) => (l.id === lineId ? { ...l, matchedTo: `${id}:${bankIdx}` } : l)) });
    return done('Entry posted and matched', `${number} — ${memo || line.description}`);
  };

  /* ---------------- Fixed assets ---------------- */
  const addAsset = (a: Omit<FixedAsset, 'id' | 'number' | 'status' | 'openingDepreciation'>, funding: string): Result => {
    const s = ref.current;
    if (!a.name.trim()) return fail('Name the asset');
    if (!(a.cost > 0) || !(a.lifeMonths > 0)) return fail('Enter the cost and useful life');
    if (a.residual >= a.cost) return fail('Residual value must be below cost');
    if (actor.role === 'ACCOUNTANT') return fail('Capitalising assets needs a Finance Manager or Director');
    if (isPeriodClosed(s, a.acquired)) return fail('The acquisition date falls in a closed period');
    const n = s.assets.length + 1;
    const asset: FixedAsset = { ...a, id: uid('fa'), number: `FA-${String(n).padStart(4, '0')}`, status: 'ACTIVE', openingDepreciation: 0 };
    const { number, sequence } = nextNumber(s, 'JV');
    const j: Journal = {
      id: uid('jv'),
      number,
      date: a.acquired,
      memo: `Capitalise ${asset.number} — ${a.name}`,
      source: 'ASSET',
      lines: [
        { id: uid('l'), account: a.costAccount, description: a.name, debit: a.cost, credit: 0 },
        { id: uid('l'), account: funding, description: 'Funding', debit: 0, credit: a.cost }
      ],
      status: 'POSTED',
      preparedBy: actor.name,
      approvals: [{ by: actor.name, role: actor.role, at: now() }],
      history: [{ at: now(), by: actor.name, action: 'Asset capitalised' }]
    };
    commit({ ...s, sequence, assets: [...s.assets, asset], journals: [j, ...s.journals] });
    return done('Asset added', `${asset.number} capitalised by ${number}`);
  };

  const runDepreciation = (period: string): Result => {
    const s = ref.current;
    if (actor.role === 'ACCOUNTANT') return fail('Depreciation runs are posted by a Finance Manager or Director');
    if (s.depreciationRuns.some((r) => r.period === period)) return fail(`Depreciation for ${periodLabel(period, true)} has already been run`);
    if (s.periods.find((p) => p.key === period)?.status === 'CLOSED') return fail('That period is closed');
    const { perAsset, total } = depreciationFor(s, period);
    if (!total) return fail('Nothing to depreciate');
    const [y, m] = period.split('-').map(Number);
    const date = new Date(y, m, 0);
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const { number, sequence } = nextNumber(s, 'JV');
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
      history: [{ at: now(), by: actor.name, action: 'Depreciation run posted' }]
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
  const setBudget = (account: string, monthly: number[]) => {
    const s = ref.current;
    commit({ ...s, budgets: s.budgets.map((b) => (b.account === account ? { ...b, monthly } : b)) });
  };

  /* ---------------- Period close ---------------- */
  const autoChecks = (s: FinanceState, key: string) => {
    const inPeriod = (date: string) => periodOf(date) === key;
    const open = [...s.documents, ...s.settlements, ...s.journals].filter((d) => inPeriod(d.date) && (d.status === 'APPROVED' || d.status === 'SUBMITTED'));
    const unmatched = s.bankLines.filter((l) => inPeriod(l.date) && !l.matchedTo);
    const depreciated = s.depreciationRuns.some((r) => r.period === key);
    return { unposted: open.length === 0, bank: unmatched.length === 0, depreciation: depreciated, openCount: open.length, unmatchedCount: unmatched.length };
  };
  const toggleCheck = (key: string, item: string) => {
    const s = ref.current;
    commit({ ...s, periods: s.periods.map((p) => (p.key === key ? { ...p, checklist: { ...p.checklist, [item]: !p.checklist[item] } } : p)) });
  };
  const closePeriod = (key: string): Result => {
    const s = ref.current;
    if (actor.role === 'ACCOUNTANT') return fail('Closing a period needs a Finance Manager or Director');
    const p = s.periods.find((x) => x.key === key)!;
    const earlierOpen = s.periods.find((x) => x.key < key && x.status === 'OPEN');
    if (earlierOpen) return fail(`Close ${periodLabel(earlierOpen.key, true)} first`);
    const a = autoChecks(s, key);
    const missing = CHECKLIST.filter((c) => !(c.auto ? a[c.key as 'unposted' | 'bank' | 'depreciation'] : p.checklist[c.key]));
    if (missing.length) return fail(`Still to do: ${missing.map((m) => m.label.toLowerCase()).join('; ')}`);
    commit({ ...s, periods: s.periods.map((x) => (x.key === key ? { ...x, status: 'CLOSED', closedBy: actor.name, closedAt: now() } : x)) });
    return done('Period closed', `${periodLabel(key, true)} is locked — nothing more can be posted into it`);
  };
  const reopenPeriod = (key: string, reason: string): Result => {
    const s = ref.current;
    if (actor.role !== 'DIRECTOR') return fail('Only the Finance Director can reopen a closed period');
    if (!reason.trim()) return fail('Give a reason for reopening');
    const later = s.periods.find((x) => x.key > key && x.status === 'CLOSED');
    if (later) return fail(`Reopen ${periodLabel(later.key, true)} first`);
    commit({ ...s, periods: s.periods.map((x) => (x.key === key ? { ...x, status: 'OPEN', closedBy: undefined, closedAt: undefined } : x)) });
    return done('Period reopened', `${periodLabel(key, true)}: ${reason}`);
  };

  /* ---------------- Parties ---------------- */
  const saveParty = (p: Party): Result => {
    const s = ref.current;
    if (!p.name.trim()) return fail('Enter a name');
    const exists = s.parties.some((x) => x.id !== p.id && x.name.toLowerCase() === p.name.trim().toLowerCase());
    if (exists) return fail('A customer or supplier with that name already exists');
    const party = { ...p, name: p.name.trim() };
    commit({ ...s, parties: p.id && s.parties.some((x) => x.id === p.id) ? s.parties.map((x) => (x.id === p.id ? party : x)) : [...s.parties, { ...party, id: uid(p.kind === 'CUSTOMER' ? 'c' : 's') }] });
    return done('Saved', party.name);
  };

  const reset = () => {
    commit(buildSeed());
    setPage('overview');
    addToast({ type: 'info', title: 'Demo data restored', message: 'Finance is back to its starting data.' });
  };

  return {
    state,
    /** Latest state, including changes made earlier in the same event. */
    snapshot: () => ref.current,
    entries,
    actor,
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
    reconciliationFor: (account: string, since: string) => reconciliation(state, entries, account, since),
    totals: docTotals
  };
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
