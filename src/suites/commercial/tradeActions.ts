import { addDays, docBalance, kes, round2, TODAY } from '../finance/engine';
import type { HistoryEntry, Party } from '../finance/types';
import type { useFinance } from '../finance/store';
import { notify } from '../../platform/outbox';
import { audit, auditChanges } from '../../platform/audit';
import type { ESignature } from '../../platform/Widgets';
import { orderExceptions, totals } from './engine';
import {
  blendCost,
  blendRuleErrors,
  calcFreight,
  creditExposure,
  extraExceptions,
  highestBid,
  kycGaps,
  orderBlockers,
  orderTotals,
  PACK_LINE,
  priceForMargin,
  priceOverrides,
  pricedLine,
  profileOf,
  resolvePrice,
  SLA_DAYS,
  zoneOf,
  blankProfile
} from './tradeEngine';
import type { ComRole, CommercialState, Delivery, Line, OrderLine, Product, PurchaseOrder, Quotation, SalesOrder } from './types';
import type {
  AuctionLot,
  AuctionSale,
  BlendConfig,
  Campaign,
  Charge,
  Contract,
  CustomerProfile,
  Feedback,
  FreightRate,
  KycRecord,
  KycTemplate,
  OnboardingApplication,
  PaymentTerm,
  PortalEvent,
  PriceList,
  ReasonCode,
  RmaLine,
  RmaType,
  SampleDispatch,
  SurveyResponse,
  TastingRecord
} from './tradeTypes';

export type Result = { ok: true; id?: string } | { ok: false; error: string };

/** What the main commercial store hands to the trading and business development actions. */
export interface StoreKit {
  get: () => CommercialState;
  commit: (s: CommercialState) => void;
  fail: (error: string) => Result;
  done: (title: string, message: string, id?: string) => Result;
  toast: (type: 'info' | 'warning', title: string, message: string) => void;
  log: (action: string, note?: string) => HistoryEntry;
  uid: (p: string) => string;
  next: (s: CommercialState, prefix: string) => { number: string; sequence: Record<string, number> };
  now: () => string;
  party: (id: string) => Party | undefined;
  finance: ReturnType<typeof useFinance>;
  /** Error text when the signed-in account may not change data. */
  readOnly: () => string | null;
  saveOrder: (o: Omit<Partial<SalesOrder>, 'lines'> & Pick<SalesOrder, 'customerId' | 'date' | 'requiredBy' | 'customerRef' | 'deliveryAddress' | 'notes'> & { lines: Line[] }) => Result;
  submitOrder: (id: string) => Result;
  cancelOrder: (id: string, reasonCodeId?: string) => Result;
  adjustStock: (changes: { sku: string; delta: number }[]) => Result;
}

const MODULE = 'Trading';
export const CASH_CUSTOMER = 'Cash customer (walk-in)';
const PIN_RE = /^[AP]\d{9}[A-Z]$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const makeTradeActions = (k: StoreKit) => {
  const { get, commit, fail, done, log, uid, next, now, party, finance } = k;
  const actor = () => get().actor;
  const is = (...roles: ComRole[]) => roles.includes(actor().role);
  /** Read-only accounts are refused first, then the persona's role. */
  const deny = (roles: ComRole[] | null, who: string) => {
    const ro = k.readOnly();
    if (ro) return ro;
    if (roles && !is(...roles)) return `${who} — switch the "Acting as" persona`;
    return null;
  };
  const MANAGERS: ComRole[] = ['MANAGER', 'DIRECTOR'];
  const SELLERS: ComRole[] = ['OFFICER', 'MANAGER', 'DIRECTOR'];
  const STORES: ComRole[] = ['STOREKEEPER', 'MANAGER'];
  const setOrders = (fn: (o: SalesOrder) => SalesOrder) => commit({ ...get(), orders: get().orders.map(fn) });
  const patchOrder = (id: string, patch: Partial<SalesOrder>, action: string, note?: string) =>
    setOrders((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log(action, note)] } : x));
  const customerMail = (customerId: string, subject: string, body: string, ref?: string, channels?: ('EMAIL' | 'SMS' | 'IN_APP')[]) => {
    const p = party(customerId);
    notify({ module: MODULE, to: p?.name ?? customerId, address: channels?.includes('SMS') ? p?.phone : p?.email, subject, body, ref, channels: channels ?? ['EMAIL'] });
  };
  const upsertProfile = (s: CommercialState, prof: CustomerProfile) =>
    s.profiles.some((p) => p.customerId === prof.customerId) ? s.profiles.map((p) => (p.customerId === prof.customerId ? prof : p)) : [...s.profiles, prof];

  /* ================= Product master ================= */
  const barcodeTaken = (s: CommercialState, code: string, sku: string) => s.products.some((p) => p.sku !== sku && (p.upc === code || (p.barcodes ?? []).includes(code)));
  const saveProduct = (p: Product, isNew: boolean, note = ''): Result => {
    const s = get();
    const ex = s.products.find((x) => x.sku === p.sku);
    const err = deny(isNew ? SELLERS : null, 'Only the commercial team maintains products');
    if (err) return fail(err);
    if (!p.sku.trim() || !/^[A-Z0-9-]{3,16}$/.test(p.sku.trim())) return fail('SKU must be 3–16 capital letters, digits or dashes');
    if (!p.name.trim()) return fail('Enter the product name');
    if (isNew && ex) return fail(`SKU ${p.sku} already exists`);
    if (!isNew && !ex) return fail('Unknown product');
    if (p.price < 0 || p.cost < 0) return fail('Prices cannot be negative');
    for (const code of [p.upc, ...(p.barcodes ?? [])].filter(Boolean) as string[]) {
      if (!/^\d{8}$|^\d{12,14}$/.test(code)) return fail(`Barcode ${code} must be 8, 12, 13 or 14 digits (EAN/UPC)`);
      if (barcodeTaken(s, code, p.sku)) return fail(`Barcode ${code} is already used on another product`);
    }
    const priceChanged = ex && ex.price !== p.price;
    if (!isNew && !is(...MANAGERS) && (priceChanged || ex?.cost !== p.cost || ex?.status !== p.status)) return fail('Price, cost and status changes are made by the Commercial Manager');
    if (isNew && !is(...MANAGERS) && p.status !== 'PROVISIONAL') p = { ...p, status: 'PROVISIONAL' };
    const history = priceChanged || isNew ? [...(ex?.priceHistory ?? []), { price: p.price, from: TODAY, by: actor().name, note: note || (isNew ? 'New product' : 'Price change') }] : ex?.priceHistory;
    const rec: Product = { ...p, sku: p.sku.trim(), name: p.name.trim(), priceHistory: history };
    commit({ ...s, products: isNew ? [...s.products, rec] : s.products.map((x) => (x.sku === p.sku ? rec : x)) });
    if (ex) auditChanges(MODULE, actor().name, `Product ${p.sku}`, ex, rec, ['name', 'price', 'cost', 'upc', 'status', 'category', 'reorderLevel', 'weightKg']);
    else audit({ module: MODULE, by: actor().name, action: rec.status === 'PROVISIONAL' ? 'Provisional product created' : 'Product created', ref: rec.sku });
    return done(isNew ? 'Product created' : 'Product saved', `${rec.sku} · ${rec.name}${rec.status === 'PROVISIONAL' ? ' — provisional until the manager activates it' : ''}`, rec.sku);
  };
  /** A new part number typed on a quote or order: created as provisional for the manager to complete. */
  const addProvisionalProduct = (sku: string, name: string, price: number): Result =>
    saveProduct({ sku: sku.trim().toUpperCase(), name, kind: 'GOODS', category: 'New parts', unit: 'units', price, cost: 0, stock: 0, reorderLevel: 0, reorderQty: 0, vatable: true, account: '4000', status: 'PROVISIONAL' }, true, 'Created from order entry');

  const massUpdatePrices = (o: { target: string; category: string; mode: 'PCT' | 'AMOUNT'; value: number; note: string }): Result => {
    const err = deny(MANAGERS, 'Mass price changes are made by the Commercial Manager');
    if (err) return fail(err);
    if (!o.value) return fail('Enter the increase (negative for a decrease)');
    if (o.mode === 'PCT' && (o.value <= -90 || o.value > 200)) return fail('Percentage must be between −90% and 200%');
    const s = get();
    const bump = (price: number) => round2(Math.max(0, o.mode === 'PCT' ? price * (1 + o.value / 100) : price + o.value));
    if (o.target === 'PRODUCTS') {
      let n = 0;
      const products = s.products.map((p) => {
        if (!p.price || p.kind === 'MATERIAL' || (o.category && p.category !== o.category)) return p;
        n++;
        const price = bump(p.price);
        return { ...p, price, priceHistory: [...(p.priceHistory ?? []), { price, from: TODAY, by: actor().name, note: o.note || `Mass update ${o.mode === 'PCT' ? `${o.value}%` : kes(o.value)}` }] };
      });
      if (!n) return fail('No products match');
      commit({ ...s, products });
      audit({ module: MODULE, by: actor().name, action: 'Mass price update', note: `${n} products ${o.mode === 'PCT' ? `${o.value}%` : `+${o.value}`}` });
      return done('Prices updated', `${n} list prices changed — history kept on each product`);
    }
    const pl = s.priceLists.find((x) => x.id === o.target);
    if (!pl) return fail('Choose a price list');
    let n = 0;
    const lines = pl.lines.map((l) => {
      const cat = s.products.find((p) => p.sku === l.sku)?.category;
      if (o.category && cat !== o.category) return l;
      if (l.price !== undefined) return (n++, { ...l, price: bump(l.price) });
      return l;
    });
    if (!n) return fail('This list has no fixed prices to change (discount lines follow the list price)');
    commit({ ...s, priceLists: s.priceLists.map((x) => (x.id === pl.id ? { ...x, lines, history: [...x.history, log('Mass price update', `${n} lines ${o.mode === 'PCT' ? `${o.value}%` : `+${o.value}`}`)] } : x)) });
    return done('Price list updated', `${n} prices in ${pl.name}`);
  };

  /* ================= Price lists ================= */
  const savePriceList = (pl: PriceList): Result => {
    const err = deny(SELLERS, 'Price lists are prepared by the commercial team');
    if (err) return fail(err);
    const s = get();
    if (!pl.name.trim()) return fail('Name the price list');
    if (pl.validTo < pl.validFrom) return fail('The end date is before the start date');
    if ((pl.scope === 'CUSTOMER' || pl.scope === 'CONTRACT') && !pl.customerId) return fail('Choose the customer');
    if (pl.scope === 'GROUP' && !pl.group?.trim()) return fail('Enter the buying group');
    const lines = pl.lines.filter((l) => l.sku);
    if (!lines.length && !pl.orderDiscountPct) return fail('Add at least one product line or an order discount');
    for (const l of lines) {
      if (!s.products.some((p) => p.sku === l.sku)) return fail(`Unknown SKU ${l.sku}`);
      const hasPrice = l.price !== undefined && l.price > 0;
      const hasDisc = l.discountPct !== undefined && l.discountPct > 0 && l.discountPct < 100;
      if (!hasPrice && !hasDisc && !l.premiumPct) return fail(`${l.sku}: give a price, a discount between 0 and 100%, or a rush premium`);
    }
    const keys = lines.map((l) => [l.sku, l.uom ?? '', l.attr ?? '', l.minQty ?? 0, l.minAnnualQty ?? 0, l.maxLeadDays ?? ''].join('|'));
    if (new Set(keys).size !== keys.length) return fail('Two lines have the same product and conditions');
    const ex = s.priceLists.find((x) => x.id === pl.id);
    if (ex) {
      const rec = { ...pl, lines, status: ex.status === 'ACTIVE' && !is(...MANAGERS) ? ('DRAFT' as const) : pl.status, history: [...ex.history, log('Edited')] };
      commit({ ...s, priceLists: s.priceLists.map((x) => (x.id === pl.id ? rec : x)) });
      return done('Price list saved', rec.status === 'DRAFT' && ex.status === 'ACTIVE' ? `${pl.name} goes back to the manager for approval` : pl.name, pl.id);
    }
    const rec: PriceList = { ...pl, id: uid('pl'), lines, status: 'DRAFT', createdBy: actor().name, history: [log('Created')] };
    commit({ ...s, priceLists: [rec, ...s.priceLists] });
    return done('Price list created', `${rec.name} — the manager activates it`, rec.id);
  };
  const approvePriceList = (id: string): Result => {
    const err = deny(MANAGERS, 'Price lists are activated by the Commercial Manager');
    if (err) return fail(err);
    const s = get();
    const pl = s.priceLists.find((x) => x.id === id);
    if (!pl || pl.status !== 'DRAFT') return fail('Only draft price lists can be activated');
    if (pl.createdBy === actor().name && pl.history.some((h) => h.by === actor().name && h.action === 'Edited')) return fail('You prepared this list, so someone else must activate it');
    commit({ ...s, priceLists: s.priceLists.map((x) => (x.id === id ? { ...x, status: 'ACTIVE', approvedBy: actor().name, history: [...x.history, log('Approved and activated')] } : x)) });
    audit({ module: MODULE, by: actor().name, action: 'Price list activated', ref: pl.name });
    return done('Price list active', `${pl.name} now prices new orders`);
  };
  const retirePriceList = (id: string): Result => {
    const err = deny(MANAGERS, 'Price lists are retired by the Commercial Manager');
    if (err) return fail(err);
    const s = get();
    commit({ ...s, priceLists: s.priceLists.map((x) => (x.id === id ? { ...x, status: 'RETIRED', history: [...x.history, log('Retired')] } : x)) });
    return done('Price list retired', s.priceLists.find((x) => x.id === id)?.name ?? '');
  };
  const setLowestPrice = (on: boolean): Result => {
    const err = deny(MANAGERS, 'Pricing policy is set by the Commercial Manager');
    if (err) return fail(err);
    commit({ ...get(), pricing: { ...get().pricing, lowestPrice: on } });
    return done('Pricing policy saved', on ? 'Orders get the lowest available price' : 'Most specific price list wins');
  };
  /** Reference prices from an external source (auction averages, EATTA feed export) into an EXTERNAL price list. */
  const importReferencePrices = (rows: Record<string, string>[], name: string) => {
    const s = get();
    const errors: string[] = [];
    const ro = deny(MANAGERS, 'Reference prices are loaded by the Commercial Manager');
    if (ro) return { imported: 0, errors: [ro] };
    const lines = rows.flatMap((r, i) => {
      const sku = (r.sku ?? '').toUpperCase();
      const price = Number(r.price);
      if (!s.products.some((p) => p.sku === sku)) return (errors.push(`Row ${i + 2}: unknown SKU ${r.sku}`), []);
      if (!(price > 0)) return (errors.push(`Row ${i + 2}: price must be above zero`), []);
      return [{ sku, price }];
    });
    if (!lines.length) return { imported: 0, errors };
    const pl: PriceList = { id: uid('pl'), name: name || `External reference ${TODAY}`, scope: 'EXTERNAL', validFrom: TODAY, validTo: addDays(TODAY, 30), basis: 'ORDER_DATE', lines, status: 'ACTIVE', createdBy: actor().name, approvedBy: actor().name, history: [log('Imported from external file (simulated feed)')] };
    commit({ ...s, priceLists: [pl, ...s.priceLists] });
    return { imported: lines.length, errors };
  };

  /* ================= Settings lists ================= */
  const saveReasonCode = (r: ReasonCode): Result => {
    const err = deny(MANAGERS, 'Reason codes are maintained by the Commercial Manager');
    if (err) return fail(err);
    if (!r.label.trim()) return fail('Enter the reason');
    const s = get();
    if (s.reasonCodes.some((x) => x.id !== r.id && x.kind === r.kind && x.label.toLowerCase() === r.label.trim().toLowerCase())) return fail('That reason already exists');
    const rec = { ...r, label: r.label.trim(), id: r.id || uid('rc') };
    commit({ ...s, reasonCodes: r.id ? s.reasonCodes.map((x) => (x.id === r.id ? rec : x)) : [...s.reasonCodes, rec] });
    return done('Reason code saved', rec.label);
  };
  const savePaymentTerm = (t: PaymentTerm, isNew: boolean): Result => {
    const err = deny(MANAGERS, 'Payment terms are set by the Commercial Manager');
    if (err) return fail(err);
    if (!t.id.trim() || !t.label.trim()) return fail('Enter a code and a name');
    if (t.days < 0 || t.discountPct < 0 || t.discountPct >= 20 || t.discountDays > t.days) return fail('Check the days and the early-payment discount');
    const s = get();
    if (isNew && s.paymentTerms.some((x) => x.id === t.id)) return fail('That code is taken');
    commit({ ...s, paymentTerms: isNew ? [...s.paymentTerms, t] : s.paymentTerms.map((x) => (x.id === t.id ? t : x)) });
    return done('Payment terms saved', t.label);
  };
  const saveFreightRate = (f: FreightRate): Result => {
    const err = deny(MANAGERS, 'Freight rates are set by the Commercial Manager');
    if (err) return fail(err);
    if (!f.zone.trim() || f.perKg < 0 || f.minCharge < 0 || f.handling < 0) return fail('Check the zone and the rates');
    const s = get();
    commit({ ...s, freightRates: s.freightRates.some((x) => x.zone === f.zone) ? s.freightRates.map((x) => (x.zone === f.zone ? f : x)) : [...s.freightRates, f] });
    return done('Freight rate saved', f.zone);
  };
  const saveCampaign = (c: Campaign, isNew: boolean): Result => {
    const err = deny(SELLERS, 'Campaigns are run by the commercial team');
    if (err) return fail(err);
    if (!/^[A-Z0-9-]{3,12}$/.test(c.code)) return fail('Source code must be 3–12 capital letters, digits or dashes');
    if (!c.name.trim() || c.to < c.from || c.cost < 0) return fail('Check the name, dates and cost');
    const s = get();
    if (isNew && s.campaigns.some((x) => x.code === c.code)) return fail('That source code is taken');
    commit({ ...s, campaigns: isNew ? [c, ...s.campaigns] : s.campaigns.map((x) => (x.code === c.code ? c : x)) });
    return done('Campaign saved', `${c.code} · ${c.name}`);
  };
  const saveKycTemplate = (t: KycTemplate): Result => {
    const err = deny(MANAGERS, 'KYC requirements are set by the Commercial Manager');
    if (err) return fail(err);
    if (!t.name.trim()) return fail('Name the KYC item');
    const s = get();
    const rec = { ...t, id: t.id || uid('k') };
    commit({ ...s, kycTemplates: t.id ? s.kycTemplates.map((x) => (x.id === t.id ? rec : x)) : [...s.kycTemplates, rec] });
    return done('KYC item saved', rec.name);
  };

  /* ================= Customer master ================= */
  const CREDIT_FIELDS: (keyof CustomerProfile)[] = ['cancelLimit', 'maxOverdueDays', 'rating', 'financeChargeExempt', 'agingBuckets', 'termId', 'restockFeePct', 'priceGroup', 'repriceAtInvoice'];
  const saveCustomerProfile = (p: CustomerProfile): Result => {
    const err = deny(SELLERS, 'Customer records are maintained by the commercial team');
    if (err) return fail(err);
    const s = get();
    const before = profileOf(s, p.customerId);
    const changedCredit = CREDIT_FIELDS.filter((f) => JSON.stringify(before[f]) !== JSON.stringify(p[f]));
    if (changedCredit.length && !is(...MANAGERS)) return fail(`Only the Commercial Manager changes ${changedCredit.join(', ')}`);
    for (const a of [...p.billTos, ...p.shipTos]) if (!a.label.trim() || !a.town.trim() || !a.country.trim()) return fail('Every address needs a name, a town and a country');
    for (const c of p.contacts) {
      if (!c.name.trim()) return fail('Every contact needs a name');
      if (!c.email && !c.phone) return fail(`${c.name}: give an email or a phone number`);
      if (c.email && !EMAIL_RE.test(c.email)) return fail(`${c.name}: email address is not valid`);
    }
    const codes = p.customerItems.map((c) => c.customerCode.trim().toUpperCase());
    if (new Set(codes).size !== codes.length) return fail('A customer item code is listed twice');
    for (const c of p.customerItems) if (!s.products.some((x) => x.sku === c.sku)) return fail(`Customer code ${c.customerCode} points to an unknown SKU`);
    if (p.agingBuckets.some((b, i) => b <= 0 || (i && b <= p.agingBuckets[i - 1]))) return fail('Ageing buckets must be increasing day counts, e.g. 30, 60, 90');
    if (p.parentCustomerId === p.customerId) return fail('A customer cannot be its own parent');
    if (p.minOrderValue < 0 || p.cancelLimit < 0 || p.restockFeePct < 0 || p.restockFeePct > 50) return fail('Check the order limits and the restocking fee');
    const rec = { ...p, history: [...before.history, log('Customer record updated', changedCredit.length ? `Credit fields: ${changedCredit.join(', ')}` : undefined)] };
    commit({ ...s, profiles: upsertProfile(s, rec) });
    auditChanges(MODULE, actor().name, `Customer ${party(p.customerId)?.name}`, before, rec, ['priceGroup', 'customerClass', 'termId', 'minOrderValue', 'cancelLimit', 'restockFeePct', 'rating', 'maxOverdueDays', 'priority', 'financeChargeExempt', 'freightOnBackorders', 'duplicatePo']);
    return done('Customer saved', party(p.customerId)?.name ?? '');
  };
  const recordKycItem = (customerId: string, itemId: string, value: string, docName: string): Result => {
    const err = deny(SELLERS, 'KYC documents are captured by the commercial team');
    if (err) return fail(err);
    if (!value.trim()) return fail('Enter the document number or details');
    const s = get();
    const prof = profileOf(s, customerId);
    const rec: KycRecord = { itemId, value, docName, status: 'SUBMITTED', by: actor().name, at: now() };
    commit({ ...s, profiles: upsertProfile(s, { ...prof, kyc: [...prof.kyc.filter((x) => x.itemId !== itemId), rec], history: [...prof.history, log('KYC document captured', s.kycTemplates.find((t) => t.id === itemId)?.name)] }) });
    return done('KYC captured', 'Waiting for the manager to verify');
  };
  const verifyKyc = (customerId: string, itemId: string, ok: boolean, note = ''): Result => {
    const err = deny(MANAGERS, 'KYC is verified by the Commercial Manager');
    if (err) return fail(err);
    const s = get();
    const prof = profileOf(s, customerId);
    const rec = prof.kyc.find((x) => x.itemId === itemId);
    if (!rec || rec.status !== 'SUBMITTED') return fail('Nothing submitted to verify');
    if (rec.by === actor().name) return fail('You captured this document, so someone else must verify it');
    if (!ok && !note.trim()) return fail('Say why the document is rejected');
    const t = s.kycTemplates.find((x) => x.id === itemId);
    const upd: KycRecord = { ...rec, status: ok ? 'VERIFIED' : 'REJECTED', verifiedBy: actor().name, note, expiry: ok && t?.expiryMonths ? addDays(TODAY, t.expiryMonths * 30) : undefined };
    commit({ ...s, profiles: upsertProfile(s, { ...prof, kyc: prof.kyc.map((x) => (x.itemId === itemId ? upd : x)), history: [...prof.history, log(ok ? 'KYC verified' : 'KYC rejected', t?.name)] }) });
    return done(ok ? 'Verified' : 'Rejected', t?.name ?? '');
  };

  /* ================= Onboarding ================= */
  const submitApplication = (a: Omit<OnboardingApplication, 'id' | 'number' | 'status' | 'submittedAt' | 'history' | 'kyc'> & { kyc?: KycRecord[] }): Result => {
    const portal = a.channel === 'PORTAL';
    const err = portal ? k.readOnly() : deny(SELLERS, 'Applications are captured by the commercial team');
    if (err) return fail(err);
    if (!a.company.trim() || !a.contact.trim()) return fail('Enter the company and the contact person');
    if (!PIN_RE.test(a.pin.trim().toUpperCase())) return fail('KRA PIN must look like P051234567X');
    if (!EMAIL_RE.test(a.email)) return fail('Enter a valid email address');
    if (!(a.requestedLimit >= 0)) return fail('Enter the credit requested (0 for cash)');
    const s = get();
    if (finance.snapshot().parties.some((p) => p.kind === 'CUSTOMER' && (p.name.toLowerCase() === a.company.trim().toLowerCase() || p.pin === a.pin.trim().toUpperCase())))
      return fail('A customer with this name or KRA PIN already exists');
    if (s.applications.some((x) => x.status !== 'REJECTED' && x.pin === a.pin.trim().toUpperCase())) return fail('There is already an application for this KRA PIN');
    const { number, sequence } = next(s, 'ONB');
    const rec: OnboardingApplication = { ...a, kyc: a.kyc ?? [], pin: a.pin.trim().toUpperCase(), company: a.company.trim(), id: uid('ap'), number, status: 'SUBMITTED', submittedAt: now(), history: [log(portal ? 'Applied online' : 'Application captured')] };
    commit({ ...s, sequence, applications: [rec, ...s.applications] });
    notify({ module: MODULE, to: 'Commercial Manager', subject: `New customer application ${number}`, body: `${rec.company} applied for KES ${rec.requestedLimit.toLocaleString()} credit`, ref: number, channels: ['IN_APP'] });
    notify({ module: MODULE, to: rec.contact, address: rec.email, subject: `We received your application ${number}`, body: 'Upload your KYC documents to complete it.', ref: number, channels: ['EMAIL'] });
    return done('Application received', `${number} — upload the KYC documents next`, rec.id);
  };
  const appKyc = (appId: string, itemId: string, value: string, docName: string, viaPortal = false): Result => {
    const err = viaPortal ? k.readOnly() : deny(SELLERS, 'KYC documents are captured by the commercial team');
    if (err) return fail(err);
    if (!value.trim()) return fail('Enter the document number or details');
    const s = get();
    const a = s.applications.find((x) => x.id === appId);
    if (!a || a.status === 'APPROVED' || a.status === 'REJECTED') return fail('The application is already decided');
    const rec: KycRecord = { itemId, value, docName, status: 'SUBMITTED', by: viaPortal ? 'Customer portal' : actor().name, at: now() };
    commit({ ...s, applications: s.applications.map((x) => (x.id === appId ? { ...x, status: 'UNDER_REVIEW', kyc: [...x.kyc.filter((y) => y.itemId !== itemId), rec], history: [...x.history, log('KYC document added', s.kycTemplates.find((t) => t.id === itemId)?.name)] } : x)) });
    return done('Document added', s.kycTemplates.find((t) => t.id === itemId)?.name ?? '');
  };
  const verifyAppKyc = (appId: string, itemId: string, ok: boolean, note = ''): Result => {
    const err = deny(MANAGERS, 'KYC is verified by the Commercial Manager');
    if (err) return fail(err);
    const s = get();
    const a = s.applications.find((x) => x.id === appId)!;
    const rec = a.kyc.find((x) => x.itemId === itemId);
    if (!rec || rec.status !== 'SUBMITTED') return fail('Nothing submitted to verify');
    if (rec.by === actor().name) return fail('You captured this document, so someone else must verify it');
    if (!ok && !note.trim()) return fail('Say why the document is rejected');
    const t = s.kycTemplates.find((x) => x.id === itemId);
    commit({
      ...s,
      applications: s.applications.map((x) =>
        x.id === appId
          ? { ...x, kyc: x.kyc.map((y) => (y.itemId === itemId ? { ...y, status: ok ? 'VERIFIED' : 'REJECTED', verifiedBy: actor().name, note, expiry: ok && t?.expiryMonths ? addDays(TODAY, t.expiryMonths * 30) : undefined } : y)), history: [...x.history, log(ok ? 'KYC verified' : 'KYC rejected', t?.name)] }
          : x
      )
    });
    return done(ok ? 'Verified' : 'Rejected', t?.name ?? '');
  };
  const appGaps = (s: CommercialState, a: OnboardingApplication) => s.kycTemplates.filter((t) => t.active && t.required && a.kyc.find((x) => x.itemId === t.id)?.status !== 'VERIFIED').map((t) => t.name);
  /** Approve: creates the customer in Finance with the approved limit and carries the verified KYC across. */
  const decideApplication = (appId: string, approve: boolean, limit: number, termId: string, note: string): Result => {
    const err = deny(MANAGERS, 'Applications are decided by the Commercial Manager');
    if (err) return fail(err);
    const s = get();
    const a = s.applications.find((x) => x.id === appId);
    if (!a || a.status === 'APPROVED' || a.status === 'REJECTED') return fail('The application is already decided');
    if (!approve) {
      if (!note.trim()) return fail('Give the reason for declining');
      commit({ ...s, applications: s.applications.map((x) => (x.id === appId ? { ...x, status: 'REJECTED', history: [...x.history, log('Declined', note)] } : x)) });
      notify({ module: MODULE, to: a.contact, address: a.email, subject: `Your application ${a.number}`, body: `We are unable to open a credit account: ${note}`, ref: a.number, channels: ['EMAIL'] });
      return done('Application declined', a.company);
    }
    const gaps = appGaps(s, a);
    if (gaps.length) return fail(`Verify the required KYC first: ${gaps.join(', ')}`);
    if (!(limit >= 0)) return fail('Enter the approved credit limit');
    if (limit > a.requestedLimit * 1.5 && limit > 0) return fail('The approved limit cannot be more than 1.5× what was requested');
    const term = s.paymentTerms.find((t) => t.id === termId);
    const r = finance.saveParty({ id: '', kind: 'CUSTOMER', name: a.company, pin: a.pin, email: a.email, phone: a.phone, terms: term?.days ?? 30, creditLimit: limit, category: a.category || 'New customer' });
    if (!r.ok) return r;
    const created = finance.snapshot().parties.find((p) => p.kind === 'CUSTOMER' && p.name === a.company);
    if (!created) return fail('The customer could not be created');
    const s2 = get();
    const prof: CustomerProfile = { ...blankProfile(created.id), termId, kyc: a.kyc, contacts: [{ id: uid('ct'), name: a.contact, role: 'Primary contact', email: a.email, phone: a.phone, scope: 'main' }], history: [log('Customer created from onboarding', a.number)] };
    commit({
      ...s2,
      profiles: upsertProfile(s2, prof),
      applications: s2.applications.map((x) => (x.id === appId ? { ...x, status: 'APPROVED', approvedLimit: limit, customerId: created.id, history: [...x.history, log(`Approved — credit limit ${kes(limit, { compact: true })}`, note || undefined)] } : x)),
      opportunities: s2.opportunities.map((o) => (a.opportunityId && o.id === a.opportunityId ? { ...o, customerId: created.id, prospect: undefined, history: [...o.history, log(`Converted to customer via ${a.number}`)] } : o))
    });
    audit({ module: MODULE, by: actor().name, action: 'Customer onboarded', ref: a.company, after: `Credit limit ${limit}` });
    notify({ module: MODULE, to: a.contact, address: a.email, subject: `Welcome — account opened (${a.number})`, body: `Your account is open with a credit limit of KES ${limit.toLocaleString()} on ${term?.label ?? '30 days'}.`, ref: a.number, channels: ['EMAIL', 'SMS'] });
    return done('Customer onboarded', `${a.company} · limit ${kes(limit, { compact: true })}`, created.id);
  };

  /* ================= Notes, copies and templates ================= */
  const addNote = (kind: 'quote' | 'order' | 'blend', id: string, text: string, internal: boolean): Result => {
    const err = deny(null, '');
    if (err) return fail(err);
    if (!text.trim()) return fail('Write the note');
    const note = { id: uid('nt'), at: now(), by: actor().name, text: text.trim(), internal };
    const s = get();
    if (kind === 'quote') commit({ ...s, quotations: s.quotations.map((x) => (x.id === id ? { ...x, noteLog: [...(x.noteLog ?? []), note] } : x)) });
    else if (kind === 'order') commit({ ...s, orders: s.orders.map((x) => (x.id === id ? { ...x, noteLog: [...(x.noteLog ?? []), note] } : x)) });
    else commit({ ...s, blends: s.blends.map((x) => (x.id === id ? { ...x, notes: [...x.notes, note] } : x)) });
    return done('Note added', internal ? 'Internal note' : 'Prints on customer documents');
  };
  const copyQuotation = (id: string): Result => {
    const err = deny(SELLERS, 'Quotations are prepared by the commercial team');
    if (err) return fail(err);
    const s = get();
    const q = s.quotations.find((x) => x.id === id);
    if (!q) return fail('Unknown quotation');
    const { number, sequence } = next(s, 'QT');
    const rec: Quotation = {
      ...q,
      id: uid('qt'),
      number,
      date: TODAY,
      validUntil: addDays(TODAY, 30),
      status: 'DRAFT',
      preparedBy: actor().name,
      lines: q.lines.map((l) => ({ ...l, id: uid('ql'), validUntil: undefined })),
      orderId: undefined,
      lostReason: undefined,
      reasonCodeId: undefined,
      opportunityId: undefined,
      copiedFrom: q.number,
      noteLog: [],
      history: [log(`Copied from ${q.number}`)]
    };
    commit({ ...s, sequence, quotations: [rec, ...s.quotations] });
    return done('Quotation copied', `${number} from ${q.number} — update it and send`, rec.id);
  };
  const copyOrder = (id: string, overrides: Partial<SalesOrder> = {}): Result => {
    const err = deny(SELLERS, 'Orders are entered by the commercial team');
    if (err) return fail(err);
    const s = get();
    const o = s.orders.find((x) => x.id === id);
    if (!o) return fail('Unknown order');
    const { number, sequence } = next(s, 'SO');
    const rec: SalesOrder = {
      ...o,
      id: uid('so'),
      number,
      date: TODAY,
      requiredBy: addDays(TODAY, 7),
      customerRef: '',
      lines: o.lines.map((l) => ({ ...l, id: uid('ol'), qty: l.qty, delivered: 0, invoiced: 0, releases: undefined })),
      charges: (o.charges ?? []).filter((c) => !c.postShipment).map((c) => ({ ...c, id: uid('ch'), invoiced: false })),
      invoices: [],
      closed: false,
      hold: undefined,
      status: 'DRAFT',
      preparedBy: actor().name,
      approvals: [],
      quotationId: undefined,
      revision: 0,
      noteLog: [],
      directShipPOs: undefined,
      copiedFrom: o.number,
      history: [log(`Copied from ${o.number}`)],
      ...overrides
    };
    commit({ ...s, sequence, orders: [rec, ...s.orders] });
    return done('Order copied', `${number} from ${o.number} — add the new LPO number and submit`, rec.id);
  };
  const saveTemplate = (name: string, customerId: string, lines: Line[]): Result => {
    const err = deny(SELLERS, 'Templates are kept by the commercial team');
    if (err) return fail(err);
    if (!name.trim()) return fail('Name the template');
    const good = lines.filter((l) => l.description.trim() && l.qty > 0);
    if (!customerId || !good.length) return fail('A template needs a customer and at least one line');
    const s = get();
    commit({ ...s, templates: [{ id: uid('tp'), name: name.trim(), customerId, lines: good.map((l) => ({ ...l })), createdBy: actor().name }, ...s.templates] });
    return done('Template saved', name);
  };
  const deleteTemplate = (id: string): Result => {
    const err = deny(SELLERS, 'Templates are kept by the commercial team');
    if (err) return fail(err);
    commit({ ...get(), templates: get().templates.filter((t) => t.id !== id) });
    return done('Template removed', '');
  };
  /** A new draft from a standing template, priced with today's rules. */
  const orderFromTemplate = (templateId: string): Result => {
    const s = get();
    const t = s.templates.find((x) => x.id === templateId);
    if (!t) return fail('Unknown template');
    const prof = profileOf(s, t.customerId);
    const lines = t.lines.map((l) => pricedLine(s, { ...l, id: uid('ol') }, { customerId: t.customerId, date: TODAY, shipDate: addDays(TODAY, 7) }));
    return k.saveOrder({ customerId: t.customerId, date: TODAY, requiredBy: addDays(TODAY, 7), customerRef: '', deliveryAddress: '', notes: `From template: ${t.name}`, lines, shipToId: prof.shipTos[0]?.id, channel: 'DIRECT', segment: 'B2B', paymentMode: 'ACCOUNT', priority: prof.priority });
  };

  /* ================= Order changes ================= */
  /** Approved order: add lines or change quantities/prices. Re-checks policy; increases go back for approval. */
  const amendOrder = (id: string, lines: Line[], requiredBy: string, reason: string): Result => {
    const err = deny(SELLERS, 'Orders are amended by the commercial team');
    if (err) return fail(err);
    const s = get();
    const o = s.orders.find((x) => x.id === id);
    if (!o || o.status !== 'APPROVED' || o.closed) return fail('Only open approved orders can be amended');
    if (!reason.trim()) return fail('Say why the order is changing (customer request, revised LPO…)');
    const good = lines.filter((l) => l.description.trim() && l.qty > 0);
    for (const ol of o.lines) {
      const n = good.find((l) => l.id === ol.id);
      if (!n && ol.delivered > 0) return fail(`${ol.description} has been delivered and cannot be removed`);
      if (n && n.qty < ol.delivered) return fail(`${ol.description}: ${ol.delivered} already delivered`);
    }
    const nextLines: OrderLine[] = good.map((l) => {
      const ex = o.lines.find((x) => x.id === l.id);
      return { ...(ex ?? { delivered: 0, invoiced: 0 }), ...l, delivered: ex?.delivered ?? 0, invoiced: ex?.invoiced ?? 0 } as OrderLine;
    });
    const p = party(o.customerId);
    const before = orderTotals(o, s.products, p).total;
    const after = orderTotals({ lines: nextLines, charges: o.charges }, s.products, p).total;
    const draft = { ...o, lines: nextLines };
    const exp = creditExposure(s, finance.snapshot(), o.customerId, o.id).total;
    const reasons = [...orderExceptions(draft, s.products, p, exp), ...extraExceptions(s, finance.snapshot(), draft, p)];
    const maxDisc = (ls: Line[]) => Math.max(0, ...ls.map((l) => l.discountPct || 0));
    const reapprove = after > before + 0.005 && reasons.length > 0 ? true : maxDisc(nextLines) > maxDisc(o.lines) && reasons.length > 0;
    const revision = (o.revision ?? 0) + 1;
    patchOrder(id, { lines: nextLines, requiredBy, revision, ...(reapprove ? { status: 'SUBMITTED', approvals: [] } : {}) }, `Amended — revision ${revision}`, `${reason} · ${kes(before, { compact: true })} → ${kes(after, { compact: true })}${reapprove ? ' · back for approval: ' + reasons.join(' · ') : ''}`);
    if (!reapprove) customerMail(o.customerId, `Order ${o.number} revision ${revision}`, `Your order was updated: ${reason}`, o.number);
    return done(reapprove ? 'Sent for re-approval' : 'Order amended', `${o.number} revision ${revision}`, id);
  };
  /** Same-customer drafts combined into the first one. */
  const mergeOrders = (ids: string[]): Result => {
    const err = deny(SELLERS, 'Orders are consolidated by the commercial team');
    if (err) return fail(err);
    const s = get();
    const list = ids.map((i) => s.orders.find((o) => o.id === i)!).filter(Boolean);
    if (list.length < 2) return fail('Pick at least two orders');
    if (list.some((o) => o.status !== 'DRAFT')) return fail('Only drafts can be consolidated');
    if (new Set(list.map((o) => o.customerId)).size > 1) return fail('Orders must be for the same customer');
    const [keep, ...rest] = list;
    const lines = [...keep.lines, ...rest.flatMap((o) => o.lines.map((l) => ({ ...l, id: uid('ol') })))];
    commit({
      ...s,
      orders: s.orders.map((o) =>
        o.id === keep.id
          ? { ...o, lines, charges: [...(o.charges ?? []), ...rest.flatMap((r) => r.charges ?? [])], history: [...o.history, log(`Consolidated ${rest.map((r) => r.number).join(', ')} into this order`)] }
          : rest.some((r) => r.id === o.id)
            ? { ...o, status: 'VOID', history: [...o.history, log(`Consolidated into ${keep.number}`)] }
            : o
      )
    });
    return done('Orders consolidated', `${rest.length + 1} drafts combined into ${keep.number}`, keep.id);
  };
  const holdOrder = (id: string, reasonCodeId: string, note: string): Result => {
    const err = deny(MANAGERS, 'Orders are put on hold by the Commercial Manager or Finance Director');
    if (err) return fail(err);
    const o = get().orders.find((x) => x.id === id);
    if (!o || o.status === 'VOID' || o.closed) return fail('This order is closed');
    if (o.hold) return fail('Already on hold');
    const rc = get().reasonCodes.find((r) => r.id === reasonCodeId && r.kind === 'ORDER_HOLD' && r.active);
    if (!rc) return fail('Choose a hold reason');
    patchOrder(id, { hold: { reasonCodeId, note, by: actor().name, at: now() } }, 'Put on hold', `${rc.label}${note ? ` — ${note}` : ''}`);
    if (rc.label.toLowerCase().includes('credit')) customerMail(o.customerId, `Order ${o.number} on credit hold`, 'Please contact our credit controller to release this order.', o.number, ['EMAIL', 'SMS']);
    return done('Order on hold', `${o.number}: ${rc.label}`);
  };
  const releaseOrder = (id: string, note: string): Result => {
    const err = deny(MANAGERS, 'Holds are released by the Commercial Manager or Finance Director');
    if (err) return fail(err);
    const o = get().orders.find((x) => x.id === id);
    if (!o?.hold) return fail('This order is not on hold');
    patchOrder(id, { hold: undefined }, 'Released from hold', note || undefined);
    return done('Hold released', o.number);
  };
  const setPriority = (id: string, priority: 1 | 2 | 3): Result => {
    const err = deny(SELLERS, 'Priorities are set by the commercial team');
    if (err) return fail(err);
    patchOrder(id, { priority }, `Priority set to ${['', 'high', 'normal', 'low'][priority]}`);
    return { ok: true };
  };
  /** Split an order line into scheduled releases with their own requested ship dates. */
  const setReleases = (orderId: string, lineId: string, rel: { qty: number; requestedDate: string }[]): Result => {
    const err = deny(SELLERS, 'Releases are scheduled by the commercial team');
    if (err) return fail(err);
    const s = get();
    const o = s.orders.find((x) => x.id === orderId);
    const l = o?.lines.find((x) => x.id === lineId);
    if (!o || !l || o.status === 'VOID' || o.closed) return fail('This order is closed');
    const shipped = (l.releases ?? []).filter((r) => r.shippedDate);
    const fresh = rel.filter((r) => r.qty > 0);
    if (fresh.some((r) => !r.requestedDate || r.requestedDate < o.date)) return fail('Every release needs a date on or after the order date');
    const total = shipped.reduce((x, r) => x + r.qty, 0) + fresh.reduce((x, r) => x + r.qty, 0);
    if (Math.abs(total - l.qty) > 0.0001) return fail(`Releases add up to ${total} — they must equal the line quantity of ${l.qty}`);
    let n = (l.releases ?? []).length;
    const releases = [...shipped, ...fresh.map((r) => ({ id: uid('rl'), number: `${o.number}/R${++n}`, qty: r.qty, requestedDate: r.requestedDate }))];
    patchOrder(orderId, { lines: o.lines.map((x) => (x.id === lineId ? { ...x, releases } : x)) }, `Releases scheduled for ${l.description}`, releases.map((r) => `${r.number}: ${r.qty} on ${r.requestedDate}`).join(' · '));
    return done('Releases scheduled', `${fresh.length} releases for ${l.description}`);
  };

  /* ================= Charges and freight ================= */
  const addCharge = (orderId: string, c: Omit<Charge, 'id'>): Result => {
    const err = deny(SELLERS, 'Charges are added by the commercial team');
    if (err) return fail(err);
    const o = get().orders.find((x) => x.id === orderId);
    if (!o || o.status === 'VOID') return fail('Unknown order');
    if (!(c.amount > 0)) return fail('Enter an amount above zero');
    if (!c.description.trim()) return fail('Describe the charge');
    const draft = o.status === 'DRAFT' || o.status === 'REJECTED';
    if (!draft) {
      if (!c.postShipment) return fail('After approval only post-shipment charges (actual freight, extras) can be added');
      if (!get().deliveries.some((d) => d.orderId === orderId)) return fail('Post-shipment charges are entered once goods have been dispatched');
      if (o.closed && o.lines.every((l) => l.invoiced >= l.qty)) return fail('The order is fully invoiced — raise a separate invoice in Finance');
    }
    const ch: Charge = { ...c, id: uid('ch') };
    patchOrder(orderId, { charges: [...(o.charges ?? []), ch], closed: c.postShipment ? false : o.closed }, `${c.postShipment ? 'Post-shipment charge' : 'Charge'} added`, `${c.description} ${kes(c.amount)}`);
    return done('Charge added', `${c.description} ${kes(c.amount)}`);
  };
  const removeCharge = (orderId: string, chargeId: string): Result => {
    const err = deny(SELLERS, 'Charges are managed by the commercial team');
    if (err) return fail(err);
    const o = get().orders.find((x) => x.id === orderId)!;
    const c = (o.charges ?? []).find((x) => x.id === chargeId);
    if (!c || c.invoiced) return fail('Invoiced charges cannot be removed');
    if (o.status !== 'DRAFT' && o.status !== 'REJECTED' && !c.postShipment) return fail('Only draft orders can drop charges');
    patchOrder(orderId, { charges: (o.charges ?? []).filter((x) => x.id !== chargeId) }, 'Charge removed', c.description);
    return { ok: true };
  };
  /** Automatic freight and handling (by zone and weight) and the customer's minimum-order charge on a draft. */
  const autoCharges = (o: SalesOrder, s = get()): Charge[] => {
    const prof = profileOf(s, o.customerId);
    const keep = (o.charges ?? []).filter((c) => !c.auto);
    const out = [...keep];
    const ship = prof.shipTos.find((x) => x.id === o.shipToId);
    const town = ship?.town ?? o.oneTimeShipTo?.split(',').pop()?.trim();
    const f = calcFreight(s, o.lines, ship?.zone ?? zoneOf(s, town));
    if (f.freight > 0 && !keep.some((c) => c.kind === 'FREIGHT')) out.push({ id: uid('ch'), kind: 'FREIGHT', description: `Freight — ${f.zone}, ${f.kg.toLocaleString()} kg`, amount: f.freight, vatable: true, auto: true });
    if (f.handling > 0 && !keep.some((c) => c.kind === 'HANDLING')) out.push({ id: uid('ch'), kind: 'HANDLING', description: 'Handling', amount: f.handling, vatable: true, auto: true });
    const goods = totals(o.lines, s.products, party(o.customerId)).net;
    if (prof.minOrderValue > 0 && goods < prof.minOrderValue && !keep.some((c) => c.kind === 'MIN_ORDER'))
      out.push({ id: uid('ch'), kind: 'MIN_ORDER', description: `Minimum order charge (orders under ${kes(prof.minOrderValue, { compact: true })})`, amount: prof.minOrderCharge || 2_500, vatable: true, auto: true });
    return out;
  };
  const calcCharges = (orderId: string): Result => {
    const err = deny(SELLERS, 'Charges are added by the commercial team');
    if (err) return fail(err);
    const o = get().orders.find((x) => x.id === orderId);
    if (!o || (o.status !== 'DRAFT' && o.status !== 'REJECTED')) return fail('Freight is calculated on drafts');
    const charges = autoCharges(o);
    patchOrder(orderId, { charges }, 'Freight and charges calculated', charges.filter((c) => c.auto).map((c) => `${c.description} ${kes(c.amount)}`).join(' · ') || 'No charges apply');
    return done('Charges calculated', `${charges.filter((c) => c.auto).length} automatic charges`);
  };

  /* ================= Direct ship ================= */
  const createDirectShipPOs = (orderId: string, supplierId: string): Result => {
    const err = deny(SELLERS, 'Direct-ship purchase orders are raised by the commercial team');
    if (err) return fail(err);
    const s = get();
    const o = s.orders.find((x) => x.id === orderId);
    if (!o || o.status !== 'APPROVED') return fail('The sales order must be approved first');
    const lines = o.lines.filter((l) => l.directShip && l.delivered < l.qty);
    if (!lines.length) return fail('Mark the lines the supplier ships straight to the customer');
    if ((o.directShipPOs ?? []).length) return fail('Direct-ship purchase orders already exist for this order');
    const bySupplier = new Map<string, OrderLine[]>();
    for (const l of lines) {
      const sup = s.products.find((p) => p.sku === l.sku)?.preferredSupplier || supplierId;
      if (!sup) return fail(`${l.description}: choose the supplier`);
      bySupplier.set(sup, [...(bySupplier.get(sup) ?? []), l]);
    }
    const prof = profileOf(s, o.customerId);
    const ship = prof.shipTos.find((x) => x.id === o.shipToId);
    const where = o.oneTimeShipTo || (ship ? `${ship.label}, ${ship.address}, ${ship.town}` : o.deliveryAddress || party(o.customerId)?.name || '');
    let seq = s.sequence;
    const pos: PurchaseOrder[] = [];
    for (const [sup, ls] of bySupplier) {
      const n = (seq.PO ?? 0) + 1;
      seq = { ...seq, PO: n };
      pos.push({
        id: uid('po'),
        number: `PO-${TODAY.slice(0, 4)}-${String(n).padStart(4, '0')}`,
        supplierId: sup,
        date: TODAY,
        expected: o.requiredBy,
        lines: ls.map((l) => ({ id: uid('pl'), sku: l.sku, description: l.description, qty: l.qty - l.delivered, price: s.products.find((p) => p.sku === l.sku)?.cost || round2(l.price * 0.7), discountPct: 0, received: 0, billed: 0 })),
        bills: [],
        notes: `DIRECT SHIP for ${o.number} — deliver to ${where}`,
        status: 'DRAFT',
        preparedBy: actor().name,
        approvals: [],
        history: [log(`Created automatically for direct-ship order ${o.number}`)],
        salesOrderId: o.id,
        directShip: true,
        shipTo: where
      });
    }
    commit({ ...s, sequence: seq, purchaseOrders: [...pos, ...s.purchaseOrders], orders: s.orders.map((x) => (x.id === orderId ? { ...x, directShipPOs: pos.map((p) => p.id), history: [...x.history, log(`Direct-ship purchase orders ${pos.map((p) => p.number).join(', ')} raised`)] } : x)) });
    return done('Direct-ship POs raised', `${pos.map((p) => p.number).join(', ')} — approve and send them in Procurement`, pos[0].id);
  };
  /** Supplier confirms delivery to the customer: no stock moves, the sales order is delivered and can be invoiced. */
  const confirmDirectShip = (poId: string, podRef: string): Result => {
    const err = deny(SELLERS.concat('STOREKEEPER'), 'Direct-ship deliveries are confirmed by the commercial team');
    if (err) return fail(err);
    const s = get();
    const po = s.purchaseOrders.find((x) => x.id === poId);
    if (!po?.directShip || !po.salesOrderId) return fail('Not a direct-ship purchase order');
    if (po.status !== 'APPROVED' || !po.sentAt) return fail('Approve and send the purchase order to the supplier first');
    if (po.lines.every((l) => l.received >= l.qty)) return fail('Already delivered');
    if (!podRef.trim()) return fail("Enter the customer's signed delivery note number");
    const o = s.orders.find((x) => x.id === po.salesOrderId)!;
    const { number, sequence } = next(s, 'DN');
    const dl: Delivery['lines'] = [];
    const lines = o.lines.map((l) => {
      const pl = po.lines.find((x) => x.sku === l.sku && l.directShip);
      if (!pl) return l;
      const q = Math.min(pl.qty - pl.received, l.qty - l.delivered);
      if (q <= 0) return l;
      dl.push({ lineId: l.id, qty: q });
      return { ...l, delivered: l.delivered + q };
    });
    const dn: Delivery = { id: uid('dn'), number, orderId: o.id, date: TODAY, lines: dl, vehicle: 'Supplier delivery', driver: party(po.supplierId)?.name ?? 'Supplier', dispatchedBy: actor().name, status: 'DELIVERED', receivedBy: podRef, deliveredAt: now(), directShipPo: po.number };
    commit({
      ...s,
      sequence,
      deliveries: [dn, ...s.deliveries],
      orders: s.orders.map((x) => (x.id === o.id ? { ...x, lines, history: [...x.history, log(`Delivered direct by supplier — ${number}`, `${po.number}, POD ${podRef}`)] } : x)),
      purchaseOrders: s.purchaseOrders.map((x) => (x.id === poId ? { ...x, lines: x.lines.map((l) => ({ ...l, received: l.qty })), history: [...x.history, log('Supplier delivered direct to the customer', `POD ${podRef} — no stock movement`)] } : x))
    });
    return done('Direct delivery recorded', `${number} — ready to invoice`, dn.id);
  };

  /* ================= Invoicing ================= */
  type GroupBy = 'ORDER' | 'PO' | 'CUSTOMER' | 'SHIP_TO';
  /** Raise Finance invoices for delivered-not-invoiced lines, grouped as asked and split by payment terms. */
  const invoiceRun = (orderIds: string[], groupBy: GroupBy, counterSale = false): Result => {
    const err = deny(counterSale ? null : SELLERS, 'Invoices are raised by the commercial team');
    if (err) return fail(err);
    const s = get();
    const orders = orderIds.map((i) => s.orders.find((o) => o.id === i)!).filter((o) => o && o.status === 'APPROVED');
    if (!orders.length) return fail('Nothing to invoice — the order must be approved');
    const termDays = (o: SalesOrder, l?: Line) => {
      const prof = profileOf(s, o.customerId);
      const ship = prof.shipTos.find((x) => x.id === (l?.shipToId || o.shipToId));
      const id = l?.termId || o.termId || ship?.termId || prof.termId;
      const t = s.paymentTerms.find((x) => x.id === id);
      return { id: t?.id ?? 'party', label: t?.label ?? `${party(o.customerId)?.terms ?? 30} days`, days: t ? t.days : party(o.customerId)?.terms ?? 30, disc: t?.discountPct ? `${t.discountPct}% if paid within ${t.discountDays} days` : '' };
    };
    type Item = { o: SalesOrder; l?: OrderLine; c?: Charge; qty: number; price: number; desc: string; account: string; vat: boolean; term: ReturnType<typeof termDays> };
    const items: Item[] = [];
    const repriced: string[] = [];
    for (const o of orders) {
      const p = party(o.customerId);
      const prof = profileOf(s, o.customerId);
      const exportSale = p?.pin === 'NON-RESIDENT';
      for (const l of o.lines.filter((x) => x.delivered > x.invoiced)) {
        const prod = s.products.find((x) => x.sku === l.sku);
        let unit = round2(l.price * (1 - (l.discountPct || 0) / 100));
        if (prof.repriceAtInvoice && l.sku) {
          const r = resolvePrice(s, { customerId: o.customerId, sku: l.sku, qty: l.qty, date: TODAY, shipDate: TODAY, uom: l.uom, orderId: o.id });
          if (Math.abs(r.net - unit) > 0.005) repriced.push(`${o.number} ${l.description}: ${kes(unit)} → ${kes(r.net)}`);
          unit = r.net;
        }
        const code = prof.docFormat.showCustomerCodes ? prof.customerItems.find((c) => c.sku === l.sku)?.customerCode : undefined;
        items.push({ o, l, qty: l.delivered - l.invoiced, price: unit, desc: `${code ? `[${code}] ` : ''}${l.description}${l.discountPct ? ` (less ${l.discountPct}%)` : ''} — ${o.number}`, account: exportSale ? '4010' : (prod?.account ?? '4000'), vat: !exportSale && (prod?.vatable ?? true), term: termDays(o, l) });
      }
      const fullyDeliveredAfter = o.lines.every((l) => l.delivered >= l.qty);
      for (const c of (o.charges ?? []).filter((x) => !x.invoiced)) {
        const freightLike = c.kind === 'FREIGHT' || c.kind === 'SHIPPING';
        if (freightLike && !prof.freightOnBackorders && !fullyDeliveredAfter) continue; // billed with the final delivery
        if (!o.lines.some((l) => l.delivered > l.invoiced) && !c.postShipment) continue;
        items.push({ o, c, qty: 1, price: c.amount, desc: `${c.description} — ${o.number}`, account: '4100', vat: !exportSale && c.vatable, term: termDays(o) });
      }
    }
    if (!items.length) return fail('Nothing delivered is waiting to be invoiced');
    const keyOf = (i: Item) => {
      const g = groupBy === 'ORDER' ? i.o.id : groupBy === 'PO' ? `${i.o.customerId}|${i.o.customerRef}` : groupBy === 'CUSTOMER' ? i.o.customerId : `${i.o.customerId}|${i.l?.shipToId || i.o.shipToId || i.o.oneTimeShipTo || 'main'}`;
      return `${g}|${i.term.id}`;
    };
    const groups = new Map<string, Item[]>();
    for (const i of items) groups.set(keyOf(i), [...(groups.get(keyOf(i)) ?? []), i]);
    const made: { id: string; number: string; orderIds: string[]; itemIds: string[] }[] = [];
    for (const [, g] of groups) {
      const first = g[0];
      const orderNos = [...new Set(g.map((i) => i.o.number))];
      const refs = [...new Set(g.map((i) => i.o.customerRef).filter(Boolean))];
      const r = finance.saveDocument(
        {
          kind: 'INVOICE',
          partyId: first.o.customerId,
          date: TODAY,
          dueDate: addDays(TODAY, first.term.days),
          reference: [...refs, ...orderNos].join(' · ').slice(0, 120),
          department: 'Sales',
          notes: `Raised from ${orderNos.join(', ')} · ${first.term.label}${first.term.disc ? ` (${first.term.disc})` : ''}${groupBy !== 'ORDER' ? ` · grouped by ${groupBy.toLowerCase().replace('_', '-')}` : ''}`,
          lines: g.map((i) => ({ id: uid('l'), description: i.desc, account: i.account, qty: i.qty, price: i.price, vat: i.vat }))
        },
        actor().name
      );
      if (!r.ok || !r.id) return r;
      const inv = finance.snapshot().documents.find((x) => x.id === r.id)!;
      made.push({ id: inv.id, number: inv.number, orderIds: [...new Set(g.map((i) => i.o.id))], itemIds: g.map((i) => i.l?.id ?? i.c!.id) });
    }
    const s2 = get();
    commit({
      ...s2,
      orders: s2.orders.map((o) => {
        const mine = made.filter((m) => m.orderIds.includes(o.id));
        if (!mine.length) return o;
        const ids = new Set(mine.flatMap((m) => m.itemIds));
        const lines = o.lines.map((l) => (ids.has(l.id) ? { ...l, invoiced: l.delivered } : l));
        const charges = (o.charges ?? []).map((c) => (ids.has(c.id) ? { ...c, invoiced: true } : c));
        const complete = lines.every((l) => l.invoiced >= l.qty) && charges.every((c) => c.invoiced);
        return { ...o, lines, charges, invoices: [...o.invoices, ...mine.map((m) => ({ id: m.id, number: m.number }))], closed: complete, history: [...o.history, log(`Invoiced — ${mine.map((m) => m.number).join(', ')} created in Finance`, repriced.length ? `Re-priced at invoicing: ${repriced.join('; ')}` : undefined)] };
      })
    });
    for (const m of made) {
      const o = s.orders.find((x) => x.id === m.orderIds[0])!;
      customerMail(o.customerId, `Invoice ${m.number}`, `Invoice ${m.number} for ${m.orderIds.length} order(s) is attached.`, m.number);
    }
    return done(made.length > 1 ? `${made.length} invoices raised in Finance` : 'Invoice raised in Finance', `${made.map((m) => m.number).join(', ')} — drafts for the accountant to check and submit${repriced.length ? ` · ${repriced.length} lines re-priced` : ''}`, made[0].id);
  };

  /* ================= Point of sale and payments ================= */
  const cashCustomer = (): Party | undefined => {
    let p = finance.snapshot().parties.find((x) => x.kind === 'CUSTOMER' && x.name === CASH_CUSTOMER);
    if (!p) {
      finance.saveParty({ id: '', kind: 'CUSTOMER', name: CASH_CUSTOMER, pin: '', email: '', phone: '', terms: 0, creditLimit: 0, category: 'Cash sales' });
      p = finance.snapshot().parties.find((x) => x.kind === 'CUSTOMER' && x.name === CASH_CUSTOMER);
    }
    return p;
  };
  const gatewayRef = (method: 'M-PESA' | 'CARD' | 'CASH') => (method === 'M-PESA' ? 'S' : method === 'CARD' ? 'AUTH' : 'CSH') + Math.random().toString(36).slice(2, 10).toUpperCase();
  const validPay = (method: 'M-PESA' | 'CARD' | 'CASH', phone: string, card: string) => {
    if (method === 'M-PESA' && !/^2547\d{8}$|^2541\d{8}$/.test(phone.replace(/\s|\+/g, ''))) return 'Enter the M-PESA number as 2547XXXXXXXX';
    if (method === 'CARD' && !/^\d{4}$/.test(card)) return 'Enter the last 4 digits of the card';
    return null;
  };
  /** Simulated payment gateway (M-PESA STK push / card) — books a Finance receipt against the invoices. */
  const takePayment = (orderId: string, method: 'M-PESA' | 'CARD' | 'CASH', phone: string, card: string, amount: number): Result => {
    const s = get();
    const o = s.orders.find((x) => x.id === orderId);
    if (!o) return fail('Unknown order');
    const bad = validPay(method, phone, card);
    if (bad) return fail(bad);
    if (!(amount > 0)) return fail('Enter the amount');
    const fs = finance.snapshot();
    const invs = o.invoices.map((i) => fs.documents.find((d) => d.id === i.id)).filter((d) => d && docBalance(fs, d) > 0.005) as NonNullable<ReturnType<typeof fs.documents.find>>[];
    let left = amount;
    const allocations = invs.map((d) => {
      const a = Math.min(left, docBalance(fs, d));
      left = round2(left - a);
      return { docId: d.id, amount: round2(a) };
    });
    const ref = gatewayRef(method);
    const r = finance.saveSettlement({ kind: 'RECEIPT', partyId: o.customerId, date: TODAY, bankAccount: method === 'CASH' ? '1000' : '1010', method: method === 'CARD' ? 'EFT' : method, reference: `${ref} (${method === 'CARD' ? `card ••${card}` : method === 'M-PESA' ? phone : 'till'})`, amount, allocations, notes: `${method} payment for ${o.number} — simulated payment gateway` });
    if (!r.ok || !r.id) return r;
    const rct = finance.snapshot().settlements.find((x) => x.id === r.id)!;
    const s2 = get();
    commit({ ...s2, payments: [{ id: uid('pt'), orderId, method, phone: phone || undefined, ref, amount, status: 'SUCCESS', at: now(), receiptId: rct.id, receiptNumber: rct.number }, ...s2.payments], orders: s2.orders.map((x) => (x.id === orderId ? { ...x, history: [...x.history, log(`Paid ${kes(amount)} by ${method}`, `${ref} · receipt ${rct.number}`)] } : x)) });
    if (method === 'M-PESA') notify({ module: MODULE, to: o.oneTimeName || party(o.customerId)?.name || 'Customer', address: phone, subject: `Payment received ${ref}`, body: `KES ${amount.toLocaleString()} received for ${o.number}. Thank you.`, ref: o.number, channels: ['SMS'] });
    return { ok: true, id: rct.id };
  };
  const payOrder = (orderId: string, method: 'M-PESA' | 'CARD', phone: string, card: string, viaPortal = false): Result => {
    const err = viaPortal ? k.readOnly() : deny(SELLERS, 'Payments are taken by the commercial team');
    if (err) return fail(err);
    const s = get();
    const o = s.orders.find((x) => x.id === orderId);
    if (!o) return fail('Unknown order');
    if (viaPortal && o.customerId !== s.portalCustomerId) return fail('You can only pay your own orders');
    const value = orderTotals(o, s.products, party(o.customerId)).total;
    const paid = s.payments.filter((p) => p.orderId === orderId && p.status === 'SUCCESS').reduce((x, p) => x + p.amount, 0);
    const due = round2(value - paid);
    if (due <= 0.005) return fail('This order is already paid');
    const r = takePayment(orderId, method, phone, card, due);
    if (!r.ok) return r;
    if (viaPortal) logPortal('PAYMENT', o.number);
    return done('Payment successful (simulated gateway)', `${kes(due)} by ${method} — receipt ${get().payments[0].receiptNumber} saved in Finance`, r.id);
  };
  /** Counter sale: no customer account needed. Stock leaves, the invoice and receipt go to Finance in one step. */
  const cashSale = (sale: { lines: Line[]; buyer: string; phone: string; method: 'M-PESA' | 'CARD' | 'CASH'; card: string; segment: 'B2C' | 'B2B'; tendered: number }): Result => {
    const err = deny(['OFFICER', 'STOREKEEPER', 'MANAGER'], 'Cash sales are rung up by sales or stores staff');
    if (err) return fail(err);
    const s = get();
    const lines = sale.lines.filter((l) => l.description.trim() && l.qty > 0);
    if (!lines.length) return fail('Add at least one item');
    if (lines.some((l) => !l.sku)) return fail('Cash sales are for catalogue items only');
    for (const l of lines) {
      const p = s.products.find((x) => x.sku === l.sku)!;
      if (p.kind === 'GOODS' && l.qty > p.stock) return fail(`${p.name}: only ${p.stock} ${p.unit} in stock`);
    }
    if (priceOverrides(lines, s.products).length) return fail('Counter prices cannot go below the list price by more than the standard discount');
    const bad = validPay(sale.method, sale.phone, sale.card);
    if (bad) return fail(bad);
    const cust = cashCustomer();
    if (!cust) return fail('Cash customer account could not be created');
    const t = totals(lines, s.products, cust);
    if (sale.method === 'CASH' && sale.tendered < t.total) return fail(`Cash tendered ${kes(sale.tendered)} is less than the total ${kes(t.total)}`);
    const s1 = get();
    const { number, sequence } = next(s1, 'SO');
    const dnNo = next({ ...s1, sequence }, 'DN');
    const so: SalesOrder = {
      id: uid('so'),
      number,
      customerId: cust.id,
      date: TODAY,
      requiredBy: TODAY,
      customerRef: `POS ${number.slice(-4)}`,
      deliveryAddress: 'Counter collection',
      lines: lines.map((l) => ({ ...l, id: uid('ol'), delivered: l.qty, invoiced: 0 })),
      invoices: [],
      notes: 'Counter sale',
      status: 'APPROVED',
      preparedBy: actor().name,
      approvals: [],
      channel: 'POS',
      segment: sale.segment,
      paymentMode: 'CASH',
      oneTimeName: sale.buyer.trim() || 'Walk-in customer',
      history: [log('Counter sale', `${sale.method}${sale.buyer ? ` · ${sale.buyer}` : ''}`)]
    };
    const dn: Delivery = { id: uid('dn'), number: dnNo.number, orderId: so.id, date: TODAY, lines: so.lines.map((l) => ({ lineId: l.id, qty: l.qty })), vehicle: 'Customer collection', driver: sale.buyer || 'Walk-in', dispatchedBy: actor().name, status: 'DELIVERED', receivedBy: sale.buyer || 'Walk-in customer', deliveredAt: now() };
    commit({ ...s1, sequence: dnNo.sequence, orders: [so, ...s1.orders], deliveries: [dn, ...s1.deliveries], products: s1.products.map((p) => ({ ...p, stock: p.kind === 'GOODS' ? p.stock - lines.filter((l) => l.sku === p.sku).reduce((x, l) => x + l.qty, 0) : p.stock })) });
    const inv = invoiceRun([so.id], 'ORDER', true);
    if (!inv.ok) return inv;
    const pay = takePayment(so.id, sale.method, sale.phone, sale.card, t.total);
    if (!pay.ok) return pay;
    const change = sale.method === 'CASH' ? round2(sale.tendered - t.total) : 0;
    return done('Sale complete', `${number} · ${kes(t.total)} by ${sale.method}${change ? ` · change ${kes(change)}` : ''} — receipt in Finance`, so.id);
  };

  /* ================= Returns and claims ================= */
  const returnedQty = (s: CommercialState, lineId: string) => s.rmas.filter((r) => r.status !== 'REJECTED').reduce((x, r) => x + r.lines.filter((l) => l.lineId === lineId).reduce((y, l) => y + l.qty, 0), 0);
  const raiseRma = (orderId: string, type: RmaType, lines: RmaLine[], replacementLot = ''): Result => {
    const err = deny(SELLERS, 'Returns are raised by the commercial team');
    if (err) return fail(err);
    const s = get();
    const o = s.orders.find((x) => x.id === orderId);
    if (!o || o.status !== 'APPROVED') return fail('Returns are raised against approved orders');
    const picked = lines.filter((l) => l.qty > 0);
    if (!picked.length) return fail('Enter the quantities coming back');
    for (const l of picked) {
      const ol = o.lines.find((x) => x.id === l.lineId)!;
      const can = ol.delivered - returnedQty(s, ol.id);
      if (l.qty > can) return fail(`${ol.description}: only ${can} delivered and not yet returned`);
      if (!s.reasonCodes.some((r) => r.id === l.reasonCodeId && r.kind === 'RMA' && r.active)) return fail(`${ol.description}: choose a return reason`);
    }
    const prof = profileOf(s, o.customerId);
    const { number, sequence } = next(s, 'RMA');
    const feePct = type === 'STOCK' ? prof.restockFeePct : 0;
    commit({ ...s, sequence, rmas: [{ id: uid('rm'), number, orderId, customerId: o.customerId, type, lines: picked, feePct, status: 'REQUESTED', requestedBy: actor().name, replacementLot: replacementLot || undefined, history: [log('Return requested', `${type.toLowerCase()} · restocking fee ${feePct}%`)] }, ...s.rmas] });
    customerMail(o.customerId, `Return ${number} received`, `We have logged your return against ${o.number}. You will hear from us once it is approved.`, number);
    return done('Return requested', `${number} — waiting for the manager`, number);
  };
  const decideRma = (id: string, approve: boolean, note: string): Result => {
    const err = deny(MANAGERS, 'Returns are approved by the Commercial Manager');
    if (err) return fail(err);
    const s = get();
    const r = s.rmas.find((x) => x.id === id);
    if (!r || r.status !== 'REQUESTED') return fail('Only requested returns can be decided');
    if (r.requestedBy === actor().name) return fail('You raised this return, so someone else must approve it');
    if (!approve && !note.trim()) return fail('Give the reason for refusing');
    const goods = r.type !== 'SERVICE';
    const rcv = goods && approve ? next(s, 'RCV') : null;
    commit({ ...s, sequence: rcv?.sequence ?? s.sequence, rmas: s.rmas.map((x) => (x.id === id ? { ...x, status: approve ? 'APPROVED' : 'REJECTED', receivingNo: rcv?.number, history: [...x.history, log(approve ? 'Approved' : 'Refused', note || (rcv ? `Receiving document ${rcv.number} sent to the warehouse` : undefined))] } : x)) });
    if (rcv) notify({ module: MODULE, to: 'Stores & Dispatch', subject: `Expect a customer return — ${rcv.number}`, body: `${r.number} from ${party(r.customerId)?.name}: ${r.lines.reduce((x, l) => x + l.qty, 0)} units`, ref: rcv.number, channels: ['IN_APP'] });
    customerMail(r.customerId, `Return ${r.number} ${approve ? 'approved' : 'declined'}`, approve ? 'Please send the goods back quoting the RMA number.' : note, r.number);
    return done(approve ? 'Return approved' : 'Return refused', approve && rcv ? `${r.number} — receiving document ${rcv.number} is with Stores` : r.number);
  };
  const receiveRma = (id: string, qty: Record<string, number>): Result => {
    const err = deny(STORES, 'Returned goods are received by Stores — switch to John Kiprop');
    if (err) return fail(err);
    const s = get();
    const r = s.rmas.find((x) => x.id === id);
    if (!r || r.status !== 'APPROVED') return fail('The return must be approved first');
    if (r.type === 'SERVICE') return fail('Service returns have no goods to receive');
    const o = s.orders.find((x) => x.id === r.orderId)!;
    const changes: { sku: string; delta: number }[] = [];
    const lines = r.lines.map((l) => {
      const got = qty[l.lineId] ?? 0;
      const ol = o.lines.find((x) => x.id === l.lineId)!;
      if (got > 0 && l.disposition === 'RESTOCK' && ol.sku && s.products.find((p) => p.sku === ol.sku)?.kind === 'GOODS') changes.push({ sku: ol.sku, delta: got });
      return { ...l, received: got };
    });
    for (const l of lines) if ((l.received ?? 0) > l.qty || (l.received ?? 0) < 0) return fail('Received more than was authorised');
    if (!lines.some((l) => (l.received ?? 0) > 0)) return fail('Enter what arrived');
    if (changes.length) {
      const a = k.adjustStock(changes);
      if (!a.ok) return a;
    }
    const s2 = get();
    commit({ ...s2, rmas: s2.rmas.map((x) => (x.id === id ? { ...x, lines, status: 'RECEIVED', history: [...x.history, log(`Goods received on ${x.receivingNo}`, changes.length ? `${changes.reduce((a, c) => a + c.delta, 0)} units back to stock` : 'Not restocked')] } : x)) });
    return done('Return received', changes.length ? 'Restocked items are back in stock' : 'Recorded — nothing restocked');
  };
  const memo = (s: CommercialState, customerId: string, orderId: string | undefined, source: string, lines: { description: string; qty: number; price: number; vatable: boolean }[], feePct: number) => {
    const p = party(customerId);
    const zero = p?.pin === 'NON-RESIDENT';
    const gross = round2(lines.reduce((x, l) => x + l.qty * l.price, 0));
    const fee = round2((gross * feePct) / 100);
    const net = round2(gross - fee);
    const vatBase = round2(lines.filter((l) => l.vatable).reduce((x, l) => x + l.qty * l.price, 0) * (1 - feePct / 100));
    const vat = zero ? 0 : round2(vatBase * 0.16);
    const { number, sequence } = next(s, 'CN');
    return { rec: { id: uid('cn'), number, customerId, orderId, source, date: TODAY, lines, fee, net, vat, total: round2(net + vat), status: 'OPEN' as const, by: actor().name }, sequence };
  };
  const creditRma = (id: string): Result => {
    const err = deny(MANAGERS, 'Credit notes are issued by the Commercial Manager or Finance Director');
    if (err) return fail(err);
    const s = get();
    const r = s.rmas.find((x) => x.id === id);
    if (!r) return fail('Unknown return');
    const ready = r.status === 'RECEIVED' || (r.type === 'SERVICE' && r.status === 'APPROVED');
    if (!ready) return fail('Receive the goods before crediting');
    const o = s.orders.find((x) => x.id === r.orderId)!;
    if (r.type === 'REPLACEMENT' || r.type === 'WARRANTY') {
      const lines = r.lines
        .filter((l) => (l.received ?? l.qty) > 0)
        .map((l) => {
          const ol = o.lines.find((x) => x.id === l.lineId)!;
          return { id: uid('ol'), sku: ol.sku, description: `${r.type === 'WARRANTY' ? 'Warranty' : 'Replacement'}: ${ol.description}${r.replacementLot ? ` (auction lot ${r.replacementLot})` : ''}`, qty: l.received ?? l.qty, price: 0, discountPct: 0 };
        });
      const res = k.saveOrder({ customerId: r.customerId, date: TODAY, requiredBy: addDays(TODAY, 5), customerRef: r.number, deliveryAddress: o.deliveryAddress, notes: `No-charge ${r.type.toLowerCase()} for ${r.number}`, lines, shipToId: o.shipToId, channel: 'DIRECT', priority: 1 });
      if (!res.ok) return res;
      const s2 = get();
      commit({ ...s2, rmas: s2.rmas.map((x) => (x.id === id ? { ...x, status: 'CLOSED', replacementOrderId: res.id, history: [...x.history, log('No-charge replacement order raised')] } : x)) });
      return done('Replacement order raised', 'A no-charge order is in Sales orders for approval and dispatch', res.id);
    }
    const lines = r.lines.map((l) => {
      const ol = o.lines.find((x) => x.id === l.lineId)!;
      return { description: ol.description, qty: l.received ?? l.qty, price: round2(ol.price * (1 - (ol.discountPct || 0) / 100)), vatable: s.products.find((p) => p.sku === ol.sku)?.vatable ?? true };
    });
    const { rec, sequence } = memo(s, r.customerId, r.orderId, r.number, lines.filter((l) => l.qty > 0), r.feePct);
    commit({ ...s, sequence, credits: [rec, ...s.credits], rmas: s.rmas.map((x) => (x.id === id ? { ...x, status: 'CREDITED', creditId: rec.id, history: [...x.history, log(`Credit note ${rec.number} issued`, `${kes(rec.total)}${rec.fee ? ` after ${kes(rec.fee)} restocking fee` : ''}`)] } : x)) });
    customerMail(r.customerId, `Credit note ${rec.number}`, `We have credited ${kes(rec.total)} for return ${r.number}.`, rec.number);
    audit({ module: MODULE, by: actor().name, action: 'Credit note issued', ref: rec.number, after: String(rec.total) });
    return done('Credit note issued', `${rec.number} for ${kes(rec.total)} reduces the customer's exposure`, rec.id);
  };
  /** Proof of delivery with what the customer actually signed for; shortages or damage raise a claim. */
  const recordReceipt = (deliveryId: string, received: { lineId: string; qty: number; damaged: number }[], rating: number) => {
    const s = get();
    const d = s.deliveries.find((x) => x.id === deliveryId)!;
    const o = s.orders.find((x) => x.id === d.orderId)!;
    const issues = received.filter((r) => r.qty < (d.lines.find((l) => l.lineId === r.lineId)?.qty ?? 0) || r.damaged > 0);
    let next1 = s;
    if (issues.length) {
      const { number, sequence } = next(s, 'CLM');
      next1 = {
        ...s,
        sequence,
        claims: [{ id: uid('cl'), number, deliveryId, orderId: o.id, customerId: o.customerId, lines: issues.map((r) => ({ lineId: r.lineId, short: Math.max(0, (d.lines.find((l) => l.lineId === r.lineId)?.qty ?? 0) - r.qty), damaged: r.damaged })), reasonCodeId: 'r12', status: 'OPEN', history: [log('Raised from proof of delivery')] }, ...s.claims]
      };
      notify({ module: MODULE, to: 'Commercial Manager', subject: `Shipment variance claim ${number}`, body: `${party(o.customerId)?.name} signed for less than was sent on ${d.number}`, ref: number, channels: ['IN_APP'], level: 'warning' });
    }
    commit({ ...next1, deliveries: next1.deliveries.map((x) => (x.id === deliveryId ? { ...x, received, rating: rating || undefined } : x)) });
    return issues.length;
  };
  const decideClaim = (id: string, approve: boolean, note: string): Result => {
    const err = deny(MANAGERS, 'Claims are decided by the Commercial Manager');
    if (err) return fail(err);
    const s = get();
    const c = s.claims.find((x) => x.id === id);
    if (!c || c.status !== 'OPEN') return fail('Already decided');
    if (!approve) {
      if (!note.trim()) return fail('Give the reason');
      commit({ ...s, claims: s.claims.map((x) => (x.id === id ? { ...x, status: 'REJECTED', history: [...x.history, log('Rejected', note)] } : x)) });
      return done('Claim rejected', c.number);
    }
    const o = s.orders.find((x) => x.id === c.orderId)!;
    const lines = c.lines.map((l) => {
      const ol = o.lines.find((x) => x.id === l.lineId)!;
      return { description: `${ol.description} — ${l.short ? `${l.short} short` : ''}${l.short && l.damaged ? ', ' : ''}${l.damaged ? `${l.damaged} damaged` : ''}`, qty: l.short + l.damaged, price: round2(ol.price * (1 - (ol.discountPct || 0) / 100)), vatable: true };
    });
    const { rec, sequence } = memo(s, c.customerId, c.orderId, c.number, lines, 0);
    commit({ ...s, sequence, credits: [rec, ...s.credits], claims: s.claims.map((x) => (x.id === id ? { ...x, status: 'APPROVED', creditId: rec.id, history: [...x.history, log(`Approved — credit note ${rec.number}`, note || undefined)] } : x)) });
    customerMail(c.customerId, `Claim ${c.number} approved`, `Credit note ${rec.number} for ${kes(rec.total)}.`, rec.number);
    return done('Claim approved', `${rec.number} for ${kes(rec.total)}`);
  };
  const applyCredit = (id: string): Result => {
    const err = deny(MANAGERS, 'Credit notes are applied by the Commercial Manager or Finance Director');
    if (err) return fail(err);
    const s = get();
    const c = s.credits.find((x) => x.id === id);
    if (!c || c.status !== 'OPEN') return fail('Already applied');
    commit({ ...s, credits: s.credits.map((x) => (x.id === id ? { ...x, status: 'APPLIED' } : x)) });
    return done('Credit applied', `${c.number} set against the customer's account`);
  };

  /* ================= Auctions ================= */
  const portalOnly = (customerId: string) => (get().portalCustomerId !== customerId ? 'You can only act for the customer you are signed in as' : null);
  const logPortal = (kind: PortalEvent['kind'], ref?: string) => {
    const s = get();
    commit({ ...s, portalEvents: [{ id: uid('pe'), at: now(), customerId: s.portalCustomerId, kind, ref, channel: 'WEB' }, ...s.portalEvents] });
  };
  const importCatalogue = (rows: Record<string, string>[], meta: { saleNo: string; date: string; broker: string; fxRate: number }) => {
    const ro = deny(SELLERS, 'Catalogues are loaded by the commercial team');
    if (ro) return { imported: 0, errors: [ro] };
    const errors: string[] = [];
    if (!meta.saleNo.trim()) return { imported: 0, errors: ['Enter the sale number'] };
    if (!(meta.fxRate > 50)) return { imported: 0, errors: ['Enter the USD/KES exchange rate'] };
    const s = get();
    if (s.auctions.some((a) => a.saleNo === meta.saleNo.trim())) return { imported: 0, errors: [`${meta.saleNo} is already loaded`] };
    const lots: AuctionLot[] = [];
    rows.forEach((r, i) => {
      const n = i + 2;
      const lotNo = (r.lot ?? r.lotNo ?? '').trim();
      const pk = Number(r.packages);
      const kg = Number(r.netKg ?? r.net_kg);
      const val = Number(r.valuation);
      if (!lotNo || !r.garden || !r.grade) return errors.push(`Row ${n}: lot, garden and grade are required`);
      if (lots.some((l) => l.lotNo === lotNo)) return errors.push(`Row ${n}: lot ${lotNo} appears twice`);
      if (!(pk > 0) || !(kg > 0) || !(val > 0)) return errors.push(`Row ${n}: packages, net kg and valuation must be numbers above zero`);
      lots.push({ lotNo, invoiceNo: r.invoice || `${r.garden.slice(0, 3).toUpperCase()}/${lotNo}`, garden: r.garden.trim(), grade: r.grade.trim().toUpperCase(), packages: pk, netKg: kg, valuation: val, reserve: Number(r.reserve) || round2(val * 0.92), bids: [], status: 'OPEN' });
    });
    if (lots.length) {
      const sale: AuctionSale = { id: uid('au'), saleNo: meta.saleNo.trim(), date: meta.date, centre: 'Mombasa Tea Auction (EATTA)', broker: meta.broker || 'Africa Tea Brokers Ltd', fxRate: meta.fxRate, status: 'CATALOGUED', source: 'EATTA_IMPORT', lots };
      commit({ ...s, auctions: [sale, ...s.auctions] });
    }
    return { imported: lots.length, errors };
  };
  const openSale = (id: string): Result => {
    const err = deny(MANAGERS, 'Sales are opened for bidding by the Commercial Manager');
    if (err) return fail(err);
    const s = get();
    const a = s.auctions.find((x) => x.id === id);
    if (!a || a.status !== 'CATALOGUED') return fail('Only catalogued sales can be opened');
    commit({ ...s, auctions: s.auctions.map((x) => (x.id === id ? { ...x, status: 'OPEN' } : x)) });
    return done('Bidding open', a.saleNo);
  };
  /** Bid on behalf of a customer (or by the customer on the portal) — checked against their live credit headroom. */
  const placeBid = (saleId: string, lotNo: string, customerId: string, price: number, viaPortal = false): Result => {
    const err = viaPortal ? k.readOnly() ?? portalOnly(customerId) : deny(SELLERS, 'Bids are placed by the commercial team');
    if (err) return fail(err);
    const s = get();
    const a = s.auctions.find((x) => x.id === saleId);
    const l = a?.lots.find((x) => x.lotNo === lotNo);
    if (!a || !l) return fail('Unknown lot');
    if (a.status !== 'OPEN' || l.status !== 'OPEN') return fail('Bidding is closed for this lot');
    if (!customerId) return fail('Choose the buyer');
    const top = highestBid(l);
    const min = round2((top?.price ?? Math.max(l.reserve * 0.8, 0)) + (top ? 0.01 : 0));
    if (!(price >= min)) return fail(`Bid at least USD ${min.toFixed(2)}/kg${top ? ' — the current highest bid is ' + top.price.toFixed(2) : ''}`);
    if (price > l.valuation * 2) return fail('That bid is more than twice the valuation — check the price');
    const gaps = kycGaps(s, customerId);
    if (gaps.length) return fail(`KYC is incomplete for this buyer: ${gaps.join(', ')}`);
    const value = round2(price * l.netKg * a.fxRate * 1.16);
    const exp = creditExposure(s, finance.snapshot(), customerId);
    const held = s.auctions.flatMap((x) => (x.status === 'OPEN' ? x.lots : [])).filter((x) => x.lotNo !== lotNo && x.status === 'OPEN' && highestBid(x)?.customerId === customerId).reduce((y, x) => y + highestBid(x)!.price * x.netKg * a.fxRate * 1.16, 0);
    if (exp.limit && value + held > exp.headroom) return fail(`Bid of ${kes(value, { compact: true })} exceeds the credit headroom of ${kes(Math.max(0, exp.headroom - held), { compact: true })} (other winning bids counted)`);
    const by = viaPortal ? `${party(customerId)?.name} (portal)` : actor().name;
    commit({ ...s, auctions: s.auctions.map((x) => (x.id === saleId ? { ...x, lots: x.lots.map((y) => (y.lotNo === lotNo ? { ...y, bids: [...y.bids, { customerId, price, at: now(), by }] } : y)) } : x)) });
    if (viaPortal) logPortal('BID', `${a.saleNo} lot ${lotNo}`);
    if (top && top.customerId !== customerId) customerMail(top.customerId, `Outbid on lot ${lotNo}`, `A higher bid of USD ${price.toFixed(2)}/kg was placed on ${a.saleNo} lot ${lotNo}.`, lotNo, ['SMS']);
    return done('Bid placed', `Lot ${lotNo} · USD ${price.toFixed(2)}/kg · ${kes(value, { compact: true })} incl. VAT`);
  };
  /** Knock a lot down: highest bid at or above reserve wins and becomes a sales order at the hammer price. */
  const closeLot = (saleId: string, lotNo: string): Result => {
    const err = deny(MANAGERS, 'Lots are knocked down by the Commercial Manager');
    if (err) return fail(err);
    const s = get();
    const a = s.auctions.find((x) => x.id === saleId)!;
    const l = a.lots.find((x) => x.lotNo === lotNo)!;
    if (a.status !== 'OPEN' || l.status !== 'OPEN') return fail('This lot is not open');
    const top = highestBid(l);
    if (!top || top.price < l.reserve) {
      commit({ ...s, auctions: s.auctions.map((x) => (x.id === saleId ? { ...x, lots: x.lots.map((y) => (y.lotNo === lotNo ? { ...y, status: 'UNSOLD' } : y)) } : x)) });
      return done('Lot unsold', top ? `Best bid ${top.price.toFixed(2)} is under the reserve of ${l.reserve.toFixed(2)}` : 'No bids');
    }
    const kesPerKg = round2(top.price * a.fxRate);
    const r = k.saveOrder({
      customerId: top.customerId,
      date: TODAY,
      requiredBy: addDays(TODAY, 10),
      customerRef: `${a.saleNo} lot ${lotNo}`,
      deliveryAddress: 'Ex-warehouse Mombasa (prompt date)',
      notes: `Auction purchase — ${l.garden} ${l.grade}, ${l.packages} packages, invoice ${l.invoiceNo}. Hammer USD ${top.price.toFixed(2)}/kg at ${a.fxRate}`,
      lines: [{ id: uid('ol'), sku: '', description: `Auction lot ${lotNo} — ${l.garden} ${l.grade} (${l.packages} pkgs)`, qty: l.netKg, price: kesPerKg, discountPct: 0, uom: 'kg', ruleLabel: 'Auction hammer price' }],
      channel: 'AUCTION',
      orderClass: 'Auction',
      segment: 'B2B',
      paymentMode: 'ACCOUNT',
      incoterm: 'EXW',
      namedPlace: 'Mombasa'
    });
    if (!r.ok || !r.id) return r;
    const sub = k.submitOrder(r.id);
    const s2 = get();
    commit({ ...s2, auctions: s2.auctions.map((x) => (x.id === saleId ? { ...x, lots: x.lots.map((y) => (y.lotNo === lotNo ? { ...y, status: 'SOLD', hammerPrice: top.price, buyerId: top.customerId, orderId: r.id } : y)) } : x)) });
    customerMail(top.customerId, `You bought lot ${lotNo}`, `${a.saleNo}: ${l.garden} ${l.grade}, ${l.netKg} kg at USD ${top.price.toFixed(2)}/kg.`, lotNo, ['EMAIL', 'SMS']);
    return done('Lot sold', `${party(top.customerId)?.name} at USD ${top.price.toFixed(2)}/kg — sales order ${sub.ok ? 'created' : 'drafted'}`, r.id);
  };
  /** Close the sale and publish its average prices as the external reference price list (auction-based pricing). */
  const closeSale = (saleId: string): Result => {
    const err = deny(MANAGERS, 'Sales are closed by the Commercial Manager');
    if (err) return fail(err);
    const s = get();
    const a = s.auctions.find((x) => x.id === saleId);
    if (!a || a.status !== 'OPEN') return fail('Only open sales can be closed');
    if (a.lots.some((l) => l.status === 'OPEN')) return fail('Knock down or withdraw every lot first');
    const sold = a.lots.filter((l) => l.status === 'SOLD' && l.hammerPrice);
    const lines = [...new Set(sold.map((l) => l.grade))]
      .map((g) => {
        const sku = s.products.find((p) => p.category === 'Bulk tea' && p.attributes?.grade === g)?.sku;
        const ls = sold.filter((l) => l.grade === g);
        const avg = ls.reduce((x, l) => x + (l.hammerPrice ?? 0) * l.netKg, 0) / Math.max(1, ls.reduce((x, l) => x + l.netKg, 0));
        return sku ? { sku, price: round2(avg * a.fxRate * 1.08) } : null;
      })
      .filter(Boolean) as { sku: string; price: number }[];
    const pl: PriceList | null = lines.length ? { id: uid('pl'), name: `Mombasa auction reference — ${a.saleNo} averages (+8% landed)`, scope: 'EXTERNAL', validFrom: TODAY, validTo: addDays(TODAY, 21), basis: 'ORDER_DATE', lines, status: 'ACTIVE', createdBy: actor().name, approvedBy: actor().name, history: [log('Published from auction results')] } : null;
    commit({ ...s, auctions: s.auctions.map((x) => (x.id === saleId ? { ...x, status: 'CLOSED' } : x)), priceLists: pl ? [pl, ...s.priceLists.map((x) => (x.scope === 'EXTERNAL' && x.status === 'ACTIVE' ? { ...x, status: 'RETIRED' as const, history: [...x.history, log(`Replaced by ${a.saleNo} averages`)] } : x))] : s.priceLists });
    return done('Sale closed', pl ? `${lines.length} reference prices published from ${a.saleNo}` : `${a.saleNo} closed — nothing sold`);
  };
  const withdrawLot = (saleId: string, lotNo: string): Result => {
    const err = deny(MANAGERS, 'Lots are withdrawn by the Commercial Manager');
    if (err) return fail(err);
    const s = get();
    commit({ ...s, auctions: s.auctions.map((x) => (x.id === saleId ? { ...x, lots: x.lots.map((y) => (y.lotNo === lotNo && y.status === 'OPEN' ? { ...y, status: 'WITHDRAWN' } : y)) } : x)) });
    return done('Lot withdrawn', lotNo);
  };

  /* ================= Tasting and samples ================= */
  const recordTasting = (t: Omit<TastingRecord, 'id'>): Result => {
    const err = deny(SELLERS, 'Tasting results are recorded by the commercial team');
    if (err) return fail(err);
    if (!t.ref.trim() || !t.taster.trim()) return fail('Enter the lot or SKU and the taster');
    if (Object.values(t.scores).some((v) => !(v >= 0 && v <= 10))) return fail('Scores are from 0 to 10');
    if (!(t.valuation > 0)) return fail("Enter the taster's valuation (USD/kg)");
    const s = get();
    const score = round2(Object.values(t.scores).reduce((x, v) => x + v, 0) / 5);
    commit({
      ...s,
      tastings: [{ ...t, id: uid('ts') }, ...s.tastings],
      auctions: s.auctions.map((a) => ({ ...a, lots: a.lots.map((l) => (l.lotNo === t.ref ? { ...l, tastingScore: score, valuation: a.status === 'CLOSED' ? l.valuation : t.valuation } : l)) }))
    });
    return done('Tasting recorded', `${t.ref}: ${score}/10 · USD ${t.valuation.toFixed(2)}/kg`);
  };
  const dispatchSamples = (d: Omit<SampleDispatch, 'id' | 'number' | 'status' | 'by' | 'date'>): Result => {
    const err = deny(STORES, 'Samples leave the warehouse through Stores — switch to John Kiprop');
    if (err) return fail(err);
    if (!d.recipient.trim() || !d.courier.trim()) return fail('Enter the recipient and the courier');
    const lines = d.lines.filter((l) => l.sku && l.qty > 0);
    if (!lines.length) return fail('Add the samples going out');
    const a = k.adjustStock(lines.map((l) => ({ sku: l.sku, delta: -l.qty })));
    if (!a.ok) return a;
    const s = get();
    const { number, sequence } = next(s, 'SMP');
    commit({ ...s, sequence, samples: [{ ...d, lines, id: uid('sm'), number, status: 'DISPATCHED', by: actor().name, date: TODAY }, ...s.samples] });
    notify({ module: MODULE, to: d.recipient, subject: `Tea samples on the way — ${number}`, body: `${lines.length} samples by ${d.courier}${d.reprint ? ' (reprint)' : ''}`, ref: number, channels: ['EMAIL'] });
    return done('Samples dispatched', `${number} — stock reduced, delivery note ready to print`, number);
  };
  const sampleReceived = (id: string): Result => {
    const err = deny(null, '');
    if (err) return fail(err);
    commit({ ...get(), samples: get().samples.map((x) => (x.id === id ? { ...x, status: 'RECEIVED' } : x)) });
    return done('Receipt confirmed', '');
  };

  /* ================= Blend configurator ================= */
  const saveBlend = (b: Omit<BlendConfig, 'id' | 'number' | 'unitCost' | 'unitPrice' | 'createdBy' | 'at' | 'notes'> & { id?: string }): Result => {
    const err = deny(SELLERS, 'Blends are configured by the commercial team');
    if (err) return fail(err);
    if (!b.name.trim()) return fail('Name the blend');
    const errs = blendRuleErrors(b.attributes, b.components);
    if (errs.length) return fail(errs[0]);
    if (!(b.marginPct >= 5 && b.marginPct < 80)) return fail('Target margin must be between 5% and 80%');
    const s = get();
    const unitCost = blendCost(b.components, b.kgPerUnit, b.packaging, s.products, b.batchSize, b.hoursPerBatch);
    const unitPrice = priceForMargin(unitCost, b.marginPct);
    if (b.id) {
      commit({ ...s, blends: s.blends.map((x) => (x.id === b.id ? { ...x, ...b, unitCost, unitPrice } : x)) });
      return done('Blend saved', `${b.name} · ${kes(unitPrice)} per unit`, b.id);
    }
    const { number, sequence } = next(s, 'CFG');
    const rec: BlendConfig = { ...b, id: uid('bl'), number, unitCost, unitPrice, notes: [], createdBy: actor().name, at: now() };
    commit({ ...s, sequence, blends: [rec, ...s.blends] });
    return done('Blend configured', `${number} · ${kes(unitPrice)} per unit`, rec.id);
  };
  /** Adds a configured blend as a line on a draft quotation or order. */
  const addBlendToDoc = (blendId: string, kind: 'quote' | 'order', docId: string, qty: number): Result => {
    const err = deny(SELLERS, 'Quotes and orders are prepared by the commercial team');
    if (err) return fail(err);
    const s = get();
    const b = s.blends.find((x) => x.id === blendId);
    if (!b) return fail('Unknown blend');
    if (!(qty > 0)) return fail('Enter the quantity');
    const line: Line = { id: uid('ol'), sku: '', description: `${b.number} ${b.name} (${b.attributes.packSize}, ${b.attributes.flavour})`, qty, price: b.unitPrice, discountPct: 0, configId: b.id, ruleLabel: `Configured at ${b.marginPct}% margin`, requestedDate: addDays(TODAY, blendLeadDaysFor(b, qty)) };
    if (kind === 'quote') {
      const q = s.quotations.find((x) => x.id === docId);
      if (!q || (q.status !== 'DRAFT' && q.status !== 'SENT')) return fail('Choose a draft or sent quotation');
      commit({ ...s, quotations: s.quotations.map((x) => (x.id === docId ? { ...x, lines: [...x.lines, line], history: [...x.history, log(`Configured blend ${b.number} added`)] } : x)) });
      return done('Added to quotation', q.number, docId);
    }
    const o = s.orders.find((x) => x.id === docId);
    if (!o || (o.status !== 'DRAFT' && o.status !== 'REJECTED')) return fail('Choose a draft order');
    commit({ ...s, orders: s.orders.map((x) => (x.id === docId ? { ...x, lines: [...x.lines, { ...line, delivered: 0, invoiced: 0 }], history: [...x.history, log(`Configured blend ${b.number} added`)] } : x)) });
    return done('Added to order', o.number, docId);
  };
  const blendLeadDaysFor = (b: BlendConfig, qty: number) => Math.ceil((Math.ceil(qty / b.batchSize) * b.hoursPerBatch) / 8) + 1;

  /* ================= Contracts ================= */
  const generateContract = (c: { customerId: string; templateId: string; title: string; start: string; end: string; value: number; priceListId?: string }): Result => {
    const err = deny(SELLERS, 'Contracts are drafted by the commercial team');
    if (err) return fail(err);
    const s = get();
    const t = s.contractTemplates.find((x) => x.id === c.templateId);
    const p = party(c.customerId);
    if (!t || !p) return fail('Choose the customer and the template');
    if (!c.title.trim()) return fail('Give the contract a title');
    if (!c.start || !c.end || c.end <= c.start) return fail('The end date must be after the start date');
    if (!(c.value > 0)) return fail('Enter the estimated contract value');
    if (kycGaps(s, c.customerId).length) return fail(`Complete KYC first: ${kycGaps(s, c.customerId).join(', ')}`);
    const pl = s.priceLists.find((x) => x.id === c.priceListId);
    const clauses = t.clauses.map((x) =>
      x
        .replace('{{customer}}', p.name)
        .replace('{{pin}}', p.pin || '—')
        .replace('{{start}}', c.start)
        .replace('{{end}}', c.end)
        .replace('{{priceList}}', pl?.name ?? 'the current list prices')
        .replace('{{creditLimit}}', kes(p.creditLimit ?? 0))
        .replace('{{terms}}', String(p.terms))
    );
    const { number, sequence } = next(s, 'CTR');
    const rec: Contract = {
      id: uid('cn'),
      number,
      customerId: c.customerId,
      templateId: t.id,
      title: c.title.trim(),
      clauses,
      start: c.start,
      end: c.end,
      value: c.value,
      priceListId: pl?.id,
      status: 'DRAFT',
      steps: t.steps.map((x, i) => ({ name: x.name, owner: x.owner, external: x.external, due: addDays(TODAY, x.days), done: i === 0, doneAt: i === 0 ? now() : undefined, by: i === 0 ? actor().name : undefined })),
      signatures: [],
      preparedBy: actor().name,
      history: [log(`Generated from template "${t.name}"`)]
    };
    commit({ ...s, sequence, contracts: [rec, ...s.contracts] });
    return done('Contract generated', `${number} — send it for legal review`, rec.id);
  };
  const updateContract = (id: string, patch: Partial<Contract>, action: string, note?: string) => commit({ ...get(), contracts: get().contracts.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log(action, note)] } : x)) });
  const completeStep = (id: string, idx: number, docName: string): Result => {
    const err = deny(SELLERS, 'Contract steps are tracked by the commercial team');
    if (err) return fail(err);
    const c = get().contracts.find((x) => x.id === id);
    if (!c) return fail('Unknown contract');
    const st = c.steps[idx];
    if (!st || st.done) return fail('Already done');
    if (c.steps.slice(0, idx).some((x) => !x.done)) return fail('Complete the earlier steps first');
    if (st.owner === 'Commercial Manager' && !is(...MANAGERS)) return fail('This step is done by the Commercial Manager');
    if (st.external && !docName.trim()) return fail('External steps need the document received from the other party (name or reference)');
    updateContract(id, { steps: c.steps.map((x, i) => (i === idx ? { ...x, done: true, doneAt: now(), by: actor().name, docName: docName || undefined } : x)) }, `Step done: ${st.name}`, docName || undefined);
    return done('Step completed', st.name);
  };
  const submitContract = (id: string): Result => {
    const err = deny(SELLERS, 'Contracts are submitted by the commercial team');
    if (err) return fail(err);
    const c = get().contracts.find((x) => x.id === id);
    if (!c || c.status !== 'DRAFT') return fail('Only drafts go to review');
    updateContract(id, { status: 'REVIEW' }, 'Sent for legal review');
    notify({ module: MODULE, to: 'Commercial Manager', subject: `Contract ${c.number} for review`, ref: c.number, channels: ['IN_APP'] });
    return done('Sent for review', c.number);
  };
  const approveContract = (id: string): Result => {
    const err = deny(MANAGERS, 'Contracts are approved by the Commercial Manager');
    if (err) return fail(err);
    const c = get().contracts.find((x) => x.id === id);
    if (!c || c.status !== 'REVIEW') return fail('Only contracts in review can be approved');
    if (c.preparedBy === actor().name) return fail('You drafted this contract, so someone else must approve it');
    const steps = c.steps.map((x) => (x.name === 'Legal review' && !x.done ? { ...x, done: true, doneAt: now(), by: actor().name } : x));
    updateContract(id, { status: 'SENT', approvedBy: actor().name, steps }, 'Approved and sent to the customer for signature');
    customerMail(c.customerId, `Contract ${c.number} for signature`, `Please review and sign "${c.title}" electronically using the link provided.`, c.number);
    return done('Contract sent', `${c.number} is with the customer for signature`);
  };
  const signContract = (id: string, sig: ESignature, side: 'COMPANY' | 'CUSTOMER'): Result => {
    const err = side === 'COMPANY' ? deny(MANAGERS, 'The company signs through the Commercial Manager or Finance Director') : deny(SELLERS, 'Customer signatures are recorded by the commercial team');
    if (err) return fail(err);
    const c = get().contracts.find((x) => x.id === id);
    if (!c || (c.status !== 'SENT' && c.status !== 'SIGNED')) return fail('The contract must be approved and sent first');
    if (c.signatures.some((x) => x.party === side)) return fail('Already signed for this party');
    const signatures = [...c.signatures, { ...sig, party: side }];
    const both = signatures.some((x) => x.party === 'COMPANY') && signatures.some((x) => x.party === 'CUSTOMER');
    const status = both ? (c.start <= TODAY ? 'ACTIVE' : 'SIGNED') : c.status;
    const steps = both ? c.steps.map((x) => (x.name.startsWith('Signed') ? { ...x, done: true, doneAt: now(), by: actor().name } : x)) : c.steps;
    updateContract(id, { signatures, status, steps }, `Signed for ${side === 'COMPANY' ? 'the company' : 'the customer'}`, `${sig.text} · ${sig.at}`);
    if (both) audit({ module: MODULE, by: actor().name, action: 'Contract fully signed', ref: c.number });
    return done('Signature recorded', both ? `${c.number} is ${status === 'ACTIVE' ? 'active' : 'signed — starts ' + c.start}` : 'Waiting for the other party');
  };
  const terminateContract = (id: string, reason: string): Result => {
    const err = deny(MANAGERS, 'Contracts are terminated by the Commercial Manager');
    if (err) return fail(err);
    if (!reason.trim()) return fail('Give the reason');
    updateContract(id, { status: 'TERMINATED' }, 'Terminated', reason);
    return done('Contract terminated', reason);
  };
  /** Daily expiry check: contracts ending within 30 days alert the owner and the customer once. */
  const checkContractExpiries = () => {
    const s = get();
    const due = s.contracts.filter((c) => c.status === 'ACTIVE' && !c.expiryAlerted && c.end <= addDays(TODAY, 30));
    if (!due.length) return 0;
    for (const c of due) {
      notify({ module: MODULE, to: c.preparedBy, subject: `Contract ${c.number} expires ${c.end}`, body: `${c.title} with ${party(c.customerId)?.name} ends on ${c.end}. Start the renewal.`, ref: c.number, level: 'warning', channels: ['IN_APP', 'EMAIL'] });
      customerMail(c.customerId, `Your contract ${c.number} expires on ${c.end}`, 'Our team will contact you about renewal.', c.number);
    }
    commit({ ...s, contracts: s.contracts.map((c) => (due.some((x) => x.id === c.id) ? { ...c, expiryAlerted: true, history: [...c.history, { at: now(), by: 'System', action: 'Expiry alert sent' }] } : c)) });
    return due.length;
  };

  /* ================= Feedback and customer experience ================= */
  const logFeedback = (f: Pick<Feedback, 'customerId' | 'type' | 'channel' | 'category' | 'severity' | 'subject'> & { orderId?: string }, viaPortal = false): Result => {
    const err = viaPortal ? k.readOnly() ?? portalOnly(f.customerId) : deny(SELLERS.concat('STOREKEEPER'), 'Feedback is logged by staff');
    if (err) return fail(err);
    if (!f.customerId || !f.subject.trim() || !f.category.trim()) return fail('Choose the customer and describe the feedback');
    const s = get();
    const { number, sequence } = next(s, 'FB');
    const rec: Feedback = { ...f, id: uid('fb'), number, owner: viaPortal ? 'Peter Mwangi' : actor().name, status: f.type === 'COMPLIMENT' ? 'RESOLVED' : 'OPEN', at: now(), slaDue: addDays(TODAY, SLA_DAYS[f.severity]), history: [log(viaPortal ? 'Submitted on the customer portal' : 'Logged')] };
    commit({ ...s, sequence, feedback: [rec, ...s.feedback] });
    if (viaPortal) logPortal('FEEDBACK', number);
    if (f.type === 'COMPLAINT') notify({ module: MODULE, to: rec.owner, subject: `Complaint ${number} — ${f.severity.toLowerCase()} priority`, body: f.subject, ref: number, level: f.severity === 'HIGH' ? 'critical' : 'warning', channels: ['IN_APP', 'EMAIL'] });
    customerMail(f.customerId, `We received your ${f.type.toLowerCase()} (${number})`, f.type === 'COMPLAINT' ? `We will respond by ${rec.slaDue}.` : 'Thank you for telling us.', number);
    return done('Feedback logged', `${number}${f.type === 'COMPLAINT' ? ` — due by ${rec.slaDue}` : ''}`, rec.id);
  };
  const updateFeedback = (id: string, patch: Partial<Feedback>, action: string, note?: string) => commit({ ...get(), feedback: get().feedback.map((x) => (x.id === id ? { ...x, ...patch, history: [...x.history, log(action, note)] } : x)) });
  const assignFeedback = (id: string, owner: string): Result => {
    const err = deny(MANAGERS, 'Feedback is assigned by the Commercial Manager');
    if (err) return fail(err);
    if (!owner.trim()) return fail('Choose the owner');
    updateFeedback(id, { owner }, `Assigned to ${owner}`);
    return done('Assigned', owner);
  };
  const progressFeedback = (id: string, status: 'IN_PROGRESS' | 'RESOLVED', text: string): Result => {
    const err = deny(null, '');
    if (err) return fail(err);
    const f = get().feedback.find((x) => x.id === id);
    if (!f || f.status === 'CLOSED') return fail('This item is closed');
    if (f.owner !== actor().name && !is(...MANAGERS)) return fail(`Only the owner (${f.owner}) or the manager can update this`);
    if (status === 'RESOLVED' && !text.trim()) return fail('Describe the resolution');
    updateFeedback(id, { status, ...(status === 'RESOLVED' ? { resolution: text, resolvedAt: now() } : {}) }, status === 'RESOLVED' ? 'Resolved' : 'Work started', text || undefined);
    if (status === 'RESOLVED') customerMail(f.customerId, `${f.number} resolved`, text, f.number);
    return done(status === 'RESOLVED' ? 'Resolved' : 'In progress', f.number);
  };
  const closeFeedback = (id: string, rating: number): Result => {
    const err = deny(null, '');
    if (err) return fail(err);
    const f = get().feedback.find((x) => x.id === id);
    if (!f || f.status !== 'RESOLVED') return fail('Resolve it first');
    if (!(rating >= 1 && rating <= 5)) return fail("Record the customer's satisfaction (1–5)");
    updateFeedback(id, { status: 'CLOSED', rating }, 'Closed', `Customer rated ${rating}/5`);
    return done('Closed', f.number);
  };
  const recordSurvey = (r: Omit<SurveyResponse, 'id'>): Result => {
    const err = deny(null, '');
    if (err) return fail(err);
    if (!r.customerId) return fail('Choose the customer');
    if (!(r.nps >= 0 && r.nps <= 10) || !(r.csat >= 1 && r.csat <= 5)) return fail('NPS is 0–10 and satisfaction is 1–5');
    commit({ ...get(), surveys: [{ ...r, id: uid('sv') }, ...get().surveys] });
    return done('Survey recorded', `NPS ${r.nps} · CSAT ${r.csat}`);
  };
  const logVisit = (customerId: string, subject: string, due: string, type: 'VISIT' | 'CALL' | 'MEETING' | 'EMAIL'): Result => {
    const err = deny(SELLERS, 'Customer follow-ups are planned by the commercial team');
    if (err) return fail(err);
    if (!customerId || !subject.trim()) return fail('Choose the customer and describe the visit');
    commit({ ...get(), activities: [{ id: uid('ac'), opportunityId: '', customerId, type, subject, due, done: false, owner: actor().name }, ...get().activities] });
    return done('Follow-up planned', subject);
  };
  const completeVisit = (id: string, report: string, score: number): Result => {
    const err = deny(null, '');
    if (err) return fail(err);
    const a = get().activities.find((x) => x.id === id);
    if (!a || a.done) return fail('Already done');
    if (a.type === 'VISIT' && (!report.trim() || !(score >= 1 && score <= 5))) return fail('A visit report and a 1–5 experience score are required');
    commit({ ...get(), activities: get().activities.map((x) => (x.id === id ? { ...x, done: true, outcome: report || 'Done', visitReport: report || undefined, visitScore: score || undefined } : x)) });
    return done('Follow-up completed', a.subject);
  };

  /* ================= Customer portal (simulated) ================= */
  const setPortalCustomer = (id: string) => {
    const s = get();
    commit({ ...s, portalCustomerId: id, portalEvents: [{ id: uid('pe'), at: now(), customerId: id, kind: 'LOGIN', channel: 'WEB' }, ...s.portalEvents] });
  };
  const portalTrack = (kind: PortalEvent['kind'], ref?: string) => logPortal(kind, ref);
  const placeWebOrder = (w: { lines: Line[]; segment: 'B2B' | 'B2C'; shipToId?: string; oneTimeShipTo?: string; customerRef: string; requiredBy: string; buyerName?: string }): Result => {
    const err = k.readOnly();
    if (err) return fail(err);
    const s = get();
    const customerId = s.portalCustomerId;
    if (!w.customerRef.trim()) return fail('Enter your order reference');
    if (s.orders.some((o) => o.customerId === customerId && o.status !== 'VOID' && o.customerRef.trim().toLowerCase() === w.customerRef.trim().toLowerCase())) return fail(`You already used reference ${w.customerRef}`);
    // Catalogue items are priced by the engine; configured blends at the configurator's price (never the browser's).
    const lines = w.lines
      .filter((l) => (l.sku || l.configId) && l.qty > 0)
      .map((l) => {
        const blend = l.configId ? s.blends.find((b) => b.id === l.configId && (!b.customerId || b.customerId === customerId)) : undefined;
        if (l.configId) return blend ? { ...l, id: uid('ol'), sku: '', price: blend.unitPrice, discountPct: 0, ruleLabel: `Configured blend ${blend.number}` } : null;
        return pricedLine(s, { ...l, id: uid('ol') }, { customerId, date: TODAY, shipDate: w.requiredBy });
      })
      .filter((l): l is Line => !!l);
    if (!lines.length) return fail('Add at least one product to the basket');
    if (w.segment === 'B2C' && !w.oneTimeShipTo?.trim()) return fail('Enter the delivery address');
    const prof = profileOf(s, customerId);
    const draft: SalesOrder = { id: '', number: '', customerId, date: TODAY, requiredBy: w.requiredBy, customerRef: w.customerRef, deliveryAddress: '', lines: lines.map((l) => ({ ...l, delivered: 0, invoiced: 0 })), invoices: [], notes: '', status: 'DRAFT', preparedBy: '', approvals: [], history: [], shipToId: w.shipToId, oneTimeShipTo: w.oneTimeShipTo };
    const charges = autoCharges(draft, s);
    const r = k.saveOrder({ customerId, date: TODAY, requiredBy: w.requiredBy, customerRef: w.customerRef, deliveryAddress: w.oneTimeShipTo ?? prof.shipTos.find((x) => x.id === w.shipToId)?.address ?? '', lines: draft.lines, shipToId: w.shipToId, oneTimeShipTo: w.oneTimeShipTo, notes: `Placed on the customer portal (${w.segment})`, channel: 'WEB', segment: w.segment, paymentMode: w.segment === 'B2C' ? 'CASH' : 'ACCOUNT', oneTimeName: w.buyerName || undefined, charges, priority: prof.priority, preparedBy: `${party(customerId)?.name} (portal)` });
    if (!r.ok || !r.id) return r;
    logPortal('ORDER', r.id);
    const sub = k.submitOrder(r.id);
    customerMail(customerId, 'Order received', `Thank you — your order ${get().orders.find((o) => o.id === r.id)?.number} has been received${w.segment === 'B2C' ? '. Pay online to release it for dispatch.' : '.'}`, r.id);
    return sub.ok ? { ok: true, id: r.id } : r;
  };
  const requestChange = (orderId: string, kind: 'CHANGE' | 'CANCEL', note: string): Result => {
    const err = k.readOnly();
    if (err) return fail(err);
    const s = get();
    const o = s.orders.find((x) => x.id === orderId);
    if (!o || o.customerId !== s.portalCustomerId) return fail('You can only change your own orders');
    if (o.status === 'VOID' || o.lines.some((l) => l.delivered > 0)) return fail('This order has already left the warehouse — call us to arrange a return');
    if (!note.trim()) return fail('Tell us what to change');
    if (s.changeRequests.some((c) => c.orderId === orderId && c.status === 'OPEN')) return fail('There is already an open request on this order');
    commit({ ...s, changeRequests: [{ id: uid('cr'), orderId, customerId: o.customerId, kind, note, status: 'OPEN', at: now() }, ...s.changeRequests] });
    logPortal('CHANGE_REQUEST', o.number);
    notify({ module: MODULE, to: 'Commercial Officer', subject: `${kind === 'CANCEL' ? 'Cancellation' : 'Change'} request on ${o.number}`, body: note, ref: o.number, channels: ['IN_APP'] });
    return done('Request sent', `${o.number}: our team will confirm shortly`);
  };
  const decideChange = (id: string, accept: boolean): Result => {
    const err = deny(SELLERS, 'Customer requests are handled by the commercial team');
    if (err) return fail(err);
    const s = get();
    const c = s.changeRequests.find((x) => x.id === id);
    if (!c || c.status !== 'OPEN') return fail('Already handled');
    if (accept && c.kind === 'CANCEL') {
      const r = k.cancelOrder(c.orderId, 'r13');
      if (!r.ok) return r;
    }
    const s2 = get();
    commit({ ...s2, changeRequests: s2.changeRequests.map((x) => (x.id === id ? { ...x, status: accept ? 'DONE' : 'DECLINED', decidedBy: actor().name } : x)) });
    customerMail(c.customerId, `Your ${c.kind === 'CANCEL' ? 'cancellation' : 'change'} request`, accept ? 'Done as requested.' : 'We could not make this change — your account manager will call you.', c.orderId);
    return done(accept ? 'Request done' : 'Request declined', '');
  };

  return {
    saveProduct,
    addProvisionalProduct,
    massUpdatePrices,
    savePriceList,
    approvePriceList,
    retirePriceList,
    setLowestPrice,
    importReferencePrices,
    saveReasonCode,
    savePaymentTerm,
    saveFreightRate,
    saveCampaign,
    saveKycTemplate,
    saveCustomerProfile,
    recordKycItem,
    verifyKyc,
    submitApplication,
    appKyc,
    verifyAppKyc,
    decideApplication,
    addNote,
    copyQuotation,
    copyOrder,
    saveTemplate,
    deleteTemplate,
    orderFromTemplate,
    amendOrder,
    mergeOrders,
    holdOrder,
    releaseOrder,
    setPriority,
    setReleases,
    addCharge,
    removeCharge,
    autoCharges,
    calcCharges,
    createDirectShipPOs,
    confirmDirectShip,
    invoiceRun,
    cashSale,
    payOrder,
    raiseRma,
    decideRma,
    receiveRma,
    creditRma,
    recordReceipt,
    decideClaim,
    applyCredit,
    importCatalogue,
    openSale,
    placeBid,
    closeLot,
    closeSale,
    withdrawLot,
    recordTasting,
    dispatchSamples,
    sampleReceived,
    saveBlend,
    addBlendToDoc,
    generateContract,
    completeStep,
    submitContract,
    approveContract,
    signContract,
    terminateContract,
    checkContractExpiries,
    logFeedback,
    assignFeedback,
    progressFeedback,
    closeFeedback,
    recordSurvey,
    logVisit,
    completeVisit,
    setPortalCustomer,
    portalTrack,
    placeWebOrder,
    requestChange,
    decideChange,
    appGaps,
    orderBlockers: (o: SalesOrder) => orderBlockers(get(), o, party(o.customerId)),
    PACK_LINE
  };
};
