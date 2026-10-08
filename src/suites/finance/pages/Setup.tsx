import React, { useState } from 'react';
import { Plus, CalendarRange, Save, Trash2 } from 'lucide-react';
import { useFinance } from '../store';
import { fmtDate, kes, periodLabel, TODAY } from '../engine';
import type { ApprovalRule, FinanceSettings, InvoiceTemplate, RateCard, TaxCode } from '../types';
import { Chips, DataTable, Field, Panel, Pill, SuitePage } from '../../ui/kit';
import { CHECK_LABEL } from '../ext/checks';
import { usePrompt, num } from '../ext/ui';
import { DEPARTMENTS } from '../data';

type Tab = 'CALENDAR' | 'TAX' | 'FX' | 'CENTRES' | 'REASONS' | 'APPROVALS' | 'SETTINGS' | 'LAYOUTS';

/** Finance › Setup: fiscal calendar, tax codes, currencies, cost centres, reason codes, approval matrix, policies and layouts. */
export const SetupPage: React.FC = () => {
  const f = useFinance();
  const { state } = f;
  const [tab, setTab] = useState<Tab>('CALENDAR');
  const prompt = usePrompt();
  const accounts = state.accounts.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }));

  const taxPrompt = (t?: TaxCode) =>
    prompt.open({
      title: t ? `Tax code ${t.code}` : 'New tax code',
      fields: [
        { key: 'code', label: 'Code', initial: t?.code ?? '', required: true },
        { key: 'name', label: 'Name', initial: t?.name ?? '', required: true },
        { key: 'kind', label: 'Kind', type: 'select', initial: t?.kind ?? 'VAT', options: ['VAT', 'ZERO', 'EXEMPT', 'REVERSE', 'WHT', 'LEVY', 'EXCISE'].map((k) => ({ value: k, label: k })) },
        { key: 'applies', label: 'Applies to', type: 'select', initial: t?.appliesTo ?? 'BOTH', options: [{ value: 'BOTH', label: 'Sales and purchases' }, { value: 'SALES', label: 'Sales' }, { value: 'PURCHASE', label: 'Purchases' }] },
        { key: 'account', label: 'Output / payable account', type: 'select', initial: t?.account ?? '2100', options: accounts },
        { key: 'input', label: 'Input / recoverable account', type: 'select', initial: t?.inputAccount ?? '1150', options: [{ value: '', label: '—' }, ...accounts] },
        { key: 'from', label: 'New rate from', type: 'date', initial: TODAY },
        { key: 'rate', label: 'Rate (0.16 = 16%)', type: 'number', initial: t ? [...t.rates].pop()?.rate : 0.16 },
        { key: 'active', label: 'Active', type: 'checkbox', initial: t?.active ?? true }
      ],
      onSubmit: (v) => {
        const rates = [...(t?.rates ?? []).filter((r) => r.from !== v.from), { from: v.from, rate: num(v.rate) }];
        const changed = !t || [...t.rates].pop()?.rate !== num(v.rate);
        return f.saveTaxCode({ code: v.code, name: v.name, kind: v.kind as TaxCode['kind'], appliesTo: v.applies as TaxCode['appliesTo'], account: v.account, inputAccount: v.input || undefined, rates: changed ? rates : t!.rates, active: v.active === 'true', due: t?.due });
      }
    });

  return (
    <SuitePage eyebrow="Finance" title="Finance setup" subtitle="Masters and policies the ledger runs on. Changes are logged in the finance audit trail.">
      <Chips<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'CALENDAR', label: 'Fiscal calendar', count: state.fiscalYears.length },
          { value: 'TAX', label: 'Tax codes', count: state.taxCodes.length },
          { value: 'FX', label: 'Currencies', count: state.currencies.length },
          { value: 'CENTRES', label: 'Cost centres', count: state.costCenters.length },
          { value: 'REASONS', label: 'Reason codes', count: state.reasonCodes.length },
          { value: 'APPROVALS', label: 'Approval matrix', count: state.approvalRules.length },
          { value: 'SETTINGS', label: 'Policies & checklist' },
          { value: 'LAYOUTS', label: 'Layouts & rate cards' }
        ]}
      />
      {tab === 'CALENDAR' && (
        <>
          <Panel
            title="Fiscal years"
            subtitle="Open next year before closing this one; calendar months, 4-4-5 weeks or 13 four-week periods, plus adjustment periods."
            action={
              <button type="button" className="btn btn-primary btn-sm" onClick={() => {
                const last = [...state.fiscalYears].sort((a, b) => a.end.localeCompare(b.end)).pop();
                const next = last ? new Date(new Date(last.end + 'T00:00:00').getTime() + 86_400_000).toISOString().slice(0, 10) : TODAY;
                prompt.open({
                  title: 'Open a fiscal year',
                  fields: [
                    { key: 'start', label: 'First day', type: 'date', initial: next },
                    { key: 'pattern', label: 'Periods', type: 'select', options: [{ value: 'MONTHLY', label: '12 calendar months' }, { value: '4-4-5', label: '4-4-5 weeks' }, { value: '13', label: '13 four-week periods' }] },
                    { key: 'special', label: 'Adjustment periods', type: 'number', initial: 1 },
                    { key: 'name', label: 'Name (optional)' }
                  ],
                  onSubmit: (v) => f.createFiscalYear({ start: v.start, pattern: v.pattern as 'MONTHLY', specialPeriods: num(v.special), name: v.name })
                });
              }}>
                <CalendarRange size={14} /> Open fiscal year
              </button>
            }
            flush
          >
            <DataTable
              rows={state.fiscalYears}
              rowKey={(y) => y.id}
              columns={[
                { key: 'n', header: 'Year', render: (y) => <b>{y.name}</b> },
                { key: 'd', header: 'Dates', render: (y) => `${fmtDate(y.start)} – ${fmtDate(y.end)}` },
                { key: 'p', header: 'Pattern', render: (y) => (y.pattern === 'MONTHLY' ? 'Calendar months' : y.pattern === '13' ? '13 periods' : '4-4-5') },
                { key: 's', header: 'Adjustment periods', render: (y) => y.specialPeriods, align: 'right' },
                { key: 'o', header: 'Periods open', render: (y) => state.periods.filter((p) => p.fiscalYear === y.id && p.status !== 'CLOSED').length, align: 'right' },
                { key: 'st', header: 'Status', render: (y) => <Pill status={y.status} /> }
              ]}
            />
          </Panel>
          <Panel title="Periods" flush>
            <DataTable
              rows={[...state.periods].sort((a, b) => b.key.localeCompare(a.key))}
              rowKey={(p) => p.key}
              pageSize={16}
              columns={[
                { key: 'k', header: 'Period', render: (p) => <div className="sx-cell-main"><span>{p.label ?? periodLabel(p.key, true)}</span><small>{p.key}{p.special ? ' · adjustment period' : ''}</small></div> },
                { key: 'd', header: 'Dates', render: (p) => (p.from ? `${fmtDate(p.from)} – ${fmtDate(p.to!)}` : 'Calendar month') },
                { key: 'y', header: 'Fiscal year', render: (p) => p.fiscalYear ?? '—' },
                { key: 'o', header: 'Close owner', render: (p) => (p.owner ? `${p.owner} · due ${p.due ?? ''}` : '—') },
                { key: 's', header: 'Status', render: (p) => <Pill status={p.status === 'SOFT' ? 'SUBMITTED' : p.status} label={p.status === 'SOFT' ? 'Soft-closed' : undefined} /> }
              ]}
            />
          </Panel>
        </>
      )}
      {tab === 'TAX' && (
        <Panel title="Tax codes and rates" subtitle="A document line uses the rate in force on its date. Levies post on top of VAT; reverse charge self-assesses VAT; WHT is deducted at payment." action={<button type="button" className="btn btn-primary btn-sm" onClick={() => taxPrompt()}><Plus size={14} /> New tax code</button>} flush>
          <DataTable
            rows={state.taxCodes}
            rowKey={(t) => t.code}
            onRowClick={taxPrompt}
            columns={[
              { key: 'c', header: 'Code', render: (t) => <b className="sx-mono">{t.code}</b> },
              { key: 'n', header: 'Name', render: (t) => <div className="sx-cell-main"><span>{t.name}</span><small>{t.kind} · {t.appliesTo.toLowerCase()}</small></div> },
              { key: 'r', header: 'Rate history', render: (t) => t.rates.map((r) => `${(r.rate * 100).toFixed(1)}% from ${r.from}`).join(' → ') },
              { key: 'a', header: 'Accounts', render: (t) => [t.account, t.inputAccount].filter(Boolean).join(' / ') },
              { key: 's', header: 'Status', render: (t) => <Pill status={t.active ? 'ACTIVE' : 'CLOSED'} label={t.active ? 'Active' : 'Inactive'} /> }
            ]}
          />
        </Panel>
      )}
      {tab === 'FX' && (
        <Panel
          title="Currencies and exchange rates"
          action={
            <div className="sx-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => prompt.open({ title: 'New currency', fields: [{ key: 'code', label: 'ISO code', required: true }, { key: 'name', label: 'Name' }, { key: 'symbol', label: 'Symbol' }, { key: 'rate', label: 'KES per unit today', type: 'number', required: true }], onSubmit: (v) => f.addCurrency(v.code, v.name, v.symbol, num(v.rate)) })}>
                <Plus size={14} /> Currency
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => prompt.open({ title: 'Exchange rate', fields: [{ key: 'cur', label: 'Currency', type: 'select', options: state.currencies.filter((c) => c.code !== 'KES').map((c) => ({ value: c.code, label: c.code })) }, { key: 'date', label: 'From date', type: 'date', initial: TODAY }, { key: 'rate', label: 'KES per unit', type: 'number', required: true }], onSubmit: (v) => f.addRate(v.cur, v.date, num(v.rate)) })}>
                <Plus size={14} /> Rate
              </button>
            </div>
          }
          flush
        >
          <DataTable
            rows={state.currencies}
            rowKey={(c) => c.code}
            columns={[
              { key: 'c', header: 'Currency', render: (c) => `${c.code} · ${c.name} (${c.symbol})` },
              { key: 'r', header: 'Latest rate', render: (c) => c.rates[c.rates.length - 1]?.rate.toLocaleString(), align: 'right' },
              { key: 'd', header: 'Since', render: (c) => fmtDate(c.rates[c.rates.length - 1]?.date ?? TODAY) },
              { key: 'h', header: 'History', render: (c) => <small>{c.rates.slice(-4).map((r) => `${r.date}: ${r.rate}`).join(' · ')}</small> }
            ]}
          />
        </Panel>
      )}
      {tab === 'CENTRES' && (
        <Panel
          title="Cost and profit centres"
          action={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => prompt.open({
              title: 'New cost or profit centre',
              fields: [
                { key: 'code', label: 'Code', required: true },
                { key: 'name', label: 'Name', required: true },
                { key: 'type', label: 'Type', type: 'select', options: [{ value: 'COST', label: 'Cost centre' }, { value: 'PROFIT', label: 'Profit centre' }] },
                { key: 'manager', label: 'Manager' },
                { key: 'dept', label: 'Department', type: 'select', options: [{ value: '', label: '—' }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))] },
                { key: 'parent', label: 'Parent', type: 'select', options: [{ value: '', label: '—' }, ...state.costCenters.map((c) => ({ value: c.code, label: c.code }))] }
              ],
              onSubmit: (v) => f.saveCostCenter({ code: v.code, name: v.name, type: v.type as 'COST' | 'PROFIT', companyId: state.activeCompany, manager: v.manager, department: v.dept || undefined, parent: v.parent || undefined, active: true }, true)
            })}>
              <Plus size={14} /> New centre
            </button>
          }
          flush
        >
          <DataTable
            rows={state.costCenters}
            rowKey={(c) => c.code}
            columns={[
              { key: 'c', header: 'Code', render: (c) => <b className="sx-mono">{c.code}</b> },
              { key: 'n', header: 'Name', render: (c) => c.name },
              { key: 't', header: 'Type', render: (c) => (c.type === 'PROFIT' ? 'Profit centre' : 'Cost centre') },
              { key: 'co', header: 'Company', render: (c) => state.companies.find((x) => x.id === c.companyId)?.code },
              { key: 'm', header: 'Manager', render: (c) => c.manager },
              { key: 'p', header: 'Parent', render: (c) => c.parent ?? '—' }
            ]}
          />
        </Panel>
      )}
      {tab === 'REASONS' && (
        <Panel title="Reason codes" subtitle="Used on journals, credit notes and write-offs" action={<button type="button" className="btn btn-primary btn-sm" onClick={() => prompt.open({ title: 'Reason code', fields: [{ key: 'code', label: 'Code', required: true }, { key: 'label', label: 'Description', required: true }, { key: 'applies', label: 'Used for', type: 'select', options: [{ value: 'JOURNAL', label: 'Journals' }, { value: 'CREDIT_NOTE', label: 'Credit notes' }, { value: 'WRITE_OFF', label: 'Write-offs' }, { value: 'ALL', label: 'Everything' }] }], onSubmit: (v) => f.saveReasonCode({ code: v.code, label: v.label, appliesTo: v.applies as 'ALL' }) })}><Plus size={14} /> New code</button>} flush>
          <DataTable rows={state.reasonCodes} rowKey={(r) => r.code} columns={[{ key: 'c', header: 'Code', render: (r) => <b className="sx-mono">{r.code}</b> }, { key: 'l', header: 'Description', render: (r) => r.label }, { key: 'a', header: 'Used for', render: (r) => r.appliesTo.replace('_', ' ').toLowerCase() }]} />
        </Panel>
      )}
      {tab === 'APPROVALS' && (
        <Panel
          title="Approval matrix"
          subtitle="Documents above the amount need the Finance Director's second approval; the most specific rule (type and department) wins."
          action={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => prompt.open({
              title: 'Approval rule',
              fields: [
                { key: 'type', label: 'Document type', type: 'select', options: ['ANY', 'INVOICE', 'BILL', 'RECEIPT', 'PAYMENT', 'JOURNAL', 'MEMO', 'PAYMENT_RUN', 'BUDGET', 'LOAN'].map((x) => ({ value: x, label: x.replace('_', ' ').toLowerCase() })) },
                { key: 'dept', label: 'Department (optional)', type: 'select', options: [{ value: '', label: 'All departments' }, ...DEPARTMENTS.map((d) => ({ value: d, label: d }))] },
                { key: 'above', label: 'Director approval above (KES)', type: 'number', required: true }
              ],
              onSubmit: (v) => f.saveApprovalRule({ id: '', docType: v.type as ApprovalRule['docType'], department: v.dept || undefined, directorAbove: num(v.above) })
            })}>
              <Plus size={14} /> New rule
            </button>
          }
          flush
        >
          <DataTable
            rows={state.approvalRules}
            rowKey={(r) => r.id}
            columns={[
              { key: 't', header: 'Document', render: (r) => r.docType.replace('_', ' ').toLowerCase() },
              { key: 'd', header: 'Department', render: (r) => r.department ?? 'All' },
              { key: 'a', header: 'Manager approves up to', render: (r) => kes(r.directorAbove), align: 'right' },
              { key: 'x', header: '', render: (r) => <button type="button" className="sx-icon-btn" onClick={() => f.deleteApprovalRule(r.id)} aria-label="Remove rule"><Trash2 size={13} /></button> }
            ]}
          />
        </Panel>
      )}
      {tab === 'SETTINGS' && <SettingsForm />}
      {tab === 'LAYOUTS' && (
        <div className="sx-grid sx-grid-2">
          <Panel title="Invoice and statement layouts" subtitle="Chosen per customer or per bill-to address" action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => prompt.open({ title: 'New layout', fields: [{ key: 'name', label: 'Name', required: true }, { key: 'terms', label: 'Trade terms line', initial: 'Payment within 30 days' }, { key: 'footer', label: 'Footer', initial: 'Thank you for your business' }, { key: 'accent', label: 'Accent colour', initial: '#1f6f43' }, { key: 'pin', label: 'Show KRA PIN', type: 'checkbox', initial: true }, { key: 'bank', label: 'Show bank details', type: 'checkbox', initial: true }, { key: 'tax', label: 'Show tax breakdown', type: 'checkbox', initial: true }], onSubmit: (v) => f.saveInvoiceTemplate({ id: '', name: v.name, terms: v.terms, footer: v.footer, accent: v.accent, showPin: v.pin === 'true', showBank: v.bank === 'true', showTaxBreakdown: v.tax === 'true' } as InvoiceTemplate) })}><Plus size={14} /> Layout</button>} flush>
            <DataTable rows={state.invoiceTemplates} rowKey={(t) => t.id} columns={[{ key: 'n', header: 'Layout', render: (t) => <span style={{ borderLeft: `4px solid ${t.accent}`, paddingLeft: 6 }}>{t.name}</span> }, { key: 't', header: 'Terms', render: (t) => t.terms }, { key: 'u', header: 'Customers', render: (t) => state.parties.filter((p) => p.templateId === t.id || p.addresses?.some((a) => a.templateId === t.id)).length, align: 'right' }]} />
          </Panel>
          <Panel title="Service rate cards" subtitle="Hourly and per-item rates for blending, tasting, storage and labour" action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => prompt.open({ title: 'Rate card', fields: [{ key: 'name', label: 'Service', required: true }, { key: 'unit', label: 'Unit', type: 'select', options: ['HOUR', 'DAY', 'ITEM', 'KG'].map((u) => ({ value: u, label: u.toLowerCase() })) }, { key: 'rate', label: 'Rate (KES)', type: 'number', required: true }, { key: 'account', label: 'Income account', type: 'select', initial: '4020', options: state.accounts.filter((a) => a.type === 'INCOME').map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` })) }], onSubmit: (v) => f.saveRateCard({ id: '', name: v.name, unit: v.unit as RateCard['unit'], rate: num(v.rate), account: v.account }) })}><Plus size={14} /> Rate</button>} flush>
            <DataTable rows={state.rateCards} rowKey={(r) => r.id} columns={[{ key: 'n', header: 'Service', render: (r) => r.name }, { key: 'u', header: 'Per', render: (r) => r.unit.toLowerCase() }, { key: 'r', header: 'Rate', render: (r) => kes(r.rate), align: 'right' }, { key: 'a', header: 'Account', render: (r) => r.account }]} />
          </Panel>
        </div>
      )}
      {prompt.node}
    </SuitePage>
  );
};

const SettingsForm: React.FC = () => {
  const { state, updateSettings } = useFinance();
  const [s, setS] = useState<FinanceSettings>(state.settings);
  const set = (p: Partial<FinanceSettings>) => setS((x) => ({ ...x, ...p }));
  const pct = (arr: number[]) => arr.map((r) => (r * 100).toFixed(1)).join(', ');
  const parse = (v: string) => v.split(',').map((x) => Number(x.trim()) / 100);
  const checks = Object.keys(CHECK_LABEL);
  return (
    <Panel title="Policies" action={<button type="button" className="btn btn-primary btn-sm" onClick={() => updateSettings(s)}><Save size={14} /> Save policies</button>}>
      <div className="sx-grid">
        <Field label="Account code mask" hint="9 = digit, A = letter, e.g. 9999 or 99-999">
          <input className="form-control" value={s.accountMask} onChange={(e) => set({ accountMask: e.target.value })} />
        </Field>
        <Field label="Early-payment discounts" hint="Gross books the full bill; net books it less the discount">
          <select className="form-control" value={s.discountMethod} onChange={(e) => set({ discountMethod: e.target.value as 'GROSS' | 'NET' })}>
            <option value="GROSS">Gross method</option>
            <option value="NET">Net method</option>
          </select>
        </Field>
        <Field label="Three-way match tolerance %">
          <input className="form-control" type="number" value={s.matchTolerancePct} onChange={(e) => set({ matchTolerancePct: Number(e.target.value) })} />
        </Field>
        <Field label="Down payment limit % of order">
          <input className="form-control" type="number" value={s.downPaymentLimitPct} onChange={(e) => set({ downPaymentLimitPct: Number(e.target.value) })} />
        </Field>
        <Field label="Alert when overdue exceeds % of balance">
          <input className="form-control" type="number" value={s.overdueTolerancePct} onChange={(e) => set({ overdueTolerancePct: Number(e.target.value) })} />
        </Field>
        <Field label="Alert when over credit limit by %">
          <input className="form-control" type="number" value={s.overLimitTolerancePct} onChange={(e) => set({ overLimitTolerancePct: Number(e.target.value) })} />
        </Field>
        <Field label="Block bills over budget">
          <input type="checkbox" checked={s.budgetBlock} onChange={(e) => set({ budgetBlock: e.target.checked })} />
        </Field>
        <Field label="Corporation tax rate %">
          <input className="form-control" type="number" value={s.corporateTaxRate * 100} onChange={(e) => set({ corporateTaxRate: Number(e.target.value) / 100 })} />
        </Field>
        <Field label="ECL loss rates % by bucket" span={2} hint="Not due, 1–30, 31–60, 61–90, 90+">
          <input className="form-control" defaultValue={pct(s.eclRates)} onBlur={(e) => set({ eclRates: parse(e.target.value) })} />
        </Field>
        <Field label="Inventory loss rates % by age" span={2} hint="0–30, 31–90, 91–180, 180+ days">
          <input className="form-control" defaultValue={pct(s.inventoryLossRates)} onBlur={(e) => set({ inventoryLossRates: parse(e.target.value) })} />
        </Field>
      </div>
      <h4 className="sx-subhead">Pre-posting checklist</h4>
      <table className="fx-table">
        <thead>
          <tr>
            <th>Check</th>
            {(['BILL', 'INVOICE', 'PAYMENT', 'JOURNAL'] as const).map((t) => (
              <th key={t}>{t.toLowerCase()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c}>
              <td>{CHECK_LABEL[c]}</td>
              {(['BILL', 'INVOICE', 'PAYMENT', 'JOURNAL'] as const).map((t) => (
                <td key={t}>
                  <input
                    type="checkbox"
                    aria-label={`${c} for ${t}`}
                    checked={s.postingChecklist[t].includes(c)}
                    onChange={(e) => set({ postingChecklist: { ...s.postingChecklist, [t]: e.target.checked ? [...s.postingChecklist[t], c] : s.postingChecklist[t].filter((x) => x !== c) } })}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
};
