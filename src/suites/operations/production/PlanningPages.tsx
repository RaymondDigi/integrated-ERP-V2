import React, { useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, FastForward, GitMerge, Plus, Repeat, Rocket, Scale, ShoppingCart, Trash2 } from 'lucide-react';
import { addDays, daysBetween, fmtDate, round2, TODAY } from '../../finance/engine';
import { BATCH_LABEL } from '../engine';
import { useOperations } from '../store';
import { Chips, DataTable, Field, Modal, Panel, Pill, Stat, SuitePage, type Column } from '../../ui/kit';
import { ExportCsvButton, PrintButton, esc } from '../../../platform/Widgets';
import { useBlending } from './store';
import { useLiveSchedule } from './hooks';
import { balanceSuggestions, buildPlan, DEFAULT_SCHED, firmLabel, groupBatches, hoursOn, mps, netRequirements, workCenterLoad, type SchedJob, type SchedOptions } from './engine';
import { materialNeed } from '../engine';
import type { Scenario, WorkCenter } from './types';

const FIRM_COLOR = { PLANNED: '#7d8aa3', FIRM: '#3c78b5', RELEASED: '#237857' };

/* ------------------------------------------------------------------ */
/* Gantt                                                               */
/* ------------------------------------------------------------------ */

const Gantt: React.FC<{ sched: SchedJob[]; wcs: WorkCenter[]; cal: { date: string; workCenterId?: string; hours: number }[]; days?: number; onPick?: (j: SchedJob) => void }> = ({ sched, wcs, cal, days = 21, onPick }) => {
  const dates = Array.from({ length: days }, (_, i) => addDays(TODAY, i));
  const last = dates[dates.length - 1];
  return (
    <div className="bl-gantt">
      <div className="bl-gantt-grid" style={{ gridTemplateColumns: `180px repeat(${days}, minmax(30px, 1fr))` }}>
        <div className="bl-gantt-head">
          <div style={{ textAlign: 'left', paddingLeft: 10 }}>Work centre</div>
          {dates.map((d) => {
            const dt = new Date(d + 'T00:00:00');
            const off = !!cal.find((c) => c.date === d && !c.workCenterId && c.hours === 0) || dt.getDay() === 0;
            return (
              <div key={d} className={off ? 'off' : ''} title={d}>
                {dt.getDate()}/{dt.getMonth() + 1}
              </div>
            );
          })}
        </div>
        {wcs.map((wc) => {
          const bars = sched.flatMap((j) => j.sops.filter((o) => o.wcId === wc.id && o.finish >= TODAY && o.start <= last).map((o) => ({ j, o })));
          const lanes: string[][] = [];
          const placed = bars
            .sort((a, b) => a.o.start.localeCompare(b.o.start))
            .map((x) => {
              const s = Math.max(0, daysBetween(TODAY, x.o.start));
              const e = Math.min(days - 1, daysBetween(TODAY, x.o.finish));
              let lane = lanes.findIndex((l) => !l.length || daysBetween(TODAY, l[l.length - 1]) < s);
              if (lane < 0) lane = lanes.push([]) - 1;
              lanes[lane].push(x.o.finish);
              return { ...x, s, e, lane };
            });
          return (
            <div key={wc.id} className="bl-gantt-row">
              <div className="bl-gantt-label">
                {wc.name}
                <small>
                  {wc.machines} × {wc.hoursPerDay} h
                </small>
              </div>
              <div className="bl-gantt-lane" style={{ gridColumn: `span ${days}`, height: 10 + Math.max(1, lanes.length) * 26 }}>
                {dates.map((d, i) => (hoursOn(wc, d, cal as never) === 0 ? <i key={d} className="off" style={{ left: `${(i / days) * 100}%`, width: `${100 / days}%` }} /> : null))}
                {placed.map(({ j, o, s, e, lane }) => (
                  <button
                    key={j.id + o.seq}
                    type="button"
                    className={`bl-bar ${j.firm} ${j.lateDays > 0 ? 'late' : ''}`}
                    style={{ left: `${(s / days) * 100}%`, width: `calc(${((e - s + 1) / days) * 100}% - 3px)`, top: 5 + lane * 26 }}
                    title={`${j.ref} · ${j.label} · ${o.name} · ${round2(o.hours)} h · ${fmtDate(o.start)} → ${fmtDate(o.finish)}${j.lateDays ? ` · ${j.lateDays} d late` : ''}${j.problem ? ` · ${j.problem}` : ''}`}
                    onClick={() => onPick?.(j)}
                  >
                    {j.ref.slice(-4)} {o.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const LoadGrid: React.FC<{ sched: SchedJob[]; wcs: WorkCenter[]; cal: never[] | { date: string; workCenterId?: string; hours: number; id: string; reason: string }[] }> = ({ sched, wcs, cal }) => {
  const load = workCenterLoad(sched, wcs, cal as never);
  return (
    <div className="bl-load">
      <b>Week starting</b>
      {load[0]?.weeks.map((w) => (
        <b key={w.start}>{fmtDate(w.start).slice(0, 6)}</b>
      ))}
      {load.map((row) => (
        <React.Fragment key={row.wc.id}>
          <span>{row.wc.name}</span>
          {row.weeks.map((w) => {
            const cap = Math.max(w.capacity, 1);
            const pct = (n: number) => `${Math.min(100, (n / cap) * 100)}%`;
            return (
              <div key={w.start} className={`bl-load-cell ${w.pct > 1 ? 'over' : ''}`} title={`Released ${w.released} h · firm ${w.firm} h · planned ${w.planned} h of ${w.capacity} h`}>
                <span style={{ left: 0, width: pct(w.released), background: FIRM_COLOR.RELEASED }} />
                <span style={{ left: pct(w.released), width: pct(w.firm), background: FIRM_COLOR.FIRM }} />
                <span style={{ left: pct(w.released + w.firm), width: pct(w.planned), background: FIRM_COLOR.PLANNED }} />
                <em>{w.capacity ? `${Math.round(w.pct * 100)}%` : w.load ? 'closed' : '—'}</em>
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
};

const Legend: React.FC = () => (
  <div className="bl-legend">
    {(['PLANNED', 'FIRM', 'RELEASED'] as const).map((k) => (
      <span key={k}>
        <i style={{ background: FIRM_COLOR[k] }} />
        {firmLabel[k]}
      </span>
    ))}
    <span>
      <i style={{ background: 'transparent', boxShadow: 'inset 0 0 0 2px #c9573f' }} />
      Late against due date
    </span>
  </div>
);

/* ------------------------------------------------------------------ */
/* Schedule page                                                       */
/* ------------------------------------------------------------------ */

type STab = 'gantt' | 'load' | 'dispatch' | 'tools';

export const SchedulePage: React.FC = () => {
  const bl = useBlending();
  const { state: ops, products, setProduction } = useOperations();
  const [opts, setOpts] = useState<SchedOptions>(DEFAULT_SCHED);
  const { sched, wcs, cal } = useLiveSchedule(opts);
  const [tab, setTab] = useState<STab>('gantt');
  const [pick, setPick] = useState<SchedJob | null>(null);
  const [wcDispatch, setWcDispatch] = useState(wcs[0]?.id ?? '');
  const late = sched.filter((j) => j.lateDays > 0);
  const problems = sched.filter((j) => j.problem);
  const dispatch = sched
    .flatMap((j) => j.sops.filter((o) => o.wcId === wcDispatch).map((o) => ({ j, o })))
    .sort((a, b) => a.o.start.localeCompare(b.o.start) || a.j.cr - b.j.cr);
  const wcName = (id: string) => wcs.find((w) => w.id === id)?.name ?? id;
  return (
    <SuitePage
      eyebrow="Planning"
      title="Production schedule"
      subtitle="Finite-capacity schedule of every batch and blend against machines, crews, tooling and the factory calendar. Click a bar to move it."
      actions={
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => bl.rollForward()}>
          <FastForward size={14} /> Roll forward overdue work
        </button>
      }
    >
      <div className="sx-toolbar">
        <Chips value={opts.mode} onChange={(mode) => setOpts({ ...opts, mode })} options={[{ value: 'FORWARD', label: 'Forward from start' }, { value: 'BACKWARD', label: 'Backward from due date' }, { value: 'MIDPOINT', label: 'Midpoint (bottleneck)' }]} />
        <Chips value={opts.rule} onChange={(rule) => setOpts({ ...opts, rule })} options={[{ value: 'DUE', label: 'Due date' }, { value: 'CR', label: 'Critical ratio' }, { value: 'SEQUENCE', label: 'Standard sequence' }]} />
        <label className="pf-readonly">
          <input type="checkbox" checked={opts.finite} onChange={(e) => setOpts({ ...opts, finite: e.target.checked })} /> Finite capacity
        </label>
        <label className="pf-readonly">
          <input type="checkbox" checked={opts.processFlow} onChange={(e) => setOpts({ ...opts, processFlow: e.target.checked })} /> Process flow (machine first, then material)
        </label>
      </div>
      <div className="sx-stats">
        <Stat label="Jobs scheduled" value={sched.length} detail={`${sched.filter((j) => j.kind === 'BLEND').length} blends · ${sched.filter((j) => j.kind === 'BATCH').length} batches`} icon={<CalendarClock size={17} />} />
        <Stat label="Late" value={late.length} detail={late.length ? late.map((j) => j.ref.slice(-4)).join(', ') : 'Everything meets its due date'} icon={<CalendarClock size={17} />} tone="red" />
        <Stat label="Critical ratio < 1" value={sched.filter((j) => j.cr < 1).length} detail="Behind — need expediting" icon={<Scale size={17} />} tone="gold" />
        <Stat label="Waiting on material" value={sched.filter((j) => j.materialShort.length).length} detail={opts.processFlow ? 'Pushed to material arrival' : 'Flagged only'} icon={<ShoppingCart size={17} />} tone="blue" />
      </div>
      <div className="sx-toolbar bl-tabs">
        <Chips value={tab} onChange={setTab} options={[{ value: 'gantt', label: 'Gantt' }, { value: 'load', label: 'Work-centre load' }, { value: 'dispatch', label: 'Dispatch list' }, { value: 'tools', label: 'Reschedule tools' }]} />
      </div>
      {tab === 'gantt' && (
        <>
          <Legend />
          <Gantt sched={sched} wcs={wcs} cal={cal} onPick={setPick} />
          {problems.length > 0 && (
            <div className="sx-callout warn">
              <CalendarClock size={16} />
              <div>
                {problems.map((j) => (
                  <span key={j.id}>
                    • {j.ref}: {j.problem}
                  </span>
                ))}
              </div>
            </div>
          )}
          <Panel title="Jobs by critical ratio" subtitle="Days left to the due date ÷ days of work left. Below 1 will be late." flush>
            <JobTable rows={[...sched].sort((a, b) => a.cr - b.cr)} onPick={setPick} />
          </Panel>
        </>
      )}
      {tab === 'load' && (
        <Panel title="Load against capacity" subtitle="Hours still to do per week — released and part-complete work (remaining hours only), firm and planned orders">
          <Legend />
          <LoadGrid sched={sched} wcs={wcs} cal={cal} />
        </Panel>
      )}
      {tab === 'dispatch' && (
        <Panel
          title="Dispatch list"
          subtitle="What each work centre runs next, in order"
          action={
            <PrintButton
              title={`Dispatch list ${wcName(wcDispatch)}`}
              html={() =>
                `<h1>Dispatch list — ${esc(wcName(wcDispatch))}</h1><p class="muted">Printed ${esc(TODAY)}</p><table><tr><th>#</th><th>Job</th><th>Operation</th><th>Start</th><th>Finish</th><th class="r">Hours</th><th class="r">CR</th><th>Due</th></tr>${dispatch
                  .map((d, i) => `<tr><td>${i + 1}</td><td>${esc(d.j.ref)} ${esc(d.j.label)}</td><td>${esc(d.o.name)}</td><td>${esc(d.o.start)}</td><td>${esc(d.o.finish)}</td><td class="r">${round2(d.o.hours)}</td><td class="r">${d.j.cr}</td><td>${esc(d.j.due)}</td></tr>`)
                  .join('')}</table>`
              }
            />
          }
          flush
        >
          <div className="sx-toolbar" style={{ padding: '8px 12px' }}>
            <select className="form-control" value={wcDispatch} onChange={(e) => setWcDispatch(e.target.value)} aria-label="Work centre" style={{ maxWidth: 280 }}>
              {wcs.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <table className="sx-mini-table bl-tight">
            <thead>
              <tr>
                <th>#</th>
                <th>Job</th>
                <th>Operation</th>
                <th>Start</th>
                <th>Finish</th>
                <th className="bl-num">Hours</th>
                <th className="bl-num">CR</th>
              </tr>
            </thead>
            <tbody>
              {dispatch.map((d, i) => (
                <tr key={d.j.id + d.o.seq} className="clickable" onClick={() => setPick(d.j)}>
                  <td>{i + 1}</td>
                  <td>
                    <b className="sx-mono">{d.j.ref}</b> {d.j.label}
                  </td>
                  <td>{d.o.name}</td>
                  <td>{fmtDate(d.o.start)}</td>
                  <td>{fmtDate(d.o.finish)}</td>
                  <td className="bl-num">{round2(d.o.hours)}</td>
                  <td className={`bl-num ${d.j.cr < 1 ? 'sx-danger-text' : ''}`}>{d.j.cr}</td>
                </tr>
              ))}
              {!dispatch.length && (
                <tr>
                  <td colSpan={7} className="sx-muted">
                    Nothing scheduled on this work centre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      )}
      {tab === 'tools' && <Tools sched={sched} />}
      {pick && <RescheduleModal job={pick} onClose={() => setPick(null)} onOpen={() => (setPick(null), setProduction(pick.kind === 'BLEND' ? 'blendsheets' : 'batches', pick.id))} />}
      <p className="sx-note">
        {ops.batches.length} batches and {bl.state.blendsheets.length} blendsheets on file · {products.length} items · scheduling horizon 400 days.
      </p>
    </SuitePage>
  );
};

const JobTable: React.FC<{ rows: SchedJob[]; onPick: (j: SchedJob) => void }> = ({ rows, onPick }) => {
  const columns: Column<SchedJob>[] = [
    { key: 'r', header: 'Job', render: (j) => <b className="sx-mono">{j.ref}</b>, sort: (j) => j.ref },
    { key: 'l', header: 'What', render: (j) => <div className="sx-cell-main"><span>{j.label}</span><small>{j.qty.toLocaleString()} {j.unit} · {firmLabel[j.firm]}{j.pctDone ? ` · ${Math.round(j.pctDone * 100)}% done` : ''}</small></div> },
    { key: 's', header: 'Start', render: (j) => fmtDate(j.start), sort: (j) => j.start },
    { key: 'f', header: 'Finish', render: (j) => fmtDate(j.finish), sort: (j) => j.finish },
    { key: 'd', header: 'Due', render: (j) => <span className={j.lateDays ? 'sx-danger-text' : ''}>{fmtDate(j.due)}{j.lateDays ? ` (+${j.lateDays} d)` : ''}</span>, sort: (j) => j.due },
    { key: 'cr', header: 'CR', render: (j) => <span className={j.cr < 1 ? 'sx-danger-text' : ''}>{j.cr}</span>, align: 'right', sort: (j) => j.cr },
    { key: 'm', header: 'Material', render: (j) => (j.materialShort.length ? <Pill status="OVERDUE" label={`Short ${j.materialShort.length}`} /> : <Pill status="POSTED" label="OK" />), hideOnMobile: true }
  ];
  return <DataTable rows={rows} columns={columns} rowKey={(j) => j.id} onRowClick={onPick} initialSort={{ key: 'cr', dir: 'asc' }} />;
};

const RescheduleModal: React.FC<{ job: SchedJob; onClose: () => void; onOpen: () => void }> = ({ job, onClose, onOpen }) => {
  const { state, rescheduleJob } = useBlending();
  const mainOp = job.sops.find((o) => o.kind === 'PACKING' || (job.kind === 'BLEND' && o.kind === 'PROCESS')) ?? job.sops[0];
  const kind = state.workCenters.find((w) => w.id === mainOp?.wcId)?.kind;
  const alts = state.workCenters.filter((w) => (job.kind === 'BLEND' ? w.kind === 'TOWER' || w.kind === 'DRUM' : w.kind === kind));
  const [date, setDate] = useState(job.release);
  const [wc, setWc] = useState(mainOp?.wcId ?? '');
  return (
    <Modal
      title={`Move ${job.ref}`}
      subtitle={`${job.label} · now ${fmtDate(job.start)} → ${fmtDate(job.finish)}`}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onOpen}>
            Open record
          </button>
          <span className="sx-grow" />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => rescheduleJob(job.id, date, wc !== mainOp?.wcId ? wc : undefined).ok && onClose()}>
            Reschedule
          </button>
        </>
      }
    >
      <div className="sx-grid sx-grid-2">
        <Field label="Earliest start">
          <input className="form-control" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={job.kind === 'BLEND' ? 'Plant' : 'Line'}>
          <select className="form-control" value={wc} onChange={(e) => setWc(e.target.value)}>
            {alts.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <table className="sx-mini-table bl-tight">
        <tbody>
          {job.sops.map((o) => (
            <tr key={o.seq}>
              <td>{o.name}</td>
              <td>{state.workCenters.find((w) => w.id === o.wcId)?.name}</td>
              <td>
                {fmtDate(o.start)} → {fmtDate(o.finish)}
              </td>
              <td className="bl-num">{round2(o.hours)} h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
};

const Tools: React.FC<{ sched: SchedJob[] }> = ({ sched }) => {
  const bl = useBlending();
  const { state: ops, products } = useOperations();
  const { state } = bl;
  const [wc, setWc] = useState(state.workCenters[0].id);
  const [days, setDays] = useState(1);
  const [toWc, setToWc] = useState('');
  const cats = [...new Set(ops.recipes.map((r) => products.find((p) => p.sku === r.product)?.category).filter(Boolean) as string[]), 'Blending'];
  const [cat, setCat] = useState(cats[0]);
  const [catDays, setCatDays] = useState(1);
  const groups = groupBatches(ops, state);
  const balance = balanceSuggestions(sched, state.workCenters, state.calendar);
  const [rate, setRate] = useState({ recipeId: ops.recipes[0].id, workCenterId: 'WC-PK1', qtyPerDay: state.params[0]?.minBatch ?? 100, from: addDays(TODAY, 7), to: addDays(TODAY, 11) });
  const recipe = (id: string) => ops.recipes.find((r) => r.id === id);
  return (
    <div className="sx-row">
      <Panel title="Reschedule by machine" subtitle="Shift everything on a work centre, or move it to another of the same kind">
        <div className="bl-inline">
          <select className="form-control" value={wc} onChange={(e) => setWc(e.target.value)} aria-label="Work centre">
            {state.workCenters.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <input className="form-control" type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Days" style={{ width: 80 }} />
          <select className="form-control" value={toWc} onChange={(e) => setToWc(e.target.value)} aria-label="Move to">
            <option value="">Same work centre</option>
            {state.workCenters.filter((w) => w.id !== wc && w.kind === state.workCenters.find((x) => x.id === wc)?.kind).map((w) => (
              <option key={w.id} value={w.id}>
                → {w.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => bl.rescheduleByWorkCenter(wc, days, toWc || undefined)}>
            Shift
          </button>
        </div>
      </Panel>
      <Panel title="Reschedule by product group" subtitle="Move every planned job in a category">
        <div className="bl-inline">
          <select className="form-control" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input className="form-control" type="number" value={catDays} onChange={(e) => setCatDays(Number(e.target.value))} aria-label="Days" style={{ width: 80 }} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => bl.rescheduleByCategory(cat, catDays)}>
            Shift
          </button>
        </div>
      </Panel>
      <Panel title="Group similar batches" subtitle="Planned batches of the same product within a week — one set-up instead of several">
        {groups.length ? (
          <ul className="sx-list">
            {groups.map((g) => (
              <li key={g[0].id}>
                <span>{recipe(g[0].recipeId)?.name}</span>
                <span>
                  {g.map((b) => b.number.slice(-4)).join(' + ')} = {g.reduce((a, b) => a + b.plannedQty, 0)}
                </span>
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => bl.mergeBatches(g.map((b) => b.id))}>
                  <GitMerge size={12} /> Merge
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sx-muted">No planned batches to group right now.</p>
        )}
      </Panel>
      <Panel title="Line balancing" subtitle="Overloaded weeks and a line of the same kind with room">
        {balance.length ? (
          <ul className="sx-list">
            {balance.map((s) => (
              <li key={s.jobId + s.to}>
                <span className="sx-mono">{s.ref}</span>
                <span>
                  {state.workCenters.find((w) => w.id === s.from)?.name} → {state.workCenters.find((w) => w.id === s.to)?.name} · {s.hours} h
                </span>
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => bl.rescheduleJob(s.jobId, s.week < TODAY ? TODAY : s.week, s.to)}>
                  <Scale size={12} /> Apply
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sx-muted">No line is over capacity in the next four weeks. When demand changes (new orders, forecast) the schedule and these suggestions recalculate.</p>
        )}
      </Panel>
      <Panel title="Repetitive (rate-based) schedule" subtitle="One batch per working day at a fixed daily rate">
        <div className="sx-grid">
          <Field label="Product" span={2}>
            <select className="form-control" value={rate.recipeId} onChange={(e) => setRate({ ...rate, recipeId: e.target.value })}>
              {ops.recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Line" span={2}>
            <select className="form-control" value={rate.workCenterId} onChange={(e) => setRate({ ...rate, workCenterId: e.target.value })}>
              {state.workCenters.filter((w) => w.kind === 'PACKING').map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Per day">
            <input className="form-control" type="number" value={rate.qtyPerDay} onChange={(e) => setRate({ ...rate, qtyPerDay: Number(e.target.value) })} />
          </Field>
          <Field label="From">
            <input className="form-control" type="date" value={rate.from} onChange={(e) => setRate({ ...rate, from: e.target.value })} />
          </Field>
          <Field label="To">
            <input className="form-control" type="date" value={rate.to} onChange={(e) => setRate({ ...rate, to: e.target.value })} />
          </Field>
          <Field label=" ">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => bl.createRateSchedule(rate)}>
              <Repeat size={14} /> Generate
            </button>
          </Field>
        </div>
        {state.rates.map((r) => (
          <p key={r.id} className="sx-note">
            {recipe(r.recipeId)?.name}: {r.qtyPerDay}/day {fmtDate(r.from)} → {fmtDate(r.to)} · {r.batchIds.length} batches
          </p>
        ))}
      </Panel>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* MPS and MRP                                                         */
/* ------------------------------------------------------------------ */

type PTab = 'mps' | 'mrp' | 'build' | 'requirements' | 'shortages' | 'forecast';

export const PlanningPage: React.FC = () => {
  const bl = useBlending();
  const { state } = bl;
  const { state: ops, products, commercial } = useOperations();
  const orders = commercial.state.orders;
  const pos = commercial.state.purchaseOrders;
  const [tab, setTab] = useState<PTab>('mps');
  const plan = useMemo(() => mps(state, ops, products, orders), [state, ops, products, orders]);
  const net = useMemo(() => netRequirements(state, ops, products, orders, pos), [state, ops, products, orders, pos]);
  const build = useMemo(() => buildPlan(state, ops, products, orders), [state, ops, products, orders]);
  const req = ops.batches
    .filter((b) => b.status === 'PLANNED' || b.status === 'RELEASED')
    .flatMap((b) => materialNeed(ops.recipes.find((r) => r.id === b.recipeId)!, b.plannedQty).map((n) => ({ b, ...n })));
  const reqBySku = [...new Set(req.map((r) => r.sku))].map((sku) => {
    const lines = req.filter((r) => r.sku === sku);
    const p = products.find((x) => x.sku === sku);
    const reserved = Object.values(state.ext).reduce((a, e) => a + e.reserved.filter((x) => x.sku === sku).reduce((y, x) => y + x.qty, 0), 0);
    return { sku, name: p?.name ?? sku, unit: p?.unit ?? '', total: round2(lines.reduce((a, l) => a + l.qty, 0)), stock: p?.stock ?? 0, reserved: round2(reserved), lines };
  });
  const shortages = net.filter((n) => n.net > 0);
  const months = [...new Set(state.forecasts.map((f) => f.month))].sort();
  const skus = [...new Set(state.forecasts.map((f) => f.sku))];
  const mpsHtml = () =>
    `<h1>Master production schedule</h1><p class="muted">${esc(TODAY)} · demand fence: orders only · beyond: larger of orders and seasonal forecast</p>${plan
      .map(
        (m) =>
          `<h2>${esc(m.recipe.name)} (stock ${m.product?.stock ?? 0}, safety ${m.params?.safetyStock ?? 0})</h2><table><tr><th>Week</th>${m.weeks.map((w) => `<th>${esc(w.start.slice(5))}</th>`).join('')}</tr>${(['so', 'forecast', 'demand', 'receipts', 'planned', 'projected'] as const)
            .map((k) => `<tr><td>${k}</td>${m.weeks.map((w) => `<td class="r">${w[k]}</td>`).join('')}</tr>`)
            .join('')}</table>`
      )
      .join('')}`;
  return (
    <SuitePage
      eyebrow="Planning"
      title="MPS & MRP"
      subtitle="Master schedule by week with demand and planning time fences, seasonal forecast and safety stock; BOM explosion to net requirements, build optimisation and standard planning reports."
      actions={<PrintButton title="Manufacturing planning report" html={mpsHtml} label="Print planning report" />}
    >
      <div className="sx-toolbar bl-tabs">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: 'mps', label: 'Master schedule' },
            { value: 'mrp', label: 'Net requirements', count: shortages.length },
            { value: 'build', label: 'Build plan' },
            { value: 'requirements', label: 'Work order requirements' },
            { value: 'shortages', label: 'Shortage report', count: shortages.length },
            { value: 'forecast', label: 'Forecast & seasonality' }
          ]}
        />
      </div>
      {tab === 'mps' &&
        plan.map((m) => (
          <Panel key={m.recipe.id} title={m.recipe.name} subtitle={`Stock ${m.product?.stock ?? 0} · safety ${m.params?.safetyStock ?? 0} · DTF ${m.params?.dtfDays ?? 0} d · PTF ${m.params?.ptfDays ?? 0} d${m.params?.mto ? ' · make to order' : ''}`} flush>
            <div className="sx-table-scroll">
              <table className="sx-mini-table bl-tight">
                <thead>
                  <tr>
                    <th>Week of</th>
                    {m.weeks.map((w) => (
                      <th key={w.start} className={`bl-num bl-zone-${w.zone}`} title={w.zone === 'FROZEN' ? 'Inside the planning time fence — frozen' : w.zone === 'FIRM' ? 'Inside the demand time fence — orders only' : 'Orders or forecast'}>
                        {fmtDate(w.start).slice(0, 6)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['so', 'Sales orders'],
                      ['forecast', 'Forecast × season'],
                      ['demand', 'Demand used'],
                      ['receipts', 'Scheduled batches'],
                      ['planned', 'Suggested batches'],
                      ['projected', 'Projected on hand']
                    ] as const
                  ).map(([k, l]) => (
                    <tr key={k}>
                      <td>{l}</td>
                      {m.weeks.map((w) => (
                        <td key={w.start} className={`bl-num ${k === 'projected' && w.projected < (m.params?.safetyStock ?? 0) ? 'sx-danger-text' : ''}`}>
                          {w[k] || (k === 'projected' ? 0 : '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {m.suggestions.length > 0 && (
              <div className="bl-inline" style={{ padding: '6px 12px' }}>
                {m.suggestions.map((sg, i) => (
                  <button key={i} type="button" className="btn btn-secondary btn-xs" onClick={() => bl.planBatch(m.recipe.id, sg.qty, sg.date)}>
                    <Plus size={12} /> Firm {sg.qty} on {fmtDate(sg.date).slice(0, 6)}
                  </button>
                ))}
              </div>
            )}
          </Panel>
        ))}
      {tab === 'mrp' && (
        <Panel title="Net requirements" subtitle="Gross from planned/released batches and MPS suggestions, exploded to tea grades; net of stock (held stock excluded), open purchase orders and blends in hand" flush action={<ExportCsvButton name="net-requirements" header={['Level', 'Item', 'Unit', 'Gross', 'On hand', 'On hold', 'Reserved', 'On order', 'Net', 'Need by']} rows={() => net.map((n) => [n.level, n.name, n.unit, n.gross, n.onHand, n.onHold, n.reserved, n.onOrder, n.net, n.needBy])} />}>
          <NetTable rows={net} onReq={(n) => bl.raiseRequisition(n.sku, n.net, n.needBy < TODAY ? TODAY : n.needBy)} />
        </Panel>
      )}
      {tab === 'build' && (
        <Panel title="Available-inventory build plan" subtitle="Scarce stock goes first to released work, then the earliest due, then the best margin" flush>
          <table className="sx-mini-table bl-tight">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Product</th>
                <th>Due</th>
                <th className="bl-num">Planned</th>
                <th className="bl-num">Buildable now</th>
                <th>Limited by</th>
              </tr>
            </thead>
            <tbody>
              {build.map((r) => (
                <tr key={r.batch.id}>
                  <td className="sx-mono">{r.batch.number}</td>
                  <td>{r.recipe.name}</td>
                  <td>{fmtDate(r.due)}</td>
                  <td className="bl-num">{r.batch.plannedQty}</td>
                  <td className={`bl-num ${r.status === 'NONE' ? 'sx-danger-text' : r.status === 'PARTIAL' ? 'sx-warning-text' : ''}`}>{r.buildable}</td>
                  <td>{r.limiting.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      {tab === 'requirements' && (
        <Panel title="Work order requirements" subtitle="Materials every planned and released batch needs, against stock and allocations" flush action={<ExportCsvButton name="work-order-requirements" header={['Item', 'Batch', 'Status', 'Date', 'Qty']} rows={() => req.map((r) => [r.sku, r.b.number, r.b.status, r.b.date, r.qty])} />}>
          <table className="sx-mini-table bl-tight">
            <thead>
              <tr>
                <th>Item</th>
                <th className="bl-num">Required</th>
                <th className="bl-num">In stock</th>
                <th className="bl-num">Allocated</th>
                <th>Batches</th>
              </tr>
            </thead>
            <tbody>
              {reqBySku.map((r) => (
                <tr key={r.sku}>
                  <td>{r.name}</td>
                  <td className="bl-num">
                    {r.total} {r.unit}
                  </td>
                  <td className={`bl-num ${r.stock < r.total ? 'sx-danger-text' : ''}`}>{r.stock}</td>
                  <td className="bl-num">{r.reserved}</td>
                  <td>
                    <small>{r.lines.map((l) => `${l.b.number.slice(-4)} (${BATCH_LABEL[l.b.status].toLowerCase()}) ${l.qty}`).join(' · ')}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      {tab === 'shortages' && (
        <Panel title="Material shortage report" subtitle="Items whose net requirement is above zero, with the date needed and what is already on order" flush action={<ExportCsvButton name="material-shortages" header={['Item', 'Net short', 'Unit', 'Need by', 'Open POs', 'Needed for']} rows={() => shortages.map((n) => [n.name, n.net, n.unit, n.needBy, n.openPo.join('; '), n.sources.join('; ')])} />}>
          <NetTable rows={shortages} onReq={(n) => bl.raiseRequisition(n.sku, n.net, n.needBy < TODAY ? TODAY : n.needBy)} />
          {!shortages.length && <p className="sx-muted" style={{ padding: 12 }}>No shortages.</p>}
        </Panel>
      )}
      {tab === 'forecast' && (
        <Panel title="Forecast and seasonal index" subtitle="Monthly forecast × seasonal index drives the MPS beyond the demand time fence (e.g. festive gift boxes in December)" flush>
          <div className="sx-table-scroll">
            <table className="sx-mini-table bl-tight">
              <thead>
                <tr>
                  <th>Item</th>
                  {months.map((m) => (
                    <th key={m} className="bl-num">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {skus.map((sku) => (
                  <tr key={sku}>
                    <td>{products.find((p) => p.sku === sku)?.name ?? sku}</td>
                    {months.map((m) => {
                      const f = state.forecasts.find((x) => x.sku === sku && x.month === m)!;
                      return (
                        <td key={m}>
                          <input className="form-control" type="number" value={f.qty} onChange={(e) => bl.saveForecast({ ...f, qty: Number(e.target.value) })} aria-label={`${sku} ${m} quantity`} style={{ width: 80 }} />
                          <input className="form-control" type="number" step="0.05" value={f.seasonalIndex} onChange={(e) => bl.saveForecast({ ...f, seasonalIndex: Number(e.target.value) })} aria-label={`${sku} ${m} seasonal index`} style={{ width: 80 }} title="Seasonal index" />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </SuitePage>
  );
};

const NetTable: React.FC<{ rows: ReturnType<typeof netRequirements>; onReq: (n: ReturnType<typeof netRequirements>[number]) => void }> = ({ rows, onReq }) => (
  <table className="sx-mini-table bl-tight">
    <thead>
      <tr>
        <th>Item</th>
        <th className="bl-num">Gross</th>
        <th className="bl-num">On hand</th>
        <th className="bl-num">On hold</th>
        <th className="bl-num">Allocated</th>
        <th className="bl-num">On order</th>
        <th className="bl-num">Net</th>
        <th>Need by</th>
        <th />
      </tr>
    </thead>
    <tbody>
      {rows.map((n) => (
        <tr key={n.sku}>
          <td>
            {n.level === 2 ? '↳ ' : ''}
            {n.name}
            <br />
            <small className="sx-muted">{n.openPo.join(' · ') || n.sources.slice(0, 3).join(', ')}</small>
          </td>
          <td className="bl-num">{n.gross.toLocaleString()}</td>
          <td className="bl-num">{n.onHand.toLocaleString()}</td>
          <td className="bl-num">{n.onHold.toLocaleString()}</td>
          <td className="bl-num">{n.reserved.toLocaleString()}</td>
          <td className="bl-num">{n.onOrder.toLocaleString()}</td>
          <td className={`bl-num ${n.net > 0 ? 'sx-danger-text' : ''}`}>
            {n.net.toLocaleString()} {n.unit}
          </td>
          <td>{fmtDate(n.needBy)}</td>
          <td>
            {n.net > 0 && n.level === 1 && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => onReq(n)}>
                <ShoppingCart size={12} /> Requisition
              </button>
            )}
            {n.net > 0 && n.level === 2 && <small className="sx-muted">Buy at auction</small>}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

/* ------------------------------------------------------------------ */
/* What-if simulation                                                  */
/* ------------------------------------------------------------------ */

export const SimulationPage: React.FC = () => {
  const bl = useBlending();
  const { state } = bl;
  const [name, setName] = useState('');
  const [sel, setSel] = useState<string | null>(state.scenarios[0]?.id ?? null);
  const sc = state.scenarios.find((x) => x.id === sel);
  return (
    <SuitePage eyebrow="Planning" title="What-if simulation" subtitle="Copy live capacity, calendar and schedule into a scenario, change machines, shifts, holidays and job dates, and compare — live data is untouched until the Manager makes it live.">
      <div className="bl-inline">
        <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="Scenario name, e.g. Second shift on line 1" aria-label="Scenario name" style={{ minWidth: 280 }} />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const r = bl.createScenario(name);
            if (r.ok && r.id) {
              setSel(r.id);
              setName('');
            }
          }}
        >
          <Plus size={14} /> New scenario from live
        </button>
      </div>
      <div className="sx-toolbar bl-tabs">
        <Chips value={sel ?? ''} onChange={(v) => setSel(v)} options={state.scenarios.map((x) => ({ value: x.id, label: `${x.name}${x.promoted ? ' (live)' : ''}` }))} />
      </div>
      {sc ? <ScenarioView sc={sc} onDeleted={() => setSel(null)} /> : <p className="sx-muted">Create a scenario to start.</p>}
    </SuitePage>
  );
};

const ScenarioView: React.FC<{ sc: Scenario; onDeleted: () => void }> = ({ sc, onDeleted }) => {
  const bl = useBlending();
  const live = useLiveSchedule();
  const override = useMemo(() => ({ workCenters: sc.workCenters, calendar: sc.calendar, moves: sc.moves }), [sc]);
  const sim = useLiveSchedule(DEFAULT_SCHED, override);
  const [hol, setHol] = useState({ date: addDays(TODAY, 3), workCenterId: '', hours: 0, reason: 'Simulated shutdown' });
  const [move, setMove] = useState({ jobId: live.sched[0]?.id ?? '', date: addDays(TODAY, 2) });
  const setWc = (id: string, patch: Partial<WorkCenter>) => bl.editScenario(sc.id, { workCenters: sc.workCenters.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
  const lateLive = live.sched.filter((j) => j.lateDays > 0).length;
  const lateSim = sim.sched.filter((j) => j.lateDays > 0).length;
  const lastLive = live.sched.map((j) => j.finish).sort().pop() ?? TODAY;
  const lastSim = sim.sched.map((j) => j.finish).sort().pop() ?? TODAY;
  return (
    <>
      <div className="sx-stats">
        <Stat label="Late jobs" value={`${lateLive} → ${lateSim}`} detail="Live → scenario" icon={<CalendarClock size={17} />} tone={lateSim < lateLive ? 'green' : lateSim > lateLive ? 'red' : 'slate'} />
        <Stat label="Last job finishes" value={`${fmtDate(lastSim)}`} detail={`Live: ${fmtDate(lastLive)}`} icon={<CalendarClock size={17} />} tone="blue" />
        <Stat label="Changes" value={sc.moves.length} detail="Job moves in this scenario" icon={<Repeat size={17} />} tone="violet" />
        <Stat label="Status" value={sc.promoted ? 'Live' : 'Simulation'} detail={sc.promoted ? `Promoted ${sc.promoted.replace('T', ' ').slice(0, 16)}` : `By ${sc.by}`} icon={<Rocket size={17} />} tone="gold" />
      </div>
      <div className="sx-row">
        <Panel title="Capacity in this scenario" subtitle="Machines, hours per day, crew and Saturday working" flush>
          <table className="sx-mini-table bl-tight">
            <thead>
              <tr>
                <th>Work centre</th>
                <th>Machines</th>
                <th>Hours/day</th>
                <th>Crew</th>
                <th>Saturday</th>
              </tr>
            </thead>
            <tbody>
              {sc.workCenters.map((w) => (
                <tr key={w.id}>
                  <td>{w.name}</td>
                  <td>
                    <input className="form-control" type="number" min="1" value={w.machines} onChange={(e) => setWc(w.id, { machines: Number(e.target.value) })} aria-label={`${w.name} machines`} style={{ width: 70 }} />
                  </td>
                  <td>
                    <input className="form-control" type="number" value={w.hoursPerDay} onChange={(e) => setWc(w.id, { hoursPerDay: Number(e.target.value) })} aria-label={`${w.name} hours`} style={{ width: 70 }} />
                  </td>
                  <td>
                    <input className="form-control" type="number" value={w.crew} onChange={(e) => setWc(w.id, { crew: Number(e.target.value) })} aria-label={`${w.name} crew`} style={{ width: 70 }} />
                  </td>
                  <td>
                    <input type="checkbox" checked={w.days.includes(6)} onChange={(e) => setWc(w.id, { days: e.target.checked ? [...w.days, 6] : w.days.filter((d) => d !== 6) })} aria-label={`${w.name} Saturday`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Calendar and job moves" subtitle="Only inside this scenario">
          <div className="bl-inline">
            <input className="form-control" type="date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} aria-label="Date" />
            <select className="form-control" value={hol.workCenterId} onChange={(e) => setHol({ ...hol, workCenterId: e.target.value })} aria-label="Work centre">
              <option value="">Whole factory</option>
              {sc.workCenters.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <input className="form-control" type="number" value={hol.hours} onChange={(e) => setHol({ ...hol, hours: Number(e.target.value) })} aria-label="Hours" style={{ width: 70 }} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => bl.editScenario(sc.id, { calendar: [...sc.calendar.filter((c) => !(c.date === hol.date && (c.workCenterId ?? '') === hol.workCenterId)), { id: `sim${Date.now()}`, date: hol.date, workCenterId: hol.workCenterId || undefined, hours: hol.hours, reason: hol.reason }] })}>
              Add day
            </button>
          </div>
          <div className="bl-inline">
            <select className="form-control" value={move.jobId} onChange={(e) => setMove({ ...move, jobId: e.target.value })} aria-label="Job">
              {live.sched.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.ref} · {j.label}
                </option>
              ))}
            </select>
            <input className="form-control" type="date" value={move.date} onChange={(e) => setMove({ ...move, date: e.target.value })} aria-label="New start" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => bl.editScenario(sc.id, { moves: [...sc.moves.filter((m) => m.jobId !== move.jobId), { jobId: move.jobId, date: move.date }] })}>
              Move job
            </button>
          </div>
          <ul className="sx-list">
            {sc.moves.map((m) => (
              <li key={m.jobId}>
                <span>{live.sched.find((j) => j.id === m.jobId)?.ref ?? m.jobId}</span>
                <span>→ {m.date ? fmtDate(m.date) : 'same date'}</span>
                <button type="button" className="sx-icon-btn" aria-label="Remove move" onClick={() => bl.editScenario(sc.id, { moves: sc.moves.filter((x) => x.jobId !== m.jobId) })}>
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <Panel title="Scenario schedule" subtitle="Simulated — not live">
        <Legend />
        <Gantt sched={sim.sched} wcs={sim.wcs} cal={sim.cal} />
      </Panel>
      <Panel title="Live vs scenario finish dates" flush>
        <table className="sx-mini-table bl-tight">
          <thead>
            <tr>
              <th>Job</th>
              <th>Due</th>
              <th>Live finish</th>
              <th>Scenario finish</th>
              <th className="bl-num">Change</th>
            </tr>
          </thead>
          <tbody>
            {live.sched.map((j) => {
              const s = sim.sched.find((x) => x.id === j.id);
              const d = s ? daysBetween(j.finish, s.finish) : 0;
              return (
                <tr key={j.id}>
                  <td>
                    <b className="sx-mono">{j.ref}</b> {j.label}
                  </td>
                  <td>{fmtDate(j.due)}</td>
                  <td className={j.lateDays ? 'sx-danger-text' : ''}>{fmtDate(j.finish)}</td>
                  <td className={s?.lateDays ? 'sx-danger-text' : ''}>{s ? fmtDate(s.finish) : '—'}</td>
                  <td className={`bl-num ${d < 0 ? 'sx-success-text' : d > 0 ? 'sx-danger-text' : ''}`}>{d ? `${d > 0 ? '+' : ''}${d} d` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <div className="bl-inline">
        <button type="button" className="btn btn-primary btn-sm" disabled={!!sc.promoted} onClick={() => bl.promoteScenario(sc.id)}>
          <CheckCircle2 size={14} /> Make this scenario live
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => bl.deleteScenario(sc.id).ok && onDeleted()}>
          <Trash2 size={14} /> Delete scenario
        </button>
      </div>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Multi-line work orders                                              */
/* ------------------------------------------------------------------ */

export const WorkOrdersPage: React.FC = () => {
  const bl = useBlending();
  const { state } = bl;
  const { state: ops, commercial, setProduction } = useOperations();
  const [creating, setCreating] = useState(false);
  return (
    <SuitePage
      eyebrow="Production"
      title="Work orders"
      subtitle="Production work orders with several lines — one batch per line, tracked together, optionally for one customer order."
      actions={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
          <Plus size={14} /> New work order
        </button>
      }
    >
      <div className="sx-row">
        {state.prodOrders.map((w) => {
          const batches = w.lines.map((l) => ops.batches.find((b) => b.id === l.batchId)).filter(Boolean) as typeof ops.batches;
          const doneN = batches.filter((b) => b.status === 'COMPLETED').length;
          return (
            <Panel key={w.id} title={w.number} subtitle={`${fmtDate(w.date)} · ${w.createdBy}${w.forOrder ? ` · for ${w.forOrder}` : ''} · ${w.notes}`} action={<Pill status={doneN === batches.length ? 'POSTED' : 'OPEN'} label={`${doneN}/${batches.length} done`} />}>
              <table className="sx-mini-table bl-tight">
                <tbody>
                  {w.lines.map((l) => {
                    const b = ops.batches.find((x) => x.id === l.batchId);
                    return (
                      <tr key={l.batchId} className="clickable" onClick={() => setProduction('batches', l.batchId)}>
                        <td className="sx-mono">{b?.number}</td>
                        <td>{ops.recipes.find((r) => r.id === l.recipeId)?.name}</td>
                        <td className="bl-num">{l.qty}</td>
                        <td>{b ? BATCH_LABEL[b.status] : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          );
        })}
        {!state.prodOrders.length && <p className="sx-muted">No work orders yet.</p>}
      </div>
      {creating && <NewWoModal onClose={() => setCreating(false)} orders={commercial.state.orders.filter((o) => o.status === 'APPROVED' && !o.closed).map((o) => o.number)} />}
    </SuitePage>
  );
};

const NewWoModal: React.FC<{ onClose: () => void; orders: string[] }> = ({ onClose, orders }) => {
  const bl = useBlending();
  const { state: ops } = useOperations();
  const [lines, setLines] = useState([{ recipeId: ops.recipes[0].id, qty: bl.state.params[0]?.minBatch ?? 100 }]);
  const [date, setDate] = useState(addDays(TODAY, 5));
  const [order, setOrder] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <Modal title="New work order" subtitle="Each line becomes a batch; batch-size, multiple and time-fence rules apply to every line" onClose={onClose} footer={<button type="button" className="btn btn-primary btn-sm" onClick={() => bl.createProdOrder(lines, date, order || undefined, notes).ok && onClose()}>Raise work order</button>}>
      <div className="sx-grid">
        <Field label="Date">
          <input className="form-control" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="For order (optional)">
          <select className="form-control" value={order} onChange={(e) => setOrder(e.target.value)}>
            <option value="">Stock</option>
            {orders.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </Field>
        <Field label="Notes" span={2}>
          <input className="form-control" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {lines.map((l, i) => {
        const p = bl.state.params.find((x) => x.recipeId === l.recipeId);
        return (
          <div key={i} className="bl-inline">
            <select className="form-control" value={l.recipeId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, recipeId: e.target.value } : x)))} aria-label="Product">
              {ops.recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <input className="form-control" type="number" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} aria-label="Quantity" style={{ width: 100 }} />
            <small className="sx-muted">{p ? `${p.minBatch}–${p.maxBatch} × ${p.orderMultiple}` : ''}</small>
            <button type="button" className="sx-icon-btn" aria-label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}
      <button type="button" className="btn btn-secondary btn-xs" onClick={() => setLines([...lines, { recipeId: ops.recipes[1]?.id ?? ops.recipes[0].id, qty: 100 }])}>
        <Plus size={12} /> Add line
      </button>
    </Modal>
  );
};
