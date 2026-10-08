import React, { useMemo, useState } from 'react';
import { Award, BellRing, CalendarClock, GraduationCap, Users, UserMinus, UserPlus } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useSession } from '../../../auth/session';
import { DataTable, Field, Panel, Stat, Bars } from '../../../suites/ui/kit';
import { ExportCsvButton, PrintButton, esc } from '../../../platform/Widgets';
import { useAuditTrail } from '../../../platform/audit';
import { QUALIFICATION_LEVELS } from '../../../data/hcmConfig';
import { active, ageBand, ageOf, countBy, fmt, highestQualification, hrAlerts, movements, serviceBand, todayIso, type HrAlert } from '../../../data/hcmEngine';
import { establishmentRows } from '../../../data/hireEngine';
import type { QualificationLevel } from '../../../types';
import { Btn, StaffSelect, StatusPill, Toolbar, useCanEdit, useStaff } from './ui';

/* ================================================================ Qualifications & professional certifications */

export const QualificationsTab: React.FC = () => {
  const { tenantEmployees, professionalBodies, addProfessionalBody, addQualification, verifyQualification, removeQualification, addProfessionalCert, renewProfessionalCert } = useApp();
  const { canEdit } = useCanEdit();
  const [staffId, setStaffId] = useState('');
  const [level, setLevel] = useState<'All' | QualificationLevel>('All');
  const [q, setQ] = useState({ level: 'Degree' as QualificationLevel, field: '', institution: '', year: new Date().getFullYear() });
  const [c, setC] = useState({ body: professionalBodies[0] ?? '', membershipNo: '', grade: '', expiry: '', cpdHours: 0 });
  const [body, setBody] = useState('');
  const staff = tenantEmployees.filter(active);
  const rows = staff.filter((e) => level === 'All' || highestQualification(e) === level);
  const e = staff.find((x) => x.staffId === staffId);
  const soon = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
  const expiring = staff.flatMap((x) => (x.professionalCerts ?? []).filter((p) => p.expiry <= soon).map((p) => ({ e: x, p })));
  return (
    <>
      <div className="sx-stats">
        {(['Degree', 'Masters', 'Diploma', 'Certificate'] as const).map((l) => (
          <Stat key={l} label={`Highest: ${l}`} value={staff.filter((x) => highestQualification(x) === l).length} icon={<GraduationCap size={16} />} tone="blue" />
        ))}
        <Stat label="Memberships expiring (60 days)" value={expiring.length} icon={<Award size={16} />} tone={expiring.length ? 'red' : 'green'} />
      </div>
      <Panel
        title="Qualifications register"
        subtitle="Highest academic level per employee (Certificate to PhD) and professional body memberships with renewal dates."
        action={
          <Toolbar>
            <select className="form-control" value={level} onChange={(ev) => setLevel(ev.target.value as typeof level)} aria-label="Highest level">
              <option value="All">All levels</option>
              {QUALIFICATION_LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            <ExportCsvButton
              name="Qualifications register"
              header={['Staff ID', 'Employee', 'Department', 'Highest', 'Qualifications', 'Professional bodies']}
              rows={() => rows.map((x) => [x.staffId, x.fullName, x.department, highestQualification(x) ?? '', (x.qualifications ?? []).map((y) => `${y.level} ${y.field} (${y.institution} ${y.year})`).join('; '), (x.professionalCerts ?? []).map((p) => `${p.body.split(' —')[0]} ${p.membershipNo} to ${p.expiry}`).join('; ')])}
            />
          </Toolbar>
        }
      >
        <DataTable
          rows={rows}
          rowKey={(x) => x.staffId}
          onRowClick={(x) => setStaffId(x.staffId)}
          selected={staffId}
          columns={[
            { key: 'n', header: 'Employee', render: (x) => `${x.fullName} · ${x.staffId}`, sort: (x) => x.fullName },
            { key: 'd', header: 'Department', render: (x) => x.department, sort: (x) => x.department },
            { key: 'h', header: 'Highest', render: (x) => highestQualification(x) ?? <span className="muted">Not recorded</span> },
            { key: 'q', header: 'Qualifications', render: (x) => (x.qualifications ?? []).map((y) => `${y.level} — ${y.field}${y.verified ? ' ✓' : ''}`).join('; ') || '—' },
            { key: 'p', header: 'Professional bodies', render: (x) => (x.professionalCerts ?? []).map((p) => `${p.body.split(' —')[0]} (${p.expiry < todayIso() ? 'lapsed' : `to ${fmt(p.expiry)}`})`).join('; ') || '—' }
          ]}
        />
      </Panel>
      <Panel title={e ? `${e.fullName} — qualifications` : 'Choose an employee'} subtitle="Click a row above, or choose here.">
        <Toolbar>
          <StaffSelect value={staffId} onChange={setStaffId} />
        </Toolbar>
        {e && (
          <>
            <DataTable
              rows={e.qualifications ?? []}
              rowKey={(y) => y.id}
              empty="No qualifications recorded."
              columns={[
                { key: 'l', header: 'Level', render: (y) => y.level },
                { key: 'f', header: 'Field', render: (y) => y.field },
                { key: 'i', header: 'Institution', render: (y) => `${y.institution}, ${y.year}` },
                { key: 'v', header: 'Verified', render: (y) => (y.verified ? <StatusPill status="ACTIVE" label={`Verified · ${y.verifiedBy}`} /> : <StatusPill status="PENDING" label="Not verified" />) },
                {
                  key: 'x',
                  header: '',
                  render: (y) => (
                    <span style={{ display: 'flex', gap: 6 }}>
                      {!y.verified && (
                        <Btn disabled={!canEdit} onClick={() => verifyQualification(e.staffId, y.id)}>
                          Verify
                        </Btn>
                      )}
                      <Btn disabled={!canEdit} onClick={() => removeQualification(e.staffId, y.id)}>
                        Remove
                      </Btn>
                    </span>
                  )
                }
              ]}
            />
            <div className="sx-grid" style={{ marginTop: 10 }}>
              <Field label="Level">
                <select className="form-control" value={q.level} onChange={(ev) => setQ({ ...q, level: ev.target.value as QualificationLevel })}>
                  {QUALIFICATION_LEVELS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Field of study">
                <input className="form-control" value={q.field} onChange={(ev) => setQ({ ...q, field: ev.target.value })} />
              </Field>
              <Field label="Institution">
                <input className="form-control" value={q.institution} onChange={(ev) => setQ({ ...q, institution: ev.target.value })} />
              </Field>
              <Field label="Year">
                <input className="form-control" type="number" value={q.year} onChange={(ev) => setQ({ ...q, year: Number(ev.target.value) })} />
              </Field>
            </div>
            <Toolbar>
              <Btn primary disabled={!canEdit} onClick={() => addQualification(e.staffId, q) && setQ({ ...q, field: '', institution: '' })}>
                Add qualification
              </Btn>
            </Toolbar>
            <h4 style={{ margin: '12px 0 6px' }}>Professional bodies</h4>
            <DataTable
              rows={e.professionalCerts ?? []}
              rowKey={(p) => p.id}
              empty="No memberships recorded."
              columns={[
                { key: 'b', header: 'Body', render: (p) => p.body },
                { key: 'm', header: 'Membership', render: (p) => `${p.membershipNo}${p.grade ? ` · ${p.grade}` : ''}` },
                { key: 'e', header: 'Renewal', render: (p) => <StatusPill status={p.expiry < todayIso() ? 'OVERDUE' : p.expiry <= soon ? 'PENDING' : 'ACTIVE'} label={fmt(p.expiry)} /> },
                { key: 'c', header: 'CPD hours', align: 'right', render: (p) => p.cpdHours ?? 0 },
                {
                  key: 'x',
                  header: '',
                  render: (p) => (
                    <Btn disabled={!canEdit} onClick={() => renewProfessionalCert(e.staffId, p.id, new Date(new Date(p.expiry < todayIso() ? todayIso() : p.expiry).getTime() + 365 * 864e5).toISOString().slice(0, 10), (p.cpdHours ?? 0) + 20)}>
                      Renew 1 year
                    </Btn>
                  )
                }
              ]}
            />
            <div className="sx-grid" style={{ marginTop: 10 }}>
              <Field label="Professional body">
                <select className="form-control" value={c.body} onChange={(ev) => setC({ ...c, body: ev.target.value })}>
                  {professionalBodies.map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </Field>
              <Field label="Membership no.">
                <input className="form-control" value={c.membershipNo} onChange={(ev) => setC({ ...c, membershipNo: ev.target.value })} />
              </Field>
              <Field label="Grade">
                <input className="form-control" value={c.grade} onChange={(ev) => setC({ ...c, grade: ev.target.value })} placeholder="e.g. Full member" />
              </Field>
              <Field label="Renewal date">
                <input className="form-control" type="date" value={c.expiry} onChange={(ev) => setC({ ...c, expiry: ev.target.value })} />
              </Field>
            </div>
            <Toolbar>
              <Btn primary disabled={!canEdit} onClick={() => addProfessionalCert(e.staffId, { body: c.body, membershipNo: c.membershipNo, grade: c.grade || undefined, expiry: c.expiry, cpdHours: c.cpdHours })}>
                Add membership
              </Btn>
              <input className="form-control" style={{ width: 240 }} placeholder="New professional body" value={body} onChange={(ev) => setBody(ev.target.value)} />
              <Btn disabled={!canEdit} onClick={() => addProfessionalBody(body) && setBody('')}>
                Add body to list
              </Btn>
            </Toolbar>
          </>
        )}
      </Panel>
    </>
  );
};

/* ================================================================ HR alerts: anniversaries, retirement, contracts, probation */

const KIND_LABEL: Record<HrAlert['kind'], string> = { ANNIVERSARY: 'Anniversary', MILESTONE: 'Long-service milestone', RETIREMENT: 'Retirement', CONTRACT: 'Contract end', PROBATION: 'Probation review' };

export const HrAlertsTab: React.FC = () => {
  const { tenantEmployees, sendHrAlertNotices, sentHrAlerts, startExit, exitCases, setCurrentView } = useApp();
  const session = useSession();
  const { canEdit } = useCanEdit();
  const [horizon, setHorizon] = useState(60);
  const [kind, setKind] = useState<'All' | HrAlert['kind']>('All');
  const alerts = useMemo(() => hrAlerts(tenantEmployees, todayIso(), horizon), [tenantEmployees, horizon]);
  const rows = alerts.filter((a) => kind === 'All' || a.kind === kind);
  const exitOpen = (staffId: string) => exitCases.some((c) => c.staffId === staffId && c.stage !== 'WITHDRAWN');
  return (
    <>
      <div className="sx-stats">
        <Stat label="Retiring in 6 months" value={alerts.filter((a) => a.kind === 'RETIREMENT').length} icon={<UserMinus size={16} />} tone="red" />
        <Stat label="Contracts ending in 90 days" value={alerts.filter((a) => a.kind === 'CONTRACT').length} icon={<CalendarClock size={16} />} tone="orange" />
        <Stat label={`Anniversaries in ${horizon} days`} value={alerts.filter((a) => a.kind === 'ANNIVERSARY' || a.kind === 'MILESTONE').length} detail={`${alerts.filter((a) => a.kind === 'MILESTONE').length} long-service milestones`} icon={<Award size={16} />} tone="gold" />
        <Stat label="Notices sent" value={sentHrAlerts.length} icon={<BellRing size={16} />} tone="blue" />
      </div>
      <Panel
        title="HR alerts"
        subtitle="Retirement (6, 3 and 1 months ahead), contract expiry (90, 60, 30 days), probation reviews and work anniversaries. Each notice goes once per bucket."
        action={
          <Toolbar>
            <select className="form-control" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Alert type">
              <option value="All">All alerts</option>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select className="form-control" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} aria-label="Anniversary horizon">
              <option value={30}>Anniversaries: 30 days</option>
              <option value={60}>Anniversaries: 60 days</option>
              <option value={183}>Anniversaries: 6 months</option>
            </select>
            <Btn primary disabled={!canEdit} onClick={() => sendHrAlertNotices(rows.filter((a) => a.kind !== 'ANNIVERSARY'))}>
              Send due notices
            </Btn>
            <ExportCsvButton name="HR alerts" header={['Type', 'Staff ID', 'Employee', 'Date', 'Days left', 'Detail']} rows={() => rows.map((a) => [KIND_LABEL[a.kind], a.staffId, a.name, a.date, a.daysLeft, a.detail])} />
          </Toolbar>
        }
      >
        <DataTable
          rows={rows}
          rowKey={(a) => a.key}
          empty="Nothing due in this window."
          columns={[
            { key: 'k', header: 'Type', render: (a) => <StatusPill status={a.severity === 'critical' ? 'OVERDUE' : a.severity === 'warning' ? 'PENDING' : 'APPROVED'} label={KIND_LABEL[a.kind]} /> },
            { key: 'n', header: 'Employee', render: (a) => `${a.name} · ${a.staffId}` },
            { key: 'd', header: 'Date', render: (a) => fmt(a.date), sort: (a) => a.date },
            { key: 'l', header: 'Days left', align: 'right', render: (a) => a.daysLeft, sort: (a) => a.daysLeft },
            { key: 't', header: 'Detail', render: (a) => a.detail },
            { key: 's', header: 'Notice', render: (a) => (sentHrAlerts.includes(a.key) ? 'Sent' : a.kind === 'ANNIVERSARY' ? '—' : 'Due') },
            {
              key: 'x',
              header: '',
              render: (a) =>
                a.kind === 'RETIREMENT' ? (
                  exitOpen(a.staffId) ? (
                    <Btn onClick={() => setCurrentView('separation')}>Exit case open</Btn>
                  ) : (
                    <Btn
                      disabled={!canEdit}
                      onClick={() => startExit({ staffId: a.staffId, kind: 'RETIREMENT', noticeDate: todayIso(), lastDay: a.date, reason: `Normal retirement at age ${a.detail.match(/\d+/)?.[0] ?? 60}` }, session?.name ?? 'HR office')}
                    >
                      Start retirement exit
                    </Btn>
                  )
                ) : null
            }
          ]}
        />
      </Panel>
    </>
  );
};

/* ================================================================ HR reports library */

export const HrReportsTab: React.FC = () => {
  const { tenantEmployees, hrEmployees, selectedOrgId, requisitions, candidates, onboardingRecords, establishmentPlans, activeTenant } = useApp();
  const [report, setReport] = useState<'department' | 'gender' | 'age' | 'contract' | 'service' | 'qualification' | 'movement' | 'establishment'>('department');
  const staff = tenantEmployees.filter(active);
  const all = hrEmployees.filter((e) => e.orgId === selectedOrgId);
  const counts = (key: (e: (typeof staff)[number]) => string) => countBy(staff, key);
  const table: { header: string[]; rows: (string | number)[][] } = useMemo(() => {
    if (report === 'movement') return { header: ['Month', 'Headcount', 'Joiners', 'Leavers', 'Turnover %'], rows: movements(all).map((m) => [m.month, m.headcount, m.joiners, m.leavers, m.turnoverPct]) };
    if (report === 'establishment')
      return {
        header: ['Department', 'Approved', 'In post', 'Joining', 'Open', 'Vacant'],
        rows: establishmentRows(selectedOrgId, hrEmployees, requisitions, candidates, onboardingRecords, establishmentPlans).map((r) => [r.department, r.approved, r.inPost, r.joining, r.open, r.vacant])
      };
    const key =
      report === 'department'
        ? (e: (typeof staff)[number]) => e.department
        : report === 'gender'
        ? (e: (typeof staff)[number]) => e.gender ?? 'Not recorded'
        : report === 'age'
        ? (e: (typeof staff)[number]) => ageBand(ageOf(e.dateOfBirth))
        : report === 'contract'
        ? (e: (typeof staff)[number]) => e.contractType
        : report === 'service'
        ? (e: (typeof staff)[number]) => serviceBand(e.joinedDate)
        : (e: (typeof staff)[number]) => highestQualification(e) ?? 'Not recorded';
    return { header: ['Group', 'Headcount', '% of staff'], rows: counts(key).map(([g, n]) => [g, n, Math.round((n / Math.max(1, staff.length)) * 1000) / 10]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, staff.length, all.length, selectedOrgId]);
  const mv = movements(all);
  const year = mv.reduce((n, m) => ({ j: n.j + m.joiners, l: n.l + m.leavers }), { j: 0, l: 0 });
  const TITLES = { department: 'Headcount by department', gender: 'Headcount by gender', age: 'Headcount by age band', contract: 'Headcount by contract type', service: 'Headcount by length of service', qualification: 'Headcount by highest qualification', movement: 'New hires and leavers by month', establishment: 'Establishment against actual' };
  return (
    <>
      <div className="sx-stats">
        <Stat label="Headcount" value={staff.length} icon={<Users size={16} />} />
        <Stat label="New hires (12 months)" value={year.j} icon={<UserPlus size={16} />} tone="blue" />
        <Stat label="Leavers (12 months)" value={year.l} detail={`turnover ${Math.round((year.l / Math.max(1, staff.length)) * 1000) / 10}%`} icon={<UserMinus size={16} />} tone="orange" />
      </div>
      <Panel
        title={TITLES[report]}
        subtitle={`${activeTenant.name} · as at ${fmt(todayIso())}`}
        action={
          <Toolbar>
            <select className="form-control" value={report} onChange={(e) => setReport(e.target.value as typeof report)} aria-label="Report">
              {Object.entries(TITLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <ExportCsvButton name={TITLES[report]} header={table.header} rows={() => table.rows} />
            <PrintButton
              title={TITLES[report]}
              html={() => `<h1>${esc(TITLES[report])}</h1><p>${esc(activeTenant.name)} · ${esc(fmt(todayIso()))}</p><table><thead><tr>${table.header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`}
            />
          </Toolbar>
        }
      >
        {table.header[0] === "Group" && <Bars data={table.rows.slice(0, 10).map((r) => ({ label: String(r[0]), values: [Number(r[1])] }))} series={[{ name: "Headcount", color: "#059669" }]} />}
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                {table.header.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={typeof c === 'number' ? 'num' : ''}>
                      {typeof c === 'number' ? c.toLocaleString() : c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
};

/* ================================================================ Master data change report */

export const MasterDataReportTab: React.FC = () => {
  const { hireAudit } = useApp();
  const trail = useAuditTrail();
  const { nameOf } = useStaff();
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(todayIso());
  const [user, setUser] = useState('');
  const [field, setField] = useState('');
  const rows = useMemo(() => {
    const platform = trail
      .filter((a) => a.module === 'HR')
      .map((a) => ({ id: a.id, at: a.at, by: a.by, ref: a.ref ?? '', field: a.field ?? '', before: a.before ?? '', after: a.after ?? '', action: a.action }));
    const hire = hireAudit
      .filter((a) => a.area === 'Employee')
      .map((a, i) => ({ id: `h${i}`, at: a.at, by: a.by, ref: a.ref, field: a.action.startsWith('Sensitive') ? 'Sensitive field' : '', before: '', after: '', action: a.action }));
    return [...platform, ...hire];
  }, [trail, hireAudit]);
  const parse = (at: string) => {
    const d = new Date(at);
    return Number.isNaN(d.getTime()) ? at.slice(0, 10) : d.toISOString().slice(0, 10);
  };
  const shown = rows.filter((r) => {
    const d = parse(r.at);
    return d >= from && d <= to && (!user || r.by === user) && (!field || `${r.field} ${r.action}`.toLowerCase().includes(field.toLowerCase()));
  });
  const users = [...new Set(rows.map((r) => r.by))].sort();
  return (
    <Panel
      title="Master data change report"
      subtitle="Every change to employee records with the old and new value, who made it and when. Filter by date, user or field, and export."
      action={<ExportCsvButton name={`Master data changes ${from} to ${to}`} header={['When', 'User', 'Staff ID', 'Employee', 'Field / action', 'Old value', 'New value']} rows={() => shown.map((r) => [r.at, r.by, r.ref, nameOf(r.ref), r.field || r.action, r.before, r.after])} />}
    >
      <div className="sx-grid">
        <Field label="From">
          <input className="form-control" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input className="form-control" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Changed by">
          <select className="form-control" value={user} onChange={(e) => setUser(e.target.value)}>
            <option value="">Anyone</option>
            {users.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Field>
        <Field label="Field contains">
          <input className="form-control" value={field} onChange={(e) => setField(e.target.value)} placeholder="e.g. bankAccount, jobTitle" />
        </Field>
      </div>
      <DataTable
        rows={shown}
        rowKey={(r) => r.id}
        empty="No changes in this window. Changes made in this session appear here with old and new values."
        columns={[
          { key: 'a', header: 'When', render: (r) => r.at, sort: (r) => r.at },
          { key: 'b', header: 'User', render: (r) => r.by },
          { key: 'e', header: 'Employee', render: (r) => `${nameOf(r.ref)} · ${r.ref}` },
          { key: 'f', header: 'Field / action', render: (r) => r.field || r.action },
          { key: 'o', header: 'Old', render: (r) => r.before || '—' },
          { key: 'n', header: 'New', render: (r) => r.after || '—' }
        ]}
      />
    </Panel>
  );
};
