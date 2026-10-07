import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { Pager, usePaged } from '../../../components/common/Pager';
import { TIME_RULES } from '../../../data/timeConfig';
import { addDays, downloadCsv, fmtDate, fmtMin, hrs, type DayRecord } from '../../../data/timeEngine';
import { Chips, DAY_STATUS, EmpCell, Empty, NotTracked, StatusPill, departmentsOf, useTimeOrg } from './shared';

type Filter = 'ALL' | 'IN' | 'LATE' | 'ABSENT' | 'LEAVE' | 'OFF' | 'PENDING';

const groupOf = (d: DayRecord): Filter => {
  if (d.status === 'ABSENT' || d.status === 'SUSPENDED') return 'ABSENT';
  if (d.status === 'LEAVE') return 'LEAVE';
  if (d.status === 'NOT_IN_YET') return 'PENDING';
  if (d.status === 'OFF' || d.status === 'HOLIDAY' || d.status === 'NOT_ENGAGED') return 'OFF';
  if (d.lateMin) return 'LATE';
  return 'IN';
};

export const MusterTab: React.FC = () => {
  const { byId, days, staff, tracked, today } = useTimeOrg();
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [dept, setDept] = useState('');
  const [q, setQ] = useState('');
  const earliest = addDays(today, -TIME_RULES.historyDays);

  const dayRows = useMemo(() => days.filter((d) => d.date === date), [days, date]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: dayRows.length, IN: 0, LATE: 0, ABSENT: 0, LEAVE: 0, OFF: 0, PENDING: 0 };
    for (const d of dayRows) c[groupOf(d)]++;
    // Late people are also in
    c.IN += c.LATE;
    return c;
  }, [dayRows]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return dayRows
      .filter((d) => filter === 'ALL' || groupOf(d) === filter || (filter === 'IN' && groupOf(d) === 'LATE'))
      .filter((d) => !dept || byId.get(d.staffId)?.department === dept)
      .filter((d) => !s || `${d.staffId} ${byId.get(d.staffId)?.fullName}`.toLowerCase().includes(s))
      .sort((a, b) => (byId.get(a.staffId)?.department ?? '').localeCompare(byId.get(b.staffId)?.department ?? '') || a.staffId.localeCompare(b.staffId));
  }, [dayRows, filter, dept, q, byId]);
  const pg = usePaged(rows, 25, `${date}|${filter}|${dept}|${q}`);

  if (!tracked) return <NotTracked />;

  const exportCsv = () =>
    downloadCsv(`muster-${date}.csv`, [
      ['Staff ID', 'Name', 'Department', 'Shift', 'In', 'Out', 'Hours', 'Late (min)', 'Status'],
      ...rows.map((d) => {
        const e = byId.get(d.staffId);
        return [d.staffId, e?.fullName ?? '', e?.department ?? '', d.schedule.name, d.inMin !== undefined ? fmtMin(d.inMin) : '', d.outMin !== undefined ? fmtMin(d.outMin) : '', d.workedH, d.lateMin, DAY_STATUS[d.status].label];
      })
    ]);

  const rate = counts.ALL - counts.OFF - counts.LEAVE - counts.PENDING > 0 ? Math.round((counts.IN / (counts.ALL - counts.OFF - counts.LEAVE - counts.PENDING)) * 100) : 0;

  return (
    <div className="pr-card">
      <div className="pr-card-head">
        <div>
          <h3>Daily muster roll</h3>
          <p>
            {fmtDate(date, true)} · {dayRows.length} on the roll · {rate}% of those rostered are in
          </p>
        </div>
        <div className="pr-toolbar">
          <button className="btn btn-secondary tm-icon-btn" aria-label="Previous day" disabled={date <= earliest} onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeft size={15} />
          </button>
          <input className="form-control" type="date" aria-label="Muster date" value={date} min={earliest} max={today} onChange={(ev) => ev.target.value && setDate(ev.target.value)} />
          <button className="btn btn-secondary tm-icon-btn" aria-label="Next day" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}>
            <ChevronRight size={15} />
          </button>
          {date !== today && (
            <button className="btn btn-secondary" onClick={() => setDate(today)}>
              Today
            </button>
          )}
        </div>
      </div>

      <Chips
        label="Muster status"
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'ALL', label: 'Everyone', n: counts.ALL },
          { id: 'IN', label: 'In', n: counts.IN },
          { id: 'LATE', label: 'Late', n: counts.LATE },
          { id: 'ABSENT', label: 'Absent', n: counts.ABSENT },
          { id: 'LEAVE', label: 'On leave', n: counts.LEAVE },
          { id: 'PENDING', label: 'Not in yet', n: counts.PENDING },
          { id: 'OFF', label: 'Off / not rostered', n: counts.OFF }
        ]}
      />

      <div className="pr-toolbar" style={{ margin: '12px 0' }}>
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
        <button className="btn btn-secondary" onClick={exportCsv}>
          <Download size={14} /> Export
        </button>
      </div>

      <div className="pr-table-scroll">
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Shift</th>
              <th>In</th>
              <th>Out</th>
              <th className="num">Hours</th>
              <th>Status</th>
              <th>Captured by</th>
            </tr>
          </thead>
          <tbody>
            {pg.total === 0 && <Empty cols={7}>Nobody matches these filters.</Empty>}
            {pg.rows.map((d) => {
              const e = byId.get(d.staffId);
              const first = d.punches[0];
              return (
                <tr key={d.key}>
                  <td>
                    <EmpCell e={e} id={d.staffId} sub={e?.department} />
                  </td>
                  <td>
                    {d.schedule.name}
                    <div className="muted">
                      {fmtMin(d.schedule.start)}–{fmtMin(d.schedule.end)}
                      {!d.scheduled && !d.holiday ? ' · not rostered' : ''}
                    </div>
                  </td>
                  <td className="tm-mono">
                    {d.inMin !== undefined ? fmtMin(d.inMin) : '—'}
                    {d.lateMin > 0 && <div className="tm-late">+{d.lateMin} min</div>}
                  </td>
                  <td className="tm-mono">
                    {d.outMin !== undefined ? fmtMin(d.outMin) : '—'}
                    {d.earlyMin > 0 && <div className="tm-late">−{d.earlyMin} min</div>}
                  </td>
                  <td className="num">
                    {d.workedH ? hrs(d.workedH) : '—'}
                    {d.ot15 + d.ot20 > 0 && <div className="muted">OT {d.ot15 + d.ot20} h</div>}
                  </td>
                  <td>
                    <StatusPill d={d} />
                    {d.status === 'ABSENT' && d.pendingLeave && <div className="muted">{d.pendingLeave} pending</div>}
                  </td>
                  <td>
                    {first ? (
                      <span className="muted">
                        {first.device}
                        {d.punches.some((p) => p.source === 'MANUAL') ? ' · corrected' : ''}
                        {d.punches.some((p) => p.geo === 'OUTSIDE') ? ' · outside geofence' : ''}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="staff" />
    </div>
  );
};
