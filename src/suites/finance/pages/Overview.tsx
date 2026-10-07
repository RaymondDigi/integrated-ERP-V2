import React from 'react';
import {
  Landmark,
  HandCoins,
  Receipt,
  TrendingUp,
  FilePlus2,
  ArrowDownLeft,
  ArrowUpRight,
  BookPlus,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  CalendarClock,
  Scale,
  Lock,
  ChevronRight,
  Target
} from 'lucide-react';
import { useFinance, type FinancePage } from '../store';
import {
  addDays,
  AGE_BUCKETS,
  ageing,
  budgetVsActual,
  cashPosition,
  daysBetween,
  docBalance,
  docValue,
  fmtDate,
  isOverdue,
  kes,
  monthlySeries,
  periodLabel,
  periodOf,
  permissions,
  profitAndLoss,
  round2,
  TODAY
} from '../engine';
import { Bars, Donut, Meter, Panel, Stat, LinkButton } from '../../ui/kit';
import { useLookups } from '../parts';
import type { FinDocument, Journal, Settlement } from '../types';

const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

type Item = { id: string; tone: 'critical' | 'warning' | 'info' | 'success'; icon: React.ReactNode; title: string; detail: string; page: FinancePage; focus?: string };

export const FinanceOverview: React.FC = () => {
  const { state, entries, actor, setPage } = useFinance();
  const { party } = useLookups();
  const year = Number(TODAY.slice(0, 4));
  const month = Number(TODAY.slice(5, 7)) - 1;

  const cash = cashPosition(state, entries);
  const totalCash = round2(cash.reduce((s, c) => s + c.balance, 0));
  const ar = ageing(state, 'INVOICE');
  const ap = ageing(state, 'BILL');
  const arOverdue = round2(ar.total - ar.totals[0]);
  const billsDue = state.documents.filter((d) => d.kind === 'BILL' && d.status === 'POSTED' && docBalance(state, d) > 0 && d.dueDate <= addDays(TODAY, 7));
  const dueSoon = round2(billsDue.reduce((s, d) => s + docBalance(state, d), 0));
  const ytd = profitAndLoss(state, entries, `${year}-01-01`, TODAY);
  const series = monthlySeries(state, entries, year).slice(0, month + 1);

  // Role-aware to-do list
  const all: { doc: FinDocument | Settlement | Journal; collection: 'documents' | 'settlements' | 'journals'; page: FinancePage }[] = [
    ...state.documents.map((d) => ({ doc: d, collection: 'documents' as const, page: (d.kind === 'INVOICE' ? 'invoices' : 'bills') as FinancePage })),
    ...state.settlements.map((s) => ({ doc: s, collection: 'settlements' as const, page: (s.kind === 'RECEIPT' ? 'receipts' : 'payments') as FinancePage })),
    ...state.journals.map((j) => ({ doc: j, collection: 'journals' as const, page: 'journals' as FinancePage }))
  ];
  const items: Item[] = [];
  for (const { doc, page } of all) {
    const p = permissions(state, doc, actor);
    if (p.approve) items.push({ id: doc.id, tone: 'warning', icon: <Clock3 size={15} />, title: `Approve ${doc.number}`, detail: `${kes(docValue(doc), { compact: true })} · prepared by ${doc.preparedBy}`, page, focus: doc.id });
    else if (p.post) items.push({ id: doc.id, tone: 'info', icon: <CheckCircle2 size={15} />, title: `Post ${doc.number}`, detail: `Approved ${kes(docValue(doc), { compact: true })} — ready for the ledger`, page, focus: doc.id });
    else if ((doc.status === 'DRAFT' || doc.status === 'REJECTED') && doc.preparedBy === actor.name)
      items.push({ id: doc.id, tone: doc.status === 'REJECTED' ? 'critical' : 'info', icon: <FilePlus2 size={15} />, title: `${doc.status === 'REJECTED' ? 'Fix and resubmit' : 'Finish draft'} ${doc.number}`, detail: kes(docValue(doc), { compact: true }), page, focus: doc.id });
  }
  const overdue = state.documents
    .filter((d) => d.kind === 'INVOICE' && isOverdue(state, d))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3);
  for (const d of overdue)
    items.push({ id: `od${d.id}`, tone: 'critical', icon: <AlertTriangle size={15} />, title: `Chase ${party(d.partyId)?.name}`, detail: `${d.number} · ${kes(docBalance(state, d), { compact: true })} · ${daysBetween(d.dueDate, TODAY)} days late`, page: 'invoices', focus: d.id });
  const unmatched = state.bankLines.filter((l) => !l.matchedTo).length;
  if (unmatched) items.push({ id: 'bank', tone: 'warning', icon: <Scale size={15} />, title: `${unmatched} bank statement lines to reconcile`, detail: 'KCB main account', page: 'bank' });
  const prev = state.periods.find((p) => p.status === 'OPEN' && p.key < periodOf(TODAY));
  if (prev) {
    if (!state.depreciationRuns.some((r) => r.period === prev.key)) items.push({ id: 'dep', tone: 'warning', icon: <CalendarClock size={15} />, title: `Run depreciation for ${periodLabel(prev.key, true)}`, detail: 'Needed before the month can close', page: 'assets' });
    items.push({ id: 'close', tone: 'info', icon: <Lock size={15} />, title: `Close ${periodLabel(prev.key, true)}`, detail: 'Month-end checklist', page: 'close' });
  }

  const budget = budgetVsActual(state, entries, Math.max(0, month - 1))
    .filter((b) => b.account.type === 'EXPENSE')
    .sort((a, b) => b.used - a.used)
    .slice(0, 5);
  const topDebtors = ar.rows.slice(0, 5);

  const recent = all
    .flatMap(({ doc, page }) => doc.history.map((h) => ({ ...h, number: doc.number, id: doc.id, page })))
    .filter((h) => h.by !== 'System')
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 6);

  const AGE_COLORS = ['#237857', '#ddbd72', '#e39b5b', '#d4704f', '#b5443a'];

  return (
    <div className="sx-page">
      <header className="sx-hero">
        <div>
          <span className="sx-eyebrow">
            {greet()}, {actor.name.split(' ')[0]} · {actor.title}
          </span>
          <h1>Finance overview</h1>
          <p>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {items.length} item{items.length === 1 ? '' : 's'} need your attention
          </p>
        </div>
        <div className="sx-quick">
          <button type="button" onClick={() => setPage('invoices', 'new')}>
            <FilePlus2 size={16} /> New invoice
          </button>
          <button type="button" onClick={() => setPage('receipts', 'new')}>
            <ArrowDownLeft size={16} /> Record receipt
          </button>
          <button type="button" onClick={() => setPage('bills', 'new')}>
            <Receipt size={16} /> Enter bill
          </button>
          <button type="button" onClick={() => setPage('journals', 'new')}>
            <BookPlus size={16} /> New journal
          </button>
        </div>
      </header>

      <div className="sx-stats">
        <Stat label="Cash in bank" value={kes(totalCash, { compact: true })} detail={`${cash.length} accounts · reconciled to statement`} icon={<Landmark size={17} />} onClick={() => setPage('bank')} />
        <Stat
          label="Customers owe us"
          value={kes(ar.total, { compact: true })}
          detail={<span className={arOverdue ? 'sx-danger-text' : ''}>{kes(arOverdue, { compact: true })} overdue</span>}
          icon={<HandCoins size={17} />}
          tone="blue"
          onClick={() => setPage('invoices')}
        />
        <Stat label="Bills due in 7 days" value={kes(dueSoon, { compact: true })} detail={`${billsDue.length} bills · ${kes(ap.total, { compact: true })} owed in total`} icon={<ArrowUpRight size={17} />} tone="gold" onClick={() => setPage('bills')} />
        <Stat
          label="Net profit this year"
          value={kes(ytd.netProfit, { compact: true })}
          detail={`${ytd.totalIncome ? ((ytd.netProfit / ytd.totalIncome) * 100).toFixed(1) : 0}% margin on ${kes(ytd.totalIncome, { compact: true })} revenue`}
          icon={<TrendingUp size={17} />}
          tone="violet"
          onClick={() => setPage('reports')}
        />
      </div>

      <div className="sx-row sx-row-wide">
        <Panel title="Revenue and expenses" subtitle={`Each month of ${year}, from the general ledger`} action={<LinkButton onClick={() => setPage('reports')}>Profit and loss</LinkButton>}>
          <Bars
            data={series.map((s) => ({ label: s.label, values: [s.revenue, s.expenses] }))}
            series={[
              { name: 'Revenue', color: '#237857' },
              { name: 'Expenses', color: '#b9d5c3' }
            ]}
            format={(n) => kes(n, { compact: true }).replace('KES ', '')}
          />
        </Panel>
        <Panel title="Receivables by age" subtitle="What customers owe, by days past due" action={<LinkButton onClick={() => setPage('reports')}>Ageing</LinkButton>}>
          <Donut items={AGE_BUCKETS.map((b, i) => ({ label: b, value: ar.totals[i], color: AGE_COLORS[i] }))} center={kes(ar.total, { compact: true }).replace('KES ', '')} caption="owed" />
        </Panel>
      </div>

      <div className="sx-row sx-row-wide">
        <Panel title={<>Needs your attention {items.length > 0 && <span className="sx-count">{items.length}</span>}</>} subtitle={`What ${actor.name.split(' ')[0]} can act on as ${actor.title}`}>
          {items.length === 0 ? (
            <div className="sx-allclear">
              <CheckCircle2 size={24} />
              <p>All caught up.</p>
            </div>
          ) : (
            <ul className="sx-todo">
              {items.slice(0, 9).map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => setPage(i.page, i.focus ?? null)}>
                    <span className={`sx-todo-icon ${i.tone}`}>{i.icon}</span>
                    <span className="sx-todo-text">
                      <b>{i.title}</b>
                      <small>{i.detail}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="sx-stack">
          <Panel title="Cash by account" subtitle="Book balances today">
            <ul className="sx-barlist">
              {cash.map((c) => (
                <li key={c.account.code}>
                  <div>
                    <span>{c.account.name}</span>
                    <b>{kes(c.balance, { compact: true })}</b>
                  </div>
                  <Meter value={totalCash ? c.balance / totalCash : 0} />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Budget watch" subtitle="Costs closest to their budget" action={<LinkButton onClick={() => setPage('budgets')}>Budgets</LinkButton>}>
            <ul className="sx-barlist">
              {budget.map((b) => (
                <li key={b.account.code}>
                  <div>
                    <span>{b.account.name}</span>
                    <b className={b.used > 1.05 ? 'sx-danger-text' : ''}>{Math.round(b.used * 100)}%</b>
                  </div>
                  <Meter value={b.used} tone={b.used > 1.05 ? 'red' : b.used > 0.95 ? 'gold' : 'green'} />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="sx-row">
        <Panel title="Largest balances owed" subtitle="Customers with the most outstanding" action={<LinkButton onClick={() => setPage('customers')}>Customers</LinkButton>}>
          <table className="sx-mini-table">
            <tbody>
              {topDebtors.map((r) => (
                <tr key={r.party.id}>
                  <td>
                    {r.party.name}
                    {r.total - r.buckets[0] > 0 && <small className="sx-danger-text sx-block">{kes(round2(r.total - r.buckets[0]), { compact: true })} overdue</small>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <b>{kes(r.total, { compact: true })}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Recent activity" subtitle="Latest actions by the finance team">
          <ul className="sx-activity">
            {recent.map((h, i) => (
              <li key={i}>
                <span className="sx-avatar">
                  {h.by
                    .split(' ')
                    .map((w) => w[0])
                    .join('')
                    .slice(0, 2)}
                </span>
                <div>
                  <p>
                    <b>{h.by}</b> {h.action.toLowerCase()}{' '}
                    <button type="button" className="sx-link" onClick={() => setPage(h.page, h.id)}>
                      {h.number}
                    </button>
                  </p>
                  <small>{fmtDate(h.at.slice(0, 10))}</small>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="This year at a glance" subtitle={`1 Jan – ${fmtDate(TODAY)}`}>
          <ul className="sx-facts">
            <li>
              <span>Revenue</span>
              <b>{kes(ytd.totalIncome, { compact: true })}</b>
            </li>
            <li>
              <span>Gross profit</span>
              <b>{kes(ytd.grossProfit, { compact: true })}</b>
            </li>
            <li>
              <span>Operating expenses</span>
              <b>{kes(ytd.totalOpex, { compact: true })}</b>
            </li>
            <li>
              <span>Invoices issued</span>
              <b>{state.documents.filter((d) => d.kind === 'INVOICE' && d.status === 'POSTED').length}</b>
            </li>
            <li>
              <span>Bills processed</span>
              <b>{state.documents.filter((d) => d.kind === 'BILL' && d.status === 'POSTED').length}</b>
            </li>
            <li>
              <span>
                <Target size={12} /> Closed months
              </span>
              <b>{state.periods.filter((p) => p.status === 'CLOSED').length} of 12</b>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
};
