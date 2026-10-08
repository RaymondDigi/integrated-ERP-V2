import React, { useMemo, useState } from 'react';
import { AlertTriangle, Save, Send } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { TravelDraft } from '../../../context/travelState';
import { addDays } from '../../../data/hireEngine';
import { bandOf, DEST_CLASSES, estimateTrip, TRANSPORT, type DestClass, type TransportMode, type TravelRequest } from '../../../data/travelEngine';
import { Field, kes, Modal, PersonSelect, useTravelOrg } from './shared';

/** New or edited travel request, with the cost worked out from the rate table as you type. */
export const RequestForm: React.FC<{ existing?: TravelRequest; onClose: () => void }> = ({ existing, onClose }) => {
  const { perDiemSchedules, saveTravelRequest, imprestBlock, travelToday } = useApp();
  const { staff, byId } = useTravelOrg();
  const [f, setF] = useState<TravelDraft>(
    existing
      ? {
          staffId: existing.staffId,
          purpose: existing.purpose,
          destinations: existing.destinations,
          destClass: existing.destClass,
          departDate: existing.departDate,
          returnDate: existing.returnDate,
          transport: existing.transport,
          km: existing.km,
          fares: existing.fares,
          advanceRequested: existing.advanceRequested
        }
      : { staffId: '', purpose: '', destinations: '', destClass: 'CITY', departDate: addDays(travelToday, 7), returnDate: addDays(travelToday, 9), transport: 'COMPANY_CAR', advanceRequested: 0 }
  );
  const [error, setError] = useState('');
  const [autoAdvance, setAutoAdvance] = useState(!existing);
  const set = (p: Partial<TravelDraft>) => setF((x) => ({ ...x, ...p }));
  const e = byId.get(f.staffId);
  const est = useMemo(() => (e ? estimateTrip(f, bandOf(e), perDiemSchedules) : undefined), [e, f, perDiemSchedules]);
  const advance = autoAdvance && est ? est.total - (f.transport === 'AIR' ? est.fares : 0) : f.advanceRequested;
  const block = f.staffId ? imprestBlock(f.staffId) : undefined;

  const save = (submit: boolean) => {
    const res = saveTravelRequest({ ...f, advanceRequested: Math.max(0, Math.round(advance)) }, submit, existing?.id);
    if (!res.ok) return setError(res.reason ?? 'Could not save.');
    onClose();
  };

  return (
    <Modal
      title={existing ? `Edit ${existing.id}` : 'New travel request'}
      subtitle="Costs are estimated from the per diem rates for the traveller's grade band."
      onClose={onClose}
      width={820}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-secondary" onClick={() => save(false)}>
            <Save size={15} /> Save draft
          </button>
          <button className="btn btn-primary" onClick={() => save(true)}>
            <Send size={15} /> Submit for approval
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Employee travelling" wide>
          <PersonSelect value={f.staffId} onChange={(v) => set({ staffId: v })} people={staff} />
        </Field>
        <Field label="Purpose" wide>
          <input className="form-control" value={f.purpose} placeholder="e.g. Mombasa tea auction and broker meetings" onChange={(ev) => set({ purpose: ev.target.value })} />
        </Field>
        <Field label="Destination(s)">
          <input className="form-control" value={f.destinations} placeholder="e.g. Mombasa" onChange={(ev) => set({ destinations: ev.target.value })} />
        </Field>
        <Field label="Destination class">
          <select className="form-control" value={f.destClass} onChange={(ev) => set({ destClass: ev.target.value as DestClass })}>
            {DEST_CLASSES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Departure">
          <input className="form-control" type="date" value={f.departDate} onChange={(ev) => set({ departDate: ev.target.value })} />
        </Field>
        <Field label="Return" hint={est ? `${est.nights} night(s), ${est.days} day(s)` : undefined}>
          <input className="form-control" type="date" value={f.returnDate} min={f.departDate} onChange={(ev) => set({ returnDate: ev.target.value })} />
        </Field>
        <Field label="Transport">
          <select className="form-control" value={f.transport} onChange={(ev) => set({ transport: ev.target.value as TransportMode })}>
            {(Object.keys(TRANSPORT) as TransportMode[]).map((t) => (
              <option key={t} value={t}>
                {TRANSPORT[t]}
              </option>
            ))}
          </select>
        </Field>
        {f.transport === 'OWN_CAR' && (
          <Field label="Round-trip distance (km)">
            <input className="form-control" type="number" min={0} value={f.km ?? ''} onChange={(ev) => set({ km: Number(ev.target.value) || 0 })} />
          </Field>
        )}
        {(f.transport === 'BUS' || f.transport === 'AIR') && (
          <Field label="Fares (KES)" hint={f.transport === 'AIR' ? 'Air tickets booked by Admin are not part of the cash advance' : undefined}>
            <input className="form-control" type="number" min={0} value={f.fares ?? ''} onChange={(ev) => set({ fares: Number(ev.target.value) || 0 })} />
          </Field>
        )}
        {f.transport === 'COMPANY_CAR' && (
          <Field label="Fuel">
            <span className="hi-sub" style={{ paddingTop: 8 }}>
              Fuelled on the company card — not in the estimate
            </span>
          </Field>
        )}
      </div>

      {est && e && (
        <div className="trv-estimate">
          <div className="hi-sub">
            Grade band <strong>{est.band}</strong> · rates {est.scheduleId}
            {f.destClass === 'INTL' ? ` · USD at ${est.fxUsdKes}` : ''}
          </div>
          <table className="hr-table">
            <tbody>
              <tr>
                <td>Accommodation · {est.nights} night(s)</td>
                <td className="hi-num">{kes(est.accommodation)}</td>
              </tr>
              <tr>
                <td>Meals · {est.days} day(s)</td>
                <td className="hi-num">{kes(est.meals)}</td>
              </tr>
              <tr>
                <td>Incidentals · {est.days} day(s)</td>
                <td className="hi-num">{kes(est.incidentals)}</td>
              </tr>
              {est.mileage > 0 && (
                <tr>
                  <td>Mileage · {f.km} km</td>
                  <td className="hi-num">{kes(est.mileage)}</td>
                </tr>
              )}
              {est.fares > 0 && (
                <tr>
                  <td>Fares</td>
                  <td className="hi-num">{kes(est.fares)}</td>
                </tr>
              )}
              <tr className="trv-total">
                <td>Estimated cost</td>
                <td className="hi-num">{kes(est.total)}</td>
              </tr>
            </tbody>
          </table>
          <div className="pr-form-grid" style={{ marginTop: 10 }}>
            <Field label="Advance requested (KES)" hint={autoAdvance ? 'Full estimate (less air tickets)' : `Up to ${kes(est.total)}`}>
              <input
                className="form-control"
                type="number"
                min={0}
                value={Math.round(advance)}
                onChange={(ev) => {
                  setAutoAdvance(false);
                  set({ advanceRequested: Number(ev.target.value) || 0 });
                }}
              />
            </Field>
          </div>
        </div>
      )}

      {block && advance > 0 && (
        <div className="pr-note bad">
          <AlertTriangle size={13} /> No new advance: {block} You can still submit with no advance.
        </div>
      )}
      {error && <div className="pr-note bad">{error}</div>}
    </Modal>
  );
};
