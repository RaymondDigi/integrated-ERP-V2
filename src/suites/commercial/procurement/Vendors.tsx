import React, { useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, Ban, CheckCircle2, FileWarning, Plus, Send, ShieldCheck, Star, Truck, UserPlus, Users } from 'lucide-react';
import { useCommercial } from '../store';
import { poStage, supplierStats, totals } from '../engine';
import { docBalance, fmtDate, kes, round2, TODAY } from '../../finance/engine';
import { Attachments, ExportCsvButton, ImportCsvButton } from '../../../platform/Widgets';
import { DataTable, DefList, Donut, Drawer, Empty, Field, Modal, Pill, SearchBox, Stat, SuitePage, Timeline, type Column } from '../../ui/kit';
import { useProcurementExt } from './ext/store';
import { DOC_TYPE_LABEL, expiringDocuments, FIELD_LABEL, maskAccount, overdueUpdate, scorecard, SUPPLIER_STATUS_LABEL, TAXONOMY, VERIFICATION_ITEMS } from './ext/engine';
import { ReadOnlyNote, Tabs, TONE } from './ext/ui';
import type { SupplierDraft } from './ext/actions/suppliers';
import type { DocType, IdType, PayMethod, SupplierCore, SupplierProfile, SupplierType } from './ext/types';

export const SUPPLIER_TYPES: SupplierType[] = ['GOODS', 'SERVICES', 'TEA_PRODUCER', 'BROKER', 'LOGISTICS', 'IMPORT_EXPORT'];
export const TYPE_LABEL: Record<SupplierType, string> = { GOODS: 'Goods', SERVICES: 'Services', TEA_PRODUCER: 'Tea producer', BROKER: 'Tea broker', LOGISTICS: 'Logistics', IMPORT_EXPORT: 'Import / export' };
export const SUPPLIER_CATEGORIES = ['Materials', 'Raw materials', 'Logistics', 'Maintenance', 'Office', 'Professional', 'Default'];
const DOC_TYPES = Object.keys(DOC_TYPE_LABEL) as DocType[];
const COLORS = ['#237857', '#65a586', '#ddbd72', '#749ca0', '#8b76aa', '#c98f6b'];

/* ================================================================== */
/* Supplier form (onboarding, edit, portal registration)               */
/* ================================================================== */

export const blankDraft = (): SupplierDraft => ({
  name: '',
  idType: 'KRA_PIN',
  idNumber: '',
  email: '',
  phone: '',
  contactPerson: '',
  country: 'Kenya',
  region: '',
  address: '',
  paymentMethod: 'EFT',
  paymentTerms: 30,
  bank: { bank: '', branch: '', account: '' },
  taxonomy: [],
  supplierType: 'GOODS',
  category: 'Materials'
});

export const SupplierFields: React.FC<{ d: SupplierDraft; set: (d: SupplierDraft) => void; required: (keyof SupplierCore)[]; showBank: boolean; lockBank?: boolean; parents?: SupplierProfile[] }> = ({ d, set, required, showBank, lockBank, parents }) => {
  const req = (k: keyof SupplierCore) => required.includes(k);
  return (
    <>
      <div className="sx-grid">
        <Field label="Supplier name" required span={2}>
          <input className="form-control" value={d.name ?? ''} onChange={(e) => set({ ...d, name: e.target.value })} />
        </Field>
        <Field label="Supplier type">
          <select className="form-control" value={d.supplierType} onChange={(e) => set({ ...d, supplierType: e.target.value as SupplierType })}>
            {SUPPLIER_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category" hint="Decides the mandatory fields and documents">
          <select className="form-control" value={d.category} onChange={(e) => set({ ...d, category: e.target.value })}>
            {SUPPLIER_CATEGORIES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="ID type" required={req('idType')}>
          <select className="form-control" value={d.idType} onChange={(e) => set({ ...d, idType: e.target.value as IdType })}>
            <option value="KRA_PIN">KRA PIN</option>
            <option value="NATIONAL_ID">National ID</option>
            <option value="PASSPORT">Passport</option>
            <option value="FOREIGN_TAX_ID">Foreign tax ID</option>
          </select>
        </Field>
        <Field label={d.idType === 'KRA_PIN' ? 'KRA PIN' : 'ID number'} required={req('idNumber')} hint={d.idType === 'KRA_PIN' ? 'e.g. P051234567X — must be unique' : 'Must be unique'}>
          <input className="form-control" value={d.idNumber ?? ''} onChange={(e) => set({ ...d, idNumber: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Email" required={req('email')}>
          <input className="form-control" type="email" value={d.email ?? ''} onChange={(e) => set({ ...d, email: e.target.value })} />
        </Field>
        <Field label="Phone" required={req('phone')}>
          <input className="form-control" value={d.phone ?? ''} onChange={(e) => set({ ...d, phone: e.target.value })} placeholder="+254 7xx xxx xxx" />
        </Field>
        <Field label="Contact person" required={req('contactPerson')}>
          <input className="form-control" value={d.contactPerson ?? ''} onChange={(e) => set({ ...d, contactPerson: e.target.value })} />
        </Field>
        <Field label="Country" required={req('country')}>
          <input className="form-control" value={d.country ?? ''} onChange={(e) => set({ ...d, country: e.target.value })} />
        </Field>
        <Field label="Region / county" required={req('region')}>
          <input className="form-control" value={d.region ?? ''} onChange={(e) => set({ ...d, region: e.target.value })} />
        </Field>
        <Field label="Address" required={req('address')}>
          <input className="form-control" value={d.address ?? ''} onChange={(e) => set({ ...d, address: e.target.value })} />
        </Field>
        {parents && (
          <Field label="Parent company">
            <select className="form-control" value={d.parentId ?? ''} onChange={(e) => set({ ...d, parentId: e.target.value || undefined })}>
              <option value="">None</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Logo text / URL">
          <input className="form-control" value={d.logo ?? ''} onChange={(e) => set({ ...d, logo: e.target.value })} />
        </Field>
        <Field label="Preferred payment" required={req('paymentMethod')}>
          <select className="form-control" value={d.paymentMethod} onChange={(e) => set({ ...d, paymentMethod: e.target.value as PayMethod })}>
            {(['EFT', 'RTGS', 'M-PESA', 'CHEQUE', 'CASH'] as PayMethod[]).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Payment terms (days)" required={req('paymentTerms')}>
          <input className="form-control" type="number" min="0" value={d.paymentTerms ?? 30} onChange={(e) => set({ ...d, paymentTerms: Number(e.target.value) })} />
        </Field>
        {showBank && (
          <>
            <Field label="Bank" required={req('bank')} hint={lockBank ? 'Changes only through an approved update request' : undefined}>
              <input className="form-control" disabled={lockBank} value={d.bank?.bank ?? ''} onChange={(e) => set({ ...d, bank: { ...(d.bank ?? { bank: '', branch: '', account: '' }), bank: e.target.value } })} />
            </Field>
            <Field label="Branch">
              <input className="form-control" disabled={lockBank} value={d.bank?.branch ?? ''} onChange={(e) => set({ ...d, bank: { ...(d.bank ?? { bank: '', branch: '', account: '' }), branch: e.target.value } })} />
            </Field>
            <Field label="Account number">
              <input className="form-control" disabled={lockBank} value={d.bank?.account ?? ''} onChange={(e) => set({ ...d, bank: { ...(d.bank ?? { bank: '', branch: '', account: '' }), account: e.target.value } })} />
            </Field>
          </>
        )}
      </div>
      <Field label="What you supply (category taxonomy)" required={req('taxonomy')} span={4}>
        <div className="prx-facets">
          {TAXONOMY.map((t) => (
            <label key={t} className="sx-tag" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={(d.taxonomy ?? []).includes(t)} onChange={(e) => set({ ...d, taxonomy: e.target.checked ? [...(d.taxonomy ?? []), t] : (d.taxonomy ?? []).filter((x) => x !== t) })} /> {t}
            </label>
          ))}
        </div>
      </Field>
    </>
  );
};

/* ================================================================== */
/* Supplier management page                                            */
/* ================================================================== */

type VFilter = 'ALL' | 'PROSPECT' | 'PENDING_APPROVAL' | 'APPROVED' | 'BLOCKED';

export const VendorsPage: React.FC = () => {
  const ext = useProcurementExt();
  const [filter, setFilter] = useState<VFilter>('ALL');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [region, setRegion] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (ext.page?.focus === 'new') setCreating(true);
    else if (ext.page?.focus) setOpenId(ext.page.focus);
  }, [ext.page]);
  const list = ext.state.suppliers;
  const match = (p: SupplierProfile, f: VFilter) => f === 'ALL' || (f === 'BLOCKED' ? ['SUSPENDED', 'TERMINATED', 'REJECTED'].includes(p.status) : p.status === f);
  const rows = list
    .filter((p) => match(p, filter))
    .filter((p) => (!type || p.supplierType === type) && (!region || p.region === region))
    .filter((p) => !q || `${p.number} ${p.name} ${p.idNumber} ${p.category} ${p.taxonomy.join(' ')} ${p.region}`.toLowerCase().includes(q.toLowerCase()));
  const count = (f: VFilter) => list.filter((p) => match(p, f)).length;
  const expiring = expiringDocuments(list, ext.state.settings.docAlertDays);
  const byType = SUPPLIER_TYPES.map((t, i) => ({ label: TYPE_LABEL[t], value: list.filter((p) => p.supplierType === t && p.status === 'APPROVED').length, color: COLORS[i % COLORS.length] })).filter((x) => x.value);
  const regions = [...new Set(list.map((p) => p.region).filter(Boolean))].sort();
  const columns: Column<SupplierProfile>[] = [
    { key: 'n', header: 'Supplier', render: (p) => <div className="sx-cell-main"><span>{p.name}</span><small>{p.number} · {TYPE_LABEL[p.supplierType]} · {p.region}</small></div>, sort: (p) => p.name },
    { key: 'c', header: 'Category', render: (p) => p.category, sort: (p) => p.category, hideOnMobile: true },
    { key: 'i', header: 'KRA PIN / ID', render: (p) => <span className="sx-mono">{p.idNumber || '—'}</span>, hideOnMobile: true },
    {
      key: 'd',
      header: 'Documents',
      render: (p) => {
        const bad = expiring.filter((x) => x.profile.id === p.id);
        return bad.length ? <span className="sx-danger-text">{bad[0].days < 0 ? 'Expired' : `Expires in ${bad[0].days}d`}</span> : `${p.documents.length} on file`;
      }
    },
    { key: 's', header: 'Status', render: (p) => <Pill status={TONE[p.status]} label={overdueUpdate(p) ? 'Update overdue' : SUPPLIER_STATUS_LABEL[p.status]} />, sort: (p) => p.status }
  ];
  const current = list.find((p) => p.id === openId);
  return (
    <SuitePage
      eyebrow="Suppliers"
      title="Supplier management"
      subtitle="Onboarding, approval, documents, verification, update requests and scorecards for every supplier."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <UserPlus size={15} /> Onboard supplier
        </button>
      }
    >
      <ReadOnlyNote show={ext.readOnly} />
      <div className="sx-stats">
        <Stat label="Approved" value={count('APPROVED')} detail="Can be ordered from" icon={<BadgeCheck size={17} />} onClick={() => setFilter('APPROVED')} />
        <Stat label="Awaiting approval" value={count('PENDING_APPROVAL')} detail={`${count('PROSPECT')} potential suppliers`} icon={<Users size={17} />} tone="gold" onClick={() => setFilter('PENDING_APPROVAL')} />
        <Stat label="Documents expiring" value={expiring.length} detail={`Within ${ext.state.settings.docAlertDays} days or expired`} icon={<FileWarning size={17} />} tone={expiring.length ? 'red' : 'green'} />
        <Stat label="Blocked" value={count('BLOCKED')} detail="Suspended, terminated or rejected" icon={<Ban size={17} />} tone="slate" onClick={() => setFilter('BLOCKED')} />
      </div>
      <div className="sx-row">
        <section className="sx-panel">
          <div className="sx-panel-head">
            <div>
              <h2>Approved supplier base</h2>
              <p>By supplier type</p>
            </div>
          </div>
          <div className="sx-panel-body">
            <Donut items={byType} center={count('APPROVED')} caption="approved" />
          </div>
        </section>
        <section className="sx-panel">
          <div className="sx-panel-head">
            <div>
              <h2>By region</h2>
              <p>All statuses</p>
            </div>
          </div>
          <div className="sx-panel-body">
            <ul className="sx-facts">
              {regions.map((r) => (
                <li key={r}>
                  <span>{r}</span>
                  <b>{list.filter((p) => p.region === r).length}</b>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
      <div className="sx-toolbar">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            ['ALL', 'All', count('ALL')],
            ['PROSPECT', 'Potential', count('PROSPECT')],
            ['PENDING_APPROVAL', 'Awaiting approval', count('PENDING_APPROVAL')],
            ['APPROVED', 'Approved', count('APPROVED')],
            ['BLOCKED', 'Blocked', count('BLOCKED')]
          ]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search name, PIN, category…" />
      </div>
      <div className="prx-filters">
        <select className="form-control" value={type} onChange={(e) => setType(e.target.value)} aria-label="Supplier type">
          <option value="">All types</option>
          {SUPPLIER_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select className="form-control" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <ExportCsvButton
          name="suppliers"
          header={['number', 'name', 'type', 'category', 'id_type', 'id_number', 'email', 'phone', 'contact', 'region', 'country', 'terms', 'payment_method', 'status', 'taxonomy']}
          rows={() => rows.map((p) => [p.number, p.name, p.supplierType, p.category, p.idType, p.idNumber, p.email, p.phone, p.contactPerson, p.region, p.country, p.paymentTerms, p.paymentMethod, p.status, p.taxonomy.join('; ')])}
        />
        <ImportCsvButton label="Import suppliers" template={['name', 'type', 'category', 'id_type', 'id_number', 'email', 'phone', 'contact', 'region', 'country', 'terms', 'payment_method', 'bank', 'branch', 'account']} onImport={ext.suppliers.importSuppliers} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.plan.runAlerts(true)}>
          <Send size={14} /> Send document reminders
        </button>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(p) => p.id} onRowClick={(p) => setOpenId(p.id)} selected={openId} initialSort={{ key: 'n', dir: 'asc' }} empty={<Empty icon={<Truck size={20} />} title="No suppliers here" />} />
      {current && <VendorDrawer p={current} onClose={() => setOpenId(null)} />}
      {creating && (
        <OnboardModal
          onClose={() => setCreating(false)}
          onDone={(id) => {
            setCreating(false);
            setOpenId(id);
          }}
        />
      )}
    </SuitePage>
  );
};

export const OnboardModal: React.FC<{ onClose: () => void; onDone: (id: string) => void; source?: 'INTERNAL' | 'REQUISITIONER' }> = ({ onClose, onDone, source = 'INTERNAL' }) => {
  const ext = useProcurementExt();
  const [d, setD] = useState<SupplierDraft>(blankDraft());
  const [reason, setReason] = useState('');
  const cfg = ext.suppliers.configFor(d.category);
  return (
    <Modal
      size="xl"
      title={source === 'REQUISITIONER' ? 'Suggest a new supplier' : 'Onboard a supplier'}
      subtitle="Starts as a potential supplier. Purchasing completes the documents and submits it for approval."
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const r = ext.suppliers.requestOnboarding(d, source, reason);
              if (r.ok && r.id) onDone(r.id);
            }}
          >
            <UserPlus size={14} /> {source === 'REQUISITIONER' ? 'Send suggestion' : 'Start onboarding'}
          </button>
        </>
      }
    >
      <Field label="Why is this supplier needed?" span={4}>
        <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Only local source of food-grade foil" />
      </Field>
      <SupplierFields d={d} set={setD} required={cfg.required} showBank={source === 'INTERNAL'} parents={ext.state.suppliers.filter((p) => p.status === 'APPROVED')} />
      <p className="sx-muted">
        Mandatory for {cfg.category}: {cfg.required.map((k) => FIELD_LABEL[k]).join(', ')} · documents: {cfg.documents.map((x) => DOC_TYPE_LABEL[x]).join(', ') || 'none'}
      </p>
    </Modal>
  );
};

/* ================================================================== */
/* Supplier drawer                                                     */
/* ================================================================== */

type VTab = 'info' | 'documents' | 'verify' | 'updates' | 'activity' | 'scorecard' | 'files';

export const VendorDrawer: React.FC<{ p: SupplierProfile; onClose: () => void }> = ({ p, onClose }) => {
  const ext = useProcurementExt();
  const { state, actor, finance, setProcurement } = useCommercial();
  const [tab, setTab] = useState<VTab>('info');
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [doc, setDoc] = useState({ type: 'TAX_COMPLIANCE' as DocType, number: '', issued: TODAY, expiry: '', issuer: 'Kenya Revenue Authority' });
  const [upd, setUpd] = useState({ form: p.category, days: 14, message: '' });
  const [ev, setEv] = useState({ period: `${TODAY.slice(0, 4)}-Q${Math.ceil(Number(TODAY.slice(5, 7)) / 3)}`, quality: 4, delivery: 4, price: 4, service: 4, compliance: 4, comment: '' });
  const canSeeBank = actor.role === 'MANAGER' || actor.role === 'DIRECTOR';
  const pid = p.partyId ?? '';
  const stats = supplierStats(state, pid, state.products);
  const evals = ext.state.evaluations.filter((e) => e.supplierId === pid);
  const sc = scorecard(stats, evals);
  const reqs = state.requisitions.filter((r) => r.awards?.some((a) => a.supplierId === pid) || r.awardedTo === pid || r.quotes.some((x) => x.supplierId === pid));
  const pos = state.purchaseOrders.filter((o) => o.supplierId === pid);
  const grns = state.receipts.filter((g) => pos.some((o) => o.id === g.poId));
  const bills = finance.state.documents.filter((d) => d.kind === 'BILL' && d.partyId === pid);
  const ordered = round2(pos.filter((o) => o.status === 'APPROVED').reduce((s, o) => s + totals(o.lines, state.products).total, 0));
  const received = round2(pos.reduce((s, o) => s + o.lines.reduce((a, l) => a + l.received * l.price, 0), 0));
  const billed = round2(bills.filter((b) => b.status !== 'VOID' && b.status !== 'REJECTED').reduce((s, b) => s + b.lines.reduce((a, l) => a + l.qty * l.price * (l.vat ? 1.16 : 1), 0), 0));
  const owed = round2(bills.filter((b) => b.status === 'POSTED').reduce((s, b) => s + docBalance(finance.state, b), 0));
  const steps = ext.suppliers.configFor(p.category);
  const overdue = overdueUpdate(p);
  return (
    <>
      <Drawer
        wide
        title={p.name}
        subtitle={`${p.number} · ${TYPE_LABEL[p.supplierType]} · ${p.category} · source ${p.source.toLowerCase()}`}
        badge={<Pill status={TONE[p.status]} label={SUPPLIER_STATUS_LABEL[p.status]} />}
        onClose={onClose}
        footer={
          <div className="prx-inline">
            {(p.status === 'PROSPECT' || p.status === 'REJECTED') && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.suppliers.submit(p.id)}>
                <Send size={14} /> Submit for approval
              </button>
            )}
            {p.status === 'PENDING_APPROVAL' && (
              <>
                <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comment" />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.suppliers.approve(p.id, note).ok && setNote('')}>
                  <CheckCircle2 size={14} /> Approve
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.suppliers.reject(p.id, note).ok && setNote('')}>
                  Reject
                </button>
              </>
            )}
            {(p.status === 'APPROVED' || p.status === 'SUSPENDED') && (
              <>
                <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason" />
                {p.status === 'APPROVED' ? (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.suppliers.setStatus(p.id, 'SUSPENDED', note).ok && setNote('')}>
                    Suspend
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.suppliers.setStatus(p.id, 'APPROVED', note).ok && setNote('')}>
                    Reactivate
                  </button>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.suppliers.setStatus(p.id, 'TERMINATED', note).ok && setNote('')}>
                  Terminate
                </button>
              </>
            )}
          </div>
        }
      >
        {overdue && (
          <div className="sx-callout danger">
            <AlertTriangle size={16} />
            <div>
              <b>Update request overdue since {fmtDate(overdue.due)}</b>
              <span>New orders and invoices from this supplier are on hold until they respond.</span>
            </div>
          </div>
        )}
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            ['info', 'Information'],
            ['documents', 'Documents', p.documents.length],
            ['verify', 'Verification'],
            ['updates', 'Update requests', p.updateRequests.length],
            ['activity', 'Activity & P2P'],
            ['scorecard', 'Scorecard'],
            ['files', 'Files']
          ]}
        />
        {tab === 'info' && (
          <>
            <DefList
              items={[
                ['KRA PIN / ID', `${p.idType.replace(/_/g, ' ')} ${p.idNumber || '—'}`],
                ['Contact', `${p.contactPerson || '—'} · ${p.email || '—'} · ${p.phone || '—'}`],
                ['Location', `${p.address || p.region}, ${p.country}`],
                ['Parent company', p.parentId ? (ext.state.suppliers.find((x) => x.id === p.parentId)?.name ?? '—') : '—'],
                ['Payment', `${p.paymentMethod} · ${p.paymentTerms} days${p.termsAccepted ? ` · terms accepted ${p.termsAccepted.slice(0, 10)}` : ''}`],
                ['Bank', canSeeBank ? `${p.bank.bank} ${p.bank.branch} · ${p.bank.account}` : `${p.bank.bank || '—'} · ${maskAccount(p.bank.account)} (full number visible to managers)`],
                ['Supplies', p.taxonomy.join(', ') || '—'],
                ['Portal login', p.portalLogin ? `${p.portalLogin.username} · ${p.portalLogin.active ? 'active' : 'inactive'}` : 'None'],
                ['Finance record', pid ? (finance.state.parties.find((x) => x.id === pid)?.name ?? pid) : 'Created on approval']
              ]}
            />
            {p.status !== 'TERMINATED' && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                Edit details
              </button>
            )}
            <h4 className="sx-subhead">Approval and comments</h4>
            <p className="sx-muted">
              Mandatory for {steps.category}: {steps.required.map((k) => FIELD_LABEL[k]).join(', ')}
            </p>
            <Timeline items={p.history} />
          </>
        )}
        {tab === 'documents' && (
          <>
            <table className="sx-mini-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Number</th>
                  <th>Expires</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {p.documents.map((x) => (
                  <tr key={x.id}>
                    <td>
                      {DOC_TYPE_LABEL[x.type]}
                      <small className="sx-muted sx-block">{x.issuer}</small>
                    </td>
                    <td className="sx-mono">{x.number}</td>
                    <td className={x.expiry < TODAY ? 'sx-danger-text' : ''}>{fmtDate(x.expiry)}</td>
                    <td>
                      {x.verified ? (
                        <span className="sx-tag">
                          <ShieldCheck size={12} /> Verified
                        </span>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => ext.suppliers.verifyDocument(p.id, x.id)}>
                          Verify
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h4 className="sx-subhead">Add a certificate</h4>
            <div className="prx-inline">
              <select className="form-control" value={doc.type} onChange={(e) => setDoc({ ...doc, type: e.target.value as DocType })} aria-label="Document type">
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DOC_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <input className="form-control" value={doc.number} onChange={(e) => setDoc({ ...doc, number: e.target.value })} placeholder="Certificate number" />
              <input className="form-control" value={doc.issuer} onChange={(e) => setDoc({ ...doc, issuer: e.target.value })} placeholder="Issuer" />
              <input className="form-control" type="date" value={doc.issued} onChange={(e) => setDoc({ ...doc, issued: e.target.value })} aria-label="Issued" />
              <input className="form-control" type="date" value={doc.expiry} onChange={(e) => setDoc({ ...doc, expiry: e.target.value })} aria-label="Expiry" />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.suppliers.addDocument(p.id, doc).ok && setDoc({ ...doc, number: '', expiry: '' })}>
                <Plus size={14} /> Add
              </button>
            </div>
            <Attachments owner={`supplier-docs:${p.id}`} by={actor.name} readOnly={ext.readOnly} title="Scanned certificates" />
          </>
        )}
        {tab === 'verify' && (
          <>
            <p className="sx-muted">Checks completed by Purchasing before approval. Live KRA iTax, bank and credit-bureau lookups need external connections and are recorded manually here.</p>
            <ul className="sx-list">
              {VERIFICATION_ITEMS.map((i) => (
                <li key={i}>
                  <label className="prx-inline">
                    <input type="checkbox" checked={!!p.verification[i]} onChange={() => ext.suppliers.toggleCheck(p.id, i)} /> {i}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === 'updates' && (
          <>
            {p.status === 'APPROVED' && (
              <div className="prx-inline">
                <select className="form-control" value={upd.form} onChange={(e) => setUpd({ ...upd, form: e.target.value })} aria-label="Form">
                  {ext.state.formConfig.map((f) => (
                    <option key={f.category}>{f.category}</option>
                  ))}
                </select>
                <input className="form-control" type="number" min="1" value={upd.days} onChange={(e) => setUpd({ ...upd, days: Number(e.target.value) })} aria-label="Days to respond" style={{ maxWidth: 90 }} />
                <input className="form-control" value={upd.message} onChange={(e) => setUpd({ ...upd, message: e.target.value })} placeholder="Message to the supplier" />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.suppliers.sendUpdateRequest(p.id, upd.form, upd.days, upd.message)}>
                  <Send size={14} /> Send update form
                </button>
              </div>
            )}
            {p.updateRequests.length === 0 && <p className="sx-muted">No update requests.</p>}
            {[...p.updateRequests].reverse().map((u) => (
              <div key={u.id} className="sx-panel" style={{ padding: 10, marginBottom: 8 }}>
                <div className="prx-inline">
                  <b>{u.formCategory} form</b>
                  <Pill status={TONE[u.status]} label={u.status === 'SENT' && u.due < TODAY ? 'Overdue' : u.status.replace('_', ' ').toLowerCase()} />
                  <span className="sx-muted">
                    sent {u.sentAt.slice(0, 10)} by {u.sentBy} · due {fmtDate(u.due)}
                  </span>
                </div>
                {Object.keys(u.changes).length > 0 && (
                  <table className="sx-mini-table">
                    <tbody>
                      {(Object.keys(u.changes) as (keyof SupplierCore)[]).map((k) => (
                        <tr key={k}>
                          <td>{FIELD_LABEL[k]}</td>
                          <td className="sx-muted">{k === 'bank' ? (canSeeBank ? `${p.bank.bank} ${p.bank.account}` : maskAccount(p.bank.account)) : String(p[k] ?? '')}</td>
                          <td>
                            <b>{k === 'bank' ? (canSeeBank ? `${u.changes.bank?.bank} ${u.changes.bank?.account}` : maskAccount(u.changes.bank?.account ?? '')) : String(u.changes[k] ?? '')}</b>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {(u.status === 'SUBMITTED' || u.status === 'UNDER_REVIEW') && (
                  <div className="prx-inline">
                    {u.status === 'SUBMITTED' && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => ext.suppliers.markUnderReview(p.id, u.id)}>
                        Mark under review
                      </button>
                    )}
                    <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comment" />
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.suppliers.decideUpdate(p.id, u.id, true, note).ok && setNote('')}>
                      Approve changes
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.suppliers.decideUpdate(p.id, u.id, false, note).ok && setNote('')}>
                      Return
                    </button>
                  </div>
                )}
                <Timeline items={u.comments} />
              </div>
            ))}
          </>
        )}
        {tab === 'activity' && (
          <>
            <div className="sx-amount-hero">
              <div>
                <span>Ordered</span>
                <strong>{kes(ordered, { compact: true })}</strong>
              </div>
              <div>
                <span>Received</span>
                <b>{kes(received, { compact: true })}</b>
              </div>
              <div>
                <span>Billed</span>
                <b>{kes(billed, { compact: true })}</b>
              </div>
              <div>
                <span>Owed now</span>
                <b>{kes(owed, { compact: true })}</b>
              </div>
            </div>
            <h4 className="sx-subhead">Purchase orders</h4>
            <ul className="sx-list">
              {pos.map((o) => (
                <li key={o.id}>
                  <button type="button" className="sx-link" onClick={() => setProcurement('orders', o.id)}>
                    {o.number}
                  </button>
                  <span>{fmtDate(o.date)}</span>
                  <span className="sx-muted">{poStage(o).toLowerCase().replace('_', ' ')}</span>
                  <b>{kes(totals(o.lines, state.products).total, { compact: true })}</b>
                </li>
              ))}
              {!pos.length && <li className="sx-muted">No orders yet</li>}
            </ul>
            <h4 className="sx-subhead">Requisitions, receipts and bills</h4>
            <ul className="sx-list">
              {reqs.map((r) => (
                <li key={r.id}>
                  <span className="sx-mono">{r.number}</span>
                  <span className="sx-muted">{r.justification}</span>
                </li>
              ))}
              {grns.map((g) => (
                <li key={g.id}>
                  <span className="sx-mono">{g.number}</span>
                  <span>{fmtDate(g.date)}</span>
                  <span className="sx-muted">{g.lines.reduce((s, l) => s + l.qty, 0)} received</span>
                </li>
              ))}
              {bills.map((b) => (
                <li key={b.id}>
                  <span className="sx-mono">{b.number}</span>
                  <span>{fmtDate(b.date)}</span>
                  <Pill status={b.status} />
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === 'scorecard' && (
          <>
            <div className="sx-amount-hero">
              <div>
                <span>Blended rating</span>
                <strong>
                  <Star size={16} /> {sc.blended ?? '—'}
                </strong>
              </div>
              <div>
                <span>From deliveries</span>
                <b>{sc.auto ?? '—'}</b>
              </div>
              <div>
                <span>From evaluations</span>
                <b>{sc.manual ?? '—'}</b>
              </div>
              <div>
                <span>On time / quality</span>
                <b>
                  {stats.onTime === null ? '—' : `${Math.round(stats.onTime * 100)}%`} / {stats.quality === null ? '—' : `${Math.round(stats.quality * 100)}%`}
                </b>
              </div>
            </div>
            <table className="sx-mini-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>By</th>
                  <th>Quality</th>
                  <th>Delivery</th>
                  <th>Price</th>
                  <th>Service</th>
                  <th>Compliance</th>
                </tr>
              </thead>
              <tbody>
                {evals.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.period}
                      <small className="sx-muted sx-block">{e.comment}</small>
                    </td>
                    <td>{e.evaluator}</td>
                    <td>{e.scores.quality}</td>
                    <td>{e.scores.delivery}</td>
                    <td>{e.scores.price}</td>
                    <td>{e.scores.service}</td>
                    <td>{e.scores.compliance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pid && (
              <>
                <h4 className="sx-subhead">Evaluate this supplier</h4>
                <div className="prx-inline">
                  <input className="form-control" value={ev.period} onChange={(e) => setEv({ ...ev, period: e.target.value })} aria-label="Period" />
                  {(['quality', 'delivery', 'price', 'service', 'compliance'] as const).map((k) => (
                    <label key={k}>
                      {k} <input className="form-control" type="number" min="1" max="5" value={ev[k]} onChange={(e) => setEv({ ...ev, [k]: Number(e.target.value) })} style={{ maxWidth: 70 }} />
                    </label>
                  ))}
                  <input className="form-control" value={ev.comment} onChange={(e) => setEv({ ...ev, comment: e.target.value })} placeholder="Comment" />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => ext.suppliers.evaluate({ supplierId: pid, period: ev.period, scores: { quality: ev.quality, delivery: ev.delivery, price: ev.price, service: ev.service, compliance: ev.compliance }, comment: ev.comment })}
                  >
                    Save evaluation
                  </button>
                </div>
              </>
            )}
          </>
        )}
        {tab === 'files' && <Attachments owner={`supplier:${p.id}`} by={actor.name} readOnly={ext.readOnly} />}
      </Drawer>
      {editing && <EditSupplier p={p} onClose={() => setEditing(false)} />}
    </>
  );
};

const EditSupplier: React.FC<{ p: SupplierProfile; onClose: () => void }> = ({ p, onClose }) => {
  const ext = useProcurementExt();
  const [d, setD] = useState<SupplierDraft>({ ...p });
  return (
    <Modal
      size="xl"
      title={`Edit ${p.name}`}
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.suppliers.saveProfile(p.id, d).ok && onClose()}>
            Save
          </button>
        </>
      }
    >
      <SupplierFields d={d} set={setD} required={ext.suppliers.configFor(d.category).required} showBank lockBank={p.status === 'APPROVED'} parents={ext.state.suppliers.filter((x) => x.status === 'APPROVED' && x.id !== p.id)} />
    </Modal>
  );
};
