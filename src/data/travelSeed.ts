/* Demo data for Travel & Petty Cash: per diem policy versions, trips, advances, petty cash and the float. */
import type { HREmployee } from '../types';
import { supervisorFor } from './leaveConfig';
import { addDays } from './hireEngine';
import {
  bandOf,
  estimateTrip,
  FINANCE_APPROVER,
  receiptsTotal,
  type DestClass,
  type FloatMove,
  type GradeBand,
  type Imprest,
  type PerDiemRate,
  type PerDiemSchedule,
  type ReceiptLine,
  type Settlement,
  type TransportMode,
  type TravelEvent,
  type TravelRequest,
  type TravelStatus
} from './travelEngine';

/* ------------------------------------------------------------------ per diem policy */

const BASE: Record<DestClass, [number, number, number][]> = {
  // accommodation / night, meals / day, incidentals / day — by band JG-01–04 … JG-13+
  CITY: [
    [4_500, 2_500, 1_000],
    [7_000, 3_500, 1_500],
    [10_000, 4_500, 2_000],
    [15_000, 6_000, 3_000]
  ],
  TOWN: [
    [3_000, 2_000, 800],
    [5_000, 2_800, 1_200],
    [7_500, 3_500, 1_500],
    [11_000, 4_500, 2_500]
  ],
  // USD
  INTL: [
    [120, 50, 20],
    [160, 60, 25],
    [220, 80, 30],
    [300, 100, 40]
  ]
};
const BANDS: GradeBand[] = ['JG-01–04', 'JG-05–08', 'JG-09–12', 'JG-13+'];

const ratesFrom = (factor: number): PerDiemRate[] =>
  (Object.keys(BASE) as DestClass[]).flatMap((dest) =>
    BASE[dest].map(([a, m, i], k) => {
      const r = (n: number) => (dest === 'INTL' ? Math.round(n * factor) : Math.round((n * factor) / 50) * 50);
      return { band: BANDS[k], dest, accommodation: r(a), meals: r(m), incidentals: r(i) };
    })
  );

export const PER_DIEM_SEED: PerDiemSchedule[] = [
  {
    id: 'PDR-2025-07',
    effectiveFrom: '2025-07-01',
    fxUsdKes: 129,
    rates: ratesFrom(0.9),
    mileage: { 'JG-01–04': 22, 'JG-05–08': 27, 'JG-09–12': 32, 'JG-13+': 36 },
    note: 'FY2025/26 travel policy',
    savedBy: 'David Otieno',
    savedOn: '2025-06-20'
  },
  {
    id: 'PDR-2026-07',
    effectiveFrom: '2026-07-01',
    fxUsdKes: 129.5,
    rates: ratesFrom(1),
    mileage: { 'JG-01–04': 25, 'JG-05–08': 30, 'JG-09–12': 35, 'JG-13+': 40 },
    note: 'FY2026/27 — approved by the Finance Director, rates up about 10%',
    savedBy: 'David Otieno',
    savedOn: '2026-06-24'
  }
];

/* ------------------------------------------------------------------ trips */

interface TripSeed {
  id: string;
  orgId?: string;
  staffId: string;
  purpose: string;
  destinations: string;
  destClass: DestClass;
  departDate: string;
  returnDate: string;
  transport: TransportMode;
  km?: number;
  fares?: number;
  status: TravelStatus;
  createdOn: string;
  /** Advance requested; defaults to the estimate rounded up to KES 100 */
  advance?: number;
  declineNote?: string;
}

const TRIPS: TripSeed[] = [
  {
    id: 'TRV-2026-024',
    staffId: 'KHE-0152',
    purpose: 'Mombasa tea auction (sale 36) and broker meetings',
    destinations: 'Mombasa',
    destClass: 'CITY',
    departDate: '2026-09-07',
    returnDate: '2026-09-10',
    transport: 'AIR',
    fares: 28_000,
    status: 'CLOSED',
    createdOn: '2026-08-28'
  },
  {
    id: 'TRV-2026-026',
    orgId: 'org-nairobi',
    staffId: 'KHE-0288',
    purpose: 'Mombasa auction — meet key account buyers',
    destinations: 'Mombasa',
    destClass: 'CITY',
    departDate: '2026-10-12',
    returnDate: '2026-10-15',
    transport: 'AIR',
    fares: 26_000,
    status: 'MANAGER_APPROVED',
    createdOn: '2026-10-02'
  },
  {
    id: 'TRV-2026-027',
    staffId: 'KHE-0171',
    purpose: "DOSH safety officers' refresher course",
    destinations: 'Nairobi',
    destClass: 'CITY',
    departDate: '2026-09-15',
    returnDate: '2026-09-18',
    transport: 'COMPANY_CAR',
    status: 'SURRENDERED',
    createdOn: '2026-09-03'
  },
  {
    id: 'TRV-2026-029',
    staffId: 'KHE-0276',
    purpose: 'KEBS tea sample testing and lab audit',
    destinations: 'Mombasa',
    destClass: 'CITY',
    departDate: '2026-09-21',
    returnDate: '2026-09-25',
    transport: 'BUS',
    fares: 4_800,
    status: 'TRAVELLED',
    createdOn: '2026-09-11'
  },
  {
    id: 'TRV-2026-030',
    staffId: 'KHE-0263',
    purpose: 'Stock-take at the Kisumu depot',
    destinations: 'Kisumu',
    destClass: 'TOWN',
    departDate: '2026-10-01',
    returnDate: '2026-10-03',
    transport: 'BUS',
    fares: 1_600,
    status: 'DECLINED',
    createdOn: '2026-09-22',
    declineNote: 'Depot count moved to November so it can be done with the auditors.'
  },
  {
    id: 'TRV-2026-031',
    staffId: 'KHE-0270',
    purpose: 'Collect withering fan motors from the supplier and inspect rewinds',
    destinations: 'Nakuru',
    destClass: 'TOWN',
    departDate: '2026-10-06',
    returnDate: '2026-10-09',
    transport: 'COMPANY_CAR',
    status: 'ADVANCE_PAID',
    createdOn: '2026-09-29'
  },
  {
    id: 'TRV-2026-032',
    staffId: 'KHE-0178',
    purpose: 'East Africa ICT in Agriculture summit',
    destinations: 'Kigali, Rwanda',
    destClass: 'INTL',
    departDate: '2026-10-19',
    returnDate: '2026-10-23',
    transport: 'AIR',
    status: 'FINANCE_APPROVED',
    createdOn: '2026-09-30'
  },
  {
    id: 'TRV-2026-033',
    staffId: 'KHE-0160',
    purpose: 'KTDA and Tea Board meetings on green leaf pricing',
    destinations: 'Nairobi',
    destClass: 'CITY',
    departDate: '2026-10-14',
    returnDate: '2026-10-16',
    transport: 'OWN_CAR',
    km: 520,
    status: 'MANAGER_APPROVED',
    createdOn: '2026-10-03'
  },
  {
    id: 'TRV-2026-034',
    staffId: 'KHE-0244',
    purpose: 'Mombasa tea auction (sale 41) and buyer visits',
    destinations: 'Mombasa',
    destClass: 'CITY',
    departDate: '2026-10-19',
    returnDate: '2026-10-22',
    transport: 'AIR',
    fares: 24_500,
    status: 'SUBMITTED',
    createdOn: '2026-10-06'
  },
  {
    id: 'TRV-2026-035',
    staffId: 'KHE-0280',
    purpose: 'Fibre link handover with the internet provider',
    destinations: 'Nairobi',
    destClass: 'CITY',
    departDate: '2026-10-13',
    returnDate: '2026-10-14',
    transport: 'BUS',
    fares: 3_000,
    status: 'SUBMITTED',
    createdOn: '2026-10-07'
  },
  {
    id: 'TRV-2026-036',
    staffId: 'KHE-0251',
    purpose: 'Visit fertiliser suppliers ahead of the short rains',
    destinations: 'Eldoret, Kitale',
    destClass: 'TOWN',
    departDate: '2026-10-27',
    returnDate: '2026-10-28',
    transport: 'COMPANY_CAR',
    status: 'DRAFT',
    createdOn: '2026-10-08'
  }
];

/* ------------------------------------------------------------------ petty cash and imprest */

interface CashSeed {
  id: string;
  staffId: string;
  kind: 'STANDALONE' | 'PETTY_CASH';
  purpose: string;
  amount: number;
  requestedOn: string;
  status: Imprest['status'];
  paidOn?: string;
  lines?: ReceiptLine[];
  settlement?: Settlement;
  /** Request lines: [item, category, quantity, unit cost] — must add up to amount */
  items?: [string, string, number, number][];
}

const CASH: CashSeed[] = [
  {
    id: 'PC-2026-104',
    staffId: 'KHE-0187',
    kind: 'PETTY_CASH',
    purpose: 'Courier of KRA documents to Nairobi',
    amount: 1_800,
    requestedOn: '2026-09-11',
    status: 'SURRENDERED',
    paidOn: '2026-09-12',
    lines: [{ date: '2026-09-12', description: 'G4S courier — Kericho to Nairobi', amount: 1_800, receiptNo: 'G4S-558120' }],
    settlement: 'NONE'
  },
  {
    id: 'PC-2026-108',
    staffId: 'KHE-0263',
    kind: 'PETTY_CASH',
    purpose: 'Padlocks and stationery for the main store',
    amount: 2_800,
    requestedOn: '2026-09-21',
    status: 'SURRENDERED',
    paidOn: '2026-09-22',
    lines: [
      { date: '2026-09-22', description: 'Two padlocks (Solex)', amount: 1_700, receiptNo: 'KHW-20931' },
      { date: '2026-09-22', description: 'Bin cards and marker pens', amount: 950, receiptNo: 'TXT-7714' }
    ],
    settlement: 'CASH_REFUND'
  },
  { id: 'PC-2026-112', staffId: 'KHE-0301', kind: 'PETTY_CASH', purpose: 'Car wash and parking — Kericho–Kisumu run', amount: 2_400, requestedOn: '2026-10-07', status: 'PAID', paidOn: '2026-10-07' },
  { id: 'PC-2026-113', staffId: 'KHE-0303', kind: 'PETTY_CASH', purpose: 'Puncture repair and wheel balancing, KCX 412T', amount: 3_200, requestedOn: '2026-10-07', status: 'APPROVED', items: [['Puncture repair', 'Repairs & maintenance', 1, 800], ['Wheel balancing', 'Repairs & maintenance', 4, 450], ['Tyre valves', 'Repairs & maintenance', 2, 300]] },
  { id: 'PC-2026-114', staffId: 'KHE-0251', kind: 'PETTY_CASH', purpose: 'Cleaning supplies for the staff canteen', amount: 6_500, requestedOn: '2026-10-08', status: 'PENDING', items: [['Detergent, 20 L', 'Cleaning & sanitation', 2, 1_500], ['Disinfectant, 5 L', 'Cleaning & sanitation', 2, 850], ['Mops and buckets', 'Cleaning & sanitation', 3, 400], ['Rubber gloves (pairs)', 'Cleaning & sanitation', 12, 50]] },
  { id: 'IMP-2026-029', staffId: 'KHE-0302', kind: 'STANDALONE', purpose: 'Fleet licensing and NTSA inspection fees', amount: 18_000, requestedOn: '2026-09-08', status: 'PAID', paidOn: '2026-09-10' },
  {
    id: 'IMP-2026-033',
    staffId: 'KHE-0160',
    kind: 'STANDALONE',
    purpose: "Smallholder farmers' field day at Kapsoit — tents and refreshments",
    amount: 35_000,
    items: [
      ['Tent hire', 'Other', 2, 9_000],
      ['Plastic chairs hire', 'Other', 100, 60],
      ['Tea and snacks (per person)', 'Meals & refreshments', 150, 60],
      ['PA system hire', 'Other', 1, 2_000]
    ],
    requestedOn: '2026-09-29',
    status: 'PAID',
    paidOn: '2026-10-01'
  }
];

/** Travel advances: imprest id, when paid, and how the surrender went (unspent > 0, overspent < 0). */
const ADVANCES: Record<string, { id: string; paidOn: string; variance?: number; settlement?: Settlement; payrollPeriod?: string }> = {
  'TRV-2026-024': { id: 'IMP-2026-031', paidOn: '2026-09-04', variance: -3_400, settlement: 'PAYROLL_REIMBURSE', payrollPeriod: '2026-09' },
  'TRV-2026-027': { id: 'IMP-2026-034', paidOn: '2026-09-12', variance: 2_650, settlement: 'CASH_REFUND' },
  'TRV-2026-029': { id: 'IMP-2026-036', paidOn: '2026-09-18' },
  'TRV-2026-031': { id: 'IMP-2026-039', paidOn: '2026-10-05' },
  'TRV-2026-032': { id: 'IMP-2026-040', paidOn: '' }
};

export const FLOAT_LIMITS: Record<string, number> = { 'org-kericho': 50_000, 'org-nairobi': 30_000 };
export const DEFAULT_FLOAT_LIMIT = 30_000;

const up100 = (n: number) => Math.ceil(n / 100) * 100;

/** Splits a spend into believable receipts. */
const tripReceipts = (t: TripSeed, spent: number): ReceiptLine[] => {
  const hotel = Math.round(spent * 0.55);
  const meals = Math.round(spent * 0.3);
  return [
    { date: t.departDate, description: `Hotel, ${t.destinations}`, amount: hotel, receiptNo: `HTL-${t.id.slice(-3)}1` },
    { date: t.departDate, description: 'Meals', amount: meals, receiptNo: `RST-${t.id.slice(-3)}2` },
    { date: t.returnDate, description: 'Taxis and incidentals', amount: spent - hotel - meals, receiptNo: `TXI-${t.id.slice(-3)}3` }
  ];
};

export interface TravelSeed {
  requests: TravelRequest[];
  imprests: Imprest[];
  floatMoves: FloatMove[];
}

/** Builds the seed against the employee master so estimates and approvers match the live data. */
export const buildTravelSeed = (emps: HREmployee[]): TravelSeed => {
  const byId = new Map(emps.map((e) => [e.staffId, e]));
  const name = (id?: string) => (id ? (byId.get(id)?.fullName ?? id) : 'Approver');
  const finance = name(FINANCE_APPROVER);
  const requests: TravelRequest[] = [];
  const imprests: Imprest[] = [];

  for (const t of TRIPS) {
    const e = byId.get(t.staffId);
    if (!e) continue;
    const orgId = t.orgId ?? e.orgId;
    const mgr = supervisorFor(e, emps);
    const estimate = estimateTrip(t, bandOf(e), PER_DIEM_SEED);
    const advance = t.advance ?? (t.transport === 'AIR' ? up100(estimate.total - estimate.fares) : up100(estimate.total));
    const order: TravelStatus[] = ['DRAFT', 'SUBMITTED', 'MANAGER_APPROVED', 'FINANCE_APPROVED', 'ADVANCE_PAID', 'TRAVELLED', 'SURRENDERED', 'CLOSED'];
    const reached = (s: TravelStatus) => t.status !== 'DECLINED' && order.indexOf(t.status) >= order.indexOf(s);
    const adv = ADVANCES[t.id];
    const events: TravelEvent[] = [{ at: t.createdOn, by: e.fullName, action: 'Request created' }];
    if (t.status !== 'DRAFT') events.push({ at: t.createdOn, by: e.fullName, action: 'Submitted to line manager' });
    if (t.status === 'DECLINED') events.push({ at: addDays(t.createdOn, 1), by: name(mgr?.staffId), action: 'Declined by line manager', comment: t.declineNote });
    if (reached('MANAGER_APPROVED')) events.push({ at: addDays(t.createdOn, 1), by: name(mgr?.staffId), action: 'Approved by line manager' });
    if (reached('FINANCE_APPROVED')) events.push({ at: addDays(t.createdOn, 2), by: finance, action: `Approved by Finance — advance KES ${advance.toLocaleString()}, per diem in cash` });
    if (reached('ADVANCE_PAID') && adv) events.push({ at: adv.paidOn, by: finance, action: `Advance ${adv.id} paid by bank transfer` });
    if (reached('TRAVELLED')) events.push({ at: t.returnDate, by: e.fullName, action: 'Back from the trip' });

    const req: TravelRequest = {
      id: t.id,
      orgId,
      staffId: t.staffId,
      purpose: t.purpose,
      destinations: t.destinations,
      destClass: t.destClass,
      departDate: t.departDate,
      returnDate: t.returnDate,
      transport: t.transport,
      km: t.km,
      fares: t.fares,
      estimate,
      advanceRequested: advance,
      advanceApproved: reached('FINANCE_APPROVED') ? advance : undefined,
      perDiemVia: reached('FINANCE_APPROVED') ? 'CASH' : undefined,
      managerId: mgr?.staffId,
      status: t.status,
      createdOn: t.createdOn,
      events
    };

    if (adv) {
      req.imprestId = adv.id;
      const paid = reached('ADVANCE_PAID');
      const imp: Imprest = {
        id: adv.id,
        orgId,
        staffId: t.staffId,
        kind: 'TRAVEL',
        travelId: t.id,
        purpose: `Travel advance — ${t.purpose}`,
        costCentre: e.department,
        amount: advance,
        requestedOn: t.createdOn,
        approverId: FINANCE_APPROVER,
        status: paid ? 'PAID' : 'APPROVED',
        paidOn: paid ? adv.paidOn : undefined,
        paidFrom: 'BANK',
        dueOn: addDays(t.returnDate, 7),
        events: [{ at: addDays(t.createdOn, 2), by: finance, action: 'Advance approved with the travel request' }, ...(paid ? [{ at: adv.paidOn, by: finance, action: 'Paid by bank transfer' }] : [])]
      };
      if (adv.settlement && adv.variance !== undefined) {
        const spent = advance - adv.variance;
        const on = addDays(t.returnDate, 3);
        imp.status = 'SURRENDERED';
        imp.surrender = {
          on,
          by: e.fullName,
          lines: tripReceipts(t, spent),
          spent,
          variance: adv.variance,
          settlement: adv.settlement,
          overspendApproved: adv.variance < 0 ? true : undefined,
          payrollRef: adv.settlement.startsWith('PAYROLL') ? t.id : undefined,
          payrollPeriod: adv.payrollPeriod
        };
        imp.events.push({ at: on, by: e.fullName, action: `Surrendered — spent KES ${spent.toLocaleString()}` });
        req.events.push({
          at: on,
          by: e.fullName,
          action: `Advance surrendered (${adv.variance > 0 ? `KES ${adv.variance.toLocaleString()} refunded in cash` : `overspend KES ${(-adv.variance).toLocaleString()} reimbursed through payroll`})`
        });
        if (t.status === 'CLOSED') req.events.push({ at: addDays(on, 2), by: finance, action: 'Trip closed' });
      }
      imprests.push(imp);
    }
    requests.push(req);
  }

  for (const c of CASH) {
    const e = byId.get(c.staffId);
    if (!e) continue;
    const approver = supervisorFor(e, emps)?.staffId;
    const fromFloat = c.kind === 'PETTY_CASH';
    const imp: Imprest = {
      id: c.id,
      orgId: e.orgId,
      staffId: c.staffId,
      kind: c.kind,
      purpose: c.purpose,
      costCentre: e.department,
      amount: c.amount,
      requestedOn: c.requestedOn,
      approverId: approver,
      status: c.status,
      paidOn: c.paidOn,
      paidFrom: c.paidOn ? (fromFloat ? 'FLOAT' : 'BANK') : undefined,
      dueOn: c.paidOn ? addDays(c.paidOn, fromFloat ? 3 : 14) : undefined,
      requestedAmount: c.amount,
      lines: c.items?.map(([description, category, quantity, unitCost]) => ({ description, category, costCentre: e.department, quantity, unitCost, amount: quantity * unitCost, approved: c.status === 'PENDING' ? undefined : quantity * unitCost })),
      events: [{ at: c.requestedOn, by: e.fullName, action: 'Requested' }]
    };
    if (c.status !== 'PENDING') imp.events.push({ at: c.requestedOn, by: name(approver), action: 'Approved' });
    if (c.paidOn) imp.events.push({ at: c.paidOn, by: 'Grace Wanjiku', action: fromFloat ? 'Paid from the petty cash float' : 'Paid by bank transfer' });
    if (c.lines && c.settlement) {
      const spent = receiptsTotal(c.lines);
      imp.surrender = { on: c.paidOn ?? c.requestedOn, by: e.fullName, lines: c.lines, spent, variance: c.amount - spent, settlement: c.settlement };
      imp.events.push({ at: imp.surrender.on, by: e.fullName, action: `Receipts handed in — spent KES ${spent.toLocaleString()}` });
    }
    imprests.push(imp);
  }

  // Float: opening balance, then every petty cash payment and refund above
  const floatMoves: FloatMove[] = Object.entries(FLOAT_LIMITS).map(([orgId, limit]) => ({
    id: `FM-${orgId}-0`,
    orgId,
    on: '2026-09-01',
    kind: 'OPENING',
    amount: limit,
    ref: 'Opening float',
    by: 'David Otieno'
  }));
  imprests
    .filter((i) => i.paidFrom === 'FLOAT' && i.paidOn)
    .forEach((i) => {
      floatMoves.push({ id: `FM-${i.id}`, orgId: i.orgId, on: i.paidOn!, kind: 'ISSUE', amount: i.amount, ref: i.id, by: 'Grace Wanjiku', note: i.purpose });
      if (i.surrender && i.surrender.variance > 0)
        floatMoves.push({ id: `FM-${i.id}-R`, orgId: i.orgId, on: i.surrender.on, kind: 'REFUND', amount: i.surrender.variance, ref: i.id, by: 'Grace Wanjiku', note: 'Change returned' });
    });

  return { requests, imprests, floatMoves };
};
