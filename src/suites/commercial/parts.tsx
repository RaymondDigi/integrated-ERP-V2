import React from 'react';
import { Plus, Trash2, UserRound, AlertTriangle } from 'lucide-react';
import { useCommercial } from './store';
import { COM_ACTORS } from './data';
import { lineNet, ROLE_LABEL, totals } from './engine';
import { kes, round2 } from '../finance/engine';
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

/** Line editor for quotations, orders and purchase orders. */
export const LinesEditor: React.FC<{
  lines: Line[];
  onChange: (lines: Line[]) => void;
  mode: 'SELL' | 'BUY';
  party?: Party;
}> = ({ lines, onChange, mode, party }) => {
  const { state } = useCommercial();
  const catalogue = state.products.filter((p) => (mode === 'SELL' ? p.kind !== 'MATERIAL' : p.kind === 'MATERIAL'));
  const set = (id: string, patch: Partial<Line>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const pick = (id: string, sku: string) => {
    const p = state.products.find((x) => x.sku === sku);
    set(id, p ? { sku, description: p.name, price: mode === 'SELL' ? p.price : p.cost } : { sku: '' });
  };
  const t = totals(lines, state.products, party);
  const stockOf = (p?: Product) => (p && p.kind === 'GOODS' ? p.stock : null);
  return (
    <>
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
          return (
            <div key={l.id} className={`sx-lines-row ${mode === 'BUY' ? 'buy' : ''}`}>
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
                  </small>
                )}
              </div>
              <input className="form-control" type="number" min="0" value={l.qty} onChange={(e) => set(l.id, { qty: Number(e.target.value) })} aria-label="Quantity" />
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
          );
        })}
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
              {l.description}
              {l.discountPct > 0 && <small className="sx-muted sx-block">less {l.discountPct}%</small>}
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
