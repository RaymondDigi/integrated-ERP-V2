import { addDays, TODAY } from '../finance/engine';
import type { FinanceState, HistoryEntry } from '../finance/types';
import type {
  Activity,
  ComActor,
  ComRole,
  CommercialState,
  Delivery,
  GoodsReceipt,
  Opportunity,
  OrderLine,
  POLine,
  Product,
  PurchaseOrder,
  Quotation,
  Requisition,
  SalesOrder,
  Stage
} from './types';

export const COM_ACTORS: Record<ComRole, ComActor> = {
  OFFICER: { role: 'OFFICER', name: 'Peter Mwangi', title: 'Commercial Officer' },
  STOREKEEPER: { role: 'STOREKEEPER', name: 'John Kiprop', title: 'Stores & Dispatch' },
  MANAGER: { role: 'MANAGER', name: 'Lucy Njeri', title: 'Commercial Manager' },
  DIRECTOR: { role: 'DIRECTOR', name: 'Amina Hassan', title: 'Finance Director' }
};

export const PRODUCTS: Product[] = [
  { sku: 'STD-24', name: 'Standard pack — carton of 24', kind: 'GOODS', category: 'Core range', unit: 'cartons', price: 4_800, cost: 3_100, stock: 640, reorderLevel: 300, reorderQty: 600, vatable: true, account: '4000' },
  { sku: 'PRM-12', name: 'Premium range — carton of 12', kind: 'GOODS', category: 'Premium', unit: 'cartons', price: 7_200, cost: 4_300, stock: 210, reorderLevel: 150, reorderQty: 300, vatable: true, account: '4000' },
  { sku: 'GFT-06', name: 'Gift box — set of 6', kind: 'GOODS', category: 'Premium', unit: 'boxes', price: 5_400, cost: 3_000, stock: 95, reorderLevel: 120, reorderQty: 250, vatable: true, account: '4000' },
  { sku: 'BLK-25', name: 'Bulk sack — 25 kg', kind: 'GOODS', category: 'Bulk', unit: 'sacks', price: 9_500, cost: 6_400, stock: 380, reorderLevel: 150, reorderQty: 300, vatable: true, account: '4000' },
  { sku: 'ORG-12', name: 'Organic line — carton of 12', kind: 'GOODS', category: 'Premium', unit: 'cartons', price: 8_600, cost: 5_200, stock: 60, reorderLevel: 80, reorderQty: 200, vatable: true, account: '4000' },
  { sku: 'SMP-50', name: 'Sample sachets — box of 50', kind: 'GOODS', category: 'Marketing', unit: 'boxes', price: 1_500, cost: 600, stock: 900, reorderLevel: 200, reorderQty: 500, vatable: true, account: '4000' },
  { sku: 'SRV-INS', name: 'Installation & commissioning', kind: 'SERVICE', category: 'Services', unit: 'jobs', price: 85_000, cost: 0, stock: 0, reorderLevel: 0, reorderQty: 0, vatable: true, account: '4000' },
  { sku: 'SRV-AMC', name: 'Annual maintenance contract', kind: 'SERVICE', category: 'Services', unit: 'contracts', price: 240_000, cost: 0, stock: 0, reorderLevel: 0, reorderQty: 0, vatable: true, account: '4000' },
  { sku: 'SRV-TRN', name: 'Staff training (per day)', kind: 'SERVICE', category: 'Services', unit: 'days', price: 65_000, cost: 0, stock: 0, reorderLevel: 0, reorderQty: 0, vatable: true, account: '4000' },
  { sku: 'PKG-BOX', name: 'Corrugated cartons — bundle of 100', kind: 'MATERIAL', category: 'Packaging', unit: 'bundles', price: 0, cost: 6_500, stock: 140, reorderLevel: 200, reorderQty: 400, vatable: true, account: '5000', preferredSupplier: 's6' },
  { sku: 'PKG-FLM', name: 'Printed film roll', kind: 'MATERIAL', category: 'Packaging', unit: 'rolls', price: 0, cost: 18_000, stock: 22, reorderLevel: 15, reorderQty: 30, vatable: true, account: '5000', preferredSupplier: 's6' },
  { sku: 'PKG-LBL', name: 'Labels — roll of 5,000', kind: 'MATERIAL', category: 'Packaging', unit: 'rolls', price: 0, cost: 4_200, stock: 80, reorderLevel: 60, reorderQty: 120, vatable: true, account: '5000', preferredSupplier: 's12' },
  { sku: 'RAW-A', name: 'Raw material grade A (tonne)', kind: 'MATERIAL', category: 'Raw materials', unit: 'tonnes', price: 0, cost: 85_000, stock: 12, reorderLevel: 10, reorderQty: 20, vatable: false, account: '5000', preferredSupplier: 's11' },
  { sku: 'SPR-GEN', name: 'Generator service kit', kind: 'MATERIAL', category: 'Spares', unit: 'kits', price: 0, cost: 46_000, stock: 2, reorderLevel: 2, reorderQty: 4, vatable: true, account: '6400', preferredSupplier: 's8' },
  { sku: 'OFC-PPR', name: 'Office paper (box of 5 reams)', kind: 'MATERIAL', category: 'Office', unit: 'boxes', price: 0, cost: 2_800, stock: 30, reorderLevel: 20, reorderQty: 40, vatable: true, account: '6600', preferredSupplier: 's7' }
];

const { OFFICER: peter, STOREKEEPER: john, MANAGER: lucy, DIRECTOR: amina } = COM_ACTORS;
const d = (offset: number) => addDays(TODAY, offset);
const at = (date: string, h: number) => `${date}T${String(h).padStart(2, '0')}:15:00`;
let lid = 0;
const id = (p: string) => `${p}${++lid}`;
const year = TODAY.slice(0, 4);
const num = (prefix: string, n: number) => `${prefix}-${year}-${String(n).padStart(4, '0')}`;
const price = (sku: string) => PRODUCTS.find((p) => p.sku === sku)!;

const line = (sku: string, qty: number, discountPct = 0, delivered = 0, invoiced = 0): OrderLine => ({
  id: id('ol'),
  sku,
  description: price(sku).name,
  qty,
  price: price(sku).price,
  discountPct,
  delivered,
  invoiced
});
const pline = (sku: string, qty: number, unit: number, received = 0, billed = 0): POLine => ({
  id: id('pl'),
  sku,
  description: price(sku).name,
  qty,
  price: unit,
  discountPct: 0,
  received,
  billed
});

const approvedTrail = (date: string, by = peter.name, big = false): { history: HistoryEntry[]; approvals: { by: string; role: ComRole; at: string }[] } => {
  const approvals: { by: string; role: ComRole; at: string }[] = [{ by: lucy.name, role: 'MANAGER', at: at(date, 14) }];
  const history: HistoryEntry[] = [
    { at: at(date, 9), by, action: 'Created' },
    { at: at(date, 10), by, action: 'Submitted for approval' },
    { at: at(date, 14), by: lucy.name, action: 'Approved' }
  ];
  if (big) {
    approvals.push({ by: amina.name, role: 'DIRECTOR', at: at(date, 16) });
    history.push({ at: at(date, 16), by: amina.name, action: 'Approved (director)' });
  }
  return { history, approvals };
};

export const buildCommercialSeed = (fin: FinanceState): CommercialState => {
  lid = 0;
  const invoicesOf = (customerId: string) =>
    fin.documents.filter((x) => x.kind === 'INVOICE' && x.partyId === customerId && x.status === 'POSTED').sort((a, b) => b.date.localeCompare(a.date));
  const billsOf = (supplierId: string) =>
    fin.documents.filter((x) => x.kind === 'BILL' && x.partyId === supplierId && x.status === 'POSTED').sort((a, b) => b.date.localeCompare(a.date));

  /* ---------------- Sales orders and deliveries ---------------- */
  const orders: SalesOrder[] = [];
  const deliveries: Delivery[] = [];
  let soN = 0;
  let dnN = 0;
  const order = (
    customerId: string,
    offset: number,
    lines: OrderLine[],
    state: 'COMPLETED' | 'TO_INVOICE' | 'PART' | 'TO_DISPATCH' | 'APPROVAL' | 'DRAFT',
    extra: Partial<SalesOrder> = {}
  ) => {
    const date = d(offset);
    const big = lines.reduce((s, l) => s + l.qty * l.price, 0) * 1.16 > 1_000_000;
    const o: SalesOrder = {
      id: id('so'),
      number: num('SO', ++soN),
      customerId,
      date,
      requiredBy: d(offset + 7),
      customerRef: `LPO ${40000 + soN * 37}`,
      deliveryAddress: '',
      lines,
      invoices: [],
      notes: '',
      status: 'APPROVED',
      preparedBy: peter.name,
      ...(state === 'DRAFT'
        ? { status: 'DRAFT', approvals: [], history: [{ at: at(date, 9), by: peter.name, action: 'Created' }] }
        : state === 'APPROVAL'
          ? {
              status: 'SUBMITTED',
              approvals: [],
              history: [
                { at: at(date, 9), by: peter.name, action: 'Created' },
                { at: at(date, 10), by: peter.name, action: 'Submitted for approval' }
              ]
            }
          : approvedTrail(date, peter.name, big)),
      ...extra
    } as SalesOrder;
    if (state === 'COMPLETED' || state === 'TO_INVOICE' || state === 'PART') {
      const dDate = d(offset + 2);
      const dl: Delivery = {
        id: id('dn'),
        number: num('DN', ++dnN),
        orderId: o.id,
        date: dDate,
        lines: o.lines.filter((l) => l.delivered > 0).map((l) => ({ lineId: l.id, qty: l.delivered })),
        vehicle: ['KCA 512Q', 'KDB 220T', 'KCY 908M'][dnN % 3],
        driver: ['Samuel Ouma', 'Joseph Mutua', 'Ali Bakari'][dnN % 3],
        dispatchedBy: john.name,
        status: 'DELIVERED',
        receivedBy: 'Stores clerk',
        deliveredAt: at(dDate, 15)
      };
      deliveries.push(dl);
      o.history.push({ at: at(dDate, 8), by: john.name, action: `Dispatched ${dl.number}` });
    }
    if (state === 'COMPLETED') {
      const inv = invoicesOf(customerId)[0];
      if (inv) o.invoices.push({ id: inv.id, number: inv.number });
      o.history.push({ at: at(d(offset + 3), 11), by: peter.name, action: `Invoiced${inv ? ` — ${inv.number}` : ''}` });
      o.closed = true;
    }
    orders.push(o);
    return o;
  };

  order('c1', -58, [line('STD-24', 120, 0, 120, 120), line('SMP-50', 40, 0, 40, 40)], 'COMPLETED');
  order('c7', -51, [line('STD-24', 200, 5, 200, 200), line('BLK-25', 60, 5, 60, 60)], 'COMPLETED');
  order('c2', -44, [line('PRM-12', 45, 0, 45, 45), line('GFT-06', 60, 0, 60, 60)], 'COMPLETED');
  order('c4', -37, [line('BLK-25', 90, 0, 90, 90), line('STD-24', 80, 0, 80, 80)], 'COMPLETED');
  order('c3', -30, [line('SRV-AMC', 1, 0, 1, 1), line('SRV-TRN', 2, 0, 2, 2)], 'COMPLETED');
  order('c6', -16, [line('STD-24', 150, 0, 150, 0), line('ORG-12', 40, 0, 40, 0)], 'TO_INVOICE');
  order('c5', -12, [line('PRM-12', 30, 0, 30, 0), line('SMP-50', 20, 0, 20, 0)], 'TO_INVOICE');
  order('c7', -9, [line('STD-24', 260, 5, 160, 0), line('BLK-25', 40, 5, 40, 0)], 'PART', { notes: 'Balance of standard packs to follow next week' });
  order('c2', -4, [line('GFT-06', 70, 0), line('PRM-12', 25, 0)], 'TO_DISPATCH', { requiredBy: d(1) });
  order('c1', -2, [line('STD-24', 180, 0), line('SRV-INS', 1, 0)], 'TO_DISPATCH', { requiredBy: d(0) });
  order('c4', -1, [line('BLK-25', 140, 12), line('STD-24', 120, 12)], 'APPROVAL', { notes: 'Volume discount requested for the coast expansion' });
  order('c6', 0, [line('ORG-12', 30, 0), line('SMP-50', 30, 0)], 'DRAFT');

  /* ---------------- Quotations ---------------- */
  const quotations: Quotation[] = [];
  let qN = 0;
  const quote = (customerId: string, offset: number, lines: OrderLine[], status: Quotation['status'], extra: Partial<Quotation> = {}) => {
    const date = d(offset);
    const q: Quotation = {
      id: id('qt'),
      number: num('QT', ++qN),
      customerId,
      date,
      validUntil: d(offset + 30),
      lines: lines.map(({ delivered: _d, invoiced: _i, ...l }) => l),
      status,
      preparedBy: peter.name,
      notes: '',
      history: [
        { at: at(date, 9), by: peter.name, action: 'Created' },
        ...(status !== 'DRAFT' ? [{ at: at(date, 11), by: peter.name, action: 'Sent to customer' }] : [])
      ],
      ...extra
    };
    if (status === 'ACCEPTED') q.history.push({ at: at(d(offset + 4), 10), by: peter.name, action: 'Accepted by customer' });
    if (status === 'LOST') q.history.push({ at: at(d(offset + 6), 10), by: peter.name, action: 'Marked as lost', note: extra.lostReason });
    quotations.push(q);
    return q;
  };
  quote('c1', -62, [line('STD-24', 120), line('SMP-50', 40)], 'ACCEPTED', { orderId: orders[0].id });
  quote('c2', -48, [line('PRM-12', 45), line('GFT-06', 60)], 'ACCEPTED', { orderId: orders[2].id });
  quote('c8', -40, [line('BLK-25', 400)], 'LOST', { lostReason: 'Price — competitor offered 8% lower FOB' });
  quote('c5', -35, [line('SRV-AMC', 1)], 'EXPIRED');
  quote('c4', -6, [line('BLK-25', 140, 12), line('STD-24', 120, 12)], 'ACCEPTED', { orderId: orders[10].id });
  quote('c3', -5, [line('SRV-INS', 2), line('SRV-TRN', 3)], 'SENT');
  quote('c6', -27, [line('ORG-12', 80), line('GFT-06', 40)], 'SENT');
  quote('c8', -3, [line('BLK-25', 600, 4)], 'SENT', { notes: 'Export pricing, FOB Mombasa' });
  quote('c7', -1, [line('PRM-12', 60), line('GFT-06', 90)], 'ACCEPTED');
  quote('c2', 0, [line('SRV-TRN', 2)], 'DRAFT');
  quotations[6].validUntil = d(3);

  /* ---------------- Requisitions ---------------- */
  const requisitions: Requisition[] = [];
  let rqN = 0;
  const req = (
    department: string,
    requestedBy: string,
    offset: number,
    lines: [string, number, number][],
    justification: string,
    status: Requisition['status'],
    extra: Partial<Requisition> = {}
  ) => {
    const date = d(offset);
    const r: Requisition = {
      id: id('rq'),
      number: num('PR', ++rqN),
      department,
      requestedBy,
      date,
      neededBy: d(offset + 14),
      justification,
      lines: lines.map(([sku, qty, est]) => ({ id: id('rl'), sku, description: price(sku).name, qty, estPrice: est })),
      quotes: [],
      status,
      preparedBy: peter.name,
      approvals: [],
      history: [{ at: at(date, 9), by: peter.name, action: `Raised for ${requestedBy}` }],
      ...extra
    };
    if (status !== 'DRAFT') r.history.push({ at: at(date, 10), by: peter.name, action: 'Submitted for approval' });
    if (status === 'APPROVED') {
      const big = r.lines.reduce((s, l) => s + l.qty * l.estPrice, 0) > 1_000_000;
      const t = approvedTrail(date, peter.name, big);
      r.approvals = t.approvals;
      r.history.push(...t.history.slice(2));
    }
    if (status === 'REJECTED') r.history.push({ at: at(d(offset + 1), 11), by: lucy.name, action: 'Rejected', note: 'Use the existing stock in the Mombasa store first' });
    requisitions.push(r);
    return r;
  };
  const r1 = req('Operations', 'Production Manager', -50, [['PKG-BOX', 300, 6_500], ['PKG-FLM', 20, 18_000]], 'Packaging for the Q3 production plan', 'APPROVED');
  const r2 = req('Operations', 'Production Manager', -33, [['RAW-A', 18, 85_000]], 'Raw material for October batches', 'APPROVED');
  const r3 = req('Operations', 'Maintenance Lead', -20, [['SPR-GEN', 3, 46_000]], 'Quarterly generator service', 'APPROVED');
  const r4 = req('Operations', 'Production Manager', -8, [['PKG-BOX', 400, 6_500], ['PKG-LBL', 120, 4_200]], 'Cartons and labels are below reorder level', 'APPROVED');
  req('Administration', 'Office Administrator', -3, [['OFC-PPR', 40, 2_800]], 'Paper for the finance and HR offices', 'APPROVED');
  req('Operations', 'Production Manager', -2, [['RAW-A', 16, 85_000]], 'Raw material for the November plan — prices rising', 'SUBMITTED');
  req('Sales', 'Sales Manager', -1, [['PKG-LBL', 30, 4_200]], 'Promotional labels for the coast launch', 'SUBMITTED');
  req('ICT', 'ICT Officer', -12, [['OFC-PPR', 10, 2_800]], 'Printer paper for the server room', 'REJECTED');
  req('Operations', 'Warehouse Supervisor', 0, [['PKG-FLM', 10, 18_000]], 'Spare film for the new line', 'DRAFT');

  // Supplier quotes collected for the carton and label requisition, waiting for an award
  r4.quotes = [
    { supplierId: 's6', prices: { [r4.lines[0].id]: 6_450, [r4.lines[1].id]: 4_300 }, leadDays: 7, notes: 'Usual supplier, delivery in a week', receivedAt: at(d(-6), 12) },
    { supplierId: 's10', prices: { [r4.lines[0].id]: 6_100, [r4.lines[1].id]: 4_450 }, leadDays: 14, notes: 'New supplier — samples approved by QA', receivedAt: at(d(-5), 15) },
    { supplierId: 's12', prices: { [r4.lines[0].id]: 6_900, [r4.lines[1].id]: 3_950 }, leadDays: 10, notes: 'Labels specialist', receivedAt: at(d(-5), 16) }
  ];
  r4.history.push({ at: at(d(-5), 16), by: peter.name, action: '3 supplier quotes received' });

  /* ---------------- Purchase orders and goods received ---------------- */
  const purchaseOrders: PurchaseOrder[] = [];
  const receipts: GoodsReceipt[] = [];
  let poN = 0;
  let grN = 0;
  const po = (
    supplierId: string,
    offset: number,
    lines: POLine[],
    state: 'COMPLETED' | 'TO_BILL' | 'PART' | 'AWAITING' | 'TO_SEND' | 'APPROVAL' | 'DRAFT',
    extra: Partial<PurchaseOrder> = {},
    lateDays = 0
  ) => {
    const date = d(offset);
    const value = lines.reduce((s, l) => s + l.qty * l.price, 0) * 1.16;
    const o: PurchaseOrder = {
      id: id('po'),
      number: num('PO', ++poN),
      supplierId,
      date,
      expected: d(offset + 10),
      lines,
      bills: [],
      notes: '',
      status: 'APPROVED',
      preparedBy: peter.name,
      ...(state === 'DRAFT'
        ? { status: 'DRAFT', approvals: [], history: [{ at: at(date, 9), by: peter.name, action: 'Created' }] }
        : state === 'APPROVAL'
          ? {
              status: 'SUBMITTED',
              approvals: value > 1_000_000 ? [{ by: lucy.name, role: 'MANAGER' as ComRole, at: at(date, 15) }] : [],
              history: [
                { at: at(date, 9), by: peter.name, action: 'Created' },
                { at: at(date, 10), by: peter.name, action: 'Submitted for approval' },
                ...(value > 1_000_000 ? [{ at: at(date, 15), by: lucy.name, action: 'Approved' }] : [])
              ]
            }
          : approvedTrail(date, peter.name, value > 1_000_000)),
      ...extra
    } as PurchaseOrder;
    if (!['DRAFT', 'APPROVAL', 'TO_SEND'].includes(state)) {
      o.sentAt = at(addDays(date, 1), 9);
      o.history.push({ at: o.sentAt, by: peter.name, action: 'Sent to supplier' });
    }
    if (['COMPLETED', 'TO_BILL', 'PART'].includes(state)) {
      const gDate = d(offset + 10 + lateDays);
      const g: GoodsReceipt = {
        id: id('gr'),
        number: num('GRN', ++grN),
        poId: o.id,
        date: gDate,
        lines: o.lines.filter((l) => l.received > 0).map((l) => ({ lineId: l.id, qty: l.received, rejected: 0 })),
        receivedBy: john.name,
        deliveryNote: `DN ${7000 + grN * 13}`,
        notes: ''
      };
      receipts.push(g);
      o.history.push({ at: at(gDate, 11), by: john.name, action: `Goods received — ${g.number}` });
    }
    if (state === 'COMPLETED') {
      const bill = billsOf(supplierId)[0];
      if (bill) o.bills.push({ id: bill.id, number: bill.number });
      o.history.push({ at: at(d(offset + 12), 12), by: peter.name, action: `Billed${bill ? ` — ${bill.number}` : ''}` });
      o.closed = true;
    }
    purchaseOrders.push(o);
    return o;
  };
  const p1 = po('s6', -46, [pline('PKG-BOX', 300, 6_500, 300, 300), pline('PKG-FLM', 20, 18_000, 20, 20)], 'COMPLETED', { requisitionId: r1.id });
  r1.poId = p1.id;
  r1.awardedTo = 's6';
  const p2 = po('s11', -30, [pline('RAW-A', 18, 84_000, 18, 18)], 'COMPLETED', { requisitionId: r2.id }, 3);
  r2.poId = p2.id;
  r2.awardedTo = 's11';
  const p3 = po('s8', -17, [pline('SPR-GEN', 3, 46_000, 3, 0)], 'TO_BILL', { requisitionId: r3.id });
  r3.poId = p3.id;
  r3.awardedTo = 's8';
  po('s12', -15, [pline('PKG-LBL', 100, 4_100, 60, 0)], 'PART', { notes: 'Balance of 40 rolls promised next week' }, 1);
  po('s6', -14, [pline('PKG-BOX', 150, 6_500), pline('PKG-FLM', 10, 18_000)], 'AWAITING');
  po('s7', -2, [pline('OFC-PPR', 40, 2_750)], 'TO_SEND');
  po('s11', -1, [pline('RAW-A', 14, 86_500)], 'APPROVAL', { notes: 'Forward buy ahead of the expected price increase' });
  po('s10', 0, [pline('PKG-BOX', 120, 6_100)], 'DRAFT');

  // Stock already reflects the goods received and delivered above; nothing else to adjust.

  /* ---------------- Opportunities and activities ---------------- */
  const opportunities: Opportunity[] = [];
  const activities: Activity[] = [];
  const opp = (
    name: string,
    who: { customerId?: string; prospect?: string },
    contact: string,
    stage: Stage,
    value: number,
    closeIn: number,
    stageAge: number,
    source: string,
    nextStep: string,
    extra: Partial<Opportunity> = {}
  ) => {
    const o: Opportunity = {
      id: id('op'),
      name,
      ...who,
      contact,
      owner: stage === 'LEAD' ? peter.name : lucy.name,
      stage,
      value,
      expectedClose: d(closeIn),
      source,
      created: d(-stageAge - 20),
      stageChanged: d(-stageAge),
      nextStep,
      history: [
        { at: at(d(-stageAge - 20), 10), by: peter.name, action: 'Opportunity created' },
        { at: at(d(-stageAge), 10), by: lucy.name, action: `Moved to ${stage.charAt(0) + stage.slice(1).toLowerCase()}` }
      ],
      ...extra
    };
    opportunities.push(o);
    return o;
  };
  const o1 = opp('Coast expansion — bulk supply', { customerId: 'c4' }, 'Mary Achieng, Procurement', 'NEGOTIATION', 2_350_000, 12, 6, 'Existing customer', 'Agree volume discount', { quotationId: quotations[4].id });
  const o2 = opp('Hotel chain annual contract', { customerId: 'c2' }, 'James Kariuki, GM', 'PROPOSAL', 1_800_000, 30, 9, 'Referral', 'Present proposal to the board');
  const o3 = opp('Dubai distributor — 2 containers', { customerId: 'c8' }, 'Omar Haddad, Buyer', 'NEGOTIATION', 5_700_000, 20, 4, 'Trade fair', 'Confirm FOB price and shipping window', { quotationId: quotations[7].id });
  const o4 = opp('Hospital cafeteria supply', { customerId: 'c3' }, 'Dr. Wanjiru, Admin', 'PROPOSAL', 960_000, 25, 5, 'Existing customer', 'Follow up on quotation', { quotationId: quotations[5].id });
  const o5 = opp('Supermarket private label', { customerId: 'c7' }, 'Kevin Otieno, Category Manager', 'QUALIFIED', 3_200_000, 60, 12, 'Inbound enquiry', 'Send samples for listing');
  const o6 = opp('Agro-cooperative bulk sacks', { prospect: 'Mlima Farmers Cooperative' }, 'Joyce Chebet, Chair', 'QUALIFIED', 1_250_000, 45, 26, 'Field visit', 'Site visit to the cooperative store');
  const o7 = opp('Airline catering trial', { prospect: 'SkyServe Catering Ltd' }, 'Ahmed Noor, Supply Chain', 'LEAD', 2_100_000, 90, 8, 'Website', 'Discovery call');
  const o8 = opp('School feeding programme', { prospect: 'Elimu Schools Trust' }, 'Grace Mumbi, Programmes', 'LEAD', 780_000, 75, 3, 'Tender notice', 'Download tender documents');
  const o9 = opp('Conference centre — gift boxes', { customerId: 'c5' }, 'Paul Mwende, Events', 'PROPOSAL', 540_000, 10, 31, 'Existing customer', 'Chase decision — proposal sent a month ago');
  opp('Retail chain festive promotion', { customerId: 'c1' }, 'Anne Wairimu, Marketing', 'WON', 1_310_000, -40, 45, 'Existing customer', '', { quotationId: quotations[0].id });
  opp('Hotel group premium range', { customerId: 'c2' }, 'James Kariuki, GM', 'WON', 1_020_000, -30, 38, 'Referral', '', { quotationId: quotations[1].id });
  opp('Export trial — Oman', { customerId: 'c8' }, 'Omar Haddad, Buyer', 'LOST', 3_800_000, -20, 30, 'Trade fair', '', { lostReason: 'Price — competitor 8% lower', quotationId: quotations[2].id });
  opp('Maintenance contract renewal', { customerId: 'c5' }, 'Paul Mwende, Events', 'LOST', 240_000, -10, 20, 'Renewal', '', { lostReason: 'Moved maintenance in-house' });
  opp('Highland Agro organic line', { customerId: 'c6' }, 'Daniel Rotich, Buyer', 'WON', 1_490_000, -15, 16, 'Existing customer', '');
  opp('Clinic network supply', { prospect: 'Afya Clinics Network' }, 'Dr. Halima, Ops', 'LEAD', 650_000, 80, 2, 'LinkedIn', 'Qualify budget and timing');

  const act = (o: Opportunity, type: Activity['type'], subject: string, due: number, done: boolean, outcome?: string) =>
    activities.push({ id: id('ac'), opportunityId: o.id, type, subject, due: d(due), done, owner: o.owner, outcome });
  act(o1, 'MEETING', 'Pricing meeting with procurement', 2, false);
  act(o1, 'CALL', 'Call to confirm volumes', -4, true, 'Wants 12% for 140 sacks a month');
  act(o2, 'MEETING', 'Board presentation', 6, false);
  act(o2, 'EMAIL', 'Send proposal and references', -8, true, 'Sent');
  act(o3, 'CALL', 'Confirm shipping window', 1, false);
  act(o3, 'EMAIL', 'Send revised FOB quotation', -3, true, 'Sent QT with 4% discount');
  act(o4, 'CALL', 'Follow up on quotation', -2, false);
  act(o5, 'VISIT', 'Deliver samples to category team', 3, false);
  act(o6, 'VISIT', 'Site visit to cooperative store', -6, false);
  act(o7, 'CALL', 'Discovery call', 4, false);
  act(o8, 'EMAIL', 'Request tender documents', 0, false);
  act(o9, 'CALL', 'Chase decision on proposal', -9, false);
  act(o5, 'DEMO', 'Product tasting with buyers', 10, false);

  return {
    actor: peter,
    products: PRODUCTS.map((p) => ({ ...p })),
    quotations,
    orders,
    deliveries,
    requisitions,
    purchaseOrders,
    receipts,
    opportunities,
    activities,
    sequence: { SO: soN, DN: dnN, QT: qN, PR: rqN, PO: poN, GRN: grN }
  };
};
