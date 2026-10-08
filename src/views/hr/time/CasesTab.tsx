import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Gavel, Plus, Printer, Search } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { Modal } from '../payroll/shared';
import {
  APPEAL_DAYS,
  CATEGORY_LABEL,
  SANCTION_LABEL,
  SHOW_CAUSE_DAYS,
  STAGES,
  STAGE_LABEL,
  WARNING_MONTHS,
  addMonthsIso,
  nextStep,
  suggestSanction,
  type CaseStage,
  type DisciplinaryCase,
  type LetterKind,
  type Sanction
} from '../../../data/discipline';
import { addDays, fmtDate, fmtShort } from '../../../data/timeEngine';
import { HR_OFFICER, SUPERVISOR } from '../../../data/timeConfig';
import { Chips, EmpCell, Empty, Pill } from './shared';
import { NewCaseModal } from './CaseForms';
import { RecordAttachments } from '../hcm/ui';
import { LETTER_TITLE, LetterModal, lettersFor } from './Letters';

export const STAGE_CLS: Record<CaseStage, string> = { RAISED: 'primary', INVESTIGATION: 'info', SHOW_CAUSE: 'warning', HEARING: 'warning', OUTCOME: 'info', APPEAL: 'critical', CLOSED: 'success' };
export const SANCTION_CLS = (s: Sanction) => (s === 'NO_ACTION' ? 'success' : s === 'VERBAL' ? 'info' : s === 'WRITTEN' ? 'warning' : 'critical');

export const CasesTab: React.FC = () => {
  const { disciplinaryCases, selectedOrgId, hrEmployees, moduleTabs, setModuleTab, timeToday } = useApp();
  const [stage, setStage] = useState<'OPEN' | CaseStage | 'ALL'>('OPEN');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [raise, setRaise] = useState(false);
  const byId = useMemo(() => new Map(hrEmployees.map((e) => [e.staffId, e])), [hrEmployees]);
  const cases = useMemo(() => disciplinaryCases.filter((c) => c.orgId === selectedOrgId), [disciplinaryCases, selectedOrgId]);

  // Opened from another screen (e.g. the attendance exceptions queue)
  const focus = moduleTabs['disciplinary-case'];
  useEffect(() => {
    if (focus) {
      setOpenId(focus);
      setModuleTab('disciplinary-case', '');
    }
  }, [focus, setModuleTab]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return cases
      .filter((c) => (stage === 'ALL' ? true : stage === 'OPEN' ? c.stage !== 'CLOSED' : c.stage === stage))
      .filter((c) => !s || `${c.id} ${c.staffId} ${byId.get(c.staffId)?.fullName} ${c.summary}`.toLowerCase().includes(s))
      .sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || b.raisedOn.localeCompare(a.raisedOn));
  }, [cases, stage, q, byId]);
  const pg = usePaged(rows, 25, `${stage}|${q}`);
  const n = (s: CaseStage) => cases.filter((c) => c.stage === s).length;
  const handoffs = cases.filter((c) => c.outcome?.separationNote);
  const current = cases.find((c) => c.id === openId);

  return (
    <>
      <div className="tm-pipeline" role="group" aria-label="Cases by stage">
        {STAGES.map((s) => (
          <button key={s} className={stage === s ? 'active' : ''} onClick={() => setStage(stage === s ? 'OPEN' : s)}>
            <strong>{n(s)}</strong>
            <span>{STAGE_LABEL[s]}</span>
          </button>
        ))}
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Disciplinary cases</h3>
            <p>Raise, investigate, notice to show cause, hearing with a representative of choice, outcome and appeal (Employment Act s.41 and s.44).</p>
          </div>
          <button className="btn btn-primary" onClick={() => setRaise(true)}>
            <Plus size={14} /> Raise case
          </button>
        </div>
        <div className="pr-toolbar" style={{ marginBottom: 12 }}>
          <Chips
            label="Case filter"
            value={stage === 'OPEN' || stage === 'ALL' ? stage : ('' as 'OPEN')}
            onChange={setStage}
            options={[
              { id: 'OPEN', label: 'Open', n: cases.filter((c) => c.stage !== 'CLOSED').length },
              { id: 'ALL', label: 'All', n: cases.length }
            ]}
          />
          <div className="form-input-wrapper grow">
            <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)' }} />
            <input className="form-control" style={{ paddingLeft: 30 }} placeholder="Search case, employee or text" value={q} onChange={(ev) => setQ(ev.target.value)} />
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Employee</th>
                <th>Category</th>
                <th>Stage</th>
                <th>Next step</th>
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && <Empty cols={5}>No cases here.</Empty>}
              {pg.rows.map((c) => {
                const ns = nextStep(c, timeToday);
                return (
                  <tr key={c.id} className="tm-click" onClick={() => setOpenId(c.id)}>
                    <td>
                      <strong>{c.id}</strong>
                      <div className="muted">Raised {fmtShort(c.raisedOn)}</div>
                    </td>
                    <td>
                      <EmpCell e={byId.get(c.staffId)} id={c.staffId} />
                    </td>
                    <td>
                      {CATEGORY_LABEL[c.category]}
                      <div className="muted tm-clamp">{c.summary}</div>
                    </td>
                    <td>
                      <Pill cls={STAGE_CLS[c.stage]}>{STAGE_LABEL[c.stage]}</Pill>
                      {c.outcome && (
                        <div style={{ marginTop: 4 }}>
                          <Pill cls={SANCTION_CLS(c.outcome.sanction)}>{SANCTION_LABEL[c.outcome.sanction]}</Pill>
                        </div>
                      )}
                    </td>
                    <td>
                      {ns.text}
                      {ns.due && c.stage !== 'CLOSED' && <div className={ns.overdue ? 'tm-late' : 'muted'}>{ns.overdue ? 'Overdue since' : 'By'} {fmtShort(ns.due)}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="cases" />
      </div>

      {handoffs.length > 0 && (
        <div className="pr-card">
          <h3 className="tm-h3">Handed to Separation (#12)</h3>
          <ul className="tm-rules">
            {handoffs.map((c) => (
              <li key={c.id}>
                <strong>{c.id}</strong> · {byId.get(c.staffId)?.fullName}: {c.outcome!.separationNote}
              </li>
            ))}
          </ul>
        </div>
      )}

      {raise && <NewCaseModal onClose={() => setRaise(false)} onRaised={(id) => setOpenId(id)} />}
      {current && <CaseModal c={current} onClose={() => setOpenId(null)} />}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Case file                                                           */
/* ------------------------------------------------------------------ */

const CaseModal: React.FC<{ c: DisciplinaryCase; onClose: () => void }> = ({ c, onClose }) => {
  const { hrEmployees, disciplinaryCases, timeToday } = useApp();
  const [letter, setLetter] = useState<LetterKind | null>(null);
  const e = hrEmployees.find((x) => x.staffId === c.staffId);
  const idx = STAGES.indexOf(c.stage);
  const hint = suggestSanction(disciplinaryCases, c.staffId, c.category, timeToday, c.id);
  return (
    <Modal title={`${c.id} · ${CATEGORY_LABEL[c.category]}`} subtitle={`${e?.fullName ?? c.staffId} · ${c.staffId} · ${e?.jobTitle ?? ''} · ${e?.department ?? ''}`} onClose={onClose} width={980}>
      <ol className="tm-stepper" aria-label="Case stages">
        {STAGES.filter((s) => s !== 'APPEAL' || c.appeal).map((s) => {
          const i = STAGES.indexOf(s);
          return (
            <li key={s} className={i < idx || c.stage === 'CLOSED' ? 'done' : i === idx ? 'current' : ''}>
              <span>{STAGE_LABEL[s]}</span>
            </li>
          );
        })}
      </ol>

      <div className="tm-case-grid">
        <div>
          <section className="tm-sec">
            <h4>Allegation</h4>
            <p>{c.summary}</p>
            <p className="pr-muted">
              Incident {fmtDate(c.incidentDate)} · raised {fmtDate(c.raisedOn)} by {c.raisedBy}
              {c.absenceDates?.length ? ` · attendance days: ${c.absenceDates.map(fmtShort).join(', ')}` : ''}
            </p>
            {hint.live.length > 0 && c.stage !== 'CLOSED' && (
              <div className="pr-note warn">
                Live warnings on file: {hint.live.map((w) => `${SANCTION_LABEL[w.outcome!.sanction]} (${w.id}, until ${fmtDate(w.outcome!.expiresOn!)})`).join('; ')}.
              </div>
            )}
          </section>
          {c.investigation && (
            <section className="tm-sec">
              <h4>Investigation</h4>
              <p>
                Officer: {c.investigation.officer}
                {c.investigation.completedOn ? ` · completed ${fmtDate(c.investigation.completedOn)}` : ' · in progress'}
              </p>
              {c.investigation.findings && <p>{c.investigation.findings}</p>}
            </section>
          )}
          {c.showCause && (
            <section className="tm-sec">
              <h4>Notice to show cause</h4>
              <p>
                Issued {fmtDate(c.showCause.issuedOn)} · response due {fmtDate(c.showCause.responseDue)}
              </p>
              <p>{c.showCause.allegations}</p>
              {c.showCause.response ? (
                <p>
                  <strong>Response ({fmtDate(c.showCause.respondedOn!)}):</strong> {c.showCause.response}
                </p>
              ) : (
                <p className={c.showCause.responseDue < timeToday ? 'tm-late' : 'pr-muted'}>{c.showCause.responseDue < timeToday ? 'No response by the deadline.' : 'Waiting for the written response.'}</p>
              )}
            </section>
          )}
          {c.hearing && (
            <section className="tm-sec">
              <h4>Hearing</h4>
              <p>
                {fmtDate(c.hearing.date, true)} at {c.hearing.time} · {c.hearing.venue}
              </p>
              <p>Panel: {c.hearing.panel.join(', ')}</p>
              <p>Representative: {c.hearing.representative}</p>
              {c.hearing.minutes && <p>Minutes: {c.hearing.minutes}</p>}
            </section>
          )}
          {c.outcome && (
            <section className="tm-sec">
              <h4>Outcome</h4>
              <p>
                <Pill cls={SANCTION_CLS(c.outcome.sanction)}>{SANCTION_LABEL[c.outcome.sanction]}</Pill> decided {fmtDate(c.outcome.decidedOn)}
                {c.outcome.expiresOn ? ` · on file until ${fmtDate(c.outcome.expiresOn)}` : ''}
              </p>
              <p>{c.outcome.reasons}</p>
              {c.outcome.suspension && (
                <p>
                  Suspended {c.outcome.suspension.pay === 'HALF' ? 'on half pay' : 'without pay'} {fmtDate(c.outcome.suspension.from)} to {fmtDate(c.outcome.suspension.to)}
                  {c.outcome.reductionId ? ` · payroll deduction ${c.outcome.reductionId}` : ''}
                </p>
              )}
              {c.outcome.separationNote && <div className="pr-note">{c.outcome.separationNote}</div>}
            </section>
          )}
          {c.appeal && (
            <section className="tm-sec">
              <h4>Appeal</h4>
              <p>
                Lodged {fmtDate(c.appeal.lodgedOn)}: {c.appeal.grounds}
              </p>
              <p>
                {c.appeal.status === 'PENDING' ? 'Awaiting decision.' : `${c.appeal.status === 'UPHELD' ? 'Allowed, sanction set aside' : c.appeal.status === 'DISMISSED' ? 'Dismissed, sanction stands' : 'Sanction reduced'} on ${fmtDate(c.appeal.decidedOn!)}. ${c.appeal.decision ?? ''}`}
              </p>
            </section>
          )}
          {c.stage !== 'CLOSED' && <StageActions c={c} suggested={hint.sanction} suggestion={hint.reason} />}
        </div>

        <aside>
          <section className="tm-sec">
            <h4>Letters</h4>
            {lettersFor(c).length === 0 && <p className="pr-muted">Letters appear as the case moves on.</p>}
            <div className="tm-letter-list">
              {lettersFor(c).map((k) => (
                <button key={k} className="btn btn-secondary btn-sm" onClick={() => setLetter(k)}>
                  <Printer size={13} /> {LETTER_TITLE[k]}
                </button>
              ))}
            </div>
          </section>
          <section className="tm-sec">
            <h4>Documents</h4>
            {c.documents.length === 0 ? (
              <p className="pr-muted">None yet.</p>
            ) : (
              <ul className="tm-docs">
                {c.documents.map((d) => (
                  <li key={d.id}>
                    <FileText size={13} /> {d.name} <span>{fmtShort(d.on)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="tm-sec">
            <h4>Timeline</h4>
            <ul className="tm-timeline">
              {[...c.timeline].reverse().map((t, i) => (
                <li key={i}>
                  <span>
                    {fmtShort(t.at)} · {t.by}
                  </span>
                  {t.text}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      <RecordAttachments owner={`DISC-${c.id}`} title="Evidence and signed letters" />
      {letter && <LetterModal c={c} kind={letter} onClose={() => setLetter(null)} />}
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* What can be done at each stage                                      */
/* ------------------------------------------------------------------ */

const REP_TYPES = ['Fellow employee', 'Shop-floor union representative (KPAWU)', 'Declined a representative'];

const StageActions: React.FC<{ c: DisciplinaryCase; suggested: Sanction; suggestion: string }> = ({ c, suggested, suggestion }) => {
  const { updateCase, recordCaseOutcome, decideAppeal, hrEmployees, timeToday, payrollOpenPeriod } = useApp();
  const colleagues = hrEmployees.filter((e) => e.orgId === c.orgId && e.staffId !== c.staffId && e.status !== 'TERMINATED' && e.basicSalaryKes >= 50_000).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const e = hrEmployees.find((x) => x.staffId === c.staffId);
  const [officer, setOfficer] = useState(SUPERVISOR);
  const [findings, setFindings] = useState('');
  const [allegations, setAllegations] = useState(c.summary);
  const [due, setDue] = useState(addDays(timeToday, SHOW_CAUSE_DAYS));
  const [response, setResponse] = useState('');
  const [hDate, setHDate] = useState(c.hearing?.date ?? addDays(timeToday, 3));
  const [hTime, setHTime] = useState(c.hearing?.time ?? '10:00');
  const [venue, setVenue] = useState(c.hearing?.venue ?? 'Boardroom, Block A');
  const [panel, setPanel] = useState(`${SUPERVISOR} (chair), ${HR_OFFICER} (HR)`);
  const [repType, setRepType] = useState(REP_TYPES[0]);
  const [repName, setRepName] = useState('');
  const [attended, setAttended] = useState(true);
  const [minutes, setMinutes] = useState('');
  const [sanction, setSanction] = useState<Sanction>(suggested);
  const [reasons, setReasons] = useState('');
  const openStart = `${payrollOpenPeriod.key}-01`;
  const firstSusp = timeToday > openStart ? addDays(timeToday, 1) : openStart;
  const [sFrom, setSFrom] = useState(firstSusp);
  const [sTo, setSTo] = useState(addDays(firstSusp, 4));
  const [sPay, setSPay] = useState<'HALF' | 'NONE'>('HALF');
  const [effective, setEffective] = useState(timeToday);
  const [notice, setNotice] = useState(String(e?.noticeDays ?? 30));
  const [grounds, setGrounds] = useState('');
  const [appealNote, setAppealNote] = useState('');
  const [varied, setVaried] = useState<Sanction>('WRITTEN');

  const issueShowCause = () =>
    updateCase(c.id, { stage: 'SHOW_CAUSE', showCause: { issuedOn: timeToday, responseDue: due, allegations: allegations.trim() }, investigation: c.investigation ? { ...c.investigation, findings: findings.trim() || c.investigation.findings, completedOn: timeToday } : undefined }, `Show-cause letter issued; response due ${fmtDate(due)}`, { name: 'Show-cause letter', kind: 'SHOW_CAUSE' });

  const showCauseForm = (
    <div className="pr-form-grid">
      <label className="req-field wide">
        <span>Allegations in the letter</span>
        <textarea className="form-control" rows={2} value={allegations} onChange={(ev) => setAllegations(ev.target.value)} />
      </label>
      <label className="req-field">
        <span>Written response due</span>
        <input className="form-control" type="date" min={addDays(timeToday, 2)} value={due} onChange={(ev) => setDue(ev.target.value)} />
      </label>
    </div>
  );

  let body: React.ReactNode = null;
  if (c.stage === 'RAISED')
    body = (
      <>
        <div className="pr-form-grid">
          <label className="req-field">
            <span>Investigating officer</span>
            <select className="form-control" value={officer} onChange={(ev) => setOfficer(ev.target.value)}>
              {colleagues.map((x) => (
                <option key={x.staffId}>{x.fullName}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="tm-actions">
          <button className="btn btn-primary btn-sm" onClick={() => updateCase(c.id, { stage: 'INVESTIGATION', investigation: { officer } }, `${officer} appointed to investigate`)}>
            Start investigation
          </button>
        </div>
        <p className="pr-muted">Facts are clear (e.g. attendance records)? Issue the show-cause letter straight away:</p>
        {showCauseForm}
        <div className="tm-actions">
          <button className="btn btn-secondary btn-sm" disabled={!allegations.trim()} onClick={issueShowCause}>
            Issue show-cause letter
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => updateCase(c.id, { stage: 'CLOSED', closedOn: timeToday, outcome: { sanction: 'NO_ACTION', decidedOn: timeToday, reasons: 'Closed at intake: no case to answer.' } }, 'Closed at intake: no case to answer')}>
            Close, no case
          </button>
        </div>
      </>
    );
  else if (c.stage === 'INVESTIGATION')
    body = (
      <>
        <label className="req-field">
          <span>Findings</span>
          <textarea className="form-control" rows={2} value={findings} onChange={(ev) => setFindings(ev.target.value)} placeholder="What the evidence shows" />
        </label>
        {showCauseForm}
        <div className="tm-actions">
          <button className="btn btn-primary btn-sm" disabled={!findings.trim() || !allegations.trim()} onClick={issueShowCause}>
            Case to answer: issue show-cause
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={!findings.trim()}
            onClick={() => updateCase(c.id, { stage: 'CLOSED', closedOn: timeToday, investigation: { ...c.investigation!, findings: findings.trim(), completedOn: timeToday }, outcome: { sanction: 'NO_ACTION', decidedOn: timeToday, reasons: findings.trim() } }, 'Investigation found no case to answer; closed')}
          >
            No case to answer
          </button>
        </div>
      </>
    );
  else if (c.stage === 'SHOW_CAUSE')
    body = (
      <>
        {!c.showCause?.response && (
          <div className="pr-form-grid">
            <label className="req-field wide">
              <span>Employee's written response</span>
              <textarea className="form-control" rows={2} value={response} onChange={(ev) => setResponse(ev.target.value)} placeholder="Summary of the explanation received" />
            </label>
          </div>
        )}
        <div className="pr-form-grid">
          <label className="req-field">
            <span>Hearing date</span>
            <input className="form-control" type="date" min={timeToday} value={hDate} onChange={(ev) => setHDate(ev.target.value)} />
          </label>
          <label className="req-field">
            <span>Time</span>
            <input className="form-control" type="time" value={hTime} onChange={(ev) => setHTime(ev.target.value)} />
          </label>
          <label className="req-field">
            <span>Venue</span>
            <input className="form-control" value={venue} onChange={(ev) => setVenue(ev.target.value)} />
          </label>
          <label className="req-field">
            <span>Panel</span>
            <input className="form-control" value={panel} onChange={(ev) => setPanel(ev.target.value)} />
          </label>
          <label className="req-field">
            <span>Employee's representative (s.41)</span>
            <select className="form-control" value={repType} onChange={(ev) => setRepType(ev.target.value)}>
              {REP_TYPES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          {repType !== REP_TYPES[2] && (
            <label className="req-field">
              <span>Representative's name</span>
              <input className="form-control" value={repName} onChange={(ev) => setRepName(ev.target.value)} placeholder="Chosen by the employee" />
            </label>
          )}
        </div>
        <div className="tm-actions">
          {!c.showCause?.response && (
            <button className="btn btn-secondary btn-sm" disabled={!response.trim()} onClick={() => updateCase(c.id, { showCause: { ...c.showCause!, response: response.trim(), respondedOn: timeToday } }, 'Written response received', { name: 'Employee response', kind: 'STATEMENT' })}>
              Record response only
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            disabled={!hDate || !panel.trim() || (repType !== REP_TYPES[2] && !repName.trim())}
            onClick={() =>
              updateCase(
                c.id,
                {
                  stage: 'HEARING',
                  showCause: { ...c.showCause!, response: c.showCause?.response ?? (response.trim() || 'No written response received'), respondedOn: c.showCause?.respondedOn ?? timeToday },
                  hearing: { date: hDate, time: hTime, venue, panel: panel.split(',').map((s) => s.trim()).filter(Boolean), representative: repType === REP_TYPES[2] ? repType : `${repType} (${repName.trim()})` }
                },
                `Hearing set for ${fmtDate(hDate)} at ${hTime}; representative: ${repType === REP_TYPES[2] ? 'declined' : repName.trim()}`,
                { name: 'Notice of hearing', kind: 'HEARING' }
              )
            }
          >
            Schedule hearing
          </button>
        </div>
      </>
    );
  else if (c.stage === 'HEARING') {
    const months = WARNING_MONTHS[sanction];
    const susp = sanction === 'SUSPENSION';
    const leaving = sanction === 'SUMMARY_DISMISSAL' || sanction === 'TERMINATION_NOTICE';
    body = (
      <>
        {c.hearing && c.hearing.date > timeToday && <div className="pr-note">The hearing is on {fmtDate(c.hearing.date)}. Record the outcome once it has been held.</div>}
        <div className="pr-form-grid">
          <label className="req-field">
            <span>Sanction</span>
            <select className="form-control" value={sanction} onChange={(ev) => setSanction(ev.target.value as Sanction)}>
              {(Object.keys(SANCTION_LABEL) as Sanction[]).map((s) => (
                <option key={s} value={s}>
                  {SANCTION_LABEL[s]}
                  {s === suggested ? ' (suggested)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="req-field tm-check-field">
            <span>Attendance</span>
            <label>
              <input type="checkbox" checked={attended} onChange={(ev) => setAttended(ev.target.checked)} /> Employee attended with their representative
            </label>
          </label>
          <div className="pr-note wide">{suggestion}</div>
          {months && <div className="pr-note wide">Stays on file for {months} months, until {fmtDate(addMonthsIso(timeToday, months))}.</div>}
          {susp && (
            <>
              <label className="req-field">
                <span>Suspended from</span>
                <input className="form-control" type="date" min={openStart} value={sFrom} onChange={(ev) => setSFrom(ev.target.value)} />
              </label>
              <label className="req-field">
                <span>To (inclusive)</span>
                <input className="form-control" type="date" min={sFrom} value={sTo} onChange={(ev) => setSTo(ev.target.value)} />
              </label>
              <label className="req-field">
                <span>Pay during suspension</span>
                <select className="form-control" value={sPay} onChange={(ev) => setSPay(ev.target.value as 'HALF' | 'NONE')}>
                  <option value="HALF">Half pay</option>
                  <option value="NONE">Without pay</option>
                </select>
              </label>
              <div className="pr-note wide">
                Payroll withholds {sPay === 'HALF' ? 'half' : 'all'} of the pay for these calendar days. The earliest start is {fmtDate(openStart)} ({payrollOpenPeriod.label} is the open payroll month).
              </div>
            </>
          )}
          {leaving && (
            <>
              <label className="req-field">
                <span>Last working day</span>
                <input className="form-control" type="date" min={timeToday} value={effective} onChange={(ev) => setEffective(ev.target.value)} />
              </label>
              {sanction === 'TERMINATION_NOTICE' && (
                <label className="req-field">
                  <span>Notice (days)</span>
                  <input className="form-control" type="number" min={0} value={notice} onChange={(ev) => setNotice(ev.target.value)} />
                </label>
              )}
              <div className="pr-note warn wide">The case is handed to Separation (#12) for terminal dues and clearance. Nothing is paid or stopped from here.</div>
            </>
          )}
          <label className="req-field wide">
            <span>Hearing minutes</span>
            <textarea className="form-control" rows={2} value={minutes} onChange={(ev) => setMinutes(ev.target.value)} placeholder="Who said what, evidence considered" />
          </label>
          <label className="req-field wide">
            <span>Reasons for the decision</span>
            <textarea className="form-control" rows={2} value={reasons} onChange={(ev) => setReasons(ev.target.value)} />
          </label>
        </div>
        <div className="tm-actions">
          <button
            className="btn btn-primary btn-sm"
            disabled={!reasons.trim()}
            onClick={() => {
              const ok = recordCaseOutcome(c.id, {
                sanction,
                decidedOn: timeToday,
                reasons: reasons.trim(),
                suspension: susp ? { from: sFrom, to: sTo, pay: sPay } : undefined,
                effectiveDate: leaving ? effective : undefined,
                noticeDays: sanction === 'TERMINATION_NOTICE' ? Number(notice) || 0 : undefined
              });
              if (ok && c.hearing) updateCase(c.id, { hearing: { ...c.hearing, attended, minutes: minutes.trim() || undefined } }, `Hearing held${attended ? ' with the employee present' : ' in the employee’s absence'}`, minutes.trim() ? { name: 'Hearing minutes', kind: 'MINUTES' } : undefined);
            }}
          >
            <Gavel size={13} /> Record outcome
          </button>
        </div>
      </>
    );
  } else if (c.stage === 'OUTCOME') {
    const until = addDays(c.outcome?.decidedOn ?? timeToday, APPEAL_DAYS);
    body = (
      <>
        {until >= timeToday ? (
          <label className="req-field">
            <span>Grounds of appeal (window open until {fmtDate(until)})</span>
            <textarea className="form-control" rows={2} value={grounds} onChange={(ev) => setGrounds(ev.target.value)} />
          </label>
        ) : (
          <p className="pr-muted">The appeal window closed on {fmtDate(until)}.</p>
        )}
        <div className="tm-actions">
          {until >= timeToday && (
            <button className="btn btn-secondary btn-sm" disabled={!grounds.trim()} onClick={() => updateCase(c.id, { stage: 'APPEAL', appeal: { lodgedOn: timeToday, grounds: grounds.trim(), status: 'PENDING' } }, 'Appeal lodged', { name: 'Letter of appeal', kind: 'STATEMENT' })}>
              Lodge appeal
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => updateCase(c.id, { stage: 'CLOSED', closedOn: timeToday }, until >= timeToday ? 'Closed; employee confirmed no appeal' : 'Closed; no appeal within the window')}>
            Close case
          </button>
        </div>
      </>
    );
  } else if (c.stage === 'APPEAL')
    body = (
      <>
        <div className="pr-form-grid">
          <label className="req-field wide">
            <span>Appeal decision notes</span>
            <textarea className="form-control" rows={2} value={appealNote} onChange={(ev) => setAppealNote(ev.target.value)} placeholder="Heard by a manager not on the first panel" />
          </label>
          <label className="req-field">
            <span>Reduce sanction to</span>
            <select className="form-control" value={varied} onChange={(ev) => setVaried(ev.target.value as Sanction)}>
              {(['VERBAL', 'WRITTEN', 'FINAL_WRITTEN'] as Sanction[]).map((s) => (
                <option key={s} value={s}>
                  {SANCTION_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="tm-actions">
          <button className="btn btn-primary btn-sm" disabled={!appealNote.trim()} onClick={() => decideAppeal(c.id, 'DISMISSED', appealNote.trim())}>
            Dismiss appeal
          </button>
          <button className="btn btn-secondary btn-sm" disabled={!appealNote.trim()} onClick={() => decideAppeal(c.id, 'VARIED', appealNote.trim(), varied)}>
            Reduce sanction
          </button>
          <button className="btn btn-secondary btn-sm" disabled={!appealNote.trim()} onClick={() => decideAppeal(c.id, 'UPHELD', appealNote.trim())}>
            Allow appeal
          </button>
        </div>
      </>
    );

  return (
    <section className="tm-sec tm-next">
      <h4>Next step: {nextStep(c, timeToday).text}</h4>
      {body}
    </section>
  );
};
