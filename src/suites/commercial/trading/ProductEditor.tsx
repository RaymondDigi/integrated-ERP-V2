import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useCommercial } from '../store';
import { fmtDate, kes } from '../../finance/engine';
import type { Product } from '../types';
import { DefList, Field, Modal } from '../../ui/kit';
import { ImportCsvButton } from '../../../platform/Widgets';
import { TEA_GRADES } from '../tradeEngine';

const csv = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
const blank = (): Product => ({ sku: '', name: '', kind: 'GOODS', category: 'Packed tea', unit: 'cartons', price: 0, cost: 0, stock: 0, reorderLevel: 0, reorderQty: 0, vatable: true, account: '4000', status: 'ACTIVE' });

/** Product master editor: barcodes, status, units of measure, substitutes and complements, attributes, image. */
export const ProductEditor: React.FC<{ product: Product | null; onClose: () => void }> = ({ product, onClose }) => {
  const { state, saveProduct } = useCommercial();
  const [p, setP] = useState<Product>(() => (product ? structuredClone(product) : blank()));
  const [note, setNote] = useState('');
  const set = (patch: Partial<Product>) => setP({ ...p, ...patch });
  const others = state.products.filter((x) => x.sku !== p.sku && x.kind !== 'MATERIAL');
  return (
    <Modal
      size="xl"
      title={product ? `Edit ${product.sku}` : 'New product'}
      subtitle="Price, cost and status changes are made by the Commercial Manager and kept in the price history"
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => saveProduct(p, !product, note).ok && onClose()}>
            Save product
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="SKU" required>
          <input className="form-control" value={p.sku} disabled={!!product} onChange={(e) => set({ sku: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Name" required span={2}>
          <input className="form-control" value={p.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className="form-control" value={p.status ?? 'ACTIVE'} onChange={(e) => set({ status: e.target.value as Product['status'] })}>
            <option value="ACTIVE">Active</option>
            <option value="PROVISIONAL">Provisional</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </Field>
        <Field label="Category">
          <input className="form-control" value={p.category} onChange={(e) => set({ category: e.target.value })} />
        </Field>
        <Field label="Unit">
          <input className="form-control" value={p.unit} onChange={(e) => set({ unit: e.target.value })} />
        </Field>
        <Field label="List price (KES)">
          <input className="form-control" type="number" value={p.price} onChange={(e) => set({ price: Number(e.target.value) })} />
        </Field>
        <Field label="Unit cost (KES)">
          <input className="form-control" type="number" value={p.cost} onChange={(e) => set({ cost: Number(e.target.value) })} />
        </Field>
        <Field label="UPC / EAN barcode">
          <input className="form-control" value={p.upc ?? ''} onChange={(e) => set({ upc: e.target.value || undefined })} />
        </Field>
        <Field label="Other barcodes" hint="Comma separated (pack variants)">
          <input className="form-control" value={(p.barcodes ?? []).join(', ')} onChange={(e) => set({ barcodes: csv(e.target.value) })} />
        </Field>
        <Field label="Weight per unit (kg)">
          <input className="form-control" type="number" value={p.weightKg ?? ''} onChange={(e) => set({ weightKg: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
        <Field label="Export certificate needed">
          <input className="form-control" value={p.requiresCert ?? ''} onChange={(e) => set({ requiresCert: e.target.value || undefined })} placeholder="e.g. MRL" />
        </Field>
        <Field label="Reorder level">
          <input className="form-control" type="number" value={p.reorderLevel} onChange={(e) => set({ reorderLevel: Number(e.target.value) })} />
        </Field>
        <Field label="Image URL">
          <input className="form-control" value={p.imageUrl ?? ''} onChange={(e) => set({ imageUrl: e.target.value || undefined })} />
        </Field>
        <Field label="Grade">
          <select className="form-control" value={p.attributes?.grade ?? ''} onChange={(e) => set({ attributes: { ...p.attributes, grade: e.target.value || undefined } })}>
            <option value="">—</option>
            {TEA_GRADES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
        <Field label="Garden / origin">
          <input className="form-control" value={p.attributes?.garden ?? ''} onChange={(e) => set({ attributes: { ...p.attributes, garden: e.target.value || undefined } })} />
        </Field>
        <Field label="Pack size">
          <input className="form-control" value={p.attributes?.packSize ?? ''} onChange={(e) => set({ attributes: { ...p.attributes, packSize: e.target.value || undefined } })} />
        </Field>
        <Field label="Reason for change">
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shown in the price history" />
        </Field>
      </div>
      <label className="sx-check">
        <input type="checkbox" checked={p.vatable} onChange={(e) => set({ vatable: e.target.checked })} /> VAT 16%
      </label>
      <h4 className="sx-subhead">Other units of measure</h4>
      {(p.uomPrices ?? []).map((u, i) => (
        <div className="tr-row" key={i}>
          <input className="form-control" aria-label="Unit" placeholder="Unit e.g. kg" value={u.uom} onChange={(e) => set({ uomPrices: p.uomPrices!.map((x, j) => (j === i ? { ...x, uom: e.target.value } : x)) })} />
          <input className="form-control" type="number" aria-label="Factor" placeholder="Base units per unit" value={u.factor} onChange={(e) => set({ uomPrices: p.uomPrices!.map((x, j) => (j === i ? { ...x, factor: Number(e.target.value) } : x)) })} />
          <input className="form-control" type="number" aria-label="Unit price" value={u.price} onChange={(e) => set({ uomPrices: p.uomPrices!.map((x, j) => (j === i ? { ...x, price: Number(e.target.value) } : x)) })} />
          <button type="button" className="sx-icon-btn" aria-label="Remove unit" onClick={() => set({ uomPrices: p.uomPrices!.filter((_, j) => j !== i) })}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ uomPrices: [...(p.uomPrices ?? []), { uom: '', factor: 1, price: 0 }] })}>
        <Plus size={13} /> Add unit
      </button>
      <h4 className="sx-subhead">Substitutes and complements</h4>
      <Field label="Substitutes (offered when out of stock)">
        <select className="form-control" multiple value={p.substitutes ?? []} onChange={(e) => set({ substitutes: [...e.target.selectedOptions].map((o) => o.value) })} style={{ minHeight: 90 }}>
          {others.map((x) => (
            <option key={x.sku} value={x.sku}>
              {x.sku} · {x.name}
            </option>
          ))}
        </select>
      </Field>
      {(p.complements ?? []).map((c, i) => (
        <div className="tr-row" key={i}>
          <select className="form-control" aria-label="Complement" value={c.sku} onChange={(e) => set({ complements: p.complements!.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)) })}>
            <option value="">Product…</option>
            {others.map((x) => (
              <option key={x.sku} value={x.sku}>
                {x.sku} · {x.name}
              </option>
            ))}
          </select>
          <input className="form-control grow" aria-label="Sales script" placeholder="What to say, e.g. Most buyers add sugar sachets" value={c.script} onChange={(e) => set({ complements: p.complements!.map((x, j) => (j === i ? { ...x, script: e.target.value } : x)) })} />
          <button type="button" className="sx-icon-btn" aria-label="Remove complement" onClick={() => set({ complements: p.complements!.filter((_, j) => j !== i) })}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ complements: [...(p.complements ?? []), { sku: '', script: '' }] })}>
        <Plus size={13} /> Add complementary item
      </button>
    </Modal>
  );
};

/** Price history, units and related items shown in the product drawer. */
export const ProductExtras: React.FC<{ p: Product }> = ({ p }) => {
  const { state } = useCommercial();
  const name = (sku: string) => state.products.find((x) => x.sku === sku)?.name ?? sku;
  return (
    <>
      <DefList
        items={[
          ['Status', p.status ?? 'ACTIVE'],
          ['Barcode', [p.upc, ...(p.barcodes ?? [])].filter(Boolean).join(', ') || '—'],
          ['Other units', (p.uomPrices ?? []).map((u) => `${u.uom} (${u.factor}) ${kes(u.price)}`).join(' · ') || '—'],
          ['Substitutes', (p.substitutes ?? []).map(name).join(', ') || '—'],
          ['Complements', (p.complements ?? []).map((c) => name(c.sku)).join(', ') || '—'],
          ['Attributes', Object.entries(p.attributes ?? {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—']
        ]}
      />
      {(p.priceHistory ?? []).length > 0 && (
        <>
          <h4 className="sx-subhead">Price history</h4>
          <ul className="sx-list">
            {[...(p.priceHistory ?? [])].reverse().map((h, i) => (
              <li key={i}>
                <span className="sx-muted">{fmtDate(h.from)}</span>
                <b>{kes(h.price)}</b>
                <span className="sx-muted">{h.note}</span>
                <span>{h.by}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
};

/** Bulk-load products from a spreadsheet (each row goes through the same checks as the editor). */
export const ProductImport: React.FC = () => {
  const { saveProduct } = useCommercial();
  return (
    <ImportCsvButton
      label="Import products"
      template={['sku', 'name', 'category', 'unit', 'price', 'cost']}
      onImport={(rows) => {
        const errors: string[] = [];
        let imported = 0;
        rows.forEach((r, i) => {
          const res = saveProduct({ ...blank(), sku: (r.sku ?? '').toUpperCase(), name: r.name ?? '', category: r.category || 'Packed tea', unit: r.unit || 'units', price: Number(r.price) || 0, cost: Number(r.cost) || 0, upc: r.upc || undefined, weightKg: r.weightKg ? Number(r.weightKg) : undefined }, true, 'Imported');
          if (res.ok) imported++;
          else errors.push(`Row ${i + 2}: ${res.error}`);
        });
        return { imported, errors };
      }}
    />
  );
};
