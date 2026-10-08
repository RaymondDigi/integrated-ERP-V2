import { addDays, TODAY } from '../finance/engine';
import type { FinanceState, HistoryEntry } from '../finance/types';
import { blankProfile, blendCost, priceForMargin } from './tradeEngine';
import type { Activity, Product } from './types';
import type { CommercialState } from './types';
import type { AuctionLot, AuctionSale, Contract, CustomerProfile, Feedback, KycRecord, TradeState } from './tradeTypes';

/**
 * Seed for everything Trading & Business Development added: price books, the customer master extension, the tea
 * auction, tasting and samples, blends, returns, contracts and customer feedback. Kenyan tea trading context.
 */

const d = (offset: number) => addDays(TODAY, offset);
const at = (date: string, h = 10) => `${date}T${String(h).padStart(2, '0')}:20:00`;
const year = TODAY.slice(0, 4);
const num = (prefix: string, n: number) => `${prefix}-${year}-${String(n).padStart(4, '0')}`;
const h = (date: string, by: string, action: string, note?: string): HistoryEntry => ({ at: at(date), by, action, note });

const PETER = 'Peter Mwangi';
const LUCY = 'Lucy Njeri';
const JOHN = 'John Kiprop';

/** Barcodes, weights, substitutes and tea attributes for the seeded catalogue, plus bulk tea grades. */
const EXT: Record<string, Partial<Product>> = {
  'STD-24': { upc: '6161100240015', barcodes: ['6161100240022'], weightKg: 6, attributes: { grade: 'BP1', origin: 'Kericho', packSize: '250 g packet' }, substitutes: ['BLK-25'], complements: [{ sku: 'SMP-50', script: 'Add a box of sample sachets for in-store tasting — retailers who sample sell 20% more.' }], uomPrices: [{ uom: 'packets', factor: 24, price: 210 }] },
  'PRM-12': { upc: '6161100120018', weightKg: 3.5, attributes: { grade: 'PF1', origin: 'Nandi', packSize: 'Tea bags 100s' }, substitutes: ['ORG-12'], complements: [{ sku: 'GFT-06', script: 'Hotels buying the premium range often take gift boxes for guest rooms.' }] },
  'GFT-06': { upc: '6161100060017', weightKg: 1.8, attributes: { grade: 'BP1', origin: 'Nyeri', packSize: '250 g packet' }, substitutes: ['PRM-12'] },
  'BLK-25': { upc: '6161100250014', weightKg: 25, attributes: { grade: 'PD', origin: 'Kisii', packSize: '25 kg sack' }, substitutes: ['TEA-PD'], uomPrices: [{ uom: 'kg', factor: 0.04, price: 395 }] },
  'ORG-12': { upc: '6161100121015', weightKg: 3.2, attributes: { grade: 'PF1', origin: 'Meru', packSize: 'Tea bags 100s' }, substitutes: ['PRM-12'], requiresCert: 'MRL certificate' },
  'SMP-50': { upc: '6161100500016', weightKg: 1.2, attributes: { packSize: '50 g sachet' } }
};

export const TEA_PRODUCTS: Product[] = [
  { sku: 'TEA-BP1', name: 'Kericho BP1 — bulk (per kg)', kind: 'GOODS', category: 'Bulk tea', unit: 'kg', price: 465, cost: 352, stock: 5_200, reorderLevel: 2_000, reorderQty: 5_000, vatable: true, account: '4000', upc: '6161100900014', weightKg: 1, attributes: { grade: 'BP1', garden: 'Momul', origin: 'Kericho', season: `${year} main crop` }, requiresCert: 'MRL certificate' },
  { sku: 'TEA-PF1', name: 'Nandi PF1 — bulk (per kg)', kind: 'GOODS', category: 'Bulk tea', unit: 'kg', price: 440, cost: 331, stock: 3_800, reorderLevel: 2_000, reorderQty: 4_000, vatable: true, account: '4000', upc: '6161100900021', weightKg: 1, attributes: { grade: 'PF1', garden: 'Kapchorua', origin: 'Nandi', season: `${year} main crop` } },
  { sku: 'TEA-PD', name: 'Kisii PD — bulk (per kg)', kind: 'GOODS', category: 'Bulk tea', unit: 'kg', price: 398, cost: 296, stock: 2_400, reorderLevel: 1_500, reorderQty: 3_000, vatable: true, account: '4000', upc: '6161100900038', weightKg: 1, attributes: { grade: 'PD', garden: 'Kiamokama', origin: 'Kisii', season: `${year} main crop` }, substitutes: ['TEA-PF1'] },
  { sku: 'TEA-D1', name: 'Nyeri Dust 1 — bulk (per kg)', kind: 'GOODS', category: 'Bulk tea', unit: 'kg', price: 372, cost: 270, stock: 900, reorderLevel: 1_000, reorderQty: 2_500, vatable: true, account: '4000', upc: '6161100900045', weightKg: 1, attributes: { grade: 'D1', garden: 'Gathuthi', origin: 'Nyeri', season: `${year} main crop` } }
];

export const extendProducts = (products: Product[]): Product[] => [
  ...products.map((p) => ({ ...p, ...EXT[p.sku], status: 'ACTIVE' as const, priceHistory: p.price ? [{ price: p.price, from: `${year}-01-01`, by: LUCY, note: 'Annual price list' }] : [] })),
  ...TEA_PRODUCTS.map((p) => ({ ...p, status: 'ACTIVE' as const, priceHistory: [{ price: p.price, from: d(-45), by: LUCY, note: 'Set from auction averages' }] }))
];

const verified = (ids: string[], date: string, extra: Partial<KycRecord> = {}): KycRecord[] =>
  ids.map((itemId) => ({ itemId, value: 'On file', docName: `${itemId}.pdf`, status: 'VERIFIED', by: PETER, verifiedBy: LUCY, at: at(date), ...extra }));

const lot = (lotNo: string, garden: string, grade: string, packages: number, kgPerPkg: number, valuation: number, extra: Partial<AuctionLot> = {}): AuctionLot => ({
  lotNo,
  invoiceNo: `${garden.slice(0, 3).toUpperCase()}/${lotNo}`,
  garden,
  grade,
  packages,
  netKg: packages * kgPerPkg,
  valuation,
  reserve: Math.round(valuation * 0.92 * 100) / 100,
  bids: [],
  status: 'OPEN',
  ...extra
});

export const buildTradeSeed = (fin: FinanceState, base: Pick<CommercialState, 'products' | 'orders' | 'quotations' | 'deliveries' | 'activities' | 'opportunities'>): TradeState => {
  const kycAll = ['k1', 'k2', 'k3', 'k4'];
  const profile = (customerId: string, p: Partial<CustomerProfile>): CustomerProfile => ({ ...blankProfile(customerId), kyc: verified(kycAll, d(-200)), ...p });
  const profiles: CustomerProfile[] = [
    profile('c1', {
      priceGroup: 'Retail chains',
      customerClass: 'Key account',
      termId: 'n30',
      contacts: [
        { id: 'ct1', name: 'Anne Wairimu', role: 'Marketing manager', email: 'anne@savannahretail.co.ke', phone: '+254 722 410 221', scope: 'main' },
        { id: 'ct2', name: 'Moses Kirui', role: 'Accounts payable', email: 'accounts@savannahretail.co.ke', phone: '+254 722 410 222', scope: 'b1' },
        { id: 'ct3', name: 'Ruth Achieng', role: 'Receiving clerk, Westlands DC', email: 'dc@savannahretail.co.ke', phone: '+254 722 410 230', scope: 's1' }
      ],
      billTos: [{ id: 'b1', label: 'Head office accounts', address: 'Savannah House, Mombasa Road', town: 'Nairobi', county: 'Nairobi', country: 'Kenya', postalCode: '00200', contact: 'Moses Kirui' }],
      shipTos: [
        { id: 's1', label: 'Westlands distribution centre', address: 'Off Waiyaki Way, Gate B', town: 'Nairobi', county: 'Nairobi', country: 'Kenya', postalCode: '00100', contact: 'Ruth Achieng', instructions: 'Deliver 7am–1pm. Book a dock slot 24 hours ahead. Pallets must be shrink-wrapped.', defaultWarehouse: 'WH-NBO', zone: 'Nairobi' },
        { id: 's2', label: 'Mombasa Nyali branch', address: 'Links Road, Nyali', town: 'Mombasa', county: 'Mombasa', country: 'Kenya', postalCode: '80100', contact: 'Branch manager', instructions: 'Call the branch 1 hour before arrival.', defaultWarehouse: 'WH-MSA', zone: 'Coast', termId: 'n45' }
      ],
      minOrderValue: 50_000,
      minOrderCharge: 3_500,
      cancelLimit: 500_000,
      rating: 'A — Strategic',
      priority: 1,
      duplicatePo: 'BLOCK',
      docFormat: { layout: 'DETAILED', language: 'EN', showCustomerCodes: true, showInstructions: true, footer: 'Quote our vendor number SAV-2291 on all correspondence.' },
      customerItems: [
        { customerCode: 'SAV-TEA-STD', sku: 'STD-24' },
        { customerCode: 'SAV-TEA-SMP', sku: 'SMP-50' }
      ],
      maxOverdueDays: 60,
      history: [h(d(-200), LUCY, 'Customer master set up')]
    }),
    profile('c2', { priceGroup: 'Hospitality', customerClass: 'Hotel group', termId: 'n30', rating: 'B — Standard', shipTos: [{ id: 's1', label: 'Lakeview Naivasha', address: 'Moi South Lake Road', town: 'Nakuru', country: 'Kenya', postalCode: '20100', zone: 'Rift Valley', instructions: 'Deliver to the kitchen store, not reception.' }], contacts: [{ id: 'ct1', name: 'James Kariuki', role: 'General manager', email: 'gm@lakeviewhotels.co.ke', phone: '+254 733 118 900', scope: 'main' }] }),
    profile('c3', { priceGroup: 'Institutions', termId: 'n45', rating: 'B — Standard', financeChargeExempt: true, contacts: [{ id: 'ct1', name: 'Dr. Wanjiru', role: 'Administrator', email: 'admin@nmc.co.ke', phone: '+254 711 300 100', scope: 'main' }] }),
    profile('c4', {
      priceGroup: 'Distributors',
      customerClass: 'Distributor',
      termId: 'n60',
      rating: 'A — Strategic',
      priority: 1,
      freightOnBackorders: false,
      restockFeePct: 5,
      maxOverdueDays: 45,
      shipTos: [{ id: 's1', label: 'Nakuru depot', address: 'Industrial Area, Kenyatta Avenue', town: 'Nakuru', county: 'Nakuru', country: 'Kenya', postalCode: '20100', zone: 'Rift Valley', instructions: 'Offload with the depot forklift. Signed GRN required.', defaultWarehouse: 'WH-NBO' }],
      contacts: [{ id: 'ct1', name: 'Mary Achieng', role: 'Procurement', email: 'procurement@rvdistributors.co.ke', phone: '+254 720 556 700', scope: 'main' }],
      regulatory: { licenceNo: 'TBK/DL/0417', licenceType: 'Tea Board dealer licence', expiry: d(240), restrictedCountries: [], certificates: [] }
    }),
    profile('c5', { priceGroup: 'Hospitality', termId: 'n30', rating: 'C — Watch', maxOverdueDays: 30, cancelLimit: 200_000, contacts: [{ id: 'ct1', name: 'Paul Mwende', role: 'Events', email: 'events@coasthospitality.co.ke', phone: '+254 741 902 300', scope: 'main' }] }),
    profile('c6', { termId: 'n45', rating: 'B — Standard', parentCustomerId: undefined, shipTos: [{ id: 's1', label: 'Kitale stores', address: 'Highland Agro yard', town: 'Kitale', country: 'Kenya', postalCode: '30200', zone: 'Rift Valley' }] }),
    profile('c7', { priceGroup: 'Retail chains', customerClass: 'Key account', termId: 'n60', rating: 'A — Strategic', priority: 1, parentCustomerId: 'c1', duplicatePo: 'WARN', customerItems: [{ customerCode: 'MET-88812', sku: 'STD-24' }, { customerCode: 'MET-88815', sku: 'BLK-25' }] }),
    profile('c8', {
      priceGroup: 'Export',
      customerClass: 'Export distributor',
      termId: 'n60',
      rating: 'A — Strategic',
      shipTos: [{ id: 's1', label: 'Jebel Ali warehouse', address: 'Plot S30214, JAFZA South', town: 'Dubai', country: 'United Arab Emirates', postalCode: 'DXB', zone: 'Export', instructions: 'Container to Jebel Ali via Mombasa. Halal and MRL certificates must travel with the documents.' }],
      docFormat: { layout: 'EXPORT', language: 'EN', showCustomerCodes: false, showInstructions: true, footer: 'FOB Mombasa. Payment by LC at sight.' },
      regulatory: { licenceNo: 'EPZ/EX/2231', licenceType: 'Tea export licence', expiry: d(120), restrictedCountries: ['Iran', 'Syria'], certificates: ['MRL certificate'] }
    })
  ];

  const kycTemplates = [
    { id: 'k1', name: 'Certificate of incorporation', required: true, docType: 'PDF', expiryMonths: 0, active: true },
    { id: 'k2', name: 'KRA PIN certificate', required: true, docType: 'PDF', expiryMonths: 0, active: true },
    { id: 'k3', name: 'CR12 — directors and shareholders', required: true, docType: 'PDF', expiryMonths: 12, active: true },
    { id: 'k4', name: 'Bank reference letter', required: true, docType: 'PDF', expiryMonths: 12, active: true },
    { id: 'k5', name: 'Tea Board of Kenya dealer licence', required: false, docType: 'PDF', expiryMonths: 12, active: true },
    { id: 'k6', name: 'Trade references (2)', required: false, docType: 'PDF', expiryMonths: 0, active: true }
  ];

  const applications = [
    {
      id: 'ap1',
      number: num('ONB', 1),
      company: 'Mlima Farmers Cooperative',
      pin: 'P052009911K',
      contact: 'Joyce Chebet',
      email: 'chair@mlimacoop.co.ke',
      phone: '+254 712 004 551',
      town: 'Kericho',
      category: 'Agriculture',
      requestedLimit: 1_500_000,
      channel: 'OFFICER' as const,
      kyc: [...verified(['k1', 'k2'], d(-3)), { itemId: 'k3', value: 'CR12 dated last month', docName: 'cr12.pdf', status: 'SUBMITTED' as const, by: PETER, at: at(d(-2)) }],
      status: 'UNDER_REVIEW' as const,
      opportunityId: base.opportunities.find((o) => o.prospect === 'Mlima Farmers Cooperative')?.id,
      submittedAt: at(d(-4)),
      history: [h(d(-4), PETER, 'Application captured'), h(d(-3), LUCY, 'Incorporation and KRA PIN verified')]
    },
    {
      id: 'ap2',
      number: num('ONB', 2),
      company: 'Afya Clinics Network',
      pin: 'P052118822L',
      contact: 'Dr. Halima',
      email: 'ops@afyaclinics.co.ke',
      phone: '+254 733 776 120',
      town: 'Nairobi',
      category: 'Healthcare',
      requestedLimit: 800_000,
      channel: 'PORTAL' as const,
      kyc: [{ itemId: 'k1', value: 'Uploaded', docName: 'incorporation.pdf', status: 'SUBMITTED' as const, by: 'Customer portal', at: at(d(-1)) }],
      status: 'SUBMITTED' as const,
      submittedAt: at(d(-1)),
      history: [h(d(-1), 'Customer portal', 'Applied online')]
    }
  ];

  /* ---------------- Price books ---------------- */
  const priceLists = [
    {
      id: 'pl1',
      name: 'Savannah Retail — annual price book',
      scope: 'CUSTOMER' as const,
      customerId: 'c1',
      validFrom: `${year}-01-01`,
      validTo: `${year}-12-31`,
      basis: 'ORDER_DATE' as const,
      orderDiscountPct: 2,
      minOrderNet: 1_000_000,
      lines: [
        { sku: 'STD-24', price: 4_560 },
        { sku: 'STD-24', minQty: 200, price: 4_464 },
        { sku: 'SMP-50', discountPct: 20 }
      ],
      status: 'ACTIVE' as const,
      createdBy: PETER,
      approvedBy: LUCY,
      history: [h(`${year}-01-03`, PETER, 'Created'), h(`${year}-01-04`, LUCY, 'Approved and activated')]
    },
    {
      id: 'pl2',
      name: 'Rift Valley Distributors — supply contract',
      scope: 'CONTRACT' as const,
      customerId: 'c4',
      validFrom: d(-120),
      validTo: d(25),
      basis: 'SHIP_DATE' as const,
      lines: [
        { sku: 'BLK-25', discountPct: 6 },
        { sku: 'BLK-25', minAnnualQty: 400, discountPct: 9 },
        { sku: 'STD-24', discountPct: 5 }
      ],
      status: 'ACTIVE' as const,
      createdBy: PETER,
      approvedBy: LUCY,
      history: [h(d(-121), PETER, 'Created'), h(d(-120), LUCY, 'Approved and activated')]
    },
    {
      id: 'pl3',
      name: 'Hospitality group prices',
      scope: 'GROUP' as const,
      group: 'Hospitality',
      validFrom: `${year}-01-01`,
      validTo: `${year}-12-31`,
      basis: 'ORDER_DATE' as const,
      lines: [
        { sku: 'PRM-12', discountPct: 4 },
        { sku: 'GFT-06', discountPct: 5 },
        { sku: 'GFT-06', minQty: 100, discountPct: 8 }
      ],
      status: 'ACTIVE' as const,
      createdBy: PETER,
      approvedBy: LUCY,
      history: [h(`${year}-01-05`, LUCY, 'Approved and activated')]
    },
    {
      id: 'pl4',
      name: 'Festive season promotion',
      scope: 'PROMO' as const,
      validFrom: d(-10),
      validTo: d(50),
      basis: 'ORDER_DATE' as const,
      lines: [
        { sku: 'GFT-06', discountPct: 10 },
        { sku: 'ORG-12', discountPct: 7 }
      ],
      status: 'ACTIVE' as const,
      createdBy: LUCY,
      approvedBy: LUCY,
      history: [h(d(-12), LUCY, 'Created and activated')]
    },
    {
      id: 'pl5',
      name: 'Mombasa auction reference — last sale averages',
      scope: 'EXTERNAL' as const,
      validFrom: d(-14),
      validTo: d(30),
      basis: 'ORDER_DATE' as const,
      lines: [
        { sku: 'TEA-BP1', price: 458 },
        { sku: 'TEA-PF1', price: 431 },
        { sku: 'TEA-PD', price: 392 },
        { sku: 'TEA-D1', price: 361 }
      ],
      status: 'ACTIVE' as const,
      createdBy: 'EATTA import',
      approvedBy: LUCY,
      history: [h(d(-14), 'EATTA import (simulated)', 'Imported sale 38 averages')]
    },
    {
      id: 'pl6',
      name: 'Rush orders — 48-hour premium',
      scope: 'PROMO' as const,
      validFrom: `${year}-01-01`,
      validTo: `${year}-12-31`,
      basis: 'ORDER_DATE' as const,
      lines: [
        { sku: 'TEA-BP1', maxLeadDays: 2, premiumPct: 5, discountPct: 0 },
        { sku: 'TEA-PF1', maxLeadDays: 2, premiumPct: 5, discountPct: 0 }
      ],
      status: 'DRAFT' as const,
      createdBy: PETER,
      history: [h(d(-2), PETER, 'Created')]
    }
  ];

  /* ---------------- Auctions and tasting ---------------- */
  const auctions: AuctionSale[] = [
    {
      id: 'au1',
      saleNo: `Sale ${year}/40`,
      date: d(2),
      centre: 'Mombasa Tea Auction (EATTA)',
      broker: 'Africa Tea Brokers Ltd',
      fxRate: 129.4,
      status: 'OPEN',
      source: 'EATTA_IMPORT',
      lots: [
        lot('4012', 'Momul', 'BP1', 40, 65, 3.42, { bids: [{ customerId: 'c8', price: 3.45, at: at(d(-1), 9), by: 'Omar Haddad (portal)' }], tastingScore: 8.4 }),
        lot('4013', 'Kapchorua', 'PF1', 36, 62, 3.18, { bids: [{ customerId: 'c4', price: 3.1, at: at(d(-1), 11), by: PETER }, { customerId: 'c7', price: 3.2, at: at(d(-1), 12), by: PETER }] }),
        lot('4014', 'Kiamokama', 'PD', 30, 60, 2.95),
        lot('4015', 'Gathuthi', 'D1', 20, 58, 2.7),
        lot('4016', 'Toror', 'BP1', 44, 65, 3.36, { tastingScore: 7.6 }),
        lot('4017', 'Michimikuru', 'PF1', 28, 62, 3.05),
        lot('4018', 'Tegat', 'BMF', 18, 55, 2.2),
        lot('4019', 'Iriaini', 'FNGS', 12, 50, 1.85)
      ]
    },
    {
      id: 'au0',
      saleNo: `Sale ${year}/38`,
      date: d(-12),
      centre: 'Mombasa Tea Auction (EATTA)',
      broker: 'Africa Tea Brokers Ltd',
      fxRate: 129.1,
      status: 'CLOSED',
      source: 'EATTA_IMPORT',
      lots: [
        lot('3801', 'Momul', 'BP1', 40, 65, 3.4, { status: 'SOLD', hammerPrice: 3.55, buyerId: 'c8', bids: [{ customerId: 'c8', price: 3.55, at: at(d(-12)), by: PETER }] }),
        lot('3802', 'Chemomi', 'PF1', 34, 62, 3.2, { status: 'SOLD', hammerPrice: 3.34, buyerId: 'c4', bids: [{ customerId: 'c4', price: 3.34, at: at(d(-12)), by: PETER }] }),
        lot('3803', 'Kiamokama', 'PD', 30, 60, 3.0, { status: 'UNSOLD' })
      ]
    }
  ];
  const tastings = [
    { id: 'ts1', ref: '4012', saleId: 'au1', garden: 'Momul', grade: 'BP1', date: d(-1), taster: 'Grace Wanjiku (taster)', scores: { appearance: 8, infusion: 9, liquor: 8.5, body: 8, brightness: 8.5 }, remarks: 'Black, even, well made. Bright coppery infusion, brisk liquor with good body.', valuation: 3.45 },
    { id: 'ts2', ref: '4016', saleId: 'au1', garden: 'Toror', grade: 'BP1', date: d(-1), taster: 'Grace Wanjiku (taster)', scores: { appearance: 7.5, infusion: 7.5, liquor: 8, body: 7.5, brightness: 7.5 }, remarks: 'Slightly uneven leaf, liquor brisk but thinner.', valuation: 3.3 },
    { id: 'ts3', ref: 'TEA-BP1', garden: 'Momul', grade: 'BP1', date: d(-20), taster: 'Grace Wanjiku (taster)', scores: { appearance: 8, infusion: 8, liquor: 8.5, body: 8.5, brightness: 8 }, remarks: 'Warehouse stock — holds quality.', valuation: 3.5 }
  ];
  const samples = [
    { id: 'sm1', number: num('SMP', 1), recipient: 'Africa Tea Brokers Ltd', recipientType: 'BROKER' as const, lines: [{ sku: 'TEA-BP1', qty: 2, lotNo: '3801' }, { sku: 'TEA-PF1', qty: 2 }], reprint: false, status: 'RECEIVED' as const, courier: 'G4S courier', by: JOHN, date: d(-15) },
    { id: 'sm2', number: num('SMP', 2), recipient: 'Horizon Trading FZE (Dubai)', recipientType: 'BUYER' as const, lines: [{ sku: 'TEA-BP1', qty: 1, lotNo: '4012' }], reprint: true, status: 'DISPATCHED' as const, courier: 'DHL Express', by: JOHN, date: d(-2) }
  ];

  /* ---------------- Blends ---------------- */
  const blends = [
    {
      id: 'bl1',
      number: num('CFG', 1),
      name: 'Savannah House Blend — 250 g',
      customerId: 'c1',
      attributes: { grade: 'BP1', origin: 'Kericho', packSize: '250 g packet', flavour: 'Plain' },
      components: [
        { grade: 'BP1', origin: 'Kericho', pct: 60, costPerKg: 352 },
        { grade: 'PF1', origin: 'Nandi', pct: 30, costPerKg: 331 },
        { grade: 'PD', origin: 'Kisii', pct: 10, costPerKg: 296 }
      ],
      packaging: [{ sku: 'PKG-LBL', qtyPerUnit: 0.0002 }, { sku: 'PKG-FLM', qtyPerUnit: 0.0005 }],
      kgPerUnit: 0.25,
      line: 'Line 1 — Standard',
      batchSize: 200,
      hoursPerBatch: 6,
      marginPct: 32,
      unitCost: 0,
      unitPrice: 0,
      notes: [{ id: 'n1', at: at(d(-8)), by: PETER, text: 'Customer wants a brisker cup than the standard pack — kept 60% Kericho BP1.', internal: true }],
      createdBy: PETER,
      at: at(d(-8))
    }
  ];

  for (const b of blends) {
    b.unitCost = blendCost(b.components, b.kgPerUnit, b.packaging, base.products, b.batchSize, b.hoursPerBatch);
    b.unitPrice = priceForMargin(b.unitCost, b.marginPct);
  }

  /* ---------------- Returns ---------------- */
  const completed = base.orders.filter((o) => o.closed && o.status === 'APPROVED');
  const o1 = completed[1];
  const rmas = o1
    ? [
        {
          id: 'rm1',
          number: num('RMA', 1),
          orderId: o1.id,
          customerId: o1.customerId,
          type: 'STOCK' as const,
          lines: [{ lineId: o1.lines[0].id, qty: 6, reasonCodeId: 'r9', disposition: 'RESTOCK' as const }],
          feePct: 0,
          status: 'APPROVED' as const,
          requestedBy: PETER,
          receivingNo: num('RCV', 1),
          history: [h(d(-3), PETER, 'Return requested', 'Torn cartons on 6 units'), h(d(-2), LUCY, 'Approved — receiving document RCV sent to the warehouse')]
        }
      ]
    : [];

  /* ---------------- Contracts ---------------- */
  const contractTemplates = [
    {
      id: 'ct1',
      name: 'Annual supply agreement',
      clauses: [
        'This Supply Agreement is made between Integrated Tea Traders Ltd ("the Supplier") and {{customer}} (KRA PIN {{pin}}) ("the Buyer").',
        'Term: from {{start}} to {{end}}, renewable by written agreement 30 days before expiry.',
        'Prices: as set out in the price book "{{priceList}}". Prices exclude VAT at 16%.',
        'Credit: the Buyer is granted a credit limit of {{creditLimit}} on {{terms}}-day terms. Overdue accounts may be placed on hold.',
        'Quality: all tea is supplied to KEBS KS 65 and is accompanied by the batch MRL certificate where required.',
        'Disputes are referred to arbitration in Nairobi under the Arbitration Act, 1995.'
      ],
      steps: [
        { name: 'Draft prepared', owner: 'Commercial Officer', external: false, days: 0 },
        { name: 'Legal review', owner: 'Commercial Manager', external: false, days: 3 },
        { name: 'Sent to customer', owner: 'Commercial Officer', external: false, days: 5 },
        { name: 'Customer legal comments received', owner: 'Customer', external: true, days: 12 },
        { name: 'Signed by both parties', owner: 'Commercial Manager', external: true, days: 15 },
        { name: 'Copy filed with Finance', owner: 'Commercial Officer', external: false, days: 16 }
      ]
    },
    {
      id: 'ct2',
      name: 'Export distribution agreement',
      clauses: [
        'Exclusive distribution agreement between Integrated Tea Traders Ltd and {{customer}} for the territory stated in Schedule 1.',
        'Term: {{start}} to {{end}}.',
        'Pricing FOB Mombasa per "{{priceList}}". Payment by irrevocable letter of credit at sight; credit line {{creditLimit}}.',
        'The Distributor shall not re-export to sanctioned destinations.'
      ],
      steps: [
        { name: 'Draft prepared', owner: 'Commercial Officer', external: false, days: 0 },
        { name: 'Legal review', owner: 'Commercial Manager', external: false, days: 4 },
        { name: 'Sent to customer', owner: 'Commercial Officer', external: false, days: 6 },
        { name: 'Letter of credit confirmed by bank', owner: 'Customer bank', external: true, days: 20 },
        { name: 'Signed by both parties', owner: 'Commercial Manager', external: true, days: 22 }
      ]
    }
  ];
  const contract = (id: string, n: number, customerId: string, templateId: string, title: string, start: string, end: string, value: number, status: Contract['status'], doneSteps: number, extra: Partial<Contract> = {}): Contract => {
    const t = contractTemplates.find((x) => x.id === templateId)!;
    const party = fin.parties.find((p) => p.id === customerId);
    return {
      id,
      number: num('CTR', n),
      customerId,
      templateId,
      title,
      clauses: t.clauses.map((c) =>
        c
          .replace('{{customer}}', party?.name ?? '')
          .replace('{{pin}}', party?.pin ?? '')
          .replace('{{start}}', start)
          .replace('{{end}}', end)
          .replace('{{priceList}}', extra.priceListId ? priceLists.find((p) => p.id === extra.priceListId)?.name ?? '' : 'the current list prices')
          .replace('{{creditLimit}}', `KES ${(party?.creditLimit ?? 0).toLocaleString()}`)
          .replace('{{terms}}', String(party?.terms ?? 30))
      ),
      start,
      end,
      value,
      status,
      steps: t.steps.map((s, i) => ({ name: s.name, owner: s.owner, external: s.external, due: addDays(start, s.days - 20), done: i < doneSteps, doneAt: i < doneSteps ? at(addDays(start, s.days - 20)) : undefined, by: i < doneSteps ? (s.external ? 'Customer' : PETER) : undefined })),
      signatures: [],
      preparedBy: PETER,
      history: [h(addDays(start, -20), PETER, 'Contract generated')],
      ...extra
    };
  };
  const contracts: Contract[] = [
    contract('cn1', 1, 'c4', 'ct1', 'Bulk supply — Rift Valley Distributors', d(-340), d(25), 9_800_000, 'ACTIVE', 6, {
      priceListId: 'pl2',
      approvedBy: LUCY,
      signatures: [
        { by: LUCY, at: at(d(-345)), method: 'TYPED', text: LUCY, meaning: 'Signed for Integrated Tea Traders Ltd', party: 'COMPANY' },
        { by: 'Mary Achieng', at: at(d(-344)), method: 'TYPED', text: 'Mary Achieng', meaning: 'Signed for Rift Valley Distributors', party: 'CUSTOMER' }
      ]
    }),
    contract('cn2', 2, 'c1', 'ct1', 'Annual supply — Savannah Retail', `${year}-01-01`, `${year}-12-31`, 14_500_000, 'ACTIVE', 6, {
      priceListId: 'pl1',
      approvedBy: LUCY,
      signatures: [
        { by: LUCY, at: at(`${year}-01-02`), method: 'TYPED', text: LUCY, meaning: 'Signed for Integrated Tea Traders Ltd', party: 'COMPANY' },
        { by: 'Anne Wairimu', at: at(`${year}-01-02`), method: 'TYPED', text: 'Anne Wairimu', meaning: 'Signed for Savannah Retail Ltd', party: 'CUSTOMER' }
      ]
    }),
    contract('cn3', 3, 'c8', 'ct2', 'Gulf distribution — Horizon Trading', d(10), d(375), 24_000_000, 'REVIEW', 1)
  ];

  /* ---------------- Feedback and surveys ---------------- */
  const fb = (n: number, customerId: string, type: Feedback['type'], channel: Feedback['channel'], category: string, severity: Feedback['severity'], subject: string, day: number, status: Feedback['status'], extra: Partial<Feedback> = {}): Feedback => ({
    id: `fb${n}`,
    number: num('FB', n),
    customerId,
    type,
    channel,
    category,
    severity,
    subject,
    owner: PETER,
    status,
    at: at(d(day)),
    slaDue: d(day + (severity === 'HIGH' ? 2 : severity === 'MEDIUM' ? 5 : 10)),
    history: [h(d(day), PETER, 'Logged')],
    ...extra
  });
  const feedback = [
    fb(1, 'c7', 'COMPLAINT', 'PHONE', 'Delivery', 'HIGH', 'Part delivery — 100 cartons of standard pack still outstanding', -6, 'IN_PROGRESS', { orderId: base.orders.find((o) => o.customerId === 'c7' && !o.closed && o.status === 'APPROVED')?.id }),
    fb(2, 'c2', 'COMPLIMENT', 'EMAIL', 'Product quality', 'LOW', 'Guests love the premium range in the rooms', -20, 'CLOSED', { resolution: 'Thanked the GM; shared with production', resolvedAt: at(d(-19)), rating: 5 }),
    fb(3, 'c1', 'COMPLAINT', 'VISIT', 'Packaging', 'MEDIUM', 'Torn cartons on delivery to Westlands DC', -4, 'RESOLVED', { resolution: 'RMA raised for 6 cartons; driver briefed on stacking', resolvedAt: at(d(-2)), owner: LUCY }),
    fb(4, 'c5', 'COMPLAINT', 'EMAIL', 'Invoicing', 'MEDIUM', 'Invoice sent to the wrong email address', -12, 'OPEN'),
    fb(5, 'c4', 'SUGGESTION', 'VISIT', 'Product range', 'LOW', 'Would buy a 10 kg sack for smaller shops', -9, 'IN_PROGRESS')
  ];
  const surveys = [
    { id: 'sv1', customerId: 'c1', date: d(-30), nps: 9, csat: 5, comment: 'Reliable supplier' },
    { id: 'sv2', customerId: 'c2', date: d(-28), nps: 10, csat: 5, comment: 'Excellent premium range' },
    { id: 'sv3', customerId: 'c3', date: d(-25), nps: 7, csat: 4, comment: 'Good, but deliveries could be earlier' },
    { id: 'sv4', customerId: 'c4', date: d(-21), nps: 8, csat: 4, comment: 'Price competitive' },
    { id: 'sv5', customerId: 'c5', date: d(-15), nps: 5, csat: 3, comment: 'Invoices often wrong' },
    { id: 'sv6', customerId: 'c7', date: d(-10), nps: 6, csat: 3, comment: 'Part deliveries are a problem' },
    { id: 'sv7', customerId: 'c8', date: d(-5), nps: 9, csat: 5, comment: 'Fast export documents' }
  ];

  /* ---------------- Portal usage ---------------- */
  const kinds = ['LOGIN', 'CATALOGUE', 'STOCK_INQUIRY', 'ORDER_STATUS', 'LOGIN', 'CATALOGUE', 'BID', 'ORDER'] as const;
  const portalEvents = Array.from({ length: 36 }, (_, i) => ({
    id: `pe${i}`,
    at: at(d(-Math.floor(i / 2)), 8 + (i % 9)),
    customerId: ['c1', 'c7', 'c8', 'c2', 'c4'][i % 5],
    kind: kinds[i % kinds.length],
    channel: (i % 3 === 0 ? 'MOBILE' : 'WEB') as 'MOBILE' | 'WEB'
  }));

  /* ---------------- Enrich the seeded orders and quotes ---------------- */
  const sources = ['Existing customer', 'Referral', 'Trade fair', 'Website'];
  base.orders.forEach((o, i) => {
    o.leadSource = sources[i % sources.length];
    o.orderClass = o.customerId === 'c8' ? 'Export' : 'Local';
    o.channel = 'DIRECT';
    o.segment = 'B2B';
    o.paymentMode = 'ACCOUNT';
    o.priority = profiles.find((p) => p.customerId === o.customerId)?.priority ?? 2;
    const prof = profiles.find((p) => p.customerId === o.customerId);
    if (prof?.shipTos[0]) o.shipToId = prof.shipTos[0].id;
    if (i === 1) o.sourceCode = 'FEST-CAT';
  });
  base.quotations.forEach((q, i) => {
    q.leadSource = sources[i % sources.length];
    q.orderClass = q.customerId === 'c8' ? 'Export' : 'Local';
  });
  const held = base.orders.find((o) => o.status === 'APPROVED' && !o.closed && o.lines.every((l) => l.delivered === 0) && o.customerId === 'c2');
  if (held) {
    held.hold = { reasonCodeId: 'r5', note: 'Customer asked us to hold until their store renovation is complete', by: LUCY, at: at(d(-1)) };
    held.history.push(h(d(-1), LUCY, 'Put on hold', 'Customer request'));
  }
  // a customer-level buyer visit and a follow-up on the subsidiary
  const visits: Activity[] = [
    { id: 'vs1', opportunityId: '', customerId: 'c7', type: 'VISIT', subject: 'Buyer visit — Metro category team', due: d(-7), done: true, owner: PETER, outcome: 'Reviewed shelf share and part deliveries', visitScore: 3, visitReport: 'Buyer unhappy with part deliveries; wants a weekly delivery slot.' },
    { id: 'vs2', opportunityId: '', customerId: 'c1', type: 'VISIT', subject: 'Quarterly business review — Savannah Retail', due: d(5), done: false, owner: LUCY }
  ];
  base.activities.push(...visits);

  return {
    priceLists,
    pricing: { lowestPrice: false },
    reasonCodes: [
      { id: 'r1', kind: 'QUOTE_LOST', label: 'Price — competitor cheaper', active: true },
      { id: 'r2', kind: 'QUOTE_LOST', label: 'Delivery time too long', active: true },
      { id: 'r3', kind: 'QUOTE_LOST', label: 'Product did not meet the specification', active: true },
      { id: 'r4', kind: 'QUOTE_LOST', label: 'No response from the customer', active: true },
      { id: 'r5', kind: 'ORDER_HOLD', label: 'Customer request', active: true },
      { id: 'r6', kind: 'ORDER_HOLD', label: 'Credit review', active: true },
      { id: 'r7', kind: 'ORDER_HOLD', label: 'Awaiting MRL certificate', active: true },
      { id: 'r8', kind: 'QUOTE_CANCEL', label: 'Raised in error', active: true },
      { id: 'r9', kind: 'RMA', label: 'Damaged in transit', active: true },
      { id: 'r10', kind: 'RMA', label: 'Quality — off taste / below sample', active: true },
      { id: 'r11', kind: 'RMA', label: 'Wrong item shipped', active: true },
      { id: 'r12', kind: 'CLAIM', label: 'Short delivered', active: true },
      { id: 'r13', kind: 'ORDER_CANCEL', label: 'Customer cancelled', active: true },
      { id: 'r14', kind: 'QUOTE_CANCEL', label: 'Customer withdrew the enquiry', active: true }
    ],
    paymentTerms: [
      { id: 'cod', label: 'Cash on delivery', days: 0, discountPct: 0, discountDays: 0 },
      { id: 'n30', label: 'Net 30', days: 30, discountPct: 0, discountDays: 0 },
      { id: '2n30', label: '2% 10, net 30', days: 30, discountPct: 2, discountDays: 10 },
      { id: 'n45', label: 'Net 45', days: 45, discountPct: 0, discountDays: 0 },
      { id: 'n60', label: 'Net 60', days: 60, discountPct: 0, discountDays: 0 }
    ],
    freightRates: [
      { zone: 'Nairobi', perKg: 4, minCharge: 2_500, handling: 800 },
      { zone: 'Central', perKg: 6, minCharge: 3_500, handling: 800 },
      { zone: 'Rift Valley', perKg: 7, minCharge: 4_000, handling: 1_000 },
      { zone: 'Western', perKg: 8, minCharge: 4_500, handling: 1_000 },
      { zone: 'Coast', perKg: 9, minCharge: 5_000, handling: 1_200 },
      { zone: 'Upcountry', perKg: 10, minCharge: 5_500, handling: 1_200 },
      { zone: 'Export', perKg: 2.5, minCharge: 15_000, handling: 6_000 }
    ],
    campaigns: [
      { code: 'FEST-CAT', name: 'Festive catalogue mailing', channel: 'CATALOGUE', from: d(-60), to: d(30), cost: 180_000, owner: LUCY },
      { code: 'EXPO-NBI', name: 'Nairobi food & beverage expo', channel: 'TRADE_FAIR', from: d(-40), to: d(-37), cost: 420_000, owner: PETER },
      { code: 'SMS-HOTEL', name: 'Hotel buyers SMS offer', channel: 'SMS', from: d(-20), to: d(10), cost: 35_000, owner: PETER }
    ],
    kycTemplates,
    profiles,
    applications,
    templates: [
      { id: 'tp1', name: 'Weekly DC replenishment', customerId: 'c1', lines: [{ id: 'tl1', sku: 'STD-24', description: 'Standard pack — carton of 24', qty: 120, price: 4_800, discountPct: 0 }, { id: 'tl2', sku: 'SMP-50', description: 'Sample sachets — box of 50', qty: 20, price: 1_500, discountPct: 0 }], createdBy: PETER },
      { id: 'tp2', name: 'Monthly bulk sacks', customerId: 'c4', lines: [{ id: 'tl3', sku: 'BLK-25', description: 'Bulk sack — 25 kg', qty: 140, price: 9_500, discountPct: 0 }], createdBy: PETER }
    ],
    changeRequests: [],
    payments: [],
    rmas,
    claims: [],
    credits: [],
    auctions,
    tastings,
    samples,
    blends,
    contractTemplates,
    contracts,
    feedback,
    surveys,
    portalEvents,
    portalCustomerId: 'c1'
  };
};
