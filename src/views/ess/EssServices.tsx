/* Portal panels for Employee Relations & Welfare: report a concern, welfare requests and medical cover. */
import React, { useMemo, useState } from 'react';
import { EyeOff, HeartHandshake, Lock, Plus, ShieldAlert, Stethoscope, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { addDays, daysBetween } from '../../data/timeEngine';
import {
  ageOn,
  CHILD_AGE_LIMIT,
  CLAIM_STATUS_LABEL,
  CLAIM_TYPE_LABEL,
  ER_ACK_SLA_DAYS,
  ER_INVESTIGATION_SLA_DAYS,
  ER_OUTCOME_LABEL,
  ER_STAGES,
  ER_TYPES,
  MEDICAL_CLAIM_TYPES,
  type ClaimType,
  type ErCase,
  type ErCaseType,
  type MedicalClaim,
  type WelfareRequest
} from '../../data/welfareSeed';
import { ESS_EMPLOYEE, formatDate, formatKes, type EssRequestType } from './essData';
import { myReports, newCaseCode, rememberReport } from './essSession';
import { Capped, Pill, ReqError, Steps, useEssMe, type PillTone } from './essShared';

/* ------------------------------------------------------------------ */
/* Report a concern                                                    */
/* ------------------------------------------------------------------ */

const CONCERN_TYPES: ErCaseType[] = ['GRIEVANCE', 'HARASSMENT', 'WHISTLEBLOWING', 'STAKEHOLDER'];
/** HR officer who receives portal reports, and a stand-in when the report is about them */
const DEFAULT_OFFICER = 'KHE-0290';
const STANDBY_OFFICER = 'KHE-0141';

const STAGE_TONE: Record<ErCase['stage'], PillTone> = { RECEIVED: 'warning', ACKNOWLEDGED: 'info', INVESTIGATION: 'primary', OUTCOME: 'info', CLOSED: 'success' };

/** What the reporter can expect next, against the acknowledgement and outcome deadlines */
const slaOf = (c: ErCase, today: string): { text: string; late: boolean } => {
  if (c.stage === 'RECEIVED') {
    const left = daysBetween(today, addDays(c.reportedOn, ER_ACK_SLA_DAYS));
    return left < 0 ? { text: `HR should have acknowledged this ${-left} day(s) ago`, late: true } : { text: `HR will acknowledge within ${left} day(s)`, late: false };
  }
  if (c.stage === 'ACKNOWLEDGED' || c.stage === 'INVESTIGATION') {
    const left = daysBetween(today, addDays(c.acknowledgedOn ?? c.reportedOn, ER_INVESTIGATION_SLA_DAYS));
    return left < 0 ? { text: `Outcome is ${-left} day(s) late`, late: true } : { text: `Outcome expected within ${left} day(s)`, late: false };
  }
  if (c.stage === 'OUTCOME') return { text: 'Outcome reached — HR will close the case', late: false };
  return { text: `Closed ${c.closedOn ? formatDate(c.closedOn) : ''}`, late: false };
};

export const EssConcerns: React.FC = () => {
  const { erCases, addErCase, welfareToday: today, hrEmployees } = useApp();
  const me = useEssMe();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ErCaseType>('GRIEVANCE');
  const [category, setCategory] = useState(ER_TYPES.GRIEVANCE.categories[0]);
  const [description, setDescription] = useState('');
  const [onBehalfOf, setOnBehalfOf] = useState('');
  const [location, setLocation] = useState('');
  const [occurredOn, setOccurredOn] = useState(today);
  const [against, setAgainst] = useState('');
  const [confidential, setConfidential] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ ref: string; code?: string } | null>(null);

  const colleagues = useMemo(
    () => me.hrEmployees.filter((e) => e.orgId === me.orgId && e.staffId !== ESS_EMPLOYEE.staffId && e.status !== 'TERMINATED').sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [me.hrEmployees, me.orgId]
  );

  const pickType = (t: ErCaseType) => {
    setType(t);
    setCategory(ER_TYPES[t].categories[0]);
    setConfidential(ER_TYPES[t].confidentialByDefault);
  };

  const reset = () => {
    setOpen(false);
    setDescription('');
    setOnBehalfOf('');
    setLocation('');
    setOccurredOn(today);
    setAgainst('');
    setAnonymous(false);
    setError('');
    pickType('GRIEVANCE');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !location.trim()) return setError('Describe what happened and where.');
    if (occurredOn > today) return setError('The date can’t be in the future.');
    const text = `${type === 'STAKEHOLDER' && onBehalfOf.trim() ? `On behalf of: ${onBehalfOf.trim()}. ` : ''}${description.trim()}`;
    const c = addErCase({
      type,
      category,
      reporterKind: anonymous ? 'ANONYMOUS' : 'EMPLOYEE',
      reporterStaffId: anonymous ? undefined : ESS_EMPLOYEE.staffId,
      confidential: confidential || anonymous,
      againstStaffId: against || undefined,
      description: text,
      occurredOn,
      location: location.trim(),
      caseOfficer: against === DEFAULT_OFFICER ? STANDBY_OFFICER : DEFAULT_OFFICER,
      // Anonymous reports still go to the employee's own company
      orgId: hrEmployees.find((x) => x.staffId === ESS_EMPLOYEE.staffId)?.orgId
    });
    if (!c) return;
    const code = anonymous ? newCaseCode() : undefined;
    rememberReport({ caseId: c.id, ref: c.ref, anonymous, code });
    reset();
    setDone({ ref: c.ref, code });
  };

  // Named reports come from the case register; anonymous ones only from this device
  const mine = useMemo(() => {
    const session = new Map(myReports().map((r) => [r.caseId, r]));
    return erCases
      .filter((c) => c.reporterStaffId === ESS_EMPLOYEE.staffId || session.has(c.id))
      .map((c) => ({ c, s: session.get(c.id) }))
      .sort((a, b) => b.c.reportedOn.localeCompare(a.c.reportedOn) || b.c.ref.localeCompare(a.c.ref));
  }, [erCases]);

  return (
    <div className="ess-stack">
      <section className="ess-card">
        <div className="ess-card-head">
          <h3>
            <ShieldAlert size={16} /> {open ? 'Report a concern' : 'My reports'}
          </h3>
          {!open && (
            <button className="btn btn-primary btn-sm" onClick={() => {
              setOpen(true);
              setDone(null);
            }}>
              <Plus size={14} /> Report a concern
            </button>
          )}
        </div>

        {done && !open && (
          <div className="ess-notice">
            <strong>{done.ref} received.</strong> HR acknowledges every report within {ER_ACK_SLA_DAYS} days.
            {done.code && (
              <>
                {' '}
                Your private case code is <code className="ess-case-code">{done.code}</code>. Keep it — your name is not on this report, and the code is how you follow it up with HR.
              </>
            )}
          </div>
        )}

        {open && (
          <form className="ess-form" onSubmit={submit} noValidate>
            <div className="ess-type-grid" role="radiogroup" aria-label="Kind of concern">
              {CONCERN_TYPES.map((t) => (
                <button type="button" role="radio" aria-checked={type === t} key={t} className={`ess-type-chip ${type === t ? 'active' : ''}`} onClick={() => pickType(t)}>
                  {ER_TYPES[t].label}
                </button>
              ))}
            </div>
            <div className="ess-form-grid">
              <label className="req-field ess-span-2">
                <span>Category *</span>
                <select className="form-control" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {ER_TYPES[type].categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="req-field">
                <span>When did it happen? *</span>
                <input type="date" className="form-control" max={today} value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
              </label>
              <label className="req-field">
                <span>Where? *</span>
                <input className="form-control" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Factory floor, line 2" />
              </label>
              {type === 'STAKEHOLDER' && (
                <label className="req-field ess-span-full">
                  <span>On behalf of (optional)</span>
                  <input className="form-control" value={onBehalfOf} onChange={(e) => setOnBehalfOf(e.target.value)} placeholder="Community, outgrower, supplier or contractor who raised it" />
                </label>
              )}
              <label className="req-field ess-span-full">
                <span>What happened? *</span>
                <textarea className="form-control" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Say what happened, who was involved and any witnesses." />
              </label>
              <label className="req-field ess-span-2">
                <span>About a colleague (optional)</span>
                <select className="form-control" value={against} onChange={(e) => setAgainst(e.target.value)}>
                  <option value="">No one in particular</option>
                  {colleagues.map((e) => (
                    <option key={e.staffId} value={e.staffId}>
                      {e.fullName} · {e.jobTitle}
                    </option>
                  ))}
                </select>
              </label>
              <div className="req-field ess-span-2 ess-privacy">
                <span>Privacy</span>
                <label className="ess-check">
                  <input type="checkbox" checked={confidential || anonymous} disabled={anonymous} onChange={(e) => setConfidential(e.target.checked)} />
                  <Lock size={13} /> Confidential — only the case officer sees the details
                </label>
                <label className="ess-check">
                  <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                  <EyeOff size={13} /> Anonymous — my name is not recorded
                </label>
              </div>
            </div>
            {anonymous && <p className="ess-hint">Anonymous reports can’t be traced to you. You get a private case code to follow up, and the report is listed only on this device.</p>}
            <ReqError text={error} />
            <div className="ess-form-actions">
              <span className="ess-hint">Goes to HR (Employee Relations)</span>
              <button type="button" className="btn btn-secondary" onClick={reset}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Send report
              </button>
            </div>
          </form>
        )}

        {!open &&
          (mine.length === 0 ? (
            <div className="ess-empty">
              <ShieldAlert size={28} />
              <strong>No reports</strong>
              <span>Grievances, harassment, whistleblowing and stakeholder concerns you raise appear here.</span>
            </div>
          ) : (
            <Capped
              items={mine}
              noun="reports"
              render={({ c, s }) => {
                const sla = slaOf(c, today);
                const at = ER_STAGES.findIndex((x) => x.id === c.stage);
                return (
                  <li key={c.id} className="ess-request">
                    <div className="ess-request-top">
                      <div>
                        <strong>
                          {ER_TYPES[c.type].label} · {c.category}
                        </strong>
                        <span className="ess-muted">
                          {c.ref} · reported {formatDate(c.reportedOn)} · {c.location}
                        </span>
                      </div>
                      <Pill tone={STAGE_TONE[c.stage]}>{ER_STAGES[at]?.label ?? c.stage}</Pill>
                    </div>
                    <div className="ess-badges">
                      {s?.anonymous && (
                        <Pill tone="primary" title="Listed on this device only">
                          <EyeOff size={11} /> Anonymous{s.code ? ` · code ${s.code}` : ''}
                        </Pill>
                      )}
                      {c.confidential && (
                        <Pill tone="primary">
                          <Lock size={11} /> Confidential
                        </Pill>
                      )}
                      <span className={`ess-muted ${sla.late ? 'ess-late' : ''}`}>{sla.text}</span>
                    </div>
                    {c.outcome && <p>Outcome: {ER_OUTCOME_LABEL[c.outcome]}. HR will explain what happens next.</p>}
                    <Steps steps={ER_STAGES.map((x) => x.label)} at={at} label={`Progress: ${c.stage}`} />
                  </li>
                );
              }}
            />
          ))}
      </section>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Welfare                                                             */
/* ------------------------------------------------------------------ */

const WF_STATUS: Record<WelfareRequest['status'], { label: string; tone: PillTone }> = {
  PENDING: { label: 'With HR', tone: 'warning' },
  APPROVED: { label: 'Approved — to pay', tone: 'info' },
  DECLINED: { label: 'Declined', tone: 'critical' },
  PAID: { label: 'Paid', tone: 'success' }
};

export const EssWelfare: React.FC = () => {
  const { welfarePolicies, welfareRequests, addWelfareRequest } = useApp();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(welfarePolicies[0]?.type);
  const policy = welfarePolicies.find((p) => p.type === type) ?? welfarePolicies[0];
  const [optionId, setOptionId] = useState(policy?.options[0]?.id ?? '');
  const option = policy?.options.find((o) => o.id === optionId) ?? policy?.options[0];
  const [beneficiary, setBeneficiary] = useState('');
  const [documents, setDocuments] = useState('');
  const [error, setError] = useState('');
  const needsName = !!option && option.id !== 'EMPLOYEE' && !/^Y\d/.test(option.id);

  const mine = useMemo(() => welfareRequests.filter((r) => r.staffId === ESS_EMPLOYEE.staffId).sort((a, b) => b.requestedOn.localeCompare(a.requestedOn) || b.ref.localeCompare(a.ref)), [welfareRequests]);
  const labelOf = (r: WelfareRequest) => {
    const p = welfarePolicies.find((x) => x.type === r.type);
    return { type: p?.label ?? r.type, option: p?.options.find((o) => o.id === r.optionId)?.label ?? r.optionId };
  };

  const close = () => {
    setOpen(false);
    setBeneficiary('');
    setDocuments('');
    setError('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!policy || !option) return;
    if (needsName && !beneficiary.trim()) return setError('Give the name of the person this is for.');
    if (!documents.trim()) return setError(`Say which supporting document you have (${policy.documents.toLowerCase()}).`);
    const r = addWelfareRequest({ staffId: ESS_EMPLOYEE.staffId, type: policy.type, optionId: option.id, documents: documents.trim(), beneficiaryName: beneficiary.trim() || undefined });
    if (r) close();
  };

  return (
    <section className="ess-card">
      <div className="ess-card-head">
        <h3>
          <HeartHandshake size={16} /> {open ? 'Welfare request' : 'My welfare requests'}
        </h3>
        {!open && (
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
            <Plus size={14} /> New welfare request
          </button>
        )}
      </div>
      {open && policy && (
        <form className="ess-form" onSubmit={submit} noValidate>
          <div className="ess-type-grid" role="radiogroup" aria-label="Welfare benefit">
            {welfarePolicies.map((p) => (
              <button
                type="button"
                role="radio"
                aria-checked={p.type === policy.type}
                key={p.type}
                className={`ess-type-chip ${p.type === policy.type ? 'active' : ''}`}
                onClick={() => {
                  setType(p.type);
                  setOptionId(p.options[0]?.id ?? '');
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="ess-form-grid">
            <label className="req-field ess-span-2">
              <span>For *</span>
              <select className="form-control" value={option?.id} onChange={(e) => setOptionId(e.target.value)}>
                {policy.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} — {formatKes(o.amount)}
                  </option>
                ))}
              </select>
            </label>
            <div className="req-field">
              <span>Amount</span>
              <div className="ess-value">{formatKes(option?.amount ?? 0)}</div>
            </div>
            {needsName && (
              <label className="req-field">
                <span>Name *</span>
                <input className="form-control" value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="Who is it for?" />
              </label>
            )}
            <label className="req-field ess-span-full">
              <span>Supporting document *</span>
              <input className="form-control" value={documents} onChange={(e) => setDocuments(e.target.value)} placeholder={`${policy.documents} (number or note)`} />
              <span className="ess-hint">{policy.note} Hand the original to HR.</span>
            </label>
          </div>
          <ReqError text={error} />
          <div className="ess-form-actions">
            <span className="ess-hint">HR approves; paid through payroll or the welfare fund</span>
            <button type="button" className="btn btn-secondary" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Send request
            </button>
          </div>
        </form>
      )}
      {!open &&
        (mine.length === 0 ? (
          <div className="ess-empty">
            <HeartHandshake size={28} />
            <strong>No welfare requests</strong>
            <span>Bereavement, wedding, hospitalisation and other support you ask for appears here.</span>
          </div>
        ) : (
          <Capped
            items={mine}
            noun="requests"
            render={(r) => {
              const l = labelOf(r);
              return (
                <li key={r.id} className="ess-request">
                  <div className="ess-request-top">
                    <div>
                      <strong>{l.type}</strong>
                      <span className="ess-muted">
                        {r.ref} · {formatDate(r.requestedOn)} · {l.option}
                        {r.beneficiaryName ? ` (${r.beneficiaryName})` : ''} · {formatKes(r.amount)}
                      </span>
                    </div>
                    <Pill tone={WF_STATUS[r.status].tone}>{WF_STATUS[r.status].label}</Pill>
                  </div>
                  {r.status === 'DECLINED' && r.reason && <p>Reason: {r.reason}</p>}
                  {r.status === 'PAID' && <p className="ess-muted">Paid {r.paidOn ? formatDate(r.paidOn) : ''} {r.paidVia === 'PAYROLL' ? `through payroll${r.payPeriod ? ` (${r.payPeriod})` : ''}` : 'from the welfare fund'}.</p>}
                </li>
              );
            }}
          />
        ))}
    </section>
  );
};

/* ------------------------------------------------------------------ */
/* Medical                                                             */
/* ------------------------------------------------------------------ */

const CLAIM_TONE: Record<MedicalClaim['status'], PillTone> = { SUBMITTED: 'warning', WITH_INSURER: 'info', PAID: 'success', REJECTED: 'critical' };

const refundText = (c: MedicalClaim) => {
  if (!c.outOfPocket) return 'Paid to the provider';
  if (c.status === 'REJECTED') return 'No refund';
  if (c.reimbursedPeriod) return `Refund paid through payroll (${c.reimbursedPeriod})`;
  if (c.status === 'PAID') return `Refund of ${formatKes(c.approved ?? 0)} to be posted to payroll`;
  return 'Refund through payroll once the insurer pays';
};

export const EssMedical: React.FC<{ onRequestChange?: (type: EssRequestType, details: string) => void }> = ({ onRequestChange }) => {
  const { medicalSchemes, medicalMembers, medicalClaims, addMedicalClaim, welfareToday: today } = useApp();
  const me = useEssMe();
  const member = medicalMembers.find((m) => m.staffId === ESS_EMPLOYEE.staffId && medicalSchemes.some((s) => s.id === m.schemeId && s.kind === 'MEDICAL'));
  const scheme = medicalSchemes.find((s) => s.id === member?.schemeId);
  const cls = scheme?.classes.find((c) => c.id === member?.classId);
  // Group personal accident / life covers everyone on the payroll of that company
  const gpa = medicalSchemes.find((s) => s.kind === 'GPA_GLA' && s.orgId === me.orgId);
  const mine = useMemo(() => medicalClaims.filter((c) => c.staffId === ESS_EMPLOYEE.staffId).sort((a, b) => b.submittedOn.localeCompare(a.submittedOn) || b.ref.localeCompare(a.ref)), [medicalClaims]);

  // Limits used this policy year (approved where paid, claimed while pending)
  const used = useMemo(() => {
    const out: Partial<Record<ClaimType, number>> = {};
    if (!scheme) return out;
    mine
      .filter((c) => c.schemeId === scheme.id && c.status !== 'REJECTED' && c.serviceOn >= scheme.startOn && c.serviceOn <= scheme.endOn)
      .forEach((c) => (out[c.type] = (out[c.type] ?? 0) + (c.status === 'PAID' ? (c.approved ?? 0) : c.claimed)));
    return out;
  }, [mine, scheme]);

  const types = MEDICAL_CLAIM_TYPES.filter((t) => cls?.limits[t]);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ClaimType>('OUTPATIENT');
  const [patientId, setPatientId] = useState('');
  const [provider, setProvider] = useState('');
  const [serviceOn, setServiceOn] = useState(today);
  const [claimed, setClaimed] = useState('');
  const [outOfPocket, setOutOfPocket] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const remaining = cls?.limits[type] !== undefined ? (cls.limits[type] ?? 0) - (used[type] ?? 0) : undefined;
  const patientName = (id?: string) => (id ? (member?.dependants.find((d) => d.id === id)?.name ?? 'Dependant') : 'Me');

  const close = () => {
    setOpen(false);
    setProvider('');
    setClaimed('');
    setNote('');
    setPatientId('');
    setError('');
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheme) return;
    if (!provider.trim() || !(Number(claimed) > 0)) return setError('Give the hospital or clinic and the amount.');
    if (serviceOn > today) return setError('The treatment date can’t be in the future.');
    const c = addMedicalClaim({ schemeId: scheme.id, staffId: ESS_EMPLOYEE.staffId, type, provider: provider.trim(), serviceOn, claimed: Number(claimed), outOfPocket, patientId: patientId || undefined, note: note.trim() || undefined });
    if (c) close();
  };

  return (
    <div className="ess-stack">
      <section className="ess-card">
        <div className="ess-card-head">
          <h3>
            <Stethoscope size={16} /> My medical cover
          </h3>
          {scheme && !open && (
            <button className="btn btn-primary btn-sm" onClick={() => {
              setOpen(true);
              setType(types[0] ?? 'OUTPATIENT');
            }}>
              <Plus size={14} /> Submit a claim
            </button>
          )}
        </div>
        {!scheme || !member || !cls ? (
          <div className="ess-empty">
            <Stethoscope size={28} />
            <strong>You are not on a company medical scheme</strong>
            <span>HR enrols staff on the medical scheme. Ask HR if you think you should be covered.</span>
            {onRequestChange && (
              <button className="btn btn-secondary btn-sm" onClick={() => onRequestChange('Personal Details Change', 'Please enrol me (and my dependants) on the staff medical scheme.')}>
                Ask HR to enrol me
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="ess-med-head">
              <div>
                <span className="ess-stat-label">Scheme</span>
                <strong>
                  {scheme.insurer} · {scheme.name}
                </strong>
                <span className="ess-muted">
                  {cls.label} class · member no. {member.memberNo} · cover {formatDate(scheme.startOn)} – {formatDate(scheme.endOn)}
                </span>
              </div>
              <Pill tone={member.status === 'ACTIVE' ? 'success' : 'warning'}>{member.status === 'ACTIVE' ? 'Active' : 'Suspended'}</Pill>
            </div>
            <ul className="ess-limits">
              {types.map((t) => {
                const limit = cls.limits[t] ?? 0;
                const u = used[t] ?? 0;
                const pct = limit ? Math.min(100, Math.round((u / limit) * 100)) : 0;
                return (
                  <li key={t}>
                    <div>
                      <span>{CLAIM_TYPE_LABEL[t]}</span>
                      <span className="ess-muted">
                        {formatKes(u)} of {formatKes(limit)}
                      </span>
                    </div>
                    <div className="ess-limit-bar" role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={u} aria-label={`${CLAIM_TYPE_LABEL[t]} used`}>
                      <i className={pct >= 90 ? 'high' : pct >= 70 ? 'mid' : ''} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            {gpa && <p className="ess-hint">Also covered by {gpa.insurer} group personal accident and group life ({gpa.policyNo}).</p>}
          </>
        )}

        {open && scheme && (
          <form className="ess-form ess-form-top" onSubmit={submit} noValidate>
            <div className="ess-form-grid">
              <label className="req-field">
                <span>Patient *</span>
                <select className="form-control" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
                  <option value="">Me</option>
                  {member?.dependants.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.relationship.toLowerCase()})
                    </option>
                  ))}
                </select>
              </label>
              <label className="req-field">
                <span>Type *</span>
                <select className="form-control" value={type} onChange={(e) => setType(e.target.value as ClaimType)}>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {CLAIM_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="req-field">
                <span>Date of treatment *</span>
                <input type="date" className="form-control" max={today} value={serviceOn} onChange={(e) => setServiceOn(e.target.value)} />
              </label>
              <label className="req-field">
                <span>Amount (KES) *</span>
                <input type="number" min={0} step={100} className="form-control" value={claimed} onChange={(e) => setClaimed(e.target.value)} />
              </label>
              <label className="req-field ess-span-2">
                <span>Hospital or clinic *</span>
                <input className="form-control" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. Kericho Nursing Home" />
              </label>
              <label className="req-field ess-span-2">
                <span>Note (optional)</span>
                <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Diagnosis or invoice number" />
              </label>
              <label className="ess-check ess-span-full">
                <input type="checkbox" checked={outOfPocket} onChange={(e) => setOutOfPocket(e.target.checked)} /> I paid the hospital myself — refund me through payroll once the insurer pays
              </label>
            </div>
            {remaining !== undefined && Number(claimed) > remaining && (
              <p className="ess-hint ess-late">This is more than the {formatKes(Math.max(0, remaining))} left on your {CLAIM_TYPE_LABEL[type].toLowerCase()} limit; the insurer may pay less.</p>
            )}
            <ReqError text={error} />
            <div className="ess-form-actions">
              <span className="ess-hint">Goes to HR, who send it to {scheme.insurer}. Attach receipts and the claim form when HR asks.</span>
              <button type="button" className="btn btn-secondary" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Submit claim
              </button>
            </div>
          </form>
        )}
      </section>

      {member && (
        <section className="ess-card">
          <div className="ess-card-head">
            <h3>
              <Users size={16} /> My dependants
            </h3>
            {onRequestChange && (
              <button className="ess-link" onClick={() => onRequestChange('Personal Details Change', 'Medical scheme dependants — please add / remove: ')}>
                Ask for a change
              </button>
            )}
          </div>
          {member.dependants.length === 0 ? (
            <p className="ess-muted">No dependants on your cover.</p>
          ) : (
            <ul className="ess-list compact">
              {member.dependants.map((d) => {
                const age = ageOn(d.dob, today);
                return (
                  <li key={d.id} className="ess-dep">
                    <strong>{d.name}</strong>
                    <span className="ess-muted">
                      {d.relationship} · {age} yrs
                    </span>
                    {d.relationship === 'Child' && age > CHILD_AGE_LIMIT && <Pill tone="warning">Over the age limit</Pill>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section className="ess-card">
        <div className="ess-card-head">
          <h3>My claims</h3>
        </div>
        {mine.length === 0 ? (
          <p className="ess-muted">No claims yet.</p>
        ) : (
          <Capped
            items={mine}
            noun="claims"
            render={(c) => (
              <li key={c.id} className="ess-request">
                <div className="ess-request-top">
                  <div>
                    <strong>
                      {CLAIM_TYPE_LABEL[c.type]} · {c.provider}
                    </strong>
                    <span className="ess-muted">
                      {c.ref} · {patientName(c.patientId)} · treated {formatDate(c.serviceOn)} · claimed {formatKes(c.claimed)}
                      {c.approved !== undefined && c.status === 'PAID' ? ` · approved ${formatKes(c.approved)}` : ''}
                    </span>
                  </div>
                  <Pill tone={CLAIM_TONE[c.status]}>{CLAIM_STATUS_LABEL[c.status]}</Pill>
                </div>
                <p className="ess-muted">
                  {refundText(c)}
                  {c.rejectionReason ? ` — ${c.rejectionReason}` : ''}
                </p>
              </li>
            )}
          />
        )}
      </section>
    </div>
  );
};
