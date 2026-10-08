import React, { useState } from 'react';
import { Receipt, Printer } from 'lucide-react';
import { useCommercial } from '../store';
import { fmtDate, kes, round2 } from '../../finance/engine';
import type { SalesOrder } from '../types';
import { DataTable, Empty, Field, Panel, Pill, Stat, SuitePage, type Column } from '../../ui/kit';
import { printDocument } from '../../../platform/Widgets';
import { invoiceHtml } from './docs';
import { profileOf } from '../tradeEngine';

type GroupBy = 'ORDER' | 'PO' | 'CUSTOMER' | 'SHIP_TO';
const GROUP_LABEL: Record<GroupBy, string> = { ORDER: 'One invoice per order', PO: 'One per customer PO', CUSTOMER: 'One per customer (consolidated)', SHIP_TO: 'One per ship-to location' };

/** Invoice run: everything delivered but not yet invoiced, grouped as the customer wants, split by payment terms. */
export const InvoicingPage: React.FC = () => {
  const { state, party, finance, invoiceRun } = useCommercial();
  const due = state.orders.filter((o) => o.status === 'APPROVED' && (o.lines.some((l) => l.delivered > l.invoiced) || (o.charges ?? []).some((c) => !c.invoiced && c.postShipment)));
  const [pick, setPick] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('ORDER');
  const val = (o: SalesOrder) => round2(o.lines.reduce((x, l) => x + (l.delivered - l.invoiced) * l.price * (1 - (l.discountPct || 0) / 100), 0));
  const columns: Column<SalesOrder>[] = [
    {
      key: 'x',
      header: '',
      width: 34,
      render: (o) => <input type="checkbox" aria-label={`Include ${o.number}`} checked={pick.includes(o.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setPick(e.target.checked ? [...pick, o.id] : pick.filter((x) => x !== o.id))} />
    },
    { key: 'n', header: 'Order', render: (o) => <b className="sx-mono">{o.number}</b>, sort: (o) => o.number },
    { key: 'c', header: 'Customer', render: (o) => party(o.customerId)?.name, sort: (o) => party(o.customerId)?.name ?? '' },
    { key: 'p', header: 'Customer PO', render: (o) => o.customerRef || '—' },
    { key: 's', header: 'Ship-to', render: (o) => profileOf(state, o.customerId).shipTos.find((x) => x.id === o.shipToId)?.label ?? o.oneTimeShipTo ?? 'Main', hideOnMobile: true },
    { key: 't', header: 'Terms', render: (o) => state.paymentTerms.find((t) => t.id === (o.termId ?? profileOf(state, o.customerId).termId))?.label ?? `${party(o.customerId)?.terms ?? 30} days`, hideOnMobile: true },
    { key: 'v', header: 'To invoice', render: (o) => kes(val(o)), sort: val, align: 'right' }
  ];
  const recent = finance.state.documents.filter((d) => d.kind === 'INVOICE' && d.department === 'Sales').slice(0, 12);
  return (
    <SuitePage eyebrow="Sell" title="Invoice run" subtitle="Pick delivered orders and raise invoices in Finance in one run. Lines on different payment terms go on separate invoices.">
      <div className="sx-stats">
        <Stat label="Orders to invoice" value={due.length} icon={<Receipt size={17} />} />
        <Stat label="Value to invoice" value={kes(round2(due.reduce((x, o) => x + val(o), 0)), { compact: true })} tone="violet" icon={<Receipt size={17} />} />
      </div>
      <div className="sx-toolbar">
        <Field label="Group invoices">
          <select className="form-control" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
              <option key={g} value={g}>
                {GROUP_LABEL[g]}
              </option>
            ))}
          </select>
        </Field>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPick(pick.length === due.length ? [] : due.map((o) => o.id))}>
          {pick.length === due.length && due.length ? 'Clear' : 'Select all'}
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!pick.length} onClick={() => invoiceRun(pick, groupBy).ok && setPick([])}>
          <Receipt size={14} /> Raise {pick.length || ''} invoice{pick.length === 1 ? '' : 's'}
        </button>
      </div>
      <DataTable rows={due} columns={columns} rowKey={(o) => o.id} empty={<Empty icon={<Receipt size={20} />} title="Nothing waiting to be invoiced" />} />
      <Panel title="Recent sales invoices" subtitle="Reprint in the customer's document format">
        <ul className="sx-list">
          {recent.map((d) => (
            <li key={d.id}>
              <span className="sx-mono">{d.number}</span>
              <span>{party(d.partyId)?.name}</span>
              <span className="sx-muted">{fmtDate(d.date)}</span>
              <Pill status={d.status} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => printDocument(`Invoice ${d.number}`, invoiceHtml(state, finance.state, d))}>
                <Printer size={13} /> Print
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </SuitePage>
  );
};
