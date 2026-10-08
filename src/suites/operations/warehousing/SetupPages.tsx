import React, { useState } from 'react';
import { Activity, Archive, ClipboardCheck, Droplets, Edit3, LayoutGrid, Plus, Printer, Receipt, Scale, ShieldAlert, Thermometer, Users, Wand2 } from 'lucide-react';
import { Attachments, printDocument, esc } from '../../../platform/Widgets';
import { useAccess } from '../../../platform/access';
import { addDays, fmtDate, kes, TODAY } from '../../finance/engine';
import { Chips, DataTable, DefList, Drawer, Field, Meter, Modal, Pill, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import type { Warehouse } from '../types';
import { billingFor, countPlanDue, countPlanState, locLabel, locationUsedKg, SENSOR_LIMITS, suggestSlot, TARIFF_LABEL, toBase, workerLoad } from './engine';
import { useWarehouseExt } from './store';
import type { CountPlan, HuCount, Msds, PrintJob, StorageLocation, TaskType, WarehouseTask } from './types';
import { num, ReadOnlyNote, ScanBox, SimBadge } from './ui';

/* ================================================================== */
/* Locations, bays and layout                                          */
/* ================================================================== */

type LocTab = 'warehouses' | 'locations' | 'layout';
export const LocationsPage: React.FC = () => {
  const { state, ops } = useWarehouseExt();
  const [tab, setTab] = useState<LocTab>('layout');
  const [editWh, setEditWh] = useState<Warehouse | null>(null);
  const [editLoc, setEditLoc] = useState<StorageLocation | null>(null);
  const [wh, setWh] = useState('WH-CHG');
  const [grade, setGrade] = useState('PF1');
  const [kg, setKg] = useState(3_000);
  const kgIn = (id: string) => state.lots.filter((l) => l.warehouseId === id && l.status === 'IN_STOCK').reduce((x, l) => x + l.netKg, 0);
  const suggestion = suggestSlot(state, wh, grade, kg);
  const locCols: Column<StorageLocation>[] = [
    { key: 'w', header: 'Warehouse', render: (l) => ops.state.warehouses.find((w) => w.id === l.warehouseId)?.name ?? l.warehouseId },
    { key: 'l', header: 'Block-bay-row', render: (l) => <b className="sx-mono">{locLabel(l)}</b>, sort: (l) => locLabel(l) },
    { key: 'z', header: 'Zone', render: (l) => l.zone.toLowerCase() },
    { key: 'g', header: 'Slotted for', render: (l) => l.preferredGrade ?? '—', hideOnMobile: true },
    { key: 'u', header: 'Used', render: (l) => <div className="sx-meter-cell"><Meter value={locationUsedKg(state, l.id) / l.capacityKg} tone={locationUsedKg(state, l.id) / l.capacityKg > 0.9 ? 'red' : 'green'} /><small>{num(locationUsedKg(state, l.id))} / {num(l.capacityKg)}</small></div> },
    { key: 'a', header: '', render: (l) => (l.active ? '' : <Pill status="VOID" label="Inactive" />) }
  ];
  return (
    <SuitePage
      eyebrow="Warehousing"
      title="Locations & layout"
      subtitle="Warehouses and godowns, their blocks, bays and rows, and the slotting rules that decide where incoming tea goes."
      actions={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditWh({ id: '', name: '', location: '', capacity: 1_000, capacityKg: 100_000, kind: 'GODOWN' })}>
            <Plus size={15} /> Warehouse
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditLoc({ id: '', warehouseId: wh, block: 'C', bay: '01', row: '1', capacityKg: 40_000, zone: 'GENERAL', active: true })}>
            <Plus size={15} /> Location
          </button>
        </>
      }
    >
      <ReadOnlyNote />
      <div className="sx-toolbar">
        <Chips value={tab} onChange={setTab} options={[{ value: 'layout', label: 'Layout & slotting' }, { value: 'locations', label: 'Bays & blocks', count: state.locations.length }, { value: 'warehouses', label: 'Warehouses', count: ops.state.warehouses.length }]} />
        <select className="form-control" style={{ width: 'auto' }} value={wh} onChange={(e) => setWh(e.target.value)} aria-label="Warehouse">
          {ops.state.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      {tab === 'warehouses' && (
        <DataTable
          rows={ops.state.warehouses}
          columns={[
            { key: 'n', header: 'Warehouse', render: (w) => <div className="sx-cell-main"><span>{w.name}</span><small>{w.location}</small></div> },
            { key: 'k', header: 'Type', render: (w) => (w.kind ?? 'GODOWN').toLowerCase().replace('_', ' ') },
            { key: 'c', header: 'Tea held / capacity', render: (w) => <div className="sx-meter-cell"><Meter value={kgIn(w.id) / (w.capacityKg ?? 1)} /><small>{num(kgIn(w.id))} / {num(w.capacityKg ?? 0)} kg</small></div> },
            { key: 'l', header: 'Locations', render: (w) => state.locations.filter((l) => l.warehouseId === w.id).length, align: 'right' },
            { key: 's', header: 'Status', render: (w) => (w.archived ? <Pill status="VOID" label="Archived" /> : w.main ? <Pill status="POSTED" label="Main" /> : <Pill status="ACTIVE" />) },
            { key: 'e', header: '', render: (w) => <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditWh(w)}><Edit3 size={12} /> Edit</button> }
          ]}
          rowKey={(w) => w.id}
        />
      )}
      {tab === 'locations' && <DataTable rows={state.locations.filter((l) => l.warehouseId === wh)} columns={locCols} rowKey={(l) => l.id} onRowClick={setEditLoc} pageSize={20} />}
      {tab === 'layout' && (
        <>
          <div className="sx-panel">
            <div className="sx-panel-head">
              <div>
                <h2>Slotting suggestion</h2>
                <p>Where would the next lot go? Slots kept for the grade first, else the emptiest general slot that fits.</p>
              </div>
            </div>
            <div className="sx-panel-body sx-inline-form">
              <select className="form-control" value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Grade">
                {['BP1', 'PF1', 'PD', 'D1', 'BMF', 'FNGS1'].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
              <input className="form-control" type="number" value={kg} onChange={(e) => setKg(Number(e.target.value))} aria-label="Kg" />
              <b>{suggestion ? `→ ${locLabel(suggestion)} (${num(suggestion.capacityKg - locationUsedKg(state, suggestion.id))} kg free)` : 'No slot fits — add a location'}</b>
            </div>
          </div>
          {Array.from(new Set(state.locations.filter((l) => l.warehouseId === wh).map((l) => l.block))).map((block) => (
            <section key={block} className="sx-panel">
              <div className="sx-panel-head">
                <div>
                  <h2>Block {block}</h2>
                  <p>{state.locations.find((l) => l.warehouseId === wh && l.block === block)?.zone.toLowerCase()} zone</p>
                </div>
              </div>
              <div className="sx-panel-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {state.locations
                  .filter((l) => l.warehouseId === wh && l.block === block)
                  .map((l) => {
                    const used = locationUsedKg(state, l.id) / l.capacityKg;
                    const lots = state.lots.filter((x) => x.locationId === l.id && x.status === 'IN_STOCK');
                    return (
                      <button key={l.id} type="button" className="sx-panel" style={{ padding: 10, textAlign: 'left', background: used > 0.9 ? 'var(--status-critical-bg)' : used > 0.5 ? 'var(--status-warning-bg)' : undefined }} onClick={() => setEditLoc(l)}>
                        <b className="sx-mono">{locLabel(l)}</b>
                        <div className="sx-muted" style={{ fontSize: 11 }}>
                          {l.preferredGrade ? `Grade ${l.preferredGrade} · ` : ''}
                          {Math.round(used * 100)}% full
                        </div>
                        <Meter value={used} tone={used > 0.9 ? 'red' : used > 0.5 ? 'gold' : 'green'} />
                        <small>{lots.map((x) => x.lotNo).join(', ') || 'Empty'}</small>
                      </button>
                    );
                  })}
              </div>
            </section>
          ))}
        </>
      )}
      {editWh && <WarehouseModal w={editWh} onClose={() => setEditWh(null)} />}
      {editLoc && <LocationModal l={editLoc} onClose={() => setEditLoc(null)} />}
    </SuitePage>
  );
};

const WarehouseModal: React.FC<{ w: Warehouse; onClose: () => void }> = ({ w, onClose }) => {
  const { ops } = useWarehouseExt();
  const [v, setV] = useState<Warehouse>(w);
  return (
    <Modal
      size="md"
      title={w.id ? `Edit ${w.name}` : 'New warehouse'}
      onClose={onClose}
      footer={
        <>
          {w.id && !w.main && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => ops.saveWarehouse({ ...v, archived: !v.archived }).ok && onClose()}>
              <Archive size={14} /> {v.archived ? 'Restore' : 'Archive'}
            </button>
          )}
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => ops.saveWarehouse(v).ok && onClose()}>
            Save
          </button>
        </>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Field label="Name" required span={2}>
          <input className="form-control" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </Field>
        <Field label="Location" required span={2}>
          <input className="form-control" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className="form-control" value={v.kind ?? 'GODOWN'} onChange={(e) => setV({ ...v, kind: e.target.value as Warehouse['kind'] })}>
            <option value="GODOWN">Tea godown</option>
            <option value="STUFFING_BASE">Stuffing base</option>
            <option value="PORT">Port store</option>
            <option value="FACTORY">Factory store</option>
          </select>
        </Field>
        <Field label="Capacity (kg)">
          <input className="form-control" type="number" value={v.capacityKg ?? 0} onChange={(e) => setV({ ...v, capacityKg: Number(e.target.value) })} />
        </Field>
        <Field label="Capacity (units, packed goods)">
          <input className="form-control" type="number" value={v.capacity} onChange={(e) => setV({ ...v, capacity: Number(e.target.value) })} />
        </Field>
      </div>
      <p className="sx-note">Warehouses are set up by the Operations Manager. A warehouse holding stock cannot be archived.</p>
    </Modal>
  );
};

const LocationModal: React.FC<{ l: StorageLocation; onClose: () => void }> = ({ l, onClose }) => {
  const { ops, saveLocation } = useWarehouseExt();
  const [v, setV] = useState(l);
  return (
    <Modal size="md" title={l.id ? `Location ${locLabel(l)}` : 'New location'} onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => saveLocation(v).ok && onClose()}>Save</button>}>
      <div className="sx-grid sx-grid-2">
        <Field label="Warehouse" span={2}>
          <select className="form-control" value={v.warehouseId} disabled={!!l.id} onChange={(e) => setV({ ...v, warehouseId: e.target.value })}>
            {ops.state.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Block">
          <input className="form-control" value={v.block} onChange={(e) => setV({ ...v, block: e.target.value })} />
        </Field>
        <Field label="Bay">
          <input className="form-control" value={v.bay} onChange={(e) => setV({ ...v, bay: e.target.value })} />
        </Field>
        <Field label="Row">
          <input className="form-control" value={v.row} onChange={(e) => setV({ ...v, row: e.target.value })} />
        </Field>
        <Field label="Capacity kg">
          <input className="form-control" type="number" value={v.capacityKg} onChange={(e) => setV({ ...v, capacityKg: Number(e.target.value) })} />
        </Field>
        <Field label="Zone">
          <select className="form-control" value={v.zone} onChange={(e) => setV({ ...v, zone: e.target.value as StorageLocation['zone'] })}>
            {['GENERAL', 'QUARANTINE', 'STUFFING', 'BONDED'].map((z) => (
              <option key={z} value={z}>
                {z.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Slotted for grade">
          <input className="form-control" value={v.preferredGrade ?? ''} onChange={(e) => setV({ ...v, preferredGrade: e.target.value || undefined })} placeholder="e.g. BP1" />
        </Field>
        <Field label="Active">
          <select className="form-control" value={v.active ? 'Y' : 'N'} onChange={(e) => setV({ ...v, active: e.target.value === 'Y' })}>
            <option value="Y">Active</option>
            <option value="N">Inactive</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
};

/* ================================================================== */
/* Tasks                                                               */
/* ================================================================== */

export const TasksPage: React.FC = () => {
  const { state, ops, autoAssign, setTask, addTask } = useWarehouseExt();
  const { readOnly } = useAccess();
  const [filter, setFilter] = useState<'OPEN' | 'ALL'>('OPEN');
  const [type, setType] = useState<TaskType>('PUTAWAY');
  const [detail, setDetail] = useState('');
  const [wh, setWh] = useState('WH-CHG');
  const rows = state.tasks.filter((t) => filter === 'ALL' || t.status !== 'DONE');
  const cols: Column<WarehouseTask>[] = [
    { key: 'n', header: 'Task', render: (t) => <b className="sx-mono">{t.number}</b>, sort: (t) => t.number },
    { key: 't', header: 'Type', render: (t) => t.type.toLowerCase() },
    { key: 'd', header: 'Work', render: (t) => <div className="sx-cell-main"><span>{t.detail}</span><small>{t.ref} · {ops.state.warehouses.find((w) => w.id === t.warehouseId)?.name}</small></div> },
    { key: 'm', header: 'Min', render: (t) => t.minutes, align: 'right', hideOnMobile: true },
    {
      key: 'a',
      header: 'Assigned to',
      render: (t) =>
        t.status === 'DONE' || readOnly ? (
          (t.assignee ?? '—')
        ) : (
          <select className="form-control" value={t.assignee ?? ''} onChange={(e) => setTask(t.id, { assignee: e.target.value || undefined })} aria-label={`Assignee ${t.number}`}>
            <option value="">Unassigned</option>
            {state.workers
              .filter((w) => w.skills.includes(t.type))
              .map((w) => (
                <option key={w.name}>{w.name}</option>
              ))}
          </select>
        )
    },
    {
      key: 's',
      header: 'Status',
      render: (t) =>
        t.status === 'DONE' || readOnly ? (
          <Pill status={t.status === 'DONE' ? 'POSTED' : t.status === 'IN_PROGRESS' ? 'OPEN' : 'DRAFT'} label={t.status.toLowerCase().replace('_', ' ')} />
        ) : (
          <div className="sx-actions">
            {t.status === 'OPEN' && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => setTask(t.id, { status: 'IN_PROGRESS' })}>
                Start
              </button>
            )}
            <button type="button" className="btn btn-primary btn-xs" onClick={() => setTask(t.id, { status: 'DONE' })}>
              Done
            </button>
          </div>
        )
    }
  ];
  return (
    <SuitePage
      eyebrow="Warehousing"
      title="Tasks"
      subtitle="Receiving, put-away, picking, stuffing, counting and QC tasks are raised automatically and shared out to the person at that site with the most free time."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={autoAssign}>
          <Wand2 size={15} /> Auto-assign open tasks
        </button>
      }
    >
      <ReadOnlyNote />
      <div className="sx-row">
        <section className="sx-panel">
          <div className="sx-panel-head">
            <div>
              <h2>
                <Users size={15} /> Labour pool
              </h2>
              <p>Minutes of open work against each person’s shift</p>
            </div>
          </div>
          <div className="sx-panel-body">
            <ul className="sx-barlist">
              {state.workers.map((w) => {
                const load = workerLoad(state.tasks, w.name);
                return (
                  <li key={w.name}>
                    <div>
                      <span>
                        {w.name} <small className="sx-muted">· {ops.state.warehouses.find((x) => x.id === w.warehouseId)?.name.split(' — ')[1]}</small>
                      </span>
                      <b>
                        {load} / {w.shiftMinutes} min
                      </b>
                    </div>
                    <Meter value={load / w.shiftMinutes} tone={load / w.shiftMinutes > 0.85 ? 'red' : 'green'} />
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
        {!readOnly && (
          <section className="sx-panel">
            <div className="sx-panel-head">
              <div>
                <h2>Add a task</h2>
              </div>
            </div>
            <div className="sx-panel-body sx-grid sx-grid-2">
              <Field label="Type">
                <select className="form-control" value={type} onChange={(e) => setType(e.target.value as TaskType)}>
                  {(['RECEIVE', 'PUTAWAY', 'PICK', 'STUFF', 'COUNT', 'QC', 'DISPATCH'] as TaskType[]).map((t) => (
                    <option key={t} value={t}>
                      {t.toLowerCase()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Site">
                <select className="form-control" value={wh} onChange={(e) => setWh(e.target.value)}>
                  {ops.state.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="What needs doing" span={2}>
                <input className="form-control" value={detail} onChange={(e) => setDetail(e.target.value)} />
              </Field>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => addTask(type, wh, '', detail).ok && setDetail('')}>
                <Plus size={14} /> Add and assign
              </button>
            </div>
          </section>
        )}
      </div>
      <div className="sx-toolbar">
        <Chips value={filter} onChange={setFilter} options={[{ value: 'OPEN', label: 'Open', count: state.tasks.filter((t) => t.status !== 'DONE').length }, { value: 'ALL', label: 'All', count: state.tasks.length }]} />
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(t) => t.id} initialSort={{ key: 'n', dir: 'desc' }} />
    </SuitePage>
  );
};

/* ================================================================== */
/* Count plans and handling-unit counts                                */
/* ================================================================== */

export const CyclePage: React.FC = () => {
  const { state, ops, saveCountPlan, startHuCount } = useWarehouseExt();
  const [openId, setOpenId] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ warehouseId: string; type: 'ANNUAL' | 'CYCLE'; abc: 'A' | 'B' | 'C' | 'ALL'; everyDays: number }>({ warehouseId: 'WH-MSA', type: 'CYCLE', abc: 'A', everyDays: 30 });
  const pcols: Column<CountPlan>[] = [
    { key: 'w', header: 'Warehouse', render: (p) => ops.state.warehouses.find((w) => w.id === p.warehouseId)?.name },
    { key: 't', header: 'Count', render: (p) => (p.type === 'ANNUAL' ? 'Annual — everything' : `Cycle — class ${p.abc}`) },
    { key: 'f', header: 'Every', render: (p) => `${p.everyDays} days`, align: 'right' },
    { key: 'l', header: 'Last done', render: (p) => fmtDate(p.lastDone) },
    { key: 'd', header: 'Next due', render: (p) => <span className={countPlanState(p) !== 'OK' ? 'sx-danger-text' : ''}>{fmtDate(countPlanDue(p))}</span>, sort: countPlanDue },
    { key: 's', header: '', render: (p) => <button type="button" className="btn btn-secondary btn-xs" onClick={() => startHuCount(p.id)}>Start count</button> }
  ];
  const open = state.huCounts.find((c) => c.id === openId || c.number === openId);
  return (
    <SuitePage eyebrow="Warehousing" title="Count plans" subtitle="Annual wall-to-wall counts and periodic ABC cycle counts. Counts scan handling units (barcode or RFID); missing units are written off only when the Operations Manager approves.">
      <ReadOnlyNote />
      <div className="sx-stats">
        <Stat label="Counts due" value={state.countPlans.filter((p) => countPlanState(p) !== 'OK').length} icon={<ClipboardCheck size={17} />} tone="gold" />
        <Stat label="Open counts" value={state.huCounts.filter((c) => c.status !== 'APPROVED').length} icon={<ClipboardCheck size={17} />} tone="blue" />
        <Stat label="Units written off" value={state.hus.filter((h) => h.status === 'MISSING').length} icon={<ShieldAlert size={17} />} tone="red" />
      </div>
      <DataTable rows={state.countPlans} columns={pcols} rowKey={(p) => p.id} />
      <div className="sx-inline-form">
        <select className="form-control" value={plan.warehouseId} onChange={(e) => setPlan({ ...plan, warehouseId: e.target.value })} aria-label="Warehouse">
          {ops.state.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select className="form-control" value={plan.type} onChange={(e) => setPlan({ ...plan, type: e.target.value as 'ANNUAL' | 'CYCLE', everyDays: e.target.value === 'ANNUAL' ? 365 : 30, abc: e.target.value === 'ANNUAL' ? 'ALL' : plan.abc })} aria-label="Type">
          <option value="CYCLE">Cycle count</option>
          <option value="ANNUAL">Annual count</option>
        </select>
        <select className="form-control" value={plan.abc} onChange={(e) => setPlan({ ...plan, abc: e.target.value as 'A' })} aria-label="ABC class">
          {['A', 'B', 'C', 'ALL'].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <input className="form-control" type="number" value={plan.everyDays} onChange={(e) => setPlan({ ...plan, everyDays: Number(e.target.value) })} aria-label="Every days" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => saveCountPlan(plan)}>
          <Plus size={14} /> Add plan
        </button>
      </div>
      <p className="sx-note">Item (SKU) counts for packed goods also offer a cycle option under Warehousing › Stock counts.</p>
      <h4 className="sx-subhead">Handling-unit counts</h4>
      <DataTable
        rows={state.huCounts}
        columns={[
          { key: 'n', header: 'Count', render: (c) => <b className="sx-mono">{c.number}</b> },
          { key: 'w', header: 'Warehouse', render: (c) => ops.state.warehouses.find((w) => w.id === c.warehouseId)?.name },
          { key: 'p', header: 'Scanned', render: (c) => `${c.scanned.length}/${c.expected.length}`, align: 'right' },
          { key: 's', header: 'Status', render: (c) => <Pill status={{ OPEN: 'OPEN', SUBMITTED: 'SUBMITTED', APPROVED: 'POSTED' }[c.status]} label={c.status.toLowerCase()} /> }
        ]}
        rowKey={(c) => c.id}
        onRowClick={(c) => setOpenId(c.id)}
        empty="No counts yet — start one from a plan above"
      />
      {open && <HuCountDrawer c={open} onClose={() => setOpenId(null)} />}
    </SuitePage>
  );
};

const HuCountDrawer: React.FC<{ c: HuCount; onClose: () => void }> = ({ c, onClose }) => {
  const { state, scanHu, submitHuCount, approveHuCount } = useWarehouseExt();
  const { readOnly } = useAccess();
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const missing = c.expected.filter((x) => !c.scanned.includes(x));
  return (
    <Drawer
      wide
      title={c.number}
      subtitle={`${c.scanned.length} of ${c.expected.length} handling units scanned`}
      badge={<Pill status={{ OPEN: 'OPEN', SUBMITTED: 'SUBMITTED', APPROVED: 'POSTED' }[c.status]} label={c.status.toLowerCase()} />}
      onClose={onClose}
      footer={
        !readOnly && (
          <>
            {c.status === 'OPEN' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => submitHuCount(c.id)}>
                Submit count
              </button>
            )}
            {c.status === 'SUBMITTED' && (
              <>
                <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explain missing units" aria-label="Explanation" />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => approveHuCount(c.id, note)}>
                  Approve
                </button>
              </>
            )}
          </>
        )
      }
    >
      {c.status === 'OPEN' && !readOnly && (
        <>
          <ScanBox
            onScan={(code) => {
              const r = scanHu(c.id, code);
              setMsg(r.ok ? `Scanned ${r.id}` : '');
            }}
          />
          <p className="sx-note">
            {msg || 'Scan each handling unit’s barcode or RFID tag (keyboard-wedge scanner, or type the code).'} Quick fill (demo):{' '}
            {missing.slice(0, 4).map((id) => (
              <button key={id} type="button" className="btn btn-ghost btn-xs" onClick={() => scanHu(c.id, state.hus.find((h) => h.id === id)!.code)}>
                {state.hus.find((h) => h.id === id)?.code}
              </button>
            ))}
          </p>
        </>
      )}
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Handling unit</th>
            <th>Lot</th>
            <th style={{ textAlign: 'right' }}>Kg</th>
            <th>Found</th>
          </tr>
        </thead>
        <tbody>
          {c.expected.map((id) => {
            const h = state.hus.find((x) => x.id === id)!;
            return (
              <tr key={id}>
                <td className="sx-mono">{h.code}</td>
                <td>{state.lots.find((l) => l.id === h.lotId)?.lotNo}</td>
                <td style={{ textAlign: 'right' }}>{num(h.kg)}</td>
                <td>{c.scanned.includes(id) ? <span className="sx-success-text">Yes</span> : c.status === 'OPEN' ? <span className="sx-muted">Not yet</span> : <b className="sx-danger-text">Missing</b>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Timeline items={c.history} />
    </Drawer>
  );
};

/* ================================================================== */
/* Item setup: units of measure, attributes, MSDS                      */
/* ================================================================== */

type ItemTab = 'uom' | 'attributes' | 'msds';
export const ItemsPage: React.FC = () => {
  const { state, ops, saveSetup } = useWarehouseExt();
  const { readOnly } = useAccess();
  const [tab, setTab] = useState<ItemTab>('uom');
  const [sku, setSku] = useState('BLK-25');
  const [uoms, setUoms] = useState(state.setup.uoms[sku] ?? []);
  const [attrs, setAttrs] = useState(state.setup.attributes[sku] ?? {});
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState(uoms[0]?.code ?? '');
  const [newDef, setNewDef] = useState('');
  const [msds, setMsds] = useState<Msds | null>(null);
  const items = ops.products.filter((p) => p.kind !== 'SERVICE');
  const product = items.find((p) => p.sku === sku);
  const pick = (s: string) => {
    setSku(s);
    setUoms(state.setup.uoms[s] ?? []);
    setAttrs(state.setup.attributes[s] ?? {});
    setUnit((state.setup.uoms[s] ?? [])[0]?.code ?? '');
  };
  return (
    <SuitePage eyebrow="Warehousing" title="Item setup" subtitle="Alternative units of measure with conversions, product attributes (grade, garden, season, origin, packaging) and material safety data sheets.">
      <ReadOnlyNote />
      <div className="sx-toolbar">
        <Chips value={tab} onChange={setTab} options={[{ value: 'uom', label: 'Units of measure' }, { value: 'attributes', label: 'Attributes' }, { value: 'msds', label: 'MSDS', count: state.setup.msds.length }]} />
        {tab !== 'msds' && (
          <select className="form-control" style={{ width: 'auto' }} value={sku} onChange={(e) => pick(e.target.value)} aria-label="Item">
            {items.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.sku} — {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {tab === 'uom' && (
        <div className="sx-row">
          <section className="sx-panel">
            <div className="sx-panel-head">
              <div>
                <h2>Units for {sku}</h2>
                <p>Base unit: {product?.unit}. Factor = base units in one of the alternative unit.</p>
              </div>
            </div>
            <div className="sx-panel-body">
              <table className="sx-mini-table sx-alloc">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Factor</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {uoms.map((u, i) => (
                    <tr key={i}>
                      <td>
                        <input className="form-control" value={u.code} disabled={readOnly} onChange={(e) => setUoms(uoms.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} aria-label="Unit code" />
                      </td>
                      <td>
                        <input className="form-control" type="number" step="any" value={u.factor} disabled={readOnly} onChange={(e) => setUoms(uoms.map((x, j) => (j === i ? { ...x, factor: Number(e.target.value) } : x)))} aria-label="Factor" />
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-xs" disabled={readOnly} onClick={() => setUoms(uoms.filter((_, j) => j !== i))}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!readOnly && (
                <div className="sx-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUoms([...uoms, { code: '', factor: 1 }])}>
                    <Plus size={14} /> Add unit
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => saveSetup({ uoms: { ...state.setup.uoms, [sku]: uoms } }, `Units for ${sku}`)}>
                    Save units
                  </button>
                </div>
              )}
            </div>
          </section>
          <section className="sx-panel">
            <div className="sx-panel-head">
              <div>
                <h2>
                  <Scale size={15} /> Converter
                </h2>
                <p>Transfers can be entered in any of these units and are converted to the base unit.</p>
              </div>
            </div>
            <div className="sx-panel-body sx-inline-form">
              <input className="form-control" type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} aria-label="Quantity" />
              <select className="form-control" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
                <option value="">{product?.unit}</option>
                {(state.setup.uoms[sku] ?? []).map((u) => (
                  <option key={u.code}>{u.code}</option>
                ))}
              </select>
              <b>
                = {toBase(qty, unit, state.setup.uoms[sku])} {product?.unit}
              </b>
            </div>
          </section>
        </div>
      )}
      {tab === 'attributes' && (
        <section className="sx-panel">
          <div className="sx-panel-head">
            <div>
              <h2>Attributes of {sku}</h2>
              <p>Several attributes per SKU, used for grouping and sorting in reports.</p>
            </div>
          </div>
          <div className="sx-panel-body">
            <div className="sx-grid sx-grid-2">
              {state.setup.attributeDefs.map((d) => (
                <Field key={d.key} label={d.label}>
                  <input className="form-control" value={attrs[d.key] ?? ''} disabled={readOnly} onChange={(e) => setAttrs({ ...attrs, [d.key]: e.target.value })} />
                </Field>
              ))}
            </div>
            {!readOnly && (
              <div className="sx-inline-form">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => saveSetup({ attributes: { ...state.setup.attributes, [sku]: attrs } }, `Attributes of ${sku}`)}>
                  Save attributes
                </button>
                <input className="form-control" value={newDef} onChange={(e) => setNewDef(e.target.value)} placeholder="New attribute, e.g. Certification" aria-label="New attribute" />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => newDef.trim() && saveSetup({ attributeDefs: [...state.setup.attributeDefs, { key: newDef.trim(), label: newDef.trim() }] }, `Attribute ${newDef}`).ok && setNewDef('')}>
                  <Plus size={14} /> Define attribute
                </button>
              </div>
            )}
          </div>
        </section>
      )}
      {tab === 'msds' && (
        <>
          <div className="sx-actions">
            {!readOnly && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setMsds({ key: '', title: '', revision: 'Rev 1', hazards: '', handling: '', firstAid: '', updated: TODAY })}>
                <Plus size={14} /> New MSDS
              </button>
            )}
          </div>
          <DataTable
            rows={state.setup.msds}
            columns={[
              { key: 'k', header: 'Product / group', render: (m) => <b>{m.key}</b> },
              { key: 't', header: 'Sheet', render: (m) => `${m.title} (${m.revision})` },
              { key: 'h', header: 'Hazards', render: (m) => m.hazards, hideOnMobile: true },
              { key: 'u', header: 'Reviewed', render: (m) => fmtDate(m.updated) },
              {
                key: 'p',
                header: '',
                render: (m) => (
                  <button type="button" className="btn btn-secondary btn-xs" onClick={(e) => (e.stopPropagation(), printDocument(`MSDS ${m.key}`, `<h1>${esc(m.title)}</h1><p>${esc(m.key)} · ${esc(m.revision)}</p><h2>Hazards</h2><p>${esc(m.hazards)}</p><h2>Handling and storage</h2><p>${esc(m.handling)}</p><h2>First aid</h2><p>${esc(m.firstAid)}</p>`))}>
                    <Printer size={12} /> Print
                  </button>
                )
              }
            ]}
            rowKey={(m) => m.key}
            onRowClick={setMsds}
          />
          <p className="sx-note">MSDS sheets are matched to a shipment by SKU or product group and print with the shipment document pack (Shipping › Document templates › Material safety data sheet).</p>
        </>
      )}
      {msds && <MsdsModal m={msds} onClose={() => setMsds(null)} />}
    </SuitePage>
  );
};

const MsdsModal: React.FC<{ m: Msds; onClose: () => void }> = ({ m, onClose }) => {
  const { actor, saveMsds } = useWarehouseExt();
  const { readOnly } = useAccess();
  const [v, setV] = useState(m);
  return (
    <Modal size="lg" title={m.key ? `MSDS — ${m.key}` : 'New MSDS'} onClose={onClose} footer={!readOnly && <button type="button" className="btn btn-primary btn-sm" onClick={() => saveMsds(v).ok && onClose()}>Save</button>}>
      <div className="sx-grid sx-grid-2">
        <Field label="Product code or group" required>
          <input className="form-control" value={v.key} disabled={!!m.key} onChange={(e) => setV({ ...v, key: e.target.value })} placeholder="e.g. Bulk or PKG-FLM" />
        </Field>
        <Field label="Revision">
          <input className="form-control" value={v.revision} onChange={(e) => setV({ ...v, revision: e.target.value })} />
        </Field>
        <Field label="Title" required span={2}>
          <input className="form-control" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        </Field>
        <Field label="Hazards" required span={2}>
          <textarea className="form-control" rows={2} value={v.hazards} onChange={(e) => setV({ ...v, hazards: e.target.value })} />
        </Field>
        <Field label="Handling & storage" span={2}>
          <textarea className="form-control" rows={2} value={v.handling} onChange={(e) => setV({ ...v, handling: e.target.value })} />
        </Field>
        <Field label="First aid" span={2}>
          <textarea className="form-control" rows={2} value={v.firstAid} onChange={(e) => setV({ ...v, firstAid: e.target.value })} />
        </Field>
      </div>
      {m.key && <Attachments owner={`msds:${m.key}`} by={actor.name} readOnly={readOnly} title="Supplier MSDS (PDF)" />}
    </Modal>
  );
};

/* ================================================================== */
/* Warehouse billing                                                   */
/* ================================================================== */

export const BillingPage: React.FC = () => {
  const { state, partyName, setTariff, billOwner } = useWarehouseExt();
  const { readOnly } = useAccess();
  const owners = Array.from(new Set(state.lots.filter((l) => l.owner !== 'OWN' && l.ownership === 'CUSTOMER').map((l) => l.owner)));
  const [owner, setOwner] = useState(owners[0] ?? '');
  const [from, setFrom] = useState(addDays(TODAY, -30));
  const [to, setTo] = useState(TODAY);
  const [rates, setRates] = useState<Record<string, number>>(Object.fromEntries(state.tariffs.map((t) => [t.activity, t.rate])));
  const b = owner ? billingFor(state, owner, from, to) : { lines: [], total: 0 };
  return (
    <SuitePage eyebrow="Warehousing" title="Warehouse billing" subtitle="Handling, storage and stuffing charges for tea held for customers, built up from the lot ledger and posted to Finance as an invoice.">
      <ReadOnlyNote />
      <div className="sx-row">
        <section className="sx-panel">
          <div className="sx-panel-head">
            <div>
              <h2>Tariffs</h2>
              <p>Rates in KES</p>
            </div>
          </div>
          <div className="sx-panel-body">
            <table className="sx-mini-table sx-alloc">
              <tbody>
                {state.tariffs.map((t) => (
                  <tr key={t.activity}>
                    <td>{TARIFF_LABEL[t.activity]}</td>
                    <td className="sx-muted">{t.basis.toLowerCase().replace(/_/g, ' ')}</td>
                    <td>
                      <input className="form-control" type="number" value={rates[t.activity]} disabled={readOnly} onChange={(e) => setRates({ ...rates, [t.activity]: Number(e.target.value) })} aria-label={`Rate ${t.activity}`} />
                    </td>
                    <td>
                      {!readOnly && rates[t.activity] !== t.rate && (
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => setTariff(t.activity, rates[t.activity])}>
                          Save
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="sx-panel">
          <div className="sx-panel-head">
            <div>
              <h2>Charges for a period</h2>
            </div>
          </div>
          <div className="sx-panel-body">
            <div className="sx-inline-form">
              <select className="form-control" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Customer">
                {owners.map((o) => (
                  <option key={o} value={o}>
                    {partyName(o)}
                  </option>
                ))}
              </select>
              <input className="form-control" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
              <input className="form-control" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
            </div>
            <table className="sx-mini-table">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Rate</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {b.lines.map((l) => (
                  <tr key={l.activity}>
                    <td>{TARIFF_LABEL[l.activity]}</td>
                    <td style={{ textAlign: 'right' }}>
                      {l.qty.toLocaleString()} {l.unit}
                    </td>
                    <td style={{ textAlign: 'right' }}>{l.rate.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{kes(l.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3}>
                    <b>Total</b>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <b>{kes(b.total)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
            {!readOnly && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => billOwner(owner, from, to)}>
                <Receipt size={14} /> Raise invoice in Finance
              </button>
            )}
          </div>
        </section>
      </div>
      <h4 className="sx-subhead">Billing runs</h4>
      <DataTable
        rows={state.billingRuns}
        columns={[
          { key: 'o', header: 'Customer', render: (r) => partyName(r.owner) },
          { key: 'p', header: 'Period', render: (r) => `${fmtDate(r.from)} – ${fmtDate(r.to)}` },
          { key: 'a', header: 'Amount', render: (r) => kes(r.amount), align: 'right' },
          { key: 'i', header: 'Invoice', render: (r) => r.invoiceNumber ?? '—' },
          { key: 'b', header: 'By', render: (r) => r.by }
        ]}
        rowKey={(r) => r.id}
        empty="Nothing billed yet"
      />
    </SuitePage>
  );
};

/* ================================================================== */
/* Printing jobs                                                       */
/* ================================================================== */

const PJ_PILL: Record<PrintJob['status'], string> = { REQUESTED: 'DRAFT', PROOF_SENT: 'SUBMITTED', APPROVED_BY_CLIENT: 'APPROVED', PRINTED: 'POSTED', REJECTED: 'REJECTED' };
export const PrintingPage: React.FC = () => {
  const { state, partyName, printStep } = useWarehouseExt();
  const { readOnly } = useAccess();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const open = state.printJobs.find((j) => j.id === openId);
  return (
    <SuitePage eyebrow="Warehousing" title="Printing jobs" subtitle="Bag markings and labels for each shipping instruction: proof to the client, client approval on the portal, then printing.">
      <ReadOnlyNote />
      <DataTable
        rows={state.printJobs}
        columns={[
          { key: 'n', header: 'Job', render: (j) => <b className="sx-mono">{j.number}</b> },
          { key: 'r', header: 'For', render: (j) => <div className="sx-cell-main"><span>{j.ref}</span><small>{partyName(j.customerId)}</small></div> },
          { key: 'm', header: 'Material', render: (j) => `${j.qty} ${j.material.toLowerCase()}` },
          { key: 'k', header: 'Markings', render: (j) => j.markings, hideOnMobile: true },
          { key: 's', header: 'Status', render: (j) => <Pill status={PJ_PILL[j.status]} label={j.status.toLowerCase().replace(/_/g, ' ')} /> }
        ]}
        rowKey={(j) => j.id}
        onRowClick={(j) => setOpenId(j.id)}
        empty="Print jobs are raised when a shipping instruction is confirmed"
      />
      {open && (
        <Drawer title={open.number} subtitle={`${open.ref} · ${partyName(open.customerId)}`} badge={<Pill status={PJ_PILL[open.status]} label={open.status.toLowerCase().replace(/_/g, ' ')} />} onClose={() => setOpenId(null)}>
          <DefList items={[['Material', `${open.qty} ${open.material.toLowerCase()}`], ['Markings', open.markings]]} />
          {!readOnly && (
            <div className="sx-inline-form">
              {(open.status === 'REQUESTED' || open.status === 'REJECTED') && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => printStep(open.id, 'PROOF')}>
                  Send proof to client
                </button>
              )}
              {open.status === 'PROOF_SENT' && (
                <>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => printStep(open.id, 'APPROVE')}>
                    Approve markings (client)
                  </button>
                  <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Changes needed" aria-label="Changes" />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => printStep(open.id, 'REJECT', note)}>
                    Reject
                  </button>
                </>
              )}
              {open.status === 'APPROVED_BY_CLIENT' && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => printStep(open.id, 'PRINTED')}>
                  Mark printed
                </button>
              )}
            </div>
          )}
          <p className="sx-note">The client approves on the customer portal (switch to the customer persona).</p>
          <Timeline items={open.history} />
        </Drawer>
      )}
    </SuitePage>
  );
};

/* ================================================================== */
/* Sensors (IoT, simulated)                                            */
/* ================================================================== */

export const SensorsPage: React.FC = () => {
  const { state, ops, pollSensors } = useWarehouseExt();
  const sites = Array.from(new Set(state.sensors.map((r) => r.warehouseId)));
  const latest = (wh: string) => [...state.sensors].filter((r) => r.warehouseId === wh).sort((a, b) => b.at.localeCompare(a.at))[0];
  return (
    <SuitePage
      eyebrow="Warehousing"
      title="Sensors (IoT)"
      subtitle="Temperature and humidity in each godown. Tea is kept below 30 °C and 70% relative humidity."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={pollSensors}>
          <Activity size={15} /> Poll sensors now
        </button>
      }
    >
      <p className="sx-note">
        <SimBadge /> No IoT gateway is connected in this build — readings are generated. A live deployment would post readings to the same place.
      </p>
      <div className="sx-stats">
        {sites.map((wh) => {
          const r = latest(wh);
          const bad = r && (r.tempC > SENSOR_LIMITS.tempC || r.humidity > SENSOR_LIMITS.humidity);
          return <Stat key={wh} label={ops.state.warehouses.find((w) => w.id === wh)?.name ?? wh} value={r ? `${r.tempC} °C · ${r.humidity}%` : '—'} detail={r ? `Read ${r.at.replace('T', ' ').slice(0, 16)}` : ''} icon={bad ? <Droplets size={17} /> : <Thermometer size={17} />} tone={bad ? 'red' : 'green'} />;
        })}
      </div>
      <DataTable
        rows={[...state.sensors].sort((a, b) => b.at.localeCompare(a.at))}
        columns={[
          { key: 'w', header: 'Warehouse', render: (r) => ops.state.warehouses.find((w) => w.id === r.warehouseId)?.name },
          { key: 'a', header: 'Time', render: (r) => r.at.replace('T', ' ').slice(0, 16) },
          { key: 't', header: 'Temp °C', render: (r) => <span className={r.tempC > SENSOR_LIMITS.tempC ? 'sx-danger-text' : ''}>{r.tempC}</span>, align: 'right' },
          { key: 'h', header: 'Humidity %', render: (r) => <span className={r.humidity > SENSOR_LIMITS.humidity ? 'sx-danger-text' : ''}>{r.humidity}</span>, align: 'right' }
        ]}
        rowKey={(r) => `${r.warehouseId}${r.at}`}
        pageSize={15}
      />
      <p className="sx-note">
        <LayoutGrid size={13} /> Alerts go to Stores and Quality by in-app notice and SMS (simulated).
      </p>
    </SuitePage>
  );
};
