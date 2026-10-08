import { createBus, pid } from './bus';
import { audit } from './audit';

/**
 * User-defined fields for any kind of record. Administrators define the fields per entity; values are kept per
 * record key (e.g. "ict-asset:it3") and edited with <CustomFields> on the record's drawer.
 */
export interface CustomFieldDef {
  id: string;
  entity: string;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
  options?: string[];
  required?: boolean;
}

/** Record types that offer custom fields, with a friendly name. */
export const CUSTOM_ENTITIES: Record<string, string> = {
  'ict-asset': 'ICT asset',
  'ict-ticket': 'Service desk ticket',
  'qa-complaint': 'Customer complaint',
  'qa-risk': 'Risk',
  'gov-permit': 'Licence or permit',
  'qa-emergency': 'Emergency'
};

const defs = createBus<CustomFieldDef>([
  { id: 'cf1', entity: 'ict-asset', key: 'insurer', label: 'Insured with', type: 'select', options: ['APA Insurance', 'Jubilee', 'Britam', 'Not insured'] },
  { id: 'cf2', entity: 'ict-asset', key: 'kraAssetClass', label: 'KRA capital allowance class', type: 'select', options: ['Class II (computers) 25%', 'Class III 12.5%', 'Class IV 10%'] },
  { id: 'cf3', entity: 'qa-complaint', key: 'auctionLot', label: 'Mombasa auction lot no.', type: 'text' },
  { id: 'cf4', entity: 'gov-permit', key: 'inspectionDate', label: 'Last inspection', type: 'date' }
]);
const values = createBus<{ owner: string; values: Record<string, string> }>();

export const useCustomFieldDefs = defs.use;
export const useCustomValues = values.use;
export const customValuesFor = (owner: string) => values.all().find((v) => v.owner === owner)?.values ?? {};

type R = { ok: true } | { ok: false; error: string };

export const addCustomField = (by: string, d: Omit<CustomFieldDef, 'id' | 'key'>): R => {
  if (!d.label.trim()) return { ok: false, error: 'Give the field a label' };
  const key = d.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (defs.all().some((x) => x.entity === d.entity && x.key === key)) return { ok: false, error: 'That field already exists for this record type' };
  if (d.type === 'select' && !(d.options ?? []).filter(Boolean).length) return { ok: false, error: 'List the choices for a drop-down field' };
  defs.push({ ...d, id: pid('cf'), key });
  audit({ module: 'Platform', by, action: 'Custom field added', ref: CUSTOM_ENTITIES[d.entity] ?? d.entity, field: key, after: d.type });
  return { ok: true };
};
export const removeCustomField = (by: string, id: string) => {
  const d = defs.all().find((x) => x.id === id);
  defs.set(defs.all().filter((x) => x.id !== id));
  if (d) audit({ module: 'Platform', by, action: 'Custom field removed', ref: CUSTOM_ENTITIES[d.entity] ?? d.entity, field: d.key });
};

export const setCustomValues = (by: string, owner: string, next: Record<string, string>, entity: string): R => {
  const missing = defs.all().filter((d) => d.entity === entity && d.required && !next[d.key]?.trim());
  if (missing.length) return { ok: false, error: `Fill in ${missing.map((m) => m.label).join(', ')}` };
  for (const d of defs.all().filter((x) => x.entity === entity && x.type === 'number'))
    if (next[d.key] && Number.isNaN(Number(next[d.key]))) return { ok: false, error: `${d.label} must be a number` };
  const before = customValuesFor(owner);
  values.set([...values.all().filter((v) => v.owner !== owner), { owner, values: next }]);
  for (const k of Object.keys(next)) if ((before[k] ?? '') !== next[k]) audit({ module: 'Custom fields', by, action: 'Changed', ref: owner, field: k, before: before[k] ?? '', after: next[k] });
  return { ok: true };
};
