import { daysBetween, round2, TODAY } from '../../finance/engine';
import type { Container, ContainerBooking, ContainerStatus, PortDiscrepancy, ShippingLine } from './types';

export const SHIPPING_LINES: ShippingLine[] = [
  { code: 'MSK', name: 'Maersk', agent: 'Maersk Kenya Ltd, Mombasa', email: 'ke.export@maersk.com' },
  { code: 'MSC', name: 'MSC', agent: 'MSC Kenya Ltd, Mombasa', email: 'ke-mba.export@msc.com' },
  { code: 'CMA', name: 'CMA CGM', agent: 'CMA CGM Kenya, Mombasa', email: 'mba.booking@cma-cgm.com' },
  { code: 'PIL', name: 'PIL', agent: 'Pacific International Lines (Kenya)', email: 'mba.export@pilship.com' }
];

export const CONTAINER_RE = /^[A-Z]{4}\s?\d{7}$/;
export const normaliseContainer = (n: string) => {
  const x = n.trim().toUpperCase().replace(/\s+/g, '');
  return x.length === 11 ? `${x.slice(0, 4)} ${x.slice(4)}` : n.trim().toUpperCase();
};

export const STATUS_LABEL: Record<ContainerStatus, string> = {
  EMPTY_RELEASED: 'Empty released',
  AT_WAREHOUSE: 'At warehouse',
  STUFFED: 'Stuffed and sealed',
  GATED_IN: 'Gated in at port',
  LOADED: 'Loaded on vessel',
  ROLLED_OVER: 'Rolled over',
  WITHDRAWN: 'Withdrawn',
  RETURNED: 'Empty returned'
};

/** Allowed container movements. */
export const MOVES: Record<ContainerStatus, ContainerStatus[]> = {
  EMPTY_RELEASED: ['AT_WAREHOUSE', 'RETURNED'],
  AT_WAREHOUSE: ['STUFFED', 'RETURNED'],
  STUFFED: ['GATED_IN', 'WITHDRAWN'],
  GATED_IN: ['LOADED', 'ROLLED_OVER', 'WITHDRAWN'],
  LOADED: ['WITHDRAWN'],
  ROLLED_OVER: ['GATED_IN', 'LOADED', 'WITHDRAWN'],
  WITHDRAWN: ['AT_WAREHOUSE', 'RETURNED'],
  RETURNED: []
};

export const stuffedKg = (c: Container) => c.lots.reduce((x, l) => x + l.kg, 0);
export const firstAt = (c: Container, st: ContainerStatus) => c.events.find((e) => e.status === st)?.at.slice(0, 10);
export const openDiscrepancies = (ds: PortDiscrepancy[], containerNo: string) => ds.filter((d) => d.status === 'OPEN' && d.containerNo === containerNo);

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export const containerAgeing = (cs: Container[]) =>
  cs
    .filter((c) => !['LOADED', 'RETURNED'].includes(c.status))
    .map((c) => ({ c, days: daysBetween(c.releasedOn, TODAY) }))
    .sort((a, b) => b.days - a.days)
    .map((x) => ({ ...x, bucket: x.days <= 3 ? '0–3 days' : x.days <= 7 ? '4–7 days' : x.days <= 14 ? '8–14 days' : 'Over 14 days' }));

export const stuffingReport = (cs: Container[], from: string, to: string) => cs.filter((c) => c.stuffedOn && c.stuffedOn >= from && c.stuffedOn <= to).sort((a, b) => (a.stuffedOn ?? '').localeCompare(b.stuffedOn ?? ''));

/** Containers the terminal must be told about: stuffed, not yet gated in, with the vessel cut-off coming up. */
export const preAdvice = (cs: Container[], days = 7) =>
  cs.filter((c) => (c.status === 'STUFFED' || c.status === 'ROLLED_OVER') && c.cutOff && daysBetween(TODAY, c.cutOff.slice(0, 10)) <= days).sort((a, b) => (a.cutOff ?? '').localeCompare(b.cutOff ?? ''));

export const statusReport = (cs: Container[]) => {
  const m = new Map<string, number>();
  for (const c of cs) m.set(`${STATUS_LABEL[c.status]}|${c.location}`, (m.get(`${STATUS_LABEL[c.status]}|${c.location}`) ?? 0) + 1);
  return [...m.entries()].map(([k, n]) => ({ status: k.split('|')[0], location: k.split('|')[1], count: n })).sort((a, b) => a.status.localeCompare(b.status));
};

/* ------------------------------------------------------------------ */
/* KPIs: planned against actual by stage                               */
/* ------------------------------------------------------------------ */

export const KPI_TARGETS = [
  { key: 'confirm', label: 'Booking request → line confirmation', days: 2 },
  { key: 'release', label: 'Confirmation → empties released', days: 2 },
  { key: 'stuff', label: 'Empty released → stuffed', days: 5 },
  { key: 'gate', label: 'Stuffed → gated in at port', days: 2 }
] as const;

const at = (b: ContainerBooking, action: string) => b.history.find((h) => h.action.startsWith(action))?.at.slice(0, 10);

export const containerKpis = (bookings: ContainerBooking[], cs: Container[]) => {
  const stage = (key: (typeof KPI_TARGETS)[number]['key']) => {
    const samples: number[] = [];
    if (key === 'confirm') for (const b of bookings) { const a = at(b, 'Requested'); const c = at(b, 'Confirmed'); if (a && c) samples.push(daysBetween(a, c)); }
    if (key === 'release') for (const c of cs) { const b = bookings.find((x) => x.id === c.bookingId); const conf = b && at(b, 'Confirmed'); if (conf) samples.push(Math.max(0, daysBetween(conf, c.releasedOn))); }
    if (key === 'stuff') for (const c of cs) if (c.stuffedOn) samples.push(daysBetween(c.releasedOn, c.stuffedOn));
    if (key === 'gate') for (const c of cs) { const g = firstAt(c, 'GATED_IN'); if (c.stuffedOn && g) samples.push(daysBetween(c.stuffedOn, g)); }
    const target = KPI_TARGETS.find((k) => k.key === key)!.days;
    return { avg: samples.length ? round2(samples.reduce((a, b) => a + b, 0) / samples.length) : null, n: samples.length, onTime: samples.length ? Math.round((samples.filter((x) => x <= target).length / samples.length) * 100) : null };
  };
  const gated = cs.filter((c) => firstAt(c, 'GATED_IN') && c.cutOff);
  const beforeCutOff = gated.filter((c) => (c.events.find((e) => e.status === 'GATED_IN')?.at ?? '') <= (c.cutOff ?? '').replace('T', ' '));
  const late = cs.filter((c) => c.status === 'ROLLED_OVER' || (c.cutOff && c.cutOff < `${TODAY}T23:59` && (c.status === 'STUFFED' || c.status === 'AT_WAREHOUSE')));
  return {
    stages: KPI_TARGETS.map((k) => ({ ...k, ...stage(k.key) })),
    gateInOnTime: gated.length ? Math.round((beforeCutOff.length / gated.length) * 100) : null,
    rolled: cs.filter((c) => c.events.some((e) => e.status === 'ROLLED_OVER')).length,
    withdrawn: cs.filter((c) => c.events.some((e) => e.status === 'WITHDRAWN')).length,
    late
  };
};

/** Reads a pasted KRA (customs) email: container number, the kind of discrepancy and the declared/found values. */
export const parseKraEmail = (text: string) => {
  const t = text.replace(/\r/g, '');
  const box = t.match(/\b([A-Z]{4})\s?(\d{7})\b/i);
  const kind: PortDiscrepancy['type'] = /seal/i.test(t) ? 'SEAL' : /package|pkgs|packages|bags|cartons/i.test(t) ? 'PACKAGES' : /weigh|kg|tonne|vgm/i.test(t) ? 'WEIGHT' : 'DOCS';
  const declared = t.match(/declared[^0-9A-Z]*([A-Z0-9][A-Z0-9,.\- ]*?)(?:\s*(kg|pkgs|packages)|[.;\n]|$)/i);
  const found = t.match(/(?:found|actual|verified|scanned)[^0-9A-Z]*([A-Z0-9][A-Z0-9,.\- ]*?)(?:\s*(kg|pkgs|packages)|[.;\n]|$)/i);
  return {
    containerNo: box ? `${box[1].toUpperCase()} ${box[2]}` : '',
    type: kind,
    declared: declared ? `${declared[1].trim()}${declared[2] ? ` ${declared[2]}` : ''}` : '',
    found: found ? `${found[1].trim()}${found[2] ? ` ${found[2]}` : ''}` : ''
  };
};
