import React, { useState } from 'react';
import { GraduationCap, Briefcase, Target, ShieldAlert } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { DataTable, Field, Modal, Panel, Stat, Timeline } from '../../../suites/ui/kit';
import { PLACEMENT_CRITERIA, PLACEMENT_MAX_MONTHS, READINESS_LABEL, type IdpAction, type Placement, type PlacementKind, type SuccessionPlan } from '../../../data/hcmConfig';
import { fmt, kes, todayIso } from '../../../data/hcmEngine';
import { Btn, StaffSelect, StatusPill, Toolbar, useCanEdit, useStaff } from './ui';

/* ================================================================ Interns and industrial attachment */

export const PlacementsTab: React.FC = () => {
  const { placements, addPlacement, logPlacementWeek, signPlacementWeek, evaluatePlacement, completePlacement, terminatePlacement, tenantEmployees } = useApp();
  const { nameOf } = useStaff();
  const { canEdit } = useCanEdit();
  const depts = [...new Set(tenantEmployees.map((e) => e.department))].sort();
  const blank = { kind: 'INTERNSHIP' as PlacementKind, name: '', email: '', phone: '', institution: '', course: '', department: depts[0] ?? '', supervisorStaffId: '', start: todayIso(), end: '', stipendKes: 15000, letterRef: '', insuranceRef: '' };
  const [f, setF] = useState(blank);
  const [sel, setSel] = useState<Placement | null>(null);
  const [week, setWeek] = useState({ summary: '', hours: 40 });
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const cur = sel ? placements.find((p) => p.id === sel.id) ?? sel : null;
  return (
    <>
      <div className="sx-stats">
        <Stat label="Interns" value={placements.filter((p) => p.kind === 'INTERNSHIP' && p.status === 'ACTIVE').length} detail={`up to ${PLACEMENT_MAX_MONTHS.INTERNSHIP} months, monthly stipend`} icon={<GraduationCap size={16} />} />
        <Stat label="Attachees" value={placements.filter((p) => p.kind === 'ATTACHMENT' && p.status === 'ACTIVE').length} detail={`up to ${PLACEMENT_MAX_MONTHS.ATTACHMENT} months, institution letter + insurance`} icon={<GraduationCap size={16} />} tone="blue" />
        <Stat label="Monthly stipends" value={kes(placements.filter((p) => p.status === 'ACTIVE').reduce((n, p) => n + p.stipendKes, 0))} icon={<GraduationCap size={16} />} tone="gold" />
      </div>
      <Panel title="New internship or attachment" subtitle="Attachments need the institution's letter and insurance cover; every placement has a workplace supervisor, weekly logbook and final evaluation.">
        <div className="sx-grid">
          <Field label="Type">
            <select className="form-control" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PlacementKind, stipendKes: e.target.value === 'ATTACHMENT' ? 0 : 15000 })}>
              <option value="INTERNSHIP">Internship (graduate)</option>
              <option value="ATTACHMENT">Industrial attachment (student)</option>
            </select>
          </Field>
          <Field label="Name" required>
            <input className="form-control" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Email" required>
            <input className="form-control" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className="form-control" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label="Institution" required>
            <input className="form-control" value={f.institution} onChange={(e) => setF({ ...f, institution: e.target.value })} />
          </Field>
          <Field label="Course" required>
            <input className="form-control" value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })} />
          </Field>
          <Field label="Department">
            <select className="form-control" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
              {depts.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Supervisor" required>
            <StaffSelect value={f.supervisorStaffId} onChange={(v) => setF({ ...f, supervisorStaffId: v })} label="Supervisor" />
          </Field>
          <Field label="Start">
            <input className="form-control" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          </Field>
          <Field label="End">
            <input className="form-control" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
          </Field>
          <Field label="Monthly stipend (KES)">
            <input className="form-control" type="number" value={f.stipendKes} onChange={(e) => setF({ ...f, stipendKes: Number(e.target.value) })} />
          </Field>
          <Field label="Institution letter ref">
            <input className="form-control" value={f.letterRef} onChange={(e) => setF({ ...f, letterRef: e.target.value })} />
          </Field>
          <Field label="Insurance (WIBA / GPA) ref">
            <input className="form-control" value={f.insuranceRef} onChange={(e) => setF({ ...f, insuranceRef: e.target.value })} />
          </Field>
        </div>
        <Toolbar>
          <Btn
            primary
            disabled={!canEdit}
            onClick={() => addPlacement({ ...f, letterRef: f.letterRef || undefined, insuranceRef: f.insuranceRef || undefined, rotation: [{ department: f.department, from: f.start, to: f.end }] }) && setF(blank)}
          >
            Add placement
          </Btn>
        </Toolbar>
      </Panel>
      <Panel title="Placements">
        <DataTable
          rows={placements}
          rowKey={(p) => p.id}
          onRowClick={(p) => {
            setSel(p);
            setScores({});
            setComment('');
          }}
          columns={[
            { key: 'id', header: 'Placement', render: (p) => `${p.id} · ${p.kind === 'INTERNSHIP' ? 'Intern' : 'Attachee'}` },
            { key: 'n', header: 'Name / institution', render: (p) => `${p.name} — ${p.institution}, ${p.course}` },
            { key: 'd', header: 'Department / supervisor', render: (p) => `${p.department} · ${nameOf(p.supervisorStaffId)}` },
            { key: 'p', header: 'Period', render: (p) => `${fmt(p.start)} to ${fmt(p.end)}` },
            { key: 'l', header: 'Logbook', render: (p) => `${p.logbook.filter((w) => w.signedBy).length}/${p.logbook.length} weeks signed` },
            { key: 's', header: 'Status', render: (p) => <StatusPill status={p.status} /> }
          ]}
        />
      </Panel>
      {cur && (
        <Modal
          title={`${cur.name} — ${cur.kind === 'INTERNSHIP' ? 'internship' : 'industrial attachment'}`}
          subtitle={`${cur.institution} · ${cur.course} · stipend ${kes(cur.stipendKes)}/month${cur.certificateNo ? ` · certificate ${cur.certificateNo}` : ''}`}
          onClose={() => setSel(null)}
          footer={
            cur.status === 'ACTIVE' ? (
              <>
                <Btn disabled={!canEdit} onClick={() => terminatePlacement(cur.id, comment || 'Ended early')}>
                  End early
                </Btn>
                <Btn primary disabled={!canEdit} onClick={() => completePlacement(cur.id)}>
                  Complete & issue certificate
                </Btn>
              </>
            ) : undefined
          }
        >
          <h4>Weekly logbook</h4>
          <DataTable
            rows={cur.logbook}
            rowKey={(w) => String(w.week)}
            columns={[
              { key: 'w', header: 'Week', render: (w) => w.week },
              { key: 's', header: 'Work done', render: (w) => w.summary },
              { key: 'h', header: 'Hours', align: 'right', render: (w) => w.hours },
              {
                key: 'g',
                header: 'Supervisor sign-off',
                render: (w) =>
                  w.signedBy ? (
                    `${w.signedBy}, ${fmt(w.signedOn)}`
                  ) : (
                    <Btn disabled={!canEdit || cur.status !== 'ACTIVE'} onClick={() => signPlacementWeek(cur.id, w.week)}>
                      Sign
                    </Btn>
                  )
              }
            ]}
          />
          {cur.status === 'ACTIVE' && (
            <Toolbar>
              <input className="form-control" style={{ flex: 1, minWidth: 200 }} placeholder="This week's work" value={week.summary} onChange={(e) => setWeek({ ...week, summary: e.target.value })} />
              <input className="form-control" style={{ width: 80 }} type="number" value={week.hours} onChange={(e) => setWeek({ ...week, hours: Number(e.target.value) })} aria-label="Hours" />
              <Btn disabled={!canEdit} onClick={() => logPlacementWeek(cur.id, week.summary, week.hours) && setWeek({ summary: '', hours: 40 })}>
                Add week
              </Btn>
            </Toolbar>
          )}
          <h4>Evaluation</h4>
          {cur.evaluation ? (
            <p>
              Overall {cur.evaluation.overall}% — {cur.evaluation.comment} ({cur.evaluation.by}, {fmt(cur.evaluation.on)})
            </p>
          ) : (
            <>
              <div className="sx-grid">
                {PLACEMENT_CRITERIA.map((c) => (
                  <Field key={c.id} label={`${c.label} (1–5)`}>
                    <input className="form-control" type="number" min={1} max={5} value={scores[c.id] ?? ''} onChange={(e) => setScores({ ...scores, [c.id]: Number(e.target.value) })} />
                  </Field>
                ))}
                <Field label="Supervisor's comment" span={2}>
                  <input className="form-control" value={comment} onChange={(e) => setComment(e.target.value)} />
                </Field>
              </div>
              <Toolbar>
                <Btn disabled={!canEdit || cur.status !== 'ACTIVE'} onClick={() => evaluatePlacement(cur.id, scores, comment)}>
                  Save evaluation
                </Btn>
              </Toolbar>
            </>
          )}
          <Timeline items={cur.history} />
        </Modal>
      )}
    </>
  );
};

/* ================================================================ Recruitment: aptitude tests and the careers portal */

export const AptitudeTestsTab: React.FC = () => {
  const { tenantVacancies, updateVacancy, candidates, recordTestScore } = useApp();
  const { canEdit } = useCanEdit();
  const [vid, setVid] = useState(tenantVacancies.find((v) => v.tests?.length)?.id ?? tenantVacancies[0]?.id ?? '');
  const [test, setTest] = useState({ name: '', passMark: 50 });
  const [score, setScore] = useState<Record<string, number>>({});
  const v = tenantVacancies.find((x) => x.id === vid);
  const pool = candidates.filter((c) => c.vacancyId === vid && !['Hired', 'Rejected', 'Withdrawn'].includes(String(c.stage)));
  return (
    <Panel
      title="Aptitude & skills tests"
      subtitle="Set the tests for a vacancy and their pass marks; candidates must pass every test before an interview can be booked."
      action={
        <select className="form-control" value={vid} onChange={(e) => setVid(e.target.value)} aria-label="Vacancy">
          {tenantVacancies.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title} ({x.id})
            </option>
          ))}
        </select>
      }
    >
      {v && (
        <>
          <Toolbar>
            {(v.tests ?? []).map((t) => (
              <span key={t.name} className="sx-pill sx-pill-info">
                <i />
                {t.name} · pass {t.passMark}%
              </span>
            ))}
            <input className="form-control" style={{ width: 200 }} placeholder="Test name" value={test.name} onChange={(e) => setTest({ ...test, name: e.target.value })} />
            <input className="form-control" style={{ width: 90 }} type="number" value={test.passMark} onChange={(e) => setTest({ ...test, passMark: Number(e.target.value) })} aria-label="Pass mark" />
            <Btn
              disabled={!canEdit || !test.name.trim() || !(test.passMark > 0 && test.passMark <= 100)}
              onClick={() => {
                updateVacancy(v.id, { tests: [...(v.tests ?? []).filter((t) => t.name !== test.name.trim()), { name: test.name.trim(), passMark: test.passMark }] });
                setTest({ name: '', passMark: 50 });
              }}
            >
              Add test
            </Btn>
          </Toolbar>
          <DataTable
            rows={pool}
            rowKey={(c) => c.id}
            empty="No open applicants for this vacancy."
            columns={[
              { key: 'n', header: 'Candidate', render: (c) => `${c.candidateName} · ${c.id}${c.exEmployee ? ` (former employee ${c.exEmployee.staffId})` : ''}` },
              { key: 's', header: 'Stage', render: (c) => String(c.stage) },
              ...(v.tests ?? []).map((t) => ({
                key: t.name,
                header: t.name,
                render: (c: (typeof pool)[number]) => {
                  const r = c.testResults?.find((x) => x.test === t.name);
                  return (
                    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {r && <StatusPill status={r.passed ? 'ACTIVE' : 'REJECTED'} label={`${r.score}%`} />}
                      <input className="form-control" style={{ width: 64 }} type="number" placeholder="%" value={score[`${c.id}|${t.name}`] ?? ''} onChange={(e) => setScore({ ...score, [`${c.id}|${t.name}`]: Number(e.target.value) })} aria-label={`${t.name} score`} />
                      <Btn disabled={!canEdit} onClick={() => recordTestScore(c.id, t.name, score[`${c.id}|${t.name}`] ?? -1)}>
                        Save
                      </Btn>
                    </span>
                  );
                }
              }))
            ]}
          />
        </>
      )}
    </Panel>
  );
};

/** Public careers page: open vacancies and the online application form (as the candidate sees it). */
export const CareersPortalTab: React.FC = () => {
  const { tenantVacancies, updateVacancy, addApplicant, candidates, activeTenant } = useApp();
  const { canEdit } = useCanEdit();
  const live = tenantVacancies.filter((v) => v.status === 'OPEN' && v.published !== false && v.closingDate >= todayIso());
  const [applyTo, setApplyTo] = useState<string | null>(null);
  const [a, setA] = useState({ candidateName: '', email: '', phone: '', experienceYears: 0, education: 'Degree', location: 'Kericho' });
  const [track, setTrack] = useState('');
  const mine = track.trim() ? candidates.filter((c) => c.email.toLowerCase() === track.trim().toLowerCase()) : [];
  const v = tenantVacancies.find((x) => x.id === applyTo);
  return (
    <>
      <Panel title={`Careers at ${activeTenant.name}`} subtitle="What candidates see on the public careers page. Applications land in the applicant pipeline with knock-out screening.">
        <div className="sx-stats">
          <Stat label="Open positions online" value={live.length} icon={<Briefcase size={16} />} />
          <Stat label="Online applications" value={candidates.filter((c) => c.source === 'Careers portal').length} icon={<Briefcase size={16} />} tone="blue" />
        </div>
        <DataTable
          rows={tenantVacancies.filter((x) => x.status === 'OPEN')}
          rowKey={(x) => x.id}
          columns={[
            { key: 't', header: 'Position', render: (x) => `${x.title} — ${x.department}` },
            { key: 'b', header: 'Location', render: (x) => x.branch },
            { key: 'c', header: 'Closes', render: (x) => fmt(x.closingDate) },
            { key: 'p', header: 'On careers page', render: (x) => <StatusPill status={x.published === false ? 'DRAFT' : 'ACTIVE'} label={x.published === false ? 'Hidden' : 'Published'} /> },
            {
              key: 'x',
              header: '',
              render: (x) => (
                <span style={{ display: 'flex', gap: 6 }}>
                  <Btn disabled={!canEdit} onClick={() => updateVacancy(x.id, { published: x.published === false })}>
                    {x.published === false ? 'Publish' : 'Unpublish'}
                  </Btn>
                  {x.published !== false && (
                    <Btn primary onClick={() => setApplyTo(x.id)}>
                      Apply online
                    </Btn>
                  )}
                </span>
              )
            }
          ]}
        />
      </Panel>
      <Panel title="Track my application" subtitle="Candidates check their status with the email they applied with.">
        <Toolbar>
          <input className="form-control" style={{ width: 280 }} placeholder="Email used to apply" value={track} onChange={(e) => setTrack(e.target.value)} />
        </Toolbar>
        {track.trim() && (
          <DataTable
            rows={mine}
            rowKey={(c) => c.id}
            empty="No application found for that email."
            columns={[
              { key: 'r', header: 'Position', render: (c) => c.appliedRole },
              { key: 'd', header: 'Applied', render: (c) => fmt(c.appliedDate) },
              { key: 's', header: 'Status', render: (c) => String(c.stage) },
              { key: 'm', header: 'Latest message', render: (c) => c.comms?.slice(-1)[0]?.subject ?? '—' }
            ]}
          />
        )}
      </Panel>
      {v && (
        <Modal
          title={`Apply: ${v.title}`}
          subtitle={`${v.department} · ${v.branch} · closes ${fmt(v.closingDate)}`}
          onClose={() => setApplyTo(null)}
          footer={
            <Btn
              primary
              disabled={!canEdit}
              onClick={() => {
                const created = addApplicant({ ...a, vacancyId: v.id, source: 'Careers portal', answers: Object.fromEntries(v.knockouts.map((k) => [k.id, true])) } as Parameters<typeof addApplicant>[0]);
                if (created) setApplyTo(null);
              }}
            >
              Submit application
            </Btn>
          }
        >
          <p style={{ whiteSpace: 'pre-wrap' }}>{v.adText}</p>
          <div className="sx-grid">
            <Field label="Full name" required>
              <input className="form-control" value={a.candidateName} onChange={(e) => setA({ ...a, candidateName: e.target.value })} />
            </Field>
            <Field label="Email" required>
              <input className="form-control" value={a.email} onChange={(e) => setA({ ...a, email: e.target.value })} />
            </Field>
            <Field label="Phone" required>
              <input className="form-control" value={a.phone} onChange={(e) => setA({ ...a, phone: e.target.value })} />
            </Field>
            <Field label="Years of experience">
              <input className="form-control" type="number" value={a.experienceYears} onChange={(e) => setA({ ...a, experienceYears: Number(e.target.value) })} />
            </Field>
            <Field label="Highest education">
              <select className="form-control" value={a.education} onChange={(e) => setA({ ...a, education: e.target.value })}>
                {['Certificate', 'Diploma', 'Degree', 'Masters', 'PhD'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Location">
              <input className="form-control" value={a.location} onChange={(e) => setA({ ...a, location: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
};

/* ================================================================ Talent: development plans and succession */

export const TalentTab: React.FC = () => {
  const { idps, saveIdp, agreeIdp, addIdpAction, completeIdpAction, successionPlans, saveSuccessionPlan } = useApp();
  const { nameOf } = useStaff();
  const { canEdit } = useCanEdit();
  const [idp, setIdp] = useState({ staffId: '', targetRole: '', careerPath: '', goals: '', reviewDate: '' });
  const [act, setAct] = useState<Record<string, { action: string; type: IdpAction['type']; due: string }>>({});
  const [sp, setSp] = useState({ position: '', incumbentStaffId: '', critical: true, riskOfLoss: 'MEDIUM' as SuccessionPlan['riskOfLoss'], successor: '', readiness: '1_2_YEARS' as SuccessionPlan['successors'][number]['readiness'] });
  const [add, setAdd] = useState<Record<string, { staffId: string; readiness: SuccessionPlan['successors'][number]['readiness'] }>>({});
  const noReady = successionPlans.filter((p) => p.critical && !p.successors.some((s) => s.readiness === 'READY_NOW'));
  return (
    <>
      <div className="sx-stats">
        <Stat label="Development plans" value={idps.length} detail={`${idps.reduce((n, p) => n + p.actions.filter((a) => a.status === 'OPEN').length, 0)} open actions`} icon={<Target size={16} />} />
        <Stat label="Critical positions" value={successionPlans.filter((p) => p.critical).length} icon={<ShieldAlert size={16} />} tone="blue" />
        <Stat label="No ready-now successor" value={noReady.length} detail={noReady.map((p) => p.position).join(', ') || 'all covered'} icon={<ShieldAlert size={16} />} tone={noReady.length ? 'red' : 'green'} />
      </div>
      <Panel title="Individual development plans" subtitle="Career path, target role and development actions; training actions go straight into the training needs plan.">
        <div className="sx-grid">
          <Field label="Employee" required>
            <StaffSelect value={idp.staffId} onChange={(v) => setIdp({ ...idp, staffId: v })} />
          </Field>
          <Field label="Target role" required>
            <input className="form-control" value={idp.targetRole} onChange={(e) => setIdp({ ...idp, targetRole: e.target.value })} />
          </Field>
          <Field label="Career path" span={2}>
            <input className="form-control" value={idp.careerPath} onChange={(e) => setIdp({ ...idp, careerPath: e.target.value })} placeholder="Current role → next → target" />
          </Field>
          <Field label="Development goals" span={2} required>
            <input className="form-control" value={idp.goals} onChange={(e) => setIdp({ ...idp, goals: e.target.value })} />
          </Field>
          <Field label="Review date">
            <input className="form-control" type="date" value={idp.reviewDate} onChange={(e) => setIdp({ ...idp, reviewDate: e.target.value })} />
          </Field>
        </div>
        <Toolbar>
          <Btn primary disabled={!canEdit} onClick={() => saveIdp(idp) && setIdp({ ...idp, targetRole: '', goals: '' })}>
            Save plan
          </Btn>
        </Toolbar>
        <DataTable
          rows={idps}
          rowKey={(p) => p.id}
          columns={[
            { key: 'e', header: 'Employee', render: (p) => `${nameOf(p.staffId)} → ${p.targetRole}` },
            { key: 'c', header: 'Career path', render: (p) => p.careerPath || '—' },
            {
              key: 'a',
              header: 'Actions',
              render: (p) => (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {p.actions.map((x) => (
                    <span key={x.id} style={{ fontSize: 12 }}>
                      {x.status === 'DONE' ? '✓' : '○'} {x.action} ({x.type}, {fmt(x.due)}){' '}
                      {x.status === 'OPEN' && (
                        <Btn disabled={!canEdit} onClick={() => completeIdpAction(p.id, x.id)}>
                          Done
                        </Btn>
                      )}
                    </span>
                  ))}
                  {p.status !== 'CLOSED' && (
                    <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      <input className="form-control" style={{ width: 160 }} placeholder="New action" value={act[p.id]?.action ?? ''} onChange={(e) => setAct({ ...act, [p.id]: { ...(act[p.id] ?? { type: 'Training', due: '' }), action: e.target.value } })} />
                      <select className="form-control" style={{ width: 130 }} value={act[p.id]?.type ?? 'Training'} onChange={(e) => setAct({ ...act, [p.id]: { ...(act[p.id] ?? { action: '', due: '' }), type: e.target.value as IdpAction['type'] } })}>
                        {(['Training', 'Mentoring', 'Stretch assignment', 'Job rotation', 'Certification'] as const).map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <input className="form-control" style={{ width: 140 }} type="date" value={act[p.id]?.due ?? ''} onChange={(e) => setAct({ ...act, [p.id]: { ...(act[p.id] ?? { action: '', type: 'Training' }), due: e.target.value } })} />
                      <Btn disabled={!canEdit} onClick={() => addIdpAction(p.id, act[p.id] ?? { action: '', type: 'Training', due: '' })}>
                        Add
                      </Btn>
                    </span>
                  )}
                </span>
              )
            },
            { key: 's', header: 'Status', render: (p) => <StatusPill status={p.status} /> },
            {
              key: 'x',
              header: '',
              render: (p) =>
                p.status === 'DRAFT' ? (
                  <Btn disabled={!canEdit} onClick={() => agreeIdp(p.id)}>
                    Agree (manager)
                  </Btn>
                ) : (
                  <span className="muted">{p.agreedBy ? `Agreed by ${p.agreedBy}` : ''}</span>
                )
            }
          ]}
        />
      </Panel>
      <Panel title="Succession plans" subtitle="Key and critical positions, nominated successors with readiness, and risk of losing the incumbent.">
        <div className="sx-grid">
          <Field label="Position" required>
            <input className="form-control" value={sp.position} onChange={(e) => setSp({ ...sp, position: e.target.value })} />
          </Field>
          <Field label="Incumbent" required>
            <StaffSelect value={sp.incumbentStaffId} onChange={(v) => setSp({ ...sp, incumbentStaffId: v })} label="Incumbent" />
          </Field>
          <Field label="Risk of loss">
            <select className="form-control" value={sp.riskOfLoss} onChange={(e) => setSp({ ...sp, riskOfLoss: e.target.value as SuccessionPlan['riskOfLoss'] })}>
              <option>LOW</option>
              <option>MEDIUM</option>
              <option>HIGH</option>
            </select>
          </Field>
          <Field label="Critical position">
            <select className="form-control" value={sp.critical ? 'yes' : 'no'} onChange={(e) => setSp({ ...sp, critical: e.target.value === 'yes' })}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="First successor">
            <StaffSelect value={sp.successor} onChange={(v) => setSp({ ...sp, successor: v })} label="Successor" />
          </Field>
          <Field label="Readiness">
            <select className="form-control" value={sp.readiness} onChange={(e) => setSp({ ...sp, readiness: e.target.value as typeof sp.readiness })}>
              {Object.entries(READINESS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Toolbar>
          <Btn
            primary
            disabled={!canEdit}
            onClick={() =>
              saveSuccessionPlan({ position: sp.position, incumbentStaffId: sp.incumbentStaffId, critical: sp.critical, riskOfLoss: sp.riskOfLoss, successors: sp.successor ? [{ staffId: sp.successor, readiness: sp.readiness }] : [] }) &&
              setSp({ ...sp, position: '', successor: '' })
            }
          >
            Save succession plan
          </Btn>
        </Toolbar>
        <DataTable
          rows={successionPlans}
          rowKey={(p) => p.id}
          columns={[
            { key: 'p', header: 'Position', render: (p) => `${p.position}${p.critical ? ' (critical)' : ''}` },
            { key: 'i', header: 'Incumbent', render: (p) => nameOf(p.incumbentStaffId) },
            { key: 'r', header: 'Risk of loss', render: (p) => <StatusPill status={p.riskOfLoss === 'HIGH' ? 'OVERDUE' : p.riskOfLoss === 'MEDIUM' ? 'PENDING' : 'ACTIVE'} label={p.riskOfLoss} /> },
            { key: 's', header: 'Successors', render: (p) => p.successors.map((s) => `${nameOf(s.staffId)} (${READINESS_LABEL[s.readiness]})`).join(', ') || '—' },
            {
              key: 'x',
              header: 'Add successor',
              render: (p) => (
                <span style={{ display: 'flex', gap: 4 }}>
                  <StaffSelect value={add[p.id]?.staffId ?? ''} onChange={(v) => setAdd({ ...add, [p.id]: { staffId: v, readiness: add[p.id]?.readiness ?? '1_2_YEARS' } })} label="Successor" />
                  <select className="form-control" style={{ width: 110 }} value={add[p.id]?.readiness ?? '1_2_YEARS'} onChange={(e) => setAdd({ ...add, [p.id]: { staffId: add[p.id]?.staffId ?? '', readiness: e.target.value as typeof sp.readiness } })}>
                    {Object.entries(READINESS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <Btn disabled={!canEdit || !add[p.id]?.staffId} onClick={() => saveSuccessionPlan({ ...p, successors: [...p.successors, { staffId: add[p.id].staffId, readiness: add[p.id].readiness }] })}>
                    Add
                  </Btn>
                </span>
              )
            },
            { key: 'v', header: 'Reviewed', render: (p) => `${fmt(p.reviewedOn)} · ${p.reviewedBy}` }
          ]}
        />
      </Panel>
    </>
  );
};
