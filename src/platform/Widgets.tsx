import React, { useRef, useState } from 'react';
import { Download, FileUp, Paperclip, PenLine, Printer, Trash2, Upload } from 'lucide-react';
import { addAttachment, removeAttachment, useAttachments } from './attachments';
import { exportCsv, parseCsvObjects, readFileText, type Cell } from './csv';
import { Field, Modal } from '../suites/ui/kit';

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Upload, list, download and remove files on a record. */
export const Attachments: React.FC<{ owner: string; by: string; readOnly?: boolean; title?: string }> = ({ owner, by, readOnly, title = 'Attachments' }) => {
  const all = useAttachments();
  const mine = all.filter((a) => a.owner === owner);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const pick = async (files: FileList | null) => {
    setError('');
    for (const f of Array.from(files ?? [])) await addAttachment(owner, f, by).catch((e: Error) => setError(e.message));
  };
  return (
    <div className="pf-attach">
      <div className="pf-attach-head">
        <strong>
          <Paperclip size={14} /> {title} {mine.length > 0 && <span className="sx-count">{mine.length}</span>}
        </strong>
        {!readOnly && (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => input.current?.click()}>
            <Upload size={13} /> Attach file
          </button>
        )}
        <input ref={input} type="file" multiple hidden onChange={(e) => (pick(e.target.files), (e.target.value = ''))} aria-label="Attach file" />
      </div>
      {error && <p className="pf-error">{error}</p>}
      {mine.length === 0 ? (
        <p className="pf-muted">No files attached yet.</p>
      ) : (
        <ul className="pf-attach-list">
          {mine.map((a) => (
            <li key={a.id}>
              <a href={a.dataUrl} download={a.name} title="Download">
                <Download size={13} /> {a.name}
              </a>
              <small>
                v{a.version} · {kb(a.size)} · {a.by} · {a.at}
              </small>
              {!readOnly && (
                <button type="button" className="sx-icon-btn" aria-label={`Remove ${a.name}`} onClick={() => removeAttachment(a.id)}>
                  <Trash2 size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Download the given rows as CSV (opens in Excel). */
export const ExportCsvButton: React.FC<{ name: string; header: string[]; rows: () => Cell[][]; label?: string }> = ({ name, header, rows, label = 'Export CSV' }) => (
  <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportCsv(name, header, rows())}>
    <Download size={14} /> {label}
  </button>
);

/** Pick a CSV file, preview it and hand the parsed rows to the caller, which validates and imports them. */
export const ImportCsvButton: React.FC<{
  label?: string;
  template: string[];
  onImport: (rows: Record<string, string>[]) => { imported: number; errors: string[] };
}> = ({ label = 'Import CSV', template, onImport }) => {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const load = async (f?: File) => {
    if (!f) return;
    setResult(null);
    setRows(parseCsvObjects(await readFileText(f)));
  };
  const missing = rows && rows.length ? template.filter((t) => !(t in rows[0])) : [];
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()}>
        <FileUp size={14} /> {label}
      </button>
      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => (load(e.target.files?.[0]), (e.target.value = ''))} aria-label={label} />
      {rows && (
        <Modal
          title={label}
          subtitle={`${rows.length} rows read · expected columns: ${template.join(', ')}`}
          onClose={() => setRows(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => exportCsv(`${label}-template`, template, [])}>
                <Download size={14} /> Template
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!rows.length || !!missing?.length || !!result} onClick={() => setResult(onImport(rows))}>
                Import {rows.length} rows
              </button>
            </>
          }
        >
          {!!missing?.length && <p className="pf-error">Missing columns: {missing.join(', ')}</p>}
          {result && (
            <p className={result.errors.length ? 'pf-error' : 'pf-ok'}>
              Imported {result.imported} of {rows.length}.{result.errors.length ? ` ${result.errors.length} rejected:` : ''}
            </p>
          )}
          {result?.errors.length ? (
            <ul className="pf-errlist">
              {result.errors.slice(0, 50).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : (
            <div className="sx-table-scroll">
              <table className="sx-mini-table">
                <thead>
                  <tr>{Object.keys(rows[0] ?? {}).map((k) => <th key={k}>{k}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 8).map((r, i) => (
                    <tr key={i}>{Object.keys(rows[0] ?? {}).map((k) => <td key={k}>{r[k]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </>
  );
};

/** Opens a printable copy of a document (the browser's print dialog can save it as PDF). */
export const printDocument = (title: string, bodyHtml: string) => {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    body{font:13px/1.45 system-ui,Segoe UI,Arial,sans-serif;color:#111;margin:32px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px}
    table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #bbb;padding:5px 7px;text-align:left}th{background:#f1f3f6}
    .r{text-align:right}.muted{color:#666}.sig{margin-top:28px;display:flex;gap:40px}.sig div{border-top:1px solid #333;padding-top:4px;min-width:200px}
    </style></head><body>${bodyHtml}<script>setTimeout(()=>print(),300)</script></body></html>`);
  w.document.close();
  return true;
};
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const PrintButton: React.FC<{ title: string; html: () => string; label?: string }> = ({ title, html, label = 'Print / PDF' }) => (
  <button type="button" className="btn btn-secondary btn-sm" onClick={() => printDocument(title, html())}>
    <Printer size={14} /> {label}
  </button>
);

/** Electronic signature: typed name confirmed with the signer's PIN. Returns the signature record. */
export interface ESignature {
  by: string;
  at: string;
  method: 'TYPED';
  text: string;
  meaning: string;
}
export const SIGNING_PIN = '1234';
export const SignModal: React.FC<{ signer: string; meaning: string; onClose: () => void; onSign: (s: ESignature) => void }> = ({ signer, meaning, onClose, onSign }) => {
  const [text, setText] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const sign = () => {
    if (text.trim().toLowerCase() !== signer.trim().toLowerCase()) return setError(`Type your full name exactly: ${signer}`);
    if (pin !== SIGNING_PIN) return setError('Signing PIN is incorrect (demo PIN 1234)');
    const d = new Date();
    onSign({ by: signer, at: d.toISOString().slice(0, 16).replace('T', ' '), method: 'TYPED', text: text.trim(), meaning });
    onClose();
  };
  return (
    <Modal
      title="Sign electronically"
      subtitle={meaning}
      size="md"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-sm" onClick={sign}>
          <PenLine size={14} /> Sign
        </button>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Field label="Type your full name" required span={2}>
          <input className="form-control" value={text} onChange={(e) => setText(e.target.value)} placeholder={signer} />
        </Field>
        <Field label="Signing PIN" required hint="Demo PIN 1234">
          <input className="form-control" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
        </Field>
      </div>
      {text && <p className="pf-signature">{text}</p>}
      {error && <p className="pf-error">{error}</p>}
    </Modal>
  );
};
