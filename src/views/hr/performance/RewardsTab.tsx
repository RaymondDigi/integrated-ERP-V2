import React, { useMemo, useState } from 'react';
import { Check, Coins, ExternalLink, Pencil, X } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { usePaged, Pager } from '../../../components/common/Pager';
import { fmtDate } from '../../../data/hireEngine';
import { MONTHS } from '../../../data/payrollEngine';
import { RATINGS, RATING_SCALE, REWARD_STEP_LABEL, type RewardRun, type RewardStep } from '../../../data/perfConfig';
import { rewardCost, rewardEligible, rewardFor } from '../../../data/perfEngine';
import { Card, EmpCell, Empty, Field, Modal, PersonSelect, Pill, RatingPill, fmtKes, useActors, useHrActor, usePerfData } from './shared';

const POS = ['Below mid', 'At mid', 'Above mid'];
const RUN_TONE: Record<RewardRun['status'], 'warning' | 'success' | 'danger' | 'info'> = { PENDING_HR: 'warning', PENDING_FINANCE: 'warning', PENDING_MD: 'warning', APPLIED: 'success', REJECTED: 'danger' };
const RUN_LABEL: Record<RewardRun['status'], string> = { PENDING_HR: 'Waiting for HR', PENDING_FINANCE: 'Waiting for Finance', PENDING_MD: 'Waiting for the MD', APPLIED: 'Approved — in payroll', REJECTED: 'Rejected' };
const monthLabel = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;

const totals = (r: Pick<RewardRun, 'lines'>) => ({
  merit: r.lines.reduce((n, l) => n + (l.newBasic - l.basic) * 12, 0),
  meritCost: r.lines.reduce((n, l) => n + l.meritCost, 0),
  bonus: r.lines.reduce((n, l) => n + l.bonus, 0),
  bonusCost: r.lines.reduce((n, l) => n + l.bonusCost, 0)
});

export const RewardsTab: React.FC = () => {
  const { perfSettings, rewardRuns } = useApp();
  const { cycle, aps, person } = usePerfData();
  const [preparing, setPreparing] = useState(false);
  const runs = rewardRuns.filter((r) => r.cycleId === cycle!.id);
  const taken = new Set(runs.filter((r) => r.status !== 'REJECTED').flatMap((r) => r.lines.map((l) => l.staffId)));
  const eligible = aps.filter((a) => !taken.has(a.staffId) && rewardEligible(a, person(a.staffId)));
  const waiting = aps.filter((a) => !a.releasedOn).length;

  return (
    <div className="pf-stack">
      <div className="pf-two">
        <Card title="Merit increase matrix" sub="Percentage increase by rating and where pay sits in the grade band (compa-ratio = basic ÷ band midpoint). Increases stop at the band maximum.">
          <div className="pf-scroll">
            <table className="hr-table pf-matrix">
              <thead>
                <tr>
                  <th>Rating</th>
                  {POS.map((p, i) => (
                    <th key={p} className="num">
                      {p}
                      <div className="pf-muted">{['< 0.95', '0.95–1.05', '> 1.05'][i]}</div>
                    </th>
                  ))}
                  <th className="num">Bonus</th>
                </tr>
              </thead>
              <tbody>
                {RATINGS.map((r) => (
                  <tr key={r}>
                    <td>
                      {r} · {RATING_SCALE[r].label}
                    </td>
                    {perfSettings.meritMatrix[r].map((v, i) => (
                      <td key={i} className="num">
                        {v}%
                      </td>
                    ))}
                    <td className="num">{perfSettings.bonusMonths[r]} × basic</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pf-muted pf-small">
            Budgets: merit {perfSettings.meritBudgetPct}% and bonus pool {perfSettings.bonusPoolPct}% of the annual basic pay of the people in a run. Over budget needs the managing director. Joiners in the year get a pro-rated bonus.
          </p>
        </Card>
        <Card title="Ready for rewards" sub="Released ratings not yet in a proposal. Disputed ratings wait for HR; directors and the COO are rewarded by the board.">
          <div className="pf-big">{eligible.length}</div>
          <p className="pf-muted">{waiting} more appraisals are still in review and will join a later proposal.</p>
          <button className="btn btn-primary" disabled={!eligible.length} onClick={() => setPreparing(true)}>
            <Coins size={14} /> Prepare reward proposal
          </button>
        </Card>
      </div>

      {!runs.length && <div className="pr-note">No reward proposals yet for {cycle!.name}.</div>}
      {runs.map((r) => (
        <RunCard key={r.id} run={r} />
      ))}
      {preparing && <PrepareModal onClose={() => setPreparing(false)} eligibleIds={eligible.map((a) => a.id)} />}
    </div>
  );
};

const PrepareModal: React.FC<{ onClose: () => void; eligibleIds: string[] }> = ({ onClose, eligibleIds }) => {
  const { payrollOpenPeriod, prepareRewardRun, perfSettings, payrollCtx } = useApp();
  const { cycle, aps, person } = usePerfData();
  const actors = useActors();
  const hr = useHrActor();
  const [actor, setActor] = useState(hr);
  const [bonusPeriod, setBonusPeriod] = useState(payrollOpenPeriod.key);
  const [meritEffective, setMerit] = useState(payrollOpenPeriod.key);
  const preview = useMemo(() => {
    const p = { year: Number(meritEffective.slice(0, 4)), month: Number(meritEffective.slice(5, 7)) - 1, key: meritEffective };
    if (!/^\d{4}-\d{2}$/.test(meritEffective)) return [];
    return aps
      .filter((a) => eligibleIds.includes(a.id))
      .map((a) => {
        const e = person(a.staffId)!;
        const base = rewardFor(e, a.finalRating!, perfSettings, cycle!, p);
        return { ...base, ...rewardCost(e, base, payrollCtx, p) };
      });
  }, [aps, eligibleIds, person, perfSettings, cycle, payrollCtx, meritEffective]);
  const t = totals({ lines: preview });
  return (
    <Modal
      title="Prepare reward proposal"
      subtitle={`${preview.length} people from ${cycle!.name}. Bonuses post as one-off BONUS items; increases write salary history from the month chosen.`}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => prepareRewardRun(cycle!.id, { bonusPeriod, meritEffective }, actor) && onClose()}>
            Create proposal
          </button>
        </>
      }
    >
      <div className="pr-form-grid">
        <Field label="Bonus paid in" hint={`${payrollOpenPeriod.label} is the open payroll period; earlier months are paid.`}>
          <input className="form-control" type="month" min={payrollOpenPeriod.key} value={bonusPeriod} onChange={(e) => setBonusPeriod(e.target.value)} />
        </Field>
        <Field label="Increase effective from">
          <input className="form-control" type="month" min={payrollOpenPeriod.key} value={meritEffective} onChange={(e) => setMerit(e.target.value)} />
        </Field>
        <Field label="Acting as" wide hint="HR prepares; a different HR person approves.">
          <PersonSelect value={actor} onChange={setActor} people={actors} />
        </Field>
      </div>
      <div className="pf-score-row">
        <div>
          <span>Bonuses</span>
          <strong>{fmtKes(t.bonus)}</strong>
          <small>Employer cost {fmtKes(t.bonusCost)}</small>
        </div>
        <div>
          <span>Increases (basic, per year)</span>
          <strong>{fmtKes(t.merit)}</strong>
          <small>Employer cost {fmtKes(t.meritCost)} a year</small>
        </div>
      </div>
    </Modal>
  );
};

const RunCard: React.FC<{ run: RewardRun }> = ({ run }) => {
  const { setCurrentView, setModuleTab } = useApp();
  const { person } = usePerfData();
  const [deciding, setDeciding] = useState(false);
  const [adjust, setAdjust] = useState<string | null>(null);
  const paged = usePaged(run.lines, 10);
  const t = totals(run);
  const steps: RewardStep[] = run.overBudget ? ['HR', 'FINANCE', 'MD'] : ['HR', 'FINANCE'];
  const pending = run.status.startsWith('PENDING');
  return (
    <div className="hr-table-card">
      <div className="pf-table-head">
        <div>
          <h3>
            {run.id} <Pill tone={RUN_TONE[run.status]}>{RUN_LABEL[run.status]}</Pill> {run.overBudget && <Pill tone="danger">Over budget</Pill>}
          </h3>
          <span className="pf-muted">
            Prepared by {run.preparedBy} on {fmtDate(run.preparedOn)} · bonus in {monthLabel(run.bonusPeriod)} payroll · increases from {monthLabel(run.meritEffective)}
          </span>
        </div>
        <div className="pf-chips">
          {run.status === 'APPLIED' && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setModuleTab('payroll', 'items');
                setCurrentView('payroll');
              }}
            >
              <ExternalLink size={14} /> Payroll items
            </button>
          )}
          {pending && (
            <button className="btn btn-primary btn-sm" onClick={() => setDeciding(true)}>
              <Check size={14} /> Decide
            </button>
          )}
        </div>
      </div>
      <ol className="pf-chain">
        {steps.map((s) => {
          const a = run.approvals.find((x) => x.step === s);
          return (
            <li key={s} className={a ? (a.approve ? 'done' : 'rejected') : ''}>
              <strong>{REWARD_STEP_LABEL[s]}</strong>
              <span>{a ? `${a.approve ? 'Approved' : 'Rejected'} by ${a.by} · ${fmtDate(a.on)}` : 'Waiting'}</span>
              {a?.comment && <span className="pf-muted">{a.comment}</span>}
            </li>
          );
        })}
      </ol>
      <div className="pf-budget">
        <Budget label="Merit increases (basic, per year)" spend={t.merit} budget={run.budget.merit} cost={t.meritCost} />
        <Budget label="Bonuses" spend={t.bonus} budget={run.budget.bonus} cost={t.bonusCost} />
      </div>
      {run.status === 'APPLIED' && (
        <div className="pr-note">
          Sent to payroll {fmtDate(run.appliedOn)}: {run.postedItems} bonus items in {monthLabel(run.bonusPeriod)}; {run.increments} salary history entries from {monthLabel(run.meritEffective)}. Earlier payslips are unchanged.
        </div>
      )}
      <div className="pf-scroll">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Rating</th>
              <th>Grade · compa</th>
              <th className="num">Basic</th>
              <th className="num">Merit</th>
              <th className="num">New basic</th>
              <th className="num">Bonus</th>
              <th className="num">Employer cost / yr</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!paged.rows.length && <Empty cols={9}>No lines.</Empty>}
            {paged.rows.map((l) => (
              <tr key={l.staffId}>
                <td>
                  <EmpCell e={person(l.staffId)} id={l.staffId} sub={l.note ? `Adjusted: ${l.note}` : undefined} />
                </td>
                <td>
                  <RatingPill rating={l.rating} />
                </td>
                <td>
                  {l.grade.split(' ')[0]} · {l.compa.toFixed(2)}
                  <div className="pf-muted">{POS[l.position]}</div>
                </td>
                <td className="num">{l.basic.toLocaleString()}</td>
                <td className="num">
                  {l.meritPct}%{l.capped ? ' (band max)' : ''}
                </td>
                <td className="num">{l.newBasic.toLocaleString()}</td>
                <td className="num">
                  {l.bonus.toLocaleString()}
                  {l.prorata < 1 && <div className="pf-muted">{Math.round(l.prorata * 12)}/12</div>}
                </td>
                <td className="num">{(l.meritCost + l.bonusCost).toLocaleString()}</td>
                <td>
                  {run.status === 'PENDING_HR' && (
                    <button className="btn btn-secondary btn-sm" aria-label="Adjust line" onClick={() => setAdjust(l.staffId)}>
                      <Pencil size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager p={paged} noun="people" />
      {deciding && <DecideRun run={run} onClose={() => setDeciding(false)} />}
      {adjust && <AdjustLine run={run} staffId={adjust} onClose={() => setAdjust(null)} />}
    </div>
  );
};

const Budget: React.FC<{ label: string; spend: number; budget: number; cost: number }> = ({ label, spend, budget, cost }) => {
  const pct = budget ? Math.round((spend / budget) * 100) : 0;
  return (
    <div className="pf-budget-item">
      <div>
        <strong>{label}</strong>
        <span className={pct > 100 ? 'pf-late' : 'pf-muted'}>
          {fmtKes(spend)} of {fmtKes(budget)} ({pct}%)
        </span>
      </div>
      <div className={`pf-meter ${pct > 100 ? 'over' : ''}`}>
        <span style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="pf-muted pf-small">Employer cost from the payroll engine: {fmtKes(cost)}</span>
    </div>
  );
};

const DecideRun: React.FC<{ run: RewardRun; onClose: () => void }> = ({ run, onClose }) => {
  const { decideRewardRun, hrEmployees } = useApp();
  const actors = useActors();
  const inRun = run.lines.map((l) => l.staffId);
  const expected =
    run.status === 'PENDING_HR'
      ? hrEmployees.find((e) => e.staffId === 'KHE-0102')?.staffId
      : run.status === 'PENDING_FINANCE'
        ? hrEmployees.find((e) => /finance director/i.test(e.jobTitle) && e.orgId === run.orgId && !inRun.includes(e.staffId))?.staffId ?? hrEmployees.find((e) => /finance manager/i.test(e.jobTitle) && e.orgId === run.orgId && !inRun.includes(e.staffId))?.staffId
        : hrEmployees.find((e) => /managing director/i.test(e.jobTitle))?.staffId;
  const [actor, setActor] = useState(expected ?? '');
  const [comment, setComment] = useState('');
  return (
    <Modal
      title={`Decide ${run.id}`}
      subtitle={RUN_LABEL[run.status]}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => decideRewardRun(run.id, false, actor, comment) && onClose()}>
            <X size={14} /> Reject
          </button>
          <button className="btn btn-primary" onClick={() => decideRewardRun(run.id, true, actor, comment) && onClose()}>
            <Check size={14} /> Approve
          </button>
        </>
      }
    >
      <p className="pf-muted">HR, then Finance; the managing director only when the proposal is over budget. Nobody in the proposal, and nobody who approved an earlier step, can approve. The last approval posts bonuses and writes salary history.</p>
      <Field label="Acting as">
        <PersonSelect value={actor} onChange={setActor} people={actors} />
      </Field>
      <Field label="Comment" hint="Needed when rejecting.">
        <textarea className="form-control" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
    </Modal>
  );
};

const AdjustLine: React.FC<{ run: RewardRun; staffId: string; onClose: () => void }> = ({ run, staffId, onClose }) => {
  const { adjustRewardLine } = useApp();
  const { person } = usePerfData();
  const l = run.lines.find((x) => x.staffId === staffId)!;
  const [newBasic, setNewBasic] = useState(l.newBasic);
  const [bonus, setBonus] = useState(l.bonus);
  const [note, setNote] = useState('');
  return (
    <Modal
      title={`Adjust ${person(staffId)?.fullName}`}
      subtitle={`Matrix: ${l.meritPct}% to KES ${l.newBasic.toLocaleString()}, bonus KES ${l.bonus.toLocaleString()}`}
      onClose={onClose}
      width={520}
      footer={
        <button className="btn btn-primary" onClick={() => adjustRewardLine(run.id, staffId, { newBasic, bonus }, note) && onClose()}>
          Save
        </button>
      }
    >
      <div className="pr-form-grid">
        <Field label="New basic (KES)">
          <input className="form-control" type="number" min={l.basic} step={100} value={newBasic} onChange={(e) => setNewBasic(Number(e.target.value))} />
        </Field>
        <Field label="Bonus (KES)">
          <input className="form-control" type="number" min={0} step={100} value={bonus} onChange={(e) => setBonus(Number(e.target.value))} />
        </Field>
        <Field label="Reason" wide>
          <input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};
