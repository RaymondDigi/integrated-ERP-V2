import React, { useState } from 'react';
import { Copy, Factory, FileText, Lock, MessageSquarePlus, PauseCircle, PlayCircle, Plus, Printer, Save, Smartphone, Trash2, Truck, Undo2, PenLine } from 'lucide-react';
import { useCommercial } from '../store';
import { useOperations } from '../../operations/store';
import { BATCH_LABEL } from '../../operations/engine';
import { addDays, fmtDate, kes, round2, TODAY } from '../../finance/engine';
import { Attachments, printDocument } from '../../../platform/Widgets';
import { DefList, Field, Modal, Pill } from '../../ui/kit';
import { LinesEditor } from '../parts';
import { PACK_LINE, profileOf } from '../tradeEngine';
import { ackHtml, invoiceHtml } from './docs';
import type { Line, Quotation, SalesOrder } from '../types';
import type { ChargeKind, NoteEntry } from '../tradeTypes';

const PRIORITY = ['', 'High', 'Normal', 'Low'];
export const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DDP'];
export const LEAD_SOURCES = ['Existing customer', 'Referral', 'Trade fair', 'Website', 'Inbound enquiry', 'Field visit', 'Tender notice', 'Customer portal', 'Auction'];
export const ORDER_CLASSES = ['Local', 'Export', 'Auction', 'Blend to order', 'Sample', 'Replacement'];

/** Any number of dated notes; internal ones never print. */
export const NotesPanel: React.FC<{ kind: 'quote' | 'order' | 'blend'; id: string; notes: NoteEntry[]; readOnly?: boolean }> = ({ kind, id, notes, readOnly }) => {
  const { addNote } = useCommercial();
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(true);
  return (
    <div className="tr-section">
      <h4 className="sx-subhead">Notes {notes.length > 0 && <span className="sx-count">{notes.length}</span>}</h4>
      {notes.length > 0 && (
        <ul className="tr-notes">
          {[...notes].reverse().map((n) => (
            <li key={n.id}>
              {n.text}
              <small>
                {n.by} · {n.at.slice(0, 16).replace('T', ' ')} · {n.internal ? 'Internal' : 'Prints for the customer'}
              </small>
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="tr-row">
          <input className="form-control grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note…" aria-label="New note" />
          <label className="sx-check">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal
          </label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => addNote(kind, id, text, internal).ok && setText('')}>
            <MessageSquarePlus size={14} /> Add note
          </button>
        </div>
      )}
    </div>
  );
};

/** Extra actions and details on a quotation: copy, cancel with a reason code, classification, notes, files. */
export const QuoteExtras: React.FC<{ q: Quotation; onOpen: (id: string) => void }> = ({ q, onOpen }) => {
  const { state, actor, copyQuotation, cancelQuotation } = useCommercial();
  const [cancelling, setCancelling] = useState(false);
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const codes = state.reasonCodes.filter((r) => r.kind === 'QUOTE_CANCEL' && r.active);
  return (
    <>
      <DefList
        items={[
          ['Lead source', q.leadSource ?? '—'],
          ['Order class', q.orderClass ?? '—'],
          ['Campaign source code', q.sourceCode ?? '—'],
          ['Copied from', q.copiedFrom ?? '—']
        ]}
      />
      <div className="tr-row">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
          const r = copyQuotation(q.id);
          if (r.ok && r.id) onOpen(r.id);
        }}>
          <Copy size={14} /> Copy as new quotation
        </button>
        {(q.status === 'DRAFT' || q.status === 'SENT') && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCancelling(!cancelling)}>
            Cancel quotation…
          </button>
        )}
      </div>
      {cancelling && (
        <div className="sx-callout warn">
          <div>
            <b>Cancel with a reason</b>
            <div className="tr-row">
              <select className="form-control" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Cancellation reason">
                <option value="">Choose a reason…</option>
                {codes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
              <button type="button" className="btn btn-danger btn-sm" onClick={() => cancelQuotation(q.id, code, note).ok && setCancelling(false)}>
                Cancel quotation
              </button>
            </div>
          </div>
        </div>
      )}
      <NotesPanel kind="quote" id={q.id} notes={q.noteLog ?? []} />
      <Attachments owner={`trading:${q.number}`} by={actor.name} title="Documents (customer RFQ, specs)" />
    </>
  );
};

/** Everything an order needs beyond the basic workflow: holds, charges, releases, production, direct ship, payment, notes. */
export const OrderExtras: React.FC<{ o: SalesOrder; onOpenOrder: (id: string) => void; onAmend: () => void }> = ({ o, onOpenOrder, onAmend }) => {
  const c = useCommercial();
  const { state, actor, party, finance } = c;
  const ops = useOperations();
  const prof = profileOf(state, o.customerId);
  const ship = prof.shipTos.find((x) => x.id === o.shipToId);
  const [holdCode, setHoldCode] = useState('');
  const [holdNote, setHoldNote] = useState('');
  const [charge, setCharge] = useState({ kind: 'FREIGHT' as ChargeKind, description: '', amount: 0 });
  const [tplName, setTplName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [pod, setPod] = useState('');
  const [pay, setPay] = useState({ method: 'M-PESA' as 'M-PESA' | 'CARD', phone: '2547', card: '' });
  const [relLine, setRelLine] = useState<string | null>(null);
  const draft = o.status === 'DRAFT' || o.status === 'REJECTED';
  const open = o.status === 'APPROVED' && !o.closed;
  const batches = ops.state.batches.filter((b) => b.forOrder === o.id);
  const dsPOs = state.purchaseOrders.filter((p) => p.salesOrderId === o.id);
  const reqs = state.changeRequests.filter((r) => r.orderId === o.id && r.status === 'OPEN');
  const paid = state.payments.filter((p) => p.orderId === o.id && p.status === 'SUCCESS');
  const value = c.orderValue(o);
  const paidAmt = round2(paid.reduce((x, p) => x + p.amount, 0));
  const planFor = (l: SalesOrder['lines'][number]) => {
    const blend = l.configId ? state.blends.find((b) => b.id === l.configId) : undefined;
    const recipe = blend ? ops.state.recipes.find((r) => r.id === PACK_LINE[blend.attributes.packSize]?.recipe) : ops.state.recipes.find((r) => r.product === l.sku);
    return recipe;
  };
  return (
    <>
      <DefList
        items={[
          ['Channel', `${o.channel ?? 'DIRECT'}${o.segment ? ` · ${o.segment}` : ''}${o.paymentMode === 'CASH' ? ' · pay before dispatch' : ''}`],
          ['Ship to', o.oneTimeShipTo ? `${o.oneTimeShipTo} (one-time)` : ship ? `${ship.label}, ${ship.town}` : o.deliveryAddress || '—'],
          ['Contact', o.contactName ?? ship?.contact ?? '—'],
          ['Incoterm', o.incoterm ? `${o.incoterm} ${o.namedPlace ?? ''}` : '—'],
          ['Payment terms', state.paymentTerms.find((t) => t.id === (o.termId || prof.termId))?.label ?? `${party(o.customerId)?.terms ?? 30} days`],
          ['Lead source / class', `${o.leadSource ?? '—'} · ${o.orderClass ?? '—'}`],
          ['Campaign source code', o.sourceCode ?? '—'],
          ['Revision', o.revision ? `Rev ${o.revision}` : 'Original'],
          ['Copied from', o.copiedFrom ?? '—']
        ]}
      />
      {ship?.instructions && (
        <p className="sx-note">
          <Truck size={14} /> {ship.instructions}
        </p>
      )}

      <div className="tr-row">
        <span className="sx-muted">Priority</span>
        <select className="form-control" style={{ maxWidth: 140 }} value={o.priority ?? 2} onChange={(e) => c.setPriority(o.id, Number(e.target.value) as 1 | 2 | 3)} aria-label="Order priority" disabled={o.status === 'VOID' || o.closed}>
          {[1, 2, 3].map((p) => (
            <option key={p} value={p}>
              {PRIORITY[p]}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
          const r = c.copyOrder(o.id);
          if (r.ok && r.id) onOpenOrder(r.id);
        }}>
          <Copy size={14} /> Copy as new order
        </button>
        {open && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onAmend}>
            <PenLine size={14} /> Amend order
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => printDocument(`Acknowledgement ${o.number}`, ackHtml(state, o, party(o.customerId)))}>
          <Printer size={14} /> Acknowledgement (customer format)
        </button>
        {o.lines.some((l) => l.delivered > 0) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => c.setTrading('returns', `new:${o.id}`)}>
            <Undo2 size={14} /> Return / RMA
          </button>
        )}
      </div>

      {/* Hold and release */}
      <h4 className="sx-subhead">Hold</h4>
      {o.hold ? (
        <div className="sx-callout warn">
          <PauseCircle size={16} />
          <div>
            <b>On hold — {state.reasonCodes.find((r) => r.id === o.hold?.reasonCodeId)?.label}</b>
            <span>
              {o.hold.note} · {o.hold.by} · {o.hold.at.slice(0, 10)}
            </span>
            <div className="tr-row">
              <input className="form-control" value={holdNote} onChange={(e) => setHoldNote(e.target.value)} placeholder="Release note" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => c.releaseOrder(o.id, holdNote).ok && setHoldNote('')}>
                <PlayCircle size={14} /> Release
              </button>
            </div>
          </div>
        </div>
      ) : o.status !== 'VOID' && !o.closed ? (
        <div className="tr-row">
          <select className="form-control" value={holdCode} onChange={(e) => setHoldCode(e.target.value)} aria-label="Hold reason">
            <option value="">Hold reason…</option>
            {state.reasonCodes
              .filter((r) => r.kind === 'ORDER_HOLD' && r.active)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
          </select>
          <input className="form-control grow" value={holdNote} onChange={(e) => setHoldNote(e.target.value)} placeholder="Note" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => c.holdOrder(o.id, holdCode, holdNote).ok && (setHoldCode(''), setHoldNote(''))} title={actor.role === 'OFFICER' ? 'Holds are placed by the Commercial Manager' : undefined}>
            <PauseCircle size={14} /> Put on hold
          </button>
        </div>
      ) : (
        <p className="sx-muted">—</p>
      )}

      {/* Charges */}
      <h4 className="sx-subhead">Charges</h4>
      {(o.charges ?? []).length > 0 ? (
        <table className="sx-mini-table">
          <tbody>
            {(o.charges ?? []).map((ch) => (
              <tr key={ch.id}>
                <td>
                  {ch.description} {ch.postShipment && <span className="tr-badge">post-shipment</span>} {ch.auto && <span className="tr-badge">calculated</span>} {ch.invoiced && <span className="tr-badge good">invoiced</span>}
                </td>
                <td style={{ textAlign: 'right' }}>{kes(ch.amount)}</td>
                <td style={{ width: 30 }}>
                  {!ch.invoiced && (draft || ch.postShipment) && (
                    <button type="button" className="sx-icon-btn" onClick={() => c.removeCharge(o.id, ch.id)} aria-label="Remove charge">
                      <Trash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sx-muted">No shipping, handling or other charges.</p>
      )}
      {(draft || o.status === 'APPROVED') && (
        <div className="tr-row">
          {draft && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => c.calcCharges(o.id)}>
              <Truck size={14} /> Calculate freight & minimum charge
            </button>
          )}
          <select className="form-control" value={charge.kind} onChange={(e) => setCharge({ ...charge, kind: e.target.value as ChargeKind })} aria-label="Charge type">
            {(['FREIGHT', 'SHIPPING', 'HANDLING', 'MIN_ORDER', 'OTHER'] as ChargeKind[]).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input className="form-control grow" value={charge.description} onChange={(e) => setCharge({ ...charge, description: e.target.value })} placeholder={draft ? 'Description' : 'Actual freight after shipping…'} aria-label="Charge description" />
          <input className="form-control" type="number" min="0" value={charge.amount || ''} onChange={(e) => setCharge({ ...charge, amount: Number(e.target.value) })} placeholder="Amount" aria-label="Charge amount" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => c.addCharge(o.id, { ...charge, vatable: true, postShipment: !draft }).ok && setCharge({ ...charge, description: '', amount: 0 })}>
            <Plus size={14} /> {draft ? 'Add charge' : 'Add post-shipment charge'}
          </button>
        </div>
      )}
      {!prof.freightOnBackorders && <small className="sx-muted">This customer is billed freight only with the final delivery of a back-ordered order.</small>}

      {/* Releases */}
      <h4 className="sx-subhead">Line releases and ship dates</h4>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Line</th>
            <th>Requested</th>
            <th>Releases</th>
            <th>Shipped</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {o.lines.map((l) => {
            const shipped = state.deliveries.filter((d) => d.orderId === o.id && d.lines.some((x) => x.lineId === l.id)).map((d) => d.date);
            return (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td>{l.requestedDate ? fmtDate(l.requestedDate) : fmtDate(o.requiredBy)}</td>
                <td>
                  {(l.releases ?? []).map((r) => (
                    <div key={r.id}>
                      <span className="sx-mono">{r.number.split('/').pop()}</span> {r.qty} on {fmtDate(r.requestedDate)} {r.shippedDate ? <span className="tr-badge good">shipped {fmtDate(r.shippedDate)}</span> : <span className="tr-badge">open</span>}
                    </div>
                  ))}
                  {!(l.releases ?? []).length && <span className="sx-muted">Single shipment</span>}
                </td>
                <td>{shipped.length ? shipped.map(fmtDate).join(', ') : '—'}</td>
                <td>{o.status !== 'VOID' && !o.closed && l.delivered < l.qty && <button type="button" className="sx-link" onClick={() => setRelLine(l.id)}>Schedule</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {relLine && <ReleaseModal o={o} lineId={relLine} onClose={() => setRelLine(null)} />}

      {/* Production */}
      {o.status === 'APPROVED' && o.lines.some((l) => planFor(l)) && (
        <>
          <h4 className="sx-subhead">Production (work orders)</h4>
          {batches.length > 0 && (
            <ul className="sx-list">
              {batches.map((b) => (
                <li key={b.id}>
                  <span className="sx-mono">{b.number}</span>
                  <span>{fmtDate(b.date)}</span>
                  <span className="sx-muted">
                    {b.plannedQty} on {b.line}
                  </span>
                  <Pill status={b.status === 'COMPLETED' ? 'POSTED' : b.status === 'PLANNED' ? 'DRAFT' : 'SUBMITTED'} label={BATCH_LABEL[b.status]} />
                </li>
              ))}
            </ul>
          )}
          <div className="tr-row">
            {o.lines
              .filter((l) => planFor(l) && l.delivered < l.qty)
              .map((l) => {
                const r = planFor(l)!;
                const p = state.products.find((x) => x.sku === l.sku);
                const short = l.configId ? l.qty - l.delivered : Math.max(0, l.qty - l.delivered - Math.max(0, p?.stock ?? 0));
                return (
                  <button key={l.id} type="button" className="btn btn-secondary btn-sm" disabled={!short} title={!short ? 'Enough in stock' : undefined} onClick={() => ops.planBatch(r.id, short, addDays(TODAY, 1), o.id)}>
                    <Factory size={14} /> Plan {short || 0} × {l.description.slice(0, 28)}
                  </button>
                );
              })}
          </div>
        </>
      )}

      {/* Direct ship */}
      {o.lines.some((l) => l.directShip) && (
        <>
          <h4 className="sx-subhead">Direct ship from supplier</h4>
          {!dsPOs.length && o.status === 'APPROVED' && (
            <div className="tr-row">
              <select className="form-control" value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Supplier">
                <option value="">Supplier (if the product has none)…</option>
                {finance.state.parties
                  .filter((p) => p.kind === 'SUPPLIER')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => c.createDirectShipPOs(o.id, supplier)}>
                Raise direct-ship purchase orders
              </button>
            </div>
          )}
          {dsPOs.map((p) => (
            <div key={p.id} className="tr-row">
              <span className="sx-mono">{p.number}</span>
              <span className="sx-muted">{party(p.supplierId)?.name}</span>
              <Pill status={p.status} />
              {p.lines.every((l) => l.received >= l.qty) ? (
                <span className="tr-badge good">Delivered to customer</span>
              ) : (
                <>
                  <input className="form-control" value={pod} onChange={(e) => setPod(e.target.value)} placeholder="Customer POD number" aria-label="Proof of delivery" />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => c.confirmDirectShip(p.id, pod)}>
                    Supplier delivered
                  </button>
                </>
              )}
            </div>
          ))}
        </>
      )}

      {/* Payment (pay-before-dispatch and cash orders) */}
      {(o.paymentMode === 'CASH' || paid.length > 0) && (
        <>
          <h4 className="sx-subhead">Payment</h4>
          <div className="tr-sim">
            <Smartphone size={14} /> Simulated payment gateway — M-PESA STK push and card authorisation are emulated; the receipt is real in Finance.
          </div>
          {paid.map((p) => (
            <div key={p.id} className="tr-row">
              <span className="tr-badge good">{p.method}</span> {kes(p.amount)} · {p.ref} · receipt {p.receiptNumber}
            </div>
          ))}
          {paidAmt + 0.005 < value && o.status !== 'VOID' && (
            <div className="tr-row">
              <select className="form-control" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as 'M-PESA' | 'CARD' })} aria-label="Payment method">
                <option>M-PESA</option>
                <option>CARD</option>
              </select>
              {pay.method === 'M-PESA' ? (
                <input className="form-control" value={pay.phone} onChange={(e) => setPay({ ...pay, phone: e.target.value })} placeholder="2547XXXXXXXX" aria-label="M-PESA number" />
              ) : (
                <input className="form-control" value={pay.card} onChange={(e) => setPay({ ...pay, card: e.target.value })} placeholder="Card last 4" aria-label="Card last four digits" />
              )}
              <button type="button" className="btn btn-primary btn-sm" onClick={() => c.payOrder(o.id, pay.method, pay.phone, pay.card)}>
                Take {kes(round2(value - paidAmt))}
              </button>
            </div>
          )}
        </>
      )}

      {/* Portal change requests */}
      {reqs.length > 0 && (
        <>
          <h4 className="sx-subhead">Customer requests (portal)</h4>
          {reqs.map((r) => (
            <div key={r.id} className="sx-callout info">
              <div>
                <b>{r.kind === 'CANCEL' ? 'Cancel this order' : 'Change request'}</b>
                <span>{r.note}</span>
                <div className="tr-row">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => c.decideChange(r.id, true)}>
                    {r.kind === 'CANCEL' ? 'Cancel the order' : 'Mark done'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => c.decideChange(r.id, false)}>
                    Decline
                  </button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Invoices in the customer's format */}
      {o.invoices.length > 0 && (
        <div className="tr-row">
          {o.invoices.map((i) => {
            const doc = finance.state.documents.find((x) => x.id === i.id);
            return doc ? (
              <button key={i.number} type="button" className="btn btn-ghost btn-sm" onClick={() => printDocument(`Invoice ${doc.number}`, invoiceHtml(state, finance.state, doc))}>
                <FileText size={14} /> Print {doc.number}
              </button>
            ) : null;
          })}
        </div>
      )}

      <NotesPanel kind="order" id={o.id} notes={o.noteLog ?? []} />
      <div className="tr-row">
        <input className="form-control grow" value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Template name, e.g. Weekly DC replenishment" aria-label="Template name" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => c.saveTemplate(tplName, o.customerId, o.lines).ok && setTplName('')}>
          <Save size={14} /> Save as order template
        </button>
      </div>
      <Attachments owner={`trading:${o.number}`} by={actor.name} title="Documents (LPO, certificates, POD)" readOnly={o.status === 'VOID'} />
      {o.closed && (
        <p className="sx-muted">
          <Lock size={12} /> Closed
        </p>
      )}
    </>
  );
};

const ReleaseModal: React.FC<{ o: SalesOrder; lineId: string; onClose: () => void }> = ({ o, lineId, onClose }) => {
  const { setReleases } = useCommercial();
  const l = o.lines.find((x) => x.id === lineId)!;
  const shipped = (l.releases ?? []).filter((r) => r.shippedDate);
  const left = l.qty - shipped.reduce((x, r) => x + r.qty, 0);
  const [rows, setRows] = useState(() => (l.releases ?? []).filter((r) => !r.shippedDate).map((r) => ({ qty: r.qty, requestedDate: r.requestedDate })).concat(l.releases?.length ? [] : [{ qty: Math.ceil(left / 2), requestedDate: o.requiredBy }, { qty: Math.floor(left / 2), requestedDate: addDays(o.requiredBy, 14) }]));
  const sum = rows.reduce((x, r) => x + r.qty, 0);
  return (
    <Modal
      title={`Releases — ${l.description}`}
      subtitle={`${left} still to schedule (line quantity ${l.qty})`}
      onClose={onClose}
      footer={
        <>
          <span className={sum === left ? 'sx-muted' : 'sx-danger-text'}>
            Scheduled {sum} of {left}
          </span>
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows([...rows, { qty: 0, requestedDate: addDays(o.requiredBy, 7 * (rows.length + 1)) }])}>
            <Plus size={14} /> Add release
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setReleases(o.id, l.id, rows).ok && onClose()}>
            Save releases
          </button>
        </>
      }
    >
      {shipped.map((r) => (
        <p key={r.id} className="sx-muted">
          {r.number}: {r.qty} shipped {r.shippedDate}
        </p>
      ))}
      {rows.map((r, i) => (
        <div key={i} className="tr-row">
          <input className="form-control" type="number" min="0" value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} aria-label="Release quantity" />
          <input className="form-control" type="date" value={r.requestedDate} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, requestedDate: e.target.value } : x)))} aria-label="Release date" />
          <button type="button" className="sx-icon-btn" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove release">
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </Modal>
  );
};

/** Controlled change to an approved order (add lines, change quantities or dates) with a reason; increases are re-approved. */
export const AmendModal: React.FC<{ o: SalesOrder; onClose: () => void }> = ({ o, onClose }) => {
  const { amendOrder, party } = useCommercial();
  const [lines, setLines] = useState<Line[]>(() => o.lines.map((l) => ({ ...l })));
  const [requiredBy, setRequiredBy] = useState(o.requiredBy);
  const [reason, setReason] = useState('');
  return (
    <Modal
      size="xl"
      title={`Amend ${o.number}`}
      subtitle="Add lines or change quantities. Delivered quantities cannot be reduced; value or discount increases go back for approval."
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => amendOrder(o.id, lines, requiredBy, reason).ok && onClose()}>
            Save revision {(o.revision ?? 0) + 1}
          </button>
        </>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Field label="Required by">
          <input className="form-control" type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
        </Field>
        <Field label="Reason for the change" required>
          <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer revised LPO, extra cartons…" />
        </Field>
      </div>
      <LinesEditor lines={lines} onChange={setLines} mode="SELL" party={party(o.customerId)} ctx={{ customerId: o.customerId, date: o.date, shipDate: requiredBy, orderId: o.id }} />
    </Modal>
  );
};
