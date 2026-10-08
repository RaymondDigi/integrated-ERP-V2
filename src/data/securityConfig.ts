/**
 * Security operations and employee voice: guard rosters, occurrence book, visitors, patrols, escorts and cargo in
 * transit (tea consignments to the Mombasa auction and port), gate inspections, security investigations,
 * insurance claims, alarm events from security systems (simulated feed), grievances, harassment complaints,
 * stakeholder complaints and anonymous whistleblowing.
 */
import { rel, type HistoryEntry } from './hcmConfig';

const h = (days: number, by: string, action: string, note?: string): HistoryEntry => ({ at: rel(days), by, action, note });
const stamp = (days: number, time: string) => `${rel(days)} ${time}`;

export interface SecurityRequisition {
  id: string;
  orgId: string;
  type: 'ESCORT' | 'GUARD' | 'CASH_IN_TRANSIT';
  purpose: string;
  /** Tea lot, invoice, stock transfer or event the security is for */
  cargoRef?: string;
  location: string;
  date: string;
  guards: number;
  requestedBy: string;
  status: 'REQUESTED' | 'APPROVED' | 'ASSIGNED' | 'COMPLETED' | 'REJECTED';
  assigned?: string[];
  approvedBy?: string;
  history: HistoryEntry[];
}

export interface TransitCheckpoint {
  place: string;
  at: string;
  sealIntact: boolean;
  note?: string;
}
export interface TransitRecord {
  id: string;
  orgId: string;
  requisitionId?: string;
  cargo: string;
  cargoRef: string;
  vehicle: string;
  driver: string;
  escort: string;
  sealNo: string;
  origin: string;
  destination: string;
  departedAt: string;
  checkpoints: TransitCheckpoint[];
  arrivedAt?: string;
  arrivalSealNo?: string;
  packagesSent: number;
  packagesReceived?: number;
  status: 'IN_TRANSIT' | 'ARRIVED' | 'DISCREPANCY';
  discrepancy?: string;
  investigationId?: string;
}

export interface OccurrenceEntry {
  id: string;
  orgId: string;
  at: string;
  post: string;
  category: 'Routine' | 'Handover' | 'Incident' | 'Theft' | 'Fire' | 'Visitor' | 'Alarm';
  entry: string;
  by: string;
}

export interface VisitorEntry {
  id: string;
  orgId: string;
  name: string;
  idNo: string;
  company: string;
  hostStaffId: string;
  purpose: string;
  vehicle?: string;
  badge: string;
  inAt: string;
  outAt?: string;
}

export interface GuardShift {
  id: string;
  orgId: string;
  date: string;
  shift: 'DAY' | 'NIGHT';
  post: string;
  guard: string;
  provider: 'In-house' | 'G4S Kenya Ltd';
}

export interface PatrolLog {
  id: string;
  orgId: string;
  guard: string;
  route: string;
  startedAt: string;
  checkpoints: { name: string; at?: string; note?: string }[];
  status: 'IN_PROGRESS' | 'COMPLETE' | 'MISSED_POINTS';
}

export interface SecurityInvestigation {
  id: string;
  orgId: string;
  subject: string;
  /** Employee under investigation, when there is one */
  subjectStaffId?: string;
  category: 'Theft' | 'Fraud' | 'Loss in transit' | 'Unauthorised access' | 'Damage';
  allegation: string;
  sourceRef?: string;
  investigator: string;
  evidence: string[];
  interviews: { person: string; summary: string; on: string }[];
  findings?: string;
  recommendation?: 'NO_ACTION' | 'DISCIPLINARY' | 'INSURANCE_CLAIM' | 'POLICE';
  valueKes?: number;
  status: 'OPEN' | 'FINDINGS' | 'CLOSED';
  outcomeRef?: string;
  history: HistoryEntry[];
}

export interface GatePass {
  id: string;
  orgId: string;
  direction: 'IN' | 'OUT';
  vehicle: string;
  driver: string;
  docRef: string;
  items: { description: string; qtyDoc: number; qtyFound: number }[];
  guard: string;
  at: string;
  status: 'CLEARED' | 'HELD';
  note?: string;
}

export type InsurancePolicy = 'GPA' | 'MEDICAL' | 'MOTOR' | 'PROPERTY' | 'GOODS_IN_TRANSIT' | 'FIDELITY';
export const POLICY_LABEL: Record<InsurancePolicy, string> = {
  GPA: 'Group personal accident',
  MEDICAL: 'Medical (in-patient)',
  MOTOR: 'Motor vehicle',
  PROPERTY: 'Property / fire & perils',
  GOODS_IN_TRANSIT: 'Goods in transit (marine)',
  FIDELITY: 'Fidelity guarantee'
};
export const POLICY_INSURER: Record<InsurancePolicy, string> = {
  GPA: 'Jubilee Allianz General',
  MEDICAL: 'AAR Insurance',
  MOTOR: 'APA Insurance',
  PROPERTY: 'ICEA LION General',
  GOODS_IN_TRANSIT: 'Madison General — marine cargo',
  FIDELITY: 'CIC General'
};
export interface InsuranceClaim {
  id: string;
  orgId: string;
  policy: InsurancePolicy;
  insurer: string;
  incidentRef: string;
  description: string;
  lossDate: string;
  amountClaimedKes: number;
  excessKes: number;
  amountSettledKes?: number;
  documents: string[];
  status: 'NOTIFIED' | 'DOCUMENTED' | 'ASSESSED' | 'SETTLED' | 'REJECTED';
  raisedBy: string;
  history: HistoryEntry[];
}
/** Documents the insurer needs before a claim moves to assessment. */
export const CLAIM_DOCUMENTS: Record<InsurancePolicy, string[]> = {
  GPA: ['Claim form', 'Medical report', 'Police abstract (if accident)'],
  MEDICAL: ['Claim form', 'Invoices and receipts', 'Discharge summary'],
  MOTOR: ['Claim form', 'Police abstract', 'Driver’s licence copy', 'Repair estimate'],
  PROPERTY: ['Claim form', 'Fire brigade / police report', 'Valuation of loss'],
  GOODS_IN_TRANSIT: ['Claim form', 'Delivery note and seal record', 'Survey report', 'Invoice / auction catalogue value'],
  FIDELITY: ['Claim form', 'Investigation report', 'Police OB number']
};

export interface AlarmEvent {
  id: string;
  orgId: string;
  at: string;
  source: 'CCTV' | 'ACCESS_CONTROL' | 'FIRE_PANEL' | 'PERIMETER';
  location: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  status: 'NEW' | 'ACKNOWLEDGED' | 'CLOSED';
  ackBy?: string;
  closedNote?: string;
}
/** Events the simulated device feed raises at random (no real CCTV, access-control or fire panel in this build). */
export const SIMULATED_EVENTS: Omit<AlarmEvent, 'id' | 'orgId' | 'at' | 'status'>[] = [
  { source: 'ACCESS_CONTROL', location: 'Finished tea store door 2', message: 'Door held open more than 60 s', severity: 'medium' },
  { source: 'CCTV', location: 'Weighbridge camera 3', message: 'Motion detected after hours', severity: 'high' },
  { source: 'PERIMETER', location: 'Fence sector 7 (Site D)', message: 'Electric fence voltage drop', severity: 'high' },
  { source: 'FIRE_PANEL', location: 'Withering loft zone 4', message: 'Smoke detector fault', severity: 'medium' },
  { source: 'ACCESS_CONTROL', location: 'Server room', message: 'Card refused 3 times (card 00418)', severity: 'low' }
];

export type GrievanceChannel = 'STAFF' | 'STAKEHOLDER' | 'WHISTLEBLOWER';
export interface Grievance {
  id: string;
  orgId: string;
  channel: GrievanceChannel;
  category: 'Grievance' | 'Harassment' | 'Discrimination' | 'Working conditions' | 'Community' | 'Supplier' | 'Fraud' | 'Corruption' | 'Safety' | 'Other';
  subject: string;
  details: string;
  /** Staff grievances: who raised it (never stored for anonymous whistleblowing) */
  staffId?: string;
  /** Stakeholder complaints: complainant and contact, optional */
  complainant?: string;
  contact?: string;
  /** Person or unit the complaint is about */
  against?: string;
  confidential: boolean;
  /** Anonymous reporters follow up with this code */
  trackingCode?: string;
  investigator?: string;
  hearingDate?: string;
  resolution?: string;
  responseDue: string;
  status: 'RECEIVED' | 'INVESTIGATING' | 'HEARING' | 'RESOLVED' | 'CLOSED' | 'APPEALED';
  appeal?: string;
  messages: { at: string; from: 'REPORTER' | 'CASE_OFFICER'; text: string }[];
  history: HistoryEntry[];
}
/** Days to respond, by channel. */
export const RESPONSE_DAYS: Record<GrievanceChannel, number> = { STAFF: 14, STAKEHOLDER: 21, WHISTLEBLOWER: 30 };

/* ------------------------------------------------------------------ seeds */

export const INITIAL_SEC_REQS: SecurityRequisition[] = [
  { id: 'SRQ-0041', orgId: 'org-kericho', type: 'ESCORT', purpose: 'Escort 2 trucks of made tea to Mombasa auction warehouse (sale 42)', cargoRef: 'Lots 2041–2046 · INV-2026-0187', location: 'Kericho → Mombasa (Changamwe)', date: rel(2), guards: 2, requestedBy: 'Lucy Njeri', status: 'REQUESTED', history: [h(-1, 'Lucy Njeri', 'Requested')] },
  { id: 'SRQ-0039', orgId: 'org-kericho', type: 'CASH_IN_TRANSIT', purpose: 'Casual wages cash to Site D pay point', location: 'Kericho branch → Site D', date: rel(-3), guards: 2, requestedBy: 'David Otieno', status: 'COMPLETED', assigned: ['Wycliffe Kiprono', 'G4S team 7'], approvedBy: 'Esther Muthoni', history: [h(-6, 'David Otieno', 'Requested'), h(-5, 'Esther Muthoni', 'Approved'), h(-3, 'Esther Muthoni', 'Completed')] }
];

export const INITIAL_TRANSIT: TransitRecord[] = [
  {
    id: 'TRN-0107', orgId: 'org-kericho', requisitionId: 'SRQ-0038', cargo: 'Made tea BP1/PF1 — 320 bags (19.2 t)', cargoRef: 'Lots 2031–2036 · INV-2026-0179', vehicle: 'KCK 412M + ZF 3310', driver: 'Samuel Ouma', escort: 'G4S unit 12', sealNo: 'KHE-SL-55821',
    origin: 'Kericho factory', destination: 'Mombasa — Chai warehouse, Changamwe', departedAt: stamp(-1, '05:40'), packagesSent: 320,
    checkpoints: [{ place: 'Nakuru weighbridge', at: stamp(-1, '09:15'), sealIntact: true }, { place: 'Mlolongo weighbridge', at: stamp(-1, '14:05'), sealIntact: true }], status: 'IN_TRANSIT'
  },
  {
    id: 'TRN-0104', orgId: 'org-kericho', cargo: 'Made tea PD/D1 — 240 bags', cargoRef: 'Lots 2019–2022 · INV-2026-0171', vehicle: 'KDA 118T', driver: 'Joseph Mutua', escort: 'Wycliffe Kiprono', sealNo: 'KHE-SL-55790',
    origin: 'Kericho factory', destination: 'Mombasa — Chai warehouse, Changamwe', departedAt: stamp(-9, '06:00'), packagesSent: 240, packagesReceived: 240, arrivalSealNo: 'KHE-SL-55790', arrivedAt: stamp(-8, '07:30'),
    checkpoints: [{ place: 'Nakuru weighbridge', at: stamp(-9, '09:40'), sealIntact: true }], status: 'ARRIVED'
  }
];

export const INITIAL_OCCURRENCES: OccurrenceEntry[] = [
  { id: 'OB-2210', orgId: 'org-kericho', at: stamp(0, '06:00'), post: 'Main gate', category: 'Handover', entry: 'Night shift handed over to day shift. All keys accounted for (24). Nothing to report.', by: 'Wycliffe Kiprono' },
  { id: 'OB-2209', orgId: 'org-kericho', at: stamp(-1, '22:40'), post: 'Factory gate', category: 'Incident', entry: 'Unidentified motorbike rider loitering near fence sector 7; patrol dispatched, rider left.', by: 'G4S guard 0418' },
  { id: 'OB-2208', orgId: 'org-kericho', at: stamp(-1, '14:10'), post: 'Main gate', category: 'Visitor', entry: 'KEBS inspector arrived for packaging line inspection, escorted to QC lab.', by: 'Wycliffe Kiprono' }
];

export const INITIAL_VISITORS: VisitorEntry[] = [
  { id: 'VIS-3301', orgId: 'org-kericho', name: 'Hellen Wangari', idNo: '24****18', company: 'Kenya Bureau of Standards', hostStaffId: 'KHE-0276', purpose: 'Packaging line inspection', badge: 'V-07', inAt: stamp(0, '09:12') },
  { id: 'VIS-3299', orgId: 'org-kericho', name: 'Omar Said', idNo: '29****40', company: 'Bahari Stevedoring', hostStaffId: 'KHE-0152', purpose: 'Container stuffing schedule', vehicle: 'KBZ 220Q', badge: 'V-02', inAt: stamp(-1, '10:30'), outAt: stamp(-1, '12:05') }
];

export const INITIAL_ROSTER: GuardShift[] = [
  { id: 'GR-1', orgId: 'org-kericho', date: rel(0), shift: 'DAY', post: 'Main gate', guard: 'Wycliffe Kiprono', provider: 'In-house' },
  { id: 'GR-2', orgId: 'org-kericho', date: rel(0), shift: 'NIGHT', post: 'Main gate', guard: 'G4S guard 0418', provider: 'G4S Kenya Ltd' },
  { id: 'GR-3', orgId: 'org-kericho', date: rel(0), shift: 'NIGHT', post: 'Finished tea store', guard: 'G4S guard 0422', provider: 'G4S Kenya Ltd' }
];

export const PATROL_ROUTES: Record<string, string[]> = {
  'Factory perimeter': ['Main gate', 'Weighbridge', 'Withering loft', 'Finished tea store', 'Boiler house', 'Fence sector 7'],
  'Estates night round': ['Site C pay point', 'Site D nursery', 'Fuel store', 'Staff housing gate']
};
export const INITIAL_PATROLS: PatrolLog[] = [
  { id: 'PT-0901', orgId: 'org-kericho', guard: 'G4S guard 0418', route: 'Factory perimeter', startedAt: stamp(-1, '23:00'), checkpoints: PATROL_ROUTES['Factory perimeter'].map((name, i) => ({ name, at: i === 5 ? undefined : stamp(-1, `23:${String(5 + i * 8).padStart(2, '0')}`) })), status: 'MISSED_POINTS' }
];

export const INITIAL_INVESTIGATIONS: SecurityInvestigation[] = [
  {
    id: 'SI-2026-011', orgId: 'org-kericho', subject: 'Shortage of 6 bags PF1 from finished tea store', category: 'Theft', allegation: 'Stock count on 2 shifts shows 6 bags (360 kg) PF1 missing from bay 4.', sourceRef: 'OB-2187',
    investigator: 'Esther Muthoni', evidence: ['Store count sheets', 'CCTV store door 2, 02:10–02:40'], interviews: [{ person: 'John Kiprop (storekeeper)', summary: 'Last full count tallied; keys handed to night guard.', on: rel(-4) }], valueKes: 162_000,
    status: 'OPEN', history: [h(-6, 'Esther Muthoni', 'Opened')]
  }
];

export const INITIAL_GATE_PASSES: GatePass[] = [
  { id: 'GP-7712', orgId: 'org-kericho', direction: 'OUT', vehicle: 'KCK 412M', driver: 'Samuel Ouma', docRef: 'DN-2026-0412 / INV-2026-0179', items: [{ description: 'Made tea bags BP1', qtyDoc: 180, qtyFound: 180 }, { description: 'Made tea bags PF1', qtyDoc: 140, qtyFound: 140 }], guard: 'Wycliffe Kiprono', at: stamp(-1, '05:20'), status: 'CLEARED' },
  { id: 'GP-7713', orgId: 'org-kericho', direction: 'IN', vehicle: 'KBU 903L', driver: 'Packaging supplier', docRef: 'PO-2026-0088', items: [{ description: 'Paper sacks (multiwall)', qtyDoc: 2000, qtyFound: 1950 }], guard: 'Wycliffe Kiprono', at: stamp(0, '08:05'), status: 'HELD', note: '50 sacks short against the delivery note — held for stores' }
];

export const INITIAL_CLAIMS: InsuranceClaim[] = [
  { id: 'ICL-2026-006', orgId: 'org-kericho', policy: 'MOTOR', insurer: POLICY_INSURER.MOTOR, incidentRef: 'Fleet accident KDA 118T — Londiani', description: 'Rear-ended at Londiani junction; tail lift and bumper damaged.', lossDate: rel(-20), amountClaimedKes: 184_000, excessKes: 25_000, documents: ['Claim form', 'Police abstract', 'Driver’s licence copy'], status: 'DOCUMENTED', raisedBy: 'Esther Muthoni', history: [h(-19, 'Esther Muthoni', 'Notified insurer'), h(-12, 'Esther Muthoni', 'Documents lodged')] }
];

export const INITIAL_ALARMS: AlarmEvent[] = [
  { id: 'AL-5521', orgId: 'org-kericho', at: stamp(0, '02:14'), source: 'CCTV', location: 'Finished tea store door 2', message: 'Camera tamper — lens covered', severity: 'high', status: 'NEW' },
  { id: 'AL-5519', orgId: 'org-kericho', at: stamp(-1, '19:02'), source: 'FIRE_PANEL', location: 'Boiler house', message: 'Heat detector pre-alarm', severity: 'medium', status: 'CLOSED', ackBy: 'Wycliffe Kiprono', closedNote: 'Firewood stoking — normal, sensor re-seated' }
];

export const INITIAL_GRIEVANCES: Grievance[] = [
  { id: 'GRV-2026-014', orgId: 'org-kericho', channel: 'STAFF', category: 'Working conditions', subject: 'Night shift transport not provided at Site D', details: 'Since the new roster, the 10 pm bus no longer stops at Site D; we walk 4 km at night.', staffId: 'KHE-1103', confidential: false, responseDue: rel(9), status: 'INVESTIGATING', investigator: 'Rose Chepkoech', messages: [], history: [h(-5, 'Faith Onyango', 'Raised'), h(-4, 'Rose Chepkoech', 'Investigation started')] },
  { id: 'GRV-2026-015', orgId: 'org-kericho', channel: 'STAKEHOLDER', category: 'Community', subject: 'Factory effluent smell near Kapsoit stream', details: 'Residents report a strong smell downstream after the factory wash-down on weekends.', complainant: 'Kapsoit village elders', contact: '+254 720 118 334', confidential: false, responseDue: rel(15), status: 'RECEIVED', messages: [], history: [h(-6, 'Front office', 'Received')] },
  { id: 'WB-2026-003', orgId: 'org-kericho', channel: 'WHISTLEBLOWER', category: 'Fraud', subject: 'Green leaf weights inflated at a buying centre', details: 'Some clerks add weight for selected growers in exchange for a share of the payment.', confidential: true, trackingCode: 'WB-7Q4K-2M', responseDue: rel(20), status: 'INVESTIGATING', investigator: 'Amina Hassan', messages: [{ at: rel(-8), from: 'REPORTER', text: 'It happens mostly on Mondays.' }], history: [h(-10, 'Anonymous', 'Reported'), h(-9, 'Amina Hassan', 'Investigation started')] }
];
