import React, { useState } from 'react';
import { Plus, Trash2, UserRound, AlertTriangle, MoreHorizontal, ScanLine, Lightbulb, Tag } from 'lucide-react';
import { useCommercial } from './store';
import { COM_ACTORS } from './data';
import { lineNet, ROLE_LABEL, totals } from './engine';
import { addDays, kes, round2, TODAY } from '../finance/engine';
import { atp, marginOf, priceForMargin, priceForMarkup, profileOf, resolvePrice } from './tradeEngine';
import { useOperations } from '../operations/store';
import type { ComRole, Line, Product } from './types';
import type { Party } from '../finance/types';

export const ComActorSwitcher: React.FC = () => {
  const { actor, setActor } = useCommercial();
  return (
    <div className="sx-actor">
      <span className="sx-actor-label">
        <UserRound size={13} /> Acting as
      </span>
      <select value={actor.role} onChange={(e) => setActor(e.target.value as ComRole)} aria-label="Acting as">
        {(Object.keys(COM_ACTORS) as ComRole[]).map((r) => (
          <option key={r} value={r}>
            {COM_ACTORS[r].name} — {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
    </div>
  );
};

export const PartySelect: React.FC<{ kind: 'CUSTOMER' | 'SUPPLIER'; value: string; onChange: (v: string) => void }> = ({ kind, value, onChange }) => {
  const { finance } = useCommercial();
  return (
    <select className="form-control" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose {kind === 'CUSTOMER' ? 'customer' : 'supplier'}…</option>
      {finance.state.parties
        .filter((p) => p.kind === kind)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
    </select>
  );
};

const blank = (): Line => ({ id: `n${Math.random().toString(36).slice(2, 8)}`, sku: '', description: '', qty: 1, price: 0, discountPct: 0 });

/** Pricing context for sales lines: when given, the pricing engine prices each line as it is picked or changed. */
export interface PriceCtx {
  customerId: string;
  date: string;
  shipDate?: string;
  shipTo?: string;
  orderId?: string;
  /** Quotation lines can carry their own expiry date. */
  quote?: boolean;
}

/** Line editor for quotations, orders and purchase orders. */
export const LinesEditor: React.FC<{
  lines: Line[];
  onChange: (lines: Line[]) => void;
  mode: 'SELL' | 'BUY';
  party?: Party;
  ctx?: PriceCtx;
}> = ({ lines, onChange, mode, party, ctx }) => {
  const { state, addProvisionalProduct, actor } = useCommercial();
  const ops = useOperations();
  const [open, setOpen] = useState<string | null>(null);
  const [scan, setScan] = useState('');
  const [scanMsg, setScanMsg] = useState('');
  const catalogue = state.products.filter((p) => (mode === 'SELL' ? p.kind !== 'MATERIAL' && p.status !== 'INACTIVE' : p.kind === 'MATERIAL'));
  const prof = ctx ? profileOf(state, ctx.customerId) : undefined;
  /** Runs the pricing engine on a sales line (keeps free text and configured blends as entered). */
  const reprice = (l: Line): Line => {
    if (mode !== 'SELL' || !ctx?.customerId || !l.sku || l.configId) return l;
    const r = resolvePrice(state, { customerId: ctx.customerId, sku: l.sku, qty: l.qty, date: ctx.date, shipDate: l.requestedDate || ctx.shipDate, uom: l.uom, shipTo: ctx.shipTo, orderId: ctx.orderId });
    return { ...l, price: r.price, discountPct: r.discountPct, ruleId: r.ruleId, ruleLabel: r.ruleLabel, rulePrice: r.net };
  };
  const set = (id: string, patch: Partial<Line>, price = false) => onChange(lines.map((l) => (l.id === id ? (price ? reprice({ ...l, ...patch }) : { ...l, ...patch }) : l)));
  const codeFor = (sku: string) => prof?.customerItems.find((c) => c.sku === sku)?.customerCode;
  const pick = (id: string, sku: string) => {
    const p = state.products.find((x) => x.sku === sku);
    if (!p) return set(id, { sku: '', ruleId: undefined, ruleLabel: undefined, rulePrice: undefined });
    const base = { sku, description: p.name, price: mode === 'SELL' ? p.price : p.cost, discountPct: 0, uom: undefined, customerCode: codeFor(sku) };
    set(id, base, true);
  };
  /** Scanned or typed barcode, customer item code or SKU → line. Unknown codes can become a provisional part number. */
  const resolveCode = (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const up = code.toUpperCase();
    const bySku = state.products.find((p) => p.sku === up);
    const byUpc = state.products.find((p) => p.upc === code || (p.barcodes ?? []).includes(code));
    const byCust = prof?.customerItems.find((c) => c.customerCode.toUpperCase() === up);
    const sku = bySku?.sku ?? byUpc?.sku ?? byCust?.sku;
    if (sku) {
      const blankLine = lines.find((l) => !l.sku && !l.description.trim());
      const p = state.products.find((x) => x.sku === sku)!;
      const nl = reprice({ ...(blankLine ?? blank()), sku, description: p.name, price: mode === 'SELL' ? p.price : p.cost, discountPct: 0, customerCode: byCust?.customerCode ?? codeFor(sku) });
      onChange(blankLine ? lines.map((l) => (l.id === blankLine.id ? nl : l)) : [...lines, nl]);
      setScanMsg(`${byUpc ? 'Barcode' : byCust ? 'Customer code' : 'SKU'} ${code} → ${p.name}`);
      setScan('');
      return;
    }
    setScanMsg(`No product with code ${code}`);
  };
  const newPart = () => {
    const code = scan.trim().toUpperCase();
    const r = addProvisionalProduct(code, `New part ${code}`, 0);
    if (r.ok) {
      onChange([...lines.filter((l) => l.sku || l.description.trim()), { ...blank(), sku: code, description: `New part ${code}` }]);
      setScanMsg(`${code} created as a provisional part — the manager completes its price and details`);
      setScan('');
    }
  };
  const t = totals(lines, state.products, party);
  const stockOf = (p?: Product) => (p && p.kind === 'GOODS' ? p.stock : null);
  const suggestions = mode === 'SELL' ? suggestFor(lines, state.products) : [];
  return (
    <>
      {mode === 'SELL' && (
        <div className="tr-scan">
          <ScanLine size={14} />
          <input
            className="form-control"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), resolveCode(scan))}
            placeholder="Scan a barcode or type a SKU / customer item code and press Enter"
            aria-label="Scan or type a product code"
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => resolveCode(scan)}>
            Add
          </button>
          {scanMsg.startsWith('No product') && actor.role !== 'STOREKEEPER' && /^[A-Z0-9-]{3,16}$/i.test(scan.trim()) && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={newPart} title="Create a provisional part number">
              New part number
            </button>
          )}
          {scanMsg && <small className="sx-muted">{scanMsg}</small>}
        </div>
      )}
      <div className="sx-lines sx-plines">
        <div className="sx-lines-head">
          <span>Product</span>
          <span>Description</span>
          <span>Qty</span>
          <span>{mode === 'SELL' ? 'Unit price' : 'Unit cost'}</span>
          {mode === 'SELL' && <span>Disc %</span>}
          <span>Amount</span>
          <span />
        </div>
        {lines.map((l) => {
          const p = state.products.find((x) => x.sku === l.sku);
          const stock = stockOf(p);
          const promise = mode === 'SELL' && p && p.kind === 'GOODS' && l.qty > stock! ? atp(state, p.sku, l.qty, ops.state.recipes) : null;
          return (
            <React.Fragment key={l.id}>
            <div className={`sx-lines-row ${mode === 'BUY' ? 'buy' : ''}`}>
              <select className="form-control" value={l.sku} onChange={(e) => pick(l.id, e.target.value)} aria-label="Product">
                <option value="">Other / free text</option>
                {catalogue.map((c) => (
                  <option key={c.sku} value={c.sku}>
                    {c.sku} · {c.name}
                  </option>
                ))}
              </select>
              <div className="sx-line-desc">
                <input className="form-control" value={l.description} onChange={(e) => set(l.id, { description: e.target.value })} aria-label="Description" />
                {stock !== null && mode === 'SELL' && (
                  <small className={l.qty > stock ? 'sx-danger-text' : 'sx-muted'}>
                    {l.qty > stock && <AlertTriangle size={11} />} {stock} {p!.unit} in stock
                    {promise && ` · can promise ${promise.promise === TODAY ? 'today' : promise.promise} (${promise.source})`}
                  </small>
                )}
                {mode === 'SELL' && l.ruleLabel && (
                  <small className={l.rulePrice !== undefined && Math.abs(l.price * (1 - (l.discountPct || 0) / 100) - l.rulePrice) > 0.005 ? 'sx-danger-text' : 'tr-rule'}>
                    <Tag size={11} /> {l.ruleLabel}
                    {l.rulePrice !== undefined && Math.abs(l.price * (1 - (l.discountPct || 0) / 100) - l.rulePrice) > 0.005 && ` — manual override (rule ${kes(l.rulePrice)})`}
                  </small>
                )}
                {mode === 'SELL' && p?.status === 'PROVISIONAL' && <small className="sx-danger-text">Provisional part — needs the manager to set it up</small>}
                {l.customerCode && <small className="sx-muted">Customer code {l.customerCode}</small>}
                {mode === 'SELL' && (
                  <button type="button" className="sx-link tr-more" onClick={() => setOpen(open === l.id ? null : l.id)} aria-expanded={open === l.id}>
                    <MoreHorizontal size={12} /> {open === l.id ? 'Hide details' : 'Notes, dates, margin…'}
                    {(l.note || l.validUntil || l.requestedDate) && ' •'}
                  </button>
                )}
              </div>
              <input className="form-control" type="number" min="0" value={l.qty} onChange={(e) => set(l.id, { qty: Number(e.target.value) }, true)} aria-label="Quantity" />
              <input className="form-control" type="number" min="0" value={l.price || ''} onChange={(e) => set(l.id, { price: Number(e.target.value) })} aria-label="Price" />
              {mode === 'SELL' && (
                <input
                  className={`form-control ${l.discountPct > 10 ? 'is-invalid' : ''}`}
                  type="number"
                  min="0"
                  max="100"
                  value={l.discountPct || ''}
                  placeholder="0"
                  onChange={(e) => set(l.id, { discountPct: Number(e.target.value) })}
                  aria-label="Discount percent"
                  title={l.discountPct > 10 ? 'Above 10% needs manager approval' : undefined}
                />
              )}
              <b className="sx-line-amt">{lineNet(l).toLocaleString()}</b>
              <button type="button" className="sx-icon-btn" onClick={() => onChange(lines.length > 1 ? lines.filter((x) => x.id !== l.id) : lines)} disabled={lines.length === 1} aria-label="Remove line">
                <Trash2 size={14} />
              </button>
            </div>
            {open === l.id && mode === 'SELL' && <LineDetails l={l} p={p} ctx={ctx} onSet={(patch, price) => set(l.id, patch, price)} />}
            </React.Fragment>
          );
        })}
        {suggestions.length > 0 && (
          <div className="tr-suggest">
            <Lightbulb size={14} />
            <div>
              {suggestions.map((s) => (
                <span key={s.key}>
                  {s.text}{' '}
                  <button type="button" className="sx-link" onClick={() => onChange([...lines.filter((x) => x.sku || x.description.trim()), reprice({ ...blank(), sku: s.sku, description: s.name, price: s.price, qty: s.qty })])}>
                    Add {s.sku}
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...lines, blank()])}>
          <Plus size={14} /> Add line
        </button>
      </div>
      <div className="sx-totals">
        <div>
          <span>Subtotal</span>
          <b>{kes(t.net)}</b>
        </div>
        <div>
          <span>VAT{party?.pin === 'NON-RESIDENT' ? ' (export, zero-rated)' : ''}</span>
          <b>{kes(t.vat)}</b>
        </div>
        <div className="sx-totals-grand">
          <span>Total</span>
          <b>{kes(t.total)}</b>
        </div>
      </div>
    </>
  );
};

export const newLine = blank;

/** Up-sell, cross-sell and substitute suggestions for the lines on a quote or order. */
export const suggestFor = (lines: Line[], products: Product[]) => {
  const out: { key: string; sku: string; name: string; price: number; qty: number; text: string }[] = [];
  const have = new Set(lines.map((l) => l.sku));
  for (const l of lines) {
    const p = products.find((x) => x.sku === l.sku);
    if (!p) continue;
    if (p.kind === 'GOODS' && l.qty > p.stock)
      for (const sku of p.substitutes ?? []) {
        const s = products.find((x) => x.sku === sku);
        if (s && !have.has(sku) && s.stock > 0) out.push({ key: `s${l.id}${sku}`, sku, name: s.name, price: s.price, qty: Math.min(s.stock, l.qty - p.stock), text: `Short on ${p.name} — substitute ${s.name} (${s.stock} ${s.unit} in stock).` });
      }
    for (const c of p.complements ?? []) {
      const s = products.find((x) => x.sku === c.sku);
      if (s && !have.has(c.sku)) out.push({ key: `c${l.id}${c.sku}`, sku: c.sku, name: s.name, price: s.price, qty: 1, text: c.script });
    }
  }
  return out.filter((x, i, a) => a.findIndex((y) => y.sku === x.sku) === i).slice(0, 3);
};

/** Per-line details: notes, line expiry (quotes), requested ship date, unit of measure, ship-to and margin estimating. */
const LineDetails: React.FC<{ l: Line; p?: Product; ctx?: PriceCtx; onSet: (patch: Partial<Line>, price?: boolean) => void }> = ({ l, p, ctx, onSet }) => {
  const { state } = useCommercial();
  const [margin, setMargin] = useState('');
  const [markup, setMarkup] = useState('');
  const prof = ctx ? profileOf(state, ctx.customerId) : undefined;
  const blend = l.configId ? state.blends.find((b) => b.id === l.configId) : undefined;
  const cost = blend?.unitCost ?? p?.cost ?? 0;
  const net = round2(l.price * (1 - (l.discountPct || 0) / 100));
  return (
    <div className="tr-line-details">
      <label>
        <span>Line note (prints on documents)</span>
        <input className="form-control" value={l.note ?? ''} onChange={(e) => onSet({ note: e.target.value })} placeholder="e.g. pack in 10 kg cartons" />
      </label>
      {ctx?.quote && (
        <label>
          <span>Line valid until</span>
          <input className="form-control" type="date" value={l.validUntil ?? ''} onChange={(e) => onSet({ validUntil: e.target.value || undefined })} />
        </label>
      )}
      <label>
        <span>Requested ship date</span>
        <input className="form-control" type="date" value={l.requestedDate ?? ''} min={TODAY} onChange={(e) => onSet({ requestedDate: e.target.value || undefined }, true)} />
      </label>
      {p && (p.uomPrices?.length ?? 0) > 0 && (
        <label>
          <span>Sell by</span>
          <select className="form-control" value={l.uom ?? p.unit} onChange={(e) => onSet({ uom: e.target.value === p.unit ? undefined : e.target.value }, true)}>
            <option value={p.unit}>{p.unit} (list {kes(p.price)})</option>
            {p.uomPrices!.map((u) => (
              <option key={u.uom} value={u.uom}>
                {u.uom} ({kes(u.price)})
              </option>
            ))}
          </select>
        </label>
      )}
      {prof && prof.shipTos.length > 1 && (
        <label>
          <span>Ship this line to</span>
          <select className="form-control" value={l.shipToId ?? ''} onChange={(e) => onSet({ shipToId: e.target.value || undefined })}>
            <option value="">Order ship-to</option>
            {prof.shipTos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {state.paymentTerms.length > 0 && !ctx?.quote && (
        <label>
          <span>Payment terms for this line</span>
          <select className="form-control" value={l.termId ?? ''} onChange={(e) => onSet({ termId: e.target.value || undefined })}>
            <option value="">Order terms</option>
            {state.paymentTerms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {!ctx?.quote && (
        <label className="sx-check">
          <input type="checkbox" checked={!!l.directShip} onChange={(e) => onSet({ directShip: e.target.checked })} /> Supplier ships direct to customer
        </label>
      )}
      <div className="tr-estimate">
        <span>
          Cost {cost ? kes(cost) : '—'} · net {kes(net)} · margin <b className={cost && marginOf(net, cost) < 15 ? 'sx-danger-text' : ''}>{cost ? `${marginOf(net, cost)}%` : '—'}</b>
        </span>
        <span className="tr-estimate-in">
          <input className="form-control" type="number" placeholder="Margin %" value={margin} onChange={(e) => setMargin(e.target.value)} aria-label="Desired margin percent" />
          <button type="button" className="btn btn-secondary btn-xs" disabled={!cost || !margin} onClick={() => onSet({ price: priceForMargin(cost, Number(margin)), discountPct: 0 })}>
            Price for margin
          </button>
          <input className="form-control" type="number" placeholder="Cost + %" value={markup} onChange={(e) => setMarkup(e.target.value)} aria-label="Cost plus percent" />
          <button type="button" className="btn btn-secondary btn-xs" disabled={!cost || !markup} onClick={() => onSet({ price: priceForMarkup(cost, Number(markup)), discountPct: 0 })}>
            Cost plus
          </button>
        </span>
      </div>
      {blend && <small className="sx-muted">Configured blend {blend.number}: production lead time about {Math.ceil((Math.ceil(l.qty / blend.batchSize) * blend.hoursPerBatch) / 8) + 1} days on {blend.line}.</small>}
      {!blend && ctx && <small className="sx-muted">Requested by {l.requestedDate ?? ctx.shipDate ?? addDays(TODAY, 7)}</small>}
    </div>
  );
};

/** Read-only line table with optional fulfilment columns. */
export const LinesTable: React.FC<{
  lines: (Line & { delivered?: number; invoiced?: number; received?: number; billed?: number })[];
  progress?: { a: 'delivered' | 'received'; aLabel: string; b: 'invoiced' | 'billed'; bLabel: string };
  products: Product[];
  party?: Party;
}> = ({ lines, progress, products, party }) => {
  const t = totals(lines, products, party);
  return (
    <table className="sx-mini-table">
      <thead>
        <tr>
          <th>Item</th>
          <th style={{ textAlign: 'right' }}>Qty</th>
          {progress && (
            <>
              <th style={{ textAlign: 'right' }} className="sx-hide-sm">
                {progress.aLabel}
              </th>
              <th style={{ textAlign: 'right' }} className="sx-hide-sm">
                {progress.bLabel}
              </th>
            </>
          )}
          <th style={{ textAlign: 'right' }}>Price</th>
          <th style={{ textAlign: 'right' }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.id}>
            <td>
              {l.customerCode && <span className="sx-mono sx-muted">[{l.customerCode}] </span>}
              {l.description}
              {l.discountPct > 0 && <small className="sx-muted sx-block">less {l.discountPct}%{l.ruleLabel ? ` · ${l.ruleLabel}` : ''}</small>}
              {l.note && <small className="sx-muted sx-block">Note: {l.note}</small>}
              {l.validUntil && <small className="sx-muted sx-block">Line valid until {l.validUntil}</small>}
            </td>
            <td style={{ textAlign: 'right' }}>{l.qty}</td>
            {progress && (
              <>
                <td style={{ textAlign: 'right' }} className={`sx-hide-sm ${(l[progress.a] ?? 0) < l.qty ? 'sx-muted' : 'sx-success-text'}`}>
                  {l[progress.a] ?? 0}
                </td>
                <td style={{ textAlign: 'right' }} className={`sx-hide-sm ${(l[progress.b] ?? 0) < (l[progress.a] ?? 0) ? 'sx-danger-text' : 'sx-muted'}`}>
                  {l[progress.b] ?? 0}
                </td>
              </>
            )}
            <td style={{ textAlign: 'right' }}>{l.price.toLocaleString()}</td>
            <td style={{ textAlign: 'right' }}>{lineNet(l).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={progress ? 5 : 3}>Subtotal</td>
          <td>{t.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td colSpan={progress ? 5 : 3}>VAT</td>
          <td>{t.vat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>
        <tr className="sx-total-row">
          <td colSpan={progress ? 5 : 3}>Total (KES)</td>
          <td>{round2(t.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>
      </tfoot>
    </table>
  );
};
