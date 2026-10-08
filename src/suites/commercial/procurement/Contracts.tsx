import React, { useEffect, useState } from 'react';
import { CalendarClock, FilePlus2, FileSignature, Lock, Plus, ScrollText, ShieldAlert } from 'lucide-react';
import { useCommercial } from '../store';
import { addDays, fmtDate, kes, TODAY } from '../../finance/engine';
import { Attachments, ExportCsvButton, PrintButton, SignModal } from '../../../platform/Widgets';
import { DataTable, DefList, Drawer, Empty, Field, Meter, Modal, Pill, SearchBox, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { PartySelect } from '../parts';
import { useProcurementExt } from './ext/store';
import { contractsExpiring, contractUtilisation } from './ext/engine';
import { DiffView, docHtml, ReadOnlyNote, Tabs, TONE } from './ext/ui';
import type { ContractDraft } from './ext/actions/contracts';
import type { Contract, ContractItem, ContractSite, ContractType } from './ext/types';

const TYPES: ContractType[] = ['FRAMEWORK', 'LTA', 'SERVICE', 'PRODUCT', 'MASTER'];
const TYPE_LABEL: Record<ContractType, string> = { FRAMEWORK: 'Framework agreement', LTA: 'Long-term agreement (LTA)', SERVICE: 'Service contract (SLA)', PRODUCT: 'Product supply', MASTER: 'Master agreement' };
const shownStatus = (c: Contract) => (c.status === 'ACTIVE' && c.end < TODAY ? 'EXPIRED' : c.status);

type CFilter = 'ALL' | 'DRAFT' | 'APPROVAL' | 'ACTIVE' | 'EXPIRING' | 'ENDED';

export const ContractsPage: React.FC = () => {
  const ext = useProcurementExt();
  const { party, actor, state } = useCommercial();
  const [tab, setTab] = useState<'contracts' | 'templates' | 'clauses'>('contracts');
  const [filter, setFilter] = useState<CFilter>('ALL');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (ext.page?.focus === 'new') setCreating(true);
    else if (ext.page?.focus) setOpenId(ext.page.focus);
  }, [ext.page]);
  const mgmt = actor.role === 'MANAGER' || actor.role === 'DIRECTOR';
  const visible = ext.state.contracts.filter((c) => c.access !== 'MANAGEMENT' || mgmt);
  const expiring = contractsExpiring(visible, ext.state.settings.contractAlertDays);
  const match = (c: Contract, f: CFilter) =>
    f === 'ALL' ||
    (f === 'DRAFT' && c.status === 'DRAFT') ||
    (f === 'APPROVAL' && c.status === 'APPROVAL') ||
    (f === 'ACTIVE' && shownStatus(c) === 'ACTIVE') ||
    (f === 'EXPIRING' && expiring.some((x) => x.c.id === c.id)) ||
    (f === 'ENDED' && ['EXPIRED', 'TERMINATED'].includes(shownStatus(c)));
  const rows = visible.filter((c) => match(c, filter)).filter((c) => !q || `${c.number} ${c.title} ${party(c.supplierId)?.name} ${Object.values(c.customFields).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const count = (f: CFilter) => visible.filter((c) => match(c, f)).length;
  const columns: Column<Contract>[] = [
    { key: 'n', header: 'Contract', render: (c) => <b className="sx-mono">{c.number}</b>, sort: (c) => c.number, width: 120 },
    { key: 't', header: 'Title', render: (c) => <div className="sx-cell-main"><span>{c.title}</span><small>{party(c.supplierId)?.name} · {TYPE_LABEL[c.type]}</small></div>, sort: (c) => c.title },
    { key: 'e', header: 'Ends', render: (c) => <span className={c.end <= addDays(TODAY, ext.state.settings.contractAlertDays) && c.status === 'ACTIVE' ? 'sx-danger-text' : ''}>{fmtDate(c.end)}</span>, sort: (c) => c.end, hideOnMobile: true },
    {
      key: 'u',
      header: 'Used',
      render: (c) => {
        const u = contractUtilisation(c, state.purchaseOrders);
        return (
          <div className="sx-meter-cell">
            <Meter value={u.used} tone={u.used > 0.9 ? 'red' : u.used > 0.7 ? 'gold' : 'green'} />
            <small>{Math.round(u.used * 100)}%</small>
          </div>
        );
      },
      hideOnMobile: true,
      width: 140
    },
    { key: 'v', header: 'Value cap', render: (c) => kes(c.valueCap, { compact: true }), sort: (c) => c.valueCap, align: 'right' },
    { key: 's', header: 'Status', render: (c) => <Pill status={TONE[shownStatus(c)]} label={c.archived ? 'Archived' : shownStatus(c) === 'APPROVAL' ? (ext.contracts.fullyApproved(c) ? 'To sign' : 'In approval') : shownStatus(c).toLowerCase()} />, sort: (c) => c.status }
  ];
  const current = visible.find((c) => c.id === openId);
  return (
    <SuitePage
      eyebrow="Contracts"
      title="Contracts & agreements"
      subtitle="Framework agreements, LTAs and service contracts: one repository with versions, approvals, e-signatures and utilisation."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <FilePlus2 size={15} /> New contract
        </button>
      }
    >
      <ReadOnlyNote show={ext.readOnly} />
      <div className="sx-stats">
        <Stat label="Active" value={count('ACTIVE')} detail={kes(visible.filter((c) => shownStatus(c) === 'ACTIVE').reduce((s, c) => s + c.valueCap, 0), { compact: true })} icon={<ScrollText size={17} />} onClick={() => setFilter('ACTIVE')} />
        <Stat label="Expiring soon" value={expiring.length} detail={`Within ${ext.state.settings.contractAlertDays} days`} icon={<CalendarClock size={17} />} tone={expiring.length ? 'red' : 'green'} onClick={() => setFilter('EXPIRING')} />
        <Stat label="In approval" value={count('APPROVAL')} detail="Approve and sign" icon={<FileSignature size={17} />} tone="gold" onClick={() => setFilter('APPROVAL')} />
        <Stat label="High risks" value={visible.reduce((s, c) => s + c.risks.filter((r) => r.level === 'HIGH').length, 0)} detail="Across live contracts" icon={<ShieldAlert size={17} />} tone="violet" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['contracts', 'Contracts', visible.length], ['templates', 'Templates', ext.state.contractTemplates.length], ['clauses', 'Clause library', ext.state.clauses.length]]} />
      {tab === 'contracts' && (
        <>
          <div className="sx-toolbar">
            <Tabs
              value={filter}
              onChange={setFilter}
              tabs={[
                ['ALL', 'All', count('ALL')],
                ['DRAFT', 'Draft', count('DRAFT')],
                ['APPROVAL', 'Approval', count('APPROVAL')],
                ['ACTIVE', 'Active', count('ACTIVE')],
                ['EXPIRING', 'Expiring', count('EXPIRING')],
                ['ENDED', 'Ended', count('ENDED')]
              ]}
            />
            <SearchBox value={q} onChange={setQ} placeholder="Search contracts, suppliers, fields…" />
          </div>
          <div className="prx-inline">
            <ExportCsvButton
              name="contracts"
              header={['Number', 'Title', 'Supplier', 'Type', 'Start', 'End', 'Value cap', 'Status', 'Version', 'Items', 'Custom fields']}
              rows={() => rows.map((c) => [c.number, c.title, party(c.supplierId)?.name ?? '', TYPE_LABEL[c.type], c.start, c.end, c.valueCap, shownStatus(c), c.version, c.items.map((i) => `${i.sku}@${i.unitPrice}`).join('; '), Object.entries(c.customFields).map(([k, v]) => `${k}=${v}`).join('; ')])}
            />
          </div>
          <DataTable rows={rows} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => setOpenId(c.id)} selected={openId} initialSort={{ key: 'n', dir: 'desc' }} empty={<Empty icon={<ScrollText size={20} />} title="No contracts here" />} />
        </>
      )}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'clauses' && <ClausesTab />}
      {current && <ContractDrawer c={current} onClose={() => setOpenId(null)} />}
      {creating && (
        <ContractEditor
          c={null}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            setOpenId(id);
          }}
        />
      )}
    </SuitePage>
  );
};

const TemplatesTab: React.FC = () => {
  const ext = useProcurementExt();
  const [d, setD] = useState({ id: '', name: '', type: 'FRAMEWORK' as ContractType, body: '' });
  return (
    <>
      <ul className="sx-list">
        {ext.state.contractTemplates.map((t) => (
          <li key={t.id}>
            <b>{t.name}</b>
            <span className="sx-muted">{TYPE_LABEL[t.type]}</span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setD({ ...t })}>
              Edit
            </button>
          </li>
        ))}
      </ul>
      <h4 className="sx-subhead">{d.id ? 'Edit template' : 'New template'}</h4>
      <p className="sx-muted">Merge tags: {'{{supplier}} {{title}} {{start}} {{end}} {{value}}'}</p>
      <div className="prx-inline">
        <input className="form-control" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Template name" />
        <select className="form-control" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as ContractType })} aria-label="Type">
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>
      <textarea className="form-control" rows={8} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} aria-label="Template text" />
      <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.contracts.saveTemplate({ ...d, id: d.id || undefined }).ok && setD({ id: '', name: '', type: 'FRAMEWORK', body: '' })}>
        Save template
      </button>
    </>
  );
};

const ClausesTab: React.FC = () => {
  const ext = useProcurementExt();
  const [d, setD] = useState({ id: '', title: '', category: 'General', body: '' });
  return (
    <>
      <DataTable
        rows={ext.state.clauses}
        rowKey={(c) => c.id}
        onRowClick={(c) => setD({ ...c })}
        columns={[
          { key: 't', header: 'Clause', render: (c) => <b>{c.title}</b> },
          { key: 'c', header: 'Category', render: (c) => c.category },
          { key: 'b', header: 'Text', render: (c) => <span className="sx-muted">{c.body.slice(0, 90)}…</span> }
        ]}
      />
      <h4 className="sx-subhead">{d.id ? 'Edit clause' : 'New clause'}</h4>
      <div className="prx-inline">
        <input className="form-control" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Title" />
        <input className="form-control" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} placeholder="Category" />
      </div>
      <textarea className="form-control" rows={4} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} aria-label="Clause text" />
      <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.contracts.saveClause({ ...d, id: d.id || undefined }).ok && setD({ id: '', title: '', category: 'General', body: '' })}>
        Save clause
      </button>
    </>
  );
};

const ContractEditor: React.FC<{ c: Contract | null; onClose: () => void; onSaved: (id: string) => void }> = ({ c, onClose, onSaved }) => {
  const ext = useProcurementExt();
  const { state } = useCommercial();
  const [d, setD] = useState<ContractDraft>(() =>
    c
      ? { title: c.title, supplierId: c.supplierId, type: c.type, start: c.start, end: c.end, valueCap: c.valueCap, items: c.items.map((i) => ({ ...i })), sites: c.sites.map((s) => ({ ...s })), customFields: { ...c.customFields }, retentionYears: c.retentionYears, access: c.access, templateId: c.templateId }
      : { title: '', supplierId: '', type: 'FRAMEWORK', start: TODAY, end: addDays(TODAY, 365), valueCap: 0, items: [], sites: [], customFields: {}, retentionYears: 7, access: 'PROCUREMENT' }
  );
  const [cf, setCf] = useState({ k: '', v: '' });
  const setItem = (i: number, patch: Partial<ContractItem>) => setD({ ...d, items: d.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setSite = (i: number, patch: Partial<ContractSite>) => setD({ ...d, sites: d.sites.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <Modal
      size="xl"
      title={c ? `Edit ${c.number}` : 'New contract'}
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const r = c ? ext.contracts.update(c.id, d) : ext.contracts.create(d);
              if (r.ok && r.id) onSaved(r.id);
            }}
          >
            Save contract
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Title" required span={2}>
          <input className="form-control" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        </Field>
        <Field label="Supplier" required span={2}>
          <PartySelect kind="SUPPLIER" value={d.supplierId} onChange={(v) => setD({ ...d, supplierId: v })} />
        </Field>
        <Field label="Type">
          <select className="form-control" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value as ContractType })}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        {!c && (
          <Field label="Template">
            <select className="form-control" value={d.templateId ?? ''} onChange={(e) => setD({ ...d, templateId: e.target.value || undefined })}>
              <option value="">Blank</option>
              {ext.state.contractTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Starts">
          <input className="form-control" type="date" value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} />
        </Field>
        <Field label="Ends">
          <input className="form-control" type="date" value={d.end} onChange={(e) => setD({ ...d, end: e.target.value })} />
        </Field>
        <Field label="Value cap (KES)">
          <input className="form-control" type="number" min="0" value={d.valueCap || ''} onChange={(e) => setD({ ...d, valueCap: Number(e.target.value) })} />
        </Field>
        <Field label="Keep for (years)">
          <input className="form-control" type="number" min="1" value={d.retentionYears} onChange={(e) => setD({ ...d, retentionYears: Number(e.target.value) })} />
        </Field>
        <Field label="Who can see it">
          <select className="form-control" value={d.access} onChange={(e) => setD({ ...d, access: e.target.value as Contract['access'] })}>
            <option value="ALL">Everyone</option>
            <option value="PROCUREMENT">Procurement</option>
            <option value="MANAGEMENT">Managers only</option>
          </select>
        </Field>
      </div>
      <h4 className="sx-subhead">Items and agreed prices</h4>
      {d.items.map((it, i) => (
        <div key={i} className="prx-inline">
          <select
            className="form-control"
            value={it.sku}
            onChange={(e) => {
              const p = state.products.find((x) => x.sku === e.target.value);
              setItem(i, { sku: e.target.value, description: p?.name ?? '', uom: p?.unit ?? 'each', unitPrice: it.unitPrice || p?.cost || 0 });
            }}
            aria-label="Item"
          >
            <option value="">Item…</option>
            {state.products
              .filter((p) => p.kind !== 'GOODS')
              .map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.name}
                </option>
              ))}
          </select>
          <input className="form-control" type="number" min="0" value={it.unitPrice || ''} onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })} placeholder="Unit price" aria-label="Unit price" />
          <input className="form-control" type="number" min="0" value={it.qtyCap ?? ''} onChange={(e) => setItem(i, { qtyCap: Number(e.target.value) || undefined })} placeholder="Quantity cap" aria-label="Quantity cap" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, items: d.items.filter((_, j) => j !== i) })}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, items: [...d.items, { sku: '', description: '', unitPrice: 0, uom: 'each' }] })}>
        <Plus size={14} /> Add item
      </button>
      {d.type === 'MASTER' || d.sites.length ? (
        <>
          <h4 className="sx-subhead">Sites (master agreement overrides)</h4>
          {d.sites.map((s, i) => (
            <div key={i} className="prx-inline">
              <input className="form-control" value={s.site} onChange={(e) => setSite(i, { site: e.target.value })} placeholder="Site" />
              <input className="form-control" value={s.address} onChange={(e) => setSite(i, { address: e.target.value })} placeholder="Address" />
              <input className="form-control" type="number" value={s.rateAdjPct} onChange={(e) => setSite(i, { rateAdjPct: Number(e.target.value) })} placeholder="Rate adj %" aria-label="Rate adjustment %" />
              <input className="form-control" value={s.terms} onChange={(e) => setSite(i, { terms: e.target.value })} placeholder="Site terms" />
            </div>
          ))}
        </>
      ) : null}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD({ ...d, sites: [...d.sites, { site: '', address: '', rateAdjPct: 0, terms: '' }] })}>
        <Plus size={14} /> Add site
      </button>
      <h4 className="sx-subhead">Custom fields</h4>
      <ul className="sx-facts">
        {Object.entries(d.customFields).map(([k, v]) => (
          <li key={k}>
            <span>{k}</span>
            <b>{v}</b>
          </li>
        ))}
      </ul>
      <div className="prx-inline">
        <input className="form-control" value={cf.k} onChange={(e) => setCf({ ...cf, k: e.target.value })} placeholder="Field (e.g. Tea Board licence)" />
        <input className="form-control" value={cf.v} onChange={(e) => setCf({ ...cf, v: e.target.value })} placeholder="Value" />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (cf.k.trim()) setD({ ...d, customFields: { ...d.customFields, [cf.k.trim()]: cf.v } });
            setCf({ k: '', v: '' });
          }}
        >
          Add field
        </button>
      </div>
    </Modal>
  );
};

type KTab = 'terms' | 'document' | 'comments' | 'risks' | 'usage' | 'approval' | 'files';

const ContractDrawer: React.FC<{ c: Contract; onClose: () => void }> = ({ c, onClose }) => {
  const ext = useProcurementExt();
  const { party, actor, state } = useCommercial();
  const [tab, setTab] = useState<KTab>('terms');
  const [editing, setEditing] = useState(false);
  const last = c.versions[c.versions.length - 1];
  const [body, setBody] = useState(last.body);
  const [base, setBase] = useState(c.version);
  const [vnote, setVnote] = useState('');
  const [cmp, setCmp] = useState<[number, number]>([Math.max(1, c.version - 1), c.version]);
  const [comment, setComment] = useState({ text: '', internal: true });
  const [risk, setRisk] = useState({ text: '', level: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH', mitigation: '' });
  const [note, setNote] = useState('');
  const [signing, setSigning] = useState(false);
  const [rates, setRates] = useState<ContractItem[]>(c.items.map((i) => ({ ...i })));
  const [renewTo, setRenewTo] = useState(addDays(c.end, 365));
  const util = contractUtilisation(c, state.purchaseOrders);
  const steps = ext.contracts.stepsFor(c);
  const st = shownStatus(c);
  const vText = (n: number) => c.versions.find((v) => v.n === n)?.body ?? '';
  return (
    <>
      <Drawer
        wide
        title={`${c.number} · ${c.title}`}
        subtitle={`${party(c.supplierId)?.name} · ${TYPE_LABEL[c.type]} · v${c.version}`}
        badge={<Pill status={TONE[st]} label={st.toLowerCase()} />}
        onClose={onClose}
        footer={
          <div className="prx-inline">
            {c.status === 'DRAFT' && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                  Edit details
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.contracts.submit(c.id)}>
                  Submit for approval
                </button>
              </>
            )}
            <PrintButton
              title={c.number}
              html={() =>
                docHtml(ext.state, 'Contract', c.number, [['Supplier', party(c.supplierId)?.name ?? ''], ['Term', `${c.start} → ${c.end}`], ['Value cap', kes(c.valueCap)], ['Version', String(c.version)]], { head: ['Item', 'Unit', 'Price'], rows: c.items.map((i) => [i.description, i.uom, i.unitPrice]) }, { notes: last.body, signers: c.signatures.map((s) => `${s.by} · ${s.at}`) })
              }
            />
          </div>
        }
      >
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            ['terms', 'Terms'],
            ['document', 'Document', c.versions.length],
            ['comments', 'Comments', c.comments.length],
            ['risks', 'Risks', c.risks.length],
            ['usage', 'Utilisation'],
            ['approval', 'Approval & signature'],
            ['files', 'Files']
          ]}
        />
        {tab === 'terms' && (
          <>
            <DefList
              items={[
                ['Term', `${fmtDate(c.start)} → ${fmtDate(c.end)}`],
                ['Value cap', kes(c.valueCap)],
                ['Visible to', c.access === 'ALL' ? 'Everyone' : c.access === 'PROCUREMENT' ? 'Procurement' : 'Managers only'],
                ['Retention', `${c.retentionYears} years${c.archived ? ' · archived' : ''}`],
                ['From sourcing', c.eventId ? (ext.state.events.find((e) => e.id === c.eventId)?.number ?? '—') : '—'],
                ...Object.entries(c.customFields)
              ]}
            />
            <table className="sx-mini-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ textAlign: 'right' }}>Agreed price</th>
                  <th style={{ textAlign: 'right' }}>Cap</th>
                  <th style={{ textAlign: 'right' }}>Ordered</th>
                </tr>
              </thead>
              <tbody>
                {c.items.map((i) => (
                  <tr key={i.sku}>
                    <td>{i.description}</td>
                    <td style={{ textAlign: 'right' }}>
                      {i.unitPrice.toLocaleString()} / {i.uom}
                    </td>
                    <td style={{ textAlign: 'right' }}>{i.qtyCap ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{util.qty[i.sku] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {c.sites.length > 0 && (
              <>
                <h4 className="sx-subhead">Sites</h4>
                <ul className="sx-list">
                  {c.sites.map((s) => (
                    <li key={s.site}>
                      <b>{s.site}</b>
                      <span className="sx-muted">{s.address}</span>
                      <span>{s.rateAdjPct >= 0 ? '+' : ''}{s.rateAdjPct}% · {s.terms}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {st === 'ACTIVE' && (
              <>
                <h4 className="sx-subhead">Rate update</h4>
                {rates.map((r, i) => (
                  <div key={r.sku} className="prx-inline">
                    <span style={{ flex: '2 1 200px' }}>{r.description}</span>
                    <input className="form-control" type="number" min="0" value={r.unitPrice} onChange={(e) => setRates(rates.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) } : x)))} aria-label={`New price ${r.description}`} />
                  </div>
                ))}
                <div className="prx-inline">
                  <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (e.g. annual CPI review)" />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.contracts.amendRates(c.id, rates, note).ok && setNote('')}>
                    Apply new rates
                  </button>
                </div>
              </>
            )}
            {(st === 'ACTIVE' || st === 'EXPIRED') && (
              <div className="prx-inline">
                <input className="form-control" type="date" value={renewTo} onChange={(e) => setRenewTo(e.target.value)} aria-label="Renew until" />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.contracts.renew(c.id, renewTo, note)}>
                  Renew
                </button>
                {c.status === 'ACTIVE' && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.contracts.terminate(c.id, note)}>
                    Terminate
                  </button>
                )}
              </div>
            )}
            {(st === 'EXPIRED' || st === 'TERMINATED') && !c.archived && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.contracts.archive(c.id)}>
                Archive
              </button>
            )}
          </>
        )}
        {tab === 'document' && (
          <>
            {c.status === 'DRAFT' ? (
              <>
                <div className="prx-inline">
                  <select
                    className="form-control"
                    value=""
                    onChange={(e) => {
                      const cl = ext.state.clauses.find((x) => x.id === e.target.value);
                      if (cl) setBody(`${body}\n\n${cl.title.toUpperCase()}\n${cl.body}`);
                    }}
                    aria-label="Insert clause"
                  >
                    <option value="">Insert a clause…</option>
                    {ext.state.clauses.map((cl) => (
                      <option key={cl.id} value={cl.id}>
                        {cl.category}: {cl.title}
                      </option>
                    ))}
                  </select>
                  <span className="sx-muted">Editing from version {base}</span>
                </div>
                <textarea className="form-control" rows={12} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Contract text" />
                {base !== c.version && (
                  <div className="sx-callout warn">
                    <Lock size={16} />
                    <div>
                      <b>Version {c.version} was saved by {last.by} while you were editing</b>
                      <span>Their changes against your base are below. Merge them into your text, then rebase.</span>
                      <DiffView a={vText(base)} b={last.body} />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setBase(c.version);
                        }}
                      >
                        I have merged — rebase on v{c.version}
                      </button>
                    </div>
                  </div>
                )}
                <div className="prx-inline">
                  <input className="form-control" value={vnote} onChange={(e) => setVnote(e.target.value)} placeholder="What changed?" />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      if (ext.contracts.saveVersion(c.id, body, base, vnote).ok) {
                        setBase(base + 1);
                        setVnote('');
                      }
                    }}
                  >
                    Save as new version
                  </button>
                </div>
              </>
            ) : (
              <pre className="prx-body">{last.body}</pre>
            )}
            <h4 className="sx-subhead">Compare versions (redline)</h4>
            <div className="prx-inline">
              <select className="form-control" value={cmp[0]} onChange={(e) => setCmp([Number(e.target.value), cmp[1]])} aria-label="From version">
                {c.versions.map((v) => (
                  <option key={v.n} value={v.n}>
                    v{v.n} · {v.by}
                  </option>
                ))}
              </select>
              <select className="form-control" value={cmp[1]} onChange={(e) => setCmp([cmp[0], Number(e.target.value)])} aria-label="To version">
                {c.versions.map((v) => (
                  <option key={v.n} value={v.n}>
                    v{v.n} · {v.by}
                  </option>
                ))}
              </select>
            </div>
            <DiffView a={vText(cmp[0])} b={vText(cmp[1])} />
            <ul className="sx-list">
              {[...c.versions].reverse().map((v) => (
                <li key={v.n}>
                  <b>v{v.n}</b>
                  <span>{v.note}</span>
                  <span className="sx-muted">
                    {v.by} · {v.at.slice(0, 16).replace('T', ' ')}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === 'comments' && (
          <>
            {c.comments.map((m) => (
              <div key={m.id} className={`prx-msg ${m.internal ? 'buyer' : 'supplier'}`}>
                <b>{m.by}</b> <span className="sx-tag">{m.internal ? 'Internal' : 'Shared with supplier'}</span>
                <div>{m.text}</div>
                <small>{m.at.slice(0, 16).replace('T', ' ')}</small>
              </div>
            ))}
            <div className="prx-inline">
              <input className="form-control" value={comment.text} onChange={(e) => setComment({ ...comment, text: e.target.value })} placeholder="Comment" />
              <label className="prx-inline">
                <input type="checkbox" checked={comment.internal} onChange={(e) => setComment({ ...comment, internal: e.target.checked })} /> Internal only
              </label>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.contracts.comment(c.id, comment.text, comment.internal).ok && setComment({ ...comment, text: '' })}>
                Post
              </button>
            </div>
          </>
        )}
        {tab === 'risks' && (
          <>
            <table className="sx-mini-table">
              <tbody>
                {c.risks.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Pill status={r.level === 'HIGH' ? 'OVERDUE' : r.level === 'MEDIUM' ? 'SUBMITTED' : 'OPEN'} label={r.level.toLowerCase()} />
                    </td>
                    <td>{r.text}</td>
                    <td className="sx-muted">{r.mitigation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="prx-inline">
              <input className="form-control" value={risk.text} onChange={(e) => setRisk({ ...risk, text: e.target.value })} placeholder="Risk" />
              <select className="form-control" value={risk.level} onChange={(e) => setRisk({ ...risk, level: e.target.value as 'LOW' | 'MEDIUM' | 'HIGH' })} aria-label="Level">
                <option>LOW</option>
                <option>MEDIUM</option>
                <option>HIGH</option>
              </select>
              <input className="form-control" value={risk.mitigation} onChange={(e) => setRisk({ ...risk, mitigation: e.target.value })} placeholder="Mitigation" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.contracts.addRisk(c.id, risk.text, risk.level, risk.mitigation).ok && setRisk({ text: '', level: 'MEDIUM', mitigation: '' })}>
                Log risk
              </button>
            </div>
          </>
        )}
        {tab === 'usage' && (
          <>
            <div className="sx-amount-hero">
              <div>
                <span>Ordered against it</span>
                <strong>{kes(util.spend)}</strong>
              </div>
              <div>
                <span>Of the cap</span>
                <b>{Math.round(util.used * 100)}%</b>
              </div>
              <div>
                <span>Orders</span>
                <b>{util.orders}</b>
              </div>
            </div>
            <Meter value={util.used} tone={util.used > 0.9 ? 'red' : util.used > 0.7 ? 'gold' : 'green'} />
            <h4 className="sx-subhead">Orders above the contract price</h4>
            {util.offPrice.length === 0 ? (
              <p className="sx-muted">Every order was at or below the agreed price.</p>
            ) : (
              <ul className="sx-list">
                {util.offPrice.map((o, i) => (
                  <li key={i}>
                    <span className="sx-mono">{o.po}</span>
                    <span>{o.sku}</span>
                    <b className="sx-danger-text">
                      {o.price.toLocaleString()} vs {o.contract.toLocaleString()}
                    </b>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {tab === 'approval' && (
          <>
            <p className="sx-muted">
              Chain: {steps.map((s) => (s.role === 'DIRECTOR' ? 'Finance Director' : 'Commercial Manager')).join(' → ') || 'Commercial Manager'} · {c.approvals.length} of {Math.max(1, steps.length)} approvals
            </p>
            {c.status === 'APPROVAL' && !ext.contracts.fullyApproved(c) && (
              <div className="prx-inline">
                <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comment" />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.contracts.approve(c.id, note).ok && setNote('')}>
                  Approve
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.contracts.reject(c.id, note).ok && setNote('')}>
                  Return for changes
                </button>
              </div>
            )}
            {c.status === 'APPROVAL' && ext.contracts.fullyApproved(c) && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setSigning(true)}>
                <FileSignature size={14} /> Sign for the company
              </button>
            )}
            <ul className="sx-list">
              {c.signatures.map((s, i) => (
                <li key={i}>
                  <span style={{ fontFamily: "'Brush Script MT', cursive", fontSize: 20 }}>{s.text}</span>
                  <span className="sx-muted">
                    {s.by} · {s.at} · {s.meaning}
                  </span>
                </li>
              ))}
            </ul>
            <Timeline items={c.history} />
          </>
        )}
        {tab === 'files' && <Attachments owner={`contract:${c.id}`} by={actor.name} readOnly={ext.readOnly} title="Signed copies and annexes" />}
      </Drawer>
      {editing && (
        <ContractEditor
          c={c}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
      {signing && <SignModal signer={actor.name} meaning={`Signed ${c.number} for the company`} onClose={() => setSigning(false)} onSign={(s) => ext.contracts.sign(c.id, s)} />}
    </>
  );
};
