import React, { useState } from 'react';
import { ArrowDown, ArrowUp, CalendarX, CheckCircle2, Copy, GitBranch, Pencil, Plus, Replace, Snowflake, Trash2 } from 'lucide-react';
import { fmtDate, kes, TODAY } from '../../finance/engine';
import { useOperations } from '../store';
import { ApprovalPanel, Chips, DataTable, DefList, Drawer, Field, FlowSteps, Modal, Panel, Pill, SuitePage, type Column, type FlowAction } from '../../ui/kit';
import { ExportCsvButton } from '../../../platform/Widgets';
import { useBlending } from './store';
import { useLiveSchedule } from './hooks';
import { activeRouting, rollUpCost, standardPerUnit, whereUsed, yieldFactor } from './engine';
import type { BurdenBasis, CostOptions, PlanParams, Routing, RoutingOp, WorkCenter, WorkCenterKind } from './types';

const BASIS: Record<BurdenBasis, string> = { PER_HOUR: 'KES per hour', PER_UNIT: 'KES per unit', PCT_LABOUR: '% of direct labour', PCT_MATERIAL: '% of material' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ------------------------------------------------------------------ */
/* Work centres, calendar, sequence and where-used                     */
/* ------------------------------------------------------------------ */

export const WorkCentresPage: React.FC = () => {
  const bl = useBlending();
  const { state } = bl;
  const { state: ops } = useOperations();
  const { sched } = useLiveSchedule();
  const [edit, setEdit] = useState<WorkCenter | null>(null);
  const [used, setUsed] = useState<string | null>(null);
  const [cal, setCal] = useState({ date: TODAY, workCenterId: '', hours: 0, reason: '' });
  const label = (id: string) => ops.recipes.find((r) => r.id === id)?.name ?? state.standards.find((s) => s.id === id)?.name ?? id;
  const columns: Column<WorkCenter>[] = [
    { key: 'n', header: 'Work centre', render: (w) => <div className="sx-cell-main"><span>{w.name}</span><small>{w.kind.toLowerCase()}{w.hazard ? ` · ${w.hazard.agent}` : ''}</small></div>, sort: (w) => w.name },
    { key: 'c', header: 'Capacity', render: (w) => `${w.machines} × ${w.hoursPerDay} h · ${w.days.map((d) => DAYS[d][0]).join('')}`, hideOnMobile: true },
    { key: 'crew', header: 'Crew · tooling', render: (w) => `${w.crew} · ${w.tooling}`, align: 'right', hideOnMobile: true },
    { key: 'lab', header: 'Labour direct / indirect', render: (w) => `${w.labourDirectRate} / ${w.labourIndirectRate}`, align: 'right' },
    { key: 'm', header: 'Machine / h', render: (w) => w.machineRate.toLocaleString(), align: 'right' },
    { key: 'b', header: 'Burden', render: (w) => `${w.burden.amount.toLocaleString()} ${BASIS[w.burden.basis]}`, hideOnMobile: true },
    { key: 's', header: 'Set-up', render: (w) => w.setupCost.toLocaleString(), align: 'right', hideOnMobile: true },
    {
      key: 'x',
      header: '',
      render: (w) => (
        <span className="bl-chip-row">
          <button type="button" className="btn btn-secondary btn-xs" onClick={(e) => (e.stopPropagation(), setEdit({ ...w, burden: { ...w.burden }, days: [...w.days] }))}>
            <Pencil size={12} /> Edit
          </button>
          <button type="button" className="btn btn-secondary btn-xs" onClick={(e) => (e.stopPropagation(), setUsed(w.id))}>
            Where used
          </button>
        </span>
      )
    }
  ];
  const wu = used ? whereUsed(state, sched, used) : null;
  return (
    <SuitePage
      eyebrow="Engineering"
      title="Work centres"
      subtitle="Machines, crews and hours that the scheduler works to, and the labour, machine and burden rates the standard costs use."
      actions={<ExportCsvButton name="work-centres" header={['Id', 'Name', 'Kind', 'Machines', 'Crew', 'Tooling', 'Hours/day', 'Direct', 'Indirect', 'Machine', 'Burden basis', 'Burden', 'Set-up']} rows={() => state.workCenters.map((w) => [w.id, w.name, w.kind, w.machines, w.crew, w.tooling, w.hoursPerDay, w.labourDirectRate, w.labourIndirectRate, w.machineRate, w.burden.basis, w.burden.amount, w.setupCost])} />}
    >
      <DataTable rows={state.workCenters} columns={columns} rowKey={(w) => w.id} pageSize={20} />
      <div className="sx-row">
        <Panel title="Factory calendar" subtitle="Public holidays and planned short shifts — the scheduler skips them">
          <ul className="sx-list">
            {state.calendar.map((c) => (
              <li key={c.id}>
                <span>{fmtDate(c.date)}</span>
                <span>
                  {c.reason} · {c.workCenterId ? state.workCenters.find((w) => w.id === c.workCenterId)?.name : 'Whole factory'} · {c.hours} h
                </span>
                <button type="button" className="sx-icon-btn" aria-label="Remove" onClick={() => bl.removeCalendar(c.id)}>
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
          <div className="bl-inline">
            <input className="form-control" type="date" value={cal.date} onChange={(e) => setCal({ ...cal, date: e.target.value })} aria-label="Date" />
            <select className="form-control" value={cal.workCenterId} onChange={(e) => setCal({ ...cal, workCenterId: e.target.value })} aria-label="Work centre">
              <option value="">Whole factory</option>
              {state.workCenters.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <input className="form-control" type="number" min="0" max="24" value={cal.hours} onChange={(e) => setCal({ ...cal, hours: Number(e.target.value) })} aria-label="Hours" style={{ width: 70 }} />
            <input className="form-control" value={cal.reason} onChange={(e) => setCal({ ...cal, reason: e.target.value })} placeholder="Reason" aria-label="Reason" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => bl.addCalendar({ ...cal, workCenterId: cal.workCenterId || undefined }).ok && setCal({ ...cal, reason: '' })}>
              <CalendarX size={14} /> Add
            </button>
          </div>
        </Panel>
        <Panel title="Standard production sequence" subtitle="Order the scheduler uses on each line — light to strong blends, plain before private label">
          {state.workCenters
            .filter((w) => w.sequence.length > 1)
            .map((w) => (
              <div key={w.id}>
                <h4 className="sx-subhead">{w.name}</h4>
                <ol className="bl-tree">
                  {w.sequence.map((id, i) => (
                    <li key={id}>
                      {i + 1}. {label(id)}{' '}
                      <button type="button" className="sx-icon-btn" aria-label="Move up" onClick={() => bl.moveSequence(w.id, id, -1)} disabled={i === 0}>
                        <ArrowUp size={12} />
                      </button>
                      <button type="button" className="sx-icon-btn" aria-label="Move down" onClick={() => bl.moveSequence(w.id, id, 1)} disabled={i === w.sequence.length - 1}>
                        <ArrowDown size={12} />
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
        </Panel>
      </div>
      {edit && <WorkCenterModal wc={edit} onClose={() => setEdit(null)} />}
      {wu && used && (
        <Modal title={`Where used — ${state.workCenters.find((w) => w.id === used)?.name}`} onClose={() => setUsed(null)}>
          <h4 className="sx-subhead">Routings ({wu.routings.length})</h4>
          <ul className="sx-list">
            {wu.routings.map(({ routing, op }) => (
              <li key={routing.id + op.seq}>
                <span className="sx-mono">
                  {routing.code} rev {routing.revision}
                </span>
                <span>
                  {op.seq} · {op.name}
                </span>
                <b>{routing.status.toLowerCase()}</b>
              </li>
            ))}
          </ul>
          <h4 className="sx-subhead">Scheduled work ({wu.jobs.length})</h4>
          <ul className="sx-list">
            {wu.jobs.map((j) => (
              <li key={j.id}>
                <span className="sx-mono">{j.ref}</span>
                <span>{j.label}</span>
                <b>
                  {fmtDate(j.start)} → {fmtDate(j.finish)}
                </b>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </SuitePage>
  );
};

const WorkCenterModal: React.FC<{ wc: WorkCenter; onClose: () => void }> = ({ wc, onClose }) => {
  const { saveWorkCenter } = useBlending();
  const [w, setW] = useState(wc);
  const num = (k: keyof WorkCenter) => (e: React.ChangeEvent<HTMLInputElement>) => setW({ ...w, [k]: Number(e.target.value) });
  return (
    <Modal title={`Work centre — ${wc.name}`} subtitle="Rates are in KES; changes are written to the audit trail" size="xl" onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => saveWorkCenter(w).ok && onClose()}>Save</button>}>
      <div className="sx-grid">
        <Field label="Name" span={2}>
          <input className="form-control" value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} />
        </Field>
        <Field label="Kind">
          <select className="form-control" value={w.kind} onChange={(e) => setW({ ...w, kind: e.target.value as WorkCenterKind })}>
            {(['TOWER', 'DRUM', 'PACKING', 'SORTING', 'LAB'] as WorkCenterKind[]).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="Machines">
          <input className="form-control" type="number" min="1" value={w.machines} onChange={num('machines')} />
        </Field>
        <Field label="Hours per day (per machine)">
          <input className="form-control" type="number" step="0.5" value={w.hoursPerDay} onChange={num('hoursPerDay')} />
        </Field>
        <Field label="Crew on shift">
          <input className="form-control" type="number" min="0" value={w.crew} onChange={num('crew')} />
        </Field>
        <Field label="Tooling sets">
          <input className="form-control" type="number" min="1" value={w.tooling} onChange={num('tooling')} />
        </Field>
        <Field label="Set-up cost per batch">
          <input className="form-control" type="number" value={w.setupCost} onChange={num('setupCost')} />
        </Field>
        <Field label="Direct labour / man-hour">
          <input className="form-control" type="number" value={w.labourDirectRate} onChange={num('labourDirectRate')} />
        </Field>
        <Field label="Indirect labour / man-hour" hint="Charged as burden">
          <input className="form-control" type="number" value={w.labourIndirectRate} onChange={num('labourIndirectRate')} />
        </Field>
        <Field label="Machine rate / run hour">
          <input className="form-control" type="number" value={w.machineRate} onChange={num('machineRate')} />
        </Field>
        <Field label="Burden basis">
          <select className="form-control" value={w.burden.basis} onChange={(e) => setW({ ...w, burden: { ...w.burden, basis: e.target.value as BurdenBasis } })}>
            {(Object.keys(BASIS) as BurdenBasis[]).map((b) => (
              <option key={b} value={b}>
                {BASIS[b]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Burden amount">
          <input className="form-control" type="number" step="0.1" value={w.burden.amount} onChange={(e) => setW({ ...w, burden: { ...w.burden, amount: Number(e.target.value) } })} />
        </Field>
        <Field label="Working days" span={3}>
          <span className="bl-chip-row">
            {DAYS.map((d, i) => (
              <label key={d}>
                <input type="checkbox" checked={w.days.includes(i)} onChange={(e) => setW({ ...w, days: e.target.checked ? [...w.days, i].sort() : w.days.filter((x) => x !== i) })} /> {d}
              </label>
            ))}
          </span>
        </Field>
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Routings                                                            */
/* ------------------------------------------------------------------ */

export const RoutingsPage: React.FC = () => {
  const bl = useBlending();
  const { state } = bl;
  const { state: ops, commercial } = useOperations();
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'LIVE' | 'ALL'>('LIVE');
  const [mass, setMass] = useState(false);
  const rows = state.routings.filter((r) => filter === 'ALL' || r.status !== 'OBSOLETE');
  const columns: Column<Routing>[] = [
    { key: 'c', header: 'Routing', render: (r) => <b className="sx-mono">{r.code}</b>, sort: (r) => r.code },
    { key: 'r', header: 'Rev · version', render: (r) => `${r.revision} · v${r.version}` },
    { key: 'p', header: 'Product', render: (r) => <div className="sx-cell-main"><span>{ops.recipes.find((x) => x.id === r.recipeId)?.name}</span><small>{r.forCustomerId ? `Only for ${commercial.party(r.forCustomerId)?.name}` : 'All customers'}</small></div> },
    { key: 'o', header: 'Operations', render: (r) => r.ops.map((o) => o.kind.charAt(0)).join(' → '), hideOnMobile: true },
    { key: 'e', header: 'Effective', render: (r) => fmtDate(r.effectiveFrom), sort: (r) => r.effectiveFrom, hideOnMobile: true },
    { key: 's', header: 'Status', render: (r) => <Pill status={r.status === 'ACTIVE' ? 'ACTIVE' : r.status === 'DRAFT' ? 'DRAFT' : 'CLOSED'} label={r.status.charAt(0) + r.status.slice(1).toLowerCase()} /> }
  ];
  const open = state.routings.find((r) => r.id === openId);
  return (
    <SuitePage
      eyebrow="Engineering"
      title="Routings"
      subtitle="Operations, work centres, run times by hours or units, crews, scrap, work instructions, inspection limits, packing and outside processing — with revisions and versions."
      actions={
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMass(true)}>
          <Replace size={14} /> Mass replace / delete
        </button>
      }
    >
      <div className="sx-toolbar">
        <Chips value={filter} onChange={setFilter} options={[{ value: 'LIVE', label: 'Active & draft' }, { value: 'ALL', label: 'All revisions' }]} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} onRowClick={(r) => setOpenId(r.id)} selected={openId} />
      {open && <RoutingDrawer r={open} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
      {mass && <MassModal onClose={() => setMass(false)} />}
    </SuitePage>
  );
};

const RoutingDrawer: React.FC<{ r: Routing; onClose: () => void; onOpen: (id: string) => void }> = ({ r, onClose, onOpen }) => {
  const bl = useBlending();
  const { state, actor } = bl;
  const { state: ops, commercial } = useOperations();
  const [editing, setEditing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [note, setNote] = useState('');
  const recipe = ops.recipes.find((x) => x.id === r.recipeId)!;
  const wc = (id: string) => state.workCenters.find((w) => w.id === id)?.name ?? id;
  const actions: FlowAction[] = [];
  if (r.status === 'DRAFT') {
    actions.push({ label: 'Edit operations', icon: <Pencil size={14} />, onClick: () => setEditing(true), tone: 'secondary' });
    actions.push({ label: 'Activate revision', icon: <CheckCircle2 size={14} />, onClick: () => bl.activateRouting(r.id, note), title: actor.role !== 'MANAGER' ? 'The Operations Manager activates routings' : undefined });
  } else
    actions.push({
      label: 'New revision',
      icon: <GitBranch size={14} />,
      onClick: () => {
        const res = bl.newRevision(r.id);
        if (res.ok && res.id) onOpen(res.id);
      },
      tone: 'secondary'
    });
  actions.push({ label: 'Same as, except…', icon: <Copy size={14} />, onClick: () => setCopying(true), tone: 'secondary' });
  return (
    <>
      <Drawer wide title={`${r.code} rev ${r.revision}`} subtitle={`${recipe.name} · version ${r.version}`} badge={<Pill status={r.status === 'ACTIVE' ? 'ACTIVE' : r.status === 'DRAFT' ? 'DRAFT' : 'CLOSED'} label={r.status.toLowerCase()} />} onClose={onClose}>
        <DefList
          items={[
            ['Applies to', r.forCustomerId ? `Orders from ${commercial.party(r.forCustomerId)?.name}` : 'All orders'],
            ['Effective from', fmtDate(r.effectiveFrom)],
            ['Change note', r.changeNote || '—'],
            ['Yield through the routing', `${(yieldFactor(r, state.params.find((p) => p.recipeId === r.recipeId)) * 100).toFixed(2)}%`],
            ['By-products', r.byProducts.map((b) => `${b.name} ${b.pctOfInput}% of input`).join(', ') || '—'],
            ['Co-products', r.coProducts.map((b) => `${b.name} ${b.pctOfOutput}% of output`).join(', ') || '—']
          ]}
        />
        <h4 className="sx-subhead">Operations</h4>
        <table className="sx-mini-table bl-tight">
          <thead>
            <tr>
              <th>Op</th>
              <th>Work centre</th>
              <th className="bl-num">Set-up h</th>
              <th className="bl-num">Run</th>
              <th className="bl-num">Workers</th>
              <th className="bl-num">Scrap</th>
              <th className="bl-num">Overlap</th>
            </tr>
          </thead>
          <tbody>
            {r.ops.map((o) => (
              <React.Fragment key={o.seq}>
                <tr>
                  <td>
                    <b>{o.seq}</b> {o.name}
                    <br />
                    <small className="sx-muted">
                      {o.kind.toLowerCase()}
                      {o.kind === 'SUBCONTRACT' && ` · ${commercial.party(o.supplierId ?? '')?.name} @ ${o.costPerUnit} KES/unit`}
                    </small>
                  </td>
                  <td>{wc(o.workCenterId)}</td>
                  <td className="bl-num">{o.setupHrs}</td>
                  <td className="bl-num">{o.kind === 'SUBCONTRACT' ? '—' : o.runBasis === 'HOURS' ? `${o.runValue} h / batch` : `${o.runValue} units / h`}</td>
                  <td className="bl-num">{o.workers}</td>
                  <td className="bl-num">{o.scrapPct}%</td>
                  <td className="bl-num">{o.overlapPct}%</td>
                </tr>
                {(o.instructions.length > 0 || (o.spec?.length ?? 0) > 0) && (
                  <tr>
                    <td colSpan={7}>
                      <small>
                        {o.instructions.map((x, i) => (
                          <span key={i}>
                            {i + 1}. {x}{' '}
                          </span>
                        ))}
                        {o.spec?.map((sp) => (
                          <b key={sp.parameter}>
                            {' '}
                            · {sp.parameter} {sp.min !== undefined ? `≥ ${sp.min}` : ''} {sp.max !== undefined ? `≤ ${sp.max}` : ''} {sp.unit}
                          </b>
                        ))}
                      </small>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {r.status === 'DRAFT' && (
          <Field label="What changed in this revision (needed to activate)">
            <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        )}
        <h4 className="sx-subhead">Revision history</h4>
        <ul className="sx-list">
          {state.routings
            .filter((x) => x.code === r.code)
            .sort((a, b) => b.version - a.version)
            .map((x) => (
              <li key={x.id}>
                <button type="button" className="sx-link" onClick={() => onOpen(x.id)}>
                  rev {x.revision} · v{x.version}
                </button>
                <span>{x.changeNote || '—'}</span>
                <b>{x.status.toLowerCase()}</b>
              </li>
            ))}
        </ul>
        <ApprovalPanel steps={<FlowSteps steps={['Draft', 'Active', 'Obsolete']} at={{ DRAFT: 0, ACTIVE: 1, OBSOLETE: 3 }[r.status]} />} actions={actions} actorLine={<>Acting as <b>{actor.name}</b></>} history={r.history} />
      </Drawer>
      {editing && <RoutingEditor r={r} onClose={() => setEditing(false)} />}
      {copying && <CopyModal r={r} onClose={() => setCopying(false)} onDone={(id) => (setCopying(false), onOpen(id))} />}
    </>
  );
};

const blankOp = (seq: number, wc: string): RoutingOp => ({ seq, name: '', kind: 'PROCESS', workCenterId: wc, setupHrs: 0, runBasis: 'HOURS', runValue: 1, workers: 1, scrapPct: 0, overlapPct: 0, instructions: [] });

const RoutingEditor: React.FC<{ r: Routing; onClose: () => void }> = ({ r, onClose }) => {
  const { state, saveRouting } = useBlending();
  const { commercial } = useOperations();
  const [ops, setOps] = useState<RoutingOp[]>(r.ops.map((o) => ({ ...o, instructions: [...o.instructions], spec: o.spec?.map((x) => ({ ...x })) })));
  const [byProducts, setBy] = useState(r.byProducts.map((x) => ({ ...x })));
  const suppliers = commercial.finance.state.parties.filter((p) => p.kind === 'SUPPLIER');
  const set = (i: number, patch: Partial<RoutingOp>) => setOps(ops.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <Modal size="xl" title={`Edit ${r.code} rev ${r.revision}`} subtitle="Add, remove or change operations; instructions one per line" onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => saveRouting({ ...r, ops, byProducts }).ok && onClose()}>Save draft</button>}>
      {ops.map((o, i) => (
        <div key={i} className="sx-lines" style={{ marginBottom: 10 }}>
          <div className="sx-grid">
            <Field label="Seq">
              <input className="form-control" type="number" value={o.seq} onChange={(e) => set(i, { seq: Number(e.target.value) })} />
            </Field>
            <Field label="Name" span={2}>
              <input className="form-control" value={o.name} onChange={(e) => set(i, { name: e.target.value })} />
            </Field>
            <Field label="Kind">
              <select className="form-control" value={o.kind} onChange={(e) => set(i, { kind: e.target.value as RoutingOp['kind'] })}>
                {(['PROCESS', 'INSPECTION', 'PACKING', 'SUBCONTRACT'] as const).map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            <Field label="Work centre" span={2}>
              <select className="form-control" value={o.workCenterId} onChange={(e) => set(i, { workCenterId: e.target.value })}>
                {state.workCenters.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Set-up hours">
              <input className="form-control" type="number" step="0.1" value={o.setupHrs} onChange={(e) => set(i, { setupHrs: Number(e.target.value) })} />
            </Field>
            <Field label="Run basis">
              <select className="form-control" value={o.runBasis} onChange={(e) => set(i, { runBasis: e.target.value as RoutingOp['runBasis'] })}>
                <option value="HOURS">Hours per batch</option>
                <option value="UNITS_PER_HOUR">Units per hour</option>
              </select>
            </Field>
            <Field label={o.runBasis === 'HOURS' ? 'Run hours' : 'Units per hour'}>
              <input className="form-control" type="number" step="0.1" value={o.runValue} onChange={(e) => set(i, { runValue: Number(e.target.value) })} />
            </Field>
            <Field label="Workers">
              <input className="form-control" type="number" min="0" value={o.workers} onChange={(e) => set(i, { workers: Number(e.target.value) })} />
            </Field>
            <Field label="Scrap %">
              <input className="form-control" type="number" step="0.1" value={o.scrapPct} onChange={(e) => set(i, { scrapPct: Number(e.target.value) })} />
            </Field>
            <Field label="Overlap %" hint="Next op may start before this ends">
              <input className="form-control" type="number" value={o.overlapPct} onChange={(e) => set(i, { overlapPct: Number(e.target.value) })} />
            </Field>
            {o.kind === 'SUBCONTRACT' && (
              <>
                <Field label="Subcontractor" span={2}>
                  <select className="form-control" value={o.supplierId ?? ''} onChange={(e) => set(i, { supplierId: e.target.value })}>
                    <option value="">Choose…</option>
                    {suppliers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Cost per unit (KES)">
                  <input className="form-control" type="number" value={o.costPerUnit ?? 0} onChange={(e) => set(i, { costPerUnit: Number(e.target.value) })} />
                </Field>
              </>
            )}
            <Field label="Work instructions (one per line)" span={4}>
              <textarea className="form-control" rows={2} value={o.instructions.join('\n')} onChange={(e) => set(i, { instructions: e.target.value.split('\n') })} />
            </Field>
            {o.kind === 'INSPECTION' && (
              <Field label="Inspection limits — parameter, min, max, unit (one per line)" span={4}>
                <textarea
                  className="form-control"
                  rows={2}
                  defaultValue={(o.spec ?? []).map((x) => `${x.parameter}, ${x.min ?? ''}, ${x.max ?? ''}, ${x.unit}`).join('\n')}
                  onBlur={(e) =>
                    set(i, {
                      spec: e.target.value
                        .split('\n')
                        .map((l) => l.split(',').map((x) => x.trim()))
                        .filter((p) => p[0])
                        .map(([parameter, min, max, unit]) => ({ parameter, min: min === '' || min === undefined ? undefined : Number(min), max: max === '' || max === undefined ? undefined : Number(max), unit: unit ?? '' }))
                    })
                  }
                />
              </Field>
            )}
          </div>
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => setOps(ops.filter((_, j) => j !== i))}>
            <Trash2 size={12} /> Remove operation
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOps([...ops, blankOp((ops[ops.length - 1]?.seq ?? 0) + 10, state.workCenters[0].id)])}>
        <Plus size={13} /> Add operation
      </button>
      <h4 className="sx-subhead">By-products</h4>
      {byProducts.map((b, i) => (
        <div key={i} className="bl-inline">
          <input className="form-control" value={b.name} onChange={(e) => setBy(byProducts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="By-product" />
          <input className="form-control" type="number" step="0.1" value={b.pctOfInput} onChange={(e) => setBy(byProducts.map((x, j) => (j === i ? { ...x, pctOfInput: Number(e.target.value) } : x)))} aria-label="% of input" />
          <input className="form-control" type="number" value={b.valuePerUnit} onChange={(e) => setBy(byProducts.map((x, j) => (j === i ? { ...x, valuePerUnit: Number(e.target.value) } : x)))} aria-label="Value per kg" />
          <button type="button" className="sx-icon-btn" aria-label="Remove" onClick={() => setBy(byProducts.filter((_, j) => j !== i))}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-xs" onClick={() => setBy([...byProducts, { name: 'Dust', pctOfInput: 0.5, valuePerUnit: 90 }])}>
        <Plus size={12} /> Add by-product
      </button>
    </Modal>
  );
};

const CopyModal: React.FC<{ r: Routing; onClose: () => void; onDone: (id: string) => void }> = ({ r, onClose, onDone }) => {
  const { state, copyRouting } = useBlending();
  const { state: ops, commercial } = useOperations();
  const [recipeId, setRecipeId] = useState(r.recipeId);
  const [code, setCode] = useState(`${r.code}-B`);
  const [customer, setCustomer] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  return (
    <Modal title={`Same as ${r.code}, except…`} size="lg" onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => { const res = copyRouting(r.id, { recipeId, code, forCustomerId: customer || undefined, replaceFrom: from || undefined, replaceTo: to || undefined }); if (res.ok && res.id) onDone(res.id); }}>Copy</button>}>
      <div className="sx-grid">
        <Field label="New code">
          <input className="form-control" value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Product" span={3}>
          <select className="form-control" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
            {ops.recipes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Only for customer (optional)" span={2}>
          <select className="form-control" value={customer} onChange={(e) => setCustomer(e.target.value)}>
            <option value="">All customers</option>
            {commercial.finance.state.parties.filter((p) => p.kind === 'CUSTOMER').map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Replace work centre">
          <select className="form-control" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">—</option>
            {r.ops.map((o) => (
              <option key={o.seq} value={o.workCenterId}>
                {state.workCenters.find((w) => w.id === o.workCenterId)?.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="with">
          <select className="form-control" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">—</option>
            {state.workCenters.map((w) => (
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

const MassModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, massReplace } = useBlending();
  const [from, setFrom] = useState(state.workCenters[0].id);
  const [to, setTo] = useState('');
  const [mode, setMode] = useState<'REPLACE' | 'DELETE'>('REPLACE');
  const hits = state.routings.filter((r) => r.status !== 'OBSOLETE' && r.ops.some((o) => o.workCenterId === from));
  return (
    <Modal title="Mass replace or delete operations" subtitle="Applies to every active and draft routing; each changed routing gets a new version" size="lg" onClose={onClose} footer={<button type="button" className={`btn btn-sm ${mode === 'DELETE' ? 'btn-danger' : 'btn-primary'}`} onClick={() => massReplace(from, to, mode).ok && onClose()}>{mode === 'DELETE' ? 'Delete operations' : 'Replace work centre'}</button>}>
      <div className="sx-grid">
        <Field label="Action">
          <select className="form-control" value={mode} onChange={(e) => setMode(e.target.value as 'REPLACE' | 'DELETE')}>
            <option value="REPLACE">Replace</option>
            <option value="DELETE">Delete</option>
          </select>
        </Field>
        <Field label="Operations on" span={mode === 'REPLACE' ? 2 : 3}>
          <select className="form-control" value={from} onChange={(e) => setFrom(e.target.value)}>
            {state.workCenters.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        {mode === 'REPLACE' && (
          <Field label="Move to">
            <select className="form-control" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choose…</option>
              {state.workCenters.filter((w) => w.id !== from).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <p className="sx-note">{hits.length} routings affected: {hits.map((r) => `${r.code} rev ${r.revision}`).join(', ') || 'none'}</p>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Standard costs and planning parameters                              */
/* ------------------------------------------------------------------ */

export const CostingPage: React.FC = () => {
  const bl = useBlending();
  const { state } = bl;
  const { state: ops, products } = useOperations();
  const [opts, setOpts] = useState<CostOptions>(bl.defaultOpts);
  const [params, setParams] = useState<PlanParams | null>(null);
  const toggle = (k: keyof CostOptions) => setOpts({ ...opts, [k]: !opts[k] });
  const rows = ops.recipes.map((r) => {
    const routing = activeRouting(state.routings, r.id);
    const p = state.params.find((x) => x.recipeId === r.id);
    const live = rollUpCost(r, routing, state.workCenters, products, p, r.batchSize, opts);
    const std = standardPerUnit(state, r, products);
    return { r, routing, p, live, std };
  });
  return (
    <SuitePage eyebrow="Engineering" title="Standard costs" subtitle="Roll-up of material, direct and indirect labour, machine, burden, set-up and outside processing per unit, including scrap and yield. Freeze it as the standard that production is valued at.">
      <div className="sx-toolbar">
        <span className="bl-chip-row">
          {(Object.keys(opts) as (keyof CostOptions)[]).map((k) => (
            <label key={k} className="pf-readonly">
              <input type="checkbox" checked={opts[k]} onChange={() => toggle(k)} /> {k === 'scrap' ? 'Scrap & yield' : k.charAt(0).toUpperCase() + k.slice(1)}
            </label>
          ))}
        </span>
      </div>
      <Panel title="Roll-up per standard batch" flush>
        <div className="sx-table-scroll">
          <table className="sx-mini-table bl-tight">
            <thead>
              <tr>
                <th>Product</th>
                <th className="bl-num">Material</th>
                <th className="bl-num">Direct labour</th>
                <th className="bl-num">Indirect labour</th>
                <th className="bl-num">Machine</th>
                <th className="bl-num">Burden</th>
                <th className="bl-num">Set-up</th>
                <th className="bl-num">Outside</th>
                <th className="bl-num">Yield</th>
                <th className="bl-num">Per unit</th>
                <th className="bl-num">Standard</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, routing, live, std }) => (
                <tr key={r.id}>
                  <td>
                    {r.name}
                    <br />
                    <small className="sx-muted">
                      {r.batchSize} units · {routing ? `${routing.code} rev ${routing.revision}` : 'no routing'} · {live.hours} h
                    </small>
                  </td>
                  <td className="bl-num">{kes(live.material, { compact: true })}</td>
                  <td className="bl-num">{kes(live.labour, { compact: true })}</td>
                  <td className="bl-num">{kes(live.indirectLabour, { compact: true })}</td>
                  <td className="bl-num">{kes(live.machine, { compact: true })}</td>
                  <td className="bl-num">{kes(live.burden, { compact: true })}</td>
                  <td className="bl-num">{kes(live.setup, { compact: true })}</td>
                  <td className="bl-num">{kes(live.subcontract, { compact: true })}</td>
                  <td className="bl-num">{(live.yieldFactor * 100).toFixed(1)}%</td>
                  <td className="bl-num">
                    <b>{kes(live.perUnit)}</b>
                  </td>
                  <td className="bl-num">{std.frozen ? <span title={`Frozen ${std.at}`}>{kes(std.perUnit)}</span> : <span className="sx-muted">not frozen</span>}</td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-xs" onClick={() => bl.freezeStandard(r.id, opts)}>
                      <Snowflake size={12} /> Set standard
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Planning parameters" subtitle="Batch sizes, order multiples, time fences, safety stock and make-to-order — used by planning, the MPS and batch validation" flush>
        <table className="sx-mini-table bl-tight">
          <thead>
            <tr>
              <th>Product</th>
              <th className="bl-num">Min</th>
              <th className="bl-num">Max</th>
              <th className="bl-num">Multiple</th>
              <th className="bl-num">DTF / PTF days</th>
              <th className="bl-num">Safety stock</th>
              <th className="bl-num">Yield</th>
              <th>MTO</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.params.map((p) => (
              <tr key={p.recipeId}>
                <td>{ops.recipes.find((r) => r.id === p.recipeId)?.name}</td>
                <td className="bl-num">{p.minBatch}</td>
                <td className="bl-num">{p.maxBatch}</td>
                <td className="bl-num">{p.orderMultiple}</td>
                <td className="bl-num">
                  {p.dtfDays} / {p.ptfDays}
                </td>
                <td className="bl-num">{p.safetyStock}</td>
                <td className="bl-num">{p.expectedYieldPct}%</td>
                <td>{p.mto ? 'Yes' : 'No'}</td>
                <td>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => setParams({ ...p })}>
                    <Pencil size={12} /> Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Frozen standards" subtitle="History of standard cost changes">
        <ul className="sx-list">
          {state.standardCosts.map((c, i) => (
            <li key={i}>
              <span>{ops.recipes.find((r) => r.id === c.recipeId)?.name}</span>
              <span className="sx-muted">
                {c.at.replace('T', ' ').slice(0, 16)} · {c.by}
              </span>
              <b>{kes(c.perUnit)}</b>
            </li>
          ))}
          {!state.standardCosts.length && <li className="sx-muted">No standards frozen yet — batches are valued at the live roll-up until one is set.</li>}
        </ul>
      </Panel>
      {params && (
        <Modal title="Planning parameters" subtitle={ops.recipes.find((r) => r.id === params.recipeId)?.name} size="lg" onClose={() => setParams(null)} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => bl.saveParams(params).ok && setParams(null)}>Save</button>}>
          <div className="sx-grid">
            {(
              [
                ['minBatch', 'Minimum batch'],
                ['maxBatch', 'Maximum batch'],
                ['orderMultiple', 'Order multiple'],
                ['safetyStock', 'Safety stock'],
                ['dtfDays', 'Demand time fence (days)'],
                ['ptfDays', 'Planning time fence (days)'],
                ['expectedYieldPct', 'Expected yield %']
              ] as [keyof PlanParams, string][]
            ).map(([k, l]) => (
              <Field key={k} label={l}>
                <input className="form-control" type="number" value={params[k] as number} onChange={(e) => setParams({ ...params, [k]: Number(e.target.value) })} />
              </Field>
            ))}
            <Field label="Make to order">
              <select className="form-control" value={params.mto ? 'y' : 'n'} onChange={(e) => setParams({ ...params, mto: e.target.value === 'y' })}>
                <option value="n">No — make to stock</option>
                <option value="y">Yes — blendsheet on order approval</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}
      <p className="sx-note">Rates and roll-ups are in KES. Standard cost per unit = total ÷ (batch × yield through scrap steps × expected yield).</p>
    </SuitePage>
  );
};
