/* Kenyan statutory deductions: NSSF (tiers I and II), SHIF, housing levy and PAYE, using the dated rate tables. */
import { ratesOn, type StatutoryRateTable } from '../data/statutoryRates';
import type { TaxProfile } from './tax';

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface StatutoryInputs {
  /** Pay date (ISO) — picks the rate table */
  date?: string;
  /** Cash gross pay (what the employee is paid before deductions) */
  cashGross: number;
  /** NSSF pensionable pay; defaults to cash gross */
  nssfBase?: number;
  shifBase?: number;
  ahlBase?: number;
  /** Non-cash taxable benefits (housing, car, loan interest) — taxed but never paid out */
  benefitsInKind?: number;
  /** Cash pay that is exempt from PAYE (per diem within limits, statutory severance) */
  exemptCash?: number;
  /** Employee contribution to a registered pension scheme */
  pension?: number;
  /** Owner-occupied mortgage interest paid this month */
  mortgageInterest?: number;
  /** Post-retirement medical fund contribution */
  pmf?: number;
  /** Life / education / health insurance premiums */
  insurancePremium?: number;
  profile?: TaxProfile;
}

export interface BandLine {
  band: number;
  from: number;
  to: number;
  amount: number;
  rate: number;
  tax: number;
}

export interface StatutoryResult {
  rateTable: StatutoryRateTable;
  cashGross: number;
  nssfBase: number;
  nssfTierI: number;
  nssfTierII: number;
  nssfEe: number;
  nssfEr: number;
  shif: number;
  ahlEe: number;
  ahlEr: number;
  pensionAllowed: number;
  mortgageAllowed: number;
  /** Gross + benefits − exempt − NSSF − SHIF − AHL − pension − mortgage interest */
  taxablePay: number;
  pwdExempt: number;
  chargeable: number;
  bandLines: BandLine[];
  grossTax: number;
  personalRelief: number;
  housingRelief: number;
  insuranceRelief: number;
  pmfRelief: number;
  paye: number;
  method: 'BANDS' | 'HIGHEST_RATE' | 'ZERO';
  note: string;
  nita: number;
}

const DEFAULT_PROFILE: TaxProfile = { employment: 'PRIMARY', pwdExempt: false, taxExempt: false };

/** The full statutory computation, in the order KRA expects (gross → NSSF/SHIF/AHL → taxable → bands → reliefs). */
export const computeStatutory = (i: StatutoryInputs): StatutoryResult => {
  const t = ratesOn(i.date ?? localDay());
  const profile = i.profile ?? DEFAULT_PROFILE;
  const cashGross = i.cashGross;

  // NSSF on pensionable pay, capped at the upper earnings limit
  const pensionable = Math.min(Math.max(0, i.nssfBase ?? cashGross), t.nssf.uel);
  const nssfTierI = Math.round(Math.min(pensionable, t.nssf.lel) * t.nssf.rate);
  const nssfTierII = Math.round(Math.max(0, pensionable - t.nssf.lel) * t.nssf.rate);
  const nssfEe = nssfTierI + nssfTierII;

  const shifBase = i.shifBase ?? cashGross;
  const shif = shifBase > 0 ? Math.max(t.shif.floor, Math.round(shifBase * t.shif.rate)) : 0;
  const ahlEe = Math.round((i.ahlBase ?? cashGross) * t.ahl.rate);

  const pensionAllowed = Math.round(Math.min(i.pension ?? 0, (i.nssfBase ?? cashGross) * t.pensionCap.rate, t.pensionCap.max));
  const mortgageAllowed = Math.min(i.mortgageInterest ?? 0, t.mortgageInterestCap);

  const taxablePay = Math.max(
    0,
    cashGross + (i.benefitsInKind ?? 0) - (i.exemptCash ?? 0) - nssfEe - shif - ahlEe - pensionAllowed - mortgageAllowed
  );

  const base = {
    rateTable: t,
    cashGross,
    nssfBase: pensionable,
    nssfTierI,
    nssfTierII,
    nssfEe,
    nssfEr: nssfEe,
    shif,
    ahlEe,
    ahlEr: ahlEe,
    pensionAllowed,
    mortgageAllowed,
    taxablePay,
    nita: t.nita
  };
  const noRelief = { personalRelief: 0, housingRelief: 0, insuranceRelief: 0, pmfRelief: 0 };

  if (profile.taxExempt) {
    return { ...base, ...noRelief, pwdExempt: 0, chargeable: 0, bandLines: [], grossTax: 0, paye: 0, method: 'ZERO', note: profile.taxExemptReason ? `Tax exempt — ${profile.taxExemptReason}` : 'Tax exempt — no PAYE deducted' };
  }

  // PWD exemption comes off taxable pay before the bands (not a relief on tax)
  const pwdExempt = profile.pwdExempt ? Math.min(taxablePay, profile.pwdExemptAmount ?? t.paye.pwdExemptMonthly) : 0;
  const chargeable = taxablePay - pwdExempt;

  if (profile.employment === 'SECONDARY') {
    const grossTax = chargeable * t.paye.secondaryRate;
    return {
      ...base,
      ...noRelief,
      pwdExempt,
      chargeable,
      bandLines: [{ band: 0, from: 0, to: chargeable, amount: chargeable, rate: t.paye.secondaryRate, tax: grossTax }],
      grossTax,
      paye: Math.round(grossTax),
      method: 'HIGHEST_RATE',
      note: `Secondary employment — flat ${t.paye.secondaryRate * 100}% with no reliefs (claimed at the primary employer)`
    };
  }

  const bandLines: BandLine[] = [];
  let lower = 0;
  t.paye.bands.forEach((b, k) => {
    if (chargeable <= lower) return;
    const amount = Math.min(chargeable, b.upTo) - lower;
    bandLines.push({ band: k + 1, from: lower, to: Math.min(chargeable, b.upTo), amount, rate: b.rate, tax: amount * b.rate });
    lower = b.upTo;
  });
  const grossTax = bandLines.reduce((s, l) => s + l.tax, 0);
  const personalRelief = t.paye.personalRelief;
  const housingRelief = Math.min(ahlEe * t.paye.housingRelief.rate, t.paye.housingRelief.cap);
  const insuranceRelief = Math.min((i.insurancePremium ?? 0) * t.paye.insuranceRelief.rate, t.paye.insuranceRelief.cap);
  const pmfRelief = Math.min((i.pmf ?? 0) * t.paye.pmfRelief.rate, t.paye.pmfRelief.cap);
  const paye = Math.max(0, Math.round(grossTax - personalRelief - housingRelief - insuranceRelief - pmfRelief));

  return {
    ...base,
    personalRelief,
    housingRelief,
    insuranceRelief,
    pmfRelief,
    pwdExempt,
    chargeable,
    bandLines,
    grossTax,
    paye,
    method: 'BANDS',
    note: profile.pwdExempt
      ? `PWD exemption — first KES ${(profile.pwdExemptAmount ?? t.paye.pwdExemptMonthly).toLocaleString()} of taxable pay is exempt`
      : 'Graduated PAYE bands less personal relief'
  };
};

/** Simple form for a single gross figure (simulator, wizard previews). */
export const calculateKenyanStatutory = (grossSalary: number, date?: string) => {
  const r = computeStatutory({ cashGross: grossSalary, date });
  const totalDeductions = r.nssfEe + r.shif + r.ahlEe + r.paye;
  return {
    grossSalary,
    nssfTierI: r.nssfTierI,
    nssfTierII: r.nssfTierII,
    nssfTotalEe: r.nssfEe,
    nssfTotalEr: r.nssfEr,
    shif: r.shif,
    ahlEe: r.ahlEe,
    ahlEr: r.ahlEr,
    taxableIncome: Math.round(r.taxablePay),
    payeGross: Math.round(r.grossTax),
    personalRelief: r.personalRelief,
    housingRelief: Math.round(r.housingRelief),
    payeNet: r.paye,
    totalDeductions,
    netPay: Math.round(grossSalary - totalDeductions),
    nssfLel: r.rateTable.nssf.lel,
    nssfUel: r.rateTable.nssf.uel,
    rateTableId: r.rateTable.id
  };
};
