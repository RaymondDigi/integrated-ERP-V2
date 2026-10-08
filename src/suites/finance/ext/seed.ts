import type {
  Account,
  ApprovalRule,
  Company,
  CostCenter,
  CostObject,
  Currency,
  FinanceSettings,
  FinanceState,
  FinDocument,
  FiscalYear,
  HistoryEntry,
  Journal,
  JournalLine,
  Memo,
  Party,
  Period,
  ReasonCode,
  TaxCode
} from '../types';
import { addDays, addMonths, docTotals, iso, MAIN_COMPANY, periodOf, round2, TODAY } from '../engine';
import { WORKFORCE } from '../../../data/workforce';

/**
 * Seed data for the finance extensions: companies, fiscal calendar, tax and currency masters, cost centres, the second
 * and third group companies, treasury deals and the rest. Called at the end of buildSeed() with its numbering helpers so
 * document numbers stay in one sequence.
 */

export const COMPANIES: Company[] = [
  { id: MAIN_COMPANY, code: 'KHE', name: 'Kericho Highland Estates Ltd', pin: 'P051234000A', baseCurrency: 'KES', plants: ['Kericho factory', 'Kapsumbeiwa estate', 'Mombasa warehouse'], closeOwner: 'David Otieno' },
  { id: 'org-rift', code: 'RVA', name: 'Rift Valley Agricultural Holding Ltd', pin: 'P051887766R', baseCurrency: 'KES', plants: ['Nakuru packhouse', 'Rongai farms'], closeOwner: 'Grace Wanjiku' },
  { id: 'org-nairobi', code: 'HQ', name: 'Corporate HQ Nairobi (Group Treasury)', pin: 'P051112233N', baseCurrency: 'KES', plants: ['Upper Hill head office'], closeOwner: 'Amina Hassan' }
];

export const EXTRA_ACCOUNTS: Account[] = [
  { code: '1030', name: 'Petty cash — Head office', type: 'ASSET', group: 'Cash & bank', bank: true },
  { code: '1040', name: 'KCB Bank — USD account', type: 'ASSET', group: 'Cash & bank', bank: true, currency: 'USD' },
  { code: '1160', name: 'Withholding tax receivable', type: 'ASSET', group: 'Receivables' },
  { code: '1180', name: 'Inter-company receivable', type: 'ASSET', group: 'Receivables' },
  { code: '1190', name: 'Allowance for expected credit losses', type: 'ASSET', group: 'Receivables' },
  { code: '1210', name: 'Provision for inventory losses', type: 'ASSET', group: 'Current assets' },
  { code: '1220', name: 'Work in progress — blending', type: 'ASSET', group: 'Current assets' },
  { code: '1310', name: 'Supplier advances & down payments', type: 'ASSET', group: 'Current assets' },
  { code: '1400', name: 'Staff debtors (loans & advances)', type: 'ASSET', group: 'Current assets' },
  { code: '1600', name: 'Investments — deposits, T-bills & bonds', type: 'ASSET', group: 'Investments' },
  { code: '2120', name: 'Tea levy payable', type: 'LIABILITY', group: 'Tax' },
  { code: '2170', name: 'Withholding tax payable', type: 'LIABILITY', group: 'Tax' },
  { code: '2180', name: 'Inter-company payable', type: 'LIABILITY', group: 'Payables' },
  { code: '2210', name: 'Freight & goods received not invoiced', type: 'LIABILITY', group: 'Payables' },
  { code: '2300', name: 'Customer advances', type: 'LIABILITY', group: 'Payables' },
  { code: '2400', name: 'Corporation tax payable', type: 'LIABILITY', group: 'Tax' },
  { code: '2510', name: 'Short-term borrowings & LC facilities', type: 'LIABILITY', group: 'Long-term liabilities' },
  { code: '3200', name: 'Revaluation reserve', type: 'EQUITY', group: 'Equity' },
  { code: '4020', name: 'Sales — services (blending, tasting, storage)', type: 'INCOME', group: 'Revenue' },
  { code: '4200', name: 'Discounts received', type: 'INCOME', group: 'Other income' },
  { code: '4300', name: 'Foreign exchange gains / (losses)', type: 'INCOME', group: 'Other income' },
  { code: '4400', name: 'Interest & investment income', type: 'INCOME', group: 'Other income' },
  { code: '4500', name: 'Gain / (loss) on disposal of assets', type: 'INCOME', group: 'Other income' },
  { code: '5050', name: 'Inventory revaluation & stock differences', type: 'EXPENSE', group: 'Cost of sales' },
  { code: '5100', name: 'Freight, clearing & landed costs', type: 'EXPENSE', group: 'Cost of sales' },
  { code: '5200', name: 'Production labour & overheads absorbed', type: 'EXPENSE', group: 'Cost of sales' },
  { code: '6950', name: 'Bad debts & expected credit losses', type: 'EXPENSE', group: 'Finance costs' },
  { code: '6960', name: 'Early-payment discounts lost', type: 'EXPENSE', group: 'Finance costs' },
  { code: '6970', name: 'Early-payment discounts allowed', type: 'EXPENSE', group: 'Finance costs' },
  { code: '6980', name: 'Inventory losses & write-downs', type: 'EXPENSE', group: 'Operations' },
  { code: '7900', name: 'Corporation tax expense', type: 'EXPENSE', group: 'Tax' },
  { code: '9000', name: 'Headcount (statistical)', type: 'ASSET', group: 'Statistical', statistical: true, unit: 'staff' },
  { code: '9010', name: 'Warehouse floor area (statistical)', type: 'ASSET', group: 'Statistical', statistical: true, unit: 'm²' },
  { code: '9020', name: 'Made tea produced (statistical)', type: 'ASSET', group: 'Statistical', statistical: true, unit: 'kg' }
];

/** ESG tags: estimated kg CO₂e per KES spent. */
const ESG: Record<string, Account['esg']> = {
  '6200': { category: 'ENERGY', factor: 0.0032, unit: 'kg CO₂e' },
  '6300': { category: 'FUEL', factor: 0.0149, unit: 'kg CO₂e' },
  '5000': { category: 'WATER', factor: 0, unit: '—' },
  '6550': { category: 'SOCIAL', factor: 0, unit: '—' }
};

export const TAX_CODES: TaxCode[] = [
  { code: 'V16', name: 'VAT standard rate 16%', kind: 'VAT', rates: [{ from: '2020-01-01', rate: 0.14 }, { from: '2021-01-01', rate: 0.16 }], appliesTo: 'BOTH', account: '2100', inputAccount: '1150', active: true, due: { frequency: 'MONTHLY', day: 20 } },
  { code: 'V8', name: 'VAT 8% (petroleum products)', kind: 'VAT', rates: [{ from: '2022-07-01', rate: 0.08 }], appliesTo: 'PURCHASE', account: '2100', inputAccount: '1150', active: true },
  { code: 'Z0', name: 'Zero-rated (exports)', kind: 'ZERO', rates: [{ from: '2020-01-01', rate: 0 }], appliesTo: 'BOTH', account: '2100', inputAccount: '1150', active: true },
  { code: 'E0', name: 'Exempt supplies', kind: 'EXEMPT', rates: [{ from: '2020-01-01', rate: 0 }], appliesTo: 'BOTH', account: '2100', inputAccount: '1150', active: true },
  { code: 'RC16', name: 'Reverse charge — imported services 16%', kind: 'REVERSE', rates: [{ from: '2021-01-01', rate: 0.16 }], appliesTo: 'PURCHASE', account: '2100', inputAccount: '1150', active: true },
  { code: 'WHTV2', name: 'Withholding VAT 2%', kind: 'WHT', rates: [{ from: '2020-01-01', rate: 0.02 }], appliesTo: 'BOTH', account: '2170', inputAccount: '1160', active: true, due: { frequency: 'MONTHLY', day: 20 } },
  { code: 'WHT5', name: 'Withholding tax — professional & management fees 5%', kind: 'WHT', rates: [{ from: '2020-01-01', rate: 0.05 }], appliesTo: 'PURCHASE', account: '2170', active: true },
  { code: 'WHT3', name: 'Withholding tax — contractual fees 3%', kind: 'WHT', rates: [{ from: '2020-01-01', rate: 0.03 }], appliesTo: 'PURCHASE', account: '2170', active: true },
  { code: 'TL1', name: 'Tea levy 1% (Tea Board of Kenya)', kind: 'LEVY', rates: [{ from: '2020-01-01', rate: 0.01 }], appliesTo: 'SALES', account: '2120', active: true, due: { frequency: 'MONTHLY', day: 10 } },
  { code: 'RDL2', name: 'Railway Development Levy 2% (imports)', kind: 'LEVY', rates: [{ from: '2020-01-01', rate: 0.02 }], appliesTo: 'PURCHASE', account: '5100', active: true },
  { code: 'EXC15', name: 'Excise duty 15% (bottled water & juices)', kind: 'EXCISE', rates: [{ from: '2020-01-01', rate: 0.15 }], appliesTo: 'SALES', account: '2120', active: false }
];

export const DEFAULT_SETTINGS: FinanceSettings = {
  accountMask: '9999',
  discountMethod: 'GROSS',
  financeChargePct: 1.5,
  financeChargeCompound: false,
  financeChargeFrom: 31,
  collectionMinimum: 50_000,
  overdueTolerancePct: 25,
  overLimitTolerancePct: 10,
  matchTolerancePct: 2,
  downPaymentLimitPct: 30,
  postingChecklist: { BILL: ['MATCHED', 'PARTY_PIN'], INVOICE: ['PARTY_PIN'], PAYMENT: ['NO_HOLD'], JOURNAL: ['MEMO'] },
  eclRates: [0.005, 0.02, 0.08, 0.2, 0.5],
  inventoryLossRates: [0, 0.02, 0.1, 0.35],
  budgetBlock: true,
  dunning: [
    { days: 7, action: 'REMINDER', letter: 'Friendly reminder: invoice {invoice} for {amount} was due on {due}. Please arrange payment.' },
    { days: 30, action: 'DUNNING_1', letter: 'First notice: {invoice} is {days} days overdue ({amount}). Please pay within 7 days to avoid finance charges.' },
    { days: 60, action: 'DUNNING_2', letter: 'Final notice: {invoice} is {days} days overdue ({amount}). Supplies are on hold until the account is settled.' },
    { days: 75, action: 'CALL', letter: 'Collection call scheduled for {customer} — {amount} outstanding.' },
    { days: 120, action: 'AGENCY', letter: 'Account referred to Mombasa Credit Recovery Agency for {amount}.' }
  ],
  corporateTaxRate: 0.3
};

const CURRENCIES = (year: number): Currency[] => [
  { code: 'KES', name: 'Kenya shilling', symbol: 'KSh', rates: [{ date: `${year - 1}-01-01`, rate: 1 }] },
  {
    code: 'USD',
    name: 'US dollar',
    symbol: '$',
    rates: [
      { date: `${year}-01-02`, rate: 129.9 },
      { date: `${year}-04-01`, rate: 129.5 },
      { date: addDays(TODAY, -60), rate: 129.2 },
      { date: addDays(TODAY, -20), rate: 129.0 },
      { date: TODAY, rate: 128.6 }
    ]
  },
  { code: 'GBP', name: 'Pound sterling', symbol: '£', rates: [{ date: `${year}-01-02`, rate: 162.4 }, { date: TODAY, rate: 172.8 }] },
  { code: 'EUR', name: 'Euro', symbol: '€', rates: [{ date: `${year}-01-02`, rate: 134.7 }, { date: TODAY, rate: 149.9 }] },
  { code: 'PKR', name: 'Pakistani rupee', symbol: 'Rs', rates: [{ date: `${year}-01-02`, rate: 0.464 }, { date: TODAY, rate: 0.458 }] }
];

const COST_CENTERS: CostCenter[] = [
  { code: 'CC-FIN', name: 'Finance', type: 'COST', companyId: MAIN_COMPANY, manager: 'David Otieno', department: 'Finance', active: true },
  { code: 'CC-ADM', name: 'Administration', type: 'COST', companyId: MAIN_COMPANY, manager: 'Joseph Kiprono', department: 'Administration', active: true },
  { code: 'CC-ICT', name: 'ICT', type: 'COST', companyId: MAIN_COMPANY, manager: 'ICT Officer', department: 'ICT', active: true },
  { code: 'CC-FAC', name: 'Kericho factory — withering, CTC & drying', type: 'COST', companyId: MAIN_COMPANY, manager: 'Esther Muthoni', department: 'Operations', parent: 'CC-OPS', active: true },
  { code: 'CC-OPS', name: 'Operations (factory & estates)', type: 'COST', companyId: MAIN_COMPANY, manager: 'Esther Muthoni', active: true },
  { code: 'CC-WH', name: 'Mombasa warehouse & logistics', type: 'COST', companyId: MAIN_COMPANY, manager: 'Warehouse Supervisor', parent: 'CC-OPS', active: true },
  { code: 'PC-LOCAL', name: 'Local sales — packed tea', type: 'PROFIT', companyId: MAIN_COMPANY, manager: 'Sales Manager', department: 'Sales', active: true },
  { code: 'PC-EXPORT', name: 'Export sales — bulk & auction', type: 'PROFIT', companyId: MAIN_COMPANY, manager: 'Export Manager', active: true },
  { code: 'PC-RVA', name: 'Rift Valley packhouse', type: 'PROFIT', companyId: 'org-rift', manager: 'Grace Wanjiku', active: true }
];

const REASON_CODES: ReasonCode[] = [
  { code: 'ACC', label: 'Month-end accrual', appliesTo: 'JOURNAL' },
  { code: 'COR', label: 'Correction of a posting error', appliesTo: 'JOURNAL' },
  { code: 'RCL', label: 'Reclassification between accounts', appliesTo: 'JOURNAL' },
  { code: 'AUD', label: 'External audit adjustment', appliesTo: 'JOURNAL' },
  { code: 'PRE', label: 'Prepayment release', appliesTo: 'JOURNAL' },
  { code: 'RET', label: 'Goods returned', appliesTo: 'CREDIT_NOTE' },
  { code: 'PRC', label: 'Pricing or invoicing error', appliesTo: 'CREDIT_NOTE' },
  { code: 'QLT', label: 'Quality claim — tea grade downgraded at tasting', appliesTo: 'CREDIT_NOTE' },
  { code: 'DMG', label: 'Damaged in transit', appliesTo: 'CREDIT_NOTE' },
  { code: 'INS', label: 'Customer insolvent — uncollectable', appliesTo: 'WRITE_OFF' },
  { code: 'SML', label: 'Small balance write-off', appliesTo: 'WRITE_OFF' },
  { code: 'DSP', label: 'Dispute settled', appliesTo: 'WRITE_OFF' }
];

const APPROVAL_RULES: ApprovalRule[] = [
  { id: 'ar1', docType: 'ANY', directorAbove: 1_000_000 },
  { id: 'ar2', docType: 'BILL', department: 'Operations', directorAbove: 1_500_000 },
  { id: 'ar3', docType: 'PAYMENT_RUN', directorAbove: 2_000_000 },
  { id: 'ar4', docType: 'LOAN', directorAbove: 100_000 },
  { id: 'ar5', docType: 'BUDGET', directorAbove: 250_000 }
];

/** Twelve calendar-month periods for a year, all closed (last year) or the current year's as already seeded. */
const yearPeriods = (year: number, status: Period['status'], closedBy: string): Period[] =>
  Array.from({ length: 12 }, (_, m) => ({
    key: `${year}-${String(m + 1).padStart(2, '0')}`,
    status,
    closedBy: status === 'CLOSED' ? closedBy : undefined,
    closedAt: status === 'CLOSED' ? `${year + (m === 11 ? 1 : 0)}-${String(m === 11 ? 1 : m + 2).padStart(2, '0')}-06T17:00:00` : undefined,
    checklist: (status === 'CLOSED' ? { ar: true, ap: true, accruals: true } : {}) as Record<string, boolean>,
    fiscalYear: `FY${year}`
  }));

/** Empty extension collections, filled by extendSeed(). */
export const emptyExtensions = (): Omit<
  FinanceState,
  'actor' | 'accounts' | 'parties' | 'documents' | 'settlements' | 'journals' | 'bankLines' | 'assets' | 'depreciationRuns' | 'periods' | 'budgets' | 'budgetYear' | 'sequence'
> => ({
  companies: COMPANIES,
  activeCompany: MAIN_COMPANY,
  fiscalYears: [],
  taxCodes: TAX_CODES,
  currencies: [],
  costCenters: [],
  costObjects: [],
  reasonCodes: [],
  approvalRules: [],
  settings: DEFAULT_SETTINGS,
  memos: [],
  applications: [],
  recurring: [],
  journalTemplates: [],
  paymentRuns: [],
  budgetChanges: [],
  objectives: [],
  reportDefs: [],
  collectionLog: [],
  invoiceBatches: [],
  instruments: [],
  staffLoans: [],
  taxFilings: [],
  allocationRules: [],
  activities: [],
  inventoryPostings: [],
  rateCards: [],
  invoiceTemplates: [],
  statementImports: []
});

const ASSET_LINKS: Record<string, { equipmentId?: string; costCenter: string }> = {
  fa1: { equipmentId: 'eq10', costCenter: 'CC-ADM' },
  fa2: { costCenter: 'PC-LOCAL' },
  fa3: { equipmentId: 'eq1', costCenter: 'CC-FAC' },
  fa4: { equipmentId: 'eq2', costCenter: 'CC-FAC' },
  fa5: { equipmentId: 'eq3', costCenter: 'CC-WH' },
  fa6: { costCenter: 'CC-ICT' },
  fa7: { costCenter: 'CC-ADM' }
};

interface SeedCtx {
  next: (prefix: string) => string;
  lid: () => string;
  david: { name: string; role: 'MANAGER' };
  grace: { name: string; role: 'ACCOUNTANT' };
  amina: { name: string; role: 'DIRECTOR' };
}

export const extendSeed = (state: FinanceState, ctx: SeedCtx): FinanceState => {
  const year = Number(TODAY.slice(0, 4));
  const { next, lid, david, grace, amina } = ctx;
  const at = (date: string, h = 10) => `${date}T${String(h).padStart(2, '0')}:15:00`;
  const sys = (date: string): Pick<Journal, 'status' | 'preparedBy' | 'approvals' | 'history'> => ({
    status: 'POSTED',
    preparedBy: 'System',
    approvals: [],
    history: [{ at: at(date, 7), by: 'System', action: 'Posted automatically' }]
  });
  const posted = (date: string): Pick<Journal, 'status' | 'preparedBy' | 'approvals' | 'history'> => ({
    status: 'POSTED',
    preparedBy: grace.name,
    approvals: [{ by: david.name, role: 'MANAGER', at: at(date, 14) }],
    history: [
      { at: at(date, 9), by: grace.name, action: 'Created' },
      { at: at(date, 10), by: grace.name, action: 'Submitted for approval' },
      { at: at(date, 14), by: david.name, action: 'Approved' },
      { at: at(date, 16), by: david.name, action: 'Posted to ledger' }
    ]
  });
  const journals: Journal[] = [];
  const jv = (companyId: string, date: string, memo: string, source: Journal['source'], lines: Omit<JournalLine, 'id'>[], extra: Partial<Journal> = {}) => {
    const j: Journal = { id: `jx${journals.length + 1}`, number: next('JV'), date, memo, source, lines: lines.map((l) => ({ ...l, id: lid() })), companyId, ...(source === 'MANUAL' ? posted(date) : sys(date)), ...extra };
    journals.push(j);
    return j;
  };
  const jan1 = `${year}-01-01`;

  // ---- Chart of accounts: extension accounts and ESG tags
  const accounts = [...state.accounts.map((a) => (ESG[a.code] ? { ...a, esg: ESG[a.code] } : a)), ...EXTRA_ACCOUNTS].sort((a, b) => a.code.localeCompare(b.code));

  // ---- Parties: statutory payees, carriers, overseas customers and supplier master extensions
  const parties: Party[] = state.parties.map((p) => {
    switch (p.id) {
      case 'c2':
        return {
          ...p,
          addresses: [
            { id: 'a1', type: 'BILL_TO', label: 'Head office — Nairobi', address: 'Lakeview Plaza, Waiyaki Way, Nairobi', taxCode: 'V16', taxId: p.pin },
            { id: 'a2', type: 'SHIP_TO', label: 'Lakeview Naivasha Resort', address: 'Moi South Lake Road, Naivasha', taxCode: 'V16', taxId: 'P051876543B-NVS' },
            { id: 'a3', type: 'SHIP_TO', label: 'Lakeview Kisumu', address: 'Dunga Hill, Kisumu', taxCode: 'V16', taxId: 'P051876543B-KSM', templateId: 'tpl-hos' },
            { id: 'a4', type: 'BILL_TO', label: 'Lakeview Coast (separate billing)', address: 'Nyali Beach Road, Mombasa', taxCode: 'V16', taxId: 'P051876543B-MSA', templateId: 'tpl-hos' }
          ],
          contacts: [{ id: 'k1', name: 'Faith Njeri', role: 'AR', email: 'payables@lakeviewhotels.co.ke', phone: '+254 733 118 905' }],
          templateId: 'tpl-hos',
          collector: 'Grace Wanjiku'
        };
      case 'c4':
        return { ...p, creditExtensions: [{ id: 'ce1', amount: 2_000_000, from: addDays(TODAY, -10), to: addDays(TODAY, 50), reason: 'Festive-season stock build', approvedBy: amina.name }], agingBuckets: [45, 90, 120], collector: 'Grace Wanjiku' };
      case 'c5':
        return { ...p, earlyDiscount: { pct: 2, days: 10 }, contacts: [{ id: 'k2', name: 'Hassan Omar', role: 'BILLING', email: 'accounts@coasthospitality.co.ke', phone: '+254 741 902 333' }] };
      case 'c7':
        return { ...p, discountPct: 2.5, collector: 'Mombasa Credit Recovery Agency', contacts: [{ id: 'k3', name: 'Lucy Wairimu', role: 'AR', email: 'creditors@metrosupermarkets.co.ke', phone: '+254 701 223 448' }] };
      case 'c8':
        return { ...p, currency: 'USD', templateId: 'tpl-exp' };
      case 's6':
        return { ...p, earlyDiscount: { pct: 2, days: 10 } };
      case 's8':
        return { ...p, paymentHold: { by: david.name, at: at(addDays(TODAY, -9)), reason: 'Workmanship query on generator service — hold until re-inspection' } };
      default:
        return p;
    }
  });
  parties.push(
    { id: 's13', kind: 'SUPPLIER', name: 'Kenya Revenue Authority', pin: 'P000000000K', email: 'callcentre@kra.go.ke', phone: '+254 20 4 999 999', terms: 9, category: 'Statutory' },
    { id: 's14', kind: 'SUPPLIER', name: 'National Social Security Fund', pin: 'P000000001N', email: 'info@nssf.or.ke', phone: '+254 20 2 832 000', terms: 9, category: 'Statutory' },
    { id: 's15', kind: 'SUPPLIER', name: 'Social Health Authority (SHIF)', pin: 'P000000002S', email: 'info@sha.go.ke', phone: '+254 800 720 601', terms: 9, category: 'Statutory' },
    { id: 's16', kind: 'SUPPLIER', name: 'Harambee Staff SACCO', pin: 'P051161616V', email: 'remittance@harambeesacco.co.ke', phone: '+254 20 222 1616', terms: 9, category: 'Third-party deductions' },
    { id: 's17', kind: 'SUPPLIER', name: 'Bandari Freight Forwarders Ltd', pin: 'P051171717W', email: 'billing@bandarifreight.co.ke', phone: '+254 41 231 1717', terms: 30, category: 'Freight' },
    { id: 's18', kind: 'SUPPLIER', name: 'Zhejiang Tea Machinery Co.', pin: 'NON-RESIDENT', email: 'export@zjteamach.cn', phone: '+86 571 8888 1818', terms: 60, category: 'Machinery', currency: 'USD' },
    { id: 'c9', kind: 'CUSTOMER', name: 'Al-Mansour Tea Importers (Karachi)', pin: 'NON-RESIDENT', email: 'imports@almansourtea.pk', phone: '+92 21 3456 7890', terms: 45, creditLimit: 15_000_000, category: 'Export', currency: 'USD', templateId: 'tpl-exp' }
  );

  // ---- Fiscal calendar: last year (closed), this year with an adjustment period
  const fiscalYears: FiscalYear[] = [
    { id: `FY${year - 1}`, name: `FY ${year - 1}`, start: `${year - 1}-01-01`, end: `${year - 1}-12-31`, pattern: 'MONTHLY', specialPeriods: 1, status: 'CLOSED', createdBy: 'System' },
    { id: `FY${year}`, name: `FY ${year}`, start: `${year}-01-01`, end: `${year}-12-31`, pattern: 'MONTHLY', specialPeriods: 1, status: 'OPEN', createdBy: 'System' }
  ];
  const month = Number(TODAY.slice(5, 7)) - 1;
  const periods: Period[] = [
    ...yearPeriods(year - 1, 'CLOSED', david.name),
    { key: `${year - 1}-13`, status: 'CLOSED', checklist: {}, special: true, from: `${year - 1}-12-31`, to: `${year - 1}-12-31`, fiscalYear: `FY${year - 1}`, label: `Year-end adjustments ${year - 1}`, closedBy: amina.name, closedAt: `${year}-02-28T17:00:00` },
    ...state.periods.map((p, m) => ({
      ...p,
      fiscalYear: `FY${year}`,
      owner: m === month - 1 ? david.name : undefined,
      due: m >= month - 1 ? iso(new Date(year, m + 1, 6)) : undefined,
      history: p.status === 'CLOSED' ? [{ at: p.closedAt!, by: p.closedBy!, action: 'Period closed' }] : []
    })),
    { key: `${year}-13`, status: 'OPEN', checklist: {}, special: true, from: `${year}-12-31`, to: `${year}-12-31`, fiscalYear: `FY${year}`, label: `Year-end adjustments ${year}` }
  ];

  // ---- Group companies: opening balances, an inter-company loan and a USD export trade
  jv('org-rift', jan1, `Opening balances ${year}`, 'OPENING', [
    { account: '1000', description: 'Bank — KCB', debit: 2_150_000, credit: 0 },
    { account: '1200', description: 'Inventory — packed tea', debit: 1_240_000, credit: 0 },
    { account: '1510', description: 'Packhouse equipment', debit: 1_800_000, credit: 0 },
    { account: '1590', description: 'Accumulated depreciation', debit: 0, credit: 420_000 },
    { account: '3000', description: 'Share capital', debit: 0, credit: 2_000_000 },
    { account: '3100', description: 'Retained earnings', debit: 0, credit: 2_770_000 }
  ]);
  jv('org-nairobi', jan1, `Opening balances ${year}`, 'OPENING', [
    { account: '1000', description: 'Bank — KCB treasury', debit: 6_400_000, credit: 0 },
    { account: '1600', description: 'Fixed deposits', debit: 4_000_000, credit: 0 },
    { account: '3000', description: 'Share capital', debit: 0, credit: 8_000_000 },
    { account: '3100', description: 'Retained earnings', debit: 0, credit: 2_400_000 }
  ]);
  const icDate = `${year}-03-15`;
  const icHq = jv('org-nairobi', icDate, 'Inter-company loan to Rift Valley Agricultural Holding', 'INTERCOMPANY', [
    { account: '1180', description: 'Loan to RVA', debit: 1_500_000, credit: 0, partnerCompany: 'org-rift' },
    { account: '1000', description: 'Transfer out', debit: 0, credit: 1_500_000 }
  ]);
  const icRva = jv('org-rift', icDate, 'Inter-company loan from Corporate HQ', 'INTERCOMPANY', [
    { account: '1000', description: 'Transfer in', debit: 1_500_000, credit: 0 },
    { account: '2180', description: 'Loan from HQ', debit: 0, credit: 1_500_000, partnerCompany: 'org-nairobi' }
  ]);
  // RVA has accrued interest on the loan that HQ has not yet booked — shows on the inter-company reconciliation
  jv('org-rift', addDays(TODAY, -8), 'Accrue interest on HQ loan (12% p.a.)', 'MANUAL', [
    { account: '7000', description: 'Interest on inter-company loan', debit: 15_000, credit: 0 },
    { account: '2180', description: 'Interest payable to HQ', debit: 0, credit: 15_000, partnerCompany: 'org-nairobi' }
  ], { reasonCode: 'ACC' });

  const documents: FinDocument[] = [...state.documents];
  const doc = (d: Omit<FinDocument, 'number' | 'status' | 'preparedBy' | 'approvals' | 'history'>, status: 'POSTED' | 'SUBMITTED' = 'POSTED') => {
    const prefix = d.kind === 'INVOICE' ? (d.memoType === 'DEBIT_NOTE' ? 'DN' : 'INV') : 'BILL';
    const history: HistoryEntry[] = [
      { at: at(d.date, 9), by: grace.name, action: 'Created' },
      { at: at(d.date, 10), by: grace.name, action: 'Submitted for approval' }
    ];
    const approvals = status === 'POSTED' ? [{ by: david.name, role: 'MANAGER' as const, at: at(d.date, 12) }, { by: amina.name, role: 'DIRECTOR' as const, at: at(d.date, 15) }] : [];
    if (status === 'POSTED') history.push({ at: at(d.date, 12), by: david.name, action: 'Approved' }, { at: at(d.date, 15), by: amina.name, action: 'Approved (director)' }, { at: at(d.date, 16), by: david.name, action: 'Posted to ledger' });
    const full: FinDocument = { ...d, number: next(prefix), status, preparedBy: grace.name, approvals, history };
    documents.push(full);
    return full;
  };
  const usd = (date: string) => {
    const rates = CURRENCIES(year).find((c) => c.code === 'USD')!.rates;
    return [...rates].filter((r) => r.date <= date).pop()?.rate ?? rates[0].rate;
  };
  const exp1Date = addDays(TODAY, -52);
  doc({
    id: 'invx1',
    kind: 'INVOICE',
    partyId: 'c8',
    date: exp1Date,
    dueDate: addDays(exp1Date, 60),
    reference: 'PO-HT-7741',
    department: 'Sales',
    lines: [{ id: lid(), description: 'BOP1 — 20,000 kg, Mombasa auction lot 2219, FOB Mombasa', account: '4010', qty: 20_000, price: 3.1, vat: false, taxCode: 'Z0', taxRate: 0, costCenter: 'PC-EXPORT' }],
    notes: 'Shipped on MSC Kenya I',
    companyId: MAIN_COMPANY,
    currency: 'USD',
    fxRate: usd(exp1Date)
  });
  const exp2Date = addDays(TODAY, -34);
  doc({
    id: 'invx2',
    kind: 'INVOICE',
    partyId: 'c9',
    date: exp2Date,
    dueDate: addDays(exp2Date, 45),
    reference: 'LC-AMT-0091',
    department: 'Sales',
    lines: [
      { id: lid(), description: 'PF1 — 12,000 kg, Kericho highland garden mark KH/22', account: '4010', qty: 12_000, price: 2.85, vat: false, taxCode: 'Z0', taxRate: 0, costCenter: 'PC-RVA' },
      { id: lid(), description: 'Dust 1 — 6,000 kg', account: '4010', qty: 6_000, price: 2.4, vat: false, taxCode: 'Z0', taxRate: 0, costCenter: 'PC-RVA' }
    ],
    notes: '',
    companyId: 'org-rift',
    currency: 'USD',
    fxRate: usd(exp2Date)
  });
  // A local sale by RVA with the tea levy, and a bill
  const rvaSale = addDays(TODAY, -21);
  doc({
    id: 'invx3',
    kind: 'INVOICE',
    partyId: 'c1',
    date: rvaSale,
    dueDate: addDays(rvaSale, 30),
    reference: 'LPO 55120',
    department: 'Sales',
    lines: [{ id: lid(), description: 'Packed tea 500 g — 4,000 packets', account: '4000', qty: 4_000, price: 210, vat: true, taxCode: 'V16', taxRate: 0.16, levies: [{ code: 'TL1', rate: 0.01, account: '2120' }], costCenter: 'PC-RVA' }],
    notes: '',
    companyId: 'org-rift'
  });
  // Freight accrual waiting for the carrier bill, and an imported service with reverse-charge VAT
  const fr = addDays(TODAY, -15);
  jv(MAIN_COMPANY, fr, 'Freight accrual — GRN-' + year + '-118 packaging inbound (Bandari Freight)', 'SYSTEM', [
    { account: '5100', description: 'Inbound freight on packaging', debit: 86_000, credit: 0, costCenter: 'CC-WH' },
    { account: '2210', description: 'Freight accrued — awaiting carrier bill', debit: 0, credit: 86_000 }
  ], { origin: 'Freight accrual' });
  const svc = addDays(TODAY, -28);
  doc({
    id: 'billx1',
    kind: 'BILL',
    partyId: 's18',
    date: svc,
    dueDate: addDays(svc, 60),
    reference: 'ZJ-INV-55031',
    department: 'Operations',
    lines: [{ id: lid(), description: 'Remote commissioning support — CTC line', account: '6400', qty: 1, price: 4_800, vat: true, taxCode: 'RC16', taxRate: 0.16, reverseCharge: true, costCenter: 'CC-FAC' }],
    notes: 'Imported service — reverse charge VAT',
    companyId: MAIN_COMPANY,
    currency: 'USD',
    fxRate: usd(svc)
  });

  // ---- Project costs tagged on journals
  jv(MAIN_COMPANY, addDays(TODAY, -40), 'Contractor progress certificate 1 — withering shed upgrade', 'MANUAL', [
    { account: '6400', description: 'Civil works — withering troughs', debit: 640_000, credit: 0, project: 'PRJ-001', costCenter: 'CC-FAC' },
    { account: '2200', description: 'Accrued — contractor certificate', debit: 0, credit: 640_000 }
  ], { reasonCode: 'ACC' });
  jv(MAIN_COMPANY, addDays(TODAY, -18), 'Export order ORD-HT-7741 — tasting, bagging and clearing costs', 'MANUAL', [
    { account: '5100', description: 'Clearing & port charges', debit: 182_000, credit: 0, project: 'ORD-HT-7741', costCenter: 'PC-EXPORT' },
    { account: '5000', description: 'Paper sacks & pallets', debit: 96_500, credit: 0, project: 'ORD-HT-7741', costCenter: 'PC-EXPORT' },
    { account: '2200', description: 'Accrued', debit: 0, credit: 278_500 }
  ], { reasonCode: 'ACC' });
  // Statistical: headcount and floor area for allocations
  jv(MAIN_COMPANY, jan1, 'Statistical bases — headcount and floor area', 'MANUAL', [
    { account: '9000', description: 'Headcount — factory', debit: 0, credit: 0, quantity: 412, costCenter: 'CC-FAC' },
    { account: '9000', description: 'Headcount — administration', debit: 0, credit: 0, quantity: 38, costCenter: 'CC-ADM' },
    { account: '9010', description: 'Floor area — Mombasa warehouse', debit: 0, credit: 0, quantity: 2_400, costCenter: 'CC-WH' }
  ]);

  // ---- Credit notes: a posted quality claim and a supplier return awaiting approval
  const paidOn = (id: string) => state.settlements.reduce((s, x) => s + x.allocations.filter((a) => a.docId === id).reduce((y, a) => y + a.amount, 0), 0);
  const lakeview = documents.find(
    (d) => d.kind === 'INVOICE' && d.status === 'POSTED' && d.date < addDays(TODAY, -20) && !d.currency && docTotals(d).total - paidOn(d.id) >= 27_840 && ['c2', 'c5', 'c1', 'c3'].includes(d.partyId)
  );
  const memos: Memo[] = [];
  if (lakeview) {
    const date = addDays(lakeview.date, 12);
    memos.push({
      id: 'cn1',
      number: next('CN'),
      side: 'AR',
      partyId: lakeview.partyId,
      date,
      lines: [{ id: lid(), description: 'Quality claim — 2 cartons downgraded at tasting', account: lakeview.lines[0].account, qty: 1, price: 24_000, vat: true, taxCode: 'V16', taxRate: 0.16 }],
      reasonCode: 'QLT',
      allocations: [{ docId: lakeview.id, amount: 27_840 }],
      originalDocId: lakeview.id,
      rmaRef: `RMA-${year}-0007`,
      notes: '',
      department: 'Sales',
      status: 'POSTED',
      preparedBy: grace.name,
      approvals: [{ by: david.name, role: 'MANAGER', at: at(date, 14) }],
      history: [
        { at: at(date, 9), by: grace.name, action: 'Created' },
        { at: at(date, 14), by: david.name, action: 'Approved' },
        { at: at(date, 15), by: david.name, action: 'Posted to ledger' }
      ],
      companyId: MAIN_COMPANY
    });
  }
  const greenfield = [...documents].reverse().find((d) => d.kind === 'BILL' && d.partyId === 's6' && d.status === 'POSTED');
  if (greenfield)
    memos.push({
      id: 'cn2',
      number: next('DM'),
      side: 'AP',
      partyId: 's6',
      date: addDays(TODAY, -2),
      lines: [{ id: lid(), description: 'Returned: 1,200 printed cartons — misprinted batch code', account: '5000', qty: 1200, price: 38, vat: true, taxCode: 'V16', taxRate: 0.16 }],
      reasonCode: 'RET',
      allocations: [],
      originalDocId: greenfield.id,
      poNumber: greenfield.match?.po,
      returnRef: `RTN-${year}-0003`,
      notes: 'Goods collected by supplier from Kericho stores',
      department: 'Operations',
      status: 'SUBMITTED',
      preparedBy: grace.name,
      approvals: [],
      history: [
        { at: at(addDays(TODAY, -2), 9), by: grace.name, action: 'Created' },
        { at: at(addDays(TODAY, -2), 10), by: grace.name, action: 'Submitted for approval' }
      ],
      companyId: MAIN_COMPANY
    });

  // ---- Previous-year budget for comparisons, objectives on this year's lines
  const objectives = [
    { id: 'so1', code: 'SO1', name: 'Grow export revenue by 15%', kpi: 'Export sales (KES)', target: 9_000_000, actual: 0 },
    { id: 'so2', code: 'SO2', name: 'Cut energy cost per kg of made tea by 8%', kpi: 'Electricity spend (KES)', target: 1_500_000, actual: 0 },
    { id: 'so3', code: 'SO3', name: 'Digitise finance and reporting', kpi: 'ICT & software spend (KES)', target: 1_020_000, actual: 0 }
  ];
  const objectiveOf: Record<string, string> = { '4010': 'so1', '6200': 'so2', '6700': 'so3', '4000': 'so1' };
  const budgets = [
    ...state.budgets.map((b) => ({ ...b, year, version: 'Approved', status: 'APPROVED' as const, objectiveId: objectiveOf[b.account], costCenter: b.department === 'Sales' ? 'PC-LOCAL' : b.department === 'Operations' ? 'CC-OPS' : b.department === 'ICT' ? 'CC-ICT' : b.department === 'Finance' ? 'CC-FIN' : 'CC-ADM' })),
    ...state.budgets.map((b) => ({ ...b, year: year - 1, version: 'Approved', status: 'APPROVED' as const, monthly: b.monthly.map((x) => Math.round((x * 0.93) / 1000) * 1000) }))
  ];

  // ---- Treasury: deposits, a T-bill, a bond, the bank loan, an LC, an FX forward and the inter-company loan
  const loanRepaid = round2(
    state.journals.filter((j) => j.status === 'POSTED' && j.memo.startsWith('Loan repayment')).reduce((s, j) => s + j.lines.filter((l) => l.account === '2500').reduce((x, l) => x + l.debit, 0), 0)
  );
  const hist = (date: string, action: string): HistoryEntry[] => [{ at: at(date, 11), by: david.name, action }];
  const fdStart = addDays(TODAY, -61);
  const instruments: FinanceState['instruments'] = [
    { id: 'tr1', number: 'TRY-0001', type: 'DEPOSIT', counterparty: 'KCB Bank Kenya', principal: 5_000_000, currency: 'KES', rate: 0.115, start: fdStart, maturity: addDays(fdStart, 91), rollover: true, bankAccount: '1000', status: 'ACTIVE', accrued: 0, repaid: 0, marketValues: [], journals: [], history: hist(fdStart, 'Fixed deposit placed'), companyId: MAIN_COMPANY },
    { id: 'tr2', number: 'TRY-0002', type: 'TBILL', counterparty: 'Central Bank of Kenya — 364-day T-bill', principal: 3_000_000, currency: 'KES', rate: 0.105, start: `${year}-02-12`, maturity: `${year + 1}-02-11`, rollover: false, bankAccount: '1000', status: 'ACTIVE', accrued: 0, repaid: 0, marketValues: [{ date: `${year}-02-12`, price: 90.5 }, { date: addDays(TODAY, -30), price: 95.9 }, { date: TODAY, price: 96.6 }], journals: [], history: hist(`${year}-02-12`, 'T-bill bought at auction'), companyId: MAIN_COMPANY },
    { id: 'tr3', number: 'TRY-0003', type: 'BOND', counterparty: 'IFB1/2023/6.5 infrastructure bond', principal: 2_000_000, currency: 'KES', rate: 0.175, start: `${year}-05-06`, maturity: `${year + 6}-05-06`, rollover: false, bankAccount: '1000', status: 'ACTIVE', accrued: 0, repaid: 0, marketValues: [{ date: `${year}-05-06`, price: 99.2 }, { date: addDays(TODAY, -45), price: 101.4 }, { date: TODAY, price: 103.1 }], journals: [], history: hist(`${year}-05-06`, 'Bond bought on the NSE'), companyId: MAIN_COMPANY },
    { id: 'tr4', number: 'TRY-0004', type: 'LOAN_IN', counterparty: 'KCB Bank Kenya — term loan', principal: 5_000_000, currency: 'KES', rate: 0.135, start: `${year - 1}-12-15`, maturity: `${year + 3}-12-15`, rollover: false, bankAccount: '1000', status: 'ACTIVE', accrued: 0, repaid: loanRepaid, marketValues: [], journals: [], history: hist(`${year - 1}-12-15`, 'Loan drawn down'), companyId: MAIN_COMPANY },
    { id: 'tr5', number: 'TRY-0005', type: 'LC', counterparty: 'Equity Bank — import LC', principal: 48_000, currency: 'USD', rate: 0.015, start: addDays(TODAY, -20), maturity: addDays(TODAY, 45), rollover: false, bankAccount: '1010', status: 'ACTIVE', accrued: 0, repaid: 0, marketValues: [], lc: { beneficiary: 'Zhejiang Tea Machinery Co.', po: `PO-${year}-221`, expiry: addDays(TODAY, 45), stage: 'ISSUED', documents: 'Bill of lading, commercial invoice, packing list, certificate of origin' }, journals: [], history: hist(addDays(TODAY, -20), 'LC issued'), companyId: MAIN_COMPANY },
    { id: 'tr6', number: 'TRY-0006', type: 'FX_FWD', counterparty: 'Stanbic Bank — FX forward (sell USD)', principal: 50_000, currency: 'USD', rate: 0, forwardRate: 130.4, start: addDays(TODAY, -12), maturity: addDays(TODAY, 30), rollover: false, bankAccount: '1040', status: 'ACTIVE', accrued: 0, repaid: 0, marketValues: [], journals: [], history: hist(addDays(TODAY, -12), 'Forward contract booked to hedge Horizon Trading receivable'), companyId: MAIN_COMPANY },
    { id: 'tr7', number: 'TRY-0007', type: 'IC_LOAN', counterparty: 'Rift Valley Agricultural Holding Ltd', principal: 1_500_000, currency: 'KES', rate: 0.12, start: icDate, maturity: `${year + 2}-03-15`, rollover: false, bankAccount: '1000', status: 'ACTIVE', accrued: 0, repaid: 0, marketValues: [], partnerCompany: 'org-rift', journals: [icHq.id, icRva.id], history: hist(icDate, 'Inter-company loan advanced'), companyId: 'org-nairobi' }
  ];

  // ---- Staff loans and advances recovered through payroll
  const staff = WORKFORCE.filter((e) => e.orgId === MAIN_COMPANY).slice(3, 6);
  const loanDate = addMonths(TODAY, -3);
  const staffLoans: FinanceState['staffLoans'] = staff.slice(0, 2).map((e, i) => ({
    id: `sl${i + 1}`,
    number: `SL-${year}-${String(i + 1).padStart(4, '0')}`,
    employeeId: e.staffId,
    employee: e.fullName,
    type: i ? 'SALARY_ADVANCE' : 'STAFF_LOAN',
    amount: i ? 30_000 : 120_000,
    monthly: i ? 15_000 : 20_000,
    date: loanDate,
    recovered: [],
    status: 'POSTED',
    preparedBy: grace.name,
    approvals: [{ by: david.name, role: 'MANAGER', at: at(loanDate, 12) }],
    history: [
      { at: at(loanDate, 9), by: grace.name, action: 'Requested' },
      { at: at(loanDate, 12), by: david.name, action: 'Approved' },
      { at: at(loanDate, 15), by: david.name, action: 'Disbursed' }
    ]
  }));
  for (const l of staffLoans) {
    const j = jv(MAIN_COMPANY, l.date, `${l.number} disbursed — ${l.employee}`, 'SYSTEM', [
      { account: '1400', description: `${l.type === 'STAFF_LOAN' ? 'Staff loan' : 'Salary advance'} — ${l.employee}`, debit: l.amount, credit: 0 },
      { account: '1000', description: 'Paid by EFT', debit: 0, credit: l.amount }
    ], { origin: 'Staff debt' });
    l.disbursedJournalId = j.id;
  }
  if (staff[2])
    staffLoans.push({
      id: 'sl3',
      number: `SL-${year}-0003`,
      employeeId: staff[2].staffId,
      employee: staff[2].fullName,
      type: 'STAFF_LOAN',
      amount: 80_000,
      monthly: 10_000,
      date: addDays(TODAY, -1),
      recovered: [],
      status: 'SUBMITTED',
      preparedBy: grace.name,
      approvals: [],
      history: [{ at: at(addDays(TODAY, -1), 9), by: grace.name, action: 'Requested' }]
    });

  // ---- VAT returns already filed (the seeded VAT journals)
  const taxFilings: FinanceState['taxFilings'] = state.journals
    .filter((j) => j.memo.startsWith('VAT return — '))
    .map((j, i) => ({ id: `tf${i + 1}`, tax: 'V16', period: periodOf(addMonths(j.date, -1)), amount: j.lines.find((l) => l.account === '1000')?.credit ?? 0, status: 'PAID', ackNo: `KRA2026${String(400_000 + i * 137).padStart(9, '0')}`, filedBy: david.name, filedAt: at(addDays(j.date, -2)), journalId: j.id }));

  const costObjects: CostObject[] = [
    { id: 'co1', code: 'PRJ-001', name: 'Kapsumbeiwa withering shed upgrade', type: 'PROJECT', companyId: MAIN_COMPANY, status: 'OPEN', estimate: [{ category: 'Civil works', account: '6400', amount: 1_200_000 }, { category: 'Electrical', account: '6400', amount: 380_000 }], revenueEstimate: 0 },
    { id: 'co2', code: 'ORD-HT-7741', name: 'Horizon Trading — 20 t BOP1 export order', type: 'ORDER', customerId: 'c8', companyId: MAIN_COMPANY, status: 'COMPLETED', estimate: [{ category: 'Tea purchases (auction)', account: '5000', amount: 5_600_000 }, { category: 'Packaging', account: '5000', amount: 110_000 }, { category: 'Clearing & freight', account: '5100', amount: 165_000 }], revenueEstimate: 7_990_000 },
    { id: 'co3', code: 'EVT-2026-AUC', name: 'Mombasa Tea Auction buyers week', type: 'EVENT', companyId: MAIN_COMPANY, status: 'OPEN', estimate: [{ category: 'Hosting & samples', account: '6600', amount: 250_000 }], revenueEstimate: 0 }
  ];

  return {
    ...state,
    accounts,
    parties,
    periods,
    assets: state.assets.map((a) => ({ ...a, ...ASSET_LINKS[a.id], companyId: MAIN_COMPANY, method: 'SL', history: [{ at: at(a.acquired, 12), by: 'System', action: 'Taken on from the previous asset register' }] })),
    documents,
    journals: [...state.journals, ...journals],
    memos,
    companies: COMPANIES,
    activeCompany: MAIN_COMPANY,
    fiscalYears,
    taxCodes: TAX_CODES,
    currencies: CURRENCIES(year),
    costCenters: COST_CENTERS,
    costObjects,
    reasonCodes: REASON_CODES,
    approvalRules: APPROVAL_RULES,
    settings: DEFAULT_SETTINGS,
    applications: [],
    recurring: [
      { id: 'rc1', name: 'Office & warehouse rent', kind: 'BILL', partyId: 's1', lines: [{ id: lid(), description: 'Office & warehouse rent', account: '6100', qty: 1, price: 380_000, vat: true, taxCode: 'V16', taxRate: 0.16, costCenter: 'CC-ADM' }], department: 'Administration', frequency: 'MONTHLY', dayOfMonth: 1, start: `${year}-01-01`, end: `${year + 1}-12-31`, nextRun: iso(new Date(year, month + 1, 1)), notifyDaysBefore: 5, active: true, generated: [], companyId: MAIN_COMPANY },
      { id: 'rc2', name: 'Guarding services', kind: 'BILL', partyId: 's5', lines: [{ id: lid(), description: 'Guarding services', account: '6550', qty: 1, price: 218_000, vat: true, taxCode: 'V16', taxRate: 0.16, costCenter: 'CC-ADM' }], department: 'Administration', frequency: 'MONTHLY', dayOfMonth: 3, start: `${year}-01-01`, nextRun: iso(new Date(year, month + 1, 3)), notifyDaysBefore: 3, active: true, generated: [], companyId: MAIN_COMPANY },
      { id: 'rc3', name: 'Tea tasting retainer — Nairobi Medical Centre canteen', kind: 'INVOICE', partyId: 'c3', lines: [{ id: lid(), description: 'Monthly tea supply & tasting retainer', account: '4020', qty: 1, price: 145_000, vat: true, taxCode: 'V16', taxRate: 0.16, costCenter: 'PC-LOCAL' }], department: 'Sales', frequency: 'MONTHLY', dayOfMonth: 1, start: addMonths(TODAY, -2), end: addMonths(TODAY, 10), nextRun: addDays(TODAY, 2), notifyDaysBefore: 5, active: true, generated: [], companyId: MAIN_COMPANY },
      { id: 'rc4', name: 'Annual software licences', kind: 'BILL', partyId: 's3', lines: [{ id: lid(), description: 'ERP & email licences — annual', account: '6700', qty: 1, price: 540_000, vat: true, taxCode: 'V16', taxRate: 0.16, costCenter: 'CC-ICT' }], department: 'ICT', frequency: 'ANNUAL', dayOfMonth: 15, start: `${year}-01-15`, nextRun: `${year + 1}-01-15`, notifyDaysBefore: 30, active: true, generated: [], companyId: MAIN_COMPANY }
    ],
    journalTemplates: [
      { id: 'jt1', name: 'Insurance prepayment release', memo: 'Prepaid insurance — release for the month', lines: [{ id: lid(), account: '6600', description: 'Insurance expense', debit: 62_500, credit: 0, department: 'Administration' }, { id: lid(), account: '1300', description: 'Prepaid insurance', debit: 0, credit: 62_500 }], frequency: 'MONTHLY', nextRun: iso(new Date(year, month + 1, 0)), autoReverse: false, reasonCode: 'PRE', generated: [] },
      { id: 'jt2', name: 'Audit fee accrual (auto-reversing)', memo: 'Accrue external audit fees', lines: [{ id: lid(), account: '6500', description: 'Audit fee accrual', debit: 120_000, credit: 0, department: 'Finance' }, { id: lid(), account: '2200', description: 'Accrued audit fees', debit: 0, credit: 120_000 }], frequency: 'MONTHLY', nextRun: iso(new Date(year, month + 1, 0)), autoReverse: true, reasonCode: 'ACC', generated: [] }
    ],
    paymentRuns: [],
    budgetChanges: [],
    objectives,
    budgets,
    reportDefs: [
      {
        id: 'rd1',
        name: 'Management accounts — summary',
        owner: david.name,
        pinned: true,
        groupBy: 'NONE',
        columns: ['ACTUAL', 'BUDGET', 'VARIANCE', 'PRIOR_YEAR'],
        rows: [
          { id: 'r1', label: 'Revenue', kind: 'LINE', accounts: 'group:Revenue', negate: false },
          { id: 'r2', label: 'Cost of sales', kind: 'LINE', accounts: 'group:Cost of sales' },
          { id: 'r3', label: 'Gross margin', kind: 'SUBTOTAL', formula: 'r1,-r2' },
          { id: 'r4', label: 'Staff costs', kind: 'LINE', accounts: 'group:Staff costs' },
          { id: 'r5', label: 'Premises & utilities', kind: 'LINE', accounts: 'group:Premises' },
          { id: 'r6', label: 'Operations & transport', kind: 'LINE', accounts: 'group:Operations' },
          { id: 'r7', label: 'Administration & ICT', kind: 'LINE', accounts: 'group:Administration' },
          { id: 'r8', label: 'Depreciation', kind: 'LINE', accounts: 'group:Depreciation' },
          { id: 'r9', label: 'Overheads', kind: 'SUBTOTAL', formula: 'r4,r5,r6,r7,r8' },
          { id: 'r10', label: 'EBIT', kind: 'SUBTOTAL', formula: 'r3,-r9' },
          { id: 'r11', label: 'Finance costs and other income (net)', kind: 'LINE', accounts: 'group:Finance costs' },
          { id: 'r12', label: 'Profit before tax', kind: 'SUBTOTAL', formula: 'r10,-r11' }
        ]
      }
    ],
    collectionLog: documents
      .filter((d) => d.kind === 'INVOICE' && d.status === 'POSTED' && d.dueDate < addDays(TODAY, -20) && d.dueDate > addDays(TODAY, -70))
      .slice(0, 4)
      .flatMap((d, i) => [
        { id: `cl${i}a`, invoiceId: d.id, partyId: d.partyId, at: at(addDays(d.dueDate, 7)), by: grace.name, action: 'REMINDER' as const, text: `Reminder emailed for ${d.number}` },
        ...(i % 2 ? [{ id: `cl${i}b`, invoiceId: d.id, partyId: d.partyId, at: at(addDays(d.dueDate, 16)), by: grace.name, action: 'PROMISE' as const, text: 'Customer promised to pay after month-end cheque run', promiseDate: addDays(d.dueDate, 30) }] : [])
      ]),
    invoiceBatches: [],
    instruments,
    staffLoans,
    taxFilings,
    allocationRules: [
      { id: 'al1', name: 'ICT costs to user departments', sourceAccount: '6700', targets: [{ costCenter: 'CC-FIN', account: '6700', pct: 20 }, { costCenter: 'CC-FAC', account: '6700', pct: 40 }, { costCenter: 'PC-LOCAL', account: '6700', pct: 25 }, { costCenter: 'CC-ADM', account: '6700', pct: 15 }] },
      { id: 'al2', name: 'Security by site', sourceAccount: '6550', targets: [{ costCenter: 'CC-FAC', account: '6550', pct: 55 }, { costCenter: 'CC-WH', account: '6550', pct: 30 }, { costCenter: 'CC-ADM', account: '6550', pct: 15 }] }
    ],
    activities: [
      { id: 'ab1', name: 'Tea tasting & quality testing', pool: '6400', driver: 'lab tests', usage: { 'PC-EXPORT': 140, 'PC-LOCAL': 60, 'CC-FAC': 320 } },
      { id: 'ab2', name: 'Warehouse handling', pool: '6550', driver: 'pallet moves', usage: { 'PC-EXPORT': 900, 'PC-LOCAL': 650, 'CC-WH': 150 } }
    ],
    inventoryPostings: [],
    rateCards: [
      { id: 'rt1', name: 'Blending technician — per hour', unit: 'HOUR', rate: 1_500, account: '4020' },
      { id: 'rt2', name: 'Tea tasting — per sample', unit: 'ITEM', rate: 2_500, account: '4020' },
      { id: 'rt3', name: 'Bonded storage — per pallet-day', unit: 'DAY', rate: 350, account: '4020' },
      { id: 'rt4', name: 'Contract blending & packing — per kg', unit: 'KG', rate: 45, account: '4020' }
    ],
    invoiceTemplates: [
      { id: 'tpl-std', name: 'Standard tax invoice', showPin: true, showBank: true, showTaxBreakdown: true, footer: 'Goods remain the property of Kericho Highland Estates until paid in full.', accent: '#237857', terms: 'Payment by EFT or cheque within the agreed terms.' },
      { id: 'tpl-exp', name: 'Export invoice (USD, FOB Mombasa)', showPin: false, showBank: true, showTaxBreakdown: false, footer: 'Zero-rated export under the VAT Act 2013, Second Schedule.', accent: '#2b5f9e', terms: 'FOB Mombasa · Payment by TT to KCB USD account 1102 938 5512 (SWIFT KCBLKENX).' },
      { id: 'tpl-hos', name: 'Hospitality group — per-site billing', showPin: true, showBank: true, showTaxBreakdown: true, footer: 'Please quote the site name with your payment.', accent: '#8a4fbf', terms: 'Billing per delivery site; statement monthly.' }
    ],
    statementImports: []
  };
};
