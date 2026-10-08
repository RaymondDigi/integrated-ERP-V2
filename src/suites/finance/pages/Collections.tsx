import React, { useState } from 'react';
import { BellRing, Percent, PhoneCall, ShieldAlert, ShieldCheck, CalendarPlus, Megaphone, Users } from 'lucide-react';
import { useFinance } from '../store';
import { curOf, daysBetween, docBalance, docBalanceBase, fmtDate, kes, money, round2, TODAY } from '../engine';
import type { CollectionAction, FinDocument } from '../types';
import { Chips, DataTable, DefList, Field, Meter, Panel, Pill, Stat, SuitePage } from '../../ui/kit';
import { useLookups } from '../parts';
import { PrintButton, esc } from '../../../platform/Widgets';
import { finNotify } from '../ext/ctx';
import { effectiveLimit } from '../ext/subledger';
import { partyStats } from '../ext/analytics';
import { usePrompt, num, Simulated } from '../ext/ui';

type Tab = 'WORK' | 'HISTORY' | 'CREDIT' | 'PERFORMANCE' | 'LETTERS' | 'ALERTS';

const ACTION_LABEL: Record<CollectionAction['action'], string> = {
  REMINDER: 'Reminder sent',
  DUNNING_1: 'First notice',
  DUNNING_2: 'Final notice',
  CALL: 'Collection call',
  AGENCY: 'Referred to agency',
  PROMISE: 'Promise to pay',
  NOTE: 'Note',
  FINANCE_CHARGE: 'Finance charge',
  ASSIGNED: 'Collector assigned'
};

/** Receivables › Credit & collections: dunning, finance charges, collector worklist, credit limits and payment statistics. */
export const CollectionsPage: React.FC = () => {
  const f = useFinance();
  const { state } = f;
  const { party } = useLookups();
  const [tab, setTab] = useState<Tab>('WORK');
  const [customer, setCustomer] = useState(state.parties.find((p) => p.kind === 'CUSTOMER')?.id ?? '');
  const prompt = usePrompt();
  const overdue = state.documents.filter((d) => d.kind === 'INVOICE' && d.status === 'POSTED' && d.dueDate < TODAY && docBalance(state, d) > 0.005);
  const lastAction = (d: FinDocument) => state.collectionLog.find((x) => x.invoiceId === d.id && x.action !== 'NOTE');
  const customers = state.parties.filter((p) => p.kind === 'CUSTOMER');
  const exposure = (id: string) => round2(state.documents.filter((d) => d.kind === 'INVOICE' && d.partyId === id && d.status === 'POSTED').reduce((x, d) => x + docBalanceBase(state, d), 0));
  const total = round2(overdue.reduce((x, d) => x + docBalanceBase(state, d), 0));
  const belowMin = overdue.filter((d) => docBalanceBase(state, d) < state.settings.collectionMinimum).length;
  const promises = state.collectionLog.filter((x) => x.action === 'PROMISE' && (x.promiseDate ?? '') >= TODAY);

  const logAction = (d: FinDocument, action: CollectionAction['action']) =>
    prompt.open({
      title: action === 'PROMISE' ? `Promise to pay — ${d.number}` : action === 'ASSIGNED' ? `Assign ${party(d.partyId)?.name}` : `Log ${ACTION_LABEL[action].toLowerCase()} — ${d.number}`,
      fields:
        action === 'PROMISE'
          ? [
              { key: 'date', label: 'Promised date', type: 'date', initial: TODAY },
              { key: 'amount', label: 'Amount', type: 'number', initial: docBalance(state, d) },
              { key: 'text', label: 'Note', type: 'textarea' }
            ]
          : action === 'ASSIGNED'
            ? [
                { key: 'agent', label: 'Collector or agency', type: 'select', options: ['Grace Wanjiku (internal)', 'Peter Kamau (internal)', 'Mombasa Credit Recovery Agency', 'Kericho Debt Collectors Ltd'].map((x) => ({ value: x, label: x })) },
                { key: 'text', label: 'Note', type: 'textarea' }
              ]
            : [{ key: 'text', label: 'What happened', type: 'textarea', required: true }],
      onSubmit: (v) => f.logCollection({ invoiceId: d.id, partyId: d.partyId, action, text: v.text || (action === 'ASSIGNED' ? `Assigned to ${v.agent}` : ''), promiseDate: v.date, amount: v.amount ? num(v.amount) : undefined, agent: v.agent })
    });

  const letterHtml = (d: FinDocument, stage = state.settings.dunning[1]) => {
    const p = party(d.partyId);
    const text = stage.letter.replace(/\{(\w+)\}/g, (_, k: string) => ({ invoice: d.number, amount: money(docBalance(state, d), curOf(d)), due: d.dueDate, days: String(daysBetween(d.dueDate, TODAY)), customer: p?.name ?? '' })[k] ?? '');
    return `<p>${esc(TODAY)}</p><p><b>${esc(p?.name)}</b><br>${esc(p?.email)}</p><h1>${esc(stage.action === 'REMINDER' ? 'Payment reminder' : 'Overdue account notice')}</h1><p>Dear Sir/Madam,</p><p>${esc(text)}</p><table><tr><th>Invoice</th><th>Date</th><th>Due</th><th class="r">Outstanding</th></tr><tr><td>${esc(d.number)}</td><td>${esc(d.date)}</td><td>${esc(d.dueDate)}</td><td class="r">${esc(money(docBalance(state, d), curOf(d)))}</td></tr></table><p>Kericho Highland Estates Ltd · Credit Control</p>`;
  };

  return (
    <SuitePage
      eyebrow="Receivables"
      title="Credit & collections"
      subtitle="Who owes what, how late, what has been done about it, and who is allowed more credit."
      actions={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => f.financeCharges()}>
            <Percent size={14} /> Raise finance charges
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => f.runCollections()}>
            <BellRing size={14} /> Run dunning
          </button>
        </>
      }
    >
      <div className="sx-stats">
        <Stat label="Overdue" value={kes(total, { compact: true })} detail={`${overdue.length} invoices`} icon={<ShieldAlert size={16} />} tone="red" />
        <Stat label="Below collection minimum" value={belowMin} detail={`Under ${kes(state.settings.collectionMinimum, { compact: true })} — no calls`} icon={<PhoneCall size={16} />} tone="slate" />
        <Stat label="Open promises" value={promises.length} detail={kes(promises.reduce((x, p) => x + (p.amount ?? 0), 0), { compact: true })} icon={<CalendarPlus size={16} />} tone="blue" />
        <Stat label="Letters sent" value={state.collectionLog.filter((x) => ['REMINDER', 'DUNNING_1', 'DUNNING_2'].includes(x.action)).length} detail={<Simulated what="email" />} icon={<Megaphone size={16} />} tone="gold" />
      </div>
      <Chips<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'WORK', label: 'Worklist', count: overdue.length },
          { value: 'HISTORY', label: 'Customer history' },
          { value: 'CREDIT', label: 'Credit limits' },
          { value: 'PERFORMANCE', label: 'Payment statistics' },
          { value: 'LETTERS', label: 'Dunning letters' },
          { value: 'ALERTS', label: 'Tolerance alerts' }
        ]}
      />
      {tab === 'WORK' && (
        <DataTable
          rows={overdue}
          rowKey={(d) => d.id}
          initialSort={{ key: 'late', dir: 'desc' }}
          columns={[
            { key: 'n', header: 'Invoice', render: (d) => <b className="sx-mono">{d.number}</b>, sort: (d) => d.number },
            { key: 'c', header: 'Customer', render: (d) => <div className="sx-cell-main"><span>{party(d.partyId)?.name}</span><small>{party(d.partyId)?.collector ?? 'Unassigned'}</small></div>, sort: (d) => party(d.partyId)?.name ?? '' },
            { key: 'late', header: 'Days late', render: (d) => daysBetween(d.dueDate, TODAY), sort: (d) => daysBetween(d.dueDate, TODAY), align: 'right' },
            { key: 'b', header: 'Outstanding', render: (d) => money(docBalance(state, d), curOf(d)), sort: (d) => docBalanceBase(state, d), align: 'right' },
            { key: 'st', header: 'Last action', render: (d) => (d.delivery?.dispute && !d.delivery.dispute.resolved ? <Pill status="REJECTED" label="Disputed" /> : lastAction(d) ? ACTION_LABEL[lastAction(d)!.action] : docBalanceBase(state, d) < state.settings.collectionMinimum ? 'Below minimum' : '—') },
            {
              key: 'a',
              header: '',
              render: (d) => (
                <div className="fx-row-actions">
                  <button type="button" className="sx-link" onClick={() => logAction(d, 'CALL')}>Call</button>
                  <button type="button" className="sx-link" onClick={() => logAction(d, 'PROMISE')}>Promise</button>
                  <button type="button" className="sx-link" onClick={() => logAction(d, 'ASSIGNED')}>Assign</button>
                  <PrintLink title={`Letter ${d.number}`} html={() => letterHtml(d)} />
                </div>
              )
            }
          ]}
          empty="Nothing is overdue"
        />
      )}
      {tab === 'HISTORY' && (
        <>
          <Field label="Customer">
            <select className="form-control" value={customer} onChange={(e) => setCustomer(e.target.value)}>
              {customers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="sx-grid sx-grid-2">
            <Panel title="Collections history by invoice" flush>
              <DataTable
                rows={state.collectionLog.filter((x) => x.partyId === customer)}
                rowKey={(x) => x.id}
                columns={[
                  { key: 'at', header: 'When', render: (x) => x.at, sort: (x) => x.at },
                  { key: 'i', header: 'Invoice', render: (x) => state.documents.find((d) => d.id === x.invoiceId)?.number ?? '—' },
                  { key: 'a', header: 'Action', render: (x) => ACTION_LABEL[x.action] },
                  { key: 't', header: 'Detail', render: (x) => <small>{x.text}</small> },
                  { key: 'b', header: 'By', render: (x) => x.by }
                ]}
                empty="No collection activity"
              />
            </Panel>
            <Panel title="Billing contacts and notes">
              <ul className="fx-list">
                {(party(customer)?.contacts ?? []).map((c) => (
                  <li key={c.id}>
                    <b>{c.name}</b> ({c.role.toLowerCase()}) · {c.email} · {c.phone}
                  </li>
                ))}
                {!(party(customer)?.contacts ?? []).length && <li className="sx-muted">No contacts — add them on the customer card.</li>}
              </ul>
              <h4 className="sx-subhead">Notes</h4>
              <ul className="fx-list">
                {(party(customer)?.notes ?? []).slice().reverse().map((n, i) => (
                  <li key={i}>
                    <small>{n.at} · {n.by}</small> {n.text}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
      {tab === 'CREDIT' && (
        <DataTable
          rows={customers}
          rowKey={(p) => p.id}
          columns={[
            { key: 'n', header: 'Customer', render: (p) => <div className="sx-cell-main"><span>{p.name}</span><small>{p.paymentHold ? `On hold: ${p.paymentHold.reason}` : p.category}</small></div>, sort: (p) => p.name },
            { key: 'l', header: 'Credit limit', render: (p) => kes(p.creditLimit ?? 0, { compact: true }), align: 'right' },
            { key: 'e', header: 'Temporary extension', render: (p) => (effectiveLimit(p) > (p.creditLimit ?? 0) ? `+${kes(effectiveLimit(p) - (p.creditLimit ?? 0), { compact: true })} to ${p.creditExtensions!.find((x) => x.to >= TODAY && x.from <= TODAY)?.to}` : '—') },
            { key: 'x', header: 'Exposure', render: (p) => <div className="sx-meter-cell"><Meter value={effectiveLimit(p) ? exposure(p.id) / effectiveLimit(p) : 0} tone={exposure(p.id) > effectiveLimit(p) ? 'red' : 'green'} /><small>{kes(exposure(p.id), { compact: true })}</small></div>, sort: (p) => exposure(p.id) },
            {
              key: 'a',
              header: '',
              render: (p) => (
                <div className="fx-row-actions">
                  <button type="button" className="sx-link" onClick={() => prompt.open({
                    title: `Temporary credit extension — ${p.name}`,
                    fields: [
                      { key: 'amount', label: 'Extra limit', type: 'number', required: true },
                      { key: 'from', label: 'From', type: 'date', initial: TODAY },
                      { key: 'to', label: 'Until', type: 'date', initial: TODAY },
                      { key: 'reason', label: 'Reason', required: true }
                    ],
                    onSubmit: (v) => f.addCreditExtension(p.id, { amount: num(v.amount), from: v.from, to: v.to, reason: v.reason })
                  })}>Extend</button>
                  {p.paymentHold ? (
                    <button type="button" className="sx-link" onClick={() => f.releaseParty(p.id)}>Release hold</button>
                  ) : (
                    <button type="button" className="sx-link" onClick={() => prompt.open({ title: `Credit hold — ${p.name}`, fields: [{ key: 'reason', label: 'Reason', required: true }], onSubmit: (v) => f.holdParty(p.id, v.reason) })}>Hold</button>
                  )}
                </div>
              )
            }
          ]}
        />
      )}
      {tab === 'PERFORMANCE' && (
        <DataTable
          rows={customers.map((p) => ({ p, s: partyStats(state, p.id), actions: state.collectionLog.filter((x) => x.partyId === p.id).length, kept: state.collectionLog.filter((x) => x.partyId === p.id && x.action === 'PROMISE').length }))}
          rowKey={(r) => r.p.id}
          columns={[
            { key: 'n', header: 'Customer', render: (r) => r.p.name, sort: (r) => r.p.name },
            { key: 'i', header: 'Invoices', render: (r) => r.s.invoices, align: 'right' },
            { key: 'd', header: 'Avg days to pay', render: (r) => (r.s.paidCount ? r.s.avgDaysToPay : '—'), sort: (r) => r.s.avgDaysToPay, align: 'right' },
            { key: 'dso', header: 'DSO', render: (r) => r.s.dso, sort: (r) => r.s.dso, align: 'right' },
            { key: 'late', header: 'Paid late', render: (r) => `${Math.round(r.s.lateShare * 100)}%`, sort: (r) => r.s.lateShare, align: 'right' },
            { key: 'o', header: 'Open', render: (r) => kes(r.s.open, { compact: true }), sort: (r) => r.s.open, align: 'right' },
            { key: 'c', header: 'Collection actions', render: (r) => `${r.actions} (${r.kept} promises)`, align: 'right' },
            { key: 'l', header: 'Last payment', render: (r) => (r.s.lastPayment ? fmtDate(r.s.lastPayment.date) : '—') }
          ]}
        />
      )}
      {tab === 'LETTERS' && <LettersEditor />}
      {tab === 'ALERTS' && (
        <Panel title="Accounts outside tolerance" subtitle={`Overdue above ${state.settings.overdueTolerancePct}% of the balance, or exposure more than ${state.settings.overLimitTolerancePct}% over the credit limit`}>
          <DataTable
            rows={customers
              .map((p) => {
                const ex = exposure(p.id);
                const od = round2(overdue.filter((d) => d.partyId === p.id).reduce((x, d) => x + docBalanceBase(state, d), 0));
                const lim = effectiveLimit(p);
                const reasons = [ex > 0 && od / ex > state.settings.overdueTolerancePct / 100 && `${Math.round((od / ex) * 100)}% overdue`, lim > 0 && ex > lim * (1 + state.settings.overLimitTolerancePct / 100) && `${Math.round((ex / lim - 1) * 100)}% over limit`].filter(Boolean) as string[];
                return { p, ex, od, reasons };
              })
              .filter((r) => r.reasons.length)}
            rowKey={(r) => r.p.id}
            columns={[
              { key: 'n', header: 'Customer', render: (r) => r.p.name },
              { key: 'e', header: 'Exposure', render: (r) => kes(r.ex), align: 'right' },
              { key: 'o', header: 'Overdue', render: (r) => kes(r.od), align: 'right' },
              { key: 'r', header: 'Why', render: (r) => r.reasons.join(' · ') },
              {
                key: 'a',
                header: '',
                render: (r) => (
                  <button type="button" className="sx-link" onClick={() => (finNotify('Finance Manager', `Receivables alert: ${r.p.name}`, r.p.name, r.reasons.join('; '), 'warning'), f.logCollection({ invoiceId: '', partyId: r.p.id, action: 'NOTE', text: `Management alerted: ${r.reasons.join('; ')}` }))}>
                    Alert management
                  </button>
                )
              }
            ]}
            empty="All customers are within tolerance"
          />
        </Panel>
      )}
      {prompt.node}
    </SuitePage>
  );
};

const PrintLink: React.FC<{ title: string; html: () => string }> = ({ title, html }) => (
  <span className="fx-inline-print">
    <PrintButton title={title} html={html} label="Letter" />
  </span>
);

const LettersEditor: React.FC = () => {
  const { state, updateSettings } = useFinance();
  const [stages, setStages] = useState(state.settings.dunning);
  const [fc, setFc] = useState({ pct: state.settings.financeChargePct, from: state.settings.financeChargeFrom, compound: state.settings.financeChargeCompound, min: state.settings.collectionMinimum });
  return (
    <div className="sx-grid sx-grid-2">
      <Panel title="Dunning stages and letters" subtitle="Placeholders: {invoice} {amount} {due} {days} {customer}" action={<button type="button" className="btn btn-primary btn-sm" onClick={() => updateSettings({ dunning: stages })}>Save letters</button>}>
        {stages.map((s, i) => (
          <div key={s.action} className="fx-stage">
            <Field label={`${ACTION_LABEL[s.action]} after (days overdue)`}>
              <input className="form-control" type="number" value={s.days} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, days: Number(e.target.value) } : x)))} />
            </Field>
            <textarea className="form-control" rows={2} value={s.letter} onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, letter: e.target.value } : x)))} aria-label={`${s.action} letter`} />
          </div>
        ))}
      </Panel>
      <Panel title="Finance charges and minimums" action={<button type="button" className="btn btn-primary btn-sm" onClick={() => updateSettings({ financeChargePct: fc.pct, financeChargeFrom: fc.from, financeChargeCompound: fc.compound, collectionMinimum: fc.min })}>Save</button>}>
        <div className="sx-grid sx-grid-2">
          <Field label="Finance charge % per month">
            <input className="form-control" type="number" value={fc.pct} onChange={(e) => setFc({ ...fc, pct: Number(e.target.value) })} />
          </Field>
          <Field label="Charge invoices more than (days overdue)" hint="Bucket preference: 31 = from the 31–60 bucket">
            <input className="form-control" type="number" value={fc.from} onChange={(e) => setFc({ ...fc, from: Number(e.target.value) })} />
          </Field>
          <Field label="Charge interest on earlier finance charges">
            <input type="checkbox" checked={fc.compound} onChange={(e) => setFc({ ...fc, compound: e.target.checked })} />
          </Field>
          <Field label="Collection minimum (KES)">
            <input className="form-control" type="number" value={fc.min} onChange={(e) => setFc({ ...fc, min: Number(e.target.value) })} />
          </Field>
        </div>
        <DefList items={[['Customers with a collector', String(state.parties.filter((p) => p.collector).length)], ['Customers on credit hold', String(state.parties.filter((p) => p.kind === 'CUSTOMER' && p.paymentHold).length)]]} />
        <p className="sx-note">
          <Users size={13} /> Invoices reaching the agency stage are assigned to the outside agency automatically. <ShieldCheck size={13} /> Disputed invoices are skipped.
        </p>
      </Panel>
    </div>
  );
};
