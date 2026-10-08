import React, { useMemo, useState } from 'react';
import { Gavel, Plus, Search } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import type { CaseCategory } from '../../../data/discipline';
import { OUTCOMES, SEC_INCIDENT_TYPES, nowStamp, recoveredValue, type ClaimStatus, type InvestigationOutcome, type SecIncident, type SecIncidentType } from '../../../data/securitySeed';
import { Card, Empty, Field, Modal, PersonSelect, Pill, fmt, fmtStamp, kes, useSecOrg, type Tone } from './shared';

const STATUS_TONE: Record<SecIncident['status'], Tone> = { Open: 'warning', 'Under investigation': 'info', Closed: 'success' };
const FILTERS = ['Open & investigating', 'Closed', 'With insurance claim', 'Employee suspect', 'All'] as const;
type Filter = (typeof FILTERS)[number];
const CLAIM_STATUSES: ClaimStatus[] = ['Lodged', 'Under assessment', 'Paid', 'Declined'];

/** Disciplinary category used when an employee suspect is referred. */
const CASE_CATEGORY: Record<SecIncidentType, CaseCategory> = {
  Theft: 'GROSS_MISCONDUCT',
  'Breach of seal': 'GROSS_MISCONDUCT',
  Assault: 'GROSS_MISCONDUCT',
  Trespass: 'MISCONDUCT',
  Fire: 'SAFETY_BREACH',
  'Suspicious activity': 'MISCONDUCT'
};

/** Security incidents, investigations, police referrals, insurance claims and recoveries. */
export const SecIncidentsCard: React.FC = () => {
  const { secIncidents } = useApp();
  const { orgId, name } = useSecOrg();
  const [filter, setFilter] = useState<Filter>('Open & investigating');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const mine = useMemo(() => secIncidents.filter((i) => i.orgId === orgId), [secIncidents, orgId]);
  const q = search.trim().toLowerCase();
  const rows = mine
    .filter((i) => {
      const f =
        filter === 'All' ||
        (filter === 'Open & investigating' && i.status !== 'Closed') ||
        (filter === 'Closed' && i.status === 'Closed') ||
        (filter === 'With insurance claim' && !!i.claim) ||
        (filter === 'Employee suspect' && i.suspect?.kind === 'Employee');
      return f && (!q || `${i.id} ${i.type} ${i.site} ${i.description} ${i.reportedBy} ${i.suspect?.name ?? ''}`.toLowerCase().includes(q));
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const pg = usePaged(rows, 10, `${filter}|${q}|${orgId}`);
  const open = mine.find((i) => i.id === openId);

  return (
    <Card
      title="Security incidents & investigations"
      sub="Theft, trespass, seal breaches, assault, fire and suspicious activity. Each is investigated to an outcome; losses can be claimed from the insurer and recoveries tracked."
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={14} /> Report incident
        </button>
      }
    >
      <div className="digicraft-toolbar" style={{ marginBottom: 12 }}>
        <div className="digicraft-search-box">
          <Search size={16} className="digicraft-search-icon" />
          <input type="text" placeholder="Search incident, site, description..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="digicraft-filter-pills">
          {FILTERS.map((k) => (
            <button key={k} className={`digicraft-filter-pill ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className="hi-scroll">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Incident</th>
              <th>Site / when</th>
              <th>What happened</th>
              <th>Suspect</th>
              <th>Loss / recovered</th>
              <th>Investigation</th>
              <th>Insurance</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pg.rows.length === 0 && <Empty cols={9}>No incidents match.</Empty>}
            {pg.rows.map((i) => (
              <tr key={i.id}>
                <td>
                  <div className="hi-mono">{i.id}</div>
                  <div className="hi-sub">{i.type}</div>
                </td>
                <td className="hi-wrap" style={{ maxWidth: 200 }}>
                  {i.site}
                  <div className="hi-sub">{fmtStamp(i.occurredAt)}</div>
                </td>
                <td className="hi-wrap" style={{ maxWidth: 280 }}>
                  {i.description}
                  <div className="hi-sub">Reported by {i.reportedBy.match(/^[A-Z]{2,3}-\d{4}$/) ? name(i.reportedBy) : i.reportedBy}</div>
                </td>
                <td className="hi-wrap">
                  {i.suspect ? (i.suspect.kind === 'Employee' ? name(i.suspect.staffId) : i.suspect.kind) : '—'}
                  {i.suspect?.kind === 'Employee' && <div className="hi-sub">Employee {i.suspect.staffId}</div>}
                  {i.suspect?.name && i.suspect.kind !== 'Employee' && <div className="hi-sub">{i.suspect.name}</div>}
                  {i.caseId && <div className="hi-sub">Disciplinary {i.caseId}</div>}
                </td>
                <td>
                  {i.lossValue ? kes(i.lossValue) : '—'}
                  {recoveredValue(i) > 0 && <div className="hi-sub">{kes(recoveredValue(i))} recovered</div>}
                </td>
                <td className="hi-wrap">
                  {i.investigation ? (
                    <>
                      {name(i.investigation.investigatorId)}
                      <div className="hi-sub">
                        {i.investigation.outcome ?? `${i.investigation.statements.length} statements · ${i.investigation.evidence.length} evidence`}
                        {i.investigation.obNumber && ` · ${i.investigation.obNumber}`}
                      </div>
                    </>
                  ) : (
                    <span className="hi-sub">Not started</span>
                  )}
                </td>
                <td>
                  {i.claim ? (
                    <>
                      <Pill tone={i.claim.status === 'Paid' ? 'success' : i.claim.status === 'Declined' ? 'danger' : 'info'}>{i.claim.status}</Pill>
                      <div className="hi-sub">{i.claim.ref}</div>
                    </>
                  ) : (
                    <span className="hi-sub">—</span>
                  )}
                </td>
                <td>
                  <Pill tone={STATUS_TONE[i.status]}>{i.status}</Pill>
                </td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => setOpenId(i.id)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="incidents" sizes={[10, 25, 50]} />

      {adding && <ReportModal onClose={() => setAdding(false)} />}
      {open && <InvestigationModal incident={open} onClose={() => setOpenId(null)} />}
    </Card>
  );
};

const ReportModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { reportSecIncident } = useApp();
  const { staff, site: defaultSite } = useSecOrg();
  const [type, setType] = useState<SecIncidentType>('Theft');
  const [site, setSite] = useState(defaultSite);
  const [occurredAt, setOccurredAt] = useState(nowStamp());
  const [reportedBy, setReportedBy] = useState('');
  const [description, setDescription] = useState('');
  const [loss, setLoss] = useState('0');
  const [kind, setKind] = useState<'Unknown' | 'Employee' | 'Outsider'>('Unknown');
  const [staffId, setStaffId] = useState('');
  const [suspectName, setSuspectName] = useState('');
  const ok = site.trim() && occurredAt && reportedBy.trim() && description.trim() && (kind !== 'Employee' || staffId);
  return (
    <Modal
      title="Report security incident"
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              reportSecIncident({
                type,
                site: site.trim(),
                occurredAt,
                reportedBy: reportedBy.trim(),
                description: description.trim(),
                lossValue: Number(loss) || 0,
                suspect: { kind, staffId: kind === 'Employee' ? staffId : undefined, name: suspectName.trim() || undefined }
              });
              onClose();
            }}
          >
            Log incident
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Type">
          <select className="form-control" value={type} onChange={(e) => setType(e.target.value as SecIncidentType)}>
            {SEC_INCIDENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="When">
          <input className="form-control" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </Field>
        <Field label="Site / location">
          <input className="form-control" value={site} onChange={(e) => setSite(e.target.value)} />
        </Field>
        <Field label="Reported by">
          <input className="form-control" value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} placeholder="Name (and guard company)" />
        </Field>
        <Field label="Estimated loss (KES)">
          <input className="form-control" type="number" min={0} value={loss} onChange={(e) => setLoss(e.target.value)} />
        </Field>
        <Field label="Suspect">
          <select className="form-control" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option>Unknown</option>
            <option>Employee</option>
            <option>Outsider</option>
          </select>
        </Field>
        {kind === 'Employee' && (
          <Field label="Employee">
            <PersonSelect value={staffId} onChange={setStaffId} people={staff} />
          </Field>
        )}
        {kind !== 'Unknown' && (
          <Field label={kind === 'Employee' ? 'Note on suspect' : 'Suspect name / description'}>
            <input className="form-control" value={suspectName} onChange={(e) => setSuspectName(e.target.value)} />
          </Field>
        )}
        <Field label="What happened" wide>
          <textarea className="form-control" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};

const InvestigationModal: React.FC<{ incident: SecIncident; onClose: () => void }> = ({ incident: i, onClose }) => {
  const app = useApp();
  const { staff, name } = useSecOrg();
  const v = i.investigation;
  const [investigator, setInvestigator] = useState('');
  const [findings, setFindings] = useState(v?.findings ?? '');
  const [stBy, setStBy] = useState('');
  const [stText, setStText] = useState('');
  const [evItem, setEvItem] = useState('');
  const [evRef, setEvRef] = useState('');
  const [outcome, setOutcome] = useState<InvestigationOutcome>(v?.outcome ?? 'Recovered');
  const [ob, setOb] = useState(v?.obNumber ?? '');
  const [claim, setClaim] = useState(i.claim ?? { ref: '', insurer: '', claimed: i.lossValue, paid: 0, status: 'Lodged' as ClaimStatus, lodgedOn: app.securityToday });
  const [recValue, setRecValue] = useState('');
  const [recNote, setRecNote] = useState('');
  const closed = i.status === 'Closed';
  const employee = i.suspect?.kind === 'Employee' && i.suspect.staffId;

  const referToDisciplinary = () => {
    if (!employee) return;
    const c = app.raiseCase({
      staffId: employee,
      category: CASE_CATEGORY[i.type],
      summary: `Security incident ${i.id} (${i.type}) at ${i.site}: ${i.description}${v?.findings ? ` Findings: ${v.findings}` : ''}`,
      incidentDate: i.occurredAt.slice(0, 10)
    });
    app.linkDisciplinaryCase(i.id, c.id);
  };

  return (
    <Modal title={`${i.id} — ${i.type}`} subtitle={`${i.site} · ${fmtStamp(i.occurredAt)} · ${i.status}`} onClose={onClose} width={900}>
      <div className="pr-note">
        {i.description}
        <br />
        <span className="hi-sub">
          Loss {kes(i.lossValue)} · recovered {kes(recoveredValue(i))} · suspect {i.suspect?.kind === 'Employee' ? `${name(i.suspect.staffId)} (employee)` : i.suspect?.name ?? i.suspect?.kind ?? 'unknown'}
        </span>
      </div>

      {/* Disciplinary referral for an employee suspect */}
      {employee && (
        <div className="pr-toolbar" style={{ alignItems: 'center', gap: 8 }}>
          {i.caseId ? (
            <span>
              Referred to disciplinary as case <strong className="hi-mono">{i.caseId}</strong>.
            </span>
          ) : (
            <>
              <span className="hi-sub">The suspect is an employee. Referral opens a disciplinary case ({CASE_CATEGORY[i.type].replace('_', ' ').toLowerCase()}).</span>
              <button className="btn btn-secondary btn-sm" onClick={referToDisciplinary}>
                <Gavel size={13} /> Refer to Disciplinary
              </button>
            </>
          )}
        </div>
      )}

      <h4 style={{ margin: '8px 0 4px' }}>Investigation</h4>
      {!v ? (
        <div className="pr-form-grid">
          <Field label="Investigator">
            <PersonSelect value={investigator} onChange={setInvestigator} people={staff} />
          </Field>
          <div style={{ alignSelf: 'end' }}>
            <button className="btn btn-primary" disabled={!investigator} onClick={() => app.startInvestigation(i.id, investigator)}>
              Start investigation
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="hi-sub">
            Investigator {name(v.investigatorId)} · opened {fmt(v.openedOn)}
            {v.closedOn && ` · closed ${fmt(v.closedOn)} — ${v.outcome}${v.obNumber ? ` (${v.obNumber})` : ''}`}
          </div>
          <div className="pr-form-grid">
            <Field label="CCTV reviewed">
              <select className="form-control" disabled={closed} value={v.cctvReviewed ? 'yes' : 'no'} onChange={(e) => app.updateInvestigation(i.id, { cctvReviewed: e.target.value === 'yes' })}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </Field>
            <Field label="Findings" wide>
              <textarea className="form-control" rows={2} disabled={closed} value={findings} onChange={(e) => setFindings(e.target.value)} onBlur={() => findings !== v.findings && app.updateInvestigation(i.id, { findings: findings.trim() })} />
            </Field>
          </div>

          <table className="hr-table">
            <thead>
              <tr>
                <th>Statement by</th>
                <th>Date</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {v.statements.length === 0 && <Empty cols={3}>No statements yet.</Empty>}
              {v.statements.map((s, k) => (
                <tr key={k}>
                  <td>{s.by}</td>
                  <td className="hi-sub">{fmt(s.on)}</td>
                  <td className="hi-wrap">{s.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!closed && (
            <div className="pr-toolbar" style={{ gap: 8 }}>
              <input className="form-control" style={{ maxWidth: 220 }} placeholder="Statement by" value={stBy} onChange={(e) => setStBy(e.target.value)} />
              <input className="form-control" placeholder="Summary of the statement" value={stText} onChange={(e) => setStText(e.target.value)} />
              <button
                className="btn btn-secondary btn-sm"
                disabled={!stBy.trim() || !stText.trim()}
                onClick={() => {
                  app.addStatement(i.id, { by: stBy.trim(), summary: stText.trim() });
                  setStBy('');
                  setStText('');
                }}
              >
                Add statement
              </button>
            </div>
          )}

          <table className="hr-table">
            <thead>
              <tr>
                <th>Evidence</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {v.evidence.length === 0 && <Empty cols={2}>No evidence logged.</Empty>}
              {v.evidence.map((e, k) => (
                <tr key={k}>
                  <td>{e.item}</td>
                  <td className="hi-mono">{e.ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!closed && (
            <div className="pr-toolbar" style={{ gap: 8 }}>
              <input className="form-control" placeholder="Evidence item (photo, CCTV clip, document)" value={evItem} onChange={(e) => setEvItem(e.target.value)} />
              <input className="form-control" style={{ maxWidth: 200 }} placeholder="Reference" value={evRef} onChange={(e) => setEvRef(e.target.value)} />
              <button
                className="btn btn-secondary btn-sm"
                disabled={!evItem.trim()}
                onClick={() => {
                  app.addEvidence(i.id, { item: evItem.trim(), ref: evRef.trim() || `EVD/${i.id}/${String(v.evidence.length + 1).padStart(2, '0')}` });
                  setEvItem('');
                  setEvRef('');
                }}
              >
                Add evidence
              </button>
            </div>
          )}

          {!closed && (
            <div className="pr-form-grid">
              <Field label="Outcome">
                <select className="form-control" value={outcome} onChange={(e) => setOutcome(e.target.value as InvestigationOutcome)}>
                  {OUTCOMES.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Police OB number" hint={outcome === 'Referred to police' ? 'Required when referred to police' : 'If reported to police'}>
                <input className="form-control" value={ob} onChange={(e) => setOb(e.target.value)} placeholder="e.g. OB 14/22/09/2026 Kericho" />
              </Field>
              <div style={{ alignSelf: 'end' }}>
                <button
                  className="btn btn-primary"
                  disabled={(outcome === 'Referred to police' && !ob.trim()) || (outcome === 'Disciplinary referral' && !i.caseId)}
                  title={outcome === 'Disciplinary referral' && !i.caseId ? 'Refer the employee to disciplinary first' : undefined}
                  onClick={() => {
                    if (findings !== v.findings) app.updateInvestigation(i.id, { findings: findings.trim() });
                    app.closeInvestigation(i.id, outcome, ob.trim() || undefined);
                  }}
                >
                  Close investigation
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {i.lossValue > 0 && (
        <>
          <h4 style={{ margin: '8px 0 4px' }}>Insurance claim</h4>
          <div className="pr-form-grid">
            <Field label="Claim reference">
              <input className="form-control" value={claim.ref} onChange={(e) => setClaim({ ...claim, ref: e.target.value })} />
            </Field>
            <Field label="Insurer / policy">
              <input className="form-control" value={claim.insurer} onChange={(e) => setClaim({ ...claim, insurer: e.target.value })} placeholder="e.g. APA Insurance (goods in transit)" />
            </Field>
            <Field label="Amount claimed (KES)">
              <input className="form-control" type="number" min={0} value={claim.claimed} onChange={(e) => setClaim({ ...claim, claimed: Number(e.target.value) })} />
            </Field>
            <Field label="Amount paid (KES)">
              <input className="form-control" type="number" min={0} value={claim.paid} onChange={(e) => setClaim({ ...claim, paid: Number(e.target.value) })} />
            </Field>
            <Field label="Claim status">
              <select className="form-control" value={claim.status} onChange={(e) => setClaim({ ...claim, status: e.target.value as ClaimStatus })}>
                {CLAIM_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <div style={{ alignSelf: 'end' }}>
              <button
                className="btn btn-secondary"
                disabled={!claim.ref.trim() || !claim.insurer.trim()}
                onClick={() => {
                  app.setInsuranceClaim(i.id, { ...claim, ref: claim.ref.trim(), insurer: claim.insurer.trim() });
                  app.addToast({ type: 'success', title: 'Claim saved', message: `${claim.ref.trim()}: ${claim.status}.` });
                }}
              >
                {i.claim ? 'Update claim' : 'Link claim'}
              </button>
            </div>
          </div>

          <h4 style={{ margin: '8px 0 4px' }}>Recovery</h4>
          <table className="hr-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Value</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {i.recovered.length === 0 && <Empty cols={3}>Nothing recovered yet.</Empty>}
              {i.recovered.map((r, k) => (
                <tr key={k}>
                  <td>{fmt(r.on)}</td>
                  <td>{kes(r.value)}</td>
                  <td className="hi-wrap">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pr-toolbar" style={{ gap: 8 }}>
            <input className="form-control" style={{ maxWidth: 160 }} type="number" min={0} placeholder="Value (KES)" value={recValue} onChange={(e) => setRecValue(e.target.value)} />
            <input className="form-control" placeholder="What was recovered and how" value={recNote} onChange={(e) => setRecNote(e.target.value)} />
            <button
              className="btn btn-secondary btn-sm"
              disabled={!(Number(recValue) > 0) || !recNote.trim()}
              onClick={() => {
                app.addRecovery(i.id, Number(recValue), recNote.trim());
                setRecValue('');
                setRecNote('');
              }}
            >
              Record recovery
            </button>
          </div>
        </>
      )}
    </Modal>
  );
};
