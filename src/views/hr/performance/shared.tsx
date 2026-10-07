import React, { useMemo } from 'react';
import { Star } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import type { HREmployee } from '../../../types';
import { RATING_SCALE, STAGE_LABEL, type Appraisal, type AppraisalStage, type PerfCycle, type PerfGoal, type Rating } from '../../../data/perfConfig';
import { currentRating } from '../../../data/perfEngine';

export { Card, Field, Pill, Stat, Empty, Modal, PersonSelect, type Tone } from '../hire/shared';

export const STAGE_TONE: Record<AppraisalStage, 'success' | 'primary' | 'info' | 'warning' | 'danger'> = {
  SELF: 'primary',
  SUPERVISOR: 'info',
  HOD: 'info',
  CALIBRATION: 'warning',
  ACKNOWLEDGEMENT: 'warning',
  DISPUTED: 'danger',
  CLOSED: 'success'
};

export const RATING_TONE: Record<Rating, 'success' | 'primary' | 'info' | 'warning' | 'danger'> = { 5: 'success', 4: 'success', 3: 'primary', 2: 'warning', 1: 'danger' };

export const StagePill: React.FC<{ stage: AppraisalStage; overdue?: boolean }> = ({ stage, overdue }) => (
  <span className={`digicraft-status-pill ${overdue ? 'danger' : STAGE_TONE[stage]}`}>
    {STAGE_LABEL[stage]}
    {overdue ? ' · overdue' : ''}
  </span>
);

export const RatingPill: React.FC<{ rating?: number; provisional?: boolean }> = ({ rating, provisional }) =>
  rating ? (
    <span className={`digicraft-status-pill ${RATING_TONE[rating as Rating]}`} title={provisional ? 'Provisional — not yet calibrated' : RATING_SCALE[rating as Rating].descriptor}>
      {rating} · {RATING_SCALE[rating as Rating].label}
      {provisional ? ' (prov.)' : ''}
    </span>
  ) : (
    <span className="pf-muted">—</span>
  );

/** 1–5 stars; read-only without onChange. */
export const Stars: React.FC<{ value?: number; onChange?: (v: number) => void; label: string }> = ({ value = 0, onChange, label }) => (
  <div className="pf-stars" role={onChange ? 'radiogroup' : undefined} aria-label={label}>
    {[1, 2, 3, 4, 5].map((n) =>
      onChange ? (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} — ${RATING_SCALE[n as Rating].label}`} title={RATING_SCALE[n as Rating].label} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>
          <Star size={16} />
        </button>
      ) : (
        <span key={n} className={n <= value ? 'on' : ''}>
          <Star size={13} />
        </span>
      )
    )}
  </div>
);

export const EmpCell: React.FC<{ e?: HREmployee; id: string; sub?: React.ReactNode }> = ({ e, id, sub }) => (
  <div className="pf-emp">
    <strong>{e?.fullName ?? id}</strong>
    <span>
      {id}
      {e ? ` · ${e.jobTitle}` : ''}
    </span>
    {sub && <span>{sub}</span>}
  </div>
);

/** Data of the selected company's live cycle. */
export const usePerfData = () => {
  const app = useApp();
  const { perfCycles, appraisals, perfGoals, hrEmployees, selectedOrgId, perfSettings } = app;
  return useMemo(() => {
    const cycle: PerfCycle | undefined = perfCycles.find((c) => c.orgId === selectedOrgId && c.status === 'ACTIVE');
    const people = new Map(hrEmployees.map((e) => [e.staffId, e]));
    const aps = cycle ? appraisals.filter((a) => a.cycleId === cycle.id) : [];
    const goalsBy = new Map<string, PerfGoal[]>();
    if (cycle)
      perfGoals
        .filter((g) => g.cycleId === cycle.id)
        .forEach((g) => {
          const list = goalsBy.get(g.staffId) ?? [];
          list.push(g);
          goalsBy.set(g.staffId, list);
        });
    const ratingOf = (a: Appraisal) => currentRating(a, goalsBy.get(a.staffId) ?? [], perfSettings);
    return { cycle, people, aps, goalsBy, ratingOf, person: (id?: string) => (id ? people.get(id) : undefined) };
  }, [perfCycles, appraisals, perfGoals, hrEmployees, selectedOrgId, perfSettings]);
};

/** People who could act in the demo: this company's staff plus group HR and the managing director. */
export const useActors = () => {
  const { hrEmployees, selectedOrgId } = useApp();
  return useMemo(
    () =>
      hrEmployees
        .filter((e) => e.status !== 'TERMINATED' && (e.orgId === selectedOrgId || /group/i.test(e.jobTitle)) && !/daily-rated/i.test(e.contractType))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [hrEmployees, selectedOrgId]
  );
};

export const isHrPerson = (e?: HREmployee) => !!e && /\bHR\b|human resources/i.test(`${e.jobTitle} ${e.department}`);

/** HR person to default to: the company's HR officer, else group HR. */
export const useHrActor = (avoid: string[] = []) => {
  const actors = useActors();
  return (actors.find((e) => e.staffId === 'KHE-0290' && !avoid.includes(e.staffId)) ?? actors.find((e) => isHrPerson(e) && !avoid.includes(e.staffId)))?.staffId ?? '';
};

export const fmtKes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
