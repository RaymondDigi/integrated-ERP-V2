import React, { useState } from 'react';
import { Save } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { COMPETENCIES, POLICY_NOTES, RATINGS, RATING_SCALE, type PerfSettings, type Rating } from '../../../data/perfConfig';
import { Card, Field, PersonSelect, useActors, useHrActor } from './shared';

const num = (v: string) => (v === '' ? 0 : Number(v));

export const SetupTab: React.FC = () => {
  const { perfSettings, updatePerfSettings, perfAudit } = useApp();
  const actors = useActors();
  const hr = useHrActor();
  const [actor, setActor] = useState(hr);
  const [s, setS] = useState<PerfSettings>(perfSettings);
  const set = (p: Partial<PerfSettings>) => setS((x) => ({ ...x, ...p }));
  const guideTotal = RATINGS.reduce((n, r) => n + s.guideline[r], 0);

  return (
    <div className="pf-stack">
      <Card
        title="Scoring and calibration"
        sub="Changes apply to scores, the guideline and reward matrices from now on."
        actions={
          <>
            <label className="pf-actor">
              <span>Acting as</span>
              <PersonSelect value={actor} onChange={setActor} people={actors} />
            </label>
            <button className="btn btn-primary" onClick={() => updatePerfSettings(s, actor)}>
              <Save size={14} /> Save policy
            </button>
          </>
        }
      >
        <div className="pr-form-grid">
          <Field label="Goals weight (%)">
            <input className="form-control" type="number" min={0} max={100} step={5} value={s.goalsWeight} onChange={(e) => set({ goalsWeight: num(e.target.value), competencyWeight: 100 - num(e.target.value) })} />
          </Field>
          <Field label="Core competencies weight (%)">
            <input className="form-control" type="number" min={0} max={100} step={5} value={s.competencyWeight} onChange={(e) => set({ competencyWeight: num(e.target.value), goalsWeight: 100 - num(e.target.value) })} />
          </Field>
          <Field label="Open an improvement plan at rating">
            <select className="form-control" value={s.pipAtOrBelow} onChange={(e) => set({ pipAtOrBelow: Number(e.target.value) })}>
              <option value={1}>1 only</option>
              <option value={2}>2 or below</option>
            </select>
          </Field>
          <Field label="Joined on or before (to be appraised)">
            <input className="form-control" type="date" value={s.joinedBy} onChange={(e) => set({ joinedBy: e.target.value })} />
          </Field>
          <Field label="Merit budget (% of annual basic)">
            <input className="form-control" type="number" min={0} step={0.5} value={s.meritBudgetPct} onChange={(e) => set({ meritBudgetPct: num(e.target.value) })} />
          </Field>
          <Field label="Bonus pool (% of annual basic)">
            <input className="form-control" type="number" min={0} step={0.5} value={s.bonusPoolPct} onChange={(e) => set({ bonusPoolPct: num(e.target.value) })} />
          </Field>
        </div>
      </Card>

      <div className="hr-table-card">
        <div className="pf-table-head">
          <div>
            <h3>Rating scale, guideline and rewards</h3>
            <span className={guideTotal === 100 ? 'pf-muted' : 'pf-late'}>Guideline adds up to {guideTotal}%</span>
          </div>
        </div>
        <div className="pf-scroll">
          <table className="hr-table pf-matrix">
            <thead>
              <tr>
                <th>Rating</th>
                <th>Descriptor</th>
                <th className="num">Guideline %</th>
                <th className="num">Merit % below mid</th>
                <th className="num">at mid</th>
                <th className="num">above mid</th>
                <th className="num">Bonus (months)</th>
              </tr>
            </thead>
            <tbody>
              {RATINGS.map((r: Rating) => (
                <tr key={r}>
                  <td>
                    <strong>{r}</strong> {RATING_SCALE[r].label}
                  </td>
                  <td className="pf-notes">{RATING_SCALE[r].descriptor}</td>
                  <td className="num">
                    <input className="form-control pf-num" type="number" min={0} max={100} value={s.guideline[r]} onChange={(e) => set({ guideline: { ...s.guideline, [r]: num(e.target.value) } })} aria-label={`Guideline for ${r}`} />
                  </td>
                  {[0, 1, 2].map((i) => (
                    <td key={i} className="num">
                      <input
                        className="form-control pf-num"
                        type="number"
                        min={0}
                        step={0.5}
                        value={s.meritMatrix[r][i]}
                        onChange={(e) => {
                          const row = [...s.meritMatrix[r]] as [number, number, number];
                          row[i] = num(e.target.value);
                          set({ meritMatrix: { ...s.meritMatrix, [r]: row } });
                        }}
                        aria-label={`Merit for ${r}, column ${i + 1}`}
                      />
                    </td>
                  ))}
                  <td className="num">
                    <input className="form-control pf-num" type="number" min={0} step={0.25} value={s.bonusMonths[r]} onChange={(e) => set({ bonusMonths: { ...s.bonusMonths, [r]: num(e.target.value) } })} aria-label={`Bonus months for ${r}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pf-two">
        <Card title="Core competencies (company values)" sub="Rated by the employee and the supervisor in every appraisal.">
          <ul className="pf-list">
            {COMPETENCIES.map((c) => (
              <li key={c.id}>
                <strong>{c.label}</strong>
                <span className="pf-muted">{c.hint}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Eligibility and approvals">
          <ul className="pf-bullets">
            {POLICY_NOTES.map((n) => (
              <li key={n}>{n}</li>
            ))}
            <li>Workflow: self-assessment → supervisor → second-level reviewer → HR calibration → employee acknowledgement. Nobody reviews their own appraisal; the second level is never the supervisor.</li>
            <li>An employee who disagrees adds a comment and the appraisal goes to HR, who confirm or revise the rating.</li>
            <li>Rewards: HR prepares, a different HR person approves, then Finance; the managing director approves proposals over budget.</li>
          </ul>
        </Card>
      </div>

      {perfAudit.length > 0 && (
        <Card title="Activity">
          <ul className="pf-history">
            {perfAudit.slice(0, 15).map((a, i) => (
              <li key={i}>
                <span>{a.at}</span>
                <span>{a.text}</span>
                <span className="pf-muted">{a.by}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};
