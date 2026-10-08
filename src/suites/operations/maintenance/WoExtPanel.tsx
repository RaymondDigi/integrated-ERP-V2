import React, { useState } from 'react';
import { CheckCircle2, Circle, ShieldAlert, ShoppingCart, ShieldCheck, Repeat, CalendarClock, MessageSquare, BookOpen } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { PERMIT_TYPES } from '../../../data/oshConfig';
import type { PermitTypeId } from '../../../data/oshEngine';
import { Attachments } from '../../../platform/Widgets';
import { useOperations } from '../store';
import { kes, fmtDate, TODAY } from '../../finance/engine';
import type { WorkOrder } from '../types';
import { useMaintenanceExt } from './store';
import { isOpenWo, woAvailability } from './engine';

/** Job card extras on the work-order drawer: checklist, log, planning, spares, permit, warranty and exchange units. */
export const WoExtPanel: React.FC<{ w: WorkOrder }> = ({ w }) => {
  const ops = useOperations();
  const mx = useMaintenanceExt();
  const { workPermits } = useApp();
  const { state, products, pname, toggleStep, addWorkNote, actor } = ops;
  const eq = state.equipment.find((e) => e.id === w.equipmentId);
  const open = isOpenWo(w);
  const [note, setNote] = useState('');
  const [plan, setPlan] = useState({ technicianId: w.technicianId ?? '', date: w.plannedStart ?? TODAY, hours: w.estHours ?? 2, downtime: w.plannedDowntimeHours ?? 0 });
  const [permitNo, setPermitNo] = useState(w.permitNo ?? '');
  const [permitType, setPermitType] = useState<PermitTypeId>('HOT_WORK');
  const [claimNote, setClaimNote] = useState('');
  const [rot, setRot] = useState({ id: '', serialOut: '' });
  const avail = woAvailability(state, products, w);
  const short = avail.filter((a) => a.short > 0);
  const underWarranty = !!eq?.warranty && eq.warranty.until >= w.date;
  const stockRotables = mx.state.rotables.filter((r) => r.status === 'IN_STOCK');
  return (
    <div className="sx-woext">
      {!!w.checklist?.length && (
        <>
          <h4 className="sx-subhead">
            Job card · {w.checklist.filter((c) => c.done).length}/{w.checklist.length} steps
          </h4>
          <ul className="sx-checklist">
            {w.checklist.map((c, i) => (
              <li key={i} className={c.done ? 'done' : ''}>
                <button type="button" className="sx-check-icon" onClick={() => toggleStep(w.id, i)} aria-label={`Tick ${c.text}`} disabled={w.status !== 'IN_PROGRESS'}>
                  {c.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </button>
                <div>
                  <b>
                    {c.safety && <ShieldAlert size={12} className="sx-danger-text" />} {c.text}
                  </b>
                  {c.done && c.by && <small>{c.by}</small>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {open && (
        <>
          <h4 className="sx-subhead">
            <CalendarClock size={13} /> Planning
          </h4>
          <div className="sx-inline-form sx-wrap">
            <select className="form-control" value={plan.technicianId} onChange={(e) => setPlan({ ...plan, technicianId: e.target.value })} aria-label="Technician">
              <option value="">Technician…</option>
              {mx.state.technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.trade}
                </option>
              ))}
            </select>
            <input className="form-control" type="date" value={plan.date} onChange={(e) => setPlan({ ...plan, date: e.target.value })} aria-label="Planned date" />
            <input className="form-control" type="number" min="0" step="0.5" value={plan.hours} onChange={(e) => setPlan({ ...plan, hours: Number(e.target.value) })} aria-label="Estimated hours" title="Estimated hours" style={{ width: 80 }} />
            <input className="form-control" type="number" min="0" value={plan.downtime} onChange={(e) => setPlan({ ...plan, downtime: Number(e.target.value) })} aria-label="Planned downtime hours" title="Planned machine downtime (h)" style={{ width: 80 }} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => mx.scheduleJob(w.id, plan.technicianId, plan.date, plan.hours, plan.downtime)}>
              Schedule
            </button>
          </div>
          {w.plannedStart && (
            <p className="sx-muted">
              Planned {fmtDate(w.plannedStart)} · {w.estHours ?? 0} h · {w.assignedTo}
              {w.plannedDowntimeHours ? ` · ${w.plannedDowntimeHours} h stop${eq?.productionLine ? ` on ${eq.productionLine}` : ''}` : ''}
            </p>
          )}
        </>
      )}

      {(avail.length > 0 || open) && (
        <>
          <h4 className="sx-subhead">
            <ShoppingCart size={13} /> Planned spares
          </h4>
          {avail.length ? (
            <table className="sx-mini-table">
              <thead>
                <tr>
                  <th>Spare</th>
                  <th style={{ textAlign: 'right' }}>Need</th>
                  <th style={{ textAlign: 'right' }}>Free in store</th>
                  <th style={{ textAlign: 'right' }}>Short</th>
                </tr>
              </thead>
              <tbody>
                {avail.map((a) => (
                  <tr key={a.sku}>
                    <td>{pname(a.sku)}</td>
                    <td style={{ textAlign: 'right' }}>{a.need}</td>
                    <td style={{ textAlign: 'right' }}>{a.free}</td>
                    <td style={{ textAlign: 'right' }} className={a.short ? 'sx-danger-text' : ''}>
                      {a.short || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sx-muted">No spares planned for this job.</p>
          )}
          {open && short.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => mx.requestParts(w.id, short.map((a) => ({ sku: a.sku, description: pname(a.sku), qty: a.short, estPrice: products.find((p) => p.sku === a.sku)?.cost ?? 0 })))}>
              <ShoppingCart size={14} /> Raise purchase requisition for {short.length} short item{short.length === 1 ? '' : 's'}
            </button>
          )}
          {!!w.requisitions?.length && <p className="sx-muted">Requisitions: {w.requisitions.join(', ')}</p>}
        </>
      )}

      {(w.permitRequired || open) && (
        <>
          <h4 className="sx-subhead">
            <ShieldCheck size={13} /> Permit to work {w.permitRequired ? '(required)' : '(optional)'}
          </h4>
          {w.permitNo && (
            <p className="sx-muted">
              Linked: <b>{w.permitNo}</b> — {workPermits.find((p) => p.number === w.permitNo)?.status.toLowerCase() ?? 'not found'}
            </p>
          )}
          {open && (
            <div className="sx-inline-form sx-wrap">
              <select className="form-control" value={permitNo} onChange={(e) => setPermitNo(e.target.value)} aria-label="OSH permit">
                <option value="">Link an OSH permit…</option>
                {workPermits
                  .filter((p) => p.status !== 'CLOSED' && p.status !== 'REJECTED')
                  .map((p) => (
                    <option key={p.id} value={p.number}>
                      {p.number} — {PERMIT_TYPES[p.type]?.label} · {p.status.toLowerCase()}
                    </option>
                  ))}
              </select>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => mx.linkPermit(w.id, permitNo)}>
                Link permit
              </button>
              <select className="form-control" value={permitType} onChange={(e) => setPermitType(e.target.value as PermitTypeId)} aria-label="Permit type">
                {(Object.keys(PERMIT_TYPES) as PermitTypeId[]).map((k) => (
                  <option key={k} value={k}>
                    {PERMIT_TYPES[k].label}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => mx.askPermit(w.id, permitType)}>
                Request in OSH
              </button>
            </div>
          )}
        </>
      )}

      {(underWarranty || w.warrantyClaim) && (
        <div className={`sx-callout ${w.warrantyClaim ? 'success' : 'info'}`}>
          <ShieldCheck size={16} />
          <div>
            <b>{w.warrantyClaim ? `Warranty claim ${w.warrantyClaim}` : `Under warranty until ${fmtDate(eq!.warranty!.until)}`}</b>
            <span>{eq?.warranty?.terms}</span>
            {!w.warrantyClaim && w.status !== 'CANCELLED' && (
              <div className="sx-inline-form">
                <input className="form-control" value={claimNote} onChange={(e) => setClaimNote(e.target.value)} placeholder="Fault description for the supplier" />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => mx.raiseWarrantyClaim(w.id, claimNote)}>
                  Claim warranty
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {w.status === 'IN_PROGRESS' && stockRotables.length > 0 && (
        <>
          <h4 className="sx-subhead">
            <Repeat size={13} /> Exchange a repairable unit
          </h4>
          <div className="sx-inline-form sx-wrap">
            <select className="form-control" value={rot.id} onChange={(e) => setRot({ ...rot, id: e.target.value })} aria-label="Unit from stock">
              <option value="">Serviceable unit from stock…</option>
              {stockRotables.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.description} — S/N {r.serial}
                </option>
              ))}
            </select>
            <input className="form-control" value={rot.serialOut} onChange={(e) => setRot({ ...rot, serialOut: e.target.value })} placeholder="Serial taken off" aria-label="Serial taken off" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => mx.exchangeRotable(w.id, rot.id, rot.serialOut).ok && setRot({ id: '', serialOut: '' })}>
              Fit unit
            </button>
          </div>
        </>
      )}
      {!!w.replacedParts?.length && (
        <p className="sx-muted">
          Replaced: {w.replacedParts.map((p) => `${p.description} ${p.serialOut ?? ''} → ${p.serialIn ?? ''}`).join('; ')}
        </p>
      )}
      {w.calibrationResult && (
        <p className="sx-muted">
          Calibration {w.calibrationResult.pass ? 'passed' : 'FAILED'} · cert {w.calibrationResult.certNo} · as found {w.calibrationResult.asFound}, as left {w.calibrationResult.asLeft}
        </p>
      )}
      {w.journalNumber && (
        <p className="sx-muted">
          <BookOpen size={12} /> Cost posted to Finance: journal {w.journalNumber}
          {w.costCentre ? ` · ${w.costCentre}` : ''}
        </p>
      )}

      <h4 className="sx-subhead">
        <MessageSquare size={13} /> Work log
      </h4>
      {w.workLog?.length ? (
        <ul className="sx-facts">
          {w.workLog.map((n, i) => (
            <li key={i}>
              <span>{n.text}</span>
              <small className="sx-muted">
                {n.by} · {n.at.slice(0, 16).replace('T', ' ')}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sx-muted">No notes yet.</p>
      )}
      {w.status !== 'COMPLETED' && w.status !== 'CANCELLED' && (
        <div className="sx-inline-form">
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (findings, waiting for parts…)" aria-label="Work log note" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => addWorkNote(w.id, note).ok && setNote('')}>
            Add note
          </button>
        </div>
      )}
      <Attachments owner={`maintenance:${w.number}`} by={actor.name} readOnly={!mx.canWrite} title="Photos and documents" />
      {w.contractorCost > 0 && w.warrantyClaim && <p className="sx-muted">Contractor cost {kes(w.contractorCost)} recovered under warranty.</p>}
    </div>
  );
};
