import React, { useState } from 'react';
import { BellRing, Download, Palette, Plug, Plus, Printer, ShieldCheck } from 'lucide-react';
import { useCommercial } from '../store';
import { fmtDate } from '../../finance/engine';
import { PrintButton, printDocument } from '../../../platform/Widgets';
import { Empty, Field, Modal, Pill, SuitePage } from '../../ui/kit';
import { useProcurementExt } from './ext/store';
import { OUTPUT_DOCS } from './ext/data';
import { DOC_TYPE_LABEL, FIELD_LABEL, TAXONOMY } from './ext/engine';
import { docHtml, label, ReadOnlyNote, Tabs } from './ext/ui';
import { TolerancesTab } from './Invoices';
import { SUPPLIER_TYPES, TYPE_LABEL } from './Vendors';
import type { ApprovalRule, DocType, OutputTemplate, RuleDoc, SupplierCore } from './ext/types';
import type { ComRole } from '../types';

type STab = 'rules' | 'forms' | 'templates' | 'policy' | 'tolerances' | 'integrations';
const RULE_DOCS: RuleDoc[] = ['REQUISITION', 'PO', 'CONTRACT', 'SUPPLIER', 'SUPPLIER_UPDATE', 'CATALOGUE', 'INVOICE_HOLD', 'STORES_ISSUE', 'DISPOSAL'];
const ROLES: ComRole[] = ['OFFICER', 'STOREKEEPER', 'MANAGER', 'DIRECTOR'];
const ROLE_LABEL: Record<ComRole, string> = { OFFICER: 'Procurement Officer', STOREKEEPER: 'Storekeeper', MANAGER: 'Commercial Manager', DIRECTOR: 'Finance Director' };

export const SettingsPage: React.FC = () => {
  const ext = useProcurementExt();
  const [tab, setTab] = useState<STab>('rules');
  return (
    <SuitePage eyebrow="Configuration" title="Procurement settings" subtitle="Approval flows, supplier registration forms, printed document layouts and branding, policy limits, matching tolerances and integrations.">
      <ReadOnlyNote show={ext.readOnly} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ['rules', 'Approval rules', ext.state.rules.length],
          ['forms', 'Supplier forms'],
          ['templates', 'Documents & branding'],
          ['policy', 'Policy & alerts'],
          ['tolerances', 'Tolerances & currency'],
          ['integrations', 'Integrations']
        ]}
      />
      {tab === 'rules' && <RulesTab />}
      {tab === 'forms' && <FormsTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'policy' && <PolicyTab />}
      {tab === 'tolerances' && <TolerancesTab />}
      {tab === 'integrations' && <IntegrationsTab />}
    </SuitePage>
  );
};

/* ---------------- Approval rules ---------------- */

const RulesTab: React.FC = () => {
  const ext = useProcurementExt();
  const [edit, setEdit] = useState<(Omit<ApprovalRule, 'id'> & { id?: string }) | null>(null);
  const blank: Omit<ApprovalRule, 'id'> = { name: '', doc: 'REQUISITION', minValue: 0, steps: [{ role: 'MANAGER', kind: 'APPROVE' }], active: true };
  return (
    <>
      <div className="sx-toolbar">
        <span className="sx-muted">The highest matching active rule decides the chain. Notify steps send for information without holding the document. Any approver can add ad-hoc approvers or people to inform on a document.</span>
        <span className="sx-grow" />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEdit(blank)}>
          <Plus size={14} /> New rule
        </button>
      </div>
      <table className="sx-table">
        <thead>
          <tr>
            <th>Rule</th>
            <th>Applies to</th>
            <th className="r">From KES</th>
            <th>Chain</th>
            <th>Active</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ext.state.rules.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>
                {label(r.doc)}
                {r.supplierType ? ` · ${TYPE_LABEL[r.supplierType]}` : ''}
                {r.category ? ` · ${r.category}` : ''}
              </td>
              <td className="r">{r.minValue.toLocaleString()}</td>
              <td>{r.steps.map((s) => `${s.kind === 'NOTIFY' ? 'inform ' : ''}${ROLE_LABEL[s.role]}`).join(' → ')}</td>
              <td>
                <label className="prx-inline">
                  <input type="checkbox" checked={r.active} onChange={() => ext.plan.toggleRule(r.id)} aria-label={`Active ${r.name}`} />
                </label>
              </td>
              <td>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(r)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <Modal
          title={edit.id ? 'Edit approval rule' : 'New approval rule'}
          onClose={() => setEdit(null)}
          footer={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.plan.saveRule(edit).ok && setEdit(null)}>
              Save rule
            </button>
          }
        >
          <div className="sx-grid">
            <Field label="Name" required span={2}>
              <input className="form-control" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Document">
              <select className="form-control" value={edit.doc} onChange={(e) => setEdit({ ...edit, doc: e.target.value as RuleDoc })}>
                {RULE_DOCS.map((d) => (
                  <option key={d} value={d}>
                    {label(d)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From value (KES)">
              <input className="form-control" type="number" min="0" value={edit.minValue} onChange={(e) => setEdit({ ...edit, minValue: Number(e.target.value) })} />
            </Field>
            <Field label="Supplier type">
              <select className="form-control" value={edit.supplierType ?? ''} onChange={(e) => setEdit({ ...edit, supplierType: (e.target.value || undefined) as ApprovalRule['supplierType'] })}>
                <option value="">Any</option>
                {SUPPLIER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <input className="form-control" value={edit.category ?? ''} onChange={(e) => setEdit({ ...edit, category: e.target.value || undefined })} placeholder="Any" />
            </Field>
          </div>
          <h3>Steps</h3>
          {edit.steps.map((s, i) => (
            <div key={i} className="prx-inline">
              <b>{i + 1}.</b>
              <select className="form-control" aria-label="Step kind" value={s.kind} onChange={(e) => setEdit({ ...edit, steps: edit.steps.map((x, j) => (j === i ? { ...x, kind: e.target.value as 'APPROVE' | 'NOTIFY' } : x)) })}>
                <option value="APPROVE">Approve</option>
                <option value="NOTIFY">Inform only</option>
              </select>
              <select className="form-control" aria-label="Step role" value={s.role} onChange={(e) => setEdit({ ...edit, steps: edit.steps.map((x, j) => (j === i ? { ...x, role: e.target.value as ComRole } : x)) })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...edit, steps: edit.steps.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...edit, steps: [...edit.steps, { role: 'DIRECTOR', kind: 'APPROVE' }] })}>
            <Plus size={14} /> Add step
          </button>
        </Modal>
      )}
    </>
  );
};

/* ---------------- Supplier registration forms ---------------- */

const FormsTab: React.FC = () => {
  const ext = useProcurementExt();
  const cats = ['Default', ...TAXONOMY];
  const [cat, setCat] = useState('Default');
  const cfg = ext.suppliers.configFor(cat);
  const [req, setReq] = useState<(keyof SupplierCore)[]>(cfg.required);
  const [docs, setDocs] = useState<DocType[]>(cfg.documents);
  const pick = (c: string) => {
    const x = ext.suppliers.configFor(c);
    setCat(c);
    setReq(x.required);
    setDocs(x.documents);
  };
  return (
    <>
      <p className="sx-muted">Mandatory fields and documents for a supplier depend on its category. Categories without their own form use the default.</p>
      <div className="sx-grid">
        <Field label="Category">
          <select className="form-control" value={cat} onChange={(e) => pick(e.target.value)}>
            {cats.map((c) => (
              <option key={c}>
                {c}
                {ext.state.formConfig.some((f) => f.category === c) ? '' : ' (uses default)'}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="prx-split">
        <div>
          <h3>Mandatory fields</h3>
          {(Object.keys(FIELD_LABEL) as (keyof SupplierCore)[]).map((k) => (
            <label key={k} className="prx-inline">
              <input type="checkbox" checked={req.includes(k)} disabled={k === 'name'} onChange={(e) => setReq(e.target.checked ? [...req, k] : req.filter((x) => x !== k))} /> {FIELD_LABEL[k]}
            </label>
          ))}
        </div>
        <div>
          <h3>Required documents</h3>
          {(Object.keys(DOC_TYPE_LABEL) as DocType[]).map((k) => (
            <label key={k} className="prx-inline">
              <input type="checkbox" checked={docs.includes(k)} onChange={(e) => setDocs(e.target.checked ? [...docs, k] : docs.filter((x) => x !== k))} /> {DOC_TYPE_LABEL[k]}
            </label>
          ))}
        </div>
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.suppliers.saveFormConfig(cat, req, docs)}>
        Save form for {cat}
      </button>
    </>
  );
};

/* ---------------- Output templates and branding ---------------- */

const TemplatesTab: React.FC = () => {
  const ext = useProcurementExt();
  const { state, party } = useCommercial();
  const [docType, setDocType] = useState(OUTPUT_DOCS[0]);
  const t: OutputTemplate = ext.state.templates.find((x) => x.docType === docType) ?? { docType, title: docType.toUpperCase(), footer: '', showLogo: true, language: 'EN', showSignatures: true };
  const [d, setD] = useState<OutputTemplate>(t);
  const [b, setB] = useState(ext.state.branding);
  const [src, setSrc] = useState('');
  const choose = (x: string) => {
    setDocType(x);
    setD(ext.state.templates.find((y) => y.docType === x) ?? { docType: x, title: x.toUpperCase(), footer: '', showLogo: true, language: 'EN', showSignatures: true });
    setSrc('');
  };
  const poDoc = ['Purchase order', 'Goods received note', 'Inbound delivery', 'Inward tally'].includes(docType);
  const soDoc = ['Outbound delivery', 'Pro-forma invoice', 'Packing slip', 'Shipping instruction', 'Outward tally'].includes(docType);
  const lotDoc = docType === 'Tea release order';
  const srDoc = docType === 'Pick list' || docType === 'Goods issue';
  const ctDoc = docType === 'Contract';
  const sources: { id: string; label: string }[] = poDoc
    ? state.purchaseOrders.filter((o) => o.status === 'APPROVED').map((o) => ({ id: o.id, label: `${o.number} — ${party(o.supplierId)?.name}` }))
    : soDoc
      ? state.orders.filter((o) => o.status === 'APPROVED').map((o) => ({ id: o.id, label: `${o.number} — ${party(o.customerId)?.name}` }))
      : lotDoc
        ? [...new Set(ext.state.lots.filter((l) => l.garden && l.qty > 0).map((l) => l.warehouse))].map((w) => ({ id: w, label: `Tea lots at ${w}` }))
        : srDoc
          ? ext.state.storesReqs.map((r) => ({ id: r.id, label: `${r.number} — ${r.department}` }))
          : ctDoc
            ? ext.state.contracts.map((c) => ({ id: c.id, label: `${c.number} — ${c.title}` }))
            : [];
  const render = (tpl: OutputTemplate) => {
    const s = { ...ext.state, templates: [...ext.state.templates.filter((x) => x.docType !== tpl.docType), tpl], branding: b };
    const name = (sku: string) => state.products.find((p) => p.sku === sku)?.name ?? sku;
    const id = src || sources[0]?.id;
    if (poDoc) {
      const o = state.purchaseOrders.find((x) => x.id === id);
      if (!o) return null;
      const tally = docType === 'Inward tally';
      return docHtml(s, docType, o.number, [['Date', fmtDate(o.date)], ['Expected', fmtDate(o.expected)]], { head: tally ? ['Item', 'Ordered', 'Packages counted', 'Condition'] : ['Item', 'Quantity', 'Received', 'Unit price'], rows: o.lines.map((l) => (tally ? [l.description, l.qty, '', ''] : [l.description, l.qty, l.received, l.price])) }, { party: party(o.supplierId)?.name, signers: ['Prepared by', 'Approved by'] });
    }
    if (soDoc) {
      const o = state.orders.find((x) => x.id === id);
      if (!o) return null;
      const priced = docType === 'Pro-forma invoice';
      return docHtml(s, docType, o.number, [['Date', fmtDate(o.date)], ['Required by', fmtDate(o.requiredBy)], ['Deliver to', o.deliveryAddress], ['Customer ref', o.customerRef]], { head: priced ? ['Item', 'Quantity', 'Unit price', 'Amount'] : ['Item', 'Quantity', 'Packages', 'Marks'], rows: o.lines.map((l) => (priced ? [l.description, l.qty, l.price, l.qty * l.price] : [l.description, l.qty, '', ''])) }, { party: party(o.customerId)?.name, notes: o.notes, signers: ['Dispatched by', 'Received by'] });
    }
    if (lotDoc) {
      const lots = ext.state.lots.filter((l) => l.garden && l.qty > 0 && l.warehouse === id);
      return docHtml(s, docType, `TRO-${id}`, [['Date', fmtDate(new Date().toISOString().slice(0, 10))], ['Warehouse', String(id)]], { head: ['Garden', 'Grade', 'Sale', 'Invoice', 'Lot', 'Quantity'], rows: lots.map((l) => [l.garden ?? '', l.grade ?? '', l.saleNo ?? '', l.teaInvoice ?? '', l.lot, l.qty]) }, { signers: ['Released by', 'Collected by'] });
    }
    if (srDoc) {
      const r = ext.state.storesReqs.find((x) => x.id === id);
      if (!r) return null;
      return docHtml(s, docType, r.number, [['Date', fmtDate(r.date)], ['Requested by', `${r.requestedBy} — ${r.department}`]], docType === 'Pick list' ? { head: ['Item', 'Lot', 'Warehouse', 'Bin', 'Quantity'], rows: (r.pickList ?? ext.inventory.buildPickList(r)).map((p) => [name(p.sku), String(('lot' in p && p.lot) || '—'), p.warehouse, p.bin, p.qty]) } : { head: ['Item', 'Quantity', 'Issued'], rows: r.lines.map((l) => [name(l.sku), l.qty, l.issued]) }, { signers: ['Issued by', 'Received by'] });
    }
    if (ctDoc) {
      const c = ext.state.contracts.find((x) => x.id === id);
      if (!c) return null;
      return docHtml(s, docType, c.number, [['Title', c.title], ['Term', `${fmtDate(c.start)} → ${fmtDate(c.end)}`]], { head: ['Item', 'Price', 'Unit'], rows: c.items.map((i) => [i.description || i.sku, i.unitPrice, i.uom]) }, { party: party(c.supplierId)?.name, sigRef: `CONTRACT:${c.id}` });
    }
    return null;
  };
  const html = render(d);
  return (
    <div className="prx-split">
      <div>
        <h3>
          <Printer size={15} /> Document layouts
        </h3>
        <Field label="Document">
          <select className="form-control" value={docType} onChange={(e) => choose(e.target.value)}>
            {OUTPUT_DOCS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <div className="sx-grid">
          <Field label="Printed title" span={2}>
            <input className="form-control" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
          </Field>
          <Field label="Footer text" span={2}>
            <textarea className="form-control" rows={2} value={d.footer} onChange={(e) => setD({ ...d, footer: e.target.value })} />
          </Field>
          <Field label="Language">
            <select className="form-control" value={d.language} onChange={(e) => setD({ ...d, language: e.target.value as OutputTemplate['language'] })}>
              <option value="EN">English</option>
              <option value="EN_SW">English and Kiswahili</option>
            </select>
          </Field>
          <Field label="Show">
            <label className="prx-inline">
              <input type="checkbox" checked={d.showLogo} onChange={(e) => setD({ ...d, showLogo: e.target.checked })} /> Logo
            </label>
            <label className="prx-inline">
              <input type="checkbox" checked={d.showSignatures} onChange={(e) => setD({ ...d, showSignatures: e.target.checked })} /> Signature blocks
            </label>
          </Field>
        </div>
        <div className="prx-inline">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.plan.saveTemplate(d)}>
            Save layout
          </button>
          {sources.length > 0 && (
            <select className="form-control" style={{ maxWidth: 260 }} aria-label="Print from" value={src || sources[0]?.id} onChange={(e) => setSrc(e.target.value)}>
              {sources.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          )}
          {html && <PrintButton label="Print" title={`${docType}`} html={() => render(d) ?? ''} />}
        </div>
        {html ? <div className="prx-body" style={{ border: '1px solid var(--line, #ddd)', padding: 12, marginTop: 12, background: '#fff', color: '#222' }} dangerouslySetInnerHTML={{ __html: html }} /> : <Empty title="Nothing to print from yet" />}
      </div>
      <div>
        <h3>
          <Palette size={15} /> Branding
        </h3>
        <div className="sx-grid">
          <Field label="Organisation name" span={2}>
            <input className="form-control" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
          </Field>
          <Field label="Logo text">
            <input className="form-control" value={b.logoText} onChange={(e) => setB({ ...b, logoText: e.target.value })} />
          </Field>
          <Field label="Brand colour">
            <input className="form-control" value={b.colour} onChange={(e) => setB({ ...b, colour: e.target.value })} />
          </Field>
          <Field label="Catalogue welcome message" span={2}>
            <textarea className="form-control" rows={2} value={b.welcome} onChange={(e) => setB({ ...b, welcome: e.target.value })} />
          </Field>
        </div>
        <div className="prx-brand" style={{ borderColor: b.colour }}>
          <b style={{ color: b.colour }}>{b.logoText}</b> {b.name}
          <p className="sx-muted">{b.welcome}</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.plan.saveBranding(b)}>
          Save branding
        </button>
      </div>
    </div>
  );
};

/* ---------------- Policy and alerts ---------------- */

const PolicyTab: React.FC = () => {
  const ext = useProcurementExt();
  const [s, setS] = useState(ext.state.settings);
  const num = (k: keyof typeof s, l: string, hint?: string) => (
    <Field label={l} hint={hint}>
      <input className="form-control" type="number" min="0" value={s[k] as number} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} />
    </Field>
  );
  const flag = (k: keyof typeof s, l: string) => (
    <label className="prx-inline">
      <input type="checkbox" checked={s[k] as boolean} onChange={(e) => setS({ ...s, [k]: e.target.checked })} /> {l}
    </label>
  );
  return (
    <>
      <div className="sx-grid">
        {num('miscIssueLimit', 'Miscellaneous issue limit (KES)', 'Above this, the Commercial Manager approves')}
        {num('backdateDays', 'Back-dating allowed (days)')}
        {num('contractAlertDays', 'Warn before contracts end (days)')}
        {num('docAlertDays', 'Warn before supplier certificates expire (days)')}
        <Field label="Automation" span={2}>
          {flag('autoReorder', 'Raise requisitions automatically when stock falls below reorder level')}
          {flag('autoApproveOnContract', 'Approve purchase orders automatically when every line is at the contract price')}
          {flag('withholdingVat', 'Deduct withholding VAT on supplier bills')}
        </Field>
      </div>
      <div className="prx-inline">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => ext.plan.saveSettings(s)}>
          Save policy
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => ext.plan.runAlerts(true)}>
          <BellRing size={14} /> Run expiry and update reminders now
        </button>
      </div>
    </>
  );
};

/* ---------------- Integrations (simulated) ---------------- */

const download = (name: string, data: unknown) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const IntegrationsTab: React.FC = () => {
  const ext = useProcurementExt();
  const { state, party } = useCommercial();
  const [last, setLast] = useState<string | null>(null);
  const exportErp = () => {
    if (ext.readOnly) return ext.ctx.fail('This is a read-only account');
    const payload = {
      source: 'integrated-erp',
      generatedAt: new Date().toISOString(),
      suppliers: ext.state.suppliers.filter((p) => p.status === 'APPROVED').map((p) => ({ number: p.number, name: p.name, pin: p.idNumber, country: p.country, terms: p.paymentTerms, email: p.email })),
      purchaseOrders: state.purchaseOrders.filter((o) => o.status === 'APPROVED').map((o) => ({ number: o.number, supplier: party(o.supplierId)?.name, date: o.date, currency: ext.state.poExt[o.id]?.currency ?? 'KES', lines: o.lines.map((l) => ({ sku: l.sku, description: l.description, qty: l.qty, price: l.price, received: l.received })) }))
    };
    download(`erp-sync-${new Date().toISOString().slice(0, 10)}.json`, payload);
    setLast(`${payload.suppliers.length} suppliers and ${payload.purchaseOrders.length} orders at ${new Date().toLocaleTimeString()}`);
    return ext.ctx.done('Sync file created', 'Simulated — hand the JSON file to the other ERP or its integration team');
  };
  const stubs: [string, string, string][] = [
    ['External ERP — PO and supplier sync', 'Exports approved suppliers and purchase orders as JSON. A live API connection needs a server.', 'PRC-032'],
    ['KRA eTIMS invoice validation', 'Supplier invoices get a simulated control-unit number when validated on the invoice screen.', 'PRC-145'],
    ['Email and SMS gateway', 'Messages are written to the notification outbox (bell icon) instead of being sent.', 'PRC-124'],
    ['Supplier self-registration login', 'Registration on the supplier portal creates a potential supplier; real credentials need an identity store.', 'PRC-055'],
    ['Single sign-on (Microsoft)', 'The catalogue and portal show a simulated "Sign in with Microsoft" button mapped to the demo account.', 'PRC-120'],
    ['Encryption of bank details', 'Bank accounts are masked and only Commercial Manager / Finance Director see them in full; encryption at rest needs a server.', 'PRC-061']
  ];
  return (
    <>
      <div className="sx-callout">
        <ShieldCheck size={16} />
        <div>
          <b>Simulated connectors</b>
          <span>These stand in for services that need a backend. They are clearly labelled and never send data anywhere.</span>
        </div>
      </div>
      <table className="sx-table">
        <tbody>
          {stubs.map(([n, d, id]) => (
            <tr key={id}>
              <td>
                <Plug size={14} /> <b>{n}</b>
                <br />
                <small className="sx-muted">{d}</small>
              </td>
              <td>
                <Pill status="DRAFT" label="Simulated" />
              </td>
              <td>
                {id === 'PRC-032' && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={exportErp}>
                    <Download size={14} /> Export sync file
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {last && <p className="sx-muted">Last export: {last}</p>}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => printDocument('Integration register', `<h1>Integration register</h1><table>${stubs.map(([n, d]) => `<tr><th>${n}</th><td>${d}</td></tr>`).join('')}</table>`)}>
        Print register
      </button>
    </>
  );
};
