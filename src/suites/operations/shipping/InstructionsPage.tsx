import React, { useMemo, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, ClipboardList, FilePlus2, Lock, Plus, Printer, Ship, Trash2, Unlock } from 'lucide-react';
import { Attachments, ExportCsvButton } from '../../../platform/Widgets';
import { useAccess } from '../../../platform/access';
import { fmtDate, kes, TODAY, addDays } from '../../finance/engine';
import { Chips, DataTable, DefList, Drawer, Field, FlowSteps, Modal, Panel, Pill, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { useOperations } from '../store';
import { availableKg } from '../warehousing/engine';
import { ReadOnlyNote } from '../warehousing/ui';
import { scheduleRisk, SI_FLOW, SI_LABEL, SI_PILL, siBags, siKg, siStockCheck, siValue, suggestStuffingBase } from './engine';
import { DISTRIBUTION, useShippingExt } from './store';
import type { ShippingInstruction, SiHeader } from './types';
import { useDocCtx } from './useDocCtx';

type Filter = 'open' | 'hold' | 'draft' | 'all';

export const InstructionsPage: React.FC = () => {
  const { state, actor, party } = useShippingExt();
  const { shipping } = useOperations();
  const portal = actor.role === 'CUSTOMER';
  const [filter, setFilter] = useState<Filter>('open');
  const [openId, setOpenId] = useState<string | null>(shipping.focus && state.instructions.some((s) => s.id === shipping.focus) ? shipping.focus : null);
  const [editing, setEditing] = useState<ShippingInstruction | 'new' | null>(shipping.focus === 'new' ? 'new' : null);
  const visible = state.instructions.filter((s) => !portal || s.customerId === actor.customerId);
  const rows = visible.filter((s) => (filter === 'all' ? true : filter === 'draft' ? s.status === 'DRAFT' : filter === 'hold' ? s.status === 'CREDIT_HOLD' || !!s.blocked : !['DRAFT', 'SHIPPED', 'CANCELLED'].includes(s.status)));
  const voyage = (id?: string) => state.voyages.find((v) => v.id === id);
  const cols: Column<ShippingInstruction>[] = [
    { key: 'n', header: 'SI', render: (s) => <div className="sx-cell-main"><b className="sx-mono">{s.number}</b><small>v{s.version} · {s.channel === 'PORTAL' ? 'portal' : 'office'}</small></div>, sort: (s) => s.number, width: 150 },
    { key: 'c', header: 'Customer', render: (s) => <div className="sx-cell-main"><span>{party(s.customerId)?.name}</span><small>{s.contractRef} → {s.destination}</small></div> },
    { key: 'v', header: 'Vessel', render: (s) => { const v = voyage(s.voyageId); const r = scheduleRisk(s, v); return <div className="sx-cell-main"><span>{v ? `${v.vessel} ${v.voyage}` : '—'}</span><small className={r?.level === 'LATE' ? 'sx-danger-text' : ''}>{r?.text ?? (v ? `cut-off ${fmtDate(v.cutOff)}` : '')}</small></div>; }, hideOnMobile: true },
    { key: 'k', header: 'Tea', render: (s) => `${siBags(s)} bags · ${siKg(s).toLocaleString()} kg`, align: 'right', hideOnMobile: true },
    { key: 'val', header: 'Value', render: (s) => kes(siValue(s), { compact: true }), sort: (s) => siValue(s), align: 'right' },
    { key: 's', header: 'Status', render: (s) => <>{<Pill status={SI_PILL[s.status]} label={SI_LABEL[s.status]} />} {s.blocked && <Pill status="REJECTED" label="blocked" />}</> }
  ];
  const open = visible.find((s) => s.id === openId);
  return (
    <SuitePage
      eyebrow={portal ? 'Customer portal' : 'Shipping'}
      title="Shipping instructions"
      subtitle={portal ? `Prepare and track your shipping instructions with us. You see only ${party(actor.customerId ?? '')?.name ?? 'your company'}'s records.` : 'Customer instructions from the portal or the office: credit check, stock confirmation and reservation, stuffing base, then booking on the vessel.'}
      actions={
        <>
          <ExportCsvButton name="shipping-instructions" header={['number', 'version', 'customer', 'contract', 'destination', 'incoterm', 'vessel', 'bags', 'kg', 'valueKES', 'status', 'readyBy']} rows={() => rows.map((s) => [s.number, s.version, party(s.customerId)?.name ?? '', s.contractRef, s.destination, s.incoterm, voyage(s.voyageId)?.vessel ?? '', siBags(s), siKg(s), siValue(s), s.status, s.readyBy])} />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
            <Plus size={15} /> New instruction
          </button>
        </>
      }
    >
      <ReadOnlyNote />
      <div className="sx-stats">
        <Stat label="Open instructions" value={visible.filter((s) => !['DRAFT', 'SHIPPED', 'CANCELLED'].includes(s.status)).length} detail={kes(visible.filter((s) => !['DRAFT', 'SHIPPED', 'CANCELLED'].includes(s.status)).reduce((x, s) => x + siValue(s), 0), { compact: true })} icon={<ClipboardList size={17} />} />
        <Stat label="Awaiting confirmation" value={visible.filter((s) => s.status === 'SUBMITTED').length} icon={<CheckCircle2 size={17} />} tone="blue" />
        <Stat label="Credit hold / blocked" value={visible.filter((s) => s.status === 'CREDIT_HOLD' || s.blocked).length} icon={<Lock size={17} />} tone="red" onClick={() => setFilter('hold')} />
        <Stat label="Vessel risk" value={visible.filter((s) => scheduleRisk(s, voyage(s.voyageId))?.level === 'LATE').length} detail="Cut-off before the tea is ready" icon={<AlertTriangle size={17} />} tone="gold" />
      </div>
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'open', label: 'In progress' },
          { value: 'hold', label: 'On hold' },
          { value: 'draft', label: 'Drafts' },
          { value: 'all', label: 'All' }
        ]}
      />
      <DataTable rows={rows} columns={cols} rowKey={(s) => s.id} onRowClick={(s) => setOpenId(s.id)} selected={openId} initialSort={{ key: 'n', dir: 'desc' }} empty="No instructions here" />
      {open && <SiDrawer si={open} onClose={() => setOpenId(null)} onEdit={() => setEditing(open)} />}
      {editing && <SiEditor si={editing === 'new' ? undefined : editing} mode={editing !== 'new' && editing.status !== 'DRAFT' ? 'amend' : 'edit'} onClose={() => setEditing(null)} onSaved={(id) => setOpenId(id)} />}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */

const SiDrawer: React.FC<{ si: ShippingInstruction; onClose: () => void; onEdit: () => void }> = ({ si, onClose, onEdit }) => {
  const shp = useShippingExt();
  const { state, actor, party, wh, ops } = shp;
  const { readOnly } = useAccess();
  const docs = useDocCtx();
  const [note, setNote] = useState('');
  const portal = actor.role === 'CUSTOMER';
  const v = state.voyages.find((x) => x.id === si.voyageId);
  const risk = scheduleRisk(si, v);
  const check = siStockCheck(si, wh.state.lots);
  const base = suggestStuffingBase(si);
  const pending = si.amendments.find((a) => a.status === 'PENDING');
  const flowAt = si.status === 'CREDIT_HOLD' ? 1 : Math.max(0, SI_FLOW.indexOf(si.status));
  const sh = si.shipmentId ? ops.state.shipments.find((x) => x.id === si.shipmentId) : undefined;
  const act = (r: { ok: boolean }) => r.ok && setNote('');
  const ctx = { si, party: party(si.customerId) };
  return (
    <Drawer wide title={si.number} subtitle={`${party(si.customerId)?.name} · ${si.contractRef} · v${si.version}`} badge={<Pill status={SI_PILL[si.status]} label={SI_LABEL[si.status]} />} onClose={onClose}>
      <FlowSteps steps={['Draft', 'Submitted', 'Confirmed', 'Booked', 'Shipped']} at={flowAt} off={si.status === 'CANCELLED'} note={si.status === 'CREDIT_HOLD' ? { 1: 'Credit hold' } : undefined} />
      {si.blocked && (
        <div className="sx-callout warn">
          <Ban size={16} />
          <div>
            <b>Blocked by {si.blocked.by}</b>
            <span>{si.blocked.reason}</span>
          </div>
        </div>
      )}
      {risk && (
        <div className="sx-callout warn">
          <AlertTriangle size={16} />
          <div>
            <b>Vessel schedule</b>
            <span>{risk.text}</span>
          </div>
        </div>
      )}
      <DefList
        items={[
          ['Destination', `${si.destination} (${si.incoterm})`],
          ['Consignee', si.consignee],
          ['Notify party', si.notifyParty],
          ['Vessel', v ? `${v.vessel} ${v.voyage} · cut-off ${fmtDate(v.cutOff)} · ETD ${fmtDate(v.etd)}` : '—'],
          ['Ready for stuffing by', fmtDate(si.readyBy)],
          ['Markings', si.markings || '—'],
          ['Stuffing base', si.stuffingBase ? wh.whName(si.stuffingBase) : base.base ? `${wh.whName(base.base)} (suggested)` : '—'],
          ['Shipment', sh ? `${sh.number} · ${sh.stage.toLowerCase()}` : '—'],
          ['Credit', si.credit ? `${si.credit.status} · exposure ${kes(si.credit.exposure, { compact: true })} of ${kes(si.credit.limit, { compact: true })}${si.credit.releasedBy ? ` · released by ${si.credit.releasedBy}` : ''}` : 'Checked on submission']
        ]}
      />
      <h4 className="sx-subhead">Teas ({siBags(si)} bags · {siKg(si).toLocaleString()} kg · {kes(siValue(si))})</h4>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Lot / invoice</th>
            <th>Garden · grade</th>
            <th>Warehouse</th>
            <th style={{ textAlign: 'right' }}>Bags</th>
            <th style={{ textAlign: 'right' }}>Net kg</th>
            <th style={{ textAlign: 'right' }}>KES/kg</th>
            {['SUBMITTED', 'CREDIT_HOLD', 'DRAFT'].includes(si.status) && <th>Stock</th>}
          </tr>
        </thead>
        <tbody>
          {si.lines.map((l, i) => (
            <tr key={l.lotId}>
              <td className="sx-mono">
                {l.lotNo} · {l.invoiceNo}
              </td>
              <td>
                {l.garden} {l.grade}
              </td>
              <td>{wh.whName(l.warehouseId)}</td>
              <td style={{ textAlign: 'right' }}>{l.bags}</td>
              <td style={{ textAlign: 'right' }}>{l.netKg.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{l.pricePerKg.toLocaleString()}</td>
              {['SUBMITTED', 'CREDIT_HOLD', 'DRAFT'].includes(si.status) && <td className={check[i].ok ? 'sx-success-text' : 'sx-danger-text'}>{check[i].ok ? 'Available' : check[i].reason}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {base.toTransfer.length > 0 && !['SHIPPED', 'CANCELLED'].includes(si.status) && (
        <p className="sx-note">
          Most of the tea is at {wh.whName(base.base ?? '')} ({base.byWarehouse.map(([w, kg]) => `${wh.whName(w)} ${kg.toLocaleString()} kg`).join(' · ')}). Transfer {base.toTransfer.map((l) => l.lotNo).join(', ')} there before stuffing.
        </p>
      )}
      {!readOnly && (
        <div className="sx-actions" style={{ flexWrap: 'wrap', margin: '12px 0' }}>
          {si.status === 'DRAFT' && (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
                Edit
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.submitSi(si.id)}>
                Submit
              </button>
            </>
          )}
          {si.status === 'SUBMITTED' && !portal && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.confirmSi(si.id)}>
              <CheckCircle2 size={14} /> Confirm stock & reserve
            </button>
          )}
          {si.status === 'CONFIRMED' && !portal && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => shp.convertToShipment(si.id)}>
              <Ship size={14} /> Book shipment
            </button>
          )}
          {['CONFIRMED', 'IN_PROGRESS'].includes(si.status) && !pending && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
              <FilePlus2 size={14} /> Request amendment
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => docs.print('si', `Shipping instruction ${si.number}`, ctx)}>
            <Printer size={14} /> Print SI
          </button>
          {!portal && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => docs.print('proforma', `Proforma ${si.number}`, ctx)}>
              <Printer size={14} /> Proforma
            </button>
          )}
        </div>
      )}
      {!readOnly && (
        <div className="sx-inline-form">
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / note (for release, block, cancel)" aria-label="Note" />
          {si.status === 'CREDIT_HOLD' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => act(shp.releaseCredit(si.id, note))}>
              <Unlock size={14} /> Release credit
            </button>
          )}
          {!['SHIPPED', 'CANCELLED'].includes(si.status) &&
            (si.blocked ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(shp.blockSi(si.id, null))}>
                <Unlock size={14} /> Unblock
              </button>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(shp.blockSi(si.id, note))}>
                <Ban size={14} /> Block
              </button>
            ))}
          {['DRAFT', 'SUBMITTED', 'CREDIT_HOLD', 'CONFIRMED'].includes(si.status) && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(shp.cancelSi(si.id, note))}>
              <Trash2 size={14} /> Cancel SI
            </button>
          )}
        </div>
      )}
      {si.amendments.length > 0 && (
        <>
          <h4 className="sx-subhead">Amendments</h4>
          {si.amendments.map((a) => (
            <Panel key={a.id} title={`Version ${a.version} — ${a.status.toLowerCase()}`} subtitle={`${a.requestedBy} · ${a.at} · ${a.reason}`}>
              <table className="sx-mini-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Was</th>
                    <th>Becomes</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(a.patch).map(([k, val]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className="sx-muted">{k === 'lines' ? si.lines.map((l) => `${l.lotNo}×${l.bags}`).join(', ') : String((si as unknown as Record<string, unknown>)[k] ?? '—')}</td>
                      <td>
                        <b>{k === 'lines' ? (val as ShippingInstruction['lines']).map((l) => `${l.lotNo}×${l.bags}`).join(', ') : k === 'voyageId' ? (state.voyages.find((x) => x.id === val)?.vessel ?? String(val)) : String(val ?? '—')}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {a.status === 'PENDING' && !readOnly && (
                <div className="sx-actions">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => act(shp.decideAmendment(si.id, a.id, true, note))}>
                    Approve
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => act(shp.decideAmendment(si.id, a.id, false, note))}>
                    Reject (uses the note)
                  </button>
                </div>
              )}
              {a.decidedBy && <p className="sx-muted">Decided by {a.decidedBy} · {a.decidedAt}{a.note ? ` · ${a.note}` : ''}</p>}
            </Panel>
          ))}
        </>
      )}
      {['CONFIRMED', 'IN_PROGRESS', 'SHIPPED'].includes(si.status) && !portal && (
        <>
          <h4 className="sx-subhead">Distribution on confirmation</h4>
          <table className="sx-mini-table">
            <tbody>
              {DISTRIBUTION.map((d) => (
                <tr key={d.to}>
                  <td>{d.to}</td>
                  <td className="sx-muted">{d.docs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <Attachments owner={`si:${si.id}`} by={actor.name} readOnly={readOnly} title="Documents (contract, LC, client approvals)" />
      <h4 className="sx-subhead">History</h4>
      <Timeline items={si.history} />
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */

type DraftLine = { lotId: string; bags: number; pricePerKg: number };

const SiEditor: React.FC<{ si?: ShippingInstruction; mode: 'edit' | 'amend'; onClose: () => void; onSaved: (id: string) => void }> = ({ si, mode, onClose, onSaved }) => {
  const shp = useShippingExt();
  const { state, actor, wh, ops } = shp;
  const portal = actor.role === 'CUSTOMER';
  const customers = ops.finance.snapshot().parties.filter((p) => p.kind === 'CUSTOMER');
  const [customerId, setCustomer] = useState(si?.customerId ?? (portal ? (actor.customerId ?? '') : 'c8'));
  const [contractRef, setContract] = useState(si?.contractRef ?? '');
  const [buyerRef, setBuyerRef] = useState(si?.buyerRef ?? '');
  const [h, setH] = useState<SiHeader>(si ? { destination: si.destination, incoterm: si.incoterm, voyageId: si.voyageId, consignee: si.consignee, notifyParty: si.notifyParty, markings: si.markings, readyBy: si.readyBy } : { destination: '', incoterm: 'FOB', voyageId: state.voyages[0]?.id, consignee: '', notifyParty: '', markings: '', readyBy: addDays(TODAY, 7) });
  const [lines, setLines] = useState<DraftLine[]>(si ? si.lines.map((l) => ({ lotId: l.lotId, bags: l.bags, pricePerKg: l.pricePerKg })) : [{ lotId: '', bags: 0, pricePerKg: 0 }]);
  const [reason, setReason] = useState('');
  const sh = si?.shipmentId ? ops.state.shipments.find((x) => x.id === si.shipmentId) : undefined;
  const lotsOk = mode === 'edit' || !sh;
  const lotChoices = useMemo(() => wh.state.lots.filter((l) => l.status === 'IN_STOCK' && (l.ownership !== 'CUSTOMER' || l.owner === customerId) && (availableKg(l) > 0 || lines.some((x) => x.lotId === l.id) || l.reservedFor === si?.number)), [wh.state.lots, customerId, lines, si?.number]);
  const set = <K extends keyof SiHeader>(k: K, v: SiHeader[K]) => setH({ ...h, [k]: v });
  const save = () => {
    if (mode === 'amend' && si) {
      const patch: Record<string, unknown> = { ...h };
      if (lotsOk) {
        const newLines = lines
          .filter((l) => l.lotId)
          .map((l) => {
            const lot = wh.state.lots.find((x) => x.id === l.lotId)!;
            return { lotId: l.lotId, lotNo: lot.lotNo, garden: lot.garden, grade: lot.grade, invoiceNo: lot.invoiceNo, bags: l.bags, netKg: Math.round(l.bags * lot.kgPerBag * 100) / 100, warehouseId: lot.warehouseId, pricePerKg: l.pricePerKg };
          });
        if (JSON.stringify(newLines) !== JSON.stringify(si.lines)) patch.lines = newLines;
      }
      const r = shp.requestAmendment(si.id, patch, reason);
      if (r.ok) onClose();
      return;
    }
    const r = shp.saveSi({ id: si?.id, customerId, contractRef, buyerRef, ...h, lines });
    if (r.ok) {
      onClose();
      if (r.id) onSaved(r.id);
    }
  };
  return (
    <Modal
      size="xl"
      title={mode === 'amend' ? `Request amendment to ${si?.number}` : si ? `Edit ${si.number}` : portal ? 'New shipping instruction (customer portal)' : 'New shipping instruction'}
      subtitle={mode === 'amend' ? 'The Operations Manager approves the change before it applies; a booked shipment can change header details only.' : undefined}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-sm" onClick={save}>
          {mode === 'amend' ? 'Send for approval' : 'Save draft'}
        </button>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Field label="Customer" required>
          <select className="form-control" value={customerId} disabled={portal || mode === 'amend'} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">Choose…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sales contract" required>
          <input className="form-control" value={contractRef} disabled={mode === 'amend'} onChange={(e) => setContract(e.target.value)} placeholder="e.g. SC-2026-118" />
        </Field>
        <Field label="Buyer reference">
          <input className="form-control" value={buyerRef} disabled={mode === 'amend'} onChange={(e) => setBuyerRef(e.target.value)} />
        </Field>
        <Field label="Destination port" required>
          <input className="form-control" value={h.destination} onChange={(e) => set('destination', e.target.value)} placeholder="e.g. Jebel Ali, UAE" />
        </Field>
        <Field label="Incoterm">
          <select className="form-control" value={h.incoterm} onChange={(e) => set('incoterm', e.target.value as SiHeader['incoterm'])}>
            <option>FOB</option>
            <option>CFR</option>
            <option>CIF</option>
          </select>
        </Field>
        <Field label="Vessel / voyage">
          <select className="form-control" value={h.voyageId ?? ''} onChange={(e) => set('voyageId', e.target.value || undefined)}>
            <option value="">To be advised</option>
            {state.voyages.map((v) => (
              <option key={v.id} value={v.id}>
                {v.vessel} {v.voyage} — cut-off {fmtDate(v.cutOff)}, ETD {fmtDate(v.etd)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Consignee" required>
          <input className="form-control" value={h.consignee} onChange={(e) => set('consignee', e.target.value)} />
        </Field>
        <Field label="Notify party">
          <input className="form-control" value={h.notifyParty} onChange={(e) => set('notifyParty', e.target.value)} />
        </Field>
        <Field label="Ready for stuffing by" required>
          <input className="form-control" type="date" value={h.readyBy} onChange={(e) => set('readyBy', e.target.value)} />
        </Field>
        <Field label="Bag markings">
          <input className="form-control" value={h.markings} onChange={(e) => set('markings', e.target.value)} placeholder="e.g. HORIZON / JEBEL ALI / LOT No." />
        </Field>
      </div>
      <h4 className="sx-subhead">Teas {!lotsOk && <span className="sx-muted">(locked — shipment booked)</span>}</h4>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Lot</th>
            <th style={{ textAlign: 'right' }}>Available</th>
            <th style={{ width: 100 }}>Bags</th>
            <th style={{ width: 120 }}>KES / kg</th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const lot = wh.state.lots.find((x) => x.id === l.lotId);
            return (
              <tr key={i}>
                <td>
                  <select className="form-control" value={l.lotId} disabled={!lotsOk} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, lotId: e.target.value } : x)))} aria-label="Lot">
                    <option value="">Choose a lot…</option>
                    {lotChoices.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.lotNo} · {x.garden} {x.grade} · {x.invoiceNo} · {wh.whName(x.warehouseId)}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ textAlign: 'right' }}>{lot ? `${Math.floor(availableKg(lot) / lot.kgPerBag)} bags · ${availableKg(lot).toLocaleString()} kg` : '—'}</td>
                <td>
                  <input className="form-control" type="number" min="1" disabled={!lotsOk} value={l.bags || ''} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, bags: Number(e.target.value) } : x)))} aria-label="Bags" />
                </td>
                <td>
                  <input className="form-control" type="number" min="0" disabled={!lotsOk} value={l.pricePerKg || ''} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, pricePerKg: Number(e.target.value) } : x)))} aria-label="Price per kg" />
                </td>
                <td>
                  <button type="button" className="sx-icon-btn" disabled={!lotsOk || lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remove">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {lotsOk && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { lotId: '', bags: 0, pricePerKg: 0 }])}>
          <Plus size={14} /> Add a lot
        </button>
      )}
      {mode === 'amend' && (
        <Field label="Reason for the amendment" required span={2}>
          <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Buyer moved to the next vessel" />
        </Field>
      )}
    </Modal>
  );
};
