import { addDays, TODAY } from '../../finance/engine';
import type { HistoryEntry } from '../../finance/types';
import type { CommercialState } from '../../commercial/types';
import type { Asn, Carrier, HandlingUnit, Load, LotMove, StorageLocation, TeaLot, WarehouseExtState, WarehouseTask, Worker } from './types';

const d = (o: number) => addDays(TODAY, o);
const year = TODAY.slice(0, 4);
const num = (p: string, n: number) => `${p}-${year}-${String(n).padStart(4, '0')}`;
const h = (date: string, hour: number, by: string, action: string, note?: string): HistoryEntry => ({ at: `${date}T${String(hour).padStart(2, '0')}:10:00`, by, action, note });

/** Shipping instruction numbers the seeded reservations belong to (seeded in shipping/data.ts). */
export const SEED_SI = { confirmed: num('SI', 1), submitted: num('SI', 2) };

const JOHN = 'John Kiprop';
const FAITH = 'Faith Akinyi';
const MARY = 'Mary Wambui';

const locations = (): StorageLocation[] => {
  const out: StorageLocation[] = [];
  const add = (warehouseId: string, block: string, bays: number, rows: number, capacityKg: number, zone: StorageLocation['zone'], grades: string[] = []) => {
    for (let b = 1; b <= bays; b++)
      for (let r = 1; r <= rows; r++)
        out.push({ id: `${warehouseId}-${block}${b}${r}`, warehouseId, block, bay: String(b).padStart(2, '0'), row: String(r), capacityKg, zone, active: true, preferredGrade: grades[(b - 1) % Math.max(1, grades.length)] });
  };
  add('WH-CHG', 'A', 3, 2, 40_000, 'GENERAL', ['BP1', 'PF1', 'PD']);
  add('WH-CHG', 'B', 2, 2, 40_000, 'GENERAL', ['D1', 'BMF']);
  add('WH-CHG', 'Q', 1, 2, 20_000, 'QUARANTINE');
  add('WH-MSA', 'S', 2, 1, 60_000, 'STUFFING');
  add('WH-MSA', 'A', 2, 2, 30_000, 'GENERAL', ['PF1', 'BP1']);
  add('WH-MSA', 'K', 1, 1, 30_000, 'BONDED');
  add('WH-NBO', 'T', 2, 1, 25_000, 'GENERAL', ['PF1']);
  return out;
};

type LotSeed = [lotNo: string, garden: string, grade: string, invoice: string, bags: number, kgPerBag: number, warehouse: string, loc: string, arrival: number, cost: number, extra?: Partial<TeaLot>];

const LOTS: LotSeed[] = [
  ['L-24051', 'Kangaita', 'BP1', 'KG 0412', 60, 70, 'WH-CHG', 'WH-CHG-A11', -40, 395, { reservedKg: 4_200, reservedFor: SEED_SI.confirmed }],
  ['L-24052', 'Gitugi', 'PF1', 'GT 0877', 80, 65, 'WH-CHG', 'WH-CHG-A21', -38, 372, { reservedKg: 5_135, reservedFor: SEED_SI.confirmed }],
  ['L-24053', 'Michimikuru', 'PD', 'MM 1190', 40, 70, 'WH-CHG', 'WH-CHG-A31', -35, 340],
  ['L-24054', 'Chinga', 'BP1', 'CH 0331', 50, 70, 'WH-CHG', 'WH-CHG-A12', -33, 402, { owner: 'c8', ownership: 'CUSTOMER' }],
  ['L-24055', 'Ragati', 'PF1', 'RG 0219', 70, 65, 'WH-CHG', 'WH-CHG-A22', -30, 381, { owner: 'c8', ownership: 'CUSTOMER' }],
  ['L-24056', 'Iriaini', 'D1', 'IR 0705', 30, 75, 'WH-CHG', 'WH-CHG-B11', -28, 298],
  ['L-24057', 'Kapkoros', 'BMF', 'KK 0050', 25, 60, 'WH-CHG', 'WH-CHG-B21', -26, 255, { ownership: 'CONSIGNMENT', owner: 's11', supplierId: 's11' }],
  ['L-24058', 'Toror', 'PF1', 'TR 0412', 45, 65, 'WH-CHG', 'WH-CHG-Q11', -9, 366, { qc: 'HOLD', qcNote: 'Moisture 7.4% at receipt — re-test after drying' }],
  ['L-24059', 'Mataara', 'BP1', 'MT 0610', 55, 70, 'WH-MSA', 'WH-MSA-A11', -20, 410],
  ['L-24060', 'Kiru', 'PF1', 'KR 0999', 64, 65, 'WH-MSA', 'WH-MSA-A21', -18, 388],
  ['L-24061', 'Kaimosi', 'PD', 'KM 0145', 36, 70, 'WH-MSA', 'WH-MSA-A12', -15, 335, { owner: 'c8', ownership: 'CUSTOMER' }],
  ['L-24062', 'Kangaita', 'PF1', 'KG 0440', 42, 65, 'WH-NBO', 'WH-NBO-T11', -60, 360],
  ['L-23988', 'Gitugi', 'D1', 'GT 0700', 20, 75, 'WH-NBO', 'WH-NBO-T21', -320, 260],
  ['L-24063', 'Chinga', 'PF1', 'CH 0360', 48, 65, 'WH-CHG', 'WH-CHG-A32', -5, 0, { qc: 'PENDING', auction: { saleNo: 'Sale 41', broker: 'Chartered Brokers', status: 'RECEIVED', valuationUsd: 3.1 } }],
  ['L-24064', 'Ragati', 'BP1', 'RG 0233', 52, 70, 'WH-CHG', 'WH-CHG-B12', -6, 0, { auction: { saleNo: 'Sale 41', broker: 'Chartered Brokers', catalogueNo: 'C41-118', status: 'CATALOGUED', valuationUsd: 3.4 } }],
  ['L-24065', 'Iriaini', 'PF1', 'IR 0720', 44, 65, 'WH-CHG', 'WH-CHG-B22', -13, 0, { auction: { saleNo: 'Sale 40', broker: 'Venus Tea Brokers', catalogueNo: 'C40-077', status: 'SOLD', buyer: 'c8', priceUsd: 3.25, promptDate: d(1), valuationUsd: 3.2 } }]
];

export const buildWarehouseExtSeed = (com: CommercialState): WarehouseExtState => {
  const locs = locations();
  const lots: TeaLot[] = LOTS.map(([lotNo, garden, grade, invoiceNo, bags, kgPerBag, warehouseId, locationId, arrival, costPerKg, extra = {}], i) => {
    const kg = bags * kgPerBag;
    const declaredKg = kg;
    const weighedKg = i % 4 === 1 ? kg - 18 : i % 5 === 2 ? kg + 12 : kg;
    return {
      id: `lot${i + 1}`,
      lotNo,
      garden,
      mark: garden.toUpperCase(),
      grade,
      invoiceNo,
      season: `${year}/${Number(year.slice(2)) + 1}`,
      origin: 'Kenya — East of Rift',
      owner: 'OWN',
      ownership: 'OWNED',
      warehouseId,
      locationId,
      arrival: d(arrival),
      expiry: addDays(d(arrival), arrival < -300 ? 380 : 730),
      bags,
      kgPerBag,
      netKg: weighedKg,
      declaredKg,
      weighedKg,
      costPerKg,
      qc: 'PASS',
      reservedKg: 0,
      status: 'IN_STOCK',
      rfid: `E200-3412-${String(4000 + i * 37).padStart(4, '0')}`,
      attributes: { Grade: grade, Garden: garden, Season: `${year}/${Number(year.slice(2)) + 1}`, Packaging: 'Multiwall paper sack' },
      history: [h(d(arrival), 9, JOHN, 'Received', `${bags} bags · ${weighedKg.toLocaleString()} kg`), ...(extra.qc === 'HOLD' ? [h(d(arrival), 14, FAITH, 'Put on QC hold', extra.qcNote)] : [])],
      ...extra
    } as TeaLot;
  });
  // Auction-bought lots are owned by the buyer once sold; costs come from the auction price
  for (const l of lots) if (l.auction?.priceUsd) l.costPerKg = Math.round(l.auction.priceUsd * 129);

  const hus: HandlingUnit[] = [];
  let hu = 0;
  for (const l of lots) {
    let left = l.bags;
    while (left > 0) {
      const bags = Math.min(20, left);
      left -= bags;
      hu++;
      hus.push({ id: `hu${hu}`, code: `HU${String(100_000 + hu)}`, lotId: l.id, bags, kg: Math.round((bags * l.netKg) / l.bags), locationId: l.locationId, status: 'STORED', rfid: `E280-1160-${String(hu).padStart(6, '0')}` });
    }
  }

  const lotMoves: LotMove[] = [];
  let mv = 0;
  for (const l of lots) {
    lotMoves.push({ id: `lm${++mv}`, date: l.arrival, lotId: l.id, kind: 'RECEIPT', kg: l.netKg, bags: l.bags, to: l.warehouseId, ref: num('TLY', mv), by: JOHN });
    lotMoves.push({ id: `lm${++mv}`, date: l.arrival, lotId: l.id, kind: 'PUTAWAY', kg: 0, bags: l.bags, to: l.locationId, ref: num('TLY', mv - 1), by: JOHN });
    if (l.reservedKg) lotMoves.push({ id: `lm${++mv}`, date: d(-2), lotId: l.id, kind: 'RESERVE', kg: 0, bags: Math.round(l.reservedKg / l.kgPerBag), ref: l.reservedFor ?? '', by: MARY, note: `${l.reservedKg.toLocaleString()} kg reserved` });
  }
  // Older stock that already left the godown, so ageing and movement reports have history
  lotMoves.push({ id: `lm${++mv}`, date: d(-12), lotId: 'lot12', kind: 'DELIVERY', kg: -650, bags: -10, from: 'WH-NBO', ref: 'Blending — Line 1', by: JOHN });
  const l12 = lots.find((x) => x.id === 'lot12')!;
  l12.netKg -= 650;
  l12.bags -= 10;

  const workers: Worker[] = [
    { name: JOHN, skills: ['RECEIVE', 'PUTAWAY', 'PICK', 'STUFF', 'COUNT', 'DISPATCH'], shiftMinutes: 480, warehouseId: 'WH-CHG' },
    { name: 'Peter Mwangi', skills: ['RECEIVE', 'PUTAWAY', 'PICK', 'COUNT'], shiftMinutes: 480, warehouseId: 'WH-CHG' },
    { name: 'Hassan Juma', skills: ['PICK', 'STUFF', 'DISPATCH', 'PUTAWAY'], shiftMinutes: 480, warehouseId: 'WH-MSA' },
    { name: 'Lucy Achieng', skills: ['QC', 'COUNT', 'RECEIVE'], shiftMinutes: 420, warehouseId: 'WH-CHG' },
    { name: 'Daniel Kariuki', skills: ['RECEIVE', 'PUTAWAY', 'PICK', 'DISPATCH'], shiftMinutes: 480, warehouseId: 'WH-NBO' }
  ];
  const tasks: WarehouseTask[] = [
    { id: 'tk1', number: num('TSK', 1), type: 'QC', ref: 'L-24058', warehouseId: 'WH-CHG', detail: 'Re-test moisture on held lot L-24058', minutes: 30, assignee: 'Lucy Achieng', status: 'IN_PROGRESS', created: d(-1) },
    { id: 'tk2', number: num('TSK', 2), type: 'PUTAWAY', ref: 'L-24063', warehouseId: 'WH-CHG', detail: 'Put away auction lot L-24063 to A-03-2', minutes: 30, status: 'OPEN', created: d(0) },
    { id: 'tk3', number: num('TSK', 3), type: 'RECEIVE', ref: num('ASN', 1), warehouseId: 'WH-CHG', detail: 'Receive Kangaita factory delivery', minutes: 45, status: 'OPEN', created: d(0) },
    { id: 'tk4', number: num('TSK', 4), type: 'COUNT', ref: 'Cycle A', warehouseId: 'WH-CHG', detail: 'Cycle count — class A lots, block A', minutes: 90, status: 'OPEN', created: d(0) },
    { id: 'tk5', number: num('TSK', 5), type: 'DISPATCH', ref: 'L-24062', warehouseId: 'WH-NBO', detail: 'Issue 10 bags to blending', minutes: 25, assignee: 'Daniel Kariuki', status: 'DONE', created: d(-12), doneAt: d(-12) }
  ];

  const asns: Asn[] = [
    {
      id: 'asn1',
      number: num('ASN', 1),
      source: 'FACTORY',
      from: 'Kangaita Tea Factory',
      owner: 'OWN',
      ownership: 'OWNED',
      warehouseId: 'WH-CHG',
      expected: d(0),
      truck: 'KCH 418P',
      lines: [
        { garden: 'Kangaita', mark: 'KANGAITA', grade: 'BP1', invoiceNo: 'KG 0451', bags: 40, kgPerBag: 70, costPerKg: 398 },
        { garden: 'Kangaita', mark: 'KANGAITA', grade: 'PF1', invoiceNo: 'KG 0452', bags: 30, kgPerBag: 65, costPerKg: 377 }
      ],
      status: 'ARRIVED',
      arrivedAt: `${d(0)}T07:40:00`,
      history: [h(d(-2), 10, MARY, 'Advance notice received'), h(d(0), 7, JOHN, 'Truck arrived at the gate')]
    },
    {
      id: 'asn2',
      number: num('ASN', 2),
      source: 'AUCTION',
      from: 'Mombasa Tea Auction — Sale 41 buyers’ warehouse',
      owner: 'OWN',
      ownership: 'OWNED',
      warehouseId: 'WH-CHG',
      expected: d(2),
      truck: 'KDE 902L',
      saleNo: 'Sale 41',
      lines: [{ garden: 'Gitugi', mark: 'GITUGI', grade: 'PF1', invoiceNo: 'GT 0912', bags: 60, kgPerBag: 65, costPerKg: 384 }],
      status: 'EXPECTED',
      history: [h(d(-1), 15, MARY, 'Advance notice received', 'Bought at Sale 41, prompt day in 2 days')]
    },
    {
      id: 'asn3',
      number: num('ASN', 3),
      source: 'PURCHASE',
      from: 'Michimikuru Tea Factory',
      owner: 'OWN',
      ownership: 'OWNED',
      warehouseId: 'WH-CHG',
      expected: d(-35),
      truck: 'KCB 771T',
      lines: [{ garden: 'Michimikuru', mark: 'MICHIMIKURU', grade: 'PD', invoiceNo: 'MM 1190', bags: 40, kgPerBag: 70, costPerKg: 340 }],
      status: 'RECEIVED',
      arrivedAt: `${d(-35)}T08:15:00`,
      tally: { number: num('TLY', 3), by: JOHN, at: d(-35), lines: [{ invoiceNo: 'MM 1190', bagsCounted: 40, weighedKg: 2_812, source: 'SCALE' }] },
      history: [h(d(-37), 9, MARY, 'Advance notice received'), h(d(-35), 8, JOHN, 'Truck arrived at the gate'), h(d(-35), 11, JOHN, 'Received — tally sheet signed')]
    }
  ];

  const carriers: Carrier[] = [
    { id: 'cr1', name: 'Siginon Freight', mode: 'ROAD', supplierId: 's4', rates: [{ lane: 'Mombasa → Nairobi', perKg: 4.2, minCharge: 38_000 }, { lane: 'Nairobi → Mombasa', perKg: 3.6, minCharge: 32_000 }, { lane: 'Mombasa → Malaba', perKg: 7.1, minCharge: 85_000 }, { lane: 'Mombasa → Kampala', perKg: 9.4, minCharge: 120_000 }] },
    { id: 'cr2', name: 'Bolloré Transport & Logistics', mode: 'ROAD', supplierId: 's4', rates: [{ lane: 'Mombasa → Nairobi', perKg: 4.6, minCharge: 30_000 }, { lane: 'Mombasa → Malaba', perKg: 6.8, minCharge: 95_000 }, { lane: 'Mombasa → Busia', perKg: 7.0, minCharge: 92_000 }, { lane: 'Mombasa → Kampala', perKg: 9.1, minCharge: 130_000 }] },
    { id: 'cr3', name: 'SGR freight (Kenya Railways)', mode: 'RAIL', rates: [{ lane: 'Mombasa → Nairobi', perKg: 2.9, minCharge: 55_000 }, { lane: 'Nairobi → Mombasa', perKg: 2.6, minCharge: 50_000 }] },
    { id: 'cr4', name: 'FedEx International (API — simulated)', mode: 'COURIER', api: true, rates: [{ lane: 'Nairobi → Dubai (courier)', perKg: 1_450, minCharge: 6_500 }] },
    { id: 'cr5', name: 'UPS Worldwide (API — simulated)', mode: 'COURIER', api: true, rates: [{ lane: 'Nairobi → Dubai (courier)', perKg: 1_380, minCharge: 7_200 }] }
  ];
  const load = (n: number, lane: string, off: number, carrierId: string, kg: number, cost: number, status: Load['status'], late: [number, number] = [0, 0]): Load => ({
    id: `ld${n}`,
    number: num('LD', n),
    lane,
    date: d(off),
    refs: [],
    kg,
    carrierId,
    cost,
    status,
    plannedPickup: d(off),
    actualPickup: status === 'PLANNED' || status === 'TENDERED' ? undefined : d(off + late[0]),
    plannedDelivery: d(off + 2),
    actualDelivery: status === 'DELIVERED' ? d(off + 2 + late[1]) : undefined,
    history: [h(d(off - 1), 9, MARY, 'Load planned')]
  });
  const loads: Load[] = [
    load(1, 'Mombasa → Nairobi', -40, 'cr1', 18_000, 75_600, 'DELIVERED'),
    load(2, 'Mombasa → Nairobi', -31, 'cr3', 24_000, 69_600, 'DELIVERED', [0, 1]),
    load(3, 'Mombasa → Malaba', -26, 'cr2', 14_000, 95_200, 'DELIVERED', [1, 1]),
    load(4, 'Mombasa → Nairobi', -19, 'cr1', 12_000, 50_400, 'DELIVERED'),
    load(5, 'Mombasa → Kampala', -14, 'cr2', 16_000, 145_600, 'TURNED_BACK', [0, 0]),
    load(6, 'Mombasa → Nairobi', -8, 'cr3', 26_000, 75_400, 'DELIVERED'),
    load(7, 'Mombasa → Malaba', -4, 'cr1', 10_500, 85_000, 'DELIVERED', [0, 2]),
    load(8, 'Mombasa → Nairobi', 1, 'cr1', 8_000, 38_000, 'TENDERED')
  ];
  loads[4].history.push(h(d(-13), 16, MARY, 'Turned back at Malaba', 'Transit bond not lodged'));

  const deliveries = com.deliveries.slice(0, 1);
  return {
    locations: locs,
    lots,
    hus,
    lotMoves,
    tasks,
    workers,
    countPlans: [
      { id: 'cp1', warehouseId: 'WH-CHG', type: 'ANNUAL', abc: 'ALL', everyDays: 365, lastDone: d(-300) },
      { id: 'cp2', warehouseId: 'WH-CHG', type: 'CYCLE', abc: 'A', everyDays: 30, lastDone: d(-34) },
      { id: 'cp3', warehouseId: 'WH-MSA', type: 'CYCLE', abc: 'B', everyDays: 60, lastDone: d(-20) },
      { id: 'cp4', warehouseId: 'WH-NBO', type: 'CYCLE', abc: 'ALL', everyDays: 90, lastDone: d(-85) }
    ],
    huCounts: [],
    asns,
    yard: [
      { id: 'yd1', truck: 'KCH 418P', haulier: 'Kangaita Tea Factory', purpose: 'DELIVERY', ref: num('ASN', 1), gateIn: `${d(0)}T07:40:00`, slot: 'Dock 2', status: 'AT_DOCK' },
      { id: 'yd2', truck: 'KBZ 220M', trailer: 'ZF 4471', container: 'MSKU 7781204', haulier: 'Siginon Freight', purpose: 'STUFFING', gateIn: `${d(0)}T06:55:00`, slot: 'Bay Y3', status: 'IN_YARD' },
      { id: 'yd3', truck: 'KDA 512R', haulier: 'Bolloré Transport & Logistics', purpose: 'EMPTY_RETURN', container: 'CMAU 3320981', gateIn: `${d(-1)}T15:20:00`, slot: 'Bay Y1', gateOut: `${d(-1)}T17:05:00`, status: 'LEFT' }
    ],
    pickLists: [],
    loadingPlans: [],
    pods: [],
    returns: deliveries.length
      ? [
          {
            id: 'rma1',
            number: num('RMA', 1),
            customerId: com.orders.find((o) => o.id === deliveries[0].orderId)?.customerId ?? 'c1',
            deliveryRef: deliveries[0].number,
            lines: [{ sku: 'STD-24', qty: 4, price: 4_800 }],
            reason: 'Cartons crushed in transit — seal broken',
            status: 'AUTHORISED',
            warehouseId: 'WH-NBO',
            history: [h(d(-1), 11, MARY, 'Return authorised', 'Customer complaint received by phone')]
          }
        ]
      : [],
    carriers,
    loads,
    tariffs: [
      { activity: 'HANDLING_IN', basis: 'PER_BAG', rate: 35 },
      { activity: 'STORAGE', basis: 'PER_TONNE_DAY', rate: 65 },
      { activity: 'HANDLING_OUT', basis: 'PER_BAG', rate: 35 },
      { activity: 'STUFFING', basis: 'PER_CONTAINER', rate: 9_500 }
    ],
    billingRuns: [],
    warrants: [{ id: 'wr1', number: num('WRT', 1), lotIds: ['lot16'], holder: 'Venus Tea Brokers', issued: d(-13), status: 'ISSUED', history: [h(d(-13), 10, JOHN, 'Warrant issued to the broker')] }],
    printJobs: [],
    schedules: [
      { id: 'rs1', report: 'Expiring lots', frequency: 'DAILY', recipients: 'Stores, Trading', lastRun: `${d(-1)}T06:00:00`, active: true },
      { id: 'rs2', report: 'QC hold alert', frequency: 'CONDITION', condition: { metric: 'HOLD_KG', op: '>', value: 1_000 }, recipients: 'Quality, Operations Manager', active: true },
      { id: 'rs3', report: 'Space occupation', frequency: 'WEEKLY', recipients: 'Operations Manager', lastRun: `${d(-8)}T06:00:00`, active: true }
    ],
    sensors: buildSensors(),
    setup: {
      uoms: {
        'BLK-25': [
          { code: 'kg', factor: 0.04 },
          { code: 'pallet', factor: 40 }
        ],
        'STD-24': [
          { code: 'pack', factor: 1 / 24 },
          { code: 'pallet', factor: 60 }
        ],
        'PRM-12': [{ code: 'pallet', factor: 80 }],
        'RAW-A': [{ code: 'kg', factor: 0.001 }]
      },
      attributes: {
        'BLK-25': { Grade: 'PF1', Origin: 'Kenya', Packaging: 'Multiwall paper sack', Season: `${year}/${Number(year.slice(2)) + 1}` },
        'STD-24': { Grade: 'BP1 blend', Origin: 'Kenya', Packaging: 'Carton of 24 × 500 g' },
        'PRM-12': { Grade: 'Orthodox FOP', Origin: 'Kenya', Packaging: 'Carton of 12 × 250 g' }
      },
      attributeDefs: [
        { key: 'Grade', label: 'Grade' },
        { key: 'Garden', label: 'Garden / mark' },
        { key: 'Season', label: 'Season' },
        { key: 'Origin', label: 'Origin' },
        { key: 'Packaging', label: 'Packaging' }
      ],
      msds: [
        { key: 'Bulk', title: 'Black tea (CTC) — bulk', revision: 'Rev 3', hazards: 'Combustible dust when finely divided. Not classified as hazardous under GHS.', handling: 'Keep dry (below 70% RH), away from odours and ignition sources. Stack max 8 bags high.', firstAid: 'Dust in eyes: rinse with water. Inhalation: move to fresh air.', updated: d(-200) },
        { key: 'PKG-FLM', title: 'Printed laminated film', revision: 'Rev 1', hazards: 'Flammable when exposed to open flame; releases irritating fumes when burning.', handling: 'Store away from heat; use forklift for rolls over 25 kg.', firstAid: 'Burns: cool with water and seek medical attention.', updated: d(-400) },
        { key: 'Packaging', title: 'Corrugated cartons and labels', revision: 'Rev 2', hazards: 'Combustible material.', handling: 'Keep dry; stack on pallets.', firstAid: 'None specific.', updated: d(-380) }
      ]
    },
    sequence: { TSK: 5, ASN: 3, TLY: mv, RMA: deliveries.length ? 1 : 0, LD: 8, WRT: 1, HU: hu, PCK: 0, LP: 0, PJ: 0, HUC: 0, WB: 0, VGM: 2 }
  };
};

/** Simulated IoT readings every three hours for the last day (no sensor hardware in this build). */
export const buildSensors = () => {
  const out: { warehouseId: string; at: string; tempC: number; humidity: number }[] = [];
  const base: Record<string, [number, number]> = { 'WH-CHG': [27, 64], 'WH-MSA': [29, 68], 'WH-NBO': [22, 55], 'WH-FAC': [24, 50] };
  for (const [wh, [t, hum]] of Object.entries(base))
    for (let i = 8; i >= 0; i--) {
      const wave = Math.sin((i + wh.length) * 0.9);
      out.push({ warehouseId: wh, at: `${d(i >= 5 ? -1 : 0)}T${String((24 + 6 - i * 3) % 24).padStart(2, '0')}:00:00`, tempC: Math.round((t + wave * 2) * 10) / 10, humidity: Math.round(hum + wave * 4 + (wh === 'WH-MSA' && i === 0 ? 6 : 0)) });
    }
  return out;
};
