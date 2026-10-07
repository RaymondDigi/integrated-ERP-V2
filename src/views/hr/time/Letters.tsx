import React from 'react';
import { Printer } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Modal } from '../payroll/shared';
import { printArea } from '../../ess/EssRecords';
import { APPEAL_DAYS, CATEGORY_LABEL, SANCTION_LABEL, WARNING_MONTHS, type DisciplinaryCase, type LetterKind } from '../../../data/discipline';
import { addDays, daysBetween, fmtDate } from '../../../data/timeEngine';
import { HR_OFFICER } from '../../../data/timeConfig';

export const LETTER_TITLE: Record<LetterKind, string> = {
  SHOW_CAUSE: 'Notice to show cause',
  HEARING: 'Notice of disciplinary hearing',
  WARNING: 'Warning letter',
  SUSPENSION: 'Suspension letter',
  OUTCOME: 'Notice of termination'
};

/** Letters that can be produced at the case's current stage. */
export const lettersFor = (c: DisciplinaryCase): LetterKind[] => {
  const out: LetterKind[] = [];
  if (c.showCause) out.push('SHOW_CAUSE');
  if (c.hearing) out.push('HEARING');
  const s = c.outcome?.sanction;
  if (s && WARNING_MONTHS[s]) out.push('WARNING');
  if (s === 'SUSPENSION') out.push('SUSPENSION');
  if (s === 'SUMMARY_DISMISSAL' || s === 'TERMINATION_NOTICE') out.push('OUTCOME');
  return out;
};

export const LetterModal: React.FC<{ c: DisciplinaryCase; kind: LetterKind; onClose: () => void }> = ({ c, kind, onClose }) => {
  const { hrEmployees, activeTenant, timeToday } = useApp();
  const e = hrEmployees.find((x) => x.staffId === c.staffId);
  const o = c.outcome;
  const dated = kind === 'SHOW_CAUSE' ? c.showCause?.issuedOn : kind === 'HEARING' ? c.timeline.find((t) => /hearing set|hearing scheduled/i.test(t.text))?.at ?? timeToday : o?.decidedOn ?? timeToday;
  const sign = (
    <div className="tm-letter-sign">
      <p>Yours faithfully,</p>
      <div className="tm-sig-line" />
      <p>
        <strong>{HR_OFFICER}</strong>
        <br />
        HR & Payroll Officer, for {activeTenant.name}
      </p>
      <p className="tm-ack">
        Received by employee: ______________________ Signature: ____________ Date: ____________
      </p>
    </div>
  );
  return (
    <Modal
      title={LETTER_TITLE[kind]}
      subtitle={`${c.id} · ${e?.fullName ?? c.staffId}`}
      onClose={onClose}
      width={820}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={printArea}>
            <Printer size={14} /> Print
          </button>
        </>
      }
    >
      <article className="tm-letter ess-print-area">
        <header>
          <div>
            <strong>{activeTenant.name}</strong>
            <span>P.O. Box 120-20200, Kericho · hr@intergrated-erp.ke</span>
          </div>
          <div className="tm-letter-ref">
            Ref: {c.id}/{kind.replace('_', '-')}
            <br />
            {fmtDate(dated ?? timeToday)}
          </div>
        </header>
        <p className="tm-letter-to">
          <strong>{e?.fullName}</strong>
          <br />
          Staff no. {c.staffId} · {e?.jobTitle}
          <br />
          {e?.department}
          <br />
          <em>Private and confidential, by hand</em>
        </p>
        <p>Dear {e?.fullName.split(' ')[0]},</p>

        {kind === 'SHOW_CAUSE' && c.showCause && (
          <>
            <h4>RE: Notice to show cause ({CATEGORY_LABEL[c.category].toLowerCase()})</h4>
            <p>It has been brought to the attention of management that: {c.showCause.allegations}</p>
            <p>Details: {c.summary}</p>
            <p>
              You are required to explain in writing why disciplinary action should not be taken against you. Your written response should reach the Human Resources office by <strong>{fmtDate(c.showCause.responseDue, true)}</strong>.
            </p>
            <p>
              Under section 41 of the Employment Act, 2007 you will be given a chance to be heard before any decision is made, and you may be accompanied at any hearing by a fellow employee or a shop-floor union representative of your choice. If no response is received by the date above, management may proceed on the information available.
            </p>
          </>
        )}

        {kind === 'HEARING' && c.hearing && (
          <>
            <h4>RE: Notice of disciplinary hearing</h4>
            <p>
              Further to the notice to show cause dated {c.showCause ? fmtDate(c.showCause.issuedOn) : '—'}, you are invited to a disciplinary hearing on <strong>{fmtDate(c.hearing.date, true)} at {c.hearing.time}</strong> in {c.hearing.venue}.
            </p>
            <p>The matter to be heard: {c.summary}</p>
            <p>Panel: {c.hearing.panel.join(', ')}.</p>
            <p>
              You have the right to be accompanied by a fellow employee or a shop-floor union representative of your choice (Employment Act s.41). You have told us your representative will be: <strong>{c.hearing.representative}</strong>. You may bring any witnesses or documents you wish to rely on.
            </p>
          </>
        )}

        {kind === 'WARNING' && o && (
          <>
            <h4>RE: {SANCTION_LABEL[o.sanction]}</h4>
            <p>
              {c.hearing ? `Following the disciplinary hearing held on ${fmtDate(c.hearing.date)}` : 'Following our review of the matter'}, at which you were given the opportunity to respond{c.hearing ? ` and were accompanied by ${c.hearing.representative.toLowerCase().startsWith('declined') ? 'nobody, by your choice' : c.hearing.representative}` : ''}, management has found that: {c.summary}
            </p>
            <p>Reasons: {o.reasons}</p>
            <p>
              You are hereby issued with a <strong>{SANCTION_LABEL[o.sanction].toLowerCase()}</strong>. It will remain on your file until <strong>{o.expiresOn ? fmtDate(o.expiresOn) : '—'}</strong>
              {o.expiresOn ? ` (${Math.round(daysBetween(o.decidedOn, o.expiresOn) / 30)} months)` : ''}. A further offence during this period may lead to more serious action{o.sanction === 'FINAL_WRITTEN' ? ', up to and including termination of employment' : ''}.
            </p>
            <p>You may appeal in writing to the General Manager within {APPEAL_DAYS} days of this letter.</p>
          </>
        )}

        {kind === 'SUSPENSION' && o?.suspension && (
          <>
            <h4>RE: Suspension {o.suspension.pay === 'HALF' ? 'on half pay' : 'without pay'}</h4>
            <p>
              Following the disciplinary hearing{c.hearing ? ` held on ${fmtDate(c.hearing.date)}` : ''}, management has found that: {c.summary}
            </p>
            <p>Reasons: {o.reasons}</p>
            <p>
              You are suspended from duty from <strong>{fmtDate(o.suspension.from, true)}</strong> to <strong>{fmtDate(o.suspension.to, true)}</strong> inclusive ({daysBetween(o.suspension.from, o.suspension.to) + 1} calendar days),{' '}
              {o.suspension.pay === 'HALF' ? 'on half of your basic pay and allowances for those days' : 'without pay for those days'}. The deduction will be made through payroll.
            </p>
            <p>During the suspension you must not report to work or enter company premises unless asked to, and you must remain available to the company. Report back to your supervisor on {fmtDate(addDays(o.suspension.to, 1), true)} at the start of your shift.</p>
            <p>You may appeal in writing to the General Manager within {APPEAL_DAYS} days of this letter.</p>
          </>
        )}

        {kind === 'OUTCOME' && o && (
          <>
            <h4>RE: {SANCTION_LABEL[o.sanction]}</h4>
            <p>Following the disciplinary hearing{c.hearing ? ` held on ${fmtDate(c.hearing.date)}` : ''}, management has found that: {c.summary}</p>
            <p>Reasons: {o.reasons}</p>
            <p>
              {o.sanction === 'SUMMARY_DISMISSAL'
                ? `Your employment is terminated summarily under section 44 of the Employment Act, 2007 with effect from ${fmtDate(o.effectiveDate ?? o.decidedOn)}.`
                : `Your employment is terminated with ${o.noticeDays ?? 30} days' notice; your last working day will be ${fmtDate(o.effectiveDate ?? o.decidedOn)}.`}{' '}
              Your final dues and certificate of service will be processed by the Human Resources office through the separation process.
            </p>
            <p>You may appeal in writing to the General Manager within {APPEAL_DAYS} days of this letter.</p>
          </>
        )}
        {sign}
      </article>
    </Modal>
  );
};
