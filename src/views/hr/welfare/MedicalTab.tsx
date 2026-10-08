import React, { useMemo, useState } from 'react';
import { AlertTriangle, Banknote, CalendarClock, Plus, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { ageOn, CHILD_AGE_LIMIT, CLAIM_STATUS_LABEL, CLAIM_TYPE_LABEL, MEDICAL_CLAIM_TYPES, type ClaimStatus, type ClaimType, type Dependant, type MedicalClaim, type MedicalMember, type MedicalScheme } from '../../../data/welfareSeed';
import { Bar, Card, daysBetween, Drawer, Empty, Field, FilterPills, fmt, kes, Modal, Person, Pill, SearchBox, StaffSelect, useWfOrg, type Tone } from './shared';

const STATUS_TONE: Record<ClaimStatus, Tone> = { SUBMITTED: 'warning', WITH_INSURER: 'info', PAID: 'success', REJECTED: 'critical' };

/** Approved (paid) and pending amounts a member family has used this policy period, by claim type */
export const useUtilisation = () => {
  const { medicalClaims, medicalSchemes } = useApp();
  return useMemo(() => {
    const map = new Map<string, Partial<Record<ClaimType, { used: number; pending: number }>>>();
    for (const c of medicalClaims) {
      const s = medicalSchemes.find((x) => x.id === c.schemeId);
      if (!s || c.serviceOn < s.startOn || c.serviceOn > s.endOn || c.status === 'REJECTED') continue;
      const key = `${c.schemeId}|${c.staffId}`;
      const row = map.get(key) ?? {};
      const cell = row[c.type] ?? { used: 0, pending: 0 };
      if (c.status === 'PAID') cell.used += c.approved ?? 0;
      else cell.pending += c.claimed;
      row[c.type] = cell;
      map.set(key, row);
    }
    return (schemeId: string, staffId: string) => map.get(`${schemeId}|${staffId}`) ?? {};
  }, [medicalClaims, medicalSchemes]);
};

export const schemeAlert = (s: MedicalScheme, today: string) => {
  const left = daysBetween(today, s.endOn);
  return left < 0 ? { text: `Expired ${-left}d ago`, tone: 'critical' as Tone, due: true } : left <= 60 ? { text: `Renew in ${left}d`, tone: 'warning' as Tone, due: true } : { text: `Runs to ${fmt(s.endOn)}`, tone: 'success' as Tone, due: false };
};

export const MedicalTab: React.FC = () => {
  const { medicalSchemes, medicalMembers, medicalClaims } = useApp();
  const org = useWfOrg();
  const schemes = useMemo(() => medicalSchemes.filter((s) => s.orgId === org.orgId), [medicalSchemes, org.orgId]);
  const members = useMemo(() => medicalMembers.filter((m) => m.orgId === org.orgId), [medicalMembers, org.orgId]);
  const claims = useMemo(() => medicalClaims.filter((c) => c.orgId === org.orgId), [medicalClaims, org.orgId]);
  const util = useUtilisation();
  const [renew, setRenew] = useState<MedicalScheme | null>(null);

  const overAge = members.flatMap((m) => m.dependants.filter((x) => x.relationship === 'Child' && ageOn(x.dob, org.today) > CHILD_AGE_LIMIT).map((x) => ({ m, x })));
  const slowClaims = claims.filter((c) => c.status === 'WITH_INSURER' && daysBetween(c.submittedOn, org.today) > 30);
  const toRefund = claims.filter((c) => c.status === 'PAID' && c.outOfPocket && !c.reimbursedPeriod && (c.approved ?? 0) > 0);
  const expiring = schemes.filter((s) => schemeAlert(s, org.today).due);

  if (!schemes.length)
    return (
      <Card title="Medical cover & claims" sub="No medical, GPA or GLA policies are recorded for this company yet.">
        <p className="hi-sub">Policies, members and claims are kept per company. Switch to Kericho Highland Estates to see the demo data.</p>
      </Card>
    );

  return (
    <>
      {(expiring.length > 0 || overAge.length > 0 || slowClaims.length > 0 || toRefund.length > 0) && (
        <div className="wf-alerts">
          {expiring.map((s) => (
            <div key={s.id} className={`pr-note ${schemeAlert(s, org.today).tone === 'critical' ? 'bad' : 'warn'}`}>
              <CalendarClock size={14} /> {s.insurer} — {s.name} ({s.policyNo}) ends {fmt(s.endOn)}. Get renewal terms and confirm the member list.
            </div>
          ))}
          {overAge.length > 0 && (
            <div className="pr-note warn">
              <AlertTriangle size={14} /> {overAge.length} child dependant{overAge.length > 1 ? 's are' : ' is'} over {CHILD_AGE_LIMIT}: {overAge.map(({ m, x }) => `${x.name} (${org.name(m.staffId)})`).join(', ')}. Remove at renewal unless in full-time education.
            </div>
          )}
          {slowClaims.length > 0 && (
            <div className="pr-note warn">
              <AlertTriangle size={14} /> {slowClaims.length} claim{slowClaims.length > 1 ? 's have' : ' has'} been with the insurer over 30 days: {slowClaims.map((c) => c.ref).join(', ')}.
            </div>
          )}
          {toRefund.length > 0 && (
            <div className="pr-note">
              <Banknote size={14} /> {toRefund.length} paid claim{toRefund.length > 1 ? 's' : ''} to refund to staff through payroll: {toRefund.map((c) => c.ref).join(', ')}.
            </div>
          )}
        </div>
      )}

      <div className="wf-grid-2">
        {schemes.map((s) => {
          const a = schemeAlert(s, org.today);
          const sm = members.filter((m) => m.schemeId === s.id && m.status === 'ACTIVE');
          const isMed = s.kind === 'MEDICAL';
          const headcount = isMed ? sm.length : org.staff.length;
          const premium = isMed ? sm.reduce((t, m) => t + (s.classes.find((c) => c.id === m.classId)?.premiumPerMember ?? 0), 0) : headcount * (s.classes[0]?.premiumPerMember ?? 0);
          const types = (Object.keys(CLAIM_TYPE_LABEL) as ClaimType[]).filter((t) => s.classes.some((c) => c.limits[t] !== undefined));
          return (
            <Card
              key={s.id}
              title={`${s.insurer}`}
              sub={`${s.name} · ${s.policyNo} · ${fmt(s.startOn)} – ${fmt(s.endOn)}`}
              actions={
                <>
                  <Pill tone={a.tone}>{a.text}</Pill>
                  <button className="btn btn-secondary btn-sm" onClick={() => setRenew(s)}>
                    <RefreshCw size={13} /> Renew
                  </button>
                </>
              }
            >
              <div className="hi-scroll">
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Cover class</th>
                      {types.map((t) => (
                        <th key={t} className="num">
                          {CLAIM_TYPE_LABEL[t]}
                        </th>
                      ))}
                      <th className="num">Premium / member</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.classes.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.label}</strong>
                          <div className="hi-sub">{c.grades}</div>
                        </td>
                        {types.map((t) => (
                          <td key={t} className="num hi-mono">
                            {c.limits[t] !== undefined ? (c.limits[t] ?? 0).toLocaleString() : '—'}
                          </td>
                        ))}
                        <td className="num hi-mono">{c.premiumPerMember.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pr-kv wf-mt">
                <div>
                  <span>{isMed ? 'Members' : 'Covered staff'}</span>
                  <strong>{headcount}</strong>
                  {isMed && <small>{sm.reduce((t, m) => t + m.dependants.length, 0)} dependants</small>}
                </div>
                <div>
                  <span>Annual premium</span>
                  <strong>{kes(premium)}</strong>
                  {s.history[0] && <small>Last renewal {s.history[0].premiumChangePct >= 0 ? '+' : ''}{s.history[0].premiumChangePct}%</small>}
                </div>
                <div>
                  <span>Claims this period</span>
                  <strong>{claims.filter((c) => c.schemeId === s.id && c.serviceOn >= s.startOn).length}</strong>
                  <small>{kes(claims.filter((c) => c.schemeId === s.id && c.status === 'PAID' && c.serviceOn >= s.startOn).reduce((t, c) => t + (c.approved ?? 0), 0))} paid</small>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <MembersCard schemes={schemes} members={members} util={util} />
      <ClaimsCard schemes={schemes} members={members} claims={claims} />
      {renew && <RenewModal s={renew} onClose={() => setRenew(null)} />}
    </>
  );
};

const RenewModal: React.FC<{ s: MedicalScheme; onClose: () => void }> = ({ s, onClose }) => {
  const { renewMedicalScheme } = useApp();
  const [pct, setPct] = useState(7);
  return (
    <Modal
      title={`Renew ${s.name}`}
      subtitle={`${s.insurer} · current period ${fmt(s.startOn)} – ${fmt(s.endOn)}`}
      onClose={onClose}
      width={520}
      footer={
        <button
          className="btn btn-primary"
          onClick={() => {
            renewMedicalScheme(s.id, pct);
            onClose();
          }}
        >
          Record renewal
        </button>
      }
    >
      <Field label="Premium change at renewal (%)" hint="Negative for a reduction. Limits stay the same; edit them with the insurer’s new schedule.">
        <input className="form-control" type="number" step={0.5} value={pct} onChange={(ev) => setPct(Number(ev.target.value))} />
      </Field>
      <div className="pr-kv">
        {s.classes.map((c) => (
          <div key={c.id}>
            <span>{c.label}</span>
            <strong>{kes(Math.round((c.premiumPerMember * (1 + pct / 100)) / 100) * 100)}</strong>
            <small>was {kes(c.premiumPerMember)}</small>
          </div>
        ))}
      </div>
    </Modal>
  );
};

const MembersCard: React.FC<{ schemes: MedicalScheme[]; members: MedicalMember[]; util: ReturnType<typeof useUtilisation> }> = ({ schemes, members, util }) => {
  const org = useWfOrg();
  const medical = schemes.filter((s) => s.kind === 'MEDICAL');
  const [schemeId, setSchemeId] = useState(medical[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const scheme = medical.find((s) => s.id === schemeId) ?? medical[0];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return members
      .filter((m) => m.schemeId === scheme?.id && (cls === 'ALL' || m.classId === cls))
      .filter((m) => !s || `${org.name(m.staffId)} ${m.staffId} ${m.memberNo}`.toLowerCase().includes(s))
      .sort((a, b) => org.name(a.staffId).localeCompare(org.name(b.staffId)));
  }, [members, scheme, cls, q, org]);
  const pg = usePaged(rows, 10, `${schemeId}|${cls}|${q}|${org.orgId}`);
  const current = members.find((m) => m.id === openId);
  if (!scheme) return null;

  return (
    <Card
      title="Members & dependants"
      sub="Employees on the medical scheme with their cover class, dependants and how much of each limit the family has used this policy period."
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setEnrolling(true)}>
          <UserPlus size={14} /> Enrol employee
        </button>
      }
    >
      <div className="digicraft-toolbar wf-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search member name, staff ID or member no." />
        <FilterPills value={cls} onChange={setCls} options={[{ id: 'ALL', label: 'All classes', n: members.filter((m) => m.schemeId === scheme.id).length }, ...scheme.classes.map((c) => ({ id: c.id, label: c.label, n: members.filter((m) => m.schemeId === scheme.id && m.classId === c.id).length }))]} />
        {medical.length > 1 && (
          <select className="form-control hi-select-sm" value={schemeId} onChange={(ev) => setSchemeId(ev.target.value)} aria-label="Scheme">
            {medical.map((s) => (
              <option key={s.id} value={s.id}>
                {s.insurer}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="hi-scroll">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Class</th>
              <th>Dependants</th>
              <th className="wf-util-col">Inpatient used</th>
              <th className="wf-util-col">Outpatient used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pg.total === 0 && <Empty cols={6}>No members match.</Empty>}
            {pg.rows.map((m) => {
              const c = scheme.classes.find((x) => x.id === m.classId);
              const u = util(scheme.id, m.staffId);
              const cell = (t: ClaimType) => {
                const lim = c?.limits[t] ?? 0;
                const used = u[t]?.used ?? 0;
                return (
                  <td>
                    <Bar pct={lim ? (used / lim) * 100 : 0} />
                    <div className="hi-sub">
                      {used.toLocaleString()} of {lim.toLocaleString()}
                      {u[t]?.pending ? ` · ${u[t]?.pending.toLocaleString()} pending` : ''}
                    </div>
                  </td>
                );
              };
              return (
                <tr key={m.id}>
                  <td>
                    <Person id={m.staffId} name={org.name} sub={m.memberNo} />
                    {m.status === 'SUSPENDED' && <Pill tone="warning">Suspended</Pill>}
                  </td>
                  <td>{c?.label ?? m.classId}</td>
                  <td>
                    {m.dependants.length === 0 ? <span className="hi-sub">Employee only</span> : <span title={m.dependants.map((x) => `${x.name} (${x.relationship})`).join(', ')}>{familyLabel(m.dependants)}</span>}
                  </td>
                  {cell('INPATIENT')}
                  {cell('OUTPATIENT')}
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => setOpenId(m.id)}>
                      Manage
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="members" sizes={[10, 25, 50]} />
      {current && <MemberDrawer m={current} scheme={scheme} util={util} onClose={() => setOpenId(null)} />}
      {enrolling && <EnrolModal scheme={scheme} members={members} onClose={() => setEnrolling(false)} />}
    </Card>
  );
};

const EnrolModal: React.FC<{ scheme: MedicalScheme; members: MedicalMember[]; onClose: () => void }> = ({ scheme, members, onClose }) => {
  const { enrolMedicalMember } = useApp();
  const org = useWfOrg();
  const eligible = org.staff.filter((e) => !members.some((m) => m.schemeId === scheme.id && m.staffId === e.staffId) && !/casual|daily/i.test(e.contractType));
  const [staffId, setStaffId] = useState('');
  const pick = (id: string) => {
    setStaffId(id);
    const e = org.byId.get(id);
    if (e) setClassId(e.basicSalaryKes >= 120_000 && scheme.classes.some((c) => c.id === 'MGMT') ? 'MGMT' : scheme.classes[scheme.classes.length - 1].id);
  };
  const [classId, setClassId] = useState(scheme.classes[scheme.classes.length - 1]?.id ?? '');
  return (
    <Modal
      title={`Enrol on ${scheme.insurer}`}
      subtitle={`${scheme.name} · ${scheme.policyNo}`}
      onClose={onClose}
      width={560}
      footer={
        <button
          className="btn btn-primary"
          disabled={!staffId || !classId}
          onClick={() => {
            if (enrolMedicalMember(staffId, scheme.id, classId)) onClose();
          }}
        >
          Enrol
        </button>
      }
    >
      <div className="pr-form-grid">
        <Field label="Employee" hint={`${eligible.length} permanent and contract staff not yet on the scheme`}>
          <StaffSelect value={staffId} onChange={pick} staff={eligible} />
        </Field>
        <Field label="Cover class">
          <select className="form-control" value={classId} onChange={(ev) => setClassId(ev.target.value)}>
            {scheme.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} — {c.grades}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="hi-sub">Add the spouse and children from Manage once enrolled.</p>
    </Modal>
  );
};

const MemberDrawer: React.FC<{ m: MedicalMember; scheme: MedicalScheme; util: ReturnType<typeof useUtilisation>; onClose: () => void }> = ({ m, scheme, util, onClose }) => {
  const { addMedicalDependant, removeMedicalDependant, setMedicalMemberClass, setMedicalMemberStatus } = useApp();
  const org = useWfOrg();
  const c = scheme.classes.find((x) => x.id === m.classId);
  const u = util(scheme.id, m.staffId);
  const [dep, setDep] = useState<Omit<Dependant, 'id'>>({ name: '', relationship: 'Child', dob: '' });
  return (
    <Drawer title={org.name(m.staffId)} subtitle={`${m.staffId} · ${m.memberNo} · enrolled ${fmt(m.enrolledOn)}`} onClose={onClose}>
      <div className="pr-form-grid">
        <Field label="Cover class">
          <select className="form-control" value={m.classId} onChange={(ev) => setMedicalMemberClass(m.id, ev.target.value)}>
            {scheme.classes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="form-control" value={m.status} onChange={(ev) => setMedicalMemberStatus(m.id, ev.target.value as MedicalMember['status'])}>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </Field>
      </div>

      <div className="wf-section">
        <h4>Limit utilisation ({fmt(scheme.startOn)} – {fmt(scheme.endOn)})</h4>
        <table className="hr-table">
          <thead>
            <tr>
              <th>Benefit</th>
              <th className="num">Limit</th>
              <th className="num">Used</th>
              <th className="num">Pending</th>
              <th className="wf-util-col">Balance</th>
            </tr>
          </thead>
          <tbody>
            {MEDICAL_CLAIM_TYPES.map((t) => {
              const lim = c?.limits[t] ?? 0;
              const used = u[t]?.used ?? 0;
              return (
                <tr key={t}>
                  <td>{CLAIM_TYPE_LABEL[t]}</td>
                  <td className="num hi-mono">{lim.toLocaleString()}</td>
                  <td className="num hi-mono">{used.toLocaleString()}</td>
                  <td className="num hi-mono">{(u[t]?.pending ?? 0).toLocaleString()}</td>
                  <td>
                    <Bar pct={lim ? (used / lim) * 100 : 0} />
                    <div className="hi-sub">{kes(Math.max(0, lim - used))} left</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="wf-section">
        <h4>Dependants</h4>
        <table className="hr-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Relationship</th>
              <th>Date of birth</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {m.dependants.length === 0 && <Empty cols={4}>Employee only.</Empty>}
            {m.dependants.map((x) => {
              const age = ageOn(x.dob, org.today);
              return (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td>{x.relationship}</td>
                  <td>
                    {fmt(x.dob)} <span className="hi-sub">({age} yrs)</span>
                    {x.relationship === 'Child' && age > CHILD_AGE_LIMIT && <Pill tone="warning">Over age limit</Pill>}
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" aria-label={`Remove ${x.name}`} onClick={() => removeMedicalDependant(m.id, x.id)}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="wf-inline wf-wrap wf-mt">
          <input className="form-control grow" value={dep.name} onChange={(ev) => setDep({ ...dep, name: ev.target.value })} placeholder="Full name" aria-label="Dependant name" />
          <select className="form-control" value={dep.relationship} onChange={(ev) => setDep({ ...dep, relationship: ev.target.value as Dependant['relationship'] })} aria-label="Relationship">
            <option>Spouse</option>
            <option>Child</option>
          </select>
          <input className="form-control" type="date" max={org.today} value={dep.dob} onChange={(ev) => setDep({ ...dep, dob: ev.target.value })} aria-label="Date of birth" />
          <button
            className="btn btn-secondary btn-sm"
            disabled={!dep.name.trim() || !dep.dob}
            onClick={() => {
              addMedicalDependant(m.id, { ...dep, name: dep.name.trim() });
              setDep({ name: '', relationship: 'Child', dob: '' });
            }}
          >
            <Plus size={13} /> Add dependant
          </button>
        </div>
      </div>
    </Drawer>
  );
};

const familyLabel = (deps: Dependant[]) => {
  const kids = deps.filter((x) => x.relationship === 'Child').length;
  const spouse = deps.some((x) => x.relationship === 'Spouse');
  return [spouse ? 'Spouse' : '', kids ? `${kids} ${kids > 1 ? 'children' : 'child'}` : ''].filter(Boolean).join(' + ');
};

type ClaimFilter = 'OPEN' | 'PAID' | 'REJECTED' | 'REFUND' | 'ALL';

const ClaimsCard: React.FC<{ schemes: MedicalScheme[]; members: MedicalMember[]; claims: MedicalClaim[] }> = ({ schemes, members, claims }) => {
  const { reimburseMedicalClaim, payrollOpenPeriod } = useApp();
  const org = useWfOrg();
  const [filter, setFilter] = useState<ClaimFilter>('OPEN');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState<{ c: MedicalClaim; mode: 'send' | 'pay' | 'reject' } | null>(null);
  const toRefund = (c: MedicalClaim) => c.status === 'PAID' && c.outOfPocket && !c.reimbursedPeriod && (c.approved ?? 0) > 0;
  const patientName = (c: MedicalClaim) => {
    if (!c.patientId) return 'Self';
    const d = members.find((m) => m.staffId === c.staffId)?.dependants.find((x) => x.id === c.patientId);
    return d ? `${d.name} (${d.relationship.toLowerCase()})` : 'Dependant';
  };
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return claims
      .filter((c) => (filter === 'ALL' ? true : filter === 'OPEN' ? c.status === 'SUBMITTED' || c.status === 'WITH_INSURER' : filter === 'REFUND' ? toRefund(c) : c.status === filter))
      .filter((c) => !s || `${c.ref} ${org.name(c.staffId)} ${c.staffId} ${c.provider} ${CLAIM_TYPE_LABEL[c.type]}`.toLowerCase().includes(s))
      .sort((a, b) => b.submittedOn.localeCompare(a.submittedOn));
  }, [claims, filter, q, org]);
  const pg = usePaged(rows, 10, `${filter}|${q}|${org.orgId}`);

  return (
    <Card
      title="Insurance claims"
      sub={`Medical, GPA and GLA claims from submission to payment. Where the employee paid the provider, the approved amount is refunded through payroll as an expense reimbursement (open period: ${payrollOpenPeriod.label}).`}
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          <Plus size={14} /> New claim
        </button>
      }
    >
      <div className="digicraft-toolbar wf-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search ref, member or provider" />
        <FilterPills
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'OPEN', label: 'In progress', n: claims.filter((c) => c.status === 'SUBMITTED' || c.status === 'WITH_INSURER').length },
            { id: 'REFUND', label: 'To refund', n: claims.filter(toRefund).length },
            { id: 'PAID', label: 'Paid', n: claims.filter((c) => c.status === 'PAID').length },
            { id: 'REJECTED', label: 'Rejected', n: claims.filter((c) => c.status === 'REJECTED').length },
            { id: 'ALL', label: 'All', n: claims.length }
          ]}
        />
      </div>
      <div className="hi-scroll">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Claim</th>
              <th>Member · patient</th>
              <th>Provider</th>
              <th className="num">Claimed</th>
              <th className="num">Approved</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pg.total === 0 && <Empty cols={7}>No claims match.</Empty>}
            {pg.rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="wf-person">
                    <strong>{c.ref}</strong>
                    <span>
                      {CLAIM_TYPE_LABEL[c.type]} · {schemes.find((s) => s.id === c.schemeId)?.insurer ?? ''}
                    </span>
                  </div>
                </td>
                <td>
                  <Person id={c.staffId} name={org.name} sub={patientName(c)} />
                </td>
                <td>
                  {c.provider}
                  <div className="hi-sub">
                    {fmt(c.serviceOn)}
                    {c.outOfPocket ? ' · paid by employee' : ' · direct to provider'}
                  </div>
                </td>
                <td className="num hi-mono">{c.claimed.toLocaleString()}</td>
                <td className="num hi-mono">{c.approved !== undefined ? c.approved.toLocaleString() : '—'}</td>
                <td>
                  <Pill tone={STATUS_TONE[c.status]}>{CLAIM_STATUS_LABEL[c.status]}</Pill>
                  {c.insurerRef && <div className="hi-sub">{c.insurerRef}</div>}
                  {c.rejectionReason && <div className="hi-sub">{c.rejectionReason}</div>}
                  {c.reimbursedPeriod && <div className="hi-sub">Refunded in payroll {c.reimbursedPeriod}</div>}
                </td>
                <td className="wf-actions">
                  {c.status === 'SUBMITTED' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setAction({ c, mode: 'send' })}>
                      Send to insurer
                    </button>
                  )}
                  {c.status === 'WITH_INSURER' && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => setAction({ c, mode: 'pay' })}>
                        Paid
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setAction({ c, mode: 'reject' })}>
                        Rejected
                      </button>
                    </>
                  )}
                  {toRefund(c) && (
                    <button className="btn btn-primary btn-sm" onClick={() => reimburseMedicalClaim(c.id)} title={`Posts KES ${(c.approved ?? 0).toLocaleString()} as Expense reimbursement to ${payrollOpenPeriod.label}`}>
                      <Banknote size={13} /> Refund via payroll
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="claims" sizes={[10, 25, 50]} />
      {adding && <NewClaimModal schemes={schemes} members={members} onClose={() => setAdding(false)} />}
      {action && <ClaimActionModal c={action.c} mode={action.mode} schemes={schemes} members={members} onClose={() => setAction(null)} />}
    </Card>
  );
};

const NewClaimModal: React.FC<{ schemes: MedicalScheme[]; members: MedicalMember[]; onClose: () => void }> = ({ schemes, members, onClose }) => {
  const { addMedicalClaim } = useApp();
  const org = useWfOrg();
  const [type, setType] = useState<ClaimType>('OUTPATIENT');
  const isGpa = type === 'GPA' || type === 'GLA';
  const scheme = schemes.find((s) => (isGpa ? s.kind === 'GPA_GLA' : s.kind === 'MEDICAL'));
  const [staffId, setStaffId] = useState('');
  const [patientId, setPatientId] = useState('');
  const [provider, setProvider] = useState('');
  const [serviceOn, setServiceOn] = useState(org.today);
  const [claimed, setClaimed] = useState(0);
  const [outOfPocket, setOop] = useState(true);
  const [note, setNote] = useState('');
  const member = members.find((m) => m.schemeId === scheme?.id && m.staffId === staffId);
  const people = isGpa ? org.staff : org.staff.filter((e) => members.some((m) => m.schemeId === scheme?.id && m.staffId === e.staffId && m.status === 'ACTIVE'));
  const limit = scheme?.classes.find((c) => c.id === (member?.classId ?? 'ALL'))?.limits[type];

  return (
    <Modal
      title="New insurance claim"
      subtitle={scheme ? `${scheme.insurer} · ${scheme.policyNo}` : 'No policy for this claim type'}
      onClose={onClose}
      width={680}
      footer={
        <button
          className="btn btn-primary"
          disabled={!scheme || !staffId || !provider.trim() || claimed <= 0}
          onClick={() => {
            if (!scheme) return;
            const c = addMedicalClaim({ schemeId: scheme.id, staffId, patientId: patientId || undefined, type, provider: provider.trim(), serviceOn, claimed, outOfPocket: isGpa ? false : outOfPocket, note: note.trim() || undefined });
            if (c) onClose();
          }}
        >
          Submit claim
        </button>
      }
    >
      <div className="pr-form-grid">
        <Field label="Claim type">
          <select
            className="form-control"
            value={type}
            onChange={(ev) => {
              setType(ev.target.value as ClaimType);
              setPatientId('');
            }}
          >
            {(Object.keys(CLAIM_TYPE_LABEL) as ClaimType[]).map((t) => (
              <option key={t} value={t}>
                {CLAIM_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={isGpa ? 'Employee' : 'Member'} hint={isGpa ? 'GPA and GLA cover every employee' : 'Only employees on the medical scheme'}>
          <StaffSelect
            value={staffId}
            onChange={(v) => {
              setStaffId(v);
              setPatientId('');
            }}
            staff={people}
          />
        </Field>
        {!isGpa && (
          <Field label="Patient">
            <select className="form-control" value={patientId} onChange={(ev) => setPatientId(ev.target.value)} disabled={!member}>
              <option value="">The employee</option>
              {member?.dependants.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({x.relationship.toLowerCase()})
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Provider">
          <input className="form-control" value={provider} onChange={(ev) => setProvider(ev.target.value)} placeholder="Hospital, clinic or pharmacy" />
        </Field>
        <Field label={isGpa ? 'Date of accident or event' : 'Date of treatment'}>
          <input className="form-control" type="date" max={org.today} value={serviceOn} onChange={(ev) => setServiceOn(ev.target.value)} />
        </Field>
        <Field label="Amount claimed (KES)" hint={limit !== undefined ? `Limit for this class: ${kes(limit)}` : undefined}>
          <input className="form-control" type="number" min={0} value={claimed || ''} onChange={(ev) => setClaimed(Number(ev.target.value))} />
        </Field>
        <Field label="Notes" wide>
          <input className="form-control" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Diagnosis, nights admitted, OSH incident ref…" />
        </Field>
      </div>
      {!isGpa && (
        <label className="wf-check">
          <input type="checkbox" checked={outOfPocket} onChange={(ev) => setOop(ev.target.checked)} />
          The employee paid the provider — refund the approved amount through payroll
        </label>
      )}
    </Modal>
  );
};

const ClaimActionModal: React.FC<{ c: MedicalClaim; mode: 'send' | 'pay' | 'reject'; schemes: MedicalScheme[]; members: MedicalMember[]; onClose: () => void }> = ({ c, mode, schemes, members, onClose }) => {
  const { sendMedicalClaim, payMedicalClaim, rejectMedicalClaim } = useApp();
  const org = useWfOrg();
  const scheme = schemes.find((s) => s.id === c.schemeId);
  const member = members.find((m) => m.schemeId === c.schemeId && m.staffId === c.staffId);
  const limit = scheme?.classes.find((x) => x.id === (member?.classId ?? 'ALL'))?.limits[c.type];
  const [text, setText] = useState(mode === 'send' ? c.insurerRef ?? '' : '');
  const [amount, setAmount] = useState(limit !== undefined ? Math.min(c.claimed, limit) : c.claimed);
  const title = mode === 'send' ? 'Send to insurer' : mode === 'pay' ? 'Record payment' : 'Record rejection';
  const submit = () => {
    if (mode === 'send') sendMedicalClaim(c.id, text);
    else if (mode === 'pay') payMedicalClaim(c.id, amount);
    else rejectMedicalClaim(c.id, text);
    onClose();
  };
  return (
    <Modal
      title={`${title} · ${c.ref}`}
      subtitle={`${org.name(c.staffId)} · ${CLAIM_TYPE_LABEL[c.type]} · claimed ${kes(c.claimed)}`}
      onClose={onClose}
      width={520}
      footer={
        <button className="btn btn-primary" disabled={(mode === 'pay' && !(amount >= 0)) || (mode === 'reject' && !text.trim())} onClick={submit}>
          {title}
        </button>
      }
    >
      {mode === 'send' && (
        <Field label="Insurer claim reference">
          <input className="form-control" value={text} onChange={(ev) => setText(ev.target.value)} placeholder="e.g. JHI-CLM-90412" />
        </Field>
      )}
      {mode === 'pay' && (
        <>
          <Field label="Amount approved by the insurer (KES)" hint={limit !== undefined ? `Class limit ${kes(limit)}` : undefined}>
            <input className="form-control" type="number" min={0} value={amount} onChange={(ev) => setAmount(Number(ev.target.value))} />
          </Field>
          {c.outOfPocket && <div className="pr-note">The employee paid the provider. After saving, use “Refund via payroll” to add the approved amount to their next payslip.</div>}
        </>
      )}
      {mode === 'reject' && (
        <Field label="Reason given by the insurer">
          <input className="form-control" value={text} onChange={(ev) => setText(ev.target.value)} placeholder="e.g. Excluded condition" />
        </Field>
      )}
    </Modal>
  );
};
