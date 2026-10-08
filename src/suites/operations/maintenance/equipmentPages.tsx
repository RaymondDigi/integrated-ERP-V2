import React, { useState } from 'react';
import { Boxes, Plus, Trash2, Gauge, Activity, Ruler, Recycle, AlertTriangle, Wrench } from 'lucide-react';
import { Attachments, ExportCsvButton } from '../../../platform/Widgets';
import { useOperations } from '../store';
import { WO_LABEL } from '../engine';
import { accumulatedDepreciation, daysBetween, fmtDate, kes, TODAY } from '../../finance/engine';
import type { Equipment } from '../types';
import { Chips, DataTable, DefList, Drawer, Empty, Field, Modal, Pill, Stat, SuitePage, type Column } from '../../ui/kit';
import { PartySelect } from '../../commercial/parts';
import { useMaintenanceExt } from './store';
import { calibrationDue, conditionSeries, equipmentHistory } from './engine';
import { COST_CENTRES } from './data';
import type { BomLine, MeterUnit, Rotable } from './types';

const EQ_PILL: Record<Equipment['status'], [string, string]> = { RUNNING: ['POSTED', 'Running'], DOWN: ['REJECTED', 'Down'], SERVICE_DUE: ['SUBMITTED', 'Service due'] };
const blank = (): Equipment => ({ id: '', name: '', area: '', criticality: 'MEDIUM', status: 'RUNNING', type: '', make: '', serialNo: '', installed: TODAY, costCentre: 'Factory' });

export const EquipmentPage: React.FC = () => {
  const { state, products } = useOperations();
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Equipment | null>(null);
  const [area, setArea] = useState('ALL');
  const areas = [...new Set(state.equipment.map((e) => e.area))];
  const rows = state.equipment.filter((e) => area === 'ALL' || e.area === area);
  const columns: Column<Equipment>[] = [
    {
      key: 'n',
      header: 'Equipment',
      render: (e) => (
        <div className="sx-cell-main">
          <span>{e.name}</span>
          <small>
            {[e.type, e.make, e.serialNo && `S/N ${e.serialNo}`].filter(Boolean).join(' · ')}
          </small>
        </div>
      ),
      sort: (e) => e.name
    },
    { key: 'a', header: 'Area', render: (e) => e.area, sort: (e) => e.area, hideOnMobile: true },
    { key: 'cc', header: 'Cost centre', render: (e) => e.costCentre ?? '—', hideOnMobile: true },
    { key: 'c', header: 'Criticality', render: (e) => e.criticality.toLowerCase(), sort: (e) => ['HIGH', 'MEDIUM', 'LOW'].indexOf(e.criticality), hideOnMobile: true },
    { key: 'h', header: 'Maint. cost', render: (e) => kes(equipmentHistory(state, products, e.id).cost, { compact: true }), sort: (e) => equipmentHistory(state, products, e.id).cost, align: 'right', hideOnMobile: true },
    { key: 's', header: 'Status', render: (e) => <Pill status={EQ_PILL[e.status][0]} label={EQ_PILL[e.status][1]} />, sort: (e) => e.status }
  ];
  const sel = state.equipment.find((e) => e.id === openId);
  return (
    <SuitePage
      eyebrow="Maintenance"
      title="Equipment register"
      subtitle="Every machine and vehicle with its make, serial number, location, cost centre, bill of materials, warranty, meters and full maintenance history."
      actions={
        <>
          <ExportCsvButton
            name="equipment-register"
            header={['Name', 'Type', 'Make', 'Serial', 'Area', 'Cost centre', 'Criticality', 'Status', 'Installed', 'Warranty until']}
            rows={() => state.equipment.map((e) => [e.name, e.type, e.make, e.serialNo, e.area, e.costCentre, e.criticality, e.status, e.installed, e.warranty?.until])}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit(blank())}>
            <Plus size={15} /> Add equipment
          </button>
        </>
      }
    >
      <div className="sx-stats">
        <Stat label="Registered" value={state.equipment.length} icon={<Boxes size={17} />} />
        <Stat label="Down now" value={state.equipment.filter((e) => e.status === 'DOWN').length} icon={<AlertTriangle size={17} />} tone="red" />
        <Stat label="Under warranty" value={state.equipment.filter((e) => e.warranty && e.warranty.until >= TODAY).length} icon={<Boxes size={17} />} tone="blue" />
        <Stat label="Linked to fixed assets" value={state.equipment.filter((e) => e.assetId).length} icon={<Boxes size={17} />} tone="violet" />
      </div>
      <div className="sx-toolbar">
        <Chips value={area} onChange={setArea} options={[{ value: 'ALL', label: 'All areas', count: state.equipment.length }, ...areas.map((a) => ({ value: a, label: a, count: state.equipment.filter((e) => e.area === a).length }))]} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(e) => e.id} onRowClick={(e) => setOpenId(e.id)} selected={openId} initialSort={{ key: 'n', dir: 'asc' }} />
      {sel && <EquipmentDrawer e={sel} onClose={() => setOpenId(null)} onEdit={() => setEdit({ ...sel })} />}
      {edit && <EquipmentModal e={edit} onClose={() => setEdit(null)} />}
    </SuitePage>
  );
};

const EquipmentModal: React.FC<{ e: Equipment; onClose: () => void }> = ({ e, onClose }) => {
  const mx = useMaintenanceExt();
  const [f, setF] = useState<Equipment>(e);
  return (
    <Modal
      title={e.id ? `Edit ${e.name}` : 'Add equipment'}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => mx.saveEquipment(f).ok && onClose()}>
          Save
        </button>
      }
    >
      <div className="sx-grid">
        <Field label="Name" required span={2}>
          <input className="form-control" value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} />
        </Field>
        <Field label="Type" required>
          <input className="form-control" value={f.type ?? ''} onChange={(x) => setF({ ...f, type: x.target.value })} placeholder="Packing machine" />
        </Field>
        <Field label="Make / model">
          <input className="form-control" value={f.make ?? ''} onChange={(x) => setF({ ...f, make: x.target.value })} />
        </Field>
        <Field label="Serial number">
          <input className="form-control" value={f.serialNo ?? ''} onChange={(x) => setF({ ...f, serialNo: x.target.value })} />
        </Field>
        <Field label="Location / area" required>
          <input className="form-control" value={f.area} onChange={(x) => setF({ ...f, area: x.target.value })} />
        </Field>
        <Field label="Cost centre">
          <select className="form-control" value={f.costCentre ?? ''} onChange={(x) => setF({ ...f, costCentre: x.target.value })}>
            {COST_CENTRES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Criticality">
          <select className="form-control" value={f.criticality} onChange={(x) => setF({ ...f, criticality: x.target.value as Equipment['criticality'] })}>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </Field>
        <Field label="Installed">
          <input className="form-control" type="date" value={f.installed ?? ''} onChange={(x) => setF({ ...f, installed: x.target.value })} />
        </Field>
        <Field label="Production line (stops when down)" span={2}>
          <input className="form-control" value={f.productionLine ?? ''} onChange={(x) => setF({ ...f, productionLine: x.target.value || undefined })} placeholder="Line 1 — Standard" />
        </Field>
        <Field label="Meter">
          <select className="form-control" value={f.meter?.unit ?? ''} onChange={(x) => setF({ ...f, meter: x.target.value ? { unit: x.target.value as MeterUnit, reading: f.meter?.reading ?? 0 } : undefined })}>
            <option value="">None</option>
            <option value="HOURS">Running hours</option>
            <option value="KM">Kilometres</option>
            <option value="CYCLES">Cycles</option>
            <option value="KWH">kWh</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
};

const EquipmentDrawer: React.FC<{ e: Equipment; onClose: () => void; onEdit: () => void }> = ({ e, onClose, onEdit }) => {
  const { state, products, finance, pname, setMaintenance, actor } = useOperations();
  const mx = useMaintenanceExt();
  const h = equipmentHistory(state, products, e.id);
  const asset = finance.state.assets.find((a) => a.id === e.assetId);
  const [bom, setBom] = useState<BomLine[] | null>(null);
  const [meter, setMeter] = useState('');
  const [cond, setCond] = useState({ parameter: 'Vibration', unit: 'mm/s', value: '', warn: '4.5', alarm: '7.1' });
  const [war, setWar] = useState({ supplierId: e.warranty?.supplierId ?? '', until: e.warranty?.until ?? '', terms: e.warranty?.terms ?? '' });
  const [assetId, setAssetId] = useState(e.assetId ?? '');
  const series = conditionSeries(mx.state.conditions.filter((c) => c.equipmentId === e.id));
  const readings = mx.state.meterReadings.filter((r) => r.equipmentId === e.id).sort((a, b) => b.date.localeCompare(a.date));
  const spares = products.filter((p) => p.kind === 'MATERIAL' && p.category === 'Spares');
  return (
    <Drawer
      wide
      title={e.name}
      subtitle={`${e.area}${e.serialNo ? ` · S/N ${e.serialNo}` : ''}`}
      badge={<Pill status={EQ_PILL[e.status][0]} label={EQ_PILL[e.status][1]} />}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
            Edit details
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setMaintenance('workorders', 'new')}>
            <Wrench size={14} /> New work order
          </button>
        </>
      }
    >
      <DefList
        items={[
          ['Type', e.type ?? '—'],
          ['Make / model', e.make ?? '—'],
          ['Installed', e.installed ? fmtDate(e.installed) : '—'],
          ['Cost centre', e.costCentre ?? '—'],
          ['Criticality', e.criticality.toLowerCase()],
          ['Production line', e.productionLine ?? '—']
        ]}
      />
      <div className="sx-stats">
        <Stat label="Breakdowns" value={h.breakdowns} icon={<AlertTriangle size={17} />} tone="red" />
        <Stat label="MTBF" value={h.mtbfDays !== null ? `${h.mtbfDays} d` : '—'} icon={<Activity size={17} />} />
        <Stat label="MTTR" value={h.mttrHours !== null ? `${h.mttrHours} h` : '—'} icon={<Gauge size={17} />} tone="gold" />
        <Stat label="Lifetime cost" value={kes(h.cost, { compact: true })} icon={<Boxes size={17} />} tone="blue" />
      </div>

      <h4 className="sx-subhead">Fixed asset (Finance)</h4>
      {asset ? (
        <DefList
          items={[
            ['Asset', `${asset.number} — ${asset.name}`],
            ['Cost', kes(asset.cost)],
            ['Book value', kes(asset.cost - accumulatedDepreciation(finance.state, asset))],
            ['Maintenance to cost', `${Math.round((h.cost / Math.max(1, asset.cost)) * 100)}%`]
          ]}
        />
      ) : (
        <p className="sx-muted">Not linked to the fixed asset register.</p>
      )}
      <div className="sx-inline-form">
        <select className="form-control" value={assetId} onChange={(x) => setAssetId(x.target.value)} aria-label="Fixed asset">
          <option value="">Choose a fixed asset…</option>
          {finance.state.assets
            .filter((a) => a.status === 'ACTIVE')
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.number} — {a.name}
              </option>
            ))}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => mx.linkAsset(e.id, assetId)}>
          Link
        </button>
      </div>

      <h4 className="sx-subhead">Bill of materials</h4>
      {bom ? (
        <>
          {bom.map((l, i) => (
            <div key={i} className="sx-inline-form sx-wrap">
              <select className="form-control" value={l.stocked ? 'S' : 'N'} onChange={(x) => setBom(bom.map((y, j) => (j === i ? { ...y, stocked: x.target.value === 'S' } : y)))} aria-label="Stocked" style={{ width: 120 }}>
                <option value="S">Stocked</option>
                <option value="N">Non-stock</option>
              </select>
              {l.stocked ? (
                <select className="form-control" value={l.sku ?? ''} onChange={(x) => setBom(bom.map((y, j) => (j === i ? { ...y, sku: x.target.value } : y)))} aria-label="Stock item">
                  <option value="">Choose…</option>
                  {spares.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input className="form-control" value={l.description} onChange={(x) => setBom(bom.map((y, j) => (j === i ? { ...y, description: x.target.value } : y)))} placeholder="Description" aria-label="Description" />
                  <input className="form-control" type="number" min="0" value={l.unitCost ?? ''} onChange={(x) => setBom(bom.map((y, j) => (j === i ? { ...y, unitCost: Number(x.target.value) } : y)))} placeholder="Unit cost" style={{ width: 110 }} aria-label="Unit cost" />
                </>
              )}
              <input className="form-control" type="number" min="1" value={l.qty} onChange={(x) => setBom(bom.map((y, j) => (j === i ? { ...y, qty: Number(x.target.value) } : y)))} style={{ width: 70 }} aria-label="Quantity" />
              <button type="button" className="sx-icon-btn" onClick={() => setBom(bom.filter((_, j) => j !== i))} aria-label="Remove line">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="sx-inline-form">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBom([...bom, { stocked: true, description: '', qty: 1 }])}>
              <Plus size={14} /> Add line
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => mx.saveBom(e.id, bom).ok && setBom(null)}>
              Save BOM
            </button>
          </div>
        </>
      ) : (
        <>
          {e.bom?.length ? (
            <table className="sx-mini-table">
              <tbody>
                {e.bom.map((l, i) => (
                  <tr key={i}>
                    <td>
                      {l.qty} × {l.stocked && l.sku ? pname(l.sku) : l.description}
                    </td>
                    <td>{l.stocked ? 'Stocked' : `Non-stock${l.unitCost ? ` · ${kes(l.unitCost)}` : ''}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sx-muted">No bill of materials yet.</p>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBom((e.bom ?? []).map((l) => ({ ...l })))}>
            Edit BOM
          </button>
        </>
      )}

      <h4 className="sx-subhead">Warranty</h4>
      {e.warranty && (
        <p className={e.warranty.until < TODAY ? 'sx-muted' : ''}>
          Until {fmtDate(e.warranty.until)} {e.warranty.until < TODAY ? '(expired)' : `(${daysBetween(TODAY, e.warranty.until)} days left)`} — {e.warranty.terms}
        </p>
      )}
      <div className="sx-grid">
        <Field label="Supplier" span={2}>
          <PartySelect kind="SUPPLIER" value={war.supplierId} onChange={(v) => setWar({ ...war, supplierId: v })} />
        </Field>
        <Field label="Until">
          <input className="form-control" type="date" value={war.until} onChange={(x) => setWar({ ...war, until: x.target.value })} />
        </Field>
        <Field label="Terms">
          <input className="form-control" value={war.terms} onChange={(x) => setWar({ ...war, terms: x.target.value })} />
        </Field>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => mx.setWarranty(e.id, war)}>
        Save warranty
      </button>

      {e.meter && (
        <>
          <h4 className="sx-subhead">
            Meter · {e.meter.reading.toLocaleString()} {e.meter.unit.toLowerCase()}
            {e.meter.readOn ? ` on ${fmtDate(e.meter.readOn)}` : ''}
          </h4>
          <div className="sx-inline-form">
            <input className="form-control" type="number" value={meter} onChange={(x) => setMeter(x.target.value)} placeholder="New reading" aria-label="Meter reading" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => mx.recordMeter(e.id, Number(meter)).ok && setMeter('')}>
              Record
            </button>
          </div>
          {readings.length > 0 && (
            <p className="sx-muted">
              Recent: {readings.slice(0, 5).map((r) => `${fmtDate(r.date)} ${r.value.toLocaleString()}`).join(' · ')}
            </p>
          )}
        </>
      )}

      <h4 className="sx-subhead">Condition monitoring</h4>
      {series.length === 0 && <p className="sx-muted">No condition readings.</p>}
      {series.map((c) => (
        <div key={c.parameter} className={`sx-callout ${c.trend.state === 'ALARM' ? 'danger' : c.trend.state === 'WARN' || (c.trend.daysToAlarm !== null && c.trend.daysToAlarm <= 30) ? 'warn' : 'info'}`}>
          <Activity size={16} />
          <div>
            <b>
              {c.parameter}: {c.trend.last?.value} {c.unit}
            </b>
            <span>
              Trend {c.trend.slope > 0 ? '+' : ''}
              {c.trend.slope} {c.unit}/day · warn {c.trend.last?.limitWarn}, alarm {c.trend.last?.limitAlarm}
              {c.trend.daysToAlarm !== null ? ` · alarm limit in about ${c.trend.daysToAlarm} days` : ''}
            </span>
          </div>
        </div>
      ))}
      <div className="sx-inline-form sx-wrap">
        <input className="form-control" value={cond.parameter} onChange={(x) => setCond({ ...cond, parameter: x.target.value })} aria-label="Parameter" />
        <input className="form-control" value={cond.unit} onChange={(x) => setCond({ ...cond, unit: x.target.value })} style={{ width: 80 }} aria-label="Unit" />
        <input className="form-control" type="number" value={cond.value} onChange={(x) => setCond({ ...cond, value: x.target.value })} placeholder="Value" style={{ width: 90 }} aria-label="Value" />
        <input className="form-control" type="number" value={cond.warn} onChange={(x) => setCond({ ...cond, warn: x.target.value })} title="Warning limit" style={{ width: 80 }} aria-label="Warning limit" />
        <input className="form-control" type="number" value={cond.alarm} onChange={(x) => setCond({ ...cond, alarm: x.target.value })} title="Alarm limit" style={{ width: 80 }} aria-label="Alarm limit" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => mx.recordCondition(e.id, cond.parameter, cond.unit, Number(cond.value), Number(cond.warn), Number(cond.alarm)).ok && setCond({ ...cond, value: '' })}>
          Record
        </button>
      </div>

      <h4 className="sx-subhead">Maintenance history ({h.wos.length})</h4>
      {h.wos.length ? (
        <table className="sx-mini-table">
          <tbody>
            {h.wos.map((w) => (
              <tr key={w.id}>
                <td>
                  <button type="button" className="sx-link" onClick={() => setMaintenance('workorders', w.id)}>
                    {w.number}
                  </button>
                </td>
                <td>{fmtDate(w.date)}</td>
                <td>{w.title}</td>
                <td>{WO_LABEL[w.status]}</td>
                <td style={{ textAlign: 'right' }}>{w.downtimeHours} h</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="sx-muted">No work orders yet.</p>
      )}
      <Attachments owner={`equipment:${e.id}`} by={actor.name} readOnly={!mx.canWrite} title="Manuals, drawings and certificates" />
    </Drawer>
  );
};

/* ------------------------------------------------------------------ */
/* Calibration                                                         */
/* ------------------------------------------------------------------ */

export const CalibrationPage: React.FC = () => {
  const { state, setMaintenance } = useOperations();
  const mx = useMaintenanceExt();
  const [edit, setEdit] = useState<{ id: string; intervalDays: number; tolerance: string; standard: string } | null>(null);
  const instruments = state.equipment.filter((e) => e.calibration?.required);
  return (
    <SuitePage eyebrow="Maintenance" title="Calibration" subtitle="Weighbridges, scales, moisture meters and other instruments: when they are due, the result of each calibration and the certificate. A failed calibration takes the instrument out of service.">
      <div className="sx-stats">
        <Stat label="Instruments" value={instruments.length} icon={<Ruler size={17} />} />
        <Stat label="Overdue" value={instruments.filter((e) => (calibrationDue(e) ?? '9') < TODAY).length} icon={<AlertTriangle size={17} />} tone="red" />
        <Stat label="Records" value={mx.state.calibrations.length} icon={<Ruler size={17} />} tone="blue" />
      </div>
      {instruments.length === 0 ? (
        <Empty title="No instruments need calibration" />
      ) : (
        <div className="sx-table-wrap">
          <div className="sx-table-scroll">
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th className="sx-hide-sm">Tolerance</th>
                  <th className="sx-hide-sm">Every</th>
                  <th>Last</th>
                  <th>Next due</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {instruments.map((e) => {
                  const due = calibrationDue(e)!;
                  const open = state.workOrders.find((w) => w.equipmentId === e.id && w.kind === 'CALIBRATION' && !['COMPLETED', 'CANCELLED'].includes(w.status));
                  return (
                    <tr key={e.id}>
                      <td>
                        <div className="sx-cell-main">
                          <span>{e.name}</span>
                          <small>{e.calibration!.standard}</small>
                        </div>
                      </td>
                      <td className="sx-hide-sm">{e.calibration!.tolerance}</td>
                      <td className="sx-hide-sm">{e.calibration!.intervalDays} d</td>
                      <td>{e.calibration!.lastCalibrated ? fmtDate(e.calibration!.lastCalibrated) : '—'}</td>
                      <td className={due < TODAY ? 'sx-danger-text' : ''}>{fmtDate(due)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {open ? (
                          <button type="button" className="sx-link" onClick={() => setMaintenance('workorders', open.id)}>
                            {open.number}
                          </button>
                        ) : (
                          <button type="button" className="btn btn-secondary btn-xs" onClick={() => mx.raiseCalibration(e.id)}>
                            <Plus size={12} /> Calibrate
                          </button>
                        )}{' '}
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEdit({ id: e.id, intervalDays: e.calibration!.intervalDays, tolerance: e.calibration!.tolerance, standard: e.calibration!.standard })}>
                          Settings
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <h4 className="sx-subhead">Calibration records</h4>
      <DataTable
        rows={mx.state.calibrations}
        rowKey={(c) => c.id}
        initialSort={{ key: 'd', dir: 'desc' }}
        columns={[
          { key: 'd', header: 'Date', render: (c) => fmtDate(c.date), sort: (c) => c.date },
          { key: 'e', header: 'Instrument', render: (c) => state.equipment.find((e) => e.id === c.equipmentId)?.name ?? c.equipmentId },
          { key: 'cert', header: 'Certificate', render: (c) => <span className="sx-mono">{c.certNo}</span> },
          { key: 'f', header: 'As found → as left', render: (c) => `${c.asFound} → ${c.asLeft}`, hideOnMobile: true },
          { key: 'r', header: 'Result', render: (c) => <Pill status={c.pass ? 'POSTED' : 'REJECTED'} label={c.pass ? 'Pass' : 'Fail'} /> },
          { key: 'b', header: 'By', render: (c) => c.by, hideOnMobile: true }
        ]}
      />
      {edit && (
        <Modal
          size="md"
          title="Calibration settings"
          onClose={() => setEdit(null)}
          footer={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const eq = state.equipment.find((x) => x.id === edit.id)!;
                if (mx.setCalibration(edit.id, { ...eq.calibration!, intervalDays: edit.intervalDays, tolerance: edit.tolerance, standard: edit.standard }).ok) setEdit(null);
              }}
            >
              Save
            </button>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="Interval (days)">
              <input className="form-control" type="number" min="1" value={edit.intervalDays} onChange={(x) => setEdit({ ...edit, intervalDays: Number(x.target.value) })} />
            </Field>
            <Field label="Tolerance">
              <input className="form-control" value={edit.tolerance} onChange={(x) => setEdit({ ...edit, tolerance: x.target.value })} />
            </Field>
            <Field label="Reference standard" span={2}>
              <input className="form-control" value={edit.standard} onChange={(x) => setEdit({ ...edit, standard: x.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Repairable spares                                                   */
/* ------------------------------------------------------------------ */

const R_PILL: Record<Rotable['status'], [string, string]> = { IN_STOCK: ['POSTED', 'In stock'], INSTALLED: ['OPEN', 'Installed'], AT_REPAIR: ['SUBMITTED', 'At repair'], CORE_DUE: ['OVERDUE', 'Core due back'], SCRAPPED: ['VOID', 'Scrapped'] };

export const RefurbishPage: React.FC = () => {
  const { state, setMaintenance } = useOperations();
  const mx = useMaintenanceExt();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ serial: '', description: '', value: '' });
  const sel = mx.state.rotables.find((r) => r.id === openId);
  const [eqId, setEqId] = useState('');
  const [external, setExternal] = useState(false);
  const [coreValue, setCoreValue] = useState('');
  const [scrap, setScrap] = useState('');
  return (
    <SuitePage
      eyebrow="Maintenance"
      title="Repairable spares"
      subtitle="Motors, gearboxes and other units tracked by serial number: exchange on the job, return the old unit (core), rebuild it in the workshop or with a repairer and put it back in stock at its rebuilt value."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> Register unit
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Units" value={mx.state.rotables.filter((r) => r.status !== 'SCRAPPED').length} icon={<Recycle size={17} />} />
        <Stat label="In stock" value={mx.state.rotables.filter((r) => r.status === 'IN_STOCK').length} icon={<Recycle size={17} />} tone="green" />
        <Stat label="Being rebuilt" value={mx.state.rotables.filter((r) => r.status === 'AT_REPAIR').length} icon={<Wrench size={17} />} tone="gold" />
        <Stat label="Cores due back" value={mx.state.rotables.filter((r) => r.status === 'CORE_DUE').length} icon={<AlertTriangle size={17} />} tone="red" />
      </div>
      <DataTable
        rows={mx.state.rotables}
        rowKey={(r) => r.id}
        onRowClick={(r) => setOpenId(r.id)}
        selected={openId}
        columns={[
          { key: 's', header: 'Serial', render: (r) => <b className="sx-mono">{r.serial}</b>, sort: (r) => r.serial },
          { key: 'd', header: 'Unit', render: (r) => r.description, sort: (r) => r.description },
          { key: 'l', header: 'Where', render: (r) => r.location, hideOnMobile: true },
          { key: 'v', header: 'Value', render: (r) => kes(r.value), align: 'right', sort: (r) => r.value },
          { key: 'st', header: 'Status', render: (r) => <Pill status={R_PILL[r.status][0]} label={R_PILL[r.status][1]} />, sort: (r) => r.status }
        ]}
      />
      {sel && (
        <Drawer title={`${sel.description}`} subtitle={`S/N ${sel.serial} · ${sel.location}`} badge={<Pill status={R_PILL[sel.status][0]} label={R_PILL[sel.status][1]} />} onClose={() => setOpenId(null)}>
          <DefList items={[['Carrying value', kes(sel.value)], ['Core due', sel.coreDue ? `${sel.coreDue.serialOut} from ${sel.coreDue.woNumber} since ${fmtDate(sel.coreDue.since)}` : '—']]} />
          {sel.status === 'CORE_DUE' && (
            <>
              <h4 className="sx-subhead">Receive the core</h4>
              <div className="sx-inline-form">
                <input className="form-control" type="number" min="0" value={coreValue} onChange={(x) => setCoreValue(x.target.value)} placeholder="Core value (KES)" aria-label="Core value" />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => mx.receiveCore(sel.id, Number(coreValue)).ok && setCoreValue('')}>
                  Receive core
                </button>
              </div>
            </>
          )}
          {(sel.status === 'AT_REPAIR' || sel.status === 'IN_STOCK') && (
            <>
              <h4 className="sx-subhead">Send for refurbishment</h4>
              <div className="sx-inline-form sx-wrap">
                <select className="form-control" value={eqId} onChange={(x) => setEqId(x.target.value)} aria-label="Machine served">
                  <option value="">Machine it serves…</option>
                  {state.equipment.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
                <select className="form-control" value={external ? 'E' : 'I'} onChange={(x) => setExternal(x.target.value === 'E')} aria-label="Where">
                  <option value="I">Workshop</option>
                  <option value="E">External repairer</option>
                </select>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { const r = mx.sendForRefurb(sel.id, eqId, external); if (r.ok && r.id) setMaintenance('workorders', r.id); }}>
                  Raise refurbishment order
                </button>
              </div>
            </>
          )}
          {sel.status !== 'SCRAPPED' && sel.status !== 'INSTALLED' && sel.status !== 'CORE_DUE' && (
            <div className="sx-inline-form">
              <input className="form-control" value={scrap} onChange={(x) => setScrap(x.target.value)} placeholder="Reason to scrap" aria-label="Scrap reason" />
              <button type="button" className="btn btn-danger btn-sm" onClick={() => mx.scrapRotable(sel.id, scrap).ok && setScrap('')}>
                Scrap
              </button>
            </div>
          )}
          <h4 className="sx-subhead">History</h4>
          <table className="sx-mini-table">
            <tbody>
              {sel.history.map((x, i) => (
                <tr key={i}>
                  <td>{fmtDate(x.date)}</td>
                  <td>{x.event}</td>
                  <td>{x.by}</td>
                  <td style={{ textAlign: 'right' }}>{x.value !== undefined ? kes(x.value) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Drawer>
      )}
      {adding && (
        <Modal
          size="md"
          title="Register a repairable unit"
          onClose={() => setAdding(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => mx.addRotable(f.serial, f.description, Number(f.value)).ok && setAdding(false)}>
              Register
            </button>
          }
        >
          <div className="sx-grid sx-grid-2">
            <Field label="Serial number" required>
              <input className="form-control" value={f.serial} onChange={(x) => setF({ ...f, serial: x.target.value })} />
            </Field>
            <Field label="Value (KES)" required>
              <input className="form-control" type="number" value={f.value} onChange={(x) => setF({ ...f, value: x.target.value })} />
            </Field>
            <Field label="Description" required span={2}>
              <input className="form-control" value={f.description} onChange={(x) => setF({ ...f, description: x.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};
