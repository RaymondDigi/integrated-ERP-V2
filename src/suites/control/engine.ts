import { daysBetween, TODAY } from '../finance/engine';
import type { Permit, Priority, Risk, Ticket } from './types';

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
