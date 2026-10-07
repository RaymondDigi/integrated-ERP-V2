import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { POTENTIAL_LABEL, STAGE_LABEL, type AppraisalStage } from '../../../data/perfConfig';
import { NINE_BOX, downloadCsv, isOverdue, perfBand, potBand, scoreOf } from '../../../data/perfEngine';
import { EmpCell, Empty, RatingPill, StagePill, usePerfData } from './shared';
import { AppraisalModal } from './AppraisalForm';

type Filter = 'ALL' | AppraisalStage;
const FILTERS: Filter[] = ['ALL', 'SELF', 'SUPERVISOR', 'HOD', 'CALIBRATION', 'ACKNOWLEDGEMENT', 'DISPUTED', 'CLOSED'];

export const AppraisalsTab: React.FC = () => {
  const { perfSettings, perfToday } = useApp();
  const { cycle, aps, goalsBy, person, ratingOf } = usePerfData();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      aps
        .map((a) => {
          const goals = goalsBy.get(a.staffId) ?? [];
          return { a, e: person(a.staffId), self: scoreOf(goals, a, 'self', perfSettings).total, sup: a.supOn ? scoreOf(goals, a, 'sup', perfSettings).total : null, r: ratingOf(a) };
        })
        .filter((x) => (filter === 'ALL' || x.a.stage === filter) && (!dept || x.e?.department === dept) && (!q || `${x.e?.fullName} ${x.a.staffId} ${x.e?.jobTitle}`.toLowerCase().includes(q.toLowerCase())))
        .sort((x, y) => (x.e?.fullName ?? '').localeCompare(y.e?.fullName ?? '')),
    [aps, goalsBy, person, perfSettings, ratingOf, filter, dept, q]
  );
  const paged = usePaged(rows, 10, `${filter}${q}${dept}`);
  const depts = [...new Set(aps.map((a) => person(a.staffId)?.department ?? ''))].sort();

  const exportCsv = () => {
    const out: (string | number | undefined)[][] = [['Staff ID', 'Name', 'Department', 'Job title', 'Supervisor', 'Second level', 'Stage', 'Self score', 'Supervisor score', 'Proposed rating', 'Final rating', 'Rating label', 'Potential', '9-box', 'Acknowledged', 'Agreed']];
    aps.forEach((a) => {
      const e = person(a.staffId);
      const goals = goalsBy.get(a.staffId) ?? [];
      const r = ratingOf(a).rating;
      out.push([
        a.staffId,
        e?.fullName,
        e?.department,
        e?.jobTitle,
        person(a.appraiserId)?.fullName,
        person(a.hodId)?.fullName,
        STAGE_LABEL[a.stage],
        scoreOf(goals, a, 'self', perfSettings).total?.toFixed(2),
        a.supOn ? scoreOf(goals, a, 'sup', perfSettings).total?.toFixed(2) : '',
        a.proposedRating,
        a.finalRating,
        a.finalRating ? ['', 'Unsatisfactory', 'Needs improvement', 'Meets expectations', 'Exceeds expectations', 'Outstanding'][a.finalRating] : '',
        a.potential ? POTENTIAL_LABEL[a.potential] : '',
        r && a.potential ? NINE_BOX[potBand(a.potential)][perfBand(r)] : '',
        a.ack?.on,
        a.ack ? (a.ack.agree ? 'Yes' : 'No') : ''
      ]);
    });
    downloadCsv(`ratings-${cycle!.id}.csv`, out);
  };

  return (
    <div className="pf-stack">
      <div className="hr-table-card">
        <div className="pf-table-head">
          <div className="pf-chips" role="group" aria-label="Stage">
            {FILTERS.map((f) => (
              <button key={f} className={filter === f ? 'active' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'ALL' ? 'All' : STAGE_LABEL[f].replace(' — with HR', '')} <span className="pf-count">{f === 'ALL' ? aps.length : aps.filter((a) => a.stage === f).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="pr-toolbar pf-toolbar">
          <label className="pf-search">
            <Search size={14} />
            <input className="form-control" placeholder="Search name, ID or role" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search appraisals" />
          </label>
          <select className="form-control" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
            <option value="">All departments</option>
            {depts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={exportCsv}>
            <Download size={14} /> Export ratings (CSV)
          </button>
        </div>
        <div className="pf-scroll">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Supervisor</th>
                <th>Stage</th>
                <th className="num">Self</th>
                <th className="num">Supervisor</th>
                <th>Rating</th>
                <th>Potential</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!paged.rows.length && <Empty cols={8}>No appraisals match.</Empty>}
              {paged.rows.map(({ a, e, self, sup, r }) => (
                <tr key={a.id} className="pf-click" onClick={() => setOpen(a.id)}>
                  <td>
                    <EmpCell e={e} id={a.staffId} />
                  </td>
                  <td>{person(a.appraiserId)?.fullName ?? '—'}</td>
                  <td>
                    <StagePill stage={a.stage} overdue={isOverdue(a, cycle, perfToday)} />
                  </td>
                  <td className="num">{self?.toFixed(2) ?? '—'}</td>
                  <td className="num">{sup?.toFixed(2) ?? '—'}</td>
                  <td>
                    <RatingPill rating={r.rating} provisional={r.provisional} />
                  </td>
                  <td>{a.potential ? POTENTIAL_LABEL[a.potential] : '—'}</td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setOpen(a.id);
                      }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager p={paged} noun="appraisals" />
      </div>
      {open && <AppraisalModal id={open} onClose={() => setOpen(null)} />}
    </div>
  );
};
