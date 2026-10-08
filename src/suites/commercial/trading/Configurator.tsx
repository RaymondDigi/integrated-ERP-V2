import React, { useState } from 'react';
import { Plus, Trash2, FlaskConical, Factory } from 'lucide-react';
import { useCommercial } from '../store';
import { kes, round2, addDays, TODAY } from '../../finance/engine';
import type { BlendComponent, BlendConfig } from '../tradeTypes';
import { DataTable, DefList, Field, Panel, Stat, SuitePage, type Column } from '../../ui/kit';
import { PartySelect } from '../parts';
import { blendCost, blendLeadDays, blendRuleErrors, FLAVOURS, PACK_KG, PACK_LINE, PACK_SIZES, priceForMargin, TEA_GRADES, TEA_ORIGINS } from '../tradeEngine';
import { NotesPanel } from './OrderExtras';

type Draft = Omit<BlendConfig, 'id' | 'number' | 'unitCost' | 'unitPrice' | 'createdBy' | 'at' | 'notes'> & { id?: string };
const blank = (): Draft => {
  const pl = PACK_LINE['250 g packet'];
  return {
    name: '',
    attributes: { grade: 'BP1', origin: 'Kericho', packSize: '250 g packet', flavour: 'Plain' },
    components: [{ grade: 'BP1', origin: 'Kericho', pct: 100, costPerKg: 350 }],
    packaging: [{ sku: 'PKG-FLM', qtyPerUnit: 0.0005 }],
    kgPerUnit: PACK_KG['250 g packet'],
    line: pl.line,
    batchSize: pl.batchSize,
    hoursPerBatch: pl.hours,
    marginPct: 30
  };
};

/** Blend-to-order configurator: attributes, component teas, packaging, rules, cost-plus price and production lead time. */
export const ConfiguratorPage: React.FC = () => {
  const { state, party, saveBlend, addBlendToDoc } = useCommercial();
  const [d, setD] = useState<Draft>(blank);
  const [qty, setQty] = useState(1000);
  const [target, setTarget] = useState('');
  const errs = blendRuleErrors(d.attributes, d.components);
  const cost = blendCost(d.components, d.kgPerUnit, d.packaging, state.products, d.batchSize, d.hoursPerBatch);
  const price = priceForMargin(cost, d.marginPct);
  const lead = blendLeadDays(qty, d.batchSize, d.hoursPerBatch);
  const setPack = (packSize: string) => {
    const pl = PACK_LINE[packSize];
    setD({ ...d, attributes: { ...d.attributes, packSize }, kgPerUnit: PACK_KG[packSize], line: pl.line, batchSize: pl.batchSize, hoursPerBatch: pl.hours });
  };
  const setComp = (i: number, patch: Partial<BlendComponent>) => setD({ ...d, components: d.components.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const docs = [
    ...state.quotations.filter((q) => q.status === 'DRAFT' || q.status === 'SENT').map((q) => ({ v: `quote:${q.id}`, label: `${q.number} · ${party(q.customerId)?.name}` })),
    ...state.orders.filter((o) => o.status === 'DRAFT' || o.status === 'REJECTED').map((o) => ({ v: `order:${o.id}`, label: `${o.number} · ${party(o.customerId)?.name}` }))
  ];
  const cols: Column<BlendConfig>[] = [
    { key: 'n', header: 'Blend', render: (b) => <b className="sx-mono">{b.number}</b>, sort: (b) => b.number },
    { key: 'm', header: 'Name', render: (b) => b.name, sort: (b) => b.name },
    { key: 'c', header: 'For', render: (b) => (b.customerId ? party(b.customerId)?.name : 'Any customer') },
    { key: 'a', header: 'Pack / flavour', render: (b) => `${b.attributes.packSize} · ${b.attributes.flavour}`, hideOnMobile: true },
    { key: 'u', header: 'Unit cost', render: (b) => kes(b.unitCost), align: 'right' },
    { key: 'p', header: 'Price', render: (b) => kes(b.unitPrice), align: 'right' }
  ];
  return (
    <SuitePage eyebrow="Tea" title="Blend configurator" subtitle="Build a customer's blend from grades and origins; the rules check it, the cost and price are worked out and the production line and lead time chosen.">
      <div className="sx-stats">
        <Stat label="Configured blends" value={state.blends.length} icon={<FlaskConical size={17} />} />
        <Stat label="Unit cost" value={kes(cost)} detail="Tea + packaging + line conversion" icon={<Factory size={17} />} tone="blue" />
        <Stat label="Price at target margin" value={kes(price)} detail={`${d.marginPct}% margin`} icon={<FlaskConical size={17} />} tone="gold" />
        <Stat label="Lead time" value={`${lead} days`} detail={`${qty} units on ${d.line}`} icon={<Factory size={17} />} tone="violet" />
      </div>
      <Panel title={d.id ? 'Edit blend' : 'New blend'} subtitle="Attributes drive the packing line, batch size and rules">
        <div className="sx-grid">
          <Field label="Blend name" required span={2}>
            <input className="form-control" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </Field>
          <Field label="For customer" span={2}>
            <PartySelect kind="CUSTOMER" value={d.customerId ?? ''} onChange={(v) => setD({ ...d, customerId: v || undefined })} />
          </Field>
          <Field label="Main grade">
            <select className="form-control" value={d.attributes.grade} onChange={(e) => setD({ ...d, attributes: { ...d.attributes, grade: e.target.value } })}>
              {TEA_GRADES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Origin">
            <select className="form-control" value={d.attributes.origin} onChange={(e) => setD({ ...d, attributes: { ...d.attributes, origin: e.target.value } })}>
              {TEA_ORIGINS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Pack size">
            <select className="form-control" value={d.attributes.packSize} onChange={(e) => setPack(e.target.value)}>
              {PACK_SIZES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Flavour">
            <select className="form-control" value={d.attributes.flavour} onChange={(e) => setD({ ...d, attributes: { ...d.attributes, flavour: e.target.value } })}>
              {FLAVOURS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Target margin %">
            <input className="form-control" type="number" value={d.marginPct} onChange={(e) => setD({ ...d, marginPct: Number(e.target.value) })} />
          </Field>
          <Field label="Units for lead time">
            <input className="form-control" type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </Field>
        </div>
        <h4 className="sx-subhead">Component teas</h4>
        {d.components.map((c, i) => (
          <div className="tr-row" key={i}>
            <select className="form-control" aria-label="Component grade" value={c.grade} onChange={(e) => setComp(i, { grade: e.target.value })}>
              {TEA_GRADES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
            <select className="form-control" aria-label="Component origin" value={c.origin} onChange={(e) => setComp(i, { origin: e.target.value })}>
              {TEA_ORIGINS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
            <input className="form-control" type="number" aria-label="Percent" value={c.pct} onChange={(e) => setComp(i, { pct: Number(e.target.value) })} />
            <input className="form-control" type="number" aria-label="Cost per kg" value={c.costPerKg} onChange={(e) => setComp(i, { costPerKg: Number(e.target.value) })} />
            <button type="button" className="sx-icon-btn" aria-label="Remove component" onClick={() => setD({ ...d, components: d.components.filter((_, j) => j !== i) })}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, components: [...d.components, { grade: 'PF1', origin: 'Nandi', pct: 0, costPerKg: 330 }] })}>
          <Plus size={14} /> Add component
        </button>
        {errs.length > 0 ? (
          <div className="sx-callout warn">
            <div>
              <b>Configuration rules</b>
              {errs.map((e) => (
                <span key={e}>• {e}</span>
              ))}
            </div>
          </div>
        ) : (
          <p className="tr-badge good">All configuration rules pass</p>
        )}
        <DefList
          items={[
            ['Packing line', d.line],
            ['Batch', `${d.batchSize} units in ${d.hoursPerBatch} h`],
            ['Tea per unit', `${d.kgPerUnit} kg`],
            ['Tea cost per unit', kes(round2(d.components.reduce((x, c) => x + (c.pct / 100) * c.costPerKg, 0) * d.kgPerUnit))],
            ['Earliest ready date', addDays(TODAY, lead)]
          ]}
        />
        <div className="tr-row">
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setD(blank())}>
            Clear
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const r = saveBlend(d);
              if (r.ok && r.id) setD({ ...d, id: r.id });
            }}
          >
            Save blend
          </button>
        </div>
      </Panel>
      {d.id && (
        <Panel title="Use this blend" subtitle="Add it as a line on a draft quotation or order, priced and dated by the configurator">
          <div className="tr-row">
            <select className="form-control grow" aria-label="Quotation or order" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose a draft quotation or order…</option>
              {docs.map((x) => (
                <option key={x.v} value={x.v}>
                  {x.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => target && addBlendToDoc(d.id!, target.split(':')[0] as 'quote' | 'order', target.split(':')[1], qty)}>
              Add {qty} units
            </button>
          </div>
          <NotesPanel kind="blend" id={d.id} notes={state.blends.find((b) => b.id === d.id)?.notes ?? []} />
        </Panel>
      )}
      <DataTable
        rows={state.blends}
        columns={cols}
        rowKey={(b) => b.id}
        onRowClick={(b) => setD({ id: b.id, name: b.name, customerId: b.customerId, attributes: { ...b.attributes }, components: b.components.map((c) => ({ ...c })), packaging: b.packaging, kgPerUnit: b.kgPerUnit, line: b.line, batchSize: b.batchSize, hoursPerBatch: b.hoursPerBatch, marginPct: b.marginPct })}
        selected={d.id ?? null}
      />
    </SuitePage>
  );
};
