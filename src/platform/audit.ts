import { createBus, pid, stamp } from './bus';

/** Shared audit trail: who changed what, when, with the before and after values where a field changed. */
export interface AuditEvent {
  id: string;
  at: string;
  module: string;
  by: string;
  action: string;
  ref?: string;
  field?: string;
  before?: string;
  after?: string;
  note?: string;
}

const bus = createBus<AuditEvent>();

export const audit = (e: Omit<AuditEvent, 'id' | 'at'>) => {
  const ev = { ...e, id: pid('au'), at: stamp() };
  bus.push(ev);
  return ev;
};

/** Records one event per changed field between two versions of a record. */
export const auditChanges = <T extends object>(module: string, by: string, ref: string, before: T, after: T, fields?: (keyof T)[]) => {
  const keys = fields ?? (Object.keys(after) as (keyof T)[]);
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b) && typeof b !== 'object')
      audit({ module, by, ref, action: 'Changed', field: String(k), before: a === undefined ? '' : String(a), after: b === undefined ? '' : String(b) });
  }
};

export const useAuditTrail = bus.use;
export const allAudit = bus.all;
