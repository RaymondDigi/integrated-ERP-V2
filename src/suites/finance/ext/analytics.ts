import {
  addDays,
  addMonths,
  asAtView,
  balanceOf,
  bucketOf,
  companyOf,
  daysBetween,
  docBalance,
  docBalanceBase,
  docTotals,
  EXT,
  fxOf,
  ledger,
  lineNet,
  memoBalance,
  monthEnd,
  periodOf,
  profitAndLoss,
  round2,
  scope,
  TODAY
} from '../engine';
import type { Account, FinanceState, LedgerEntry, ReportDefinition, ReportRow } from '../types';
import { advanceLeft } from './subledger';

/* ------------------------------------------------------------------ */
/* Receivables and payables analysis                                   */
/* ------------------------------------------------------------------ */

/** Month-end open balances for the last n months, optionally for one party or one customer category. */
export const balanceHistory = (state: FinanceState, kind: 'INVOICE' | 'BILL', months = 12, filter: { partyId?: string; category?: string } = {}) => {
  const out: { key: string; label: string; current: number; overdue: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const key = periodOf(addMonths(TODAY, -i));
    const date = i === 0 ? TODAY : monthEnd(key);
    const v = asAtView(state, date);
    let current = 0;
    let overdue = 0;
    for (const d of v.documents) {
      if (d.kind !== kind || d.status !== 'POSTED' || d.date > date) continue;
      if (filter.partyId && d.partyId !== filter.partyId) continue;
      if (filter.category && state.parties.find((p) => p.id === d.partyId)?.category !== filter.category) continue;
      const bal = docBalanceBase(v, d);
      if (bal <= 0.005) continue;
      if (d.dueDate < date) overdue += bal;
      else current += bal;
    }
    out.push({ key, label: new Date(key + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short' }), current: round2(current), overdue: round2(overdue) });
  }
  return out;
};

/** Payment behaviour of a customer (or supplier): days to pay, DSO, late share, last payment. */
export const partyStats = (state: FinanceState, partyId: string) => {
  const docs = state.documents.filter((d) => d.partyId === partyId && d.status === 'POSTED' && !d.memoType);
  const pays = state.settlements.filter((s) => s.partyId === partyId && s.status === 'POSTED' && !s.voided);
  const daysToPay: number[] = [];
  let late = 0;
  for (const d of docs) {
    const settled = pays.filter((p) => p.allocations.some((a) => a.docId === d.id)).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!settled || docBalance(state, d) > 0.005) continue;
    daysToPay.push(daysBetween(d.date, settled.date));
    if (settled.date > d.dueDate) late++;
  }
  const open = round2(docs.reduce((x, d) => x + docBalanceBase(state, d), 0));
  const sales90 = round2(docs.filter((d) => d.date >= addDays(TODAY, -90)).reduce((x, d) => x + docTotals(d).total * fxOf(d), 0));
  const avg = daysToPay.length ? Math.round(daysToPay.reduce((x, n) => x + n, 0) / daysToPay.length) : 0;
  return {
    invoices: docs.length,
    paidCount: daysToPay.length,
    avgDaysToPay: avg,
    lateShare: daysToPay.length ? late / daysToPay.length : 0,
    dso: sales90 > 0 ? Math.round((open / sales90) * 90) : 0,
    open,
    overdue: round2(docs.filter((d) => d.dueDate < TODAY).reduce((x, d) => x + docBalanceBase(state, d), 0)),
    lastPayment: pays.sort((a, b) => b.date.localeCompare(a.date))[0],
    highest: Math.max(0, ...docs.map((d) => docTotals(d).total * fxOf(d)))
  };
};

/** Unapplied credits (credit notes, on-account receipts, advances) aged by their date. */
export const creditAgeing = (state: FinanceState, side: 'AR' | 'AP') => {
  const rows: { partyId: string; ref: string; date: string; kind: string; amount: number; bucket: number }[] = [];
  for (const m of state.memos) {
    if (m.side !== side || m.status !== 'POSTED') continue;
    const left = round2(memoBalance(m) * fxOf(m));
    if (left > 0.005) rows.push({ partyId: m.partyId, ref: m.number, date: m.date, kind: side === 'AR' ? 'Credit note' : 'Debit memo', amount: left, bucket: bucketOf(daysBetween(m.date, TODAY)) });
  }
  for (const s of state.settlements) {
    if (s.status !== 'POSTED' || s.voided || s.kind !== (side === 'AR' ? 'RECEIPT' : 'PAYMENT')) continue;
    const isAdv = s.purpose && s.purpose !== 'NORMAL';
    const left = isAdv ? advanceLeft(state, s) : round2(s.amount + (s.wht?.amount ?? 0) - s.allocations.reduce((x, a) => x + a.amount, 0));
    if (left > 0.005) rows.push({ partyId: s.partyId, ref: s.number, date: s.date, kind: isAdv ? (side === 'AR' ? 'Customer advance' : 'Prepayment') : 'On account', amount: round2(left * fxOf(s)), bucket: bucketOf(daysBetween(s.date, TODAY)) });
  }
  return rows;
};

/** Customer ageing split by bill-to address (multi-level ageing). */
export const ageingByBillTo = (state: FinanceState) => {
  const out: { partyId: string; billTo: string; buckets: number[]; total: number }[] = [];
  for (const d of state.documents) {
    if (d.kind !== 'INVOICE' || d.status !== 'POSTED') continue;
    const bal = docBalanceBase(state, d);
    if (bal <= 0.005) continue;
    const party = state.parties.find((p) => p.id === d.partyId);
    const label = party?.addresses?.find((a) => a.id === d.billToId)?.label ?? 'Main account';
    const limits = party?.agingBuckets ?? [30, 60, 90];
    let row = out.find((r) => r.partyId === d.partyId && r.billTo === label);
    if (!row) out.push((row = { partyId: d.partyId, billTo: label, buckets: [0, 0, 0, 0, 0], total: 0 }));
    const b = Math.min(4, bucketOf(daysBetween(d.dueDate, TODAY), limits));
    row.buckets[b] = round2(row.buckets[b] + bal);
    row.total = round2(row.total + bal);
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Cash                                                                */
/* ------------------------------------------------------------------ */

/** Weekly cash projection from open invoices (shifted by each customer's usual delay), bills, recurring schedules and treasury. */
export const cashForecast = (state: FinanceState, entries: LedgerEntry[], weeks = 13) => {
  const opening = round2(state.accounts.filter((a) => a.bank).reduce((x, a) => x + balanceOf(entries, a), 0));
  const rows = Array.from({ length: weeks }, (_, i) => ({ week: i + 1, from: addDays(TODAY, i * 7), to: addDays(TODAY, i * 7 + 6), receipts: 0, payments: 0, treasury: 0, recurring: 0, net: 0, closing: 0 }));
  const slot = (date: string) => {
    const d = date < TODAY ? TODAY : date;
    return rows.find((r) => d >= r.from && d <= r.to);
  };
  const delay = new Map<string, number>();
  for (const d of state.documents) {
    if (d.status !== 'POSTED') continue;
    const bal = docBalanceBase(state, d);
    if (bal <= 0.005) continue;
    if (!delay.has(d.partyId)) delay.set(d.partyId, Math.max(0, partyStats(state, d.partyId).avgDaysToPay - state.parties.find((p) => p.id === d.partyId)!.terms));
    const r = slot(d.kind === 'INVOICE' ? addDays(d.dueDate, delay.get(d.partyId)!) : d.dueDate);
    if (!r) continue;
    if (d.kind === 'INVOICE') r.receipts += bal;
    else if (!d.hold) r.payments += bal;
  }
  for (const rc of state.recurring) {
    if (!rc.active) continue;
    let date = rc.nextRun;
    for (let k = 0; k < 4; k++) {
      const r = slot(addDays(date, 30));
      const amt = rc.lines.reduce((x, l) => x + lineNet(l) * (1 + (l.taxRate ?? (l.vat ? 0.16 : 0))), 0);
      if (r) r.recurring += rc.kind === 'INVOICE' ? amt : -amt;
      date = addMonths(date, rc.frequency === 'MONTHLY' ? 1 : rc.frequency === 'QUARTERLY' ? 3 : 12);
    }
  }
  for (const i of state.instruments) {
    if (i.status !== 'ACTIVE') continue;
    const r = slot(i.maturity);
    if (!r) continue;
    const amt = i.principal - i.repaid + i.accrued;
    if (['DEPOSIT', 'TBILL', 'BOND', 'LOAN_OUT', 'IC_LOAN'].includes(i.type) && !i.rollover) r.treasury += amt;
    if (i.type === 'LOAN_IN') r.treasury -= amt;
  }
  let bal = opening;
  for (const r of rows) {
    r.receipts = round2(r.receipts);
    r.payments = round2(r.payments);
    r.recurring = round2(r.recurring);
    r.treasury = round2(r.treasury);
    r.net = round2(r.receipts - r.payments + r.recurring + r.treasury);
    bal = round2(bal + r.net);
    r.closing = bal;
  }
  return { opening, rows };
};

/** Actual money in and out of the bank accounts by month. */
export const cashInOut = (state: FinanceState, entries: LedgerEntry[], months = 6) => {
  const banks = new Set(state.accounts.filter((a) => a.bank).map((a) => a.code));
  return Array.from({ length: months }, (_, i) => {
    const key = periodOf(addMonths(TODAY, -(months - 1 - i)));
    const es = entries.filter((e) => banks.has(e.account) && periodOf(e.date) === key);
    return { key, label: new Date(key + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'short' }), inflow: round2(es.reduce((x, e) => x + e.debit, 0)), outflow: round2(es.reduce((x, e) => x + e.credit, 0)) };
  });
};

const CASHFLOW_CLASS = (a: Account): 'CASH' | 'OPERATING' | 'INVESTING' | 'FINANCING' | 'PL' => {
  if (a.bank) return 'CASH';
  if (a.type === 'INCOME' || a.type === 'EXPENSE') return 'PL';
  if (a.group === 'Fixed assets' && a.code !== '1590') return 'INVESTING';
  if (a.code === EXT.INVESTMENTS || a.code === EXT.IC_RECEIVABLE) return 'INVESTING';
  if (a.type === 'EQUITY' || a.group === 'Long-term liabilities') return 'FINANCING';
  return 'OPERATING';
};

/** Indirect-method cash flow statement for a date range. */
export const cashFlowStatement = (state: FinanceState, entries: LedgerEntry[], from: string, to: string) => {
  const pl = profitAndLoss(state, entries, from, to);
  const dep = round2(entries.filter((e) => e.account === '6800' && e.date >= from && e.date <= to).reduce((x, e) => x + e.debit - e.credit, 0));
  const change = (a: Account) => round2(entries.filter((e) => e.account === a.code && e.date >= from && e.date <= to && !e.closing).reduce((x, e) => x + e.debit - e.credit, 0));
  const lines = { OPERATING: [] as { label: string; amount: number }[], INVESTING: [] as { label: string; amount: number }[], FINANCING: [] as { label: string; amount: number }[] };
  let cashChange = 0;
  for (const a of state.accounts) {
    if (a.statistical) continue;
    const cls = CASHFLOW_CLASS(a);
    const ch = change(a);
    if (cls === 'CASH') {
      cashChange += ch;
      continue;
    }
    if (cls === 'PL' || Math.abs(ch) < 0.005) continue;
    // An increase in an asset uses cash; an increase in a liability or equity provides it
    const effect = round2(a.code === '1590' ? -ch - dep : -ch);
    if (Math.abs(effect) < 0.005) continue;
    lines[cls === 'INVESTING' || cls === 'FINANCING' ? cls : 'OPERATING'].push({ label: `${a.code} ${a.name}`, amount: effect });
  }
  const opTotal = round2(pl.netProfit + dep + lines.OPERATING.reduce((x, l) => x + l.amount, 0));
  const invTotal = round2(lines.INVESTING.reduce((x, l) => x + l.amount, 0));
  const finTotal = round2(lines.FINANCING.reduce((x, l) => x + l.amount, 0));
  return { netProfit: pl.netProfit, depreciation: dep, lines, opTotal, invTotal, finTotal, net: round2(opTotal + invTotal + finTotal), cashChange: round2(cashChange) };
};

/** Sources and applications of funds. */
export const fundsStatement = (state: FinanceState, entries: LedgerEntry[], from: string, to: string) => {
  const cf = cashFlowStatement(state, entries, from, to);
  const all = [{ label: 'Profit for the period', amount: cf.netProfit }, { label: 'Depreciation (non-cash)', amount: cf.depreciation }, ...cf.lines.OPERATING, ...cf.lines.INVESTING, ...cf.lines.FINANCING];
  const sources = all.filter((l) => l.amount > 0);
  const uses = all.filter((l) => l.amount < 0).map((l) => ({ ...l, amount: -l.amount }));
  return { sources, uses, totalSources: round2(sources.reduce((x, l) => x + l.amount, 0)), totalUses: round2(uses.reduce((x, l) => x + l.amount, 0)), cashChange: cf.cashChange };
};

/* ------------------------------------------------------------------ */
/* Ledger reports                                                      */
/* ------------------------------------------------------------------ */

export const detailedTrialBalance = (state: FinanceState, entries: LedgerEntry[], from: string, to: string) =>
  state.accounts
    .map((a) => {
      let open = 0;
      let dr = 0;
      let cr = 0;
      for (const e of entries) {
        if (e.account !== a.code || e.date > to) continue;
        if (e.date < from) open += e.debit - e.credit;
        else {
          dr += e.debit;
          cr += e.credit;
        }
      }
      return { account: a, opening: round2(open), debit: round2(dr), credit: round2(cr), closing: round2(open + dr - cr) };
    })
    .filter((r) => r.opening || r.debit || r.credit);

/** Balances by a dimension (cost centre, profit centre, department, project or plant). */
export const dimensionBalances = (state: FinanceState, entries: LedgerEntry[], dim: 'costCenter' | 'department' | 'project' | 'plant', from: string, to: string) => {
  const map = new Map<string, { income: number; expense: number }>();
  for (const e of entries) {
    if (e.date < from || e.date > to || e.closing) continue;
    const a = state.accounts.find((x) => x.code === e.account);
    if (!a || (a.type !== 'INCOME' && a.type !== 'EXPENSE')) continue;
    const key = e[dim] || '(unassigned)';
    const row = map.get(key) ?? { income: 0, expense: 0 };
    if (a.type === 'INCOME') row.income += e.credit - e.debit;
    else row.expense += e.debit - e.credit;
    map.set(key, row);
  }
  return [...map].map(([key, v]) => ({ key, income: round2(v.income), expense: round2(v.expense), result: round2(v.income - v.expense) })).sort((a, b) => a.key.localeCompare(b.key));
};

/** Profit and loss on a cash basis: income when received, costs when paid (VAT stripped), plus direct cash journals. */
export const cashBasisPL = (state: FinanceState, from: string, to: string) => {
  const by = new Map<string, number>();
  const add = (code: string, n: number) => by.set(code, round2((by.get(code) ?? 0) + n));
  for (const s of state.settlements) {
    if (s.status !== 'POSTED' || s.voided || s.date < from || s.date > to) continue;
    for (const al of s.allocations) {
      const d = state.documents.find((x) => x.id === al.docId);
      if (!d) continue;
      const t = docTotals(d);
      if (!t.total) continue;
      const share = (al.amount + (al.discount ?? 0)) / t.total;
      for (const l of d.lines) add(l.account, lineNet(l) * share * fxOf(d) * (d.kind === 'INVOICE' ? 1 : -1));
    }
  }
  const banks = new Set(state.accounts.filter((a) => a.bank).map((a) => a.code));
  for (const j of state.journals) {
    if (j.status !== 'POSTED' || j.date < from || j.date > to || !j.lines.some((l) => banks.has(l.account))) continue;
    for (const l of j.lines) {
      const a = state.accounts.find((x) => x.code === l.account);
      if (a?.type === 'INCOME' || a?.type === 'EXPENSE') add(l.account, l.credit - l.debit);
    }
  }
  const rows = [...by].map(([code, amt]) => ({ account: state.accounts.find((a) => a.code === code)!, amount: amt })).filter((r) => r.account && (r.account.type === 'INCOME' || r.account.type === 'EXPENSE') && Math.abs(r.amount) > 0.005);
  const income = round2(rows.filter((r) => r.account.type === 'INCOME').reduce((x, r) => x + r.amount, 0));
  const expense = round2(-rows.filter((r) => r.account.type === 'EXPENSE').reduce((x, r) => x + r.amount, 0));
  return { rows, income, expense, net: round2(income - expense) };
};

/** Sales commission by rep: 2% of invoiced net, reduced by credit notes issued to that rep's customers. */
export const commissionsDue = (state: FinanceState, from: string, to: string, rate = 0.02) => {
  const by = new Map<string, { sales: number; credits: number }>();
  const repOf = (partyId: string, own?: string) => own || state.parties.find((p) => p.id === partyId)?.salesRep || 'House account';
  for (const d of state.documents) {
    if (d.kind !== 'INVOICE' || d.status !== 'POSTED' || d.memoType || d.date < from || d.date > to) continue;
    const r = by.get(repOf(d.partyId, d.salesRep)) ?? { sales: 0, credits: 0 };
    r.sales += docTotals(d).net * fxOf(d);
    by.set(repOf(d.partyId, d.salesRep), r);
  }
  for (const m of state.memos) {
    if (m.side !== 'AR' || m.status !== 'POSTED' || m.date < from || m.date > to) continue;
    const r = by.get(repOf(m.partyId, m.salesRep)) ?? { sales: 0, credits: 0 };
    r.credits += docTotals(m).net * fxOf(m);
    by.set(repOf(m.partyId, m.salesRep), r);
  }
  return [...by].map(([rep, v]) => ({ rep, sales: round2(v.sales), credits: round2(v.credits), commission: round2((v.sales - v.credits) * rate) }));
};

/** ESG view of spend: energy, fuel, water and community spend with simple emission factors. */
export const esgReport = (state: FinanceState, entries: LedgerEntry[], from: string, to: string) =>
  state.accounts
    .filter((a) => a.esg)
    .map((a) => {
      const spend = balanceOf(entries, a, { from, to });
      return { account: a, category: a.esg!.category, spend, quantity: round2(spend * a.esg!.factor), unit: a.esg!.unit };
    });

/* ------------------------------------------------------------------ */
/* Report writer                                                       */
/* ------------------------------------------------------------------ */

const matches = (state: FinanceState, sel: string | undefined) => {
  if (!sel) return () => false;
  const parts = sel.split(',').map((x) => x.trim()).filter(Boolean);
  return (a: Account) =>
    parts.some((p) => {
      if (p.startsWith('group:')) return a.group.toLowerCase() === p.slice(6).toLowerCase();
      if (p.startsWith('type:')) return a.type === p.slice(5).toUpperCase();
      if (p.includes('-')) {
        const [lo, hi] = p.split('-');
        return a.code >= lo && a.code <= hi;
      }
      return a.code === p;
    }) && !!state;
};

/** Evaluates a report definition for one set of ledger entries (P&L accounts over the range, balance accounts at `to`). */
export const evaluateRows = (state: FinanceState, entries: LedgerEntry[], rows: ReportRow[], from: string, to: string) => {
  const values = new Map<string, number>();
  for (const r of rows) {
    if (r.kind === 'LINE') {
      const m = matches(state, r.accounts);
      const v = state.accounts
        .filter((a) => m(a) && !a.statistical)
        .reduce((x, a) => {
          const pl = a.type === 'INCOME' || a.type === 'EXPENSE';
          return x + entries.filter((e) => e.account === a.code && e.date <= to && (!pl || e.date >= from) && !e.closing).reduce((y, e) => y + e.debit - e.credit, 0);
        }, 0);
      values.set(r.id, round2(r.negate ? -v : v));
    } else if (r.kind === 'SUBTOTAL') {
      const v = (r.formula ?? '').split(',').map((x) => x.trim()).filter(Boolean).reduce((x, t) => (t.startsWith('-') ? x - (values.get(t.slice(1)) ?? 0) : x + (values.get(t) ?? 0)), 0);
      values.set(r.id, round2(v));
    }
  }
  return values;
};

export const budgetFor = (state: FinanceState, rows: ReportRow[], year: number, throughMonth: number) => {
  const values = new Map<string, number>();
  for (const r of rows) {
    if (r.kind === 'LINE') {
      const m = matches(state, r.accounts);
      const v = state.budgets
        .filter((b) => (b.year ?? state.budgetYear) === year)
        .filter((b) => {
          const a = state.accounts.find((x) => x.code === b.account);
          return a && m(a);
        })
        .reduce((x, b) => {
          const a = state.accounts.find((y) => y.code === b.account)!;
          const amt = b.monthly.slice(0, throughMonth + 1).reduce((s, n) => s + n, 0);
          // budgets are positive amounts; express in ledger sign (income credit = negative)
          return x + (a.type === 'INCOME' ? -amt : amt);
        }, 0);
      values.set(r.id, round2(r.negate ? -v : v));
    } else if (r.kind === 'SUBTOTAL') {
      values.set(r.id, round2((r.formula ?? '').split(',').map((x) => x.trim()).filter(Boolean).reduce((x, t) => (t.startsWith('-') ? x - (values.get(t.slice(1)) ?? 0) : x + (values.get(t) ?? 0)), 0)));
    }
  }
  return values;
};

/** Runs a definition: one value set per group (company, cost centre, department or plant) and per column. */
export const runReport = (full: FinanceState, active: FinanceState, def: ReportDefinition, from: string, to: string) => {
  const groups: { key: string; label: string; entries: LedgerEntry[] }[] = [];
  if (def.groupBy === 'COMPANY') for (const co of full.companies) groups.push({ key: co.id, label: co.code, entries: ledger(scope(full, co.id)) });
  else {
    const es = ledger(active);
    if (def.groupBy === 'NONE') groups.push({ key: 'all', label: 'Total', entries: es });
    else {
      const dim = def.groupBy === 'COST_CENTER' ? 'costCenter' : def.groupBy === 'DEPARTMENT' ? 'department' : 'plant';
      const keys = [...new Set(es.map((e) => e[dim] || '(none)'))].sort();
      for (const k of keys) groups.push({ key: k, label: k, entries: es.filter((e) => (e[dim] || '(none)') === k) });
    }
  }
  const py = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
  return groups.map((g) => ({
    ...g,
    actual: evaluateRows(active, g.entries, def.rows, from, to),
    prior: evaluateRows(active, g.entries, def.rows, py(from), py(to)),
    budget: g.key === 'all' || def.groupBy === 'COMPANY' ? budgetFor(active, def.rows, Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1) : new Map<string, number>()
  }));
};

/* ------------------------------------------------------------------ */
/* Group                                                               */
/* ------------------------------------------------------------------ */

/** Inter-company balances: what each company shows against each partner, and the difference to eliminate or investigate. */
export const intercompanyRecon = (full: FinanceState) => {
  const es = ledger(full);
  const out: { a: string; b: string; receivable: number; payable: number; difference: number }[] = [];
  for (const a of full.companies)
    for (const b of full.companies) {
      if (a.id >= b.id) continue;
      const bal = (co: string, partner: string, acct: string) => round2(es.filter((e) => companyOf(e) === co && e.partnerCompany === partner && e.account === acct).reduce((x, e) => x + e.debit - e.credit, 0));
      const recAB = bal(a.id, b.id, EXT.IC_RECEIVABLE) + bal(b.id, a.id, EXT.IC_RECEIVABLE);
      const payBA = -(bal(b.id, a.id, EXT.IC_PAYABLE) + bal(a.id, b.id, EXT.IC_PAYABLE));
      if (!recAB && !payBA) continue;
      out.push({ a: a.id, b: b.id, receivable: round2(recAB), payable: round2(payBA), difference: round2(recAB - payBA) });
    }
  return out;
};

/** Consolidated trial balance: every company's balances side by side, inter-company accounts eliminated. */
export const consolidate = (full: FinanceState, to = TODAY) => {
  const per = full.companies.map((co) => ({ co, entries: ledger(scope(full, co.id)).filter((e) => e.date <= to) }));
  const elim = new Set([EXT.IC_RECEIVABLE, EXT.IC_PAYABLE]);
  const rows = full.accounts
    .filter((a) => !a.statistical)
    .map((a) => {
      const by = per.map((p) => round2(p.entries.filter((e) => e.account === a.code).reduce((x, e) => x + e.debit - e.credit, 0)));
      const total = round2(by.reduce((x, n) => x + n, 0));
      const elimination = elim.has(a.code) ? -total : 0;
      return { account: a, by, total, elimination, consolidated: round2(total + elimination) };
    })
    .filter((r) => r.by.some((n) => Math.abs(n) > 0.005));
  const icDiff = round2(rows.filter((r) => elim.has(r.account.code)).reduce((x, r) => x + r.total, 0));
  return { companies: per.map((p) => p.co), rows, icDiff };
};
