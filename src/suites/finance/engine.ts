import type {
  Account,
  AccountType,
  Actor,
  BankLine,
  DocStatus,
  FinDocument,
  FinanceState,
  FinRole,
  FixedAsset,
  Journal,
  LedgerEntry,
  Settlement
} from './types';

export const VAT_RATE = 0.16;
/** Documents above this amount need a second approval by the Finance Director. */
export const DIRECTOR_LIMIT = 1_000_000;

export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const TODAY = iso(new Date());
/** Local date-time without a zone (e.g. 2026-10-07T14:05:00), read back as local time everywhere. */
export const localStamp = (d = new Date()) =>
  `${iso(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
export const addDays = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return iso(d);
};
export const daysBetween = (from: string, to: string) =>
  Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86_400_000);
export const periodOf = (date: string) => date.slice(0, 7);
export const periodLabel = (key: string, long = false) =>
  new Date(key + '-01T00:00:00').toLocaleDateString('en-GB', { month: long ? 'long' : 'short', year: 'numeric' });
export const round2 = (n: number) => Math.round(n * 100) / 100;

export const kes = (n: number, opts: { compact?: boolean; sign?: boolean } = {}) => {
  const abs = Math.abs(n);
  const body = opts.compact
    ? abs >= 1e6
      ? `${(abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`
      : abs >= 1e3
        ? `${(abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}K`
        : abs.toFixed(0)
    : abs.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : '';
  return `${sign}KES ${body}`;
};
export const fmtDate = (date: string) =>
  date ? new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export const docTotals = (doc: Pick<FinDocument, 'lines'>) => {
  let net = 0;
  let vat = 0;
  for (const l of doc.lines) {
    const amount = round2(l.qty * l.price);
    net += amount;
    if (l.vat) vat += round2(amount * VAT_RATE);
  }
  return { net: round2(net), vat: round2(vat), total: round2(net + vat) };
};

export const journalTotals = (j: Pick<Journal, 'lines'>) => {
  const debit = round2(j.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const credit = round2(j.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  return { debit, credit, balanced: debit > 0 && Math.abs(debit - credit) < 0.005 };
};

/** Amount the document is worth for approval purposes. */
export const docValue = (doc: FinDocument | Settlement | Journal) =>
  'kind' in doc && (doc.kind === 'INVOICE' || doc.kind === 'BILL')
    ? docTotals(doc as FinDocument).total
    : 'amount' in doc
      ? doc.amount
      : journalTotals(doc as Journal).debit;

/** Money settled against a document by posted receipts or payments. */
export const settledAmount = (state: FinanceState, docId: string) =>
  round2(
    state.settlements
      .filter((s) => s.status === 'POSTED')
      .reduce((sum, s) => sum + s.allocations.filter((a) => a.docId === docId).reduce((x, a) => x + a.amount, 0), 0)
  );

export const docBalance = (state: FinanceState, doc: FinDocument) => round2(docTotals(doc).total - settledAmount(state, doc.id));

export type PayState = 'UNPAID' | 'PART_PAID' | 'PAID';
export const payState = (state: FinanceState, doc: FinDocument): PayState => {
  const paid = settledAmount(state, doc.id);
  if (paid <= 0) return 'UNPAID';
  return paid + 0.005 >= docTotals(doc).total ? 'PAID' : 'PART_PAID';
};
export const isOverdue = (state: FinanceState, doc: FinDocument, today = TODAY) =>
  doc.status === 'POSTED' && doc.dueDate < today && docBalance(state, doc) > 0.005;

/* ------------------------------------------------------------------ */
/* Workflow rules                                                      */
/* ------------------------------------------------------------------ */

export const ROLE_LABEL: Record<FinRole, string> = {
  ACCOUNTANT: 'Accountant',
  MANAGER: 'Finance Manager',
  DIRECTOR: 'Finance Director'
};

export const approvalsNeeded = (value: number) => (value > DIRECTOR_LIMIT ? 2 : 1);

type Doc = FinDocument | Settlement | Journal;

/** What the current actor may do with a document, and why not. */
export const permissions = (state: FinanceState, doc: Doc, actor: Actor) => {
  const value = docValue(doc);
  const needed = approvalsNeeded(value);
  const approvers = doc.approvals.map((a) => a.by);
  const own = doc.preparedBy === actor.name;
  const closed = isPeriodClosed(state, doc.date);
  const editable = doc.status === 'DRAFT' || doc.status === 'REJECTED';
  const out = {
    edit: editable,
    submit: editable,
    approve: false,
    reject: false,
    post: false,
    void: doc.status !== 'POSTED' && doc.status !== 'VOID',
    reason: '' as string
  };
  if (doc.status === 'SUBMITTED') {
    if (actor.role === 'ACCOUNTANT') out.reason = 'Waiting for a Finance Manager or Director to approve';
    else if (own) out.reason = 'You prepared this document, so someone else must approve it';
    else if (approvers.includes(actor.name)) out.reason = 'You have already approved this document';
    else if (approvers.length === 1 && needed === 2 && actor.role !== 'DIRECTOR')
      out.reason = `Above ${kes(DIRECTOR_LIMIT, { compact: true })} — the Finance Director gives the second approval`;
    else {
      out.approve = true;
      out.reject = true;
    }
  }
  if (doc.status === 'APPROVED') {
    if (closed) out.reason = `${periodLabel(periodOf(doc.date), true)} is closed — change the date or reopen the period`;
    else if (actor.role === 'ACCOUNTANT' && own) out.reason = 'Posting is done by a Finance Manager or Director';
    else out.post = true;
  }
  return { ...out, needed, approvalsDone: doc.approvals.length };
};

export const nextStatus = (doc: Doc, adding: FinRole): DocStatus => {
  const needed = approvalsNeeded(docValue(doc));
  const count = doc.approvals.length + 1;
  const hasDirector = adding === 'DIRECTOR' || doc.approvals.some((a) => a.role === 'DIRECTOR');
  return count >= needed && (needed === 1 || hasDirector) ? 'APPROVED' : 'SUBMITTED';
};

/* ------------------------------------------------------------------ */
/* Periods                                                             */
/* ------------------------------------------------------------------ */

export const isPeriodClosed = (state: FinanceState, date: string) =>
  state.periods.find((p) => p.key === periodOf(date))?.status === 'CLOSED';

/* ------------------------------------------------------------------ */
/* General ledger                                                      */
/* ------------------------------------------------------------------ */

export const CONTROL = { AR: '1100', AP: '2000', VAT_IN: '1150', VAT_OUT: '2100', ACC_DEP: '1590', DEP_EXP: '6800' };

/** Every posted transaction as double-entry lines. */
export const ledger = (state: FinanceState): LedgerEntry[] => {
  const out: LedgerEntry[] = [];
  const push = (e: Omit<LedgerEntry, 'id'>, i: number) => out.push({ ...e, id: `${e.sourceId}:${i}` });

  for (const d of state.documents) {
    if (d.status !== 'POSTED') continue;
    const t = docTotals(d);
    const party = state.parties.find((p) => p.id === d.partyId)?.name ?? '';
    const base = { date: d.date, sourceId: d.id, ref: d.number, department: d.department };
    let i = 0;
    if (d.kind === 'INVOICE') {
      push({ ...base, account: CONTROL.AR, debit: t.total, credit: 0, source: 'Sales invoice', memo: party }, i++);
      for (const l of d.lines) push({ ...base, account: l.account, debit: 0, credit: round2(l.qty * l.price), source: 'Sales invoice', memo: l.description }, i++);
      if (t.vat) push({ ...base, account: CONTROL.VAT_OUT, debit: 0, credit: t.vat, source: 'Sales invoice', memo: 'Output VAT' }, i++);
    } else {
      for (const l of d.lines) push({ ...base, account: l.account, debit: round2(l.qty * l.price), credit: 0, source: 'Supplier bill', memo: l.description }, i++);
      if (t.vat) push({ ...base, account: CONTROL.VAT_IN, debit: t.vat, credit: 0, source: 'Supplier bill', memo: 'Input VAT' }, i++);
      push({ ...base, account: CONTROL.AP, debit: 0, credit: t.total, source: 'Supplier bill', memo: party }, i++);
    }
  }

  for (const s of state.settlements) {
    if (s.status !== 'POSTED') continue;
    const party = state.parties.find((p) => p.id === s.partyId)?.name ?? '';
    const base = { date: s.date, sourceId: s.id, ref: s.number, memo: party };
    if (s.kind === 'RECEIPT') {
      push({ ...base, account: s.bankAccount, debit: s.amount, credit: 0, source: 'Customer receipt' }, 0);
      push({ ...base, account: CONTROL.AR, debit: 0, credit: s.amount, source: 'Customer receipt' }, 1);
    } else {
      push({ ...base, account: CONTROL.AP, debit: s.amount, credit: 0, source: 'Supplier payment' }, 0);
      push({ ...base, account: s.bankAccount, debit: 0, credit: s.amount, source: 'Supplier payment' }, 1);
    }
  }

  for (const j of state.journals) {
    if (j.status !== 'POSTED') continue;
    j.lines.forEach((l, i) =>
      push(
        {
          date: j.date,
          account: l.account,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          source: JOURNAL_SOURCE[j.source],
          sourceId: j.id,
          ref: j.number,
          memo: l.description || j.memo,
          department: l.department
        },
        i
      )
    );
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
};

export const JOURNAL_SOURCE: Record<Journal['source'], string> = {
  MANUAL: 'Journal',
  OPENING: 'Opening balances',
  DEPRECIATION: 'Depreciation',
  BANK: 'Bank entry',
  ASSET: 'Asset capitalisation',
  REVERSAL: 'Reversal'
};

const NORMAL_DEBIT: Record<AccountType, boolean> = { ASSET: true, EXPENSE: true, LIABILITY: false, EQUITY: false, INCOME: false };

/** Balance in the account's natural direction (assets/expenses debit, others credit). */
export const balanceOf = (entries: LedgerEntry[], account: Account, opts: { from?: string; to?: string } = {}) => {
  let dr = 0;
  let cr = 0;
  for (const e of entries) {
    if (e.account !== account.code) continue;
    if (opts.from && e.date < opts.from) continue;
    if (opts.to && e.date > opts.to) continue;
    dr += e.debit;
    cr += e.credit;
  }
  return round2(NORMAL_DEBIT[account.type] ? dr - cr : cr - dr);
};

export const trialBalance = (state: FinanceState, entries: LedgerEntry[], to = TODAY) =>
  state.accounts
    .map((a) => {
      let dr = 0;
      let cr = 0;
      for (const e of entries) {
        if (e.account !== a.code || e.date > to) continue;
        dr += e.debit;
        cr += e.credit;
      }
      const net = round2(dr - cr);
      return { account: a, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, movement: round2(dr + cr) };
    })
    .filter((r) => r.movement > 0);

export const profitAndLoss = (state: FinanceState, entries: LedgerEntry[], from: string, to: string) => {
  const rows = (type: AccountType) =>
    state.accounts
      .filter((a) => a.type === type)
      .map((a) => ({ account: a, amount: balanceOf(entries, a, { from, to }) }))
      .filter((r) => Math.abs(r.amount) > 0.005);
  const income = rows('INCOME');
  const expenses = rows('EXPENSE');
  const cogs = expenses.filter((r) => r.account.group === 'Cost of sales');
  const opex = expenses.filter((r) => r.account.group !== 'Cost of sales');
  const totalIncome = round2(income.reduce((s, r) => s + r.amount, 0));
  const totalCogs = round2(cogs.reduce((s, r) => s + r.amount, 0));
  const totalOpex = round2(opex.reduce((s, r) => s + r.amount, 0));
  return {
    income,
    cogs,
    opex,
    totalIncome,
    totalCogs,
    grossProfit: round2(totalIncome - totalCogs),
    totalOpex,
    netProfit: round2(totalIncome - totalCogs - totalOpex)
  };
};

export const balanceSheet = (state: FinanceState, entries: LedgerEntry[], asAt = TODAY) => {
  const rows = (type: AccountType) =>
    state.accounts
      .filter((a) => a.type === type)
      .map((a) => ({ account: a, amount: balanceOf(entries, a, { to: asAt }) }))
      .filter((r) => Math.abs(r.amount) > 0.005);
  const assets = rows('ASSET');
  const liabilities = rows('LIABILITY');
  const equity = rows('EQUITY');
  const yearStart = `${asAt.slice(0, 4)}-01-01`;
  // Profit of earlier years is assumed closed into retained earnings by the opening journal
  const currentEarnings = profitAndLoss(state, entries, yearStart, asAt).netProfit;
  const totalAssets = round2(assets.reduce((s, r) => s + r.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((s, r) => s + r.amount, 0));
  const totalEquity = round2(equity.reduce((s, r) => s + r.amount, 0) + currentEarnings);
  return { assets, liabilities, equity, currentEarnings, totalAssets, totalLiabilities, totalEquity };
};

/** Revenue, expenses and profit for each month of a year. */
export const monthlySeries = (state: FinanceState, entries: LedgerEntry[], year: number) =>
  Array.from({ length: 12 }, (_, m) => {
    const key = `${year}-${String(m + 1).padStart(2, '0')}`;
    const from = `${key}-01`;
    const to = `${key}-31`;
    const pl = profitAndLoss(state, entries, from, to);
    return { key, label: periodLabel(key).slice(0, 3), revenue: pl.totalIncome, expenses: round2(pl.totalCogs + pl.totalOpex), profit: pl.netProfit };
  });

export const cashPosition = (state: FinanceState, entries: LedgerEntry[], to = TODAY) =>
  state.accounts.filter((a) => a.bank).map((a) => ({ account: a, balance: balanceOf(entries, a, { to }) }));

/* ------------------------------------------------------------------ */
/* Ageing                                                              */
/* ------------------------------------------------------------------ */

export const AGE_BUCKETS = ['Not due', '1–30 days', '31–60 days', '61–90 days', '90+ days'] as const;

export const ageing = (state: FinanceState, kind: 'INVOICE' | 'BILL', today = TODAY) => {
  const byParty = new Map<string, number[]>();
  const totals = [0, 0, 0, 0, 0];
  for (const d of state.documents) {
    if (d.kind !== kind || d.status !== 'POSTED') continue;
    const bal = docBalance(state, d);
    if (bal <= 0.005) continue;
    const late = daysBetween(d.dueDate, today);
    const b = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
    const row = byParty.get(d.partyId) ?? [0, 0, 0, 0, 0];
    row[b] = round2(row[b] + bal);
    totals[b] = round2(totals[b] + bal);
    byParty.set(d.partyId, row);
  }
  const rows = [...byParty.entries()]
    .map(([partyId, buckets]) => ({
      party: state.parties.find((p) => p.id === partyId)!,
      buckets,
      total: round2(buckets.reduce((s, x) => s + x, 0))
    }))
    .sort((a, b) => b.total - a.total);
  return { rows, totals, total: round2(totals.reduce((s, x) => s + x, 0)) };
};

/* ------------------------------------------------------------------ */
/* Bank reconciliation                                                 */
/* ------------------------------------------------------------------ */

export const bankEntries = (entries: LedgerEntry[], account: string) =>
  entries.filter((e) => e.account === account).map((e) => ({ ...e, amount: round2(e.debit - e.credit) }));

/** Pairs unmatched statement lines with unmatched ledger lines of the same amount within 5 days. */
export const autoMatches = (state: FinanceState, entries: LedgerEntry[], account: string) => {
  const used = new Set(state.bankLines.filter((l) => l.matchedTo).map((l) => l.matchedTo));
  const book = bankEntries(entries, account).filter((e) => !used.has(e.id));
  const pairs: { lineId: string; entryId: string }[] = [];
  for (const line of state.bankLines.filter((l) => l.bankAccount === account && !l.matchedTo)) {
    const hit = book.find((e) => !used.has(e.id) && Math.abs(e.amount - line.amount) < 0.005 && Math.abs(daysBetween(e.date, line.date)) <= 5);
    if (hit) {
      used.add(hit.id);
      pairs.push({ lineId: line.id, entryId: hit.id });
    }
  }
  return pairs;
};

export const reconciliation = (state: FinanceState, entries: LedgerEntry[], account: string, since: string) => {
  const lines: BankLine[] = state.bankLines.filter((l) => l.bankAccount === account);
  const matched = new Set(lines.filter((l) => l.matchedTo).map((l) => l.matchedTo));
  const book = bankEntries(entries, account);
  const uncleared = book.filter((e) => e.date >= since && !matched.has(e.id));
  const unrecorded = lines.filter((l) => !l.matchedTo);
  const acc = state.accounts.find((a) => a.code === account)!;
  const bookBalance = balanceOf(entries, acc);
  // Statement balance implied by the uncleared and unrecorded items
  const statementBalance = round2(bookBalance - uncleared.reduce((s, e) => s + e.amount, 0) + unrecorded.reduce((s, l) => s + l.amount, 0));
  return { lines, book, uncleared, unrecorded, bookBalance, statementBalance, matchedCount: lines.length - unrecorded.length };
};

/* ------------------------------------------------------------------ */
/* Fixed assets                                                        */
/* ------------------------------------------------------------------ */

export const monthlyCharge = (a: FixedAsset) => round2((a.cost - a.residual) / a.lifeMonths);

export const accumulatedDepreciation = (state: FinanceState, a: FixedAsset) =>
  round2(a.openingDepreciation + state.depreciationRuns.reduce((s, r) => s + (r.perAsset[a.id] ?? 0), 0));

/** Depreciation each active asset should take for a period (stops at residual value). */
export const depreciationFor = (state: FinanceState, period: string) => {
  const perAsset: Record<string, number> = {};
  for (const a of state.assets) {
    if (a.status !== 'ACTIVE' || periodOf(a.acquired) > period) continue;
    const remaining = round2(a.cost - a.residual - accumulatedDepreciation(state, a));
    const charge = Math.min(monthlyCharge(a), remaining);
    if (charge > 0.005) perAsset[a.id] = round2(charge);
  }
  return { perAsset, total: round2(Object.values(perAsset).reduce((s, x) => s + x, 0)) };
};

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

export const budgetVsActual = (state: FinanceState, entries: LedgerEntry[], throughMonth: number) => {
  const year = state.budgetYear;
  const from = `${year}-01-01`;
  const to = `${year}-${String(throughMonth + 1).padStart(2, '0')}-31`;
  return state.budgets.map((b) => {
    const account = state.accounts.find((a) => a.code === b.account)!;
    const budget = round2(b.monthly.slice(0, throughMonth + 1).reduce((s, x) => s + x, 0));
    const annual = round2(b.monthly.reduce((s, x) => s + x, 0));
    const actual = round2(
      entries
        .filter((e) => e.account === b.account && e.date >= from && e.date <= to)
        .reduce((s, e) => s + (account.type === 'INCOME' ? e.credit - e.debit : e.debit - e.credit), 0)
    );
    const variance = round2(account.type === 'INCOME' ? actual - budget : budget - actual);
    return { line: b, account, budget, annual, actual, variance, used: budget ? actual / budget : 0 };
  });
};
