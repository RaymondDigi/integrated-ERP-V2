import type { HREmployee, NextOfKin } from '../types';

/** One next-of-kin row as typed in a form (every field a string until saved). */
export interface KinDraft {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  idNumber: string;
  benefitPct: string;
  primary: boolean;
}

export const KIN_RELATIONSHIPS = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Guardian', 'Uncle', 'Aunt', 'Cousin', 'Friend'];

const PHONE_RE = /^\+?[\d\s]{9,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emptyKin = (primary = false): KinDraft => ({
  name: '',
  relationship: '',
  phone: '',
  email: '',
  idNumber: '',
  benefitPct: '',
  primary
});

/** Everyone on file, oldest records (single next of kin) included. */
export const kinOf = (e: Pick<HREmployee, 'nextOfKin' | 'nextOfKins'>): NextOfKin[] => (e.nextOfKins?.length ? e.nextOfKins : e.nextOfKin ? [{ ...e.nextOfKin, primary: true }] : []);

export const kinDraftsOf = (e: Pick<HREmployee, 'nextOfKin' | 'nextOfKins'>): KinDraft[] => {
  const list = kinOf(e);
  if (!list.length) return [emptyKin(true)];
  return list.map((k) => ({
    name: k.name,
    relationship: k.relationship,
    phone: k.phone,
    email: k.email ?? '',
    idNumber: k.idNumber ?? '',
    benefitPct: k.benefitPct !== undefined ? String(k.benefitPct) : '',
    primary: !!k.primary
  }));
};

const filled = (d: KinDraft) => !!(d.name.trim() || d.relationship.trim() || d.phone.trim() || d.email.trim() || d.idNumber.trim() || d.benefitPct.trim());

/** Saved list plus the primary (first named one when none is marked). */
export const kinFromDrafts = (
  drafts: KinDraft[]
): {
  nextOfKins: NextOfKin[] | undefined;
  nextOfKin: HREmployee['nextOfKin'];
} => {
  const rows = drafts.filter((d) => d.name.trim());
  if (!rows.length) return { nextOfKins: undefined, nextOfKin: undefined };
  const primaryAt = Math.max(
    0,
    rows.findIndex((d) => d.primary)
  );
  const list: NextOfKin[] = rows.map((d, i) => ({
    name: d.name.trim(),
    relationship: d.relationship.trim(),
    phone: d.phone.trim(),
    ...(d.email.trim() ? { email: d.email.trim() } : {}),
    ...(d.idNumber.trim() ? { idNumber: d.idNumber.trim() } : {}),
    ...(d.benefitPct.trim() ? { benefitPct: Number(d.benefitPct) } : {}),
    primary: i === primaryAt
  }));
  const p = list[primaryAt];
  return {
    nextOfKins: list,
    nextOfKin: { name: p.name, relationship: p.relationship, phone: p.phone }
  };
};

export const benefitTotal = (drafts: KinDraft[]) => drafts.filter((d) => d.name.trim()).reduce((s, d) => s + (Number(d.benefitPct) || 0), 0);

/** Errors keyed kin.{row}.{field}, plus kin.total for benefit shares. */
export const kinErrors = (drafts: KinDraft[]): Record<string, string> => {
  const e: Record<string, string> = {};
  drafts.forEach((d, i) => {
    if (!filled(d)) return;
    if (!d.name.trim()) e[`kin.${i}.name`] = 'Name the next of kin';
    if (!d.relationship.trim()) e[`kin.${i}.relationship`] = 'Relationship is required';
    if (!d.phone.trim()) e[`kin.${i}.phone`] = 'A phone number is required';
    else if (!PHONE_RE.test(d.phone.trim())) e[`kin.${i}.phone`] = 'Check the number';
    if (d.email.trim() && !EMAIL_RE.test(d.email.trim())) e[`kin.${i}.email`] = 'Enter a valid email';
    if (d.benefitPct.trim()) {
      const n = Number(d.benefitPct);
      if (!(n > 0 && n <= 100)) e[`kin.${i}.benefitPct`] = '1–100';
    }
  });
  const named = drafts.filter((d) => d.name.trim());
  const withShare = named.filter((d) => d.benefitPct.trim());
  if (withShare.length && Math.round(benefitTotal(drafts) * 100) / 100 !== 100) e['kin.total'] = `Benefit shares add up to ${benefitTotal(drafts)}% — they must total 100%`;
  const keys = named.map((d) => `${d.name.trim().toLowerCase()}|${d.phone.replace(/\D/g, '')}`);
  keys.forEach((k, i) => {
    if (keys.indexOf(k) !== i) e[`kin.${drafts.indexOf(named[i])}.name`] = 'Listed twice';
  });
  return e;
};

/** One line per person for change logs and the review step. */
export const kinSummary = (list: NextOfKin[]) =>
  list.map((k) => `${k.name} (${k.relationship || '—'}) ${k.phone}${k.benefitPct !== undefined ? ` ${k.benefitPct}%` : ''}${k.primary ? ' · primary' : ''}`).join('; ');
