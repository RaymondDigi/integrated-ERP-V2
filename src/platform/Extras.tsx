import React, { useState } from 'react';
import { Mail, Save, SlidersHorizontal } from 'lucide-react';
import { customValuesFor, setCustomValues, useCustomFieldDefs, useCustomValues } from './customFields';
import { barcodeSvg } from './barcode';
import { notify } from './outbox';
import { Field, Modal } from '../suites/ui/kit';

/** The custom fields an administrator defined for this kind of record, editable in place. */
export const CustomFields: React.FC<{ entity: string; owner: string; by: string; readOnly?: boolean; onError?: (e: string) => void }> = ({ entity, owner, by, readOnly, onError }) => {
  const defs = useCustomFieldDefs().filter((d) => d.entity === entity);
  useCustomValues();
  const saved = customValuesFor(owner);
  const [vals, setVals] = useState<Record<string, string>>(saved);
  const [msg, setMsg] = useState('');
  if (!defs.length) return null;
  const save = () => {
    const r = setCustomValues(by, owner, vals, entity);
    setMsg(r.ok ? 'Saved' : r.error);
    if (!r.ok) onError?.(r.error);
  };
  return (
    <div className="pf-attach">
      <div className="pf-attach-head">
        <strong>
          <SlidersHorizontal size={14} /> Additional fields
        </strong>
        {!readOnly && (
          <button type="button" className="btn btn-secondary btn-xs" onClick={save}>
            <Save size={13} /> Save fields
          </button>
        )}
      </div>
      <div className="sx-grid sx-grid-2">
        {defs.map((d) => (
          <Field key={d.id} label={d.label} required={d.required}>
            {d.type === 'select' ? (
              <select className="form-control" disabled={readOnly} value={vals[d.key] ?? ''} onChange={(e) => setVals({ ...vals, [d.key]: e.target.value })}>
                <option value="">—</option>
                {(d.options ?? []).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : d.type === 'checkbox' ? (
              <input type="checkbox" disabled={readOnly} checked={vals[d.key] === 'yes'} onChange={(e) => setVals({ ...vals, [d.key]: e.target.checked ? 'yes' : '' })} />
            ) : (
              <input className="form-control" disabled={readOnly} type={d.type === 'number' ? 'number' : d.type === 'date' ? 'date' : 'text'} value={vals[d.key] ?? ''} onChange={(e) => setVals({ ...vals, [d.key]: e.target.value })} />
            )}
          </Field>
        ))}
      </div>
      {msg && <p className={msg === 'Saved' ? 'pf-ok' : 'pf-error'}>{msg}</p>}
    </div>
  );
};

/** Inline barcode image. */
export const Barcode: React.FC<{ text: string; height?: number }> = ({ text, height = 40 }) => <span className="pf-barcode" dangerouslySetInnerHTML={{ __html: barcodeSvg(text, { height }) }} />;

/** Queue a report or document to someone by email (simulated gateway — it lands in the Notification centre outbox). */
export const EmailButton: React.FC<{ module: string; subject: string; body: () => string; refNo?: string; label?: string; disabled?: boolean }> = ({ module, subject, body, refNo, label = 'Email', disabled }) => {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [err, setErr] = useState('');
  const send = () => {
    const list = to.split(/[,;\s]+/).filter(Boolean);
    if (!list.length || list.some((a) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a))) return setErr('Enter valid email addresses, separated by commas');
    list.forEach((address) => notify({ module, to: address, address, channels: ['EMAIL'], subject, body: body(), ref: refNo }));
    setOpen(false);
    setTo('');
  };
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={() => (setErr(''), setOpen(true))}>
        <Mail size={14} /> {label}
      </button>
      {open && (
        <Modal
          title="Email this"
          subtitle={`${subject} — sent through the simulated email gateway (see Notifications › Outbox)`}
          size="md"
          onClose={() => setOpen(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={send}>
              <Mail size={14} /> Send
            </button>
          }
        >
          <Field label="To" required span={4} hint="Separate several addresses with commas">
            <input className="form-control" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@intergrated-erp.ke" />
          </Field>
          {err && <p className="pf-error">{err}</p>}
        </Modal>
      )}
    </>
  );
};
