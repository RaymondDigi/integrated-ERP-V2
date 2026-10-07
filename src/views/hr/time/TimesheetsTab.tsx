import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { Modal } from '../payroll/shared';
import { TIME_RULES, isCasual } from '../../../data/timeConfig';
import { addDays, downloadCsv, exKey, fmtDate, fmtMin, fmtShort, hrs, monthEnd, summarise, weekStart, type DayRecord, type TimesheetRow } from '../../../data/timeEngine';
import { EmpCell, Empty, NotTracked, StatusPill, departmentsOf, useTimeOrg } from './shared';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface TimePeriod {
  id: string;
  label: string;
  from: string;
  to: string;
}

/** This week, last week and the months the terminals hold. */
export const usePeriods = (): TimePeriod[] => {
  const { timeToday } = useApp();
  return useMemo(() => {
    const wk = weekStart(timeToday);
    const out: TimePeriod[] = [
      { id: `W:${wk}`, label: `This week (from ${fmtShort(wk)})`, from: wk, to: addDays(wk, 6) },
      { id: `W:${addDays(wk, -7)}`, label: `Last week (from ${fmtShort(addDays(wk, -7))})`, from: addDays(wk, -7), to: addDays(wk, -1) }
    ];
    const first = addDays(timeToday, -TIME_RULES.historyDays);
    let y = Number(timeToday.slice(0, 4));
    let m = Number(timeToday.slice(5, 7));
    for (;;) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (monthEnd(key) < first) break;
      out.push({ id: `M:${key}`, label: `${MONTHS[m - 1]} ${y}`, from: `${key}-01`, to: monthEnd(key) });
      if (--m === 0) {
        m = 12;
        y--;
      }
    }
    return out;
  }, [timeToday]);
};

export const TimesheetsTab: React.FC = () => {
  const { timeDecisions } = useApp();
  const { byId, days, staff, tracked } = useTimeOrg();
  const periods = usePeriods();
  const [pid, setPid] = useState(periods[2]?.id ?? periods[0].id);
  const [dept, setDept] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const period = periods.find((p) => p.id === pid) ?? periods[0];

  const inPeriod = useMemo(() => days.filter((d) => d.date >= period.from && d.date <= period.to), [days, period]);
  const rows = useMemo(() => {
    const ids = [...new Set(inPeriod.map((d) => d.staffId))];
    const s = q.trim().toLowerCase();
    return ids
      .filter((id) => !dept || byId.get(id)?.department === dept)
      .filter((id) => !s || `${id} ${byId.get(id)?.fullName}`.toLowerCase().includes(s))
      .map((id) => summarise(id, inPeriod.filter((d) => d.staffId === id), timeDecisions))
      .sort((a, b) => (byId.get(a.staffId)?.department ?? '').localeCompare(byId.get(b.staffId)?.department ?? '') || a.staffId.localeCompare(b.staffId));
  }, [inPeriod, dept, q, byId, timeDecisions]);
  const pg = usePaged(rows, 25, `${pid}|${dept}|${q}`);

  if (!tracked) return <NotTracked />;

  const exportCsv = () =>
    downloadCsv(`timesheets-${period.from}-${period.to}.csv`, [
      ['Staff ID', 'Name', 'Department', 'Days rostered', 'Days worked', 'Hours worked', 'Normal hours', 'OT 1.5x (h)', 'OT 2x (h)', 'OT approved 1.5x', 'OT approved 2x', 'Late count', 'Late minutes', 'Absent days', 'Unauthorised', 'Leave days'],
      ...rows.map((r) => {
        const e = byId.get(r.staffId);
        return [r.staffId, e?.fullName ?? '', e?.department ?? '', r.scheduledDays, r.daysWorked, hrs(r.workedH), hrs(r.normalH), r.ot15, r.ot20, r.ot15Approved, r.ot20Approved, r.lateCount, r.lateMin, r.absentDays, r.unauthorisedDays, r.leaveDays];
      })
    ]);

  const total = rows.reduce((t, r) => ({ worked: t.worked + r.workedH, ot15: t.ot15 + r.ot15, ot20: t.ot20 + r.ot20, late: t.late + r.lateCount, abs: t.abs + r.absentDays }), { worked: 0, ot15: 0, ot20: 0, late: 0, abs: 0 });

  return (
    <div className="pr-card">
      <div className="pr-card-head">
        <div>
          <h3>Timesheets</h3>
          <p>
            {fmtDate(period.from)} to {fmtDate(period.to)} · normal hours up to {TIME_RULES.hoursPerDay} a day ({TIME_RULES.hoursPerWeek} a week); overtime 1.5× on weekdays and Saturdays, 2× on Sundays and public holidays
          </p>
        </div>
        <button className="btn btn-secondary" onClick={exportCsv}>
          <Download size={14} /> Export
        </button>
      </div>
      <div className="pr-toolbar" style={{ marginBottom: 12 }}>
        <select className="form-control" aria-label="Period" value={pid} onChange={(ev) => setPid(ev.target.value)}>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <select className="form-control" aria-label="Department" value={dept} onChange={(ev) => setDept(ev.target.value)}>
          <option value="">All departments</option>
          {departmentsOf(staff).map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <div className="form-input-wrapper grow">
          <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-tertiary)' }} />
          <input className="form-control" style={{ paddingLeft: 30 }} placeholder="Search name or staff ID" value={q} onChange={(ev) => setQ(ev.target.value)} />
        </div>
      </div>
      <div className="pr-table-scroll">
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th className="num">Days worked</th>
              <th className="num">Hours</th>
              <th className="num">Normal</th>
              <th className="num">OT 1.5×</th>
              <th className="num">OT 2×</th>
              <th className="num">Late</th>
              <th className="num">Absent</th>
              <th className="num">Leave</th>
            </tr>
          </thead>
          <tbody>
            {pg.total === 0 && <Empty cols={9}>No timesheets for this period.</Empty>}
            {pg.rows.map((r) => {
              const e = byId.get(r.staffId);
              return (
                <tr key={r.staffId} className="tm-click" onClick={() => setOpen(r.staffId)} title="Open the daily timesheet">
                  <td>
                    <EmpCell e={e} id={r.staffId} sub={e && isCasual(e) ? 'Daily-rated' : e?.department} />
                  </td>
                  <td className="num">
                    {r.daysWorked}
                    <div className="muted">of {r.scheduledDays} rostered</div>
                  </td>
                  <td className="num">{hrs(r.workedH)}</td>
                  <td className="num">{hrs(r.normalH)}</td>
                  <td className="num">
                    {r.ot15 || '—'}
                    {r.ot15 > 0 && <div className="muted">{r.ot15Approved} approved</div>}
                  </td>
                  <td className="num">
                    {r.ot20 || '—'}
                    {r.ot20 > 0 && <div className="muted">{r.ot20Approved} approved</div>}
                  </td>
                  <td className="num">
                    {r.lateCount || '—'}
                    {r.lateCount > 0 && <div className="muted">{r.lateMin} min</div>}
                  </td>
                  <td className="num">
                    <span style={{ color: r.absentDays ? 'var(--status-critical)' : undefined }}>{r.absentDays || '—'}</span>
                    {r.unauthorisedDays > 0 && <div className="muted">{r.unauthorisedDays} unauthorised</div>}
                  </td>
                  <td className="num">{r.leaveDays || '—'}</td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td>{rows.length} staff</td>
                <td />
                <td className="num">{hrs(total.worked)}</td>
                <td />
                <td className="num">{total.ot15}</td>
                <td className="num">{total.ot20}</td>
                <td className="num">{total.late}</td>
                <td className="num">{total.abs}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <Pager p={pg} noun="staff" />
      {open && <TimesheetModal staffId={open} period={period} days={inPeriod.filter((d) => d.staffId === open)} onClose={() => setOpen(null)} />}
    </div>
  );
};

const TimesheetModal: React.FC<{ staffId: string; period: TimePeriod; days: DayRecord[]; onClose: () => void }> = ({ staffId, period, days, onClose }) => {
  const { timeDecisions, overtimeSent } = useApp();
  const { byId } = useTimeOrg();
  const e = byId.get(staffId);
  const r: TimesheetRow = summarise(staffId, days, timeDecisions);
  const otState = (d: DayRecord) => {
    const k = exKey('OVERTIME', d.staffId, d.date);
    if (overtimeSent[k]) return 'Paid / sent';
    return timeDecisions[k]?.status === 'APPROVED' ? 'Approved' : timeDecisions[k]?.status === 'REJECTED' ? 'Rejected' : 'Pending';
  };
  return (
    <Modal title={`Timesheet · ${e?.fullName ?? staffId}`} subtitle={`${staffId} · ${e?.department ?? ''} · ${fmtDate(period.from)} to ${fmtDate(period.to)}`} onClose={onClose} width={900}>
      <div className="pr-kv">
        <div>
          <span>Days worked</span>
          <strong>{r.daysWorked}</strong>
          <small>of {r.scheduledDays} rostered</small>
        </div>
        <div>
          <span>Hours worked</span>
          <strong>{hrs(r.workedH)}</strong>
          <small>{hrs(r.normalH)} normal</small>
        </div>
        <div>
          <span>Overtime</span>
          <strong>{r.ot15 + r.ot20} h</strong>
          <small>
            {r.ot15} h at 1.5× · {r.ot20} h at 2×
          </small>
        </div>
        <div>
          <span>Lateness</span>
          <strong>{r.lateCount}</strong>
          <small>{r.lateMin} min in total</small>
        </div>
        <div>
          <span>Absent</span>
          <strong>{r.absentDays}</strong>
          <small>{r.unauthorisedDays} unauthorised</small>
        </div>
      </div>
      <div className="pr-table-scroll">
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Shift</th>
              <th>In</th>
              <th>Out</th>
              <th className="num">Hours</th>
              <th className="num">OT</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.key}>
                <td>{fmtShort(d.date)}</td>
                <td className="muted">{d.scheduled ? `${d.schedule.name} ${fmtMin(d.schedule.start)}` : d.holiday ?? 'Rest day'}</td>
                <td className="tm-mono">
                  {d.inMin !== undefined ? fmtMin(d.inMin) : '—'}
                  {d.lateMin > 0 && <div className="tm-late">+{d.lateMin} min</div>}
                </td>
                <td className="tm-mono">
                  {d.outMin !== undefined ? fmtMin(d.outMin) : '—'}
                  {d.punches.some((p) => p.source === 'MANUAL') && <div className="muted">corrected</div>}
                </td>
                <td className="num">{d.workedH ? hrs(d.workedH) : '—'}</td>
                <td className="num">
                  {d.ot15 + d.ot20 > 0 ? `${d.ot15 + d.ot20} h ${d.ot20 ? '(2×)' : '(1.5×)'}` : '—'}
                  {d.ot15 + d.ot20 > 0 && <div className="muted">{otState(d)}</div>}
                </td>
                <td>
                  <StatusPill d={d} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
};
