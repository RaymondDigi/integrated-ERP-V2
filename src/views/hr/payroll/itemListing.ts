import { componentById } from '../../../data/payComponents';
import { kes, type Row } from './reports';

/**
 * Any line that can appear on a payslip — a pay item or a statutory deduction — with the employee's
 * amount and, where the employer also pays (NSSF, housing levy, NITA), the employer's amount.
 */
export type ItemGroup = 'Earnings' | 'Non-cash benefits' | 'Before-tax deductions' | 'Deductions & loans' | 'Statutory';
export interface ItemDef {
  id: string;
  name: string;
  group: ItemGroup;
}
export interface ItemValue {
  ee: number;
  er: number;
  ref: string;
}

export const STATUTORY_ITEMS: ItemDef[] = [
  { id: 'STAT_PAYE', name: 'PAYE', group: 'Statutory' },
  { id: 'STAT_NSSF', name: 'NSSF (employee and employer)', group: 'Statutory' },
  { id: 'STAT_SHIF', name: 'SHIF', group: 'Statutory' },
  { id: 'STAT_AHL', name: 'Housing levy (employee and employer)', group: 'Statutory' },
  { id: 'STAT_NITA', name: 'NITA levy (employer)', group: 'Statutory' }
];

const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter(Boolean))].join('; ');

/** The employee's amount (and employer's, if any) for one item on one payslip, or null if they don't have it. */
export const itemValue = (r: Row, id: string): ItemValue | null => {
  const p = r.p;
  switch (id) {
    case 'STAT_PAYE':
      return { ee: p.paye, er: 0, ref: `Taxable pay KES ${kes(p.tax.taxablePay)}` };
    case 'STAT_NSSF':
      return { ee: p.nssf, er: p.employerNssf, ref: `Pensionable KES ${kes(p.tax.nssfBase)} (Tier I ${kes(p.tax.nssfTierI)}, Tier II ${kes(p.tax.nssfTierII)})` };
    case 'STAT_SHIF':
      return { ee: p.shif, er: 0, ref: `2.75% of KES ${kes(p.shifBase)}` };
    case 'STAT_AHL':
      return { ee: p.ahl, er: p.employerAhl, ref: `1.5% + 1.5% of KES ${kes(p.ahlBase)}` };
    case 'STAT_NITA':
      return { ee: 0, er: p.nita, ref: 'Per employee per month' };
  }
  const lines = [...p.earnings, ...p.benefits, ...p.pretax].filter((l) => l.componentId === id);
  if (lines.length) return { ee: lines.reduce((s, l) => s + l.amount, 0), er: 0, ref: uniq(lines.map((l) => l.ref)) };
  const ded = p.deductions.filter((d) => d.componentId === id && (d.deducted || d.deferred));
  if (ded.length)
    return {
      ee: ded.reduce((s, d) => s + d.deducted, 0),
      er: 0,
      ref: uniq(
        ded.map((d) =>
          [d.ref !== 'Standing deduction' ? d.ref : '', d.balanceAfter !== undefined ? `balance after KES ${kes(d.balanceAfter)}` : '', d.deferred ? `KES ${kes(d.deferred)} deferred` : '']
            .filter(Boolean)
            .join(', ')
        )
      )
    };
  return null;
};

/** Every item present in a set of payslips, grouped for a picker. */
export const itemCatalog = (rows: Row[]): ItemDef[] => {
  const seen = new Map<string, ItemDef>();
  const add = (id: string, group: ItemGroup) => !seen.has(id) && seen.set(id, { id, name: componentById(id).name, group });
  for (const { p } of rows) {
    p.earnings.forEach((l) => add(l.componentId, 'Earnings'));
    p.benefits.forEach((l) => add(l.componentId, 'Non-cash benefits'));
    p.pretax.forEach((l) => add(l.componentId, 'Before-tax deductions'));
    p.deductions.filter((d) => d.deducted || d.deferred).forEach((d) => add(d.componentId, 'Deductions & loans'));
  }
  return [...[...seen.values()].sort((a, b) => a.name.localeCompare(b.name)), ...STATUTORY_ITEMS];
};

export const itemName = (id: string) => STATUTORY_ITEMS.find((s) => s.id === id)?.name ?? componentById(id).name;
