import React from 'react';
import { Plus, Star, Trash2 } from 'lucide-react';
import { KIN_RELATIONSHIPS, benefitTotal, emptyKin, type KinDraft } from '../../utils/nextOfKin';

interface Props {
  value: KinDraft[];
  onChange: (next: KinDraft[]) => void;
  /** Errors from kinErrors (kin.{row}.{field}, kin.total); pass only the ones to show */
  errors?: Record<string, string>;
  max?: number;
}

/** Add, edit and remove several next of kin; one is primary, benefit shares optional but must total 100%. */
export const NextOfKinEditor: React.FC<Props> = ({ value, onChange, errors = {}, max = 6 }) => {
  const rows = value.length ? value : [emptyKin(true)];
  const update = (i: number, patch: Partial<KinDraft>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : patch.primary ? { ...r, primary: false } : r)));
  const remove = (i: number) => {
    const next = rows.filter((_, k) => k !== i);
    if (next.length && !next.some((r) => r.primary)) next[0] = { ...next[0], primary: true };
    onChange(next.length ? next : [emptyKin(true)]);
  };
  const named = rows.filter((r) => r.name.trim());
  const shares = named.some((r) => r.benefitPct.trim());
  const total = benefitTotal(rows);
  const err = (i: number, f: keyof KinDraft) => errors[`kin.${i}.${f}`];
  const listId = 'nok-relationships';

  return (
    <div className="nok-editor">
      <datalist id={listId}>
        {KIN_RELATIONSHIPS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      {rows.map((r, i) => (
        <fieldset key={i} className={`nok-card ${r.primary ? 'is-primary' : ''}`}>
          <legend className="nok-head">
            <span>Next of kin {i + 1}</span>
            <span className="nok-actions">
              <button
                type="button"
                className={`nok-primary ${r.primary ? 'active' : ''}`}
                onClick={() => update(i, { primary: true })}
                aria-pressed={r.primary}
                title="The first person contacted, and shown on the employee portal"
              >
                <Star size={13} fill={r.primary ? 'currentColor' : 'none'} /> {r.primary ? 'Primary' : 'Make primary'}
              </button>
              {(rows.length > 1 || r.name) && (
                <button type="button" className="nok-remove" onClick={() => remove(i)} aria-label={`Remove next of kin ${i + 1}`}>
                  <Trash2 size={14} />
                </button>
              )}
            </span>
          </legend>
          <div className="nok-grid">
            <label className="req-field nok-wide">
              <span>Full name</span>
              <input className={`form-control ${err(i, 'name') ? 'is-invalid' : ''}`} value={r.name} onChange={(e) => update(i, { name: e.target.value })} />
              {err(i, 'name') && <small className="hi-err">{err(i, 'name')}</small>}
            </label>
            <label className="req-field">
              <span>Relationship</span>
              <input className={`form-control ${err(i, 'relationship') ? 'is-invalid' : ''}`} list={listId} value={r.relationship} onChange={(e) => update(i, { relationship: e.target.value })} />
              {err(i, 'relationship') && <small className="hi-err">{err(i, 'relationship')}</small>}
            </label>
            <label className="req-field">
              <span>Phone</span>
              <input
                className={`form-control ${err(i, 'phone') ? 'is-invalid' : ''}`}
                type="tel"
                placeholder="+254 712 345 678"
                value={r.phone}
                onChange={(e) => update(i, { phone: e.target.value })}
              />
              {err(i, 'phone') && <small className="hi-err">{err(i, 'phone')}</small>}
            </label>
            <label className="req-field">
              <span>Email</span>
              <input className={`form-control ${err(i, 'email') ? 'is-invalid' : ''}`} type="email" value={r.email} onChange={(e) => update(i, { email: e.target.value })} />
              {err(i, 'email') && <small className="hi-err">{err(i, 'email')}</small>}
            </label>
            <label className="req-field">
              <span>ID / passport no.</span>
              <input className="form-control" value={r.idNumber} onChange={(e) => update(i, { idNumber: e.target.value })} />
            </label>
            <label className="req-field">
              <span>Benefit share %</span>
              <input
                className={`form-control ${err(i, 'benefitPct') ? 'is-invalid' : ''}`}
                inputMode="decimal"
                placeholder="Optional"
                value={r.benefitPct}
                onChange={(e) =>
                  update(i, {
                    benefitPct: e.target.value.replace(/[^\d.]/g, '')
                  })
                }
              />
              {err(i, 'benefitPct') && <small className="hi-err">{err(i, 'benefitPct')}</small>}
            </label>
          </div>
        </fieldset>
      ))}
      <div className="nok-foot">
        {rows.length < max && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([...rows, emptyKin(!rows.some((x) => x.primary))])}>
            <Plus size={14} /> Add next of kin
          </button>
        )}
        <span className={`nok-total ${errors['kin.total'] ? 'bad' : ''}`}>
          {errors['kin.total'] ?? (shares ? `Benefit shares: ${total}% of 100%` : `${named.length} named · benefit shares are optional (death-in-service benefits and final dues)`)}
        </span>
      </div>
    </div>
  );
};
