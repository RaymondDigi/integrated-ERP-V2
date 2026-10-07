import { addDays, localStamp, TODAY } from '../finance/engine';
import type { HistoryEntry } from '../finance/types';
import type { Audit, Capa, Change, Complaint, Connector, ControlState, CtlActor, CtlRole, ItAsset, Licence, Obligation, Permit, Policy, Risk, SyncEntry, Ticket, Workstream } from './types';

export const CTL_ACTORS: Record<CtlRole, CtlActor> = {
  QHSE: { role: 'QHSE', name: 'Ruth Chebet', title: 'QHSE Manager' },
  ICT_OFFICER: { role: 'ICT_OFFICER', name: 'Brian Kamau', title: 'ICT Officer' },
  ICT_MANAGER: { role: 'ICT_MANAGER', name: 'Samuel Kiptoo', title: 'ICT Manager' },
  SECRETARY: { role: 'SECRETARY', name: 'Agnes Wairimu', title: 'Company Secretary' }
};
const { QHSE: ruth, ICT_OFFICER: brian, ICT_MANAGER: samuel, SECRETARY: agnes } = CTL_ACTORS;

const d = (o: number) => addDays(TODAY, o);
const year = TODAY.slice(0, 4);
const num = (p: string, n: number) => `${p}-${year}-${String(n).padStart(4, '0')}`;
const h = (date: string, hour: number, by: string, action: string, note?: string): HistoryEntry => ({ at: `${date}T${String(hour).padStart(2, '0')}:10:00`, by, action, note });
/** A timestamp `hours` before now (for ticket SLAs). */
const ago = (hours: number) => localStamp(new Date(Date.now() - hours * 3_600_000));
/** Statutory due date: day `day` of the month after `offsetMonths` from now. */
const dueDay = (day: number, monthOffset = 0) => {
  const t = new Date(TODAY + 'T00:00:00');
  const x = new Date(t.getFullYear(), t.getMonth() + monthOffset, day);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const buildControlSeed = (): ControlState => {
  /* ---------------- Quality ---------------- */
  const audits: Audit[] = [
    {
      id: 'au1', number: num('AUD', 1), title: 'Food safety management — surveillance audit', type: 'External', standard: 'ISO 22000', area: 'Factory', auditor: 'Bureau Certification EA', date: d(-40), status: 'CLOSED',
      findings: [
        { id: 'f1', text: 'Pest-control records for the packing hall were incomplete for two weeks', severity: 'MINOR', capaId: 'ca1' },
        { id: 'f2', text: 'Calibration certificate for the bagging scale had expired', severity: 'MAJOR', capaId: 'ca2' },
        { id: 'f3', text: 'Good practice: changeover checklist on Line 2', severity: 'OBSERVATION' }
      ]
    },
    {
      id: 'au2', number: num('AUD', 2), title: 'Supplier audit — Greenfield Packaging', type: 'Supplier', standard: 'Supplier code of conduct', area: 'Procurement', auditor: ruth.name, date: d(-12), status: 'CLOSED',
      findings: [{ id: 'f4', text: 'No batch traceability on printed film rolls', severity: 'MINOR', capaId: 'ca3' }]
    },
    {
      id: 'au3', number: num('AUD', 3), title: 'Internal audit — warehouse stock controls', type: 'Internal', standard: 'Internal control framework', area: 'Warehousing', auditor: ruth.name, date: d(-2), status: 'IN_PROGRESS',
      findings: [{ id: 'f5', text: 'Two stock-count adjustments approved without written explanation', severity: 'MINOR' }]
    },
    { id: 'au4', number: num('AUD', 4), title: 'Occupational safety walk-through', type: 'Internal', standard: 'OSHA 2007', area: 'Factory', auditor: ruth.name, date: d(9), status: 'PLANNED', findings: [] },
    { id: 'au5', number: num('AUD', 5), title: 'Customer audit — Metro Supermarkets', type: 'Customer', standard: 'Retailer food-safety standard', area: 'Factory', auditor: 'Metro Supermarkets QA', date: d(21), status: 'PLANNED', findings: [] }
  ];
  const capas: Capa[] = [
    { id: 'ca1', number: num('CAPA', 1), source: 'AUDIT', sourceRef: num('AUD', 1), problem: 'Pest-control records incomplete', rootCause: 'Contractor visit log not checked weekly', action: 'Weekly sign-off of pest-control log by the QHSE officer', owner: 'Faith Akinyi', due: d(-20), status: 'CLOSED', history: [h(d(-39), 9, ruth.name, 'Raised'), h(d(-25), 14, 'Faith Akinyi', 'Action completed'), h(d(-22), 10, ruth.name, 'Verified effective')] },
    { id: 'ca2', number: num('CAPA', 2), source: 'AUDIT', sourceRef: num('AUD', 1), problem: 'Bagging scale calibration expired', rootCause: 'Calibration not on the preventive maintenance plan', action: 'Add 90-day scale calibration to the PM plan; recalibrate now', owner: 'Kevin Ouma', due: d(-25), status: 'VERIFY', history: [h(d(-39), 9, ruth.name, 'Raised'), h(d(-30), 15, 'Kevin Ouma', 'Action completed', 'Calibrated by KEBS-approved lab')] },
    { id: 'ca3', number: num('CAPA', 3), source: 'AUDIT', sourceRef: num('AUD', 2), problem: 'No batch traceability on film rolls', rootCause: 'Supplier labels do not show the production lot', action: 'Supplier to print lot numbers; Stores to record lot on the GRN', owner: 'Peter Mwangi', due: d(10), status: 'IN_PROGRESS', history: [h(d(-11), 10, ruth.name, 'Raised'), h(d(-8), 11, 'Peter Mwangi', 'Supplier agreed to new labels')] },
    { id: 'ca4', number: num('CAPA', 4), source: 'COMPLAINT', sourceRef: num('CMP', 2), problem: 'Under-weight standard packs reported by a customer', rootCause: 'Filler head 3 drifting after long runs', action: 'Add mid-shift weight check and service the filler head', owner: 'Mary Wambui', due: d(-3), status: 'IN_PROGRESS', history: [h(d(-14), 9, ruth.name, 'Raised')] },
    { id: 'ca5', number: num('CAPA', 5), source: 'INCIDENT', sourceRef: 'Near miss — forklift', problem: 'Forklift near miss in aisle 4', rootCause: 'Blind corner without a mirror', action: 'Install convex mirror and floor markings', owner: 'John Kiprop', due: d(5), status: 'OPEN', history: [h(d(-4), 8, ruth.name, 'Raised')] }
  ];
  const risks: Risk[] = [
    { id: 'rk1', title: 'Single customer concentration in exports', category: 'Strategic', owner: 'Lucy Njeri', likelihood: 4, impact: 4, residualLikelihood: 3, residualImpact: 4, controls: 'Pipeline targets for new export markets; credit insurance', nextReview: d(25), treatment: 'Diversify — Oman and Saudi buyers in pipeline' },
    { id: 'rk2', title: 'Raw material price increase', category: 'Financial', owner: 'Peter Mwangi', likelihood: 4, impact: 3, residualLikelihood: 3, residualImpact: 3, controls: 'Forward buying; quarterly price reviews with customers', nextReview: d(12), treatment: 'Forward purchase order for November' },
    { id: 'rk3', title: 'Generator failure during a grid outage', category: 'Operational', owner: 'Esther Muthoni', likelihood: 3, impact: 5, residualLikelihood: 2, residualImpact: 5, controls: 'Monthly 250-hour service; load test', nextReview: d(-5), treatment: 'Service now overdue — schedule this week' },
    { id: 'rk4', title: 'Late statutory filings and penalties', category: 'Compliance', owner: agnes.name, likelihood: 2, impact: 4, residualLikelihood: 1, residualImpact: 4, controls: 'Compliance calendar with reminders; Finance sign-off', nextReview: d(40), treatment: 'Monitor' },
    { id: 'rk5', title: 'Forklift and pedestrian collision', category: 'Safety', owner: 'John Kiprop', likelihood: 3, impact: 4, residualLikelihood: 2, residualImpact: 4, controls: 'Trained operators; speed limit; mirrors (in progress)', nextReview: d(7), treatment: 'Complete CAPA-0005' },
    { id: 'rk6', title: 'Ransomware or data loss', category: 'ICT', owner: samuel.name, likelihood: 3, impact: 5, residualLikelihood: 2, residualImpact: 4, controls: 'Daily off-site backups; MFA; patching', nextReview: d(18), treatment: 'Restore test due this month' },
    { id: 'rk7', title: 'Customer credit default', category: 'Financial', owner: 'David Otieno', likelihood: 3, impact: 3, residualLikelihood: 2, residualImpact: 3, controls: 'Credit limits enforced on orders; weekly ageing review', nextReview: d(30), treatment: 'Chase 90+ day balances' },
    { id: 'rk8', title: 'Loss of key production staff', category: 'Operational', owner: 'Esther Muthoni', likelihood: 2, impact: 3, residualLikelihood: 2, residualImpact: 2, controls: 'Cross-training; succession plan', nextReview: d(60), treatment: 'Accept' }
  ];
  const complaints: Complaint[] = [
    { id: 'cm1', number: num('CMP', 1), customerId: 'c2', date: d(-33), sku: 'GFT-06', category: 'Packaging', description: 'Six gift boxes arrived with crushed corners', severity: 'LOW', status: 'RESOLVED', response: 'Replaced at no charge; carton strength increased' },
    { id: 'cm2', number: num('CMP', 2), customerId: 'c7', date: d(-15), sku: 'STD-24', batch: num('BAT', 4), category: 'Quality', description: 'Random check found packs 12 g under the declared weight', severity: 'HIGH', status: 'INVESTIGATING', capaId: 'ca4' },
    { id: 'cm3', number: num('CMP', 3), customerId: 'c8', date: d(-6), sku: 'BLK-25', category: 'Documentation', description: 'Certificate of origin had the wrong consignee address', severity: 'MEDIUM', status: 'INVESTIGATING' },
    { id: 'cm4', number: num('CMP', 4), customerId: 'c1', date: d(-1), sku: 'STD-24', category: 'Delivery', description: 'Delivery arrived a day after the agreed date', severity: 'LOW', status: 'NEW' }
  ];

  /* ---------------- ICT ---------------- */
  const tickets: Ticket[] = [
    { id: 'tk1', number: num('INC', 1), title: 'Line 1 HMI not connecting to the network', requester: 'Mary Wambui', department: 'Operations', category: 'Network', priority: 'P1', created: ago(3.5), status: 'IN_PROGRESS', assignee: brian.name, firstResponse: ago(3.3), notes: [] },
    { id: 'tk2', number: num('INC', 2), title: 'Cannot approve invoices — permissions error', requester: 'David Otieno', department: 'Finance', category: 'ERP', priority: 'P2', created: ago(9), status: 'NEW', notes: [] },
    { id: 'tk3', number: num('INC', 3), title: 'New starter laptop and email — sales', requester: 'Lucy Njeri', department: 'Sales', category: 'Access', priority: 'P3', created: ago(30), status: 'IN_PROGRESS', assignee: brian.name, firstResponse: ago(28), notes: [] },
    { id: 'tk4', number: num('INC', 4), title: 'Printer in the finance office jamming', requester: 'Grace Wanjiku', department: 'Finance', category: 'Hardware', priority: 'P4', created: ago(50), status: 'WAITING', assignee: brian.name, firstResponse: ago(45), notes: [] },
    { id: 'tk5', number: num('INC', 5), title: 'VPN drops for the Mombasa port store', requester: 'John Kiprop', department: 'Operations', category: 'Network', priority: 'P2', created: ago(20), status: 'IN_PROGRESS', assignee: samuel.name, firstResponse: ago(18), notes: [] },
    { id: 'tk6', number: num('INC', 6), title: 'Outlook search not working', requester: 'Agnes Wairimu', department: 'Administration', category: 'Email', priority: 'P4', created: ago(70), status: 'RESOLVED', assignee: brian.name, firstResponse: ago(66), resolvedAt: ago(40), resolution: 'Rebuilt the search index', notes: [] },
    { id: 'tk7', number: num('INC', 7), title: 'Payroll export to bank file failing', requester: 'Joseph Kiprono', department: 'HR', category: 'ERP', priority: 'P1', created: ago(120), status: 'RESOLVED', assignee: samuel.name, firstResponse: ago(119.8), resolvedAt: ago(117), resolution: 'Bank changed the file format; mapping updated', notes: [] },
    { id: 'tk8', number: num('INC', 8), title: 'Password reset — warehouse handheld', requester: 'John Kiprop', department: 'Operations', category: 'Access', priority: 'P3', created: ago(26), status: 'RESOLVED', assignee: brian.name, firstResponse: ago(25), resolvedAt: ago(24), resolution: 'Reset and MFA re-enrolled', notes: [] },
    { id: 'tk9', number: num('INC', 9), title: 'Request: Power BI licence for management reports', requester: 'Esther Muthoni', department: 'Operations', category: 'Software', priority: 'P4', created: ago(5), status: 'NEW', notes: [] }
  ];
  const assets: ItAsset[] = [
    { id: 'it1', tag: 'IT-0101', type: 'Server', model: 'Dell PowerEdge R650', assignedTo: 'Server room', department: 'ICT', purchased: d(-480), warrantyEnd: d(250), status: 'IN_USE' },
    { id: 'it2', tag: 'IT-0102', type: 'Server', model: 'Synology backup NAS', assignedTo: 'Server room', department: 'ICT', purchased: d(-900), warrantyEnd: d(-30), status: 'IN_USE' },
    { id: 'it3', tag: 'IT-0201', type: 'Laptop', model: 'Lenovo ThinkPad E14', assignedTo: 'Grace Wanjiku', department: 'Finance', purchased: d(-370), warrantyEnd: d(360), status: 'IN_USE' },
    { id: 'it4', tag: 'IT-0202', type: 'Laptop', model: 'Lenovo ThinkPad E14', assignedTo: 'David Otieno', department: 'Finance', purchased: d(-370), warrantyEnd: d(360), status: 'IN_USE' },
    { id: 'it5', tag: 'IT-0203', type: 'Laptop', model: 'HP ProBook 450', assignedTo: 'Peter Mwangi', department: 'Sales', purchased: d(-1000), warrantyEnd: d(-270), status: 'REPAIR' },
    { id: 'it6', tag: 'IT-0204', type: 'Laptop', model: 'HP ProBook 450', assignedTo: 'Spare pool', department: 'ICT', purchased: d(-200), warrantyEnd: d(530), status: 'SPARE' },
    { id: 'it7', tag: 'IT-0301', type: 'Network', model: 'Fortinet FortiGate 60F', assignedTo: 'Head office', department: 'ICT', purchased: d(-600), warrantyEnd: d(20), status: 'IN_USE' },
    { id: 'it8', tag: 'IT-0401', type: 'Printer', model: 'Kyocera ECOSYS M3655', assignedTo: 'Finance office', department: 'Finance', purchased: d(-1200), warrantyEnd: d(-470), status: 'IN_USE' },
    { id: 'it9', tag: 'IT-0501', type: 'Phone', model: 'Zebra TC21 handheld', assignedTo: 'John Kiprop', department: 'Operations', purchased: d(-150), warrantyEnd: d(580), status: 'IN_USE' }
  ];
  const licences: Licence[] = [
    { id: 'li1', name: 'Microsoft 365 Business Standard', vendor: 'Microsoft', seats: 60, used: 57, renewal: d(48), annualCost: 1_050_000 },
    { id: 'li2', name: 'Integrated Workforce platform', vendor: 'Integrated', seats: 80, used: 64, renewal: d(150), annualCost: 2_400_000 },
    { id: 'li3', name: 'Antivirus — endpoint protection', vendor: 'ESET', seats: 70, used: 69, renewal: d(19), annualCost: 210_000 },
    { id: 'li4', name: 'AutoCAD LT', vendor: 'Autodesk', seats: 2, used: 1, renewal: d(200), annualCost: 95_000 },
    { id: 'li5', name: 'Backup cloud storage 2 TB', vendor: 'Backblaze', seats: 1, used: 1, renewal: d(9), annualCost: 48_000 }
  ];
  const changes: Change[] = [
    { id: 'ch1', number: num('CHG', 1), title: 'Upgrade firewall firmware to 7.4', system: 'FortiGate 60F', risk: 'MEDIUM', requestedBy: brian.name, window: `${d(3)} 20:00–22:00`, backout: 'Restore saved config and previous firmware image', status: 'SUBMITTED', history: [h(d(-1), 10, brian.name, 'Submitted to the change board')] },
    { id: 'ch2', number: num('CHG', 2), title: 'Enable MFA for all ERP users', system: 'Integrated Workforce', risk: 'LOW', requestedBy: samuel.name, window: `${d(-6)} 18:00–19:00`, backout: 'Disable the MFA policy', status: 'IMPLEMENTED', history: [h(d(-10), 9, samuel.name, 'Submitted'), h(d(-9), 11, 'Amina Hassan', 'Approved'), h(d(-6), 19, samuel.name, 'Implemented successfully')] },
    { id: 'ch3', number: num('CHG', 3), title: 'Migrate file shares to SharePoint', system: 'Microsoft 365', risk: 'HIGH', requestedBy: brian.name, window: `${d(10)} Sat 08:00–18:00`, backout: 'Keep the old file server read-only for 30 days', status: 'SUBMITTED', history: [h(d(-2), 15, brian.name, 'Submitted to the change board')] }
  ];

  /* ---------------- Integrations ---------------- */
  const connectors: Connector[] = [
    { id: 'cn1', name: 'KRA iTax — PAYE returns', provider: 'Kenya Revenue Authority', purpose: 'Monthly P10 PAYE return and P9 certificates', module: 'People & Payroll', status: 'CONNECTED', schedule: 'Monthly, by the 9th', lastSync: ago(170) },
    { id: 'cn2', name: 'KRA eTIMS — tax invoices', provider: 'Kenya Revenue Authority', purpose: 'Transmit every sales invoice for a control unit number', module: 'Finance', status: 'DEGRADED', schedule: 'Real time', lastSync: ago(0.4) },
    { id: 'cn3', name: 'M-Pesa B2C — salary payments', provider: 'Safaricom Daraja', purpose: 'Pay casual staff and refunds to mobile money', module: 'People & Payroll', status: 'CONNECTED', schedule: 'On payroll approval', lastSync: ago(260) },
    { id: 'cn4', name: 'M-Pesa C2B — customer payments', provider: 'Safaricom Daraja', purpose: 'Match paybill receipts to customer invoices', module: 'Finance', status: 'CONNECTED', schedule: 'Real time', lastSync: ago(0.1) },
    { id: 'cn5', name: 'KCB bank statement feed', provider: 'KCB Bank', purpose: 'Daily statement for bank reconciliation', module: 'Finance', status: 'CONNECTED', schedule: 'Daily 06:00', lastSync: ago(4) },
    { id: 'cn6', name: 'SHA / NSSF remittances', provider: 'Social Health Authority · NSSF', purpose: 'Monthly contribution schedules', module: 'People & Payroll', status: 'CONNECTED', schedule: 'Monthly, by the 9th', lastSync: ago(170) },
    { id: 'cn7', name: 'Weighbridge — factory gate', provider: 'Avery weighbridge', purpose: 'Gross and tare weights onto goods received', module: 'Procurement', status: 'PAUSED', schedule: 'Real time', lastSync: ago(52) },
    { id: 'cn8', name: 'Email and SMS notifications', provider: 'Microsoft 365 · Africa’s Talking', purpose: 'Approvals, payslips and customer statements', module: 'Platform', status: 'CONNECTED', schedule: 'Real time', lastSync: ago(0.05) }
  ];
  const syncLog: SyncEntry[] = [];
  let sn = 0;
  const log = (connectorId: string, hoursAgo: number, direction: 'IN' | 'OUT', records: number, status: SyncEntry['status'], message: string) => syncLog.push({ id: `sy${++sn}`, connectorId, at: ago(hoursAgo), direction, records, status, message });
  log('cn2', 0.4, 'OUT', 3, 'WARN', '1 of 4 invoices rejected: buyer PIN not valid on KRA');
  log('cn2', 2, 'OUT', 5, 'OK', '5 invoices signed');
  log('cn2', 26, 'OUT', 2, 'FAIL', 'eTIMS gateway timeout — will retry');
  log('cn4', 0.1, 'IN', 2, 'OK', '2 paybill receipts matched to invoices');
  log('cn4', 5, 'IN', 1, 'WARN', '1 receipt could not be matched — no invoice number in the account field');
  log('cn5', 4, 'IN', 18, 'OK', 'Statement imported: 18 lines');
  log('cn8', 0.05, 'OUT', 14, 'OK', '14 approval notifications sent');
  log('cn7', 52, 'IN', 0, 'FAIL', 'Device offline — paused by ICT for recalibration');
  log('cn1', 170, 'OUT', 1, 'OK', 'P10 return filed — acknowledgement received');
  log('cn6', 170, 'OUT', 2, 'OK', 'SHA and NSSF schedules submitted');
  log('cn3', 260, 'OUT', 12, 'OK', '12 B2C payments completed');

  /* ---------------- Governance ---------------- */
  const obligations: Obligation[] = [
    { id: 'ob1', name: 'PAYE return (P10) and payment', authority: 'KRA', frequency: 'Monthly', due: dueDay(9, 1), owner: 'Payroll Officer', status: 'DUE' },
    { id: 'ob2', name: 'NSSF contributions', authority: 'NSSF', frequency: 'Monthly', due: dueDay(9, 1), owner: 'Payroll Officer', status: 'DUE' },
    { id: 'ob3', name: 'SHIF contributions', authority: 'Social Health Authority', frequency: 'Monthly', due: dueDay(9, 1), owner: 'Payroll Officer', status: 'DUE' },
    { id: 'ob4', name: 'Affordable housing levy', authority: 'KRA', frequency: 'Monthly', due: dueDay(9, 1), owner: 'Payroll Officer', status: 'DUE' },
    { id: 'ob5', name: 'VAT return (VAT 3)', authority: 'KRA', frequency: 'Monthly', due: dueDay(20, 0), owner: 'David Otieno', status: 'DUE' },
    { id: 'ob6', name: 'PAYE return (P10) and payment — last month', authority: 'KRA', frequency: 'Monthly', due: dueDay(9, 0), owner: 'Payroll Officer', status: 'DUE' },
    { id: 'ob7', name: 'NITA training levy', authority: 'NITA', frequency: 'Monthly', due: dueDay(9, 0), owner: 'Payroll Officer', status: 'FILED', filedOn: d(-1), ref: 'NITA-88213' },
    { id: 'ob8', name: 'Withholding VAT and tax remittance', authority: 'KRA', frequency: 'Monthly', due: dueDay(20, 0), owner: 'David Otieno', status: 'DUE' },
    { id: 'ob9', name: 'Corporation tax instalment', authority: 'KRA', frequency: 'Quarterly', due: dueDay(20, 2), owner: 'Amina Hassan', status: 'DUE' },
    { id: 'ob10', name: 'Annual return to the Registrar', authority: 'Business Registration Service', frequency: 'Annual', due: d(54), owner: agnes.name, status: 'DUE' },
    { id: 'ob11', name: 'Statutory audit — appoint auditors', authority: 'Companies Act', frequency: 'Annual', due: d(80), owner: agnes.name, status: 'DUE' },
    { id: 'ob12', name: 'VAT return (VAT 3) — last month', authority: 'KRA', frequency: 'Monthly', due: dueDay(20, -1), owner: 'David Otieno', status: 'FILED', filedOn: dueDay(18, -1), ref: 'KRA-VAT-552810' }
  ];
  const policies: Policy[] = [
    { id: 'po1', title: 'Code of conduct and ethics', owner: agnes.name, version: '3.1', approved: d(-200), nextReview: d(165), staff: 64, acknowledged: 61 },
    { id: 'po2', title: 'Anti-bribery and corruption', owner: agnes.name, version: '2.0', approved: d(-380), nextReview: d(-15), staff: 64, acknowledged: 58 },
    { id: 'po3', title: 'Information security and acceptable use', owner: samuel.name, version: '4.2', approved: d(-90), nextReview: d(275), staff: 64, acknowledged: 49 },
    { id: 'po4', title: 'Occupational health and safety', owner: ruth.name, version: '5.0', approved: d(-60), nextReview: d(305), staff: 64, acknowledged: 64 },
    { id: 'po5', title: 'Data protection (Data Protection Act 2019)', owner: agnes.name, version: '1.3', approved: d(-150), nextReview: d(30), staff: 64, acknowledged: 52 },
    { id: 'po6', title: 'Procurement and delegation of authority', owner: 'Amina Hassan', version: '2.4', approved: d(-45), nextReview: d(320), staff: 22, acknowledged: 22 }
  ];
  const permits: Permit[] = [
    { id: 'pe1', name: 'Single business permit — Athi River factory', issuer: 'Machakos County', number: 'SBP-ATR-22198', expiry: d(85), site: 'Factory' },
    { id: 'pe2', name: 'Food handling licence', issuer: 'Ministry of Health', number: 'FHL-0091273', expiry: d(24), site: 'Factory' },
    { id: 'pe3', name: 'Workplace registration certificate', issuer: 'DOSHS', number: 'DOSH-WR-55102', expiry: d(210), site: 'Factory' },
    { id: 'pe4', name: 'Boiler certificate of examination', issuer: 'DOSHS', number: 'BCE-77819', expiry: d(4), site: 'Factory' },
    { id: 'pe5', name: 'Effluent discharge licence', issuer: 'NEMA', number: 'NEMA-EDL-3302', expiry: d(130), site: 'Factory' },
    { id: 'pe6', name: 'Fire safety certificate — Nairobi warehouse', issuer: 'Nairobi County Fire', number: 'NCF-19920', expiry: d(-6), site: 'Main warehouse' },
    { id: 'pe7', name: 'Export licence', issuer: 'Kenya Export Promotion', number: 'KEPROBA-EX-4410', expiry: d(260), site: 'Head office' }
  ];

  /* ---------------- Implementation ---------------- */
  const ws = (module: string, owner: string, goLive: number, tasks: [string, Workstream['tasks'][number]['phase'], number, boolean][]): Workstream => ({
    id: module,
    module,
    owner,
    goLive: d(goLive),
    tasks: tasks.map(([name, phase, due, done]) => ({ name, phase, due: d(due), done }))
  });
  const workstreams: Workstream[] = [
    ws('People & Payroll', 'Joseph Kiprono', -60, [['Company, grades and pay components', 'Configure', -120, true], ['Employee master and bank details', 'Data', -95, true], ['Parallel payroll run × 2', 'Testing', -70, true], ['HR and line-manager training', 'Training', -65, true], ['First live payroll', 'Go-live', -60, true]]),
    ws('Finance', 'David Otieno', -30, [['Chart of accounts and opening balances', 'Configure', -90, true], ['Customer and supplier balances', 'Data', -60, true], ['Bank feed and eTIMS', 'Configure', -40, true], ['Month-end close rehearsal', 'Testing', -35, true], ['Go-live', 'Go-live', -30, true]]),
    ws('Trading & Procurement', 'Lucy Njeri', -10, [['Price lists and products', 'Data', -45, true], ['Approval limits', 'Configure', -30, true], ['User acceptance testing', 'Testing', -18, true], ['Sales and stores training', 'Training', -14, true], ['Go-live', 'Go-live', -10, true]]),
    ws('Operations', 'Esther Muthoni', 21, [['Recipes and quality checks', 'Configure', -15, true], ['Opening stock by location', 'Data', -5, true], ['Fleet and equipment register', 'Data', 2, false], ['Stores and production training', 'Training', 10, false], ['User acceptance testing', 'Testing', 14, false], ['Go-live', 'Go-live', 21, false]]),
    ws('Quality, ICT & Governance', 'Ruth Chebet', 45, [['Risk register migration', 'Data', 5, false], ['Compliance calendar set-up', 'Configure', -3, true], ['Service desk SLAs', 'Configure', 12, false], ['Policy acknowledgement campaign', 'Training', 30, false], ['Go-live', 'Go-live', 45, false]])
  ];

  return {
    actor: ruth,
    audits,
    capas,
    risks,
    complaints,
    tickets,
    assets,
    licences,
    changes,
    connectors,
    syncLog,
    obligations,
    policies,
    permits,
    workstreams,
    sequence: { AUD: 5, CAPA: 5, CMP: 4, INC: 9, CHG: 3 }
  };
};
