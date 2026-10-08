import React, { useState } from 'react';
import { ArrowUpRight, Clock, Hammer, Pause, Play, Undo2, Users, Wrench } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { fmtDate, kes, round2, TODAY } from '../../finance/engine';
import { materialNeed } from '../engine';
import { useOperations } from '../store';
import type { Batch } from '../types';
import { DefList, Field, Modal, Pill } from '../../ui/kit';
import { Attachments, esc, PrintButton } from '../../../platform/Widgets';
import { useBlending } from './store';
import { useLiveSchedule } from './hooks';
import { actualConversion, batchVariance, standardPerUnit } from './engine';
import { CREW } from './data';

const hoursBetween = (a?: string, b?: string) => (a && b ? Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000) : 0);

/** Planning, costing, labour, rework and drill-down details shown inside the batch drawer. */
export const BatchExtras: React.FC<{ b: Batch }> = ({ b }) => {
  const { state: ops, products, pname, commercial, finance, setWarehousing } = useOperations();
  const bl = useBlending();
  const { setCurrentView } = useApp();
  const { sched } = useLiveSchedule();
  const { state } = bl;
  const ext = state.ext[b.id];
  const recipe = ops.recipes.find((r) => r.id === b.recipeId)!;
  const routing = state.routings.find((r) => r.id === ext?.routingId);
  const job = sched.find((j) => j.id === b.id);
  const std = standardPerUnit(state, recipe, products);
  const bs = state.blendsheets.find((x) => x.id === ext?.blendsheetId);
  const childBs = state.blendsheets.filter((x) => x.parentBatchId === b.id);
  const wo = state.prodOrders.find((x) => x.id === ext?.workOrderId);
  const order = b.forOrder ? commercial.state.orders.find((o) => o.number === b.forOrder) : undefined;
  const journals = (ext?.journalIds ?? []).map((id) => finance.state.journals.find((j) => j.id === id)).filter(Boolean) as typeof finance.state.journals;
  const subs = state.subcontracts.filter((s) => s.batchId === b.id);
  const conv = actualConversion(ext, state.workCenters);
  const stopped = (ext?.stops ?? []).reduce((a, s) => a + hoursBetween(s.from, s.to ?? new Date().toISOString()), 0);
  const elapsed = hoursBetween(ext?.startedAt, ext?.finishedAt ?? (b.status === 'IN_PROGRESS' ? new Date().toISOString() : undefined));
  const paused = ext?.stops.some((s) => !s.to);
  const house = state.standards.find((s) => s.id === 'std-house');
  const [labour, setLabour] = useState(false);
  const [rework, setRework] = useState(false);
  const [disasm, setDisasm] = useState(false);
  const [pause, setPause] = useState(false);
  const goOrder = () => {
    if (!order) return;
    commercial.setTrading('orders', order.id);
    setCurrentView('trading');
  };
  const goMoves = () => {
    setWarehousing('movements');
    setCurrentView('warehousing');
  };
  const goJournal = (id: string) => {
    finance.setPage('journals', id);
    setCurrentView('finance');
  };
  const variance = b.status === 'COMPLETED' ? batchVariance(state, ops, b, products) : null;

  return (
    <>
      <h4 className="sx-subhead">Planning &amp; schedule</h4>
      <DefList
        items={[
          ['Routing', routing ? `${routing.code} rev ${routing.revision} (v${routing.version})${routing.forCustomerId ? ` · ${commercial.party(routing.forCustomerId)?.name}` : ''}` : 'Recipe line time'],
          ['Scheduled start', job ? fmtDate(job.start) : ext?.pinDate ? fmtDate(ext.pinDate) : fmtDate(b.date)],
          ['Expected completion', job ? <>{fmtDate(job.finish)} {job.lateDays > 0 && <b className="sx-danger-text">· {job.lateDays} d late</b>}</> : b.status === 'COMPLETED' ? 'Done' : '—'],
          ['Critical ratio', job ? <span className={job.cr < 1 ? 'sx-danger-text' : ''}>{job.cr}</span> : '—'],
          ['Standard cost / unit', `${kes(std.perUnit)}${std.frozen ? ' (frozen)' : ' (live roll-up)'}`],
          ...(bs ? ([['From blend', `${bs.number} · ${bs.outturn?.outputKg.toLocaleString() ?? bs.targetKg.toLocaleString()} kg`]] as [string, React.ReactNode][]) : []),
          ...(childBs.length ? ([['Child blendsheets', childBs.map((c) => `${c.number} (${c.status.toLowerCase()})`).join(', ')]] as [string, React.ReactNode][]) : []),
          ...(wo ? ([['Work order', `${wo.number} · ${wo.lines.length} lines`]] as [string, React.ReactNode][]) : []),
          ...(ext?.reserved.length ? ([['Allocated on release', ext.reserved.map((r) => `${pname(r.sku)} ${r.qty}`).join(', ')]] as [string, React.ReactNode][]) : []),
          ...(ext?.allocatedOrder ? ([['Allocated to order', `${ext.allocatedOrder.qty} for ${ext.allocatedOrder.orderNumber}`]] as [string, React.ReactNode][]) : [])
        ]}
      />
      <div className="bl-chip-row">
        {order && (
          <button type="button" className="btn btn-secondary btn-xs" onClick={goOrder}>
            <ArrowUpRight size={13} /> Sales order {order.number}
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-xs" onClick={goMoves}>
          <ArrowUpRight size={13} /> Stock movements
        </button>
        {journals.map((j) => (
          <button key={j.id} type="button" className="btn btn-secondary btn-xs" onClick={() => goJournal(j.id)}>
            <ArrowUpRight size={13} /> Journal {j.number}
          </button>
        ))}
      </div>

      <h4 className="sx-subhead">Bill of materials (all levels)</h4>
      <ul className="bl-tree">
        {materialNeed(recipe, b.plannedQty).map((n) => (
          <React.Fragment key={n.sku}>
            <li>
              <b>{pname(n.sku)}</b> — {n.qty} {products.find((p) => p.sku === n.sku)?.unit}
            </li>
            {n.sku === 'RAW-A' &&
              house?.grades.map((g) => (
                <li key={g.grade} className="l2">
                  ↳ Tea {g.grade}: {Math.round((n.qty * 1000 * (g.minPct + g.maxPct)) / 2 / house.grades.reduce((a, x) => a + (x.minPct + x.maxPct) / 2, 0)).toLocaleString()} kg ({house.code} blend)
                </li>
              ))}
          </React.Fragment>
        ))}
      </ul>

      {routing && (
        <>
          <h4 className="sx-subhead">Operations &amp; work instructions</h4>
          <table className="sx-mini-table bl-tight">
            <thead>
              <tr>
                <th>Op</th>
                <th>Work centre</th>
                <th>Instructions</th>
                <th className="bl-num">Workers</th>
              </tr>
            </thead>
            <tbody>
              {routing.ops.map((o) => (
                <tr key={o.seq}>
                  <td>
                    {o.seq} · {o.name}
                    <br />
                    <small className="sx-muted">{o.kind.toLowerCase()}</small>
                  </td>
                  <td>{state.workCenters.find((w) => w.id === (o.kind === 'PACKING' && ext?.workCenterId ? ext.workCenterId : o.workCenterId))?.name}</td>
                  <td>
                    <small>{o.instructions.join(' · ') || '—'}</small>
                  </td>
                  <td className="bl-num">{o.workers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h4 className="sx-subhead">
        <Clock size={13} /> Start, stop and labour
      </h4>
      <DefList
        items={[
          ['Started', ext?.startedAt ? ext.startedAt.replace('T', ' ').slice(0, 16) : '—'],
          ['Finished', ext?.finishedAt ? ext.finishedAt.replace('T', ' ').slice(0, 16) : '—'],
          ['Elapsed less stoppages', elapsed ? `${round2(Math.max(0, elapsed - stopped))} h (${round2(stopped)} h stopped)` : '—'],
          ['Labour booked', `${conv.hours} h · ${kes(conv.labour)} direct + ${kes(conv.overhead)} overhead`]
        ]}
      />
      {(ext?.stops.length ?? 0) > 0 && (
        <ul className="sx-list">
          {ext!.stops.map((s, i) => (
            <li key={i}>
              <span>{s.reason}</span>
              <span className="sx-muted">
                {s.from.slice(11, 16)} → {s.to ? s.to.slice(11, 16) : 'still stopped'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {(ext?.labour.length ?? 0) > 0 && (
        <table className="sx-mini-table bl-tight">
          <tbody>
            {ext!.labour.map((l) => (
              <tr key={l.id}>
                <td>{l.employee}</td>
                <td>{state.workCenters.find((w) => w.id === l.workCenterId)?.name}</td>
                <td>{fmtDate(l.date)}</td>
                <td className="bl-num">{l.hours} h</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="bl-chip-row">
        {['IN_PROGRESS', 'QC', 'COMPLETED'].includes(b.status) && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLabour(true)}>
            <Users size={14} /> Book labour
          </button>
        )}
        {b.status === 'IN_PROGRESS' &&
          (paused ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => bl.resumeBatch(b.id)}>
              <Play size={14} /> Resume
            </button>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPause(true)}>
              <Pause size={14} /> Pause
            </button>
          ))}
        {b.status === 'REJECTED' && !ext?.rework && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRework(true)}>
            <Wrench size={14} /> Re-work
          </button>
        )}
        {b.status === 'COMPLETED' && b.output - (ext?.disassembled ?? 0) > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDisasm(true)}>
            <Undo2 size={14} /> Disassemble
          </button>
        )}
      </div>

      {ext?.rework && (
        <div className="sx-callout success">
          <Hammer size={16} />
          <div>
            <b>Re-worked by {ext.rework.by}</b>
            <span>
              {ext.rework.recovered} recovered · {ext.rework.hours} h · cost {kes(ext.rework.cost)} — {ext.rework.note}
            </span>
          </div>
        </div>
      )}
      {(ext?.disassembled ?? 0) > 0 && <p className="sx-note">{ext!.disassembled} units disassembled back to blended tea.</p>}
      {(ext?.byProducts?.length ?? 0) > 0 && <p className="sx-note">By- and co-products: {ext!.byProducts!.map((x) => `${x.name} ${x.qty}`).join(', ')}</p>}

      {subs.length > 0 && (
        <>
          <h4 className="sx-subhead">Outside processing</h4>
          <ul className="sx-list">
            {subs.map((s) => (
              <li key={s.id}>
                <span className="sx-mono">{s.number}</span>
                <span>
                  {s.opName} · {commercial.party(s.supplierId)?.name} · {s.poNumber ? `PO ${s.poNumber}` : 'PO pending'}
                </span>
                <PrintButton
                  label={`Dispatch note ${s.dispatchNote}`}
                  title={s.dispatchNote}
                  html={() =>
                    `<h1>Dispatch note ${esc(s.dispatchNote)}</h1><p class="muted">Outside processing · ${esc(TODAY)}</p><table><tr><th>To</th><td>${esc(commercial.party(s.supplierId)?.name)}</td></tr><tr><th>Purchase order</th><td>${esc(s.poNumber ?? '—')}</td></tr><tr><th>Batch</th><td>${esc(s.batchNumber)}</td></tr><tr><th>Operation</th><td>${esc(s.opName)}</td></tr><tr><th>Quantity</th><td>${s.qty}</td></tr></table><div class="sig"><div>Released by (Stores)</div><div>Received by (subcontractor)</div></div>`
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {variance && (
        <>
          <h4 className="sx-subhead">Variance against standard</h4>
          <table className="sx-mini-table bl-tight">
            <tbody>
              {(
                [
                  ['Standard cost of output', variance.standard],
                  ['Actual cost', variance.actual],
                  ['Material usage', variance.material],
                  ['Labour efficiency', variance.labour],
                  ['Overhead', variance.overhead],
                  ['Rework', variance.rework],
                  ['Yield (lost units at standard)', variance.yieldVar]
                ] as [string, number][]
              ).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className={`bl-num ${v > 0 && k !== 'Standard cost of output' && k !== 'Actual cost' ? 'sx-danger-text' : ''}`}>{kes(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h4 className="sx-subhead">Ledger impact</h4>
      {journals.length ? (
        <table className="sx-mini-table bl-tight">
          <tbody>
            {journals.flatMap((j) =>
              j.lines.map((l, i) => (
                <tr key={j.id + i}>
                  <td>{i === 0 ? <b className="sx-mono">{j.number}</b> : ''}</td>
                  <td>
                    {l.account} · {l.description}
                  </td>
                  <td className="bl-num">{l.debit ? kes(l.debit) : ''}</td>
                  <td className="bl-num">{l.credit ? kes(l.credit) : ''}</td>
                  <td>{i === 0 ? <Pill status={j.status} /> : ''}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : (
        <p className="sx-muted">No production journals yet — issuing materials and completing the batch post to Finance.</p>
      )}
      <Attachments owner={`production:${b.number}`} by={bl.actor.name} readOnly={bl.readOnly} title="Batch documents" />

      {labour && <LabourModal b={b} onClose={() => setLabour(false)} />}
      {pause && <PauseModal b={b} onClose={() => setPause(false)} />}
      {rework && <ReworkModal b={b} onClose={() => setRework(false)} />}
      {disasm && <DisassembleModal b={b} onClose={() => setDisasm(false)} />}
    </>
  );
};

const LabourModal: React.FC<{ b: Batch; onClose: () => void }> = ({ b, onClose }) => {
  const { state, recordLabour } = useBlending();
  const routing = state.routings.find((r) => r.id === state.ext[b.id]?.routingId);
  const wcs = state.workCenters.filter((w) => !routing || routing.ops.some((o) => o.workCenterId === w.id) || w.kind === 'PACKING');
  const [employee, setEmployee] = useState(CREW[0]);
  const [hours, setHours] = useState(4);
  const [wc, setWc] = useState(state.ext[b.id]?.workCenterId ?? routing?.ops.find((o) => o.kind === 'PACKING')?.workCenterId ?? wcs[0]?.id ?? '');
  return (
    <Modal title={`Book labour — ${b.number}`} size="md" onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => recordLabour(b.id, employee, hours, wc).ok && onClose()}>Book hours</button>}>
      <div className="sx-grid sx-grid-2">
        <Field label="Person">
          <select className="form-control" value={employee} onChange={(e) => setEmployee(e.target.value)}>
            {CREW.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Hours" hint="Decimal hours, e.g. 3.5">
          <input className="form-control" type="number" step="0.25" min="0" value={hours} onChange={(e) => setHours(Number(e.target.value))} />
        </Field>
        <Field label="Work centre" span={2}>
          <select className="form-control" value={wc} onChange={(e) => setWc(e.target.value)}>
            {wcs.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.hazard ? ` — ${w.hazard.agent}` : ''}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
};

const PauseModal: React.FC<{ b: Batch; onClose: () => void }> = ({ b, onClose }) => {
  const { pauseBatch } = useBlending();
  const [reason, setReason] = useState('');
  return (
    <Modal title={`Pause ${b.number}`} size="md" onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => pauseBatch(b.id, reason).ok && onClose()}>Pause the line</button>}>
      <Field label="Reason for the stoppage" required>
        <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Film roll change, power outage" />
      </Field>
    </Modal>
  );
};

const ReworkModal: React.FC<{ b: Batch; onClose: () => void }> = ({ b, onClose }) => {
  const { reworkBatch } = useBlending();
  const { products } = useOperations();
  const [hours, setHours] = useState(6);
  const [recovered, setRecovered] = useState(Math.round(b.plannedQty * 0.8));
  const [sku, setSku] = useState('PKG-FLM');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  return (
    <Modal
      title={`Re-work ${b.number}`}
      subtitle="Repack or re-blend the quarantined output; extra materials and hours are costed"
      size="lg"
      onClose={onClose}
      footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => reworkBatch(b.id, { hours, recovered, extra: qty > 0 ? [{ sku, qty }] : [], note }).ok && onClose()}>Record rework</button>}
    >
      <div className="sx-grid">
        <Field label="Rework man-hours" required>
          <input className="form-control" type="number" min="0" step="0.5" value={hours} onChange={(e) => setHours(Number(e.target.value))} />
        </Field>
        <Field label="Units recovered" hint={`Of ${b.plannedQty} quarantined`}>
          <input className="form-control" type="number" min="0" value={recovered} onChange={(e) => setRecovered(Number(e.target.value))} />
        </Field>
        <Field label="Extra material">
          <select className="form-control" value={sku} onChange={(e) => setSku(e.target.value)}>
            {products.filter((p) => p.kind === 'MATERIAL').map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantity">
          <input className="form-control" type="number" min="0" step="0.1" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </Field>
        <Field label="What was done" span={4} required>
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Re-dried to 5.2% and repacked into new film" />
        </Field>
      </div>
    </Modal>
  );
};

const DisassembleModal: React.FC<{ b: Batch; onClose: () => void }> = ({ b, onClose }) => {
  const { disassembleBatch, state } = useBlending();
  const left = b.output - (state.ext[b.id]?.disassembled ?? 0);
  const [qty, setQty] = useState(Math.min(10, left));
  const [reason, setReason] = useState('');
  return (
    <Modal title={`Disassemble ${b.number}`} subtitle="Unpack finished units back to blended tea; packaging is written off" size="md" onClose={onClose} footer={<button type="button" className="btn btn-danger btn-sm" onClick={() => disassembleBatch(b.id, qty, reason).ok && onClose()}>Disassemble</button>}>
      <div className="sx-grid sx-grid-2">
        <Field label="Units" hint={`Up to ${left}`}>
          <input className="form-control" type="number" min="1" max={left} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </Field>
        <Field label="Reason" required>
          <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer changed to bulk" />
        </Field>
      </div>
    </Modal>
  );
};
