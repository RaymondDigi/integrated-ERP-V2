import type {
  Account,
  AccountType,
  Actor,
  ApprovalRule,
  BankLine,
  DocLine,
  DocStatus,
  FinDocument,
  FinanceState,
  FinRole,
  FixedAsset,
  Journal,
  LedgerEntry,
  Memo,
  Period,
  Settlement,
  Workflow
} from './types';

export const VAT_RATE = 0.16;
/** Documents above this amount need a second approval by the Finance Director (default when no approval rule applies). */
export const DIRECTOR_LIMIT = 1_000_000;
/** The group's main company: records without a company belong to it. */
export const MAIN_COMPANY = 'org-kericho';
export const BASE_CURRENCY = 'KES';

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
export const addMonths = (date: string, months: number) => {
  const d = new Date(date + 'T00:00:00');
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return iso(d);
};
export const monthEnd = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return iso(new Date(y, m, 0));
};
export const daysBetween = (from: string, to: string) =>
  Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86_400_000);
export const periodOf = (date: string) => date.slice(0, 7);
/** Label for a period key: calendar months ("Oct 2026"), adjustment periods ("2026 adj. 13") and user-defined periods. */
export const periodLabel = (key: string, long = false) => {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12)
    return new Date(key + '-01T00:00:00').toLocaleDateString('en-GB', { month: long ? 'long' : 'short', year: 'numeric' });
  if (m) return `${long ? 'Adjustment period' : 'Adj.'} ${Number(m[2])} ${m[1]}`;
  return key.replace('-', ' ');
};
export const round2 = (n: number) => Math.round(n * 100) / 100;

export const kes = (n: number, opts: { compact?: boolean; sign?: boolean } = {}) => money(n, BASE_CURRENCY, opts);

/** Formats an amount in any currency (KES by default). */
export const money = (n: number, currency = BASE_CURRENCY, opts: { compact?: boolean; sign?: boolean } = {}) => {
  const abs = Math.abs(n);
  const body = opts.compact
    ? abs >= 1e6
      ? `${(abs / 1e6).toFixed(abs >= 1e7 ? 1 : 2)}M`
      : abs >= 1e3
        ? `${(abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}K`
        : abs.toFixed(0)
    : abs.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : '';
  return `${sign}${currency} ${body}`;
};
export const fmtDate = (date: string) =>
  date ? new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/* ------------------------------------------------------------------ */
/* Companies and currencies                                            */
/* ------------------------------------------------------------------ */

export const companyOf = (x: { companyId?: string }) => x.companyId ?? MAIN_COMPANY;
export const isForeign = (x: { currency?: string }) => !!x.currency && x.currency !== BASE_CURRENCY;
export const fxOf = (x: { currency?: string; fxRate?: number }) => (isForeign(x) ? x.fxRate || 1 : 1);
export const curOf = (x: { currency?: string }) => x.currency || BASE_CURRENCY;

/** KES per unit of a currency on a date (the latest rate on or before it). */
export const rateOn = (state: Pick<FinanceState, 'currencies'>, currency: string | undefined, date: string) => {
  if (!currency || currency === BASE_CURRENCY) return 1;
  const c = (state.currencies ?? []).find((x) => x.code === currency);
  if (!c || !c.rates.length) return 1;
  const sorted = [...c.rates].sort((a, b) => a.date.localeCompare(b.date));
  return (sorted.filter((r) => r.date <= date).pop() ?? sorted[0]).rate;
};

/** The records of one company: what every page works with. */
export const scope = (state: FinanceState, company = state.activeCompany): FinanceState => {
  if (!company) return state;
  const mine = <T extends { companyId?: string }>(list: T[] | undefined) => (list ?? []).filter((x) => companyOf(x) === company);
  return {
    ...state,
    documents: mine(state.documents),
    settlements: mine(state.settlements),
    journals: mine(state.journals),
    bankLines: mine(state.bankLines),
    assets: mine(state.assets),
    memos: mine(state.memos),
    paymentRuns: mine(state.paymentRuns),
    recurring: mine(state.recurring),
    instruments: mine(state.instruments)
  };
};

/* ------------------------------------------------------------------ */
/* Documents and tax                                                   */
/* ------------------------------------------------------------------ */

export const lineNet = (l: Pick<DocLine, 'qty' | 'price'>) => round2(l.qty * l.price);
/** VAT rate on a line: the rate copied from its tax code, or 16% / 0% from the older VAT tick box. */
export const lineVatRate = (l: DocLine) => (l.taxRate ?? (l.vat ? VAT_RATE : 0));
export const lineTaxCode = (l: DocLine) => l.taxCode ?? (l.vat ? 'V16' : 'Z0');
export const lineVat = (l: DocLine) => round2(lineNet(l) * lineVatRate(l));
export const lineLevy = (l: DocLine) => round2((l.levies ?? []).reduce((s, v) => s + lineNet(l) * v.rate, 0));

export const docTotals = (doc: Pick<FinDocument, 'lines'>) => {
  let net = 0;
  let vat = 0;
  let rcVat = 0;
  let levy = 0;
  const byCode: Record<string, { base: number; tax: number }> = {};
  for (const l of doc.lines) {
    const amount = lineNet(l);
    net += amount;
    const v = lineVat(l);
    if (l.reverseCharge) rcVat += v;
    else vat += v;
    levy += lineLevy(l);
    const code = lineTaxCode(l);
    const row = (byCode[code] ??= { base: 0, tax: 0 });
    row.base = round2(row.base + amount);
    row.tax = round2(row.tax + v);
  }
  return { net: round2(net), vat: round2(vat), total: round2(net + vat + levy), levy: round2(levy), rcVat: round2(rcVat), byCode };
};

export const journalTotals = (j: Pick<Journal, 'lines'>) => {
  const debit = round2(j.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const credit = round2(j.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  return { debit, credit, balanced: debit > 0 && Math.abs(debit - credit) < 0.005 };
};

type AnyWorkflow = Workflow & { id: string; number: string; date: string };

/** Amount the document is worth for approval purposes (in KES). */
export const docValue = (doc: FinDocument | Settlement | Journal | AnyWorkflow): number => {
  const d = doc as unknown as Record<string, unknown>;
  if ('side' in d) return round2(docTotals(doc as Memo).total * fxOf(doc as Memo));
  if ('kind' in d && (d.kind === 'INVOICE' || d.kind === 'BILL')) return round2(docTotals(doc as FinDocument).total * fxOf(doc as FinDocument));
  if ('proposals' in d) return round2((d.proposals as { amount: number; include: boolean }[]).filter((p) => p.include).reduce((s, p) => s + p.amount, 0));
  if ('amount' in d && typeof d.amount === 'number') return round2(d.amount * fxOf(doc as Settlement));
  if ('lines' in d) return journalTotals(doc as Journal).debit;
  return 0;
};

/** Money settled against a document: posted receipts or payments (with discounts), credit notes, advances and write-offs. */
export const settledAmount = (state: FinanceState, docId: string) => {
  let sum = 0;
  for (const s of state.settlements) {
    if (s.status !== 'POSTED' || s.voided) continue;
    for (const a of s.allocations) if (a.docId === docId) sum += a.amount + (a.discount ?? 0);
  }
  for (const m of state.memos ?? []) {
    if (m.status !== 'POSTED') continue;
    for (const a of m.allocations) if (a.docId === docId) sum += a.amount;
  }
  for (const a of state.applications ?? []) if (a.docId === docId) sum += a.amount;
  return round2(sum);
};

export const docBalance = (state: FinanceState, doc: FinDocument) => round2(docTotals(doc).total - settledAmount(state, doc.id));
/** Balance in KES at the document's own rate. */
export const docBalanceBase = (state: FinanceState, doc: FinDocument) => round2(docBalance(state, doc) * fxOf(doc));

export type PayState = 'UNPAID' | 'PART_PAID' | 'PAID';
export const payState = (state: FinanceState, doc: FinDocument): PayState => {
  const paid = settledAmount(state, doc.id);
  if (paid <= 0) return 'UNPAID';
  return paid + 0.005 >= docTotals(doc).total ? 'PAID' : 'PART_PAID';
};
export const isOverdue = (state: FinanceState, doc: FinDocument, today = TODAY) =>
  doc.status === 'POSTED' && doc.dueDate < today && docBalance(state, doc) > 0.005;

/** Unapplied credit memos and settlements of a party (money we hold on account). */
export const memoBalance = (m: Memo) => round2(docTotals(m).total - m.allocations.reduce((s, a) => s + a.amount, 0));

/* ------------------------------------------------------------------ */
/* Workflow rules                                                      */
/* ------------------------------------------------------------------ */

export const ROLE_LABEL: Record<FinRole, string> = {
  ACCOUNTANT: 'Accountant',
  MANAGER: 'Finance Manager',
  DIRECTOR: 'Finance Director'
};

const docTypeOf = (doc: object): ApprovalRule['docType'] => {
  const d = doc as Record<string, unknown>;
  if ('side' in d) return 'MEMO';
  if ('proposals' in d) return 'PAYMENT_RUN';
  if ('toAccount' in d) return 'BUDGET';
  if ('employeeId' in d) return 'LOAN';
  if ('source' in d) return 'JOURNAL';
  if (d.kind === 'INVOICE' || d.kind === 'BILL' || d.kind === 'RECEIPT' || d.kind === 'PAYMENT') return d.kind;
  return 'ANY';
};

/** Value above which the Finance Director must also approve, from the approval matrix (most specific rule wins). */
export const directorLimit = (state: Pick<FinanceState, 'approvalRules'> | undefined, doc?: object) => {
  const rules = state?.approvalRules ?? [];
  if (!doc || !rules.length) return DIRECTOR_LIMIT;
  const type = docTypeOf(doc);
  const dept = (doc as { department?: string }).department;
  const hit =
    rules.find((r) => r.docType === type && r.department && r.department === dept) ??
    rules.find((r) => r.docType === type && !r.department) ??
    rules.find((r) => r.docType === 'ANY' && r.department && r.department === dept) ??
    rules.find((r) => r.docType === 'ANY' && !r.department);
  return hit?.directorAbove ?? DIRECTOR_LIMIT;
};

export const approvalsNeeded = (value: number, limit = DIRECTOR_LIMIT) => (value > limit ? 2 : 1);

type Doc = FinDocument | Settlement | Journal | AnyWorkflow;

/** Which accounting period a date (or an explicit adjustment period) falls in. */
export const periodFor = (state: Pick<FinanceState, 'periods'>, date: string, key?: string): Period | undefined => {
  if (key) return state.periods.find((p) => p.key === key);
  return state.periods.find((p) => !p.special && (p.from && p.to ? date >= p.from && date <= p.to : p.key === periodOf(date)));
};
export const periodStatus = (state: Pick<FinanceState, 'periods'>, date: string, key?: string): Period['status'] | 'NONE' =>
  periodFor(state, date, key)?.status ?? 'NONE';

/** Hard-closed, or no period defined for the date (nothing can be posted outside the fiscal calendar). */
export const isPeriodClosed = (state: Pick<FinanceState, 'periods'>, date: string, key?: string) => {
  const s = periodStatus(state, date, key);
  return s === 'CLOSED' || s === 'NONE';
};

/** Why a posting on this date is blocked ('' when it can go ahead). Soft-closed periods only take manager journals. */
export const postingBlock = (state: Pick<FinanceState, 'periods'>, date: string, opts: { journal?: boolean; role?: FinRole; key?: string } = {}) => {
  const p = periodFor(state, date, opts.key);
  if (!p) return `No accounting period covers ${fmtDate(date)} — open that fiscal year first`;
  const label = p.label ?? periodLabel(p.key, true);
  if (p.status === 'CLOSED') return `${label} is closed — change the date or reopen the period`;
  if (p.status === 'SOFT' && !(opts.journal && opts.role && opts.role !== 'ACCOUNTANT'))
    return `${label} is soft-closed — sub-ledgers are locked; only Finance Manager or Director journals can post`;
  return '';
};

/** What the current actor may do with a document, and why not. */
export const permissions = (state: FinanceState, doc: Doc, actor: Actor) => {
  const value = docValue(doc);
  const limit = directorLimit(state, doc);
  const needed = approvalsNeeded(value, limit);
  const approvers = doc.approvals.map((a) => a.by);
  const own = doc.preparedBy === actor.name;
  const block = postingBlock(state, doc.date, { journal: 'source' in doc, role: actor.role, key: (doc as Journal).periodKey });
  const editable = doc.status === 'DRAFT' || doc.status === 'REJECTED';
  const out = {
    edit: editable,
    submit: editable,
    approve: false,
    reject: false,
    post: false,
    // Drafts and rejected documents can be cancelled by whoever prepared them or by a manager
    void: (editable || doc.status === 'APPROVED') && (own || actor.role !== 'ACCOUNTANT'),
    reason: '' as string
  };
  const held = holdReason(state, doc);
  const unmatched = 'kind' in doc && doc.kind === 'BILL' && doc.match && !doc.match.matched && !doc.match.override;
  if (doc.status === 'SUBMITTED') {
    if (actor.role === 'ACCOUNTANT') out.reason = 'Waiting for a Finance Manager or Director to approve';
    else if (own) out.reason = 'You prepared this document, so someone else must approve it';
    else if (approvers.includes(actor.name)) out.reason = 'You have already approved this document';
    else if (approvers.length === 1 && needed === 2 && actor.role !== 'DIRECTOR')
      out.reason = `Above ${kes(limit, { compact: true })} — the Finance Director gives the second approval`;
    else if (held) {
      out.reason = held;
      out.reject = true;
    } else if (unmatched) {
      out.reason = 'Goods received are not matched to this bill — the Finance Director can override the match';
      out.reject = true;
    } else {
      out.approve = true;
      out.reject = true;
    }
  }
  if (doc.status === 'APPROVED') {
    if (block) out.reason = block;
    else if (held) out.reason = held;
    else if (actor.role === 'ACCOUNTANT' && own) out.reason = 'Posting is done by a Finance Manager or Director';
    else out.post = true;
  }
  return { ...out, needed, approvalsDone: doc.approvals.length, limit };
};

/** Payment holds that stop a payment or receipt allocation going through. */
export const holdReason = (state: FinanceState, doc: Doc) => {
  if (!('allocations' in doc) || !('kind' in doc) || doc.kind !== 'PAYMENT') return '';
  const party = state.parties.find((p) => p.id === doc.partyId);
  if (party?.paymentHold) return `${party.name} is on payment hold: ${party.paymentHold.reason}`;
  for (const a of doc.allocations) {
    const bill = state.documents.find((d) => d.id === a.docId);
    if (bill?.hold) return `${bill.number} is on hold: ${bill.hold.reason}`;
    const batch = bill?.batchId ? (state.invoiceBatches ?? []).find((b) => b.id === bill.batchId) : undefined;
    if (batch?.hold) return `Batch ${batch.number} is on hold: ${batch.hold.reason}`;
  }
  return '';
};

export const nextStatus = (doc: Doc, adding: FinRole, state?: Pick<FinanceState, 'approvalRules'>): DocStatus => {
  const needed = approvalsNeeded(docValue(doc), directorLimit(state, doc));
  const count = doc.approvals.length + 1;
  const hasDirector = adding === 'DIRECTOR' || doc.approvals.some((a) => a.role === 'DIRECTOR');
  return count >= needed && (needed === 1 || hasDirector) ? 'APPROVED' : 'SUBMITTED';
};

/* ------------------------------------------------------------------ */
/* General ledger                                                      */
/* ------------------------------------------------------------------ */

export const CONTROL = { AR: '1100', AP: '2000', VAT_IN: '1150', VAT_OUT: '2100', ACC_DEP: '1590', DEP_EXP: '6800' };
/** Accounts used by the extensions (seeded in the chart of accounts). */
export const EXT = {
  WHT_RECEIVABLE: '1160',
  IC_RECEIVABLE: '1180',
  ECL_ALLOWANCE: '1190',
  INV_PROVISION: '1210',
  WIP: '1220',
  SUPPLIER_ADVANCES: '1310',
  STAFF_DEBTORS: '1400',
  INVESTMENTS: '1600',
  WHT_PAYABLE: '2170',
  IC_PAYABLE: '2180',
  GRNI: '2210',
  CUSTOMER_ADVANCES: '2300',
  TAX_PAYABLE: '2400',
  REVAL_RESERVE: '3200',
  DISCOUNT_RECEIVED: '4200',
  FX_GAIN: '4300',
  INTEREST_INCOME: '4400',
  ASSET_GAIN: '4500',
  INV_REVALUATION: '5050',
  DISCOUNT_LOST: '6960',
  DISCOUNT_ALLOWED: '6970',
  BAD_DEBTS: '6950',
  INV_LOSS: '6980',
  CORP_TAX: '7900'
};

const taxAccount = (state: FinanceState, code: string, purchase: boolean) => {
  const t = (state.taxCodes ?? []).find((x) => x.code === code);
  return purchase ? t?.inputAccount ?? CONTROL.VAT_IN : t?.account ?? CONTROL.VAT_OUT;
};

/** Every posted transaction as double-entry lines (KES). */
export const ledger = (state: FinanceState): LedgerEntry[] => {
  const out: LedgerEntry[] = [];
  const push = (e: Omit<LedgerEntry, 'id'>, i: number | string) => out.push({ ...e, id: `${e.sourceId}:${i}` });
  const docFx = new Map<string, number>();
  for (const d of state.documents) docFx.set(d.id, fxOf(d));
  const netBills = new Map<string, number>();

  for (const d of state.documents) {
    if (d.status !== 'POSTED') continue;
    const fx = fxOf(d);
    const party = state.parties.find((p) => p.id === d.partyId)?.name ?? '';
    const base = { date: d.date, sourceId: d.id, ref: d.number, department: d.department, companyId: companyOf(d), extRef: d.reference, partyId: d.partyId, currency: isForeign(d) ? d.currency : undefined };
    const source = d.kind === 'INVOICE' ? (d.memoType === 'DEBIT_NOTE' ? 'Customer debit note' : d.memoType ? 'Finance charge' : 'Sales invoice') : d.memoType === 'DEBIT_NOTE' ? 'Supplier debit note' : 'Supplier bill';
    let i = 0;
    const dims = (l: DocLine) => ({ costCenter: l.costCenter, project: l.project, plant: l.plant });
    if (d.kind === 'INVOICE') {
      let credits = 0;
      const rows: Omit<LedgerEntry, 'id'>[] = [];
      for (const l of d.lines) {
        const amt = round2(lineNet(l) * fx);
        rows.push({ ...base, ...dims(l), account: l.account, debit: 0, credit: amt, source, memo: l.description, fxAmount: isForeign(d) ? lineNet(l) : undefined });
        credits += amt;
        const v = round2(lineVat(l) * fx);
        if (v && !l.reverseCharge) {
          rows.push({ ...base, account: taxAccount(state, lineTaxCode(l), false), debit: 0, credit: v, source, memo: `Output VAT ${lineTaxCode(l)}` });
          credits += v;
        }
        for (const lv of l.levies ?? []) {
          const a = round2(lineNet(l) * lv.rate * fx);
          if (!a) continue;
          rows.push({ ...base, account: lv.account, debit: 0, credit: a, source, memo: `Levy ${lv.code}` });
          credits += a;
        }
      }
      push({ ...base, account: CONTROL.AR, debit: round2(credits), credit: 0, source, memo: party, fxAmount: isForeign(d) ? docTotals(d).total : undefined }, i++);
      for (const r of rows) push(r, i++);
    } else {
      let debits = 0;
      const rows: Omit<LedgerEntry, 'id'>[] = [];
      for (const l of d.lines) {
        const amt = round2((lineNet(l) + lineLevy(l)) * fx);
        rows.push({ ...base, ...dims(l), account: l.account, debit: amt, credit: 0, source, memo: l.description });
        debits += amt;
        const v = round2(lineVat(l) * fx);
        if (!v) continue;
        if (l.reverseCharge) {
          // Use tax: claim and pay the VAT ourselves; the supplier is paid the net amount only
          rows.push({ ...base, account: taxAccount(state, lineTaxCode(l), true), debit: v, credit: 0, source, memo: `Reverse-charge input VAT ${lineTaxCode(l)}` });
          rows.push({ ...base, account: taxAccount(state, lineTaxCode(l), false), debit: 0, credit: v, source, memo: `Reverse-charge output VAT ${lineTaxCode(l)}` });
        } else {
          rows.push({ ...base, account: taxAccount(state, lineTaxCode(l), true), debit: v, credit: 0, source, memo: `Input VAT ${lineTaxCode(l)}` });
          debits += v;
        }
      }
      let ap = round2(debits);
      if (d.netMethod && d.earlyDiscount) {
        // Net method: the purchase is booked net of the discount we expect to take
        const disc = round2(docTotals(d).net * (d.earlyDiscount.pct / 100) * fx);
        netBills.set(d.id, disc);
        rows.push({ ...base, account: d.lines[0].account, debit: 0, credit: disc, source, memo: 'Early-payment discount (net method)' });
        ap = round2(ap - disc);
      }
      for (const r of rows) push(r, i++);
      push({ ...base, account: CONTROL.AP, debit: 0, credit: ap, source, memo: party, fxAmount: isForeign(d) ? docTotals(d).total : undefined }, i++);
    }
  }

  for (const m of state.memos ?? []) {
    if (m.status !== 'POSTED') continue;
    const fx = fxOf(m);
    const party = state.parties.find((p) => p.id === m.partyId)?.name ?? '';
    const base = { date: m.date, sourceId: m.id, ref: m.number, department: m.department, companyId: companyOf(m), partyId: m.partyId, extRef: m.rmaRef || m.returnRef || m.poNumber };
    const ar = m.side === 'AR';
    const source = ar ? 'Customer credit note' : 'Supplier debit memo';
    let i = 0;
    let total = 0;
    const rows: Omit<LedgerEntry, 'id'>[] = [];
    for (const l of m.lines) {
      const amt = round2((lineNet(l) + (ar ? 0 : lineLevy(l))) * fx);
      rows.push({ ...base, costCenter: l.costCenter, project: l.project, account: l.account, debit: ar ? amt : 0, credit: ar ? 0 : amt, source, memo: l.description });
      total += amt;
      const v = round2(lineVat(l) * fx);
      if (v && !l.reverseCharge) {
        rows.push({ ...base, account: taxAccount(state, lineTaxCode(l), !ar), debit: ar ? v : 0, credit: ar ? 0 : v, source, memo: 'VAT reversed' });
        total += v;
      }
      if (ar)
        for (const lv of l.levies ?? []) {
          const a = round2(lineNet(l) * lv.rate * fx);
          if (a) {
            rows.push({ ...base, account: lv.account, debit: a, credit: 0, source, memo: `Levy ${lv.code} reversed` });
            total += a;
          }
        }
    }
    for (const r of rows) push(r, i++);
    push({ ...base, account: ar ? CONTROL.AR : CONTROL.AP, debit: ar ? 0 : round2(total), credit: ar ? round2(total) : 0, source, memo: party }, i++);
  }

  for (const s of state.settlements) {
    if (s.status !== 'POSTED') continue;
    const party = state.parties.find((p) => p.id === s.partyId)?.name ?? '';
    const fx = fxOf(s);
    const base = { date: s.date, sourceId: s.id, ref: s.number, memo: party, companyId: companyOf(s), partyId: s.partyId, extRef: s.chequeNo || s.reference };
    const rows: Omit<LedgerEntry, 'id'>[] = [];
    const cash = round2(s.amount * fx);
    const wht = round2((s.wht?.amount ?? 0) * fx);
    const allocated = s.allocations.reduce((x, a) => x + a.amount, 0);
    const discounts = s.allocations.reduce((x, a) => x + (a.discount ?? 0), 0);
    const advance = s.purpose === 'ADVANCE' || s.purpose === 'PREPAYMENT' || s.purpose === 'DOWNPAYMENT';
    if (s.kind === 'RECEIPT') {
      const source = advance ? 'Customer advance' : 'Customer receipt';
      rows.push({ ...base, account: s.bankAccount, debit: cash, credit: 0, source, currency: isForeign(s) ? s.currency : undefined, fxAmount: isForeign(s) ? s.amount : undefined });
      if (wht) rows.push({ ...base, account: EXT.WHT_RECEIVABLE, debit: wht, credit: 0, source, memo: `WHT ${s.wht!.code} withheld by customer` });
      let credits = 0;
      if (advance) {
        rows.push({ ...base, account: EXT.CUSTOMER_ADVANCES, debit: 0, credit: round2(cash + wht), source });
        credits = round2(cash + wht);
      } else {
        for (const a of s.allocations) {
          const amt = round2((a.amount + (a.discount ?? 0)) * (docFx.get(a.docId) ?? fx));
          rows.push({ ...base, account: CONTROL.AR, debit: 0, credit: amt, source });
          credits += amt;
        }
        const disc = round2(discounts * fx);
        if (disc) rows.push({ ...base, account: EXT.DISCOUNT_ALLOWED, debit: disc, credit: 0, source, memo: 'Early-payment discount allowed' });
        const onAccount = round2((s.amount + (s.wht?.amount ?? 0) - allocated) * fx);
        if (onAccount > 0.005) {
          rows.push({ ...base, account: CONTROL.AR, debit: 0, credit: onAccount, source, memo: `${party} — on account` });
          credits += onAccount;
        }
        const diff = round2(cash + wht + disc - credits);
        if (Math.abs(diff) > 0.004) rows.push({ ...base, account: EXT.FX_GAIN, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, source, memo: 'Realised exchange difference' });
      }
    } else {
      const source = advance ? 'Supplier prepayment' : 'Supplier payment';
      let debits = 0;
      if (advance) {
        rows.push({ ...base, account: EXT.SUPPLIER_ADVANCES, debit: round2(cash + wht), credit: 0, source });
        debits = round2(cash + wht);
      } else {
        for (const a of s.allocations) {
          const dfx = docFx.get(a.docId) ?? fx;
          const netDisc = netBills.get(a.docId);
          if (netDisc !== undefined && state.documents.find((d) => d.id === a.docId)?.netMethod) {
            // Net method: AP was booked net, so a missed discount is a cost of paying late
            if (a.discount) {
              rows.push({ ...base, account: CONTROL.AP, debit: round2(a.amount * dfx), credit: 0, source });
              debits += round2(a.amount * dfx);
            } else {
              const lost = Math.min(netDisc, round2(a.amount * dfx));
              rows.push({ ...base, account: CONTROL.AP, debit: round2(a.amount * dfx - lost), credit: 0, source });
              rows.push({ ...base, account: EXT.DISCOUNT_LOST, debit: lost, credit: 0, source, memo: 'Early-payment discount lost' });
              debits += round2(a.amount * dfx);
            }
            continue;
          }
          const amt = round2((a.amount + (a.discount ?? 0)) * dfx);
          rows.push({ ...base, account: CONTROL.AP, debit: amt, credit: 0, source });
          debits += amt;
        }
        const grossDisc = round2(
          s.allocations.filter((a) => !state.documents.find((d) => d.id === a.docId)?.netMethod).reduce((x, a) => x + (a.discount ?? 0), 0) * fx
        );
        if (grossDisc) rows.push({ ...base, account: EXT.DISCOUNT_RECEIVED, debit: 0, credit: grossDisc, source, memo: 'Early-payment discount received' });
        const onAccount = round2((s.amount + (s.wht?.amount ?? 0) - allocated) * fx);
        if (onAccount > 0.005) {
          rows.push({ ...base, account: CONTROL.AP, debit: onAccount, credit: 0, source, memo: `${party} — on account` });
          debits += onAccount;
        }
        const diff = round2(debits - grossDisc - cash - wht);
        if (Math.abs(diff) > 0.004) rows.push({ ...base, account: EXT.FX_GAIN, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, source, memo: 'Realised exchange difference' });
      }
      if (wht) rows.push({ ...base, account: EXT.WHT_PAYABLE, debit: 0, credit: wht, source, memo: `WHT ${s.wht!.code} deducted` });
      rows.push({ ...base, account: s.bankAccount, debit: 0, credit: cash, source, currency: isForeign(s) ? s.currency : undefined, fxAmount: isForeign(s) ? -s.amount : undefined });
    }
    // Simple receipts post bank then AR (ids :0, :1); simple payments AP then bank
    rows.forEach((r, i) => push(r, i));
    if (s.voided) rows.forEach((r, i) => push({ ...r, date: s.voided!.date, debit: r.credit, credit: r.debit, source: 'Payment voided', memo: `Void — ${s.voided!.reason}`, fxAmount: r.fxAmount !== undefined ? -r.fxAmount : undefined }, `v${i}`));
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
          source: JOURNAL_SOURCE[j.source] ?? 'Journal',
          sourceId: j.id,
          ref: j.number,
          memo: l.description || j.memo,
          department: l.department,
          costCenter: l.costCenter,
          project: l.project,
          plant: l.plant,
          companyId: companyOf(j),
          partnerCompany: l.partnerCompany,
          currency: l.currency,
          fxAmount: l.fxAmount,
          quantity: l.quantity,
          closing: j.source === 'YEAR_END'
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
  REVERSAL: 'Reversal',
  CASH: 'Cash journal',
  PAYROLL: 'Payroll',
  INVENTORY: 'Inventory',
  ALLOCATION: 'Cost allocation',
  YEAR_END: 'Year-end close',
  FX: 'FX revaluation',
  ECL: 'Expected credit loss',
  TREASURY: 'Treasury',
  INTERCOMPANY: 'Inter-company',
  TAX: 'Tax',
  COSTING: 'Product & project costing',
  SYSTEM: 'System posting'
};

const NORMAL_DEBIT: Record<AccountType, boolean> = { ASSET: true, EXPENSE: true, LIABILITY: false, EQUITY: false, INCOME: false };
export const normalDebit = (t: AccountType) => NORMAL_DEBIT[t];

/** Balance in the account's natural direction (assets/expenses debit, others credit). */
export const balanceOf = (entries: LedgerEntry[], account: Account, opts: { from?: string; to?: string; includeClosing?: boolean } = {}) => {
  let dr = 0;
  let cr = 0;
  for (const e of entries) {
    if (e.account !== account.code) continue;
    if (opts.from && e.date < opts.from) continue;
    if (opts.to && e.date > opts.to) continue;
    if (e.closing && opts.includeClosing === false) continue;
    dr += e.debit;
    cr += e.credit;
  }
  return round2(NORMAL_DEBIT[account.type] ? dr - cr : cr - dr);
};

export const trialBalance = (state: FinanceState, entries: LedgerEntry[], to = TODAY) =>
  state.accounts
    .filter((a) => !a.statistical)
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

/** Income statement. Year-end closing entries are left out unless asked for (the balance sheet needs them). */
export const profitAndLoss = (state: FinanceState, entries: LedgerEntry[], from: string, to: string, opts: { includeClosing?: boolean } = {}) => {
  const rows = (type: AccountType) =>
    state.accounts
      .filter((a) => a.type === type && !a.statistical)
      .map((a) => ({ account: a, amount: balanceOf(entries, a, { from, to, includeClosing: !!opts.includeClosing }) }))
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
      .filter((a) => a.type === type && !a.statistical)
      .map((a) => ({ account: a, amount: balanceOf(entries, a, { to: asAt }) }))
      .filter((r) => Math.abs(r.amount) > 0.005);
  const assets = rows('ASSET');
  const liabilities = rows('LIABILITY');
  const equity = rows('EQUITY');
  const yearStart = `${asAt.slice(0, 4)}-01-01`;
  // Earlier years are closed into retained earnings by the opening or year-end journal; closing entries count here
  const currentEarnings = profitAndLoss(state, entries, yearStart, asAt, { includeClosing: true }).netProfit;
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

export const bucketOf = (late: number, limits = [30, 60, 90]) => {
  if (late <= 0) return 0;
  const i = limits.findIndex((l) => late <= l);
  return i === -1 ? limits.length + 1 : i + 1;
};

/** Open items by party and bucket, in KES. Balances on a date in the past use what was settled by then. */
export const ageing = (state: FinanceState, kind: 'INVOICE' | 'BILL', today = TODAY) => {
  const byParty = new Map<string, number[]>();
  const totals = [0, 0, 0, 0, 0];
  const asAtState = today === TODAY ? state : asAtView(state, today);
  for (const d of asAtState.documents) {
    if (d.kind !== kind || d.status !== 'POSTED' || d.date > today) continue;
    const bal = docBalanceBase(asAtState, d);
    if (bal <= 0.005) continue;
    const b = bucketOf(daysBetween(d.dueDate, today));
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
    .filter((r) => r.party)
    .sort((a, b) => b.total - a.total);
  return { rows, totals, total: round2(totals.reduce((s, x) => s + x, 0)) };
};

/** The state as it stood on a date: only settlements, memos and applications dated by then count. */
export const asAtView = (state: FinanceState, date: string): FinanceState => ({
  ...state,
  settlements: state.settlements.filter((s) => s.date <= date).map((s) => (s.voided && s.voided.date > date ? { ...s, voided: undefined } : s)),
  memos: (state.memos ?? []).filter((m) => m.date <= date),
  applications: (state.applications ?? []).filter((a) => a.date <= date)
});

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
    const hit =
      book.find((e) => !used.has(e.id) && Math.abs(e.amount - line.amount) < 0.005 && !!line.reference && (e.ref === line.reference || e.extRef === line.reference)) ??
      book.find((e) => !used.has(e.id) && Math.abs(e.amount - line.amount) < 0.005 && Math.abs(daysBetween(e.date, line.date)) <= 5);
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

export const monthlyCharge = (a: FixedAsset) => round2((a.cost + (a.revaluation ?? 0) - a.residual) / a.lifeMonths);

export const accumulatedDepreciation = (state: FinanceState, a: FixedAsset) =>
  round2(a.openingDepreciation + state.depreciationRuns.reduce((s, r) => s + (r.perAsset[a.id] ?? 0), 0));

/** Carrying amount: cost plus revaluations less depreciation. */
export const carryingAmount = (state: FinanceState, a: FixedAsset) => round2(a.cost + (a.revaluation ?? 0) - accumulatedDepreciation(state, a));

/** Depreciation each active asset should take for a period (stops at residual value). Reducing balance uses the carrying amount. */
export const depreciationFor = (state: FinanceState, period: string) => {
  const perAsset: Record<string, number> = {};
  for (const a of state.assets) {
    if (a.status !== 'ACTIVE' || periodOf(a.acquired) > period) continue;
    const remaining = round2(a.cost + (a.revaluation ?? 0) - a.residual - accumulatedDepreciation(state, a));
    const charge = a.method === 'RB' && a.rbRate ? round2(((a.cost + (a.revaluation ?? 0) - accumulatedDepreciation(state, a)) * a.rbRate) / 12) : monthlyCharge(a);
    const c = Math.min(charge, remaining);
    if (c > 0.005) perAsset[a.id] = round2(c);
  }
  return { perAsset, total: round2(Object.values(perAsset).reduce((s, x) => s + x, 0)) };
};

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */

/** Budget lines of a year (lines without a year belong to the current budget year). */
export const budgetLinesFor = (state: FinanceState, year = state.budgetYear) => state.budgets.filter((b) => (b.year ?? state.budgetYear) === year);

export const budgetVsActual = (state: FinanceState, entries: LedgerEntry[], throughMonth: number, year = state.budgetYear) => {
  const from = `${year}-01-01`;
  const to = `${year}-${String(throughMonth + 1).padStart(2, '0')}-31`;
  return budgetLinesFor(state, year).map((b) => {
    const account = state.accounts.find((a) => a.code === b.account)!;
    const budget = round2(b.monthly.slice(0, throughMonth + 1).reduce((s, x) => s + x, 0));
    const annual = round2(b.monthly.reduce((s, x) => s + x, 0));
    const actual = round2(
      entries
        .filter((e) => e.account === b.account && e.date >= from && e.date <= to && !e.closing)
        .reduce((s, e) => s + (account.type === 'INCOME' ? e.credit - e.debit : e.debit - e.credit), 0)
    );
    const variance = round2(account.type === 'INCOME' ? actual - budget : budget - actual);
    return { line: b, account, budget, annual, actual, variance, used: budget ? actual / budget : 0 };
  });
};
