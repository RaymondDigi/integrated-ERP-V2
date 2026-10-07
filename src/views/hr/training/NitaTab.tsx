import React, { useMemo, useState } from 'react';
import { FileUp, Receipt } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useFinance } from '../../../suites/finance/store';
import { Modal } from '../payroll/shared';
import { MONTHS, latestPaidMonth } from '../../../data/payrollEngine';
import { NITA_DAILY_CAP, NITA_LEVY_PER_EMPLOYEE, courseById, type ClaimStatus, type NitaClaim } from '../../../data/trainingConfig';
import { costPerPerson, kes, nitaClaimable, nitaLevyYtd, sessionCost } from '../../../data/trainingEngine';
import { addDays, fmtDate } from '../../../data/timeEngine';
import { Empty, Pill, useTrainingOrg } from './shared';

const CLAIM_CLS: Record<ClaimStatus, string> = { Draft: 'primary', Submitted: 'info', Approved: 'warning', Paid: 'success' };
const NEXT: Partial<Record<ClaimStatus, ClaimStatus>> = { Draft: 'Submitted', Submitted: 'Approved', Approved: 'Paid' };

export const NitaTab: React.FC = () => {
  const { hrEmployees, selectedOrgId, payrollCtx, nitaClaims, createNitaClaim, advanceNitaClaim, markSessionBilled, addToast } = useApp();
  const finance = useFinance();
  const { sessions, year, today } = useTrainingOrg();
  const [picked, setPicked] = useState<string[]>([]);
  const [step, setStep] = useState<{ claim: NitaClaim; ref: string; amount: string } | null>(null);

  const levy = useMemo(() => nitaLevyYtd(hrEmployees, selectedOrgId, year, latestPaidMonth(new Date()), payrollCtx), [hrEmployees, selectedOrgId, year, payrollCtx]);
  const levyYtd = levy.reduce((s, m) => s + m.levy, 0);
  const claims = nitaClaims.filter((c) => c.orgId === selectedOrgId && c.createdOn.startsWith(String(year)));
  const claimed = claims.reduce((s, c) => s + (c.approvedAmount ?? c.amount), 0);
  const headroom = Math.max(0, levyYtd - claimed);
  const inClaim = new Set(nitaClaims.flatMap((c) => c.sessionIds));

  const spend = useMemo(() => sessions.filter((s) => s.status === 'Completed' && s.start.startsWith(String(year))).sort((a, b) => b.end.localeCompare(a.end)), [sessions, year]);
  const claimable = spend.filter((s) => nitaClaimable(s) > 0 && !inClaim.has(s.id));
  const pickedTotal = claimable.filter((s) => picked.includes(s.id)).reduce((t, s) => t + nitaClaimable(s), 0);
  const claimAmount = Math.min(pickedTotal, headroom);
  const totalSpend = spend.reduce((t, s) => t + sessionCost(s), 0);

  const postBill = (sessionId: string) => {
    const s = sessions.find((x) => x.id === sessionId)!;
    const c = courseById(s.courseId)!;
    const findParty = () => finance.snapshot().parties.find((p) => p.kind === 'SUPPLIER' && p.name.toLowerCase() === c.provider.toLowerCase());
    if (!findParty()) {
      const r = finance.saveParty({ id: '', kind: 'SUPPLIER', name: c.provider, pin: '', email: '', phone: '', terms: 30, category: 'Training' });
      if (!r.ok) return;
    }
    const party = findParty();
    if (!party) return;
    const r = finance.saveDocument(
      {
        kind: 'BILL',
        partyId: party.id,
        date: today,
        dueDate: addDays(today, party.terms || 30),
        reference: s.invoiceNo ?? s.id,
        department: 'Administration',
        notes: `Training session ${s.id}`,
        lines: [{ id: `l${Date.now().toString(36)}`, description: `${c.title} (${s.id}, ${fmtDate(s.start)})`, account: '6000', qty: 1, price: sessionCost(s), vat: false }]
      },
      'Learning & development'
    );
    if (!r.ok || !r.id) return;
    const bill = finance.snapshot().documents.find((d) => d.id === r.id);
    markSessionBilled(s.id, bill?.number ?? r.id);
  };

  const advance = () => {
    if (!step) return;
    const to = NEXT[step.claim.status]!;
    if (to === 'Submitted') advanceNitaClaim(step.claim.id, { status: to, submittedOn: today, nitaRef: step.ref.trim() });
    if (to === 'Approved') advanceNitaClaim(step.claim.id, { status: to, approvedAmount: Math.round(Number(step.amount)) });
    if (to === 'Paid') advanceNitaClaim(step.claim.id, { status: to, paidOn: today });
    setStep(null);
  };

  return (
    <>
      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>NITA training levy {year}</h3>
            <p>
              Payroll charges KES {NITA_LEVY_PER_EMPLOYEE} per employee each month. Approved courses can be claimed back up to the levy paid. NITA reimburses up to {kes(NITA_DAILY_CAP)} per participant per training day.
            </p>
          </div>
        </div>
        <div className="pr-kv">
          <div>
            <span>Levy paid to date</span>
            <strong>{kes(levyYtd)}</strong>
            <small>{levy.length} payroll months</small>
          </div>
          <div>
            <span>Claimed this year</span>
            <strong>{kes(claimed)}</strong>
            <small>{claims.length} claims</small>
          </div>
          <div>
            <span>Still claimable</span>
            <strong>{kes(headroom)}</strong>
            <small>Levy paid less claims</small>
          </div>
          <div>
            <span>Training spend</span>
            <strong>{kes(totalSpend)}</strong>
            <small>{spend.length} sessions closed</small>
          </div>
        </div>
        <div className="tr-levy" role="list" aria-label="Levy by month">
          {levy.map((m) => (
            <div key={m.month} role="listitem">
              <span>{MONTHS[m.month].slice(0, 3)}</span>
              <strong>{m.levy.toLocaleString()}</strong>
              <small>{m.staff} staff</small>
            </div>
          ))}
        </div>
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Training spend</h3>
            <p>Actual cost of each closed session. External invoices can be raised as supplier bills in Finance (staff costs, account 6000).</p>
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Session</th>
                <th className="num">Attended</th>
                <th className="num">Actual cost</th>
                <th className="num">Per head</th>
                <th className="num">NITA claimable</th>
                <th>Finance</th>
              </tr>
            </thead>
            <tbody>
              {spend.length === 0 && <Empty cols={6}>No closed sessions this year.</Empty>}
              {spend.map((s) => {
                const c = courseById(s.courseId);
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{c?.title}</strong>
                      <div className="muted">
                        {s.id} · {fmtDate(s.end)}
                        {s.invoiceNo ? ` · ${s.invoiceNo}` : ''}
                      </div>
                    </td>
                    <td className="num">{s.enrolments.filter((e) => e.status === 'Attended').length}</td>
                    <td className="num">{kes(sessionCost(s))}</td>
                    <td className="num">{kes(costPerPerson(s))}</td>
                    <td className="num">{c?.nitaApproved ? kes(nitaClaimable(s)) : <span className="muted">Not approved</span>}</td>
                    <td>
                      {s.financeBill ? (
                        <Pill cls="success">{s.financeBill}</Pill>
                      ) : c?.providerType === 'External' && sessionCost(s) > 0 ? (
                        <button className="btn btn-secondary btn-sm" onClick={() => postBill(s.id)}>
                          <FileUp size={13} /> Raise bill
                        </button>
                      ) : (
                        <span className="muted">Internal</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Reimbursement claim builder</h3>
            <p>Pick closed NITA-approved sessions that are not yet in a claim.</p>
          </div>
        </div>
        {claimable.length === 0 ? (
          <p className="pr-muted">Every closed NITA-approved session is already in a claim.</p>
        ) : (
          <>
            <ul className="tr-claim-pick">
              {claimable.map((s) => (
                <li key={s.id}>
                  <label>
                    <input type="checkbox" checked={picked.includes(s.id)} onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))} />
                    <span>
                      <strong>{courseById(s.courseId)?.title}</strong> · {s.id} · {fmtDate(s.end)} · {s.enrolments.filter((e) => e.status === 'Attended').length} attended
                    </span>
                    <b>{kes(nitaClaimable(s))}</b>
                  </label>
                </li>
              ))}
            </ul>
            <div className="tr-claim-total">
              <span>
                Claimable {kes(pickedTotal)}
                {pickedTotal > headroom && <span className="tr-neg"> · capped at levy headroom {kes(headroom)}</span>}
              </span>
              <button
                className="btn btn-primary"
                disabled={!claimAmount}
                onClick={() => {
                  createNitaClaim(picked, claimAmount);
                  setPicked([]);
                }}
              >
                <Receipt size={14} /> Create draft claim
              </button>
            </div>
          </>
        )}
      </div>

      <div className="pr-card">
        <h3 className="tm-h3">Claims</h3>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Claim</th>
                <th>Sessions</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th aria-label="Next step" />
              </tr>
            </thead>
            <tbody>
              {claims.length === 0 && <Empty cols={5}>No claims yet.</Empty>}
              {claims.map((c) => (
                <tr key={c.id} data-claim={c.id}>
                  <td>
                    <strong>{c.id}</strong>
                    <div className="muted">
                      Created {fmtDate(c.createdOn)}
                      {c.nitaRef ? ` · ${c.nitaRef}` : ''}
                    </div>
                  </td>
                  <td className="muted">{c.sessionIds.map((id) => `${id} ${courseById(sessions.find((s) => s.id === id)?.courseId)?.title ?? ''}`).join('; ')}</td>
                  <td className="num">
                    {kes(c.amount)}
                    {c.approvedAmount !== undefined && c.approvedAmount !== c.amount && <div className="muted">Approved {kes(c.approvedAmount)}</div>}
                  </td>
                  <td>
                    <Pill cls={CLAIM_CLS[c.status]}>{c.status}</Pill>
                    {c.paidOn && <div className="muted">Paid {fmtDate(c.paidOn)}</div>}
                  </td>
                  <td>
                    {NEXT[c.status] && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          if (c.status === 'Approved') {
                            advanceNitaClaim(c.id, { status: 'Paid', paidOn: today });
                            addToast({ type: 'info', title: 'Refund received', message: `${kes(c.approvedAmount ?? c.amount)} from NITA.` });
                          } else setStep({ claim: c, ref: `NITA/RB/${year % 100}/${1200 + claims.length}`, amount: String(c.amount) });
                        }}
                      >
                        {c.status === 'Draft' ? 'Submit to NITA' : c.status === 'Submitted' ? 'Record approval' : 'Mark paid'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {step && (
        <Modal
          title={step.claim.status === 'Draft' ? 'Submit claim to NITA' : 'Record NITA approval'}
          subtitle={`${step.claim.id} · ${kes(step.claim.amount)}`}
          onClose={() => setStep(null)}
          width={460}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setStep(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={step.claim.status === 'Draft' ? !step.ref.trim() : !(Number(step.amount) > 0)} onClick={advance}>
                {step.claim.status === 'Draft' ? 'Submit' : 'Save approval'}
              </button>
            </>
          }
        >
          {step.claim.status === 'Draft' ? (
            <label className="req-field">
              <span>NITA reference</span>
              <input className="form-control" value={step.ref} onChange={(ev) => setStep({ ...step, ref: ev.target.value })} />
            </label>
          ) : (
            <label className="req-field">
              <span>Amount approved (KES)</span>
              <input type="number" min={0} className="form-control" value={step.amount} onChange={(ev) => setStep({ ...step, amount: ev.target.value })} />
            </label>
          )}
          <p className="pr-note">Attach attendance registers, invoices and receipts for each session when submitting on the NITA portal.</p>
        </Modal>
      )}
    </>
  );
};
