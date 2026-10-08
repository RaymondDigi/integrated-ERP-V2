import { addDays, TODAY } from '../../../finance/engine';
import type { FinanceState, HistoryEntry } from '../../../finance/types';
import type { CommercialState } from '../../types';
import type {
  Contract,
  EventLot,
  ItemExt,
  Lot,
  OutputTemplate,
  ProcExtState,
  QSection,
  SourcingEvent,
  SupplierProfile,
  SupplierType,
  WarehouseConfig
} from './types';

const PETER = 'Peter Mwangi';
const JOHN = 'John Kiprop';
const LUCY = 'Lucy Njeri';
const AMINA = 'Amina Hassan';
const d = (n: number) => addDays(TODAY, n);
const at = (date: string, h: number) => `${date}T${String(h).padStart(2, '0')}:20:00`;
const year = TODAY.slice(0, 4);
const num = (p: string, n: number) => `${p}-${year}-${String(n).padStart(4, '0')}`;
const h = (date: string, hour: number, by: string, action: string, note?: string): HistoryEntry => ({ at: at(date, hour), by, action, note });

export const OUTPUT_DOCS = [
  'Purchase order',
  'Goods received note',
  'Goods issue',
  'Inbound delivery',
  'Outbound delivery',
  'Tea release order',
  'Shipping instruction',
  'Inward tally',
  'Outward tally',
  'Pick list',
  'Pro-forma invoice',
  'Packing slip',
  'Contract'
];

export const FAQ: [string, string][] = [
  ['How do I buy something that is not in the catalogue?', 'Use "Request something else" on the catalogue page. It raises a requisition with a free-text line; purchasing sources it and can add it to the catalogue afterwards.'],
  ['Why does my requisition say "over budget"?', 'The budget line for the item (e.g. 5000 Cost of sales — materials) has less left than the requisition value after actual spend and open orders. It can still be approved, but the Finance Director signs it.'],
  ['What does "off contract" mean?', 'There is no active contract or long-term agreement for that item and supplier. Purchasing will normally issue an RFQ to get competing bids.'],
  ['How do suppliers respond to an RFQ?', 'Invited suppliers open the Supplier portal, read the event and submit prices and questionnaire answers. A buyer can also key a response on their behalf.'],
  ['Who approves a purchase order?', 'The approval rules under Procurement › Settings decide. By default the Commercial Manager approves; above KES 1M, raw tea or when over budget the Finance Director signs as well.'],
  ['Can I sign in with my Microsoft account?', 'Single sign-on is not connected in this demo build; use your work email and password.']
];

const sec = (id: string, name: string, weight: number, qs: [string, QSection['questions'][number]['type'], number][]): QSection => ({
  id,
  name,
  weight,
  questions: qs.map(([text, type, w], i) => ({ id: `${id}q${i + 1}`, text, type, weight: w, required: true }))
});

export const STANDARD_QUESTIONNAIRE: QSection[] = [
  sec('s1', 'Quality', 40, [
    ['Do you hold ISO 9001 or KEBS certification for these goods?', 'YESNO', 1],
    ['Sample quality as assessed by our QA team', 'SCORE', 2]
  ]),
  sec('s2', 'Delivery', 30, [
    ['Can you deliver to both Nairobi and Mombasa?', 'YESNO', 1],
    ['Delivery reliability and lead time', 'SCORE', 2]
  ]),
  sec('s3', 'Compliance', 30, [['Is your KRA tax compliance certificate current?', 'YESNO', 1], ['Number of years supplying the tea industry', 'NUMBER', 1]])
];

const SUPPLIER_META: Record<string, { type: SupplierType; contact: string; region: string; bank: [string, string, string]; tax: string[]; method: 'EFT' | 'RTGS' | 'M-PESA' | 'CHEQUE' }> = {
  s1: { type: 'SERVICES', contact: 'Grace Wambui', region: 'Nairobi', bank: ['KCB Bank', 'Moi Avenue', '1100 2233 4401'], tax: ['Professional services'], method: 'EFT' },
  s2: { type: 'SERVICES', contact: 'Billing desk', region: 'Nairobi', bank: ['Equity Bank', 'Upper Hill', '0170 2938 4402'], tax: ['Professional services'], method: 'EFT' },
  s3: { type: 'SERVICES', contact: 'Corporate accounts', region: 'Nairobi', bank: ['Stanbic Bank', 'Westlands', '0100 0034 4403'], tax: ['Professional services'], method: 'EFT' },
  s4: { type: 'LOGISTICS', contact: 'Hassan Ali', region: 'Mombasa', bank: ['NCBA Bank', 'Nyali', '1003 4455 4404'], tax: ['Logistics — haulage'], method: 'RTGS' },
  s5: { type: 'SERVICES', contact: 'Col. (rtd) Mutua', region: 'Nairobi', bank: ['Co-operative Bank', 'Industrial Area', '0112 9988 4405'], tax: ['Professional services'], method: 'EFT' },
  s6: { type: 'GOODS', contact: 'Janet Mbugua', region: 'Nairobi', bank: ['KCB Bank', 'Industrial Area', '1122 3344 4406'], tax: ['Packaging — cartons & sacks', 'Packaging — foil & film'], method: 'EFT' },
  s7: { type: 'GOODS', contact: 'Brian Odhiambo', region: 'Nairobi', bank: ['Equity Bank', 'Tom Mboya', '0170 5566 4407'], tax: ['Office supplies'], method: 'M-PESA' },
  s8: { type: 'SERVICES', contact: 'Samuel Kibet', region: 'Nakuru', bank: ['Co-operative Bank', 'Nakuru', '0114 7788 4408'], tax: ['Engineering spares'], method: 'EFT' },
  s9: { type: 'SERVICES', contact: 'Advocate Wakili', region: 'Nairobi', bank: ['I&M Bank', 'Kenyatta Avenue', '0010 9900 4409'], tax: ['Professional services'], method: 'EFT' },
  s10: { type: 'GOODS', contact: 'Fatma Said', region: 'Mombasa', bank: ['Diamond Trust Bank', 'Mombasa', '0221 4433 4410'], tax: ['Packaging — cartons & sacks'], method: 'RTGS' },
  s11: { type: 'TEA_PRODUCER', contact: 'Daniel Rotich', region: 'Kericho', bank: ['KCB Bank', 'Kericho', '1144 5566 4411'], tax: ['Tea — made tea (auction)', 'Tea — direct sale gardens'], method: 'RTGS' },
  s12: { type: 'GOODS', contact: 'Ruth Njoki', region: 'Nairobi', bank: ['NCBA Bank', 'Mombasa Road', '1005 6677 4412'], tax: ['Labels & printing'], method: 'EFT' }
};

const fullTrail = (date: string): HistoryEntry[] => [h(date, 9, PETER, 'Onboarding requested'), h(date, 10, PETER, 'Submitted for approval'), h(date, 15, LUCY, 'Approved', 'Documents verified')];

export const buildProcSeed = (com: CommercialState, fin: FinanceState): ProcExtState => {
  let sn = 0;
  /* ---------------- Supplier profiles ---------------- */
  const suppliers: SupplierProfile[] = fin.parties
    .filter((p) => p.kind === 'SUPPLIER')
    .map((p) => {
      const m = SUPPLIER_META[p.id] ?? { type: 'GOODS' as SupplierType, contact: '', region: 'Nairobi', bank: ['KCB Bank', 'Head office', `9${p.id}000`], tax: [], method: 'EFT' as const };
      const since = d(-400 - Number(p.id.replace(/\D/g, '')) * 9);
      return {
        id: `sp-${p.id}`,
        partyId: p.id,
        number: num('SUP', ++sn),
        name: p.name,
        idType: 'KRA_PIN',
        idNumber: p.pin,
        email: p.email,
        phone: p.phone,
        contactPerson: m.contact,
        country: 'Kenya',
        region: m.region,
        address: `${m.region}, Kenya`,
        paymentMethod: m.method,
        paymentTerms: p.terms,
        bank: { bank: m.bank[0], branch: m.bank[1], account: m.bank[2] },
        taxonomy: m.tax,
        supplierType: m.type,
        category: p.category,
        status: 'APPROVED',
        source: 'MIGRATION',
        termsAccepted: at(since, 11),
        documents: [
          { id: `doc-${p.id}-1`, type: 'TAX_COMPLIANCE', number: `KRA-TCC-${p.pin.slice(1, 7)}`, issued: d(-300), expiry: p.id === 's6' ? d(12) : p.id === 's8' ? d(-5) : d(65), issuer: 'Kenya Revenue Authority', verified: true },
          ...(m.type === 'LOGISTICS' || m.type === 'SERVICES' ? [{ id: `doc-${p.id}-2`, type: 'INSURANCE' as const, number: `POL/${p.id.toUpperCase()}/2291`, issued: d(-340), expiry: p.id === 's4' ? d(20) : d(25 + Number(p.id.replace(/\D/g, '')) * 20), issuer: 'Jubilee Insurance', verified: true }] : []),
          ...(m.type === 'TEA_PRODUCER' ? [{ id: `doc-${p.id}-3`, type: 'TEA_BOARD_LICENCE' as const, number: 'TBK/MFR/0447', issued: d(-200), expiry: d(165), issuer: 'Tea Board of Kenya', verified: true }] : [])
        ],
        verification: { 'Bank letter matches account': true, 'CR12 directors checked': true, 'KRA PIN validated': true, 'Tax compliance current': p.id !== 's8', 'Credit reference check': true, 'Site visit / references': p.id !== 's10' },
        updateRequests:
          p.id === 's10'
            ? [{ id: 'ur1', formCategory: 'Materials', status: 'SENT', sentAt: at(d(-16), 10), due: d(-2), sentBy: LUCY, changes: {}, comments: [h(d(-16), 10, LUCY, 'Sent', 'Annual update: confirm bank details and upload the new tax compliance certificate')] }]
            : [],
        approvals: [{ by: LUCY, role: 'MANAGER', at: at(since, 15) }],
        preparedBy: PETER,
        portalLogin: ['s6', 's10', 's11', 's12'].includes(p.id) ? { username: p.email, createdAt: at(since, 12), active: true } : undefined,
        history: fullTrail(since)
      } as SupplierProfile;
    });
  suppliers.push(
    {
      id: 'sp-new1',
      number: num('SUP', ++sn),
      name: 'Kangaita Tea Factory Co. Ltd',
      idType: 'KRA_PIN',
      idNumber: 'P051223344K',
      email: 'sales@kangaitatea.co.ke',
      phone: '+254 722 556 677',
      contactPerson: 'Joseph Muriuki',
      country: 'Kenya',
      region: 'Kirinyaga',
      address: 'Kangaita, Kirinyaga County',
      paymentMethod: 'RTGS',
      paymentTerms: 14,
      bank: { bank: 'Co-operative Bank', branch: 'Kerugoya', account: '0118 2211 4413' },
      taxonomy: ['Tea — direct sale gardens'],
      supplierType: 'TEA_PRODUCER',
      category: 'Raw materials',
      status: 'PENDING_APPROVAL',
      source: 'PORTAL',
      termsAccepted: at(d(-3), 16),
      documents: [
        { id: 'doc-n1-1', type: 'TAX_COMPLIANCE', number: 'KRA-TCC-051223', issued: d(-40), expiry: d(325), issuer: 'Kenya Revenue Authority', verified: false },
        { id: 'doc-n1-2', type: 'TEA_BOARD_LICENCE', number: 'TBK/MFR/1189', issued: d(-90), expiry: d(275), issuer: 'Tea Board of Kenya', verified: false }
      ],
      verification: { 'KRA PIN validated': true },
      updateRequests: [],
      approvals: [],
      preparedBy: 'Supplier portal',
      portalLogin: { username: 'sales@kangaitatea.co.ke', createdAt: at(d(-3), 16), active: false },
      history: [h(d(-3), 16, 'Joseph Muriuki (supplier)', 'Registered on the supplier portal', 'Direct-sale orthodox and CTC teas, 40 t a month'), h(d(-3), 16, 'Supplier portal', 'Submitted for approval')]
    },
    {
      id: 'sp-new2',
      number: num('SUP', ++sn),
      name: 'Bahari Clearing & Forwarding Ltd',
      idType: 'KRA_PIN',
      idNumber: 'P051998877B',
      email: 'ops@baharicf.co.ke',
      phone: '+254 41 231 9988',
      contactPerson: 'Mwanaisha Juma',
      country: 'Kenya',
      region: 'Mombasa',
      address: 'Moi Avenue, Mombasa',
      paymentMethod: 'EFT',
      paymentTerms: 30,
      bank: { bank: '', branch: '', account: '' },
      taxonomy: ['Logistics — clearing & forwarding'],
      supplierType: 'LOGISTICS',
      category: 'Logistics',
      status: 'PROSPECT',
      source: 'REQUISITIONER',
      documents: [],
      verification: {},
      updateRequests: [],
      approvals: [],
      preparedBy: PETER,
      history: [h(d(-1), 11, PETER, 'Suggested as a new supplier', 'Shipping team wants a second clearing agent for Mombasa port')]
    }
  );

  /* ---------------- Item extensions and lots ---------------- */
  const tea = ['RAW-A'];
  const items: ItemExt[] = com.products
    .filter((p) => p.kind !== 'SERVICE')
    .map((p) => ({
      sku: p.sku,
      barcode: `KE${p.sku.replace(/[^A-Z0-9]/g, '')}`,
      unspsc: { 'PKG-BOX': '24112404', 'PKG-FLM': '24121503', 'PKG-LBL': '55121606', 'RAW-A': '50201706', 'SPR-GEN': '26111602', 'OFC-PPR': '14111507' }[p.sku],
      spec: p.sku === 'RAW-A' ? 'Black CTC, BP1/PF1 grades, moisture ≤ 3%, Mombasa auction or direct sale' : undefined,
      tags: [p.category.toLowerCase(), ...(p.sku.startsWith('PKG') ? ['packaging', 'blending'] : []), ...(tea.includes(p.sku) ? ['tea', 'auction', 'ctc'] : [])],
      purchaseUnit: p.unit,
      factor: 1,
      defaultWarehouse: p.kind === 'MATERIAL' && p.category !== 'Office' ? 'WH-FAC' : 'WH-NBO',
      defaultBin: p.kind === 'MATERIAL' ? 'F-01' : 'A-01',
      countEveryDays: p.kind === 'MATERIAL' ? (tea.includes(p.sku) ? 30 : 60) : 90,
      lastCounted: d(p.kind === 'MATERIAL' ? -58 : -40),
      abc: tea.includes(p.sku) || p.sku === 'PKG-FLM' ? 'A' : p.kind === 'MATERIAL' ? 'B' : 'C',
      lotTracked: p.kind === 'MATERIAL',
      serialTracked: p.sku === 'SPR-GEN',
      shelfLifeDays: tea.includes(p.sku) ? 540 : undefined,
      active: true,
      policy: p.category === 'Raw materials' ? 'Raw tea is bought only on contract or through the Mombasa auction agent. Quote the sale number.' : p.category === 'Office' ? 'Office items come from the stores catalogue first.' : undefined
    }));

  const lots: Lot[] = [];
  let ln = 0;
  const lot = (sku: string, qty: number, wh: string, bin: string, ago: number, extra: Partial<Lot> = {}) => {
    const p = com.products.find((x) => x.sku === sku);
    if (!p || qty <= 0) return;
    lots.push({ id: `lot${++ln}`, sku, lot: `L${year.slice(2)}${String(1000 + ln)}`, qty, warehouse: wh, bin, received: d(-ago), receivedRef: extra.receivedRef ?? 'Opening balance', unitCost: p.cost, condition: 'GOOD', ...extra });
  };
  const stock = (sku: string) => com.products.find((p) => p.sku === sku)?.stock ?? 0;
  const split = (sku: string, parts: [number, string, string, number, Partial<Lot>?][]) => {
    const total = stock(sku);
    let left = total;
    parts.forEach(([share, wh, bin, ago, extra], i) => {
      const q = i === parts.length - 1 ? left : Math.round(total * share);
      left -= q;
      lot(sku, q, wh, bin, ago, extra);
    });
  };
  split('PKG-BOX', [[0.7, 'WH-FAC', 'F-01', 36, { receivedRef: num('GRN', 1) }], [0.3, 'WH-NBO', 'A-02', 128]]);
  split('PKG-FLM', [[0.55, 'WH-FAC', 'F-02', 36, { receivedRef: num('GRN', 1) }], [0.45, 'WH-NBO', 'A-03', 210, { condition: 'GOOD' }]]);
  split('PKG-LBL', [[0.75, 'WH-FAC', 'F-03', 4, { receivedRef: num('GRN', 4) }], [0.25, 'WH-NBO', 'A-04', 120]]);
  split('RAW-A', [
    [0.6, 'WH-MSA', 'M-01', 17, { receivedRef: num('GRN', 2), garden: 'Kangaita', grade: 'BP1', saleNo: 'Sale 38', teaInvoice: 'INV 1123', expiry: d(520) }],
    [0.4, 'WH-MSA', 'M-02', 95, { garden: 'Gatunguru', grade: 'PF1', saleNo: 'Sale 26', teaInvoice: 'INV 0871', expiry: d(440) }]
  ]);
  if (stock('SPR-GEN') >= 2) {
    lot('SPR-GEN', 1, 'WH-NBO', 'S-01', 160, { serial: 'GSK-24-00871' });
    lot('SPR-GEN', stock('SPR-GEN') - 1, 'WH-NBO', 'S-01', 7, { serial: 'GSK-24-01102', receivedRef: num('GRN', 3) });
  }
  split('OFC-PPR', [[1, 'WH-NBO', 'B-01', 62]]);
  for (const p of com.products.filter((x) => x.kind === 'GOODS')) split(p.sku, [[0.8, 'WH-NBO', 'A-01', 22], [0.2, 'WH-MSA', 'M-03', 74]]);

  const warehouses: WarehouseConfig[] = [
    { id: 'WH-NBO', name: 'Main warehouse — Nairobi', type: 'STANDARD', location: 'Industrial Area, Nairobi', bins: ['A-01', 'A-02', 'A-03', 'A-04', 'B-01', 'S-01'], ops: true },
    { id: 'WH-MSA', name: 'Port store — Mombasa', type: 'STANDARD', location: 'Shimanzi, Mombasa', bins: ['M-01', 'M-02', 'M-03'], ops: true },
    { id: 'WH-FAC', name: 'Factory materials store', type: 'STANDARD', location: 'Factory, Athi River', bins: ['F-01', 'F-02', 'F-03'], ops: true },
    { id: 'WH-QRN', name: 'Quarantine cage — Nairobi', type: 'QUARANTINE', location: 'Industrial Area, Nairobi', bins: ['Q-01', 'Q-02'] },
    { id: 'WH-BND', name: 'Bonded warehouse — Mombasa', type: 'BONDED', location: 'Changamwe, Mombasa', bins: ['BW-01', 'BW-02'], bondNo: 'KRA/BW/MSA/0192' },
    { id: 'WH-TRN', name: 'Goods in transit', type: 'TRANSIT', location: 'Mombasa–Nairobi corridor', bins: ['T-01'] }
  ];

  /* ---------------- Sourcing events ---------------- */
  const lotOf = (id: string, name: string, lines: [string, number, string?][]): EventLot => ({
    id,
    name,
    lines: lines.map(([sku, qty, desc], i) => {
      const p = com.products.find((x) => x.sku === sku);
      return { id: `${id}l${i + 1}`, sku: p ? sku : undefined, description: desc ?? p?.name ?? sku, qty, uom: p?.unit ?? 'jobs', serviceType: p ? undefined : sku };
    })
  });
  const evt = (e: Partial<SourcingEvent> & Pick<SourcingEvent, 'id' | 'number' | 'title' | 'kind' | 'category' | 'status' | 'opens' | 'closes' | 'lots'>): SourcingEvent => ({
    businessUnit: 'Blending & packing',
    owner: PETER,
    invited: [],
    responses: [],
    questionnaire: [],
    priceWeight: 60,
    panel: [LUCY, AMINA],
    evaluations: [],
    messages: [],
    bids: [],
    awards: [],
    terms: 'Prices in KES, exclusive of VAT, delivered to the factory store at Athi River. Payment 45 days from a matched invoice.',
    history: [h(e.opens, 8, PETER, 'Created')],
    ...e
  });
  const e1 = evt({
    id: 'ev1',
    number: num('RFX', 1),
    title: 'Cartons and labels — Q4 blending season',
    kind: 'RFQ',
    category: 'Packaging',
    status: 'OPEN',
    opens: d(-6),
    closes: d(4),
    qaDeadline: d(1),
    lots: [lotOf('ev1a', 'Lot 1 — Corrugated cartons', [['PKG-BOX', 600]]), lotOf('ev1b', 'Lot 2 — Labels', [['PKG-LBL', 200]])],
    questionnaire: STANDARD_QUESTIONNAIRE,
    invited: [
      { supplierId: 's6', at: at(d(-6), 9), by: PETER },
      { supplierId: 's10', at: at(d(-6), 9), by: PETER },
      { supplierId: 's12', at: at(d(-6), 9), by: PETER }
    ],
    responses: [
      { id: 'rs1', supplierId: 's6', revision: 1, submittedAt: at(d(-4), 14), submittedBy: 'Janet Mbugua (supplier)', onBehalf: false, prices: { ev1al1: 6_400, ev1bl1: 4_250 }, leadDays: 7, costs: { freight: 0, duty: 0, other: 0 }, answers: { s1q1: 'Yes', s2q1: 'Yes', s3q1: 'Yes', s3q2: '14' }, notes: 'Delivered free to Athi River', valid: true, bundleDiscountPct: 2 },
      { id: 'rs2', supplierId: 's10', revision: 1, submittedAt: at(d(-3), 11), submittedBy: 'Fatma Said (supplier)', onBehalf: false, prices: { ev1al1: 6_150, ev1bl1: 0 }, leadDays: 14, costs: { freight: 36_000, duty: 0, other: 0 }, answers: { s1q1: 'No', s2q1: 'Yes', s3q1: 'Yes', s3q2: '4' }, notes: 'Cartons only', valid: true },
      { id: 'rs3', supplierId: 's10', revision: 2, submittedAt: at(d(-1), 16), submittedBy: PETER, onBehalf: true, prices: { ev1al1: 6_050, ev1bl1: 0 }, leadDays: 12, costs: { freight: 30_000, duty: 0, other: 0 }, answers: { s1q1: 'No', s2q1: 'Yes', s3q1: 'Yes', s3q2: '4' }, notes: 'Revised by phone — keyed by buyer', valid: true, tiers: [{ lineId: 'ev1al1', minQty: 500, pct: 1.5 }] }
    ],
    evaluations: [
      { id: 'ev1e1', evaluator: LUCY, supplierId: 's6', scores: { s1q2: 4, s2q2: 5 }, comment: 'Reliable, known quality', at: at(d(-1), 10) },
      { id: 'ev1e2', evaluator: LUCY, supplierId: 's10', scores: { s1q2: 3, s2q2: 3 }, comment: 'Samples passed but one late delivery last quarter', at: at(d(-1), 10) }
    ],
    messages: [
      { id: 'm1', from: 'Fatma Said', side: 'SUPPLIER', supplierId: 's10', text: 'Is the 5-ply carton specification the same as last season?', at: at(d(-5), 10), public: false },
      { id: 'm2', from: PETER, side: 'BUYER', text: 'Clarification to all bidders: 5-ply, 450 gsm, printed 2 colours as per drawing PK-12 rev C (attached).', at: at(d(-5), 15), public: true }
    ],
    history: [h(d(-6), 8, PETER, 'Created'), h(d(-6), 9, PETER, 'Published to 3 suppliers')]
  });
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const e2 = evt({
    id: 'ev2',
    number: num('RFX', 2),
    title: 'Printed film rolls — reverse auction',
    kind: 'REVERSE_AUCTION',
    category: 'Packaging',
    status: 'OPEN',
    opens: d(0),
    closes: d(0),
    lots: [lotOf('ev2a', 'Film rolls', [['PKG-FLM', 30]])],
    invited: ['s6', 's10', 's12'].map((s) => ({ supplierId: s, at: at(d(-2), 9), by: PETER })),
    auction: { start: iso(now - 20 * 60_000), end: iso(now + 45 * 60_000), extendMinutes: 3, extendWindowMinutes: 2, minDecrementPct: 1, showRank: 'RANK', reservePrice: 560_000, extensions: 0 },
    bids: [
      { id: 'b1', supplierId: 's6', amount: 548_000, at: iso(now - 18 * 60_000), by: 'Janet Mbugua' },
      { id: 'b2', supplierId: 's12', amount: 541_000, at: iso(now - 14 * 60_000), by: 'Ruth Njoki' },
      { id: 'b3', supplierId: 's6', amount: 535_500, at: iso(now - 9 * 60_000), by: 'Janet Mbugua' },
      { id: 'b4', supplierId: 's10', amount: 539_000, at: iso(now - 6 * 60_000), by: 'Fatma Said' },
      { id: 'b5', supplierId: 's12', amount: 529_000, at: iso(now - 3 * 60_000), by: 'Ruth Njoki' }
    ],
    priceWeight: 100,
    history: [h(d(-2), 8, PETER, 'Created'), h(d(-2), 9, PETER, 'Published to 3 suppliers')]
  });
  const e3 = evt({
    id: 'ev3',
    number: num('RFX', 3),
    title: 'Tea tasting laboratory services',
    kind: 'RFI',
    category: 'Services',
    businessUnit: 'Tea trading',
    status: 'CLOSED',
    opens: d(-30),
    closes: d(-10),
    lots: [lotOf('ev3a', 'Tasting services', [['Tea tasting', 12, 'Monthly cupping and grading of auction catalogues']])],
    invited: ['s8', 's9'].map((s) => ({ supplierId: s, at: at(d(-30), 9), by: PETER })),
    questionnaire: [sec('i1', 'Capability', 100, [['Accredited cupping laboratory in Mombasa?', 'YESNO', 1], ['Describe your tasters’ experience', 'TEXT', 1]])],
    responses: [{ id: 'rs4', supplierId: 's8', revision: 1, submittedAt: at(d(-15), 12), submittedBy: 'Samuel Kibet (supplier)', onBehalf: false, prices: { ev3al1: 45_000 }, leadDays: 5, costs: { freight: 0, duty: 0, other: 0 }, answers: { i1q1: 'Yes', i1q2: 'Two senior tasters, 15 years at Mombasa auction' }, notes: 'Indicative price only', valid: true }],
    history: [h(d(-30), 8, PETER, 'Created'), h(d(-30), 9, PETER, 'Published to 2 suppliers'), h(d(-10), 17, PETER, 'Closed')]
  });
  const e4 = evt({
    id: 'ev4',
    number: num('RFX', 4),
    title: 'Haulage Mombasa port → Athi River (12 months)',
    kind: 'RFP',
    category: 'Logistics',
    businessUnit: 'Logistics',
    status: 'DRAFT',
    opens: d(2),
    closes: d(16),
    lots: [lotOf('ev4a', '20 ft container moves', [['Haulage', 240, '20 ft container, Mombasa CFS to Athi River']])],
    questionnaire: STANDARD_QUESTIONNAIRE,
    templateId: 'tpl2',
    history: [h(d(-1), 8, PETER, 'Created from template', 'Services RFP')]
  });
  const e5 = evt({
    id: 'ev5',
    number: num('RFX', 5),
    title: 'Raw tea supply — Kericho gardens (annual)',
    kind: 'RFP',
    category: 'Raw materials',
    businessUnit: 'Tea trading',
    status: 'AWARDED',
    opens: d(-90),
    closes: d(-70),
    lots: [lotOf('ev5a', 'BP1/PF1 CTC', [['RAW-A', 36]])],
    invited: ['s11'].map((s) => ({ supplierId: s, at: at(d(-90), 9), by: PETER })),
    responses: [{ id: 'rs5', supplierId: 's11', revision: 1, submittedAt: at(d(-80), 12), submittedBy: 'Daniel Rotich (supplier)', onBehalf: false, prices: { ev5al1: 85_000 }, leadDays: 10, costs: { freight: 0, duty: 0, other: 0 }, answers: {}, notes: '', valid: true }],
    awards: [{ supplierId: 's11', lineIds: ['ev5al1'], value: 3_060_000, poIds: [], contractId: 'ct2' }],
    history: [h(d(-90), 8, PETER, 'Created'), h(d(-70), 17, PETER, 'Closed'), h(d(-62), 12, LUCY, 'Awarded to Rift Agro Inputs Ltd', 'Long-term agreement CT-0002')]
  });
  e1.convertedFrom = undefined;

  /* ---------------- Contracts ---------------- */
  const ver = (n: number, body: string, by: string, ago: number, note: string) => ({ n, body, by, at: at(d(-ago), 11), note });
  const FRAME = `FRAMEWORK SUPPLY AGREEMENT\n\nBetween the Company and {{supplier}}.\nTerm: {{start}} to {{end}}.\nMaximum value: {{value}}.\n\n1. Prices are fixed for the term and quoted in KES exclusive of VAT.\n2. Delivery to the factory store at Athi River within 7 days of a purchase order.\n3. Goods must meet KEBS packaging standards and the approved drawings.\n4. Payment 45 days from a matched invoice.\n5. Either party may terminate with 60 days' written notice.`;
  const contracts: Contract[] = [
    {
      id: 'ct1',
      number: num('CT', 1),
      title: 'Packaging framework — cartons and film',
      supplierId: 's6',
      type: 'FRAMEWORK',
      start: d(-120),
      end: d(40),
      valueCap: 6_000_000,
      items: [
        { sku: 'PKG-BOX', description: 'Corrugated cartons — bundle of 100', unitPrice: 6_450, uom: 'bundles', qtyCap: 900 },
        { sku: 'PKG-FLM', description: 'Printed film roll', unitPrice: 17_800, uom: 'rolls', qtyCap: 80 }
      ],
      sites: [
        { site: 'Athi River factory', address: 'Off Mombasa Road, Athi River', rateAdjPct: 0, terms: 'Delivered' },
        { site: 'Mombasa port store', address: 'Shimanzi, Mombasa', rateAdjPct: 2, terms: 'Delivered, +2% freight' }
      ],
      customFields: { 'Business unit': 'Blending & packing', 'Contract owner': LUCY, 'Renewal option': '12 months' },
      status: 'ACTIVE',
      version: 2,
      versions: [ver(1, FRAME.replace('45 days', '30 days'), PETER, 130, 'First draft'), ver(2, FRAME, LUCY, 125, 'Agreed 45-day terms')],
      comments: [{ id: 'cc1', by: LUCY, at: at(d(-126), 10), text: 'Supplier asked for 30 days — we hold at 45.', internal: true }],
      signatures: [{ by: LUCY, at: at(d(-121), 16), method: 'TYPED', text: LUCY, meaning: 'Signed for the Company' }],
      risks: [{ id: 'rk1', text: 'Single source for printed film', level: 'MEDIUM', mitigation: 'Qualify Sigma Labels as second source by Q1' }],
      approvals: [{ by: AMINA, role: 'DIRECTOR', at: at(d(-122), 12) }],
      preparedBy: PETER,
      templateId: 'ctpl1',
      retentionYears: 7,
      access: 'PROCUREMENT',
      history: [h(d(-130), 9, PETER, 'Drafted from template'), h(d(-123), 10, PETER, 'Submitted for approval'), h(d(-122), 12, AMINA, 'Approved'), h(d(-121), 16, LUCY, 'Signed'), h(d(-120), 8, 'System', 'Activated')]
    },
    {
      id: 'ct2',
      number: num('CT', 2),
      title: 'Raw tea long-term agreement — Kericho',
      supplierId: 's11',
      type: 'LTA',
      start: d(-60),
      end: d(300),
      valueCap: 3_200_000,
      items: [{ sku: 'RAW-A', description: 'Raw material grade A (tonne)', unitPrice: 85_000, uom: 'tonnes', qtyCap: 40 }],
      sites: [{ site: 'Mombasa port store', address: 'Shimanzi, Mombasa', rateAdjPct: 0, terms: 'Ex-garden, buyer collects' }],
      customFields: { 'Tea grades': 'BP1, PF1', 'Auction reference': 'Mombasa Tea Auction', 'Contract owner': LUCY },
      status: 'ACTIVE',
      version: 1,
      versions: [ver(1, 'LONG-TERM AGREEMENT\n\nRift Agro Inputs Ltd supplies up to 40 tonnes of BP1/PF1 CTC tea at KES 85,000 per tonne.\nQuality per Tea Board of Kenya grading; samples tasted before dispatch.', LUCY, 64, 'Agreed')],
      comments: [],
      signatures: [{ by: AMINA, at: at(d(-61), 15), method: 'TYPED', text: AMINA, meaning: 'Signed for the Company' }],
      risks: [{ id: 'rk2', text: 'Weather-driven price swings at the auction', level: 'HIGH', mitigation: 'Fixed price for 40 t; review quarterly' }],
      approvals: [{ by: AMINA, role: 'DIRECTOR', at: at(d(-62), 12) }],
      preparedBy: LUCY,
      eventId: 'ev5',
      retentionYears: 10,
      access: 'MANAGEMENT',
      history: [h(d(-64), 9, LUCY, 'Created from award', e5.number), h(d(-62), 12, AMINA, 'Approved'), h(d(-61), 15, AMINA, 'Signed'), h(d(-60), 8, 'System', 'Activated')]
    },
    {
      id: 'ct3',
      number: num('CT', 3),
      title: 'Generator and line maintenance SLA',
      supplierId: 's8',
      type: 'SERVICE',
      start: d(10),
      end: d(375),
      valueCap: 960_000,
      items: [{ sku: 'SPR-GEN', description: 'Generator service kit (fitted)', unitPrice: 45_000, uom: 'kits' }],
      sites: [{ site: 'Athi River factory', address: 'Off Mombasa Road, Athi River', rateAdjPct: 0, terms: 'Response within 4 hours' }],
      customFields: { 'Response time': '4 hours', 'Contract owner': 'Maintenance Lead' },
      status: 'DRAFT',
      version: 2,
      versions: [
        ver(1, 'SERVICE LEVEL AGREEMENT\n\nBaraka Maintenance Ltd services the standby generator quarterly.\nResponse time: 8 hours.\nPayment 30 days.', PETER, 6, 'First draft'),
        ver(2, 'SERVICE LEVEL AGREEMENT\n\nBaraka Maintenance Ltd services the standby generator quarterly.\nResponse time: 4 hours, 24/7 during blending season.\nService credits of 5% for each missed response.\nPayment 30 days.', LUCY, 2, 'Tightened response time and added service credits')
      ],
      comments: [{ id: 'cc2', by: 'Samuel Kibet (supplier)', at: at(d(-1), 9), text: 'We can do 4 hours but ask for 6 hours on public holidays.', internal: false }],
      signatures: [],
      risks: [],
      approvals: [],
      preparedBy: PETER,
      retentionYears: 7,
      access: 'ALL',
      history: [h(d(-6), 9, PETER, 'Drafted'), h(d(-2), 10, LUCY, 'Version 2 saved')]
    },
    {
      id: 'ct4',
      number: num('CT', 4),
      title: 'Labels supply agreement',
      supplierId: 's12',
      type: 'PRODUCT',
      start: d(-200),
      end: d(165),
      valueCap: 1_200_000,
      items: [{ sku: 'PKG-LBL', description: 'Labels — roll of 5,000', unitPrice: 4_100, uom: 'rolls', qtyCap: 260 }],
      sites: [],
      customFields: { 'Contract owner': PETER },
      status: 'ACTIVE',
      version: 1,
      versions: [ver(1, 'PRODUCT SUPPLY AGREEMENT\n\nSigma Labels & Print supplies printed labels at KES 4,100 per roll of 5,000.', PETER, 205, 'Agreed')],
      comments: [],
      signatures: [{ by: LUCY, at: at(d(-201), 15), method: 'TYPED', text: LUCY, meaning: 'Signed for the Company' }],
      risks: [],
      approvals: [{ by: LUCY, role: 'MANAGER', at: at(d(-202), 12) }],
      preparedBy: PETER,
      retentionYears: 7,
      access: 'ALL',
      history: [h(d(-205), 9, PETER, 'Drafted'), h(d(-202), 12, LUCY, 'Approved'), h(d(-200), 8, 'System', 'Activated')]
    }
  ];

  const awaitingS6 = com.purchaseOrders.find((o) => o.supplierId === 's6' && o.sentAt && o.lines.every((l) => l.received === 0));
  const toBillS8 = com.purchaseOrders.find((o) => o.supplierId === 's8' && o.lines.some((l) => l.received > l.billed));
  const partS12 = com.purchaseOrders.find((o) => o.supplierId === 's12' && o.lines.some((l) => l.received > l.billed));
  const rawPo = com.purchaseOrders.find((o) => o.supplierId === 's11' && o.closed);

  const templates: OutputTemplate[] = OUTPUT_DOCS.map((docType) => ({ docType, title: docType.toUpperCase(), footer: docType === 'Purchase order' ? 'Quote the PO number on your delivery note and invoice. Goods are inspected at the gate.' : 'Integrated ERP — tea blending & trading', showLogo: true, language: 'EN', showSignatures: true }));

  return {
    events: [e1, e2, e3, e4, e5],
    rfxTemplates: [
      { id: 'tpl1', name: 'Packaging RFQ (standard)', kind: 'RFQ', category: 'Packaging', lots: [lotOf('t1a', 'Cartons', [['PKG-BOX', 300]])], questionnaire: STANDARD_QUESTIONNAIRE, terms: 'Prices in KES exclusive of VAT, delivered to Athi River.' },
      { id: 'tpl2', name: 'Services RFP', kind: 'RFP', category: 'Services', lots: [lotOf('t2a', 'Service', [['Haulage', 12, 'Monthly service']])], questionnaire: STANDARD_QUESTIONNAIRE, terms: 'Monthly invoicing against service acceptance certificates.' }
    ],
    suppliers,
    formConfig: [
      { category: 'Default', required: ['name', 'idType', 'idNumber', 'email', 'phone', 'paymentMethod', 'bank'], documents: ['TAX_COMPLIANCE'] },
      { category: 'Raw materials', required: ['name', 'idType', 'idNumber', 'email', 'phone', 'contactPerson', 'region', 'paymentMethod', 'bank', 'taxonomy'], documents: ['TAX_COMPLIANCE', 'TEA_BOARD_LICENCE'] },
      { category: 'Logistics', required: ['name', 'idType', 'idNumber', 'email', 'phone', 'contactPerson', 'paymentMethod', 'bank'], documents: ['TAX_COMPLIANCE', 'INSURANCE'] }
    ],
    evaluations: [
      { id: 'se1', supplierId: 's6', period: `${year}-Q2`, scores: { quality: 4, delivery: 5, price: 3, service: 4, compliance: 5 }, evaluator: LUCY, comment: 'Dependable; prices slightly above market', at: at(d(-80), 10) },
      { id: 'se2', supplierId: 's11', period: `${year}-Q2`, scores: { quality: 5, delivery: 3, price: 4, service: 4, compliance: 5 }, evaluator: LUCY, comment: 'Excellent liquors; one late consignment', at: at(d(-80), 10) },
      { id: 'se3', supplierId: 's12', period: `${year}-Q2`, scores: { quality: 4, delivery: 3, price: 4, service: 3, compliance: 4 }, evaluator: PETER, comment: 'Part deliveries common', at: at(d(-80), 11) }
    ],
    catalogue: [
      { id: 'sc1', supplierId: 's6', sku: 'PKG-BOX', supplierSku: 'GF-CB100-5P', description: '5-ply carton, bundle of 100', uom: 'bundles', price: 6_450, leadDays: 7, status: 'APPROVED', submittedAt: at(d(-120), 10), decidedBy: LUCY },
      { id: 'sc2', supplierId: 's12', supplierSku: 'SL-FOIL-5K', description: 'Foil-lined tea labels, roll of 5,000', uom: 'rolls', price: 4_600, leadDays: 10, status: 'PENDING', submittedAt: at(d(-2), 15) }
    ],
    asns: awaitingS6
      ? [{ id: 'asn1', number: num('ASN', 1), poId: awaitingS6.id, supplierId: 's6', shipDate: d(0), eta: d(1), carrier: 'Greenfield own fleet', vehicle: 'KCX 412Q', lines: awaitingS6.lines.map((l) => ({ lineId: l.id, qty: l.qty, lot: `GF-${year}-${l.sku}` })), status: 'SUBMITTED', at: at(d(0), 8) }]
      : [],
    contracts,
    contractTemplates: [
      { id: 'ctpl1', name: 'Framework supply agreement', type: 'FRAMEWORK', body: FRAME },
      { id: 'ctpl2', name: 'Service level agreement', type: 'SERVICE', body: 'SERVICE LEVEL AGREEMENT\n\nBetween the Company and {{supplier}} for {{title}}.\nTerm: {{start}} to {{end}}.\nContract value up to {{value}}.\n\n1. Service levels as scheduled.\n2. Monthly invoicing against signed acceptance certificates.' }
    ],
    clauses: [
      { id: 'cl1', title: 'Payment terms', category: 'Commercial', body: 'Payment is made within 45 days of a correctly matched invoice, by EFT to the bank account on the supplier master.' },
      { id: 'cl2', title: 'Delivery and risk', category: 'Commercial', body: 'Risk passes on signed delivery at the named site. Short or damaged goods are noted on the goods-received note.' },
      { id: 'cl3', title: 'Tea quality', category: 'Quality', body: 'Teas must match the tasted sample and Tea Board of Kenya grading. Rejected lots are returned at the supplier’s cost.' },
      { id: 'cl4', title: 'Data protection', category: 'Legal', body: 'Each party processes personal data in line with the Kenya Data Protection Act, 2019.' },
      { id: 'cl5', title: 'Anti-bribery', category: 'Legal', body: 'The supplier shall not offer any gift or inducement to any employee of the Company.' },
      { id: 'cl6', title: 'Force majeure', category: 'Legal', body: 'Neither party is liable for delay caused by events beyond its reasonable control, including port closures and civil unrest.' },
      { id: 'cl7', title: 'Termination', category: 'Legal', body: 'Either party may terminate on 60 days’ written notice, or immediately for material breach not remedied within 14 days.' }
    ],
    rules: [
      { id: 'ar1', name: 'Requisitions — manager', doc: 'REQUISITION', minValue: 0, steps: [{ role: 'MANAGER', kind: 'APPROVE' }], active: true },
      { id: 'ar2', name: 'Requisitions over KES 1M', doc: 'REQUISITION', minValue: 1_000_001, steps: [{ role: 'MANAGER', kind: 'APPROVE' }, { role: 'DIRECTOR', kind: 'APPROVE' }], active: true },
      { id: 'ar3', name: 'Purchase orders — manager, notify stores', doc: 'PO', minValue: 0, steps: [{ role: 'MANAGER', kind: 'APPROVE' }, { role: 'STOREKEEPER', kind: 'NOTIFY' }], active: true },
      { id: 'ar4', name: 'Purchase orders over KES 1M', doc: 'PO', minValue: 1_000_001, steps: [{ role: 'MANAGER', kind: 'APPROVE' }, { role: 'DIRECTOR', kind: 'APPROVE' }, { role: 'STOREKEEPER', kind: 'NOTIFY' }], active: true },
      { id: 'ar5', name: 'Raw tea orders from KES 500K', doc: 'PO', minValue: 500_000, category: 'Raw materials', steps: [{ role: 'MANAGER', kind: 'APPROVE' }, { role: 'DIRECTOR', kind: 'APPROVE' }], active: true },
      { id: 'ar6', name: 'New suppliers', doc: 'SUPPLIER', minValue: 0, steps: [{ role: 'MANAGER', kind: 'APPROVE' }, { role: 'OFFICER', kind: 'NOTIFY' }], active: true },
      { id: 'ar7', name: 'New tea producers', doc: 'SUPPLIER', minValue: 0, supplierType: 'TEA_PRODUCER', steps: [{ role: 'MANAGER', kind: 'APPROVE' }, { role: 'DIRECTOR', kind: 'APPROVE' }], active: true },
      { id: 'ar8', name: 'Supplier updates (bank, terms)', doc: 'SUPPLIER_UPDATE', minValue: 0, steps: [{ role: 'MANAGER', kind: 'APPROVE' }], active: true },
      { id: 'ar9', name: 'Contracts', doc: 'CONTRACT', minValue: 0, steps: [{ role: 'MANAGER', kind: 'APPROVE' }], active: true },
      { id: 'ar10', name: 'Contracts over KES 2M (legal + finance)', doc: 'CONTRACT', minValue: 2_000_000, steps: [{ role: 'MANAGER', kind: 'APPROVE' }, { role: 'DIRECTOR', kind: 'APPROVE' }], active: true },
      { id: 'ar11', name: 'Supplier catalogue prices', doc: 'CATALOGUE', minValue: 0, steps: [{ role: 'MANAGER', kind: 'APPROVE' }], active: true },
      { id: 'ar12', name: 'Invoice hold release', doc: 'INVOICE_HOLD', minValue: 0, steps: [{ role: 'MANAGER', kind: 'APPROVE' }], active: true },
      { id: 'ar13', name: 'Miscellaneous issues', doc: 'STORES_ISSUE', minValue: 0, steps: [{ role: 'MANAGER', kind: 'APPROVE' }], active: true },
      { id: 'ar14', name: 'Disposals', doc: 'DISPOSAL', minValue: 0, steps: [{ role: 'MANAGER', kind: 'APPROVE' }], active: true }
    ],
    adHoc: [],
    tolerances: [
      { id: 'tl1', scope: 'DEFAULT', mode: 'THREE_WAY', pricePct: 2, qtyPct: 0, amount: 1_000 },
      { id: 'tl2', scope: 's11', mode: 'THREE_WAY', pricePct: 1, qtyPct: 2, amount: 5_000 },
      { id: 'tl3', scope: 'Office', mode: 'TWO_WAY', pricePct: 5, qtyPct: 5, amount: 500 }
    ],
    invoices: [
      ...(toBillS8
        ? [
            {
              id: 'si1',
              number: num('SINV', 1),
              supplierId: 's8',
              supplierRef: 'BML/INV/2291',
              poId: toBillS8.id,
              date: d(-3),
              received: d(-2),
              currency: 'KES',
              fxRate: 1,
              kind: 'STANDARD' as const,
              lines: toBillS8.lines.map((l) => ({ id: `si1${l.id}`, poLineId: l.id, description: l.description, qty: l.received - l.billed, price: 47_500, account: '6400', vat: true })),
              charges: [],
              controlTotal: Math.round(toBillS8.lines.reduce((s, l) => s + (l.received - l.billed) * 47_500, 0) * 1.16 * 100) / 100,
              advanceApplied: 0,
              creditApplied: 0,
              source: 'SUPPLIER' as const,
              matchMode: 'THREE_WAY' as const,
              variances: [],
              status: 'CAPTURED' as const,
              preparedBy: 'Supplier portal',
              history: [h(d(-2), 9, 'Samuel Kibet (supplier)', 'Submitted on the supplier portal', 'PDF attached')]
            }
          ]
        : []),
      ...(partS12
        ? [
            {
              id: 'si2',
              number: num('SINV', 2),
              supplierId: 's12',
              supplierRef: 'SLP-88412',
              poId: partS12.id,
              date: d(-1),
              received: d(0),
              currency: 'KES',
              fxRate: 1,
              kind: 'STANDARD' as const,
              lines: partS12.lines.map((l) => ({ id: `si2${l.id}`, poLineId: l.id, description: l.description, qty: l.received - l.billed, price: l.price, account: '5000', vat: true })),
              charges: [{ type: 'SHIPPING' as const, amount: 2_500 }],
              controlTotal: Math.round((partS12.lines.reduce((s, l) => s + (l.received - l.billed) * l.price, 0) + 2_500) * 1.16 * 100) / 100,
              advanceApplied: 0,
              creditApplied: 0,
              source: 'INTERNAL' as const,
              matchMode: 'THREE_WAY' as const,
              variances: [],
              status: 'CAPTURED' as const,
              preparedBy: PETER,
              history: [h(d(0), 9, PETER, 'Captured from the supplier’s paper invoice')]
            }
          ]
        : [])
    ],
    notes: [
      { id: 'sn1', number: num('SCN', 1), kind: 'CREDIT', supplierId: 's6', grnRef: num('GRN', 1), reason: '12 cartons crushed in transit — supplier credit', amount: 9_048, status: 'APPROVED', preparedBy: PETER, approvals: [{ by: LUCY, role: 'MANAGER', at: at(d(-30), 11) }], history: [h(d(-31), 9, PETER, 'Credit note received'), h(d(-30), 11, LUCY, 'Approved')] },
      { id: 'sn2', number: num('SDN', 1), kind: 'DEBIT', supplierId: 's11', grnRef: num('GRN', 2), reason: 'Moisture above 3% on 0.5 t — price reduction agreed', amount: 21_250, status: 'SUBMITTED', preparedBy: PETER, approvals: [], history: [h(d(-2), 14, PETER, 'Debit note raised'), h(d(-2), 14, PETER, 'Submitted for approval')] }
    ],
    fx: { KES: 1, USD: 129.5, EUR: 140.2, GBP: 164.8, UGX: 0.035, TZS: 0.049 },
    items,
    lots,
    warehouses,
    moves: [
      { id: 'mv1', number: num('GI', 1), kind: 'ISSUE', date: d(-9), sku: 'PKG-BOX', qty: 20, from: 'WH-FAC', costCentre: 'Blending line 1', reason: 'Packing BP1 blend for Mombasa order', value: 130_000, by: JOHN, status: 'POSTED' },
      { id: 'mv2', number: num('GR', 1), kind: 'RETURN', date: d(-8), sku: 'PKG-BOX', qty: 4, to: 'WH-FAC', costCentre: 'Blending line 1', reason: 'Unused cartons returned to stores', value: 26_000, by: JOHN, status: 'POSTED' },
      { id: 'mv3', number: num('GI', 2), kind: 'MISC_ISSUE', date: d(-1), sku: 'OFC-PPR', qty: 10, from: 'WH-NBO', costCentre: 'Administration', reason: 'Board pack printing', value: 28_000, by: JOHN, status: 'PENDING' }
    ],
    storesReqs: [
      { id: 'sr1', number: num('SR', 1), department: 'Operations', requestedBy: 'Blending supervisor', date: d(-1), warehouse: 'WH-FAC', plan: 'AUTO', lines: [{ id: 'sr1a', sku: 'PKG-BOX', qty: 30, issued: 0 }, { id: 'sr1b', sku: 'PKG-LBL', qty: 10, issued: 0 }], status: 'SUBMITTED', history: [h(d(-1), 8, 'Blending supervisor', 'Requested from stores')] },
      { id: 'sr2', number: num('SR', 2), department: 'Administration', requestedBy: 'Office Administrator', date: d(-2), warehouse: 'WH-NBO', plan: 'MANUAL', lines: [{ id: 'sr2a', sku: 'OFC-PPR', qty: 6, issued: 0 }], status: 'APPROVED', history: [h(d(-2), 9, 'Office Administrator', 'Requested from stores'), h(d(-2), 11, LUCY, 'Approved')] },
      { id: 'sr3', number: num('SR', 3), department: 'Operations', requestedBy: 'Maintenance Lead', date: d(-6), warehouse: 'WH-FAC', plan: 'AUTO', lines: [{ id: 'sr3a', sku: 'PKG-FLM', qty: 8, issued: 5 }], status: 'PART_ISSUED', history: [h(d(-6), 9, 'Maintenance Lead', 'Requested from stores'), h(d(-6), 10, LUCY, 'Approved'), h(d(-5), 14, JOHN, 'Issued 5 of 8 — balance on backorder')] }
    ],
    countSchedules: [
      { id: 'cs1', warehouse: 'WH-NBO', abc: 'A', everyDays: 30, lastDone: d(-35) },
      { id: 'cs2', warehouse: 'WH-MSA', abc: 'ALL', everyDays: 90, lastDone: d(-20) },
      { id: 'cs3', warehouse: 'WH-FAC', abc: 'B', everyDays: 60, lastDone: d(-10) }
    ],
    disposals: [
      { id: 'dp1', number: num('DSP', 1), sku: 'PKG-FLM', qty: 2, method: 'SPECIAL_WASTE', reason: 'Old print design — obsolete film, solvent inks', proceeds: 0, status: 'SUBMITTED', preparedBy: JOHN, approvals: [], history: [h(d(-2), 15, JOHN, 'Disposal requested')] },
      { id: 'dp2', number: num('DSP', 2), sku: 'OFC-PPR', qty: 3, method: 'BOARDED', reason: 'Water-damaged boxes sold to recycler', proceeds: 600, buyer: 'Mazingira Recyclers', status: 'DISPOSED', preparedBy: JOHN, approvals: [{ by: LUCY, role: 'MANAGER', at: at(d(-40), 10) }], certificate: 'NEMA/WTN/22871', history: [h(d(-41), 9, JOHN, 'Disposal requested'), h(d(-40), 10, LUCY, 'Approved'), h(d(-39), 15, JOHN, 'Disposed', 'Waste transfer note NEMA/WTN/22871')] }
    ],
    landed: rawPo
      ? [
          {
            id: 'lc1',
            number: num('LC', 1),
            poId: rawPo.id,
            charges: [
              { id: 'lc1a', type: 'FREIGHT', amount: 54_000, supplierId: 's4', ref: 'Kericho → Mombasa, 18 t' },
              { id: 'lc1b', type: 'INSURANCE', amount: 9_200, supplierId: '', ref: 'Marine & transit cover' },
              { id: 'lc1c', type: 'LABOUR', amount: 12_600, supplierId: '', ref: 'Casual labour — sorting and re-bagging' }
            ],
            allocation: 'QTY',
            status: 'DRAFT',
            bills: [],
            history: [h(d(-5), 10, PETER, 'Landed cost started')]
          }
        ]
      : [],
    clearance: [
      {
        id: 'cf1',
        number: num('CF', 1),
        direction: 'IMPORT',
        ownerType: 'THIRD_PARTY',
        client: 'Highland Agro Ltd',
        customerId: 'c6',
        agent: 'Bahari Clearing & Forwarding Ltd',
        entryNo: `${year}MSA4471223`,
        goods: '1 x 20ft — tea packaging machinery spares from Dubai',
        milestones: [
          { key: 'idf', label: 'IDF lodged', done: d(-12) },
          { key: 'manifest', label: 'Manifest / arrival', done: d(-6) },
          { key: 'entry', label: 'Customs entry passed', done: d(-4) },
          { key: 'duty', label: 'Duty paid' },
          { key: 'release', label: 'Released by KPA / KRA' },
          { key: 'delivered', label: 'Delivered to client' }
        ],
        charges: [{ type: 'Agency fee', amount: 35_000 }, { type: 'KPA port charges', amount: 48_500 }, { type: 'Transport to Nairobi', amount: 95_000 }],
        feePct: 10,
        history: [h(d(-12), 9, PETER, 'Clearing file opened for Highland Agro')]
      }
    ],
    plan: {
      year: Number(year),
      status: 'APPROVED',
      lines: [
        { id: 'pl1', category: 'Packaging', sku: 'PKG-BOX', description: 'Corrugated cartons for the blending season', department: 'Operations', qty: 2_400, estValue: 15_600_000, quarter: 3, method: 'FRAMEWORK' },
        { id: 'pl2', category: 'Packaging', sku: 'PKG-FLM', description: 'Printed film', department: 'Operations', qty: 90, estValue: 1_620_000, quarter: 3, method: 'AUCTION' },
        { id: 'pl3', category: 'Packaging', sku: 'PKG-LBL', description: 'Labels', department: 'Operations', qty: 500, estValue: 2_100_000, quarter: 4, method: 'RFQ' },
        { id: 'pl4', category: 'Raw materials', sku: 'RAW-A', description: 'Raw tea — Kericho LTA and Mombasa auction', department: 'Operations', qty: 120, estValue: 10_200_000, quarter: 4, method: 'FRAMEWORK' },
        { id: 'pl5', category: 'Spares', sku: 'SPR-GEN', description: 'Generator service kits', department: 'Operations', qty: 12, estValue: 552_000, quarter: 2, method: 'DIRECT' },
        { id: 'pl6', category: 'Office', sku: 'OFC-PPR', description: 'Office paper', department: 'Administration', qty: 160, estValue: 448_000, quarter: 1, method: 'RFQ' },
        { id: 'pl7', category: 'Services', description: 'Haulage Mombasa → Athi River', department: 'Operations', qty: 240, estValue: 7_200_000, quarter: 4, method: 'RFP' }
      ],
      approvals: [{ by: AMINA, role: 'DIRECTOR', at: at(`${year}-01-10`, 12) }],
      history: [h(`${year}-01-05`, 9, LUCY, 'Plan prepared'), h(`${year}-01-10`, 12, AMINA, 'Approved')]
    },
    reports: [{ id: 'rp1', name: 'Open orders by supplier', owner: LUCY, shared: true, dataset: 'POS', columns: ['number', 'supplier', 'stage', 'value'], filter: '', groupBy: 'supplier' }],
    templates,
    branding: { name: 'Tea Procurement Hub', colour: '#237857', welcome: 'Buy from the catalogue and contracts first — it is faster and keeps prices on agreement.', logoText: 'IE' },
    signatures: {},
    reqExt: Object.fromEntries(
      com.requisitions.map((r) => {
        const sku = r.lines[0]?.sku ?? '';
        return [r.id, { budgetAccount: com.products.find((p) => p.sku === sku)?.account, planLineId: { 'PKG-BOX': 'pl1', 'PKG-FLM': 'pl2', 'PKG-LBL': 'pl3', 'RAW-A': 'pl4', 'SPR-GEN': 'pl5', 'OFC-PPR': 'pl6' }[sku], customFields: {} }];
      })
    ),
    poExt: {},
    grnExt: {},
    settings: { backdateDays: 30, autoReorder: false, autoApproveOnContract: true, withholdingVat: true, miscIssueLimit: 20_000, contractAlertDays: 60, docAlertDays: 30 },
    portalSupplier: 's6',
    alertsSent: [],
    sequence: { RFX: 5, SUP: sn, CT: 4, SINV: 2, SCN: 1, SDN: 1, GI: 2, GR: 1, SR: 3, DSP: 2, LC: 1, CF: 1, ASN: 1, ADJ: 0, TRF: 0 }
  };
};
