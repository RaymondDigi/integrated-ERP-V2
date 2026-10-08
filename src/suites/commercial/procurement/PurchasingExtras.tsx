import React, { useState } from 'react';
import { AlertTriangle, Award, Gavel, PenLine, Plus, UserPlus, Wallet } from 'lucide-react';
import { useCommercial } from '../store';
import { quoteTotal, totals } from '../engine';
import { addDays, fmtDate, kes, round2, TODAY } from '../../finance/engine';
import { ImportCsvButton, PrintButton, SignModal } from '../../../platform/Widgets';
import { Field, Modal } from '../../ui/kit';
import { useProcurementExt } from './ext/store';
import { contractFor, lastPrice } from './ext/engine';
import { docHtml } from './ext/ui';
import type { Line, PurchaseOrder, Requisition } from '../types';

/* ---------------- Ad hoc approvers and people to inform ---------------- */

export const AdHocPanel: React.FC<{ docRef: string; open: boolean }> = ({ docRef, open }) => {
  const ext = useProcurementExt();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'APPROVE' | 'NOTIFY'>('APPROVE');
  const [note, setNote] = useState('');
  const steps = ext.state.adHoc.filter((x) => x.docRef === docRef);
  if (!open && !steps.length) return null;
  return (
    <div className="prx-card">
      <b>
        <UserPlus size={14} /> Extra approvers and people to inform
      </b>
      {steps.length > 0 && (
        <ul className="sx-list">
          {steps.map((x) => (
            <li key={x.id}>
              <span>{x.name}</span>
              <span className="sx-muted">
                {x.kind === 'APPROVE' ? 'must approve' : 'informed'} · added by {x.addedBy}
              </span>
              {x.doneAt ? (
                <b>{x.kind === 'APPROVE' ? 'Approved' : 'Acknowledged'}</b>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.plan.completeAdHoc(x.id, note)}>
                  Record sign-off
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="prx-inline">
          <input className="form-control" placeholder="Name, e.g. Head of Blending" value={name} onChange={(e) => setName(e.target.value)} aria-label="Ad hoc approver" />
          <select className="form-control" style={{ maxWidth: 150 }} value={kind} onChange={(e) => setKind(e.target.value as 'APPROVE' | 'NOTIFY')} aria-label="Ad hoc kind">
            <option value="APPROVE">Must approve</option>
            <option value="NOTIFY">Inform only</option>
          </select>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.plan.addAdHoc(docRef, name, kind).ok && setName('')}>
            Add
          </button>
          <input className="form-control" placeholder="Sign-off note" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Sign-off note" />
        </div>
      )}
    </div>
  );
};

/* ---------------- Budget, plan and contract position for a requisition ---------------- */

export const ReqBudget: React.FC<{ r: Requisition }> = ({ r }) => {
  const ext = useProcurementExt();
  const { state, party } = useCommercial();
  const b = ext.budgetFor(r);
  const x = ext.state.reqExt[r.id];
  const plan = ext.state.plan.lines.find((l) => l.id === x?.planLineId);
  const contracts = r.lines.map((l) => ({ l, c: l.sku ? contractFor(ext.state.contracts, undefined, l.sku) : undefined, last: l.sku ? lastPrice(state, l.sku) : null }));
  return (
    <>
      <div className={`sx-callout ${b.over ? 'warn' : 'info'}`}>
        <Wallet size={16} />
        <div>
          <b>
            Budget {b.account} · {b.hasBudget ? `${kes(b.available)} available` : 'no budget set'}
          </b>
          <span>
            Budget {kes(b.budget)} · spent {kes(b.actual)} · committed {kes(b.committed)}
            {b.over ? ' — this requisition would overspend, so the Finance Director must approve it' : ''}
            {plan ? ` · plan line: ${plan.description} (Q${plan.quarter}, ${plan.method})` : ' · not linked to the procurement plan'}
          </span>
        </div>
      </div>
      <table className="sx-mini-table">
        <tbody>
          {contracts.map(({ l, c, last }) => (
            <tr key={l.id}>
              <td>
                {l.description}
                {l.sku ? '' : <small className="sx-muted"> · free text{l.serviceType ? ` (${l.serviceType})` : ''}{l.uom ? ` · ${l.uom}` : ''}</small>}
                {l.spec && <small className="sx-muted sx-block">{l.spec}</small>}
              </td>
              <td>{c ? <span className="sx-success-text">On contract {c.number} with {party(c.supplierId)?.name}</span> : <span className="sx-muted">Off contract</span>}</td>
              <td style={{ textAlign: 'right' }}>{last ? `Last paid ${kes(last.price)} (${fmtDate(last.date)})` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

/** Off-contract lines: source them with an RFQ; one-off items can join the catalogue; split award by line. */
export const ReqSourcing: React.FC<{ r: Requisition }> = ({ r }) => {
  const ext = useProcurementExt();
  const com = useCommercial();
  const [split, setSplit] = useState(false);
  const cheapest = (lineId: string) => [...r.quotes].sort((a, b) => (a.prices[lineId] ?? Infinity) - (b.prices[lineId] ?? Infinity))[0]?.supplierId ?? '';
  const awarded = r.awards?.flatMap((a) => a.lineIds) ?? (r.poId ? r.lines.map((l) => l.id) : []);
  const open = r.lines.filter((l) => !awarded.includes(l.id));
  const [pick, setPick] = useState<Record<string, string>>(() => Object.fromEntries(r.lines.map((l) => [l.id, cheapest(l.id)])));
  const [reason, setReason] = useState('');
  const freeText = r.lines.filter((l) => !l.sku);
  const sourced = ext.state.events.find((e) => e.lots.some((lot) => lot.lines.some((x) => x.reqId === r.id)));
  if (r.status !== 'APPROVED' || !open.length) return null;
  const doSplit = () => {
    const by = new Map<string, string[]>();
    for (const l of open) if (pick[l.id]) by.set(pick[l.id], [...(by.get(pick[l.id]) ?? []), l.id]);
    if (!by.size) return ext.ctx.fail('Choose a supplier for at least one line');
    let first: string | undefined;
    for (const [sup, lineIds] of by) {
      const q = r.quotes.find((x) => x.supplierId === sup);
      const res = com.award(r.id, sup, reason || 'Split award — best price per line', { lineIds, prices: q ? Object.fromEntries(lineIds.map((id) => [id, q.prices[id]])) : undefined, leadDays: q?.leadDays });
      if (!res.ok) return res;
      first = first ?? res.id;
    }
    setSplit(false);
    if (first) com.setProcurement('orders', first);
    return { ok: true as const };
  };
  return (
    <div className="prx-card">
      <div className="prx-inline">
        {sourced ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.go('sourcing', sourced.id)}>
            <Gavel size={14} /> Open {sourced.number}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const res = ext.sourcing.eventFromRequisitions([r.id], 'RFQ');
              if (res.ok && res.id) ext.go('sourcing', res.id);
            }}
          >
            <Gavel size={14} /> Issue RFQ to suppliers
          </button>
        )}
        {r.quotes.length > 1 && r.lines.length > 1 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSplit(!split)}>
            <Award size={14} /> Split award by line
          </button>
        )}
        {freeText.map((l) => (
          <button
            key={l.id}
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => ext.inventory.addItem({ name: l.description, kind: l.serviceType ? 'SERVICE' : 'MATERIAL', category: l.serviceType ? 'Services' : 'General', unit: l.uom || 'pcs', cost: l.estPrice, reorderLevel: 0, reorderQty: 0, vatable: true, account: '5000' }, { spec: l.spec })}
          >
            <Plus size={14} /> Add “{l.description}” to the catalogue
          </button>
        ))}
      </div>
      {split && (
        <>
          <table className="sx-mini-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Supplier</th>
                <th style={{ textAlign: 'right' }}>Price</th>
              </tr>
            </thead>
            <tbody>
              {open.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td>
                    <select className="form-control" aria-label={`Supplier for ${l.description}`} value={pick[l.id] ?? ''} onChange={(e) => setPick({ ...pick, [l.id]: e.target.value })}>
                      <option value="">Not now</option>
                      {r.quotes.map((q) => (
                        <option key={q.supplierId} value={q.supplierId}>
                          {com.party(q.supplierId)?.name} — {q.prices[l.id]?.toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ textAlign: 'right' }}>{kes(r.quotes.find((q) => q.supplierId === pick[l.id])?.prices[l.id] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sx-muted">Total {kes(round2(open.reduce((a, l) => a + l.qty * (r.quotes.find((q) => q.supplierId === pick[l.id])?.prices[l.id] ?? 0), 0)))} against the best single quote {kes(Math.min(...r.quotes.map((q) => quoteTotal(r, q))))}.</p>
          <div className="prx-inline">
            <input className="form-control" placeholder="Reason for the file (optional)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Split reason" />
            <button type="button" className="btn btn-primary btn-sm" onClick={doSplit}>
              Create one order per supplier
            </button>
          </div>
        </>
      )}
    </div>
  );
};

/* ---------------- Purchase order: currency, amendment, print and sign ---------------- */

export const PoCurrency: React.FC<{ o: PurchaseOrder }> = ({ o }) => {
  const ext = useProcurementExt();
  const x = ext.state.poExt[o.id];
  const [cur, setCur] = useState(x?.currency ?? 'KES');
  const [rate, setRate] = useState(x?.fxRate ?? 1);
  if (o.status !== 'DRAFT' && o.status !== 'REJECTED') return x && x.currency !== 'KES' ? <p className="sx-note">Order currency {x.currency} at {x.fxRate} KES — prices on the order are in KES equivalent.</p> : null;
  return (
    <div className="prx-inline">
      <span className="sx-muted">Order currency</span>
      <select className="form-control" style={{ maxWidth: 110 }} value={cur} onChange={(e) => (setCur(e.target.value), setRate(ext.state.fx[e.target.value] ?? 1))} aria-label="Order currency">
        {Object.keys(ext.state.fx).map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <input className="form-control" style={{ maxWidth: 120 }} type="number" min="0" step="any" value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Exchange rate" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.plan.setPoCurrency(o.id, cur, rate)}>
        Set
      </button>
    </div>
  );
};

export const AmendModal: React.FC<{ o: PurchaseOrder; onClose: () => void }> = ({ o, onClose }) => {
  const { amendPO, state } = useCommercial();
  const [lines, setLines] = useState(o.lines.map((l) => ({ lineId: l.id, qty: l.qty, price: l.price })));
  const [expected, setExpected] = useState(o.expected);
  const [reason, setReason] = useState('');
  const after = totals(
    o.lines.map((l) => ({ ...l, ...lines.find((x) => x.lineId === l.id) })),
    state.products
  ).total;
  return (
    <Modal
      title={`Amend ${o.number}`}
      subtitle="Quantities can't go below what has been received; billed lines keep their price. A higher value goes back for approval."
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">
            New value <b>{kes(after)}</b>
          </span>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => amendPO(o.id, lines, expected, reason).ok && onClose()}>
            Save revision
          </button>
        </>
      }
    >
      <table className="sx-mini-table sx-alloc">
        <thead>
          <tr>
            <th>Item</th>
            <th>Received</th>
            <th style={{ width: 120 }}>Quantity</th>
            <th style={{ width: 140 }}>Unit price</th>
          </tr>
        </thead>
        <tbody>
          {o.lines.map((l) => {
            const a = lines.find((x) => x.lineId === l.id)!;
            return (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td>{l.received}</td>
                <td>
                  <input className="form-control" type="number" min={l.received} value={a.qty} onChange={(e) => setLines(lines.map((x) => (x.lineId === l.id ? { ...x, qty: Number(e.target.value) } : x)))} aria-label={`Quantity ${l.description}`} />
                </td>
                <td>
                  <input className="form-control" type="number" min="0" value={a.price} disabled={l.billed > 0} onChange={(e) => setLines(lines.map((x) => (x.lineId === l.id ? { ...x, price: Number(e.target.value) } : x)))} aria-label={`Price ${l.description}`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="sx-grid sx-grid-2">
        <Field label="Expected delivery">
          <input className="form-control" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </Field>
        <Field label="Reason for amendment" required>
          <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Supplier price increase agreed" />
        </Field>
      </div>
    </Modal>
  );
};

export const PoPrint: React.FC<{ o: PurchaseOrder }> = ({ o }) => {
  const ext = useProcurementExt();
  const { state, party, actor } = useCommercial();
  const [signing, setSigning] = useState(false);
  const ref = `PO:${o.id}`;
  const x = ext.state.poExt[o.id];
  const s = party(o.supplierId);
  const t = totals(o.lines, state.products);
  const html = () =>
    docHtml(
      ext.state,
      'Purchase order',
      o.number,
      [
        ['Date', fmtDate(o.date)],
        ['Deliver by', fmtDate(o.expected)],
        ['Supplier PIN', s?.pin ?? ''],
        ['Currency', x && x.currency !== 'KES' ? `${x.currency} @ ${x.fxRate}` : 'KES'],
        ['Total incl. VAT', kes(t.total)]
      ],
      { head: ['Item', 'Quantity', 'Unit price', 'Amount'], rows: o.lines.map((l: Line) => [l.description, l.qty, l.price, round2(l.qty * l.price)]) },
      { party: s?.name, notes: o.notes, sigRef: ref, signers: [`Prepared: ${o.preparedBy}`, ...o.approvals.map((a) => `Approved: ${a.by}`)] }
    );
  return (
    <>
      <PrintButton label="Print / PDF" title={o.number} html={html} />
      {o.status === 'APPROVED' && !ext.state.signatures[ref] && (
        <button type="button" className="btn btn-secondary btn-sm" disabled={ext.readOnly} onClick={() => setSigning(true)}>
          <PenLine size={14} /> E-sign
        </button>
      )}
      {ext.state.signatures[ref] && <small className="sx-muted">Signed by {ext.state.signatures[ref].by}</small>}
      {signing && <SignModal signer={actor.name} meaning={`Authorised purchase order ${o.number}`} onClose={() => setSigning(false)} onSign={(sig) => ext.plan.sign(ref, sig)} />}
    </>
  );
};

/** Off-contract warnings on an order. */
export const PoContractNote: React.FC<{ o: PurchaseOrder }> = ({ o }) => {
  const ext = useProcurementExt();
  const off = ext.offContract(o);
  if (!off.length || o.status === 'APPROVED') return null;
  return (
    <div className="sx-callout warn">
      <AlertTriangle size={16} />
      <div>
        <b>Off-contract buying</b>
        <span>{off.join('; ')}. To submit anyway, start the order notes with "Off-contract:" and the reason.</span>
      </div>
    </div>
  );
};

/* ---------------- Bulk purchase-order import ---------------- */

export const PoImport: React.FC = () => {
  const { savePO, finance, state } = useCommercial();
  return (
    <ImportCsvButton
      label="Import orders"
      template={['supplier', 'sku', 'qty', 'price', 'expected']}
      onImport={(rows) => {
        const errors: string[] = [];
        const groups = new Map<string, { expected: string; lines: Line[] }>();
        rows.forEach((r, i) => {
          const sup = finance.state.parties.find((p) => p.kind === 'SUPPLIER' && (p.id === r.supplier || p.name.toLowerCase() === r.supplier?.trim().toLowerCase()));
          const prod = state.products.find((p) => p.sku === r.sku?.trim());
          const qty = Number(r.qty);
          const price = Number(r.price);
          if (!sup) return void errors.push(`Row ${i + 2}: unknown supplier "${r.supplier}"`);
          if (!prod) return void errors.push(`Row ${i + 2}: unknown item "${r.sku}"`);
          if (!(qty > 0) || !(price > 0)) return void errors.push(`Row ${i + 2}: quantity and price must be above zero`);
          const g = groups.get(sup.id) ?? { expected: r.expected?.trim() || addDays(TODAY, 10), lines: [] };
          g.lines.push({ id: `imp${i}`, sku: prod.sku, description: prod.name, qty, price, discountPct: 0 } as Line);
          groups.set(sup.id, g);
        });
        let imported = 0;
        for (const [supplierId, g] of groups) {
          const res = savePO({ supplierId, expected: g.expected, notes: 'Imported from CSV', lines: g.lines });
          if (res.ok) imported += g.lines.length;
          else errors.push(`${finance.state.parties.find((p) => p.id === supplierId)?.name}: ${res.error}`);
        }
        return { imported, errors };
      }}
    />
  );
};
