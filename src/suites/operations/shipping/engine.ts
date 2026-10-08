import { daysBetween, round2, TODAY } from '../../finance/engine';
import type { Party } from '../../finance/types';
import type { Shipment } from '../types';
import { shipValue } from '../engine';
import { availableKg } from '../warehousing/engine';
import type { TeaLot } from '../warehousing/types';
import type { Bond, Milestone, ShipCharge, ShippingInstruction, SiStatus, Voyage } from './types';

export const SI_LABEL: Record<SiStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  CREDIT_HOLD: 'Credit hold',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In progress',
  SHIPPED: 'Shipped',
  CANCELLED: 'Cancelled'
};
export const SI_PILL: Record<SiStatus, string> = { DRAFT: 'DRAFT', SUBMITTED: 'SUBMITTED', CREDIT_HOLD: 'OVERDUE', CONFIRMED: 'APPROVED', IN_PROGRESS: 'OPEN', SHIPPED: 'POSTED', CANCELLED: 'VOID' };
export const SI_FLOW: SiStatus[] = ['DRAFT', 'SUBMITTED', 'CONFIRMED', 'IN_PROGRESS', 'SHIPPED'];

export const siKg = (si: Pick<ShippingInstruction, 'lines'>) => round2(si.lines.reduce((x, l) => x + l.netKg, 0));
export const siBags = (si: Pick<ShippingInstruction, 'lines'>) => si.lines.reduce((x, l) => x + l.bags, 0);
export const siValue = (si: Pick<ShippingInstruction, 'lines'>) => round2(si.lines.reduce((x, l) => x + l.netKg * l.pricePerKg, 0));
export const isOpenSi = (si: ShippingInstruction) => !['DRAFT', 'SHIPPED', 'CANCELLED'].includes(si.status);

/**
 * Stock confirmation for an SI: every line must point at a QC-passed lot with enough unreserved kg, and tea held
 * for a customer can only ship on that customer's own instruction.
 */
export const siStockCheck = (si: Pick<ShippingInstruction, 'lines' | 'customerId' | 'number'>, lots: TeaLot[]) =>
  si.lines.map((l) => {
    const lot = lots.find((x) => x.id === l.lotId);
    if (!lot) return { line: l, ok: false, available: 0, reason: `${l.lotNo}: lot not found` };
    const mine = lot.reservedFor === si.number ? lot.reservedKg : 0;
    const available = round2(availableKg(lot) + mine);
    if (lot.ownership === 'CUSTOMER' && lot.owner !== si.customerId) return { line: l, ok: false, available, reason: `${lot.lotNo} belongs to another customer` };
    if (lot.qc !== 'PASS') return { line: l, ok: false, available: 0, reason: `${lot.lotNo} is ${lot.qc === 'HOLD' ? 'on QC hold' : lot.qc === 'FAIL' ? 'failed by QC' : 'awaiting QC'}` };
    if (available < l.netKg) return { line: l, ok: false, available, reason: `${lot.lotNo}: ${available.toLocaleString()} kg available, ${l.netKg.toLocaleString()} kg requested` };
    return { line: l, ok: true, available, reason: '' };
  });

/**
 * Credit check: what the customer owes plus every other open instruction plus this one, against the limit.
 * Mirrors the sales-order credit exception in Trading.
 */
export const siCreditStatus = (si: ShippingInstruction, customer: Party | undefined, owed: number, others: ShippingInstruction[]) => {
  const openValue = others.filter((x) => x.customerId === si.customerId && x.id !== si.id && isOpenSi(x) && x.status !== 'CREDIT_HOLD').reduce((a, x) => a + siValue(x), 0);
  const value = siValue(si);
  const exposure = round2(owed + openValue + value);
  const limit = customer?.creditLimit ?? 0;
  return { status: exposure > limit ? ('HOLD' as const) : ('OK' as const), exposure, limit, value, owed, openValue: round2(openValue) };
};

/** Stuffing base = the warehouse holding most of the SI's tea; the rest has to be transferred there. */
export const suggestStuffingBase = (si: Pick<ShippingInstruction, 'lines'>) => {
  const byWh = new Map<string, number>();
  for (const l of si.lines) byWh.set(l.warehouseId, (byWh.get(l.warehouseId) ?? 0) + l.netKg);
  const ranked = Array.from(byWh.entries()).sort((a, b) => b[1] - a[1]);
  const base = ranked[0]?.[0];
  return { base, byWarehouse: ranked, toTransfer: si.lines.filter((l) => l.warehouseId !== base) };
};

/** Vessel schedule risk for an SI: the cut-off falls before the tea is ready, or is too close to an unstuffed SI. */
export const scheduleRisk = (si: ShippingInstruction, v?: Voyage) => {
  if (!v || ['SHIPPED', 'CANCELLED'].includes(si.status)) return null;
  if (si.readyBy > v.cutOff) return { level: 'LATE' as const, text: `Ready ${si.readyBy} is after the ${v.vessel} cut-off ${v.cutOff}` };
  const days = daysBetween(TODAY, v.cutOff);
  if (!si.stuffedAt && days <= 2) return { level: days < 0 ? ('LATE' as const) : ('TIGHT' as const), text: days < 0 ? `Cut-off passed ${-days} days ago and not stuffed` : `Cut-off in ${days} day${days === 1 ? '' : 's'} and not stuffed yet` };
  if (v.etd !== v.originalEtd) return { level: 'INFO' as const, text: `ETD moved ${daysBetween(v.originalEtd, v.etd) > 0 ? '+' : ''}${daysBetween(v.originalEtd, v.etd)} days` };
  return null;
};

/** Bond utilisation from the value of the shipments it secures, and the expiry alert. */
export const bondUse = (b: Bond, shipments: Shipment[]) => {
  const used = round2(shipments.filter((s) => b.shipmentIds.includes(s.id) && !['DELIVERED'].includes(s.stage)).reduce((x, s) => x + shipValue(s), 0));
  const days = daysBetween(TODAY, b.expiry);
  return { used, free: round2(b.amount - used), pct: b.amount ? used / b.amount : 0, days, alert: b.status === 'ACTIVE' && days <= 30 ? (days < 0 ? 'Expired' : `Expires in ${days} days`) : null };
};

export const CHARGE_LABEL: Record<ShipCharge['type'], string> = {
  FREIGHT: 'Ocean freight',
  PORT_KPA: 'Port charges (KPA)',
  KEPHIS: 'KEPHIS inspection fee',
  CLEARING: 'Clearing & forwarding',
  TEA_BOARD_LEVY: 'Tea Board export levy',
  HAULAGE: 'Haulage to port',
  INSURANCE: 'Marine insurance',
  STUFFING: 'Container stuffing'
};
/** Finance account each charge is expensed to. */
export const CHARGE_ACCOUNT: Record<ShipCharge['type'], string> = { FREIGHT: '6300', PORT_KPA: '6300', KEPHIS: '6500', CLEARING: '6500', TEA_BOARD_LEVY: '6500', HAULAGE: '6300', INSURANCE: '6500', STUFFING: '6300' };

/** Landed cost: goods at cost (tea lots, or SKU cost) plus every charge booked against the shipment. */
export const landedCost = (s: Shipment, charges: ShipCharge[], goodsCost: number) => {
  const mine = charges.filter((c) => c.shipmentId === s.id);
  const chargeTotal = round2(mine.reduce((x, c) => x + c.amount, 0));
  const landed = round2(goodsCost + chargeTotal);
  const value = shipValue(s);
  return { goodsCost: round2(goodsCost), chargeTotal, landed, value, margin: round2(value - landed), marginPct: value ? (value - landed) / value : 0, kg: s.lines.reduce((x, l) => x + l.qty, 0) };
};

/** Steps done outside the system that every export is tracked against. */
export const MILESTONE_TEMPLATE: Omit<Milestone, 'status' | 'due'>[] = [
  { key: 'marking', name: 'Packaging markings approved by client', party: 'Buyer' },
  { key: 'stuffing', name: 'Container stuffing', party: 'Stuffing base' },
  { key: 'kephis', name: 'KEPHIS inspection & phyto', party: 'KEPHIS' },
  { key: 'inspection', name: 'Pre-shipment inspection report', party: 'Inspection agency' },
  { key: 'customs', name: 'Customs export entry (ICMS)', party: 'KRA' },
  { key: 'kpa', name: 'Port gate-in (KPA)', party: 'KPA' },
  { key: 'bl', name: 'Bill of lading processed', party: 'Shipping line' },
  { key: 'delivery', name: 'Delivery report', party: 'Buyer / agent' }
];
export const MS_PILL: Record<Milestone['status'], string> = { NOT_STARTED: 'DRAFT', SUBMITTED: 'SUBMITTED', APPROVED: 'POSTED', REJECTED: 'REJECTED' };

/** SI processing timeline targets (days) and actual performance from the SI's timestamps. */
export const SI_KPIS = [
  { key: 'confirm', label: 'Submitted → confirmed', from: 'submittedAt', to: 'confirmedAt', target: 1 },
  { key: 'stuff', label: 'Confirmed → stuffed', from: 'confirmedAt', to: 'stuffedAt', target: 5 },
  { key: 'ship', label: 'Stuffed → shipped', from: 'stuffedAt', to: 'shippedAt', target: 4 },
  { key: 'total', label: 'Submitted → shipped', from: 'submittedAt', to: 'shippedAt', target: 10 }
] as const;
export const siKpi = (si: ShippingInstruction) =>
  SI_KPIS.map((k) => {
    const a = si[k.from];
    const b = si[k.to];
    const days = a && b ? daysBetween(a.slice(0, 10), b.slice(0, 10)) : a && !b && !['CANCELLED'].includes(si.status) ? daysBetween(a.slice(0, 10), TODAY) : null;
    return { ...k, days, done: !!(a && b), met: days === null ? null : days <= k.target };
  });

/* ------------------------------------------------------------------ */
/* Amounts in words for the bill of exchange                            */
/* ------------------------------------------------------------------ */

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const words999 = (n: number): string => {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? '-' + ONES[r % 10] : ''}`;
  return [h ? `${ONES[h]} hundred` : '', rest].filter(Boolean).join(' and ');
};
export const amountInWords = (amount: number, currency = 'Kenya shillings') => {
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  if (whole === 0) return `${currency} zero`;
  const parts: string[] = [];
  const scales: [number, string][] = [
    [1e9, 'billion'],
    [1e6, 'million'],
    [1e3, 'thousand'],
    [1, '']
  ];
  let n = whole;
  for (const [v, name] of scales) {
    const q = Math.floor(n / v);
    if (q) parts.push(`${words999(q)}${name ? ' ' + name : ''}`);
    n %= v;
  }
  const text = `${currency} ${parts.join(' ')}${cents ? ` and ${cents}/100` : ''} only`;
  return text.charAt(0).toUpperCase() + text.slice(1);
};
