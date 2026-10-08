import React, { useEffect, useState } from 'react';
import { UserPlus, ShieldCheck, CheckCircle2, XCircle, Plus } from 'lucide-react';
import { useCommercial } from '../store';
import { fmtDate, kes } from '../../finance/engine';
import type { KycTemplate, OnboardingApplication } from '../tradeTypes';
import { Chips, DataTable, DefList, Drawer, Field, Modal, Panel, Pill, Stat, SuitePage, type Column } from '../../ui/kit';
import { Attachments } from '../../../platform/Widgets';

const PILL: Record<OnboardingApplication['status'], string> = { SUBMITTED: 'SUBMITTED', UNDER_REVIEW: 'APPROVED', APPROVED: 'POSTED', REJECTED: 'REJECTED' };

/** Customer onboarding: application, KYC documents verified by a second person, credit limit and terms approval. */
export const OnboardingPage: React.FC = () => {
  const { state, bizdev, clearFocus } = useCommercial();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ oppId?: string } | null>(null);
  const [tab, setTab] = useState<'APPS' | 'KYC'>('APPS');
  useEffect(() => {
    if (bizdev.focus?.startsWith('new:')) setCreating({ oppId: bizdev.focus.slice(4) });
    else if (bizdev.focus && state.applications.some((a) => a.id === bizdev.focus)) setOpenId(bizdev.focus);
    if (bizdev.focus) clearFocus();
  }, [bizdev.focus, state.applications, clearFocus]);
  const cols: Column<OnboardingApplication>[] = [
    { key: 'n', header: 'Application', render: (a) => <b className="sx-mono">{a.number}</b>, sort: (a) => a.number },
    {
      key: 'c',
      header: 'Company',
      render: (a) => (
        <div className="sx-cell-main">
          <span>{a.company}</span>
          <small>
            {a.pin} · {a.channel === 'PORTAL' ? 'Applied online' : 'Captured by sales'}
          </small>
        </div>
      ),
      sort: (a) => a.company
    },
    { key: 'd', header: 'Submitted', render: (a) => fmtDate(a.submittedAt.slice(0, 10)), sort: (a) => a.submittedAt },
    { key: 'l', header: 'Limit requested', render: (a) => kes(a.requestedLimit, { compact: true }), align: 'right' },
    { key: 'k', header: 'KYC verified', render: (a) => `${a.kyc.filter((x) => x.status === 'VERIFIED').length}/${state.kycTemplates.filter((t) => t.active && t.required).length}` },
    { key: 's', header: 'Status', render: (a) => <Pill status={PILL[a.status]} label={a.status.toLowerCase().replace('_', ' ')} />, sort: (a) => a.status }
  ];
  const current = state.applications.find((a) => a.id === openId);
  return (
    <SuitePage
      eyebrow="Business development"
      title="Customer onboarding"
      subtitle="New customers apply (online or through sales), KYC documents are checked by someone other than the person who captured them, and the manager sets the credit limit and terms."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating({})}>
          <UserPlus size={15} /> New application
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Waiting for KYC" value={state.applications.filter((a) => a.status === 'SUBMITTED').length} icon={<UserPlus size={17} />} tone="gold" />
        <Stat label="Under review" value={state.applications.filter((a) => a.status === 'UNDER_REVIEW').length} icon={<ShieldCheck size={17} />} tone="blue" />
        <Stat label="Approved" value={state.applications.filter((a) => a.status === 'APPROVED').length} icon={<CheckCircle2 size={17} />} />
        <Stat label="Declined" value={state.applications.filter((a) => a.status === 'REJECTED').length} icon={<XCircle size={17} />} tone="red" />
      </div>
      <div className="sx-toolbar">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: 'APPS', label: 'Applications' },
            { value: 'KYC', label: 'KYC requirements' }
          ]}
        />
      </div>
      {tab === 'APPS' ? <DataTable rows={state.applications} columns={cols} rowKey={(a) => a.id} onRowClick={(a) => setOpenId(a.id)} selected={openId} initialSort={{ key: 'd', dir: 'desc' }} /> : <KycTemplates />}
      {current && <AppDrawer a={current} onClose={() => setOpenId(null)} />}
      {creating && <AppEditor oppId={creating.oppId} onClose={() => setCreating(null)} onSaved={(id) => (setCreating(null), setOpenId(id))} />}
    </SuitePage>
  );
};

const AppDrawer: React.FC<{ a: OnboardingApplication; onClose: () => void }> = ({ a, onClose }) => {
  const { state, actor, appKyc, verifyAppKyc, decideApplication, appGaps, setTrading } = useCommercial();
  const [doc, setDoc] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState(a.requestedLimit);
  const [term, setTerm] = useState('n30');
  const [note, setNote] = useState('');
  const gaps = appGaps(state, a);
  const open = a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW';
  return (
    <Drawer
      wide
      title={a.company}
      subtitle={`${a.number} · ${a.pin}`}
      badge={<Pill status={PILL[a.status]} label={a.status.toLowerCase().replace('_', ' ')} />}
      onClose={onClose}
      footer={
        a.customerId ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setTrading('customers', a.customerId!)}>
            Open customer record
          </button>
        ) : undefined
      }
    >
      <DefList
        items={[
          ['Contact', `${a.contact} · ${a.email} · ${a.phone}`],
          ['Town', a.town],
          ['Category', a.category],
          ['Credit requested', kes(a.requestedLimit)],
          ['Approved limit', a.approvedLimit !== undefined ? kes(a.approvedLimit) : '—'],
          ['Linked opportunity', state.opportunities.find((o) => o.id === a.opportunityId)?.name ?? '—']
        ]}
      />
      <h4 className="sx-subhead">KYC checklist</h4>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Captured</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.kycTemplates
            .filter((t) => t.active)
            .map((t) => {
              const r = a.kyc.find((x) => x.itemId === t.id);
              return (
                <tr key={t.id}>
                  <td>
                    {t.name} {t.required ? <span className="tr-badge warn">required</span> : null}
                  </td>
                  <td>{r ? `${r.value}${r.docName ? ` · ${r.docName}` : ''} (${r.by})` : '—'}</td>
                  <td>{r ? <Pill status={r.status === 'VERIFIED' ? 'POSTED' : r.status === 'REJECTED' ? 'REJECTED' : 'SUBMITTED'} label={r.status.toLowerCase()} /> : 'Missing'}</td>
                  <td>
                    {open && (!r || r.status === 'REJECTED') && (
                      <span className="tr-row">
                        <input className="form-control" aria-label={`${t.name} number`} placeholder="Document no. / details" value={doc[t.id] ?? ''} onChange={(e) => setDoc({ ...doc, [t.id]: e.target.value })} />
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => appKyc(a.id, t.id, doc[t.id] ?? '', `${t.docType}.pdf`)}>
                          Capture
                        </button>
                      </span>
                    )}
                    {open && r?.status === 'SUBMITTED' && (
                      <span className="tr-row">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => verifyAppKyc(a.id, t.id, true)}>
                          Verify
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => verifyAppKyc(a.id, t.id, false, note || 'Document not legible')}>
                          Reject
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
      <Attachments owner={`onboarding:${a.number}`} by={actor.name} title="KYC documents (scans)" />
      {open && (
        <Panel title="Credit decision" subtitle={gaps.length ? `Still to verify: ${gaps.join(', ')}` : 'All required KYC verified'}>
          <div className="tr-row">
            <Field label="Approved limit (KES)">
              <input className="form-control" type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
            </Field>
            <Field label="Payment terms">
              <select className="form-control" value={term} onChange={(e) => setTerm(e.target.value)}>
                {state.paymentTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Note">
              <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <div className="tr-row">
            <span className="sx-grow" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => decideApplication(a.id, false, limit, term, note)}>
              <XCircle size={14} /> Decline
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => decideApplication(a.id, true, limit, term, note)}>
              <CheckCircle2 size={14} /> Approve & create customer
            </button>
          </div>
        </Panel>
      )}
      <h4 className="sx-subhead">History</h4>
      <ul className="sx-list">
        {[...a.history].reverse().map((h, i) => (
          <li key={i}>
            <span className="sx-muted">{fmtDate(h.at.slice(0, 10))}</span>
            <span>{h.action}</span>
            <span className="sx-muted">{h.note}</span>
            <b>{h.by}</b>
          </li>
        ))}
      </ul>
    </Drawer>
  );
};

const AppEditor: React.FC<{ oppId?: string; onClose: () => void; onSaved: (id: string) => void }> = ({ oppId, onClose, onSaved }) => {
  const { state, submitApplication } = useCommercial();
  const opp = state.opportunities.find((o) => o.id === oppId);
  const [a, setA] = useState({ company: opp?.prospect ?? '', pin: '', contact: opp?.contact ?? '', email: '', phone: '', town: 'Nairobi', category: 'Retail', requestedLimit: opp ? Math.round(opp.value / 2) : 500000 });
  return (
    <Modal
      title="New customer application"
      subtitle={opp ? `For opportunity: ${opp.name}` : 'Capture the applicant; KYC documents are added next'}
      onClose={onClose}
      footer={
        <>
          <span className="sx-grow" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              const r = submitApplication({ ...a, channel: 'OFFICER', opportunityId: oppId });
              if (r.ok && r.id) onSaved(r.id);
            }}
          >
            Submit application
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Company" required span={2}>
          <input className="form-control" value={a.company} onChange={(e) => setA({ ...a, company: e.target.value })} />
        </Field>
        <Field label="KRA PIN" required hint="e.g. P051234567X">
          <input className="form-control" value={a.pin} onChange={(e) => setA({ ...a, pin: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Contact person" required>
          <input className="form-control" value={a.contact} onChange={(e) => setA({ ...a, contact: e.target.value })} />
        </Field>
        <Field label="Email" required>
          <input className="form-control" value={a.email} onChange={(e) => setA({ ...a, email: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input className="form-control" value={a.phone} onChange={(e) => setA({ ...a, phone: e.target.value })} />
        </Field>
        <Field label="Town">
          <input className="form-control" value={a.town} onChange={(e) => setA({ ...a, town: e.target.value })} />
        </Field>
        <Field label="Category">
          <select className="form-control" value={a.category} onChange={(e) => setA({ ...a, category: e.target.value })}>
            {['Retail', 'Supermarket', 'Hotel & catering', 'Distributor', 'Export buyer', 'Institution'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Credit requested (KES)">
          <input className="form-control" type="number" value={a.requestedLimit} onChange={(e) => setA({ ...a, requestedLimit: Number(e.target.value) })} />
        </Field>
      </div>
    </Modal>
  );
};

const KycTemplates: React.FC = () => {
  const { state, saveKycTemplate } = useCommercial();
  const [d, setD] = useState<KycTemplate>({ id: '', name: '', required: true, docType: '', expiryMonths: 12, active: true });
  return (
    <Panel title="KYC requirements" subtitle="Documents every new customer must provide, and how often they are renewed">
      <div className="tr-row">
        <input className="form-control grow" placeholder="Document" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <input className="form-control" placeholder="Type code" value={d.docType} onChange={(e) => setD({ ...d, docType: e.target.value })} />
        <input className="form-control" type="number" aria-label="Renew after months" value={d.expiryMonths} onChange={(e) => setD({ ...d, expiryMonths: Number(e.target.value) })} />
        <label className="sx-check">
          <input type="checkbox" checked={d.required} onChange={(e) => setD({ ...d, required: e.target.checked })} /> Required
        </label>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => saveKycTemplate(d).ok && setD({ id: '', name: '', required: true, docType: '', expiryMonths: 12, active: true })}>
          <Plus size={13} /> {d.id ? 'Save' : 'Add'}
        </button>
      </div>
      <table className="sx-mini-table">
        <thead>
          <tr>
            <th>Document</th>
            <th>Required</th>
            <th>Renew</th>
            <th>Active</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.kycTemplates.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.required ? 'Yes' : 'No'}</td>
              <td>{t.expiryMonths ? `${t.expiryMonths} months` : 'Never'}</td>
              <td>
                <input type="checkbox" aria-label={`Active ${t.name}`} checked={t.active} onChange={(e) => saveKycTemplate({ ...t, active: e.target.checked })} />
              </td>
              <td>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setD(t)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
};
