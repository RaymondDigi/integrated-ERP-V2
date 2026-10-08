import React, { useState } from 'react';
import { LayoutDashboard, Warehouse as WarehouseIcon, ArrowLeftRight, ClipboardCheck, History, Plus, Truck, PackageCheck, AlertTriangle, Boxes, Trash2, Ban, CheckCircle2 } from 'lucide-react';
import { useOperations, type WarehousingPage } from './store';
import { countVariance, inTransit, stockAt, warehouseUnits } from './engine';
import { needsReorder } from '../commercial/engine';
import { fmtDate, kes, round2, TODAY } from '../finance/engine';
import type { StockCount, Transfer } from './types';
import { Chips, DataTable, DefList, Drawer, Field, Hero, LinkButton, Meter, Modal, Panel, Pill, SearchBox, Stat, SuitePage, Timeline, TodoList, greeting, type Column, type TodoItem } from '../ui/kit';
import { SuiteSidebar, type SuiteNavGroup } from '../ui/SuiteSidebar';
import { Crumb, useFocus, useTopOnChange } from './parts';
import { Gavel, Layers, MapPin, ListChecks, CalendarCheck, Tags, Receipt, Printer, Thermometer, BarChart3, Undo2, Container } from 'lucide-react';
import { isWarehousingExt, WH_EXT_LABEL } from './warehousing/pages';
import { toBase } from './warehousing/engine';
import { useAccess } from '../../platform/access';
import { LogisticsFooter } from './warehousing/ui';
import { useWarehouseExt } from './warehousing/store';
import { LotsPage } from './warehousing/LotsPage';
import { InboundPage } from './warehousing/InboundPage';
import { AuctionPage } from './warehousing/AuctionPage';
import { OutboundPage } from './warehousing/OutboundPage';
import { TransportPage } from './warehousing/TransportPage';
import { ReturnsPage } from './warehousing/ReturnsPage';
import { BillingPage, CyclePage, ItemsPage, LocationsPage, PrintingPage, SensorsPage, TasksPage } from './warehousing/SetupPages';
import { WhReportsPage } from './warehousing/ReportsPage';

const LABEL: Record<WarehousingPage, string> = { overview: 'Overview', stock: 'Stock by location', transfers: 'Transfers', counts: 'Stock counts', movements: 'Movements', ...WH_EXT_LABEL };
const T_PILL: Record<Transfer['status'], [string, string]> = { REQUESTED: ['SUBMITTED', 'Requested'], IN_TRANSIT: ['OPEN', 'In transit'], RECEIVED: ['POSTED', 'Received'], CANCELLED: ['VOID', 'Cancelled'] };
const C_PILL: Record<StockCount['status'], [string, string]> = { OPEN: ['OPEN', 'Counting'], SUBMITTED: ['SUBMITTED', 'Awaiting approval'], APPROVED: ['POSTED', 'Approved'] };

const WOverview: React.FC = () => {
  const { state, actor, products, commercial, setWarehousing: go } = useOperations();
  const items = products.filter((p) => p.kind !== 'SERVICE');
  const value = round2(items.reduce((s, p) => s + p.stock * p.cost, 0));
  const low = items.filter((p) => needsReorder(commercial.state, p));
  const todo: TodoItem[] = [
    ...state.transfers.filter((t) => t.status === 'REQUESTED').map((t) => ({ id: t.id, tone: 'warning' as const, icon: <ArrowLeftRight size={15} />, title: `Pick and dispatch ${t.number}`, detail: `${t.lines.length} items · ${t.reason}`, onClick: () => go('transfers', t.id) })),
    ...state.transfers.filter((t) => t.status === 'IN_TRANSIT').map((t) => ({ id: `r${t.id}`, tone: 'info' as const, icon: <Truck size={15} />, title: `Receive ${t.number}`, detail: `In transit to ${state.warehouses.find((w) => w.id === t.to)?.name}`, onClick: () => go('transfers', t.id) })),
    ...state.counts.filter((c) => c.status !== 'APPROVED').map((c) => ({ id: c.id, tone: 'warning' as const, icon: <ClipboardCheck size={15} />, title: `${c.status === 'OPEN' ? 'Finish' : 'Approve'} ${c.number}`, detail: state.warehouses.find((w) => w.id === c.warehouse)?.name ?? '', onClick: () => go('counts', c.id) })),
    ...low.map((p) => ({ id: p.sku, tone: 'critical' as const, icon: <AlertTriangle size={15} />, title: `${p.name} below reorder level`, detail: `${p.stock} ${p.unit} on hand`, onClick: () => go('stock') }))
  ];
  return (
    <div className="sx-page">
      <Hero
        eyebrow={`${greeting()}, ${actor.name.split(' ')[0]} · ${actor.title}`}
        title="Warehousing"
        text={`${state.warehouses.length} warehouses · ${kes(value, { compact: true })} of stock at cost · ${todo.length} things need attention`}
        actions={[
          { label: 'New transfer', icon: <ArrowLeftRight size={16} />, onClick: () => go('transfers', 'new') },
          { label: 'Start a stock count', icon: <ClipboardCheck size={16} />, onClick: () => go('counts', 'new') },
          { label: 'Stock by location', icon: <Boxes size={16} />, onClick: () => go('stock') }
        ]}
      />
      <div className="sx-stats">
        <Stat label="Stock value at cost" value={kes(value, { compact: true })} detail={`${items.length} stocked items`} icon={<Boxes size={17} />} onClick={() => go('stock')} />
        <Stat label="In transit" value={state.transfers.filter((t) => t.status === 'IN_TRANSIT').length} detail="Transfers on the road" icon={<Truck size={17} />} tone="blue" onClick={() => go('transfers')} />
        <Stat label="Below reorder level" value={low.length} detail={low.map((p) => p.sku).join(', ') || 'All healthy'} icon={<AlertTriangle size={17} />} tone={low.length ? 'red' : 'green'} onClick={() => go('stock')} />
        <Stat
          label="Count accuracy"
          value={`${(() => {
            const last = state.counts.find((c) => c.status === 'APPROVED');
            if (!last) return '—';
            const ok = last.lines.filter((l) => l.counted === l.expected).length;
            return Math.round((ok / last.lines.length) * 100);
          })()}%`}
          detail="Lines matching the system at the last count"
          icon={<ClipboardCheck size={17} />}
          tone="violet"
          onClick={() => go('counts')}
        />
      </div>
      <div className="sx-row sx-row-wide">
        <Panel title={<>Needs your attention {todo.length > 0 && <span className="sx-count">{todo.length}</span>}</>} subtitle="Transfers to move, counts to finish and items running low">
          <TodoList items={todo} />
        </Panel>
        <Panel title="Warehouse utilisation" subtitle="Units held against capacity">
          <ul className="sx-barlist">
            {state.warehouses.map((w) => {
              const units = warehouseUnits(state, products, w.id);
              return (
                <li key={w.id}>
                  <div>
                    <span>{w.name}</span>
                    <b>
                      {units.toLocaleString()} / {w.capacity.toLocaleString()}
                    </b>
                  </div>
                  <Meter value={units / w.capacity} tone={units / w.capacity > 0.85 ? 'red' : units / w.capacity > 0.7 ? 'gold' : 'green'} />
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
      <Panel title="Latest movements" subtitle="Production, transfers, counts and maintenance issues" action={<LinkButton onClick={() => go('movements')}>All movements</LinkButton>}>
        <MovesTable limit={6} />
      </Panel>
    </div>
  );
};

/* ------------------------------------------------------------------ */

const StockPage: React.FC = () => {
  const { state, products } = useOperations();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'ALL' | 'GOODS' | 'MATERIAL'>('ALL');
  const rows = products.filter((p) => p.kind !== 'SERVICE' && (kind === 'ALL' || p.kind === kind) && (!q || `${p.sku} ${p.name}`.toLowerCase().includes(q.toLowerCase())));
  type P = (typeof rows)[number];
  const columns: Column<P>[] = [
    {
      key: 'n',
      header: 'Item',
      render: (p) => (
        <div className="sx-cell-main">
          <span>{p.name}</span>
          <small>
            {p.sku} · {p.unit}
          </small>
        </div>
      ),
      sort: (p) => p.name
    },
    ...state.warehouses.map((w) => ({
      key: w.id,
      header: w.name.split(' — ')[1] ?? w.name,
      render: (p: P) => {
        const q2 = stockAt(state, products, p.sku, w.id);
        return q2 ? q2.toLocaleString() : <span className="sx-muted">—</span>;
      },
      sort: (p: P) => stockAt(state, products, p.sku, w.id),
      align: 'right' as const
    })),
    { key: 'tr', header: 'In transit', render: (p) => inTransit(state, p.sku) || <span className="sx-muted">—</span>, align: 'right', hideOnMobile: true },
    { key: 't', header: 'Total', render: (p) => <b>{p.stock.toLocaleString()}</b>, sort: (p) => p.stock, align: 'right' },
    { key: 'v', header: 'Value', render: (p) => kes(p.stock * p.cost, { compact: true }), sort: (p) => p.stock * p.cost, align: 'right', hideOnMobile: true }
  ];
  return (
    <SuitePage eyebrow="Warehousing" title="Stock by location" subtitle="Where every item sits. Sales and purchasing move stock in and out of the main warehouse; transfers move it between sites.">
      <div className="sx-toolbar">
        <Chips
          value={kind}
          onChange={setKind}
          options={[
            { value: 'ALL', label: 'All items' },
            { value: 'GOODS', label: 'Finished goods' },
            { value: 'MATERIAL', label: 'Materials & spares' }
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search items…" />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(p) => p.sku} pageSize={20} />
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */

const TransfersPage: React.FC = () => {
  const { state, warehousing, pname } = useOperations();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'ALL' | Transfer['status']>('ALL');
  useFocus(warehousing.focus, (id) => state.transfers.some((t) => t.id === id), setOpenId, () => setAdding(true));
  const wh = (id: string) => state.warehouses.find((w) => w.id === id)?.name ?? id;
  const rows = state.transfers.filter((t) => filter === 'ALL' || t.status === filter);
  const columns: Column<Transfer>[] = [
    { key: 'n', header: 'Transfer', render: (t) => <b className="sx-mono">{t.number}</b>, sort: (t) => t.number, width: 140 },
    {
      key: 'r',
      header: 'Route',
      render: (t) => (
        <div className="sx-cell-main">
          <span>
            {wh(t.from).split(' — ')[1]} → {wh(t.to).split(' — ')[1]}
          </span>
          <small>{t.lines.map((l) => `${l.qty} × ${pname(l.sku)}`).join(', ')}</small>
        </div>
      )
    },
    { key: 'd', header: 'Date', render: (t) => fmtDate(t.date), sort: (t) => t.date, hideOnMobile: true },
    { key: 's', header: 'Status', render: (t) => <Pill status={T_PILL[t.status][0]} label={T_PILL[t.status][1]} />, sort: (t) => t.status }
  ];
  const open = state.transfers.find((t) => t.id === openId);
  return (
    <SuitePage
      eyebrow="Warehousing"
      title="Transfers"
      subtitle="Move stock between warehouses. Stores dispatches from the source and receives at the destination."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> New transfer
        </button>
      }
    >
      <div className="sx-toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={(['ALL', 'REQUESTED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'] as const).map((v) => ({ value: v, label: v === 'ALL' ? 'All' : T_PILL[v][1], count: state.transfers.filter((t) => v === 'ALL' || t.status === v).length }))}
        />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(t) => t.id} onRowClick={(t) => setOpenId(t.id)} selected={openId} initialSort={{ key: 'n', dir: 'desc' }} />
      {open && <TransferDrawer t={open} onClose={() => setOpenId(null)} />}
      {adding && <TransferEditor onClose={() => setAdding(false)} />}
    </SuitePage>
  );
};

const TransferDrawer: React.FC<{ t: Transfer; onClose: () => void }> = ({ t, onClose }) => {
  const { state, products, pname, dispatchTransfer, receiveTransfer, cancelTransfer, actor } = useOperations();
  const wh = (id: string) => state.warehouses.find((w) => w.id === id)?.name ?? id;
  return (
    <Drawer
      title={t.number}
      subtitle={`${wh(t.from)} → ${wh(t.to)}`}
      badge={<Pill status={T_PILL[t.status][0]} label={T_PILL[t.status][1]} />}
      onClose={onClose}
      footer={
        <>
          {t.status === 'REQUESTED' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => cancelTransfer(t.id)}>
              <Ban size={14} /> Cancel
            </button>
          )}
          <span className="sx-grow" />
          {t.status === 'REQUESTED' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => dispatchTransfer(t.id)}>
              <Truck size={14} /> Dispatch
            </button>
          )}
          {t.status === 'IN_TRANSIT' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => receiveTransfer(t.id)}>
              <PackageCheck size={14} /> Receive
            </button>
          )}
        </>
      }
    >
      <DefList items={[['Requested by', t.requestedBy], ['Date', fmtDate(t.date)], ['Reason', t.reason]]} />
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: 'right' }}>Qty</th>
            <th style={{ textAlign: 'right' }}>At source now</th>
          </tr>
        </thead>
        <tbody>
          {t.lines.map((l) => {
            const have = stockAt(state, products, l.sku, t.from);
            return (
              <tr key={l.sku}>
                <td>{pname(l.sku)}</td>
                <td style={{ textAlign: 'right' }}>{l.qty}</td>
                <td style={{ textAlign: 'right' }} className={t.status === 'REQUESTED' && have < l.qty ? 'sx-danger-text' : 'sx-muted'}>
                  {have}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {t.status !== 'RECEIVED' && t.status !== 'CANCELLED' && actor.role !== 'STOREKEEPER' && actor.role !== 'MANAGER' && <p className="sx-note">Stores dispatches and receives transfers — switch to John Kiprop.</p>}
      <h4 className="sx-subhead">History</h4>
      <Timeline items={t.history} />
    </Drawer>
  );
};

const TransferEditor: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, products, requestTransfer } = useOperations();
  const { state: x } = useWarehouseExt();
  const [from, setFrom] = useState('WH-NBO');
  const [to, setTo] = useState('WH-MSA');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState([{ sku: '', qty: 0, uom: '' }]);
  const uoms = (sku: string) => x.setup.uoms[sku] ?? [];
  const base = (l: { sku: string; qty: number; uom: string }) => (l.uom ? toBase(l.qty, l.uom, uoms(l.sku)) : l.qty);
  return (
    <Modal
      size="lg"
      title="New stock transfer"
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => requestTransfer(from, to, lines.map((l) => ({ sku: l.sku, qty: base(l) })), reason).ok && onClose()}>
            Request transfer
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="From" span={2}>
          <select className="form-control" value={from} onChange={(e) => setFrom(e.target.value)}>
            {state.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To" span={2}>
          <select className="form-control" value={to} onChange={(e) => setTo(e.target.value)}>
            {state.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason" required span={4}>
          <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Stock for the next export shipment" />
        </Field>
      </div>
      <table className="sx-mini-table sx-alloc">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: 'right' }}>Available at source</th>
            <th style={{ width: 120 }}>Qty</th>
            <th style={{ width: 130 }}>Unit</th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>
                <select className="form-control" value={l.sku} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, sku: e.target.value, uom: '' } : x)))}>
                  <option value="">Choose…</option>
                  {products
                    .filter((p) => p.kind !== 'SERVICE')
                    .map((p) => (
                      <option key={p.sku} value={p.sku}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </td>
              <td style={{ textAlign: 'right' }}>{l.sku ? stockAt(state, products, l.sku, from) : '—'}</td>
              <td>
                <input className="form-control" type="number" min="0" value={l.qty || ''} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
              </td>
              <td>
                <select className="form-control" value={l.uom} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, uom: e.target.value } : x)))} aria-label="Unit of measure">
                  <option value="">{products.find((p) => p.sku === l.sku)?.unit ?? 'Base unit'}</option>
                  {uoms(l.sku).map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code} (= {u.factor})
                    </option>
                  ))}
                </select>
                {l.uom && <small className="sx-muted">= {base(l)} base</small>}
              </td>
              <td>
                <button type="button" className="sx-icon-btn" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove">
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { sku: '', qty: 0, uom: '' }])}>
        <Plus size={14} /> Add item
      </button>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */

const CountsPage: React.FC = () => {
  const { state, warehousing, startCount, products, commercial } = useOperations();
  const [openId, setOpenId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [countType, setCountType] = useState<'ANNUAL' | 'CYCLE'>('ANNUAL');
  const [skus, setSkus] = useState<string[]>(() => products.filter((p) => needsReorder(commercial.state, p)).map((p) => p.sku));
  useFocus(warehousing.focus, (id) => state.counts.some((c) => c.id === id), setOpenId, () => setChoosing(true));
  const wh = (id: string) => state.warehouses.find((w) => w.id === id)?.name ?? id;
  const columns: Column<StockCount>[] = [
    { key: 'n', header: 'Count', render: (c) => <b className="sx-mono">{c.number}</b>, sort: (c) => c.number, width: 140 },
    { key: 'w', header: 'Warehouse', render: (c) => <div className="sx-cell-main"><span>{wh(c.warehouse)}</span><small>{c.type === 'CYCLE' ? 'Cycle count' : 'Full count'}</small></div> },
    { key: 'd', header: 'Date', render: (c) => fmtDate(c.date), sort: (c) => c.date },
    { key: 'l', header: 'Lines', render: (c) => `${c.lines.filter((l) => l.counted !== null).length}/${c.lines.length}`, align: 'right', hideOnMobile: true },
    { key: 'v', header: 'Variance', render: (c) => <span className={countVariance(c.lines) ? 'sx-danger-text' : ''}>{countVariance(c.lines) > 0 ? '+' : ''}{countVariance(c.lines)}</span>, align: 'right' },
    { key: 's', header: 'Status', render: (c) => <Pill status={C_PILL[c.status][0]} label={C_PILL[c.status][1]} /> }
  ];
  const open = state.counts.find((c) => c.id === openId);
  return (
    <SuitePage
      eyebrow="Warehousing"
      title="Stock counts"
      subtitle="Stores counts blind against a snapshot. Differences only change stock once the Operations Manager approves them."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setChoosing(true)}>
          <Plus size={15} /> Start a count
        </button>
      }
    >
      <DataTable rows={state.counts} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => setOpenId(c.id)} selected={openId} initialSort={{ key: 'n', dir: 'desc' }} />
      {choosing && (
        <Modal size="md" title="Which warehouse?" onClose={() => setChoosing(false)}>
          <Chips
            value={countType}
            onChange={setCountType}
            options={[
              { value: 'ANNUAL', label: 'Full (annual) count' },
              { value: 'CYCLE', label: 'Cycle count — chosen items' }
            ]}
          />
          {countType === 'CYCLE' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0' }}>
              {products
                .filter((p) => p.kind !== 'SERVICE')
                .map((p) => (
                  <label key={p.sku} className="sx-check">
                    <input type="checkbox" checked={skus.includes(p.sku)} onChange={(e) => setSkus(e.target.checked ? [...skus, p.sku] : skus.filter((x) => x !== p.sku))} /> {p.name}
                  </label>
                ))}
            </div>
          )}
          <div className="sx-pick">
            {state.warehouses.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  const r = startCount(w.id, { type: countType, skus: countType === 'CYCLE' ? skus : undefined });
                  setChoosing(false);
                  if (r.ok && r.id) setOpenId(r.id);
                }}
              >
                <WarehouseIcon size={18} />
                <span>
                  <b>{w.name}</b>
                  <small>{w.location}</small>
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {open && <CountDrawer c={open} onClose={() => setOpenId(null)} />}
    </SuitePage>
  );
};

const CountDrawer: React.FC<{ c: StockCount; onClose: () => void }> = ({ c, onClose }) => {
  const { state, products, pname, enterCount, submitCount, approveCount, actor } = useOperations();
  const { readOnly } = useAccess();
  const [note, setNote] = useState('');
  const diff = c.lines.filter((l) => l.counted !== null && l.counted !== l.expected);
  const value = round2(diff.reduce((s, l) => s + ((l.counted as number) - l.expected) * (products.find((p) => p.sku === l.sku)?.cost ?? 0), 0));
  return (
    <Drawer
      wide
      title={c.number}
      subtitle={state.warehouses.find((w) => w.id === c.warehouse)?.name}
      badge={<Pill status={C_PILL[c.status][0]} label={C_PILL[c.status][1]} />}
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">
            Variance value <b className={value ? 'sx-danger-text' : ''}>{kes(value, { sign: true })}</b>
          </span>
          <span className="sx-grow" />
          {c.status === 'OPEN' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => submitCount(c.id)}>
              Submit count
            </button>
          )}
          {c.status === 'SUBMITTED' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => approveCount(c.id, note)} disabled={actor.role !== 'MANAGER'}>
              <CheckCircle2 size={14} /> Approve {diff.length ? 'adjustments' : 'count'}
            </button>
          )}
        </>
      }
    >
      <table className="sx-mini-table sx-alloc">
        <thead>
          <tr>
            <th>Item</th>
            {c.status !== 'OPEN' && <th style={{ textAlign: 'right' }}>System</th>}
            <th style={{ textAlign: 'right', width: 120 }}>Counted</th>
            {c.status !== 'OPEN' && <th style={{ textAlign: 'right' }}>Difference</th>}
          </tr>
        </thead>
        <tbody>
          {c.lines.map((l) => (
            <tr key={l.sku}>
              <td>{pname(l.sku)}</td>
              {c.status !== 'OPEN' && <td style={{ textAlign: 'right' }}>{l.expected}</td>}
              <td style={{ textAlign: 'right' }}>
                {c.status === 'OPEN' ? (
                  <div className="sx-alloc-cell">
                    <input className="form-control" type="number" min="0" disabled={readOnly} value={l.counted ?? ''} onChange={(e) => enterCount(c.id, l.sku, e.target.value === '' ? null : Number(e.target.value))} />
                  </div>
                ) : (
                  l.counted
                )}
              </td>
              {c.status !== 'OPEN' && (
                <td style={{ textAlign: 'right' }} className={l.counted !== l.expected ? 'sx-danger-text' : 'sx-muted'}>
                  {(l.counted ?? 0) - l.expected > 0 ? '+' : ''}
                  {(l.counted ?? 0) - l.expected}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {c.status === 'OPEN' && <p className="sx-note">Counts are blind — system quantities are hidden until you submit.</p>}
      {c.status === 'SUBMITTED' && diff.length > 0 && (
        <Field label="Explanation for the differences" span={4}>
          <textarea className="form-control" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Breakage found in aisle 4" />
        </Field>
      )}
      {c.status === 'SUBMITTED' && actor.role !== 'MANAGER' && <p className="sx-note">The Operations Manager approves stock adjustments.</p>}
      <h4 className="sx-subhead">History</h4>
      <Timeline items={c.history} />
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */

const KIND_LABEL: Record<string, string> = {
  TRANSFER: 'Transfer',
  COUNT: 'Count adjustment',
  PRODUCTION_ISSUE: 'Issued to production',
  PRODUCTION_OUTPUT: 'Production output',
  MAINTENANCE_ISSUE: 'Issued to maintenance',
  ADJUSTMENT: 'Export loading',
  DELIVERY: 'Customer delivery',
  RECEIPT: 'Goods received',
  SHIPMENT_LOADING: 'Loaded for export'
};

const useAllMoves = () => {
  const { state, commercial } = useOperations();
  const c = commercial.state;
  const fromSales = c.deliveries.flatMap((d) =>
    d.lines.map((l) => {
      const ol = c.orders.find((o) => o.id === d.orderId)?.lines.find((x) => x.id === l.lineId);
      return { id: `${d.id}${l.lineId}`, date: d.date, sku: ol?.sku ?? '', qty: -l.qty, kind: 'DELIVERY', ref: d.number, by: d.dispatchedBy };
    })
  );
  const fromPurchases = c.receipts.flatMap((g) =>
    g.lines.map((l) => {
      const pl = c.purchaseOrders.find((o) => o.id === g.poId)?.lines.find((x) => x.id === l.lineId);
      return { id: `${g.id}${l.lineId}`, date: g.date, sku: pl?.sku ?? '', qty: l.qty, kind: 'RECEIPT', ref: g.number, by: g.receivedBy };
    })
  );
  return [...state.moves, ...fromSales, ...fromPurchases].filter((m) => m.sku).sort((a, b) => b.date.localeCompare(a.date));
};

const MovesTable: React.FC<{ limit?: number }> = ({ limit }) => {
  const { pname } = useOperations();
  const all = useAllMoves();
  const rows = limit ? all.slice(0, limit) : all;
  type M = (typeof all)[number];
  const columns: Column<M>[] = [
    { key: 'd', header: 'Date', render: (m) => fmtDate(m.date), sort: (m) => m.date, width: 120 },
    { key: 'i', header: 'Item', render: (m) => pname(m.sku), sort: (m) => pname(m.sku) },
    { key: 'k', header: 'Movement', render: (m) => KIND_LABEL[m.kind] ?? m.kind, sort: (m) => m.kind, hideOnMobile: true },
    { key: 'r', header: 'Reference', render: (m) => <span className="sx-mono">{m.ref}</span>, hideOnMobile: true },
    { key: 'q', header: 'Qty', render: (m) => <b className={m.qty > 0 ? 'sx-success-text' : ''}>{m.qty > 0 ? '+' : ''}{m.qty}</b>, sort: (m) => m.qty, align: 'right' },
    { key: 'b', header: 'By', render: (m) => m.by, hideOnMobile: true }
  ];
  return <DataTable rows={rows} columns={columns} rowKey={(m) => m.id} pageSize={limit ?? 15} />;
};

const MovementsPage: React.FC = () => {
  const all = useAllMoves();
  return (
    <SuitePage eyebrow="Warehousing" title="Stock movements" subtitle="Everything that changed stock — deliveries, goods received, production, transfers, counts and maintenance.">
      <div className="sx-stats">
        <Stat label="Movements" value={all.length} icon={<History size={17} />} />
        <Stat label="Into stock this month" value={all.filter((m) => m.qty > 0 && m.date.slice(0, 7) === TODAY.slice(0, 7)).reduce((s, m) => s + m.qty, 0).toLocaleString()} icon={<PackageCheck size={17} />} tone="blue" />
        <Stat label="Out of stock this month" value={Math.abs(all.filter((m) => m.qty < 0 && m.date.slice(0, 7) === TODAY.slice(0, 7)).reduce((s, m) => s + m.qty, 0)).toLocaleString()} icon={<Truck size={17} />} tone="gold" />
        <Stat label="Count adjustments" value={all.filter((m) => m.kind === 'COUNT').length} icon={<ClipboardCheck size={17} />} tone="violet" />
      </div>
      <MovesTable />
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */

export const WarehousingSidebar: React.FC = () => {
  const { state, warehousing, setWarehousing } = useOperations();
  const { state: x } = useWarehouseExt();
  const groups: SuiteNavGroup<WarehousingPage>[] = [
    { label: 'Warehousing', items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
    {
      label: 'Tea warehouse',
      items: [
        { id: 'lots', label: 'Tea lots', icon: Layers, badge: x.lots.filter((l) => l.status === 'IN_STOCK' && (l.qc === 'PENDING' || l.qc === 'HOLD')).length },
        { id: 'inbound', label: 'Inbound & yard', icon: PackageCheck, badge: x.asns.filter((a) => a.status === 'EXPECTED' || a.status === 'ARRIVED').length },
        { id: 'auction', label: 'Auction & warrants', icon: Gavel },
        { id: 'outbound', label: 'Pick, pack & load', icon: Container },
        { id: 'transport', label: 'Transport', icon: Truck },
        { id: 'returns', label: 'Returns (RMA)', icon: Undo2, badge: x.returns.filter((r) => r.status === 'AUTHORISED' || r.status === 'RECEIVED').length }
      ]
    },
    {
      label: 'Stock',
      items: [
        { id: 'stock', label: 'Stock by location', icon: Boxes },
        { id: 'transfers', label: 'Transfers', icon: ArrowLeftRight, badge: state.transfers.filter((t) => t.status === 'REQUESTED' || t.status === 'IN_TRANSIT').length },
        { id: 'counts', label: 'Stock counts', icon: ClipboardCheck, badge: state.counts.filter((c) => c.status !== 'APPROVED').length },
        { id: 'cycle', label: 'Count plans', icon: CalendarCheck },
        { id: 'movements', label: 'Movements', icon: History }
      ]
    },
    {
      label: 'Operations',
      items: [
        { id: 'tasks', label: 'Tasks', icon: ListChecks, badge: x.tasks.filter((t) => t.status === 'OPEN' && !t.assignee).length },
        { id: 'printing', label: 'Printing jobs', icon: Printer },
        { id: 'sensors', label: 'Sensors (IoT)', icon: Thermometer },
        { id: 'billing', label: 'Warehouse billing', icon: Receipt },
        { id: 'reports', label: 'Reports', icon: BarChart3 }
      ]
    },
    {
      label: 'Setup',
      items: [
        { id: 'locations', label: 'Locations & layout', icon: MapPin },
        { id: 'items', label: 'Item setup', icon: Tags }
      ]
    }
  ];
  return <SuiteSidebar name="Warehousing" tagline="Tea lots · locations · transport" icon={WarehouseIcon} groups={groups} active={warehousing.page} onSelect={(p) => setWarehousing(p)} footer={<LogisticsFooter />} />;
};
export const WarehousingCrumb: React.FC = () => {
  const { warehousing, setWarehousing } = useOperations();
  return <Crumb name="Warehousing" page={warehousing.page} label={LABEL[warehousing.page]} onHome={() => setWarehousing('overview')} />;
};
export const WarehousingSuite: React.FC = () => {
  const { warehousing } = useOperations();
  useTopOnChange(warehousing.page);
  return (
    <div className="sx-suite" key={warehousing.page}>
      {warehousing.page === 'overview' && <WOverview />}
      {warehousing.page === 'stock' && <StockPage />}
      {warehousing.page === 'transfers' && <TransfersPage />}
      {warehousing.page === 'counts' && <CountsPage />}
      {warehousing.page === 'movements' && <MovementsPage />}
      {isWarehousingExt(warehousing.page) && <WarehousingExt page={warehousing.page} />}
    </div>
  );
};

const WarehousingExt: React.FC<{ page: import('./warehousing/pages').WarehousingExtPage }> = ({ page }) => {
  switch (page) {
    case 'lots':
      return <LotsPage />;
    case 'inbound':
      return <InboundPage />;
    case 'auction':
      return <AuctionPage />;
    case 'outbound':
      return <OutboundPage />;
    case 'transport':
      return <TransportPage />;
    case 'returns':
      return <ReturnsPage />;
    case 'locations':
      return <LocationsPage />;
    case 'tasks':
      return <TasksPage />;
    case 'cycle':
      return <CyclePage />;
    case 'items':
      return <ItemsPage />;
    case 'billing':
      return <BillingPage />;
    case 'printing':
      return <PrintingPage />;
    case 'sensors':
      return <SensorsPage />;
    default:
      return <WhReportsPage />;
  }
};
