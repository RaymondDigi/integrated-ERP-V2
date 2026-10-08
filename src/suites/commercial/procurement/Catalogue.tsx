import React, { useMemo, useState } from 'react';
import { HelpCircle, Info, LogIn, Minus, PackageSearch, Plus, ShoppingCart, UserPlus } from 'lucide-react';
import { useCommercial } from '../store';
import { addDays, kes, round2, TODAY } from '../../finance/engine';
import { DEPARTMENTS } from '../../finance/data';
import { Empty, Field, Panel, SearchBox, SuitePage } from '../../ui/kit';
import { useProcurementExt } from './ext/store';
import { contractPrice, lastPrice, SERVICE_TYPES } from './ext/engine';
import { FAQ } from './ext/data';
import { ReadOnlyNote } from './ext/ui';
import { OnboardModal } from './Vendors';
import type { ReqLine } from '../types';

type CartLine = ReqLine & { source: string };

/** Fuzzy match: every word of the query appears (in any order) in the item's text, allowing a one-letter slip on longer words. */
const fuzzy = (hay: string, query: string) => {
  const h = hay.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => h.includes(w) || (w.length > 4 && h.split(/[^a-z0-9]+/).some((t) => t.length >= w.length - 1 && [...w].filter((ch, i) => t[i] === ch).length >= w.length - 1)));
};

export const CataloguePage: React.FC = () => {
  const ext = useProcurementExt();
  const com = useCommercial();
  const { state, actor, party, finance } = com;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [meta, setMeta] = useState({ department: 'Operations', requestedBy: actor.name, neededBy: addDays(TODAY, 14), justification: '', account: '', planLineId: '', costCentre: '', project: '' });
  const [free, setFree] = useState({ description: '', qty: 1, estPrice: 0, uom: 'each', serviceType: '', spec: '' });
  const [suggest, setSuggest] = useState(false);
  const [sso, setSso] = useState(false);
  const items = state.products.filter((p) => p.kind !== 'GOODS' && ext.state.items.find((i) => i.sku === p.sku)?.active !== false);
  const cats = [...new Set(items.map((p) => p.category))];
  const priceOf = (sku: string) => {
    const ct = contractPrice(ext.state.contracts, undefined, sku);
    if (ct) return { price: ct.price, source: `Contract ${ct.contract.number} · ${party(ct.contract.supplierId)?.name}` };
    const cat = ext.state.catalogue.filter((c) => c.sku === sku && c.status === 'APPROVED').sort((a, b) => a.price - b.price)[0];
    if (cat) return { price: cat.price, source: `Catalogue · ${party(cat.supplierId)?.name}` };
    const lp = lastPrice(state, sku);
    if (lp) return { price: lp.price, source: `Last order ${lp.po}` };
    return { price: state.products.find((p) => p.sku === sku)?.cost ?? 0, source: 'Standard cost' };
  };
  const shown = useMemo(
    () =>
      items.filter((p) => {
        const ix = ext.state.items.find((i) => i.sku === p.sku);
        return (!cat || p.category === cat) && (!q || fuzzy(`${p.sku} ${p.name} ${p.category} ${ix?.tags.join(' ') ?? ''} ${ix?.spec ?? ''} ${ix?.unspsc ?? ''}`, q));
      }),
    [items, cat, q, ext.state.items]
  );
  const add = (sku: string) => {
    const p = state.products.find((x) => x.sku === sku)!;
    const pr = priceOf(sku);
    const ex = cart.find((l) => l.sku === sku);
    setCart(ex ? cart.map((l) => (l.sku === sku ? { ...l, qty: l.qty + 1 } : l)) : [...cart, { id: `c${Date.now()}${sku}`, sku, description: p.name, qty: 1, estPrice: pr.price, uom: p.unit, source: pr.source }]);
  };
  const total = round2(cart.reduce((s, l) => s + l.qty * l.estPrice, 0));
  const budget = cart.length ? ext.budgetFor({ lines: cart }, meta.account || undefined) : null;
  const budgetAccounts = [...new Set(finance.state.budgets.map((b) => b.account))];
  const offContract = cart.filter((l) => l.sku && !contractPrice(ext.state.contracts, undefined, l.sku));
  const fromStores = cart.filter((l) => {
    const p = state.products.find((x) => x.sku === l.sku);
    return p && p.kind === 'MATERIAL' && p.stock >= l.qty;
  });
  const submit = (asStores: boolean) => {
    if (asStores) {
      const r = ext.inventory.requestFromStores({ department: meta.department, requestedBy: meta.requestedBy, warehouse: 'WH-NBO', plan: 'AUTO', lines: cart.map((l) => ({ sku: l.sku, qty: l.qty })) });
      if (r.ok) setCart([]);
      return;
    }
    const r = com.saveRequisition({ department: meta.department, requestedBy: meta.requestedBy, neededBy: meta.neededBy, justification: meta.justification, lines: cart.map(({ source: _s, ...l }) => l) });
    if (!r.ok || !r.id) return;
    ext.plan.setReqExt(r.id, { budgetAccount: meta.account || undefined, planLineId: meta.planLineId || undefined, customFields: Object.fromEntries(Object.entries({ 'Cost centre': meta.costCentre, Project: meta.project }).filter(([, v]) => v)) });
    const sub = com.submitRequisition(r.id);
    if (sub.ok) {
      setCart([]);
      com.setProcurement('requisitions', r.id);
    }
  };
  return (
    <SuitePage
      eyebrow="Buy"
      title="Shop"
      subtitle="Find what you need at the agreed price, add it to your cart and send it for approval."
      actions={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSuggest(true)}>
            <UserPlus size={15} /> Suggest a new supplier
          </button>
        </>
      }
    >
      <ReadOnlyNote show={ext.readOnly} />
      <div className="prx-brand" style={{ background: ext.state.branding.colour }}>
        <b>
          {ext.state.branding.logoText} · {ext.state.branding.name}
        </b>
        <span>{ext.state.branding.welcome}</span>
      </div>
      <div className="prx-split">
        <div>
          <div className="sx-toolbar">
            <SearchBox value={q} onChange={setQ} placeholder="Search: e.g. cartons 5-ply, labels, generator…" />
          </div>
          <div className="prx-facets" role="tablist">
            <button type="button" role="tab" aria-selected={!cat} className={`sx-tag ${!cat ? 'active' : ''}`} onClick={() => setCat('')}>
              All
            </button>
            {cats.map((c) => (
              <button key={c} type="button" role="tab" aria-selected={cat === c} className={`sx-tag ${cat === c ? 'active' : ''}`} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <Empty icon={<PackageSearch size={20} />} title="Nothing matches" text="Request it as a free-text item below — purchasing will source it." />
          ) : (
            <div className="prx-cards">
              {shown.map((p) => {
                const ix = ext.state.items.find((i) => i.sku === p.sku);
                const pr = priceOf(p.sku);
                return (
                  <div key={p.sku} className="prx-card">
                    <h3>{p.name}</h3>
                    <small>
                      {p.sku} · {p.category}
                      {ix?.tags.length ? ` · ${ix.tags.join(', ')}` : ''}
                    </small>
                    <span className="prx-price">
                      {kes(pr.price)} <small>/ {p.unit}</small>
                    </span>
                    <small>{pr.source}</small>
                    {p.kind === 'MATERIAL' && <small>{p.stock > 0 ? `${p.stock} ${p.unit} in stores` : 'Not in stock'}</small>}
                    {ix?.policy && (
                      <small className="sx-muted">
                        <Info size={12} /> {ix.policy}
                      </small>
                    )}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => add(p.sku)}>
                      <Plus size={14} /> Add to cart
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <Panel title="Request something else" subtitle="Not in the catalogue — a free-text or service line">
            <div className="prx-inline">
              <input className="form-control" value={free.description} onChange={(e) => setFree({ ...free, description: e.target.value })} placeholder="What do you need?" />
              <select className="form-control" value={free.serviceType} onChange={(e) => setFree({ ...free, serviceType: e.target.value, uom: e.target.value ? 'jobs' : free.uom })} aria-label="Service type">
                <option value="">Goods</option>
                {SERVICE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    Service: {s}
                  </option>
                ))}
              </select>
              <input className="form-control" type="number" min="1" value={free.qty} onChange={(e) => setFree({ ...free, qty: Number(e.target.value) })} aria-label="Quantity" />
              <input className="form-control" value={free.uom} onChange={(e) => setFree({ ...free, uom: e.target.value })} aria-label="Unit" />
              <input className="form-control" type="number" min="0" value={free.estPrice || ''} onChange={(e) => setFree({ ...free, estPrice: Number(e.target.value) })} placeholder="Estimated unit cost" />
              <input className="form-control" value={free.spec} onChange={(e) => setFree({ ...free, spec: e.target.value })} placeholder="Specification" />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  if (!free.description.trim()) return;
                  setCart([...cart, { id: `f${Date.now()}`, sku: '', description: free.description, qty: free.qty, estPrice: free.estPrice, uom: free.uom, spec: free.spec || undefined, serviceType: free.serviceType || undefined, source: 'Your estimate' }]);
                  setFree({ description: '', qty: 1, estPrice: 0, uom: 'each', serviceType: '', spec: '' });
                }}
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </Panel>
        </div>
        <div>
          <Panel title={<><ShoppingCart size={16} /> Cart {cart.length > 0 && <span className="sx-count">{cart.length}</span>}</>} subtitle={kes(total)}>
            {cart.length === 0 ? (
              <p className="sx-muted">Your cart is empty.</p>
            ) : (
              <>
                <ul className="sx-list">
                  {cart.map((l) => (
                    <li key={l.id}>
                      <span>
                        {l.description}
                        <small className="sx-muted sx-block">
                          {l.source}
                          {l.serviceType ? ` · service: ${l.serviceType}` : ''}
                        </small>
                      </span>
                      <span className="prx-inline">
                        <button type="button" className="sx-icon-btn" aria-label="Less" onClick={() => setCart(cart.map((x) => (x.id === l.id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}>
                          <Minus size={13} />
                        </button>
                        <input className="form-control" type="number" min="1" value={l.qty} onChange={(e) => setCart(cart.map((x) => (x.id === l.id ? { ...x, qty: Number(e.target.value) } : x)))} style={{ maxWidth: 70 }} aria-label={`Quantity of ${l.description}`} />
                        <button type="button" className="sx-icon-btn" aria-label="More" onClick={() => setCart(cart.map((x) => (x.id === l.id ? { ...x, qty: x.qty + 1 } : x)))}>
                          <Plus size={13} />
                        </button>
                      </span>
                      <b>{kes(l.qty * l.estPrice)}</b>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCart(cart.filter((x) => x.id !== l.id))}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="sx-grid sx-grid-2">
                  <Field label="Department">
                    <select className="form-control" value={meta.department} onChange={(e) => setMeta({ ...meta, department: e.target.value })}>
                      {DEPARTMENTS.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Requested by">
                    <input className="form-control" value={meta.requestedBy} onChange={(e) => setMeta({ ...meta, requestedBy: e.target.value })} />
                  </Field>
                  <Field label="Needed by">
                    <input className="form-control" type="date" value={meta.neededBy} onChange={(e) => setMeta({ ...meta, neededBy: e.target.value })} />
                  </Field>
                  <Field label="Budget line">
                    <select className="form-control" value={meta.account} onChange={(e) => setMeta({ ...meta, account: e.target.value })}>
                      <option value="">From the items</option>
                      {budgetAccounts.map((a) => (
                        <option key={a} value={a}>
                          {a} {finance.state.accounts.find((x) => x.code === a)?.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Procurement plan line">
                    <select className="form-control" value={meta.planLineId} onChange={(e) => setMeta({ ...meta, planLineId: e.target.value })}>
                      <option value="">Unplanned</option>
                      {ext.state.plan.lines.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.description}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Cost centre">
                    <input className="form-control" value={meta.costCentre} onChange={(e) => setMeta({ ...meta, costCentre: e.target.value })} placeholder="e.g. Blending line 2" />
                  </Field>
                  <Field label="Project">
                    <input className="form-control" value={meta.project} onChange={(e) => setMeta({ ...meta, project: e.target.value })} />
                  </Field>
                  <Field label="Why is it needed?" required span={2}>
                    <input className="form-control" value={meta.justification} onChange={(e) => setMeta({ ...meta, justification: e.target.value })} />
                  </Field>
                </div>
                {budget && budget.hasBudget && (
                  <div className={`sx-callout ${budget.over ? 'danger' : 'success'}`}>
                    <Info size={16} />
                    <div>
                      <b>
                        Budget {budget.account}: {kes(budget.available)} available
                      </b>
                      <span>
                        Budget {kes(budget.budget, { compact: true })} · spent {kes(budget.actual, { compact: true })} · committed {kes(budget.committed, { compact: true })}
                        {budget.over ? ' — this request is over budget and also needs the Finance Director' : ''}
                      </span>
                    </div>
                  </div>
                )}
                {offContract.length > 0 && <p className="sx-muted">No contract for {offContract.map((l) => l.sku).join(', ')} — purchasing will get quotes (RFQ).</p>}
                <div className="prx-inline">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => submit(false)}>
                    Send for approval
                  </button>
                  {fromStores.length === cart.length && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => submit(true)}>
                      Issue from stores instead
                    </button>
                  )}
                </div>
              </>
            )}
          </Panel>
          <Panel title={<><HelpCircle size={16} /> Help</>} subtitle="Frequently asked questions">
            <ul className="sx-list">
              {FAQ.map(([qq, a]) => (
                <li key={qq}>
                  <details>
                    <summary>{qq}</summary>
                    <p className="sx-muted">{a}</p>
                  </details>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSso(true)}>
              <LogIn size={14} /> Sign in with Microsoft
            </button>
            {sso && <p className="sx-muted">Single sign-on is simulated: it needs an identity provider, which this build does not connect to.</p>}
          </Panel>
        </div>
      </div>
      {suggest && <OnboardModal source="REQUISITIONER" onClose={() => setSuggest(false)} onDone={() => setSuggest(false)} />}
    </SuitePage>
  );
};
