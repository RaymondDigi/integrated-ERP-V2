/**
 * Payroll items posted against an employee for a pay period, and staff loans recovered through payroll.
 * Periods are 'YYYY-MM'. Recurring items run from `period` to `endPeriod` (open-ended if blank);
 * one-off items apply to their period only and are consumed when that period's payroll is posted.
 */

export interface PayItem {
  id: string;
  orgId: string;
  staffId: string;
  componentId: string;
  /** Typed amount, or the amount the formula gave when posted (shown for reference) */
  amount: number;
  /** Worked out by the pay item's formula each payroll (so it follows salary changes) */
  auto?: boolean;
  /** Hours, nights, units… for rate and formula items */
  quantity?: number;
  period: string;
  recurring: boolean;
  endPeriod?: string;
  reference: string;
  note?: string;
  source: 'Manual' | 'Bulk' | 'Import' | 'Leave' | 'Separation';
  postedBy: string;
  postedOn: string;
  status: 'ACTIVE' | 'CANCELLED';
  cancelledBy?: string;
}

export type LoanType = 'SALARY_ADVANCE' | 'STAFF_LOAN' | 'SACCO_LOAN' | 'HELB' | 'BANK_CHECKOFF' | 'COURT_ORDER';

export interface StaffLoan {
  id: string;
  orgId: string;
  staffId: string;
  type: LoanType;
  lender: string;
  principal: number;
  /** Annual interest rate (0.06 = 6%) */
  ratePa: number;
  method: 'none' | 'flat' | 'reducing';
  termMonths: number;
  installment: number;
  startPeriod: string;
  disbursedOn: string;
  reference: string;
  status: 'ACTIVE' | 'SUSPENDED';
  /** Suspension applies from this period on; earlier payslips are unchanged */
  suspendedFrom?: string;
  note?: string;
}

export const LOAN_TYPE_LABEL: Record<LoanType, string> = {
  SALARY_ADVANCE: 'Salary advance',
  STAFF_LOAN: 'Staff loan',
  SACCO_LOAN: 'SACCO loan',
  HELB: 'HELB recovery',
  BANK_CHECKOFF: 'Bank check-off',
  COURT_ORDER: 'Court order'
};

/** Employer-funded loans — the only ones that can create a low-interest benefit. */
export const EMPLOYER_LOANS: LoanType[] = ['STAFF_LOAN', 'SALARY_ADVANCE'];

/** Instalment from any two of principal, rate and term (spec §11.3). */
export const loanInstallment = (principal: number, ratePa: number, method: StaffLoan['method'], termMonths: number) => {
  if (termMonths <= 0) return principal;
  if (method === 'flat') return Math.round((principal * (1 + ratePa * (termMonths / 12))) / termMonths);
  if (method === 'reducing' && ratePa > 0) {
    const r = ratePa / 12;
    return Math.round((principal * r) / (1 - Math.pow(1 + r, -termMonths)));
  }
  return Math.round(principal / termMonths);
};

/** Amount owed at the start when interest is charged up front (flat) or not at all. */
export const loanStartingBalance = (l: Pick<StaffLoan, 'principal' | 'ratePa' | 'method' | 'termMonths'>) =>
  l.method === 'flat' ? Math.round(l.principal * (1 + l.ratePa * (l.termMonths / 12))) : l.principal;

/* Demo dates follow the calendar: the open period is the month after the last payday (the 25th). */
const NOW = new Date();
const OPEN = new Date(NOW.getFullYear(), NOW.getMonth() + (NOW.getDate() >= 25 ? 1 : 0), 1);
const rel = (months: number) => {
  const d = new Date(OPEN.getFullYear(), OPEN.getMonth() + months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
/** A posting date in a period, never later than today. */
const postedIn = (period: string, day: number) => {
  const t = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-${String(NOW.getDate()).padStart(2, '0')}`;
  const d = `${period}-${String(day).padStart(2, '0')}`;
  return d > t ? t : d;
};

const by = 'Rose Chepkoech';
const item = (
  id: string,
  staffId: string,
  componentId: string,
  amount: number,
  period: string,
  reference: string,
  extra: Partial<PayItem> = {}
): PayItem => ({
  id,
  orgId: 'org-kericho',
  staffId,
  componentId,
  amount,
  period,
  recurring: false,
  reference,
  source: 'Manual',
  postedBy: by,
  postedOn: postedIn(period, 3 + (Number(id.slice(-2)) % 6)),
  status: 'ACTIVE',
  ...extra
});

/** Demo items: standing pre-tax contributions and benefits, last quarter's bonuses, and this month's inputs. */
export const SEED_PAY_ITEMS: PayItem[] = [
  // Standing items
  item('PI-0001', 'KHE-0120', 'PENSION', 20_000, '2025-01', 'Kericho Staff Pension Scheme — member 0120', { recurring: true, postedOn: '2025-01-12' }),
  item('PI-0002', 'KHE-0134', 'PENSION', 12_000, '2025-01', 'Kericho Staff Pension Scheme — member 0134', { recurring: true, postedOn: '2025-01-12' }),
  item('PI-0003', 'KHE-0178', 'PENSION', 10_000, '2025-03', 'Kericho Staff Pension Scheme — member 0178', { recurring: true, postedOn: '2025-03-10' }),
  item('PI-0004', 'KHE-0134', 'PMF', 3_000, '2025-06', 'AAR post-retirement medical fund', { recurring: true, postedOn: '2025-06-11' }),
  item('PI-0005', 'KHE-0120', 'MORTGAGE_INTEREST', 28_000, '2025-01', 'HFC mortgage — interest certificate 2026', { recurring: true, postedOn: '2025-01-12' }),
  item('PI-0006', 'KHE-0120', 'CAR_BIK', 70_000, '2026-01', 'Company car KDK 412Y — 2% of KES 3.5M cost', { recurring: true, postedOn: '2026-01-14' }),
  item('PI-0007', 'KHE-0160', 'HOUSING_BIK', 22_000, '2025-07', 'Estate manager’s house, Block A — market rent', { recurring: true, postedOn: '2025-07-09' }),
  item('PI-0008', 'KHE-0187', 'INSURANCE', 4_000, '2025-09', 'Britam education policy EP-77812', { recurring: true, postedOn: '2025-09-15' }),
  item('PI-0009', 'KHE-0263', 'UNION_DUES', 350, '2025-01', 'KPAWU check-off', { recurring: true, postedOn: '2025-01-12' }),
  item('PI-0010', 'KHE-0301', 'UNION_DUES', 350, '2025-01', 'KPAWU check-off', { recurring: true, postedOn: '2025-01-12' }),
  item('PI-0011', 'KHE-0302', 'UNION_DUES', 350, '2025-01', 'KPAWU check-off', { recurring: true, postedOn: '2025-01-12' }),
  item('PI-0012', 'KHE-0303', 'UNION_DUES', 350, '2025-01', 'KPAWU check-off', { recurring: true, postedOn: '2025-01-12' }),
  item('PI-0013', 'KHE-0270', 'MEALS', 6_500, '2026-03', 'Factory canteen — night shift', { recurring: true, postedOn: '2026-03-09' }),
  item('PI-0014', 'KHE-0160', 'ACTING', 25_000, rel(-1), 'Acting General Manager — board minute 14/2026', { recurring: true, endPeriod: rel(2), postedOn: postedIn(rel(-1), 8) }),
  item('PI-0015', 'KHE-0152', 'RESPONSIBILITY', 10_000, '2026-01', 'Key accounts portfolio', { recurring: true, postedOn: '2026-01-14' }),

  // Last quarter
  item('PI-0101', 'KHE-0152', 'COMMISSION', 38_400, rel(-2), 'August sales — 1.2% of KES 3.2M'),
  item('PI-0102', 'KHE-0244', 'COMMISSION', 14_750, rel(-2), 'August sales'),
  item('PI-0103', 'KHE-0152', 'COMMISSION', 41_200, rel(-1), 'September sales — 1.2% of KES 3.43M'),
  item('PI-0104', 'KHE-0244', 'COMMISSION', 16_900, rel(-1), 'September sales'),
  item('PI-0105', 'KHE-0251', 'BONUS', 15_000, rel(-1), 'Q2 operations scorecard', { source: 'Bulk' }),
  item('PI-0106', 'KHE-0263', 'BONUS', 10_000, rel(-1), 'Q2 operations scorecard', { source: 'Bulk' }),
  item('PI-0107', 'KHE-0270', 'BONUS', 10_000, rel(-1), 'Q2 operations scorecard', { source: 'Bulk' }),
  item('PI-0108', 'KHE-0276', 'BONUS', 12_000, rel(-1), 'Q2 operations scorecard', { source: 'Bulk' }),
  item('PI-0109', 'KHE-0280', 'REIMBURSEMENT', 6_200, rel(-1), 'Receipt 4471 — network cabling'),
  item('PI-0110', 'KHE-0301', 'PER_DIEM', 9_000, rel(-1), 'Mombasa port run, 3 nights'),

  // October — open period
  item('PI-0201', 'KHE-0152', 'COMMISSION', 45_000, rel(0), 'October sales advance — 1.2% of KES 3.75M'),
  item('PI-0202', 'KHE-0244', 'COMMISSION', 18_500, rel(0), 'October sales'),
  item('PI-0203', 'KHE-0270', 'OT_EXTRA', 6_800, rel(0), 'Boiler shutdown, 26 hours — claim OT-1188'),
  item('PI-0204', 'KHE-0263', 'HOLIDAY_OT', 3_200, rel(0), 'Mazingira Day stock count, 8 hours'),
  item('PI-0205', 'KHE-0251', 'PER_DIEM', 12_000, rel(0), 'Nandi outgrower visits, 4 nights'),
  item('PI-0206', 'KHE-0251', 'PER_DIEM_EXCESS', 2_500, rel(0), 'Above the approved KES 3,000 nightly rate'),
  item('PI-0207', 'KHE-0280', 'REIMBURSEMENT', 4_350, rel(0), 'Receipt 4519 — UPS batteries'),
  item('PI-0208', 'KHE-0276', 'ARREARS', 8_000, rel(0), 'Regrading backdated to August (2 months)'),
  item('PI-0209', 'KHE-0187', 'LEAVE_ALLOWANCE', 10_000, rel(0), 'Annual leave allowance', { source: 'Leave' }),
  item('PI-0210', 'KHE-0171', 'SIGNON', 20_000, rel(0), 'Sign-on bonus', { status: 'CANCELLED', cancelledBy: by, note: 'Posted to the wrong employee — reposted as PI-0211' }),
  item('PI-0211', 'KHE-0280', 'SIGNON', 20_000, rel(0), 'Retention award — ICT Officer'),
  // Calculated by the pay item's formula each payroll
  item('PI-0212', 'KHE-0263', 'NIGHT_SHIFT', 5_400, rel(0), 'Stores night cover — roster NS-10', { auto: true, quantity: 12 }),
  item('PI-0213', 'KHE-0301', 'NIGHT_SHIFT', 3_600, rel(0), 'Night deliveries — roster NS-10', { auto: true, quantity: 8 }),
  item('PI-0214', 'KHE-0270', 'HARDSHIP', 5_000, rel(0), 'Posted to Nandi Hills estate', { auto: true, recurring: true }),
  item('PI-0215', 'KHE-0178', 'LONG_SERVICE', 6_000, rel(0), 'Long-service recognition 2026', { auto: true })
];

const loan = (l: Omit<StaffLoan, 'orgId' | 'installment' | 'status'> & { installment?: number }): StaffLoan => ({
  orgId: 'org-kericho',
  status: 'ACTIVE',
  ...l,
  installment: l.installment ?? loanInstallment(l.principal, l.ratePa, l.method, l.termMonths)
});

export const SEED_LOANS: StaffLoan[] = [
  loan({ id: 'LN-0001', staffId: 'KHE-0244', type: 'STAFF_LOAN', lender: 'Kericho Highland Estates', principal: 120_000, ratePa: 0.06, method: 'reducing', termMonths: 12, startPeriod: rel(-6), disbursedOn: `${rel(-7)}-20`, reference: 'Laptop & school fees loan' }),
  loan({ id: 'LN-0002', staffId: 'KHE-0270', type: 'SACCO_LOAN', lender: 'Kericho Tea Growers SACCO', principal: 200_000, ratePa: 0.12, method: 'flat', termMonths: 24, startPeriod: '2025-11', disbursedOn: '2025-10-28', reference: 'SACCO development loan DL-2291' }),
  loan({ id: 'LN-0003', staffId: 'KHE-0251', type: 'BANK_CHECKOFF', lender: 'Equity Bank', principal: 180_000, ratePa: 0, method: 'none', termMonths: 36, startPeriod: '2025-06', disbursedOn: '2025-05-30', reference: 'Check-off CK-00931' }),
  loan({ id: 'LN-0004', staffId: 'KHE-0280', type: 'HELB', lender: 'Higher Education Loans Board', principal: 168_000, ratePa: 0, method: 'none', termMonths: 48, installment: 3_500, startPeriod: '2025-02', disbursedOn: '2025-01-15', reference: 'HELB notice 2025/KER/0114' }),
  loan({ id: 'LN-0005', staffId: 'KHE-0263', type: 'SALARY_ADVANCE', lender: 'Kericho Highland Estates', principal: 15_000, ratePa: 0, method: 'none', termMonths: 1, startPeriod: rel(0), disbursedOn: postedIn(rel(0), 3), reference: 'Advance ADV-0412 (medical)' }),
  // A driver whose deductions exceed the two-thirds limit — the engine defers the excess
  loan({ id: 'LN-0006', staffId: 'KHE-0303', type: 'COURT_ORDER', lender: 'Kericho Law Courts', principal: 90_000, ratePa: 0, method: 'none', termMonths: 18, startPeriod: rel(-5), disbursedOn: `${rel(-6)}-22`, reference: 'Maintenance order CM 118/2026' }),
  loan({ id: 'LN-0007', staffId: 'KHE-0303', type: 'STAFF_LOAN', lender: 'Kericho Highland Estates', principal: 60_000, ratePa: 0, method: 'none', termMonths: 6, startPeriod: rel(-2), disbursedOn: `${rel(-3)}-30`, reference: 'Emergency loan — house fire' }),
  loan({ id: 'LN-0008', staffId: 'KHE-0303', type: 'SACCO_LOAN', lender: 'Kericho Tea Growers SACCO', principal: 150_000, ratePa: 0.12, method: 'flat', termMonths: 18, startPeriod: rel(-7), disbursedOn: `${rel(-8)}-26`, reference: 'SACCO loan DL-2410' }),
  loan({ id: 'LN-0009', staffId: 'KHE-0187', type: 'HELB', lender: 'Higher Education Loans Board', principal: 96_000, ratePa: 0, method: 'none', termMonths: 36, installment: 2_800, startPeriod: '2025-04', disbursedOn: '2025-03-10', reference: 'HELB notice 2025/KER/0201' })
];
