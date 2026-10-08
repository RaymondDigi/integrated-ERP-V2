import { addDays, localStamp, TODAY } from '../finance/engine';
import type { HistoryEntry } from '../finance/types';
import type { ControlState, EmergencyPlan } from './types';

/**
 * Seed for the audit programme, opportunities, emergencies, problem/CMDB/knowledge records and the workplace
 * (documents, intranet, calendar, surveys). Tea trading and blending context: Mombasa auction, Kericho and Nandi
 * gardens, KTDA factories, PF1/BP1/PD/D1 grades.
 */
const d = (o: number) => addDays(TODAY, o);
const year = TODAY.slice(0, 4);
const num = (p: string, n: number) => `${p}-${year}-${String(n).padStart(4, '0')}`;
const h = (date: string, hour: number, by: string, action: string, note?: string): HistoryEntry => ({ at: `${date}T${String(hour).padStart(2, '0')}:20:00`, by, action, note });
const ago = (hours: number) => localStamp(new Date(Date.now() - hours * 3_600_000));
const at = (o: number, hh: number) => `${d(o)}T${String(hh).padStart(2, '0')}:00`;

export const EMERGENCY_PLANS: EmergencyPlan[] = [
  { type: 'Fire', procedure: 'Raise the alarm, evacuate by the nearest exit, call Mombasa County Fire 0722 000 999, fight only small fires with the nearest extinguisher. Wardens sweep their zone and report at the assembly point.', assembly: 'Car park by gate A', contacts: ['Fire wardens', 'QHSE Manager', 'Operations Manager'] },
  { type: 'Product recall', procedure: 'Freeze all stock of the affected blend and grade, identify every shipment from the batch records, notify customers and KEBS within 24 hours, collect and quarantine returned tea.', assembly: '—', contacts: ['QHSE Manager', 'Commercial Manager', 'Finance Director', 'Company Secretary'] },
  { type: 'Chemical spill', procedure: 'Isolate the area, use the spill kit by the fumigation store, keep people upwind. Report fumigant (phosphine) exposure to DOSHS.', assembly: 'Warehouse yard', contacts: ['QHSE Manager', 'Warehouse supervisor'] },
  { type: 'IT outage', procedure: 'Switch to the paper dispatch and weighbridge forms, call the ICT on-call line, move ERP users to the DR instance if the outage passes 4 hours.', assembly: '—', contacts: ['ICT Manager', 'Operations Manager'] },
  { type: 'Flood', procedure: 'Move tea off the floor to upper racking, cut power to the ground floor, cover stacks with tarpaulin.', assembly: 'Office block first floor', contacts: ['Warehouse supervisor', 'Operations Manager', 'QHSE Manager'] },
  { type: 'Injury', procedure: 'First aider attends, call ambulance for anything serious, record in OSH incidents within the shift.', assembly: '—', contacts: ['First aiders', 'QHSE Manager', 'HR Manager'] },
  { type: 'Security breach', procedure: 'Secure gates, call Kenya Police and the guarding company, do not touch the scene, list missing stock.', assembly: 'Gate house', contacts: ['Security supervisor', 'Operations Manager', 'Company Secretary'] },
  { type: 'Power failure', procedure: 'Generator auto-starts within 30 s; if not, stop blending lines safely, close the dryer and notify maintenance.', assembly: '—', contacts: ['Maintenance', 'Operations Manager'] }
];

/** People who can own actions, be audited or attend meetings in the demo. */
export const STAFF = ['Ruth Chebet', 'Faith Akinyi', 'Brian Kamau', 'Samuel Kiptoo', 'Agnes Wairimu', 'Mary Wambui', 'Kevin Ouma', 'Peter Mwangi', 'John Kiprop', 'Esther Muthoni', 'Lucy Njeri', 'David Otieno', 'Grace Wanjiku', 'Joseph Kiprono', 'Amina Hassan'];
export const DEPARTMENTS = ['Operations', 'Finance', 'Sales', 'HR', 'Administration', 'ICT', 'Quality'];
export const TEA_GRADES = ['BP1', 'PF1', 'PD', 'D1', 'BMF', 'Blend — Premium 100', 'Blend — Kenya Gold'];

/** Who is told for each emergency class. */
export const EMERGENCY_NOTIFY: Record<1 | 2 | 3, string[]> = {
  1: ['QHSE Manager', 'Site supervisor'],
  2: ['QHSE Manager', 'Site supervisor', 'Operations Manager', 'Managing Director'],
  3: ['QHSE Manager', 'Site supervisor', 'Operations Manager', 'Managing Director', 'Board chair', 'Company Secretary', 'Insurer (APA)', 'County authorities']
};

type Extras = Pick<ControlState, 'programmes' | 'opportunities' | 'emergencies' | 'emergencyPlans' | 'problems' | 'cis' | 'kb' | 'monitorRules' | 'testCases' | 'docs' | 'announcements' | 'events' | 'resources' | 'surveys' | 'polls' | 'suggestions'>;

export const buildControlExtras = (): Extras => ({
  programmes: [
    {
      id: 'pg1',
      year: Number(year),
      title: `${year} integrated audit programme`,
      objectives: 'Keep ISO 22000 and Rainforest Alliance certification, confirm stock controls at the Mombasa warehouses and check suppliers of packaging and auction tea meet our code.',
      scope: 'Blending factory (Mombasa), bonded warehouses, tea tasting and QC lab, procurement and ICT',
      status: 'APPROVED',
      preparedBy: 'Ruth Chebet',
      approvedBy: 'Agnes Wairimu',
      approvedAt: d(-120),
      history: [h(d(-125), 9, 'Ruth Chebet', 'Programme drafted'), h(d(-120), 11, 'Agnes Wairimu', 'Approved by management')],
      areas: [
        { id: 'pa1', area: 'Blending factory', standard: 'ISO 22000', frequencyMonths: 6, auditor: 'Ruth Chebet', auditee: 'Esther Muthoni', lastAudit: d(-40), nextDue: d(142) },
        { id: 'pa2', area: 'Warehousing', standard: 'Internal control framework', frequencyMonths: 12, auditor: 'Ruth Chebet', auditee: 'John Kiprop', lastAudit: d(-2), nextDue: d(363) },
        { id: 'pa3', area: 'Tea tasting & QC lab', standard: 'KS EAS 105 black tea · ISO 22000', frequencyMonths: 6, auditor: 'Faith Akinyi', auditee: 'Mary Wambui', lastAudit: d(-170), nextDue: d(12) },
        { id: 'pa4', area: 'Procurement', standard: 'Supplier code of conduct', frequencyMonths: 12, auditor: 'Ruth Chebet', auditee: 'Peter Mwangi', lastAudit: d(-12), nextDue: d(353) },
        { id: 'pa5', area: 'ICT', standard: 'ISO 27001 Annex A controls', frequencyMonths: 12, auditor: 'Ruth Chebet', auditee: 'Samuel Kiptoo', lastAudit: d(-380), nextDue: d(-15) }
      ]
    }
  ],
  opportunities: [
    { id: 'op1', number: num('OPP', 1), title: 'Re-use PF1 blending dust as tea-bag fannings', description: 'Sieve the dust collected at blending line 2 and sell as D1 fannings to tea-bag packers instead of disposal.', source: 'STAFF', raisedBy: 'Kevin Ouma', benefit: 'Less waste to the dump site and an extra product line', estValue: 380_000, status: 'SUBMITTED', approvals: [], history: [h(d(-6), 10, 'Kevin Ouma', 'Submitted')] },
    { id: 'op2', number: num('OPP', 2), title: 'Electronic tasting notes at the Mombasa auction', description: 'Tasters key valuations on tablets so catalogue bids reach Trading the same afternoon.', source: 'AUDIT', sourceRef: num('AUD', 1), raisedBy: 'Ruth Chebet', benefit: 'Faster bidding decisions, fewer transcription errors', estValue: 1_200_000, status: 'ACCEPTED', owner: 'Lucy Njeri', decision: 'Pilot for the next four sales', approvals: [{ by: 'Ruth Chebet', role: 'QHSE', at: d(-20) }, { by: 'Agnes Wairimu', role: 'SECRETARY', at: d(-18) }], history: [h(d(-25), 9, 'Ruth Chebet', 'Submitted'), h(d(-20), 14, 'Ruth Chebet', 'Approved (1 of 2)'), h(d(-18), 10, 'Agnes Wairimu', 'Accepted')] }
  ],
  emergencies: [
    {
      id: 'em1', number: num('EMG', 1), cls: 2, type: 'Power failure', site: 'Mombasa blending factory', description: 'Grid outage for 5 hours; generator failed to start and the dryer stopped mid-batch.', reportedBy: 'Esther Muthoni', at: at(-21, 14), status: 'CLOSED', injuries: false,
      immediateActions: [{ at: at(-21, 14), by: 'Esther Muthoni', text: 'Stopped blending lines and isolated the dryer' }, { at: at(-21, 15), by: 'Kevin Ouma', text: 'Hired a standby generator from Bamburi' }],
      longTerm: 'Monthly generator load test added to the PM plan', affected: [{ ref: 'BAT-0007', grade: 'BP1', qty: 1800, unit: 'kg', value: 612_000 }], notified: EMERGENCY_NOTIFY[2],
      history: [h(d(-21), 14, 'Esther Muthoni', 'Reported — class 2'), h(d(-20), 9, 'Ruth Chebet', 'Contained'), h(d(-14), 16, 'Ruth Chebet', 'Closed')]
    },
    {
      id: 'em2', number: num('EMG', 2), cls: 1, type: 'Chemical spill', site: 'Bonded warehouse 2, Shimanzi', description: 'Phosphine tablet container dropped during fumigation of a container of PD grade.', reportedBy: 'John Kiprop', at: ago(5), status: 'ACTIVE', injuries: false,
      immediateActions: [{ at: ago(4.8), by: 'John Kiprop', text: 'Area cordoned and ventilated; staff moved upwind' }], affected: [{ ref: 'Lot 2231 — Kangaita', grade: 'PD', qty: 2400, unit: 'kg', value: 768_000 }], notified: EMERGENCY_NOTIFY[1],
      history: [{ at: ago(5), by: 'John Kiprop', action: 'Reported — class 1' }]
    }
  ],
  emergencyPlans: EMERGENCY_PLANS,
  problems: [
    { id: 'pb1', number: num('PRB', 1), title: 'Mombasa port store VPN drops several times a day', description: 'Site-to-site tunnel resets when the Safaricom link flaps; users lose the ERP session.', ticketIds: ['tk5'], ciIds: ['ci4', 'ci3'], owner: 'Samuel Kiptoo', rootCause: '', workaround: 'Reconnect the FortiClient tunnel; keep dispatch forms open offline', status: 'KNOWN_ERROR', history: [h(d(-1), 11, 'Samuel Kiptoo', 'Problem raised from INC-0005'), h(d(-1), 12, 'Samuel Kiptoo', 'Workaround published — known error')] }
  ],
  cis: [
    { id: 'ci1', name: 'Integrated ERP', kind: 'Application', location: 'Nairobi head office', owner: 'Samuel Kiptoo', businessSystem: 'ERP', dependsOn: ['ci2', 'ci3'], status: 'LIVE', source: 'MANUAL' },
    { id: 'ci2', name: 'ERP database (SQL Server 2022)', kind: 'Database', location: 'Nairobi server room', owner: 'Samuel Kiptoo', businessSystem: 'ERP', dependsOn: ['ci5'], assetId: 'it1', ip: '10.10.1.20', status: 'LIVE', source: 'MANUAL' },
    { id: 'ci3', name: 'FortiGate 60F firewall', kind: 'Network', location: 'Nairobi head office', owner: 'Brian Kamau', businessSystem: 'Network', dependsOn: [], assetId: 'it7', ip: '10.10.0.1', status: 'LIVE', source: 'MANUAL' },
    { id: 'ci4', name: 'Mombasa site-to-site VPN', kind: 'Network', location: 'Mombasa — Shimanzi', owner: 'Brian Kamau', businessSystem: 'Network', dependsOn: ['ci3'], status: 'LIVE', source: 'MANUAL' },
    { id: 'ci5', name: 'Dell PowerEdge R650', kind: 'Server', location: 'Nairobi server room', owner: 'Samuel Kiptoo', businessSystem: 'ERP', dependsOn: [], assetId: 'it1', ip: '10.10.1.10', status: 'LIVE', source: 'MANUAL' },
    { id: 'ci6', name: 'KRA eTIMS integration', kind: 'Service', location: 'Cloud', owner: 'David Otieno', businessSystem: 'Finance', dependsOn: ['ci1'], status: 'LIVE', source: 'MANUAL' },
    { id: 'ci7', name: 'Weighbridge PC — Mombasa gate', kind: 'Endpoint', location: 'Mombasa — Shimanzi', owner: 'John Kiprop', businessSystem: 'Warehousing', dependsOn: ['ci4'], ip: '10.20.0.15', status: 'LIVE', source: 'DISCOVERY' },
    { id: 'ci8', name: 'Synology backup NAS', kind: 'Server', location: 'Nairobi server room', owner: 'Brian Kamau', businessSystem: 'Backup', dependsOn: [], assetId: 'it2', ip: '10.10.1.30', status: 'LIVE', source: 'MANUAL' }
  ],
  kb: [
    { id: 'kb1', number: 'KB-0001', title: 'Reconnect the FortiClient VPN at the Mombasa stores', category: 'Network', body: 'Open FortiClient, choose "Mombasa-S2S", sign in with your work email. If it fails twice, restart the router in the store office and wait 3 minutes.', tags: ['vpn', 'mombasa', 'network'], author: 'Brian Kamau', updated: d(-3), views: 41, helpful: 18, revisions: [] },
    { id: 'kb2', number: 'KB-0002', title: 'Reset a warehouse handheld password', category: 'Access', body: 'ICT resets the Zebra handheld account from the ERP Users screen. The user signs in with the temporary password and must set a new one of 10+ characters.', tags: ['password', 'handheld', 'access'], author: 'Brian Kamau', updated: d(-9), views: 27, helpful: 11, revisions: [] },
    { id: 'kb3', number: 'KB-0003', title: 'Payroll bank file rejected by the bank', category: 'ERP', body: 'Check the bank branch codes on the employee records match the bank list. Re-export the file after correcting codes; do not edit the CSV by hand.', tags: ['payroll', 'bank', 'erp'], author: 'Samuel Kiptoo', updated: d(-5), views: 12, helpful: 6, revisions: [], fromTicket: 'tk7' },
    { id: 'kb4', number: 'KB-0004', title: 'Printing auction catalogue valuations', category: 'Hardware', body: 'Use the Kyocera in the tasting room; choose A3 landscape for the full catalogue. Jams usually mean the A3 tray guide is loose.', tags: ['printer', 'auction', 'catalogue'], author: 'Brian Kamau', updated: d(-20), views: 9, helpful: 3, revisions: [] }
  ],
  monitorRules: [
    { id: 'mr1', metric: 'CPU', target: 'Dell PowerEdge R650', warn: 70, critical: 90 },
    { id: 'mr2', metric: 'DISK', target: 'Synology backup NAS', warn: 75, critical: 90 },
    { id: 'mr3', metric: 'LATENCY', target: 'Mombasa site-to-site VPN', warn: 120, critical: 250 },
    { id: 'mr4', metric: 'PACKET_LOSS', target: 'Mombasa site-to-site VPN', warn: 1, critical: 5 },
    { id: 'mr5', metric: 'MEMORY', target: 'ERP database (SQL Server 2022)', warn: 80, critical: 95 }
  ],
  testCases: [
    { id: 'tc1', number: 'TC-001', module: 'Finance', title: 'Post a sales invoice for an auction lot and transmit to eTIMS', steps: ['Raise invoice for 2,400 kg BP1', 'Submit and approve as a different user', 'Post to the ledger'], expected: 'Invoice posted, control unit number returned', runs: [{ id: 'r1', at: d(-6), by: 'Grace Wanjiku', result: 'PASS', actual: 'Posted, CU number received' }] },
    { id: 'tc2', number: 'TC-002', module: 'People & Payroll', title: 'Run payroll and export the bank file', steps: ['Process payroll for the month', 'Approve', 'Export KCB bank file'], expected: 'Bank file accepted by KCB test portal', runs: [{ id: 'r2', at: d(-5), by: 'Rose Chepkoech', result: 'FAIL', actual: 'Branch code missing for 3 staff', ticketId: 'tk7' }, { id: 'r3', at: d(-4), by: 'Rose Chepkoech', result: 'PASS', actual: 'Accepted' }] },
    { id: 'tc3', number: 'TC-003', module: 'Warehousing', title: 'Receive tea from the auction into the bonded warehouse', steps: ['Open the purchase order', 'Weigh in at the weighbridge', 'Post the goods received note'], expected: 'Stock increases by the net weight; lot number recorded', runs: [] },
    { id: 'tc4', number: 'TC-004', module: 'Quality', title: 'Raise and verify a corrective action', steps: ['Add a major finding', 'Raise a CAPA with owner and due date', 'Owner completes, QHSE verifies after the review date'], expected: 'CAPA closes only after the review date, by someone other than the owner', runs: [] }
  ],
  docs: [
    { id: 'dc1', number: 'DOC-0001', title: 'Tea blending standard operating procedure', folder: 'Quality / SOPs', owner: 'Ruth Chebet', status: 'APPROVED', versions: [{ v: 1, at: d(-200), by: 'Ruth Chebet', note: 'First issue' }, { v: 2, at: d(-60), by: 'Ruth Chebet', note: 'Added moisture limits for PF1' }], comments: [{ at: d(-62), by: 'Esther Muthoni', text: 'Please add the sieve sizes for BP1.' }], approvals: [{ by: 'Agnes Wairimu', role: 'SECRETARY', at: d(-60) }], history: [h(d(-60), 10, 'Agnes Wairimu', 'Approved v2')] },
    { id: 'dc2', number: 'DOC-0002', title: 'Anti-bribery and corruption policy', folder: 'Governance / Policies', owner: 'Agnes Wairimu', status: 'IN_REVIEW', versions: [{ v: 1, at: d(-380), by: 'Agnes Wairimu', note: 'Board approved' }, { v: 2, at: d(-3), by: 'Agnes Wairimu', note: 'Annual review — gifts register limit KES 5,000' }], comments: [], policyId: 'po2', approvals: [], history: [h(d(-3), 15, 'Agnes Wairimu', 'Sent for review')] },
    { id: 'dc3', number: 'DOC-0003', title: 'Mombasa auction buying guide', folder: 'Trading / Guides', owner: 'Lucy Njeri', status: 'DRAFT', versions: [{ v: 1, at: d(-1), by: 'Lucy Njeri', note: 'Draft' }], checkedOutBy: 'Lucy Njeri', checkedOutAt: d(-1), comments: [], approvals: [], history: [] },
    { id: 'dc4', number: 'DOC-0004', title: 'Supplier code of conduct', folder: 'Procurement', owner: 'Peter Mwangi', status: 'APPROVED', versions: [{ v: 1, at: d(-300), by: 'Peter Mwangi', note: 'First issue' }], comments: [], share: { party: 'KTDA Management Services', token: 'shr-7f3a91', expires: d(30) }, approvals: [{ by: 'Agnes Wairimu', role: 'SECRETARY', at: d(-300) }], history: [] }
  ],
  announcements: [
    { id: 'an1', title: 'Mombasa auction sale 38 — catalogues out', body: 'Sale 38 catalogues are on the document library. Tasting starts Thursday 08:00 in the Mombasa tasting room.', by: 'Lucy Njeri', at: d(-1), audience: 'All staff', pinned: true, status: 'PUBLISHED', reads: ['Ruth Chebet'] },
    { id: 'an2', title: 'Fire drill at the Shimanzi warehouses', body: 'Unannounced fire drills will run this month. Know your assembly point: car park by gate A.', by: 'Ruth Chebet', at: d(-4), audience: 'Operations', pinned: false, status: 'PUBLISHED', reads: [] },
    { id: 'an3', title: 'New KRA eTIMS rules from next month', body: 'Every invoice must carry a control unit number. Finance will run training on Friday.', by: 'David Otieno', at: d(-7), audience: 'Finance', pinned: false, status: 'PUBLISHED', expires: d(25), reads: [] }
  ],
  resources: [
    { id: 'rs1', name: 'Boardroom — Nairobi HQ', kind: 'Room', capacity: 14, location: 'Nairobi head office' },
    { id: 'rs2', name: 'Tasting room — Mombasa', kind: 'Room', capacity: 8, location: 'Mombasa — Shimanzi' },
    { id: 'rs3', name: 'Toyota Prado KDA 412M', kind: 'Vehicle', capacity: 6, location: 'Nairobi head office' },
    { id: 'rs4', name: 'Portable projector', kind: 'Equipment', capacity: 1, location: 'Nairobi head office' }
  ],
  events: [
    { id: 'ev1', title: 'Auction sale 38 — tasting', start: at(2, 8), end: at(2, 12), owner: 'Lucy Njeri', attendees: ['Lucy Njeri', 'Mary Wambui'], calendar: 'TEAM', resourceId: 'rs2', location: 'Mombasa' },
    { id: 'ev2', title: 'Monthly management meeting', start: at(4, 9), end: at(4, 11), owner: 'Agnes Wairimu', attendees: ['Esther Muthoni', 'David Otieno', 'Ruth Chebet', 'Samuel Kiptoo'], calendar: 'COMPANY', resourceId: 'rs1', location: 'Nairobi HQ' },
    { id: 'ev3', title: 'Visit Kericho gardens (KTDA)', start: at(6, 7), end: at(6, 17), owner: 'Peter Mwangi', attendees: ['Peter Mwangi'], calendar: 'TEAM', resourceId: 'rs3', location: 'Kericho' },
    { id: 'ev4', title: 'ISO 22000 internal audit — QC lab', start: at(12, 9), end: at(12, 13), owner: 'Faith Akinyi', attendees: ['Faith Akinyi', 'Mary Wambui'], calendar: 'COMPANY', location: 'Mombasa' }
  ],
  surveys: [
    {
      id: 'sv1', title: `Employee engagement — ${year} H2`, kind: 'EMPLOYEE', audience: 'All staff', period: `${year} H2`, status: 'OPEN', createdBy: 'Joseph Kiprono',
      questions: [
        { id: 'q1', text: 'I would recommend this company as a place to work', type: 'SCALE' },
        { id: 'q2', text: 'I have the tools I need to do my job', type: 'SCALE' },
        { id: 'q3', text: 'Which benefit matters most to you?', type: 'CHOICE', options: ['Medical cover', 'Training', 'Flexible hours', 'Transport'] },
        { id: 'q4', text: 'What one thing should we improve?', type: 'TEXT' }
      ],
      responses: [
        { id: 's1', by: 'Kevin Ouma', dept: 'Operations', at: d(-3), answers: { q1: 4, q2: 3, q3: 'Training', q4: 'Spare parts for the sorters' } },
        { id: 's2', by: 'Grace Wanjiku', dept: 'Finance', at: d(-2), answers: { q1: 5, q2: 4, q3: 'Medical cover', q4: 'Faster laptop' } },
        { id: 's3', by: 'Mary Wambui', dept: 'Operations', at: d(-2), answers: { q1: 3, q2: 2, q3: 'Transport', q4: 'Night shift transport to Likoni' } },
        { id: 's4', by: 'Lucy Njeri', dept: 'Sales', at: d(-1), answers: { q1: 4, q2: 4, q3: 'Flexible hours', q4: '' } }
      ]
    },
    {
      id: 'sv2', title: 'How well does ICT serve you?', kind: 'INTERNAL_CUSTOMER', targetDept: 'ICT', audience: 'All staff', period: `${year} Q3`, status: 'OPEN', createdBy: 'Ruth Chebet',
      questions: [
        { id: 'q1', text: 'Speed of response', type: 'SCALE' },
        { id: 'q2', text: 'Quality of the fix', type: 'SCALE' },
        { id: 'q3', text: 'Courtesy and communication', type: 'SCALE' }
      ],
      responses: [
        { id: 's5', by: 'David Otieno', dept: 'Finance', at: d(-4), answers: { q1: 3, q2: 4, q3: 5 } },
        { id: 's6', by: 'John Kiprop', dept: 'Operations', at: d(-3), answers: { q1: 2, q2: 3, q3: 4 } },
        { id: 's7', by: 'Joseph Kiprono', dept: 'HR', at: d(-1), answers: { q1: 4, q2: 5, q3: 5 } }
      ]
    }
  ],
  polls: [{ id: 'pl1', question: 'Where should the end-of-year staff party be?', options: ['Nyali beach hotel', 'Nairobi National Park picnic', 'Kericho tea estate tour'], votes: { 'Kevin Ouma': 0, 'Mary Wambui': 2, 'Grace Wanjiku': 2, 'Lucy Njeri': 1 }, createdBy: 'Joseph Kiprono', closes: d(10) }],
  suggestions: [
    { id: 'sg1', text: 'Install a water dispenser in the Shimanzi warehouse', dept: 'Operations', at: d(-8), votes: ['Kevin Ouma', 'John Kiprop', 'Mary Wambui'], status: 'UNDER_REVIEW' },
    { id: 'sg2', text: 'Share auction results on the intranet the same day', by: 'Grace Wanjiku', dept: 'Finance', at: d(-5), votes: ['Lucy Njeri'], status: 'NEW' },
    { id: 'sg3', text: 'Rotate night-shift supervisors monthly', dept: 'Operations', at: d(-15), votes: [], status: 'ADOPTED', response: 'Starting next month' }
  ]
});
