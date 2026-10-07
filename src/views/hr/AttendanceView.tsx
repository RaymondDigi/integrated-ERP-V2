import React, { useMemo } from 'react';
import { AlarmClock, ArrowLeft, CalendarClock, ChevronRight, Clock, Fingerprint, ListChecks, Timer, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TIME_RULES } from '../../data/timeConfig';
import { addDays, exceptionsOf } from '../../data/timeEngine';
import { useTimeOrg } from './time/shared';
import { MusterTab } from './time/MusterTab';
import { TimesheetsTab } from './time/TimesheetsTab';
import { ExceptionsTab } from './time/ExceptionsTab';
import { OvertimeTab } from './time/OvertimeTab';
import { CasualDaysTab } from './time/CasualDaysTab';
import { PunchLogTab } from './time/PunchLogTab';
import { SchedulesTab } from './time/SchedulesTab';

export const ATTENDANCE_TABS = [
  { id: 'muster', label: 'Daily muster', icon: Users },
  { id: 'timesheets', label: 'Timesheets', icon: CalendarClock },
  { id: 'exceptions', label: 'Exceptions', icon: ListChecks },
  { id: 'overtime', label: 'Overtime to payroll', icon: Timer },
  { id: 'casuals', label: 'Casual days', icon: AlarmClock },
  { id: 'punches', label: 'Punch log', icon: Fingerprint },
  { id: 'schedules', label: 'Schedules & rules', icon: Clock }
];

export const AttendanceView: React.FC = () => {
  const { setCurrentView, moduleTabs, setModuleTab, activeTenant, timeDecisions, payrollOpenPeriod } = useApp();
  const tab = moduleTabs['attendance'] ?? 'muster';
  const { days, today, tracked } = useTimeOrg();

  const stats = useMemo(() => {
    const t = days.filter((d) => d.date === today);
    const present = t.filter((d) => d.punches.some((p) => p.dir === 'IN')).length;
    const late = t.filter((d) => d.lateMin > 0).length;
    const absent = t.filter((d) => d.status === 'ABSENT').length;
    // Expected so far today: everyone in plus rostered staff who are absent (later shifts not counted yet)
    const rostered = present + absent;
    const later = t.filter((d) => d.status === 'NOT_IN_YET').length;
    const month = days.filter((d) => d.date.startsWith(payrollOpenPeriod.key));
    const ot = month.reduce((n, d) => n + d.ot15 + d.ot20, 0);
    const otApproved = month.reduce((n, d) => n + (timeDecisions[`OVERTIME|${d.key}`]?.status === 'APPROVED' ? d.ot15 + d.ot20 : 0), 0);
    const sched = month.filter((d) => d.scheduled && !d.casual && d.status !== 'LEAVE' && d.status !== 'NOT_IN_YET' && d.status !== 'SUSPENDED');
    const attended = sched.filter((d) => d.punches.some((p) => p.dir === 'IN')).length;
    const open = exceptionsOf(days, addDays(today, -TIME_RULES.queueDays)).filter((x) => !timeDecisions[x.key]).length;
    return { present, late, absent, rostered, ot, otApproved, later, rate: sched.length ? (attended / sched.length) * 100 : 0, open, onLeave: t.filter((d) => d.status === 'LEAVE').length };
  }, [days, today, payrollOpenPeriod.key, timeDecisions]);

  return (
    <div className="hr-app-view">
      <div className="hr-app-header">
        <div>
          <div className="hr-breadcrumb-bar">
            <button className="hr-breadcrumb-btn" onClick={() => setCurrentView('apps')}>
              <ArrowLeft size={13} /> Return to Apps Launcher
            </button>
            <span>/</span>
            <span>Process #05</span>
            <span>/</span>
            <span>{ATTENDANCE_TABS.find((t) => t.id === tab)?.label ?? 'Daily muster'}</span>
          </div>

          <div className="hr-app-title-group">
            <div className="hr-app-icon-wrapper" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
              <Clock size={22} />
            </div>
            <div>
              <h1>
                <span>Time & Attendance</span>
                <span className="digicraft-badge-light">Process #05</span>
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                {activeTenant.name}: shifts, muster roll, timesheets, exceptions and overtime for payroll.
              </p>
            </div>
          </div>
        </div>

        <div className="hr-app-actions">
          <button className="btn btn-primary" onClick={() => setCurrentView('leave')}>
            <span>Go to Leave (#06)</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {tracked && (
        <div className="hr-stats-row">
          <div className="hr-stat-card">
            <div className="hr-stat-label">Present today</div>
            <div className="hr-stat-value" style={{ color: 'var(--status-success)' }}>
              {stats.present}
              <span className="tm-stat-of"> / {stats.rostered}</span>
            </div>
            <div className="hr-stat-subtext">
              {stats.late} late · {stats.onLeave} on leave{stats.later ? ` · ${stats.later} due later` : ''}
            </div>
          </div>
          <div className="hr-stat-card">
            <div className="hr-stat-label">Absent today</div>
            <div className="hr-stat-value" style={{ color: stats.absent ? 'var(--status-critical)' : undefined }}>
              {stats.absent}
            </div>
            <div className="hr-stat-subtext">
              <button className="tm-link" onClick={() => setModuleTab('attendance', 'exceptions')}>
                {stats.open} exceptions to review
              </button>
            </div>
          </div>
          <div className="hr-stat-card">
            <div className="hr-stat-label">Overtime, {payrollOpenPeriod.label}</div>
            <div className="hr-stat-value">{stats.ot} h</div>
            <div className="hr-stat-subtext">{stats.otApproved} h approved</div>
          </div>
          <div className="hr-stat-card">
            <div className="hr-stat-label">Attendance rate</div>
            <div className="hr-stat-value">{stats.rate.toFixed(1)}%</div>
            <div className="hr-stat-subtext">Rostered days attended this month</div>
          </div>
        </div>
      )}

      <div className="pr-tabstrip" role="tablist" aria-label="Attendance sections">
        {ATTENDANCE_TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setModuleTab('attendance', t.id)}>
              <Icon size={14} /> {t.label}
              {t.id === 'exceptions' && stats.open > 0 && <span className="tm-tab-count">{stats.open}</span>}
            </button>
          );
        })}
      </div>

      {tab === 'muster' && <MusterTab />}
      {tab === 'timesheets' && <TimesheetsTab />}
      {tab === 'exceptions' && <ExceptionsTab />}
      {tab === 'overtime' && <OvertimeTab />}
      {tab === 'casuals' && <CasualDaysTab />}
      {tab === 'punches' && <PunchLogTab />}
      {tab === 'schedules' && <SchedulesTab />}
    </div>
  );
};
