import React, { useEffect, useState } from 'react';
import { ClipboardList, ListChecks, PackageCheck, Plus, Truck, Undo2 } from 'lucide-react';
import { useCommercial } from '../store';
import { fmtDate } from '../../finance/engine';
import { DEPARTMENTS } from '../../finance/data';
import { PrintButton } from '../../../platform/Widgets';
import { DataTable, DefList, Drawer, Empty, Field, Modal, Pill, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { useProcurementExt } from './ext/store';
import { docHtml, label, ReadOnlyNote, Tabs, TONE } from './ext/ui';
import type { StoresRequisition } from './ext/types';

type SFilter = 'ALL' | 'SUBMITTED' | 'TASKS' | 'BACKORDER' | 'DONE';
const FULFILLERS = ['John Kiprop', 'Grace Wanjiru', 'Samuel Otieno'];
const DEPTS = ['Blending & packing', 'Tea tasting room', 'Workshop', ...DEPARTMENTS];

export const StoresPage: React.FC = () => {
  const ext = useProcurementExt();
  const { state } = useCommercial();
  const [filter, setFilter] = useState<SFilter>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const [raising, setRaising] = useState(false);
  useEffect(() => {
    if (ext.page?.focus === 'new') setRaising(true);
    else if (ext.page?.focus) setOpenId(ext.page.focus);
  }, [ext.page]);
  const list = ext.state.storesReqs;
  const match = (r: StoresRequisition, f: SFilter) =>
    f === 'ALL' || (f === 'SUBMITTED' ? r.status === 'SUBMITTED' : f === 'TASKS' ? r.status === 'APPROVED' || r.status === 'PICKING' : f === 'BACKORDER' ? r.status === 'PART_ISSUED' : ['ISSUED', 'CLOSED', 'REJECTED'].includes(r.status));
  const rows = list.filter((r) => match(r, filter));
  const count = (f: SFilter) => list.filter((r) => match(r, f)).length;
  const name = (sku: string) => state.products.find((p) => p.sku === sku)?.name ?? sku;
  const columns: Column<StoresRequisition>[] = [
    { key: 'n', header: 'Request', render: (r) => <b className="sx-mono">{r.number}</b>, sort: (r) => r.number, width: 130 },
    { key: 'd', header: 'For', render: (r) => <div className="sx-cell-main"><span>{r.requestedBy}</span><small>{r.department} · {r.lines.map((l) => `${l.qty} ${name(l.sku)}`).join(', ')}</small></div> },
    { key: 'w', header: 'From', render: (r) => r.warehouse, hideOnMobile: true },
    { key: 'p', header: 'Plan', render: (r) => (r.plan === 'AUTO' ? 'Automatic pick' : 'Manual task'), hideOnMobile: true },
    { key: 'a', header: 'Assigned', render: (r) => r.assignedTo ?? '—', hideOnMobile: true },
    { key: 'dt', header: 'Date', render: (r) => fmtDate(r.date), sort: (r) => r.date, hideOnMobile: true },
    { key: 's', header: 'Status', render: (r) => <Pill status={TONE[r.status] ?? r.status} label={r.status === 'PART_ISSUED' ? 'Backorder' : label(r.status)} /> }
  ];
  const current = list.find((r) => r.id === openId);
  return (
    <SuitePage
      eyebrow="Stores"
      title="Stores requests"
      subtitle="Internal requests filled from stock: approved, picked from a system pick list or a fulfilment task, issued, with backorders for what is short."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setRaising(true)}>
          <Plus size={15} /> Request from stores
        </button>
      }
    >
      <ReadOnlyNote show={ext.readOnly} />
      <div className="sx-stats">
        <Stat label="To approve" value={count('SUBMITTED')} icon={<ClipboardList size={17} />} tone="gold" onClick={() => setFilter('SUBMITTED')} />
        <Stat label="Fulfilment tasks" value={count('TASKS')} detail="Approved, to pick and issue" icon={<ListChecks size={17} />} tone="blue" onClick={() => setFilter('TASKS')} />
        <Stat label="Backorders" value={count('BACKORDER')} detail="Part issued" icon={<Truck size={17} />} tone={count('BACKORDER') ? 'red' : 'green'} onClick={() => setFilter('BACKORDER')} />
        <Stat label="Completed" value={count('DONE')} icon={<PackageCheck size={17} />} onClick={() => setFilter('DONE')} />
      </div>
      <Tabs
        value={filter}
        onChange={setFilter}
        tabs={[
          ['ALL', 'All', count('ALL')],
          ['SUBMITTED', 'To approve', count('SUBMITTED')],
          ['TASKS', 'Fulfilment tasks', count('TASKS')],
          ['BACKORDER', 'Backorders', count('BACKORDER')],
          ['DONE', 'Completed', count('DONE')]
        ]}
      />
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} onRowClick={(r) => setOpenId(r.id)} selected={openId} initialSort={{ key: 'n', dir: 'desc' }} empty={<Empty icon={<ClipboardList size={20} />} title="No stores requests here" />} />
      {current && <SRDrawer r={current} onClose={() => setOpenId(null)} />}
      {raising && <SRModal onClose={() => setRaising(false)} onDone={(id) => (setRaising(false), setOpenId(id))} />}
    </SuitePage>
  );
};

const SRModal: React.FC<{ onClose: () => void; onDone: (id: string) => void }> = ({ onClose, onDone }) => {
  const ext = useProcurementExt();
  const { state } = useCommercial();
  const stocked = state.products.filter((p) => p.kind !== 'SERVICE');
  const [d, setD] = useState({ department: DEPTS[0], requestedBy: '', warehouse: 'WH-FAC', plan: 'AUTO' as 'AUTO' | 'MANUAL' });
  const [lines, setLines] = useState<{ sku: string; qty: number }[]>([{ sku: stocked[0]?.sku ?? '', qty: 0 }]);
  return (
    <Modal
      title="Request from stores"
      subtitle="Stock items only — anything not held is bought through a purchase requisition."
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const r = ext.inventory.requestFromStores({ ...d, lines });
            if (r.ok && r.id) onDone(r.id);
          }}
        >
          Submit request
        </button>
      }
    >
      <div className="sx-grid">
        <Field label="Department">
          <select className="form-control" value={d.department} onChange={(e) => setD({ ...d, department: e.target.value })}>
            {DEPTS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Requested by" required>
          <input className="form-control" value={d.requestedBy} onChange={(e) => setD({ ...d, requestedBy: e.target.value })} placeholder="Name" />
        </Field>
        <Field label="Issue from">
          <select className="form-control" value={d.warehouse} onChange={(e) => setD({ ...d, warehouse: e.target.value })}>
            {ext.state.warehouses
              .filter((w) => w.type === 'STANDARD')
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Fulfilment plan" hint="Automatic builds the pick list on approval; manual creates a task for Stores">
          <select className="form-control" value={d.plan} onChange={(e) => setD({ ...d, plan: e.target.value as 'AUTO' | 'MANUAL' })}>
            <option value="AUTO">Automatic pick list</option>
            <option value="MANUAL">Manual fulfilment task</option>
          </select>
        </Field>
      </div>
      <table className="sx-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Available here</th>
            <th>Quantity</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const p = stocked.find((x) => x.sku === l.sku);
            return (
              <tr key={i}>
                <td>
                  <select className="form-control" aria-label="Item" value={l.sku} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))}>
                    {stocked.map((x) => (
                      <option key={x.sku} value={x.sku}>
                        {x.sku} — {x.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {ext.inventory.lotStock(l.sku, d.warehouse)} {p?.unit}
                </td>
                <td>
                  <input className="form-control" aria-label="Quantity" type="number" min="1" value={l.qty || ''} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
                </td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { sku: stocked[0]?.sku ?? '', qty: 0 }])}>
        <Plus size={14} /> Add line
      </button>
    </Modal>
  );
};

const SRDrawer: React.FC<{ r: StoresRequisition; onClose: () => void }> = ({ r, onClose }) => {
  const ext = useProcurementExt();
  const { state } = useCommercial();
  const [note, setNote] = useState('');
  const [to, setTo] = useState(r.assignedTo ?? FULFILLERS[0]);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const name = (sku: string) => state.products.find((p) => p.sku === sku)?.name ?? sku;
  const unit = (sku: string) => state.products.find((p) => p.sku === sku)?.unit ?? '';
  const pick = r.pickList ?? [];
  const issuable = ['APPROVED', 'PICKING', 'PART_ISSUED'].includes(r.status);
  const printRows = () => pick.map((p) => [name(p.sku), p.lot ?? '—', p.warehouse, p.bin, p.qty]);
  return (
    <Drawer
      wide
      title={`Stores request ${r.number}`}
      subtitle={`${r.requestedBy} · ${r.department} · from ${r.warehouse} · ${fmtDate(r.date)}`}
      badge={<Pill status={TONE[r.status] ?? r.status} label={r.status === 'PART_ISSUED' ? 'Backorder' : label(r.status)} />}
      onClose={onClose}
      footer={
        <>
          {pick.length > 0 && (
            <PrintButton
              label="Print pick list"
              title={`Pick list ${r.number}`}
              html={() => docHtml(ext.state, 'Pick list', r.number, [['Date', fmtDate(r.date)], ['Requested by', `${r.requestedBy} — ${r.department}`], ['Warehouse', r.warehouse], ['Assigned to', r.assignedTo ?? '—']], { head: ['Item', 'Lot', 'Warehouse', 'Bin', 'Quantity'], rows: printRows() }, { signers: ['Picked by', 'Checked by', 'Received by'] })}
            />
          )}
          {r.lines.some((l) => l.issued > 0) && (
            <PrintButton
              label="Print goods issue"
              title={`Goods issue ${r.number}`}
              html={() => docHtml(ext.state, 'Goods issue', r.number, [['Date', fmtDate(r.date)], ['Issued to', `${r.requestedBy} — ${r.department}`]], { head: ['Item', 'Quantity', 'Issued', 'Outstanding'], rows: r.lines.map((l) => [name(l.sku), l.qty, l.issued, l.closed ? 0 : l.qty - l.issued]) }, { signers: ['Issued by', 'Received by'] })}
            />
          )}
          <span className="sx-grow" />
          {r.status === 'SUBMITTED' && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.inventory.decideSR(r.id, false, note)}>
                Reject
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.inventory.decideSR(r.id, true, note)}>
                Approve
              </button>
            </>
          )}
        </>
      }
    >
      <DefList
        items={[
          ['Fulfilment', r.plan === 'AUTO' ? 'Automatic — pick list generated on approval' : 'Manual — a fulfilment manager picks it'],
          ['Assigned to', r.assignedTo ?? 'Not yet']
        ]}
      />
      {r.status === 'SUBMITTED' && (
        <Field label="Approval comment" hint="Required to reject">
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      )}
      <h3>Lines</h3>
      <table className="sx-table">
        <thead>
          <tr>
            <th>Item</th>
            <th className="r">Requested</th>
            <th className="r">Issued</th>
            <th className="r">Outstanding</th>
            {issuable && <th>Issue now</th>}
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l) => (
            <tr key={l.id}>
              <td>{name(l.sku)}</td>
              <td className="r">
                {l.qty} {unit(l.sku)}
              </td>
              <td className="r">{l.issued}</td>
              <td className="r">{l.closed ? 'closed' : l.qty - l.issued}</td>
              {issuable && (
                <td>
                  <input className="form-control" aria-label={`Issue ${name(l.sku)}`} type="number" min="0" max={l.qty - l.issued} value={qtys[l.id] ?? ''} onChange={(e) => setQtys({ ...qtys, [l.id]: Number(e.target.value) })} disabled={l.closed || l.issued >= l.qty} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {issuable && (
        <div className="prx-inline">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQtys(Object.fromEntries(r.lines.map((l) => [l.id, l.closed ? 0 : Math.min(l.qty - l.issued, ext.inventory.lotStock(l.sku, r.warehouse) || l.qty - l.issued)])))}>
            Fill outstanding
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.inventory.issueSR(r.id, qtys).ok && setQtys({})}>
            <PackageCheck size={14} /> Issue
          </button>
        </div>
      )}
      {(r.status === 'APPROVED' || r.status === 'PICKING') && (
        <>
          <h3>Fulfilment task</h3>
          <div className="prx-inline">
            <select className="form-control" style={{ maxWidth: 220 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Assign to">
              {FULFILLERS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.inventory.assign(r.id, to)}>
              Assign and build pick list
            </button>
          </div>
        </>
      )}
      {pick.length > 0 && (
        <>
          <h3>Pick list (earliest expiry first)</h3>
          <table className="sx-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Lot</th>
                <th>Location</th>
                <th className="r">Pick</th>
              </tr>
            </thead>
            <tbody>
              {pick.map((p, i) => (
                <tr key={i}>
                  <td>{name(p.sku)}</td>
                  <td className="sx-mono">{p.lot ?? '—'}</td>
                  <td>
                    {p.warehouse} · {p.bin}
                  </td>
                  <td className="r">{p.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {r.status === 'PART_ISSUED' && (
        <>
          <h3>Backorder</h3>
          <p className="sx-muted">The balance stays open until stock arrives and is issued, or the backorder is closed.</p>
          <div className="prx-inline">
            <input className="form-control" placeholder="Reason for closing" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Close reason" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.inventory.closeBackorder(r.id, note)}>
              <Undo2 size={14} /> Close backorder
            </button>
          </div>
        </>
      )}
      <h3>History</h3>
      <Timeline items={r.history} />
    </Drawer>
  );
};
