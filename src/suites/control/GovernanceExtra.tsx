import React, { useState } from 'react';
import { CheckCircle2, Download, FileLock2, FileText, Link2, Lock, Plus, Send, Unlock, XCircle, PlayCircle, Archive, Pencil, BellRing } from 'lucide-react';
import { useControl } from './store';
import { permitState } from './engine';
import { STAFF } from './data2';
import { daysBetween, fmtDate, kes, TODAY } from '../finance/engine';
import type { LibraryDoc, Permit, TestCase } from './types';
import { Chips, DataTable, DefList, Drawer, Field, Modal, Panel, Pill, SearchBox, Stat, SuitePage, Timeline, type Column } from '../ui/kit';
import { Attachments, ExportCsvButton } from '../../platform/Widgets';
import { CustomFields } from '../../platform/Extras';
import { RULE_ROLES } from '../../platform/rules';
import { useCtlFocus } from './parts';

const MAX_FILE = 2 * 1024 * 1024;
const readFile = (file: File) =>
  new Promise<{ fileName: string; dataUrl: string }>((resolve, reject) => {
    if (file.size > MAX_FILE) return reject(new Error('Files up to 2 MB can be stored in this demo'));
    const r = new FileReader();
    r.onload = () => resolve({ fileName: file.name, dataUrl: String(r.result) });
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });

const DOC_PILL: Record<LibraryDoc['status'], [string, string]> = { DRAFT: ['DRAFT', 'Draft'], IN_REVIEW: ['SUBMITTED', 'In review'], APPROVED: ['APPROVED', 'Approved'], OBSOLETE: ['VOID', 'Obsolete'] };
export const DOC_FOLDERS = ['Policies', 'Procedures (SOPs)', 'Quality manual', 'Contracts', 'Board papers', 'ICT', 'HR forms'];

/* ------------------------------------------------------------------ */
/* Document library with check-in / check-out and versions             */
/* ------------------------------------------------------------------ */

const DocDrawer: React.FC<{ d: LibraryDoc; onClose: () => void }> = ({ d, onClose }) => {
  const { checkOut, checkIn, discardCheckout, commentDoc, submitDoc, decideDoc, shareDoc, revokeShare, obsoleteDoc, actor, me, readOnly } = useControl();
  const [note, setNote] = useState('');
  const [file, setFile] = useState<{ fileName: string; dataUrl: string } | undefined>();
  const [fileErr, setFileErr] = useState('');
  const [comment, setComment] = useState('');
  const [share, setShare] = useState({ party: '', days: 14 });
  const latest = d.versions[d.versions.length - 1];
  return (
    <Drawer wide title={d.number} subtitle={d.title} badge={<Pill status={DOC_PILL[d.status][0]} label={DOC_PILL[d.status][1]} />} onClose={onClose}>
      <DefList
        items={[
          ['Folder', d.folder],
          ['Owner', d.owner],
          ['Current version', `v${latest.v} · ${latest.by} · ${fmtDate(latest.at)}`],
          ['Checked out', d.checkedOutBy ? `${d.checkedOutBy} since ${fmtDate(d.checkedOutAt ?? TODAY)}` : 'No — available'],
          ['Approvals', d.approvals.map((a) => `${a.by} (${RULE_ROLES[a.role] ?? a.role})`).join(', ') || '—'],
          ['External link', d.share ? `${d.share.party} · /share/${d.share.token} · until ${fmtDate(d.share.expires)}` : '—']
        ]}
      />
      {d.status !== 'OBSOLETE' && (
        <div className="sx-actions">
          {!d.checkedOutBy && d.status !== 'IN_REVIEW' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => checkOut(d.id)}>
              <Lock size={14} /> Check out to edit
            </button>
          )}
          {d.checkedOutBy && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => discardCheckout(d.id)}>
              <Unlock size={14} /> Release lock
            </button>
          )}
          {d.status === 'DRAFT' && !d.checkedOutBy && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => submitDoc(d.id)}>
              <Send size={14} /> Send for review
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => obsoleteDoc(d.id)}>
            <Archive size={14} /> Withdraw
          </button>
        </div>
      )}
      {d.checkedOutBy === actor.name && (
        <Panel title="Check in a new version" subtitle="Upload the edited file and say what changed">
          <div className="sx-grid">
            <Field label="What changed" required span={2}>
              <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Field label="File (optional, up to 2 MB)" span={2}>
              <input
                className="form-control"
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setFileErr('');
                  if (f) readFile(f).then(setFile, (er: Error) => setFileErr(er.message));
                }}
              />
            </Field>
          </div>
          {fileErr && <p className="sx-danger-text">{fileErr}</p>}
          <button type="button" className="btn btn-primary btn-sm" onClick={() => checkIn(d.id, note, file).ok && (setNote(''), setFile(undefined))}>
            <CheckCircle2 size={14} /> Check in
          </button>
        </Panel>
      )}
      {d.status === 'IN_REVIEW' && (
        <>
          <Field label="Review note (required to return)" span={4}>
            <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="sx-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => decideDoc(d.id, false, note)}>
              <XCircle size={14} /> Return for changes
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => decideDoc(d.id, true, note)}>
              <CheckCircle2 size={14} /> Approve
            </button>
          </div>
        </>
      )}
      {d.status === 'APPROVED' && (
        <Panel title="Share outside the company" subtitle="Read-only link that expires">
          {d.share ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => revokeShare(d.id)}>
              Revoke link for {d.share.party}
            </button>
          ) : (
            <div className="sx-grid">
              <Field label="Shared with" span={2}>
                <input className="form-control" value={share.party} placeholder="e.g. KEBS auditor" onChange={(e) => setShare({ ...share, party: e.target.value })} />
              </Field>
              <Field label="Days valid">
                <input className="form-control" type="number" value={share.days} onChange={(e) => setShare({ ...share, days: Number(e.target.value) })} />
              </Field>
              <Field label=" ">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => shareDoc(d.id, share.party, share.days)}>
                  <Link2 size={14} /> Create link
                </button>
              </Field>
            </div>
          )}
        </Panel>
      )}
      <h4 className="sx-subhead">Versions</h4>
      <ul className="sx-facts">
        {[...d.versions].reverse().map((v) => (
          <li key={v.v}>
            <span>
              <b>v{v.v}</b> · {v.note} <small className="sx-muted">· {v.by} · {fmtDate(v.at)}</small>
            </span>
            {v.dataUrl ? (
              <a className="btn btn-secondary btn-xs" href={v.dataUrl} download={v.fileName}>
                <Download size={12} /> {v.fileName}
              </a>
            ) : (
              <small className="sx-muted">{v.fileName ?? 'no file'}</small>
            )}
          </li>
        ))}
      </ul>
      <h4 className="sx-subhead">Comments</h4>
      <ul className="sx-acts">
        {d.comments.map((c, i) => (
          <li key={i}>
            <div>
              <b>{c.by}</b>
              <small>
                {fmtDate(c.at)} · {c.text}
              </small>
            </div>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <div className="sx-inline-form">
          <input className="form-control" value={comment} placeholder="Add a comment" onChange={(e) => setComment(e.target.value)} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => commentDoc(d.id, comment).ok && setComment('')}>
            Comment
          </button>
        </div>
      )}
      <Attachments owner={`doc:${d.id}`} by={me} readOnly={readOnly} title="Supporting files" />
      <h4 className="sx-subhead">History</h4>
      <Timeline items={d.history} />
    </Drawer>
  );
};

export const DocumentsPage: React.FC<{ eyebrow?: string }> = ({ eyebrow = 'Governance' }) => {
  const { state, governance, createDoc } = useControl();
  const [folder, setFolder] = useState('ALL');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: '', folder: DOC_FOLDERS[1], note: '', policyId: '' });
  const [file, setFile] = useState<{ fileName: string; dataUrl: string } | undefined>();
  const [fileErr, setFileErr] = useState('');
  useCtlFocus(governance.focus, (id) => state.docs.some((d) => d.id === id), setOpenId, () => setAdding(true));
  const rows = state.docs.filter((d) => (folder === 'ALL' || d.folder === folder) && (!q || `${d.number} ${d.title} ${d.owner}`.toLowerCase().includes(q.toLowerCase())));
  const open = state.docs.find((d) => d.id === openId);
  const columns: Column<LibraryDoc>[] = [
    {
      key: 't',
      header: 'Document',
      render: (d) => (
        <div className="sx-cell-main">
          <span>
            {d.checkedOutBy && <FileLock2 size={13} />} {d.title}
          </span>
          <small>
            {d.number} · {d.folder} · {d.owner}
          </small>
        </div>
      ),
      sort: (d) => d.title
    },
    { key: 'v', header: 'Version', render: (d) => `v${d.versions.length}`, width: 80 },
    { key: 'u', header: 'Updated', render: (d) => fmtDate(d.versions[d.versions.length - 1].at), sort: (d) => d.versions[d.versions.length - 1].at, hideOnMobile: true },
    { key: 'c', header: 'Checked out', render: (d) => d.checkedOutBy ?? '—', hideOnMobile: true },
    { key: 's', header: 'Status', render: (d) => <Pill status={DOC_PILL[d.status][0]} label={DOC_PILL[d.status][1]} /> }
  ];
  return (
    <SuitePage
      eyebrow={eyebrow}
      title="Document library"
      subtitle="Controlled documents: check out to edit, check in a new version, review and approve under the approval rules, share read-only links."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={15} /> New document
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Documents" value={state.docs.filter((d) => d.status !== 'OBSOLETE').length} icon={<FileText size={17} />} />
        <Stat label="Checked out" value={state.docs.filter((d) => d.checkedOutBy).length} icon={<Lock size={17} />} tone="gold" />
        <Stat label="In review" value={state.docs.filter((d) => d.status === 'IN_REVIEW').length} icon={<Send size={17} />} tone="blue" />
        <Stat label="Shared externally" value={state.docs.filter((d) => d.share && d.share.expires >= TODAY).length} icon={<Link2 size={17} />} tone="violet" />
      </div>
      <div className="sx-toolbar">
        <Chips value={folder} onChange={setFolder} options={[{ value: 'ALL', label: 'All folders', count: state.docs.length }, ...DOC_FOLDERS.filter((x) => state.docs.some((d) => d.folder === x)).map((x) => ({ value: x, label: x, count: state.docs.filter((d) => d.folder === x).length }))]} />
        <SearchBox value={q} onChange={setQ} placeholder="Search documents" />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(d) => d.id} onRowClick={(d) => setOpenId(d.id)} selected={openId} layoutId="gov.documents" />
      {open && <DocDrawer d={open} onClose={() => setOpenId(null)} />}
      {adding && (
        <Modal
          title="New document"
          onClose={() => setAdding(false)}
          footer={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                const r = createDoc({ title: f.title, folder: f.folder, note: f.note, policyId: f.policyId || undefined, ...file });
                if (r.ok) {
                  setAdding(false);
                  if (r.id) setOpenId(r.id);
                }
              }}
            >
              Create
            </button>
          }
        >
          <div className="sx-grid">
            <Field label="Title" required span={4}>
              <input className="form-control" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </Field>
            <Field label="Folder" span={2}>
              <select className="form-control" value={f.folder} onChange={(e) => setF({ ...f, folder: e.target.value })}>
                {DOC_FOLDERS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Linked policy" span={2}>
              <select className="form-control" value={f.policyId} onChange={(e) => setF({ ...f, policyId: e.target.value })}>
                <option value="">— none —</option>
                {state.policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Version note" span={2}>
              <input className="form-control" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            </Field>
            <Field label="File (optional, up to 2 MB)" span={2}>
              <input
                className="form-control"
                type="file"
                onChange={(e) => {
                  const x = e.target.files?.[0];
                  setFileErr('');
                  if (x) readFile(x).then(setFile, (er: Error) => setFileErr(er.message));
                }}
              />
            </Field>
          </div>
          {fileErr && <p className="sx-danger-text">{fileErr}</p>}
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Licence master                                                       */
/* ------------------------------------------------------------------ */

export const PermitFormModal: React.FC<{ permit?: Permit; onClose: () => void }> = ({ permit, onClose }) => {
  const { savePermit } = useControl();
  const [f, setF] = useState({ name: permit?.name ?? '', issuer: permit?.issuer ?? '', number: permit?.number ?? '', expiry: permit?.expiry ?? '', site: permit?.site ?? 'Kericho factory', owner: permit?.owner ?? 'Agnes Wairimu', annualCost: permit?.annualCost ?? 0, conditions: permit?.conditions ?? '' });
  return (
    <Modal
      title={permit ? `Edit ${permit.name}` : 'Add a licence or permit'}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => savePermit({ ...f, id: permit?.id }).ok && onClose()}>
          Save
        </button>
      }
    >
      <div className="sx-grid">
        <Field label="Licence / permit" required span={2}>
          <input className="form-control" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Issuer" required span={2}>
          <input className="form-control" value={f.issuer} placeholder="e.g. Tea Board of Kenya" onChange={(e) => setF({ ...f, issuer: e.target.value })} />
        </Field>
        <Field label="Number" required>
          <input className="form-control" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
        </Field>
        <Field label="Expiry" required>
          <input className="form-control" type="date" value={f.expiry} onChange={(e) => setF({ ...f, expiry: e.target.value })} />
        </Field>
        <Field label="Site">
          <input className="form-control" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} />
        </Field>
        <Field label="Owner">
          <select className="form-control" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}>
            {STAFF.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Annual cost (KES)">
          <input className="form-control" type="number" value={f.annualCost} onChange={(e) => setF({ ...f, annualCost: Number(e.target.value) })} />
        </Field>
        <Field label="Conditions" span={3}>
          <input className="form-control" value={f.conditions} onChange={(e) => setF({ ...f, conditions: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};

export const PermitDrawer: React.FC<{ p: Permit; onClose: () => void; onEdit: () => void }> = ({ p, onClose, onEdit }) => {
  const { retirePermit, me, readOnly } = useControl();
  const [reason, setReason] = useState('');
  return (
    <Drawer wide title={p.name} subtitle={`${p.issuer} · ${p.number}`} onClose={onClose}>
      <DefList
        items={[
          ['Site', p.site],
          ['Owner', p.owner ?? '—'],
          ['Expires', `${fmtDate(p.expiry)} (${daysBetween(TODAY, p.expiry)} days)`],
          ['Annual cost', p.annualCost ? kes(p.annualCost) : '—'],
          ['Conditions', p.conditions ?? '—'],
          ['Reminders sent', (p.remindersSent ?? []).map((d) => `${d}-day`).join(', ') || 'None yet'],
          ['Status', p.retired ? 'Retired' : permitState(p).toLowerCase()]
        ]}
      />
      {!p.retired && (
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
            <Pencil size={14} /> Edit
          </button>
          <Field label="Reason to retire" span={4}>
            <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => retirePermit(p.id, reason).ok && onClose()}>
            <Archive size={14} /> Retire licence
          </button>
        </>
      )}
      <CustomFields entity="gov-permit" owner={`gov-permit:${p.id}`} by={me} readOnly={readOnly} />
      <Attachments owner={`gov-permit:${p.id}`} by={me} readOnly={readOnly} title="Certificate scans" />
      <h4 className="sx-subhead">History</h4>
      <Timeline items={p.history ?? []} />
    </Drawer>
  );
};

export const PermitToolbar: React.FC<{ onAdd: () => void }> = ({ onAdd }) => {
  const { state, sendPermitReminders } = useControl();
  return (
    <>
      <ExportCsvButton name="licence-register" header={['Licence', 'Issuer', 'Number', 'Site', 'Owner', 'Expiry', 'Annual cost', 'Status']} rows={() => state.permits.map((p) => [p.name, p.issuer, p.number, p.site, p.owner ?? '', p.expiry, p.annualCost ?? '', p.retired ? 'RETIRED' : permitState(p)])} />
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => sendPermitReminders()}>
        <BellRing size={15} /> Send expiry reminders
      </button>
      <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}>
        <Plus size={15} /> Add licence
      </button>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Test cases (implementation hub)                                      */
/* ------------------------------------------------------------------ */

export const TestCasesPanel: React.FC = () => {
  const { state, saveTestCase, runTestCase, setIct } = useControl();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ module: 'Finance', title: '', steps: '', expected: '' });
  const [run, setRun] = useState<{ id: string; actual: string } | null>(null);
  const last = (t: TestCase) => t.runs[t.runs.length - 1];
  const passed = state.testCases.filter((t) => last(t)?.result === 'PASS').length;
  return (
    <Panel
      title="Test cases"
      subtitle={`${passed} of ${state.testCases.length} passing on the last run · a failed run raises an ICT ticket`}
      action={
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={14} /> Test case
        </button>
      }
    >
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Case</th>
            <th className="sx-hide-sm">Module</th>
            <th>Last run</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.testCases.map((t) => (
            <tr key={t.id}>
              <td>
                <b className="sx-mono">{t.number}</b> {t.title}
                <small className="sx-muted sx-block">Expect: {t.expected}</small>
              </td>
              <td className="sx-hide-sm">{t.module}</td>
              <td>
                {last(t) ? <Pill status={last(t).result === 'PASS' ? 'POSTED' : 'REJECTED'} label={`${last(t).result} · ${fmtDate(last(t).at.slice(0, 10))}`} /> : <Pill status="DRAFT" label="Not run" />}
                {last(t)?.ticketId && (
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setIct('tickets', last(t).ticketId!)}>
                    ticket
                  </button>
                )}
              </td>
              <td>
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => setRun({ id: t.id, actual: '' })}>
                  <PlayCircle size={12} /> Run
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {run && (
        <Modal
          title={`Run ${state.testCases.find((t) => t.id === run.id)?.number}`}
          subtitle={state.testCases.find((t) => t.id === run.id)?.steps.join(' → ')}
          onClose={() => setRun(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => runTestCase(run.id, 'FAIL', run.actual).ok && setRun(null)}>
                <XCircle size={14} /> Fail
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => runTestCase(run.id, 'PASS', run.actual).ok && setRun(null)}>
                <CheckCircle2 size={14} /> Pass
              </button>
            </>
          }
        >
          <Field label="What actually happened" required span={4}>
            <textarea className="form-control" rows={3} value={run.actual} onChange={(e) => setRun({ ...run, actual: e.target.value })} />
          </Field>
        </Modal>
      )}
      {adding && (
        <Modal
          title="New test case"
          onClose={() => setAdding(false)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => saveTestCase({ module: f.module, title: f.title, expected: f.expected, steps: f.steps.split('\n') }).ok && setAdding(false)}>
              Save
            </button>
          }
        >
          <div className="sx-grid">
            <Field label="Module">
              <select className="form-control" value={f.module} onChange={(e) => setF({ ...f, module: e.target.value })}>
                {state.workstreams.map((w) => (
                  <option key={w.id}>{w.module}</option>
                ))}
              </select>
            </Field>
            <Field label="Title" required span={3}>
              <input className="form-control" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </Field>
            <Field label="Steps (one per line)" required span={4}>
              <textarea className="form-control" rows={3} value={f.steps} onChange={(e) => setF({ ...f, steps: e.target.value })} />
            </Field>
            <Field label="Expected result" required span={4}>
              <input className="form-control" value={f.expected} onChange={(e) => setF({ ...f, expected: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </Panel>
  );
};
