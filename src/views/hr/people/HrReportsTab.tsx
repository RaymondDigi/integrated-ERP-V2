import React, { useMemo, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import type { HREmployee } from '../../../types';
import { CHANGE_LABEL } from '../../../data/hireConfig';
import { addDays, addMonths, daysBetween, fmtDate, probationOf, todayIso } from '../../../data/hireEngine';
import { monthOf, retirementOf, yearsBetween } from '../../../data/peopleSeed';
import { ReportPaper, type Report } from '../payroll/ReportPaper';
import { useCompanyName } from '../payroll/shared';

type ReportId = 'headcount' | 'movement' | 'anniversaries' | 'probation' | 'retirements' | 'changes' | 'stafflist';

const REPORTS: { id: ReportId; name: string; about: string; group: string }[] = [
  { id: 'headcount', name: 'Headcount', about: 'Staff in post by department, branch, contract or gender, with status and totals', group: 'Workforce' },
  { id: 'movement', name: 'Joiners & leavers', about: 'Who joined and who left in a period, with turnover', group: 'Workforce' },
  { id: 'stafflist', name: 'Staff list with contacts', about: 'Everyone in post with phone, work email, extension and emergency contact', group: 'Workforce' },
  { id: 'anniversaries', name: 'Service anniversaries', about: 'Hire dates and years of service for a month, with milestone years', group: 'Dates' },
  { id: 'probation', name: 'Probation ending', about: 'Staff still on probation and when it ends', group: 'Dates' },
  { id: 'retirements', name: 'Retirements & contract expiries', about: 'Retirement age reached in the coming months and fixed-term contracts ending', group: 'Dates' },
  { id: 'changes', name: 'Master data changes', about: 'Who changed which employee record, when, and whether the field is sensitive', group: 'Control' }
];

const DIMS = {
  department: { label: 'Department', get: (e: HREmployee) => e.department },
  branch: { label: 'Branch', get: (e: HREmployee) => e.branch },
  contract: { label: 'Contract type', get: (e: HREmployee) => e.contractType },
  gender: { label: 'Gender', get: (e: HREmployee) => e.gender ?? 'Not recorded' }
};
type Dim = keyof typeof DIMS;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** Audit stamps are ISO or '8 Oct 2026, 14:05'. */
const dateOfStamp = (at: string) => {
  if (/^\d{4}-\d{2}-\d{2}/.test(at)) return at.slice(0, 10);
  const m = at.match(/(\d{1,2}) (\w{3})\w* (\d{4})/);
  if (!m) return '';
  const mi = MONTHS.indexOf(m[2].toLowerCase());
  return mi < 0 ? '' : `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};
const STATUS_LABEL: Record<HREmployee['status'], string> = { ACTIVE: 'Active', ON_LEAVE: 'On leave', SUSPENDED: 'Suspended', TERMINATED: 'Left' };
const inPost = (e: HREmployee, on: string) => e.status !== 'TERMINATED' && !(e.exitDate && e.exitDate < on) && e.joinedDate <= on;

export const HrReportsTab: React.FC = () => {
  const { hrEmployees, selectedOrgId, tenantOrganizations, employeeChanges, hireAudit, hireRules } = useApp();
  const companyName = useCompanyName();
  const today = todayIso();
  const [reportId, setReportId] = useState<ReportId>('headcount');
  const [scope, setScope] = useState<'company' | 'group'>('company');
  const [dim, setDim] = useState<Dim>('department');
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [to, setTo] = useState(today);
  const [month, setMonth] = useState(monthOf(today));
  const [ahead, setAhead] = useState(6);
  const [sensitiveOnly, setSensitiveOnly] = useState(false);

  const people = useMemo(() => hrEmployees.filter((e) => scope === 'group' || e.orgId === selectedOrgId), [hrEmployees, scope, selectedOrgId]);
  const scopeLabel = scope === 'company' ? companyName(selectedOrgId) : 'All companies';
  const live = people.filter((e) => inPost(e, today));
  const co = (e: HREmployee) => (scope === 'group' ? [companyName(e.orgId)] : []);
  const coCol = scope === 'group' ? [{ label: 'Company' }] : [];

  const report: Report = (() => {
    const byName = (a: HREmployee, b: HREmployee) => a.fullName.localeCompare(b.fullName);
    if (reportId === 'headcount') {
      const d = DIMS[dim];
      const keys = [...new Set(live.map(d.get))].sort();
      const row = (list: HREmployee[]) => [
        list.filter((e) => e.status === 'ACTIVE').length,
        list.filter((e) => e.status === 'ON_LEAVE').length,
        list.filter((e) => e.status === 'SUSPENDED').length,
        list.filter((e) => e.gender === 'Female').length,
        list.filter((e) => e.gender === 'Male').length,
        list.length
      ];
      return {
        title: 'Headcount',
        subtitle: `${scopeLabel} · by ${d.label.toLowerCase()} · as at ${fmtDate(today)}`,
        kpis: [
          { label: 'In post', value: String(live.length) },
          { label: 'Female', value: String(live.filter((e) => e.gender === 'Female').length), sub: live.length ? `${Math.round((live.filter((e) => e.gender === 'Female').length / live.length) * 100)}%` : undefined },
          { label: 'Daily-rated', value: String(live.filter((e) => e.contractType === 'Daily-Rated Contract').length) },
          { label: 'Suspended', value: String(live.filter((e) => e.status === 'SUSPENDED').length) }
        ],
        sections: [
          {
            columns: [{ label: d.label }, { label: 'Active', num: true }, { label: 'On leave', num: true }, { label: 'Suspended', num: true }, { label: 'Female', num: true }, { label: 'Male', num: true }, { label: 'Total', num: true }],
            rows: keys.map((k) => [k, ...row(live.filter((e) => d.get(e) === k))]),
            foot: ['Total', ...row(live)]
          }
        ],
        footnote: 'Counts staff in post today (excludes leavers and anyone whose last day has passed). Outsourced workers are reported under Outsourced labour.',
        signatures: ['Prepared by (HR Officer)', 'Approved by (HR Manager)']
      };
    }
    if (reportId === 'movement') {
      const joiners = people.filter((e) => e.joinedDate >= from && e.joinedDate <= to).sort((a, b) => a.joinedDate.localeCompare(b.joinedDate));
      const leavers = people.filter((e) => e.exitDate && e.exitDate >= from && e.exitDate <= to).sort((a, b) => a.exitDate!.localeCompare(b.exitDate!));
      const opening = people.filter((e) => inPost(e, addDays(from, -1))).length;
      const closing = people.filter((e) => e.joinedDate <= to && !(e.exitDate && e.exitDate < to) && !(e.status === 'TERMINATED' && !e.exitDate)).length;
      const avg = (opening + closing) / 2;
      return {
        title: 'Joiners & leavers',
        subtitle: `${scopeLabel} · ${fmtDate(from)} – ${fmtDate(to)}`,
        kpis: [
          { label: 'Opening headcount', value: String(opening) },
          { label: 'Joined', value: String(joiners.length) },
          { label: 'Left', value: String(leavers.length) },
          { label: 'Turnover', value: avg ? `${((leavers.length / avg) * 100).toFixed(1)}%` : '—', sub: 'Leavers ÷ average headcount' }
        ],
        sections: [
          {
            heading: 'Joiners',
            columns: [{ label: 'Staff no.' }, { label: 'Name' }, ...coCol, { label: 'Job title' }, { label: 'Department' }, { label: 'Contract' }, { label: 'Joined' }],
            rows: joiners.map((e) => [e.staffId, e.fullName, ...co(e), e.jobTitle, e.department, e.contractType, fmtDate(e.joinedDate)])
          },
          {
            heading: 'Leavers',
            columns: [{ label: 'Staff no.' }, { label: 'Name' }, ...coCol, { label: 'Job title' }, { label: 'Department' }, { label: 'Joined' }, { label: 'Last day' }, { label: 'Years', num: true }],
            rows: leavers.map((e) => [e.staffId, e.fullName, ...co(e), e.jobTitle, e.department, fmtDate(e.joinedDate), fmtDate(e.exitDate), yearsBetween(e.joinedDate, e.exitDate!)])
          }
        ],
        footnote: 'Leavers are taken from the last working day recorded in Separation. Re-hired staff count as joiners on their new start date.'
      };
    }
    if (reportId === 'anniversaries') {
      const [y] = month.split('-').map(Number);
      const rows = live
        .filter((e) => e.joinedDate.slice(5, 7) === month.slice(5, 7) && Number(e.joinedDate.slice(0, 4)) < y)
        .map((e) => ({ e, on: `${y}-${e.joinedDate.slice(5)}`, years: y - Number(e.joinedDate.slice(0, 4)) }))
        .sort((a, b) => a.on.localeCompare(b.on));
      const milestone = rows.filter((r) => r.years % 5 === 0);
      return {
        title: 'Service anniversaries',
        subtitle: `${scopeLabel} · ${fmtDate(month)}`,
        kpis: [
          { label: 'Anniversaries', value: String(rows.length) },
          { label: 'Milestones (5, 10, 15… years)', value: String(milestone.length) },
          { label: 'Longest serving', value: rows.length ? `${Math.max(...rows.map((r) => r.years))} years` : '—' }
        ],
        sections: [
          {
            columns: [{ label: 'Date' }, { label: 'Staff no.' }, { label: 'Name' }, ...coCol, { label: 'Job title' }, { label: 'Department' }, { label: 'Hired' }, { label: 'Years', num: true }, { label: 'Milestone' }],
            rows: rows.map((r) => [fmtDate(r.on), r.e.staffId, r.e.fullName, ...co(r.e), r.e.jobTitle, r.e.department, fmtDate(r.e.joinedDate), r.years, r.years % 5 === 0 ? `${r.years}-year award` : ''])
          }
        ],
        footnote: 'Long-service awards under the staff handbook are due at 5, 10, 15, 20 and 25 years.'
      };
    }
    if (reportId === 'probation') {
      const rows = live
        .map((e) => ({ e, p: probationOf(e, hireRules.probationMonths) }))
        .filter((r) => r.p.applies && r.p.status !== 'CONFIRMED' && r.p.end)
        .sort((a, b) => a.p.end!.localeCompare(b.p.end!));
      return {
        title: 'Probation ending',
        subtitle: `${scopeLabel} · as at ${fmtDate(today)}`,
        kpis: [
          { label: 'On probation', value: String(rows.length) },
          { label: 'Ending in 30 days', value: String(rows.filter((r) => (r.p.daysLeft ?? 99) <= 30 && (r.p.daysLeft ?? 0) >= 0).length) },
          { label: 'Overdue for a decision', value: String(rows.filter((r) => (r.p.daysLeft ?? 0) < 0).length) },
          { label: 'Extended', value: String(rows.filter((r) => r.p.status === 'EXTENDED').length) }
        ],
        sections: [
          {
            columns: [{ label: 'Staff no.' }, { label: 'Name' }, ...coCol, { label: 'Job title' }, { label: 'Department' }, { label: 'Joined' }, { label: 'Probation ends' }, { label: 'Days left', num: true }, { label: 'Status' }],
            rows: rows.map((r) => [r.e.staffId, r.e.fullName, ...co(r.e), r.e.jobTitle, r.e.department, fmtDate(r.e.joinedDate), fmtDate(r.p.end), r.p.daysLeft ?? 0, r.p.status === 'EXTENDED' ? 'Extended' : (r.p.daysLeft ?? 0) < 0 ? 'Overdue — confirm or extend' : 'On probation'])
          }
        ],
        footnote: `Default probation is ${hireRules.probationMonths} months. Confirm or extend from Employee Master → Contracts & probation.`
      };
    }
    if (reportId === 'retirements') {
      const until = addMonths(today, ahead);
      const retiring = live.map((e) => ({ e, on: retirementOf(e) })).filter((r) => r.on && r.on >= today && r.on <= until).sort((a, b) => a.on!.localeCompare(b.on!));
      const contracts = live.filter((e) => e.contractEndDate && e.contractEndDate >= today && e.contractEndDate <= until).sort((a, b) => a.contractEndDate!.localeCompare(b.contractEndDate!));
      const noDob = live.filter((e) => !e.dateOfBirth && !e.retirementDate).length;
      return {
        title: 'Retirements & contract expiries',
        subtitle: `${scopeLabel} · ${fmtDate(today)} – ${fmtDate(until)}`,
        kpis: [
          { label: 'Retiring', value: String(retiring.length) },
          { label: 'Contracts ending', value: String(contracts.length) },
          { label: 'No date of birth on file', value: String(noDob), sub: 'Cannot be checked for retirement' }
        ],
        sections: [
          {
            heading: 'Retirements',
            columns: [{ label: 'Staff no.' }, { label: 'Name' }, ...coCol, { label: 'Job title' }, { label: 'Date of birth' }, { label: 'Retirement age', num: true }, { label: 'Retires' }, { label: 'Days', num: true }, { label: 'Years of service', num: true }],
            rows: retiring.map((r) => [r.e.staffId, r.e.fullName, ...co(r.e), r.e.jobTitle, fmtDate(r.e.dateOfBirth), r.e.retirementAge ?? 60, fmtDate(r.on), daysBetween(today, r.on!), yearsBetween(r.e.joinedDate, r.on!)])
          },
          {
            heading: 'Fixed-term contracts ending',
            columns: [{ label: 'Staff no.' }, { label: 'Name' }, ...coCol, { label: 'Job title' }, { label: 'Contract' }, { label: 'Ends' }, { label: 'Days', num: true }],
            rows: contracts.map((e) => [e.staffId, e.fullName, ...co(e), e.jobTitle, e.contractType, fmtDate(e.contractEndDate), daysBetween(today, e.contractEndDate!)])
          }
        ],
        footnote: 'Retirement is at the age on the employee record (60 unless stated). Issue notices from Employee Master → Employee events.'
      };
    }
    if (reportId === 'changes') {
      const ids = new Set(people.map((e) => e.staffId));
      const nameOf = (id: string) => people.find((e) => e.staffId === id)?.fullName ?? id;
      type R = { date: string; staffId: string; what: string; source: string; by: string; sensitive: boolean };
      const rows: R[] = [];
      // Changes saved on the employee file are listed from the file; their plain audit line would repeat them
      const onFile = new Set(people.flatMap((e) => (e.history ?? []).map((h) => `${e.staffId}|${h.date}|${h.by ?? ''}`)));
      for (const a of hireAudit)
        if (a.area === 'Employee' && ids.has(a.ref)) {
          const date = dateOfStamp(a.at);
          if (!a.action.startsWith('Sensitive') && onFile.has(`${a.ref}|${date}|${a.by}`)) continue;
          rows.push({ date, staffId: a.ref, what: a.action.replace(/^Sensitive · /, ''), source: 'Audit trail', by: a.by, sensitive: a.action.startsWith('Sensitive') });
        }
      for (const c of employeeChanges)
        if (ids.has(c.staffId)) {
          const sensitive = c.payload.newBasic !== undefined;
          rows.push({ date: c.requestedOn, staffId: c.staffId, what: `${CHANGE_LABEL[c.kind]} requested (${c.id}): ${c.summary}`, source: 'Change request', by: c.requestedBy, sensitive });
          if (c.decidedOn && c.decidedBy) rows.push({ date: c.decidedOn, staffId: c.staffId, what: `${CHANGE_LABEL[c.kind]} ${c.status.toLowerCase()} (${c.id})`, source: 'Change request', by: c.decidedBy, sensitive });
        }
      for (const e of people)
        for (const h of e.history ?? []) rows.push({ date: h.date, staffId: e.staffId, what: `${h.kind}: ${h.summary}${h.ref ? ` (${h.ref})` : ''}`, source: 'Employee file', by: h.by ?? '—', sensitive: /salary|basic|demot|promot|increment|suspen|KES/i.test(`${h.kind} ${h.summary}`) });
      const list = rows.filter((r) => r.date >= from && r.date <= to && (!sensitiveOnly || r.sensitive)).sort((a, b) => b.date.localeCompare(a.date) || a.staffId.localeCompare(b.staffId));
      return {
        title: 'Master data changes',
        subtitle: `${scopeLabel} · ${fmtDate(from)} – ${fmtDate(to)}${sensitiveOnly ? ' · sensitive only' : ''}`,
        kpis: [
          { label: 'Changes', value: String(list.length) },
          { label: 'Sensitive', value: String(list.filter((r) => r.sensitive).length), sub: 'Pay, bank, ID, status' },
          { label: 'Employees affected', value: String(new Set(list.map((r) => r.staffId)).size) },
          { label: 'Changed by', value: String(new Set(list.map((r) => r.by)).size), sub: 'Different people' }
        ],
        sections: [
          {
            columns: [{ label: 'Date' }, { label: 'Staff no.' }, { label: 'Employee' }, { label: 'What changed' }, { label: 'Source' }, { label: 'By' }, { label: 'Sensitive' }],
            rows: list.map((r) => [fmtDate(r.date), r.staffId, nameOf(r.staffId), r.what, r.source, r.by, r.sensitive ? 'Yes' : ''])
          }
        ],
        landscape: true,
        footnote: 'Combines the Employee Master audit trail, approved and rejected change requests, and dated entries on each employee file. Sensitive fields are shown masked in the audit trail.',
        signatures: ['Reviewed by (Internal Audit)', 'Approved by (HR Manager)']
      };
    }
    // Staff list with contacts, grouped by department
    const depts = [...new Set(live.map((e) => e.department))].sort();
    const body: (string | number)[][] = [];
    const headings: number[] = [];
    for (const d of depts) {
      headings.push(body.length);
      body.push([d]);
      live
        .filter((e) => e.department === d)
        .sort(byName)
        .forEach((e) => body.push([e.staffId, e.fullName, ...co(e), e.jobTitle, e.phone, e.email, e.phoneExtension ?? '', e.emergencyContact ? `${e.emergencyContact.name} (${e.emergencyContact.relationship}) ${e.emergencyContact.phone}` : e.nextOfKin ? `${e.nextOfKin.name} (${e.nextOfKin.relationship}) ${e.nextOfKin.phone}` : '', STATUS_LABEL[e.status]]));
    }
    return {
      title: 'Staff list with contacts',
      subtitle: `${scopeLabel} · as at ${fmtDate(today)}`,
      kpis: [
        { label: 'Staff', value: String(live.length) },
        { label: 'Departments', value: String(depts.length) },
        { label: 'No emergency contact', value: String(live.filter((e) => !e.emergencyContact && !e.nextOfKin).length) }
      ],
      sections: [{ columns: [{ label: 'Staff no.' }, { label: 'Name' }, ...coCol, { label: 'Job title' }, { label: 'Phone' }, { label: 'Work email' }, { label: 'Ext.' }, { label: 'Emergency contact' }, { label: 'Status' }], rows: body }],
      headingRows: { 0: headings },
      landscape: true,
      footnote: 'Internal use only — contains personal contact details. Do not share outside the company.'
    };
  })();

  const dated = reportId === 'movement' || reportId === 'changes';
  return (
    <div className="pr-builder">
      <div className="pr-builder-panel pr-card" style={{ marginBottom: 0 }}>
        <div>
          <h4>Report</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {REPORTS.map((r, i) => (
              <React.Fragment key={r.id}>
                {(i === 0 || REPORTS[i - 1].group !== r.group) && <h4 style={{ margin: '8px 0 2px' }}>{r.group}</h4>}
                <button
                  onClick={() => setReportId(r.id)}
                  className="btn btn-secondary"
                  style={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                    padding: '8px 10px',
                    borderColor: reportId === r.id ? 'var(--brand-primary)' : undefined,
                    background: reportId === r.id ? 'var(--brand-subtle)' : undefined
                  }}
                >
                  <strong style={{ fontSize: 12.5, color: reportId === r.id ? 'var(--brand-primary)' : undefined }}>{r.name}</strong>
                  <span className="pr-muted" style={{ fontWeight: 400, whiteSpace: 'normal' }}>
                    {r.about}
                  </span>
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>
        <div>
          <h4>Scope</h4>
          <select className="form-control" value={scope} onChange={(ev) => setScope(ev.target.value as 'company' | 'group')}>
            <option value="company">This company</option>
            <option value="group">Whole group ({tenantOrganizations.length} companies)</option>
          </select>
        </div>
        {reportId === 'headcount' && (
          <div>
            <h4>Count by</h4>
            <select className="form-control" value={dim} onChange={(ev) => setDim(ev.target.value as Dim)}>
              {(Object.keys(DIMS) as Dim[]).map((k) => (
                <option key={k} value={k}>
                  {DIMS[k].label}
                </option>
              ))}
            </select>
          </div>
        )}
        {dated && (
          <div className="pr-form-grid">
            <label className="req-field">
              <span>From</span>
              <input type="date" className="form-control" value={from} max={to} onChange={(ev) => setFrom(ev.target.value)} />
            </label>
            <label className="req-field">
              <span>To</span>
              <input type="date" className="form-control" value={to} min={from} onChange={(ev) => setTo(ev.target.value)} />
            </label>
          </div>
        )}
        {reportId === 'changes' && (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
            <input type="checkbox" checked={sensitiveOnly} onChange={(ev) => setSensitiveOnly(ev.target.checked)} /> Sensitive changes only
          </label>
        )}
        {reportId === 'anniversaries' && (
          <div>
            <h4>Month</h4>
            <select className="form-control" value={month} onChange={(ev) => setMonth(ev.target.value)}>
              {[0, 1, 2, -1].map((k) => {
                const m = monthOf(addMonths(`${monthOf(today)}-01`, k));
                return (
                  <option key={m} value={m}>
                    {fmtDate(m)}
                    {k === 0 ? ' (this month)' : k === 1 ? ' (next month)' : ''}
                  </option>
                );
              })}
            </select>
          </div>
        )}
        {reportId === 'retirements' && (
          <div>
            <h4>Look ahead</h4>
            <select className="form-control" value={ahead} onChange={(ev) => setAhead(Number(ev.target.value))}>
              {[3, 6, 12, 24].map((m) => (
                <option key={m} value={m}>
                  Next {m} months
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div>
        <ReportPaper report={report} company={scope === 'company' ? companyName(selectedOrgId) : `All companies (${tenantOrganizations.length})`} />
      </div>
    </div>
  );
};
