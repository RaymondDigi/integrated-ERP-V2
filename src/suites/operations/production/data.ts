import { addDays, TODAY } from '../../finance/engine';
import type { HistoryEntry } from '../../finance/types';
import type { CommercialState } from '../../commercial/types';
import type { Batch, Recipe } from '../types';
import { OPS_ACTORS } from '../data';
import { materialNeed } from '../engine';
import type { BatchExt, Blendsheet, BlendingState, BlendPlan, BlendStandard, CalendarException, Chop, Forecast, LabourEntry, PlanParams, ProdOrder, Routing, RoutingOp, Scenario, SubcontractOrder, TeaLot, WorkCenter } from './types';

const { OFFICER: mary, STOREKEEPER: john, QC: faith, MANAGER: esther } = OPS_ACTORS;
const d = (o: number) => addDays(TODAY, o);
const at = (date: string, h: number) => `${date}T${String(h).padStart(2, '0')}:15:00`;
const year = TODAY.slice(0, 4);
const num = (p: string, n: number) => `${p}-${year}-${String(n).padStart(4, '0')}`;
const h = (date: string, hour: number, by: string, action: string, note?: string): HistoryEntry => ({ at: at(date, hour), by, action, note });

/** Factory floor staff who book hours to batches and blends. */
export const CREW = ['Peter Njoroge', 'Grace Chebet', 'Samuel Mutua', 'Lucy Wanjiru', 'Hassan Ali', 'Ann Atieno', 'Joseph Kirui', 'Mercy Nyambura'];

export const GRADE_ORDER = ['BP1', 'PF1', 'PD', 'D1', 'FNGS1', 'BMF'];

export const WORK_CENTERS: WorkCenter[] = [
  {
    id: 'WC-TWR', name: 'Blending tower', kind: 'TOWER', machines: 1, crew: 4, tooling: 1, hoursPerDay: 16, days: [1, 2, 3, 4, 5, 6],
    labourDirectRate: 420, labourIndirectRate: 150, machineRate: 2_800, burden: { basis: 'PER_HOUR', amount: 1_900 }, setupCost: 6_500,
    sequence: ['std-org', 'std-house', 'std-horizon'], kgPerHour: 1_000, chopKg: 1_500,
    hazard: { agent: 'Respirable tea dust', ppe: 'FFP2 mask, ear defenders', monthlyLimitHrs: 120 }
  },
  {
    id: 'WC-DRM', name: 'Drum blenders', kind: 'DRUM', machines: 2, crew: 4, tooling: 2, hoursPerDay: 8, days: [1, 2, 3, 4, 5],
    labourDirectRate: 400, labourIndirectRate: 140, machineRate: 1_400, burden: { basis: 'PER_HOUR', amount: 1_100 }, setupCost: 3_500,
    sequence: ['std-org', 'std-house'], kgPerHour: 450, chopKg: 750,
    hazard: { agent: 'Respirable tea dust', ppe: 'FFP2 mask', monthlyLimitHrs: 140 }
  },
  {
    id: 'WC-SRT', name: 'Sorting & fibre extraction', kind: 'SORTING', machines: 1, crew: 3, tooling: 1, hoursPerDay: 8, days: [1, 2, 3, 4, 5, 6],
    labourDirectRate: 380, labourIndirectRate: 120, machineRate: 900, burden: { basis: 'PCT_MATERIAL', amount: 1.5 }, setupCost: 1_200,
    sequence: [], hazard: { agent: 'Tea fibre and dust', ppe: 'FFP2 mask, goggles', monthlyLimitHrs: 160 }
  },
  {
    id: 'WC-PK1', name: 'Packing line 1 — Standard', kind: 'PACKING', machines: 1, crew: 5, tooling: 1, hoursPerDay: 8, days: [1, 2, 3, 4, 5],
    labourDirectRate: 360, labourIndirectRate: 110, machineRate: 1_600, burden: { basis: 'PER_UNIT', amount: 45 }, setupCost: 4_000, sequence: ['rc1', 'rc3']
  },
  {
    id: 'WC-PK2', name: 'Packing line 2 — Premium', kind: 'PACKING', machines: 1, crew: 4, tooling: 1, hoursPerDay: 8, days: [1, 2, 3, 4, 5],
    labourDirectRate: 380, labourIndirectRate: 120, machineRate: 1_800, burden: { basis: 'PCT_LABOUR', amount: 60 }, setupCost: 4_500, sequence: ['rc4', 'rc2']
  },
  {
    id: 'WC-BAG', name: 'Bulk bagging', kind: 'PACKING', machines: 1, crew: 3, tooling: 1, hoursPerDay: 8, days: [1, 2, 3, 4, 5, 6],
    labourDirectRate: 340, labourIndirectRate: 100, machineRate: 700, burden: { basis: 'PER_HOUR', amount: 600 }, setupCost: 1_500, sequence: ['rc3']
  },
  {
    id: 'WC-PKH', name: 'Packing hall (gift)', kind: 'PACKING', machines: 2, crew: 6, tooling: 2, hoursPerDay: 8, days: [1, 2, 3, 4, 5],
    labourDirectRate: 340, labourIndirectRate: 100, machineRate: 300, burden: { basis: 'PER_UNIT', amount: 30 }, setupCost: 1_000, sequence: ['rc5']
  },
  {
    id: 'WC-LAB', name: 'Tasting room & QC lab', kind: 'LAB', machines: 2, crew: 2, tooling: 2, hoursPerDay: 9, days: [1, 2, 3, 4, 5, 6],
    labourDirectRate: 650, labourIndirectRate: 200, machineRate: 250, burden: { basis: 'PER_HOUR', amount: 400 }, setupCost: 0, sequence: []
  }
];

/** Packing line of each recipe's existing "line" name. */
export const LINE_WC: Record<string, string> = {
  'Line 1 — Standard': 'WC-PK1',
  'Line 2 — Premium': 'WC-PK2',
  'Bulk bagging': 'WC-BAG',
  'Packing hall': 'WC-PKH'
};

export const STANDARDS: BlendStandard[] = [
  {
    id: 'std-house',
    code: 'HB-01',
    name: 'House breakfast blend (CTC)',
    outputSku: 'RAW-A',
    grades: [
      { grade: 'BP1', minPct: 30, maxPct: 45 },
      { grade: 'PF1', minPct: 35, maxPct: 55 },
      { grade: 'PD', minPct: 5, maxPct: 20 },
      { grade: 'D1', minPct: 0, maxPct: 10 }
    ],
    moistureMax: 6.5,
    tastingMin: 7,
    expectedOutturnPct: 98.4,
    byProducts: [
      { kind: 'SWEEPINGS', pct: 0.4, valuePerKg: 60 },
      { kind: 'DUST', pct: 0.7, valuePerKg: 95 },
      { kind: 'FIBRE', pct: 0.3, valuePerKg: 20 }
    ]
  },
  {
    id: 'std-horizon',
    code: 'HZ-GOLD',
    name: 'Horizon Gold export blend',
    customerId: 'c8',
    outputSku: 'RAW-A',
    grades: [
      { grade: 'BP1', minPct: 40, maxPct: 60 },
      { grade: 'PF1', minPct: 30, maxPct: 50 },
      { grade: 'PD', minPct: 0, maxPct: 10 }
    ],
    moistureMax: 6,
    tastingMin: 7.5,
    expectedOutturnPct: 98.6,
    byProducts: [
      { kind: 'SWEEPINGS', pct: 0.3, valuePerKg: 60 },
      { kind: 'DUST', pct: 0.6, valuePerKg: 95 },
      { kind: 'FIBRE', pct: 0.3, valuePerKg: 20 }
    ]
  },
  {
    id: 'std-org',
    code: 'HA-ORG',
    name: 'Highland organic blend',
    customerId: 'c6',
    outputSku: 'RAW-A',
    grades: [
      { grade: 'PF1', minPct: 50, maxPct: 70 },
      { grade: 'BP1', minPct: 30, maxPct: 50 }
    ],
    moistureMax: 6,
    tastingMin: 7.2,
    expectedOutturnPct: 98.2,
    byProducts: [
      { kind: 'SWEEPINGS', pct: 0.5, valuePerKg: 60 },
      { kind: 'DUST', pct: 0.8, valuePerKg: 95 },
      { kind: 'FIBRE', pct: 0.5, valuePerKg: 20 }
    ]
  }
];

const lot = (id: string, invoiceNo: string, garden: string, grade: string, saleNo: string, kgs: number, kgBalance: number, wh: string, bay: string, costPerKg: number, moisturePct: number, tastingScore: number, arrived: number, extra: Partial<TeaLot> = {}): TeaLot => ({
  id, invoiceNo, garden, grade, saleNo, kgs, kgBalance, packages: Math.round(kgs / 65), warehouseId: wh, bay, costPerKg, moisturePct, tastingScore,
  status: kgBalance <= 0 ? 'DEPLETED' : 'AVAILABLE', arrived: d(arrived), ...extra
});

export const LOTS: TeaLot[] = [
  lot('lt1', 'KGT-1142', 'Kangaita', 'BP1', `36/${year}`, 1_950, 650, 'WH-FAC', 'Bay A-01', 412, 5.4, 8.2, -30),
  lot('lt2', 'GTG-0877', 'Gitugi', 'PF1', `36/${year}`, 2_340, 1_140, 'WH-FAC', 'Bay A-02', 398, 5.6, 8.0, -30),
  lot('lt3', 'MCH-2210', 'Michimikuru', 'PD', `37/${year}`, 1_040, 560, 'WH-FAC', 'Bay A-04', 352, 5.9, 7.4, -23),
  lot('lt4', 'KPC-3315', 'Kapchorua', 'BP1', `37/${year}`, 2_600, 1_100, 'WH-FAC', 'Bay B-01', 365, 5.8, 7.6, -23),
  lot('lt5', 'KPK-0451', 'Kipkebe', 'PF1', `37/${year}`, 2_860, 2_860, 'WH-FAC', 'Bay B-02', 341, 6.1, 7.3, -23),
  lot('lt6', 'CHM-1180', 'Chemomi (Nandi Hills)', 'PF1', `38/${year}`, 3_120, 1_920, 'WH-MSA', 'Shimanzi W3 · Row 12', 356, 5.7, 7.7, -16),
  lot('lt7', 'NGR-0932', 'Ngere', 'BP1', `38/${year}`, 1_820, 1_820, 'WH-MSA', 'Shimanzi W3 · Row 14', 448, 5.2, 8.6, -16),
  lot('lt8', 'THT-0620', 'Kiambu Theta', 'D1', `38/${year}`, 780, 780, 'WH-FAC', 'Bay C-03', 296, 6.4, 6.8, -16),
  lot('lt9', 'IRA-1408', 'Iriaini', 'PF1', `39/${year}`, 2_080, 2_080, 'WH-FAC', 'Bay B-05', 436, 5.3, 8.4, -9),
  lot('lt10', 'MTR-0719', 'Mataara', 'BP1', `39/${year}`, 1_690, 1_690, 'WH-FAC', 'Bay B-06', 421, 5.5, 8.1, -9),
  lot('lt11', 'KGT-1190', 'Kangaita', 'PD', `39/${year}`, 975, 675, 'WH-FAC', 'Bay A-05', 362, 5.8, 7.5, -9),
  lot('lt12', 'KPK-0477', 'Kipkebe', 'PF1', `39/${year}`, 1_430, 1_430, 'WH-FAC', 'Bay C-01', 338, 7.4, 6.6, -9, { status: 'ON_HOLD', holdReason: 'Moisture 7.4% above the 6.5% intake limit — re-drying requested' }),
  lot('lt13', 'GTG-0901', 'Gitugi', 'BP1', 'Direct', 1_300, 1_300, 'WH-FAC', 'Bay C-02', 405, 5.5, 8.0, -4),
  lot('lt14', 'CHM-1203', 'Chemomi (Nandi Hills)', 'FNGS1', `39/${year}`, 640, 640, 'WH-FAC', 'Bay C-04', 248, 6.0, 6.5, -9)
];

/** Planning parameters per recipe (rc1–rc5 come from the operations seed). */
export const PARAMS: PlanParams[] = [
  { recipeId: 'rc1', minBatch: 100, maxBatch: 400, orderMultiple: 20, dtfDays: 7, ptfDays: 3, safetyStock: 300, expectedYieldPct: 99.5, mto: false },
  { recipeId: 'rc2', minBatch: 50, maxBatch: 200, orderMultiple: 10, dtfDays: 7, ptfDays: 3, safetyStock: 150, expectedYieldPct: 98.5, mto: false },
  { recipeId: 'rc3', minBatch: 40, maxBatch: 160, orderMultiple: 20, dtfDays: 5, ptfDays: 2, safetyStock: 150, expectedYieldPct: 99, mto: false },
  { recipeId: 'rc4', minBatch: 30, maxBatch: 120, orderMultiple: 10, dtfDays: 10, ptfDays: 4, safetyStock: 40, expectedYieldPct: 98, mto: true },
  { recipeId: 'rc5', minBatch: 50, maxBatch: 200, orderMultiple: 25, dtfDays: 7, ptfDays: 3, safetyStock: 100, expectedYieldPct: 99, mto: false }
];

const op = (seq: number, name: string, kind: RoutingOp['kind'], workCenterId: string, setupHrs: number, runBasis: RoutingOp['runBasis'], runValue: number, workers: number, scrapPct: number, instructions: string[], extra: Partial<RoutingOp> = {}): RoutingOp => ({
  seq, name, kind, workCenterId, setupHrs, runBasis, runValue, workers, scrapPct, overlapPct: 0, instructions, ...extra
});

const inspect = (spec: RoutingOp['spec']) => op(90, 'Final inspection & tasting', 'INSPECTION', 'WC-LAB', 0, 'HOURS', 1, 1, 0, ['Draw 3 packs per 50 cartons', 'Record moisture on the moisture balance', 'Check-weigh 10 packs'], { spec });

export const ROUTINGS: Routing[] = [
  {
    id: 'rt1', recipeId: 'rc1', code: 'RT-STD24', revision: 'B', version: 3, effectiveFrom: d(-60), status: 'ACTIVE', ops: [
      op(10, 'Sift & extract fibre', 'PROCESS', 'WC-SRT', 0.5, 'HOURS', 1.5, 2, 0.3, ['Run through the fibre extractor at 40 Hz', 'Bag fibre separately']),
      op(20, 'Fill, seal & case', 'PACKING', 'WC-PK1', 0.5, 'UNITS_PER_HOUR', 50, 4, 0.5, ['Set check-weigher to 500 g ± 2%', 'Code cartons with batch and best-before'], { overlapPct: 50 }),
      inspect([{ parameter: 'Moisture', max: 6, unit: '%' }, { parameter: 'Pack weight', min: 490, max: 510, unit: 'g' }])
    ],
    byProducts: [{ name: 'Fibre & stalk', pctOfInput: 0.3, valuePerUnit: 20 }], coProducts: [], changeNote: 'Faster filler head from rev B', history: [h(d(-60), 9, esther.name, 'Revision B activated', 'New filler head')]
  },
  {
    id: 'rt1a', recipeId: 'rc1', code: 'RT-STD24', revision: 'A', version: 2, effectiveFrom: d(-200), status: 'OBSOLETE', ops: [
      op(10, 'Sift & extract fibre', 'PROCESS', 'WC-SRT', 0.5, 'HOURS', 1.5, 2, 0.3, ['Run through the fibre extractor']),
      op(20, 'Fill, seal & case', 'PACKING', 'WC-PK1', 0.5, 'UNITS_PER_HOUR', 40, 5, 0.8, ['Set check-weigher to 500 g ± 2%']),
      inspect([{ parameter: 'Moisture', max: 6, unit: '%' }])
    ],
    byProducts: [], coProducts: [], changeNote: 'Original routing', history: [h(d(-200), 9, esther.name, 'Activated'), h(d(-60), 9, esther.name, 'Made obsolete by revision B')]
  },
  {
    id: 'rt2', recipeId: 'rc2', code: 'RT-PRM12', revision: 'A', version: 1, effectiveFrom: d(-120), status: 'ACTIVE', ops: [
      op(10, 'Sift & extract fibre', 'PROCESS', 'WC-SRT', 0.5, 'HOURS', 1, 2, 0.3, ['Run through the fibre extractor at 35 Hz']),
      op(20, 'Fill premium cartons', 'PACKING', 'WC-PK2', 0.5, 'UNITS_PER_HOUR', 30, 3, 0.8, ['Check-weigh 250 g ± 1%', 'Nitrogen flush']),
      inspect([{ parameter: 'Moisture', max: 5, unit: '%' }, { parameter: 'Pack weight', min: 247.5, max: 252.5, unit: 'g' }])
    ],
    byProducts: [{ name: 'Fibre & stalk', pctOfInput: 0.3, valuePerUnit: 20 }], coProducts: [], changeNote: '', history: [h(d(-120), 9, esther.name, 'Activated')]
  },
  {
    id: 'rt3', recipeId: 'rc3', code: 'RT-BLK25', revision: 'A', version: 1, effectiveFrom: d(-120), status: 'ACTIVE', ops: [
      op(20, 'Fill & stitch 25 kg sacks', 'PACKING', 'WC-BAG', 0.3, 'UNITS_PER_HOUR', 25, 2, 0.2, ['Weigh each sack 25 kg ± 0.5%', 'Stitch and label']),
      inspect([{ parameter: 'Moisture', max: 7, unit: '%' }, { parameter: 'Sack weight', min: 24.875, max: 25.125, unit: 'kg' }])
    ],
    byProducts: [{ name: 'Sweepings', pctOfInput: 0.2, valuePerUnit: 60 }], coProducts: [], changeNote: '', history: [h(d(-120), 9, esther.name, 'Activated')]
  },
  {
    id: 'rt4', recipeId: 'rc4', code: 'RT-ORG12', revision: 'A', version: 1, effectiveFrom: d(-90), status: 'ACTIVE', ops: [
      op(20, 'Fill organic cartons', 'PACKING', 'WC-PK2', 0.5, 'UNITS_PER_HOUR', 20, 3, 1, ['Organic lot only — line cleared and logged']),
      inspect([{ parameter: 'Moisture', max: 5, unit: '%' }, { parameter: 'Pack weight', min: 247.5, max: 252.5, unit: 'g' }])
    ],
    byProducts: [], coProducts: [], changeNote: '', history: [h(d(-90), 9, esther.name, 'Activated')]
  },
  {
    id: 'rt4c', recipeId: 'rc4', code: 'RT-ORG12-HA', revision: 'A', version: 1, effectiveFrom: d(-40), status: 'ACTIVE', forCustomerId: 'c6', ops: [
      op(10, 'Organic clean-down & segregation', 'PROCESS', 'WC-PK2', 1.5, 'HOURS', 0.5, 2, 0, ['Full wet clean of hoppers', 'Organic certifier witness sign-off']),
      op(20, 'Fill organic cartons', 'PACKING', 'WC-PK2', 0.5, 'UNITS_PER_HOUR', 20, 3, 1, ['Highland Agro private label', 'Organic lot only']),
      inspect([{ parameter: 'Moisture', max: 5, unit: '%' }, { parameter: 'Pack weight', min: 247.5, max: 252.5, unit: 'g' }])
    ],
    byProducts: [], coProducts: [], changeNote: 'Customer routing for Highland Agro organic orders', history: [h(d(-40), 9, esther.name, 'Activated')]
  },
  {
    id: 'rt5', recipeId: 'rc5', code: 'RT-GFT06', revision: 'A', version: 1, effectiveFrom: d(-90), status: 'ACTIVE', ops: [
      op(10, 'Print & emboss gift sleeves', 'SUBCONTRACT', 'WC-PKH', 0, 'HOURS', 0, 0, 1, ['Send flat sleeves and artwork to Pwani Packaging', 'Return within 3 days'], { supplierId: 's10', costPerUnit: 120 }),
      op(20, 'Assemble gift box', 'PACKING', 'WC-PKH', 0.5, 'UNITS_PER_HOUR', 25, 3, 0.5, ['Six assorted tins per box', 'Shrink-wrap'], { overlapPct: 30 }),
      inspect(undefined)
    ],
    byProducts: [], coProducts: [{ name: 'Sample sachets (offcuts)', sku: 'SMP-50', pctOfOutput: 2 }], changeNote: '', history: [h(d(-90), 9, esther.name, 'Activated')]
  }
];

const yr = Number(year);
export const CALENDAR: CalendarException[] = [
  { id: 'ce1', date: `${yr}-10-20`, hours: 0, reason: 'Mashujaa Day (public holiday)' },
  { id: 'ce2', date: `${yr}-12-12`, hours: 0, reason: 'Jamhuri Day (public holiday)' },
  { id: 'ce3', date: `${yr}-12-25`, hours: 0, reason: 'Christmas Day' },
  { id: 'ce4', date: `${yr}-12-26`, hours: 0, reason: 'Boxing Day' },
  { id: 'ce5', date: d(5), workCenterId: 'WC-TWR', hours: 8, reason: 'Tower bearing service — one shift only' }
];

const months = Array.from({ length: 6 }, (_, i) => {
  const dt = new Date(TODAY + 'T00:00:00');
  dt.setDate(1);
  dt.setMonth(dt.getMonth() + i);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
});
const season = (m: string, sku: string) => {
  const mm = Number(m.slice(5));
  if (sku === 'GFT-06') return mm === 12 ? 1.8 : mm === 11 ? 1.4 : 0.8;
  return mm === 12 || mm === 1 ? 1.15 : mm >= 6 && mm <= 8 ? 0.9 : 1;
};
const BASE: Record<string, number> = { 'STD-24': 900, 'PRM-12': 320, 'BLK-25': 260, 'ORG-12': 120, 'GFT-06': 180 };
export const FORECASTS: Forecast[] = months.flatMap((m) => Object.entries(BASE).map(([sku, qty]) => ({ sku, month: m, qty, seasonalIndex: season(m, sku) })));

/* ------------------------------------------------------------------ */

const labour = (id: string, employee: string, hours: number, wc: string, date: string): LabourEntry => ({ id, employee, hours, workCenterId: wc, date, by: mary.name });

const chop = (id: string, seq: number, kgIn: number, date: string, moisture: number, score: number, pass: boolean, reasons: string[] = []): Chop => ({
  id, seq, kgIn, kgOut: pass ? Math.round(kgIn * 0.985) : undefined, startedAt: at(date, 7 + seq * 2), by: mary.name,
  sample: { ref: `SMP-${id.toUpperCase()}`, drawnBy: faith.name, drawnAt: at(date, 8 + seq * 2) },
  result: { moisturePct: moisture, tastingScore: score, liquor: pass ? 'Bright, brisk' : 'Flat', infusion: 'Coppery', appearance: 'Black, even', pass, reasons, by: faith.name, at: at(date, 9 + seq * 2) }
});

export const buildBlendingSeed = (com: CommercialState, batches: Batch[], recipes: Recipe[]): BlendingState => {
  const order = (customerId: string, sku: string) => com.orders.find((o) => o.customerId === customerId && o.status === 'APPROVED' && !o.closed && o.lines.some((l) => l.sku === sku));
  const o7 = order('c7', 'STD-24');
  const o6 = order('c6', 'ORG-12');

  const blendsheets: Blendsheet[] = [
    {
      id: 'bs1', number: num('BS', 1), standardId: 'std-house', plant: 'TOWER', workCenterId: 'WC-TWR', targetKg: 2_400, date: d(-20), due: d(-19),
      lines: [{ lotId: 'lt1', kg: 900 }, { lotId: 'lt2', kg: 1_000 }, { lotId: 'lt3', kg: 380 }, { lotId: 'lt8', kg: 120 }],
      status: 'COMPLETED', preparedBy: mary.name, approvals: [{ by: faith.name, role: 'QC', at: at(d(-22), 11) }],
      history: [h(d(-23), 9, mary.name, 'Blendsheet prepared'), h(d(-23), 10, mary.name, 'Submitted for approval'), h(d(-22), 11, faith.name, 'Approved'), h(d(-20), 7, john.name, 'Teas issued to the tower'), h(d(-20), 16, mary.name, 'Out-turn recorded — 2,362 kg')],
      chops: [chop('c1a', 1, 1_200, d(-20), 5.6, 7.9, true), chop('c1b', 2, 1_200, d(-20), 5.8, 7.6, true)],
      issuedAt: at(d(-20), 7), issuedCost: 900 * 412 + 1_000 * 398 + 380 * 352 + 120 * 296,
      outturn: { inputKg: 2_400, outputKg: 2_362, byProducts: [{ kind: 'SWEEPINGS', kg: 9 }, { kind: 'DUST', kg: 17 }, { kind: 'FIBRE', kg: 7 }], lossKg: 5, at: at(d(-20), 16), by: mary.name },
      journalIds: [], labour: [labour('lb-b1', 'Peter Njoroge', 7.5, 'WC-TWR', d(-20)), labour('lb-b2', 'Hassan Ali', 7.5, 'WC-TWR', d(-20)), labour('lb-b3', 'Ann Atieno', 4, 'WC-TWR', d(-20))]
    },
    {
      id: 'bs2', number: num('BS', 2), customerId: 'c8', standardId: 'std-horizon', plant: 'TOWER', workCenterId: 'WC-TWR', targetKg: 3_000, date: d(-1), due: d(2),
      lines: [{ lotId: 'lt4', kg: 1_500 }, { lotId: 'lt6', kg: 1_200 }, { lotId: 'lt11', kg: 300 }],
      status: 'IN_PROGRESS', preparedBy: mary.name, approvals: [{ by: esther.name, role: 'MANAGER', at: at(d(-3), 15) }],
      history: [h(d(-4), 9, mary.name, 'Blendsheet prepared'), h(d(-4), 10, mary.name, 'Submitted for approval'), h(d(-3), 15, esther.name, 'Approved'), h(d(-1), 7, john.name, 'Teas issued to the tower')],
      chops: [chop('c2a', 1, 1_500, d(-1), 5.7, 7.8, true), chop('c2b', 2, 1_500, d(0), 6.4, 7.6, false, ['Moisture 6.4% above the 6% limit'])],
      issuedAt: at(d(-1), 7), issuedCost: 1_500 * 365 + 1_200 * 356 + 300 * 362, journalIds: [],
      labour: [labour('lb-b4', 'Peter Njoroge', 8, 'WC-TWR', d(-1)), labour('lb-b5', 'Hassan Ali', 8, 'WC-TWR', d(-1))]
    },
    {
      id: 'bs3', number: num('BS', 3), orderId: o7?.id, orderNumber: o7?.number, customerId: o7 ? 'c7' : undefined, standardId: 'std-house', plant: 'TOWER', workCenterId: 'WC-TWR', targetKg: 2_000, date: d(2), due: d(4),
      lines: [{ lotId: 'lt10', kg: 760 }, { lotId: 'lt9', kg: 900 }, { lotId: 'lt3', kg: 240 }, { lotId: 'lt8', kg: 100 }],
      status: 'APPROVED', preparedBy: mary.name, approvals: [{ by: faith.name, role: 'QC', at: at(d(-1), 14) }],
      history: [h(d(-2), 9, mary.name, 'Created from sales order', o7?.number), h(d(-2), 11, mary.name, 'Submitted for approval'), h(d(-1), 14, faith.name, 'Approved')],
      chops: [], journalIds: [], labour: [], planId: 'bp1'
    },
    {
      id: 'bs4', number: num('BS', 4), orderId: o6?.id, orderNumber: o6?.number, customerId: 'c6', standardId: 'std-org', plant: 'DRUM', workCenterId: 'WC-DRM', targetKg: 1_200, date: d(4), due: d(6),
      lines: [{ lotId: 'lt9', kg: 720 }, { lotId: 'lt13', kg: 480 }],
      status: 'SUBMITTED', preparedBy: mary.name, approvals: [],
      history: [h(d(-1), 9, mary.name, 'Created from sales order', o6?.number), h(d(-1), 10, mary.name, 'Submitted for approval')],
      chops: [], journalIds: [], labour: [], planId: 'bp1'
    },
    {
      id: 'bs5', number: num('BS', 5), standardId: 'std-house', plant: 'DRUM', workCenterId: 'WC-DRM', targetKg: 1_500, date: d(6), due: d(8),
      lines: [{ lotId: 'lt7', kg: 600 }, { lotId: 'lt5', kg: 700 }],
      status: 'DRAFT', preparedBy: mary.name, approvals: [], history: [h(d(0), 9, mary.name, 'Blendsheet prepared')], chops: [], journalIds: [], labour: []
    }
  ];

  const plans: BlendPlan[] = [
    {
      id: 'bp1', number: num('BPL', 1), period: TODAY.slice(0, 7), blendsheetIds: ['bs3', 'bs4'], status: 'SUBMITTED', preparedBy: mary.name, approvals: [],
      notes: 'Tower for the Metro balance; drums for the Highland organic order.', history: [h(d(-1), 11, mary.name, 'Plan prepared'), h(d(-1), 12, mary.name, 'Submitted for approval')]
    }
  ];

  /* Extensions for the operations batches bt1…bt10 */
  const ext: Record<string, BatchExt> = {};
  const routingOf: Record<string, string> = { rc1: 'rt1', rc2: 'rt2', rc3: 'rt3', rc4: 'rt4', rc5: 'rt5' };
  let ln = 0;
  for (const b of batches) {
    const r = recipes.find((x) => x.id === b.recipeId)!;
    const wc = LINE_WC[r.line] ?? 'WC-PK1';
    const started = ['IN_PROGRESS', 'QC', 'COMPLETED', 'REJECTED'].includes(b.status);
    const hrs = Math.round(((r.hours * b.plannedQty) / r.batchSize) * 10) / 10;
    const lab: LabourEntry[] = started
      ? [
          labour(`lb${++ln}`, CREW[ln % CREW.length], b.status === 'IN_PROGRESS' ? 3 : Math.round(hrs * 1.1 * 10) / 10, wc, b.date),
          labour(`lb${++ln}`, CREW[ln % CREW.length], b.status === 'IN_PROGRESS' ? 3 : Math.round(hrs * 0.95 * 10) / 10, wc, b.date),
          ...(r.id === 'rc1' || r.id === 'rc2' ? [labour(`lb${++ln}`, CREW[ln % CREW.length], 1.5, 'WC-SRT', b.date)] : [])
        ]
      : [];
    ext[b.id] = {
      batchId: b.id,
      routingId: routingOf[b.recipeId],
      labour: lab,
      stops: b.status === 'COMPLETED' && b.recipeId === 'rc2' ? [{ from: at(b.date, 10), to: at(b.date, 11), reason: 'Film splice' }] : [],
      startedAt: started ? at(b.date, 8) : undefined,
      finishedAt: ['QC', 'COMPLETED'].includes(b.status) ? at(b.date, 8 + Math.ceil(hrs)) : undefined,
      reserved: b.status === 'RELEASED' ? materialNeed(r, b.plannedQty) : [],
      journalIds: [],
      subcontractIds: [],
      blendsheetId: b.status === 'COMPLETED' && b.recipeId === 'rc1' && b.date === d(-12) ? 'bs1' : undefined,
      history: []
    };
  }

  const gift = batches.find((b) => b.recipeId === 'rc5' && b.status === 'COMPLETED');
  const subcontracts: SubcontractOrder[] = gift
    ? [{ id: 'sc1', number: num('SCO', 1), batchId: gift.id, batchNumber: gift.number, opName: 'Print & emboss gift sleeves', supplierId: 's10', qty: gift.plannedQty, cost: gift.plannedQty * 120, dispatchNote: num('DN', 1), status: 'RETURNED', at: at(addDays(gift.date, -3), 10) }]
    : [];
  if (gift) ext[gift.id].subcontractIds = ['sc1'];

  const planned = batches.filter((b) => b.status === 'PLANNED');
  const prodOrders: ProdOrder[] = planned.length >= 2 ? [{ id: 'po1', number: num('PWO', 1), date: d(-1), lines: planned.map((b) => ({ recipeId: b.recipeId, qty: b.plannedQty, batchId: b.id })), createdBy: mary.name, notes: 'Premium and gift run for the festive season' }] : [];
  for (const p of prodOrders) for (const l of p.lines) ext[l.batchId].workOrderId = p.id;

  const scenarios: Scenario[] = [
    {
      id: 'sn1', name: 'Saturday shift on the drums', by: esther.name, at: at(d(-2), 16),
      workCenters: WORK_CENTERS.map((w) => (w.id === 'WC-DRM' ? { ...w, days: [1, 2, 3, 4, 5, 6] } : { ...w })),
      calendar: [...CALENDAR], moves: []
    }
  ];

  return {
    lots: LOTS.map((l) => ({ ...l })),
    standards: STANDARDS,
    blendsheets,
    plans,
    workCenters: WORK_CENTERS.map((w) => ({ ...w })),
    calendar: [...CALENDAR],
    routings: ROUTINGS,
    params: PARAMS.map((p) => ({ ...p })),
    standardCosts: [],
    ext,
    prodOrders,
    subcontracts,
    rates: [],
    forecasts: FORECASTS,
    scenarios,
    moves: [
      { id: 'pm1', date: d(-20), item: 'Tea lots (4)', qty: -2_400, unit: 'kg', kind: 'LOT_ISSUE', ref: num('BS', 1), by: john.name },
      { id: 'pm2', date: d(-20), item: 'House breakfast blend (CTC)', qty: 2_362, unit: 'kg', kind: 'BLEND_OUTPUT', ref: num('BS', 1), by: mary.name },
      { id: 'pm3', date: d(-20), item: 'Dust', qty: 17, unit: 'kg', kind: 'BY_PRODUCT', ref: num('BS', 1), by: mary.name },
      { id: 'pm4', date: d(-1), item: 'Tea lots (3)', qty: -3_000, unit: 'kg', kind: 'LOT_ISSUE', ref: num('BS', 2), by: john.name }
    ],
    seenOrders: com.orders.map((o) => o.id),
    sequence: { BS: 5, BPL: 1, PWO: prodOrders.length, SCO: subcontracts.length, DN: subcontracts.length, RTE: 0, SN: 1 }
  };
};
