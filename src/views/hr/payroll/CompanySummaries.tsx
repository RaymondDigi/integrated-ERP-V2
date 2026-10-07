import React, { useMemo, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { componentById } from '../../../data/payComponents';
import { Printer } from 'lucide-react';
import { Pager, usePaged } from '../../../components/common/Pager';
import { printArea } from '../../ess/EssRecords';
import { PayslipDocument } from './PayslipDocument';
import { ReportPaper, type Report } from './ReportPaper';
import { itemCatalog, itemName, itemValue } from './itemListing';
import { PeriodSelect, useCompanyName } from './shared';
import { byComponent, DIMENSIONS, dimension, group, kes, measure, payRail, periodOf, recentPeriods, rowsFor, totals, type Period, type Row } from './reports';

type ReportId = 'payroll' | 'itemtotals' | 'department' | 'statutory' | 'p10' | 'nssf' | 'shif' | 'ahl' | 'nita' | 'items' | 'payslips' | 'bank' | 'thirdparty' | 'variance' | 'journal';

export const COMPANY_REPORTS: { id: ReportId; name: string; about: string; group: string }[] = [
  { id: 'payroll', name: 'Payroll summary', about: 'Every employee on a row with each pay item through to net pay, subtotals by department or branch, and sign-off', group: 'Payroll' },
  { id: 'itemtotals', name: 'Pay item totals', about: 'Earnings, benefits and deductions by pay item, with last month alongside', group: 'Payroll' },
  { id: 'department', name: 'Department summary', about: 'Headcount, pay, statutory deductions and cost by department', group: 'Payroll' },
  { id: 'payslips', name: 'Company payslips', about: 'Every employee’s payslip for the period, ready to print', group: 'Payroll' },
  { id: 'items', name: 'Payroll items listing', about: 'Pick a pay item (e.g. Acting allowance) to list every employee with it, employee and employer amounts, totals and sign-off', group: 'Payroll' },
  { id: 'statutory', name: 'Statutory remittances', about: 'PAYE, NSSF, SHIF, housing levy and NITA due by the 9th, with schedules', group: 'Statutory' },
  { id: 'p10', name: 'PAYE return (KRA P10)', about: 'Per-employee PAYE working for the iTax P10 upload', group: 'Statutory' },
  { id: 'nssf', name: 'NSSF return', about: 'Tier I and II contributions by employee and employer', group: 'Statutory' },
  { id: 'shif', name: 'SHIF return', about: 'Social Health Insurance Fund contributions for SHA', group: 'Statutory' },
  { id: 'ahl', name: 'Housing levy return', about: 'Affordable Housing Levy, employee and employer shares, for KRA', group: 'Statutory' },
  { id: 'nita', name: 'NITA levy', about: 'Industrial training levy, KES 50 per employee', group: 'Statutory' },
  { id: 'bank', name: 'Net pay by bank & M-Pesa', about: 'Transfer totals per bank and M-Pesa, with each employee’s account', group: 'Payments' },
  { id: 'thirdparty', name: 'Third-party deductions', about: 'Amounts to pay on to SACCOs, banks, HELB, courts, pension and unions', group: 'Payments' },
  { id: 'variance', name: 'Month-on-month changes', about: 'Employees whose pay changed from last month, and why', group: 'Control' },
  { id: 'journal', name: 'Payroll journal', about: 'The ledger entries this payroll posts to Finance', group: 'Control' }
];

const sum = (rows: Row[], k: (r: Row) => number) => rows.reduce((s, r) => s + k(r), 0);
const pct = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${(((a - b) / b) * 100).toFixed(1)}%` : '—');
const dueDate = (p: Period) => {
  const d = new Date(p.year, p.month + 1, 9);
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });
};

const SYSTEM_EARN = ['BASIC', 'HOUSE', 'TRANSPORT', 'OVERTIME', 'WAGES'];

/**
 * Payroll summary: one row per employee with every pay item through to net pay, subtotals per group
 * (department, branch, …), a grand total and sign-off lines. Prints on landscape paper.
 */
const payrollSummary = (rows: Row[], p: Period, scopeLabel: string, groupBy: string, companyName: (o: string) => string): Report => {
  // Columns for every item that appears this period
  const earnIds = new Set<string>();
  const dedIds = new Set<string>();
  for (const { p: s } of rows) {
    s.earnings.forEach((l) => !SYSTEM_EARN.includes(l.componentId) && earnIds.add(l.componentId));
    s.pretax.filter((l) => l.flags.cash).forEach((l) => dedIds.add(l.componentId));
    s.deductions.filter((d) => d.deducted).forEach((d) => dedIds.add(d.componentId));
  }
  const earnCols = [...earnIds].sort((a, b) => componentById(a).name.localeCompare(componentById(b).name));
  const dedCols = [...dedIds].sort((a, b) => (componentById(a).priority ?? 9) - (componentById(b).priority ?? 9) || componentById(a).name.localeCompare(componentById(b).name));
  const earn = (r: Row, id: string) => r.p.earnings.filter((l) => l.componentId === id).reduce((t, l) => t + l.amount, 0);
  const ded = (r: Row, id: string) => r.p.pretax.filter((l) => l.componentId === id && l.flags.cash).reduce((t, l) => t + l.amount, 0) + r.p.deductions.filter((d) => d.componentId === id).reduce((t, d) => t + d.deducted, 0);
  const values = (r: Row): number[] => [
    r.p.casual ? r.p.daysWorked : r.p.daysPaid,
    r.p.basic + r.p.wages,
    r.p.houseAllowance,
    r.p.transportAllowance,
    r.p.overtime,
    ...earnCols.map((c) => earn(r, c)),
    r.p.gross,
    r.p.nssf,
    r.p.shif,
    r.p.ahl,
    r.p.paye,
    ...dedCols.map((c) => ded(r, c)),
    r.p.totalDeductions,
    r.p.net
  ];
  const columns = [
    { label: 'Staff no.' },
    { label: 'Employee' },
    { label: 'Days', num: true },
    { label: 'Basic / wages', num: true },
    { label: 'House', num: true },
    { label: 'Transport', num: true },
    { label: 'Overtime', num: true },
    ...earnCols.map((c) => ({ label: componentById(c).name, num: true })),
    { label: 'Gross pay', num: true },
    { label: 'NSSF', num: true },
    { label: 'SHIF', num: true },
    { label: 'Housing levy', num: true },
    { label: 'PAYE', num: true },
    ...dedCols.map((c) => ({ label: componentById(c).name.replace(/ — .*/, ''), num: true })),
    { label: 'Total deductions', num: true },
    { label: 'Net pay', num: true }
  ];
  const add = (a: number[], b: number[]) => a.map((x, i) => x + b[i]);
  const totalOf = (rs: Row[]) => rs.reduce((acc, r) => add(acc, values(r)), values(rs[0]).map(() => 0));
  const dim = groupBy === 'none' ? null : dimension(groupBy);
  const groups = dim
    ? [...new Map(rows.map((r) => [dim.get(r, companyName), [] as Row[]])).keys()].sort().map((k) => ({ key: k, rows: rows.filter((r) => dim.get(r, companyName) === k) }))
    : [{ key: '', rows }];
  const body: (string | number)[][] = [];
  const subtotal: number[] = [];
  const headings: number[] = [];
  for (const g of groups) {
    if (dim) {
      headings.push(body.length);
      body.push([`${dim.label}: ${g.key}`]);
    }
    [...g.rows]
      .sort((a, b) => a.e.fullName.localeCompare(b.e.fullName))
      .forEach((r) => body.push([r.e.staffId, r.e.fullName, ...values(r)]));
    if (dim) {
      const t: (string | number)[] = totalOf(g.rows);
      t[0] = '';
      subtotal.push(body.length);
      body.push([`Subtotal — ${g.key}`, `${g.rows.length} employee${g.rows.length === 1 ? '' : 's'}`, ...t]);
    }
  }
  const grand = rows.length ? totalOf(rows) : columns.slice(2).map(() => 0);
  return {
    title: 'Payroll summary',
    subtitle: `${p.label} · ${scopeLabel}${dim ? ` · by ${dim.label.toLowerCase()}` : ''}`,
    kpis: [
      { label: 'Employees paid', value: String(rows.length) },
      { label: 'Gross pay', value: `KES ${kes(grand[columns.findIndex((c) => c.label === 'Gross pay') - 2])}` },
      { label: 'Total deductions', value: `KES ${kes(grand[grand.length - 2])}` },
      { label: 'Net pay', value: `KES ${kes(grand[grand.length - 1])}` }
    ],
    sections: [
      {
        columns,
        rows: body,
        foot: ['Grand total', `${rows.length} employees`, '', ...grand.slice(1)],
        note: 'Days column: days paid out of 30 (daily-rated staff: days worked). Loans show the amount recovered this month. Non-cash benefits are taxed but not paid, so they are not in gross pay.'
      }
    ],
    subtotalRows: { 0: subtotal },
    headingRows: { 0: headings },
    blankZero: true,
    landscape: true,
    signatures: ['Prepared by (Payroll Officer)', 'Checked by (HR Manager)', 'Approved by (Finance Manager)', 'Authorised by (Managing Director)']
  };
};

const build = (id: ReportId, rows: Row[], prev: Row[], p: Period, pp: Period, scopeLabel: string, companyName: (o: string) => string, detail: boolean, itemFilter = '', groupBy = 'department'): Report => {
  const subtitle = `${p.label} · ${scopeLabel}`;
  const gross = sum(rows, (r) => r.p.gross);
  const net = sum(rows, (r) => r.p.net);

  if (id === 'payroll') return payrollSummary(rows, p, scopeLabel, groupBy, companyName);

  if (id === 'itemtotals') {
    const now = byComponent(rows);
    const before = byComponent(prev);
    const prevOf = (list: { id: string; amount: number }[], cid: string) => list.find((x) => x.id === cid)?.amount ?? 0;
    const stat = (k: (r: Row) => number) => [sum(rows, k), sum(prev, k)];
    const line = (label: string, [a, b]: number[], n = '') => [label, n, a, b, a - b];
    const cols = [{ label: 'Item' }, { label: 'Employees', num: true }, { label: p.label, num: true }, { label: pp.label, num: true }, { label: 'Change', num: true }];
    return {
      title: 'Pay item totals',
      subtitle,
      kpis: [
        { label: 'Employees paid', value: String(rows.length), sub: `${rows.filter((r) => r.p.casual).length} daily-rated · ${prev.length} last month` },
        { label: 'Gross pay', value: `KES ${kes(gross)}`, sub: `${pct(gross, sum(prev, (r) => r.p.gross))} on ${pp.label}` },
        { label: 'Net pay', value: `KES ${kes(net)}`, sub: `${pct(net, sum(prev, (r) => r.p.net))} on ${pp.label}` },
        { label: 'Cost to company', value: `KES ${kes(sum(rows, (r) => r.p.costToCompany))}`, sub: 'Gross + employer NSSF, levy and NITA' }
      ],
      sections: [
        {
          heading: 'Earnings',
          columns: cols,
          rows: now.earnings.map((x) => [x.label, x.count, x.amount, prevOf(before.earnings, x.id), x.amount - prevOf(before.earnings, x.id)]),
          foot: ['Gross pay', rows.length, gross, sum(prev, (r) => r.p.gross), gross - sum(prev, (r) => r.p.gross)]
        },
        ...(now.benefits.length
          ? [
              {
                heading: 'Non-cash benefits (taxed, not paid)',
                columns: cols,
                rows: now.benefits.map((x) => [x.label, x.count, x.amount, prevOf(before.benefits, x.id), x.amount - prevOf(before.benefits, x.id)])
              }
            ]
          : []),
        {
          heading: 'Statutory deductions',
          columns: cols,
          rows: [
            line('PAYE', stat((r) => r.p.paye), String(rows.filter((r) => r.p.paye).length)),
            line('NSSF (employee)', stat((r) => r.p.nssf), String(rows.length)),
            line('SHIF', stat((r) => r.p.shif), String(rows.length)),
            line('Housing levy (employee)', stat((r) => r.p.ahl), String(rows.length))
          ]
        },
        {
          heading: 'Other deductions',
          columns: cols,
          rows: now.deductions.map((x) => [x.label, x.count, x.amount, prevOf(before.deductions, x.id), x.amount - prevOf(before.deductions, x.id)])
        },
        {
          heading: 'Net pay and employer costs',
          columns: cols,
          rows: [
            line('Net pay', stat((r) => r.p.net), String(rows.length)),
            line('NSSF (employer)', stat((r) => r.p.employerNssf)),
            line('Housing levy (employer)', stat((r) => r.p.employerAhl)),
            line('NITA levy', stat((r) => r.p.nita))
          ],
          foot: ['Cost to company', '', sum(rows, (r) => r.p.costToCompany), sum(prev, (r) => r.p.costToCompany), sum(rows, (r) => r.p.costToCompany) - sum(prev, (r) => r.p.costToCompany)]
        }
      ]
    };
  }

  if (id === 'department') {
    const ms = ['headcount', 'gross', 'paye', 'nssfEe', 'shif', 'ahlEe', 'loans', 'net', 'cost'].map(measure);
    const g = group(rows, { key: 'department', label: 'Department', get: (r) => r.e.department }, ms, companyName).sort((a, b) => b.values.gross - a.values.gross);
    const t = totals(rows, ms);
    return {
      title: 'Department summary',
      subtitle,
      sections: [
        {
          columns: [{ label: 'Department' }, ...ms.map((m) => ({ label: m.label, num: true }))],
          rows: g.map((x) => [x.key, ...ms.map((m) => x.values[m.key])]),
          foot: ['Total', ...ms.map((m) => t[m.key])],
          note: 'Loans include staff loans, advances, SACCO and bank check-offs, HELB and court orders.'
        }
      ]
    };
  }

  if (id === 'statutory') {
    const s = (k: (r: Row) => number) => sum(rows, k);
    const t1 = s((r) => r.p.tax.nssfTierI);
    const t2 = s((r) => r.p.tax.nssfTierII);
    const rows2 = [
      ['PAYE', 'Kenya Revenue Authority (iTax P10)', rows.filter((r) => r.p.paye).length, s((r) => r.p.paye), 0, s((r) => r.p.paye)],
      ['NSSF Tier I', 'NSSF', rows.length, t1, t1, t1 * 2],
      ['NSSF Tier II', 'NSSF', rows.filter((r) => r.p.tax.nssfTierII).length, t2, t2, t2 * 2],
      ['SHIF', 'Social Health Authority', rows.length, s((r) => r.p.shif), 0, s((r) => r.p.shif)],
      ['Affordable Housing Levy', 'Kenya Revenue Authority', rows.length, s((r) => r.p.ahl), s((r) => r.p.employerAhl), s((r) => r.p.ahl + r.p.employerAhl)],
      ['NITA levy', 'National Industrial Training Authority', rows.length, 0, s((r) => r.p.nita), s((r) => r.p.nita)]
    ];
    const total = rows2.reduce((x, r) => x + (r[5] as number), 0);
    const sections: Report['sections'] = [
      {
        heading: `Due by ${dueDate(p)}`,
        columns: [{ label: 'Remittance' }, { label: 'Paid to' }, { label: 'Employees', num: true }, { label: 'Employee', num: true }, { label: 'Employer', num: true }, { label: 'Total', num: true }],
        rows: rows2,
        foot: ['Total', '', '', rows2.reduce((x, r) => x + (r[3] as number), 0), rows2.reduce((x, r) => x + (r[4] as number), 0), total],
        note: `Rates: ${rows[0]?.p.tax.rateTable.id ?? ''} — NSSF limits ${kes(rows[0]?.p.tax.rateTable.nssf.lel ?? 0)} / ${kes(rows[0]?.p.tax.rateTable.nssf.uel ?? 0)}, SHIF 2.75% (min 300), housing levy 1.5% + 1.5%. Late payment attracts a 5% penalty plus interest.`
      }
    ];
    if (detail) {
      const sorted = [...rows].sort((a, b) => a.e.fullName.localeCompare(b.e.fullName));
      sections.push(
        {
          heading: 'PAYE schedule (P10)',
          columns: [{ label: 'Employee' }, { label: 'KRA PIN' }, { label: 'Gross + benefits', num: true }, { label: 'Taxable pay', num: true }, { label: 'Reliefs', num: true }, { label: 'PAYE', num: true }],
          rows: sorted.map((r) => [
            `${r.e.staffId} ${r.e.fullName}`,
            r.e.kraPinMasked,
            r.p.gross + r.p.benefitsInKind,
            Math.round(r.p.tax.taxablePay),
            Math.round(r.p.tax.personalRelief + r.p.tax.housingRelief + r.p.tax.insuranceRelief + r.p.tax.pmfRelief),
            r.p.paye
          ]),
          foot: ['Total', '', s((r) => r.p.gross + r.p.benefitsInKind), s((r) => Math.round(r.p.tax.taxablePay)), '', s((r) => r.p.paye)]
        },
        {
          heading: 'NSSF schedule',
          columns: [{ label: 'Employee' }, { label: 'NSSF no.' }, { label: 'Pensionable pay', num: true }, { label: 'Tier I', num: true }, { label: 'Tier II', num: true }, { label: 'Employee', num: true }, { label: 'Employer', num: true }],
          rows: sorted.map((r) => [`${r.e.staffId} ${r.e.fullName}`, r.e.nssfNoMasked, r.p.tax.nssfBase, r.p.tax.nssfTierI, r.p.tax.nssfTierII, r.p.nssf, r.p.employerNssf]),
          foot: ['Total', '', '', t1, t2, s((r) => r.p.nssf), s((r) => r.p.employerNssf)]
        },
        {
          heading: 'SHIF and housing levy schedule',
          columns: [{ label: 'Employee' }, { label: 'SHIF no.' }, { label: 'SHIF', num: true }, { label: 'Levy (employee)', num: true }, { label: 'Levy (employer)', num: true }],
          rows: sorted.map((r) => [`${r.e.staffId} ${r.e.fullName}`, r.e.shifNoMasked, r.p.shif, r.p.ahl, r.p.employerAhl]),
          foot: ['Total', '', s((r) => r.p.shif), s((r) => r.p.ahl), s((r) => r.p.employerAhl)]
        }
      );
    }
    return {
      title: 'Statutory remittance summary',
      subtitle,
      kpis: [
        { label: 'Total to remit', value: `KES ${kes(total)}`, sub: `by ${dueDate(p)}` },
        { label: 'PAYE', value: `KES ${kes(s((r) => r.p.paye))}` },
        { label: 'NSSF (both shares)', value: `KES ${kes((t1 + t2) * 2)}` },
        { label: 'SHIF + housing levy', value: `KES ${kes(s((r) => r.p.shif + r.p.ahl + r.p.employerAhl))}` }
      ],
      sections
    };
  }

  const byName = [...rows].sort((a, b) => a.e.fullName.localeCompare(b.e.fullName));
  const tot = (k: (r: Row) => number) => sum(rows, k);
  if (id === 'p10') {
    const reliefs = (r: Row) => Math.round(r.p.tax.personalRelief + r.p.tax.housingRelief + r.p.tax.insuranceRelief + r.p.tax.pmfRelief);
    return {
      title: 'PAYE return (KRA P10)',
      subtitle,
      kpis: [
        { label: 'PAYE due', value: `KES ${kes(tot((r) => r.p.paye))}`, sub: `by ${dueDate(p)} on iTax` },
        { label: 'Employees', value: String(rows.length), sub: `${rows.filter((r) => r.p.paye).length} pay tax` },
        { label: 'Reliefs given', value: `KES ${kes(tot(reliefs))}`, sub: 'Personal, housing, insurance, PMF' }
      ],
      sections: [
        {
          columns: [
            { label: 'KRA PIN' },
            { label: 'Employee' },
            { label: 'Type' },
            { label: 'Basic', num: true },
            { label: 'Allowances & other', num: true },
            { label: 'Benefits', num: true },
            { label: 'NSSF & pension', num: true },
            { label: 'SHIF', num: true },
            { label: 'Housing levy', num: true },
            { label: 'Taxable pay', num: true },
            { label: 'Tax charged', num: true },
            { label: 'Reliefs', num: true },
            { label: 'PAYE', num: true }
          ],
          rows: byName.map((r) => [
            r.e.kraPinMasked,
            `${r.e.staffId} ${r.e.fullName}`,
            r.e.tax?.employment === 'SECONDARY' ? 'Secondary' : r.e.tax?.pwdExempt ? 'PWD' : 'Primary',
            r.p.basic + r.p.wages,
            r.p.gross - r.p.basic - r.p.wages - r.p.exemptCash,
            r.p.benefitsInKind,
            r.p.nssf + r.p.tax.pensionAllowed,
            r.p.shif,
            r.p.ahl,
            Math.round(r.p.tax.taxablePay),
            Math.round(r.p.tax.grossTax),
            reliefs(r),
            r.p.paye
          ]),
          foot: ['Total', '', '', tot((r) => r.p.basic + r.p.wages), tot((r) => r.p.gross - r.p.basic - r.p.wages - r.p.exemptCash), tot((r) => r.p.benefitsInKind), tot((r) => r.p.nssf + r.p.tax.pensionAllowed), tot((r) => r.p.shif), tot((r) => r.p.ahl), tot((r) => Math.round(r.p.tax.taxablePay)), tot((r) => Math.round(r.p.tax.grossTax)), tot(reliefs), tot((r) => r.p.paye)],
          note: 'KRA PINs are masked on screen; the iTax upload uses the full PINs from the employee master.'
        }
      ]
    };
  }
  if (id === 'nssf') {
    return {
      title: 'NSSF return',
      subtitle,
      kpis: [
        { label: 'Total to NSSF', value: `KES ${kes(tot((r) => r.p.nssf + r.p.employerNssf))}`, sub: `by ${dueDate(p)}` },
        { label: 'Employee share', value: `KES ${kes(tot((r) => r.p.nssf))}` },
        { label: 'Employer share', value: `KES ${kes(tot((r) => r.p.employerNssf))}` }
      ],
      sections: [
        {
          columns: [{ label: 'NSSF no.' }, { label: 'ID no.' }, { label: 'Employee' }, { label: 'Pensionable pay', num: true }, { label: 'Tier I (EE)', num: true }, { label: 'Tier II (EE)', num: true }, { label: 'Employee', num: true }, { label: 'Employer', num: true }, { label: 'Total', num: true }],
          rows: byName.map((r) => [r.e.nssfNoMasked, r.e.nationalIdMasked, `${r.e.staffId} ${r.e.fullName}`, r.p.tax.nssfBase, r.p.tax.nssfTierI, r.p.tax.nssfTierII, r.p.nssf, r.p.employerNssf, r.p.nssf + r.p.employerNssf]),
          foot: ['Total', '', '', tot((r) => r.p.tax.nssfBase), tot((r) => r.p.tax.nssfTierI), tot((r) => r.p.tax.nssfTierII), tot((r) => r.p.nssf), tot((r) => r.p.employerNssf), tot((r) => r.p.nssf + r.p.employerNssf)],
          note: `Limits ${kes(rows[0]?.p.tax.rateTable.nssf.lel ?? 0)} / ${kes(rows[0]?.p.tax.rateTable.nssf.uel ?? 0)} at 6% each share (${rows[0]?.p.tax.rateTable.id ?? ''}).`
        }
      ]
    };
  }
  if (id === 'shif') {
    return {
      title: 'SHIF return',
      subtitle,
      kpis: [{ label: 'Total to SHA', value: `KES ${kes(tot((r) => r.p.shif))}`, sub: `by ${dueDate(p)}` }, { label: 'Members', value: String(rows.length) }],
      sections: [
        {
          columns: [{ label: 'SHIF no.' }, { label: 'ID no.' }, { label: 'Employee' }, { label: 'Gross pay', num: true }, { label: 'SHIF (2.75%, min 300)', num: true }],
          rows: byName.map((r) => [r.e.shifNoMasked, r.e.nationalIdMasked, `${r.e.staffId} ${r.e.fullName}`, r.p.shifBase, r.p.shif]),
          foot: ['Total', '', '', tot((r) => r.p.shifBase), tot((r) => r.p.shif)]
        }
      ]
    };
  }
  if (id === 'ahl') {
    return {
      title: 'Affordable Housing Levy return',
      subtitle,
      kpis: [
        { label: 'Total to KRA', value: `KES ${kes(tot((r) => r.p.ahl + r.p.employerAhl))}`, sub: `by ${dueDate(p)}` },
        { label: 'Employee share', value: `KES ${kes(tot((r) => r.p.ahl))}` },
        { label: 'Employer share', value: `KES ${kes(tot((r) => r.p.employerAhl))}` }
      ],
      sections: [
        {
          columns: [{ label: 'KRA PIN' }, { label: 'Employee' }, { label: 'Gross pay', num: true }, { label: 'Employee 1.5%', num: true }, { label: 'Employer 1.5%', num: true }, { label: 'Total', num: true }],
          rows: byName.map((r) => [r.e.kraPinMasked, `${r.e.staffId} ${r.e.fullName}`, r.p.ahlBase, r.p.ahl, r.p.employerAhl, r.p.ahl + r.p.employerAhl]),
          foot: ['Total', '', tot((r) => r.p.ahlBase), tot((r) => r.p.ahl), tot((r) => r.p.employerAhl), tot((r) => r.p.ahl + r.p.employerAhl)]
        }
      ]
    };
  }
  if (id === 'nita') {
    const byDept = group(rows, { key: 'department', label: 'Department', get: (r) => r.e.department }, [measure('headcount'), measure('nita')], companyName);
    return {
      title: 'NITA levy',
      subtitle,
      kpis: [{ label: 'Levy due', value: `KES ${kes(tot((r) => r.p.nita))}`, sub: `${rows.length} employees × KES ${rows[0]?.p.nita ?? 50}` }],
      sections: [
        {
          columns: [{ label: 'Department' }, { label: 'Employees', num: true }, { label: 'Levy', num: true }],
          rows: byDept.map((g) => [g.key, g.values.headcount, g.values.nita]),
          foot: ['Total', rows.length, tot((r) => r.p.nita)],
          note: 'Employer-only levy under the Industrial Training Act; approved training can be reclaimed in Training › Costs & NITA.'
        }
      ]
    };
  }
  if (id === 'items') {
    const sign = ['Prepared by (Payroll Officer)', 'Checked by (HR Manager)', 'Approved by (Finance Manager)'];
    if (!itemFilter) {
      // Overview: every item this period with headcount and totals
      const cat = itemCatalog(rows);
      const lines = cat.map((d) => {
        const vals = rows.map((r) => itemValue(r, d.id)).filter((v): v is NonNullable<typeof v> => !!v && (v.ee !== 0 || v.er !== 0));
        return { d, n: vals.length, ee: vals.reduce((t, v) => t + v.ee, 0), er: vals.reduce((t, v) => t + v.er, 0) };
      }).filter((l) => l.n);
      return {
        title: 'Payroll items listing',
        subtitle,
        kpis: [{ label: 'Pay items in use', value: String(lines.length), sub: 'Pick one on the left to list its employees' }],
        sections: [
          {
            columns: [{ label: 'Pay item' }, { label: 'Type' }, { label: 'Employees', num: true }, { label: 'Employee amount', num: true }, { label: 'Employer amount', num: true }, { label: 'Total', num: true }],
            rows: lines.map((l) => [l.d.name, l.d.group, l.n, l.ee, l.er, l.ee + l.er])
          }
        ],
        signatures: sign,
        blankZero: true
      };
    }
    // One item: every employee who has it, with employee and employer amounts
    const withItem = rows
      .map((r) => ({ r, v: itemValue(r, itemFilter) }))
      .filter((x): x is { r: Row; v: NonNullable<typeof x.v> } => !!x.v && (x.v.ee !== 0 || x.v.er !== 0));
    const hasEr = withItem.some((x) => x.v.er);
    const columns = [
      { label: 'Staff no.' },
      { label: 'Employee' },
      { label: 'Department' },
      { label: 'Reference / basis' },
      { label: hasEr ? 'Employee amount' : 'Amount', num: true },
      ...(hasEr ? [{ label: 'Employer amount', num: true }, { label: 'Total', num: true }] : [])
    ];
    const line = (x: (typeof withItem)[number]) => [x.r.e.staffId, x.r.e.fullName, x.r.e.department, x.v.ref, x.v.ee, ...(hasEr ? [x.v.er, x.v.ee + x.v.er] : [])];
    const totals = (xs: typeof withItem) => {
      const ee = xs.reduce((t, x) => t + x.v.ee, 0);
      const er = xs.reduce((t, x) => t + x.v.er, 0);
      return [ee, ...(hasEr ? [er, ee + er] : [])];
    };
    const dim = groupBy === 'none' ? null : dimension(groupBy);
    const body: (string | number)[][] = [];
    const headings: number[] = [];
    const subtotals: number[] = [];
    const keys = dim ? [...new Set(withItem.map((x) => dim.get(x.r, companyName)))].sort() : [''];
    for (const k of keys) {
      const xs = withItem.filter((x) => !dim || dim.get(x.r, companyName) === k).sort((a, b) => a.r.e.fullName.localeCompare(b.r.e.fullName));
      if (dim) {
        headings.push(body.length);
        body.push([`${dim.label}: ${k}`]);
      }
      xs.forEach((x) => body.push(line(x)));
      if (dim) {
        subtotals.push(body.length);
        body.push([`Subtotal — ${k}`, `${xs.length} employee${xs.length === 1 ? '' : 's'}`, '', '', ...totals(xs)]);
      }
    }
    const t = totals(withItem);
    return {
      title: `Payroll item listing — ${itemName(itemFilter)}`,
      subtitle: `${subtitle}${dim ? ` · by ${dim.label.toLowerCase()}` : ''}`,
      kpis: [
        { label: 'Employees', value: String(withItem.length) },
        { label: hasEr ? 'Employee amount' : 'Total amount', value: `KES ${kes(t[0])}` },
        ...(hasEr ? [{ label: 'Employer amount', value: `KES ${kes(t[1])}` }, { label: 'Total', value: `KES ${kes(t[2])}` }] : [])
      ],
      sections: [{ columns, rows: body, foot: ['Total', `${withItem.length} employee${withItem.length === 1 ? '' : 's'}`, '', '', ...t] }],
      headingRows: { 0: headings },
      subtotalRows: { 0: subtotals },
      signatures: sign
    };
  }

  if (id === 'bank') {
    const g = new Map<string, Row[]>();
    rows.forEach((r) => g.set(payRail(r.e), [...(g.get(payRail(r.e)) ?? []), r]));
    const groups = [...g.entries()].sort((a, b) => sum(b[1], (r) => r.p.net) - sum(a[1], (r) => r.p.net));
    return {
      title: 'Net pay by bank & M-Pesa',
      subtitle,
      kpis: groups.slice(0, 4).map(([k, rs]) => ({ label: k, value: `KES ${kes(sum(rs, (r) => r.p.net))}`, sub: `${rs.length} employees` })),
      sections: [
        {
          heading: 'Transfer totals',
          columns: [{ label: 'Bank / rail' }, { label: 'Employees', num: true }, { label: 'Net pay', num: true }],
          rows: groups.map(([k, rs]) => [k, rs.length, sum(rs, (r) => r.p.net)]),
          foot: ['Total', rows.length, net]
        },
        ...(detail
          ? groups.map(([k, rs]) => ({
              heading: k,
              columns: [{ label: 'Employee' }, { label: k === 'M-Pesa' ? 'Phone' : 'Account' }, { label: 'Net pay', num: true }],
              rows: rs.sort((a, b) => a.e.fullName.localeCompare(b.e.fullName)).map((r) => [`${r.e.staffId} ${r.e.fullName}`, k === 'M-Pesa' ? r.e.mpesaPhoneMasked : r.e.bankAccountMasked, r.p.net]),
              foot: ['Total', '', sum(rs, (r) => r.p.net)]
            }))
          : [])
      ]
    };
  }

  if (id === 'thirdparty') {
    type L = { payee: string; label: string; staff: string; amount: number; deferred: number; ref: string };
    const lines: L[] = [];
    for (const r of rows) {
      r.p.pretax.filter((l) => l.flags.cash).forEach((l) => lines.push({ payee: l.componentId === 'PENSION' ? 'Kericho Staff Pension Scheme' : 'Post-retirement medical fund', label: l.label, staff: `${r.e.staffId} ${r.e.fullName}`, amount: l.amount, deferred: 0, ref: l.ref ?? '' }));
      r.p.deductions
        .filter((d) => d.requested)
        .forEach((d) => {
          const payee = d.label.includes(' — ') ? d.label.split(' — ')[1] : d.componentId === 'SACCO_SHARES' ? 'Kericho Tea Growers SACCO' : d.componentId === 'WELFARE' ? 'Staff welfare committee' : d.componentId === 'UNION_DUES' ? 'KPAWU' : componentById(d.componentId).name;
          lines.push({ payee, label: d.label.split(' — ')[0], staff: `${r.e.staffId} ${r.e.fullName}`, amount: d.deducted, deferred: d.deferred, ref: d.ref ?? '' });
        });
    }
    const payees = new Map<string, L[]>();
    lines.forEach((l) => payees.set(l.payee, [...(payees.get(l.payee) ?? []), l]));
    const list = [...payees.entries()].sort((a, b) => b[1].reduce((s, l) => s + l.amount, 0) - a[1].reduce((s, l) => s + l.amount, 0));
    return {
      title: 'Third-party deductions schedule',
      subtitle,
      sections: [
        {
          heading: 'Amounts to pay on',
          columns: [{ label: 'Payee' }, { label: 'Employees', num: true }, { label: 'Deducted', num: true }, { label: 'Deferred', num: true }],
          rows: list.map(([k, ls]) => [k, new Set(ls.map((l) => l.staff)).size, ls.reduce((s, l) => s + l.amount, 0), ls.reduce((s, l) => s + l.deferred, 0)]),
          foot: ['Total', '', lines.reduce((s, l) => s + l.amount, 0), lines.reduce((s, l) => s + l.deferred, 0)],
          note: 'Deferred amounts were held back by the two-thirds limit and roll into next month.'
        },
        ...(detail
          ? list.map(([k, ls]) => ({
              heading: k,
              columns: [{ label: 'Employee' }, { label: 'Deduction' }, { label: 'Reference' }, { label: 'Amount', num: true }, { label: 'Deferred', num: true }],
              rows: ls.map((l) => [l.staff, l.label, l.ref === 'Standing deduction' ? '' : l.ref, l.amount, l.deferred || '']),
              foot: ['Total', '', '', ls.reduce((s, l) => s + l.amount, 0), ls.reduce((s, l) => s + l.deferred, 0) || '']
            }))
          : [])
      ]
    };
  }

  if (id === 'variance') {
    const prevBy = new Map(prev.map((r) => [r.e.staffId, r]));
    const out: (string | number)[][] = [];
    for (const r of rows) {
      const b = prevBy.get(r.e.staffId);
      const why: string[] = [];
      if (!b) why.push('New on payroll');
      else {
        if (r.p.daysPaid !== b.p.daysPaid || r.p.daysWorked !== b.p.daysWorked) why.push(r.p.casual ? `${b.p.daysWorked}→${r.p.daysWorked} days` : `${r.p.daysPaid}/30 days`);
        const ids = (x: Row) => new Set([...x.p.earnings, ...x.p.benefits].map((l) => l.componentId));
        const a1 = ids(r);
        const b1 = ids(b);
        [...a1].filter((x) => !b1.has(x)).forEach((x) => why.push(`+ ${componentById(x).name}`));
        [...b1].filter((x) => !a1.has(x)).forEach((x) => why.push(`− ${componentById(x).name}`));
        if (r.p.overtime !== b.p.overtime) why.push('Overtime hours');
        const dNow = r.p.deductions.reduce((s, d) => s + d.deducted, 0);
        const dPrev = b.p.deductions.reduce((s, d) => s + d.deducted, 0);
        if (dNow !== dPrev) why.push(`Deductions ${dNow > dPrev ? '+' : '−'}${kes(Math.abs(dNow - dPrev))}`);
        if (r.p.tax.rateTable.id !== b.p.tax.rateTable.id) why.push('New statutory rates');
      }
      if (!b || b.p.net !== r.p.net) out.push([`${r.e.staffId} ${r.e.fullName}`, b?.p.gross ?? 0, r.p.gross, b?.p.net ?? 0, r.p.net, r.p.net - (b?.p.net ?? 0), why.join('; ') || 'Rounding']);
    }
    const left = prev.filter((b) => !rows.some((r) => r.e.staffId === b.e.staffId));
    left.forEach((b) => out.push([`${b.e.staffId} ${b.e.fullName}`, b.p.gross, 0, b.p.net, 0, -b.p.net, 'Left — not on this payroll']));
    out.sort((a, b) => Math.abs(b[5] as number) - Math.abs(a[5] as number));
    return {
      title: 'Month-on-month changes',
      subtitle: `${p.label} against ${pp.label} · ${scopeLabel}`,
      kpis: [
        { label: 'Employees with changes', value: String(out.length), sub: `of ${rows.length}` },
        { label: 'Gross change', value: `KES ${kes(gross - sum(prev, (r) => r.p.gross))}`, sub: pct(gross, sum(prev, (r) => r.p.gross)) },
        { label: 'Net change', value: `KES ${kes(net - sum(prev, (r) => r.p.net))}`, sub: pct(net, sum(prev, (r) => r.p.net)) }
      ],
      sections: [
        {
          columns: [{ label: 'Employee' }, { label: `Gross ${pp.label.slice(0, 3)}`, num: true }, { label: `Gross ${p.label.slice(0, 3)}`, num: true }, { label: `Net ${pp.label.slice(0, 3)}`, num: true }, { label: `Net ${p.label.slice(0, 3)}`, num: true }, { label: 'Change', num: true }, { label: 'Why' }],
          rows: out
        }
      ]
    };
  }

  // journal
  const s = (k: (r: Row) => number) => sum(rows, k);
  const er = s((r) => r.p.employerNssf + r.p.employerAhl + r.p.nita);
  const stat = s((r) => r.p.nssf + r.p.shif + r.p.ahl) + er;
  const other = s((r) => r.p.pretaxCash + r.p.deductions.reduce((x, d) => x + d.deducted, 0));
  const lines: (string | number)[][] = [
    ['6000', 'Salaries & wages — gross pay', gross, ''],
    ['6000', 'Salaries & wages — employer NSSF, levy and NITA', er, ''],
    ['2150', 'PAYE payable', '', s((r) => r.p.paye)],
    ['2160', 'NSSF, SHIF, housing levy and NITA payable', '', stat],
    ['2200', 'Pension, loans, SACCO and other deductions payable', '', other],
    ['1000', 'Bank — net pay (bank transfer and M-Pesa)', '', net]
  ];
  return {
    title: 'Payroll journal',
    subtitle,
    sections: [
      {
        columns: [{ label: 'Account' }, { label: 'Description' }, { label: 'Debit', num: true }, { label: 'Credit', num: true }],
        rows: lines,
        foot: ['', 'Total', gross + er, s((r) => r.p.paye) + stat + other + net],
        note: 'Posting the payroll from the Payroll Console sends this journal to Finance as a draft for approval.'
      }
    ]
  };
};

/** All payslips for the period on paper — print gives one per page. */
const CompanyPayslips: React.FC<{ rows: Row[]; period: Period }> = ({ rows, period }) => {
  const { payrollCtx } = useApp();
  const companyName = useCompanyName();
  const sorted = [...rows].sort((a, b) => a.e.department.localeCompare(b.e.department) || a.e.fullName.localeCompare(b.e.fullName));
  const pg = usePaged(sorted, 5, period.key);
  const [all, setAll] = useState(false);
  const print = () => {
    setAll(true);
    setTimeout(() => {
      printArea();
      setTimeout(() => setAll(false), 500);
    }, 60);
  };
  return (
    <>
      <div className="pr-toolbar pr-no-print" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="pr-muted">
          {rows.length} payslips · {period.label}
        </span>
        <button className="btn btn-primary" onClick={print}>
          <Printer size={15} /> Print all {rows.length} payslips
        </button>
      </div>
      {pg.rows.map((r) => (
        <div key={r.e.staffId} style={{ marginBottom: 14 }}>
          <PayslipDocument e={r.e} p={r.p} ctx={payrollCtx} company={companyName(r.e.orgId)} />
        </div>
      ))}
      <div className="hr-table-card">
        <Pager p={pg} noun="payslips" sizes={[5, 10, 25]} />
      </div>
      {all && (
        <div className="sx-print-only pr-print-stack ess-print-area">
          {sorted.map((r) => (
            <PayslipDocument key={r.e.staffId} e={r.e} p={r.p} ctx={payrollCtx} company={companyName(r.e.orgId)} />
          ))}
        </div>
      )}
    </>
  );
};

export const CompanySummaries: React.FC = () => {
  const { hrEmployees, selectedOrgId, payrollOpenPeriod, payrollCtx, tenantOrganizations } = useApp();
  const companyName = useCompanyName();
  const periods = recentPeriods(payrollOpenPeriod, 12);
  const [reportId, setReportId] = useState<ReportId>('payroll');
  const [periodKey, setPeriodKey] = useState(payrollOpenPeriod.key);
  const [scope, setScope] = useState<'company' | 'group'>('company');
  const [detail, setDetail] = useState(false);
  const p = periods.find((x) => x.key === periodKey) ?? periods[0];
  const pp = periodOf(p.year, p.month - 1);
  const orgKey = (scope === 'company' ? [selectedOrgId] : tenantOrganizations.map((t) => t.id).filter((id) => hrEmployees.some((e) => e.orgId === id))).join(',');
  const orgs = orgKey.split(',');
  const rows = useMemo(() => rowsFor(hrEmployees, orgKey.split(','), periodOf(p.year, p.month), payrollCtx), [hrEmployees, orgKey, p.year, p.month, payrollCtx]);
  const prev = useMemo(() => rowsFor(hrEmployees, orgKey.split(','), periodOf(p.year, p.month - 1), payrollCtx), [hrEmployees, orgKey, p.year, p.month, payrollCtx]);
  const scopeLabel = scope === 'company' ? companyName(selectedOrgId) : `Group — ${orgs.length} companies`;
  const [itemFilter, setItemFilter] = useState('');
  const [groupBy, setGroupBy] = useState('department');
  const report = build(reportId, rows, prev, p, pp, scopeLabel, companyName, detail, itemFilter, groupBy);
  const itemComps = itemCatalog(rows);
  const hasDetail = ['statutory', 'bank', 'thirdparty'].includes(reportId);

  return (
    <div className="pr-builder">
      <div className="pr-builder-panel pr-card" style={{ marginBottom: 0 }}>
        <div>
          <h4>Report</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {COMPANY_REPORTS.map((r, i) => (
              <React.Fragment key={r.id}>
              {(i === 0 || COMPANY_REPORTS[i - 1].group !== r.group) && <h4 style={{ margin: '8px 0 2px' }}>{r.group}</h4>}
              <button
                key={r.id}
                onClick={() => setReportId(r.id)}
                className="btn btn-secondary"
                style={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 2,
                  padding: '8px 10px',
                  borderColor: reportId === r.id ? 'var(--brand-primary)' : undefined,
                  background: reportId === r.id ? 'var(--brand-subtle)' : undefined
                }}
              >
                <strong style={{ fontSize: 12.5, color: reportId === r.id ? 'var(--brand-primary)' : undefined }}>{r.name}</strong>
                <span className="pr-muted" style={{ fontWeight: 400, whiteSpace: 'normal' }}>
                  {r.about}
                </span>
              </button>
              </React.Fragment>
            ))}
          </div>
        </div>
        <div>
          <h4>Period</h4>
          <PeriodSelect value={p.key} periods={periods} onChange={(x) => setPeriodKey(x.key)} />
        </div>
        <div>
          <h4>Scope</h4>
          <select className="form-control" value={scope} onChange={(ev) => setScope(ev.target.value as 'company' | 'group')}>
            <option value="company">This company</option>
            <option value="group">Whole group (all companies)</option>
          </select>
        </div>
        {(reportId === 'payroll' || (reportId === 'items' && itemFilter)) && (
          <div>
            <h4>Group and subtotal by</h4>
            <select className="form-control" value={groupBy} onChange={(ev) => setGroupBy(ev.target.value)}>
              <option value="none">No grouping — one list</option>
              {DIMENSIONS.filter((d) => !['employee', 'band'].includes(d.key)).map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {reportId === 'items' && (
          <div>
            <h4>Pay item</h4>
            <select className="form-control" value={itemFilter} onChange={(ev) => setItemFilter(ev.target.value)}>
              <option value="">All pay items — overview</option>
              {(['Earnings', 'Non-cash benefits', 'Before-tax deductions', 'Deductions & loans', 'Statutory'] as const).map((g) => (
                <optgroup key={g} label={g}>
                  {itemComps
                    .filter((c) => c.group === g)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}
        {hasDetail && (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
            <input type="checkbox" checked={detail} onChange={(ev) => setDetail(ev.target.checked)} /> Include employee schedules
          </label>
        )}
      </div>
      <div>
        {reportId === 'payslips' ? (
          <CompanyPayslips rows={rows} period={p} />
        ) : (
          <ReportPaper report={report} company={scope === 'company' ? companyName(selectedOrgId) : `All companies (${orgs.length})`} />
        )}
      </div>
    </div>
  );
};
