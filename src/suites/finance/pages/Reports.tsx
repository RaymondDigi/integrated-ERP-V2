import React, { useState } from 'react';
import { Printer, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useFinance } from '../store';
import { AGE_BUCKETS, ageing, balanceSheet, docTotals, fmtDate, periodLabel, periodOf, profitAndLoss, round2, TODAY, trialBalance } from '../engine';
import { Chips, SuitePage } from '../../ui/kit';
import { PrintHeader } from '../parts';
import { printArea } from '../../../views/ess/EssRecords';

type Report = 'PL' | 'BS' | 'TB' | 'AR' | 'AP' | 'VAT';
type Range = 'MTD' | 'LAST' | 'YTD';

const n2 = (n: number) => (Math.abs(n) < 0.005 ? '—' : n < 0 ? `(${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2 })})` : n.toLocaleString(undefined, { minimumFractionDigits: 2 }));

export const ReportsPage: React.FC = () => {
  const { state, entries } = useFinance();
  const [report, setReport] = useState<Report>('PL');
  const [range, setRange] = useState<Range>('YTD');
  const year = TODAY.slice(0, 4);
  const thisMonth = periodOf(TODAY);
  const last = (() => {
    const d = new Date(TODAY + 'T00:00:00');
    d.setDate(0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const [from, to, label] =
    range === 'MTD'
      ? [`${thisMonth}-01`, TODAY, `${periodLabel(thisMonth, true)} to date`]
      : range === 'LAST'
        ? [`${last}-01`, `${last}-31`, periodLabel(last, true)]
        : [`${year}-01-01`, TODAY, `Year to ${fmtDate(TODAY)}`];

  const titles: Record<Report, string> = {
    PL: 'Profit and loss',
    BS: 'Balance sheet',
    TB: 'Trial balance',
    AR: 'Receivables ageing',
    AP: 'Payables ageing',
    VAT: 'VAT summary'
  };
  const usesRange = report === 'PL' || report === 'VAT';

  return (
    <SuitePage
      eyebrow="Reports"
      title="Financial reports"
      subtitle="Built live from the general ledger. Print any report on your company letterhead."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={printArea}>
          <Printer size={15} /> Print
        </button>
      }
    >
      <div className="sx-toolbar">
        <Chips
          value={report}
          onChange={setReport}
          options={(Object.keys(titles) as Report[]).map((k) => ({ value: k, label: titles[k] }))}
        />
        {usesRange && (
          <Chips
            value={range}
            onChange={setRange}
            options={[
              { value: 'MTD', label: 'This month' },
              { value: 'LAST', label: 'Last month' },
              { value: 'YTD', label: 'Year to date' }
            ]}
          />
        )}
      </div>

      <article className="sx-report ess-print-area sx-paper">
        <PrintHeader title={titles[report]} meta={[[usesRange ? 'Period' : 'As at', usesRange ? label : fmtDate(TODAY)]]} />
        {report === 'PL' && <ProfitLoss from={from} to={to} />}
        {report === 'BS' && <BalanceSheetView />}
        {report === 'TB' && <TrialBalanceView />}
        {report === 'AR' && <AgeingView kind="INVOICE" />}
        {report === 'AP' && <AgeingView kind="BILL" />}
        {report === 'VAT' && <VatView from={from} to={to} />}
        <p className="sx-report-foot">
          Generated {new Date().toLocaleString('en-GB')} · {state.documents.length + state.settlements.length + state.journals.length} documents · {entries.length} ledger lines
        </p>
      </article>
    </SuitePage>
  );
};

const Section: React.FC<{ title: string; rows: { name: string; amount: number }[]; total: number; totalLabel: string }> = ({ title, rows, total, totalLabel }) => (
  <>
    <tr className="sx-report-section">
      <td colSpan={2}>{title}</td>
    </tr>
    {rows.map((r) => (
      <tr key={r.name}>
        <td className="sx-indent">{r.name}</td>
        <td>{n2(r.amount)}</td>
      </tr>
    ))}
    <tr className="sx-report-sub">
      <td>{totalLabel}</td>
      <td>{n2(total)}</td>
    </tr>
  </>
);

const ProfitLoss: React.FC<{ from: string; to: string }> = ({ from, to }) => {
  const { state, entries } = useFinance();
  const pl = profitAndLoss(state, entries, from, to);
  const map = (list: typeof pl.income) => list.map((r) => ({ name: `${r.account.code} ${r.account.name}`, amount: r.amount }));
  const margin = pl.totalIncome ? (pl.netProfit / pl.totalIncome) * 100 : 0;
  return (
    <table className="sx-report-table">
      <tbody>
        <Section title="Revenue" rows={map(pl.income)} total={pl.totalIncome} totalLabel="Total revenue" />
        <Section title="Cost of sales" rows={map(pl.cogs)} total={pl.totalCogs} totalLabel="Total cost of sales" />
        <tr className="sx-report-total">
          <td>Gross profit</td>
          <td>{n2(pl.grossProfit)}</td>
        </tr>
        <Section title="Operating expenses" rows={map(pl.opex)} total={pl.totalOpex} totalLabel="Total operating expenses" />
        <tr className="sx-report-grand">
          <td>
            Net profit <small>({margin.toFixed(1)}% of revenue)</small>
          </td>
          <td>{n2(pl.netProfit)}</td>
        </tr>
      </tbody>
    </table>
  );
};

const BalanceSheetView: React.FC = () => {
  const { state, entries } = useFinance();
  const bs = balanceSheet(state, entries);
  const map = (list: typeof bs.assets) => list.map((r) => ({ name: `${r.account.code} ${r.account.name}`, amount: r.amount }));
  const balanced = Math.abs(bs.totalAssets - bs.totalLiabilities - bs.totalEquity) < 0.01;
  return (
    <>
      <table className="sx-report-table">
        <tbody>
          <Section title="Assets" rows={map(bs.assets)} total={bs.totalAssets} totalLabel="Total assets" />
          <Section title="Liabilities" rows={map(bs.liabilities)} total={bs.totalLiabilities} totalLabel="Total liabilities" />
          <Section
            title="Equity"
            rows={[...map(bs.equity), { name: 'Profit for the year to date', amount: bs.currentEarnings }]}
            total={bs.totalEquity}
            totalLabel="Total equity"
          />
          <tr className="sx-report-grand">
            <td>Liabilities and equity</td>
            <td>{n2(round2(bs.totalLiabilities + bs.totalEquity))}</td>
          </tr>
        </tbody>
      </table>
      <p className={`sx-check-line ${balanced ? 'ok' : 'bad'}`}>
        {balanced ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {balanced ? 'Assets equal liabilities plus equity' : 'The balance sheet does not balance'}
      </p>
    </>
  );
};

const TrialBalanceView: React.FC = () => {
  const { state, entries } = useFinance();
  const tb = trialBalance(state, entries);
  const dr = round2(tb.reduce((s, r) => s + r.debit, 0));
  const cr = round2(tb.reduce((s, r) => s + r.credit, 0));
  return (
    <>
      <table className="sx-report-table sx-report-cols">
        <thead>
          <tr>
            <th>Account</th>
            <th>Debit</th>
            <th>Credit</th>
          </tr>
        </thead>
        <tbody>
          {tb.map((r) => (
            <tr key={r.account.code}>
              <td>
                {r.account.code} {r.account.name}
              </td>
              <td>{n2(r.debit)}</td>
              <td>{n2(r.credit)}</td>
            </tr>
          ))}
          <tr className="sx-report-grand">
            <td>Totals</td>
            <td>{n2(dr)}</td>
            <td>{n2(cr)}</td>
          </tr>
        </tbody>
      </table>
      <p className={`sx-check-line ${Math.abs(dr - cr) < 0.01 ? 'ok' : 'bad'}`}>
        <CheckCircle2 size={14} /> Debits equal credits
      </p>
    </>
  );
};

const AgeingView: React.FC<{ kind: 'INVOICE' | 'BILL' }> = ({ kind }) => {
  const { state } = useFinance();
  const a = ageing(state, kind);
  return (
    <table className="sx-report-table sx-report-cols sx-report-ageing">
      <thead>
        <tr>
          <th>{kind === 'INVOICE' ? 'Customer' : 'Supplier'}</th>
          {AGE_BUCKETS.map((b) => (
            <th key={b}>{b}</th>
          ))}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {a.rows.map((r) => (
          <tr key={r.party.id}>
            <td>{r.party.name}</td>
            {r.buckets.map((v, i) => (
              <td key={i} className={i >= 3 && v ? 'sx-danger-text' : ''}>
                {n2(v)}
              </td>
            ))}
            <td>
              <b>{n2(r.total)}</b>
            </td>
          </tr>
        ))}
        <tr className="sx-report-grand">
          <td>Total</td>
          {a.totals.map((v, i) => (
            <td key={i}>{n2(v)}</td>
          ))}
          <td>{n2(a.total)}</td>
        </tr>
        <tr className="sx-report-sub">
          <td>Share</td>
          {a.totals.map((v, i) => (
            <td key={i}>{a.total ? `${Math.round((v / a.total) * 100)}%` : '—'}</td>
          ))}
          <td>100%</td>
        </tr>
      </tbody>
    </table>
  );
};

const VatView: React.FC<{ from: string; to: string }> = ({ from, to }) => {
  const { state } = useFinance();
  const docs = state.documents.filter((d) => d.status === 'POSTED' && d.date >= from && d.date <= to);
  const sum = (k: 'INVOICE' | 'BILL', f: 'net' | 'vat') => round2(docs.filter((d) => d.kind === k).reduce((s, d) => s + docTotals(d)[f], 0));
  const zero = round2(docs.filter((d) => d.kind === 'INVOICE').reduce((s, d) => s + d.lines.filter((l) => !l.vat).reduce((x, l) => x + l.qty * l.price, 0), 0));
  const out = sum('INVOICE', 'vat');
  const inp = sum('BILL', 'vat');
  return (
    <table className="sx-report-table">
      <tbody>
        <tr className="sx-report-section">
          <td colSpan={2}>Sales</td>
        </tr>
        <tr>
          <td className="sx-indent">Standard-rated sales (16%)</td>
          <td>{n2(round2(sum('INVOICE', 'net') - zero))}</td>
        </tr>
        <tr>
          <td className="sx-indent">Zero-rated sales (exports)</td>
          <td>{n2(zero)}</td>
        </tr>
        <tr className="sx-report-sub">
          <td>Output VAT</td>
          <td>{n2(out)}</td>
        </tr>
        <tr className="sx-report-section">
          <td colSpan={2}>Purchases</td>
        </tr>
        <tr>
          <td className="sx-indent">Purchases and expenses</td>
          <td>{n2(sum('BILL', 'net'))}</td>
        </tr>
        <tr className="sx-report-sub">
          <td>Input VAT</td>
          <td>{n2(inp)}</td>
        </tr>
        <tr className="sx-report-grand">
          <td>{out - inp >= 0 ? 'VAT payable to KRA' : 'VAT refundable'}</td>
          <td>{n2(Math.abs(round2(out - inp)))}</td>
        </tr>
      </tbody>
    </table>
  );
};
