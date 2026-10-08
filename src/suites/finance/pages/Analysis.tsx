import React, { useMemo, useState } from 'react';
import { Download, FileBarChart2 } from 'lucide-react';
import { useFinance } from '../store';
import {
  addDays,
  addMonths,
  AGE_BUCKETS,
  ageing,
  asAtView,
  balanceOf,
  balanceSheet,
  curOf,
  daysBetween,
  docBalance,
  docBalanceBase,
  docTotals,
  fxOf,
  JOURNAL_SOURCE,
  kes,
  lineNet,
  periodOf,
  profitAndLoss,
  round2,
  TODAY
} from '../engine';
import type { FinanceState, LedgerEntry } from '../types';
import { Bars, Chips, DataTable, Field, Panel, SuitePage } from '../../ui/kit';
import { downloadText } from '../../../platform/csv';
import { ExportCsvButton, PrintButton, esc } from '../../../platform/Widgets';
import { useAuditTrail } from '../../../platform/audit';
import { ageingByBillTo, balanceHistory, cashBasisPL, cashFlowStatement, commissionsDue, creditAgeing, detailedTrialBalance, esgReport, fundsStatement } from '../ext/analytics';
import { useLookups } from '../parts';

type Cat = 'GL' | 'AR' | 'AP' | 'GRAPHS' | 'OTHER';
type Cell = string | number;
interface Report {
  id: string;
  cat: Cat;
  name: string;
  run: (ctx: Ctx) => { header: string[]; rows: Cell[][]; note?: string };
}
interface Ctx {
  state: FinanceState;
  entries: LedgerEntry[];
  from: string;
  to: string;
  party: (id: string) => string;
  audit: { at: string; by: string; action: string; ref?: string; note?: string; module: string }[];
}

const n = (x: number) => round2(x);
const py = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;

const REPORTS: Report[] = [
  {
    id: 'register',
    cat: 'GL',
    name: 'GL transaction register',
    run: ({ entries, from, to }) => ({
      header: ['Date', 'Reference', 'Source', 'Account', 'Narration', 'Cost centre', 'Debit', 'Credit'],
      rows: entries.filter((e) => e.date >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date)).map((e) => [e.date, e.ref, e.source, e.account, e.memo, e.costCenter ?? e.department ?? '', e.debit, e.credit])
    })
  },
  {
    id: 'dtb',
    cat: 'GL',
    name: 'Detailed trial balance',
    run: ({ state, entries, from, to }) => ({ header: ['Account', 'Name', 'Opening', 'Debits', 'Credits', 'Closing'], rows: detailedTrialBalance(state, entries, from, to).map((r) => [r.account.code, r.account.name, r.opening, r.debit, r.credit, r.closing]) })
  },
  {
    id: 'cbs',
    cat: 'GL',
    name: 'Comparative balance sheet',
    run: ({ state, entries, to }) => {
      const now = balanceSheet(state, entries, to);
      const prev = balanceSheet(state, entries, py(to));
      const rows: Cell[][] = [];
      const add = (label: string, a: { account: { code: string; name: string }; amount: number }[], b: typeof a) => {
        const codes = [...new Set([...a, ...b].map((x) => x.account.code))].sort();
        for (const c of codes) {
          const x = a.find((y) => y.account.code === c);
          const y = b.find((z) => z.account.code === c);
          rows.push([label, `${c} ${(x ?? y)!.account.name}`, x?.amount ?? 0, y?.amount ?? 0, n((x?.amount ?? 0) - (y?.amount ?? 0))]);
        }
      };
      add('Assets', now.assets, prev.assets);
      add('Liabilities', now.liabilities, prev.liabilities);
      add('Equity', now.equity, prev.equity);
      rows.push(['Equity', 'Profit for the year to date', now.currentEarnings, prev.currentEarnings, n(now.currentEarnings - prev.currentEarnings)]);
      return { header: ['Section', 'Account', to, py(to), 'Change'], rows };
    }
  },
  {
    id: 'cis',
    cat: 'GL',
    name: 'Comparative income statement',
    run: ({ state, entries, from, to }) => {
      const a = profitAndLoss(state, entries, from, to);
      const b = profitAndLoss(state, entries, py(from), py(to));
      const all = [...a.income, ...a.cogs, ...a.opex, ...b.income, ...b.cogs, ...b.opex];
      const codes = [...new Set(all.map((x) => x.account.code))].sort();
      const val = (p: typeof a, c: string) => [...p.income, ...p.cogs, ...p.opex].find((x) => x.account.code === c)?.amount ?? 0;
      const rows: Cell[][] = codes.map((c) => {
        const acc = all.find((x) => x.account.code === c)!.account;
        const x = val(a, c);
        const y = val(b, c);
        return [acc.type === 'INCOME' ? 'Income' : acc.group, `${c} ${acc.name}`, x, y, n(x - y), y ? `${Math.round(((x - y) / Math.abs(y)) * 100)}%` : '—'];
      });
      rows.push(['Result', 'Net profit', a.netProfit, b.netProfit, n(a.netProfit - b.netProfit), b.netProfit ? `${Math.round(((a.netProfit - b.netProfit) / Math.abs(b.netProfit)) * 100)}%` : '—']);
      return { header: ['Section', 'Account', 'This period', 'Same period last year', 'Change', '%'], rows };
    }
  },
  {
    id: 'rollup',
    cat: 'GL',
    name: 'Account roll-up (groups)',
    run: ({ state, entries, to }) => {
      const groups = new Map<string, { type: string; amount: number; accounts: number }>();
      for (const a of state.accounts) {
        if (a.statistical) continue;
        const pl = a.type === 'INCOME' || a.type === 'EXPENSE';
        const v = balanceOf(entries, a, { to, from: pl ? `${to.slice(0, 4)}-01-01` : undefined });
        const g = groups.get(a.group) ?? { type: a.type, amount: 0, accounts: 0 };
        g.amount = n(g.amount + v);
        g.accounts++;
        groups.set(a.group, g);
      }
      return { header: ['Type', 'Group', 'Accounts', 'Balance'], rows: [...groups].map(([g, v]) => [v.type, g, v.accounts, v.amount]) };
    }
  },
  {
    id: 'cashflow',
    cat: 'GL',
    name: 'Cash flow statement',
    run: ({ state, entries, from, to }) => {
      const cf = cashFlowStatement(state, entries, from, to);
      const rows: Cell[][] = [
        ['Operating', 'Profit for the period', cf.netProfit],
        ['Operating', 'Depreciation and impairment', cf.depreciation],
        ...cf.lines.OPERATING.map((l) => ['Operating', l.label, l.amount]),
        ['Operating', 'Net cash from operating activities', cf.opTotal],
        ...cf.lines.INVESTING.map((l) => ['Investing', l.label, l.amount]),
        ['Investing', 'Net cash from investing activities', cf.invTotal],
        ...cf.lines.FINANCING.map((l) => ['Financing', l.label, l.amount]),
        ['Financing', 'Net cash from financing activities', cf.finTotal],
        ['Total', 'Net change in cash', cf.net],
        ['Check', 'Change in bank and cash accounts', cf.cashChange]
      ];
      return { header: ['Activity', 'Line', 'Amount'], rows };
    }
  },
  {
    id: 'funds',
    cat: 'GL',
    name: 'Funds statement (sources & uses)',
    run: ({ state, entries, from, to }) => {
      const fs = fundsStatement(state, entries, from, to);
      return { header: ['Side', 'Item', 'Amount'], rows: [...fs.sources.map((s) => ['Source', s.label, s.amount]), ['Source', 'Total sources', fs.totalSources], ...fs.uses.map((s) => ['Use', s.label, s.amount]), ['Use', 'Total uses', fs.totalUses], ['Net', 'Increase / (decrease) in cash', fs.cashChange]] };
    }
  },
  {
    id: 'coa',
    cat: 'GL',
    name: 'Chart of accounts',
    run: ({ state }) => ({ header: ['Code', 'Name', 'Type', 'Group', 'Control', 'Bank', 'Statistical', 'Active'], rows: state.accounts.map((a) => [a.code, a.name, a.type, a.group, a.control ? 'Yes' : '', a.bank ? 'Yes' : '', a.statistical ? `Yes (${a.unit ?? ''})` : '', a.active === false ? 'No' : 'Yes']) })
  },
  {
    id: 'cashbasis',
    cat: 'GL',
    name: 'Income statement — cash basis',
    run: ({ state, from, to }) => {
      const cb = cashBasisPL(state, from, to);
      return { header: ['Account', 'Name', 'Cash amount'], rows: [...cb.rows.map((r) => [r.account.code, r.account.name, r.amount]), ['', 'Cash income', cb.income], ['', 'Cash expenses', cb.expense], ['', 'Net (cash basis)', cb.net]], note: 'Income counts when received and costs when paid, net of VAT; journals that move cash directly are included.' };
    }
  },
  {
    id: 'journals',
    cat: 'GL',
    name: 'Journal audit trail',
    run: ({ state, from, to }) => ({
      header: ['Journal', 'Date', 'Source', 'Reason', 'Prepared by', 'Approved by', 'Status', 'Last action', 'Changes'],
      rows: state.journals
        .filter((j) => j.date >= from && j.date <= to)
        .map((j) => [j.number, j.date, JOURNAL_SOURCE[j.source], j.reasonCode ?? '', j.preparedBy, j.approvals.map((a) => a.by).join(', '), j.status, `${j.history[j.history.length - 1]?.action} (${j.history[j.history.length - 1]?.at})`, j.history.flatMap((h) => h.changes ?? []).map((c) => `${c.field}: ${c.before} → ${c.after}`).join('; ')])
    })
  },
  {
    id: 'audit',
    cat: 'GL',
    name: 'Finance audit log',
    run: ({ audit }) => ({ header: ['When', 'Who', 'Action', 'Reference', 'Detail'], rows: audit.filter((a) => a.module === 'Finance').map((a) => [a.at, a.by, a.action, a.ref ?? '', a.note ?? '']) })
  },
  {
    id: 'ar-open',
    cat: 'AR',
    name: 'Open invoices',
    run: ({ state, party }) => ({ header: ['Invoice', 'Customer', 'Date', 'Due', 'Days late', 'Currency', 'Balance', 'Balance KES'], rows: state.documents.filter((d) => d.kind === 'INVOICE' && d.status === 'POSTED' && docBalance(state, d) > 0.005).map((d) => [d.number, party(d.partyId), d.date, d.dueDate, Math.max(0, daysBetween(d.dueDate, TODAY)), curOf(d), docBalance(state, d), docBalanceBase(state, d)]) })
  },
  {
    id: 'ar-history',
    cat: 'AR',
    name: 'Invoice history by customer',
    run: ({ state, party, from, to }) => ({ header: ['Customer', 'Invoice', 'Date', 'Amount', 'Paid', 'Status'], rows: state.documents.filter((d) => d.kind === 'INVOICE' && d.date >= from && d.date <= to && d.status !== 'VOID').sort((a, b) => party(a.partyId).localeCompare(party(b.partyId))).map((d) => [party(d.partyId), d.number, d.date, docTotals(d).total, n(docTotals(d).total - docBalance(state, d)), d.status]) })
  },
  {
    id: 'ar-daily',
    cat: 'AR',
    name: 'Daily billing summary',
    run: ({ state, from, to }) => {
      const by = new Map<string, { n: number; net: number; vat: number; total: number }>();
      for (const d of state.documents) {
        if (d.kind !== 'INVOICE' || d.status !== 'POSTED' || d.date < from || d.date > to) continue;
        const t = docTotals(d);
        const r = by.get(d.date) ?? { n: 0, net: 0, vat: 0, total: 0 };
        r.n++;
        r.net = n(r.net + t.net * fxOf(d));
        r.vat = n(r.vat + t.vat * fxOf(d));
        r.total = n(r.total + t.total * fxOf(d));
        by.set(d.date, r);
      }
      return { header: ['Date', 'Invoices', 'Net', 'VAT', 'Total (KES)'], rows: [...by].sort().map(([d, r]) => [d, r.n, r.net, r.vat, r.total]) };
    }
  },
  {
    id: 'ar-openhist',
    cat: 'AR',
    name: 'Open items history (as at end date)',
    run: ({ state, party, to }) => {
      const v = asAtView(state, to);
      return { header: ['Invoice', 'Customer', 'Due', 'Open on ' + to], rows: v.documents.filter((d) => d.kind === 'INVOICE' && d.status === 'POSTED' && d.date <= to && docBalance(v, d) > 0.005).map((d) => [d.number, party(d.partyId), d.dueDate, docBalanceBase(v, d)]) };
    }
  },
  {
    id: 'ar-receipts',
    cat: 'AR',
    name: 'Cash receipts by customer and lock box',
    run: ({ state, party, from, to }) => ({ header: ['Receipt', 'Date', 'Customer', 'Lock box / bank', 'Method', 'Reference', 'Amount'], rows: state.settlements.filter((s) => s.kind === 'RECEIPT' && s.status === 'POSTED' && !s.voided && s.date >= from && s.date <= to).map((s) => [s.number, s.date, party(s.partyId), s.bankAccount, s.method, s.reference, s.amount]) })
  },
  {
    id: 'ar-chargebacks',
    cat: 'AR',
    name: 'Open chargebacks',
    run: ({ state, party }) => ({ header: ['Chargeback', 'Customer', 'From invoice', 'Date', 'Open'], rows: state.documents.filter((d) => d.memoType === 'CHARGEBACK' && docBalance(state, d) > 0.005).map((d) => [d.number, party(d.partyId), state.documents.find((x) => x.id === d.relatesTo)?.number ?? '', d.date, docBalance(state, d)]) })
  },
  {
    id: 'ar-credits',
    cat: 'AR',
    name: 'Ageing of unapplied credits',
    run: ({ state, party }) => ({ header: ['Customer', 'Document', 'Kind', 'Date', 'Age bucket', 'Unapplied (KES)'], rows: creditAgeing(state, 'AR').map((r) => [party(r.partyId), r.ref, r.kind, r.date, AGE_BUCKETS[r.bucket], r.amount]) })
  },
  {
    id: 'ar-billto',
    cat: 'AR',
    name: 'Customer ageing by bill-to address',
    run: ({ state, party }) => ({ header: ['Customer', 'Bill-to', ...AGE_BUCKETS, 'Total'], rows: ageingByBillTo(state).map((r) => [party(r.partyId), r.billTo, ...r.buckets, r.total]) })
  },
  {
    id: 'ar-commission',
    cat: 'AR',
    name: 'Sales commissions (net of credit notes)',
    run: ({ state, from, to }) => ({ header: ['Sales rep', 'Sales (net)', 'Credit notes', 'Commission 2%'], rows: commissionsDue(state, from, to).map((r) => [r.rep, r.sales, r.credits, r.commission]) })
  },
  {
    id: 'ap-balances',
    cat: 'AP',
    name: 'Vendor account balances',
    run: ({ state }) => ({ header: ['Supplier', ...AGE_BUCKETS, 'Total'], rows: ageing(state, 'BILL').rows.map((r) => [r.party.name, ...r.buckets, r.total]) })
  },
  {
    id: 'ap-open',
    cat: 'AP',
    name: 'Open supplier invoices',
    run: ({ state, party }) => ({ header: ['Bill', 'Supplier', 'Invoice no.', 'Due', 'Hold', 'Balance'], rows: state.documents.filter((d) => d.kind === 'BILL' && d.status === 'POSTED' && docBalance(state, d) > 0.005).map((d) => [d.number, party(d.partyId), d.reference, d.dueDate, d.hold ? d.hold.reason : '', docBalance(state, d)]) })
  },
  {
    id: 'ap-due',
    cat: 'AP',
    name: 'Payments due by date',
    run: ({ state, party, to }) => ({ header: ['Due', 'Supplier', 'Bill', 'Amount'], rows: state.documents.filter((d) => d.kind === 'BILL' && d.status === 'POSTED' && d.dueDate <= addDays(to, 30) && docBalance(state, d) > 0.005).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((d) => [d.dueDate, party(d.partyId), d.number, docBalanceBase(state, d)]) })
  },
  {
    id: 'ap-history',
    cat: 'AP',
    name: 'Vendor payment history',
    run: ({ state, party, from, to }) => ({ header: ['Payment', 'Date', 'Supplier', 'Method', 'Cheque', 'Bills paid', 'Amount', 'Status'], rows: state.settlements.filter((s) => s.kind === 'PAYMENT' && s.date >= from && s.date <= to).map((s) => [s.number, s.date, party(s.partyId), s.method, s.chequeNo ?? '', s.allocations.map((a) => state.documents.find((d) => d.id === a.docId)?.reference ?? '').join(' '), s.amount, s.voided ? 'Voided' : s.status]) })
  },
  {
    id: 'ap-dist',
    cat: 'AP',
    name: 'General ledger distribution of bills',
    run: ({ state, from, to }) => {
      const by = new Map<string, number>();
      for (const d of state.documents) if (d.kind === 'BILL' && d.status === 'POSTED' && d.date >= from && d.date <= to) for (const l of d.lines) by.set(`${l.account}|${l.costCenter ?? d.department}`, n((by.get(`${l.account}|${l.costCenter ?? d.department}`) ?? 0) + lineNet(l) * fxOf(d)));
      return { header: ['Account', 'Name', 'Cost centre / department', 'Amount'], rows: [...by].map(([k, v]) => { const [a, cc] = k.split('|'); return [a, state.accounts.find((x) => x.code === a)?.name ?? '', cc, v]; }) };
    }
  },
  {
    id: 'esg',
    cat: 'OTHER',
    name: 'ESG financial report',
    run: ({ state, entries, from, to }) => ({ header: ['Category', 'Account', 'Spend (KES)', 'Quantity', 'Unit'], rows: esgReport(state, entries, from, to).map((r) => [r.category, `${r.account.code} ${r.account.name}`, r.spend, r.quantity, r.unit]), note: 'Spend on tagged accounts converted with average factors (e.g. kWh per shilling of electricity, litres per shilling of fuel).' })
  }
];

const GRAPH_KINDS = [
  { id: 'company', label: 'Company receivables' },
  { id: 'customer', label: 'By customer' },
  { id: 'group', label: 'By customer group' },
  { id: 'payables', label: 'Company payables' },
  { id: 'vendor', label: 'By vendor' }
] as const;

/** Reports › Report library: standard GL, receivables and payables reports, ageing graphs, CSV/print and BI export. */
export const AnalysisPage: React.FC = () => {
  const { state, entries } = useFinance();
  const { party } = useLookups();
  const audit = useAuditTrail();
  const [cat, setCat] = useState<Cat>('GL');
  const [id, setId] = useState('register');
  const [from, setFrom] = useState(`${TODAY.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(TODAY);
  const [graph, setGraph] = useState<(typeof GRAPH_KINDS)[number]['id']>('company');
  const [who, setWho] = useState('');
  const list = REPORTS.filter((r) => r.cat === cat);
  const report = REPORTS.find((r) => r.id === id && r.cat === cat) ?? list[0];
  const out = useMemo(() => (report ? report.run({ state, entries, from, to, party: (p) => party(p)?.name ?? p, audit }) : null), [report, state, entries, from, to, party, audit]);
  const categories = [...new Set(state.parties.filter((p) => p.kind === 'CUSTOMER').map((p) => p.category))];
  const series = useMemo(() => {
    if (cat !== 'GRAPHS') return [];
    if (graph === 'company') return balanceHistory(state, 'INVOICE');
    if (graph === 'payables') return balanceHistory(state, 'BILL');
    if (graph === 'customer') return balanceHistory(state, 'INVOICE', 12, { partyId: who || state.parties.find((p) => p.kind === 'CUSTOMER')?.id });
    if (graph === 'vendor') return balanceHistory(state, 'BILL', 12, { partyId: who || state.parties.find((p) => p.kind === 'SUPPLIER')?.id });
    return balanceHistory(state, 'INVOICE', 12, { category: who || categories[0] });
  }, [cat, graph, who, state, categories]);

  const exportBi = () => {
    const payload = { generated: new Date().toISOString(), company: state.activeCompany, accounts: state.accounts, ledger: entries, documents: state.documents.map((d) => ({ ...d, total: docTotals(d).total, balance: docBalance(state, d) })), budgets: state.budgets };
    downloadText(`finance-bi-${state.activeCompany}-${TODAY}.json`, JSON.stringify(payload, null, 1), 'application/json');
  };
  const html = () => (out ? `<h1>${esc(report!.name)}</h1><p class="muted">${esc(from)} to ${esc(to)}</p><table><tr>${out.header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>${out.rows.map((r) => `<tr>${r.map((c) => `<td${typeof c === 'number' ? ' class="r"' : ''}>${esc(typeof c === 'number' ? c.toLocaleString() : c)}</td>`).join('')}</tr>`).join('')}</table>` : '');

  return (
    <SuitePage
      eyebrow="Reports"
      title="Report library"
      subtitle="Standard ledger, receivables and payables reports for any date range — print, export to Excel (CSV) or feed a BI tool."
      actions={
        <button type="button" className="btn btn-secondary btn-sm" onClick={exportBi}>
          <Download size={14} /> BI export (JSON)
        </button>
      }
    >
      <Chips<Cat>
        value={cat}
        onChange={(c) => {
          setCat(c);
          setId(REPORTS.find((r) => r.cat === c)?.id ?? '');
        }}
        options={[
          { value: 'GL', label: 'General ledger', count: REPORTS.filter((r) => r.cat === 'GL').length },
          { value: 'AR', label: 'Receivables', count: REPORTS.filter((r) => r.cat === 'AR').length },
          { value: 'AP', label: 'Payables', count: REPORTS.filter((r) => r.cat === 'AP').length },
          { value: 'GRAPHS', label: 'Ageing graphs' },
          { value: 'OTHER', label: 'ESG' }
        ]}
      />
      {cat === 'GRAPHS' ? (
        <Panel
          title="Balances over time (month ends)"
          action={
            <div className="sx-actions">
              <select className="form-control fx-inline-select" value={graph} onChange={(e) => (setGraph(e.target.value as typeof graph), setWho(''))} aria-label="Graph">
                {GRAPH_KINDS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
              {(graph === 'customer' || graph === 'vendor') && (
                <select className="form-control fx-inline-select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Party">
                  {state.parties.filter((p) => p.kind === (graph === 'customer' ? 'CUSTOMER' : 'SUPPLIER')).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              {graph === 'group' && (
                <select className="form-control fx-inline-select" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Customer group">
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>
          }
        >
          <Bars data={series.map((s) => ({ label: s.label, values: [s.current, s.overdue] }))} series={[{ name: 'Not yet due', color: 'var(--sx-blue, #3182ce)' }, { name: 'Overdue', color: 'var(--sx-red, #e53e3e)' }]} format={(x) => kes(x, { compact: true })} />
        </Panel>
      ) : (
        <Panel
          title={
            <select className="form-control fx-inline-select" value={report?.id} onChange={(e) => setId(e.target.value)} aria-label="Report">
              {list.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          }
          subtitle={out?.note}
          action={
            <div className="sx-actions">
              <Field label="From">
                <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="To">
                <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
              {out && <ExportCsvButton name={`${report!.id}-${from}-${to}`} header={out.header} rows={() => out.rows} label="Excel (CSV)" />}
              {out && <PrintButton title={report!.name} html={html} />}
            </div>
          }
          flush
        >
          {out && (
            <DataTable
              rows={out.rows.map((r, i) => ({ r, i }))}
              rowKey={(x) => String(x.i)}
              pageSize={25}
              columns={out.header.map((h, ci) => ({
                key: String(ci),
                header: h,
                render: (x: { r: Cell[] }) => (typeof x.r[ci] === 'number' ? (x.r[ci] as number).toLocaleString() : x.r[ci]),
                sort: (x: { r: Cell[] }) => x.r[ci],
                align: typeof out.rows[0]?.[ci] === 'number' ? ('right' as const) : undefined
              }))}
              empty={<span><FileBarChart2 size={14} /> Nothing in this range</span>}
            />
          )}
        </Panel>
      )}
      <p className="sx-note">Dates default to the year to date ({periodOf(addMonths(TODAY, 0))}). Comparative statements compare with the same dates last year.</p>
    </SuitePage>
  );
};
