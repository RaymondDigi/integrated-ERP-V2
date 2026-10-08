import type { HistoryEntry } from '../../finance/types';

export type ContainerType = '20GP' | '40GP' | '40HC';

export interface ShippingLine {
  code: string;
  name: string;
  agent: string;
  email: string;
}

export interface BookingConfirmation {
  bookingRef: string;
  vessel: string;
  voyage: string;
  etd: string;
  cutOff: string;
  releaseOrder: string;
}

/** Request to a shipping line (through its agent) for empty containers on a vessel. */
export interface ContainerBooking {
  id: string;
  number: string;
  shipmentId?: string;
  line: string;
  containerType: ContainerType;
  qty: number;
  cargo: string;
  destination: string;
  requestedEtd: string;
  status: 'REQUESTED' | 'SENT' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
  confirmation?: BookingConfirmation;
  requestedBy: string;
  reason?: string;
  history: HistoryEntry[];
}

export type ContainerStatus = 'EMPTY_RELEASED' | 'AT_WAREHOUSE' | 'STUFFED' | 'GATED_IN' | 'LOADED' | 'ROLLED_OVER' | 'WITHDRAWN' | 'RETURNED';

export interface ContainerEvent {
  at: string;
  status: ContainerStatus;
  location: string;
  by: string;
  note?: string;
}

export interface Container {
  id: string;
  number: string;
  type: ContainerType;
  line: string;
  bookingId: string;
  status: ContainerStatus;
  location: string;
  releasedOn: string;
  stuffedOn?: string;
  sealNo?: string;
  shipmentId?: string;
  vessel?: string;
  cutOff?: string;
  lots: { lotNo: string; garden: string; grade: string; packages: number; kg: number }[];
  truck?: string;
  events: ContainerEvent[];
}

export interface PortDiscrepancy {
  id: string;
  number: string;
  containerNo: string;
  source: 'KRA email' | 'Manual';
  receivedOn: string;
  type: 'WEIGHT' | 'SEAL' | 'PACKAGES' | 'DOCS';
  declared: string;
  found: string;
  status: 'OPEN' | 'RESOLVED';
  resolution?: string;
  resolvedBy?: string;
  raw?: string;
  loggedBy: string;
}

export interface ContainersState {
  bookings: ContainerBooking[];
  containers: Container[];
  discrepancies: PortDiscrepancy[];
  sequence: Record<string, number>;
}
