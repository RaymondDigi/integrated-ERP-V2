import { addDays, daysBetween, TODAY } from '../finance/engine';
import type { Capa, Complaint, ControlState, Kri, KriMetric, MonitorRule, Permit, Priority, Risk, Ticket } from './types';

/** Response and resolution targets in hours. */
export const SLA: Record<Priority, { respond: number; resolve: number; label: string }> = {
  P1: { respond: 0.25, resolve: 4, label: 'Critical — business stopped' },
  P2: { respond: 1, resolve: 8, label: 'High — a team is blocked' },
  P3: { respond: 4, resolve: 72, label: 'Normal' },
  P4: { respond: 8, resolve: 120, label: 'Low — request or minor issue' }
};

const hoursSince = (iso: string, until = Date.now()) => (until - new Date(iso).getTime()) / 3_600_000;

export const slaState = (t: Ticket) => {
  const s = SLA[t.priority];
  const end = t.resolvedAt ? new Date(t.resolvedAt).getTime() : Date.now();
  const elapsed = hoursSince(t.created, end);
  const responded = t.firstResponse ? hoursSince(t.created, new Date(t.firstResponse).getTime()) : null;
  const responseBreached = responded !== null ? responded > s.respond : elapsed > s.respond;
  const resolveBreached = elapsed > s.resolve;
  return { elapsed, left: s.resolve - elapsed, responseBreached, resolveBreached, used: elapsed / s.resolve };
};

export const fmtHours = (h: number) => {
  const a = Math.abs(h);
  const txt = a < 1 ? `${Math.round(a * 60)} min` : a < 48 ? `${a.toFixed(a < 10 ? 1 : 0)} h` : `${Math.round(a / 24)} days`;
  return h < 0 ? `${txt} over` : txt;
};

export const score = (l: number, i: number) => l * i;
export const rating = (s: number) => (s >= 15 ? 'HIGH' : s >= 8 ? 'MEDIUM' : 'LOW');
export const riskScore = (r: Risk) => score(r.residualLikelihood, r.residualImpact);

export const permitState = (p: Permit) => {
  const days = daysBetween(TODAY, p.expiry);
  return days < 0 ? 'EXPIRED' : days <= 30 ? 'EXPIRING' : 'VALID';
};

/* ---------------- Corrective actions ---------------- */

export const capaLeft = (c: Capa) => daysBetween(TODAY, c.due);

/* ---------------- Complaint escalation ---------------- */

/** Escalation rules: severity and age without acknowledgement, age while open, and customers who keep complaining. */
export const ESCALATION_RULES = [
  { level: 1, text: 'High-severity complaint not acknowledged within 1 day', to: 'QHSE Manager' },
  { level: 1, text: 'Any complaint open for more than 7 days', to: 'QHSE Manager' },
  { level: 2, text: 'Repeat customer — 2 or more complaints in 90 days', to: 'Commercial Manager' },
  { level: 3, text: 'High-severity complaint open for more than 14 days', to: 'Managing Director' }
];
export const complaintEscalation = (c: Complaint, all: Complaint[]) => {
  if (c.status === 'RESOLVED') return { level: 0, reasons: [] as string[], to: '' };
  const age = daysBetween(c.date, TODAY);
  const reasons: { level: number; text: string; to: string }[] = [];
  if (c.severity === 'HIGH' && !c.acknowledgedAt && age >= 1) reasons.push(ESCALATION_RULES[0]);
  if (age > 7) reasons.push(ESCALATION_RULES[1]);
  if (all.filter((x) => x.customerId === c.customerId && daysBetween(x.date, TODAY) <= 90).length >= 2) reasons.push(ESCALATION_RULES[2]);
  if (c.severity === 'HIGH' && age > 14) reasons.push(ESCALATION_RULES[3]);
  const top = reasons.reduce((m, r) => (r.level > m.level ? r : m), { level: 0, text: '', to: '' });
  return { level: top.level, reasons: reasons.map((r) => r.text), to: top.to };
};

/* ---------------- Key risk indicators ---------------- */

/** Values from other suites that the control store cannot see; screens pass them in. */
export interface KriExternal {
  lowStock?: number;
  overdueReceivablesPct?: number;
  equipmentDown?: number;
}
export const KRI_LABEL: Record<KriMetric, string> = {
  OVERDUE_CAPAS: 'Overdue corrective actions',
  SLA_BREACHES: 'Open tickets past their SLA',
  OVERDUE_FILINGS: 'Overdue statutory filings',
  EXPIRING_PERMITS: 'Licences expired or expiring in 30 days',
  OPEN_HIGH_COMPLAINTS: 'Open high-severity complaints',
  OPEN_EMERGENCIES: 'Open emergencies',
  FAILED_SYNCS: 'Failed or warning integration syncs',
  LOW_STOCK_ITEMS: 'Items below reorder level',
  OVERDUE_RECEIVABLES_PCT: 'Receivables overdue, % of total',
  EQUIPMENT_DOWN: 'Equipment down'
};
export const kriValues = (s: ControlState, ext: KriExternal = {}): Record<KriMetric, number> => ({
  OVERDUE_CAPAS: s.capas.filter((c) => c.status !== 'CLOSED' && c.due < TODAY).length,
  SLA_BREACHES: s.tickets.filter((t) => t.status !== 'RESOLVED' && slaState(t).resolveBreached).length,
  OVERDUE_FILINGS: s.obligations.filter((o) => o.status === 'DUE' && o.due < TODAY).length,
  EXPIRING_PERMITS: s.permits.filter((p) => !p.retired && permitState(p) !== 'VALID').length,
  OPEN_HIGH_COMPLAINTS: s.complaints.filter((c) => c.status !== 'RESOLVED' && c.severity === 'HIGH').length,
  OPEN_EMERGENCIES: s.emergencies.filter((e) => e.status !== 'CLOSED').length,
  FAILED_SYNCS: s.syncLog.filter((l) => l.status !== 'OK').length,
  LOW_STOCK_ITEMS: ext.lowStock ?? 0,
  OVERDUE_RECEIVABLES_PCT: Math.round(ext.overdueReceivablesPct ?? 0),
  EQUIPMENT_DOWN: ext.equipmentDown ?? 0
});
export const kriState = (k: Kri, value: number): 'RED' | 'AMBER' | 'GREEN' => (value >= k.limit ? 'RED' : value >= k.warn ? 'AMBER' : 'GREEN');
export const riskActive = (r: Risk) => (r.status ?? 'ACTIVE') === 'ACTIVE';

/* ---------------- Exception reports ---------------- */

/** Findings and complaints that keep coming back: grouped, keeping only groups seen at least twice. */
export const repeatNonConformities = (s: ControlState, windowDays = 365) => {
  const since = addDays(TODAY, -windowDays);
  const group = <T,>(items: T[], key: (x: T) => string) => {
    const m = new Map<string, T[]>();
    items.forEach((x) => m.set(key(x), [...(m.get(key(x)) ?? []), x]));
    return [...m.entries()].filter(([, v]) => v.length >= 2).map(([k, v]) => ({ key: k, count: v.length, items: v })).sort((a, b) => b.count - a.count);
  };
  const findings = s.audits.filter((a) => a.date >= since).flatMap((a) => a.findings.filter((f) => f.severity !== 'OBSERVATION').map((f) => ({ ...f, audit: a })));
  const complaints = s.complaints.filter((c) => c.date >= since);
  return {
    byArea: group(findings, (f) => f.audit.area),
    byClause: group(findings.filter((f) => f.clause), (f) => f.clause!),
    bySku: group(complaints, (c) => c.sku),
    byCategory: group(complaints, (c) => c.category),
    byCustomer: group(complaints, (c) => c.customerId)
  };
};

/* ---------------- Service desk ---------------- */

/** ITIL impact × urgency → priority (1 = high). */
export const priorityFrom = (impact: 1 | 2 | 3, urgency: 1 | 2 | 3): Priority => (['P1', 'P2', 'P3', 'P2', 'P3', 'P4', 'P3', 'P4', 'P4'] as Priority[])[(impact - 1) * 3 + (urgency - 1)];

/* ---------------- Monitoring (simulated telemetry) ---------------- */

const UNIT: Record<MonitorRule['metric'], string> = { CPU: '%', MEMORY: '%', DISK: '%', LATENCY: 'ms', PACKET_LOSS: '%' };
export const metricUnit = (m: MonitorRule['metric']) => UNIT[m];
/**
 * Simulated reading for a monitored target. There is no telemetry agent in this build, so values follow a
 * repeatable curve per target with an occasional spike, so threshold alerts can be seen.
 */
export const simulatedReading = (r: MonitorRule, at = Date.now()) => {
  const seed = [...(r.target + r.metric)].reduce((s, c) => s + c.charCodeAt(0), 0);
  const hour = at / 3_600_000;
  const base = { CPU: 45, MEMORY: 70, DISK: 72, LATENCY: 85, PACKET_LOSS: 0.4 }[r.metric];
  const swing = { CPU: 25, MEMORY: 12, DISK: 4, LATENCY: 60, PACKET_LOSS: 1.2 }[r.metric];
  const wave = Math.sin(hour / 3 + seed) * 0.6 + Math.sin(hour * 1.7 + seed / 7) * 0.4;
  const spike = Math.floor(hour + seed) % 11 === 0 ? 1.8 : 1;
  const v = Math.max(0, base + swing * wave * spike + (r.metric === 'DISK' ? (seed % 9) * 1.5 : 0));
  return r.metric === 'PACKET_LOSS' ? Math.round(v * 100) / 100 : Math.round(v);
};
export const readingState = (r: MonitorRule, v: number) => (v >= r.critical ? 'CRITICAL' : v >= r.warn ? 'WARNING' : 'OK');
