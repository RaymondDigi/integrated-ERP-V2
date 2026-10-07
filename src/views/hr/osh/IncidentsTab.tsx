import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, FileText, Plus, Printer, Search, Stethoscope } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { Modal } from '../payroll/shared';
import { printArea } from '../../ess/EssRecords';
import { BODY_PARTS, DOSH_AREA_OFFICE, INJURY_NATURES, SAFETY_OFFICER, SAFETY_OFFICER_TITLE, SITE_IDS, SITES, WORKPLACE_REG_NO } from '../../../data/oshConfig';
import {
  doshDue,
  doshState,
  isReportable,
  KIND_LABEL,
  lostDaysOf,
  SEVERITY_LABEL,
  siteOf,
  STATUS_LABEL,
  type IncidentKind,
  type IncidentStatus,
  type OshIncident,
  type Severity
} from '../../../data/oshEngine';
import { ActionTable, Chips, EmpCell, Empty, fmt, NewActionRow, Pill, StaffSelect, useOshOrg } from './shared';
import { RaiseClaimModal } from './WibaTab';

const STATUS_CLS: Record<IncidentStatus, string> = { REPORTED: 'warning', INVESTIGATING: 'info', ACTIONS: 'primary', CLOSED: 'success' };
const SEV_CLS: Record<Severity, string> = { NONE: 'primary', FIRST_AID: 'info', MEDICAL: 'warning', LOST_TIME: 'critical', PERMANENT: 'critical', FATAL: 'critical' };

export const IncidentsTab: React.FC = () => {
  const { oshIncidents, selectedOrgId, moduleTabs, setModuleTab } = useApp();
  const org = useOshOrg();
  const [filter, setFilter] = useState<'OPEN' | 'ALL' | 'DOSH'>('OPEN');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  const [formId, setFormId] = useState<string | null>(null);
  const list = useMemo(() => oshIncidents.filter((i) => i.orgId === selectedOrgId), [oshIncidents, selectedOrgId]);

  const focus = moduleTabs['osh-incident'];
  useEffect(() => {
    if (focus) {
      setOpenId(focus);
      setModuleTab('osh-incident', '');
    }
  }, [focus, setModuleTab]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list
      .filter((i) => (filter === 'ALL' ? true : filter === 'OPEN' ? i.status !== 'CLOSED' : isReportable(i) && !i.dosh))
      .filter((i) => !s || `${i.id} ${org.name(i.staffId)} ${i.location} ${i.description}`.toLowerCase().includes(s))
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  }, [list, filter, q, org]);
  const pg = usePaged(rows, 10, `${filter}|${q}`);
  const current = list.find((i) => i.id === openId);

  return (
    <>
      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Incidents & accidents</h3>
            <p>Injuries, near misses, dangerous occurrences and occupational diseases. Notifiable ones go to DOSHS on Form 1 within 7 days (24 hours for a death) — OSHA 2007 s.21.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setReport(true)}>
            <Plus size={14} /> Report incident
          </button>
        </div>
        <div className="pr-toolbar" style={{ marginBottom: 12 }}>
          <Chips
            label="Incident filter"
            value={filter}
            onChange={setFilter}
            options={[
              { id: 'OPEN', label: 'Open', n: list.filter((i) => i.status !== 'CLOSED').length },
              { id: 'DOSH', label: 'DOSH/F1 to file', n: list.filter((i) => isReportable(i) && !i.dosh).length },
              { id: 'ALL', label: 'All', n: list.length }
            ]}
          />
          <div className="form-input-wrapper grow">
            <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)' }} />
            <input className="form-control" style={{ paddingLeft: 30 }} placeholder="Search incident, person or place" value={q} onChange={(ev) => setQ(ev.target.value)} />
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Incident</th>
                <th>Type</th>
                <th>Person affected</th>
                <th>DOSH Form 1</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pg.total === 0 && <Empty cols={5}>No incidents here.</Empty>}
              {pg.rows.map((i) => {
                const d = doshState(i, org.today);
                return (
                  <tr key={i.id} className="tm-click" onClick={() => setOpenId(i.id)}>
                    <td>
                      <strong>{i.id}</strong>
                      <div className="muted">
                        {fmt(i.occurredOn)} · {SITES[i.site].label}
                      </div>
                    </td>
                    <td>
                      {KIND_LABEL[i.kind]}
                      <div style={{ marginTop: 3 }}>
                        <Pill cls={SEV_CLS[i.severity]}>{SEVERITY_LABEL[i.severity]}</Pill>
                      </div>
                    </td>
                    <td>{i.staffId ? <EmpCell e={org.byId.get(i.staffId)} id={i.staffId} sub={i.bodyPart ? `${i.bodyPart} · ${i.injuryNature ?? ''}` : undefined} /> : <span className="muted">No one hurt</span>}</td>
                    <td>
                      <Pill cls={d.cls}>{d.label}</Pill>
                      {d.due && !i.dosh && <div className="muted">By {fmt(d.due)}</div>}
                    </td>
                    <td>
                      <Pill cls={STATUS_CLS[i.status]}>{STATUS_LABEL[i.status]}</Pill>
                      {i.actions.length > 0 && <div className="muted">{i.actions.filter((a) => a.status === 'OPEN').length} of {i.actions.length} actions open</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="incidents" sizes={[10, 25, 50]} />
      </div>
      {report && <ReportIncidentModal onClose={() => setReport(false)} onDone={(id) => setOpenId(id)} />}
      {current && <IncidentModal i={current} onClose={() => setOpenId(null)} onForm={() => setFormId(current.id)} />}
      {formId && list.some((i) => i.id === formId) && <DoshFormModal i={list.find((i) => i.id === formId)!} onClose={() => setFormId(null)} />}
    </>
  );
};

/* ------------------------------------------------------------------ */

const ReportIncidentModal: React.FC<{ onClose: () => void; onDone: (id: string) => void }> = ({ onClose, onDone }) => {
  const { reportIncident } = useApp();
  const org = useOshOrg();
  const [kind, setKind] = useState<IncidentKind>('INJURY');
  const [staffId, setStaffId] = useState('');
  const [occurredOn, setOn] = useState(org.today);
  const [time, setTime] = useState('09:00');
  const [site, setSite] = useState<(typeof SITE_IDS)[number]>('FACTORY');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [bodyPart, setBodyPart] = useState(BODY_PARTS[6]);
  const [nature, setNature] = useState(INJURY_NATURES[0]);
  const [severity, setSeverity] = useState<Severity>('LOST_TIME');
  const [offWork, setOffWork] = useState(true);
  const [immediate, setImmediate] = useState('');
  const [witnesses, setWitnesses] = useState<string[]>([]);
  const injury = kind === 'INJURY' || kind === 'OCCUPATIONAL_DISEASE';
  const sevOptions: Severity[] = injury ? ['FIRST_AID', 'MEDICAL', 'LOST_TIME', 'PERMANENT', 'FATAL'] : ['NONE'];
  const preview = { kind, severity: injury ? severity : 'NONE', occurredOn } as const;

  const pickStaff = (id: string) => {
    setStaffId(id);
    const e = org.byId.get(id);
    if (e) setSite(siteOf(e));
  };

  const submit = () => {
    const inc = reportIncident({
      kind,
      occurredOn,
      time,
      site,
      location,
      description,
      severity: injury ? severity : 'NONE',
      immediateActions: immediate,
      witnesses,
      staffId: staffId || undefined,
      bodyPart: injury ? bodyPart : undefined,
      injuryNature: injury ? nature : undefined,
      offWorkFrom: injury && offWork && ['LOST_TIME', 'PERMANENT', 'FATAL'].includes(severity) ? occurredOn : undefined,
      lostDays: 0
    });
    if (inc) {
      onDone(inc.id);
      onClose();
    }
  };

  return (
    <Modal
      title="Report an incident"
      subtitle="Record the facts while they are fresh. Investigation and corrective actions follow."
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!location.trim() || !description.trim() || (injury && !staffId)}>
            <AlertTriangle size={14} /> Report
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Type</span>
          <select className="form-control" value={kind} onChange={(ev) => setKind(ev.target.value as IncidentKind)}>
            {(Object.keys(KIND_LABEL) as IncidentKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="req-field">
          <span>{injury ? 'Injured / affected employee' : 'Employee involved (optional)'}</span>
          <StaffSelect value={staffId} onChange={pickStaff} staff={org.staff} allowEmpty="Choose…" />
        </label>
        <label className="req-field">
          <span>Date</span>
          <input className="form-control" type="date" max={org.today} value={occurredOn} onChange={(ev) => setOn(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Time</span>
          <input className="form-control" type="time" value={time} onChange={(ev) => setTime(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Site</span>
          <select className="form-control" value={site} onChange={(ev) => setSite(ev.target.value as typeof site)}>
            {SITE_IDS.map((s) => (
              <option key={s} value={s}>
                {SITES[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="req-field">
          <span>Exact location</span>
          <input className="form-control" value={location} onChange={(ev) => setLocation(ev.target.value)} placeholder="e.g. CTC line 2, roller feed" />
        </label>
        {injury && (
          <>
            <label className="req-field">
              <span>Body part</span>
              <select className="form-control" value={bodyPart} onChange={(ev) => setBodyPart(ev.target.value)}>
                {BODY_PARTS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label className="req-field">
              <span>Nature of injury</span>
              <select className="form-control" value={nature} onChange={(ev) => setNature(ev.target.value)}>
                {INJURY_NATURES.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label className="req-field">
              <span>Severity</span>
              <select className="form-control" value={severity} onChange={(ev) => setSeverity(ev.target.value as Severity)}>
                {sevOptions.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="req-field osh-check">
              <span>Off work</span>
              <span className="osh-check-row">
                <input type="checkbox" checked={offWork} disabled={!['LOST_TIME', 'PERMANENT', 'FATAL'].includes(severity)} onChange={(ev) => setOffWork(ev.target.checked)} /> Off work from the incident date (lost days count until return)
              </span>
            </label>
          </>
        )}
        <label className="req-field wide">
          <span>What happened</span>
          <textarea className="form-control" rows={3} value={description} onChange={(ev) => setDescription(ev.target.value)} placeholder="Sequence of events, equipment involved, conditions." />
        </label>
        <label className="req-field wide">
          <span>Immediate actions taken</span>
          <textarea className="form-control" rows={2} value={immediate} onChange={(ev) => setImmediate(ev.target.value)} placeholder="First aid, isolation, area made safe, hospital referral." />
        </label>
        <div className="req-field wide">
          <span>Witnesses</span>
          <div className="osh-tags">
            {witnesses.map((w) => (
              <button key={w} className="osh-tag" onClick={() => setWitnesses(witnesses.filter((x) => x !== w))} aria-label={`Remove ${org.name(w)}`}>
                {org.name(w)} ×
              </button>
            ))}
            <select className="form-control" value="" onChange={(ev) => ev.target.value && setWitnesses([...witnesses, ev.target.value])} aria-label="Add witness">
              <option value="">Add a witness…</option>
              {org.staff
                .filter((e) => e.staffId !== staffId && !witnesses.includes(e.staffId))
                .map((e) => (
                  <option key={e.staffId} value={e.staffId}>
                    {e.fullName}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>
      <div className={`pr-note ${isReportable(preview) ? 'warn' : ''}`}>
        {isReportable(preview)
          ? `Notifiable: DOSH Form 1 (DOSH/F1) to the ${DOSH_AREA_OFFICE} by ${fmt(doshDue(preview))}${preview.severity === 'FATAL' ? ' — within 24 hours' : ''}.`
          : 'Not notifiable to DOSHS. Kept for investigation and trend analysis.'}
      </div>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */

const IncidentModal: React.FC<{ i: OshIncident; onClose: () => void; onForm: () => void }> = ({ i, onClose, onForm }) => {
  const app = useApp();
  const { wibaClaims, startInvestigation, saveInvestigation, addIncidentAction, fileDoshNotice, recordReturnToWork, closeIncident, authoriseInjuryAbsence, injuryAbsenceDays, setModuleTab } = app;
  const org = useOshOrg();
  const e = i.staffId ? org.byId.get(i.staffId) : undefined;
  const d = doshState(i, org.today);
  const [whys, setWhys] = useState<string[]>(i.investigation?.whys.length ? [...i.investigation.whys, ''] : ['', '', '']);
  const [root, setRoot] = useState(i.investigation?.rootCause ?? '');
  const [ref, setRef] = useState('');
  const [filedOn, setFiledOn] = useState(org.today);
  const [returnOn, setReturnOn] = useState(org.today);
  const [claim, setClaim] = useState(false);
  const existing = wibaClaims.find((c) => c.incidentId === i.id);
  const absence = injuryAbsenceDays(i.id);
  const injury = i.kind === 'INJURY' || i.kind === 'OCCUPATIONAL_DISEASE';
  const lost = lostDaysOf(i, org.today);

  return (
    <Modal
      title={`${i.id} · ${KIND_LABEL[i.kind]}`}
      subtitle={`${fmt(i.occurredOn)} ${i.time} · ${SITES[i.site].label} · ${i.location}`}
      onClose={onClose}
      width={980}
      footer={
        <>
          {isReportable(i) && (
            <button className="btn btn-secondary" onClick={onForm}>
              <FileText size={14} /> DOSH Form 1
            </button>
          )}
          {i.status !== 'CLOSED' && (
            <button className="btn btn-primary" onClick={() => closeIncident(i.id) && onClose()}>
              <ClipboardCheck size={14} /> Close incident
            </button>
          )}
        </>
      }
    >
      <div className="pr-kv">
        <div>
          <span>Status</span>
          <strong>{STATUS_LABEL[i.status]}</strong>
        </div>
        <div>
          <span>Severity</span>
          <strong>{SEVERITY_LABEL[i.severity]}</strong>
        </div>
        <div>
          <span>Person</span>
          <strong>{e?.fullName ?? '—'}</strong>
          <small>{e ? `${e.staffId} · ${e.jobTitle}` : 'No one hurt'}</small>
        </div>
        {injury && (
          <div>
            <span>Lost days</span>
            <strong>{lost}</strong>
            <small>{i.offWorkFrom ? (i.returnedOn ? `Back ${fmt(i.returnedOn)}` : `Off work since ${fmt(i.offWorkFrom)}`) : 'Not off work'}</small>
          </div>
        )}
        <div>
          <span>DOSH Form 1</span>
          <div className="osh-kv-pill">
            <Pill cls={d.cls}>{d.label}</Pill>
          </div>
          <small>{i.dosh ? `${i.dosh.ref} · ${fmt(i.dosh.notifiedOn)}` : d.due ? `Deadline ${fmt(d.due)}` : 'Internal record only'}</small>
        </div>
      </div>

      <section className="osh-sec">
        <h4>What happened</h4>
        <p>{i.description}</p>
        {i.bodyPart && (
          <p className="pr-muted">
            Injury: {i.injuryNature} to the {i.bodyPart.toLowerCase()}.
          </p>
        )}
        <p className="pr-muted">Immediate actions: {i.immediateActions || '—'}</p>
        <p className="pr-muted">
          Witnesses: {i.witnesses.length ? i.witnesses.map(org.name).join(', ') : 'none'} · reported by {org.name(i.reportedBy)} on {fmt(i.reportedOn)}
        </p>
      </section>

      {isReportable(i) && !i.dosh && (
        <section className={`osh-sec ${d.overdue ? 'osh-alert' : ''}`}>
          <h4>Notify DOSHS</h4>
          <p className="pr-muted">
            Print Form 1, have it signed and lodge it with the {DOSH_AREA_OFFICE}. Record the acknowledgement here. Deadline {fmt(d.due)}.
          </p>
          <div className="osh-inline-form">
            <input className="form-control grow" placeholder="DOSHS acknowledgement ref, e.g. DOSH/KER/2026/0301" value={ref} onChange={(ev) => setRef(ev.target.value)} aria-label="DOSHS reference" />
            <input className="form-control" type="date" max={org.today} value={filedOn} onChange={(ev) => setFiledOn(ev.target.value)} aria-label="Filed on" />
            <button className="btn btn-secondary" onClick={onForm}>
              <Printer size={14} /> Form 1
            </button>
            <button className="btn btn-primary" disabled={!ref.trim()} onClick={() => fileDoshNotice(i.id, ref, filedOn)}>
              Record filing
            </button>
          </div>
        </section>
      )}

      {injury && i.offWorkFrom && (
        <section className="osh-sec">
          <h4>Off work on injury</h4>
          <p className="pr-muted">WIBA: the employee keeps full pay while off on an accepted injury. Absent days are recorded in attendance as authorised, so payroll makes no deduction.</p>
          <div className="osh-inline-form">
            {absence.length > 0 ? (
              <button className="btn btn-secondary" onClick={() => authoriseInjuryAbsence(i.id)}>
                Authorise {absence.length} absent day{absence.length > 1 ? 's' : ''} in attendance
              </button>
            ) : (
              <span className="pr-muted">{i.absenceDates?.length ? `${i.absenceDates.length} day(s) recorded as authorised injury absence.` : 'No unconfirmed absent days in attendance for this period.'}</span>
            )}
            {!i.returnedOn && (
              <>
                <input className="form-control" type="date" min={i.offWorkFrom} max={org.today} value={returnOn} onChange={(ev) => setReturnOn(ev.target.value)} aria-label="Return date" />
                <button className="btn btn-primary" onClick={() => recordReturnToWork(i.id, returnOn)}>
                  Record return to work
                </button>
              </>
            )}
          </div>
        </section>
      )}

      <section className="osh-sec">
        <h4>Investigation (5 whys)</h4>
        {!i.investigation && i.kind === 'INJURY' && i.severity === 'FIRST_AID' && <p className="pr-muted">First-aid cases need no formal investigation. Start one if there is a pattern.</p>}
        {!i.investigation ? (
          <button className="btn btn-secondary" onClick={() => startInvestigation(i.id, SAFETY_OFFICER)}>
            Start investigation ({SAFETY_OFFICER})
          </button>
        ) : (
          <>
            <p className="pr-muted">
              Led by {i.investigation.lead} from {fmt(i.investigation.startedOn)}
              {i.investigation.completedOn ? ` · completed ${fmt(i.investigation.completedOn)}` : ''}
            </p>
            <ol className="osh-whys">
              {whys.map((w, k) => (
                <li key={k}>
                  <input
                    className="form-control"
                    value={w}
                    placeholder={k === 0 ? 'Why did it happen?' : 'Why was that?'}
                    aria-label={`Why ${k + 1}`}
                    onChange={(ev) => {
                      const next = [...whys];
                      next[k] = ev.target.value;
                      if (k === whys.length - 1 && ev.target.value && whys.length < 5) next.push('');
                      setWhys(next);
                    }}
                  />
                </li>
              ))}
            </ol>
            <label className="req-field">
              <span>Root cause</span>
              <textarea className="form-control" rows={2} value={root} onChange={(ev) => setRoot(ev.target.value)} />
            </label>
            <div className="osh-inline-form" style={{ marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => saveInvestigation(i.id, whys, root, false)}>
                Save draft
              </button>
              <button className="btn btn-primary" onClick={() => saveInvestigation(i.id, whys, root, true)}>
                Complete investigation
              </button>
            </div>
          </>
        )}
      </section>

      <section className="osh-sec">
        <h4>Corrective actions</h4>
        <ActionTable actions={i.actions} refOf={(a) => ({ source: 'incident', id: i.id, actionId: a.id })} today={org.today} />
        {i.status !== 'CLOSED' && <NewActionRow staff={org.staff} today={org.today} onAdd={(a) => addIncidentAction(i.id, a)} />}
      </section>

      {injury && e && (
        <section className="osh-sec">
          <h4>WIBA compensation</h4>
          {existing ? (
            <div className="osh-inline-form">
              <span>
                {existing.id} with {existing.insurer}: <Pill cls={existing.status === 'PAID' ? 'success' : 'info'}>{existing.status.toLowerCase()}</Pill>
              </span>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setModuleTab('osh-claim', existing.id);
                  setModuleTab('osh-security', 'wiba');
                  onClose();
                }}
              >
                <Stethoscope size={14} /> Open claim
              </button>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => setClaim(true)}>
              <Stethoscope size={14} /> Raise WIBA claim
            </button>
          )}
        </section>
      )}

      {i.history.length > 0 && (
        <section className="osh-sec">
          <h4>History</h4>
          <ul className="osh-history">
            {i.history.map((h, k) => (
              <li key={k}>
                <span>{fmt(h.at)}</span> {h.text} — {org.name(h.by)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {claim && <RaiseClaimModal incident={i} onClose={() => setClaim(false)} />}
    </Modal>
  );
};

/* ------------------------------------------------------------------ */

const Row: React.FC<{ n: string; label: string; children: React.ReactNode }> = ({ n, label, children }) => (
  <tr>
    <td className="osh-f1-n">{n}</td>
    <td className="osh-f1-l">{label}</td>
    <td>{children}</td>
  </tr>
);

/** DOSH Form 1: notice of an accident, dangerous occurrence or occupational disease. */
export const DoshFormModal: React.FC<{ i: OshIncident; onClose: () => void }> = ({ i, onClose }) => {
  const { activeTenant } = useApp();
  const org = useOshOrg();
  const e = i.staffId ? org.byId.get(i.staffId) : undefined;
  const age = e?.dateOfBirth ? Math.floor((Date.parse(i.occurredOn) - Date.parse(e.dateOfBirth)) / (365.25 * 864e5)) : undefined;
  return (
    <Modal
      title="DOSH Form 1 (DOSH/F1)"
      subtitle={`Due ${fmt(doshDue(i))}${i.dosh ? ` · filed ${fmt(i.dosh.notifiedOn)} (${i.dosh.ref})` : ''}`}
      onClose={onClose}
      width={860}
      footer={
        <button className="btn btn-primary" onClick={printArea}>
          <Printer size={14} /> Print form
        </button>
      }
    >
      <div className="pr-paper ess-print-area osh-f1">
        <div className="osh-f1-head">
          <div>REPUBLIC OF KENYA</div>
          <strong>THE OCCUPATIONAL SAFETY AND HEALTH ACT, 2007</strong>
          <div>Directorate of Occupational Safety and Health Services</div>
          <h2>NOTICE OF OCCURRENCE OF ACCIDENT, DANGEROUS OCCURRENCE OR OCCUPATIONAL DISEASE</h2>
          <div className="pr-muted">Form DOSH/F1 · Section 21 · To: {DOSH_AREA_OFFICE}</div>
        </div>
        <table className="osh-f1-table">
          <tbody>
            <tr className="osh-f1-part">
              <td colSpan={3}>Part A — Employer and workplace</td>
            </tr>
            <Row n="1" label="Name of occupier / employer">
              {activeTenant.name}
            </Row>
            <Row n="2" label="Address and location of workplace">
              {activeTenant.location}
            </Row>
            <Row n="3" label="Workplace registration no.">
              {WORKPLACE_REG_NO}
            </Row>
            <Row n="4" label="Nature of business">
              Tea growing and processing
            </Row>
            <tr className="osh-f1-part">
              <td colSpan={3}>Part B — Injured person</td>
            </tr>
            <Row n="5" label="Full name">
              {e?.fullName ?? 'Not applicable (no person injured)'}
            </Row>
            <Row n="6" label="ID no. · Sex · Age">
              {e ? `${e.nationalIdMasked} · ${e.gender ?? '—'} · ${age ?? '—'}` : '—'}
            </Row>
            <Row n="7" label="Occupation · Staff no.">
              {e ? `${e.jobTitle} · ${e.staffId}` : '—'}
            </Row>
            <tr className="osh-f1-part">
              <td colSpan={3}>Part C — The occurrence</td>
            </tr>
            <Row n="8" label="Type">
              {KIND_LABEL[i.kind]}
            </Row>
            <Row n="9" label="Date and time">
              {fmt(i.occurredOn)} at {i.time}
            </Row>
            <Row n="10" label="Exact place">
              {SITES[i.site].label} — {i.location}
            </Row>
            <Row n="11" label="How it happened">
              {i.description}
            </Row>
            <Row n="12" label="Nature of injury and part of body">
              {i.injuryNature ? `${i.injuryNature} — ${i.bodyPart}` : '—'}
            </Row>
            <Row n="13" label="Fatal?">
              {i.severity === 'FATAL' ? 'Yes' : 'No'}
            </Row>
            <Row n="14" label="Off work · days lost to date">
              {i.offWorkFrom ? `From ${fmt(i.offWorkFrom)} · ${lostDaysOf(i, org.today)} day(s)` : 'Not off work'}
            </Row>
            <Row n="15" label="First aid / treatment given">
              {i.immediateActions || '—'}
            </Row>
            <Row n="16" label="Witnesses">
              {i.witnesses.length ? i.witnesses.map((w) => `${org.name(w)} (${w})`).join('; ') : '—'}
            </Row>
          </tbody>
        </table>
        <div className="osh-f1-sign">
          <div>
            Signed: ____________________
            <br />
            {SAFETY_OFFICER}, {SAFETY_OFFICER_TITLE}, for the occupier
          </div>
          <div>
            Date: ____________________
            <br />
            Official stamp
          </div>
        </div>
        <p className="pr-paper-foot">Ref {i.id}. Notice is due within 7 days of the occurrence, or 24 hours where a person dies (OSHA 2007 s.21). Keep a copy in the general register.</p>
      </div>
    </Modal>
  );
};
