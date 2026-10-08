import React, { useEffect, useMemo, useState } from 'react';
import { AlarmClock, Archive, ArrowLeftRight, Boxes, ClipboardCheck, PackageMinus, PackagePlus, Plus, ScanLine, Tag, Trash2, Warehouse } from 'lucide-react';
import { useCommercial } from '../store';
import { fmtDate, kes, round2, TODAY } from '../../finance/engine';
import { DEPARTMENTS } from '../../finance/data';
import { ExportCsvButton, PrintButton, esc } from '../../../platform/Widgets';
import { DataTable, DefList, Drawer, Empty, Field, Modal, Pill, SearchBox, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { useProcurementExt } from './ext/store';
import { AGE_BUCKETS, dueCounts, stockAging } from './ext/engine';
import { Barcode, barcodeSvg, docHtml, label, ReadOnlyNote, Tabs, TONE } from './ext/ui';
import type { Condition, Disposal, InvMove, ItemExt, Lot, MoveKind, WarehouseConfig } from './ext/types';
import type { Product } from '../types';

type ITab = 'items' | 'lots' | 'warehouses' | 'movements' | 'aging' | 'counts' | 'disposals';
const CONDITIONS: Condition[] = ['NEW', 'GOOD', 'DAMAGED', 'QUARANTINE', 'OBSOLETE'];
const COND_TONE: Record<Condition, string> = { NEW: 'ACTIVE', GOOD: 'APPROVED', DAMAGED: 'OVERDUE', QUARANTINE: 'SUBMITTED', OBSOLETE: 'VOID' };
const MOVE_LABEL: Record<MoveKind, string> = {
  RECEIPT: 'Receipt',
  ISSUE: 'Issue',
  RETURN: 'Return to stores',
  MISC_ISSUE: 'Miscellaneous issue',
  ADJUSTMENT: 'Adjustment',
  CONDITION: 'Condition change',
  TRANSFER: 'Location move',
  DISPOSAL: 'Disposal',
  RETURN_TO_SUPPLIER: 'Return to supplier',
  REVERSAL: 'Receipt reversal'
};
const COST_CENTRES = ['Blending line 1', 'Blending line 2', 'Packing hall', 'Tea tasting room', 'Workshop', ...DEPARTMENTS];

/** Shared stock-control hooks for the inventory pages. */
const useInv = () => {
  const ext = useProcurementExt();
  const com = useCommercial();
  const products = com.state.products.filter((p) => p.kind !== 'SERVICE');
  const item = (sku: string) => ext.state.items.find((i) => i.sku === sku);
  const product = (sku: string) => com.state.products.find((p) => p.sku === sku);
  const wh = (id: string) => ext.state.warehouses.find((w) => w.id === id);
  return { ext, com, products, item, product, wh };
};

export const InventoryPage: React.FC = () => {
  const { ext, products } = useInv();
  const [tab, setTab] = useState<ITab>('items');
  const [openSku, setOpenSku] = useState<string | null>(null);
  const [openLot, setOpenLot] = useState<string | null>(null);
  const [moveKind, setMoveKind] = useState<'ISSUE' | 'RETURN' | 'ADJUST' | null>(null);
  const [adding, setAdding] = useState(false);
  const [scan, setScan] = useState('');
  useEffect(() => {
    const f = ext.page?.focus;
    if (!f) return;
    if (['items', 'lots', 'warehouses', 'movements', 'aging', 'counts', 'disposals'].includes(f)) setTab(f as ITab);
    else if (ext.state.lots.some((l) => l.id === f)) setOpenLot(f);
    else setOpenSku(f);
  }, [ext.page, ext.state.lots]);
  const s = ext.state;
  const value = round2(products.reduce((a, p) => a + p.stock * p.cost, 0));
  const pending = s.moves.filter((m) => m.status === 'PENDING').length;
  const blocked = s.lots.filter((l) => l.qty > 0 && (l.condition === 'QUARANTINE' || l.condition === 'DAMAGED')).length;
  const due = dueCounts(s, products);
  const lookup = () => {
    const q = scan.trim().toUpperCase();
    if (!q) return;
    const it = s.items.find((i) => i.barcode.toUpperCase() === q || i.sku.toUpperCase() === q);
    const lot = s.lots.find((l) => l.lot.toUpperCase() === q || l.serial?.toUpperCase() === q);
    if (it) setOpenSku(it.sku);
    else if (lot) setOpenLot(lot.id);
    else ext.ctx.warn('Not found', `No item, lot or serial matches "${scan}"`);
    setScan('');
  };
  return (
    <SuitePage
      eyebrow="Stores"
      title="Inventory control"
      subtitle="Item master, lots and serials by warehouse and bin, issues and returns, aging and valuation, cycle counts and disposal."
      actions={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMoveKind('ISSUE')}>
            <PackageMinus size={15} /> Issue stock
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMoveKind('RETURN')}>
            <PackagePlus size={15} /> Return to stores
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={15} /> New item
          </button>
        </>
      }
    >
      <ReadOnlyNote show={ext.readOnly} />
      <div className="sx-stats">
        <Stat label="Stock value" value={kes(value, { compact: true })} detail="Moving weighted average cost" icon={<Boxes size={17} />} onClick={() => setTab('aging')} />
        <Stat label="Issues to approve" value={pending} detail="Miscellaneous issues over the limit" icon={<ClipboardCheck size={17} />} tone={pending ? 'gold' : 'green'} onClick={() => setTab('movements')} />
        <Stat label="Blocked lots" value={blocked} detail="Quarantined or damaged" icon={<Archive size={17} />} tone={blocked ? 'red' : 'green'} onClick={() => setTab('lots')} />
        <Stat label="Counts due" value={due.schedules.filter((x) => x.overdue).length + due.items.length} detail="Schedules and items within 7 days" icon={<AlarmClock size={17} />} tone="blue" onClick={() => setTab('counts')} />
      </div>
      <div className="prx-inline">
        <ScanLine size={16} />
        <input
          className="form-control"
          style={{ maxWidth: 320 }}
          placeholder="Scan or type a barcode, SKU, lot or serial"
          aria-label="Scan barcode"
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
        />
        <button type="button" className="btn btn-secondary btn-sm" onClick={lookup}>
          Look up
        </button>
        <span className="sx-grow" />
        <label className="prx-inline">
          <input type="checkbox" checked={s.settings.autoReorder} disabled={ext.readOnly} onChange={(e) => ext.plan.saveSettings({ autoReorder: e.target.checked })} /> Automatic reorder
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.inventory.autoReorder(false)}>
          Run reorder now
        </button>
        {ext.actor.role === 'MANAGER' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMoveKind('ADJUST')}>
            Adjust stock
          </button>
        )}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ['items', 'Items', products.length],
          ['lots', 'Lots & serials', s.lots.filter((l) => l.qty > 0).length],
          ['warehouses', 'Warehouses & bins', s.warehouses.length],
          ['movements', 'Movements', s.moves.length],
          ['aging', 'Aging & valuation'],
          ['counts', 'Cycle counts'],
          ['disposals', 'Disposals', s.disposals.length]
        ]}
      />
      {tab === 'items' && <ItemsTab onOpen={setOpenSku} />}
      {tab === 'lots' && <LotsTab onOpen={setOpenLot} />}
      {tab === 'warehouses' && <WarehousesTab />}
      {tab === 'movements' && <MovementsTab />}
      {tab === 'aging' && <AgingTab />}
      {tab === 'counts' && <CountsTab />}
      {tab === 'disposals' && <DisposalsTab />}
      {openSku && <ItemDrawer sku={openSku} onClose={() => setOpenSku(null)} onLot={setOpenLot} />}
      {openLot && <LotDrawer id={openLot} onClose={() => setOpenLot(null)} />}
      {moveKind && <MoveModal kind={moveKind} onClose={() => setMoveKind(null)} />}
      {adding && <NewItemModal onClose={() => setAdding(false)} onDone={(sku) => (setAdding(false), setOpenSku(sku))} />}
    </SuitePage>
  );
};

/* ---------------- Items ---------------- */

const ItemsTab: React.FC<{ onOpen: (sku: string) => void }> = ({ onOpen }) => {
  const { ext, products, item } = useInv();
  const [q, setQ] = useState('');
  const rows = products.filter((p) => !q || `${p.sku} ${p.name} ${p.category} ${item(p.sku)?.barcode ?? ''} ${item(p.sku)?.tags.join(' ') ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const columns: Column<Product>[] = [
    { key: 'sku', header: 'Item', render: (p) => <div className="sx-cell-main"><b>{p.name}</b><small className="sx-mono">{p.sku} · {item(p.sku)?.barcode ?? 'no barcode'}</small></div>, sort: (p) => p.sku },
    { key: 'cat', header: 'Category', render: (p) => p.category, sort: (p) => p.category, hideOnMobile: true },
    { key: 'uom', header: 'Units', render: (p) => { const it = item(p.sku); return it && it.factor !== 1 ? `Buy ${it.purchaseUnit} = ${it.factor} ${p.unit}` : p.unit; }, hideOnMobile: true },
    { key: 'wh', header: 'Receives into', render: (p) => `${item(p.sku)?.defaultWarehouse ?? 'WH-NBO'}${item(p.sku)?.defaultBin ? ` · ${item(p.sku)?.defaultBin}` : ''}`, hideOnMobile: true },
    { key: 'st', header: 'On hand', render: (p) => `${p.stock.toLocaleString()} ${p.unit}`, sort: (p) => p.stock, align: 'right' },
    { key: 'v', header: 'Value', render: (p) => kes(round2(p.stock * p.cost)), sort: (p) => p.stock * p.cost, align: 'right' },
    { key: 'a', header: 'Status', render: (p) => (item(p.sku)?.active === false ? <Pill status="VOID" label="Inactive" /> : p.stock < p.reorderLevel ? <Pill status="OVERDUE" label="Reorder" /> : <Pill status="ACTIVE" label={`Class ${item(p.sku)?.abc ?? 'C'}`} />) }
  ];
  return (
    <>
      <div className="sx-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search items, tags, barcodes…" />
        <ExportCsvButton name="item-master" header={['SKU', 'Name', 'Category', 'Unit', 'Purchase unit', 'Factor', 'Barcode', 'Default warehouse', 'Default bin', 'ABC', 'Count every (days)', 'On hand', 'Unit cost', 'Active']} rows={() => rows.map((p) => { const it = item(p.sku); return [p.sku, p.name, p.category, p.unit, it?.purchaseUnit ?? p.unit, it?.factor ?? 1, it?.barcode ?? '', it?.defaultWarehouse ?? '', it?.defaultBin ?? '', it?.abc ?? '', it?.countEveryDays ?? '', p.stock, p.cost, it?.active === false ? 'No' : 'Yes']; })} />
        <PrintButton label="Print labels" title="Item labels" html={() => `<h1>Item labels</h1><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">${rows.map((p) => `<div style="border:1px solid #ccc;padding:8px"><b>${esc(p.name)}</b><br/>${barcodeSvg(item(p.sku)?.barcode ?? p.sku)}</div>`).join('')}</div>`} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(p) => p.sku} onRowClick={(p) => onOpen(p.sku)} empty={<Empty icon={<Boxes size={20} />} title="No items match" />} />
      {ext.readOnly && <p className="sx-muted">Read-only: item records cannot be changed.</p>}
    </>
  );
};

const ItemDrawer: React.FC<{ sku: string; onClose: () => void; onLot: (id: string) => void }> = ({ sku, onClose, onLot }) => {
  const { ext, product, item } = useInv();
  const p = product(sku);
  const cur = item(sku);
  const [d, setD] = useState<ItemExt>(cur ?? { sku, barcode: `KE${sku.replace(/[^A-Z0-9]/gi, '')}`, tags: [], purchaseUnit: p?.unit ?? 'unit', factor: 1, defaultWarehouse: 'WH-NBO', countEveryDays: 90, abc: 'C', lotTracked: false, serialTracked: false, active: true });
  const [tags, setTags] = useState(d.tags.join(', '));
  if (!p) return null;
  const lots = ext.state.lots.filter((l) => l.sku === sku && l.qty > 0);
  const bins = ext.state.warehouses.find((w) => w.id === d.defaultWarehouse)?.bins ?? [];
  const moves = ext.state.moves.filter((m) => m.sku === sku).slice(0, 12);
  return (
    <Drawer
      wide
      title={p.name}
      subtitle={`${p.sku} · ${p.category} · ${p.stock.toLocaleString()} ${p.unit} on hand at ${kes(p.cost)} each`}
      badge={<Barcode value={d.barcode || sku} height={28} />}
      onClose={onClose}
      footer={
        <>
          <PrintButton label="Print label" title={`Label ${p.sku}`} html={() => `<div style="border:1px solid #000;padding:12px;width:320px"><b>${esc(p.name)}</b><br/>${esc(p.sku)} · ${esc(p.unit)}<br/>${barcodeSvg(d.barcode || sku)}</div>`} />
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" disabled={ext.readOnly} onClick={() => ext.inventory.saveItem(sku, { ...d, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) }).ok && onClose()}>
            Save item
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Barcode" required>
          <input className="form-control" value={d.barcode} onChange={(e) => setD({ ...d, barcode: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Tags" hint="Comma separated, used by catalogue search">
          <input className="form-control" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <Field label="Purchase unit" hint={`Stock is kept in ${p.unit}`}>
          <input className="form-control" value={d.purchaseUnit} onChange={(e) => setD({ ...d, purchaseUnit: e.target.value })} />
        </Field>
        <Field label={`${p.unit} per purchase unit`} required>
          <input className="form-control" type="number" min="0" step="any" value={d.factor} onChange={(e) => setD({ ...d, factor: Number(e.target.value) })} />
        </Field>
        <Field label="Default receiving warehouse">
          <select className="form-control" value={d.defaultWarehouse} onChange={(e) => setD({ ...d, defaultWarehouse: e.target.value, defaultBin: undefined })}>
            {ext.state.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default bin">
          <select className="form-control" value={d.defaultBin ?? ''} onChange={(e) => setD({ ...d, defaultBin: e.target.value || undefined })}>
            <option value="">First free bin</option>
            {bins.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </Field>
        <Field label="ABC class">
          <select className="form-control" value={d.abc} onChange={(e) => setD({ ...d, abc: e.target.value as ItemExt['abc'] })}>
            <option>A</option>
            <option>B</option>
            <option>C</option>
          </select>
        </Field>
        <Field label="Count every (days)" hint={d.lastCounted ? `Last counted ${fmtDate(d.lastCounted)}` : 'Never counted'}>
          <input className="form-control" type="number" min="1" value={d.countEveryDays} onChange={(e) => setD({ ...d, countEveryDays: Number(e.target.value) })} />
        </Field>
        <Field label="Shelf life (days)" hint="Sets the expiry on receipt when the supplier gives none">
          <input className="form-control" type="number" min="0" value={d.shelfLifeDays ?? ''} onChange={(e) => setD({ ...d, shelfLifeDays: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
        <Field label="Tracking">
          <label className="prx-inline">
            <input type="checkbox" checked={d.lotTracked} onChange={(e) => setD({ ...d, lotTracked: e.target.checked })} /> Lots
          </label>
          <label className="prx-inline">
            <input type="checkbox" checked={d.serialTracked} onChange={(e) => setD({ ...d, serialTracked: e.target.checked })} /> Serial numbers
          </label>
          <label className="prx-inline">
            <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} /> Active
          </label>
        </Field>
        <Field label="Specification" span={2}>
          <textarea className="form-control" rows={2} value={d.spec ?? ''} onChange={(e) => setD({ ...d, spec: e.target.value })} />
        </Field>
      </div>
      <h3>Lots on hand</h3>
      {lots.length ? (
        <table className="sx-table">
          <thead>
            <tr>
              <th>Lot / serial</th>
              <th>Where</th>
              <th>Expiry</th>
              <th>Condition</th>
              <th className="r">Qty</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.id} onClick={() => onLot(l.id)} style={{ cursor: 'pointer' }}>
                <td className="sx-mono">{l.lot}{l.serial ? ` · ${l.serial}` : ''}</td>
                <td>{l.warehouse} · {l.bin}</td>
                <td>{l.expiry ? fmtDate(l.expiry) : '—'}</td>
                <td><Pill status={COND_TONE[l.condition]} label={label(l.condition)} /></td>
                <td className="r">{l.qty.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sx-muted">Not lot-tracked or nothing on hand.</p>
      )}
      <h3>Recent movements</h3>
      <Timeline items={moves.map((m) => ({ at: m.date, by: m.by, action: `${m.number} · ${MOVE_LABEL[m.kind]} ${m.qty}`, note: m.reason }))} />
    </Drawer>
  );
};

const NewItemModal: React.FC<{ onClose: () => void; onDone: (sku: string) => void }> = ({ onClose, onDone }) => {
  const { ext, com } = useInv();
  const cats = [...new Set(com.state.products.filter((p) => p.kind === 'MATERIAL').map((p) => p.category))];
  const [p, setP] = useState<Omit<Product, 'sku' | 'stock' | 'price'>>({ name: '', kind: 'MATERIAL', category: cats[0] ?? 'Packaging', unit: 'pcs', cost: 0, reorderLevel: 0, reorderQty: 0, vatable: true, account: '5000' });
  const [x, setX] = useState({ purchaseUnit: 'pcs', factor: 1, defaultWarehouse: 'WH-NBO' });
  return (
    <Modal
      title="New catalogue item"
      subtitle="The SKU is numbered automatically from the category prefix."
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={ext.readOnly}
          onClick={() => {
            if (!p.name.trim()) return ext.ctx.fail('Name the item');
            const r = ext.inventory.addItem(p, x);
            if (r.ok && r.id) onDone(r.id);
          }}
        >
          Create item
        </button>
      }
    >
      <div className="sx-grid">
        <Field label="Name" required span={2}>
          <input className="form-control" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </Field>
        <Field label="Category">
          <input className="form-control" list="inv-cats" value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })} />
          <datalist id="inv-cats">
            {cats.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Stock unit">
          <input className="form-control" value={p.unit} onChange={(e) => setP({ ...p, unit: e.target.value })} />
        </Field>
        <Field label="Purchase unit">
          <input className="form-control" value={x.purchaseUnit} onChange={(e) => setX({ ...x, purchaseUnit: e.target.value })} />
        </Field>
        <Field label="Stock units per purchase unit">
          <input className="form-control" type="number" min="0" step="any" value={x.factor} onChange={(e) => setX({ ...x, factor: Number(e.target.value) })} />
        </Field>
        <Field label="Standard cost (KES)" required>
          <input className="form-control" type="number" min="0" value={p.cost} onChange={(e) => setP({ ...p, cost: Number(e.target.value) })} />
        </Field>
        <Field label="Expense / stock account">
          <select className="form-control" value={p.account} onChange={(e) => setP({ ...p, account: e.target.value })}>
            <option value="5000">5000 Cost of sales — materials</option>
            <option value="1200">1200 Inventory</option>
            <option value="6300">6300 Fuel & transport</option>
            <option value="6600">6600 Repairs & maintenance</option>
          </select>
        </Field>
        <Field label="Reorder level">
          <input className="form-control" type="number" min="0" value={p.reorderLevel} onChange={(e) => setP({ ...p, reorderLevel: Number(e.target.value) })} />
        </Field>
        <Field label="Reorder quantity">
          <input className="form-control" type="number" min="0" value={p.reorderQty} onChange={(e) => setP({ ...p, reorderQty: Number(e.target.value) })} />
        </Field>
        <Field label="Receives into">
          <select className="form-control" value={x.defaultWarehouse} onChange={(e) => setX({ ...x, defaultWarehouse: e.target.value })}>
            {ext.state.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
};

/* ---------------- Lots ---------------- */

const LotsTab: React.FC<{ onOpen: (id: string) => void }> = ({ onOpen }) => {
  const { ext, product } = useInv();
  const [wh, setWh] = useState('');
  const [cond, setCond] = useState('');
  const [q, setQ] = useState('');
  const rows = ext.state.lots.filter((l) => l.qty > 0 && (!wh || l.warehouse === wh) && (!cond || l.condition === cond) && (!q || `${l.sku} ${l.lot} ${l.serial ?? ''} ${l.garden ?? ''} ${l.grade ?? ''} ${product(l.sku)?.name}`.toLowerCase().includes(q.toLowerCase())));
  const columns: Column<Lot>[] = [
    { key: 'l', header: 'Lot / serial', render: (l) => <div className="sx-cell-main"><b className="sx-mono">{l.lot}</b><small>{product(l.sku)?.name}{l.serial ? ` · S/N ${l.serial}` : ''}{l.garden ? ` · ${l.garden} ${l.grade} (${l.saleNo})` : ''}</small></div>, sort: (l) => l.lot },
    { key: 'w', header: 'Warehouse · bin', render: (l) => `${l.warehouse} · ${l.bin}`, sort: (l) => `${l.warehouse}${l.bin}` },
    { key: 'r', header: 'Received', render: (l) => `${fmtDate(l.received)} · ${l.receivedRef}`, sort: (l) => l.received, hideOnMobile: true },
    { key: 'e', header: 'Expiry', render: (l) => (l.expiry ? fmtDate(l.expiry) : '—'), sort: (l) => l.expiry ?? '9999', hideOnMobile: true },
    { key: 'c', header: 'Condition', render: (l) => <Pill status={COND_TONE[l.condition]} label={label(l.condition)} />, sort: (l) => l.condition },
    { key: 'q', header: 'Qty', render: (l) => l.qty.toLocaleString(), sort: (l) => l.qty, align: 'right' }
  ];
  return (
    <>
      <div className="sx-toolbar">
        <select className="form-control" style={{ maxWidth: 220 }} value={wh} onChange={(e) => setWh(e.target.value)} aria-label="Warehouse">
          <option value="">All warehouses</option>
          {ext.state.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select className="form-control" style={{ maxWidth: 180 }} value={cond} onChange={(e) => setCond(e.target.value)} aria-label="Condition">
          <option value="">Any condition</option>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {label(c)}
            </option>
          ))}
        </select>
        <SearchBox value={q} onChange={setQ} placeholder="Lot, serial, garden, grade…" />
        <ExportCsvButton name="lots" header={['SKU', 'Lot', 'Serial', 'Warehouse', 'Bin', 'Qty', 'Received', 'Ref', 'Expiry', 'Condition', 'Unit cost', 'Garden', 'Grade', 'Sale']} rows={() => rows.map((l) => [l.sku, l.lot, l.serial ?? '', l.warehouse, l.bin, l.qty, l.received, l.receivedRef, l.expiry ?? '', l.condition, l.unitCost, l.garden ?? '', l.grade ?? '', l.saleNo ?? ''])} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(l) => l.id} onRowClick={(l) => onOpen(l.id)} empty={<Empty icon={<Tag size={20} />} title="No lots match" />} />
    </>
  );
};

const LotDrawer: React.FC<{ id: string; onClose: () => void }> = ({ id, onClose }) => {
  const { ext, product, wh } = useInv();
  const l = ext.state.lots.find((x) => x.id === id);
  const [cond, setCond] = useState<Condition>(l?.condition ?? 'GOOD');
  const [note, setNote] = useState('');
  const [mv, setMv] = useState({ qty: l?.qty ?? 0, warehouse: l?.warehouse ?? '', bin: '' });
  if (!l) return null;
  const p = product(l.sku);
  const bins = wh(mv.warehouse)?.bins ?? [];
  const moves = ext.state.moves.filter((m) => m.lotId === id);
  return (
    <Drawer title={`Lot ${l.lot}`} subtitle={`${p?.name} · ${l.qty.toLocaleString()} ${p?.unit} at ${wh(l.warehouse)?.name} ${l.bin}`} badge={<Pill status={COND_TONE[l.condition]} label={label(l.condition)} />} onClose={onClose}
      footer={<PrintButton label="Print lot label" title={`Lot ${l.lot}`} html={() => `<div style="border:1px solid #000;padding:12px;width:340px"><b>${esc(p?.name)}</b><br/>Lot ${esc(l.lot)}${l.serial ? ` · S/N ${esc(l.serial)}` : ''}<br/>${esc(l.warehouse)} · ${esc(l.bin)}${l.expiry ? ` · Exp ${esc(l.expiry)}` : ''}<br/>${barcodeSvg(l.serial ?? l.lot)}</div>`} />}
    >
      <Barcode value={l.serial ?? l.lot} />
      <DefList
        items={[
          ['Item', `${p?.name} (${l.sku})`],
          ['Received', `${fmtDate(l.received)} on ${l.receivedRef}`],
          ['Expiry', l.expiry ? fmtDate(l.expiry) : '—'],
          ['Unit cost', kes(l.unitCost)],
          ...(l.serial ? [['Serial number', l.serial] as [string, string]] : []),
          ...(l.garden ? [['Tea', `${l.garden} ${l.grade} · ${l.saleNo} · ${l.teaInvoice ?? ''}`] as [string, string]] : [])
        ]}
      />
      <h3>Condition</h3>
      <div className="sx-grid">
        <Field label="New condition">
          <select className="form-control" value={cond} onChange={(e) => setCond(e.target.value as Condition)}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Finding" required span={2}>
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Water damage to outer cartons" />
        </Field>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" disabled={ext.readOnly} onClick={() => ext.inventory.changeCondition(id, cond, note).ok && setNote('')}>
        Update condition
      </button>
      <h3>Move to another bin or warehouse</h3>
      <div className="sx-grid">
        <Field label="Quantity">
          <input className="form-control" type="number" min="1" max={l.qty} value={mv.qty} onChange={(e) => setMv({ ...mv, qty: Number(e.target.value) })} />
        </Field>
        <Field label="Warehouse">
          <select className="form-control" value={mv.warehouse} onChange={(e) => setMv({ ...mv, warehouse: e.target.value, bin: '' })}>
            {ext.state.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bin">
          <select className="form-control" value={mv.bin} onChange={(e) => setMv({ ...mv, bin: e.target.value })}>
            <option value="">Choose…</option>
            {bins.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </Field>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" disabled={ext.readOnly} onClick={() => ext.inventory.moveLot(id, mv.qty, mv.warehouse, mv.bin)}>
        <ArrowLeftRight size={14} /> Move
      </button>
      <h3>History</h3>
      <Timeline items={moves.map((m) => ({ at: m.date, by: m.by, action: `${m.number} · ${MOVE_LABEL[m.kind]}`, note: m.reason }))} />
    </Drawer>
  );
};

/* ---------------- Warehouses ---------------- */

const WarehousesTab: React.FC = () => {
  const { ext, product } = useInv();
  const [edit, setEdit] = useState<WarehouseConfig | null>(null);
  const blank: WarehouseConfig = { id: '', name: '', type: 'STANDARD', location: '', bins: [] };
  return (
    <>
      <div className="sx-toolbar">
        <span className="sx-muted">Bins (locators) hold lots. Quarantine stores take failed inspections; bonded stores hold uncleared imports under KRA bond.</span>
        <span className="sx-grow" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEdit(blank)}>
          <Plus size={14} /> Add warehouse
        </button>
      </div>
      <div className="prx-cards">
        {ext.state.warehouses.map((w) => {
          const lots = ext.state.lots.filter((l) => l.warehouse === w.id && l.qty > 0);
          return (
            <div key={w.id} className="prx-card">
              <div className="prx-inline">
                <Warehouse size={16} />
                <b>{w.name}</b>
                <span className="sx-grow" />
                <Pill status={w.type === 'STANDARD' ? 'ACTIVE' : w.type === 'QUARANTINE' ? 'OVERDUE' : 'SUBMITTED'} label={label(w.type)} />
              </div>
              <small className="sx-muted">
                {w.id} · {w.location}
                {w.bondNo ? ` · Bond ${w.bondNo}` : ''}
              </small>
              <table className="sx-table">
                <tbody>
                  {w.bins.map((b) => {
                    const here = lots.filter((l) => l.bin === b);
                    return (
                      <tr key={b}>
                        <td className="sx-mono">{b}</td>
                        <td>{here.length ? here.map((l) => `${product(l.sku)?.name ?? l.sku} ×${l.qty}`).join(', ') : <span className="sx-muted">empty</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(w)}>
                Edit
              </button>
            </div>
          );
        })}
      </div>
      {edit && <WarehouseModal w={edit} onClose={() => setEdit(null)} />}
    </>
  );
};

const WarehouseModal: React.FC<{ w: WarehouseConfig; onClose: () => void }> = ({ w, onClose }) => {
  const { ext } = useInv();
  const [d, setD] = useState(w);
  const [bins, setBins] = useState(w.bins.join(', '));
  return (
    <Modal
      size="md"
      title={w.id ? `Edit ${w.name}` : 'New warehouse'}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-sm" disabled={ext.readOnly} onClick={() => ext.inventory.saveWarehouse({ ...d, bins: bins.split(',').map((b) => b.trim().toUpperCase()).filter(Boolean) }).ok && onClose()}>
          Save warehouse
        </button>
      }
    >
      <div className="sx-grid">
        <Field label="Code" required>
          <input className="form-control" value={d.id} disabled={!!w.id} onChange={(e) => setD({ ...d, id: e.target.value.toUpperCase() })} placeholder="WH-KSM" />
        </Field>
        <Field label="Name" required>
          <input className="form-control" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className="form-control" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as WarehouseConfig['type'] })}>
            <option value="STANDARD">Standard</option>
            <option value="QUARANTINE">Quarantine</option>
            <option value="BONDED">Bonded</option>
            <option value="TRANSIT">In transit</option>
          </select>
        </Field>
        <Field label="Location">
          <input className="form-control" value={d.location} onChange={(e) => setD({ ...d, location: e.target.value })} />
        </Field>
        {d.type === 'BONDED' && (
          <Field label="KRA bond licence" required>
            <input className="form-control" value={d.bondNo ?? ''} onChange={(e) => setD({ ...d, bondNo: e.target.value })} />
          </Field>
        )}
        <Field label="Bins / locators" required span={2} hint="Comma separated codes">
          <input className="form-control" value={bins} onChange={(e) => setBins(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

/* ---------------- Movements ---------------- */

const MovementsTab: React.FC = () => {
  const { ext, product } = useInv();
  const [kind, setKind] = useState<'ALL' | 'PENDING' | MoveKind>('ALL');
  const rows = ext.state.moves.filter((m) => kind === 'ALL' || (kind === 'PENDING' ? m.status === 'PENDING' : m.kind === kind));
  const [reject, setReject] = useState<InvMove | null>(null);
  const [note, setNote] = useState('');
  const columns: Column<InvMove>[] = [
    { key: 'n', header: 'No.', render: (m) => <b className="sx-mono">{m.number}</b>, sort: (m) => m.number, width: 130 },
    { key: 'k', header: 'Type', render: (m) => MOVE_LABEL[m.kind], sort: (m) => m.kind },
    { key: 'i', header: 'Item', render: (m) => <div className="sx-cell-main"><span>{product(m.sku)?.name ?? m.sku}</span><small>{m.reason}</small></div> },
    { key: 'w', header: 'From → to', render: (m) => [m.from, m.to].filter(Boolean).join(' → ') || m.costCentre || '—', hideOnMobile: true },
    { key: 'q', header: 'Qty', render: (m) => m.qty.toLocaleString(), align: 'right' },
    { key: 'v', header: 'Value', render: (m) => kes(m.value), sort: (m) => m.value, align: 'right', hideOnMobile: true },
    { key: 'd', header: 'Date', render: (m) => `${fmtDate(m.date)} · ${m.by}`, sort: (m) => m.date, hideOnMobile: true },
    {
      key: 's',
      header: 'Status',
      render: (m) =>
        m.status === 'PENDING' ? (
          <span className="prx-inline">
            <button type="button" className="btn btn-primary btn-sm" onClick={(e) => (e.stopPropagation(), ext.inventory.decideMove(m.id, true, ''))}>
              Approve
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => (e.stopPropagation(), setReject(m))}>
              Reject
            </button>
          </span>
        ) : (
          <Pill status={m.status === 'POSTED' ? 'POSTED' : 'REJECTED'} label={label(m.status)} />
        )
    }
  ];
  return (
    <>
      <div className="sx-toolbar">
        <select className="form-control" style={{ maxWidth: 240 }} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Movement type">
          <option value="ALL">All movements</option>
          <option value="PENDING">Waiting for approval</option>
          {ext.inventory.kinds.map((k) => (
            <option key={k} value={k}>
              {MOVE_LABEL[k]}
            </option>
          ))}
        </select>
        <span className="sx-muted">Miscellaneous issues above KES {ext.state.settings.miscIssueLimit.toLocaleString()} need the Commercial Manager.</span>
        <span className="sx-grow" />
        <ExportCsvButton name="stock-movements" header={['Number', 'Type', 'Date', 'SKU', 'Qty', 'From', 'To', 'Cost centre', 'Reason', 'Value', 'By', 'Status', 'Approved by']} rows={() => rows.map((m) => [m.number, MOVE_LABEL[m.kind], m.date, m.sku, m.qty, m.from ?? '', m.to ?? '', m.costCentre ?? '', m.reason, m.value, m.by, m.status, m.approvedBy ?? ''])} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(m) => m.id} empty={<Empty icon={<ArrowLeftRight size={20} />} title="No movements" />} />
      {reject && (
        <Modal size="md" title={`Reject ${reject.number}`} onClose={() => setReject(null)} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => ext.inventory.decideMove(reject.id, false, note).ok && setReject(null)}>Reject issue</button>}>
          <Field label="Reason" required>
            <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Modal>
      )}
    </>
  );
};

const MoveModal: React.FC<{ kind: 'ISSUE' | 'RETURN' | 'ADJUST'; onClose: () => void }> = ({ kind, onClose }) => {
  const { ext, products, product, wh } = useInv();
  const [d, setD] = useState({ misc: false, sku: products[0]?.sku ?? '', qty: 0, warehouse: 'WH-NBO', bin: '', costCentre: '', reason: '', lotId: '', condition: 'GOOD' as Condition });
  const p = product(d.sku);
  const lots = ext.state.lots.filter((l) => l.sku === d.sku && l.qty > 0 && (kind === 'ADJUST' || l.warehouse === d.warehouse));
  const submit = () => {
    const r =
      kind === 'ISSUE'
        ? ext.inventory.issue({ kind: d.misc ? 'MISC_ISSUE' : 'ISSUE', sku: d.sku, qty: d.qty, warehouse: d.warehouse, costCentre: d.costCentre, reason: d.reason, lotId: d.lotId || undefined })
        : kind === 'RETURN'
          ? ext.inventory.returnToStores({ sku: d.sku, qty: d.qty, warehouse: d.warehouse, bin: d.bin, costCentre: d.costCentre, reason: d.reason, condition: d.condition })
          : ext.inventory.adjust({ sku: d.sku, delta: d.qty, reason: d.reason, lotId: d.lotId || undefined });
    if (r.ok) onClose();
  };
  return (
    <Modal
      size="md"
      title={kind === 'ISSUE' ? 'Issue stock' : kind === 'RETURN' ? 'Return to stores' : 'Adjust stock'}
      subtitle={kind === 'ADJUST' ? 'Enter a positive number to add stock or negative to remove it.' : kind === 'ISSUE' ? 'Lots are picked earliest-expiry first unless you choose one.' : 'Only what was issued to the cost centre can come back.'}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-sm" disabled={ext.readOnly} onClick={submit}>
          {kind === 'ISSUE' ? 'Issue' : kind === 'RETURN' ? 'Book in return' : 'Post adjustment'}
        </button>
      }
    >
      <div className="sx-grid">
        {kind === 'ISSUE' && (
          <Field label="Type" span={2}>
            <label className="prx-inline">
              <input type="checkbox" checked={d.misc} onChange={(e) => setD({ ...d, misc: e.target.checked })} /> Miscellaneous issue (not for production or a stores request)
            </label>
          </Field>
        )}
        <Field label="Item" required span={2}>
          <select className="form-control" value={d.sku} onChange={(e) => setD({ ...d, sku: e.target.value, lotId: '' })}>
            {products.map((x) => (
              <option key={x.sku} value={x.sku}>
                {x.sku} — {x.name} ({x.stock} {x.unit})
              </option>
            ))}
          </select>
        </Field>
        <Field label={kind === 'ADJUST' ? 'Change (+/−)' : 'Quantity'} required hint={p?.unit}>
          <input className="form-control" type="number" value={d.qty || ''} onChange={(e) => setD({ ...d, qty: Number(e.target.value) })} />
        </Field>
        {kind !== 'ADJUST' && (
          <Field label="Warehouse">
            <select className="form-control" value={d.warehouse} onChange={(e) => setD({ ...d, warehouse: e.target.value, lotId: '', bin: '' })}>
              {ext.state.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {kind === 'RETURN' && (
          <>
            <Field label="Bin">
              <select className="form-control" value={d.bin} onChange={(e) => setD({ ...d, bin: e.target.value })}>
                <option value="">—</option>
                {(wh(d.warehouse)?.bins ?? []).map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="Condition">
              <select className="form-control" value={d.condition} onChange={(e) => setD({ ...d, condition: e.target.value as Condition })}>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {label(c)}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        {kind !== 'RETURN' && lots.length > 0 && (
          <Field label="Lot" hint="Leave on automatic for FEFO">
            <select className="form-control" value={d.lotId} onChange={(e) => setD({ ...d, lotId: e.target.value })}>
              <option value="">Automatic (earliest expiry)</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lot} · {l.bin} · {l.qty} · {label(l.condition)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {kind !== 'ADJUST' && (
          <Field label="Cost centre" required>
            <input className="form-control" list="inv-cc" value={d.costCentre} onChange={(e) => setD({ ...d, costCentre: e.target.value })} />
            <datalist id="inv-cc">
              {COST_CENTRES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        )}
        <Field label={kind === 'ISSUE' ? 'Purpose' : 'Reason'} required span={2}>
          <input className="form-control" value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} />
        </Field>
      </div>
      {kind === 'ISSUE' && p && d.qty > 0 && <p className="sx-muted">Value {kes(round2(d.qty * p.cost))}{d.misc && d.qty * p.cost > ext.state.settings.miscIssueLimit ? ' — above the limit, will go for approval' : ''}</p>}
    </Modal>
  );
};

/* ---------------- Aging and valuation ---------------- */

const AgingTab: React.FC = () => {
  const { ext, product, wh } = useInv();
  const [asAt, setAsAt] = useState(TODAY);
  const [by, setBy] = useState<'warehouse' | 'category'>('warehouse');
  const aging = useMemo(() => stockAging(ext.state.lots, asAt), [ext.state.lots, asAt]);
  const groups = useMemo(() => {
    const m = new Map<string, { qty: number; value: number; buckets: number[] }>();
    for (const r of aging.rows) {
      const k = by === 'warehouse' ? (wh(r.lot.warehouse)?.name ?? r.lot.warehouse) : (product(r.lot.sku)?.category ?? 'Other');
      const g = m.get(k) ?? { qty: 0, value: 0, buckets: [0, 0, 0, 0] };
      g.qty += r.lot.qty;
      g.value = round2(g.value + r.value);
      g.buckets[r.bucket] = round2(g.buckets[r.bucket] + r.value);
      m.set(k, g);
    }
    return [...m.entries()];
  }, [aging, by, product, wh]);
  const total = round2(aging.rows.reduce((s, r) => s + r.value, 0));
  return (
    <>
      <div className="sx-toolbar">
        <Field label="As at">
          <input className="form-control" type="date" value={asAt} max={TODAY} onChange={(e) => setAsAt(e.target.value || TODAY)} />
        </Field>
        <Field label="Group by">
          <select className="form-control" value={by} onChange={(e) => setBy(e.target.value as typeof by)}>
            <option value="warehouse">Warehouse</option>
            <option value="category">Category</option>
          </select>
        </Field>
        <span className="sx-grow" />
        <ExportCsvButton name={`stock-aging-${asAt}`} header={['SKU', 'Item', 'Lot', 'Warehouse', 'Bin', 'Received', 'Age (days)', 'Bucket', 'Qty', 'Unit cost', 'Value']} rows={() => aging.rows.map((r) => [r.lot.sku, product(r.lot.sku)?.name ?? '', r.lot.lot, r.lot.warehouse, r.lot.bin, r.lot.received, r.age, AGE_BUCKETS[r.bucket], r.lot.qty, r.lot.unitCost, r.value])} />
      </div>
      <p className="sx-muted">Valuation uses the moving weighted average cost each lot was received at (landed costs included once posted). Lots received after the as-at date are excluded. Total {kes(total)}.</p>
      <div className="sx-stats">
        {aging.buckets.map((b) => (
          <Stat key={b.label} label={b.label} value={kes(b.value, { compact: true })} detail={`${b.qty.toLocaleString()} units`} icon={<AlarmClock size={17} />} tone={b.label.startsWith('Over') ? 'red' : 'green'} />
        ))}
      </div>
      <table className="sx-table">
        <thead>
          <tr>
            <th>{by === 'warehouse' ? 'Warehouse' : 'Category'}</th>
            {AGE_BUCKETS.map((b) => (
              <th key={b} className="r">
                {b}
              </th>
            ))}
            <th className="r">Value</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([k, g]) => (
            <tr key={k}>
              <td>{k}</td>
              {g.buckets.map((v, i) => (
                <td key={i} className="r">
                  {v ? kes(v) : '—'}
                </td>
              ))}
              <td className="r">
                <b>{kes(g.value)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

/* ---------------- Cycle counts ---------------- */

const CountsTab: React.FC = () => {
  const { ext, products, product, wh } = useInv();
  const due = dueCounts(ext.state, products);
  const [d, setD] = useState({ warehouse: 'WH-NBO', abc: 'A' as 'A' | 'B' | 'C' | 'ALL', everyDays: 30 });
  return (
    <>
      <p className="sx-muted">Counts run as blind counts in Operations › Warehousing, with variances approved there. Schedules here decide when each warehouse and ABC class is due.</p>
      <table className="sx-table">
        <thead>
          <tr>
            <th>Warehouse</th>
            <th>Class</th>
            <th>Every</th>
            <th>Last done</th>
            <th>Next due</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {due.schedules.map((c) => (
            <tr key={c.id}>
              <td>{wh(c.warehouse)?.name ?? c.warehouse}</td>
              <td>{c.abc === 'ALL' ? 'All items' : `Class ${c.abc}`}</td>
              <td>{c.everyDays} days</td>
              <td>{fmtDate(c.lastDone)}</td>
              <td>{c.overdue ? <Pill status="OVERDUE" label={`Due ${fmtDate(c.due)}`} /> : fmtDate(c.due)}</td>
              <td>
                <button type="button" className="btn btn-secondary btn-sm" disabled={ext.readOnly} onClick={() => ext.inventory.startScheduledCount(c.id)}>
                  Start count
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Add a schedule</h3>
      <div className="prx-inline">
        <select className="form-control" style={{ maxWidth: 220 }} value={d.warehouse} onChange={(e) => setD({ ...d, warehouse: e.target.value })} aria-label="Schedule warehouse">
          {ext.state.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select className="form-control" style={{ maxWidth: 120 }} value={d.abc} onChange={(e) => setD({ ...d, abc: e.target.value as typeof d.abc })} aria-label="Schedule class">
          <option value="A">Class A</option>
          <option value="B">Class B</option>
          <option value="C">Class C</option>
          <option value="ALL">All</option>
        </select>
        <input className="form-control" style={{ maxWidth: 100 }} type="number" min="1" value={d.everyDays} onChange={(e) => setD({ ...d, everyDays: Number(e.target.value) })} aria-label="Every days" />
        <button type="button" className="btn btn-secondary btn-sm" disabled={ext.readOnly} onClick={() => ext.inventory.saveSchedule(d)}>
          Save schedule
        </button>
      </div>
      <h3>Items due within 7 days</h3>
      {due.items.length ? (
        <table className="sx-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Class</th>
              <th>Frequency</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {due.items.map((x) => (
              <tr key={x.item.sku}>
                <td>{product(x.item.sku)?.name}</td>
                <td>{x.item.abc}</td>
                <td>every {x.item.countEveryDays} days</td>
                <td>{fmtDate(x.due)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sx-muted">No item counts due.</p>
      )}
    </>
  );
};

/* ---------------- Disposals ---------------- */

const METHOD: Record<Disposal['method'], string> = { GENERAL_WASTE: 'General waste', SPECIAL_WASTE: 'Special waste (NEMA)', BOARDED: 'Boarded — sold' };

const DisposalsTab: React.FC = () => {
  const { ext, products, product } = useInv();
  const [raising, setRaising] = useState(false);
  const [d, setD] = useState({ sku: products[0]?.sku ?? '', lotId: '', qty: 0, method: 'GENERAL_WASTE' as Disposal['method'], reason: '', proceeds: 0, buyer: '' });
  const [act, setAct] = useState<{ id: string; kind: 'REJECT' | 'COMPLETE' } | null>(null);
  const [text, setText] = useState('');
  const columns: Column<Disposal>[] = [
    { key: 'n', header: 'No.', render: (x) => <b className="sx-mono">{x.number}</b>, sort: (x) => x.number, width: 130 },
    { key: 'i', header: 'Item', render: (x) => <div className="sx-cell-main"><span>{x.qty} × {product(x.sku)?.name}</span><small>{x.reason}</small></div> },
    { key: 'm', header: 'Method', render: (x) => METHOD[x.method] + (x.buyer ? ` to ${x.buyer}` : '') },
    { key: 'p', header: 'Proceeds', render: (x) => kes(x.proceeds), align: 'right', hideOnMobile: true },
    { key: 's', header: 'Status', render: (x) => <Pill status={TONE[x.status] ?? x.status} label={label(x.status)} /> },
    {
      key: 'a',
      header: '',
      render: (x) =>
        x.status === 'SUBMITTED' ? (
          <span className="prx-inline">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.inventory.decideDisposal(x.id, true, '')}>
              Approve
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAct({ id: x.id, kind: 'REJECT' })}>
              Reject
            </button>
          </span>
        ) : x.status === 'APPROVED' ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAct({ id: x.id, kind: 'COMPLETE' })}>
            Complete
          </button>
        ) : x.certificate ? (
          <small>{x.certificate}</small>
        ) : null
    }
  ];
  const lots = ext.state.lots.filter((l) => l.sku === d.sku && l.qty > 0);
  return (
    <>
      <div className="sx-toolbar">
        <span className="sx-muted">Disposals are approved, then completed by Stores; special waste needs the NEMA waste transfer note.</span>
        <span className="sx-grow" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRaising(true)}>
          <Trash2 size={14} /> Request disposal
        </button>
      </div>
      <DataTable rows={ext.state.disposals} columns={columns} rowKey={(x) => x.id} empty={<Empty icon={<Trash2 size={20} />} title="No disposals" />} />
      {raising && (
        <Modal size="md" title="Request a disposal" onClose={() => setRaising(false)} footer={<button type="button" className="btn btn-primary btn-sm" disabled={ext.readOnly} onClick={() => ext.inventory.requestDisposal({ ...d, lotId: d.lotId || undefined, buyer: d.buyer || undefined }).ok && setRaising(false)}>Submit for approval</button>}>
          <div className="sx-grid">
            <Field label="Item" required span={2}>
              <select className="form-control" value={d.sku} onChange={(e) => setD({ ...d, sku: e.target.value, lotId: '' })}>
                {products.map((p) => (
                  <option key={p.sku} value={p.sku}>
                    {p.sku} — {p.name} ({p.stock})
                  </option>
                ))}
              </select>
            </Field>
            {lots.length > 0 && (
              <Field label="Lot">
                <select className="form-control" value={d.lotId} onChange={(e) => setD({ ...d, lotId: e.target.value })}>
                  <option value="">Any</option>
                  {lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.lot} · {l.qty} · {label(l.condition)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Quantity" required>
              <input className="form-control" type="number" min="1" value={d.qty || ''} onChange={(e) => setD({ ...d, qty: Number(e.target.value) })} />
            </Field>
            <Field label="Method">
              <select className="form-control" value={d.method} onChange={(e) => setD({ ...d, method: e.target.value as Disposal['method'] })}>
                {(Object.keys(METHOD) as Disposal['method'][]).map((m) => (
                  <option key={m} value={m}>
                    {METHOD[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Proceeds (KES)">
              <input className="form-control" type="number" min="0" value={d.proceeds} onChange={(e) => setD({ ...d, proceeds: Number(e.target.value) })} />
            </Field>
            {d.method === 'BOARDED' && (
              <Field label="Buyer" required>
                <input className="form-control" value={d.buyer} onChange={(e) => setD({ ...d, buyer: e.target.value })} />
              </Field>
            )}
            <Field label="Reason" required span={2}>
              <input className="form-control" value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
      {act && (
        <Modal
          size="md"
          title={act.kind === 'REJECT' ? 'Reject disposal' : 'Complete disposal'}
          onClose={() => setAct(null)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => (act.kind === 'REJECT' ? ext.inventory.decideDisposal(act.id, false, text) : ext.inventory.completeDisposal(act.id, text)).ok && (setAct(null), setText(''))}>
              {act.kind === 'REJECT' ? 'Reject' : 'Write off stock'}
            </button>
          }
        >
          <Field label={act.kind === 'REJECT' ? 'Reason' : 'Certificate / waste transfer note'}>
            <input className="form-control" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        </Modal>
      )}
    </>
  );
};

/** Printable pick list / goods issue for a stores request. */
export const pickListHtml = (ext: ReturnType<typeof useProcurementExt>, number: string, meta: [string, string][], rows: (string | number)[][], docType = 'Pick list') =>
  docHtml(ext.state, docType, number, meta, { head: ['Item', 'Lot', 'Warehouse', 'Bin', 'Quantity'], rows }, { signers: ['Picked by', 'Checked by', 'Received by'] });
