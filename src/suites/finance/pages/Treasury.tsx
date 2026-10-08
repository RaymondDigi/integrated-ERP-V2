import React, { useState } from 'react';
import { Landmark, Percent, Plus, TrendingUp, Globe2, ShieldAlert } from 'lucide-react';
import { useFinance } from '../store';
import { daysBetween, fmtDate, kes, money, periodOf, round2, TODAY, addMonths, rateOn } from '../engine';
import type { TreasuryInstrument } from '../types';
import { Chips, DataTable, DefList, Drawer, Panel, Pill, Stat, SuitePage, Timeline } from '../../ui/kit';
import { usePrompt, num } from '../ext/ui';
import { eclRequired } from '../ext/planning';

type Tab = 'PORTFOLIO' | 'LOANS' | 'FX' | 'LC' | 'ECL';
const TYPE_LABEL: Record<TreasuryInstrument['type'], string> = { DEPOSIT: 'Fixed deposit', TBILL: 'Treasury bill', BOND: 'Bond', LOAN_IN: 'Bank loan', LOAN_OUT: 'Loan given', IC_LOAN: 'Inter-company loan', FX_FWD: 'FX forward', LC: 'Letter of credit' };

const marketValue = (i: TreasuryInstrument) => {
  const last = i.marketValues[i.marketValues.length - 1];
  return last ? round2((i.principal * last.price) / 100) : round2(i.principal - i.repaid + i.accrued);
};

/** Treasury: investments with roll-over, bank and inter-company loans, FX forwards, LCs, mark-to-market, FX revaluation and ECL. */
export const TreasuryPage: React.FC = () => {
  const f = useFinance();
  const { state } = f;
  const [tab, setTab] = useState<Tab>('PORTFOLIO');
  const [openId, setOpenId] = useState<string | null>(null);
  const prompt = usePrompt();
  const inv = state.instruments.filter((i) => ['DEPOSIT', 'TBILL', 'BOND'].includes(i.type));
  const loans = state.instruments.filter((i) => ['LOAN_IN', 'LOAN_OUT', 'IC_LOAN'].includes(i.type));
  const open = state.instruments.find((i) => i.id === openId) ?? null;
  const active = inv.filter((i) => i.status === 'ACTIVE');
  const book = round2(active.reduce((x, i) => x + i.principal + i.accrued, 0));
  const mv = round2(active.reduce((x, i) => x + marketValue(i), 0));
  const wYield = book ? active.reduce((x, i) => x + i.rate * i.principal, 0) / active.reduce((x, i) => x + i.principal, 0) : 0;
  const lastMonth = periodOf(addMonths(TODAY, -1));
  const ecl = eclRequired(state);
  const banks = state.accounts.filter((a) => a.bank);

  const newDeal = () =>
    prompt.open({
      title: 'New treasury deal',
      fields: [
        { key: 'type', label: 'Type', type: 'select', options: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })) },
        { key: 'cp', label: 'Counterparty', required: true },
        { key: 'principal', label: 'Principal / nominal', type: 'number', required: true },
        { key: 'cur', label: 'Currency', type: 'select', options: state.currencies.map((c) => ({ value: c.code, label: c.code })) },
        { key: 'rate', label: 'Interest rate (e.g. 0.12)', type: 'number', initial: 0.12 },
        { key: 'price', label: 'Price per 100 (T-bills, bonds)', type: 'number' },
        { key: 'start', label: 'Start', type: 'date', initial: TODAY },
        { key: 'maturity', label: 'Maturity', type: 'date', initial: addMonths(TODAY, 3) },
        { key: 'bank', label: 'Bank account', type: 'select', options: banks.map((b) => ({ value: b.code, label: `${b.code} · ${b.name}` })) },
        { key: 'roll', label: 'Roll over at maturity', type: 'checkbox' },
        { key: 'fwd', label: 'Forward rate (FX forwards)', type: 'number' },
        { key: 'partner', label: 'Partner company (IC loans)', type: 'select', options: [{ value: '', label: '—' }, ...state.companies.filter((c) => c.id !== state.activeCompany).map((c) => ({ value: c.id, label: c.name }))] },
        { key: 'ben', label: 'LC beneficiary' },
        { key: 'po', label: 'LC purchase order' }
      ],
      onSubmit: (v) =>
        f.saveInstrument({
          type: v.type as TreasuryInstrument['type'],
          counterparty: v.cp,
          principal: num(v.principal),
          currency: v.cur,
          rate: num(v.rate),
          price: v.price ? num(v.price) : undefined,
          start: v.start,
          maturity: v.maturity,
          rollover: v.roll === 'true',
          bankAccount: v.bank,
          forwardRate: v.fwd ? num(v.fwd) : undefined,
          partnerCompany: v.partner || undefined,
          lc: v.type === 'LC' ? { beneficiary: v.ben, po: v.po, expiry: v.maturity, stage: 'APPLIED', documents: 'Bill of lading, invoice, packing list, certificate of origin' } : undefined
        })
    });

  const cols = (list: TreasuryInstrument[]) => (
    <DataTable
      rows={list}
      rowKey={(i) => i.id}
      onRowClick={(i) => setOpenId(i.id)}
      columns={[
        { key: 'n', header: 'Deal', render: (i) => <div className="sx-cell-main"><span>{i.number} · {TYPE_LABEL[i.type]}</span><small>{i.counterparty}</small></div>, sort: (i) => i.number },
        { key: 'p', header: 'Principal', render: (i) => money(i.principal - i.repaid, i.currency), sort: (i) => i.principal, align: 'right' },
        { key: 'r', header: 'Rate', render: (i) => (i.type === 'FX_FWD' ? `@ ${i.forwardRate}` : `${(i.rate * 100).toFixed(2)}%`), align: 'right' },
        { key: 'a', header: 'Accrued', render: (i) => (i.accrued ? kes(i.accrued) : '—'), align: 'right' },
        { key: 'mv', header: 'Market value', render: (i) => (i.marketValues.length ? kes(marketValue(i)) : '—'), align: 'right' },
        { key: 'm', header: 'Matures', render: (i) => `${fmtDate(i.maturity)} (${Math.max(0, daysBetween(TODAY, i.maturity))} d)`, sort: (i) => i.maturity },
        { key: 's', header: 'Status', render: (i) => <Pill status={i.status} label={i.lc ? i.lc.stage.replace('_', ' ').toLowerCase() : undefined} /> }
      ]}
      empty="No deals"
    />
  );

  return (
    <SuitePage
      eyebrow="Treasury"
      title="Treasury & risk"
      subtitle="Deposits, T-bills and bonds with roll-over, bank and inter-company loans, FX forwards and letters of credit."
      actions={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => f.accrueInterest(lastMonth)}>
            <Percent size={14} /> Accrue interest ({lastMonth})
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={newDeal}>
            <Plus size={14} /> New deal
          </button>
        </>
      }
    >
      <div className="sx-stats">
        <Stat label="Investments at book" value={kes(book, { compact: true })} detail={`${active.length} active`} icon={<Landmark size={16} />} />
        <Stat label="Market value" value={kes(mv, { compact: true })} detail={`${mv >= book ? '+' : ''}${kes(mv - book, { compact: true })} vs book`} icon={<TrendingUp size={16} />} tone="blue" />
        <Stat label="Weighted yield" value={`${(wYield * 100).toFixed(2)}%`} detail="on principal" icon={<Percent size={16} />} tone="gold" />
        <Stat label="Debt outstanding" value={kes(loans.filter((l) => l.type === 'LOAN_IN' && l.status === 'ACTIVE').reduce((x, l) => x + l.principal - l.repaid, 0), { compact: true })} detail="bank loans" icon={<ShieldAlert size={16} />} tone="red" />
      </div>
      <Chips<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'PORTFOLIO', label: 'Investment portfolio', count: inv.length },
          { value: 'LOANS', label: 'Loans', count: loans.length },
          { value: 'FX', label: 'FX & revaluation' },
          { value: 'LC', label: 'Letters of credit', count: state.instruments.filter((i) => i.type === 'LC').length },
          { value: 'ECL', label: 'Expected credit loss' }
        ]}
      />
      {tab === 'PORTFOLIO' && (
        <>
          {cols(inv)}
          <Panel title="Risk and return">
            <DataTable
              rows={active}
              rowKey={(i) => i.id}
              columns={[
                { key: 'n', header: 'Deal', render: (i) => i.number },
                { key: 'w', header: 'Share of portfolio', render: (i) => `${book ? Math.round(((i.principal + i.accrued) / book) * 100) : 0}%`, align: 'right' },
                { key: 'y', header: 'Running yield', render: (i) => { const last = i.marketValues[i.marketValues.length - 1]; return `${((i.rate / ((last?.price ?? 100) / 100)) * 100).toFixed(2)}%`; }, align: 'right' },
                { key: 'r', header: 'Holding return', render: (i) => { const first = i.marketValues[0]; const last = i.marketValues[i.marketValues.length - 1]; return first && last ? `${(((last.price - first.price) / first.price) * 100).toFixed(2)}% price + ${(i.rate * 100).toFixed(1)}% coupon` : `${(i.rate * 100).toFixed(2)}% interest`; } },
                { key: 'd', header: 'Remaining term', render: (i) => `${(Math.max(0, daysBetween(TODAY, i.maturity)) / 365).toFixed(2)} yrs`, align: 'right' },
                { key: 'risk', header: 'Rate sensitivity (1% move)', render: (i) => kes(round2(((i.principal * Math.max(0, daysBetween(TODAY, i.maturity))) / 365) * 0.01)), align: 'right' }
              ]}
            />
          </Panel>
        </>
      )}
      {tab === 'LOANS' && cols(loans)}
      {tab === 'FX' && (
        <div className="sx-grid sx-grid-2">
          <Panel title="Exchange rates" subtitle="Latest rate per currency (KES per unit)">
            <DataTable
              rows={state.currencies.filter((c) => c.code !== 'KES')}
              rowKey={(c) => c.code}
              columns={[
                { key: 'c', header: 'Currency', render: (c) => `${c.code} · ${c.name}` },
                { key: 'r', header: 'Today', render: (c) => rateOn(state, c.code, TODAY).toFixed(3), align: 'right' },
                { key: 'd', header: 'Since', render: (c) => fmtDate(c.rates[c.rates.length - 1].date) }
              ]}
            />
          </Panel>
          <Panel title="Revalue foreign currency balances" action={<button type="button" className="btn btn-primary btn-sm" onClick={() => f.fxRevaluation(TODAY)}><Globe2 size={14} /> Revalue today</button>}>
            <p>Open foreign-currency invoices, bills and bank balances are restated at today's rate. The unrealised gain or loss posts to 4300 and reverses on the next day.</p>
            {cols(state.instruments.filter((i) => i.type === 'FX_FWD'))}
          </Panel>
        </div>
      )}
      {tab === 'LC' && cols(state.instruments.filter((i) => i.type === 'LC'))}
      {tab === 'ECL' && (
        <Panel title="Expected credit loss — provision matrix" subtitle="Receivables by ageing bucket times the loss rate set in Setup" action={<button type="button" className="btn btn-primary btn-sm" onClick={() => f.postEcl()}>Post ECL movement</button>}>
          <DataTable
            rows={ecl.lines}
            rowKey={(l) => String(l.bucket)}
            columns={[
              { key: 'b', header: 'Bucket', render: (l) => ['Not due', '1–30 days', '31–60 days', '61–90 days', '90+ days'][l.bucket] },
              { key: 'bal', header: 'Receivables', render: (l) => kes(l.balance), align: 'right' },
              { key: 'r', header: 'Loss rate', render: (l) => `${(l.rate * 100).toFixed(1)}%`, align: 'right' },
              { key: 'a', header: 'Allowance', render: (l) => kes(l.allowance), align: 'right' }
            ]}
            footer={<tr><td colSpan={4}><b>Required allowance: {kes(ecl.total)}</b></td></tr>}
          />
        </Panel>
      )}
      {open && <DealDrawer deal={open} onClose={() => setOpenId(null)} />}
      {prompt.node}
    </SuitePage>
  );
};

const DealDrawer: React.FC<{ deal: TreasuryInstrument; onClose: () => void }> = ({ deal, onClose }) => {
  const f = useFinance();
  const prompt = usePrompt();
  const isInv = ['DEPOSIT', 'TBILL', 'BOND'].includes(deal.type);
  const isLoan = ['LOAN_IN', 'LOAN_OUT', 'IC_LOAN'].includes(deal.type);
  return (
    <Drawer title={`${deal.number} · ${TYPE_LABEL[deal.type]}`} subtitle={deal.counterparty} badge={<Pill status={deal.status} />} onClose={onClose} wide>
      <DefList
        items={[
          ['Principal', money(deal.principal, deal.currency)],
          ['Repaid', money(deal.repaid, deal.currency)],
          ['Rate', deal.type === 'FX_FWD' ? `Forward @ ${deal.forwardRate}` : `${(deal.rate * 100).toFixed(2)}%`],
          ['Interest accrued', kes(deal.accrued)],
          ['Term', `${fmtDate(deal.start)} – ${fmtDate(deal.maturity)}`],
          ['Roll-over', deal.rollover ? 'Yes' : 'No'],
          ['Bank account', deal.bankAccount],
          ...(deal.lc ? ([['LC', `${deal.lc.beneficiary} · ${deal.lc.po} · expires ${fmtDate(deal.lc.expiry)} · ${deal.lc.stage.replace('_', ' ').toLowerCase()}`], ['Documents', deal.lc.documents]] as [string, string][]) : []),
          ['Journals', String(deal.journals.length)]
        ]}
      />
      {deal.status === 'ACTIVE' && (
        <div className="sx-actions fx-bar">
          {isInv && <button type="button" className="btn btn-primary btn-sm" onClick={() => f.matureInstrument(deal.id)}>{deal.rollover ? 'Roll over' : 'Mature'}</button>}
          {(deal.type === 'BOND' || deal.type === 'TBILL') && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => prompt.open({ title: 'Mark to market', fields: [{ key: 'price', label: 'Clean price per 100', type: 'number', required: true }, { key: 'date', label: 'Date', type: 'date', initial: TODAY }], onSubmit: (v) => f.markToMarket(deal.id, num(v.price), v.date) })}>
              Mark to market
            </button>
          )}
          {isLoan && <button type="button" className="btn btn-secondary btn-sm" onClick={() => prompt.open({ title: 'Repayment', fields: [{ key: 'amount', label: 'Amount', type: 'number', required: true }, { key: 'date', label: 'Date', type: 'date', initial: TODAY }], onSubmit: (v) => f.repayLoan(deal.id, num(v.amount), v.date) })}>Record repayment</button>}
          {deal.type === 'FX_FWD' && <button type="button" className="btn btn-primary btn-sm" onClick={() => prompt.open({ title: 'Settle forward', fields: [{ key: 'spot', label: 'Spot rate today', type: 'number', initial: rateOn(f.state, deal.currency, TODAY) }], onSubmit: (v) => f.settleForward(deal.id, num(v.spot)) })}>Settle</button>}
          {deal.lc && <button type="button" className="btn btn-primary btn-sm" onClick={() => f.advanceLc(deal.id)}>Next LC stage</button>}
        </div>
      )}
      {deal.marketValues.length > 0 && (
        <>
          <h4 className="sx-subhead">Prices</h4>
          <ul className="fx-list">
            {deal.marketValues.map((m) => (
              <li key={m.date}>
                {fmtDate(m.date)} — {m.price}
              </li>
            ))}
          </ul>
        </>
      )}
      <h4 className="sx-subhead">History</h4>
      <Timeline items={deal.history} />
      {prompt.node}
    </Drawer>
  );
};
