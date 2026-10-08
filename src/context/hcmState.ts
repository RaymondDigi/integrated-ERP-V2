import { useState } from 'react';
import type { EmployeeQualification, HREmployee, ProfessionalCert } from '../types';
import type { PayItem } from '../data/payItems';
import type { PpeIssue } from '../data/oshEngine';
import { PPE_ITEMS } from '../data/oshConfig';
import { useSession } from '../auth/session';
import { canApprove } from '../platform/access';
import { audit } from '../platform/audit';
import { notify } from '../platform/outbox';
import {
  FLEXI_DAY_HOURS,
  FLEXI_MAX_BANK_HOURS,
  INITIAL_BOOKS,
  INITIAL_CSR,
  INITIAL_ENV,
  INITIAL_EVENTS,
  INITIAL_FINDINGS,
  INITIAL_FLEXI,
  INITIAL_IDPS,
  INITIAL_LOANS,
  INITIAL_MEDICAL_CLAIMS,
  INITIAL_MEDICAL_COVERS,
  INITIAL_OUTSOURCED,
  INITIAL_PLACEMENTS,
  INITIAL_PPE_REQUESTS,
  INITIAL_PPE_STOCK,
  INITIAL_PROFESSIONAL_BODIES,
  INITIAL_SUCCESSION,
  INITIAL_TRAVEL,
  INITIAL_WELFARE_CLAIMS,
  INITIAL_WELFARE_SCHEMES,
  DEFAULT_GL_MAP,
  ENV_LIMITS,
  LOAN_DAYS,
  MAX_LOANS,
  MEDICAL_SCHEMES,
  PETTY_CASH_LIMIT_KES,
  PLACEMENT_CRITERIA,
  PLACEMENT_MAX_MONTHS,
  QUALIFICATION_LEVELS,
  type AuditFinding,
  type ClaimBenefit,
  type CsrActivity,
  type DmeLog,
  type FlexiEntry,
  type GradeRule,
  type HistoryEntry,
  type HrEvent,
  type Idp,
  type IdpAction,
  type LibraryBook,
  type LibraryLoan,
  type MedicalClaim,
  type MedicalCover,
  type OutsourcedContract,
  type PayrollGlMap,
  type Placement,
  type PpeRequest,
  type SalaryStructure,
  type SuccessionPlan,
  type TravelRequest,
  type WelfareClaim,
  type WelfareScheme,
  type WorkEnvMeasurement
} from '../data/hcmConfig';
import { addDaysIso, flexiBalance, fmt, kes, limitOf, loanFine, monthsBetweenIso, nightsBetween, perDiemRate, suspensionBlock, todayIso, utilised, validateGradeRules, type HrAlert } from '../data/hcmEngine';
import { gradeOf } from '../data/hireEngine';
import { supervisorFor } from '../data/leaveConfig';
import { setSalaryStructures } from '../data/salaryStructure';

type Toast = (t: { type: 'success' | 'error' | 'info' | 'warning'; title: string; message: string }) => void;
type Draft = Omit<PayItem, 'id' | 'orgId' | 'postedBy' | 'postedOn' | 'status'>;

/**
 * Human capital services: qualifications, interns and attachees, welfare and medical cover, travel and imprest,
 * CSR and events, outsourced labour, the library, talent and succession, PPE requisitions, OSH audit findings,
 * work-environment monitoring, salary structure, payroll GL mapping and bank files, flexi time and HR notices.
 * Approvals follow maker-checker: the signed-in manager approves, and never their own request.
 */
export interface HcmStateSlice {
  professionalBodies: string[];
  addProfessionalBody: (name: string) => boolean;
  addQualification: (staffId: string, q: Omit<EmployeeQualification, 'id' | 'verified' | 'verifiedBy'>) => boolean;
  verifyQualification: (staffId: string, id: string) => boolean;
  removeQualification: (staffId: string, id: string) => boolean;
  addProfessionalCert: (staffId: string, c: Omit<ProfessionalCert, 'id'>) => boolean;
  renewProfessionalCert: (staffId: string, id: string, expiry: string, cpdHours: number) => boolean;

  placements: Placement[];
  addPlacement: (p: Omit<Placement, 'id' | 'orgId' | 'status' | 'logbook' | 'history' | 'evaluation' | 'certificateNo'>) => Placement | null;
  logPlacementWeek: (id: string, summary: string, hours: number) => boolean;
  signPlacementWeek: (id: string, week: number) => boolean;
  evaluatePlacement: (id: string, scores: Record<string, number>, comment: string) => boolean;
  completePlacement: (id: string) => boolean;
  terminatePlacement: (id: string, reason: string) => boolean;

  welfareSchemes: WelfareScheme[];
  saveWelfareScheme: (s: WelfareScheme) => boolean;
  welfareClaims: WelfareClaim[];
  submitWelfareClaim: (c: { staffId: string; schemeId: string; eventDate: string; details: string }) => WelfareClaim | null;
  decideWelfareClaim: (id: string, approve: boolean, note?: string) => boolean;
  payWelfareClaim: (id: string) => boolean;

  medicalCovers: MedicalCover[];
  enrolMedical: (c: Omit<MedicalCover, 'dependants'>) => boolean;
  addDependant: (staffId: string, d: MedicalCover['dependants'][number]) => boolean;
  medicalClaims: MedicalClaim[];
  submitMedicalClaim: (c: { staffId: string; beneficiary: string; benefit: ClaimBenefit; provider: string; date: string; amountKes: number }) => MedicalClaim | null;
  decideMedicalClaim: (id: string, approve: boolean, approvedKes?: number, note?: string) => boolean;

  travelRequests: TravelRequest[];
  submitTravel: (t: { staffId: string; kind: TravelRequest['kind']; purpose: string; destination: string; from: string; to: string; transportKes: number; otherKes: number }) => TravelRequest | null;
  /** Manager approves first; Finance then issues the imprest (issueRef is the Finance journal). */
  decideTravel: (id: string, approve: boolean, note?: string, issueRef?: string) => boolean;
  surrenderTravel: (id: string, spentKes: number, receipts: number, ref?: string) => boolean;

  csrActivities: CsrActivity[];
  saveCsr: (c: Omit<CsrActivity, 'id' | 'orgId' | 'status' | 'proposedBy' | 'history' | 'volunteerHours'> & { id?: string }) => CsrActivity | null;
  decideCsr: (id: string, approve: boolean, note?: string) => boolean;
  completeCsr: (id: string, r: { actualKes: number; volunteerHours: number; beneficiaries: number; outcome: string }) => boolean;

  hrEvents: HrEvent[];
  saveEvent: (e: Omit<HrEvent, 'id' | 'orgId' | 'status' | 'organiser' | 'history' | 'rsvp'> & { id?: string }) => HrEvent | null;
  submitEvent: (id: string) => boolean;
  decideEvent: (id: string, approve: boolean, note?: string) => boolean;
  toggleEventTask: (id: string, index: number) => void;
  rsvpEvent: (id: string, staffId: string, answer: 'YES' | 'NO') => boolean;
  closeEvent: (id: string, actualKes: number) => boolean;

  outsourcedContracts: OutsourcedContract[];
  saveOutsourced: (c: Omit<OutsourcedContract, 'id' | 'orgId' | 'status' | 'headcount' | 'history'>) => OutsourcedContract | null;
  recordHeadcount: (id: string, month: string, planned: number, actual: number, days?: number) => boolean;
  renewOutsourced: (id: string, end: string) => boolean;
  terminateOutsourced: (id: string, reason: string) => boolean;

  libraryBooks: LibraryBook[];
  libraryLoans: LibraryLoan[];
  addBook: (b: Omit<LibraryBook, 'id'>) => boolean;
  lendBook: (bookId: string, staffId: string) => boolean;
  returnBook: (loanId: string) => boolean;
  renewLoan: (loanId: string) => boolean;

  idps: Idp[];
  saveIdp: (d: Omit<Idp, 'id' | 'status' | 'history' | 'actions'> & { id?: string }) => Idp | null;
  agreeIdp: (id: string) => boolean;
  addIdpAction: (id: string, a: Omit<IdpAction, 'id' | 'status'>) => boolean;
  completeIdpAction: (id: string, actionId: string) => boolean;
  successionPlans: SuccessionPlan[];
  saveSuccessionPlan: (p: Omit<SuccessionPlan, 'id' | 'orgId' | 'reviewedOn' | 'reviewedBy'> & { id?: string }) => boolean;

  ppeRequests: PpeRequest[];
  ppeStock: Record<string, number>;
  requestPpe: (r: { staffIds: string[]; department: string; items: { item: string; qty: number }[]; reason: string }) => PpeRequest | null;
  decidePpe: (id: string, approve: boolean, note?: string) => boolean;
  issuePpeRequest: (id: string) => boolean;
  receivePpeStock: (item: string, qty: number) => boolean;

  auditFindings: AuditFinding[];
  addFinding: (f: Omit<AuditFinding, 'id' | 'orgId' | 'status'>) => boolean;
  closeFinding: (id: string, evidence: string) => boolean;
  envMeasurements: WorkEnvMeasurement[];
  addMeasurement: (m: Omit<WorkEnvMeasurement, 'id' | 'orgId' | 'limit' | 'limitIs' | 'by'>) => boolean;

  salaryStructures: SalaryStructure[];
  saveSalaryStructure: (rules: GradeRule[], effectiveFrom: string) => boolean;
  glMaps: Record<string, PayrollGlMap>;
  saveGlMap: (map: PayrollGlMap) => boolean;
  dmeLogs: DmeLog[];
  recordDme: (d: Omit<DmeLog, 'id' | 'orgId' | 'by' | 'at' | 'status'>) => DmeLog | null;
  markDmeUploaded: (id: string, bankRef: string) => boolean;

  flexiEntries: FlexiEntry[];
  bankFlexi: (staffId: string, date: string, hours: number, note: string) => boolean;
  redeemFlexi: (staffId: string, date: string, note: string) => boolean;
  decideFlexi: (id: string, approve: boolean) => boolean;

  sentHrAlerts: string[];
  sendHrAlertNotices: (alerts: HrAlert[]) => number;
}

interface Deps {
  hrEmployees: HREmployee[];
  selectedOrgId: string;
  payrollOpenPeriod: { key: string; label: string };
  updateHrEmployee: (staffId: string, patch: Partial<HREmployee>) => void;
  postPayItems: (items: Draft[], by?: string) => number;
  addTrainingNeed: (n: { staffId: string; skill: string; reason: string; source: 'Appraisal' | 'Manager' | 'Compliance' | 'Employee'; ref?: string; priority: 'High' | 'Medium' | 'Low' }) => void;
  issuePpe: (lines: Omit<PpeIssue, 'id' | 'orgId' | 'issuedBy'>[]) => number;
  noteRatesChanged: () => void;
  addToast: Toast;
}

const nextId = (ids: string[], prefix: string, width = 3) => {
  const n = Math.max(0, ...ids.filter((x) => x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length)) || 0)) + 1;
  return `${prefix}${String(n).padStart(width, '0')}`;
};

export const useHcmState = (d: Deps): HcmStateSlice => {
  const session = useSession();
  const actor = session?.name ?? 'HR office';
  const actorStaffId = session?.staffId;
  const approver = canApprove(session?.role);
  const today = todayIso();
  const year = today.slice(0, 4);
  const emp = (id?: string) => d.hrEmployees.find((e) => e.staffId === id);
  const nameOf = (id?: string) => emp(id)?.fullName ?? id ?? '—';
  const fail = (title: string, message: string) => {
    d.addToast({ type: 'error', title, message });
    return false;
  };
  const done = (title: string, message: string, type: 'success' | 'info' | 'warning' = 'success') => {
    d.addToast({ type, title, message });
    return true;
  };
  const hist = (action: string, note?: string): HistoryEntry => ({ at: today, by: actor, action, note });
  const blockSuspended = (what: string) => {
    const msg = suspensionBlock(emp(actorStaffId), what);
    return msg ? fail('Suspended', msg) : true;
  };
  /** Approver checks shared by every workflow here: a manager, not the requester, not suspended. */
  const checkApprover = (requester: string, what: string) => {
    if (!approver) return fail('Approval needs a manager', `${actor} can prepare ${what} but a manager approves it.`);
    if (requester === actor) return fail('Segregation of duties', `You raised this ${what} and cannot approve it.`);
    return blockSuspended('approve');
  };

  /* ---------------------------------------------------------------- qualifications register */

  const [professionalBodies, setBodies] = useState<string[]>(INITIAL_PROFESSIONAL_BODIES);
  const addProfessionalBody = (name: string) => {
    const n = name.trim();
    if (n.length < 3) return fail('Name needed', 'Give the professional body’s name.');
    if (professionalBodies.some((b) => b.toLowerCase() === n.toLowerCase())) return fail('Already listed', `${n} is in the catalogue.`);
    setBodies((xs) => [...xs, n]);
    audit({ module: 'HR', by: actor, action: 'Professional body added', after: n });
    return done('Professional body added', n);
  };

  const addQualification: HcmStateSlice['addQualification'] = (staffId, q) => {
    const e = emp(staffId);
    if (!e) return fail('Employee not found', staffId);
    const y = Number(q.year);
    if (!QUALIFICATION_LEVELS.includes(q.level)) return fail('Choose a level', 'Certificate, Diploma, Degree, Post Graduate Diploma, Masters or PhD.');
    if (!q.field.trim() || !q.institution.trim()) return fail('Details needed', 'Give the field of study and the institution.');
    if (!(y >= 1960 && y <= Number(year))) return fail('Check the year', `The year awarded must be between 1960 and ${year}.`);
    if ((e.qualifications ?? []).some((x) => x.level === q.level && x.field.toLowerCase() === q.field.trim().toLowerCase() && x.institution.toLowerCase() === q.institution.trim().toLowerCase()))
      return fail('Already on file', `${e.fullName} already has this ${q.level.toLowerCase()} recorded.`);
    const row: EmployeeQualification = { ...q, field: q.field.trim(), institution: q.institution.trim(), year: y, id: `Q-${Date.now().toString(36)}`, verified: false };
    d.updateHrEmployee(staffId, { qualifications: [...(e.qualifications ?? []), row], history: [...(e.history ?? []), { date: today, kind: 'Qualification added', summary: `${q.level} — ${row.field}, ${row.institution} (${y})`, by: actor }] });
    audit({ module: 'HR', by: actor, ref: staffId, action: 'Qualification added', field: 'qualifications', after: `${q.level} ${row.field}` });
    return done('Qualification recorded', `${q.level} in ${row.field} added for ${e.fullName}. HR verifies it against the certificate.`);
  };
  const verifyQualification = (staffId: string, id: string) => {
    const e = emp(staffId);
    const q = e?.qualifications?.find((x) => x.id === id);
    if (!e || !q) return false;
    if (actorStaffId === staffId) return fail('Segregation of duties', 'You cannot verify your own qualification.');
    if (q.verified) return fail('Already verified', `Verified by ${q.verifiedBy}.`);
    d.updateHrEmployee(staffId, { qualifications: (e.qualifications ?? []).map((x) => (x.id === id ? { ...x, verified: true, verifiedBy: actor } : x)) });
    audit({ module: 'HR', by: actor, ref: staffId, action: 'Qualification verified', after: `${q.level} ${q.field}` });
    return done('Qualification verified', `${q.level} in ${q.field} — ${e.fullName}.`);
  };
  const removeQualification = (staffId: string, id: string) => {
    const e = emp(staffId);
    const q = e?.qualifications?.find((x) => x.id === id);
    if (!e || !q) return false;
    if (q.verified && !approver) return fail('Verified record', 'Only a manager can remove a verified qualification.');
    d.updateHrEmployee(staffId, { qualifications: (e.qualifications ?? []).filter((x) => x.id !== id) });
    audit({ module: 'HR', by: actor, ref: staffId, action: 'Qualification removed', before: `${q.level} ${q.field}` });
    return done('Qualification removed', `${q.level} in ${q.field}.`, 'info');
  };
  const addProfessionalCert: HcmStateSlice['addProfessionalCert'] = (staffId, c) => {
    const e = emp(staffId);
    if (!e) return false;
    if (!professionalBodies.includes(c.body)) return fail('Choose the body', 'Pick a professional body from the catalogue (add it first if it is new).');
    if (!c.membershipNo.trim()) return fail('Membership number needed', 'Enter the membership or licence number.');
    if (!c.expiry) return fail('Expiry needed', 'Enter when the membership must be renewed.');
    if ((e.professionalCerts ?? []).some((x) => x.body === c.body)) return fail('Already a member', `${e.fullName} already has a ${c.body.split(' — ')[0]} membership — renew it instead.`);
    d.updateHrEmployee(staffId, { professionalCerts: [...(e.professionalCerts ?? []), { ...c, membershipNo: c.membershipNo.trim(), id: `PC-${Date.now().toString(36)}` }] });
    audit({ module: 'HR', by: actor, ref: staffId, action: 'Professional membership added', after: `${c.body} ${c.membershipNo}` });
    return done('Membership recorded', `${c.body.split(' — ')[0]} ${c.membershipNo} for ${e.fullName}, renews ${fmt(c.expiry)}.`);
  };
  const renewProfessionalCert = (staffId: string, id: string, expiry: string, cpdHours: number) => {
    const e = emp(staffId);
    const c = e?.professionalCerts?.find((x) => x.id === id);
    if (!e || !c) return false;
    if (!expiry || expiry <= c.expiry) return fail('Check the date', `The new expiry must be after ${fmt(c.expiry)}.`);
    if (cpdHours < 0) return fail('CPD hours', 'CPD hours cannot be negative.');
    d.updateHrEmployee(staffId, { professionalCerts: (e.professionalCerts ?? []).map((x) => (x.id === id ? { ...x, expiry, cpdHours } : x)) });
    audit({ module: 'HR', by: actor, ref: staffId, action: 'Membership renewed', field: 'expiry', before: c.expiry, after: expiry });
    return done('Membership renewed', `${c.body.split(' — ')[0]} now runs to ${fmt(expiry)}.`);
  };

  /* ---------------------------------------------------------------- interns and attachees */

  const [placements, setPlacements] = useState<Placement[]>(INITIAL_PLACEMENTS);
  const patchPlacement = (id: string, f: (p: Placement) => Placement) => setPlacements((xs) => xs.map((p) => (p.id === id ? f(p) : p)));
  const addPlacement: HcmStateSlice['addPlacement'] = (p) => {
    const errs: string[] = [];
    if (!p.name.trim() || !p.institution.trim() || !p.course.trim()) errs.push('Name, institution and course are needed.');
    if (!/\S+@\S+\.\S+/.test(p.email)) errs.push('Enter a valid email.');
    if (!p.supervisorStaffId) errs.push('Assign a workplace supervisor.');
    if (!p.start || !p.end || p.end <= p.start) errs.push('The end date must be after the start.');
    else if (monthsBetweenIso(p.start, p.end) >= PLACEMENT_MAX_MONTHS[p.kind]) errs.push(`${p.kind === 'INTERNSHIP' ? 'An internship' : 'An attachment'} runs at most ${PLACEMENT_MAX_MONTHS[p.kind]} months.`);
    if (p.stipendKes < 0) errs.push('The stipend cannot be negative.');
    if (p.kind === 'ATTACHMENT' && !p.letterRef?.trim()) errs.push('Attachments need the institution’s introduction letter reference.');
    if (!p.insuranceRef?.trim()) errs.push('Record the WIBA / personal accident cover before the placement starts.');
    if (placements.some((x) => x.email.toLowerCase() === p.email.toLowerCase() && ['PLANNED', 'ACTIVE'].includes(x.status))) errs.push(`${p.email} already has an open placement.`);
    if (errs.length) {
      fail('Placement not saved', errs.join(' '));
      return null;
    }
    const prefix = `${p.kind === 'INTERNSHIP' ? 'INT' : 'ATT'}-${year}-`;
    const created: Placement = { ...p, id: nextId(placements.map((x) => x.id), prefix), orgId: d.selectedOrgId, status: p.start <= today ? 'ACTIVE' : 'PLANNED', logbook: [], history: [hist('Placement created')] };
    setPlacements((xs) => [created, ...xs]);
    audit({ module: 'HR', by: actor, ref: created.id, action: `${p.kind === 'INTERNSHIP' ? 'Intern' : 'Attachee'} placed`, after: `${p.name}, ${p.department}` });
    notify({ module: 'HR', to: nameOf(p.supervisorStaffId), subject: `New ${p.kind === 'INTERNSHIP' ? 'intern' : 'attachee'} ${p.name} starts ${fmt(p.start)}`, ref: created.id });
    done(`${created.id} created`, `${p.name} (${p.institution}) in ${p.department}, ${fmt(p.start)} – ${fmt(p.end)}.`);
    return created;
  };
  const logPlacementWeek = (id: string, summary: string, hours: number) => {
    const p = placements.find((x) => x.id === id);
    if (!p) return false;
    if (p.status !== 'ACTIVE') return fail('Placement not active', 'Log book entries are made while the placement runs.');
    if (!summary.trim()) return fail('Summary needed', 'Describe the work done that week.');
    if (!(hours > 0 && hours <= 60)) return fail('Check the hours', 'Weekly hours must be between 1 and 60.');
    const week = (p.logbook.at(-1)?.week ?? 0) + 1;
    patchPlacement(id, (x) => ({ ...x, logbook: [...x.logbook, { week, summary: summary.trim(), hours }] }));
    return done(`Week ${week} logged`, `${p.name}: waiting for the supervisor’s signature.`);
  };
  const signPlacementWeek = (id: string, week: number) => {
    const p = placements.find((x) => x.id === id);
    const w = p?.logbook.find((x) => x.week === week);
    if (!p || !w) return false;
    if (w.signedBy) return fail('Already signed', `Signed by ${w.signedBy}.`);
    if (actorStaffId !== p.supervisorStaffId && !approver) return fail('Supervisor signs', `${nameOf(p.supervisorStaffId)} (the workplace supervisor) or a manager signs the log book.`);
    patchPlacement(id, (x) => ({ ...x, logbook: x.logbook.map((l) => (l.week === week ? { ...l, signedBy: actor, signedOn: today } : l)) }));
    return done(`Week ${week} signed`, p.name);
  };
  const evaluatePlacement = (id: string, scores: Record<string, number>, comment: string) => {
    const p = placements.find((x) => x.id === id);
    if (!p) return false;
    if (p.status !== 'ACTIVE') return fail('Placement not active', 'Evaluate before the placement is closed.');
    if (PLACEMENT_CRITERIA.some((c) => !(scores[c.id] >= 1 && scores[c.id] <= 5))) return fail('Score every criterion', 'Each criterion needs a score from 1 to 5.');
    if (!comment.trim()) return fail('Comment needed', 'Add the supervisor’s overall comment for the institution.');
    const overall = Math.round((PLACEMENT_CRITERIA.reduce((n, c) => n + scores[c.id], 0) / (PLACEMENT_CRITERIA.length * 5)) * 100);
    patchPlacement(id, (x) => ({ ...x, evaluation: { scores, overall, comment: comment.trim(), by: actor, on: today }, history: [...x.history, hist('Evaluated', `${overall}%`)] }));
    return done('Evaluation saved', `${p.name}: ${overall}% overall.`);
  };
  const completePlacement = (id: string) => {
    const p = placements.find((x) => x.id === id);
    if (!p || p.status !== 'ACTIVE') return false;
    if (!p.evaluation) return fail('Evaluation needed', 'Complete the end-of-placement evaluation first.');
    const unsigned = p.logbook.filter((l) => !l.signedBy);
    if (p.kind === 'ATTACHMENT' && (!p.logbook.length || unsigned.length)) return fail('Log book not signed', unsigned.length ? `Weeks ${unsigned.map((l) => l.week).join(', ')} still need the supervisor’s signature.` : 'The attachment log book has no entries.');
    const cert = `${p.kind === 'INTERNSHIP' ? 'INTC' : 'ATTC'}-${year}-${p.id.slice(-3)}`;
    patchPlacement(id, (x) => ({ ...x, status: 'COMPLETED', certificateNo: cert, end: x.end > today ? today : x.end, history: [...x.history, hist('Completed', `Certificate ${cert}`)] }));
    notify({ module: 'HR', to: p.name, address: p.email, subject: `Certificate of ${p.kind === 'INTERNSHIP' ? 'internship' : 'attachment'} ${cert}`, ref: p.id, channels: ['EMAIL'] });
    return done('Placement completed', `Certificate ${cert} issued to ${p.name}; the evaluation is ready for ${p.institution}.`);
  };
  const terminatePlacement = (id: string, reason: string) => {
    const p = placements.find((x) => x.id === id);
    if (!p || !['PLANNED', 'ACTIVE'].includes(p.status)) return false;
    if (!reason.trim()) return fail('Reason needed', 'Say why the placement ends early.');
    patchPlacement(id, (x) => ({ ...x, status: 'TERMINATED', end: today, history: [...x.history, hist('Ended early', reason.trim())] }));
    return done('Placement ended', `${p.name}: ${reason.trim()}`, 'info');
  };

  /* ---------------------------------------------------------------- welfare */

  const [welfareSchemes, setSchemes] = useState<WelfareScheme[]>(INITIAL_WELFARE_SCHEMES);
  const [welfareClaims, setWelfare] = useState<WelfareClaim[]>(INITIAL_WELFARE_CLAIMS);
  const saveWelfareScheme = (s: WelfareScheme) => {
    if (!approver) return fail('Manager approval', 'Welfare benefits are set by a manager.');
    if (!s.event.trim() || !(s.amountKes > 0) || s.minServiceMonths < 0 || s.maxPerYear < 1) return fail('Check the scheme', 'Event, an amount above zero, service months ≥ 0 and at least one claim a year.');
    const exists = welfareSchemes.some((x) => x.id === s.id);
    setSchemes((xs) => (exists ? xs.map((x) => (x.id === s.id ? s : x)) : [...xs, { ...s, id: s.id || `WS-${Date.now().toString(36).slice(-4).toUpperCase()}` }]));
    audit({ module: 'HR', by: actor, ref: s.id, action: exists ? 'Welfare benefit changed' : 'Welfare benefit added', after: `${s.event} ${kes(s.amountKes)}` });
    return done('Welfare benefit saved', `${s.event}: ${kes(s.amountKes)}.`);
  };
  const submitWelfareClaim: HcmStateSlice['submitWelfareClaim'] = (c) => {
    const e = emp(c.staffId);
    const s = welfareSchemes.find((x) => x.id === c.schemeId);
    const errs: string[] = [];
    if (!e || !s) errs.push('Choose the employee and the benefit.');
    else {
      const service = monthsBetweenIso(e.joinedDate, today);
      if (service < s.minServiceMonths) errs.push(`${s.event} needs ${s.minServiceMonths} months’ service; ${e.fullName} has ${Math.max(0, service)}.`);
      const used = welfareClaims.filter((x) => x.staffId === c.staffId && x.schemeId === c.schemeId && x.status !== 'REJECTED' && x.eventDate.startsWith(year)).length;
      if (used >= s.maxPerYear) errs.push(`${s.event} is limited to ${s.maxPerYear} claim${s.maxPerYear === 1 ? '' : 's'} a year.`);
    }
    if (!c.eventDate || c.eventDate > today) errs.push('The event date cannot be in the future.');
    else if (c.eventDate < addDaysIso(today, -90)) errs.push('Claims are made within 90 days of the event.');
    if (!c.details.trim()) errs.push('Describe the event.');
    if (errs.length) {
      fail('Welfare claim not submitted', errs.join(' '));
      return null;
    }
    const created: WelfareClaim = { ...c, details: c.details.trim(), id: nextId(welfareClaims.map((x) => x.id), 'WLF-', 4), amountKes: s!.amountKes, status: 'SUBMITTED', submittedBy: actor, submittedOn: today, history: [hist('Submitted')] };
    setWelfare((xs) => [created, ...xs]);
    notify({ module: 'HR', to: 'HR welfare committee', subject: `Welfare claim ${created.id}: ${s!.event} — ${e!.fullName}`, ref: created.id });
    done('Welfare claim submitted', `${created.id}: ${s!.event}, ${kes(s!.amountKes)}. Bring the ${s!.requiresDocument.toLowerCase()}.`);
    return created;
  };
  const decideWelfareClaim = (id: string, approve: boolean, note?: string) => {
    const c = welfareClaims.find((x) => x.id === id);
    if (!c || c.status !== 'SUBMITTED') return false;
    if (!checkApprover(c.submittedBy, 'welfare claim')) return false;
    if (actorStaffId === c.staffId) return fail('Segregation of duties', 'You cannot approve your own welfare claim.');
    if (!approve && !note?.trim()) return fail('Reason needed', 'Say why the claim is declined.');
    setWelfare((xs) => xs.map((x) => (x.id === id ? { ...x, status: approve ? 'HR_APPROVED' : 'REJECTED', history: [...x.history, hist(approve ? 'Approved' : 'Declined', note?.trim())] } : x)));
    notify({ module: 'HR', to: nameOf(c.staffId), subject: `Welfare claim ${id} ${approve ? 'approved' : 'declined'}`, body: note, ref: id });
    return done(approve ? 'Welfare claim approved' : 'Welfare claim declined', approve ? `${id} is ready to pay through payroll.` : `${nameOf(c.staffId)} will see your reason.`, approve ? 'success' : 'info');
  };
  const payWelfareClaim = (id: string) => {
    const c = welfareClaims.find((x) => x.id === id);
    if (!c || c.status !== 'HR_APPROVED') return fail('Not approved', 'Only approved claims are paid.');
    const s = welfareSchemes.find((x) => x.id === c.schemeId);
    const n = d.postPayItems([{ staffId: c.staffId, componentId: 'WELFARE_BENEFIT', amount: c.amountKes, period: d.payrollOpenPeriod.key, recurring: false, reference: `${id}: ${s?.event ?? 'Welfare benefit'}`, source: 'Manual' }], actor);
    if (!n) return false;
    setWelfare((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'PAID', paidRef: `Payroll ${d.payrollOpenPeriod.label}`, history: [...x.history, hist('Paid through payroll', d.payrollOpenPeriod.label)] } : x)));
    return done('Welfare benefit paid', `${kes(c.amountKes)} added to ${nameOf(c.staffId)}’s ${d.payrollOpenPeriod.label} payslip (not taxable).`);
  };

  /* ---------------------------------------------------------------- medical cover */

  const [medicalCovers, setCovers] = useState<MedicalCover[]>(INITIAL_MEDICAL_COVERS);
  const [medicalClaims, setMedClaims] = useState<MedicalClaim[]>(INITIAL_MEDICAL_CLAIMS);
  const enrolMedical = (c: Omit<MedicalCover, 'dependants'>) => {
    const e = emp(c.staffId);
    const s = MEDICAL_SCHEMES.find((x) => x.id === c.schemeId);
    if (!e || !s) return fail('Choose the employee and scheme', '');
    const g = gradeOf(e).slice(0, 5);
    if (!s.grades.includes(g)) return fail('Wrong category', `${e.fullName} is ${g}; ${s.name} (category ${s.category}) covers ${s.grades.join(', ')}.`);
    if (!c.memberNo.trim()) return fail('Member number needed', `Enter the ${s.insurer} member number.`);
    if (medicalCovers.some((x) => x.staffId === c.staffId)) return fail('Already covered', `${e.fullName} is already on a medical scheme.`);
    setCovers((xs) => [...xs, { ...c, memberNo: c.memberNo.trim(), dependants: [] }]);
    audit({ module: 'HR', by: actor, ref: c.staffId, action: 'Enrolled on medical cover', after: `${s.insurer} ${s.name}` });
    return done('Enrolled', `${e.fullName} on ${s.insurer} ${s.name} from ${fmt(c.start)}.`);
  };
  const addDependant = (staffId: string, dep: MedicalCover['dependants'][number]) => {
    const c = medicalCovers.find((x) => x.staffId === staffId);
    const s = MEDICAL_SCHEMES.find((x) => x.id === c?.schemeId);
    if (!c || !s) return fail('Not covered', 'Enrol the employee on a scheme first.');
    if (!dep.name.trim() || !dep.dob) return fail('Details needed', 'Dependant’s name and date of birth.');
    if (c.dependants.length >= s.maxDependants) return fail('Dependant limit', `${s.name} covers up to ${s.maxDependants} dependants.`);
    if (dep.relation === 'Spouse' && c.dependants.some((x) => x.relation === 'Spouse')) return fail('One spouse', 'A spouse is already on the cover.');
    if (dep.relation === 'Child' && Number(today.slice(0, 4)) - Number(dep.dob.slice(0, 4)) > 25) return fail('Age limit', 'Children are covered up to 25 years.');
    setCovers((xs) => xs.map((x) => (x.staffId === staffId ? { ...x, dependants: [...x.dependants, { ...dep, name: dep.name.trim() }] } : x)));
    return done('Dependant added', `${dep.name.trim()} (${dep.relation.toLowerCase()}) on ${nameOf(staffId)}’s cover.`);
  };
  const submitMedicalClaim: HcmStateSlice['submitMedicalClaim'] = (c) => {
    const cover = medicalCovers.find((x) => x.staffId === c.staffId);
    if (!cover) {
      fail('No medical cover', `${nameOf(c.staffId)} is not enrolled on a scheme.`);
      return null;
    }
    const allowed = [nameOf(c.staffId), ...cover.dependants.map((x) => x.name)];
    if (!allowed.includes(c.beneficiary)) {
      fail('Not a beneficiary', `${c.beneficiary} is not the member or a registered dependant.`);
      return null;
    }
    if (!(c.amountKes > 0) || !c.provider.trim() || !c.date || c.date > today) {
      fail('Check the claim', 'Provider, a past treatment date and an amount above zero are needed.');
      return null;
    }
    const created: MedicalClaim = { ...c, provider: c.provider.trim(), id: nextId(medicalClaims.map((x) => x.id), 'MCL-', 4), status: 'SUBMITTED' };
    setMedClaims((xs) => [created, ...xs]);
    done('Medical claim submitted', `${created.id}: ${kes(c.amountKes)} at ${c.provider}.`);
    return created;
  };
  const decideMedicalClaim = (id: string, approve: boolean, approvedKes?: number, note?: string) => {
    const c = medicalClaims.find((x) => x.id === id);
    if (!c || c.status !== 'SUBMITTED') return false;
    if (!checkApprover(nameOf(c.staffId), 'medical claim')) return false;
    const cover = medicalCovers.find((x) => x.staffId === c.staffId);
    if (approve) {
      const amt = approvedKes ?? c.amountKes;
      const left = limitOf(cover?.schemeId ?? '', c.benefit) - utilised(medicalClaims, c.staffId, c.benefit, c.date.slice(0, 4));
      if (!(amt > 0) || amt > c.amountKes) return fail('Check the amount', `Approve between KES 1 and ${kes(c.amountKes)}.`);
      if (amt > left) return fail('Over the limit', `Only ${kes(Math.max(0, left))} of the ${c.benefit.toLowerCase()} limit is left this year. Approve that amount or less.`);
      setMedClaims((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'APPROVED', approvedKes: amt, decidedBy: actor, note } : x)));
      return done('Claim approved', `${kes(amt)} for ${c.beneficiary}; ${kes(left - amt)} left on the ${c.benefit.toLowerCase()} benefit.`);
    }
    if (!note?.trim()) return fail('Reason needed', 'Say why the claim is declined.');
    setMedClaims((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'REJECTED', decidedBy: actor, note: note.trim() } : x)));
    return done('Claim declined', note.trim(), 'info');
  };

  /* ---------------------------------------------------------------- travel and imprest */

  const [travelRequests, setTravel] = useState<TravelRequest[]>(INITIAL_TRAVEL);
  const submitTravel: HcmStateSlice['submitTravel'] = (t) => {
    const e = emp(t.staffId);
    const errs: string[] = [];
    if (!e) errs.push('Choose the traveller.');
    if (!t.purpose.trim()) errs.push('State the purpose.');
    if (t.kind === 'TRAVEL') {
      if (!t.destination.trim()) errs.push('Enter the destination.');
      if (!t.from || !t.to || t.to < t.from) errs.push('The return date must be on or after departure.');
    }
    if (t.transportKes < 0 || t.otherKes < 0) errs.push('Amounts cannot be negative.');
    const rate = t.kind === 'TRAVEL' ? perDiemRate(t.destination, e) : { band: '', rate: 0 };
    const nights = t.kind === 'TRAVEL' ? nightsBetween(t.from, t.to) : 0;
    const total = rate.rate * nights + t.transportKes + t.otherKes;
    if (t.kind === 'PETTY_CASH' && total > PETTY_CASH_LIMIT_KES) errs.push(`Petty cash is limited to ${kes(PETTY_CASH_LIMIT_KES)} — raise an imprest instead.`);
    if (!(total > 0)) errs.push('The request has no amount.');
    const open = travelRequests.find((x) => x.staffId === t.staffId && x.kind === 'TRAVEL' && x.status === 'ISSUED' && addDaysIso(x.to, 7) < today);
    if (open) errs.push(`${open.id} has not been surrendered — clear it before a new imprest.`);
    const block = suspensionBlock(e, 'raise requests');
    if (block) errs.push(block);
    if (errs.length) {
      fail('Request not submitted', errs.join(' '));
      return null;
    }
    const prefix = t.kind === 'TRAVEL' ? `TRV-${year}-` : `PC-${year}-`;
    const created: TravelRequest = {
      ...t,
      purpose: t.purpose.trim(),
      destination: t.destination.trim() || e!.branch,
      from: t.from || today,
      to: t.to || t.from || today,
      id: nextId(travelRequests.map((x) => x.id), prefix),
      orgId: e!.orgId,
      nights,
      perDiemRate: rate.rate,
      perDiemKes: rate.rate * nights,
      totalKes: total,
      status: 'SUBMITTED',
      requestedBy: e!.fullName,
      history: [hist('Submitted')]
    };
    setTravel((xs) => [created, ...xs]);
    const sup = supervisorFor(e!, d.hrEmployees);
    notify({ module: 'HR', to: sup?.fullName ?? 'Line manager', address: sup?.email, subject: `Approve ${t.kind === 'TRAVEL' ? 'travel' : 'petty cash'} ${created.id} — ${e!.fullName}, ${kes(total)}`, ref: created.id });
    done('Request submitted', `${created.id}: ${kes(total)}${nights ? ` (${nights} night${nights === 1 ? '' : 's'} at ${kes(rate.rate)})` : ''}. ${sup?.fullName ?? 'The line manager'} approves first, then Finance.`);
    return created;
  };
  const decideTravel = (id: string, approve: boolean, note?: string, issueRef?: string) => {
    const t = travelRequests.find((x) => x.id === id);
    if (!t || !['SUBMITTED', 'MANAGER_APPROVED'].includes(t.status)) return false;
    if (!checkApprover(t.requestedBy, 'request')) return false;
    if (!approve) {
      if (!note?.trim()) return fail('Reason needed', 'Say why the request is declined.');
      setTravel((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'REJECTED', history: [...x.history, hist('Declined', note.trim())] } : x)));
      notify({ module: 'HR', to: t.requestedBy, subject: `${id} declined`, body: note.trim(), ref: id });
      return done('Request declined', `${t.requestedBy} will see your reason.`, 'info');
    }
    if (t.status === 'SUBMITTED') {
      setTravel((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'MANAGER_APPROVED', managerBy: actor, history: [...x.history, hist('Manager approved', note?.trim())] } : x)));
      notify({ module: 'Finance', to: 'Finance — imprest desk', subject: `Issue ${t.kind === 'TRAVEL' ? 'imprest' : 'petty cash'} ${id}: ${kes(t.totalKes)} to ${t.requestedBy}`, ref: id });
      return done('Manager approval recorded', `${id} goes to Finance to issue ${kes(t.totalKes)}.`);
    }
    if (t.managerBy === actor) return fail('Segregation of duties', 'The manager who approved the request cannot also issue the money.');
    setTravel((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'ISSUED', financeBy: actor, issueRef, history: [...x.history, hist('Issued', issueRef)] } : x)));
    notify({ module: 'HR', to: t.requestedBy, subject: `${id}: ${kes(t.totalKes)} issued — surrender within 7 days of return`, ref: id });
    return done('Imprest issued', `${kes(t.totalKes)} to ${t.requestedBy}${issueRef ? ` (${issueRef})` : ''}. Surrender is due by ${fmt(addDaysIso(t.to, 7))}.`);
  };
  const surrenderTravel = (id: string, spentKes: number, receipts: number, ref?: string) => {
    const t = travelRequests.find((x) => x.id === id);
    if (!t || t.status !== 'ISSUED') return fail('Not issued', 'Only issued imprests are surrendered.');
    if (spentKes < 0 || receipts < 0) return fail('Check the figures', 'Amounts and receipt count cannot be negative.');
    if (spentKes > 0 && receipts < 1) return fail('Receipts needed', 'Attach at least one receipt for the money spent.');
    const balance = t.totalKes - spentKes;
    const topUp = balance < 0;
    if (topUp) {
      const n = d.postPayItems([{ staffId: t.staffId, componentId: 'REIMBURSEMENT', amount: -balance, period: d.payrollOpenPeriod.key, recurring: false, reference: `${id}: spent above the imprest`, source: 'Manual' }], actor);
      if (!n) return false;
    }
    setTravel((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'CLOSED', surrender: { spentKes, receipts, balanceKes: balance, on: today, ref, payrollTopUp: topUp }, history: [...x.history, hist('Surrendered', `Spent ${kes(spentKes)}; ${balance >= 0 ? `refund ${kes(balance)}` : `owed ${kes(-balance)}`}`)] } : x)));
    return done(
      'Imprest surrendered',
      balance > 0 ? `${kes(balance)} to be refunded to the cashier.` : balance < 0 ? `${kes(-balance)} overspend reimbursed through the ${d.payrollOpenPeriod.label} payroll.` : 'Spent in full — closed.'
    );
  };

  /* ---------------------------------------------------------------- CSR and events */

  const [csrActivities, setCsr] = useState<CsrActivity[]>(INITIAL_CSR);
  const saveCsr: HcmStateSlice['saveCsr'] = (c) => {
    if (!c.title.trim() || !c.community.trim() || !c.date) {
      fail('CSR activity not saved', 'Title, community and date are needed.');
      return null;
    }
    if (!(c.budgetKes > 0)) {
      fail('Budget needed', 'Enter the budget for the activity.');
      return null;
    }
    const existing = c.id ? csrActivities.find((x) => x.id === c.id) : undefined;
    if (existing && existing.status !== 'PLANNED') {
      fail('Already approved', 'Approved activities cannot be edited; cancel and re-plan instead.');
      return null;
    }
    const row: CsrActivity = existing
      ? { ...existing, ...c, title: c.title.trim(), history: [...existing.history, hist('Edited')] }
      : { ...c, title: c.title.trim(), id: nextId(csrActivities.map((x) => x.id), `CSR-${year}-`, 2), orgId: d.selectedOrgId, status: 'PLANNED', proposedBy: actor, volunteerHours: 0, history: [hist('Proposed')] };
    setCsr((xs) => (existing ? xs.map((x) => (x.id === row.id ? row : x)) : [row, ...xs]));
    done(existing ? 'CSR activity updated' : 'CSR activity proposed', `${row.id}: ${row.title}, budget ${kes(row.budgetKes)}. A manager approves it.`);
    return row;
  };
  const decideCsr = (id: string, approve: boolean, note?: string) => {
    const c = csrActivities.find((x) => x.id === id);
    if (!c || c.status !== 'PLANNED') return false;
    if (!checkApprover(c.proposedBy, 'CSR activity')) return false;
    if (!approve && !note?.trim()) return fail('Reason needed', 'Say why it is not going ahead.');
    setCsr((xs) => xs.map((x) => (x.id === id ? { ...x, status: approve ? 'APPROVED' : 'CANCELLED', approvedBy: approve ? actor : undefined, history: [...x.history, hist(approve ? 'Approved' : 'Cancelled', note?.trim())] } : x)));
    return done(approve ? 'CSR activity approved' : 'CSR activity cancelled', c.title, approve ? 'success' : 'info');
  };
  const completeCsr: HcmStateSlice['completeCsr'] = (id, r) => {
    const c = csrActivities.find((x) => x.id === id);
    if (!c || c.status !== 'APPROVED') return fail('Not approved', 'Only approved activities are reported.');
    if (c.date > today) return fail('Not yet held', `${c.title} is on ${fmt(c.date)}.`);
    if (r.actualKes < 0 || r.volunteerHours < 0 || r.beneficiaries < 0 || !r.outcome.trim()) return fail('Report incomplete', 'Actual cost, hours, beneficiaries and the outcome are needed.');
    setCsr((xs) => xs.map((x) => (x.id === id ? { ...x, ...r, outcome: r.outcome.trim(), status: 'DONE', history: [...x.history, hist('Completed', r.outcome.trim())] } : x)));
    return done('CSR activity reported', `${c.title}: ${kes(r.actualKes)} of ${kes(c.budgetKes)}${r.actualKes > c.budgetKes ? ' — over budget' : ''}.`, r.actualKes > c.budgetKes ? 'warning' : 'success');
  };

  const [hrEvents, setEvents] = useState<HrEvent[]>(INITIAL_EVENTS);
  const patchEvent = (id: string, f: (e: HrEvent) => HrEvent) => setEvents((xs) => xs.map((x) => (x.id === id ? f(x) : x)));
  const saveEvent: HcmStateSlice['saveEvent'] = (ev) => {
    if (!ev.title.trim() || !ev.venue.trim() || !ev.date) {
      fail('Event not saved', 'Title, venue and date are needed.');
      return null;
    }
    if (ev.date < today) {
      fail('Date passed', 'Plan events for today or later.');
      return null;
    }
    if (!(ev.budgetKes >= 0)) {
      fail('Budget', 'The budget cannot be negative.');
      return null;
    }
    const existing = ev.id ? hrEvents.find((x) => x.id === ev.id) : undefined;
    if (existing && !['DRAFT'].includes(existing.status)) {
      fail('Already submitted', 'Only draft events can be edited.');
      return null;
    }
    const row: HrEvent = existing
      ? { ...existing, ...ev, title: ev.title.trim(), history: [...existing.history, hist('Edited')] }
      : { ...ev, title: ev.title.trim(), id: nextId(hrEvents.map((x) => x.id), `EVT-${year}-`, 2), orgId: d.selectedOrgId, status: 'DRAFT', organiser: actor, rsvp: {}, history: [hist('Created')] };
    setEvents((xs) => (existing ? xs.map((x) => (x.id === row.id ? row : x)) : [row, ...xs]));
    done(existing ? 'Event updated' : 'Event created', `${row.id}: ${row.title}, ${fmt(row.date)}.`);
    return row;
  };
  const submitEvent = (id: string) => {
    const ev = hrEvents.find((x) => x.id === id);
    if (!ev || ev.status !== 'DRAFT') return false;
    if (!ev.tasks.length) return fail('Plan the tasks', 'Add at least one task with an owner before submitting.');
    patchEvent(id, (x) => ({ ...x, status: 'SUBMITTED', history: [...x.history, hist('Submitted')] }));
    return done('Event submitted', `${ev.title} waits for a manager’s approval of ${kes(ev.budgetKes)}.`);
  };
  const decideEvent = (id: string, approve: boolean, note?: string) => {
    const ev = hrEvents.find((x) => x.id === id);
    if (!ev || ev.status !== 'SUBMITTED') return false;
    if (!checkApprover(ev.organiser, 'event')) return false;
    if (!approve && !note?.trim()) return fail('Reason needed', 'Say why the event is not approved.');
    patchEvent(id, (x) => ({ ...x, status: approve ? 'APPROVED' : 'DRAFT', approvedBy: approve ? actor : undefined, history: [...x.history, hist(approve ? 'Approved' : 'Returned', note?.trim())] }));
    if (approve) ev.invitees.forEach((s) => notify({ module: 'HR', to: nameOf(s), address: emp(s)?.email, subject: `You are invited: ${ev.title}, ${fmt(ev.date)} at ${ev.venue}`, ref: id }));
    return done(approve ? 'Event approved' : 'Event returned', approve ? `${ev.invitees.length} invitations sent.` : 'Back to the organiser.', approve ? 'success' : 'info');
  };
  const toggleEventTask = (id: string, index: number) => patchEvent(id, (x) => ({ ...x, tasks: x.tasks.map((t, i) => (i === index ? { ...t, done: !t.done } : t)) }));
  const rsvpEvent = (id: string, staffId: string, answer: 'YES' | 'NO') => {
    const ev = hrEvents.find((x) => x.id === id);
    if (!ev || ev.status !== 'APPROVED') return fail('Not open', 'RSVPs open once the event is approved.');
    if (!ev.invitees.includes(staffId)) return fail('Not invited', `${nameOf(staffId)} is not on the invitation list.`);
    patchEvent(id, (x) => ({ ...x, rsvp: { ...x.rsvp, [staffId]: answer } }));
    return done('RSVP recorded', `${nameOf(staffId)}: ${answer === 'YES' ? 'attending' : 'not attending'}.`);
  };
  const closeEvent = (id: string, actualKes: number) => {
    const ev = hrEvents.find((x) => x.id === id);
    if (!ev || ev.status !== 'APPROVED') return false;
    if (ev.date > today) return fail('Not yet held', `${ev.title} is on ${fmt(ev.date)}.`);
    if (!(actualKes >= 0)) return fail('Actual cost', 'Enter what the event cost.');
    const open = ev.tasks.filter((t) => !t.done).length;
    if (open) return fail('Tasks open', `${open} task${open === 1 ? '' : 's'} still open.`);
    patchEvent(id, (x) => ({ ...x, status: 'HELD', actualKes, history: [...x.history, hist('Held', kes(actualKes))] }));
    return done('Event closed', `${ev.title}: ${kes(actualKes)} of ${kes(ev.budgetKes)}.`);
  };

  /* ---------------------------------------------------------------- outsourced labour */

  const [outsourcedContracts, setOutsourced] = useState<OutsourcedContract[]>(INITIAL_OUTSOURCED);
  const saveOutsourced: HcmStateSlice['saveOutsourced'] = (c) => {
    const errs: string[] = [];
    if (!c.contractor.trim() || !c.service.trim() || !c.contractNo.trim() || !c.site.trim()) errs.push('Contractor, service, contract number and site are needed.');
    if (!c.start || !c.end || c.end <= c.start) errs.push('The end date must be after the start.');
    if (!(c.rateKes > 0)) errs.push('Enter the contract rate.');
    if (outsourcedContracts.some((x) => x.contractNo.toLowerCase() === c.contractNo.trim().toLowerCase())) errs.push(`Contract ${c.contractNo} is already recorded.`);
    if (outsourcedContracts.some((x) => x.status === 'ACTIVE' && x.contractor.toLowerCase() === c.contractor.trim().toLowerCase() && x.service.toLowerCase() === c.service.trim().toLowerCase() && x.end >= c.start)) errs.push('This contractor already has an active contract for the same service in that period.');
    if (errs.length) {
      fail('Contract not saved', errs.join(' '));
      return null;
    }
    const row: OutsourcedContract = { ...c, contractor: c.contractor.trim(), service: c.service.trim(), contractNo: c.contractNo.trim(), id: nextId(outsourcedContracts.map((x) => x.id), 'OSC-'), orgId: d.selectedOrgId, status: 'ACTIVE', headcount: [], history: [hist('Contract recorded')] };
    setOutsourced((xs) => [row, ...xs]);
    done('Contract recorded', `${row.contractor} — ${row.service}, ${fmt(row.start)} to ${fmt(row.end)}.`);
    return row;
  };
  const recordHeadcount = (id: string, month: string, planned: number, actual: number, days?: number) => {
    const c = outsourcedContracts.find((x) => x.id === id);
    if (!c || c.status !== 'ACTIVE') return fail('Contract not active', 'Numbers are recorded for active contracts.');
    if (!/^\d{4}-\d{2}$/.test(month) || month < c.start.slice(0, 7) || month > c.end.slice(0, 7)) return fail('Outside the contract', `Record months from ${c.start.slice(0, 7)} to ${c.end.slice(0, 7)}.`);
    if (planned < 0 || actual < 0) return fail('Check the numbers', 'Headcounts cannot be negative.');
    if (c.rateBasis === 'PER_MANDAY' && !(days && days > 0 && days <= 31)) return fail('Days worked', 'Day-rated contracts need the days worked (1–31).');
    setOutsourced((xs) => xs.map((x) => (x.id === id ? { ...x, headcount: [...x.headcount.filter((h) => h.month !== month), { month, planned, actual, days }].sort((a, b) => a.month.localeCompare(b.month)) } : x)));
    return done('Numbers recorded', `${c.contractor} ${month}: ${actual} engaged against ${planned} planned.`);
  };
  const renewOutsourced = (id: string, end: string) => {
    const c = outsourcedContracts.find((x) => x.id === id);
    if (!c || c.status !== 'ACTIVE') return false;
    if (!approver) return fail('Manager approval', 'Contract renewals are approved by a manager.');
    if (!end || end <= c.end) return fail('Check the date', `The new end date must be after ${fmt(c.end)}.`);
    setOutsourced((xs) => xs.map((x) => (x.id === id ? { ...x, end, history: [...x.history, hist('Renewed', `to ${end}`)] } : x)));
    return done('Contract renewed', `${c.contractor} to ${fmt(end)}.`);
  };
  const terminateOutsourced = (id: string, reason: string) => {
    const c = outsourcedContracts.find((x) => x.id === id);
    if (!c || c.status !== 'ACTIVE') return false;
    if (!approver) return fail('Manager approval', 'Ending a contract needs a manager.');
    if (!reason.trim()) return fail('Reason needed', 'Say why the contract ends.');
    setOutsourced((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'TERMINATED', end: today < x.end ? today : x.end, history: [...x.history, hist('Terminated', reason.trim())] } : x)));
    return done('Contract ended', `${c.contractor}: ${reason.trim()}`, 'info');
  };

  /* ---------------------------------------------------------------- library */

  const [libraryBooks, setBooks] = useState<LibraryBook[]>(INITIAL_BOOKS);
  const [libraryLoans, setLoans] = useState<LibraryLoan[]>(INITIAL_LOANS);
  const addBook = (b: Omit<LibraryBook, 'id'>) => {
    const isbn = b.isbn.replace(/[-\s]/g, '');
    if (!b.title.trim() || !b.author.trim()) return fail('Book not added', 'Title and author are needed.');
    if (!/^(\d{9}[\dX]|\d{13})$/.test(isbn)) return fail('Check the ISBN', 'ISBN-10 or ISBN-13, digits only.');
    if (!(b.copies >= 1)) return fail('Copies', 'At least one copy.');
    if (libraryBooks.some((x) => x.isbn === isbn)) return fail('Already catalogued', 'Add copies to the existing record instead.');
    setBooks((xs) => [...xs, { ...b, isbn, title: b.title.trim(), author: b.author.trim(), id: nextId(xs.map((x) => x.id), 'BK-') }]);
    return done('Book catalogued', `${b.title.trim()} (${b.copies} cop${b.copies === 1 ? 'y' : 'ies'}).`);
  };
  const lendBook = (bookId: string, staffId: string) => {
    const b = libraryBooks.find((x) => x.id === bookId);
    const e = emp(staffId);
    if (!b || !e) return fail('Choose the book and borrower', '');
    if (e.status === 'TERMINATED') return fail('Not an employee', `${e.fullName} has left.`);
    const out = libraryLoans.filter((l) => l.bookId === bookId && !l.returned).length;
    if (out >= b.copies) return fail('No copy available', `All ${b.copies} cop${b.copies === 1 ? 'y is' : 'ies are'} on loan.`);
    const mine = libraryLoans.filter((l) => l.staffId === staffId && !l.returned);
    if (mine.length >= MAX_LOANS) return fail('Loan limit', `${e.fullName} already has ${MAX_LOANS} books out.`);
    if (mine.some((l) => l.due < today)) return fail('Overdue book', `${e.fullName} must return overdue books first.`);
    const loan: LibraryLoan = { id: nextId(libraryLoans.map((l) => l.id), 'LN-B-'), bookId, staffId, out: today, due: addDaysIso(today, LOAN_DAYS) };
    setLoans((xs) => [loan, ...xs]);
    return done('Book lent', `${b.title} to ${e.fullName}, due ${fmt(loan.due)}.`);
  };
  const returnBook = (loanId: string) => {
    const l = libraryLoans.find((x) => x.id === loanId);
    if (!l || l.returned) return false;
    const fine = loanFine(l, today);
    setLoans((xs) => xs.map((x) => (x.id === loanId ? { ...x, returned: today, fineKes: fine } : x)));
    return done('Book returned', fine ? `${kes(fine)} overdue fine for ${nameOf(l.staffId)}.` : `${nameOf(l.staffId)} — on time.`, fine ? 'warning' : 'success');
  };
  const renewLoan = (loanId: string) => {
    const l = libraryLoans.find((x) => x.id === loanId);
    if (!l || l.returned) return false;
    if (l.renewed) return fail('Renewed once', 'A loan can be renewed only once.');
    if (l.due < today) return fail('Overdue', 'Overdue books must be returned, not renewed.');
    setLoans((xs) => xs.map((x) => (x.id === loanId ? { ...x, due: addDaysIso(x.due, LOAN_DAYS), renewed: true } : x)));
    return done('Loan renewed', `Now due ${fmt(addDaysIso(l.due, LOAN_DAYS))}.`);
  };

  /* ---------------------------------------------------------------- talent and succession */

  const [idps, setIdps] = useState<Idp[]>(INITIAL_IDPS);
  const saveIdp: HcmStateSlice['saveIdp'] = (p) => {
    if (!emp(p.staffId)) {
      fail('Choose the employee', '');
      return null;
    }
    if (!p.targetRole.trim() || !p.goals.trim()) {
      fail('Plan incomplete', 'Target role and development goals are needed.');
      return null;
    }
    if (!p.reviewDate || p.reviewDate <= today) {
      fail('Review date', 'Set a review date in the future.');
      return null;
    }
    const existing = p.id ? idps.find((x) => x.id === p.id) : idps.find((x) => x.staffId === p.staffId && x.status !== 'CLOSED');
    if (existing && p.id === undefined) {
      fail('Plan exists', `${nameOf(p.staffId)} already has ${existing.id}; edit it instead.`);
      return null;
    }
    const row: Idp = existing ? { ...existing, ...p, status: 'DRAFT', history: [...existing.history, hist('Edited — needs agreement again')] } : { ...p, id: nextId(idps.map((x) => x.id), `IDP-${year}-`), actions: [], status: 'DRAFT', history: [hist('Drafted')] };
    setIdps((xs) => (existing ? xs.map((x) => (x.id === row.id ? row : x)) : [row, ...xs]));
    done('Development plan saved', `${row.id} for ${nameOf(p.staffId)} — the manager agrees it next.`);
    return row;
  };
  const agreeIdp = (id: string) => {
    const p = idps.find((x) => x.id === id);
    if (!p || p.status !== 'DRAFT') return false;
    if (actorStaffId === p.staffId) return fail('Segregation of duties', 'Your own plan is agreed by your manager.');
    if (!approver) return fail('Manager agrees', 'A manager agrees the development plan.');
    if (!p.actions.length) return fail('No actions', 'Add at least one development action.');
    setIdps((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'AGREED', agreedBy: actor, history: [...x.history, hist('Agreed')] } : x)));
    return done('Plan agreed', `${nameOf(p.staffId)}: ${p.actions.length} action${p.actions.length === 1 ? '' : 's'}, review ${fmt(p.reviewDate)}.`);
  };
  const addIdpAction = (id: string, a: Omit<IdpAction, 'id' | 'status'>) => {
    const p = idps.find((x) => x.id === id);
    if (!p || p.status === 'CLOSED') return false;
    if (!a.action.trim() || !a.due) return fail('Action incomplete', 'Describe the action and when it is due.');
    const action: IdpAction = { ...a, action: a.action.trim(), id: `A${p.actions.length + 1}`, status: 'OPEN' };
    setIdps((xs) => xs.map((x) => (x.id === id ? { ...x, actions: [...x.actions, action] } : x)));
    // Training actions go straight into the training plan
    if (a.type === 'Training' || a.type === 'Certification') d.addTrainingNeed({ staffId: p.staffId, skill: action.action, reason: `Development plan ${id} — towards ${p.targetRole}`, source: 'Manager', ref: id, priority: 'Medium' });
    return done('Action added', a.type === 'Training' || a.type === 'Certification' ? `${action.action} is also in Training › Training needs.` : action.action);
  };
  const completeIdpAction = (id: string, actionId: string) => {
    setIdps((xs) => xs.map((x) => (x.id === id ? { ...x, actions: x.actions.map((a) => (a.id === actionId ? { ...a, status: a.status === 'DONE' ? 'OPEN' : 'DONE' } : a)) } : x)));
    return true;
  };
  const [successionPlans, setPlans] = useState<SuccessionPlan[]>(INITIAL_SUCCESSION);
  const saveSuccessionPlan: HcmStateSlice['saveSuccessionPlan'] = (p) => {
    if (!approver) return fail('Manager only', 'Succession plans are kept by managers and HR leadership.');
    if (!p.position.trim() || !p.incumbentStaffId) return fail('Plan incomplete', 'Position and incumbent are needed.');
    if (p.successors.some((s) => s.staffId === p.incumbentStaffId)) return fail('Check successors', 'The incumbent cannot be their own successor.');
    if (new Set(p.successors.map((s) => s.staffId)).size !== p.successors.length) return fail('Check successors', 'Each successor once.');
    if (p.successors.some((s) => emp(s.staffId)?.status === 'TERMINATED')) return fail('Check successors', 'A successor has left the company.');
    const existing = p.id ? successionPlans.find((x) => x.id === p.id) : undefined;
    if (!existing && successionPlans.some((x) => x.orgId === d.selectedOrgId && x.position.toLowerCase() === p.position.trim().toLowerCase())) return fail('Plan exists', `${p.position} already has a succession plan.`);
    const row: SuccessionPlan = { ...existing, ...p, position: p.position.trim(), id: existing?.id ?? nextId(successionPlans.map((x) => x.id), 'SP-'), orgId: existing?.orgId ?? d.selectedOrgId, reviewedOn: today, reviewedBy: actor };
    setPlans((xs) => (existing ? xs.map((x) => (x.id === row.id ? row : x)) : [row, ...xs]));
    audit({ module: 'HR', by: actor, ref: row.id, action: 'Succession plan reviewed', after: `${row.position}: ${row.successors.length} successors` });
    const ready = row.successors.some((s) => s.readiness !== '3_PLUS_YEARS');
    return done('Succession plan saved', row.critical && !ready ? `${row.position} is critical with no successor ready within two years — a gap to close.` : `${row.position}: ${row.successors.length} successor${row.successors.length === 1 ? '' : 's'}.`, row.critical && !ready ? 'warning' : 'success');
  };

  /* ---------------------------------------------------------------- PPE requisitions */

  const [ppeRequests, setPpeReq] = useState<PpeRequest[]>(INITIAL_PPE_REQUESTS);
  const [ppeStock, setPpeStock] = useState<Record<string, number>>(INITIAL_PPE_STOCK);
  const requestPpe: HcmStateSlice['requestPpe'] = (r) => {
    const items = r.items.filter((i) => i.item && i.qty > 0);
    if (!r.staffIds.length) {
      fail('Who is it for?', 'Choose at least one employee.');
      return null;
    }
    if (!items.length || items.some((i) => !PPE_ITEMS[i.item])) {
      fail('Items needed', 'Add at least one PPE item and quantity.');
      return null;
    }
    if (!r.reason.trim()) {
      fail('Reason needed', 'Say why the PPE is needed (new starter, replacement, damaged…).');
      return null;
    }
    const created: PpeRequest = { ...r, items, reason: r.reason.trim(), id: nextId(ppeRequests.map((x) => x.id), 'PPR-', 4), orgId: d.selectedOrgId, status: 'REQUESTED', requestedBy: actor, history: [hist('Requested')] };
    setPpeReq((xs) => [created, ...xs]);
    notify({ module: 'OSH', to: 'Safety officer', subject: `PPE requisition ${created.id} for ${r.staffIds.length} people`, ref: created.id });
    done('PPE requested', `${created.id} goes to the safety officer for approval.`);
    return created;
  };
  const decidePpe = (id: string, approve: boolean, note?: string) => {
    const r = ppeRequests.find((x) => x.id === id);
    if (!r || r.status !== 'REQUESTED') return false;
    if (!checkApprover(r.requestedBy, 'PPE requisition')) return false;
    if (!approve && !note?.trim()) return fail('Reason needed', 'Say why the PPE is not approved.');
    setPpeReq((xs) => xs.map((x) => (x.id === id ? { ...x, status: approve ? 'APPROVED' : 'REJECTED', approvedBy: actor, history: [...x.history, hist(approve ? 'Approved' : 'Rejected', note?.trim())] } : x)));
    return done(approve ? 'PPE approved' : 'PPE rejected', approve ? `${id} can be issued from the PPE store.` : note!.trim(), approve ? 'success' : 'info');
  };
  const issuePpeRequest = (id: string) => {
    const r = ppeRequests.find((x) => x.id === id);
    if (!r || r.status !== 'APPROVED') return fail('Not approved', 'PPE is issued after approval.');
    const short = r.items.filter((i) => (ppeStock[i.item] ?? 0) < i.qty * r.staffIds.length);
    if (short.length) return fail('Not enough stock', short.map((i) => `${PPE_ITEMS[i.item].name}: need ${i.qty * r.staffIds.length}, ${ppeStock[i.item] ?? 0} in store`).join('; '));
    const lines = r.staffIds.flatMap((staffId) => r.items.map((i) => ({ staffId, itemId: i.item, size: PPE_ITEMS[i.item].sizes[0], qty: i.qty, issuedOn: today, reason: 'NEW' as const })));
    d.issuePpe(lines);
    setPpeStock((s) => {
      const next = { ...s };
      r.items.forEach((i) => (next[i.item] = (next[i.item] ?? 0) - i.qty * r.staffIds.length));
      return next;
    });
    setPpeReq((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'ISSUED', issuedBy: actor, history: [...x.history, hist('Issued from store')] } : x)));
    return done('PPE issued', `${lines.length} issue line${lines.length === 1 ? '' : 's'} on the PPE register; store stock reduced.`);
  };
  const receivePpeStock = (item: string, qty: number) => {
    if (!PPE_ITEMS[item]) return fail('Choose the item', '');
    if (!(qty > 0)) return fail('Quantity', 'Receive at least one.');
    setPpeStock((s) => ({ ...s, [item]: (s[item] ?? 0) + qty }));
    return done('Stock received', `${qty} × ${PPE_ITEMS[item].name}.`);
  };

  /* ---------------------------------------------------------------- OSH audits and monitoring */

  const [auditFindings, setFindings] = useState<AuditFinding[]>(INITIAL_FINDINGS);
  const addFinding = (f: Omit<AuditFinding, 'id' | 'orgId' | 'status'>) => {
    if (!f.audit.trim() || !f.auditor.trim() || !f.finding.trim() || !f.owner.trim() || !f.due) return fail('Finding incomplete', 'Audit, auditor, finding, owner and due date are needed.');
    setFindings((xs) => [{ ...f, id: nextId(xs.map((x) => x.id), 'AF-', 4), orgId: d.selectedOrgId, status: 'OPEN' }, ...xs]);
    notify({ module: 'OSH', to: f.owner, subject: `Audit finding to close by ${fmt(f.due)}: ${f.finding}`, level: f.severity === 'Major' ? 'warning' : 'info' });
    return done('Finding recorded', `${f.severity}: owner ${f.owner}, due ${fmt(f.due)}.`);
  };
  const closeFinding = (id: string, evidence: string) => {
    const f = auditFindings.find((x) => x.id === id);
    if (!f || f.status !== 'OPEN') return false;
    if (!evidence.trim()) return fail('Evidence needed', 'Describe the corrective action and the evidence it is done.');
    if (actor !== f.owner && !approver) return fail('Owner or manager', `${f.owner} or a manager closes this finding.`);
    setFindings((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'CLOSED', evidence: evidence.trim(), closedOn: today, closedBy: actor } : x)));
    return done('Finding closed', f.finding);
  };
  const [envMeasurements, setEnv] = useState<WorkEnvMeasurement[]>(INITIAL_ENV);
  const addMeasurement: HcmStateSlice['addMeasurement'] = (m) => {
    if (!m.location.trim() || !m.date || m.date > today || !Number.isFinite(m.value) || m.value < 0) return fail('Check the reading', 'Location, a past date and a value of zero or more.');
    const lim = ENV_LIMITS[m.parameter];
    setEnv((xs) => [{ ...m, location: m.location.trim(), id: nextId(xs.map((x) => x.id), 'WE-'), orgId: d.selectedOrgId, ...lim, by: actor }, ...xs]);
    const breach = lim.limitIs === 'MAX' ? m.value > lim.limit : m.value < lim.limit;
    if (breach) notify({ module: 'OSH', to: 'Safety officer', subject: `${m.parameter} at ${m.location}: ${m.value} against the ${lim.limitIs === 'MAX' ? 'maximum' : 'minimum'} of ${lim.limit}`, level: 'warning' });
    return done('Reading recorded', breach ? `Outside the limit (${lim.limit}) — PPE and controls needed.` : 'Within the limit.', breach ? 'warning' : 'success');
  };

  /* ---------------------------------------------------------------- salary structure, GL mapping, bank files */

  const [salaryStructures, setStructures] = useState<SalaryStructure[]>([]);
  const saveSalaryStructure = (rules: GradeRule[], effectiveFrom: string) => {
    if (!approver) return fail('Manager approval', 'Salary structure changes are approved by a manager.');
    const errs = validateGradeRules(rules);
    if (errs.length) return fail('Structure not saved', errs.join(' '));
    if (!/^\d{4}-\d{2}$/.test(effectiveFrom) || effectiveFrom < d.payrollOpenPeriod.key) return fail('Paid months', `Changes start from ${d.payrollOpenPeriod.label} or later.`);
    const version = Math.max(0, ...salaryStructures.filter((s) => s.orgId === d.selectedOrgId).map((s) => s.version)) + 1;
    const next = [...salaryStructures.filter((s) => !(s.orgId === d.selectedOrgId && s.effectiveFrom === effectiveFrom)), { orgId: d.selectedOrgId, rules, version, effectiveFrom, changedBy: actor, changedOn: today }];
    setStructures(next);
    setSalaryStructures(next);
    d.noteRatesChanged();
    audit({ module: 'Payroll', by: actor, ref: `Salary structure v${version}`, action: 'Salary structure saved', after: `from ${effectiveFrom}` });
    return done('Salary structure saved', `Version ${version} applies from ${effectiveFrom}; payslips from then use its allowances.`);
  };
  const [glMaps, setGlMaps] = useState<Record<string, PayrollGlMap>>({});
  const saveGlMap = (map: PayrollGlMap) => {
    if (!approver) return fail('Manager approval', 'The payroll GL mapping is changed by a manager.');
    const accts = [map.salaries, map.employerCosts, map.casualWages, map.paye, map.statutory, map.otherDeductions, map.netPay];
    if (accts.some((a) => !/^\d{4}$/.test(a))) return fail('Check the accounts', 'Every account is a 4-digit code from the chart of accounts.');
    const before = glMaps[d.selectedOrgId] ?? DEFAULT_GL_MAP;
    setGlMaps((m) => ({ ...m, [d.selectedOrgId]: map }));
    audit({ module: 'Payroll', by: actor, action: 'Payroll GL mapping changed', before: JSON.stringify(before.costCentre).slice(0, 80), after: JSON.stringify(map.costCentre).slice(0, 80) });
    return done('GL mapping saved', 'The next payroll journal posts with these accounts and cost centres.');
  };
  const [dmeLogs, setDme] = useState<DmeLog[]>([]);
  const recordDme: HcmStateSlice['recordDme'] = (x) => {
    if (!x.lines) {
      fail('Nothing to pay', 'No employees are paid on this rail in the period.');
      return null;
    }
    if (!x.debitAccount.trim()) {
      fail('Debit account', 'Enter the company account the bank debits.');
      return null;
    }
    const row: DmeLog = { ...x, id: nextId(dmeLogs.map((l) => l.id), 'DME-', 4), orgId: d.selectedOrgId, by: actor, at: new Date().toISOString().slice(0, 16).replace('T', ' '), status: 'GENERATED' };
    setDme((xs) => [row, ...xs]);
    audit({ module: 'Payroll', by: actor, ref: row.id, action: 'Bank file generated', after: `${x.format} ${x.lines} lines ${kes(x.totalKes)} #${x.hash}` });
    done('Bank file generated', `${row.id}: ${x.lines} payments, ${kes(x.totalKes)}, control hash ${x.hash}.`);
    return row;
  };
  const markDmeUploaded = (id: string, bankRef: string) => {
    const l = dmeLogs.find((x) => x.id === id);
    if (!l || l.status !== 'GENERATED') return false;
    if (!approver) return fail('Authoriser needed', 'A manager authorises the upload to the bank portal.');
    if (l.by === actor) return fail('Segregation of duties', 'The person who generated the file cannot authorise its upload.');
    if (!bankRef.trim()) return fail('Bank reference', 'Enter the reference the bank portal gave the batch.');
    setDme((xs) => xs.map((x) => (x.id === id ? { ...x, status: 'UPLOADED', bankRef: bankRef.trim(), uploadedBy: actor } : x)));
    notify({ module: 'Payroll', to: 'Bank portal (simulated)', subject: `Salary batch ${l.period} uploaded — ${kes(l.totalKes)}, ref ${bankRef.trim()}`, ref: id, channels: ['IN_APP'] });
    return done('Upload recorded', `${id} marked uploaded to the bank (simulated), ref ${bankRef.trim()}.`);
  };

  /* ---------------------------------------------------------------- flexi time */

  const [flexiEntries, setFlexi] = useState<FlexiEntry[]>(INITIAL_FLEXI);
  const bankFlexi = (staffId: string, date: string, hours: number, note: string) => {
    const e = emp(staffId);
    if (!e) return false;
    if (!date || date > today) return fail('Check the date', 'Bank hours already worked.');
    if (!(hours > 0 && hours <= 12)) return fail('Check the hours', 'Bank between 0.5 and 12 hours for a day.');
    if (!note.trim()) return fail('Reason needed', 'Say what the extra time was for.');
    const pending = flexiEntries.filter((x) => x.staffId === staffId && x.kind === 'CREDIT' && x.status === 'PENDING').reduce((n, x) => n + x.hours, 0);
    if (flexiBalance(flexiEntries, staffId) + pending + hours > FLEXI_MAX_BANK_HOURS) return fail('Bank full', `The flexi bank holds at most ${FLEXI_MAX_BANK_HOURS} hours — take flexi days first.`);
    setFlexi((xs) => [{ id: nextId(xs.map((x) => x.id), 'FX-'), staffId, date, hours, kind: 'CREDIT', note: note.trim(), status: 'PENDING', by: actor }, ...xs]);
    return done('Hours banked', `${hours} h for ${e.fullName} — the supervisor approves.`);
  };
  const redeemFlexi = (staffId: string, date: string, note: string) => {
    const e = emp(staffId);
    if (!e) return false;
    if (!date || date < today) return fail('Check the date', 'Flexi days are taken today or later.');
    const bal = flexiBalance(flexiEntries, staffId) - flexiEntries.filter((x) => x.staffId === staffId && x.kind === 'DEBIT' && x.status === 'PENDING').reduce((n, x) => n + x.hours, 0);
    if (bal < FLEXI_DAY_HOURS) return fail('Not enough banked', `${e.fullName} has ${bal} h banked; a flexi day needs ${FLEXI_DAY_HOURS} h.`);
    setFlexi((xs) => [{ id: nextId(xs.map((x) => x.id), 'FX-'), staffId, date, hours: FLEXI_DAY_HOURS, kind: 'DEBIT', note: note.trim() || 'Flexi day', status: 'PENDING', by: actor }, ...xs]);
    return done('Flexi day requested', `${fmt(date)} for ${e.fullName} — waits for the supervisor.`);
  };
  const decideFlexi = (id: string, approve: boolean) => {
    const x = flexiEntries.find((f) => f.id === id);
    if (!x || x.status !== 'PENDING') return false;
    const e = emp(x.staffId);
    if (actorStaffId === x.staffId || actor === e?.fullName) return fail('Segregation of duties', 'Your own flexi time is approved by your supervisor.');
    const sup = e && supervisorFor(e, d.hrEmployees);
    if (!approver && sup?.staffId !== actorStaffId) return fail('Supervisor approves', `${sup?.fullName ?? 'The supervisor'} or a manager approves flexi time.`);
    if (!blockSuspended('approve')) return false;
    setFlexi((xs) => xs.map((f) => (f.id === id ? { ...f, status: approve ? 'APPROVED' : 'REJECTED', decidedBy: actor } : f)));
    return done(approve ? 'Flexi approved' : 'Flexi rejected', `${e?.fullName ?? x.staffId}: ${x.kind === 'CREDIT' ? `${x.hours} h banked` : `flexi day ${fmt(x.date)}`}.`, approve ? 'success' : 'info');
  };

  /* ---------------------------------------------------------------- HR alert notices */

  const [sentHrAlerts, setSent] = useState<string[]>([]);
  const sendHrAlertNotices = (alerts: HrAlert[]) => {
    const fresh = alerts.filter((a) => !sentHrAlerts.includes(a.key));
    for (const a of fresh) {
      const e = emp(a.staffId);
      const sup = e && supervisorFor(e, d.hrEmployees);
      const subject =
        a.kind === 'RETIREMENT'
          ? `Retirement notice (${a.bucket}): ${a.name} retires on ${fmt(a.date)}`
          : a.kind === 'CONTRACT'
          ? `Contract expiry (${a.bucket}): ${a.name}’s contract ends ${fmt(a.date)}`
          : a.kind === 'PROBATION'
          ? `Probation review due ${fmt(a.date)} — ${a.name}`
          : `Work anniversary ${fmt(a.date)}: ${a.name} — ${a.detail}`;
      const level = a.severity === 'critical' ? 'warning' : 'info';
      notify({ module: 'HR', to: a.name, address: e?.personalEmail ?? e?.email, subject, ref: a.staffId, level });
      notify({ module: 'HR', to: 'HR office', subject, ref: a.staffId, level, channels: ['IN_APP'] });
      if (sup && a.kind !== 'ANNIVERSARY') notify({ module: 'HR', to: sup.fullName, address: sup.email, subject, ref: a.staffId, level });
    }
    setSent((xs) => [...xs, ...fresh.map((a) => a.key)]);
    if (fresh.length) done('Notices sent', `${fresh.length} notice${fresh.length === 1 ? '' : 's'} to employees, supervisors and HR (simulated email and in-app).`);
    else d.addToast({ type: 'info', title: 'Nothing new', message: 'Every due notice has already been sent.' });
    return fresh.length;
  };

  return {
    professionalBodies,
    addProfessionalBody,
    addQualification,
    verifyQualification,
    removeQualification,
    addProfessionalCert,
    renewProfessionalCert,
    placements,
    addPlacement,
    logPlacementWeek,
    signPlacementWeek,
    evaluatePlacement,
    completePlacement,
    terminatePlacement,
    welfareSchemes,
    saveWelfareScheme,
    welfareClaims,
    submitWelfareClaim,
    decideWelfareClaim,
    payWelfareClaim,
    medicalCovers,
    enrolMedical,
    addDependant,
    medicalClaims,
    submitMedicalClaim,
    decideMedicalClaim,
    travelRequests,
    submitTravel,
    decideTravel,
    surrenderTravel,
    csrActivities,
    saveCsr,
    decideCsr,
    completeCsr,
    hrEvents,
    saveEvent,
    submitEvent,
    decideEvent,
    toggleEventTask,
    rsvpEvent,
    closeEvent,
    outsourcedContracts,
    saveOutsourced,
    recordHeadcount,
    renewOutsourced,
    terminateOutsourced,
    libraryBooks,
    libraryLoans,
    addBook,
    lendBook,
    returnBook,
    renewLoan,
    idps,
    saveIdp,
    agreeIdp,
    addIdpAction,
    completeIdpAction,
    successionPlans,
    saveSuccessionPlan,
    ppeRequests,
    ppeStock,
    requestPpe,
    decidePpe,
    issuePpeRequest,
    receivePpeStock,
    auditFindings,
    addFinding,
    closeFinding,
    envMeasurements,
    addMeasurement,
    salaryStructures,
    saveSalaryStructure,
    glMaps,
    saveGlMap,
    dmeLogs,
    recordDme,
    markDmeUploaded,
    flexiEntries,
    bankFlexi,
    redeemFlexi,
    decideFlexi,
    sentHrAlerts,
    sendHrAlertNotices
  };
};
