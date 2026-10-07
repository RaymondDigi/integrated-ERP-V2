import React, { useMemo, useState } from 'react';
import { Lock, Send } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { fmtDate } from '../../../data/hireEngine';
import { POTENTIAL_LABEL, RATINGS, RATING_SCALE, type Appraisal, type Potential, type Rating } from '../../../data/perfConfig';
import { NINE_BOX, average, distribution, perfBand, potBand } from '../../../data/perfEngine';
import { Card, EmpCell, Empty, Field, Modal, PersonSelect, RatingPill, useActors, useHrActor, usePerfData } from './shared';

const POTS: Potential[] = ['HIGH', 'MEDIUM', 'LOW'];

export const CalibrationTab: React.FC = () => {
  const { calibrationLog, releaseRatings, priorRatings, perfSettings } = useApp();
  const { cycle, aps, person, ratingOf } = usePerfData();
  const actors = useActors();
  const hr = useHrActor();
  const [withProv, setWithProv] = useState(true);
  const [moving, setMoving] = useState<Appraisal | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [actor, setActor] = useState(hr);
  const [view, setView] = useState<'2026' | '2025'>('2026');

  const rated = useMemo(
    () =>
      aps
        .map((a) => ({ a, ...ratingOf(a) }))
        .filter((x) => x.rating && (withProv || ['CALIBRATION', 'ACKNOWLEDGEMENT', 'DISPUTED', 'CLOSED'].includes(x.a.stage)))
        .map((x) => ({ a: x.a, rating: x.rating!, provisional: x.provisional })),
    [aps, ratingOf, withProv]
  );
  const dist = distribution(rated.map((r) => r.rating));
  const guide = perfSettings.guideline;
  const queue = aps.filter((a) => a.stage === 'CALIBRATION');

  const depts = useMemo(() => {
    const m = new Map<string, number[]>();
    rated.forEach((r) => {
      const d = person(r.a.staffId)?.department ?? '—';
      m.set(d, [...(m.get(d) ?? []), r.rating]);
    });
    return [...m.entries()].map(([d, rs]) => ({ d, n: rs.length, avg: average(rs)!, high: Math.round((rs.filter((r) => r >= 4).length / rs.length) * 100), low: Math.round((rs.filter((r) => r <= 2).length / rs.length) * 100) })).sort((a, b) => b.avg - a.avg);
  }, [rated, person]);
  const companyAvg = average(rated.map((r) => r.rating));

  const box = (pot: Potential, perf: 0 | 1 | 2) =>
    view === '2026'
      ? rated.filter((r) => potBand(r.a.potential ?? 'MEDIUM') === potBand(pot) && perfBand(r.rating) === perf && r.a.potential).map((r) => ({ staffId: r.a.staffId, a: r.a, prov: r.provisional }))
      : priorRatings.filter((p) => p.potential === pot && perfBand(p.rating) === perf && person(p.staffId)?.orgId === cycle!.orgId).map((p) => ({ staffId: p.staffId, a: undefined, prov: false }));

  const log = calibrationLog.filter((c) => c.cycleId === cycle!.id);
  const logPaged = usePaged(log, 10);
  const max = Math.max(...dist.map((d) => d.pct), ...RATINGS.map((r) => guide[r] ?? 0), 1);

  return (
    <div className="pf-stack">
      <div className="pf-two">
        <Card
          title="Rating distribution vs guideline"
          sub={`${rated.length} people rated${withProv ? ' (includes provisional ratings from supervisors)' : ' (calibrated and proposed only)'}.`}
          actions={
            <label className="pf-check">
              <input type="checkbox" checked={withProv} onChange={(e) => setWithProv(e.target.checked)} /> Include provisional
            </label>
          }
        >
          <div className="pf-dist" role="img" aria-label="Distribution of ratings against the guideline">
            {dist.map((d) => (
              <div key={d.rating} className="pf-dist-col">
                <div className="pf-dist-bars">
                  <span className="actual" style={{ height: `${(d.pct / max) * 100}%` }} title={`${d.count} people · ${d.pct}%`}>
                    <em>{d.pct}%</em>
                  </span>
                  <span className="guide" style={{ height: `${((guide[d.rating] ?? 0) / max) * 100}%` }} title={`Guideline ${guide[d.rating]}%`}>
                    <em>{guide[d.rating]}%</em>
                  </span>
                </div>
                <strong>{d.rating}</strong>
                <span className="pf-muted">{RATING_SCALE[d.rating].label}</span>
                <span className="pf-muted">
                  {d.count} {d.count === 1 ? 'person' : 'people'}
                </span>
              </div>
            ))}
          </div>
          <div className="pf-legend">
            <span className="actual">Actual</span>
            <span className="guide">Guideline</span>
          </div>
        </Card>

        <Card title="Departments" sub={`Company average ${companyAvg?.toFixed(2) ?? '—'}.`}>
          <div className="pf-scroll">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th className="num">Rated</th>
                  <th className="num">Average</th>
                  <th className="num">4–5</th>
                  <th className="num">1–2</th>
                </tr>
              </thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.d}>
                    <td>{d.d}</td>
                    <td className="num">{d.n}</td>
                    <td className={`num ${companyAvg && d.avg - companyAvg > 0.4 ? 'pf-hi' : companyAvg && companyAvg - d.avg > 0.4 ? 'pf-lo' : ''}`}>{d.avg.toFixed(2)}</td>
                    <td className="num">{d.high}%</td>
                    <td className="num">{d.low}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pf-muted pf-small">Departments more than 0.4 from the company average are highlighted for the panel to check for lenient or harsh rating.</p>
        </Card>
      </div>

      <Card
        title="9-box talent grid"
        sub={view === '2026' ? 'Performance (rating) against potential. Click a person waiting for calibration to move them; every move is logged.' : 'Annual 2025 outcome, for comparison.'}
        actions={
          <div className="pf-chips" role="group" aria-label="Cycle">
            {(['2026', '2025'] as const).map((v) => (
              <button key={v} className={view === v ? 'active' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
                Annual {v}
              </button>
            ))}
          </div>
        }
      >
        <div className="pf-ninebox-wrap">
          <div className="pf-axis-y">Potential →</div>
          <div className="pf-ninebox">
            {POTS.map((pot) =>
              ([0, 1, 2] as const).map((perf) => {
                const people = box(pot, perf);
                return (
                  <div key={`${pot}${perf}`} className={`pf-box p${potBand(pot)}${perf}`}>
                    <div className="pf-box-head">
                      <strong>{NINE_BOX[potBand(pot)][perf]}</strong>
                      <span>{people.length}</span>
                    </div>
                    <div className="pf-box-people">
                      {people.map((p) => {
                        const movable = p.a?.stage === 'CALIBRATION';
                        return (
                          <button key={p.staffId} className={`pf-chip ${movable ? 'movable' : ''} ${p.prov ? 'prov' : ''}`} disabled={!movable} title={movable ? 'Move' : p.a ? 'Released or not yet at calibration' : ''} onClick={() => p.a && setMoving(p.a)}>
                            {!movable && view === '2026' && <Lock size={10} />}
                            {person(p.staffId)?.fullName ?? p.staffId}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="pf-axis-x">
            <span>Low performance (1–2)</span>
            <span>Meets (3)</span>
            <span>High performance (4–5)</span>
          </div>
        </div>
      </Card>

      <div className="hr-table-card">
        <div className="pf-table-head">
          <div>
            <h3>Waiting for calibration</h3>
            <span className="pf-muted">Confirm or adjust, then release so employees can acknowledge.</span>
          </div>
          <div className="pf-chips">
            <label className="pf-actor">
              <span>Acting as</span>
              <PersonSelect value={actor} onChange={setActor} people={actors} />
            </label>
            <button
              className="btn btn-primary btn-sm"
              disabled={!picked.length}
              onClick={() => {
                if (releaseRatings(picked, actor)) setPicked([]);
              }}
            >
              <Send size={14} /> Release {picked.length || ''}
            </button>
          </div>
        </div>
        <div className="pf-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" aria-label="Select all" checked={!!queue.length && picked.length === queue.length} onChange={(e) => setPicked(e.target.checked ? queue.map((a) => a.id) : [])} />
                </th>
                <th>Employee</th>
                <th>Proposed</th>
                <th>Calibrated</th>
                <th>Potential</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!queue.length && <Empty cols={6}>Nobody is waiting for calibration.</Empty>}
              {queue.map((a) => (
                <tr key={a.id}>
                  <td>
                    <input type="checkbox" aria-label={`Select ${person(a.staffId)?.fullName}`} checked={picked.includes(a.id)} onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, a.id] : xs.filter((x) => x !== a.id)))} />
                  </td>
                  <td>
                    <EmpCell e={person(a.staffId)} id={a.staffId} />
                  </td>
                  <td>
                    <RatingPill rating={a.proposedRating} />
                  </td>
                  <td>{a.finalRating ? <RatingPill rating={a.finalRating} /> : <span className="pf-muted">As proposed</span>}</td>
                  <td>{a.potential ? POTENTIAL_LABEL[a.potential] : '—'}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => setMoving(a)}>
                      Adjust
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hr-table-card">
        <div className="pf-table-head">
          <h3>Calibration log</h3>
          <span className="pf-muted">{log.length} entries</span>
        </div>
        <div className="pf-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>From</th>
                <th>To</th>
                <th>Reason</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {!logPaged.rows.length && <Empty cols={6}>No calibration yet.</Empty>}
              {logPaged.rows.map((c) => (
                <tr key={c.id}>
                  <td>{fmtDate(c.at)}</td>
                  <td>{person(c.staffId)?.fullName}</td>
                  <td>
                    {c.from.rating ?? '—'} · {c.from.potential ? POTENTIAL_LABEL[c.from.potential] : '—'}
                  </td>
                  <td>
                    {c.to.rating} · {POTENTIAL_LABEL[c.to.potential]}
                  </td>
                  <td>{c.reason}</td>
                  <td>{c.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={logPaged} noun="entries" />
      </div>

      {moving && <MoveModal a={moving} onClose={() => setMoving(null)} />}
    </div>
  );
};

const MoveModal: React.FC<{ a: Appraisal; onClose: () => void }> = ({ a, onClose }) => {
  const { calibrate } = useApp();
  const { person } = usePerfData();
  const actors = useActors();
  const hr = useHrActor([a.staffId]);
  const [actor, setActor] = useState(hr);
  const [rating, setRating] = useState<Rating>((a.finalRating ?? a.proposedRating ?? 3) as Rating);
  const [pot, setPot] = useState<Potential>(a.potential ?? 'MEDIUM');
  const [reason, setReason] = useState('');
  return (
    <Modal
      title={`Move ${person(a.staffId)?.fullName}`}
      subtitle={`Proposed ${a.proposedRating} by the line · now ${a.finalRating ?? a.proposedRating}, ${a.potential ? POTENTIAL_LABEL[a.potential].toLowerCase() : '—'} potential`}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => calibrate(a.id, rating, pot, reason, actor) && onClose()}>
            Move and log
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Rating">
          <select className="form-control" value={rating} onChange={(e) => setRating(Number(e.target.value) as Rating)}>
            {RATINGS.map((r) => (
              <option key={r} value={r}>
                {r} — {RATING_SCALE[r].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Potential">
          <select className="form-control" value={pot} onChange={(e) => setPot(e.target.value as Potential)}>
            {POTS.map((p) => (
              <option key={p} value={p}>
                {POTENTIAL_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason" wide hint="Kept in the calibration log.">
          <input className="form-control" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Field label="Acting as" wide hint="HR calibrates; nobody calibrates their own rating.">
          <PersonSelect value={actor} onChange={setActor} people={actors} />
        </Field>
      </div>
    </Modal>
  );
};
