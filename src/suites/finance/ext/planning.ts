import {
  accumulatedDepreciation,
  addDays,
  ageing,
  balanceOf,
  budgetLinesFor,
  carryingAmount,
  companyOf,
  CONTROL,
  daysBetween,
  EXT,
  iso,
  ledger,
  periodLabel,
  periodOf,
  profitAndLoss,
  round2,
  scope,
  TODAY
} from '../engine';
import type { BudgetChange, BudgetLine, CostObject, FinanceState, FixedAsset, LedgerEntry, StrategicObjective, TaxFiling, TreasuryInstrument } from '../types';
import { buildJournal, finAudit, finNotify, hist, withJournals, type Ctx, type Result, type SystemJournalInput } from './ctx';

const monthEndOf = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return iso(new Date(y, m, 0));
};
const accountBalance = (entries: LedgerEntry[], code: string, to = '9999-12-31') => round2(entries.filter((e) => e.account === code && e.date <= to).reduce((x, e) => x + e.debit - e.credit, 0));

/** Seasonal profile for tea: flush months (Mar–May, Oct–Dec) carry more of the year. */
export const SPREAD_PROFILES: Record<string, number[]> = {
  EVEN: Array(12).fill(1 / 12),
  TEA_SEASON: [0.07, 0.07, 0.09, 0.1, 0.1, 0.08, 0.07, 0.07, 0.08, 0.09, 0.09, 0.09],
  Q4_HEAVY: [0.07, 0.07, 0.07, 0.08, 0.08, 0.08, 0.08, 0.08, 0.09, 0.1, 0.1, 0.1]
};

/** Expected credit loss allowance needed by ageing bucket (provision matrix). */
export const eclRequired = (state: FinanceState, asAt = TODAY) => {
  const buckets = ageing(state, 'INVOICE', asAt).totals;
  const rates = state.settings.eclRates;
  const lines = buckets.map((b, i) => ({ bucket: i, balance: round2(b), rate: rates[i] ?? 0, allowance: round2(b * (rates[i] ?? 0)) }));
  return { lines, total: round2(lines.reduce((x, l) => x + l.allowance, 0)) };
};

/** Tax a filing covers: payable accounts and the matching recoverable account. */
export const TAX_FILING_ACCOUNTS: Record<string, { label: string; payable: string; recoverable?: string; dueDay: number }> = {
  V16: { label: 'VAT (VAT3 return)', payable: CONTROL.VAT_OUT, recoverable: CONTROL.VAT_IN, dueDay: 20 },
  WHT: { label: 'Withholding tax', payable: EXT.WHT_PAYABLE, dueDay: 20 },
  TL1: { label: 'Tea levy (Tea Board)', payable: '2120', dueDay: 20 },
  PAYE: { label: 'PAYE (P10)', payable: '2150', dueDay: 9 },
  NSSF: { label: 'NSSF, SHIF & housing levy', payable: '2160', dueDay: 9 },
  CIT: { label: 'Corporation tax instalment', payable: EXT.TAX_PAYABLE, dueDay: 20 }
};

/** Budgets, fixed assets, treasury, provisions, costing and tax. */
export const planningActions = (c: Ctx) => {
  const { ref, commit, fail, done, guard } = c;
  const actor = () => c.actor();
  const managerOnly = (what: string) => (actor().role === 'ACCOUNTANT' ? fail(`${what} needs a Finance Manager or Director`) : null);
  const directorOnly = (what: string) => (actor().role !== 'DIRECTOR' ? fail(`${what} is done by the Finance Director`) : null);
  const post = (s: FinanceState, input: SystemJournalInput, after?: (next: FinanceState, journalId: string, number: string) => FinanceState): Result => {
    const r = buildJournal(c, s, input);
    if ('error' in r) return fail(r.error);
    let next = withJournals(s, [r.journal], r.sequence);
    if (after) next = after(next, r.journal.id, r.journal.number);
    commit(next);
    finAudit(actor().name, input.memo, r.journal.number);
    return { ok: true, id: r.journal.id, number: r.journal.number };
  };

  /* ---------------- Budgets ---------------- */
  const saveBudgetLine = (line: BudgetLine): Result => {
    const g = guard() ?? managerOnly('Budgets');
    if (g) return g;
    const s = ref.current;
    if (!s.accounts.some((a) => a.code === line.account)) return fail('Choose an account');
    if (line.monthly.length !== 12 || line.monthly.some((m) => !(m >= 0))) return fail('Enter twelve amounts of zero or more');
    const y = line.year ?? s.budgetYear;
    const ex = s.budgets.find((b) => b.account === line.account && (b.year ?? s.budgetYear) === y && b.department === line.department);
    if (ex?.status === 'APPROVED' && actor().role !== 'DIRECTOR') return fail('This budget is approved — raise a supplementary budget or reallocation instead');
    const clean = { ...line, year: y, status: ex?.status ?? 'DRAFT', version: line.version ?? ex?.version ?? 'Draft' };
    commit({ ...s, budgets: ex ? s.budgets.map((b) => (b === ex ? clean : b)) : [...s.budgets, clean] });
    finAudit(actor().name, 'Budget line saved', `${line.account} ${y}`, `Annual ${line.monthly.reduce((x, m) => x + m, 0).toLocaleString()}`);
    return done('Budget saved', `${line.account} · ${y}`);
  };
  /** Spreads an annual amount over the months with a profile. */
  const spreadBudget = (account: string, department: string, year: number, annual: number, profile: keyof typeof SPREAD_PROFILES | 'LAST_YEAR'): Result => {
    const s = ref.current;
    if (!(annual >= 0)) return fail('Enter the annual amount');
    let weights = SPREAD_PROFILES[profile as string];
    if (profile === 'LAST_YEAR') {
      const ly = budgetLinesFor(s, year - 1).find((b) => b.account === account);
      const tot = ly?.monthly.reduce((x, m) => x + m, 0) ?? 0;
      if (!ly || !tot) return fail(`There is no ${year - 1} budget for ${account} to copy the pattern from`);
      weights = ly.monthly.map((m) => m / tot);
    }
    const monthly = weights.map((w) => Math.round(annual * w));
    monthly[11] += annual - monthly.reduce((x, m) => x + m, 0);
    return saveBudgetLine({ account, department, year, monthly });
  };
  /** Next year's draft budget from this year's, with an uplift (e.g. inflation). */
  const copyBudget = (fromYear: number, toYear: number, upliftPct: number): Result => {
    const g = guard() ?? managerOnly('Preparing a budget');
    if (g) return g;
    const s = ref.current;
    const src = budgetLinesFor(s, fromYear);
    if (!src.length) return fail(`There is no ${fromYear} budget`);
    if (budgetLinesFor(s, toYear).length) return fail(`${toYear} already has a budget — edit its lines instead`);
    const f = 1 + upliftPct / 100;
    const lines: BudgetLine[] = src.map((b) => ({ ...b, year: toYear, status: 'DRAFT', version: 'Draft', monthly: b.monthly.map((m) => Math.round((m * f) / 100) * 100) }));
    commit({ ...s, budgets: [...s.budgets, ...lines] });
    return done('Budget prepared', `${lines.length} lines for ${toYear} copied from ${fromYear} with ${upliftPct}% uplift`);
  };
  const approveBudget = (year: number): Result => {
    const g = guard() ?? directorOnly('Approving the budget');
    if (g) return g;
    const s = ref.current;
    const lines = budgetLinesFor(s, year).filter((b) => b.status !== 'APPROVED');
    if (!lines.length) return fail(`Nothing in ${year} is waiting for approval`);
    const set = new Set(lines);
    commit({ ...s, budgets: s.budgets.map((b) => (set.has(b) ? { ...b, status: 'APPROVED', version: 'Approved' } : b)) });
    finNotify('Budget holders', `The ${year} budget was approved`, String(year));
    return done('Budget approved', `${lines.length} lines approved for ${year}`);
  };
  const requestBudgetChange = (bc: Pick<BudgetChange, 'type' | 'year' | 'fromAccount' | 'toAccount' | 'month' | 'amount' | 'reason'>): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!(bc.amount > 0)) return fail('Enter the amount');
    if (!bc.reason.trim()) return fail('Give the reason');
    const lines = budgetLinesFor(s, bc.year);
    if (!lines.some((b) => b.account === bc.toAccount)) return fail(`${bc.toAccount} has no ${bc.year} budget line`);
    if (bc.type === 'REALLOCATION') {
      const from = lines.find((b) => b.account === bc.fromAccount);
      if (!from) return fail('Choose the budget line to move money from');
      if (from.account === bc.toAccount) return fail('Choose two different lines');
      if (from.monthly[bc.month] < bc.amount) return fail(`${from.account} only has ${from.monthly[bc.month].toLocaleString()} in that month`);
    }
    const { number, sequence } = c.nextNumber(s, 'BC', TODAY);
    const rec: BudgetChange = { ...bc, id: c.uid('bc'), number, date: TODAY, status: 'SUBMITTED', preparedBy: actor().name, approvals: [], history: [hist(c, 'Requested', bc.reason)] };
    commit({ ...s, sequence, budgetChanges: [rec, ...s.budgetChanges] });
    finNotify('Finance Manager', `${number}: ${bc.type.toLowerCase()} budget of ${bc.amount.toLocaleString()} waiting for approval`, number);
    return done('Budget change requested', `${number} sent for approval`, rec.id);
  };
  const applyBudgetChange = (id: string): Result => {
    const g = guard() ?? managerOnly('Applying a budget change');
    if (g) return g;
    const s = ref.current;
    const bc = s.budgetChanges.find((x) => x.id === id);
    if (!bc || bc.status !== 'APPROVED') return fail('Only approved changes can be applied');
    const y = (b: BudgetLine) => (b.year ?? s.budgetYear) === bc.year;
    const budgets = s.budgets.map((b) => {
      if (!y(b)) return b;
      if (b.account === bc.toAccount) return { ...b, monthly: b.monthly.map((m, i) => (i === bc.month ? m + bc.amount : m)) };
      if (bc.type === 'REALLOCATION' && b.account === bc.fromAccount) return { ...b, monthly: b.monthly.map((m, i) => (i === bc.month ? m - bc.amount : m)) };
      return b;
    });
    commit({ ...s, budgets, budgetChanges: s.budgetChanges.map((x) => (x.id === id ? { ...x, status: 'POSTED', history: [...x.history, hist(c, 'Applied to the budget')] } : x)) });
    return done('Budget updated', `${bc.number} applied`);
  };
  const saveObjective = (o: StrategicObjective): Result => {
    const g = guard() ?? managerOnly('Strategic objectives');
    if (g) return g;
    if (!o.code.trim() || !o.name.trim()) return fail('Enter the code and objective');
    const s = ref.current;
    const exists = s.objectives.some((x) => x.id === o.id);
    const clean = { ...o, id: o.id || c.uid('so') };
    commit({ ...s, objectives: exists ? s.objectives.map((x) => (x.id === o.id ? clean : x)) : [...s.objectives, clean] });
    return done('Objective saved', clean.name);
  };
  const linkBudgetObjective = (account: string, year: number, objectiveId: string) => {
    if (guard()) return;
    const s = ref.current;
    commit({ ...s, budgets: s.budgets.map((b) => (b.account === account && (b.year ?? s.budgetYear) === year ? { ...b, objectiveId: objectiveId || undefined } : b)) });
  };

  /* ---------------- Fixed assets ---------------- */
  const assetHist = (a: FixedAsset, action: string, note?: string) => [...(a.history ?? []), hist(c, action, note)];
  const disposeAsset = (id: string, o: { date: string; proceeds: number; bankAccount: string; reason: string }): Result => {
    const g = guard() ?? managerOnly('Disposing of an asset');
    if (g) return g;
    const s = ref.current;
    const a = s.assets.find((x) => x.id === id);
    if (!a || a.status !== 'ACTIVE') return fail('Only active assets can be disposed of');
    if (o.date < a.acquired) return fail('The disposal date is before the asset was bought');
    if (!(o.proceeds >= 0)) return fail('Enter the sale proceeds (0 if scrapped)');
    if (!o.reason.trim()) return fail('Give the reason (sold, scrapped, stolen…)');
    const acc = accumulatedDepreciation(s, a);
    const cost = round2(a.cost + (a.revaluation ?? 0));
    const nbv = round2(cost - acc);
    const gain = round2(o.proceeds - nbv);
    const lines: SystemJournalInput['lines'] = [
      { account: CONTROL.ACC_DEP, debit: acc, description: `Accumulated depreciation ${a.number}` },
      { account: a.costAccount, credit: cost, description: `${a.number} ${a.name}` }
    ];
    if (o.proceeds) lines.push({ account: o.bankAccount, debit: o.proceeds, description: 'Sale proceeds' });
    if (gain) lines.push({ account: EXT.ASSET_GAIN, debit: gain < 0 ? -gain : 0, credit: gain > 0 ? gain : 0, description: gain > 0 ? 'Gain on disposal' : 'Loss on disposal', costCenter: a.costCenter });
    const r = post(s, { date: o.date, memo: `Disposal of ${a.number} — ${a.name}`, source: 'ASSET', origin: 'Asset disposal', lines }, (n, jid, num) => ({
      ...n,
      assets: n.assets.map((x) => (x.id === id ? { ...x, status: 'DISPOSED' as const, disposal: { date: o.date, proceeds: o.proceeds, gainLoss: gain, journalId: jid }, history: assetHist(x, `Disposed by ${num}`, o.reason) } : x))
    }));
    return r.ok ? done('Asset disposed', `${a.number}: ${gain >= 0 ? 'gain' : 'loss'} of ${Math.abs(gain).toLocaleString()} (${r.number})`) : r;
  };
  /** Moves an asset to another location / cost centre, or to another company in the group at carrying amount. */
  const transferAsset = (id: string, o: { location: string; custodian: string; costCenter?: string; toCompany?: string; date: string }): Result => {
    const g = guard() ?? managerOnly('Transferring an asset');
    if (g) return g;
    const s = ref.current;
    const a = s.assets.find((x) => x.id === id);
    if (!a || a.status !== 'ACTIVE') return fail('Only active assets can be transferred');
    if (!o.location.trim()) return fail('Enter the new location');
    if (!o.toCompany || o.toCompany === companyOf(a)) {
      commit({ ...s, assets: s.assets.map((x) => (x.id === id ? { ...x, location: o.location, custodian: o.custodian || x.custodian, costCenter: o.costCenter || x.costCenter, history: assetHist(x, 'Transferred', `${x.location} → ${o.location}${o.costCenter ? ` · ${o.costCenter}` : ''}`) } : x)) });
      return done('Asset transferred', `${a.number} now at ${o.location}`);
    }
    const to = s.companies.find((x) => x.id === o.toCompany);
    if (!to) return fail('Choose the receiving company');
    const acc = accumulatedDepreciation(s, a);
    const cost = round2(a.cost + (a.revaluation ?? 0));
    const nbv = round2(cost - acc);
    const from = s.companies.find((x) => x.id === companyOf(a));
    const out = buildJournal(c, s, {
      date: o.date,
      memo: `${a.number} transferred to ${to.code}`,
      source: 'INTERCOMPANY',
      origin: 'Asset transfer',
      companyId: companyOf(a),
      lines: [
        { account: CONTROL.ACC_DEP, debit: acc },
        { account: EXT.IC_RECEIVABLE, debit: nbv, partnerCompany: to.id },
        { account: a.costAccount, credit: cost }
      ]
    });
    if ('error' in out) return fail(out.error);
    const s2 = withJournals(s, [out.journal], out.sequence);
    const inn = buildJournal(c, s2, {
      date: o.date,
      memo: `${a.number} received from ${from?.code ?? ''}`,
      source: 'INTERCOMPANY',
      origin: 'Asset transfer',
      companyId: to.id,
      lines: [
        { account: a.costAccount, debit: nbv },
        { account: EXT.IC_PAYABLE, credit: nbv, partnerCompany: companyOf(a) }
      ]
    });
    if ('error' in inn) return fail(inn.error);
    const s3 = withJournals(s2, [inn.journal], inn.sequence);
    const months = Math.max(1, a.lifeMonths - Math.round(daysBetween(a.acquired, o.date) / 30.44));
    const copy: FixedAsset = {
      ...a,
      id: c.uid('fa'),
      number: `FA-${String(s.assets.length + 1).padStart(4, '0')}`,
      acquired: o.date,
      cost: nbv,
      residual: Math.min(a.residual, nbv),
      lifeMonths: months,
      openingDepreciation: 0,
      revaluation: 0,
      location: o.location,
      custodian: o.custodian || a.custodian,
      costCenter: o.costCenter,
      companyId: to.id,
      capitalJournalId: inn.journal.id,
      history: [hist(c, `Received from ${from?.code ?? ''} (${a.number})`, `Carrying amount ${nbv.toLocaleString()}`)]
    };
    commit({ ...s3, assets: [...s3.assets.map((x) => (x.id === id ? { ...x, status: 'TRANSFERRED' as const, history: assetHist(x, `Transferred to ${to.code} as ${copy.number}`) } : x)), copy] });
    return done('Inter-company transfer posted', `${a.number} → ${to.code} ${copy.number} at ${nbv.toLocaleString()} (${out.journal.number}, ${inn.journal.number})`);
  };
  /** Revaluation (up, to the revaluation reserve) or impairment (down, reserve first then profit or loss). */
  const revalueAsset = (id: string, fairValue: number, date: string, reason: string): Result => {
    const g = guard() ?? managerOnly('Revaluing an asset');
    if (g) return g;
    const s = ref.current;
    const a = s.assets.find((x) => x.id === id);
    if (!a || a.status !== 'ACTIVE') return fail('Only active assets can be revalued');
    if (!(fairValue >= 0)) return fail('Enter the fair value');
    if (!reason.trim()) return fail('Give the basis (valuer, impairment review…)');
    const nbv = carryingAmount(s, a);
    const diff = round2(fairValue - nbv);
    if (Math.abs(diff) < 1) return fail('The fair value equals the carrying amount');
    const reserve = Math.max(0, a.revaluation ?? 0);
    const lines: SystemJournalInput['lines'] = diff > 0 ? [{ account: a.costAccount, debit: diff }, { account: EXT.REVAL_RESERVE, credit: diff }] : [{ account: a.costAccount, credit: -diff }];
    if (diff < 0) {
      const fromReserve = round2(Math.min(reserve, -diff));
      if (fromReserve) lines.push({ account: EXT.REVAL_RESERVE, debit: fromReserve, description: 'Impairment against earlier revaluation' });
      if (-diff - fromReserve > 0.005) lines.push({ account: CONTROL.DEP_EXP, debit: round2(-diff - fromReserve), description: 'Impairment loss', costCenter: a.costCenter });
    }
    const r = post(s, { date, memo: `${diff > 0 ? 'Revaluation' : 'Impairment'} of ${a.number} — ${a.name}`, source: 'ASSET', origin: 'Asset revaluation', lines }, (n, _j, num) => ({
      ...n,
      assets: n.assets.map((x) => (x.id === id ? { ...x, revaluation: round2((x.revaluation ?? 0) + diff), history: assetHist(x, `${diff > 0 ? 'Revalued' : 'Impaired'} by ${num}`, `${nbv.toLocaleString()} → ${fairValue.toLocaleString()}: ${reason}`) } : x))
    }));
    return r.ok ? done(diff > 0 ? 'Asset revalued' : 'Impairment posted', `${a.number}: ${diff > 0 ? '+' : ''}${diff.toLocaleString()}`) : r;
  };
  const setAssetMethod = (id: string, method: 'SL' | 'RB', rbRate?: number, fiscalYearStart?: number): Result => {
    const g = guard() ?? managerOnly('Changing depreciation');
    if (g) return g;
    if (method === 'RB' && !(Number(rbRate) > 0 && Number(rbRate) < 1)) return fail('Enter the reducing-balance rate, e.g. 0.25 for 25%');
    const s = ref.current;
    commit({ ...s, assets: s.assets.map((x) => (x.id === id ? { ...x, method, rbRate: method === 'RB' ? rbRate : undefined, fiscalYearStart, history: assetHist(x, 'Depreciation method changed', method === 'RB' ? `Reducing balance ${(Number(rbRate) * 100).toFixed(0)}%` : 'Straight line') } : x)) });
    return done('Depreciation method saved', method === 'RB' ? 'Reducing balance' : 'Straight line');
  };

  /* ---------------- Treasury ---------------- */
  const BOOK: Record<TreasuryInstrument['type'], string | null> = { DEPOSIT: EXT.INVESTMENTS, TBILL: EXT.INVESTMENTS, BOND: EXT.INVESTMENTS, LOAN_OUT: EXT.INVESTMENTS, IC_LOAN: EXT.IC_RECEIVABLE, LOAN_IN: '2500', FX_FWD: null, LC: null };
  const saveInstrument = (i: Omit<TreasuryInstrument, 'id' | 'number' | 'status' | 'accrued' | 'repaid' | 'journals' | 'history' | 'marketValues'> & { price?: number }): Result => {
    const g = guard() ?? managerOnly('Treasury deals');
    if (g) return g;
    const s = ref.current;
    if (!i.counterparty.trim() || !(i.principal > 0)) return fail('Enter the counterparty and the amount');
    if (i.maturity <= i.start) return fail('Maturity must be after the start date');
    if (i.type === 'FX_FWD' && !(Number(i.forwardRate) > 0)) return fail('Enter the contracted forward rate');
    if (i.type === 'LC' && !i.lc?.beneficiary) return fail('Enter the LC beneficiary');
    const n = s.instruments.length + 1;
    const inst: TreasuryInstrument = { ...i, id: c.uid('tr'), number: `TRY-${String(n).padStart(4, '0')}`, status: 'ACTIVE', accrued: 0, repaid: 0, marketValues: i.price ? [{ date: i.start, price: i.price }] : [], journals: [], history: [hist(c, 'Deal captured')], companyId: s.activeCompany };
    const book = BOOK[i.type];
    if (!book) {
      commit({ ...s, instruments: [inst, ...s.instruments] });
      return done('Deal captured', `${inst.number} (off balance sheet until settled)`);
    }
    const cash = i.price ? round2((i.principal * i.price) / 100) : i.principal;
    const inflow = i.type === 'LOAN_IN';
    const r = post(s, { date: i.start, memo: `${inst.number} ${i.type.replace('_', ' ').toLowerCase()} — ${i.counterparty}`, source: 'TREASURY', origin: 'Treasury', lines: inflow ? [{ account: i.bankAccount, debit: cash }, { account: book, credit: cash }] : [{ account: book, debit: cash, partnerCompany: i.partnerCompany }, { account: i.bankAccount, credit: cash }] }, (nx, jid) => ({ ...nx, instruments: [{ ...inst, journals: [jid] }, ...nx.instruments] }));
    return r.ok ? done('Deal captured', `${inst.number} booked by ${r.number}`) : r;
  };
  const outstanding = (i: TreasuryInstrument) => round2(i.principal - i.repaid);
  /** Monthly interest accrual on every active interest-bearing deal of the company. */
  const accrueInterest = (period: string): Result => {
    const g = guard() ?? managerOnly('Interest accruals');
    if (g) return g;
    const s = ref.current;
    const date = monthEndOf(period);
    const lines: SystemJournalInput['lines'] = [];
    const per = new Map<string, number>();
    for (const i of scope(s).instruments) {
      if (i.status !== 'ACTIVE' || !i.rate || i.start > date || i.type === 'FX_FWD' || i.type === 'LC') continue;
      if (s.journals.some((j) => j.origin === `int:all:${period}` && !j.reversedBy && i.journals.includes(j.id))) continue;
      const days = Math.min(daysBetween(i.start > `${period}-01` ? i.start : `${period}-01`, date) + 1, 31);
      const amt = round2((outstanding(i) * i.rate * days) / 365);
      if (amt < 1) continue;
      per.set(i.id, amt);
      if (i.type === 'LOAN_IN') lines.push({ account: '7000', debit: amt, description: `${i.number} interest` }, { account: '2200', credit: amt, description: `${i.number} interest accrued` });
      else lines.push({ account: i.type === 'IC_LOAN' ? EXT.IC_RECEIVABLE : EXT.INVESTMENTS, debit: amt, description: `${i.number} interest receivable`, partnerCompany: i.partnerCompany }, { account: EXT.INTEREST_INCOME, credit: amt, description: `${i.number} interest` });
    }
    if (!lines.length) return fail(`Interest for ${periodLabel(period, true)} has already been accrued or nothing is earning interest`);
    const r = buildJournal(c, s, { date, memo: `Interest accrual — ${periodLabel(period, true)}`, source: 'TREASURY', origin: `int:all:${period}`, lines });
    if ('error' in r) return fail(r.error);
    const next = withJournals(s, [r.journal], r.sequence);
    commit({
      ...next,
      instruments: next.instruments.map((i) => (per.has(i.id) ? { ...i, accrued: round2(i.accrued + per.get(i.id)!), journals: [...i.journals, r.journal.id], history: [...i.history, hist(c, `Interest ${per.get(i.id)!.toLocaleString()} accrued for ${periodLabel(period)}`)] } : i))
    });
    return done('Interest accrued', `${r.journal.number}: ${[...per.values()].reduce((x, v) => x + v, 0).toLocaleString()} on ${per.size} deals`);
  };
  /** Maturity of a deposit, T-bill or bond: principal and interest back to the bank, or rolled into a new deal. */
  const matureInstrument = (id: string, date = TODAY): Result => {
    const g = guard() ?? managerOnly('Treasury settlement');
    if (g) return g;
    const s = ref.current;
    const i = s.instruments.find((x) => x.id === id);
    if (!i || i.status !== 'ACTIVE') return fail('Only active deals can mature');
    if (BOOK[i.type] !== EXT.INVESTMENTS) return fail('Use repayment for loans and settlement for forwards');
    const value = round2(outstanding(i) + i.accrued);
    if (i.rollover) {
      const tenor = daysBetween(i.start, i.maturity);
      const n = s.instruments.length + 1;
      const rolled: TreasuryInstrument = { ...i, id: c.uid('tr'), number: `TRY-${String(n).padStart(4, '0')}`, principal: value, start: date, maturity: addDays(date, tenor), accrued: 0, repaid: 0, journals: [], history: [hist(c, `Rolled over from ${i.number}`, `Principal and interest ${value.toLocaleString()}`)] };
      commit({ ...s, instruments: [rolled, ...s.instruments.map((x) => (x.id === id ? { ...x, status: 'ROLLED' as const, history: [...x.history, hist(c, `Rolled into ${rolled.number}`)] } : x))] });
      finNotify('Treasury', `${i.number} rolled over into ${rolled.number}`, i.number);
      return done('Rolled over', `${rolled.number}: ${value.toLocaleString()} to ${rolled.maturity}`);
    }
    const r = post(s, { date, memo: `${i.number} matured — ${i.counterparty}`, source: 'TREASURY', origin: 'Treasury', lines: [{ account: i.bankAccount, debit: value }, { account: EXT.INVESTMENTS, credit: value }] }, (n, jid) => ({ ...n, instruments: n.instruments.map((x) => (x.id === id ? { ...x, status: 'MATURED', journals: [...x.journals, jid], history: [...x.history, hist(c, 'Matured and paid into the bank')] } : x)) }));
    return r.ok ? done('Matured', `${value.toLocaleString()} received (${r.number})`) : r;
  };
  const repayLoan = (id: string, amount: number, date = TODAY): Result => {
    const g = guard() ?? managerOnly('Loan repayments');
    if (g) return g;
    const s = ref.current;
    const i = s.instruments.find((x) => x.id === id);
    if (!i || i.status !== 'ACTIVE' || !['LOAN_IN', 'LOAN_OUT', 'IC_LOAN'].includes(i.type)) return fail('Choose an active loan');
    if (!(amount > 0) || amount - outstanding(i) > 0.005) return fail(`Repay up to ${outstanding(i).toLocaleString()}`);
    const book = BOOK[i.type]!;
    const lines: SystemJournalInput['lines'] = i.type === 'LOAN_IN' ? [{ account: book, debit: amount }, { account: i.bankAccount, credit: amount }] : [{ account: i.bankAccount, debit: amount }, { account: book, credit: amount, partnerCompany: i.partnerCompany }];
    const r = post(s, { date, memo: `${i.number} repayment — ${i.counterparty}`, source: 'TREASURY', origin: 'Treasury', lines }, (n, jid) => ({
      ...n,
      instruments: n.instruments.map((x) => (x.id === id ? { ...x, repaid: round2(x.repaid + amount), status: x.repaid + amount >= x.principal - 0.005 ? 'REPAID' : 'ACTIVE', journals: [...x.journals, jid], history: [...x.history, hist(c, `Repaid ${amount.toLocaleString()}`)] } : x))
    }));
    return r.ok ? done('Repayment posted', `${r.number}; ${round2(outstanding(i) - amount).toLocaleString()} outstanding`) : r;
  };
  /** Mark-to-market of a bond or T-bill at today's price per 100. */
  const markToMarket = (id: string, price: number, date = TODAY): Result => {
    const g = guard() ?? managerOnly('Mark-to-market');
    if (g) return g;
    const s = ref.current;
    const i = s.instruments.find((x) => x.id === id);
    if (!i || (i.type !== 'BOND' && i.type !== 'TBILL')) return fail('Only bonds and T-bills are marked to market');
    if (!(price > 0 && price < 200)) return fail('Enter the clean price per 100');
    const last = i.marketValues[i.marketValues.length - 1];
    const prev = last ? (i.principal * last.price) / 100 : i.principal;
    const diff = round2((i.principal * price) / 100 - prev);
    const add = (n: FinanceState, jid?: string) => ({ ...n, instruments: n.instruments.map((x) => (x.id === id ? { ...x, marketValues: [...x.marketValues, { date, price }], journals: jid ? [...x.journals, jid] : x.journals, history: [...x.history, hist(c, `Marked at ${price}`, `${diff >= 0 ? '+' : ''}${diff.toLocaleString()}`)] } : x)) });
    if (Math.abs(diff) < 1) {
      commit(add(s));
      return done('Price recorded', 'No change in value');
    }
    const r = post(s, { date, memo: `${i.number} fair value — price ${price}`, source: 'TREASURY', origin: 'Mark-to-market', lines: [{ account: EXT.INVESTMENTS, debit: diff > 0 ? diff : 0, credit: diff < 0 ? -diff : 0 }, { account: EXT.INTEREST_INCOME, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, description: 'Fair value gain / (loss)' }] }, (n, jid) => add(n, jid));
    return r.ok ? done('Marked to market', `${diff >= 0 ? 'Gain' : 'Loss'} ${Math.abs(diff).toLocaleString()} (${r.number})`) : r;
  };
  const LC_FLOW = ['APPLIED', 'ISSUED', 'DOCS_PRESENTED', 'ACCEPTED', 'PAID'] as const;
  const advanceLc = (id: string, note = ''): Result => {
    const g = guard() ?? managerOnly('Letters of credit');
    if (g) return g;
    const s = ref.current;
    const i = s.instruments.find((x) => x.id === id);
    if (!i?.lc) return fail('Not a letter of credit');
    const at = LC_FLOW.indexOf(i.lc.stage as (typeof LC_FLOW)[number]);
    if (at < 0 || at === LC_FLOW.length - 1) return fail('This LC is finished');
    if (i.lc.expiry < TODAY) return fail('The LC has expired — amend or cancel it');
    const stage = LC_FLOW[at + 1];
    commit({ ...s, instruments: s.instruments.map((x) => (x.id === id ? { ...x, status: stage === 'PAID' ? 'MATURED' : x.status, lc: { ...x.lc!, stage }, history: [...x.history, hist(c, `LC ${stage.replace('_', ' ').toLowerCase()}`, note)] } : x)) });
    finNotify('Procurement', `${i.number} for ${i.lc.po}: ${stage.replace('_', ' ').toLowerCase()}`, i.lc.po);
    return done('LC updated', `${i.number}: ${stage.replace('_', ' ').toLowerCase()}`);
  };
  /** Settles an FX forward at the contracted rate; the difference to spot is the hedge gain or loss. */
  const settleForward = (id: string, spot: number, date = TODAY): Result => {
    const g = guard() ?? managerOnly('Settling a forward');
    if (g) return g;
    const s = ref.current;
    const i = s.instruments.find((x) => x.id === id);
    if (!i || i.type !== 'FX_FWD' || i.status !== 'ACTIVE') return fail('Choose an active FX forward');
    if (!(spot > 0)) return fail('Enter the spot rate');
    const kes = round2(i.principal * i.forwardRate!);
    const atSpot = round2(i.principal * spot);
    const gain = round2(kes - atSpot);
    const lines: SystemJournalInput['lines'] = [
      { account: '1000', debit: kes, description: `KES received at ${i.forwardRate}` },
      { account: i.bankAccount, credit: atSpot, description: `${i.currency} ${i.principal.toLocaleString()} delivered at ${spot}`, currency: i.currency, fxAmount: -i.principal }
    ];
    if (gain) lines.push({ account: EXT.FX_GAIN, debit: gain < 0 ? -gain : 0, credit: gain > 0 ? gain : 0, description: 'Forward contract gain / (loss)' });
    const r = post(s, { date, memo: `${i.number} forward settled`, source: 'TREASURY', origin: 'FX forward', lines }, (n, jid) => ({ ...n, instruments: n.instruments.map((x) => (x.id === id ? { ...x, status: 'MATURED', journals: [...x.journals, jid], history: [...x.history, hist(c, `Settled at spot ${spot}`)] } : x)) }));
    return r.ok ? done('Forward settled', `${gain >= 0 ? 'Gain' : 'Loss'} ${Math.abs(gain).toLocaleString()} (${r.number})`) : r;
  };

  /* ---------------- Provisions ---------------- */
  const postEcl = (asAt = TODAY): Result => {
    const g = guard() ?? managerOnly('The credit loss provision');
    if (g) return g;
    const s = ref.current;
    const v = scope(s);
    const need = eclRequired(v, asAt).total;
    const have = -accountBalance(ledger(v), EXT.ECL_ALLOWANCE, asAt);
    const move = round2(need - have);
    if (Math.abs(move) < 1) return fail('The allowance already matches the provision matrix');
    const r = post(s, { date: asAt, memo: `Expected credit loss allowance — ${need.toLocaleString()} required`, source: 'ECL', origin: 'ECL', lines: [{ account: EXT.BAD_DEBTS, debit: move > 0 ? move : 0, credit: move < 0 ? -move : 0 }, { account: EXT.ECL_ALLOWANCE, debit: move < 0 ? -move : 0, credit: move > 0 ? move : 0 }] });
    return r.ok ? done('ECL provision posted', `${move > 0 ? 'Increase' : 'Release'} of ${Math.abs(move).toLocaleString()} (${r.number})`) : r;
  };
  /** Stock loss provision by age: values per age band (from Inventory) times the configured rates. */
  const postInventoryProvision = (bands: number[], asAt = TODAY): Result => {
    const g = guard() ?? managerOnly('Inventory provisions');
    if (g) return g;
    const s = ref.current;
    const rates = s.settings.inventoryLossRates;
    const need = round2(bands.reduce((x, b, i) => x + b * (rates[i] ?? rates[rates.length - 1]), 0));
    const have = -accountBalance(ledger(scope(s)), EXT.INV_PROVISION, asAt);
    const move = round2(need - have);
    if (Math.abs(move) < 1) return fail('The provision already matches');
    const r = post(s, { date: asAt, memo: `Inventory loss provision — ${need.toLocaleString()} required`, source: 'INVENTORY', origin: 'Inventory provision', lines: [{ account: EXT.INV_LOSS, debit: move > 0 ? move : 0, credit: move < 0 ? -move : 0 }, { account: EXT.INV_PROVISION, debit: move < 0 ? -move : 0, credit: move > 0 ? move : 0 }] });
    return r.ok ? done('Provision posted', `${move > 0 ? 'Increase' : 'Release'} of ${Math.abs(move).toLocaleString()} (${r.number})`) : r;
  };
  /**
   * Posts a stock, production or maintenance movement from Operations / Trading once (keyed by its reference), e.g.
   *   finance.postOperationalCost({ ref: 'WO-0012', kind: 'MAINTENANCE', date, memo, lines: [{account:'6400', debit: 42_000}, {account:'1200', credit: 42_000}] })
   */
  const postOperationalCost = (o: { ref: string; kind: string; date: string; memo: string; lines: SystemJournalInput['lines'] }): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (s.inventoryPostings.some((p) => p.ref === o.ref)) return fail(`${o.ref} has already been posted`);
    const r = buildJournal(c, s, { date: o.date, memo: o.memo, source: 'INVENTORY', origin: o.kind, lines: o.lines });
    if ('error' in r) return fail(r.error);
    const amount = round2(r.journal.lines.reduce((x, l) => x + l.debit, 0));
    commit({ ...withJournals(s, [r.journal], r.sequence), inventoryPostings: [{ ref: o.ref, journalId: r.journal.id, at: c.now(), amount, kind: o.kind }, ...s.inventoryPostings] });
    return done('Posted to the ledger', `${r.journal.number}: ${o.memo}`, r.journal.id);
  };

  /* ---------------- Projects and cost objects ---------------- */
  const projectActuals = (s: FinanceState, code: string) => {
    const by = new Map<string, number>();
    for (const e of ledger(scope(s))) {
      if (e.project !== code) continue;
      const a = s.accounts.find((x) => x.code === e.account);
      if (a?.type !== 'EXPENSE') continue;
      by.set(e.account, round2((by.get(e.account) ?? 0) + e.debit - e.credit));
    }
    return by;
  };
  /** Settles a finished project or order: its costs are moved to an asset (capitalised) or to cost of sales. */
  const settleCostObject = (id: string, mode: 'CAPITALISE' | 'EXPENSE', target: string, date = TODAY): Result => {
    const g = guard() ?? managerOnly('Settling a project');
    if (g) return g;
    const s = ref.current;
    const o = s.costObjects.find((x) => x.id === id);
    if (!o || o.status === 'SETTLED') return fail('Choose an open project or order');
    const tAcc = s.accounts.find((a) => a.code === target);
    if (!tAcc) return fail('Choose the settlement account');
    if (mode === 'CAPITALISE' && tAcc.type !== 'ASSET') return fail('Capitalise to an asset account');
    const by = projectActuals(s, o.code);
    const total = round2([...by.values()].reduce((x, v) => x + v, 0));
    if (total <= 0) return fail(`No costs are booked to ${o.code}`);
    const lines: SystemJournalInput['lines'] = [{ account: target, debit: total, description: `${o.code} settled` }, ...[...by].filter(([, v]) => v > 0).map(([account, v]) => ({ account, credit: v, project: o.code, description: `${o.code} costs settled` }))];
    const r = post(s, { date, memo: `Settlement of ${o.code} — ${o.name}`, source: 'COSTING', origin: 'Project settlement', lines }, (n, jid) => ({
      ...n,
      costObjects: n.costObjects.map((x): CostObject => (x.id === id ? { ...x, status: 'SETTLED', settlement: { mode, target, journalId: jid, at: c.now(), amount: total } } : x))
    }));
    return r.ok ? done('Project settled', `${o.code}: ${total.toLocaleString()} ${mode === 'CAPITALISE' ? 'capitalised' : 'expensed'} (${r.number})`) : r;
  };

  /* ---------------- Tax ---------------- */
  const taxAmounts = (s: FinanceState, tax: string, period: string) => {
    const def = TAX_FILING_ACCOUNTS[tax];
    const es = ledger(scope(s)).filter((e) => periodOf(e.date) === period && !e.closing && !(e.source ?? '').startsWith('Tax payment'));
    const payable = round2(es.filter((e) => e.account === def.payable).reduce((x, e) => x + e.credit - e.debit, 0));
    const recoverable = def.recoverable ? round2(es.filter((e) => e.account === def.recoverable).reduce((x, e) => x + e.debit - e.credit, 0)) : 0;
    return { payable, recoverable, net: round2(payable - recoverable) };
  };
  const prepareFiling = (tax: string, period: string): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!TAX_FILING_ACCOUNTS[tax]) return fail('Unknown tax');
    if (s.taxFilings.some((f) => f.tax === tax && f.period === period)) return fail(`${TAX_FILING_ACCOUNTS[tax].label} for ${periodLabel(period, true)} is already prepared`);
    const t = taxAmounts(s, tax, period);
    const f: TaxFiling = { id: c.uid('tf'), tax, period, amount: t.net, status: 'PREPARED' };
    commit({ ...s, taxFilings: [f, ...s.taxFilings] });
    return done('Return prepared', `${TAX_FILING_ACCOUNTS[tax].label} ${periodLabel(period, true)}: ${t.net.toLocaleString()}${t.recoverable ? ` (output ${t.payable.toLocaleString()} less input ${t.recoverable.toLocaleString()})` : ''}`);
  };
  /** Simulated submission to KRA iTax: an acknowledgement number is issued. */
  const fileTax = (id: string): Result => {
    const g = guard() ?? managerOnly('Filing a return');
    if (g) return g;
    const s = ref.current;
    const f = s.taxFilings.find((x) => x.id === id);
    if (!f || f.status !== 'PREPARED') return fail('Only prepared returns can be filed');
    const ackNo = `KRA${TODAY.slice(0, 4)}${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
    commit({ ...s, taxFilings: s.taxFilings.map((x) => (x.id === id ? { ...x, status: 'FILED', ackNo, filedBy: actor().name, filedAt: c.now() } : x)) });
    finNotify('Finance Director', `${TAX_FILING_ACCOUNTS[f.tax]?.label ?? f.tax} for ${periodLabel(f.period, true)} filed on iTax (simulated)`, ackNo);
    return done('Filed on iTax (simulated)', `Acknowledgement ${ackNo}`);
  };
  const payTax = (id: string, bankAccount = '1000', date = TODAY): Result => {
    const g = guard() ?? managerOnly('Paying tax');
    if (g) return g;
    const s = ref.current;
    const f = s.taxFilings.find((x) => x.id === id);
    if (!f || f.status !== 'FILED') return fail('File the return before paying');
    const def = TAX_FILING_ACCOUNTS[f.tax];
    const t = taxAmounts(s, f.tax, f.period);
    if (f.amount <= 0) {
      commit({ ...s, taxFilings: s.taxFilings.map((x) => (x.id === id ? { ...x, status: 'PAID' } : x)) });
      return done('Nothing to pay', 'The credit is carried forward to next month');
    }
    const lines: SystemJournalInput['lines'] = [{ account: def.payable, debit: t.payable }, { account: bankAccount, credit: f.amount, description: `${def.label} ${periodLabel(f.period)}` }];
    if (def.recoverable && t.recoverable) lines.push({ account: def.recoverable, credit: t.recoverable });
    if (Math.abs(t.payable - t.recoverable - f.amount) > 0.5) return fail('The ledger has changed since the return was prepared — prepare it again');
    const r = post(s, { date, memo: `${def.label} — ${periodLabel(f.period, true)} (${f.ackNo})`, source: 'TAX', origin: 'Tax payment', lines }, (n, jid) => ({ ...n, taxFilings: n.taxFilings.map((x) => (x.id === id ? { ...x, status: 'PAID', journalId: jid } : x)) }));
    return r.ok ? done('Tax paid', `${f.amount.toLocaleString()} (${r.number})`) : r;
  };
  /** Corporation tax provision for the year to date at the configured rate. */
  const corporateTaxProvision = (asAt = TODAY): Result => {
    const g = guard() ?? managerOnly('The tax provision');
    if (g) return g;
    const s = ref.current;
    const v = scope(s);
    const es = ledger(v).filter((e) => e.account !== EXT.CORP_TAX);
    const pl = profitAndLoss(v, es, `${asAt.slice(0, 4)}-01-01`, asAt);
    const need = round2(Math.max(0, pl.netProfit) * s.settings.corporateTaxRate);
    const acct = s.accounts.find((a) => a.code === EXT.CORP_TAX)!;
    const have = balanceOf(ledger(v), acct, { from: `${asAt.slice(0, 4)}-01-01`, to: asAt });
    const move = round2(need - have);
    if (Math.abs(move) < 1) return fail('The provision is already up to date');
    const r = post(s, { date: asAt, memo: `Corporation tax provision — ${(s.settings.corporateTaxRate * 100).toFixed(0)}% of ${pl.netProfit.toLocaleString()}`, source: 'TAX', origin: 'Corporation tax', lines: [{ account: EXT.CORP_TAX, debit: move > 0 ? move : 0, credit: move < 0 ? -move : 0 }, { account: EXT.TAX_PAYABLE, debit: move < 0 ? -move : 0, credit: move > 0 ? move : 0 }] });
    return r.ok ? done('Tax provision posted', `${move.toLocaleString()} (${r.number})`) : r;
  };

  return {
    saveBudgetLine,
    spreadBudget,
    copyBudget,
    approveBudget,
    requestBudgetChange,
    applyBudgetChange,
    saveObjective,
    linkBudgetObjective,
    disposeAsset,
    transferAsset,
    revalueAsset,
    setAssetMethod,
    saveInstrument,
    accrueInterest,
    matureInstrument,
    repayLoan,
    markToMarket,
    advanceLc,
    settleForward,
    postEcl,
    postInventoryProvision,
    postOperationalCost,
    settleCostObject,
    prepareFiling,
    fileTax,
    payTax,
    corporateTaxProvision,
    taxAmounts: (tax: string, period: string) => taxAmounts(ref.current, tax, period)
  };
};
