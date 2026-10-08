import React from 'react';
import { ShieldAlert, Pencil } from 'lucide-react';
import type { HREmployee } from '../../../types';
import { PersonSelect } from '../hire/shared';
import type { EditChange } from './employeeEdit';
import type { StepId } from './wizardModel';

/** Which wizard step each change was made in, so the reviewer can jump back to it. */
const STEP_OF: Record<string, StepId> = {
  name: 'personal',
  gender: 'personal',
  'date of birth': 'personal',
  'marital status': 'personal',
  photo: 'personal',
  'national ID': 'personal',
  'KRA PIN': 'personal',
  'NSSF number': 'personal',
  'SHIF number': 'personal',
  phone: 'personal',
  'work email': 'personal',
  'personal email': 'personal',
  'phone extension': 'personal',
  address: 'personal',
  'next of kin': 'personal',
  'emergency contact': 'personal',
  branch: 'placement',
  station: 'placement',
  section: 'placement',
  'reports to': 'placement',
  'notice period': 'contract',
  'work schedule': 'contract',
  'leave entitlement': 'contract',
  'tax profile': 'payment',
  'statutory deductions': 'payment',
  'pay rail': 'payment',
  'bank account': 'payment',
  bank: 'payment',
  'bank branch': 'payment',
  'M-Pesa number': 'payment'
};

interface Props {
  changes: EditChange[];
  reason: string;
  setReason: (v: string) => void;
  actor: string;
  setActor: (v: string) => void;
  people: HREmployee[];
  showErrors: boolean;
  goTo: (s: StepId) => void;
  payrollFrom: string;
}

/** Last step when editing: every change from → to, a reason for sensitive ones, and who is making them. */
export const EditReviewStep: React.FC<Props> = ({ changes, reason, setReason, actor, setActor, people, showErrors, goTo, payrollFrom }) => {
  const sensitive = changes.filter((c) => c.sensitive);
  const reasonErr = showErrors && sensitive.length && reason.trim().length < 5 ? `Give a reason: ${sensitive.map((c) => c.label).join(', ')} ${sensitive.length > 1 ? 'are' : 'is'} sensitive` : '';
  const payroll = sensitive.some((c) => /bank|M-Pesa|pay rail|tax|statutory/.test(c.label));
  return (
    <>
      {changes.length === 0 ? (
        <div className="ew-callout info">
          <Pencil size={16} />
          <div>
            <strong>No changes yet</strong>
            <span>Go back to any step, change what you need, then return here to save.</span>
          </div>
        </div>
      ) : (
        <div className="ew-changes">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Was</th>
                <th>Now</th>
                <th aria-label="Edit" />
              </tr>
            </thead>
            <tbody>
              {changes.map((c, i) => (
                <tr key={i} className={c.sensitive ? 'ew-change-sensitive' : ''}>
                  <td>
                    <strong>{c.label}</strong>
                    {c.sensitive && <span className="ew-sens-tag">Sensitive</span>}
                  </td>
                  <td className="ew-change-from">{c.from}</td>
                  <td className="ew-change-to">{c.to}</td>
                  <td>
                    {STEP_OF[c.label] && (
                      <button type="button" className="ew-link" onClick={() => goTo(STEP_OF[c.label])}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sensitive.length > 0 && (
        <div className="ew-callout warn">
          <ShieldAlert size={16} />
          <div>
            <strong>
              {sensitive.length} sensitive change{sensitive.length > 1 ? 's' : ''}
            </strong>
            <span>
              Flagged in the audit trail with the reason below.{payroll ? ` Payroll uses the new details from ${payrollFrom}; months already paid keep the old ones.` : ''}
            </span>
          </div>
        </div>
      )}

      <div className="ew-grid ew-grid-2">
        <label className="req-field ew-span-2">
          <span>
            Reason{sensitive.length ? <em className="cs-req"> *</em> : null}
          </span>
          <textarea
            className={`form-control ${reasonErr ? 'is-invalid' : ''}`}
            rows={2}
            value={reason}
            onChange={(ev) => setReason(ev.target.value)}
            placeholder="e.g. Employee moved salary account; letter from bank on file"
          />
          {reasonErr ? <small className="ew-error">{reasonErr}</small> : <small className="ew-hint">Required for bank, M-Pesa, KRA PIN, national ID, work email and tax changes</small>}
        </label>
        <label className="req-field ew-span-2">
          <span>
            Acting as<em className="cs-req"> *</em>
          </span>
          <PersonSelect value={actor} onChange={setActor} people={people} />
          {showErrors && !actor ? <small className="ew-error">Choose who is making the change</small> : <small className="ew-hint">HR user making the change; recorded in the history and audit trail</small>}
        </label>
      </div>
    </>
  );
};
