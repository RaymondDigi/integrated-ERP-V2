import { addDays, daysBetween, round2, TODAY } from '../../../finance/engine';
import type { FinanceState, LedgerEntry, Party } from '../../../finance/types';
import { poStage, totals } from '../../engine';
import type { CommercialState, GoodsReceipt, Product, PurchaseOrder } from '../../types';
import type {
  ApprovalRule,
  Contract,
  EventResponse,
  InvoiceLine,
  ItemExt,
  Lot,
  ProcExtState,
  RuleDoc,
  SourcingEvent,
  SupplierCore,
  SupplierInvoice,
  SupplierProfile,
  Tolerance,
  Variance
} from './types';

export const EVENT_KIND_LABEL = { RFI: 'Request for information', RFP: 'Request for proposal', RFQ: 'Request for quotation', AUCTION: 'Forward auction', REVERSE_AUCTION: 'Reverse auction' } as const;
export const EVENT_STATUS_LABEL = { DRAFT: 'Draft', OPEN: 'Open for responses', CLOSED: 'Closed', EVALUATION: 'Evaluation', AWARDED: 'Awarded', CANCELLED: 'Cancelled' } as const;
export const SUPPLIER_STATUS_LABEL = { PROSPECT: 'Potential supplier', PENDING_APPROVAL: 'Awaiting approval', APPROVED: 'Approved', SUSPENDED: 'Suspended', TERMINATED: 'Terminated', REJECTED: 'Rejected' } as const;
export const DOC_TYPE_LABEL = {
  TAX_COMPLIANCE: 'KRA tax compliance certificate',
  INSURANCE: 'Insurance certificate',
  CERT: 'Quality certificate (ISO / KEBS)',
  REG: 'Certificate of incorporation',
  CR12: 'CR12 (directors)',
  BANK_LETTER: 'Bank confirmation letter',
  TEA_BOARD_LICENCE: 'Tea Board of Kenya licence'
} as const;
export const VERIFICATION_ITEMS = ['Bank letter matches account', 'CR12 directors checked', 'KRA PIN validated', 'Tax compliance current', 'Credit reference check', 'Site visit / references'];
export const TAXONOMY = [
  'Tea — made tea (auction)',
  'Tea — direct sale gardens',
  'Packaging — cartons & sacks',
  'Packaging — foil & film',
  'Labels & printing',
  'Logistics — haulage',
  'Logistics — clearing & forwarding',
  'Warehousing',
  'Engineering spares',
  'Office supplies',
  'Professional services',
  'Laboratory & tasting'
];
export const UNSPSC = [
  { code: '50201706', label: 'Black tea' },
  { code: '50201712', label: 'Green tea' },
  { code: '24112404', label: 'Corrugated cartons' },
  { code: '24121503', label: 'Packaging film' },
  { code: '55121606', label: 'Adhesive labels' },
  { code: '14111507', label: 'Printer or copier paper' },
  { code: '26111602', label: 'Generator parts' },
  { code: '78101802', label: 'Road freight services' },
  { code: '78121603', label: 'Customs clearance services' },
  { code: '81141500', label: 'Quality control (tea tasting)' }
];
export const BUSINESS_UNITS = ['Blending & packing', 'Tea trading', 'Logistics', 'Head office'];
export const SERVICE_TYPES = ['Haulage', 'Clearing & forwarding', 'Warehousing', 'Tea tasting', 'Maintenance', 'Professional', 'Cleaning & security'];

/* ------------------------------------------------------------------ */
/* Sourcing                                                            */
/* ------------------------------------------------------------------ */

export const eventLines = (e: Pick<SourcingEvent, 'lots'>) => e.lots.flatMap((l) => l.lines);

/** Latest valid revision per supplier. */
export const latestResponses = (e: SourcingEvent, includeInvalid = false) => {
  const out = new Map<string, EventResponse>();
  for (const r of e.responses) {
    if (!includeInvalid && !r.valid) continue;
    const cur = out.get(r.supplierId);
    if (!cur || r.revision > cur.revision) out.set(r.supplierId, r);
  }
  return [...out.values()];
};

/** Line price after volume tiers. */
export const linePrice = (r: EventResponse, lineId: string, qty: number) => {
  const base = r.prices[lineId] ?? 0;
  const tier = (r.tiers ?? []).filter((t) => t.lineId === lineId && qty >= t.minQty).sort((a, b) => b.pct - a.pct)[0];
  return round2(base * (1 - (tier?.pct ?? 0) / 100));
};

/** Total cost of ownership: goods + freight + duty + other, less any bundle discount on fully priced lots. */
export const responseTotal = (e: SourcingEvent, r: EventResponse, lineIds?: string[]) => {
  let goods = 0;
  for (const lot of e.lots) {
    const lines = lot.lines.filter((l) => !lineIds || lineIds.includes(l.id));
    let lotSum = lines.reduce((s, l) => s + l.qty * linePrice(r, l.id, l.qty), 0);
    const whole = lines.length === lot.lines.length && lot.lines.every((l) => (r.prices[l.id] ?? 0) > 0);
    if (whole && r.bundleDiscountPct) lotSum *= 1 - r.bundleDiscountPct / 100;
    goods += lotSum;
  }
  const share = lineIds ? lineIds.length / Math.max(1, eventLines(e).length) : 1;
  const extras = (r.costs.freight + r.costs.duty + r.costs.other) * share;
  return round2(goods + extras);
};

/** Weighted questionnaire score (0–100) from the evaluation panel's average marks, plus the price score. */
export const scoreResponse = (e: SourcingEvent, supplierId: string) => {
  const evals = e.evaluations.filter((x) => x.supplierId === supplierId);
  const latest = latestResponses(e);
  const mine = latest.find((r) => r.supplierId === supplierId);
  const sectionTotal = e.questionnaire.reduce((s, x) => s + x.weight, 0) || 1;
  let technical = 0;
  const bySection: Record<string, number> = {};
  for (const sec of e.questionnaire) {
    const qTotal = sec.questions.reduce((s, q) => s + q.weight, 0) || 1;
    let secScore = 0;
    for (const q of sec.questions) {
      const marks = evals.map((ev) => ev.scores[q.id]).filter((m): m is number => typeof m === 'number');
      let mark = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : 0;
      // Yes/no questions score themselves from the answer when nobody marked them
      if (!marks.length && q.type === 'YESNO' && mine) mark = /^y/i.test(mine.answers[q.id] ?? '') ? 5 : 0;
      secScore += (mark / 5) * (q.weight / qTotal);
    }
    bySection[sec.id] = round2(secScore * 100);
    technical += secScore * (sec.weight / sectionTotal);
  }
  const totalsAll = latest.map((r) => responseTotal(e, r)).filter((t) => t > 0);
  const best = Math.min(...totalsAll);
  const mineTotal = mine ? responseTotal(e, mine) : 0;
  const price = mine && mineTotal > 0 ? (best / mineTotal) * 100 : 0;
  const hasQ = e.questionnaire.some((s) => s.questions.length);
  const pw = hasQ ? e.priceWeight / 100 : 1;
  return { technical: round2(technical * 100), price: round2(price), total: round2(price * pw + technical * 100 * (1 - pw)), bySection, evaluators: new Set(evals.map((x) => x.evaluator)).size };
};

/**
 * What-if award: cheapest supplier per line, subject to a maximum number of suppliers and a lead-time ceiling.
 * Greedy: start from the line-by-line optimum and fold the smallest supplier into the next-cheapest until the
 * supplier limit holds.
 */
export const optimiseAward = (e: SourcingEvent, opts: { maxSuppliers: number; maxLeadDays?: number; minScore?: number }) => {
  const eligible = latestResponses(e).filter((r) => (opts.maxLeadDays ? r.leadDays <= opts.maxLeadDays : true) && (opts.minScore ? scoreResponse(e, r.supplierId).total >= opts.minScore : true));
  const lines = eventLines(e);
  const pick: Record<string, string> = {};
  const cost = (sup: string, lineId: string) => {
    const r = eligible.find((x) => x.supplierId === sup);
    const l = lines.find((x) => x.id === lineId)!;
    const p = r ? linePrice(r, lineId, l.qty) : 0;
    return p > 0 ? p * l.qty : Infinity;
  };
  for (const l of lines) {
    const best = [...eligible].sort((a, b) => cost(a.supplierId, l.id) - cost(b.supplierId, l.id))[0];
    if (best && cost(best.supplierId, l.id) < Infinity) pick[l.id] = best.supplierId;
  }
  const used = () => [...new Set(Object.values(pick))];
  while (used().length > Math.max(1, opts.maxSuppliers)) {
    const shares = used().map((s) => ({ s, v: Object.entries(pick).filter(([, x]) => x === s).reduce((a, [lid]) => a + cost(s, lid), 0) }));
    const smallest = shares.sort((a, b) => a.v - b.v)[0].s;
    for (const [lid, s] of Object.entries(pick)) {
      if (s !== smallest) continue;
      const alt = used().filter((x) => x !== smallest).sort((a, b) => cost(a, lid) - cost(b, lid))[0];
      if (alt && cost(alt, lid) < Infinity) pick[lid] = alt;
      else delete pick[lid];
    }
  }
  const groups = used().map((s) => {
    const lineIds = Object.entries(pick)
      .filter(([, x]) => x === s)
      .map(([l]) => l);
    return { supplierId: s, lineIds, value: round2(lineIds.reduce((a, lid) => a + cost(s, lid), 0)) };
  });
  const total = round2(groups.reduce((a, g) => a + g.value, 0));
  const single = eligible
    .filter((r) => lines.every((l) => (r.prices[l.id] ?? 0) > 0))
    .map((r) => ({ supplierId: r.supplierId, value: responseTotal(e, r) }))
    .sort((a, b) => a.value - b.value)[0];
  return { groups, total, single, saving: single ? round2(single.value - total) : 0, uncovered: lines.filter((l) => !pick[l.id]).map((l) => l.description) };
};

/* ------------------------------------------------------------------ */
/* Auctions                                                            */
/* ------------------------------------------------------------------ */

export const bestBids = (e: SourcingEvent) => {
  const best = new Map<string, number>();
  for (const b of e.bids) best.set(b.supplierId, Math.min(best.get(b.supplierId) ?? Infinity, b.amount));
  return [...best.entries()].map(([supplierId, amount]) => ({ supplierId, amount })).sort((a, b) => a.amount - b.amount);
};
export const bidRank = (e: SourcingEvent, supplierId: string) => {
  const list = bestBids(e);
  const i = list.findIndex((x) => x.supplierId === supplierId);
  return i < 0 ? null : i + 1;
};
export const auctionLive = (e: SourcingEvent, now = Date.now()) =>
  !!e.auction && e.status === 'OPEN' && now >= new Date(e.auction.start).getTime() && now <= new Date(e.auction.end).getTime();

/** Validates a bid against the auction rules; returns the reason it is refused, or null. */
export const bidProblem = (e: SourcingEvent, supplierId: string, amount: number, now = Date.now()) => {
  const a = e.auction;
  if (!a) return 'This event is not an auction';
  if (e.status !== 'OPEN') return 'The auction is not open';
  if (now < new Date(a.start).getTime()) return 'Bidding has not started yet';
  if (now > new Date(a.end).getTime()) return 'Bidding has closed';
  if (!e.invited.some((i) => i.supplierId === supplierId)) return 'Only invited suppliers can bid';
  if (!(amount > 0)) return 'Enter a bid amount';
  const mine = e.bids.filter((b) => b.supplierId === supplierId).sort((x, y) => x.amount - y.amount)[0];
  const best = bestBids(e)[0];
  const decrement = a.minDecrementPct / 100;
  if (mine && amount > mine.amount * (1 - decrement) + 0.001) return `Each new bid must be at least ${a.minDecrementPct}% below your last bid (${Math.floor(mine.amount * (1 - decrement)).toLocaleString()} or less)`;
  if (e.kind === 'REVERSE_AUCTION' && a.reservePrice && amount > a.reservePrice) return `Bids above the ceiling of ${a.reservePrice.toLocaleString()} are not accepted`;
  if (best && best.supplierId !== supplierId && amount >= best.amount * 1.5) return 'Bid is far above the current best — check the amount';
  return null;
};

/** End time after a bid: extended when the bid lands inside the closing window. */
export const extendedEnd = (e: SourcingEvent, at = Date.now()) => {
  const a = e.auction!;
  const end = new Date(a.end).getTime();
  if (end - at <= a.extendWindowMinutes * 60_000) return { end: new Date(end + a.extendMinutes * 60_000).toISOString(), extended: true };
  return { end: a.end, extended: false };
};

/* ------------------------------------------------------------------ */
/* Suppliers                                                           */
/* ------------------------------------------------------------------ */

export const PIN_RE = /^[AP]\d{9}[A-Z]$/;
export const maskAccount = (acc: string) => (acc.length <= 4 ? acc : `•••• ${acc.slice(-4)}`);

/** Duplicate checks on the unique identifiers: KRA PIN / ID number and bank account. */
export const duplicateProblems = (cand: Partial<SupplierCore> & { id?: string; partyId?: string }, profiles: SupplierProfile[], parties: Party[]) => {
  const out: string[] = [];
  const others = profiles.filter((p) => p.id !== cand.id && p.status !== 'REJECTED');
  const idNo = (cand.idNumber ?? '').trim().toUpperCase();
  if (idNo && idNo !== 'NON-RESIDENT') {
    const hit = others.find((p) => p.idType === cand.idType && p.idNumber.toUpperCase() === idNo);
    if (hit) out.push(`${cand.idType === 'KRA_PIN' ? 'KRA PIN' : 'ID'} ${idNo} is already registered to ${hit.name}`);
    if (cand.idType === 'KRA_PIN') {
      const party = parties.find((p) => p.kind === 'SUPPLIER' && p.pin.toUpperCase() === idNo && p.id !== cand.partyId && !others.some((o) => o.partyId === p.id && o.id === cand.id));
      if (party && !hit) out.push(`KRA PIN ${idNo} is already used by ${party.name} in Finance`);
    }
  }
  const acc = (cand.bank?.account ?? '').replace(/\s/g, '');
  if (acc) {
    const hit = others.find((p) => p.bank.account.replace(/\s/g, '') === acc && p.bank.bank === cand.bank?.bank);
    if (hit) out.push(`Bank account ${maskAccount(acc)} at ${cand.bank?.bank} is already on file for ${hit.name}`);
  }
  const name = (cand.name ?? '').trim().toLowerCase();
  if (name && others.some((p) => p.name.toLowerCase() === name)) out.push(`A supplier called ${cand.name} already exists`);
  return out;
};

export const missingFields = (p: Partial<SupplierCore>, required: (keyof SupplierCore)[]) =>
  required.filter((k) => {
    const v = p[k];
    if (k === 'bank') return !p.bank?.bank || !p.bank?.account;
    if (Array.isArray(v)) return v.length === 0;
    return v === undefined || v === null || String(v).trim() === '';
  });

export const FIELD_LABEL: Record<keyof SupplierCore, string> = {
  name: 'Name',
  idType: 'ID type',
  idNumber: 'KRA PIN / ID number',
  email: 'Email',
  phone: 'Phone',
  contactPerson: 'Contact person',
  country: 'Country',
  region: 'Region / county',
  address: 'Address',
  paymentMethod: 'Payment method',
  paymentTerms: 'Payment terms',
  bank: 'Bank details',
  taxonomy: 'Categories'
};

/** Supplier documents expiring within `days` (or already expired). */
export const expiringDocuments = (profiles: SupplierProfile[], days: number, today = TODAY) =>
  profiles
    .filter((p) => p.status === 'APPROVED' || p.status === 'PENDING_APPROVAL')
    .flatMap((p) => p.documents.filter((d) => d.expiry && d.expiry <= addDays(today, days)).map((d) => ({ profile: p, doc: d, days: daysBetween(today, d.expiry) })))
    .sort((a, b) => a.days - b.days);

/** Suppliers that must answer an update request before they can invoice. */
export const overdueUpdate = (p: SupplierProfile | undefined, today = TODAY) => p?.updateRequests.find((u) => u.status === 'SENT' && u.due < today);

export const scorecard = (kpi: { onTime: number | null; quality: number | null }, evals: { scores: Record<string, number> }[]) => {
  const auto = kpi.onTime === null ? null : ((kpi.onTime ?? 0) * 0.6 + (kpi.quality ?? 1) * 0.4) * 5;
  const manual = evals.length ? evals.reduce((s, e) => s + Object.values(e.scores).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(e.scores).length), 0) / evals.length : null;
  const blended = auto === null ? manual : manual === null ? auto : auto * 0.5 + manual * 0.5;
  return { auto: auto === null ? null : round2(auto), manual: manual === null ? null : round2(manual), blended: blended === null ? null : Math.round(blended * 10) / 10 };
};

/* ------------------------------------------------------------------ */
/* Approval rules                                                      */
/* ------------------------------------------------------------------ */

/** The configured chain for a document: the most specific active rule whose threshold the value reaches. */
export const ruleFor = (rules: ApprovalRule[], doc: RuleDoc, value: number, attrs: { supplierType?: string; category?: string } = {}) =>
  rules
    .filter((r) => r.active && r.doc === doc && value >= r.minValue && (!r.supplierType || r.supplierType === attrs.supplierType) && (!r.category || r.category === attrs.category))
    .sort((a, b) => Number(!!b.supplierType) + Number(!!b.category) - (Number(!!a.supplierType) + Number(!!a.category)) || b.minValue - a.minValue)[0];

export const approveSteps = (rule: ApprovalRule | undefined) => (rule ? rule.steps.filter((s) => s.kind === 'APPROVE') : []);

/* ------------------------------------------------------------------ */
/* Contracts                                                           */
/* ------------------------------------------------------------------ */

export const contractLive = (c: Contract, on = TODAY) => c.status === 'ACTIVE' && c.start <= on && c.end >= on;
export const contractFor = (contracts: Contract[], supplierId: string | undefined, sku: string, on = TODAY) =>
  contracts.find((c) => contractLive(c, on) && (!supplierId || c.supplierId === supplierId) && c.items.some((i) => i.sku === sku));
export const contractPrice = (contracts: Contract[], supplierId: string | undefined, sku: string, site?: string) => {
  const c = contractFor(contracts, supplierId, sku);
  const item = c?.items.find((i) => i.sku === sku);
  if (!c || !item) return null;
  const adj = c.sites.find((s) => s.site === site)?.rateAdjPct ?? 0;
  return { contract: c, price: round2(item.unitPrice * (1 + adj / 100)), item };
};

/** Spend and quantity drawn against a contract from approved purchase orders in its term. */
export const contractUtilisation = (c: Contract, pos: PurchaseOrder[]) => {
  const inTerm = pos.filter((o) => o.supplierId === c.supplierId && o.status === 'APPROVED' && o.date >= c.start && o.date <= c.end);
  let spend = 0;
  const qty: Record<string, number> = {};
  const offPrice: { po: string; sku: string; price: number; contract: number }[] = [];
  for (const o of inTerm)
    for (const l of o.lines) {
      const item = c.items.find((i) => i.sku === l.sku);
      if (!item) continue;
      spend += l.qty * l.price;
      qty[l.sku] = (qty[l.sku] ?? 0) + l.qty;
      if (l.price > item.unitPrice + 0.005) offPrice.push({ po: o.number, sku: l.sku, price: l.price, contract: item.unitPrice });
    }
  return { spend: round2(spend), used: c.valueCap ? spend / c.valueCap : 0, qty, offPrice, orders: inTerm.length };
};
export const contractsExpiring = (contracts: Contract[], days: number, today = TODAY) =>
  contracts.filter((c) => c.status === 'ACTIVE' && c.end <= addDays(today, days)).map((c) => ({ c, days: daysBetween(today, c.end) }));

/** Merges {{tag}} placeholders from contract fields. */
export const mergeTags = (body: string, fields: Record<string, string>) => body.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => fields[k] ?? m);

/** Line diff (longest common subsequence) for redlines between two versions. */
export const lineDiff = (a: string, b: string) => {
  const x = a.split('\n');
  const y = b.split('\n');
  const n = x.length;
  const m = y.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { op: 'same' | 'del' | 'add'; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ op: 'same', text: x[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: 'del', text: x[i++] });
    else out.push({ op: 'add', text: y[j++] });
  }
  while (i < n) out.push({ op: 'del', text: x[i++] });
  while (j < m) out.push({ op: 'add', text: y[j++] });
  return out;
};

/* ------------------------------------------------------------------ */
/* Invoice matching                                                    */
/* ------------------------------------------------------------------ */

export const toleranceFor = (list: Tolerance[], supplierId: string, category?: string) =>
  list.find((t) => t.scope === supplierId) ?? list.find((t) => category && t.scope === category) ?? list.find((t) => t.scope === 'DEFAULT') ?? { id: 'x', scope: 'DEFAULT', mode: 'THREE_WAY' as const, pricePct: 0, qtyPct: 0, amount: 0 };

export const invoiceNet = (inv: Pick<SupplierInvoice, 'lines' | 'charges'>) => round2(inv.lines.reduce((s, l) => s + l.qty * l.price, 0) + inv.charges.reduce((s, c) => s + c.amount, 0));
export const invoiceVat = (inv: Pick<SupplierInvoice, 'lines' | 'charges'>, rate = 0.16) => round2(inv.lines.filter((l) => l.vat).reduce((s, l) => s + l.qty * l.price * rate, 0) + inv.charges.reduce((s, c) => s + c.amount * rate, 0));
export const invoiceGross = (inv: Pick<SupplierInvoice, 'lines' | 'charges'>) => round2(invoiceNet(inv) + invoiceVat(inv));
/** Amount payable in KES after advances and credit notes. */
export const invoicePayableKes = (inv: SupplierInvoice) => round2(invoiceGross(inv) * inv.fxRate - inv.advanceApplied - inv.creditApplied);

/**
 * Two-way (invoice vs order) or three-way (invoice vs order vs goods received) match with hold tolerances on
 * price %, quantity % and absolute amount. Every variance outside tolerance puts the invoice on hold.
 */
export const matchInvoice = (po: PurchaseOrder | undefined, grns: GoodsReceipt[], lines: InvoiceLine[], tol: Tolerance, mode: 'TWO_WAY' | 'THREE_WAY', fxRate = 1) => {
  const v: Variance[] = [];
  if (!po) return [{ lineId: '-', description: 'No purchase order', kind: 'NOT_ON_PO' as const, expected: 0, actual: 0, within: false }];
  const live = grns.filter((g) => g.poId === po.id);
  for (const il of lines) {
    const pl = po.lines.find((x) => x.id === il.poLineId);
    if (!pl) {
      v.push({ lineId: il.id, description: il.description, kind: 'NOT_ON_PO', expected: 0, actual: il.qty * il.price, within: false });
      continue;
    }
    const priceKes = il.price * fxRate;
    const priceDiff = (priceKes - pl.price) / (pl.price || 1);
    if (Math.abs(priceDiff) > 0.00001) v.push({ lineId: il.id, description: pl.description, kind: 'PRICE', expected: pl.price, actual: round2(priceKes), within: priceDiff * 100 <= tol.pricePct });
    const received = live.reduce((s, g) => s + g.lines.filter((x) => x.lineId === pl.id).reduce((a, x) => a + x.qty, 0), 0);
    const basis = mode === 'THREE_WAY' ? received - pl.billed : pl.qty - pl.billed;
    if (mode === 'THREE_WAY' && received === 0) v.push({ lineId: il.id, description: pl.description, kind: 'NO_RECEIPT', expected: 0, actual: il.qty, within: false });
    else if (il.qty !== basis) {
      const qd = (il.qty - basis) / (basis || 1);
      v.push({ lineId: il.id, description: pl.description, kind: 'QTY', expected: basis, actual: il.qty, within: il.qty <= basis || qd * 100 <= tol.qtyPct });
    }
  }
  const expected = lines.reduce((s, il) => {
    const pl = po.lines.find((x) => x.id === il.poLineId);
    return s + (pl ? pl.price * il.qty : 0);
  }, 0);
  const actual = lines.reduce((s, il) => s + il.price * fxRate * il.qty, 0);
  if (Math.abs(actual - expected) > 0.5) v.push({ lineId: '-', description: 'Invoice amount vs order', kind: 'AMOUNT', expected: round2(expected), actual: round2(actual), within: actual - expected <= tol.amount });
  return v;
};

/* ------------------------------------------------------------------ */
/* Budget check                                                        */
/* ------------------------------------------------------------------ */

/** Open commitments on a budget line: approved purchase orders not yet billed plus requisitions in approval. */
export const commitments = (com: CommercialState, account: string, accountOf: (sku: string) => string, reqAccount: (reqId: string) => string | undefined) => {
  const po = com.purchaseOrders
    .filter((o) => o.status === 'APPROVED' && !o.closed)
    .flatMap((o) => o.lines.filter((l) => accountOf(l.sku) === account && l.qty > l.billed).map((l) => ({ ref: o.number, kind: 'PO' as const, amount: round2((l.qty - l.billed) * l.price), what: l.description })));
  const req = com.requisitions
    .filter((r) => (r.status === 'SUBMITTED' || (r.status === 'APPROVED' && !r.poId)) && (reqAccount(r.id) ?? accountOf(r.lines[0]?.sku ?? '')) === account)
    .map((r) => ({ ref: r.number, kind: 'REQ' as const, amount: round2(r.lines.reduce((s, l) => s + l.qty * l.estPrice, 0)), what: r.justification }));
  return [...po, ...req];
};

export const budgetPosition = (fin: FinanceState, entries: LedgerEntry[], com: CommercialState, account: string, accountOf: (sku: string) => string, reqAccount: (reqId: string) => string | undefined, excludeRef?: string) => {
  const lines = fin.budgets.filter((b) => b.account === account);
  const budget = round2(lines.reduce((s, b) => s + b.monthly.reduce((a, x) => a + x, 0), 0));
  const year = String(fin.budgetYear);
  const actual = round2(entries.filter((e) => e.account === account && e.date.slice(0, 4) === year).reduce((s, e) => s + e.debit - e.credit, 0));
  const commits = commitments(com, account, accountOf, reqAccount).filter((c) => c.ref !== excludeRef);
  const committed = round2(commits.reduce((s, c) => s + c.amount, 0));
  return { account, budget, actual, committed, available: round2(budget - actual - committed), commits, hasBudget: lines.length > 0 };
};

/* ------------------------------------------------------------------ */
/* Cycle times and activity                                            */
/* ------------------------------------------------------------------ */

const hoursBetween = (a?: string, b?: string) => (a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000 : null);
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null && x >= 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
export const fmtHours = (h: number | null) => (h === null ? '—' : h < 24 ? `${Math.max(1, Math.round(h))} h` : `${(h / 24).toFixed(1)} days`);

/** Stage durations req → approval → PO → sent → first receipt → bill, from the document histories. */
export const cycleTimes = (com: CommercialState) => {
  const rows = com.requisitions.map((r) => {
    const po = com.purchaseOrders.find((o) => o.id === r.poId);
    const sub = r.history.find((h) => h.action.startsWith('Submitted'))?.at;
    const appr = r.approvals[r.approvals.length - 1]?.at;
    const poAt = po?.history[0]?.at;
    const sent = po?.sentAt;
    const grn = po ? com.receipts.filter((g) => g.poId === po.id).sort((a, b) => a.date.localeCompare(b.date))[0] : undefined;
    const billed = po?.history.find((h) => h.action.startsWith('Billed'))?.at;
    return { req: r, po, approve: hoursBetween(sub, appr), toPo: hoursBetween(appr, poAt), toSend: hoursBetween(poAt, sent), toReceive: hoursBetween(sent, grn ? `${grn.date}T12:00:00` : undefined), toBill: hoursBetween(grn ? `${grn.date}T12:00:00` : undefined, billed) };
  });
  return {
    rows,
    approve: avg(rows.map((r) => r.approve)),
    toPo: avg(rows.map((r) => r.toPo)),
    toSend: avg(rows.map((r) => r.toSend)),
    toReceive: avg(rows.map((r) => r.toReceive)),
    toBill: avg(rows.map((r) => r.toBill))
  };
};

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export const AGE_BUCKETS = ['0–30 days', '31–90 days', '91–180 days', 'Over 180 days'];
export const ageBucket = (days: number) => (days <= 30 ? 0 : days <= 90 ? 1 : days <= 180 ? 2 : 3);

/** Stock aging as at a date, from lots received on or before it. */
export const stockAging = (lots: Lot[], asAt: string) => {
  const rows = lots
    .filter((l) => l.qty > 0 && l.received <= asAt)
    .map((l) => {
      const age = daysBetween(l.received, asAt);
      return { lot: l, age, bucket: ageBucket(age), value: round2(l.qty * l.unitCost) };
    });
  const buckets = AGE_BUCKETS.map((label, i) => ({ label, qty: rows.filter((r) => r.bucket === i).reduce((s, r) => s + r.lot.qty, 0), value: round2(rows.filter((r) => r.bucket === i).reduce((s, r) => s + r.value, 0)) }));
  return { rows, buckets };
};

/** Lots to issue first: earliest expiry, then oldest receipt (FEFO / FIFO), skipping blocked conditions. */
export const pickLots = (lots: Lot[], sku: string, qty: number, warehouse?: string) => {
  const usable = lots
    .filter((l) => l.sku === sku && l.qty > 0 && (l.condition === 'NEW' || l.condition === 'GOOD') && (!warehouse || l.warehouse === warehouse))
    .sort((a, b) => (a.expiry ?? '9999').localeCompare(b.expiry ?? '9999') || a.received.localeCompare(b.received));
  const out: { lot: Lot; qty: number }[] = [];
  let left = qty;
  for (const l of usable) {
    if (left <= 0) break;
    const take = Math.min(l.qty, left);
    out.push({ lot: l, qty: take });
    left -= take;
  }
  return { picks: out, short: Math.max(0, left) };
};

export const itemFor = (items: ItemExt[], sku: string) => items.find((i) => i.sku === sku);
export const dueCounts = (s: ProcExtState, products: Product[], today = TODAY) => {
  const sched = s.countSchedules.map((c) => ({ ...c, due: addDays(c.lastDone, c.everyDays), overdue: addDays(c.lastDone, c.everyDays) <= today }));
  const items = s.items
    .filter((i) => i.active && products.some((p) => p.sku === i.sku && p.kind !== 'SERVICE'))
    .map((i) => ({ item: i, due: addDays(i.lastCounted ?? '2000-01-01', i.countEveryDays) }))
    .filter((x) => x.due <= addDays(today, 7));
  return { schedules: sched, items };
};

/* ------------------------------------------------------------------ */
/* Plan vs actual and PO analysis                                      */
/* ------------------------------------------------------------------ */

export const planActual = (s: ProcExtState, com: CommercialState) =>
  s.plan.lines.map((l) => {
    const pos = com.purchaseOrders.filter((o) => o.status === 'APPROVED' && o.date.slice(0, 4) === String(s.plan.year));
    const actual = round2(
      pos.reduce((a, o) => a + o.lines.filter((x) => (l.sku ? x.sku === l.sku : com.products.find((p) => p.sku === x.sku)?.category === l.category)).reduce((b, x) => b + x.qty * x.price, 0), 0)
    );
    const reqs = Object.entries(s.reqExt).filter(([, x]) => x.planLineId === l.id).length;
    return { line: l, actual, variance: round2(l.estValue - actual), used: l.estValue ? actual / l.estValue : 0, reqs };
  });

export const priceHistory = (com: CommercialState, sku: string) =>
  com.purchaseOrders
    .filter((o) => o.status === 'APPROVED')
    .flatMap((o) => o.lines.filter((l) => l.sku === sku).map((l) => ({ date: o.date, po: o.number, supplierId: o.supplierId, price: l.price, qty: l.qty })))
    .sort((a, b) => a.date.localeCompare(b.date));

export const lastPrice = (com: CommercialState, sku: string) => priceHistory(com, sku).slice(-1)[0] ?? null;

export const openPoValue = (com: CommercialState) =>
  round2(com.purchaseOrders.filter((o) => ['AWAITING', 'PART_RECEIVED', 'TO_SEND'].includes(poStage(o))).reduce((s, o) => s + totals(o.lines, com.products).net, 0));

/* ------------------------------------------------------------------ */
/* Code 39 barcode (labels for items, lots and bins)                   */
/* ------------------------------------------------------------------ */

const C39: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn'
};
/** Bar widths (alternating bar/space) for a Code 39 symbol, start/stop included. */
export const code39 = (text: string) => {
  const clean = `*${text.toUpperCase().replace(/[^0-9A-Z. -]/g, '-')}*`;
  const bars: number[] = [];
  for (const ch of clean) {
    for (const c of C39[ch] ?? C39['-']) bars.push(c === 'w' ? 3 : 1);
    bars.push(1);
  }
  return bars;
};
