import { downloadText } from '../../../platform/csv';
import {
  addDays,
  addMonths,
  BASE_CURRENCY,
  companyOf,
  CONTROL,
  curOf,
  daysBetween,
  docBalance,
  docTotals,
  EXT,
  fxOf,
  iso,
  memoBalance,
  nextStatus,
  periodLabel,
  periodOf,
  permissions,
  postingBlock,
  rateOn,
  round2,
  TODAY
} from '../engine';
import type {
  Allocation,
  Application,
  CollectionAction,
  CreditExtension,
  DocLine,
  FinanceState,
  FinDocument,
  Hold,
  InvoiceBatch,
  Memo,
  Party,
  PaymentProposal,
  PaymentRun,
  RecurringDoc,
  Settlement,
  StaffLoan
} from '../types';
import { buildJournal, finAudit, finNotify, hist, withJournals, type Ctx, type Result } from './ctx';

export interface MemoDraft {
  id?: string;
  side: Memo['side'];
  partyId: string;
  date: string;
  lines: DocLine[];
  reasonCode: string;
  originalDocId?: string;
  poNumber?: string;
  rmaRef?: string;
  returnRef?: string;
  notes: string;
  department: string;
  currency?: string;
  fxRate?: number;
  allocations?: Allocation[];
}

/** Collections that use the standard approval workflow outside the store's own `transition`. */
export type WorkflowCollection = 'paymentRuns' | 'budgetChanges' | 'staffLoans';

const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

/** Money held on account from an advance, prepayment or down payment that is not yet applied. */
export const advanceLeft = (s: FinanceState, st: Settlement) =>
  round2(st.amount + (st.wht?.amount ?? 0) - s.applications.filter((a) => a.sourceId === st.id).reduce((x, a) => x + a.amount, 0));

/** Credit limit including any temporary extension in force on the date. */
export const effectiveLimit = (p: Party, date = TODAY) =>
  (p.creditLimit ?? 0) + (p.creditExtensions ?? []).filter((e) => e.from <= date && e.to >= date).reduce((x, e) => x + e.amount, 0);

/** Receivables, payables, holds, collections, payment runs, imports and staff debt. */
export const subledgerActions = (c: Ctx) => {
  const { ref, commit, fail, done, guard } = c;
  const actor = () => c.actor();
  const managerOnly = (what: string) => (actor().role === 'ACCOUNTANT' ? fail(`${what} needs a Finance Manager or Director`) : null);
  const directorOnly = (what: string) => (actor().role !== 'DIRECTOR' ? fail(`${what} is done by the Finance Director`) : null);
  const hold = (reason: string): Hold => ({ by: actor().name, at: c.now(), reason });
  const partyName = (s: FinanceState, id: string) => s.parties.find((p) => p.id === id)?.name ?? id;

  /* ---------------- Holds ---------------- */
  const holdDocument = (id: string, reason: string): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const d = s.documents.find((x) => x.id === id);
    if (!d) return fail('Document not found');
    if (!reason.trim()) return fail('Give the reason for the hold');
    if (d.hold) return fail(`${d.number} is already on hold`);
    commit({ ...s, documents: s.documents.map((x) => (x.id === id ? { ...x, hold: hold(reason), history: [...x.history, hist(c, 'Put on hold', reason)] } : x)) });
    finAudit(actor().name, 'Payment hold', d.number, reason);
    return done('On hold', `${d.number} will be skipped by payments until released`);
  };
  const releaseDocument = (id: string): Result => {
    const g = guard() ?? managerOnly('Releasing a hold');
    if (g) return g;
    const s = ref.current;
    const d = s.documents.find((x) => x.id === id);
    if (!d?.hold) return fail('This document is not on hold');
    commit({ ...s, documents: s.documents.map((x) => (x.id === id ? { ...x, hold: undefined, history: [...x.history, hist(c, 'Hold released')] } : x)) });
    return done('Hold released', d.number);
  };
  const holdParty = (id: string, reason: string): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!reason.trim()) return fail('Give the reason for the hold');
    const p = s.parties.find((x) => x.id === id);
    if (!p) return fail('Not found');
    commit({ ...s, parties: s.parties.map((x) => (x.id === id ? { ...x, paymentHold: hold(reason) } : x)) });
    finAudit(actor().name, 'Party on hold', p.name, reason);
    finNotify('Finance team', `${p.name} put on ${p.kind === 'SUPPLIER' ? 'payment' : 'credit'} hold`, p.name, reason, 'warning');
    return done('On hold', p.name);
  };
  const releaseParty = (id: string): Result => {
    const g = guard() ?? managerOnly('Releasing a hold');
    if (g) return g;
    const s = ref.current;
    commit({ ...s, parties: s.parties.map((x) => (x.id === id ? { ...x, paymentHold: undefined } : x)) });
    finAudit(actor().name, 'Party hold released', partyName(s, id));
    return done('Hold released', partyName(s, id));
  };

  /* ---------------- Entry batches ---------------- */
  const saveInvoiceBatch = (b: { kind: InvoiceBatch['kind']; controlTotal: number; controlCount: number }): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!(b.controlTotal > 0) || !(b.controlCount > 0)) return fail('Enter the batch control total and number of documents');
    const n = s.invoiceBatches.length + 1;
    const batch: InvoiceBatch = { id: c.uid('bt'), number: `BT-${TODAY.slice(0, 4)}-${String(n).padStart(3, '0')}`, kind: b.kind, controlTotal: b.controlTotal, controlCount: b.controlCount, docIds: [], createdBy: actor().name, at: c.now() };
    commit({ ...s, invoiceBatches: [batch, ...s.invoiceBatches] });
    return done('Batch opened', `${batch.number} — key the documents with this batch selected`, batch.id);
  };
  /** Batch total check: the keyed documents must add up to the control total and count. */
  const batchStatus = (id: string) => {
    const s = ref.current;
    const b = s.invoiceBatches.find((x) => x.id === id);
    const docs = s.documents.filter((d) => d.batchId === id && d.status !== 'VOID');
    const total = round2(docs.reduce((x, d) => x + docTotals(d).total, 0));
    return { batch: b, docs, total, count: docs.length, balanced: !!b && Math.abs(total - b.controlTotal) < 0.01 && docs.length === b.controlCount };
  };
  const submitBatch = (id: string): Result => {
    const g = guard();
    if (g) return g;
    const st = batchStatus(id);
    if (!st.batch) return fail('Batch not found');
    if (!st.balanced) return fail(`Batch is out of balance: ${st.count} documents totalling ${st.total.toLocaleString()} against control ${st.batch.controlCount} / ${st.batch.controlTotal.toLocaleString()}`);
    const s = ref.current;
    const ids = new Set(st.docs.filter((d) => d.status === 'DRAFT' || d.status === 'REJECTED').map((d) => d.id));
    commit({ ...s, documents: s.documents.map((d) => (ids.has(d.id) ? { ...d, status: 'SUBMITTED', approvals: [], history: [...d.history, hist(c, `Submitted with batch ${st.batch!.number}`)] } : d)) });
    finNotify('Finance Manager', `Batch ${st.batch.number} (${ids.size} documents) is waiting for approval`, st.batch.number);
    return done('Batch submitted', `${ids.size} documents sent for approval`);
  };
  const holdBatch = (id: string, reason: string): Result => {
    const g = guard();
    if (g) return g;
    if (!reason.trim()) return fail('Give the reason for the hold');
    const s = ref.current;
    commit({ ...s, invoiceBatches: s.invoiceBatches.map((b) => (b.id === id ? { ...b, hold: hold(reason) } : b)) });
    return done('Batch on hold', 'No payment can be made against its bills until released');
  };
  const releaseBatch = (id: string): Result => {
    const g = guard() ?? managerOnly('Releasing a hold');
    if (g) return g;
    const s = ref.current;
    commit({ ...s, invoiceBatches: s.invoiceBatches.map((b) => (b.id === id ? { ...b, hold: undefined } : b)) });
    return done('Batch released', '');
  };

  /* ---------------- Credit notes and debit memos ---------------- */
  /** AR credit note (customer) or AP debit memo (supplier) — reduces what is owed; approved and posted like other documents. */
  const saveMemo = (d: MemoDraft): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!d.partyId) return fail(`Choose the ${d.side === 'AR' ? 'customer' : 'supplier'}`);
    const lines = d.lines.filter((l) => l.description.trim() || l.price);
    if (!lines.length) return fail('Add at least one line');
    if (lines.some((l) => !l.account || l.qty <= 0 || l.price <= 0)) return fail('Every line needs an account, a quantity and a price above zero');
    if (!d.reasonCode) return fail('Choose a reason code');
    if (d.currency && d.currency !== BASE_CURRENCY && !(Number(d.fxRate) > 0)) return fail('Enter the exchange rate');
    if (d.originalDocId) {
      const orig = s.documents.find((x) => x.id === d.originalDocId);
      if (orig && curOf(orig) !== (d.currency || BASE_CURRENCY)) return fail(`${orig.number} is in ${curOf(orig)} — the memo must use the same currency`);
      if (orig && docTotals({ lines }).total - docTotals(orig).total > 0.005) return fail(`The memo cannot exceed ${orig.number} (${docTotals(orig).total.toLocaleString()})`);
    }
    const allocations = (d.allocations ?? []).filter((a) => a.amount > 0);
    if (allocations.reduce((x, a) => x + a.amount, 0) - docTotals({ lines }).total > 0.005) return fail('You have applied more than the memo is worth');
    if (d.id) {
      const ex = s.memos.find((m) => m.id === d.id);
      if (!ex) return fail('Not found');
      if (ex.status !== 'DRAFT' && ex.status !== 'REJECTED') return fail('Only drafts can be edited');
      commit({ ...s, memos: s.memos.map((m) => (m.id === d.id ? { ...m, ...d, lines, allocations, status: 'DRAFT', history: [...m.history, hist(c, 'Edited')] } : m)) });
      return done('Draft saved', ex.number, d.id);
    }
    const { number, sequence } = c.nextNumber(s, d.side === 'AR' ? 'CN' : 'DM', d.date);
    const memo: Memo = {
      ...d,
      lines,
      allocations,
      id: c.uid('cn'),
      number,
      status: 'DRAFT',
      preparedBy: actor().name,
      approvals: [],
      history: [hist(c, 'Created')],
      companyId: s.activeCompany,
      currency: d.currency && d.currency !== BASE_CURRENCY ? d.currency : undefined
    };
    commit({ ...s, memos: [memo, ...s.memos], sequence });
    return done(d.side === 'AR' ? 'Credit note created' : 'Debit memo created', `${number} saved as a draft`, memo.id);
  };
  /** Applies what is left on a posted memo to open items (partial and across several documents). */
  const applyMemo = (memoId: string, allocations: Allocation[]): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const m = s.memos.find((x) => x.id === memoId);
    if (!m || m.status !== 'POSTED') return fail('Only posted memos can be applied');
    const add = allocations.filter((a) => a.amount > 0);
    if (!add.length) return fail('Enter an amount against at least one document');
    if (add.reduce((x, a) => x + a.amount, 0) - memoBalance(m) > 0.005) return fail(`Only ${memoBalance(m).toLocaleString()} is left on ${m.number}`);
    for (const a of add) {
      const d = s.documents.find((x) => x.id === a.docId);
      if (!d || d.partyId !== m.partyId) return fail('Apply the memo to the same customer or supplier');
      if (a.amount - docBalance(s, d) > 0.005) return fail(`${d.number} only has ${docBalance(s, d).toLocaleString()} outstanding`);
      if (curOf(d) !== curOf(m)) return fail(`${d.number} is in ${curOf(d)}`);
    }
    const merged = [...m.allocations];
    for (const a of add) {
      const i = merged.findIndex((x) => x.docId === a.docId);
      if (i >= 0) merged[i] = { ...merged[i], amount: round2(merged[i].amount + a.amount) };
      else merged.push(a);
    }
    commit({ ...s, memos: s.memos.map((x) => (x.id === memoId ? { ...x, allocations: merged, history: [...x.history, hist(c, `Applied ${add.reduce((t, a) => t + a.amount, 0).toLocaleString()}`)] } : x)) });
    return done('Memo applied', `${m.number} applied to ${add.length} document${add.length > 1 ? 's' : ''}`);
  };

  /* ---------------- Write-offs, transfers, chargebacks and advances ---------------- */
  const writeOff = (docId: string, amount: number, reasonCode: string, date = TODAY): Result => {
    const g = guard() ?? managerOnly('Writing off a balance');
    if (g) return g;
    const s = ref.current;
    const d = s.documents.find((x) => x.id === docId);
    if (!d || d.status !== 'POSTED') return fail('Only posted documents can be written off');
    if (!reasonCode) return fail('Choose a write-off reason code');
    if (!(amount > 0) || amount - docBalance(s, d) > 0.005) return fail(`Enter an amount up to the ${docBalance(s, d).toLocaleString()} outstanding`);
    const base = round2(amount * fxOf(d));
    const ar = d.kind === 'INVOICE';
    const r = buildJournal(c, s, {
      date,
      memo: `Write-off ${d.number} — ${partyName(s, d.partyId)}`,
      source: 'SYSTEM',
      origin: 'Write-off',
      reasonCode,
      lines: ar
        ? [{ account: EXT.BAD_DEBTS, debit: base, department: d.department }, { account: CONTROL.AR, credit: base }]
        : [{ account: CONTROL.AP, debit: base }, { account: '4100', credit: base, description: 'Small supplier balance written back' }]
    });
    if ('error' in r) return fail(r.error);
    const app: Application = { id: c.uid('ap'), kind: 'WRITE_OFF', sourceId: r.journal.id, docId, amount: round2(amount), date, journalId: r.journal.id, by: actor().name, reasonCode };
    const next = withJournals(s, [r.journal], r.sequence);
    commit({ ...next, applications: [...s.applications, app], documents: next.documents.map((x) => (x.id === docId ? { ...x, history: [...x.history, hist(c, `Written off ${amount.toLocaleString()} by ${r.journal.number}`, reasonCode)] } : x)) });
    finAudit(actor().name, 'Write-off', d.number, `${amount} ${reasonCode}`);
    return done('Written off', `${r.journal.number}: ${amount.toLocaleString()} on ${d.number}`);
  };

  /** Moves the open balance of a document to a new open item (another customer, or a chargeback on the same one). */
  const moveBalance = (docId: string, toPartyId: string, memoType: FinDocument['memoType'] | undefined, reason: string, amount?: number): Result => {
    const s = ref.current;
    const d = s.documents.find((x) => x.id === docId);
    if (!d || d.status !== 'POSTED') return fail('Only posted documents can be moved');
    const bal = docBalance(s, d);
    const amt = round2(amount ?? bal);
    if (!(amt > 0) || amt - bal > 0.005) return fail(`Only ${bal.toLocaleString()} is outstanding on ${d.number}`);
    if (!reason.trim()) return fail('Give a reason');
    const block = postingBlock(s, TODAY);
    if (block) return fail(block);
    const ctl = d.kind === 'INVOICE' ? CONTROL.AR : CONTROL.AP;
    const prefix = memoType === 'CHARGEBACK' ? 'CB' : d.kind === 'INVOICE' ? 'INV' : 'BILL';
    const { number, sequence } = c.nextNumber(s, prefix, TODAY);
    const nd: FinDocument = {
      id: c.uid(d.kind === 'INVOICE' ? 'inv' : 'bill'),
      kind: d.kind,
      number,
      partyId: toPartyId,
      date: TODAY,
      dueDate: memoType === 'CHARGEBACK' ? addDays(TODAY, 14) : d.dueDate,
      reference: d.number,
      department: d.department,
      // The line posts to the control account itself, so the ledger total is unchanged: only the open item moves
      lines: [{ id: c.uid('l'), description: `${memoType === 'CHARGEBACK' ? 'Short payment' : 'Balance transferred'} from ${d.number}`, account: ctl, qty: 1, price: amt, vat: false, taxCode: 'E0', taxRate: 0 }],
      notes: reason,
      status: 'POSTED',
      preparedBy: actor().name,
      approvals: [{ by: actor().name, role: actor().role, at: c.now() }],
      history: [hist(c, memoType === 'CHARGEBACK' ? `Chargeback raised from ${d.number}` : `Transferred from ${d.number}`, reason)],
      companyId: d.companyId,
      currency: d.currency,
      fxRate: d.fxRate,
      memoType,
      relatesTo: d.id
    };
    const app: Application = { id: c.uid('ap'), kind: 'TRANSFER', sourceId: nd.id, docId, amount: amt, date: TODAY, journalId: '', by: actor().name, reasonCode: reason };
    commit({
      ...s,
      sequence,
      documents: [nd, ...s.documents.map((x) => (x.id === docId ? { ...x, history: [...x.history, hist(c, `${amt.toLocaleString()} moved to ${number}`, reason)] } : x))],
      applications: [...s.applications, app]
    });
    finAudit(actor().name, memoType === 'CHARGEBACK' ? 'Chargeback' : 'Transfer', d.number, `${number} ${reason}`);
    return done(memoType === 'CHARGEBACK' ? 'Chargeback raised' : 'Balance transferred', `${number} for ${amt.toLocaleString()} — ${partyName(s, toPartyId)}`, nd.id);
  };
  const transferInvoice = (docId: string, toPartyId: string, reason: string): Result => {
    const g = guard() ?? managerOnly('Transferring a balance');
    if (g) return g;
    const s = ref.current;
    const d = s.documents.find((x) => x.id === docId);
    const to = s.parties.find((p) => p.id === toPartyId);
    if (!d || !to) return fail('Choose the document and the new customer or supplier');
    if (to.kind !== (d.kind === 'INVOICE' ? 'CUSTOMER' : 'SUPPLIER')) return fail('Transfer to the same kind of party');
    if (to.id === d.partyId) return fail('Choose a different party');
    return moveBalance(docId, toPartyId, undefined, reason);
  };
  /** Short payment: the unpaid remainder becomes a separate chargeback item and the original invoice is cleared. */
  const chargeback = (docId: string, reason: string): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const d = s.documents.find((x) => x.id === docId);
    if (!d || d.kind !== 'INVOICE') return fail('Chargebacks are raised on customer invoices');
    const paid = round2(docTotals(d).total - docBalance(s, d));
    if (paid <= 0) return fail('Nothing has been received on this invoice yet — chase the full amount instead');
    return moveBalance(docId, d.partyId, 'CHARGEBACK', reason);
  };
  /** Applies a customer advance (or supplier prepayment / down payment) to an invoice or bill. */
  const applyAdvance = (settlementId: string, docId: string, amount: number, date = TODAY): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const st = s.settlements.find((x) => x.id === settlementId);
    const d = s.documents.find((x) => x.id === docId);
    if (!st || st.status !== 'POSTED' || st.voided || !st.purpose || st.purpose === 'NORMAL') return fail('Choose a posted advance or prepayment');
    if (!d || d.status !== 'POSTED' || d.partyId !== st.partyId) return fail('Choose a posted document of the same party');
    if (curOf(d) !== curOf(st)) return fail(`${d.number} is in ${curOf(d)}`);
    const left = advanceLeft(s, st);
    if (!(amount > 0) || amount - left > 0.005) return fail(`Only ${left.toLocaleString()} is left on ${st.number}`);
    if (amount - docBalance(s, d) > 0.005) return fail(`${d.number} only has ${docBalance(s, d).toLocaleString()} outstanding`);
    const base = round2(amount * fxOf(d));
    const rec = st.kind === 'RECEIPT';
    const r = buildJournal(c, s, {
      date,
      memo: `${st.number} applied to ${d.number}`,
      source: 'SYSTEM',
      origin: rec ? 'Customer advance' : 'Supplier prepayment',
      lines: rec ? [{ account: EXT.CUSTOMER_ADVANCES, debit: base }, { account: CONTROL.AR, credit: base }] : [{ account: CONTROL.AP, debit: base }, { account: EXT.SUPPLIER_ADVANCES, credit: base }]
    });
    if ('error' in r) return fail(r.error);
    const app: Application = { id: c.uid('ap'), kind: rec ? 'ADVANCE' : 'PREPAYMENT', sourceId: st.id, docId, amount: round2(amount), date, journalId: r.journal.id, by: actor().name };
    commit({ ...withJournals(s, [r.journal], r.sequence), applications: [...s.applications, app] });
    return done('Advance applied', `${r.journal.number}: ${amount.toLocaleString()} from ${st.number} to ${d.number}`);
  };

  /* ---------------- Credit management and collections ---------------- */
  const addCreditExtension = (partyId: string, e: Omit<CreditExtension, 'id' | 'approvedBy'>): Result => {
    const g = guard() ?? managerOnly('Extending a credit limit');
    if (g) return g;
    if (!(e.amount > 0) || !e.from || !e.to || e.to < e.from) return fail('Enter the extra amount and a valid date range');
    if (!e.reason.trim()) return fail('Give the reason');
    const s = ref.current;
    commit({ ...s, parties: s.parties.map((p) => (p.id === partyId ? { ...p, creditExtensions: [...(p.creditExtensions ?? []), { ...e, id: c.uid('ce'), approvedBy: actor().name }] } : p)) });
    finAudit(actor().name, 'Temporary credit limit', partyName(s, partyId), `+${e.amount} ${e.from}–${e.to}`);
    return done('Credit limit extended', `${partyName(s, partyId)}: +${e.amount.toLocaleString()} until ${e.to}`);
  };
  const logCollection = (a: Omit<CollectionAction, 'id' | 'at' | 'by'>): Result => {
    const g = guard();
    if (g) return g;
    if (!a.text.trim() && a.action !== 'PROMISE') return fail('Write what happened');
    if (a.action === 'PROMISE' && (!a.promiseDate || !(Number(a.amount) > 0))) return fail('Enter the promised date and amount');
    const s = ref.current;
    const entry: CollectionAction = { ...a, id: c.uid('col'), at: c.now(), by: actor().name, text: a.text || `Promised to pay ${Number(a.amount).toLocaleString()} by ${a.promiseDate}` };
    commit({
      ...s,
      collectionLog: [entry, ...s.collectionLog],
      parties: s.parties.map((p) =>
        p.id === a.partyId ? { ...p, collector: a.action === 'ASSIGNED' ? a.agent : p.collector, notes: [...(p.notes ?? []), { at: c.now(), by: actor().name, text: entry.text, promiseDate: a.promiseDate, invoiceId: a.invoiceId || undefined }] } : p
      )
    });
    return done('Logged', entry.text);
  };
  /** Dunning run: each overdue invoice above the minimum moves to the stage its age calls for (letters are simulated email). */
  const runCollections = (asAt = TODAY): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const stages = [...s.settings.dunning].sort((a, b) => b.days - a.days);
    const log: CollectionAction[] = [];
    let skipped = 0;
    const assign = new Map<string, string>();
    for (const d of s.documents) {
      if (d.kind !== 'INVOICE' || d.status !== 'POSTED' || companyOf(d) !== s.activeCompany) continue;
      const bal = docBalance(s, d);
      if (bal <= 0.005 || d.dueDate >= asAt) continue;
      if (bal * fxOf(d) < s.settings.collectionMinimum) {
        skipped++;
        continue;
      }
      if (d.delivery?.dispute && !d.delivery.dispute.resolved) continue;
      const late = daysBetween(d.dueDate, asAt);
      const stage = stages.find((x) => late >= x.days);
      if (!stage) continue;
      if (s.collectionLog.some((x) => x.invoiceId === d.id && x.action === stage.action)) continue;
      const party = s.parties.find((p) => p.id === d.partyId);
      const text = fill(stage.letter, { invoice: d.number, amount: `${curOf(d)} ${bal.toLocaleString()}`, due: d.dueDate, days: String(late), customer: party?.name ?? '' });
      log.push({ id: c.uid('col'), invoiceId: d.id, partyId: d.partyId, at: c.now(), by: actor().name, action: stage.action, text, amount: bal, agent: stage.action === 'AGENCY' ? 'Mombasa Credit Recovery Agency' : undefined });
      if (stage.action === 'AGENCY') assign.set(d.partyId, 'Mombasa Credit Recovery Agency');
      if (party) finNotify(party.email || party.name, `${stage.action === 'REMINDER' ? 'Payment reminder' : 'Overdue notice'}: ${d.number}`, d.number, text, stage.action === 'REMINDER' ? 'info' : 'warning');
    }
    if (!log.length) return done('Collections run', `Nothing new to send${skipped ? ` (${skipped} invoices below the ${s.settings.collectionMinimum.toLocaleString()} minimum)` : ''}`);
    commit({ ...s, collectionLog: [...log, ...s.collectionLog], parties: s.parties.map((p) => (assign.has(p.id) ? { ...p, collector: assign.get(p.id) } : p)) });
    finAudit(actor().name, 'Collections run', asAt, `${log.length} letters`);
    return done('Collections run', `${log.length} reminders and notices sent (simulated email)${skipped ? `; ${skipped} below the minimum` : ''}`);
  };
  /** Monthly finance charges on overdue invoices (simple: on the invoice balance; compound: also on earlier unpaid charges). */
  const financeCharges = (asAt = TODAY): Result => {
    const g = guard() ?? managerOnly('Raising finance charges');
    if (g) return g;
    const s = ref.current;
    const block = postingBlock(s, asAt);
    if (block) return fail(block);
    const pct = s.settings.financeChargePct / 100;
    if (!(pct > 0)) return fail('Set the finance charge rate in Setup first');
    const period = periodOf(asAt);
    const created: FinDocument[] = [];
    let seq = s.sequence;
    let tmp = { ...s };
    for (const d of s.documents) {
      if (d.kind !== 'INVOICE' || d.status !== 'POSTED' || companyOf(d) !== s.activeCompany) continue;
      if (d.memoType === 'FINANCE_CHARGE' && !s.settings.financeChargeCompound) continue;
      const bal = docBalance(s, d);
      if (bal <= 0.005 || daysBetween(d.dueDate, asAt) < s.settings.financeChargeFrom) continue;
      if (d.delivery?.dispute && !d.delivery.dispute.resolved) continue;
      if (s.documents.some((x) => x.memoType === 'FINANCE_CHARGE' && x.relatesTo === d.id && periodOf(x.date) === period)) continue;
      const charge = round2(bal * pct);
      if (charge < 1) continue;
      const n = c.nextNumber(tmp, 'FC', asAt);
      seq = n.sequence;
      tmp = { ...tmp, sequence: seq };
      created.push({
        id: c.uid('inv'),
        kind: 'INVOICE',
        number: n.number,
        partyId: d.partyId,
        date: asAt,
        dueDate: addDays(asAt, 14),
        reference: d.number,
        department: d.department,
        lines: [{ id: c.uid('l'), description: `Finance charge ${s.settings.financeChargePct}% on ${d.number} (${daysBetween(d.dueDate, asAt)} days overdue)`, account: EXT.INTEREST_INCOME, qty: 1, price: charge, vat: false, taxCode: 'E0', taxRate: 0 }],
        notes: 'Late-payment finance charge',
        status: 'POSTED',
        preparedBy: actor().name,
        approvals: [{ by: actor().name, role: actor().role, at: c.now() }],
        history: [hist(c, 'Finance charge raised')],
        companyId: d.companyId,
        currency: d.currency,
        fxRate: d.fxRate,
        memoType: 'FINANCE_CHARGE',
        relatesTo: d.id
      });
    }
    if (!created.length) return done('Finance charges', 'No invoice is old enough to be charged this month');
    commit({
      ...s,
      sequence: seq,
      documents: [...created, ...s.documents],
      collectionLog: [...created.map((f) => ({ id: c.uid('col'), invoiceId: f.relatesTo!, partyId: f.partyId, at: c.now(), by: actor().name, action: 'FINANCE_CHARGE' as const, text: `${f.number}: ${f.lines[0].description}`, amount: f.lines[0].price })), ...s.collectionLog]
    });
    return done('Finance charges raised', `${created.length} charges, ${round2(created.reduce((x, f) => x + f.lines[0].price, 0)).toLocaleString()} in total`);
  };

  /* ---------------- E-invoicing (simulated KRA eTIMS and email) ---------------- */
  const sendInvoice = (docId: string, channel: 'EMAIL' | 'PORTAL' | 'ETIMS' = 'ETIMS'): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const d = s.documents.find((x) => x.id === docId);
    if (!d || d.kind !== 'INVOICE' || d.status !== 'POSTED') return fail('Only posted invoices can be sent');
    const party = s.parties.find((p) => p.id === d.partyId);
    if (!party?.pin) return fail(`${party?.name ?? 'The customer'} has no KRA PIN — eTIMS needs it`);
    const cu = `KRAMW${d.date.replace(/-/g, '')}${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`;
    const delivery = {
      status: 'SENT' as const,
      channel,
      sentAt: c.now(),
      sentBy: actor().name,
      etims: { cuInvoiceNo: cu, qr: `https://etims.kra.go.ke/verify/${cu}`, at: c.now() },
      payLink: `https://pay.example/kericho/${d.number}`
    };
    commit({ ...s, documents: s.documents.map((x) => (x.id === docId ? { ...x, delivery, history: [...x.history, hist(c, `Sent by ${channel.toLowerCase()} (simulated)`, `eTIMS CU ${cu}`)] } : x)) });
    finNotify(party.email || party.name, `Invoice ${d.number} from Kericho Highland Estates`, d.number, `Amount ${curOf(d)} ${docTotals(d).total.toLocaleString()} due ${d.dueDate}. Pay online: ${delivery.payLink}. eTIMS CU ${cu}`);
    return done('Invoice sent (simulated)', `${d.number} validated on eTIMS as ${cu} and emailed to ${party.email || party.name}`);
  };
  const disputeInvoice = (docId: string, reason: string): Result => {
    const g = guard();
    if (g) return g;
    if (!reason.trim()) return fail('Record what the customer disputes');
    const s = ref.current;
    const d = s.documents.find((x) => x.id === docId);
    if (!d || d.kind !== 'INVOICE') return fail('Not found');
    const delivery = { ...(d.delivery ?? { channel: 'EMAIL' as const, sentAt: c.now(), sentBy: actor().name }), status: 'DISPUTED' as const, dispute: { at: c.now(), reason } };
    commit({ ...s, documents: s.documents.map((x) => (x.id === docId ? { ...x, delivery, history: [...x.history, hist(c, 'Disputed by customer', reason)] } : x)) });
    finNotify('Finance Manager', `${d.number} disputed by ${partyName(s, d.partyId)}`, d.number, reason, 'warning');
    return done('Dispute logged', `${d.number} is excluded from dunning and finance charges until resolved`);
  };
  const resolveDispute = (docId: string, resolution: string): Result => {
    const g = guard();
    if (g) return g;
    if (!resolution.trim()) return fail('Record how it was resolved');
    const s = ref.current;
    const d = s.documents.find((x) => x.id === docId);
    if (!d?.delivery?.dispute) return fail('No open dispute');
    commit({ ...s, documents: s.documents.map((x) => (x.id === docId ? { ...x, delivery: { ...d.delivery!, status: 'ACCEPTED', dispute: { ...d.delivery!.dispute!, resolved: resolution } }, history: [...x.history, hist(c, 'Dispute resolved', resolution)] } : x)) });
    return done('Dispute resolved', d.number);
  };
  /** Simulated online payment through the invoice link: records a draft receipt for the cashier to confirm. */
  const payByLink = (docId: string): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const d = s.documents.find((x) => x.id === docId);
    if (!d?.delivery?.payLink) return fail('Send the invoice first — the payment link goes out with it');
    const bal = docBalance(s, d);
    if (bal <= 0.005) return fail('Nothing is outstanding');
    const { number, sequence } = c.nextNumber(s, 'RCT', TODAY);
    const rec: Settlement = {
      id: c.uid('rct'),
      kind: 'RECEIPT',
      number,
      partyId: d.partyId,
      date: TODAY,
      bankAccount: curOf(d) === 'USD' ? '1040' : '1010',
      method: 'M-PESA',
      reference: `LINK-${d.number}`,
      amount: bal,
      allocations: [{ docId, amount: bal }],
      notes: 'Paid through the online invoice link (simulated)',
      status: 'DRAFT',
      preparedBy: 'Payment gateway',
      approvals: [],
      history: [hist(c, 'Online payment received (simulated)', undefined, 'Payment gateway')],
      companyId: d.companyId,
      currency: d.currency,
      fxRate: d.currency ? rateOn(s, d.currency, TODAY) : undefined
    };
    commit({ ...s, sequence, settlements: [rec, ...s.settlements] });
    return done('Online payment recorded', `${number} drafted for ${bal.toLocaleString()} — confirm and post it in Receipts`, rec.id);
  };

  /* ---------------- Imports ---------------- */
  const pick = (r: Record<string, string>, ...keys: string[]) => {
    for (const k of keys) {
      const hit = Object.keys(r).find((x) => x.trim().toLowerCase() === k);
      if (hit && r[hit] !== undefined && r[hit] !== '') return r[hit].trim();
    }
    return '';
  };
  /** CSV of invoices or bills: party, date, due, reference, description, account, qty, price, vat (one row per line, grouped by reference). */
  const importDocuments = (kind: FinDocument['kind'], rows: Record<string, string>[]): Result => {
    const g = guard();
    if (g) return g;
    let s = ref.current;
    const errors: string[] = [];
    const groups = new Map<string, Record<string, string>[]>();
    rows.forEach((r, i) => {
      const key = pick(r, 'reference', 'invoice', 'ref') || `row${i}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    });
    const docs: FinDocument[] = [];
    for (const [ref_, rs] of groups) {
      const first = rs[0];
      const pname = pick(first, 'party', 'customer', 'supplier', 'name').toLowerCase();
      const party = s.parties.find((p) => p.kind === (kind === 'INVOICE' ? 'CUSTOMER' : 'SUPPLIER') && (p.name.toLowerCase() === pname || p.pin.toLowerCase() === pname || p.id === pname));
      if (!party) {
        errors.push(`${ref_}: unknown ${kind === 'INVOICE' ? 'customer' : 'supplier'} "${pick(first, 'party', 'customer', 'supplier', 'name')}"`);
        continue;
      }
      const date = pick(first, 'date') || TODAY;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push(`${ref_}: date must be YYYY-MM-DD`);
        continue;
      }
      const lines: DocLine[] = [];
      let bad = '';
      for (const r of rs) {
        const account = pick(r, 'account') || (kind === 'INVOICE' ? '4000' : '5000');
        const qty = Number(pick(r, 'qty', 'quantity') || 1);
        const price = Number(pick(r, 'price', 'amount', 'unit price'));
        if (!s.accounts.some((a) => a.code === account)) bad = `account ${account} does not exist`;
        if (!(qty > 0) || !(price > 0)) bad = 'quantity and price must be above zero';
        const vat = !/^(n|no|0|false)$/i.test(pick(r, 'vat') || 'yes');
        lines.push({ id: c.uid('l'), description: pick(r, 'description', 'item') || 'Imported line', account, qty, price, vat, taxCode: vat ? 'V16' : 'Z0', taxRate: vat ? 0.16 : 0 });
      }
      if (bad) {
        errors.push(`${ref_}: ${bad}`);
        continue;
      }
      if (kind === 'BILL' && s.documents.some((d) => d.kind === 'BILL' && d.partyId === party.id && d.reference === ref_ && d.status !== 'VOID')) {
        errors.push(`${ref_}: already entered for ${party.name}`);
        continue;
      }
      const n = c.nextNumber(s, kind === 'INVOICE' ? 'INV' : 'BILL', date);
      s = { ...s, sequence: n.sequence };
      docs.push({
        id: c.uid(kind === 'INVOICE' ? 'inv' : 'bill'),
        kind,
        number: n.number,
        partyId: party.id,
        date,
        dueDate: pick(first, 'due', 'due date', 'duedate') || addDays(date, party.terms),
        reference: ref_.startsWith('row') ? '' : ref_,
        department: pick(first, 'department') || 'Administration',
        lines,
        notes: 'Imported from CSV',
        match: kind === 'BILL' ? { po: pick(first, 'po'), grn: pick(first, 'grn'), matched: false } : undefined,
        status: 'DRAFT',
        preparedBy: actor().name,
        approvals: [],
        history: [hist(c, 'Imported from CSV')],
        companyId: s.activeCompany
      });
    }
    if (docs.length) commit({ ...s, documents: [...docs, ...s.documents] });
    if (!docs.length) return fail(errors.length ? errors.slice(0, 4).join('; ') : 'The file had no rows');
    return done('Import complete', `${docs.length} draft ${kind === 'INVOICE' ? 'invoices' : 'bills'} created${errors.length ? `; ${errors.length} skipped: ${errors.slice(0, 3).join('; ')}` : ''}`);
  };
  const importParties = (kind: Party['kind'], rows: Record<string, string>[]): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const added: Party[] = [];
    const errors: string[] = [];
    for (const r of rows) {
      const name = pick(r, 'name');
      if (!name) continue;
      if ([...s.parties, ...added].some((p) => p.kind === kind && p.name.toLowerCase() === name.toLowerCase())) {
        errors.push(`${name}: already exists`);
        continue;
      }
      const pin = pick(r, 'pin', 'kra pin').toUpperCase();
      if (pin && !/^[AP]\d{9}[A-Z]$/.test(pin)) {
        errors.push(`${name}: KRA PIN ${pin} is not valid`);
        continue;
      }
      added.push({ id: c.uid(kind === 'CUSTOMER' ? 'c' : 's'), kind, name, pin, email: pick(r, 'email'), phone: pick(r, 'phone'), terms: Number(pick(r, 'terms') || 30), creditLimit: Number(pick(r, 'credit limit', 'creditlimit') || 0) || undefined, category: pick(r, 'category') || 'Imported' });
    }
    if (!added.length) return fail(errors.length ? errors.slice(0, 4).join('; ') : 'No rows with a name');
    commit({ ...s, parties: [...s.parties, ...added] });
    return done('Imported', `${added.length} ${kind === 'CUSTOMER' ? 'customers' : 'suppliers'} added${errors.length ? `; ${errors.length} skipped` : ''}`);
  };
  /** Supplier e-invoice (eTIMS JSON) → draft bill. Format: {supplierPin, invoiceNo, date, dueDate?, currency?, lines:[{description, qty, price, taxCode?, account?}]} */
  const importEInvoice = (json: string): Result => {
    const g = guard();
    if (g) return g;
    let data: { supplierPin?: string; invoiceNo?: string; date?: string; dueDate?: string; currency?: string; po?: string; lines?: { description?: string; qty?: number; price?: number; taxCode?: string; account?: string }[] };
    try {
      data = JSON.parse(json);
    } catch {
      return fail('The e-invoice is not valid JSON');
    }
    const s = ref.current;
    const sup = s.parties.find((p) => p.kind === 'SUPPLIER' && p.pin && p.pin.toUpperCase() === String(data.supplierPin ?? '').toUpperCase());
    if (!sup) return fail(`No supplier with KRA PIN ${data.supplierPin ?? '(missing)'}`);
    if (!data.invoiceNo || !data.date || !data.lines?.length) return fail('The e-invoice needs invoiceNo, date and lines');
    if (s.documents.some((d) => d.kind === 'BILL' && d.partyId === sup.id && d.reference === data.invoiceNo && d.status !== 'VOID')) return fail(`${data.invoiceNo} from ${sup.name} is already in the system`);
    const lines: DocLine[] = data.lines.map((l) => {
      const code = l.taxCode || 'V16';
      const t = s.taxCodes.find((x) => x.code === code);
      const rate = t ? [...t.rates].reverse().find((r) => r.from <= data.date!)?.rate ?? 0 : 0.16;
      return { id: c.uid('l'), description: l.description || 'E-invoice line', account: l.account || '5000', qty: Number(l.qty) || 1, price: Number(l.price) || 0, vat: rate > 0, taxCode: code, taxRate: rate };
    });
    if (lines.some((l) => !(l.price > 0))) return fail('Every line needs a price');
    const { number, sequence } = c.nextNumber(s, 'BILL', data.date);
    const cur = data.currency && data.currency !== BASE_CURRENCY ? data.currency : undefined;
    const bill: FinDocument = {
      id: c.uid('bill'),
      kind: 'BILL',
      number,
      partyId: sup.id,
      date: data.date,
      dueDate: data.dueDate || addDays(data.date, sup.terms),
      reference: data.invoiceNo,
      department: 'Operations',
      lines,
      notes: 'Received as a supplier e-invoice (eTIMS)',
      match: { po: data.po ?? '', grn: '', matched: false },
      status: 'DRAFT',
      preparedBy: actor().name,
      approvals: [],
      history: [hist(c, 'Imported from supplier e-invoice')],
      companyId: s.activeCompany,
      currency: cur,
      fxRate: cur ? rateOn(s, cur, data.date) : undefined
    };
    commit({ ...s, sequence, documents: [bill, ...s.documents] });
    return done('E-invoice imported', `${number} drafted from ${sup.name} ${data.invoiceNo}`, bill.id);
  };
  /**
   * Bank statement import (CSV: date, description, reference, amount or debit/credit). Credits that quote an open
   * invoice number become draft receipts allocated to that invoice (lockbox-style cash application).
   */
  const importStatement = (account: string, rows: Record<string, string>[], file = 'statement.csv'): Result => {
    const g = guard();
    if (g) return g;
    let s = ref.current;
    const importId = c.uid('imp');
    const lines: FinanceState['bankLines'] = [];
    const receipts: Settlement[] = [];
    const bad: string[] = [];
    rows.forEach((r, i) => {
      const date = pick(r, 'date', 'value date');
      const amount = pick(r, 'amount') ? Number(pick(r, 'amount').replace(/,/g, '')) : Number(pick(r, 'credit').replace(/,/g, '') || 0) - Number(pick(r, 'debit').replace(/,/g, '') || 0);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !amount) {
        bad.push(`row ${i + 2}`);
        return;
      }
      const description = pick(r, 'description', 'narrative', 'details');
      const reference = pick(r, 'reference', 'ref');
      if (s.bankLines.some((l) => l.bankAccount === account && l.date === date && l.amount === amount && l.reference === reference)) {
        bad.push(`row ${i + 2} already imported`);
        return;
      }
      lines.push({ id: c.uid('bl'), bankAccount: account, date, description, reference, amount, companyId: s.activeCompany, importId });
      if (amount > 0) {
        const text = `${description} ${reference}`.toUpperCase();
        const inv = s.documents.find((d) => d.kind === 'INVOICE' && d.status === 'POSTED' && text.includes(d.number.toUpperCase()) && docBalance(s, d) > 0.005);
        if (inv && !receipts.some((x) => x.allocations[0].docId === inv.id)) {
          const n = c.nextNumber(s, 'RCT', date);
          s = { ...s, sequence: n.sequence };
          receipts.push({
            id: c.uid('rct'),
            kind: 'RECEIPT',
            number: n.number,
            partyId: inv.partyId,
            date,
            bankAccount: account,
            method: 'EFT',
            reference: reference || inv.number,
            amount,
            allocations: [{ docId: inv.id, amount: round2(Math.min(amount, docBalance(s, inv))) }],
            notes: `Auto cash application from statement import (${file})`,
            status: 'DRAFT',
            preparedBy: actor().name,
            approvals: [],
            history: [hist(c, 'Created from bank statement')],
            companyId: s.activeCompany
          });
        }
      }
    });
    if (!lines.length) return fail(bad.length ? `Nothing imported: ${bad.slice(0, 4).join(', ')} (need date YYYY-MM-DD and an amount)` : 'The file had no rows');
    commit({
      ...s,
      bankLines: [...s.bankLines, ...lines],
      settlements: [...receipts, ...s.settlements],
      statementImports: [{ id: importId, account, file, lines: lines.length, matched: 0, receipts: receipts.length, at: c.now(), by: actor().name }, ...s.statementImports]
    });
    return done('Statement imported', `${lines.length} lines added${receipts.length ? `; ${receipts.length} draft receipts matched to invoices` : ''}${bad.length ? `; ${bad.length} skipped` : ''}`);
  };

  /* ---------------- Recurring invoices and bills ---------------- */
  const saveRecurring = (r: RecurringDoc): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (!r.name.trim() || !r.partyId) return fail('Name the schedule and choose the party');
    if (!r.lines.length || r.lines.some((l) => !l.account || !(l.price > 0) || !(l.qty > 0))) return fail('Every line needs an account, quantity and price');
    if (r.dayOfMonth < 1 || r.dayOfMonth > 28) return fail('Use a day between 1 and 28');
    if (r.end && r.end < r.start) return fail('The end date is before the start');
    const exists = s.recurring.some((x) => x.id === r.id);
    const clean = { ...r, id: r.id || c.uid('rc'), companyId: r.companyId ?? s.activeCompany, nextRun: r.nextRun || r.start };
    commit({ ...s, recurring: exists ? s.recurring.map((x) => (x.id === r.id ? clean : x)) : [clean, ...s.recurring] });
    return done('Schedule saved', clean.name);
  };
  /** Creates draft documents for every schedule due on or before the date and sends reminders for the ones coming up. */
  const generateRecurring = (asAt = TODAY): Result => {
    const g = guard();
    if (g) return g;
    let s = ref.current;
    const docs: FinDocument[] = [];
    let reminders = 0;
    const recurring = s.recurring.map((r) => {
      if (!r.active || companyOf(r) !== s.activeCompany) return r;
      let next = { ...r };
      let guardN = 0;
      while (next.nextRun <= asAt && (!next.end || next.nextRun <= next.end) && guardN++ < 12) {
        const party = s.parties.find((p) => p.id === r.partyId);
        const n = c.nextNumber(s, r.kind === 'INVOICE' ? 'INV' : 'BILL', next.nextRun);
        s = { ...s, sequence: n.sequence };
        docs.push({
          id: c.uid(r.kind === 'INVOICE' ? 'inv' : 'bill'),
          kind: r.kind,
          number: n.number,
          partyId: r.partyId,
          date: next.nextRun,
          dueDate: addDays(next.nextRun, party?.terms ?? 30),
          reference: `${r.name} ${periodLabel(periodOf(next.nextRun))}`,
          department: r.department,
          lines: r.lines.map((l) => ({ ...l, id: c.uid('l') })),
          notes: `Generated from recurring schedule "${r.name}"`,
          match: r.kind === 'BILL' ? { po: 'CONTRACT', grn: 'n/a — service contract', matched: true, note: 'Recurring service contract' } : undefined,
          status: 'DRAFT',
          preparedBy: actor().name,
          approvals: [],
          history: [hist(c, 'Generated from a recurring schedule')],
          companyId: r.companyId,
          recurringId: r.id
        });
        const step = r.frequency === 'MONTHLY' ? 1 : r.frequency === 'QUARTERLY' ? 3 : 12;
        next = { ...next, generated: [...next.generated, n.number], nextRun: addMonths(next.nextRun, step) };
      }
      if (next.nextRun > asAt && next.nextRun <= addDays(asAt, r.notifyDaysBefore)) {
        reminders++;
        finNotify('Finance team', `Recurring ${r.kind === 'INVOICE' ? 'invoice' : 'bill'} "${r.name}" is due on ${next.nextRun}`, r.name);
      }
      return next;
    });
    commit({ ...s, recurring, documents: [...docs, ...s.documents] });
    return done('Recurring run', `${docs.length} draft documents created${reminders ? `; ${reminders} upcoming reminders sent` : ''}`);
  };

  /* ---------------- Generic approvals for runs, budget changes and staff loans ---------------- */
  const workflow = (collection: WorkflowCollection, id: string, action: 'submit' | 'approve' | 'reject' | 'void', note = ''): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const list = s[collection] as (PaymentRun | StaffLoan | FinanceState['budgetChanges'][number])[];
    const doc = list.find((x) => x.id === id);
    if (!doc) return fail('Not found');
    const p = permissions(s, doc, actor());
    const set = (patch: object, label: string) =>
      commit({ ...ref.current, [collection]: list.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, hist(c, label, note)] } : x)) });
    if (action === 'submit') {
      if (!p.submit) return fail('Only drafts can be submitted');
      set({ status: 'SUBMITTED', approvals: [] }, 'Submitted for approval');
      finNotify('Finance Manager', `${doc.number} is waiting for your approval`, doc.number);
      return done('Submitted', doc.number);
    }
    if (action === 'approve') {
      if (!p.approve) return fail(p.reason || 'You cannot approve this');
      const status = nextStatus(doc, actor().role, s);
      set({ status, approvals: [...doc.approvals, { by: actor().name, role: actor().role, at: c.now() }] }, 'Approved');
      finNotify(status === 'APPROVED' ? doc.preparedBy : 'Finance Director', status === 'APPROVED' ? `${doc.number} was approved` : `${doc.number} needs your second approval`, doc.number);
      return done('Approved', status === 'APPROVED' ? `${doc.number} is approved` : `${doc.number} now needs the Finance Director`);
    }
    if (action === 'reject') {
      if (!p.reject) return fail(p.reason || 'You cannot reject this');
      if (!note.trim()) return fail('Give a reason');
      set({ status: 'REJECTED', approvals: [] }, 'Rejected');
      finNotify(doc.preparedBy, `${doc.number} was returned: ${note}`, doc.number, undefined, 'warning');
      return done('Returned', doc.number);
    }
    if (!p.void) return fail('Only drafts and approved items not yet executed can be cancelled');
    set({ status: 'VOID' }, 'Cancelled');
    return done('Cancelled', doc.number);
  };

  /* ---------------- Payment runs ---------------- */
  const proposePaymentRun = (o: { date: string; bankAccount: string; dueFrom: string; dueTo: string; method: Settlement['method']; partyIds?: string[] }): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    if (o.dueTo < o.dueFrom) return fail('The due-date range is the wrong way round');
    const acct = s.accounts.find((a) => a.code === o.bankAccount);
    const cur = acct?.currency || BASE_CURRENCY;
    const inRun = new Set(s.paymentRuns.filter((r) => r.status !== 'VOID' && r.status !== 'REJECTED' && r.status !== 'POSTED').flatMap((r) => r.proposals.map((p) => p.billId)));
    const proposals: PaymentProposal[] = [];
    for (const b of s.documents) {
      if (b.kind !== 'BILL' || b.status !== 'POSTED' || companyOf(b) !== s.activeCompany || curOf(b) !== cur) continue;
      if (o.partyIds?.length && !o.partyIds.includes(b.partyId)) continue;
      const bal = docBalance(s, b);
      if (bal <= 0.005 || inRun.has(b.id)) continue;
      const party = s.parties.find((p) => p.id === b.partyId);
      const terms = b.earlyDiscount ?? party?.earlyDiscount;
      const discDeadline = terms ? addDays(b.date, terms.days) : '';
      const takeDisc = !!terms && o.date <= discDeadline && bal + 0.005 >= docTotals(b).total;
      const dueSoon = b.dueDate >= o.dueFrom && b.dueDate <= o.dueTo;
      if (!dueSoon && !takeDisc) continue;
      const discount = takeDisc ? round2(docTotals(b).net * (terms!.pct / 100)) : 0;
      const heldBy = party?.paymentHold ? `Supplier on hold: ${party.paymentHold.reason}` : b.hold ? `Bill on hold: ${b.hold.reason}` : b.batchId && s.invoiceBatches.find((x) => x.id === b.batchId)?.hold ? 'Batch on hold' : '';
      proposals.push({ billId: b.id, partyId: b.partyId, amount: round2(bal - discount), discount, include: !heldBy, note: heldBy || (takeDisc ? `${terms!.pct}% discount if paid by ${discDeadline}` : undefined) });
    }
    if (!proposals.length) return fail('No posted bills fall due in that range');
    const { number, sequence } = c.nextNumber(s, 'PR', o.date);
    const run: PaymentRun = {
      id: c.uid('pr'),
      number,
      date: o.date,
      bankAccount: o.bankAccount,
      dueFrom: o.dueFrom,
      dueTo: o.dueTo,
      method: o.method,
      proposals,
      paymentIds: [],
      chequeStart: o.method === 'CHEQUE' ? 100_001 + s.settlements.filter((x) => x.chequeNo).length : undefined,
      status: 'DRAFT',
      preparedBy: actor().name,
      approvals: [],
      history: [hist(c, 'Proposal created', `${proposals.length} bills`)],
      companyId: s.activeCompany
    };
    commit({ ...s, sequence, paymentRuns: [run, ...s.paymentRuns] });
    return done('Payment proposal ready', `${number}: ${proposals.filter((p) => p.include).length} bills, ${round2(proposals.filter((p) => p.include).reduce((x, p) => x + p.amount, 0)).toLocaleString()}`, run.id);
  };
  const updateProposal = (runId: string, billId: string, patch: Partial<Pick<PaymentProposal, 'include' | 'amount'>>): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const run = s.paymentRuns.find((r) => r.id === runId);
    if (!run || (run.status !== 'DRAFT' && run.status !== 'REJECTED')) return fail('Only draft proposals can be changed');
    const p = run.proposals.find((x) => x.billId === billId);
    const bill = s.documents.find((d) => d.id === billId);
    if (!p || !bill) return fail('Not found');
    if (patch.include && p.note?.includes('hold')) return fail(p.note);
    if (patch.amount !== undefined && (!(patch.amount > 0) || patch.amount + p.discount - docBalance(s, bill) > 0.005)) return fail(`Pay between 1 and ${(docBalance(s, bill) - p.discount).toLocaleString()}`);
    commit({ ...s, paymentRuns: s.paymentRuns.map((r) => (r.id === runId ? { ...r, proposals: r.proposals.map((x) => (x.billId === billId ? { ...x, ...patch, discount: patch.amount !== undefined && patch.amount + x.discount < docBalance(s, bill) ? 0 : x.discount } : x)) } : r)) });
    return { ok: true };
  };
  /** Executes an approved run: one posted payment per supplier, cheque numbers assigned in sequence. */
  const executeRun = (runId: string): Result => {
    const g = guard() ?? managerOnly('Executing a payment run');
    if (g) return g;
    let s = ref.current;
    const run = s.paymentRuns.find((r) => r.id === runId);
    if (!run) return fail('Not found');
    if (run.status !== 'APPROVED') return fail('The run must be approved first');
    const block = postingBlock(s, run.date);
    if (block) return fail(block);
    const included = run.proposals.filter((p) => p.include);
    if (!included.length) return fail('No bills are included');
    const byParty = new Map<string, PaymentProposal[]>();
    for (const p of included) {
      const bill = s.documents.find((d) => d.id === p.billId)!;
      if (p.amount + p.discount - docBalance(s, bill) > 0.005) return fail(`${bill.number} has been paid since the proposal — refresh the run`);
      const party = s.parties.find((x) => x.id === p.partyId);
      if (party?.paymentHold) return fail(`${party.name} has been put on hold: ${party.paymentHold.reason}`);
      if (bill.hold) return fail(`${bill.number} is on hold: ${bill.hold.reason}`);
      byParty.set(p.partyId, [...(byParty.get(p.partyId) ?? []), p]);
    }
    const acct = s.accounts.find((a) => a.code === run.bankAccount);
    const cur = acct?.currency && acct.currency !== BASE_CURRENCY ? acct.currency : undefined;
    let cheque = run.chequeStart ?? 0;
    const pays: Settlement[] = [];
    for (const [partyId, ps] of byParty) {
      const n = c.nextNumber(s, 'PAY', run.date);
      s = { ...s, sequence: n.sequence };
      const chequeNo = run.method === 'CHEQUE' ? String(cheque++) : undefined;
      pays.push({
        id: c.uid('pay'),
        kind: 'PAYMENT',
        number: n.number,
        partyId,
        date: run.date,
        bankAccount: run.bankAccount,
        method: run.method,
        reference: chequeNo ? `CHQ ${chequeNo}` : run.number,
        amount: round2(ps.reduce((x, p) => x + p.amount, 0)),
        allocations: ps.map((p) => ({ docId: p.billId, amount: p.amount, discount: p.discount || undefined })),
        notes: `Payment run ${run.number}`,
        status: 'POSTED',
        preparedBy: run.preparedBy,
        approvals: run.approvals,
        history: [hist(c, `Posted by payment run ${run.number}`)],
        companyId: run.companyId,
        currency: cur,
        fxRate: cur ? rateOn(s, cur, run.date) : undefined,
        chequeNo,
        runId: run.id
      });
    }
    commit({
      ...s,
      settlements: [...pays, ...s.settlements],
      paymentRuns: s.paymentRuns.map((r) => (r.id === runId ? { ...r, status: 'POSTED', paymentIds: pays.map((p) => p.id), executedAt: c.now(), history: [...r.history, hist(c, `Executed — ${pays.length} payments posted`)] } : r))
    });
    finAudit(actor().name, 'Payment run executed', run.number, `${pays.length} payments`);
    return done('Payment run executed', `${pays.length} payments posted (${pays.map((p) => p.number).join(', ')})`);
  };
  /** Bank payment file (DME): CSV, ISO 20022 pain.001 XML or SWIFT MT103 text. Downloads the file. */
  const generateBankFile = (runId: string, format: 'CSV' | 'PAIN001' | 'MT103'): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const run = s.paymentRuns.find((r) => r.id === runId);
    if (!run || run.status !== 'POSTED') return fail('Execute the run first');
    const pays = s.settlements.filter((p) => run.paymentIds.includes(p.id) && !p.voided);
    const name = `${run.number}-${format.toLowerCase()}.${format === 'CSV' ? 'csv' : format === 'PAIN001' ? 'xml' : 'txt'}`;
    let text = '';
    if (format === 'CSV') {
      text = ['payment,beneficiary,kra_pin,amount,currency,reference,cheque', ...pays.map((p) => [p.number, `"${partyName(s, p.partyId)}"`, s.parties.find((x) => x.id === p.partyId)?.pin ?? '', p.amount.toFixed(2), curOf(p), p.reference, p.chequeNo ?? ''].join(','))].join('\n');
    } else if (format === 'PAIN001') {
      const total = round2(pays.reduce((x, p) => x + p.amount, 0));
      text = `<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"><CstmrCdtTrfInitn><GrpHdr><MsgId>${run.number}</MsgId><CreDtTm>${run.date}T09:00:00</CreDtTm><NbOfTxs>${pays.length}</NbOfTxs><CtrlSum>${total.toFixed(2)}</CtrlSum><InitgPty><Nm>Kericho Highland Estates Ltd</Nm></InitgPty></GrpHdr><PmtInf><PmtInfId>${run.number}</PmtInfId><PmtMtd>TRF</PmtMtd><ReqdExctnDt>${run.date}</ReqdExctnDt><DbtrAcct><Id><Othr><Id>${run.bankAccount}</Id></Othr></Id></DbtrAcct>${pays
        .map((p) => `<CdtTrfTxInf><PmtId><EndToEndId>${p.number}</EndToEndId></PmtId><Amt><InstdAmt Ccy="${curOf(p)}">${p.amount.toFixed(2)}</InstdAmt></Amt><Cdtr><Nm>${partyName(s, p.partyId).replace(/&/g, '&amp;')}</Nm></Cdtr><RmtInf><Ustrd>${p.allocations.map((a) => s.documents.find((d) => d.id === a.docId)?.reference || a.docId).join(' ')}</Ustrd></RmtInf></CdtTrfTxInf>`)
        .join('')}</PmtInf></CstmrCdtTrfInitn></Document>`;
    } else {
      text = pays
        .map((p) => `{1:F01KCBLKENXAXXX}{2:I103}{4:\n:20:${p.number}\n:23B:CRED\n:32A:${p.date.replace(/-/g, '').slice(2)}${curOf(p)}${p.amount.toFixed(2).replace('.', ',')}\n:50K:/${run.bankAccount}\nKERICHO HIGHLAND ESTATES LTD\n:59:${partyName(s, p.partyId).toUpperCase()}\n:70:${p.reference}\n:71A:OUR\n-}`)
        .join('\n');
    }
    downloadText(name, text, format === 'PAIN001' ? 'application/xml' : 'text/plain');
    commit({ ...s, paymentRuns: s.paymentRuns.map((r) => (r.id === runId ? { ...r, file: { format, name, at: c.now() }, history: [...r.history, hist(c, `Bank file ${name} generated`)] } : r)) });
    return done('Bank file generated', name);
  };
  /** Simulated host-to-host transmission: the bank confirms and each supplier gets a payment advice. */
  const sendToBank = (runId: string): Result => {
    const g = guard() ?? managerOnly('Sending payments to the bank');
    if (g) return g;
    const s = ref.current;
    const run = s.paymentRuns.find((r) => r.id === runId);
    if (!run?.file) return fail('Generate the bank file first');
    if (run.bankRef) return fail(`Already sent — bank reference ${run.bankRef}`);
    const bankRef = `H2H${Date.now().toString().slice(-8)}`;
    const ids = new Set(run.paymentIds);
    commit({
      ...s,
      paymentRuns: s.paymentRuns.map((r) => (r.id === runId ? { ...r, bankRef, history: [...r.history, hist(c, `Sent to bank (simulated) — ${bankRef}`)] } : r)),
      settlements: s.settlements.map((p) => (ids.has(p.id) ? { ...p, bankStatus: { status: 'CONFIRMED', ref: bankRef, at: c.now(), file: run.file!.name } } : p))
    });
    for (const p of s.settlements.filter((x) => ids.has(x.id))) {
      const party = s.parties.find((x) => x.id === p.partyId);
      finNotify(party?.email || party?.name || 'Supplier', `Payment advice ${p.number}`, p.number, `${curOf(p)} ${p.amount.toLocaleString()} paid for ${p.allocations.map((a) => s.documents.find((d) => d.id === a.docId)?.reference || '').join(', ')}`);
    }
    return done('Sent to bank (simulated)', `${run.number} confirmed as ${bankRef}; payment advices emailed`);
  };
  /** Void a posted payment or receipt (stopped cheque, returned transfer): reversed on the void date, documents reopen. */
  const voidPayment = (id: string, reason: string, date = TODAY): Result => {
    const g = guard() ?? managerOnly('Voiding a posted payment');
    if (g) return g;
    const s = ref.current;
    const p = s.settlements.find((x) => x.id === id);
    if (!p || p.status !== 'POSTED') return fail('Only posted payments and receipts can be voided');
    if (p.voided) return fail('Already voided');
    if (!reason.trim()) return fail('Give the reason (stopped cheque, returned transfer…)');
    if (date < p.date) return fail('The void date cannot be before the payment');
    const block = postingBlock(s, date);
    if (block) return fail(block);
    if (s.bankLines.some((l) => l.matchedTo?.startsWith(`${p.id}:`))) return fail('This payment is matched on a bank statement — unmatch it in the reconciliation first');
    if (s.applications.some((a) => a.sourceId === p.id)) return fail('This advance has been applied to documents — remove those applications first');
    commit({ ...s, settlements: s.settlements.map((x) => (x.id === id ? { ...x, voided: { by: actor().name, at: c.now(), date, reason }, history: [...x.history, hist(c, 'Voided', reason)] } : x)) });
    finAudit(actor().name, 'Payment voided', p.number, reason);
    finNotify(p.preparedBy, `${p.number} was voided`, p.number, reason, 'warning');
    return done('Voided', `${p.number} reversed on ${date}; its documents are open again`);
  };
  /** Voids every payment of an executed run (e.g. the bank rejected the whole file). */
  const voidRun = (runId: string, reason: string, date = TODAY): Result => {
    const g = guard() ?? managerOnly('Voiding a payment run');
    if (g) return g;
    const s = ref.current;
    const run = s.paymentRuns.find((r) => r.id === runId);
    if (!run || run.status !== 'POSTED') return fail('Only executed runs can be voided');
    if (!reason.trim()) return fail('Give the reason');
    const block = postingBlock(s, date);
    if (block) return fail(block);
    const pays = s.settlements.filter((p) => run.paymentIds.includes(p.id) && !p.voided);
    const matched = pays.find((p) => s.bankLines.some((l) => l.matchedTo?.startsWith(`${p.id}:`)));
    if (matched) return fail(`${matched.number} is already reconciled to the bank statement — void the others one by one`);
    const ids = new Set(pays.map((p) => p.id));
    commit({
      ...s,
      settlements: s.settlements.map((p) => (ids.has(p.id) ? { ...p, voided: { by: actor().name, at: c.now(), date, reason }, history: [...p.history, hist(c, `Voided with run ${run.number}`, reason)] } : p)),
      paymentRuns: s.paymentRuns.map((r) => (r.id === runId ? { ...r, voidReason: reason, history: [...r.history, hist(c, 'Run voided', reason)] } : r))
    });
    finAudit(actor().name, 'Payment run voided', run.number, reason);
    return done('Run voided', `${pays.length} payments reversed on ${date}`);
  };
  /** Director override of a failed three-way match (price or quantity variance accepted). */
  const overrideMatch = (billId: string, reason: string): Result => {
    const g = guard() ?? directorOnly('Overriding a three-way match');
    if (g) return g;
    if (!reason.trim()) return fail('Give the reason for accepting the variance');
    const s = ref.current;
    const b = s.documents.find((x) => x.id === billId);
    if (!b?.match) return fail('This bill has no match to override');
    commit({ ...s, documents: s.documents.map((x) => (x.id === billId ? { ...x, match: { ...x.match!, override: `${actor().name}: ${reason}` }, history: [...x.history, hist(c, 'Match overridden', reason)] } : x)) });
    finAudit(actor().name, 'Three-way match override', b.number, reason);
    return done('Match overridden', b.number);
  };
  /** Records the price and quantity check against the order and goods received note (from Procurement or keyed). */
  const recordMatch = (billId: string, m: { po: string; grn: string; poAmount: number; grnQty: number; billQty: number }): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const b = s.documents.find((x) => x.id === billId);
    if (!b) return fail('Not found');
    if (!m.po || !m.grn) return fail('Enter the order and goods received note numbers');
    const net = docTotals(b).net;
    const tol = s.settings.matchTolerancePct / 100;
    const priceVar = m.poAmount > 0 ? Math.abs(net - m.poAmount) / m.poAmount : 1;
    const qtyOk = m.grnQty >= m.billQty;
    const matched = priceVar <= tol && qtyOk;
    const note = `Order ${m.poAmount.toLocaleString()} vs bill ${net.toLocaleString()} (${(priceVar * 100).toFixed(1)}% variance, tolerance ${s.settings.matchTolerancePct}%); received ${m.grnQty} vs billed ${m.billQty}`;
    commit({ ...s, documents: s.documents.map((x) => (x.id === billId ? { ...x, match: { po: m.po, grn: m.grn, matched, note }, history: [...x.history, hist(c, matched ? 'Three-way match passed' : 'Three-way match failed', note)] } : x)) });
    return matched ? done('Matched', note) : fail(`Match failed: ${note}`);
  };

  /* ---------------- Staff debt (loans, advances, surcharges) ---------------- */
  const requestLoan = (l: { employeeId: string; employee: string; type: StaffLoan['type']; amount: number; monthly: number; date: string }): Result => {
    const g = guard();
    if (g) return g;
    if (!l.employeeId) return fail('Choose the employee');
    if (!(l.amount > 0) || !(l.monthly > 0)) return fail('Enter the amount and the monthly recovery');
    if (l.monthly > l.amount) return fail('The monthly recovery cannot exceed the amount');
    const s = ref.current;
    const open = s.staffLoans.filter((x) => x.employeeId === l.employeeId && x.status === 'POSTED' && x.recovered.reduce((t, r) => t + r.amount, 0) < x.amount);
    if (l.type === 'SALARY_ADVANCE' && open.some((x) => x.type === 'SALARY_ADVANCE')) return fail(`${l.employee} already has a salary advance being recovered`);
    const { number, sequence } = c.nextNumber(s, 'SL', l.date);
    const loan: StaffLoan = { ...l, id: c.uid('sl'), number, recovered: [], status: 'SUBMITTED', preparedBy: actor().name, approvals: [], history: [hist(c, 'Requested')] };
    commit({ ...s, sequence, staffLoans: [loan, ...s.staffLoans] });
    finNotify('Finance Manager', `${number}: ${l.type.replace('_', ' ').toLowerCase()} for ${l.employee} waiting for approval`, number);
    return done('Request recorded', `${number} sent for approval`, loan.id);
  };
  const disburseLoan = (id: string, bankAccount = '1000', date = TODAY): Result => {
    const g = guard() ?? managerOnly('Disbursing a staff loan');
    if (g) return g;
    const s = ref.current;
    const l = s.staffLoans.find((x) => x.id === id);
    if (!l || l.status !== 'APPROVED') return fail('Only approved loans can be disbursed');
    const surcharge = l.type === 'SURCHARGE';
    const r = buildJournal(c, s, {
      date,
      memo: `${l.number} ${surcharge ? 'surcharge raised' : 'disbursed'} — ${l.employee}`,
      source: 'SYSTEM',
      origin: 'Staff debt',
      lines: [{ account: EXT.STAFF_DEBTORS, debit: l.amount, description: l.employee }, { account: surcharge ? '4100' : bankAccount, credit: l.amount }]
    });
    if ('error' in r) return fail(r.error);
    const next = withJournals(s, [r.journal], r.sequence);
    commit({ ...next, staffLoans: s.staffLoans.map((x) => (x.id === id ? { ...x, status: 'POSTED', disbursedJournalId: r.journal.id, history: [...x.history, hist(c, surcharge ? 'Surcharge raised' : 'Disbursed', r.journal.number)] } : x)) });
    return done(surcharge ? 'Surcharge raised' : 'Disbursed', `${r.journal.number}: ${l.amount.toLocaleString()} to ${l.employee}`);
  };
  /** Payroll deduction recovering a staff loan (called by Payroll, or keyed here). */
  const recordRecovery = (id: string, period: string, amount?: number): Result => {
    const g = guard();
    if (g) return g;
    const s = ref.current;
    const l = s.staffLoans.find((x) => x.id === id);
    if (!l || l.status !== 'POSTED') return fail('Only disbursed loans can be recovered');
    if (l.recovered.some((r) => r.period === period)) return fail(`${l.number} has already been recovered for ${periodLabel(period, true)}`);
    const left = round2(l.amount - l.recovered.reduce((t, r) => t + r.amount, 0));
    const amt = round2(Math.min(amount ?? l.monthly, left));
    if (!(amt > 0)) return fail('Nothing left to recover');
    const [y, m] = period.split('-').map(Number);
    const r = buildJournal(c, s, { date: iso(new Date(y, m, 0)), memo: `${l.number} recovered through payroll — ${l.employee}`, source: 'PAYROLL', origin: 'Payroll deduction', lines: [{ account: '2200', debit: amt, description: 'Net pay withheld' }, { account: EXT.STAFF_DEBTORS, credit: amt, description: l.employee }] });
    if ('error' in r) return fail(r.error);
    const next = withJournals(s, [r.journal], r.sequence);
    commit({ ...next, staffLoans: s.staffLoans.map((x) => (x.id === id ? { ...x, recovered: [...x.recovered, { period, amount: amt, journalId: r.journal.id }], history: [...x.history, hist(c, `Recovered ${amt.toLocaleString()} for ${periodLabel(period, true)}`)] } : x)) });
    return done('Recovery posted', `${r.journal.number}: ${amt.toLocaleString()} (${round2(left - amt).toLocaleString()} left)`);
  };
  /**
   * Payroll statutory and third-party deductions as supplier bills (KRA PAYE, NSSF, SHA, SACCO) so they are paid
   * through the normal payment run. Payroll calls:
   *   finance.postPayrollDeductionBills('2026-10', [{ partyId: 's13', account: '2150', amount: 412_000, description: 'PAYE October' }], 'Payroll officer')
   */
  const postPayrollDeductionBills = (period: string, items: { partyId: string; account: string; amount: number; description: string }[], by?: string): Result => {
    const g = guard();
    if (g) return g;
    let s = ref.current;
    const valid = items.filter((i) => i.amount > 0);
    if (!valid.length) return fail('No deductions to bill');
    const [y, m] = period.split('-').map(Number);
    const date = iso(new Date(y, m, 0));
    const bills: FinDocument[] = [];
    for (const it of valid) {
      const party = s.parties.find((p) => p.id === it.partyId);
      if (!party) return fail(`Unknown payee ${it.partyId}`);
      if (s.documents.some((d) => d.partyId === it.partyId && d.reference === `PAYROLL ${period}` && d.status !== 'VOID' && d.lines[0]?.account === it.account)) continue;
      const n = c.nextNumber(s, 'BILL', date);
      s = { ...s, sequence: n.sequence };
      bills.push({
        id: c.uid('bill'),
        kind: 'BILL',
        number: n.number,
        partyId: it.partyId,
        date,
        dueDate: addDays(date, 9),
        reference: `PAYROLL ${period}`,
        department: 'Human Resources',
        lines: [{ id: c.uid('l'), description: it.description, account: it.account, qty: 1, price: round2(it.amount), vat: false, taxCode: 'E0', taxRate: 0 }],
        notes: 'Statutory / third-party deduction from payroll',
        match: { po: 'PAYROLL', grn: 'n/a', matched: true, note: 'Payroll deduction — no goods' },
        status: 'SUBMITTED',
        preparedBy: by ?? actor().name,
        approvals: [],
        history: [hist(c, `Created from payroll ${periodLabel(period, true)}`, undefined, by)],
        companyId: s.activeCompany
      });
    }
    if (!bills.length) return fail(`Deduction bills for ${periodLabel(period, true)} already exist`);
    commit({ ...s, documents: [...bills, ...s.documents] });
    finNotify('Finance Manager', `${bills.length} payroll deduction bills for ${periodLabel(period, true)} waiting for approval`, period);
    return done('Deduction bills created', `${bills.length} bills submitted for approval`);
  };

  /** Freight / goods-received accrual: accrued at month end and reversed on the 1st. */
  const accrueFreight = (o: { date: string; amount: number; description: string; account?: string }): Result => {
    const g = guard() ?? managerOnly('Posting an accrual');
    if (g) return g;
    if (!(o.amount > 0) || !o.description.trim()) return fail('Enter the amount and what it is for');
    const s = ref.current;
    const d = new Date(o.date + 'T00:00:00');
    const reverseOn = iso(new Date(d.getFullYear(), d.getMonth() + 1, 1));
    const r = buildJournal(c, s, { date: o.date, memo: `Accrual: ${o.description}`, source: 'SYSTEM', origin: 'Freight accrual', autoReverseOn: reverseOn, lines: [{ account: o.account || '5100', debit: o.amount, description: o.description }, { account: EXT.GRNI, credit: o.amount }] });
    if ('error' in r) return fail(r.error);
    commit(withJournals(s, [r.journal], r.sequence));
    return done('Accrual posted', `${r.journal.number}, reverses automatically on ${reverseOn}`);
  };

  return {
    holdDocument,
    releaseDocument,
    holdParty,
    releaseParty,
    saveInvoiceBatch,
    batchStatus,
    submitBatch,
    holdBatch,
    releaseBatch,
    saveMemo,
    applyMemo,
    writeOff,
    transferInvoice,
    chargeback,
    applyAdvance,
    addCreditExtension,
    logCollection,
    runCollections,
    financeCharges,
    sendInvoice,
    disputeInvoice,
    resolveDispute,
    payByLink,
    importDocuments,
    importParties,
    importEInvoice,
    importStatement,
    saveRecurring,
    generateRecurring,
    workflow,
    proposePaymentRun,
    updateProposal,
    executeRun,
    generateBankFile,
    sendToBank,
    voidPayment,
    voidRun,
    overrideMatch,
    recordMatch,
    requestLoan,
    disburseLoan,
    recordRecovery,
    postPayrollDeductionBills,
    accrueFreight
  };
};
