import React, { useState } from 'react';
import { Plus, RotateCcw, Undo2 } from 'lucide-react';
import { useAccess } from '../../../platform/access';
import { kes, round2 } from '../../finance/engine';
import { DataTable, DefList, Drawer, Field, Modal, Pill, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { useWarehouseExt } from './store';
import type { ReturnAuth } from './types';
import { ReadOnlyNote } from './ui';

const R_PILL: Record<ReturnAuth['status'], string> = { AUTHORISED: 'SUBMITTED', RECEIVED: 'APPROVED', CREDITED: 'POSTED', REJECTED: 'REJECTED' };

export const ReturnsPage: React.FC = () => {
  const { state, partyName } = useWarehouseExt();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const value = (r: ReturnAuth) => round2(r.lines.reduce((x, l) => x + l.qty * l.price, 0));
  const cols: Column<ReturnAuth>[] = [
    { key: 'n', header: 'RMA', render: (r) => <b className="sx-mono">{r.number}</b>, sort: (r) => r.number },
    { key: 'c', header: 'Customer', render: (r) => <div className="sx-cell-main"><span>{partyName(r.customerId)}</span><small>{r.deliveryRef}</small></div> },
    { key: 'i', header: 'Items', render: (r) => r.lines.map((l) => `${l.qty} × ${l.sku}`).join(', ') },
    { key: 'v', header: 'Value', render: (r) => kes(value(r), { compact: true }), align: 'right' },
    { key: 's', header: 'Status', render: (r) => <Pill status={R_PILL[r.status]} label={r.status.toLowerCase()} /> }
  ];
  const open = state.returns.find((r) => r.id === openId);
  return (
    <SuitePage
      eyebrow="Warehousing"
      title="Returns (RMA)"
      subtitle="Issue a return authorisation number, receive the goods back into stock and raise the customer credit in Finance."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> New RMA
        </button>
      }
    >
      <ReadOnlyNote />
      <div className="sx-stats">
        <Stat label="Authorised" value={state.returns.filter((r) => r.status === 'AUTHORISED').length} detail="Awaiting the goods" icon={<Undo2 size={17} />} tone="gold" />
        <Stat label="Received, to credit" value={state.returns.filter((r) => r.status === 'RECEIVED').length} icon={<RotateCcw size={17} />} tone="blue" />
        <Stat label="Credited" value={kes(state.returns.filter((r) => r.status === 'CREDITED').reduce((x, r) => x + value(r), 0), { compact: true })} icon={<RotateCcw size={17} />} />
      </div>
      <DataTable rows={state.returns} columns={cols} rowKey={(r) => r.id} onRowClick={(r) => setOpenId(r.id)} selected={openId} empty="No returns" />
      {open && <RmaDrawer r={open} onClose={() => setOpenId(null)} />}
      {adding && <RmaModal onClose={() => setAdding(false)} />}
    </SuitePage>
  );
};

const RmaDrawer: React.FC<{ r: ReturnAuth; onClose: () => void }> = ({ r, onClose }) => {
  const { whName, partyName, receiveReturn, creditReturn, rejectReturn } = useWarehouseExt();
  const { readOnly } = useAccess();
  const [qtys, setQtys] = useState(r.lines.map((l) => l.qty));
  const [note, setNote] = useState('');
  return (
    <Drawer title={r.number} subtitle={`${partyName(r.customerId)} · ${r.deliveryRef}`} badge={<Pill status={R_PILL[r.status]} label={r.status.toLowerCase()} />} onClose={onClose}>
      <DefList items={[['Reason', r.reason], ['Return to', whName(r.warehouseId)], ['Credit', r.creditRef ?? '—']]} />
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: 'right' }}>Authorised</th>
            {r.status === 'AUTHORISED' && <th>Received</th>}
            <th style={{ textAlign: 'right' }}>Price</th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l, i) => (
            <tr key={l.sku}>
              <td>{l.sku}</td>
              <td style={{ textAlign: 'right' }}>{l.qty}</td>
              {r.status === 'AUTHORISED' && (
                <td>
                  <input className="form-control" type="number" min="0" max={l.qty} value={qtys[i]} onChange={(e) => setQtys(qtys.map((q, j) => (j === i ? Number(e.target.value) : q)))} aria-label={`Received ${l.sku}`} />
                </td>
              )}
              <td style={{ textAlign: 'right' }}>{l.price.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && r.status === 'AUTHORISED' && (
        <div className="sx-inline-form">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => receiveReturn(r.id, qtys)}>
            Receive into stock
          </button>
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason to reject" aria-label="Reject reason" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => rejectReturn(r.id, note)}>
            Reject
          </button>
        </div>
      )}
      {!readOnly && r.status === 'RECEIVED' && (
        <button type="button" className="btn btn-primary btn-sm" onClick={() => creditReturn(r.id)}>
          Raise customer credit in Finance
        </button>
      )}
      <h4 className="sx-subhead">History</h4>
      <Timeline items={r.history} />
    </Drawer>
  );
};

const RmaModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { ops, createRma } = useWarehouseExt();
  const com = ops.commercial.state;
  const [deliveryRef, setDeliveryRef] = useState(com.deliveries[0]?.number ?? '');
  const [reason, setReason] = useState('');
  const [warehouseId, setWh] = useState('WH-NBO');
  const dl = com.deliveries.find((d) => d.number === deliveryRef);
  const order = com.orders.find((o) => o.id === dl?.orderId);
  const lines = (dl?.lines ?? []).map((l) => {
    const ol = order?.lines.find((x) => x.id === l.lineId);
    return { sku: ol?.sku ?? '', max: l.qty, price: ol?.price ?? 0 };
  });
  const [qty, setQty] = useState<Record<string, number>>({});
  return (
    <Modal
      size="lg"
      title="New return authorisation"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => createRma({ customerId: order?.customerId ?? '', deliveryRef, lines: lines.map((l) => ({ sku: l.sku, qty: qty[l.sku] ?? 0, price: l.price })), reason, warehouseId }).ok && onClose()}>
          Issue RMA
        </button>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Field label="Delivery being returned">
          <select className="form-control" value={deliveryRef} onChange={(e) => setDeliveryRef(e.target.value)}>
            {com.deliveries.map((d) => (
              <option key={d.id} value={d.number}>
                {d.number} — {ops.commercial.party(com.orders.find((o) => o.id === d.orderId)?.customerId ?? '')?.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Return to">
          <select className="form-control" value={warehouseId} onChange={(e) => setWh(e.target.value)}>
            {ops.state.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason" required span={2}>
          <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Damaged in transit" />
        </Field>
      </div>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: 'right' }}>Delivered</th>
            <th>Return qty</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.sku}>
              <td>{ops.pname(l.sku)}</td>
              <td style={{ textAlign: 'right' }}>{l.max}</td>
              <td>
                <input className="form-control" type="number" min="0" max={l.max} value={qty[l.sku] ?? ''} onChange={(e) => setQty({ ...qty, [l.sku]: Number(e.target.value) })} aria-label={`Return ${l.sku}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
};
