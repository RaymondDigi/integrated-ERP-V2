import React, { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Plus, RotateCcw, ShieldCheck } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { AUDITOR_KINDS, AUDIT_TYPES, daysBetween, plusYears, type AuditFinding, type AuditorKind, type FindingSeverity, type OshAudit } from '../../../data/registersSeed';
import { Card, Empty, Field, Modal, PersonSelect, Pill, Stat, fmt, useRegOrg, type Tone } from './shared';

const SEV_TONE: Record<FindingSeverity, Tone> = { Major: 'danger', Minor: 'warning', Observation: 'info' };
const isOverdue = (f: AuditFinding, today: string) => f.status === 'Open' && f.due < today;

/** External OSH audits (DOSHS, approved auditors, insurers, customers / ISO) and their corrective actions. */
export const AuditsCard: React.FC = () => {
  const { oshAudits } = useApp();
  const { orgId, today } = useRegOrg();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const audits = useMemo(() => oshAudits.filter((a) => a.orgId === orgId).sort((a, b) => b.date.localeCompare(a.date)), [oshAudits, orgId]);
  const findings = audits.flatMap((a) => a.findings);
  const openF = findings.filter((f) => f.status !== 'Closed');
  const overdue = findings.filter((f) => isOverdue(f, today));
  const nextDue = audits.map((a) => a.nextDue).sort()[0];

  return (
    <Card
      title="External OSH audits"
      sub="Statutory annual audits by DOSHS-approved auditors, fire safety audits, insurer surveys and customer / ISO 45001 audits. Every finding gets a corrective action with an owner and due date."
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={14} /> Record audit
        </button>
      }
    >
      <div className="hr-stats-row">
        <Stat label="Audits on file" value={audits.length} sub={audits[0] ? `Latest ${fmt(audits[0].date)}` : 'None yet'} />
        <Stat label="Open findings" value={openF.length} sub={`${findings.length - openF.length} closed`} tone={openF.length ? 'var(--status-warning)' : undefined} />
        <Stat label="Overdue actions" value={overdue.length} sub="Past their due date and still open" tone={overdue.length ? 'var(--status-critical)' : undefined} />
        <Stat label="Next audit due" value={nextDue ? fmt(nextDue) : '—'} sub={nextDue ? `in ${daysBetween(today, nextDue)} days` : 'Statutory audit is yearly'} />
      </div>
      <div className="hi-scroll">
        <table className="hr-table">
          <thead>
            <tr>
              <th />
              <th>Audit</th>
              <th>Auditor</th>
              <th>Date</th>
              <th>Score / rating</th>
              <th>Findings</th>
              <th>Report</th>
              <th>Next due</th>
            </tr>
          </thead>
          <tbody>
            {audits.length === 0 && <Empty cols={8}>No external audits recorded for this company.</Empty>}
            {audits.map((a) => {
              const od = a.findings.filter((f) => isOverdue(f, today)).length;
              const op = a.findings.filter((f) => f.status !== 'Closed').length;
              const isOpen = open === a.id;
              return (
                <React.Fragment key={a.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setOpen(isOpen ? null : a.id)}>
                    <td>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td className="hi-wrap">
                      <strong>{a.type}</strong>
                      <div className="hi-sub">{a.site}</div>
                    </td>
                    <td className="hi-wrap">
                      {a.auditor}
                      <div className="hi-sub">{a.auditorKind}</div>
                    </td>
                    <td>{fmt(a.date)}</td>
                    <td>
                      {a.score !== undefined && <strong>{a.score}% </strong>}
                      <div className="hi-sub">{a.rating}</div>
                    </td>
                    <td>
                      {a.findings.length} · {op} open
                      {od > 0 && (
                        <div>
                          <Pill tone="danger">{od} overdue</Pill>
                        </div>
                      )}
                    </td>
                    <td className="hi-mono">{a.reportRef}</td>
                    <td>
                      {fmt(a.nextDue)}
                      {a.nextDue < today && <Pill tone="danger">Overdue</Pill>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={8} style={{ background: 'var(--bg-surface-subtle)' }}>
                        <FindingsPanel audit={a} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {adding && <AddAuditModal onClose={() => setAdding(false)} />}
    </Card>
  );
};

const FindingsPanel: React.FC<{ audit: OshAudit }> = ({ audit }) => {
  const { setAuditFindingStatus, addAuditFinding } = useApp();
  const { staff, today, name } = useRegOrg();
  const [text, setText] = useState('');
  const [severity, setSeverity] = useState<FindingSeverity>('Minor');
  const [action, setAction] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [due, setDue] = useState(today);

  return (
    <div style={{ padding: '8px 4px' }}>
      <table className="hr-table">
        <thead>
          <tr>
            <th>Finding</th>
            <th>Corrective action</th>
            <th>Owner</th>
            <th>Due</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {audit.findings.length === 0 && <Empty cols={6}>No findings recorded. Add them from the audit report below.</Empty>}
          {audit.findings.map((f) => {
            const late = isOverdue(f, today);
            return (
              <tr key={f.id}>
                <td className="hi-wrap">
                  <Pill tone={SEV_TONE[f.severity]}>{f.severity}</Pill> {f.text}
                </td>
                <td className="hi-wrap">{f.action}</td>
                <td>{name(f.ownerId)}</td>
                <td style={late ? { color: 'var(--status-critical)', fontWeight: 600 } : undefined}>
                  {fmt(f.due)}
                  {late && <div className="hi-sub">{daysBetween(f.due, today)} days overdue</div>}
                </td>
                <td>
                  <Pill tone={late ? 'danger' : f.status === 'Closed' ? 'success' : f.status === 'Done' ? 'info' : 'warning'}>{late ? 'Overdue' : f.status === 'Done' ? 'Done, to verify' : f.status}</Pill>
                  {f.closedOn && <div className="hi-sub">{fmt(f.closedOn)}</div>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {f.status === 'Open' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setAuditFindingStatus(audit.id, f.id, 'Done')}>
                      <CheckCircle2 size={13} /> Done
                    </button>
                  )}
                  {f.status === 'Done' && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => setAuditFindingStatus(audit.id, f.id, 'Closed')}>
                        <ShieldCheck size={13} /> Verify & close
                      </button>{' '}
                      <button className="btn btn-secondary btn-sm" title="Not effective — reopen" aria-label="Reopen" onClick={() => setAuditFindingStatus(audit.id, f.id, 'Open')}>
                        <RotateCcw size={13} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="digicraft-toolbar" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
        <input className="form-control" style={{ flex: 2, minWidth: 180 }} placeholder="Finding" value={text} onChange={(e) => setText(e.target.value)} aria-label="Finding" />
        <select className="form-control" style={{ width: 130 }} value={severity} onChange={(e) => setSeverity(e.target.value as FindingSeverity)} aria-label="Severity">
          <option>Major</option>
          <option>Minor</option>
          <option>Observation</option>
        </select>
        <input className="form-control" style={{ flex: 2, minWidth: 180 }} placeholder="Corrective action" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Corrective action" />
        <div style={{ minWidth: 180, flex: 1 }}>
          <PersonSelect value={ownerId} onChange={setOwnerId} people={staff} placeholder="Owner…" />
        </div>
        <input className="form-control" style={{ width: 150 }} type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
        <button
          className="btn btn-secondary btn-sm"
          disabled={!text.trim() || !action.trim() || !ownerId}
          onClick={() => {
            addAuditFinding(audit.id, { text: text.trim(), severity, action: action.trim(), ownerId, due });
            setText('');
            setAction('');
          }}
        >
          <Plus size={13} /> Add finding
        </button>
      </div>
    </div>
  );
};

const AddAuditModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addOshAudit, activeTenant } = useApp();
  const { today } = useRegOrg();
  const [auditorKind, setKind] = useState<AuditorKind>('Approved OSH auditor');
  const [auditor, setAuditor] = useState('');
  const [type, setType] = useState<string>(AUDIT_TYPES[0]);
  const [date, setDate] = useState(today);
  const [site, setSite] = useState(activeTenant.name);
  const [score, setScore] = useState('');
  const [rating, setRating] = useState('');
  const [reportRef, setReportRef] = useState('');
  const [nextDue, setNextDue] = useState(plusYears(today, 1));
  const ok = auditor.trim() && reportRef.trim() && rating.trim();
  return (
    <Modal
      title="Record external audit"
      subtitle="Findings are added once the audit is saved."
      onClose={onClose}
      width={720}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              addOshAudit({ auditorKind, auditor: auditor.trim(), type, date, site, score: score === '' ? undefined : Number(score), rating: rating.trim(), reportRef: reportRef.trim(), nextDue });
              onClose();
            }}
          >
            Save audit
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Auditor type">
          <select className="form-control" value={auditorKind} onChange={(e) => setKind(e.target.value as AuditorKind)}>
            {AUDITOR_KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="Auditor / firm">
          <input className="form-control" value={auditor} onChange={(e) => setAuditor(e.target.value)} placeholder="e.g. firm name and DOSHS approval no." />
        </Field>
        <Field label="Audit type">
          <select
            className="form-control"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setNextDue(plusYears(date, 1));
            }}
          >
            {AUDIT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Audit date">
          <input
            className="form-control"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setNextDue(plusYears(e.target.value, 1));
            }}
          />
        </Field>
        <Field label="Scope / site" wide>
          <input className="form-control" value={site} onChange={(e) => setSite(e.target.value)} />
        </Field>
        <Field label="Score (%)" hint="Leave blank if not scored">
          <input className="form-control" type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} />
        </Field>
        <Field label="Rating">
          <input className="form-control" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="e.g. Satisfactory" />
        </Field>
        <Field label="Report reference">
          <input className="form-control" value={reportRef} onChange={(e) => setReportRef(e.target.value)} />
        </Field>
        <Field label="Next audit due">
          <input className="form-control" type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};
