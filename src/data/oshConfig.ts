import type { HREmployee } from '../types';
import { INITIAL_OSH_PERMITS } from './hrMockData';
import { addDays } from './timeEngine';
import type {
  CommitteeMeeting,
  CommitteeMember,
  FireDrill,
  Inspection,
  JhaReview,
  MedicalExam,
  OshIncident,
  PpeIssue,
  Responder,
  StatutoryItem,
  WibaClaim,
  WorkPermit
} from './oshEngine';

export const SAFETY_OFFICER = 'Ruth Chebet';
export const SAFETY_OFFICER_TITLE = 'QHSE Manager';
export const WIBA_INSURER = 'Jubilee Allianz General Insurance';
export const WIBA_POLICY = 'WIBA/KHE/2026/0417';
export const DOSH_AREA_OFFICE = 'County Occupational Safety & Health Office, Kericho';
export const WORKPLACE_REG_NO = 'DOSH-WR-55102';
export const EST_WEEKLY_HOURS = 45;
export const FIRST_AID_RATIO = { high: 10, normal: 25 };

export const SITES = {
  FACTORY: { label: 'Factory floor (withering, CTC, drying)', highRisk: true },
  BOILER: { label: 'Boiler house & workshop', highRisk: true },
  PACKING: { label: 'Packing & warehouse', highRisk: false },
  LAB: { label: 'Quality lab', highRisk: true },
  ESTATE: { label: 'Tea estates (field)', highRisk: false },
  FLEET: { label: 'Fleet & fuel bay', highRisk: true },
  OFFICE: { label: 'Offices', highRisk: false }
} as const;
export type SiteId = keyof typeof SITES;
export const SITE_IDS = Object.keys(SITES) as SiteId[];

export const BODY_PARTS = ['Head', 'Eye', 'Face', 'Neck', 'Shoulder', 'Arm', 'Hand / fingers', 'Back', 'Chest', 'Abdomen', 'Hip', 'Leg', 'Knee', 'Ankle', 'Foot / toes', 'Ear (hearing)', 'Lungs (respiratory)', 'Skin', 'Multiple'];
export const INJURY_NATURES = ['Cut / laceration', 'Burn / scald', 'Fracture', 'Sprain / strain', 'Bruise / contusion', 'Crush', 'Chemical splash', 'Amputation', 'Noise-induced hearing loss', 'Dermatitis', 'Other'];

export const PERMIT_TYPES = {
  HOT_WORK: { label: 'Hot work', gasTest: false, isolation: false, fireWatch: true, precautions: ['Combustibles cleared 10 m', 'Fire extinguisher at the job', 'Welding screens in place', 'Fire watch 30 min after work'] },
  CONFINED_SPACE: { label: 'Confined space entry', gasTest: true, isolation: true, fireWatch: false, precautions: ['Standby person at entry', 'Forced ventilation running', 'Rescue harness and tripod', 'Communication agreed'] },
  WORK_AT_HEIGHT: { label: 'Work at height', gasTest: false, isolation: false, fireWatch: false, precautions: ['Full-body harness with lanyard', 'Anchor point checked', 'Area below barricaded', 'Scaffold tagged as inspected'] },
  ELECTRICAL: { label: 'Electrical isolation (LOTO)', gasTest: false, isolation: true, fireWatch: false, precautions: ['Isolated at the source', 'Personal lock and tag applied', 'Tested dead before touch', 'Insulated tools and gloves'] },
  BOILER: { label: 'Boiler maintenance', gasTest: false, isolation: true, fireWatch: false, precautions: ['Boiler depressurised and cooled', 'Steam and feed valves locked', 'Blowdown valves locked open', 'Furnace purged'] },
  CHEMICAL: { label: 'Chemical handling', gasTest: false, isolation: false, fireWatch: false, precautions: ['SDS reviewed', 'Chemical-resistant PPE', 'Spill kit at hand', 'Eye-wash station checked'] }
} as const;

export const PPE_ITEMS: Record<string, { name: string; lifespanMonths: number; sizes: string[] }> = {
  BOOTS: { name: 'Safety boots (steel toe)', lifespanMonths: 12, sizes: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'] },
  GUMBOOTS: { name: 'Gumboots', lifespanMonths: 12, sizes: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'] },
  OVERALL: { name: 'Overalls', lifespanMonths: 6, sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  HELMET: { name: 'Hard hat', lifespanMonths: 36, sizes: ['Standard'] },
  GLOVES: { name: 'Work gloves', lifespanMonths: 3, sizes: ['S', 'M', 'L', 'XL'] },
  HEAT_GLOVES: { name: 'Heat-resistant gloves', lifespanMonths: 6, sizes: ['M', 'L', 'XL'] },
  CHEM_GLOVES: { name: 'Chemical gloves (nitrile)', lifespanMonths: 1, sizes: ['S', 'M', 'L'] },
  EAR_MUFFS: { name: 'Ear muffs', lifespanMonths: 12, sizes: ['Standard'] },
  APRON: { name: 'Apron', lifespanMonths: 6, sizes: ['Standard'] },
  HAIRNET: { name: 'Hairnets (pack)', lifespanMonths: 1, sizes: ['Standard'] },
  DUST_MASK: { name: 'Dust masks (FFP2, pack)', lifespanMonths: 1, sizes: ['Standard'] },
  GOGGLES: { name: 'Safety goggles', lifespanMonths: 12, sizes: ['Standard'] },
  LAB_COAT: { name: 'Lab coat', lifespanMonths: 12, sizes: ['S', 'M', 'L', 'XL'] },
  RAINCOAT: { name: 'Raincoat', lifespanMonths: 12, sizes: ['M', 'L', 'XL'] },
  HI_VIS: { name: 'Reflective vest', lifespanMonths: 12, sizes: ['M', 'L', 'XL'] }
};

/** Role-based PPE matrix: by site, plus extras for some job titles. */
export const PPE_RULES: { label: string; sites: SiteId[]; titles?: RegExp; items: string[] }[] = [
  { label: 'Factory floor', sites: ['FACTORY'], items: ['BOOTS', 'OVERALL', 'HAIRNET', 'APRON', 'EAR_MUFFS', 'DUST_MASK', 'GLOVES'] },
  { label: 'Boiler house & workshop', sites: ['BOILER'], items: ['BOOTS', 'OVERALL', 'HELMET', 'HEAT_GLOVES', 'EAR_MUFFS', 'GOGGLES'] },
  { label: 'Packing & warehouse', sites: ['PACKING'], items: ['BOOTS', 'OVERALL', 'HAIRNET', 'DUST_MASK', 'HI_VIS'] },
  { label: 'Quality lab', sites: ['LAB'], items: ['LAB_COAT', 'HAIRNET', 'CHEM_GLOVES', 'GOGGLES'] },
  { label: 'Tea estates', sites: ['ESTATE'], items: ['GUMBOOTS', 'RAINCOAT', 'APRON', 'GLOVES'] },
  { label: 'Fleet & fuel bay', sites: ['FLEET'], items: ['BOOTS', 'HI_VIS', 'GLOVES'] },
  { label: 'Supervisors visiting the factory', sites: [], titles: /operations|qhse|storekeeper|manager/i, items: ['HELMET', 'HI_VIS', 'BOOTS'] }
];

export const INSPECTION_AREAS = [
  {
    id: 'boiler',
    name: 'Boiler house',
    everyDays: 7,
    items: ['Safety valves sealed and tested this shift', 'Water level gauges clean and working', 'Pressure gauge reading within limits', 'Low-water alarm tested', 'Fuel (wood) stacked clear of the furnace', 'Ear protection worn in the boiler room', 'Examination certificate displayed']
  },
  { id: 'withering', name: 'Withering & CTC', everyDays: 14, items: ['Fan guards in place', 'Emergency stops tested', 'Floors dry and clear', 'Machine guards on CTC rollers', 'Hairnets and aprons worn', 'First-aid box stocked'] },
  { id: 'packing', name: 'Packing & warehouse', everyDays: 30, items: ['Stacks stable, max 6 high', 'Aisles marked and clear', 'Forklift pre-use check done', 'Dust extraction running', 'Fire exits unobstructed'] },
  { id: 'workshop', name: 'Workshop', everyDays: 30, items: ['Grinder guards and tool rests set', 'Welding area screened', 'Gas cylinders chained upright', 'Electrical panels closed and labelled', 'LOTO locks and tags available'] },
  { id: 'fuelbay', name: 'Fuel bay', everyDays: 30, items: ['No smoking signs displayed', 'Spill kit present', 'Bund wall intact, no leaks', 'Fire extinguishers serviced', 'Earthing point for tanker'] },
  { id: 'lab', name: 'Quality lab', everyDays: 30, items: ['Chemicals labelled with SDS on file', 'Fume cupboard airflow checked', 'Eye-wash station tested', 'Chemical waste segregated', 'Lab coats and goggles worn'] }
];

/** Job hazard analyses per role. */
export const JHA: { role: string; site: SiteId; steps: { task: string; hazard: string; control: string }[] }[] = [
  {
    role: 'Machine Operator',
    site: 'FACTORY',
    steps: [
      { task: 'Feed leaf into CTC rollers', hazard: 'Hands drawn into rollers', control: 'Fixed guard; feed with a push stick; emergency stop within reach' },
      { task: 'Clean rollers', hazard: 'Unexpected start-up', control: 'Lock out at the isolator before cleaning (LOTO permit)' },
      { task: 'Work near dryers', hazard: 'Noise above 85 dB(A), heat', control: 'Ear muffs; annual audiometry; rest breaks and water' }
    ]
  },
  {
    role: 'Maintenance Technician',
    site: 'BOILER',
    steps: [
      { task: 'Boiler internal inspection', hazard: 'Steam release, confined space', control: 'Boiler maintenance and confined space permits; valves locked; gas test' },
      { task: 'Welding repairs', hazard: 'Fire, burns, fumes', control: 'Hot work permit; fire watch; screens; ventilation' },
      { task: 'Electrical repairs', hazard: 'Electric shock', control: 'LOTO; test dead; insulated tools' }
    ]
  },
  {
    role: 'Field Operative',
    site: 'ESTATE',
    steps: [
      { task: 'Plucking on slopes', hazard: 'Slips and falls, snake bites', control: 'Gumboots; paths maintained; first aider on each section' },
      { task: 'Carrying leaf baskets', hazard: 'Back strain', control: 'Max 25 kg per basket; manual handling training' },
      { task: 'Spraying', hazard: 'Chemical exposure', control: 'Only trained sprayers; masks and gloves; re-entry interval' }
    ]
  },
  {
    role: 'Driver',
    site: 'FLEET',
    steps: [
      { task: 'Leaf collection on estate roads', hazard: 'Rollover, collisions', control: 'Speed limits; daily vehicle checks; defensive driving' },
      { task: 'Refuelling', hazard: 'Fire, spills', control: 'Engine off; no phones; spill kit; earthing' }
    ]
  },
  {
    role: 'Packer',
    site: 'PACKING',
    steps: [
      { task: 'Filling and stitching sacks', hazard: 'Tea dust, needle injuries', control: 'Dust extraction; FFP2 masks; guarded stitching heads' },
      { task: 'Stacking pallets', hazard: 'Falling loads, forklift traffic', control: 'Max 6 high; marked walkways; hi-vis vests' }
    ]
  },
  {
    role: 'Quality Controller',
    site: 'LAB',
    steps: [
      { task: 'Moisture and chemical tests', hazard: 'Chemical splash, burns', control: 'Goggles, nitrile gloves; fume cupboard; eye-wash' },
      { task: 'Tasting room hygiene', hazard: 'Food contamination', control: 'Food handler medical every 6 months; hairnets' }
    ]
  }
];

/** Medical surveillance: OSHA 2007 s.101; Public Health Act food handler certificates every 6 months. */
export const MEDICAL_RULES = {
  PRE_EMPLOYMENT: { label: 'Pre-employment', everyMonths: 0, all: true, sites: [] as SiteId[] },
  FOOD_HANDLER: { label: 'Food handler', everyMonths: 6, all: false, sites: ['FACTORY', 'PACKING', 'LAB'] as SiteId[] },
  AUDIOMETRY: { label: 'Audiometry (noise)', everyMonths: 12, all: false, sites: ['FACTORY', 'BOILER'] as SiteId[] },
  PERIODIC: { label: 'Periodic medical', everyMonths: 12, all: false, sites: ['BOILER', 'LAB', 'FLEET'] as SiteId[] }
};

export const STATUTORY_KINDS = {
  SH_AUDIT: { label: 'Annual safety & health audit', everyMonths: 12, by: 'DOSHS-approved auditor' },
  FIRE_AUDIT: { label: 'Annual fire safety audit', everyMonths: 12, by: 'DOSHS-approved fire auditor' },
  BOILER: { label: 'Steam boiler examination', everyMonths: 14, by: 'Approved person (OSHA s.67)' },
  STEAM_RECEIVER: { label: 'Steam receiver / pressure vessel', everyMonths: 26, by: 'Approved person (OSHA s.68)' },
  AIR_RECEIVER: { label: 'Air receiver examination', everyMonths: 26, by: 'Approved person (OSHA s.69)' },
  LIFTING: { label: 'Hoist / lifting equipment', everyMonths: 6, by: 'Approved person (OSHA s.63)' }
};

/* ---------------- Seeds ---------------- */

const T = (today: string, n: number) => addDays(today, n);
const at = (today: string, n: number, hm: string) => `${T(today, n)}T${hm}`;
/** Local 'YYYY-MM-DDTHH:mm' this many hours from now, on the hour */
const fromNow = (hours: number) => {
  const d = new Date(Date.now() + hours * 3600_000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
};
const h = (date: string, by: string, text: string) => ({ at: date, by, text });

/** The demo permits from the first release, carried over to the new permit model. */
const migrated = (): WorkPermit[] =>
  INITIAL_OSH_PERMITS.map((p) => {
    const type = p.permitType.startsWith('Hot') ? 'HOT_WORK' : p.permitType.startsWith('Confined') ? 'CONFINED_SPACE' : p.permitType.startsWith('Chemical') ? 'CHEMICAL' : 'ELECTRICAL';
    const to = p.expiryTime.replace(' ', 'T');
    const from = `${to.slice(0, 10)}T07:00`;
    return {
      id: p.id,
      orgId: p.orgId,
      number: p.permitNo,
      type,
      location: p.location,
      work: p.permitType,
      holder: p.issuedTo,
      requestedBy: p.issuedTo,
      requestedOn: to.slice(0, 10),
      validFrom: from,
      validTo: to,
      status: p.status === 'COMPLETED' ? 'CLOSED' : 'ACTIVE',
      precautions: [...PERMIT_TYPES[type].precautions],
      fireWatch: type === 'HOT_WORK' ? 'Standby fire guard' : undefined,
      gasTests: type === 'CONFINED_SPACE' ? [{ at: from, by: p.authorizedBy, o2: 20.8, lel: 0, h2s: 0, co: 2 }] : [],
      isolations: type === 'CONFINED_SPACE' || type === 'ELECTRICAL' ? [{ point: 'Main isolator', lockNo: 'L-01', by: p.authorizedBy, verified: true }] : [],
      approvedBy: p.authorizedBy,
      approvedAt: from,
      activatedAt: from,
      closedAt: p.status === 'COMPLETED' ? to : undefined,
      closedBy: p.status === 'COMPLETED' ? p.authorizedBy : undefined
    } as WorkPermit;
  });

const sizeOf = (staffId: string, itemId: string) => {
  const sizes = PPE_ITEMS[itemId].sizes;
  const n = [...staffId].reduce((a, c) => a + c.charCodeAt(0), 0);
  return sizes[(n + itemId.length) % sizes.length];
};

export interface OshSeed {
  incidents: OshIncident[];
  claims: WibaClaim[];
  permits: WorkPermit[];
  ppeIssues: PpeIssue[];
  inspections: Inspection[];
  drills: FireDrill[];
  responders: Responder[];
  medicals: MedicalExam[];
  statutory: StatutoryItem[];
  committee: CommitteeMember[];
  meetings: CommitteeMeeting[];
  jhaReviews: JhaReview[];
}

export const buildOshSeed = (today: string, employees: HREmployee[], siteOf: (e: HREmployee) => SiteId, ppeFor: (e: HREmployee) => string[]): OshSeed => {
  const org = 'org-kericho';
  const staff = employees.filter((e) => e.orgId === org && e.status !== 'TERMINATED');
  const has = (id: string) => staff.some((e) => e.staffId === id);
  const RC = SAFETY_OFFICER;

  const incidents: OshIncident[] = (
  [
    {
      id: 'INC-2026-031',
      orgId: org,
      kind: 'INJURY',
      occurredOn: T(today, -112),
      time: '10:40',
      site: 'FACTORY',
      location: 'CTC line 2, roller feed',
      description: 'Operator reached past the feed guard to clear a leaf jam; right hand caught between the rollers.',
      staffId: 'KHE-1109',
      bodyPart: 'Hand / fingers',
      injuryNature: 'Crush',
      severity: 'LOST_TIME',
      lostDays: 18,
      offWorkFrom: T(today, -112),
      returnedOn: T(today, -94),
      immediateActions: 'Emergency stop pressed; first aid; taken to Kericho County Referral Hospital.',
      witnesses: ['KHE-1108', 'KHE-1101'],
      reportedBy: 'Esther Muthoni',
      reportedOn: T(today, -112),
      status: 'CLOSED',
      investigation: { lead: RC, startedOn: T(today, -111), whys: ['Hand entered the roller nip', 'Operator cleared a jam with the line running', 'Isolator is 15 m away from the feed point', 'Line layout predates the CTC upgrade'], rootCause: 'No local isolator at the feed point, so jams were cleared live.', completedOn: T(today, -104) },
      actions: [
        { id: 'A1', text: 'Install a lockable local isolator at each CTC feed point', owner: 'Kevin Ouma', due: T(today, -80), status: 'VERIFIED', doneOn: T(today, -84), verifiedBy: RC, verifiedOn: T(today, -82) },
        { id: 'A2', text: 'Retrain CTC operators on LOTO for jams', owner: RC, due: T(today, -90), status: 'VERIFIED', doneOn: T(today, -92), verifiedBy: RC, verifiedOn: T(today, -90) }
      ],
      dosh: { notifiedOn: T(today, -108), ref: 'DOSH/KER/2026/0187', by: RC },
      history: [h(T(today, -112), 'Esther Muthoni', 'Reported'), h(T(today, -108), RC, 'DOSH/F1 filed'), h(T(today, -80), RC, 'Closed')]
    },
    {
      id: 'INC-2026-038',
      orgId: org,
      kind: 'NEAR_MISS',
      occurredOn: T(today, -41),
      time: '14:15',
      site: 'PACKING',
      location: 'Warehouse aisle 4',
      description: 'Forklift reversing round a blind corner nearly struck a packer carrying a sack.',
      severity: 'NONE',
      lostDays: 0,
      immediateActions: 'Area cordoned; forklift operator briefed.',
      witnesses: ['KHE-0263'],
      reportedBy: 'John Kiprop',
      reportedOn: T(today, -41),
      status: 'CLOSED',
      investigation: { lead: RC, startedOn: T(today, -40), whys: ['Forklift and pedestrian met at the corner', 'Neither could see the other', 'No mirror or floor marking'], rootCause: 'Blind corner without a mirror or segregated walkway.', completedOn: T(today, -38) },
      actions: [{ id: 'A1', text: 'Mark pedestrian walkway in aisle 4', owner: 'John Kiprop', due: T(today, -30), status: 'DONE', doneOn: T(today, -31) }],
      history: [h(T(today, -41), 'John Kiprop', 'Reported')]
    },
    {
      id: 'INC-2026-041',
      orgId: org,
      kind: 'INJURY',
      occurredOn: T(today, -26),
      time: '08:20',
      site: 'ESTATE',
      location: 'Field 14, Chagaik section',
      description: 'Plucker slipped on a wet slope carrying a full basket and twisted her ankle.',
      staffId: has('CAS-1116') ? 'CAS-1116' : 'CAS-1405',
      bodyPart: 'Ankle',
      injuryNature: 'Sprain / strain',
      severity: 'LOST_TIME',
      lostDays: 6,
      offWorkFrom: T(today, -26),
      returnedOn: T(today, -20),
      immediateActions: 'Section first aider applied a support bandage; taken to the estate clinic.',
      witnesses: ['CAS-1117'],
      reportedBy: 'Esther Muthoni',
      reportedOn: T(today, -26),
      status: 'ACTIONS',
      investigation: { lead: RC, startedOn: T(today, -25), whys: ['Worker slipped on the slope', 'Path surface was wet clay', 'Terracing steps eroded after the long rains', 'No path maintenance schedule for Field 14'], rootCause: 'Field paths are not on the estate maintenance schedule.', completedOn: T(today, -21) },
      actions: [
        { id: 'A1', text: 'Re-cut and gravel terrace steps in Field 14', owner: 'Esther Muthoni', due: T(today, -5), status: 'OPEN' },
        { id: 'A2', text: 'Add field paths to the monthly estate maintenance plan', owner: 'Mary Wambui', due: T(today, 10), status: 'OPEN' },
        { id: 'A3', text: 'Issue new gumboots with deeper tread to Field 14 team', owner: RC, due: T(today, -15), status: 'DONE', doneOn: T(today, -16) }
      ],
      dosh: { notifiedOn: T(today, -22), ref: 'DOSH/KER/2026/0244', by: RC },
      history: [h(T(today, -26), 'Esther Muthoni', 'Reported'), h(T(today, -22), RC, 'DOSH/F1 filed')]
    },
    {
      id: 'INC-2026-043',
      orgId: org,
      kind: 'INJURY',
      occurredOn: T(today, -15),
      time: '11:05',
      site: 'LAB',
      location: 'Quality lab bench 2',
      description: 'Small splash of dilute reagent on the forearm while decanting.',
      staffId: 'KHE-0276',
      bodyPart: 'Arm',
      injuryNature: 'Chemical splash',
      severity: 'FIRST_AID',
      lostDays: 0,
      immediateActions: 'Rinsed for 15 minutes at the eye-wash station; no lasting mark.',
      witnesses: [],
      reportedBy: 'Faith Akinyi',
      reportedOn: T(today, -15),
      status: 'CLOSED',
      actions: [],
      history: [h(T(today, -15), 'Faith Akinyi', 'Reported')]
    },
    {
      id: 'INC-2026-044',
      orgId: org,
      kind: 'DANGEROUS_OCCURRENCE',
      occurredOn: T(today, -9),
      time: '05:50',
      site: 'BOILER',
      location: 'Boiler No. 1',
      description: 'Main steam line gasket failed during start-up; steam released into the boiler house. Nobody was injured.',
      severity: 'NONE',
      lostDays: 0,
      immediateActions: 'Boiler tripped and isolated; area evacuated; gasket replaced under a boiler maintenance permit.',
      witnesses: ['KHE-0270'],
      reportedBy: 'Kevin Ouma',
      reportedOn: T(today, -9),
      status: 'INVESTIGATING',
      investigation: { lead: RC, startedOn: T(today, -8), whys: ['Gasket blew at start-up', 'Gasket was past its service life'], rootCause: '' },
      actions: [{ id: 'A1', text: 'Replace all steam line gaskets older than 2 years', owner: 'Kevin Ouma', due: T(today, 14), status: 'OPEN' }],
      dosh: { notifiedOn: T(today, -6), ref: 'DOSH/KER/2026/0262', by: RC },
      history: [h(T(today, -9), 'Kevin Ouma', 'Reported'), h(T(today, -6), RC, 'DOSH/F1 filed')]
    },
    {
      id: 'INC-2026-045',
      orgId: org,
      kind: 'INJURY',
      occurredOn: T(today, -3),
      time: '15:30',
      site: 'BOILER',
      location: 'Boiler house, condensate return line',
      description: 'Technician opened a drain valve on the condensate line that was still under pressure; hot water scalded his left forearm.',
      staffId: 'KHE-0270',
      bodyPart: 'Arm',
      injuryNature: 'Burn / scald',
      severity: 'LOST_TIME',
      lostDays: 0,
      offWorkFrom: T(today, -2),
      immediateActions: 'Cooled under running water for 20 minutes; dressed; referred to hospital.',
      witnesses: ['KHE-1110'],
      reportedBy: 'Esther Muthoni',
      reportedOn: T(today, -3),
      status: 'REPORTED',
      actions: [],
      history: [h(T(today, -3), 'Esther Muthoni', 'Reported')]
    },
    {
      id: 'INC-2026-039',
      orgId: org,
      kind: 'OCCUPATIONAL_DISEASE',
      occurredOn: T(today, -35),
      time: '09:00',
      site: 'FACTORY',
      location: 'Dryer section',
      description: 'Annual audiometry shows a noise-induced hearing shift in the left ear.',
      staffId: 'KHE-1108',
      bodyPart: 'Ear (hearing)',
      injuryNature: 'Noise-induced hearing loss',
      severity: 'MEDICAL',
      lostDays: 0,
      immediateActions: 'Referred to an ENT specialist; moved away from the dryers pending review.',
      witnesses: [],
      reportedBy: RC,
      reportedOn: T(today, -35),
      status: 'ACTIONS',
      investigation: { lead: RC, startedOn: T(today, -34), whys: ['Hearing shift found', 'Ear muffs not worn all shift', 'Muffs uncomfortable in the heat'], rootCause: 'Ear muffs unsuitable for the dryer section heat.', completedOn: T(today, -30) },
      actions: [{ id: 'A1', text: 'Trial ear plugs suitable for hot areas; noise survey of dryers', owner: RC, due: T(today, -2), status: 'OPEN' }],
      dosh: { notifiedOn: T(today, -31), ref: 'DOSH/KER/2026/0231', by: RC },
      history: [h(T(today, -35), RC, 'Reported')]
    }
  ] as OshIncident[]
  ).filter((i) => !i.staffId || has(i.staffId));

  const claims: WibaClaim[] = (
  [
    {
      id: 'WC-2026-007',
      orgId: org,
      incidentId: 'INC-2026-031',
      staffId: 'KHE-1109',
      insurer: WIBA_INSURER,
      policyNo: WIBA_POLICY,
      basis: 'PERMANENT',
      monthlyEarnings: 0,
      earningsPeriod: '',
      ttdDays: 18,
      ppdPercent: 4,
      medicalKes: 38_500,
      funeralKes: 0,
      status: 'PAID',
      notifiedOn: T(today, -108),
      assessedKes: 0,
      paidOn: T(today, -40),
      history: [h(T(today, -108), RC, 'Notified to insurer'), h(T(today, -60), WIBA_INSURER, 'Assessed: 4% loss of grip, right hand'), h(T(today, -40), WIBA_INSURER, 'Paid')]
    },
    {
      id: 'WC-2026-011',
      orgId: org,
      incidentId: 'INC-2026-041',
      staffId: has('CAS-1116') ? 'CAS-1116' : 'CAS-1405',
      insurer: WIBA_INSURER,
      policyNo: WIBA_POLICY,
      basis: 'TEMPORARY',
      monthlyEarnings: 0,
      earningsPeriod: '',
      ttdDays: 6,
      ppdPercent: 0,
      medicalKes: 4_200,
      funeralKes: 0,
      status: 'ASSESSED',
      notifiedOn: T(today, -22),
      history: [h(T(today, -22), RC, 'Notified to insurer'), h(T(today, -10), WIBA_INSURER, 'Assessed')]
    }
  ] as WibaClaim[]
  ).filter((c) => incidents.some((i) => i.id === c.incidentId));

  const permits: WorkPermit[] = [
    ...migrated(),
    {
      id: 'PTW-KHE-101',
      orgId: org,
      number: 'PTW-HOT-101',
      type: 'HOT_WORK',
      location: 'Boiler house, feed water tank',
      work: 'Weld a bracket on the feed water tank support',
      holder: 'Kevin Ouma',
      holderStaffId: 'KHE-0270',
      requestedBy: 'Esther Muthoni',
      requestedOn: T(today, 0),
      validFrom: fromNow(-2),
      validTo: fromNow(6),
      status: 'ACTIVE',
      precautions: [...PERMIT_TYPES.HOT_WORK.precautions],
      fireWatch: has('KHE-1110') ? 'KHE-1110' : 'Standby fire guard',
      gasTests: [],
      isolations: [],
      approvedBy: RC,
      approvedAt: fromNow(-2),
      activatedAt: fromNow(-2)
    },
    {
      id: 'PTW-KHE-102',
      orgId: org,
      number: 'PTW-CSE-102',
      type: 'CONFINED_SPACE',
      location: 'Withering trough 3 air plenum',
      work: 'Clean leaf debris from the plenum and inspect the fan housing',
      holder: 'Kevin Ouma',
      holderStaffId: 'KHE-0270',
      requestedBy: 'Esther Muthoni',
      requestedOn: T(today, 0),
      validFrom: fromNow(14),
      validTo: fromNow(22),
      status: 'REQUESTED',
      precautions: [...PERMIT_TYPES.CONFINED_SPACE.precautions],
      gasTests: [],
      isolations: [{ point: 'Trough 3 fan motor MCC-W3', lockNo: 'L-07', by: 'Kevin Ouma', verified: false }]
    },
    {
      id: 'PTW-KHE-099',
      orgId: org,
      number: 'PTW-BLR-099',
      type: 'BOILER',
      location: 'Boiler No. 1',
      work: 'Replace main steam line gasket after the 2026-044 occurrence',
      holder: 'Kevin Ouma',
      holderStaffId: 'KHE-0270',
      requestedBy: 'Esther Muthoni',
      requestedOn: T(today, -9),
      validFrom: at(today, -9, '07:00'),
      validTo: at(today, -9, '18:00'),
      status: 'CLOSED',
      precautions: [...PERMIT_TYPES.BOILER.precautions],
      gasTests: [],
      isolations: [
        { point: 'Main steam stop valve', lockNo: 'L-02', by: 'Kevin Ouma', verified: true },
        { point: 'Feed water pump isolator', lockNo: 'L-03', by: 'Kevin Ouma', verified: true }
      ],
      approvedBy: RC,
      approvedAt: at(today, -9, '06:45'),
      activatedAt: at(today, -9, '07:05'),
      closedBy: RC,
      closedAt: at(today, -9, '16:20'),
      closeNote: 'Gasket replaced, hydro test passed, locks removed.'
    },
    {
      id: 'PTW-KHE-100',
      orgId: org,
      number: 'PTW-WAH-100',
      type: 'WORK_AT_HEIGHT',
      location: 'Packing warehouse roof',
      work: 'Replace two cracked translucent roof sheets (contractor)',
      holder: 'Kipsigis Roofing Ltd (contractor)',
      requestedBy: 'John Kiprop',
      requestedOn: T(today, -1),
      validFrom: fromNow(0),
      validTo: fromNow(7),
      status: 'APPROVED',
      precautions: [...PERMIT_TYPES.WORK_AT_HEIGHT.precautions],
      gasTests: [],
      isolations: [],
      approvedBy: RC,
      approvedAt: at(today, -1, '16:10')
    }
  ];

  // PPE register: most staff fully kitted at various dates; a few gaps and items past their life
  const ppeIssues: PpeIssue[] = [];
  let n = 1;
  staff.forEach((e, idx) => {
    const isNew = e.joinedDate >= T(today, -70);
    ppeFor(e).forEach((itemId, k) => {
      if (isNew && k % 2 === 1) return;
      const life = PPE_ITEMS[itemId].lifespanMonths * 30;
      const ago = ((idx * 37 + k * 53) % Math.max(20, Math.round(life * 1.15))) + 3;
      ppeIssues.push({ id: `PPE-${String(n++).padStart(4, '0')}`, orgId: org, staffId: e.staffId, itemId, size: sizeOf(e.staffId, itemId), qty: 1, issuedOn: T(today, -Math.min(ago, 700)), issuedBy: RC, reason: ago > 200 ? 'NEW' : 'REPLACEMENT' });
    });
  });

  const inspections: Inspection[] = [
    { id: 'INS-101', orgId: org, areaId: 'boiler', scheduledFor: T(today, -9), inspector: RC, status: 'DONE', doneOn: T(today, -9), results: { 0: 'OK', 1: 'OK', 2: 'OK', 3: 'FAIL', 4: 'OK', 5: 'FAIL', 6: 'OK' }, findings: [
      { id: 'F1', text: 'Low-water alarm did not sound on test', action: { id: 'F1A', text: 'Repair low-water alarm float switch', owner: 'Kevin Ouma', due: T(today, -6), status: 'DONE', doneOn: T(today, -7) } },
      { id: 'F2', text: 'Boiler attendant not wearing ear muffs', action: { id: 'F2A', text: 'Toolbox talk on hearing protection; supervisor spot checks', owner: 'Esther Muthoni', due: T(today, -2), status: 'OPEN' } }
    ] },
    { id: 'INS-102', orgId: org, areaId: 'boiler', scheduledFor: T(today, -2), inspector: RC, status: 'SCHEDULED', results: {}, findings: [] },
    { id: 'INS-103', orgId: org, areaId: 'withering', scheduledFor: T(today, -12), inspector: RC, status: 'DONE', doneOn: T(today, -12), results: { 0: 'OK', 1: 'OK', 2: 'OK', 3: 'OK', 4: 'OK', 5: 'FAIL' }, findings: [
      { id: 'F1', text: 'First-aid box missing burn gel and bandages', action: { id: 'F1A', text: 'Restock all factory first-aid boxes', owner: RC, due: T(today, -8), status: 'VERIFIED', doneOn: T(today, -10), verifiedBy: RC, verifiedOn: T(today, -9) } }
    ] },
    { id: 'INS-104', orgId: org, areaId: 'withering', scheduledFor: T(today, 2), inspector: RC, status: 'SCHEDULED', results: {}, findings: [] },
    { id: 'INS-105', orgId: org, areaId: 'packing', scheduledFor: T(today, -25), inspector: 'John Kiprop', status: 'DONE', doneOn: T(today, -25), results: { 0: 'OK', 1: 'FAIL', 2: 'OK', 3: 'OK', 4: 'OK' }, findings: [
      { id: 'F1', text: 'Aisle 4 has no marked pedestrian walkway', action: { id: 'F1A', text: 'Paint walkway and install a convex mirror at aisle 4', owner: 'John Kiprop', due: T(today, -11), status: 'OPEN' } }
    ] },
    { id: 'INS-106', orgId: org, areaId: 'workshop', scheduledFor: T(today, 6), inspector: RC, status: 'SCHEDULED', results: {}, findings: [] },
    { id: 'INS-107', orgId: org, areaId: 'fuelbay', scheduledFor: T(today, -38), inspector: RC, status: 'DONE', doneOn: T(today, -38), results: { 0: 'OK', 1: 'OK', 2: 'OK', 3: 'OK', 4: 'OK' }, findings: [] },
    { id: 'INS-108', orgId: org, areaId: 'lab', scheduledFor: T(today, -20), inspector: RC, status: 'DONE', doneOn: T(today, -20), results: { 0: 'OK', 1: 'OK', 2: 'OK', 3: 'OK', 4: 'OK' }, findings: [] }
  ];

  const drills: FireDrill[] = [
    { id: 'FD-01', orgId: org, siteId: 'FACTORY', date: T(today, -150), evacuationMin: 4.5, participants: 19, notes: 'Night shift not covered; assembly point signage faded.' },
    { id: 'FD-02', orgId: org, siteId: 'OFFICE', date: T(today, -230), evacuationMin: 3, participants: 14, notes: 'Smooth. Two visitors not accounted for at first roll call.' },
    { id: 'FD-03', orgId: org, siteId: 'BOILER', date: T(today, -380), evacuationMin: 2.5, participants: 4, notes: 'Boiler trip practised.' }
  ];

  const responder = (id: string, staffId: string, role: Responder['role'], certifiedAgo: number, validMonths: number): Responder => ({
    id,
    orgId: org,
    staffId,
    role,
    certifiedOn: T(today, -certifiedAgo),
    expiresOn: T(today, validMonths * 30 - certifiedAgo),
    provider: role === 'FIRST_AIDER' ? 'St John Ambulance Kenya' : 'Kericho County Fire Department'
  });
  const responders: Responder[] = [
    responder('R1', 'KHE-0171', 'FIRST_AIDER', 300, 24),
    responder('R2', 'KHE-1101', 'FIRST_AIDER', 200, 24),
    responder('R3', 'KHE-1108', 'FIRST_AIDER', 700, 24),
    responder('R4', 'KHE-0270', 'FIRST_AIDER', 400, 24),
    responder('R5', 'CAS-1117', 'FIRST_AIDER', 100, 24),
    responder('R6', 'KHE-0276', 'FIRST_AIDER', 250, 24),
    responder('R7', 'KHE-0263', 'FIRE_MARSHAL', 180, 12),
    responder('R8', 'KHE-1103', 'FIRE_MARSHAL', 340, 12),
    responder('R9', 'KHE-0270', 'FIRE_MARSHAL', 60, 12),
    responder('R10', 'KHE-0251', 'FIRE_MARSHAL', 90, 12),
    responder('R11', 'KHE-0301', 'FIRST_AIDER', 500, 24)
  ].filter((r) => has(r.staffId));

  // Medical history: most staff examined on time, some overdue; new hires partly done
  const medicals: MedicalExam[] = [];
  let m = 1;
  staff.forEach((e, idx) => {
    const site = siteOf(e);
    const push = (type: MedicalExam['type'], ago: number) =>
      medicals.push({ id: `MED-${String(m++).padStart(4, '0')}`, orgId: org, staffId: e.staffId, type, doneOn: T(today, -ago), result: 'FIT', practitioner: 'Dr. Evans Kiprotich (DOSHS-designated)' });
    if (e.joinedDate >= T(today, -365) && idx % 4 !== 1) push('PRE_EMPLOYMENT', Math.max(1, Math.round((Date.parse(today) - Date.parse(e.joinedDate)) / 864e5) + 5));
    if (['FACTORY', 'PACKING', 'LAB'].includes(site)) push('FOOD_HANDLER', 20 + ((idx * 29) % 200));
    if (['FACTORY', 'BOILER'].includes(site)) push('AUDIOMETRY', 30 + ((idx * 41) % 380));
    if (['BOILER', 'LAB', 'FLEET'].includes(site)) push('PERIODIC', 60 + ((idx * 23) % 340));
  });

  const statutory: StatutoryItem[] = [
    { id: 'ST1', orgId: org, kind: 'SH_AUDIT', name: 'Safety & health audit — estates and factory', ref: 'SHA/2025/KHE-014', lastDone: T(today, -340), by: 'Afrisafe Consultants (DOSHS approved)' },
    { id: 'ST2', orgId: org, kind: 'FIRE_AUDIT', name: 'Fire safety audit — factory and offices', ref: 'FSA/2025/KHE-009', lastDone: T(today, -372), by: 'Firesafe East Africa (DOSHS approved)' },
    { id: 'ST3', orgId: org, kind: 'BOILER', name: 'Boiler No. 1 (Thermax, 10 bar)', ref: 'BX-1/2025/77819', lastDone: T(today, -418), by: 'Eng. P. Ngetich, approved person' },
    { id: 'ST4', orgId: org, kind: 'BOILER', name: 'Boiler No. 2 (standby, 10 bar)', ref: 'BX-2/2026/80211', lastDone: T(today, -150), by: 'Eng. P. Ngetich, approved person' },
    { id: 'ST5', orgId: org, kind: 'STEAM_RECEIVER', name: 'Steam header and dryer heat exchangers', ref: 'SR/2025/5521', lastDone: T(today, -520), by: 'Eng. P. Ngetich, approved person' },
    { id: 'ST6', orgId: org, kind: 'AIR_RECEIVER', name: 'Workshop compressor air receiver', ref: 'AR/2024/3310', lastDone: T(today, -800), by: 'Eng. P. Ngetich, approved person' },
    { id: 'ST7', orgId: org, kind: 'LIFTING', name: 'Warehouse forklift and chain hoist', ref: 'LE/2026/1145', lastDone: T(today, -160), by: 'Liftsafe Kenya, approved person' }
  ];

  const committee: CommitteeMember[] = (
    [
      { staffId: 'KHE-0160', role: 'Chair', side: 'Management', trained: true },
      { staffId: 'KHE-0171', role: 'Secretary', side: 'Management', trained: true },
      { staffId: 'KHE-0263', role: 'Member', side: 'Management', trained: true },
      { staffId: 'KHE-1108', role: 'Member', side: 'Workers', trained: true },
      { staffId: 'CAS-1402', role: 'Member', side: 'Workers', trained: false },
      { staffId: 'KHE-1111', role: 'Member', side: 'Workers', trained: true }
    ] as CommitteeMember[]
  ).filter((c) => has(c.staffId));
  const ids = committee.map((c) => c.staffId);
  const meetings: CommitteeMeeting[] = [
    { id: 'MTG-2026-1', orgId: org, date: T(today, -250), attendees: ids, minutes: 'Q1: reviewed 2025 audit actions; agreed noise survey of the dryer section.', actions: [] },
    { id: 'MTG-2026-2', orgId: org, date: T(today, -160), attendees: ids.slice(0, 5), minutes: 'Q2: CTC roller injury reviewed; local isolators approved; PPE budget increase requested.', actions: [] },
    {
      id: 'MTG-2026-3',
      orgId: org,
      date: T(today, -78),
      attendees: ids.slice(0, 4),
      minutes: 'Q3: estate path conditions after the long rains; first aider refresher dates; fire drill for night shift.',
      actions: [{ id: 'C1', text: 'Schedule a night-shift fire drill in the factory', owner: SAFETY_OFFICER, due: T(today, -20), status: 'OPEN' }]
    }
  ];

  const jhaReviews: JhaReview[] = JHA.map((j, i) => ({ role: j.role, reviewedOn: T(today, -(60 + i * 70)), by: RC }));

  return { incidents, claims, permits, ppeIssues, inspections, drills, responders, medicals, statutory, committee, meetings, jhaReviews };
};
