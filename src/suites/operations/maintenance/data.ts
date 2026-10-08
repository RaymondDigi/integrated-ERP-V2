import { addDays, TODAY } from '../../finance/engine';
import { OPS_ACTORS } from '../data';
import type { HistoryEntry } from '../../finance/types';
import type { ConditionReading, EnergyReading, MaintenanceExtState, MeterReading, ProjectCost, ProjectsState, Timesheet } from './types';

const d = (o: number) => addDays(TODAY, o);
const at = (date: string, h: number) => `${date}T${String(h).padStart(2, '0')}:10:00`;
const h = (date: string, hour: number, by: string, action: string, note?: string): HistoryEntry => ({ at: at(date, hour), by, action, note });
const year = TODAY.slice(0, 4);
const num = (p: string, n: number) => `${p}-${year}-${String(n).padStart(4, '0')}`;
const { OFFICER: mary, TECHNICIAN: kevin, MANAGER: esther } = OPS_ACTORS;

export const COST_CENTRES = ['Factory', 'Production', 'Warehouse', 'Transport', 'Logistics', 'Sales', 'Administration'];

export const buildMaintenanceSeed = (): MaintenanceExtState => {
  // Running hours and counters read by the technicians each week
  const meterReadings: MeterReading[] = [];
  let mr = 0;
  const series = (equipmentId: string, end: number, perWeek: number) => {
    for (let w = 6; w >= 0; w--) meterReadings.push({ id: `mr${++mr}`, equipmentId, date: d(-w * 7 - 1), value: end - w * perWeek, by: kevin.name, source: 'MANUAL' });
  };
  series('eq1', 4_820, 38);
  series('eq4', 31_250, 120);
  series('eq6', 6_910, 32);
  series('eq13', 9_410, 64);

  // Condition monitoring: drum gearbox vibration is climbing toward its alarm limit
  const conditions: ConditionReading[] = [];
  let cr = 0;
  const cond = (equipmentId: string, parameter: string, unit: string, values: number[], warn: number, alarm: number) =>
    values.forEach((v, i) => conditions.push({ id: `cr${++cr}`, equipmentId, parameter, unit, value: v, limitWarn: warn, limitAlarm: alarm, date: d(-(values.length - 1 - i) * 7), by: kevin.name }));
  cond('eq13', 'Gearbox vibration', 'mm/s', [2.1, 2.3, 2.6, 3.0, 3.4, 3.9], 4.5, 7.1);
  cond('eq4', 'Flue gas temperature', '°C', [212, 214, 211, 215, 213], 240, 260);
  cond('eq1', 'Coolant temperature', '°C', [82, 84, 83, 85], 95, 102);

  const energy: EnergyReading[] = [];
  let en = 0;
  for (let i = 60; i >= 1; i--) {
    const date = d(-i);
    const weekend = [0, 6].includes(new Date(date).getDay());
    const grid = weekend ? 820 : 2_350 + (i % 5) * 40;
    const solar = i > 40 ? 0 : 380 + (i % 4) * 25; // the rooftop solar project went live 40 days ago
    const gen = i % 13 === 0 ? 260 : 0; // power cuts
    energy.push({ id: `en${++en}`, date, source: 'GRID', kWh: grid, cost: Math.round(grid * 24.5), by: kevin.name });
    if (solar) energy.push({ id: `en${++en}`, date, source: 'SOLAR', kWh: solar, cost: 0, by: kevin.name });
    if (gen) energy.push({ id: `en${++en}`, date, source: 'GENERATOR', kWh: gen, cost: Math.round(gen * 58), by: kevin.name });
  }

  return {
    notifications: [
      {
        id: 'mn1',
        number: num('MN', 1),
        equipmentId: 'eq3',
        source: 'USER',
        trigger: 'USER',
        description: 'Cold room temperature reading 9 °C at 06:00 (set point 4 °C) — door closer slow',
        priority: 'HIGH',
        raisedBy: mary.name,
        date: d(0),
        status: 'OPEN',
        history: [h(d(0), 7, mary.name, 'Raised')]
      },
      {
        id: 'mn2',
        number: num('MN', 2),
        equipmentId: 'eq6',
        source: 'USER',
        trigger: 'USER',
        description: 'Forklift horn not working',
        priority: 'NORMAL',
        raisedBy: 'John Kiprop',
        date: d(-3),
        status: 'REJECTED',
        reason: 'Fixed on the spot by the operator (loose connector)',
        history: [h(d(-3), 9, 'John Kiprop', 'Raised'), h(d(-3), 11, esther.name, 'Rejected', 'Fixed on the spot by the operator (loose connector)')]
      }
    ],
    templates: [
      {
        id: 'jt1',
        name: 'Generator 250-hour service',
        equipmentType: 'Generator',
        steps: [
          { text: 'Isolate the ATS and lock out the starter battery', safety: true },
          { text: 'Drain oil and replace oil, fuel and air filters' },
          { text: 'Check coolant level and belt tension' },
          { text: 'Load bank test at 80% for 30 minutes' },
          { text: 'Restore ATS to auto and record running hours', safety: true }
        ],
        estHours: 4,
        parts: [{ sku: 'SPR-GEN', qty: 1 }],
        requiresPermit: false
      },
      {
        id: 'jt2',
        name: 'Packing line lubrication and belts',
        equipmentType: 'Packing machine',
        steps: [
          { text: 'Stop the line, lock out the main isolator (LOTO)', safety: true },
          { text: 'Grease cam followers and chain drives' },
          { text: 'Check and tension the drive belts' },
          { text: 'Clean photo-eyes and test the reject gate' },
          { text: 'Remove locks and test-run 10 minutes', safety: true }
        ],
        estHours: 3,
        parts: [],
        requiresPermit: false
      },
      {
        id: 'jt3',
        name: 'Truck brake and clutch overhaul',
        equipmentType: 'Vehicle',
        steps: [
          { text: 'Chock wheels, isolate battery and tag the cab', safety: true },
          { text: 'Remove drums and measure lining thickness' },
          { text: 'Fit brake and clutch kit, bleed hydraulics' },
          { text: 'Road test and brake efficiency check', safety: true }
        ],
        estHours: 6,
        parts: [{ sku: 'SPR-BRK', qty: 1 }],
        requiresPermit: false
      },
      {
        id: 'jt4',
        name: 'Blending drum gearbox service',
        equipmentType: 'Blender',
        steps: [
          { text: 'Lock out the drum motor and wait for the drum to stop', safety: true },
          { text: 'Drain and refill gearbox oil (ISO VG 220)' },
          { text: 'Measure bearing play and vibration after restart' }
        ],
        estHours: 4,
        parts: [{ sku: 'SPR-BLT', qty: 1 }],
        requiresPermit: false
      },
      {
        id: 'jt5',
        name: 'Boiler hot work (welding on pressure parts)',
        equipmentType: 'Boiler',
        steps: [
          { text: 'Active hot work permit on site, fire watch posted', safety: true },
          { text: 'Depressurise and isolate steam and feed water', safety: true },
          { text: 'Carry out the repair and dye-penetrant test the weld' },
          { text: 'Hydro test before return to service', safety: true }
        ],
        estHours: 8,
        parts: [],
        requiresPermit: true,
        permitType: 'Hot work'
      }
    ],
    technicians: [
      { id: 't1', name: kevin.name, trade: 'Mechanical technician', hoursPerDay: 8, rate: 1_500 },
      { id: 't2', name: 'Brian Kiplagat', trade: 'Electrical technician', hoursPerDay: 8, rate: 1_650 },
      { id: 't3', name: 'Moses Wekesa', trade: 'Boiler attendant / fitter', hoursPerDay: 8, rate: 1_400 },
      { id: 't4', name: 'Baraka Maintenance crew', trade: 'Contractor (call-out)', hoursPerDay: 10, rate: 3_200, external: true }
    ],
    meterReadings,
    conditions,
    calibrations: [
      { id: 'cal1', equipmentId: 'eq5', date: d(-86), standard: 'F1 test weights 25 kg (KEBS certificate)', asFound: '25.08 kg', asLeft: '25.01 kg', tolerance: '±0.5% at 25 kg', pass: true, certNo: 'KEBS-CAL-24-1189', by: kevin.name },
      { id: 'cal2', equipmentId: 'eq12', date: d(-178), standard: 'Weights and Measures test weights 10 × 1 t', asFound: '+35 kg at 30 t', asLeft: '+5 kg at 30 t', tolerance: '±20 kg at 30 t', pass: true, certNo: 'WM-MSA-0417', by: 'Weights & Measures inspector' }
    ],
    rotables: [
      { id: 'rt1', serial: 'RT-6312-0003', description: 'Gearbox bearing 6312 (drum)', status: 'AT_REPAIR', location: 'Baraka Maintenance workshop', value: 18_500, history: [{ date: d(-400), event: 'Bought new', by: mary.name, value: 18_500 }, { date: d(-8), event: 'Removed from blending drum — sent for rebuild', by: kevin.name, woNumber: num('WO', 9) }] },
      { id: 'rt2', serial: 'RT-6312-0007', description: 'Gearbox bearing 6312 (drum)', status: 'INSTALLED', location: 'Tea blending drum 2 t', equipmentId: 'eq13', value: 21_200, history: [{ date: d(-120), event: 'Rebuilt by Baraka — returned to stock', by: kevin.name, value: 21_200 }, { date: d(-8), event: 'Installed on blending drum', by: kevin.name, woNumber: num('WO', 9) }] },
      { id: 'rt3', serial: 'INJ-4HK1-221', description: 'Fuel injector pump — Isuzu 4HK1', status: 'IN_STOCK', location: 'Spares store WH-NBO', value: 64_000, history: [{ date: d(-60), event: 'Received rebuilt from Bosch service centre', by: kevin.name, value: 64_000 }] },
      { id: 'rt4', serial: 'ALT-C250-118', description: 'Generator alternator AVR board', status: 'CORE_DUE', location: 'Standby generator 250 kVA', equipmentId: 'eq1', value: 32_000, coreDue: { woNumber: num('WO', 1), since: d(-33), serialOut: 'ALT-C250-097' }, history: [{ date: d(-33), event: 'Exchange unit fitted — old board (core) to be returned to supplier', by: kevin.name, woNumber: num('WO', 1) }] }
    ],
    energy,
    sequence: { MN: 2 }
  };
};

/* ---------------- Projects ---------------- */

export const buildProjectsSeed = (): ProjectsState => {
  const costs: ProjectCost[] = [];
  let pc = 0;
  const cost = (projectId: string, phaseId: string, type: ProjectCost['type'], amount: number, offset: number, source: string, description: string, billable = false) =>
    costs.push({ id: `pc${++pc}`, projectId, phaseId, type, amount, date: d(offset), source, description, billable });
  // Solar PV: design, supply and part of the installation
  cost('pj1', 'ph1', 'SUBCONTRACT', 420_000, -62, 'BILL-SOLAR-01', 'Design, structural survey and KPLC approvals');
  cost('pj1', 'ph2', 'MATERIAL', 2_150_000, -22, 'PO Solarica', '300 × 400 W panels and two 60 kW inverters');
  cost('pj1', 'ph3', 'LABOUR', 210_000, -10, 'Timesheets', 'Installation crew — weeks 1 and 2');
  cost('pj1', 'ph3', 'BURDEN', 63_000, -10, 'Overhead 30%', 'Overhead on installation labour');
  cost('pj1', 'ph3', 'EXPENSE', 67_000, -8, 'Expense claims', 'Crane hire and site travel');
  // Racking: over budget
  cost('pj2', 'ph1', 'MATERIAL', 1_180_000, -32, 'PO Dexion', 'Pallet racking — 420 positions');
  cost('pj2', 'ph2', 'SUBCONTRACT', 410_000, -6, 'Installer', 'Installation and load test');
  cost('pj2', 'ph2', 'EXPENSE', 65_000, -6, 'Expense claims', 'Mombasa travel and per diem');
  cost('pj4', 'ph1', 'LABOUR', 120_000, -100, 'Timesheets', 'Baseline study');
  cost('pj4', 'ph2', 'MATERIAL', 260_000, -45, 'PO tooling', 'Quick-change tooling');

  const timesheets: Timesheet[] = [
    { id: 'ts1', projectId: 'pj1', phaseId: 'ph3', employee: 'Brian Kiplagat', date: d(-3), hours: 8, rate: 1_650, billRate: 3_500, status: 'APPROVED', approvedBy: esther.name },
    { id: 'ts2', projectId: 'pj1', phaseId: 'ph3', employee: 'Brian Kiplagat', date: d(-2), hours: 7.5, rate: 1_650, billRate: 3_500, status: 'SUBMITTED' },
    { id: 'ts3', projectId: 'pj1', phaseId: 'ph3', employee: kevin.name, date: d(-2), hours: 6, rate: 1_500, billRate: 3_200, status: 'SUBMITTED' },
    { id: 'ts4', projectId: 'pj5', phaseId: 'ph2', employee: 'Brian Kiplagat', date: d(-1), hours: 8, rate: 1_650, billRate: 4_200, status: 'APPROVED', approvedBy: mary.name },
    { id: 'ts5', projectId: 'pj5', phaseId: 'ph2', employee: kevin.name, date: d(-1), hours: 6, rate: 1_500, billRate: 3_800, status: 'APPROVED', approvedBy: mary.name }
  ];
  costs.push({ id: `pc${++pc}`, projectId: 'pj5', phaseId: 'ph2', type: 'LABOUR', amount: 22_200, date: d(-1), source: 'Timesheets', description: 'Commissioning crew', billable: true });

  return {
    ext: {
      pj1: {
        projectId: 'pj1',
        code: 'PJ-001',
        kind: 'INVESTMENT',
        scope: 'Install a 120 kW rooftop solar PV system on the factory and blending hall roofs, net-metered with Kenya Power, to cut grid energy cost by about 35%.',
        orderNumbers: [],
        team: [
          { name: esther.name, role: 'Project owner', allocationPct: 20 },
          { name: 'Brian Kiplagat', role: 'Electrical lead', allocationPct: 60 },
          { name: kevin.name, role: 'Mechanical support', allocationPct: 25 }
        ],
        burdenRatePct: 30,
        phases: [
          { id: 'ph1', name: 'Design and approvals', budget: 450_000, start: d(-75), end: d(-58) },
          { id: 'ph2', name: 'Procurement', budget: 2_300_000, start: d(-57), end: d(-20) },
          { id: 'ph3', name: 'Installation', budget: 1_500_000, start: d(-19), end: d(15) },
          { id: 'ph4', name: 'Commissioning and handover', budget: 550_000, start: d(16), end: d(45) }
        ],
        tasks: [
          { id: 'tk1', phaseId: 'ph1', name: 'Structural survey', durationDays: 7, predecessors: [], progress: 100, start: d(-75), actualFinish: d(-68) },
          { id: 'tk2', phaseId: 'ph1', name: 'KPLC net-metering approval', durationDays: 10, predecessors: ['tk1'], progress: 100, actualFinish: d(-57) },
          { id: 'tk3', phaseId: 'ph2', name: 'Panels and inverters supplied', durationDays: 35, predecessors: ['tk2'], progress: 100, actualFinish: d(-20) },
          { id: 'tk4', phaseId: 'ph2', name: 'Mounting rails fabricated', durationDays: 14, predecessors: ['tk2'], progress: 100, actualFinish: d(-30) },
          { id: 'tk5', phaseId: 'ph3', name: 'Rails and panels on roof', durationDays: 18, predecessors: ['tk3', 'tk4'], progress: 70 },
          { id: 'tk6', phaseId: 'ph3', name: 'DC cabling and inverters', durationDays: 10, predecessors: ['tk3'], progress: 40 },
          { id: 'tk7', phaseId: 'ph4', name: 'Grid tie-in and protection test', durationDays: 6, predecessors: ['tk5', 'tk6'], progress: 0 },
          { id: 'tk8', phaseId: 'ph4', name: 'Commissioning and handover', durationDays: 4, predecessors: ['tk7'], progress: 0 }
        ],
        materials: [
          { id: 'mt1', phaseId: 'ph3', sku: 'PKG-LBL', qty: 2, neededBy: d(5), issued: 0 },
          { id: 'mt2', phaseId: 'ph4', sku: 'SPR-PEY', qty: 2, neededBy: d(20), issued: 0 }
        ],
        appraisal: { capex: 4_800_000, annualBenefit: 1_650_000, lifeYears: 20, ratePct: 14, risks: 'Grid outages limit export; panel degradation 0.5%/year; KPLC tariff changes.', preparedBy: mary.name, decision: 'APPROVED', decidedBy: esther.name, note: 'Board resolution 2026/14' },
        benefits: [{ period: TODAY.slice(0, 7), amount: 96_000, note: 'Grid kWh saved since partial energisation (from the energy log)' }],
        budgetApprovedBy: esther.name,
        assetCategory: 'Plant & machinery',
        certificates: [],
        invoices: [],
        history: [h(d(-80), 9, mary.name, 'Project created'), h(d(-76), 10, esther.name, 'Appraisal approved', 'NPV positive at 14%'), h(d(-75), 10, esther.name, 'Budget approved')]
      },
      pj2: {
        projectId: 'pj2',
        code: 'PJ-002',
        kind: 'CAPEX',
        scope: 'Pallet racking and bin locations for the Mombasa port store, raising capacity from 900 to 1,500 pallet positions for tea awaiting shipment.',
        orderNumbers: [],
        team: [{ name: mary.name, role: 'Project owner', allocationPct: 30 }],
        burdenRatePct: 25,
        phases: [
          { id: 'ph1', name: 'Racking supply', budget: 1_100_000, start: d(-50), end: d(-30) },
          { id: 'ph2', name: 'Installation and labels', budget: 500_000, start: d(-29), end: d(5) }
        ],
        tasks: [
          { id: 'tk1', phaseId: 'ph1', name: 'Racking supplied', durationDays: 20, predecessors: [], progress: 100, start: d(-50), actualFinish: d(-30) },
          { id: 'tk2', phaseId: 'ph2', name: 'Installed and load-tested', durationDays: 25, predecessors: ['tk1'], progress: 100, actualFinish: d(-5) },
          { id: 'tk3', phaseId: 'ph2', name: 'Location labels and WMS bins', durationDays: 8, predecessors: ['tk2'], progress: 30 }
        ],
        materials: [{ id: 'mt1', phaseId: 'ph2', sku: 'PKG-LBL', qty: 3, neededBy: d(3), issued: 0 }],
        benefits: [],
        budgetApprovedBy: esther.name,
        certificates: [],
        invoices: [],
        history: [h(d(-52), 9, mary.name, 'Project created'), h(d(-51), 12, esther.name, 'Budget approved')]
      },
      pj3: {
        projectId: 'pj3',
        code: 'PJ-003',
        kind: 'INVESTMENT',
        scope: 'Add an 80 m³ cold room for premium and organic teas that need temperature-controlled storage before blending.',
        orderNumbers: [],
        team: [{ name: esther.name, role: 'Project owner', allocationPct: 10 }],
        burdenRatePct: 30,
        phases: [
          { id: 'ph1', name: 'Tender and award', budget: 150_000, start: d(30), end: d(50) },
          { id: 'ph2', name: 'Construction', budget: 2_700_000, start: d(51), end: d(130) },
          { id: 'ph3', name: 'Commissioning', budget: 350_000, start: d(131), end: d(150) }
        ],
        tasks: [
          { id: 'tk1', phaseId: 'ph1', name: 'Quotations from three contractors', durationDays: 14, predecessors: [], progress: 0, start: d(30) },
          { id: 'tk2', phaseId: 'ph1', name: 'Board approval', durationDays: 5, predecessors: ['tk1'], progress: 0 },
          { id: 'tk3', phaseId: 'ph2', name: 'Civil works and panels', durationDays: 60, predecessors: ['tk2'], progress: 0 },
          { id: 'tk4', phaseId: 'ph3', name: 'Refrigeration commissioning', durationDays: 12, predecessors: ['tk3'], progress: 0 }
        ],
        materials: [],
        appraisal: { capex: 3_200_000, annualBenefit: 640_000, lifeYears: 12, ratePct: 14, risks: 'Demand for premium teas; refrigeration energy cost.', preparedBy: mary.name },
        benefits: [],
        certificates: [],
        invoices: [],
        history: [h(d(-4), 9, mary.name, 'Project created'), h(d(-4), 11, mary.name, 'Appraisal submitted')]
      },
      pj4: {
        projectId: 'pj4',
        code: 'PJ-004',
        kind: 'CAPEX',
        scope: 'Cut changeover time on Line 2 below 25 minutes with quick-change tooling.',
        orderNumbers: [],
        team: [{ name: mary.name, role: 'Project owner', allocationPct: 15 }],
        burdenRatePct: 25,
        phases: [
          { id: 'ph1', name: 'Study', budget: 150_000, start: d(-120), end: d(-100) },
          { id: 'ph2', name: 'Tooling', budget: 300_000, start: d(-99), end: d(-10) }
        ],
        tasks: [
          { id: 'tk1', phaseId: 'ph1', name: 'Baseline study', durationDays: 20, predecessors: [], progress: 100, start: d(-120), actualFinish: d(-100) },
          { id: 'tk2', phaseId: 'ph2', name: 'Quick-change tooling', durationDays: 60, predecessors: ['tk1'], progress: 100, actualFinish: d(-40) },
          { id: 'tk3', phaseId: 'ph2', name: 'Changeover trials', durationDays: 25, predecessors: ['tk2'], progress: 100, actualFinish: d(-10) }
        ],
        materials: [],
        benefits: [{ period: TODAY.slice(0, 7), amount: 45_000, note: 'Extra output from shorter changeovers' }],
        budgetApprovedBy: esther.name,
        certificates: [],
        invoices: [],
        history: [h(d(-125), 9, mary.name, 'Project created')]
      },
      pj5: {
        projectId: 'pj5',
        code: 'PJ-005',
        kind: 'CUSTOMER',
        scope: 'Install and commission a tea dispensing and storage corner for Highland Agro’s staff canteen; billed on time and materials.',
        customerId: 'c6',
        orderNumbers: [],
        team: [
          { name: mary.name, role: 'Project owner', allocationPct: 10 },
          { name: 'Brian Kiplagat', role: 'Installer', allocationPct: 50 }
        ],
        burdenRatePct: 25,
        phases: [
          { id: 'ph1', name: 'Site survey', budget: 40_000, start: d(-10), end: d(-5) },
          { id: 'ph2', name: 'Installation and commissioning', budget: 160_000, start: d(-4), end: d(10) }
        ],
        tasks: [
          { id: 'tk1', phaseId: 'ph1', name: 'Site survey and layout', durationDays: 5, predecessors: [], progress: 100, start: d(-10), actualFinish: d(-5) },
          { id: 'tk2', phaseId: 'ph2', name: 'Install dispensers and racking', durationDays: 8, predecessors: ['tk1'], progress: 50 },
          { id: 'tk3', phaseId: 'ph2', name: 'Commission and train staff', durationDays: 3, predecessors: ['tk2'], progress: 0 }
        ],
        materials: [],
        benefits: [],
        budgetApprovedBy: esther.name,
        certificates: [],
        invoices: [],
        history: [h(d(-12), 9, mary.name, 'Project created for Highland Agro Ltd')]
      }
    },
    costs,
    timesheets,
    expenses: [
      { id: 'ex1', number: num('EXP', 1), projectId: 'pj1', phaseId: 'ph3', employee: 'Brian Kiplagat', date: d(-4), category: 'TRAVEL', amount: 8_400, description: 'Fuel to Athi River site — 4 days', billable: false, status: 'SUBMITTED' },
      { id: 'ex2', number: num('EXP', 2), projectId: 'pj5', phaseId: 'ph1', employee: mary.name, date: d(-9), category: 'PER_DIEM', amount: 6_000, description: 'Per diem — Nanyuki site survey', billable: true, status: 'APPROVED', approvedBy: esther.name }
    ],
    sequence: { EXP: 2, CERT: 0 }
  };
};
