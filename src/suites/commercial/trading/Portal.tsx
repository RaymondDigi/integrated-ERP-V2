import React, { useEffect, useState } from 'react';
import { Globe, ShoppingCart, Package, Gavel, MessageSquare, UserPlus, Trash2 } from 'lucide-react';
import { useCommercial } from '../store';
import { orderStage, ORDER_STAGE_LABEL, totals } from '../engine';
import { addDays, fmtDate, kes, TODAY } from '../../finance/engine';
import type { Line } from '../types';
import type { Feedback } from '../tradeTypes';
import { Chips, Field, Panel, Pill, SuitePage } from '../../ui/kit';
import { highestBid, profileOf, resolvePrice } from '../tradeEngine';

type Tab = 'SHOP' | 'BASKET' | 'ORDERS' | 'BIDS' | 'FEEDBACK' | 'APPLY';

/** A simulated customer self-service portal, run inside the ERP so the back-office flows can be shown end to end. */
export const PortalPage: React.FC = () => {
  const { state, finance, setPortalCustomer, portalTrack } = useCommercial();
  const [tab, setTab] = useState<Tab>('SHOP');
  const [basket, setBasket] = useState<Line[]>([]);
  const me = state.portalCustomerId;
  const customers = finance.state.parties.filter((p) => p.kind === 'CUSTOMER' && p.category !== 'Cash sales');
  useEffect(() => {
    if (tab === 'SHOP' && me) portalTrack('CATALOGUE');
    if (tab === 'ORDERS' && me) portalTrack('ORDER_STATUS');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  return (
    <SuitePage
      eyebrow="Channels"
      title="Customer portal"
      subtitle="What a customer sees when they sign in: catalogue and stock, web orders, order status, online payment, auction bids, feedback and account applications."
      actions={
        <select className="form-control" aria-label="Signed in as" value={me} onChange={(e) => setPortalCustomer(e.target.value)}>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              Signed in as {c.name}
            </option>
          ))}
        </select>
      }
    >
      <div className="tr-sim">
        <Globe size={15} /> Simulated portal: this screen stands in for the public website and mobile app. Logins, payments (M-PESA/card) and messages are simulated; every action runs through the same back-office rules.
      </div>
      <div className="sx-toolbar">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: 'SHOP', label: 'Catalogue' },
            { value: 'BASKET', label: 'Basket', count: basket.length },
            { value: 'ORDERS', label: 'My orders' },
            { value: 'BIDS', label: 'Auction' },
            { value: 'FEEDBACK', label: 'Feedback' },
            { value: 'APPLY', label: 'Open an account' }
          ]}
        />
      </div>
      {tab === 'SHOP' && <Shop me={me} onAdd={(l) => setBasket([...basket.filter((x) => x.sku !== l.sku), l])} />}
      {tab === 'BASKET' && <Basket me={me} basket={basket} setBasket={setBasket} onDone={() => (setBasket([]), setTab('ORDERS'))} />}
      {tab === 'ORDERS' && <MyOrders me={me} />}
      {tab === 'BIDS' && <Bids me={me} />}
      {tab === 'FEEDBACK' && <FeedbackTab me={me} />}
      {tab === 'APPLY' && <Apply />}
    </SuitePage>
  );
};

const Shop: React.FC<{ me: string; onAdd: (l: Line) => void }> = ({ me, onAdd }) => {
  const { state, portalTrack } = useCommercial();
  const [qty, setQty] = useState<Record<string, number>>({});
  const items = state.products.filter((p) => p.kind === 'GOODS' && p.status !== 'INACTIVE' && p.status !== 'PROVISIONAL' && p.price > 0);
  return (
    <div className="tr-cards">
      {items.map((p) => {
        const r = me ? resolvePrice(state, { customerId: me, sku: p.sku, qty: qty[p.sku] || 1, date: TODAY }) : null;
        return (
          <div className="tr-card" key={p.sku}>
            <div className="tr-img" style={p.imageUrl ? { backgroundImage: `url(${p.imageUrl})` } : undefined}>
              {p.attributes?.grade ?? p.category}
            </div>
            <h4>{p.name}</h4>
            <small>
              {p.sku} · {p.unit}
            </small>
            <b>{kes(r?.net ?? p.price)}</b>
            {r && r.net < p.price && <small>Your price ({r.ruleLabel}) — list {kes(p.price)}</small>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => portalTrack('STOCK_INQUIRY', p.sku)}>
              <Package size={13} /> {p.stock > 0 ? (p.stock > 50 ? 'In stock' : `Only ${p.stock} left`) : 'Out of stock — available to order'}
            </button>
            <div className="tr-row">
              <input className="form-control" type="number" min="1" aria-label={`Quantity ${p.name}`} value={qty[p.sku] ?? 1} onChange={(e) => setQty({ ...qty, [p.sku]: Number(e.target.value) })} />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onAdd({ id: p.sku, sku: p.sku, description: p.name, qty: qty[p.sku] || 1, price: r?.net ?? p.price, discountPct: 0 })}>
                <ShoppingCart size={13} /> Add
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Basket: React.FC<{ me: string; basket: Line[]; setBasket: (l: Line[]) => void; onDone: () => void }> = ({ me, basket, setBasket, onDone }) => {
  const { state, party, placeWebOrder } = useCommercial();
  const prof = profileOf(state, me);
  const [w, setW] = useState({ segment: 'B2B' as 'B2B' | 'B2C', shipToId: prof.shipTos[0]?.id ?? '', oneTimeShipTo: '', customerRef: '', requiredBy: addDays(TODAY, 5), buyerName: '' });
  const t = totals(basket, state.products, party(me));
  return (
    <Panel title="Checkout" subtitle="Business customers order on account; consumers pay online before dispatch">
      <ul className="sx-list">
        {basket.map((l) => (
          <li key={l.sku}>
            <span>{l.description}</span>
            <span>
              {l.qty} × {kes(l.price)}
            </span>
            <button type="button" className="sx-icon-btn" aria-label="Remove" onClick={() => setBasket(basket.filter((x) => x.sku !== l.sku))}>
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
      <div className="sx-grid">
        <Field label="Buying as">
          <select className="form-control" value={w.segment} onChange={(e) => setW({ ...w, segment: e.target.value as 'B2B' | 'B2C' })}>
            <option value="B2B">Business (on account)</option>
            <option value="B2C">Consumer (pay online)</option>
          </select>
        </Field>
        {w.segment === 'B2B' ? (
          <Field label="Deliver to">
            <select className="form-control" value={w.shipToId} onChange={(e) => setW({ ...w, shipToId: e.target.value })}>
              <option value="">Main address</option>
              {prof.shipTos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} · {a.town}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <>
            <Field label="Your name">
              <input className="form-control" value={w.buyerName} onChange={(e) => setW({ ...w, buyerName: e.target.value })} />
            </Field>
            <Field label="Delivery address">
              <input className="form-control" value={w.oneTimeShipTo} onChange={(e) => setW({ ...w, oneTimeShipTo: e.target.value })} />
            </Field>
          </>
        )}
        <Field label="Your order reference" required>
          <input className="form-control" value={w.customerRef} onChange={(e) => setW({ ...w, customerRef: e.target.value })} />
        </Field>
        <Field label="Needed by">
          <input className="form-control" type="date" value={w.requiredBy} onChange={(e) => setW({ ...w, requiredBy: e.target.value })} />
        </Field>
      </div>
      <div className="tr-row">
        <span className="sx-grow" />
        <b>Total {kes(t.total)} (shipping added at checkout)</b>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => placeWebOrder({ lines: basket, segment: w.segment, shipToId: w.segment === 'B2B' ? w.shipToId || undefined : undefined, oneTimeShipTo: w.segment === 'B2C' ? w.oneTimeShipTo : undefined, customerRef: w.customerRef, requiredBy: w.requiredBy, buyerName: w.buyerName }).ok && onDone()}
        >
          Place order
        </button>
      </div>
    </Panel>
  );
};

const MyOrders: React.FC<{ me: string }> = ({ me }) => {
  const { state, orderValue, requestChange, payOrder } = useCommercial();
  const [note, setNote] = useState<Record<string, string>>({});
  const [phone, setPhone] = useState('254712345678');
  const mine = state.orders.filter((o) => o.customerId === me);
  return (
    <Panel title="My orders" subtitle="Track status, ask for a change or cancellation, and pay online">
      <ul className="sx-list">
        {mine.map((o) => {
          const paid = state.payments.some((p) => p.orderId === o.id && p.status === 'SUCCESS');
          const req = state.changeRequests.find((c) => c.orderId === o.id && c.status === 'OPEN');
          return (
            <li key={o.id} style={{ flexWrap: 'wrap' }}>
              <span className="sx-mono">{o.number}</span>
              <span>{o.customerRef}</span>
              <span>{fmtDate(o.date)}</span>
              <b>{kes(orderValue(o))}</b>
              <Pill status={orderStage(o) === 'COMPLETED' ? 'POSTED' : 'SUBMITTED'} label={ORDER_STAGE_LABEL[orderStage(o)]} />
              {req && <span className="tr-badge warn">{req.kind === 'CANCEL' ? 'Cancellation' : 'Change'} requested</span>}
              {o.status !== 'VOID' && !o.lines.some((l) => l.delivered > 0) && !req && (
                <span className="tr-row">
                  <input className="form-control" placeholder="What should change?" value={note[o.id] ?? ''} onChange={(e) => setNote({ ...note, [o.id]: e.target.value })} />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => requestChange(o.id, 'CHANGE', note[o.id] ?? '')}>
                    Request change
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => requestChange(o.id, 'CANCEL', note[o.id] || 'Please cancel')}>
                    Cancel order
                  </button>
                </span>
              )}
              {o.paymentMode === 'CASH' && !paid && o.status !== 'VOID' && (
                <span className="tr-row">
                  <input className="form-control" aria-label="M-PESA number" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => payOrder(o.id, 'M-PESA', phone, '', true)}>
                    Pay with M-PESA (simulated)
                  </button>
                </span>
              )}
              {paid && <span className="tr-badge good">Paid</span>}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};

const Bids: React.FC<{ me: string }> = ({ me }) => {
  const { state, placeBid } = useCommercial();
  const [price, setPrice] = useState<Record<string, number>>({});
  const open = state.auctions.filter((a) => a.status === 'OPEN');
  return (
    <Panel title="Bid at this week's sale" subtitle="Bids count against your credit limit">
      {open.map((a) => (
        <div key={a.id}>
          <h4 className="sx-subhead">
            {a.saleNo} · {fmtDate(a.date)}
          </h4>
          <ul className="sx-list">
            {a.lots
              .filter((l) => l.status === 'OPEN')
              .map((l) => {
                const top = highestBid(l);
                return (
                  <li key={l.lotNo}>
                    <span className="sx-mono">Lot {l.lotNo}</span>
                    <span>
                      {l.garden} {l.grade} · {l.netKg} kg
                    </span>
                    <span>{top ? `Top USD ${top.price.toFixed(2)}${top.customerId === me ? ' (you)' : ''}` : `Valuation USD ${l.valuation.toFixed(2)}`}</span>
                    <input className="form-control" style={{ maxWidth: 110 }} type="number" step="0.01" aria-label={`Bid on lot ${l.lotNo}`} value={price[l.lotNo] ?? ''} onChange={(e) => setPrice({ ...price, [l.lotNo]: Number(e.target.value) })} />
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => placeBid(a.id, l.lotNo, me, price[l.lotNo] ?? 0, true)}>
                      <Gavel size={13} /> Bid
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
      {!open.length && <p className="sx-muted">No sale is open for bidding.</p>}
    </Panel>
  );
};

const FeedbackTab: React.FC<{ me: string }> = ({ me }) => {
  const { state, logFeedback } = useCommercial();
  const [f, setF] = useState({ type: 'COMPLAINT' as Feedback['type'], category: 'Delivery', severity: 'MEDIUM' as Feedback['severity'], subject: '', orderId: '' });
  const mine = state.feedback.filter((x) => x.customerId === me);
  return (
    <Panel title="Tell us how we did" subtitle="Complaints are answered within the service level for their severity">
      <div className="tr-row">
        <select className="form-control" aria-label="Type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Feedback['type'] })}>
          <option value="COMPLAINT">Complaint</option>
          <option value="COMPLIMENT">Compliment</option>
          <option value="SUGGESTION">Suggestion</option>
        </select>
        <select className="form-control" aria-label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {['Delivery', 'Quality', 'Pricing', 'Invoice', 'Service'].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select className="form-control" aria-label="Severity" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as Feedback['severity'] })}>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
        <input className="form-control grow" placeholder="Tell us more" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => logFeedback({ customerId: me, type: f.type, channel: 'PORTAL', category: f.category, severity: f.severity, subject: f.subject, orderId: f.orderId || undefined }, true).ok && setF({ ...f, subject: '' })}>
          <MessageSquare size={13} /> Send
        </button>
      </div>
      <ul className="sx-list">
        {mine.map((x) => (
          <li key={x.id}>
            <span className="sx-mono">{x.number}</span>
            <span>{x.subject}</span>
            <Pill status={x.status === 'CLOSED' || x.status === 'RESOLVED' ? 'POSTED' : 'SUBMITTED'} label={x.status.toLowerCase().replace('_', ' ')} />
          </li>
        ))}
      </ul>
    </Panel>
  );
};

const Apply: React.FC = () => {
  const { submitApplication } = useCommercial();
  const [a, setA] = useState({ company: '', pin: '', contact: '', email: '', phone: '', town: 'Nairobi', category: 'Retail', requestedLimit: 500000 });
  return (
    <Panel title="Apply for a credit account" subtitle="Your application goes to our credit team; upload your KYC documents when asked">
      <div className="sx-grid">
        <Field label="Company name" required span={2}>
          <input className="form-control" value={a.company} onChange={(e) => setA({ ...a, company: e.target.value })} />
        </Field>
        <Field label="KRA PIN" required>
          <input className="form-control" value={a.pin} onChange={(e) => setA({ ...a, pin: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Contact person">
          <input className="form-control" value={a.contact} onChange={(e) => setA({ ...a, contact: e.target.value })} />
        </Field>
        <Field label="Email">
          <input className="form-control" value={a.email} onChange={(e) => setA({ ...a, email: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input className="form-control" value={a.phone} onChange={(e) => setA({ ...a, phone: e.target.value })} />
        </Field>
        <Field label="Town">
          <input className="form-control" value={a.town} onChange={(e) => setA({ ...a, town: e.target.value })} />
        </Field>
        <Field label="Credit limit requested (KES)">
          <input className="form-control" type="number" value={a.requestedLimit} onChange={(e) => setA({ ...a, requestedLimit: Number(e.target.value) })} />
        </Field>
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => submitApplication({ ...a, channel: 'PORTAL' }).ok && setA({ ...a, company: '', pin: '' })}>
        <UserPlus size={13} /> Submit application
      </button>
    </Panel>
  );
};
