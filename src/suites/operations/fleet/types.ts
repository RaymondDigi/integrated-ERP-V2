import type { HistoryEntry } from '../../finance/types';
import type { ESignature } from '../../../platform/Widgets';

export type StopType = 'FACTORY' | 'WAREHOUSE' | 'BROKER' | 'PORT';

/** A collection route: tea factories and warehouses visited in order on the way to the port. */
export interface RouteDef {
  id: string;
  name: string;
  stops: { site: string; type: StopType; seq: number; km: number }[];
  /** Own-fleet running cost per km (fuel, tyres, driver) */
  ratePerKm: number;
}

/** A tea lot to collect: garden mark, grade and packages from the auction catalogue or a factory. */
export interface TeaLot {
  lotNo: string;
  garden: string;
  grade: string;
  saleNo?: string;
  packages: number;
  kg: number;
  pickupSite: string;
}

export interface Allocation {
  vehicleId: string;
  kg: number;
  tripId?: string;
  tripNumber?: string;
  hired: boolean;
  /** Lots loaded on this vehicle */
  lots: string[];
  carrierCost?: number;
  carrierBill?: string;
  instructionId?: string;
}

export type PlanStatus = 'DRAFT' | 'ALLOCATED' | 'LOADING' | 'DISPATCHED' | 'CLOSED' | 'CANCELLED';

export interface ConsolidationPlan {
  id: string;
  number: string;
  plannedDate: string;
  routeId: string;
  priority: 'HIGH' | 'NORMAL';
  lots: TeaLot[];
  status: PlanStatus;
  allocations: Allocation[];
  budgetCost: number;
  createdBy: string;
  notes: string;
  closedOn?: string;
  /** Own-fleet km cost plus carrier charges, fixed when the plan is closed */
  actualCost?: number;
  history: HistoryEntry[];
}

export interface LoadingInstruction {
  id: string;
  number: string;
  planId: string;
  vehicleId: string;
  driver: string;
  routeId: string;
  teas: (TeaLot & { to: string })[];
  status: 'ISSUED' | 'LOADED' | 'DELIVERED';
  issuedBy: string;
  issuedAt: string;
  loadedAt?: string;
  deliveredAt?: string;
  containerNo?: string;
}

export interface DailyLog {
  id: string;
  vehicleId: string;
  date: string;
  openKm: number;
  closeKm: number;
  kgCarried: number;
  driver: string;
  by: string;
}

export type DefectSeverity = 'MINOR' | 'MAJOR' | 'CRITICAL';

export interface DefectReport {
  id: string;
  number: string;
  vehicleId: string;
  driver: string;
  odometer: number;
  date: string;
  items: { area: string; description: string; severity: DefectSeverity }[];
  safetyCritical: boolean;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  woId?: string;
  woNumber?: string;
  decidedBy?: string;
  reason?: string;
  history: HistoryEntry[];
}

export interface InsurancePolicy {
  id: string;
  vehicleId: string;
  insurer: string;
  policyNo: string;
  cover: 'COMPREHENSIVE' | 'THIRD_PARTY' | 'TPFT' | 'GOODS_IN_TRANSIT';
  premium: number;
  start: string;
  expiry: string;
  officer: string;
  officerEmail: string;
  status: 'ACTIVE' | 'SUPERSEDED';
  remindersSent: number[];
}

export interface VehicleRequest {
  id: string;
  number: string;
  requestedBy: string;
  department: string;
  purpose: string;
  type: 'ADMIN' | 'OPERATIONAL';
  from: string;
  to: string;
  route: string;
  passengers: number;
  kg: number;
  status: 'REQUESTED' | 'APPROVED' | 'ALLOCATED' | 'REJECTED' | 'CLOSED';
  vehicleId?: string;
  tripId?: string;
  decidedBy?: string;
  reason?: string;
  history: HistoryEntry[];
}

/** Simulated telematics fix for a vehicle. */
export interface Position {
  vehicleId: string;
  lat: number;
  lng: number;
  speed: number;
  fuelPct: number;
  place: string;
  at: string;
  progress: number;
}

export type LetterTemplate = 'AUTHORITY_TO_DRIVE' | 'CARRIER_INSTRUCTION' | 'INSURANCE_CLAIM' | 'GATE_PASS';

export interface TransportLetter {
  id: string;
  number: string;
  template: LetterTemplate;
  to: string;
  toEmail: string;
  subject: string;
  body: string;
  vehicleId?: string;
  status: 'DRAFT' | 'SIGNED' | 'SENT';
  signature?: ESignature;
  hash?: string;
  createdBy: string;
  history: HistoryEntry[];
}

export interface Carrier {
  id: string;
  name: string;
  email: string;
  phone: string;
  ratePerKm: number;
}

export interface FleetExtState {
  routes: RouteDef[];
  plans: ConsolidationPlan[];
  instructions: LoadingInstruction[];
  dailyLogs: DailyLog[];
  defects: DefectReport[];
  policies: InsurancePolicy[];
  requests: VehicleRequest[];
  positions: Record<string, Position>;
  letters: TransportLetter[];
  carriers: Carrier[];
  sequence: Record<string, number>;
}

/** Fleet suite pages added by the extension (transport planning, compliance and the container desk). */
export type FleetExtPage =
  | 'consolidation'
  | 'loading'
  | 'dailylog'
  | 'requests'
  | 'defects'
  | 'insurance'
  | 'performance'
  | 'tracking'
  | 'letters'
  | 'notices'
  | 'bookings'
  | 'containers'
  | 'creports'
  | 'ckpis'
  | 'discrepancies';
