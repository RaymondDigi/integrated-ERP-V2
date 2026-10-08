import React, { useMemo, useState } from 'react';
import { Award, Download, FileCheck2, GraduationCap, Plus, UserPlus, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { downloadExcel } from '../payroll/reports';
import { INTERN_PROGRAMMES, type InternCohort, type InternPlacement, type InternProgramme, type InternStatus } from '../../../data/registersSeed';
import { Card, Empty, Field, Modal, PersonSelect, Pill, Stat, fmt, kes, useRegOrg, type Tone } from './shared';

const STATUS_TONE: Record<InternStatus, Tone> = { Applied: 'info', Placed: 'primary', Completed: 'success', Withdrawn: 'warning', 'Not selected': 'warning' };
const DEPARTMENTS = ['Finance & Administration', 'Production & Quality Control', 'Engineering & Maintenance', 'Operations', 'Information Technology', 'Human Resources', 'Sales & Marketing', 'OSH & Compliance', 'General Services'];

/**
 * Recruitment › Vacancies: graduate internships and industrial attachments.
 * Interns are not on the employee master, so stipends are kept as a list and exported for payment rather than run through payroll.
 */
export const InternshipsSection: React.FC = () => {
  const { internCohorts, internPlacements, internStipends, updateInternPlacement, setInternCohortStatus } = useApp();
  const { orgId, today, name } = useRegOrg();
  const cohorts = useMemo(() => internCohorts.filter((c) => c.orgId === orgId).sort((a, b) => b.startOn.localeCompare(a.startOn)), [internCohorts, orgId]);
  const [pick, setPick] = useState<string>('');
  const cohort = cohorts.find((c) => c.id === pick) ?? cohorts[0];
  const [modal, setModal] = useState<null | { kind: 'cohort' } | { kind: 'applicant' } | { kind: 'docs' | 'place' | 'evaluate'; p: InternPlacement }>(null);

  const all = internPlacements.filter((p) => p.orgId === orgId);
  const people = cohort ? all.filter((p) => p.cohortId === cohort.id) : [];
  const pg = usePaged(people, 10, cohort?.id);
  const active = all.filter((p) => p.status === 'Placed');
  const paidYtd = internStipends.filter((s) => s.orgId === orgId && s.status === 'Paid' && s.month.startsWith(today.slice(0, 4))).reduce((n, s) => n + s.amount, 0);
  const slotsFor = (c: InternCohort) => c.slots.reduce((n, s) => n + s.slots, 0);
  const placedIn = (c: InternCohort, dept?: string) => all.filter((p) => p.cohortId === c.id && (p.status === 'Placed' || p.status === 'Completed') && (!dept || p.department === dept)).length;

  return (
    <Card
      title={
        <>
          <GraduationCap size={16} style={{ verticalAlign: -2 }} /> Internships & industrial attachment
        </>
      }
      sub="Graduate interns and college / university students on attachment. Placement needs the institution's letter and insurance cover (company WIBA or the student's own cover). Interns are not employees, so stipends are paid from an exported list, not payroll."
      actions={
        <>
          <button className="btn btn-secondary btn-sm" onClick={() => setModal({ kind: 'cohort' })}>
            <Plus size={14} /> New intake
          </button>
          <button className="btn btn-primary btn-sm" disabled={!cohort} onClick={() => setModal({ kind: 'applicant' })}>
            <UserPlus size={14} /> Add applicant
          </button>
        </>
      }
    >
      <div className="hr-stats-row">
        <Stat label="Intakes" value={cohorts.length} sub={`${cohorts.filter((c) => c.status === 'Running').length} running`} />
        <Stat label="Currently placed" value={active.length} sub={`${active.filter((p) => internCohorts.find((c) => c.id === p.cohortId)?.programme === 'Industrial attachment').length} on attachment`} />
        <Stat label="Applicants to review" value={all.filter((p) => p.status === 'Applied').length} sub={`${all.filter((p) => p.status === 'Applied' && (!p.letterRef || !p.insurance)).length} missing letter or cover`} />
        <Stat label={`Stipends paid ${today.slice(0, 4)}`} value={kes(paidYtd)} sub={`${all.filter((p) => p.evaluation?.certificateNo).length} certificates issued`} />
      </div>

      {cohorts.length === 0 ? (
        <div className="pr-note">No intakes for this company yet. Open one with New intake.</div>
      ) : (
        <>
          <div className="digicraft-filter-pills" style={{ marginBottom: 10 }}>
            {cohorts.map((c) => (
              <button key={c.id} className={`digicraft-filter-pill ${cohort?.id === c.id ? 'active' : ''}`} onClick={() => setPick(c.id)}>
                {c.programme === 'Industrial attachment' ? 'Attachment' : 'Internship'} · {fmt(c.startOn)}
              </button>
            ))}
          </div>

          {cohort && (
            <>
              <div className="pr-note" style={{ marginBottom: 10 }}>
                <strong>{cohort.name}</strong> ({cohort.id}) · {fmt(cohort.startOn)} to {fmt(cohort.endOn)} · stipend {cohort.stipend ? `${kes(cohort.stipend)} a month` : 'none'} · coordinator {name(cohort.coordinatorId)} ·{' '}
                {placedIn(cohort)} of {slotsFor(cohort)} slots filled ({cohort.slots.map((s) => `${s.department} ${placedIn(cohort, s.department)}/${s.slots}`).join(', ')}) ·{' '}
                <select className="form-control hi-select-sm" style={{ display: 'inline-block', width: 'auto' }} value={cohort.status} onChange={(e) => setInternCohortStatus(cohort.id, e.target.value as InternCohort['status'])} aria-label="Intake status">
                  <option>Open for applications</option>
                  <option>Running</option>
                  <option>Closed</option>
                </select>
              </div>

              <div className="hi-scroll">
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Applicant</th>
                      <th>Institution & course</th>
                      <th>Letter</th>
                      <th>Insurance</th>
                      <th>Placement</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pg.rows.length === 0 && <Empty cols={7}>No applicants in this intake yet.</Empty>}
                    {pg.rows.map((p) => {
                      const coverLapsed = p.insurance && p.insurance.expiresOn < today;
                      return (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.name}</strong>
                            <div className="hi-sub">
                              {p.phone} · {p.email}
                            </div>
                          </td>
                          <td className="hi-wrap">
                            {p.institution}
                            <div className="hi-sub">
                              {p.course} · {p.year}
                            </div>
                          </td>
                          <td>{p.letterRef ? <span className="hi-mono">{p.letterRef}</span> : <Pill tone="warning">Missing</Pill>}</td>
                          <td>
                            {p.insurance ? (
                              <>
                                <Pill tone={coverLapsed ? 'danger' : 'success'}>{p.insurance.kind}</Pill>
                                <div className="hi-sub">
                                  {p.insurance.ref} · to {fmt(p.insurance.expiresOn)}
                                </div>
                              </>
                            ) : (
                              <Pill tone="warning">No cover</Pill>
                            )}
                          </td>
                          <td>
                            {p.department ?? '—'}
                            {p.supervisorId && <div className="hi-sub">Supervisor {name(p.supervisorId)}</div>}
                          </td>
                          <td>
                            <Pill tone={STATUS_TONE[p.status]}>{p.status}</Pill>
                            {p.evaluation && (
                              <div className="hi-sub" title={p.evaluation.comment}>
                                Rated {p.evaluation.rating}/5{p.evaluation.certificateNo ? ` · ${p.evaluation.certificateNo}` : ''}
                              </div>
                            )}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {(p.status === 'Applied' || p.status === 'Placed') && (
                              <button className="btn btn-secondary btn-sm" title="Letter and insurance" onClick={() => setModal({ kind: 'docs', p })}>
                                <FileCheck2 size={13} /> Documents
                              </button>
                            )}{' '}
                            {p.status === 'Applied' && (
                              <>
                                <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'place', p })}>
                                  Place
                                </button>{' '}
                                <button className="btn btn-secondary btn-sm" title="Not selected" aria-label="Not selected" onClick={() => updateInternPlacement(p.id, { status: 'Not selected' })}>
                                  <X size={13} />
                                </button>
                              </>
                            )}
                            {p.status === 'Placed' && (
                              <>
                                <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'evaluate', p })}>
                                  <Award size={13} /> Evaluate
                                </button>{' '}
                                <button className="btn btn-secondary btn-sm" title="Withdrawn / left early" aria-label="Withdraw" onClick={() => updateInternPlacement(p.id, { status: 'Withdrawn' })}>
                                  <X size={13} />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager p={pg} noun="applicants" sizes={[10, 25]} />

              <StipendList cohort={cohort} placements={people} />
            </>
          )}
        </>
      )}

      {modal?.kind === 'cohort' && <CohortModal onClose={() => setModal(null)} />}
      {modal?.kind === 'applicant' && cohort && <ApplicantModal cohort={cohort} onClose={() => setModal(null)} />}
      {modal?.kind === 'docs' && <DocsModal p={modal.p} onClose={() => setModal(null)} />}
      {modal?.kind === 'place' && cohort && <PlaceModal p={modal.p} cohort={cohort} onClose={() => setModal(null)} />}
      {modal?.kind === 'evaluate' && <EvaluateModal p={modal.p} onClose={() => setModal(null)} />}
    </Card>
  );
};

/* ------------------------------------------------------------------ stipends */

const StipendList: React.FC<{ cohort: InternCohort; placements: InternPlacement[] }> = ({ cohort, placements }) => {
  const { internStipends, generateStipends, setStipendStatus, activeTenant } = useApp();
  const { today } = useRegOrg();
  const lines = internStipends.filter((s) => s.cohortId === cohort.id);
  const months = [...new Set(lines.map((s) => s.month))].sort().reverse();
  const [month, setMonth] = useState(today.slice(0, 7));
  const rows = lines.filter((s) => s.month === month);
  const byId = new Map(placements.map((p) => [p.id, p]));
  const pending = rows.filter((s) => s.status === 'Pending');
  const approved = rows.filter((s) => s.status === 'Approved');
  const total = rows.reduce((n, s) => n + s.amount, 0);

  const exportList = () =>
    downloadExcel(`Stipends-${cohort.id}-${month}`, [
      {
        name: `Stipends ${month}`,
        title: `${activeTenant.name} — ${cohort.name} — stipends for ${fmt(month)}`,
        header: ['Reference', 'Name', 'Institution', 'Course', 'Department', 'Phone', 'Amount (KES)', 'Status', 'Paid on'],
        rows: rows.map((s) => {
          const p = byId.get(s.placementId);
          return [s.ref, p?.name ?? s.placementId, p?.institution ?? '', p?.course ?? '', p?.department ?? '', p?.phone ?? '', s.amount, s.status, s.paidOn ?? ''];
        }),
        foot: ['Total', '', '', '', '', '', total, '', '']
      }
    ]);

  return (
    <div style={{ marginTop: 16 }}>
      <div className="pr-card-head">
        <div>
          <h3>Stipend list</h3>
          <p>{cohort.stipend ? `${kes(cohort.stipend)} a month for each placed intern. Prepare the month, approve, export for M-Pesa / bank payment and mark paid.` : 'This intake is unpaid.'}</p>
        </div>
        <div className="pr-toolbar">
          <input className="form-control" type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" list={`stp-months-${cohort.id}`} />
          <datalist id={`stp-months-${cohort.id}`}>
            {months.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button className="btn btn-secondary btn-sm" disabled={!cohort.stipend} onClick={() => generateStipends(cohort.id, month)}>
            <Plus size={13} /> Prepare month
          </button>
          <button className="btn btn-secondary btn-sm" disabled={!pending.length} onClick={() => setStipendStatus(pending.map((s) => s.id), 'Approved')}>
            Approve {pending.length || ''}
          </button>
          <button className="btn btn-secondary btn-sm" disabled={!approved.length} onClick={() => setStipendStatus(approved.map((s) => s.id), 'Paid')}>
            Mark paid {approved.length || ''}
          </button>
          <button className="btn btn-primary btn-sm" disabled={!rows.length} onClick={exportList}>
            <Download size={13} /> Export stipend list
          </button>
        </div>
      </div>
      <div className="hi-scroll">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Intern</th>
              <th>Department</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <Empty cols={5}>No stipend lines for {fmt(month)}. Use Prepare month.</Empty>}
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="hi-mono">{s.ref}</td>
                <td>{byId.get(s.placementId)?.name ?? s.placementId}</td>
                <td>{byId.get(s.placementId)?.department ?? '—'}</td>
                <td>{kes(s.amount)}</td>
                <td>
                  <Pill tone={s.status === 'Paid' ? 'success' : s.status === 'Approved' ? 'info' : 'warning'}>{s.status}</Pill>
                  {s.paidOn && <div className="hi-sub">{fmt(s.paidOn)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <th colSpan={3}>Total</th>
                <th>{kes(total)}</th>
                <th />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ modals */

const Footer: React.FC<{ onClose: () => void; ok: boolean; label: string; onSave: () => void }> = ({ onClose, ok, label, onSave }) => (
  <>
    <button className="btn btn-secondary" onClick={onClose}>
      Cancel
    </button>
    <button className="btn btn-primary" disabled={!ok} onClick={onSave}>
      {label}
    </button>
  </>
);

const CohortModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { addInternCohort } = useApp();
  const { staff, today } = useRegOrg();
  const [programme, setProgramme] = useState<InternProgramme>('Industrial attachment');
  const [name, setName] = useState('');
  const [startOn, setStart] = useState(today);
  const [endOn, setEnd] = useState('');
  const [stipend, setStipend] = useState('6000');
  const [coordinatorId, setCoord] = useState('');
  const [slots, setSlots] = useState<Record<string, string>>({});
  const slotList = Object.entries(slots)
    .map(([department, n]) => ({ department, slots: Number(n) || 0 }))
    .filter((s) => s.slots > 0);
  const ok = !!(name.trim() && endOn > startOn && coordinatorId && slotList.length);
  return (
    <Modal
      title="New intake"
      subtitle="Attachments usually run 8–12 weeks; graduate internships up to 12 months."
      onClose={onClose}
      width={720}
      footer={
        <Footer
          onClose={onClose}
          ok={ok}
          label="Open intake"
          onSave={() => {
            addInternCohort({ programme, name: name.trim(), startOn, endOn, stipend: Number(stipend) || 0, coordinatorId, slots: slotList });
            onClose();
          }}
        />
      }
    >
      <div className="pr-form-grid">
        <Field label="Programme">
          <select
            className="form-control"
            value={programme}
            onChange={(e) => {
              setProgramme(e.target.value as InternProgramme);
              setStipend(e.target.value === 'Graduate internship' ? '25000' : '6000');
            }}
          >
            {INTERN_PROGRAMMES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Intake name">
          <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Industrial attachment — Jan to Mar 2027" />
        </Field>
        <Field label="Starts">
          <input className="form-control" type="date" value={startOn} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Ends">
          <input className="form-control" type="date" value={endOn} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="Stipend per month (KES)" hint="0 for unpaid">
          <input className="form-control" type="number" min={0} value={stipend} onChange={(e) => setStipend(e.target.value)} />
        </Field>
        <Field label="Coordinator">
          <PersonSelect value={coordinatorId} onChange={setCoord} people={staff} />
        </Field>
      </div>
      <div className="req-field wide">
        <span>Slots per department</span>
        <div className="pr-form-grid">
          {DEPARTMENTS.map((d) => (
            <label key={d} className="req-field">
              <span className="hi-sub">{d}</span>
              <input className="form-control" type="number" min={0} value={slots[d] ?? ''} placeholder="0" onChange={(e) => setSlots((s) => ({ ...s, [d]: e.target.value }))} />
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
};

const ApplicantModal: React.FC<{ cohort: InternCohort; onClose: () => void }> = ({ cohort, onClose }) => {
  const { addInternApplicant } = useApp();
  const [f, setF] = useState({ name: '', phone: '', email: '', institution: '', course: '', year: cohort.programme === 'Industrial attachment' ? 'Year 3' : '2026 graduate', letterRef: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const ok = !!(f.name.trim() && f.institution.trim() && f.course.trim() && f.phone.trim());
  return (
    <Modal
      title="Add applicant"
      subtitle={cohort.name}
      onClose={onClose}
      width={680}
      footer={
        <Footer
          onClose={onClose}
          ok={ok}
          label="Add applicant"
          onSave={() => {
            addInternApplicant({ cohortId: cohort.id, name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), institution: f.institution.trim(), course: f.course.trim(), year: f.year.trim(), letterRef: f.letterRef.trim() || undefined });
            onClose();
          }}
        />
      }
    >
      <div className="pr-form-grid">
        <Field label="Full name">
          <input className="form-control" value={f.name} onChange={set('name')} />
        </Field>
        <Field label="Phone">
          <input className="form-control" value={f.phone} onChange={set('phone')} placeholder="+254 7…" />
        </Field>
        <Field label="Email">
          <input className="form-control" type="email" value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Institution">
          <input className="form-control" value={f.institution} onChange={set('institution')} />
        </Field>
        <Field label="Course">
          <input className="form-control" value={f.course} onChange={set('course')} />
        </Field>
        <Field label={cohort.programme === 'Industrial attachment' ? 'Year of study' : 'Year of graduation'}>
          <input className="form-control" value={f.year} onChange={set('year')} />
        </Field>
        <Field label="Institution letter reference" hint="Introduction / attachment letter; can be added later" wide>
          <input className="form-control" value={f.letterRef} onChange={set('letterRef')} />
        </Field>
      </div>
    </Modal>
  );
};

const DocsModal: React.FC<{ p: InternPlacement; onClose: () => void }> = ({ p, onClose }) => {
  const { updateInternPlacement, internCohorts } = useApp();
  const end = internCohorts.find((c) => c.id === p.cohortId)?.endOn ?? '';
  const [letterRef, setLetter] = useState(p.letterRef ?? '');
  const [kind, setKind] = useState<'WIBA (company)' | 'Student cover'>(p.insurance?.kind ?? 'Student cover');
  const [ref, setRef] = useState(p.insurance?.ref ?? '');
  const [expiresOn, setExp] = useState(p.insurance?.expiresOn ?? end);
  return (
    <Modal
      title="Letter & insurance cover"
      subtitle={`${p.name} · ${p.institution}`}
      onClose={onClose}
      width={620}
      footer={
        <Footer
          onClose={onClose}
          ok
          label="Save"
          onSave={() => {
            updateInternPlacement(p.id, { letterRef: letterRef.trim() || undefined, insurance: ref.trim() ? { kind, ref: ref.trim(), expiresOn } : undefined });
            onClose();
          }}
        />
      }
    >
      <div className="pr-form-grid">
        <Field label="Institution letter reference" wide>
          <input className="form-control" value={letterRef} onChange={(e) => setLetter(e.target.value)} />
        </Field>
        <Field label="Insurance cover" hint="Company WIBA extension or the student's own personal accident cover">
          <select className="form-control" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option>WIBA (company)</option>
            <option>Student cover</option>
          </select>
        </Field>
        <Field label="Policy / certificate no.">
          <input className="form-control" value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
        <Field label="Cover ends" hint={end ? `Must run to the intake end, ${fmt(end)}` : undefined}>
          <input className="form-control" type="date" value={expiresOn} onChange={(e) => setExp(e.target.value)} />
        </Field>
      </div>
      {ref && end && expiresOn < end && <div className="pr-note warn">Cover ends before the intake does. Ask for an extension before the end date.</div>}
    </Modal>
  );
};

const PlaceModal: React.FC<{ p: InternPlacement; cohort: InternCohort; onClose: () => void }> = ({ p, cohort, onClose }) => {
  const { placeIntern } = useApp();
  const { staff } = useRegOrg();
  const [department, setDept] = useState(cohort.slots[0]?.department ?? '');
  const [supervisorId, setSup] = useState('');
  const supervisors = staff.filter((e) => e.department === department);
  const missing = !p.letterRef || !p.insurance;
  return (
    <Modal
      title="Place applicant"
      subtitle={`${p.name} · ${p.course}`}
      onClose={onClose}
      width={600}
      footer={
        <Footer
          onClose={onClose}
          ok={!!(department && supervisorId && !missing)}
          label="Place"
          onSave={() => {
            if (placeIntern(p.id, department, supervisorId)) onClose();
          }}
        />
      }
    >
      {missing && <div className="pr-note warn">Record the institution letter and insurance cover first (Documents).</div>}
      <div className="pr-form-grid">
        <Field label="Department">
          <select
            className="form-control"
            value={department}
            onChange={(e) => {
              setDept(e.target.value);
              setSup('');
            }}
          >
            {cohort.slots.map((s) => (
              <option key={s.department}>{s.department}</option>
            ))}
          </select>
        </Field>
        <Field label="Supervisor">
          <PersonSelect value={supervisorId} onChange={setSup} people={supervisors.length ? supervisors : staff} />
        </Field>
      </div>
    </Modal>
  );
};

const EvaluateModal: React.FC<{ p: InternPlacement; onClose: () => void }> = ({ p, onClose }) => {
  const { evaluateIntern } = useApp();
  const { name } = useRegOrg();
  const [rating, setRating] = useState('4');
  const [comment, setComment] = useState('');
  const [cert, setCert] = useState(true);
  return (
    <Modal
      title="End-of-placement evaluation"
      subtitle={`${p.name} · ${p.department ?? ''} · supervisor ${name(p.supervisorId)}`}
      onClose={onClose}
      width={600}
      footer={
        <Footer
          onClose={onClose}
          ok={!!comment.trim()}
          label="Save evaluation"
          onSave={() => {
            evaluateIntern(p.id, Number(rating), comment.trim(), cert);
            onClose();
          }}
        />
      }
    >
      <div className="pr-form-grid">
        <Field label="Supervisor rating">
          <select className="form-control" value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="5">5 — Outstanding</option>
            <option value="4">4 — Very good</option>
            <option value="3">3 — Good</option>
            <option value="2">2 — Fair</option>
            <option value="1">1 — Poor</option>
          </select>
        </Field>
        <Field label="Certificate">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={cert} onChange={(e) => setCert(e.target.checked)} /> Issue certificate of completion
          </label>
        </Field>
        <Field label="Supervisor's comments" hint="Shared with the institution's assessment form" wide>
          <textarea className="form-control" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};
