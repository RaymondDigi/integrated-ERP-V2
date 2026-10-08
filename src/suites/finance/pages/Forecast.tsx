import React, { useMemo, useState } from 'react';
import { Droplets, TrendingDown, TrendingUp, Building } from 'lucide-react';
import { useFinance } from '../store';
import { balanceOf, fmtDate, kes, ledger, round2, scope } from '../engine';
import { Bars, Chips, DataTable, Panel, Stat, SuitePage } from '../../ui/kit';
import { ExportCsvButton } from '../../../platform/Widgets';
import { cashForecast, cashInOut } from '../ext/analytics';

type Tab = 'FORECAST' | 'ACTUAL' | 'LIQUIDITY';

/** Treasury › Cash forecast: 13-week projection, actual in/out flows and group liquidity. */
export const ForecastPage: React.FC = () => {
  const { state, fullState, entries } = useFinance();
  const [tab, setTab] = useState<Tab>('FORECAST');
  const fc = useMemo(() => cashForecast(state, entries), [state, entries]);
  const flows = useMemo(() => cashInOut(state, entries), [state, entries]);
  const low = fc.rows.reduce((m, r) => Math.min(m, r.closing), fc.opening);
  const group = useMemo(
    () =>
      fullState.companies.map((co) => {
        const v = scope(fullState, co.id);
        const es = ledger(v);
        const banks = v.accounts.filter((a) => a.bank).map((a) => ({ a, bal: balanceOf(es, a) })).filter((x) => Math.abs(x.bal) > 0.005);
        return { co, banks, total: round2(banks.reduce((x, b) => x + b.bal, 0)) };
      }),
    [fullState]
  );
  const groupTotal = round2(group.reduce((x, g) => x + g.total, 0));

  return (
    <SuitePage eyebrow="Treasury" title="Cash forecast & liquidity" subtitle="Where cash will be over the next 13 weeks, what actually came in and went out, and cash held across the group.">
      <div className="sx-stats">
        <Stat label="Cash today" value={kes(fc.opening, { compact: true })} detail="all bank and cash accounts" icon={<Droplets size={16} />} />
        <Stat label="Expected in (13 weeks)" value={kes(fc.rows.reduce((x, r) => x + r.receipts, 0), { compact: true })} icon={<TrendingUp size={16} />} tone="blue" />
        <Stat label="Expected out (13 weeks)" value={kes(fc.rows.reduce((x, r) => x + r.payments, 0), { compact: true })} icon={<TrendingDown size={16} />} tone="orange" />
        <Stat label="Lowest point" value={kes(low, { compact: true })} detail={low < 0 ? 'Funding needed' : 'Stays positive'} icon={<Building size={16} />} tone={low < 0 ? 'red' : 'green'} />
      </div>
      <Chips<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'FORECAST', label: '13-week projection' },
          { value: 'ACTUAL', label: 'Actual inflows vs outflows' },
          { value: 'LIQUIDITY', label: 'Group liquidity' }
        ]}
      />
      {tab === 'FORECAST' && (
        <Panel title="Weekly cash projection" subtitle="Customer receipts are shifted by each customer's usual payment delay; held bills are left out." action={<ExportCsvButton name="cash-forecast" header={['Week', 'From', 'To', 'Receipts', 'Payments', 'Recurring', 'Treasury', 'Net', 'Closing']} rows={() => fc.rows.map((r) => [r.week, r.from, r.to, r.receipts, r.payments, r.recurring, r.treasury, r.net, r.closing])} />}>
          <Bars data={fc.rows.map((r) => ({ label: `W${r.week}`, values: [r.receipts + Math.max(0, r.recurring) + Math.max(0, r.treasury), r.payments + Math.max(0, -r.recurring) + Math.max(0, -r.treasury)] }))} series={[{ name: 'In', color: 'var(--sx-green, #2f855a)' }, { name: 'Out', color: 'var(--sx-orange, #dd6b20)' }]} format={(n) => kes(n, { compact: true })} />
          <DataTable
            rows={fc.rows}
            rowKey={(r) => String(r.week)}
            pageSize={13}
            columns={[
              { key: 'w', header: 'Week', render: (r) => `W${r.week} · ${fmtDate(r.from)}` },
              { key: 'r', header: 'Receipts', render: (r) => kes(r.receipts), align: 'right' },
              { key: 'p', header: 'Payments', render: (r) => kes(r.payments), align: 'right' },
              { key: 'rc', header: 'Recurring', render: (r) => kes(r.recurring), align: 'right' },
              { key: 't', header: 'Treasury', render: (r) => kes(r.treasury), align: 'right' },
              { key: 'n', header: 'Net', render: (r) => <span className={r.net < 0 ? 'sx-danger-text' : ''}>{kes(r.net)}</span>, align: 'right' },
              { key: 'c', header: 'Closing', render: (r) => <b className={r.closing < 0 ? 'sx-danger-text' : ''}>{kes(r.closing)}</b>, align: 'right' }
            ]}
          />
        </Panel>
      )}
      {tab === 'ACTUAL' && (
        <Panel title="Money in and out of the bank, by month">
          <Bars data={flows.map((f) => ({ label: f.label, values: [f.inflow, f.outflow] }))} series={[{ name: 'Inflow', color: 'var(--sx-green, #2f855a)' }, { name: 'Outflow', color: 'var(--sx-orange, #dd6b20)' }]} format={(n) => kes(n, { compact: true })} />
          <DataTable
            rows={flows}
            rowKey={(f) => f.key}
            columns={[
              { key: 'm', header: 'Month', render: (f) => f.key },
              { key: 'i', header: 'Inflow', render: (f) => kes(f.inflow), align: 'right' },
              { key: 'o', header: 'Outflow', render: (f) => kes(f.outflow), align: 'right' },
              { key: 'n', header: 'Net', render: (f) => kes(round2(f.inflow - f.outflow)), align: 'right' }
            ]}
          />
        </Panel>
      )}
      {tab === 'LIQUIDITY' && (
        <Panel title="Cash across the group" subtitle={`Centrally managed by group treasury · total ${kes(groupTotal)}`}>
          <DataTable
            rows={group.flatMap((g) => g.banks.map((b) => ({ id: `${g.co.id}-${b.a.code}`, co: g.co.code, account: `${b.a.code} · ${b.a.name}`, bal: b.bal, share: groupTotal ? b.bal / groupTotal : 0 })))}
            rowKey={(r) => r.id}
            columns={[
              { key: 'c', header: 'Company', render: (r) => r.co },
              { key: 'a', header: 'Account', render: (r) => r.account },
              { key: 'b', header: 'Balance', render: (r) => kes(r.bal), align: 'right' },
              { key: 's', header: 'Share', render: (r) => `${Math.round(r.share * 100)}%`, align: 'right' }
            ]}
          />
        </Panel>
      )}
    </SuitePage>
  );
};
