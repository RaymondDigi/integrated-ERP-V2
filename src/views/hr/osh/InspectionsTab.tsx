import React, { useMemo, useState } from 'react';
import { CalendarPlus, ClipboardCheck, Flame, HeartPulse, Plus, RefreshCw } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Modal } from '../payroll/shared';
import { addDays } from '../../../data/timeEngine';
import { FIRST_AID_RATIO, INSPECTION_AREAS, JHA, SAFETY_OFFICER, SITE_IDS, SITES, type SiteId } from '../../../data/oshConfig';
import { addMonths, inspectionDue, responderCoverage, siteOf, type Inspection, type Responder } from '../../../data/oshEngine';
import { ActionTable, dueLabel, Empty, fmt, Pill, StaffSelect, useOshOrg } from './shared';

export const InspectionsTab: React.FC = () => {
  const { oshInspections, selectedOrgId, fireDrills, jhaReviews, reviewJha, setCurrentView } = useApp();
  const org = useOshOrg();
  const [record, setRecord] = useState<{ areaId: string; inspection?: Inspection } | null>(null);
  const [schedule, setSchedule] = useState<string | null>(null);
  const [drill, setDrill] = useState(false);
  const [responder, setResponder] = useState(false);
  const list = useMemo(() => oshInspections.filter((x) => x.orgId === selectedOrgId), [oshInspections, selectedOrgId]);
  const findings = list.flatMap((x) => x.findings.map((f) => ({ ...f.action, id: `${x.id}|${f.action.id}`, text: `${INSPECTION_AREAS.find((a) => a.id === x.areaId)?.name}: ${f.text}` })));
  const openFindings = findings.filter((a) => a.status !== 'VERIFIED');
  const coverage = responderCoverage(org.staff, org.responders, org.today);
  const drills = fireDrills.filter((d) => d.orgId === selectedOrgId);

  return (
    <>
      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Workplace inspections</h3>
            <p>Checklists per area. Failed items become findings with an owner and due date.</p>
          </div>
          <button className="btn btn-secondary" onClick={() => setCurrentView('quality')}>
            Company audits in Quality & Risk
          </button>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Area</th>
                <th>Frequency</th>
                <th>Last inspection</th>
                <th>Next</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {INSPECTION_AREAS.map((a) => {
                const s = inspectionDue(a.id, list, org.today);
                const d = dueLabel(org.today, s.nextDue, 3);
                return (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.name}</strong>
                      <div className="muted">{a.items.length} checks</div>
                    </td>
                    <td>Every {a.everyDays === 7 ? 'week' : a.everyDays === 14 ? '2 weeks' : 'month'}</td>
                    <td>
                      {s.done ? fmt(s.done.doneOn) : 'Never'}
                      {s.done && <div className="muted">{s.done.findings.length ? `${s.done.findings.length} finding(s)` : 'No findings'} · {s.done.inspector}</div>}
                    </td>
                    <td>
                      <Pill cls={d.cls}>{s.scheduled ? (d.cls === 'success' ? `Booked ${fmt(s.nextDue)}` : d.text) : d.text}</Pill>
                      {s.scheduled && <div className="muted">{s.scheduled.inspector}</div>}
                    </td>
                    <td className="osh-row-actions">
                      <button className="btn btn-primary btn-sm" onClick={() => setRecord({ areaId: a.id, inspection: s.scheduled })}>
                        <ClipboardCheck size={13} /> Inspect
                      </button>
                      {!s.scheduled && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setSchedule(a.id)}>
                          <CalendarPlus size={13} /> Book
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h4 className="osh-h4">Open findings ({openFindings.length})</h4>
        <ActionTable
          actions={openFindings}
          refOf={(a) => {
            const [id, actionId] = a.id.split('|');
            return { source: 'inspection', id, actionId };
          }}
          today={org.today}
          empty="No open findings."
        />
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>First aiders and fire marshals</h3>
            <p>
              Coverage per area: one trained first aider per {FIRST_AID_RATIO.high} workers in high-risk areas and per {FIRST_AID_RATIO.normal} elsewhere (First Aid Rules), and a fire marshal in every occupied area.
              {org.respondersSource === 'training' ? ' Certificates come from the Training module.' : ''}
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => setResponder(true)}>
            <Plus size={14} /> Add certificate
          </button>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Area</th>
                <th className="num">Workers</th>
                <th className="num">First aiders</th>
                <th className="num">Fire marshals</th>
                <th>Coverage</th>
              </tr>
            </thead>
            <tbody>
              {coverage
                .filter((c) => c.workers)
                .map((c) => (
                  <tr key={c.site}>
                    <td>
                      {SITES[c.site].label}
                      <div className="muted">{SITES[c.site].highRisk ? 'High risk' : 'Normal risk'} · 1 per {c.ratio}</div>
                    </td>
                    <td className="num">{c.workers}</td>
                    <td className={`num ${c.fa < c.needFa ? 'tm-late' : ''}`}>
                      {c.fa} / {c.needFa}
                    </td>
                    <td className={`num ${c.fm < c.needFm ? 'tm-late' : ''}`}>
                      {c.fm} / {c.needFm}
                    </td>
                    <td>
                      <Pill cls={c.ok ? 'success' : 'critical'}>{c.ok ? 'Covered' : 'Short'}</Pill>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <h4 className="osh-h4">Certificates</h4>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Area</th>
                <th>Valid to</th>
              </tr>
            </thead>
            <tbody>
              {org.responders.length === 0 && <Empty cols={4}>No first aiders or fire marshals recorded.</Empty>}
              {[...org.responders]
                .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn))
                .map((r) => {
                  const e = org.byId.get(r.staffId);
                  const d = dueLabel(org.today, r.expiresOn, 60);
                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>{e?.fullName ?? r.staffId}</strong>
                        <div className="muted">{r.provider}</div>
                      </td>
                      <td>{r.role === 'FIRST_AIDER' ? 'First aider' : 'Fire marshal'}</td>
                      <td>{e ? SITES[siteOf(e)].label : '—'}</td>
                      <td>
                        <Pill cls={d.cls}>{d.cls === 'success' ? fmt(r.expiresOn) : d.text}</Pill>
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
            <h3>Fire drills</h3>
            <p>At least once every 12 months per occupied area (Fire Risk Reduction Rules 2007).</p>
          </div>
          <button className="btn btn-secondary" onClick={() => setDrill(true)}>
            <Flame size={14} /> Record drill
          </button>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Area</th>
                <th>Last drill</th>
                <th>Next due</th>
              </tr>
            </thead>
            <tbody>
              {SITE_IDS.filter((s) => coverage.find((c) => c.site === s)?.workers).map((s) => {
                const last = drills.filter((d) => d.siteId === s).sort((a, b) => b.date.localeCompare(a.date))[0];
                const due = last ? addMonths(last.date, 12) : org.today;
                const d = dueLabel(org.today, due, 45);
                return (
                  <tr key={s}>
                    <td>{SITES[s].label}</td>
                    <td>
                      {last ? fmt(last.date) : 'None on record'}
                      {last && (
                        <div className="muted">
                          {last.evacuationMin} min · {last.participants} people · {last.notes}
                        </div>
                      )}
                    </td>
                    <td>
                      <Pill cls={d.cls}>{last ? d.text : 'Due now'}</Pill>
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
            <h3>Job hazard analyses</h3>
            <p>Hazards and controls per role. Reviewed every 12 months or after an incident.</p>
          </div>
        </div>
        <div className="osh-jha-grid">
          {JHA.map((j) => {
            const r = jhaReviews.find((x) => x.role === j.role);
            const next = r ? addMonths(r.reviewedOn, 12) : org.today;
            const d = dueLabel(org.today, next, 30);
            return (
              <div key={j.role} className="osh-jha">
                <div className="osh-jha-head">
                  <div>
                    <strong>{j.role}</strong>
                    <span className="pr-muted">
                      {SITES[j.site].label} · reviewed {r ? fmt(r.reviewedOn) : 'never'}
                    </span>
                  </div>
                  <Pill cls={d.cls}>{d.cls === 'success' ? 'Current' : d.text}</Pill>
                </div>
                <ul>
                  {j.steps.map((s) => (
                    <li key={s.task}>
                      <strong>{s.task}</strong> — {s.hazard}
                      <div className="pr-muted">Control: {s.control}</div>
                    </li>
                  ))}
                </ul>
                <button className="btn btn-secondary btn-sm" onClick={() => reviewJha(j.role)}>
                  <RefreshCw size={13} /> Mark reviewed
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {record && <InspectModal areaId={record.areaId} inspection={record.inspection} onClose={() => setRecord(null)} />}
      {schedule && <ScheduleModal areaId={schedule} onClose={() => setSchedule(null)} />}
      {drill && <DrillModal onClose={() => setDrill(false)} />}
      {responder && <ResponderModal onClose={() => setResponder(false)} />}
    </>
  );
};


/* ------------------------------------------------------------------ */

const InspectModal: React.FC<{ areaId: string; inspection?: Inspection; onClose: () => void }> = ({ areaId, inspection, onClose }) => {
  const { completeInspection } = useApp();
  const org = useOshOrg();
  const area = INSPECTION_AREAS.find((a) => a.id === areaId)!;
  const [results, setResults] = useState<Inspection['results']>(() => Object.fromEntries(area.items.map((_, k) => [k, 'OK' as const])));
  const [detail, setDetail] = useState<Record<number, { text: string; owner: string; due: string }>>({});
  const fails = area.items.map((_, k) => k).filter((k) => results[k] === 'FAIL');
  const ready = fails.every((k) => detail[k]?.owner && detail[k]?.due);
  const submit = () => {
    completeInspection(areaId, inspection?.id, results, fails.map((k) => ({ text: detail[k]?.text?.trim() || area.items[k], owner: detail[k].owner, due: detail[k].due })));
    onClose();
  };
  return (
    <Modal
      title={`Inspection · ${area.name}`}
      subtitle={inspection ? `Booked for ${fmt(inspection.scheduledFor)} · ${inspection.inspector}` : `Unplanned inspection today by ${SAFETY_OFFICER}`}
      onClose={onClose}
      width={820}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!ready} onClick={submit}>
            <ClipboardCheck size={14} /> Record inspection
          </button>
        </>
      }
    >
      <ul className="osh-checklist">
        {area.items.map((item, k) => (
          <li key={item}>
            <span>{item}</span>
            <div className="osh-seg" role="group" aria-label={item}>
              {(['OK', 'FAIL', 'NA'] as const).map((r) => (
                <button key={r} className={results[k] === r ? `active ${r.toLowerCase()}` : ''} aria-pressed={results[k] === r} onClick={() => setResults({ ...results, [k]: r })}>
                  {r === 'NA' ? 'N/A' : r === 'OK' ? 'OK' : 'Fail'}
                </button>
              ))}
            </div>
            {results[k] === 'FAIL' && (
              <div className="osh-inline-form osh-finding">
                <input className="form-control grow" placeholder={`Finding: ${item}`} value={detail[k]?.text ?? ''} onChange={(ev) => setDetail({ ...detail, [k]: { ...detail[k], text: ev.target.value } })} aria-label="Finding" />
                <select className="form-control" value={detail[k]?.owner ?? ''} onChange={(ev) => setDetail({ ...detail, [k]: { ...detail[k], owner: ev.target.value } })} aria-label="Owner">
                  <option value="">Owner…</option>
                  {org.staff.map((e) => (
                    <option key={e.staffId} value={e.fullName}>
                      {e.fullName}
                    </option>
                  ))}
                </select>
                <input className="form-control" type="date" min={org.today} value={detail[k]?.due ?? ''} onChange={(ev) => setDetail({ ...detail, [k]: { ...detail[k], due: ev.target.value } })} aria-label="Due" />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
};

const ScheduleModal: React.FC<{ areaId: string; onClose: () => void }> = ({ areaId, onClose }) => {
  const { scheduleInspection } = useApp();
  const org = useOshOrg();
  const area = INSPECTION_AREAS.find((a) => a.id === areaId)!;
  const [date, setDate] = useState(addDays(org.today, 1));
  const [inspector, setInspector] = useState(SAFETY_OFFICER);
  return (
    <Modal
      title={`Book inspection · ${area.name}`}
      onClose={onClose}
      width={520}
      footer={
        <button
          className="btn btn-primary"
          onClick={() => {
            scheduleInspection(areaId, date, inspector);
            onClose();
          }}
        >
          Book
        </button>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Date</span>
          <input className="form-control" type="date" min={org.today} value={date} onChange={(ev) => setDate(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Inspector</span>
          <select className="form-control" value={inspector} onChange={(ev) => setInspector(ev.target.value)}>
            {org.staff.map((e) => (
              <option key={e.staffId}>{e.fullName}</option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
};

const DrillModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { recordDrill } = useApp();
  const org = useOshOrg();
  const [siteId, setSite] = useState<SiteId>('FACTORY');
  const [date, setDate] = useState(org.today);
  const [min, setMin] = useState(4);
  const [people, setPeople] = useState(10);
  const [notes, setNotes] = useState('');
  return (
    <Modal
      title="Record a fire drill"
      onClose={onClose}
      width={600}
      footer={
        <button
          className="btn btn-primary"
          onClick={() => {
            recordDrill({ siteId, date, evacuationMin: min, participants: people, notes: notes.trim() || 'No issues noted.' });
            onClose();
          }}
        >
          <Flame size={14} /> Save drill
        </button>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Area</span>
          <select className="form-control" value={siteId} onChange={(ev) => setSite(ev.target.value as SiteId)}>
            {SITE_IDS.map((s) => (
              <option key={s} value={s}>
                {SITES[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="req-field">
          <span>Date</span>
          <input className="form-control" type="date" max={org.today} value={date} onChange={(ev) => setDate(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Evacuation time (minutes)</span>
          <input className="form-control" type="number" min={0} step={0.5} value={min} onChange={(ev) => setMin(Number(ev.target.value))} />
        </label>
        <label className="req-field">
          <span>People evacuated</span>
          <input className="form-control" type="number" min={1} value={people} onChange={(ev) => setPeople(Number(ev.target.value))} />
        </label>
        <label className="req-field wide">
          <span>Observations</span>
          <textarea className="form-control" rows={2} value={notes} onChange={(ev) => setNotes(ev.target.value)} />
        </label>
      </div>
    </Modal>
  );
};

const ResponderModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addResponder } = useApp();
  const org = useOshOrg();
  const [staffId, setStaffId] = useState(org.staff[0]?.staffId ?? '');
  const [role, setRole] = useState<Responder['role']>('FIRST_AIDER');
  const [certifiedOn, setOn] = useState(org.today);
  const [provider, setProvider] = useState('St John Ambulance Kenya');
  return (
    <Modal
      title="Add a first aid or fire marshal certificate"
      onClose={onClose}
      width={600}
      footer={
        <button
          className="btn btn-primary"
          onClick={() => {
            addResponder({ staffId, role, certifiedOn, expiresOn: addMonths(certifiedOn, role === 'FIRST_AIDER' ? 24 : 12), provider });
            onClose();
          }}
        >
          <HeartPulse size={14} /> Save
        </button>
      }
    >
      <div className="pr-form-grid">
        <label className="req-field">
          <span>Employee</span>
          <StaffSelect value={staffId} onChange={setStaffId} staff={org.staff} />
        </label>
        <label className="req-field">
          <span>Role</span>
          <select className="form-control" value={role} onChange={(ev) => setRole(ev.target.value as Responder['role'])}>
            <option value="FIRST_AIDER">First aider (valid 24 months)</option>
            <option value="FIRE_MARSHAL">Fire marshal (valid 12 months)</option>
          </select>
        </label>
        <label className="req-field">
          <span>Certified on</span>
          <input className="form-control" type="date" max={org.today} value={certifiedOn} onChange={(ev) => setOn(ev.target.value)} />
        </label>
        <label className="req-field">
          <span>Provider</span>
          <input className="form-control" value={provider} onChange={(ev) => setProvider(ev.target.value)} />
        </label>
      </div>
    </Modal>
  );
};
