import { computeStatutory } from './statutory';

/** Monthly PAYE bands (KES). The last band is the highest rate. */
export const PAYE_BANDS: { upTo: number; rate: number }[] = [
  { upTo: 24000, rate: 0.1 },
  { upTo: 32333, rate: 0.25 },
  { upTo: 500000, rate: 0.3 },
  { upTo: 800000, rate: 0.325 },
  { upTo: Infinity, rate: 0.35 }
];
export const HIGHEST_TAX_RATE = PAYE_BANDS[PAYE_BANDS.length - 1].rate;
export const PERSONAL_RELIEF = 2400;
export const DEFAULT_PWD_EXEMPT_AMOUNT = 150000;
export const DEFAULT_RETIREMENT_AGE = 60;

export type TaxEmployment = 'PRIMARY' | 'SECONDARY';

export interface TaxProfile {
  employment: TaxEmployment;
  /** Person with disability holding a valid exemption certificate */
  pwdExempt: boolean;
  pwdCertificateNo?: string;
  pwdCertificateExpiry?: string;
  /** Monthly income exempt from tax for the PWD exemption */
  pwdExemptAmount?: number;
  /** Pay without deducting any PAYE */
  taxExempt: boolean;
  taxExemptReason?: string;
}

export interface PayeBreakdown {
  gross: number;
  nssf: number;
  shif: number;
  ahl: number;
  taxable: number;
  exemptIncome: number;
  chargeable: number;
  taxCharged: number;
  relief: number;
  paye: number;
  method: 'BANDS' | 'HIGHEST_RATE' | 'ZERO';
  note: string;
}

/** PAYE for one month, honouring secondary employment, the PWD exemption and zero-tax status. */
export const calculatePaye = (gross: number, profile: TaxProfile, date?: string): PayeBreakdown => {
  const r = computeStatutory({ cashGross: gross, profile, date });
  return {
    gross,
    nssf: r.nssfEe,
    shif: r.shif,
    ahl: r.ahlEe,
    taxable: Math.round(r.taxablePay),
    exemptIncome: Math.round(r.pwdExempt),
    chargeable: Math.round(r.chargeable),
    taxCharged: Math.round(r.grossTax),
    relief: Math.round(r.personalRelief + r.housingRelief + r.insuranceRelief + r.pmfRelief),
    paye: r.paye,
    method: r.method,
    note: r.note
  };
};

/** Date the employee reaches retirement age (ISO), or '' if date of birth is unknown. */
export const retirementDate = (dateOfBirth: string, retirementAge: number) => {
  if (!dateOfBirth || !retirementAge) return '';
  const d = new Date(dateOfBirth + 'T00:00:00');
  d.setFullYear(d.getFullYear() + retirementAge);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
