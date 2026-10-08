import React, { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { QualificationDraft } from '../../../context/peopleState';
import { usePaged, Pager } from '../../../components/common/Pager';
import { fmtDate, todayIso } from '../../../data/hireEngine';
import { ACADEMIC_LEVELS, daysTo, PROFESSIONAL_BODIES, SKILL_LEVELS, type QualKind, type Qualification } from '../../../data/peopleSeed';
import { Card, Empty, Field, Modal, PersonSelect, Pill, Stat } from '../hire/shared';

type Alert = 'expired' | 'due' | 'valid' | 'none';
const alertOf = (q: Qualification, today: string): Alert => (!q.validUntil ? 'none' : q.validUntil < today ? 'expired' : daysTo(q.validUntil, today) <= 90 ? 'due' : 'valid');

const ExpiryPill: React.FC<{ q: Qualification; today: string }> = ({ q, today }) => {
  const a = alertOf(q, today);
  if (a === 'none') return <span className="hi-sub">No expiry</span>;
  const d = daysTo(q.validUntil!, today);
  return (
    <>
      {fmtDate(q.validUntil)}
      <div>{a === 'expired' ? <Pill tone="danger">Expired {-d} days ago</Pill> : a === 'due' ? <Pill tone="warning">Due in {d} days</Pill> : <Pill tone="success">Valid</Pill>}</div>
    </>
  );
};

const LEVEL_RANK = Object.fromEntries(ACADEMIC_LEVELS.map((l, i) => [l, i]));

export const QualificationsTab: React.FC = () => {
  const { qualifications, tenantEmployees, selectedOrgId, removeQualification } = useApp();
  const [kind, setKind] = useState<'All' | QualKind>('All');
  const [alert, setAlert] = useState<'All' | Alert>('All');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Qualification | 'new' | null>(null);
  const today = todayIso();

  const mine = useMemo(() => qualifications.filter((q) => q.orgId === selectedOrgId), [qualifications, selectedOrgId]);
  const nameOf = (id: string) => tenantEmployees.find((e) => e.staffId === id);
  const expired = mine.filter((q) => alertOf(q, today) === 'expired');
  const due = mine.filter((q) => alertOf(q, today) === 'due');
  const alerts = [...expired, ...due].sort((a, b) => a.validUntil!.localeCompare(b.validUntil!));
  const staffWith = new Set(mine.map((q) => q.staffId));
  const live = tenantEmployees.filter((e) => e.status !== 'TERMINATED');

  const s = search.trim().toLowerCase();
  const rows = mine
    .filter((q) => (kind === 'All' || q.kind === kind) && (alert === 'All' || alertOf(q, today) === alert) && (!s || `${nameOf(q.staffId)?.fullName ?? ''} ${q.staffId} ${q.title} ${q.institution} ${q.membershipNo ?? ''}`.toLowerCase().includes(s)))
    .sort((a, b) => (nameOf(a.staffId)?.fullName ?? '').localeCompare(nameOf(b.staffId)?.fullName ?? '') || a.kind.localeCompare(b.kind));
  const pg = usePaged(rows, 10, `${kind}|${alert}|${s}|${selectedOrgId}`);

  // One line per employee with something on file
  const summary = useMemo(
    () =>
      [...new Set(mine.map((q) => q.staffId))]
        .map((id) => {
          const list = mine.filter((q) => q.staffId === id);
          const top = list.filter((q) => q.kind === 'Academic' && q.level).sort((a, b) => LEVEL_RANK[b.level!] - LEVEL_RANK[a.level!])[0];
          return {
            id,
            e: tenantEmployees.find((x) => x.staffId === id),
            top,
            professional: list.filter((q) => q.kind === 'Professional'),
            skills: list.filter((q) => q.kind === 'Skill'),
            flags: list.filter((q) => ['expired', 'due'].includes(alertOf(q, today))).length
          };
        })
        .filter((r) => r.e)
        .sort((a, b) => a.e!.fullName.localeCompare(b.e!.fullName)),
    [mine, tenantEmployees, today]
  );
  const pgS = usePaged(summary, 10, selectedOrgId);

  return (
    <>
      <div className="hr-stats-row">
        <Stat label="Records on file" value={mine.length} sub={`${mine.filter((q) => q.kind === 'Academic').length} academic · ${mine.filter((q) => q.kind === 'Professional').length} professional · ${mine.filter((q) => q.kind === 'Skill').length} skills`} />
        <Stat label="Staff covered" value={`${staffWith.size} / ${live.length}`} sub="Employees with at least one record" />
        <Stat label="Expired" value={expired.length} sub="Practising certificates and licences" tone={expired.length ? 'var(--status-critical)' : undefined} />
        <Stat label="Due in 90 days" value={due.length} sub="Renew before they lapse" tone={due.length ? '#d97706' : undefined} />
      </div>

      {alerts.length > 0 && (
        <Card title="Expiry alerts" sub="Professional memberships, practising certificates and licences that have lapsed or lapse within 90 days. Ask the employee for the renewed certificate.">
          <div className="hi-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Certificate</th>
                  <th>Body</th>
                  <th>Valid until</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {alerts.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <strong>{nameOf(q.staffId)?.fullName ?? q.staffId}</strong>
                      <div className="hi-sub">
                        {q.staffId} · {nameOf(q.staffId)?.jobTitle}
                      </div>
                    </td>
                    <td className="hi-wrap">
                      {q.title}
                      {q.membershipNo && <div className="hi-sub hi-mono">{q.membershipNo}</div>}
                    </td>
                    <td className="hi-wrap">{q.institution}</td>
                    <td>
                      <ExpiryPill q={q} today={today} />
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditing(q)}>
                        Record renewal
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card
        title="Qualifications register"
        sub="Academic qualifications, professional body memberships and skills for every employee."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
            <Plus size={14} /> Add qualification
          </button>
        }
      >
        <div className="digicraft-toolbar" style={{ marginBottom: 12 }}>
          <div className="digicraft-search-box">
            <Search size={16} className="digicraft-search-icon" />
            <input type="text" placeholder="Search by person, qualification, institution or membership no..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="digicraft-filter-pills">
            {(['All', 'Academic', 'Professional', 'Skill'] as const).map((k) => (
              <button key={k} className={`digicraft-filter-pill ${kind === k ? 'active' : ''}`} onClick={() => setKind(k)}>
                {k === 'Skill' ? 'Skills' : k}
              </button>
            ))}
            <select className="form-control hi-select-sm" value={alert} onChange={(e) => setAlert(e.target.value as typeof alert)} aria-label="Expiry">
              <option value="All">Any expiry</option>
              <option value="expired">Expired</option>
              <option value="due">Due in 90 days</option>
              <option value="valid">Valid</option>
              <option value="none">No expiry</option>
            </select>
          </div>
        </div>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Qualification</th>
                <th>Institution / body</th>
                <th>Year</th>
                <th>Valid until</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pg.rows.length === 0 && <Empty cols={7}>No qualifications match.</Empty>}
              {pg.rows.map((q) => (
                <tr key={q.id}>
                  <td>
                    {nameOf(q.staffId)?.fullName ?? q.staffId}
                    <div className="hi-sub">{q.staffId}</div>
                  </td>
                  <td>
                    <Pill tone={q.kind === 'Academic' ? 'info' : q.kind === 'Professional' ? 'primary' : 'success'}>{q.kind === 'Academic' ? q.level ?? 'Academic' : q.kind}</Pill>
                  </td>
                  <td className="hi-wrap">
                    <strong>{q.title}</strong>
                    {q.membershipNo && <div className="hi-sub hi-mono">{q.membershipNo}</div>}
                    {q.proficiency && <div className="hi-sub">{q.proficiency}</div>}
                    {!q.verified && <div className="hi-sub hi-neg">Certificate not yet verified</div>}
                  </td>
                  <td className="hi-wrap">{q.institution || '—'}</td>
                  <td>{q.year ?? '—'}</td>
                  <td>
                    <ExpiryPill q={q} today={today} />
                  </td>
                  <td>
                    <div className="hi-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditing(q)} aria-label="Edit">
                        <Pencil size={13} />
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => window.confirm(`Remove ${q.title}?`) && removeQualification(q.id)} aria-label="Remove">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pg} noun="records" />
      </Card>

      <Card title="By employee" sub={`Highest academic level, professional memberships and skills. ${live.length - staffWith.size} employees have nothing on file yet.`}>
        <div className="hi-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Highest academic</th>
                <th>Professional</th>
                <th>Skills</th>
                <th>Alerts</th>
              </tr>
            </thead>
            <tbody>
              {pgS.rows.length === 0 && <Empty cols={5}>Nothing on file for this company.</Empty>}
              {pgS.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.e!.fullName}</strong>
                    <div className="hi-sub">
                      {r.id} · {r.e!.jobTitle}
                    </div>
                  </td>
                  <td className="hi-wrap">
                    {r.top ? (
                      <>
                        {r.top.level}
                        <div className="hi-sub">{r.top.title}</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="hi-wrap">{r.professional.length ? r.professional.map((p) => p.institution.split(' — ')[0]).join(', ') : '—'}</td>
                  <td className="hi-wrap">{r.skills.length ? r.skills.map((p) => p.title).join(', ') : '—'}</td>
                  <td>{r.flags ? <Pill tone="warning">{r.flags}</Pill> : <span className="hi-sub">None</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={pgS} noun="employees" />
      </Card>

      {editing && <QualificationModal rec={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
};

const QualificationModal: React.FC<{ rec: Qualification | null; onClose: () => void }> = ({ rec, onClose }) => {
  const { tenantEmployees, saveQualification } = useApp();
  const [d, setD] = useState<QualificationDraft>(
    rec ?? { staffId: '', kind: 'Academic', level: 'Degree', title: '', institution: '', verified: false }
  );
  const set = (patch: Partial<QualificationDraft>) => setD((x) => ({ ...x, ...patch }));
  const save = () => saveQualification(d, rec?.id) && onClose();
  return (
    <Modal
      title={rec ? 'Edit qualification' : 'Add qualification'}
      subtitle="Keep a copy of the certificate in the employee's documents."
      width={680}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="digicraft-filter-pills">
        {(['Academic', 'Professional', 'Skill'] as const).map((k) => (
          <button key={k} type="button" className={`digicraft-filter-pill ${d.kind === k ? 'active' : ''}`} onClick={() => set({ kind: k, level: k === 'Academic' ? d.level ?? 'Degree' : undefined, proficiency: k === 'Skill' ? d.proficiency ?? 'Intermediate' : undefined })}>
            {k === 'Academic' ? 'Academic' : k === 'Professional' ? 'Professional body' : 'Skill'}
          </button>
        ))}
      </div>
      <div className="pr-form-grid">
        <Field label="Employee" wide>
          <PersonSelect value={d.staffId} onChange={(v) => set({ staffId: v })} people={tenantEmployees.filter((e) => e.status !== 'TERMINATED')} />
        </Field>
        {d.kind === 'Academic' && (
          <Field label="Level">
            <select className="form-control" value={d.level} onChange={(e) => set({ level: e.target.value as QualificationDraft['level'] })}>
              {ACADEMIC_LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>
        )}
        {d.kind === 'Skill' && (
          <Field label="Proficiency">
            <select className="form-control" value={d.proficiency} onChange={(e) => set({ proficiency: e.target.value as QualificationDraft['proficiency'] })}>
              {SKILL_LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label={d.kind === 'Academic' ? 'Qualification' : d.kind === 'Professional' ? 'Certification / membership' : 'Skill'} wide={d.kind === 'Professional'}>
          <input className="form-control" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder={d.kind === 'Academic' ? 'e.g. BCom (Accounting)' : d.kind === 'Professional' ? 'e.g. CPA (K) — full member' : 'e.g. Forklift operation'} />
        </Field>
        {d.kind === 'Professional' ? (
          <>
            <Field label="Professional body">
              <select className="form-control" value={d.institution} onChange={(e) => set({ institution: e.target.value })}>
                <option value="">Choose the body</option>
                {PROFESSIONAL_BODIES.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="Membership / licence no.">
              <input className="form-control hi-mono" value={d.membershipNo ?? ''} onChange={(e) => set({ membershipNo: e.target.value })} />
            </Field>
          </>
        ) : (
          <Field label={d.kind === 'Skill' ? 'Where learnt (optional)' : 'Institution'} wide={d.kind === 'Skill'}>
            <input className="form-control" value={d.institution} onChange={(e) => set({ institution: e.target.value })} placeholder={d.kind === 'Skill' ? 'e.g. On the job' : 'e.g. University of Nairobi'} />
          </Field>
        )}
        <Field label="Year awarded">
          <input type="number" className="form-control" min={1960} max={new Date().getFullYear()} value={d.year ?? ''} onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : undefined })} />
        </Field>
        <Field label="Valid until" hint="Practising certificates, licences and annual memberships">
          <input type="date" className="form-control" value={d.validUntil ?? ''} onChange={(e) => set({ validUntil: e.target.value || undefined })} />
        </Field>
        <label className="wide" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={d.verified} onChange={(e) => set({ verified: e.target.checked })} /> Original certificate seen and verified
        </label>
      </div>
    </Modal>
  );
};
