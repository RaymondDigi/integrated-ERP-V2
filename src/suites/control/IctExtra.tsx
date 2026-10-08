import React, { useMemo, useState } from 'react';
import { Activity, BookOpen, Boxes, CheckCircle2, Database, HardDrive, Network, Plus, Search, Server, ThumbsUp, TriangleAlert, Wrench, Plug, Tag } from 'lucide-react';
import { useControl } from './store';
import { metricUnit, readingState, simulatedReading, slaState } from './engine';
import { DEPARTMENTS, STAFF } from './data2';
import { fmtDate, TODAY } from '../finance/engine';
import type { Change, ConfigItem, Connector, ItAsset, KbArticle, MonitorRule, Problem, Ticket } from './types';
import { Chips, DataTable, DefList, Drawer, Field, Meter, Modal, Panel, Pill, SearchBox, Stat, SuitePage, Timeline, type Column } from '../ui/kit';
import { ExportCsvButton, ImportCsvButton, printDocument } from '../../platform/Widgets';
import { labelSheetHtml } from '../../platform/barcode';
import { usePrefs } from '../../platform/prefs';
import { useAuditTrail } from '../../platform/audit';
import { useCtlFocus } from './parts';

/* ------------------------------------------------------------------ */
/* Knowledge base (also shown under Workflows)                         */
/* ------------------------------------------------------------------ */

/** Articles that match a ticket's category or words in its title. */
export const suggestArticles = (kb: KbArticle[], t: Pick<Ticket, 'title' | 'category'>) => {
  const words = t.title.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  return kb
    .map((a) => ({ a, s: (a.category === t.category ? 2 : 0) + words.filter((w) => `${a.title} ${a.tags.join(' ')} ${a.body}`.toLowerCase().includes(w)).length }))
    .filter((x) => x.s >= 2)
    .sort((x, y) => y.s - x.s)
    .slice(0, 3)
    .map((x) => x.a);
};

export const KnowledgePage: React.FC<{ eyebrow?: string }> = ({ eyebrow = 'ICT' }) => {
  const { state, ict, saveArticle, rateArticle, viewArticle } = useControl();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id?: string; title: string; category: string; body: string; tags: string; note: string } | null>(null);
  useCtlFocus(ict.focus, (id) => state.kb.some((a) => a.id === id), setOpenId, () => setEdit({ title: '', category: 'ERP', body: '', tags: '', note: '' }));
  const cats = [...new Set(state.kb.map((a) => a.category))];
  const rows = state.kb.filter((a) => (cat === 'ALL' || a.category === cat) && (!q || `${a.title} ${a.body} ${a.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  const open = state.kb.find((a) => a.id === openId);
  const pick = (id: string) => {
    setOpenId(id);
    viewArticle(id);
  };
  return (
    <SuitePage
      eyebrow={eyebrow}
      title="Knowledge base"
      subtitle="Solutions to common problems, written by the people who fixed them. Anyone can edit (a wiki); every edit keeps the previous text."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit({ title: '', category: 'ERP', body: '', tags: '', note: '' })}>
          <Plus size={14} /> New article
        </button>
      }
    >
      <div className="sx-toolbar">
        <Chips value={cat} onChange={setCat} options={[{ value: 'ALL', label: 'All', count: state.kb.length }, ...cats.map((c) => ({ value: c, label: c, count: state.kb.filter((a) => a.category === c).length }))]} />
        <SearchBox value={q} onChange={setQ} placeholder="Search articles…" />
      </div>
      <div className="sx-row">
        {rows.map((a) => (
          <section key={a.id} className="sx-panel">
            <div className="sx-panel-head">
              <div>
                <h2>
                  <button type="button" className="sx-link" onClick={() => pick(a.id)}>
                    {a.title}
                  </button>
                </h2>
                <p>
                  {a.number} · {a.category} · {a.author} · updated {fmtDate(a.updated)}
                </p>
              </div>
            </div>
            <div className="sx-panel-body">
              <p className="sx-note">{a.body.slice(0, 140)}{a.body.length > 140 ? '…' : ''}</p>
              <small className="sx-muted">
                {a.views} views · {a.helpful} found it helpful · {a.tags.map((t) => `#${t}`).join(' ')}
              </small>
            </div>
          </section>
        ))}
        {!rows.length && <p className="sx-muted">No articles match.</p>}
      </div>
      {open && (
        <Drawer
          title={open.title}
          subtitle={`${open.number} · ${open.category}${open.fromTicket ? ` · from ${state.tickets.find((t) => t.id === open.fromTicket)?.number ?? 'a ticket'}` : ''}`}
          onClose={() => setOpenId(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => rateArticle(open.id)}>
                <ThumbsUp size={14} /> Helpful
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit({ id: open.id, title: open.title, category: open.category, body: open.body, tags: open.tags.join(', '), note: '' })}>
                Edit
              </button>
            </>
          }
        >
          <p style={{ whiteSpace: 'pre-wrap' }}>{open.body}</p>
          <DefList items={[['Tags', open.tags.join(', ') || '—'], ['Views', String(open.views)], ['Helpful', String(open.helpful)]]} />
          <h4 className="sx-subhead">Revisions</h4>
          <Timeline items={open.revisions.map((r) => ({ at: r.at, by: r.by, action: r.note, note: `Previous text: ${r.body.slice(0, 100)}…` }))} />
        </Drawer>
      )}
      {edit && (
        <Modal
          title={edit.id ? 'Edit article' : 'New article'}
          onClose={() => setEdit(null)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => saveArticle({ id: edit.id, title: edit.title, category: edit.category, body: edit.body, tags: edit.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean), note: edit.note }).ok && setEdit(null)}>
              Publish
            </button>
          }
        >
          <div className="sx-grid">
            <Field label="Title" required span={3}>
              <input className="form-control" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </Field>
            <Field label="Category">
              <select className="form-control" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                {['Hardware', 'Software', 'Network', 'Access', 'Email', 'ERP', 'How-to', 'Policy'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Solution" required span={4}>
              <textarea className="form-control" rows={6} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            </Field>
            <Field label="Tags" span={2} hint="Comma-separated">
              <input className="form-control" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} />
            </Field>
            {edit.id && (
              <Field label="What changed" span={2}>
                <input className="form-control" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
              </Field>
            )}
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

/** Knowledge links and suggestions inside a ticket. */
export const TicketKnowledge: React.FC<{ t: Ticket }> = ({ t }) => {
  const { state, linkKb, saveArticle, setIct } = useControl();
  const linked = state.kb.filter((a) => (t.kbIds ?? []).includes(a.id));
  const suggested = suggestArticles(state.kb, t).filter((a) => !(t.kbIds ?? []).includes(a.id));
  return (
    <>
      <h4 className="sx-subhead">
        <BookOpen size={14} /> Knowledge
      </h4>
      <ul className="sx-facts">
        {linked.map((a) => (
          <li key={a.id}>
            <span>
              <button type="button" className="sx-link" onClick={() => setIct('knowledge', a.id)}>
                {a.number}
              </button>{' '}
              {a.title}
            </span>
            <b>linked</b>
          </li>
        ))}
        {suggested.map((a) => (
          <li key={a.id}>
            <span>
              Suggested: {a.title} <small className="sx-muted">({a.helpful} helpful)</small>
            </span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => linkKb(t.id, a.id)}>
              Link
            </button>
          </li>
        ))}
        {!linked.length && !suggested.length && <li className="sx-muted">No matching articles.</li>}
      </ul>
      {t.status === 'RESOLVED' && t.resolution && !state.kb.some((a) => a.fromTicket === t.id) && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => saveArticle({ title: t.title, category: t.category, body: `Problem: ${t.title}\n\nFix: ${t.resolution}`, tags: [t.category.toLowerCase()], fromTicket: t.id })}>
          <BookOpen size={14} /> Save the fix as an article
        </button>
      )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Problems                                                            */
/* ------------------------------------------------------------------ */

const PB_PILL: Record<Problem['status'], [string, string]> = { OPEN: ['OPEN', 'Investigating'], KNOWN_ERROR: ['SUBMITTED', 'Known error'], RESOLVED: ['POSTED', 'Resolved'] };

export const ProblemsPage: React.FC = () => {
  const { state, ict, raiseProblem, updateProblem, linkProblemTicket, resolveProblem, setIct } = useControl();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: '', description: '', ticketIds: [] as string[], ciIds: [] as string[] });
  const [rc, setRc] = useState({ rootCause: '', workaround: '' });
  const [link, setLink] = useState('');
  useCtlFocus(ict.focus, (id) => state.problems.some((p) => p.id === id), setOpenId, () => setAdding(true));
  const open = state.problems.find((p) => p.id === openId);
  /* Recurring incidents: same category and similar title, not yet linked to a problem */
  const recurring = useMemo(() => {
    const m = new Map<string, Ticket[]>();
    state.tickets.filter((t) => !t.problemId).forEach((t) => m.set(t.category, [...(m.get(t.category) ?? []), t]));
    return [...m.entries()].filter(([, v]) => v.length >= 2);
  }, [state.tickets]);
  const columns: Column<Problem>[] = [
    { key: 'n', header: 'Problem', render: (p) => <b className="sx-mono">{p.number}</b>, width: 130 },
    {
      key: 't',
      header: 'Title',
      render: (p) => (
        <div className="sx-cell-main">
          <span>{p.title}</span>
          <small>
            {p.ticketIds.length} incidents · {p.owner}
          </small>
        </div>
      )
    },
    { key: 's', header: 'Status', render: (p) => <Pill status={PB_PILL[p.status][0]} label={PB_PILL[p.status][1]} /> }
  ];
  return (
    <SuitePage
      eyebrow="Service desk"
      title="Problem management"
      subtitle="The underlying cause behind repeat incidents. Publish a workaround (known error) straight away; resolve once the root cause is fixed and every linked incident is closed."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={14} /> Raise a problem
        </button>
      }
    >
      {recurring.length > 0 && (
        <div className="sx-callout warn">
          <TriangleAlert size={16} />
          <div>
            <b>Possible problems</b>
            <span>{recurring.map(([c, v]) => `${v.length} ${c} incidents not linked to a problem`).join(' · ')}</span>
          </div>
        </div>
      )}
      <DataTable rows={state.problems} columns={columns} rowKey={(p) => p.id} onRowClick={(p) => (setOpenId(p.id), setRc({ rootCause: p.rootCause, workaround: p.workaround }))} selected={openId} />
      {open && (
        <Drawer title={open.number} subtitle={open.title} badge={<Pill status={PB_PILL[open.status][0]} label={PB_PILL[open.status][1]} />} onClose={() => setOpenId(null)}>
          <p className="sx-note">{open.description}</p>
          <h4 className="sx-subhead">Linked incidents</h4>
          <ul className="sx-facts">
            {open.ticketIds.map((id) => {
              const t = state.tickets.find((x) => x.id === id);
              return t ? (
                <li key={id}>
                  <span>
                    <button type="button" className="sx-link" onClick={() => setIct('tickets', id)}>
                      {t.number}
                    </button>{' '}
                    {t.title}
                  </span>
                  <b>{t.status.toLowerCase().replace('_', ' ')}</b>
                </li>
              ) : null;
            })}
          </ul>
          {open.status !== 'RESOLVED' && (
            <div className="sx-inline-form">
              <select className="form-control" value={link} onChange={(e) => setLink(e.target.value)} aria-label="Incident to link">
                <option value="">Link another incident…</option>
                {state.tickets
                  .filter((t) => !open.ticketIds.includes(t.id))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.number} · {t.title}
                    </option>
                  ))}
              </select>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => link && linkProblemTicket(open.id, link).ok && setLink('')}>
                Link
              </button>
            </div>
          )}
          <DefList items={[['Configuration items', open.ciIds.map((id) => state.cis.find((c) => c.id === id)?.name).filter(Boolean).join(', ') || '—']]} />
          <Field label="Workaround" span={4}>
            <textarea className="form-control" rows={2} value={rc.workaround} disabled={open.status === 'RESOLVED'} onChange={(e) => setRc({ ...rc, workaround: e.target.value })} />
          </Field>
          <Field label="Root cause" span={4}>
            <textarea className="form-control" rows={2} value={rc.rootCause} disabled={open.status === 'RESOLVED'} onChange={(e) => setRc({ ...rc, rootCause: e.target.value })} />
          </Field>
          {open.status !== 'RESOLVED' && (
            <div className="sx-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateProblem(open.id, rc)}>
                Save
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => resolveProblem(open.id)}>
                <CheckCircle2 size={14} /> Resolve problem
              </button>
            </div>
          )}
          <h4 className="sx-subhead">History</h4>
          <Timeline items={open.history} />
        </Drawer>
      )}
      {adding && (
        <Modal title="Raise a problem" onClose={() => setAdding(false)} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => raiseProblem(f).ok && setAdding(false)}>Raise</button>}>
          <div className="sx-grid sx-grid-2">
            <Field label="Title" required span={2}>
              <input className="form-control" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            </Field>
            <Field label="Description" span={2}>
              <textarea className="form-control" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
            <Field label="Incidents" required span={2} hint="Hold Ctrl to choose several">
              <select className="form-control" multiple size={5} value={f.ticketIds} onChange={(e) => setF({ ...f, ticketIds: [...e.target.selectedOptions].map((o) => o.value) })}>
                {state.tickets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.number} · {t.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Configuration items" span={2}>
              <select className="form-control" multiple size={4} value={f.ciIds} onChange={(e) => setF({ ...f, ciIds: [...e.target.selectedOptions].map((o) => o.value) })}>
                {state.cis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* CMDB                                                                */
/* ------------------------------------------------------------------ */

const CI_ICON: Record<ConfigItem['kind'], React.ReactNode> = { Server: <Server size={14} />, Network: <Network size={14} />, Application: <Boxes size={14} />, Database: <Database size={14} />, Service: <Plug size={14} />, Endpoint: <HardDrive size={14} /> };

export const CmdbPage: React.FC = () => {
  const { state, saveCi, importDiscovery, setIct } = useControl();
  const [group, setGroup] = useState<'businessSystem' | 'location' | 'kind'>('businessSystem');
  const [openId, setOpenId] = useState<string | null>(null);
  const [edit, setEdit] = useState<(Omit<ConfigItem, 'id' | 'source'> & { id?: string }) | null>(null);
  const groups = [...new Set(state.cis.map((c) => c[group]))].sort();
  const open = state.cis.find((c) => c.id === openId);
  const dependants = (id: string) => state.cis.filter((c) => c.dependsOn.includes(id));
  /* Everything that stops if this item fails, following dependencies */
  const impact = (id: string, seen = new Set<string>()): ConfigItem[] => {
    dependants(id).forEach((d) => {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        impact(d.id, seen);
      }
    });
    return state.cis.filter((c) => seen.has(c.id));
  };
  return (
    <SuitePage
      eyebrow="ICT"
      title="Configuration management (CMDB)"
      subtitle="Servers, network, applications, databases and services with their owners, locations and dependencies. Auto-discovery is simulated: import the scanner's CSV export."
      actions={
        <>
          <ExportCsvButton name="cmdb" header={['name', 'kind', 'location', 'owner', 'businessSystem', 'ip', 'dependsOn', 'status', 'source']} rows={() => state.cis.map((c) => [c.name, c.kind, c.location, c.owner, c.businessSystem, c.ip ?? '', c.dependsOn.map((d) => state.cis.find((x) => x.id === d)?.name).join('; '), c.status, c.source])} />
          <ImportCsvButton label="Import discovery CSV" template={['name', 'kind', 'location', 'owner', 'businessSystem', 'ip']} onImport={importDiscovery} />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEdit({ name: '', kind: 'Server', location: 'Nairobi server room', owner: '', businessSystem: 'ERP', dependsOn: [], status: 'LIVE' })}>
            <Plus size={14} /> Add item
          </button>
        </>
      }
    >
      <div className="sx-toolbar">
        <Chips value={group} onChange={setGroup} options={[{ value: 'businessSystem', label: 'By business system' }, { value: 'location', label: 'By location' }, { value: 'kind', label: 'By type' }]} />
      </div>
      <div className="sx-row">
        {groups.map((g) => (
          <Panel key={g} title={g} subtitle={`${state.cis.filter((c) => c[group] === g).length} items`}>
            <ul className="sx-facts">
              {state.cis
                .filter((c) => c[group] === g)
                .map((c) => (
                  <li key={c.id}>
                    <span>
                      {CI_ICON[c.kind]}{' '}
                      <button type="button" className="sx-link" onClick={() => setOpenId(c.id)}>
                        {c.name}
                      </button>{' '}
                      <small className="sx-muted">
                        {c.kind} · {c.owner}
                        {c.source === 'DISCOVERY' ? ' · discovered' : ''}
                      </small>
                    </span>
                    <Pill status={c.status === 'LIVE' ? 'POSTED' : c.status === 'PLANNED' ? 'DRAFT' : 'VOID'} label={c.status.toLowerCase()} />
                  </li>
                ))}
            </ul>
          </Panel>
        ))}
      </div>
      {open && (
        <Drawer
          title={open.name}
          subtitle={`${open.kind} · ${open.businessSystem}`}
          onClose={() => setOpenId(null)}
          footer={
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEdit({ ...open })}>
              Edit
            </button>
          }
        >
          <DefList items={[['Location', open.location], ['Owner', open.owner], ['IP address', open.ip ?? '—'], ['Asset', state.assets.find((a) => a.id === open.assetId)?.tag ?? '—'], ['Source', open.source.toLowerCase()]]} />
          <h4 className="sx-subhead">Depends on</h4>
          <p className="sx-note">{open.dependsOn.map((d) => state.cis.find((x) => x.id === d)?.name).join(', ') || 'Nothing'}</p>
          <h4 className="sx-subhead">If this fails, these are affected</h4>
          <p className="sx-note">{impact(open.id).map((c) => c.name).join(', ') || 'Nothing depends on it'}</p>
          <h4 className="sx-subhead">Linked tickets, problems and changes</h4>
          <ul className="sx-facts">
            {state.tickets.filter((t) => t.ciIds?.includes(open.id)).map((t) => (
              <li key={t.id}>
                <span>
                  <button type="button" className="sx-link" onClick={() => setIct('tickets', t.id)}>
                    {t.number}
                  </button>{' '}
                  {t.title}
                </span>
                <b>ticket</b>
              </li>
            ))}
            {state.problems.filter((p) => p.ciIds.includes(open.id)).map((p) => (
              <li key={p.id}>
                <span>
                  {p.number} {p.title}
                </span>
                <b>problem</b>
              </li>
            ))}
            {state.changes.filter((c) => c.ciIds?.includes(open.id)).map((c) => (
              <li key={c.id}>
                <span>
                  {c.number} {c.title}
                </span>
                <b>change</b>
              </li>
            ))}
          </ul>
        </Drawer>
      )}
      {edit && (
        <Modal title={edit.id ? `Edit ${edit.name}` : 'Add a configuration item'} onClose={() => setEdit(null)} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => saveCi(edit).ok && setEdit(null)}>Save</button>}>
          <div className="sx-grid">
            <Field label="Name" required span={2}>
              <input className="form-control" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Type">
              <select className="form-control" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as ConfigItem['kind'] })}>
                {Object.keys(CI_ICON).map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select className="form-control" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as ConfigItem['status'] })}>
                {['LIVE', 'PLANNED', 'RETIRED'].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
            <Field label="Business system" required>
              <input className="form-control" value={edit.businessSystem} onChange={(e) => setEdit({ ...edit, businessSystem: e.target.value })} />
            </Field>
            <Field label="Location">
              <input className="form-control" value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} />
            </Field>
            <Field label="Owner" required>
              <input className="form-control" list="ci-staff" value={edit.owner} onChange={(e) => setEdit({ ...edit, owner: e.target.value })} />
              <datalist id="ci-staff">
                {STAFF.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
            <Field label="IP address">
              <input className="form-control" value={edit.ip ?? ''} onChange={(e) => setEdit({ ...edit, ip: e.target.value })} />
            </Field>
            <Field label="Linked asset" span={2}>
              <select className="form-control" value={edit.assetId ?? ''} onChange={(e) => setEdit({ ...edit, assetId: e.target.value || undefined })}>
                <option value="">—</option>
                {state.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tag} · {a.model}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Depends on" span={2}>
              <select className="form-control" multiple size={4} value={edit.dependsOn} onChange={(e) => setEdit({ ...edit, dependsOn: [...e.target.selectedOptions].map((o) => o.value) })}>
                {state.cis
                  .filter((c) => c.id !== edit.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Monitoring and event correlation                                    */
/* ------------------------------------------------------------------ */

/** Application health computed from what the ERP itself is doing right now. */
export const useErpHealth = () => {
  const { state } = useControl();
  const trail = useAuditTrail();
  const failedSyncs = state.syncLog.filter((l) => l.status !== 'OK');
  const degraded = state.connectors.filter((c) => c.status !== 'CONNECTED');
  const breaches = state.tickets.filter((t) => t.status !== 'RESOLVED' && slaState(t).resolveBreached);
  const p1 = state.tickets.filter((t) => t.status !== 'RESOLVED' && t.priority === 'P1');
  const lastAction = trail[0]?.at;
  const score = Math.max(0, 100 - failedSyncs.length * 6 - degraded.length * 8 - breaches.length * 5 - p1.length * 10);
  return { score, failedSyncs, degraded, breaches, p1, lastAction, changes: trail.length };
};

export const ErpHealthPanel: React.FC = () => {
  const h = useErpHealth();
  return (
    <Panel title="ERP application health" subtitle="Computed live from integrations, the service desk and the audit trail">
      <div className="sx-stats">
        <Stat label="Health score" value={`${h.score}/100`} icon={<Activity size={17} />} tone={h.score >= 80 ? 'green' : h.score >= 60 ? 'gold' : 'red'} />
        <Stat label="Failed or warning syncs" value={h.failedSyncs.length} detail={`${h.degraded.length} connections not healthy`} icon={<Plug size={17} />} tone={h.failedSyncs.length ? 'red' : 'green'} />
        <Stat label="Tickets past SLA" value={h.breaches.length} detail={`${h.p1.length} open P1`} icon={<TriangleAlert size={17} />} tone={h.breaches.length ? 'red' : 'green'} />
        <Stat label="Recorded changes" value={h.changes} detail={h.lastAction ? `last at ${h.lastAction}` : 'none this session'} icon={<CheckCircle2 size={17} />} tone="blue" />
      </div>
    </Panel>
  );
};

/** Backup and storage status. There are no backup or storage agents in this build, so the figures are simulated. */
export const BackupStoragePanel: React.FC = () => {
  const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const backups = [
    { job: 'ERP database — nightly full', last: days(0), result: 'OK', size: '18.4 GB', target: 'Synology NAS + Backblaze' },
    { job: 'File shares — hourly incremental', last: days(0), result: 'OK', size: '1.2 GB', target: 'Synology NAS' },
    { job: 'Restore test (quarterly)', last: days(74), result: 'OK', size: '—', target: 'DR instance, Mombasa' }
  ];
  const vols = [
    { name: 'ERP data (D:)', used: 612, size: 1000 },
    { name: 'Backup NAS volume 1', used: 3_280, size: 4_000 },
    { name: 'File server (E:)', used: 1_710, size: 2_000 }
  ];
  return (
    <Panel title="Backup, DR and storage (simulated)" subtitle="No backup or storage agent is connected in this build — figures illustrate the checks a real agent feeds">
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Job</th>
            <th>Last run</th>
            <th>Result</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          {backups.map((b) => (
            <tr key={b.job}>
              <td>{b.job}</td>
              <td>{b.last}</td>
              <td>
                <Pill status={b.result === 'OK' ? 'POSTED' : 'REJECTED'} label={b.result} />
              </td>
              <td>{b.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="sx-facts">
        {vols.map((v) => (
          <li key={v.name}>
            <span>
              {v.name} <small className="sx-muted">{v.used} of {v.size} GB</small>
            </span>
            <div className="sx-meter-cell" style={{ minWidth: 160 }}>
              <Meter value={v.used / v.size} tone={v.used / v.size > 0.85 ? 'red' : v.used / v.size > 0.75 ? 'gold' : 'green'} />
              <small className={v.used / v.size > 0.85 ? 'sx-danger-text' : ''}>{Math.round((v.used / v.size) * 100)}%</small>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
};

export const MonitoringPage: React.FC = () => {
  const { state, saveMonitorRule, actor } = useControl();
  const trail = useAuditTrail();
  const [tick, setTick] = useState(() => Date.now());
  const [rule, setRule] = useState<Omit<MonitorRule, 'id'>>({ metric: 'CPU', target: state.cis[0]?.name ?? '', warn: 70, critical: 90 });
  const readings = state.monitorRules.map((r) => ({ r, v: simulatedReading(r, tick) }));
  const hist = (r: MonitorRule) => Array.from({ length: 12 }, (_, i) => simulatedReading(r, tick - (11 - i) * 3_600_000));
  /* Event correlation: one list of everything that went wrong, from every source */
  const events = [
    ...readings.filter((x) => readingState(x.r, x.v) !== 'OK').map((x) => ({ at: 'now', source: 'Monitoring', sev: readingState(x.r, x.v), text: `${x.r.metric} ${x.v}${metricUnit(x.r.metric)} on ${x.r.target} (limit ${x.r.critical})`, target: x.r.target })),
    ...state.syncLog.filter((l) => l.status !== 'OK').map((l) => ({ at: l.at.replace('T', ' ').slice(0, 16), source: 'Integrations', sev: l.status === 'FAIL' ? 'CRITICAL' : 'WARNING', text: `${state.connectors.find((c) => c.id === l.connectorId)?.name}: ${l.message}`, target: state.connectors.find((c) => c.id === l.connectorId)?.name ?? '' })),
    ...state.tickets.filter((t) => t.status !== 'RESOLVED' && slaState(t).resolveBreached).map((t) => ({ at: t.created.replace('T', ' ').slice(0, 16), source: 'Service desk', sev: t.priority === 'P1' ? 'CRITICAL' : 'WARNING', text: `${t.number} past SLA: ${t.title}`, target: t.title })),
    ...trail.filter((e) => /reject|fail|denied|locked/i.test(e.action)).slice(0, 10).map((e) => ({ at: e.at, source: `Audit · ${e.module}`, sev: 'WARNING', text: `${e.action}${e.ref ? ` — ${e.ref}` : ''} by ${e.by}`, target: e.ref ?? '' }))
  ];
  /* Correlated: events from different sources that mention the same target (e.g. VPN latency + VPN tickets) */
  const correlated = state.cis.filter((c) => new Set(events.filter((e) => e.target.toLowerCase().includes(c.name.toLowerCase().split(' ')[0]) || e.text.toLowerCase().includes(c.name.toLowerCase())).map((e) => e.source)).size >= 2);
  return (
    <SuitePage
      eyebrow="ICT"
      title="Monitoring and events"
      subtitle="Threshold rules on servers and links, with one correlated list of events from monitoring, integrations, the service desk and the audit trail. Telemetry is simulated in this build."
      actions={
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTick(Date.now())}>
          <Activity size={14} /> Refresh readings
        </button>
      }
    >
      <ErpHealthPanel />
      {correlated.length > 0 && (
        <div className="sx-callout danger">
          <TriangleAlert size={16} />
          <div>
            <b>Correlated events</b>
            <span>{correlated.map((c) => c.name).join(', ')} — alerts from more than one source point at the same item.</span>
          </div>
        </div>
      )}
      <Panel title="Threshold monitoring (simulated readings)" subtitle="Last 12 hours">
        <table className="sx-mini-table">
          <thead>
            <tr>
              <th>Target</th>
              <th>Metric</th>
              <th>Now</th>
              <th className="sx-hide-sm">Trend</th>
              <th>Warn / critical</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {readings.map(({ r, v }) => {
              const s = readingState(r, v);
              const h = hist(r);
              const max = Math.max(r.critical, ...h);
              return (
                <tr key={r.id}>
                  <td>{r.target}</td>
                  <td>{r.metric}</td>
                  <td>
                    <b>
                      {v}
                      {metricUnit(r.metric)}
                    </b>
                  </td>
                  <td className="sx-hide-sm">
                    <svg width="120" height="24" aria-label="trend">
                      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={h.map((x, i) => `${i * 10},${24 - (x / max) * 22}`).join(' ')} />
                      <line x1="0" x2="120" y1={24 - (r.critical / max) * 22} y2={24 - (r.critical / max) * 22} stroke="#c9573f" strokeDasharray="3 3" />
                    </svg>
                  </td>
                  <td>
                    {r.warn} / {r.critical}
                    {metricUnit(r.metric)}
                  </td>
                  <td>
                    <Pill status={s === 'CRITICAL' ? 'REJECTED' : s === 'WARNING' ? 'SUBMITTED' : 'POSTED'} label={s.toLowerCase()} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="sx-inline-form">
          <select className="form-control" value={rule.metric} onChange={(e) => setRule({ ...rule, metric: e.target.value as MonitorRule['metric'] })} aria-label="Metric">
            {['CPU', 'MEMORY', 'DISK', 'LATENCY', 'PACKET_LOSS'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select className="form-control" value={rule.target} onChange={(e) => setRule({ ...rule, target: e.target.value })} aria-label="Target">
            {state.cis.map((c) => (
              <option key={c.id}>{c.name}</option>
            ))}
          </select>
          <input className="form-control" style={{ maxWidth: 90 }} type="number" value={rule.warn} onChange={(e) => setRule({ ...rule, warn: Number(e.target.value) })} aria-label="Warning" />
          <input className="form-control" style={{ maxWidth: 90 }} type="number" value={rule.critical} onChange={(e) => setRule({ ...rule, critical: Number(e.target.value) })} aria-label="Critical" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => saveMonitorRule(rule)} title={actor.role.startsWith('ICT') ? '' : 'ICT sets thresholds'}>
            <Plus size={14} /> Add threshold
          </button>
        </div>
      </Panel>
      <Panel title={`Events (${events.length})`} subtitle="Everything that needs attention, from every source">
        <ul className="sx-acts">
          {events.map((e, i) => (
            <li key={i} className={e.sev === 'CRITICAL' ? 'late' : ''}>
              <Pill status={e.sev === 'CRITICAL' ? 'REJECTED' : 'SUBMITTED'} label={e.sev.toLowerCase()} />
              <div>
                <b>{e.text}</b>
                <small>
                  {e.source} · {e.at}
                </small>
              </div>
            </li>
          ))}
          {!events.length && <li className="sx-muted">No events.</li>}
        </ul>
      </Panel>
      <BackupStoragePanel />
    </SuitePage>
  );
};

/* ------------------------------------------------------------------ */
/* Forms used on the existing ICT pages                                */
/* ------------------------------------------------------------------ */

export const AssetFormModal: React.FC<{ asset?: ItAsset; onClose: () => void }> = ({ asset, onClose }) => {
  const { saveAsset } = useControl();
  const [f, setF] = useState<Omit<ItAsset, 'id' | 'history'> & { id?: string }>(
    asset ?? { tag: '', type: 'Laptop', model: '', assignedTo: 'Spare pool', department: 'ICT', purchased: TODAY, warrantyEnd: '', status: 'SPARE', serial: '', cpu: '', ram: '', os: '', location: 'Nairobi head office' }
  );
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  return (
    <Modal title={asset ? `Edit ${asset.tag}` : 'Register an asset'} onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => saveAsset(f).ok && onClose()}>Save asset</button>}>
      <div className="sx-grid">
        <Field label="Asset tag" required>
          <input className="form-control" value={f.tag} onChange={(e) => set('tag', e.target.value)} placeholder="IT-0601" />
        </Field>
        <Field label="Type">
          <select className="form-control" value={f.type} onChange={(e) => set('type', e.target.value)}>
            {['Laptop', 'Desktop', 'Server', 'Printer', 'Network', 'Phone'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Model" required span={2}>
          <input className="form-control" value={f.model} onChange={(e) => set('model', e.target.value)} />
        </Field>
        <Field label="Serial number">
          <input className="form-control" value={f.serial ?? ''} onChange={(e) => set('serial', e.target.value)} />
        </Field>
        <Field label="CPU">
          <input className="form-control" value={f.cpu ?? ''} onChange={(e) => set('cpu', e.target.value)} />
        </Field>
        <Field label="RAM">
          <input className="form-control" value={f.ram ?? ''} onChange={(e) => set('ram', e.target.value)} />
        </Field>
        <Field label="Operating system">
          <input className="form-control" value={f.os ?? ''} onChange={(e) => set('os', e.target.value)} />
        </Field>
        <Field label="Location">
          <input className="form-control" value={f.location ?? ''} onChange={(e) => set('location', e.target.value)} />
        </Field>
        <Field label="Status">
          <select className="form-control" value={f.status} onChange={(e) => set('status', e.target.value)}>
            {['IN_USE', 'SPARE', 'REPAIR'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Purchased">
          <input className="form-control" type="date" value={f.purchased} onChange={(e) => set('purchased', e.target.value)} />
        </Field>
        <Field label="Warranty ends">
          <input className="form-control" type="date" value={f.warrantyEnd} onChange={(e) => set('warrantyEnd', e.target.value)} />
        </Field>
        <Field label="Assigned to">
          <input className="form-control" value={f.assignedTo} onChange={(e) => set('assignedTo', e.target.value)} />
        </Field>
        <Field label="Department">
          <select className="form-control" value={f.department} onChange={(e) => set('department', e.target.value)}>
            {DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
};

/** Print barcode labels for the given assets on the user's preferred label printer. */
export const AssetLabelsButton: React.FC<{ assets: ItAsset[] }> = ({ assets }) => {
  const prefs = usePrefs();
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => printDocument('Asset labels', labelSheetHtml('IT asset labels', assets.map((a) => ({ code: a.tag, line1: `${a.tag} · ${a.model}`, line2: `${a.assignedTo} · ${a.department}` })), prefs.printer))}>
      <Tag size={14} /> Print labels
    </button>
  );
};

export const ChangeFormModal: React.FC<{ onClose: () => void; onDone?: (id: string) => void }> = ({ onClose, onDone }) => {
  const { state, createChange } = useControl();
  const [f, setF] = useState({ title: '', system: '', risk: 'MEDIUM' as Change['risk'], window: '', backout: '', type: 'NORMAL' as NonNullable<Change['type']>, description: '', ciIds: [] as string[] });
  return (
    <Modal
      title="Raise a change"
      subtitle="Standard changes are pre-approved; normal and emergency changes go to the change board under the approval rules."
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const r = createChange(f);
            if (r.ok) {
              onClose();
              if (r.id) onDone?.(r.id);
            }
          }}
        >
          Submit change
        </button>
      }
    >
      <div className="sx-grid">
        <Field label="Title" required span={4}>
          <input className="form-control" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className="form-control" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}>
            <option value="STANDARD">Standard (pre-approved)</option>
            <option value="NORMAL">Normal</option>
            <option value="EMERGENCY">Emergency</option>
          </select>
        </Field>
        <Field label="Risk">
          <select className="form-control" value={f.risk} onChange={(e) => setF({ ...f, risk: e.target.value as Change['risk'] })}>
            {['LOW', 'MEDIUM', 'HIGH'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="System" required span={2}>
          <input className="form-control" value={f.system} onChange={(e) => setF({ ...f, system: e.target.value })} />
        </Field>
        <Field label="Change window" required span={2}>
          <input className="form-control" value={f.window} onChange={(e) => setF({ ...f, window: e.target.value })} placeholder="Sat 20:00–22:00" />
        </Field>
        <Field label="Configuration items" span={2}>
          <select className="form-control" multiple size={3} value={f.ciIds} onChange={(e) => setF({ ...f, ciIds: [...e.target.selectedOptions].map((o) => o.value) })}>
            {state.cis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What and why" span={4}>
          <textarea className="form-control" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Back-out plan" required span={4}>
          <textarea className="form-control" rows={2} value={f.backout} onChange={(e) => setF({ ...f, backout: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};

export const CONNECTOR_KINDS = ['REST API', 'MS-SQL Server', 'SAP S/4HANA (OData)', 'IBM Informix (ODBC)', 'SFTP file drop', 'Weighbridge (serial/TCP)', 'Email (SMTP/IMAP)'];

export const ConnectorFormModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addConnector } = useControl();
  const [f, setF] = useState<Pick<Connector, 'name' | 'provider' | 'purpose' | 'module' | 'schedule' | 'kind' | 'endpoint'>>({ name: '', provider: '', purpose: '', module: 'Finance', schedule: 'Daily 06:00', kind: 'MS-SQL Server', endpoint: '' });
  return (
    <Modal title="Add a connection" subtitle="Simulated in this build: the connection is recorded and can be tested and paused, but no data leaves the browser." onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => addConnector(f).ok && onClose()}>Add connection</button>}>
      <div className="sx-grid sx-grid-2">
        <Field label="Name" required>
          <input className="form-control" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Legacy tea stock DB" />
        </Field>
        <Field label="Technology">
          <select className="form-control" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {CONNECTOR_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="Provider / system" required>
          <input className="form-control" value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} />
        </Field>
        <Field label="Endpoint" required hint="URL, server\instance or DSN">
          <input className="form-control" value={f.endpoint ?? ''} onChange={(e) => setF({ ...f, endpoint: e.target.value })} placeholder="sql01.local\\TEA" />
        </Field>
        <Field label="Used by">
          <select className="form-control" value={f.module} onChange={(e) => setF({ ...f, module: e.target.value })}>
            {['Finance', 'People & Payroll', 'Procurement', 'Trading', 'Warehousing', 'Platform'].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Schedule">
          <input className="form-control" value={f.schedule} onChange={(e) => setF({ ...f, schedule: e.target.value })} />
        </Field>
        <Field label="Purpose" span={2}>
          <input className="form-control" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
};

export { Search, Wrench };
