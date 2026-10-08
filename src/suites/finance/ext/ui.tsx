import React, { useState } from 'react';
import { Field, Modal } from '../../ui/kit';
import type { Result } from './ctx';

export interface PromptField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox';
  options?: { value: string; label: string }[];
  initial?: string | number | boolean;
  required?: boolean;
  hint?: string;
  span?: 1 | 2 | 3 | 4;
}

type Values = Record<string, string>;

/**
 * Small form in a modal for actions that need a few inputs (reason, date, amount…). The action's Result decides
 * whether the modal closes; the store shows the error toast.
 */
export const PromptModal: React.FC<{
  title: string;
  subtitle?: string;
  fields: PromptField[];
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (v: Values) => Result | void;
  children?: React.ReactNode;
}> = ({ title, subtitle, fields, submitLabel = 'Save', onClose, onSubmit, children }) => {
  const [v, setV] = useState<Values>(() => Object.fromEntries(fields.map((f) => [f.key, f.initial === undefined ? (f.type === 'select' ? f.options?.[0]?.value ?? '' : '') : String(f.initial)])));
  const set = (k: string, x: string) => setV((p) => ({ ...p, [k]: x }));
  const submit = () => {
    const r = onSubmit(v);
    if (!r || r.ok) onClose();
  };
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={submit} data-testid="prompt-submit">
            {submitLabel}
          </button>
        </>
      }
    >
      {children}
      <div className="sx-grid sx-grid-2">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required} hint={f.hint} span={f.span ?? (f.type === 'textarea' ? 2 : 1)}>
            {f.type === 'select' ? (
              <select className="form-control" value={v[f.key]} onChange={(e) => set(f.key, e.target.value)} name={f.key}>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea className="form-control" rows={3} value={v[f.key]} onChange={(e) => set(f.key, e.target.value)} name={f.key} />
            ) : f.type === 'checkbox' ? (
              <input type="checkbox" checked={v[f.key] === 'true'} onChange={(e) => set(f.key, String(e.target.checked))} name={f.key} />
            ) : (
              <input className="form-control" type={f.type ?? 'text'} value={v[f.key]} onChange={(e) => set(f.key, e.target.value)} name={f.key} step={f.type === 'number' ? 'any' : undefined} />
            )}
          </Field>
        ))}
      </div>
    </Modal>
  );
};

/** One open prompt at a time per page. */
export const usePrompt = () => {
  const [prompt, setPrompt] = useState<React.ComponentProps<typeof PromptModal> | null>(null);
  const open = (p: Omit<React.ComponentProps<typeof PromptModal>, 'onClose'>) => setPrompt({ ...p, onClose: () => setPrompt(null) });
  const node = prompt ? <PromptModal {...prompt} /> : null;
  return { open, node };
};

/** Simulated integration marker shown next to features that stand in for an external service. */
export const Simulated: React.FC<{ what: string }> = ({ what }) => (
  <span className="fx-sim" title={`${what} is simulated in this build — no real external system is called`}>
    Simulated · {what}
  </span>
);

export const num = (s: string | undefined) => Number(String(s ?? '').replace(/,/g, '')) || 0;
