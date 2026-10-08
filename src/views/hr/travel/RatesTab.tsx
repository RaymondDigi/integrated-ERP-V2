import React, { useState } from 'react';
import { History, Pencil, Save, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { DEST_CLASSES, GRADE_BANDS_TRAVEL, rateFor, type GradeBand, type PerDiemSchedule } from '../../../data/travelEngine';
import { addDays } from '../../../data/hireEngine';
import { Card, Field, fmt, kes, Pill } from './shared';

type Draft = Omit<PerDiemSchedule, 'id' | 'savedBy' | 'savedOn'>;

const RateTable: React.FC<{ s: Draft; edit?: (s: Draft) => void }> = ({ s, edit }) => {
  const setRate = (band: GradeBand, dest: string, key: 'accommodation' | 'meals' | 'incidentals', v: number) =>
    edit?.({ ...s, rates: s.rates.map((r) => (r.band === band && r.dest === dest ? { ...r, [key]: v } : r)) });
  const num = (v: number, on: (n: number) => void, label: string) =>
    edit ? <input className="form-control trv-num-input" type="number" min={0} value={v} aria-label={label} onChange={(ev) => on(Math.max(0, Number(ev.target.value) || 0))} /> : v.toLocaleString();
  return (
    <div className="hi-scroll">
      <table className="hr-table">
        <thead>
          <tr>
            <th>Destination</th>
            <th>Grade band</th>
            <th className="hi-num">Accommodation / night</th>
            <th className="hi-num">Meals / day</th>
            <th className="hi-num">Incidentals / day</th>
            <th className="hi-num">Full day + night</th>
          </tr>
        </thead>
        <tbody>
          {DEST_CLASSES.map((d) =>
            GRADE_BANDS_TRAVEL.map((b, k) => {
              const r = rateFor(s as PerDiemSchedule, b, d.id);
              if (!r) return null;
              const usd = d.id === 'INTL';
              const day = r.accommodation + r.meals + r.incidentals;
              return (
                <tr key={`${d.id}-${b}`}>
                  <td>{k === 0 ? <strong>{d.label}</strong> : null}</td>
                  <td>{b}</td>
                  <td className="hi-num">{num(r.accommodation, (n) => setRate(b, d.id, 'accommodation', n), `${d.short} ${b} accommodation`)}</td>
                  <td className="hi-num">{num(r.meals, (n) => setRate(b, d.id, 'meals', n), `${d.short} ${b} meals`)}</td>
                  <td className="hi-num">{num(r.incidentals, (n) => setRate(b, d.id, 'incidentals', n), `${d.short} ${b} incidentals`)}</td>
                  <td className="hi-num">
                    {usd ? (
                      <>
                        USD {day.toLocaleString()}
                        <div className="hi-sub">≈ {kes(day * s.fxUsdKes)}</div>
                      </>
                    ) : (
                      kes(day)
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

/** Per diem and mileage rates by grade band and destination, with dated versions. */
export const RatesTab: React.FC = () => {
  const { perDiemSchedules, perDiemRates, savePerDiemRates, travelToday } = useApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [viewId, setViewId] = useState('');
  const versions = [...perDiemSchedules].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const viewing = versions.find((v) => v.id === viewId) ?? perDiemRates;
  const shown: Draft = draft ?? viewing;
  const future = versions.filter((v) => v.effectiveFrom > travelToday);

  const start = () => {
    const cur = perDiemRates;
    setDraft({ effectiveFrom: addDays(travelToday, 1), fxUsdKes: cur.fxUsdKes, rates: cur.rates.map((r) => ({ ...r })), mileage: { ...cur.mileage }, note: '' });
    setError('');
  };
  const save = () => {
    if (!draft) return;
    if (!draft.effectiveFrom) return setError('Give the date the new rates take effect.');
    if (!(draft.fxUsdKes > 0)) return setError('Enter the USD exchange rate.');
    savePerDiemRates(draft);
    setDraft(null);
    setViewId('');
  };

  return (
    <>
      <Card
        title={draft ? 'New per diem rates' : `Per diem rates${viewing.id === perDiemRates.id ? ' in force' : ` — ${viewing.id}`}`}
        sub={
          draft
            ? 'Edit the amounts, then save as a new version. Trips already approved keep the rates they were costed at.'
            : `Effective from ${fmt(shown.effectiveFrom)}${shown.note ? ` — ${shown.note}` : ''}. KES for local trips, USD for international.`
        }
        actions={
          draft ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setDraft(null)}>
                <X size={14} /> Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={save}>
                <Save size={14} /> Save new version
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={start}>
              <Pencil size={14} /> Revise rates
            </button>
          )
        }
      >
        {draft && (
          <div className="pr-form-grid" style={{ marginBottom: 12 }}>
            <Field label="Effective from">
              <input className="form-control" type="date" value={draft.effectiveFrom} onChange={(ev) => setDraft({ ...draft, effectiveFrom: ev.target.value })} />
            </Field>
            <Field label="Exchange rate (KES per USD)">
              <input className="form-control" type="number" step="0.1" value={draft.fxUsdKes} onChange={(ev) => setDraft({ ...draft, fxUsdKes: Number(ev.target.value) || 0 })} />
            </Field>
            <Field label="Note" wide>
              <input
                className="form-control"
                value={draft.note ?? ''}
                placeholder="e.g. Approved by the Finance Director, board minute 14/2026"
                onChange={(ev) => setDraft({ ...draft, note: ev.target.value })}
              />
            </Field>
          </div>
        )}
        {error && draft && (
          <div className="pr-note bad" style={{ marginBottom: 10 }}>
            {error}
          </div>
        )}
        <RateTable s={shown} edit={draft ? setDraft : undefined} />
        <h4 className="trv-h4">Own car mileage (KES per km)</h4>
        <div className="trv-mileage">
          {GRADE_BANDS_TRAVEL.map((b) => (
            <label key={b} className="req-field">
              <span>{b}</span>
              {draft ? (
                <input
                  className="form-control"
                  type="number"
                  min={0}
                  value={draft.mileage[b]}
                  onChange={(ev) => setDraft({ ...draft, mileage: { ...draft.mileage, [b]: Math.max(0, Number(ev.target.value) || 0) } })}
                />
              ) : (
                <strong>KES {shown.mileage[b]}</strong>
              )}
            </label>
          ))}
        </div>
        <p className="pr-note" style={{ marginTop: 12 }}>
          Grade bands follow the job grade on the employee record (or the salary band where no grade is set). Accommodation is paid per night away; meals and incidentals per day, counting the return
          day. Per diem at these rates is not taxable and can go through payroll as “Per diem (within limits)”.
        </p>
      </Card>

      <Card title="Versions" sub="Every change is kept, so a past trip can always be re-costed at the rates of its day.">
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Effective from</th>
                <th className="hi-num">USD rate</th>
                <th>Note</th>
                <th>Saved</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td className="hi-mono">
                    {v.id} {v.id === perDiemRates.id && <Pill tone="success">In force</Pill>} {future.includes(v) && <Pill tone="info">Upcoming</Pill>}
                  </td>
                  <td>{fmt(v.effectiveFrom)}</td>
                  <td className="hi-num">{v.fxUsdKes}</td>
                  <td className="hi-wrap">{v.note || '—'}</td>
                  <td className="hi-sub">
                    {v.savedBy} · {fmt(v.savedOn)}
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" disabled={!!draft} onClick={() => setViewId(v.id)}>
                      <History size={13} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
};
