import React, { useState } from 'react';
import { Plus, Trash2, Wand2, Truck, PackageCheck, Layers, Receipt, Ban } from 'lucide-react';
import { ExportCsvButton, ImportCsvButton, PrintButton, esc } from '../../../platform/Widgets';
import { useOperations } from '../store';
import { addDays, fmtDate, kes, TODAY } from '../../finance/engine';
import { DataTable, DefList, Drawer, Field, Modal, Pill, Stat, SuitePage, Timeline } from '../../ui/kit';
import { useFocus } from '../parts';
import { useFleetExt } from './store';
import { allocationProblem, legCost, planKg, planPackages, routeKm, suggestAllocation } from './engine';
import type { ConsolidationPlan, LoadingInstruction, PlanStatus, TeaLot } from './types';

const P_PILL: Record<PlanStatus, string> = { DRAFT: 'DRAFT', ALLOCATED: 'APPROVED', LOADING: 'SUBMITTED', DISPATCHED: 'OPEN', CLOSED: 'POSTED', CANCELLED: 'VOID' };
const LOT_COLS = ['lotNo', 'garden', 'grade', 'saleNo', 'packages', 'kg', 'pickupSite'];

export const ConsolidationPage: React.FC = () => {
  const { fleet } = useOperations();
  const fx = useFleetExt();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useFocus(fleet.focus, (id) => fx.state.plans.some((p) => p.id === id), setOpenId, () => setAdding(true));
  const route = (id: string) => fx.state.routes.find((r) => r.id === id);
  const sel = fx.state.plans.find((p) => p.id === openId);
  const open = fx.state.plans.filter((p) => !['CLOSED', 'CANCELLED'].includes(p.status));
  return (
    <SuitePage
      eyebrow="Transport"
      title="Consolidation plans"
      subtitle="Tea lots to collect from factories and warehouses on a route, by date and priority. Vehicles are allocated (own trucks first, then hired), each gets a loading instruction, and the run is closed against its budget."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> New plan
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Open plans" value={open.length} icon={<Layers size={17} />} />
        <Stat label="Tea to move" value={`${open.reduce((x, p) => x + planKg(p), 0).toLocaleString()} kg`} detail={`${open.reduce((x, p) => x + planPackages(p), 0)} packages`} icon={<PackageCheck size={17} />} tone="blue" />
        <Stat label="Budget, open plans" value={kes(open.reduce((x, p) => x + p.budgetCost, 0), { compact: true })} icon={<Receipt size={17} />} tone="gold" />
      </div>
      <DataTable
        rows={fx.state.plans}
        rowKey={(p) => p.id}
        onRowClick={(p) => setOpenId(p.id)}
        selected={openId}
        initialSort={{ key: 'd', dir: 'desc' }}
        columns={[
          { key: 'n', header: 'Plan', render: (p) => <b className="sx-mono">{p.number}</b>, sort: (p) => p.number },
          { key: 'r', header: 'Route', render: (p) => <div className="sx-cell-main"><span>{route(p.routeId)?.name}</span><small>{p.lots.length} lots · {planKg(p).toLocaleString()} kg{p.priority === 'HIGH' ? ' · high priority' : ''}</small></div> },
          { key: 'd', header: 'Date', render: (p) => fmtDate(p.plannedDate), sort: (p) => p.plannedDate },
          { key: 'v', header: 'Vehicles', render: (p) => p.allocations.map((a) => fx.reg(a.vehicleId)).join(', ') || '—', hideOnMobile: true },
          { key: 'b', header: 'Budget / actual', render: (p) => `${kes(p.budgetCost, { compact: true })}${p.actualCost !== undefined ? ` / ${kes(p.actualCost, { compact: true })}` : ''}`, align: 'right', hideOnMobile: true },
          { key: 's', header: 'Status', render: (p) => <Pill status={P_PILL[p.status]} label={p.status.toLowerCase()} />, sort: (p) => p.status }
        ]}
      />
      {sel && <PlanDrawer p={sel} onClose={() => setOpenId(null)} />}
      {adding && <NewPlanModal onClose={() => setAdding(false)} onSaved={(id) => (setAdding(false), setOpenId(id))} />}
    </SuitePage>
  );
};

const PlanDrawer: React.FC<{ p: ConsolidationPlan; onClose: () => void }> = ({ p, onClose }) => {
  const { state, setFleet } = useOperations();
  const fx = useFleetExt();
  const route = fx.state.routes.find((r) => r.id === p.routeId);
  const [pick, setPick] = useState<string[]>([]);
  const [drivers, setDrivers] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const suggestion = suggestAllocation(p, state.vehicles);
  const trucks = state.vehicles.filter((v) => v.type === 'Truck');
  const canAllocate = p.status === 'DRAFT' || p.status === 'ALLOCATED';
  return (
    <Drawer wide title={p.number} subtitle={`${route?.name} · ${fmtDate(p.plannedDate)}`} badge={<Pill status={P_PILL[p.status]} label={p.status.toLowerCase()} />} onClose={onClose}>
      <DefList
        items={[
          ['Weight', `${planKg(p).toLocaleString()} kg in ${planPackages(p)} packages`],
          ['Route', `${route?.stops.map((s) => s.site).join(' → ')} (${routeKm(route)} km)`],
          ['Budget', kes(p.budgetCost)],
          ['Actual', p.actualCost !== undefined ? kes(p.actualCost) : '—'],
          ['Priority', p.priority.toLowerCase()],
          ['Created by', p.createdBy]
        ]}
      />
      {p.notes && <p className="sx-note">{p.notes}</p>}
      <h4 className="sx-subhead">Tea lots</h4>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Lot</th>
            <th>Garden / grade</th>
            <th>Pick up</th>
            <th style={{ textAlign: 'right' }}>Pkgs</th>
            <th style={{ textAlign: 'right' }}>kg</th>
            <th>Vehicle</th>
          </tr>
        </thead>
        <tbody>
          {p.lots.map((l) => (
            <tr key={l.lotNo}>
              <td className="sx-mono">{l.lotNo}</td>
              <td>
                {l.garden} · {l.grade}
              </td>
              <td>{l.pickupSite}</td>
              <td style={{ textAlign: 'right' }}>{l.packages}</td>
              <td style={{ textAlign: 'right' }}>{l.kg.toLocaleString()}</td>
              <td>{fx.reg(p.allocations.find((a) => a.lots.includes(l.lotNo))?.vehicleId ?? '') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canAllocate && (
        <>
          <h4 className="sx-subhead">Allocate vehicles</h4>
          <p className="sx-muted">
            Suggested: {suggestion.vehicles.map((v) => `${v.reg} (${v.capacityKg.toLocaleString()} kg${v.ownership === 'HIRED' ? ', hired' : ''})`).join(', ') || 'none'}
            {suggestion.uncovered ? ` — ${suggestion.uncovered.toLocaleString()} kg not covered` : ''}
          </p>
          <ul className="sx-facts">
            {trucks.map((v) => {
              const why = allocationProblem(v, p.plannedDate);
              return (
                <li key={v.id}>
                  <label className="sx-check">
                    <input type="checkbox" disabled={!!why} checked={pick.includes(v.id)} onChange={(e) => setPick(e.target.checked ? [...pick, v.id] : pick.filter((x) => x !== v.id))} aria-label={`Allocate ${v.reg}`} /> {v.reg} · {v.capacityKg.toLocaleString()} kg{v.ownership === 'HIRED' ? ' · hired' : ''}
                  </label>
                  <small className={why ? 'sx-danger-text' : 'sx-muted'}>{why ?? `${kes(legCost(v, route, fx.state.carriers))} for the run`}</small>
                </li>
              );
            })}
          </ul>
          <div className="sx-inline-form">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fx.autoAllocate(p.id)}>
              <Wand2 size={14} /> Allocate suggested
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => fx.allocate(p.id, pick)}>
              <Truck size={14} /> Allocate selected
            </button>
          </div>
        </>
      )}
      {p.allocations.length > 0 && (
        <>
          <h4 className="sx-subhead">Vehicles on this run</h4>
          <table className="sx-mini-table">
            <tbody>
              {p.allocations.map((a) => {
                const li = fx.state.instructions.find((x) => x.id === a.instructionId);
                const v = state.vehicles.find((x) => x.id === a.vehicleId);
                return (
                  <tr key={a.vehicleId}>
                    <td>
                      {fx.reg(a.vehicleId)}
                      {a.hired ? ' (hired)' : ''}
                    </td>
                    <td>
                      {a.kg.toLocaleString()} kg · {a.lots.length} lots
                    </td>
                    <td>{a.carrierBill ? `Bill ${a.carrierBill}` : a.carrierCost ? kes(a.carrierCost) : ''}</td>
                    <td style={{ textAlign: 'right' }}>
                      {li ? (
                        <button type="button" className="sx-link" onClick={() => setFleet('loading', li.id)}>
                          {li.number} · {li.status.toLowerCase()}
                        </button>
                      ) : p.status !== 'CANCELLED' ? (
                        <span className="sx-inline-form">
                          <input className="form-control" value={drivers[a.vehicleId] ?? v?.driver ?? ''} onChange={(e) => setDrivers({ ...drivers, [a.vehicleId]: e.target.value })} aria-label={`Driver for ${fx.reg(a.vehicleId)}`} style={{ width: 140 }} />
                          <button type="button" className="btn btn-secondary btn-xs" onClick={() => fx.issueInstruction(p.id, a.vehicleId, drivers[a.vehicleId] ?? v?.driver ?? '')}>
                            Issue loading instruction
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      <div className="sx-inline-form sx-wrap">
        {p.status === 'DISPATCHED' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => fx.closePlan(p.id)}>
            Close plan
          </button>
        )}
        {canAllocate && (
          <>
            <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason to cancel" aria-label="Cancel reason" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fx.cancelPlan(p.id, reason)}>
              <Ban size={14} /> Cancel plan
            </button>
          </>
        )}
      </div>
      <h4 className="sx-subhead">History</h4>
      <Timeline items={p.history} />
    </Drawer>
  );
};

const blankLot = (site = ''): TeaLot => ({ lotNo: '', garden: '', grade: 'BP1', saleNo: '', packages: 20, kg: 1200, pickupSite: site });

const NewPlanModal: React.FC<{ onClose: () => void; onSaved: (id: string) => void }> = ({ onClose, onSaved }) => {
  const fx = useFleetExt();
  const [f, setF] = useState({ plannedDate: addDays(TODAY, 1), routeId: fx.state.routes[0]?.id ?? '', priority: 'NORMAL' as ConsolidationPlan['priority'], notes: '' });
  const route = fx.state.routes.find((r) => r.id === f.routeId);
  const sites = route?.stops.filter((s) => s.type !== 'PORT').map((s) => s.site) ?? [];
  const [lots, setLots] = useState<TeaLot[]>([blankLot(sites[0])]);
  const kg = lots.reduce((x, l) => x + (Number(l.kg) || 0), 0);
  return (
    <Modal
      size="xl"
      title="New consolidation plan"
      subtitle={`${lots.length} lots · ${kg.toLocaleString()} kg`}
      onClose={onClose}
      footer={
        <>
          <ImportCsvButton
            label="Import lots (CSV)"
            template={LOT_COLS}
            onImport={(rows) => {
              const errors: string[] = [];
              const ok: TeaLot[] = [];
              rows.forEach((r, i) => {
                const l: TeaLot = { lotNo: r.lotNo?.trim(), garden: r.garden?.trim(), grade: r.grade?.trim(), saleNo: r.saleNo?.trim() || undefined, packages: Number(r.packages), kg: Number(r.kg), pickupSite: r.pickupSite?.trim() };
                if (!l.lotNo) errors.push(`Row ${i + 2}: lot number missing`);
                else if (!(l.kg > 0) || !(l.packages > 0)) errors.push(`Row ${i + 2}: packages and kg must be numbers above zero`);
                else if (!sites.includes(l.pickupSite)) errors.push(`Row ${i + 2}: ${l.pickupSite || 'pickup site'} is not on ${route?.name}`);
                else ok.push(l);
              });
              if (ok.length) setLots([...lots.filter((l) => l.lotNo.trim()), ...ok]);
              return { imported: ok.length, errors };
            }}
          />
          <span className="sx-grow" />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const r = fx.createPlan({ ...f, lots: lots.map((l) => ({ ...l, packages: Number(l.packages), kg: Number(l.kg) })) });
              if (r.ok && r.id) onSaved(r.id);
            }}
          >
            Create plan
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Route" required span={2}>
          <select className="form-control" value={f.routeId} onChange={(e) => setF({ ...f, routeId: e.target.value })}>
            {fx.state.routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" required>
          <input className="form-control" type="date" value={f.plannedDate} onChange={(e) => setF({ ...f, plannedDate: e.target.value })} />
        </Field>
        <Field label="Priority">
          <select className="form-control" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as ConsolidationPlan['priority'] })}>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High — vessel cut-off</option>
          </select>
        </Field>
        <Field label="Notes" span={4}>
          <input className="form-control" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
      <h4 className="sx-subhead">Tea lots</h4>
      {lots.map((l, i) => {
        const set = (patch: Partial<TeaLot>) => setLots(lots.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return (
          <div key={i} className="sx-inline-form sx-wrap">
            <input className="form-control" value={l.lotNo} onChange={(e) => set({ lotNo: e.target.value })} placeholder="Lot no." aria-label="Lot number" style={{ width: 110 }} />
            <input className="form-control" value={l.garden} onChange={(e) => set({ garden: e.target.value })} placeholder="Garden mark" aria-label="Garden" />
            <input className="form-control" value={l.grade} onChange={(e) => set({ grade: e.target.value })} placeholder="Grade" aria-label="Grade" style={{ width: 80 }} />
            <input className="form-control" type="number" value={l.packages} onChange={(e) => set({ packages: Number(e.target.value) })} aria-label="Packages" style={{ width: 80 }} />
            <input className="form-control" type="number" value={l.kg} onChange={(e) => set({ kg: Number(e.target.value) })} aria-label="kg" style={{ width: 90 }} />
            <select className="form-control" value={l.pickupSite} onChange={(e) => set({ pickupSite: e.target.value })} aria-label="Pickup site">
              <option value="">Pick up at…</option>
              {sites.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button type="button" className="sx-icon-btn" onClick={() => setLots(lots.filter((_, j) => j !== i))} aria-label="Remove lot">
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLots([...lots, blankLot(sites[0])])}>
        <Plus size={14} /> Add lot
      </button>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Loading instructions                                                */
/* ------------------------------------------------------------------ */

const L_PILL: Record<LoadingInstruction['status'], string> = { ISSUED: 'SUBMITTED', LOADED: 'OPEN', DELIVERED: 'POSTED' };

export const LoadingPage: React.FC = () => {
  const { state, fleet } = useOperations();
  const fx = useFleetExt();
  const [openId, setOpenId] = useState<string | null>(null);
  const [endKm, setEndKm] = useState('');
  const [box, setBox] = useState('');
  useFocus(fleet.focus, (id) => fx.state.instructions.some((x) => x.id === id), setOpenId);
  const sel = fx.state.instructions.find((x) => x.id === openId);
  const html = (li: LoadingInstruction) => {
    const route = fx.state.routes.find((r) => r.id === li.routeId);
    const plan = fx.state.plans.find((p) => p.id === li.planId);
    return `<h1>Loading instruction ${esc(li.number)}</h1><p><b>Plan:</b> ${esc(plan?.number)} · <b>Date:</b> ${esc(plan?.plannedDate)}<br/><b>Vehicle:</b> ${esc(fx.reg(li.vehicleId))} · <b>Driver:</b> ${esc(li.driver)}<br/><b>Route:</b> ${esc(route?.stops.map((s) => s.site).join(' → '))}</p><table border="1" cellpadding="4" cellspacing="0"><tr><th>Lot</th><th>Garden</th><th>Grade</th><th>Sale</th><th>Pkgs</th><th>kg</th><th>From</th><th>To</th></tr>${li.teas.map((t) => `<tr><td>${esc(t.lotNo)}</td><td>${esc(t.garden)}</td><td>${esc(t.grade)}</td><td>${esc(t.saleNo)}</td><td>${t.packages}</td><td>${t.kg}</td><td>${esc(t.pickupSite)}</td><td>${esc(t.to)}</td></tr>`).join('')}</table><p>Total ${li.teas.reduce((x, t) => x + t.kg, 0).toLocaleString()} kg · issued by ${esc(li.issuedBy)} ${esc(li.issuedAt.replace('T', ' ').slice(0, 16))}</p><p style="margin-top:40px">Loaded by: ____________ &nbsp; Driver: ____________ &nbsp; Received: ____________</p>`;
  };
  return (
    <SuitePage
      eyebrow="Transport"
      title="Loading instructions"
      subtitle="One per vehicle: truck, driver, route and the teas to load. Dispatch starts the trip with the weight on board; delivery closes the trip and records the container stuffed."
      actions={
        <ExportCsvButton
          name="loading-instructions"
          header={['Instruction', 'Vehicle', 'Driver', 'Lot', 'Garden', 'Grade', 'Packages', 'kg', 'From', 'To', 'Status']}
          rows={() => fx.state.instructions.flatMap((li) => li.teas.map((t) => [li.number, fx.reg(li.vehicleId), li.driver, t.lotNo, t.garden, t.grade, t.packages, t.kg, t.pickupSite, t.to, li.status]))}
        />
      }
    >
      <DataTable
        rows={fx.state.instructions}
        rowKey={(x) => x.id}
        onRowClick={(x) => setOpenId(x.id)}
        selected={openId}
        initialSort={{ key: 'n', dir: 'desc' }}
        columns={[
          { key: 'n', header: 'Instruction', render: (x) => <b className="sx-mono">{x.number}</b>, sort: (x) => x.number },
          { key: 'v', header: 'Vehicle / driver', render: (x) => <div className="sx-cell-main"><span>{fx.reg(x.vehicleId)}</span><small>{x.driver}</small></div> },
          { key: 't', header: 'Teas', render: (x) => `${x.teas.length} lots · ${x.teas.reduce((a, t) => a + t.kg, 0).toLocaleString()} kg` },
          { key: 's', header: 'Status', render: (x) => <Pill status={L_PILL[x.status]} label={x.status.toLowerCase()} /> }
        ]}
      />
      {sel && (
        <Drawer
          title={sel.number}
          subtitle={`${fx.reg(sel.vehicleId)} · ${sel.driver}`}
          badge={<Pill status={L_PILL[sel.status]} label={sel.status.toLowerCase()} />}
          onClose={() => setOpenId(null)}
          footer={<PrintButton title={sel.number} html={() => html(sel)} />}
        >
          <table className="sx-mini-table">
            <tbody>
              {sel.teas.map((t) => (
                <tr key={t.lotNo}>
                  <td className="sx-mono">{t.lotNo}</td>
                  <td>
                    {t.garden} {t.grade}
                  </td>
                  <td>{t.pickupSite}</td>
                  <td style={{ textAlign: 'right' }}>{t.kg.toLocaleString()} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sel.status === 'ISSUED' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => fx.dispatchInstruction(sel.id)}>
              <Truck size={14} /> Loaded — dispatch
            </button>
          )}
          {sel.status === 'LOADED' && (
            <div className="sx-inline-form sx-wrap">
              <input className="form-control" type="number" value={endKm} onChange={(e) => setEndKm(e.target.value)} placeholder={`Closing km (left at ${state.trips.find((t) => t.vehicleId === sel.vehicleId && t.status === 'ON_ROAD')?.startKm.toLocaleString() ?? '—'})`} aria-label="Closing odometer" />
              <input className="form-control" value={box} onChange={(e) => setBox(e.target.value)} placeholder="Container no. (optional)" aria-label="Container number" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => fx.deliverInstruction(sel.id, Number(endKm), box || undefined).ok && setEndKm('')}>
                Delivered
              </button>
            </div>
          )}
          <DefList
            items={[
              ['Issued', `${sel.issuedBy} · ${sel.issuedAt.replace('T', ' ').slice(0, 16)}`],
              ['Loaded', sel.loadedAt?.replace('T', ' ').slice(0, 16) ?? '—'],
              ['Delivered', sel.deliveredAt?.replace('T', ' ').slice(0, 16) ?? '—'],
              ['Container', sel.containerNo ?? '—']
            ]}
          />
        </Drawer>
      )}
    </SuitePage>
  );
};
