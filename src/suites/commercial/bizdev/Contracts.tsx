import React, { useState } from 'react';
import { FileSignature, Plus, CheckCircle2, Send, Printer, Clock3 } from 'lucide-react';
import { useCommercial } from '../store';
import { addDays, daysBetween, fmtDate, kes, TODAY } from '../../finance/engine';
import type { Contract } from '../tradeTypes';
import { DataTable, DefList, Drawer, Field, Modal, Pill, Stat, SuitePage, type Column } from '../../ui/kit';
import { PartySelect } from '../parts';
import { Attachments, printDocument, SignModal } from '../../../platform/Widgets';
import { contractHtml } from '../trading/docs';

const PILL: Record<Contract['status'], string> = { DRAFT: 'DRAFT', REVIEW: 'SUBMITTED', SENT: 'APPROVED', SIGNED: 'PART_PAID', ACTIVE: 'POSTED', EXPIRED: 'VOID', TERMINATED: 'REJECTED' };

/** Customer contracts: generated from templates, steps tracked (internal and external), approved, e-signed, expiry alerts. */
export const ContractsPage: React.FC = () => {
  const { state, party } = useCommercial();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const status = (c: Contract): Contract['status'] => (c.status === 'ACTIVE' && c.end < TODAY ? 'EXPIRED' : c.status);
  const cols: Column<Contract>[] = [
    { key: 'n', header: 'Contract', render: (c) => <b className="sx-mono">{c.number}</b>, sort: (c) => c.number },
    {
      key: 't',
      header: 'Title',
      render: (c) => (
        <div className="sx-cell-main">
          <span>{c.title}</span>
          <small>{party(c.customerId)?.name}</small>
        </div>
      ),
      sort: (c) => c.title
    },
    { key: 'p', header: 'Period', render: (c) => `${fmtDate(c.start)} – ${fmtDate(c.end)}`, sort: (c) => c.end, hideOnMobile: true },
    { key: 'v', header: 'Value', render: (c) => kes(c.value, { compact: true }), sort: (c) => c.value, align: 'right' },
    { key: 'x', header: 'Next step', render: (c) => c.steps.find((x) => !x.done)?.name ?? '—', hideOnMobile: true },
    { key: 's', header: 'Status', render: (c) => <Pill status={PILL[status(c)]} label={status(c).toLowerCase()} />, sort: (c) => c.status }
  ];
  const expiring = state.contracts.filter((c) => c.status === 'ACTIVE' && c.end >= TODAY && c.end <= addDays(TODAY, 30));
  const current = state.contracts.find((c) => c.id === openId);
  return (
    <SuitePage
      eyebrow="Business development"
      title="Contracts"
      subtitle="Supply agreements generated from templates, reviewed, approved and signed electronically. Owners and customers are alerted 30 days before expiry."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <Plus size={15} /> New contract
        </button>
      }
    >
      <div className="sx-stats">
        <Stat label="Active" value={state.contracts.filter((c) => status(c) === 'ACTIVE').length} detail={kes(state.contracts.filter((c) => status(c) === 'ACTIVE').reduce((x, c) => x + c.value, 0), { compact: true })} icon={<FileSignature size={17} />} />
        <Stat label="In review" value={state.contracts.filter((c) => c.status === 'REVIEW').length} icon={<CheckCircle2 size={17} />} tone="gold" />
        <Stat label="Awaiting signature" value={state.contracts.filter((c) => c.status === 'SENT').length} icon={<Send size={17} />} tone="blue" />
        <Stat label="Expiring in 30 days" value={expiring.length} detail={expiring.map((c) => c.number).join(', ') || 'None'} icon={<Clock3 size={17} />} tone={expiring.length ? 'red' : 'slate'} />
      </div>
      <DataTable rows={state.contracts} columns={cols} rowKey={(c) => c.id} onRowClick={(c) => setOpenId(c.id)} selected={openId} initialSort={{ key: 'n', dir: 'desc' }} />
      {current && <ContractDrawer c={current} onClose={() => setOpenId(null)} />}
      {creating && <ContractEditor onClose={() => setCreating(false)} onSaved={(id) => (setCreating(false), setOpenId(id))} />}
    </SuitePage>
  );
};

const ContractDrawer: React.FC<{ c: Contract; onClose: () => void }> = ({ c, onClose }) => {
  const { state, actor, party, completeStep, submitContract, approveContract, signContract, terminateContract } = useCommercial();
  const [doc, setDoc] = useState<Record<number, string>>({});
  const [signing, setSigning] = useState<'COMPANY' | 'CUSTOMER' | null>(null);
  const [reason, setReason] = useState('');
  const p = party(c.customerId);
  return (
    <Drawer
      wide
      title={c.title}
      subtitle={`${c.number} · ${p?.name}`}
      badge={<Pill status={PILL[c.status]} label={c.status.toLowerCase()} />}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => printDocument(`${c.number}`, contractHtml(c, p))}>
            <Printer size={14} /> Print / PDF
          </button>
          <span className="sx-grow" />
          {c.status === 'DRAFT' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => submitContract(c.id)}>
              Send for review
            </button>
          )}
          {c.status === 'REVIEW' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => approveContract(c.id)}>
              <CheckCircle2 size={14} /> Approve & send for signature
            </button>
          )}
          {(c.status === 'SENT' || c.status === 'SIGNED') && (
            <>
              {!c.signatures.some((s) => s.party === 'CUSTOMER') && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSigning('CUSTOMER')}>
                  Record customer e-signature
                </button>
              )}
              {!c.signatures.some((s) => s.party === 'COMPANY') && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setSigning('COMPANY')}>
                  <FileSignature size={14} /> Sign for the company
                </button>
              )}
            </>
          )}
        </>
      }
    >
      <DefList
        items={[
          ['Period', `${fmtDate(c.start)} – ${fmtDate(c.end)}${c.status === 'ACTIVE' ? ` · ${daysBetween(TODAY, c.end)} days left` : ''}`],
          ['Value', kes(c.value)],
          ['Price list', state.priceLists.find((x) => x.id === c.priceListId)?.name ?? '—'],
          ['Prepared by', c.preparedBy],
          ['Approved by', c.approvedBy ?? '—'],
          ['Signatures', c.signatures.map((s) => `${s.party === 'COMPANY' ? 'Company' : 'Customer'}: ${s.text}`).join(' · ') || '—']
        ]}
      />
      {(c.status === 'SENT' || c.status === 'SIGNED') && (
        <div className="tr-sim">E-signing is simulated: signatures are captured in-app with the signer's PIN and time-stamped in the audit trail. A qualified signing provider (e.g. DocuSign) is not connected.</div>
      )}
      <h4 className="sx-subhead">Steps</h4>
      <ul className="tr-steps">
        {c.steps.map((s, i) => (
          <li key={i}>
            <span className={s.done ? 'ok' : ''}>{s.done ? <CheckCircle2 size={15} /> : i + 1}</span>
            <span>
              <b>{s.name}</b> <small className="sx-muted">{s.external ? 'external · ' : ''}{s.owner} · due {fmtDate(s.due)}{s.done ? ` · done ${s.by}${s.docName ? ` (${s.docName})` : ''}` : ''}</small>
            </span>
            {!s.done && !['TERMINATED', 'EXPIRED'].includes(c.status) && (
              <span className="tr-row">
                {s.external && <input className="form-control" aria-label="Document reference" placeholder="Document / ref" value={doc[i] ?? ''} onChange={(e) => setDoc({ ...doc, [i]: e.target.value })} />}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => completeStep(c.id, i, doc[i] ?? '')}>
                  Done
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <h4 className="sx-subhead">Clauses</h4>
      <ol className="tr-clauses">
        {c.clauses.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ol>
      <Attachments owner={`contract:${c.number}`} by={actor.name} title="Signed copies and correspondence" />
      {c.status === 'ACTIVE' && (
        <div className="tr-row">
          <input className="form-control grow" placeholder="Reason for termination" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className="btn btn-danger btn-sm" onClick={() => terminateContract(c.id, reason)}>
            Terminate
          </button>
        </div>
      )}
      <h4 className="sx-subhead">History</h4>
      <ul className="sx-list">
        {[...c.history].reverse().map((h, i) => (
          <li key={i}>
            <span className="sx-muted">{fmtDate(h.at.slice(0, 10))}</span>
            <span>{h.action}</span>
            <span className="sx-muted">{h.note}</span>
            <b>{h.by}</b>
          </li>
        ))}
      </ul>
      {signing && (
        <SignModal
          signer={signing === 'COMPANY' ? actor.name : (p?.name ?? 'Customer')}
          meaning={signing === 'COMPANY' ? `Sign ${c.number} on behalf of the company` : `Customer signature on ${c.number} (captured from the e-signature link)`}
          onClose={() => setSigning(null)}
          onSign={(sig) => {
            signContract(c.id, sig, signing);
            setSigning(null);
          }}
        />
      )}
    </Drawer>
  );
};

const ContractEditor: React.FC<{ onClose: () => void; onSaved: (id: string) => void }> = ({ onClose, onSaved }) => {
  const { state, generateContract } = useCommercial();
  const [d, setD] = useState({ customerId: '', templateId: state.contractTemplates[0]?.id ?? '', title: '', start: TODAY, end: addDays(TODAY, 365), value: 0, priceListId: '' });
  const t = state.contractTemplates.find((x) => x.id === d.templateId);
  return (
    <Modal
      title="New contract"
      subtitle="Generated from a template — clauses fill in the customer, dates, price list and credit terms"
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
              const r = generateContract({ ...d, priceListId: d.priceListId || undefined });
              if (r.ok && r.id) onSaved(r.id);
            }}
          >
            Generate contract
          </button>
        </>
      }
    >
      <div className="sx-grid">
        <Field label="Customer" required span={2}>
          <PartySelect kind="CUSTOMER" value={d.customerId} onChange={(v) => setD({ ...d, customerId: v })} />
        </Field>
        <Field label="Template">
          <select className="form-control" value={d.templateId} onChange={(e) => setD({ ...d, templateId: e.target.value })}>
            {state.contractTemplates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title" required>
          <input className="form-control" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        </Field>
        <Field label="Start">
          <input className="form-control" type="date" value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} />
        </Field>
        <Field label="End">
          <input className="form-control" type="date" value={d.end} onChange={(e) => setD({ ...d, end: e.target.value })} />
        </Field>
        <Field label="Estimated value (KES)">
          <input className="form-control" type="number" value={d.value} onChange={(e) => setD({ ...d, value: Number(e.target.value) })} />
        </Field>
        <Field label="Contract price list">
          <select className="form-control" value={d.priceListId} onChange={(e) => setD({ ...d, priceListId: e.target.value })}>
            <option value="">Current list prices</option>
            {state.priceLists
              .filter((x) => x.status !== 'RETIRED' && (!x.customerId || x.customerId === d.customerId))
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {t && (
        <>
          <h4 className="sx-subhead">Steps this template tracks</h4>
          <ul className="sx-list">
            {t.steps.map((s) => (
              <li key={s.name}>
                <span>{s.name}</span>
                <span className="sx-muted">
                  {s.owner}
                  {s.external ? ' · external' : ''} · {s.days} days
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
};
