import React, { useEffect, useState } from 'react';
import { BadgeCheck, CheckCircle2, FileInput, PauseCircle, Plus, Receipt, Scale, ShieldCheck } from 'lucide-react';
import { useCommercial } from '../store';
import { fmtDate, kes, round2, TODAY } from '../../finance/engine';
import { Attachments, ExportCsvButton } from '../../../platform/Widgets';
import { DataTable, DefList, Drawer, Empty, Field, Modal, Pill, SearchBox, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { PartySelect } from '../parts';
import { useProcurementExt } from './ext/store';
import { invoiceGross, invoiceNet, invoicePayableKes, invoiceVat, toleranceFor } from './ext/engine';
import { ReadOnlyNote, Tabs, TONE } from './ext/ui';
import type { InvoiceLine, SupplierInvoice, Tolerance } from './ext/types';

type IFilter = 'ALL' | 'CAPTURED' | 'ON_HOLD' | 'MATCHED' | 'BILLED' | 'REJECTED';
const STATUS_LABEL: Record<SupplierInvoice['status'], string> = { CAPTURED: 'To match', ON_HOLD: 'On hold', MATCHED: 'Matched — to post', BILLED: 'Billed in Finance', REJECTED: 'Rejected' };

export const InvoicesPage: React.FC = () => {
  const ext = useProcurementExt();
  const { party } = useCommercial();
  const [tab, setTab] = useState<'invoices' | 'notes' | 'tolerances'>('invoices');
  const [filter, setFilter] = useState<IFilter>('ALL');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  useEffect(() => {
    if (ext.page?.focus === 'new') setCapturing(true);
    else if (ext.page?.focus) setOpenId(ext.page.focus);
  }, [ext.page]);
  const list = ext.state.invoices;
  const rows = list.filter((i) => filter === 'ALL' || i.status === filter).filter((i) => !q || `${i.number} ${i.supplierRef} ${party(i.supplierId)?.name}`.toLowerCase().includes(q.toLowerCase()));
  const count = (f: IFilter) => list.filter((i) => f === 'ALL' || i.status === f).length;
  const columns: Column<SupplierInvoice>[] = [
    { key: 'n', header: 'Register no.', render: (i) => <b className="sx-mono">{i.number}</b>, sort: (i) => i.number, width: 130 },
    { key: 's', header: 'Supplier', render: (i) => <div className="sx-cell-main"><span>{party(i.supplierId)?.name}</span><small>Invoice {i.supplierRef} · {i.kind === 'ADVANCE' ? 'advance' : i.poId ? ext.ctx.com.state.purchaseOrders.find((o) => o.id === i.poId)?.number : 'no order'} · {i.source === 'SUPPLIER' ? 'portal' : 'keyed'}</small></div>, sort: (i) => party(i.supplierId)?.name ?? '' },
    { key: 'd', header: 'Date', render: (i) => fmtDate(i.date), sort: (i) => i.date, hideOnMobile: true },
    { key: 'v', header: 'Amount', render: (i) => `${i.currency} ${invoiceGross(i).toLocaleString()}`, sort: (i) => invoiceGross(i) * i.fxRate, align: 'right' },
    { key: 'm', header: 'Match', render: (i) => (i.matchMode === 'TWO_WAY' ? '2-way' : '3-way'), hideOnMobile: true },
    { key: 'st', header: 'Status', render: (i) => <Pill status={TONE[i.status]} label={STATUS_LABEL[i.status]} />, sort: (i) => i.status }
  ];
  const current = list.find((i) => i.id === openId);
  return (
    <SuitePage
      eyebrow="Accounts payable"
      title="Invoice matching"
      subtitle="Supplier invoices matched two- or three-way against orders and receipts, held when outside tolerance, then posted to Finance."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCapturing(true)}>
          <FileInput size={15} /> Capture invoice
        </button>
      }
    >
      <ReadOnlyNote show={ext.readOnly} />
      <div className="sx-stats">
        <Stat label="To match" value={count('CAPTURED')} detail="Run the match" icon={<Scale size={17} />} tone="blue" onClick={() => setFilter('CAPTURED')} />
        <Stat label="On hold" value={count('ON_HOLD')} detail={kes(round2(list.filter((i) => i.status === 'ON_HOLD').reduce((s, i) => s + invoiceGross(i) * i.fxRate, 0)), { compact: true })} icon={<PauseCircle size={17} />} tone={count('ON_HOLD') ? 'red' : 'green'} onClick={() => setFilter('ON_HOLD')} />
        <Stat label="Ready to post" value={count('MATCHED')} detail="Matched within tolerance" icon={<CheckCircle2 size={17} />} tone="gold" onClick={() => setFilter('MATCHED')} />
        <Stat label="Posted to Finance" value={count('BILLED')} icon={<Receipt size={17} />} onClick={() => setFilter('BILLED')} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['invoices', 'Invoices', list.length], ['notes', 'Credit & debit notes', ext.state.notes.length], ['tolerances', 'Tolerances & currency']]} />
      {tab === 'invoices' && (
        <>
          <div className="sx-toolbar">
            <Tabs
              value={filter}
              onChange={setFilter}
              tabs={(['ALL', 'CAPTURED', 'ON_HOLD', 'MATCHED', 'BILLED', 'REJECTED'] as IFilter[]).map((f) => [f, f === 'ALL' ? 'All' : STATUS_LABEL[f], count(f)] as [IFilter, string, number])}
            />
            <SearchBox value={q} onChange={setQ} placeholder="Search invoices…" />
          </div>
          <div className="prx-inline">
            <ExportCsvButton name="supplier-invoices" header={['Number', 'Supplier', 'Supplier ref', 'Date', 'Currency', 'Rate', 'Net', 'VAT', 'Gross', 'Payable KES', 'Status', 'Hold reason']} rows={() => rows.map((i) => [i.number, party(i.supplierId)?.name ?? '', i.supplierRef, i.date, i.currency, i.fxRate, invoiceNet(i), invoiceVat(i), invoiceGross(i), invoicePayableKes(i), i.status, i.hold?.reason ?? ''])} />
          </div>
          <DataTable rows={rows} columns={columns} rowKey={(i) => i.id} onRowClick={(i) => setOpenId(i.id)} selected={openId} initialSort={{ key: 'n', dir: 'desc' }} empty={<Empty icon={<Receipt size={20} />} title="No invoices here" />} />
        </>
      )}
      {tab === 'notes' && <NotesTab />}
      {tab === 'tolerances' && <TolerancesTab />}
      {current && <InvoiceDrawer inv={current} onClose={() => setOpenId(null)} />}
      {capturing && (
        <CaptureModal
          onClose={() => setCapturing(false)}
          onDone={(id) => {
            setCapturing(false);
            setOpenId(id);
          }}
        />
      )}
    </SuitePage>
  );
};

const CaptureModal: React.FC<{ onClose: () => void; onDone: (id: string) => void }> = ({ onClose, onDone }) => {
  const ext = useProcurementExt();
  const { state } = useCommercial();
  const [d, setD] = useState({ supplierId: '', supplierRef: '', poId: '', date: TODAY, currency: 'KES', kind: 'STANDARD' as 'STANDARD' | 'ADVANCE' });
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [charges, setCharges] = useState({ SHIPPING: 0, HANDLING: 0, OTHER: 0 });
  const [control, setControl] = useState(0);
  const pos = state.purchaseOrders.filter((o) => o.supplierId === d.supplierId && o.status === 'APPROVED' && o.lines.some((l) => l.qty > l.billed));
  const pickPo = (poId: string) => {
    const po = pos.find((o) => o.id === poId);
    setD({ ...d, poId });
    setLines(
      po
        ? po.lines
            .filter((l) => l.qty > l.billed)
            .map((l) => ({ id: `il${l.id}`, poLineId: d.kind === 'STANDARD' ? l.id : undefined, description: l.description, qty: Math.max(0, l.received - l.billed) || l.qty - l.billed, price: round2(l.price / (ext.state.fx[d.currency] ?? 1)), account: state.products.find((p) => p.sku === l.sku)?.account ?? '5000', vat: state.products.find((p) => p.sku === l.sku)?.vatable ?? true }))
        : []
    );
  };
  const ch = (Object.entries(charges) as ['SHIPPING' | 'HANDLING' | 'OTHER', number][]).filter(([, v]) => v > 0).map(([type, amount]) => ({ type, amount }));
  const gross = invoiceGross({ lines, charges: ch });
  const setLine = (id: string, patch: Partial<InvoiceLine>) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  return (
    <Modal
      size="xl"
      title="Capture a supplier invoice"
      subtitle="Key the invoice exactly as received — the match compares it with the order and goods received."
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">
            Lines + VAT <b>{d.currency} {gross.toLocaleString()}</b>
          </span>
          <span className="sx-grow" />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const r = ext.ap.capture({ ...d, poId: d.poId || undefined, lines, charges: ch, controlTotal: control, source: 'INTERNAL' });
              if (r.ok && r.id) onDone(r.id);
            }}
          >
            Register invoice
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Supplier" required span={2}>
          <PartySelect kind="SUPPLIER" value={d.supplierId} onChange={(v) => setD({ ...d, supplierId: v, poId: '' })} />
        </Field>
        <Field label="Supplier invoice no." required>
          <input className="form-control" value={d.supplierRef} onChange={(e) => setD({ ...d, supplierRef: e.target.value })} />
        </Field>
        <Field label="Invoice date" hint={`No future dates; older than ${ext.state.settings.backdateDays} days needs a manager`}>
          <input className="form-control" type="date" max={TODAY} value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className="form-control" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as 'STANDARD' | 'ADVANCE' })}>
            <option value="STANDARD">Invoice</option>
            <option value="ADVANCE">Advance / deposit</option>
          </select>
        </Field>
        <Field label="Currency" hint={d.currency !== 'KES' ? `1 ${d.currency} = KES ${ext.state.fx[d.currency]}` : undefined}>
          <select className="form-control" value={d.currency} onChange={(e) => setD({ ...d, currency: e.target.value })}>
            {Object.keys(ext.state.fx).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Purchase order">
          <select className="form-control" value={d.poId} onChange={(e) => pickPo(e.target.value)}>
            <option value="">No order (non-PO invoice)</option>
            {pos.map((o) => (
              <option key={o.id} value={o.id}>
                {o.number}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Invoice total incl. VAT" required hint="Header control: must equal the lines">
          <input className="form-control" type="number" min="0" value={control || ''} onChange={(e) => setControl(Number(e.target.value))} />
        </Field>
      </div>
      <table className="sx-mini-table sx-alloc">
        <thead>
          <tr>
            <th>Line</th>
            <th style={{ width: 90 }}>Qty</th>
            <th style={{ width: 130 }}>Unit price ({d.currency})</th>
            <th style={{ width: 90 }}>Account</th>
            <th>VAT</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td>
                <input className="form-control" value={l.description} onChange={(e) => setLine(l.id, { description: e.target.value })} disabled={!!l.poLineId} aria-label="Description" />
              </td>
              <td>
                <input className="form-control" type="number" min="0" value={l.qty} onChange={(e) => setLine(l.id, { qty: Number(e.target.value) })} aria-label={`Qty ${l.description}`} />
              </td>
              <td>
                <input className="form-control" type="number" min="0" value={l.price} onChange={(e) => setLine(l.id, { price: Number(e.target.value) })} aria-label={`Price ${l.description}`} />
              </td>
              <td>
                <input className="form-control" value={l.account} onChange={(e) => setLine(l.id, { account: e.target.value })} aria-label="Account" />
              </td>
              <td>
                <input type="checkbox" checked={l.vat} onChange={(e) => setLine(l.id, { vat: e.target.checked })} aria-label="VAT" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!d.poId && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { id: `il${Date.now()}`, description: '', qty: 1, price: 0, account: '6600', vat: true }])}>
          <Plus size={14} /> Add line
        </button>
      )}
      <div className="sx-grid">
        <Field label="Shipping">
          <input className="form-control" type="number" min="0" value={charges.SHIPPING || ''} onChange={(e) => setCharges({ ...charges, SHIPPING: Number(e.target.value) })} />
        </Field>
        <Field label="Handling">
          <input className="form-control" type="number" min="0" value={charges.HANDLING || ''} onChange={(e) => setCharges({ ...charges, HANDLING: Number(e.target.value) })} />
        </Field>
        <Field label="Other charges">
          <input className="form-control" type="number" min="0" value={charges.OTHER || ''} onChange={(e) => setCharges({ ...charges, OTHER: Number(e.target.value) })} />
        </Field>
      </div>
    </Modal>
  );
};

const InvoiceDrawer: React.FC<{ inv: SupplierInvoice; onClose: () => void }> = ({ inv, onClose }) => {
  const ext = useProcurementExt();
  const { party, actor, state, finance } = useCommercial();
  const [note, setNote] = useState('');
  const po = state.purchaseOrders.find((o) => o.id === inv.poId);
  const tol = toleranceFor(ext.state.tolerances, inv.supplierId, party(inv.supplierId)?.category);
  const bill = finance.state.documents.find((d) => d.id === inv.billId);
  const notes = ext.state.notes.filter((n) => n.supplierId === inv.supplierId && n.status === 'APPROVED');
  const block = ext.ap.invoiceBlock(inv.supplierId);
  return (
    <Drawer
      wide
      title={`${inv.number} · ${party(inv.supplierId)?.name}`}
      subtitle={`Supplier invoice ${inv.supplierRef} · ${fmtDate(inv.date)} · ${inv.source === 'SUPPLIER' ? 'submitted on the portal' : `keyed by ${inv.preparedBy}`}`}
      badge={<Pill status={TONE[inv.status]} label={STATUS_LABEL[inv.status]} />}
      onClose={onClose}
      footer={
        <div className="prx-inline">
          {(inv.status === 'CAPTURED' || inv.status === 'ON_HOLD') && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.ap.match(inv.id)}>
              <Scale size={14} /> Run match
            </button>
          )}
          {inv.status === 'MATCHED' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.ap.post(inv.id)}>
              <Receipt size={14} /> Post to Finance
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.ap.validateEtims(inv.id)}>
            <ShieldCheck size={14} /> eTIMS check (simulated)
          </button>
        </div>
      }
    >
      {block && (
        <div className="sx-callout danger">
          <PauseCircle size={16} />
          <div>
            <b>Supplier blocked</b>
            <span>{block}</span>
          </div>
        </div>
      )}
      {inv.hold && (
        <div className="sx-callout warn">
          <PauseCircle size={16} />
          <div>
            <b>On hold — {inv.hold.by}</b>
            <span>{inv.hold.reason}</span>
          </div>
        </div>
      )}
      <div className="sx-amount-hero">
        <div>
          <span>Invoice total</span>
          <strong>
            {inv.currency} {invoiceGross(inv).toLocaleString()}
          </strong>
        </div>
        <div>
          <span>Payable (KES)</span>
          <b>{kes(invoicePayableKes(inv))}</b>
        </div>
        <div>
          <span>Control total</span>
          <b>{inv.controlTotal.toLocaleString()}</b>
        </div>
      </div>
      <DefList
        items={[
          ['Order', po?.number ?? (inv.kind === 'ADVANCE' ? 'Advance' : 'Non-order invoice')],
          ['Currency', inv.currency === 'KES' ? 'KES' : `${inv.currency} at ${inv.fxRate}`],
          ['Match rule', `${tol.mode === 'TWO_WAY' ? 'Two' : 'Three'}-way · price ±${tol.pricePct}% · qty ±${tol.qtyPct}% · amount KES ${tol.amount.toLocaleString()}`],
          ['Advance offset', kes(inv.advanceApplied)],
          ['Credit notes applied', kes(inv.creditApplied)],
          ['eTIMS', inv.etims ? `${inv.etims.ok ? 'Valid' : 'Failed'} · ${inv.etims.cu}` : 'Not checked'],
          ['Finance bill', bill ? `${bill.number} · ${bill.status.toLowerCase()}` : '—']
        ]}
      />
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Line</th>
            <th style={{ textAlign: 'right' }}>Qty</th>
            <th style={{ textAlign: 'right' }}>Price</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.description}</td>
              <td style={{ textAlign: 'right' }}>{l.qty}</td>
              <td style={{ textAlign: 'right' }}>{l.price.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{round2(l.qty * l.price).toLocaleString()}</td>
            </tr>
          ))}
          {inv.charges.map((c, i) => (
            <tr key={i}>
              <td>{c.type.toLowerCase()} charge</td>
              <td />
              <td />
              <td style={{ textAlign: 'right' }}>{c.amount.toLocaleString()}</td>
            </tr>
          ))}
          <tr>
            <td>VAT</td>
            <td />
            <td />
            <td style={{ textAlign: 'right' }}>{invoiceVat(inv).toLocaleString()}</td>
          </tr>
        </tbody>
      </table>
      {inv.variances.length > 0 && (
        <>
          <h4 className="sx-subhead">Match result</h4>
          <table className="sx-mini-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Check</th>
                <th style={{ textAlign: 'right' }}>Expected</th>
                <th style={{ textAlign: 'right' }}>Invoiced</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {inv.variances.map((v, i) => (
                <tr key={i}>
                  <td>{v.description}</td>
                  <td>{v.kind.replace('_', ' ').toLowerCase()}</td>
                  <td style={{ textAlign: 'right' }}>{v.expected.toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{v.actual.toLocaleString()}</td>
                  <td className={v.within ? 'sx-success-text' : 'sx-danger-text'}>{v.within ? 'Within tolerance' : 'Out of tolerance'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {inv.status !== 'BILLED' && inv.status !== 'REJECTED' && (
        <div className="prx-inline">
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / note" />
          {inv.status === 'ON_HOLD' ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.ap.release(inv.id, note).ok && setNote('')}>
              Release hold
            </button>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.ap.hold(inv.id, note).ok && setNote('')}>
              Put on hold
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.ap.reject(inv.id, note).ok && setNote('')}>
            Reject
          </button>
        </div>
      )}
      {notes.length > 0 && inv.status !== 'REJECTED' && (
        <>
          <h4 className="sx-subhead">Approved notes to offset</h4>
          <ul className="sx-list">
            {notes.map((n) => (
              <li key={n.id}>
                <span className="sx-mono">{n.number}</span>
                <span>{n.reason}</span>
                <b>{kes(n.amount)}</b>
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => ext.ap.applyNote(n.id, inv.id)}>
                  Apply
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Attachments owner={`sinv:${inv.id}`} by={actor.name} readOnly={ext.readOnly} title="Invoice scan" />
      <h4 className="sx-subhead">History</h4>
      <Timeline items={inv.history} />
    </Drawer>
  );
};

const NotesTab: React.FC = () => {
  const ext = useProcurementExt();
  const { party, state } = useCommercial();
  const [d, setD] = useState({ kind: 'CREDIT' as 'CREDIT' | 'DEBIT', supplierId: '', invoiceId: '', grnRef: '', reason: '', amount: 0 });
  const [note, setNote] = useState('');
  return (
    <>
      <DataTable
        rows={ext.state.notes}
        rowKey={(n) => n.id}
        empty={<Empty title="No credit or debit notes" />}
        columns={[
          { key: 'n', header: 'Note', render: (n) => <b className="sx-mono">{n.number}</b> },
          { key: 'k', header: 'Type', render: (n) => (n.kind === 'CREDIT' ? 'Credit note (from supplier)' : 'Debit note (to supplier)') },
          { key: 's', header: 'Supplier', render: (n) => party(n.supplierId)?.name },
          { key: 'r', header: 'Reason', render: (n) => <div className="sx-cell-main"><span>{n.reason}</span><small>{[n.grnRef, ext.state.invoices.find((i) => i.id === n.invoiceId)?.number].filter(Boolean).join(' · ')}</small></div> },
          { key: 'a', header: 'Amount', render: (n) => kes(n.amount), align: 'right' },
          { key: 'st', header: 'Status', render: (n) => <Pill status={TONE[n.status]} label={n.status.toLowerCase()} /> },
          {
            key: 'x',
            header: '',
            render: (n) =>
              n.status === 'SUBMITTED' ? (
                <span className="prx-inline">
                  <button type="button" className="btn btn-primary btn-xs" onClick={() => ext.ap.decideNote(n.id, true, note)}>
                    Approve
                  </button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => ext.ap.decideNote(n.id, false, note || 'Not agreed')}>
                    Reject
                  </button>
                </span>
              ) : null
          }
        ]}
      />
      <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Approval comment" />
      <h4 className="sx-subhead">Record a note</h4>
      <div className="prx-inline">
        <select className="form-control" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as 'CREDIT' | 'DEBIT' })} aria-label="Type">
          <option value="CREDIT">Credit note received</option>
          <option value="DEBIT">Debit note to supplier</option>
        </select>
        <PartySelect kind="SUPPLIER" value={d.supplierId} onChange={(v) => setD({ ...d, supplierId: v, invoiceId: '' })} />
        <select className="form-control" value={d.invoiceId} onChange={(e) => setD({ ...d, invoiceId: e.target.value })} aria-label="Invoice">
          <option value="">No invoice</option>
          {ext.state.invoices
            .filter((i) => i.supplierId === d.supplierId)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.number} · {i.supplierRef}
              </option>
            ))}
        </select>
        <select className="form-control" value={d.grnRef} onChange={(e) => setD({ ...d, grnRef: e.target.value })} aria-label="Goods received note">
          <option value="">No GRN</option>
          {state.receipts
            .filter((g) => state.purchaseOrders.find((o) => o.id === g.poId)?.supplierId === d.supplierId)
            .map((g) => (
              <option key={g.id}>{g.number}</option>
            ))}
        </select>
        <input className="form-control" value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} placeholder="Reason (e.g. 4 cartons damaged)" />
        <input className="form-control" type="number" min="0" value={d.amount || ''} onChange={(e) => setD({ ...d, amount: Number(e.target.value) })} placeholder="Amount KES" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.ap.raiseNote({ ...d, invoiceId: d.invoiceId || undefined, grnRef: d.grnRef || undefined }).ok && setD({ ...d, reason: '', amount: 0 })}>
          <Plus size={14} /> Record
        </button>
      </div>
      <p className="sx-muted">Approved notes offset the supplier's invoices here (payable reduces before posting). Posting them as separate credit documents in the general ledger needs a credit-note document type in Finance.</p>
    </>
  );
};

export const TolerancesTab: React.FC = () => {
  const ext = useProcurementExt();
  const { finance } = useCommercial();
  const [t, setT] = useState<Omit<Tolerance, 'id'> & { id?: string }>({ scope: 'DEFAULT', mode: 'THREE_WAY', pricePct: 2, qtyPct: 0, amount: 1000 });
  const [fx, setFx] = useState({ c: 'USD', r: 0 });
  const scopes = ['DEFAULT', ...new Set(finance.state.parties.filter((p) => p.kind === 'SUPPLIER').map((p) => p.category))];
  const scopeName = (s: string) => (s === 'DEFAULT' ? 'Default' : (finance.state.parties.find((p) => p.id === s)?.name ?? s));
  return (
    <>
      <h4 className="sx-subhead">Match tolerances</h4>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Applies to</th>
            <th>Match</th>
            <th style={{ textAlign: 'right' }}>Price</th>
            <th style={{ textAlign: 'right' }}>Quantity</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ext.state.tolerances.map((x) => (
            <tr key={x.id}>
              <td>{scopeName(x.scope)}</td>
              <td>{x.mode === 'TWO_WAY' ? 'Two-way (order)' : 'Three-way (order + receipt)'}</td>
              <td style={{ textAlign: 'right' }}>±{x.pricePct}%</td>
              <td style={{ textAlign: 'right' }}>+{x.qtyPct}%</td>
              <td style={{ textAlign: 'right' }}>{kes(x.amount)}</td>
              <td>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setT({ ...x })}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="prx-inline">
        <select className="form-control" value={t.scope} onChange={(e) => setT({ ...t, scope: e.target.value })} aria-label="Scope">
          {scopes.map((s) => (
            <option key={s} value={s}>
              {scopeName(s)}
            </option>
          ))}
          {finance.state.parties
            .filter((p) => p.kind === 'SUPPLIER')
            .map((p) => (
              <option key={p.id} value={p.id}>
                Supplier: {p.name}
              </option>
            ))}
        </select>
        <select className="form-control" value={t.mode} onChange={(e) => setT({ ...t, mode: e.target.value as Tolerance['mode'] })} aria-label="Match mode">
          <option value="THREE_WAY">Three-way</option>
          <option value="TWO_WAY">Two-way</option>
        </select>
        <input className="form-control" type="number" min="0" value={t.pricePct} onChange={(e) => setT({ ...t, pricePct: Number(e.target.value) })} aria-label="Price tolerance %" />
        <input className="form-control" type="number" min="0" value={t.qtyPct} onChange={(e) => setT({ ...t, qtyPct: Number(e.target.value) })} aria-label="Quantity tolerance %" />
        <input className="form-control" type="number" min="0" value={t.amount} onChange={(e) => setT({ ...t, amount: Number(e.target.value) })} aria-label="Amount tolerance" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.ap.saveTolerance(t)}>
          <BadgeCheck size={14} /> Save tolerance
        </button>
      </div>
      <h4 className="sx-subhead">Exchange rates (to KES)</h4>
      <ul className="sx-facts">
        {Object.entries(ext.state.fx).map(([c, r]) => (
          <li key={c}>
            <span>{c}</span>
            <b>{r}</b>
          </li>
        ))}
      </ul>
      <div className="prx-inline">
        <input className="form-control" value={fx.c} onChange={(e) => setFx({ ...fx, c: e.target.value.toUpperCase() })} aria-label="Currency" maxLength={3} />
        <input className="form-control" type="number" min="0" step="0.01" value={fx.r || ''} onChange={(e) => setFx({ ...fx, r: Number(e.target.value) })} placeholder="KES per unit" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.ap.setFx(fx.c, fx.r)}>
          Save rate
        </button>
      </div>
    </>
  );
};
