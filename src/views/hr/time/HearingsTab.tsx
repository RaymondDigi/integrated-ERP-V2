import React, { useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { APPEAL_DAYS, CATEGORY_LABEL, type DisciplinaryCase } from '../../../data/discipline';
import { addDays, daysBetween, fmtDate } from '../../../data/timeEngine';
import { Empty, Pill } from './shared';

interface Item {
  date: string;
  time?: string;
  what: string;
  c: DisciplinaryCase;
}

export const HearingsTab: React.FC = () => {
  const { disciplinaryCases, selectedOrgId, hrEmployees, timeToday, setModuleTab } = useApp();
  const name = (id: string) => hrEmployees.find((e) => e.staffId === id)?.fullName ?? id;
  const items = useMemo(() => {
    const out: Item[] = [];
    for (const c of disciplinaryCases.filter((x) => x.orgId === selectedOrgId && x.stage !== 'CLOSED')) {
      if (c.stage === 'SHOW_CAUSE' && c.showCause && !c.showCause.response) out.push({ date: c.showCause.responseDue, what: 'Show-cause response due', c });
      if (c.stage === 'HEARING' && c.hearing) out.push({ date: c.hearing.date, time: c.hearing.time, what: `Hearing · ${c.hearing.venue} · representative: ${c.hearing.representative}`, c });
      if (c.stage === 'OUTCOME' && c.outcome) out.push({ date: addDays(c.outcome.decidedOn, APPEAL_DAYS), what: 'Appeal window closes', c });
      if (c.stage === 'APPEAL') out.push({ date: addDays(c.appeal!.lodgedOn, 14), what: 'Appeal decision due (target 14 days)', c });
      if (c.outcome?.suspension && c.outcome.suspension.to >= timeToday) out.push({ date: addDays(c.outcome.suspension.to, 1), what: 'Back from suspension', c });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
  }, [disciplinaryCases, selectedOrgId, timeToday]);

  return (
    <div className="pr-card">
      <div className="pr-card-head">
        <div>
          <h3>Hearings and deadlines</h3>
          <p>Everything with a date on open cases: response deadlines, hearings, appeal windows and returns from suspension.</p>
        </div>
      </div>
      <div className="pr-table-scroll">
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
              <th>Case</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <Empty cols={3}>Nothing scheduled.</Empty>}
            {items.map((x, i) => {
              const d = daysBetween(timeToday, x.date);
              return (
                <tr key={i} className="tm-click" onClick={() => (setModuleTab('disciplinary-case', x.c.id), setModuleTab('disciplinary', 'cases'))}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <strong>{fmtDate(x.date, true)}</strong>
                    {x.time ? ` ${x.time}` : ''}
                    <div>
                      <Pill cls={d < 0 ? 'critical' : d <= 2 ? 'warning' : 'primary'}>{d < 0 ? `${-d} days overdue` : d === 0 ? 'Today' : `In ${d} day${d > 1 ? 's' : ''}`}</Pill>
                    </div>
                  </td>
                  <td>{x.what}</td>
                  <td>
                    <strong>{x.c.id}</strong> · {name(x.c.staffId)}
                    <div className="muted">{CATEGORY_LABEL[x.c.category]}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
