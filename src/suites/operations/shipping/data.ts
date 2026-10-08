import { addDays, TODAY } from '../../finance/engine';
import type { HistoryEntry } from '../../finance/types';
import type { Shipment } from '../types';
import { SEED_SI } from '../warehousing/data';
import type { TeaLot } from '../warehousing/types';
import { MILESTONE_TEMPLATE } from './engine';
import type { Milestone, ShippingExtState, ShippingInstruction, SiLine } from './types';

const d = (o: number) => addDays(TODAY, o);
const year = TODAY.slice(0, 4);
const num = (p: string, n: number) => `${p}-${year}-${String(n).padStart(4, '0')}`;
const h = (date: string, hour: number, by: string, action: string, note?: string): HistoryEntry => ({ at: `${date}T${String(hour).padStart(2, '0')}:30:00`, by, action, note });
const MARY = 'Mary Wambui';
const ESTHER = 'Esther Muthoni';
const OMAR = 'Omar Al Habsi';

const line = (lots: TeaLot[], id: string, bags: number, price: number): SiLine => {
  const l = lots.find((x) => x.id === id)!;
  return { lotId: l.id, lotNo: l.lotNo, garden: l.garden, grade: l.grade, invoiceNo: l.invoiceNo, bags, netKg: Math.round(bags * l.kgPerBag * 100) / 100, warehouseId: l.warehouseId, pricePerKg: price };
};

/** Milestones for a shipment at a given stage: the earlier ones are already approved. */
export const milestonesFor = (s: Pick<Shipment, 'stage' | 'etd' | 'eta'>): Milestone[] => {
  const doneUpTo = { BOOKED: 0, DOCUMENTS: 2, LOADED: 4, DEPARTED: 7, ARRIVED: 7, DELIVERED: 8 }[s.stage];
  return MILESTONE_TEMPLATE.map((m, i) => ({
    ...m,
    due: m.key === 'delivery' ? addDays(s.eta, 2) : m.key === 'bl' ? addDays(s.etd, 1) : addDays(s.etd, -6 + i),
    status: i < doneUpTo ? 'APPROVED' : i === doneUpTo && s.stage === 'DOCUMENTS' ? 'SUBMITTED' : 'NOT_STARTED',
    completedAt: i < doneUpTo ? addDays(s.etd, -7 + i) : undefined,
    ref: i < doneUpTo ? `${m.key.toUpperCase()}-${4100 + i * 13}` : undefined,
    source: 'MANUAL'
  }));
};

export const buildShippingExtSeed = (lots: TeaLot[], shipments: Shipment[]): ShippingExtState => {
  const sh = (id: string) => shipments.find((s) => s.id === id);
  const si = (n: number, x: Omit<ShippingInstruction, 'id' | 'number' | 'amendments' | 'version'> & Partial<ShippingInstruction>): ShippingInstruction => ({ id: `si${n}`, number: num('SI', n), version: 1, amendments: [], ...x });
  const instructions: ShippingInstruction[] = [
    si(1, {
      customerId: 'c8',
      contractRef: 'HT/KE/2611',
      buyerRef: 'PO 88120',
      destination: 'Jebel Ali, Dubai',
      incoterm: 'FOB',
      voyageId: 'vy1',
      consignee: 'Horizon Trading FZE, Jebel Ali Free Zone',
      notifyParty: 'Same as consignee',
      markings: 'HORIZON / JEBEL ALI / KENYA BP1-PF1 / LOT No. / BAG No.',
      readyBy: d(3),
      lines: [line(lots, 'lot1', 60, 520), line(lots, 'lot2', 79, 505)],
      status: 'CONFIRMED',
      channel: 'OFFICE',
      credit: { status: 'OK', exposure: 0, limit: 10_000_000, value: 0, checkedAt: `${d(-3)}T10:00:00` },
      stockCheck: { by: MARY, at: `${d(-2)}T09:30:00`, shortfalls: [] },
      stuffingBase: 'WH-CHG',
      createdBy: MARY,
      submittedAt: `${d(-3)}T10:00:00`,
      confirmedAt: `${d(-2)}T09:30:00`,
      history: [h(d(-3), 9, MARY, 'Created'), h(d(-3), 10, MARY, 'Submitted', 'Credit check passed'), h(d(-2), 9, ESTHER, 'Confirmed — stock reserved', 'Stuffing base: Tea godown — Changamwe')]
    }),
    si(2, {
      customerId: 'c8',
      contractRef: 'HT/KE/2618',
      destination: 'Karachi, Pakistan',
      incoterm: 'CFR',
      voyageId: 'vy2',
      consignee: 'Al Noor Tea Packers, Karachi',
      notifyParty: 'Horizon Trading FZE',
      markings: 'AL NOOR / KARACHI / PRODUCE OF KENYA',
      readyBy: d(7),
      lines: [line(lots, 'lot4', 50, 540), line(lots, 'lot5', 70, 525)],
      status: 'SUBMITTED',
      channel: 'PORTAL',
      credit: { status: 'OK', exposure: 0, limit: 10_000_000, value: 0, checkedAt: `${d(-1)}T16:00:00` },
      createdBy: OMAR,
      submittedAt: `${d(-1)}T16:00:00`,
      history: [h(d(-1), 15, OMAR, 'Created on the customer portal'), h(d(-1), 16, OMAR, 'Submitted', 'Teas held for Horizon Trading in Changamwe')]
    }),
    si(3, {
      customerId: 'c5',
      contractRef: 'CHG/2026/044',
      destination: 'Dar es Salaam, Tanzania',
      incoterm: 'FOB',
      voyageId: 'vy3',
      consignee: 'Coast Hospitality Group — Dar es Salaam branch',
      notifyParty: 'Same as consignee',
      markings: 'CHG / DSM / KENYA TEA',
      readyBy: d(2),
      lines: [line(lots, 'lot9', 55, 515), line(lots, 'lot10', 63, 498)],
      status: 'CREDIT_HOLD',
      channel: 'OFFICE',
      credit: { status: 'HOLD', exposure: 0, limit: 2_500_000, value: 0, checkedAt: `${d(-1)}T11:00:00`, note: 'Exposure over the credit limit' },
      createdBy: MARY,
      submittedAt: `${d(-1)}T11:00:00`,
      history: [h(d(-1), 10, MARY, 'Created'), h(d(-1), 11, MARY, 'Submitted — on credit hold', 'Finance, Trading and Shipping notified')]
    }),
    si(4, {
      customerId: 'c8',
      contractRef: 'HT/KE/2625',
      destination: 'Jebel Ali, Dubai',
      incoterm: 'FOB',
      voyageId: 'vy4',
      consignee: 'Horizon Trading FZE',
      notifyParty: 'Same as consignee',
      markings: 'HORIZON / JEBEL ALI',
      readyBy: d(14),
      lines: [line(lots, 'lot11', 36, 530)],
      status: 'DRAFT',
      channel: 'PORTAL',
      createdBy: OMAR,
      history: [h(d(0), 8, OMAR, 'Created on the customer portal')]
    }),
    si(5, {
      customerId: 'c8',
      contractRef: 'HT/KE/2588',
      destination: 'Jebel Ali, Dubai',
      incoterm: 'FOB',
      consignee: 'Horizon Trading FZE',
      notifyParty: 'Same as consignee',
      markings: 'HORIZON / JEBEL ALI',
      readyBy: d(-9),
      lines: [{ lotId: 'old1', lotNo: 'L-23940', garden: 'Kangaita', grade: 'PF1', invoiceNo: 'KG 0388', bags: 300, netKg: 7_500, warehouseId: 'WH-MSA', pricePerKg: 365 }],
      status: 'SHIPPED',
      channel: 'OFFICE',
      shipmentId: 'sh2',
      shipmentNumber: sh('sh2')?.number,
      stuffingBase: 'WH-MSA',
      createdBy: MARY,
      submittedAt: `${d(-16)}T09:00:00`,
      confirmedAt: `${d(-15)}T11:00:00`,
      stuffedAt: `${d(-8)}T13:00:00`,
      shippedAt: `${d(-6)}T19:00:00`,
      history: [h(d(-16), 9, MARY, 'Submitted'), h(d(-15), 11, ESTHER, 'Confirmed'), h(d(-8), 13, 'John Kiprop', 'Stuffed'), h(d(-6), 19, MARY, 'Shipped')]
    }),
    si(6, {
      customerId: 'c8',
      contractRef: 'HT/KE/2540',
      destination: 'Jebel Ali, Dubai',
      incoterm: 'FOB',
      consignee: 'Horizon Trading FZE',
      notifyParty: 'Same as consignee',
      markings: 'HORIZON / JEBEL ALI',
      readyBy: d(-54),
      lines: [{ lotId: 'old2', lotNo: 'L-23810', garden: 'Gitugi', grade: 'BP1', invoiceNo: 'GT 0601', bags: 400, netKg: 10_000, warehouseId: 'WH-MSA', pricePerKg: 365 }],
      status: 'SHIPPED',
      channel: 'OFFICE',
      shipmentId: 'sh1',
      shipmentNumber: sh('sh1')?.number,
      stuffingBase: 'WH-MSA',
      createdBy: MARY,
      submittedAt: `${d(-62)}T09:00:00`,
      confirmedAt: `${d(-60)}T15:00:00`,
      stuffedAt: `${d(-53)}T14:00:00`,
      shippedAt: `${d(-52)}T18:00:00`,
      history: [h(d(-62), 9, MARY, 'Submitted'), h(d(-60), 15, ESTHER, 'Confirmed'), h(d(-53), 14, 'John Kiprop', 'Stuffed'), h(d(-52), 18, MARY, 'Shipped')]
    })
  ];
  for (const x of instructions) if (x.credit && !x.credit.value) x.credit.value = x.lines.reduce((a, l) => a + l.netKg * l.pricePerKg, 0);
  instructions[2].credit!.exposure = instructions[2].credit!.value + 180_000;

  const milestones: Record<string, Milestone[]> = {};
  for (const s of shipments) milestones[s.id] = milestonesFor(s);

  return {
    instructions,
    voyages: [
      { id: 'vy1', vessel: 'Maersk Kensington', line: 'Maersk', voyage: '641W', port: 'Mombasa (Kilindini)', cutOff: d(4), etd: d(6), eta: d(18), destinations: 'Jebel Ali, Karachi', originalEtd: d(6), history: [h(d(-10), 9, MARY, 'Schedule loaded')] },
      { id: 'vy2', vessel: 'MSC Jade', line: 'MSC', voyage: 'JX219E', port: 'Mombasa (Kilindini)', cutOff: d(9), etd: d(11), eta: d(24), destinations: 'Karachi, Jebel Ali', originalEtd: d(9), history: [h(d(-8), 9, MARY, 'Schedule loaded'), h(d(-2), 10, MARY, 'ETD moved', `${d(9)} → ${d(11)} (port congestion)`)] },
      { id: 'vy3', vessel: 'CMA CGM Tanzania', line: 'CMA CGM', voyage: '0TN4S', port: 'Mombasa (Kilindini)', cutOff: d(3), etd: d(5), eta: d(17), destinations: 'Dar es Salaam, Muscat', originalEtd: d(5), history: [h(d(-6), 9, MARY, 'Schedule loaded')] },
      { id: 'vy4', vessel: 'Maersk Kalmar', line: 'Maersk', voyage: '644W', port: 'Mombasa (Kilindini)', cutOff: d(15), etd: d(18), eta: d(32), destinations: 'Jebel Ali', originalEtd: d(18), history: [h(d(-1), 9, MARY, 'Schedule loaded')] }
    ],
    bonds: [
      { id: 'bd1', number: num('BND', 1), type: 'TRANSIT', insurer: 'APA Insurance', amount: 5_000_000, shipmentIds: ['sh3'], issued: d(-344), expiry: d(21), status: 'ACTIVE', history: [h(d(-344), 9, ESTHER, 'Bond booked')] },
      { id: 'bd2', number: num('BND', 2), type: 'CUSTOMS_GENERAL', insurer: 'Jubilee Insurance', amount: 20_000_000, shipmentIds: ['sh4'], issued: d(-165), expiry: d(200), status: 'ACTIVE', history: [h(d(-165), 9, ESTHER, 'Bond booked')] },
      { id: 'bd3', number: num('BND', 3), type: 'EXPORT_WAREHOUSE', insurer: 'CIC General Insurance', amount: 8_000_000, shipmentIds: [], issued: d(-370), expiry: d(-5), status: 'ACTIVE', history: [h(d(-370), 9, ESTHER, 'Bond booked')] }
    ],
    milestones,
    idfs: [
      { id: 'idf1', number: 'E2400KE1185402', description: 'Multiwall paper sacks (50,000 pcs)', supplier: 'Qingdao Pack Co. (China)', valueUsd: 18_400, applied: d(-75), approved: d(-72), expiry: d(18), status: 'APPROVED', history: [h(d(-75), 9, MARY, 'IDF lodged on KenTrade'), h(d(-72), 14, MARY, 'Approved by KRA')] },
      { id: 'idf2', number: 'E2400KE1199731', description: 'Printed tea bag filter paper', supplier: 'Glatfelter (Germany)', valueUsd: 9_850, applied: d(-2), status: 'APPLIED', history: [h(d(-2), 11, MARY, 'IDF lodged on KenTrade')] }
    ],
    charges: [
      { id: 'cg1', shipmentId: 'sh2', type: 'FREIGHT', supplierId: 's4', amount: 168_000, vat: false, reference: 'MSC freight invoice MSC-77120593', by: MARY, at: `${d(-6)}T10:00:00` },
      { id: 'cg2', shipmentId: 'sh2', type: 'PORT_KPA', supplierId: 's4', amount: 24_500, vat: true, reference: 'KPA wharfage', by: MARY, at: `${d(-7)}T10:00:00` },
      { id: 'cg3', shipmentId: 'sh2', type: 'CLEARING', supplierId: 's9', amount: 38_000, vat: true, reference: 'Clearing agency fee', by: MARY, at: `${d(-7)}T12:00:00` },
      { id: 'cg4', shipmentId: 'sh3', type: 'KEPHIS', supplierId: 's9', amount: 3_500, vat: false, reference: 'Phyto inspection fee', by: MARY, at: `${d(-2)}T12:00:00` }
    ],
    trucks: [{ id: 'tb1', number: num('TBK', 1), customerId: 'c4', border: 'Malaba', date: d(3), trucks: 2, kg: 24_000, status: 'REQUESTED', requestedBy: 'Rift Valley Distributors (portal)', history: [h(d(-1), 14, 'Rift Valley Distributors (portal)', 'Trucks requested for border clearance')] }],
    licences: [
      { id: 'lc1', name: 'Customs bonded warehouse licence', authority: 'KRA Customs & Border Control', number: 'KRA/CBW/0418', status: 'ISSUED', applied: d(-370), issued: d(-340), expiry: d(25), fee: 150_000, history: [h(d(-340), 9, ESTHER, 'Licence issued')] },
      { id: 'lc2', name: 'Tea export licence', authority: 'AFA — Tea Directorate', number: 'TD/EXP/2291', status: 'ISSUED', applied: d(-250), issued: d(-245), expiry: d(120), fee: 25_000, history: [h(d(-245), 9, ESTHER, 'Licence issued')] },
      { id: 'lc3', name: 'Plant exporter registration', authority: 'KEPHIS', number: 'KEPHIS/EXP/7781', status: 'RENEWAL_STARTED', applied: d(-370), issued: d(-360), expiry: d(6), fee: 10_000, history: [h(d(-360), 9, ESTHER, 'Registered'), h(d(-4), 10, MARY, 'Renewal application lodged')] },
      { id: 'lc4', name: 'Transit goods licence', authority: 'KRA Customs & Border Control', number: '—', status: 'APPLIED', applied: d(-6), fee: 50_000, history: [h(d(-6), 10, MARY, 'Application lodged')] }
    ],
    generated: [],
    templates: {
      header: '',
      address: '',
      footer: 'All teas are sold subject to EATTA conditions of sale. Goods remain our property until paid in full.',
      bank: 'KCB Bank Kenya Ltd, Moi Avenue Branch, Mombasa · A/C 1104 556 778 (USD) · SWIFT KCBLKENX',
      drawee: 'Emirates NBD, Deira Branch, Dubai'
    },
    sequence: { SI: 6, BND: 3, TBK: 1, PRF: 0, PKL: 0, CIV: 0, BOE: 0, BKI: 0, LIC: 0, DOC: 0 }
  };
};

export { SEED_SI };
