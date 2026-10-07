import React, { useMemo, useState } from 'react';
import { CheckCircle2, Printer, XCircle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { HREmployee } from '../../../types';
import { payableIn, payslip, type PayrollContext } from '../../../data/payrollEngine';
import {
  CLEARANCE_DEPTS,
  CLEARANCE_OWNER,
  clearanceDone,
  EXIT_LABEL,
  EXIT_REASONS,
  engineExitType,
  finalDuesItems,
  NOTICE_APPLIES,
  noticeFacts,
  noticeRequired,
  serviceYears,
  STAGE_LABEL,
  STAGES,
  addDays,
  daysBetween,
  type ExitCase,
  type ExitKind
} from '../../../data/sepEngine';
import { Modal } from '../payroll/shared';
import { PayslipDocument } from '../payroll/PayslipDocument';
import { kes } from '../payroll/reports';
import { printArea } from '../../ess/EssRecords';

export const HR_PREPARER = 'Rose Chepkoech';
export const DUES_APPROVERS = ['David Otieno', 'Amina Hassan', 'Rose Chepkoech'];

const fmt = (iso?: string) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDate = fmt;

export const stageCls = (s: ExitCase['stage']) => (s === 'CLOSED' || s === 'PAID' ? 'success' : s === 'APPROVED' ? 'primary' : s === 'WITHDRAWN' ? 'info' : s === 'DUES' ? 'warning' : 'info');

/** The exit month's payslip as payroll will run it, with this case's exit items included. */
export const useFinalSlip = (c: ExitCase | undefined, e: HREmployee | undefined) => {
  const { payrollCtx, payItems, bondFor } = useApp();
  return useMemo(() => {
    if (!c || !e) return null;
    const bond = bondFor(e.staffId, c.lastDay);
    const posted = ['APPROVED', 'PAID', 'CLOSED'].includes(c.stage);
    const drafts = posted ? [] : finalDuesItems(c, e, bond);
    const ctx: PayrollContext = posted
      ? payrollCtx
      : {
          ...payrollCtx,
          items: [...payItems, ...drafts.map((d, i) => ({ ...d, id: `EXIT-${i}`, orgId: e.orgId, postedBy: '', postedOn: '', status: 'ACTIVE' as const }))],
          exitType: { ...payrollCtx.exitType, [e.staffId]: engineExitType(c.kind) }
        };
    const leaver = { ...e, exitDate: c.lastDay };
    const [y, m] = c.lastDay.split('-').map(Number);
    return { slip: payslip(leaver, y, m - 1, ctx), ctx, leaver, drafts, bond };
  }, [c, e, payrollCtx, payItems, bondFor]);
};

/** Final dues in the order of the payroll spec §12.6. */
export const DuesStatement: React.FC<{ c: ExitCase; e: HREmployee }> = ({ c, e }) => {
  const f = useFinalSlip(c, e);
  if (!f) return null;
  const { slip } = f;
  const n = noticeFacts(c, e);
  const sumE = (ids: string[]) => slip.earnings.filter((l) => ids.includes(l.componentId)).reduce((s, l) => s + l.amount, 0);
  const salary = sumE(['BASIC', 'HOUSE', 'TRANSPORT', 'OVERTIME', 'WAGES']);
  const loans = slip.deductions.filter((d) => d.loanId).reduce((s, d) => s + d.deducted, 0);
  const exitDed = slip.deductions.filter((d) => d.componentId === 'OTHER_DEDUCTION' && (d.ref ?? '').startsWith(c.id)).reduce((s, d) => s + d.deducted, 0);
  const statutory = slip.nssf + slip.shif + slip.ahl + slip.paye;
  const other = slip.totalDeductions - statutory - loans - exitDed;
  const unrecovered = slip.deductions.reduce((s, d) => s + d.deferred, 0);
  const rows: [string, number, string?][] = [
    [`Salary for ${slip.daysPaid} of ${slip.daysInPeriod} days in the final month`, salary],
    ...(n.payInLieu ? ([['Pay in lieu of notice', n.payInLieu, `${n.shortfall} days × KES ${kes(n.rate)}`]] as [string, number, string][]) : []),
    ...(sumE(['SEVERANCE']) ? ([['Severance (15 days per completed year)', sumE(['SEVERANCE']), `${serviceYears(e, c.lastDay)} years — tax-free up to the statutory amount`]] as [string, number, string][]) : []),
    ['Untaken annual leave', sumE(['LEAVE_PAY']), slip.earnings.find((l) => l.componentId === 'LEAVE_PAY')?.ref],
    ...(sumE(['GRATUITY']) ? ([['Gratuity', sumE(['GRATUITY']), slip.earnings.find((l) => l.componentId === 'GRATUITY')?.ref]] as [string, number, string?][]) : []),
    ...(slip.gross - salary - n.payInLieu - sumE(['SEVERANCE', 'LEAVE_PAY', 'GRATUITY']) > 0
      ? ([['Other earnings this month', slip.gross - salary - n.payInLieu - sumE(['SEVERANCE', 'LEAVE_PAY', 'GRATUITY'])]] as [string, number][])
      : [])
  ];
  return (
    <div>
      <table className="pr-doc">
        <tbody>
          <tr>
            <th>Final dues — {EXIT_LABEL[c.kind].toLowerCase()}</th>
            <th className="num">KES</th>
          </tr>
          {rows.map(([label, v, ref], i) => (
            <tr key={i}>
              <td>
                {label}
                {ref && <span className="ref">{ref}</span>}
              </td>
              <td className="num">{kes(v)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Gross final pay</td>
            <td className="num">{kes(slip.gross)}</td>
          </tr>
          <tr>
            <td className="indent">Less PAYE, NSSF, SHIF and housing levy</td>
            <td className="num">({kes(statutory)})</td>
          </tr>
          {loans > 0 && (
            <tr>
              <td className="indent">
                Less loans and advances recovered in full<span className="ref">Final settlement — outside the two-thirds limit</span>
              </td>
              <td className="num">({kes(loans)})</td>
            </tr>
          )}
          {exitDed > 0 && (
            <tr>
              <td className="indent">
                Less notice not served, unreturned property, training bond
                {slip.deductions
                  .filter((d) => d.componentId === 'OTHER_DEDUCTION' && (d.ref ?? '').startsWith(c.id))
                  .map((d, i) => (
                    <span key={i} className="ref">
                      {(d.ref ?? '').replace(`${c.id}: `, '')} — KES {kes(d.deducted)}
                    </span>
                  ))}
              </td>
              <td className="num">({kes(exitDed)})</td>
            </tr>
          )}
          {other > 0 && (
            <tr>
              <td className="indent">Less pension, SACCO and other deductions</td>
              <td className="num">({kes(other)})</td>
            </tr>
          )}
          <tr className="grand">
            <td>Net final payment</td>
            <td className="num">{kes(slip.net)}</td>
          </tr>
        </tbody>
      </table>
      {unrecovered > 0 && (
        <div className="pr-note bad" style={{ marginTop: 10 }}>
          KES {kes(unrecovered)} could not be recovered from final dues — Finance must pursue it outside payroll or write it off.
        </div>
      )}
      {f.bond && f.bond.amount > 0 && <div className="pr-note" style={{ marginTop: 8 }}>Training bond {f.bond.ref}: KES {kes(f.bond.amount)} still owed on {fmt(c.lastDay)}.</div>}
    </div>
  );
};

const Certificate: React.FC<{ c: ExitCase; e: HREmployee; company: string }> = ({ c, e, company }) => (
  <div className="pr-paper">
    <div className="pr-paper-head">
      <div>
        <h2>{company.toUpperCase()}</h2>
        <p>Certificate of service — Employment Act 2007, section 51</p>
      </div>
      <div className="pr-muted" style={{ fontSize: 12 }}>
        Issued {fmt(c.certificateIssuedOn ?? new Date().toISOString().slice(0, 10))}
      </div>
    </div>
    <div style={{ fontSize: 13, lineHeight: 1.8 }}>
      <p>This is to certify that</p>
      <p>
        <strong style={{ fontSize: 16 }}>{e.fullName}</strong>, National ID {e.nationalIdMasked}, staff number {e.staffId},
      </p>
      <p>
        was employed by {company} from <strong>{fmt(e.joinedDate)}</strong> to <strong>{fmt(c.lastDay)}</strong>, a period of {serviceYears(e, c.lastDay)} completed years.
      </p>
      <p>
        Last position held: <strong>{e.jobTitle}</strong>, {e.department}.
      </p>
      <p className="pr-muted">This certificate states the facts of employment only, as required by section 51 of the Employment Act.</p>
      <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', gap: 24 }}>
        <div>
          ______________________
          <br />
          Rose Chepkoech, HR &amp; Payroll Officer
        </div>
        <div>
          ______________________
          <br />
          Company stamp
        </div>
      </div>
    </div>
  </div>
);

/** Tax deduction card (P9-style) for the leaver's final year, from payroll. */
const LeaverP9: React.FC<{ e: HREmployee; c: ExitCase; ctx: PayrollContext; company: string }> = ({ e, c, ctx, company }) => {
  const year = Number(c.lastDay.slice(0, 4));
  const last = Number(c.lastDay.slice(5, 7)) - 1;
  const slips = Array.from({ length: last + 1 }, (_, m) => m)
    .filter((m) => payableIn([e], e.orgId, year, m).length)
    .map((m) => payslip(e, year, m, ctx));
  const t = (k: (s: (typeof slips)[number]) => number) => slips.reduce((s, x) => s + k(x), 0);
  return (
    <div className="pr-paper">
      <div className="pr-paper-head">
        <div>
          <h2>{company.toUpperCase()}</h2>
          <p>Tax deduction card (P9) — {year} to date of exit</p>
        </div>
        <div style={{ fontSize: 12, textAlign: 'right' }}>
          {e.fullName} · {e.staffId}
          <br />
          KRA PIN {e.kraPinMasked}
        </div>
      </div>
      <table className="pr-doc">
        <thead>
          <tr>
            <th>Month</th>
            <th className="num">Gross</th>
            <th className="num">Benefits</th>
            <th className="num">NSSF</th>
            <th className="num">SHIF</th>
            <th className="num">AHL</th>
            <th className="num">Taxable</th>
            <th className="num">Tax</th>
            <th className="num">Reliefs</th>
            <th className="num">PAYE</th>
          </tr>
        </thead>
        <tbody>
          {slips.map((s) => (
            <tr key={s.periodKey}>
              <td>{s.period}</td>
              <td className="num">{kes(s.gross)}</td>
              <td className="num">{kes(s.benefitsInKind)}</td>
              <td className="num">{kes(s.nssf)}</td>
              <td className="num">{kes(s.shif)}</td>
              <td className="num">{kes(s.ahl)}</td>
              <td className="num">{kes(s.tax.taxablePay)}</td>
              <td className="num">{kes(s.tax.grossTax)}</td>
              <td className="num">{kes(s.tax.personalRelief + s.tax.housingRelief + s.tax.insuranceRelief + s.tax.pmfRelief)}</td>
              <td className="num">{kes(s.paye)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Total</td>
            <td className="num">{kes(t((s) => s.gross))}</td>
            <td className="num">{kes(t((s) => s.benefitsInKind))}</td>
            <td className="num">{kes(t((s) => s.nssf))}</td>
            <td className="num">{kes(t((s) => s.shif))}</td>
            <td className="num">{kes(t((s) => s.ahl))}</td>
            <td className="num">{kes(t((s) => s.tax.taxablePay))}</td>
            <td className="num">{kes(t((s) => s.tax.grossTax))}</td>
            <td className="num">{kes(t((s) => s.tax.personalRelief + s.tax.housingRelief + s.tax.insuranceRelief + s.tax.pmfRelief))}</td>
            <td className="num">{kes(t((s) => s.paye))}</td>
          </tr>
        </tbody>
      </table>
      <div className="pr-paper-foot">Months before the exit month are as paid. The exit month shows the final dues payslip.</div>
    </div>
  );
};

type DrawerTab = 'overview' | 'clearance' | 'interview' | 'dues' | 'documents';

export const ExitCaseModal: React.FC<{ c: ExitCase; onClose: () => void }> = ({ c, onClose }) => {
  const app = useApp();
  const { hrEmployees, setClearance, clearDept, saveExitInterview, prepareDues, approveDues, withdrawExit, issueCertificate, tenantOrganizations, bondFor, updateExit } = app;
  const e = hrEmployees.find((x) => x.staffId === c.staffId)!;
  const company = tenantOrganizations.find((t) => t.id === c.orgId)?.name ?? c.orgId;
  const [tab, setTab] = useState<DrawerTab>('overview');
  const [actor, setActor] = useState(DUES_APPROVERS[0]);
  const [doc, setDoc] = useState<'certificate' | 'payslip' | 'p9'>('certificate');
  const n = noticeFacts(c, e);
  const final = useFinalSlip(c, e);
  const [iv, setIv] = useState(() => c.interview ?? { doneOn: new Date().toISOString().slice(0, 10), by: HR_PREPARER, reasons: [] as string[], rating: 3, wouldRejoin: true, recommend: true, comments: '', regrettable: false });
  const posted = ['APPROVED', 'PAID', 'CLOSED'].includes(c.stage);
  const labourShort = c.kind === 'REDUNDANCY' && (!c.labourNoticeOn || daysBetween(c.labourNoticeOn, c.lastDay) < 30);

  return (
    <Modal title={`${e.fullName} — ${EXIT_LABEL[c.kind]}`} subtitle={`${c.id} · ${e.jobTitle}, ${e.department} · last working day ${fmt(c.lastDay)}`} onClose={onClose} width={980}>
      <div className="pr-tabstrip" style={{ marginBottom: 0 }}>
        {STAGES.map((s, i) => (
          <button key={s} className={STAGES.indexOf(c.stage) >= i ? 'active' : ''} style={{ cursor: 'default' }}>
            {STAGES.indexOf(c.stage) > i ? <CheckCircle2 size={13} /> : i + 1} {STAGE_LABEL[s]}
          </button>
        ))}
        {c.stage === 'WITHDRAWN' && <button className="active">Withdrawn</button>}
      </div>
      <div className="pr-toolbar">
        {(['overview', 'clearance', 'interview', 'dues', 'documents'] as DrawerTab[]).map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(t)}>
            {t === 'overview' ? 'Overview' : t === 'clearance' ? `Clearance (${c.clearance.filter((x) => x.status !== 'OPEN').length}/${c.clearance.length})` : t === 'interview' ? 'Exit interview' : t === 'dues' ? 'Final dues' : 'Documents'}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="pr-kv">
            <div>
              <span>Notice given</span>
              <strong>{fmt(c.noticeDate)}</strong>
              <small>{NOTICE_APPLIES.includes(c.kind) ? `${n.served} of ${n.required} days served` : 'Notice does not apply'}</small>
            </div>
            <div>
              <span>Last working day</span>
              <strong>{fmt(c.lastDay)}</strong>
              <small>{serviceYears(e, c.lastDay)} completed years since {fmt(e.joinedDate)}</small>
            </div>
            <div>
              <span>Notice</span>
              <strong>{n.payInLieu ? `Pay ${kes(n.payInLieu)}` : n.employeeOwes ? `Owes ${kes(n.employeeOwes)}` : n.shortfall && c.waiveShortfall ? 'Shortfall waived' : 'Settled'}</strong>
              <small>{n.shortfall ? `${n.shortfall} days short × KES ${kes(n.rate)}` : 'Full notice'}</small>
            </div>
            <div>
              <span>Estimated net final pay</span>
              <strong>KES {kes(final?.slip.net ?? 0)}</strong>
              <small>Paid with the {c.lastDay.slice(0, 7)} payroll</small>
            </div>
          </div>
          <div className="pr-note">
            <strong>Reason:</strong> {c.reason}
            {c.caseRef && <> · from disciplinary case {c.caseRef}</>}
          </div>
          {c.kind === 'RESIGNATION' && n.shortfall > 0 && !posted && (
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={!!c.waiveShortfall} onChange={(ev) => updateExit(c.id, { waiveShortfall: ev.target.checked }, ev.target.checked ? 'Notice shortfall waived by the employer' : 'Notice shortfall to be recovered', HR_PREPARER)} />
              Waive the {n.shortfall} days of notice not served (otherwise KES {kes(n.shortfall * n.rate)} is deducted from final dues)
            </label>
          )}
          {labourShort && <div className="pr-note warn">Redundancy needs one month's written notice to the union and the county labour officer before the last day (s.40).{c.labourNoticeOn ? ` Notice was given on ${fmt(c.labourNoticeOn)}.` : ''}</div>}
          <div>
            <div className="req-section-title">Timeline</div>
            <table className="hr-table pr-table">
              <tbody>
                {[...c.timeline].reverse().map((t, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(t.at)}</td>
                    <td>{t.text}</td>
                    <td className="muted">{t.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!posted && c.stage !== 'WITHDRAWN' && (
            <div className="pr-toolbar">
              <button className="btn btn-secondary" onClick={() => withdrawExit(c.id, HR_PREPARER, c.kind === 'RESIGNATION' ? 'resignation withdrawn by the employee and accepted' : 'decision reversed')}>
                Withdraw exit
              </button>
            </div>
          )}
        </>
      )}

      {tab === 'clearance' && (
        <>
          {CLEARANCE_DEPTS.map((dept) => {
            const items = c.clearance.filter((x) => x.dept === dept);
            if (!items.length) return null;
            const open = items.filter((x) => x.status === 'OPEN').length;
            return (
              <div key={dept} className="pr-card" style={{ marginBottom: 0, padding: 14 }}>
                <div className="pr-card-head" style={{ marginBottom: 8 }}>
                  <div>
                    <h3>{dept}</h3>
                    <p>{dept === 'Supervisor' ? `${CLEARANCE_OWNER.Supervisor}` : CLEARANCE_OWNER[dept]}</p>
                  </div>
                  {open > 0 && !posted && (
                    <button className="btn btn-secondary" onClick={() => clearDept(c.id, dept, CLEARANCE_OWNER[dept].split(',')[0])}>
                      Clear all {dept}
                    </button>
                  )}
                </div>
                <table className="hr-table pr-table">
                  <tbody>
                    {items.map((x) => (
                      <tr key={x.id}>
                        <td>
                          {x.label}
                          {x.value ? <div className="muted">Replacement value KES {kes(x.value)}</div> : null}
                          {x.note && <div className="muted">{x.note}</div>}
                        </td>
                        <td style={{ width: 150 }}>
                          <span className={`digicraft-status-pill ${x.status === 'CLEARED' ? 'success' : x.status === 'NOT_RETURNED' ? 'danger' : x.status === 'WAIVED' ? 'info' : 'warning'}`}>
                            {x.status === 'OPEN' ? 'Open' : x.status === 'NOT_RETURNED' ? 'Not returned' : x.status === 'WAIVED' ? 'Waived' : 'Cleared'}
                          </span>
                          {x.by && <div className="muted">{x.by}, {fmt(x.at)}</div>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          {!posted && x.status === 'OPEN' && (
                            <>
                              <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setClearance(c.id, x.id, 'CLEARED', CLEARANCE_OWNER[dept].split(',')[0])}>
                                <CheckCircle2 size={12} /> Clear
                              </button>{' '}
                              {x.value ? (
                                <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setClearance(c.id, x.id, 'NOT_RETURNED', CLEARANCE_OWNER[dept].split(',')[0], 'Recover from final dues after the employee was given a chance to return it')}>
                                  <XCircle size={12} /> Not returned
                                </button>
                              ) : null}{' '}
                              <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setClearance(c.id, x.id, 'WAIVED', HR_PREPARER, 'Not applicable')}>
                                Waive
                              </button>
                            </>
                          )}
                          {!posted && x.status !== 'OPEN' && (
                            <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setClearance(c.id, x.id, 'OPEN', HR_PREPARER, 'Reopened')}>
                              Reopen
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          <div className={`pr-note ${clearanceDone(c) ? '' : 'warn'}`}>
            {clearanceDone(c) ? 'Clearance complete — final dues can be prepared.' : 'Final dues can be prepared once every item is cleared, waived or marked not returned. Unreturned items are charged at replacement value.'}
          </div>
        </>
      )}

      {tab === 'interview' && (
        <>
          <div className="pr-form-grid">
            <div className="req-field wide">
              <span>Main reasons for leaving</span>
              <div className="pr-chips">
                {EXIT_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`pr-chip ${iv.reasons.includes(r) ? 'on' : ''}`}
                    style={{ cursor: 'pointer', textDecoration: 'none', opacity: 1, fontSize: 11.5, padding: '3px 9px' }}
                    onClick={() => setIv({ ...iv, reasons: iv.reasons.includes(r) ? iv.reasons.filter((x) => x !== r) : [...iv.reasons, r] })}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <label className="req-field">
              <span>Overall experience (1–5)</span>
              <select className="form-control" value={iv.rating} onChange={(ev) => setIv({ ...iv, rating: Number(ev.target.value) })}>
                {[1, 2, 3, 4, 5].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <div className="req-field" style={{ gap: 4 }}>
              <span>Answers</span>
              <label style={{ fontSize: 13 }}>
                <input type="checkbox" checked={iv.wouldRejoin} onChange={(ev) => setIv({ ...iv, wouldRejoin: ev.target.checked })} /> Would come back
              </label>
              <label style={{ fontSize: 13 }}>
                <input type="checkbox" checked={iv.recommend} onChange={(ev) => setIv({ ...iv, recommend: ev.target.checked })} /> Would recommend us as an employer
              </label>
              <label style={{ fontSize: 13 }}>
                <input type="checkbox" checked={iv.regrettable} onChange={(ev) => setIv({ ...iv, regrettable: ev.target.checked })} /> Regrettable loss (HR view)
              </label>
            </div>
            <label className="req-field wide">
              <span>Comments</span>
              <textarea className="form-control" rows={3} value={iv.comments} onChange={(ev) => setIv({ ...iv, comments: ev.target.value })} />
            </label>
          </div>
          <div className="pr-toolbar">
            <button className="btn btn-primary" disabled={!iv.reasons.length} onClick={() => saveExitInterview(c.id, iv)}>
              Save exit interview
            </button>
            {!iv.reasons.length && <span className="pr-muted">Pick at least one reason.</span>}
          </div>
        </>
      )}

      {tab === 'dues' && (
        <>
          <DuesStatement c={c} e={e} />
          {c.dues && (
            <div className="pr-note">
              Prepared by {c.dues.preparedBy} on {fmt(c.dues.preparedOn)}
              {c.dues.approvedBy ? ` · approved by ${c.dues.approvedBy} on ${fmt(c.dues.approvedOn)}` : ' · waiting for Finance approval'}
            </div>
          )}
          {!posted && c.stage !== 'WITHDRAWN' && (
            <div className="pr-toolbar">
              {!c.dues && (
                <button className="btn btn-primary" disabled={!clearanceDone(c)} onClick={() => prepareDues(c.id, HR_PREPARER)}>
                  Prepare final dues ({HR_PREPARER})
                </button>
              )}
              {c.dues && !c.dues.approvedBy && (
                <>
                  <span className="pr-muted">Acting as</span>
                  <select className="form-control" value={actor} onChange={(ev) => setActor(ev.target.value)}>
                    {DUES_APPROVERS.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                  <button className="btn btn-primary" onClick={() => approveDues(c.id, actor, bondFor(c.staffId, c.lastDay))}>
                    Approve final dues
                  </button>
                </>
              )}
              {!clearanceDone(c) && <span className="pr-muted">Finish clearance first.</span>}
            </div>
          )}
          {final && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Final payslip as payroll will run it</summary>
              <div style={{ marginTop: 10 }}>
                <PayslipDocument e={final.leaver} p={final.slip} ctx={final.ctx} company={company} />
              </div>
            </details>
          )}
        </>
      )}

      {tab === 'documents' && (
        <>
          <div className="pr-toolbar">
            <select className="form-control" value={doc} onChange={(ev) => setDoc(ev.target.value as typeof doc)}>
              <option value="certificate">Certificate of service</option>
              <option value="payslip">Final payslip</option>
              <option value="p9">Tax deduction card (P9)</option>
            </select>
            <button className="btn btn-primary" onClick={printArea}>
              <Printer size={14} /> Print
            </button>
            {doc === 'certificate' && !c.certificateIssuedOn && (
              <button className="btn btn-secondary" onClick={() => issueCertificate(c.id, HR_PREPARER)}>
                Mark as issued
              </button>
            )}
          </div>
          <div className="ess-print-area">
            {doc === 'certificate' && <Certificate c={c} e={e} company={company} />}
            {doc === 'payslip' && final && <PayslipDocument e={final.leaver} p={final.slip} ctx={final.ctx} company={company} />}
            {doc === 'p9' && final && <LeaverP9 e={final.leaver} c={c} ctx={final.ctx} company={company} />}
          </div>
        </>
      )}
    </Modal>
  );
};

/** Start an exit: dates, notice rules and what it means for pay, before anything is saved. */
export const StartExitModal: React.FC<{ onClose: () => void; preset?: { staffId: string; kind: ExitKind; lastDay?: string; caseRef?: string; reason?: string } }> = ({ onClose, preset }) => {
  const { tenantEmployees, startExit, exitCases, payrollOpenPeriod } = useApp();
  const busy = new Set(exitCases.filter((c) => !['WITHDRAWN', 'CLOSED'].includes(c.stage)).map((c) => c.staffId));
  const people = tenantEmployees.filter((e) => e.status !== 'TERMINATED' && !busy.has(e.staffId));
  const today = new Date().toISOString().slice(0, 10);
  const [staffId, setStaffId] = useState(preset?.staffId ?? people[0]?.staffId ?? '');
  const [kind, setKind] = useState<ExitKind>(preset?.kind ?? 'RESIGNATION');
  const e = people.find((x) => x.staffId === staffId) ?? tenantEmployees.find((x) => x.staffId === staffId);
  const [noticeDate, setNoticeDate] = useState(today);
  const [lastDay, setLastDay] = useState(preset?.lastDay ?? (e ? addDays(today, noticeRequired(e)) : today));
  const [reason, setReason] = useState(preset?.reason ?? '');
  const [labour, setLabour] = useState(today);
  const facts = e ? noticeFacts({ kind, noticeDate, lastDay, waiveShortfall: false }, e) : null;
  const error = !e ? 'Choose an employee' : lastDay < noticeDate ? 'Last day is before the notice date' : lastDay.slice(0, 7) < payrollOpenPeriod.key ? `Last day must be in ${payrollOpenPeriod.label} or later (final dues go through payroll)` : !reason.trim() ? 'Give the reason' : '';
  return (
    <Modal
      title="Start an exit"
      subtitle="Records the notice, opens clearance with five departments and prepares final dues through payroll."
      onClose={onClose}
      footer={
        <>
          {error && <span className="req-error">{error}</span>}
          <div className="req-footer-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!!error}
              onClick={() => startExit({ staffId, kind, noticeDate, lastDay, reason, caseRef: preset?.caseRef, labourNoticeOn: kind === 'REDUNDANCY' ? labour : undefined }, HR_PREPARER) && onClose()}
            >
              Start exit
            </button>
          </div>
        </>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Employee</span>
          <select className="form-control" value={staffId} disabled={!!preset} onChange={(ev) => setStaffId(ev.target.value)}>
            {(preset && e ? [e] : people).map((x) => (
              <option key={x.staffId} value={x.staffId}>
                {x.staffId} · {x.fullName} — {x.jobTitle}
              </option>
            ))}
          </select>
        </label>
        <label className="req-field">
          <span>Type of exit</span>
          <select className="form-control" value={kind} onChange={(ev) => setKind(ev.target.value as ExitKind)}>
            {(Object.keys(EXIT_LABEL) as ExitKind[]).map((k) => (
              <option key={k} value={k}>
                {EXIT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="req-field">
          <span>{kind === 'RESIGNATION' ? 'Resignation letter received' : 'Notice / decision date'}</span>
          <input className="form-control" type="date" value={noticeDate} onChange={(ev) => setNoticeDate(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Last working day</span>
          <input className="form-control" type="date" value={lastDay} onChange={(ev) => setLastDay(ev.target.value)} />
        </label>
        {kind === 'REDUNDANCY' && (
          <label className="req-field">
            <span>Notice to union and labour officer</span>
            <input className="form-control" type="date" value={labour} onChange={(ev) => setLabour(ev.target.value)} />
          </label>
        )}
        <label className="req-field wide">
          <span>Reason</span>
          <input className="form-control" value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Moving to Nairobi; role abolished after restructuring" />
        </label>
      </div>
      {e && facts && (
        <div className={`pr-note ${facts.shortfall ? 'warn' : ''}`}>
          {facts.applies
            ? `Contract notice ${facts.required} days; ${facts.served} days between notice and last day. ${
                facts.shortfall
                  ? kind === 'RESIGNATION'
                    ? `${facts.shortfall} days short — KES ${kes(facts.shortfall * facts.rate)} recoverable unless you waive it.`
                    : `${facts.shortfall} days short — the company pays KES ${kes(facts.payInLieu)} in lieu of notice.`
                  : 'Full notice.'
              }`
            : `${EXIT_LABEL[kind]}: notice does not apply.`}{' '}
          {kind === 'REDUNDANCY' && `Severance: 15 days' pay × ${serviceYears(e, lastDay)} completed years.`}
          {kind === 'RETIREMENT' && ` Gratuity: 15 days' basic × ${serviceYears(e, lastDay)} completed years.`}
          {kind === 'SUMMARY_DISMISSAL' && ' No notice pay; earned salary and untaken leave are still paid (s.44).'}
        </div>
      )}
    </Modal>
  );
};
