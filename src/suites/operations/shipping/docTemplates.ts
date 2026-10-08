import { esc } from '../../../platform/Widgets';
import { fmtDate, round2, TODAY } from '../../finance/engine';
import type { Party } from '../../finance/types';
import type { Shipment } from '../types';
import { shipValue } from '../engine';
import { CONTAINER_SPEC, locLabel, MOVE_LABEL, planCargoKg, QTY_KINDS } from '../warehousing/engine';
import type { Asn, LoadingPlan, LotMove, Msds, Signature, StorageLocation, TeaLot, Warrant } from '../warehousing/types';
import { amountInWords, siBags, siKg, siValue } from './engine';
import type { ShippingInstruction, TemplateSettings } from './types';

/**
 * Predefined document templates. Each renders printable HTML from live records; the header, address, footer and
 * bank details come from the editable template settings (Shipping › Document templates).
 */
export type DocScope = 'SHIPMENT' | 'SI' | 'PLAN' | 'LOT' | 'ASN' | 'WARRANT';

export interface DocCtx {
  settings: TemplateSettings;
  company: string;
  party?: Party;
  si?: ShippingInstruction;
  shipment?: Shipment;
  plan?: LoadingPlan;
  asn?: Asn;
  lot?: TeaLot;
  warrant?: Warrant;
  lots: TeaLot[];
  moves: LotMove[];
  locations: StorageLocation[];
  msds: Msds[];
  number?: string;
  signature?: Signature;
  grouping?: 'BAG' | 'ORDER' | 'SKU';
  whName: (id: string) => string;
  partyName: (id: string) => string;
}

const n0 = (n: number) => Math.round(n).toLocaleString('en-KE');
const n2 = (n: number) => n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const head = (c: DocCtx, title: string, meta: [string, string][] = []) => `
  <div style="display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #222;padding-bottom:10px;margin-bottom:14px">
    <div><h1>${esc(c.settings.header || c.company)}</h1><div class="muted">${esc(c.settings.address || 'Mombasa, Kenya')}</div></div>
    <div style="text-align:right"><h2 style="margin:0">${esc(title)}</h2>${c.number ? `<div><b>No. ${esc(c.number)}</b></div>` : '<div class="muted">Draft — not registered</div>'}<div class="muted">Date ${fmtDate(TODAY)}</div></div>
  </div>
  ${meta.length ? `<table>${meta.map(([k, v]) => `<tr><th style="width:30%">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>` : ''}`;
const foot = (c: DocCtx, signLabel = 'Authorised signatory') => `
  <div class="sig"><div>${c.signature ? `<b style="font-family:cursive;font-size:16px">${esc(c.signature.text)}</b><br><small>Signed electronically by ${esc(c.signature.by)} · ${esc(c.signature.at)} · ${esc(c.signature.meaning)}</small>` : '&nbsp;'}<br>${esc(signLabel)}</div><div>&nbsp;<br>Received / checked by</div></div>
  <p class="muted" style="margin-top:24px">${esc(c.settings.footer)}</p>`;
const table = (cols: string[], rows: (string | number)[][], right: number[] = []) =>
  `<table><thead><tr>${cols.map((h, i) => `<th${right.includes(i) ? ' class="r"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<td${right.includes(i) ? ' class="r"' : ''}>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

/** Lines of a shipment or SI as tea lines (shipments booked from an SI carry its lots). */
const teaLines = (c: DocCtx) => {
  if (c.si) return c.si.lines.map((l) => ({ desc: `${l.garden} ${l.grade}`, ref: l.invoiceNo, lot: l.lotNo, bags: l.bags, kg: l.netKg, price: l.pricePerKg, kgPerBag: l.bags ? l.netKg / l.bags : 0 }));
  if (c.shipment) return c.shipment.lines.map((l) => ({ desc: l.description, ref: l.sku, lot: l.sku, bags: l.qty, kg: l.qty, price: l.price, kgPerBag: 1 }));
  return [];
};
const partyLine = (c: DocCtx) => (c.party ? `${c.party.name} · ${c.party.email} · PIN ${c.party.pin}` : '—');
const totalValue = (c: DocCtx) => (c.shipment ? shipValue(c.shipment) : c.si ? siValue(c.si) : 0);
const refOf = (c: DocCtx) => c.shipment?.number ?? c.si?.number ?? '';

export interface DocTemplate {
  key: string;
  title: string;
  scope: DocScope[];
  render: (c: DocCtx) => string;
}

export const TEMPLATES: DocTemplate[] = [
  {
    key: 'proforma',
    title: 'Proforma invoice',
    scope: ['SI', 'SHIPMENT'],
    render: (c) => {
      const lines = teaLines(c);
      return `${head(c, 'Proforma invoice', [
        ['Buyer', partyLine(c)],
        ['Reference', `${refOf(c)}${c.si ? ` · contract ${c.si.contractRef}` : ''}`],
        ['Terms', `${c.si?.incoterm ?? c.shipment?.incoterm} ${c.si?.destination ?? c.shipment?.destination}`]
      ])}
      ${table(['Description', 'Invoice / lot', 'Bags', 'Net kg', 'Price / kg', 'Amount KES'], [...lines.map((l) => [l.desc, `${l.ref} · ${l.lot}`, n0(l.bags), n0(l.kg), n2(l.price), n2(l.kg * l.price)]), ['Total', '', n0(lines.reduce((x, l) => x + l.bags, 0)), n0(lines.reduce((x, l) => x + l.kg, 0)), '', n2(totalValue(c))]], [2, 3, 4, 5])}
      <p>Export — zero-rated for VAT. Payment: ${esc(c.settings.bank)}</p><p class="muted">This proforma is not a demand for payment; prices valid 14 days.</p>${foot(c)}`;
    }
  },
  {
    key: 'packing',
    title: 'Packing list',
    scope: ['SHIPMENT', 'SI'],
    render: (c) => {
      const lines = teaLines(c);
      const grouping = c.grouping ?? 'ORDER';
      let rows: (string | number)[][] = [];
      if (grouping === 'BAG') {
        // One row per individual bag, numbered within the consignment
        let bagNo = 0;
        for (const l of lines) for (let b = 1; b <= l.bags && rows.length < 2_000; b++) rows.push([++bagNo, l.lot, `${l.desc} · ${l.ref}`, n2(l.kgPerBag), n2(l.kgPerBag + 0.9)]);
      } else if (grouping === 'SKU') {
        const by = new Map<string, { bags: number; kg: number }>();
        for (const l of lines) {
          const k = l.desc.split(' ').slice(-1)[0];
          const v = by.get(k) ?? { bags: 0, kg: 0 };
          by.set(k, { bags: v.bags + l.bags, kg: v.kg + l.kg });
        }
        rows = Array.from(by.entries()).map(([k, v]) => [k, n0(v.bags), n0(v.kg), n0(v.kg + v.bags * 0.9)]);
      } else rows = lines.map((l) => [l.lot, `${l.desc} · ${l.ref}`, n0(l.bags), n2(l.kgPerBag), n0(l.kg), n0(l.kg + l.bags * 0.9)]);
      const cols = grouping === 'BAG' ? ['Bag no.', 'Lot', 'Tea', 'Net kg', 'Gross kg'] : grouping === 'SKU' ? ['Grade', 'Bags', 'Net kg', 'Gross kg'] : ['Lot', 'Tea', 'Bags', 'Kg / bag', 'Net kg', 'Gross kg'];
      return `${head(c, `Packing list — by ${grouping.toLowerCase()}`, [
        ['Buyer', partyLine(c)],
        ['Reference', refOf(c)],
        ['Container / seal', c.shipment ? `${c.shipment.container ?? '—'} / ${c.shipment.seal ?? '—'}` : '—'],
        ['Marks', c.si?.markings ?? '—']
      ])}${table(cols, rows, grouping === 'BAG' ? [0, 3, 4] : grouping === 'SKU' ? [1, 2, 3] : [2, 3, 4, 5])}
      <p>Total ${n0(lines.reduce((x, l) => x + l.bags, 0))} bags · net ${n0(lines.reduce((x, l) => x + l.kg, 0))} kg · gross ${n0(lines.reduce((x, l) => x + l.kg + l.bags * 0.9, 0))} kg (multiwall sack tare 0.9 kg).</p>${foot(c, 'Stores — packed and checked')}`;
    }
  },
  {
    key: 'invoice',
    title: 'Commercial invoice',
    scope: ['SHIPMENT'],
    render: (c) => {
      const lines = teaLines(c);
      const s = c.shipment!;
      return `${head(c, 'Commercial invoice', [
        ['Buyer', partyLine(c)],
        ['Shipment', `${s.number} · ${s.incoterm} ${s.destination}`],
        ['Vessel / booking', `${s.vessel} · ${s.bookingRef}`],
        ['Finance invoice', s.invoiceNumber ?? 'Not yet raised'],
        ['Container / seal', `${s.container ?? '—'} / ${s.seal ?? '—'}`]
      ])}${table(['Description', 'Qty (kg)', 'Price', 'Amount KES'], lines.map((l) => [`${l.desc} (${l.ref})`, n0(l.kg), n2(l.price), n2(l.kg * l.price)]), [1, 2, 3])}
      <p><b>Total ${n2(shipValue(s))} KES</b> — ${esc(amountInWords(shipValue(s)))}. Country of origin: Kenya. Export — zero-rated.</p>${foot(c)}`;
    }
  },
  {
    key: 'boe',
    title: 'Bill of exchange',
    scope: ['SHIPMENT'],
    render: (c) => {
      const s = c.shipment!;
      const v = shipValue(s);
      return `${head(c, 'Bill of exchange')}
      <p style="font-size:15px">Exchange for <b>KES ${n2(v)}</b> &nbsp;·&nbsp; ${fmtDate(TODAY)}</p>
      <p style="font-size:15px;line-height:1.8">At <b>60 days after sight</b> of this FIRST of exchange (second of the same tenor and date being unpaid) pay to the order of <b>${esc(c.settings.header || c.company)}</b> the sum of <b>${esc(amountInWords(v))}</b>, for value received, being tea shipped per ${esc(s.number)} on ${esc(s.vessel)}, invoice ${esc(s.invoiceNumber ?? '—')}.</p>
      ${table(['Drawee', 'Drawer', 'Tenor', 'Amount'], [[`${c.party?.name ?? ''} through ${c.settings.drawee}`, c.settings.header || c.company, '60 days after sight', `KES ${n2(v)}`]])}${foot(c, 'For and on behalf of the drawer')}`;
    }
  },
  {
    key: 'bank',
    title: 'Bank instructions (documentary collection)',
    scope: ['SHIPMENT'],
    render: (c) => {
      const s = c.shipment!;
      return `${head(c, 'Instructions for documentary collection', [
        ['Remitting bank', c.settings.bank],
        ['Collecting bank', c.settings.drawee],
        ['Drawee', partyLine(c)],
        ['Amount', `KES ${n2(shipValue(s))}`],
        ['Shipment', `${s.number} · ${s.vessel} · B/L ${s.docs.find((d) => d.key === 'bl')?.ref ?? 'to follow'}`]
      ])}
      <p>Please collect the enclosed documents against <b>acceptance (D/A, 60 days)</b>. Protest for non-acceptance: no. Charges outside Kenya for the drawee's account.</p>
      ${table(['Document', 'Reference', 'Originals', 'Copies'], s.docs.map((d) => [d.name, d.ref ?? '—', d.key === 'bl' ? '3/3' : '1', '2']))}${foot(c)}`;
    }
  },
  {
    key: 'booking',
    title: 'Booking confirmation',
    scope: ['SHIPMENT'],
    render: (c) => {
      const s = c.shipment!;
      return `${head(c, 'Booking confirmation', [
        ['Shipper', c.settings.header || c.company],
        ['Consignee', c.si?.consignee ?? c.party?.name ?? '—'],
        ['Vessel / line', `${s.vessel} (${s.line})`],
        ['Booking reference', s.bookingRef],
        ['Port of loading', 'Mombasa, Kenya'],
        ['Port of discharge', s.destination],
        ['ETD / ETA', `${fmtDate(s.etd)} / ${fmtDate(s.eta)}`],
        ['Cargo', `${n0(s.lines.reduce((x, l) => x + l.qty, 0))} kg — black tea in multiwall sacks (HS 0902.40)`]
      ])}${foot(c)}`;
    }
  },
  {
    key: 'msds',
    title: 'Material safety data sheet',
    scope: ['SHIPMENT', 'SI'],
    render: (c) =>
      `${head(c, 'Material safety data sheets', [['Consignment', refOf(c)]])}${c.msds
        .map((m) => `<h2>${esc(m.title)} <span class="muted">(${esc(m.key)}, ${esc(m.revision)})</span></h2>${table(['Section', 'Detail'], [['Hazards', m.hazards], ['Handling & storage', m.handling], ['First aid', m.firstAid], ['Last reviewed', fmtDate(m.updated)]])}`)
        .join('')}${foot(c)}`
  },
  {
    key: 'loading',
    title: 'Container loading plan',
    scope: ['PLAN'],
    render: (c) => {
      const p = c.plan!;
      const spec = CONTAINER_SPEC[p.containerType];
      const kg = planCargoKg(p.lines);
      return `${head(c, 'Container loading plan', [
        ['Reference', p.ref],
        ['Container', `${p.container || 'to be allocated'} · ${spec.label} · seal ${p.seal || '—'}`],
        ['Stuffing base', c.whName(p.warehouseId)],
        ['Fill', `${n0(kg)} kg of ${n0(spec.maxKg)} kg (${Math.round((kg / spec.maxKg) * 100)}%) · ${p.lines.reduce((x, l) => x + l.bags, 0)} of ${spec.maxBags} bags`]
      ])}${table(['Seq', 'Lot', 'Tea', 'Location', 'Bags', 'Kg'], p.lines.map((l) => {
        const lot = c.lots.find((x) => x.id === l.lotId);
        return [l.seq, lot?.lotNo ?? '', lot ? `${lot.garden} ${lot.grade} · ${lot.invoiceNo}` : '', locLabel(c.locations.find((x) => x.id === lot?.locationId)), l.bags, n0(l.kg)];
      }), [4, 5])}<p class="muted">Load heaviest invoices first at the door end; dunnage between tiers; max 8 bags high.</p>${foot(c, 'Stuffing supervisor')}`;
    }
  },
  {
    key: 'vgm',
    title: 'Verified gross mass (VGM) certificate',
    scope: ['PLAN'],
    render: (c) => {
      const p = c.plan!;
      const v = p.vgm;
      return `${head(c, 'Verified gross mass certificate (SOLAS VI/2)', [
        ['Container', `${p.container} · ${CONTAINER_SPEC[p.containerType].label}`],
        ['Booking / reference', p.ref],
        ['Method', v ? (v.method === 'METHOD_1' ? 'Method 1 — packed container weighed' : 'Method 2 — cargo + packing + tare') : 'Not certified'],
        ['Cargo + dunnage', `${n0(planCargoKg(p.lines) + p.dunnageKg)} kg`],
        ['Container tare', `${n0(p.tareKg)} kg`],
        ['Verified gross mass', v ? `${n0(v.grossKg)} kg` : '—'],
        ['Weighbridge / calc ref', v?.scaleRef ?? '—'],
        ['Certificate no.', v?.number ?? '—']
      ])}${foot({ ...c, signature: c.signature ?? v?.signature }, "Shipper's authorised person")}`;
    }
  },
  {
    key: 'stockcard',
    title: 'Stock card',
    scope: ['LOT'],
    render: (c) => {
      const lot = c.lot!;
      const moves = c.moves.filter((m) => m.lotId === lot.id).sort((a, b) => a.date.localeCompare(b.date));
      let bal = 0;
      const rows = moves.map((m) => {
        if (QTY_KINDS.includes(m.kind)) bal = round2(bal + m.kg);
        return [fmtDate(m.date), MOVE_LABEL[m.kind], m.ref, QTY_KINDS.includes(m.kind) && m.kg > 0 ? n0(m.kg) : '', QTY_KINDS.includes(m.kind) && m.kg < 0 ? n0(-m.kg) : '', n0(bal), m.by];
      });
      return `${head(c, `Stock card ${lot.lotNo}`, [
        ['Unique identifier', `${lot.lotNo} · RFID ${lot.rfid ?? '—'}`],
        ['Tea', `${lot.garden} (${lot.mark}) ${lot.grade} · invoice ${lot.invoiceNo}`],
        ['Owner', `${c.partyName(lot.owner)} — ${lot.ownership.toLowerCase()}`],
        ['Location', `${c.whName(lot.warehouseId)} · ${locLabel(c.locations.find((x) => x.id === lot.locationId))}`]
      ])}${table(['Date', 'Movement', 'Reference', 'In kg', 'Out kg', 'Balance kg', 'By'], rows, [3, 4, 5])}${foot(c, 'Storekeeper')}`;
    }
  },
  {
    key: 'tally',
    title: 'Inward tally sheet',
    scope: ['ASN'],
    render: (c) => {
      const a = c.asn!;
      return `${head(c, `Inward tally sheet ${a.tally?.number ?? ''}`, [
        ['From', `${a.from} (${a.source.toLowerCase()})`],
        ['Truck', a.truck],
        ['Warehouse', c.whName(a.warehouseId)],
        ['ASN', a.number]
      ])}${table(['Invoice', 'Garden / grade', 'Bags expected', 'Bags counted', 'Declared kg', 'Weighed kg', 'Variance kg'], a.lines.map((l, i) => {
        const t = a.tally?.lines[i];
        const dec = l.bags * l.kgPerBag;
        return [l.invoiceNo, `${l.garden} ${l.grade}`, l.bags, t?.bagsCounted ?? '', n0(dec), t ? n0(t.weighedKg) : '', t ? n0(t.weighedKg - dec) : ''];
      }), [2, 3, 4, 5, 6])}${foot({ ...c, signature: c.signature ?? a.tally?.signature }, 'Tally clerk')}`;
    }
  },
  {
    key: 'warrant',
    title: 'Warehouse warrant',
    scope: ['WARRANT'],
    render: (c) => {
      const w = c.warrant!;
      const lots = c.lots.filter((l) => w.lotIds.includes(l.id));
      return `${head(c, `Warehouse warrant ${w.number}`, [
        ['Holder', w.holder],
        ['Issued', fmtDate(w.issued)],
        ['Status', w.status.toLowerCase()]
      ])}<p>We hold the following teas to the order of the holder of this warrant, deliverable only on surrender of this warrant duly endorsed and payment of warehouse charges.</p>
      ${table(['Lot', 'Garden / grade', 'Invoice', 'Sale', 'Bags', 'Net kg', 'Location'], lots.map((l) => [l.lotNo, `${l.garden} ${l.grade}`, l.invoiceNo, l.auction?.saleNo ?? '—', l.bags, n0(l.netKg), locLabel(c.locations.find((x) => x.id === l.locationId))]), [4, 5])}${foot(c, 'For the warehouse keeper')}`;
    }
  },
  {
    key: 'si',
    title: 'Shipping instruction',
    scope: ['SI'],
    render: (c) => {
      const si = c.si!;
      return `${head(c, `Shipping instruction ${si.number} (v${si.version})`, [
        ['Customer', partyLine(c)],
        ['Contract', `${si.contractRef}${si.buyerRef ? ` · buyer ref ${si.buyerRef}` : ''}`],
        ['Destination / terms', `${si.incoterm} ${si.destination}`],
        ['Consignee / notify', `${si.consignee} / ${si.notifyParty}`],
        ['Marks', si.markings],
        ['Ready for stuffing by', fmtDate(si.readyBy)],
        ['Stuffing base', si.stuffingBase ? c.whName(si.stuffingBase) : 'On confirmation']
      ])}${table(['Lot', 'Garden / grade', 'Invoice', 'Bags', 'Net kg'], si.lines.map((l) => [l.lotNo, `${l.garden} ${l.grade}`, l.invoiceNo, l.bags, n0(l.netKg)]), [3, 4])}<p>Total ${siBags(si)} bags · ${n0(siKg(si))} kg.</p>${foot(c)}`;
    }
  }
];

/** Wraps template HTML so Word opens it as a document (.doc). */
export const asWordDoc = (title: string, html: string) =>
  `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:11pt Calibri,Arial}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:4px}.r{text-align:right}.muted{color:#666}</style></head><body>${html}</body></html>`;
