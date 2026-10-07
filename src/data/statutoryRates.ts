/**
 * Kenyan statutory rates as dated tables. Every payslip is computed with the table in force on its pay date,
 * so reprints of old months use the old rates. New rates are added as a new version with an effective date;
 * existing versions are never edited.
 */

export interface PayeBand {
  upTo: number;
  rate: number;
}

export interface StatutoryRateTable {
  id: string;
  label: string;
  effectiveFrom: string;
  effectiveTo?: string;
  source: string;
  nssf: { lel: number; uel: number; rate: number };
  shif: { rate: number; floor: number };
  ahl: { rate: number };
  paye: {
    bands: PayeBand[];
    personalRelief: number;
    insuranceRelief: { rate: number; cap: number };
    housingRelief: { rate: number; cap: number };
    pmfRelief: { rate: number; cap: number };
    pwdExemptMonthly: number;
    secondaryRate: number;
  };
  pensionCap: { rate: number; max: number };
  mortgageInterestCap: number;
  /** Employer-only NITA levy per employee per month */
  nita: number;
  /** Share of net pay after statutory deductions that voluntary deductions may take (Employment Act s.19) */
  deductionCap: number;
  /** KRA prescribed market rate for low-interest employer loans (per year) */
  prescribedLoanRate: number;
}

const BANDS_2023: PayeBand[] = [
  { upTo: 24_000, rate: 0.1 },
  { upTo: 32_333, rate: 0.25 },
  { upTo: 500_000, rate: 0.3 },
  { upTo: 800_000, rate: 0.325 },
  { upTo: Infinity, rate: 0.35 }
];

const common = {
  shif: { rate: 0.0275, floor: 300 },
  ahl: { rate: 0.015 },
  pensionCap: { rate: 0.3, max: 30_000 },
  mortgageInterestCap: 30_000,
  nita: 50,
  deductionCap: 0.667
};

const payeCommon = {
  bands: BANDS_2023,
  personalRelief: 2_400,
  insuranceRelief: { rate: 0.15, cap: 5_000 },
  // No housing relief: since Dec 2024 the housing levy is deducted before PAYE instead (kept at 0 so a gazette can restore it)
  housingRelief: { rate: 0, cap: 0 },
  pmfRelief: { rate: 0.15, cap: 5_000 },
  pwdExemptMonthly: 150_000,
  secondaryRate: 0.35
};

export const SEED_RATE_TABLES: StatutoryRateTable[] = [
  {
    id: 'KE-2025-01',
    label: 'NSSF year 2 limits',
    effectiveFrom: '2025-01-01',
    effectiveTo: '2025-01-31',
    source: 'NSSF Act 2013 phase-in (Feb 2024); SHIF from Oct 2024; Tax Laws (Amendment) Act 2024',
    nssf: { lel: 7_000, uel: 36_000, rate: 0.06 },
    ...common,
    paye: payeCommon,
    prescribedLoanRate: 0.13
  },
  {
    id: 'KE-2025-02',
    label: 'NSSF year 3 limits',
    effectiveFrom: '2025-02-01',
    effectiveTo: '2026-01-31',
    source: 'NSSF year 3 contribution notice, February 2025',
    nssf: { lel: 8_000, uel: 72_000, rate: 0.06 },
    ...common,
    paye: payeCommon,
    prescribedLoanRate: 0.13
  },
  {
    id: 'KE-2026-02',
    label: 'NSSF year 4 limits',
    effectiveFrom: '2026-02-01',
    source: 'NSSF year 4 contribution notice, February 2026; KRA PAYE bands; SHA; Affordable Housing Act 2024',
    nssf: { lel: 9_000, uel: 108_000, rate: 0.06 },
    ...common,
    paye: payeCommon,
    prescribedLoanRate: 0.13
  }
];

let tables: StatutoryRateTable[] = [...SEED_RATE_TABLES];

export const rateTables = () => tables;

/** The table in force on a date (ISO). */
export const ratesOn = (date: string): StatutoryRateTable => {
  const sorted = [...tables].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return sorted.find((t) => t.effectiveFrom <= date) ?? sorted[sorted.length - 1];
};

/** Adds a new version from its effective date and closes the one before it. Past versions are left as they were. */
export const addRateTable = (t: StatutoryRateTable) => {
  const prev = ratesOn(t.effectiveFrom);
  const dayBefore = new Date(t.effectiveFrom + 'T00:00:00');
  dayBefore.setDate(dayBefore.getDate() - 1);
  const close = `${dayBefore.getFullYear()}-${String(dayBefore.getMonth() + 1).padStart(2, '0')}-${String(dayBefore.getDate()).padStart(2, '0')}`;
  tables = [...tables.map((x) => (x.id === prev.id && (!x.effectiveTo || x.effectiveTo >= t.effectiveFrom) ? { ...x, effectiveTo: close } : x)), t];
  return tables;
};

/**
 * Sets values from a start date: replaces the version that already starts on that date, otherwise adds a
 * new one (closing the version before it). Used for changes that start with the open payroll period.
 */
export const setRatesFrom = (effectiveFrom: string, patch: (t: StatutoryRateTable) => StatutoryRateTable) => {
  const same = tables.find((t) => t.effectiveFrom === effectiveFrom);
  if (same) {
    tables = tables.map((t) => (t === same ? patch(t) : t));
    return same.id;
  }
  const base = ratesOn(effectiveFrom);
  const next = patch({ ...base, id: `KE-${effectiveFrom.slice(0, 7)}`, effectiveFrom, effectiveTo: undefined });
  addRateTable(next);
  return next.id;
};

/**
 * Company payroll policy for the grey areas the regulations leave open. These are employer choices,
 * recorded with the date they were adopted so the payslip can explain them.
 */
export interface PayrollPolicy {
  overtimePensionable: boolean;
  benefitsInKindAttractAhl: boolean;
  /** Fixed 30-day month for pro-rating, notice pay, leave pay and severance */
  dayDivisor: number;
  arrearsTaxation: 'current_period_bands' | 'recompute_historical';
  /** Recover loans in full from final dues, outside the two-thirds cap */
  recoverLoansOnExit: boolean;
  adoptedOn: string;
  approvedBy: string;
}

export const PAYROLL_POLICY: PayrollPolicy = {
  overtimePensionable: false,
  benefitsInKindAttractAhl: false,
  dayDivisor: 30,
  arrearsTaxation: 'current_period_bands',
  recoverLoansOnExit: true,
  adoptedOn: '2026-02-01',
  approvedBy: 'Amina Hassan, Finance Director'
};
