import React, { useState } from 'react';
import { Plus, Printer, Trash2 } from 'lucide-react';
import { useCommercial } from '../store';
import { fmtDate, kes } from '../../finance/engine';
import type { Address, Contact, CustomerProfile, DocLayout } from '../tradeTypes';
import { Chips, DefList, Drawer, Field, Pill } from '../../ui/kit';
import { Attachments, printDocument } from '../../../platform/Widgets';
import { creditExposure, customerAgeing, deliveryRating, fmtPct, journeyOf, kycGaps, lookupPostal, maxOverdue, npsOf, profileOf } from '../tradeEngine';
import { statementHtml } from './docs';

type Tab = 'CREDIT' | 'ADDRESSES' | 'KYC' | 'DOCS' | 'REG' | '360';
const csv = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
const newAddress = (): Address => ({ id: `a${Math.random().toString(36).slice(2, 7)}`, label: '', address: '', town: '', country: 'Kenya' });

/** Customer master: credit and terms, addresses and contacts, KYC, document format, item codes, regulatory, and a 360° view. */
export const CustomerDrawer: React.FC<{ customerId: string; onClose: () => void }> = ({ customerId, onClose }) => {
  const c = useCommercial();
  const { state, finance, party, actor, saveCustomerProfile, recordKycItem, verifyKyc } = c;
  const cust = party(customerId);
  const [tab, setTab] = useState<Tab>('CREDIT');
  const [p, setP] = useState<CustomerProfile>(() => structuredClone(profileOf(state, customerId)));
  const [kycVal, setKycVal] = useState<Record<string, string>>({});
  const exp = creditExposure(state, finance.state, customerId);
  const ageing = customerAgeing(finance.state, customerId, p.agingBuckets);
  const gaps = kycGaps(state, customerId);
  const set = (patch: Partial<CustomerProfile>) => setP({ ...p, ...patch });
  const setAddr = (kind: 'billTos' | 'shipTos', i: number, patch: Partial<Address>) => set({ [kind]: p[kind].map((a, j) => (j === i ? { ...a, ...patch } : a)) } as Partial<CustomerProfile>);
  const setContact = (i: number, patch: Partial<Contact>) => set({ contacts: p.contacts.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const rating = deliveryRating(state, customerId);
  // Group follow-up: a parent company sees its subsidiaries' interactions too.
  const family = new Set([customerId, ...state.profiles.filter((x) => x.parentCustomerId === customerId).map((x) => x.customerId)]);
  const who = (id: string) => (id === customerId ? '' : ` (${party(id)?.name})`);
  const nps = npsOf(state.surveys.filter((s) => s.customerId === customerId).map((s) => s.nps));
  const timeline = [
    ...state.quotations.filter((q) => family.has(q.customerId)).map((q) => ({ at: q.date, kind: 'Quotation', text: `${q.number} · ${q.status.toLowerCase()}${who(q.customerId)}` })),
    ...state.orders.filter((o) => family.has(o.customerId)).map((o) => ({ at: o.date, kind: 'Order', text: `${o.number} · ${o.customerRef}${who(o.customerId)}` })),
    ...state.deliveries.filter((d) => state.orders.find((o) => o.id === d.orderId)?.customerId === customerId).map((d) => ({ at: d.date, kind: 'Delivery', text: `${d.number}${d.rating ? ` · rated ${d.rating}/5` : ''}` })),
    ...finance.state.documents.filter((d) => d.kind === 'INVOICE' && d.partyId === customerId).map((d) => ({ at: d.date, kind: 'Invoice', text: `${d.number} · ${d.status.toLowerCase()}` })),
    ...state.feedback.filter((f) => family.has(f.customerId)).map((f) => ({ at: f.at.slice(0, 10), kind: 'Feedback', text: `${f.number} · ${f.subject}${who(f.customerId)}` })),
    ...state.activities
      .filter((a) => family.has(a.customerId ?? '') || family.has(state.opportunities.find((o) => o.id === a.opportunityId)?.customerId ?? ''))
      .map((a) => ({ at: a.due, kind: a.done ? 'Activity (done)' : 'Activity', text: `${a.subject}${a.visitScore ? ` · visit ${a.visitScore}/5` : ''}` })),
    ...state.portalEvents.filter((e) => family.has(e.customerId)).slice(0, 10).map((e) => ({ at: e.at.slice(0, 10), kind: 'Portal', text: `${e.kind.toLowerCase().replace('_', ' ')}${e.ref ? ` · ${e.ref}` : ''}` })),
    ...state.contracts.filter((x) => x.customerId === customerId).map((x) => ({ at: x.start, kind: 'Contract', text: `${x.number} · ${x.status.toLowerCase()}` })),
    ...state.rmas.filter((x) => x.customerId === customerId).map((x) => ({ at: x.history[0]?.at.slice(0, 10) ?? '', kind: 'Return', text: x.number }))
  ].sort((a, b) => b.at.localeCompare(a.at));
  const addressBlock = (kind: 'billTos' | 'shipTos', title: string) => (
    <>
      <h4 className="sx-subhead">{title}</h4>
      {p[kind].map((a, i) => (
        <div className="tr-row" key={a.id}>
          <input className="form-control" aria-label="Address name" placeholder="Name" value={a.label} onChange={(e) => setAddr(kind, i, { label: e.target.value })} />
          <input className="form-control grow" aria-label="Street" placeholder="Street / building" value={a.address} onChange={(e) => setAddr(kind, i, { address: e.target.value })} />
          <input
            className="form-control"
            aria-label="Postal code"
            placeholder="Postal code"
            value={a.postalCode ?? ''}
            onChange={(e) => {
              const pc = lookupPostal(e.target.value);
              setAddr(kind, i, pc ? { postalCode: e.target.value, town: pc.town, county: pc.county, country: pc.country, zone: pc.zone } : { postalCode: e.target.value });
            }}
          />
          <input className="form-control" aria-label="Town" placeholder="Town" value={a.town} onChange={(e) => setAddr(kind, i, { town: e.target.value })} />
          <input className="form-control" aria-label="Country" placeholder="Country" value={a.country} onChange={(e) => setAddr(kind, i, { country: e.target.value })} />
          {kind === 'shipTos' && (
            <>
              <input className="form-control grow" aria-label="Delivery instructions" placeholder="Delivery instructions" value={a.instructions ?? ''} onChange={(e) => setAddr(kind, i, { instructions: e.target.value })} />
              <select className="form-control" aria-label="Ships from" value={a.defaultWarehouse ?? ''} onChange={(e) => setAddr(kind, i, { defaultWarehouse: e.target.value || undefined })}>
                <option value="">Ships from…</option>
                <option value="WH-NBO">WH-NBO Nairobi</option>
                <option value="WH-MSA">WH-MSA Mombasa</option>
              </select>
              <select className="form-control" aria-label="Terms" value={a.termId ?? ''} onChange={(e) => setAddr(kind, i, { termId: e.target.value || undefined })}>
                <option value="">Customer terms</option>
                {state.paymentTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </>
          )}
          <button type="button" className="sx-icon-btn" aria-label="Remove address" onClick={() => set({ [kind]: p[kind].filter((_, j) => j !== i) } as Partial<CustomerProfile>)}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ [kind]: [...p[kind], newAddress()] } as Partial<CustomerProfile>)}>
        <Plus size={13} /> Add {kind === 'billTos' ? 'bill-to' : 'ship-to'}
      </button>
    </>
  );
  return (
    <Drawer
      wide
      title={cust?.name ?? customerId}
      subtitle={`${cust?.category ?? ''} · PIN ${cust?.pin ?? '—'} · ${p.rating}`}
      badge={gaps.length ? <span className="tr-badge bad">KYC incomplete</span> : <span className="tr-badge good">KYC verified</span>}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => printDocument(`Statement — ${cust?.name}`, statementHtml(state, finance.state, customerId))}>
            <Printer size={14} /> Print statement
          </button>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => saveCustomerProfile(p)}>
            Save customer
          </button>
        </>
      }
    >
      <Chips
        value={tab}
        onChange={setTab}
        options={[
          { value: 'CREDIT', label: 'Credit & terms' },
          { value: 'ADDRESSES', label: 'Addresses & contacts' },
          { value: 'KYC', label: 'KYC' },
          { value: 'DOCS', label: 'Documents & codes' },
          { value: 'REG', label: 'Regulatory' },
          { value: '360', label: '360° view' }
        ]}
      />
      {tab === 'CREDIT' && (
        <>
          <div className="sx-amount-hero">
            <div>
              <span>Credit exposure</span>
              <strong>{kes(exp.total)}</strong>
            </div>
            <div>
              <span>Limit</span>
              <b>{exp.limit ? kes(exp.limit) : 'None'}</b>
            </div>
            <div>
              <span>Headroom</span>
              <b className={exp.headroom < 0 ? 'sx-danger-text' : ''}>{Number.isFinite(exp.headroom) ? kes(exp.headroom) : '—'}</b>
            </div>
          </div>
          <DefList
            items={[
              ['Receivables (Finance)', kes(exp.ar)],
              ['Approved orders not invoiced', kes(exp.orders)],
              ['Open credit notes', kes(-exp.credits)],
              ['Oldest overdue', `${maxOverdue(finance.state, customerId)} days`]
            ]}
          />
          <table className="sx-mini-table">
            <thead>
              <tr>
                {ageing.map((a) => (
                  <th key={a.label}>{a.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {ageing.map((a) => (
                  <td key={a.label}>{kes(a.amount)}</td>
                ))}
              </tr>
            </tbody>
          </table>
          <div className="sx-grid">
            <Field label="Payment terms">
              <select className="form-control" value={p.termId ?? ''} onChange={(e) => set({ termId: e.target.value || undefined })}>
                <option value="">{cust?.terms ?? 30} days (Finance)</option>
                {state.paymentTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Credit rating">
              <select className="form-control" value={p.rating} onChange={(e) => set({ rating: e.target.value })}>
                {['A — Excellent', 'B — Standard', 'C — Watch', 'D — Cash only'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Ageing buckets (days)">
              <input className="form-control" value={p.agingBuckets.join(', ')} onChange={(e) => set({ agingBuckets: csv(e.target.value).map(Number) })} />
            </Field>
            <Field label="Hold when overdue more than (days)">
              <input className="form-control" type="number" value={p.maxOverdueDays} onChange={(e) => set({ maxOverdueDays: Number(e.target.value) })} />
            </Field>
            <Field label="Price group">
              <input className="form-control" value={p.priceGroup ?? ''} onChange={(e) => set({ priceGroup: e.target.value || undefined })} />
            </Field>
            <Field label="Customer class">
              <input className="form-control" value={p.customerClass ?? ''} onChange={(e) => set({ customerClass: e.target.value || undefined })} />
            </Field>
            <Field label="Parent company">
              <select className="form-control" value={p.parentCustomerId ?? ''} onChange={(e) => set({ parentCustomerId: e.target.value || undefined })}>
                <option value="">None</option>
                {finance.state.parties
                  .filter((x) => x.kind === 'CUSTOMER' && x.id !== customerId)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Order priority">
              <select className="form-control" value={p.priority} onChange={(e) => set({ priority: Number(e.target.value) as 1 | 2 | 3 })}>
                <option value={1}>High</option>
                <option value={2}>Normal</option>
                <option value={3}>Low</option>
              </select>
            </Field>
            <Field label="Minimum order value">
              <input className="form-control" type="number" value={p.minOrderValue} onChange={(e) => set({ minOrderValue: Number(e.target.value) })} />
            </Field>
            <Field label="Charge below minimum">
              <input className="form-control" type="number" value={p.minOrderCharge} onChange={(e) => set({ minOrderCharge: Number(e.target.value) })} />
            </Field>
            <Field label="Manager cancels above (KES)">
              <input className="form-control" type="number" value={p.cancelLimit} onChange={(e) => set({ cancelLimit: Number(e.target.value) })} />
            </Field>
            <Field label="Restocking fee %">
              <input className="form-control" type="number" value={p.restockFeePct} onChange={(e) => set({ restockFeePct: Number(e.target.value) })} />
            </Field>
            <Field label="Duplicate PO numbers">
              <select className="form-control" value={p.duplicatePo} onChange={(e) => set({ duplicatePo: e.target.value as 'WARN' | 'BLOCK' })}>
                <option value="WARN">Warn</option>
                <option value="BLOCK">Block</option>
              </select>
            </Field>
          </div>
          <div className="tr-row">
            <label className="sx-check">
              <input type="checkbox" checked={p.freightOnBackorders} onChange={(e) => set({ freightOnBackorders: e.target.checked })} /> Charge freight on back-order shipments
            </label>
            <label className="sx-check">
              <input type="checkbox" checked={p.financeChargeExempt} onChange={(e) => set({ financeChargeExempt: e.target.checked })} /> Exempt from finance charges
            </label>
            <label className="sx-check">
              <input type="checkbox" checked={p.repriceAtInvoice} onChange={(e) => set({ repriceAtInvoice: e.target.checked })} /> Re-price at invoicing
            </label>
          </div>
        </>
      )}
      {tab === 'ADDRESSES' && (
        <>
          {addressBlock('billTos', 'Bill-to addresses')}
          {addressBlock('shipTos', 'Ship-to addresses')}
          <h4 className="sx-subhead">Contacts</h4>
          {p.contacts.map((ct, i) => (
            <div className="tr-row" key={ct.id}>
              <input className="form-control" aria-label="Contact name" placeholder="Name" value={ct.name} onChange={(e) => setContact(i, { name: e.target.value })} />
              <input className="form-control" aria-label="Role" placeholder="Role" value={ct.role} onChange={(e) => setContact(i, { role: e.target.value })} />
              <input className="form-control" aria-label="Email" placeholder="Email" value={ct.email} onChange={(e) => setContact(i, { email: e.target.value })} />
              <input className="form-control" aria-label="Phone" placeholder="Phone" value={ct.phone} onChange={(e) => setContact(i, { phone: e.target.value })} />
              <select className="form-control" aria-label="Contact for" value={ct.scope} onChange={(e) => setContact(i, { scope: e.target.value })}>
                <option value="main">Main account</option>
                {[...p.billTos, ...p.shipTos].map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label || a.id}
                  </option>
                ))}
              </select>
              <button type="button" className="sx-icon-btn" aria-label="Remove contact" onClick={() => set({ contacts: p.contacts.filter((_, j) => j !== i) })}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ contacts: [...p.contacts, { id: `ct${Math.random().toString(36).slice(2, 7)}`, name: '', role: '', email: '', phone: '', scope: 'main' }] })}>
            <Plus size={13} /> Add contact
          </button>
        </>
      )}
      {tab === 'KYC' && (
        <>
          {gaps.length > 0 && <p className="tr-badge bad">Missing or unverified: {gaps.join(', ')} — orders and bids are blocked until verified</p>}
          <table className="sx-mini-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Details</th>
                <th>Status</th>
                <th>Expires</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.kycTemplates
                .filter((t) => t.active)
                .map((t) => {
                  const r = profileOf(state, customerId).kyc.find((x) => x.itemId === t.id);
                  return (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>{r ? `${r.value} (${r.by})` : '—'}</td>
                      <td>{r ? <Pill status={r.status === 'VERIFIED' ? 'POSTED' : r.status === 'REJECTED' ? 'REJECTED' : 'SUBMITTED'} label={r.status.toLowerCase()} /> : 'Missing'}</td>
                      <td>{r?.expiry ? fmtDate(r.expiry) : '—'}</td>
                      <td>
                        {r?.status === 'SUBMITTED' ? (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => verifyKyc(customerId, t.id, true)}>
                            Verify
                          </button>
                        ) : (
                          <span className="tr-row">
                            <input className="form-control" aria-label={`${t.name} details`} value={kycVal[t.id] ?? ''} onChange={(e) => setKycVal({ ...kycVal, [t.id]: e.target.value })} />
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => recordKycItem(customerId, t.id, kycVal[t.id] ?? '', `${t.docType}.pdf`)}>
                              Capture
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          <Attachments owner={`customer:${customerId}`} by={actor.name} title="KYC and customer documents" />
        </>
      )}
      {tab === 'DOCS' && (
        <>
          <div className="sx-grid">
            <Field label="Document layout">
              <select className="form-control" value={p.docFormat.layout} onChange={(e) => set({ docFormat: { ...p.docFormat, layout: e.target.value as DocLayout } })}>
                <option value="STANDARD">Standard</option>
                <option value="DETAILED">Detailed</option>
                <option value="EXPORT">Export</option>
              </select>
            </Field>
            <Field label="Language">
              <select className="form-control" value={p.docFormat.language} onChange={(e) => set({ docFormat: { ...p.docFormat, language: e.target.value as 'EN' | 'SW' } })}>
                <option value="EN">English</option>
                <option value="SW">Kiswahili</option>
              </select>
            </Field>
            <Field label="Footer text" span={2}>
              <input className="form-control" value={p.docFormat.footer} onChange={(e) => set({ docFormat: { ...p.docFormat, footer: e.target.value } })} />
            </Field>
          </div>
          <div className="tr-row">
            <label className="sx-check">
              <input type="checkbox" checked={p.docFormat.showCustomerCodes} onChange={(e) => set({ docFormat: { ...p.docFormat, showCustomerCodes: e.target.checked } })} /> Print the customer's own item codes
            </label>
            <label className="sx-check">
              <input type="checkbox" checked={p.docFormat.showInstructions} onChange={(e) => set({ docFormat: { ...p.docFormat, showInstructions: e.target.checked } })} /> Print delivery instructions
            </label>
          </div>
          <h4 className="sx-subhead">Customer item codes</h4>
          {p.customerItems.map((ci, i) => (
            <div className="tr-row" key={i}>
              <input className="form-control" aria-label="Customer code" placeholder="Their code" value={ci.customerCode} onChange={(e) => set({ customerItems: p.customerItems.map((x, j) => (j === i ? { ...x, customerCode: e.target.value } : x)) })} />
              <select className="form-control grow" aria-label="Our SKU" value={ci.sku} onChange={(e) => set({ customerItems: p.customerItems.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)) })}>
                <option value="">Our product…</option>
                {state.products
                  .filter((x) => x.kind !== 'MATERIAL')
                  .map((x) => (
                    <option key={x.sku} value={x.sku}>
                      {x.sku} · {x.name}
                    </option>
                  ))}
              </select>
              <button type="button" className="sx-icon-btn" aria-label="Remove code" onClick={() => set({ customerItems: p.customerItems.filter((_, j) => j !== i) })}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ customerItems: [...p.customerItems, { customerCode: '', sku: '' }] })}>
            <Plus size={13} /> Add item code
          </button>
        </>
      )}
      {tab === 'REG' && (
        <div className="sx-grid">
          <Field label="Licence number">
            <input className="form-control" value={p.regulatory.licenceNo} onChange={(e) => set({ regulatory: { ...p.regulatory, licenceNo: e.target.value } })} />
          </Field>
          <Field label="Licence type">
            <input className="form-control" value={p.regulatory.licenceType} onChange={(e) => set({ regulatory: { ...p.regulatory, licenceType: e.target.value } })} placeholder="e.g. Tea Board dealer licence" />
          </Field>
          <Field label="Licence expiry">
            <input className="form-control" type="date" value={p.regulatory.expiry} onChange={(e) => set({ regulatory: { ...p.regulatory, expiry: e.target.value } })} />
          </Field>
          <Field label="Restricted destinations" hint="Comma separated countries orders cannot ship to">
            <input className="form-control" value={p.regulatory.restrictedCountries.join(', ')} onChange={(e) => set({ regulatory: { ...p.regulatory, restrictedCountries: csv(e.target.value) } })} />
          </Field>
          <Field label="Certificates held" hint="Comma separated, e.g. MRL, Rainforest Alliance" span={2}>
            <input className="form-control" value={p.regulatory.certificates.join(', ')} onChange={(e) => set({ regulatory: { ...p.regulatory, certificates: csv(e.target.value) } })} />
          </Field>
        </div>
      )}
      {tab === '360' && (
        <>
          <div className="tr-journey">
            {journeyOf(state, finance.state, customerId).map((s) => (
              <span key={s.stage} className={s.date ? 'done' : ''}>
                {s.stage}
                <small>{s.date ? fmtDate(s.date) : '—'}</small>
              </span>
            ))}
          </div>
          <DefList
            items={[
              ['On time / in full', `${fmtPct(rating.onTime)} / ${fmtPct(rating.inFull)}`],
              ['Delivery rating', rating.rating ? `${rating.rating}/5` : '—'],
              ['NPS', nps ?? '—'],
              ['Open complaints', String(state.feedback.filter((f) => f.customerId === customerId && f.type === 'COMPLAINT' && f.status !== 'CLOSED').length)]
            ]}
          />
          <ul className="sx-list">
            {timeline.slice(0, 40).map((t, i) => (
              <li key={i}>
                <span className="sx-muted">{fmtDate(t.at)}</span>
                <b>{t.kind}</b>
                <span>{t.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Drawer>
  );
};
