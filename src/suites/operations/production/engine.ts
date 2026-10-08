import { addDays, daysBetween, round2, TODAY } from '../../finance/engine';
import type { Product, PurchaseOrder, SalesOrder } from '../../commercial/types';
import type { Batch, OperationsState, Recipe } from '../types';
import { batchCost, materialNeed } from '../engine';
import { GRADE_ORDER, LINE_WC } from './data';
import type {
  BatchExt,
  Blendsheet,
  BlendingState,
  BlendStandard,
  CalendarException,
  CostOptions,
  CostRollup,
  PlanParams,
  Routing,
  RoutingOp,
  TeaLot,
  WorkCenter
} from './types';

export const BLEND_LABEL: Record<Blendsheet['status'], string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Awaiting approval',
  APPROVED: 'Approved',
  IN_PROGRESS: 'Blending',
  COMPLETED: 'Completed',
  REJECTED: 'Returned',
  CANCELLED: 'Cancelled'
};
export const BLEND_PILL: Record<Blendsheet['status'], string> = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  IN_PROGRESS: 'OPEN',
  COMPLETED: 'POSTED',
  REJECTED: 'REJECTED',
  CANCELLED: 'VOID'
};
export const ALL_OPTS: CostOptions = { material: true, labour: true, burden: true, subcontract: true, scrap: true };

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

/* ------------------------------------------------------------------ */
/* Tea lots and blendsheets                                            */
/* ------------------------------------------------------------------ */

/** Kg of a lot promised to blendsheets that are submitted or approved but not yet issued. */
export const lotCommitted = (s: BlendingState, lotId: string, exceptBs?: string) =>
  sum(
    s.blendsheets.filter((b) => b.id !== exceptBs && (b.status === 'SUBMITTED' || b.status === 'APPROVED')),
    (b) => sum(b.lines.filter((l) => l.lotId === lotId), (l) => l.kg)
  );
export const lotFree = (s: BlendingState, lot: TeaLot, exceptBs?: string) => (lot.status === 'AVAILABLE' ? Math.max(0, lot.kgBalance - lotCommitted(s, lot.id, exceptBs)) : 0);

export const bsKg = (b: Pick<Blendsheet, 'lines'>) => sum(b.lines, (l) => l.kg);
export const bsCost = (b: Pick<Blendsheet, 'lines'>, lots: TeaLot[]) => round2(sum(b.lines, (l) => l.kg * (lots.find((x) => x.id === l.lotId)?.costPerKg ?? 0)));

/** Share of each grade in the blend, in percent of the kg on the sheet. */
export const gradeMix = (b: Pick<Blendsheet, 'lines'>, lots: TeaLot[]) => {
  const total = bsKg(b) || 1;
  const out: Record<string, number> = {};
  for (const l of b.lines) {
    const g = lots.find((x) => x.id === l.lotId)?.grade ?? '?';
    out[g] = (out[g] ?? 0) + (l.kg / total) * 100;
  }
  return out;
};

/** Everything that stops a blendsheet from going for approval. */
export const blendProblems = (s: BlendingState, b: Blendsheet) => {
  const std = s.standards.find((x) => x.id === b.standardId);
  const out: string[] = [];
  if (!std) return ['Choose the blend standard'];
  if (!b.lines.length) return ['Add the tea lots to blend'];
  const kg = bsKg(b);
  if (Math.abs(kg - b.targetKg) > b.targetKg * 0.005) out.push(`Lots add up to ${kg.toLocaleString()} kg — the target is ${b.targetKg.toLocaleString()} kg (ratios must total 100%)`);
  const mix = gradeMix(b, s.lots);
  for (const g of std.grades) {
    const p = mix[g.grade] ?? 0;
    if (p < g.minPct - 0.05 || p > g.maxPct + 0.05) out.push(`${g.grade} is ${p.toFixed(1)}% — ${std.code} allows ${g.minPct}–${g.maxPct}%`);
  }
  for (const g of Object.keys(mix)) if (!std.grades.some((x) => x.grade === g)) out.push(`${g} is not part of the ${std.code} standard`);
  const seen = new Set<string>();
  for (const l of b.lines) {
    const lot = s.lots.find((x) => x.id === l.lotId);
    if (!lot) {
      out.push('A line points to an unknown lot');
      continue;
    }
    if (seen.has(lot.id)) out.push(`${lot.invoiceNo} is on the sheet twice`);
    seen.add(lot.id);
    if (!(l.kg > 0)) out.push(`${lot.invoiceNo}: enter the kg to use`);
    if (lot.status === 'ON_HOLD') out.push(`${lot.invoiceNo} is on hold — ${lot.holdReason ?? 'quality hold'}`);
    const free = lotFree(s, lot, b.id);
    if (lot.status === 'AVAILABLE' && l.kg > free) out.push(`${lot.invoiceNo}: only ${free.toLocaleString()} kg free (balance ${lot.kgBalance.toLocaleString()} kg less other blendsheets)`);
  }
  return out;
};

/** Chop-by-chop layout: how many kg of each lot go into each chop of the tower or drum. */
export const blendLayout = (b: Blendsheet, lots: TeaLot[], wc: WorkCenter | undefined) => {
  const chopKg = wc?.chopKg ?? 1_000;
  const chops = Math.max(1, Math.ceil(b.targetKg / chopKg));
  const rows = [...b.lines]
    .map((l) => ({ l, lot: lots.find((x) => x.id === l.lotId) }))
    .sort((x, y) => GRADE_ORDER.indexOf(x.lot?.grade ?? '') - GRADE_ORDER.indexOf(y.lot?.grade ?? ''))
    .map(({ l, lot }, i) => ({
      layer: i + 1,
      lotId: l.lotId,
      invoiceNo: lot?.invoiceNo ?? '?',
      garden: lot?.garden ?? '',
      grade: lot?.grade ?? '',
      location: lot ? `${lot.warehouseId} · ${lot.bay}` : '',
      kg: l.kg,
      ratioPct: b.targetKg ? round2((l.kg / b.targetKg) * 100) : 0,
      perChop: round2(l.kg / chops)
    }));
  return { chops, chopKg: round2(b.targetKg / chops), rows };
};

export const evaluateChop = (std: BlendStandard | undefined, moisturePct: number, tastingScore: number) => {
  const reasons: string[] = [];
  if (!std) return reasons;
  if (moisturePct > std.moistureMax) reasons.push(`Moisture ${moisturePct}% above the ${std.moistureMax}% limit`);
  if (tastingScore < std.tastingMin) reasons.push(`Tasting score ${tastingScore} below the ${std.tastingMin} minimum`);
  return reasons;
};

/** Blend out-turn: tea in against blended tea out, by-products and unexplained loss. */
export const outturn = (b: Blendsheet) => {
  const input = b.outturn?.inputKg ?? (b.issuedAt ? bsKg(b) : 0);
  const output = b.outturn?.outputKg ?? 0;
  const by = sum(b.outturn?.byProducts ?? [], (x) => x.kg);
  const loss = b.outturn ? b.outturn.lossKg : 0;
  return { input, output, by, loss, pct: input ? output / input : 0, lossPct: input ? loss / input : 0 };
};

/* ------------------------------------------------------------------ */
/* Routings and costing                                                */
/* ------------------------------------------------------------------ */

/** The routing a batch follows: a customer-specific active routing first, then the general active one. */
export const activeRouting = (routings: Routing[], recipeId: string, customerId?: string) =>
  routings.find((r) => r.recipeId === recipeId && r.status === 'ACTIVE' && customerId && r.forCustomerId === customerId) ??
  routings.find((r) => r.recipeId === recipeId && r.status === 'ACTIVE' && !r.forCustomerId);

export const runHours = (op: RoutingOp, qty: number, batchSize: number) =>
  op.kind === 'SUBCONTRACT' ? 0 : op.runBasis === 'HOURS' ? (op.runValue * qty) / Math.max(1, batchSize) : op.runValue > 0 ? qty / op.runValue : 0;
export const opHours = (op: RoutingOp, qty: number, batchSize: number) => (op.kind === 'SUBCONTRACT' ? 0 : op.setupHrs + runHours(op, qty, batchSize));
export const yieldFactor = (routing: Routing | undefined, params: PlanParams | undefined) =>
  (routing?.ops ?? []).reduce((y, o) => y * (1 - o.scrapPct / 100), 1) * ((params?.expectedYieldPct ?? 100) / 100);

/** Standard cost roll-up for a quantity: materials, direct labour, indirect labour and machine burden, set-up and outside processing. */
export const rollUpCost = (recipe: Recipe, routing: Routing | undefined, wcs: WorkCenter[], products: Product[], params: PlanParams | undefined, qty: number, opts: CostOptions = ALL_OPTS): CostRollup => {
  const material = opts.material ? sum(materialNeed(recipe, qty), (n) => n.qty * (products.find((p) => p.sku === n.sku)?.cost ?? 0)) : 0;
  let labour = 0;
  let indirect = 0;
  let machine = 0;
  let burden = 0;
  let setup = 0;
  let subcontract = 0;
  let hours = 0;
  const ops = routing?.ops ?? [{ seq: 10, name: 'Run', kind: 'PACKING' as const, workCenterId: LINE_WC[recipe.line] ?? 'WC-PK1', setupHrs: 0, runBasis: 'HOURS' as const, runValue: recipe.hours, workers: 3, scrapPct: 0, overlapPct: 0, instructions: [] }];
  for (const op of ops) {
    const wc = wcs.find((w) => w.id === op.workCenterId);
    if (op.kind === 'SUBCONTRACT') {
      if (opts.subcontract) subcontract += (op.costPerUnit ?? 0) * qty;
      continue;
    }
    if (!wc) continue;
    const run = runHours(op, qty, recipe.batchSize);
    const opH = run + op.setupHrs;
    hours += opH;
    const manHours = opH * op.workers;
    const opLabour = manHours * wc.labourDirectRate;
    if (opts.labour) labour += opLabour;
    if (opts.burden) {
      indirect += manHours * wc.labourIndirectRate;
      machine += run * wc.machineRate;
      setup += wc.setupCost;
      const b = wc.burden;
      burden += b.basis === 'PER_HOUR' ? b.amount * opH : b.basis === 'PER_UNIT' ? b.amount * qty : b.basis === 'PCT_LABOUR' ? (b.amount / 100) * opLabour : (b.amount / 100) * material;
    }
  }
  const yf = opts.scrap ? yieldFactor(routing, params) : 1;
  const total = material + labour + indirect + machine + burden + setup + subcontract;
  return {
    material: round2(material),
    labour: round2(labour),
    indirectLabour: round2(indirect),
    machine: round2(machine),
    burden: round2(burden),
    setup: round2(setup),
    subcontract: round2(subcontract),
    total: round2(total),
    perUnit: round2(total / Math.max(0.0001, qty * yf)),
    yieldFactor: yf,
    hours: round2(hours)
  };
};

/** Frozen standard cost per unit if there is one, otherwise today's roll-up. */
export const standardPerUnit = (s: BlendingState, recipe: Recipe, products: Product[]) => {
  const frozen = s.standardCosts.filter((c) => c.recipeId === recipe.id).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (frozen) return { perUnit: frozen.perUnit, rollup: frozen.rollup, qty: frozen.qty, frozen: true as const, at: frozen.at };
  const r = rollUpCost(recipe, activeRouting(s.routings, recipe.id), s.workCenters, products, s.params.find((p) => p.recipeId === recipe.id), recipe.batchSize);
  return { perUnit: r.perUnit, rollup: r, qty: recipe.batchSize, frozen: false as const, at: '' };
};

/** Actual labour and overhead booked on a batch at the work-centre rates. */
export const actualConversion = (ext: BatchExt | undefined, wcs: WorkCenter[]) => {
  let labour = 0;
  let overhead = 0;
  let hours = 0;
  for (const l of ext?.labour ?? []) {
    const wc = wcs.find((w) => w.id === l.workCenterId);
    if (!wc) continue;
    hours += l.hours;
    labour += l.hours * wc.labourDirectRate;
    overhead += l.hours * wc.labourIndirectRate + (wc.burden.basis === 'PER_HOUR' ? wc.burden.amount * l.hours : 0) + wc.machineRate * l.hours * 0.5;
  }
  return { labour: round2(labour), overhead: round2(overhead), hours: round2(hours) };
};

/** Standard against actual for one batch: material usage, labour efficiency, overhead, yield and time. */
export const batchVariance = (s: BlendingState, ops: OperationsState, b: Batch, products: Product[]) => {
  const recipe = ops.recipes.find((r) => r.id === b.recipeId)!;
  const ext = s.ext[b.id];
  const std = standardPerUnit(s, recipe, products);
  const good = Math.max(0, b.output - (ext?.disassembled ?? 0));
  const denom = Math.max(0.0001, std.qty * std.rollup.yieldFactor);
  const stdMat = (std.rollup.material / denom) * good;
  const stdLab = (std.rollup.labour / denom) * good;
  const stdOh = ((std.rollup.indirectLabour + std.rollup.machine + std.rollup.burden + std.rollup.setup) / denom) * good;
  const stdSub = (std.rollup.subcontract / denom) * good;
  const actMat = batchCost(b, products) + sum(ext?.rework?.extra ?? [], (x) => x.qty * (products.find((p) => p.sku === x.sku)?.cost ?? 0));
  const conv = actualConversion(ext, s.workCenters);
  const actSub = sum(s.subcontracts.filter((c) => c.batchId === b.id), (c) => c.cost);
  const rework = ext?.rework?.cost ?? 0;
  const stdHours = (std.rollup.hours / Math.max(1, std.qty)) * b.plannedQty;
  const standard = round2(stdMat + stdLab + stdOh + stdSub);
  const actual = round2(actMat + conv.labour + conv.overhead + actSub + rework);
  const expectedGood = b.plannedQty * std.rollup.yieldFactor;
  return {
    standard,
    actual,
    total: round2(actual - standard),
    material: round2(actMat - stdMat),
    labour: round2(conv.labour - stdLab),
    overhead: round2(conv.overhead - stdOh),
    subcontract: round2(actSub - stdSub),
    rework: round2(rework),
    yieldVar: round2((expectedGood - good) * std.perUnit),
    qtyVar: round2(good - b.plannedQty),
    yieldPct: b.plannedQty ? good / b.plannedQty : 0,
    stdHours: round2(stdHours),
    actHours: conv.hours,
    timeVar: round2(conv.hours - stdHours),
    perUnit: std.perUnit
  };
};

/* ------------------------------------------------------------------ */
/* Calendar and capacity                                               */
/* ------------------------------------------------------------------ */

const weekday = (date: string) => new Date(date + 'T00:00:00').getDay();

/** Hours one machine of a work centre runs on a date, after holidays and planned stoppages. */
export const hoursOn = (wc: WorkCenter, date: string, cal: CalendarException[]) => {
  const ex = cal.find((c) => c.date === date && c.workCenterId === wc.id) ?? cal.find((c) => c.date === date && !c.workCenterId);
  if (ex) return ex.hours;
  return wc.days.includes(weekday(date)) ? wc.hoursPerDay : 0;
};
export const nextWorkingDay = (wc: WorkCenter | undefined, from: string, cal: CalendarException[]) => {
  let d = from;
  for (let i = 0; i < 30; i++) {
    if (!wc || hoursOn(wc, d, cal) > 0) return d;
    d = addDays(d, 1);
  }
  return from;
};
/** Machines an operation can actually run on at once: limited by machines, tooling and the crew it needs. */
export const parallelFor = (wc: WorkCenter, workers: number) => Math.min(wc.machines, wc.tooling, workers > 0 ? Math.floor(wc.crew / workers) : wc.machines);

/* ------------------------------------------------------------------ */
/* Scheduler                                                           */
/* ------------------------------------------------------------------ */

export type FirmLevel = 'PLANNED' | 'FIRM' | 'RELEASED';
export interface JobOp {
  seq: number;
  name: string;
  wcId: string;
  hours: number;
  workers: number;
  overlapPct: number;
  kind: RoutingOp['kind'];
}
export interface Job {
  id: string;
  ref: string;
  kind: 'BATCH' | 'BLEND';
  label: string;
  recipeId?: string;
  category?: string;
  qty: number;
  unit: string;
  firm: FirmLevel;
  release: string;
  due: string;
  ops: JobOp[];
  pctDone: number;
  materialShort: string[];
  materialEta?: string;
}
export interface SchedOp extends JobOp {
  start: string;
  finish: string;
}
export interface SchedJob extends Job {
  sops: SchedOp[];
  start: string;
  finish: string;
  lateDays: number;
  cr: number;
  problem?: string;
}
export type SchedMode = 'FORWARD' | 'BACKWARD' | 'MIDPOINT';
export interface SchedOptions {
  mode: SchedMode;
  finite: boolean;
  rule: 'DUE' | 'CR' | 'SEQUENCE';
  processFlow: boolean;
}
export const DEFAULT_SCHED: SchedOptions = { mode: 'FORWARD', finite: true, rule: 'DUE', processFlow: false };

/** Work still to do on every open batch and blendsheet, from their routings. */
export const buildJobs = (s: BlendingState, ops: OperationsState, products: Product[], orders: SalesOrder[], pos: PurchaseOrder[]): Job[] => {
  const jobs: Job[] = [];
  for (const b of ops.batches) {
    if (!['PLANNED', 'RELEASED', 'IN_PROGRESS', 'QC'].includes(b.status)) continue;
    const recipe = ops.recipes.find((r) => r.id === b.recipeId);
    if (!recipe) continue;
    const ext = s.ext[b.id];
    const order = b.forOrder ? orders.find((o) => o.number === b.forOrder) : undefined;
    const routing = (ext?.routingId && s.routings.find((r) => r.id === ext.routingId)) || activeRouting(s.routings, recipe.id, order?.customerId);
    const base: RoutingOp[] = routing?.ops ?? [{ seq: 10, name: 'Run', kind: 'PACKING', workCenterId: LINE_WC[recipe.line] ?? 'WC-PK1', setupHrs: 0, runBasis: 'HOURS', runValue: recipe.hours, workers: 3, scrapPct: 0, overlapPct: 0, instructions: [] }];
    const booked = sum(ext?.labour ?? [], (l) => l.hours);
    const stdMan = sum(base, (o) => opHours(o, b.plannedQty, recipe.batchSize) * Math.max(1, o.workers));
    const pct = b.status === 'IN_PROGRESS' ? Math.min(0.9, stdMan ? booked / stdMan : 0.25) || 0.25 : 0;
    const jops: JobOp[] = base
      .filter((o) => o.kind !== 'SUBCONTRACT')
      .map((o) => {
        const full = opHours(o, b.plannedQty, recipe.batchSize);
        const left = b.status === 'QC' ? (o.kind === 'INSPECTION' ? full : 0) : o.kind === 'INSPECTION' ? full : full * (1 - pct);
        const wcId = o.kind === 'PACKING' && ext?.workCenterId ? ext.workCenterId : o.workCenterId;
        return { seq: o.seq, name: o.name, wcId, hours: round2(left), workers: o.workers, overlapPct: o.overlapPct, kind: o.kind };
      })
      .filter((o) => o.hours > 0);
    const short =
      b.status === 'PLANNED' || b.status === 'RELEASED'
        ? materialNeed(recipe, b.plannedQty).filter((n) => (products.find((p) => p.sku === n.sku)?.stock ?? 0) < n.qty).map((n) => n.sku)
        : [];
    const eta = short.length
      ? pos
          .filter((p) => ['APPROVED', 'SUBMITTED'].includes(p.status) && !p.closed && p.lines.some((l) => short.includes(l.sku) && l.received < l.qty))
          .map((p) => p.expected)
          .sort()
          .pop()
      : undefined;
    const release = b.status === 'IN_PROGRESS' || b.status === 'QC' ? TODAY : ext?.pinDate ?? b.date;
    jobs.push({
      id: b.id,
      ref: b.number,
      kind: 'BATCH',
      label: recipe.name,
      recipeId: recipe.id,
      category: products.find((p) => p.sku === recipe.product)?.category,
      qty: b.plannedQty,
      unit: products.find((p) => p.sku === recipe.product)?.unit ?? 'units',
      firm: b.status === 'PLANNED' ? 'PLANNED' : b.status === 'RELEASED' ? 'FIRM' : 'RELEASED',
      release: release < TODAY ? TODAY : release,
      due: order?.requiredBy && order.requiredBy > (ext?.pinDate ?? b.date) ? order.requiredBy : addDays(ext?.pinDate ?? b.date, 2),
      ops: jops,
      pctDone: b.status === 'QC' ? 0.95 : pct,
      materialShort: short,
      materialEta: short.length ? eta ?? addDays(TODAY, 10) : undefined
    });
  }
  for (const b of s.blendsheets) {
    if (!['DRAFT', 'SUBMITTED', 'APPROVED', 'IN_PROGRESS'].includes(b.status)) continue;
    const wc = s.workCenters.find((w) => w.id === b.workCenterId);
    const done = sum(b.chops.filter((c) => c.result?.pass), (c) => c.kgIn);
    const left = Math.max(0, b.targetKg - done);
    const hrs = round2(left / (wc?.kgPerHour ?? 800) + (b.status === 'IN_PROGRESS' ? 0 : 1));
    const chopsLeft = Math.max(1, Math.ceil(left / (wc?.chopKg ?? 1_000)));
    const std = s.standards.find((x) => x.id === b.standardId);
    const free = b.status === 'IN_PROGRESS' ? [] : b.lines.filter((l) => {
      const lot = s.lots.find((x) => x.id === l.lotId);
      return !lot || lot.status !== 'AVAILABLE' || lot.kgBalance < l.kg;
    });
    jobs.push({
      id: b.id,
      ref: b.number,
      kind: 'BLEND',
      label: std?.name ?? 'Blend',
      category: 'Blending',
      qty: b.targetKg,
      unit: 'kg',
      firm: b.status === 'APPROVED' ? 'FIRM' : b.status === 'IN_PROGRESS' ? 'RELEASED' : 'PLANNED',
      release: b.status === 'IN_PROGRESS' || b.date < TODAY ? TODAY : b.date,
      due: b.due,
      ops: [
        { seq: 10, name: `Blend ${chopsLeft} chop${chopsLeft > 1 ? 's' : ''}`, wcId: b.workCenterId, hours: hrs, workers: 3, overlapPct: 60, kind: 'PROCESS' as const },
        { seq: 20, name: 'Tasting & moisture', wcId: 'WC-LAB', hours: round2(0.5 * chopsLeft), workers: 1, overlapPct: 0, kind: 'INSPECTION' as const }
      ].filter((o) => o.hours > 0),
      pctDone: b.targetKg ? done / b.targetKg : 0,
      materialShort: free.map((l) => l.lotId),
      materialEta: free.length ? addDays(TODAY, 7) : undefined
    });
  }
  return jobs;
};

/** Working days left until the due date divided by the working days of work left. Under 1 means it will be late. */
export const criticalRatio = (job: Job, wcs: WorkCenter[]) => {
  const daysLeft = Math.max(0, daysBetween(TODAY, job.due));
  const workDays = sum(job.ops, (o) => {
    const wc = wcs.find((w) => w.id === o.wcId);
    const perDay = wc ? wc.hoursPerDay * Math.max(1, parallelFor(wc, o.workers)) : 8;
    return o.hours / perDay;
  });
  return workDays ? round2(daysLeft / workDays) : 99;
};

/**
 * Finite or infinite capacity scheduler. Places each job's operations on its work centres day by day against
 * the calendar (holidays, short shifts), the machines, tooling and crew each operation needs, and lets the next
 * operation start early where the routing allows overlap. Forward from the release date, backward from the due
 * date (pull), or outward from a midpoint at the bottleneck operation. Process-flow mode books the machines first
 * and then pushes any job whose materials are not there yet to the date they arrive.
 */
export const schedule = (jobsIn: Job[], wcs: WorkCenter[], cal: CalendarException[], opts: SchedOptions = DEFAULT_SCHED): SchedJob[] => {
  const run = (jobs: Job[]) => {
    const used = new Map<string, number>();
    const key = (wc: string, d: string) => `${wc}|${d}`;
    const capacity = (wc: WorkCenter, d: string) => hoursOn(wc, d, cal) * wc.machines;
    const opCap = (wc: WorkCenter, d: string, workers: number) => hoursOn(wc, d, cal) * parallelFor(wc, workers);
    const avail = (wc: WorkCenter, d: string, workers: number) => {
      const c = opCap(wc, d, workers);
      return opts.finite ? Math.max(0, Math.min(c, capacity(wc, d) - (used.get(key(wc.id, d)) ?? 0))) : c;
    };
    const take = (wc: WorkCenter, d: string, h: number) => used.set(key(wc.id, d), (used.get(key(wc.id, d)) ?? 0) + h);
    const forward = (wc: WorkCenter, from: string, hours: number, workers: number) => {
      let d = from < TODAY ? TODAY : from;
      let left = hours;
      let start = '';
      for (let i = 0; i < 400; i++) {
        const a = avail(wc, d, workers);
        if (a > 0.001) {
          const t = Math.min(a, left);
          take(wc, d, t);
          if (!start) start = d;
          left -= t;
          if (left <= 0.001) return { start, finish: d, ok: true };
        }
        d = addDays(d, 1);
      }
      return { start: start || from, finish: d, ok: false };
    };
    const backward = (wc: WorkCenter, latest: string, hours: number, workers: number) => {
      let d = latest;
      let left = hours;
      let finish = '';
      const takes: [string, number][] = [];
      for (let i = 0; i < 400 && d >= TODAY; i++) {
        const a = avail(wc, d, workers);
        if (a > 0.001) {
          const t = Math.min(a, left);
          takes.push([d, t]);
          if (!finish) finish = d;
          left -= t;
          if (left <= 0.001) break;
        }
        d = addDays(d, -1);
      }
      if (left > 0.001) return null;
      for (const [day, t] of takes) take(wc, day, t);
      return { start: takes[takes.length - 1][0], finish };
    };
    const span = (a: string, b: string) => Math.max(0, daysBetween(a, b));

    const order = [...jobs].sort((a, b) => {
      if (a.firm !== b.firm) return (a.firm === 'RELEASED' ? 0 : a.firm === 'FIRM' ? 1 : 2) - (b.firm === 'RELEASED' ? 0 : b.firm === 'FIRM' ? 1 : 2);
      if (opts.rule === 'CR') return criticalRatio(a, wcs) - criticalRatio(b, wcs);
      if (opts.rule === 'SEQUENCE') {
        const wa = wcs.find((w) => w.id === a.ops[0]?.wcId);
        const ia = wa?.sequence.indexOf(a.recipeId ?? '') ?? -1;
        const ib = wa?.sequence.indexOf(b.recipeId ?? '') ?? -1;
        if (a.ops[0]?.wcId === b.ops[0]?.wcId && ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      }
      return a.due.localeCompare(b.due) || a.release.localeCompare(b.release);
    });

    return order.map<SchedJob>((job) => {
      const sops: SchedOp[] = [];
      let problem: string | undefined;
      const wcOf = (o: JobOp) => wcs.find((w) => w.id === o.wcId);
      for (const o of job.ops) {
        const wc = wcOf(o);
        if (!wc) problem = `Work centre ${o.wcId} is missing`;
        else if (parallelFor(wc, o.workers) < 1) problem = `${o.name} needs ${o.workers} people — ${wc.name} has a crew of ${wc.crew}`;
      }
      const placeForwardFrom = (from: string, list: JobOp[]) => {
        let earliest = from;
        const out: SchedOp[] = [];
        for (const o of list) {
          const wc = wcOf(o);
          if (!wc || parallelFor(wc, o.workers) < 1) {
            out.push({ ...o, start: earliest, finish: earliest });
            continue;
          }
          const r = forward(wc, earliest, o.hours, o.workers);
          if (!r.ok) problem = problem ?? `No capacity on ${wc.name} within the horizon`;
          out.push({ ...o, start: r.start, finish: r.finish });
          earliest = o.overlapPct > 0 ? addDays(r.start, Math.floor(span(r.start, r.finish) * (1 - o.overlapPct / 100))) : r.finish;
        }
        return out;
      };
      const placeBackwardFrom = (latest: string, list: JobOp[]) => {
        let due = latest;
        const out: SchedOp[] = [];
        for (const o of [...list].reverse()) {
          const wc = wcOf(o);
          if (!wc || parallelFor(wc, o.workers) < 1) {
            out.unshift({ ...o, start: due, finish: due });
            continue;
          }
          const r = backward(wc, due, o.hours, o.workers);
          if (!r) return null;
          out.unshift({ ...o, start: r.start, finish: r.finish });
          due = r.start;
        }
        return out;
      };
      if (opts.mode === 'BACKWARD') {
        const b = placeBackwardFrom(job.due < job.release ? job.release : job.due, job.ops);
        if (b) sops.push(...b);
        else {
          problem = problem ?? 'Cannot meet the due date working back — scheduled forward from today';
          sops.push(...placeForwardFrom(job.release, job.ops));
        }
      } else if (opts.mode === 'MIDPOINT' && job.ops.length > 1) {
        const anchorIdx = job.ops.reduce((best, o, i) => (o.hours > job.ops[best].hours ? i : best), 0);
        const before = job.ops.slice(0, anchorIdx);
        const anchor = placeForwardFrom(job.release, [job.ops[anchorIdx]]);
        const back = placeBackwardFrom(anchor[0].start, before);
        if (back) sops.push(...back);
        else {
          problem = problem ?? 'Earlier operations do not fit before the midpoint — started from today';
          sops.push(...placeForwardFrom(TODAY, before));
        }
        sops.push(...anchor, ...placeForwardFrom(anchor[0].finish, job.ops.slice(anchorIdx + 1)));
      } else sops.push(...placeForwardFrom(job.release, job.ops));
      const start = sops.length ? sops.map((x) => x.start).sort()[0] : job.release;
      const finish = sops.length ? sops.map((x) => x.finish).sort().pop()! : job.release;
      return { ...job, sops, start, finish, lateDays: Math.max(0, daysBetween(job.due, finish)), cr: criticalRatio(job, wcs), problem };
    });
  };
  if (!opts.processFlow) return run(jobsIn);
  const first = run(jobsIn);
  const adjusted = jobsIn.map((j) => {
    const s = first.find((x) => x.id === j.id);
    return j.materialEta && s && s.start < j.materialEta ? { ...j, release: j.materialEta } : j;
  });
  return run(adjusted);
};

/** Work-centre load per week split into planned, firm and released work, against capacity. */
export const workCenterLoad = (sched: SchedJob[], wcs: WorkCenter[], cal: CalendarException[], weeks = 6) => {
  const starts = Array.from({ length: weeks }, (_, i) => addDays(TODAY, i * 7));
  return wcs.map((wc) => ({
    wc,
    weeks: starts.map((ws) => {
      const we = addDays(ws, 6);
      const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
      const capacity = sum(days, (d) => hoursOn(wc, d, cal) * wc.machines);
      const part = { PLANNED: 0, FIRM: 0, RELEASED: 0 } as Record<FirmLevel, number>;
      for (const j of sched)
        for (const o of j.sops) {
          if (o.wcId !== wc.id || o.finish < ws || o.start > we) continue;
          const total = Math.max(1, daysBetween(o.start, o.finish) + 1);
          const inWeek = days.filter((d) => d >= o.start && d <= o.finish).length;
          part[j.firm] += (o.hours * inWeek) / total;
        }
      const load = part.PLANNED + part.FIRM + part.RELEASED;
      return { start: ws, capacity: round2(capacity), planned: round2(part.PLANNED), firm: round2(part.FIRM), released: round2(part.RELEASED), load: round2(load), pct: capacity ? load / capacity : load ? 9 : 0 };
    })
  }));
};

/** Overloaded weeks on a packing line, with a line of the same kind that has room to take the job. */
export const balanceSuggestions = (sched: SchedJob[], wcs: WorkCenter[], cal: CalendarException[]) => {
  const load = workCenterLoad(sched, wcs, cal, 4);
  const out: { jobId: string; ref: string; from: string; to: string; week: string; hours: number }[] = [];
  for (const row of load)
    for (const w of row.weeks) {
      if (w.pct <= 1) continue;
      const jobs = sched.filter((j) => j.kind === 'BATCH' && j.firm !== 'RELEASED' && j.sops.some((o) => o.wcId === row.wc.id && o.start >= w.start && o.start <= addDays(w.start, 6) && o.kind === 'PACKING'));
      for (const j of jobs) {
        const h = j.sops.find((o) => o.wcId === row.wc.id)?.hours ?? 0;
        const alt = load.find((r) => r.wc.id !== row.wc.id && r.wc.kind === row.wc.kind && r.weeks.find((x) => x.start === w.start)!.capacity - r.weeks.find((x) => x.start === w.start)!.load >= h);
        if (alt) out.push({ jobId: j.id, ref: j.ref, from: row.wc.id, to: alt.wc.id, week: w.start, hours: round2(h) });
      }
    }
  return out;
};

/** Planned batches of the same recipe within a week of each other that could run as one. */
export const groupBatches = (ops: OperationsState, s: BlendingState) => {
  const planned = ops.batches.filter((b) => b.status === 'PLANNED').sort((a, b) => (s.ext[a.id]?.pinDate ?? a.date).localeCompare(s.ext[b.id]?.pinDate ?? b.date));
  const groups: Batch[][] = [];
  for (const b of planned) {
    const date = s.ext[b.id]?.pinDate ?? b.date;
    const g = groups.find((x) => x[0].recipeId === b.recipeId && (x[0].forOrder ?? '') === (b.forOrder ?? '') && Math.abs(daysBetween(s.ext[x[0].id]?.pinDate ?? x[0].date, date)) <= 7);
    if (g) g.push(b);
    else groups.push([b]);
  }
  return groups.filter((g) => g.length > 1);
};

/* ------------------------------------------------------------------ */
/* Master schedule and material requirements                           */
/* ------------------------------------------------------------------ */

export const roundToMultiple = (qty: number, p: PlanParams | undefined) => {
  if (!p) return Math.ceil(qty);
  const m = Math.max(1, p.orderMultiple);
  return Math.max(p.minBatch, Math.ceil(qty / m) * m);
};
/** Split a requirement into batches that respect the min, max and multiple. */
export const batchSizes = (qty: number, p: PlanParams | undefined) => {
  if (!p) return [Math.ceil(qty)];
  const out: number[] = [];
  let left = roundToMultiple(qty, p);
  while (left > 0) {
    const q = Math.min(p.maxBatch, left);
    out.push(Math.max(p.minBatch, q));
    left -= q;
  }
  return out;
};

export interface MpsRow {
  recipe: Recipe;
  product?: Product;
  params?: PlanParams;
  weeks: { start: string; so: number; forecast: number; demand: number; receipts: number; planned: number; projected: number; zone: 'FROZEN' | 'FIRM' | 'OPEN' }[];
  suggestions: { date: string; qty: number }[];
}

/** Master production schedule: demand (orders inside the demand fence, the larger of orders and seasonal forecast beyond it) against stock, scheduled batches and safety stock. */
export const mps = (s: BlendingState, ops: OperationsState, products: Product[], orders: SalesOrder[], weeks = 8): MpsRow[] => {
  const starts = Array.from({ length: weeks }, (_, i) => addDays(TODAY, i * 7));
  return ops.recipes.map((recipe) => {
    const product = products.find((p) => p.sku === recipe.product);
    const params = s.params.find((p) => p.recipeId === recipe.id);
    const yf = (params?.expectedYieldPct ?? 100) / 100;
    let projected = product?.stock ?? 0;
    const suggestions: MpsRow['suggestions'] = [];
    const rows = starts.map((ws, i) => {
      const we = addDays(ws, 6);
      const inWeek = (d: string) => (i === 0 ? d <= we : d >= ws && d <= we);
      const so = sum(
        orders.filter((o) => o.status === 'APPROVED' && !o.closed && inWeek(o.requiredBy)),
        (o) => sum(o.lines.filter((l) => l.sku === recipe.product), (l) => Math.max(0, l.qty - l.delivered))
      );
      const fc = s.forecasts.find((f) => f.sku === recipe.product && f.month === ws.slice(0, 7));
      const forecast = fc ? round2((fc.qty * fc.seasonalIndex) / 4.33) : 0;
      const days = daysBetween(TODAY, ws);
      const zone = days < (params?.ptfDays ?? 0) ? 'FROZEN' : days < (params?.dtfDays ?? 0) ? 'FIRM' : 'OPEN';
      const demand = zone === 'OPEN' ? Math.max(so, forecast) : so;
      const receipts = sum(
        ops.batches.filter((b) => b.recipeId === recipe.id && ['PLANNED', 'RELEASED', 'IN_PROGRESS', 'QC'].includes(b.status) && inWeek(s.ext[b.id]?.pinDate ?? b.date)),
        (b) => Math.round(b.plannedQty * yf)
      );
      projected = projected + receipts - demand;
      let planned = 0;
      if (zone !== 'FROZEN' && projected < (params?.safetyStock ?? 0)) {
        for (const q of batchSizes((params?.safetyStock ?? 0) - projected, params)) {
          suggestions.push({ date: ws, qty: q });
          planned += q;
        }
        projected += Math.round(planned * yf);
      }
      return { start: ws, so: Math.round(so), forecast: Math.round(forecast), demand: Math.round(demand), receipts, planned, projected: Math.round(projected), zone: zone as 'FROZEN' | 'FIRM' | 'OPEN' };
    });
    return { recipe, product, params, weeks: rows, suggestions };
  });
};

export interface NetRow {
  sku: string;
  name: string;
  unit: string;
  level: 1 | 2;
  gross: number;
  onHand: number;
  onHold: number;
  reserved: number;
  onOrder: number;
  net: number;
  needBy: string;
  sources: string[];
  openPo: string[];
}

/**
 * Bill-of-materials explosion to net requirements. Level 1 is every material the open and suggested batches
 * need; blended tea (RAW-A) is exploded again to tea grades through the house blend standard. Net = gross less
 * stock on hand (excluding held stock) and open purchase orders.
 */
export const netRequirements = (s: BlendingState, ops: OperationsState, products: Product[], orders: SalesOrder[], pos: PurchaseOrder[]): NetRow[] => {
  const rows = new Map<string, NetRow>();
  const add = (sku: string, qty: number, date: string, src: string) => {
    const p = products.find((x) => x.sku === sku);
    const r = rows.get(sku) ?? { sku, name: p?.name ?? sku, unit: p?.unit ?? '', level: 1 as const, gross: 0, onHand: p?.stock ?? 0, onHold: 0, reserved: 0, onOrder: 0, net: 0, needBy: date, sources: [], openPo: [] };
    r.gross = round2(r.gross + qty);
    if (date < r.needBy) r.needBy = date;
    if (!r.sources.includes(src)) r.sources.push(src);
    rows.set(sku, r);
  };
  for (const b of ops.batches.filter((x) => x.status === 'PLANNED' || x.status === 'RELEASED')) {
    const r = ops.recipes.find((x) => x.id === b.recipeId);
    if (r) for (const n of materialNeed(r, b.plannedQty)) add(n.sku, n.qty, s.ext[b.id]?.pinDate ?? b.date, b.number);
  }
  for (const m of mps(s, ops, products, orders)) for (const sg of m.suggestions) for (const n of materialNeed(m.recipe, sg.qty)) add(n.sku, n.qty, sg.date, `MPS ${m.recipe.product}`);
  for (const r of rows.values()) {
    r.reserved = round2(sum(Object.values(s.ext), (e) => sum(e.reserved.filter((x) => x.sku === r.sku), (x) => x.qty)));
    const open = pos.filter((p) => ['APPROVED', 'SUBMITTED'].includes(p.status) && !p.closed && p.lines.some((l) => l.sku === r.sku && l.received < l.qty));
    r.onOrder = round2(sum(open, (p) => sum(p.lines.filter((l) => l.sku === r.sku), (l) => l.qty - l.received)));
    r.openPo = open.map((p) => `${p.number} (${p.expected})`);
    r.net = round2(Math.max(0, r.gross - r.onHand - r.onOrder));
  }
  // Level 2: blended tea comes from tea lots by grade
  const raw = rows.get('RAW-A');
  const blending = sum(s.blendsheets.filter((b) => ['SUBMITTED', 'APPROVED', 'IN_PROGRESS'].includes(b.status)), (b) => b.targetKg - sum(b.chops.filter((c) => c.result?.pass), (c) => c.kgIn)) / 1000;
  if (raw) {
    raw.onOrder = round2(raw.onOrder + blending);
    raw.openPo.push(...(blending ? [`Blendsheets in hand ${round2(blending * 1000).toLocaleString()} kg`] : []));
    raw.net = round2(Math.max(0, raw.gross - raw.onHand - raw.onOrder));
  }
  const house = s.standards.find((x) => x.id === 'std-house');
  const kgNeeded = (raw?.net ?? 0) * 1000;
  const out = [...rows.values()];
  for (const g of house?.grades ?? []) {
    const share = (g.minPct + g.maxPct) / 2 / sum(house!.grades, (x) => (x.minPct + x.maxPct) / 2);
    const lots = s.lots.filter((l) => l.grade === g.grade);
    const free = sum(lots, (l) => lotFree(s, l));
    const held = sum(lots.filter((l) => l.status === 'ON_HOLD'), (l) => l.kgBalance);
    const gross = round2(kgNeeded * share);
    out.push({
      sku: `TEA-${g.grade}`,
      name: `Tea ${g.grade} (for ${house!.code})`,
      unit: 'kg',
      level: 2,
      gross,
      onHand: round2(free + held),
      onHold: held,
      reserved: round2(sum(lots, (l) => lotCommitted(s, l.id))),
      onOrder: 0,
      net: round2(Math.max(0, gross - free)),
      needBy: raw?.needBy ?? TODAY,
      sources: raw ? ['RAW-A net requirement'] : [],
      openPo: []
    });
  }
  return out.sort((a, b) => a.level - b.level || b.net - a.net);
};

/**
 * Available-inventory build optimisation: scarce materials go first to the batches due soonest (then highest
 * margin); each batch is built in full, in part (rounded down to its order multiple) or not at all.
 */
export const buildPlan = (s: BlendingState, ops: OperationsState, products: Product[], orders: SalesOrder[]) => {
  const pool = new Map(products.map((p) => [p.sku, p.stock]));
  const demands = ops.batches
    .filter((b) => b.status === 'PLANNED' || b.status === 'RELEASED')
    .map((b) => {
      const r = ops.recipes.find((x) => x.id === b.recipeId)!;
      const p = products.find((x) => x.sku === r.product);
      const due = (b.forOrder && orders.find((o) => o.number === b.forOrder)?.requiredBy) || s.ext[b.id]?.pinDate || b.date;
      return { b, r, due, margin: p ? p.price - p.cost : 0 };
    })
    .sort((x, y) => (x.b.status === 'RELEASED' ? -1 : 0) - (y.b.status === 'RELEASED' ? -1 : 0) || x.due.localeCompare(y.due) || y.margin - x.margin);
  return demands.map(({ b, r, due, margin }) => {
    const need = materialNeed(r, b.plannedQty);
    const frac = Math.min(1, ...need.map((n) => (n.qty ? (pool.get(n.sku) ?? 0) / n.qty : 1)));
    const params = s.params.find((p) => p.recipeId === r.id);
    const m = Math.max(1, params?.orderMultiple ?? 1);
    const qty = frac >= 1 ? b.plannedQty : Math.floor((b.plannedQty * frac) / m) * m;
    for (const n of materialNeed(r, qty)) pool.set(n.sku, round2((pool.get(n.sku) ?? 0) - n.qty));
    const limiting = need.filter((n) => n.qty && (pool.get(n.sku) ?? 0) < 0.0001).map((n) => n.sku);
    return { batch: b, recipe: r, due, margin, buildable: qty, status: qty >= b.plannedQty ? 'FULL' : qty > 0 ? 'PARTIAL' : 'NONE', limiting };
  });
};

/* ------------------------------------------------------------------ */
/* Work in process, exposure, where-used                               */
/* ------------------------------------------------------------------ */

export const wipValue = (s: BlendingState, ops: OperationsState, products: Product[]) => {
  const batches = ops.batches.filter((b) => b.status === 'IN_PROGRESS' || b.status === 'QC').map((b) => {
    const conv = actualConversion(s.ext[b.id], s.workCenters);
    return { ref: b.number, id: b.id, kind: 'BATCH' as const, status: b.status, material: batchCost(b, products), conversion: round2(conv.labour + conv.overhead) };
  });
  const blends = s.blendsheets.filter((b) => b.status === 'IN_PROGRESS').map((b) => {
    const conv = actualConversion({ labour: b.labour } as BatchExt, s.workCenters);
    return { ref: b.number, id: b.id, kind: 'BLEND' as const, status: b.status, material: b.issuedCost ?? 0, conversion: round2(conv.labour + conv.overhead) };
  });
  const rows = [...batches, ...blends];
  return { rows, total: round2(sum(rows, (r) => r.material + r.conversion)) };
};

/** Hours each person worked on work centres with a hazardous agent, per month. */
export const exposureLog = (s: BlendingState, ops: OperationsState) => {
  const entries = [
    ...Object.values(s.ext).flatMap((e) => e.labour.map((l) => ({ ...l, ref: ops.batches.find((b) => b.id === e.batchId)?.number ?? e.batchId }))),
    ...s.blendsheets.flatMap((b) => b.labour.map((l) => ({ ...l, ref: b.number })))
  ];
  const map = new Map<string, { employee: string; month: string; hours: number; agents: Set<string>; refs: Set<string>; limit: number }>();
  for (const e of entries) {
    const wc = s.workCenters.find((w) => w.id === e.workCenterId);
    if (!wc?.hazard) continue;
    const k = `${e.employee}|${e.date.slice(0, 7)}`;
    const r = map.get(k) ?? { employee: e.employee, month: e.date.slice(0, 7), hours: 0, agents: new Set<string>(), refs: new Set<string>(), limit: wc.hazard.monthlyLimitHrs };
    r.hours = round2(r.hours + e.hours);
    r.agents.add(wc.hazard.agent);
    r.refs.add(e.ref);
    r.limit = Math.min(r.limit, wc.hazard.monthlyLimitHrs);
    map.set(k, r);
  }
  return [...map.values()].map((r) => ({ ...r, agents: [...r.agents], refs: [...r.refs], over: r.hours > r.limit })).sort((a, b) => b.month.localeCompare(a.month) || b.hours - a.hours);
};

export const whereUsed = (s: BlendingState, sched: SchedJob[], wcId: string) => ({
  routings: s.routings.flatMap((r) => r.ops.filter((o) => o.workCenterId === wcId).map((o) => ({ routing: r, op: o }))),
  jobs: sched.filter((j) => j.sops.some((o) => o.wcId === wcId)),
  blendsheets: s.blendsheets.filter((b) => b.workCenterId === wcId && !['COMPLETED', 'CANCELLED'].includes(b.status))
});

/** Kg of a completed blend already issued to packing batches, and what is left. */
export const blendBalance = (s: BlendingState, ops: OperationsState, b: Blendsheet) => {
  const made = b.outturn?.outputKg ?? 0;
  const linked = ops.batches.filter((x) => s.ext[x.id]?.blendsheetId === b.id);
  const issued = round2(sum(linked, (x) => sum(x.issued.filter((i) => i.sku === 'RAW-A'), (i) => i.qty * 1000)));
  const planned = round2(sum(linked.filter((x) => !x.issued.length && !['CANCELLED'].includes(x.status)), (x) => {
    const r = ops.recipes.find((y) => y.id === x.recipeId);
    return r ? sum(materialNeed(r, x.plannedQty).filter((n) => n.sku === 'RAW-A'), (n) => n.qty * 1000) : 0;
  }));
  return { made, issued, planned, balance: round2(made - issued), linked };
};

export const firmLabel: Record<FirmLevel, string> = { PLANNED: 'Planned', FIRM: 'Firm', RELEASED: 'Released' };
