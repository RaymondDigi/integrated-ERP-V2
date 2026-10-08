import React, { useState } from 'react';
import { Bell, FileText, Gavel, LogIn, MessageSquare, Package, Plus, Send, Truck, UserPlus } from 'lucide-react';
import { useCommercial } from '../store';
import { totals } from '../engine';
import { addDays, docBalance, fmtDate, kes, round2, TODAY } from '../../finance/engine';
import { Attachments } from '../../../platform/Widgets';
import { DataTable, DefList, Empty, Field, Modal, Pill, Stat, SuitePage } from '../../ui/kit';
import { useProcurementExt } from './ext/store';
import { auctionLive, bestBids, bidRank, DOC_TYPE_LABEL, EVENT_KIND_LABEL, EVENT_STATUS_LABEL, expiringDocuments, invoiceGross, maskAccount, overdueUpdate } from './ext/engine';
import { BidChart, ReadOnlyNote, Tabs, TONE } from './ext/ui';
import { ResponseForm } from './Sourcing';
import { blankDraft, SupplierFields } from './Vendors';
import type { SupplierDraft } from './ext/actions/suppliers';
import type { DocType, InvoiceLine, SourcingEvent, SupplierCore } from './ext/types';

type PTab = 'home' | 'events' | 'orders' | 'invoices' | 'catalogue' | 'profile' | 'register';

/**
 * The supplier's side of procurement, viewed "as" one supplier. Real supplier logins need a backend identity
 * store; here the buyer picks which supplier to act as, and everything they do is recorded as from the portal.
 */
export const SupplierPortalPage: React.FC = () => {
  const ext = useProcurementExt();
  const { finance } = useCommercial();
  const [tab, setTab] = useState<PTab>('home');
  const sid = ext.state.portalSupplier;
  const prof = ext.state.suppliers.find((p) => p.partyId === sid);
  const approved = ext.state.suppliers.filter((p) => p.partyId);
  const party = finance.state.parties.find((p) => p.id === sid);
  return (
    <SuitePage
      eyebrow="Supplier portal"
      title={prof?.name ?? 'Supplier portal'}
      subtitle="What a supplier sees after signing in: invitations, auctions, orders, invoices, catalogue and their own profile."
      actions={
        <label className="prx-inline">
          <span className="sx-muted">Viewing as</span>
          <select className="form-control" value={sid} onChange={(e) => ext.suppliers.setPortalSupplier(e.target.value)} aria-label="Supplier">
            {approved.map((p) => (
              <option key={p.id} value={p.partyId}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <ReadOnlyNote show={ext.readOnly} />
      <div className="prx-brand" style={{ background: ext.state.branding.colour }}>
        <b>{ext.state.branding.name} — supplier portal</b>
        <span>{ext.state.branding.welcome}</span>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ['home', 'Home'],
          ['events', 'Invitations & auctions'],
          ['orders', 'Orders & shipping'],
          ['invoices', 'Invoices & payments'],
          ['catalogue', 'Catalogue'],
          ['profile', 'My details'],
          ['register', 'New supplier registration']
        ]}
      />
      {tab === 'home' && prof && <PortalHome sid={sid} />}
      {tab === 'events' && <PortalEvents sid={sid} />}
      {tab === 'orders' && <PortalOrders sid={sid} />}
      {tab === 'invoices' && <PortalInvoices sid={sid} />}
      {tab === 'catalogue' && <PortalCatalogue sid={sid} />}
      {tab === 'profile' && prof && <PortalProfile sid={sid} />}
      {tab === 'register' && <PortalRegister />}
      {!prof && tab !== 'register' && <Empty title="Choose a supplier" text={party?.name} />}
    </SuitePage>
  );
};

const PortalHome: React.FC<{ sid: string }> = ({ sid }) => {
  const ext = useProcurementExt();
  const { state } = useCommercial();
  const prof = ext.state.suppliers.find((p) => p.partyId === sid)!;
  const invites = ext.state.events.filter((e) => e.status === 'OPEN' && e.invited.some((i) => i.supplierId === sid));
  const docs = expiringDocuments([prof], ext.state.settings.docAlertDays);
  const upd = prof.updateRequests.find((u) => u.status === 'SENT' || u.status === 'REJECTED');
  const pos = state.purchaseOrders.filter((o) => o.supplierId === sid && o.sentAt && o.status === 'APPROVED' && !o.closed);
  const invs = ext.state.invoices.filter((i) => i.supplierId === sid);
  return (
    <>
      <div className="sx-stats">
        <Stat label="Open invitations" value={invites.length} detail={invites.some((e) => auctionLive(e)) ? 'An auction is live now' : 'Respond before they close'} icon={<Gavel size={17} />} tone="blue" />
        <Stat label="Open orders" value={pos.length} detail="Ship and send an advance notice" icon={<Truck size={17} />} />
        <Stat label="Invoices on hold" value={invs.filter((i) => i.status === 'ON_HOLD').length} detail={`${invs.length} submitted in total`} icon={<FileText size={17} />} tone="gold" />
        <Stat label="Documents to renew" value={docs.length} detail="Expiring or expired" icon={<Bell size={17} />} tone={docs.length ? 'red' : 'green'} />
      </div>
      {upd && (
        <div className="sx-callout danger">
          <Bell size={16} />
          <div>
            <b>Please update your details by {fmtDate(upd.due)}</b>
            <span>{overdueUpdate(prof) ? 'Overdue — new orders and invoices are on hold until you respond.' : 'Open the My details tab to respond.'}</span>
          </div>
        </div>
      )}
      {docs.map((x) => (
        <div key={x.doc.id} className="sx-callout warn">
          <Bell size={16} />
          <div>
            <b>
              {DOC_TYPE_LABEL[x.doc.type]} {x.days < 0 ? `expired ${-x.days} days ago` : `expires in ${x.days} days`}
            </b>
            <span>Upload the renewed certificate under My details.</span>
          </div>
        </div>
      ))}
      <ul className="sx-list">
        {invites.map((e) => (
          <li key={e.id}>
            <span className="sx-mono">{e.number}</span>
            <span>{e.title}</span>
            <span className="sx-muted">{e.auction ? `Bidding ${new Date(e.auction.start).toLocaleString('en-GB')} – ${new Date(e.auction.end).toLocaleString('en-GB')}` : `Closes ${fmtDate(e.closes)}`}</span>
          </li>
        ))}
      </ul>
    </>
  );
};

const PortalEvents: React.FC<{ sid: string }> = ({ sid }) => {
  const ext = useProcurementExt();
  const prof = ext.state.suppliers.find((p) => p.partyId === sid);
  const list = ext.state.events.filter((e) => e.status !== 'DRAFT' && e.invited.some((i) => i.supplierId === sid));
  const [openId, setOpenId] = useState<string | null>(null);
  const cur = list.find((e) => e.id === openId);
  return (
    <>
      <DataTable
        rows={list}
        rowKey={(e) => e.id}
        onRowClick={(e) => setOpenId(e.id)}
        selected={openId}
        empty={<Empty title="No invitations yet" />}
        columns={[
          { key: 'n', header: 'Event', render: (e) => <b className="sx-mono">{e.number}</b> },
          { key: 't', header: 'Title', render: (e) => <div className="sx-cell-main"><span>{e.title}</span><small>{EVENT_KIND_LABEL[e.kind]}</small></div> },
          { key: 'c', header: 'Closes', render: (e) => (e.auction ? new Date(e.auction.end).toLocaleString('en-GB') : fmtDate(e.closes)) },
          { key: 'm', header: 'My response', render: (e) => (e.responses.some((r) => r.supplierId === sid) ? `Revision ${Math.max(...e.responses.filter((r) => r.supplierId === sid).map((r) => r.revision))}` : e.bids.some((b) => b.supplierId === sid) ? `${e.bids.filter((b) => b.supplierId === sid).length} bids` : '—') },
          { key: 's', header: 'Status', render: (e) => <Pill status={TONE[e.status]} label={auctionLive(e) ? 'Live auction' : EVENT_STATUS_LABEL[e.status]} /> }
        ]}
      />
      {cur && <PortalEvent e={cur} sid={sid} by={prof?.contactPerson || prof?.name || 'Supplier'} onClose={() => setOpenId(null)} />}
    </>
  );
};

const PortalEvent: React.FC<{ e: SourcingEvent; sid: string; by: string; onClose: () => void }> = ({ e, sid, by, onClose }) => {
  const ext = useProcurementExt();
  const [respond, setRespond] = useState(false);
  const [amount, setAmount] = useState(0);
  const [q, setQ] = useState('');
  const rank = bidRank(e, sid);
  const best = bestBids(e)[0];
  const mine = e.bids.filter((b) => b.supplierId === sid).sort((a, b) => a.amount - b.amount)[0];
  const msgs = e.messages.filter((m) => m.public || m.supplierId === sid);
  return (
    <>
      <Modal size="xl" title={`${e.number} · ${e.title}`} subtitle={`${EVENT_KIND_LABEL[e.kind]} · ${e.status === 'OPEN' ? 'open' : e.status.toLowerCase()}`} onClose={onClose}>
        <DefList
          items={[
            ['Respond by', e.auction ? new Date(e.auction.end).toLocaleString('en-GB') : fmtDate(e.closes)],
            ['Questions until', e.qaDeadline ? fmtDate(e.qaDeadline) : '—'],
            ['Terms', e.terms]
          ]}
        />
        {e.lots.map((lot) => (
          <div key={lot.id}>
            <h4 className="sx-subhead">{lot.name}</h4>
            <ul className="sx-list">
              {lot.lines.map((l) => (
                <li key={l.id}>
                  <span>{l.description}</span>
                  <span className="sx-muted">{l.spec}</span>
                  <b>
                    {l.qty} {l.uom}
                  </b>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <Attachments owner={`event:${e.id}`} by={by} readOnly title="Tender documents" />
        {e.auction ? (
          <>
            <h4 className="sx-subhead">Live bidding</h4>
            <p className="sx-note">
              {mine ? `Your best bid: ${mine.amount.toLocaleString()}` : 'You have not bid yet.'}
              {e.auction.showRank === 'RANK' && rank ? ` · You are ranked ${rank} of ${bestBids(e).length}` : ''}
              {e.auction.showRank === 'BEST_PRICE' && best ? ` · Best bid so far: ${best.amount.toLocaleString()}` : ''}
              {` · each new bid at least ${e.auction.minDecrementPct}% lower · late bids extend the close by ${e.auction.extendMinutes} min`}
            </p>
            {e.auction.showRank !== 'NONE' && <BidChart e={e} name={() => 'You'} anonymise={sid} />}
            {auctionLive(e) && (
              <div className="prx-inline">
                <input className="form-control" type="number" min="0" value={amount || ''} onChange={(x) => setAmount(Number(x.target.value))} placeholder="Your total bid (KES)" />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.sourcing.placeBid(e.id, sid, amount, by).ok && setAmount(0)}>
                  <Gavel size={14} /> Place bid
                </button>
              </div>
            )}
          </>
        ) : (
          e.status === 'OPEN' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setRespond(true)}>
              <Send size={14} /> {e.responses.some((r) => r.supplierId === sid) ? 'Revise my response' : 'Submit my response'}
            </button>
          )
        )}
        <h4 className="sx-subhead">Questions and clarifications</h4>
        {msgs.map((m) => (
          <div key={m.id} className={`prx-msg ${m.side === 'SUPPLIER' ? 'supplier' : 'buyer'}`}>
            <b>{m.side === 'SUPPLIER' ? 'You' : 'Buyer'}</b>
            <div>{m.text}</div>
            <small>{m.at.slice(0, 16).replace('T', ' ')}</small>
          </div>
        ))}
        {e.status === 'OPEN' && (
          <div className="prx-inline">
            <input className="form-control" value={q} onChange={(x) => setQ(x.target.value)} placeholder="Ask the buyer a question" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.sourcing.postMessage(e.id, q, { side: 'SUPPLIER', supplierId: sid, public: false, from: by }).ok && setQ('')}>
              <MessageSquare size={14} /> Send
            </button>
          </div>
        )}
      </Modal>
      {respond && <ResponseForm e={e} supplierId={sid} onBehalf={false} by={by} onClose={() => setRespond(false)} />}
    </>
  );
};

const PortalOrders: React.FC<{ sid: string }> = ({ sid }) => {
  const ext = useProcurementExt();
  const { state } = useCommercial();
  const pos = state.purchaseOrders.filter((o) => o.supplierId === sid && o.sentAt);
  const [asnFor, setAsnFor] = useState<string | null>(null);
  const po = pos.find((o) => o.id === asnFor);
  const [asn, setAsn] = useState({ shipDate: TODAY, eta: addDays(TODAY, 2), carrier: '', vehicle: '', qty: {} as Record<string, number>, lot: {} as Record<string, string> });
  return (
    <>
      <DataTable
        rows={pos}
        rowKey={(o) => o.id}
        empty={<Empty title="No orders sent to you yet" />}
        columns={[
          { key: 'n', header: 'Order', render: (o) => <b className="sx-mono">{o.number}</b> },
          { key: 'l', header: 'Items', render: (o) => o.lines.map((l) => `${l.description} (${l.received}/${l.qty})`).join(', ') },
          { key: 'e', header: 'Deliver by', render: (o) => fmtDate(o.expected) },
          { key: 'v', header: 'Value', render: (o) => kes(totals(o.lines, state.products).total), align: 'right' },
          { key: 'a', header: 'Shipping notices', render: (o) => ext.state.asns.filter((a) => a.poId === o.id).map((a) => `${a.number} (${a.status.toLowerCase()})`).join(', ') || '—' },
          {
            key: 'x',
            header: '',
            render: (o) =>
              o.status === 'APPROVED' && !o.closed && o.lines.some((l) => l.received < l.qty) ? (
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => setAsnFor(o.id)}>
                  <Truck size={13} /> Ship
                </button>
              ) : null
          }
        ]}
      />
      {po && (
        <Modal
          size="lg"
          title={`Advance shipping notice — ${po.number}`}
          subtitle="Tell Stores what is on its way; the goods-received note is prefilled from it."
          onClose={() => setAsnFor(null)}
          footer={
            <>
              <span className="sx-grow" />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() =>
                  ext.suppliers.submitAsn({ poId: po.id, supplierId: sid, shipDate: asn.shipDate, eta: asn.eta, carrier: asn.carrier, vehicle: asn.vehicle, lines: po.lines.map((l) => ({ lineId: l.id, qty: asn.qty[l.id] ?? 0, lot: asn.lot[l.id] || undefined })) }).ok && setAsnFor(null)
                }
              >
                <Send size={14} /> Send notice
              </button>
            </>
          }
        >
          <div className="sx-grid">
            <Field label="Ship date">
              <input className="form-control" type="date" value={asn.shipDate} onChange={(e) => setAsn({ ...asn, shipDate: e.target.value })} />
            </Field>
            <Field label="Arrives">
              <input className="form-control" type="date" value={asn.eta} onChange={(e) => setAsn({ ...asn, eta: e.target.value })} />
            </Field>
            <Field label="Carrier">
              <input className="form-control" value={asn.carrier} onChange={(e) => setAsn({ ...asn, carrier: e.target.value })} />
            </Field>
            <Field label="Vehicle / container" required>
              <input className="form-control" value={asn.vehicle} onChange={(e) => setAsn({ ...asn, vehicle: e.target.value })} placeholder="KDA 123X" />
            </Field>
          </div>
          <table className="sx-mini-table sx-alloc">
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: 'right' }}>Outstanding</th>
                <th>Shipping now</th>
                <th>Lot / batch</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td style={{ textAlign: 'right' }}>{l.qty - l.received}</td>
                  <td>
                    <input className="form-control" type="number" min="0" value={asn.qty[l.id] ?? ''} onChange={(e) => setAsn({ ...asn, qty: { ...asn.qty, [l.id]: Number(e.target.value) } })} aria-label={`Ship ${l.description}`} />
                  </td>
                  <td>
                    <input className="form-control" value={asn.lot[l.id] ?? ''} onChange={(e) => setAsn({ ...asn, lot: { ...asn.lot, [l.id]: e.target.value } })} aria-label={`Lot ${l.description}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}
    </>
  );
};

const PortalInvoices: React.FC<{ sid: string }> = ({ sid }) => {
  const ext = useProcurementExt();
  const { state, finance } = useCommercial();
  const invs = ext.state.invoices.filter((i) => i.supplierId === sid);
  const pos = state.purchaseOrders.filter((o) => o.supplierId === sid && o.status === 'APPROVED' && o.lines.some((l) => l.qty > l.billed));
  const [poId, setPoId] = useState('');
  const [ref, setRef] = useState('');
  const [kind, setKind] = useState<'STANDARD' | 'ADVANCE'>('STANDARD');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [ship, setShip] = useState(0);
  const po = pos.find((o) => o.id === poId);
  const lines: InvoiceLine[] = po
    ? po.lines
        .filter((l) => (qty[l.id] ?? 0) > 0)
        .map((l) => ({ id: `il-${l.id}`, poLineId: kind === 'STANDARD' ? l.id : undefined, description: l.description, qty: qty[l.id], price: l.price, account: state.products.find((p) => p.sku === l.sku)?.account ?? '5000', vat: state.products.find((p) => p.sku === l.sku)?.vatable ?? true }))
    : [];
  const charges = ship > 0 ? [{ type: 'SHIPPING' as const, amount: ship }] : [];
  const gross = invoiceGross({ lines, charges });
  const statusText = (i: (typeof invs)[number]) => {
    if (i.status === 'BILLED') {
      const b = finance.state.documents.find((d) => d.id === i.billId);
      if (!b) return 'Accepted';
      if (b.status !== 'POSTED') return 'Accepted — awaiting approval';
      const bal = docBalance(finance.state, b);
      return bal <= 0.01 ? 'Paid' : `Approved — KES ${round2(bal).toLocaleString()} to be paid`;
    }
    return i.status === 'ON_HOLD' ? `On hold: ${i.hold?.reason}` : i.status === 'MATCHED' ? 'Matched — being processed' : i.status === 'REJECTED' ? 'Rejected' : 'Received';
  };
  return (
    <>
      <DataTable
        rows={invs}
        rowKey={(i) => i.id}
        empty={<Empty title="No invoices submitted yet" />}
        columns={[
          { key: 'r', header: 'Your invoice', render: (i) => <b className="sx-mono">{i.supplierRef}</b> },
          { key: 'n', header: 'Our ref', render: (i) => i.number },
          { key: 'd', header: 'Date', render: (i) => fmtDate(i.date) },
          { key: 'v', header: 'Amount', render: (i) => `${i.currency} ${invoiceGross(i).toLocaleString()}`, align: 'right' },
          { key: 's', header: 'Status', render: (i) => <span className={i.status === 'ON_HOLD' ? 'sx-danger-text' : ''}>{statusText(i)}</span> }
        ]}
      />
      <h4 className="sx-subhead">Submit an invoice</h4>
      <div className="prx-inline">
        <select className="form-control" value={poId} onChange={(e) => setPoId(e.target.value)} aria-label="Purchase order">
          <option value="">Against order…</option>
          {pos.map((o) => (
            <option key={o.id} value={o.id}>
              {o.number}
            </option>
          ))}
        </select>
        <select className="form-control" value={kind} onChange={(e) => setKind(e.target.value as 'STANDARD' | 'ADVANCE')} aria-label="Invoice type">
          <option value="STANDARD">Invoice for goods delivered</option>
          <option value="ADVANCE">Advance (deposit) invoice</option>
        </select>
        <input className="form-control" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Your invoice number" />
        <input className="form-control" type="number" min="0" value={ship || ''} onChange={(e) => setShip(Number(e.target.value))} placeholder="Shipping charge" />
      </div>
      {po && (
        <table className="sx-mini-table sx-alloc">
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ textAlign: 'right' }}>Delivered, not invoiced</th>
              <th style={{ textAlign: 'right' }}>Price</th>
              <th>Invoice qty</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td style={{ textAlign: 'right' }}>{l.received - l.billed}</td>
                <td style={{ textAlign: 'right' }}>{l.price.toLocaleString()}</td>
                <td>
                  <input className="form-control" type="number" min="0" value={qty[l.id] ?? ''} onChange={(e) => setQty({ ...qty, [l.id]: Number(e.target.value) })} aria-label={`Invoice ${l.description}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="prx-inline">
        <span>
          Invoice total incl. VAT <b>{kes(gross)}</b>
        </span>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const r = ext.ap.capture({ supplierId: sid, supplierRef: ref, poId: poId || undefined, date: TODAY, currency: 'KES', kind, lines, charges, controlTotal: gross, source: 'SUPPLIER' });
            if (r.ok) {
              setRef('');
              setQty({});
              setShip(0);
            }
          }}
        >
          <Send size={14} /> Submit invoice
        </button>
      </div>
      <p className="sx-muted">Attach the signed PDF below. KRA eTIMS validation runs on our side (simulated in this build).</p>
      <Attachments owner={`portal-invoices:${sid}`} by="Supplier portal" readOnly={ext.readOnly} title="Invoice scans" />
      <h4 className="sx-subhead">Credit and debit notes</h4>
      <ul className="sx-list">
        {ext.state.notes
          .filter((n) => n.supplierId === sid)
          .map((n) => (
            <li key={n.id}>
              <span className="sx-mono">{n.number}</span>
              <span>{n.kind === 'CREDIT' ? 'Credit note' : 'Debit note'}</span>
              <span className="sx-muted">{n.reason}</span>
              <b>{kes(n.amount)}</b>
              <Pill status={TONE[n.status]} label={n.status.toLowerCase()} />
            </li>
          ))}
      </ul>
    </>
  );
};

const PortalCatalogue: React.FC<{ sid: string }> = ({ sid }) => {
  const ext = useProcurementExt();
  const { state } = useCommercial();
  const items = ext.state.catalogue.filter((c) => c.supplierId === sid);
  const [d, setD] = useState({ sku: '', supplierSku: '', description: '', uom: 'each', price: 0, leadDays: 7 });
  return (
    <>
      <DataTable
        rows={items}
        rowKey={(c) => c.id}
        empty={<Empty icon={<Package size={20} />} title="No catalogue items yet" />}
        columns={[
          { key: 's', header: 'Your code', render: (c) => <span className="sx-mono">{c.supplierSku}</span> },
          { key: 'd', header: 'Description', render: (c) => c.description },
          { key: 'p', header: 'Price', render: (c) => `${c.price.toLocaleString()} / ${c.uom}`, align: 'right' },
          { key: 'l', header: 'Lead time', render: (c) => `${c.leadDays} days` },
          { key: 'st', header: 'Status', render: (c) => <Pill status={TONE[c.status]} label={c.status.toLowerCase()} /> }
        ]}
      />
      <h4 className="sx-subhead">Add or update an item</h4>
      <div className="prx-inline">
        <select className="form-control" value={d.sku} onChange={(e) => setD({ ...d, sku: e.target.value, description: state.products.find((p) => p.sku === e.target.value)?.name ?? d.description, uom: state.products.find((p) => p.sku === e.target.value)?.unit ?? d.uom })} aria-label="Our item">
          <option value="">Matches our item…</option>
          {state.products
            .filter((p) => p.kind === 'MATERIAL')
            .map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.name}
              </option>
            ))}
        </select>
        <input className="form-control" value={d.supplierSku} onChange={(e) => setD({ ...d, supplierSku: e.target.value })} placeholder="Your item code" />
        <input className="form-control" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="Description" />
        <input className="form-control" value={d.uom} onChange={(e) => setD({ ...d, uom: e.target.value })} placeholder="Unit" />
        <input className="form-control" type="number" min="0" value={d.price || ''} onChange={(e) => setD({ ...d, price: Number(e.target.value) })} placeholder="Price" />
        <input className="form-control" type="number" min="0" value={d.leadDays} onChange={(e) => setD({ ...d, leadDays: Number(e.target.value) })} aria-label="Lead days" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.suppliers.submitCatalogueItem({ ...d, sku: d.sku || undefined, supplierId: sid }).ok && setD({ ...d, supplierSku: '', description: '', price: 0 })}>
          <Plus size={14} /> Submit for approval
        </button>
      </div>
    </>
  );
};

const PortalProfile: React.FC<{ sid: string }> = ({ sid }) => {
  const ext = useProcurementExt();
  const p = ext.state.suppliers.find((x) => x.partyId === sid)!;
  const [d, setD] = useState<SupplierDraft>({ ...p });
  const [doc, setDoc] = useState({ type: 'TAX_COMPLIANCE' as DocType, number: '', issued: TODAY, expiry: '', issuer: '' });
  const open = p.updateRequests.find((u) => u.status === 'SENT' || u.status === 'REJECTED');
  const pending = p.updateRequests.find((u) => u.status === 'SUBMITTED' || u.status === 'UNDER_REVIEW');
  return (
    <>
      <DefList items={[['Supplier number', p.number], ['Status', p.status.toLowerCase()], ['Bank account on file', `${p.bank.bank} ${maskAccount(p.bank.account)}`], ['Portal login', p.portalLogin?.username ?? '—']]} />
      {pending && <p className="sx-note">Your update sent on {pending.comments.slice(-1)[0]?.at.slice(0, 10)} is {pending.status === 'UNDER_REVIEW' ? 'under review' : 'waiting for review'}.</p>}
      {open?.status === 'REJECTED' && <p className="sx-danger-text">Returned: {open.comments.slice(-1)[0]?.note}</p>}
      <h4 className="sx-subhead">{open ? `Update requested — due ${fmtDate(open.due)}` : 'Update my details'}</h4>
      <SupplierFields d={d} set={setD} required={ext.suppliers.configFor(open?.formCategory ?? p.category).required} showBank />
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => {
          const changes = Object.fromEntries((['name', 'idType', 'idNumber', 'email', 'phone', 'contactPerson', 'country', 'region', 'address', 'paymentMethod', 'paymentTerms', 'bank', 'taxonomy'] as (keyof SupplierCore)[]).map((k) => [k, d[k]])) as Partial<SupplierCore>;
          ext.suppliers.proposeUpdate(p.id, changes);
        }}
      >
        <Send size={14} /> Submit for approval
      </button>
      <h4 className="sx-subhead">Upload a renewed certificate</h4>
      <div className="prx-inline">
        <select className="form-control" value={doc.type} onChange={(e) => setDoc({ ...doc, type: e.target.value as DocType })} aria-label="Document type">
          {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((t) => (
            <option key={t} value={t}>
              {DOC_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <input className="form-control" value={doc.number} onChange={(e) => setDoc({ ...doc, number: e.target.value })} placeholder="Certificate number" />
        <input className="form-control" value={doc.issuer} onChange={(e) => setDoc({ ...doc, issuer: e.target.value })} placeholder="Issuer" />
        <input className="form-control" type="date" value={doc.expiry} onChange={(e) => setDoc({ ...doc, expiry: e.target.value })} aria-label="Expiry" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.suppliers.addDocument(p.id, doc, true).ok && setDoc({ ...doc, number: '', expiry: '' })}>
          Upload
        </button>
      </div>
      <Attachments owner={`supplier-docs:${p.id}`} by={p.contactPerson || p.name} readOnly={ext.readOnly} title="Certificate scans" />
    </>
  );
};

const PortalRegister: React.FC = () => {
  const ext = useProcurementExt();
  const [d, setD] = useState<SupplierDraft>(blankDraft());
  const [user, setUser] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [sso, setSso] = useState(false);
  const cfg = ext.suppliers.configFor(d.category);
  return (
    <>
      <div className="prx-inline">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSso(true)}>
          <LogIn size={14} /> Sign in with Microsoft (SSO)
        </button>
        {sso && <span className="sx-muted">Simulated: single sign-on needs an identity provider, which is not connected in this build. Register below instead.</span>}
      </div>
      <SupplierFields d={d} set={setD} required={cfg.required} showBank />
      <div className="sx-grid">
        <Field label="Portal username (your email)" required span={2}>
          <input className="form-control" value={user} onChange={(e) => setUser(e.target.value)} />
        </Field>
      </div>
      <label className="prx-inline">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /> I accept the supplier terms and conditions, including {d.paymentTerms}-day payment terms and payment by {d.paymentMethod}.
      </label>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.suppliers.register(d, user, accepted).ok && setD(blankDraft())}>
        <UserPlus size={14} /> Register
      </button>
    </>
  );
};
