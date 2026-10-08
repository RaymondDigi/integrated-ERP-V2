import React, { useState } from 'react';
import { Send, CheckCircle2, XCircle, BookCheck, Ban, Pencil, Info, ShieldCheck, UserRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useFinance, type Collection } from './store';
import { kes, permissions, ROLE_LABEL } from './engine';
import { ACTORS } from './data';
import { Stepper, Timeline } from '../ui/kit';
import type { FinDocument, FinRole, Journal, Memo, Settlement } from './types';
import { CompanyLogo } from '../../views/CompanySetupView';

export const useLookups = () => {
  const { state } = useFinance();
  const party = (id: string) => state.parties.find((p) => p.id === id);
  const account = (code: string) => state.accounts.find((a) => a.code === code);
  const accountLabel = (code: string) => {
    const a = account(code);
    return a ? `${a.code} · ${a.name}` : code;
  };
  return { party, account, accountLabel };
};

/** Lets a demo switch between preparer and approvers to show segregation of duties. */
export const ActorSwitcher: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { actor, setActor } = useFinance();
  return (
    <div className={`sx-actor ${compact ? 'compact' : ''}`}>
      {!compact && (
        <span className="sx-actor-label">
          <UserRound size={13} /> Acting as
        </span>
      )}
      <select value={actor.role} onChange={(e) => setActor(e.target.value as FinRole)} aria-label="Acting as">
        {(Object.keys(ACTORS) as FinRole[]).map((r) => (
          <option key={r} value={r}>
            {ACTORS[r].name} — {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
    </div>
  );
};

type AnyDoc = FinDocument | Settlement | Journal | Memo;

/** Stepper, available actions and history for any finance document. */
export const WorkflowPanel: React.FC<{ collection: Collection; doc: AnyDoc; onEdit?: () => void }> = ({ collection, doc, onEdit }) => {
  const { state, actor, transition } = useFinance();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const p = permissions(state, doc, actor);

  const act = (a: 'submit' | 'approve' | 'post' | 'void') => transition(collection, doc.id, a);
  const reject = () => {
    const r = transition(collection, doc.id, 'reject', note);
    if (r.ok) {
      setRejecting(false);
      setNote('');
    }
  };
  const lastReject = [...doc.history].reverse().find((h) => h.action === 'Rejected');

  return (
    <div className="sx-workflow">
      <Stepper status={doc.status} approvals={{ done: doc.approvals.length, needed: p.needed }} />
      {doc.status === 'REJECTED' && lastReject && (
        <div className="sx-callout danger">
          <XCircle size={15} />
          <div>
            <b>Returned by {lastReject.by}</b>
            {lastReject.note && <span>{lastReject.note}</span>}
          </div>
        </div>
      )}
      {p.needed > 1 && doc.status !== 'POSTED' && doc.status !== 'VOID' && (
        <p className="sx-note">
          <ShieldCheck size={13} /> Above {kes(p.limit, { compact: true })}: needs the Finance Manager and the Finance Director.
        </p>
      )}
      {p.reason && (
        <p className="sx-note">
          <Info size={13} /> {p.reason}
        </p>
      )}

      {rejecting ? (
        <div className="sx-reject">
          <textarea className="form-control" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should the preparer fix?" autoFocus />
          <div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRejecting(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={reject}>
              <XCircle size={14} /> Return to preparer
            </button>
          </div>
        </div>
      ) : (
        <div className="sx-actions">
          {p.edit && onEdit && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
              <Pencil size={14} /> Edit
            </button>
          )}
          {p.submit && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => act('submit')}>
              <Send size={14} /> Submit for approval
            </button>
          )}
          {p.approve && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => act('approve')}>
              <CheckCircle2 size={14} /> Approve
            </button>
          )}
          {p.reject && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRejecting(true)}>
              <XCircle size={14} /> Reject
            </button>
          )}
          {p.post && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => act('post')}>
              <BookCheck size={14} /> Post to ledger
            </button>
          )}
          {p.void && doc.status !== 'SUBMITTED' && (
            <button type="button" className="btn btn-ghost btn-sm sx-void" onClick={() => act('void')}>
              <Ban size={14} /> Void
            </button>
          )}
        </div>
      )}
      <div className="sx-acting">
        You are acting as <b>{actor.name}</b> ({actor.title}). Prepared by {doc.preparedBy}.
      </div>
      <h4 className="sx-subhead">History</h4>
      <Timeline items={doc.history} />
    </div>
  );
};

/** Letterhead used on printed invoices, vouchers and reports. */
export const PrintHeader: React.FC<{ title: string; number?: string; meta?: [string, string][] }> = ({ title, number, meta = [] }) => {
  const { activeTenant, activeTenantSettings: co } = useApp();
  return (
    <div className="sx-print-head">
      <div className="sx-print-co">
        <CompanyLogo settings={co} size={48} />
        <div>
          <strong>{co.legalName || activeTenant.name}</strong>
          {co.physicalAddress && <span>{co.physicalAddress}</span>}
          <span>
            {[co.kraPin && `PIN ${co.kraPin}`, co.phone, co.email].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>
      <div className="sx-print-title">
        <h2>{title}</h2>
        {number && <b>{number}</b>}
        {meta.map(([k, v]) => (
          <span key={k}>
            {k}: <b>{v}</b>
          </span>
        ))}
      </div>
    </div>
  );
};

export const AccountSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  filter?: (code: string) => boolean;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, filter, placeholder = 'Choose account…', className = 'form-control' }) => {
  const { state } = useFinance();
  const groups = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const;
  const names = { ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Equity', INCOME: 'Income', EXPENSE: 'Expenses' };
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {groups.map((g) => {
        const list = state.accounts.filter((a) => a.type === g && (!filter || filter(a.code)));
        return list.length ? (
          <optgroup key={g} label={names[g]}>
            {list.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} · {a.name}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </select>
  );
};
