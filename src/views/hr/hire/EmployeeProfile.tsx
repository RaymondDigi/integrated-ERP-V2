import React, { useState } from 'react';
import { Eye, EyeOff, TrendingUp, ArrowLeftRight, FileClock, BadgeCheck, CalendarPlus, Lock, FileText, Pencil } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { HREmployee } from '../../../types';
import { CHANGE_LABEL, type ChangeKind, type EmployeeChange } from '../../../data/hireConfig';
import { GRADE_SCALES } from '../../../data/orgData';
import { CONTRACT_TYPES } from '../../../data/hrMockData';
import { allowances, basicFor, isCasual, MONTHS, periodKey } from '../../../data/payrollEngine';
import { supervisorFor } from '../../../data/leaveConfig';
import { addDays, annualCost, bandOf, bandPosition, daysBetween, fmtDate, gradeOf, kes, monthlyCost, probationOf, salaryTimeline, shortGrade, todayIso } from '../../../data/hireEngine';
import { Drawer, Field, Modal, Pill, PersonSelect, Progress, useApprovers } from './shared';
import { EditDetailsModal, reveal } from './EditDetailsModal';

const SECTIONS = ['Personal & KYC', 'Job', 'Pay', 'Documents', 'History'] as const;
type Section = (typeof SECTIONS)[number];

export { reveal };

export const tenure = (from: string) => {
  const d = daysBetween(from, todayIso());
  if (d < 0) return `starts in ${-d} days`;
  const y = Math.floor(d / 365.25);
  const m = Math.floor((d - y * 365.25) / 30.44);
  return y ? `${y} yr ${m} mo` : `${m} mo`;
};

export const ProfileDrawer: React.FC<{ e: HREmployee; onClose: () => void; unmask?: boolean }> = ({ e, onClose, unmask: unmaskInitial = false }) => {
  const { hrEmployees, hireRules, employeeChanges, payrollOpenPeriod, orgStructure } = useApp();
  const [section, setSection] = useState<Section>('Personal & KYC');
  const [unmask, setUnmask] = useState(unmaskInitial);
  const [change, setChange] = useState<ChangeKind | null>(null);
  const [editing, setEditing] = useState(false);
  const prob = probationOf(e, hireRules.probationMonths, hireRules.maxProbationMonths);
  const sup = supervisorFor(e, hrEmployees);
  const reports = hrEmployees.filter((x) => x.orgId === e.orgId && x.status !== 'TERMINATED' && x.staffId !== e.staffId && supervisorFor(x, hrEmployees)?.staffId === e.staffId);
  const casual = isCasual(e);
  const grade = gradeOf(e);
  const band = bandOf(grade);
  const basic = casual ? 0 : basicFor(e, payrollOpenPeriod.year, payrollOpenPeriod.month);
  const al = allowances(basic);
  const cost = monthlyCost(basic, undefined, e.payRateKes);
  const timeline = salaryTimeline(e, payrollOpenPeriod.key);
  const pending = employeeChanges.filter((c) => c.staffId === e.staffId && c.status === 'PENDING');
  const ct = CONTRACT_TYPES.find((c) => c.name === e.contractType);
  const station = orgStructure.stations.find((s) => s.id === e.stationId)?.name;
  const leaving = e.status === 'TERMINATED' || !!e.exitDate;

  const actions: { kind: ChangeKind; label: string; icon: typeof TrendingUp; show: boolean }[] = [
    { kind: 'CONFIRM_PROBATION', label: 'Confirm probation', icon: BadgeCheck, show: prob.applies && prob.status !== 'CONFIRMED' },
    { kind: 'EXTEND_PROBATION', label: 'Extend probation', icon: CalendarPlus, show: prob.applies && prob.status !== 'CONFIRMED' },
    { kind: 'PROMOTION', label: 'Promotion / increment', icon: TrendingUp, show: !casual },
    { kind: 'TRANSFER', label: 'Transfer', icon: ArrowLeftRight, show: true },
    { kind: 'RENEW_CONTRACT', label: 'Renew contract', icon: FileClock, show: !!ct?.hasEndDate && !casual },
    { kind: 'CONVERT_CONTRACT', label: 'Convert contract', icon: FileText, show: !casual }
  ];

  const docs = [
    ...(e.documents ?? []),
    ...[
      ['Signed employment contract', 'Contract'],
      ['National ID copy', 'KYC'],
      ['KRA PIN certificate', 'KYC'],
      ['NSSF and SHIF confirmation', 'KYC'],
      ['Academic certificates', 'Qualifications'],
      ['Certificate of good conduct', 'Vetting']
    ]
      .filter(([n]) => !(e.documents ?? []).some((d) => d.name === n))
      .map(([name, kind]) => ({ name, kind, addedOn: e.joinedDate, ref: 'Personnel file' }))
  ];

  const events = [
    ...(e.history ?? []),
    ...(!(e.history ?? []).some((h) => h.kind === 'Joined') ? [{ date: e.joinedDate, kind: 'Joined', summary: `Joined as ${e.jobTitle}`, ref: undefined as string | undefined, by: undefined as string | undefined }] : []),
    ...timeline.filter((t) => t.previous !== undefined && !(e.history ?? []).some((h) => h.ref && h.ref === t.ref)).map((t) => ({ date: `${t.from}-01`, kind: 'Pay change', summary: `${t.reason}: KES ${t.previous!.toLocaleString()} → ${t.basic.toLocaleString()}`, ref: t.ref, by: t.by })),
    ...(e.exitDate ? [{ date: e.exitDate, kind: 'Exit', summary: 'Last working day (separation)', ref: undefined, by: undefined }] : [])
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <Drawer
        title={e.fullName}
        subtitle={`${e.staffId} · ${e.jobTitle} · ${e.department}`}
        onClose={onClose}
        footer={
          <div className="hi-actions">
            <button className="btn btn-primary btn-sm" onClick={() => setEditing(true)}>
              <Pencil size={13} /> Edit details
            </button>
            {!leaving &&
              actions
                .filter((a) => a.show)
                .map((a) => (
                  <button key={a.kind} className="btn btn-secondary btn-sm" onClick={() => setChange(a.kind)}>
                    <a.icon size={13} /> {a.label}
                  </button>
                ))}
          </div>
        }
      >
        <div className="hi-profile-head">
          <div className="pr-kv">
            <div>
              <span>Status</span>
              <strong>
                <Pill tone={e.status === 'ACTIVE' ? 'success' : e.status === 'TERMINATED' ? 'danger' : 'warning'}>{e.joinedDate > todayIso() ? 'Starting' : e.status.replace('_', ' ').toLowerCase()}</Pill>
              </strong>
              <small>
                {fmtDate(e.joinedDate)} · {tenure(e.joinedDate)}
              </small>
            </div>
            <div>
              <span>Grade</span>
              <strong>{shortGrade(grade)}</strong>
              <small>{e.grade ? 'Recorded' : 'From salary band'}</small>
            </div>
            <div>
              <span>Probation</span>
              <strong style={{ fontSize: 13 }}>{prob.applies ? prob.status.replace('_', ' ').toLowerCase() : 'Not applicable'}</strong>
              <small>{prob.applies ? `${prob.status === 'CONFIRMED' ? 'Ended' : 'Ends'} ${fmtDate(prob.end)}` : e.contractType}</small>
            </div>
          </div>
          {pending.length > 0 && (
            <div className="pr-note warn" style={{ marginTop: 10 }}>
              Waiting for approval: {pending.map((c) => `${CHANGE_LABEL[c.kind].toLowerCase()} (${c.id})`).join(', ')}.
            </div>
          )}
        </div>
        <div className="pr-tabstrip hi-subtabs" role="tablist">
          {SECTIONS.map((s) => (
            <button key={s} role="tab" aria-selected={section === s} className={section === s ? 'active' : ''} onClick={() => setSection(s)}>
              {s}
            </button>
          ))}
        </div>

        {section === 'Personal & KYC' && (
          <>
            <dl className="hi-dl">
              <dt>Full name</dt>
              <dd>{e.fullName}</dd>
              <dt>Gender</dt>
              <dd>{e.gender ?? '—'}</dd>
              <dt>Date of birth</dt>
              <dd>{fmtDate(e.dateOfBirth)}</dd>
              <dt>Work email</dt>
              <dd>{e.email}</dd>
              <dt>Phone</dt>
              <dd>
                {e.phone}
                {e.phoneExtension ? ` · ext. ${e.phoneExtension}` : ''}
              </dd>
              <dt>Personal email</dt>
              <dd>{e.personalEmail ?? '—'}</dd>
              <dt>Marital status</dt>
              <dd>{e.maritalStatus ?? '—'}</dd>
              <dt>Address</dt>
              <dd>{e.address ?? '—'}</dd>
              <dt>Next of kin</dt>
              <dd>{e.nextOfKin ? `${e.nextOfKin.name} (${e.nextOfKin.relationship}), ${e.nextOfKin.phone}` : 'On the personnel file'}</dd>
              <dt>Emergency contact</dt>
              <dd>{e.emergencyContact ? `${e.emergencyContact.name} (${e.emergencyContact.relationship}), ${e.emergencyContact.phone}` : '—'}</dd>
            </dl>
            <h4 className="hi-h4">
              Statutory and payment details{' '}
              <button className="btn btn-secondary btn-sm" onClick={() => setUnmask((x) => !x)}>
                {unmask ? <EyeOff size={13} /> : <Eye size={13} />} {unmask ? 'Mask' : 'Reveal'}
              </button>
            </h4>
            <div className="pr-note" style={{ marginBottom: 8 }}>
              <Lock size={13} /> Stored encrypted and shown masked. Revealing needs the HR records permission and every reveal is logged.
            </div>
            <dl className="hi-dl hi-mono-dd">
              <dt>National ID</dt>
              <dd>{reveal(e.nationalIdMasked, unmask)}</dd>
              <dt>KRA PIN</dt>
              <dd>{reveal(e.kraPinMasked, unmask)}</dd>
              <dt>NSSF</dt>
              <dd>{reveal(e.nssfNoMasked, unmask)}</dd>
              <dt>SHIF</dt>
              <dd>{reveal(e.shifNoMasked, unmask)}</dd>
              <dt>Bank</dt>
              <dd>{reveal(e.bankAccountMasked, unmask)}</dd>
              <dt>M-Pesa</dt>
              <dd>{reveal(e.mpesaPhoneMasked, unmask)}</dd>
              <dt>Paid by</dt>
              <dd>{e.paymentMethod === 'MPESA' || casual ? 'M-Pesa' : `Bank transfer${e.bankBranch ? ` · ${e.bankBranch} branch` : ''}`}</dd>
              <dt>Tax</dt>
              <dd>
                {e.tax?.employment === 'SECONDARY' ? 'Secondary employment (no relief)' : 'Primary employment'}
                {e.tax?.pwdExempt ? ' · PWD exemption' : ''}
                {e.tax?.taxExempt ? ` · zero tax (${e.tax.taxExemptReason ?? 'approved'})` : ''}
              </dd>
            </dl>
          </>
        )}

        {section === 'Job' && (
          <dl className="hi-dl">
            <dt>Job title</dt>
            <dd>{e.jobTitle}</dd>
            <dt>Department</dt>
            <dd>{e.department}</dd>
            <dt>Branch / site</dt>
            <dd>
              {e.branch}
              {station ? ` · ${station}` : ''}
              {e.block ? ` · ${e.block}` : ''}
            </dd>
            {e.costCenter && (
              <>
                <dt>Cost centre</dt>
                <dd>{e.costCenter}</dd>
              </>
            )}
            <dt>Grade</dt>
            <dd>
              {grade}
              {band && !casual ? ` (KES ${band.min.toLocaleString()}–${band.max.toLocaleString()})` : ''}
            </dd>
            <dt>Supervisor</dt>
            <dd>{sup ? `${sup.fullName}, ${sup.jobTitle}` : '—'}</dd>
            <dt>Direct reports</dt>
            <dd>{reports.length ? `${reports.length}: ${reports.slice(0, 4).map((x) => x.fullName).join(', ')}${reports.length > 4 ? '…' : ''}` : 'None'}</dd>
            <dt>Contract</dt>
            <dd>
              {e.contractType}
              {e.contractEndDate ? ` · ends ${fmtDate(e.contractEndDate)} (${daysBetween(todayIso(), e.contractEndDate)} days)` : ct?.hasEndDate && !casual ? ' · end date not recorded' : ''}
            </dd>
            <dt>Probation</dt>
            <dd>{prob.applies ? `${prob.status.replace('_', ' ').toLowerCase()} · ${prob.status === 'CONFIRMED' ? 'ended' : 'ends'} ${fmtDate(prob.end)}${prob.status !== 'CONFIRMED' ? ` · latest possible ${fmtDate(prob.maxEnd)}` : ''}` : 'Not applicable to this contract'}</dd>
            <dt>Joined</dt>
            <dd>
              {fmtDate(e.joinedDate)} ({tenure(e.joinedDate)})
            </dd>
            {e.exitDate && (
              <>
                <dt>Exit</dt>
                <dd>{fmtDate(e.exitDate)}</dd>
              </>
            )}
          </dl>
        )}

        {section === 'Pay' && (
          <>
            <div className="pr-kv">
              <div>
                <span>{casual ? 'Daily rate' : `Basic, ${payrollOpenPeriod.label}`}</span>
                <strong>{casual ? `KES ${e.payRateKes}` : kes(basic)}</strong>
                <small>{casual ? 'Paid weekly on days worked' : `${shortGrade(grade)} · ${band ? `${bandPosition(basic, grade)} band` : ''}`}</small>
              </div>
              <div>
                <span>Allowances</span>
                <strong>{kes(al.house + al.transport)}</strong>
                <small>
                  House {al.house.toLocaleString()} · transport {al.transport.toLocaleString()}
                </small>
              </div>
              <div>
                <span>Cost to company</span>
                <strong>{kes(cost.total)}</strong>
                <small>a month · {kes(cost.total * 12)} a year</small>
              </div>
            </div>
            {band && !casual && (
              <div className="hi-band">
                <Progress pct={((basic - band.min) / (band.max - band.min)) * 100} tone={bandPosition(basic, grade) === 'within' ? 'success' : 'warning'} />
                <div className="hi-sub">
                  {shortGrade(grade)} band KES {band.min.toLocaleString()} – {band.max.toLocaleString()}, midpoint {band.mid.toLocaleString()}
                </div>
              </div>
            )}
            <h4 className="hi-h4">Salary history</h4>
            {casual ? (
              <p className="hi-sub">Daily-rated: the rate is set on the contract.</p>
            ) : (
              <div className="hi-scroll">
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>From</th>
                      <th className="hi-num">Basic</th>
                      <th className="hi-num">Change</th>
                      <th>Reason</th>
                      <th>Ref / by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.map((t) => (
                      <tr key={t.from}>
                        <td>
                          {fmtDate(t.from)}
                          {t.future && (
                            <div>
                              <Pill tone="info">Upcoming</Pill>
                            </div>
                          )}
                        </td>
                        <td className="hi-num">{t.basic.toLocaleString()}</td>
                        <td className="hi-num">{t.previous ? `${t.basic >= t.previous ? '+' : ''}${Math.round(((t.basic - t.previous) / t.previous) * 1000) / 10}%` : '—'}</td>
                        <td className="hi-wrap">{t.reason}</td>
                        <td className="hi-sub">{[t.ref, t.by].filter(Boolean).join(' · ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="hi-sub" style={{ marginTop: 8 }}>
              Payroll reads the salary in force for each month. Changes take effect from {payrollOpenPeriod.label} or later; paid months keep the salary they were paid on.
            </p>
          </>
        )}

        {section === 'Documents' && (
          <div className="hi-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Type</th>
                  <th>Added</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d, i) => (
                  <tr key={i}>
                    <td>
                      <FileText size={13} style={{ verticalAlign: -2 }} /> {d.name}
                    </td>
                    <td>{d.kind}</td>
                    <td>{fmtDate(d.addedOn)}</td>
                    <td className="hi-sub">{d.ref ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {section === 'History' && (
          <ol className="hi-timeline">
            {events.map((h, i) => (
              <li key={i}>
                <strong>{h.kind}</strong> <span>{fmtDate(h.date)}</span>
                <em>
                  {h.summary}
                  {h.ref ? ` · ${h.ref}` : ''}
                  {h.by ? ` · ${h.by}` : ''}
                </em>
              </li>
            ))}
          </ol>
        )}
      </Drawer>
      {change && <ChangeModal e={e} kind={change} onClose={() => setChange(null)} />}
      {editing && (
        <EditDetailsModal
          e={e}
          unmask={unmask}
          onClose={() => setEditing(false)}
          onRequestChange={(k) => {
            setEditing(false);
            setChange(k);
          }}
        />
      )}
    </>
  );
};

/* ------------------------------------------------------------------ change request */

const PAY: ChangeKind[] = ['PROMOTION', 'INCREMENT', 'REGRADE'];

export const ChangeModal: React.FC<{ e: HREmployee; kind: ChangeKind; onClose: () => void }> = ({ e, kind: initialKind, onClose }) => {
  const { requestEmployeeChange, payrollOpenPeriod, hireRules, tenantEmployees, orgStructure, hrEmployees } = useApp();
  const [kind, setKind] = useState<ChangeKind>(initialKind);
  const prob = probationOf(e, hireRules.probationMonths, hireRules.maxProbationMonths);
  const months = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(payrollOpenPeriod.year, payrollOpenPeriod.month + i, 1);
    return { key: periodKey(d.getFullYear(), d.getMonth()), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
  });
  const current = isCasual(e) ? 0 : basicFor(e, payrollOpenPeriod.year, payrollOpenPeriod.month);
  const [month, setMonth] = useState(payrollOpenPeriod.key);
  const [grade, setGrade] = useState(gradeOf(e));
  const [title, setTitle] = useState(e.jobTitle);
  const [basic, setBasic] = useState(current);
  const [department, setDepartment] = useState(e.department);
  const [station, setStation] = useState(e.stationId ?? '');
  const [supervisor, setSupervisor] = useState(e.reportsToStaffId ?? supervisorFor(e, hrEmployees)?.staffId ?? '');
  const [date, setDate] = useState(kind === 'CONFIRM_PROBATION' ? (prob.end && prob.end < todayIso() ? todayIso() : prob.end ?? todayIso()) : todayIso());
  const [endDate, setEndDate] = useState(kind === 'EXTEND_PROBATION' ? addDays(prob.end ?? todayIso(), 90) : e.contractEndDate ? addDays(e.contractEndDate, 365) : '');
  const [contractType, setContractType] = useState(e.contractType === 'Standard Employment Contract' ? 'Fixed-Term Contract' : 'Standard Employment Contract');
  const [reason, setReason] = useState('');
  const band = bandOf(grade);
  const pos = bandPosition(basic, grade);
  const stations = orgStructure.stations.filter((s) => orgStructure.branches.find((b) => b.id === s.branchId)?.name === e.branch);
  const depts = [...new Set([...orgStructure.departments.map((d) => d.name), ...tenantEmployees.map((x) => x.department)])];

  const submit = () => {
    const payload: EmployeeChange['payload'] = {};
    let effectiveFrom = date;
    if (PAY.includes(kind)) {
      effectiveFrom = month;
      Object.assign(payload, { newBasic: basic, grade, jobTitle: kind === 'PROMOTION' ? title : undefined });
    }
    if (kind === 'TRANSFER') Object.assign(payload, { department: department !== e.department ? department : undefined, stationId: station && station !== e.stationId ? station : undefined, supervisorStaffId: supervisor || undefined });
    if (kind === 'EXTEND_PROBATION') payload.probationEndDate = endDate;
    if (kind === 'RENEW_CONTRACT') payload.contractEndDate = endDate;
    if (kind === 'CONVERT_CONTRACT') Object.assign(payload, { contractType, contractEndDate: contractType === 'Fixed-Term Contract' ? endDate : undefined });
    if (requestEmployeeChange({ staffId: e.staffId, kind, effectiveFrom, reason, payload })) onClose();
  };

  return (
    <Modal
      title={`${CHANGE_LABEL[kind]} · ${e.fullName}`}
      subtitle="Saved as a request; a manager who did not raise it approves it before the record changes."
      onClose={onClose}
      width={620}
      footer={
        <div className="hi-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit}>
            Submit for approval
          </button>
        </div>
      }
    >
      {PAY.includes(kind) && (
        <>
          <div className="pr-tabstrip hi-subtabs" style={{ margin: 0 }}>
            {PAY.map((k) => (
              <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
                {CHANGE_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="pr-form-grid">
            <Field label="Takes effect from" hint="Paid months cannot be changed.">
              <select className="form-control" value={month} onChange={(ev) => setMonth(ev.target.value)}>
                {months.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                    {m.key === payrollOpenPeriod.key ? ' (open period)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            {kind !== 'INCREMENT' && (
              <Field label="New grade">
                <select className="form-control" value={grade} onChange={(ev) => setGrade(ev.target.value)}>
                  {GRADE_SCALES.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </Field>
            )}
            {kind === 'PROMOTION' && (
              <Field label="New job title">
                <input className="form-control" value={title} onChange={(ev) => setTitle(ev.target.value)} />
              </Field>
            )}
            <Field label="New basic salary (KES)" hint={band ? `${shortGrade(grade)} band ${band.min.toLocaleString()}–${band.max.toLocaleString()}` : undefined}>
              <input className={`form-control ${pos !== 'within' ? 'is-invalid' : ''}`} type="number" min={0} step={500} value={basic} onChange={(ev) => setBasic(Number(ev.target.value))} />
            </Field>
            <Field label="Increase">
              <div className="hi-inline">
                {[3, 5, 8, 10, 15].map((p) => (
                  <button key={p} type="button" className="btn btn-secondary btn-sm" onClick={() => setBasic(Math.round((current * (1 + p / 100)) / 500) * 500)}>
                    +{p}%
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div className={`pr-note ${pos === 'below' ? 'bad' : pos === 'above' ? 'warn' : ''}`}>
            KES {current.toLocaleString()} → {basic.toLocaleString()} ({current ? `${basic >= current ? '+' : ''}${Math.round(((basic - current) / current) * 1000) / 10}%` : 'new'}). Annual cost {annualCost(basic) >= annualCost(current) ? 'rises' : 'falls'} by{' '}
            {kes(Math.abs(annualCost(basic) - annualCost(current)))}.{pos === 'above' ? ' Above the band: only the managing director can approve.' : pos === 'below' ? ' Below the band minimum.' : ''}
          </div>
        </>
      )}
      {kind === 'TRANSFER' && (
        <div className="pr-form-grid">
          <Field label="Department">
            <select className="form-control" value={department} onChange={(ev) => setDepartment(ev.target.value)}>
              {depts.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Site">
            <select className="form-control" value={station} onChange={(ev) => setStation(ev.target.value)}>
              <option value="">{stations.length ? 'No change' : 'Single site'}</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reports to">
            <PersonSelect value={supervisor} onChange={setSupervisor} people={tenantEmployees.filter((x) => x.staffId !== e.staffId && x.status !== 'TERMINATED' && x.basicSalaryKes >= 45_000)} />
          </Field>
          <Field label="Effective date">
            <input className="form-control" type="date" min={todayIso()} value={date} onChange={(ev) => setDate(ev.target.value)} />
          </Field>
        </div>
      )}
      {kind === 'CONFIRM_PROBATION' && (
        <div className="pr-form-grid">
          <Field label="Confirmed from" hint={`Probation ${prob.status === 'EXTENDED' ? '(extended) ' : ''}ends ${fmtDate(prob.end)}`}>
            <input className="form-control" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
          </Field>
        </div>
      )}
      {(kind === 'EXTEND_PROBATION' || kind === 'RENEW_CONTRACT' || (kind === 'CONVERT_CONTRACT' && contractType === 'Fixed-Term Contract')) && (
        <div className="pr-form-grid">
          {kind === 'CONVERT_CONTRACT' && <span />}
          <Field label={kind === 'EXTEND_PROBATION' ? 'New probation end' : 'New contract end'} hint={kind === 'EXTEND_PROBATION' ? `Latest allowed ${fmtDate(prob.maxEnd)}` : e.contractEndDate ? `Currently ends ${fmtDate(e.contractEndDate)}` : undefined}>
            <input className="form-control" type="date" value={endDate} max={kind === 'EXTEND_PROBATION' ? prob.maxEnd : undefined} onChange={(ev) => setEndDate(ev.target.value)} />
          </Field>
        </div>
      )}
      {kind === 'CONVERT_CONTRACT' && (
        <div className="pr-form-grid">
          <Field label="Convert to">
            <select className="form-control" value={contractType} onChange={(ev) => setContractType(ev.target.value)}>
              {CONTRACT_TYPES.filter((c) => c.payBasis === 'MONTHLY_SALARY' && c.name !== e.contractType).map((c) => (
                <option key={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Effective date">
            <input className="form-control" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
          </Field>
        </div>
      )}
      <Field label="Reason">
        <textarea className="form-control" rows={2} value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder={kind === 'EXTEND_PROBATION' ? 'What still needs to be shown, and the review plan' : 'Why the change is made'} />
      </Field>
    </Modal>
  );
};

export const DecideChangeModal: React.FC<{ c: EmployeeChange; onClose: () => void }> = ({ c, onClose }) => {
  const { decideEmployeeChange } = useApp();
  const people = useApprovers().filter((p) => /manager|director|chief|head/i.test(p.jobTitle));
  const [actor, setActor] = useState(people.find((p) => p.fullName !== c.requestedBy && /director|chief/i.test(p.jobTitle))?.staffId ?? '');
  const [comment, setComment] = useState('');
  return (
    <Modal
      title={`${CHANGE_LABEL[c.kind]} · ${c.staffName}`}
      subtitle={`${c.id} · requested by ${c.requestedBy} on ${fmtDate(c.requestedOn)}`}
      onClose={onClose}
      width={540}
      footer={
        <div className="hi-actions">
          <button className="btn btn-secondary" onClick={() => decideEmployeeChange(c.id, false, actor, comment) && onClose()}>
            Reject
          </button>
          <button className="btn btn-primary" onClick={() => decideEmployeeChange(c.id, true, actor, comment) && onClose()}>
            Approve
          </button>
        </div>
      }
    >
      <div className="pr-note">
        <strong>{c.summary}</strong>
        <br />
        Effective {fmtDate(c.effectiveFrom)}. {c.reason}
      </div>
      <Field label="Acting as" hint="The requester and the employee cannot approve. Pay above the grade band needs the managing director.">
        <PersonSelect value={actor} onChange={setActor} people={people} />
      </Field>
      <Field label="Comment" hint="Required to reject.">
        <textarea className="form-control" rows={2} value={comment} onChange={(ev) => setComment(ev.target.value)} />
      </Field>
    </Modal>
  );
};
