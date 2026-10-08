import { createBus, pid, stamp } from './bus';
import { audit } from './audit';
import { notify } from './outbox';

/**
 * Role changes go through a request and an approval instead of taking effect at once. The approver can never be
 * the person who asked (segregation of duties), and every step lands in the audit trail.
 */
export interface AccessRequest {
  id: string;
  userId: string;
  userName: string;
  fromRole: string;
  toRole: string;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

const bus = createBus<AccessRequest>([
  { id: 'ar-seed1', userId: 'usr_03', userName: 'Marcus Vance', fromRole: 'Super Admin', toRole: 'Analyst', reason: 'Least privilege — moved to reporting duties after the KRA audit', requestedBy: 'Joseph Kiprono', requestedAt: stamp(new Date(Date.now() - 26 * 3_600_000)), status: 'PENDING' }
]);
export const useAccessRequests = bus.use;
export const allAccessRequests = bus.all;

type R = { ok: true; id?: string } | { ok: false; error: string };

export const requestRoleChange = (r: Pick<AccessRequest, 'userId' | 'userName' | 'fromRole' | 'toRole' | 'reason' | 'requestedBy'>): R => {
  if (r.fromRole === r.toRole) return { ok: false, error: 'Choose a different role' };
  if (r.reason.trim().length < 10) return { ok: false, error: 'Give the business reason (at least 10 characters)' };
  if (bus.all().some((x) => x.userId === r.userId && x.status === 'PENDING')) return { ok: false, error: 'This user already has a role change waiting for approval' };
  const req: AccessRequest = { ...r, id: pid('ar'), requestedAt: stamp(), status: 'PENDING' };
  bus.push(req);
  audit({ module: 'Platform', by: r.requestedBy, action: 'Role change requested', ref: r.userName, field: 'role', before: r.fromRole, after: r.toRole, note: r.reason });
  notify({ module: 'Platform', to: 'Workspace administrators', subject: `Role change for ${r.userName}: ${r.fromRole} → ${r.toRole}`, body: r.reason, ref: req.id });
  return { ok: true, id: req.id };
};

/** Decides a request. `apply` performs the role change when approved. */
export const decideRoleChange = (id: string, by: string, approve: boolean, note: string, apply: (r: AccessRequest) => void): R => {
  const r = bus.all().find((x) => x.id === id);
  if (!r) return { ok: false, error: 'Request not found' };
  if (r.status !== 'PENDING') return { ok: false, error: 'This request has already been decided' };
  if (r.requestedBy === by) return { ok: false, error: 'You asked for this change, so someone else must approve it' };
  if (!approve && !note.trim()) return { ok: false, error: 'Give a reason for rejecting' };
  bus.set(bus.all().map((x) => (x.id === id ? { ...x, status: approve ? 'APPROVED' : 'REJECTED', decidedBy: by, decidedAt: stamp(), note } : x)));
  if (approve) apply(r);
  audit({ module: 'Platform', by, action: approve ? 'Role change approved' : 'Role change rejected', ref: r.userName, field: 'role', before: r.fromRole, after: approve ? r.toRole : r.fromRole, note: note || undefined });
  notify({ module: 'Platform', to: r.requestedBy, subject: `Role change ${approve ? 'approved' : 'rejected'}: ${r.userName}`, body: note || undefined, ref: r.id });
  return { ok: true };
};

/* ---------------- Scheduled user-rights review ---------------- */

export interface RightsSchedule {
  frequency: 'Weekly' | 'Monthly' | 'Quarterly';
  recipients: string;
  lastRun?: string;
  nextRun: string;
}
export interface RightsRun {
  id: string;
  at: string;
  by: string;
  users: number;
  privileged: number;
  withoutMfa: number;
}
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
const nextFrom = (f: RightsSchedule['frequency'], from = new Date()) => stamp(f === 'Weekly' ? new Date(from.getTime() + 7 * 86_400_000) : addMonths(from, f === 'Monthly' ? 1 : 3)).slice(0, 10);

const schedule = createBus<RightsSchedule>([{ frequency: 'Monthly', recipients: 'ict.manager@intergrated-erp.ke, internal.audit@intergrated-erp.ke', nextRun: nextFrom('Monthly') }]);
const runs = createBus<RightsRun>();
export const useRightsSchedule = () => schedule.use()[0];
export const useRightsRuns = runs.use;

export const setRightsSchedule = (by: string, s: Pick<RightsSchedule, 'frequency' | 'recipients'>): R => {
  if (!s.recipients.includes('@')) return { ok: false, error: 'Add at least one recipient email' };
  const cur = schedule.all()[0];
  schedule.set([{ ...cur, ...s, nextRun: nextFrom(s.frequency) }]);
  audit({ module: 'Platform', by, action: 'User-rights review schedule changed', field: 'frequency', before: cur.frequency, after: s.frequency, note: s.recipients });
  return { ok: true };
};

/** Records a run of the review and sends it to the recipients (simulated email). */
export const runRightsReview = (by: string, stats: Omit<RightsRun, 'id' | 'at' | 'by'>) => {
  const cur = schedule.all()[0];
  const run: RightsRun = { id: pid('rr'), at: stamp(), by, ...stats };
  runs.push(run);
  schedule.set([{ ...cur, lastRun: run.at, nextRun: nextFrom(cur.frequency) }]);
  cur.recipients
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((address) => notify({ module: 'Platform', to: 'User-rights review recipient', address, channels: ['EMAIL'], subject: `User rights review — ${stats.users} users, ${stats.privileged} privileged, ${stats.withoutMfa} without MFA`, ref: run.id }));
  audit({ module: 'Platform', by, action: 'User-rights review run', ref: run.id });
  return run;
};
