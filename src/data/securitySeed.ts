/**
 * Security process: gate passes, incoming goods checks, visitors, escorted cargo, guard roster, patrols,
 * the occurrence book, security incidents and investigations. Every record carries orgId.
 * Demo dates are relative to today so overdue returns, visitors on site and patrols stay current.
 */
import { plusDays, todayIso, daysBetween } from './registersSeed';

export { plusDays, todayIso, daysBetween };

/* ------------------------------------------------------------------ time stamps ('YYYY-MM-DDTHH:mm', local) */

const pad = (n: number) => String(n).padStart(2, '0');
const toStamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const nowStamp = () => toStamp(new Date());
/** A stamp `m` minutes before now (negative = after now) */
export const minsAgo = (m: number) => toStamp(new Date(Date.now() - m * 60_000));
/** A stamp on the day `days` before today at `hhmm` */
export const dayAt = (days: number, hhmm: string) => `${plusDays(todayIso(), -days)}T${hhmm}`;
/** Minutes from stamp `a` to stamp `b` */
export const minutesBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);

export const SITE: Record<string, string> = {
  'org-kericho': 'Kericho Highland Estates',
  'org-factory': 'Kericho Factory Unit 1',
  'org-nandi': 'Nandi Hills Outgrowers',
  'org-rift': 'Rift Valley Agricultural Holding',
  'org-nairobi': 'Corporate HQ Nairobi'
};

/** Guard company contracted per company (guards are outsourced unless a staff id is set). */
export const GUARD_CONTRACTOR: Record<string, string> = {
  'org-kericho': 'Simba Shield Security Ltd',
  'org-factory': 'Simba Shield Security Ltd',
  'org-nandi': 'Nandi Watchmen Services',
  'org-rift': 'Rift Patrol Guards Ltd',
  'org-nairobi': 'Metro Guarding Services'
};

/* ------------------------------------------------------------------ gate passes */

export const PASS_TYPES = ['Returnable', 'Non-returnable', 'Sale dispatch', 'Transfer between sites', 'Contractor equipment'] as const;
export type PassType = (typeof PASS_TYPES)[number];
export type PassStatus = 'Awaiting approval' | 'Approved' | 'Rejected' | 'Exited' | 'Returned' | 'Cancelled';

export interface PassItem {
  desc: string;
  qty: number;
  unit: string;
  serial?: string;
}

export interface GateCheck {
  guard: string;
  at: string;
  /** Quantities counted at the gate, same order as the pass items */
  counted: number[];
  sealNos: string;
  vehicleReg: string;
  driver: string;
  discrepancy?: string;
  photoNote?: string;
}

export interface GatePass {
  id: string;
  orgId: string;
  type: PassType;
  raisedBy: string;
  raisedOn: string;
  department: string;
  approverId: string;
  reason: string;
  destination: string;
  items: PassItem[];
  vehicleReg: string;
  driver: string;
  /** Returnable / contractor equipment going out for repair or hire */
  expectedReturn?: string;
  status: PassStatus;
  decision?: { by: string; on: string; note: string };
  check?: GateCheck;
  returned?: { at: string; guard: string; note: string; complete: boolean };
}

/** Returnable passes that are out past their return date. */
export const isOverdue = (p: GatePass, today: string) => p.status === 'Exited' && !!p.expectedReturn && p.expectedReturn < today;
export const awaitsReturn = (p: GatePass) => p.status === 'Exited' && !!p.expectedReturn;
/** Quantities counted at the gate differ from the pass, or the guard wrote a discrepancy. */
export const hasDiscrepancy = (p: GatePass) => !!p.check && (!!p.check.discrepancy || p.check.counted.some((c, i) => c !== p.items[i]?.qty));

/* ------------------------------------------------------------------ incoming goods */

export type ReceiptResult = 'Cleared to stores' | 'Held — discrepancy' | 'Rejected at gate';

export interface GoodsReceipt {
  id: string;
  orgId: string;
  at: string;
  supplier: string;
  poNo: string;
  dnNo: string;
  goods: string;
  qtyOnNote: number;
  qtyCounted: number;
  unit: string;
  vehicleReg: string;
  driver: string;
  guard: string;
  result: ReceiptResult;
  note: string;
}

/* ------------------------------------------------------------------ visitors */

export interface Visitor {
  id: string;
  orgId: string;
  kind: 'Visitor' | 'Contractor';
  name: string;
  idMasked: string;
  company: string;
  phone: string;
  hostId: string;
  purpose: string;
  preRegistered: boolean;
  expectedOn: string;
  /** Expected to leave by (stamp); later = overstay */
  expectedOut: string;
  badgeNo?: string;
  vehicleReg?: string;
  ppeIssued: boolean;
  inductionDone: boolean;
  checkIn?: string;
  checkOut?: string;
}

export type VisitorStatus = 'Expected' | 'On site' | 'Left' | 'No show';
export const visitorStatus = (v: Visitor, today: string): VisitorStatus =>
  v.checkOut ? 'Left' : v.checkIn ? 'On site' : v.expectedOn < today ? 'No show' : 'Expected';
export const isOverstay = (v: Visitor, now: string) => !!v.checkIn && !v.checkOut && v.expectedOut < now;

/** Masks a national ID / passport number, keeping the first two and last two characters. */
export const maskId = (raw: string) => {
  const s = raw.replace(/\s/g, '');
  return s.length <= 4 ? '****' : `${s.slice(0, 2)}${'*'.repeat(Math.max(3, s.length - 4))}${s.slice(-2)}`;
};

/* ------------------------------------------------------------------ cargo in transit */

export type ConsignmentKind = 'Factory to warehouse' | 'Warehouse to Mombasa auction' | 'Factory to Mombasa port' | 'Cash in transit' | 'Collection centre to factory';
export const CONSIGNMENT_KINDS: ConsignmentKind[] = ['Factory to warehouse', 'Warehouse to Mombasa auction', 'Factory to Mombasa port', 'Cash in transit', 'Collection centre to factory'];
export type ConsignmentStatus = 'Escort requested' | 'Escort approved' | 'Loading' | 'In transit' | 'Arrived' | 'Incident' | 'Rejected';

export interface Checkpoint {
  at: string;
  place: string;
  note: string;
}

export interface Consignment {
  id: string;
  orgId: string;
  ref: string;
  kind: ConsignmentKind;
  cargo: string;
  value: number;
  from: string;
  to: string;
  route: string;
  vehicleReg: string;
  driver: string;
  requestedBy: string;
  requestedOn: string;
  plannedDeparture: string;
  approval?: { by: string; on: string; note: string };
  escortGuards: string[];
  police?: string;
  sealsLoading: string[];
  sealsArrival?: string[];
  departure?: string;
  arrival?: string;
  checkpoints: Checkpoint[];
  status: ConsignmentStatus;
  incidentId?: string;
}

/** Seals at arrival that do not match the seals applied at loading. */
export const sealMismatch = (c: Consignment) =>
  !!c.sealsArrival && (c.sealsArrival.length !== c.sealsLoading.length || c.sealsArrival.some((s) => !c.sealsLoading.includes(s)));

/* ------------------------------------------------------------------ guard roster, patrols, occurrence book */

export type Shift = 'Day (06:00–18:00)' | 'Night (18:00–06:00)';
export const SHIFTS: Shift[] = ['Day (06:00–18:00)', 'Night (18:00–06:00)'];

export interface GuardShift {
  id: string;
  orgId: string;
  date: string;
  shift: Shift;
  site: string;
  post: string;
  /** Staff guard, when in-house */
  staffId?: string;
  /** Outsourced guard name */
  guardName: string;
  contractor: string;
}

export interface PatrolPoint {
  tag: string;
  name: string;
  due: string;
  scannedAt?: string;
}

export interface PatrolRound {
  id: string;
  orgId: string;
  date: string;
  shift: Shift;
  guardName: string;
  route: string;
  points: PatrolPoint[];
}

export const OB_CATEGORIES = ['Routine', 'Handover', 'Visitor', 'Alarm', 'Incident', 'Vehicle', 'Keys'] as const;
export type ObCategory = (typeof OB_CATEGORIES)[number];

export interface OccurrenceEntry {
  id: string;
  orgId: string;
  at: string;
  site: string;
  by: string;
  category: ObCategory;
  entry: string;
}

/* ------------------------------------------------------------------ incidents & investigations */

export const SEC_INCIDENT_TYPES = ['Theft', 'Trespass', 'Breach of seal', 'Assault', 'Fire', 'Suspicious activity'] as const;
export type SecIncidentType = (typeof SEC_INCIDENT_TYPES)[number];
export const OUTCOMES = ['Recovered', 'Not recovered', 'Referred to police', 'Disciplinary referral'] as const;
export type InvestigationOutcome = (typeof OUTCOMES)[number];
export type ClaimStatus = 'Lodged' | 'Under assessment' | 'Paid' | 'Declined';

export interface Investigation {
  investigatorId: string;
  openedOn: string;
  statements: { by: string; on: string; summary: string }[];
  evidence: { item: string; ref: string }[];
  cctvReviewed: boolean;
  findings: string;
  outcome?: InvestigationOutcome;
  obNumber?: string;
  closedOn?: string;
}

export interface InsuranceClaim {
  ref: string;
  insurer: string;
  claimed: number;
  paid: number;
  status: ClaimStatus;
  lodgedOn: string;
}

export interface SecIncident {
  id: string;
  orgId: string;
  type: SecIncidentType;
  site: string;
  occurredAt: string;
  reportedBy: string;
  description: string;
  lossValue: number;
  suspect?: { kind: 'Employee' | 'Outsider' | 'Unknown'; staffId?: string; name?: string };
  investigation?: Investigation;
  claim?: InsuranceClaim;
  recovered: { on: string; value: number; note: string }[];
  /** Disciplinary case raised from this incident */
  caseId?: string;
  consignmentId?: string;
  status: 'Open' | 'Under investigation' | 'Closed';
}

export const recoveredValue = (i: SecIncident) => i.recovered.reduce((n, r) => n + r.value, 0);

/* ------------------------------------------------------------------ connected systems (simulated) */

export interface SecuritySystem {
  orgId: string;
  name: string;
  detail: string;
  /** Minutes since last sync at demo start */
  syncedMinsAgo: number;
  events24h: number;
  devices: string;
  status: 'Online' | 'Degraded' | 'Offline';
}

/* ================================================================== demo records */

const gp = (
  id: string,
  orgId: string,
  type: PassType,
  raisedBy: string,
  raisedDaysAgo: number,
  department: string,
  approverId: string,
  reason: string,
  destination: string,
  items: PassItem[],
  vehicleReg: string,
  driver: string,
  status: PassStatus,
  extra: Partial<GatePass> = {}
): GatePass => ({ id, orgId, type, raisedBy, raisedOn: plusDays(todayIso(), -raisedDaysAgo), department, approverId, reason, destination, items, vehicleReg, driver, status, ...extra });

const ok = (approver: string, daysAgo: number, note = 'Approved') => ({ by: approver, on: plusDays(todayIso(), -daysAgo), note });

const K_LAPTOP: PassItem[] = [{ desc: 'Dell Latitude 5420 laptop (screen fault)', qty: 1, unit: 'pc', serial: 'SN 7HX2K93' }];
const K_CUTTER: PassItem[] = [{ desc: 'Stihl FS 450 brush cutter', qty: 2, unit: 'pcs', serial: 'SN 4471182, 4471190' }];
const K_SCRAP: PassItem[] = [{ desc: 'Scrap metal (old tractor parts, roofing)', qty: 1200, unit: 'kg' }];
const K_LEAF: PassItem[] = [{ desc: 'Green leaf in nets', qty: 182, unit: 'nets' }, { desc: 'Green leaf weight', qty: 4820, unit: 'kg' }];
const F_TEA: PassItem[] = [{ desc: 'Made tea BP1 in multiwall sacks (60 kg)', qty: 160, unit: 'bags' }, { desc: 'Made tea PF1 in multiwall sacks (60 kg)', qty: 80, unit: 'bags' }];
const F_MOTOR: PassItem[] = [{ desc: 'Withering fan motor 7.5 kW (for rewinding)', qty: 1, unit: 'pc', serial: 'WEG 132M-4 #A8813' }];
const F_FLUFF: PassItem[] = [{ desc: 'Tea fluff / refuse tea in bags', qty: 30, unit: 'bags' }];

export const SEED_GATE_PASSES: GatePass[] = [
  /* Kericho Highland Estates */
  gp('GP-2026-0141', 'org-kericho', 'Returnable', 'KHE-0280', 14, 'Information Technology', 'KHE-0178', 'Screen replacement under warranty', 'Kericho Computer Centre, Moi Highway', K_LAPTOP, 'KDA 220M (pick-up)', 'Samuel Ouma', 'Exited', {
    decision: ok('KHE-0178', 13),
    expectedReturn: plusDays(todayIso(), -5),
    check: { guard: 'Peter Langat (Simba Shield)', at: dayAt(12, '09:14'), counted: [1], sealNos: '—', vehicleReg: 'KDA 220M', driver: 'Samuel Ouma' }
  }),
  gp('GP-2026-0146', 'org-kericho', 'Returnable', 'KHE-0270', 4, 'Engineering & Maintenance', 'KHE-0160', 'Annual service at the dealer', 'Kericho Agro Machinery, Temple Road', K_CUTTER, 'KDA 220M (pick-up)', 'Joseph Mutua', 'Exited', {
    decision: ok('KHE-0160', 4),
    expectedReturn: plusDays(todayIso(), 4),
    check: { guard: 'Hassan Omar (Simba Shield)', at: dayAt(3, '10:40'), counted: [2], sealNos: '—', vehicleReg: 'KDA 220M', driver: 'Joseph Mutua' }
  }),
  gp('GP-2026-0144', 'org-kericho', 'Non-returnable', 'KHE-0263', 8, 'Operations', 'KHE-0134', 'Scrap sold by tender T/12/2026 to Mwangaza Metals', 'Mwangaza Metals yard, Kericho', K_SCRAP, 'KCH 771P', 'Buyer’s driver (Abdi Noor)', 'Exited', {
    decision: ok('KHE-0134', 7, 'Approved. Buyer has paid the tender sum'),
    check: {
      guard: 'Peter Langat (Simba Shield)',
      at: dayAt(6, '14:05'),
      counted: [1260],
      sealNos: '—',
      vehicleReg: 'KCH 771P',
      driver: 'Abdi Noor',
      discrepancy: 'Gate weighbridge read 1,260 kg against 1,200 kg on the pass',
      photoNote: 'Photo of weighbridge ticket WB-55120 and loaded truck saved to gate tablet, folder GP-0144'
    }
  }),
  gp('GP-2026-0149', 'org-kericho', 'Transfer between sites', 'KHE-0251', 0, 'Operations', 'KHE-0160', 'Morning leaf delivery', 'Kericho Factory Unit 1 (leaf intake)', K_LEAF, 'KCE 905L (leaf truck)', 'Ali Bakari', 'Exited', {
    decision: ok('KHE-0160', 0),
    check: { guard: 'Hassan Omar (Simba Shield)', at: dayAt(0, '07:50'), counted: [182, 4820], sealNos: 'Tarp seal KHE-L-20931', vehicleReg: 'KCE 905L', driver: 'Ali Bakari' }
  }),
  gp('GP-2026-0150', 'org-kericho', 'Transfer between sites', 'KHE-0263', 0, 'Operations', 'KHE-0160', 'Restock Kapsoit field station for spraying programme', 'Kapsoit field station', [
    { desc: 'Knapsack sprayer 16 L', qty: 2, unit: 'pcs' },
    { desc: 'Glyphosate herbicide 20 L can', qty: 2, unit: 'cans' }
  ], 'KDA 220M (pick-up)', 'Samuel Ouma', 'Awaiting approval'),
  gp('GP-2026-0151', 'org-kericho', 'Returnable', 'KHE-0290', 0, 'Finance & Administration', 'KHE-0134', 'Supervisor training at Tea Hotel, Kericho', 'Tea Hotel conference hall', [
    { desc: 'Epson projector EB-X51 with bag', qty: 1, unit: 'pc', serial: 'X51-88231' },
    { desc: 'Flip chart stand', qty: 1, unit: 'pc' }
  ], 'Staff car KCX 118D', 'Rose Chepkoech', 'Awaiting approval', { expectedReturn: plusDays(todayIso(), 3) }),
  gp('GP-2026-0147', 'org-kericho', 'Contractor equipment', 'KHE-0270', 2, 'Engineering & Maintenance', 'KHE-0160', 'Contractor finished staff-house roofing; taking own tools out', 'Kipsigis Builders & Welders', [
    { desc: 'Welding generator (contractor’s own)', qty: 1, unit: 'pc', serial: 'LNC-55K-0921' },
    { desc: 'Aluminium ladder 6 m', qty: 2, unit: 'pcs' }
  ], 'KBZ 602Q', 'Kipsigis Builders driver', 'Approved', { decision: ok('KHE-0160', 1) }),
  gp('GP-2026-0132', 'org-kericho', 'Returnable', 'KHE-0251', 30, 'Operations', 'KHE-0160', 'Standby power for Kapsoit station during mains repair', 'Kapsoit field station', [{ desc: 'Petrol generator 5 kVA', qty: 1, unit: 'pc', serial: 'HND-EG5-4410' }], 'KDA 220M (pick-up)', 'Joseph Mutua', 'Returned', {
    decision: ok('KHE-0160', 30),
    expectedReturn: plusDays(todayIso(), -16),
    check: { guard: 'Peter Langat (Simba Shield)', at: dayAt(29, '08:30'), counted: [1], sealNos: '—', vehicleReg: 'KDA 220M', driver: 'Joseph Mutua' },
    returned: { at: dayAt(17, '16:20'), guard: 'Hassan Omar (Simba Shield)', note: 'Returned in working order', complete: true }
  }),
  gp('GP-2026-0138', 'org-kericho', 'Non-returnable', 'KHE-0301', 18, 'Operations', 'KHE-0160', 'Old tyres requested by staff', 'Staff (private use)', [{ desc: 'Used tyres 11R22.5', qty: 6, unit: 'pcs' }], '—', '—', 'Rejected', {
    decision: { by: 'KHE-0160', on: plusDays(todayIso(), -17), note: 'Rejected. Used tyres are disposed of by tender, not given out' }
  }),

  /* Kericho Factory Unit 1 */
  gp('GP-2026-0312', 'org-factory', 'Sale dispatch', 'KPF-1122', 3, 'Production & Quality Control', 'KPF-1121', 'Auction sale 41 lots via Chai Brokers; consignment KCF/MSA/2026/118', 'Mombasa auction warehouse (Chai Trading)', F_TEA, 'KCN 418T + ZE 2231', 'Ali Bakari', 'Exited', {
    decision: ok('KPF-1121', 2),
    check: { guard: 'Wycliffe Mutai (Simba Shield)', at: dayAt(1, '17:55'), counted: [160, 80], sealNos: 'IN-448120, IN-448121', vehicleReg: 'KCN 418T', driver: 'Ali Bakari' }
  }),
  gp('GP-2026-0298', 'org-factory', 'Returnable', 'KHE-1021', 22, 'Engineering & Maintenance', 'KPF-1121', 'Motor burnt out; rewinding at Nakuru workshop', 'Rift Electrical Rewinders, Nakuru', F_MOTOR, 'KCE 905L', 'Ali Bakari', 'Exited', {
    decision: ok('KPF-1121', 21),
    expectedReturn: plusDays(todayIso(), -6),
    check: { guard: 'Wycliffe Mutai (Simba Shield)', at: dayAt(20, '11:02'), counted: [1], sealNos: '—', vehicleReg: 'KCE 905L', driver: 'Ali Bakari' }
  }),
  gp('GP-2026-0305', 'org-factory', 'Non-returnable', 'KPF-1123', 7, 'Production & Quality Control', 'KPF-1121', 'Refuse tea sold to licensed buyer (TBK licence RT/114)', 'Kapkatet Refuse Tea Buyers', F_FLUFF, 'KCA 330B', 'Buyer’s driver (Kibet Langat)', 'Exited', {
    decision: ok('KPF-1121', 7),
    check: {
      guard: 'Mary Chelangat (Simba Shield)',
      at: dayAt(5, '15:30'),
      counted: [32],
      sealNos: '—',
      vehicleReg: 'KCA 330B',
      driver: 'Kibet Langat',
      discrepancy: '32 bags on the truck against 30 on the pass. 2 bags offloaded and returned to store.',
      photoNote: 'Photos of the load and offloaded bags filed under GP-0305; store notified'
    }
  }),
  gp('GP-2026-0315', 'org-factory', 'Non-returnable', 'KPF-1123', 0, 'Production & Quality Control', 'KPF-1121', 'Refuse tea sale, October lot', 'Kapkatet Refuse Tea Buyers', [{ desc: 'Tea fluff / refuse tea in bags', qty: 15, unit: 'bags' }], 'KCA 330B', 'Kibet Langat', 'Awaiting approval'),
  gp('GP-2026-0316', 'org-factory', 'Returnable', 'KPF-1130', 0, 'Production & Quality Control', 'KPF-1121', 'Annual calibration at KEBS', 'KEBS metrology lab, Nairobi', [{ desc: 'Moisture meter (Kett PM-450)', qty: 1, unit: 'pc', serial: 'PM450-22781' }], 'Courier (G-Link)', 'Courier', 'Awaiting approval', { expectedReturn: plusDays(todayIso(), 14) }),
  gp('GP-2026-0314', 'org-factory', 'Transfer between sites', 'KPF-1122', 1, 'Production & Quality Control', 'KPF-1121', 'Sacks for estate leaf collection', 'Kericho Highland Estates store', [{ desc: 'Multiwall paper sacks', qty: 500, unit: 'pcs' }], 'KCE 905L', 'Ali Bakari', 'Approved', { decision: ok('KPF-1121', 0) }),
  gp('GP-2026-0309', 'org-factory', 'Contractor equipment', 'KHE-1021', 6, 'Engineering & Maintenance', 'KPF-1121', 'Boiler house repairs complete; scaffolding leaving', 'Kericho Steel Fabricators', [{ desc: 'Scaffold frames', qty: 40, unit: 'pcs' }, { desc: 'Scaffold boards', qty: 24, unit: 'pcs' }], 'KBM 118K', 'Contractor driver', 'Exited', {
    decision: ok('KPF-1121', 6),
    check: { guard: 'Mary Chelangat (Simba Shield)', at: dayAt(5, '12:10'), counted: [40, 24], sealNos: '—', vehicleReg: 'KBM 118K', driver: 'Contractor driver' }
  }),

  /* Nandi Hills Outgrowers */
  gp('GP-2026-0412', 'org-nandi', 'Returnable', 'NHO-1141', 9, 'Operations', 'NHO-1140', '1,000 km service', 'Nandi Hills Honda dealer', [{ desc: 'Motorbike Honda XR150 (KMFX 220B)', qty: 1, unit: 'pc' }], 'Ridden', 'Rose Wekesa', 'Exited', {
    decision: ok('NHO-1140', 9),
    expectedReturn: plusDays(todayIso(), -2),
    check: { guard: 'Kiprop Rotich (Nandi Watchmen)', at: dayAt(8, '08:05'), counted: [1], sealNos: '—', vehicleReg: 'KMFX 220B', driver: 'Rose Wekesa' }
  }),
  gp('GP-2026-0415', 'org-nandi', 'Transfer between sites', 'NHO-1142', 0, 'Operations', 'NHO-1140', 'Scales for the new Kapsimotwo collection centre', 'Kapsimotwo collection centre', [{ desc: 'Electronic leaf scale 150 kg', qty: 2, unit: 'pcs' }], 'KCU 401R', 'Field driver', 'Awaiting approval'),

  /* Rift Valley Agricultural Holding */
  gp('GP-2026-0507', 'org-rift', 'Returnable', 'RVA-1164', 5, 'Engineering & Maintenance', 'RVA-1161', 'Disc harrow hired to neighbouring farm (agreement RVA/HIRE/09)', 'Kaptich farm, Molo', [{ desc: 'Disc harrow 20-disc', qty: 1, unit: 'pc' }], 'Tractor KTCB 771A', 'Collins Njeri', 'Exited', {
    decision: ok('RVA-1161', 5),
    expectedReturn: plusDays(todayIso(), 9),
    check: { guard: 'Omari Juma (Rift Patrol)', at: dayAt(4, '07:20'), counted: [1], sealNos: '—', vehicleReg: 'KTCB 771A', driver: 'Collins Njeri' }
  }),
  gp('GP-2026-0509', 'org-rift', 'Sale dispatch', 'RVA-1166', 1, 'Finance & Administration', 'RVA-1161', 'Seedling sale invoice INV-RVA-2210', 'Molo Agro Co-operative', [{ desc: 'Tea seedlings (clone TRFK 306)', qty: 2500, unit: 'pcs' }], 'KCF 220T', 'Buyer’s driver', 'Approved', { decision: ok('RVA-1161', 0) }),

  /* Corporate HQ Nairobi */
  gp('GP-2026-0611', 'org-nairobi', 'Returnable', 'KHE-0307', 3, 'Information Technology', 'KHE-0104', 'Board retreat at Lake Naivasha', 'Enashipai Resort, Naivasha', [{ desc: 'Laptop (board pack)', qty: 4, unit: 'pcs' }, { desc: 'Portable speaker system', qty: 1, unit: 'set' }], 'KDK 551H', 'Patrick Moraa', 'Exited', {
    decision: ok('KHE-0104', 3),
    expectedReturn: plusDays(todayIso(), 1),
    check: { guard: 'Lucy Wairimu (Metro Guarding)', at: dayAt(2, '06:45'), counted: [4, 1], sealNos: '—', vehicleReg: 'KDK 551H', driver: 'Patrick Moraa' }
  }),
  gp('GP-2026-0613', 'org-nairobi', 'Non-returnable', 'HQ-1177', 0, 'Finance & Administration', 'HQ-1175', 'Donation of old office chairs to Kibera school (board resolution 14/2026)', 'Olympic Primary School, Kibera', [{ desc: 'Office chairs (old)', qty: 18, unit: 'pcs' }], 'Hired lorry', 'Hired driver', 'Awaiting approval')
];

const gr = (id: string, orgId: string, at: string, supplier: string, poNo: string, dnNo: string, goods: string, qtyOnNote: number, qtyCounted: number, unit: string, vehicleReg: string, driver: string, guard: string, result: ReceiptResult, note: string): GoodsReceipt => ({
  id,
  orgId,
  at,
  supplier,
  poNo,
  dnNo,
  goods,
  qtyOnNote,
  qtyCounted,
  unit,
  vehicleReg,
  driver,
  guard,
  result,
  note
});

export const SEED_RECEIPTS: GoodsReceipt[] = [
  gr('GR-1201', 'org-kericho', dayAt(0, '09:20'), 'Highland Agrochem Ltd', 'PO-KHE-2026-0884', 'DN 44120', 'NPK 26:5:5 fertiliser, 50 kg bags', 200, 200, 'bags', 'KCQ 342M', 'Ochieng Okoth', 'Hassan Omar (Simba Shield)', 'Cleared to stores', 'Seals intact; handed to John Kiprop at stores'),
  gr('GR-1198', 'org-kericho', dayAt(2, '11:45'), 'Kericho Hardware & Steel', 'PO-KHE-2026-0871', 'DN 9921', 'Iron sheets gauge 30 (3 m)', 120, 114, 'pcs', 'KBY 610C', 'Supplier driver', 'Peter Langat (Simba Shield)', 'Held — discrepancy', '6 sheets short against the delivery note; supplier to deliver balance, stores to receive 114 only'),
  gr('GR-1190', 'org-kericho', dayAt(6, '14:10'), 'Rift Packaging Ltd', 'PO-KHE-2026-0850', 'DN 7712', 'Plucking baskets', 300, 300, 'pcs', 'KCB 889A', 'Supplier driver', 'Hassan Omar (Simba Shield)', 'Cleared to stores', ''),
  gr('GR-1185', 'org-kericho', dayAt(11, '10:05'), 'Mara Uniforms', 'PO-KHE-2026-0832', 'DN 3310', 'Rain capes (PPE)', 150, 150, 'pcs', 'KDB 115X', 'Supplier driver', 'Peter Langat (Simba Shield)', 'Cleared to stores', ''),
  gr('GR-2310', 'org-factory', dayAt(0, '06:40'), 'Sotik Firewood Suppliers', 'PO-KPF-2026-1120', 'DN 0558', 'Eucalyptus firewood (boiler fuel)', 30, 30, 'm³', 'KCD 714E', 'Supplier driver', 'Wycliffe Mutai (Simba Shield)', 'Cleared to stores', 'Measured on the stacking bay with the boiler foreman'),
  gr('GR-2306', 'org-factory', dayAt(1, '13:25'), 'Rift Packaging Ltd', 'PO-KPF-2026-1108', 'DN 7740', 'Multiwall paper sacks (printed)', 2000, 2000, 'pcs', 'KCB 889A', 'Supplier driver', 'Mary Chelangat (Simba Shield)', 'Cleared to stores', ''),
  gr('GR-2301', 'org-factory', dayAt(4, '10:50'), 'Kenya Industrial Lubricants', 'PO-KPF-2026-1096', 'DN 2281', 'Gear oil 20 L', 12, 12, 'cans', 'KCJ 552D', 'Supplier driver', 'Mary Chelangat (Simba Shield)', 'Rejected at gate', 'Cans not sealed; two showed signs of refilling. Supplier told to collect.'),
  gr('GR-2298', 'org-factory', dayAt(5, '08:15'), 'Sotik Firewood Suppliers', 'PO-KPF-2026-1090', 'DN 0549', 'Eucalyptus firewood (boiler fuel)', 30, 26, 'm³', 'KCD 714E', 'Supplier driver', 'Wycliffe Mutai (Simba Shield)', 'Held — discrepancy', 'Stack measured 26 m³ against 30 on the delivery note; accounts to pay on measured volume'),
  gr('GR-2290', 'org-factory', dayAt(9, '15:00'), 'Kericho Steel Fabricators', 'PO-KPF-2026-1071', 'DN 418', 'Withering trough mesh panels', 16, 16, 'pcs', 'KBM 118K', 'Contractor driver', 'Wycliffe Mutai (Simba Shield)', 'Cleared to stores', ''),
  gr('GR-3104', 'org-nandi', dayAt(3, '09:40'), 'Nandi Agrovet', 'PO-NHO-2026-0210', 'DN 1201', 'Leaf nets', 400, 400, 'pcs', 'KBT 902L', 'Supplier driver', 'Kiprop Rotich (Nandi Watchmen)', 'Cleared to stores', ''),
  gr('GR-4102', 'org-rift', dayAt(2, '12:30'), 'Molo Fuel Distributors', 'PO-RVA-2026-0118', 'DN 6610', 'Diesel (farm tank)', 5000, 4960, 'litres', 'KCR 330F (tanker)', 'Tanker driver', 'Omari Juma (Rift Patrol)', 'Held — discrepancy', 'Dip reading 4,960 L against 5,000 L; tanker seals intact. Farm manager to agree the variance.'),
  gr('GR-5021', 'org-nairobi', dayAt(1, '10:15'), 'Office Mart Kenya', 'PO-HQ-2026-0402', 'DN 8831', 'A4 paper reams', 100, 100, 'reams', 'KDH 220Z', 'Supplier driver', 'Lucy Wairimu (Metro Guarding)', 'Cleared to stores', '')
];

const vis = (v: Omit<Visitor, 'ppeIssued' | 'inductionDone'> & Partial<Pick<Visitor, 'ppeIssued' | 'inductionDone'>>): Visitor => ({ ppeIssued: false, inductionDone: false, ...v });
const T = () => todayIso();

export const SEED_VISITORS: Visitor[] = [
  /* Kericho */
  vis({ id: 'VIS-3301', orgId: 'org-kericho', kind: 'Visitor', name: 'Dr. Wilson Kiprotich', idMasked: '23*****61', company: 'Tea Research Institute (KALRO-TRI)', phone: '+254 722 *** 410', hostId: 'KHE-0160', purpose: 'Clone trial inspection, block 14', preRegistered: true, expectedOn: T(), expectedOut: minsAgo(-120), badgeNo: 'V-014', vehicleReg: 'GK B 441K', ppeIssued: true, inductionDone: true, checkIn: minsAgo(95) }),
  vis({ id: 'VIS-3302', orgId: 'org-kericho', kind: 'Contractor', name: 'Hillary Kimutai', idMasked: '28*****07', company: 'Kipsigis Builders & Welders', phone: '+254 711 *** 552', hostId: 'KHE-0270', purpose: 'Staff-house roofing snag list', preRegistered: true, expectedOn: T(), expectedOut: minsAgo(40), badgeNo: 'C-006', vehicleReg: 'KBZ 602Q', ppeIssued: true, inductionDone: true, checkIn: minsAgo(260) }),
  vis({ id: 'VIS-3303', orgId: 'org-kericho', kind: 'Visitor', name: 'Mercy Chepngeno', idMasked: '30*****88', company: 'KCB Bank Kericho', phone: '+254 733 *** 109', hostId: 'KHE-0134', purpose: 'Staff loan clinic', preRegistered: false, expectedOn: T(), expectedOut: minsAgo(-60), badgeNo: 'V-021', ppeIssued: false, inductionDone: true, checkIn: minsAgo(50) }),
  vis({ id: 'VIS-3304', orgId: 'org-kericho', kind: 'Visitor', name: 'Ahmed Yusuf', idMasked: '25*****13', company: 'Chai Brokers Ltd', phone: '+254 720 *** 776', hostId: 'KHE-0152', purpose: 'Quarterly market review', preRegistered: true, expectedOn: T(), expectedOut: `${T()}T16:00` }),
  vis({ id: 'VIS-3305', orgId: 'org-kericho', kind: 'Contractor', name: 'Paul Ngetich', idMasked: '27*****40', company: 'Kericho Pest Control', phone: '+254 712 *** 381', hostId: 'KHE-0263', purpose: 'Store fumigation', preRegistered: true, expectedOn: plusDays(T(), 1), expectedOut: `${plusDays(T(), 1)}T15:00` }),
  vis({ id: 'VIS-3296', orgId: 'org-kericho', kind: 'Visitor', name: 'Janet Langat', idMasked: '31*****52', company: 'County Labour Office', phone: '+254 721 *** 640', hostId: 'KHE-0290', purpose: 'Labour inspection follow-up', preRegistered: true, expectedOn: plusDays(T(), -1), expectedOut: dayAt(1, '13:00'), badgeNo: 'V-009', vehicleReg: 'GK A 902T', ppeIssued: false, inductionDone: true, checkIn: dayAt(1, '09:05'), checkOut: dayAt(1, '12:40') }),
  vis({ id: 'VIS-3290', orgId: 'org-kericho', kind: 'Contractor', name: 'Stephen Maina', idMasked: '29*****19', company: 'PowerGen Services', phone: '+254 722 *** 935', hostId: 'KHE-0270', purpose: 'Generator service', preRegistered: true, expectedOn: plusDays(T(), -3), expectedOut: dayAt(3, '17:00'), badgeNo: 'C-002', vehicleReg: 'KCK 515G', ppeIssued: true, inductionDone: true, checkIn: dayAt(3, '08:30'), checkOut: dayAt(3, '16:10') }),
  vis({ id: 'VIS-3288', orgId: 'org-kericho', kind: 'Visitor', name: 'Lydia Koech', idMasked: '33*****71', company: 'Job applicant', phone: '+254 745 *** 211', hostId: 'KHE-0290', purpose: 'Interview: accounts clerk', preRegistered: true, expectedOn: plusDays(T(), -4), expectedOut: dayAt(4, '12:00') }),

  /* Factory */
  vis({ id: 'VIS-4411', orgId: 'org-factory', kind: 'Contractor', name: 'Eng. Martin Kiprono', idMasked: '24*****35', company: 'Boiler Masters EA', phone: '+254 722 *** 118', hostId: 'KHE-1021', purpose: 'Boiler hydraulic test prep (licence renewal)', preRegistered: true, expectedOn: T(), expectedOut: minsAgo(-240), badgeNo: 'C-031', vehicleReg: 'KCL 802B', ppeIssued: true, inductionDone: true, checkIn: minsAgo(150) }),
  vis({ id: 'VIS-4412', orgId: 'org-factory', kind: 'Contractor', name: 'Josphat Kirui', idMasked: '29*****66', company: 'Boiler Masters EA', phone: '+254 710 *** 404', hostId: 'KHE-1021', purpose: 'Boiler hydraulic test prep (assistant)', preRegistered: true, expectedOn: T(), expectedOut: minsAgo(-240), badgeNo: 'C-032', vehicleReg: 'KCL 802B', ppeIssued: true, inductionDone: true, checkIn: minsAgo(150) }),
  vis({ id: 'VIS-4413', orgId: 'org-factory', kind: 'Visitor', name: 'Sarah Wambugu', idMasked: '26*****20', company: 'Bureau Veritas', phone: '+254 733 *** 870', hostId: 'KPF-1121', purpose: 'ISO 45001 finding close-out', preRegistered: true, expectedOn: T(), expectedOut: minsAgo(15), badgeNo: 'V-044', ppeIssued: true, inductionDone: true, checkIn: minsAgo(200) }),
  vis({ id: 'VIS-4414', orgId: 'org-factory', kind: 'Visitor', name: 'Abdi Noor', idMasked: '32*****04', company: 'Mwangaza Metals', phone: '+254 728 *** 315', hostId: 'KPF-1123', purpose: 'Collect scrap quote', preRegistered: false, expectedOn: T(), expectedOut: minsAgo(-30), badgeNo: 'V-045', vehicleReg: 'KCH 771P', ppeIssued: false, inductionDone: false, checkIn: minsAgo(20) }),
  vis({ id: 'VIS-4415', orgId: 'org-factory', kind: 'Contractor', name: 'Gideon Mutai', idMasked: '27*****93', company: 'Kericho Steel Fabricators', phone: '+254 711 *** 728', hostId: 'KHE-1021', purpose: 'Measure withering trough mesh', preRegistered: true, expectedOn: T(), expectedOut: `${T()}T15:30` }),
  vis({ id: 'VIS-4416', orgId: 'org-factory', kind: 'Visitor', name: 'Inspector Ann Moraa', idMasked: '22*****58', company: 'DOSHS Kericho', phone: '+254 720 *** 663', hostId: 'KHE-0171', purpose: 'Fire audit follow-up', preRegistered: true, expectedOn: plusDays(T(), 2), expectedOut: `${plusDays(T(), 2)}T13:00` }),
  vis({ id: 'VIS-4405', orgId: 'org-factory', kind: 'Visitor', name: 'Peter Gathogo', idMasked: '28*****47', company: 'Chai Trading Co.', phone: '+254 722 *** 590', hostId: 'KPF-1121', purpose: 'Tasting & grading visit', preRegistered: true, expectedOn: plusDays(T(), -2), expectedOut: dayAt(2, '15:00'), badgeNo: 'V-040', vehicleReg: 'KDA 778S', ppeIssued: true, inductionDone: true, checkIn: dayAt(2, '10:00'), checkOut: dayAt(2, '14:35') }),
  vis({ id: 'VIS-4401', orgId: 'org-factory', kind: 'Contractor', name: 'Felix Rono', idMasked: '30*****29', company: 'Kericho Steel Fabricators', phone: '+254 711 *** 728', hostId: 'KHE-1021', purpose: 'Remove scaffolding', preRegistered: true, expectedOn: plusDays(T(), -5), expectedOut: dayAt(5, '17:00'), badgeNo: 'C-028', vehicleReg: 'KBM 118K', ppeIssued: true, inductionDone: true, checkIn: dayAt(5, '07:30'), checkOut: dayAt(5, '18:45') }),

  /* Nandi */
  vis({ id: 'VIS-5102', orgId: 'org-nandi', kind: 'Visitor', name: 'Rael Jebet', idMasked: '29*****36', company: 'Nandi County Agriculture', phone: '+254 723 *** 551', hostId: 'NHO-1140', purpose: 'Farmer training planning', preRegistered: true, expectedOn: T(), expectedOut: minsAgo(-90), badgeNo: 'V-003', ppeIssued: false, inductionDone: true, checkIn: minsAgo(70) }),
  vis({ id: 'VIS-5103', orgId: 'org-nandi', kind: 'Contractor', name: 'Elias Too', idMasked: '31*****12', company: 'Nandi Scales & Weighing', phone: '+254 714 *** 208', hostId: 'NHO-1142', purpose: 'Install scales at Kapsimotwo', preRegistered: true, expectedOn: plusDays(T(), 1), expectedOut: `${plusDays(T(), 1)}T16:00` }),

  /* Rift */
  vis({ id: 'VIS-6101', orgId: 'org-rift', kind: 'Contractor', name: 'John Wafula', idMasked: '26*****81', company: 'Molo Tractor Services', phone: '+254 722 *** 337', hostId: 'RVA-1164', purpose: 'Tractor gearbox repair', preRegistered: true, expectedOn: T(), expectedOut: minsAgo(10), badgeNo: 'C-002', vehicleReg: 'KBV 662C', ppeIssued: true, inductionDone: true, checkIn: minsAgo(300) }),

  /* Nairobi */
  vis({ id: 'VIS-7201', orgId: 'org-nairobi', kind: 'Visitor', name: 'Catherine Njoroge', idMasked: '24*****90', company: 'External auditors (PwC Kenya)', phone: '+254 722 *** 144', hostId: 'KHE-0231', purpose: 'Interim audit fieldwork', preRegistered: true, expectedOn: T(), expectedOut: minsAgo(-180), badgeNo: 'V-112', ppeIssued: false, inductionDone: true, checkIn: minsAgo(120) }),
  vis({ id: 'VIS-7202', orgId: 'org-nairobi', kind: 'Visitor', name: 'Brian Odera', idMasked: '30*****45', company: 'External auditors (PwC Kenya)', phone: '+254 711 *** 302', hostId: 'KHE-0231', purpose: 'Interim audit fieldwork', preRegistered: true, expectedOn: T(), expectedOut: minsAgo(-180), badgeNo: 'V-113', ppeIssued: false, inductionDone: true, checkIn: minsAgo(120) }),
  vis({ id: 'VIS-7203', orgId: 'org-nairobi', kind: 'Contractor', name: 'Moses Kariuki', idMasked: '28*****62', company: 'CoolAir HVAC', phone: '+254 733 *** 818', hostId: 'KHE-0307', purpose: 'Server room AC service', preRegistered: true, expectedOn: T(), expectedOut: `${T()}T14:00` }),
  vis({ id: 'VIS-7195', orgId: 'org-nairobi', kind: 'Visitor', name: 'Hon. Daniel Sang', idMasked: '21*****05', company: 'Tea Board of Kenya', phone: '+254 720 *** 400', hostId: 'HQ-1175', purpose: 'Meeting with the Group MD', preRegistered: true, expectedOn: plusDays(T(), -1), expectedOut: dayAt(1, '12:00'), badgeNo: 'V-108', vehicleReg: 'KCZ 001A', checkIn: dayAt(1, '10:02'), checkOut: dayAt(1, '11:48'), inductionDone: true })
];

const con = (c: Omit<Consignment, 'checkpoints' | 'escortGuards' | 'sealsLoading'> & Partial<Pick<Consignment, 'checkpoints' | 'escortGuards' | 'sealsLoading'>>): Consignment => ({
  checkpoints: [],
  escortGuards: [],
  sealsLoading: [],
  ...c
});

export const SEED_CONSIGNMENTS: Consignment[] = [
  con({
    id: 'CN-118',
    orgId: 'org-factory',
    ref: 'KCF/MSA/2026/118',
    kind: 'Warehouse to Mombasa auction',
    cargo: '240 bags made tea (160 BP1, 80 PF1), 14,400 kg — 41 auction lots',
    value: 5_184_000,
    from: 'Kericho Factory Unit 1',
    to: 'Chai Trading warehouse, Mombasa',
    route: 'Kericho – Nakuru – Nairobi bypass – Mtito Andei – Mombasa',
    vehicleReg: 'KCN 418T + ZE 2231',
    driver: 'Ali Bakari',
    requestedBy: 'KPF-1122',
    requestedOn: plusDays(T(), -4),
    plannedDeparture: dayAt(1, '18:00'),
    approval: { by: 'KPF-1121', on: plusDays(T(), -3), note: 'Approved with police escort' },
    escortGuards: ['Peter Langat (Simba Shield)', 'Hassan Omar (Simba Shield)'],
    police: 'AP escort: Cpl. Kiprono + 1 officer, escort ref KER/AP/ESC/2026/77',
    sealsLoading: ['IN-448120', 'IN-448121'],
    departure: dayAt(1, '18:10'),
    checkpoints: [
      { at: dayAt(1, '20:45'), place: 'Nakuru — Gilgil weighbridge', note: 'Seals intact, 14.6 t on axle' },
      { at: dayAt(0, '00:30'), place: 'Nairobi Southern Bypass — Mlolongo', note: 'Driver rest 30 min, escort awake on watch' },
      { at: dayAt(0, '05:15'), place: 'Mtito Andei', note: 'Fuel stop; seals checked by escort' }
    ],
    status: 'In transit'
  }),
  con({
    id: 'CN-115',
    orgId: 'org-factory',
    ref: 'KCF/MSA/2026/115',
    kind: 'Warehouse to Mombasa auction',
    cargo: '300 bags made tea (BP1, PF1, PD), 18,000 kg — 52 lots',
    value: 6_300_000,
    from: 'Kericho Factory Unit 1',
    to: 'Chai Trading warehouse, Mombasa',
    route: 'Kericho – Nakuru – Nairobi bypass – Mombasa',
    vehicleReg: 'KCN 418T + ZE 2231',
    driver: 'Ali Bakari',
    requestedBy: 'KPF-1122',
    requestedOn: plusDays(T(), -12),
    plannedDeparture: dayAt(10, '18:00'),
    approval: { by: 'KPF-1121', on: plusDays(T(), -11), note: 'Approved' },
    escortGuards: ['Wycliffe Mutai (Simba Shield)', 'Hassan Omar (Simba Shield)'],
    police: 'AP escort: Cpl. Chirchir + 1 officer, ref KER/AP/ESC/2026/71',
    sealsLoading: ['IN-447902', 'IN-447903'],
    sealsArrival: ['IN-447902', 'IN-447903'],
    departure: dayAt(10, '18:20'),
    arrival: dayAt(9, '11:40'),
    checkpoints: [
      { at: dayAt(10, '21:10'), place: 'Gilgil weighbridge', note: 'OK' },
      { at: dayAt(9, '04:50'), place: 'Mtito Andei', note: 'OK' }
    ],
    status: 'Arrived'
  }),
  con({
    id: 'CN-112',
    orgId: 'org-factory',
    ref: 'KCF/MSA/2026/112',
    kind: 'Factory to Mombasa port',
    cargo: '200 bags made tea (BP1) for direct export, 12,000 kg — container MSKU 771204-3',
    value: 4_320_000,
    from: 'Kericho Factory Unit 1',
    to: 'Kilindini port, Mombasa (CFS)',
    route: 'Kericho – Nakuru – Nairobi – Mombasa',
    vehicleReg: 'KCP 225W + ZF 1180',
    driver: 'Hired driver: Juma Salim (Coast Haulage)',
    requestedBy: 'KPF-1122',
    requestedOn: plusDays(T(), -20),
    plannedDeparture: dayAt(18, '17:00'),
    approval: { by: 'KPF-1121', on: plusDays(T(), -19), note: 'Approved; haulier vetted' },
    escortGuards: ['Mary Chelangat (Simba Shield)'],
    sealsLoading: ['IN-447610', 'MSK 6640221'],
    sealsArrival: ['IN-447610', 'MSK 6640298'],
    departure: dayAt(18, '17:15'),
    arrival: dayAt(17, '13:05'),
    checkpoints: [
      { at: dayAt(18, '20:00'), place: 'Gilgil weighbridge', note: 'Seals checked OK' },
      { at: dayAt(17, '03:30'), place: 'Mariakani', note: 'Unscheduled 50-minute stop; driver said tyre change' }
    ],
    status: 'Incident',
    incidentId: 'SI-2026-031'
  }),
  con({
    id: 'CN-119',
    orgId: 'org-factory',
    ref: 'KCF/WH/2026/119',
    kind: 'Factory to warehouse',
    cargo: '120 bags made tea (PF1, PD), 7,200 kg',
    value: 2_520_000,
    from: 'Kericho Factory Unit 1',
    to: 'Kericho bonded warehouse (Kapsoit)',
    route: 'Factory – Kericho–Nakuru highway – Kapsoit',
    vehicleReg: 'KCE 905L',
    driver: 'Ali Bakari',
    requestedBy: 'KPF-1123',
    requestedOn: plusDays(T(), -1),
    plannedDeparture: dayAt(0, '14:00'),
    approval: { by: 'KPF-1121', on: plusDays(T(), -1), note: 'Approved' },
    escortGuards: ['Wycliffe Mutai (Simba Shield)'],
    sealsLoading: ['IN-448190'],
    status: 'Loading'
  }),
  con({
    id: 'CN-120',
    orgId: 'org-factory',
    ref: 'KCF/MSA/2026/120',
    kind: 'Warehouse to Mombasa auction',
    cargo: '280 bags made tea, 16,800 kg — 47 lots (sale 42)',
    value: 5_900_000,
    from: 'Kericho bonded warehouse (Kapsoit)',
    to: 'Chai Trading warehouse, Mombasa',
    route: 'Kapsoit – Nakuru – Nairobi bypass – Mombasa',
    vehicleReg: 'KCN 418T + ZE 2231',
    driver: 'Ali Bakari',
    requestedBy: 'KPF-1122',
    requestedOn: T(),
    plannedDeparture: dayAt(-3, '18:00'),
    status: 'Escort requested'
  }),
  con({
    id: 'CN-221',
    orgId: 'org-kericho',
    ref: 'KHE/CIT/2026/41',
    kind: 'Cash in transit',
    cargo: 'Casual pay cash, KES 2.4m in 3 sealed cash boxes',
    value: 2_400_000,
    from: 'KCB Kericho branch',
    to: 'Estate pay office, Kapsoit',
    route: 'Kericho town – Kericho–Nakuru highway – Kapsoit (no stops)',
    vehicleReg: 'KDA 220M',
    driver: 'Samuel Ouma',
    requestedBy: 'KHE-0134',
    requestedOn: plusDays(T(), -1),
    plannedDeparture: dayAt(-1, '09:30'),
    approval: { by: 'KHE-0120', on: T(), note: 'Approved; police escort mandatory for cash over KES 1m' },
    status: 'Escort approved'
  }),
  con({
    id: 'CN-214',
    orgId: 'org-kericho',
    ref: 'KHE/CIT/2026/38',
    kind: 'Cash in transit',
    cargo: 'Casual pay cash, KES 2.2m in 3 sealed cash boxes',
    value: 2_200_000,
    from: 'KCB Kericho branch',
    to: 'Estate pay office, Kapsoit',
    route: 'Kericho town – Kapsoit',
    vehicleReg: 'KDA 220M',
    driver: 'Samuel Ouma',
    requestedBy: 'KHE-0134',
    requestedOn: plusDays(T(), -16),
    plannedDeparture: dayAt(14, '09:30'),
    approval: { by: 'KHE-0120', on: plusDays(T(), -15), note: 'Approved' },
    escortGuards: ['Peter Langat (Simba Shield)'],
    police: 'Kericho police: PC Rotich, ref KER/OB/CIT/2026/22',
    sealsLoading: ['CB-1101', 'CB-1102', 'CB-1103'],
    sealsArrival: ['CB-1101', 'CB-1102', 'CB-1103'],
    departure: dayAt(14, '09:35'),
    arrival: dayAt(14, '10:05'),
    status: 'Arrived'
  }),
  con({
    id: 'CN-310',
    orgId: 'org-nandi',
    ref: 'NHO/LF/2026/88',
    kind: 'Collection centre to factory',
    cargo: 'Green leaf 6,200 kg from Kapsimotwo and Chemase centres',
    value: 186_000,
    from: 'Kapsimotwo collection centre',
    to: 'Kericho Factory Unit 1',
    route: 'Kapsimotwo – Nandi Hills – Kericho',
    vehicleReg: 'KCU 401R',
    driver: 'Field driver',
    requestedBy: 'NHO-1141',
    requestedOn: plusDays(T(), -2),
    plannedDeparture: dayAt(0, '16:00'),
    status: 'Escort requested'
  })
];

/* guard roster: today and yesterday, day and night */
const POSTS: Record<string, string[]> = {
  'org-kericho': ['Main gate', 'Stores & fuel bay', 'Pay office', 'Field patrol (blocks 1–20)'],
  'org-factory': ['Main gate & weighbridge', 'Made-tea warehouse', 'Boiler & firewood yard', 'Perimeter patrol'],
  'org-nandi': ['Office gate', 'Collection centre (Kapsimotwo)'],
  'org-rift': ['Farm gate', 'Workshop & fuel tank'],
  'org-nairobi': ['Reception', 'Basement parking']
};
const GUARDS: Record<string, [string[], string[]]> = {
  'org-kericho': [
    ['Hassan Omar', 'Peter Langat', 'Grace Cherono', 'Wilson Kirui'],
    ['Daniel Koske', 'Alfred Bett', 'Edwin Ngeno', 'Nelson Rop']
  ],
  'org-factory': [
    ['Wycliffe Mutai', 'Mary Chelangat', 'Philip Too', 'Kennedy Sigei'],
    ['Joel Kemboi', 'Nancy Chepkirui', 'Richard Kibet', 'Erick Soi']
  ],
  'org-nandi': [['Kiprop Rotich', 'Jane Tanui'], ['Simon Kogo', 'Isaac Biwott']],
  'org-rift': [['Omari Juma', 'Lilian Wanjala'], ['Kassim Ali', 'Tom Owino']],
  'org-nairobi': [['Lucy Wairimu', 'George Mwenda'], ['Francis Kamande', 'Ali Hassan']]
};

const buildRoster = (): GuardShift[] => {
  const out: GuardShift[] = [];
  let n = 1;
  for (const orgId of Object.keys(POSTS))
    for (const back of [1, 0])
      SHIFTS.forEach((shift, si) =>
        POSTS[orgId].forEach((post, pi) => {
          // Alternate the day team between days so the roster rotates
          const team = GUARDS[orgId][(si + back) % 2];
          out.push({
            id: `GS-${String(n++).padStart(4, '0')}`,
            orgId,
            date: plusDays(todayIso(), -back),
            shift,
            site: SITE[orgId],
            post,
            guardName: team[pi % team.length],
            contractor: GUARD_CONTRACTOR[orgId]
          });
        })
      );
  return out;
};
export const SEED_ROSTER: GuardShift[] = buildRoster();

const ROUTES: Record<string, [string, string][]> = {
  'org-kericho': [
    ['KHE-T01', 'Main gate'],
    ['KHE-T02', 'Fuel bay'],
    ['KHE-T03', 'Fertiliser store'],
    ['KHE-T04', 'Pay office rear door'],
    ['KHE-T05', 'Workshop'],
    ['KHE-T06', 'Staff houses (east)']
  ],
  'org-factory': [
    ['KPF-T01', 'Weighbridge'],
    ['KPF-T02', 'Leaf intake shed'],
    ['KPF-T03', 'Made-tea warehouse door A'],
    ['KPF-T04', 'Made-tea warehouse door B'],
    ['KPF-T05', 'Boiler house'],
    ['KPF-T06', 'Firewood yard'],
    ['KPF-T07', 'Perimeter fence (river side)']
  ],
  'org-nandi': [
    ['NHO-T01', 'Office gate'],
    ['NHO-T02', 'Leaf store'],
    ['NHO-T03', 'Motorbike shed']
  ],
  'org-rift': [
    ['RVA-T01', 'Farm gate'],
    ['RVA-T02', 'Diesel tank'],
    ['RVA-T03', 'Workshop'],
    ['RVA-T04', 'Nursery']
  ],
  'org-nairobi': [
    ['HQ-T01', 'Reception'],
    ['HQ-T02', 'Server room'],
    ['HQ-T03', 'Basement ramp']
  ]
};

/** Night rounds at 22:00, 01:00 and 04:00; some points missed (deterministic). */
const buildPatrols = (): PatrolRound[] => {
  const out: PatrolRound[] = [];
  let n = 1;
  for (const orgId of Object.keys(ROUTES))
    for (const [ri, start] of ['22:00', '01:00', '04:00'].entries()) {
      const pts = ROUTES[orgId];
      const date = plusDays(todayIso(), start === '22:00' ? -1 : 0);
      const [h] = start.split(':').map(Number);
      out.push({
        id: `PR-${String(n++).padStart(4, '0')}`,
        orgId,
        date,
        shift: 'Night (18:00–06:00)',
        guardName: GUARDS[orgId][1][ri % GUARDS[orgId][1].length],
        route: `Night round ${ri + 1} (${start})`,
        points: pts.map(([tag, name], pi) => {
          const due = `${date}T${pad((h + Math.floor((pi * 8) / 60)) % 24)}:${pad((pi * 8) % 60)}`;
          const missed = (orgId === 'org-factory' && ri === 1 && (pi === 3 || pi === 6)) || (orgId === 'org-kericho' && ri === 2 && pi === 5) || (orgId === 'org-rift' && ri === 0 && pi === 1);
          const late = pi % 3 === 2 ? 6 : 1;
          const [dd, tt] = due.split('T');
          const [hh, mm] = tt.split(':').map(Number);
          const t = hh * 60 + mm + late;
          return { tag, name, due, scannedAt: missed ? undefined : `${dd}T${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}` };
        })
      });
    }
  return out;
};
export const SEED_PATROLS: PatrolRound[] = buildPatrols();

const ob = (id: string, orgId: string, at: string, by: string, category: ObCategory, entry: string): OccurrenceEntry => ({ id, orgId, at, site: SITE[orgId], by, category, entry });

export const SEED_OB: OccurrenceEntry[] = [
  ob('OB-KHE-0912', 'org-kericho', dayAt(0, '06:00'), 'Hassan Omar', 'Handover', 'Took over from night team (Daniel Koske). All posts manned, keys 1–14 handed over, nothing to report except missed tag at staff houses (east) on 04:00 round.'),
  ob('OB-KHE-0913', 'org-kericho', dayAt(0, '07:50'), 'Hassan Omar', 'Vehicle', 'Leaf truck KCE 905L left for factory on GP-0149, tarp seal KHE-L-20931.'),
  ob('OB-KHE-0914', 'org-kericho', dayAt(0, '09:20'), 'Hassan Omar', 'Routine', 'Fertiliser delivery (Highland Agrochem, DN 44120) checked and cleared to stores.'),
  ob('OB-KHE-0911', 'org-kericho', dayAt(1, '23:40'), 'Daniel Koske', 'Alarm', 'Pay office alarm zone 3 triggered. Checked with Alfred Bett: window latch loose, no entry. Reset 23:52.'),
  ob('OB-KHE-0910', 'org-kericho', dayAt(1, '18:00'), 'Daniel Koske', 'Handover', 'Night team on. Generator fuel at 60%.'),
  ob('OB-KHE-0905', 'org-kericho', dayAt(3, '02:15'), 'Edwin Ngeno', 'Incident', 'Two people seen carrying sacks near block 7 boundary; ran off when challenged. Reported as SI-2026-028.'),
  ob('OB-KPF-1440', 'org-factory', dayAt(0, '06:00'), 'Wycliffe Mutai', 'Handover', 'Took over from Joel Kemboi. Two patrol points missed on 01:00 round (warehouse door B, river fence) — night guard says tag reader battery died.'),
  ob('OB-KPF-1441', 'org-factory', dayAt(0, '06:40'), 'Wycliffe Mutai', 'Routine', 'Firewood delivery DN 0558 measured with boiler foreman, 30 m³, cleared.'),
  ob('OB-KPF-1442', 'org-factory', dayAt(0, '08:10'), 'Mary Chelangat', 'Visitor', 'Boiler Masters EA team (2) inducted and issued helmets, boots and ear muffs.'),
  ob('OB-KPF-1439', 'org-factory', dayAt(1, '18:10'), 'Joel Kemboi', 'Vehicle', 'Consignment KCF/MSA/2026/118 left with AP escort; seals IN-448120/121 verified with Shift Supervisor.'),
  ob('OB-KPF-1436', 'org-factory', dayAt(2, '03:20'), 'Richard Kibet', 'Incident', 'Unknown saloon car parked at the river-side fence with lights off for about 40 minutes. Number plate partly read KCx 5__Q. Left when floodlight switched on. Logged as SI-2026-033.'),
  ob('OB-KPF-1430', 'org-factory', dayAt(4, '12:00'), 'Mary Chelangat', 'Keys', 'Spare key to made-tea warehouse door B signed out to Shift Supervisor Diana Omondi for stock-take; returned 15:30.'),
  ob('OB-NHO-0301', 'org-nandi', dayAt(0, '06:00'), 'Kiprop Rotich', 'Handover', 'Took over. Motorbike shed lock replaced yesterday after battery theft.'),
  ob('OB-RVA-0220', 'org-rift', dayAt(0, '06:00'), 'Omari Juma', 'Handover', 'Diesel tank tag missed on 22:00 round; dip reading this morning 3,890 L, matches yesterday’s closing less tractor issues.'),
  ob('OB-HQ-0518', 'org-nairobi', dayAt(0, '07:30'), 'Lucy Wairimu', 'Routine', 'Building opened. Basement CCTV camera 4 offline, building management informed.')
];

const inv = (investigatorId: string, openedDaysAgo: number, extra: Partial<Investigation> = {}): Investigation => ({
  investigatorId,
  openedOn: plusDays(todayIso(), -openedDaysAgo),
  statements: [],
  evidence: [],
  cctvReviewed: false,
  findings: '',
  ...extra
});
const st = (by: string, daysAgo: number, summary: string) => ({ by, on: plusDays(todayIso(), -daysAgo), summary });

export const SEED_SEC_INCIDENTS: SecIncident[] = [
  {
    id: 'SI-2026-031',
    orgId: 'org-factory',
    type: 'Breach of seal',
    site: 'In transit — Mariakani (consignment KCF/MSA/2026/112)',
    occurredAt: dayAt(17, '03:30'),
    reportedBy: 'Mary Chelangat (escort, Simba Shield)',
    description: 'Container seal MSK 6640221 replaced with MSK 6640298 between Gilgil and Kilindini. CFS tally found 192 bags against 200 loaded.',
    lossValue: 172_800,
    suspect: { kind: 'Outsider', name: 'Hired driver Juma Salim (Coast Haulage) — under police inquiry' },
    consignmentId: 'CN-112',
    investigation: inv('KHE-0171', 16, {
      statements: [st('Mary Chelangat (escort)', 16, 'Driver stopped at Mariakani for a tyre change; she stayed in the cab during the stop.'), st('Juma Salim (driver)', 15, 'Denies opening the container; says seal was changed at the weighbridge.'), st('CFS tally clerk', 15, 'Counted 192 bags; seal number did not match the bill of lading.')],
      evidence: [
        { item: 'Photos of seal at loading and arrival', ref: 'EVD/SI031/01' },
        { item: 'CFS tally sheet', ref: 'EVD/SI031/02' },
        { item: 'Truck GPS trace (stop at Mariakani 50 min)', ref: 'EVD/SI031/03' }
      ],
      cctvReviewed: true,
      findings: 'Seal replaced during the unscheduled Mariakani stop. Escort procedure not followed (escort should leave the cab and watch the doors at every stop).',
      outcome: 'Referred to police',
      obNumber: 'OB 14/22/09/2026 Mariakani Police Station'
    }),
    claim: { ref: 'GIT/CLM/2026/0412', insurer: 'APA Insurance (goods in transit)', claimed: 172_800, paid: 0, status: 'Under assessment', lodgedOn: plusDays(todayIso(), -14) },
    recovered: [{ on: plusDays(todayIso(), -9), value: 43_200, note: '2 bags recovered by police at a Mariakani shop' }],
    status: 'Under investigation'
  },
  {
    id: 'SI-2026-032',
    orgId: 'org-factory',
    type: 'Theft',
    site: 'Kericho Factory Unit 1 — withering shed',
    occurredAt: dayAt(6, '22:00'),
    reportedBy: 'Joel Kemboi (night guard)',
    description: 'About 40 m of 16 mm² copper cable cut from the spare withering fan feed. Found missing on the morning check.',
    lossValue: 64_000,
    suspect: { kind: 'Employee', staffId: 'CAS-1136', name: 'Seen on CCTV near the shed after his shift ended' },
    investigation: inv('KHE-0171', 5, {
      statements: [st('Joel Kemboi (guard)', 5, 'Heard noise from the shed around 22:00; found the door closed when he checked.'), st('KHE-1021 Dennis Njiru', 5, 'Cable was in place at 17:00 handover.')],
      evidence: [{ item: 'CCTV clip camera 7, 21:48–22:10', ref: 'EVD/SI032/01' }],
      cctvReviewed: true,
      findings: 'CCTV shows a sorting operative entering the shed 21:52 after clocking out at 18:00.'
    }),
    recovered: [],
    status: 'Under investigation'
  },
  {
    id: 'SI-2026-029',
    orgId: 'org-factory',
    type: 'Fire',
    site: 'Kericho Factory Unit 1 — firewood yard',
    occurredAt: dayAt(12, '14:20'),
    reportedBy: 'KPF-1132 Kevin Adhiambo',
    description: 'Small fire in the firewood stack next to the boiler ash pit. Put out with 3 extinguishers and a hose reel in 10 minutes.',
    lossValue: 45_000,
    suspect: { kind: 'Unknown' },
    investigation: inv('KHE-0171', 12, {
      statements: [st('Kevin Adhiambo (boiler operator)', 12, 'Hot ash was dumped too close to the stack during desludging.')],
      evidence: [{ item: 'Photos of burnt stack and ash pit', ref: 'EVD/SI029/01' }],
      cctvReviewed: true,
      findings: 'Hot ash dumped within 3 m of the stack. Ash pit to be moved and a 10 m clearance marked.',
      outcome: 'Not recovered',
      closedOn: plusDays(todayIso(), -8)
    }),
    claim: { ref: 'FIRE/CLM/2026/0098', insurer: 'APA Insurance (fire & perils)', claimed: 45_000, paid: 0, status: 'Declined', lodgedOn: plusDays(todayIso(), -11) },
    recovered: [],
    status: 'Closed'
  },
  {
    id: 'SI-2026-033',
    orgId: 'org-factory',
    type: 'Suspicious activity',
    site: 'Kericho Factory Unit 1 — river-side perimeter',
    occurredAt: dayAt(2, '03:20'),
    reportedBy: 'Richard Kibet (night guard)',
    description: 'Unknown car parked at the fence with lights off for about 40 minutes; left when the floodlight came on.',
    lossValue: 0,
    suspect: { kind: 'Unknown' },
    recovered: [],
    status: 'Open'
  },
  {
    id: 'SI-2026-028',
    orgId: 'org-kericho',
    type: 'Theft',
    site: 'Kericho Highland Estates — block 7 boundary',
    occurredAt: dayAt(3, '02:15'),
    reportedBy: 'Edwin Ngeno (night guard)',
    description: 'Green leaf plucked overnight from block 7 and carried off in sacks; about 300 kg estimated from the plucked area.',
    lossValue: 9_000,
    suspect: { kind: 'Outsider', name: 'Two unidentified men' },
    investigation: inv('KHE-0160', 2, { statements: [st('Edwin Ngeno (guard)', 2, 'Saw two men with sacks; they ran towards the road.')], evidence: [{ item: 'Footprints photographed', ref: 'EVD/SI028/01' }] }),
    recovered: [],
    status: 'Under investigation'
  },
  {
    id: 'SI-2026-024',
    orgId: 'org-kericho',
    type: 'Theft',
    site: 'Kericho Highland Estates — fertiliser store',
    occurredAt: dayAt(20, '17:30'),
    reportedBy: 'KHE-0263 John Kiprop',
    description: '6 bags NPK fertiliser missing at the monthly stock count; store was locked, no forced entry.',
    lossValue: 27_000,
    suspect: { kind: 'Employee', staffId: 'CAS-1118', name: 'Store helper on duty' },
    investigation: inv('KHE-0160', 19, {
      statements: [st('John Kiprop (storekeeper)', 19, 'Count on 1st matched the bin card; 6 short on the 20th.'), st('Isaac Nyambura (store helper)', 18, 'Admits taking 6 bags out in a leaf truck; says he meant to pay.')],
      evidence: [{ item: 'Bin card and stock count sheet', ref: 'EVD/SI024/01' }, { item: 'Gate log showing leaf truck exit 17:40 without a pass', ref: 'EVD/SI024/02' }],
      cctvReviewed: false,
      findings: 'Helper admitted removing the bags. 4 bags recovered from his house.',
      outcome: 'Disciplinary referral',
      closedOn: plusDays(todayIso(), -15)
    }),
    recovered: [{ on: plusDays(todayIso(), -17), value: 18_000, note: '4 bags recovered' }],
    status: 'Closed'
  },
  {
    id: 'SI-2026-026',
    orgId: 'org-kericho',
    type: 'Assault',
    site: 'Kericho Highland Estates — leaf weighing shed 3',
    occurredAt: dayAt(9, '16:45'),
    reportedBy: 'KHE-0251 Mary Wambui',
    description: 'Argument between two pluckers over weighed kilos turned into a fight; one treated at the dispensary for a cut lip.',
    lossValue: 0,
    suspect: { kind: 'Employee', staffId: 'CAS-1117' },
    investigation: inv('KHE-0290', 8, { statements: [st('Sharon Mwangi', 8, 'Says she was pushed first.'), st('Weigh clerk', 8, 'Saw both pushing each other.')], findings: 'Both parties at fault; mediation done by the welfare officer.', outcome: 'Not recovered', closedOn: plusDays(todayIso(), -6) }),
    recovered: [],
    status: 'Closed'
  },
  {
    id: 'SI-2026-030',
    orgId: 'org-kericho',
    type: 'Trespass',
    site: 'Kericho Highland Estates — block 12',
    occurredAt: dayAt(1, '15:00'),
    reportedBy: 'Wilson Kirui (field guard)',
    description: 'Neighbouring cattle (14 head) grazing inside block 12; some tea bushes damaged.',
    lossValue: 12_000,
    suspect: { kind: 'Outsider', name: 'Owner identified as a neighbour, Mr. K. Mutai' },
    recovered: [],
    status: 'Open'
  },
  {
    id: 'SI-2026-022',
    orgId: 'org-nandi',
    type: 'Theft',
    site: 'Nandi Hills — motorbike shed',
    occurredAt: dayAt(2, '01:00'),
    reportedBy: 'Simon Kogo (night guard)',
    description: 'Batteries removed from 2 field motorbikes; padlock cut.',
    lossValue: 9_600,
    suspect: { kind: 'Unknown' },
    investigation: inv('NHO-1140', 1, { cctvReviewed: false }),
    recovered: [],
    status: 'Under investigation'
  },
  {
    id: 'SI-2026-019',
    orgId: 'org-rift',
    type: 'Theft',
    site: 'Rift Valley farm — tractor KTCB 771A',
    occurredAt: dayAt(15, '19:00'),
    reportedBy: 'RVA-1161 Purity Kiprotich',
    description: 'About 60 L of diesel siphoned from the tractor tank overnight.',
    lossValue: 10_500,
    suspect: { kind: 'Employee', staffId: 'RVA-1164' },
    investigation: inv('RVA-1161', 14, { statements: [st('Omari Juma (guard)', 14, 'Saw the mechanic at the tractor after hours with jerrycans.')], cctvReviewed: false, findings: 'Awaiting statement from the mechanic.' }),
    recovered: [],
    status: 'Under investigation'
  },
  {
    id: 'SI-2026-021',
    orgId: 'org-nairobi',
    type: 'Theft',
    site: 'Corporate HQ — basement parking',
    occurredAt: dayAt(25, '18:30'),
    reportedBy: 'KHE-0288 Peter Otieno Ouma',
    description: 'Company laptop stolen from a locked car in the basement; window smashed.',
    lossValue: 145_000,
    suspect: { kind: 'Unknown' },
    investigation: inv('KHE-0102', 24, {
      evidence: [{ item: 'CCTV basement cam 4 (offline at the time)', ref: 'EVD/SI021/01' }],
      cctvReviewed: true,
      findings: 'Camera 4 was offline. Building management asked to fix and add lighting.',
      outcome: 'Referred to police',
      obNumber: 'OB 31/13/09/2026 Kilimani Police Station',
      closedOn: plusDays(todayIso(), -10)
    }),
    claim: { ref: 'AR/CLM/2026/2210', insurer: 'Jubilee Allianz (all risks)', claimed: 145_000, paid: 130_500, status: 'Paid', lodgedOn: plusDays(todayIso(), -23) },
    recovered: [],
    status: 'Closed'
  }
];

export const SEED_SYSTEMS: SecuritySystem[] = [
  { orgId: 'org-kericho', name: 'CCTV recorder (NVR)', detail: '16-channel NVR at the pay office', syncedMinsAgo: 2, events24h: 37, devices: '14 of 16 cameras online', status: 'Degraded' },
  { orgId: 'org-kericho', name: 'Access control', detail: 'Card readers: pay office, stores, server cabinet', syncedMinsAgo: 1, events24h: 212, devices: '5 readers', status: 'Online' },
  { orgId: 'org-kericho', name: 'NFC guard patrol app', detail: 'Guard phones with tag reader', syncedMinsAgo: 12, events24h: 51, devices: '6 tags · 4 handsets', status: 'Online' },
  { orgId: 'org-factory', name: 'CCTV recorder (NVR)', detail: '32-channel NVR, factory control room', syncedMinsAgo: 1, events24h: 84, devices: '30 of 30 cameras online', status: 'Online' },
  { orgId: 'org-factory', name: 'Access control', detail: 'Turnstiles at staff gate, warehouse door readers', syncedMinsAgo: 1, events24h: 960, devices: '2 turnstiles · 6 readers', status: 'Online' },
  { orgId: 'org-factory', name: 'NFC guard patrol app', detail: 'Guard phones with tag reader', syncedMinsAgo: 48, events24h: 62, devices: '7 tags · 4 handsets (1 battery fault)', status: 'Degraded' },
  { orgId: 'org-nandi', name: 'CCTV recorder (NVR)', detail: '8-channel NVR, office', syncedMinsAgo: 5, events24h: 9, devices: '8 cameras', status: 'Online' },
  { orgId: 'org-nandi', name: 'NFC guard patrol app', detail: 'Guard phones with tag reader', syncedMinsAgo: 30, events24h: 14, devices: '3 tags · 2 handsets', status: 'Online' },
  { orgId: 'org-rift', name: 'CCTV recorder (NVR)', detail: '8-channel NVR, farm office', syncedMinsAgo: 190, events24h: 0, devices: 'No contact since early morning', status: 'Offline' },
  { orgId: 'org-rift', name: 'NFC guard patrol app', detail: 'Guard phones with tag reader', syncedMinsAgo: 20, events24h: 18, devices: '4 tags · 2 handsets', status: 'Online' },
  { orgId: 'org-nairobi', name: 'CCTV recorder (NVR)', detail: 'Building NVR (shared with landlord)', syncedMinsAgo: 3, events24h: 22, devices: '11 of 12 cameras online', status: 'Degraded' },
  { orgId: 'org-nairobi', name: 'Access control', detail: 'Lift lobby and server room card readers', syncedMinsAgo: 1, events24h: 438, devices: '4 readers', status: 'Online' }
];
