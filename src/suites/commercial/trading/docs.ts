import { docBalance, docTotals, fmtDate, kes } from '../../finance/engine';
import type { FinanceState, FinDocument, Party } from '../../finance/types';
import { esc } from '../../../platform/Widgets';
import { lineNet, totals } from '../engine';
import { customerAgeing, profileOf } from '../tradeEngine';
import type { CommercialState, Delivery, Line, SalesOrder } from '../types';
import type { Contract, CreditMemo, CustomerProfile, DocFormat, SampleDispatch } from '../tradeTypes';

/**
 * Printable customer documents. Each customer can have their own format (layout, language, customer item codes,
 * ship-to instructions and a footer), kept on the customer record.
 */

const COMPANY = 'Integrated Tea Traders Ltd · P.O. Box 30080-00100 Nairobi · KRA PIN P051100220Z';
const WORDS: Record<DocFormat['language'], Record<string, string>> = {
  EN: { ack: 'Order acknowledgement', packing: 'Packing list / delivery note', invoice: 'Tax invoice', statement: 'Statement of account', item: 'Item', qty: 'Qty', price: 'Unit price', amount: 'Amount', total: 'Total (KES)', shipTo: 'Ship to', billTo: 'Bill to', instructions: 'Delivery instructions', received: 'Received in good order', date: 'Date' },
  SW: { ack: 'Uthibitisho wa oda', packing: 'Orodha ya mzigo / hati ya kupokea', invoice: 'Ankara ya kodi', statement: 'Taarifa ya akaunti', item: 'Bidhaa', qty: 'Idadi', price: 'Bei', amount: 'Kiasi', total: 'Jumla (KES)', shipTo: 'Peleka kwa', billTo: 'Ankara kwa', instructions: 'Maelekezo ya kupeleka', received: 'Imepokelewa ikiwa salama', date: 'Tarehe' }
};

const head = (title: string, number: string, meta: [string, string][], fmt?: DocFormat) =>
  `<h1>${esc(title)} <span class="muted">${esc(number)}</span></h1><p class="muted">${COMPANY}</p>
   <table>${meta.map(([k, v]) => `<tr><th style="width:30%">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>${fmt?.layout === 'EXPORT' ? '<p><b>Export documentation — zero-rated for VAT. FOB Mombasa unless stated.</b></p>' : ''}`;

const addressBlock = (label: string, name: string, lines: (string | undefined)[]) => `<h2>${esc(label)}</h2><p><b>${esc(name)}</b><br>${lines.filter(Boolean).map((l) => esc(l)).join('<br>')}</p>`;

export const shipToOf = (s: CommercialState, o: SalesOrder) => {
  const prof = profileOf(s, o.customerId);
  const ship = prof.shipTos.find((x) => x.id === o.shipToId);
  return { prof, ship, text: o.oneTimeShipTo || (ship ? `${ship.label}, ${ship.address}, ${ship.town}, ${ship.country}` : o.deliveryAddress) };
};

const linesTable = (lines: (Line & { delivered?: number })[], s: CommercialState, fmt: DocFormat, w: Record<string, string>, showPrice = true, prof?: CustomerProfile) =>
  `<table><thead><tr>${fmt.showCustomerCodes ? '<th>Your code</th>' : ''}<th>${w.item}</th><th class="r">${w.qty}</th>${showPrice ? `<th class="r">${w.price}</th><th class="r">${w.amount}</th>` : '<th>Packages / checked</th>'}</tr></thead><tbody>${lines
    .map((l) => {
      const code = l.customerCode ?? prof?.customerItems.find((c) => c.sku === l.sku)?.customerCode ?? '';
      const p = s.products.find((x) => x.sku === l.sku);
      const detail = fmt.layout !== 'STANDARD' ? `<br><span class="muted">${esc(l.sku)}${p?.upc ? ` · EAN ${esc(p.upc)}` : ''}${p?.attributes?.grade ? ` · ${esc(p.attributes.grade)} ${esc(p.attributes.origin ?? '')}` : ''}${l.discountPct ? ` · less ${l.discountPct}%` : ''}</span>` : '';
      return `<tr>${fmt.showCustomerCodes ? `<td>${esc(code)}</td>` : ''}<td>${esc(l.description)}${detail}${l.note ? `<br><i>${esc(l.note)}</i>` : ''}</td><td class="r">${l.qty}</td>${showPrice ? `<td class="r">${l.price.toLocaleString()}</td><td class="r">${lineNet(l).toLocaleString()}</td>` : '<td></td>'}</tr>`;
    })
    .join('')}</tbody></table>`;

/** Order acknowledgement in the customer's format (printed or sent automatically on approval). */
export const ackHtml = (s: CommercialState, o: SalesOrder, party?: Party) => {
  const { prof, ship, text } = shipToOf(s, o);
  const fmt = prof.docFormat;
  const w = WORDS[fmt.language];
  const t = totals(o.lines, s.products, party);
  const charges = (o.charges ?? []).map((c) => `<tr><td>${esc(c.description)}</td><td class="r">${c.amount.toLocaleString()}</td></tr>`).join('');
  const bill = prof.billTos.find((b) => b.id === o.billToId) ?? prof.billTos[0];
  return `${head(w.ack, o.number, [
    [w.date, fmtDate(o.date)],
    ['Your order', o.customerRef || '—'],
    ['Delivery by', fmtDate(o.requiredBy)],
    ['Incoterm', o.incoterm ? `${o.incoterm} ${o.namedPlace ?? ''}` : '—'],
    ['Payment terms', s.paymentTerms.find((x) => x.id === (o.termId || prof.termId))?.label ?? `${party?.terms ?? 30} days`]
  ], fmt)}
  ${addressBlock(w.billTo, o.oneTimeName || party?.name || '', o.oneTimeBillTo ? [o.oneTimeBillTo] : bill ? [bill.address, `${bill.town} ${bill.postalCode ?? ''}`, bill.country] : [`PIN ${party?.pin ?? ''}`])}
  ${addressBlock(w.shipTo, ship?.label ?? 'Delivery address', [text, o.contactName ? `Attn: ${o.contactName}` : ship?.contact])}
  ${fmt.showInstructions && ship?.instructions ? `<p><b>${w.instructions}:</b> ${esc(ship.instructions)}</p>` : ''}
  ${linesTable(o.lines, s, fmt, w, true, prof)}
  ${charges ? `<table><tbody>${charges}</tbody></table>` : ''}
  <table><tr><th>Subtotal</th><td class="r">${kes(t.net)}</td></tr><tr><th>VAT</th><td class="r">${kes(t.vat)}</td></tr><tr><th>${w.total}</th><td class="r"><b>${kes(t.total + (o.charges ?? []).reduce((x, c) => x + c.amount * (c.vatable && party?.pin !== 'NON-RESIDENT' ? 1.16 : 1), 0))}</b></td></tr></table>
  ${(o.noteLog ?? []).filter((n) => !n.internal).map((n) => `<p class="muted">${esc(n.text)}</p>`).join('')}
  ${fmt.footer ? `<p><b>${esc(fmt.footer)}</b></p>` : ''}`;
};

/** Packing list / delivery note, customer format, with ship-to instructions. */
export const packingHtml = (s: CommercialState, d: Delivery, party?: Party) => {
  const o = s.orders.find((x) => x.id === d.orderId)!;
  const { prof, ship, text } = shipToOf(s, o);
  const fmt = prof.docFormat;
  const w = WORDS[fmt.language];
  const lines = d.lines.map((l) => ({ ...o.lines.find((x) => x.id === l.lineId)!, qty: l.qty }));
  const kg = lines.reduce((x, l) => x + l.qty * (s.products.find((p) => p.sku === l.sku)?.weightKg ?? 0), 0);
  return `${head(w.packing, d.number, [
    [w.date, fmtDate(d.date)],
    ['Order', o.number],
    ['Customer LPO', o.customerRef || '—'],
    ['Vehicle / driver', `${d.vehicle} · ${d.driver}`],
    ['Gross weight', kg ? `${kg.toLocaleString()} kg` : '—']
  ], fmt)}
  ${addressBlock(w.shipTo, o.oneTimeName || party?.name || '', [ship?.label, text, ship?.contact ? `Contact: ${ship.contact} ${ship.phone ?? ''}` : undefined])}
  ${fmt.showInstructions && ship?.instructions ? `<p><b>${w.instructions}:</b> ${esc(ship.instructions)}</p>` : ''}
  ${linesTable(lines, s, fmt, w, false, prof)}
  <div class="sig"><div>${w.received} — name</div><div>Signature</div><div>${w.date}</div></div>
  ${fmt.footer ? `<p class="muted">${esc(fmt.footer)}</p>` : ''}`;
};

/** Bill of lading for a dispatch. */
export const bolHtml = (s: CommercialState, d: Delivery, party?: Party) => {
  const o = s.orders.find((x) => x.id === d.orderId)!;
  const { text } = shipToOf(s, o);
  const lines = d.lines.map((l) => ({ ...o.lines.find((x) => x.id === l.lineId)!, qty: l.qty }));
  const kg = d.bol?.grossKg ?? lines.reduce((x, l) => x + l.qty * (s.products.find((p) => p.sku === l.sku)?.weightKg ?? 0), 0);
  const pk = d.bol?.packages ?? lines.reduce((x, l) => x + l.qty, 0);
  return `${head('Bill of lading', `BOL-${d.number}`, [
    ['Shipper', 'Integrated Tea Traders Ltd, Nairobi'],
    ['Consignee', `${o.oneTimeName || party?.name || ''} — ${text}`],
    ['Carrier', d.bol?.carrier ?? (d.vehicle === 'Customer collection' ? 'Customer collection' : 'Own fleet')],
    ['Vehicle / driver', `${d.vehicle} · ${d.driver}`],
    ['Seal number', d.bol?.seal ?? '—'],
    ['Order / LPO', `${o.number} · ${o.customerRef || '—'}`],
    ['Incoterm', o.incoterm ? `${o.incoterm} ${o.namedPlace ?? ''}` : 'Delivered']
  ])}
  <table><thead><tr><th>Description of goods</th><th class="r">Packages</th><th class="r">Gross kg</th></tr></thead><tbody>${lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="r">${l.qty}</td><td class="r">${(l.qty * (s.products.find((p) => p.sku === l.sku)?.weightKg ?? 0)).toLocaleString()}</td></tr>`).join('')}
  <tr><th>Total</th><th class="r">${pk}</th><th class="r">${kg.toLocaleString()}</th></tr></tbody></table>
  <div class="sig"><div>Shipper</div><div>Carrier / driver</div><div>Consignee</div></div>`;
};

/** Invoice reprint in the customer's format. */
export const invoiceHtml = (s: CommercialState, fs: FinanceState, doc: FinDocument) => {
  const party = fs.parties.find((p) => p.id === doc.partyId);
  const prof = profileOf(s, doc.partyId);
  const fmt = prof.docFormat;
  const w = WORDS[fmt.language];
  const t = docTotals(doc);
  return `${head(w.invoice, doc.number, [
    [w.date, fmtDate(doc.date)],
    ['Due', fmtDate(doc.dueDate)],
    ['Reference', doc.reference],
    ['Status', doc.status === 'POSTED' ? 'Posted' : `${doc.status.toLowerCase()} — not yet posted`]
  ], fmt)}
  ${addressBlock(w.billTo, party?.name ?? '', [`PIN ${party?.pin ?? ''}`, party?.email])}
  <table><thead><tr><th>${w.item}</th><th class="r">${w.qty}</th><th class="r">${w.price}</th><th class="r">${w.amount}</th></tr></thead><tbody>${doc.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="r">${l.qty}</td><td class="r">${l.price.toLocaleString()}</td><td class="r">${(l.qty * l.price).toLocaleString()}</td></tr>`).join('')}</tbody></table>
  <table><tr><th>Subtotal</th><td class="r">${kes(t.net)}</td></tr><tr><th>VAT 16%</th><td class="r">${kes(t.vat)}</td></tr><tr><th>${w.total}</th><td class="r"><b>${kes(t.total)}</b></td></tr></table>
  <p class="muted">${esc(doc.notes)}</p>${fmt.footer ? `<p><b>${esc(fmt.footer)}</b></p>` : ''}`;
};

/** Statement of account with the customer's own ageing buckets. */
export const statementHtml = (s: CommercialState, fs: FinanceState, customerId: string) => {
  const party = fs.parties.find((p) => p.id === customerId);
  const prof = profileOf(s, customerId);
  const w = WORDS[prof.docFormat.language];
  const docs = fs.documents.filter((d) => d.kind === 'INVOICE' && d.partyId === customerId && d.status === 'POSTED' && docBalance(fs, d) > 0.005).sort((a, b) => a.date.localeCompare(b.date));
  const age = customerAgeing(fs, customerId, prof.agingBuckets);
  const credits = s.credits.filter((c) => c.customerId === customerId && c.status === 'OPEN');
  return `${head(w.statement, party?.name ?? '', [
    [w.date, fmtDate(new Date().toISOString().slice(0, 10))],
    ['Credit limit', kes(party?.creditLimit ?? 0)],
    ['Finance charges', prof.financeChargeExempt ? 'Exempt' : '1.5% a month on overdue balances']
  ], prof.docFormat)}
  <table><thead><tr><th>Invoice</th><th>${w.date}</th><th>Due</th><th class="r">Balance</th></tr></thead><tbody>${docs.map((d) => `<tr><td>${esc(d.number)}</td><td>${fmtDate(d.date)}</td><td>${fmtDate(d.dueDate)}</td><td class="r">${docBalance(fs, d).toLocaleString()}</td></tr>`).join('')}
  ${credits.map((c) => `<tr><td>${esc(c.number)} (credit note)</td><td>${fmtDate(c.date)}</td><td></td><td class="r">−${c.total.toLocaleString()}</td></tr>`).join('')}</tbody></table>
  <h2>Ageing</h2><table><tr>${age.map((a) => `<th>${esc(a.label)}</th>`).join('')}</tr><tr>${age.map((a) => `<td class="r">${a.amount.toLocaleString()}</td>`).join('')}</tr></table>
  ${prof.docFormat.footer ? `<p><b>${esc(prof.docFormat.footer)}</b></p>` : ''}`;
};

export const creditHtml = (c: CreditMemo, party?: Party) =>
  `${head('Credit note', c.number, [
    ['Date', fmtDate(c.date)],
    ['Customer', party?.name ?? ''],
    ['Against', c.source],
    ['Issued by', c.by]
  ])}
  <table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Amount</th></tr></thead><tbody>${c.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="r">${l.qty}</td><td class="r">${l.price.toLocaleString()}</td><td class="r">${(l.qty * l.price).toLocaleString()}</td></tr>`).join('')}</tbody></table>
  <table>${c.fee ? `<tr><th>Less restocking fee</th><td class="r">−${kes(c.fee)}</td></tr>` : ''}<tr><th>Net</th><td class="r">${kes(c.net)}</td></tr><tr><th>VAT</th><td class="r">${kes(c.vat)}</td></tr><tr><th>Total credit</th><td class="r"><b>${kes(c.total)}</b></td></tr></table>`;

export const sampleHtml = (d: SampleDispatch, s: CommercialState) =>
  `${head('Sample delivery note', d.number, [
    ['Date', fmtDate(d.date)],
    ['To', `${d.recipient} (${d.recipientType.toLowerCase()})`],
    ['Courier', d.courier],
    ['Reprint', d.reprint ? 'Yes — reprint of earlier samples' : 'No']
  ])}
  <table><thead><tr><th>Tea</th><th>Lot</th><th class="r">Qty</th></tr></thead><tbody>${d.lines.map((l) => `<tr><td>${esc(s.products.find((p) => p.sku === l.sku)?.name ?? l.sku)}</td><td>${esc(l.lotNo ?? '—')}</td><td class="r">${l.qty}</td></tr>`).join('')}</tbody></table>
  <div class="sig"><div>Dispatched by ${esc(d.by)}</div><div>Received by</div></div>`;

export const contractHtml = (c: Contract, party?: Party) =>
  `${head(c.title, c.number, [
    ['Customer', party?.name ?? ''],
    ['Term', `${fmtDate(c.start)} – ${fmtDate(c.end)}`],
    ['Estimated value', kes(c.value)],
    ['Status', c.status]
  ])}
  <ol>${c.clauses.map((x) => `<li style="margin:6px 0">${esc(x)}</li>`).join('')}</ol>
  <div class="sig">${c.signatures.map((sg) => `<div><i>${esc(sg.text)}</i><br>${esc(sg.meaning)}<br><span class="muted">${esc(sg.at)} · electronic signature (demo)</span></div>`).join('') || '<div>For the company</div><div>For the customer</div>'}</div>`;
