import React, { useState } from 'react';
import { CreditCard, Receipt, Smartphone, Banknote, Plus } from 'lucide-react';
import { useCommercial } from '../store';
import { orderStage, totals } from '../engine';
import { fmtDate, kes, round2, TODAY } from '../../finance/engine';
import type { Line, SalesOrder } from '../types';
import { DataTable, Field, Panel, Pill, Stat, SuitePage, type Column, Chips } from '../../ui/kit';
import { LinesEditor, newLine } from '../parts';
import { CASH_CUSTOMER } from '../tradeActions';

/** Over-the-counter cash sales: scan or pick items, take M-PESA, card or cash, issue the receipt (gateway simulated). */
export const CounterPage: React.FC = () => {
  const { state, party, cashSale } = useCommercial();
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [buyer, setBuyer] = useState('');
  const [phone, setPhone] = useState('2547');
  const [method, setMethod] = useState<'M-PESA' | 'CARD' | 'CASH'>('M-PESA');
  const [card, setCard] = useState('');
  const [segment, setSegment] = useState<'B2C' | 'B2B'>('B2C');
  const [tendered, setTendered] = useState(0);
  const cashParty = state.orders.length ? party(state.orders.find((o) => o.channel === 'POS')?.customerId ?? '') : undefined;
  const t = totals(lines.filter((l) => l.qty > 0 && l.description), state.products, cashParty ?? { id: '', kind: 'CUSTOMER', name: CASH_CUSTOMER, pin: '', email: '', phone: '', terms: 0, creditLimit: 0, category: 'Cash sales' });
  const today = state.orders.filter((o) => o.channel === 'POS' && o.date === TODAY);
  const sales = state.orders.filter((o) => o.channel === 'POS');
  const takings = round2(state.payments.filter((p) => p.status === 'SUCCESS' && p.at.slice(0, 10) === TODAY).reduce((x, p) => x + p.amount, 0));
  const ring = () => {
    const r = cashSale({ lines, buyer, phone, method, card, segment, tendered });
    if (r.ok) {
      setLines([newLine()]);
      setBuyer('');
      setTendered(0);
      setCard('');
    }
  };
  const columns: Column<SalesOrder>[] = [
    { key: 'n', header: 'Sale', render: (o) => <b className="sx-mono">{o.number}</b>, sort: (o) => o.number },
    { key: 'b', header: 'Buyer', render: (o) => o.oneTimeName ?? '—' },
    { key: 'd', header: 'Date', render: (o) => fmtDate(o.date), sort: (o) => o.date },
    { key: 'p', header: 'Paid by', render: (o) => state.payments.find((p) => p.orderId === o.id)?.method ?? '—' },
    { key: 'r', header: 'Receipt', render: (o) => state.payments.find((p) => p.orderId === o.id)?.receiptNumber ?? '—' },
    { key: 'v', header: 'Total', render: (o) => kes(totals(o.lines, state.products, party(o.customerId)).total), align: 'right' },
    { key: 's', header: 'Stage', render: (o) => <Pill status={orderStage(o) === 'COMPLETED' ? 'POSTED' : 'SUBMITTED'} label={orderStage(o) === 'COMPLETED' ? 'Paid & invoiced' : 'Open'} /> }
  ];
  return (
    <SuitePage eyebrow="Sell" title="Counter sales" subtitle="Walk-in and cash customers: the sale, delivery, invoice and receipt are created in one step.">
      <div className="tr-sim">
        <Smartphone size={15} /> Payment gateway is simulated: M-PESA STK push and card authorisation return a test reference instantly. No money moves.
      </div>
      <div className="sx-stats">
        <Stat label="Sales today" value={today.length} icon={<Receipt size={17} />} />
        <Stat label="Takings today" value={kes(takings, { compact: true })} detail="All channels" icon={<Banknote size={17} />} tone="blue" />
        <Stat label="Counter sales to date" value={sales.length} icon={<Receipt size={17} />} tone="violet" />
      </div>
      <Panel title="New sale" subtitle="Scan a barcode or pick items">
        <LinesEditor lines={lines} onChange={setLines} mode="SELL" party={cashParty} />
        <div className="sx-grid">
          <Field label="Buyer name">
            <input className="form-control" value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder="Walk-in customer" />
          </Field>
          <Field label="Segment">
            <Chips
              value={segment}
              onChange={setSegment}
              options={[
                { value: 'B2C', label: 'Consumer' },
                { value: 'B2B', label: 'Business' }
              ]}
            />
          </Field>
          <Field label="Payment method">
            <select className="form-control" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
              <option value="M-PESA">M-PESA</option>
              <option value="CARD">Card</option>
              <option value="CASH">Cash</option>
            </select>
          </Field>
          {method === 'M-PESA' && (
            <Field label="M-PESA number">
              <input className="form-control" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2547XXXXXXXX" />
            </Field>
          )}
          {method === 'CARD' && (
            <Field label="Card last 4 digits">
              <input className="form-control" value={card} maxLength={4} onChange={(e) => setCard(e.target.value)} />
            </Field>
          )}
          {method === 'CASH' && (
            <Field label="Cash tendered" hint={tendered >= t.total && t.total ? `Change ${kes(round2(tendered - t.total))}` : undefined}>
              <input className="form-control" type="number" value={tendered} onChange={(e) => setTendered(Number(e.target.value))} />
            </Field>
          )}
        </div>
        <div className="tr-row">
          <span className="sx-grow" />
          <b>Total {kes(t.total)}</b>
          <button type="button" className="btn btn-primary btn-sm" onClick={ring}>
            {method === 'CARD' ? <CreditCard size={14} /> : <Plus size={14} />} Take payment & complete sale
          </button>
        </div>
      </Panel>
      <DataTable rows={sales} columns={columns} rowKey={(o) => o.id} initialSort={{ key: 'n', dir: 'desc' }} />
    </SuitePage>
  );
};
