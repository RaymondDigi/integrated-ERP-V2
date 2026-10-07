import React, { useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { DEVICE, RULE_LABEL, SCHEDULES, TIME_RULES, scheduleRuleFor, type ScheduleRule } from '../../../data/timeConfig';
import { addDays, fmtDate, fmtMin } from '../../../data/timeEngine';
import { NotTracked, useTimeOrg } from './shared';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const SchedulesTab: React.FC = () => {
  const { leaveHolidays, selectedOrgId } = useApp();
  const { staff, tracked, today } = useTimeOrg();
  const byRule = useMemo(() => {
    const m = new Map<ScheduleRule, Map<string, number>>();
    for (const e of staff.filter((x) => x.status !== 'TERMINATED')) {
      const r = scheduleRuleFor(e);
      const d = m.get(r) ?? new Map<string, number>();
      d.set(e.department, (d.get(e.department) ?? 0) + 1);
      m.set(r, d);
    }
    return m;
  }, [staff]);
  const holidays = leaveHolidays
    .filter((h) => (h.location === 'ALL' || h.location === selectedOrgId) && (h.observed ?? h.date) >= addDays(today, -TIME_RULES.historyDays) && (h.observed ?? h.date) <= addDays(today, 90))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!tracked) return <NotTracked />;

  return (
    <>
      <div className="tm-sched-grid">
        {Object.values(SCHEDULES).map((s) => (
          <div key={s.id} className="pr-card tm-sched">
            <h3>{s.name}</h3>
            <div className="tm-sched-time">
              {fmtMin(s.start)}–{fmtMin(s.end)}
            </div>
            <dl>
              <dt>Days</dt>
              <dd>{s.days.map((d) => DAYS[d]).join(', ')}</dd>
              <dt>Standard</dt>
              <dd>{s.hoursPerDay} h a day, including a {s.breakMin}-minute paid break</dd>
              <dt>Grace</dt>
              <dd>{s.graceMin} minutes</dd>
              <dt>Capture</dt>
              <dd>
                {s.punch === 'MOBILE' ? 'Mobile app with GPS geofence' : 'Biometric terminal'} · {DEVICE[s.id].site}
              </dd>
              <dt>Used by</dt>
              <dd>{s.appliesTo}</dd>
            </dl>
          </div>
        ))}
      </div>

      <div className="pr-card">
        <div className="pr-card-head">
          <div>
            <h3>Who works which schedule</h3>
            <p>Assigned from department and job title. Production lines rotate weekly between the day and night shifts.</p>
          </div>
        </div>
        <div className="pr-table-scroll">
          <table className="hr-table pr-table">
            <thead>
              <tr>
                <th>Schedule</th>
                <th>Departments</th>
                <th className="num">Staff</th>
              </tr>
            </thead>
            <tbody>
              {[...byRule.entries()].map(([r, depts]) => (
                <tr key={r}>
                  <td>{RULE_LABEL[r]}</td>
                  <td className="muted">{[...depts.entries()].map(([d, n]) => `${d} (${n})`).join(', ')}</td>
                  <td className="num">{[...depts.values()].reduce((a, b) => a + b, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tm-two">
        <div className="pr-card">
          <h3 className="tm-h3">Hours and overtime rules</h3>
          <ul className="tm-rules">
            <li>
              Normal hours: {TIME_RULES.hoursPerDay} a day, {TIME_RULES.hoursPerWeek} a week, Monday to Friday.
            </li>
            <li>Late if the first punch is after the start time plus the grace minutes; lateness is counted from the start time.</li>
            <li>Weekday overtime starts {TIME_RULES.otThresholdMin} minutes after the shift end and is counted in half hours at {TIME_RULES.weekdayRate}×.</li>
            <li>All hours on a Saturday are {TIME_RULES.saturdayRate}×; all hours on a Sunday or public holiday are {TIME_RULES.sundayHolidayRate}×.</li>
            <li>Approved leave, public holidays and suspension days are excused; a rostered day with no punches and no leave is an absence.</li>
            <li>Daily-rated staff are paid per day worked; their days off are not absences.</li>
          </ul>
        </div>
        <div className="pr-card">
          <h3 className="tm-h3">Public holidays</h3>
          <ul className="tm-rules">
            {holidays.map((h) => (
              <li key={h.id}>
                <strong>{fmtDate(h.observed ?? h.date, true)}</strong> · {h.name}
                {(h.observed ?? h.date) < today ? ' · worked hours paid at 2×' : ''}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
};
