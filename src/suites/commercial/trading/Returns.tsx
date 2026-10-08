import React, { useEffect, useState } from 'react';
import { RotateCcw, FileMinus, AlertTriangle, Plus, Printer, CheckCircle2, XCircle } from 'lucide-react';
import { useCommercial } from '../store';
import { fmtDate, kes } from '../../finance/engine';
import type { Claim, CreditMemo, Rma, RmaLine, RmaType } from '../tradeTypes';
import { Chips, DataTable, DefList, Drawer, Field, Modal, Pill, Stat, SuitePage, type Column } from '../../ui/kit';
import { printDocument } from '../../../platform/Widgets';
import { creditHtml } from './docs';

const RMA_PILL: Record<Rma['status'], string> = { REQUESTED: 'SUBMITTED', APPROVED: 'APPROVED', RECEIVED: 'PART_PAID', CREDITED: 'POSTED', REJECTED: 'REJECTED', CLOSED: 'POSTED' };
const TYPE_LABEL: Record<RmaType, string> = { STOCK: 'Stock return (credit)', REPLACEMENT: 'Replacement', WARRANTY: 'Warranty', SERVICE: 'Service' };

/** Returns (RMAs), shipment variance claims and credit notes. */
export const ReturnsPage: React.FC = () => {
  const { state, party, trading, clearFocus } = useCommercial();
  const [tab, setTab] = useState<'RMA' | 'CLAIMS' | 'CREDITS'>('RMA');
  const [openId, setOpenId] = useState<string | null>(null);
  const [raising, setRaising] = useState<string | null>(null);
  useEffect(() => {
    if (trading.focus?.startsWith('new:')) setRaising(trading.focus.slice(4));
    if (trading.focus) clearFocus();
  }, [trading.focus, clearFocus]);
  const rmaCols: Column<Rma>[] = [
    { key: 'n', header: 'Return', render: (r) => <b className="sx-mono">{r.number}</b>, sort: (r) => r.number },
    { key: 'c', header: 'Customer', render: (r) => party(r.customerId)?.name, sort: (r) => party(r.customerId)?.name ?? '' },
    { key: 'o', header: 'Order', render: (r) => state.orders.find((o) => o.id === r.orderId)?.number },
    { key: 't', header: 'Type', render: (r) => TYPE_LABEL[r.type] },
    { key: 'q', header: 'Units', render: (r) => r.lines.reduce((x, l) => x + l.qty, 0), align: 'right' },
    { key: 's', header: 'Status', render: (r) => <Pill status={RMA_PILL[r.status]} label={r.status.toLowerCase()} />, sort: (r) => r.status }
  ];
  const claimCols: Column<Claim>[] = [
    { key: 'n', header: 'Claim', render: (c) => <b className="sx-mono">{c.number}</b>, sort: (c) => c.number },
    { key: 'c', header: 'Customer', render: (c) => party(c.customerId)?.name },
    { key: 'd', header: 'Delivery', render: (c) => state.deliveries.find((d) => d.id === c.deliveryId)?.number },
    { key: 'q', header: 'Short / damaged', render: (c) => `${c.lines.reduce((x, l) => x + l.short, 0)} / ${c.lines.reduce((x, l) => x + l.damaged, 0)}` },
    { key: 's', header: 'Status', render: (c) => <Pill status={c.status === 'OPEN' ? 'SUBMITTED' : c.status === 'APPROVED' ? 'POSTED' : 'REJECTED'} label={c.status.toLowerCase()} /> }
  ];
  const creditCols: Column<CreditMemo>[] = [
    { key: 'n', header: 'Credit note', render: (c) => <b className="sx-mono">{c.number}</b>, sort: (c) => c.number },
    { key: 'c', header: 'Customer', render: (c) => party(c.customerId)?.name },
    { key: 'src', header: 'Source', render: (c) => c.source },
    { key: 'd', header: 'Date', render: (c) => fmtDate(c.date), sort: (c) => c.date },
    { key: 'f', header: 'Restocking fee', render: (c) => (c.fee ? kes(c.fee) : '—'), align: 'right' },
    { key: 't', header: 'Total', render: (c) => kes(c.total), sort: (c) => c.total, align: 'right' },
    { key: 's', header: 'Status', render: (c) => <Pill status={c.status === 'OPEN' ? 'APPROVED' : 'POSTED'} label={c.status === 'OPEN' ? 'Open' : 'Applied'} /> }
  ];
  const rma = state.rmas.find((x) => x.id === openId);
  const claim = state.claims.find((x) => x.id === openId);
  const credit = state.credits.find((x) => x.id === openId);
  return (
    <SuitePage
      eyebrow="Fulfil"
      title="Returns & credits"
      subtitle="Return authorisations with restocking fees, replacements and warranty, proof-of-delivery claims, and the credit notes they create."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setRaising('')}>
          <Plus size={15} /> New return
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Returns awaiting approval" value={state.rmas.filter((r) => r.status === 'REQUESTED').length} icon={<RotateCcw size={17} />} tone="gold" onClick={() => setTab('RMA')} />
        <Stat label="Expected at stores" value={state.rmas.filter((r) => r.status === 'APPROVED').length} icon={<RotateCcw size={17} />} tone="blue" />
        <Stat label="Open claims" value={state.claims.filter((c) => c.status === 'OPEN').length} icon={<AlertTriangle size={17} />} tone="red" onClick={() => setTab('CLAIMS')} />
        <Stat label="Open credit notes" value={kes(state.credits.filter((c) => c.status === 'OPEN').reduce((x, c) => x + c.total, 0), { compact: true })} icon={<FileMinus size={17} />} tone="violet" onClick={() => setTab('CREDITS')} />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: 'RMA', label: 'Returns', count: state.rmas.length },
            { value: 'CLAIMS', label: 'Claims', count: state.claims.length },
            { value: 'CREDITS', label: 'Credit notes', count: state.credits.length }
          ]}
        />
      </div>
      {tab === 'RMA' && <DataTable rows={state.rmas} columns={rmaCols} rowKey={(x) => x.id} onRowClick={(x) => setOpenId(x.id)} selected={openId} />}
      {tab === 'CLAIMS' && <DataTable rows={state.claims} columns={claimCols} rowKey={(x) => x.id} onRowClick={(x) => setOpenId(x.id)} selected={openId} />}
      {tab === 'CREDITS' && <DataTable rows={state.credits} columns={creditCols} rowKey={(x) => x.id} onRowClick={(x) => setOpenId(x.id)} selected={openId} />}
      {rma && <RmaDrawer r={rma} onClose={() => setOpenId(null)} />}
      {claim && <ClaimDrawer c={claim} onClose={() => setOpenId(null)} />}
      {credit && <CreditDrawer c={credit} onClose={() => setOpenId(null)} />}
      {raising !== null && <RmaEditor orderId={raising} onClose={() => setRaising(null)} />}
    </SuitePage>
  );
};

const History: React.FC<{ items: { at: string; by: string; action: string; note?: string }[] }> = ({ items }) => (
  <ul className="sx-list">
    {[...items].reverse().map((h, i) => (
      <li key={i}>
        <span className="sx-muted">{fmtDate(h.at.slice(0, 10))}</span>
        <span>{h.action}</span>
        <span className="sx-muted">{h.note}</span>
        <b>{h.by}</b>
      </li>
    ))}
  </ul>
);

const RmaDrawer: React.FC<{ r: Rma; onClose: () => void }> = ({ r, onClose }) => {
  const { state, party, decideRma, receiveRma, creditRma, setTrading } = useCommercial();
  const o = state.orders.find((x) => x.id === r.orderId);
  const [note, setNote] = useState('');
  const [got, setGot] = useState<Record<string, number>>(() => Object.fromEntries(r.lines.map((l) => [l.lineId, l.qty])));
  const credit = state.credits.find((c) => c.id === r.creditId);
  return (
    <Drawer
      wide
      title={r.number}
      subtitle={`${party(r.customerId)?.name} · ${TYPE_LABEL[r.type]}`}
      badge={<Pill status={RMA_PILL[r.status]} label={r.status.toLowerCase()} />}
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          {r.status === 'REQUESTED' && (
            <>
              <input className="form-control" style={{ maxWidth: 220 }} placeholder="Note / reason" value={note} onChange={(e) => setNote(e.target.value)} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => decideRma(r.id, false, note)}>
                <XCircle size={14} /> Refuse
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => decideRma(r.id, true, note)}>
                <CheckCircle2 size={14} /> Approve return
              </button>
            </>
          )}
          {r.status === 'APPROVED' && r.type !== 'SERVICE' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => receiveRma(r.id, got)}>
              Receive goods
            </button>
          )}
          {(r.status === 'RECEIVED' || (r.type === 'SERVICE' && r.status === 'APPROVED')) && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => creditRma(r.id)}>
              {r.type === 'REPLACEMENT' || r.type === 'WARRANTY' ? 'Raise no-charge replacement' : 'Issue credit note'}
            </button>
          )}
          {r.replacementOrderId && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTrading('orders', r.replacementOrderId!)}>
              Open replacement order
            </button>
          )}
        </>
      }
    >
      <DefList
        items={[
          ['Order', o?.number ?? ''],
          ['Restocking fee', r.feePct ? `${r.feePct}%` : 'None'],
          ['Warehouse receiving document', r.receivingNo ?? '—'],
          ['Replacement auction lot', r.replacementLot ?? '—'],
          ['Credit note', credit ? `${credit.number} · ${kes(credit.total)}` : '—'],
          ['Requested by', r.requestedBy]
        ]}
      />
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Reason</th>
            <th>Disposition</th>
            <th style={{ textAlign: 'right' }}>Authorised</th>
            <th style={{ textAlign: 'right' }}>Received</th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l) => (
            <tr key={l.lineId}>
              <td>{o?.lines.find((x) => x.id === l.lineId)?.description}</td>
              <td>{state.reasonCodes.find((x) => x.id === l.reasonCodeId)?.label}</td>
              <td>{l.disposition.toLowerCase()}</td>
              <td style={{ textAlign: 'right' }}>{l.qty}</td>
              <td style={{ textAlign: 'right' }}>
                {r.status === 'APPROVED' ? (
                  <input className="form-control" type="number" aria-label="Received quantity" style={{ width: 80 }} value={got[l.lineId] ?? 0} onChange={(e) => setGot({ ...got, [l.lineId]: Number(e.target.value) })} />
                ) : (
                  (l.received ?? '—')
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 className="sx-subhead">History</h4>
      <History items={r.history} />
    </Drawer>
  );
};

const ClaimDrawer: React.FC<{ c: Claim; onClose: () => void }> = ({ c, onClose }) => {
  const { state, party, decideClaim } = useCommercial();
  const [note, setNote] = useState('');
  const o = state.orders.find((x) => x.id === c.orderId);
  return (
    <Drawer
      title={c.number}
      subtitle={`${party(c.customerId)?.name} · ${state.deliveries.find((d) => d.id === c.deliveryId)?.number}`}
      onClose={onClose}
      footer={
        c.status === 'OPEN' ? (
          <>
            <input className="form-control" style={{ maxWidth: 220 }} placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
            <span className="sx-grow" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => decideClaim(c.id, false, note)}>
              Reject
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => decideClaim(c.id, true, note)}>
              Approve & credit
            </button>
          </>
        ) : undefined
      }
    >
      <ul className="sx-list">
        {c.lines.map((l) => (
          <li key={l.lineId}>
            <span>{o?.lines.find((x) => x.id === l.lineId)?.description}</span>
            <span>{l.short} short</span>
            <span>{l.damaged} damaged</span>
          </li>
        ))}
      </ul>
      <h4 className="sx-subhead">History</h4>
      <History items={c.history} />
    </Drawer>
  );
};

const CreditDrawer: React.FC<{ c: CreditMemo; onClose: () => void }> = ({ c, onClose }) => {
  const { party, applyCredit } = useCommercial();
  return (
    <Drawer
      title={c.number}
      subtitle={`${party(c.customerId)?.name} · ${c.source}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => printDocument(`Credit note ${c.number}`, creditHtml(c, party(c.customerId)))}>
            <Printer size={14} /> Print credit note
          </button>
          <span className="sx-grow" />
          {c.status === 'OPEN' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => applyCredit(c.id)}>
              Apply to account
            </button>
          )}
        </>
      }
    >
      <DefList
        items={[
          ['Date', fmtDate(c.date)],
          ['Net', kes(c.net)],
          ['Restocking fee', kes(c.fee)],
          ['VAT', kes(c.vat)],
          ['Total', kes(c.total)],
          ['Issued by', c.by]
        ]}
      />
      <ul className="sx-list">
        {c.lines.map((l, i) => (
          <li key={i}>
            <span>{l.description}</span>
            <span>
              {l.qty} × {kes(l.price)}
            </span>
          </li>
        ))}
      </ul>
    </Drawer>
  );
};

const RmaEditor: React.FC<{ orderId: string; onClose: () => void }> = ({ orderId, onClose }) => {
  const { state, party, raiseRma } = useCommercial();
  const [oid, setOid] = useState(orderId);
  const [type, setType] = useState<RmaType>('STOCK');
  const [lot, setLot] = useState('');
  const o = state.orders.find((x) => x.id === oid);
  const [lines, setLines] = useState<Record<string, RmaLine>>({});
  const codes = state.reasonCodes.filter((r) => r.kind === 'RMA' && r.active);
  const eligible = state.orders.filter((x) => x.status === 'APPROVED' && x.lines.some((l) => l.delivered > 0));
  const set = (lineId: string, patch: Partial<RmaLine>) => setLines({ ...lines, [lineId]: { ...(lines[lineId] ?? { lineId, qty: 0, reasonCodeId: '', disposition: 'RESTOCK' }), ...patch } });
  return (
    <Modal
      size="lg"
      title="New return (RMA)"
      subtitle="Stock returns carry the customer's restocking fee; replacements and warranty raise a no-charge order"
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => raiseRma(oid, type, Object.values(lines), lot).ok && onClose()}>
            Raise return
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Order" span={2}>
          <select className="form-control" value={oid} onChange={(e) => (setOid(e.target.value), setLines({}))}>
            <option value="">Choose a delivered order…</option>
            {eligible.map((x) => (
              <option key={x.id} value={x.id}>
                {x.number} · {party(x.customerId)?.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select className="form-control" value={type} onChange={(e) => setType(e.target.value as RmaType)}>
            {(Object.keys(TYPE_LABEL) as RmaType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        {type === 'REPLACEMENT' && (
          <Field label="Replacement auction lot">
            <input className="form-control" value={lot} onChange={(e) => setLot(e.target.value)} placeholder="e.g. 4015" />
          </Field>
        )}
      </div>
      {o && (
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ textAlign: 'right' }}>Delivered</th>
              <th>Return qty</th>
              <th>Reason</th>
              <th>Disposition</th>
            </tr>
          </thead>
          <tbody>
            {o.lines
              .filter((l) => l.delivered > 0)
              .map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td style={{ textAlign: 'right' }}>{l.delivered}</td>
                  <td>
                    <input className="form-control" type="number" min="0" aria-label={`Return quantity ${l.description}`} value={lines[l.id]?.qty ?? 0} onChange={(e) => set(l.id, { qty: Number(e.target.value) })} />
                  </td>
                  <td>
                    <select className="form-control" aria-label="Return reason" value={lines[l.id]?.reasonCodeId ?? ''} onChange={(e) => set(l.id, { reasonCodeId: e.target.value })}>
                      <option value="">Reason…</option>
                      {codes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select className="form-control" aria-label="Disposition" value={lines[l.id]?.disposition ?? 'RESTOCK'} onChange={(e) => set(l.id, { disposition: e.target.value as RmaLine['disposition'] })}>
                      <option value="RESTOCK">Restock</option>
                      <option value="SCRAP">Scrap</option>
                      <option value="REPAIR">Repair</option>
                    </select>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
};
