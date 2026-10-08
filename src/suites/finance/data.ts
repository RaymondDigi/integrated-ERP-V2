import type {
  Account,
  Actor,
  BankLine,
  BudgetLine,
  DepreciationRun,
  DocLine,
  FinDocument,
  FinanceState,
  FinRole,
  FixedAsset,
  HistoryEntry,
  Journal,
  JournalLine,
  Party,
  Period,
  Settlement
} from './types';
import { addDays, daysBetween, depreciationFor, docTotals, iso, ledger, periodLabel, periodOf, round2, TODAY, VAT_RATE } from './engine';
import { WORKFORCE } from '../../data/workforce';
import { monthRun } from '../../data/payrollEngine';
import { emptyExtensions, extendSeed } from './ext/seed';

export const ACTORS: Record<FinRole, Actor> = {
  ACCOUNTANT: { role: 'ACCOUNTANT', name: 'Grace Wanjiku', title: 'Accountant' },
  MANAGER: { role: 'MANAGER', name: 'David Otieno', title: 'Finance Manager' },
  DIRECTOR: { role: 'DIRECTOR', name: 'Amina Hassan', title: 'Finance Director' }
};

export const DEPARTMENTS = ['Finance', 'Operations', 'Sales', 'Administration', 'ICT'];

export const ACCOUNTS: Account[] = [
  { code: '1000', name: 'KCB Bank — Main account', type: 'ASSET', group: 'Cash & bank', bank: true },
  { code: '1010', name: 'Equity Bank — Collections', type: 'ASSET', group: 'Cash & bank', bank: true },
  { code: '1020', name: 'M-Pesa float', type: 'ASSET', group: 'Cash & bank', bank: true },
  { code: '1100', name: 'Trade receivables', type: 'ASSET', group: 'Receivables', control: true },
  { code: '1150', name: 'VAT input', type: 'ASSET', group: 'Receivables', control: true },
  { code: '1200', name: 'Inventory', type: 'ASSET', group: 'Current assets' },
  { code: '1300', name: 'Prepayments', type: 'ASSET', group: 'Current assets' },
  { code: '1500', name: 'Motor vehicles', type: 'ASSET', group: 'Fixed assets' },
  { code: '1510', name: 'Plant & machinery', type: 'ASSET', group: 'Fixed assets' },
  { code: '1520', name: 'Computers & office equipment', type: 'ASSET', group: 'Fixed assets' },
  { code: '1590', name: 'Accumulated depreciation', type: 'ASSET', group: 'Fixed assets', control: true },
  { code: '2000', name: 'Trade payables', type: 'LIABILITY', group: 'Payables', control: true },
  { code: '2100', name: 'VAT output', type: 'LIABILITY', group: 'Tax', control: true },
  { code: '2150', name: 'PAYE payable', type: 'LIABILITY', group: 'Tax' },
  { code: '2160', name: 'NSSF, SHIF & housing levy payable', type: 'LIABILITY', group: 'Tax' },
  { code: '2200', name: 'Accrued expenses', type: 'LIABILITY', group: 'Payables' },
  { code: '2500', name: 'Bank loan', type: 'LIABILITY', group: 'Long-term liabilities' },
  { code: '3000', name: 'Share capital', type: 'EQUITY', group: 'Equity' },
  { code: '3100', name: 'Retained earnings', type: 'EQUITY', group: 'Equity' },
  { code: '4000', name: 'Sales — local', type: 'INCOME', group: 'Revenue' },
  { code: '4010', name: 'Sales — export', type: 'INCOME', group: 'Revenue' },
  { code: '4100', name: 'Other income', type: 'INCOME', group: 'Other income' },
  { code: '5000', name: 'Cost of sales — materials & packaging', type: 'EXPENSE', group: 'Cost of sales' },
  { code: '6000', name: 'Salaries & wages', type: 'EXPENSE', group: 'Staff costs' },
  { code: '6100', name: 'Rent & rates', type: 'EXPENSE', group: 'Premises' },
  { code: '6200', name: 'Electricity & water', type: 'EXPENSE', group: 'Premises' },
  { code: '6300', name: 'Fuel & transport', type: 'EXPENSE', group: 'Operations' },
  { code: '6400', name: 'Repairs & maintenance', type: 'EXPENSE', group: 'Operations' },
  { code: '6500', name: 'Legal & professional fees', type: 'EXPENSE', group: 'Administration' },
  { code: '6550', name: 'Security services', type: 'EXPENSE', group: 'Premises' },
  { code: '6600', name: 'Office & marketing', type: 'EXPENSE', group: 'Administration' },
  { code: '6700', name: 'Telephone, internet & software', type: 'EXPENSE', group: 'Administration' },
  { code: '6800', name: 'Depreciation', type: 'EXPENSE', group: 'Depreciation' },
  { code: '6900', name: 'Bank charges', type: 'EXPENSE', group: 'Finance costs' },
  { code: '7000', name: 'Interest on loans', type: 'EXPENSE', group: 'Finance costs' }
];

export const PARTIES: Party[] = [
  { id: 'c1', kind: 'CUSTOMER', name: 'Savannah Retail Ltd', pin: 'P051234561A', email: 'accounts@savannahretail.co.ke', phone: '+254 722 410 220', terms: 30, creditLimit: 6_000_000, category: 'Retail' },
  { id: 'c2', kind: 'CUSTOMER', name: 'Lakeview Hotels Ltd', pin: 'P051876543B', email: 'payables@lakeviewhotels.co.ke', phone: '+254 733 118 905', terms: 30, creditLimit: 3_500_000, category: 'Hospitality' },
  { id: 'c3', kind: 'CUSTOMER', name: 'Nairobi Medical Centre', pin: 'P051443210C', email: 'finance@nmc.co.ke', phone: '+254 711 300 114', terms: 45, creditLimit: 4_000_000, category: 'Healthcare' },
  { id: 'c4', kind: 'CUSTOMER', name: 'Rift Valley Distributors', pin: 'P051998877D', email: 'ap@rvdistributors.co.ke', phone: '+254 720 556 781', terms: 60, creditLimit: 7_500_000, category: 'Distribution' },
  { id: 'c5', kind: 'CUSTOMER', name: 'Coast Hospitality Group', pin: 'P051667788E', email: 'accounts@coasthospitality.co.ke', phone: '+254 741 902 333', terms: 30, creditLimit: 2_500_000, category: 'Hospitality' },
  { id: 'c6', kind: 'CUSTOMER', name: 'Highland Agro Ltd', pin: 'P051223344F', email: 'finance@highlandagro.co.ke', phone: '+254 725 667 120', terms: 45, creditLimit: 5_000_000, category: 'Agriculture' },
  { id: 'c7', kind: 'CUSTOMER', name: 'Metro Supermarkets Ltd', pin: 'P051556677G', email: 'creditors@metrosupermarkets.co.ke', phone: '+254 701 223 448', terms: 60, creditLimit: 8_000_000, category: 'Retail' },
  { id: 'c8', kind: 'CUSTOMER', name: 'Horizon Trading FZE (Dubai)', pin: 'NON-RESIDENT', email: 'ap@horizontrading.ae', phone: '+971 4 555 0192', terms: 60, creditLimit: 10_000_000, category: 'Export' },
  { id: 's1', kind: 'SUPPLIER', name: 'Ridgeways Properties Ltd', pin: 'P051010101H', email: 'rent@ridgewaysproperties.co.ke', phone: '+254 722 000 101', terms: 7, category: 'Premises' },
  { id: 's2', kind: 'SUPPLIER', name: 'Umeme Energy Services', pin: 'P051020202J', email: 'billing@umemeenergy.co.ke', phone: '+254 709 202 020', terms: 14, category: 'Utilities' },
  { id: 's3', kind: 'SUPPLIER', name: 'Unity Telecom Ltd', pin: 'P051030303K', email: 'corporate@unitytelecom.co.ke', phone: '+254 700 303 030', terms: 30, category: 'Telecoms' },
  { id: 's4', kind: 'SUPPLIER', name: 'Kilele Fuel Stations', pin: 'P051040404L', email: 'fleet@kilelefuel.co.ke', phone: '+254 724 404 040', terms: 30, category: 'Fuel' },
  { id: 's5', kind: 'SUPPLIER', name: 'Sentinel Security Services', pin: 'P051050505M', email: 'accounts@sentinelsecurity.co.ke', phone: '+254 735 505 050', terms: 30, category: 'Security' },
  { id: 's6', kind: 'SUPPLIER', name: 'Greenfield Packaging Ltd', pin: 'P051060606N', email: 'sales@greenfieldpackaging.co.ke', phone: '+254 726 606 060', terms: 45, category: 'Materials' },
  { id: 's7', kind: 'SUPPLIER', name: 'Apex Office Supplies', pin: 'P051070707P', email: 'orders@apexoffice.co.ke', phone: '+254 712 707 070', terms: 30, category: 'Office' },
  { id: 's8', kind: 'SUPPLIER', name: 'Baraka Maintenance Ltd', pin: 'P051080808Q', email: 'jobs@barakamaintenance.co.ke', phone: '+254 718 808 080', terms: 30, category: 'Maintenance' },
  { id: 's9', kind: 'SUPPLIER', name: 'Wakili & Partners Advocates', pin: 'P051090909R', email: 'fees@wakilipartners.co.ke', phone: '+254 20 290 9090', terms: 30, category: 'Professional' },
  { id: 's10', kind: 'SUPPLIER', name: 'Pwani Packaging Industries', pin: 'P051101010S', email: 'sales@pwanipackaging.co.ke', phone: '+254 41 222 1010', terms: 30, category: 'Materials' },
  { id: 's11', kind: 'SUPPLIER', name: 'Rift Agro Inputs Ltd', pin: 'P051111111T', email: 'orders@riftagro.co.ke', phone: '+254 51 221 1111', terms: 30, category: 'Raw materials' },
  { id: 's12', kind: 'SUPPLIER', name: 'Sigma Labels & Print', pin: 'P051121212U', email: 'quotes@sigmalabels.co.ke', phone: '+254 20 444 1212', terms: 30, category: 'Materials' }
];

/* Deterministic pseudo-random numbers so the demo looks the same on every load */
const rng = (() => {
  let a = 20_261_007;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
const int = (min: number, max: number) => Math.floor(min + rng() * (max - min + 1));
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];

const SALES_LINES = [
  'Product supply — standard pack',
  'Product supply — premium range',
  'Installation & commissioning',
  'Annual maintenance contract',
  'Staff training services',
  'Logistics & delivery services',
  'Consulting services'
];

interface BillTemplate {
  supplier: string;
  account: string;
  description: string;
  min: number;
  max: number;
  day: number;
  every?: number;
  match?: boolean;
  dept: string;
}
const BILLS: BillTemplate[] = [
  { supplier: 's1', account: '6100', description: 'Office & warehouse rent', min: 380_000, max: 380_000, day: 1, dept: 'Administration' },
  { supplier: 's5', account: '6550', description: 'Guarding services', min: 218_000, max: 218_000, day: 3, dept: 'Administration' },
  { supplier: 's2', account: '6200', description: 'Electricity & water', min: 110_000, max: 175_000, day: 12, dept: 'Operations' },
  { supplier: 's3', account: '6700', description: 'Internet, voice & software licences', min: 78_000, max: 96_000, day: 15, dept: 'ICT' },
  { supplier: 's4', account: '6300', description: 'Fleet fuel', min: 120_000, max: 210_000, day: 21, dept: 'Operations' },
  { supplier: 's6', account: '5000', description: 'Packaging materials', min: 620_000, max: 1_150_000, day: 8, match: true, dept: 'Operations' },
  { supplier: 's7', account: '6600', description: 'Stationery & printing', min: 38_000, max: 115_000, day: 17, every: 2, dept: 'Administration' },
  { supplier: 's8', account: '6400', description: 'Generator & equipment servicing', min: 90_000, max: 340_000, day: 23, every: 2, match: true, dept: 'Operations' },
  { supplier: 's9', account: '6500', description: 'Retainer & contract review', min: 250_000, max: 250_000, day: 10, every: 3, dept: 'Administration' }
];

const ASSETS: Omit<FixedAsset, 'id' | 'number' | 'status'>[] = [
  { name: 'Toyota Hilux double cab — KDA 123A', category: 'Motor vehicles', costAccount: '1500', acquired: '-3y-03-14', cost: 4_200_000, residual: 420_000, lifeMonths: 60, openingDepreciation: 1_680_000, location: 'Head office', custodian: 'Transport Officer' },
  { name: 'Toyota Probox — KDG 456B', category: 'Motor vehicles', costAccount: '1500', acquired: '-2y-07-02', cost: 2_600_000, residual: 260_000, lifeMonths: 60, openingDepreciation: 780_000, location: 'Sales team', custodian: 'Sales Manager' },
  { name: 'Standby generator 250 kVA', category: 'Plant & machinery', costAccount: '1510', acquired: '-3y-01-20', cost: 3_800_000, residual: 0, lifeMonths: 120, openingDepreciation: 950_000, location: 'Factory', custodian: 'Maintenance Lead' },
  { name: 'Automatic packaging line', category: 'Plant & machinery', costAccount: '1510', acquired: '-1y-01-10', cost: 4_200_000, residual: 0, lifeMonths: 120, openingDepreciation: 420_000, location: 'Factory', custodian: 'Production Manager' },
  { name: 'Cold room 40 m³', category: 'Plant & machinery', costAccount: '1510', acquired: '-1y-05-03', cost: 1_500_000, residual: 0, lifeMonths: 96, openingDepreciation: 125_000, location: 'Warehouse', custodian: 'Warehouse Supervisor' },
  { name: 'Rack servers & storage', category: 'Computers & office equipment', costAccount: '1520', acquired: '-1y-06-18', cost: 850_000, residual: 0, lifeMonths: 48, openingDepreciation: 106_000, location: 'Server room', custodian: 'ICT Officer' },
  { name: 'Staff laptops (12)', category: 'Computers & office equipment', costAccount: '1520', acquired: '-1y-10-01', cost: 600_000, residual: 0, lifeMonths: 36, openingDepreciation: 59_000, location: 'Head office', custodian: 'ICT Officer' }
];

const { ACCOUNTANT: grace, MANAGER: david, DIRECTOR: amina } = ACTORS;

const stamp = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:00`;

/** History and approvals for a document that went the whole way to posting. */
const postedTrail = (date: string, value: number) => {
  const approvals = [{ by: david.name, role: david.role, at: stamp(date, 15) }];
  const history: HistoryEntry[] = [
    { at: stamp(date, 9), by: grace.name, action: 'Created' },
    { at: stamp(date, 11), by: grace.name, action: 'Submitted for approval' },
    { at: approvals[0].at, by: david.name, action: 'Approved' }
  ];
  if (value > 1_000_000) {
    const at = stamp(addDays(date, 1), 10);
    approvals.push({ by: amina.name, role: amina.role, at });
    history.push({ at, by: amina.name, action: 'Approved (director)' });
  }
  const posted = stamp(addDays(date, value > 1_000_000 ? 1 : 0), 16);
  history.push({ at: posted, by: david.name, action: 'Posted to ledger' });
  return { status: 'POSTED' as const, preparedBy: grace.name, approvals, history };
};

const trailFor = (status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'POSTED', date: string, value: number) => {
  if (status === 'POSTED') return postedTrail(date, value);
  const history: HistoryEntry[] = [{ at: stamp(date, 9), by: grace.name, action: 'Created' }];
  const approvals: FinDocument['approvals'] = [];
  if (status !== 'DRAFT') history.push({ at: stamp(date, 10), by: grace.name, action: 'Submitted for approval' });
  if (status === 'APPROVED' || (status === 'SUBMITTED' && value > 1_000_000)) {
    approvals.push({ by: david.name, role: david.role, at: stamp(date, 14) });
    history.push({ at: approvals[0].at, by: david.name, action: 'Approved' });
    if (status === 'APPROVED' && value > 1_000_000) {
      approvals.push({ by: amina.name, role: amina.role, at: stamp(date, 16) });
      history.push({ at: approvals[1].at, by: amina.name, action: 'Approved (director)' });
    }
  }
  return { status, preparedBy: grace.name, approvals, history };
};

export const buildSeed = (): FinanceState => {
  const now = new Date(TODAY + 'T00:00:00');
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = (m: number, d: number) => iso(new Date(year, m, d));
  const seq: Record<string, number> = {};
  const next = (prefix: string) => {
    seq[prefix] = (seq[prefix] ?? 0) + 1;
    return `${prefix}-${year}-${String(seq[prefix]).padStart(4, '0')}`;
  };
  let lineId = 0;
  const lid = () => `l${++lineId}`;

  const documents: FinDocument[] = [];
  const settlements: Settlement[] = [];
  const journals: Journal[] = [];

  const journal = (date: string, memo: string, lines: Omit<JournalLine, 'id'>[], source: Journal['source'] = 'MANUAL', status: 'POSTED' | 'DRAFT' | 'SUBMITTED' = 'POSTED') => {
    const total = lines.reduce((s, l) => s + l.debit, 0);
    const j: Journal = {
      id: `jv${journals.length + 1}`,
      number: next('JV'),
      date,
      memo,
      source,
      lines: lines.map((l) => ({ ...l, id: lid(), debit: round2(l.debit), credit: round2(l.credit) })),
      ...(source === 'MANUAL' || status !== 'POSTED'
        ? trailFor(status, date, total)
        : { status: 'POSTED' as const, preparedBy: 'System', approvals: [], history: [{ at: stamp(date, 7), by: 'System', action: 'Posted automatically' }] })
    };
    journals.push(j);
    return j;
  };

  // Opening balances carried forward from last year's audited accounts
  journal(
    day(0, 1),
    `Opening balances ${year}`,
    [
      { account: '1000', description: 'Bank — KCB', debit: 3_850_000, credit: 0 },
      { account: '1010', description: 'Bank — Equity', debit: 1_240_000, credit: 0 },
      { account: '1020', description: 'M-Pesa float', debit: 85_000, credit: 0 },
      { account: '1200', description: 'Inventory', debit: 2_400_000, credit: 0 },
      { account: '1500', description: 'Motor vehicles at cost', debit: 6_800_000, credit: 0 },
      { account: '1510', description: 'Plant & machinery at cost', debit: 9_500_000, credit: 0 },
      { account: '1520', description: 'Computers at cost', debit: 1_450_000, credit: 0 },
      { account: '1590', description: 'Accumulated depreciation', debit: 0, credit: 4_120_000 },
      { account: '2500', description: 'Bank loan', debit: 0, credit: 5_000_000 },
      { account: '3000', description: 'Share capital', debit: 0, credit: 10_000_000 },
      { account: '3100', description: 'Retained earnings', debit: 0, credit: 6_205_000 }
    ],
    'OPENING'
  );

  const recentStatuses: ('DRAFT' | 'SUBMITTED' | 'APPROVED')[] = ['APPROVED', 'SUBMITTED', 'DRAFT'];
  let recentInvoice = 0;
  let recentBill = 0;

  for (let m = 0; m <= month; m++) {
    // ---- Sales invoices
    const count = int(5, 7);
    for (let k = 0; k < count; k++) {
      const date = day(m, Math.min(3 + k * 4 + int(0, 2), 27));
      if (date > TODAY) continue;
      const customer = pick(PARTIES.filter((p) => p.kind === 'CUSTOMER'));
      const exportSale = customer.id === 'c8';
      const lines: DocLine[] = Array.from({ length: int(1, 2) }, () => ({
        id: lid(),
        description: exportSale ? 'Export consignment — FOB Mombasa' : pick(SALES_LINES),
        account: exportSale ? '4010' : '4000',
        qty: int(1, 4),
        price: roundTo(int(110_000, 600_000), 500),
        vat: !exportSale
      }));
      const age = daysBetween(date, TODAY);
      const status = age <= 10 && recentInvoice < recentStatuses.length ? recentStatuses[recentInvoice++] : 'POSTED';
      const doc: FinDocument = {
        id: `inv${documents.length + 1}`,
        kind: 'INVOICE',
        number: next('INV'),
        partyId: customer.id,
        date,
        dueDate: addDays(date, customer.terms),
        reference: exportSale ? `PO-HT-${int(1000, 9999)}` : `LPO ${int(10000, 99999)}`,
        department: 'Sales',
        lines,
        notes: '',
        ...trailFor(status, date, docTotals({ lines }).total)
      };
      documents.push(doc);
    }

    // ---- Supplier bills
    for (const t of BILLS) {
      if (t.every && m % t.every !== 0) continue;
      const date = day(m, t.day);
      if (date > TODAY) continue;
      const amount = roundTo(int(t.min, t.max), 100);
      const supplier = PARTIES.find((p) => p.id === t.supplier)!;
      const lines: DocLine[] = [{ id: lid(), description: `${t.description} — ${periodLabel(periodOf(date), true)}`, account: t.account, qty: 1, price: amount, vat: true }];
      const age = daysBetween(date, TODAY);
      const status = age <= 8 && recentBill < 2 ? (['SUBMITTED', 'DRAFT'] as const)[recentBill++] : 'POSTED';
      documents.push({
        id: `bill${documents.length + 1}`,
        kind: 'BILL',
        number: next('BILL'),
        partyId: supplier.id,
        date,
        dueDate: addDays(date, supplier.terms),
        reference: `${supplier.name.split(' ')[0].toUpperCase()}/${int(1000, 9999)}`,
        department: t.dept,
        lines,
        notes: '',
        match: t.match ? { po: `PO-${year}-${int(100, 999)}`, grn: `GRN-${year}-${int(100, 999)}`, matched: !(age <= 12 && t.supplier === 's8') } : undefined,
        ...trailFor(status, date, docTotals({ lines }).total)
      });
    }

    // ---- Payroll: the main company's monthly run from Employee Payroll (same engine as payslips)
    const payDate = day(m, 25);
    if (payDate <= TODAY) {
      const run = monthRun(WORKFORCE, 'org-kericho', year, m).total;
      const statEe = run.nssf + run.shif + run.ahl;
      const statEr = run.employerNssf + run.employerAhl + run.nita;
      const otherDed = run.other + run.pretax;
      const label = periodLabel(periodOf(payDate), true);
      journal(payDate, `Payroll — ${label} (from Employee Payroll, ${run.workers} staff)`, [
        { account: '6000', description: 'Gross salaries, wages and overtime', debit: run.gross, credit: 0, department: 'Administration' },
        { account: '6000', description: 'Employer NSSF, housing levy and NITA', debit: statEr, credit: 0, department: 'Administration' },
        { account: '2150', description: 'PAYE withheld', debit: 0, credit: run.paye },
        { account: '2160', description: 'NSSF, SHIF, housing levy and NITA (employee and employer)', debit: 0, credit: statEe + statEr },
        { account: '2200', description: 'Pension, loans, SACCO and welfare deductions', debit: 0, credit: otherDed },
        { account: '1000', description: 'Net pay — bank transfer and M-Pesa', debit: 0, credit: run.net }
      ]);
      const remit = day(m + 1, 9);
      if (remit <= TODAY)
        journal(remit, `PAYE, statutory and SACCO remittance — ${label}`, [
          { account: '2150', description: 'PAYE to KRA', debit: run.paye, credit: 0 },
          { account: '2160', description: 'NSSF, SHIF and housing levy', debit: statEe + statEr, credit: 0 },
          { account: '2200', description: 'Pension, loans, SACCO and welfare remitted', debit: otherDed, credit: 0 },
          { account: '1000', description: 'iTax, statutory and third-party payments', debit: 0, credit: run.paye + statEe + statEr + otherDed }
        ]);
    }

    // ---- Loan repayments by standing order (the current month is still on the bank statement only)
    if (m < month) {
      const interest = roundTo(5_000_000 * 0.135 / 12 * (1 - m * 0.03), 1);
      journal(day(m, 5), `Loan repayment — ${periodLabel(periodOf(day(m, 5)), true)}`, [
        { account: '2500', description: 'Loan principal', debit: round2(245_000 - interest), credit: 0 },
        { account: '7000', description: 'Interest', debit: interest, credit: 0 },
        { account: '1000', description: 'Standing order', debit: 0, credit: 245_000 }
      ]);
    }
  }

  // ---- Customer receipts for posted invoices
  for (const d of documents.filter((x) => x.kind === 'INVOICE' && x.status === 'POSTED')) {
    const when = addDays(d.dueDate, int(-12, 18));
    if (when >= TODAY || rng() < 0.035) continue;
    const total = docTotals(d).total;
    const partial = rng() < 0.12;
    const amount = partial ? roundTo(total * 0.5, 1) : total;
    const date = when < d.date ? addDays(d.date, 3) : when;
    settlements.push({
      id: `rct${settlements.length + 1}`,
      kind: 'RECEIPT',
      number: next('RCT'),
      partyId: d.partyId,
      date,
      // Most customers pay into the Equity collections account
      bankAccount: ['c1', 'c3', 'c4', 'c6', 'c7'].includes(d.partyId) ? '1010' : '1000',
      method: d.partyId === 'c8' ? 'RTGS' : pick(['EFT', 'EFT', 'RTGS', 'CHEQUE']),
      reference: `${pick(['FT', 'RTGS', 'CHQ'])}${int(100000, 999999)}`,
      amount,
      allocations: [{ docId: d.id, amount }],
      notes: partial ? 'Part payment — balance promised next month' : '',
      ...postedTrail(date, amount)
    });
  }

  // ---- Supplier payments for posted bills
  for (const d of documents.filter((x) => x.kind === 'BILL' && x.status === 'POSTED')) {
    const date = d.dueDate;
    // Baraka Maintenance invoices are sometimes held back over workmanship queries
    if (date > addDays(TODAY, -2) || (d.partyId === 's8' && rng() < 0.5)) continue;
    const amount = docTotals(d).total;
    settlements.push({
      id: `pay${settlements.length + 1}`,
      kind: 'PAYMENT',
      number: next('PAY'),
      partyId: d.partyId,
      date,
      // Telecoms and fuel are paid from the Equity account
      bankAccount: ['s3', 's4'].includes(d.partyId) ? '1010' : '1000',
      method: amount > 1_000_000 ? 'RTGS' : 'EFT',
      reference: `EFT${int(100000, 999999)}`,
      amount,
      allocations: [{ docId: d.id, amount }],
      notes: '',
      ...postedTrail(addDays(date, -1), amount)
    });
  }

  // A payment run waiting for approval: everything still owed to Greenfield Packaging
  const owedGreenfield = documents.filter(
    (d) => d.kind === 'BILL' && d.partyId === 's6' && d.status === 'POSTED' && !settlements.some((s) => s.allocations.some((a) => a.docId === d.id))
  );
  if (owedGreenfield.length) {
    const allocations = owedGreenfield.map((d) => ({ docId: d.id, amount: docTotals(d).total }));
    const amount = round2(allocations.reduce((s, a) => s + a.amount, 0));
    settlements.push({
      id: `pay${settlements.length + 1}`,
      kind: 'PAYMENT',
      number: next('PAY'),
      partyId: 's6',
      date: TODAY,
      bankAccount: '1000',
      method: 'RTGS',
      reference: '',
      amount,
      allocations,
      notes: 'Packaging materials — clear outstanding invoices',
      ...trailFor('SUBMITTED', TODAY, amount)
    });
  }

  // ---- VAT returns: output VAT less input VAT for each closed month, paid on the 20th
  for (let m = 0; m < month; m++) {
    const due = day(m + 1, 20);
    if (due > TODAY) continue;
    const key = `${year}-${String(m + 1).padStart(2, '0')}`;
    let out = 0;
    let inp = 0;
    for (const d of documents.filter((x) => x.status === 'POSTED' && periodOf(x.date) === key)) {
      const v = docTotals(d).vat;
      if (d.kind === 'INVOICE') out += v;
      else inp += v;
    }
    if (out - inp > 0)
      journal(due, `VAT return — ${periodLabel(key, true)}`, [
        { account: '2100', description: 'Output VAT', debit: round2(out), credit: 0 },
        { account: '1150', description: 'Input VAT claimed', debit: 0, credit: round2(inp) },
        { account: '1000', description: 'VAT paid to KRA', debit: 0, credit: round2(out - inp) }
      ]);
  }

  // ---- Treasury sweep: surplus collections move to the main account on the 28th
  for (let m = 0; m <= month; m++) {
    const date = day(m, 28);
    if (date > TODAY) continue;
    const probe = ledger({ documents, settlements, journals, parties: PARTIES } as unknown as FinanceState);
    const balance = round2(probe.filter((e) => e.account === '1010' && e.date <= date).reduce((x, e) => x + e.debit - e.credit, 0));
    if (balance > 2_000_000)
      journal(date, 'Inter-bank transfer — Equity collections to KCB main', [
        { account: '1000', description: 'Transfer in', debit: roundTo(balance - 1_200_000, 1000), credit: 0 },
        { account: '1010', description: 'Transfer out', debit: 0, credit: roundTo(balance - 1_200_000, 1000) }
      ], 'BANK');
  }

  // ---- Journals waiting in the workflow
  journal(TODAY, 'Accrue external audit fees', [
    { account: '6500', description: 'Audit fee accrual', debit: 350_000, credit: 0, department: 'Finance' },
    { account: '2200', description: 'Accrued audit fees', debit: 0, credit: 350_000 }
  ], 'MANUAL', 'SUBMITTED');
  journal(addDays(TODAY, -1), 'Prepaid insurance — release for the month', [
    { account: '6600', description: 'Insurance expense', debit: 62_500, credit: 0, department: 'Administration' },
    { account: '1300', description: 'Prepaid insurance', debit: 0, credit: 62_500 }
  ], 'MANUAL', 'DRAFT');

  // ---- Fixed assets and the depreciation already charged this year
  const assets: FixedAsset[] = ASSETS.map((a, i) => {
    const [, y, rest] = a.acquired.match(/^-(\d)y-(.+)$/)!;
    return { ...a, id: `fa${i + 1}`, number: `FA-${String(i + 1).padStart(4, '0')}`, acquired: `${year - Number(y)}-${rest}`, status: 'ACTIVE' };
  });
  const periods: Period[] = Array.from({ length: 12 }, (_, m): Period => {
    const key = `${year}-${String(m + 1).padStart(2, '0')}`;
    const closed = m < month - 1;
    return {
      key,
      status: closed ? 'CLOSED' : 'OPEN',
      closedBy: closed ? david.name : undefined,
      closedAt: closed ? stamp(day(m + 1, 6), 17) : undefined,
      checklist: (closed ? { ar: true, ap: true, accruals: true } : m === month - 1 ? { ar: true } : {}) as Record<string, boolean>
    };
  });

  const state: FinanceState = {
    actor: grace,
    accounts: ACCOUNTS,
    parties: PARTIES,
    documents,
    settlements,
    journals,
    bankLines: [],
    assets,
    depreciationRuns: [],
    periods,
    budgets: [],
    budgetYear: year,
    sequence: seq,
    ...emptyExtensions()
  };

  const runs: DepreciationRun[] = [];
  for (let m = 0; m < month - 1; m++) {
    const key = `${year}-${String(m + 1).padStart(2, '0')}`;
    const { perAsset, total } = depreciationFor({ ...state, depreciationRuns: runs }, key);
    const date = day(m + 1, 0);
    const j = journal(date, `Depreciation — ${periodLabel(key, true)}`, [
      { account: '6800', description: 'Depreciation charge', debit: total, credit: 0 },
      { account: '1590', description: 'Accumulated depreciation', debit: 0, credit: total }
    ], 'DEPRECIATION');
    runs.push({ period: key, journalId: j.id, amount: total, perAsset, at: stamp(date, 18), by: david.name });
  }
  state.depreciationRuns = runs;

  // ---- Budgets: a monthly plan for revenue and the main costs (payroll from the current run)
  const payrollRun = monthRun(WORKFORCE, 'org-kericho', year, Math.max(0, month - 1)).total;
  const payrollBudget = roundTo((payrollRun.gross + payrollRun.employerNssf + payrollRun.employerAhl + payrollRun.nita) * 1.02, 1000);
  const plan: [string, string, number][] = [
    ['4000', 'Sales', 6_400_000],
    ['4010', 'Sales', 640_000],
    ['5000', 'Operations', 850_000],
    ['6000', 'Administration', payrollBudget],
    ['6100', 'Administration', 380_000],
    ['6200', 'Operations', 130_000],
    ['6300', 'Operations', 150_000],
    ['6400', 'Operations', 140_000],
    ['6500', 'Administration', 110_000],
    ['6550', 'Administration', 218_000],
    ['6600', 'Administration', 45_000],
    ['6700', 'ICT', 85_000],
    ['6800', 'Finance', 220_000]
  ];
  state.budgets = plan.map(([account, department, base]): BudgetLine => ({
    account,
    department,
    monthly: Array.from({ length: 12 }, (_, m) => roundTo(base * (account.startsWith('4') ? 0.92 + m * 0.012 : 1), 1000))
  }));

  // ---- Bank statement for the main account: the last five weeks
  const entries = ledger(state);
  const lines: BankLine[] = [];
  let bl = 0;
  for (const e of entries.filter((x) => x.account === '1000' && x.date >= addDays(TODAY, -35))) {
    const amount = round2(e.debit - e.credit);
    const age = daysBetween(e.date, TODAY);
    // Recent payments have not cleared and recent receipts are still in transit
    if ((amount < 0 && age < 4) || (amount > 0 && age < 2)) continue;
    const date = addDays(e.date, amount > 0 ? int(0, 1) : int(0, 2));
    if (date > TODAY) continue;
    lines.push({ id: `bk${++bl}`, bankAccount: '1000', date, description: e.memo || e.source, reference: e.ref, amount, matchedTo: age > 9 ? e.id : undefined });
  }
  const extra = (offset: number, description: string, reference: string, amount: number) => {
    const date = addDays(TODAY, -offset);
    lines.push({ id: `bk${++bl}`, bankAccount: '1000', date, description, reference, amount });
  };
  extra(12, 'Ledger fee', 'CHG', -1_200);
  extra(6, 'RTGS charges', 'CHG', -2_450);
  extra(3, 'SMS banking charges', 'CHG', -350);
  if (day(month, 5) <= TODAY) extra(daysBetween(day(month, 5), TODAY), 'Standing order — loan account 0102938', 'SO-LOAN', -245_000);
  extra(4, 'M-Pesa C2B — 254722410220', 'QJ7H2K9LX1', 45_000);
  extra(2, 'Interest on current account', 'INT', 3_812);
  state.bankLines = lines.sort((a, b) => a.date.localeCompare(b.date));

  // Group companies, masters and the TOR extensions (numbers continue the same sequence)
  const extended = extendSeed(state, { next, lid, david: { name: david.name, role: 'MANAGER' }, grace: { name: grace.name, role: 'ACCOUNTANT' }, amina: { name: amina.name, role: 'DIRECTOR' } });
  extended.sequence = { ...seq };
  return extended;
};

/** VAT on an amount (for forms). */
export const vatOf = (amount: number) => round2(amount * VAT_RATE);
