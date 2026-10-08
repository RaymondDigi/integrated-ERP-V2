import React, { useState } from 'react';
import { CheckCircle2, Circle, AlertTriangle, Lock, LockOpen, History } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { MONTHS } from '../../../data/payrollEngine';

/** Who may close a period, and who may authorise reopening one. */
const CLOSERS = ['Rose Chepkoech (HR & Payroll Officer)', 'David Otieno (Finance Manager)'];
const AUTHORISERS = ['David Otieno (Finance Manager)', 'Amina Hassan (Finance Director)'];

const labelOf = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const prevKey = (y: number, m: number) => {
  const d = new Date(y, m - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

interface Props {
  /** Status of the selected company's monthly batch for the open period */
  status?: 'DRAFT' | 'CALCULATED' | 'AUDIT_APPROVED' | 'DISBURSED_MPESA' | 'POSTED_GL';
  glRef?: string;
  flagged: number;
  deferred: number;
}

const Check: React.FC<{ ok: boolean; warn?: boolean; children: React.ReactNode }> = ({ ok, warn, children }) => (
  <li className={`pc-check ${ok ? 'ok' : warn ? 'warn' : 'todo'}`}>
    {ok ? <CheckCircle2 size={15} /> : warn ? <AlertTriangle size={15} /> : <Circle size={15} />}
    <span>{children}</span>
  </li>
);

/**
 * Period control: a period is closed once its payroll is approved and posted to the ledger, which freezes its
 * payslips and moves posting to the next month. Only the most recently closed month can be reopened, by an
 * authorised Finance officer with a reason; it then has to be corrected, re-approved, re-posted and closed again.
 */
export const PeriodControl: React.FC<Props> = ({ status, glRef, flagged, deferred }) => {
  const { payrollOpenPeriod: open, reopenedPayrollPeriod, payrollPeriodLog, closePayrollPeriod, reopenLastPayrollPeriod } = useApp();
  const [closer, setCloser] = useState(CLOSERS[0]);
  const [note, setNote] = useState('');
  const [authoriser, setAuthoriser] = useState(AUTHORISERS[0]);
  const [reason, setReason] = useState('');
  const [confirmReopen, setConfirmReopen] = useState(false);

  const calculated = !!status && status !== 'DRAFT';
  const approved = status === 'AUDIT_APPROVED' || status === 'DISBURSED_MPESA' || status === 'POSTED_GL';
  const posted = status === 'POSTED_GL';
  const last = prevKey(open.year, open.month);
  const lastClose = payrollPeriodLog.find((l) => l.period === last && l.action === 'CLOSED');
  const currentApproved = approved;

  return (
    <div className="pc-grid">
      <div className="pc-panel">
        <div className="pc-panel-head">
          <Lock size={16} />
          <div>
            <h4>Close {open.label}</h4>
            <p>Closing makes the period's payslips, P10 and journal final. Posting moves on to the next month.</p>
          </div>
        </div>
        <ul className="pc-checks">
          <Check ok={calculated}>Payroll calculated</Check>
          <Check ok={approved}>Approved by Finance</Check>
          <Check ok={posted}>Posted to the ledger{posted && glRef ? ` (journal ${glRef})` : ''}</Check>
          <Check ok={flagged === 0} warn={flagged > 0}>
            {flagged ? `${flagged} payslip${flagged > 1 ? 's' : ''} flagged for review` : 'No flagged payslips'}
          </Check>
          <Check ok={deferred === 0} warn={deferred > 0}>
            {deferred ? `KES ${Math.round(deferred).toLocaleString()} of deductions deferred to next month` : 'No deferred deductions'}
          </Check>
          <Check ok={false} warn>
            Bank files uploaded and statutory returns (P10, NSSF, SHIF, housing levy) filed — confirm before closing
          </Check>
        </ul>
        <div className="pr-form-grid">
          <label className="req-field">
            <span>Closed by</span>
            <select className="form-control" value={closer} onChange={(ev) => setCloser(ev.target.value)}>
              {CLOSERS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="req-field">
            <span>Note (optional)</span>
            <input className="form-control" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="e.g. Bank files released; P10 filed" />
          </label>
        </div>
        <div className="pc-actions">
          <button className="btn btn-primary" disabled={!posted} title={posted ? '' : 'Approve and post to the ledger first'} onClick={() => closePayrollPeriod(closer.split(' (')[0], note) && setNote('')}>
            <Lock size={14} /> Close {open.label}
          </button>
        </div>
      </div>

      <div className={`pc-panel ${reopenedPayrollPeriod ? 'pc-reopened' : ''}`}>
        <div className="pc-panel-head">
          <LockOpen size={16} />
          <div>
            <h4>{reopenedPayrollPeriod ? `${labelOf(reopenedPayrollPeriod)} is reopened` : `Reopen ${labelOf(last)}`}</h4>
            <p>
              {reopenedPayrollPeriod
                ? 'Correct the items, re-approve, re-post the journal and close it again. The next month opens once it is closed.'
                : 'For corrections after closing. Only the last closed month can be reopened, one at a time, with Finance authorisation.'}
            </p>
          </div>
        </div>
        {reopenedPayrollPeriod ? (
          <div className="pr-note warn">
            <AlertTriangle size={13} /> Payslips already issued for {labelOf(reopenedPayrollPeriod)} will be replaced when it is closed again. Send employees the corrected payslips and file amended returns if PAYE or NSSF changed.
          </div>
        ) : (
          <>
            <ul className="pc-checks">
              <Check ok={!currentApproved} warn={currentApproved}>
                {currentApproved ? `${open.label} is already approved — close it first` : `${open.label} not yet approved`}
              </Check>
              <Check ok={false} warn>
                Payslips, P10 and the bank payment for {labelOf(last)} have gone out{lastClose?.glRef ? `; journal ${lastClose.glRef} will need reversing or adjusting` : ''}
              </Check>
            </ul>
            <div className="pr-form-grid">
              <label className="req-field">
                <span>Authorised by</span>
                <select className="form-control" value={authoriser} onChange={(ev) => setAuthoriser(ev.target.value)}>
                  {AUTHORISERS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="req-field wide">
                <span>Reason *</span>
                <textarea className="form-control" rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Overtime for the factory night shift was left out; arrears must be paid in the period they were earned" />
              </label>
            </div>
            <div className="pc-actions">
              {confirmReopen ? (
                <>
                  <span className="hi-sub">Reopen {labelOf(last)}? {open.label} waits until it is closed again.</span>
                  <button className="btn btn-secondary" onClick={() => setConfirmReopen(false)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      if (reopenLastPayrollPeriod(authoriser.split(' (')[0], reason)) setReason('');
                      setConfirmReopen(false);
                    }}
                  >
                    <LockOpen size={14} /> Yes, reopen
                  </button>
                </>
              ) : (
                <button className="btn btn-secondary" disabled={currentApproved || reason.trim().length < 10} title={reason.trim().length < 10 ? 'Give a reason (at least 10 characters)' : ''} onClick={() => setConfirmReopen(true)}>
                  <LockOpen size={14} /> Reopen {labelOf(last)}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="pc-panel pc-wide">
        <div className="pc-panel-head">
          <History size={16} />
          <div>
            <h4>Period log</h4>
            <p>Every close and reopen this session, with who did it and why.</p>
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Period</th>
                <th>Action</th>
                <th>By</th>
                <th>Reason / note</th>
                <th>Journal</th>
              </tr>
            </thead>
            <tbody>
              {payrollPeriodLog.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--text-tertiary)' }}>
                    No periods closed or reopened yet. Earlier months were closed when they were paid.
                  </td>
                </tr>
              ) : (
                payrollPeriodLog.map((l, i) => (
                  <tr key={i}>
                    <td>{l.on}</td>
                    <td>
                      <strong>{labelOf(l.period)}</strong>
                    </td>
                    <td>
                      <span className={`digicraft-status-pill ${l.action === 'CLOSED' ? 'success' : 'warning'}`}>{l.action === 'CLOSED' ? 'Closed' : 'Reopened'}</span>
                    </td>
                    <td>{l.by}</td>
                    <td className="hi-wrap">{l.note ?? '—'}</td>
                    <td className="hi-mono">{l.glRef ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
