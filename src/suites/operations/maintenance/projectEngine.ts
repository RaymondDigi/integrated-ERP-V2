import { addDays, daysBetween, round2, TODAY } from '../../finance/engine';
import type { Product, PurchaseOrder } from '../../commercial/types';
import type { Project } from '../types';
import type { ProjectCost, ProjectExt, ProjectTask } from './types';

/* ------------------------------------------------------------------ */
/* Network and critical path                                           */
/* ------------------------------------------------------------------ */

export interface ScheduledTask extends ProjectTask {
  es: number;
  ef: number;
  ls: number;
  lf: number;
  float: number;
  critical: boolean;
  startDate: string;
  finishDate: string;
}

/** Forward and backward pass over the task network (days from the project start), with total float per task. */
export const criticalPath = (tasks: ProjectTask[], projectStart: string) => {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const es = new Map<string, number>();
  const visiting = new Set<string>();
  let cycle = false;
  const early = (id: string): number => {
    if (es.has(id)) return es.get(id)!;
    if (visiting.has(id)) {
      cycle = true;
      return 0;
    }
    visiting.add(id);
    const t = byId.get(id)!;
    const own = t.start ? Math.max(0, daysBetween(projectStart, t.start)) : 0;
    const v = Math.max(own, ...t.predecessors.filter((p) => byId.has(p)).map((p) => early(p) + byId.get(p)!.durationDays));
    visiting.delete(id);
    es.set(id, v);
    return v;
  };
  tasks.forEach((t) => early(t.id));
  const finish = Math.max(0, ...tasks.map((t) => es.get(t.id)! + t.durationDays));
  const lf = new Map<string, number>();
  const late = (id: string): number => {
    if (lf.has(id)) return lf.get(id)!;
    const succ = tasks.filter((t) => t.predecessors.includes(id));
    const v = succ.length ? Math.min(...succ.map((s) => late(s.id) - s.durationDays)) : finish;
    lf.set(id, v);
    return v;
  };
  if (!cycle) tasks.forEach((t) => late(t.id));
  const out: ScheduledTask[] = tasks.map((t) => {
    const e = es.get(t.id)!;
    const l = cycle ? e + t.durationDays : lf.get(t.id)!;
    const float = l - t.durationDays - e;
    return { ...t, es: e, ef: e + t.durationDays, ls: l - t.durationDays, lf: l, float, critical: float === 0, startDate: addDays(projectStart, e), finishDate: addDays(projectStart, e + t.durationDays) };
  });
  return { tasks: out.sort((a, b) => a.es - b.es || a.ef - b.ef), duration: finish, finishDate: addDays(projectStart, finish), cycle };
};

/* ------------------------------------------------------------------ */
/* Appraisal                                                           */
/* ------------------------------------------------------------------ */

export const npv = (capex: number, annual: number, years: number, ratePct: number) => {
  const r = ratePct / 100;
  let v = -capex;
  for (let y = 1; y <= years; y++) v += annual / (1 + r) ** y;
  return round2(v);
};
export const irr = (capex: number, annual: number, years: number) => {
  if (!(capex > 0) || !(annual > 0)) return null;
  let lo = -0.99;
  let hi = 5;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (npv(capex, annual, years, mid * 100) > 0) lo = mid;
    else hi = mid;
  }
  return round2(((lo + hi) / 2) * 100);
};
export const payback = (capex: number, annual: number) => (annual > 0 ? round2(capex / annual) : null);

/* ------------------------------------------------------------------ */
/* Cost, progress and variance                                         */
/* ------------------------------------------------------------------ */

export const projectCosts = (costs: ProjectCost[], projectId: string) => costs.filter((c) => c.projectId === projectId);
export const actualCost = (costs: ProjectCost[], projectId: string, phaseId?: string) => round2(projectCosts(costs, projectId).filter((c) => !phaseId || c.phaseId === phaseId).reduce((x, c) => x + c.amount, 0));

/** Work done as a share of the phase (task progress weighted by duration). */
export const phaseProgress = (ext: ProjectExt, phaseId: string) => {
  const ts = ext.tasks.filter((t) => t.phaseId === phaseId);
  const total = ts.reduce((x, t) => x + t.durationDays, 0);
  return total ? ts.reduce((x, t) => x + (t.durationDays * t.progress) / 100, 0) / total : 0;
};
/** Share of the phase that should be done by today on the plan. */
const plannedShare = (start: string, end: string, on = TODAY) => {
  const len = Math.max(1, daysBetween(start, end));
  return Math.max(0, Math.min(1, daysBetween(start, on) / len));
};

/** Earned value by phase: planned value, earned value, actual cost, CPI/SPI and schedule slip. */
export const projectVariance = (p: Project, ext: ProjectExt, costs: ProjectCost[]) => {
  const cp = criticalPath(ext.tasks, p.start);
  const phases = ext.phases.map((ph) => {
    const ac = actualCost(costs, p.id, ph.id);
    const pct = phaseProgress(ext, ph.id);
    const pv = round2(ph.budget * plannedShare(ph.start, ph.end));
    const ev = round2(ph.budget * pct);
    const finishTasks = cp.tasks.filter((t) => t.phaseId === ph.id);
    const forecastEnd = finishTasks.length ? finishTasks.map((t) => t.actualFinish ?? (t.progress >= 100 ? t.finishDate : addDays(TODAY > t.startDate ? TODAY : t.startDate, Math.ceil(t.durationDays * (1 - t.progress / 100))))).sort().pop()! : ph.end;
    return { ...ph, ac, pct, pv, ev, cv: round2(ev - ac), sv: round2(ev - pv), cpi: ac ? round2(ev / ac) : null, spi: pv ? round2(ev / pv) : null, forecastEnd, slipDays: Math.max(0, daysBetween(ph.end, forecastEnd)) };
  });
  const tot = (k: 'ac' | 'pv' | 'ev' | 'budget') => round2(phases.reduce((x, ph) => x + ph[k], 0));
  const AC = tot('ac');
  const EV = tot('ev');
  const PV = tot('pv');
  const BAC = tot('budget') || p.budget;
  const cpi = AC ? round2(EV / AC) : null;
  return { phases, AC, EV, PV, BAC, cpi, spi: PV ? round2(EV / PV) : null, eac: cpi ? round2(BAC / cpi) : AC, forecastEnd: phases.map((x) => x.forecastEnd).sort().pop() ?? p.end, slipDays: Math.max(0, ...phases.map((x) => x.slipDays)), cp };
};

/** Material needs not covered by free stock or by open purchase orders. */
export const projectShortages = (ext: ProjectExt, products: Product[], pos: PurchaseOrder[]) =>
  ext.materials
    .filter((m) => m.qty - m.issued > 0)
    .map((m) => {
      const p = products.find((x) => x.sku === m.sku);
      const onOrder = pos.filter((o) => !o.closed && ['APPROVED', 'POSTED', 'SUBMITTED'].includes(o.status as string)).reduce((x, o) => x + o.lines.filter((l) => l.sku === m.sku).reduce((y, l) => y + Math.max(0, l.qty - l.received), 0), 0);
      const need = m.qty - m.issued;
      return { ...m, name: p?.name ?? m.sku, stock: p?.stock ?? 0, onOrder, need, short: Math.max(0, need - (p?.stock ?? 0) - onOrder), unitCost: p?.cost ?? 0 };
    });
