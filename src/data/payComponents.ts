/**
 * Pay component catalogue. Each component says, independently, whether it counts towards PAYE, NSSF
 * pensionable pay, SHIF and the housing levy — one "taxable" switch is not enough (spec §18).
 */

export type ComponentCategory = 'earning' | 'benefit_in_kind' | 'reimbursement' | 'pretax' | 'deduction';
export type PayeTreatment = 'taxable' | 'exempt' | 'exempt_up_to_cap';

/** How a posted item's amount is worked out. 'fixed' takes the amount typed when posting. */
export interface PayCalc {
  method: 'fixed' | 'percent' | 'rate' | 'formula';
  /** percent: share of this base */
  base?: 'BASIC' | 'PENSIONABLE';
  percent?: number;
  /** rate: HOURLY or DAILY x multiplier x quantity */
  unit?: 'HOURLY' | 'DAILY';
  multiplier?: number;
  /** formula: see src/utils/formula.ts */
  expression?: string;
  /** What the quantity means when posting (hours, nights, units) */
  qtyLabel?: string;
}

export interface PayComponentType {
  id: string;
  name: string;
  category: ComponentCategory;
  /** recurring = stays on every payroll until its end period; one_off = consumed by the run it is posted to */
  recurrence: 'recurring' | 'one_off' | 'either';
  paye: PayeTreatment;
  payeExemptCap?: number;
  nssf: boolean;
  shif: boolean;
  ahl: boolean;
  isCash: boolean;
  /** Order in the voluntary deduction queue when the two-thirds cap bites (2 = first) */
  priority?: number;
  /** Feeds a relief or allowable deduction in the PAYE computation */
  taxEffect?: 'pension' | 'mortgage_interest' | 'pmf' | 'insurance';
  /** Set by the payroll engine, never posted by hand */
  system?: boolean;
  /** Why it is treated this way — shown on the payslip detail and the catalogue */
  note: string;
  calc?: PayCalc;
  status?: 'ACTIVE' | 'INACTIVE';
  /** Versioning: an edit creates a new version from a pay period; older payslips keep the old one */
  version?: number;
  effectiveFrom?: string;
  /** Created by the company rather than shipped with the system */
  custom?: boolean;
  changedBy?: string;
  changedOn?: string;
}

const E = (c: Omit<PayComponentType, 'category'>): PayComponentType => ({ ...c, category: 'earning' });
const D = (c: Omit<PayComponentType, 'category' | 'paye' | 'nssf' | 'shif' | 'ahl' | 'isCash'>): PayComponentType => ({
  ...c,
  category: 'deduction',
  paye: 'exempt',
  nssf: false,
  shif: false,
  ahl: false,
  isCash: true
});

const SEED: PayComponentType[] = [
  // Standing pay worked out by the engine
  E({ id: 'BASIC', name: 'Basic salary', recurrence: 'recurring', paye: 'taxable', nssf: true, shif: true, ahl: true, isCash: true, system: true, note: 'Contract salary; pro-rated on a 30-day month for joiners and leavers' }),
  E({ id: 'HOUSE', name: 'House allowance', recurrence: 'recurring', paye: 'taxable', nssf: true, shif: true, ahl: true, isCash: true, system: true, note: 'Regular cash allowance — pensionable' }),
  E({ id: 'TRANSPORT', name: 'Transport allowance', recurrence: 'recurring', paye: 'taxable', nssf: true, shif: true, ahl: true, isCash: true, system: true, note: 'Regular cash allowance — pensionable' }),
  E({ id: 'OVERTIME', name: 'Overtime', recurrence: 'either', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, system: true, note: '1.5× hourly rate; excluded from NSSF under company policy (irregular pay)' }),
  E({ id: 'WAGES', name: 'Daily wages', recurrence: 'recurring', paye: 'taxable', nssf: true, shif: true, ahl: true, isCash: true, system: true, note: 'Days worked × daily rate' }),

  // Earnings posted by payroll
  E({ id: 'ACTING', name: 'Acting allowance', recurrence: 'recurring', paye: 'taxable', nssf: true, shif: true, ahl: true, isCash: true, note: 'Regular while acting — pensionable', calc: { method: 'percent', base: 'BASIC', percent: 20 } }),
  E({ id: 'RESPONSIBILITY', name: 'Responsibility allowance', recurrence: 'recurring', paye: 'taxable', nssf: true, shif: true, ahl: true, isCash: true, note: 'Regular contractual allowance — pensionable' }),
  E({ id: 'OT_EXTRA', name: 'Overtime claim (approved)', recurrence: 'one_off', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, note: 'Approved overtime claim; excluded from NSSF under company policy', calc: { method: 'rate', unit: 'HOURLY', multiplier: 1.5, qtyLabel: 'Hours' } }),
  E({ id: 'HOLIDAY_OT', name: 'Public holiday overtime (2×)', recurrence: 'one_off', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, note: 'Rest day / public holiday at 2× hourly rate', calc: { method: 'rate', unit: 'HOURLY', multiplier: 2, qtyLabel: 'Hours' } }),
  E({ id: 'COMMISSION', name: 'Sales commission', recurrence: 'either', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, note: 'Performance-variable — excluded from NSSF under company policy' }),
  E({ id: 'BONUS', name: 'Performance bonus', recurrence: 'one_off', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, note: 'One-off — never pensionable' }),
  E({ id: 'SIGNON', name: 'Sign-on bonus', recurrence: 'one_off', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, note: 'One-off — never pensionable' }),
  E({ id: 'ARREARS', name: 'Salary arrears', recurrence: 'one_off', paye: 'taxable', nssf: true, shif: true, ahl: true, isCash: true, note: 'Back-pay of basic; taxed at this month’s bands under company policy' }),
  E({ id: 'LEAVE_ALLOWANCE', name: 'Leave allowance', recurrence: 'one_off', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, note: 'Paid with annual leave — excluded from NSSF under company policy', calc: { method: 'formula', expression: 'ROUND(MAX(BASIC * 10%, 5000), 500)' } }),
  E({ id: 'LEAVE_PAY', name: 'Leave pay on exit', recurrence: 'one_off', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, note: 'Untaken leave × gross ÷ 30 — terminal, excluded from NSSF' }),
  E({ id: 'NOTICE_PAY', name: 'Pay in lieu of notice', recurrence: 'one_off', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, note: 'Employer ended the contract without notice — terminal, excluded from NSSF' }),
  E({ id: 'SEVERANCE', name: 'Statutory severance', recurrence: 'one_off', paye: 'exempt', nssf: false, shif: false, ahl: false, isCash: true, note: '15 days’ pay per completed year (Employment Act s.40) — tax-exempt up to the statutory amount' }),
  E({ id: 'GRATUITY', name: 'Gratuity (paid directly)', recurrence: 'one_off', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, note: 'Not paid into a registered scheme, so taxable when paid' }),
  E({ id: 'PER_DIEM', name: 'Per diem (within limits)', recurrence: 'one_off', paye: 'exempt', nssf: false, shif: false, ahl: false, isCash: true, note: 'Official travel at the approved rate — not income', calc: { method: 'formula', expression: 'QTY * 3000', qtyLabel: 'Nights' } }),
  E({ id: 'PER_DIEM_EXCESS', name: 'Per diem above limits', recurrence: 'one_off', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, note: 'Excess over the approved rate is taxable' }),
  // Company-defined items (demo): created in Pay item setup
  E({ id: 'NIGHT_SHIFT', name: 'Night shift allowance', recurrence: 'either', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, custom: true, note: 'KES 450 a night worked — variable, so outside NSSF', calc: { method: 'formula', expression: 'QTY * 450', qtyLabel: 'Nights' } }),
  E({ id: 'HARDSHIP', name: 'Hardship allowance', recurrence: 'recurring', paye: 'taxable', nssf: true, shif: true, ahl: true, isCash: true, custom: true, note: 'Remote estates — 10% of basic, regular so pensionable', calc: { method: 'percent', base: 'BASIC', percent: 10 } }),
  E({ id: 'LONG_SERVICE', name: 'Long-service award', recurrence: 'one_off', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, custom: true, note: 'KES 1,000 per completed year, up to 15 years', calc: { method: 'formula', expression: 'MIN(YEARS, 15) * 1000' } }),
  { id: 'REIMBURSEMENT', name: 'Expense reimbursement', category: 'reimbursement', recurrence: 'one_off', paye: 'exempt', nssf: false, shif: false, ahl: false, isCash: true, note: 'Receipted business expense — not income at all' },
  { id: 'WELFARE_BENEFIT', name: 'Staff welfare benefit', category: 'reimbursement', recurrence: 'one_off', paye: 'exempt', nssf: false, shif: false, ahl: false, isCash: true, note: 'Paid from the staff welfare fund (bereavement, wedding, hospital) — not employment income' },

  // Non-cash benefits — taxed, never paid out
  { id: 'HOUSING_BIK', name: 'Housing benefit (company house)', category: 'benefit_in_kind', recurrence: 'recurring', paye: 'taxable', nssf: false, shif: false, ahl: false, isCash: false, note: 'Higher of 15% of other taxable pay, market rent or rent paid; non-cash, so no NSSF/SHIF/AHL' },
  { id: 'CAR_BIK', name: 'Car benefit', category: 'benefit_in_kind', recurrence: 'recurring', paye: 'taxable', nssf: false, shif: false, ahl: false, isCash: false, note: '2% of the car’s cost per month; non-cash' },
  { id: 'UTILITIES_BIK', name: 'Utilities paid by employer', category: 'benefit_in_kind', recurrence: 'recurring', paye: 'taxable', nssf: false, shif: false, ahl: false, isCash: false, note: 'Full cost is a taxable benefit' },
  { id: 'MEALS', name: 'Staff canteen meals', category: 'benefit_in_kind', recurrence: 'recurring', paye: 'exempt_up_to_cap', payeExemptCap: 5_000, nssf: false, shif: false, ahl: false, isCash: false, note: 'Tax-free up to KES 5,000 a month; the excess is taxable' },
  { id: 'LOAN_BIK', name: 'Low-interest loan benefit', category: 'benefit_in_kind', recurrence: 'recurring', paye: 'taxable', nssf: false, shif: false, ahl: false, isCash: false, system: true, note: 'Balance × (KRA prescribed rate − rate charged) ÷ 12' },

  // Deducted before PAYE
  { id: 'PENSION', name: 'Pension contribution (registered scheme)', category: 'pretax', recurrence: 'recurring', paye: 'exempt', nssf: false, shif: false, ahl: false, isCash: true, taxEffect: 'pension', note: 'Deductible up to 30% of pensionable pay or KES 30,000 a month' },
  { id: 'PMF', name: 'Post-retirement medical fund', category: 'pretax', recurrence: 'recurring', paye: 'exempt', nssf: false, shif: false, ahl: false, isCash: true, taxEffect: 'pmf', note: '15% relief on contributions, capped at KES 5,000 a month' },
  { id: 'MORTGAGE_INTEREST', name: 'Mortgage interest (owner-occupied)', category: 'pretax', recurrence: 'recurring', paye: 'exempt', nssf: false, shif: false, ahl: false, isCash: false, taxEffect: 'mortgage_interest', note: 'Interest paid to a registered lender — reduces taxable pay up to KES 30,000 a month; not deducted from pay' },

  // Voluntary deductions, in the order the two-thirds cap applies them
  D({ id: 'COURT_ORDER', name: 'Court / garnishee order', recurrence: 'either', priority: 2, note: 'Legally mandated — first after statutory deductions' }),
  D({ id: 'HELB', name: 'HELB loan recovery', recurrence: 'recurring', priority: 3, note: 'Compulsory once HELB serves a recovery notice' }),
  D({ id: 'SALARY_ADVANCE', name: 'Salary advance', recurrence: 'one_off', priority: 4, note: 'Recovered from the next payroll' }),
  D({ id: 'STAFF_LOAN', name: 'Staff loan', recurrence: 'recurring', priority: 4, note: 'Employer loan — instalments until cleared' }),
  D({ id: 'SACCO_LOAN', name: 'SACCO loan', recurrence: 'recurring', priority: 5, note: 'Check-off for the SACCO' }),
  D({ id: 'BANK_CHECKOFF', name: 'Bank loan check-off', recurrence: 'recurring', priority: 5, note: 'Check-off for a bank' }),
  D({ id: 'SACCO_SHARES', name: 'SACCO contribution', recurrence: 'recurring', priority: 5, note: 'Monthly share / deposit contribution' }),
  D({ id: 'INSURANCE', name: 'Insurance premium', recurrence: 'recurring', priority: 6, taxEffect: 'insurance', note: 'Life / education policy — 15% insurance relief up to KES 5,000 a month' }),
  D({ id: 'UNION_DUES', name: 'Union dues', recurrence: 'recurring', priority: 6, note: 'Standing check-off for the union' }),
  D({ id: 'WELFARE', name: 'Staff welfare fund', recurrence: 'recurring', priority: 6, note: 'Standing welfare contribution' }),
  D({ id: 'OTHER_DEDUCTION', name: 'Other deduction', recurrence: 'either', priority: 6, note: 'Any other agreed deduction' })
];

/** Shipped catalogue, version 1 from January 2025. */
export const PAY_COMPONENTS: PayComponentType[] = SEED.map((c) => ({ status: 'ACTIVE', version: 1, effectiveFrom: '2025-01', calc: { method: 'fixed' }, ...c }));

let registry: PayComponentType[] = PAY_COMPONENTS;
/** Keeps lookups in step with the catalogue held in app state (all versions). */
export const setComponentRegistry = (list: PayComponentType[]) => {
  registry = list;
};

const UNKNOWN = (id: string): PayComponentType => ({ id, name: id, category: 'earning', recurrence: 'one_off', paye: 'taxable', nssf: false, shif: true, ahl: true, isCash: true, note: '' });

/** The version of a pay item in force for a pay period ('YYYY-MM'); the latest version when no period is given. */
export const componentAt = (id: string, period?: string, list: PayComponentType[] = registry): PayComponentType => {
  const versions = list.filter((c) => c.id === id).sort((a, b) => (b.effectiveFrom ?? '').localeCompare(a.effectiveFrom ?? '') || (b.version ?? 0) - (a.version ?? 0));
  return (period ? versions.find((v) => (v.effectiveFrom ?? '') <= period) : versions[0]) ?? versions[versions.length - 1] ?? UNKNOWN(id);
};

export const componentById = (id: string) => componentAt(id);

/** One row per pay item: its latest version. */
export const currentComponents = (list: PayComponentType[] = registry) => [...new Set(list.map((c) => c.id))].map((id) => componentAt(id, undefined, list));

/** Loans are set up under Loans & Advances, not posted as items. */
export const LOAN_COMPONENTS = ['STAFF_LOAN', 'SALARY_ADVANCE', 'SACCO_LOAN', 'BANK_CHECKOFF', 'HELB'];

export const CATEGORY_LABEL: Record<ComponentCategory, string> = {
  earning: 'Earnings',
  benefit_in_kind: 'Non-cash benefits',
  reimbursement: 'Reimbursements',
  pretax: 'Before-tax deductions',
  deduction: 'Deductions after tax'
};
