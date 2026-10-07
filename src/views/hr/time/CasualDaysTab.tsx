import React, { useMemo } from 'react';
import { Download } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { Pager, usePaged } from '../../../components/common/Pager';
import { isCasual } from '../../../data/timeConfig';
import { addDays, casualService, downloadCsv, fmtShort, weekStart, weeklyDays } from '../../../data/timeEngine';
import { EmpCell, Empty, NotTracked, Pill, useTimeOrg } from './shared';

const STATE_CLS = { OK: 'success', WATCH: 'info', HOLD: 'warning', CONVERT: 'critical' } as const;
export const STATE_LABEL = { OK: 'Within limits', WATCH: 'Watch', HOLD: 'Hold engagement', CONVERT: 'Convert terms' } as const;

export const CasualDaysTab: React.FC = () => {
  const { setCurrentView, setModuleTab } = useApp();
  const { staff, days, tracked, today } = useTimeOrg();
  const weeks = useMemo(() => Array.from({ length: 6 }, (_, i) => addDays(weekStart(today), -7 * (5 - i))), [today]);
  const thisMonth = today.slice(0, 7);
  const lastMonth = addDays(`${thisMonth}-01`, -1).slice(0, 7);
  const rows = useMemo(
    () =>
      staff
        .filter(isCasual)
        .map((e) => {
          const mine = days.filter((d) => d.staffId === e.staffId);
          const w = weeklyDays(mine);
          const worked = mine.filter((d) => d.punches.some((p) => p.dir === 'IN'));
          return {
            e,
            weeks: weeks.map((wk) => w.get(wk) ?? 0),
            month: worked.filter((d) => d.date.startsWith(thisMonth)).length,
            prev: worked.filter((d) => d.date.startsWith(lastMonth)).length,
            service: casualService(e.staffId, mine, today)
          };
        }),
    [staff, days, weeks, thisMonth, lastMonth, today]
  );
  const pg = usePaged(rows, 25);

  if (!tracked) return <NotTracked />;

  const exportCsv = () =>
    downloadCsv(`casual-days-${today}.csv`, [
      ['Staff ID', 'Name', 'Daily rate', ...weeks.map((w) => `Week of ${w}`), `Days ${lastMonth}`, `Days ${thisMonth}`, `Wages ${thisMonth} (est.)`, 's.37 status'],
      ...rows.map((r) => [r.e.staffId, r.e.fullName, r.e.payRateKes ?? 0, ...r.weeks, r.prev, r.month, r.month * (r.e.payRateKes ?? 0), STATE_LABEL[r.service.state]])
    ]);

  return (
    <div className="pr-card">
      <div className="pr-card-head">
        <div>
          <h3>Casual days worked</h3>
          <p>Days with a punch-in, by week and month, for daily-rated staff. Payroll keeps its own day counts for now; use the export to check them.</p>
        </div>
        <button className="btn btn-secondary" onClick={exportCsv}>
          <Download size={14} /> Export
        </button>
      </div>
      <div className="pr-table-scroll">
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Worker</th>
              {weeks.map((w) => (
                <th key={w} className="num" title={`Week starting ${w}`}>
                  {fmtShort(w).slice(4)}
                </th>
              ))}
              <th className="num">Last month</th>
              <th className="num">This month</th>
              <th className="num">Wages to date (KES)</th>
              <th>Service (s.37)</th>
            </tr>
          </thead>
          <tbody>
            {pg.total === 0 && <Empty cols={11}>No daily-rated staff in this company.</Empty>}
            {pg.rows.map((r) => (
              <tr key={r.e.staffId}>
                <td>
                  <EmpCell e={r.e} id={r.e.staffId} sub={`KES ${(r.e.payRateKes ?? 0).toLocaleString()} a day`} />
                </td>
                {r.weeks.map((n, i) => (
                  <td key={i} className="num">
                    <span className={`tm-daycount d${Math.min(n, 6)}`}>{n}</span>
                  </td>
                ))}
                <td className="num">{r.prev}</td>
                <td className="num">
                  <strong>{r.month}</strong>
                </td>
                <td className="num">{(r.month * (r.e.payRateKes ?? 0)).toLocaleString()}</td>
                <td>
                  <button className="tm-pill-btn" onClick={() => (setModuleTab('disciplinary', 'compliance'), setCurrentView('disciplinary'))} title={r.service.reason}>
                    <Pill cls={STATE_CLS[r.service.state]}>{STATE_LABEL[r.service.state]}</Pill>
                  </button>
                  <div className="muted">{r.service.aggregateDays} continuous days</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager p={pg} noun="workers" />
    </div>
  );
};

export { STATE_CLS };
