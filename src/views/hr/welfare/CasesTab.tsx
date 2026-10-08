import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, FileWarning, Lock, MessageSquarePlus, Plus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { ER_ACK_SLA_DAYS, ER_INVESTIGATION_SLA_DAYS, ER_OUTCOME_LABEL, ER_STAGES, ER_TYPES, type ErCase, type ErCaseType, type ErInterview, type ErOutcome, type ErReporterKind } from '../../../data/welfareSeed';
import { addDays } from '../../../data/timeEngine';
import { Card, daysBetween, Drawer, Empty, Field, FilterPills, fmt, Modal, Person, Pill, SearchBox, StaffSelect, useWfOrg, type Tone } from './shared';

/** Acknowledgement and outcome deadlines for a case */
export const erSla = (c: ErCase, today: string): { text: string; tone: Tone; overdue: boolean } => {
  if (c.stage === 'RECEIVED') {
    const due = addDays(c.reportedOn, ER_ACK_SLA_DAYS);
    const left = daysBetween(today, due);
    return left < 0 ? { text: `Acknowledge: ${-left}d overdue`, tone: 'critical', overdue: true } : { text: `Acknowledge in ${left}d`, tone: left <= 2 ? 'warning' : 'info', overdue: false };
  }
  if (c.stage === 'ACKNOWLEDGED' || c.stage === 'INVESTIGATION') {
    const due = addDays(c.acknowledgedOn ?? c.reportedOn, ER_INVESTIGATION_SLA_DAYS);
    const left = daysBetween(today, due);
    return left < 0 ? { text: `Outcome: ${-left}d overdue`, tone: 'critical', overdue: true } : { text: `Outcome due in ${left}d`, tone: left <= 5 ? 'warning' : 'info', overdue: false };
  }
  if (c.stage === 'OUTCOME') return { text: 'To close', tone: 'warning', overdue: false };
  return { text: 'Closed', tone: 'success', overdue: false };
};

const STAGE_TONE: Record<ErCase['stage'], Tone> = { RECEIVED: 'warning', ACKNOWLEDGED: 'info', INVESTIGATION: 'primary', OUTCOME: 'info', CLOSED: 'success' };
const stageLabel = (s: ErCase['stage']) => ER_STAGES.find((x) => x.id === s)?.label ?? s;
/** People who may handle cases in the demo */
const OFFICERS = ['KHE-0290', 'KHE-0102', 'KHE-0141', 'KHE-0104'];

type Filter = 'OPEN' | 'OVERDUE' | 'CLOSED' | 'ALL';

export const CasesTab: React.FC = () => {
  const { erCases, logErAccess, hrEmployees } = useApp();
  const org = useWfOrg();
  const officers = useMemo(() => OFFICERS.map((id) => hrEmployees.find((e) => e.staffId === id)).filter((e): e is NonNullable<typeof e> => !!e), [hrEmployees]);
  const [viewer, setViewer] = useState('KHE-0290');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [type, setType] = useState<'ANY' | ErCaseType>('ANY');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const cases = useMemo(() => erCases.filter((c) => c.orgId === org.orgId), [erCases, org.orgId]);
  const canSee = (c: ErCase) => !c.confidential || c.caseOfficer === viewer || revealed.has(c.id);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return cases
      .filter((c) => (filter === 'ALL' ? true : filter === 'CLOSED' ? c.stage === 'CLOSED' : filter === 'OVERDUE' ? erSla(c, org.today).overdue : c.stage !== 'CLOSED'))
      .filter((c) => type === 'ANY' || c.type === type)
      .filter((c) => !s || `${c.ref} ${ER_TYPES[c.type].label} ${c.category} ${c.location}`.toLowerCase().includes(s))
      .sort((a, b) => b.reportedOn.localeCompare(a.reportedOn));
  }, [cases, filter, type, q, org.today]);
  const pg = usePaged(rows, 10, `${filter}|${type}|${q}|${org.orgId}`);
  const open = cases.filter((c) => c.stage !== 'CLOSED');
  const overdue = cases.filter((c) => erSla(c, org.today).overdue);
  const current = openId ? cases.find((c) => c.id === openId) : undefined;
  const viewerName = org.name(viewer);
  const hide = (id: string) => {
    setRevealed((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
    setOpenId(null);
  };

  const reporterText = (c: ErCase) => (c.reporterKind === 'ANONYMOUS' ? 'Anonymous' : c.reporterKind === 'EXTERNAL' ? c.reporterName ?? 'External stakeholder' : org.name(c.reporterStaffId));

  return (
    <>
      <div className="pr-kv wf-gap">
        {(Object.keys(ER_TYPES) as ErCaseType[]).map((t) => {
          const all = cases.filter((c) => c.type === t);
          return (
            <div key={t}>
              <span>{ER_TYPES[t].label}</span>
              <strong>{all.filter((c) => c.stage !== 'CLOSED').length} open</strong>
              <small>{all.length} this year</small>
            </div>
          );
        })}
      </div>

      <Card
        title="Grievances & whistleblowing"
        sub={`Acknowledge every report within ${ER_ACK_SLA_DAYS} days and reach an outcome within ${ER_INVESTIGATION_SLA_DAYS} days. Confidential cases are visible only to their case officer; anyone else opening one is logged.`}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> New report
          </button>
        }
      >
        <div className="digicraft-toolbar wf-toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search ref, type, category or place" />
          <FilterPills
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'OPEN', label: 'Open', n: open.length },
              { id: 'OVERDUE', label: 'Overdue', n: overdue.length },
              { id: 'CLOSED', label: 'Closed', n: cases.length - open.length },
              { id: 'ALL', label: 'All', n: cases.length }
            ]}
          />
          <select className="form-control hi-select-sm" value={type} onChange={(ev) => setType(ev.target.value as typeof type)} aria-label="Report type">
            <option value="ANY">All types</option>
            {(Object.keys(ER_TYPES) as ErCaseType[]).map((t) => (
              <option key={t} value={t}>
                {ER_TYPES[t].label}
              </option>
            ))}
          </select>
          <label className="wf-viewer">
            <span>Viewing as</span>
            <select className="form-control hi-select-sm" value={viewer} onChange={(ev) => setViewer(ev.target.value)}>
              {officers.map((e) => (
                <option key={e.staffId} value={e.staffId}>
                  {e.fullName} · {e.jobTitle}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Reported by</th>
                <th>Against</th>
                <th>Reported</th>
                <th>Stage</th>
                <th>SLA</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && <Empty cols={7}>No cases match.</Empty>}
              {pg.rows.map((c) => {
                const sla = erSla(c, org.today);
                const visible = canSee(c);
                return (
                  <tr key={c.id} className={visible ? undefined : 'wf-masked'}>
                    <td>
                      <div className="wf-person">
                        <strong>
                          {c.ref} · {ER_TYPES[c.type].label}
                        </strong>
                        <span>{visible ? `${c.category} · ${c.location}` : 'Details hidden'}</span>
                      </div>
                      {c.confidential && (
                        <Pill tone="critical" title={`Case officer: ${org.name(c.caseOfficer)}`}>
                          <Lock size={10} /> Confidential
                        </Pill>
                      )}
                    </td>
                    <td>{visible ? <Person id={c.reporterKind === 'EMPLOYEE' ? c.reporterStaffId : undefined} name={() => reporterText(c)} /> : <span className="hi-sub">Confidential</span>}</td>
                    <td>{visible ? (c.againstStaffId ? <Person id={c.againstStaffId} name={org.name} /> : <span className="hi-sub">—</span>) : <span className="hi-sub">Confidential</span>}</td>
                    <td>{fmt(c.reportedOn)}</td>
                    <td>
                      <Pill tone={STAGE_TONE[c.stage]}>{stageLabel(c.stage)}</Pill>
                      {c.outcome && <div className="hi-sub">{ER_OUTCOME_LABEL[c.outcome]}</div>}
                    </td>
                    <td>
                      <Pill tone={sla.tone}>{sla.text}</Pill>
                    </td>
                    <td className="wf-actions">
                      {visible ? (
                        <button className="btn btn-secondary btn-sm" onClick={() => setOpenId(c.id)}>
                          Open
                        </button>
                      ) : (
                        <button className="btn btn-secondary btn-sm" onClick={() => setRevealId(c.id)} title="Opening a confidential case is logged">
                          <Eye size={13} /> Reveal
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="cases" sizes={[10, 25, 50]} />
      </Card>

      {revealId && (
        <RevealModal
          caseRef={cases.find((c) => c.id === revealId)?.ref ?? ''}
          officer={org.name(cases.find((c) => c.id === revealId)?.caseOfficer)}
          viewer={viewerName}
          onClose={() => setRevealId(null)}
          onReveal={(reason) => {
            logErAccess(revealId, viewerName, reason);
            setRevealed((s) => new Set(s).add(revealId));
            setOpenId(revealId);
            setRevealId(null);
          }}
        />
      )}
      {current && <CaseDrawer c={current} viewer={viewerName} onClose={() => setOpenId(null)} onHide={current.confidential && current.caseOfficer !== viewer ? () => hide(current.id) : undefined} />}
      {creating && <NewCaseModal officers={officers} onClose={() => setCreating(false)} />}
    </>
  );
};

const RevealModal: React.FC<{ caseRef: string; officer: string; viewer: string; onClose: () => void; onReveal: (reason: string) => void }> = ({ caseRef, officer, viewer, onClose, onReveal }) => {
  const [reason, setReason] = useState('');
  return (
    <Modal
      title={`Open confidential case ${caseRef}`}
      subtitle={`Case officer: ${officer}`}
      onClose={onClose}
      width={520}
      footer={
        <button className="btn btn-primary" disabled={reason.trim().length < 5} onClick={() => onReveal(reason.trim())}>
          <Eye size={14} /> Reveal and log
        </button>
      }
    >
      <div className="pr-note warn">
        You are not the case officer. Opening this case records your name ({viewer}), today’s date and your reason on the case’s access log, which the case officer sees.
      </div>
      <Field label="Reason for access" wide>
        <input className="form-control" value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Asked to review as second investigator" autoFocus />
      </Field>
    </Modal>
  );
};

const NewCaseModal: React.FC<{ officers: { staffId: string; fullName: string; jobTitle: string }[]; onClose: () => void }> = ({ officers, onClose }) => {
  const { addErCase } = useApp();
  const org = useWfOrg();
  const [type, setType] = useState<ErCaseType>('GRIEVANCE');
  const [category, setCategory] = useState(ER_TYPES.GRIEVANCE.categories[0]);
  const [reporterKind, setReporterKind] = useState<ErReporterKind>('EMPLOYEE');
  const [reporterStaffId, setReporter] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [reporterContact, setContact] = useState('');
  const [confidential, setConfidential] = useState(false);
  const [againstStaffId, setAgainst] = useState('');
  const [description, setDescription] = useState('');
  const [occurredOn, setOccurred] = useState(org.today);
  const [location, setLocation] = useState('');
  const [caseOfficer, setOfficer] = useState('KHE-0290');

  const pickType = (t: ErCaseType) => {
    setType(t);
    setCategory(ER_TYPES[t].categories[0]);
    setConfidential(ER_TYPES[t].confidentialByDefault);
    if (t === 'STAKEHOLDER') setReporterKind('EXTERNAL');
    else if (reporterKind === 'EXTERNAL') setReporterKind('EMPLOYEE');
  };
  const ok = description.trim() && location.trim() && (reporterKind !== 'EMPLOYEE' || reporterStaffId) && (reporterKind !== 'EXTERNAL' || reporterName.trim());

  return (
    <Modal
      title="New report"
      subtitle="Grievance, harassment, whistleblowing, incident or stakeholder grievance"
      onClose={onClose}
      width={720}
      footer={
        <button
          className="btn btn-primary"
          disabled={!ok}
          onClick={() => {
            const c = addErCase({
              type,
              category,
              reporterKind,
              reporterStaffId: reporterKind === 'EMPLOYEE' ? reporterStaffId : undefined,
              reporterName: reporterKind === 'EXTERNAL' ? reporterName.trim() : undefined,
              reporterContact: reporterKind === 'EXTERNAL' ? reporterContact.trim() || undefined : undefined,
              confidential: confidential || reporterKind === 'ANONYMOUS',
              againstStaffId: againstStaffId || undefined,
              description: description.trim(),
              occurredOn,
              location: location.trim(),
              caseOfficer
            });
            if (c) onClose();
          }}
        >
          Log report
        </button>
      }
    >
      <div className="pr-form-grid">
        <Field label="Type">
          <select className="form-control" value={type} onChange={(ev) => pickType(ev.target.value as ErCaseType)}>
            {(Object.keys(ER_TYPES) as ErCaseType[]).map((t) => (
              <option key={t} value={t}>
                {ER_TYPES[t].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select className="form-control" value={category} onChange={(ev) => setCategory(ev.target.value)}>
            {ER_TYPES[type].categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Reported by">
          <select className="form-control" value={reporterKind} onChange={(ev) => setReporterKind(ev.target.value as ErReporterKind)}>
            <option value="EMPLOYEE">Employee</option>
            <option value="ANONYMOUS">Anonymous</option>
            <option value="EXTERNAL">External stakeholder</option>
          </select>
        </Field>
        {reporterKind === 'EMPLOYEE' && (
          <Field label="Employee">
            <StaffSelect value={reporterStaffId} onChange={setReporter} staff={org.staff} />
          </Field>
        )}
        {reporterKind === 'EXTERNAL' && (
          <>
            <Field label="Name or group">
              <input className="form-control" value={reporterName} onChange={(ev) => setReporterName(ev.target.value)} placeholder="e.g. Kapsoit village elders" />
            </Field>
            <Field label="Contact">
              <input className="form-control" value={reporterContact} onChange={(ev) => setContact(ev.target.value)} />
            </Field>
          </>
        )}
        {reporterKind === 'ANONYMOUS' && (
          <Field label="Contact">
            <input className="form-control" disabled value="None — anonymous reports are always confidential" />
          </Field>
        )}
        <Field label="Against (optional)">
          <StaffSelect value={againstStaffId} onChange={setAgainst} staff={org.staff} placeholder="No one named" />
        </Field>
        <Field label="Date it happened">
          <input className="form-control" type="date" max={org.today} value={occurredOn} onChange={(ev) => setOccurred(ev.target.value)} />
        </Field>
        <Field label="Location">
          <input className="form-control" value={location} onChange={(ev) => setLocation(ev.target.value)} placeholder="e.g. Factory — packing line" />
        </Field>
        <Field label="Case officer">
          <select className="form-control" value={caseOfficer} onChange={(ev) => setOfficer(ev.target.value)}>
            {officers.map((e) => (
              <option key={e.staffId} value={e.staffId}>
                {e.fullName} · {e.jobTitle}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description" wide>
          <textarea className="form-control" rows={4} value={description} onChange={(ev) => setDescription(ev.target.value)} placeholder="What happened, who was involved, any witnesses" />
        </Field>
      </div>
      <label className="wf-check">
        <input type="checkbox" checked={confidential || reporterKind === 'ANONYMOUS'} disabled={reporterKind === 'ANONYMOUS'} onChange={(ev) => setConfidential(ev.target.checked)} />
        Confidential — only the case officer sees the reporter and details
      </label>
    </Modal>
  );
};

const CaseDrawer: React.FC<{ c: ErCase; viewer: string; onClose: () => void; onHide?: () => void }> = ({ c, viewer, onClose, onHide }) => {
  const { acknowledgeErCase, startErInvestigation, addErInterview, saveErFindings, recordErOutcome, escalateErCase, closeErCase, addErNote, raiseCase, hrEmployees } = useApp();
  // Opens the matching case in Contract Compliance & Disciplinary against the employee the report named
  const openDisciplinary = () => {
    if (!c.againstStaffId) return;
    const serious = c.type === 'HARASSMENT' || c.type === 'WHISTLEBLOWING';
    const dc = raiseCase({ staffId: c.againstStaffId, category: serious ? 'GROSS_MISCONDUCT' : 'MISCONDUCT', summary: `${c.ref} ${c.category}: ${c.findings ?? c.description}`.slice(0, 280), incidentDate: c.occurredOn });
    escalateErCase(c.id, dc.id);
  };
  const against = c.againstStaffId ? hrEmployees.find((x) => x.staffId === c.againstStaffId) : undefined;
  const org = useWfOrg();
  const sla = erSla(c, org.today);
  const [ackNote, setAckNote] = useState('');
  const [investigator, setInvestigator] = useState(c.caseOfficer);
  const [iv, setIv] = useState<Omit<ErInterview, 'id'>>({ on: org.today, person: '', role: 'Witness', summary: '' });
  const [findings, setFindings] = useState(c.findings ?? '');
  const [outcome, setOutcome] = useState<ErOutcome>('SUBSTANTIATED');
  const [outcomeNote, setOutcomeNote] = useState('');
  const [discRef, setDiscRef] = useState('');
  const [note, setNote] = useState('');
  const stageIx = ER_STAGES.findIndex((s) => s.id === c.stage);
  // Group HR officers can investigate in any company
  const investigators = [...OFFICERS.map((id) => org.byId.get(id)).filter((e): e is NonNullable<typeof e> => !!e && !org.staff.includes(e)), ...org.staff];

  return (
    <Drawer title={`${c.ref} · ${ER_TYPES[c.type].label}`} subtitle={`${c.category} · reported ${fmt(c.reportedOn)} · case officer ${org.name(c.caseOfficer)}`} onClose={onClose}>
      {c.confidential && (
        <div className="pr-note warn wf-row">
          <span>
            <Lock size={13} /> Confidential case. {onHide ? `You opened it as ${viewer}; this is on the access log.` : 'You are the case officer.'}
          </span>
          {onHide && (
            <button className="btn btn-secondary btn-sm" onClick={onHide}>
              <EyeOff size={13} /> Hide again
            </button>
          )}
        </div>
      )}
      <ol className="wf-stepper" aria-label="Case stages">
        {ER_STAGES.map((s, i) => (
          <li key={s.id} className={i < stageIx ? 'done' : i === stageIx ? 'current' : ''}>
            {s.label}
          </li>
        ))}
      </ol>
      <div className="wf-row">
        <Pill tone={sla.tone}>{sla.text}</Pill>
        {c.disciplinaryRef && (
          <Pill tone="critical">
            <FileWarning size={11} /> Disciplinary {c.disciplinaryRef}
          </Pill>
        )}
      </div>

      <dl className="hi-dl wf-section">
        <dt>Reported by</dt>
        <dd>
          {c.reporterKind === 'ANONYMOUS' ? 'Anonymous' : c.reporterKind === 'EXTERNAL' ? `${c.reporterName ?? 'External'}${c.reporterContact ? ` (${c.reporterContact})` : ''}` : `${org.name(c.reporterStaffId)} (${c.reporterStaffId})`}
        </dd>
        <dt>Against</dt>
        <dd>{c.againstStaffId ? `${org.name(c.againstStaffId)} (${c.againstStaffId})` : '—'}</dd>
        <dt>When and where</dt>
        <dd>
          {fmt(c.occurredOn)} · {c.location}
        </dd>
        <dt>Description</dt>
        <dd>{c.description}</dd>
        {c.investigator && (
          <>
            <dt>Investigator</dt>
            <dd>
              {org.name(c.investigator)} · since {fmt(c.investigationStartedOn)}
            </dd>
          </>
        )}
        {c.outcome && (
          <>
            <dt>Outcome</dt>
            <dd>
              <strong>{ER_OUTCOME_LABEL[c.outcome]}</strong> ({fmt(c.outcomeOn)}) — {c.outcomeNote}
            </dd>
          </>
        )}
      </dl>

      {c.stage === 'RECEIVED' && (
        <div className="wf-section">
          <h4>Acknowledge</h4>
          <div className="wf-inline">
            <input className="form-control grow" value={ackNote} onChange={(ev) => setAckNote(ev.target.value)} placeholder="Note to file, e.g. interim measures (optional)" />
            <button className="btn btn-primary btn-sm" onClick={() => acknowledgeErCase(c.id, ackNote.trim() || undefined)}>
              Acknowledge
            </button>
          </div>
        </div>
      )}
      {(c.stage === 'ACKNOWLEDGED' || c.stage === 'RECEIVED') && (
        <div className="wf-section">
          <h4>Start investigation</h4>
          <div className="wf-inline">
            <StaffSelect value={investigator} onChange={setInvestigator} staff={investigators} placeholder="Investigator" ariaLabel="Investigator" />
            <button className="btn btn-primary btn-sm" disabled={!investigator} onClick={() => startErInvestigation(c.id, investigator)}>
              Open investigation
            </button>
          </div>
        </div>
      )}

      {(c.stage === 'INVESTIGATION' || c.interviews.length > 0) && (
        <div className="wf-section">
          <h4>Interviews ({c.interviews.length})</h4>
          {c.interviews.length > 0 && (
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Person</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {c.interviews.map((x) => (
                  <tr key={x.id}>
                    <td>{fmt(x.on)}</td>
                    <td>
                      {x.person}
                      <div className="hi-sub">{x.role}</div>
                    </td>
                    <td>{x.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {c.stage === 'INVESTIGATION' && (
            <div className="wf-inline wf-wrap">
              <input className="form-control" type="date" max={org.today} value={iv.on} onChange={(ev) => setIv({ ...iv, on: ev.target.value })} aria-label="Interview date" />
              <input className="form-control" value={iv.person} onChange={(ev) => setIv({ ...iv, person: ev.target.value })} placeholder="Person interviewed" aria-label="Person interviewed" />
              <select className="form-control" value={iv.role} onChange={(ev) => setIv({ ...iv, role: ev.target.value as ErInterview['role'] })} aria-label="Role">
                <option>Complainant</option>
                <option>Respondent</option>
                <option>Witness</option>
              </select>
              <input className="form-control grow" value={iv.summary} onChange={(ev) => setIv({ ...iv, summary: ev.target.value })} placeholder="Summary of statement" aria-label="Summary" />
              <button
                className="btn btn-secondary btn-sm"
                disabled={!iv.person.trim() || !iv.summary.trim()}
                onClick={() => {
                  addErInterview(c.id, { ...iv, person: iv.person.trim(), summary: iv.summary.trim() });
                  setIv({ on: org.today, person: '', role: 'Witness', summary: '' });
                }}
              >
                Add interview
              </button>
            </div>
          )}
        </div>
      )}

      {c.stage === 'INVESTIGATION' && (
        <>
          <div className="wf-section">
            <h4>Findings</h4>
            <textarea className="form-control" rows={3} value={findings} onChange={(ev) => setFindings(ev.target.value)} placeholder="What the evidence shows" />
            <button className="btn btn-secondary btn-sm wf-mt" disabled={findings.trim() === (c.findings ?? '')} onClick={() => saveErFindings(c.id, findings.trim())}>
              Save findings
            </button>
          </div>
          <div className="wf-section">
            <h4>Outcome</h4>
            <div className="wf-inline wf-wrap">
              <select className="form-control" value={outcome} onChange={(ev) => setOutcome(ev.target.value as ErOutcome)} aria-label="Outcome">
                {(Object.keys(ER_OUTCOME_LABEL) as ErOutcome[]).map((o) => (
                  <option key={o} value={o}>
                    {ER_OUTCOME_LABEL[o]}
                  </option>
                ))}
              </select>
              <input className="form-control grow" value={outcomeNote} onChange={(ev) => setOutcomeNote(ev.target.value)} placeholder="Decision and next steps" aria-label="Outcome note" />
              <button
                className="btn btn-primary btn-sm"
                disabled={!c.findings && !findings.trim()}
                title={!c.findings && !findings.trim() ? 'Record findings first' : undefined}
                onClick={() => {
                  if (findings.trim() && findings.trim() !== c.findings) saveErFindings(c.id, findings.trim());
                  recordErOutcome(c.id, outcome, outcomeNote);
                }}
              >
                Record outcome
              </button>
            </div>
          </div>
        </>
      )}
      {c.findings && c.stage !== 'INVESTIGATION' && (
        <div className="wf-section">
          <h4>Findings</h4>
          <p className="wf-text">{c.findings}</p>
        </div>
      )}

      {(c.stage === 'OUTCOME' || c.stage === 'CLOSED') && c.outcome === 'SUBSTANTIATED' && !c.disciplinaryRef && (
        <div className="wf-section">
          <h4>Escalate to Disciplinary</h4>
          {against && (
            <div className="wf-inline" style={{ marginBottom: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={openDisciplinary}>
                <FileWarning size={13} /> Open disciplinary case against {against.fullName}
              </button>
              <span className="hi-sub">Starts due process in Contract Compliance & Disciplinary and links it here.</span>
            </div>
          )}
          <div className="wf-inline">
            <input className="form-control grow" value={discRef} onChange={(ev) => setDiscRef(ev.target.value)} placeholder={`Disciplinary case reference, e.g. DC-${org.today.slice(0, 4)}-015`} aria-label="Disciplinary reference" />
            <button className="btn btn-secondary btn-sm" disabled={!discRef.trim()} onClick={() => escalateErCase(c.id, discRef)}>
              <FileWarning size={13} /> Record escalation
            </button>
          </div>
        </div>
      )}
      {c.stage === 'OUTCOME' && (
        <div className="wf-section">
          <button className="btn btn-primary btn-sm" onClick={() => closeErCase(c.id, 'Outcome communicated')}>
            Close case
          </button>
        </div>
      )}

      <div className="wf-section">
        <h4>Timeline</h4>
        <ol className="hi-timeline">
          {[...c.timeline].reverse().map((e, i) => (
            <li key={i} className={`wf-ev-${e.kind}`}>
              {e.text}
              <span>
                {fmt(e.on)} · {e.by}
              </span>
            </li>
          ))}
        </ol>
        <div className="wf-inline wf-mt">
          <input className="form-control grow" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Add a note to the file" aria-label="Note" />
          <button
            className="btn btn-secondary btn-sm"
            disabled={!note.trim()}
            onClick={() => {
              addErNote(c.id, note, viewer);
              setNote('');
            }}
          >
            <MessageSquarePlus size={13} /> Add note
          </button>
        </div>
      </div>

      {c.confidential && (
        <div className="wf-section">
          <h4>Access log</h4>
          {c.accessLog.length === 0 ? (
            <p className="hi-sub">Only the case officer has opened this case.</p>
          ) : (
            <ul className="wf-list">
              {c.accessLog.map((a, i) => (
                <li key={i}>
                  <strong>{a.by}</strong> · {fmt(a.on)} — {a.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Drawer>
  );
};
