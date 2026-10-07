import React, { useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { fmtDate } from '../../../data/hireEngine';
import { POLICY_NOTES, STAGES, STAGE_LABEL, eligibility, type CyclePhase } from '../../../data/perfConfig';
import { average, checkInOverdue, isOverdue, stageDue } from '../../../data/perfEngine';
import { Card, EmpCell, Empty, StagePill, usePerfData } from './shared';

export const OverviewTab: React.FC = () => {
  const { checkIns, perfToday, hrEmployees, perfSettings, setModuleTab } = useApp();
  const { cycle, aps, goalsBy, person, ratingOf } = usePerfData();

  const phaseProgress = (p: CyclePhase) => {
    const n = aps.length || 1;
    const ci = (q: number) => checkIns.filter((c) => c.cycleId === cycle!.id && c.quarter === q && c.heldOn).length;
    const count = {
      GOALS: aps.filter((a) => (goalsBy.get(a.staffId) ?? []).every((g) => g.status === 'APPROVED')).length,
      Q1: ci(1),
      MID: ci(2),
      Q3: ci(3),
      SELF: aps.filter((a) => a.selfOn).length,
      SUPERVISOR: aps.filter((a) => a.supOn).length,
      HOD: aps.filter((a) => a.hodOn || (a.supOn && !a.hodId)).length,
      CALIBRATION: aps.filter((a) => a.releasedOn).length,
      ACK: aps.filter((a) => a.ack).length
    }[p.key];
    return { count, pct: Math.round((count / n) * 100) };
  };

  const byStage = STAGES.map((s) => ({ s, n: aps.filter((a) => a.stage === s || (s === 'ACKNOWLEDGEMENT' && a.stage === 'DISPUTED')).length }));

  const depts = useMemo(() => {
    const m = new Map<string, typeof aps>();
    aps.forEach((a) => {
      const d = person(a.staffId)?.department ?? '—';
      m.set(d, [...(m.get(d) ?? []), a]);
    });
    return [...m.entries()]
      .map(([d, list]) => {
        const rated = list.map((a) => ratingOf(a).rating).filter((r): r is NonNullable<typeof r> => !!r);
        return {
          d,
          n: list.length,
          self: list.filter((a) => a.selfOn).length,
          released: list.filter((a) => a.releasedOn).length,
          avg: average(rated),
          overdue: checkIns.filter((c) => c.cycleId === cycle!.id && list.some((a) => a.staffId === c.staffId) && checkInOverdue(c, perfToday)).length
        };
      })
      .sort((a, b) => a.d.localeCompare(b.d));
  }, [aps, person, ratingOf, checkIns, cycle, perfToday]);

  const overdue = useMemo(() => {
    const rows: { staffId: string; what: string; due: string; owner?: string }[] = [];
    checkIns
      .filter((c) => c.cycleId === cycle!.id && checkInOverdue(c, perfToday))
      .forEach((c) => rows.push({ staffId: c.staffId, what: `Q${c.quarter} check-in`, due: c.due, owner: aps.find((a) => a.staffId === c.staffId)?.appraiserId }));
    aps
      .filter((a) => isOverdue(a, cycle, perfToday))
      .forEach((a) => rows.push({ staffId: a.staffId, what: STAGE_LABEL[a.stage], due: stageDue(a, cycle)!, owner: a.stage === 'SELF' || a.stage === 'ACKNOWLEDGEMENT' ? a.staffId : a.stage === 'HOD' ? a.hodId : a.appraiserId }));
    aps
      .filter((a) => (goalsBy.get(a.staffId) ?? []).some((g) => g.status === 'SUBMITTED'))
      .forEach((a) => rows.push({ staffId: a.staffId, what: 'Goal sheet waiting for approval', due: '2026-01-31', owner: a.appraiserId }));
    return rows.sort((a, b) => a.due.localeCompare(b.due));
  }, [checkIns, cycle, perfToday, aps, goalsBy]);
  const paged = usePaged(overdue, 10);

  const excluded = useMemo(() => {
    const m = new Map<string, number>();
    hrEmployees
      .filter((e) => e.orgId === cycle!.orgId)
      .forEach((e) => {
        const el = eligibility(e, cycle!, perfSettings);
        if (!el.ok) m.set(el.reason!, (m.get(el.reason!) ?? 0) + 1);
      });
    return [...m.entries()];
  }, [hrEmployees, cycle, perfSettings]);

  const state = (p: CyclePhase, pct: number) => (pct >= 100 ? 'done' : p.due < perfToday ? 'late' : cycle!.phases.findIndex((x) => x.due >= perfToday) === cycle!.phases.indexOf(p) ? 'now' : '');

  return (
    <div className="pf-stack">
      <Card title={`${cycle!.name} — ${fmtDate(cycle!.periodStart)} to ${fmtDate(cycle!.periodEnd)}`} sub={`Year-end review window opened ${fmtDate(cycle!.reviewOpens)}. Scores: goals ${perfSettings.goalsWeight}% + core competencies ${perfSettings.competencyWeight}%.`}>
        <ol className="pf-timeline">
          {cycle!.phases.map((p) => {
            const pr = phaseProgress(p);
            return (
              <li key={p.key} className={state(p, pr.pct)}>
                <span className="pf-dot" />
                <div>
                  <strong>{p.label}</strong>
                  <span>Due {fmtDate(p.due)}</span>
                  <span>
                    {pr.count} of {aps.length} · {pr.pct}%
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <div className="pf-two">
        <Card title="Where appraisals are" sub="Click a stage to open the appraisal list.">
          <div className="pf-funnel">
            {byStage.map(({ s, n }) => (
              <button key={s} className="pf-funnel-row" onClick={() => setModuleTab('performance', s === 'CALIBRATION' ? 'calibration' : 'appraisals')}>
                <span className="pf-funnel-label">{STAGE_LABEL[s]}</span>
                <span className="pf-funnel-bar">
                  <span style={{ width: `${aps.length ? (n / aps.length) * 100 : 0}%` }} />
                </span>
                <strong>{n}</strong>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Who is appraised" sub={`${aps.length} employees in the cycle.`}>
          <ul className="pf-list">
            {excluded.map(([r, n]) => (
              <li key={r}>
                <span>{r}</span>
                <strong>{n}</strong>
              </li>
            ))}
          </ul>
          <div className="pr-note" style={{ marginTop: 12 }}>
            {POLICY_NOTES[0]}
          </div>
        </Card>
      </div>

      <div className="hr-table-card">
        <div className="pf-table-head">
          <h3>Departments</h3>
        </div>
        <div className="pf-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Department</th>
                <th className="num">People</th>
                <th className="num">Self-assessed</th>
                <th className="num">Released</th>
                <th className="num">Average rating</th>
                <th className="num">Overdue check-ins</th>
              </tr>
            </thead>
            <tbody>
              {depts.map((d) => (
                <tr key={d.d}>
                  <td>{d.d}</td>
                  <td className="num">{d.n}</td>
                  <td className="num">{Math.round((d.self / d.n) * 100)}%</td>
                  <td className="num">{Math.round((d.released / d.n) * 100)}%</td>
                  <td className="num">{d.avg !== null ? d.avg.toFixed(2) : '—'}</td>
                  <td className="num">{d.overdue || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hr-table-card">
        <div className="pf-table-head">
          <h3>Overdue and waiting</h3>
          <span className="pf-muted">{overdue.length} items</span>
        </div>
        <div className="pf-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Item</th>
                <th>Due</th>
                <th>With</th>
              </tr>
            </thead>
            <tbody>
              {!paged.rows.length && <Empty cols={4}>Nothing overdue.</Empty>}
              {paged.rows.map((r, i) => {
                const ap = aps.find((a) => a.staffId === r.staffId);
                return (
                  <tr key={`${r.staffId}${r.what}${i}`}>
                    <td>
                      <EmpCell e={person(r.staffId)} id={r.staffId} />
                    </td>
                    <td>{r.what === STAGE_LABEL.SELF && ap ? <StagePill stage={ap.stage} overdue /> : r.what}</td>
                    <td className={r.due < perfToday ? 'pf-late' : ''}>{fmtDate(r.due)}</td>
                    <td>{person(r.owner)?.fullName ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager p={paged} noun="items" />
      </div>
    </div>
  );
};
