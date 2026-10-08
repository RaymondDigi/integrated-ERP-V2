import type { HistoryEntry } from '../../finance/types';
import type { Signature } from '../warehousing/types';

/* ------------------------------------------------------------------ */
/* Shipping instructions (SI)                                          */
/* ------------------------------------------------------------------ */

export interface SiLine {
  lotId: string;
  lotNo: string;
  garden: string;
  grade: string;
  invoiceNo: string;
  bags: number;
  netKg: number;
  warehouseId: string;
  /** Contract price, KES per kg */
  pricePerKg: number;
}

export type SiStatus = 'DRAFT' | 'SUBMITTED' | 'CREDIT_HOLD' | 'CONFIRMED' | 'IN_PROGRESS' | 'SHIPPED' | 'CANCELLED';

/** Header fields an amendment may change. */
export interface SiHeader {
  destination: string;
  incoterm: 'FOB' | 'CIF' | 'CFR';
  voyageId?: string;
  consignee: string;
  notifyParty: string;
  markings: string;
  readyBy: string;
}

export interface Amendment {
  id: string;
  version: number;
  requestedBy: string;
  at: string;
  reason: string;
  patch: Partial<SiHeader> & { lines?: SiLine[] };
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

export interface ShippingInstruction extends SiHeader {
  id: string;
  number: string;
  customerId: string;
  contractRef: string;
  buyerRef?: string;
  lines: SiLine[];
  status: SiStatus;
  channel: 'PORTAL' | 'OFFICE';
  version: number;
  amendments: Amendment[];
  credit?: { status: 'OK' | 'HOLD' | 'RELEASED'; exposure: number; limit: number; value: number; checkedAt: string; releasedBy?: string; note?: string };
  stockCheck?: { by: string; at: string; shortfalls: string[] };
  stuffingBase?: string;
  shipmentId?: string;
  shipmentNumber?: string;
  blocked?: { reason: string; by: string; at: string };
  createdBy: string;
  submittedAt?: string;
  confirmedAt?: string;
  stuffedAt?: string;
  shippedAt?: string;
  history: HistoryEntry[];
}

/* ------------------------------------------------------------------ */
/* Vessels, bonds, external milestones, IDF, licences                   */
/* ------------------------------------------------------------------ */

export interface Voyage {
  id: string;
  vessel: string;
  line: string;
  voyage: string;
  port: string;
  cutOff: string;
  etd: string;
  eta: string;
  destinations: string;
  originalEtd: string;
  history: HistoryEntry[];
}

export interface Bond {
  id: string;
  number: string;
  type: 'TRANSIT' | 'CUSTOMS_GENERAL' | 'EXPORT_WAREHOUSE';
  insurer: string;
  amount: number;
  shipmentIds: string[];
  issued: string;
  expiry: string;
  status: 'ACTIVE' | 'RELEASED' | 'EXPIRED';
  history: HistoryEntry[];
}

export type MilestoneStatus = 'NOT_STARTED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
/** A step done outside the system (stuffing, KEPHIS, B/L, inspection, client marking approval). */
export interface Milestone {
  key: string;
  name: string;
  party: string;
  status: MilestoneStatus;
  due: string;
  completedAt?: string;
  ref?: string;
  note?: string;
  /** Where the status came from: typed in, or pulled from a (simulated) connector */
  source?: 'MANUAL' | 'CONNECTOR';
}

/** Import Declaration Form (KRA) for imported packaging and inputs. */
export interface Idf {
  id: string;
  number: string;
  description: string;
  supplier: string;
  valueUsd: number;
  applied: string;
  approved?: string;
  expiry?: string;
  status: 'APPLIED' | 'APPROVED' | 'EXPIRED' | 'CANCELLED';
  history: HistoryEntry[];
}

export type ChargeType = 'FREIGHT' | 'PORT_KPA' | 'KEPHIS' | 'CLEARING' | 'TEA_BOARD_LEVY' | 'HAULAGE' | 'INSURANCE' | 'STUFFING';
export interface ShipCharge {
  id: string;
  shipmentId: string;
  type: ChargeType;
  supplierId: string;
  amount: number;
  vat: boolean;
  reference: string;
  billId?: string;
  billNumber?: string;
  by: string;
  at: string;
}

export interface TruckBooking {
  id: string;
  number: string;
  customerId: string;
  siNumber?: string;
  border: 'Malaba' | 'Busia' | 'Namanga' | 'Taveta' | 'Isebania';
  date: string;
  trucks: number;
  kg: number;
  status: 'REQUESTED' | 'ASSIGNED' | 'DONE' | 'CANCELLED';
  loadId?: string;
  loadNumber?: string;
  requestedBy: string;
  history: HistoryEntry[];
}

export interface CustomsLicence {
  id: string;
  name: string;
  authority: string;
  number: string;
  status: 'APPLIED' | 'ISSUED' | 'RENEWAL_STARTED' | 'EXPIRED';
  applied: string;
  issued?: string;
  expiry?: string;
  fee: number;
  history: HistoryEntry[];
}

/** A document generated from a template and registered with its own number. */
export interface GeneratedDoc {
  id: string;
  template: string;
  number: string;
  ref: string;
  at: string;
  by: string;
  signature?: Signature;
}

export interface TemplateSettings {
  header: string;
  address: string;
  footer: string;
  bank: string;
  drawee: string;
}

export interface ShippingExtState {
  instructions: ShippingInstruction[];
  voyages: Voyage[];
  bonds: Bond[];
  milestones: Record<string, Milestone[]>;
  idfs: Idf[];
  charges: ShipCharge[];
  trucks: TruckBooking[];
  licences: CustomsLicence[];
  generated: GeneratedDoc[];
  templates: TemplateSettings;
  sequence: Record<string, number>;
}
