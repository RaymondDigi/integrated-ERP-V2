import React, { useMemo, useState } from 'react';
import { CalendarClock, FileCheck2, Receipt, Calculator, Send } from 'lucide-react';
import { useFinance } from '../store';
import { addMonths, fmtDate, kes, periodLabel, periodOf, profitAndLoss, round2, TODAY } from '../engine';
import { Chips, DataTable, Field, Panel, Pill, Stat, SuitePage } from '../../ui/kit';
import { PrintButton, esc } from '../../../platform/Widgets';
import { TAX_FILING_ACCOUNTS } from '../ext/planning';
import { usePrompt, Simulated } from '../ext/ui';
import { finNotify } from '../ext/ctx';
import { useApp } from '../../../context/AppContext';

type Tab = 'CALENDAR' | 'RETURNS' | 'WHT' | 'CIT';

/** Tax: due-date calendar with reminders, VAT/WHT/levy/PAYE returns (simulated iTax filing), WHT certificates, corporation tax. */
export const TaxPage: React.FC = () => {
  const f = useFinance();
  const { state, entries } = f;
  const [tab, setTab] = useState<Tab>('CALENDAR');
  const prompt = usePrompt();
  const { addToast } = useApp();
  const lastMonth = periodOf(addMonths(TODAY, -1));
  const calendar = useMemo(() => {
    const out: { tax: string; label: string; period: string; due: string; status: string; days: number }[] = [];
    for (let i = -1; i <= 1; i++) {
      const period = periodOf(addMonths(TODAY, i - 1));
      for (const [tax, def] of Object.entries(TAX_FILING_ACCOUNTS)) {
        if (tax === 'CIT' && ![3, 5, 8, 11].includes(Number(period.slice(5, 7)))) continue;
        const [y, m] = period.split('-').map(Number);
        const due = new Date(y, m, def.dueDay);
        const dueIso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
        const filing = state.taxFilings.find((x) => x.tax === tax && x.period === period);
        const days = Math.round((new Date(dueIso + 'T00:00:00').getTime() - new Date(TODAY + 'T00:00:00').getTime()) / 86_400_000);
        out.push({ tax, label: def.label, period, due: dueIso, status: filing?.status ?? (days < 0 ? 'OVERDUE' : 'OPEN'), days });
      }
    }
    return out.sort((a, b) => a.due.localeCompare(b.due));
  }, [state.taxFilings]);
  const upcoming = calendar.filter((c) => c.status !== 'PAID' && c.days <= 14);

  const whtRows = state.settlements.filter((s) => s.status === 'POSTED' && s.wht && s.wht.amount > 0);
  const year = TODAY.slice(0, 4);
  const pl = profitAndLoss(state, entries.filter((e) => e.account !== '7900'), `${year}-01-01`, TODAY);
  const [addGroups, setAddGroups] = useState<string[]>(['Depreciation']);
  const groups = [...new Set(state.accounts.filter((a) => a.type === 'EXPENSE').map((a) => a.group))];
  const addBacks = round2(pl.opex.concat(pl.cogs).filter((r) => addGroups.includes(r.account.group)).reduce((x, r) => x + r.amount, 0));
  const allowances = round2(state.assets.filter((a) => a.status === 'ACTIVE').reduce((x, a) => x + a.cost * (a.costAccount === '1520' ? 0.25 : a.costAccount === '1500' ? 0.25 : 0.1), 0) * (Number(TODAY.slice(5, 7)) / 12));
  const taxable = round2(Math.max(0, pl.netProfit + addBacks - allowances));
  const cit = round2(taxable * state.settings.corporateTaxRate);

  const remind = () => {
    upcoming.forEach((c) => finNotify('Finance team', `${c.label} for ${periodLabel(c.period, true)} is due on ${c.due}`, c.tax, c.days < 0 ? `${-c.days} days late` : `Due in ${c.days} days`, c.days < 0 ? 'critical' : 'warning'));
    addToast({ type: 'info', title: 'Reminders sent', message: `${upcoming.length} tax reminders sent (in-app and email)` });
  };

  return (
    <SuitePage
      eyebrow="Tax"
      title="Tax & statutory returns"
      subtitle="Due dates, returns prepared from the ledger, filing with KRA (simulated), payment and corporation tax."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => prompt.open({
          title: 'Prepare a return',
          fields: [
            { key: 'tax', label: 'Tax', type: 'select', options: Object.entries(TAX_FILING_ACCOUNTS).map(([value, d]) => ({ value, label: d.label })) },
            { key: 'period', label: 'Period (YYYY-MM)', initial: lastMonth }
          ],
          onSubmit: (v) => f.prepareFiling(v.tax, v.period)
        })}>
          <FileCheck2 size={14} /> Prepare return
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Due in 14 days" value={upcoming.length} detail={upcoming[0] ? `${upcoming[0].label} by ${fmtDate(upcoming[0].due)}` : 'Nothing pressing'} icon={<CalendarClock size={16} />} tone={upcoming.some((u) => u.days < 0) ? 'red' : 'gold'} />
        <Stat label="Returns filed" value={state.taxFilings.filter((x) => x.status !== 'PREPARED').length} detail={<Simulated what="KRA iTax" />} icon={<Send size={16} />} tone="blue" />
        <Stat label="WHT deducted" value={kes(whtRows.filter((s) => s.kind === 'PAYMENT').reduce((x, s) => x + s.wht!.amount, 0), { compact: true })} detail={`${whtRows.length} payments and receipts`} icon={<Receipt size={16} />} tone="slate" />
        <Stat label="Corporation tax YTD" value={kes(cit, { compact: true })} detail={`${(state.settings.corporateTaxRate * 100).toFixed(0)}% of ${kes(taxable, { compact: true })}`} icon={<Calculator size={16} />} />
      </div>
      <Chips<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'CALENDAR', label: 'Tax calendar', count: upcoming.length },
          { value: 'RETURNS', label: 'Returns', count: state.taxFilings.length },
          { value: 'WHT', label: 'Withholding tax' },
          { value: 'CIT', label: 'Corporation tax' }
        ]}
      />
      {tab === 'CALENDAR' && (
        <Panel title="Due dates and reminders" subtitle="Reminders go to the Finance team for anything due within 14 days (in-app and email)." action={<button type="button" className="btn btn-secondary btn-sm" onClick={remind}>Send reminders</button>} flush>
          <DataTable
            rows={calendar}
            rowKey={(c) => `${c.tax}-${c.period}`}
            pageSize={20}
            columns={[
              { key: 't', header: 'Tax', render: (c) => c.label },
              { key: 'p', header: 'Period', render: (c) => periodLabel(c.period, true) },
              { key: 'd', header: 'Due', render: (c) => <span className={c.days < 0 && c.status !== 'PAID' ? 'sx-danger-text' : ''}>{fmtDate(c.due)} {c.status !== 'PAID' && (c.days < 0 ? `(${-c.days} days late)` : `(in ${c.days} days)`)}</span>, sort: (c) => c.due },
              { key: 's', header: 'Status', render: (c) => <Pill status={c.status === 'FILED' ? 'APPROVED' : c.status === 'PREPARED' ? 'SUBMITTED' : c.status} label={c.status.toLowerCase()} /> },
              { key: 'a', header: '', render: (c) => (c.status === 'OPEN' || c.status === 'OVERDUE' ? <button type="button" className="sx-link" onClick={() => f.prepareFiling(c.tax, c.period)}>Prepare</button> : null) }
            ]}
          />
        </Panel>
      )}
      {tab === 'RETURNS' && (
        <DataTable
          rows={state.taxFilings}
          rowKey={(x) => x.id}
          columns={[
            { key: 't', header: 'Return', render: (x) => TAX_FILING_ACCOUNTS[x.tax]?.label ?? x.tax },
            { key: 'p', header: 'Period', render: (x) => periodLabel(x.period, true), sort: (x) => x.period },
            { key: 'a', header: 'Amount', render: (x) => kes(x.amount), align: 'right' },
            { key: 'k', header: 'Acknowledgement', render: (x) => x.ackNo ?? '—' },
            { key: 's', header: 'Status', render: (x) => <Pill status={x.status === 'PAID' ? 'PAID' : x.status === 'FILED' ? 'APPROVED' : 'SUBMITTED'} label={x.status.toLowerCase()} /> },
            {
              key: 'x',
              header: '',
              render: (x) => (
                <div className="fx-row-actions">
                  {x.status === 'PREPARED' && <button type="button" className="sx-link" onClick={() => f.fileTax(x.id)}>File on iTax</button>}
                  {x.status === 'FILED' && <button type="button" className="sx-link" onClick={() => f.payTax(x.id)}>Pay</button>}
                </div>
              )
            }
          ]}
          empty="No returns yet"
        />
      )}
      {tab === 'WHT' && (
        <DataTable
          rows={whtRows}
          rowKey={(s) => s.id}
          columns={[
            { key: 'n', header: 'Document', render: (s) => s.number },
            { key: 'k', header: 'Side', render: (s) => (s.kind === 'PAYMENT' ? 'Deducted from supplier' : 'Withheld by customer') },
            { key: 'p', header: 'Party', render: (s) => state.parties.find((p) => p.id === s.partyId)?.name },
            { key: 'c', header: 'Code', render: (s) => `${s.wht!.code} (${(s.wht!.rate * 100).toFixed(0)}%)` },
            { key: 'a', header: 'WHT', render: (s) => kes(s.wht!.amount), align: 'right' },
            {
              key: 'cert',
              header: '',
              render: (s) => (
                <PrintButton
                  title={`WHT certificate ${s.number}`}
                  label="Certificate"
                  html={() => `<h1>Withholding tax certificate</h1><p>${esc(s.number)} · ${esc(s.date)}</p><table><tr><th>Payee</th><td>${esc(state.parties.find((p) => p.id === s.partyId)?.name)}</td></tr><tr><th>KRA PIN</th><td>${esc(state.parties.find((p) => p.id === s.partyId)?.pin)}</td></tr><tr><th>Gross</th><td>${(s.amount + s.wht!.amount).toLocaleString()}</td></tr><tr><th>Tax code</th><td>${esc(s.wht!.code)}</td></tr><tr><th>Withheld</th><td>${s.wht!.amount.toLocaleString()}</td></tr></table>`}
                />
              )
            }
          ]}
          empty="No withholding tax yet — enter it on supplier payments or customer receipts"
        />
      )}
      {tab === 'CIT' && (
        <Panel title={`Corporation tax computation — ${year} to date`} action={<button type="button" className="btn btn-primary btn-sm" onClick={() => f.corporateTaxProvision()}>Post tax provision</button>}>
          <Field label="Disallowable expense groups (added back)" span={4}>
            <div className="fx-checks">
              {groups.map((g) => (
                <label key={g}>
                  <input type="checkbox" checked={addGroups.includes(g)} onChange={(e) => setAddGroups(e.target.checked ? [...addGroups, g] : addGroups.filter((x) => x !== g))} /> {g}
                </label>
              ))}
            </div>
          </Field>
          <table className="fx-table">
            <tbody>
              <tr><td>Profit before tax</td><td className="r">{kes(pl.netProfit)}</td></tr>
              <tr><td>Add: disallowable expenses ({addGroups.join(', ') || 'none'})</td><td className="r">{kes(addBacks)}</td></tr>
              <tr><td>Less: capital allowances (wear and tear, pro rata)</td><td className="r">({kes(allowances)})</td></tr>
              <tr><td><b>Taxable profit</b></td><td className="r"><b>{kes(taxable)}</b></td></tr>
              <tr><td>Tax at {(state.settings.corporateTaxRate * 100).toFixed(0)}%</td><td className="r"><b>{kes(cit)}</b></td></tr>
            </tbody>
          </table>
          <p className="sx-note">The provision posting uses profit before tax at the corporate rate; adjust disallowables and allowances above for the instalment and the return.</p>
        </Panel>
      )}
      {prompt.node}
    </SuitePage>
  );
};
