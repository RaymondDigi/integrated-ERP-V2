import React, { useState } from 'react';
import { Plus, Tags, CheckCircle2, Percent, Calculator, Trash2 } from 'lucide-react';
import { useCommercial } from '../store';
import { fmtDate, kes, TODAY, addDays } from '../../finance/engine';
import type { PriceList, PriceListLine, PriceScope } from '../tradeTypes';
import { DataTable, DefList, Drawer, Field, Modal, Panel, Pill, Stat, SuitePage, type Column } from '../../ui/kit';
import { PartySelect } from '../parts';
import { ExportCsvButton, ImportCsvButton } from '../../../platform/Widgets';
import { resolvePrice, SCOPE_LABEL } from '../tradeEngine';

const STATUS_PILL: Record<PriceList['status'], string> = { DRAFT: 'SUBMITTED', ACTIVE: 'POSTED', RETIRED: 'VOID' };
const blankList = (): PriceList => ({
  id: '',
  name: '',
  scope: 'CUSTOMER',
  validFrom: TODAY,
  validTo: addDays(TODAY, 90),
  basis: 'ORDER_DATE',
  lines: [{ sku: '' }],
  status: 'DRAFT',
  createdBy: '',
  history: []
});
const num = (v: string) => (v === '' ? undefined : Number(v));

/** Price books, contract prices, promotions and the pricing engine's precedence rules. */
export const PricingPage: React.FC = () => {
  const { state, party, actor, approvePriceList, retirePriceList, setLowestPrice, importReferencePrices } = useCommercial();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PriceList | null>(null);
  const [mass, setMass] = useState(false);
  const lists = state.priceLists;
  const current = lists.find((x) => x.id === openId);
  const who = (pl: PriceList) => (pl.customerId ? party(pl.customerId)?.name : pl.group ? `Group: ${pl.group}` : pl.shipTo ? `Ship-to: ${pl.shipTo}` : 'All customers');
  const columns: Column<PriceList>[] = [
    {
      key: 'n',
      header: 'Price list',
      render: (pl) => (
        <div className="sx-cell-main">
          <span>{pl.name}</span>
          <small>{SCOPE_LABEL[pl.scope]}</small>
        </div>
      ),
      sort: (pl) => pl.name
    },
    { key: 'w', header: 'Applies to', render: (pl) => who(pl), sort: (pl) => who(pl) ?? '' },
    { key: 'v', header: 'Valid', render: (pl) => `${fmtDate(pl.validFrom)} – ${fmtDate(pl.validTo)}`, sort: (pl) => pl.validFrom, hideOnMobile: true },
    { key: 'l', header: 'Lines', render: (pl) => pl.lines.length, align: 'right' },
    { key: 's', header: 'Status', render: (pl) => <Pill status={STATUS_PILL[pl.status]} label={pl.status === 'DRAFT' ? 'Awaiting approval' : pl.status === 'ACTIVE' ? 'Active' : 'Retired'} />, sort: (pl) => pl.status }
  ];
  return (
    <SuitePage
      eyebrow="Sell"
      title="Pricing"
      subtitle="Customer price books, contract and group prices, promotions, volume breaks and rush premiums. The engine prices every quote and order line."
      actions={
        <>
          <ExportCsvButton
            name="price-lists"
            header={['List', 'Scope', 'Applies to', 'SKU', 'UOM', 'Attribute', 'Min qty', 'Min annual qty', 'Price', 'Discount %', 'Status']}
            rows={() => lists.flatMap((pl) => pl.lines.map((l) => [pl.name, pl.scope, who(pl), l.sku, l.uom, l.attr, l.minQty, l.minAnnualQty, l.price, l.discountPct, pl.status]))}
          />
          <ImportCsvButton label="Import reference prices" template={['sku', 'price']} onImport={(rows) => importReferencePrices(rows, `Reference prices ${TODAY}`)} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMass(true)}>
            <Percent size={14} /> Mass price update
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing(blankList())}>
            <Plus size={15} /> New price list
          </button>
        </>
      }
    >
      <div className="sx-stats">
        <Stat label="Active price lists" value={lists.filter((x) => x.status === 'ACTIVE').length} icon={<Tags size={17} />} />
        <Stat label="Awaiting approval" value={lists.filter((x) => x.status === 'DRAFT').length} detail="Activated by the Commercial Manager" icon={<CheckCircle2 size={17} />} tone="gold" />
        <Stat label="Expiring in 30 days" value={lists.filter((x) => x.status === 'ACTIVE' && x.validTo <= addDays(TODAY, 30)).length} icon={<Tags size={17} />} tone="red" />
        <Stat label="Policy" value={state.pricing.lowestPrice ? 'Lowest price' : 'Most specific'} detail="Customer › contract › group › promotion › external" icon={<Calculator size={17} />} tone="blue" />
      </div>
      <Panel title="Precedence" subtitle="How the engine chooses when several lists apply">
        <label className="sx-check">
          <input type="checkbox" checked={state.pricing.lowestPrice} onChange={(e) => setLowestPrice(e.target.checked)} disabled={actor.role !== 'MANAGER' && actor.role !== 'DIRECTOR'} /> Give the customer the lowest of all applicable prices (otherwise the most specific list wins)
        </label>
      </Panel>
      <DataTable rows={lists} columns={columns} rowKey={(x) => x.id} onRowClick={(x) => setOpenId(x.id)} selected={openId} initialSort={{ key: 'n', dir: 'asc' }} />
      <PriceSimulator />
      {current && (
        <Drawer
          wide
          title={current.name}
          subtitle={`${SCOPE_LABEL[current.scope]} · ${who(current)}`}
          badge={<Pill status={STATUS_PILL[current.status]} label={current.status} />}
          onClose={() => setOpenId(null)}
          footer={
            <>
              <span className="sx-grow" />
              {current.status !== 'RETIRED' && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(current)}>
                  Edit
                </button>
              )}
              {current.status === 'ACTIVE' && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => retirePriceList(current.id)}>
                  Retire
                </button>
              )}
              {current.status === 'DRAFT' && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => approvePriceList(current.id)}>
                  <CheckCircle2 size={14} /> Approve & activate
                </button>
              )}
            </>
          }
        >
          <DefList
            items={[
              ['Valid', `${fmtDate(current.validFrom)} – ${fmtDate(current.validTo)}`],
              ['Date basis', current.basis === 'SHIP_DATE' ? 'Requested ship date' : 'Order date'],
              ['Order discount', current.orderDiscountPct ? `${current.orderDiscountPct}% above ${kes(current.minOrderNet ?? 0)}` : '—'],
              ['Prepared by', current.createdBy],
              ['Approved by', current.approvedBy ?? '—']
            ]}
          />
          <table className="sx-mini-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>UOM / attr</th>
                <th>Break</th>
                <th style={{ textAlign: 'right' }}>Price / discount</th>
                <th>Rush</th>
              </tr>
            </thead>
            <tbody>
              {current.lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    {l.sku} <small className="sx-muted">{state.products.find((p) => p.sku === l.sku)?.name}</small>
                  </td>
                  <td>{[l.uom, l.attr].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{[l.minQty ? `≥ ${l.minQty} per order` : '', l.minAnnualQty ? `≥ ${l.minAnnualQty} a year` : ''].filter(Boolean).join(', ') || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{l.price !== undefined ? kes(l.price) : l.discountPct ? `${l.discountPct}% off list` : '—'}</td>
                  <td>{l.premiumPct ? `+${l.premiumPct}% within ${l.maxLeadDays} days` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4 className="sx-subhead">History</h4>
          <ul className="sx-list">
            {[...current.history].reverse().map((h, i) => (
              <li key={i}>
                <span className="sx-muted">{fmtDate(h.at.slice(0, 10))}</span>
                <span>{h.action}</span>
                <span className="sx-muted">{h.note}</span>
                <b>{h.by}</b>
              </li>
            ))}
          </ul>
        </Drawer>
      )}
      {editing && <PriceListEditor pl={editing} onClose={() => setEditing(null)} onSaved={(id) => (setEditing(null), setOpenId(id))} />}
      {mass && <MassUpdate onClose={() => setMass(false)} />}
    </SuitePage>
  );
};

const PriceListEditor: React.FC<{ pl: PriceList; onClose: () => void; onSaved: (id: string) => void }> = ({ pl, onClose, onSaved }) => {
  const { state, savePriceList } = useCommercial();
  const [d, setD] = useState<PriceList>(() => ({ ...pl, lines: pl.lines.map((l) => ({ ...l })) }));
  const setLine = (i: number, patch: Partial<PriceListLine>) => setD({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const save = () => {
    const r = savePriceList(d);
    if (r.ok && r.id) onSaved(r.id);
  };
  return (
    <Modal
      size="xl"
      title={pl.id ? `Edit ${pl.name}` : 'New price list'}
      subtitle="Fixed price or % off list per line; optional volume, annual-volume, unit, attribute and rush conditions"
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save}>
            Save price list
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Name" required span={2}>
          <input className="form-control" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className="form-control" value={d.scope} onChange={(e) => setD({ ...d, scope: e.target.value as PriceScope })}>
            {(Object.keys(SCOPE_LABEL) as PriceScope[]).map((k) => (
              <option key={k} value={k}>
                {SCOPE_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date basis">
          <select className="form-control" value={d.basis} onChange={(e) => setD({ ...d, basis: e.target.value as PriceList['basis'] })}>
            <option value="ORDER_DATE">Order date</option>
            <option value="SHIP_DATE">Requested ship date</option>
          </select>
        </Field>
        {(d.scope === 'CUSTOMER' || d.scope === 'CONTRACT') && (
          <Field label="Customer" required span={2}>
            <PartySelect kind="CUSTOMER" value={d.customerId ?? ''} onChange={(v) => setD({ ...d, customerId: v })} />
          </Field>
        )}
        {d.scope === 'GROUP' && (
          <Field label="Buying group" required>
            <input className="form-control" value={d.group ?? ''} onChange={(e) => setD({ ...d, group: e.target.value })} placeholder="e.g. Supermarkets" />
          </Field>
        )}
        <Field label="Ship-to town / zone">
          <input className="form-control" value={d.shipTo ?? ''} onChange={(e) => setD({ ...d, shipTo: e.target.value || undefined })} placeholder="Any" />
        </Field>
        <Field label="Valid from">
          <input className="form-control" type="date" value={d.validFrom} onChange={(e) => setD({ ...d, validFrom: e.target.value })} />
        </Field>
        <Field label="Valid to">
          <input className="form-control" type="date" value={d.validTo} onChange={(e) => setD({ ...d, validTo: e.target.value })} />
        </Field>
        <Field label="Order discount %">
          <input className="form-control" type="number" value={d.orderDiscountPct ?? ''} onChange={(e) => setD({ ...d, orderDiscountPct: num(e.target.value) })} />
        </Field>
        <Field label="…when order net above">
          <input className="form-control" type="number" value={d.minOrderNet ?? ''} onChange={(e) => setD({ ...d, minOrderNet: num(e.target.value) })} />
        </Field>
      </div>
      <div className="tr-table-wrap">
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>UOM</th>
              <th>Attribute</th>
              <th>Min qty</th>
              <th>Min / year</th>
              <th>Price</th>
              <th>Disc %</th>
              <th>Rush ≤ days</th>
              <th>Premium %</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <select className="form-control" aria-label="Product" value={l.sku} onChange={(e) => setLine(i, { sku: e.target.value })}>
                    <option value="">Choose…</option>
                    {state.products
                      .filter((p) => p.kind !== 'MATERIAL')
                      .map((p) => (
                        <option key={p.sku} value={p.sku}>
                          {p.sku} · {p.name}
                        </option>
                      ))}
                  </select>
                </td>
                <td>
                  <input className="form-control" aria-label="UOM" value={l.uom ?? ''} onChange={(e) => setLine(i, { uom: e.target.value || undefined })} />
                </td>
                <td>
                  <input className="form-control" aria-label="Attribute" value={l.attr ?? ''} onChange={(e) => setLine(i, { attr: e.target.value || undefined })} />
                </td>
                <td>
                  <input className="form-control" type="number" aria-label="Min qty" value={l.minQty ?? ''} onChange={(e) => setLine(i, { minQty: num(e.target.value) })} />
                </td>
                <td>
                  <input className="form-control" type="number" aria-label="Min annual qty" value={l.minAnnualQty ?? ''} onChange={(e) => setLine(i, { minAnnualQty: num(e.target.value) })} />
                </td>
                <td>
                  <input className="form-control" type="number" aria-label="Price" value={l.price ?? ''} onChange={(e) => setLine(i, { price: num(e.target.value) })} />
                </td>
                <td>
                  <input className="form-control" type="number" aria-label="Discount" value={l.discountPct ?? ''} onChange={(e) => setLine(i, { discountPct: num(e.target.value) })} />
                </td>
                <td>
                  <input className="form-control" type="number" aria-label="Rush days" value={l.maxLeadDays ?? ''} onChange={(e) => setLine(i, { maxLeadDays: num(e.target.value) })} />
                </td>
                <td>
                  <input className="form-control" type="number" aria-label="Premium" value={l.premiumPct ?? ''} onChange={(e) => setLine(i, { premiumPct: num(e.target.value) })} />
                </td>
                <td>
                  <button type="button" className="sx-icon-btn" aria-label="Remove line" onClick={() => setD({ ...d, lines: d.lines.filter((_, j) => j !== i) })}>
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, lines: [...d.lines, { sku: '' }] })}>
        <Plus size={14} /> Add line
      </button>
    </Modal>
  );
};

const MassUpdate: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, massUpdatePrices } = useCommercial();
  const [o, setO] = useState({ target: 'PRODUCTS', category: '', mode: 'PCT' as 'PCT' | 'AMOUNT', value: 5, note: '' });
  const cats = [...new Set(state.products.map((p) => p.category))];
  return (
    <Modal
      size="md"
      title="Mass price update"
      subtitle="Raise or cut list prices or a price list in one go; every change is kept in the price history"
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => massUpdatePrices(o).ok && onClose()}>
            Apply
          </button>
        </>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Field label="Update">
          <select className="form-control" value={o.target} onChange={(e) => setO({ ...o, target: e.target.value })}>
            <option value="PRODUCTS">Product list prices</option>
            {state.priceLists
              .filter((x) => x.status !== 'RETIRED')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Category">
          <select className="form-control" value={o.category} onChange={(e) => setO({ ...o, category: e.target.value })}>
            <option value="">All categories</option>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Change by">
          <select className="form-control" value={o.mode} onChange={(e) => setO({ ...o, mode: e.target.value as 'PCT' | 'AMOUNT' })}>
            <option value="PCT">Percentage</option>
            <option value="AMOUNT">Amount (KES)</option>
          </select>
        </Field>
        <Field label={o.mode === 'PCT' ? 'Percent (negative to cut)' : 'KES (negative to cut)'}>
          <input className="form-control" type="number" value={o.value} onChange={(e) => setO({ ...o, value: Number(e.target.value) })} />
        </Field>
        <Field label="Reason" span={2}>
          <input className="form-control" value={o.note} onChange={(e) => setO({ ...o, note: e.target.value })} placeholder="e.g. Auction prices up 6% this quarter" />
        </Field>
      </div>
    </Modal>
  );
};

const PriceSimulator: React.FC = () => {
  const { state } = useCommercial();
  const [c, setC] = useState({ customerId: '', sku: '', qty: 10, date: TODAY, shipDate: addDays(TODAY, 7), uom: '', shipTo: '' });
  const r = c.customerId && c.sku ? resolvePrice(state, { ...c, uom: c.uom || undefined, shipTo: c.shipTo || undefined }) : null;
  return (
    <Panel title="Price simulator" subtitle="What the engine would charge, and which rule wins">
      <div className="sx-grid">
        <Field label="Customer" span={2}>
          <PartySelect kind="CUSTOMER" value={c.customerId} onChange={(v) => setC({ ...c, customerId: v })} />
        </Field>
        <Field label="Product">
          <select className="form-control" value={c.sku} onChange={(e) => setC({ ...c, sku: e.target.value })}>
            <option value="">Choose…</option>
            {state.products
              .filter((p) => p.kind !== 'MATERIAL')
              .map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} · {p.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Quantity">
          <input className="form-control" type="number" value={c.qty} onChange={(e) => setC({ ...c, qty: Number(e.target.value) })} />
        </Field>
        <Field label="Order date">
          <input className="form-control" type="date" value={c.date} onChange={(e) => setC({ ...c, date: e.target.value })} />
        </Field>
        <Field label="Ship date">
          <input className="form-control" type="date" value={c.shipDate} onChange={(e) => setC({ ...c, shipDate: e.target.value })} />
        </Field>
        <Field label="Unit">
          <input className="form-control" value={c.uom} onChange={(e) => setC({ ...c, uom: e.target.value })} placeholder="default" />
        </Field>
        <Field label="Ship-to">
          <input className="form-control" value={c.shipTo} onChange={(e) => setC({ ...c, shipTo: e.target.value })} placeholder="ship-to id or town" />
        </Field>
      </div>
      {r && (
        <>
          <div className="sx-amount-hero">
            <div>
              <span>Net unit price</span>
              <strong>{kes(r.net)}</strong>
            </div>
            <div>
              <span>Rule applied</span>
              <b>{r.ruleLabel}</b>
            </div>
            <div>
              <span>List price</span>
              <b>{kes(r.listPrice)}</b>
            </div>
          </div>
          <ul className="sx-list">
            {r.candidates.map((x) => (
              <li key={x.id}>
                <span>{x.label}</span>
                <b>{kes(x.net)}</b>
                <span className="sx-muted">{x.id === r.ruleId ? 'applied' : ''}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
};
