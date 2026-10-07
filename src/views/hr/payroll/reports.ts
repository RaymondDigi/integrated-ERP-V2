import type { HREmployee } from '../../../types';
import { isCasual, isHeld, MONTHS, payableIn, payslip, periodKey, type PayrollContext, type Payslip } from '../../../data/payrollEngine';
import { componentById } from '../../../data/payComponents';

/** A payslip together with the employee it belongs to (for grouping by department, bank and so on). */
export interface Row {
  e: HREmployee;
  p: Payslip;
}

export interface Period {
  year: number;
  month: number;
  key: string;
  label: string;
}

export const periodOf = (year: number, month: number): Period => {
  const d = new Date(year, month, 1);
  return { year: d.getFullYear(), month: d.getMonth(), key: periodKey(d.getFullYear(), d.getMonth()), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
};

/** The open period and the twelve before it, newest first. */
export const recentPeriods = (open: { year: number; month: number }, back = 12) =>
  Array.from({ length: back + 1 }, (_, i) => periodOf(open.year, open.month - i));

export const rowsFor = (list: HREmployee[], orgIds: string[], period: Period, ctx: PayrollContext): Row[] =>
  orgIds.flatMap((org) =>
    payableIn(list, org, period.year, period.month)
      .filter((e) => !isHeld(ctx, e.staffId, period.key))
      .map((e) => ({ e, p: payslip(e, period.year, period.month, ctx) }))
  );

export const payRail = (e: HREmployee) => (isCasual(e) ? 'M-Pesa' : (e.bankAccountMasked || 'Bank').split(' ')[0]);

/* ------------------------------------------------------------------ measures */

const sumBy = (p: Payslip, pred: (id: string) => boolean) => p.earnings.filter((l) => pred(l.componentId)).reduce((s, l) => s + l.amount, 0);
const dedBy = (p: Payslip, ids: string[]) => p.deductions.filter((d) => ids.includes(d.componentId)).reduce((s, d) => s + d.deducted, 0);

export interface Measure {
  key: string;
  label: string;
  group: 'Pay' | 'Statutory' | 'Deductions' | 'Employer' | 'Count';
  get: (r: Row) => number;
}

export const MEASURES: Measure[] = [
  { key: 'headcount', label: 'Headcount', group: 'Count', get: () => 1 },
  { key: 'basic', label: 'Basic pay', group: 'Pay', get: (r) => r.p.basic + r.p.wages },
  { key: 'allowances', label: 'Allowances', group: 'Pay', get: (r) => r.p.houseAllowance + r.p.transportAllowance + sumBy(r.p, (id) => ['ACTING', 'RESPONSIBILITY'].includes(id)) },
  { key: 'overtime', label: 'Overtime', group: 'Pay', get: (r) => sumBy(r.p, (id) => ['OVERTIME', 'OT_EXTRA', 'HOLIDAY_OT'].includes(id)) },
  { key: 'variable', label: 'Commission & bonuses', group: 'Pay', get: (r) => sumBy(r.p, (id) => ['COMMISSION', 'BONUS', 'SIGNON', 'ARREARS', 'LEAVE_ALLOWANCE'].includes(id)) },
  { key: 'terminal', label: 'Terminal dues', group: 'Pay', get: (r) => sumBy(r.p, (id) => ['LEAVE_PAY', 'NOTICE_PAY', 'SEVERANCE', 'GRATUITY'].includes(id)) },
  { key: 'nontaxable', label: 'Non-taxable cash', group: 'Pay', get: (r) => r.p.exemptCash },
  { key: 'gross', label: 'Gross pay', group: 'Pay', get: (r) => r.p.gross },
  { key: 'bik', label: 'Taxable benefits', group: 'Pay', get: (r) => r.p.benefitsInKind },
  { key: 'taxable', label: 'Taxable pay', group: 'Statutory', get: (r) => Math.round(r.p.tax.taxablePay) },
  { key: 'paye', label: 'PAYE', group: 'Statutory', get: (r) => r.p.paye },
  { key: 'reliefs', label: 'Reliefs', group: 'Statutory', get: (r) => Math.round(r.p.tax.personalRelief + r.p.tax.housingRelief + r.p.tax.insuranceRelief + r.p.tax.pmfRelief) },
  { key: 'nssfEe', label: 'NSSF (employee)', group: 'Statutory', get: (r) => r.p.nssf },
  { key: 'shif', label: 'SHIF', group: 'Statutory', get: (r) => r.p.shif },
  { key: 'ahlEe', label: 'Housing levy (employee)', group: 'Statutory', get: (r) => r.p.ahl },
  { key: 'pension', label: 'Pension & PMF', group: 'Deductions', get: (r) => r.p.pretaxCash },
  { key: 'loans', label: 'Loans & advances', group: 'Deductions', get: (r) => dedBy(r.p, ['STAFF_LOAN', 'SALARY_ADVANCE', 'SACCO_LOAN', 'BANK_CHECKOFF', 'HELB', 'COURT_ORDER']) },
  { key: 'sacco', label: 'SACCO contributions', group: 'Deductions', get: (r) => dedBy(r.p, ['SACCO_SHARES']) },
  { key: 'otherDed', label: 'Other deductions', group: 'Deductions', get: (r) => dedBy(r.p, ['WELFARE', 'UNION_DUES', 'INSURANCE', 'OTHER_DEDUCTION']) },
  { key: 'deferred', label: 'Deferred (over the ⅔ limit)', group: 'Deductions', get: (r) => r.p.deductions.reduce((s, d) => s + d.deferred, 0) },
  { key: 'net', label: 'Net pay', group: 'Deductions', get: (r) => r.p.net },
  { key: 'nssfEr', label: 'NSSF (employer)', group: 'Employer', get: (r) => r.p.employerNssf },
  { key: 'ahlEr', label: 'Housing levy (employer)', group: 'Employer', get: (r) => r.p.employerAhl },
  { key: 'nita', label: 'NITA levy', group: 'Employer', get: (r) => r.p.nita },
  { key: 'cost', label: 'Cost to company', group: 'Employer', get: (r) => r.p.costToCompany }
];

export const measure = (key: string) => MEASURES.find((m) => m.key === key)!;

/* ------------------------------------------------------------------ dimensions */

export interface Dimension {
  key: string;
  label: string;
  get: (r: Row, companyName: (orgId: string) => string) => string;
}

export const DIMENSIONS: Dimension[] = [
  { key: 'department', label: 'Department', get: (r) => r.e.department },
  { key: 'company', label: 'Company', get: (r, name) => name(r.e.orgId) },
  { key: 'branch', label: 'Branch / site', get: (r) => [r.e.branch, r.e.block].filter(Boolean).join(' — ') },
  { key: 'contract', label: 'Contract type', get: (r) => r.e.contractType },
  { key: 'payType', label: 'Pay type', get: (r) => (r.p.casual ? 'Daily-rated' : 'Salaried') },
  { key: 'rail', label: 'Pay rail (bank / M-Pesa)', get: (r) => payRail(r.e) },
  {
    key: 'band',
    label: 'Gross pay band',
    get: (r) => {
      const g = r.p.gross;
      return g < 30_000 ? 'A · under 30K' : g < 60_000 ? 'B · 30K–60K' : g < 100_000 ? 'C · 60K–100K' : g < 200_000 ? 'D · 100K–200K' : 'E · 200K and above';
    }
  },
  { key: 'employee', label: 'Employee', get: (r) => `${r.e.staffId} · ${r.e.fullName}` }
];

export const dimension = (key: string) => DIMENSIONS.find((d) => d.key === key)!;

export interface Grouped {
  key: string;
  values: Record<string, number>;
  rows: Row[];
}

export const group = (rows: Row[], dim: Dimension, measures: Measure[], companyName: (orgId: string) => string): Grouped[] => {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = dim.get(r, companyName);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.entries()].map(([key, rs]) => ({
    key,
    rows: rs,
    values: Object.fromEntries(measures.map((m) => [m.key, rs.reduce((s, r) => s + m.get(r), 0)]))
  }));
};

export const totals = (rows: Row[], measures: Measure[]) => Object.fromEntries(measures.map((m) => [m.key, rows.reduce((s, r) => s + m.get(r), 0)]));

/** Earnings, benefits and deductions summed by component across a set of payslips. */
export const byComponent = (rows: Row[]) => {
  const earn = new Map<string, { label: string; amount: number; count: number }>();
  const add = (m: typeof earn, id: string, label: string, amount: number) => {
    const x = m.get(id) ?? { label, amount: 0, count: 0 };
    x.amount += amount;
    x.count += 1;
    m.set(id, x);
  };
  const ben = new Map<string, { label: string; amount: number; count: number }>();
  const ded = new Map<string, { label: string; amount: number; count: number }>();
  for (const { p } of rows) {
    p.earnings.forEach((l) => add(earn, l.componentId, l.label, l.amount));
    p.benefits.forEach((l) => add(ben, l.componentId, l.label, l.amount));
    p.pretax.filter((l) => l.flags.cash).forEach((l) => add(ded, l.componentId, l.label, l.amount));
    p.deductions.filter((d) => d.deducted).forEach((d) => add(ded, d.componentId, componentById(d.componentId).name, d.deducted));
  }
  const list = (m: typeof earn) => [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.amount - a.amount);
  return { earnings: list(earn), benefits: list(ben), deductions: list(ded) };
};

/* ------------------------------------------------------------------ output */

export const kes = (n: number) => Math.round(n).toLocaleString();

export const downloadCsv = (name: string, header: string[], body: (string | number)[][]) => {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...body].map((r) => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, '-')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export interface Sheet {
  name: string;
  title?: string;
  header: string[];
  rows: (string | number)[][];
  foot?: (string | number)[];
}

/**
 * Excel workbook (SpreadsheetML 2003 — opens directly in Excel and LibreOffice) with one sheet per table.
 * Numbers stay numbers, so totals and formulas work after download.
 */
export const downloadExcel = (name: string, sheets: Sheet[]) => {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cell = (v: string | number, style?: string) =>
    typeof v === 'number' && Number.isFinite(v)
      ? `<Cell${style ? ` ss:StyleID="${style}"` : ' ss:StyleID="n"'}><Data ss:Type="Number">${Math.round(v * 100) / 100}</Data></Cell>`
      : `<Cell${style ? ` ss:StyleID="${style}"` : ''}><Data ss:Type="String">${esc(String(v ?? ''))}</Data></Cell>`;
  const ws = sheets
    .map(
      (sh) => `<Worksheet ss:Name="${esc(sh.name.replace(/[[\]*?/\\:]/g, ' ').slice(0, 31))}"><Table>
${sh.title ? `<Row>${cell(sh.title, 't')}</Row><Row/>` : ''}
<Row>${sh.header.map((h) => cell(h, 'h')).join('')}</Row>
${sh.rows.map((r) => `<Row>${r.map((v) => cell(v)).join('')}</Row>`).join('\n')}
${sh.foot ? `<Row>${sh.foot.map((v) => cell(v, typeof v === 'number' ? 'tn' : 'h')).join('')}</Row>` : ''}
</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><SplitHorizontal>${sh.title ? 3 : 1}</SplitHorizontal><TopRowBottomPane>${sh.title ? 3 : 1}</TopRowBottomPane></WorksheetOptions></Worksheet>`
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
<Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#E8F3EE" ss:Pattern="Solid"/></Style>
<Style ss:ID="t"><Font ss:Bold="1" ss:Size="13"/></Style>
<Style ss:ID="n"><NumberFormat ss:Format="#,##0"/></Style>
<Style ss:ID="tn"><Font ss:Bold="1"/><NumberFormat ss:Format="#,##0"/></Style>
</Styles>
${ws}
</Workbook>`;
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/vnd.ms-excel' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, '-')}.xls`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Words for the net pay line (Kenyan payslips print the amount in words). */
export const amountInWords = (n: number) => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const under1000 = (x: number): string => {
    const h = Math.floor(x / 100);
    const r = x % 100;
    const t = r < 20 ? ones[r] : `${tens[Math.floor(r / 10)]}${r % 10 ? '-' + ones[r % 10] : ''}`;
    return [h ? `${ones[h]} Hundred` : '', t].filter(Boolean).join(' ');
  };
  const v = Math.round(Math.abs(n));
  if (v === 0) return 'Zero Shillings Only';
  const parts: string[] = [];
  const m = Math.floor(v / 1_000_000);
  const th = Math.floor((v % 1_000_000) / 1000);
  const rest = v % 1000;
  if (m) parts.push(`${under1000(m)} Million`);
  if (th) parts.push(`${under1000(th)} Thousand`);
  if (rest) parts.push(under1000(rest));
  return `${parts.join(' ')} Shillings Only`;
};
