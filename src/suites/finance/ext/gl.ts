import {
  addDays,
  balanceOf,
  companyOf,
  docBalance,
  EXT,
  fxOf,
  isForeign,
  iso,
  ledger,
  CONTROL,
  periodLabel,
  periodOf,
  profitAndLoss,
  rateOn,
  round2,
  scope,
  TODAY
} from '../engine';
import type {
  Account,
  ApprovalRule,
  CostCenter,
  CostObject,
  FinanceSettings,
  FinanceState,
  FiscalYear,
  Journal,
  JournalTemplate,
  InvoiceTemplate,
  Period,
  RateCard,
  ReasonCode,
  ReportDefinition,
  TaxCode
} from '../types';
import { buildJournal, finAudit, finNotify, hist, withJournals, type Ctx, type Result, type SystemJournalInput } from './ctx';

const nextMonthStart = (date: string) => {
  const d = new Date(date + 'T00:00:00');
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 1));
};

/** Account code mask: 9 = digit, A = letter, anything else must match literally. */
export const maskOk = (mask: string, code: string) =>
  mask.length === code.length && [...mask].every((m, i) => (m === '9' ? /\d/.test(code[i]) : m === 'A' ? /[A-Z]/i.test(code[i]) : m === code[i]));

/** General ledger, calendar, masters and group actions. */
export const glActions = (c: Ctx) => {
  const { ref, commit, fail, done, guard } = c;
  const actor = () => c.actor();
  const managerOnly = (what: string) => (actor().role === 'ACCOUNTANT' ? fail(`${what} needs a Finance Manager or Director`) : null);
  const directorOnly = (what: string) => (actor().role !== 'DIRECTOR' ? fail(`${what} is done by the Finance Director`) : null);

  /**
   * Posting API for other modules — Payroll, Inventory, Production, Maintenance and Procurement call this instead of
   * building finance journals themselves:
   *
   *   const r = finance.postSystemJournal({
   *     source: 'PAYROLL', origin: 'Payroll October 2026', date: '2026-10-25', memo: 'Payroll — October 2026',
   *     lines: [{ account: '6000', debit: 1_200_000, department: 'Operations' }, { account: '2150', credit: 200_000 }, …],
   *     status: 'POSTED'      // or 'SUBMITTED' to send it through Finance approval
   *   });
   *   // r = { ok: true, id, number } or { ok: false, error }
   *
   * Lines must balance, accounts must exist and the date must fall in an open period. The journal is tagged with its
   * source so the GL register, audit trail and reports can tell where it came from.
   */
  const postSystemJournal = (input: SystemJournalInput): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!input.memo?.trim()) return fail('Describe the posting');
    const r = buildJournal(c, s, { ...input, status: input.status ?? 'POSTED', origin: input.origin ?? input.source });
    if ('error' in r) return fail(r.error);
    commit(withJournals(s, [r.journal], r.sequence));
    finAudit(input.by ?? actor().name, `${input.status === 'SUBMITTED' ? 'Submitted' : 'Posted'} ${input.source.toLowerCase()} journal`, r.journal.number, input.memo);
    if (r.journal.status === 'SUBMITTED') finNotify('Finance Manager', `${r.journal.number} from ${input.origin ?? input.source} is waiting for approval`, r.journal.number);
    return { ok: true, id: r.journal.id, number: r.journal.number };
  };

  const setCompany = (id: string) => {
    const s = ref.current;
    if (!s.companies.some((x) => x.id === id)) return;
    commit({ ...s, activeCompany: id });
    c.info('Company switched', `${s.companies.find((x) => x.id === id)!.name} — documents, ledger and reports now show this company`);
  };

  /* ---------------- Chart of accounts ---------------- */
  const saveAccount = (a: Account, isNew: boolean): Result => {
    const g = guard() ?? managerOnly('Changing the chart of accounts');
    if (g) return g;
    const s = ref.current;
    const code = a.code.trim().toUpperCase();
    if (!maskOk(s.settings.accountMask, code)) return fail(`Account codes must follow the mask ${s.settings.accountMask} (9 = digit, A = letter)`);
    if (!a.name.trim()) return fail('Name the account');
    if (!a.group.trim()) return fail('Choose or type the account group');
    if (isNew && s.accounts.some((x) => x.code === code)) return fail(`Account ${code} already exists`);
    const before = s.accounts.find((x) => x.code === code);
    if (!isNew && before && before.type !== a.type && ledger(s).some((e) => e.account === code)) return fail('The account has postings — its type cannot change');
    const acc = { ...a, code, name: a.name.trim(), group: a.group.trim() };
    commit({ ...s, accounts: (isNew ? [...s.accounts, acc] : s.accounts.map((x) => (x.code === code ? acc : x))).sort((x, y) => x.code.localeCompare(y.code)) });
    finAudit(actor().name, isNew ? 'Account added' : 'Account changed', code, acc.name);
    return done(isNew ? 'Account added' : 'Account saved', `${code} · ${acc.name}`);
  };
  const setAccountActive = (code: string, active: boolean): Result => {
    const g = guard() ?? managerOnly('Changing the chart of accounts');
    if (g) return g;
    const s = ref.current;
    const a = s.accounts.find((x) => x.code === code);
    if (!a) return fail('Account not found');
    if (!active && (a.control || a.bank)) return fail('Control and bank accounts cannot be deactivated');
    if (!active) {
      const bal = round2(ledger(s).filter((e) => e.account === code).reduce((x, e) => x + e.debit - e.credit, 0));
      if (Math.abs(bal) > 0.005 && !a.statistical && a.type !== 'INCOME' && a.type !== 'EXPENSE') return fail(`${code} still has a balance of ${bal.toLocaleString()} — clear it first`);
    }
    commit({ ...s, accounts: s.accounts.map((x) => (x.code === code ? { ...x, active } : x)) });
    return done(active ? 'Account reactivated' : 'Account deactivated', `${code} · ${a.name}`);
  };

  /* ---------------- Fiscal calendar ---------------- */
  /** Creates a fiscal year: 12 calendar months, 4-4-5 weeks or 13 four-week periods, plus adjustment periods. */
  const createFiscalYear = (opts: { start: string; pattern: FiscalYear['pattern']; specialPeriods: number; name?: string }): Result => {
    const g = guard() ?? managerOnly('Opening a fiscal year');
    if (g) return g;
    const s = ref.current;
    const start = opts.start;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return fail('Choose the first day of the fiscal year');
    const startD = new Date(start + 'T00:00:00');
    const end = opts.pattern === 'MONTHLY' ? iso(new Date(startD.getFullYear() + 1, startD.getMonth(), startD.getDate() - 1)) : addDays(start, 364 - 1);
    const overlap = s.fiscalYears.find((f) => !(end < f.start || start > f.end));
    if (overlap) return fail(`${overlap.name} already covers part of those dates (${overlap.start} to ${overlap.end})`);
    const last = [...s.fiscalYears].sort((a, b) => a.end.localeCompare(b.end)).pop();
    if (last && start > addDays(last.end, 1)) return fail(`The new year must start on ${addDays(last.end, 1)} so there is no gap after ${last.name}`);
    if (opts.specialPeriods < 0 || opts.specialPeriods > 4) return fail('Use up to four adjustment periods');
    const id = `FY${start.slice(0, 4)}${start.slice(5, 7) !== '01' ? `-${String(Number(start.slice(2, 4)) + 1).padStart(2, '0')}` : ''}`;
    const name = opts.name?.trim() || (start.slice(5, 7) === '01' ? `FY ${start.slice(0, 4)}` : `FY ${start.slice(0, 4)}/${String(Number(start.slice(2, 4)) + 1).padStart(2, '0')}`);
    const periods: Period[] = [];
    if (opts.pattern === 'MONTHLY') {
      for (let m = 0; m < 12; m++) {
        const from = iso(new Date(startD.getFullYear(), startD.getMonth() + m, startD.getDate()));
        const to = iso(new Date(startD.getFullYear(), startD.getMonth() + m + 1, startD.getDate() - 1));
        const key = startD.getDate() === 1 ? from.slice(0, 7) : `${id}-P${String(m + 1).padStart(2, '0')}`;
        periods.push({ key, status: 'OPEN', checklist: {}, from, to, fiscalYear: id, label: startD.getDate() === 1 ? periodLabel(key, true) : `${name} P${m + 1}` });
      }
    } else {
      const weeks = opts.pattern === '13' ? Array(13).fill(4) : [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5];
      let from = start;
      weeks.forEach((w, i) => {
        const to = addDays(from, w * 7 - 1);
        periods.push({ key: `${id}-P${String(i + 1).padStart(2, '0')}`, status: 'OPEN', checklist: {}, from, to, fiscalYear: id, label: `${name} P${i + 1} (${w} weeks)` });
        from = addDays(to, 1);
      });
    }
    const endKey = periods[periods.length - 1].to!;
    for (let i = 0; i < opts.specialPeriods; i++)
      periods.push({ key: `${id}-A${13 + i}`, status: 'OPEN', checklist: {}, from: endKey, to: endKey, fiscalYear: id, special: true, label: `${name} adjustment period ${13 + i}` });
    const clash = periods.find((p) => s.periods.some((x) => x.key === p.key));
    if (clash) return fail(`Period ${clash.key} already exists`);
    const fy: FiscalYear = { id, name, start, end: periods[periods.length - 1].to!, pattern: opts.pattern, specialPeriods: opts.specialPeriods, status: 'OPEN', createdBy: actor().name };
    commit({ ...s, fiscalYears: [...s.fiscalYears, fy], periods: [...s.periods, ...periods] });
    finAudit(actor().name, 'Fiscal year opened', id, `${periods.length} periods`);
    return done('Fiscal year opened', `${name}: ${periods.length} periods from ${start}`);
  };

  /* ---------------- Reopen requests (workflow) ---------------- */
  const requestReopen = (key: string, reason: string): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const p = s.periods.find((x) => x.key === key);
    if (!p || p.status === 'OPEN') return fail('Only closed periods can be reopened');
    if (!reason.trim()) return fail('Explain why the period must be reopened');
    if (p.reopenRequests?.some((r) => r.status === 'PENDING')) return fail('A reopen request is already waiting for the Finance Director');
    const req = { id: c.uid('rr'), by: actor().name, at: c.now(), reason: reason.trim(), status: 'PENDING' as const };
    commit({ ...s, periods: s.periods.map((x) => (x.key === key ? { ...x, reopenRequests: [...(x.reopenRequests ?? []), req], history: [...(x.history ?? []), hist(c, 'Reopen requested', reason)] } : x)) });
    finNotify('Finance Director', `Request to reopen ${p.label ?? periodLabel(key, true)}`, key, reason, 'warning');
    return done('Reopen requested', `${p.label ?? periodLabel(key, true)} — waiting for the Finance Director`);
  };
  const decideReopen = (key: string, requestId: string, approve: boolean, note = ''): Result => {
    const g = guard() ?? directorOnly('Approving a reopen');
    if (g) return g;
    const s = ref.current;
    const p = s.periods.find((x) => x.key === key);
    const req = p?.reopenRequests?.find((r) => r.id === requestId);
    if (!p || !req || req.status !== 'PENDING') return fail('Request not found');
    if (req.by === actor().name) return fail('You raised this request — another person must approve it');
    if (approve) {
      const later = s.periods.find((x) => x.key > key && x.status === 'CLOSED' && !x.special && x.fiscalYear === p.fiscalYear);
      if (later) return fail(`Reopen ${later.label ?? periodLabel(later.key, true)} first`);
    }
    commit({
      ...s,
      periods: s.periods.map((x) =>
        x.key === key
          ? {
              ...x,
              status: approve ? 'OPEN' : x.status,
              closedBy: approve ? undefined : x.closedBy,
              closedAt: approve ? undefined : x.closedAt,
              reopenRequests: x.reopenRequests!.map((r) => (r.id === requestId ? { ...r, status: approve ? 'APPROVED' : 'REJECTED', decidedBy: actor().name, decidedAt: c.now() } : r)),
              history: [...(x.history ?? []), hist(c, approve ? 'Reopened (request approved)' : 'Reopen request declined', note || req.reason)]
            }
          : x
      )
    });
    finNotify(req.by, `Your request to reopen ${p.label ?? periodLabel(key, true)} was ${approve ? 'approved' : 'declined'}`, key, note);
    return done(approve ? 'Period reopened' : 'Request declined', p.label ?? periodLabel(key, true));
  };
  const setPeriodOwner = (key: string, owner: string, due: string): Result => {
    const g = guard() ?? managerOnly('Assigning close owners');
    if (g) return g;
    const s = ref.current;
    commit({ ...s, periods: s.periods.map((x) => (x.key === key ? { ...x, owner, due } : x)) });
    return done('Close owner set', `${owner} · due ${due}`);
  };

  /* ---------------- Accrual reversals, templates and year end ---------------- */
  /** Reverses every posted journal whose automatic reversal date has come (accruals, FX revaluations). */
  const runDueReversals = (asAt = TODAY): Result => {
    const g = guard() ?? managerOnly('Posting reversals');
    if (g) return g;
    let s = ref.current;
    const due = scope(s).journals.filter((j) => j.status === 'POSTED' && j.autoReverseOn && j.autoReverseOn <= asAt && !j.reversedBy);
    if (!due.length) {
      c.info('Nothing to reverse', 'No accruals are due for automatic reversal');
      return { ok: true };
    }
    const made: string[] = [];
    for (const j of due) {
      const r = buildJournal(c, s, {
        date: j.autoReverseOn!,
        memo: `Auto-reversal of ${j.number} — ${j.memo}`,
        source: 'REVERSAL',
        reversalOf: j.id,
        lines: j.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
        companyId: j.companyId,
        origin: 'Automatic accrual reversal'
      });
      if ('error' in r) return fail(`${j.number}: ${r.error}`);
      s = withJournals(s, [r.journal], r.sequence);
      s = { ...s, journals: s.journals.map((x) => (x.id === j.id ? { ...x, reversedBy: r.journal.id, followOn: [...(x.followOn ?? []), { kind: 'Auto-reversal', id: r.journal.id, number: r.journal.number }] } : x)) };
      made.push(r.journal.number);
    }
    commit(s);
    return done('Accruals reversed', `${made.length} reversal${made.length === 1 ? '' : 's'}: ${made.join(', ')}`);
  };

  const saveJournalTemplate = (t: JournalTemplate): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!t.name.trim()) return fail('Name the template');
    const money = t.lines.filter((l) => l.account && (l.debit || l.credit));
    const dr = round2(money.reduce((x, l) => x + (Number(l.debit) || 0), 0));
    const cr = round2(money.reduce((x, l) => x + (Number(l.credit) || 0), 0));
    if (money.length < 2 || Math.abs(dr - cr) > 0.005) return fail('Template lines must balance');
    if (t.frequency !== 'NONE' && !t.nextRun) return fail('Choose when the template next runs');
    const exists = s.journalTemplates.some((x) => x.id === t.id);
    const tpl = { ...t, id: t.id || c.uid('jt'), lines: money };
    commit({ ...s, journalTemplates: exists ? s.journalTemplates.map((x) => (x.id === t.id ? tpl : x)) : [...s.journalTemplates, tpl] });
    return done('Template saved', tpl.name);
  };
  /** Creates a draft journal from a template (recurring ones roll their next run date forward). */
  const runTemplate = (id: string, date?: string): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const t = s.journalTemplates.find((x) => x.id === id);
    if (!t) return fail('Template not found');
    const when = date ?? t.nextRun ?? TODAY;
    if (t.end && when > t.end) return fail(`${t.name} ended on ${t.end}`);
    const r = buildJournal(c, s, {
      date: when,
      memo: `${t.memo} — ${periodLabel(periodOf(when), true)}`,
      source: 'MANUAL',
      status: 'DRAFT',
      lines: t.lines,
      reasonCode: t.reasonCode,
      templateId: t.id,
      autoReverseOn: t.autoReverse ? nextMonthStart(when) : undefined
    });
    if ('error' in r) return fail(r.error);
    const step = t.frequency === 'MONTHLY' ? 1 : t.frequency === 'QUARTERLY' ? 3 : 0;
    const nextRun = step ? iso(new Date(new Date(when + 'T00:00:00').getFullYear(), new Date(when + 'T00:00:00').getMonth() + step + 1, 0)) : t.nextRun;
    commit({ ...withJournals(s, [r.journal], r.sequence), journalTemplates: s.journalTemplates.map((x) => (x.id === id ? { ...x, nextRun, generated: [...x.generated, r.journal.id] } : x)) });
    return done('Journal created from template', `${r.journal.number} saved as a draft${t.autoReverse ? ` · reverses on ${nextMonthStart(when)}` : ''}`, r.journal.id);
  };

  /** Closes income and expense into retained earnings in the year's adjustment period. Running it again replaces the earlier entry. */
  const yearEnd = (fyId: string): Result => {
    const g = guard() ?? managerOnly('Year-end processing');
    if (g) return g;
    let s = ref.current;
    const fy = s.fiscalYears.find((f) => f.id === fyId);
    if (!fy) return fail('Fiscal year not found');
    const adj = s.periods.find((p) => p.fiscalYear === fy.id && p.special && p.status !== 'CLOSED');
    const normal = s.periods.find((p) => p.fiscalYear === fy.id && !p.special && p.to === fy.end) ?? s.periods.find((p) => p.key === periodOf(fy.end));
    if (!adj && normal?.status === 'CLOSED') return fail(`${fy.name} has no open adjustment period — reopen one first`);
    const company = s.activeCompany;
    const prior = s.journals.filter((j) => j.source === 'YEAR_END' && j.status === 'POSTED' && !j.reversedBy && companyOf(j) === company && j.date === fy.end);
    // Re-run: reverse the earlier closing entries first so the result is the same however often it runs
    for (const j of prior) {
      const r = buildJournal(c, s, { date: fy.end, periodKey: adj?.key, memo: `Reverse earlier year-end close ${j.number}`, source: 'YEAR_END', lines: j.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })), reversalOf: j.id, companyId: company, origin: 'Year-end re-run' });
      if ('error' in r) return fail(r.error);
      s = withJournals(s, [r.journal], r.sequence);
      s = { ...s, journals: s.journals.map((x) => (x.id === j.id ? { ...x, reversedBy: r.journal.id } : x)) };
    }
    const v = scope(s, company);
    const entries = ledger(v);
    const pl = profitAndLoss(v, entries, fy.start, fy.end);
    const lines = [...pl.income, ...pl.cogs, ...pl.opex].map((r) => {
      const nat = r.account.type === 'INCOME';
      // Zero each account: income has a credit balance, expenses a debit balance
      return { account: r.account.code, description: `Close ${r.account.name}`, debit: nat ? (r.amount > 0 ? r.amount : 0) : r.amount < 0 ? -r.amount : 0, credit: nat ? (r.amount < 0 ? -r.amount : 0) : r.amount > 0 ? r.amount : 0 };
    });
    if (!lines.length) return fail('There is no profit or loss to close');
    const profit = pl.netProfit;
    lines.push({ account: '3100', description: profit >= 0 ? 'Profit for the year to retained earnings' : 'Loss for the year to retained earnings', debit: profit < 0 ? -profit : 0, credit: profit > 0 ? profit : 0 });
    const r = buildJournal(c, s, { date: fy.end, periodKey: adj?.key, memo: `Year-end close ${fy.name} — income and expenses to retained earnings`, source: 'YEAR_END', lines, companyId: company, origin: 'Year-end processing' });
    if ('error' in r) return fail(r.error);
    commit(withJournals(s, [r.journal], r.sequence));
    finAudit(actor().name, prior.length ? 'Year end re-run' : 'Year end run', fy.id, `Profit ${profit.toLocaleString()}`);
    return done(prior.length ? 'Year end re-run' : 'Year end processed', `${r.journal.number}: ${profit >= 0 ? 'profit' : 'loss'} of KES ${Math.abs(profit).toLocaleString()} closed to retained earnings${prior.length ? ` (replaced ${prior.map((p) => p.number).join(', ')})` : ''}`, r.journal.id);
  };

  /* ---------------- Cash journal ---------------- */
  const saveCashEntry = (e: { cashAccount: string; date: string; type: 'IN' | 'OUT'; offsetAccount: string; amount: number; payee: string; ref: string; description: string; costCenter?: string }): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!s.accounts.find((a) => a.code === e.cashAccount)?.bank) return fail('Choose a cash account');
    if (!e.offsetAccount) return fail('Choose what the cash was for');
    if (!(e.amount > 0)) return fail('Enter an amount above zero');
    if (!e.payee.trim()) return fail(e.type === 'OUT' ? 'Who was paid?' : 'Who paid the cash in?');
    if (s.accounts.find((a) => a.code === e.offsetAccount)?.control) return fail('Control accounts are posted through their sub-ledgers');
    if (e.type === 'OUT') {
      const v = scope(s);
      const acc = s.accounts.find((a) => a.code === e.cashAccount)!;
      const pending = v.journals.filter((j) => j.cash?.account === e.cashAccount && j.status !== 'POSTED' && j.status !== 'VOID' && j.status !== 'REJECTED' && j.cash.type === 'OUT').reduce((x, j) => x + j.lines[0].debit, 0);
      const bal = balanceOf(ledger(v), acc);
      if (e.amount > bal - pending + 0.005) return fail(`Only KES ${round2(bal - pending).toLocaleString()} is left in ${acc.name} (including vouchers in approval)`);
    }
    const lines =
      e.type === 'OUT'
        ? [
            { account: e.offsetAccount, description: e.description || e.payee, debit: e.amount, costCenter: e.costCenter },
            { account: e.cashAccount, description: `Paid to ${e.payee}`, credit: e.amount }
          ]
        : [
            { account: e.cashAccount, description: `Received from ${e.payee}`, debit: e.amount },
            { account: e.offsetAccount, description: e.description || e.payee, credit: e.amount, costCenter: e.costCenter }
          ];
    const r = buildJournal(c, s, { date: e.date, memo: `${e.type === 'OUT' ? 'Cash paid' : 'Cash received'} — ${e.description || e.payee}`, source: 'CASH', status: 'DRAFT', lines, cash: { account: e.cashAccount, type: e.type, payee: e.payee.trim(), ref: e.ref.trim() } });
    if ('error' in r) return fail(r.error);
    commit(withJournals(s, [r.journal], r.sequence));
    return done('Cash voucher saved', `${r.journal.number} — submit it for approval to post`, r.journal.id);
  };

  /* ---------------- Masters ---------------- */
  const saveReasonCode = (rc: ReasonCode): Result => {
    const g = guard() ?? managerOnly('Maintaining reason codes');
    if (g) return g;
    const s = ref.current;
    const code = rc.code.trim().toUpperCase();
    if (!code || !rc.label.trim()) return fail('Enter a code and a description');
    const exists = s.reasonCodes.some((x) => x.code === code);
    commit({ ...s, reasonCodes: exists ? s.reasonCodes.map((x) => (x.code === code ? { ...rc, code } : x)) : [...s.reasonCodes, { ...rc, code }] });
    return done('Reason code saved', `${code} — ${rc.label}`);
  };
  const saveTaxCode = (t: TaxCode): Result => {
    const g = guard() ?? managerOnly('Maintaining tax codes');
    if (g) return g;
    const s = ref.current;
    const code = t.code.trim().toUpperCase();
    if (!code || !t.name.trim()) return fail('Enter a code and a name');
    if (!t.rates.length || t.rates.some((r) => !(r.rate >= 0) || r.rate > 1 || !r.from)) return fail('Every rate needs a start date and a rate between 0% and 100%');
    if (!s.accounts.some((a) => a.code === t.account)) return fail('Choose the tax account');
    const exists = s.taxCodes.some((x) => x.code === code);
    const clean = { ...t, code, rates: [...t.rates].sort((a, b) => a.from.localeCompare(b.from)) };
    commit({ ...s, taxCodes: exists ? s.taxCodes.map((x) => (x.code === code ? clean : x)) : [...s.taxCodes, clean] });
    finAudit(actor().name, exists ? 'Tax code changed' : 'Tax code added', code);
    return done('Tax code saved', `${code} — ${t.name}`);
  };
  const addRate = (currency: string, date: string, rate: number): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!(rate > 0)) return fail('Enter a rate above zero');
    const cur = s.currencies.find((x) => x.code === currency);
    if (!cur) return fail('Currency not found');
    commit({ ...s, currencies: s.currencies.map((x) => (x.code === currency ? { ...x, rates: [...x.rates.filter((r) => r.date !== date), { date, rate }].sort((a, b) => a.date.localeCompare(b.date)) } : x)) });
    return done('Rate saved', `1 ${currency} = KES ${rate} from ${date}`);
  };
  const addCurrency = (code: string, name: string, symbol: string, rate: number): Result => {
    const g = guard() ?? managerOnly('Adding currencies');
    if (g) return g;
    const s = ref.current;
    const cc = code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cc)) return fail('Use the three-letter ISO code, e.g. TZS');
    if (s.currencies.some((x) => x.code === cc)) return fail(`${cc} already exists`);
    if (!(rate > 0)) return fail('Enter today’s rate');
    commit({ ...s, currencies: [...s.currencies, { code: cc, name: name.trim() || cc, symbol: symbol.trim() || cc, rates: [{ date: TODAY, rate }] }] });
    return done('Currency added', `${cc} at KES ${rate}`);
  };
  const saveCostCenter = (cc: CostCenter, isNew: boolean): Result => {
    const g = guard() ?? managerOnly('Maintaining cost centres');
    if (g) return g;
    const s = ref.current;
    const code = cc.code.trim().toUpperCase();
    if (!code || !cc.name.trim()) return fail('Enter a code and a name');
    if (isNew && s.costCenters.some((x) => x.code === code)) return fail(`${code} already exists`);
    if (cc.parent && cc.parent === code) return fail('A cost centre cannot be its own parent');
    const clean = { ...cc, code };
    commit({ ...s, costCenters: isNew ? [...s.costCenters, clean] : s.costCenters.map((x) => (x.code === code ? clean : x)) });
    return done('Cost centre saved', `${code} — ${cc.name}`);
  };
  const saveCostObject = (o: CostObject): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!o.code.trim() || !o.name.trim()) return fail('Enter a code and a name');
    if (s.costObjects.some((x) => x.code === o.code && x.id !== o.id)) return fail(`${o.code} already exists`);
    const exists = s.costObjects.some((x) => x.id === o.id);
    const clean = { ...o, id: o.id || c.uid('co'), companyId: o.companyId || s.activeCompany };
    commit({ ...s, costObjects: exists ? s.costObjects.map((x) => (x.id === o.id ? clean : x)) : [...s.costObjects, clean] });
    return done('Saved', `${o.code} — ${o.name}`);
  };
  const saveApprovalRule = (r: ApprovalRule): Result => {
    const g = guard() ?? directorOnly('Changing approval levels');
    if (g) return g;
    const s = ref.current;
    if (!(r.directorAbove > 0)) return fail('Enter the amount above which the Director must approve');
    const exists = s.approvalRules.some((x) => x.id === r.id);
    const clean = { ...r, id: r.id || c.uid('ar'), department: r.department || undefined };
    commit({ ...s, approvalRules: exists ? s.approvalRules.map((x) => (x.id === r.id ? clean : x)) : [...s.approvalRules, clean] });
    finAudit(actor().name, 'Approval rule saved', clean.docType, `${clean.department ?? 'all departments'} · director above ${clean.directorAbove.toLocaleString()}`);
    return done('Approval rule saved', `${clean.docType}${clean.department ? ` · ${clean.department}` : ''}: Director above ${clean.directorAbove.toLocaleString()}`);
  };
  const deleteApprovalRule = (id: string): Result => {
    const g = guard() ?? directorOnly('Changing approval levels');
    if (g) return g;
    const s = ref.current;
    const r = s.approvalRules.find((x) => x.id === id);
    if (r?.docType === 'ANY' && !r.department) return fail('The default rule cannot be removed');
    commit({ ...s, approvalRules: s.approvalRules.filter((x) => x.id !== id) });
    return done('Rule removed', '');
  };
  const updateSettings = (patch: Partial<FinanceSettings>): Result => {
    const g = guard() ?? managerOnly('Changing finance settings');
    if (g) return g;
    const s = ref.current;
    if (patch.accountMask !== undefined && !/^[9A\-. ]+$/.test(patch.accountMask)) return fail('The mask may only contain 9, A and separators (- . space)');
    if (patch.eclRates && patch.eclRates.some((r) => r < 0 || r > 1)) return fail('Loss rates must be between 0% and 100%');
    commit({ ...s, settings: { ...s.settings, ...patch } });
    finAudit(actor().name, 'Finance settings changed', Object.keys(patch).join(', '));
    return done('Settings saved', Object.keys(patch).join(', '));
  };
  const saveRateCard = (r: RateCard): Result => {
    const g = guard() ?? managerOnly('Maintaining rate cards');
    if (g) return g;
    const s = ref.current;
    if (!r.name.trim() || !(r.rate > 0)) return fail('Enter the service and its rate');
    if (!s.accounts.some((a) => a.code === r.account && a.type === 'INCOME')) return fail('Choose an income account');
    const exists = s.rateCards.some((x) => x.id === r.id);
    const clean = { ...r, id: r.id || c.uid('rt') };
    commit({ ...s, rateCards: exists ? s.rateCards.map((x) => (x.id === r.id ? clean : x)) : [...s.rateCards, clean] });
    return done('Rate card saved', `${clean.name}: ${clean.rate.toLocaleString()} per ${clean.unit.toLowerCase()}`);
  };
  const saveInvoiceTemplate = (t: InvoiceTemplate): Result => {
    const g = guard() ?? managerOnly('Maintaining invoice layouts');
    if (g) return g;
    const s = ref.current;
    if (!t.name.trim()) return fail('Name the layout');
    const exists = s.invoiceTemplates.some((x) => x.id === t.id);
    const clean = { ...t, id: t.id || c.uid('tpl') };
    commit({ ...s, invoiceTemplates: exists ? s.invoiceTemplates.map((x) => (x.id === t.id ? clean : x)) : [...s.invoiceTemplates, clean] });
    return done('Layout saved', clean.name);
  };
  const saveReportDef = (d: ReportDefinition): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!d.name.trim()) return fail('Name the report');
    if (!d.rows.length) return fail('Add at least one row');
    const ids = new Set(d.rows.map((r) => r.id));
    for (const r of d.rows) {
      if (r.kind === 'LINE' && !r.accounts?.trim()) return fail(`Row "${r.label}" needs an account selection`);
      if (r.kind === 'SUBTOTAL') {
        const refs = (r.formula ?? '').split(',').map((x) => x.trim().replace(/^-/, '')).filter(Boolean);
        if (!refs.length) return fail(`Subtotal "${r.label}" needs a formula, e.g. r1,-r2`);
        const bad = refs.find((x) => !ids.has(x) || x === r.id);
        if (bad) return fail(`Subtotal "${r.label}" refers to unknown row ${bad}`);
      }
    }
    const exists = s.reportDefs.some((x) => x.id === d.id);
    const clean = { ...d, id: d.id || c.uid('rd'), owner: d.owner || actor().name };
    commit({ ...s, reportDefs: exists ? s.reportDefs.map((x) => (x.id === d.id ? clean : x)) : [...s.reportDefs, clean] });
    return done('Report saved', clean.name, clean.id);
  };
  const deleteReportDef = (id: string): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    commit({ ...s, reportDefs: s.reportDefs.filter((x) => x.id !== id) });
    return done('Report deleted', '');
  };

  /* ---------------- FX revaluation ---------------- */
  /** Revalues open foreign-currency invoices, bills and bank balances at the closing rate; reverses on the next day. */
  const fxRevaluation = (asAt: string): Result => {
    const g = guard() ?? managerOnly('FX revaluation');
    if (g) return g;
    const s = ref.current;
    const v = scope(s);
    const lines: SystemJournalInput['lines'] = [];
    let net = 0;
    for (const d of v.documents) {
      if (d.status !== 'POSTED' || !isForeign(d) || d.date > asAt) continue;
      const bal = docBalance(v, d);
      if (bal <= 0.005) continue;
      const diff = round2(bal * (rateOn(s, d.currency, asAt) - fxOf(d)));
      if (Math.abs(diff) < 0.01) continue;
      const ar = d.kind === 'INVOICE';
      const account = ar ? CONTROL.AR : CONTROL.AP;
      // AR gains when the rate rises; AP loses
      const gain = ar ? diff : -diff;
      lines.push(
        ar
          ? { account, description: `${d.number} ${d.currency} ${bal.toLocaleString()} @ ${rateOn(s, d.currency, asAt)}`, debit: diff > 0 ? diff : 0, credit: diff < 0 ? -diff : 0 }
          : { account, description: `${d.number} ${d.currency} ${bal.toLocaleString()} @ ${rateOn(s, d.currency, asAt)}`, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0 }
      );
      net = round2(net + gain);
    }
    const entries = ledger(v);
    for (const a of v.accounts.filter((x) => x.bank && x.currency)) {
      const fc = round2(entries.filter((e) => e.account === a.code && e.date <= asAt).reduce((x, e) => x + (e.fxAmount ?? 0), 0));
      if (!fc) continue;
      const book = round2(entries.filter((e) => e.account === a.code && e.date <= asAt).reduce((x, e) => x + e.debit - e.credit, 0));
      const diff = round2(fc * rateOn(s, a.currency, asAt) - book);
      if (Math.abs(diff) < 0.01) continue;
      lines.push({ account: a.code, description: `${a.currency} ${fc.toLocaleString()} @ ${rateOn(s, a.currency, asAt)}`, debit: diff > 0 ? diff : 0, credit: diff < 0 ? -diff : 0 });
      net = round2(net + diff);
    }
    if (!lines.length) return fail('No open foreign-currency balances to revalue');
    lines.push({ account: EXT.FX_GAIN, description: net >= 0 ? 'Unrealised exchange gain' : 'Unrealised exchange loss', debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0 });
    const r = buildJournal(c, s, { date: asAt, memo: `FX revaluation at ${asAt}`, source: 'FX', lines, autoReverseOn: addDays(asAt, 1), origin: 'FX revaluation' });
    if ('error' in r) return fail(r.error);
    commit(withJournals(s, [r.journal], r.sequence));
    return done('FX revaluation posted', `${r.journal.number}: unrealised ${net >= 0 ? 'gain' : 'loss'} KES ${Math.abs(net).toLocaleString()} · reverses ${addDays(asAt, 1)}`, r.journal.id);
  };

  /* ---------------- Inter-company ---------------- */
  /**
   * Inter-company transfers with automatic GL in both companies:
   * CASH (funding), INVENTORY (WIP or finished goods at cost) or PAYABLE (the other company takes over a supplier bill).
   */
  const intercompanyTransfer = (t: { kind: 'CASH' | 'INVENTORY' | 'PAYABLE'; toCompany: string; amount: number; date: string; description: string; account?: string; billId?: string }): Result => {
    const g = guard() ?? managerOnly('Inter-company transfers');
    if (g) return g;
    let s = ref.current;
    const from = s.activeCompany;
    if (!t.toCompany || t.toCompany === from) return fail('Choose the other company');
    if (!t.description.trim()) return fail('Describe the transfer');
    const to = s.companies.find((x) => x.id === t.toCompany)!;
    const fromCo = s.companies.find((x) => x.id === from)!;
    let amount = round2(t.amount);
    let senderLines: SystemJournalInput['lines'] = [];
    let receiverLines: SystemJournalInput['lines'] = [];
    if (t.kind === 'PAYABLE') {
      const bill = s.documents.find((d) => d.id === t.billId);
      if (!bill || bill.kind !== 'BILL' || bill.status !== 'POSTED' || companyOf(bill) !== from) return fail('Choose a posted bill of this company');
      if (isForeign(bill)) return fail('Transfer foreign-currency bills after settling the exchange difference');
      amount = docBalance(s, bill);
      if (amount <= 0.005) return fail(`${bill.number} is already settled`);
      senderLines = [
        { account: CONTROL.AP, description: `${bill.number} taken over by ${to.code}`, debit: amount },
        { account: EXT.IC_PAYABLE, description: `Owed to ${to.code} for ${bill.number}`, credit: amount, partnerCompany: to.id }
      ];
      const party = s.parties.find((p) => p.id === bill.partyId)!;
      const { number, sequence } = c.nextNumber(s, 'BILL', t.date);
      const newBill = {
        ...bill,
        id: c.uid('bill'),
        number,
        date: t.date,
        companyId: to.id,
        lines: [{ id: c.uid('l'), description: `Taken over from ${fromCo.code}: ${bill.number} ${bill.reference}`, account: EXT.IC_RECEIVABLE, qty: 1, price: amount, vat: false, taxCode: 'E0', taxRate: 0 }],
        history: [hist(c, `Transferred from ${fromCo.name} (${bill.number})`)],
        approvals: [{ by: actor().name, role: actor().role, at: c.now() }],
        status: 'POSTED' as const,
        relatesTo: bill.id,
        notes: `Inter-company transfer of payable to ${party.name}`
      };
      s = { ...s, sequence, documents: [newBill, ...s.documents] };
      // The original bill is settled by the transfer
      s = { ...s, applications: [...s.applications, { id: c.uid('ap'), kind: 'TRANSFER', sourceId: newBill.id, docId: bill.id, amount, date: t.date, journalId: '', by: actor().name }] };
      receiverLines = [];
    } else {
      if (!(amount > 0)) return fail('Enter an amount above zero');
      const asset = t.kind === 'CASH' ? '1000' : t.account || '1200';
      if (t.kind === 'INVENTORY' && !['1200', '1220'].includes(asset)) return fail('Transfer finished goods (1200) or work in progress (1220)');
      senderLines = [
        { account: EXT.IC_RECEIVABLE, description: `${t.description} — due from ${to.code}`, debit: amount, partnerCompany: to.id },
        { account: asset, description: t.description, credit: amount }
      ];
      receiverLines = [
        { account: asset, description: t.description, debit: amount },
        { account: EXT.IC_PAYABLE, description: `${t.description} — due to ${fromCo.code}`, credit: amount, partnerCompany: from }
      ];
    }
    const a = buildJournal(c, s, { date: t.date, memo: `Inter-company ${t.kind.toLowerCase()} to ${to.name}: ${t.description}`, source: 'INTERCOMPANY', lines: senderLines, companyId: from, origin: 'Inter-company' });
    if ('error' in a) return fail(a.error);
    s = withJournals(s, [a.journal], a.sequence);
    if (receiverLines.length) {
      const b = buildJournal(c, s, { date: t.date, memo: `Inter-company ${t.kind.toLowerCase()} from ${fromCo.name}: ${t.description}`, source: 'INTERCOMPANY', lines: receiverLines, companyId: to.id, origin: 'Inter-company' });
      if ('error' in b) return fail(`${to.code}: ${b.error}`);
      s = withJournals(s, [b.journal], b.sequence);
    }
    if (t.kind === 'PAYABLE') s = { ...s, applications: s.applications.map((x, i, arr) => (i === arr.length - 1 ? { ...x, journalId: a.journal.id } : x)) };
    commit(s);
    finNotify(to.closeOwner, `Inter-company ${t.kind.toLowerCase()} of KES ${amount.toLocaleString()} from ${fromCo.code}`, a.journal.number);
    return done('Inter-company transfer posted', `${fromCo.code} → ${to.code}: KES ${amount.toLocaleString()} (${a.journal.number})`, a.journal.id);
  };

  /* ---------------- Cost allocations and activity-based costing ---------------- */
  const runAllocation = (ruleId: string, period: string): Result => {
    const g = guard() ?? managerOnly('Running allocations');
    if (g) return g;
    const s = ref.current;
    const rule = s.allocationRules.find((r) => r.id === ruleId);
    if (!rule) return fail('Rule not found');
    const total = round2(rule.targets.reduce((x, t) => x + t.pct, 0));
    if (Math.abs(total - 100) > 0.01) return fail(`Target percentages add up to ${total}% — they must total 100%`);
    if (s.journals.some((j) => j.source === 'ALLOCATION' && j.status === 'POSTED' && !j.reversedBy && j.origin === `${rule.id}:${period}` && companyOf(j) === s.activeCompany))
      return fail(`${rule.name} has already run for ${periodLabel(period, true)}`);
    const v = scope(s);
    const amount = round2(ledger(v).filter((e) => e.account === rule.sourceAccount && periodOf(e.date) === period && (!rule.sourceCostCenter || e.costCenter === rule.sourceCostCenter) && e.source !== 'Cost allocation').reduce((x, e) => x + e.debit - e.credit, 0));
    if (amount <= 0) return fail(`Nothing posted to ${rule.sourceAccount} in ${periodLabel(period, true)}`);
    const lines: SystemJournalInput['lines'] = [{ account: rule.sourceAccount, description: `Allocate ${rule.name}`, credit: amount, costCenter: rule.sourceCostCenter }];
    let left = amount;
    rule.targets.forEach((t, i) => {
      const part = i === rule.targets.length - 1 ? left : round2((amount * t.pct) / 100);
      left = round2(left - part);
      lines.push({ account: t.account, description: `${t.pct}% of ${rule.name}`, debit: part, costCenter: t.costCenter });
    });
    const [y, m] = period.split('-').map(Number);
    const r = buildJournal(c, s, { date: iso(new Date(y, m, 0)), memo: `Allocation: ${rule.name} — ${periodLabel(period, true)}`, source: 'ALLOCATION', lines, origin: `${rule.id}:${period}` });
    if ('error' in r) return fail(r.error);
    commit({ ...withJournals(s, [r.journal], r.sequence), allocationRules: s.allocationRules.map((x) => (x.id === ruleId ? { ...x, lastRun: period } : x)) });
    return done('Allocation posted', `${r.journal.number}: KES ${amount.toLocaleString()} spread over ${rule.targets.length} cost centres`, r.journal.id);
  };
  const saveAllocationRule = (rule: FinanceState['allocationRules'][number]): Result => {
    const g = guard() ?? managerOnly('Maintaining allocation rules');
    if (g) return g;
    const s = ref.current;
    if (!rule.name.trim() || !rule.sourceAccount) return fail('Name the rule and choose the source account');
    const total = round2(rule.targets.reduce((x, t) => x + t.pct, 0));
    if (Math.abs(total - 100) > 0.01) return fail(`Percentages add up to ${total}% — they must total 100%`);
    if (rule.targets.some((t) => !t.costCenter || !t.account)) return fail('Every target needs a cost centre and an account');
    const exists = s.allocationRules.some((x) => x.id === rule.id);
    const clean = { ...rule, id: rule.id || c.uid('al') };
    commit({ ...s, allocationRules: exists ? s.allocationRules.map((x) => (x.id === rule.id ? clean : x)) : [...s.allocationRules, clean] });
    return done('Allocation rule saved', clean.name);
  };
  /** Activity-based costing: spreads an activity's cost pool over cost centres by the driver quantities they used. */
  const runAbc = (activityId: string, period: string): Result => {
    const g = guard() ?? managerOnly('Activity-based costing');
    if (g) return g;
    const s = ref.current;
    const act = s.activities.find((a) => a.id === activityId);
    if (!act) return fail('Activity not found');
    const units = Object.values(act.usage).reduce((x, n) => x + n, 0);
    if (!units) return fail('Enter how much of the driver each cost centre used');
    if (s.journals.some((j) => j.status === 'POSTED' && !j.reversedBy && j.origin === `abc:${act.id}:${period}` && companyOf(j) === s.activeCompany)) return fail(`${act.name} has already been costed for ${periodLabel(period, true)}`);
    const v = scope(s);
    const pool = round2(ledger(v).filter((e) => e.account === act.pool && periodOf(e.date) === period && e.source !== 'Cost allocation').reduce((x, e) => x + e.debit - e.credit, 0));
    if (pool <= 0) return fail(`No cost in pool ${act.pool} for ${periodLabel(period, true)}`);
    const rate = pool / units;
    const lines: SystemJournalInput['lines'] = [{ account: act.pool, description: `${act.name} pool`, credit: pool }];
    let left = pool;
    const ccs = Object.entries(act.usage);
    ccs.forEach(([cc, q], i) => {
      const part = i === ccs.length - 1 ? left : round2(q * rate);
      left = round2(left - part);
      lines.push({ account: act.pool, description: `${q} ${act.driver} × ${rate.toFixed(2)}`, debit: part, costCenter: cc });
    });
    const [y, m] = period.split('-').map(Number);
    const r = buildJournal(c, s, { date: iso(new Date(y, m, 0)), memo: `Activity-based costing: ${act.name} — ${periodLabel(period, true)}`, source: 'ALLOCATION', lines, origin: `abc:${act.id}:${period}` });
    if ('error' in r) return fail(r.error);
    commit(withJournals(s, [r.journal], r.sequence));
    return done('Activity costs allocated', `${r.journal.number}: KES ${pool.toLocaleString()} at ${rate.toFixed(2)} per ${act.driver}`, r.journal.id);
  };
  const saveActivity = (a: FinanceState['activities'][number]): Result => {
    const g = guard() ?? managerOnly('Maintaining activities');
    if (g) return g;
    const s = ref.current;
    if (!a.name.trim() || !a.pool || !a.driver.trim()) return fail('Enter the activity, its cost pool account and its driver');
    const exists = s.activities.some((x) => x.id === a.id);
    const clean = { ...a, id: a.id || c.uid('ab') };
    commit({ ...s, activities: exists ? s.activities.map((x) => (x.id === a.id ? clean : x)) : [...s.activities, clean] });
    return done('Activity saved', clean.name);
  };

  const touchJournal = (id: string, patch: Partial<Journal>) => {
    const s = ref.current;
    commit({ ...s, journals: s.journals.map((j) => (j.id === id ? { ...j, ...patch } : j)) });
  };

  return {
    postSystemJournal,
    setCompany,
    saveAccount,
    setAccountActive,
    createFiscalYear,
    requestReopen,
    decideReopen,
    setPeriodOwner,
    runDueReversals,
    saveJournalTemplate,
    runTemplate,
    yearEnd,
    saveCashEntry,
    saveReasonCode,
    saveTaxCode,
    addRate,
    addCurrency,
    saveCostCenter,
    saveCostObject,
    saveApprovalRule,
    deleteApprovalRule,
    updateSettings,
    saveReportDef,
    deleteReportDef,
    saveRateCard,
    saveInvoiceTemplate,
    fxRevaluation,
    intercompanyTransfer,
    runAllocation,
    saveAllocationRule,
    runAbc,
    saveActivity,
    touchJournal
  };
};
