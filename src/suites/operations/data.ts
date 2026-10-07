import { addDays, TODAY } from '../finance/engine';
import type { CommercialState } from '../commercial/types';
import type {
  Batch,
  Equipment,
  FuelEntry,
  OperationsState,
  OpsActor,
  OpsRole,
  PmSchedule,
  Project,
  Recipe,
  ShipDoc,
  Shipment,
  StockCount,
  StockMove,
  Transfer,
  Trip,
  Vehicle,
  WorkOrder
} from './types';
import type { HistoryEntry } from '../finance/types';

export const OPS_ACTORS: Record<OpsRole, OpsActor> = {
  OFFICER: { role: 'OFFICER', name: 'Mary Wambui', title: 'Operations Officer' },
  STOREKEEPER: { role: 'STOREKEEPER', name: 'John Kiprop', title: 'Stores & Dispatch' },
  TECHNICIAN: { role: 'TECHNICIAN', name: 'Kevin Ouma', title: 'Maintenance Technician' },
  QC: { role: 'QC', name: 'Faith Akinyi', title: 'Quality Controller' },
  MANAGER: { role: 'MANAGER', name: 'Esther Muthoni', title: 'Operations Manager' }
};
const { OFFICER: mary, STOREKEEPER: john, TECHNICIAN: kevin, QC: faith, MANAGER: esther } = OPS_ACTORS;

const d = (o: number) => addDays(TODAY, o);
const at = (date: string, h: number) => `${date}T${String(h).padStart(2, '0')}:20:00`;
const year = TODAY.slice(0, 4);
const num = (p: string, n: number) => `${p}-${year}-${String(n).padStart(4, '0')}`;
const h = (date: string, hour: number, by: string, action: string, note?: string): HistoryEntry => ({ at: at(date, hour), by, action, note });

export const RECIPES: Recipe[] = [
  {
    id: 'rc1',
    product: 'STD-24',
    name: 'Standard pack — carton of 24',
    batchSize: 200,
    materials: [
      { sku: 'RAW-A', qty: 2.4 },
      { sku: 'PKG-BOX', qty: 2 },
      { sku: 'PKG-FLM', qty: 1 },
      { sku: 'PKG-LBL', qty: 1 }
    ],
    hours: 6,
    line: 'Line 1 — Standard',
    checks: ['Moisture ≤ 6%', 'Pack weight 500 g ± 2%', 'Seal integrity', 'Label and batch code']
  },
  {
    id: 'rc2',
    product: 'PRM-12',
    name: 'Premium range — carton of 12',
    batchSize: 100,
    materials: [
      { sku: 'RAW-A', qty: 1 },
      { sku: 'PKG-BOX', qty: 1 },
      { sku: 'PKG-FLM', qty: 1 },
      { sku: 'PKG-LBL', qty: 1 }
    ],
    hours: 5,
    line: 'Line 2 — Premium',
    checks: ['Moisture ≤ 5%', 'Pack weight 250 g ± 1%', 'Colour grade A', 'Label and batch code']
  },
  {
    id: 'rc3',
    product: 'BLK-25',
    name: 'Bulk sack — 25 kg',
    batchSize: 80,
    materials: [
      { sku: 'RAW-A', qty: 2.1 },
      { sku: 'PKG-LBL', qty: 1 }
    ],
    hours: 4,
    line: 'Bulk bagging',
    checks: ['Moisture ≤ 7%', 'Sack weight 25 kg ± 0.5%', 'Stitching']
  },
  {
    id: 'rc4',
    product: 'ORG-12',
    name: 'Organic line — carton of 12',
    batchSize: 60,
    materials: [
      { sku: 'RAW-A', qty: 0.8 },
      { sku: 'PKG-BOX', qty: 1 },
      { sku: 'PKG-FLM', qty: 1 },
      { sku: 'PKG-LBL', qty: 1 }
    ],
    hours: 5,
    line: 'Line 2 — Premium',
    checks: ['Organic certificate lot', 'Moisture ≤ 5%', 'Pack weight 250 g ± 1%', 'Label and batch code']
  },
  {
    id: 'rc5',
    product: 'GFT-06',
    name: 'Gift box — set of 6',
    batchSize: 100,
    materials: [
      { sku: 'RAW-A', qty: 0.4 },
      { sku: 'PKG-BOX', qty: 1 },
      { sku: 'PKG-LBL', qty: 1 }
    ],
    hours: 6,
    line: 'Packing hall',
    checks: ['Box finish', 'Contents complete', 'Label and batch code']
  }
];

const docsFor = (done: string[], incoterm: Shipment['incoterm']): ShipDoc[] =>
  [
    { key: 'invoice', name: 'Commercial invoice', issuer: 'Finance' },
    { key: 'packing', name: 'Packing list', issuer: 'Stores' },
    { key: 'coo', name: 'Certificate of origin', issuer: 'Chamber of Commerce' },
    { key: 'phyto', name: 'Phytosanitary certificate', issuer: 'KEPHIS' },
    { key: 'entry', name: 'Export entry', issuer: 'KRA customs' },
    { key: 'bl', name: 'Bill of lading', issuer: 'Shipping line' },
    ...(incoterm === 'CIF' ? [{ key: 'insurance', name: 'Marine insurance certificate', issuer: 'Insurer' }] : [])
  ].map((x) => ({ ...x, done: done.includes(x.key), ref: done.includes(x.key) ? `${x.key.toUpperCase()}-${Math.abs(x.key.charCodeAt(0) * 37) % 9000 + 1000}` : undefined }));

export const buildOperationsSeed = (com: CommercialState, financeInvoicesFor: (customerId: string) => { id: string; number: string }[]): OperationsState => {
  const warehouses = [
    { id: 'WH-NBO', name: 'Main warehouse — Nairobi', location: 'Industrial Area, Nairobi', capacity: 4_000, main: true },
    { id: 'WH-MSA', name: 'Port store — Mombasa', location: 'Shimanzi, Mombasa', capacity: 1_500 },
    { id: 'WH-FAC', name: 'Factory materials store', location: 'Factory, Athi River', capacity: 1_200 }
  ];
  const placed: Record<string, Record<string, number>> = {
    'BLK-25': { 'WH-MSA': 120 },
    'STD-24': { 'WH-MSA': 150 },
    'PKG-BOX': { 'WH-FAC': 90 },
    'PKG-FLM': { 'WH-FAC': 15 },
    'RAW-A': { 'WH-FAC': 10 },
    'PKG-LBL': { 'WH-FAC': 40 }
  };

  /* ---------------- Transfers and counts ---------------- */
  const transfers: Transfer[] = [
    { id: 'tr1', number: num('TRF', 1), from: 'WH-NBO', to: 'WH-MSA', date: d(-24), lines: [{ sku: 'BLK-25', qty: 120 }], status: 'RECEIVED', requestedBy: mary.name, reason: 'Stock for the Dubai shipment', history: [h(d(-24), 9, mary.name, 'Requested'), h(d(-24), 14, john.name, 'Dispatched'), h(d(-22), 11, john.name, 'Received in Mombasa')] },
    { id: 'tr2', number: num('TRF', 2), from: 'WH-NBO', to: 'WH-FAC', date: d(-10), lines: [{ sku: 'PKG-BOX', qty: 90 }, { sku: 'PKG-FLM', qty: 15 }], status: 'RECEIVED', requestedBy: mary.name, reason: 'Packaging for next week’s batches', history: [h(d(-10), 8, mary.name, 'Requested'), h(d(-10), 12, john.name, 'Dispatched'), h(d(-10), 16, john.name, 'Received at the factory')] },
    { id: 'tr3', number: num('TRF', 3), from: 'WH-NBO', to: 'WH-MSA', date: d(-1), lines: [{ sku: 'STD-24', qty: 100 }], status: 'IN_TRANSIT', requestedBy: mary.name, reason: 'Top up port stock for coast orders', history: [h(d(-1), 9, mary.name, 'Requested'), h(d(-1), 15, john.name, 'Dispatched on KDB 220T')] },
    { id: 'tr4', number: num('TRF', 4), from: 'WH-NBO', to: 'WH-FAC', date: d(0), lines: [{ sku: 'RAW-A', qty: 2 }], status: 'REQUESTED', requestedBy: mary.name, reason: 'Raw material for the standard-pack batch', history: [h(d(0), 8, mary.name, 'Requested')] }
  ];
  const counts: StockCount[] = [
    {
      id: 'ct1',
      number: num('CNT', 1),
      warehouse: 'WH-NBO',
      date: d(-21),
      lines: [
        { sku: 'STD-24', expected: 412, counted: 410 },
        { sku: 'PRM-12', expected: 230, counted: 230 },
        { sku: 'GFT-06', expected: 118, counted: 117 },
        { sku: 'BLK-25', expected: 300, counted: 300 }
      ],
      status: 'APPROVED',
      countedBy: john.name,
      approvedBy: esther.name,
      history: [h(d(-21), 8, john.name, 'Count started'), h(d(-21), 12, john.name, 'Count submitted'), h(d(-21), 15, esther.name, 'Variance approved', '3 units short — breakage in aisle 4')]
    }
  ];

  /* ---------------- Production ---------------- */
  const batches: Batch[] = [];
  let bn = 0;
  const batch = (recipeId: string, qty: number, offset: number, status: Batch['status'], extra: Partial<Batch> = {}) => {
    const r = RECIPES.find((x) => x.id === recipeId)!;
    const date = d(offset);
    const issued = ['IN_PROGRESS', 'QC', 'COMPLETED', 'REJECTED'].includes(status) ? r.materials.map((m) => ({ sku: m.sku, qty: Math.round(((m.qty * qty) / r.batchSize) * 100) / 100 })) : [];
    const history: HistoryEntry[] = [h(d(offset - 3), 9, mary.name, 'Planned')];
    if (status !== 'PLANNED') history.push(h(d(offset - 1), 10, esther.name, 'Released to the floor'));
    if (issued.length) history.push(h(date, 7, john.name, 'Materials issued'), h(date, 8, mary.name, 'Production started'));
    const b: Batch = { id: `bt${++bn}`, number: num('BAT', bn), recipeId, plannedQty: qty, date, line: r.line, status, issued, output: 0, rejectedQty: 0, checks: [], history, ...extra };
    if (status === 'COMPLETED') {
      b.checks = r.checks.map((c) => ({ parameter: c, target: c, result: 'Within spec', pass: true }));
      b.checkedBy = faith.name;
      b.output = qty - (extra.rejectedQty ?? 0);
      b.history.push(h(date, 15, faith.name, 'Quality check passed'), h(date, 16, mary.name, `Completed — ${b.output} into stock`));
    }
    batches.push(b);
    return b;
  };
  batch('rc1', 200, -33, 'COMPLETED');
  batch('rc3', 80, -27, 'COMPLETED', { rejectedQty: 2 });
  batch('rc2', 100, -19, 'COMPLETED', { rejectedQty: 3 });
  batch('rc1', 200, -12, 'COMPLETED', { rejectedQty: 1 });
  batch('rc5', 100, -6, 'COMPLETED');
  batch('rc3', 80, -1, 'QC');
  batch('rc1', 200, 0, 'IN_PROGRESS');
  batch('rc4', 60, 1, 'RELEASED', { forOrder: com.orders.find((o) => o.customerId === 'c6')?.number });
  batch('rc5', 100, 3, 'PLANNED');
  batch('rc2', 100, 5, 'PLANNED');

  const moves: StockMove[] = [];
  let mv = 0;
  for (const b of batches) {
    for (const i of b.issued) moves.push({ id: `mv${++mv}`, date: b.date, sku: i.sku, qty: -i.qty, from: 'WH-FAC', kind: 'PRODUCTION_ISSUE', ref: b.number, by: john.name });
    const r = RECIPES.find((x) => x.id === b.recipeId)!;
    if (b.output) moves.push({ id: `mv${++mv}`, date: b.date, sku: r.product, qty: b.output, to: 'WH-NBO', kind: 'PRODUCTION_OUTPUT', ref: b.number, by: mary.name });
  }
  for (const t of transfers.filter((x) => x.status !== 'REQUESTED'))
    for (const l of t.lines) moves.push({ id: `mv${++mv}`, date: t.date, sku: l.sku, qty: l.qty, from: t.from, to: t.to, kind: 'TRANSFER', ref: t.number, by: john.name });
  moves.push({ id: `mv${++mv}`, date: d(-21), sku: 'STD-24', qty: -2, from: 'WH-NBO', kind: 'COUNT', ref: num('CNT', 1), by: esther.name });
  moves.push({ id: `mv${++mv}`, date: d(-21), sku: 'GFT-06', qty: -1, from: 'WH-NBO', kind: 'COUNT', ref: num('CNT', 1), by: esther.name });

  /* ---------------- Shipping ---------------- */
  // The two shipped consignments were invoiced by Finance (latest invoice first)
  const [latest, earlier] = financeInvoicesFor('c8');
  const shipments: Shipment[] = [
    {
      id: 'sh1',
      number: num('SHP', 1),
      customerId: 'c8',
      destination: 'Jebel Ali, Dubai',
      incoterm: 'FOB',
      lines: [{ sku: 'BLK-25', description: 'Bulk sack — 25 kg', qty: 400, price: 9_120 }],
      stage: 'DELIVERED',
      vessel: 'Maersk Kendal',
      line: 'Maersk',
      bookingRef: 'MAEU 228190341',
      etd: d(-52),
      eta: d(-38),
      container: 'MSKU 4410982',
      seal: 'ML-660421',
      docs: docsFor(['invoice', 'packing', 'coo', 'phyto', 'entry', 'bl'], 'FOB'),
      invoiceId: (earlier ?? latest)?.id,
      invoiceNumber: (earlier ?? latest)?.number,
      history: [h(d(-60), 9, mary.name, 'Booked'), h(d(-53), 14, john.name, 'Container loaded and sealed'), h(d(-52), 18, mary.name, 'Departed Mombasa'), h(d(-38), 9, mary.name, 'Arrived Jebel Ali'), h(d(-35), 10, mary.name, 'Delivered to the buyer')]
    },
    {
      id: 'sh2',
      number: num('SHP', 2),
      customerId: 'c8',
      destination: 'Jebel Ali, Dubai',
      incoterm: 'FOB',
      lines: [
        { sku: 'BLK-25', description: 'Bulk sack — 25 kg', qty: 300, price: 9_120 },
        { sku: 'STD-24', description: 'Standard pack — carton of 24', qty: 150, price: 4_650 }
      ],
      stage: 'DEPARTED',
      vessel: 'MSC Aurora',
      line: 'MSC',
      bookingRef: 'MSC 77120593',
      etd: d(-6),
      eta: d(8),
      container: 'MSCU 7712093',
      seal: 'MS-118204',
      docs: docsFor(['invoice', 'packing', 'coo', 'phyto', 'entry', 'bl'], 'FOB'),
      invoiceId: latest?.id,
      invoiceNumber: latest?.number,
      history: [h(d(-14), 9, mary.name, 'Booked'), h(d(-8), 13, john.name, 'Container loaded and sealed'), h(d(-6), 19, mary.name, 'Departed Mombasa')]
    },
    {
      id: 'sh3',
      number: num('SHP', 3),
      customerId: 'c8',
      destination: 'Port Sultan Qaboos, Muscat',
      incoterm: 'CIF',
      lines: [{ sku: 'BLK-25', description: 'Bulk sack — 25 kg', qty: 120, price: 9_600 }],
      stage: 'DOCUMENTS',
      vessel: 'CMA CGM Tanzania',
      line: 'CMA CGM',
      bookingRef: 'CMA 55102877',
      etd: d(5),
      eta: d(17),
      docs: docsFor(['packing', 'entry'], 'CIF'),
      history: [h(d(-5), 9, mary.name, 'Booked'), h(d(-3), 11, mary.name, 'Documents in progress')]
    },
    {
      id: 'sh4',
      number: num('SHP', 4),
      customerId: 'c8',
      destination: 'Jebel Ali, Dubai',
      incoterm: 'FOB',
      lines: [{ sku: 'BLK-25', description: 'Bulk sack — 25 kg', qty: 600, price: 8_750 }],
      stage: 'BOOKED',
      vessel: 'Maersk Kalmar',
      line: 'Maersk',
      bookingRef: 'MAEU 230044718',
      etd: d(18),
      eta: d(32),
      docs: docsFor([], 'FOB'),
      history: [h(d(-1), 10, mary.name, 'Booked — awaiting the buyer’s letter of credit')]
    }
  ];

  /* ---------------- Fleet ---------------- */
  const vehicles: Vehicle[] = [
    { id: 'v1', reg: 'KCA 512Q', model: 'Isuzu FRR 7-tonne', type: 'Truck', capacityKg: 7_000, odometer: 182_430, driver: 'Samuel Ouma', status: 'ON_TRIP', serviceEveryKm: 10_000, lastServiceKm: 175_100, insuranceExpiry: d(140), inspectionExpiry: d(95) },
    { id: 'v2', reg: 'KDB 220T', model: 'Mitsubishi Canter 3-tonne', type: 'Truck', capacityKg: 3_000, odometer: 96_720, driver: 'Joseph Mutua', status: 'ON_TRIP', serviceEveryKm: 8_000, lastServiceKm: 89_050, insuranceExpiry: d(210), inspectionExpiry: d(60) },
    { id: 'v3', reg: 'KCY 908M', model: 'Isuzu NPR 4-tonne', type: 'Truck', capacityKg: 4_000, odometer: 141_380, driver: 'Ali Bakari', status: 'IN_WORKSHOP', serviceEveryKm: 10_000, lastServiceKm: 131_900, insuranceExpiry: d(12), inspectionExpiry: d(40) },
    { id: 'v4', reg: 'KDA 123A', model: 'Toyota Hilux double cab', type: 'Pickup', capacityKg: 1_000, odometer: 118_905, driver: 'Pool vehicle', status: 'AVAILABLE', serviceEveryKm: 5_000, lastServiceKm: 115_200, insuranceExpiry: d(190), inspectionExpiry: d(22) },
    { id: 'v5', reg: 'KDG 456B', model: 'Toyota Probox', type: 'Saloon', capacityKg: 400, odometer: 64_310, driver: 'Sales team', status: 'AVAILABLE', serviceEveryKm: 5_000, lastServiceKm: 60_100, insuranceExpiry: d(260), inspectionExpiry: d(150) }
  ];
  const trips: Trip[] = [];
  let tn = 0;
  const routes = ['Nairobi → Mombasa', 'Nairobi → Nakuru', 'Nairobi → Eldoret', 'Nairobi → Thika', 'Athi River → Nairobi', 'Mombasa → Malindi'];
  const lengths = [485, 160, 312, 45, 30, 120];
  for (const dl of com.deliveries) {
    const v = vehicles.find((x) => x.reg === dl.vehicle) ?? vehicles[0];
    const r = tn % routes.length;
    const start = 100_000 + tn * 731;
    trips.push({ id: `tp${++tn}`, number: num('TRP', tn), vehicleId: v.id, driver: dl.driver, date: dl.date, purpose: `Delivery ${dl.number}`, route: routes[r], startKm: start, endKm: start + lengths[r] * 2, status: 'DONE', deliveryRef: dl.number });
  }
  trips.push({ id: `tp${++tn}`, number: num('TRP', tn), vehicleId: 'v1', driver: 'Samuel Ouma', date: d(0), purpose: 'Delivery to Mombasa port store', route: 'Nairobi → Mombasa', startKm: 182_430, status: 'ON_ROAD' });
  trips.push({ id: `tp${++tn}`, number: num('TRP', tn), vehicleId: 'v2', driver: 'Joseph Mutua', date: d(-1), purpose: `Transfer ${num('TRF', 3)}`, route: 'Nairobi → Mombasa', startKm: 96_720, status: 'ON_ROAD' });
  trips.push({ id: `tp${++tn}`, number: num('TRP', tn), vehicleId: 'v4', driver: 'Pool vehicle', date: d(1), purpose: 'Customer visit — Nakuru', route: 'Nairobi → Nakuru', startKm: 118_905, status: 'PLANNED' });

  const fuel: FuelEntry[] = [];
  let fn = 0;
  const fill = (vehicleId: string, offsets: number[], kmpl: number[], startOdo: number, price = 182) => {
    let odo = startOdo;
    offsets.forEach((o, i) => {
      const km = 420 + (i % 3) * 90;
      odo += km;
      const litres = Math.round((km / kmpl[i % kmpl.length]) * 10) / 10;
      fuel.push({ id: `fu${++fn}`, vehicleId, date: d(o), litres, cost: Math.round(litres * price), odometer: odo, station: ['Kilele Fuel — Mombasa Rd', 'Kilele Fuel — Athi River', 'Kilele Fuel — Voi'][i % 3] });
    });
  };
  fill('v1', [-40, -33, -26, -19, -12, -5], [4.8, 4.6, 4.9, 4.7, 4.8, 4.5], 179_800);
  fill('v2', [-38, -30, -22, -14, -6], [7.2, 7.4, 7.1, 7.3, 5.2], 93_900);
  fill('v3', [-35, -25, -15], [5.6, 5.5, 5.4], 139_900);
  fill('v4', [-30, -16, -4], [9.8, 10.1, 9.6], 117_600);
  fill('v5', [-28, -14], [14.2, 13.9], 63_400, 179);

  /* ---------------- Maintenance ---------------- */
  const equipment: Equipment[] = [
    { id: 'eq1', name: 'Standby generator 250 kVA', area: 'Factory', criticality: 'HIGH', status: 'SERVICE_DUE' },
    { id: 'eq2', name: 'Automatic packaging line', area: 'Line 1', criticality: 'HIGH', status: 'RUNNING' },
    { id: 'eq3', name: 'Cold room 40 m³', area: 'Warehouse', criticality: 'HIGH', status: 'RUNNING' },
    { id: 'eq4', name: 'Steam boiler', area: 'Factory', criticality: 'HIGH', status: 'RUNNING' },
    { id: 'eq5', name: 'Bulk bagging machine', area: 'Bulk bagging', criticality: 'MEDIUM', status: 'RUNNING' },
    { id: 'eq6', name: 'Forklift — Toyota 2.5 t', area: 'Main warehouse', criticality: 'MEDIUM', status: 'RUNNING' },
    { id: 'eq7', name: 'Isuzu NPR — KCY 908M', area: 'Fleet', criticality: 'MEDIUM', status: 'DOWN', vehicleId: 'v3' },
    { id: 'eq8', name: 'Isuzu FRR — KCA 512Q', area: 'Fleet', criticality: 'MEDIUM', status: 'RUNNING', vehicleId: 'v1' },
    { id: 'eq9', name: 'Mitsubishi Canter — KDB 220T', area: 'Fleet', criticality: 'MEDIUM', status: 'SERVICE_DUE', vehicleId: 'v2' },
    { id: 'eq10', name: 'Toyota Hilux — KDA 123A', area: 'Fleet', criticality: 'LOW', status: 'RUNNING', vehicleId: 'v4' },
    { id: 'eq11', name: 'Toyota Probox — KDG 456B', area: 'Fleet', criticality: 'LOW', status: 'RUNNING', vehicleId: 'v5' }
  ];
  const schedules: PmSchedule[] = [
    { id: 'pm1', equipmentId: 'eq1', task: '250-hour service — oil, filters, load test', everyDays: 30, lastDone: d(-34), assignedTo: kevin.name },
    { id: 'pm2', equipmentId: 'eq2', task: 'Lubrication and belt tension check', everyDays: 14, lastDone: d(-10), assignedTo: kevin.name },
    { id: 'pm3', equipmentId: 'eq3', task: 'Refrigerant level and door seals', everyDays: 90, lastDone: d(-84), assignedTo: 'Baraka Maintenance (contractor)' },
    { id: 'pm4', equipmentId: 'eq4', task: 'Statutory boiler inspection', everyDays: 180, lastDone: d(-176), assignedTo: 'DOSHS-approved inspector' },
    { id: 'pm5', equipmentId: 'eq6', task: 'Hydraulics, brakes and mast chains', everyDays: 60, lastDone: d(-20), assignedTo: kevin.name },
    { id: 'pm6', equipmentId: 'eq5', task: 'Scale calibration', everyDays: 90, lastDone: d(-40), assignedTo: kevin.name }
  ];
  const workOrders: WorkOrder[] = [];
  let wn = 0;
  const wo = (equipmentId: string, title: string, kind: WorkOrder['kind'], priority: WorkOrder['priority'], offset: number, status: WorkOrder['status'], extra: Partial<WorkOrder> = {}) => {
    const date = d(offset);
    const w: WorkOrder = {
      id: `wo${++wn}`,
      number: num('WO', wn),
      equipmentId,
      title,
      kind,
      priority,
      requestedBy: mary.name,
      date,
      due: d(offset + (priority === 'URGENT' ? 1 : 7)),
      assignedTo: kevin.name,
      status,
      hours: 0,
      parts: [],
      contractorCost: 0,
      downtimeHours: 0,
      notes: '',
      history: [h(date, 8, mary.name, 'Requested')],
      ...extra
    };
    if (status !== 'REQUESTED') w.history.push(h(date, 10, esther.name, 'Approved and scheduled'));
    if (status === 'IN_PROGRESS' || status === 'COMPLETED') w.history.push(h(date, 13, kevin.name, 'Work started'));
    if (status === 'COMPLETED') w.history.push(h(addDays(date, 1), 16, kevin.name, 'Completed', extra.notes));
    workOrders.push(w);
    return w;
  };
  wo('eq1', 'Generator 250-hour service', 'PREVENTIVE', 'NORMAL', -34, 'COMPLETED', { hours: 4, parts: [{ sku: 'SPR-GEN', qty: 1 }], notes: 'Load test passed at 80%', scheduleId: 'pm1' });
  wo('eq2', 'Film sealer temperature drifting', 'BREAKDOWN', 'URGENT', -22, 'COMPLETED', { hours: 6, downtimeHours: 5, notes: 'Replaced thermocouple; line back in 5 hours' });
  wo('eq3', 'Cold room door seal replacement', 'PREVENTIVE', 'NORMAL', -84, 'COMPLETED', { contractorCost: 64_000, contractorId: 's8', hours: 1, notes: 'Done by Baraka Maintenance', scheduleId: 'pm3' });
  wo('eq6', 'Forklift hydraulic service', 'PREVENTIVE', 'NORMAL', -20, 'COMPLETED', { hours: 3, notes: 'Hydraulic oil topped up', scheduleId: 'pm5' });
  wo('eq7', 'Brake overhaul and clutch replacement', 'BREAKDOWN', 'HIGH', -2, 'IN_PROGRESS', { contractorId: 's8', downtimeHours: 48, notes: 'Waiting for the clutch kit from Baraka Maintenance' });
  wo('eq2', 'Photo-eye sensor fault — intermittent stops', 'BREAKDOWN', 'HIGH', 0, 'REQUESTED', { notes: 'Line 1 stopped 4 times this morning' });
  wo('eq5', 'Bagging machine stitching head noise', 'INSPECTION', 'NORMAL', -1, 'APPROVED', { due: d(2) });
  wo('eq4', 'Boiler pressure relief valve test', 'INSPECTION', 'HIGH', -3, 'APPROVED', { assignedTo: 'DOSHS-approved inspector', due: d(4) });

  const projects: Project[] = [
    {
      id: 'pj1',
      name: 'Rooftop solar PV — 120 kW',
      owner: esther.name,
      budget: 4_800_000,
      spent: 2_910_000,
      start: d(-75),
      end: d(45),
      status: 'ACTIVE',
      milestones: [
        { name: 'Design and approvals', due: d(-60), done: true },
        { name: 'Panels and inverters delivered', due: d(-20), done: true },
        { name: 'Installation', due: d(15), done: false },
        { name: 'Grid tie-in and commissioning', due: d(40), done: false }
      ]
    },
    {
      id: 'pj2',
      name: 'Mombasa port store racking',
      owner: mary.name,
      budget: 1_600_000,
      spent: 1_655_000,
      start: d(-50),
      end: d(5),
      status: 'ACTIVE',
      milestones: [
        { name: 'Racking supplied', due: d(-30), done: true },
        { name: 'Installed and load-tested', due: d(-5), done: true },
        { name: 'Location labels and WMS bins', due: d(5), done: false }
      ]
    },
    {
      id: 'pj3',
      name: 'Cold room expansion — 80 m³',
      owner: esther.name,
      budget: 3_200_000,
      spent: 0,
      start: d(30),
      end: d(150),
      status: 'PLANNING',
      milestones: [
        { name: 'Quotations from three contractors', due: d(20), done: false },
        { name: 'Board approval', due: d(35), done: false }
      ]
    },
    {
      id: 'pj4',
      name: 'Line 2 changeover-time reduction',
      owner: mary.name,
      budget: 450_000,
      spent: 380_000,
      start: d(-120),
      end: d(-10),
      status: 'DONE',
      milestones: [
        { name: 'Baseline study', due: d(-110), done: true },
        { name: 'Quick-change tooling', due: d(-40), done: true },
        { name: 'Changeover under 25 minutes', due: d(-10), done: true }
      ]
    }
  ];

  return {
    actor: mary,
    warehouses,
    placed,
    moves,
    transfers,
    counts,
    recipes: RECIPES,
    batches,
    shipments,
    vehicles,
    trips,
    fuel,
    equipment,
    workOrders,
    schedules,
    projects,
    sequence: { TRF: 4, CNT: 1, BAT: batches.length, SHP: 4, TRP: tn, WO: wn }
  };
};
