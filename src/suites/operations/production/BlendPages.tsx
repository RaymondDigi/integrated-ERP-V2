import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, FlaskConical, Layers, Lock, Package, Play, Plus, Send, ShoppingCart, Sparkles, Trash2, Unlock, Users, Wand2, XCircle } from 'lucide-react';
import { addDays, fmtDate, kes, round2, TODAY } from '../../finance/engine';
import { useOperations } from '../store';
import { ApprovalPanel, Chips, DataTable, DefList, Drawer, Field, FlowSteps, Modal, Panel, Pill, SearchBox, Stat, SuitePage, type Column, type FlowAction } from '../../ui/kit';
import { Attachments, ExportCsvButton, ImportCsvButton, PrintButton, esc } from '../../../platform/Widgets';
import { useFocus } from '../parts';
import { useBlending } from './store';
import { BLEND_LABEL, BLEND_PILL, blendBalance, blendLayout, blendProblems, bsCost, bsKg, gradeMix, lotCommitted, lotFree, outturn } from './engine';
import { CREW, GRADE_ORDER } from './data';
import type { Blendsheet, BlendLine, ByProductKind, Chop, TeaLot } from './types';

/* ------------------------------------------------------------------ */
/* Tea lots                                                            */
/* ------------------------------------------------------------------ */

export const LotsPage: React.FC = () => {
  const { state, holdLot, releaseLot, importLots } = useBlending();
  const { state: ops } = useOperations();
  const [q, setQ] = useState('');
  const [grade, setGrade] = useState('ALL');
  const [hold, setHold] = useState<TeaLot | null>(null);
  const [reason, setReason] = useState('');
  const rows = state.lots.filter((l) => (grade === 'ALL' || l.grade === grade) && `${l.invoiceNo} ${l.garden} ${l.saleNo} ${l.bay}`.toLowerCase().includes(q.toLowerCase()));
  const free = state.lots.reduce((a, l) => a + lotFree(state, l), 0);
  const value = state.lots.reduce((a, l) => a + l.kgBalance * l.costPerKg, 0);
  const wh = (id: string) => ops.warehouses.find((w) => w.id === id)?.name ?? id;
  const columns: Column<TeaLot>[] = [
    { key: 'i', header: 'Invoice', render: (l) => <b className="sx-mono">{l.invoiceNo}</b>, sort: (l) => l.invoiceNo },
    { key: 'g', header: 'Garden · grade', render: (l) => <div className="sx-cell-main"><span>{l.garden}</span><small>{l.grade} · sale {l.saleNo}</small></div>, sort: (l) => l.grade },
    { key: 'loc', header: 'Location', render: (l) => <div className="sx-cell-main"><span>{l.bay}</span><small>{wh(l.warehouseId)}</small></div>, hideOnMobile: true },
    { key: 'kg', header: 'Balance kg', render: (l) => l.kgBalance.toLocaleString(), align: 'right', sort: (l) => l.kgBalance },
    { key: 'c', header: 'Committed', render: (l) => lotCommitted(state, l.id).toLocaleString(), align: 'right', hideOnMobile: true },
    { key: 'm', header: 'Moisture · score', render: (l) => <span className={l.moisturePct > 6.5 ? 'sx-danger-text' : ''}>{l.moisturePct}% · {l.tastingScore}</span>, align: 'right', hideOnMobile: true },
    { key: 'cost', header: 'KES/kg', render: (l) => l.costPerKg.toLocaleString(), align: 'right', sort: (l) => l.costPerKg },
    {
      key: 's',
      header: 'Status',
      render: (l) =>
        l.status === 'ON_HOLD' ? (
          <button type="button" className="btn btn-secondary btn-xs" title={l.holdReason} onClick={() => releaseLot(l.id)}>
            <Unlock size={12} /> On hold — release
          </button>
        ) : l.status === 'DEPLETED' ? (
          <Pill status="CLOSED" label="Used up" />
        ) : (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => (setHold(l), setReason(''))}>
            <Lock size={12} /> Hold
          </button>
        )
    }
  ];
  return (
    <SuitePage
      eyebrow="Blending"
      title="Tea lots"
      subtitle="Auction and direct-sale invoices of made tea, where each one sits, and how much is free for blending."
      actions={
        <>
          <ImportCsvButton label="Import broker catalogue" template={['invoiceNo', 'garden', 'grade', 'saleNo', 'kgs', 'warehouseId', 'bay', 'costPerKg', 'moisturePct', 'tastingScore']} onImport={importLots} />
          <ExportCsvButton name="tea-lots" header={['Invoice', 'Garden', 'Grade', 'Sale', 'Warehouse', 'Bay', 'Balance kg', 'Committed kg', 'KES/kg', 'Moisture %', 'Score', 'Status']} rows={() => state.lots.map((l) => [l.invoiceNo, l.garden, l.grade, l.saleNo, l.warehouseId, l.bay, l.kgBalance, lotCommitted(state, l.id), l.costPerKg, l.moisturePct, l.tastingScore, l.status])} />
        </>
      }
    >
      <div className="sx-stats">
        <Stat label="Tea in stock" value={`${state.lots.reduce((a, l) => a + l.kgBalance, 0).toLocaleString()} kg`} detail={`${state.lots.filter((l) => l.kgBalance > 0).length} invoices`} icon={<Package size={17} />} />
        <Stat label="Free to blend" value={`${Math.round(free).toLocaleString()} kg`} detail="After approved and submitted blendsheets" icon={<Layers size={17} />} tone="blue" />
        <Stat label="On quality hold" value={state.lots.filter((l) => l.status === 'ON_HOLD').length} detail="Excluded from blending and MRP" icon={<Lock size={17} />} tone="red" />
        <Stat label="Value at cost" value={kes(value, { compact: true })} icon={<ShoppingCart size={17} />} tone="gold" />
      </div>
      <div className="sx-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Invoice, garden, sale or bay" />
        <Chips value={grade} onChange={setGrade} options={[{ value: 'ALL', label: 'All grades' }, ...GRADE_ORDER.map((g) => ({ value: g, label: g, count: state.lots.filter((l) => l.grade === g).length }))]} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(l) => l.id} initialSort={{ key: 'g', dir: 'asc' }} pageSize={15} />
      {hold && (
        <Modal title={`Hold ${hold.invoiceNo}`} subtitle={`${hold.garden} ${hold.grade} · ${hold.kgBalance.toLocaleString()} kg`} size="md" onClose={() => setHold(null)} footer={<button type="button" className="btn btn-danger btn-sm" onClick={() => holdLot(hold.id, reason).ok && setHold(null)}>Put on hold</button>}>
          <Field label="Reason" required>
            <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Moisture 7.1% — re-dry before use" />
          </Field>
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Blendsheets, blending plans and client orders                      */
/* ------------------------------------------------------------------ */

type BTab = 'sheets' | 'plans' | 'orders';

export const BlendsheetsPage: React.FC = () => {
  const { state, createFromOrder, orderKg } = useBlending();
  const { production, commercial } = useOperations();
  const [tab, setTab] = useState<BTab>('sheets');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [filter, setFilter] = useState<'OPEN' | 'ALL' | 'COMPLETED'>('OPEN');
  useFocus(production.focus, (id) => state.blendsheets.some((b) => b.id === id), setOpenId, () => setCreating(true));
  const open = state.blendsheets.find((b) => b.id === openId);
  const std = (b: Blendsheet) => state.standards.find((s) => s.id === b.standardId);
  const rows = state.blendsheets.filter((b) => filter === 'ALL' || (filter === 'COMPLETED' ? b.status === 'COMPLETED' : !['COMPLETED', 'CANCELLED'].includes(b.status)));
  const columns: Column<Blendsheet>[] = [
    { key: 'n', header: 'Blendsheet', render: (b) => <b className="sx-mono">{b.number}</b>, sort: (b) => b.number, width: 140 },
    { key: 's', header: 'Blend', render: (b) => <div className="sx-cell-main"><span>{std(b)?.name}</span><small>{b.customerId ? commercial.party(b.customerId)?.name : 'Stock'}{b.orderNumber ? ` · ${b.orderNumber}` : ''}{b.parentBatchId ? ' · child of packing batch' : ''}</small></div> },
    { key: 'p', header: 'Plant', render: (b) => (b.plant === 'TOWER' ? 'Tower' : 'Drum'), hideOnMobile: true },
    { key: 'd', header: 'Date', render: (b) => fmtDate(b.date), sort: (b) => b.date },
    { key: 'k', header: 'Kg', render: (b) => b.targetKg.toLocaleString(), align: 'right', sort: (b) => b.targetKg },
    { key: 'st', header: 'Status', render: (b) => <Pill status={BLEND_PILL[b.status]} label={BLEND_LABEL[b.status]} />, sort: (b) => b.status }
  ];
  const openOrders = commercial.state.orders.filter((o) => o.status === 'APPROVED' && !o.closed && orderKg(o.id) >= 100);
  return (
    <SuitePage
      eyebrow="Blending"
      title="Blendsheets"
      subtitle="Blendsheets from client orders, the serialised list of teas and where they sit, the blending plan and its approval."
      actions={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPlanning(true)}>
            <Layers size={15} /> New blending plan
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Plus size={15} /> New blendsheet
          </button>
        </>
      }
    >
      <div className="sx-toolbar bl-tabs">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: 'sheets', label: 'Blendsheets', count: state.blendsheets.filter((b) => !['COMPLETED', 'CANCELLED'].includes(b.status)).length },
            { value: 'plans', label: 'Blending plans', count: state.plans.length },
            { value: 'orders', label: 'Client orders', count: openOrders.filter((o) => !state.blendsheets.some((b) => b.orderId === o.id && b.status !== 'CANCELLED')).length }
          ]}
        />
      </div>
      {tab === 'sheets' && (
        <>
          <div className="sx-toolbar">
            <Chips value={filter} onChange={setFilter} options={[{ value: 'OPEN', label: 'Open' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'ALL', label: 'All' }]} />
          </div>
          <DataTable rows={rows} columns={columns} rowKey={(b) => b.id} onRowClick={(b) => setOpenId(b.id)} selected={openId} initialSort={{ key: 'd', dir: 'asc' }} />
        </>
      )}
      {tab === 'plans' && <PlansPanel onOpen={setOpenId} />}
      {tab === 'orders' && (
        <Panel title="Approved client orders" subtitle="Make-to-order products get a blendsheet automatically when the order is approved; raise one for any other order here." flush>
          <table className="sx-mini-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Required by</th>
                <th className="bl-num">Blended tea</th>
                <th>Blendsheet</th>
              </tr>
            </thead>
            <tbody>
              {openOrders.map((o) => {
                const bs = state.blendsheets.find((b) => b.orderId === o.id && b.status !== 'CANCELLED');
                return (
                  <tr key={o.id}>
                    <td className="sx-mono">{o.number}</td>
                    <td>{commercial.party(o.customerId)?.name}</td>
                    <td>{fmtDate(o.requiredBy)}</td>
                    <td className="bl-num">{orderKg(o.id).toLocaleString()} kg</td>
                    <td>
                      {bs ? (
                        <button type="button" className="sx-link" onClick={() => setOpenId(bs.id)}>
                          {bs.number} · {BLEND_LABEL[bs.status]}
                        </button>
                      ) : (
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => { const r = createFromOrder(o.id); if (r.ok && r.id) setOpenId(r.id); }}>
                          <Sparkles size={12} /> Create blendsheet
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!openOrders.length && (
                <tr>
                  <td colSpan={5} className="sx-muted">No approved orders with blended tea outstanding.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      )}
      {open && <BlendDrawer b={open} onClose={() => setOpenId(null)} />}
      {creating && <NewBlendModal onClose={() => setCreating(false)} onSaved={(id) => (setCreating(false), setOpenId(id))} />}
      {planning && <NewPlanModal onClose={() => setPlanning(false)} />}
    </SuitePage>
  );
};

const NewBlendModal: React.FC<{ onClose: () => void; onSaved: (id: string) => void }> = ({ onClose, onSaved }) => {
  const { state, createBlendsheet } = useBlending();
  const { commercial } = useOperations();
  const [standardId, setStandardId] = useState(state.standards[0].id);
  const [plant, setPlant] = useState<'TOWER' | 'DRUM'>('TOWER');
  const [kg, setKg] = useState(2_000);
  const [date, setDate] = useState(addDays(TODAY, 2));
  const [due, setDue] = useState(addDays(TODAY, 4));
  const std = state.standards.find((s) => s.id === standardId)!;
  return (
    <Modal
      title="New blendsheet"
      subtitle="Lots are proposed oldest-first at the middle of each grade range; you can change them before submitting."
      onClose={onClose}
      footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => { const r = createBlendsheet({ standardId, plant, targetKg: kg, date, due, customerId: std.customerId }); if (r.ok && r.id) onSaved(r.id); }}>Create</button>}
    >
      <div className="sx-grid">
        <Field label="Blend standard" span={2}>
          <select className="form-control" value={standardId} onChange={(e) => setStandardId(e.target.value)}>
            {state.standards.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
                {s.customerId ? ` (${commercial.party(s.customerId)?.name})` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Plant">
          <select className="form-control" value={plant} onChange={(e) => setPlant(e.target.value as 'TOWER' | 'DRUM')}>
            <option value="TOWER">Blending tower</option>
            <option value="DRUM">Drum blender</option>
          </select>
        </Field>
        <Field label="Kg to blend">
          <input className="form-control" type="number" min="100" step="50" value={kg} onChange={(e) => setKg(Number(e.target.value))} />
        </Field>
        <Field label="Blending date" span={2}>
          <input className="form-control" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Due" span={2}>
          <input className="form-control" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      <p className="sx-note">
        {std.code}: {std.grades.map((g) => `${g.grade} ${g.minPct}–${g.maxPct}%`).join(' · ')} · moisture ≤ {std.moistureMax}% · tasting ≥ {std.tastingMin}
      </p>
    </Modal>
  );
};

const LinesEditor: React.FC<{ b: Blendsheet; onDone: () => void }> = ({ b, onDone }) => {
  const { state, saveBlendsheet } = useBlending();
  const [lines, setLines] = useState<BlendLine[]>(b.lines.map((l) => ({ ...l })));
  const [targetKg, setTarget] = useState(b.targetKg);
  const [date, setDate] = useState(b.date);
  const [due, setDue] = useState(b.due);
  const [plant, setPlant] = useState(b.plant);
  const std = state.standards.find((s) => s.id === b.standardId)!;
  const draft = { ...b, lines, targetKg, date, due, plant };
  const problems = blendProblems(state, draft);
  const mix = gradeMix(draft, state.lots);
  const choices = state.lots.filter((l) => l.status === 'AVAILABLE' && std.grades.some((g) => g.grade === l.grade));
  return (
    <Modal
      size="xl"
      title={`Edit ${b.number}`}
      subtitle={`${std.code} · ratios must total 100% of the target`}
      onClose={onDone}
      footer={
        <>
          <span className="sx-editor-total">
            {bsKg(draft).toLocaleString()} / {targetKg.toLocaleString()} kg · cost {kes(bsCost(draft, state.lots))}
          </span>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => saveBlendsheet(b.id, { lines, targetKg, date, due, plant, standardId: b.standardId }).ok && onDone()}>
            Save
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Target kg">
          <input className="form-control" type="number" value={targetKg} onChange={(e) => setTarget(Number(e.target.value))} />
        </Field>
        <Field label="Plant">
          <select className="form-control" value={plant} onChange={(e) => setPlant(e.target.value as 'TOWER' | 'DRUM')}>
            <option value="TOWER">Tower</option>
            <option value="DRUM">Drum</option>
          </select>
        </Field>
        <Field label="Date">
          <input className="form-control" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Due">
          <input className="form-control" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
      <table className="sx-mini-table bl-tight">
        <thead>
          <tr>
            <th>Lot</th>
            <th>Location</th>
            <th className="bl-num">Free kg</th>
            <th style={{ width: 120 }}>Kg</th>
            <th className="bl-num">Ratio</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const lot = state.lots.find((x) => x.id === l.lotId);
            return (
              <tr key={i}>
                <td>
                  <select className="form-control" value={l.lotId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, lotId: e.target.value } : x)))}>
                    <option value="">Choose…</option>
                    {choices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.invoiceNo} · {c.garden} {c.grade}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{lot ? `${lot.warehouseId} · ${lot.bay}` : '—'}</td>
                <td className="bl-num">{lot ? lotFree(state, lot, b.id).toLocaleString() : '—'}</td>
                <td>
                  <input className="form-control" type="number" min="0" value={l.kg || ''} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, kg: Number(e.target.value) } : x)))} />
                </td>
                <td className="bl-num">{targetKg ? `${((l.kg / targetKg) * 100).toFixed(1)}%` : '—'}</td>
                <td>
                  <button type="button" className="sx-icon-btn" aria-label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLines([...lines, { lotId: '', kg: 0 }])}>
        <Plus size={13} /> Add lot
      </button>
      <p className="sx-note">
        Mix: {std.grades.map((g) => `${g.grade} ${(mix[g.grade] ?? 0).toFixed(1)}% (${g.minPct}–${g.maxPct})`).join(' · ')}
      </p>
      {problems.length > 0 && (
        <div className="sx-callout warn">
          <AlertTriangle size={16} />
          <div>
            {problems.map((p) => (
              <span key={p}>• {p}</span>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};

const BlendDrawer: React.FC<{ b: Blendsheet; onClose: () => void }> = ({ b, onClose }) => {
  const bl = useBlending();
  const { state, actor } = bl;
  const { state: ops, commercial, setProduction } = useOperations();
  const [editing, setEditing] = useState(false);
  const [chopFor, setChopFor] = useState<Chop | null>(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [labour, setLabour] = useState(false);
  const [pack, setPack] = useState(false);
  const std = state.standards.find((s) => s.id === b.standardId)!;
  const wc = state.workCenters.find((w) => w.id === b.workCenterId);
  const layout = blendLayout(b, state.lots, wc);
  const problems = ['DRAFT', 'REJECTED', 'SUBMITTED'].includes(b.status) ? blendProblems(state, b) : [];
  const ot = outturn(b);
  const bal = b.status === 'COMPLETED' ? blendBalance(state, ops, b) : null;
  const plan = state.plans.find((p) => p.id === b.planId);
  const reworked = new Set(b.chops.map((c) => c.reworkOf).filter(Boolean));
  const at = { DRAFT: 0, REJECTED: 0, SUBMITTED: 1, APPROVED: 2, IN_PROGRESS: 3, COMPLETED: 5, CANCELLED: 0 }[b.status];
  const actions: FlowAction[] = [];
  if (b.status === 'DRAFT' || b.status === 'REJECTED') {
    actions.push({ label: 'Edit lots', icon: <Layers size={14} />, onClick: () => setEditing(true), tone: 'secondary' });
    actions.push({ label: 'Propose lots', icon: <Wand2 size={14} />, onClick: () => bl.autoFill(b.id), tone: 'secondary' });
    actions.push({ label: 'Submit for approval', icon: <Send size={14} />, onClick: () => bl.submitBlendsheet(b.id), disabled: problems.length > 0 });
  }
  if (b.status === 'SUBMITTED') actions.push({ label: 'Approve', icon: <CheckCircle2 size={14} />, onClick: () => bl.approveBlendsheet(b.id), title: !['QC', 'MANAGER'].includes(actor.role) ? 'Quality or the Manager approves' : undefined });
  if (b.status === 'APPROVED') actions.push({ label: 'Issue teas to the plant', icon: <Play size={14} />, onClick: () => bl.issueBlend(b.id), title: !['STOREKEEPER', 'MANAGER'].includes(actor.role) ? 'Stores issues the teas' : undefined });
  if (b.status === 'IN_PROGRESS') {
    actions.push({ label: 'Run a chop', icon: <Play size={14} />, onClick: () => setLoading(true) });
    actions.push({ label: 'Record out-turn and close', icon: <CheckCircle2 size={14} />, onClick: () => setClosing(true), tone: 'secondary' });
    actions.push({ label: 'Book hours', icon: <Users size={14} />, onClick: () => setLabour(true), tone: 'secondary' });
  }
  if (b.status === 'COMPLETED' || b.status === 'IN_PROGRESS') actions.push({ label: 'Pack this blend', icon: <Package size={14} />, onClick: () => setPack(true), tone: 'secondary' });
  if (['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'].includes(b.status))
    actions.push({ label: 'Cancel', icon: <XCircle size={14} />, onClick: () => bl.cancelBlendsheet(b.id, window.prompt('Reason for cancelling?') ?? ''), tone: 'ghost' });
  const printHtml = () =>
    `<h1>Blendsheet ${esc(b.number)}</h1><p class="muted">${esc(std.code)} ${esc(std.name)} · ${esc(b.plant)} · ${b.targetKg.toLocaleString()} kg · ${esc(fmtDate(b.date))}${b.orderNumber ? ` · order ${esc(b.orderNumber)}` : ''}</p>
    <table><tr><th>Layer</th><th>Invoice</th><th>Garden</th><th>Grade</th><th>Location</th><th class="r">Kg</th><th class="r">Ratio</th><th class="r">Kg per chop</th></tr>${layout.rows
      .map((r) => `<tr><td>${r.layer}</td><td>${esc(r.invoiceNo)}</td><td>${esc(r.garden)}</td><td>${esc(r.grade)}</td><td>${esc(r.location)}</td><td class="r">${r.kg.toLocaleString()}</td><td class="r">${r.ratioPct}%</td><td class="r">${r.perChop.toLocaleString()}</td></tr>`)
      .join('')}</table><p>${layout.chops} chops of ${layout.chopKg.toLocaleString()} kg. Moisture ≤ ${std.moistureMax}% · tasting ≥ ${std.tastingMin}.</p><div class="sig"><div>Prepared: ${esc(b.preparedBy)}</div><div>Approved: ${esc(b.approvals.map((a) => a.by).join(', ') || '—')}</div></div>`;
  return (
    <>
      <Drawer wide title={b.number} subtitle={`${std.name} · ${b.plant === 'TOWER' ? 'Blending tower' : 'Drum blender'}`} badge={<Pill status={BLEND_PILL[b.status]} label={BLEND_LABEL[b.status]} />} onClose={onClose}>
        <div className="sx-amount-hero">
          <div>
            <span>{b.status === 'COMPLETED' ? 'Blended tea made' : 'Target'}</span>
            <strong>{(b.outturn?.outputKg ?? b.targetKg).toLocaleString()} kg</strong>
          </div>
          <div>
            <span>{b.status === 'COMPLETED' ? 'Out-turn' : 'Blending date'}</span>
            <b>{b.status === 'COMPLETED' ? `${(ot.pct * 100).toFixed(2)}%` : fmtDate(b.date)}</b>
          </div>
        </div>
        {problems.length > 0 && (
          <div className="sx-callout warn">
            <AlertTriangle size={16} />
            <div>
              <b>Before this can go for approval</b>
              {problems.map((p) => (
                <span key={p}>• {p}</span>
              ))}
            </div>
          </div>
        )}
        <DefList
          items={[
            ['Customer', b.customerId ? commercial.party(b.customerId)?.name ?? b.customerId : 'Stock blend'],
            ['Sales order', b.orderNumber ?? '—'],
            ['Standard', `${std.code} · moisture ≤ ${std.moistureMax}% · tasting ≥ ${std.tastingMin}`],
            ['Due', fmtDate(b.due)],
            ['Tea cost', kes(b.issuedCost ?? bsCost(b, state.lots))],
            ['Blending plan', plan ? `${plan.number} (${plan.status.toLowerCase()})` : '—']
          ]}
        />
        <div className="sx-subhead-row">
          <h4 className="sx-subhead">Blend layout — {layout.chops} chops of {layout.chopKg.toLocaleString()} kg</h4>
          <PrintButton title={b.number} html={printHtml} label="Print blendsheet" />
        </div>
        <table className="sx-mini-table bl-tight">
          <thead>
            <tr>
              <th>#</th>
              <th>Invoice · garden</th>
              <th>Location</th>
              <th className="bl-num">Kg</th>
              <th className="bl-num">Ratio</th>
              <th className="bl-num">Per chop</th>
            </tr>
          </thead>
          <tbody>
            {layout.rows.map((r) => (
              <tr key={r.lotId}>
                <td>{r.layer}</td>
                <td>
                  <b className="sx-mono">{r.invoiceNo}</b> {r.garden} {r.grade}
                </td>
                <td>{r.location}</td>
                <td className="bl-num">{r.kg.toLocaleString()}</td>
                <td className="bl-num">{r.ratioPct}%</td>
                <td className="bl-num">{r.perChop.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {b.chops.length > 0 && (
          <>
            <h4 className="sx-subhead">Chops, samples and tasting</h4>
            <table className="sx-mini-table bl-tight">
              <thead>
                <tr>
                  <th>Chop</th>
                  <th className="bl-num">Kg in</th>
                  <th>Sample</th>
                  <th>Result</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {b.chops.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.seq}
                      {c.reworkOf && <small className="sx-muted"> · rework {kes(c.reworkCost ?? 0)}</small>}
                    </td>
                    <td className="bl-num">{c.kgIn.toLocaleString()}</td>
                    <td>{c.sample ? <span className="sx-mono">{c.sample.ref}</span> : <button type="button" className="btn btn-secondary btn-xs" onClick={() => bl.drawSample(b.id, c.id)}>Draw sample</button>}</td>
                    <td>
                      {c.result ? (
                        <span className={c.result.pass ? 'sx-success-text' : 'sx-danger-text'}>
                          {c.result.pass ? 'Pass' : 'Fail'} · {c.result.moisturePct}% · {c.result.tastingScore}
                          {!c.result.pass && ` — ${c.result.reasons.join('; ')}`}
                        </span>
                      ) : c.sample ? (
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => setChopFor(c)}>
                          <FlaskConical size={12} /> Record tasting
                        </button>
                      ) : (
                        <span className="sx-muted">Waiting for sample</span>
                      )}
                    </td>
                    <td>
                      {c.result && !c.result.pass && !reworked.has(c.id) && b.status === 'IN_PROGRESS' && (
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => bl.runChop(b.id, c.kgIn, c.id)}>
                          Re-work chop
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {b.outturn && (
          <>
            <h4 className="sx-subhead">Out-turn</h4>
            <DefList
              items={[
                ['Tea issued', `${ot.input.toLocaleString()} kg`],
                ['Blended tea out', `${ot.output.toLocaleString()} kg (${(ot.pct * 100).toFixed(2)}% · standard ${std.expectedOutturnPct}%)`],
                ['By-products', b.outturn.byProducts.map((x) => `${x.kind.toLowerCase()} ${x.kg} kg`).join(', ') || '—'],
                ['Unexplained loss', `${ot.loss.toLocaleString()} kg (${(ot.lossPct * 100).toFixed(2)}%)`],
                ...(bal ? ([['Blend balance', `${bal.balance.toLocaleString()} kg left · ${bal.issued.toLocaleString()} kg packed · ${bal.planned.toLocaleString()} kg planned for packing`]] as [string, React.ReactNode][]) : [])
              ]}
            />
          </>
        )}
        {b.labour.length > 0 && <p className="sx-note">Hours: {b.labour.map((l) => `${l.employee} ${l.hours} h`).join(', ')}</p>}
        <h4 className="sx-subhead">Approval</h4>
        <ApprovalPanel
          steps={<FlowSteps steps={['Prepared', 'Submitted', 'Approved', 'Blending', 'Out-turn']} at={at} off={b.status === 'CANCELLED' || b.status === 'REJECTED'} />}
          actions={actions}
          canReject={b.status === 'SUBMITTED'}
          onReject={(note) => bl.rejectBlendsheet(b.id, note).ok}
          actorLine={
            <>
              You are acting as <b>{actor.name}</b> ({actor.title}).{' '}
              <button type="button" className="sx-link" onClick={() => setProduction('schedule')}>
                See it on the schedule
              </button>
            </>
          }
          history={b.history}
        />
        <Attachments owner={`blendsheet:${b.number}`} by={actor.name} readOnly={bl.readOnly} title="Tasting notes and certificates" />
      </Drawer>
      {editing && <LinesEditor b={b} onDone={() => setEditing(false)} />}
      {chopFor && <ChopResultModal b={b} c={chopFor} onClose={() => setChopFor(null)} />}
      {loading && <ChopLoadModal b={b} onClose={() => setLoading(false)} />}
      {closing && <OutturnModal b={b} onClose={() => setClosing(false)} />}
      {labour && <BlendLabourModal b={b} onClose={() => setLabour(false)} />}
      {pack && <PackModal b={b} onClose={() => setPack(false)} />}
    </>
  );
};

const ChopLoadModal: React.FC<{ b: Blendsheet; onClose: () => void }> = ({ b, onClose }) => {
  const { runChop, state } = useBlending();
  const wc = state.workCenters.find((w) => w.id === b.workCenterId);
  const used = b.chops.filter((c) => !c.reworkOf).reduce((a, c) => a + c.kgIn, 0);
  const [kg, setKg] = useState(Math.min(wc?.chopKg ?? 1_000, round2(bsKg(b) - used)));
  return (
    <Modal title={`Load a chop — ${b.number}`} subtitle={`${(bsKg(b) - used).toLocaleString()} kg left · plant takes ${wc?.chopKg?.toLocaleString()} kg per chop`} size="md" onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => runChop(b.id, kg).ok && onClose()}>Start chop</button>}>
      <Field label="Kg loaded">
        <input className="form-control" type="number" min="0" value={kg} onChange={(e) => setKg(Number(e.target.value))} />
      </Field>
    </Modal>
  );
};

const ChopResultModal: React.FC<{ b: Blendsheet; c: Chop; onClose: () => void }> = ({ b, c, onClose }) => {
  const { recordChop, state } = useBlending();
  const std = state.standards.find((s) => s.id === b.standardId)!;
  const [moisture, setMoisture] = useState(5.8);
  const [score, setScore] = useState(7.5);
  const [liquor, setLiquor] = useState('Bright, brisk');
  const [infusion, setInfusion] = useState('Coppery');
  const [appearance, setAppearance] = useState('Black, even');
  const fails = [moisture > std.moistureMax && `moisture above ${std.moistureMax}%`, score < std.tastingMin && `score below ${std.tastingMin}`].filter(Boolean);
  return (
    <Modal
      title={`Tasting — chop ${c.seq} of ${b.number}`}
      subtitle={`Sample ${c.sample?.ref} · limits from ${std.code}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">{fails.length ? <b className="sx-danger-text">Will fail: {fails.join(', ')}</b> : <b className="sx-success-text">Within limits</b>}</span>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => recordChop(b.id, c.id, { moisturePct: moisture, tastingScore: score, liquor, infusion, appearance }).ok && onClose()}>
            Record result
          </button>
        </>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Field label="Moisture %" hint={`Maximum ${std.moistureMax}%`}>
          <input className="form-control" type="number" step="0.1" value={moisture} onChange={(e) => setMoisture(Number(e.target.value))} />
        </Field>
        <Field label="Tasting score (0–10)" hint={`Minimum ${std.tastingMin}`}>
          <input className="form-control" type="number" step="0.1" value={score} onChange={(e) => setScore(Number(e.target.value))} />
        </Field>
        <Field label="Liquor">
          <input className="form-control" value={liquor} onChange={(e) => setLiquor(e.target.value)} />
        </Field>
        <Field label="Infusion">
          <input className="form-control" value={infusion} onChange={(e) => setInfusion(e.target.value)} />
        </Field>
        <Field label="Appearance" span={2}>
          <input className="form-control" value={appearance} onChange={(e) => setAppearance(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

const OutturnModal: React.FC<{ b: Blendsheet; onClose: () => void }> = ({ b, onClose }) => {
  const { completeBlend, state } = useBlending();
  const std = state.standards.find((s) => s.id === b.standardId)!;
  const input = bsKg(b);
  const [out, setOut] = useState(Math.round((input * std.expectedOutturnPct) / 100));
  const [by, setBy] = useState<Record<ByProductKind, number>>(Object.fromEntries(std.byProducts.map((x) => [x.kind, Math.round((input * x.pct) / 100)])) as Record<ByProductKind, number>);
  const loss = round2(input - out - Object.values(by).reduce((a, x) => a + x, 0));
  return (
    <Modal
      title={`Out-turn — ${b.number}`}
      subtitle={`${input.toLocaleString()} kg of tea issued`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <span className="sx-editor-total">
            Out-turn <b>{((out / input) * 100).toFixed(2)}%</b> · loss <b className={loss < 0 ? 'sx-danger-text' : ''}>{loss} kg</b>
          </span>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => completeBlend(b.id, out, std.byProducts.map((x) => ({ kind: x.kind, kg: by[x.kind] ?? 0 }))).ok && onClose()}>
            Close the blend
          </button>
        </>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Field label="Blended tea out (kg)" span={2}>
          <input className="form-control" type="number" value={out} onChange={(e) => setOut(Number(e.target.value))} />
        </Field>
        {std.byProducts.map((x) => (
          <Field key={x.kind} label={`${x.kind.charAt(0) + x.kind.slice(1).toLowerCase()} (kg)`} hint={`Standard ${x.pct}% · ${x.valuePerKg} KES/kg`}>
            <input className="form-control" type="number" value={by[x.kind] ?? 0} onChange={(e) => setBy({ ...by, [x.kind]: Number(e.target.value) })} />
          </Field>
        ))}
      </div>
      <p className="sx-note">The blend goes into stock as {std.outputSku} (tonnes) and a production journal is sent to Finance for approval.</p>
    </Modal>
  );
};

const BlendLabourModal: React.FC<{ b: Blendsheet; onClose: () => void }> = ({ b, onClose }) => {
  const { recordBlendLabour } = useBlending();
  const [employee, setEmployee] = useState(CREW[0]);
  const [hours, setHours] = useState(8);
  return (
    <Modal title={`Book hours — ${b.number}`} size="md" onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => recordBlendLabour(b.id, employee, hours).ok && onClose()}>Book</button>}>
      <div className="sx-grid sx-grid-2">
        <Field label="Person">
          <select className="form-control" value={employee} onChange={(e) => setEmployee(e.target.value)}>
            {CREW.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Hours">
          <input className="form-control" type="number" step="0.25" value={hours} onChange={(e) => setHours(Number(e.target.value))} />
        </Field>
      </div>
    </Modal>
  );
};

const PackModal: React.FC<{ b: Blendsheet; onClose: () => void }> = ({ b, onClose }) => {
  const { packFromBlend, state } = useBlending();
  const { state: ops } = useOperations();
  const recipes = ops.recipes.filter((r) => r.materials.some((m) => m.sku === 'RAW-A'));
  const [recipeId, setRecipeId] = useState(recipes[0].id);
  const p = state.params.find((x) => x.recipeId === recipeId);
  const [qty, setQty] = useState(p?.minBatch ?? 100);
  const [date, setDate] = useState(addDays(TODAY, 4));
  return (
    <Modal title={`Pack ${b.number}`} subtitle="Plans a packing batch that draws on this blend (process blend → discrete packs)" size="md" onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => packFromBlend(b.id, recipeId, qty, date).ok && onClose()}>Plan packing batch</button>}>
      <div className="sx-grid sx-grid-2">
        <Field label="Product" span={2}>
          <select className="form-control" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantity" hint={p ? `${p.minBatch}–${p.maxBatch}, multiples of ${p.orderMultiple}` : undefined}>
          <input className="form-control" type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </Field>
        <Field label="Date">
          <input className="form-control" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

const PlansPanel: React.FC<{ onOpen: (id: string) => void }> = ({ onOpen }) => {
  const bl = useBlending();
  const { state, actor } = bl;
  return (
    <div className="sx-row">
      {state.plans.map((p) => {
        const sheets = state.blendsheets.filter((b) => p.blendsheetIds.includes(b.id));
        const actions: FlowAction[] = [];
        if (p.status === 'DRAFT' || p.status === 'REJECTED') actions.push({ label: 'Submit plan', icon: <Send size={14} />, onClick: () => bl.submitPlan(p.id) });
        if (p.status === 'SUBMITTED') actions.push({ label: 'Approve plan', icon: <CheckCircle2 size={14} />, onClick: () => bl.approvePlan(p.id), title: actor.role !== 'MANAGER' ? 'The Operations Manager approves the plan' : undefined });
        const byPlant = (k: 'TOWER' | 'DRUM') => sheets.filter((b) => b.plant === k).reduce((a, b) => a + b.targetKg, 0);
        return (
          <Panel key={p.id} title={`${p.number} · ${p.period}`} subtitle={p.notes} action={<Pill status={p.status === 'SUBMITTED' ? 'SUBMITTED' : p.status} />}>
            <table className="sx-mini-table bl-tight">
              <tbody>
                {sheets.map((b) => (
                  <tr key={b.id} className="clickable" onClick={() => onOpen(b.id)}>
                    <td className="sx-mono">{b.number}</td>
                    <td>{state.standards.find((s) => s.id === b.standardId)?.code}</td>
                    <td>{b.plant === 'TOWER' ? 'Tower' : 'Drum'}</td>
                    <td>{fmtDate(b.date)}</td>
                    <td className="bl-num">{b.targetKg.toLocaleString()} kg</td>
                    <td>
                      <Pill status={BLEND_PILL[b.status]} label={BLEND_LABEL[b.status]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sx-note">
              Tower {byPlant('TOWER').toLocaleString()} kg · Drums {byPlant('DRUM').toLocaleString()} kg
            </p>
            <ApprovalPanel steps={<FlowSteps steps={['Prepared', 'Submitted', 'Approved']} at={{ DRAFT: 0, SUBMITTED: 1, APPROVED: 3, REJECTED: 0 }[p.status]} off={p.status === 'REJECTED'} />} actions={actions} canReject={p.status === 'SUBMITTED'} onReject={(n) => bl.rejectPlan(p.id, n).ok} actorLine={<>Acting as <b>{actor.name}</b></>} history={p.history} />
          </Panel>
        );
      })}
      {!state.plans.length && <p className="sx-muted">No blending plans yet.</p>}
    </div>
  );
};

const NewPlanModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, createPlan } = useBlending();
  const [period, setPeriod] = useState(TODAY.slice(0, 7));
  const [notes, setNotes] = useState('');
  const avail = state.blendsheets.filter((b) => ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'].includes(b.status) && !state.plans.some((p) => p.status !== 'REJECTED' && p.blendsheetIds.includes(b.id)));
  const [ids, setIds] = useState<string[]>(avail.map((b) => b.id));
  return (
    <Modal title="New blending plan" subtitle="Group the period's blendsheets by plant for one approval" onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => createPlan(period, ids, notes).ok && onClose()}>Create plan</button>}>
      <div className="sx-grid">
        <Field label="Month">
          <input className="form-control" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
        <Field label="Notes" span={3}>
          <input className="form-control" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Plant allocation and priorities" />
        </Field>
      </div>
      <ul className="sx-list">
        {avail.map((b) => (
          <li key={b.id}>
            <label>
              <input type="checkbox" checked={ids.includes(b.id)} onChange={(e) => setIds(e.target.checked ? [...ids, b.id] : ids.filter((x) => x !== b.id))} /> {b.number}
            </label>
            <span>
              {b.plant === 'TOWER' ? 'Tower' : 'Drum'} · {b.targetKg.toLocaleString()} kg · {fmtDate(b.date)}
            </span>
            <b>{BLEND_LABEL[b.status]}</b>
          </li>
        ))}
        {!avail.length && <li className="sx-muted">Every open blendsheet is already on a plan.</li>}
      </ul>
    </Modal>
  );
};
