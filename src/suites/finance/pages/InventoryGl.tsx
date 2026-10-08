import React, { useMemo, useState } from 'react';
import { Boxes, Factory, Wrench, Scale, Calendar } from 'lucide-react';
import { useFinance } from '../store';
import { useApp } from '../../../context/AppContext';
import { balanceOf, daysBetween, kes, periodOf, round2, TODAY, addMonths } from '../engine';
import { Chips, DataTable, Field, Panel, Stat, SuitePage } from '../../ui/kit';
import { ExportCsvButton } from '../../../platform/Widgets';
import { useCommercial } from '../../commercial/store';
import { useOperations } from '../../operations/store';
import { batchCost, LABOUR_RATE, woCost } from '../../operations/engine';
import { usePrompt, num } from '../ext/ui';

type Tab = 'STOCK' | 'AGEING' | 'PRODUCTION' | 'MAINTENANCE';
const BANDS = ['0–30 days', '31–90 days', '91–180 days', 'Over 180 days'];
const bandOf = (days: number) => (days <= 30 ? 0 : days <= 90 ? 1 : days <= 180 ? 2 : 3);

/**
 * Finance view of stock, production and maintenance (data pulled from Trading and Operations): stock ledger as at a key
 * date with ageing and commitment status, valuation against the GL, revaluation, loss provision, and the posting of
 * blending batches and maintenance orders to the ledger.
 */
export const InventoryGlPage: React.FC = () => {
  const f = useFinance();
  const { state, entries } = f;
  const com = useCommercial();
  const ops = useOperations();
  const [tab, setTab] = useState<Tab>('STOCK');
  const [asAt, setAsAt] = useState(TODAY);
  const prompt = usePrompt();
  const { addToast } = useApp();
  const products = com.state.products.filter((p) => p.kind !== 'SERVICE');
  const moves = ops.state.moves;

  const rows = useMemo(() => {
    const committed = new Map<string, number>();
    for (const o of com.state.orders) {
      if (o.closed || o.status === 'VOID' || o.status === 'REJECTED') continue;
      for (const l of o.lines) committed.set(l.sku, (committed.get(l.sku) ?? 0) + Math.max(0, l.qty - l.delivered));
    }
    return products.map((p) => {
      const after = moves.filter((m) => m.sku === p.sku && m.date > asAt && m.kind !== 'TRANSFER').reduce((x, m) => x + m.qty, 0);
      const qty = round2(p.stock - after);
      const inbound = moves.filter((m) => m.sku === p.sku && m.date <= asAt && (m.kind === 'PRODUCTION_OUTPUT' || (m.kind === 'COUNT' && m.qty > 0)) ).map((m) => m.date);
      const receiptDates = com.state.receipts
        .filter((r) => r.date <= asAt && com.state.purchaseOrders.find((po) => po.id === r.poId)?.lines.some((l) => l.sku === p.sku))
        .map((r) => r.date);
      const last = [...inbound, ...receiptDates].sort().pop();
      const age = last ? daysBetween(last, asAt) : 200;
      const where = Object.entries(ops.state.placed[p.sku] ?? {}).filter(([, q]) => q).map(([w, q]) => `${w} ${q}`).join(', ');
      const com_ = Math.min(qty, committed.get(p.sku) ?? 0);
      return { p, qty, value: round2(qty * p.cost), age, band: bandOf(age), committed: com_, uncommitted: round2(qty - com_), where: where || 'Main warehouse' };
    });
  }, [products, moves, asAt, com.state, ops.state.placed]);

  const stockValue = round2(rows.reduce((x, r) => x + r.value, 0));
  const invAcc = state.accounts.find((a) => a.code === '1200')!;
  const gl = balanceOf(entries, invAcc, { to: asAt });
  const diff = round2(stockValue - gl);
  const bands = BANDS.map((_, i) => round2(rows.filter((r) => r.band === i).reduce((x, r) => x + r.value, 0)));
  const posted = (ref: string) => state.inventoryPostings.find((p) => p.ref === ref);

  const batches = ops.state.batches.filter((b) => b.status === 'COMPLETED');
  const batchRow = (b: (typeof batches)[number]) => {
    const recipe = ops.state.recipes.find((r) => r.id === b.recipeId);
    const product = com.state.products.find((p) => p.sku === recipe?.product);
    const material = batchCost(b, com.state.products);
    const labour = round2((recipe?.hours ?? 0) * LABOUR_RATE * (b.plannedQty && recipe ? b.plannedQty / recipe.batchSize : 1));
    const actual = round2(material + labour);
    const standard = round2(b.output * (product?.cost ?? 0));
    return { b, recipe, product, material, labour, actual, standard, variance: round2(standard - actual), unit: b.output ? round2(actual / b.output) : 0 };
  };
  const postBatch = (b: (typeof batches)[number]) => {
    const r = batchRow(b);
    const lines = [
      { account: '1200', debit: r.standard, description: `${r.product?.name ?? 'Output'} ${b.output} at standard`, plant: b.line },
      { account: '1200', credit: r.material, description: 'Materials issued (tea, packaging)' },
      { account: '5200', credit: r.labour, description: 'Blending labour & overheads absorbed', plant: b.line }
    ];
    if (Math.abs(r.variance) > 0.005) lines.push({ account: '5050', debit: r.variance < 0 ? -r.variance : 0, credit: r.variance > 0 ? r.variance : 0, description: 'Production cost variance', plant: b.line } as never);
    return f.postOperationalCost({ ref: b.number, kind: 'PRODUCTION', date: b.date, memo: `Blending batch ${b.number} — ${r.recipe?.name ?? ''}`, lines });
  };
  const wos = ops.state.workOrders.filter((w) => w.status === 'COMPLETED');
  const postWo = (w: (typeof wos)[number]) => {
    const parts = round2(w.parts.reduce((x, p) => x + p.qty * (com.state.products.find((y) => y.sku === p.sku)?.cost ?? 0), 0));
    const labour = round2(w.hours * LABOUR_RATE);
    // Contractor costs already reached the ledger through the supplier bill
    const contractor = w.billId ? 0 : w.contractorCost;
    const total = round2(parts + labour + contractor);
    const eq = ops.state.equipment.find((e) => e.id === w.equipmentId);
    const lines = [
      { account: '6400', debit: total, description: `${w.title} (${eq?.name ?? ''})`, plant: eq?.area, costCenter: 'CC-FAC' },
      { account: '1200', credit: parts, description: 'Spare parts issued' },
      { account: '5200', credit: labour, description: 'Maintenance labour absorbed' },
      { account: '2200', credit: contractor, description: 'Contractor cost accrued' }
    ];
    return f.postOperationalCost({ ref: w.number, kind: 'MAINTENANCE', date: w.date, memo: `Maintenance order ${w.number} — ${w.title}`, lines });
  };

  return (
    <SuitePage
      eyebrow="Ledger & cash"
      title="Inventory & production costing"
      subtitle="Stock from Trading and Operations valued for the books, aged and provided for; blending batches and maintenance orders posted to the ledger."
      actions={
        <Field label="Key date">
          <input type="date" className="form-control" value={asAt} onChange={(e) => setAsAt(e.target.value)} aria-label="Key date" />
        </Field>
      }
    >
      <div className="sx-stats">
        <Stat label="Stock value" value={kes(stockValue, { compact: true })} detail={`${rows.length} items at standard cost`} icon={<Boxes size={16} />} />
        <Stat label="General ledger 1200" value={kes(gl, { compact: true })} detail={`Difference ${kes(diff, { compact: true, sign: true })}`} icon={<Scale size={16} />} tone={Math.abs(diff) > 1 ? 'gold' : 'green'} />
        <Stat label="Over 180 days" value={kes(bands[3], { compact: true })} detail="slow-moving" icon={<Calendar size={16} />} tone="red" />
        <Stat label="Batches to cost" value={batches.filter((b) => !posted(b.number)).length} detail={`${wos.filter((w) => !posted(w.number)).length} maintenance orders`} icon={<Factory size={16} />} tone="blue" />
      </div>
      <Chips<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'STOCK', label: 'Stock ledger & valuation' },
          { value: 'AGEING', label: 'Ageing & loss provision' },
          { value: 'PRODUCTION', label: 'Blending batch costing', count: batches.length },
          { value: 'MAINTENANCE', label: 'Maintenance costs', count: wos.length }
        ]}
      />
      {tab === 'STOCK' && (
        <Panel
          title={`Stock as at ${asAt}`}
          action={
            <div className="sx-actions">
              <ExportCsvButton name={`stock-${asAt}`} header={['SKU', 'Item', 'Qty', 'Unit cost', 'Value', 'Committed', 'Uncommitted', 'Where', 'Age days']} rows={() => rows.map((r) => [r.p.sku, r.p.name, r.qty, r.p.cost, r.value, r.committed, r.uncommitted, r.where, r.age])} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => prompt.open({
                title: 'Revalue an item',
                subtitle: 'Posts the change in value of the stock on hand (1200 against 5050).',
                fields: [
                  { key: 'sku', label: 'Item', type: 'select', options: rows.map((r) => ({ value: r.p.sku, label: `${r.p.sku} · ${r.p.name} (${r.qty} @ ${r.p.cost})` })), span: 2 },
                  { key: 'cost', label: 'New unit cost', type: 'number', required: true }
                ],
                onSubmit: (v) => {
                  const r = rows.find((x) => x.p.sku === v.sku);
                  if (!r) return { ok: false, error: 'Choose an item' };
                  const delta = round2((num(v.cost) - r.p.cost) * r.qty);
                  if (!delta) return { ok: false, error: 'No change in value' };
                  return f.postOperationalCost({ ref: `REVAL-${r.p.sku}-${TODAY}-${num(v.cost)}`, kind: 'REVALUATION', date: TODAY, memo: `Inventory revaluation ${r.p.sku}: ${r.p.cost} → ${num(v.cost)} on ${r.qty}`, lines: [{ account: '1200', debit: delta > 0 ? delta : 0, credit: delta < 0 ? -delta : 0 }, { account: '5050', debit: delta < 0 ? -delta : 0, credit: delta > 0 ? delta : 0 }] });
                }
              })}>
                Revalue item
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={Math.abs(diff) < 1} onClick={() => f.postOperationalCost({ ref: `VAL-${asAt}-${Math.round(diff)}`, kind: 'VALUATION', date: asAt, memo: `Stock valuation adjustment as at ${asAt}`, lines: [{ account: '1200', debit: diff > 0 ? diff : 0, credit: diff < 0 ? -diff : 0 }, { account: '5050', debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0 }] })}>
                Post valuation difference
              </button>
            </div>
          }
          flush
        >
          <DataTable
            rows={rows}
            rowKey={(r) => r.p.sku}
            columns={[
              { key: 's', header: 'Item', render: (r) => <div className="sx-cell-main"><span>{r.p.name}</span><small>{r.p.sku} · {r.p.category}</small></div>, sort: (r) => r.p.sku },
              { key: 'q', header: 'Qty', render: (r) => `${r.qty} ${r.p.unit}`, sort: (r) => r.qty, align: 'right' },
              { key: 'c', header: 'Unit cost', render: (r) => r.p.cost.toLocaleString(), align: 'right' },
              { key: 'v', header: 'Value', render: (r) => kes(r.value), sort: (r) => r.value, align: 'right' },
              { key: 'cm', header: 'Committed', render: (r) => r.committed, align: 'right' },
              { key: 'un', header: 'Uncommitted', render: (r) => r.uncommitted, align: 'right' },
              { key: 'w', header: 'Where', render: (r) => <small>{r.where}</small>, hideOnMobile: true }
            ]}
          />
        </Panel>
      )}
      {tab === 'AGEING' && (
        <Panel title="Stock ageing and expected loss" subtitle="Age since the last receipt or production; loss rates are set in Setup." action={<button type="button" className="btn btn-primary btn-sm" onClick={() => f.postInventoryProvision(bands, asAt)}>Post provision movement</button>}>
          <DataTable
            rows={BANDS.map((b, i) => ({ b, i, value: bands[i], rate: state.settings.inventoryLossRates[i] ?? 0 }))}
            rowKey={(r) => r.b}
            columns={[
              { key: 'b', header: 'Age', render: (r) => r.b },
              { key: 'n', header: 'Items', render: (r) => rows.filter((x) => x.band === r.i).length, align: 'right' },
              { key: 'v', header: 'Value', render: (r) => kes(r.value), align: 'right' },
              { key: 'r', header: 'Loss rate', render: (r) => `${(r.rate * 100).toFixed(0)}%`, align: 'right' },
              { key: 'p', header: 'Provision', render: (r) => kes(round2(r.value * r.rate)), align: 'right' }
            ]}
            footer={<tr><td colSpan={5}><b>Provision required: {kes(round2(bands.reduce((x, b, i) => x + b * (state.settings.inventoryLossRates[i] ?? 0), 0)))}</b></td></tr>}
          />
        </Panel>
      )}
      {tab === 'PRODUCTION' && (
        <Panel
          title="Blending batches — actual vs standard cost"
          subtitle="Material at item cost plus labour and overheads absorbed; the difference to standard is the production variance."
          action={<button type="button" className="btn btn-primary btn-sm" onClick={() => { const todo = batches.filter((b) => !posted(b.number) && periodOf(b.date) <= periodOf(TODAY)); todo.forEach(postBatch); if (!todo.length) addToast({ type: 'info', title: 'Nothing to cost', message: 'Every completed batch is already posted' }); }}>Run period-end costing</button>}
          flush
        >
          <DataTable
            rows={batches.map(batchRow)}
            rowKey={(r) => r.b.id}
            columns={[
              { key: 'n', header: 'Batch', render: (r) => <div className="sx-cell-main"><span>{r.b.number}</span><small>{r.recipe?.name} · {r.b.line}</small></div>, sort: (r) => r.b.number },
              { key: 'o', header: 'Output', render: (r) => `${r.b.output} ${r.product?.unit ?? ''}`, align: 'right' },
              { key: 'm', header: 'Materials', render: (r) => kes(r.material), align: 'right' },
              { key: 'l', header: 'Labour & OH', render: (r) => kes(r.labour), align: 'right' },
              { key: 'u', header: 'Unit cost', render: (r) => r.unit.toLocaleString(), align: 'right' },
              { key: 'v', header: 'Variance', render: (r) => <span className={r.variance < 0 ? 'sx-danger-text' : 'sx-success-text'}>{kes(r.variance, { sign: true })}</span>, align: 'right' },
              { key: 'p', header: '', render: (r) => (posted(r.b.number) ? <small>Posted</small> : <button type="button" className="sx-link" onClick={() => postBatch(r.b)}>Post</button>) }
            ]}
            empty="No completed batches yet"
          />
        </Panel>
      )}
      {tab === 'MAINTENANCE' && (
        <Panel title="Completed maintenance orders" subtitle="Spare parts, labour and contractor costs transferred from Operations to repairs & maintenance (6400)." flush>
          <DataTable
            rows={wos}
            rowKey={(w) => w.id}
            columns={[
              { key: 'n', header: 'Order', render: (w) => <div className="sx-cell-main"><span>{w.number} · {w.title}</span><small>{ops.state.equipment.find((e) => e.id === w.equipmentId)?.name}</small></div> },
              { key: 'h', header: 'Hours', render: (w) => w.hours, align: 'right' },
              { key: 'c', header: 'Total cost', render: (w) => kes(woCost(w, com.state.products)), align: 'right' },
              { key: 'b', header: 'Contractor bill', render: (w) => w.billNumber ?? '—' },
              { key: 'p', header: '', render: (w) => (posted(w.number) ? <small>Posted</small> : <button type="button" className="sx-link" onClick={() => postWo(w)}><Wrench size={12} /> Post</button>) }
            ]}
            empty="No completed maintenance orders"
          />
        </Panel>
      )}
      {prompt.node}
      <p className="sx-note">Stock quantities as at {asAt} are rebuilt from today's stock less the movements after the key date. Months covered: {periodOf(addMonths(TODAY, -6))} onwards.</p>
    </SuitePage>
  );
};
