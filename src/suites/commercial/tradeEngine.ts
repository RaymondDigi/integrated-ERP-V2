import { addDays, daysBetween, docBalance, kes, round2, TODAY, VAT_RATE } from '../finance/engine';
import type { FinanceState, Party } from '../finance/types';
import { lineNet, orderStage, totals, DISCOUNT_LIMIT } from './engine';
import type { CommercialState, Delivery, Line, OrderLine, Product, SalesOrder } from './types';
import type { AuctionLot, BlendComponent, Charge, CustomerProfile, Feedback, PriceList, PriceListLine, TastingRecord } from './tradeTypes';

/* ------------------------------------------------------------------ */
/* Customer profile helpers                                            */
/* ------------------------------------------------------------------ */

export const blankProfile = (customerId: string): CustomerProfile => ({
  customerId,
  contacts: [],
  billTos: [],
  shipTos: [],
  minOrderValue: 0,
  minOrderCharge: 0,
  cancelLimit: 0,
  restockFeePct: 10,
  freightOnBackorders: true,
  financeChargeExempt: false,
  rating: 'B — Standard',
  agingBuckets: [30, 60, 90],
  maxOverdueDays: 0,
  priority: 2,
  duplicatePo: 'WARN',
  repriceAtInvoice: false,
  regulatory: { licenceNo: '', licenceType: '', expiry: '', restrictedCountries: [], certificates: [] },
  docFormat: { layout: 'STANDARD', language: 'EN', showCustomerCodes: false, showInstructions: true, footer: '' },
  customerItems: [],
  kyc: [],
  history: []
});

export const profileOf = (s: CommercialState, customerId: string) => s.profiles.find((p) => p.customerId === customerId) ?? blankProfile(customerId);

/** Required KYC items that are not verified (or have expired). */
export const kycGaps = (s: CommercialState, customerId: string, today = TODAY) => {
  const prof = s.profiles.find((p) => p.customerId === customerId);
  if (!prof) return [];
  return s.kycTemplates
    .filter((t) => t.active && t.required)
    .filter((t) => {
      const r = prof.kyc.find((k) => k.itemId === t.id);
      return !r || r.status !== 'VERIFIED' || (!!r.expiry && r.expiry < today);
    })
    .map((t) => t.name);
};

/* ------------------------------------------------------------------ */
/* Pricing engine                                                      */
/* ------------------------------------------------------------------ */

const SCOPE_RANK: Record<PriceList['scope'], number> = { CUSTOMER: 1, CONTRACT: 2, GROUP: 3, PROMO: 4, EXTERNAL: 5 };
export const SCOPE_LABEL: Record<PriceList['scope'], string> = { CUSTOMER: 'Customer price book', CONTRACT: 'Contract price', GROUP: 'Buying group', PROMO: 'Promotion', EXTERNAL: 'External / auction reference' };

export interface PriceContext {
  customerId: string;
  sku: string;
  qty: number;
  /** Order date */
  date: string;
  /** Required / ship date */
  shipDate?: string;
  uom?: string;
  attr?: string;
  shipTo?: string;
  /** Exclude this order when counting the customer's annual volume. */
  orderId?: string;
}

export interface PriceResult {
  listPrice: number;
  /** Net unit price after the rule */
  net: number;
  price: number;
  discountPct: number;
  ruleId?: string;
  ruleLabel: string;
  candidates: { id: string; label: string; net: number }[];
  premiumPct: number;
}

/** Units of a SKU this customer bought (approved orders) in the calendar year of the date. */
export const annualQty = (s: CommercialState, customerId: string, sku: string, date: string, excludeOrderId?: string) =>
  s.orders
    .filter((o) => o.customerId === customerId && o.status === 'APPROVED' && o.id !== excludeOrderId && o.date.slice(0, 4) === date.slice(0, 4))
    .reduce((x, o) => x + o.lines.filter((l) => l.sku === sku).reduce((y, l) => y + l.qty, 0), 0);

export const listPriceFor = (p: Product | undefined, uom?: string) => {
  if (!p) return 0;
  const alt = uom && uom !== p.unit ? p.uomPrices?.find((u) => u.uom === uom) : undefined;
  return alt ? alt.price : p.price;
};

const lineApplies = (l: PriceListLine, c: PriceContext, p: Product | undefined, ytd: number) =>
  l.sku === c.sku &&
  (!l.uom || l.uom === (c.uom || p?.unit)) &&
  (!l.attr || l.attr === c.attr || l.attr === p?.attributes?.grade || l.attr === p?.attributes?.packSize) &&
  (!l.minQty || c.qty >= l.minQty) &&
  (!l.minAnnualQty || ytd + c.qty >= l.minAnnualQty) &&
  (l.price !== undefined || l.discountPct !== undefined);

export const listApplies = (pl: PriceList, c: PriceContext, prof: CustomerProfile) => {
  if (pl.status !== 'ACTIVE') return false;
  const when = pl.basis === 'SHIP_DATE' ? c.shipDate || c.date : c.date;
  if (when < pl.validFrom || when > pl.validTo) return false;
  if ((pl.scope === 'CUSTOMER' || pl.scope === 'CONTRACT') && pl.customerId !== c.customerId) return false;
  if (pl.scope === 'GROUP' && (!prof.priceGroup || pl.group !== prof.priceGroup)) return false;
  if (pl.shipTo) {
    const to = (c.shipTo ?? '').toLowerCase();
    if (!to || !to.includes(pl.shipTo.toLowerCase())) return false;
  }
  return true;
};

/**
 * Works out the price for one line: list price, then customer / contract / group / promotion / external lists in
 * that order of precedence (or the lowest of them when the lowest-price setting is on), volume breaks on the line
 * and on the year, unit of measure, attributes, ship-to and the order- or ship-date basis, then any rush premium.
 */
export const resolvePrice = (s: CommercialState, c: PriceContext): PriceResult => {
  const p = s.products.find((x) => x.sku === c.sku);
  const list = listPriceFor(p, c.uom);
  const prof = profileOf(s, c.customerId);
  const ytd = c.customerId ? annualQty(s, c.customerId, c.sku, c.date, c.orderId) : 0;
  const cands: { id: string; label: string; net: number; rank: number; premium: number }[] = [];
  for (const pl of s.priceLists) {
    if (!listApplies(pl, c, prof)) continue;
    const hits = pl.lines.filter((l) => lineApplies(l, c, p, ytd));
    if (!hits.length) continue;
    // the best break inside one list (highest volume threshold that applies → lowest price)
    const best = hits
      .map((l) => ({ l, net: round2(l.price !== undefined ? l.price : list * (1 - (l.discountPct ?? 0) / 100)) }))
      .sort((a, b) => a.net - b.net)[0];
    const lead = c.shipDate ? daysBetween(c.date, c.shipDate) : 99;
    const rush = pl.lines.find((l) => l.sku === c.sku && l.maxLeadDays !== undefined && lead <= (l.maxLeadDays ?? 0));
    const why = [best.l.minQty ? `${best.l.minQty}+ units` : '', best.l.minAnnualQty ? `${best.l.minAnnualQty}+ a year` : '', best.l.uom ? `per ${best.l.uom}` : '', best.l.attr ?? ''].filter(Boolean).join(', ');
    cands.push({ id: pl.id, label: `${pl.name}${why ? ` (${why})` : ''}`, net: best.net, rank: SCOPE_RANK[pl.scope], premium: rush?.premiumPct ?? 0 });
  }
  const chosen = cands.length ? (s.pricing.lowestPrice ? [...cands].sort((a, b) => a.net - b.net)[0] : [...cands].sort((a, b) => a.rank - b.rank || a.net - b.net)[0]) : null;
  let net = chosen ? chosen.net : list;
  const premium = chosen?.premium ?? 0;
  if (premium) net = round2(net * (1 + premium / 100));
  const discountPct = list > 0 && net < list ? round2((1 - net / list) * 100) : 0;
  return {
    listPrice: list,
    net,
    price: net > list ? net : list,
    discountPct: net > list ? 0 : discountPct,
    ruleId: chosen?.id,
    ruleLabel: chosen ? `${chosen.label}${premium ? ` + ${premium}% rush` : ''}` : 'List price',
    candidates: cands.map(({ id, label, net: n }) => ({ id, label, net: n })),
    premiumPct: premium
  };
};

/** Applies the pricing engine to a line (keeps free-text and manually priced lines as they are). */
export const pricedLine = <L extends Line>(s: CommercialState, l: L, c: Omit<PriceContext, 'sku' | 'qty' | 'uom'>): L => {
  if (!l.sku) return l;
  const r = resolvePrice(s, { ...c, sku: l.sku, qty: l.qty, uom: l.uom });
  return { ...l, price: r.price, discountPct: r.discountPct, ruleId: r.ruleId, ruleLabel: r.ruleLabel, rulePrice: r.net };
};

/** Order-level discount from an applicable price list (applies to the whole order). */
export const orderDiscount = (s: CommercialState, customerId: string, date: string, net: number) => {
  const prof = profileOf(s, customerId);
  const lists = s.priceLists.filter((pl) => pl.orderDiscountPct && net >= (pl.minOrderNet ?? 0) && listApplies(pl, { customerId, sku: '', qty: 0, date }, prof));
  const best = lists.sort((a, b) => (b.orderDiscountPct ?? 0) - (a.orderDiscountPct ?? 0))[0];
  return best ? { pct: best.orderDiscountPct ?? 0, label: best.name } : null;
};

/** Price that gives the desired margin on cost (margin = (price − cost) / price). */
export const priceForMargin = (cost: number, marginPct: number) => (marginPct >= 100 ? cost : round2(cost / (1 - marginPct / 100)));
export const priceForMarkup = (cost: number, markupPct: number) => round2(cost * (1 + markupPct / 100));
export const marginOf = (net: number, cost: number) => (net > 0 ? round2(((net - cost) / net) * 100) : 0);

/** Lines priced below what the rules allow (manual price overrides and discounts). */
export const priceOverrides = (lines: Line[], products: Product[]) => {
  const out: string[] = [];
  for (const l of lines) {
    const p = products.find((x) => x.sku === l.sku);
    if (!p || !l.qty) continue;
    const unit = l.price * (1 - (l.discountPct || 0) / 100);
    const ref = l.rulePrice ?? listPriceFor(p, l.uom);
    if (ref > 0 && unit < ref * (1 - DISCOUNT_LIMIT / 100) - 0.005) out.push(`${p.name} is priced at ${kes(unit)} — ${Math.round((1 - unit / ref) * 100)}% under the ${l.ruleId ? 'agreed' : 'list'} price of ${kes(ref)}`);
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Charges and freight                                                 */
/* ------------------------------------------------------------------ */

export const chargesTotal = (charges: Charge[] = [], party?: Party) => {
  const zero = party?.pin === 'NON-RESIDENT';
  const net = round2(charges.reduce((x, c) => x + c.amount, 0));
  const vat = zero ? 0 : round2(charges.filter((c) => c.vatable).reduce((x, c) => x + round2(c.amount * VAT_RATE), 0));
  return { net, vat, total: round2(net + vat) };
};

/** Lines plus charges, less any order discount. */
export const orderTotals = (o: Pick<SalesOrder, 'lines' | 'charges'>, products: Product[], party?: Party) => {
  const a = totals(o.lines, products, party);
  const b = chargesTotal(o.charges, party);
  return { net: round2(a.net + b.net), vat: round2(a.vat + b.vat), total: round2(a.total + b.total), goods: a.net, charges: b.net };
};

export const shipWeight = (lines: Line[], products: Product[]) => round2(lines.reduce((x, l) => x + l.qty * (products.find((p) => p.sku === l.sku)?.weightKg ?? 0), 0));

export const zoneOf = (s: CommercialState, town?: string) => {
  if (!town) return 'Nairobi';
  const t = town.toLowerCase();
  return s.freightRates.find((f) => f.zone.toLowerCase() === t)?.zone ?? POSTAL.find((p) => p.town.toLowerCase() === t || p.code === t)?.zone ?? 'Upcountry';
};

/** Freight for an order by weight and zone, with the zone's minimum charge. */
export const calcFreight = (s: CommercialState, lines: Line[], zone: string) => {
  const r = s.freightRates.find((f) => f.zone === zone) ?? s.freightRates[0];
  if (!r) return { freight: 0, handling: 0, kg: 0, zone };
  const kg = shipWeight(lines, s.products);
  return { freight: kg ? Math.max(r.minCharge, round2(kg * r.perKg)) : 0, handling: kg ? r.handling : 0, kg, zone: r.zone };
};

/* ------------------------------------------------------------------ */
/* Postal codes (uniform town / county / country entry)                */
/* ------------------------------------------------------------------ */

export const POSTAL = [
  { code: '00100', town: 'Nairobi', county: 'Nairobi', country: 'Kenya', zone: 'Nairobi' },
  { code: '00200', town: 'Nairobi', county: 'Nairobi', country: 'Kenya', zone: 'Nairobi' },
  { code: '80100', town: 'Mombasa', county: 'Mombasa', country: 'Kenya', zone: 'Coast' },
  { code: '80200', town: 'Malindi', county: 'Kilifi', country: 'Kenya', zone: 'Coast' },
  { code: '20200', town: 'Kericho', county: 'Kericho', country: 'Kenya', zone: 'Rift Valley' },
  { code: '20100', town: 'Nakuru', county: 'Nakuru', country: 'Kenya', zone: 'Rift Valley' },
  { code: '30100', town: 'Eldoret', county: 'Uasin Gishu', country: 'Kenya', zone: 'Rift Valley' },
  { code: '40100', town: 'Kisumu', county: 'Kisumu', country: 'Kenya', zone: 'Western' },
  { code: '40200', town: 'Kisii', county: 'Kisii', country: 'Kenya', zone: 'Western' },
  { code: '10100', town: 'Nyeri', county: 'Nyeri', country: 'Kenya', zone: 'Central' },
  { code: '60200', town: 'Meru', county: 'Meru', country: 'Kenya', zone: 'Central' },
  { code: '01000', town: 'Thika', county: 'Kiambu', country: 'Kenya', zone: 'Central' },
  { code: '30200', town: 'Kitale', county: 'Trans Nzoia', country: 'Kenya', zone: 'Rift Valley' },
  { code: 'DXB', town: 'Dubai', county: 'Dubai', country: 'United Arab Emirates', zone: 'Export' },
  { code: 'KHI', town: 'Karachi', county: 'Sindh', country: 'Pakistan', zone: 'Export' },
  { code: 'LON', town: 'London', county: 'Greater London', country: 'United Kingdom', zone: 'Export' }
];
export const lookupPostal = (code: string) => POSTAL.find((p) => p.code === code.trim());

/* ------------------------------------------------------------------ */
/* Credit control                                                      */
/* ------------------------------------------------------------------ */

/** Value of approved orders still to be invoiced (goods not yet invoiced plus open charges). */
export const uninvoicedValue = (s: CommercialState, customerId: string, party?: Party, excludeOrderId?: string) =>
  round2(
    s.orders
      .filter((o) => o.customerId === customerId && o.status === 'APPROVED' && !o.closed && o.id !== excludeOrderId)
      .reduce((x, o) => {
        const open = o.lines.map((l) => ({ ...l, qty: l.qty - l.invoiced })).filter((l) => l.qty > 0);
        return x + orderTotals({ lines: open, charges: (o.charges ?? []).filter((c) => !c.invoiced) }, s.products, party).total;
      }, 0)
  );

/** Invoices raised in Finance and not yet paid: posted ones plus drafts and those waiting for approval. */
export const arBalance = (fs: FinanceState, customerId: string) =>
  round2(fs.documents.filter((d) => d.kind === 'INVOICE' && d.partyId === customerId && d.status !== 'VOID' && d.status !== 'REJECTED').reduce((x, d) => x + docBalance(fs, d), 0));

export const openCredits = (s: CommercialState, customerId: string) => round2(s.credits.filter((c) => c.customerId === customerId && c.status === 'OPEN').reduce((x, c) => x + c.total, 0));

/** Total credit exposure: receivables (all raised invoices) + approved orders not yet invoiced − open credit notes. */
export const creditExposure = (s: CommercialState, fs: FinanceState, customerId: string, excludeOrderId?: string) => {
  const party = fs.parties.find((p) => p.id === customerId);
  const ar = arBalance(fs, customerId);
  const orders = uninvoicedValue(s, customerId, party, excludeOrderId);
  const credits = openCredits(s, customerId);
  return { ar, orders, credits, total: round2(ar + orders - credits), limit: party?.creditLimit ?? 0, headroom: party?.creditLimit ? round2(party.creditLimit - (ar + orders - credits)) : Infinity };
};

/** Oldest overdue days on posted invoices with a balance. */
export const maxOverdue = (fs: FinanceState, customerId: string, today = TODAY) =>
  fs.documents
    .filter((d) => d.kind === 'INVOICE' && d.partyId === customerId && d.status === 'POSTED' && d.dueDate < today && docBalance(fs, d) > 0.005)
    .reduce((m, d) => Math.max(m, daysBetween(d.dueDate, today)), 0);

/** Ageing with the customer's own buckets. */
export const customerAgeing = (fs: FinanceState, customerId: string, buckets: number[], today = TODAY) => {
  const edges = [...buckets].sort((a, b) => a - b);
  const labels = ['Not due', ...edges.map((e, i) => `${i ? edges[i - 1] + 1 : 1}–${e} days`), `${edges[edges.length - 1] ?? 0}+ days`];
  const sums = labels.map(() => 0);
  for (const d of fs.documents) {
    if (d.kind !== 'INVOICE' || d.partyId !== customerId || d.status !== 'POSTED') continue;
    const bal = docBalance(fs, d);
    if (bal <= 0.005) continue;
    const late = daysBetween(d.dueDate, today);
    const idx = late <= 0 ? 0 : (edges.findIndex((e) => late <= e) + 1 || labels.length - 1);
    sums[idx] = round2(sums[idx] + bal);
  }
  return labels.map((label, i) => ({ label, amount: sums[i] }));
};

/* ------------------------------------------------------------------ */
/* Order checks that block or route an order                           */
/* ------------------------------------------------------------------ */

/** Hard stops: the order cannot be submitted at all. */
export const orderBlockers = (s: CommercialState, o: SalesOrder, party: Party | undefined, today = TODAY) => {
  const out: string[] = [];
  const prof = profileOf(s, o.customerId);
  const gaps = kycGaps(s, o.customerId, today);
  if (gaps.length) out.push(`KYC not complete for ${party?.name ?? 'this customer'}: ${gaps.join(', ')}`);
  const reg = prof.regulatory;
  if (reg.licenceNo && reg.expiry && reg.expiry < today) out.push(`${reg.licenceType || 'Trading licence'} ${reg.licenceNo} expired on ${reg.expiry}`);
  const dest = (o.oneTimeShipTo || prof.shipTos.find((x) => x.id === o.shipToId)?.country || '').toLowerCase();
  const restricted = reg.restrictedCountries.find((c) => c && dest.includes(c.toLowerCase()));
  if (restricted) out.push(`Shipping to ${restricted} is restricted for this customer`);
  for (const l of o.lines) {
    const p = s.products.find((x) => x.sku === l.sku);
    if (p?.status === 'INACTIVE') out.push(`${p.name} is no longer sold`);
    if (p?.requiresCert && party?.pin === 'NON-RESIDENT' && !reg.certificates.includes(p.requiresCert)) out.push(`${p.name} needs a valid ${p.requiresCert} on file before it can be exported`);
  }
  return out;
};

/** Extra reasons (beyond the base rules) that send an order to the manager. */
export const extraExceptions = (s: CommercialState, fs: FinanceState, o: SalesOrder, party: Party | undefined) => {
  const out: string[] = [...priceOverrides(o.lines, s.products)];
  const prof = profileOf(s, o.customerId);
  const late = maxOverdue(fs, o.customerId);
  if (prof.maxOverdueDays > 0 && late > prof.maxOverdueDays) out.push(`${party?.name} has invoices ${late} days overdue (limit ${prof.maxOverdueDays} days)`);
  for (const l of o.lines) {
    const p = s.products.find((x) => x.sku === l.sku);
    if (p?.status === 'PROVISIONAL') out.push(`${l.sku} is a new part number waiting for the manager to set it up`);
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Availability: ATP and capable-to-promise                            */
/* ------------------------------------------------------------------ */

export interface RecipeLite {
  product: string;
  batchSize: number;
  hours: number;
  materials: { sku: string; qty: number }[];
}

/** Available to promise by a date, and when the full quantity could be promised (stock, purchase orders, production). */
export const atp = (s: CommercialState, sku: string, qty: number, recipes: RecipeLite[] = [], today = TODAY) => {
  const p = s.products.find((x) => x.sku === sku);
  if (!p || p.kind === 'SERVICE') return { available: Infinity, promise: today, source: 'Service' };
  const committedQty = s.orders.filter((o) => o.status === 'APPROVED' && !o.closed).reduce((x, o) => x + o.lines.filter((l) => l.sku === sku).reduce((y, l) => y + (l.qty - l.delivered), 0), 0);
  const free = p.stock - committedQty;
  if (qty <= free) return { available: free, promise: today, source: 'In stock' };
  // incoming supplier orders by expected date
  const incoming = s.purchaseOrders
    .filter((o) => o.status === 'APPROVED' && !o.closed)
    .flatMap((o) => o.lines.filter((l) => l.sku === sku).map((l) => ({ date: o.expected, qty: l.qty - l.received })))
    .sort((a, b) => a.date.localeCompare(b.date));
  let have = free;
  for (const i of incoming) {
    have += i.qty;
    if (have >= qty) return { available: free, promise: i.date < today ? today : i.date, source: 'Supplier order' };
  }
  // exploded BOM: can we make the shortfall from materials on hand?
  const r = recipes.find((x) => x.product === sku);
  if (r) {
    const short = qty - Math.max(0, have);
    const batches = Math.ceil(short / r.batchSize);
    const canMake = r.materials.every((m) => (s.products.find((x) => x.sku === m.sku)?.stock ?? 0) >= (m.qty * short) / r.batchSize);
    const days = Math.ceil((batches * r.hours) / 8) + 1 + (canMake ? 0 : 10);
    return { available: free, promise: addDays(today, days), source: canMake ? `Production — ${batches} batch${batches > 1 ? 'es' : ''}` : 'Production after materials arrive' };
  }
  return { available: free, promise: addDays(today, 21), source: 'Not available — estimate' };
};

/* ------------------------------------------------------------------ */
/* Releases                                                            */
/* ------------------------------------------------------------------ */

/** Stamps shipped dates on releases in date order as quantities are delivered. */
export const fulfilReleases = (l: OrderLine, deliveredTotal: number, date: string, deliveryId: string) => {
  if (!l.releases?.length) return l.releases;
  let left = deliveredTotal;
  return [...l.releases]
    .sort((a, b) => a.requestedDate.localeCompare(b.requestedDate))
    .map((r) => {
      left -= r.qty;
      return left >= -0.0001 && !r.shippedDate ? { ...r, shippedDate: date, deliveryId } : r;
    });
};

/* ------------------------------------------------------------------ */
/* Sales analysis                                                      */
/* ------------------------------------------------------------------ */

export interface SalesFact {
  orderId: string;
  order: string;
  date: string;
  month: string;
  customerId: string;
  customer: string;
  region: string;
  destination: string;
  sku: string;
  product: string;
  category: string;
  grade: string;
  channel: string;
  source: string;
  qty: number;
  revenue: number;
  vat: number;
  cogs: number;
  margin: number;
}

/** One row per invoiced order line: revenue, VAT, cost of sales and margin. */
export const salesFacts = (s: CommercialState, fs: FinanceState): SalesFact[] => {
  const out: SalesFact[] = [];
  for (const o of s.orders) {
    if (o.status !== 'APPROVED') continue;
    const party = fs.parties.find((p) => p.id === o.customerId);
    const prof = profileOf(s, o.customerId);
    const ship = prof.shipTos.find((x) => x.id === o.shipToId);
    for (const l of o.lines) {
      if (!l.invoiced) continue;
      const p = s.products.find((x) => x.sku === l.sku);
      const unit = l.price * (1 - (l.discountPct || 0) / 100);
      const revenue = round2(l.invoiced * unit);
      const cogs = round2(l.invoiced * (p?.cost ?? 0));
      out.push({
        orderId: o.id,
        order: o.number,
        date: o.date,
        month: o.date.slice(0, 7),
        customerId: o.customerId,
        customer: o.oneTimeName || party?.name || o.customerId,
        region: ship?.zone ?? (party?.pin === 'NON-RESIDENT' ? 'Export' : 'Nairobi'),
        destination: o.oneTimeShipTo || ship?.town || o.deliveryAddress || (party?.pin === 'NON-RESIDENT' ? 'Export' : 'Nairobi'),
        sku: l.sku || 'Free text',
        product: p?.name ?? l.description,
        category: p?.category ?? 'Other',
        grade: p?.attributes?.grade ?? '—',
        channel: o.channel ?? 'DIRECT',
        source: o.sourceCode ?? '—',
        qty: l.invoiced,
        revenue,
        vat: party?.pin === 'NON-RESIDENT' || (p && !p.vatable) ? 0 : round2(revenue * VAT_RATE),
        cogs,
        margin: round2(revenue - cogs)
      });
    }
  }
  return out;
};

export const groupFacts = (facts: SalesFact[], key: keyof SalesFact) => {
  const m = new Map<string, { key: string; qty: number; revenue: number; vat: number; cogs: number; margin: number; orders: Set<string> }>();
  for (const f of facts) {
    const k = String(f[key]);
    const r = m.get(k) ?? { key: k, qty: 0, revenue: 0, vat: 0, cogs: 0, margin: 0, orders: new Set<string>() };
    r.qty += f.qty;
    r.revenue = round2(r.revenue + f.revenue);
    r.vat = round2(r.vat + f.vat);
    r.cogs = round2(r.cogs + f.cogs);
    r.margin = round2(r.margin + f.margin);
    r.orders.add(f.orderId);
    m.set(k, r);
  }
  return [...m.values()].map((r) => ({ ...r, orders: r.orders.size, marginPct: r.revenue ? round2((r.margin / r.revenue) * 100) : 0 })).sort((a, b) => b.revenue - a.revenue);
};

/** On-time-in-full per customer plus their average delivery rating. */
export const deliveryRating = (s: CommercialState, customerId?: string) => {
  const rows = s.deliveries
    .map((d) => ({ d, o: s.orders.find((o) => o.id === d.orderId)! }))
    .filter((x) => x.o && (!customerId || x.o.customerId === customerId));
  const onTime = rows.filter((x) => x.d.date <= x.o.requiredBy).length;
  const inFull = rows.filter((x) => !(x.d.received ?? []).some((r) => r.qty < (x.d.lines.find((l) => l.lineId === r.lineId)?.qty ?? 0) || r.damaged > 0)).length;
  const otif = rows.filter((x) => x.d.date <= x.o.requiredBy && !(x.d.received ?? []).some((r) => r.qty < (x.d.lines.find((l) => l.lineId === r.lineId)?.qty ?? 0) || r.damaged > 0)).length;
  const rated = rows.filter((x) => x.d.rating);
  return {
    deliveries: rows.length,
    onTime: rows.length ? onTime / rows.length : null,
    inFull: rows.length ? inFull / rows.length : null,
    otif: rows.length ? otif / rows.length : null,
    rating: rated.length ? round2(rated.reduce((x, r) => x + (r.d.rating ?? 0), 0) / rated.length) : null
  };
};

export const isLateDelivery = (d: Delivery, o: SalesOrder) => d.date > o.requiredBy;
export const backOrdered = (o: SalesOrder) => (orderStage(o) === 'PART_DELIVERED' || orderStage(o) === 'TO_INVOICE') && o.lines.some((l) => l.delivered > 0 && l.delivered < l.qty) && !o.closed;

/** Units ordered in the last N days against what is free to sell. */
export const hotItems = (s: CommercialState, days = 30, today = TODAY) =>
  s.products
    .filter((p) => p.kind === 'GOODS')
    .map((p) => {
      const ordered = s.orders.filter((o) => o.status !== 'VOID' && o.status !== 'DRAFT' && o.date >= addDays(today, -days)).reduce((x, o) => x + o.lines.filter((l) => l.sku === p.sku).reduce((y, l) => y + l.qty, 0), 0);
      const committedQty = s.orders.filter((o) => o.status === 'APPROVED' && !o.closed).reduce((x, o) => x + o.lines.filter((l) => l.sku === p.sku).reduce((y, l) => y + (l.qty - l.delivered), 0), 0);
      const free = p.stock - committedQty;
      return { p, ordered, free, cover: ordered ? round2((free / ordered) * days) : null };
    })
    .filter((x) => x.ordered > 0)
    .sort((a, b) => b.ordered - a.ordered);

/* ------------------------------------------------------------------ */
/* Tea                                                                 */
/* ------------------------------------------------------------------ */

export const TEA_GRADES = ['BP1', 'PF1', 'PD', 'D1', 'BMF', 'FNGS', 'BOPF'];
export const TEA_ORIGINS = ['Kericho', 'Nandi', 'Nyeri', 'Meru', 'Kisii', 'Bomet', 'Murang’a'];
export const PACK_SIZES = ['Tea bags 100s', '50 g sachet', '250 g packet', '500 g packet', '1 kg packet', '25 kg sack'];
export const FLAVOURS = ['Plain', 'Masala', 'Ginger', 'Lemon', 'Mint'];
export const PACK_KG: Record<string, number> = { 'Tea bags 100s': 0.2, '50 g sachet': 0.05, '250 g packet': 0.25, '500 g packet': 0.5, '1 kg packet': 1, '25 kg sack': 25 };
/** Standard packing line and recipe used for each pack size. */
export const PACK_LINE: Record<string, { line: string; recipe: string; batchSize: number; hours: number }> = {
  'Tea bags 100s': { line: 'Line 2 — Premium', recipe: 'rc2', batchSize: 100, hours: 5 },
  '50 g sachet': { line: 'Packing hall', recipe: 'rc5', batchSize: 100, hours: 6 },
  '250 g packet': { line: 'Line 1 — Standard', recipe: 'rc1', batchSize: 200, hours: 6 },
  '500 g packet': { line: 'Line 1 — Standard', recipe: 'rc1', batchSize: 200, hours: 6 },
  '1 kg packet': { line: 'Line 1 — Standard', recipe: 'rc1', batchSize: 200, hours: 6 },
  '25 kg sack': { line: 'Bulk bagging', recipe: 'rc3', batchSize: 80, hours: 4 }
};
export const CONVERSION_PER_HOUR = 4_500;

/** Rules the blend configurator enforces. */
export const blendRuleErrors = (attrs: { grade: string; packSize: string; flavour: string }, comps: BlendComponent[]) => {
  const out: string[] = [];
  const sum = round2(comps.reduce((x, c) => x + c.pct, 0));
  if (!comps.length) out.push('Add at least one component tea');
  if (Math.abs(sum - 100) > 0.01) out.push(`Components add up to ${sum}% — they must make 100%`);
  if (comps.some((c) => c.pct < 5)) out.push('Each component must be at least 5% of the blend');
  if (attrs.packSize === 'Tea bags 100s' && !['PF1', 'PD', 'D1', 'FNGS', 'BMF'].includes(attrs.grade)) out.push('Tea bags need a fine grade (PF1, PD, D1, BMF or FNGS)');
  if (attrs.packSize === '25 kg sack' && attrs.flavour !== 'Plain') out.push('Flavoured blends are not packed in 25 kg sacks');
  if (comps.some((c) => !c.grade || !c.origin)) out.push('Every component needs a grade and an origin');
  return out;
};

/** Unit cost of a configured blend: tea + packaging + line conversion. */
export const blendCost = (comps: BlendComponent[], kgPerUnit: number, packaging: { sku: string; qtyPerUnit: number }[], products: Product[], batchSize: number, hours: number) => {
  const teaKg = comps.reduce((x, c) => x + (c.pct / 100) * c.costPerKg, 0);
  const pack = packaging.reduce((x, p) => x + p.qtyPerUnit * (products.find((q) => q.sku === p.sku)?.cost ?? 0), 0);
  const conversion = batchSize ? (hours * CONVERSION_PER_HOUR) / batchSize : 0;
  return round2(teaKg * kgPerUnit + pack + conversion);
};

/** Days to produce a quantity of a configured blend on its line (8-hour shifts, one day to set up). */
export const blendLeadDays = (qty: number, batchSize: number, hours: number) => (qty > 0 && batchSize ? Math.ceil((Math.ceil(qty / batchSize) * hours) / 8) + 1 : 0);

export const tastingTotal = (t: TastingRecord['scores']) => round2((t.appearance + t.infusion + t.liquor + t.body + t.brightness) / 5);

export const highestBid = (l: AuctionLot) => [...l.bids].sort((a, b) => b.price - a.price)[0];

/** Ranks lots and stock against a customer's request (grade, origin, price, quantity, quality). */
export const matchStock = (
  s: CommercialState,
  req: { grade: string; origin: string; maxPrice: number; qtyKg: number; minScore: number }
) => {
  const lots = s.auctions
    .filter((a) => a.status !== 'CLOSED')
    .flatMap((a) => a.lots.filter((l) => l.status === 'OPEN').map((l) => ({ a, l })));
  const scored = lots.map(({ a, l }) => {
    const tasting = s.tastings.filter((t) => t.ref === l.lotNo).sort((x, y) => y.date.localeCompare(x.date))[0];
    const score = tasting ? tastingTotal(tasting.scores) : l.tastingScore ?? 0;
    const origin = l.garden;
    let fit = 0;
    const why: string[] = [];
    if (!req.grade || l.grade === req.grade) { fit += 40; if (req.grade) why.push('grade'); }
    if (!req.origin || origin.toLowerCase().includes(req.origin.toLowerCase()) || gardenOrigin(origin) === req.origin) { fit += 20; if (req.origin) why.push('origin'); }
    const price = highestBid(l)?.price ?? l.valuation;
    if (!req.maxPrice || price <= req.maxPrice) { fit += 20; if (req.maxPrice) why.push('price'); }
    if (!req.qtyKg || l.netKg >= req.qtyKg) { fit += 10; if (req.qtyKg) why.push('quantity'); }
    if (!req.minScore || score >= req.minScore) { fit += 10; if (req.minScore) why.push('quality'); }
    return { kind: 'LOT' as const, ref: l.lotNo, sale: a.saleNo, garden: l.garden, grade: l.grade, kg: l.netKg, price, score, fit, why };
  });
  const stock = s.products
    .filter((p) => p.attributes?.grade && p.kind === 'GOODS')
    .map((p) => {
      let fit = 0;
      const why: string[] = [];
      if (!req.grade || p.attributes?.grade === req.grade) { fit += 40; if (req.grade) why.push('grade'); }
      if (!req.origin || p.attributes?.origin === req.origin) { fit += 20; if (req.origin) why.push('origin'); }
      fit += 20;
      const kg = p.stock * (p.weightKg ?? 1);
      if (!req.qtyKg || kg >= req.qtyKg) { fit += 10; if (req.qtyKg) why.push('quantity'); }
      const t = s.tastings.filter((x) => x.ref === p.sku)[0];
      const score = t ? tastingTotal(t.scores) : 0;
      if (!req.minScore || score >= req.minScore) { fit += 10; if (req.minScore) why.push('quality'); }
      return { kind: 'STOCK' as const, ref: p.sku, sale: 'Warehouse', garden: p.attributes?.garden ?? p.name, grade: p.attributes?.grade ?? '', kg, price: p.price, score, fit, why };
    });
  return [...scored, ...stock].sort((a, b) => b.fit - a.fit || b.score - a.score);
};

const GARDEN_ORIGIN: Record<string, string> = {
  Kiambethu: 'Kiambu',
  Kaimosi: 'Nandi',
  Chemomi: 'Nandi',
  Kapchorua: 'Nandi',
  Momul: 'Kericho',
  Toror: 'Kericho',
  Gathuthi: 'Nyeri',
  Iriaini: 'Nyeri',
  Michimikuru: 'Meru',
  Kiamokama: 'Kisii',
  Tegat: 'Bomet'
};
export const gardenOrigin = (garden: string) => GARDEN_ORIGIN[garden] ?? '';

/* ------------------------------------------------------------------ */
/* Customer experience                                                 */
/* ------------------------------------------------------------------ */

export const SLA_DAYS: Record<Feedback['severity'], number> = { HIGH: 2, MEDIUM: 5, LOW: 10 };

export const npsOf = (scores: number[]) => {
  if (!scores.length) return null;
  const pro = scores.filter((x) => x >= 9).length;
  const det = scores.filter((x) => x <= 6).length;
  return Math.round(((pro - det) / scores.length) * 100);
};

export const feedbackLate = (f: Feedback, today = TODAY) => (f.status === 'OPEN' || f.status === 'IN_PROGRESS' ? f.slaDue < today : (f.resolvedAt ?? '').slice(0, 10) > f.slaDue);

/** Where each customer is in their journey with us, from first contact to repeat business and feedback. */
export const JOURNEY = ['Lead', 'Quoted', 'First order', 'Delivered', 'Invoiced', 'Repeat', 'Feedback'] as const;
export const journeyOf = (s: CommercialState, fs: FinanceState, customerId: string) => {
  const opps = s.opportunities.filter((o) => o.customerId === customerId).map((o) => o.created).sort();
  const quotes = s.quotations.filter((q) => q.customerId === customerId).map((q) => q.date).sort();
  const orders = s.orders.filter((o) => o.customerId === customerId && o.status === 'APPROVED').map((o) => o.date).sort();
  const dns = s.deliveries.filter((d) => s.orders.find((o) => o.id === d.orderId)?.customerId === customerId).map((d) => d.date).sort();
  const invs = fs.documents.filter((d) => d.kind === 'INVOICE' && d.partyId === customerId).map((d) => d.date).sort();
  const fb = [...s.feedback.filter((f) => f.customerId === customerId).map((f) => f.at.slice(0, 10)), ...s.surveys.filter((x) => x.customerId === customerId).map((x) => x.date)].sort();
  const dates = [opps[0], quotes[0], orders[0], dns[0], invs[0], orders[1], fb[0]];
  return JOURNEY.map((stage, i) => ({ stage, date: dates[i] as string | undefined }));
};

export const fmtPct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
export const lineNetOf = lineNet;
